[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [ValidatePattern('^[a-f0-9]{40}$')]
    [string]$CandidateSha,

    [Parameter(Mandatory = $false)]
    [string]$OutputPath = 'audit-artifacts/hosted-windows-observation-v1.json'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

if ($env:GITHUB_REPOSITORY -cne 'OpenMathQuest/openmathquest.github.io' -or
    $env:GITHUB_REF -cne 'refs/heads/main' -or
    $env:GITHUB_REF_TYPE -cne 'branch' -or
    $env:GITHUB_REF_NAME -cne 'main') {
    throw 'Hosted identity observation may run only for protected main in the public Math Quest repository.'
}
if ($env:GITHUB_SHA -cne $CandidateSha) {
    throw 'CandidateSha must exactly equal GITHUB_SHA.'
}
if ($env:RUNNER_ENVIRONMENT -cne 'github-hosted' -or
    $env:MQ_OBSERVATION_RUNNER_LABEL -cne 'windows-latest' -or
    $env:MQ_OBSERVATION_CERTIFICATION_STATUS -cne 'OBSERVATION_ONLY_NOT_CERTIFICATION') {
    throw 'Hosted identity observation requires the GitHub-hosted windows-latest lane.'
}
foreach ($requiredName in @('ImageOS', 'ImageVersion', 'GITHUB_RUN_ID', 'GITHUB_RUN_ATTEMPT')) {
    $requiredValue = [Environment]::GetEnvironmentVariable($requiredName)
    if ([string]::IsNullOrWhiteSpace($requiredValue)) {
        throw "Required GitHub-hosted identity field $requiredName is missing."
    }
}
if ($env:ImageOS -ceq 'PENDING' -or
    $env:ImageVersion -ceq 'PENDING' -or
    $env:ImageOS -cnotmatch '^[A-Za-z0-9._-]{1,100}$' -or
    $env:ImageVersion -cnotmatch '^[A-Za-z0-9._-]{1,100}$' -or
    $env:GITHUB_RUN_ID -cnotmatch '^[1-9][0-9]*$' -or
    $env:GITHUB_RUN_ATTEMPT -cnotmatch '^[1-9][0-9]*$') {
    throw 'GitHub-hosted runner identity fields are malformed.'
}

$programFiles = [Environment]::GetFolderPath('ProgramFiles')
$programFilesX86 = [Environment]::GetFolderPath('ProgramFilesX86')
$browserCandidates = @(
    [pscustomobject]@{ Product = 'Microsoft Edge'; Path = (Join-Path $programFilesX86 'Microsoft\Edge\Application\msedge.exe') },
    [pscustomobject]@{ Product = 'Microsoft Edge'; Path = (Join-Path $programFiles 'Microsoft\Edge\Application\msedge.exe') },
    [pscustomobject]@{ Product = 'Google Chrome'; Path = (Join-Path $programFiles 'Google\Chrome\Application\chrome.exe') },
    [pscustomobject]@{ Product = 'Google Chrome'; Path = (Join-Path $programFilesX86 'Google\Chrome\Application\chrome.exe') }
)

$selected = $null
foreach ($candidate in $browserCandidates) {
    if (-not (Test-Path -LiteralPath $candidate.Path -PathType Leaf)) {
        continue
    }
    $versionInfo = (Get-Item -LiteralPath $candidate.Path).VersionInfo
    $actualProduct = [string]$versionInfo.ProductName
    if ($candidate.Product -eq 'Microsoft Edge' -and $actualProduct -notmatch '^Microsoft Edge') {
        continue
    }
    if ($candidate.Product -eq 'Google Chrome' -and $actualProduct -notmatch '^Google Chrome') {
        continue
    }
    $fullVersion = @([string]$versionInfo.ProductVersion, [string]$versionInfo.FileVersion) |
        Where-Object { $_ -match '^\d+\.\d+\.\d+\.\d+$' } |
        Select-Object -First 1
    if ([string]::IsNullOrWhiteSpace($fullVersion)) {
        continue
    }
    $selected = [pscustomobject]@{
        Product = $candidate.Product
        Path = $candidate.Path
        FullVersion = $fullVersion
    }
    break
}
if ($null -eq $selected) {
    throw 'No supported Microsoft Edge or Google Chrome executable with a four-part version was found.'
}

$executableSha256 = (Get-FileHash -LiteralPath $selected.Path -Algorithm SHA256).Hash.ToLowerInvariant()
if ($executableSha256 -cnotmatch '^[a-f0-9]{64}$') {
    throw 'The observed browser executable SHA-256 is malformed.'
}

$observation = [ordered]@{
    schemaVersion = 1
    artifactKind = 'HOSTED_WINDOWS_BROWSER_IDENTITY_OBSERVATION_V1'
    certificationStatus = 'OBSERVATION_ONLY_NOT_CERTIFICATION'
    repository = 'OpenMathQuest/openmathquest.github.io'
    ref = 'refs/heads/main'
    candidateSha = $CandidateSha
    workflowFile = '.github/workflows/hosted-windows-observation.yml'
    workflowRunId = $env:GITHUB_RUN_ID
    workflowRunAttempt = $env:GITHUB_RUN_ATTEMPT
    observedAtUtc = [DateTime]::UtcNow.ToString('yyyy-MM-ddTHH:mm:ss.fffZ', [Globalization.CultureInfo]::InvariantCulture)
    browserProductName = $selected.Product
    browserFullVersion = $selected.FullVersion
    browserExecutableSha256 = $executableSha256
    requestedRunnerLabel = 'windows-latest'
    runnerEnvironment = 'github-hosted'
    runnerImageOS = $env:ImageOS
    runnerImageVersion = $env:ImageVersion
}

$resolvedOutput = if ([IO.Path]::IsPathRooted($OutputPath)) {
    [IO.Path]::GetFullPath($OutputPath)
} else {
    [IO.Path]::GetFullPath((Join-Path (Get-Location) $OutputPath))
}
$outputDirectory = [IO.Path]::GetDirectoryName($resolvedOutput)
[IO.Directory]::CreateDirectory($outputDirectory) | Out-Null
$canonicalJson = ($observation | ConvertTo-Json -Depth 3 -Compress) + "`n"
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[IO.File]::WriteAllText($resolvedOutput, $canonicalJson, $utf8NoBom)

Write-Host "Observed $($selected.Product) $($selected.FullVersion) on $($env:ImageOS) $($env:ImageVersion)."
Write-Host 'Observation only: release certification was not run.'
