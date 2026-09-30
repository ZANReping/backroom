# 蓝色救赎（杰瑞的信众圣所据点，id 108，v54）贴图下载与处理（ambientCG CC0，流程同 SOURCES.md）：
# 下载 1K JPG → 居中裁方 → 512×512 → 去色 → 蓝乘色（蓝白圣辉系，同 l274 处理惯例）→ 亮度归一 → JPEG q86
# 素材选择（全新下载，不复用既有素材——l274 用过的 Bricks051/PavingStones128 不复用；占用清单见 SOURCES.md）：
#   墙=Bricks060（石墙→蓝灰乘色）；地=PavingStones142（石板→蓝灰乘色）；顶=PaintedPlaster013（吊顶→蓝乘色）
# 用法：cd app && python scripts/gen-l108-textures.py（本机 TLS 需 curl --tlsv1.2 -k 先入库缓存）
import io
import os
import zipfile
import urllib.request

from PIL import Image

OUT = 'public/textures'
# 文件 → (ambientCG 素材 ID, 蓝乘色, 亮度归一目标均值)
JOBS = {
    'l108_wall.jpg': ('Bricks060', '#a2aad6', 0.74),        # 蓝灰石墙（圣所石砌；圣辉蓝）
    'l108_floor.jpg': ('PavingStones142', '#8a92c8', 0.70), # 蓝灰石板地面
    'l108_ceil.jpg': ('PaintedPlaster013', '#8a92c8', 0.80),# 蓝色吊顶
}


def hex_mul(hex_color: str) -> tuple[float, float, float]:
    h = hex_color.lstrip('#')
    return tuple(int(h[i:i + 2], 16) / 255.0 for i in (0, 2, 4))  # type: ignore[return-value]


def fetch_color_jpg(asset_id: str) -> Image.Image:
    # 优先本地缓存（scripts/.cache-l108/<ID>.zip——本机 TLS 被截断，
    # 先用 `curl --tlsv1.2 -k -L -o scripts/.cache-l108/<ID>.zip https://ambientcg.com/get?file=<ID>_1K-JPG.zip` 入库）；
    # 无缓存时直接联网下载（下载地址见 SOURCES.md 末尾）
    cache = f'scripts/.cache-l108/{asset_id}.zip'
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


def process(img: Image.Image, blue: tuple[float, float, float], target_mean: float) -> Image.Image:
    # 居中裁方 → 512×512
    w, h = img.size
    s = min(w, h)
    img = img.crop(((w - s) // 2, (h - s) // 2, (w - s) // 2 + s, (h - s) // 2 + s)).resize((512, 512), Image.LANCZOS)
    # 去色（蓝移在灰底上进行，圣所冷调均匀）
    img = img.convert('L').convert('RGB')
    # 蓝乘色（蓝白圣辉系：R/G 压低、B 微压——灰底蓝移）
    r, g, b = img.split()
    r = r.point(lambda v: max(0, min(255, round(v * blue[0]))))
    g = g.point(lambda v: max(0, min(255, round(v * blue[1]))))
    b = b.point(lambda v: max(0, min(255, round(v * blue[2]))))
    img = Image.merge('RGB', (r, g, b))
    # 亮度归一：整体均值缩放到目标（补偿蓝乘色的压暗）
    px = list(img.getdata())
    mean = sum((p[0] + p[1] + p[2]) / 3 for p in px) / len(px) / 255.0
    k = target_mean / mean
    chans = []
    for c in img.split():
        chans.append(c.point(lambda v: max(0, min(255, round(v * k)))))
    return Image.merge('RGB', chans)


def main():
    os.makedirs(OUT, exist_ok=True)
    for out_name, (asset_id, blue_hex, target) in JOBS.items():
        img = process(fetch_color_jpg(asset_id), hex_mul(blue_hex), target)
        img.save(f'{OUT}/{out_name}', quality=86)
        print(f'  {out_name} <- {asset_id}（蓝乘色 {blue_hex} · 亮度归一 {target}）已保存')


if __name__ == '__main__':
    main()
