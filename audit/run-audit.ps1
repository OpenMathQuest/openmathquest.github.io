[CmdletBinding()]
param(
    [string]$NodePath,
    [string]$BrowserPath,
    [switch]$NoBrowser,
    [switch]$TechnicalOnly,
    [switch]$DevelopmentOnly,
    [string[]]$ChangedPath = @()
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

function Set-BrowserAuditIdentity {
    param([string]$SelectedBrowser)

    if (-not $SelectedBrowser) {
        foreach ($name in @(
            'MQ_BROWSER_PRODUCT_NAME',
            'MQ_BROWSER_PRODUCT_VERSION',
            'MQ_BROWSER_EXECUTABLE_SHA256',
            'MQ_AUDIT_RUNNER_KIND',
            'MQ_AUDIT_RUNNER_IMAGE_OS',
            'MQ_AUDIT_RUNNER_IMAGE_VERSION'
        )) {
            Remove-Item -LiteralPath "Env:$name" -ErrorAction SilentlyContinue
        }
        return
    }

    $item = Get-Item -LiteralPath $SelectedBrowser -ErrorAction Stop
    $expectedProduct = switch ($item.Name.ToLowerInvariant()) {
        'msedge.exe' { 'Microsoft Edge' }
        'chrome.exe' { 'Google Chrome' }
        default { throw "Unsupported browser executable '$($item.Name)'." }
    }
    $productName = [string]$item.VersionInfo.ProductName
    $productVersion = [string]$item.VersionInfo.ProductVersion
    if ($productName) { $productName = $productName.Trim() }
    if ($productVersion) { $productVersion = $productVersion.Trim() }
    if ($productName -cne $expectedProduct) {
        throw "Browser product '$productName' does not match $expectedProduct."
    }
    if ($productVersion -cnotmatch '^\d+\.\d+\.\d+\.\d+$') {
        throw "Browser product version '$productVersion' is not a full four-part version."
    }
    $executableSha256 = (Get-FileHash -LiteralPath $item.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($executableSha256 -cnotmatch '^[a-f0-9]{64}$') {
        throw 'The browser executable SHA-256 could not be recorded.'
    }

    $env:MQ_BROWSER_PRODUCT_NAME = $productName
    $env:MQ_BROWSER_PRODUCT_VERSION = $productVersion
    $env:MQ_BROWSER_EXECUTABLE_SHA256 = $executableSha256

    if ($env:GITHUB_ACTIONS -ceq 'true') {
        if ($env:RUNNER_ENVIRONMENT -cne 'github-hosted') {
            throw 'The GitHub audit must use a GitHub-hosted runner.'
        }
        if ([string]::IsNullOrWhiteSpace($env:ImageOS) -or
            [string]::IsNullOrWhiteSpace($env:ImageVersion)) {
            throw 'The GitHub-hosted runner did not expose ImageOS and ImageVersion.'
        }
        $env:MQ_AUDIT_RUNNER_KIND = 'GITHUB_HOSTED'
        $env:MQ_AUDIT_RUNNER_IMAGE_OS = $env:ImageOS.Trim()
        $env:MQ_AUDIT_RUNNER_IMAGE_VERSION = $env:ImageVersion.Trim()
    } else {
        $env:MQ_AUDIT_RUNNER_KIND = 'LOCAL'
        $env:MQ_AUDIT_RUNNER_IMAGE_OS = ''
        $env:MQ_AUDIT_RUNNER_IMAGE_VERSION = ''
    }

    Write-Host ("Browser evidence: product={0}; fullVersion={1}; executableSha256={2}; runnerKind={3}; ImageOS={4}; ImageVersion={5}" -f
        $env:MQ_BROWSER_PRODUCT_NAME,
        $env:MQ_BROWSER_PRODUCT_VERSION,
        $env:MQ_BROWSER_EXECUTABLE_SHA256,
        $env:MQ_AUDIT_RUNNER_KIND,
        $(if ($env:MQ_AUDIT_RUNNER_IMAGE_OS) { $env:MQ_AUDIT_RUNNER_IMAGE_OS } else { 'LOCAL' }),
        $(if ($env:MQ_AUDIT_RUNNER_IMAGE_VERSION) { $env:MQ_AUDIT_RUNNER_IMAGE_VERSION } else { 'LOCAL' }))
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

function Get-LauncherAuditSha256Hex {
    param([byte[]]$Bytes)

    $algorithm = [Security.Cryptography.SHA256]::Create()
    try {
        return ([BitConverter]::ToString($algorithm.ComputeHash($Bytes))).Replace('-', '').ToLowerInvariant()
    } finally {
        $algorithm.Dispose()
    }
}

function Get-LauncherAuditFileSha256Hex {
    param([string]$FilePath)

    $stream = [IO.File]::OpenRead($FilePath)
    $algorithm = [Security.Cryptography.SHA256]::Create()
    try {
        return ([BitConverter]::ToString($algorithm.ComputeHash($stream))).Replace('-', '').ToLowerInvariant()
    } finally {
        $algorithm.Dispose()
        $stream.Dispose()
    }
}

function Get-LauncherAuditExpectation {
    $resolvedRoot = [IO.Path]::GetFullPath((Resolve-Path -LiteralPath $workspace -ErrorAction Stop).ProviderPath)
    $normalizedRoot = $resolvedRoot.TrimEnd([char[]]@('\', '/')).Replace('\', '/').ToLowerInvariant()
    $rootId = Get-LauncherAuditSha256Hex -Bytes ([Text.Encoding]::UTF8.GetBytes($normalizedRoot))
    $rootPrefix = $resolvedRoot.TrimEnd([char[]]@('\', '/')) + [IO.Path]::DirectorySeparatorChar

    $runtimePathMap = [Collections.Generic.Dictionary[string, string]]::new([StringComparer]::Ordinal)
    foreach ($entry in @(
        @('/', 'index.html'),
        @('/index.html', 'index.html'),
        @('/manifest.webmanifest', 'manifest.webmanifest'),
        @('/curriculum/math-quest-tutorial-manifest-v1.json', 'curriculum/math-quest-tutorial-manifest-v1.json'),
        @('/release-shell-v1.json', 'release-shell-v1.json'),
        @('/sw.js', 'sw.js'),
        @('/assets/fonts/Inter-Variable.ttf', 'assets/fonts/Inter-Variable.ttf'),
        @('/assets/icons/apple-touch-icon.png', 'assets/icons/apple-touch-icon.png'),
        @('/assets/icons/icon-192.png', 'assets/icons/icon-192.png'),
        @('/assets/icons/icon-512.png', 'assets/icons/icon-512.png'),
        @('/assets/sounds/close.wav', 'assets/sounds/close.wav'),
        @('/assets/sounds/confirm.wav', 'assets/sounds/confirm.wav'),
        @('/assets/sounds/incorrect.wav', 'assets/sounds/incorrect.wav'),
        @('/assets/sounds/tap.wav', 'assets/sounds/tap.wav'),
        @('/LICENSE', 'LICENSE'),
        @('/PRIVACY.md', 'PRIVACY.md'),
        @('/THIRD_PARTY_NOTICES.md', 'THIRD_PARTY_NOTICES.md')
    )) {
        $runtimePathMap.Add($entry[0], $entry[1])
    }

    $routes = [string[]]@($runtimePathMap.Keys)
    [Array]::Sort($routes, [StringComparer]::Ordinal)
    $records = [Collections.Generic.List[string]]::new()
    foreach ($route in $routes) {
        $relativePath = $runtimePathMap[$route]
        if ($route.IndexOfAny([char[]]@("`t", "`r", "`n")) -ge 0 -or
            $relativePath.IndexOfAny([char[]]@("`t", "`r", "`n")) -ge 0) {
            throw 'The launcher audit runtime path map contains a non-canonical path.'
        }
        $absolutePath = [IO.Path]::GetFullPath([IO.Path]::Combine($resolvedRoot, $relativePath))
        if (-not $absolutePath.StartsWith($rootPrefix, [StringComparison]::OrdinalIgnoreCase) -or
            -not (Test-Path -LiteralPath $absolutePath -PathType Leaf)) {
            throw "The launcher audit could not bind runtime file '$relativePath'."
        }
        $length = ([IO.FileInfo]::new($absolutePath)).Length.ToString(
            [Globalization.CultureInfo]::InvariantCulture
        )
        $fileSha256 = Get-LauncherAuditFileSha256Hex -FilePath $absolutePath
        $records.Add("$route`t$relativePath`t$length`t$fileSha256")
    }
    $canonicalPayload = ($records -join "`n") + "`n"
    $servedPayloadSha256 = Get-LauncherAuditSha256Hex -Bytes ([Text.Encoding]::UTF8.GetBytes($canonicalPayload))
    $identity = 'math-quest-local-server:v2'
    $release = '1.0.0-beta.7'
    $port = 8771
    $body = "{`"schemaVersion`":1,`"identity`":`"$identity`",`"release`":`"$release`",`"port`":$port,`"rootId`":`"$rootId`",`"servedPayloadSha256`":`"$servedPayloadSha256`"}"

    return [PSCustomObject]@{
        Identity = $identity
        Body = $body
    }
}

function Test-LauncherIdentity {
    try {
        $expected = Get-LauncherAuditExpectation
    } catch {
        return $false
    }
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
            }
            $response = [Text.Encoding]::UTF8.GetString($received.ToArray())
            $separatorIndex = $response.IndexOf("`r`n`r`n", [StringComparison]::Ordinal)
            if ($separatorIndex -lt 0) { return $false }
            $headerText = $response.Substring(0, $separatorIndex)
            $bodyText = $response.Substring($separatorIndex + 4)
            $headerLines = $headerText -split "`r`n"
            if ($headerLines.Count -lt 2 -or $headerLines[0] -cne 'HTTP/1.1 200 OK') { return $false }
            $headers = [Collections.Generic.Dictionary[string, string]]::new([StringComparer]::OrdinalIgnoreCase)
            for ($lineIndex = 1; $lineIndex -lt $headerLines.Count; $lineIndex += 1) {
                $colon = $headerLines[$lineIndex].IndexOf(':')
                if ($colon -le 0) { return $false }
                $name = $headerLines[$lineIndex].Substring(0, $colon)
                if ($headers.ContainsKey($name)) { return $false }
                $headers.Add($name, $headerLines[$lineIndex].Substring($colon + 1).Trim())
            }
            if (-not $headers.ContainsKey('X-Math-Quest-Server') -or
                $headers['X-Math-Quest-Server'] -cne $expected.Identity -or
                -not $headers.ContainsKey('Content-Type') -or
                $headers['Content-Type'] -cne 'application/json; charset=utf-8' -or
                -not $headers.ContainsKey('Content-Length') -or
                $headers['Content-Length'] -cne ([Text.Encoding]::UTF8.GetByteCount($expected.Body)).ToString(
                    [Globalization.CultureInfo]::InvariantCulture
                )) {
                return $false
            }
            return $bodyText -ceq $expected.Body
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
    if ($DevelopmentOnly -and $TechnicalOnly) {
        throw 'DevelopmentOnly and TechnicalOnly are mutually exclusive.'
    }
    $node = Stage-Node24 -Candidates @(Get-NodeCandidates -ExplicitPath $NodePath) -DestinationDirectory $runtimeTemp
    Write-Host "Using Node $($node.Version) from a validated temporary copy of $($node.Source)"
    $developmentPlan = $null
    if ($DevelopmentOnly) {
        $plannerArguments = @((Join-Path $auditDirectory 'lib\development-suite-plan.mjs'))
        $plannerArguments += @($ChangedPath | ForEach-Object { "--path=$($_)" })
        $plannerText = (& $node.Path @plannerArguments | Out-String).Trim()
        if ($LASTEXITCODE -ne 0) { throw 'The focused development-suite planner failed.' }
        $developmentPlan = $plannerText | ConvertFrom-Json
        Write-Host ("Development suite mode: {0}; suites: {1}" -f $developmentPlan.mode, ($developmentPlan.suites -join ', '))
    }
    Test-PublicFilesystemMetadata
    if (-not $DevelopmentOnly -or $developmentPlan.suites -contains 'launcher') {
        & (Join-Path $auditDirectory 'test-launcher-identity.ps1')
    } else {
        Write-Host 'Launcher checks not selected by the changed-path development plan.'
    }
    & $node.Path --test (Join-Path $auditDirectory 'tests\certification-cadence.test.mjs')
    if ($LASTEXITCODE -ne 0) {
        throw 'The certification-cadence policy and workflow tests failed.'
    }
    & $node.Path --test (Join-Path $auditDirectory 'tests\development-suite-plan.test.mjs')
    if ($LASTEXITCODE -ne 0) {
        throw 'The changed-path development-suite planner and watcher batching tests failed.'
    }
    & $node.Path --test (Join-Path $auditDirectory 'tests\playwright-focused-contract.test.mjs')
    if ($LASTEXITCODE -ne 0) {
        throw 'The closed direct Playwright journey, privacy, and toolchain contract tests failed.'
    }
    & $node.Path --test (Join-Path $auditDirectory 'tests\playwright-deep-ux-census.test.mjs')
    if ($LASTEXITCODE -ne 0) {
        throw 'The alternating-beta Playwright Deep UX Census planner, cadence, privacy, and evidence contract tests failed.'
    }
    & $node.Path --test @(
        (Join-Path $auditDirectory 'tests\audit-orchestration.test.mjs'),
        (Join-Path $auditDirectory 'tests\audit-lane-orchestration.test.mjs')
    )
    if ($LASTEXITCODE -ne 0) {
        throw 'The deduplicated, instrumented, and sharded audit orchestration tests failed.'
    }
    & $node.Path --test (Join-Path $auditDirectory 'tests\agent-collaboration-policy.test.mjs')
    if ($LASTEXITCODE -ne 0) {
        throw 'The bounded agent-collaboration authority and anti-weakening tests failed.'
    }
    & $node.Path --test (Join-Path $auditDirectory 'tests\finished-work-policy.test.mjs')
    if ($LASTEXITCODE -ne 0) {
        throw 'The finished-work authority, machine-readable mirror, and anti-weakening tests failed.'
    }
    & $node.Path --test @(
        (Join-Path $auditDirectory 'tests\gate-integrity-policy.test.mjs'),
        (Join-Path $auditDirectory 'tests\release-evidence-bundle.test.mjs')
    )
    if ($LASTEXITCODE -ne 0) {
        throw 'The gate-integrity policy, GitHub enforcement contract, evidence bindings, and negative controls failed.'
    }
    & $node.Path --test (Join-Path $auditDirectory 'tests\publication-clearance.test.mjs')
    if ($LASTEXITCODE -ne 0) {
        throw 'The publication, external release-evidence, and browser/runner fail-closed schema tests failed.'
    }
    $holisticRegressionTests = @(
        (Join-Path $auditDirectory 'tests\adapter-syntax.test.mjs'),
        (Join-Path $auditDirectory 'tests\page-adapter-effects.test.mjs'),
        (Join-Path $auditDirectory 'tests\placement-adapter-effects.test.mjs'),
        (Join-Path $auditDirectory 'tests\qa-tour.test.mjs'),
        (Join-Path $auditDirectory 'tests\holistic-child-ux-regressions.test.mjs'),
        (Join-Path $auditDirectory 'tests\holistic-functional-regressions.test.mjs')
    )
    if (-not $DevelopmentOnly -or $developmentPlan.suites -contains 'product') {
        & $node.Path --test $holisticRegressionTests
        if ($LASTEXITCODE -ne 0) {
            throw 'The mandatory holistic child-UX and functional defect regressions failed.'
        }
        Write-Host 'Mandatory holistic defect regression suite passed.'
    } else {
        Write-Host 'Product adapter and UX checks not selected by the changed-path development plan.'
    }
    if (-not $DevelopmentOnly -or $developmentPlan.suites -contains 'canary') {
        & $node.Path --test (Join-Path $auditDirectory 'tests\trusted-https-canary.test.mjs')
        if ($LASTEXITCODE -ne 0) {
            throw 'The trusted-HTTPS canary contract and teardown regressions failed.'
        }
    } else {
        Write-Host 'Canary checks not selected by the changed-path development plan.'
    }
    if (-not $DevelopmentOnly -or $developmentPlan.suites -contains 'pwa') {
        Push-Location $workspace
        try {
            & $node.Path (Join-Path $workspace 'tools\build-pwa-release-manifest.mjs') --check
            if ($LASTEXITCODE -ne 0) {
                throw 'The PWA release-shell manifest or worker hash binding is stale.'
            }
            & $node.Path --test (Join-Path $auditDirectory 'tests\pwa-release.test.mjs')
            if ($LASTEXITCODE -ne 0) {
                throw 'The PWA release-shell, lifecycle, and caregiver-copy effect tests failed.'
            }
            Write-Host 'PWA release-shell binding and effect suite passed.'
        } finally {
            Pop-Location
        }
    } else {
        Write-Host 'PWA checks not selected by the changed-path development plan.'
    }
    if ($DevelopmentOnly -and $developmentPlan.suites -contains 'engine') {
        & $node.Path --test (Join-Path $auditDirectory 'tests\node-engine.test.mjs')
        if ($LASTEXITCODE -ne 0) {
            throw 'The focused deterministic engine and semantic development checks failed.'
        }
        Write-Host 'Focused deterministic engine and semantic development checks passed.'
    } elseif ($DevelopmentOnly) {
        Write-Host 'Engine and semantic checks not selected by the changed-path development plan.'
    }
    if (-not $DevelopmentOnly -or $developmentPlan.suites -contains 'tutorial') {
        Push-Location $workspace
        try {
            & $node.Path (Join-Path $workspace 'tools\build-tutorial-manifest.mjs') --check
            if ($LASTEXITCODE -ne 0) {
                throw 'The tutorial manifest is stale or no longer covers the curriculum.'
            }
            & $node.Path (Join-Path $workspace 'tools\sync-tutorial-manifest.mjs') --check
            if ($LASTEXITCODE -ne 0) {
                throw 'The embedded tutorial manifest is stale.'
            }
            & $node.Path --test (Join-Path $auditDirectory 'tests\tutorial-manifest.test.mjs')
            if ($LASTEXITCODE -ne 0) {
                throw 'The different-example tutorial coverage, linkage, and evidence tests failed.'
            }
            Write-Host 'Tutorial manifest, curriculum linkage, and different-example checks passed.'
        } finally {
            Pop-Location
        }
    } elseif ($DevelopmentOnly) {
        Write-Host 'Tutorial manifest and linkage checks not selected by the changed-path development plan.'
    }
    if (-not $DevelopmentOnly -or $developmentPlan.suites -contains 'driftless') {
        Push-Location $workspace
        try {
            & $node.Path (Join-Path $workspace 'tools\sync-repository-code-map.mjs') --check
            if ($LASTEXITCODE -ne 0) {
                throw 'The generated repository ownership projection is stale.'
            }
            & $node.Path (Join-Path $workspace 'tools\blast-radius-lookup.mjs') --self-test
            if ($LASTEXITCODE -ne 0) {
                throw 'The pre-edit blast-radius matcher controls failed.'
            }
            $driftlessTests = @(
                (Join-Path $auditDirectory 'tests\repository-code-map.test.mjs'),
                (Join-Path $auditDirectory 'tests\blast-radius-lookup.test.mjs'),
                (Join-Path $auditDirectory 'tests\feature-map.test.mjs')
            )
            & $node.Path --test $driftlessTests
            if ($LASTEXITCODE -ne 0) {
                throw 'The owner, code-map, blast-radius, and feature-map gates failed.'
            }
            Write-Host 'Driftless ownership, dependency, mechanic-legibility, and blast-radius gates passed.'
        } finally {
            Pop-Location
        }
    } elseif ($DevelopmentOnly) {
        Write-Host 'Driftless map and blast-radius checks not selected by the changed-path development plan.'
    }
    if ($DevelopmentOnly -and $developmentPlan.suites -contains 'playwright') {
        Push-Location $workspace
        try {
            & $node.Path (Join-Path $auditDirectory 'run-playwright-focused.mjs')
            if ($LASTEXITCODE -ne 0) {
                throw 'The direct native-input Playwright journey matrix failed.'
            }
        } finally {
            Pop-Location
        }
    } elseif ($DevelopmentOnly) {
        Write-Host 'Direct Playwright journeys not selected by the changed-path development plan.'
    }
    if ($DevelopmentOnly) {
        $candidate = Invoke-PublicCandidateGuard -ValidatedNode $node.Path
        Write-Host 'Focused development checks passed. Complete release certification was not run.'
        return
    }
    $browser = if ($NoBrowser) { $null } else { Find-Browser -ExplicitPath $BrowserPath }
    Set-BrowserAuditIdentity -SelectedBrowser $browser
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
