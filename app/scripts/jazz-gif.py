#!/usr/bin/env python3
# [jazz stage 2] 爵士脑（Entity 197）阶段 2：GIF / 汇总图合成（PIL）。输入是 scripts/verify-jazz-anim.mjs 截出的 reports/jazz/*.png（参照 chef-gif.py）
#   python3 scripts/jazz-gif.py gif    → reports/jazz/stage2.gif        （gif-<clip>@<who>.png 逐格切帧，四人轮流依次播放，每帧顶部标中文片段名 + 人 + 时间；480×552、10 fps、≤ 12 MB）
#   python3 scripts/jazz-gif.py sheet  → reports/jazz/stage2-sheet.jpg （sheet-<clip>@<who>.png 每片段 4 个关键帧，中文标注；一行两个片段）
#   字体 /workspace/work/fonts/NotoSansSC-Bold.otf
import os, sys, json
from PIL import Image, ImageDraw, ImageFont

OUT = 'reports/jazz/'
WHO = {'leader': '头儿·小号', 'sax': '萨克斯', 'bass': '低音提琴', 'drum': '鼓/钢琴'}
ZH = {'trumpetPlay': '小号演奏（按头顶活塞）', 'trumpetSolo': '小号独奏（后仰高音）', 'saxPlay': '萨克斯演奏（头前倾按键）', 'saxSolo': '萨克斯独奏（后仰→蹲身高潮）',
      'bassPlay': '低音提琴（按弦·拨弦）', 'drumPlay': '鼓自奏（响指·点头）', 'pianoPlay': '鼓手弹立式钢琴', 'bow': '谢幕鞠躬', 'tuneUp': '调音',
      'fakeSoulSuck': '假吸魂（举臂向观众）', 'idleSway': '台下待着·随拍摇', 'walk': '走路（头重）', 'drinkBeer': '喝啤酒（倒进领口）',
      'holdHead': '双手扶琴身·活动脖子', 'talkGesture': '聊天比划', 'leanFamiliar': '凑近：「你看着面熟」', 'pointDirection': '指方向',
      'glanceCamera': '瞄监控·心虚', 'argueReconcile': '吵架·被头儿按肩劝和',
      'packUp': '告发后：瞪你·摇头·收谱离场', 'trueSoulSuck': '回来后：真吸魂（僵直·往回抽）'}  # [修 E197 阶段 3]
# 四人轮流：每段配一个人（通用片段轮着来）
ITEMS = ['trumpetPlay@leader', 'saxPlay@sax', 'bassPlay@bass', 'drumPlay@drum', 'pianoPlay@drum', 'trumpetSolo@leader', 'saxSolo@sax', 'tuneUp@bass',
         'fakeSoulSuck@leader', 'bow@sax', 'idleSway@drum', 'walk@bass', 'drinkBeer@leader', 'holdHead@bass', 'talkGesture@sax', 'leanFamiliar@drum',
         'pointDirection@leader', 'glanceCamera@sax', 'argueReconcile@leader']
