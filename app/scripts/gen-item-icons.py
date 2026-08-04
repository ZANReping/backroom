# 生成物品像素图标（PIL 程序绘制，无外部素材，随项目同许可发布）
# 风格：32×32 原稿、深色描边、有限调色板、透明背景，最近邻放大 4 倍至 128×128
# （与既有 item_eaglecoin.png 等 54 张同一规格，显示层见 HUD.tsx ItemGlyph 的 PIXEL_ICON 表）。
# 物品清单直接读 src/game/items.ts；已有 png 的跳过（eaglecoin 等旧图不覆盖）；
# 若某件物品缺图且本脚本没有它的画法 → 报错退出（强制全覆盖）。
# 用法：cd app && python scripts/gen-item-icons.py
import os
import re
import sys
from PIL import Image, ImageDraw

S = 32          # 原稿尺寸
OUT = 128       # 输出尺寸（最近邻放大）
DIR = 'public/textures/icons/pixel'
INK = '#2a241c'  # 统一深色描边

def canvas():
    return Image.new('RGBA', (S, S), (0, 0, 0, 0))

def obox(d, xy, fill, outline=INK, w=1):
    """带深色描边的矩形"""
    d.rectangle(xy, fill=fill, outline=outline, width=w)

def steam(d, x, y, c='#c9c9c0'):
    """两缕热气（像素折线）"""
    for dx in (0, 5):
        d.point([(x + dx, y), (x + dx + 1, y - 1), (x + dx + 1, y - 2), (x + dx + 2, y - 3)], fill=c)

# ---------- 每件物品的画法（32×32 坐标系） ----------

def draw_disinfectant(d):
    # 消毒液：医用瓶——白瓶身 + 浅蓝药液 + 白盖 + 阿丽亚娜紫十字标签
    obox(d, [13, 2, 18, 5], '#e8e8e0')                     # 瓶盖
    obox(d, [14, 5, 17, 8], '#d8d4c8')                     # 瓶颈
    obox(d, [10, 8, 21, 28], '#e8f0f2')                    # 瓶身
    d.rectangle([11, 17, 20, 27], fill='#9fd0d8')          # 药液（下半）
    d.rectangle([10, 12, 21, 17], fill='#f4f6f0')          # 标签带
    d.rectangle([14, 13, 17, 16], fill='#8676e2')          # 紫十字（横竖两笔）
    d.rectangle([15, 12, 16, 17], fill='#8676e2')

def draw_welcomenote(d):
    # 致新流浪者的纸条：折起的横线纸（干净米色，区别于烧焦字条）
    obox(d, [8, 3, 23, 28], '#f0e6c0')                     # 纸
    d.polygon([(18, 28), (23, 23), (23, 28)], fill='#d8c9a0', outline=INK)  # 折角
    for y in (8, 12, 16, 20):                              # 横线
        d.line([(11, y), (20, y)], fill='#8a94a8', width=1)
    d.point([(12, 24), (13, 24), (14, 24)], fill='#6a6258')  # 落款墨点

def bowl(d, xy, body='#e8e2d2', rim='#c9c2ae'):
    # 通用碗体：半球碗 + 碗沿
    x0, y0, x1, y1 = xy
    d.pieslice([x0, y0 - (y1 - y0), x1, y1 + (y1 - y0)], 0, 180, fill=body, outline=INK)
    d.rectangle([x0, y0 - 1, x1, y0 + 1], fill=rim, outline=INK)

def draw_tomatosoup(d):
    # 番茄浓汤：白碗 + 红色汤面 + 罗勒叶 + 热气
    bowl(d, [7, 16, 24, 26])
    d.ellipse([9, 13, 22, 18], fill='#d94a3a', outline=INK)   # 汤面
    d.point([(12, 15), (13, 15), (18, 16)], fill='#e88a6a')   # 汤面高光
    d.point([(16, 14), (17, 14), (16, 15)], fill='#5a8a30')   # 罗勒碎
    steam(d, 13, 11)

