#!/usr/bin/env python3
# [casino] Level 5.1 场景修订 修前 / 修后 对比：python3 scripts/casino-scene-fix.py
#   修前截图：/workspace/work/casino/before/*.png（f0b2558 时的 reports/casino）；修后：reports/casino/*.png
#   输出 reports/casino/scene-fix.jpg（6 行 × 修前|修后，中文标注）+ reports/casino/luma.json（平均亮度 0–255，Rec.601 灰度）
import json, subprocess, os
from PIL import Image
BEF, AFT, OUT = '/workspace/work/casino/before/', 'reports/casino/', 'reports/casino/'
FONT = '/workspace/work/fonts/NotoSansSC-Bold.otf'
def luma(p):
    h = Image.open(p).convert('L').histogram(); return sum(i * c for i, c in enumerate(h)) / sum(h)
views = ['hall', 'bar', 'slots', 'tables', 'foyer']
lb = {v: round(luma(BEF + v + '.png'), 1) for v in views}; la = {v: round(luma(AFT + v + '.png'), 1) for v in views}
lb['avg'] = round(sum(lb[v] for v in views) / len(views), 1); la['avg'] = round(sum(la[v] for v in views) / len(views), 1)
json.dump({'before': lb, 'after': la}, open(OUT + 'luma.json', 'w'), ensure_ascii=False, indent=1)
rows = [
    ('tables', 'crop', '地毯尺度：星纹主图案 ≈0.97 m → 各区 0.42–0.55 m（ref8 实测约 0.5 m）'),
    ('foyer', None, '分区地毯：全场一种星纹 → 六区六套（前厅红金放射纹 / 牌桌酒红金大马士革…）+ 黄铜压条'),
    ('bar', None, '酒吧光：吊顶筒灯点阵 + 灯带 + 背光酒柜 + 暖色地面光斑（ref8）'),
    ('slots', None, '老虎机光：屏幕 / 顶箱为主光源，彩色辉光烘焙到地毯与椅子（ref6）'),
    ('tables', None, '牌桌聚光：每桌头顶聚光 + 光锥，品红绒面被照亮、周围略暗（ref7）'),
    ('hall', None, '全景密度：64×44 → 52×36 m，可走面积 89% → 64%，老虎机 71 → 136 台'),
]
tiles = []
for i, (v, mode, label) in enumerate(rows):
    pair = []
    for side, d, tag in (('b', BEF, '修前'), ('a', AFT, '修后')):
        src, dst = d + v + '.png', f'/tmp/_fix_{i}{side}.png'
        crop = ['-gravity', 'south', '-crop', '100%x50%+0+0', '+repage'] if mode == 'crop' else []
        l = (lb if side == 'b' else la)[v]
        subprocess.run(['convert', src, *crop, '-resize', '720x480^', '-gravity', 'center', '-extent', '720x480', '-gravity', 'northwest', '-fill', '#000a', '-draw', 'rectangle 0,0 250,40', '-font', FONT, '-fill', '#ffe6b0', '-pointsize', '22', '-annotate', '+10+8', f'{tag} · 亮度 {l}', dst], check=True)
        pair.append(dst)
    r = f'/tmp/_fix_r{i}.png'
    subprocess.run(['convert', *pair, '+append', '-gravity', 'north', '-background', '#120806', '-splice', '0x46', '-gravity', 'northwest', '-font', FONT, '-fill', '#f3e6c8', '-pointsize', '25', '-annotate', '+14+8', label, r], check=True)
    tiles.append(r)
hdr = '/tmp/_fix_h.png'
subprocess.run(['convert', '-size', '1440x70', 'xc:#120806', '-font', FONT, '-fill', '#ffd890', '-pointsize', '30', '-gravity', 'center', '-annotate', '+0+0', f'Level 5.1 赌场 场景修订 · 修前 / 修后 · 五视角平均亮度 {lb["avg"]} → {la["avg"]}（0–255）', hdr], check=True)
subprocess.run(['convert', hdr, *tiles, '-append', '-quality', '84', OUT + 'scene-fix.jpg'], check=True)
print(json.dumps({'before': lb, 'after': la}, ensure_ascii=False))
