# v54：Level 3 三据点定居点海报（PIL 程序绘制，无外部素材）——L3 廊道贴墙海报形地标用
# （infiniteL3.ts：landmark data.poster=1 + data.tex 指定；风格参照 gen-el3a-poster.py / gen-jerry-poster.py）
# - gamma_poster.png          M.E.G. Gemma 基地（鹰徽 + 暖白底 + 鲜黄饰带）
# - l3storage_poster.png      B.N.T.G. 存储设施（绿底 + 天平徽记 + 箱堆图案）
# - bluesalvation_poster.png  蓝色救赎（杰瑞的信众：蓝底 + 鹉羽圣辉）
# 用法：cd app && python scripts/gen-l3-posters.py
from PIL import Image, ImageDraw, ImageFont

OUT = 'public/textures'
FONT_B = 'C:/Windows/Fonts/msyhbd.ttc'  # 微软雅黑 Bold
FONT_R = 'C:/Windows/Fonts/msyh.ttc'    # 微软雅黑 Regular
W, H = 512, 640


def font(path: str, size: int) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(path, size)


def draw_scales(d: ImageDraw.ImageDraw, cx: float, cy: float, s: float, c: tuple, w: int):
    """天平徽记（BNTG 意象）：中柱 + 横梁 + 双盘（同 gen-el3a-poster.py）。"""
    d.line([(cx, cy - s), (cx, cy + s * 0.55)], fill=c, width=w)
    d.line([(cx - s, cy - s * 0.62), (cx + s, cy - s * 0.62)], fill=c, width=w)
    d.ellipse([cx - w * 1.6, cy - s - w * 1.6, cx + w * 1.6, cy - s + w * 1.6], outline=c, width=w)
    for sgn in (-1, 1):
        px = cx + sgn * s
        d.line([(px, cy - s * 0.62), (px - s * 0.28, cy + s * 0.05)], fill=c, width=w)
        d.line([(px, cy - s * 0.62), (px + s * 0.28, cy + s * 0.05)], fill=c, width=w)
        d.arc([px - s * 0.34, cy - s * 0.28, px + s * 0.34, cy + s * 0.42], 0, 180, fill=c, width=w)
    d.line([(cx - s * 0.45, cy + s * 0.55), (cx + s * 0.45, cy + s * 0.55)], fill=c, width=w)


def draw_eagle(d: ImageDraw.ImageDraw, cx: float, cy: float, s: float, c: tuple):
    """展翅鹰徽（M.E.G. 意象）：几何折线展翅 + 头 + 尾羽。"""
    # 双翼（三层折羽）
    for sgn in (-1, 1):
        d.polygon([(cx, cy), (cx + sgn * s * 0.55, cy - s * 0.62), (cx + sgn * s * 1.05, cy - s * 0.5),
                   (cx + sgn * s * 0.6, cy - s * 0.1)], fill=c)
        d.polygon([(cx + sgn * s * 0.5, cy - s * 0.18), (cx + sgn * s * 1.0, cy - s * 0.42),
                   (cx + sgn * s * 0.95, cy - s * 0.12), (cx + sgn * s * 0.45, cy + s * 0.08)], fill=c)
    # 躯干 + 头
    d.polygon([(cx, cy - s * 0.3), (cx + s * 0.16, cy - s * 0.14), (cx + s * 0.08, cy + s * 0.5),
               (cx, cy + s * 0.62), (cx - s * 0.08, cy + s * 0.5), (cx - s * 0.16, cy - s * 0.14)], fill=c)
    d.ellipse([cx - s * 0.12, cy - s * 0.52, cx + s * 0.12, cy - s * 0.28], fill=c)  # 头
    d.polygon([(cx + s * 0.1, cy - s * 0.44), (cx + s * 0.24, cy - s * 0.38), (cx + s * 0.1, cy - s * 0.34)], fill=c)  # 喙


def gamma_poster():
    img = Image.new('RGB', (W, H), '#e8e0c8')  # 暖白底
    d = ImageDraw.Draw(img)
    # 鲜黄顶/底饰带 + 深色双线框
    d.rectangle([0, 0, W, 64], fill='#d9b13b')
    d.rectangle([0, H - 64, W, H], fill='#d9b13b')
    d.rectangle([12, 76, W - 13, H - 77], outline='#3a332c', width=4)
    dark, ochre, dim = '#3a332c', '#b08a1e', '#8a7c52'
    d.text((W / 2, 34), 'M.E.G.', font=font(FONT_B, 40), fill='#3a332c', anchor='mm')
    # 鹰徽 + 三层楼图案（Gamma 三层结构）
    draw_eagle(d, W / 2, 210, 90, dark)
    base_y = 420
    d.rectangle([106, base_y - 150, 406, base_y], fill='#e8e0c8', outline=dark, width=4)  # 楼体
    for fy in (base_y - 100, base_y - 50):  # 三层分层线
        d.line([(106, fy), (406, fy)], fill=dark, width=3)
    for fx in (146, 226, 306):  # 窗格
        for fy in (base_y - 138, base_y - 88, base_y - 38):
            d.rectangle([fx, fy, fx + 60, fy + 26], outline=ochre, width=3)
    d.line([(70, base_y + 8), (W - 70, base_y + 8)], fill=dark, width=4)  # 地面线
    # 标题与落款
    d.text((W / 2, 478), 'Gemma 基地', font=font(FONT_B, 72), fill=dark, anchor='mm')
    d.text((W / 2, 544), '主要根据地 · LEVEL 3', font=font(FONT_B, 34), fill=ochre, anchor='mm')
    d.text((W / 2, H - 32), '探险者总署 · 顺着地标指引前来', font=font(FONT_R, 24), fill='#3a332c', anchor='mm')
    img.save(f'{OUT}/gamma_poster.png')
    print('  gamma_poster.png 已保存')


