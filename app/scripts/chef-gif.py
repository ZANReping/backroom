#!/usr/bin/env python3
# [chef stage 2] 厨师（Entity 800）阶段 2：GIF / 汇总图合成（PIL）。输入是 scripts/verify-chef-anim.mjs 截出的 reports/chef/*.png
#   python3 scripts/chef-gif.py gif    → reports/chef/stage2.gif        （gif-<clip>.png 逐格切帧，所有片段依次播放，每帧顶部标中文片段名 + 时间；480×552、10 fps、≤ 12 MB）
#   python3 scripts/chef-gif.py sheet  → reports/chef/stage2-sheet.jpg （sheet-<clip>.png 每片段 4 个关键帧，中文标注；一行两个片段）
#   字体 /workspace/work/fonts/NotoSansSC-Bold.otf
import os, sys, json
from PIL import Image, ImageDraw, ImageFont

OUT = 'reports/chef/'
ZH = {'idle': '灶前搅锅', 'waddle': '蹒跚走（肚子晃）', 'humWalk': '哼小调慢走', 'serve': '端盘上菜', 'earTwitch': '听见铃声·耳朵抽搐转头',
      'tapTable': '胖手指敲桌三下', 'potSwing': '闪电抡锅砸人', 'grabDrag': '抓后领拖人', 'sniffCrouch': '蹲下嗅闻', 'takeKnife': '取雕刻刀·舔刀',
      'barricade': '打烊：绳绑门把·闩门', 'stuffedStagger': '吃撑了·踉跄', 'stoveLean': '扶灶喘气', 'vomitPot': '背身对锅吐（远景）',
      'flashFreeze': '被闪光灯照到·僵住', 'standFromChair': '从椅子上吃力起身', 'holdCabbage': '捧紫甘蓝（附图）'}
ALL = list(ZH)
NOTE = {
    'idle': ['低头看锅·锤握汤勺', '画圈搅', '凑近闻', '耳朵抽一下'],
    'waddle': ['左脚着地·髋摆左', '单脚撑·肚子颠', '右脚着地·髋摆右', '单脚撑'],
    'humWalk': ['手搭肚子·拍拍子', '头随调子晃', '下巴一张一合', '耳朵松垂'],
    'serve': ['双手捧盘', '前倾屈膝放盘', '松手收回', '一摊手「请用」'],
    'earTwitch': ['铃声', '耳朵猛抽', '猛转头·耳朵前竖', '慢慢转回'],
    'tapTable': ['前倾·手悬桌上', '食指抬起', '敲下', '收手'],
    'potSwing': ['提锅垂在身侧', '慢慢抬到肩后（蓄力）', '闪电一抡（0.12 s）', '收势·喘'],
    'grabDrag': ['右手攥后领', '前倾使劲拖', '一步一拽', '被拖者腿在地上拖'],
    'sniffCrouch': ['脚往外迈开', '肥胖地蹲下·手按膝', '低头左右嗅', '撑腿起身'],
    'takeKnife': ['伸手取刀', '翻腕·刀尖朝上', '张嘴伸舌舔刀', '顺着刀身往上舔'],
    'barricade': ['绕门把缠绳', '两手勒紧', '打结', '推门闩'],
    'stuffedStagger': ['捂肚子·外伸手找平衡', '一步急', '打嗝', '一步拖'],
    'stoveLean': ['撑灶·低头', '喘粗气', '抬头看锅', '再低下'],
    'vomitPot': ['撑灶探到锅上', '干呕·收肚子', '浆液吐进锅', '耷拉着喘'],
    'flashFreeze': ['正常站着', '闪光·往后一缩', '僵住·头细颤', '慢慢转头盯住'],
    'standFromChair': ['坐着·手按大腿', '往前晃·没起来', '撑腿抬起身', '站稳·扶肚子'],
    'holdCabbage': ['托着甘蓝·低头', '耳朵抖', '凑近猪鼻闻', '放回'],
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


# GIF 体积：走路类循环片段在 GIF 里只放这么多帧（截图时多截了几圈）
KEEP = {'gif-waddle': 28, 'gif-humWalk': 20, 'gif-grabDrag': 22, 'gif-stuffedStagger': 26}


def frames_of(name):
    m = dict(info(name))
    if name in KEEP and os.environ.get('S_FULL') != '1':
        m['frames'] = min(m['frames'], KEEP[name])
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
    """17 段依次播放。体积控制：全片共用一张 255 色调色板（各段抽样帧拼图做中值切分），
    每帧与上一帧（已合成画面）相同的像素写成透明色 255（GIF disposal=1 保留上一帧）→ 静止背景几乎不占字节；目标 ≤ 12 MB（[修订] 默认 136 色：阶段 2 修订后 200 色 13.3 MB）"""
    from PIL import ImageChops
    clips = sys.argv[2].split(',') if len(sys.argv) > 2 and sys.argv[2] else ALL
    TR = int(os.environ.get("S_COLORS", "136"))  # 调色板色数（透明色 = 该索引）
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
    ImageDraw.Draw(S).text((12, 10), f'厨师 Entity 800 · 阶段 2 动画 · {len(clips)} 段各 4 个关键帧', font=F3, fill=(245, 236, 200))
    for i, b in enumerate(blocks):
        S.paste(b, ((i % PER) * (bw + 10), 54 + (i // PER) * (bh + 8)))
    name = os.environ.get('S_SHEET', 'stage2-sheet.jpg')
    S.save(OUT + name, quality=85)
    print(name, S.size, os.path.getsize(OUT + name))


if __name__ == '__main__':
    {'gif': gif, 'sheet': sheet}[sys.argv[1]]()
