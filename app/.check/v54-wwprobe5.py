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
      const scene = r.scene
      const hits = []
      scene.updateMatrixWorld(true)
      // 枚举场景根下所有 mesh，找世界包围盒覆盖 (36.5, 1.5, 15.6) 的
      const V = r.ambient.position.constructor
      scene.traverse((o) => {
        if (!o.isMesh || !o.geometry) return
        if (!o.geometry.boundingBox) o.geometry.computeBoundingBox()
        const bb = o.geometry.boundingBox.clone()
        bb.applyMatrix4(o.matrixWorld)
        if (36.5 >= bb.min.x && 36.5 <= bb.max.x && 1.5 >= bb.min.y && 1.5 <= bb.max.y && 15.6 >= bb.min.z && 15.6 <= bb.max.z)
          hits.push([o.geometry.type, bb.min.x.toFixed(1), bb.max.x.toFixed(1), bb.min.y.toFixed(1), bb.max.y.toFixed(1), bb.min.z.toFixed(1), bb.max.z.toFixed(1)])
      })
      return hits.slice(0, 12)
    }''')
    for h in info: print(h)
    b.close()
print('OK')
