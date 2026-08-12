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
    pg.evaluate('() => window.__engine.devJump(4)')
    for _ in range(25):
        pg.wait_for_timeout(400)
        if pg.evaluate('window.__engine.player.level') == 4 and not pg.evaluate('!!window.__engine.transition'):
            break
    pg.wait_for_timeout(1000)
    print(pg.evaluate('''() => {
      const p = window.__engine.player
      p.x = -51.5; p.y = 69.5; p.z = 0; p.vz = 0
      return [p.x, p.y]
    }'''))
    pg.wait_for_timeout(1500)
    print(pg.evaluate('''() => {
      const m = window.__engine.map, inf = m.inf, p = window.__engine.player
      const rows = []
      for (let y = 64; y <= 74; y++) {
        let row = ''
        for (let x = -57; x <= -46; x++) {
          const lx = x - inf.ox, ly = y - inf.oy
          row += (lx < 0 || ly < 0 || lx >= m.w || ly >= m.h) ? '?' : m.tiles[ly * m.w + lx] === 1 ? '.' : '#'
        }
        rows.push(row)
      }
      return { p: [p.x.toFixed(1), p.y.toFixed(1)], ox: inf.ox, oy: inf.oy, w: m.w,
               exits: m.exits.filter((e) => e.def.kind.includes('stair')).map((e) => [e.def.kind, e.x + inf.ox, e.y + inf.oy]), rows }
    }'''))
    b.close()
print('OK')
