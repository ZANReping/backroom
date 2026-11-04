# [l5map] 拼 reports/l5map/maps.jpg（实机截图来自 scripts/verify-l5map-game.mjs → reports/l5map/game/*.png）
import glob, os
from PIL import Image, ImageDraw, ImageFont
fp = sorted(f for f in glob.glob(os.path.expanduser('~/.fonts/*')) if f.lower().endswith(('ttf', 'otf', 'ttc')))
bold = [f for f in fp if 'Bold' in f]
F = lambda s, b=False: ImageFont.truetype((bold or fp)[0] if b else [f for f in fp if 'Bold' not in f][0], s)
P = 'reports/l5map/game/'
CW, CH = 960, 640
def cell(title, sub, path, crop=None, zoom=None):
    c = Image.new('RGB', (CW, CH), (22, 18, 15)); d = ImageDraw.Draw(c)
    d.rectangle((0, 0, CW, 62), fill=(0, 0, 0))
    d.text((14, 6), title, fill=(255, 226, 160), font=F(24, True)); d.text((14, 36), sub, fill=(205, 205, 205), font=F(16))
    if os.path.exists(P + path):
        im = Image.open(P + path).convert('RGB')
        if crop: im = im.crop(crop)
        im.thumbnail((CW - 12, CH - 70)); c.paste(im, ((CW - im.width) // 2, 66 + (CH - 70 - im.height) // 2))
        if zoom:  # 右下角放大镜：小地图
            z = Image.open(P + path).convert('RGB').crop(zoom).resize((300, 300), Image.LANCZOS)
            ImageDraw.Draw(z).rectangle((0, 0, 299, 299), outline=(232, 185, 60), width=4)
            c.paste(z, (CW - 316, CH - 316))
    else:
        d.text((20, 300), '（截图缺失：' + path + '）', fill=(255, 120, 120), font=F(22))
    return c
cells = [
    cell('① HUD 小地图', '黄铜方框罗盘 · 北向 N · 红色箭头 = 你 · 只画图标不写字（右下放大）', '1-hud.png', zoom=(1110, 8, 1272, 170)),
    cell('② 1F 主厅层（大堂层）+ 图例展开', '米黄纸底 · 墨线墙 · 房间淡色块 · 走廊暗红描边 · Art Deco 楼层号 · 右侧折叠图例', '2-1f-legend.png'),
    cell('③ 2F 客房层 · 我的房间', '房卡已绑定的房号金星高亮并标号 · 图例收起 · 斜线 = 未探索（雾）', '4-2f.png'),
    cell('④ B1 锅炉层', '客房门 · 电梯 · 留声机房；黑门只在 B1、探索到才标（本图范围内还没探索到）· 横纹是 B1 屏幕滤镜', '5-b1.png'),
    cell('⑤ Level 5.1 赌场（单独一页）', '兑换台 · 老虎机 · 二十一点 · 轮盘 · 骰子桌 · 出口', '7-casino.png'),
    cell('⑥ 低理智（理智 12）', '墙线淡墨错位 + 少量墨点，避开玩家与中心，不挡导航', '3-lowsan.png'),
]
W = CW * 2 + 18; H = (CH + 8) * 3 + 76
out = Image.new('RGB', (W, H), (10, 8, 6)); d = ImageDraw.Draw(out)
d.text((16, 14), 'L5 楼层导览图重制 · 实机截图（l5-wt）', fill=(255, 236, 190), font=F(32, True))
d.text((16 + 640, 26), 'check:l5map 37/37 · 小地图离屏缓存（命中帧 0.03 ms）· 存档往返', fill=(200, 200, 200), font=F(18))
for i, c in enumerate(cells): out.paste(c, (6 + (i % 2) * (CW + 6), 70 + (i // 2) * (CH + 8)))
out.save('reports/l5map/maps.jpg', quality=86)
print(out.size, os.path.getsize('reports/l5map/maps.jpg'))
