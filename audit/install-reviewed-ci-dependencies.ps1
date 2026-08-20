[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$env:PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD = '1'

npm.cmd ci --ignore-scripts --omit=optional --no-audit --no-fund
if ($LASTEXITCODE -ne 0) {
    throw "The exact reviewed CI dependency closure could not be installed."
}

$manifestPath = Join-Path $PSScriptRoot '..\node_modules\@playwright\test\package.json'
$manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
if ($manifest.name -cne '@playwright/test' -or $manifest.version -cne '1.62.1') {
    throw 'The installed Playwright Test package does not match the reviewed 1.62.1 pin.'
}

$ajvManifestPath = Join-Path $PSScriptRoot '..\node_modules\ajv\package.json'
$ajvManifest = Get-Content -LiteralPath $ajvManifestPath -Raw | ConvertFrom-Json
if ($ajvManifest.name -cne 'ajv' -or $ajvManifest.version -cne '8.20.0') {
    throw 'The installed Ajv package does not match the reviewed 8.20.0 pin.'
}
