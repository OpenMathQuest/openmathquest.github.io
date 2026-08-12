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
