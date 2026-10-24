# 生成物品像素图标（PIL 程序绘制，无外部素材，随项目同许可发布）
# 风格：32×32 原稿、深色描边、有限调色板、透明背景，最近邻放大 4 倍至 128×128
# （与既有 item_eaglecoin.png 等 54 张同一规格，显示层见 HUD.tsx ItemGlyph 的 PIXEL_ICON 表）。
# 物品清单直接读 src/game/content/items.ts；已有 png 的跳过（eaglecoin 等旧图不覆盖）；
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

def _longgun(d, barrel, recv, stock, extra=None):
    # 长枪通用：左下枪托 → 右上枪口的斜线
    for i in range(19):
        x, y = 11 + i, 18 - i * 0.8
        d.point([(x, int(y)), (x, int(y) + 1)], fill=barrel)
    d.line([(12, 16), (29, 2)], fill='#7a8088')
    obox(d, [8, 17, 13, 21], recv)
    d.polygon([(9, 21), (1, 27), (2, 30), (6, 30), (11, 22)], fill=stock, outline=INK)
    d.line([(3, 27), (9, 22)], fill='#8a5034')
    if extra: extra(d)

def draw_leverrifle(d):
    def ex(d):
        d.line([(13, 20), (13, 24)], fill=INK); d.arc([10, 21, 16, 27], 20, 200, fill='#2c333c')  # 杠杆指环
        d.line([(15, 18), (26, 9)], fill='#3a3d42')  # 管式弹仓
        d.polygon([(14, 17), (20, 13), (21, 15), (16, 18)], fill='#6e3c24', outline=INK)  # 护木
    _longgun(d, '#2c333c', '#c9a03c', '#6a3822', ex)

def draw_musket(d):
    def ex(d):
        d.polygon([(13, 18), (29, 6), (30, 8), (15, 20)], fill='#6a3822', outline=INK)  # 全长前托
        for t in (17, 22, 27): d.line([(t, int(18 - (t - 11) * 0.8)), (t + 1, int(20 - (t - 11) * 0.8))], fill='#d0d4d6')  # 枪箍
        d.point([(12, 16)], fill='#b9763c')  # 火帽
    _longgun(d, '#9ea2a4', '#9ea2a4', '#6a3822', ex)

def draw_trapdoor(d):
    def ex(d):
        d.polygon([(13, 18), (28, 7), (29, 9), (15, 20)], fill='#5e3420', outline=INK)
        obox(d, [10, 15, 14, 17], '#8e8a86')  # 活门
        d.line([(15, 14), (17, 13)], fill='#2c333c')  # 表尺
    _longgun(d, '#2a3038', '#8e8a86', '#5e3420', ex)

def draw_revolver(d):
    obox(d, [6, 10, 28, 14], '#2c333c')        # 枪管 + 退壳杆护套
    d.line([(7, 11), (27, 11)], fill='#56606c')
    d.line([(16, 15), (27, 15)], fill='#3a3d42')
    obox(d, [4, 9, 12, 17], '#8e8a86')         # 框架
    d.point([(6, 11), (9, 14), (11, 12)], fill='#5a6a9a'); d.point([(8, 15)], fill='#b39a5a')
    obox(d, [6, 10, 11, 16], '#3a3f46')        # 转轮
    d.line([(6, 13), (11, 13)], fill='#22262c')
    d.polygon([(4, 17), (9, 17), (8, 29), (2, 29), (1, 25)], fill='#6a3822', outline=INK)  # 握把
    d.line([(3, 26), (6, 19)], fill='#8a5034')
    d.arc([7, 15, 13, 21], 0, 180, fill='#c9a03c')  # 黄铜护圈
    d.polygon([(3, 7), (5, 9), (3, 10)], fill='#8e8a86', outline=INK)  # 击锤
    d.point([(27, 9)], fill='#c9c9c9')

def _carts(d, case, tip, n=3, long=False, paper=False):
    for i in range(n):
        x = 6 + i * 7
        top = 4 if long else 9
        if paper:
            obox(d, [x, 6, x + 6, 27], '#d8ccb0'); d.line([(x + 1, 7), (x + 1, 26)], fill='#efe6d0')
            d.ellipse([x, 3, x + 6, 9], fill='#d8ccb0', outline=INK); d.line([(x + 2, 27), (x + 4, 29)], fill='#6a5034')
            d.line([(x, 10), (x + 6, 10)], fill='#6a5034')
            continue
        d.ellipse([x + 1, top - 3, x + 5, top + 2], fill=tip, outline=INK)  # 弹头
        obox(d, [x, top, x + 6, 27], case)
        d.line([(x + 1, top + 1), (x + 1, 26)], fill='#f4e2a8')
        obox(d, [x - 1, 27, x + 7, 28], case)  # 底缘

def draw_cart_4440(d): _carts(d, '#c9a45a', '#8e8e92')
def draw_cart_4570(d): _carts(d, '#c9a45a', '#7a7a80', long=True)
def draw_cart_paper(d): _carts(d, '', '', paper=True)


def draw_dbshotgun(d):
    # 双管猎枪：从左下（枪托）到右上（枪口）斜放，胡桃木托 + 彩纹机匣 + 发蓝双管 + 护木
    for i in range(18):                                      # 双管（两条平行斜线）
        x, y = 12 + i, 17 - i * 0.78
        d.point([(x, int(y)), (x, int(y) + 1)], fill='#2c333c')
        d.point([(x, int(y) + 2)], fill='#1a1e24')
    d.line([(13, 15), (29, 3)], fill='#56606c')              # 管上高光
    d.point([(30, 3)], fill='#e8d9b0')                       # 准星珠
    d.polygon([(14, 18), (21, 13), (22, 15), (16, 19)], fill='#6e3c24', outline=INK)  # 护木
    obox(d, [9, 17, 14, 21], '#8e8a86')                      # 机匣（渗碳花纹）
    d.point([(10, 18), (12, 20), (13, 18)], fill='#5a6a9a'); d.point([(11, 19)], fill='#b39a5a')
    d.polygon([(10, 21), (2, 27), (3, 30), (7, 30), (12, 22)], fill='#6a3822', outline=INK)  # 枪托
    d.line([(4, 27), (10, 22)], fill='#8a5034')              # 木纹高光
    d.line([(2, 28), (4, 30)], fill='#2a2c30')               # 托底板
    d.arc([10, 20, 15, 25], 0, 180, fill=INK)                # 扳机护圈
    d.point([(12, 22), (13, 22)], fill='#c9b07a')            # 双扳机