NOTE = {
    'trumpetPlay': ['右手三指压活塞', '左手托套管·随拍弹膝', '换指法（活塞弹起）', '点头'],
    'trumpetSolo': ['前探吹', '后仰·喇叭朝天·左手打开', '顶住长音（颤）', '收势'],
    'saxPlay': ['头前倾·按键落到胸前', '左手下组 / 右手上组', '随乐句转身', '八度键'],
    'saxSolo': ['演奏', '后仰', '蹲身高潮', '起身'],
    'bassPlay': ['左手按指板', '右手拨弦·弦振动', '换把', '头歪向琴颈'],
    'drumPlay': ['左手响指（1、3 拍）', '右手响指（2、4 拍）', '镲自颤·鼓皮震', '点头摇摆'],
    'pianoPlay': ['坐琴凳', '右手旋律', '左手二四拍和弦', '镲随拍轻颤'],
    'bow': ['站直', '右手横腰·左臂打开', '深鞠躬（头重点头）', '起身'],
    'tuneUp': ['拨空弦', '侧耳听', '下一根', '点头'],
    'fakeSoulSuck': ['举臂伸向观众', '五指张开（魂雾升起）', '抓回·后仰「吸」', '偷瞄一眼'],
    'idleSway': ['重心换脚', '指尖打拍', '东张西望', '随拍点头'],
    'walk': ['左脚着地', '单脚撑', '右脚着地', '头重·晃得慢'],
    'drinkBeer': ['伸手握杯把', '举到领口前', '倒进前襟（没嘴）', '放回吧台'],
    'holdHead': ['双手扶住琴身', '歪向一侧', '回正点头', '歪向另一侧'],
    'talkGesture': ['摊手', '比划', '点头', '转身'],
    'leanFamiliar': ['凑近', '歪头打量', '食指点点', '退回'],
    'pointDirection': ['转身', '伸臂指', '另一手摊开', '收回'],
    'glanceCamera': ['抬头盯探头', '僵住', '猛转回', '立正装没事'],
    'argueReconcile': ['两人对戳', '头儿上前', '按住两人', '两人低头'],
}


def font(sz):
    for f in ('/workspace/work/fonts/NotoSansSC-Bold.otf', os.path.expanduser('~/.fonts/NotoSansSC-Bold.otf')):
        try:
            return ImageFont.truetype(f, sz)
        except Exception:
            pass
    return ImageFont.load_default()


def info(name):
    return json.load(open(OUT + 'anim-result.json'))[name]['info']


