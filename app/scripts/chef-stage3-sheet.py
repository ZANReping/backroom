# [chef] 厨师（Entity 800）阶段 3 汇总图：python3 scripts/chef-stage3-sheet.py → reports/chef/stage3.jpg
# 输入 reports/chef/game/*.png（scripts/verify-chef-game.mjs 实机截图，L5 餐厅 + 后场），4 × 3 拼图 + 中文标注。
import os
from PIL import Image, ImageDraw, ImageFont

SRC = 'reports/chef/game/'
OUT = 'reports/chef/stage3.jpg'
FONT = next((p for p in [os.path.expanduser('~/.fonts/NotoSansSC-Bold.otf'), '/workspace/work/fonts/NotoSansSC-Bold.otf'] if os.path.exists(p)), None)
FONT_R = next((p for p in [os.path.expanduser('~/.fonts/NotoSansSC.otf'), '/workspace/work/fonts/NotoSansSC.otf'] if os.path.exists(p)), FONT)
PANELS = [
    ('dining', '① 餐厅：着迷进食的顾客', '吊灯 · 天鹅绒壁纸 · 白桌布；顾客低着头一勺接一勺，谁也不看后厨'),
    ('blend', '② 看不见他：融进环境', '默认抖动溶解、边缘先化开、不投影；盯着看 3 秒才会显形'),
    ('seen', '③ 闪光 → 僵住 → 被看见', '档案员的相机：flashFreeze，耳朵竖起；从此只盯着你'),
    ('tap', '④ 绕到桌子对面敲桌', 'tapTable 每下 −4 理智；他在等你转身、或看向出口'),
    ('swing', '⑤ 背身就抡锅', '唯一带把手的锅：蓄力慢、出手 0.12 秒；跑出 1.9 米能躲'),
    ('cold', '⑥ 冷库：铐在铁管上', '75 秒限时：钥匙 / 撬棍开铐，或连按扯管子（会响，他提前回来）'),
    ('knife', '⑦ 超时：刀从磁条上取下', 'takeKnife；随后冷库门关上——黑屏 + 声音，不演出来'),
    ('barricade', '⑧ 打烊：绑门闩门', '换班音乐一停，他在正门里绑绳、推门闩；侧门全锁'),
    ('eat', '⑨ 免费的炖菜', '回血回饱；屏幕边缘变暖、更难注意到他；之后饿得更快：「再来一份」'),
    ('guard', '⑩ 关掉最后一台燃气灶', '停产 240 秒（砸坏 480 秒）；他守着灶 stoveLean，哪儿也不去'),
    ('vomit', '⑪ 远景背身：对着大锅', 'vomitPot 只在你远远地、在他身后时出现'),
    ('bell', '⑫ 摇铃引开', '在餐厅另一头摇服务铃：earTwitch，他走出后厨应单——厨房空了'),
]
TW, TH, HEAD, CAP = 560, 332, 64, 56
cols, rows = 4, 3
W, H = TW * cols, HEAD + rows * (TH + CAP)
sheet = Image.new('RGB', (W, H), (18, 14, 14))
d = ImageDraw.Draw(sheet)
f_big = ImageFont.truetype(FONT, 30) if FONT else ImageFont.load_default()
f_t = ImageFont.truetype(FONT, 19) if FONT else ImageFont.load_default()
f_s = ImageFont.truetype(FONT_R, 14) if FONT_R else ImageFont.load_default()
d.text((20, 14), '厨师 Entity 800 · 阶段 3 机制（实机截图：L5 餐厅 + 后厨 / 冷库，SwiftShader / CPU 蒙皮）', fill=(236, 214, 170), font=f_big)
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
    d.text((x + 12, y + TH + 4), title, fill=(240, 196, 150), font=f_t)
    d.text((x + 12, y + TH + 30), sub, fill=(205, 198, 186), font=f_s)
    d.rectangle([x, y, x + TW - 1, y + TH + CAP - 1], outline=(70, 50, 46))
os.makedirs(os.path.dirname(OUT), exist_ok=True)
sheet.save(OUT, quality=88)
print(OUT, sheet.size)
