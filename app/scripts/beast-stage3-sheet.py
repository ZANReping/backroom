#!/usr/bin/env python3
# [beast stage 3] 机制示意 / 预览图：上半 = 状态机流程（中文标签），下半 = 实机截图（reports/beast/game/<前缀>*.png，verify-beast-game.mjs 输出）
#   python3 scripts/beast-stage3-sheet.py [输出名=stage3.jpg] [截图前缀=B_SHEET 环境变量]
import os, sys
from PIL import Image, ImageDraw, ImageFont

OUT = 'reports/beast/'
PRE = os.environ.get('B_SHEET', '')
SHOTS = [
    ('peri', '① 余光：关注度≥50 / 理智<40 时站在视线 40° 处盯着你', 'L5 实机'),
    ('vanish', '② 一转头正视（±17°）：后退隐入暗处（vanish）', 'L5 实机'),
    ('blackout', '③ 关注度满 100：熄灯', 'L5 实机'),
    ('grab', '④ 他从背后用触腕缠住你（真身 tentacleGrab）', 'L5 实机'),
    ('forced', '⑤ 拖进 117 办公室：强签苛刻契约（二选一）', '117 实机'),
    ('shake', '⑥ 握手即签（握点 = 你手的真实位置）', '117 实机'),
    ('office', '⑦ 办公室：书桌后的他 + 墙上活的画像（portraitGaze）', '117 实机'),
    ('tea', '⑧ X 谈生意：先倒茶推杯（pourTea）', '117 实机'),
    ('deal', '⑨ 三份契约：好处池三项各一份 + 限时任务', '117 实机'),
    ('sign', '⑩ 推契约递笔（signContract）', '117 实机'),
    ('doubt', '⑪ 怀疑 / 动手：僵住「你为何要怀疑我？」', '117 实机'),
    ('reveal', '⑫ 恼怒变色 → 变真身（reveal）', '117 实机'),
]


def font(sz, bold=True):
    for f in ([os.path.expanduser('~/.fonts/NotoSansSC-Bold.otf'), '/workspace/work/fonts/NotoSansSC-Bold.otf'] if bold else []) + [os.path.expanduser('~/.fonts/NotoSansSC-Regular.otf'), '/workspace/work/.fonts/NotoSansSC-Regular.otf', '/workspace/work/fonts/NotoSansSC-Bold.otf']:
        try:
            return ImageFont.truetype(f, sz)
        except Exception:
            pass
    return ImageFont.load_default()


BG = (20, 16, 14)
INK = (240, 230, 205)
DIM = (170, 158, 130)
GOLD = (190, 150, 74)
COL = {'office': (52, 70, 58), 'deal': (70, 58, 34), 'peri': (36, 52, 62), 'pun': (78, 30, 30), 'end': (24, 24, 24)}


def wrap(d, text, f, w):
    lines, cur = [], ''
    for ch in text:
        if ch == '\n':
            lines.append(cur); cur = ''; continue
        if d.textlength(cur + ch, font=f) > w:
            lines.append(cur); cur = ch
        else:
            cur += ch
    if cur:
        lines.append(cur)
    return lines


def box(d, x, y, w, h, title, sub, kind):
    d.rounded_rectangle((x, y, x + w, y + h), 8, fill=COL[kind], outline=GOLD, width=2)
    ft, fs = font(17), font(13, False)
    d.text((x + w / 2, y + 8), title, font=ft, fill=INK, anchor='ma')
    yy = y + 32
    for ln in wrap(d, sub, fs, w - 14):
        d.text((x + w / 2, yy), ln, font=fs, fill=(225, 214, 186), anchor='ma'); yy += 17
    return (x, y, w, h)


