# v54：多层结构高层墙面「踢脚线太高」实机复现——Gamma 基地（106）2F/3F 与 EL3A（105）2F 巡场截图
# 用法：cd app && python .check/v54-skirting-repro.py（dev 服务器须已在 :3000 运行）
from playwright.sync_api import sync_playwright

SHOTS = [
    # (名称, 据点, 目标层级 id, x, y, z, yaw, pitch)
    ('gamma-1f-hall', 'gamma', 106, 39.5, 24.5, 0.0, 0.0, -0.05),     # 1F 大厅对照
    ('gamma-2f-corridor', 'gamma', 106, 39.5, 23.5, 3.05, 0.0, -0.1),  # 2F 走廊看北墙排
    ('gamma-2f-dorm', 'gamma', 106, 17.5, 19.5, 3.05, 2.2, -0.1),      # 2F 宿舍一看隔墙
    ('gamma-3f-office', 'gamma', 106, 17.5, 19.5, 6.05, 2.2, -0.1),    # 3F 主管办公室
    ('gamma-3f-corridor', 'gamma', 106, 39.5, 23.5, 6.05, 3.14, -0.05),# 3F 走廊看南墙排
    ('gamma-stairwellA', 'gamma', 106, 62.5, 34.5, 3.05, 2.6, -0.25),  # 楼梯间A 2F 看井道
    ('el3a-1f-atrium', 'el3a', 105, 40.5, 24.5, 0.0, -1.6, 0.15),      # EL3A 1F 中庭抬头看夹楼
    ('el3a-2f', 'el3a', 105, 34.5, 52.5, 3.05, -1.6, -0.1),            # EL3A 2F 休息室
    ('el3a-2f-rail', 'el3a', 105, 40.5, 43.5, 3.05, -1.6, -0.2),       # EL3A 2F 临中庭栏杆
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
    # 收起开发者面板（devMode 桌面端默认展开，遮挡画面左侧；点 aria-label 按钮收起）
    try:
        pg.locator('button[aria-label="收起开发者面板"]').first.click()
        pg.wait_for_timeout(300)
    except Exception:
        pass
    cur = None
    for name, op, lid, x, y, z, yaw, pitch in SHOTS:
        if cur != lid:
            pg.evaluate(f'''() => {{
              const eng = window.__engine
              eng.devJumpOutpost('{op}')
            }}''')
            # 轮询等过场真正完成
            for _ in range(20):
                pg.wait_for_timeout(400)
                lv = pg.evaluate('window.__engine.player.level')
                tr = pg.evaluate('!!window.__engine.transition')
                if lv == lid and not tr:
                    break
            cur = lid
            print('jumped to', lid)
        pg.evaluate(f'''() => {{
          const eng = window.__engine, p = eng.player
          p.hp = 100000; p.flashlight = false
          p.x = {x}; p.y = {y}; p.z = {z}; p.vz = 0
          window.__look.yaw = {yaw}; window.__look.pitch = {pitch}
          eng.dev.frozenAI = true
        }}''')
        pg.wait_for_timeout(700)
        pg.screenshot(path=f'.check/v54-{name}.png')
        print('shot', name, 'level', pg.evaluate('window.__engine.player.level'), 'z', pg.evaluate('window.__engine.player.z.toFixed(2)'))
    print('errors:', errors[:5])
    b.close()
print('OK')
