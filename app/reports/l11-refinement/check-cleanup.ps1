$ErrorActionPreference = 'Stop'
$reportRoot = [IO.Path]::GetFullPath($PSScriptRoot)
$runs = @(Get-ChildItem -LiteralPath $reportRoot -Filter '*-runtime.json' | ForEach-Object {
  $data = Get-Content -LiteralPath $_.FullName -Raw | ConvertFrom-Json
  if ($data.run -and $data.profile -and $data.pids) { $data }
})
$processes = @(Get-CimInstance Win32_Process)
$listeners = @(Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue)
$checks = @($runs | ForEach-Object {
  $run = $_
  $profile = [IO.Path]::GetFullPath($run.profile)
  if ([IO.Path]::GetDirectoryName($profile) -ne $reportRoot) { throw 'Unexpected QA profile location' }
  $browser = @($processes | Where-Object {
    $_.CommandLine -and ($_.Name -match '^(chrome|msedge)\.exe$') -and $_.CommandLine.Contains($profile)
  })
  $server = @($processes | Where-Object {
    $_.ProcessId -eq $run.pids.server -and $_.CommandLine -and
    $_.CommandLine.Contains('vite') -and $_.CommandLine.Contains("--port $($run.port)")
  })
  $ports = @($listeners | Where-Object { $_.LocalPort -in @($run.port, $run.cdp) } |
    Select-Object LocalPort, OwningProcess)
  [PSCustomObject]@{
    run = $run.run
    ports = @($run.port, $run.cdp)
    originalPids = $run.pids
    ownedBrowserPids = @($browser | ForEach-Object { $_.ProcessId })
    ownedServerPids = @($server | ForEach-Object { $_.ProcessId })
    profileRemains = Test-Path -LiteralPath $profile
    remainingListeners = $ports
  }
})
$strays = @($processes | Where-Object {
  $_.CommandLine -and ($_.Name -match '^(chrome|msedge)\.exe$') -and
  $_.CommandLine.Contains($reportRoot) -and $_.CommandLine.Contains('qa-')
} | Select-Object ProcessId, Name)
$ok = $strays.Count -eq 0 -and @($checks | Where-Object {
  $_.ownedBrowserPids.Count -gt 0 -or $_.ownedServerPids.Count -gt 0 -or $_.profileRemains
}).Count -eq 0
$result = [PSCustomObject]@{
  checkedAt = (Get-Date).ToUniversalTime().ToString('o')
  ok = $ok
  note = 'Read-only ownership audit; no processes were terminated. Port/PID reuse alone is not treated as ownership.'
  runs = $checks
  strayOwnedBrowsers = $strays
}
$result | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $reportRoot 'cleanup-check.json') -Encoding utf8
$result | Select-Object checkedAt, ok, @{Name='runs';Expression={$_.runs.Count}}, @{Name='strayOwnedBrowsers';Expression={$_.strayOwnedBrowsers.Count}} | ConvertTo-Json
if (-not $ok) { exit 1 }
