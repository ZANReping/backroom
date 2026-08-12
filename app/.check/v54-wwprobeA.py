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
    pg.evaluate('''() => {
      const eng = window.__engine, r = window.__renderer
      const s = eng.map.structures.find((s2) => s2.kind === 'wallwindow')
      const grp = r.structMeshes.get(s)
      grp.position.y += 1.4 // 抬高 1.4m 试显影
      const p = eng.player
      p.x = 36.5; p.y = 18.0; p.z = 0; p.vz = 0
      window.__look.yaw = Math.PI / 2; window.__look.pitch = -0.1
      eng.dev.frozenAI = true
    }''')
    pg.wait_for_timeout(600)
    pg.screenshot(path='.check/v54-ww-raised.png')
    b.close()
print('OK')
