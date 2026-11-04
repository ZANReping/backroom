# [jazz] 爵士脑（Entity 197）阶段 3 已知问题修复：修前 / 修后对照图。python3 scripts/jazz-stage3-fix-sheet.py → reports/jazz/stage3-fix.jpg
# 修前 = reports/jazz/game-before/*.png（f0b3ea2 的实机截图，重拍前备份）；修后 = reports/jazz/game/*.png（scripts/verify-jazz-game.mjs 重拍）。
# 修前没有画面的（离场 / 避让：原来直接消失 / 直接穿过你），修前格放旧截图 + 红字说明。
import os
from PIL import Image, ImageDraw, ImageFont

B, A, OUT = 'reports/jazz/game-before/', 'reports/jazz/game/', 'reports/jazz/stage3-fix.jpg'
FONT = next((p for p in [os.path.expanduser('~/.fonts/NotoSansSC-Bold.otf'), '/workspace/work/fonts/NotoSansSC-Bold.otf'] if os.path.exists(p)), None)
FONT_R = next((p for p in [os.path.expanduser('~/.fonts/NotoSansSC.otf'), '/workspace/work/fonts/NotoSansSC.otf'] if os.path.exists(p)), FONT)
PAIRS = [
    ('① 魂雾', ('fake', '修前：MeshBasic 半透明球，像一颗颗实心白球'), ('fake', '修后：加性软边丝带 + 软粒子，按视深淡出，从观众席流向乐器口')),
    ('② 立柱', ('stage', '修前：餐厅墙上的木壁柱穿过舞台台面 / 吧台'), ('pillar', '修后：舞台 / 吧台背后不做壁柱，柱子改成台口两侧装饰柱 + 帷幔横楣')),
    ('③ 告发后离场', ('report', '修前：告发后四人直接消失（没有离场）'), ('leave', '修后：瞪你、摇头、收谱（packUp），走台阶下台')),
    ('③ 离场（续）', ('report', '修前：（同上，无画面）'), ('leave2', '修后：沿后墙走到后场弹簧门，穿门出去')),
    ('④ 回来后的真吸魂', ('fake', '修前：回来以后还是同一套假吸魂片段、同一种雾'), ('real', '修后：trueSoulSuck 僵直前伸一下下抽；雾从你身上被抽走（暖红）；画面压暗发冷')),
    ('⑤ 注视', ('bar', '修前：头不会单独转，只会整个人转身'), ('look', '修后：头 / 颈注视层——身体不动，头转过来看你（限角 + 平滑）')),
    ('⑥ 点歌菜单', ('menu', '修前：不暂停；数字键 1–5 在捕获阶段被截获'), ('menu', '修后：覆盖层暂停游戏；1–5 / 点按 / Esc；关后数字键归还快捷栏')),
    ('⑦ 走位避让', ('stage', '修前：上下台不走碰撞，会直接穿过站在路上的你'), ('yield', '修后：堵在台阶上——停下「劳驾」、绕路，绕不过去侧身挤开你')),
]
EXTRA = ('⑧ 监控机位', ('cctv', '修前：机位水平 4.2 m 外、探头偏小（×2.4）'), ('cctv', '修后：机位拉近到 3.1 m、探头放大到 ×3.0'))
PAIRS.append(EXTRA)
TW, TH, HEAD, CAP, LAB = 520, 308, 66, 50, 30
cols = 2  # 每行两组（修前 | 修后）
rows = (len(PAIRS) + cols - 1) // cols
W, H = cols * (2 * TW + 16), HEAD + rows * (LAB + TH + CAP + 10)
sheet = Image.new('RGB', (W, H), (12, 14, 26))
d = ImageDraw.Draw(sheet)
F = lambda p, s: ImageFont.truetype(p, s) if p else ImageFont.load_default()
f_big, f_t, f_s = F(FONT, 30), F(FONT, 19), F(FONT_R, 14)
d.text((20, 16), '爵士脑 Entity 197 · 阶段 3 已知问题修复（修前 | 修后，实机截图 SwiftShader / CPU 蒙皮）', fill=(232, 198, 106), font=f_big)
def tile(path, x, y):
    if os.path.exists(path):
        im = Image.open(path).convert('RGB'); im = im.resize((TW, int(im.height * TW / im.width)))
        if im.height > TH: im = im.crop((0, (im.height - TH) // 2, TW, (im.height - TH) // 2 + TH))
        sheet.paste(im, (x, y))
    else:
        d.rectangle([x, y, x + TW - 1, y + TH - 1], fill=(30, 20, 24), outline=(120, 60, 60)); d.text((x + 20, y + 20), '缺图：' + path, fill=(220, 120, 120), font=f_s)
for i, (title, bef, aft) in enumerate(PAIRS):
    gx, gy = (i % cols) * (2 * TW + 16), HEAD + (i // cols) * (LAB + TH + CAP + 10)
    d.rectangle([gx, gy, gx + 2 * TW + 5, gy + LAB - 1], fill=(28, 36, 72)); d.text((gx + 10, gy + 3), title, fill=(240, 214, 140), font=f_t)
    for k, (src, (nm, cap)) in enumerate([(B, bef), (A, aft)]):
        x, y = gx + k * (TW + 6), gy + LAB
        tile(src + nm + '.png', x, y)
        tag = '修前' if k == 0 else '修后'
        d.rectangle([x + 8, y + 8, x + 62, y + 34], fill=(150, 40, 40) if k == 0 else (40, 120, 70)); d.text((x + 14, y + 9), tag, fill=(255, 255, 255), font=f_t)
        d.rectangle([x, y + TH, x + TW - 1, y + TH + CAP - 1], fill=(20, 26, 52))
        words, line, lines = cap, '', []
        for ch in words:
            if d.textlength(line + ch, font=f_s) > TW - 20: lines.append(line); line = ch
            else: line += ch
        lines.append(line)
        for j, ln in enumerate(lines[:2]): d.text((x + 10, y + TH + 5 + j * 20), ln, fill=(240, 160, 150) if k == 0 else (190, 230, 190), font=f_s)
sheet.save(OUT, quality=88)
print(OUT, sheet.size)
