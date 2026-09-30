#!/usr/bin/env python3
# gen-l6-l11-textures.py —— v53：L6~L11 地形贴图 + 房顶/楼体贴图 + EL3A 二层贴图
#
# 全部素材来自 ambientCG（CC0），下载→居中裁方 512→去色至近中性灰→亮度归一→JPEG q86，
# 与既有层级同一「顶点色 × 贴图」叠乘管线（加载失败渲染器自动回退程序噪点，见 levelTexture）。
# 本机 TLS 被截断，curl 需 --tlsv1.2 -k（302 跳转为正常）；缓存 scripts/.cache-l6-l11/。
#
# 素材 ID 与占用冲突检查：已占用（SOURCES.md 各节）Concrete034/046/048/030、Plaster002~006、
# Tiles002/107、OfficeCeiling001~004、CorrugatedSteel009、Bricks051/059、PavingStones128、
# Marble012、Planks037A/039、Metal032、WoodFloor043 一律避开；本批 25 个 ID 互不重复。
#
#   文件              素材              用途                              亮度归一
#   l6_wall.jpg       Concrete033       L6 熄灯：深色混凝土墙              0.74
#   l6_floor.jpg      Concrete026       L6 地面（旧混凝土）                0.68
#   l6_ceil.jpg       Concrete032       L6 天花板                          0.78
#   l7_wall.jpg       Concrete035       L7 深海恐惧：水渍感混凝土墙        0.72
#   l7_floor.jpg      Concrete038       L7 地面（被淹混凝土）              0.66
#   l7_ceil.jpg       Concrete031       L7 天花板                          0.78
#   l8_wall.jpg       Rock035           L8 洞穴：岩壁                      0.74
#   l8_floor.jpg      Rock022           L8 洞底                            0.68
#   l8_ceil.jpg       Rock045           L8 洞顶                            0.76
#   l9_wall.jpg       WoodSiding010     L9 郊区：房屋木挂板外墙            0.74
#   l9_floor.jpg      Asphalt022        L9 街道沥青地面                    0.66
#   l9_ceil.jpg       Plaster007        L9 室内粉刷天花                    0.80
#   l10_wall.jpg      Planks003         L10 丰收：谷仓木板墙               0.74
#   l10_floor.jpg     Ground054         L10 泥土地面                       0.64
#   l10_ceil.jpg      Planks005         L10 谷仓内顶（木板）               0.78
#   l11_wall.jpg      Bricks042         L11 不夜城：临街砖墙               0.74
#   l11_floor.jpg     Asphalt019        L11 街道沥青地面                   0.66
#   l11_ceil.jpg      OfficeCeiling006  L11 室内办公吊顶                   0.80
#   l9_roof.jpg       RoofingTiles002   L9 房屋双坡瓦顶（structures house）0.72
#   l10_roof.jpg      CorrugatedSteel005 L10 谷仓金属屋顶（structures barn）0.72
#   l11_tower.jpg     Concrete039       L11 楼体混凝土立面（towerblock）   0.72
#   l11_roof.jpg      Concrete045       L11 屋顶板（平板混凝土）           0.72
#   l105_upwall.jpg   Plaster001        EL3A 二层办公区隔墙                0.78
#   l105_upceil.jpg   OfficeCeiling005  EL3A 二层办公吊顶                  0.82
#   l105_upfloor.jpg  Carpet002         EL3A 二层办公地毯（夹楼板上表面）  0.72
#
# 从 app/ 目录运行：python scripts/gen-l6-l11-textures.py
import os
import subprocess
import io
import zipfile
from PIL import Image, ImageEnhance

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TEX = os.path.join(ROOT, 'public', 'textures')
CACHE = os.path.join(ROOT, 'scripts', '.cache-l6-l11')
SIZE = 512

# 文件名 → (ambientCG ID, 亮度归一目标)
JOBS = {
    'l6_wall':      ('Concrete033', 0.74),
    'l6_floor':     ('Concrete026', 0.68),
    'l6_ceil':      ('Concrete032', 0.78),
    'l7_wall':      ('Concrete035', 0.72),
    'l7_floor':     ('Concrete038', 0.66),
    'l7_ceil':      ('Concrete031', 0.78),
    'l8_wall':      ('Rock035', 0.74),
    'l8_floor':     ('Rock022', 0.68),
    'l8_ceil':      ('Rock045', 0.76),
    'l9_wall':      ('WoodSiding010', 0.74),
    'l9_floor':     ('Asphalt022', 0.66),
    'l9_ceil':      ('Plaster007', 0.80),
    'l10_wall':     ('Planks003', 0.74),
    'l10_floor':    ('Ground054', 0.64),
    'l10_ceil':     ('Planks005', 0.78),
    'l11_wall':     ('Bricks042', 0.74),
    'l11_floor':    ('Asphalt019', 0.66),
    'l11_ceil':     ('OfficeCeiling006', 0.80),
    'l9_roof':      ('RoofingTiles002', 0.72),
    'l10_roof':     ('CorrugatedSteel005', 0.72),
    'l11_tower':    ('Concrete039', 0.72),
    'l11_roof':     ('Concrete045', 0.72),
    'l105_upwall':  ('Plaster001', 0.78),
    'l105_upceil':  ('OfficeCeiling005', 0.82),
    'l105_upfloor': ('Carpet002', 0.72),
}


def fetch_acg(file_id):
    """ambientCG Color 图（CC0）。本机 TLS 被截断，curl 需 --tlsv1.2 -k；缓存 scripts/.cache-l6-l11/。"""
    cache = os.path.join(CACHE, f'{file_id}.zip')
    if not os.path.exists(cache):
        os.makedirs(CACHE, exist_ok=True)
        subprocess.run(['curl', '-sL', '--tlsv1.2', '-k', '-A', 'Mozilla/5.0', '--max-time', '120',
                        '-o', cache, f'https://ambientcg.com/get?file={file_id}_1K-JPG.zip'], check=True)
    return Image.open(io.BytesIO(zipfile.ZipFile(cache).read(f'{file_id}_1K-JPG_Color.jpg'))).convert('RGB')


def crop_square(img):
    """居中裁方（ambientCG 1K 多为正方形，此处保底非方素材）"""
    w, h = img.size
    s = min(w, h)
    return img.crop(((w - s) // 2, (h - s) // 2, (w + s) // 2, (h + s) // 2))


def normalize_mean(img, target):
    """去色至近中性灰 + 全局均值归一（顶点色叠乘管线惯例，同 gen-l3/l105/l274）"""
    g = img.convert('L').convert('RGB')
    import numpy as np
    mean = np.asarray(g, dtype=float).mean() / 255
    return ImageEnhance.Brightness(g).enhance(target / max(mean, 1e-3))


def main():
    for name, (file_id, target) in JOBS.items():
        img = normalize_mean(crop_square(fetch_acg(file_id)).resize((SIZE, SIZE), Image.LANCZOS), target)
        img.save(os.path.join(TEX, f'{name}.jpg'), quality=86)
        print('written', f'{name}.jpg', f'({file_id}, 归一 {target})')


if __name__ == '__main__':
    main()
