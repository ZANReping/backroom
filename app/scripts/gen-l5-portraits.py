#!/usr/bin/env python3
# gen-l5-portraits.py —— Level 5「恐怖酒店」古典肖像画贴图（v55，bigpainting data.tex 用）。
# 纯 PIL 程序绘制（暗色古典配色 + 剪影人物），512×640 竖幅：
#   l5_portrait1.png  贵族肖像（侧身立像，白领巾黑礼服）
#   l5_portrait2.png  夫妇像（双人并立，深色长裙与礼服）
#   l5_portrait3.png  骑马像（骑手与马侧影，暗绿风景底）
# 从 app/ 目录运行：python scripts/gen-l5-portraits.py
import os
import random
from PIL import Image, ImageDraw, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TEX = os.path.join(ROOT, 'public', 'textures')
W, H = 512, 640


def canvas(seed, top, bottom):
    rng = random.Random(seed)
    img = Image.new('RGB', (W, H))
    d = ImageDraw.Draw(img)
    for y in range(H):  # 古典暗色渐变底（上深下浅）
        t = y / H
        d.line([(0, y), (W, y)], fill=tuple(int(top[i] + (bottom[i] - top[i]) * t) for i in range(3)))
    for _ in range(260):  # 画布噪点/裂纹感
        x, y = rng.uniform(0, W), rng.uniform(0, H)
        f = rng.uniform(0.85, 1.15)
        d.point((x, y), tuple(min(255, int(c * f)) for c in img.getpixel((int(x), int(y)))))
    return img, d


def vignette(img):
    """四角压暗（古典油画暗角）"""
    mask = Image.new('L', (W, H), 0)
    md = ImageDraw.Draw(mask)
    md.ellipse([-W * 0.25, -H * 0.2, W * 1.25, H * 1.15], fill=255)
    mask = mask.filter(ImageFilter.GaussianBlur(60))
    dark = Image.new('RGB', (W, H), (8, 6, 5))
    return Image.composite(img, dark, mask)


def head(d, cx, cy, r, skin=(196, 168, 138)):
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=skin)
    d.ellipse([cx - r, cy - r, cx + r, cy - r * 0.2], fill=(58, 44, 34))  # 发


def portrait_noble():
    img, d = canvas(0x551, (24, 20, 18), (64, 52, 40))
    cx = W // 2
    d.polygon([(cx - 110, H - 60), (cx - 70, 300), (cx + 70, 300), (cx + 110, H - 60)], fill=(22, 20, 22))  # 黑礼服
    d.polygon([(cx - 26, 300), (cx + 26, 300), (cx, 420)], fill=(228, 222, 208))  # 白领巾
    d.rectangle([cx - 14, 260, cx + 14, 306], fill=(188, 162, 132))  # 颈
    head(d, cx, 218, 52)
    d.ellipse([cx - 56, 164, cx + 56, 214], fill=(46, 36, 28))  # 高发髻
    d.ellipse([cx - 34, 300, cx - 8, 330], fill=(200, 178, 60))  # 怀表金链坠
    vignette(img).save(os.path.join(TEX, 'l5_portrait1.png'))
    print('生成 l5_portrait1.png')


def portrait_couple():
    img, d = canvas(0x552, (20, 18, 24), (56, 48, 44))
    # 左：长裙贵妇
    d.polygon([(120, H - 70), (160, 320), (216, 320), (250, H - 70)], fill=(52, 30, 34))
    d.rectangle([176, 282, 200, 322], fill=(192, 166, 136))
    head(d, 188, 240, 44, (200, 172, 142))
    d.ellipse([150, 200, 226, 240], fill=(40, 30, 26))
    # 右：礼服绅士
    d.polygon([(300, H - 70), (330, 310), (400, 310), (430, H - 70)], fill=(24, 24, 28))
    d.polygon([(352, 310), (382, 310), (368, 400)], fill=(226, 220, 206))
    d.rectangle([354, 272, 380, 314], fill=(184, 158, 128))
    head(d, 367, 228, 46, (190, 160, 130))
    d.rectangle([340, 168, 394, 196], fill=(30, 26, 22))  # 礼帽
    d.rectangle([352, 196, 382, 210], fill=(30, 26, 22))
    vignette(img).save(os.path.join(TEX, 'l5_portrait2.png'))
    print('生成 l5_portrait2.png')


def portrait_rider():
    img, d = canvas(0x553, (26, 34, 26), (72, 66, 46))
    # 马侧影（躯干 + 颈 + 头 + 四肢）
    d.ellipse([150, 330, 400, 450], fill=(34, 26, 20))
    d.polygon([(330, 350), (400, 250), (430, 270), (390, 380)], fill=(34, 26, 20))
    d.polygon([(396, 236), (448, 252), (440, 286), (398, 278)], fill=(34, 26, 20))  # 马头
    for lx in (190, 240, 330, 370):
        d.rectangle([lx, 430, lx + 22, 580], fill=(30, 23, 18))  # 马腿
    # 骑手
    d.polygon([(240, 330), (258, 220), (300, 220), (318, 330)], fill=(58, 24, 24))  # 骑装
    d.rectangle([268, 196, 290, 226], fill=(188, 160, 130))
    head(d, 279, 162, 36, (192, 162, 132))
    d.rectangle([258, 116, 300, 140], fill=(24, 22, 20))  # 骑帽
    vignette(img).save(os.path.join(TEX, 'l5_portrait3.png'))
    print('生成 l5_portrait3.png')


portrait_noble()
portrait_couple()
portrait_rider()
