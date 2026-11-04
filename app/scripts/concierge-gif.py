#!/usr/bin/env python3
# [concierge stage 2] 看门人（Entity 131）阶段 2：GIF / 汇总图合成（PIL）。输入是 scripts/verify-concierge.mjs 截出的 reports/concierge/*.png
#   python3 scripts/concierge-gif.py gif   [clip,…]  → reports/concierge/stage2.gif       （gif-<clip>.png 逐格切帧，多片段拼图同步播放，每格标片段名，~8 MB 内）
#   python3 scripts/concierge-gif.py walk             → reports/concierge/stage2-walk.gif  （walk-walk / walk-run：根位移前进的侧面，地面网格看脚锁定）
#   python3 scripts/concierge-gif.py sheet            → reports/concierge/stage2-sheet.jpg （anim-<clip>.png 8 帧网格 → 每片段一行关键帧）
#   python3 scripts/concierge-gif.py fix              → reports/concierge/stage2-fix.gif + stage2-fix-sheet.jpg（2.1：old-*.png 修正前 vs 新截图 修正后）
import os, sys, json
from PIL import Image, ImageDraw, ImageFont

OUT = 'reports/concierge/'
FONT = '/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc'
ZH = {'idle': '前台待机', 'phone': '接电话', 'giveKey': '取钥匙递出', 'walk': '行走', 'run': '奔跑', 'armWatch': '抬前臂「看」', 'blinkTeleport': '眨眼瞬移',
      'talk': '搭话', 'trip': '摔倒爬起', 'bind': '蹲下捆人', 'drag': '拖人倒退', 'stuffLift': '塞进升降梯', 'pullRope': '拉升降梯绳', 'wipeHands': '擦手',
      'teaBreak': '茶歇', 'gnawMetal': '啃金属'}
ALL = list(ZH)


def font(sz):
    for f in (FONT, os.path.expanduser('~/.fonts/NotoSansSC-Bold.otf'), '/workspace/work/fonts/NotoSansSC-Bold.otf'):
        try:
            return ImageFont.truetype(f, sz)
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


def label(f, text, sz=17, bottom=True):
    d = ImageDraw.Draw(f)
    F = font(sz)
    h = sz + 10
    y0 = f.height - h if bottom else 0
    d.rectangle((0, y0, f.width, y0 + h), fill=(18, 16, 13))
    d.text((7, y0 + 3), text, font=F, fill=(245, 236, 200))
    return f


def gif():
    clips = sys.argv[2].split(',') if len(sys.argv) > 2 and sys.argv[2] else ALL
    T = int(os.environ.get('C_TILE', 216))
    cols = int(os.environ.get('C_COLS', 4))
    rows = (len(clips) + cols - 1) // cols
    seqs = []
    for c in clips:
        fr, m = frames_of('gif-' + c)
        fr = [label(f.resize((T, T), Image.LANCZOS), f'{ZH[c]} {c}', 14) for f in fr]
        seqs.append(fr)
    n = max(len(s) for s in seqs)
    out = []
    for k in range(n):
        F = Image.new('RGB', (cols * T + (cols - 1) * 2, rows * T + (rows - 1) * 2), (10, 9, 8))
        for i, s in enumerate(seqs):
            c, r = i % cols, i // cols
            F.paste(s[k % len(s)], (c * (T + 2), r * (T + 2)))
        out.append(F.quantize(colors=200, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE))
    path = OUT + 'stage2.gif'
    out[0].save(path, save_all=True, append_images=out[1:], duration=100, loop=0, optimize=True, disposal=1)
    print('stage2.gif', n, 'frames', os.path.getsize(path))


