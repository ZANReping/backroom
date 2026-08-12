# v54 补拍：L3 海报地标（从开阔侧看）+ 蓝色救赎居住区小室
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
    # --- 蓝色救赎居住区（站小室中央向北看） ---
    pg.evaluate('() => window.__engine.devJumpOutpost(\'bluesalvation\')')
    for _ in range(20):
        pg.wait_for_timeout(400)
        if pg.evaluate('window.__engine.player.level') == 108 and not pg.evaluate('!!window.__engine.transition'):
            break
    pg.evaluate('''() => {
      const p = window.__engine.player
      p.hp = 100000; p.flashlight = false
      p.x = 38.5; p.y = 59.5; p.z = 0; p.vz = 0
      window.__look.yaw = 3.14; window.__look.pitch = 0.05
      window.__engine.dev.frozenAI = true
    }''')
    pg.wait_for_timeout(700)
    pg.screenshot(path='.check/v54-blue-cells.png')
    print('shot blue-cells')
    # --- L3 海报地标（找地标后站到其开阔侧 2.2m 回看） ---
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
        // 找开阔侧（地板邻格）站位回看海报
        const m = eng.map
        const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]]
        let spot = null
        for (const [dx, dy] of dirs) {
          const tx = best.x + dx, ty = best.y + dy
          if (m.tiles[ty * m.w + tx] === 1) { spot = [tx + 0.5 + dx * 1.2, ty + 0.5 + dy * 1.2]; break }
        }
        if (spot) {
          p.x = spot[0]; p.y = spot[1]; p.z = 0
          window.__look.yaw = Math.atan2(-(best.y + 0.5 - p.y), -(best.x + 0.5 - p.x))
          window.__look.pitch = 0.02
        }
      }
    }''')
    pg.wait_for_timeout(700)
    pg.screenshot(path='.check/v54-l3-poster.png')
    print('shot l3-poster, found:', ok)
    b.close()
print('OK')
