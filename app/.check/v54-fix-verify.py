# v54：三项修复实机自查截图——多层上层墙面纹理+踢脚线 / 扩大的楼梯间 / 售货机朝向
# 用法：cd app && python .check/v54-fix-verify.py（dev 服务器须已在 :3000 运行）
from playwright.sync_api import sync_playwright

SHOTS = [
    # (名称, 据点, 目标层级 id, x, y, z, yaw, pitch)
    ('fix-2f-corridor', 'gamma', 106, 39.5, 23.5, 3.05, 0.0, -0.08),   # Gemma 2F 走廊看隔墙（纹理+踢脚线）
    ('fix-2f-dorm', 'gamma', 106, 17.5, 20.5, 3.05, 2.4, -0.12),       # 2F 宿舍一（隔墙角踢脚线）
    ('fix-3f-office', 'gamma', 106, 17.5, 21.5, 6.05, -2.2, -0.1),     # 3F 主管办公室回看（纹理+踢脚线）
    ('fix-stairwellA', 'gamma', 106, 63.5, 34.0, 3.05, 2.5, -0.3),     # 扩大后的楼梯间A（2F 看井道与坡道）
    ('fix-stairwellB', 'gamma', 106, 64.5, 13.5, 3.05, 1.6, -0.1),     # 扩大后的楼梯间B（2F 进坡口）
    ('fix-vending', 'gamma', 106, 36.5, 12.5, 0.0, 1.9, -0.05),        # 1F 前厅饮水机（背贴西墙、正面朝室内）
    ('fix-el3a-2f', 'el3a', 105, 34.5, 52.5, 3.05, -1.6, -0.1),        # EL3A 2F 休息室（l105_upwall 纹理回归）
    ('fix-el3a-rail', 'el3a', 105, 40.5, 43.5, 3.05, -1.6, -0.2),      # EL3A 2F 夹楼走廊（上层踢脚线）
]

with sync_playwright() as pw:
    b = pw.chromium.launch()
    pg = b.new_page(viewport={'width': 1280, 'height': 800})
    errors = []
    pg.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)
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
        pg.wait_for_timeout(300)
    except Exception:
        pass
    cur = None
    for name, op, lid, x, y, z, yaw, pitch in SHOTS:
        if cur != lid:
            pg.evaluate(f'() => window.__engine.devJumpOutpost(\'{op}\')')
            for _ in range(20):
                pg.wait_for_timeout(400)
                if pg.evaluate('window.__engine.player.level') == lid and not pg.evaluate('!!window.__engine.transition'):
                    break
            cur = lid
        pg.evaluate(f'''() => {{
          const eng = window.__engine, p = eng.player
          p.hp = 100000; p.flashlight = false
          p.x = {x}; p.y = {y}; p.z = {z}; p.vz = 0
          window.__look.yaw = {yaw}; window.__look.pitch = {pitch}
          eng.dev.frozenAI = true
        }}''')
        pg.wait_for_timeout(700)
        pg.screenshot(path=f'.check/v54-{name}.png')
        print('shot', name)
    print('errors:', errors[:5])
    b.close()
print('OK')
