#!/usr/bin/env python3
# gen-l3-stainedglass.py —— Level 3 圣所彩色玻璃花窗贴图（v53b，stainedglass 结构用）。
# 参考图三联窗：红翼持天平天使 / 三天使吹号 / 金翼持心天使。
# 纯 PIL 程序绘制，512×768 竖长尖拱窗（铅条分格 + 彩玻块 + 深色剪影人物）。
# 从 app/ 目录运行：python scripts/gen-l3-stainedglass.py
import os
import random
from PIL import Image, ImageDraw, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TEX = os.path.join(ROOT, 'public', 'textures')
W, H = 512, 768
LEAD = (18, 14, 12)  # 铅条


def base_window(seed, bg_cols):
    """尖拱窗底：彩玻碎块拼底 + 铅条网格 + 尖拱外缘涂黑（墙）"""
    rng = random.Random(seed)
    img = Image.new('RGB', (W, H), LEAD)
    d = ImageDraw.Draw(img)
    # 彩玻碎块（不规则多边形拼底）
    for _ in range(420):
        x, y = rng.uniform(0, W), rng.uniform(0, H)
        r = rng.uniform(10, 34)
        c = bg_cols[rng.randrange(len(bg_cols))]
        pts = [(x + rng.uniform(-r, r), y + rng.uniform(-r, r)) for _ in range(5)]
        d.polygon(pts, fill=c)
    img = img.filter(ImageFilter.GaussianBlur(3))
    d = ImageDraw.Draw(img)
    # 铅条网格（竖横 + 斜分格）
    for x in range(0, W + 1, 64):
        d.line([(x, 0), (x, H)], fill=LEAD, width=5)
    for y in range(0, H + 1, 64):
        d.line([(0, y), (W, y)], fill=LEAD, width=5)
    for x in range(0, W + 1, 64):
        for y in range(0, H + 1, 64):
            d.line([(x, y), (x + 64, y + 64)], fill=LEAD, width=3)
    return img, d, rng