def _shell(d, hull, band, head='#c9a45a', dark='#8a6a24'):
    # 一发竖放的 12 号弹壳 + 后面斜靠的一发
    obox(d, [15, 6, 22, 24], hull)                           # 后面那发
    obox(d, [15, 24, 22, 28], head)
    obox(d, [9, 4, 17, 23], hull)                            # 纸壳
    d.line([(10, 5), (10, 22)], fill=band)                   # 纸壳高光
    d.line([(10, 13), (16, 13)], fill=band)                  # 印字带
    d.line([(9, 4), (17, 4)], fill=dark)                     # 星形卷口
    d.point([(12, 5), (14, 5)], fill=dark)
    obox(d, [8, 23, 18, 28], head)                           # 黄铜底座
    d.line([(8, 28), (18, 28)], fill=dark)                   # 底缘
    d.point([(10, 25), (11, 25)], fill='#f4e2a8')            # 反光

def draw_shell_buck(d): _shell(d, '#a8322a', '#d8665a')
def draw_shell_bird(d): _shell(d, '#3f6a3a', '#76a06a')
def draw_shell_clump(d):
    _shell(d, '#d4a62a', '#fff0a8', head='#8a6a24', dark='#5a4210')
    d.point([(13, 9), (12, 10), (14, 10), (13, 11)], fill='#5a4210')  # 鎏金兵械库星标


def draw_disinfectant(d):
    # 消毒液：医用瓶——白瓶身 + 浅蓝药液 + 白盖 + 阿丽亚娜紫十字标签
    obox(d, [13, 2, 18, 5], '#e8e8e0')                     # 瓶盖
    obox(d, [14, 5, 17, 8], '#d8d4c8')                     # 瓶颈
    obox(d, [10, 8, 21, 28], '#e8f0f2')                    # 瓶身
    d.rectangle([11, 17, 20, 27], fill='#9fd0d8')          # 药液（下半）
    d.rectangle([10, 12, 21, 17], fill='#f4f6f0')          # 标签带
    d.rectangle([14, 13, 17, 16], fill='#8676e2')          # 紫十字（横竖两笔）
    d.rectangle([15, 12, 16, 17], fill='#8676e2')


def draw_luckymilk(d):
    # 幸运豆奶（v54，Object 28）：豆奶纸盒——乳白盒身 + 绿顶折封口 + 四叶草标
    obox(d, [10, 6, 22, 28], '#eef0e8')                     # 盒身
    d.polygon([(10, 6), (16, 2), (22, 6)], fill='#7ab06a', outline=INK)  # 顶折（屋顶形）
    d.rectangle([15, 2, 17, 6], fill='#5a8a4e')             # 顶折脊
    d.rectangle([10, 15, 22, 21], fill='#a8d89a')           # 标带（浅绿）
    d.point([(14, 17), (16, 17), (15, 16), (15, 18), (17, 18)], fill='#3a7a2e')  # 四叶草
    d.point([(11, 24), (20, 24), (11, 25), (20, 25)], fill='#c9d4c0')   # 盒身细字线

def draw_nightvision(d):
    # 夜视眼镜：厚实橄榄色头带、双目增像筒、青绿镜片与中央鼻梁。
    d.line([(4, 10), (8, 6), (24, 6), (28, 10)], fill='#343c32', width=3)
    d.rectangle([7, 9, 14, 20], fill='#4f5c4e', outline=INK)
    d.rectangle([18, 9, 25, 20], fill='#4f5c4e', outline=INK)
    d.rectangle([9, 18, 14, 25], fill='#303a32', outline=INK)
    d.rectangle([18, 18, 23, 25], fill='#303a32', outline=INK)
    d.rectangle([14, 12, 18, 16], fill='#3a453a', outline=INK)
    d.rectangle([10, 20, 13, 23], fill='#78c98a', outline='#b9efbd')
    d.rectangle([19, 20, 22, 23], fill='#78c98a', outline='#b9efbd')
    d.point([(10, 20), (19, 20)], fill='#e0ffe2')
    d.rectangle([14, 7, 18, 10], fill='#687366', outline=INK)
    d.point([(6, 12), (26, 12), (16, 8)], fill='#899382')

def draw_welcomenote(d):
    # 致新流浪者的纸条：折起的横线纸（干净米色，区别于烧焦字条）
    obox(d, [8, 3, 23, 28], '#f0e6c0')                     # 纸
    d.polygon([(18, 28), (23, 23), (23, 28)], fill='#d8c9a0', outline=INK)  # 折角
    for y in (8, 12, 16, 20):                              # 横线
        d.line([(11, y), (20, y)], fill='#8a94a8', width=1)
    d.point([(12, 24), (13, 24), (14, 24)], fill='#6a6258')  # 落款墨点

def draw_jerryflyer(d):
    # 蓝羽传单：纵向折纸、蓝色鹦鹉剪影、黄色眼点和底部短线
    obox(d, [8, 3, 23, 28], '#f0ead8')
    d.polygon([(18, 3), (23, 8), (18, 8)], fill='#d6ccb5', outline=INK)
    d.polygon([(15, 9), (20, 12), (19, 19), (15, 22), (11, 18), (12, 12)], fill='#315d91', outline=INK)
    d.polygon([(14, 12), (9, 15), (12, 18), (16, 16)], fill='#477db2', outline=INK)
    d.polygon([(19, 13), (23, 14), (20, 16)], fill='#264b7a', outline=INK)
    d.point([(19, 11)], fill='#e8c94d')
    for y, x in ((22, 11), (24, 10), (26, 12)):
        d.line([(x, y), (x + 9, y)], fill='#477db2')

