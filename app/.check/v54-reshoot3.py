from playwright.sync_api import sync_playwright
SHOTS = [
    ('ww-close', 36.5, 17.2, 0.0, 3.14, 0.0),     # 凹龛内近看墙体窗（大厅侧）
    ('ww-foyer', 36.5, 12.5, 0.0, 0.0, 0.0),      # 前厅侧回看墙体窗（南望）
    ('walltv-close', 53.5, 27.6, 3.05, 2.8, 0.05),# 2F 休息角 walltv 近景
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
    pg.evaluate('() => window.__engine.devJumpOutpost(\'gamma\')')
    for _ in range(20):
        pg.wait_for_timeout(400)
        if pg.evaluate('window.__engine.player.level') == 106 and not pg.evaluate('!!window.__engine.transition'):
            break
    for name, x, y, z, yaw, pitch in SHOTS:
        pg.evaluate(f'''() => {{
          const p = window.__engine.player
          p.hp = 100000; p.flashlight = false
          p.x = {x}; p.y = {y}; p.z = {z}; p.vz = 0
          window.__look.yaw = {yaw}; window.__look.pitch = {pitch}
          window.__engine.dev.frozenAI = true
        }}''')
        pg.wait_for_timeout(600)
        pg.screenshot(path=f'.check/v54-{name}.png')
        print('shot', name)
    b.close()
print('OK')
