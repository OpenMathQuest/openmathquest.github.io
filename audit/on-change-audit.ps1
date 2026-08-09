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

function Invoke-DevelopmentChecks {
    param([string[]]$ChangedPaths = @())
    Write-Host ("[{0}] Running focused Math Quest development checks." -f (Get-Date -Format s))
    $arguments = @('-NoLogo', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', $runner, '-DevelopmentOnly')
    if ($ChangedPaths.Count -gt 0) {
        $arguments += '-ChangedPath'
        $arguments += $ChangedPaths
    }
    & powershell.exe @arguments
    if ($LASTEXITCODE -ne 0) { Write-Warning "Focused development checks finished with exit code $LASTEXITCODE." }
}

if (-not $SkipInitialRun) { Invoke-DevelopmentChecks }

$watcher = [IO.FileSystemWatcher]::new($workspace)
$watcher.IncludeSubdirectories = $true
$watcher.NotifyFilter = [IO.NotifyFilters]'FileName, LastWrite, Size'
$watcher.EnableRaisingEvents = $true
Write-Host "Watching $workspace. Press Ctrl+C to stop."

try {
    while ($true) {
        $change = $watcher.WaitForChanged([IO.WatcherChangeTypes]'Changed, Created, Deleted, Renamed', 1000)
        if ($change.TimedOut) { continue }
        $pending = [Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
        $quietDeadline = [DateTime]::UtcNow.AddMilliseconds(750)
        while ($true) {
            if ($change.Name) {
                $fullPath = Join-Path $workspace $change.Name
                if ($ignored -notcontains $fullPath -and
                    $change.Name -notmatch '(^|[\\/])(?:\.git|\.tmp|node_modules)([\\/]|$)') {
                    $null = $pending.Add($change.Name)
                }
            }
            if ($change.ChangeType -eq [IO.WatcherChangeTypes]::Renamed) {
                if ($change.OldName) {
                    $oldFullPath = Join-Path $workspace $change.OldName
                    if ($ignored -notcontains $oldFullPath -and
                        $change.OldName -notmatch '(^|[\\/])(?:\.git|\.tmp|node_modules)([\\/]|$)') {
                        $null = $pending.Add($change.OldName)
                    }
                } else {
                    # Unknown rename sources fail safe to the broad suite.
                    $null = $pending.Add('__rename_unknown__')
                }
            }
            $remaining = [Math]::Max(1, [int][Math]::Ceiling(($quietDeadline - [DateTime]::UtcNow).TotalMilliseconds))
            $change = $watcher.WaitForChanged([IO.WatcherChangeTypes]'Changed, Created, Deleted, Renamed', $remaining)
            if ($change.TimedOut) { break }
            $quietDeadline = [DateTime]::UtcNow.AddMilliseconds(750)
        }
        if ($pending.Count -gt 0) {
            Invoke-DevelopmentChecks -ChangedPaths @($pending | Sort-Object)
        }
    }
} finally {
    $watcher.Dispose()
}
