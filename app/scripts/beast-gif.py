#!/usr/bin/env python3
# [beast stage 2] 第五层的野兽（Entity 18）阶段 2：GIF / 汇总图合成（PIL）。输入是 scripts/verify-beast.mjs 截出的 reports/beast/*.png
#   python3 scripts/beast-gif.py gif   [clip,…]  → reports/beast/stage2.gif        （gif-<clip>.png 逐格切帧，多片段拼图同步播放，每格标中文片段名）；B_GIF=名字 改输出名
#   python3 scripts/beast-gif.py sheet [clip,…]  → reports/beast/stage2-sheet.jpg （anim-<clip>.png 8 帧网格里每片段挑 2 个关键帧，带中文标签）；B_SHEET=名字 改输出名
import os, sys, json
from PIL import Image, ImageDraw, ImageFont

OUT = 'reports/beast/'
ZH = {'idle': '站立待客', 'seatedIdle': '坐在书桌后', 'talk': '说话手势', 'beckon': '招手「进来」', 'handshake': '握手 + 云纹', 'pourTea': '倒茶推杯', 'signContract': '推契约递笔',
      'peripheralStill': '余光静立', 'vanish': '后退淡出', 'portraitGaze': '画像注视', 'doubtFreeze': '被怀疑僵住', 'reveal': '变真身', 'tentacleGrab': '触腕缠抓', 'colorFlash': '恼怒变色'}
ALL = list(ZH)
# 汇总图每片段挑的两帧（anim-<clip> 8 帧网格的格号）及说明
PICK = {'idle': [(0, ''), (4, '转头打量')], 'seatedIdle': [(0, '双手交叠'), (5, '手指轻敲')], 'talk': [(2, '右手摊掌'), (6, '左手摊掌')],
        'beckon': [(2, '勾指'), (4, '再勾一下')], 'handshake': [(3, '握住·云纹'), (5, '上下摇')], 'pourTea': [(3, '倾倒'), (6, '推杯')],
        'signContract': [(2, '推契约'), (5, '捏笔递出')], 'peripheralStill': [(0, '盯视'), (4, '')], 'vanish': [(2, '后撤·变暗'), (5, '淡出')],
        'portraitGaze': [(1, '眼随目标'), (5, '')], 'doubtFreeze': [(3, '「哦。」'), (5, '「呃…？」')], 'reveal': [(3, '形态 0.6'), (7, '真身')],
        'tentacleGrab': [(2, '抽出命中'), (4, '缠住收回')], 'colorFlash': [(1, '变白→云纹'), (3, '红褐 + 眼环')]}


def font(sz):
    for f in ('/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc', os.path.expanduser('~/.fonts/NotoSansSC-Bold.otf'), '/workspace/work/fonts/NotoSansSC-Bold.otf'):
        try:
            return ImageFont.truetype(f, sz)
        except Exception:
            pass
    for f in os.listdir(os.path.expanduser('~/.fonts')):
        try:
            return ImageFont.truetype(os.path.expanduser('~/.fonts/') + f, sz)
        except Exception:
            pass
    return ImageFont.load_default()


def info(name):
    return json.load(open(OUT + 'verify-result.json'))[name]['info']


def frames_of(name, crop=None):
    m = info(name)
    im = Image.open(OUT + name + '.png').convert('RGB')
    cols, n, tw, th = m['cols'], m['frames'], m['tw'], m['th']
    fr = []
    for i in range(n):
        c, r = i % cols, i // cols
        f = im.crop((c * tw, r * th, (c + 1) * tw, (r + 1) * th))
        if crop:
            W, H = f.size
            f = f.crop((int(crop[0] * W), int(crop[1] * H), int(crop[2] * W), int(crop[3] * H)))
        fr.append(f)
    return fr, m


def label(f, text, sz=17):
    d = ImageDraw.Draw(f)
    h = sz + 10
    y0 = f.height - h
    d.rectangle((0, y0, f.width, y0 + h), fill=(18, 16, 13))
    d.text((7, y0 + 3), text, font=font(sz), fill=(245, 236, 200))
    return f


def gif():
    clips = sys.argv[2].split(',') if len(sys.argv) > 2 and sys.argv[2] else ALL
    T = int(os.environ.get('B_TILE', 240))
    cols = int(os.environ.get('B_COLS', 5))
    rows = (len(clips) + cols - 1) // cols
    seqs = []
    for c in clips:
        fr, m = frames_of('gif-' + c)
        seqs.append([label(f.resize((T, T), Image.LANCZOS), f'{ZH[c]} {c}', 14) for f in fr])
    n = max(len(s) for s in seqs)
    out = []
    for k in range(n):
        F = Image.new('RGB', (cols * T + (cols - 1) * 2, rows * T + (rows - 1) * 2), (10, 9, 8))
        for i, s in enumerate(seqs):
            c, r = i % cols, i // cols
            F.paste(s[k % len(s)], (c * (T + 2), r * (T + 2)))
        out.append(F.quantize(colors=144, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE))
    name = os.environ.get('B_GIF', 'stage2.gif')
    path = OUT + name
    out[0].save(path, save_all=True, append_images=out[1:], duration=100, loop=0, optimize=True, disposal=1)
    print(name, n, 'frames', os.path.getsize(path))


def sheet():
    clips = sys.argv[2].split(',') if len(sys.argv) > 2 and sys.argv[2] else ALL
    TW, TH, COLS = 300, 338, 4   # 每格 300×338；一行 2 个片段（每片段 2 格）
    tiles = []
    for c in clips:
        fr, m = frames_of('anim-' + c, crop=(0.0, 0.075, 1.0, 1.0))
        n = m['frames']
        for idx, note in PICK[c]:
            t = (idx / n if C_LOOP.get(c) else idx / (n - 1)) * m['dur']
            f = fr[idx].resize((TW, TH), Image.LANCZOS)
            label(f, f'{ZH[c]} {c} {t:.1f}s' + (f' · {note}' if note else ''), 14)
            tiles.append(f)
    rows = (len(tiles) + COLS - 1) // COLS
    S = Image.new('RGB', (COLS * (TW + 3), rows * (TH + 3) + 46), (8, 7, 6))
    ImageDraw.Draw(S).text((12, 9), '第五层的野兽 Entity 18 · 阶段 2 动画 · 14 个片段各 2 个关键帧', font=font(23), fill=(245, 236, 200))
    for i, f in enumerate(tiles):
        S.paste(f, ((i % COLS) * (TW + 3), 46 + (i // COLS) * (TH + 3)))
    name = os.environ.get('B_SHEET', 'stage2-sheet.jpg')
    S.save(OUT + name, quality=86)
    print(name, S.size, os.path.getsize(OUT + name))


C_LOOP = {'idle': 1, 'seatedIdle': 1, 'talk': 1, 'peripheralStill': 1, 'portraitGaze': 1}

if __name__ == '__main__':
    {'gif': gif, 'sheet': sheet}[sys.argv[1]]()
