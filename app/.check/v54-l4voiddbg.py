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
    # 逐步 hop 到 (-32.7,-61.5)
    import math
    def world():
        return pg.evaluate('() => { const e = window.__engine; return [e.player.x + e.map.inf.ox, e.player.y + e.map.inf.oy] }')
    for _ in range(140):
        cur = world(); dx, dy = -32.7 - cur[0], -61.5 - cur[1]; d = math.hypot(dx, dy)
        if d < 2: break
        step = min(20, d)
        pg.evaluate(f'() => {{ const p = window.__engine.player; p.x += {dx / d * step}; p.y += {dy / d * step}; p.z = 0; p.vz = 0 }}')
        pg.wait_for_timeout(350)
    print(pg.evaluate('''() => {
      const m = window.__engine.map, inf = m.inf
      const rows = []
      for (let y = -66; y <= -57; y++) {
        let row = ''
        for (let x = -37; x <= -26; x++) {
          const lx = x - inf.ox, ly = y - inf.oy
          if (lx < 0 || ly < 0 || lx >= m.w || ly >= m.h) { row += '?'; continue }
          const t = m.tiles[ly * m.w + lx], o = m.outdoor[ly * m.w + lx]
          row += o === 1 ? 'O' : t === 1 ? '.' : '#'
        }
        rows.push(row)
      }
      const wins = []
      for (const s of m.structures) if (s.kind === 'glasswin') wins.push([s.x + inf.ox, s.y + inf.oy, s.data?.deg])
      return { rows, wins: wins.slice(0, 20), p: [window.__engine.player.x + inf.ox, window.__engine.player.y + inf.oy] }
    }'''))
    b.close()
print('OK')
