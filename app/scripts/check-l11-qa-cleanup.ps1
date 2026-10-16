param([Parameter(Mandatory=$true)][string[]]$Labels)
$ErrorActionPreference = 'Stop'
$qaRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../reports/l11-reference'))
foreach ($qaLabel in $Labels) {
  if ($qaLabel -notmatch '^[a-z0-9-]+$') { throw 'Invalid report label' }
  $qaFolder = Join-Path $qaRoot $qaLabel
  $qaData = Get-Content -LiteralPath (Join-Path $qaFolder 'runtime.json') -Raw | ConvertFrom-Json
  $qaIds = @([int]$qaData.pids.server, [int]$qaData.pids.browser)
  $qaPorts = @([int]$qaData.port, [int]$qaData.cdp)
  if ($qaData.run -notmatch '^qa-\d+-\d+$') { throw 'Invalid run identity' }
  $qaRecord = [ordered]@{run=$qaData.run;ports=$qaPorts;profile=$qaData.profile;cleanupConfirmed=$false}
  try {
    $qaTracked = @(Get-CimInstance Win32_Process -Filter ('ProcessId = ' + $qaIds[0] + ' OR ProcessId = ' + $qaIds[1]) | Select-Object ProcessId,CommandLine)
    $qaOwned = @(Get-CimInstance Win32_Process -Filter ("CommandLine LIKE '%" + $qaData.run + "%'") | Select-Object ProcessId,CommandLine)
    $qaListeners = @(Get-NetTCPConnection -State Listen | Where-Object { $_.LocalPort -in $qaPorts } | Select-Object LocalPort,OwningProcess)
    $qaProfileExists = Test-Path -LiteralPath $qaData.profile
    $qaRecord.verification = [ordered]@{trackedPids=$qaIds;trackedProcesses=$qaTracked;ownedMatchingProcesses=$qaOwned;listeners=$qaListeners;profileExists=$qaProfileExists;method='read-only Get-CimInstance Win32_Process and Get-NetTCPConnection'}
    $qaRecord.cleanupConfirmed = $qaOwned.Count -eq 0 -and $qaListeners.Count -eq 0 -and -not $qaProfileExists
  } catch { $qaRecord.failure = $_.Exception.Message }
  $qaRecord | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath (Join-Path $qaFolder 'process-cleanup.json') -Encoding utf8
  if (-not $qaRecord.cleanupConfirmed) { throw "Cleanup could not be confirmed: $qaLabel" }
  [pscustomobject]@{label=$qaLabel;cleanupConfirmed=$qaRecord.cleanupConfirmed}
}
