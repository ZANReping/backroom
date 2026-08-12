from playwright.sync_api import sync_playwright
import json
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
    pg.evaluate('() => window.__engine.devJumpOutpost(\'alpha\')')
    for _ in range(25):
        pg.wait_for_timeout(400)
        if pg.evaluate('window.__engine.player.level') == 101 and not pg.evaluate('!!window.__engine.transition'):
            break
    info = pg.evaluate('''() => {
      const r = window.__renderer, m = window.__engine.map
      const s = m.structures.find((s2) => s2.kind === 'wallwindow')
      const grp = r.structMeshes.get(s)
      const cam = r.camera
      const c0 = grp.children[0], c3 = grp.children[3]
      const dump = (c) => ({
        layers: c.layers.mask, matLayers: undefined,
        matVisible: c.material.visible, opacity: c.material.opacity, transparent: c.material.transparent,
        posCount: c.geometry.attributes.position ? c.geometry.attributes.position.count : null,
        drawRange: c.geometry.drawRange.count,
        bs: c.geometry.boundingSphere ? [c.geometry.boundingSphere.center.x.toFixed(2), c.geometry.boundingSphere.center.y.toFixed(2), c.geometry.boundingSphere.center.z.toFixed(2), c.geometry.boundingSphere.radius.toFixed(2)] : null,
        scale: [c.scale.x, c.scale.y, c.scale.z],
        renderOrder: c.renderOrder,
      })
      return { camLayers: cam.layers.mask, lower: dump(c0), mullion: dump(c3) }
    }''')
    print(json.dumps(info, indent=1))
    b.close()
print('OK')
