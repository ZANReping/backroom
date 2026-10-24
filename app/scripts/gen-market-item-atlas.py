# 批发市场 v2（2026-10-23）新物品的 refined 图集「market」：记忆汁液 / 驱笑剂 / 巴别润唇膏 / 户外医疗箱 / 高级医疗箱 / 盒装火盐。
# 与 items-refined 其余四套同规格：color 1024² sRGB、normal 512² OpenGL(+Y)、roughness 512²，4×4 分区、每区 256 px、8 px 内缩 + 边缘外扩。
# PIL 程序化绘制，固定随机种子，无外部素材；文字使用系统 DejaVu 字体（仅烘进贴图，不随游戏分发字体文件）。
# 用法：cd app && python3 scripts/gen-market-item-atlas.py
import argparse, json, math, os, random
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter, ImageFont

parser = argparse.ArgumentParser(description='Build the deterministic market item atlas.')
parser.add_argument('--output', default='public/textures/items-refined/market')
parser.add_argument('--font', default=os.environ.get('MARKET_ATLAS_FONT'))
args = parser.parse_args()
OUT = args.output
T, PAD = 256, 8
NAMES = ['jarGlass', 'amber', 'tapeLabel', 'lidMetal', 'vialGlass', 'megLabel', 'cork', 'balmRed',
         'balmWhite', 'kitRed', 'kitOrange', 'kitTrim', 'kraft', 'crystal', 'kitPanel', 'spare']
R = random.Random(20261023)
# Pass the original DejaVuSans-Bold.ttf with --font for byte-identical lettering.
FONT = next((str(p) for p in [args.font,
    '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
    Path(os.environ.get('WINDIR', 'C:/Windows')) / 'Fonts' / 'arialbd.ttf']
    if p and Path(p).is_file()), None)
if not FONT:
    parser.error('Set --font to an installed bold TrueType font (original: DejaVuSans-Bold.ttf).')
def font(sz): return ImageFont.truetype(FONT, sz)

def noise(img, amt, seed, blur=0):
    r = random.Random(seed); px = img.load(); w, h = img.size
    for y in range(h):
        for x in range(w):
            c = px[x, y]; n = r.uniform(-amt, amt)
            px[x, y] = tuple(max(0, min(255, int(v + n))) for v in c[:3])
    return img.filter(ImageFilter.GaussianBlur(blur)) if blur else img

