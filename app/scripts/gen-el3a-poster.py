# 办公区EL3A 装饰贴图（PIL 程序绘制，无外部素材）：
# - el3a_poster.png   L2 整洁的廊道里的 EL3A 定居点海报（BNTG 绿底 + 仓库/办公楼图案 + 标语）
# - el3a_safeline.png 仓库地面黄色安全线贴花（photo flat + data.tex 地面贴花用）
# 用法：cd app && python scripts/gen-el3a-poster.py
import math
import random

from PIL import Image, ImageDraw, ImageFont

OUT = 'public/textures'
FONT_B = 'C:/Windows/Fonts/msyhbd.ttc'  # 微软雅黑 Bold
FONT_R = 'C:/Windows/Fonts/msyh.ttc'    # 微软雅黑 Regular


def font(path: str, size: int) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(path, size)


def draw_scales(d: ImageDraw.ImageDraw, cx: float, cy: float, s: float, c: tuple, w: int):
    """天平徽记（BNTG 意象）：中柱 + 横梁 + 双盘。"""
    d.line([(cx, cy - s), (cx, cy + s * 0.55)], fill=c, width=w)          # 中柱
    d.line([(cx - s, cy - s * 0.62), (cx + s, cy - s * 0.62)], fill=c, width=w)  # 横梁
    d.ellipse([cx - w * 1.6, cy - s - w * 1.6, cx + w * 1.6, cy - s + w * 1.6], outline=c, width=w)  # 顶珠
    for sgn in (-1, 1):
        px = cx + sgn * s
        d.line([(px, cy - s * 0.62), (px - s * 0.28, cy + s * 0.05)], fill=c, width=w)
        d.line([(px, cy - s * 0.62), (px + s * 0.28, cy + s * 0.05)], fill=c, width=w)
        d.arc([px - s * 0.34, cy - s * 0.28, px + s * 0.34, cy + s * 0.42], 0, 180, fill=c, width=w)  # 托盘
    d.line([(cx - s * 0.45, cy + s * 0.55), (cx + s * 0.45, cy + s * 0.55)], fill=c, width=w)  # 底座


def poster():
    W, H = 512, 640
    img = Image.new('RGB', (W, H), '#23402f')
    d = ImageDraw.Draw(img)
    # 斜纹暗底
    for i in range(-H, W, 26):
        d.line([(i, 0), (i + H, H)], fill='#1e3729', width=9)
    # 双线外框
    d.rectangle([10, 10, W - 11, H - 11], outline='#8fae7a', width=5)
    d.rectangle([22, 22, W - 23, H - 23], outline='#d8dcc8', width=2)

    cream, ochre, dim = '#e8e4d0', '#d8b64a', '#9fb8a2'
    # 顶部：天平徽记 + B.N.T.G.
    draw_scales(d, W / 2, 92, 34, cream, 4)
    d.text((W / 2, 152), 'B.N.T.G.', font=font(FONT_B, 40), fill=cream, anchor='mm')
    d.line([(60, 182), (W - 60, 182)], fill=dim, width=2)

    # 中部图案：仓库（锯齿顶）+ 二层办公楼 + 托盘箱堆（楼体先填底色盖住斜纹）
    base_y = 400
    d.rectangle([56, base_y - 130, 300, base_y], fill='#23402f', outline=cream, width=4)  # 仓库体
    for i in range(3):                                                            # 锯齿屋顶
        x0 = 56 + i * 82
        d.line([(x0, base_y - 130), (x0 + 41, base_y - 168), (x0 + 82, base_y - 130)], fill=cream, width=4)
    d.rectangle([86, base_y - 74, 150, base_y], outline=dim, width=3)             # 仓库大门
    d.line([(118, base_y - 74), (118, base_y)], fill=dim, width=3)
    d.rectangle([316, base_y - 196, 456, base_y], fill='#23402f', outline=cream, width=4)  # 办公楼（两层）
    d.line([(316, base_y - 98), (456, base_y)], fill=cream, width=3)              # 层间线
    for fy in (base_y - 168, base_y - 70):                                        # 窗格
        for fx in (336, 376, 416):
            d.rectangle([fx, fy, fx + 22, fy + 18], outline=ochre, width=3)
    for bx, by in ((196, base_y - 26), (232, base_y - 26), (214, base_y - 50)):   # 托盘箱堆
        d.rectangle([bx, by, bx + 32, by + 22], outline=ochre, width=3)
    d.line([(40, base_y + 8), (W - 40, base_y + 8)], fill=cream, width=4)         # 地面线

    # 标题与标语
    d.text((W / 2, 476), '办公区EL3A', font=font(FONT_B, 74), fill=ochre, anchor='mm')
    d.text((W / 2, 544), '存储与分配', font=font(FONT_B, 40), fill=cream, anchor='mm')
    d.line([(60, 578), (W - 60, 578)], fill=dim, width=2)
    d.text((W / 2, 604), 'B.N.T.G. 物流中转站 — LEVEL 2', font=font(FONT_R, 22), fill=dim, anchor='mm')
    img.save(f'{OUT}/el3a_poster.png')
    print('  el3a_poster.png 已保存')


def safeline():
    """黄色安全线地面贴花（透明底；沿局部 x 方向的黄双实线 + 黑描边，轻微磨损）。"""
    S = 256
    img = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    for cy in (S // 2 - 16, S // 2 + 16):
        d.rectangle([0, cy - 7, S, cy + 7], fill=(0, 0, 0, 200))        # 黑描边
        d.rectangle([0, cy - 5, S, cy + 5], fill=(216, 178, 44, 235))   # 黄线
    rnd = random.Random(105)
    for _ in range(900):  # 磨损噪点（擦除零星像素）
        x, y = rnd.randrange(S), rnd.randrange(S)
        if img.getpixel((x, y))[3] and rnd.random() < 0.75:
            img.putpixel((x, y), (0, 0, 0, 0))
    img.save(f'{OUT}/el3a_safeline.png')
    print('  el3a_safeline.png 已保存')


if __name__ == '__main__':
    poster()
    safeline()
