#!/usr/bin/env python3
# gen-l3-artworks.py —— Level 3 廊道砖墙上的大幅艺术品画作贴图（v53，bigpainting 结构用）。
# wikidot L3「艺术品」：砖墙表面覆盖大块白色画布状材质，其上绘有各种来历不明的画作、素描及其他图像；
# 创作年代相当新近。纯 PIL 程序绘制，512×640 竖幅画布（与 angel_fresco 同规格）。
# 从 app/ 目录运行：python scripts/gen-l3-artworks.py
import os
import random
from PIL import Image, ImageDraw, ImageFilter, ImageEnhance

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TEX = os.path.join(ROOT, 'public', 'textures')
W, H = 512, 640


def canvas_base(rng):
    """泛黄旧画布 + 斑驳老化"""
    img = Image.new('RGB', (W, H), (198, 190, 170))
    d = ImageDraw.Draw(img)
    for _ in range(240):
        x, y = rng.uniform(0, W), rng.uniform(0, H)
        r = rng.uniform(6, 40)
        v = rng.randint(-24, 16)
        d.ellipse([x - r, y - r * 0.6, x + r, y + r * 0.6], fill=(198 + v, 190 + v, 170 + v))
    return img.filter(ImageFilter.GaussianBlur(2))


def weather(img, rng, streaks=44):
    """竖向水渍流痕 + 边缘磨损"""
    d = ImageDraw.Draw(img)
    for _ in range(streaks):
        x = rng.uniform(0, W)
        y0 = rng.uniform(0, H * 0.5)
        ln = rng.uniform(60, 300)
        v = rng.choice([(150, 140, 122), (120, 108, 92), (212, 206, 188)])
        d.line([(x, y0), (x + rng.uniform(-6, 6), y0 + ln)], fill=v, width=rng.randint(2, 7))
    for _ in range(80):
        x = rng.choice([rng.uniform(0, 26), rng.uniform(W - 26, W), rng.uniform(0, W)])
        y = rng.choice([rng.uniform(0, 20), rng.uniform(H - 20, H)]) if 26 < x < W - 26 else rng.uniform(0, H)
        r = rng.uniform(1, 5)
        d.ellipse([x - r, y - r, x + r, y + r], fill=(110, 98, 82))
    return ImageEnhance.Contrast(img).enhance(0.94)


