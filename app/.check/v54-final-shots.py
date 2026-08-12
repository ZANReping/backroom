# v54 末批实机自查：蓝色救赎休息室 / Gemma 3F 机房 servercase / walltv / wallwindow
from playwright.sync_api import sync_playwright
SHOTS = [
    ('blue-lounge', 'bluesalvation', 108, 40.5, 40.5, 3.14, 0.08),  # 休息室主间北望（沙发围合+画像墙）
    ('blue-lounge2', 'bluesalvation', 108, 27.5, 27.5, 2.2, 0.02),  # 西区沙发围合近景
    ('gemma-3f-server', 'gamma', 106, 33.5, 28.5, 3.14, 0.1),       # 3F 机房看南墙 servercase 排（向北看？yaw 调整）
    ('gemma-walltv', 'gamma', 106, 55.5, 27.5, 3.14, 0.0),          # 2F 休息角看南墙 walltv
    ('gemma-wallwindow', 'gamma', 106, 36.5, 17.5, 3.14, 0.0),      # 1F 大厅北望前厅墙体窗
]
with sync_playwright() as pw:
    b = pw.chromium.launch()
    pg = b.new_page(viewport={'width': 1280, 'height': 800})
    errors = []
    pg.on('pageerror', lambda e: errors.append(str(e)))
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
        z = 0.0
        if '3f' in name: z = 6.05
        elif '2f' in name or 'walltv' in name: z = 3.05
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
    print('errors:', errors[:5])
    b.close()
print('OK')
