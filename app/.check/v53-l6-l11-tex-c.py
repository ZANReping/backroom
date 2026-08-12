# v53 验证（三轮）：带开关状态回读——L9/L10/L11 一键照明后抽查房屋/谷仓/楼体，EL3A 二层
# 用法：先启动 npm run dev（:3000），再 python .check/v53-l6-l11-tex-c.py
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


def toggle_on(pg, name):
    """点击开关直到进入 active（琥珀色边框）——HUD 高频重渲染会吞点击，需回读重试"""
    panel_open(pg)
    pg.locator('button:has-text("世界")').first.click()
    pg.wait_for_timeout(300)
    for _ in range(6):
        btn = pg.locator(f'button:text-is("{name}")').first
        on = btn.evaluate("e => getComputedStyle(e).borderColor")
        if on == 'rgb(232, 185, 60)':
            return True
        btn.click()
        pg.wait_for_timeout(350)
    btn = pg.locator(f'button:text-is("{name}")').first
    return btn.evaluate("e => getComputedStyle(e).borderColor") == 'rgb(232, 185, 60)'


def wander_shoot(pg, tag):
    panel_close(pg)
    for i in range(3):
        pg.keyboard.down('w'); pg.wait_for_timeout(1500); pg.keyboard.up('w')
        pg.wait_for_timeout(400)
        pg.screenshot(path=f'.check/v53c-{tag}-{i}.png')
        pg.mouse.move(640, 400); pg.mouse.move(640, 120)
        pg.wait_for_timeout(300)
        pg.screenshot(path=f'.check/v53c-{tag}-{i}-up.png')
        pg.mouse.move(640, 400)
        pg.mouse.move(900, 400)
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
        ok1 = toggle_on(pg, '一键照明')
        ok2 = toggle_on(pg, '隐形')
        print(tag, 'bright:', ok1, 'invisible:', ok2)
        wander_shoot(pg, tag)

    # EL3A：进门后传送到办公区 NPC 身旁（二楼）
    jump_level(pg, '🚩 办公区EL3A')
    panel_close(pg)
    pg.keyboard.press('e')
    pg.wait_for_timeout(2000)
    panel_open(pg)
    pg.locator('button:has-text("传送")').first.click()
    pg.wait_for_timeout(400)
    npc = pg.locator('button:has-text("🧑")').first
    if npc.count():
        npc.click()
        pg.wait_for_timeout(1500)
    panel_close(pg)
    pg.screenshot(path='.check/v53c-el3a-2f.png')
    pg.mouse.move(640, 400); pg.mouse.move(640, 700)
    pg.wait_for_timeout(300)
    pg.screenshot(path='.check/v53c-el3a-2f-floor.png')
    pg.mouse.move(640, 100)
    pg.wait_for_timeout(300)
    pg.screenshot(path='.check/v53c-el3a-2f-ceil.png')

    logs = [e for e in errors if 'fallback' in e or '加载失败' in e]
    print('console errors:', len(errors), '| texture fallback:', len(logs))
    b.close()
print('OK -> .check/v53c-*.png')