def draw_fakelog(d):
    # 流浪者日志残页：泛黄撕边纸、褐灰笔记线和蓝色路线箭头
    d.polygon([(7, 4), (24, 3), (23, 27), (19, 29), (15, 27), (11, 29), (8, 26)], fill='#e6d8b6', outline=INK)
    for y in (9, 13, 17, 21):
        d.line([(10, y), (21, y)], fill='#8f8270')
    d.line([(12, 24), (17, 24), (20, 22)], fill='#3e78b2')
    d.line([(20, 22), (18, 22)], fill='#3e78b2')
    d.line([(20, 22), (19, 24)], fill='#3e78b2')

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

def draw_ratmeat(d):
    # v79 尸鼠肉：一条细长卷曲的暗红瘦肉 + 一端的细骨 + 霉斑
    d.polygon([(6, 18), (10, 13), (17, 12), (24, 14), (27, 18), (22, 21), (14, 22), (8, 21)], fill='#9a4a44', outline=INK)
    d.line([(9, 17), (15, 15), (23, 16)], fill='#c87a6a', width=1)           # 筋膜高光
    d.rectangle([3, 16, 7, 18], fill='#e8e2d2', outline=INK)                 # 细骨
    d.point([(2, 15), (2, 19)], fill='#e8e2d2')
    d.point([(18, 19), (20, 18), (12, 19)], fill='#6a7a4a')                  # 霉斑

def draw_jambread(d):
    # 果酱面包：吐司片 + 厚厚果酱（溢出流下）
    d.rounded_rectangle([8, 8, 24, 12], radius=4, fill='#d9a85a', outline=INK)  # 吐司拱顶
    d.rectangle([8, 12, 24, 26], fill='#e8c98a', outline=INK) # 吐司身
    d.rectangle([9, 12, 23, 18], fill='#b03048')              # 果酱层
    d.rectangle([11, 18, 13, 22], fill='#b03048')             # 果酱流滴
    d.rectangle([18, 18, 19, 21], fill='#b03048')
    d.point([(11, 13), (16, 14), (20, 13)], fill='#e06a80')   # 果酱高光

def draw_velvetcake(d):
    # 丝绒蛋糕：米白褶纸托、深红分层糕体、奶油夹心、椭圆奶油顶和短蜡烛
    d.polygon([(7, 19), (25, 19), (23, 28), (9, 28)], fill='#e8dfcf', outline=INK)
    for x in (10, 13, 17, 21):
        d.line([(x, 20), (x + 1, 27)], fill='#b8ad9c')
    d.rectangle([8, 14, 24, 20], fill='#8e1424', outline=INK)
    d.rectangle([9, 18, 23, 20], fill='#6f101d')
    d.rectangle([9, 12, 23, 15], fill='#f3e7d6', outline=INK)
    d.rectangle([10, 8, 22, 13], fill='#8e1424', outline=INK)
    d.ellipse([9, 5, 23, 11], fill='#f3e7d6', outline=INK)
    d.point([(12, 7), (16, 6), (20, 8)], fill='#fff7e9')
    d.rectangle([15, 2, 17, 6], fill='#e8c36a', outline=INK)
    d.point([(16, 1)], fill='#f4a33a')

def draw_capacitor(d):
    # 电容器「瓶装闪电」（Object 42）：玻璃烧瓶 + 软木塞 + 瓶中疾走的蓝色闪电
    obox(d, [13, 2, 18, 6], '#a8865a')                             # 软木塞
    obox(d, [14, 6, 17, 9], '#b8e2ee')                             # 瓶颈玻璃
    d.polygon([(11, 9), (20, 9), (24, 28), (7, 28)], fill='#c8e8f2', outline=INK)   # 梯形瓶身
    d.polygon([(13, 13), (19, 13), (21, 26), (10, 26)], fill='#2a6a9a')             # 瓶内电荷光晕（深蓝）
    d.line([(16, 11), (13, 18), (16, 18), (12, 26)], fill='#eaf7ff', width=1)       # 闪电折线
    d.point([(15, 11), (14, 12), (17, 15)], fill='#ffffff')                         # 闪电高光
    d.point([(9, 12), (8, 13)], fill='#e8f4f8')                                     # 瓶身玻璃反光

def draw_parcel(d):
    # 物流包裹（v43）：牛皮纸箱 + 十字胶带 + 面单 + BNTG 天平章
    obox(d, [5, 8, 26, 27], '#a08653')                 # 箱体
    d.rectangle([5, 12, 26, 15], fill='#d8cfb0')       # 横向胶带
    d.rectangle([14, 8, 17, 27], fill='#d8cfb0')       # 纵向胶带
    d.line([(5, 8), (26, 8)], fill='#7a6a42')          # 箱顶棱线
    obox(d, [18, 17, 25, 24], '#f0e6c0')               # 面单
    for y in (19, 21, 23):                             # 面单文字行
        d.line([(19, y), (24, y)], fill='#8a8474')
    obox(d, [7, 18, 12, 25], '#566c5a')                # BNTG 天平章（绿方章）
    d.line([(9, 20), (10, 20)], fill='#d8cfb0')        # 天平横杆
    d.point([(9, 21), (8, 22), (11, 22)], fill='#d8cfb0')

