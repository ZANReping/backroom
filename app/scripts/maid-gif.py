#!/usr/bin/env python3
# [maid] 阶段 2 GIF：把 reports/maid/anim-<clip>.png（4×3 网格，每格一个时刻）逐格切帧，拼成一张 GIF。
#   python3 scripts/maid-gif.py [clip,clip,...]   → reports/maid/stage2.gif
#   每帧把两个动作并排（左右各 400×400），减少总帧数。
import os, sys
from PIL import Image, ImageDraw, ImageFont

OUT = 'reports/maid/'
ZH = {'idle': ('待机', 4.0), 'push': ('推车行走', 1.6), 'turn': ('转向', 1.3), 'park': ('停车松手', 1.5), 'sweep': ('扫地', 2.0), 'wipe': ('擦拭', 1.6),
      'pick': ('捡物入车', 2.0), 'watch': ('转头注视', 3.0), 'greet': ('欠身问候', 2.4), 'shush': ('「嘘」', 2.0), 'sigh': ('叹气', 2.4),
      'approach': ('缓步逼近', 2.0), 'clean': ('打扫', 2.6), 'tidy': ('整理帽子围裙', 3.2)}
clips = sys.argv[1].split(',') if len(sys.argv) > 1 else list(ZH)
try:
    F = ImageFont.truetype('/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc', 22)
except Exception:
    F = ImageFont.load_default()
COLS, ROWS, TW, TH = 4, 3, 400, 400
SC = 0.75


def frames(clip):
    im = Image.open(f'{OUT}anim-{clip}.png').convert('RGB')
    fr = []
    for i in range(COLS * ROWS):
        c, r = i % COLS, i // COLS
        tile = im.crop((c * TW, r * TH + 36, (c + 1) * TW, (r + 1) * TH - 22)).resize((TW, TH - 34))
        f = Image.new('RGB', (TW, TH), (20, 18, 14)); f.paste(tile, (0, 0))
        d = ImageDraw.Draw(f); d.text((10, TH - 30), f'{ZH[clip][0]}  {clip}', font=F, fill=(245, 236, 200))
        fr.append(f)
    return fr


out = []
pairs = [clips[i:i + 2] for i in range(0, len(clips), 2)]
for pr in pairs:
    fs = [frames(c) for c in pr]
    n = 12
    for k in range(n * 2 if len(pr) == 2 else n):  # 循环两遍
        f = Image.new('RGB', (TW * 2, TH), (20, 18, 14))
        for j, c in enumerate(pr):
            f.paste(fs[j][k % n], (j * TW, 0))
        out.append(f)
dur = 140
out = [f.resize((int(f.width * SC), int(f.height * SC))) for f in out]
out[0].save(OUT + 'stage2.gif', save_all=True, append_images=out[1:], duration=dur, loop=0, optimize=True)
print('gif', len(out), os.path.getsize(OUT + 'stage2.gif'))
