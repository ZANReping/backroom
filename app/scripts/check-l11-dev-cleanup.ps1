$ErrorActionPreference = 'Stop'
$qaRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../reports/l11-dev-map-park'))
$qaReports = @(Get-ChildItem -LiteralPath $qaRoot -Recurse -Filter runtime.json)
$qaRecords = @()
$qaProcesses = @(Get-CimInstance Win32_Process | Where-Object { $_.Name -in @('chrome.exe','msedge.exe','node.exe','esbuild.exe') })
$qaListeners = @(Get-NetTCPConnection -State Listen)
foreach ($qaFile in $qaReports) {
  $qaData = Get-Content -LiteralPath $qaFile.FullName -Raw | ConvertFrom-Json
  if ($qaData.run -notmatch '^qa-\d+-\d+$') { throw 'Invalid run identity' }
  $qaProfile = [IO.Path]::GetFullPath($qaData.profile)
  if (-not $qaProfile.StartsWith($qaRoot + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) { throw 'Unexpected profile location' }
  $qaIds = @([int]$qaData.pids.server,[int]$qaData.pids.browser)
  $qaPorts = @([int]$qaData.port,[int]$qaData.cdp)
  $qaOwned = @($qaProcesses | Where-Object { $_.CommandLine -and $_.CommandLine.Contains($qaData.run) })
  $qaBound = @($qaListeners | Where-Object { $_.LocalPort -in $qaPorts })
  $qaChildren = @($qaProcesses | Where-Object { $_.ParentProcessId -in $qaIds -and $_.Name -eq 'esbuild.exe' })
  $qaRecords += [pscustomobject]@{report=$qaFile.Directory.Name;run=$qaData.run;ports=$qaPorts;pids=$qaIds;ownedProcesses=@($qaOwned | Select-Object ProcessId,CommandLine);listeners=@($qaBound | Select-Object LocalPort,OwningProcess);serverChildren=@($qaChildren | Select-Object ProcessId,ParentProcessId,CommandLine);profileExists=(Test-Path -LiteralPath $qaProfile)}
}
$qaResidual = @($qaProcesses | Where-Object { $_.CommandLine -and $_.CommandLine.Contains($qaRoot) })
$qaPass = $qaResidual.Count -eq 0 -and @($qaRecords | Where-Object { $_.ownedProcesses.Count -or $_.listeners.Count -or $_.serverChildren.Count -or $_.profileExists }).Count -eq 0
[pscustomobject]@{passed=$qaPass;method='Read-only process, child process, listener and isolated profile inspection';reports=$qaRecords;residual=@($qaResidual | Select-Object ProcessId,CommandLine)} | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $qaRoot 'cleanup.json') -Encoding utf8
if (-not $qaPass) { throw 'QA cleanup could not be confirmed; inspect cleanup.json before any action' }
Write-Output 'L11 map/dev/park QA cleanup confirmed'
