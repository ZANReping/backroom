#!/usr/bin/env python3
"""通用复古形象贴图（随机 NPC / 玩家 / 有名 NPC 共用池）：
art-source/npc-retro/pool/<g><k>-<v>-{face,blink[,smile,serious,sleepy]}.webp（512，已按统一构图规范化：眼线 v≈0.368、嘴 v≈0.775、两眼 u≈0.31/0.69）
art-source/npc-retro/cloth/{top-0..7,pants,hair}.webp（中性浅灰，运行时用顶点色染色）
→ public/textures/npc-retro/pool/<g><k>-<v>/{neutral,neutral-blink,smile,smile-blink,serious,serious-blink,sleepy,sleepy-blink}.png（128²）
→ public/textures/npc-retro/cloth/{top-0..7,pants-0..5,hair-straight|crop|curly|dreads}.png
· 表情 = 只把编辑图的眼/眉/嘴条带羽化贴回原脸（身份、肤色不变）；闭眼 = 原闭眼图的眼部窄条贴到对应表情脸上。
· 脸图外缘残留的纯白/灰背景（低饱和、比肤色亮）替换成同行肤色中位数。
用法：python3 scripts/gen-retro-avatar-textures.py
"""
import os
import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'art-source', 'npc-retro')
OUT = os.path.join(ROOT, 'public', 'textures', 'npc-retro')
S = 128

def load(p):
    return np.array(Image.open(p).convert('RGB')).astype(np.float32)

def fix_bg(a):
    n = a.shape[0]
    ys, xs = (np.mgrid[0:n, 0:n] + 0.5) / n
    outside = ((xs - 0.5) / 0.42) ** 2 + ((ys - 0.56) / 0.5) ** 2 > 1
    cheek = a[int(0.45 * n):int(0.55 * n), int(0.18 * n):int(0.26 * n)].reshape(-1, 3)
    skin = np.median(cheek, axis=0)
    mx, mn = a.max(axis=2), a.min(axis=2)
    sat = (mx - mn) / np.maximum(mx, 1)
    lum = a.mean(axis=2)
    bg = outside & (sat < 0.13) & (lum > skin.mean() + 22)
    for y in range(n):
        row = bg[y]
        if row.any():
            ok = ~row & ~outside[y] if (~row & ~outside[y]).any() else ~row
            a[y, row] = np.median(a[y, ok], axis=0) if ok.any() else skin
    return a

def band(n, lo, hi, f=0.025, xl=0.0, xh=1.0):
    ys, xs = (np.mgrid[0:n, 0:n] + 0.5) / n
    wy = np.clip(np.minimum(ys - lo, hi - ys) / f + 0.5, 0, 1)
    wx = np.clip(np.minimum(xs - xl, xh - xs) / f + 0.5, 0, 1)
    return (wy * wx)[:, :, None]

def mix(a, b, w):
    return a * (1 - w) + b * w

def small(a, size=S):
    return Image.fromarray(np.clip(a, 0, 255).astype(np.uint8)).resize((size, size), Image.LANCZOS)

N = 512
EYE_STRIP = band(N, 0.31, 0.43, 0.02, 0.08, 0.92)
EXPR = {
    'smile': band(N, 0.64, 0.9, 0.04, 0.16, 0.84),
    'serious': np.maximum(band(N, 0.22, 0.44, 0.03, 0.08, 0.92), band(N, 0.66, 0.88, 0.03, 0.2, 0.8)),
    'sleepy': band(N, 0.26, 0.45, 0.03, 0.08, 0.92),
}
pool = sorted({f[:4] for f in os.listdir(os.path.join(SRC, 'pool')) if f.endswith('-face.webp')})
for n in pool:
    d = os.path.join(OUT, 'pool', n); os.makedirs(d, exist_ok=True)
    face = fix_bg(load(os.path.join(SRC, 'pool', f'{n}-face.webp')))
    blink = fix_bg(load(os.path.join(SRC, 'pool', f'{n}-blink.webp')))
    small(face).save(os.path.join(d, 'neutral.png'))
    small(mix(face, blink, EYE_STRIP)).save(os.path.join(d, 'neutral-blink.png'))
    for e, w in EXPR.items():
        p = os.path.join(SRC, 'pool', f'{n}-{e}.webp')
        if not os.path.exists(p):
            continue
        ef = mix(face, fix_bg(load(p)), w)
        small(ef).save(os.path.join(d, f'{e}.png'))
        small(mix(ef, blink, EYE_STRIP)).save(os.path.join(d, f'{e}-blink.png'))
    print('face', n)

cd = os.path.join(OUT, 'cloth'); os.makedirs(cd, exist_ok=True)
for k in range(8):
    im = Image.open(os.path.join(SRC, 'cloth', f'top-{k}.webp')).convert('L').resize((S, S), Image.LANCZOS)
    im.save(os.path.join(cd, f'top-{k}.png'))
pa = Image.open(os.path.join(SRC, 'cloth', 'pants.webp')).convert('L')
for i in range(6):
    pa.crop(((i % 3) * 256, (i // 3) * 256, (i % 3) * 256 + 256, (i // 3) * 256 + 256)).resize((64, 64), Image.LANCZOS).save(os.path.join(cd, f'pants-{i}.png'))
hr = Image.open(os.path.join(SRC, 'cloth', 'hair.webp')).convert('L')
for i, name in enumerate(['straight', 'crop', 'curly', 'dreads']):
    m = 10
    hr.crop(((i % 2) * 256 + m, (i // 2) * 256 + m, (i % 2) * 256 + 256 - m, (i // 2) * 256 + 256 - m)).resize((64, 64), Image.LANCZOS).save(os.path.join(cd, f'hair-{name}.png'))
print('cloth ok')
