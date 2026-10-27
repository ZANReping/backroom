#!/usr/bin/env python3
# [creeper] 爬菌阶段 2：把 verify-creeper.mjs gif 逐帧截下的 PNG（reports/creeper/.gif/<段>/NNN.png）切帧、加段标题，合成 reports/creeper/stage2.gif。
# 用法：python3 scripts/creeper-gif.py [--max-mb 8]
# 体积控制：先按全帧合成；超过上限就隔帧抽稀（帧时长加倍，速度不变）、再缩小尺寸，直到满足上限。
import os, sys, glob
from PIL import Image, ImageDraw, ImageFont

OUT = 'reports/creeper/'
SRC = OUT + '.gif/'
MAX_MB = float(sys.argv[sys.argv.index('--max-mb') + 1]) if '--max-mb' in sys.argv else 8.0
# 段名、标题、帧率（与 verify-creeper.mjs 的 GIFS 一致）、段尾停留帧数
SEGS = [
    ('gif-rat-walk', '尸鼠行走 · 1 阶（左）对比 4 阶（右）：步频变慢、关节僵直、相位错乱、拖腿', 8, 2),
    ('gif-spider-walk', '洞穴狼蛛行走 · 1 阶（左）对比 4 阶（右）', 8, 2),
    ('gif-human-crawl', '爬菌人 · crawl 双手交替爬行（手掌落地锁定、拖着脊骨）', 10, 2),
    ('gif-human-idle', '爬菌人 · idle 伏地，头一顿一顿地转、抽搐，余烬明灭', 8, 2),
    ('gif-human-lunge', '爬菌人 · lunge 扑击', 12, 5),
    ('gif-hand', '第一人称手臂 · hand twitch：3 阶（左）/ 4 阶（右）手指痉挛', 10, 3),
]
FONT = None
for f in [os.path.expanduser('~/.fonts/NotoSansSC-Bold.otf'), '/workspace/work/fonts/NotoSansSC-Bold.otf']:
    if os.path.exists(f):
        FONT = f
        break


def load():
    frames = []  # (Image, 时长 ms)
    for name, title, fps, hold in SEGS:
        files = sorted(glob.glob(SRC + name + '/*.png'))
        if not files:
            print('缺少帧：', name)
            continue
        for i, fp in enumerate(files):
            im = Image.open(fp).convert('RGB')
            bar = 26
            canvas = Image.new('RGB', (im.width, im.height + bar), (12, 11, 10))
            canvas.paste(im, (0, bar))
            d = ImageDraw.Draw(canvas)
            font = ImageFont.truetype(FONT, 15) if FONT else ImageFont.load_default()
            d.text((8, 4), title, fill=(243, 238, 223), font=font)
            ms = int(round(1000 / fps))
            frames.append((canvas, ms * (1 + hold) if i == len(files) - 1 else ms))
    return frames


def save(frames, path, step=1, scale=1.0, colors=128):
    out, durs = [], []
    for i in range(0, len(frames), step):
        im, ms = frames[i]
        # 被抽掉的帧的时长并到保留帧上（速度不变）
        ms = sum(f[1] for f in frames[i:i + step])
        if scale != 1.0:
            im = im.resize((int(im.width * scale), int(im.height * scale)), Image.LANCZOS)
        out.append(im.quantize(colors=colors, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE))
        durs.append(ms)
    out[0].save(path, save_all=True, append_images=out[1:], duration=durs, loop=0, optimize=True, disposal=1)
    return os.path.getsize(path) / 1e6, len(out)


def main():
    frames = load()
    path = OUT + 'stage2.gif'
    # 先降色数、再缩尺寸，最后才抽帧（抽帧会让动作变卡）
    for step, scale, colors in [(1, 1.0, 128), (1, 1.0, 96), (1, 0.9, 96), (1, 0.8, 96), (2, 0.9, 96), (3, 0.8, 96)]:
        mb, n = save(frames, path, step, scale, colors)
        print(f'stage2.gif：{n} 帧，step={step} scale={scale} colors={colors} → {mb:.2f} MB')
        if mb <= MAX_MB:
            break
    # 关键帧：每段中间一帧，拼成一张检查图
    keys = []
    i = 0
    for name, *_ in SEGS:
        files = sorted(glob.glob(SRC + name + '/*.png'))
        if files:
            keys.append(Image.open(files[len(files) // 2]).convert('RGB'))
    if keys:
        w, h = keys[0].size
        sheet = Image.new('RGB', (w * 2, h * ((len(keys) + 1) // 2)), (12, 11, 10))
        for k, im in enumerate(keys):
            sheet.paste(im, ((k % 2) * w, (k // 2) * h))
        sheet.save(OUT + 'stage2-keyframes.jpg', quality=88)
        print('stage2-keyframes.jpg ok')


main()
