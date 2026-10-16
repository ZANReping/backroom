$ErrorActionPreference = 'Stop'
$qaRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../reports/l11-navigation-interiors'))
$qaRecords = @('before','after-first','baseline','baseline-active','final','entry') | ForEach-Object {
  $qaFile = Join-Path $qaRoot ($_ + '.json')
  if (Test-Path -LiteralPath $qaFile) { Get-Content -LiteralPath $qaFile -Raw | ConvertFrom-Json }
}
foreach ($qaRecord in $qaRecords) {
  if ($qaRecord.run -notmatch '^qa-\d+-\d+$') { throw 'Invalid QA run identity' }
  $qaProfile = [IO.Path]::GetFullPath($qaRecord.profile)
  if (-not $qaProfile.StartsWith($qaRoot + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) { throw 'Unexpected profile location' }
}
$qaProcesses = @(Get-CimInstance Win32_Process | Where-Object { $_.Name -in @('chrome.exe','msedge.exe','node.exe','esbuild.exe') })
$qaOwned = @($qaProcesses | Where-Object { $_.CommandLine -and $_.CommandLine.Contains($qaRoot) })
$qaPorts = @($qaRecords | ForEach-Object { [int]$_.port; [int]$_.cdp })
$qaBound = @(Get-NetTCPConnection -State Listen | Where-Object { $_.LocalPort -in $qaPorts })
$qaParents = @($qaRecords | ForEach-Object { $_.pids.server })
$qaChildren = @($qaProcesses | Where-Object { $_.ParentProcessId -in $qaParents -and $_.Name -eq 'esbuild.exe' })
$qaProfiles = @(Get-ChildItem -LiteralPath $qaRoot -Directory -Filter 'qa-*')
$qaPass = $qaOwned.Count -eq 0 -and $qaBound.Count -eq 0 -and $qaChildren.Count -eq 0 -and $qaProfiles.Count -eq 0
[pscustomobject]@{passed=$qaPass;method='Read-only ownership, process, listener and profile inspection';runs=@($qaRecords.run);processes=@($qaOwned | Select-Object ProcessId,CommandLine);listeners=@($qaBound | Select-Object LocalPort,OwningProcess);children=@($qaChildren | Select-Object ProcessId,ParentProcessId);profiles=@($qaProfiles | Select-Object FullName)} | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath (Join-Path $qaRoot 'cleanup.json') -Encoding utf8
if (-not $qaPass) { throw 'Inspect cleanup.json; no process was terminated by this read-only check' }
Write-Output 'L11 navigation/interior QA cleanup confirmed'
