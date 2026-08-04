# 生成杰瑞的信众宣传海报贴图（PIL 程序绘制，无外部素材，随项目同许可发布）
# 蓝底 + 鹉主（蓝色鹦鹉）剪影 + 圣辉 + 「鹉主杰瑞伟大」字样
# 输出：app/public/textures/jerry_poster.png（128×160 竖版）
# 用法：cd app && python scripts/gen-jerry-poster.py
from PIL import Image, ImageDraw, ImageFont
import math

W, H = 128, 160
FONT = 'C:/Windows/Fonts/msyhbd.ttc'

def font(sz):
    return ImageFont.truetype(FONT, sz)

def ctext(d, cx, y, txt, f, fill):
    bb = d.textbbox((0, 0), txt, font=f)
    d.text((cx - (bb[2] - bb[0]) / 2, y), txt, font=f, fill=fill)

def frame(d, c1, c2):
    d.rectangle([0, 0, W - 1, H - 1], outline=c1, width=4)
    d.rectangle([5, 5, W - 6, H - 6], outline=c2, width=1)

# 蓝底（信众主题色 #4142a5 → 底部微亮渐变）
img = Image.new('RGB', (W, H), '#4142a5')
d = ImageDraw.Draw(img)
for y in range(H):
    t = y / H
    d.line([(0, y), (W, y)], fill=(int(65 + 30 * t), int(66 + 40 * t), int(165 + 50 * t)))

# 圣辉（鹉主身后放射光芒，橙金色——标志图中的太阳圆盘）
cx, cy, r0 = 64, 62, 30
for i in range(16):
    a = i * math.pi / 8
    x0, y0 = cx + math.cos(a) * (r0 + 3), cy + math.sin(a) * (r0 + 3)
    x1, y1 = cx + math.cos(a) * (r0 + 13), cy + math.sin(a) * (r0 + 13)
    d.line([(x0, y0), (x1, y1)], fill='#e8a33c', width=5)
d.ellipse([cx - r0, cy - r0, cx + r0, cy + r0], fill='#f5e3ae', outline='#e8a33c', width=3)

# 鹉主剪影（蓝色鹦鹉：立姿侧影——头/钩喙/冠羽/身/尾羽/翅）
sil = '#2a4a9e'   # 剪影深蓝
sil2 = '#3a5cc0'  # 翼上亮色
# 尾羽（长直下垂，三根）
d.polygon([(58, 86), (54, 116), (58, 118), (63, 88)], fill=sil)
d.polygon([(64, 88), (62, 118), (66, 119), (69, 89)], fill=sil)
d.polygon([(70, 88), (70, 116), (74, 115), (75, 87)], fill=sil)
# 身体（立姿椭圆，微后仰）
d.ellipse([50, 52, 80, 96], fill=sil)
# 收起的翅（体侧亮色块）
d.pieslice([56, 60, 80, 96], 20, 200, fill=sil2)
# 头（圆，微昂）
d.ellipse([54, 32, 80, 56], fill=sil)
# 冠羽（三根小羽）
d.polygon([(58, 34), (52, 24), (56, 23), (62, 33)], fill=sil)
d.polygon([(64, 33), (62, 21), (66, 21), (68, 33)], fill=sil)
d.polygon([(70, 34), (72, 23), (76, 24), (74, 35)], fill=sil)
# 钩喙（鹉类标志：短而下勾）
d.polygon([(78, 42), (88, 46), (80, 54), (77, 50)], fill='#e8a33c')
# 眼
d.ellipse([68, 40, 74, 46], fill='#f5e3ae')
d.ellipse([70, 42, 73, 45], fill='#1a2440')
# 爪下栖木
d.rectangle([44, 96, 86, 100], fill='#7a5230')

frame(d, '#f5e3ae', '#8a90e0')
ctext(d, 64, 108, '鹉主杰瑞伟大', font(19), '#f5e3ae')
ctext(d, 64, 132, 'JERRY IS GREAT', font(11), '#bfc6f5')
ctext(d, 64, 146, '杰瑞的信众 敬上', font(10), '#9aa2e8')
img.save('public/textures/jerry_poster.png')
print('jerry_poster saved', img.size)