def art_angel():
    """吹号天使（附图二）：深色剪影——一臂高举长号、一臂横展，面部被粗暴涂抹"""
    rng = random.Random(53)
    img = canvas_base(rng)
    d = ImageDraw.Draw(img)
    # 背后圣光晕（冷灰调，与圣所暖调区分）
    for r in range(210, 20, -8):
        a = int(34 * (1 - r / 210))
        d.ellipse([W / 2 - r, 220 - r, W / 2 + r, 220 + r], fill=(198 + a, 190 + a, 170 + a // 2))
    dark, mid = (52, 44, 38), (92, 80, 66)
    cx = W / 2
    # 收拢下垂的双翼（附图二为背生双翼的立像）
    d.polygon([(cx - 24, 240), (cx - 170, 110), (cx - 205, 160), (cx - 70, 300)], fill=mid)
    d.polygon([(cx + 24, 240), (cx + 170, 110), (cx + 205, 160), (cx + 70, 300)], fill=mid)
    d.polygon([(cx - 20, 250), (cx - 145, 150), (cx - 168, 180), (cx - 60, 305)], fill=dark)
    d.polygon([(cx + 20, 250), (cx + 145, 150), (cx + 168, 180), (cx + 60, 305)], fill=dark)
    # 长袍躯干
    d.polygon([(cx - 36, 215), (cx + 36, 215), (cx + 70, 540), (cx - 70, 540)], fill=dark)
    for i in range(-2, 3):  # 袍褶
        x0 = cx + i * 22
        d.line([(x0, 255), (x0 + i * 7, 530)], fill=mid, width=5)
    # 左臂横展（掌心向上，附图二姿态）
    d.polygon([(cx - 30, 230), (cx - 150, 195), (cx - 154, 212), (cx - 36, 252)], fill=dark)
    d.ellipse([cx - 168, 192, cx - 146, 216], fill=dark)  # 手掌
    # 右臂高举长号（斜指画面上缘）
    d.polygon([(cx + 28, 228), (cx + 108, 140), (cx + 120, 152), (cx + 44, 248)], fill=dark)
    d.line([(cx + 100, 152), (cx + 190, 66)], fill=dark, width=11)  # 号管
    d.polygon([(cx + 186, 46), (cx + 224, 34), (cx + 220, 82), (cx + 184, 74)], fill=dark)  # 喇叭口
    # 头 + 面部涂抹（附图二：面部似被用力抹掉）
    d.ellipse([cx - 27, 152, cx + 27, 208], fill=dark)
    for _ in range(26):  # 画布底色乱痕把五官涂没
        x = cx + rng.uniform(-24, 24)
        y = 180 + rng.uniform(-22, 22)
        d.line([(x - rng.uniform(6, 18), y + rng.uniform(-8, 8)), (x + rng.uniform(6, 18), y + rng.uniform(-8, 8))],
               fill=(196, 188, 168), width=rng.randint(3, 6))
    # 石台基座
    d.rectangle([cx - 95, 540, cx + 95, 578], fill=mid)
    d.rectangle([cx - 105, 578, cx + 105, 606], fill=dark)
    return weather(img, rng)


def art_skeleton():
    """带翅膀的骷髅（附图三）：骷髅侧身坐于桌旁，背后一对大翼，桌上蜡烛与骸骨"""
    rng = random.Random(97)
    img = canvas_base(rng)
    d = ImageDraw.Draw(img)
    dark, mid, bone = (48, 42, 36), (94, 84, 70), (210, 203, 184)
    cx = W / 2
    # 圆形底光（附图三背景圆晕）
    d.ellipse([cx - 190, 60, cx + 190, 440], fill=(184, 176, 158))
    # 大翼（从肩胛展开，羽毛分层）
    for i, (ex, ey) in enumerate([(-175, 80), (-195, 130), (-185, 185)]):
        d.polygon([(cx - 30, 250), (cx + ex, ey), (cx + ex - 25, ey + 45), (cx - 55, 300)], fill=mid if i % 2 else dark)
    for i, (ex, ey) in enumerate([(175, 80), (195, 130), (185, 185)]):
        d.polygon([(cx + 30, 250), (cx + ex, ey), (cx + ex + 25, ey + 45), (cx + 55, 300)], fill=mid if i % 2 else dark)
    # 坐姿躯干（脊柱微弓）
    d.polygon([(cx - 40, 250), (cx + 40, 250), (cx + 55, 430), (cx - 55, 430)], fill=dark)
    for i in range(5):  # 肋骨
        y = 268 + i * 22
        d.arc([cx - 34, y - 14, cx + 34, y + 16], 0, 180, fill=bone, width=4)
    # 骷髅头（侧向微垂）
    d.ellipse([cx - 30, 160, cx + 30, 225], fill=bone)
    d.polygon([(cx - 30, 195), (cx + 30, 195), (cx + 22, 238), (cx - 22, 238)], fill=bone)  # 下颌
    d.ellipse([cx - 20, 178, cx - 6, 196], fill=dark)  # 眼窝
    d.ellipse([cx + 6, 178, cx + 20, 196], fill=dark)
    d.polygon([(cx - 4, 196), (cx + 4, 196), (cx, 210)], fill=dark)  # 鼻腔
    for i in range(5):  # 齿列
        d.line([(cx - 14 + i * 7, 214), (cx - 14 + i * 7, 226)], fill=dark, width=2)
    # 手臂搭上桌面（前臂骨）
    d.line([(cx - 45, 300), (cx - 120, 395)], fill=bone, width=9)
    d.line([(cx + 45, 300), (cx + 110, 390)], fill=bone, width=9)
    # 桌面静物：蜡烛 + 小骷髅头 + 书本
    d.rectangle([cx - 190, 400, cx + 190, 420], fill=mid)
    d.rectangle([cx - 175, 420, cx + 175, 590], fill=dark)
    d.rectangle([cx - 150, 340, cx - 138, 402], fill=bone)  # 蜡烛
    d.polygon([(cx - 144, 322), (cx - 152, 340), (cx - 136, 340)], fill=(226, 190, 120))  # 烛火
    d.ellipse([cx + 96, 356, cx + 140, 402], fill=bone)  # 小骷髅头
    d.ellipse([cx + 106, 368, cx + 116, 380], fill=dark)
    d.ellipse([cx + 122, 368, cx + 132, 380], fill=dark)
    d.polygon([(cx - 60, 376), (cx + 30, 372), (cx + 34, 402), (cx - 56, 404)], fill=(160, 150, 128))  # 摊开的书
    d.line([(cx - 13, 374), (cx - 11, 402)], fill=dark, width=3)
    return weather(img, rng)


def art_sketch():
    """狂乱素描（wikidot：多页笔记纸上的疯癫笔迹与素描）——杂乱炭线、涂抹块、不成形的文句"""
    rng = random.Random(31)
    img = canvas_base(rng)
    d = ImageDraw.Draw(img)
    dark, mid = (46, 40, 34), (100, 90, 74)
    # 中央一团纠结的素描主体（辨不出轮廓的人形/圣像草图）
    cx = W / 2
    for _ in range(120):
        a = rng.uniform(0, 6.283)
        r0 = rng.uniform(10, 120)
        x0 = cx + rng.uniform(-40, 40) + r0 * 0.6 * rng.choice([-1, 1])
        y0 = 250 + rng.uniform(-90, 90)
        d.arc([x0 - r0, y0 - r0 * 1.3, x0 + r0, y0 + r0 * 1.3],
              rng.uniform(0, 360), rng.uniform(0, 360) + rng.uniform(40, 200), fill=dark if rng.random() < 0.6 else mid,
              width=rng.randint(1, 3))
    # 涂抹阴影块
    for _ in range(30):
        x = cx + rng.uniform(-130, 130)
        y = 250 + rng.uniform(-130, 130)
        r = rng.uniform(8, 30)
        g = rng.randint(60, 110)
        d.ellipse([x - r, y - r * 0.7, x + r, y + r * 0.7], fill=(g, g - 6, g - 14))
    img = img.filter(ImageFilter.GaussianBlur(1.2))
    d = ImageDraw.Draw(img)
    # 四周疯癫的手写文句（不成句的颤笔横划，模拟不可辨的狂乱笔迹）
    for row in range(9):
        y = 440 + row * 20
        x = 40 + rng.uniform(0, 30)
        while x < W - 60:
            seg = rng.uniform(14, 46)
            jitter = rng.uniform(-4, 4)
            d.line([(x, y), (x + seg, y + jitter)], fill=dark, width=2)
            if rng.random() < 0.35:  # 句号/戳点
                d.ellipse([x + seg + 3, y - 2, x + seg + 7, y + 2], fill=dark)
            x += seg + rng.uniform(8, 22)
    # 顶部加大的标题式狂草
    for _ in range(7):
        x = rng.uniform(60, W - 120)
        d.line([(x, 70 + rng.uniform(-10, 10)), (x + rng.uniform(40, 110), 70 + rng.uniform(-14, 14))], fill=dark, width=4)
    # 纸面折痕
    d.line([(0, 320), (W, 324)], fill=(150, 142, 124), width=3)
    return weather(img, rng, streaks=30)


for name, fn in [('l3_art_angel.png', art_angel), ('l3_art_skeleton.png', art_skeleton), ('l3_art_sketch.png', art_sketch)]:
    out = os.path.join(TEX, name)
    fn().save(out)
    print('written', out)
