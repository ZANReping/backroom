#!/usr/bin/env python3
# gen-l5-textures.py —— Level 5「恐怖酒店」贴图（v55，无限化重制配套）。
# 纯 PIL 程序绘制，512×512：
#   l5_carpet.png       红金华丽地毯（深红底 + 金色回纹边框 + 菱形团花）——走廊地面（tint 21）与 rug 结构缺省贴图
#   l5_carpet_blue.png  蓝金华丽地毯变体（藏青底 + 金纹）——大厅/房间地毯块（rug data.tex）
#   l5_tile.png         泳池瓷砖（奶白偏青小方砖 + 灰青砖缝）——游泳池地面（tint 23）
# 从 app/ 目录运行：python scripts/gen-l5-textures.py
import os
import random
from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TEX = os.path.join(ROOT, 'public', 'textures')
W = H = 512


def ornate_carpet(field, border, motif, fname):
    """华丽地毯：底色织纹 + 双层边框 + 四角团花 + 中央菱形团花 + 均布小菱花"""
    rng = random.Random(0x515)
    img = Image.new('RGB', (W, H), field)
    d = ImageDraw.Draw(img)
    # 织纹噪点（经纬细线交错明暗）
    for y in range(0, H, 2):
        for x in range(0, W, 2):
            if rng.random() < 0.5:
                f = rng.uniform(0.9, 1.1)
                d.point((x, y), tuple(min(255, int(c * f)) for c in field))
    # 双层边框（外金内窄线）
    d.rectangle([10, 10, W - 11, H - 11], outline=border, width=10)
    d.rectangle([28, 28, W - 29, H - 29], outline=border, width=3)
    d.rectangle([36, 36, W - 37, H - 37], outline=motif, width=1)
    # 回纹（边框内侧等距小方块）
    for i in range(48, W - 48, 32):
        d.rectangle([i, 44, i + 10, 54], outline=border, width=2)
        d.rectangle([i, H - 55, i + 10, H - 45], outline=border, width=2)
        d.rectangle([44, i, 54, i + 10], outline=border, width=2)
        d.rectangle([W - 55, i, W - 45, i + 10], outline=border, width=2)
    # 四角团花（小菱形）
    for cx, cy in [(96, 96), (W - 96, 96), (96, H - 96), (W - 96, H - 96)]:
        d.polygon([(cx, cy - 22), (cx + 22, cy), (cx, cy + 22), (cx - 22, cy)], outline=border, width=3)
        d.polygon([(cx, cy - 10), (cx + 10, cy), (cx, cy + 10), (cx - 10, cy)], outline=motif, width=2)
    # 中央菱形团花（三层套菱 + 圆心）
    cx = cy = W // 2
    for r, wd, c in [(110, 4, border), (82, 2, motif), (54, 3, border)]:
        d.polygon([(cx, cy - r), (cx + r, cy), (cx, cy + r), (cx - r, cy)], outline=c, width=wd)
    d.ellipse([cx - 16, cy - 16, cx + 16, cy + 16], outline=motif, width=3)
    # 均布小菱花（团花之间）
    for gx in range(128, W - 96, 64):
        for gy in range(128, H - 96, 64):
            if abs(gx - cx) < 130 and abs(gy - cy) < 130:
                continue
            d.polygon([(gx, gy - 8), (gx + 8, gy), (gx, gy + 8), (gx - 8, gy)], outline=motif, width=1)
    img.save(os.path.join(TEX, fname))
    print('生成', fname)


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


ornate_carpet((94, 26, 30), (176, 138, 74), (208, 172, 100), 'l5_carpet.png')      # 红金
ornate_carpet((26, 38, 74), (176, 148, 84), (200, 170, 108), 'l5_carpet_blue.png') # 蓝金
pool_tile('l5_tile.png')
