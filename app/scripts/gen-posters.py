# 生成商人之家商业海报贴图（PIL 程序绘制，无外部素材，随项目同许可发布）
# 输出：app/public/textures/poster_{sale,almond,food,tech,fashion}.png（128×160 竖版）
# 用法：cd app && python scripts/gen-posters.py
from PIL import Image, ImageDraw, ImageFont

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

# 1) 全场特惠（红底黄字 + 爆炸贴）
img = Image.new('RGB', (W, H), '#b02020')
d = ImageDraw.Draw(img)
frame(d, '#ffd94d', '#ff8a5a')
d.polygon([(64, 18), (76, 34), (96, 30), (96, 50), (112, 60), (100, 74), (104, 94), (84, 94),
           (76, 112), (60, 100), (42, 108), (38, 88), (20, 80), (32, 64), (28, 44), (48, 44)], fill='#ffd94d')
ctext(d, 64, 44, 'SALE', font(26), '#b02020')
ctext(d, 64, 76, '全场五折', font(20), '#b02020')
ctext(d, 64, 122, '商人之家 周年庆', font(13), '#ffe8c0')
ctext(d, 64, 140, '仅此一周', font(11), '#ffb0a0')
img.save('public/textures/poster_sale.png')

# 2) 杏仁水（蓝白渐变 + 瓶剪影）
img = Image.new('RGB', (W, H), '#1c4a6e')
d = ImageDraw.Draw(img)
for y in range(H):
    t = y / H
    d.line([(0, y), (W, y)], fill=(int(28 + 60 * t), int(74 + 90 * t), int(110 + 100 * t)))
frame(d, '#bfe8ff', '#5aa8d8')
d.rectangle([52, 42, 76, 108], fill='#cfe8f8')          # 瓶身
d.rectangle([56, 30, 72, 42], fill='#cfe8f8')          # 瓶颈
d.rectangle([54, 24, 74, 30], fill='#8ac4e8')          # 瓶盖
d.rectangle([52, 66, 76, 88], fill='#f0f6fa')          # 标签
ctext(d, 64, 118, '杏仁水', font(20), '#eaf6ff')
ctext(d, 64, 142, '生命之源 · 随处补给', font(11), '#9fd0ee')
img.save('public/textures/poster_almond.png')

# 3) 美食广场（橙底 + 汉堡剪影）
img = Image.new('RGB', (W, H), '#d88020')
d = ImageDraw.Draw(img)
frame(d, '#fff0c8', '#ffb060')
d.ellipse([34, 26, 94, 60], fill='#e8a840')            # 上包
d.rectangle([34, 56, 94, 64], fill='#7a4a20')          # 肉饼
d.rectangle([34, 64, 94, 70], fill='#5a8a30')          # 菜
d.pieslice([34, 58, 94, 82], 0, 180, fill='#e8a840')   # 下包
ctext(d, 64, 94, '美食广场', font(22), '#fff0c8')
ctext(d, 64, 124, 'FOOD COURT', font(13), '#ffd090')
ctext(d, 64, 142, '热食现做 · 南区尽头', font(10), '#ffe0b0')
img.save('public/textures/poster_food.png')

# 4) 数码科技（深蓝 + 青色屏）
img = Image.new('RGB', (W, H), '#101828')
d = ImageDraw.Draw(img)
frame(d, '#30d8c8', '#1a4a5a')
d.rectangle([30, 26, 98, 72], outline='#30d8c8', width=3)   # 显示器
d.rectangle([36, 32, 92, 66], fill='#0a3a44')               # 屏
for i in range(3):
    d.rectangle([40 + i * 18, 40, 52 + i * 18, 52], fill='#30f0e0')  # 屏上内容块
d.line([64, 72, 64, 84], fill='#30d8c8', width=3)
d.rectangle([48, 84, 80, 88], fill='#30d8c8')               # 底座
ctext(d, 64, 98, '数码科技', font(22), '#30f0e0')
ctext(d, 64, 126, 'TECH & GEAR', font(12), '#20a8a0')
ctext(d, 64, 142, '以物易物 · 只收压印币', font(10), '#188088')
img.save('public/textures/poster_tech.png')

# 5) 时尚新装（粉底 + 连衣裙剪影）
img = Image.new('RGB', (W, H), '#c05070')
d = ImageDraw.Draw(img)
frame(d, '#ffd8e8', '#ff90b8')
d.polygon([(64, 24), (74, 32), (70, 50), (86, 94), (42, 94), (58, 50), (54, 32)], fill='#ffd8e8')  # 连衣裙
d.rectangle([58, 50, 70, 56], fill='#ff90b8')            # 腰带
ctext(d, 64, 104, '时尚新装', font(22), '#ffe8f0')
ctext(d, 64, 132, 'NEW ARRIVAL', font(12), '#ffb0cc')
ctext(d, 64, 146, '换季上新', font(10), '#ffc8dc')
img.save('public/textures/poster_fashion.png')

print('posters x5 saved')
