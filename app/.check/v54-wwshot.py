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
    pg.evaluate('() => window.__engine.devJumpOutpost(\'gamma\')')
    for _ in range(20):
        pg.wait_for_timeout(400)
        if pg.evaluate('window.__engine.player.level') == 106 and not pg.evaluate('!!window.__engine.transition'):
            break
    pg.evaluate('''() => {
      const p = window.__engine.player
      p.x = 36.5; p.y = 20.5; p.z = 0; p.vz = 0
      window.__look.yaw = Math.PI / 2; window.__look.pitch = 0.05
      window.__engine.dev.frozenAI = true
    }''')
    pg.wait_for_timeout(600)
    pg.screenshot(path='.check/v54-wallwindow2.png')
    # 酒店门双面把手：L5 客房门 —— devJump 到 L5 找一扇 hoteldoor 正对拍
    pg.evaluate('() => window.__engine.devJump(5)')
    for _ in range(20):
        pg.wait_for_timeout(400)
        if pg.evaluate('window.__engine.player.level') == 5 and not pg.evaluate('!!window.__engine.transition'):
            break
    info = pg.evaluate('''() => {
      const m = window.__engine.map
      const d = m.structures.find((s) => s.kind === 'hoteldoor' && !s.data?.dbl)
      return d ? { x: d.x, y: d.y } : null
    }''')
    print('door at', info)
    if info:
        pg.evaluate(f'''() => {{
          const p = window.__engine.player
          p.x = {info['x']} + 0.5; p.y = {info['y']} + 2.2; p.z = 0; p.vz = 0
          window.__look.yaw = Math.PI / 2; window.__look.pitch = 0
        }}''')
        pg.wait_for_timeout(400)
        pg.screenshot(path='.check/v54-doorhandle.png')
    b.close()
print('OK')
