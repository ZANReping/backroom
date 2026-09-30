#!/usr/bin/env python3
"""从项目已缓存的 ambientCG CC0 岩石包提取 L8 三套法线/粗糙度 PBR 通道。"""
from pathlib import Path
from zipfile import ZipFile
from PIL import Image
import io

ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT / 'scripts' / '.cache-l6-l11'
TEX = ROOT / 'public' / 'textures'
SIZE = (512, 512)

ASSETS = {
    'wall': 'Rock035',
    'floor': 'Rock022',
    'ceil': 'Rock045',
}


def extract(asset: str, channel: str) -> Image.Image:
    with ZipFile(CACHE / f'{asset}.zip') as zf:
        raw = zf.read(f'{asset}_1K-JPG_{channel}.jpg')
    return Image.open(io.BytesIO(raw)).convert('RGB').resize(SIZE, Image.Resampling.LANCZOS)


def main() -> None:
    for terrain, asset in ASSETS.items():
        normal = extract(asset, 'NormalGL')
        roughness = extract(asset, 'Roughness')
        normal.save(TEX / f'l8_{terrain}_normal.jpg', quality=93, subsampling=0)
        roughness.save(TEX / f'l8_{terrain}_roughness.jpg', quality=90, subsampling=0)
        print(f'written l8_{terrain}_normal/roughness.jpg ({asset}, ambientCG CC0)')


if __name__ == '__main__':
    main()
