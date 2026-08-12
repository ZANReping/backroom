# v54：photo 结构变种贴图（PIL 程序绘制，无外部素材）——6 张「照片」：
# 山景/湖泊/森林风景、房屋/街道、咖啡杯静物（人物类两张已按需求移除）。
# 统一做旧：降饱和 + 暖色偏移 + 暗角 + 照片白边。同位置重建不变（无随机，全部定值绘制）。
# 幂等：重跑覆盖产出，并清理已废弃的人物类旧文件（photo_portrait.png / photo_group.png）。
# 用法：cd app && python scripts/gen-photos.py
from PIL import Image, ImageDraw, ImageEnhance, ImageFilter

OUT = 'public/textures'
W, H = 256, 192   # 照片成品（含白边）
BORD = 12         # 白边宽
SW, SH = W - BORD * 2, H - BORD * 2  # 画面区 232×168


def _rgb(c):
    return tuple(int(c[i:i + 2], 16) for i in (1, 3, 5)) if isinstance(c, str) else c


def lerp(c1, c2, t):
    c1, c2 = _rgb(c1), _rgb(c2)
    return tuple(int(a + (b - a) * t) for a, b in zip(c1, c2))


def vgrad(d, box, ctop, cbot, steps=64):
    """竖向渐变填充。"""
    x0, y0, x1, y1 = box
    for i in range(steps):
        c = lerp(ctop, cbot, i / (steps - 1))
        d.rectangle([x0, y0 + (y1 - y0) * i / steps, x1, y0 + (y1 - y0) * (i + 1) / steps + 1], fill=c)


def scn_mountain(d):
    vgrad(d, (0, 0, SW, SH), '#9db8cc', '#e0d2ae')
    d.ellipse([SW * 0.62, SH * 0.1, SW * 0.78, SH * 0.28], fill='#efe6c8')  # 日
    d.polygon([(0, SH * 0.62), (SW * 0.3, SH * 0.22), (SW * 0.55, SH * 0.55), (SW * 0.8, SH * 0.3), (SW, SH * 0.6), (SW, SH), (0, SH)], fill='#6a7280')
    d.polygon([(0, SH * 0.72), (SW * 0.35, SH * 0.42), (SW * 0.7, SH * 0.7), (SW, SH * 0.55), (SW, SH), (0, SH)], fill='#4e5560')
    d.rectangle([0, SH * 0.85, SW, SH], fill='#5a5a48')  # 前景草甸


