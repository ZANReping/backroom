#!/usr/bin/env python3
# gen-l3-textures.py —— Level 3「发电站」贴图重制
#
#   l3_wall.jpg  ← ambientCG Bricks059（CC0 真实砖墙照片）：去色 + 均值归一 0.72 + 轻积灰；
#                  配世界 UV（WALL_UV_PER_M[3]=1，1 重复=1m）砖约 24×6.4cm 横砌。
#                  （本机 TLS 被截断，curl 需 --tlsv1.2 -k；完全离线时回退 gen_brick() 程序生成版）
#   l3_wall2.jpg ← l3_wall.jpg：深色积灰砖变体（压暗 + 轻去色 + 积灰斑块），供 TEX2 变体区
#   l3_floor.jpg ← 既有混凝土：叠加积灰斑块（浅灰白斑驳）+ 细颗粒 = 布满灰尘的混凝土地板
#                  （一次性生成，已入库即定稿；目标存在则跳过）
#   l3_ceil.jpg  ← l103_wall.jpg（Plaster006 洁白粉刷，ambientCG CC0，见 SOURCES.md v37 节）：
#                  暖灰化 + 积灰斑块 = 布满灰尘的白色天花板（同上，一次性生成）
#
# 从 app/ 目录运行：python scripts/gen-l3-textures.py
import os
import random
from PIL import Image, ImageDraw, ImageFilter, ImageEnhance

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TEX = os.path.join(ROOT, 'public', 'textures')
SIZE = 512
rng = random.Random(3)


def load(name):
    return Image.open(os.path.join(TEX, name)).convert('RGB').resize((SIZE, SIZE), Image.LANCZOS)


def save(img, name):
    img.save(os.path.join(TEX, name), quality=88)
    print('written', name)


def dust_mask(blotches=10, blur=26, seed=0):
    """低频积灰遮罩：随机软斑块 → 高斯模糊，返回 L 模式 0..180 的灰度图"""
    r = random.Random(seed)
    m = Image.new('L', (SIZE, SIZE), 0)
    d = ImageDraw.Draw(m)
    for _ in range(blotches):
        x, y = r.uniform(-0.1, 1.0) * SIZE, r.uniform(-0.1, 1.0) * SIZE
        rad = r.uniform(0.10, 0.30) * SIZE
        v = r.randint(50, 130)
        d.ellipse([x - rad, y - rad, x + rad, y + rad], fill=v)
    # 平铺可循环：把边缘斑块复制到对侧（近似即可，模糊后接缝不可见）
    m = m.filter(ImageFilter.GaussianBlur(blur))
    return m