def _anomalocaris(d, body, dark, fin, eye, tail='#9fb6d8', crumbs=None, motion=False, droop=0):
    # v81：旱虾（Entity 20）奇虾体型俯视：叶状鳍片两排 + 分节躯干 + 长柄黑眼 + 弯钩前附肢 + 竖起的尾扇
    for i, x in enumerate(range(7, 22, 3)):          # 两侧鳍片（中段最长）
        L = 6 + (3 if 2 <= i <= 3 else 2 if i in (1, 4) else 0)
        d.polygon([(x + 1, 14), (x - 3, 14 - L + droop), (x - 1, 14 - L + droop), (x + 3, 13)], fill=fin, outline=INK)
        d.polygon([(x + 1, 18), (x - 3, 18 + L - droop), (x - 1, 18 + L - droop), (x + 3, 19)], fill=fin, outline=INK)
    d.polygon([(5, 14), (1, 10), (3, 16), (1, 22), (5, 18)], fill=tail, outline=INK)   # 尾扇（尖端蓝灰）
    d.polygon([(23, 14), (16, 13), (8, 14), (5, 16), (8, 18), (16, 19), (23, 18)], fill=body, outline=INK)  # 躯干
    for x in (8, 10, 12, 14, 16, 18, 20):              # 节间暗缝
        d.line([(x, 14), (x, 18)], fill=dark)
    d.ellipse([21, 13, 27, 19], fill=body, outline=INK)  # 头甲
    d.line([(24, 14), (25, 11)], fill=dark); d.line([(24, 18), (25, 21)], fill=dark)   # 眼柄
    d.ellipse([24, 8, 27, 11], fill=eye, outline=INK); d.ellipse([24, 21, 27, 24], fill=eye, outline=INK)
    if eye == '#101216':
        d.point([(25, 9), (25, 22)], fill='#e8eef8')    # 眼球高光
    d.line([(27, 15), (29, 14), (30, 15), (30, 17)], fill=body)    # 前附肢（向下卷）
    d.line([(27, 17), (29, 18), (30, 19), (29, 21)], fill=body)
    d.point([(29, 16), (29, 20), (28, 19)], fill=dark)
    if crumbs:
        for (x, y) in ((9, 15), (12, 17), (15, 15), (18, 17), (20, 15), (11, 16), (17, 14), (23, 16)):
            d.point([(x, y), (x + 1, y)], fill=crumbs)
    if motion:
        d.line([(1, 4), (4, 4)], fill='#e8d8b0'); d.line([(2, 27), (5, 27)], fill='#e8d8b0')  # 划动的小短线

def draw_shrimp(d):
    # 旱虾（已死）：颜色发暗、鳍片耷拉、眼睛无光
    _anomalocaris(d, '#a35632', '#6e3018', '#cfa07a', '#2a2a2e', tail='#a8b0bc', droop=2)

def draw_liveshrimp(d):
    # 活旱虾：鲜亮的红褐背甲、张开的浅杏色鳍片、亮黑眼
    _anomalocaris(d, '#c25a2c', '#7a3218', '#f0b98a', '#101216', motion=True)

def draw_friedshrimp(d):
    # 酥炸旱虾：金黄裹粉 + 炸脆的鳍片，眼睛炸白
    _anomalocaris(d, '#e0a448', '#a86a22', '#d99a4a', '#efe6d0', tail='#c98a3a', crumbs='#a86a22')

def draw_bento(d):
    # 自制便当（Object 70 公文包）：蓝盒身 + 米白盒盖 + 红橡皮筋 + 胶布名签
    obox(d, [5, 13, 27, 26], '#3c6a8a')                    # 盒身
    d.rectangle([6, 22, 26, 25], fill='#2e5470')           # 盒身下缘阴影
    obox(d, [4, 9, 28, 14], '#d8d2bf')                     # 盒盖
    d.rectangle([5, 10, 27, 10], fill='#f0ecdf')           # 盒盖高光
    d.rectangle([17, 8, 19, 26], fill='#a83a2a')           # 橡皮筋
    d.rectangle([8, 11, 13, 12], fill='#8a8270')           # 名签胶布

def draw_firesalt(d):
    # 火盐晶体（Object 15）：三枚橙色半透明碎晶
    d.polygon([(8, 10), (13, 6), (16, 12), (12, 17)], fill='#e8823c', outline=INK)
    d.polygon([(17, 15), (23, 11), (26, 17), (21, 22)], fill='#f59a4a', outline=INK)
    d.polygon([(9, 20), (14, 17), (17, 23), (12, 26)], fill='#d96a2a', outline=INK)
    d.point([(10, 9), (11, 10), (19, 15), (20, 16), (11, 21)], fill='#ffd9a0')  # 高光

def draw_liquidpain(d):
    # 液态痛苦（Object 48）：杏仁水瓶型 + 淡红液体（危险红盖）
    obox(d, [13, 2, 18, 5], '#c94a3a')                     # 红盖
    obox(d, [14, 5, 17, 8], '#d8d4c8')                     # 瓶颈
    obox(d, [10, 8, 21, 28], '#e8e2d8')                    # 瓶身
    d.rectangle([11, 14, 20, 27], fill='#d94a3a')          # 淡红液体
    d.rectangle([11, 14, 20, 15], fill='#e87a6a')          # 液面
    d.point([(12, 10), (13, 10), (12, 11)], fill='#f4f6f0')  # 玻璃反光

# ---------- Object 5 糖果（散装=糖纸包裹单颗；袋装=一包八颗） ----------
def candy_loose(body_fn):
    return body_fn

def draw_candysilver(d):
    # 银舌头：舌头形金属糖
    d.pieslice([8, 8, 24, 26], 0, 180, fill='#c9c9d4', outline=INK)
    d.pieslice([13, 12, 19, 24], 0, 180, fill='#e8e8f0')
    d.point([(11, 11), (12, 12)], fill='#f4f4f8')

def draw_candybullet(d):
    # 咀嚼子弹：银箔子弹巧克力
    d.polygon([(16, 4), (20, 10), (20, 24), (16, 28), (12, 24), (12, 10)], fill='#9a9aa8', outline=INK)
    d.rectangle([12, 18, 20, 22], fill='#6a6a76', outline=INK)
    d.point([(17, 7), (18, 8)], fill='#e8e8f0')

def draw_candygun(d):
    # 枪糖：金属小手枪
    d.rectangle([6, 10, 24, 16], fill='#5a5a64', outline=INK)      # 滑套
    d.rectangle([24, 12, 27, 15], fill='#4a4a54', outline=INK)     # 枪口
    d.polygon([(10, 16), (16, 16), (14, 27), (8, 27)], fill='#6a4a3a', outline=INK)  # 握把
    d.point([(8, 12), (9, 12)], fill='#b8b8c8')

