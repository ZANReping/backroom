# 希波克拉底 - 1（阿丽亚娜集团据点）贴图下载与处理（ambientCG CC0，流程同 SOURCES.md 既有条目）：
# 下载 1K JPG → 居中裁方 → 512×512 → 去色至近中性灰 → 亮度归一 → JPEG q86
# 用法：cd app && python scripts/gen-l103-textures.py
import io
import os
import zipfile
import urllib.request

from PIL import Image

OUT = 'public/textures'
# 文件 → (ambientCG 素材 ID, 亮度归一目标均值, 旋转角度)
JOBS = {
    'l103_wall.jpg': ('Plaster006', 0.82, 0),       # 研究所墙面（洁白粉刷）
    'l103_floor.jpg': ('Tiles107', 0.80, 90),       # 研究所地面（白色方砖，旋转 90° 与商人之家同素材区分）
    'l103_ceil.jpg': ('OfficeCeiling003', 0.84, 0),  # 研究所吊顶（亮白办公）
}


def fetch_color_jpg(asset_id: str) -> Image.Image:
    # 优先本地缓存（scripts/.cache-l103/<ID>.zip，urllib 的 TLS 在部分网络下不通时先用 curl 下载）；
    # 无缓存时直接联网下载（下载地址见 SOURCES.md 末尾）
    cache = f'scripts/.cache-l103/{asset_id}.zip'
    if os.path.exists(cache):
        print(f'  使用缓存 {cache}')
        data = open(cache, 'rb').read()
    else:
        url = f'https://ambientcg.com/get?file={asset_id}_1K-JPG.zip'
        print(f'  下载 {asset_id} ...')
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        data = urllib.request.urlopen(req, timeout=60).read()
    zf = zipfile.ZipFile(io.BytesIO(data))
    name = next(n for n in zf.namelist() if n.endswith('_Color.jpg') or n.endswith('Color.jpg'))
    return Image.open(io.BytesIO(zf.read(name))).convert('RGB')


def process(img: Image.Image, target_mean: float, rotate: int) -> Image.Image:
    # 居中裁方 → 512×512
    w, h = img.size
    s = min(w, h)
    img = img.crop(((w - s) // 2, (h - s) // 2, (w - s) // 2 + s, (h - s) // 2 + s)).resize((512, 512), Image.LANCZOS)
    if rotate:
        img = img.rotate(rotate)
    # 去色至近中性灰（配合渲染器「顶点色 × 贴图」叠乘）
    img = img.convert('L').convert('RGB')
    # 亮度归一：整体均值缩放到目标
    px = list(img.getdata())
    mean = sum(p[0] for p in px) / len(px) / 255.0
    k = target_mean / mean
    img = img.point(lambda v: max(0, min(255, round(v * k))))
    return img


def main():
    os.makedirs(OUT, exist_ok=True)
    for out_name, (asset_id, target, rotate) in JOBS.items():
        img = process(fetch_color_jpg(asset_id), target, rotate)
        img.save(f'{OUT}/{out_name}', quality=86)
        print(f'  {out_name} <- {asset_id}（亮度归一 {target}）已保存')


if __name__ == '__main__':
    main()
