[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [ValidatePattern('^[a-f0-9]{40}$')]
  [string]$CandidateSha,

  [Parameter(Mandatory = $true)]
  [string]$OutputPath
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$caddyVersion = '2.11.4'
$caddyUrl = 'https://github.com/caddyserver/caddy/releases/download/v2.11.4/caddy_2.11.4_windows_amd64.zip'
$caddySha256 = '1708333f79e274c7697285afe6d592ab39314e0b131e9ec6bea08ad27df62ebf'
$caddySha512 = 'cd5ccfd86a4b40732cf715890d0dca5bf3f63adefec5a7914de85adf240c60ce7e5d2791631b88ef9758e46b23bb1730e020b9c5d696889740b284ffd4788e35'
$repositoryRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$runnerTemp = [IO.Path]::GetFullPath($env:RUNNER_TEMP)
$workRoot = [IO.Path]::GetFullPath((Join-Path $runnerTemp ("math-quest-trusted-https-canary-" + [Guid]::NewGuid().ToString('N'))))
$nodeModulesPath = [IO.Path]::GetFullPath((Join-Path $repositoryRoot 'node_modules'))
$resolvedOutput = [IO.Path]::GetFullPath((Join-Path $repositoryRoot $OutputPath))

if ($env:GITHUB_ACTIONS -cne 'true' -or
    $env:GITHUB_REPOSITORY -cne 'OpenMathQuest/openmathquest.github.io' -or
    $env:GITHUB_REF -cne 'refs/heads/main' -or
    $env:GITHUB_SHA -cne $CandidateSha -or
    $env:RUNNER_ENVIRONMENT -cne 'github-hosted' -or
    [string]::IsNullOrWhiteSpace($env:ImageOS) -or
    [string]::IsNullOrWhiteSpace($env:ImageVersion)) {
  throw 'Trusted-HTTPS canary requires the exact public protected-main SHA on GitHub-hosted Windows.'
}
if (-not $workRoot.StartsWith(($runnerTemp.TrimEnd('\') + '\'), [StringComparison]::OrdinalIgnoreCase)) {
  throw 'Disposable canary workspace escaped RUNNER_TEMP.'
}
if ($nodeModulesPath -cne [IO.Path]::GetFullPath((Join-Path $repositoryRoot 'node_modules'))) {
  throw 'Unexpected node_modules cleanup target.'
}
if (-not $resolvedOutput.StartsWith(($repositoryRoot.TrimEnd('\') + '\'), [StringComparison]::OrdinalIgnoreCase) -or
    (Test-Path -LiteralPath $resolvedOutput)) {
  throw 'Canary evidence output must be a new file inside the exact repository checkout.'
}

$zipPath = Join-Path $workRoot "caddy_$caddyVersion`_windows_amd64.zip"
$toolRoot = Join-Path $workRoot 'caddy'
New-Item -ItemType Directory -Path $toolRoot -Force | Out-Null

try {
  $env:PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD = '1'
  Push-Location $repositoryRoot
  try {
    npm ci --ignore-scripts --omit=optional --no-audit --no-fund
    if ($LASTEXITCODE -ne 0) { throw "npm ci failed with exit code $LASTEXITCODE." }
  }
  finally {
    Pop-Location
  }

  Invoke-WebRequest -UseBasicParsing -Uri $caddyUrl -OutFile $zipPath
  $actualSha256 = (Get-FileHash -LiteralPath $zipPath -Algorithm SHA256).Hash.ToLowerInvariant()
  $actualSha512 = (Get-FileHash -LiteralPath $zipPath -Algorithm SHA512).Hash.ToLowerInvariant()
  if ($actualSha256 -cne $caddySha256 -or $actualSha512 -cne $caddySha512) {
    throw 'Downloaded Caddy archive did not match both reviewed checksums.'
  }
  Expand-Archive -LiteralPath $zipPath -DestinationPath $toolRoot -Force
  $caddyCandidates = @(Get-ChildItem -LiteralPath $toolRoot -Recurse -File -Filter 'caddy.exe')
  if ($caddyCandidates.Count -ne 1) {
    throw "The reviewed archive must contain exactly one caddy.exe; found $($caddyCandidates.Count)."
  }

  $env:MQ_CADDY_ARCHIVE_SHA256 = $actualSha256
  $env:MQ_CADDY_ARCHIVE_SHA512 = $actualSha512
  & node (Join-Path $repositoryRoot 'audit/run-trusted-https-canary.mjs') `
    --candidate $CandidateSha `
    --output $resolvedOutput `
    --caddy $caddyCandidates[0].FullName `
    --work-root $workRoot
  if ($LASTEXITCODE -ne 0) {
    throw "Trusted-HTTPS canary failed with exit code $LASTEXITCODE."
  }
}
finally {
  Remove-Item Env:PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD -ErrorAction SilentlyContinue
  Remove-Item Env:MQ_CADDY_ARCHIVE_SHA256 -ErrorAction SilentlyContinue
  Remove-Item Env:MQ_CADDY_ARCHIVE_SHA512 -ErrorAction SilentlyContinue
  if (Test-Path -LiteralPath $workRoot) {
    $resolvedWorkRoot = [IO.Path]::GetFullPath($workRoot)
    if (-not $resolvedWorkRoot.StartsWith(($runnerTemp.TrimEnd('\') + '\'), [StringComparison]::OrdinalIgnoreCase)) {
      throw 'Refusing to remove a canary path outside RUNNER_TEMP.'
    }
    # Crash/timeout fallback: the Node runner normally performs and proves this
    # teardown. If it terminates early, act only on identifiers stored inside
    # this exact disposable workspace and re-check the exact certificate.
    $cleanupPath = Join-Path $resolvedWorkRoot 'cleanup-identifiers-v1.json'
    if (Test-Path -LiteralPath $cleanupPath) {
      $cleanupRecord = Get-Content -LiteralPath $cleanupPath -Raw | ConvertFrom-Json
      if ($cleanupRecord.schemaVersion -ne 1) { throw 'Unknown canary cleanup identifier schema.' }
      foreach ($processId in @($cleanupRecord.processIds)) {
        if ($processId -isnot [int] -and $processId -isnot [long]) { throw 'Invalid canary cleanup process identifier.' }
        $process = Get-Process -Id ([int]$processId) -ErrorAction SilentlyContinue
        if ($null -ne $process) {
          $processPath = [IO.Path]::GetFullPath($process.Path)
          if (-not $processPath.StartsWith(($resolvedWorkRoot.TrimEnd('\') + '\'), [StringComparison]::OrdinalIgnoreCase)) {
            throw 'Refusing to stop a process outside the disposable canary workspace.'
          }
          Stop-Process -Id ([int]$processId) -Force -ErrorAction Stop
        }
      }
      $profilePath = [IO.Path]::GetFullPath((Join-Path $resolvedWorkRoot 'edge-profile'))
      $profileNeedle = '--user-data-dir=' + $profilePath
      foreach ($edge in @(Get-CimInstance Win32_Process -Filter "Name = 'msedge.exe'" | Where-Object { $_.CommandLine -and $_.CommandLine.IndexOf($profileNeedle, [StringComparison]::OrdinalIgnoreCase) -ge 0 })) {
        Stop-Process -Id ([int]$edge.ProcessId) -Force -ErrorAction Stop
      }
      $thumbprint = [string]$cleanupRecord.certificateThumbprint
      if (-not [string]::IsNullOrWhiteSpace($thumbprint)) {
        if ($thumbprint -cnotmatch '^[A-F0-9]{40}$') { throw 'Invalid canary cleanup certificate thumbprint.' }
        $certificateCleanupScript = @'
$ErrorActionPreference = 'Stop'
$thumb = $env:MQ_CANARY_CERT_THUMBPRINT
$store = [Security.Cryptography.X509Certificates.X509Store]::new('Root', [Security.Cryptography.X509Certificates.StoreLocation]::CurrentUser)
try {
  $store.Open([Security.Cryptography.X509Certificates.OpenFlags]::ReadWrite)
  foreach ($certificate in @($store.Certificates.Find([Security.Cryptography.X509Certificates.X509FindType]::FindByThumbprint, $thumb, $false))) { $store.Remove($certificate) }
}
finally { $store.Close() }
$verify = [Security.Cryptography.X509Certificates.X509Store]::new('Root', [Security.Cryptography.X509Certificates.StoreLocation]::CurrentUser)
try {
  $verify.Open([Security.Cryptography.X509Certificates.OpenFlags]::ReadOnly)
  if (@($verify.Certificates.Find([Security.Cryptography.X509Certificates.X509FindType]::FindByThumbprint, $thumb, $false)).Count -ne 0) { exit 1 }
}
finally { $verify.Close() }
'@
        $encodedCleanup = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($certificateCleanupScript))
        $env:MQ_CANARY_CERT_THUMBPRINT = $thumbprint
        try {
          $certificateCleanup = Start-Process -FilePath 'powershell.exe' -ArgumentList @('-NoProfile', '-NonInteractive', '-EncodedCommand', $encodedCleanup) -WindowStyle Hidden -PassThru
          if (-not $certificateCleanup.WaitForExit(30000)) {
            $certificateCleanup.Kill()
            if (-not $certificateCleanup.WaitForExit(5000)) { throw 'Fallback certificate cleanup process did not terminate.' }
            throw 'Fallback certificate removal timed out.'
          }
          if ($certificateCleanup.ExitCode -ne 0) { throw 'Fallback certificate removal failed.' }
        }
        finally {
          Remove-Item Env:MQ_CANARY_CERT_THUMBPRINT -ErrorAction SilentlyContinue
        }
        $verificationStore = [Security.Cryptography.X509Certificates.X509Store]::new('Root', [Security.Cryptography.X509Certificates.StoreLocation]::CurrentUser)
        try {
          $verificationStore.Open([Security.Cryptography.X509Certificates.OpenFlags]::ReadOnly)
          $remaining = @($verificationStore.Certificates.Find([Security.Cryptography.X509Certificates.X509FindType]::FindByThumbprint, $thumbprint, $false)).Count
        }
        finally { $verificationStore.Close() }
        if ($remaining -ne 0) { throw 'Fallback certificate removal did not remove the exact canary root.' }
      }
      if ($null -ne $cleanupRecord.originPort) {
        $port = [int]$cleanupRecord.originPort
        if ($port -lt 1024 -or $port -gt 65535) { throw 'Invalid canary cleanup port.' }
        if (@(Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue).Count -ne 0) {
          throw 'Fallback teardown left the canary HTTPS port listening.'
        }
      }
    }
    Remove-Item -LiteralPath $resolvedWorkRoot -Recurse -Force
  }
  if (Test-Path -LiteralPath $nodeModulesPath) {
    $resolvedModules = [IO.Path]::GetFullPath($nodeModulesPath)
    if ($resolvedModules -cne [IO.Path]::GetFullPath((Join-Path $repositoryRoot 'node_modules'))) {
      throw 'Refusing to remove an unexpected dependency directory.'
    }
    Remove-Item -LiteralPath $resolvedModules -Recurse -Force
  }
}
