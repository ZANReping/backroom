# v54 修复复查第二批：2F 走廊全景 / 楼梯间B 进坡口 / 3F 落梯口回看
from playwright.sync_api import sync_playwright
SHOTS = [
    ('fix2-2f-corridor-west', 30.5, 23.5, 3.05, -1.57, -0.05),  # 2F 走廊向西看（长椅/隔墙/踢脚线）
    ('fix2-stairB-entry', 64.0, 11.5, 3.05, 1.57, 0.05),        # 2F 进坡口向东看坡道B
    ('fix2-3f-landing', 66.5, 16.0, 6.05, 0.0, -0.35),          # 3F 落梯口向北回看坡道B
    ('fix2-2f-well-east', 63.5, 36.5, 3.05, 1.57, -0.1),        # 楼梯间A 落梯平台向东看
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
    try:
        pg.locator('button[aria-label="收起开发者面板"]').first.click()
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
        pg.wait_for_timeout(700)
        pg.screenshot(path=f'.check/v54-{name}.png')
        print('shot', name)
    print('errors:', errors[:5])
    b.close()
print('OK')
