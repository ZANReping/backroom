# 办公区EL3A（BNTG 物流中转站据点）贴图下载与处理（ambientCG CC0，流程同 SOURCES.md 既有条目）：
# 下载 1K JPG → 居中裁方 → 512×512 → 去色至近中性灰 → 亮度归一 → JPEG q86
# v49：l105_wall 定制款——波纹钢底 + PIL 叠加 BNTG 深绿水平饰条 + 底部黄黑安全标识带（辨识度↑）
# 用法：cd app && python scripts/gen-l105-textures.py
import io
import os
import zipfile
import urllib.request

from PIL import Image, ImageDraw

OUT = 'public/textures'
# 文件 → (ambientCG 素材 ID, 亮度归一目标均值, 旋转角度, 定制叠加)
JOBS = {
    'l105_wall.jpg': ('CorrugatedSteel009', 0.72, 0, 'bntg_band'),  # 工业墙（波纹钢 + BNTG 绿饰条/安全标识带；灰绿乘色见 lel3a palette）
    'l105_floor.jpg': ('Concrete046', 0.66, 0, None),               # 仓库混凝土地面
    'l105_ceil.jpg': ('OfficeCeiling001', 0.80, 0, None),           # 吊顶（素面吊顶；兼作夹楼板底面统一纹理）
}


def fetch_color_jpg(asset_id: str) -> Image.Image:
    # 优先本地缓存（scripts/.cache-l105/<ID>.zip，urllib 的 TLS 在部分网络下不通时先用 curl 下载）；
    # 无缓存时直接联网下载（下载地址见 SOURCES.md 末尾）
    cache = f'scripts/.cache-l105/{asset_id}.zip'
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


def overlay_bntg_band(img: Image.Image) -> Image.Image:
    # v49 定制款（BNTG 仓库墙面涂装）：BNTG 深绿水平饰条（漆感双亮边）+ 底部黄黑 45° 安全标识带。
    # 水平带横向均匀 → 左右天然无缝；斜纹周期 64px 整除 512 → 平铺接缝对齐。
    # （墙面 UV：贴图上行=墙顶——饰条约在 3.0m 墙的 1.6m 高 / 5.6m 挑高墙的 3.0m 高处）
    d = ImageDraw.Draw(img)
    w = img.size[0]
    # 主饰条：BNTG 深绿水平带 y240..296（上亮边 4px + 下暗边 4px 出漆面厚度）
    d.rectangle([0, 240, w, 296], fill=(46, 74, 56))
    d.rectangle([0, 240, w, 244], fill=(92, 118, 96))
    d.rectangle([0, 292, w, 296], fill=(28, 46, 36))
    # 安全标识带：黄黑 45° 斜纹 y430..458（近墙根；周期 64px）
    d.rectangle([0, 430, w, 458], fill=(36, 34, 30))
    for x in range(-64, w + 64, 64):
        d.polygon([(x, 458), (x + 28, 430), (x + 56, 430), (x + 28, 458)], fill=(198, 158, 34))
    return img


def main():
    os.makedirs(OUT, exist_ok=True)
    for out_name, (asset_id, target, rotate, custom) in JOBS.items():
        img = process(fetch_color_jpg(asset_id), target, rotate)
        if custom == 'bntg_band':
            img = overlay_bntg_band(img)
        img.save(f'{OUT}/{out_name}', quality=86)
        print(f'  {out_name} <- {asset_id}（亮度归一 {target}' + (f' + 定制叠加 {custom}' if custom else '') + '）已保存')


if __name__ == '__main__':
    main()
