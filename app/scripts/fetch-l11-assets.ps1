[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
$TextureDir = Join-Path $Root 'public/textures'
$CacheDir = Join-Path $Root '.cache/l11-assets'
New-Item -ItemType Directory -Force -Path $TextureDir, $CacheDir | Out-Null

$sets = @(
  @{ Asset = 'Concrete034'; Prefix = 'l11_concrete' },
  @{ Asset = 'Asphalt012'; Prefix = 'l11_asphalt' },
  @{ Asset = 'Bricks097'; Prefix = 'l11_brick' },
  @{ Asset = 'Plaster004'; Prefix = 'l11_plaster' },
  @{ Asset = 'Tiles074'; Prefix = 'l11_tiles' },
  @{ Asset = 'Metal032'; Prefix = 'l11_metal' },
  @{ Asset = 'WoodFloor051'; Prefix = 'l11_wood' }
)

function Test-Jpeg([string]$Path) {
  if (!(Test-Path -LiteralPath $Path)) { return $false }
  $length = (Get-Item -LiteralPath $Path).Length
  if ($length -lt 1024) { return $false }
  $bytes = [IO.File]::ReadAllBytes($Path)
  return $bytes.Length -ge 4 -and $bytes[0] -eq 0xFF -and $bytes[1] -eq 0xD8 -and $bytes[$bytes.Length - 2] -eq 0xFF -and $bytes[$bytes.Length - 1] -eq 0xD9
}

foreach ($set in $sets) {
  $targets = @("$($set.Prefix).jpg", "$($set.Prefix)_normal.jpg", "$($set.Prefix)_roughness.jpg") | ForEach-Object { Join-Path $TextureDir $_ }
  if (($targets | Where-Object { !(Test-Jpeg $_) }).Count -eq 0) { continue }

  $zip = Join-Path $CacheDir "$($set.Asset)_1K-JPG.zip"
  if (!(Test-Path -LiteralPath $zip) -or (Get-Item -LiteralPath $zip).Length -lt 1024) {
    $url = "https://ambientcg.com/get?file=$($set.Asset)_1K-JPG.zip"
    $ok = $false
    for ($attempt = 1; $attempt -le 3 -and !$ok; $attempt++) {
      try {
        & curl.exe --fail --location --connect-timeout 12 --max-time 50 --silent --show-error $url --output $zip
        if ($LASTEXITCODE -ne 0) { throw "Download failed: $($set.Asset)" }
        $ok = $true
      } catch { if ($attempt -eq 3) { throw } }
    }
  }

  $extract = Join-Path $CacheDir $set.Asset
  Expand-Archive -LiteralPath $zip -DestinationPath $extract -Force
  foreach ($map in @(@('Color.jpg', "$($set.Prefix).jpg"), @('NormalGL.jpg', "$($set.Prefix)_normal.jpg"), @('Roughness.jpg', "$($set.Prefix)_roughness.jpg"))) {
    $source = Get-ChildItem -LiteralPath $extract -Recurse -Filter "*_$($map[0])" | Select-Object -First 1
    if (!$source -or !(Test-Jpeg $source.FullName)) { throw "Missing or invalid $($map[0]) in $($set.Asset)" }
    $destination = Join-Path $TextureDir $map[1]
    if (!(Test-Jpeg $destination)) { Copy-Item -LiteralPath $source.FullName -Destination $destination }
  }
}

foreach ($set in $sets) { foreach ($suffix in @('.jpg', '_normal.jpg', '_roughness.jpg')) { if (!(Test-Jpeg (Join-Path $TextureDir ($set.Prefix + $suffix)))) { throw "Invalid output for $($set.Prefix)$suffix" } } }
Write-Output 'L11 assets verified.'
