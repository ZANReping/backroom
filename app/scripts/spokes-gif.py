#!/usr/bin/env python3
# [spokes stage 2] 迎宾女郎（Entity 28）阶段 2：GIF / 汇总图合成（PIL）。输入是 scripts/verify-spokes-anim.mjs 截出的 reports/spokes/*.png
#   python3 scripts/spokes-gif.py gif    → reports/spokes/stage2.gif        （gif-<clip>.png 逐格切帧，所有片段依次播放，每帧顶部标中文片段名 + 时间）
#   python3 scripts/spokes-gif.py sheet  → reports/spokes/stage2-sheet.jpg （sheet-<clip>.png 每片段 4 个关键帧，中文标注；一行两个片段）
import os, sys, json
from PIL import Image, ImageDraw, ImageFont

OUT = 'reports/spokes/'
ZH = {'idle': '双臂交叉站立', 'greetSpin': '迎宾：脚尖旋转 + 轻跃', 'bowInvite': '鞠躬并伸手邀请', 'speakerTalk': '按领口音箱说话', 'innerFreeze': '心声爆发·僵住',
      'drawPoster': '站在桌前画海报', 'dropPoster': '海报丢进地洞', 'windRabbit': '蹲下上发条、放兔子', 'walk': '行走（铅笔裙小步）', 'guidePoint': '引路：回头 + 指路',
      'sitDesk': '走到桌后坐下', 'seatedIdle': '坐在桌后', 'shoulderTap': '被老板拍肩·僵硬强笑', 'photoRecall': '看照片·认出自己',
      'rabbitHop': '发条兔·跳行', 'rabbitStop': '发条兔·停下回头'}
ALL = list(ZH)
NOTE = {
    'idle': ['呼吸', '左耳转向侧方', '转头打量', '右耳抖一下'],
    'greetSpin': ['芭蕾一位手·屈膝', '右脚掌旋转·左脚收踝前', '轻轻一跃', '落地·双臂打开「欢迎」'],
    'bowInvite': ['双手交叠', '深鞠躬', '伸手「请这边走」', '回看客人'],
    'speakerTalk': ['双臂交叉', '食指按住领口音箱', '点头·耳朵随语调', '侧点·嘴不动'],
    'innerFreeze': ['笑意', '僵住·耳贴后背', '头微颤·不眨眼', '恢复笑意'],
    'drawPoster': ['俯身写字', '笔尖走字', '换行', '抬头看一眼'],
    'dropPoster': ['夹着海报叠', '走近投递洞', '平推进洞口', '松手·拍拍手'],
    'windRabbit': ['下蹲·双手按膝', '按住兔背·捏钥匙', '拧发条', '放手·双手低位'],
    'walk': ['左脚着地', '单脚支撑·髋摆', '右脚着地', '单脚支撑'],
    'guidePoint': ['越过左肩回头·右手指路', '转回看前方', '再回头看客人', '回头·小步前进'],
    'sitDesk': ['走向椅子', '转身·两脚各迈一步', '扶桌坐下', '坐好·前倾·手放桌上'],
    'seatedIdle': ['坐姿呼吸', '侧头', '指尖点桌', '耳朵抖'],
    'shoulderTap': ['被拍肩前', '耸肩缩颈·耳贴后', '强笑·歪头', '点头'],
    'photoRecall': ['低头看照片·耳半垂', '耳朵立起·头歪·手抖', '一瞬「认出」', '后退半步·手捂胸口'],
    'rabbitHop': ['蹬腿', '腾空', '前脚着地', '收后腿'],
    'rabbitStop': ['最后一跳', '回头', '耳朵一抖', '转回'],
}


def font(sz):
    for f in ('/workspace/work/fonts/NotoSansSC-Bold.otf', os.path.expanduser('~/.fonts/NotoSansSC-Bold.otf'), '/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc'):
        try:
            return ImageFont.truetype(f, sz)
        except Exception:
            pass
    return ImageFont.load_default()


def info(name):
    return json.load(open(OUT + 'anim-result.json'))[name]['info']