def walk():
    seqs = []
    for c, title in (('walk', '行走 walk · 1.35 m/s'), ('run', '奔跑 run · 4.33 m/s')):
        fr, m = frames_of('walk-' + c)
        seqs.append([label(f, title + '（地面网格不动 = 蹄不打滑）', 16) for f in fr])
    n = max(len(s) for s in seqs)
    out = []
    w, h = seqs[0][0].size
    for k in range(n):
        F = Image.new('RGB', (w * 2 + 3, h), (10, 9, 8))
        for i, s in enumerate(seqs):
            F.paste(s[k % len(s)], (i * (w + 3), 0))
        out.append(F.quantize(colors=200, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE))
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
        dur = m['dur']
        d.text((10, TH // 2 + 26), f'{dur:g} s', font=font(14), fill=(170, 160, 130))
        for i, f in enumerate(fr):
            R.paste(f.resize((TW, TH), Image.LANCZOS), (LW + i * (TW + 2), 0))
        rows.append(R)
    W = max(r.width for r in rows)
    S = Image.new('RGB', (W, len(rows) * (TH + 3) + 50), (8, 7, 6))
    ImageDraw.Draw(S).text((12, 10), '看门人 Entity 131 · 阶段 2 动画 · 各片段关键帧（8 帧均分；循环片段不含终帧）', font=font(24), fill=(245, 236, 200))
    for i, r in enumerate(rows):
        S.paste(r, (0, 50 + i * (TH + 3)))
    S.save(OUT + 'stage2-sheet.jpg', quality=84)
    print('stage2-sheet.jpg', S.size, os.path.getsize(OUT + 'stage2-sheet.jpg'))


def fix():
    # 2.1 对比：每行一个片段，左「修正前」右「修正后」；输出 20 fps（10 fps 的片段每帧停两拍）
    W = int(os.environ.get('C_W', 270))
    rows = [('gif-phone', 2, '接电话 phone（螺旋电话线）'), ('walk-walk', 1, '行走 walk（腿伸直、身体挺拔）'), ('walk-run', 1, '奔跑 run（髋只压 5 cm）'), ('gif-teaBreak', 2, '茶歇 teaBreak（肘下垂贴体侧）')]
    seqs = []
    for name, rep, title in rows:
        pair = []
        for pre, tag in (('old-', '修正前'), ('', '修正后')):
            fr, m = frames_of(pre + name)
            out = []
            for f in fr:
                g = f.resize((W, int(f.height * W / f.width)), Image.LANCZOS)
                label(g, f'{tag} · {title}', 13)
                out += [g] * rep
            pair.append(out)
        seqs.append(pair)
    hs = [p[0][0].height for p in seqs]
    H = sum(hs) + 3 * (len(hs) - 1)
    n = max(max(len(p[0]), len(p[1])) for p in seqs)
    frames = []
    for k in range(n):
        F = Image.new('RGB', (2 * W + 3, H), (10, 9, 8))
        y = 0
        for (a, b), h in zip(seqs, hs):
            F.paste(a[k % len(a)], (0, y)); F.paste(b[k % len(b)], (W + 3, y)); y += h + 3
        frames.append(F.quantize(colors=128, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE))
    path = OUT + 'stage2-fix.gif'
    frames[0].save(path, save_all=True, append_images=frames[1:], duration=50, loop=0, optimize=True, disposal=1)
    print('stage2-fix.gif', n, 'frames', os.path.getsize(path))
    # 关键帧对比表
    TW, TH, LW = 200, 225, 170
    srows = []
    for c, both in (('phone', 1), ('walk', 1), ('run', 1), ('teaBreak', 1), ('trip', 1), ('drag', 1), ('bind', 1)):
        for pre, tag in ((('old-', '修正前'), ('', '修正后')) if both else (('', '修正后'),)):
            fr, m = frames_of(pre + 'anim-' + c, crop=(0.0, 0.065, 1.0, 1.0))
            R = Image.new('RGB', (LW + len(fr) * (TW + 2), TH), (16, 14, 12) if pre else (22, 19, 14))
            d = ImageDraw.Draw(R)
            d.text((10, TH // 2 - 30), ZH[c], font=font(22), fill=(245, 236, 200))
            d.text((10, TH // 2 + 2), c, font=font(16), fill=(200, 190, 160))
            d.text((10, TH // 2 + 26), tag, font=font(16), fill=(150, 150, 150) if pre else (240, 190, 90))
            for i, f in enumerate(fr):
                R.paste(f.resize((TW, TH), Image.LANCZOS), (LW + i * (TW + 2), 0))
            srows.append(R)
    Wd = max(r.width for r in srows)
    S = Image.new('RGB', (Wd, len(srows) * (TH + 3) + 50), (8, 7, 6))
    ImageDraw.Draw(S).text((12, 10), '看门人 Entity 131 · 阶段 2.1 动画修正 · 修正前 / 修正后（电话线、走跑腿形、茶歇肘、trip 入地、膝窝鼓包）', font=font(22), fill=(245, 236, 200))
    for i, r in enumerate(srows):
        S.paste(r, (0, 50 + i * (TH + 3)))
    S.save(OUT + 'stage2-fix-sheet.jpg', quality=82)
    print('stage2-fix-sheet.jpg', S.size, os.path.getsize(OUT + 'stage2-fix-sheet.jpg'))


if __name__ == '__main__':
    {'gif': gif, 'walk': walk, 'sheet': sheet, 'fix': fix}[sys.argv[1]]()
