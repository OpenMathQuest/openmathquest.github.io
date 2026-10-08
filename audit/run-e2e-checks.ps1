[CmdletBinding()]
param(
    [Parameter(Mandatory)][string]$NodePath,
    [Parameter(Mandatory)][string]$AuditDirectory,
    [Parameter(Mandatory)][string]$Workspace
)

$ErrorActionPreference = 'Stop'
Push-Location $Workspace
try {
    Write-Host 'E2E-first: running shipped browser journeys before unit checks.'
    & $NodePath (Join-Path $AuditDirectory 'run-playwright-focused.mjs')
    if ($LASTEXITCODE -ne 0) {
        throw 'The required first E2E browser journey stage failed; unit checks were not started.'
    }
    & $NodePath --test (Join-Path $AuditDirectory 'tests\audit-execution-cli.test.mjs')
    if ($LASTEXITCODE -ne 0) {
        throw 'The audit comparison program E2E stage failed; unit checks were not started.'
    }
} finally {
    Pop-Location
}
