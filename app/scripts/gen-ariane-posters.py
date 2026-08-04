# 生成阿丽亚娜集团标志与海报贴图（PIL 程序绘制，无外部素材，随项目同许可发布）
# 输出：app/public/textures/ariane_logo.png（512×512 透明底）与 ariane_poster.png（128×160 竖版）
# 标志设定（wikidot 阿丽亚娜集团）：一圈约 16 个紫色圆环组成的圆环；主题色 #8676e2
# 用法：cd app && python scripts/gen-ariane-posters.py
import math

from PIL import Image, ImageDraw, ImageFont

FONT = 'C:/Windows/Fonts/msyhbd.ttc'
PURPLE = '#8676e2'


def font(sz):
    return ImageFont.truetype(FONT, sz)


def ctext(d, cx, y, txt, f, fill):
    bb = d.textbbox((0, 0), txt, font=f)
    d.text((cx - (bb[2] - bb[0]) / 2, y), txt, font=f, fill=fill)


def draw_ring_logo(d, cx, cy, R, r, width, color, n=16):
    """一圈 n 个圆环组成的圆环（阿丽亚娜集团徽标）"""
    for i in range(n):
        a = i * 2 * math.pi / n - math.pi / 2  # 从正上方起排
        x = cx + math.cos(a) * R
        y = cy + math.sin(a) * R
        d.ellipse([x - r, y - r, x + r, y + r], outline=color, width=width)


# 1) ariane_logo.png：512×512 透明底紫环标志（注册用素材，见 SOURCES.md）
img = Image.new('RGBA', (512, 512), (0, 0, 0, 0))
d = ImageDraw.Draw(img)
draw_ring_logo(d, 256, 256, 168, 32, 10, PURPLE)
img.save('public/textures/ariane_logo.png')

# 2) ariane_poster.png：128×160 竖版海报（深紫底 + 紫环标志 + 集团/据点字样）
W, H = 128, 160
img = Image.new('RGB', (W, H), '#221c38')
d = ImageDraw.Draw(img)
d.rectangle([0, 0, W - 1, H - 1], outline=PURPLE, width=4)
d.rectangle([5, 5, W - 6, H - 6], outline='#5a4a9a', width=1)
draw_ring_logo(d, 64, 46, 30, 6, 2, PURPLE)
ctext(d, 64, 92, '阿丽亚娜集团', font(16), '#d8d0f8')
ctext(d, 64, 114, 'THE ARIANE CIRCLE', font(9), '#9a8cd8')
ctext(d, 64, 130, '希波克拉底 - 1', font(13), PURPLE)
ctext(d, 64, 146, '异常生物学 · 医疗救助', font(9), '#8a7cc0')
img.save('public/textures/ariane_poster.png')

print('ariane_logo.png + ariane_poster.png saved')