def draw_candystanley(d):
    # 纸片人斯坦利：扁平人形糖纸
    d.ellipse([12, 3, 20, 11], fill='#d0d0c0', outline=INK)        # 头
    d.polygon([(16, 11), (8, 27), (24, 27)], fill='#d0d0c0', outline=INK)  # 身
    d.line([(9, 16), (4, 21)], fill=INK); d.line([(23, 16), (28, 21)], fill=INK)  # 手臂
    d.point([(14, 7), (18, 7)], fill=INK)

def draw_candywaste(d):
    # 危害废料：迷你危废桶硬糖
    obox(d, [10, 8, 22, 27], '#d9c93a')
    d.rectangle([10, 12, 22, 15], fill='#3a3a30')
    d.rectangle([10, 20, 22, 23], fill='#3a3a30')
    d.point([(15, 17), (16, 17), (16, 18)], fill='#3a3a30')

def draw_candygenius(d):
    # 天才糖：粉色威化
    obox(d, [7, 10, 25, 23], '#e8a0b8')
    for y in (13, 16, 19):
        d.line([(9, y), (23, y)], fill='#c97a92')
    d.point([(11, 12), (20, 15), (13, 18), (19, 21)], fill='#f4d0dc')

def draw_candymint(d):
    # 杏仁薄荷糖：O 形薄荷
    d.ellipse([7, 8, 25, 26], fill='#a0d0b0', outline=INK)
    d.ellipse([12, 13, 20, 21], fill='#f4f6f0', outline=INK)
    d.arc([8, 9, 24, 25], 200, 340, fill='#6aa880', width=2)

def draw_manmade(d):
    # 人制品：糖果纸包裹的肉块（粉白油纸 + 肉色方块）
    d.polygon([(8, 12), (24, 12), (24, 22), (8, 22)], fill='#d8cfc0', outline=INK)  # 油纸
    d.polygon([(8, 12), (4, 9), (4, 25)], fill='#d8cfc0', outline=INK)              # 左拧口
    d.polygon([(24, 12), (28, 9), (28, 25)], fill='#d8cfc0', outline=INK)           # 右拧口
    d.rectangle([12, 14, 20, 20], fill='#8a4a3a', outline=INK)                       # 肉块
    d.point([(14, 16), (17, 18)], fill='#c9a0a0')

def candy_bag(label):
    def fn(d):
        d.polygon([(9, 9), (23, 9), (26, 27), (6, 27)], fill='#e8e0cc', outline=INK)  # 袋身
        d.rectangle([12, 5, 20, 9], fill='#c9b890', outline=INK)                      # 扎口
        d.rectangle([11, 14, 21, 21], fill=label, outline=INK)                        # 口味标签
        d.point([(10, 23), (13, 24), (18, 24), (22, 23)], fill='#c9b890')             # 袋底褶皱
    return fn

def draw_sedgland(d):
    # 镇静腺（Nguithr'xurh 掉落）：半透明淡黄腺体 + 深色内核 + 一截褐色导管 + 高光
    d.ellipse([7, 10, 25, 26], fill='#d9c46a', outline=INK)      # 腺体外膜
    d.ellipse([10, 13, 22, 23], fill='#e8d888')                  # 内层分泌物
    d.ellipse([13, 15, 19, 21], fill='#a8862e')                  # 内核
    d.rectangle([20, 6, 22, 11], fill='#8a6a4a', outline=INK)    # 导管
    d.point([(21, 5), (22, 4)], fill='#8a6a4a')
    d.rectangle([11, 13, 12, 14], fill='#fff6d0')                # 高光
    d.point([(14, 12), (10, 16)], fill='#fff6d0')
    for x, y in [(9, 27), (16, 28), (23, 27)]:                   # 渗出的液滴
        d.point([(x, y)], fill='#d9c46a')

# ---------- 批发市场 v2（2026-10-23） ----------
def draw_memoryjuice(d):
    # 记忆汁液（Object 11）：宽口玻璃罐 + 琥珀橙液体 + 金属盖 + 纸胶带标签
    obox(d, [8, 4, 23, 7], '#9a9a92')                      # 金属盖
    obox(d, [7, 7, 24, 28], '#e8d8c0')                     # 玻璃罐
    d.rectangle([8, 11, 23, 27], fill='#d9822e')           # 琥珀液体
    d.rectangle([8, 11, 23, 12], fill='#f0a850')           # 液面
    d.rectangle([9, 16, 22, 20], fill='#efe4c8')           # 纸胶带
    d.line([(11, 18), (19, 18)], fill='#6a5a40')           # 手写字迹
    d.point([(9, 9), (9, 10), (10, 22), (10, 23)], fill='#fff4e0')  # 反光
    d.point([(21, 24)], fill='#f4f0e6')                    # 白色沉淀

def draw_laughrepellent(d):
    # 驱笑剂（Object 3）：细长药瓶 + 近乎透明液体 + 黄色 M.E.G. 标签 + 软木塞
    obox(d, [13, 3, 18, 7], '#b08a5a')                     # 软木塞
    obox(d, [12, 7, 19, 28], '#dbe8e8')                    # 玻璃瓶
    d.rectangle([13, 13, 18, 27], fill='#eef8f6')          # 透明液体
    d.rectangle([12, 16, 19, 21], fill='#e0c447', outline=INK)  # M.E.G. 黄标签
    d.line([(14, 18), (17, 18)], fill='#222200')
    d.point([(13, 9), (13, 10), (13, 11)], fill='#ffffff')

def draw_babelbalm(d):
    # 巴别润唇膏（Object 25）：打开的红色半透明胶囊 + 发光白膏 + 盖子
    obox(d, [7, 14, 14, 28], '#d83030')                    # 管身
    obox(d, [8, 9, 13, 14], '#f4f2ea')                     # 白膏体
    d.point([(9, 10), (10, 9), (11, 9)], fill='#ffffff')
    d.polygon([(18, 6), (25, 9), (21, 27), (15, 24)], fill='#c42828', outline=INK)  # 斜放的盖子
    d.line([(19, 9), (17, 22)], fill='#e86060')            # 盖子高光
    for p in [(6, 8), (14, 7), (5, 12)]: d.point([p], fill='#fffbe0')  # 微光