def arch_mask(d):
    """尖拱外缘涂黑（墙洞外的砖石）"""
    d.polygon([(0, 0), (W, 0), (W, 150), (W // 2, 20), (0, 150)], fill=None)  # noop 占位
    # 左右上角切出尖拱：两角填黑，顶部中央留尖
    d.polygon([(0, 0), (W // 2, 26), (0, 170)], fill=(10, 8, 7))
    d.polygon([(W, 0), (W // 2, 26), (W, 170)], fill=(10, 8, 7))
    d.rectangle([0, 0, 12, H], fill=(10, 8, 7))
    d.rectangle([W - 12, 0, W, H], fill=(10, 8, 7))


def halo(d, cx, cy, r, col):
    d.ellipse([cx - r, cy - r, cx + r, cy + r], outline=col, width=6)


def angel(d, cx, cy, scale, robe, wing, skin, pose='stand'):
    """简化天使剪影：展翼 + 长袍 + 头 + 光环。pose: stand/trumpet/scales/heart"""
    s = scale
    # 翼
    d.polygon([(cx - 8 * s, cy - 30 * s), (cx - 78 * s, cy - 95 * s), (cx - 95 * s, cy - 60 * s), (cx - 30 * s, cy + 5 * s)], fill=wing)
    d.polygon([(cx + 8 * s, cy - 30 * s), (cx + 78 * s, cy - 95 * s), (cx + 95 * s, cy - 60 * s), (cx + 30 * s, cy + 5 * s)], fill=wing)
    # 袍
    d.polygon([(cx - 20 * s, cy - 20 * s), (cx + 20 * s, cy - 20 * s), (cx + 34 * s, cy + 105 * s), (cx - 34 * s, cy + 105 * s)], fill=robe)
    for i in range(-1, 2):  # 袍褶铅线
        d.line([(cx + i * 12 * s, cy - 10 * s), (cx + i * 16 * s, cy + 100 * s)], fill=LEAD, width=3)
    # 头 + 光环
    d.ellipse([cx - 13 * s, cy - 52 * s, cx + 13 * s, cy - 26 * s], fill=skin)
    halo(d, cx, cy - 52 * s, 20 * s, (226, 200, 110))
    # 手臂/持物
    if pose == 'trumpet':
        d.line([(cx + 8 * s, cy - 16 * s), (cx + 40 * s, cy - 44 * s)], fill=skin, width=int(6 * s))
        d.line([(cx + 34 * s, cy - 48 * s), (cx + 66 * s, cy - 66 * s)], fill=(200, 170, 80), width=int(5 * s))
        d.polygon([(cx + 62 * s, cy - 76 * s), (cx + 82 * s, cy - 82 * s), (cx + 78 * s, cy - 58 * s), (cx + 60 * s, cy - 62 * s)], fill=(200, 170, 80))
    elif pose == 'scales':
        d.line([(cx - 8 * s, cy - 16 * s), (cx - 44 * s, cy - 42 * s)], fill=skin, width=int(6 * s))
        d.line([(cx - 44 * s, cy - 66 * s), (cx - 44 * s, cy - 18 * s)], fill=(212, 186, 90), width=int(4 * s))  # 秤杆
        d.line([(cx - 66 * s, cy - 56 * s), (cx - 22 * s, cy - 56 * s)], fill=(212, 186, 90), width=int(4 * s))
        for sx in (-66, -22):  # 秤盘
            d.line([(cx + sx * s, cy - 56 * s), (cx + (sx - 8) * s, cy - 28 * s)], fill=(212, 186, 90), width=2)
            d.line([(cx + sx * s, cy - 56 * s), (cx + (sx + 8) * s, cy - 28 * s)], fill=(212, 186, 90), width=2)
            d.ellipse([cx + (sx - 11) * s, cy - 30 * s, cx + (sx + 11) * s, cy - 18 * s], fill=(212, 186, 90))
    elif pose == 'heart':
        d.line([(cx - 8 * s, cy - 14 * s), (cx - 26 * s, cy + 6 * s)], fill=skin, width=int(6 * s))
        hx, hy = cx - 30 * s, cy + 10 * s  # 胸前红心
        d.polygon([(hx, hy + 10 * s), (hx - 12 * s, hy - 4 * s), (hx - 6 * s, hy - 12 * s), (hx, hy - 6 * s),
                   (hx + 6 * s, hy - 12 * s), (hx + 12 * s, hy - 4 * s)], fill=(168, 40, 40))


def finish(img, name):
    d = ImageDraw.Draw(img)
    arch_mask(d)
    img.save(os.path.join(TEX, name))
    print('written', name)


# 1) 红翼持天平天使（蓝灰背景）
img, d, rng = base_window(11, [(60, 70, 92), (74, 84, 110), (52, 60, 80), (90, 100, 124)])
angel(d, W // 2, 400, 1.7, robe=(70, 76, 96), wing=(148, 34, 34), skin=(206, 198, 180), pose='scales')
d.line([(0, 640), (W, 640)], fill=LEAD, width=6)  # 底部铭文带
for i in range(6):
    d.line([(60 + i * 70, 660), (100 + i * 70, 660)], fill=(180, 172, 150), width=3)
finish(img, 'l3_glass_scales.png')

# 2) 三天使吹号（金绿背景）
img, d, rng = base_window(23, [(96, 88, 52), (110, 100, 60), (80, 88, 56), (120, 108, 66)])
angel(d, W // 2, 380, 1.55, robe=(216, 208, 188), wing=(196, 160, 70), skin=(224, 214, 192), pose='trumpet')
angel(d, W // 2 - 125, 430, 1.15, robe=(200, 192, 172), wing=(176, 140, 60), skin=(214, 204, 184), pose='trumpet')
angel(d, W // 2 + 125, 430, 1.15, robe=(200, 192, 172), wing=(176, 140, 60), skin=(214, 204, 184), pose='stand')
finish(img, 'l3_glass_trumpets.png')

# 3) 金翼持心天使（青绿背景）
img, d, rng = base_window(37, [(52, 84, 72), (60, 96, 80), (44, 72, 64), (70, 104, 88)])
angel(d, W // 2, 390, 1.7, robe=(198, 168, 84), wing=(216, 148, 48), skin=(218, 206, 184), pose='heart')
# 底部花草带
for i in range(8):
    x = 50 + i * 55
    d.line([(x, 660), (x, 690)], fill=(40, 70, 40), width=4)
    d.ellipse([x - 8, 648, x + 8, 664], fill=(160, 60, 80))
finish(img, 'l3_glass_heart.png')
