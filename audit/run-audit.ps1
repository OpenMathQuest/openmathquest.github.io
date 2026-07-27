[CmdletBinding()]
param(
    [string]$NodePath,
    [string]$BrowserPath,
    [switch]$NoBrowser,
    [switch]$TechnicalOnly
)

$ErrorActionPreference = 'Stop'
$auditDirectory = Split-Path -Parent $MyInvocation.MyCommand.Path
$workspace = Split-Path -Parent $auditDirectory
$runtimeTemp = Join-Path $auditDirectory ('.tmp-audit-runtime-' + [Guid]::NewGuid().ToString('N'))

function Get-NodeCandidates {
    param([string]$ExplicitPath)
    $candidates = [System.Collections.Generic.List[string]]::new()
    if ($ExplicitPath) { $candidates.Add($ExplicitPath) }
    if ($env:MQ_NODE_PATH) { $candidates.Add($env:MQ_NODE_PATH) }
    $command = Get-Command node.exe -ErrorAction SilentlyContinue
    if ($command) { $candidates.Add($command.Source) }
    $candidates.Add((Join-Path $env:ProgramFiles 'nodejs\node.exe'))
    $candidates.Add((Join-Path $env:LOCALAPPDATA 'Programs\nodejs\node.exe'))

    $hostProcess = Get-Process -Name 'codex-code-mode-host' -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($hostProcess -and $hostProcess.Path) {
        $appRoot = Split-Path -Parent (Split-Path -Parent $hostProcess.Path)
        $candidates.Add((Join-Path $appRoot 'resources\cua_node\bin\node.exe'))
    }
    $codexPackage = Get-AppxPackage -Name 'OpenAI.Codex' -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($codexPackage -and $codexPackage.InstallLocation) {
        $candidates.Add((Join-Path $codexPackage.InstallLocation 'app\resources\cua_node\bin\node.exe'))
    }
    return $candidates | Where-Object { $_ -and (Test-Path -LiteralPath $_ -PathType Leaf) } | Select-Object -Unique
}

function Stage-Node24 {
    param([string[]]$Candidates, [string]$DestinationDirectory)
    New-Item -ItemType Directory -Path $DestinationDirectory | Out-Null
    $ordinal = 0
    foreach ($candidate in $Candidates) {
        $ordinal += 1
        if ([IO.Path]::GetFileName($candidate) -ne 'node.exe') { continue }
        $copy = Join-Path $DestinationDirectory ("node-$ordinal.exe")
        try {
            Copy-Item -LiteralPath $candidate -Destination $copy -Force
            $sourceHash = (Get-FileHash -LiteralPath $candidate -Algorithm SHA256).Hash
            $copyHash = (Get-FileHash -LiteralPath $copy -Algorithm SHA256).Hash
            if ($sourceHash -ne $copyHash) { continue }
            $version = (& $copy --version 2>$null)
            if ($LASTEXITCODE -eq 0 -and $version -eq 'v24.14.0') {
                return [PSCustomObject]@{ Path = $copy; Version = $version; Source = $candidate; Sha256 = $copyHash }
            }
        } catch {
            continue
        }
    }
    throw 'The reviewed Node.js v24.14.0 runtime was not found. Set MQ_NODE_PATH or pass -NodePath with that exact version.'
}

function Find-Browser {
    param([string]$ExplicitPath)
    $candidates = [System.Collections.Generic.List[string]]::new()
    if ($ExplicitPath) { $candidates.Add($ExplicitPath) }
    if ($env:MQ_BROWSER_PATH) { $candidates.Add($env:MQ_BROWSER_PATH) }
    foreach ($name in @('msedge.exe', 'chrome.exe')) {
        $command = Get-Command $name -ErrorAction SilentlyContinue
        if ($command) { $candidates.Add($command.Source) }
    }
    if (${env:ProgramFiles(x86)}) { $candidates.Add((Join-Path ${env:ProgramFiles(x86)} 'Microsoft\Edge\Application\msedge.exe')) }
    $candidates.Add((Join-Path $env:ProgramFiles 'Microsoft\Edge\Application\msedge.exe'))
    if (${env:ProgramFiles(x86)}) { $candidates.Add((Join-Path ${env:ProgramFiles(x86)} 'Google\Chrome\Application\chrome.exe')) }
    $candidates.Add((Join-Path $env:ProgramFiles 'Google\Chrome\Application\chrome.exe'))
    return $candidates | Where-Object {
        $_ -and (Test-Path -LiteralPath $_ -PathType Leaf) -and ([IO.Path]::GetFileName($_) -in @('msedge.exe', 'chrome.exe'))
    } | Select-Object -First 1
}