def draw_gardensalad(d):
    # 田园沙拉：浅碗 + 三团菜叶 + 番茄丁 + 一片完整的叶子（爱子坚持）
    bowl(d, [6, 17, 25, 27])
    d.ellipse([8, 13, 15, 19], fill='#5a9a3a', outline=INK)   # 菜叶团
    d.ellipse([13, 12, 20, 19], fill='#6aaa4a', outline=INK)
    d.ellipse([17, 14, 23, 19], fill='#4a8a30', outline=INK)
    d.point([(11, 15), (19, 16)], fill='#d94a3a')             # 番茄丁
    d.point([(15, 14), (10, 17)], fill='#e8c93d')             # 椒丁
    d.polygon([(21, 11), (24, 13), (21, 15)], fill='#7ac97a', outline=INK)  # 完整叶片

def draw_garlicbread(d):
    # 蒜香烤面包：金黄面包块 + 烤色边缘 + 割口 + 蒜香香草碎
    d.rounded_rectangle([7, 10, 25, 22], radius=4, fill='#d9a85a', outline=INK)
    d.line([(9, 20), (23, 20)], fill='#b8863a', width=1)      # 烤色底边
    d.line([(12, 13), (15, 17)], fill='#f0d08a', width=1)     # 割口
    d.line([(17, 13), (20, 17)], fill='#f0d08a', width=1)
    d.point([(11, 15), (14, 19), (18, 15), (21, 18), (16, 12)], fill='#6a8a3a')  # 香草碎

def draw_pasta(d):
    # 番茄意面：平盘 + 面条旋 + 番茄酱
    d.ellipse([4, 14, 27, 26], fill='#e8e2d2', outline=INK)   # 盘
    d.ellipse([8, 16, 23, 24], fill='#e8d06a', outline=INK)   # 面条堆
    for y in (18, 20, 22):                                    # 面条纹理
        d.arc([9, y - 2, 22, y + 3], 0, 180, fill='#c9a83a')
    d.ellipse([12, 16, 19, 21], fill='#c94a3a')               # 番茄酱
    d.point([(14, 17), (16, 18)], fill='#e88a6a')             # 酱面高光

def draw_meatstew(d):
    # 炖肉煲：深色陶煲 + 浓汤 + 肉块 + 热气
    d.rectangle([8, 14, 24, 16], fill='#5a4a3a', outline=INK) # 煲沿
    d.rectangle([9, 16, 23, 26], fill='#4a3a2e', outline=INK) # 煲身
    d.rectangle([9, 14, 23, 17], fill='#8a5a3a')              # 浓汤面
    d.point([(12, 15), (18, 15), (15, 16)], fill='#6a3a2a')   # 肉块
    d.point([(20, 15)], fill='#d9c25a')                       # 土豆
    d.rectangle([11, 26, 21, 28], fill='#3a2e22', outline=INK)  # 底座
    steam(d, 13, 12)

def draw_pizza(d):
    # 意式披萨：焦边圆底 + 番茄奶酪 + 辣香肠丁 + 切缝
    d.ellipse([6, 6, 26, 26], fill='#d9a85a', outline=INK)    # 饼底
    d.ellipse([9, 9, 23, 23], fill='#c94a3a')                 # 番茄酱
    d.point([(12, 12), (18, 11), (20, 16), (14, 18), (11, 15), (17, 20)], fill='#e8c93d')  # 奶酪
    d.point([(13, 11), (19, 14), (15, 21)], fill='#8a2e22')   # 辣香肠
    d.line([(16, 9), (16, 23)], fill=INK, width=1)            # 切缝
    d.line([(9, 16), (23, 16)], fill=INK, width=1)

def draw_lasagna(d):
    # 千层面：方块切件——金黄顶 + 侧面可见的白酱/肉酱/面皮分层
    obox(d, [8, 15, 24, 27], '#f0e0c0')                     # 侧面基底（面皮色 + 描边）
    obox(d, [8, 9, 24, 15], '#e8b93c')                      # 烤金黄顶层
    d.point([(10, 11), (15, 12), (20, 10)], fill='#c98a2e')  # 焦斑
    for y in (17, 21):                                       # 肉酱层（横带）
        d.line([(9, y), (23, y)], fill='#a8452e', width=2)
    for y in (19, 25):                                       # 白酱/面皮层
        d.line([(9, y), (23, y)], fill='#e8d8a8', width=1)
    d.point([(11, 17), (19, 21)], fill='#8a3520')            # 肉酱颗粒

