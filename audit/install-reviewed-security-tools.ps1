[CmdletBinding()]
param(
  [string]$CachePath = ([IO.Path]::Combine([IO.Path]::GetTempPath(), 'math-quest-security-tools'))
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$repositoryRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$policyPath = Join-Path $PSScriptRoot 'security-gate-policy-v1.json'
$policy = Get-Content -LiteralPath $policyPath -Raw | ConvertFrom-Json
$resolvedCache = [IO.Path]::GetFullPath($CachePath)

if ($policy.schemaVersion -ne 1 -or @($policy.tools).Count -ne 2) {
  throw 'The security-tool policy is not the reviewed closed schema.'
}

New-Item -ItemType Directory -Path $resolvedCache -Force | Out-Null

foreach ($tool in @($policy.tools)) {
  $artifactPath = [IO.Path]::GetFullPath((Join-Path $resolvedCache $tool.artifact.filename))
  if (-not $artifactPath.StartsWith(($resolvedCache.TrimEnd('\') + '\'), [StringComparison]::OrdinalIgnoreCase)) {
    throw "The $($tool.name) artifact path escaped the reviewed cache."
  }

  if (-not (Test-Path -LiteralPath $artifactPath)) {
    $downloadPath = "$artifactPath.download-$([Guid]::NewGuid().ToString('N'))"
    try {
      Invoke-WebRequest -UseBasicParsing -Uri $tool.artifact.url -OutFile $downloadPath
      $download = Get-Item -LiteralPath $downloadPath
      $downloadHash = (Get-FileHash -LiteralPath $downloadPath -Algorithm SHA256).Hash.ToLowerInvariant()
      if ($download.Length -ne [long]$tool.artifact.bytes -or $downloadHash -cne $tool.artifact.sha256) {
        throw "The downloaded $($tool.name) artifact does not match the reviewed size and SHA-256."
      }
      Move-Item -LiteralPath $downloadPath -Destination $artifactPath
    }
    finally {
      if (Test-Path -LiteralPath $downloadPath) {
        Remove-Item -LiteralPath $downloadPath -Force
      }
    }
  }

  $artifact = Get-Item -LiteralPath $artifactPath
  $artifactHash = (Get-FileHash -LiteralPath $artifactPath -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($artifact.Length -ne [long]$tool.artifact.bytes -or $artifactHash -cne $tool.artifact.sha256) {
    throw "The cached $($tool.name) artifact does not match the reviewed size and SHA-256."
  }
}

$env:MQ_SECURITY_TOOL_CACHE = $resolvedCache
if ($env:GITHUB_ACTIONS -ceq 'true' -and -not [string]::IsNullOrWhiteSpace($env:GITHUB_ENV)) {
  Add-Content -LiteralPath $env:GITHUB_ENV -Value "MQ_SECURITY_TOOL_CACHE=$resolvedCache"
}

Write-Output "Reviewed security tools verified in $resolvedCache"
