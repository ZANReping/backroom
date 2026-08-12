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
      const r = window.__renderer
      const out = []
      r.scene.traverse((o) => {
        if (!o.isMesh || !o.geometry?.attributes?.position) return
        const pos = o.geometry.attributes.position
        let cnt = 0
        for (let i = 0; i < pos.count; i++) {
          const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i)
          if (x >= 35.98 && x <= 37.02 && z >= 14.98 && z <= 16.02 && y > 1.2 && y < 1.9) cnt++ // 窗洞带
        }
        if (cnt) out.push([o.geometry.type, pos.count, cnt])
      })
      return out
    }''')
    print(info)
    b.close()
print('OK')
