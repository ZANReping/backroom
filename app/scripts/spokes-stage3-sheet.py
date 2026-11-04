# [spokes] 迎宾女郎（Entity 28）阶段 3 汇总图：python3 scripts/spokes-stage3-sheet.py → reports/spokes/stage3.jpg
# 输入 reports/spokes/game/*.png（scripts/verify-spokes-game.mjs 实机截图，118 大堂 + 她的办公室），3 × 3 拼图 + 中文标注。
import os
from PIL import Image, ImageDraw, ImageFont

SRC = 'reports/spokes/game/'
OUT = 'reports/spokes/stage3.jpg'
FONT = next((p for p in [os.path.expanduser('~/.fonts/NotoSansSC-Bold.otf'), '/workspace/work/fonts/NotoSansSC-Bold.otf'] if os.path.exists(p)), None)
FONT_R = next((p for p in [os.path.expanduser('~/.fonts/NotoSansSC.otf'), '/workspace/work/fonts/NotoSansSC.otf'] if os.path.exists(p)), FONT)
PANELS = [
    ('greet', '① 前台迎宾 · 双字幕', '上行：领口音箱的推销（反话）；下行：斜体灰字的被困心声'),
    ('talk', '② 心声里的真线索', '方向 / 距离按推开大堂门时的 L5 快照实算（这里：电梯在左手边 5 米）'),
    ('invite', '③ 邀请「参观」', '鞠躬伸手 → 邀请卡；接受 = 危险路线 +8 关注，婉拒 = 心声「做得好」'),
    ('wind', '④ 上发条 · 放兔子', 'windRabbit：拧三下发条，松手——道具兔子交给实体兔子'),
    ('rabbit', '⑤ 发条兔引路', '跳向大堂正门；跟出去，它在 L5 带你去员工手里或餐厅（随机）'),
    ('photo', '⑥ 照片回忆 · 清晰的心声', '给她看侦探照片：photoRecall，白字给一次关键提示（出口方向 + 距离）'),
    ('drop2', '⑦ 办公室投递口', '北墙洞 A → Level 1、洞 B → Level 11：dropPoster 把海报丢进去'),
    ('seat', '⑧ 她的办公室', '胡桃木书桌 0.74 m · 皮椅 0.44 m · 铭牌 · 收音机 · 海报叠'),
    ('tap', '⑨ 老板拍肩', '野兽实体站在右后方，手（握点 = 她的右肩）；她 shoulderTap，心声「别碰我」'),
]
TW, TH, HEAD, CAP = 640, 380, 64, 54
cols, rows = 3, 3
W, H = TW * cols, HEAD + rows * (TH + CAP)
sheet = Image.new('RGB', (W, H), (18, 14, 14))
d = ImageDraw.Draw(sheet)
f_big = ImageFont.truetype(FONT, 30) if FONT else ImageFont.load_default()
f_t = ImageFont.truetype(FONT, 19) if FONT else ImageFont.load_default()
f_s = ImageFont.truetype(FONT_R, 14) if FONT_R else ImageFont.load_default()
d.text((20, 14), '迎宾女郎 Entity 28 · 阶段 3 机制（实机截图：118 大堂 + 她的办公室，SwiftShader / CPU 蒙皮）', fill=(236, 214, 170), font=f_big)
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
    d.rectangle([x, y + TH, x + TW - 1, y + TH + CAP - 1], fill=(30, 22, 22))
    d.text((x + 12, y + TH + 4), title, fill=(232, 180, 196), font=f_t)
    d.text((x + 12, y + TH + 30), sub, fill=(205, 198, 186), font=f_s)
    d.rectangle([x, y, x + TW - 1, y + TH + CAP - 1], outline=(70, 50, 46))
os.makedirs(os.path.dirname(OUT), exist_ok=True)
sheet.save(OUT, quality=88)
print(OUT, sheet.size)
