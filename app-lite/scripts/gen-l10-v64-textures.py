"""Level 10 v64 程序化贴图生成器（可复现，固定随机种子）。

产物（public/textures/）：
  l10_leafcard.png        512×512 RGBA  树篱/树冠用的透明叶簇卡片（灌木小叶 + 细枝）
  l10_canola_clump.png    512×768 RGBA  油菜花丛卡片（绿茎 + 顶部黄色花序）
  l10_corrugated_normal.png 256×256 RGB 波纹钢屋面法线（OpenGL 朝向，沿 U 方向 8 道波）
  l10_siding_diff.jpg     512×512 RGB   谷仓板条墙：竖向宽板 + 压缝条，旧红漆斑驳露出灰木

全部由本脚本从零绘制，无外部素材；许可同项目。运行：python3 scripts/gen-l10-v64-textures.py
"""
import math
import os
import random

from PIL import Image, ImageDraw, ImageFilter

OUT = os.path.join(os.path.dirname(__file__), '..', 'public', 'textures')


def leafcard():
    rnd = random.Random(0x10EAF)
    W = H = 512
    im = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    # 细枝：从底部中心放射
    for _ in range(14):
        a = rnd.uniform(-2.6, -0.5)
        L = rnd.uniform(150, 240)
        x0, y0 = W / 2 + rnd.uniform(-40, 40), H - 30
        x1, y1 = x0 + math.cos(a) * L, y0 + math.sin(a) * L
        d.line([(x0, y0), (x1, y1)], fill=(64, 52, 36, 255), width=3)
    # 叶片：中心更密更暗，边缘稀疏更亮（形成叶簇轮廓）
    for n in range(1500):
        r = (rnd.random() ** 0.62) * 232
        a = rnd.uniform(0, math.tau)
        cx, cy = W / 2 + math.cos(a) * r, H / 2 + math.sin(a) * r * 0.92
        if not (8 < cx < W - 8 and 8 < cy < H - 8):
            continue
        k = r / 232
        base = rnd.choice([(58, 84, 40), (72, 98, 46), (48, 70, 34), (88, 110, 56), (64, 90, 44)])
        lum = 0.55 + 0.6 * k + rnd.uniform(-0.12, 0.12)
        col = tuple(max(0, min(255, int(c * lum))) for c in base) + (255,)
        ll, lw = rnd.uniform(10, 17), rnd.uniform(4.5, 7.5)
        rot = rnd.uniform(0, math.tau)
        pts = []
        for t in range(10):
            u = t / 9 * math.pi
            px, py = math.cos(u) * ll, math.sin(u) * lw
            pts.append((cx + px * math.cos(rot) - py * math.sin(rot), cy + px * math.sin(rot) + py * math.cos(rot)))
        for t in range(10):
            u = math.pi + t / 9 * math.pi
            px, py = math.cos(u) * ll, math.sin(u) * lw
            pts.append((cx + px * math.cos(rot) - py * math.sin(rot), cy + px * math.sin(rot) + py * math.cos(rot)))
        d.polygon(pts, fill=col)
        # 叶脉高光
        hl = tuple(min(255, int(c * 1.25)) for c in col[:3]) + (255,)
        d.line([pts[0], pts[10]], fill=hl, width=1)
    im.save(os.path.join(OUT, 'l10_leafcard.png'))


