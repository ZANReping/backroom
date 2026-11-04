# [jazz] 爵士脑（Entity 197）阶段 3 汇总图：python3 scripts/jazz-stage3-sheet.py → reports/jazz/stage3.jpg
# 输入 reports/jazz/game/*.png（scripts/verify-jazz-game.mjs 实机截图，L5 厨师餐厅东北角的舞台 / 吧台），4 × 3 拼图 + 中文标注。
import os
from PIL import Image, ImageDraw, ImageFont

SRC = 'reports/jazz/game/'
OUT = 'reports/jazz/stage3.jpg'
FONT = next((p for p in [os.path.expanduser('~/.fonts/NotoSansSC-Bold.otf'), '/workspace/work/fonts/NotoSansSC-Bold.otf'] if os.path.exists(p)), None)
FONT_R = next((p for p in [os.path.expanduser('~/.fonts/NotoSansSC.otf'), '/workspace/work/fonts/NotoSansSC.otf'] if os.path.exists(p)), FONT)
PANELS = [
    ('stage', '① 舞台全景：演出中', '4×7 舞台（台面 0.45、幕布、脚灯、台口装饰柱 + 帷幔）；头儿小号独奏'),
    ('fake', '② 终曲假吸魂：站定、低头', '监控在看：HUD 装死提示 + 露馅进度；台上举臂，观众席升起软边魂雾'),
    ('beast', '③ 老板坐在后排', '30% 的场次他会来（终曲露馅值涨 ×1.8）；演完隐入暗处'),
    ('bar', '④ 场间吧台', '头儿喝啤酒（倒进领口）· 萨克斯比划 · 低音提琴扶着沉甸甸的头'),
    ('piano', '⑤ 鼓手更爱弹钢琴', '场间他去台上那台立式钢琴（琴凳 / 原点对齐 JAZZ_PIANO），只有钢琴声'),
    ('cctv', '⑥ 监控探头（近景）', '墙角 2.95 m、×3；你在观众区时转过来盯你，终曲红灯快闪'),
    ('menu', '⑦ 点歌：「你点名，我来吹」', '覆盖层（游戏暂停）：1–5 / 点按 / Esc；5 首原创曲，下一首就吹'),
    ('sauce', '⑧ 哈瓦那辣椒酱', '低音提琴送：耐力 +30 / 暖身 4 分钟——压住厨师的「再来一份」、冷库冻得慢'),
    ('poster', '⑨ 迎宾女郎画的海报', '南墙正门边：「今晚 · 餐厅 · 爵士脑」；她的推销和海报物品也会预告'),
    ('hud', '⑩ HUD：在听', '演出进度 / 曲名 / 在听（理智回升、不想走）/ 点歌增益 / 辣椒酱 / 乐手字幕'),
    ('argue', '⑪ 场间吵架、被头儿劝和', 'argueReconcile：站位 = JAZZ_ARGUE（萨克斯 / 低音提琴面对面）'),
    ('report', '⑫ 告发（可选分支）', '看过终曲后监控下按住 X：关注度 −30；乐队收拾离场，回来后吸魂是真的'),
]
TW, TH, HEAD, CAP = 560, 332, 64, 56
cols, rows = 4, 3
W, H = TW * cols, HEAD + rows * (TH + CAP)
sheet = Image.new('RGB', (W, H), (12, 14, 26))
d = ImageDraw.Draw(sheet)
f_big = ImageFont.truetype(FONT, 30) if FONT else ImageFont.load_default()
f_t = ImageFont.truetype(FONT, 19) if FONT else ImageFont.load_default()
f_s = ImageFont.truetype(FONT_R, 14) if FONT_R else ImageFont.load_default()
d.text((20, 14), '爵士脑 Entity 197 · 阶段 3 机制（已知问题修复后重拍：L5 厨师餐厅的舞台 / 吧台，SwiftShader / CPU 蒙皮）', fill=(232, 198, 106), font=f_big)
for i, (name, title, sub) in enumerate(PANELS):
    x, y = (i % cols) * TW, HEAD + (i // cols) * (TH + CAP)
    p = SRC + name + '.png'
    if os.path.exists(p):
        im = Image.open(p).convert('RGB')
        im = im.resize((TW, int(im.height * TW / im.width)))
        if im.height > TH: im = im.crop((0, (im.height - TH) // 2, TW, (im.height - TH) // 2 + TH))
        sheet.paste(im, (x, y))
    else:
        d.rectangle([x, y, x + TW - 1, y + TH - 1], outline=(120, 60, 60))
        d.text((x + 20, y + 20), '缺图：' + name, fill=(220, 120, 120), font=f_t)
    d.rectangle([x, y + TH, x + TW - 1, y + TH + CAP - 1], fill=(20, 26, 52))
    d.text((x + 12, y + TH + 4), title, fill=(232, 198, 106), font=f_t)
    d.text((x + 12, y + TH + 30), sub, fill=(214, 208, 192), font=f_s)
    d.rectangle([x, y, x + TW - 1, y + TH + CAP - 1], outline=(60, 70, 110))
os.makedirs(os.path.dirname(OUT), exist_ok=True)
sheet.save(OUT, quality=88)
print(OUT, sheet.size)
