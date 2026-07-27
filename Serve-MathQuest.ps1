[CmdletBinding()]
param(
    [switch] $NoBrowser
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$Port = 8771
$ProductRelease = '1.0.0-beta.1'
$ServerIdentity = 'math-quest-local-server:v1'
$HealthPath = '/__math_quest_health__'
$Root = [System.IO.Path]::GetFullPath($PSScriptRoot)
$RootPrefix = $Root.TrimEnd([char[]]@('\', '/')) + [System.IO.Path]::DirectorySeparatorChar
$GameUrl = "http://127.0.0.1:$Port/index.html"
$IdentityHeader = 'X-Math-Quest-Server'
$HealthBody = "{`"identity`":`"$ServerIdentity`",`"product`":`"Math Quest`",`"release`":`"$ProductRelease`",`"port`":$Port}"

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

        $response = [System.Text.Encoding]::UTF8.GetString($collected.ToArray())
        $headerMatch = $response -match "(?im)^$([System.Text.RegularExpressions.Regex]::Escape($IdentityHeader)):\s*$([System.Text.RegularExpressions.Regex]::Escape($ServerIdentity))\s*$"
        $bodyMatch = $response.EndsWith($HealthBody, [System.StringComparison]::Ordinal)
        return $headerMatch -and $bodyMatch
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

function Resolve-SafeFile {
    param([string] $RequestTarget)

    $rawPath = ($RequestTarget -split '\?', 2)[0]
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

    $relativePath = $decodedPath.TrimStart([char[]]@('/', '\'))
    if ([string]::IsNullOrWhiteSpace($relativePath)) {
        $relativePath = 'index.html'
    }

    $firstSegment = ($relativePath -split '[\\/]', 2)[0]
    if ($firstSegment -in @('.git', '.agents', '.codex', '.private-prebeta')) {
        return $null
    }

    try {
        $candidate = [System.IO.Path]::GetFullPath([System.IO.Path]::Combine($Root, $relativePath))
    }
    catch {
        return $null
    }

    if (-not $candidate.StartsWith($RootPrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
        return $null
    }
    if (-not (Test-NoReparsePoint -RelativePath $relativePath)) {
        return $null
    }
    if (-not (Test-Path -LiteralPath $candidate -PathType Leaf)) {
        return $null
    }

    return $candidate
}

function Read-RequestLine {
    param([System.Net.Sockets.NetworkStream] $Stream)

    $reader = New-Object System.IO.StreamReader($Stream, [System.Text.Encoding]::ASCII, $false, 1024, $true)
    $requestLine = $reader.ReadLine()
    if ($null -eq $requestLine -or $requestLine.Length -gt 4096) {
        return $null
    }

    $headerBytes = 0
    for ($headerCount = 0; $headerCount -lt 100; $headerCount += 1) {
        $line = $reader.ReadLine()
        if ($null -eq $line -or $line.Length -eq 0) {
            break
        }
        $headerBytes += $line.Length
        if ($headerBytes -gt 16384) {
            return $null
        }
    }

    return $requestLine
}

function Invoke-ClientRequest {
    param([System.Net.Sockets.TcpClient] $Client)

    $Client.ReceiveTimeout = 5000
    $Client.SendTimeout = 5000
    $Client.NoDelay = $true
    $stream = $Client.GetStream()

    try {
        $requestLine = Read-RequestLine -Stream $stream
        if ($null -eq $requestLine) {
            Write-TextResponse -Stream $stream -StatusCode 400 -Reason 'Bad Request' -Text 'Bad request.'
            return
        }

        $parts = $requestLine -split ' '
        if ($parts.Count -ne 3 -or -not $parts[2].StartsWith('HTTP/')) {
            Write-TextResponse -Stream $stream -StatusCode 400 -Reason 'Bad Request' -Text 'Bad request.'
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

        $filePath = Resolve-SafeFile -RequestTarget $target
        if ($null -eq $filePath) {
            Write-TextResponse -Stream $stream -StatusCode 404 -Reason 'Not Found' -Text 'Not found.' -IncludeBody $includeBody
            return
        }

        $fileBytes = [System.IO.File]::ReadAllBytes($filePath)
        Write-HttpResponse -Stream $stream -StatusCode 200 -Reason 'OK' -Body $fileBytes -ContentType (Get-ContentType -FilePath $filePath) -IncludeBody $includeBody
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
