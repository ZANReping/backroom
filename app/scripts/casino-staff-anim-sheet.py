# [casino] Level 5.1 赌场员工 阶段 3：由 reports/casino/staff-anim/<who>/<clip>_NN.png（verify-casino-staff-anim.mjs 出帧）拼
#   reports/casino/staff-anim-sheet.jpg（每人各片段 4 关键帧网格，中文标注）与 staff-anim.gif（每人主要片段拼接，宽 ≤ 640）。
import json, os, subprocess
from PIL import Image, ImageDraw, ImageFont
R = 'reports/casino/staff-anim/'
FONT = '/workspace/work/fonts/NotoSansSC-Bold.otf'
ZH = {'louie': 'Louie（经理 / 兑换台）', 'prosthetic': '假肢人', 'billy': '台球先生 Billy', 'bartender': '酒保 E164', 'dealer': '背景员工 · 荷官（骰子头）', 'waiter': '背景员工 · 侍应（轮盘头）', 'guard': '背景员工 · 保安（老虎机头）'}
ORDER = ['louie', 'prosthetic', 'billy', 'bartender', 'dealer', 'waiter', 'guard']
GIF_CLIPS = {'louie': ['walk', 'exchange', 'warn', 'refuse', 'deal'], 'prosthetic': ['walk', 'sprint', 'smoke', 'pounce', 'hat'], 'billy': ['walk', 'hop', 'deal', 'tongue', 'pounce'],
             'bartender': ['side', 'shake', 'pour', 'wipe', 'startle'], 'dealer': ['walk', 'work'], 'waiter': ['serve', 'work'], 'guard': ['work', 'refuse']}
F = json.load(open(R + 'frames.json'))
f22, f16, f30 = ImageFont.truetype(FONT, 22), ImageFont.truetype(FONT, 15), ImageFont.truetype(FONT, 30)
TW, TH = 150, 190
def frame(who, clip, k): return Image.open(f'{R}{who}/{clip}_{k:02d}.png').convert('RGB')
# ---- sheet：每人一节；每行 2 个片段 × 4 帧
blocks = []
for who in ORDER:
    clips = F.get(who, [])
    if not clips: continue
    rows = (len(clips) + 1) // 2
    W = 2 * (4 * TW + 16) + 16
    im = Image.new('RGB', (W, 44 + rows * (TH + 30)), '#1a1216'); d = ImageDraw.Draw(im)
    d.text((14, 8), ZH[who], font=f22, fill='#f3e6c8')
    for i, c in enumerate(clips):
        x0, y0 = 16 + (i % 2) * (4 * TW + 16), 44 + (i // 2) * (TH + 30)
        n = c['n']; ks = [round(j * (n - 1) / 3) for j in range(4)]
        d.text((x0, y0 + 2), f"{c['clip']} · {c['zh']}", font=f16, fill='#e9c46a')
        for j, k in enumerate(ks):
            im.paste(frame(who, c['clip'], k).resize((TW, TH), Image.LANCZOS), (x0 + j * TW, y0 + 24))
    blocks.append(im)
W = max(b.width for b in blocks); H = sum(b.height for b in blocks) + 60
sheet = Image.new('RGB', (W, H), '#120c0f'); d = ImageDraw.Draw(sheet)
d.text((16, 12), 'Level 5.1 赌场员工 · 阶段 3 动画关键帧（每片段 4 帧，原地播放，LOD1）', font=f30, fill='#f3e6c8')
y = 60
for b in blocks: sheet.paste(b, (0, y)); y += b.height
sheet.save('reports/casino/staff-anim-sheet.jpg', quality=86)
# ---- gif：每帧 210×266，左上标注
os.makedirs('/tmp/sa_gif', exist_ok=True)
for f in os.listdir('/tmp/sa_gif'): os.remove('/tmp/sa_gif/' + f)
idx = 0
GW, GH = 300, 380
for who in ORDER:
    have = {c['clip']: c for c in F.get(who, [])}
    for clip in GIF_CLIPS[who]:
        if clip not in have: continue
        c = have[clip]
        for rep in range(2 if c['n'] <= 8 else 1):
            for k in range(c['n']):
                im = frame(who, clip, k).resize((GW, GH), Image.LANCZOS); d = ImageDraw.Draw(im)
                d.rectangle((0, 0, GW, 26), fill='#1a1216'); d.text((6, 3), f"{ZH[who].split('（')[0]} · {c['zh']}", font=f16, fill='#f3e6c8')
                im.save(f'/tmp/sa_gif/{idx:04d}.png'); idx += 1
# 两帧并排成 600 宽，减半帧数
subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-framerate', '6', '-i', '/tmp/sa_gif/%04d.png', '-vf', 'split[a][b];[a]palettegen=max_colors=96:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4', 'reports/casino/staff-anim.gif'], check=True)
print('frames', idx, 'gif', os.path.getsize('reports/casino/staff-anim.gif'), 'sheet', os.path.getsize('reports/casino/staff-anim-sheet.jpg'))
