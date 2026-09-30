#!/usr/bin/env python3
# gen-l5-textures.py —— Level 5「恐怖酒店」程序贴图。
# 地毯已改用 public/textures/SOURCES.md 登记的 CC0 真实 PBR 素材，本脚本只生成泳池瓷砖，
# 避免误覆盖 l5_carpet*.jpg 正式材质。
# 从 app/ 目录运行：python scripts/gen-l5-textures.py
import os
import random
from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TEX = os.path.join(ROOT, 'public', 'textures')
W = H = 512


def pool_tile(fname):
    """泳池瓷砖：奶白偏青小方砖 + 灰青砖缝 + 轻微色差"""
    rng = random.Random(0x517)
    img = Image.new('RGB', (W, H), (188, 200, 198))
    d = ImageDraw.Draw(img)
    t = 32  # 砖块边长
    for ty in range(0, H, t):
        for tx in range(0, W, t):
            f = rng.uniform(0.94, 1.06)
            base = (222, 230, 226) if (tx // t + ty // t) % 2 == 0 else (214, 226, 224)
            c = tuple(min(255, int(v * f)) for v in base)
            d.rectangle([tx + 1, ty + 1, tx + t - 2, ty + t - 2], fill=c)
    img.save(os.path.join(TEX, fname))
    print('生成', fname)


pool_tile('l5_tile.png')