def scn_lake(d):
    vgrad(d, (0, 0, SW, SH // 2), '#a8c0d4', '#e4d8b8')
    vgrad(d, (0, SH // 2, SW, SH), '#7e94a4', '#4e6474')
    d.polygon([(0, SH * 0.5), (SW * 0.25, SH * 0.26), (SW * 0.5, SH * 0.48), (SW * 0.75, SH * 0.3), (SW, SH * 0.5)], fill='#5e6670')  # 远山
    for i in range(5):  # 湖面碎波
        y = SH * (0.58 + i * 0.08)
        d.line([(SW * (0.1 + 0.12 * (i % 3)), y), (SW * (0.35 + 0.12 * (i % 3)), y)], fill='#c8cdd2', width=2)
        d.line([(SW * (0.55 + 0.1 * (i % 2)), y + 3), (SW * (0.8 + 0.1 * (i % 2)), y + 3)], fill='#b8c0c8', width=2)
    d.rectangle([0, SH * 0.94, SW, SH], fill='#6a6248')  # 岸


def scn_forest(d):
    vgrad(d, (0, 0, SW, SH), '#8aa06a', '#4e5a3a')
    for cx, cy, r in [(0.2, 0.16, 0.2), (0.55, 0.1, 0.24), (0.85, 0.18, 0.18), (0.4, 0.24, 0.16)]:
        d.ellipse([SW * (cx - r), SH * (cy - r * 0.7), SW * (cx + r), SH * (cy + r * 0.7)], fill='#3e4a2e')  # 树冠
    for i, x in enumerate((0.08, 0.22, 0.38, 0.55, 0.7, 0.85)):
        w = 6 + (i % 3) * 3
        d.rectangle([SW * x - w // 2, SH * 0.2, SW * x + w // 2, SH], fill='#3a3226')  # 树干
        d.line([(SW * x, SH * 0.55), (SW * x + 14, SH * 0.42)], fill='#3a3226', width=3)  # 斜枝
    d.rectangle([0, SH * 0.9, SW, SH], fill='#4a4430')  # 林地


def scn_house(d):
    vgrad(d, (0, 0, SW, SH), '#a4b8c8', '#ddd2b2')
    d.rectangle([SW * 0.22, SH * 0.42, SW * 0.78, SH * 0.9], fill='#8a7a62')  # 房身
    d.polygon([(SW * 0.16, SH * 0.44), (SW * 0.5, SH * 0.16), (SW * 0.84, SH * 0.44)], fill='#5e4a3a')  # 屋顶
    d.rectangle([SW * 0.45, SH * 0.6, SW * 0.57, SH * 0.9], fill='#4a3628')  # 门
    for wx in (0.28, 0.62):
        d.rectangle([SW * wx, SH * 0.52, SW * (wx + 0.12), SH * 0.68], fill='#d8d2b8')  # 窗
        d.line([(SW * (wx + 0.06), SH * 0.52), (SW * (wx + 0.06), SH * 0.68)], fill='#8a7a62', width=2)
    d.rectangle([0, SH * 0.9, SW, SH], fill='#6a6248')  # 门前草坪
    d.polygon([(SW * 0.46, SH * 0.9), (SW * 0.56, SH * 0.9), (SW * 0.6, SH), (SW * 0.42, SH)], fill='#9a948a')  # 小径


def scn_street(d):
    vgrad(d, (0, 0, SW, SH), '#9aaebc', '#c8c0a8')
    for i, (x, w, h) in enumerate([(0.0, 0.2, 0.62), (0.22, 0.16, 0.5), (0.66, 0.16, 0.55), (0.84, 0.16, 0.66)]):  # 两侧楼
        c = '#6a6258' if i % 2 else '#7a7268'
        d.rectangle([SW * x, SH * (0.9 - h), SW * (x + w), SH * 0.9], fill=c)
        for r in range(3):
            for cc in range(2):
                d.rectangle([SW * (x + 0.03 + cc * 0.08), SH * (0.95 - h) + 8 + r * 16, SW * (x + 0.08 + cc * 0.08), SH * (0.95 - h) + 18 + r * 16], fill='#c8c0a0')
    d.polygon([(SW * 0.36, SH * 0.9), (SW * 0.62, SH * 0.9), (SW * 0.78, SH), (SW * 0.2, SH)], fill='#4e4a44')  # 路面透视
    d.line([(SW * 0.49, SH * 0.92), (SW * 0.49, SH)], fill='#c8c4b0', width=2)  # 车道线


def scn_still(d):
    vgrad(d, (0, 0, SW, SH), '#b0a28a', '#6e6250')
    d.rectangle([0, SH * 0.68, SW, SH], fill='#7a6248')  # 桌面
    d.ellipse([SW * 0.24, SH * 0.72, SW * 0.56, SH * 0.8], fill='#d8d2c2')  # 杯碟
    d.rounded_rectangle([SW * 0.3, SH * 0.5, SW * 0.5, SH * 0.74], radius=8, fill='#e2dcc8')  # 杯身
    d.arc([SW * 0.46, SH * 0.55, SW * 0.58, SH * 0.68], -80, 90, fill='#e2dcc8', width=6)  # 杯把
    for i in range(2):  # 热气
        d.arc([SW * (0.34 + i * 0.08), SH * 0.3, SW * (0.44 + i * 0.08), SH * 0.48], 100, 260, fill='#c8c0b0', width=3)
    d.rectangle([SW * 0.66, SH * 0.5, SW * 0.76, SH * 0.76], fill='#8a4a3a')  # 小花瓶
    d.line([(SW * 0.71, SH * 0.5), (SW * 0.71, SH * 0.3)], fill='#4a5a3a', width=3)  # 花茎
    for a in range(6):  # 花瓣
        import math
        px = SW * 0.71 + 10 * math.cos(a * math.pi / 3)
        py = SH * 0.28 + 8 * math.sin(a * math.pi / 3)
        d.ellipse([px - 5, py - 4, px + 5, py + 4], fill='#c97a6a')
    d.ellipse([SW * 0.71 - 4, SH * 0.28 - 3, SW * 0.71 + 4, SH * 0.28 + 3], fill='#d9b13b')  # 花心


SCENES = {
    'photo_mountain.png': scn_mountain,
    'photo_lake.png': scn_lake,
    'photo_forest.png': scn_forest,
    'photo_house.png': scn_house,
    'photo_street.png': scn_street,
    'photo_still.png': scn_still,
}

STALE = ('photo_portrait.png', 'photo_group.png')  # v54：人物类已移除——重跑时清理旧文件


def aged(scene: Image.Image) -> Image.Image:
    """照片做旧：降饱和 + 暖色偏移 + 暗角。"""
    img = ImageEnhance.Color(scene).enhance(0.55)      # 褪色
    img = ImageEnhance.Brightness(img).enhance(1.03)
    warm = Image.new('RGB', img.size, '#c8a878')       # 暖色偏移
    img = Image.blend(img, warm, 0.1)
    # 暗角（径向压暗，高斯羽化避免硬边）
    mask = Image.new('L', img.size, 0)
    md = ImageDraw.Draw(mask)
    md.ellipse([-SW * 0.25, -SH * 0.3, SW * 1.25, SH * 1.3], fill=90)
    md.ellipse([SW * 0.08, SH * 0.05, SW * 0.92, SH * 0.95], fill=0)
    mask = mask.filter(ImageFilter.GaussianBlur(16))
    dark = ImageEnhance.Brightness(img).enhance(0.62)
    return Image.composite(dark, img, mask)


def main():
    import os
    os.makedirs(OUT, exist_ok=True)
    for stale in STALE:  # 幂等：清理已移除的人物类旧文件
        p = os.path.join(OUT, stale)
        if os.path.exists(p):
            os.remove(p)
            print('  rm', stale)
    for name, fn in SCENES.items():
        scene = Image.new('RGB', (SW, SH))
        fn(ImageDraw.Draw(scene))
        photo = Image.new('RGB', (W, H), '#ece6d8')  # 照片白边（微暖白）
        photo.paste(aged(scene), (BORD, BORD))
        photo.save(os.path.join(OUT, name))
        print('  ok', name)


if __name__ == '__main__':
    main()
