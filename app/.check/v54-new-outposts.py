# v54：两新据点 + L3 海报地标 实机自查截图
# 用法：cd app && python .check/v54-new-outposts.py（dev 服务器须已在 :3000 运行）
from playwright.sync_api import sync_playwright

# (名称, 模式, x, y, yaw, pitch)
SHOTS = [
    ('storage-hall', 'storage', 40.5, 13.5, 3.14, 0.12),   # 存储设施：迎宾廊口看存储大厅
    ('storage-office', 'storage', 21.5, 16.5, 2.6, -0.05), # 仓管办公角（兑换柜台）
    ('blue-nave', 'bluesalvation', 39.5, 30.5, 3.14, 0.1),          # 蓝色救赎：大殿看讲坛（北望）
    ('blue-cells', 'bluesalvation', 39.5, 66.5, 3.14, 0.0),         # 蓝色救赎：居住区小室
    ('l3-poster', 'l3', 0, 0, 0, 0),                       # L3 廊道海报地标（dev 传送最近地标）
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
        pg.wait_for_timeout(300)
    except Exception:
        pass
    for name, mode, x, y, yaw, pitch in SHOTS:
        if mode == 'l3':
            # 回 L3 并传送到最近定居点地标（找不到就近 chunk 跳跃刷新）
            pg.evaluate('''() => {
              const eng = window.__engine
              if (eng.player.level !== 3) eng.devJump(3)
            }''')
            # 等过场完成并关掉层级卡（点「进入」）
            for _ in range(20):
                pg.wait_for_timeout(400)
                if not pg.evaluate('!!window.__engine.transition'):
                    break
            sk2 = pg.locator('text=进入').first
            if sk2.count():
                try: sk2.click()
                except Exception: pass
            pg.wait_for_timeout(1200)
            ok = pg.evaluate('''() => {
              const eng = window.__engine
              // 螺旋扫描周边 chunk（每跳跑 30 帧让窗口平移/生成完成），找到含海报地标的 chunk 即传送
              for (let i = 0; i < 90; i++) {
                if (eng.devTeleport('landmark')) return true
                const a = i * 2.39996 // 黄金角散布
                eng.player.x += Math.cos(a) * 33; eng.player.y += Math.sin(a) * 33
                for (let f = 0; f < 30; f++) eng.update(0.05)
              }
              return false
            }''')
            # 面向地标
            pg.evaluate('''() => {
              const eng = window.__engine, p = eng.player
              p.hp = 100000; p.flashlight = true; p.battery = 100
              let best = null, bd = 1e9
              for (const s of eng.map.structures) {
                if (s.kind !== 'landmark') continue
                const d = Math.hypot(s.x + 0.5 - p.x, s.y + 0.5 - p.y)
                if (d < bd) { bd = d; best = s }
              }
              if (best) {
                p.x = best.x + 0.5; p.y = best.y + 2.2; p.z = 0
                window.__look.yaw = Math.atan2(-(best.y + 0.5 - p.y), -(best.x + 0.5 - p.x))
                window.__look.pitch = 0.05
              }
            }''')
            pg.wait_for_timeout(700)
            pg.screenshot(path=f'.check/v54-{name}.png')
            print('shot', name, 'landmark found:', ok)
            continue
        op = mode
        lid = 107 if op == 'storage' else 108
        if pg.evaluate('window.__engine.player.level') != lid:
            pg.evaluate(f'() => window.__engine.devJumpOutpost(\'{op}\')')
            for _ in range(20):
                pg.wait_for_timeout(400)
                if pg.evaluate('window.__engine.player.level') == lid and not pg.evaluate('!!window.__engine.transition'):
                    break
        pg.evaluate(f'''() => {{
          const p = window.__engine.player
          p.hp = 100000; p.flashlight = false
          p.x = {x}; p.y = {y}; p.z = 0; p.vz = 0
          window.__look.yaw = {yaw}; window.__look.pitch = {pitch}
          window.__engine.dev.frozenAI = true
        }}''')
        pg.wait_for_timeout(700)
        pg.screenshot(path=f'.check/v54-{name}.png')
        print('shot', name)
    print('errors:', errors[:5])
    b.close()
print('OK')
