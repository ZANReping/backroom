#!/usr/bin/env python3
"""复古 NPC 贴图处理（参考 Bumper-Crop 的 NPC 管线）：
art-source/npc-retro/<id>-{face,blink,body}.webp 与 hair-atlas.webp（1024² 生成原图）
→ public/textures/npc-retro/<id>/{face,face-blink,body,hair}.png（128²，运行时 NearestFilter、无 mipmap）。
· 闭眼图只取眼部条带（羽化）贴回睁眼图，保证两张图除眼睑外逐像素一致（眨眼换图不跳脸）。
· 脸图四角若残留白底，用相邻肤色填补（脸网格四角也会被采样到）。
用法：python3 scripts/gen-retro-npc-textures.py
"""
import json, os
from PIL import Image, ImageFilter
import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'art-source', 'npc-retro')
OUT = os.path.join(ROOT, 'public', 'textures', 'npc-retro')
meta = json.load(open(os.path.join(SRC, 'manifest.json')))
S = 128

def fix_white(a):
    # 近白像素（背景残留）→ 该行非白像素的中位色
    a = a.astype(np.float32)
    white = (a.min(axis=2) > 225)
    for y in range(a.shape[0]):
        row = white[y]
        if row.any() and (~row).any():
            a[y, row] = np.median(a[y, ~row], axis=0)
    return a.astype(np.uint8)

def small(img):
    return img.convert('RGB').resize((S, S), Image.LANCZOS)

hair = Image.open(os.path.join(SRC, 'hair-atlas.webp')).convert('RGB')
H = hair.size[0] // 2
for nid, m in meta['npcs'].items():
    d = os.path.join(OUT, nid); os.makedirs(d, exist_ok=True)
    face = np.array(Image.open(os.path.join(SRC, f'{nid}-face.webp')).convert('RGB'))
    blink = np.array(Image.open(os.path.join(SRC, f'{nid}-blink.webp')).convert('RGB').resize(face.shape[1::-1]))
    face = fix_white(face)
    # 眼部条带：眼线上下各 ~9%，上下羽化 3%
    ey = m['landmarks'][0]; n = face.shape[0]
    ys = np.arange(n) / n
    w = np.clip(1 - (np.abs(ys - (ey - 0.01)) - 0.09) / 0.03, 0, 1)[:, None, None]
    blinkF = (face * (1 - w) + fix_white(blink) * w).astype(np.uint8)
    small(Image.fromarray(face)).save(os.path.join(d, 'face.png'))
    small(Image.fromarray(blinkF)).save(os.path.join(d, 'face-blink.png'))
    small(Image.open(os.path.join(SRC, f'{nid}-body.webp'))).save(os.path.join(d, 'body.png'))
    qx, qy = m['hair']
    m2 = H // 24  # 内缩，去掉图集分隔线
    small(hair.crop((qx * H + m2, qy * H + m2, qx * H + H - m2, qy * H + H - m2))).save(os.path.join(d, 'hair.png'))
    print('ok', nid)
