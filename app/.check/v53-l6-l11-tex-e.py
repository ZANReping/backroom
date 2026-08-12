# v53 验证（五轮）：位置回读舵机导航——EL3A 二层办公区贴图；L10 谷仓红顶外景；L9 手电照屋顶
# 用法：先启动 npm run dev（:3000），再 python .check/v53-l6-l11-tex-e.py
import re
from playwright.sync_api import sync_playwright

PORT = 3000
errors = []


def panel_open(pg):
    exp = pg.locator('button[aria-label="展开开发者面板"]')
    if exp.count():
        exp.first.click(); pg.wait_for_timeout(200)


def panel_close(pg):
    col = pg.locator('button[aria-label="收起开发者面板"]')
    if col.count():
        col.first.click(); pg.wait_for_timeout(200)


def jump_level(pg, label):
    panel_open(pg)
    pg.locator('button:has-text("世界")').first.click(); pg.wait_for_timeout(300)
    pg.locator(f'button:text-is("{label}")').first.click(); pg.wait_for_timeout(2600)


def toggle_on(pg, name):
    panel_open(pg)
    pg.locator('button:has-text("世界")').first.click(); pg.wait_for_timeout(300)
    for _ in range(6):
        btn = pg.locator(f'button:text-is("{name}")').first
        if btn.evaluate("e => getComputedStyle(e).borderColor") == 'rgb(232, 185, 60)':
            return True
        btn.click(); pg.wait_for_timeout(350)
    return False


def read_pos(pg):
    """信息页读玩家精确坐标（面板保持开着，HUD 0.12s 刷新）"""
    panel_open(pg)
    pg.locator('button:has-text("信息")').first.click(); pg.wait_for_timeout(250)
    txt = pg.locator('text=/精确 \\(/').first.inner_text()
    mch = re.search(r'精确 \((-?\d+\.\d+), (-?\d+\.\d+)\) · z (-?\d+\.\d+)', txt)
    return tuple(float(v) for v in mch.groups())


def walk(pg, ms=450):
    pg.keyboard.down('w'); pg.wait_for_timeout(ms); pg.keyboard.up('w')
    pg.wait_for_timeout(150)


def nudge(pg, px):
    pg.mouse.move(640, 400); pg.mouse.move(640 + px, 400); pg.wait_for_timeout(120)


def wrap(a):
    import math
    while a > math.pi: a -= 2 * math.pi
    while a < -math.pi: a += 2 * math.pi
    return a


def goto(pg, wx, wy, tol=1.2, max_iter=16):
    """舵机导航到瓦片附近：走位估计朝向 → 角误差 → 鼠标 proportional 修正"""
    import math
    px_per_rad = None
    for i in range(max_iter):
        x0, y0, z0 = read_pos(pg)
        if math.hypot(wx - x0, wy - y0) < tol:
            return True, z0
        walk(pg)
        x1, y1, z1 = read_pos(pg)
        dx, dy = x1 - x0, y1 - y0
        if math.hypot(dx, dy) < 0.05:
            nudge(pg, 300)  # 卡住（顶墙）：先转一点再试
            continue
        head = math.atan2(dy, dx)
        want = math.atan2(wy - y1, wx - x1)
        err = wrap(want - head)
        if abs(err) < 0.15:
            continue
        if px_per_rad is None:
            nudge(pg, 240)
            xa, ya, _ = read_pos(pg)
            walk(pg)
            xb, yb, _ = read_pos(pg)
            if math.hypot(xb - xa, yb - ya) < 0.05:
                continue
            dh = wrap(math.atan2(yb - ya, xb - xa) - head)
            if abs(dh) < 0.03:
                px_per_rad = 700.0  # 量不到就取保守默认值
            else:
                px_per_rad = 240 / dh
            continue
        nudge(pg, max(-800, min(800, err * px_per_rad)))
    return False, read_pos(pg)[2]


with sync_playwright() as pw:
    b = pw.chromium.launch()
    pg = b.new_page(viewport={'width': 1280, 'height': 800})
    pg.on('console', lambda m: errors.append(m.text[:200]) if m.type == 'error' else None)
    pg.on('pageerror', lambda e: errors.append(str(e)[:200]))
    pg.add_init_script('localStorage.setItem("br_settings", JSON.stringify({devMode:true}))')
    pg.goto(f'http://localhost:{PORT}/', wait_until='networkidle')
    pg.wait_for_timeout(1200)
    pg.locator('button:has-text("开始游戏")').first.click()
    pg.wait_for_timeout(2500)
    sk = pg.locator('text=进入').first
    if sk.count():
        try: sk.click()
        except Exception: pass
    pg.wait_for_timeout(2500)

    # ---------- EL3A 二层：西侧阶梯 (x≈20, y36..41, +y 上坡) ----------
    jump_level(pg, '🚩 办公区EL3A')
    panel_close(pg)
    pg.keyboard.press('e'); pg.wait_for_timeout(2000)
    print('el3a toggle noclip:', toggle_on(pg, '穿墙'))
    panel_close(pg)
    ok1, _ = goto(pg, 20.5, 34.0)
    print('reach stair base:', ok1)
    ok2, z = goto(pg, 20.5, 42.5)
    print('reach 2F corridor:', ok2, 'z =', z)
    panel_close(pg)
    pg.mouse.move(640, 400)
    pg.screenshot(path='.check/v53e-el3a-2f.png')
    pg.mouse.move(640, 700)  # 低头：二层地毯
    pg.wait_for_timeout(300)
    pg.screenshot(path='.check/v53e-el3a-2f-floor.png')
    pg.mouse.move(640, 100)  # 抬头：二层吊顶
    pg.wait_for_timeout(300)
    pg.screenshot(path='.check/v53e-el3a-2f-ceil.png')

    # ---------- L10 谷仓红顶外景：穿出建筑后环拍 ----------
    jump_level(pg, 'L10')
    print('l10 bright:', toggle_on(pg, '一键照明'), 'noclip:', toggle_on(pg, '穿墙'), 'inv:', toggle_on(pg, '隐形'))
    panel_close(pg)
    pg.keyboard.down('w'); pg.wait_for_timeout(2500); pg.keyboard.up('w')
    pg.mouse.move(640, 400); pg.mouse.move(640, 280)  # 抬头约 20°
    for i in range(8):
        pg.wait_for_timeout(250)
        pg.screenshot(path=f'.check/v53e-l10-sweep{i}.png')
        nudge(pg, 300)

    # ---------- L9 房屋瓦顶：手电 + 环拍 ----------
    jump_level(pg, 'L9')
    print('l9 noclip:', toggle_on(pg, '穿墙'), 'inv:', toggle_on(pg, '隐形'))
    panel_close(pg)
    pg.keyboard.press('f')  # 手电
    pg.wait_for_timeout(500)
    pg.keyboard.down('w'); pg.wait_for_timeout(2000); pg.keyboard.up('w')
    pg.mouse.move(640, 400); pg.mouse.move(640, 280)
    for i in range(8):
        pg.wait_for_timeout(250)
        pg.screenshot(path=f'.check/v53e-l9-sweep{i}.png')
        nudge(pg, 300)

    logs = [e for e in errors if 'fallback' in e or '加载失败' in e]
    print('console errors:', len(errors), '| texture fallback:', len(logs))
    b.close()
print('OK -> .check/v53e-*.png')
