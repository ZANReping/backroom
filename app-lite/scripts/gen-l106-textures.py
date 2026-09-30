# M.E.G. Gamma 基地（id 106，v54 真三层单图据点）贴图下载与处理（ambientCG CC0，流程同 SOURCES.md 既有条目）：
# 下载 1K JPG → 居中裁方 → 512×512 → 去色至近中性灰 → 亮度归一 → JPEG q86
# 素材选择（全新下载，不复用既有素材；占用清单见 SOURCES.md）：
#   墙=PaintedPlaster017（浅色涂装粉刷——MEG 基地公共/行政风）；
#   地=Tiles006（办公地砖——2F/3F 楼板顶面同走本贴图，见 geometry 多层楼板规则）；
#   顶=PaintedPlaster015（涂装粉刷吊顶——OfficeCeiling 系列 001-006 均被占，选涂装粉刷素顶；
#                        兼作 2F/3F 楼板底面=下一层天花的统一纹理）
# 用法：cd app && python scripts/gen-l106-textures.py（本机 TLS 需 curl --tlsv1.2 -k 先入库缓存）
import io
import os
import zipfile
import urllib.request

from PIL import Image

OUT = 'public/textures'
# 文件 → (ambientCG 素材 ID, 亮度归一目标均值, 旋转角度)
JOBS = {
    'l106_wall.jpg': ('PaintedPlaster017', 0.78, 0),  # 浅色涂装粉刷墙
    'l106_floor.jpg': ('Tiles006', 0.74, 0),          # 办公地砖（含 2F/3F 楼板顶面）
    'l106_ceil.jpg': ('PaintedPlaster015', 0.84, 0),  # 涂装粉刷吊顶（兼作上层楼板底面）
}


def fetch_color_jpg(asset_id: str) -> Image.Image:
    # 优先本地缓存（scripts/.cache-l106/<ID>.zip——本机 TLS 被截断，
    # 先用 `curl --tlsv1.2 -k -L -o scripts/.cache-l106/<ID>.zip https://ambientcg.com/get?file=<ID>_1K-JPG.zip` 入库）；
    # 无缓存时直接联网下载（下载地址见 SOURCES.md 末尾）
    cache = f'scripts/.cache-l106/{asset_id}.zip'
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
