# 生成后室装修公司（BRC）标志贴图（PIL 程序绘制，无外部素材，随项目同许可发布）
# 输出：app/public/textures/brc_logo.png（512×512 透明底）
# 标志设定（参照 wikidot 徽章再现图）：淡紫房屋形盾 + 深色描边 + 黄色绶带 + 红门 + 交叉锯/锤
# 用法：cd app && python scripts/gen-brc-logo.py
from PIL import Image, ImageDraw, ImageFont

FONT = 'C:/Windows/Fonts/msyhbd.ttc'
SHIELD = '#a89ed8'   # 淡紫盾面
EDGE = '#2e2a45'     # 深描边
RIBBON = '#e8c93a'   # 黄色绶带
DOOR = '#a6332e'     # 红门
WOOD = '#7a5a30'     # 木柄
METAL = '#b8bcc0'    # 锯片/锤头


def hammer_img():
    """锤子（直立：木柄 + 金属锤头），160×160"""
    im = Image.new('RGBA', (160, 160), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.rectangle([72, 30, 88, 152], fill=WOOD, outline=EDGE, width=3)          # 木柄
    d.rectangle([36, 14, 124, 46], fill=METAL, outline=EDGE, width=3)         # 锤头
    d.rectangle([36, 14, 52, 46], fill='#8a8e94', outline=EDGE, width=2)      # 锤头楔端
    return im


def saw_img():
    """手板锯（斜刃：金属锯片带锯齿 + 木柄），160×160"""
    im = Image.new('RGBA', (160, 160), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.polygon([(14, 62), (112, 34), (112, 62), (14, 92)], fill=METAL, outline=EDGE)  # 锯片
    for i in range(9):  # 锯齿
        x = 18 + i * 10
        d.polygon([(x, 90 - i * 3), (x + 5, 99 - i * 3), (x + 10, 90 - i * 3)], fill=METAL, outline=EDGE)
    d.rectangle([108, 26, 136, 80], fill=WOOD, outline=EDGE, width=3)         # 木柄
    d.rectangle([114, 38, 130, 68], fill='#5a4020')                           # 柄孔
    return im


# 512×512 透明底
img = Image.new('RGBA', (512, 512), (0, 0, 0, 0))
d = ImageDraw.Draw(img)

# 房屋形盾：三角屋顶 + 矩形盾身（淡紫 + 深描边）
d.polygon([(256, 64), (116, 208), (396, 208)], fill=SHIELD, outline=EDGE)    # 屋顶
d.rectangle([116, 208, 396, 436], fill=SHIELD, outline=None)                # 盾身
d.line([(256, 64), (116, 208), (116, 436), (396, 436), (396, 208), (256, 64)],
       fill=EDGE, width=12, joint='curve')                                   # 整体描边
d.line([(116, 208), (396, 208)], fill=EDGE, width=6)                         # 屋檐线

# 交叉锯/锤（屋顶正面，山墙上的纹章式交叉）
hm = hammer_img().rotate(-38, resample=Image.BICUBIC, expand=True)
sw = saw_img().rotate(38, resample=Image.BICUBIC, expand=True)
img.paste(sw, (256 - sw.width // 2, 152 - sw.height // 2), sw)
img.paste(hm, (256 - hm.width // 2, 152 - hm.height // 2), hm)

# 红门（盾身中下部，带门框与门把）
d.rectangle([216, 316, 296, 436], fill=DOOR, outline=EDGE, width=6)
d.line([(216, 352), (296, 352)], fill='#7c241f', width=4)                    # 门楣分线
d.ellipse([278, 386, 290, 398], fill='#e8c93a', outline=EDGE, width=2)       # 门把

# 黄色绶带（横贯盾身中部，两端折角）
d.polygon([(96, 268), (416, 268), (416, 316), (96, 316)], fill=RIBBON, outline=EDGE)
d.polygon([(96, 268), (72, 256), (72, 328), (96, 316)], fill='#c9a52a', outline=EDGE)   # 左折角
d.polygon([(416, 268), (440, 256), (440, 328), (416, 316)], fill='#c9a52a', outline=EDGE)  # 右折角
d.line([(96, 268), (416, 268)], fill=EDGE, width=5)
d.line([(96, 316), (416, 316)], fill=EDGE, width=5)

# 绶带字样
try:
    f = ImageFont.truetype(FONT, 34)
    bb = d.textbbox((0, 0), 'B.R.C.', font=f)
    d.text((256 - (bb[2] - bb[0]) / 2, 292 - (bb[3] - bb[1]) / 2 - bb[1]), 'B.R.C.', font=f, fill=EDGE)
except Exception:
    pass  # 无字体环境：绶带留空

img.save('public/textures/brc_logo.png')
print('brc_logo.png saved')