def arrow(d, a, b, label='', side='h', color=GOLD):
    ax, ay, aw, ah = a; bx, by, bw, bh = b
    if side == 'h':
        p0 = (ax + aw, ay + ah / 2); p1 = (bx, by + bh / 2)
    elif side == 'v':
        p0 = (ax + aw / 2, ay + ah); p1 = (bx + bw / 2, by)
    else:  # 'u' 向上
        p0 = (ax + aw / 2, ay); p1 = (bx + bw / 2, by + bh)
    d.line([p0, p1], fill=color, width=3)
    import math
    ang = math.atan2(p1[1] - p0[1], p1[0] - p0[0])
    for s in (-1, 1):
        d.line([p1, (p1[0] - 12 * math.cos(ang + s * 0.45), p1[1] - 12 * math.sin(ang + s * 0.45))], fill=color, width=3)
    if label:
        f = font(13, False)
        mx, my = (p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2
        tw = d.textlength(label, font=f)
        d.rectangle((mx - tw / 2 - 4, my - 19, mx + tw / 2 + 4, my - 2), fill=BG)
        d.text((mx, my - 18), label, font=f, fill=(255, 214, 140), anchor='ma')


def flow(W):
    H = 760
    im = Image.new('RGB', (W, H), BG); d = ImageDraw.Draw(im)
    d.text((24, 16), '第五层的野兽 Entity 18 · 阶段 3 机制（beastAI 状态机）', font=font(30), fill=INK)
    d.text((24, 58), '好处池只有三项：关注度清零 / 理智回满且 10 分钟不降 / 一件稀有物品；代价 = 限时任务（情书交给行李员 / 不奔跑 4 分钟 / 翻一幅画像 / 请行李员喝茶）。对话只用字幕。', font=font(15, False), fill=DIM)
    bw, bh, gx = 210, 92, 38
    # 行 1：办公室
    y1 = 110
    d.text((24, y1 - 2), '117 办公室', font=font(16), fill=GOLD)
    xs = [24 + i * (bw + gx) for i in range(7)]
    b1 = [
        box(d, xs[0], y1 + 22, bw, bh, '灯光同时闪烁', '墙上浮出木门 → 117 办公室', 'office'),
        box(d, xs[1], y1 + 22, bw, bh, 'seatedIdle', '他坐在书桌后（不再是空椅）', 'office'),
        box(d, xs[2], y1 + 22, bw, bh, 'beckon → talk', '走近 6.5 m：起身招手、说话（字幕）', 'office'),
        box(d, xs[3], y1 + 22, bw, bh, 'pourTea', '书桌前 X「谈生意」：第一次先倒茶', 'office'),
        box(d, xs[4], y1 + 22, bw, bh, '契约界面', '三份选一 / 婉拒 / 「我凭什么相信你？」', 'deal'),
        box(d, xs[5], y1 + 22, bw, bh, 'signContract', '推契约、递笔', 'deal'),
        box(d, xs[6], y1 + 22, bw, bh, 'handshake', '握点 = 你手的真实位置；1.3 s 握住 = 好处兑现、任务开始计时', 'deal'),
    ]
    for a, b, l in zip(b1, b1[1:], ['推门', '走近', 'X', '倒完茶', '选一份', '递完笔']):
        arrow(d, a, b, l)
    # 分支：婉拒 / 怀疑
    y2 = y1 + 22 + bh + 56
    dec = box(d, xs[3], y2, bw, bh - 10, '婉拒', '关注度 +10，他恼怒闪色（colorFlash 叠加）', 'deal')
    arrow(d, b1[4], dec, '婉拒', 'v')
    dz = [
        box(d, xs[4], y2, bw, bh - 10, 'doubtFreeze', '「你为何要怀疑我？」「哦。」「呃…？」', 'pun'),
        box(d, xs[5], y2, bw, bh - 10, 'colorFlash → reveal', '恼怒变色 → 外套膜裂开露喙、长触腕', 'pun'),
        box(d, xs[6], y2, bw, bh - 10, 'tentacleGrab', '缠住你拖到桌前 → 强签', 'pun'),
    ]
    arrow(d, b1[4], dz[0], '怀疑 / 动手', 'v')
    arrow(d, dz[0], dz[1]); arrow(d, dz[1], dz[2])
    # 行 3：余光
    y3 = y2 + bh + 40
    d.text((24, y3 - 2), 'L5 走廊', font=font(16), fill=GOLD)
    p = [
        box(d, xs[0], y3 + 22, bw, bh, '门槛', '关注度 ≥ 50 或 理智 < 40\n（契约未了：门槛失效、频率 ×1.6）', 'peri'),
        box(d, xs[1], y3 + 22, bw, bh, 'peripheralStill', '视线 35°–70°、6–14 m 处静立盯着你；理智越低越频繁', 'peri'),
        box(d, xs[2], y3 + 22, bw, bh, '被余光看见', '理智 −3、关注度 +3', 'peri'),
        box(d, xs[3], y3 + 22, bw, bh, 'vanish', '一转头正视（±17°）：后退一步、变暗、淡出、移除', 'peri'),
    ]
    arrow(d, p[0], p[1], '45–90 s'); arrow(d, p[1], p[2], '0.25 s'); arrow(d, p[2], p[3], '正视')
    por = box(d, xs[4], y3 + 22, bw, bh, '画像', '关注度 ≥ 25 / 契约未了：肖像换成他的脸，眼睛跟随；盯着看 +1.5/s', 'peri')
    # 行 4：惩罚
    y4 = y3 + 22 + bh + 40
    d.text((24, y4 - 2), '惩罚', font=font(16), fill=GOLD)
    q = [
        box(d, xs[0], y4 + 22, bw, bh, '触发', '关注度满 100 / 违约（任务超时）/ 怀疑 / 动手打他', 'pun'),
        box(d, xs[1], y4 + 22, bw, bh, '熄灯', '灯光压到 4%、手电熄灭、黑幕 1.2 s', 'pun'),
        box(d, xs[2], y4 + 22, bw, bh, 'tentacleGrab', '真身出现在你身后 1.45 m，触腕缠住躯干', 'pun'),
        box(d, xs[3], y4 + 22, bw, bh, '拖进 117', '口袋返程记下原楼层原地图', 'pun'),
        box(d, xs[4], y4 + 22, bw, bh, '强签苛刻契约', '二选一：交出一件物品 / 理智上限 −20（不可关）', 'pun'),
        box(d, xs[5], y4 + 22, bw, bh, '握手', '强签后关注度落到 60；冒犯次数 +1', 'pun'),
        box(d, xs[6], y4 + 22, bw, bh, '第二次再犯', '直接死亡（BE.deathAt = 2）', 'end'),
    ]
    for a, b in zip(q[:5], q[1:6]):
        arrow(d, a, b)
    d.text((xs[6] + bw / 2, y4 + 22 + bh + 6), '（第 1 次走强签，第 2 次走这里）', font=font(12, False), fill=DIM, anchor='ma')
    void = (dz, por)
    return im


def shots(W):
    cols, gap = 4, 10
    tw = (W - 24 * 2 - gap * (cols - 1)) // cols
    th = int(tw * 760 / 1280)
    have = [(k, t, s) for k, t, s in SHOTS if os.path.exists(OUT + 'game/' + PRE + k + '.png')]
    rows = (len(have) + cols - 1) // cols
    H = 50 + rows * (th + 44) + 20
    im = Image.new('RGB', (W, H), BG); d = ImageDraw.Draw(im)
    d.text((24, 12), '实机截图（verify-beast-game.mjs：真实 App、L5 1F 存档、?cpu=1、SwiftShader；片段时刻由 AI 的 modeT 直接拨到）', font=font(17), fill=INK)
    for i, (k, t, s) in enumerate(have):
        r, c = divmod(i, cols)
        x, y = 24 + c * (tw + gap), 50 + r * (th + 44)
        sh = Image.open(OUT + 'game/' + PRE + k + '.png').convert('RGB').resize((tw, th), Image.LANCZOS)
        im.paste(sh, (x, y))
        d.rectangle((x, y + th, x + tw, y + th + 38), fill=(30, 26, 22))
        for j, ln in enumerate(wrap(d, t, font(13, False), tw - 70)[:2]):
            d.text((x + 6, y + th + 3 + j * 17), ln, font=font(13, False), fill=INK)
        d.text((x + tw - 6, y + th + 4), s, font=font(11, False), fill=DIM, anchor='ra')
    return im, len(have)


def main():
    name = sys.argv[1] if len(sys.argv) > 1 else 'stage3.jpg'
    W = 1744
    a = flow(W)
    b, n = shots(W)
    im = Image.new('RGB', (W, a.height + b.height), BG)
    im.paste(a, (0, 0)); im.paste(b, (0, a.height))
    im.save(OUT + name, quality=88)
    print(OUT + name, im.size, 'shots', n)


if __name__ == '__main__':
    main()
