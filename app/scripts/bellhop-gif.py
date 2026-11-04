#!/usr/bin/env python3
# [bellhop stage 2] 行李员（Entity 135）阶段 2：GIF / 汇总图合成（PIL）。输入是 scripts/verify-bellhop.mjs 截出的 reports/bellhop/*.png
#   python3 scripts/bellhop-gif.py gif   [clip,…]  → reports/bellhop/stage2.gif       （gif-<clip>.png 逐格切帧，多片段拼图同步播放，每格标片段名，~8 MB 内）
#   python3 scripts/bellhop-gif.py walk             → reports/bellhop/stage2-walk.gif  （walk-walk / walk-pushCart：根位移前进的侧面，地面棋盘格看脚锁定）
#   python3 scripts/bellhop-gif.py sheet [clip,…]   → reports/bellhop/stage2-sheet.jpg （anim-<clip>.png 8 帧网格 → 每片段一行关键帧）；B_SHEET=名字 改输出名
import os, sys, json
from PIL import Image, ImageDraw, ImageFont

OUT = 'reports/bellhop/'
ZH = {'idle': '侍立', 'headTurn': '拧头 + 歪头', 'ringFriendly': '友好摇铃', 'ringAnnoyed': '恼怒摇铃', 'bow': '躬身行礼', 'walk': '行走', 'pushCart': '推行李车',
      'takeItem': '双手接物', 'giveBack': '双手递还', 'tagHand': '递行李牌', 'teaSip': '饮茶', 'faceShift': '抽搐换脸', 'pickUp': '拾物上车', 'stillWatch': '被注视定住'}
ALL = list(ZH)


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
    T = int(os.environ.get('B_TILE', 300))
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
        out.append(F.quantize(colors=160, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE))
    path = OUT + 'stage2.gif'
    out[0].save(path, save_all=True, append_images=out[1:], duration=100, loop=0, optimize=True, disposal=1)
    print('stage2.gif', n, 'frames', os.path.getsize(path))


def walk():
    seqs = []
    for c, title in (('walk', '行走 walk · 1.05 m/s'), ('pushCart', '推行李车 pushCart · 0.7 m/s')):
        fr, m = frames_of('walk-' + c)
        seqs.append([label(f, title + '（地面格子不动 = 脚不打滑）', 15) for f in fr])
    n = max(len(s) for s in seqs)
    w, h = seqs[0][0].size
    out = []
    for k in range(n):
        F = Image.new('RGB', (w * 2 + 3, h), (10, 9, 8))
        for i, s in enumerate(seqs):
            F.paste(s[k % len(s)], (i * (w + 3), 0))
        out.append(F.quantize(colors=160, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE))
    path = OUT + 'stage2-walk.gif'
    out[0].save(path, save_all=True, append_images=out[1:], duration=50, loop=0, optimize=True, disposal=1)
    print('stage2-walk.gif', n, 'frames', os.path.getsize(path))


def sheet():
    clips = sys.argv[2].split(',') if len(sys.argv) > 2 and sys.argv[2] else ALL
    TW, TH, LW = 210, 236, 150
    rows = []
    for c in clips:
        fr, m = frames_of('anim-' + c, crop=(0.0, 0.065, 1.0, 1.0))
        R = Image.new('RGB', (LW + len(fr) * (TW + 2), TH), (16, 14, 12))
        d = ImageDraw.Draw(R)
        d.text((10, TH // 2 - 30), ZH[c], font=font(22), fill=(245, 236, 200))
        d.text((10, TH // 2 + 2), c, font=font(16), fill=(200, 190, 160))
        d.text((10, TH // 2 + 26), f"{m['dur']:g} s", font=font(14), fill=(170, 160, 130))
        for i, f in enumerate(fr):
            R.paste(f.resize((TW, TH), Image.LANCZOS), (LW + i * (TW + 2), 0))
        rows.append(R)
    W = max(r.width for r in rows)
    S = Image.new('RGB', (W, len(rows) * (TH + 3) + 50), (8, 7, 6))
    ImageDraw.Draw(S).text((12, 10), '行李员 Entity 135 · 阶段 2 动画 · 各片段关键帧（8 帧均分；循环片段不含终帧）', font=font(24), fill=(245, 236, 200))
    for i, r in enumerate(rows):
        S.paste(r, (0, 50 + i * (TH + 3)))
    name = os.environ.get('B_SHEET', 'stage2-sheet.jpg')
    S.save(OUT + name, quality=84)
    print(name, S.size, os.path.getsize(OUT + name))



def teasip():
    """[teaSip 手臂修正 10-31] 四角度（正 / 右侧 / 右斜前 / 背）同步 GIF + 逐帧网格：
    输入 verify-bellhop.mjs 的 B_RAW 自定义视图 gf / gs / gq / gb（gif=1、fps=10、tile=300），输出 teasip-fix.gif / teasip-fix.jpg"""
    names = [('gf', '正面'), ('gs', '右侧'), ('gq', '右斜前'), ('gb', '背面')]
    seqs = []
    for n, zh in names:
        fr, m = frames_of(n)
        seqs.append((zh, fr))
    T = 300
    out = []
    n = max(len(f) for _, f in seqs)
    for k in range(n):
        F = Image.new('RGB', (2 * T + 2, 2 * T + 2 + 30), (10, 9, 8))
        d = ImageDraw.Draw(F)
        d.text((8, 4), f'行李员 · 饮茶 teaSip（手臂修正）  {k / 10:.1f}s', font=font(17), fill=(245, 236, 200))
        for i, (zh, fr) in enumerate(seqs):
            c, r = i % 2, i // 2
            F.paste(label(fr[k % len(fr)].copy(), zh, 14), (c * (T + 2), 30 + r * (T + 2)))
        out.append(F.quantize(colors=200, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE))
    out[0].save(OUT + 'teasip-fix.gif', save_all=True, append_images=out[1:], duration=100, loop=0, optimize=True, disposal=1)
    print('teasip-fix.gif', n, os.path.getsize(OUT + 'teasip-fix.gif'))
    idx = list(range(0, n, 5))
    TW = 210
    G = Image.new('RGB', (len(idx) * (TW + 2), len(seqs) * (TW + 2) + 34), (10, 9, 8))
    d = ImageDraw.Draw(G)
    d.text((8, 6), '行李员 · 饮茶 teaSip 手臂修正 · 逐帧（每 0.5 s）· 行：正面 / 右侧 / 右斜前 / 背面', font=font(19), fill=(245, 236, 200))
    for r, (zh, fr) in enumerate(seqs):
        for c, k in enumerate(idx):
            f = fr[k].resize((TW, TW), Image.LANCZOS)
            label(f, f'{zh} {k / 10:.1f}s', 12)
            G.paste(f, (c * (TW + 2), 34 + r * (TW + 2)))
    G.save(OUT + 'teasip-fix.jpg', quality=88)
    print('teasip-fix.jpg', G.size)

if __name__ == '__main__':
    {'gif': gif, 'walk': walk, 'sheet': sheet, 'teasip': teasip}[sys.argv[1]]()
