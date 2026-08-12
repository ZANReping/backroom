from playwright.sync_api import sync_playwright
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
    pg.evaluate('() => window.__engine.devJumpOutpost(\'gamma\')')
    for _ in range(20):
        pg.wait_for_timeout(400)
        if pg.evaluate('window.__engine.player.level') == 106 and not pg.evaluate('!!window.__engine.transition'):
            break
    # 贴脸 0.9m 看窗 + 侧 45° 看窗
    for name, x, y, yaw in [('ww-face', 36.5, 16.4, 1.5708), ('ww-ang', 35.3, 16.6, 1.2)]:
        pg.evaluate(f'''() => {{
          const p = window.__engine.player
          p.hp = 100000; p.flashlight = true; p.battery = 100
          p.x = {x}; p.y = {y}; p.z = 0; p.vz = 0
          window.__look.yaw = {yaw}; window.__look.pitch = 0.0
          window.__engine.dev.frozenAI = true
        }}''')
        pg.wait_for_timeout(500)
        pg.screenshot(path=f'.check/v54-{name}.png')
        print('shot', name)
    b.close()
print('OK')