def canola():
    rnd = random.Random(0xCA401A)
    W, H = 512, 768
    im = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    for _ in range(11):
        x0 = W / 2 + rnd.uniform(-60, 60)
        lean = rnd.uniform(-70, 70)
        top = rnd.uniform(110, 230)
        pts = [(x0 + lean * (t / 20) ** 1.6, H - 10 - (H - 10 - top) * t / 20) for t in range(21)]
        d.line(pts, fill=(78, 112, 52, 255), width=4)
        # 茎生叶
        for t in (6, 10, 13):
            px, py = pts[t]
            s = rnd.choice([-1, 1])
            d.polygon([(px, py), (px + s * 46, py - 22), (px + s * 60, py - 6), (px + s * 20, py + 8)], fill=(70, 104, 50, 255))
        # 顶部总状花序：一团小黄花 + 下方绿色角果
        hx, hy = pts[-1]
        for k in range(8):
            px = hx + rnd.uniform(-10, 10)
            py = hy + 20 + k * 9
            d.line([(px, py), (px + rnd.uniform(-14, 14), py + 16)], fill=(98, 128, 60, 255), width=2)
        for _ in range(70):
            r = rnd.random() ** 0.7 * 36
            a = rnd.uniform(0, math.tau)
            px, py = hx + math.cos(a) * r, hy + math.sin(a) * r * 0.75 - 6
            yc = rnd.choice([(236, 206, 42), (246, 220, 60), (222, 188, 30), (250, 232, 98)])
            rr = rnd.uniform(3.2, 5.6)
            d.ellipse([px - rr, py - rr, px + rr, py + rr], fill=yc + (255,))
    im.save(os.path.join(OUT, 'l10_canola_clump.png'))


def corrugated():
    W = H = 256
    im = Image.new('RGB', (W, H))
    px = im.load()
    for x in range(W):
        u = x / W * 8 * math.tau
        slope = math.cos(u) * 0.55
        n = (-slope, 0.0, 1.0)
        L = math.sqrt(n[0] ** 2 + 1)
        r = int((n[0] / L * 0.5 + 0.5) * 255)
        b = int((1 / L * 0.5 + 0.5) * 255)
        for y in range(H):
            px[x, y] = (r, 128, b)
    im.save(os.path.join(OUT, 'l10_corrugated_normal.png'))


def siding():
    rnd = random.Random(0x5D1)
    W = H = 512
    im = Image.new('RGB', (W, H), (126, 120, 110))
    d = ImageDraw.Draw(im)
    board = W / 4
    for b in range(4):
        x0 = b * board
        g = rnd.randint(-10, 10)
        d.rectangle([x0, 0, x0 + board, H], fill=(124 + g, 118 + g, 108 + g))
        for _ in range(60):  # 木纹
            x = x0 + rnd.uniform(4, board - 4)
            d.line([(x, 0), (x + rnd.uniform(-3, 3), H)], fill=(104 + g, 98 + g, 90 + g), width=1)
    paint = Image.new('L', (W, H), 0)
    pd = ImageDraw.Draw(paint)
    for _ in range(900):
        x, y = rnd.uniform(0, W), rnd.uniform(0, H)
        r = rnd.uniform(6, 26)
        pd.ellipse([x - r, y - r * 2.4, x + r, y + r * 2.4], fill=255)
    paint = paint.filter(ImageFilter.GaussianBlur(2))
    red = Image.new('RGB', (W, H), (148, 52, 40))
    # 灰木为底，红漆按斑驳遮罩叠加；漆面上有竖向雨痕
    im = Image.composite(red, im, paint.point(lambda v: 255 if v > 120 else int(v * 1.2)))
    d = ImageDraw.Draw(im)
    for _ in range(140):
        x = rnd.uniform(0, W)
        y = rnd.uniform(0, H)
        d.line([(x, y), (x, y + rnd.uniform(20, 90))], fill=(98, 40, 32), width=1)
    for b in range(5):  # 压缝条
        x = b * board
        d.rectangle([x - 7, 0, x + 7, H], fill=(118, 44, 34))
        d.line([(x + 7, 0), (x + 7, H)], fill=(70, 28, 22), width=2)
        d.line([(x - 7, 0), (x - 7, H)], fill=(170, 74, 58), width=1)
    im.save(os.path.join(OUT, 'l10_siding_diff.jpg'), quality=90)


if __name__ == '__main__':
    leafcard()
    canola()
    corrugated()
    siding()
    print('ok')
