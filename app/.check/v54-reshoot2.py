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
    pg.evaluate('() => window.__engine.devJump(3)')
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
      for (let i = 0; i < 90; i++) {
        if (eng.devTeleport('landmark')) return true
        const a = i * 2.39996
        eng.player.x += Math.cos(a) * 33; eng.player.y += Math.sin(a) * 33
        for (let f = 0; f < 30; f++) eng.update(0.05)
      }
      return false
    }''')
    # 站到地标开阔侧 1.5m，面向地标所贴的墙（地标格的非地板邻格方向）
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
        const m = eng.map
        const isF = (x, y) => m.tiles[y * m.w + x] === 1
        const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]]
        for (const [dx, dy] of dirs) {
          if (!isF(best.x + dx, best.y + dy)) { // 墙在 (dx,dy) 侧 → 站对侧回看
            p.x = best.x + 0.5 - dx * 1.6; p.y = best.y + 0.5 - dy * 1.6; p.z = 0
            window.__look.yaw = Math.atan2(-dy, -dx) + 0.45 // 面向墙微偏（海报挂在墙面，取景带上墙）
            window.__look.pitch = 0.03
            break
          }
        }
      }
    }''')
    pg.wait_for_timeout(700)
    pg.screenshot(path='.check/v54-l3-poster.png')
    print('shot l3-poster, found:', ok)
    b.close()
print('OK')
