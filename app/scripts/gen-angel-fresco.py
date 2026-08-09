#!/usr/bin/env python3
# gen-angel-fresco.py —— Level 3 圣所/栅栏后宗教画像贴图（wikidot L3：砖墙上覆盖白色画布状材质，
# 绘有圣所天使神祇；创作年代相当新近）。纯 PIL 程序绘制，512×640 竖幅画布。
# 从 app/ 目录运行：python scripts/gen-angel-fresco.py
import os
import random
from PIL import Image, ImageDraw, ImageFilter, ImageEnhance

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'public', 'textures', 'angel_fresco.png')
W, H = 512, 640
rng = random.Random(7)

img = Image.new('RGB', (W, H), (196, 188, 168))  # 旧画布底色（泛黄白）
d = ImageDraw.Draw(img)

# 画布老化：斑驳底色
for _ in range(260):
    x, y = rng.uniform(0, W), rng.uniform(0, H)
    r = rng.uniform(6, 42)
    v = rng.randint(-26, 18)
    base = (196 + v, 188 + v, 168 + v)
    d.ellipse([x - r, y - r * 0.6, x + r, y + r * 0.6], fill=base)
img = img.filter(ImageFilter.GaussianBlur(2))
d = ImageDraw.Draw(img)

# 圣光（神像背后暖色晕）
for r in range(200, 20, -8):
    a = int(40 * (1 - r / 200))
    d.ellipse([W / 2 - r, 210 - r, W / 2 + r, 210 + r], fill=(196 + a, 188 + a // 2, 168))

dark = (58, 48, 40)
mid = (96, 82, 66)
cx = W / 2

# 天使剪影（长袍立像 + 展翼 + 吹号）——粗犷色块，远看辨形
# 双翼（上展的两大片）
d.polygon([(cx - 20, 250), (cx - 150, 120), (cx - 190, 150), (cx - 60, 290)], fill=mid)
d.polygon([(cx + 20, 250), (cx + 150, 120), (cx + 190, 150), (cx + 60, 290)], fill=mid)
d.polygon([(cx - 18, 255), (cx - 130, 150), (cx - 155, 172), (cx - 55, 295)], fill=dark)
d.polygon([(cx + 18, 255), (cx + 130, 150), (cx + 155, 172), (cx + 55, 295)], fill=dark)
# 头 + 光环
d.ellipse([cx - 26, 170, cx + 26, 222], fill=dark)
d.ellipse([cx - 40, 150, cx + 40, 168], fill=mid)
# 躯干长袍（上窄下宽的垂坠三角）
d.polygon([(cx - 34, 220), (cx + 34, 220), (cx + 66, 520), (cx - 66, 520)], fill=dark)
# 袍褶竖纹
for i in range(-2, 3):
    x0 = cx + i * 20
    d.line([(x0, 260), (x0 + i * 6, 510)], fill=mid, width=5)
# 手臂前伸吹号（号管斜上）
d.polygon([(cx + 10, 240), (cx + 90, 205), (cx + 94, 220), (cx + 16, 258)], fill=dark)
d.line([(cx + 60, 218), (cx + 150, 165)], fill=dark, width=10)
d.polygon([(cx + 150, 155), (cx + 185, 145), (cx + 178, 185), (cx + 148, 180)], fill=dark)  # 喇叭口
# 基座
d.rectangle([cx - 90, 520, cx + 90, 560], fill=mid)
d.rectangle([cx - 100, 560, cx + 100, 590], fill=dark)

# 风化：竖向水渍流痕 + 边缘磨损
for _ in range(46):
    x = rng.uniform(0, W)
    y0 = rng.uniform(0, H * 0.5)
    ln = rng.uniform(60, 300)
    v = rng.choice([(150, 140, 122), (120, 108, 92), (210, 204, 186)])
    d.line([(x, y0), (x + rng.uniform(-6, 6), y0 + ln)], fill=v, width=rng.randint(2, 7))
for _ in range(90):  # 边缘虫蛀/磨损点
    x = rng.choice([rng.uniform(0, 26), rng.uniform(W - 26, W), rng.uniform(0, W)])
    y = rng.choice([rng.uniform(0, 20), rng.uniform(H - 20, H)]) if x > 26 and x < W - 26 else rng.uniform(0, H)
    r = rng.uniform(1, 5)
    d.ellipse([x - r, y - r, x + r, y + r], fill=(110, 98, 82))

img = ImageEnhance.Contrast(img).enhance(0.94)
img.save(OUT)
print('written', OUT)
