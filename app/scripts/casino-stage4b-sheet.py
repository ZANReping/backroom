# [casino] 阶段 4b 拼图 + GIF：python3 scripts/casino-stage4b-sheet.py（读 reports/casino/game4b/*）
import glob, os
from PIL import Image, ImageDraw, ImageFont
D = 'reports/casino/game4b/'
FONT = next((f for f in glob.glob(os.path.expanduser('~/.fonts/*')) + glob.glob('/workspace/work/fonts/*') if 'CJK' in f or 'Noto' in f or 'Sans' in f), None)
font = ImageFont.truetype(FONT, 22) if FONT else ImageFont.load_default()
cells = [('a-slot', '老虎机就座视角：三条实体转轴停住（矢量符号）'), ('b-bj', '21 点：Billy 从牌靴发出的 3D 扑克牌 + 下注圈筹码'), ('c-rou', '轮盘：球落格，准星格子放的实体筹码'),
         ('d-dice', '骰宝：揭盅，3 颗 3D 骰子朝上 = 结果'), ('e-cashier', '兑换台：台面价目牌（准星选行），成交「+2 筹码」'), ('f-beast', '野兽对桌 21 点：就座视角，野兽清晰可见'),
         ('g-drink', '侍应送到桌边的酒：拿起来喝（镜头仰起）'), ('h-block', '负数拦门：门口 3 盏补光，假肢人 / 保安堵门'), ('k-ending', '无竖线：遮罩铺满全屏（1280/1280，原为左半 640）')]
CROP = {'d-dice': (240, 120, 1040, 590), 'c-rou': (100, 60, 1180, 700)}
W, H = 640, 380
sheet = Image.new('RGB', (W * 3, (H + 34) * 3), '#111')
dr = ImageDraw.Draw(sheet)
for i, (k, label) in enumerate(cells):
    x, y = (i % 3) * W, (i // 3) * (H + 34)
    p = D + k + '.png'
    if os.path.exists(p):
        im = Image.open(p).convert('RGB')
        if k in CROP: im = im.crop(CROP[k])
        sheet.paste(im.resize((W, H)), (x, y + 34))
    else: dr.text((x + 20, y + 180), '（缺）' + k, fill='#f66', font=font)
    dr.text((x + 8, y + 5), label, fill='#ffd98a', font=font)
sheet.save('reports/casino/stage4b.jpg', quality=86)
fr = []
for pref in ('gs', 'gr', 'gd'):
    for f in sorted(glob.glob(D + pref + '*.jpg')):
        im = Image.open(f).convert('RGB'); w, h = im.size; im = im.crop((int(w * 0.18), int(h * 0.12), int(w * 0.82), int(h * 0.88))).resize((360, int(360 * (h * 0.76) / (w * 0.64))))
        fr.append(im.quantize(colors=96, method=Image.Quantize.MEDIANCUT))
if fr: fr[0].save('reports/casino/tables.gif', save_all=True, append_images=fr[1:], duration=140, loop=0, optimize=True)
print('sheet ok, gif frames', len(fr), os.path.getsize('reports/casino/tables.gif') if fr else 0)