def tile(name):
    im = Image.new('RGB', (240, 240)); d = ImageDraw.Draw(im); h = Image.new('L', (240, 240), 128); dh = ImageDraw.Draw(h); rough = 150
    if name == 'jarGlass':
        d.rectangle([0, 0, 240, 240], fill=(222, 214, 196)); noise(im, 6, 1, 1)
        for x in range(0, 240, 3): dh.line([(x, 0), (x, 240)], fill=128 + int(6 * math.sin(x / 9)))
        rough = 40
    elif name == 'amber':
        for y in range(240):
            k = y / 240; d.line([(0, y), (240, y)], fill=(int(232 - 40 * k), int(140 - 60 * k), int(52 - 30 * k)))
        for _ in range(40): x, y = R.randint(0, 239), R.randint(120, 239); d.ellipse([x, y, x + 3, y + 3], fill=(240, 230, 210))  # 沉淀
        rough = 30
    elif name == 'tapeLabel':
        d.rectangle([0, 0, 240, 240], fill=(236, 226, 196)); noise(im, 10, 3, 1); d = ImageDraw.Draw(im)
        d.text((16, 72), 'MEMORY', fill=(70, 56, 40), font=font(38)); d.text((18, 128), 'JUICE  #11', fill=(70, 56, 40), font=font(34))
        d.line([(16, 180), (220, 176)], fill=(110, 90, 60), width=3)
        for x in (0, 236): d.line([(x, 0), (x + 4, 240)], fill=(200, 188, 156), width=4)
        rough = 210
    elif name == 'lidMetal':
        d.rectangle([0, 0, 240, 240], fill=(176, 164, 128)); noise(im, 14, 4)
        im = im.filter(ImageFilter.BoxBlur(1)); d = ImageDraw.Draw(im)
        for y in range(0, 240, 12): d.line([(0, y), (240, y)], fill=(140, 128, 96), width=2); dh.line([(0, y), (240, y)], fill=96, width=2)
        rough = 70
    elif name == 'vialGlass':
        d.rectangle([0, 0, 240, 240], fill=(226, 238, 236)); noise(im, 4, 5, 1); rough = 25
    elif name == 'megLabel':
        d.rectangle([0, 0, 240, 240], fill=(224, 196, 71)); d = ImageDraw.Draw(im)
        d.rectangle([0, 0, 240, 40], fill=(34, 34, 0)); d.text((14, 6), 'M.E.G.', fill=(224, 196, 71), font=font(28))
        d.text((14, 60), 'OBJECT 3', fill=(20, 20, 0), font=font(36)); d.text((14, 112), 'INERT', fill=(150, 30, 20), font=font(40))
        d.text((14, 170), 'POST-EVENT A', fill=(20, 20, 0), font=font(24)); noise(im, 8, 6); rough = 190
    elif name == 'cork':
        d.rectangle([0, 0, 240, 240], fill=(176, 136, 88)); noise(im, 30, 7, 1)
        for _ in range(300): x, y = R.randint(0, 239), R.randint(0, 239); d.point((x, y), fill=(120, 88, 52)); dh.point((x, y), fill=80)
        rough = 230
    elif name == 'balmRed':
        d.rectangle([0, 0, 240, 240], fill=(206, 40, 44)); noise(im, 6, 8, 1); d = ImageDraw.Draw(im)
        for y in range(0, 240, 40): d.line([(0, y), (240, y)], fill=(226, 80, 80), width=2)
        rough = 60
    elif name == 'balmWhite':
        d.rectangle([0, 0, 240, 240], fill=(246, 242, 228)); noise(im, 5, 9, 2); rough = 120
    elif name in ('kitRed', 'kitOrange'):
        base = (204, 46, 40) if name == 'kitRed' else (232, 116, 30)
        d.rectangle([0, 0, 240, 240], fill=base); noise(im, 9, 10, 1)
        for _ in range(900): x, y = R.randint(0, 239), R.randint(0, 239); dh.point((x, y), fill=R.randint(110, 146))  # 磨砂颗粒
        rough = 140
    elif name == 'kitTrim':
        d.rectangle([0, 0, 240, 240], fill=(52, 52, 56)); noise(im, 8, 11)
        for x in range(0, 240, 10): dh.line([(x, 0), (x, 240)], fill=90, width=3)
        rough = 200
    elif name == 'kitPanel':  # 上半：红箱白十字面板；下半：橙箱白十字 + 「ADVANCED」
        d.rectangle([0, 0, 240, 120], fill=(204, 46, 40)); d.rectangle([0, 120, 240, 240], fill=(232, 116, 30))
        for y0 in (0, 120):
            d.rectangle([96, y0 + 18, 144, y0 + 102], fill=(246, 244, 236)); d.rectangle([62, y0 + 44, 178, y0 + 76], fill=(246, 244, 236))
            dh.rectangle([96, y0 + 18, 144, y0 + 102], fill=150); dh.rectangle([62, y0 + 44, 178, y0 + 76], fill=150)
        d.rectangle([0, 214, 240, 240], fill=(34, 34, 36)); d.text((52, 216), 'ADVANCED', fill=(246, 244, 236), font=font(19))
        noise(im, 6, 12); rough = 130
    elif name == 'kraft':  # 上半：火焰警示菱形 + FIRE SALT ×5；下半：素面瓦楞纸
        d.rectangle([0, 0, 240, 240], fill=(196, 154, 100)); noise(im, 12, 13, 1); d = ImageDraw.Draw(im)
        d.polygon([(120, 8), (176, 64), (120, 120), (64, 64)], fill=(232, 130, 60), outline=(40, 30, 20)); d.line([(120, 8), (176, 64), (120, 120), (64, 64), (120, 8)], fill=(40, 30, 20), width=4)
        d.polygon([(120, 34), (136, 66), (128, 92), (112, 92), (104, 66)], fill=(255, 210, 96))
        d.text((8, 8), 'FIRE', fill=(40, 30, 20), font=font(18)); d.text((8, 28), 'SALT', fill=(40, 30, 20), font=font(18)); d.text((186, 12), 'x5', fill=(40, 30, 20), font=font(28))
        for y in range(128, 240, 7): dh.line([(0, y), (240, y)], fill=140, width=2)
        rough = 220
    elif name == 'crystal':
        d.rectangle([0, 0, 240, 240], fill=(214, 98, 34))
        for _ in range(120):
            x, y, s = R.randint(-10, 240), R.randint(-10, 240), R.randint(8, 26)
            c = R.choice([(232, 130, 60), (245, 154, 74), (255, 196, 120), (200, 90, 30)])
            d.polygon([(x, y), (x + s, y + s // 3), (x + s // 2, y + s)], fill=c); dh.polygon([(x, y), (x + s, y + s // 3), (x + s // 2, y + s)], fill=R.randint(90, 170))
        rough = 50
    else:
        d.rectangle([0, 0, 240, 240], fill=(170, 166, 150))
    return im, h, rough

color = Image.new('RGB', (1024, 1024)); height = Image.new('L', (1024, 1024), 128); roughA = Image.new('L', (1024, 1024))
layout = {'size': 1024, 'padding': PAD, 'normalSize': 512, 'roughnessSize': 512, 'tiles': {}}
for i, name in enumerate(NAMES):
    im, h, r = tile(name); x, y = (i % 4) * T, (i // 4) * T
    color.paste(im.resize((T, T)), (x, y)); color.paste(im, (x + PAD, y + PAD))
    height.paste(h.resize((T, T)), (x, y)); height.paste(h, (x + PAD, y + PAD))
    roughA.paste(r, (x, y, x + T, y + T)); layout['tiles'][name] = [x, y, T, T]
# 法线：分区内中心差分（不跨区）
hs = height.resize((512, 512), Image.BILINEAR); hp = hs.load(); nrm = Image.new('RGB', (512, 512)); np_ = nrm.load()
for y in range(512):
    for x in range(512):
        tx0, ty0 = x // 128 * 128, y // 128 * 128
        xl, xr = max(tx0, x - 1), min(tx0 + 127, x + 1); yu, yd = max(ty0, y - 1), min(ty0 + 127, y + 1)
        dx = (hp[xr, y] - hp[xl, y]) / 255 * 2.0; dy = (hp[x, yu] - hp[x, yd]) / 255 * 2.0
        l = math.sqrt(dx * dx + dy * dy + 1); np_[x, y] = (int((-dx / l * .5 + .5) * 255), int((dy / l * .5 + .5) * 255), int((1 / l * .5 + .5) * 255))
os.makedirs(OUT, exist_ok=True)
color.save(f'{OUT}/color.png', optimize=True); nrm.save(f'{OUT}/normal.png', optimize=True); roughA.resize((512, 512)).save(f'{OUT}/roughness.png', optimize=True)
json.dump(layout, open(f'{OUT}/layout.json', 'w'), indent=2)
print('ok', OUT)
