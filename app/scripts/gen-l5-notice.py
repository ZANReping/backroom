#!/usr/bin/env python3
# gen-l5-notice.py —— Level 5 据点地标贴图（v55，landmark data.tex 用）。纯 PIL 程序绘制，512×640 竖幅：
#   l5_notice.png      M.E.G. 哨所告示（鲜黄饰带 + 鹰徽圆 + 标题字 + 指路箭头）
#   l5_homelysign.png  家常酒店标志牌（青灰底 + 烫银边 + 酒店剪影 + 「HOMELY HOTEL」）
# 从 app/ 目录运行：python scripts/gen-l5-notice.py
import os
from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TEX = os.path.join(ROOT, 'public', 'textures')
W, H = 512, 640


def notice():
    img = Image.new('RGB', (W, H), (226, 218, 196))  # 纸色
    d = ImageDraw.Draw(img)
    d.rectangle([0, 0, W - 1, 54], fill=(217, 177, 59))  # MEG 鲜黄饰带
    d.rectangle([0, H - 40, W - 1, H - 1], fill=(217, 177, 59))
    # 鹰徽圆（简笔：圆环 + 折线鹰翼）
    d.ellipse([W // 2 - 52, 76, W // 2 + 52, 180], outline=(40, 36, 28), width=6)
    d.polygon([(W // 2 - 38, 140), (W // 2, 96), (W // 2 + 38, 140), (W // 2, 122)], fill=(40, 36, 28))
    # 标题条与正文行（程序字替代：横线条排印感）
    d.rectangle([60, 210, W - 60, 236], fill=(40, 36, 28))
    for i, w2 in enumerate([380, 340, 380, 300, 360]):
        d.rectangle([66, 280 + i * 34, 66 + w2, 296 + i * 34], fill=(70, 62, 48))
    # 指路箭头（向右）
    d.polygon([(80, 500), (340, 500), (340, 470), (440, 520), (340, 570), (340, 540), (80, 540)], fill=(160, 44, 36))
    d.rectangle([30, 30, W - 31, H - 31], outline=(120, 100, 60), width=3)
    img.save(os.path.join(TEX, 'l5_notice.png'))
    print('生成 l5_notice.png')


def homelysign():
    img = Image.new('RGB', (W, H), (58, 76, 84))  # 青灰底
    d = ImageDraw.Draw(img)
    d.rectangle([16, 16, W - 17, H - 17], outline=(200, 208, 212), width=5)  # 烫银边
    d.rectangle([28, 28, W - 29, H - 29], outline=(160, 172, 178), width=2)
    # 酒店剪影（主楼 + 两翼 + 门廊灯）
    d.rectangle([176, 220, 336, 460], fill=(24, 30, 34))
    d.rectangle([116, 300, 176, 460], fill=(30, 38, 42))
    d.rectangle([336, 300, 396, 460], fill=(30, 38, 42))
    for fy in range(240, 440, 36):  # 窗格
        for fx in range(190, 330, 30):
            d.rectangle([fx, fy, fx + 16, fy + 20], outline=(200, 208, 130), width=2)
    d.ellipse([240, 470, 272, 502], fill=(232, 200, 106))  # 门廊灯
    # 字带（横线排印 + 底部饰线）
    d.rectangle([96, 540, W - 96, 566], fill=(200, 208, 212))
    d.rectangle([156, 590, W - 156, 600], fill=(160, 172, 178))
    img.save(os.path.join(TEX, 'l5_homelysign.png'))
    print('生成 l5_homelysign.png')


notice()
homelysign()
