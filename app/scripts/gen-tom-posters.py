# 生成 Tom 的餐馆装饰贴图（PIL 程序绘制，无外部素材，随项目同许可发布）
# 输出：app/public/textures/tom_menu.png（128×160 菜单黑板：深绿黑板底 + 粉笔字「今日菜单」+ 菜名）
#       app/public/textures/tom_poster.png（128×160 暖红招牌：「Tom 的餐馆」）
# 用法：cd app && python scripts/gen-tom-posters.py
import random

from PIL import Image, ImageDraw, ImageFont

FONT = 'C:/Windows/Fonts/msyhbd.ttc'
RED = '#b04030'


def font(sz):
    return ImageFont.truetype(FONT, sz)


def ctext(d, cx, y, txt, f, fill):
    bb = d.textbbox((0, 0), txt, font=f)
    d.text((cx - (bb[2] - bb[0]) / 2, y), txt, font=f, fill=fill)


# 1) tom_menu.png：128×160 菜单黑板（深绿黑板底 + 粉笔字 + 木框）
W, H = 128, 160
img = Image.new('RGB', (W, H), '#26352c')  # 深绿黑板
d = ImageDraw.Draw(img)
rnd = random.Random(104)
# 黑板做旧：稀疏粉笔灰噪点
for _ in range(260):
    x, y = rnd.randrange(W), rnd.randrange(H)
    d.point((x, y), fill='#2e3f34')
# 木框
d.rectangle([0, 0, W - 1, H - 1], outline='#7a5a34', width=5)
d.rectangle([4, 4, W - 5, H - 5], outline='#5a4230', width=1)
CHALK = '#e8e4d8'
CHALK_DIM = '#b8beb0'
ctext(d, 64, 12, '今日菜单', font(18), CHALK)
d.line([22, 38, 106, 38], fill=CHALK_DIM, width=1)
MENU = [
    ('番茄浓汤', '罐头×1'),
    ('蒜香烤面包', '罐头×1'),
    ('田园沙拉', '干果×1'),
    ('番茄意面', '罐头×2'),
    ('炖肉煲', '兽肉×1'),
    ('意式披萨', '杏仁水+罐头'),
    ('千层面', '兽肉×2'),
    ('招牌炖菜', '面议'),
]
y = 42
for name, price in MENU:
    d.text((12, y), name, font=font(10), fill=CHALK)
    bb = d.textbbox((0, 0), price, font=font(9))
    d.text((116 - (bb[2] - bb[0]), y + 1), price, font=font(9), fill=CHALK_DIM)
    y += 12
d.line([22, y + 2, 106, y + 2], fill=CHALK_DIM, width=1)
ctext(d, 64, y + 6, '来料加工 · 请到前台', font(9), '#d9c96a')
img.save('public/textures/tom_menu.png')

# 2) tom_poster.png：128×160 暖红招牌海报（暖红底 + 奶油字 + 餐盘图案）
img = Image.new('RGB', (W, H), RED)
d = ImageDraw.Draw(img)
# 做旧斑点
for _ in range(200):
    x, y = rnd.randrange(W), rnd.randrange(H)
    d.point((x, y), fill='#a83a2c')
d.rectangle([0, 0, W - 1, H - 1], outline='#f0e0c8', width=4)
d.rectangle([5, 5, W - 6, H - 6], outline='#d8a888', width=1)
# 餐盘（俯视白盘 + 餐叉餐刀）
d.ellipse([40, 18, 88, 54], outline='#f0e0c8', width=3)
d.ellipse([50, 26, 78, 46], outline='#e8c9a0', width=1)
d.line([30, 24, 30, 50], fill='#f0e0c8', width=2)  # 叉柄
for fx in (26, 30, 34):
    d.line([fx, 22, fx, 28], fill='#f0e0c8', width=1)  # 叉齿
d.line([98, 22, 98, 50], fill='#f0e0c8', width=2)  # 刀
ctext(d, 64, 66, 'Tom 的餐馆', font(17), '#f8ecd8')
ctext(d, 64, 92, "TOM'S DINER", font(10), '#e8c9a0')
d.line([26, 110, 102, 110], fill='#e8c9a0', width=1)
ctext(d, 64, 116, '热汤 · 烤面包 · 炉火', font(10), '#f0e0c8')
ctext(d, 64, 132, '食材换菜 · 来料加工', font(10), '#f0e0c8')
img.save('public/textures/tom_poster.png')

print('tom_menu.png + tom_poster.png saved')
