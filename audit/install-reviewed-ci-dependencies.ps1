[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$env:PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD = '1'

npm.cmd ci --ignore-scripts --omit=optional --no-audit --no-fund
if ($LASTEXITCODE -ne 0) {
    throw "The exact reviewed CI dependency closure could not be installed."
}

$policyPath = Join-Path $PSScriptRoot 'quality-gate-policy-v1.json'
$policy = Get-Content -LiteralPath $policyPath -Raw | ConvertFrom-Json
foreach ($dependency in $policy.supplyChain.directDependencies) {
    $manifestPath = Join-Path $PSScriptRoot "..\node_modules\$($dependency.name)\package.json"
    $manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
    if ($manifest.name -cne $dependency.name -or
        $manifest.version -cne $dependency.version -or
        $manifest.license -cne $dependency.licence) {
        throw "The installed $($dependency.name) package does not match the reviewed quality-gate policy."
    }
}