def frames_of(name):
    m = info(name)
    im = Image.open(OUT + name + '.png').convert('RGB')
    cols, n, tw, th = m['cols'], m['frames'], m['tw'], m['th']
    return [im.crop(((i % cols) * tw, (i // cols) * th, (i % cols + 1) * tw, (i // cols + 1) * th)) for i in range(n)], m


def label(f, c, i, fps):
    """每帧顶部标中文片段名 + 片段内时间（480 宽用 24 / 17 号字）"""
    W = f.width
    k = W / 480
    F1, F2 = font(round(24 * k)), font(round(17 * k))
    d = ImageDraw.Draw(f)
    hb = round(36 * k)
    d.rectangle((0, 0, W, hb), fill=(16, 14, 12))
    d.text((round(9 * k), round(4 * k)), ZH[c], font=F1, fill=(245, 236, 200))
    tt = f'{c}  {i / fps:.1f}s'
    d.text((W - round(9 * k) - d.textlength(tt, font=F2), round(10 * k)), tt, font=F2, fill=(200, 190, 160))
    return f


def gif():
    """16 段依次播放。体积控制：全片共用一张 255 色调色板（各段抽样帧拼图做中值切分），
    每帧与上一帧（已合成画面）相同的像素写成透明色 255（GIF disposal=1 保留上一帧）→ 静止背景几乎不占字节；目标 ≤ 12 MB"""
    from PIL import ImageChops
    clips = sys.argv[2].split(',') if len(sys.argv) > 2 and sys.argv[2] else ALL
    TR = int(os.environ.get("S_COLORS", "200"))  # 调色板色数（透明色 = 该索引）
    # 1) 调色板：每段均匀抽 4 帧（带标签）拼图
    samples = []
    for c in clips:
        fr, m = frames_of('gif-' + c)
        for i in range(0, len(fr), max(1, len(fr) // 4)):
            samples.append(label(fr[i].copy(), c, i, m['fps']))
    tw, th = samples[0].size
    cols = 8
    mont = Image.new('RGB', (cols * tw, ((len(samples) + cols - 1) // cols) * th))
    for j, f in enumerate(samples):
        mont.paste(f, ((j % cols) * tw, (j // cols) * th))
    pal = mont.quantize(colors=TR, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE)
    palette = pal.getpalette()[:TR * 3] + [255, 0, 255] * (256 - TR)
    pal.putpalette(palette)
    # 2) 逐帧量化 + 与上一合成帧比较
    out, durs, prev, full = [], [], None, []
    for c in clips:
        fr, m = frames_of('gif-' + c)
        fps = m['fps']
        for i, f in enumerate(fr):
            q = label(f, c, i, fps).quantize(palette=pal, dither=Image.Dither.NONE)
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
        durs[-1] += 400  # 片段之间停一下
    name = os.environ.get('S_GIF', 'stage2.gif')
    out[0].save(OUT + name, save_all=True, append_images=out[1:], duration=durs, loop=0, optimize=False, disposal=1, transparency=TR)
    sz = os.path.getsize(OUT + name)
    # 3) 自检：解码回来抽几帧，与期望画面比较
    g = Image.open(OUT + name)
    errs = []
    for n, ref in full:
        g.seek(n)
        a = g.convert('RGB')
        diff = ImageChops.difference(a, ref).convert('L')
        errs.append(round(sum(diff.histogram()[k] * k for k in range(256)) / (a.width * a.height), 3))
    print(name, len(out), 'frames', f'{out[0].size[0]}x{out[0].size[1]}', sz, 'bytes', f'{sz / 1e6:.2f} MB', 'decode-check mean abs err', errs)


def sheet():
    clips = sys.argv[2].split(',') if len(sys.argv) > 2 and sys.argv[2] else ALL
    TW, TH, PER = 250, 306, 2
    HB = 30
    F1, F2, F3 = font(19), font(13), font(28)
    blocks = []
    for c in clips:
        fr, m = frames_of('sheet-' + c)
        B = Image.new('RGB', (4 * TW + 3 * 2, HB + TH), (8, 7, 6))
        d = ImageDraw.Draw(B)
        d.rectangle((0, 0, B.width, HB - 2), fill=(34, 28, 22))
        d.text((8, 3), f'{ZH[c]}  {c}', font=F1, fill=(245, 236, 200))
        for i, f in enumerate(fr[:4]):
            f = f.resize((TW, TH), Image.LANCZOS)
            g = ImageDraw.Draw(f)
            g.rectangle((0, TH - 22, TW, TH), fill=(18, 16, 13))
            g.text((6, TH - 20), f"{m['times'][i]:.2f}s · {NOTE[c][i]}", font=F2, fill=(245, 236, 200))
            B.paste(f, (i * (TW + 2), HB))
        blocks.append(B)
    rows = (len(blocks) + PER - 1) // PER
    bw, bh = blocks[0].size
    S = Image.new('RGB', (PER * bw + (PER - 1) * 10, 54 + rows * (bh + 8)), (8, 7, 6))
    ImageDraw.Draw(S).text((12, 10), f'迎宾女郎 Entity 28 · 阶段 2 动画 · {len(clips)} 段（含发条兔 2 段）各 4 个关键帧', font=F3, fill=(245, 236, 200))
    for i, b in enumerate(blocks):
        S.paste(b, ((i % PER) * (bw + 10), 54 + (i // PER) * (bh + 8)))
    name = os.environ.get('S_SHEET', 'stage2-sheet.jpg')
    S.save(OUT + name, quality=85)
    print(name, S.size, os.path.getsize(OUT + name))


if __name__ == '__main__':
    {'gif': gif, 'sheet': sheet}[sys.argv[1]]()
