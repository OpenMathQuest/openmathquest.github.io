# Effect-sensitive audit for the loopback launcher's closed identity contract.
[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$AuditDirectory = [IO.Path]::GetFullPath($PSScriptRoot)
$Workspace = [IO.Path]::GetFullPath((Resolve-Path -LiteralPath (Split-Path -Parent $AuditDirectory)).ProviderPath)
$FixtureRoot = Join-Path $AuditDirectory ('.tmp-launcher-identity-' + [Guid]::NewGuid().ToString('N'))
$PrimaryRoot = Join-Path $FixtureRoot 'primary'
$ForeignRoot = Join-Path $FixtureRoot 'foreign'
$ServerProcess = $null
$AssertionCount = 0

$RuntimeEntries = @(
    @('/', 'index.html'),
    @('/index.html', 'index.html'),
    @('/manifest.webmanifest', 'manifest.webmanifest'),
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
)

function Assert-True {
    param(
        [bool]$Condition,
        [string]$Message
    )

    if (-not $Condition) {
        throw "FAIL: $Message"
    }
    $script:AssertionCount += 1
}

function Get-TestSha256Hex {
    param([byte[]]$Bytes)

    $algorithm = [Security.Cryptography.SHA256]::Create()
    try {
        return ([BitConverter]::ToString($algorithm.ComputeHash($Bytes))).Replace('-', '').ToLowerInvariant()
    } finally {
        $algorithm.Dispose()
    }
}

function Get-TestFileSha256Hex {
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

function Get-TestHealthBody {
    param(
        [string]$RootPath,
        [int]$Port
    )

    $resolvedRoot = [IO.Path]::GetFullPath((Resolve-Path -LiteralPath $RootPath).ProviderPath)
    $normalizedRoot = $resolvedRoot.TrimEnd([char[]]@('\', '/')).Replace('\', '/').ToLowerInvariant()
    $rootId = Get-TestSha256Hex -Bytes ([Text.Encoding]::UTF8.GetBytes($normalizedRoot))

    $map = [Collections.Generic.Dictionary[string, string]]::new([StringComparer]::Ordinal)
    foreach ($entry in $RuntimeEntries) {
        $map.Add($entry[0], $entry[1])
    }
    $routes = [string[]]@($map.Keys)
    [Array]::Sort($routes, [StringComparer]::Ordinal)
    $records = [Collections.Generic.List[string]]::new()
    foreach ($route in $routes) {
        $relativePath = $map[$route]
        $absolutePath = [IO.Path]::GetFullPath([IO.Path]::Combine($resolvedRoot, $relativePath))
        $length = ([IO.FileInfo]::new($absolutePath)).Length.ToString(
            [Globalization.CultureInfo]::InvariantCulture
        )
        $records.Add("$route`t$relativePath`t$length`t$(Get-TestFileSha256Hex -FilePath $absolutePath)")
    }
    $payloadDigest = Get-TestSha256Hex -Bytes (
        [Text.Encoding]::UTF8.GetBytes((($records -join "`n") + "`n"))
    )
    return "{`"schemaVersion`":1,`"identity`":`"math-quest-local-server:v2`",`"release`":`"1.0.0-beta.2`",`"port`":$Port,`"rootId`":`"$rootId`",`"servedPayloadSha256`":`"$payloadDigest`"}"
}

function Copy-LauncherFixture {
    param(
        [string]$Destination,
        [int]$Port
    )

    [IO.Directory]::CreateDirectory($Destination) | Out-Null
    foreach ($relativePath in @('Serve-MathQuest.ps1') + @($RuntimeEntries | ForEach-Object { $_[1] } | Select-Object -Unique)) {
        $source = Join-Path $Workspace $relativePath
        $target = Join-Path $Destination $relativePath
        [IO.Directory]::CreateDirectory((Split-Path -Parent $target)) | Out-Null
        Copy-Item -LiteralPath $source -Destination $target -Force
    }
    $serverPath = Join-Path $Destination 'Serve-MathQuest.ps1'
    $serverText = [IO.File]::ReadAllText($serverPath)
    $serverText = $serverText.Replace('$Port = 8771', "`$Port = $Port")
    [IO.File]::WriteAllText($serverPath, $serverText, [Text.UTF8Encoding]::new($false))
}

function Get-FreeLoopbackPort {
    $probe = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, 0)
    try {
        $probe.Start()
        return ([Net.IPEndPoint]$probe.LocalEndpoint).Port
    } finally {
        $probe.Stop()
    }
}

function Get-LoopbackResponse {
    param(
        [int]$Port,
        [string]$Target
    )

    $client = [Net.Sockets.TcpClient]::new()
    try {
        $client.Connect([Net.IPAddress]::Loopback, $Port)
        $client.ReceiveTimeout = 1000
        $client.SendTimeout = 1000
        $stream = $client.GetStream()
        $request = [Text.Encoding]::ASCII.GetBytes(
            "GET $Target HTTP/1.1`r`nHost: 127.0.0.1:$Port`r`nConnection: close`r`n`r`n"
        )
        $stream.Write($request, 0, $request.Length)
        $stream.Flush()
        $buffer = New-Object byte[] 4096
        $received = [IO.MemoryStream]::new()
        try {
            while ($received.Length -lt 32768) {
                $read = $stream.Read($buffer, 0, $buffer.Length)
                if ($read -le 0) { break }
                $received.Write($buffer, 0, $read)
            }
            return [Text.Encoding]::UTF8.GetString($received.ToArray())
        } finally {
            $received.Dispose()
        }
    } finally {
        $client.Dispose()
    }
}

function Get-ResponseBodyText {
    param([string]$Response)

    $separatorIndex = $Response.IndexOf("`r`n`r`n", [StringComparison]::Ordinal)
    if ($separatorIndex -le 0) {
        throw 'The fixture response did not contain a complete HTTP header.'
    }
    return $Response.Substring($separatorIndex + 4)
}

function Invoke-LauncherProbe {
    param([string]$RootPath)

    $process = Start-Process -FilePath $PowerShellExe -WindowStyle Hidden -PassThru -ArgumentList @(
        '-NoLogo',
        '-NoProfile',
        '-ExecutionPolicy',
        'Bypass',
        '-File',
        (Join-Path $RootPath 'Serve-MathQuest.ps1'),
        '-NoBrowser'
    )
    if (-not $process.WaitForExit(10000)) {
        Stop-Process -Id $process.Id -Force
        throw 'A launcher identity probe did not terminate.'
    }
    return $process.ExitCode
}

$PowerShellExe = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'

try {
    Assert-True (Test-Path -LiteralPath $PowerShellExe -PathType Leaf) 'Windows PowerShell is available.'
    $Port = Get-FreeLoopbackPort
    Copy-LauncherFixture -Destination $PrimaryRoot -Port $Port
    Copy-LauncherFixture -Destination $ForeignRoot -Port $Port

    $ServerProcess = Start-Process -FilePath $PowerShellExe -WindowStyle Hidden -PassThru -ArgumentList @(
        '-NoLogo',
        '-NoProfile',
        '-ExecutionPolicy',
        'Bypass',
        '-File',
        (Join-Path $PrimaryRoot 'Serve-MathQuest.ps1'),
        '-NoBrowser'
    )

    $Response = $null
    for ($attempt = 0; $attempt -lt 100; $attempt += 1) {
        if ($ServerProcess.HasExited) {
            throw "The fixture server exited with code $($ServerProcess.ExitCode)."
        }
        try {
            $Response = Get-LoopbackResponse -Port $Port -Target '/__math_quest_health__'
            break
        } catch {
            Start-Sleep -Milliseconds 50
        }
    }
    Assert-True ($null -ne $Response) 'The fixture server became reachable.'

    $separatorIndex = $Response.IndexOf("`r`n`r`n", [StringComparison]::Ordinal)
    Assert-True ($separatorIndex -gt 0) 'The health response contains a complete HTTP header.'
    $headers = $Response.Substring(0, $separatorIndex)
    $body = $Response.Substring($separatorIndex + 4)
    $expectedBody = Get-TestHealthBody -RootPath $PrimaryRoot -Port $Port
    Assert-True ($body -ceq $expectedBody) 'The health body exactly binds the fixture root and runtime bytes.'
    Assert-True (
        $headers -cmatch "(?m)^X-Math-Quest-Server: math-quest-local-server:v2`r?$"
    ) 'The exact server identity header is present.'

    $health = $body | ConvertFrom-Json
    $healthKeys = @($health.PSObject.Properties.Name)
    Assert-True (
        (($healthKeys -join ',') -ceq 'schemaVersion,identity,release,port,rootId,servedPayloadSha256')
    ) 'The health document has the exact closed six-field schema.'
    Assert-True (
        $health.rootId -cmatch '^[a-f0-9]{64}$' -and
        $health.servedPayloadSha256 -cmatch '^[a-f0-9]{64}$'
    ) 'Both derived identities are lowercase SHA-256 values.'

    $manifestPath = Join-Path $PrimaryRoot 'manifest.webmanifest'
    $manifestResponseBefore = Get-LoopbackResponse -Port $Port -Target '/manifest.webmanifest'
    Assert-True (
        $manifestResponseBefore.StartsWith('HTTP/1.1 200 OK', [StringComparison]::Ordinal)
    ) 'The running server returns the snapshotted manifest.'
    $manifestBodyBefore = Get-ResponseBodyText -Response $manifestResponseBefore
    Assert-True (
        $manifestBodyBefore -ceq [IO.File]::ReadAllText($manifestPath)
    ) 'The initial manifest response exactly equals the startup file bytes.'

    Assert-True (
        (Invoke-LauncherProbe -RootPath $PrimaryRoot) -eq 0
    ) 'An exact same-root, same-payload launcher safely reuses the running server.'
    Assert-True (
        (Invoke-LauncherProbe -RootPath $ForeignRoot) -eq 2
    ) 'A launcher from a different root rejects the running server.'

    [IO.File]::AppendAllText($manifestPath, ' ')
    $manifestResponseAfter = Get-LoopbackResponse -Port $Port -Target '/manifest.webmanifest'
    $manifestBodyAfter = Get-ResponseBodyText -Response $manifestResponseAfter
    Assert-True (
        $manifestBodyAfter -ceq $manifestBodyBefore
    ) 'A running server keeps serving its immutable startup bytes after the source file changes.'
    Assert-True (
        $manifestBodyAfter -cne [IO.File]::ReadAllText($manifestPath)
    ) 'The mutation regression proves the served bytes no longer come from the changed source file.'
    $healthAfter = Get-ResponseBodyText -Response (
        Get-LoopbackResponse -Port $Port -Target '/__math_quest_health__'
    )
    Assert-True (
        $healthAfter -ceq $body
    ) 'The immutable health identity continues to describe the immutable served snapshot.'
    Assert-True (
        (Invoke-LauncherProbe -RootPath $PrimaryRoot) -eq 2
    ) 'A launcher whose served payload changed rejects the stale running identity.'

    Write-Host "Launcher identity audit passed: $AssertionCount effect-sensitive assertions."
} finally {
    if ($ServerProcess -and -not $ServerProcess.HasExited) {
        Stop-Process -Id $ServerProcess.Id -Force
        $ServerProcess.WaitForExit(3000) | Out-Null
    }
    if (Test-Path -LiteralPath $FixtureRoot) {
        $resolvedFixture = [IO.Path]::GetFullPath($FixtureRoot)
        $resolvedAudit = [IO.Path]::GetFullPath($AuditDirectory).TrimEnd('\') + '\'
        if ($resolvedFixture.StartsWith($resolvedAudit, [StringComparison]::OrdinalIgnoreCase) -and
            [IO.Path]::GetFileName($resolvedFixture).StartsWith('.tmp-launcher-identity-', [StringComparison]::Ordinal)) {
            Remove-Item -LiteralPath $resolvedFixture -Recurse -Force
        }
    }
}
