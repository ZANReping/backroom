#!/usr/bin/env python3
# [beast chroma v2] 头部特写汇总：reports/beast/zc-<state>.png（verify-beast.mjs B_RAW 单帧，900×800）→ reports/beast/chroma-v2.jpg
#   上排：平静斑驳 / 急速变白 / 云纹流动中 / 恼怒红褐 + 眼环（头部裁切）；下排：同一帧的皮肤局部 ×2.2 放大（看清色素点）
#   python3 scripts/beast-chroma-sheet.py [输出名]
import os, sys
from PIL import Image, ImageDraw, ImageFont

OUT = 'reports/beast/'
STATES = [('calm', '平静：轻微斑驳 + 弱虹彩', 'idle 2.0s'), ('blanch', '急速变白：色素点全收缩', 'colorFlash 0.22s'),
          ('cloud', '云纹流动中：深褐色带流过', 'colorFlash 0.6s'), ('angry', '恼怒：红褐至深褐 + 眼环 + 镶边', 'colorFlash 1.5s')]
EXTRA = [('sweep', '握手：一道云纹扫过', 'handshake 1.6s'), ('vanish', '隐入暗处：近黑斑驳', 'vanish 1.2s')]
HEAD = (120, 40, 800, 760)       # 头部裁切（900×800 原图）
ZOOM = (430, 170, 690, 430)      # 局部放大：眼后 / 外套膜根部（眼环、斑块、色素点都在这片）


def font(sz):
    for f in ('/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc', os.path.expanduser('~/.fonts/NotoSansSC-Bold.otf'), '/workspace/work/fonts/NotoSansSC-Bold.otf'):
        try:
            return ImageFont.truetype(f, sz)
        except Exception:
            pass
    return ImageFont.load_default()


def label(im, text, sub=''):
    d = ImageDraw.Draw(im)
    d.rectangle((0, im.height - 34, im.width, im.height), fill=(16, 14, 11))
    d.text((8, im.height - 31), text, font=font(18), fill=(245, 236, 200))
    if sub:
        d.text((im.width - 8 - d.textlength(sub, font=font(14)), im.height - 27), sub, font=font(14), fill=(170, 160, 130))
    return im


def main():
    name = sys.argv[1] if len(sys.argv) > 1 else 'chroma-v2.jpg'
    TW = 420
    tops, zooms = [], []
    for key, zh, sub in STATES:
        im = Image.open(OUT + f'zc-{key}.png').convert('RGB')
        h = im.crop(HEAD); h = h.resize((TW, int(TW * h.height / h.width)), Image.LANCZOS)
        tops.append(label(h, zh, sub))
        z = im.crop(ZOOM).resize((TW, TW), Image.LANCZOS)
        zooms.append(label(z, zh.split('：')[0] + ' · 局部 ×1.6', ''))
    extras = []
    for key, zh, sub in EXTRA:
        if os.path.exists(OUT + f'zc-{key}.png'):
            im = Image.open(OUT + f'zc-{key}.png').convert('RGB')
            h = im.crop((60, 0, 860, 800)).resize((TW, TW), Image.LANCZOS)
            extras.append(label(h, zh, sub))
    th = tops[0].height
    W = 4 * TW + 3 * 4
    H = 50 + th + 4 + TW + (4 + TW if extras else 0)
    S = Image.new('RGB', (W, H), (8, 7, 6))
    ImageDraw.Draw(S).text((12, 12), '第五层的野兽 E18 · 色素变色 v2（仿真实墨鱼：色素细胞各自扩张 / 收缩、云纹、急速变白；不再整体染色）', font=font(22), fill=(245, 236, 200))
    for i, t in enumerate(tops):
        S.paste(t, (i * (TW + 4), 50))
    for i, z in enumerate(zooms):
        S.paste(z, (i * (TW + 4), 50 + th + 4))
    for i, e in enumerate(extras):
        S.paste(e, (i * (TW + 4), 50 + th + 4 + TW + 4))
    S.save(OUT + name, quality=88)
    print(name, S.size, os.path.getsize(OUT + name))


if __name__ == '__main__':
    main()
