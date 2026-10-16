$ErrorActionPreference = 'Stop'
$qaRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../reports/l11-faceling-ecology'))
$qaData = Get-Content -LiteralPath (Join-Path $qaRoot 'runtime.json') -Raw | ConvertFrom-Json
if ($qaData.run -notmatch '^qa-\d+-\d+$') { throw 'Invalid QA run identity' }
$qaProfile = [IO.Path]::GetFullPath($qaData.profile)
if (-not $qaProfile.StartsWith($qaRoot + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) { throw 'Unexpected profile location' }
$qaProcesses = @(Get-CimInstance Win32_Process | Where-Object { $_.Name -in @('chrome.exe','msedge.exe','node.exe','esbuild.exe') })
$qaOwned = @($qaProcesses | Where-Object { $_.CommandLine -and $_.CommandLine.Contains($qaRoot) })
$qaPorts = @([int]$qaData.port,[int]$qaData.cdp)
$qaBound = @(Get-NetTCPConnection -State Listen | Where-Object { $_.LocalPort -in $qaPorts })
$qaChildren = @($qaProcesses | Where-Object { $_.ParentProcessId -eq [int]$qaData.pids.server -and $_.Name -eq 'esbuild.exe' })
$qaProfiles = @(Get-ChildItem -LiteralPath $qaRoot -Directory -Filter 'qa-*')
$qaPass = $qaOwned.Count -eq 0 -and $qaBound.Count -eq 0 -and $qaChildren.Count -eq 0 -and $qaProfiles.Count -eq 0
[pscustomobject]@{passed=$qaPass;method='Read-only ownership, process, listener and profile inspection';run=$qaData.run;processes=@($qaOwned | Select-Object ProcessId,CommandLine);listeners=@($qaBound | Select-Object LocalPort,OwningProcess);children=@($qaChildren | Select-Object ProcessId,ParentProcessId);profiles=@($qaProfiles | Select-Object FullName)} | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath (Join-Path $qaRoot 'cleanup.json') -Encoding utf8
if (-not $qaPass) { throw 'Inspect cleanup.json; no process was terminated by this read-only check' }
Write-Output 'L11 ecology QA cleanup confirmed'
