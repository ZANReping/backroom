# v53 验证（二轮）：L9 房屋（木挂板+瓦顶）/ L10 谷仓红顶 / L11 楼体立面 / EL3A 二层办公区
# 用法：先启动 npm run dev（:3000），再 python .check/v53-l6-l11-tex-b.py
from playwright.sync_api import sync_playwright

PORT = 3000
errors = []


def panel_open(pg):
    exp = pg.locator('button[aria-label="展开开发者面板"]')
    if exp.count():
        exp.first.click()
        pg.wait_for_timeout(200)


def panel_close(pg):
    col = pg.locator('button[aria-label="收起开发者面板"]')
    if col.count():
        col.first.click()
        pg.wait_for_timeout(200)


def jump_level(pg, label):
    panel_open(pg)
    pg.locator('button:has-text("世界")').first.click()
    pg.wait_for_timeout(300)
    pg.locator(f'button:text-is("{label}")').first.click()
    pg.wait_for_timeout(2600)


def toggle(pg, name):
    panel_open(pg)
    pg.locator('button:has-text("世界")').first.click()
    pg.wait_for_timeout(300)
    btn = pg.locator(f'button:text-is("{name}")').first
    btn.click()
    pg.wait_for_timeout(300)


def wander_shoot(pg, tag):
    panel_close(pg)
    for i in range(3):
        pg.keyboard.down('w'); pg.wait_for_timeout(1500); pg.keyboard.up('w')
        pg.wait_for_timeout(400)
        pg.screenshot(path=f'.check/v53b-{tag}-{i}.png')
        pg.mouse.move(640, 400); pg.mouse.move(640, 120)  # 抬头看屋顶
        pg.wait_for_timeout(300)
        pg.screenshot(path=f'.check/v53b-{tag}-{i}-up.png')
        pg.mouse.move(640, 400)
        pg.mouse.move(900, 400)  # 右转一点换方向
        pg.wait_for_timeout(200)


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

    for lv, tag in [('L9', 'l9'), ('L10', 'l10'), ('L11', 'l11')]:
        jump_level(pg, lv)
        toggle(pg, '一键照明')
        toggle(pg, '隐形')
        wander_shoot(pg, tag)

    # EL3A：进门后传送到二楼办公区 NPC 身旁
    jump_level(pg, '🚩 办公区EL3A')
    panel_close(pg)
    pg.keyboard.press('e')  # 进入 北部入口
    pg.wait_for_timeout(2000)
    panel_open(pg)
    pg.locator('button:has-text("传送")').first.click()
    pg.wait_for_timeout(400)
    npc = pg.locator('button:has-text("🧑")').first
    if npc.count():
        npc.click()
        pg.wait_for_timeout(1500)
    panel_close(pg)
    pg.screenshot(path='.check/v53b-el3a-2f.png')
    pg.mouse.move(640, 400); pg.mouse.move(640, 700)  # 低头看二层地毯
    pg.wait_for_timeout(300)
    pg.screenshot(path='.check/v53b-el3a-2f-floor.png')
    pg.mouse.move(640, 100)                            # 抬头看二层吊顶
    pg.wait_for_timeout(300)
    pg.screenshot(path='.check/v53b-el3a-2f-ceil.png')

    logs = [e for e in errors if 'fallback' in e or '加载失败' in e]
    print('console errors:', len(errors), '| texture fallback:', len(logs))
    for e in errors[:8]: print('  !', e)
    b.close()
print('OK -> .check/v53b-*.png')
