# v54：蓝色救赎休息室鹦鹉画像 ×3（PIL 程序绘制，无外部素材；megposter data.tex 挂墙用）
# ——蓝鹦鹉站姿/侧影/圣辉圆相三幅（风格参照 gen-jerry-poster.py：蓝底 + 鹉主剪影 + 圣辉）
# 用法：cd app && python scripts/gen-parrot-portraits.py
import math

from PIL import Image, ImageDraw

OUT = 'public/textures'
W, H = 512, 640


def bg_rays(d: ImageDraw.ImageDraw, cx: float, cy: float, c: str):
    for i in range(24):
        a = i * math.pi / 12
        d.line([(cx, cy), (cx + math.cos(a) * 460, cy + math.sin(a) * 460)], fill=c, width=10)


def draw_parrot(d: ImageDraw.ImageDraw, cx: float, cy: float, s: float, body: str, dark: str, light: str, face: int = 1):
    """鹉主蓝鹦鹉：翎冠 + 钩喙 + 圆身 + 长尾羽。face=1 朝右，-1 朝左。"""
    # 尾羽（身后下垂三条）
    for i, (ox, ln) in enumerate([(-0.30, 1.05), (-0.42, 0.9), (-0.18, 0.82)]):
        d.polygon([(cx + face * (ox * s), cy + 0.28 * s),
                   (cx + face * ((ox - 0.22) * s), cy + (0.28 + ln) * s),
                   (cx + face * ((ox + 0.08) * s), cy + (0.28 + ln * 0.85) * s)], fill=dark if i % 2 else body)
    # 身体
    d.ellipse([cx - 0.34 * s, cy - 0.35 * s, cx + 0.34 * s, cy + 0.4 * s], fill=body)
    # 翅膀（侧身叠羽）
    d.polygon([(cx - face * 0.05 * s, cy - 0.1 * s), (cx - face * 0.3 * s, cy + 0.42 * s),
               (cx + face * 0.18 * s, cy + 0.3 * s), (cx + face * 0.26 * s, cy - 0.05 * s)], fill=dark)
    d.polygon([(cx - face * 0.02 * s, cy), (cx - face * 0.2 * s, cy + 0.3 * s),
               (cx + face * 0.16 * s, cy + 0.2 * s)], fill=light)
    # 头 + 翎冠
    d.ellipse([cx - 0.2 * s, cy - 0.72 * s, cx + 0.2 * s, cy - 0.32 * s], fill=body)
    for k in (-1, 0, 1):
        d.polygon([(cx + k * 0.07 * s, cy - 0.66 * s), (cx + (k * 0.16 + 0.02) * s, cy - 0.98 * s),
                   (cx + (k * 0.16 + 0.09) * s, cy - 0.64 * s)], fill=dark)
    # 钩喙
    d.polygon([(cx + face * 0.16 * s, cy - 0.6 * s), (cx + face * 0.34 * s, cy - 0.52 * s),
               (cx + face * 0.2 * s, cy - 0.4 * s)], fill='#d4af37')
    # 眼（face=-1 时坐标取反后需排序）
    ex0, ex1 = cx + face * 0.02 * s, cx + face * 0.12 * s
    d.ellipse([min(ex0, ex1), cy - 0.62 * s, max(ex0, ex1), cy - 0.52 * s], fill='#101018')
    hx0, hx1 = cx + face * 0.05 * s, cx + face * 0.08 * s
    d.ellipse([min(hx0, hx1), cy - 0.6 * s, max(hx0, hx1), cy - 0.57 * s], fill='#e8ecfc')


def frame(d: ImageDraw.ImageDraw, edge: str, inner: str):
    d.rectangle([10, 10, W - 11, H - 11], outline=edge, width=6)
    d.rectangle([24, 24, W - 25, H - 25], outline=inner, width=2)


def portrait1():  # 站姿正面偏右 + 圣辉圆环
    img = Image.new('RGB', (W, H), '#23265c')
    d = ImageDraw.Draw(img)
    bg_rays(d, W / 2, 300, '#2b2f73')
    d.ellipse([W / 2 - 150, 90, W / 2 + 150, 390], outline='#d4af37', width=6)  # 圣辉环
    draw_parrot(d, W / 2, 330, 150, '#3a6ad8', '#2a3f9a', '#7ca5f5', face=1)
    d.rectangle([W / 2 - 90, 452, W / 2 + 90, 462], fill='#101018')  # 栖枝
    frame(d, '#7c8fe8', '#c8d0f5')
    img.save(f'{OUT}/parrot_portrait1.png')
    print('  parrot_portrait1.png 已保存')


def portrait2():  # 侧影（朝左）+ 月光窗
    img = Image.new('RGB', (W, H), '#1c2046')
    d = ImageDraw.Draw(img)
    d.ellipse([W / 2 - 170, 70, W / 2 + 170, 410], fill='#262b60')  # 圆窗底
    d.ellipse([W / 2 - 150, 90, W / 2 + 150, 390], outline='#9aa4dd', width=5)
    bg_rays(d, W / 2, 240, '#23285c')
    draw_parrot(d, W / 2, 340, 160, '#32569e', '#22336e', '#5a7ed8', face=-1)
    d.rectangle([W / 2 - 100, 470, W / 2 + 100, 480], fill='#101018')
    frame(d, '#5a6bc8', '#9aa4dd')
    img.save(f'{OUT}/parrot_portrait2.png')
    print('  parrot_portrait2.png 已保存')


def portrait3():  # 圣辉半身相（金环 + 胸前圣辉）
    img = Image.new('RGB', (W, H), '#2a2c6e')
    d = ImageDraw.Draw(img)
    bg_rays(d, W / 2, 280, '#343888')
    d.ellipse([W / 2 - 130, 60, W / 2 + 130, 320], outline='#d4af37', width=8)  # 金环
    draw_parrot(d, W / 2, 330, 165, '#4a7ae8', '#2a3f9a', '#8ab0f5', face=1)
    d.ellipse([W / 2 - 26, 350, W / 2 + 26, 402], fill='#f5e3ae')  # 胸前圣辉
    frame(d, '#7c8fe8', '#c8d0f5')
    img.save(f'{OUT}/parrot_portrait3.png')
    print('  parrot_portrait3.png 已保存')


if __name__ == '__main__':
    portrait1()
    portrait2()
    portrait3()
