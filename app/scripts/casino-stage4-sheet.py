# [casino] 阶段 4 拼图：reports/casino/game/*.png → reports/casino/stage4.jpg（3×3，中文标注）
from PIL import Image, ImageDraw, ImageFont
D = 'reports/casino/game/'
P = [('1-staff', '① 员工在场：荷官 / Billy 发牌（LOD + 片段）'), ('2-cashier', '② 兑换台：Louie（物品 / 理智 / 记忆 ↔ 筹码）'), ('3-slot', '③ 老虎机 UI（三轴 / 赔率表 / 近失）'),
     ('4-blackjack', '④ 21 点 UI（Billy 发牌 · 品红绒面）'), ('5-roulette', '⑤ 轮盘 UI（美式双零 · 红黑 / 单双 / 单号）'), ('6-dice', '⑥ 第四游戏：骰宝 UI（大小 / 单双 / 点数）'),
     ('7-drink-addict', '⑦ 连输送酒 + 上瘾 HUD（再来一把 / 心声）'), ('8-block', '⑧ 紫筹码为负：Louie + 假肢人 + 保安拦门'), ('9-beast', '⑨ 野兽双人 21 点（输 = 专属结局）')]
W, H = 640, 380
f = ImageFont.truetype('/workspace/work/fonts/NotoSansSC-Bold.otf', 20)
sheet = Image.new('RGB', (W * 3, (H + 34) * 3), (16, 6, 10))
d = ImageDraw.Draw(sheet)
for i, (n, t) in enumerate(P):
    im = Image.open(D + n + '.png').convert('RGB').resize((W, H), Image.LANCZOS)
    x, y = (i % 3) * W, (i // 3) * (H + 34)
    sheet.paste(im, (x, y + 34)); d.text((x + 10, y + 5), t, font=f, fill=(255, 210, 110))
d.text((W * 3 - 520, (H + 34) * 3 - 28), '实机 119 层截图（?cpu=1 · SwiftShader）· 结局画面见 game/9b-ending.png', font=ImageFont.truetype('/workspace/work/fonts/NotoSansSC.otf', 14), fill=(200, 180, 160))
sheet.save('reports/casino/stage4.jpg', quality=88)
print('ok')
