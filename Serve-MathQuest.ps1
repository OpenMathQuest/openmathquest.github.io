[CmdletBinding()]
param(
    [switch] $NoBrowser
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$Port = 8771
$ProductRelease = '1.0.0-beta.4'
$ServerIdentity = 'math-quest-local-server:v2'
$HealthSchemaVersion = 1
$HealthPath = '/__math_quest_health__'
$Root = [System.IO.Path]::GetFullPath((Resolve-Path -LiteralPath $PSScriptRoot -ErrorAction Stop).ProviderPath)
$RootPrefix = $Root.TrimEnd([char[]]@('\', '/')) + [System.IO.Path]::DirectorySeparatorChar
$GameUrl = "http://127.0.0.1:$Port/index.html"
$ExpectedHost = "127.0.0.1:$Port"
$IdentityHeader = 'X-Math-Quest-Server'
$RuntimePathMap = [System.Collections.Generic.Dictionary[string, string]]::new([System.StringComparer]::Ordinal)
foreach ($entry in @(
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
)) {
    $RuntimePathMap.Add($entry[0], $entry[1])
}
$RuntimeByteSnapshot = [System.Collections.Generic.Dictionary[string, byte[]]]::new(
    [System.StringComparer]::Ordinal
)

function Get-Sha256Hex {
    param([byte[]] $Bytes)

    $algorithm = [System.Security.Cryptography.SHA256]::Create()
    try {
        return ([System.BitConverter]::ToString($algorithm.ComputeHash($Bytes))).Replace('-', '').ToLowerInvariant()
    }
    finally {
        $algorithm.Dispose()
    }
}

function Get-NormalizedRootIdentityInput {
    param([string] $RootPath)

    $resolved = (Resolve-Path -LiteralPath $RootPath -ErrorAction Stop).ProviderPath
    $normalized = [System.IO.Path]::GetFullPath($resolved)
    $normalized = $normalized.TrimEnd([char[]]@('\', '/'))
    $normalized = $normalized.Replace('\', '/')
    return $normalized.ToLowerInvariant()
}

function Get-CurrentRootId {
    $normalizedRoot = Get-NormalizedRootIdentityInput -RootPath $PSScriptRoot
    return Get-Sha256Hex -Bytes ([System.Text.Encoding]::UTF8.GetBytes($normalizedRoot))
}

function Test-NoReparsePoint {
    param([string] $RelativePath)

    $cursor = $Root
    foreach ($segment in ($RelativePath -split '[\\/]')) {
        if ([string]::IsNullOrWhiteSpace($segment)) {
            continue
        }
        $cursor = [System.IO.Path]::Combine($cursor, $segment)
        if (Test-Path -LiteralPath $cursor) {
            $item = Get-Item -LiteralPath $cursor -Force
            if (($item.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) {
                return $false
            }
        }
    }
    return $true
}

function Get-CurrentServedPayloadSha256 {
    $routes = [string[]]@($RuntimePathMap.Keys)
    [System.Array]::Sort($routes, [System.StringComparer]::Ordinal)
    $records = [System.Collections.Generic.List[string]]::new()

    foreach ($route in $routes) {
        $relativePath = $RuntimePathMap[$route]
        if ($route.IndexOfAny([char[]]@("`t", "`r", "`n")) -ge 0 -or
            $relativePath.IndexOfAny([char[]]@("`t", "`r", "`n")) -ge 0) {
            throw 'The reviewed runtime path map contains a non-canonical path.'
        }
        $absolutePath = [System.IO.Path]::GetFullPath([System.IO.Path]::Combine($Root, $relativePath))
        if (-not $absolutePath.StartsWith($RootPrefix, [System.StringComparison]::OrdinalIgnoreCase) -or
            -not (Test-Path -LiteralPath $absolutePath -PathType Leaf) -or
            -not (Test-NoReparsePoint -RelativePath $relativePath)) {
            throw "The reviewed runtime file '$relativePath' is missing or outside the game folder."
        }
        $fileBytes = [System.IO.File]::ReadAllBytes($absolutePath)
        if ($RuntimeByteSnapshot.ContainsKey($relativePath)) {
            $existingBytes = $RuntimeByteSnapshot[$relativePath]
            if ($existingBytes.Length -ne $fileBytes.Length -or
                (Get-Sha256Hex -Bytes $existingBytes) -cne (Get-Sha256Hex -Bytes $fileBytes)) {
                throw "The reviewed runtime file '$relativePath' changed while its startup snapshot was created."
            }
        }
        else {
            $RuntimeByteSnapshot.Add($relativePath, $fileBytes)
        }
        $length = $fileBytes.Length.ToString(
            [System.Globalization.CultureInfo]::InvariantCulture
        )
        $fileSha256 = Get-Sha256Hex -Bytes $fileBytes
        $records.Add("$route`t$relativePath`t$length`t$fileSha256")
    }

    $canonicalPayload = ($records -join "`n") + "`n"
    return Get-Sha256Hex -Bytes ([System.Text.Encoding]::UTF8.GetBytes($canonicalPayload))
}

$RootId = Get-CurrentRootId
$ServedPayloadSha256 = Get-CurrentServedPayloadSha256
$HealthBody = "{`"schemaVersion`":$HealthSchemaVersion,`"identity`":`"$ServerIdentity`",`"release`":`"$ProductRelease`",`"port`":$Port,`"rootId`":`"$RootId`",`"servedPayloadSha256`":`"$ServedPayloadSha256`"}"

function Open-GamePage {
    if ($NoBrowser) {
        return
    }
    try {
        Start-Process $GameUrl
    }
    catch {
        Write-Warning "The browser did not open automatically. Open $GameUrl yourself."
    }
}

function Test-TcpListener {
    param([int] $PortNumber)

    $client = New-Object System.Net.Sockets.TcpClient
    try {
        $pending = $client.BeginConnect([System.Net.IPAddress]::Loopback, $PortNumber, $null, $null)
        try {
            if (-not $pending.AsyncWaitHandle.WaitOne(750)) {
                return $false
            }
            $client.EndConnect($pending)
            return $client.Connected
        }
        finally {
            $pending.AsyncWaitHandle.Close()
        }
    }
    catch {
        return $false
    }
    finally {
        $client.Close()
    }
}

function Test-ExpectedServer {
    $client = New-Object System.Net.Sockets.TcpClient
    try {
        $pending = $client.BeginConnect([System.Net.IPAddress]::Loopback, $Port, $null, $null)
        try {
            if (-not $pending.AsyncWaitHandle.WaitOne(750)) {
                return $false
            }
            $client.EndConnect($pending)
        }
        finally {
            $pending.AsyncWaitHandle.Close()
        }

        $client.ReceiveTimeout = 1500
        $client.SendTimeout = 1500
        $stream = $client.GetStream()
        $request = "GET $HealthPath HTTP/1.1`r`nHost: 127.0.0.1:$Port`r`nConnection: close`r`n`r`n"
        $requestBytes = [System.Text.Encoding]::ASCII.GetBytes($request)
        $stream.Write($requestBytes, 0, $requestBytes.Length)
        $stream.Flush()

        $buffer = New-Object byte[] 4096
        $collected = New-Object System.Collections.Generic.List[byte]
        while ($collected.Count -lt 16384) {
            $read = $stream.Read($buffer, 0, $buffer.Length)
            if ($read -le 0) {
                break
            }
            for ($index = 0; $index -lt $read; $index += 1) {
                $collected.Add($buffer[$index])
            }
        }

        $responseBytes = $collected.ToArray()
        $response = [System.Text.Encoding]::UTF8.GetString($responseBytes)
        $separatorIndex = $response.IndexOf("`r`n`r`n", [System.StringComparison]::Ordinal)
        if ($separatorIndex -lt 0) {
            return $false
        }

        $headerText = $response.Substring(0, $separatorIndex)
        $bodyText = $response.Substring($separatorIndex + 4)
        $headerLines = $headerText -split "`r`n"
        if ($headerLines.Count -lt 2 -or $headerLines[0] -cne 'HTTP/1.1 200 OK') {
            return $false
        }
        $headers = [System.Collections.Generic.Dictionary[string, string]]::new([System.StringComparer]::OrdinalIgnoreCase)
        for ($lineIndex = 1; $lineIndex -lt $headerLines.Count; $lineIndex += 1) {
            $colon = $headerLines[$lineIndex].IndexOf(':')
            if ($colon -le 0) {
                return $false
            }
            $name = $headerLines[$lineIndex].Substring(0, $colon)
            if ($headers.ContainsKey($name)) {
                return $false
            }
            $headers.Add($name, $headerLines[$lineIndex].Substring($colon + 1).Trim())
        }
        if (-not $headers.ContainsKey($IdentityHeader) -or
            $headers[$IdentityHeader] -cne $ServerIdentity -or
            -not $headers.ContainsKey('Content-Type') -or
            $headers['Content-Type'] -cne 'application/json; charset=utf-8' -or
            -not $headers.ContainsKey('Content-Length') -or
            $headers['Content-Length'] -cne ([System.Text.Encoding]::UTF8.GetByteCount($HealthBody)).ToString(
                [System.Globalization.CultureInfo]::InvariantCulture
            )) {
            return $false
        }
        return $bodyText -ceq $HealthBody
    }
    catch {
        return $false
    }
    finally {
        $client.Close()
    }
}

function Get-ContentType {
    param([string] $FilePath)

    switch ([System.IO.Path]::GetExtension($FilePath).ToLowerInvariant()) {
        '.html' { return 'text/html; charset=utf-8' }
        '.css'  { return 'text/css; charset=utf-8' }
        '.js'   { return 'text/javascript; charset=utf-8' }
        '.json' { return 'application/json; charset=utf-8' }
        '.webmanifest' { return 'application/manifest+json; charset=utf-8' }
        '.svg'  { return 'image/svg+xml' }
        '.png'  { return 'image/png' }
        '.jpg'  { return 'image/jpeg' }
        '.jpeg' { return 'image/jpeg' }
        '.gif'  { return 'image/gif' }
        '.webp' { return 'image/webp' }
        '.ico'  { return 'image/x-icon' }
        '.ttf'  { return 'font/ttf' }
        '.otf'  { return 'font/otf' }
        '.woff' { return 'font/woff' }
        '.woff2'{ return 'font/woff2' }
        '.wav'  { return 'audio/wav' }
        '.txt'  { return 'text/plain; charset=utf-8' }
        '.md'   { return 'text/markdown; charset=utf-8' }
        '.pdf'  { return 'application/pdf' }
        default { return 'application/octet-stream' }
    }
}

function Write-HttpResponse {
    param(
        [System.Net.Sockets.NetworkStream] $Stream,
        [int] $StatusCode,
        [string] $Reason,
        [byte[]] $Body,
        [string] $ContentType = 'text/plain; charset=utf-8',
        [bool] $IncludeBody = $true
    )

    $headers = @(
        "HTTP/1.1 $StatusCode $Reason"
        "Content-Type: $ContentType"
        "Content-Length: $($Body.Length)"
        'Cache-Control: no-store'
        'X-Content-Type-Options: nosniff'
        'Cross-Origin-Resource-Policy: same-origin'
        'Referrer-Policy: no-referrer'
        "Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; font-src 'self'; media-src 'self'; img-src 'self' data: blob:; connect-src 'self'; worker-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'"
        'Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=()'
        "$IdentityHeader`: $ServerIdentity"
        'Connection: close'
        ''
        ''
    ) -join "`r`n"

    $headerBytes = [System.Text.Encoding]::ASCII.GetBytes($headers)
    $Stream.Write($headerBytes, 0, $headerBytes.Length)
    if ($IncludeBody -and $Body.Length -gt 0) {
        $Stream.Write($Body, 0, $Body.Length)
    }
    $Stream.Flush()
}

function Write-TextResponse {
    param(
        [System.Net.Sockets.NetworkStream] $Stream,
        [int] $StatusCode,
        [string] $Reason,
        [string] $Text,
        [bool] $IncludeBody = $true
    )

    $body = [System.Text.Encoding]::UTF8.GetBytes($Text)
    Write-HttpResponse -Stream $Stream -StatusCode $StatusCode -Reason $Reason -Body $body -IncludeBody $IncludeBody
}

function Resolve-SafeRuntimePath {
    param([string] $RequestTarget)

    $rawPath = ($RequestTarget -split '\?', 2)[0]
    if (-not $rawPath.StartsWith('/')) {
        return $null
    }
    try {
        $decodedPath = [System.Uri]::UnescapeDataString($rawPath)
    }
    catch {
        return $null
    }

    if ($decodedPath.IndexOf([char]0) -ge 0 -or $decodedPath.Contains(':')) {
        return $null
    }

    $segments = $decodedPath -split '[\\/]'
    foreach ($segment in $segments) {
        if ($segment -eq '.' -or $segment -eq '..') {
            return $null
        }
    }

    $normalizedPath = $decodedPath.Replace('\', '/')
    if (-not $RuntimePathMap.ContainsKey($normalizedPath)) {
        return $null
    }
    $relativePath = $RuntimePathMap[$normalizedPath]
    if (-not $RuntimeByteSnapshot.ContainsKey($relativePath)) {
        return $null
    }

    return $relativePath
}

function Read-HttpRequest {
    param([System.Net.Sockets.NetworkStream] $Stream)

    $reader = New-Object System.IO.StreamReader($Stream, [System.Text.Encoding]::ASCII, $false, 1024, $true)
    $requestLine = $reader.ReadLine()
    if ($null -eq $requestLine -or $requestLine.Length -gt 4096) {
        return $null
    }

    $headers = [System.Collections.Generic.Dictionary[string, string]]::new([System.StringComparer]::OrdinalIgnoreCase)
    $headerBytes = 0
    $headersComplete = $false
    for ($headerCount = 0; $headerCount -lt 100; $headerCount += 1) {
        $line = $reader.ReadLine()
        if ($null -eq $line) {
            return $null
        }
        if ($line.Length -eq 0) {
            $headersComplete = $true
            break
        }
        $headerBytes += $line.Length
        if ($headerBytes -gt 16384) {
            return $null
        }
        if ($line[0] -eq ' ' -or $line[0] -eq "`t") {
            return $null
        }
        $colon = $line.IndexOf(':')
        if ($colon -le 0) {
            return $null
        }
        $name = $line.Substring(0, $colon)
        $value = $line.Substring($colon + 1).Trim()
        if ($name -notmatch '^[A-Za-z0-9!#$%&''*+\-.^_`|~]+$' -or $headers.ContainsKey($name)) {
            return $null
        }
        $headers.Add($name, $value)
    }
    if (-not $headersComplete) {
        return $null
    }

    return [PSCustomObject]@{
        RequestLine = $requestLine
        Headers = $headers
    }
}

function Invoke-ClientRequest {
    param([System.Net.Sockets.TcpClient] $Client)

    $Client.ReceiveTimeout = 5000
    $Client.SendTimeout = 5000
    $Client.NoDelay = $true
    $stream = $Client.GetStream()

    try {
        $request = Read-HttpRequest -Stream $stream
        if ($null -eq $request) {
            Write-TextResponse -Stream $stream -StatusCode 400 -Reason 'Bad Request' -Text 'Bad request.'
            return
        }

        $parts = $request.RequestLine -split ' '
        if ($parts.Count -ne 3 -or $parts[2] -notin @('HTTP/1.0', 'HTTP/1.1')) {
            Write-TextResponse -Stream $stream -StatusCode 400 -Reason 'Bad Request' -Text 'Bad request.'
            return
        }
        if (-not $request.Headers.ContainsKey('Host') -or $request.Headers['Host'] -cne $ExpectedHost) {
            Write-TextResponse -Stream $stream -StatusCode 421 -Reason 'Misdirected Request' -Text 'This server accepts only the Math Quest loopback address.'
            return
        }

        $method = $parts[0].ToUpperInvariant()
        $target = $parts[1]
        if ($method -ne 'GET' -and $method -ne 'HEAD') {
            Write-TextResponse -Stream $stream -StatusCode 405 -Reason 'Method Not Allowed' -Text 'Only GET and HEAD are allowed.' -IncludeBody ($method -ne 'HEAD')
            return
        }
        $includeBody = $method -eq 'GET'

        $targetPath = ($target -split '\?', 2)[0]
        if ($targetPath -eq $HealthPath) {
            $healthBytes = [System.Text.Encoding]::UTF8.GetBytes($HealthBody)
            Write-HttpResponse -Stream $stream -StatusCode 200 -Reason 'OK' -Body $healthBytes -ContentType 'application/json; charset=utf-8' -IncludeBody $includeBody
            return
        }

        $relativePath = Resolve-SafeRuntimePath -RequestTarget $target
        if ($null -eq $relativePath) {
            Write-TextResponse -Stream $stream -StatusCode 404 -Reason 'Not Found' -Text 'Not found.' -IncludeBody $includeBody
            return
        }

        $fileBytes = $RuntimeByteSnapshot[$relativePath]
        Write-HttpResponse -Stream $stream -StatusCode 200 -Reason 'OK' -Body $fileBytes -ContentType (Get-ContentType -FilePath $relativePath) -IncludeBody $includeBody
    }
    catch {
        try {
            Write-TextResponse -Stream $stream -StatusCode 500 -Reason 'Internal Server Error' -Text 'The local server could not read that file.'
        }
        catch {
            # The browser may have closed the connection. The server keeps running.
        }
    }
}

if (Test-ExpectedServer) {
    Write-Host "Math Quest beta is already running on port $Port." -ForegroundColor Green
    Open-GamePage
    exit 0
}

if (Test-TcpListener -PortNumber $Port) {
    Write-Host "Port $Port is already in use by another program. Close that program, then start Math Quest again." -ForegroundColor Red
    exit 2
}

$indexPath = Join-Path $Root 'index.html'
if (-not (Test-Path -LiteralPath $indexPath -PathType Leaf)) {
    Write-Host "index.html is missing from $Root. Put the complete game in this folder, then try again." -ForegroundColor Red
    exit 3
}

$listener = New-Object System.Net.Sockets.TcpListener([System.Net.IPAddress]::Loopback, $Port)
try {
    $listener.Start()
}
catch {
    if (Test-ExpectedServer) {
        Write-Host "Math Quest beta started in another window." -ForegroundColor Green
        Open-GamePage
        exit 0
    }
    throw
}

Write-Host ''
Write-Host "Math Quest beta is ready." -ForegroundColor Green
Write-Host "Open: $GameUrl"
Write-Host 'Keep this window open while you play.'
Write-Host 'Close this window or press Ctrl+C to stop the local server.'
Write-Host ''

Open-GamePage

try {
    while ($true) {
        $client = $listener.AcceptTcpClient()
        try {
            Invoke-ClientRequest -Client $client
        }
        finally {
            $client.Close()
        }
    }
}
finally {
    $listener.Stop()
}