def _kit(d, body, dark, mark, band=None):
    obox(d, [12, 6, 19, 9], dark)                          # 提手
    d.rectangle([14, 7, 17, 8], fill=(0, 0, 0, 0))
    obox(d, [4, 9, 27, 27], body)                          # 箱体
    d.rectangle([5, 24, 26, 26], fill=dark)                # 下缘
    if band: d.rectangle([5, 10, 26, 12], fill=band)
    d.rectangle([7, 9, 9, 11], fill='#2a2a2a'); d.rectangle([22, 9, 24, 11], fill='#2a2a2a')  # 搭扣
    d.rectangle([14, 13, 17, 22], fill=mark); d.rectangle([11, 16, 20, 19], fill=mark)  # 十字

def draw_outdoorkit(d):
    # 户外医疗箱：红色硬壳 + 白十字 + 黑搭扣
    _kit(d, '#d43a32', '#8e2420', '#f4f2ea')

def draw_traumakit(d):
    # 高级医疗箱：橙色防水箱 + 灰色胶条 + 白十字
    _kit(d, '#ec7a1e', '#5a5a5e', '#f4f2ea', band='#7a7a80')

def draw_saltbox(d):
    # 盒装火盐：牛皮纸盒 + 橙色火焰警示菱形 + 盒口露出的火盐
    obox(d, [5, 11, 26, 28], '#c49a64')                    # 盒身
    d.rectangle([6, 25, 25, 27], fill='#a47a48')
    d.polygon([(5, 11), (9, 7), (26, 7), (26, 11)], fill='#d8b07a', outline=INK)  # 掀开的盒盖
    d.polygon([(9, 9), (12, 5), (15, 9)], fill='#f59a4a', outline=INK)             # 露出的火盐
    d.polygon([(16, 9), (19, 4), (22, 9)], fill='#e8823c', outline=INK)
    d.polygon([(15, 14), (20, 19), (15, 24), (10, 19)], fill='#e8823c', outline=INK)  # 警示菱形
    d.polygon([(15, 16), (17, 20), (15, 22), (13, 20)], fill='#ffd060')            # 火焰

# ---------- 2026-10-23：此前走 SVG 回退的 5 件 ----------
def draw_acidcallus(d):
    # 酸性胼胝（爆酸者碎茧）：龟裂的黄褐角质块 + 撕开的切面 + 渗出的黄绿酸液
    d.polygon([(5, 18), (8, 11), (14, 8), (21, 9), (26, 13), (27, 19), (23, 24), (14, 25), (7, 23)], fill='#a8843e', outline=INK)
    d.polygon([(9, 13), (14, 10), (20, 11), (17, 14), (11, 16)], fill='#c9a456')          # 受光面
    d.line([(10, 18), (14, 15), (18, 17), (22, 14)], fill='#5a4626')                       # 龟裂
    d.line([(14, 15), (13, 21)], fill='#5a4626'); d.line([(18, 17), (20, 21)], fill='#5a4626')
    d.polygon([(21, 9), (26, 13), (27, 19), (23, 17), (22, 12)], fill='#c8b46a', outline=INK)  # 切面
    d.line([(23, 12), (25, 17)], fill='#a8944a')
    for x, y in [(12, 12), (16, 20), (9, 19)]:                                            # 渗酸小孔
        d.point([(x, y)], fill='#e6e04a')
    d.rectangle([24, 20, 25, 23], fill='#d6e040'); d.rectangle([24, 24, 25, 25], fill='#b8c830')  # 挂着的酸滴
    d.ellipse([18, 26, 29, 29], fill='#c8d23a', outline='#6a7020')                        # 脚下一小滩
    d.point([(21, 27), (25, 27)], fill='#f2f6a0')

def draw_ashpile(d):
    # 一捧细灰：低矮灰堆 + 炭屑 + 骨白碎末 + 埋着的一枚铜纽扣
    d.polygon([(3, 26), (8, 21), (13, 17), (17, 15), (21, 17), (25, 21), (29, 26)], fill='#8c8880', outline=INK)
    d.polygon([(10, 21), (14, 18), (17, 17), (19, 19), (15, 21)], fill='#aaa69c')           # 受光面
    d.line([(4, 27), (28, 27)], fill='#5e5a54')
    for x, y in [(9, 24), (16, 23), (22, 24), (19, 20), (12, 25), (25, 25)]:
        d.point([(x, y)], fill='#3a3834')                                                 # 炭屑
    for x, y in [(14, 22), (20, 22), (7, 25)]:
        d.point([(x, y)], fill='#e6e2d6')                                                 # 骨白碎末
    d.ellipse([18, 22, 22, 25], fill='#b0803a', outline=INK); d.point([(19, 23), (21, 23)], fill='#5a3a1a')  # 纽扣
    d.rectangle([7, 22, 9, 23], fill='#2a2826')                                            # 小炭块
    for x, y in [(2, 28), (5, 29), (27, 29), (30, 28)]:
        d.point([(x, y)], fill='#8c8880')                                                 # 散灰

def draw_curabiturgel(d):
    # 受眷胶：旋盖玻璃罐里的黄绿发光胶 + 牛皮纸标签 + 光晕
    for r, c in [(14, '#24301a'), (12, '#34481e')]:
        d.ellipse([16 - r, 17 - r, 16 + r, 17 + r], fill=c)                                # 光晕
    obox(d, [10, 4, 22, 8], '#6a5a44')                                                    # 旋盖
    d.line([(11, 5), (21, 5)], fill='#8a7a5e')
    obox(d, [8, 8, 24, 28], '#c8ff6a')                                                    # 罐身（胶）
    d.rectangle([9, 9, 23, 11], fill='#e6ffb0')                                            # 胶面高光
    obox(d, [9, 15, 23, 22], '#c4a878')                                                   # 牛皮纸标签
    d.ellipse([13, 16, 19, 20], fill='#9ac43a')                                            # 浮囊徽记
    d.point([(11, 18), (21, 18)], fill='#5a4a2a')
    d.rectangle([10, 23, 11, 27], fill='#eaffc0')                                          # 玻璃高光
    d.point([(20, 25), (17, 26)], fill='#f2ffd0')

