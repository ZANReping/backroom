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
      const p = window.__engine.player
      p.x = 36.5; p.y = 17.2; p.z = 0; p.vz = 0
      window.__look.yaw = Math.PI / 2; window.__look.pitch = 0
      window.__engine.dev.frozenAI = true
    }''')
    pg.wait_for_timeout(500)
    n = pg.evaluate('window.__renderer.levelGroup.children.length')
    print('levelGroup children:', n)
    for i in range(min(n, 26)):
        info = pg.evaluate(f'''() => {{
          const ch = window.__renderer.levelGroup.children[{i}]
          ch.visible = false
          return ch.type + ':' + (ch.geometry ? ch.geometry.type : 'grp')
        }}''')
        pg.wait_for_timeout(200)
        pg.screenshot(path=f'.check/wwkill-{i:02d}.png')
        pg.evaluate(f'() => {{ window.__renderer.levelGroup.children[{i}].visible = true }}')
        print(i, info)
    b.close()
print('OK')
