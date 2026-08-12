# v54：M.E.G. Omega 基地（id 109，Level 4 子层级）定居点海报（PIL 程序绘制，无外部素材）——
# infiniteL4.ts 海报形地标用（landmark data.poster=1 + data.tex='omega_poster.png'；
# 风格同 gen-l3-posters.py 的 gamma_poster——鹰徽 + M.E.G. 暖白公文风，改为档案柜/数据阵列图案）
# 用法：cd app && python scripts/gen-l109-poster.py
from PIL import Image, ImageDraw, ImageFont

OUT = 'public/textures'
FONT_B = 'C:/Windows/Fonts/msyhbd.ttc'  # 微软雅黑 Bold
FONT_R = 'C:/Windows/Fonts/msyh.ttc'    # 微软雅黑 Regular
W, H = 512, 640


def font(path: str, size: int) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(path, size)


def draw_eagle(d: ImageDraw.ImageDraw, cx: float, cy: float, s: float, c: tuple):
    """展翅鹰徽（M.E.G. 意象）：几何折线展翅 + 头 + 尾羽（同 gen-l3-posters.py）。"""
    for sgn in (-1, 1):
        d.polygon([(cx, cy), (cx + sgn * s * 0.55, cy - s * 0.62), (cx + sgn * s * 1.05, cy - s * 0.5),
                   (cx + sgn * s * 0.6, cy - s * 0.1)], fill=c)
        d.polygon([(cx + sgn * s * 0.5, cy - s * 0.18), (cx + sgn * s * 1.0, cy - s * 0.42),
                   (cx + sgn * s * 0.95, cy - s * 0.12), (cx + sgn * s * 0.45, cy + s * 0.08)], fill=c)
    d.polygon([(cx, cy - s * 0.3), (cx + s * 0.16, cy - s * 0.14), (cx + s * 0.08, cy + s * 0.5),
               (cx, cy + s * 0.62), (cx - s * 0.08, cy + s * 0.5), (cx - s * 0.16, cy - s * 0.14)], fill=c)
    d.ellipse([cx - s * 0.12, cy - s * 0.52, cx + s * 0.12, cy - s * 0.28], fill=c)  # 头
    d.polygon([(cx + s * 0.1, cy - s * 0.44), (cx + s * 0.24, cy - s * 0.38), (cx + s * 0.1, cy - s * 0.34)], fill=c)  # 喙


def omega_poster():
    img = Image.new('RGB', (W, H), '#e4e6e0')  # 浅灰白底（办公行政风）
    d = ImageDraw.Draw(img)
    # MEG 鲜黄顶/底饰带 + 深色双线框
    d.rectangle([0, 0, W, 64], fill='#d9b13b')
    d.rectangle([0, H - 64, W, H], fill='#d9b13b')
    d.rectangle([12, 76, W - 13, H - 77], outline='#2e3238', width=4)
    dark, ochre = '#2e3238', '#b08a1e'
    d.text((W / 2, 34), 'M.E.G.', font=font(FONT_B, 40), fill='#2e3238', anchor='mm')
    # 鹰徽 + 档案柜/数据阵列图案（Omega=档案与数据中心）
    draw_eagle(d, W / 2, 200, 82, dark)
    base_y = 440
    for i, bx in enumerate((108, 208, 308)):  # 三组档案柜（抽屉格 + 标签口）
        d.rectangle([bx, base_y - 140, bx + 96, base_y], fill='#e4e6e0', outline=dark, width=4)
        for fy in (base_y - 108, base_y - 72, base_y - 36):
            d.line([(bx, fy), (bx + 96, fy)], fill=dark, width=3)
        for fy in (base_y - 126, base_y - 90, base_y - 54):
            d.rectangle([bx + 36, fy, bx + 60, fy + 12], outline=ochre, width=3)
    d.line([(70, base_y + 8), (W - 70, base_y + 8)], fill=dark, width=4)  # 地面线
    # 标题与落款
    d.text((W / 2, 492), 'Omega 基地', font=font(FONT_B, 66), fill=dark, anchor='mm')
    d.text((W / 2, 566), '档案与数据中心 · LEVEL 4', font=font(FONT_B, 30), fill=ochre, anchor='mm')
    d.text((W / 2, H - 32), '探险者总署 · 顺着地标指引前来', font=font(FONT_R, 24), fill='#2e3238', anchor='mm')
    img.save(f'{OUT}/omega_poster.png')
    print('  omega_poster.png 已保存')


if __name__ == '__main__':
    omega_poster()
