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
    pg.evaluate('() => window.__engine.devJumpOutpost(\'gamma\')')
    for _ in range(20):
        pg.wait_for_timeout(400)
        if pg.evaluate('window.__engine.player.level') == 106 and not pg.evaluate('!!window.__engine.transition'):
            break
    info = pg.evaluate('''() => {
      const eng = window.__engine, r = window.__renderer
      const s = eng.map.structures.find((s2) => s2.kind === 'wallwindow')
      const grp = r.structMeshes.get(s)
      const out = []
      grp.updateMatrixWorld(true)
      for (const c of grp.children) {
        const v = new c.position.constructor()
        c.getWorldPosition(v)
        c.geometry.computeBoundingBox()
        const bb = c.geometry.boundingBox
        out.push([v.x.toFixed(2), v.y.toFixed(2), v.z.toFixed(2), 'h=', (bb.max.y - bb.min.y).toFixed(2), c.material.transparent ? 'T' : 'O'].join(','))
      }
      return out
    }''')
    for line in info: print(line)
    b.close()
print('OK')
