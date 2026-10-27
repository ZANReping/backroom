#!/usr/bin/env python3
# 猎犬（Entity 8）重制：汇总图 / GIF 合成（PIL）。输入是 scripts/verify-hound.mjs 截出的 reports/hound/*.png。
#   python3 scripts/hound-sheets.py face  → reports/hound/face2.jpg（新脸正 / 侧 / 3/4 与附图、旧脸对比；带毛发 / 掀发；尾巴与背毛特写）
#   python3 scripts/hound-sheets.py gif [clip,clip,…] → reports/hound/stage2.gif（anim-<clip>.png 网格截图逐格切帧，每个动作一段，8MB 以内；元数据取 verify-result.json）
import os, sys, glob, json
from PIL import Image, ImageDraw, ImageFont

OUT = 'reports/hound/'
REF = os.environ.get('HD_REF', '/workspace/projects/e0cd64b2-425c-4ea5-8bdb-bc0f453e036c/files/uploads/image-0a5c802a2a74.webp')
FONT = '/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc'


def font(sz):
    try:
        return ImageFont.truetype(FONT, sz)
    except Exception:
        return ImageFont.load_default()


def tile(path, w, h, label=None, crop=None):
    im = Image.open(path).convert('RGB')
    if crop:
        W, H = im.size
        im = im.crop((int(crop[0] * W), int(crop[1] * H), int(crop[2] * W), int(crop[3] * H)))
    # 等比缩放后居中裁成 w×h
    s = max(w / im.width, h / im.height)
    im = im.resize((max(w, round(im.width * s)), max(h, round(im.height * s))), Image.LANCZOS)
    x, y = (im.width - w) // 2, (im.height - h) // 2
    im = im.crop((x, y, x + w, y + h))
    if label:
        d = ImageDraw.Draw(im)
        f = font(22)
        d.rectangle((0, h - 38, w, h), fill=(20, 18, 14))
        d.text((10, h - 34), label, font=f, fill=(245, 236, 200))
    return im


def sheet(rows, W=1800, gap=6, bg=(24, 22, 18)):
    out = []
    for row in rows:
        h, items = row[0], row[1]
        n = len(items)
        w = (W - gap * (n - 1)) // n
        r = Image.new('RGB', (W, h), bg)
        for i, (p, lab, *cr) in enumerate(items):
            r.paste(tile(p, w, h, lab, cr[0] if cr else None), (i * (w + gap), 0))
        out.append(r)
    H = sum(r.height for r in out) + gap * (len(out) - 1)
    im = Image.new('RGB', (W, H), bg)
    y = 0
    for r in out:
        im.paste(r, (0, y)); y += r.height + gap
    return im


def face():
    P = lambda n: OUT + n + '.png'
    rows = [
        (520, [(REF, '附图·正脸', (0.02, 0.0, 0.25, 0.42)), (P('headNF'), '新脸·正面（隐藏毛发）'), (P('headNS'), '新脸·侧面（隐藏毛发）'), (P('headN'), '新脸·3/4（隐藏毛发）'), (REF, '附图·3/4', (0.03, 0.44, 0.24, 0.8))]),
        (420, [(OUT + 'old/headNF-stage1.png', '旧脸·正面（6575c71，太圆太胖）'), (OUT + 'old/headN-stage1.png', '旧脸·3/4（猪鼻 / 大圆鼻孔）'), (P('headF0'), '新·带毛发正面（盖脸）'), (P('head1'), '新·掀发 3/4（houndHairPart）')]),
        (440, [(P('tailC'), '尾巴：毛芯 + 错层外层发片 + 尾尖散开'), (P('backtop'), '背毛：分缕 / 扭转 / 分叉 / 斑秃')]),
    ]
    im = sheet(rows)
    im.save(OUT + 'face2.jpg', quality=88)
    print('face2', OUT + 'face2.jpg', im.size)


def gif():
    res = json.load(open(OUT + 'verify-result.json'))['results']
    order = (sys.argv[2] if len(sys.argv) > 2 else 'gallop,pounce,howl,cower,sit,wag,pin').split(',')
    frames, durs = [], []
    W = 640
    for clip in order:
        m = res['anim-' + clip]['info']
        im = Image.open(OUT + f'anim-{clip}.png').convert('RGB')
        cols, rows_, n = m['cols'], m['rows'], m['frames']
        cw, ch = im.width // cols, im.height // rows_
        for i in range(n):
            c, r = i % cols, i // cols
            f = im.crop((c * cw, r * ch, (c + 1) * cw, (r + 1) * ch))
            f = f.resize((W, round(ch * W / cw)), Image.LANCZOS)
            d = ImageDraw.Draw(f)
            d.rectangle((0, 0, W, 34), fill=(20, 18, 14))
            d.text((10, 3), m['title'] + ('' if m.get('kind') in (None, 'hostile') else f"（{ {'neutral': '中立', 'ambusher': '高智能'}[m['kind']] }）"), font=font(22), fill=(245, 236, 200))
            frames.append(f); durs.append(max(60, m.get('ms', 70)))
    pal = [f.quantize(colors=128, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE) for f in frames]
    pal[0].save(OUT + 'stage2.gif', save_all=True, append_images=pal[1:], duration=durs, loop=0, optimize=True, disposal=1)
    sz = os.path.getsize(OUT + 'stage2.gif')
    print('gif', OUT + 'stage2.gif', len(frames), 'frames', round(sz / 1e6, 2), 'MB')
    if sz > 8e6:
        sys.exit('GIF 超过 8MB')


if __name__ == '__main__':
    {'face': face, 'gif': gif}[sys.argv[1] if len(sys.argv) > 1 else 'face']()