function Test-PublicFilesystemMetadata {
    $git = Get-Command git.exe -ErrorAction Stop
    $trackedPaths = @(& $git.Source -C $workspace ls-files --cached)
    if ($LASTEXITCODE -ne 0 -or $trackedPaths.Count -eq 0) {
        throw 'The exact tracked public candidate could not be enumerated.'
    }

    $findings = [System.Collections.Generic.List[string]]::new()
    foreach ($relativePath in $trackedPaths) {
        $absolutePath = Join-Path $workspace $relativePath
        if (-not (Test-Path -LiteralPath $absolutePath -PathType Leaf)) { continue }
        $item = Get-Item -LiteralPath $absolutePath -Force
        if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
            $findings.Add("$relativePath is a reparse point.")
        }
        if (($item.Attributes -band [IO.FileAttributes]::Hidden) -ne 0) {
            $findings.Add("$relativePath has the Windows hidden attribute.")
        }
        foreach ($stream in @(Get-Item -LiteralPath $absolutePath -Stream * -ErrorAction SilentlyContinue)) {
            if ($stream.Stream -ne ':$DATA') {
                $findings.Add("$relativePath contains alternate data stream $($stream.Stream).")
            }
        }
    }
    if ($findings.Count -gt 0) {
        throw "Public-candidate filesystem metadata failed:`n- $($findings -join "`n- ")"
    }
    Write-Host "Public-candidate filesystem metadata passed for $($trackedPaths.Count) tracked files."
}

function Test-LauncherPort {
    $client = New-Object System.Net.Sockets.TcpClient
    try {
        $pending = $client.BeginConnect([System.Net.IPAddress]::Loopback, 8771, $null, $null)
        try {
            if (-not $pending.AsyncWaitHandle.WaitOne(500)) { return $false }
            $client.EndConnect($pending)
            return $client.Connected
        } finally { $pending.AsyncWaitHandle.Close() }
    } catch { return $false }
    finally { $client.Close() }
}

function Test-LauncherIdentity {
    $expectedIdentity = 'math-quest-local-server:v1'
    $expectedRelease = '1.0.0-beta.1'
    $client = New-Object System.Net.Sockets.TcpClient
    try {
        $client.Connect([System.Net.IPAddress]::Loopback, 8771)
        $client.ReceiveTimeout = 1000; $client.SendTimeout = 1000
        $stream = $client.GetStream()
        $request = [Text.Encoding]::ASCII.GetBytes("GET /__math_quest_health__ HTTP/1.1`r`nHost: 127.0.0.1:8771`r`nConnection: close`r`n`r`n")
        $stream.Write($request, 0, $request.Length); $stream.Flush()
        $buffer = New-Object byte[] 4096
        $received = [IO.MemoryStream]::new()
        try {
            while ($received.Length -lt 32768) {
                try { $read = $stream.Read($buffer, 0, $buffer.Length) } catch { break }
                if ($read -le 0) { break }
                $received.Write($buffer, 0, $read)
                $response = [Text.Encoding]::UTF8.GetString($received.ToArray())
                $identityHeader = "(?im)^X-Math-Quest-Server:\s*$([Text.RegularExpressions.Regex]::Escape($expectedIdentity))\s*$"
                $identityBody = "`"identity`"\s*:\s*`"$([Text.RegularExpressions.Regex]::Escape($expectedIdentity))`""
                $releaseBody = "`"release`"\s*:\s*`"$([Text.RegularExpressions.Regex]::Escape($expectedRelease))`""
                if ($response -match $identityHeader -and
                    $response -match $identityBody -and
                    $response -match $releaseBody -and
                    $response -match '"port"\s*:\s*8771') { return $true }
            }
            return $false
        } finally { $received.Dispose() }
    } catch { return $false }
    finally { $client.Close() }
}