def l3storage_poster():
    img = Image.new('RGB', (W, H), '#23402f')  # BNTG 绿底
    d = ImageDraw.Draw(img)
    for i in range(-H, W, 26):  # 斜纹暗底
        d.line([(i, 0), (i + H, H)], fill='#1e3729', width=9)
    d.rectangle([10, 10, W - 11, H - 11], outline='#8fae7a', width=5)
    d.rectangle([22, 22, W - 23, H - 23], outline='#d8dcc8', width=2)
    cream, ochre, dim = '#e8e4d0', '#d8b64a', '#9fb8a2'
    draw_scales(d, W / 2, 92, 34, cream, 4)
    d.text((W / 2, 152), 'B.N.T.G.', font=font(FONT_B, 40), fill=cream, anchor='mm')
    d.line([(60, 182), (W - 60, 182)], fill=dim, width=2)
    # 中部图案：仓储货架排 + 托盘箱堆
    base_y = 400
    for sx in (70, 250):  # 两组货架（立柱 + 三层搁板 + 箱）
        d.rectangle([sx, base_y - 180, sx + 190, base_y], fill='#23402f', outline=cream, width=4)
        for sy in (base_y - 135, base_y - 90, base_y - 45):
            d.line([(sx, sy), (sx + 190, sy)], fill=cream, width=3)
        for bx, by in ((sx + 18, base_y - 66), (sx + 78, base_y - 66), (sx + 48, base_y - 111), (sx + 108, base_y - 21)):
            d.rectangle([bx, by, bx + 44, by + 20], outline=ochre, width=3)
    d.line([(40, base_y + 8), (W - 40, base_y + 8)], fill=cream, width=4)
    d.text((W / 2, 476), '存储设施', font=font(FONT_B, 74), fill=ochre, anchor='mm')
    d.text((W / 2, 544), 'LEVEL 3 物资仓 · 堆放与集散', font=font(FONT_B, 30), fill=cream, anchor='mm')
    d.line([(60, 578), (W - 60, 578)], fill=dim, width=2)
    d.text((W / 2, 604), 'B.N.T.G. 存储设施 — LEVEL 3', font=font(FONT_R, 22), fill=dim, anchor='mm')
    img.save(f'{OUT}/l3storage_poster.png')
    print('  l3storage_poster.png 已保存')


def bluesalvation_poster():
    img = Image.new('RGB', (W, H), '#2a2c6e')  # 信众蓝底
    d = ImageDraw.Draw(img)
    # 圣辉放射纹
    for i in range(24):
        import math
        a = i * math.pi / 12
        d.line([(W / 2, 300), (W / 2 + math.cos(a) * 320, 300 + math.sin(a) * 320)], fill='#31348a', width=10)
    d.rectangle([10, 10, W - 11, H - 11], outline='#7c8fe8', width=5)
    d.rectangle([22, 22, W - 23, H - 23], outline='#c8d0f5', width=2)
    cream, gold, dim = '#e8ecfc', '#d4af37', '#9aa4dd'
    # 鹉羽 + 圣辉圆环
    d.ellipse([W / 2 - 110, 120, W / 2 + 110, 340], outline=gold, width=6)  # 圣辉环
    fcx, fcy = W / 2, 230
    d.polygon([(fcx, fcy - 110), (fcx + 34, fcy + 40), (fcx, fcy + 90), (fcx - 34, fcy + 40)], fill='#4a7ae8')  # 翎身
    d.polygon([(fcx, fcy - 110), (fcx + 14, fcy + 30), (fcx, fcy + 60), (fcx - 14, fcy + 30)], fill='#7ca5f5')  # 翎心
    d.line([(fcx, fcy - 110), (fcx, fcy + 70)], fill=cream, width=4)  # 翎轴
    d.text((W / 2, 388), '鹉主杰瑞伟大', font=font(FONT_B, 44), fill=gold, anchor='mm')
    d.line([(60, 424), (W - 60, 424)], fill=dim, width=2)
    # 标题与落款
    d.text((W / 2, 486), '蓝色救赎', font=font(FONT_B, 74), fill=cream, anchor='mm')
    d.text((W / 2, 550), '圣所 ·  LEVEL 3', font=font(FONT_B, 32), fill=dim, anchor='mm')
    d.text((W / 2, 600), '杰瑞的信众 敬上', font=font(FONT_R, 24), fill=dim, anchor='mm')
    img.save(f'{OUT}/bluesalvation_poster.png')
    print('  bluesalvation_poster.png 已保存')


if __name__ == '__main__':
    gamma_poster()
    l3storage_poster()
    bluesalvation_poster()
