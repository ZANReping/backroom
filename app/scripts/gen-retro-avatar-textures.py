#!/usr/bin/env python3
"""通用复古形象贴图（随机 NPC / 玩家 / 有名 NPC 共用池）：
art-source/npc-retro/pool/<g><k>-<v>-{face,blink[,smile,serious,sleepy]}.webp（512，已按统一构图规范化：眼线 v≈0.368、嘴 v≈0.775、两眼 u≈0.31/0.69）
art-source/npc-retro/cloth/{top-0..7,pants,hair}.webp（中性浅灰，运行时用顶点色染色）
→ public/textures/npc-retro/pool/<g><k>-<v>/{neutral,neutral-blink,smile,smile-blink,serious,serious-blink,sleepy,sleepy-blink}.png（128²）
→ public/textures/npc-retro/cloth/{top-0..7,pants-0..5,hair-straight|crop|curly|dreads}.png
· 表情 = 只把编辑图的眼/眉/嘴条带羽化贴回原脸（身份、肤色不变）；闭眼 = 原闭眼图的眼部窄条贴到对应表情脸上。
· 脸图外缘残留的纯白/灰背景（低饱和、比肤色亮）替换成同行肤色中位数。
· v79：顶部两角/顶边残留的源照片头发与下颌两侧白边用周围皮肤修补（retro_face_clean.py），
  因为运行时发色由发壳染色，脸图里不能带任何固定颜色的头发；原发区记入 PNG 的 alpha 通道
  （0 = 发区），retroNpc 脸材质在那里按角色发色着色（光头 / 无脸时当皮肤）。
用法：python3 scripts/gen-retro-avatar-textures.py
"""
import os
import sys
import numpy as np
from PIL import Image
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from retro_face_clean import clean_face, hair_alpha, clean_face_smooth, pool_hairline_alpha  # 去掉脸图角落残留的源照片头发与下颌白边（v82：池脸改用平滑发际线 + 皮肤纹理修补）

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'art-source', 'npc-retro')
OUT = os.path.join(ROOT, 'public', 'textures', 'npc-retro')
S = 128

RAW = {}
def load(p, smooth=False):
    raw = np.array(Image.open(p).convert('RGB')).astype(np.float32)
    RAW[p] = raw
    return (clean_face_smooth if smooth else clean_face)(raw)[0]

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

ALPHA = None  # 当前脸的发区 alpha（512），small() 时并入 A 通道
def small(a, size=S):
    im = Image.fromarray(np.clip(a, 0, 255).astype(np.uint8)).resize((size, size), Image.LANCZOS)
    if ALPHA is not None and a.shape[0] == ALPHA.shape[0]:
        al = Image.fromarray(np.clip(ALPHA * 255, 0, 255).astype(np.uint8)).resize((size, size), Image.LANCZOS)
        im = im.convert('RGBA'); im.putalpha(al)
    return im

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
    face = fix_bg(load(os.path.join(SRC, 'pool', f'{n}-face.webp'), True))
    ALPHA = pool_hairline_alpha(RAW[os.path.join(SRC, 'pool', f'{n}-face.webp')], seed=sum(map(ord, n)))
    blink = fix_bg(load(os.path.join(SRC, 'pool', f'{n}-blink.webp'), True))
    small(face).save(os.path.join(d, 'neutral.png'))
    small(mix(face, blink, EYE_STRIP)).save(os.path.join(d, 'neutral-blink.png'))
    for e, w in EXPR.items():
        p = os.path.join(SRC, 'pool', f'{n}-{e}.webp')
        if not os.path.exists(p):
            continue
        ef = mix(face, fix_bg(load(p, True)), w)
        small(ef).save(os.path.join(d, f'{e}.png'))
        small(mix(ef, blink, EYE_STRIP)).save(os.path.join(d, f'{e}-blink.png'))
    print('face', n)

# ---------- v79：有名 NPC 专属脸（每人一张，不再与随机 NPC 共用池脸）----------
# art-source/npc-retro/named/<id>-face.webp（512，同一构图）→ public/textures/npc-retro/named/<id>/{neutral,neutral-blink}.png
# 闭眼由原图合成：眼裂椭圆内换成上眼睑皮肤（取眼上方同列像素），下缘画一道睫毛线，边缘羽化。
EYES = [(0.312, 0.38), (0.692, 0.38)]
def synth_blink(a):
    n = a.shape[0]
    out = a.copy()
    ys, xs = (np.mgrid[0:n, 0:n] + 0.5) / n
    for (ex, ey) in EYES:
        rx, ry = 0.078, 0.034
        d = ((xs - ex) / rx) ** 2 + ((ys - ey) / ry) ** 2
        w = np.clip((1.45 - d) / 0.4, 0, 1)
        # Upper-lid skin: per column, the band between brow and eye, with a soft crease.
        r0, r1 = int((ey - 0.078) * n), int((ey - 0.046) * n)
        lumc = a[r0:r1].mean(axis=2); idx = np.argsort(lumc, axis=0)[int((r1 - r0) * 0.8)]; col = a[r0:r1][idx, np.arange(n)]
        k = max(3, n // 40)
        col = np.stack([np.convolve(np.pad(col[:, c], k, mode='edge'), np.ones(2 * k + 1) / (2 * k + 1), 'valid') for c in range(3)], 1)[None]
        lid = np.repeat(col, n, axis=0) * (0.97 - 0.06 * np.clip(1 - np.abs(ys - (ey - 0.008)) / 0.01, 0, 1))[:, :, None]
        out = out * (1 - w[:, :, None]) + lid * w[:, :, None]
        # lash line along the lower lid arc
        arc = ey + 0.012 + 0.010 * (1 - ((xs - ex) / rx) ** 2)
        lash = np.clip(1 - np.abs(ys - arc) / 0.006, 0, 1) * (np.abs(xs - ex) < rx * 0.92)
        out = out * (1 - 0.55 * lash[:, :, None]) + np.array([40, 28, 24]) * 0.55 * lash[:, :, None]
    return out

NAMED = os.path.join(SRC, 'named')
if os.path.isdir(NAMED):
    ids = sorted(f[:-10] for f in os.listdir(NAMED) if f.endswith('-face.webp'))
    for nid in ids:
        d = os.path.join(OUT, 'named', nid); os.makedirs(d, exist_ok=True)
        face = fix_bg(load(os.path.join(NAMED, f'{nid}-face.webp')))
        ALPHA = hair_alpha(RAW[os.path.join(NAMED, f'{nid}-face.webp')])
        small(face).save(os.path.join(d, 'neutral.png'))
        small(mix(face, synth_blink(face), EYE_STRIP)).save(os.path.join(d, 'neutral-blink.png'))
    with open(os.path.join(ROOT, 'src', 'game', 'renderer', 'retroNamedFaces.ts'), 'w', encoding='utf-8') as fh:
        fh.write('// 自动生成（scripts/gen-retro-avatar-textures.py）：拥有专属脸图的有名 NPC id。\n')
        fh.write('// 贴图 public/textures/npc-retro/named/<id>/{neutral,neutral-blink}.png；来源与提示词见 art-source/npc-retro/manifest.json → named。\n')
        fh.write('export const RETRO_NAMED_FACE_IDS: ReadonlySet<string> = new Set([\n' + ''.join(f"  '{i}',\n" for i in ids) + '])\n')
    print('named faces', len(ids))
ALPHA = None

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
