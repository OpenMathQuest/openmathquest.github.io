[CmdletBinding()]
param([switch]$SkipInitialRun)

$ErrorActionPreference = 'Stop'
$auditDirectory = Split-Path -Parent $MyInvocation.MyCommand.Path
$workspace = Split-Path -Parent $auditDirectory
$runner = Join-Path $auditDirectory 'run-audit.ps1'
$ignored = @(
    (Join-Path $auditDirectory 'last-report.md'),
    (Join-Path $auditDirectory 'last-report.json'),
    (Join-Path $auditDirectory 'final-build-report.md')
)

function Invoke-FullAudit {
    Write-Host ("[{0}] Running the full Math Quest audit." -f (Get-Date -Format s))
    & powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File $runner -TechnicalOnly
    if ($LASTEXITCODE -ne 0) { Write-Warning "Audit finished with exit code $LASTEXITCODE. See audit\last-report.md." }
}

if (-not $SkipInitialRun) { Invoke-FullAudit }

$watcher = [IO.FileSystemWatcher]::new($workspace)
$watcher.IncludeSubdirectories = $true
$watcher.NotifyFilter = [IO.NotifyFilters]'FileName, LastWrite, Size'
$watcher.EnableRaisingEvents = $true
Write-Host "Watching $workspace. Press Ctrl+C to stop."

try {
    while ($true) {
        $change = $watcher.WaitForChanged([IO.WatcherChangeTypes]'Changed, Created, Deleted, Renamed', 1000)
        if ($change.TimedOut) { continue }
        $fullPath = Join-Path $workspace $change.Name
        if ($ignored -contains $fullPath) { continue }
        if ($change.Name -match '(^|[\\/])(?:\.git|\.tmp|node_modules)([\\/]|$)') { continue }
        Start-Sleep -Milliseconds 750
        Invoke-FullAudit
    }
} finally {
    $watcher.Dispose()
}
