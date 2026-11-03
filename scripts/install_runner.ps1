# Starts scripts/runner.py (the "Run daily leads" worker) automatically when you log in to Windows.
#   powershell -ExecutionPolicy Bypass -File scripts/install_runner.ps1            # install
#   powershell -ExecutionPolicy Bypass -File scripts/install_runner.ps1 -Remove    # uninstall
# Log: data/runner.log
param([switch]$Remove)
$name = "GrowthIntelligence Runner"
if ($Remove) { Unregister-ScheduledTask -TaskName $name -Confirm:$false; "Removed '$name'."; exit }
$root = Split-Path -Parent $PSScriptRoot
# Ask Python for its real path (python may be a .cmd/.bat shim, which cannot run hidden).
$py = (& python -c "import sys; print(sys.executable)").Trim()
$pyw = Join-Path (Split-Path $py) "pythonw.exe"
if (-not (Test-Path $pyw)) { $pyw = $py }
$action = New-ScheduledTaskAction -Execute $pyw -Argument "`"$root\scripts\runner.py`"" -WorkingDirectory $root
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 5)
Register-ScheduledTask -TaskName $name -Action $action -Trigger $trigger -Settings $settings -Description "Runs Growth Intelligence jobs requested from the web UI" -Force | Out-Null
Start-ScheduledTask -TaskName $name
"Installed and started '$name'. It starts again at every login. Log: $root\data\runner.log"