def frames_of(name):
    """name = gif-<clip>@<who>；长片段可能分 _p0 / _p1 两张截图"""
    parts = [name] if os.path.exists(OUT + name + '.png') else [name + '_p0', name + '_p1']
    out, m0 = [], None
    for p in parts:
        if not os.path.exists(OUT + p + '.png'):
            continue
        m = info(p)
        m0 = m0 or m
        im = Image.open(OUT + p + '.png').convert('RGB')
        cols, n, tw, th = m['cols'], m['frames'], m['tw'], m['th']
        out += [im.crop(((i % cols) * tw, (i // cols) * th, (i % cols + 1) * tw, (i // cols + 1) * th)) for i in range(n)]
    return out, m0


def label(f, c, who, i, fps):
    W = f.width
    k = W / 480
    F1, F2 = font(round(22 * k)), font(round(16 * k))
    d = ImageDraw.Draw(f)
    hb = round(36 * k)
    d.rectangle((0, 0, W, hb), fill=(16, 12, 10))
    d.text((round(9 * k), round(5 * k)), ZH[c], font=F1, fill=(245, 236, 200))
    tt = f'{WHO[who]}  {i / fps:.1f}s'
    d.text((W - round(9 * k) - d.textlength(tt, font=F2), round(10 * k)), tt, font=F2, fill=(224, 178, 60))
    return f


def gif():
    from PIL import ImageChops
    items = sys.argv[2].split(',') if len(sys.argv) > 2 and sys.argv[2] else ITEMS
    TR = int(os.environ.get('S_COLORS', '136'))
    samples = []
    for it in items:
        c, who = it.split('@')
        fr, m = frames_of('gif-' + it)
        for i in range(0, len(fr), max(1, len(fr) // 4)):
            samples.append(label(fr[i].copy(), c, who, i, m['fps']))
    tw, th = samples[0].size
    cols = 8
    mont = Image.new('RGB', (cols * tw, ((len(samples) + cols - 1) // cols) * th))
    for j, f in enumerate(samples):
        mont.paste(f, ((j % cols) * tw, (j // cols) * th))
    pal = mont.quantize(colors=TR, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE)
    palette = pal.getpalette()[:TR * 3] + [255, 0, 255] * (256 - TR)
    pal.putpalette(palette)
    out, durs, prev, full = [], [], None, []
    for it in items:
        c, who = it.split('@')
        fr, m = frames_of('gif-' + it)
        fps = m['fps']
        for i, f in enumerate(fr):
            q = label(f, c, who, i, fps).quantize(palette=pal, dither=Image.Dither.NONE)
            idx = Image.frombytes('L', q.size, q.tobytes())
            if prev is None:
                enc = idx
            else:
                same = ImageChops.difference(idx, prev).point(lambda x: 255 if x == 0 else 0)
                enc = idx.copy()
                enc.paste(TR, mask=same)
            prev = idx
            e = Image.frombytes('P', q.size, enc.tobytes())
            e.putpalette(palette)
            out.append(e)
            durs.append(int(round(1000 / fps)))
            if len(full) < 3 or len(out) % 97 == 0:
                full.append((len(out) - 1, q.convert('RGB')))
        durs[-1] += 400
    name = os.environ.get('S_GIF', 'stage2.gif')
    out[0].save(OUT + name, save_all=True, append_images=out[1:], duration=durs, loop=0, optimize=False, disposal=1, transparency=TR)
    sz = os.path.getsize(OUT + name)
    g = Image.open(OUT + name)
    errs = []
    for n, ref in full:
        g.seek(n)
        a = g.convert('RGB')
        diff = ImageChops.difference(a, ref).convert('L')
        errs.append(round(sum(diff.histogram()[k] * k for k in range(256)) / (a.width * a.height), 3))
    print(name, len(out), 'frames', f'{out[0].size[0]}x{out[0].size[1]}', sz, 'bytes', f'{sz / 1e6:.2f} MB', 'decode-check mean abs err', errs)


def sheet():
    items = sys.argv[2].split(',') if len(sys.argv) > 2 and sys.argv[2] else ITEMS
    TW, TH, PER = 250, 306, 2
    HB = 30
    F1, F2, F3 = font(18), font(13), font(28)
    blocks = []
    for it in items:
        c, who = it.split('@')
        nm = 'sheet-' + it
        if not os.path.exists(OUT + nm + '.png'):
            print('missing', nm); continue
        m = info(nm)
        im = Image.open(OUT + nm + '.png').convert('RGB')
        fr = [im.crop((i * m['tw'], 0, (i + 1) * m['tw'], m['th'])) for i in range(4)]
        B = Image.new('RGB', (4 * TW + 3 * 2, HB + TH), (8, 7, 6))
        d = ImageDraw.Draw(B)
        d.rectangle((0, 0, B.width, HB - 2), fill=(34, 26, 20))
        d.text((8, 4), f'{ZH[c]}  · {WHO[who]}  ({c})', font=F1, fill=(245, 236, 200))
        for i, f in enumerate(fr[:4]):
            f = f.resize((TW, TH), Image.LANCZOS)
            g = ImageDraw.Draw(f)
            g.rectangle((0, TH - 22, TW, TH), fill=(18, 14, 11))
            g.text((6, TH - 20), f"{m['times'][i]:.2f}s · {NOTE[c][i]}", font=F2, fill=(245, 236, 200))
            B.paste(f, (i * (TW + 2), HB))
        blocks.append(B)
    rows = (len(blocks) + PER - 1) // PER
    bw, bh = blocks[0].size
    S = Image.new('RGB', (PER * bw + (PER - 1) * 10, 54 + rows * (bh + 8)), (8, 7, 6))
    ImageDraw.Draw(S).text((12, 10), f'爵士脑 Entity 197 · 阶段 2 动画 · {len(blocks)} 段各 4 个关键帧（四人轮流）', font=F3, fill=(245, 236, 200))
    for i, b in enumerate(blocks):
        S.paste(b, ((i % PER) * (bw + 10), 54 + (i // PER) * (bh + 8)))
    name = os.environ.get('S_SHEET', 'stage2-sheet.jpg')
    S.save(OUT + name, quality=85)
    print(name, S.size, os.path.getsize(OUT + name))


if __name__ == '__main__':
    {'gif': gif, 'sheet': sheet}[sys.argv[1]]()
