from playwright.sync_api import sync_playwright
SHOTS = [
    ('blue-lounge', 'bluesalvation', 108, 40.0, 33.0, 3.14, 0.06),   # 休息室中央北望（沙发围合+画像墙+祈祷角）
    ('blue-lounge2', 'bluesalvation', 108, 26.5, 24.5, 2.2, 0.0),    # 西区沙发围合近景
    ('gemma-walltv', 'gamma', 106, 55.5, 27.0, 3.14, 0.0),           # 2F 休息角看南墙 walltv
    ('gemma-wallwindow', 'gamma', 106, 36.5, 18.5, 3.14, 0.0),       # 1F 大厅凹龛看前厅墙体窗
]
with sync_playwright() as pw:
    b = pw.chromium.launch()
    pg = b.new_page(viewport={'width': 1280, 'height': 800})
    pg.add_init_script('localStorage.clear(); localStorage.setItem("br_settings", JSON.stringify({devMode:true, fogOfWar:false, grain:false}))')
    pg.goto('http://localhost:3000/', wait_until='networkidle')
    pg.wait_for_timeout(1500)
    pg.locator('button:has-text("开始游戏")').first.click()
    pg.wait_for_timeout(9000)
    sk = pg.locator('text=进入').first
    if sk.count():
        try: sk.click()
        except Exception: pass
    pg.wait_for_timeout(2000)
    try: pg.locator('button[aria-label="收起开发者面板"]').first.click()
    except Exception: pass
    cur = None
    for name, op, lid, x, y, yaw, pitch in SHOTS:
        if cur != lid:
            pg.evaluate(f'() => window.__engine.devJumpOutpost(\'{op}\')')
            for _ in range(20):
                pg.wait_for_timeout(400)
                if pg.evaluate('window.__engine.player.level') == lid and not pg.evaluate('!!window.__engine.transition'):
                    break
            cur = lid
        z = 3.05 if 'walltv' in name else 0.0
        pg.evaluate(f'''() => {{
          const p = window.__engine.player
          p.hp = 100000; p.flashlight = false
          p.x = {x}; p.y = {y}; p.z = {z}; p.vz = 0
          window.__look.yaw = {yaw}; window.__look.pitch = {pitch}
          window.__engine.dev.frozenAI = true
        }}''')
        pg.wait_for_timeout(700)
        pg.screenshot(path=f'.check/v54-{name}.png')
        print('shot', name)
    b.close()
print('OK')