def draw_curabiturspore(d):
    # 受眷孢子：一小撮三颗发光卵形孢子 + 细孔 + 干瘪的柄
    for cx, cy, r in [(12, 18, 7), (21, 14, 6), (20, 23, 5)]:
        d.ellipse([cx - r - 2, cy - r - 2, cx + r + 2, cy + r + 2], fill='#4a3016')          # 光晕
    for cx, cy, rx, ry in [(12, 18, 5, 6), (21, 14, 4, 5), (20, 23, 4, 4)]:
        d.ellipse([cx - rx, cy - ry, cx + rx, cy + ry], fill='#ffb34a', outline=INK)
        d.point([(cx - 2, cy - 2), (cx - 1, cy - 3)], fill='#ffe6a8')                       # 高光
        d.point([(cx + 1, cy + 1), (cx - 1, cy + 2), (cx + 2, cy - 1)], fill='#c8782a')     # 细孔
    d.line([(7, 23), (5, 26)], fill='#8a6a3a'); d.line([(25, 10), (27, 7)], fill='#8a6a3a'); d.line([(23, 26), (25, 28)], fill='#8a6a3a')

def draw_curabiturrepellent(d):
    # 孢子驱蛾剂：小药瓶装大半瓶褐绿腐液 + 软木塞 + 划掉飞蛾的手写标签
    obox(d, [13, 2, 19, 7], '#a8804e')                                                    # 软木塞
    d.point([(15, 4), (17, 5)], fill='#7a5a34')
    obox(d, [12, 7, 20, 10], '#d8e0d0')                                                   # 瓶颈
    d.line([(12, 9), (20, 9)], fill='#8a7a5a')                                             # 细绳
    obox(d, [8, 10, 24, 29], '#d8e0d0')                                                   # 瓶身（玻璃）
    d.rectangle([9, 15, 23, 28], fill='#4f4a24')                                           # 腐液
    d.line([(9, 15), (23, 15)], fill='#7a7038')                                            # 液面
    d.rectangle([9, 26, 23, 28], fill='#3a3418')                                           # 沉淀
    obox(d, [10, 17, 22, 24], '#ece4c8')                                                  # 标签
    d.line([(12, 18), (20, 23)], fill='#9a2a1a'); d.line([(20, 18), (12, 23)], fill='#9a2a1a')  # 划掉的飞蛾
    d.point([(14, 20), (18, 20), (16, 21)], fill='#3a3020')
    d.rectangle([9, 11, 10, 14], fill='#ffffff')                                           # 玻璃高光


def draw_phone(d):
    # 手机：深灰机身圆角 + 亮屏（夜间锁屏 23:40 像素数字）+ 顶部听筒缝 + 右上角细划痕
    d.rounded_rectangle([9, 2, 22, 29], radius=2, fill='#26282c', outline=INK)
    d.rectangle([10, 5, 21, 26], fill='#2c4a72')                       # 屏幕底色（深蓝）
    d.rectangle([10, 5, 21, 9], fill='#3d6494')                        # 屏幕上部渐亮
    d.line([(14, 3), (17, 3)], fill='#55585e')                         # 听筒
    for x, col in ((11, '#e8eef8'), (13, '#e8eef8'), (16, '#e8eef8'), (18, '#e8eef8')):  # 时钟：四个两格宽的数字块
        d.rectangle([x, 11, x + 1, 14], fill=col)
    d.point([(15, 12), (15, 14)], fill='#e8eef8')                      # 冒号
    d.line([(12, 17), (19, 17)], fill='#8fb0d8')                       # 通知条
    d.line([(12, 19), (17, 19)], fill='#8fb0d8')
    d.rectangle([14, 24, 17, 24], fill='#9ab3d4')                      # 底部横条
    d.line([(19, 6), (21, 8)], fill='#c8d6ea')                         # 划痕
    d.point([(10, 5)], fill='#5d84b8')                                 # 高光

def draw_bottledwater(d):
    # 瓶装水：透明浅蓝瓶身 + 深蓝瓶盖 + 蓝色腰标（波浪纹）+ 瓶身高光与水位线
    obox(d, [14, 2, 18, 5], '#1d5fa8')                                 # 瓶盖
    d.line([(14, 4), (18, 4)], fill='#2f7fc1')
    obox(d, [14, 5, 17, 7], '#cfe6f2')                                 # 瓶颈
    d.polygon([(14, 7), (17, 7), (21, 11), (11, 11)], fill='#cfe6f2', outline=INK)  # 瓶肩
    obox(d, [11, 11, 21, 29], '#bcdcee')                               # 瓶身
    d.rectangle([12, 13, 20, 28], fill='#a8d0e8')                      # 水
    d.rectangle([11, 16, 21, 22], fill='#2f7fc1', outline=INK)         # 腰标
    d.point([(13, 19), (14, 18), (15, 19), (16, 18), (17, 19), (18, 18), (19, 19)], fill='#cfe6f2')  # 波浪
    d.line([(12, 24), (20, 24)], fill='#d6ecf6')                       # 瓶身棱
    d.line([(13, 12), (13, 15)], fill='#f2fbff')                       # 高光
    d.line([(13, 23), (13, 27)], fill='#f2fbff')

