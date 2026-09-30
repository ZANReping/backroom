#!/usr/bin/env python3
# 生成 Level 7 入口房间的金属舱体无缝贴图（原创程序化材质，无版权负担）。
# 输出：public/textures/l7_cabin_metal.jpg（1024×1024，锈蚀钢板 + 拼板焊缝 + 铆钉 + 划痕/流锈）
import math, random
from PIL import Image, ImageDraw, ImageFilter

S = 1024
img = Image.new('RGB', (S, S), (58, 62, 66))
px = img.load()
rnd = random.Random(20260815)

# 基础钢板的低频明暗与颗粒
for y in range(S):
    for x in range(S):
        n = 0
        for (wx, wy, w, amp) in [(97, 131, 0.5, 22), (211, 307, 0.3, 16), (409, 193, 0.22, 11), (787, 617, 0.16, 8)]:
            n += math.sin(x / S * math.pi * 2 * wx / 97 + y / S * math.pi * 2 * wy / 97) * amp
        grain = rnd.uniform(-7, 7)
        v = 58 + n + grain
        px[x, y] = (int(v * 1.02), int(v * 1.04), int(v * 1.10))

# 横向/纵向拼板接缝（每 256px 一块大板，缝内做焊疤与铆钉行）
draw = ImageDraw.Draw(img, 'RGBA')
seam = (36, 38, 40, 255)
edge = (30, 31, 33, 255)
for i in range(0, S + 1, 256):
    if i > 0:
        # 竖直焊缝
        for k in range(-3, 4):
            draw.line([(i + k, 0), (i + k, S)], fill=seam if k == 0 else (44, 46, 49, 200), width=1)
        for k in range(-1, 2):
            draw.line([(i + k, 0), (i + k, S)], fill=edge, width=1)
        # 铆钉列
        for y in range(64, S, 128):
            for k in (-1, 1):
                x = i + k * 22
                draw.ellipse([x - 5, y - 5, x + 5, y + 5], fill=(34, 36, 39, 255), outline=(74, 78, 82, 255), width=2)
                draw.point((x - 1, y - 1), fill=(92, 96, 100, 255))
    # 横向焊缝
    for k in range(-3, 4):
        draw.line([(0, i + k), (S, i + k)], fill=seam if k == 0 else (44, 46, 49, 200), width=1)
    for k in range(-1, 2):
        draw.line([(0, i + k), (S, i + k)], fill=edge, width=1)
    for x in range(64, S, 128):
        for k in (-1, 1):
            y = i + k * 22
            draw.ellipse([x - 5, y - 5, x + 5, y + 5], fill=(34, 36, 39, 255), outline=(74, 78, 82, 255), width=2)
            draw.point((x - 1, y - 1), fill=(92, 96, 100, 255))

# 每块板内小铆钉
for y0 in range(0, S, 256):
    for x0 in range(0, S, 256):
        for y in range(48, 256, 80):
            for x in range(48, 256, 80):
                xx, yy = x0 + x + rnd.randint(-6, 6), y0 + y + rnd.randint(-6, 6)
                draw.ellipse([xx - 3, yy - 3, xx + 3, yy + 3], fill=(42, 44, 47, 255), outline=(80, 84, 88, 255), width=1)

# 划痕与磕碰
for _ in range(420):
    x, y = rnd.randrange(S), rnd.randrange(S)
    a = rnd.uniform(0, math.pi * 2)
    ln = rnd.randint(8, 55)
    x2 = int(x + math.cos(a) * ln) % S
    y2 = int(y + math.sin(a) * ln) % S
    draw.line([(x, y), (x2, y2)], fill=(rnd.randint(88, 118), rnd.randint(90, 120), rnd.randint(94, 124), rnd.randint(90, 190)), width=1)

# 流锈：从焊缝向下拉长的暗橙污迹
for _ in range(240):
    x = rnd.randrange(S)
    y0 = rnd.choice([i + rnd.randint(-8, 8) for i in range(0, S + 1, 256)])
    ln = rnd.randint(20, 130)
    color = (rnd.randint(70, 96), rnd.randint(48, 60), rnd.randint(34, 44), rnd.randint(28, 70))
    draw.line([(x, y0), (x + rnd.randint(-12, 12), (y0 + ln) % S)], fill=color, width=rnd.randint(1, 3))

# 污渍斑块
for _ in range(130):
    x, y = rnd.randrange(S), rnd.randrange(S)
    r = rnd.randint(8, 42)
    c = rnd.choice([(40, 44, 40), (62, 54, 44), (52, 50, 48)])
    alpha = rnd.randint(24, 55)
    layer = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    ImageDraw.Draw(layer).ellipse([x - r, y - r, x + r, y + r], fill=(c[0], c[1], c[2], alpha))
    img = Image.alpha_composite(img.convert('RGBA'), layer).convert('RGB')
    px = img.load()

img = img.filter(ImageFilter.GaussianBlur(0.4))
# 无缝处理：沿 0/S 边界做 4px 淡出，拼板接缝本身周期为 256 保证可平铺
img = img.convert('RGB')
for i in range(4):
    band = img.crop((0, S - 4 + i, S, S - 3 + i)).filter(ImageFilter.GaussianBlur(2))
    img.paste(band, (0, S - 4 + i))
    img.paste(band, (0, i))
    band2 = img.crop((S - 4 + i, 0, S - 3 + i, S)).filter(ImageFilter.GaussianBlur(2))
    img.paste(band2, (S - 4 + i, 0))
    img.paste(band2, (i, 0))
img.save('public/textures/l7_cabin_metal.jpg', quality=90)
print('saved public/textures/l7_cabin_metal.jpg', img.size)