def grain(img, sigma=7, seed=0):
    noise = Image.effect_noise((SIZE, SIZE), sigma).convert('L')
    return Image.composite(img, ImageEnhance.Brightness(img).enhance(0.94),
                           noise.point(lambda v: 128 + (v - 128) // 3))


def apply_dust(img, dust_rgb, mask, strength=1.0):
    dust = Image.new('RGB', (SIZE, SIZE), dust_rgb)
    if strength != 1.0:
        mask = mask.point(lambda v: int(v * strength))
    return Image.composite(dust, img, mask)


def gen_brick(seed=7):
    """程序生成无缝砖墙：4 砖 × 12 层 / 512²（世界 UV per=1 → 砖约 25×8.3cm 横砌）。
    顺砖砌法（奇数层错半砖），砖色按环绕索引哈希——左右/上下边缘天然连续。"""
    N, C = 4, 12
    bw, ch = SIZE // N, SIZE // C  # 128 × 42（末层 44，视觉无差）
    r = random.Random(seed)
    img = Image.new('RGB', (SIZE, SIZE), (118, 112, 104))  # 灰浆底
    d = ImageDraw.Draw(img)
    # 砖色表（环绕索引 → 边缘连续）：偏暗的红砖色系 + 少量风化浅色砖
    def brick_color(bi, bj):
        h = random.Random((bi % N) * 1000 + (bj % C) * 17 + seed)
        roll = h.random()
        if roll < 0.12:  # 风化白砖
            base = (176, 168, 152)
        elif roll < 0.3:  # 深褐砖
            base = (104, 62, 50)
        else:  # 红砖主色
            base = (140 + h.randint(-16, 22), 74 + h.randint(-12, 12), 58 + h.randint(-10, 10))
        return tuple(max(0, min(255, c + h.randint(-8, 8))) for c in base)
    for j in range(C):
        y0 = j * ch
        y1 = SIZE if j == C - 1 else (j + 1) * ch
        offset = -bw // 2 if j % 2 else 0
        for i in range(-1, N + 1):
            x0 = i * bw + offset
            c = brick_color(i, j)
            # 砖体（四边各留 3~4px 灰浆缝）
            d.rectangle([x0 + 3, y0 + 3, x0 + bw - 4, y1 - 4], fill=c)
            # 顶部受光/底部阴影（轻微立体感）
            d.line([x0 + 3, y0 + 3, x0 + bw - 4, y0 + 3], fill=tuple(min(255, v + 22) for v in c))
            d.line([x0 + 3, y1 - 4, x0 + bw - 4, y1 - 4], fill=tuple(max(0, v - 26) for v in c))
    # 砖面噪点 + 风化暗斑 + 积灰
    img = grain(img, 9, seed)
    img = apply_dust(img, (70, 62, 54), dust_mask(9, 30, seed=seed + 1), 0.55)
    img = apply_dust(img, (128, 122, 112), dust_mask(6, 36, seed=seed + 2), 0.3)
    return img


def fetch_acg(file_id):
    """ambientCG Color 图（CC0）。本机 TLS 被截断，curl 需 --tlsv1.2 -k；缓存 scripts/.cache-l3/。"""
    cache = os.path.join(ROOT, 'scripts', '.cache-l3', f'{file_id}.zip')
    if not os.path.exists(cache):
        import subprocess
        os.makedirs(os.path.dirname(cache), exist_ok=True)
        subprocess.run(['curl', '-sL', '--tlsv1.2', '-k', '-A', 'Mozilla/5.0', '--max-time', '120',
                        '-o', cache, f'https://ambientcg.com/get?file={file_id}_1K-JPG.zip'], check=True)
    import io, zipfile
    return Image.open(io.BytesIO(zipfile.ZipFile(cache).read(f'{file_id}_1K-JPG_Color.jpg'))).convert('RGB')


def fetch_bricks059():
    return fetch_acg('Bricks059')


def normalize_mean(img, target=0.72):
    """去色 + 全局均值归一（顶点色叠乘管线惯例，同 gen-l105/l274）"""
    g = img.convert('L').convert('RGB')
    import numpy as np
    mean = np.asarray(g, dtype=float).mean() / 255
    return ImageEnhance.Brightness(g).enhance(target / max(mean, 1e-3))


def main():
    # 砖纹（v51 第三版）：ambientCG Bricks059（CC0 真实砖墙照片，~4.2 砖 × ~16 层/1024）——
    # 世界 UV per=1（1 重复=1m）下砖约 24×6.4cm 横砌；去色 + 均值归一 0.72 + 轻积灰。
    # 原摄影砖图留存 _src_l3_brick.jpg；程序生成版留 gen_brick() 作离线回退。
    brick = normalize_mean(fetch_bricks059().resize((SIZE, SIZE), Image.LANCZOS), 0.72)
    brick = apply_dust(brick, (120, 114, 106), dust_mask(8, 34, seed=41), 0.35)
    save(brick, 'l3_wall.jpg')

    # l3_wall2：深色积灰砖变体
    w2 = ImageEnhance.Color(brick).enhance(0.55)
    w2 = ImageEnhance.Brightness(w2).enhance(0.68)
    w2 = apply_dust(w2, (96, 92, 86), dust_mask(12, 30, seed=11), 0.9)
    save(grain(w2, 6, 1), 'l3_wall2.jpg')

    # l3_marble：圣所地板（ambientCG Marble012 灰白大理石，CC0）——轻去色保冷调 + 均值归一 0.78
    # + 极轻积灰；geometry 对 tint=20 的地板瓦片单独走本贴图（墙壁维持砖砌，wikidot 设定）
    mb = normalize_mean(fetch_acg('Marble012').convert('L').convert('RGB').resize((SIZE, SIZE), Image.LANCZOS), 0.78)
    mb = apply_dust(mb, (150, 146, 138), dust_mask(6, 40, seed=55), 0.18)
    save(mb, 'l3_marble.jpg')

    # l3_floor / l3_ceil 为一次性生成（输入即库内最终文件，重跑会重复叠灰）——
    # 仅在目标缺失时生成；当前已入库的积灰版即定稿，要重做需先删掉目标文件。
    if not os.path.exists(os.path.join(TEX, 'l3_floor.jpg')):
        concrete_src = load('_src_l3_concrete.jpg')  # 原始混凝土（未入库则跳过）
        f = ImageEnhance.Color(concrete_src).enhance(0.8)
        f = apply_dust(f, (138, 134, 126), dust_mask(14, 24, seed=22), 1.0)
        f = apply_dust(f, (108, 104, 98), dust_mask(8, 40, seed=23), 0.5)
        save(grain(f, 7, 2), 'l3_floor.jpg')

    # l3_ceil：白粉刷 → 布满灰尘的白色天花板（保持亮白基调，只落灰不压暗太多）
    if not os.path.exists(os.path.join(TEX, 'l3_ceil.jpg')):
        plaster = load('l103_wall.jpg')
        c = ImageEnhance.Color(plaster).enhance(0.7)
        c = ImageEnhance.Brightness(c).enhance(0.97)
        c = apply_dust(c, (156, 150, 140), dust_mask(12, 28, seed=33), 0.85)
        save(grain(c, 5, 3), 'l3_ceil.jpg')


if __name__ == '__main__':
    main()