def draw_snackbar(d):
    # 能量棒：斜放的长条包装——橙红包装纸 + 黄色腰带 + 两端锯齿封口 + 燕麦粒点
    d.polygon([(3, 21), (21, 5), (28, 12), (10, 28)], fill='#d4532f', outline=INK)
    d.polygon([(11, 14), (15, 10), (22, 17), (18, 21)], fill='#e3b23c', outline=INK)   # 腰带
    for i in range(4):                                                 # 两端锯齿封口
        d.point([(4 + i * 2, 21 + i * 2 - 1)], fill='#f0d6b0')
        d.point([(21 + i * 2, 5 + i * 2 + 1)], fill='#f0d6b0')
    d.point([(8, 22), (9, 20), (24, 11), (25, 13), (20, 9)], fill='#f6e7c9')  # 燕麦粒
    d.point([(16, 14), (17, 16), (15, 16)], fill='#7a3a1e')            # 腰带上的巧克力纹
    d.line([(6, 20), (19, 8)], fill='#e9785a')                         # 高光

def draw_foyerpack(d):
    # 你的背包：深灰蓝双肩包——圆角主袋 + 前袋 + 琥珀色拉链头 + 顶部提手 + 两侧肩带
    d.arc([12, 1, 20, 9], 180, 360, fill=INK, width=2)                  # 提手
    d.rounded_rectangle([7, 5, 25, 29], radius=5, fill='#3c4552', outline=INK)
    d.line([(10, 9), (22, 9)], fill='#58637a')                         # 主袋拉链线
    d.rounded_rectangle([10, 15, 22, 26], radius=3, fill='#2a3038', outline=INK)  # 前袋
    d.line([(11, 18), (21, 18)], fill='#46505e')                       # 前袋拉链
    d.rectangle([19, 17, 20, 20], fill='#e3a83c')                      # 拉链头
    d.rectangle([12, 8, 13, 11], fill='#e3a83c')
    d.line([(5, 9), (5, 26)], fill='#1f242b', width=2)                 # 侧边肩带
    d.line([(27, 9), (27, 26)], fill='#1f242b', width=2)
    d.point([(9, 7), (8, 8)], fill='#5b6678')                          # 高光

DRAW = {
    'phone': draw_phone, 'bottledwater': draw_bottledwater, 'snackbar': draw_snackbar, 'foyerpack': draw_foyerpack,
    'acidcallus': draw_acidcallus,
    'ashpile': draw_ashpile,
    'curabiturgel': draw_curabiturgel,
    'curabiturspore': draw_curabiturspore,
    'curabiturrepellent': draw_curabiturrepellent,
    'sedgland': draw_sedgland,
    'disinfectant': draw_disinfectant,
    'luckymilk': draw_luckymilk,  # v54
    'nightvision': draw_nightvision,
    'welcomenote': draw_welcomenote,
    'jerryflyer': draw_jerryflyer,
    'fakelog': draw_fakelog,
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
    'velvetcake': draw_velvetcake,
    'ratmeat': draw_ratmeat,  # v79
    'capacitor': draw_capacitor,
    'parcel': draw_parcel,
    'dryshrimp': draw_shrimp,
    'liveshrimp': draw_liveshrimp,  # v81
    'friedshrimp': draw_friedshrimp,
    'bento': draw_bento,  # v83
    'leverrifle': draw_leverrifle, 'musket': draw_musket, 'trapdoor': draw_trapdoor, 'revolver': draw_revolver, 'cart_4440': draw_cart_4440, 'cart_4570': draw_cart_4570, 'cart_paper': draw_cart_paper,
    'dbshotgun': draw_dbshotgun, 'shell_buck': draw_shell_buck, 'shell_bird': draw_shell_bird, 'shell_clump': draw_shell_clump,  # 鎏金兵械库
    'memoryjuice': draw_memoryjuice, 'laughrepellent': draw_laughrepellent, 'babelbalm': draw_babelbalm,  # 批发市场 v2
    'outdoorkit': draw_outdoorkit, 'traumakit': draw_traumakit, 'saltbox': draw_saltbox,
    'firesalt': draw_firesalt,
    'liquidpain': draw_liquidpain,
    'candysilver': draw_candysilver,
    'candybullet': draw_candybullet,
    'candygun': draw_candygun,
    'candystanley': draw_candystanley,
    'candywaste': draw_candywaste,
    'candygenius': draw_candygenius,
    'candymint': draw_candymint,
    'manmade': draw_manmade,
    'candysilver_bag': candy_bag('#c9c9d4'),
    'candybullet_bag': candy_bag('#9a9aa8'),
    'candygun_bag': candy_bag('#5a5a64'),
    'candystanley_bag': candy_bag('#d0d0c0'),
    'candywaste_bag': candy_bag('#d9c93a'),
    'candygenius_bag': candy_bag('#e8a0b8'),
    'candymint_bag': candy_bag('#a0d0b0'),
}

# ---------- 物品清单：直接解析 items.ts ----------
src = open('src/game/content/items.ts', encoding='utf-8').read()  # v54：items.ts 移至 content/（此前路径必崩）
types = re.findall(r"^  (\w+): \{ type: '", src, re.M)
# 受眷鸟三件物品定义在 content/curabiturItems.ts，类型名在 engine/curabiturTuning.ts 的 CB_ITEM
cb = open('src/game/engine/curabiturTuning.ts', encoding='utf-8').read()
m = re.search(r'export const CB_ITEM = \{(.*?)\}', cb, re.S)
if m:
    types += re.findall(r"'(\w+)'", m.group(1))
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
# Object 5 糖果：袋装版本（堆叠 ≥4 时显示）——非真实物品类型，按糖果类型单独生成
for t in ['candysilver', 'candybullet', 'candygun', 'candystanley', 'candywaste', 'candygenius', 'candymint']:
    fn = DRAW.get(f'{t}_bag')
    path = f'{DIR}/item_{t}_bag.png'
    if not fn or os.path.exists(path):
        continue
    img = canvas()
    fn(ImageDraw.Draw(img))
    img = img.resize((OUT, OUT), Image.NEAREST)
    img.save(path)
    print(f'  生成 {t}_bag')
if skip:
    print(f'跳过（已有 png）：{len(skip)} 件')
if missing_draw:
    print('缺画法：' + ' '.join(missing_draw))
    sys.exit(1)
print(f'完成：新生成 {len(gen)} 张，全部物品均有像素图标')
