# 水豚尸鼠特写目检（测试场地开阔区）：L0 测试场地召唤尸鼠并手动置 capybara 变体，冻结后正/侧面特写
from playwright.sync_api import sync_playwright

errors = []
with sync_playwright() as pw:
    b = pw.chromium.launch()
    pg = b.new_page(viewport={'width': 1280, 'height': 800})
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
    pg.evaluate('''() => {
      const eng = window.__engine, p = eng.player
      p.hp = 100000; p.flashlight = true; p.battery = 100
      eng.devTestField()
    }''')
    pg.wait_for_timeout(2000)
    pg.evaluate('''() => {
      const eng = window.__engine
      eng.devSpawnEntity('corpserat', 3)
      const e = eng.map.entities[eng.map.entities.length - 1]
      e.def = { ...e.def, capybara: true, scale: 1.45 } // 同 L3 变体（测试场地在 L0，手动套用）
      window.__rat = e
      eng.dev.frozenAI = true
    }''')
    pg.wait_for_timeout(600)
    pg.evaluate('''() => {
      const eng = window.__engine, p = eng.player, e = window.__rat
      const fx = Math.cos(e.facing), fy = Math.sin(e.facing)
      p.x = e.x + fx * 1.2; p.y = e.y + fy * 1.2
      p.z = 0
      window.__look.yaw = Math.atan2(-(e.y - p.y), -(e.x - p.x))
      window.__look.pitch = -0.42
    }''')
    pg.wait_for_timeout(500)
    pg.screenshot(path='.check/capy-front.png')
    pg.evaluate('''() => {
      const eng = window.__engine, p = eng.player, e = window.__rat
      const fx = Math.cos(e.facing + Math.PI / 2), fy = Math.sin(e.facing + Math.PI / 2)
      p.x = e.x + fx * 1.4; p.y = e.y + fy * 1.4
      window.__look.yaw = Math.atan2(-(e.y - p.y), -(e.x - p.x))
      window.__look.pitch = -0.38
    }''')
    pg.wait_for_timeout(500)
    pg.screenshot(path='.check/capy-side.png')
    print('capybara flag:', pg.evaluate('window.__rat.def.capybara === true'))
    print('errors:', errors[:5])
    b.close()
print('OK')
