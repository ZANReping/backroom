# v53 验证（四轮）：穿墙游走拍 L9 房屋瓦顶 / L10 谷仓红顶外景；EL3A 传送 2F 主任办公室 NPC
# 用法：先启动 npm run dev（:3000），再 python .check/v53-l6-l11-tex-d.py
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


def roam(pg, tag):
    panel_close(pg)
    for i in range(4):
        pg.keyboard.down('w'); pg.wait_for_timeout(1800); pg.keyboard.up('w')
        pg.wait_for_timeout(400)
        # 抬头约 30° 看屋顶
        pg.mouse.move(640, 400); pg.mouse.move(640, 250)
        pg.wait_for_timeout(300)
        pg.screenshot(path=f'.check/v53d-{tag}-{i}-roof.png')
        # 回身 180° 再看
        pg.mouse.move(640, 400); pg.mouse.move(1240, 400)
        pg.wait_for_timeout(300)
        pg.screenshot(path=f'.check/v53d-{tag}-{i}-back.png')
        pg.mouse.move(640, 400)
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

    for lv, tag in [('L9', 'l9'), ('L10', 'l10')]:
        jump_level(pg, lv)
        print(tag, 'bright:', toggle_on(pg, '一键照明'), '| noclip:', toggle_on(pg, '穿墙'), '| inv:', toggle_on(pg, '隐形'))
        roam(pg, tag)

    # EL3A → 2F 主任办公室（whitfield）
    jump_level(pg, '🚩 办公区EL3A')
    panel_close(pg)
    pg.keyboard.press('e')
    pg.wait_for_timeout(2000)
    panel_open(pg)
    pg.locator('button:has-text("传送")').first.click(); pg.wait_for_timeout(400)
    npc = pg.locator('button:has-text("玛德琳")').first
    if npc.count():
        npc.click(); pg.wait_for_timeout(1500)
    else:
        print('whitfield not found, npc buttons:', pg.locator('button:has-text("🧑")').all_inner_texts()[:6])
    panel_close(pg)
    pg.screenshot(path='.check/v53d-el3a-2f.png')
    pg.mouse.move(640, 400); pg.mouse.move(640, 700)
    pg.wait_for_timeout(300)
    pg.screenshot(path='.check/v53d-el3a-2f-floor.png')
    pg.mouse.move(640, 100)
    pg.wait_for_timeout(300)
    pg.screenshot(path='.check/v53d-el3a-2f-ceil.png')

    logs = [e for e in errors if 'fallback' in e or '加载失败' in e]
    print('console errors:', len(errors), '| texture fallback:', len(logs))
    b.close()
print('OK -> .check/v53d-*.png')