def draw_tomsspecial(d):
    # Tom 招牌炖菜：宽口金边煲 + 浓郁炖菜 + 月桂叶 + 星光（招牌）
    d.ellipse([5, 12, 27, 18], fill='#d9b13b', outline=INK)   # 金边煲口
    d.ellipse([7, 13, 25, 17], fill='#a85a2a')                # 炖菜面
    d.point([(12, 14), (17, 15), (20, 14)], fill='#7a3a1e')   # 肉块
    d.point([(14, 15), (22, 15)], fill='#d9c25a')             # 蔬菜
    d.pieslice([6, 15, 26, 29], 0, 180, fill='#b8912e', outline=INK)  # 煲身（金铜）
    d.point([(10, 22), (22, 22)], fill='#8a6a1e')             # 煲身高光暗部
    steam(d, 13, 10)
    d.point([(25, 7), (26, 8), (25, 9), (24, 8)], fill='#ffd94d')  # 招牌星光

def draw_grilledsteak(d):
    # 烤兽肉排：煎烤色肉排 + 烤架焦纹 + 油脂边
    d.rounded_rectangle([6, 10, 26, 22], radius=6, fill='#8a5a3a', outline=INK)
    d.arc([7, 9, 25, 21], 180, 360, fill='#d8b8a8')           # 油脂边（上缘）
    for x in (11, 16, 21):                                    # 烤架焦纹
        d.line([(x, 11), (x - 2, 21)], fill='#3a2418', width=1)
    d.point([(12, 13), (18, 15), (14, 18)], fill='#a86a4a')   # 肉面高光

def draw_jambread(d):
    # 果酱面包：吐司片 + 厚厚果酱（溢出流下）
    d.rounded_rectangle([8, 8, 24, 12], radius=4, fill='#d9a85a', outline=INK)  # 吐司拱顶
    d.rectangle([8, 12, 24, 26], fill='#e8c98a', outline=INK) # 吐司身
    d.rectangle([9, 12, 23, 18], fill='#b03048')              # 果酱层
    d.rectangle([11, 18, 13, 22], fill='#b03048')             # 果酱流滴
    d.rectangle([18, 18, 19, 21], fill='#b03048')
    d.point([(11, 13), (16, 14), (20, 13)], fill='#e06a80')   # 果酱高光

DRAW = {
    'disinfectant': draw_disinfectant,
    'welcomenote': draw_welcomenote,
    'tomatosoup': draw_tomatosoup,
    'gardensalad': draw_gardensalad,
    'garlicbread': draw_garlicbread,
    'pasta': draw_pasta,
    'meatstew': draw_meatstew,
    'pizza': draw_pizza,
    'lasagna': draw_lasagna,
    'tomsspecial': draw_tomsspecial,
    'grilledsteak': draw_grilledsteak,
    'jambread': draw_jambread,
}

# ---------- 物品清单：直接解析 items.ts ----------
src = open('src/game/items.ts', encoding='utf-8').read()
types = re.findall(r"^  (\w+): \{ type: '", src, re.M)
if not types:
    sys.exit('未能从 items.ts 解析到物品清单')
print(f'物品共 {len(types)} 件')

os.makedirs(DIR, exist_ok=True)
gen, skip = [], []
missing_draw = []
for t in types:
    path = f'{DIR}/item_{t}.png'
    if os.path.exists(path):
        skip.append(t)  # 已有 png（eaglecoin 等旧图）——跳过不覆盖
        continue
    fn = DRAW.get(t)
    if not fn:
        missing_draw.append(t)
        continue
    img = canvas()
    fn(ImageDraw.Draw(img))
    img = img.resize((OUT, OUT), Image.NEAREST)
    img.save(path)
    gen.append(t)

for t in gen:
    print(f'  生成 {t}')
if skip:
    print(f'跳过（已有 png）：{len(skip)} 件')
if missing_draw:
    print('缺画法：' + ' '.join(missing_draw))
    sys.exit(1)
print(f'完成：新生成 {len(gen)} 张，全部物品均有像素图标')
