#!/usr/bin/env python3
"""猎犬 E8 第一人称扑倒实机截图汇总：python3 scripts/hound-fp-sheet.py <截图目录> <输出 jpg> [输出 gif]
2×2 拼图（扑中瞬间 / 被咬 / 挣脱一半 / 挣脱后硬直），每格 960×540 带标题；gif 用 frames/*.png 逐帧（缩到 640×360，限 6 MB）。"""
import sys, glob, os
from PIL import Image, ImageDraw, ImageFont
src, out = sys.argv[1].rstrip('/') + '/', sys.argv[2]
gif = sys.argv[3] if len(sys.argv) > 3 else None
FONT = next((f for f in ['/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc', '/usr/share/fonts/opentype/noto/NotoSerifCJK-Bold.ttc'] if os.path.exists(f)), None)
font = ImageFont.truetype(FONT, 30) if FONT else ImageFont.load_default()
cells = [('1-hit', '① 扑中瞬间'), ('2-bite', '② 压制中被咬（边缘泛红）'), ('3-half', '③ 挣脱到一半'), ('4-stagger', '④ 挣脱成功 · 猎犬硬直')]
W, H = 960, 540
sheet = Image.new('RGB', (W * 2 + 12, H * 2 + 12), '#181818')
for i, (n, t) in enumerate(cells):
    p = src + n + '.png'
    im = Image.open(p).convert('RGB').resize((W, H), Image.LANCZOS) if os.path.exists(p) else Image.new('RGB', (W, H), '#333')
    d = ImageDraw.Draw(im)
    tw = d.textlength(t, font=font)
    d.rectangle([0, H - 52, tw + 28, H], fill=(0, 0, 0))
    d.text((14, H - 47), t, font=font, fill=(255, 236, 200))
    sheet.paste(im, ((i % 2) * (W + 12), (i // 2) * (H + 12)))
sheet.save(out, quality=88)
print('sheet', out, os.path.getsize(out))
if gif:
    fr = sorted(glob.glob(src + 'frames/*.png'))
    for size, step in [((640, 360), 1), ((560, 315), 1), ((480, 270), 2)]:
        ims = [Image.open(f).convert('RGB').resize(size, Image.LANCZOS) for f in fr[::step]]
        pal = ims[len(ims) // 2].quantize(colors=192, method=Image.MEDIANCUT)
        q = [im.quantize(palette=pal, dither=Image.FLOYDSTEINBERG) for im in ims]
        q[0].save(gif, save_all=True, append_images=q[1:], duration=int(1000 / int(os.environ.get("FPS", "15")) * step), loop=0, optimize=True)
        sz = os.path.getsize(gif)
        print('gif', gif, len(q), 'frames', size, sz)
        if sz <= 6 * 1024 * 1024: break