function Invoke-PublicCandidateGuard {
    param([string]$ValidatedNode)
    Push-Location $workspace
    try {
        $guardOutput = @(& $ValidatedNode (Join-Path $auditDirectory 'public-candidate-guard.mjs') 2>&1)
        $guardExitCode = $LASTEXITCODE
    } finally {
        Pop-Location
    }
    foreach ($line in $guardOutput) { Write-Host ([string]$line) }
    if ($guardExitCode -ne 0) {
        throw 'The staged public candidate failed the privacy, provenance, or open-licence guard.'
    }
    $digestLines = @($guardOutput | ForEach-Object { [string]$_ } | Where-Object { $_ -match '^PUBLIC_PAYLOAD_SHA256=[a-f0-9]{64}$' })
    $treeLines = @($guardOutput | ForEach-Object { [string]$_ } | Where-Object { $_ -match '^PUBLIC_PAYLOAD_TREE_OID=(?:[a-f0-9]{40}|[a-f0-9]{64})$' })
    if ($digestLines.Count -ne 1 -or $treeLines.Count -ne 1) {
        throw 'The public-candidate guard did not emit exactly one public-payload SHA-256 and one payload-tree OID.'
    }
    return [PSCustomObject]@{
        PayloadSha256 = $digestLines[0].Substring('PUBLIC_PAYLOAD_SHA256='.Length)
        PayloadTreeOid = $treeLines[0].Substring('PUBLIC_PAYLOAD_TREE_OID='.Length)
    }
}

try {
    Test-PublicFilesystemMetadata
    $node = Stage-Node24 -Candidates @(Get-NodeCandidates -ExplicitPath $NodePath) -DestinationDirectory $runtimeTemp
    Write-Host "Using Node $($node.Version) from a validated temporary copy of $($node.Source)"
    $candidate = Invoke-PublicCandidateGuard -ValidatedNode $node.Path
    $browser = if ($NoBrowser) { $null } else { Find-Browser -ExplicitPath $BrowserPath }
    if ($browser) { Write-Host "Using browser $browser" } else { Write-Warning 'No Edge/Chrome browser selected; browser checks will be reported as skipped and the audit cannot pass.' }
    $launcherProcess = $null
    if (Test-LauncherPort) {
        $env:MQ_LAUNCHER_PREFLIGHT = if (Test-LauncherIdentity) { 'PASS_EXISTING_EXPECTED_SERVER' } else { 'FAIL_UNRELATED_LISTENER_ON_8771' }
    } else {
        $launcherProcess = Start-Process powershell.exe -WindowStyle Hidden -PassThru -ArgumentList @(
            '-NoLogo', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', (Join-Path $workspace 'Serve-MathQuest.ps1'), '-NoBrowser'
        )
        $env:MQ_LAUNCHER_PREFLIGHT = 'FAIL_LAUNCHER_DID_NOT_BECOME_HEALTHY'
        for ($attempt = 0; $attempt -lt 150; $attempt += 1) {
            if (Test-LauncherIdentity) { $env:MQ_LAUNCHER_PREFLIGHT = 'PASS_STARTED_AND_IDENTIFIED'; break }
            if ($launcherProcess.HasExited) { break }
            Start-Sleep -Milliseconds 100
        }
    }
    try {
        $arguments = @((Join-Path $auditDirectory 'run-audit.mjs'))
        if ($browser) { $arguments += "--browser=$browser" }
        if ($TechnicalOnly) { $arguments += '--technical-only' }
        Push-Location $workspace
        try { & $node.Path @arguments; $exitCode = $LASTEXITCODE }
        finally { Pop-Location }
    } finally {
        if ($launcherProcess -and -not $launcherProcess.HasExited) {
            Stop-Process -Id $launcherProcess.Id -Force
            $launcherProcess.WaitForExit(3000) | Out-Null
        }
    }
    $finalCandidate = Invoke-PublicCandidateGuard -ValidatedNode $node.Path
    if ($finalCandidate.PayloadSha256 -ne $candidate.PayloadSha256 -or
        $finalCandidate.PayloadTreeOid -ne $candidate.PayloadTreeOid) {
        throw 'The staged public payload or payload tree changed during the audit.'
    }
    exit $exitCode
} finally {
    if (Test-Path -LiteralPath $runtimeTemp) {
        $resolvedTemp = [IO.Path]::GetFullPath($runtimeTemp)
        $resolvedAuditDirectory = [IO.Path]::GetFullPath($auditDirectory).TrimEnd('\') + '\'
        if ($resolvedTemp.StartsWith($resolvedAuditDirectory, [StringComparison]::OrdinalIgnoreCase) -and
            [IO.Path]::GetFileName($resolvedTemp).StartsWith('.tmp-audit-runtime-', [StringComparison]::Ordinal)) {
            Remove-Item -LiteralPath $resolvedTemp -Recurse -Force
        }
    }
}
