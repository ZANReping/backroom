# 团体标志处理（图鉴「团体」页介绍框水印用）：
# - wanderer/meg：wikidot 无可用图源，PIL 按参考图重绘（几何折纸鸟 / 展翅鹰+立方体+圆环），直接以主题色绘制
# - bntg/ariane：既有自制 logo 重着色为主题色（黑线→不透明、白底→透明）
# - brc：wikidot 原图（_src_brc.jpg，先 curl 下载）洪水填充去白底、保留原色、裁剪缩放
# - jerry：wikidot 原图（_src_jerry.png，fuckinbird.png）——彩色图保留原色（同 brc 管线去白底）；
#   若换成纯色线稿源则改用 recolor 改主题色 #4142a5
# 输出：public/textures/faction_{wanderer,meg,bntg,ariane,brc,jerry}.png（透明底，≤512）
# 用法：cd app && python scripts/gen-faction-logos.py
from PIL import Image, ImageDraw
from collections import deque

OUT = 'public/textures'

def save(img, name):
    img.save(f'{OUT}/faction_{name}.png')
    print(name, img.size)

# ---------- 1~4) 指定图源重着色（纯色标志→主题色；自动判定透明/白/黑底） ----------
def recolor(src_path, out_name, rgb, boost=2.2):
    src = Image.open(src_path).convert('RGBA')
    px = src.load()
    corners = [px[0, 0], px[src.width - 1, 0], px[0, src.height - 1], px[src.width - 1, src.height - 1]]
    corner_alpha = sum(c[3] for c in corners) / 4
    corner_lum = sum((c[0] + c[1] + c[2]) / 3 for c in corners) / 4
    transparent_bg = corner_alpha < 16
    white_bg = (not transparent_bg) and corner_lum > 128
    for y in range(src.height):
        for x in range(src.width):
            r, g, b, a = px[x, y]
            if a == 0:
                continue
            if transparent_bg:
                px[x, y] = (rgb[0], rgb[1], rgb[2], a)  # 透明底线稿：保留原 alpha
            elif white_bg:
                lum = (r + g + b) / 3
                na = int(a * min(255, (255 - lum) * boost) / 255)  # 白底黑线：黑线拉满
                px[x, y] = (rgb[0], rgb[1], rgb[2], na)
            else:
                lum = (r + g + b) / 3
                na = int(a * min(255, lum * boost) / 255)  # 黑底线稿：亮线留、暗底透
                px[x, y] = (rgb[0], rgb[1], rgb[2], na)
    bbox = src.getbbox()
    if bbox:
        src = src.crop(bbox)
    src.thumbnail((512, 512), Image.LANCZOS)
    save(src, out_name)

recolor(f'{OUT}/_src_wiki_logo.png', 'wanderer', (184, 184, 184))  # 后室维基图标（白线稿透明底）→ #b8b8b8
recolor(f'{OUT}/_src_meg.png', 'meg', (165, 164, 90))  # MEG 官方鹰徽（EagleSD.png）→ #a5a45a
recolor(f'{OUT}/_src_bntg.png', 'bntg', (86, 108, 90))  # BNTG 官方标志（ye-zhi-d logo.png）→ #566c5a
recolor(f'{OUT}/_src_ariane.png', 'ariane', (134, 118, 226))  # 阿丽亚娜圆环（zupimages foux.png）→ #8676e2

# ---------- 5~6) 彩色原图：wikidot 原图洪水填充去白底（保留原色） ----------
def keepcolor(src_path, out_name):
    src = Image.open(src_path).convert('RGBA')
    w, h = src.size
    px = src.load()

    def is_bg(x, y):
        r, g, b, a = px[x, y]
        return r > 230 and g > 230 and b > 230

    seen = bytearray(w * h)
    q = deque()
    for x in range(w):
        for y in (0, h - 1):
            if is_bg(x, y):
                q.append((x, y))
    for y in range(h):
        for x in (0, w - 1):
            if is_bg(x, y):
                q.append((x, y))
    while q:
        x, y = q.popleft()
        i = y * w + x
        if seen[i]:
            continue
        seen[i] = 1
        r, g, b, a = px[x, y]
        px[x, y] = (r, g, b, 0)
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nx, ny = x + dx, y + dy
            if 0 <= nx < w and 0 <= ny < h and not seen[ny * w + nx] and is_bg(nx, ny):
                q.append((nx, ny))
    bbox = src.getbbox()
    if bbox:
        src = src.crop(bbox)
    src.thumbnail((512, 512), Image.LANCZOS)
    save(src, out_name)

keepcolor(f'{OUT}/_src_jerry.png', 'jerry')  # 鹉主杰瑞涂鸦原图（fuckinbird.png）→ 保留原色

# ---------- BRC 同样走 keepcolor（彩色原图保留原色） ----------
keepcolor(f'{OUT}/_src_brc.jpg', 'brc')
