from playwright.sync_api import sync_playwright
with sync_playwright() as pw:
    b = pw.chromium.launch()
    pg = b.new_page(viewport={'width': 1280, 'height': 800})
    errs = []
    pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
    pg.on('pageerror', lambda e: errs.append(str(e)))
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
      const eng = window.__engine, m = eng.map
      const s = m.structures.find((s2) => s2.kind === 'wallwindow')
      const r = window.__renderer
      const rec = r.structMeshes.get(s)
      let worldY = null, inScene = false
      if (rec) { worldY = rec.position.y + '/' + rec.position.x + '/' + rec.position.z; inScene = !!rec.parent }
      return { hasStruct: !!s, built: !!rec, inScene, pos: worldY, visible: rec?.visible }
    }''')
    print(info)
    print('errors:', errs[:5])
    b.close()
