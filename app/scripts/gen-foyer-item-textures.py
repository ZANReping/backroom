# 前厅（序章）物品表面像素贴图：PIL 程序绘制（自制，无外部素材，CC0 / 随项目同许可发布）。
# 风格与物品栏像素图标（scripts/gen-item-icons.py：32 px 原稿、深色描边 #2a241c、有限调色板）一致，
# 运行时以 NearestFilter 采样保持像素颗粒（renderer/foyerItemModels.ts）。品牌/文字均为虚构中性（无真实商标）。
# 用法：cd app && python scripts/gen-foyer-item-textures.py  → public/textures/foyer/items/*.png
import os
from PIL import Image, ImageDraw

DIR = 'public/textures/foyer/items'
INK = '#2a241c'
os.makedirs(DIR, exist_ok=True)


def save(img, name, scale=1):
    if scale != 1:
        img = img.resize((img.width * scale, img.height * scale), Image.NEAREST)
    img.save(f'{DIR}/{name}.png')
    print('  ', name, img.size)


# 手机背面（32×64）：深灰磨砂 + 左上双摄模组 + 中央虚构中性标（圆环）+ 底部细字线
def phone_back():
    im = Image.new('RGBA', (32, 64), '#2b2d31'); d = ImageDraw.Draw(im)
    for y in range(0, 64, 2):
        for x in range((y // 2) % 2, 32, 2):
            d.point((x, y), fill='#2f3136')
    d.rounded_rectangle([3, 3, 13, 17], radius=3, fill='#1c1d20', outline='#45484e')  # 摄像头模组
    d.ellipse([5, 5, 10, 10], fill='#0d0e10', outline='#5a5e66'); d.point((7, 7), fill='#6c88b0')
    d.ellipse([5, 11, 10, 16], fill='#0d0e10', outline='#5a5e66'); d.point((7, 13), fill='#6c88b0')
    d.point((12, 6), fill='#e8e2c8')  # 闪光灯
    d.ellipse([12, 28, 19, 35], outline='#55585f')  # 中性圆环标
    d.line([(10, 56), (21, 56)], fill='#3a3d42'); d.line([(12, 58), (19, 58)], fill='#3a3d42')
    return im


# 手机锁屏（32×64）：夜空渐变 + 23:40 像素大字 + 日期条 + 两条通知（论坛/新闻）+ 底部横条
def phone_lock():
    im = Image.new('RGBA', (32, 64)); d = ImageDraw.Draw(im)
    for y in range(64):
        t = y / 63
        d.line([(0, y), (31, y)], fill=(int(20 + 30 * t), int(34 + 40 * t), int(70 + 60 * t), 255))
    digits = {  # 3×5 像素数字
        '2': ['111', '001', '111', '100', '111'], '3': ['111', '001', '111', '001', '111'],
        '4': ['101', '101', '111', '001', '001'], '0': ['111', '101', '101', '101', '111'],
    }
    x = 6
    for ch in '2340':
        for r, row in enumerate(digits[ch]):
            for c, v in enumerate(row):
                if v == '1':
                    d.point((x + c, 10 + r), fill='#eef3fb')
        x += 4 if ch != '3' else 6
    d.point([(15, 11), (15, 13)], fill='#eef3fb')  # 冒号
    d.line([(9, 18), (22, 18)], fill='#a9bedc')  # 日期
    for yy, col in ((26, '#e8b93c'), (34, '#7fa8e0')):  # 通知卡（论坛=琥珀、新闻=蓝）
        d.rounded_rectangle([3, yy, 28, yy + 6], radius=2, fill='#3a4f74')
        d.rectangle([5, yy + 2, 7, yy + 4], fill=col)
        d.line([(9, yy + 2), (25, yy + 2)], fill='#c9d6ea'); d.line([(9, yy + 4), (20, yy + 4)], fill='#93a8c8')
    d.line([(11, 60), (20, 60)], fill='#dfe7f3')
    return im


# 瓶装水腰标（64×16，环绕瓶身）：蓝底 + 白色波浪 + 水滴标 + 虚构中性字样块
def water_label():
    im = Image.new('RGBA', (64, 16), '#2f7fc1'); d = ImageDraw.Draw(im)
    d.line([(0, 0), (63, 0)], fill='#1d5fa8'); d.line([(0, 15), (63, 15)], fill='#1d5fa8')
    for x in range(64):
        y = 11 + (1 if (x // 3) % 2 else 0)
        d.point((x, y), fill='#cfe6f2')
    for cx in (8, 40):  # 水滴
        d.polygon([(cx, 3), (cx + 3, 7), (cx, 9), (cx - 3, 7)], fill='#e8f6fd', outline='#1d5fa8')
    for bx in (14, 46):  # 字样块（不可读的像素字）
        for i in range(5):
            d.rectangle([bx + i * 3, 4, bx + i * 3 + 1, 7], fill='#f2fbff')
    return im


# 能量棒包装（64×16）：橙红底 + 黄色腰带 + 燕麦粒点 + 两端锯齿封口
def snack_wrap():
    im = Image.new('RGBA', (64, 16), '#d4532f'); d = ImageDraw.Draw(im)
    d.rectangle([22, 0, 41, 15], fill='#e3b23c'); d.line([(22, 0), (22, 15)], fill=INK); d.line([(41, 0), (41, 15)], fill=INK)
    for x, y in ((5, 4), (9, 10), (14, 6), (48, 5), (53, 11), (58, 7), (12, 12), (50, 2)):
        d.point((x, y), fill='#f6e7c9'); d.point((x + 1, y), fill='#e9c99a')
    for i in range(3):  # 腰带上的巧克力纹
        d.line([(26 + i * 5, 4), (28 + i * 5, 11)], fill='#7a3a1e')
    for y in range(0, 16, 2):  # 锯齿封口
        d.point((0, y), fill='#f0d6b0'); d.point((63, y + 1), fill='#f0d6b0')
    d.line([(0, 2), (63, 2)], fill='#e9785a')  # 高光
    return im


# 背包布料（32×32，可平铺）：深灰蓝斜纹 + 疏密织点
def pack_fabric():
    im = Image.new('RGBA', (32, 32), '#3c4552'); d = ImageDraw.Draw(im)
    for y in range(32):
        for x in range(32):
            if (x + y) % 4 == 0:
                d.point((x, y), fill='#36404c')
            elif (x - y) % 8 == 0:
                d.point((x, y), fill='#434d5c')
    return im


# 背包前袋徽章（16×16）：琥珀色圆角章 + 小山形（虚构中性户外标）
def pack_patch():
    im = Image.new('RGBA', (16, 16), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    d.rounded_rectangle([1, 3, 14, 12], radius=3, fill='#e3a83c', outline=INK)
    d.polygon([(3, 10), (7, 5), (9, 8), (10, 7), (13, 10)], fill='#2a3038')
    return im


# 录像带标签（32×16）：黄底 + 手写横线 + 红色侧条
def vhs_label():
    im = Image.new('RGBA', (32, 16), '#e8d24a'); d = ImageDraw.Draw(im)
    d.rectangle([0, 0, 3, 15], fill='#c0392b')
    for y in (4, 8, 12):
        d.line([(6, y), (28 - (y % 3) * 3, y)], fill='#5a4a20')
    return im


if __name__ == '__main__':
    save(phone_back(), 'phone_back')
    save(phone_lock(), 'phone_lock')
    save(water_label(), 'water_label')
    save(snack_wrap(), 'snack_wrap')
    save(pack_fabric(), 'pack_fabric')
    save(pack_patch(), 'pack_patch')
    save(vhs_label(), 'vhs_label')
    print('完成')
