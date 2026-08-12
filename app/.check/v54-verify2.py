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
    try: pg.locator('button[aria-label="收起开发者面板"]').first.click()
    except Exception: pass
    pg.evaluate('() => window.__engine.devJumpOutpost(\'gamma\')')
    for _ in range(20):
        pg.wait_for_timeout(400)
        if pg.evaluate('window.__engine.player.level') == 106 and not pg.evaluate('!!window.__engine.transition'):
            break
    dump = pg.evaluate('''() => {
      const m = window.__engine.map, r = window.__renderer
      const s = m.structures.find((s2) => s2.kind === 'wallwindow')
      const grp = r.structMeshes.get(s)
      const out = []
      grp.children.forEach((c) => {
        const g = c.geometry
        const p = g && g.parameters
        out.push({ type: c.type, geo: g ? g.type : null,
          size: p ? [p.width, p.height, p.depth].filter((v) => v !== undefined) : null,
          pos: [c.position.x.toFixed(2), c.position.y.toFixed(2), c.position.z.toFixed(2)],
          color: c.material && c.material.color ? c.material.color.getHexString() : null,
          opacity: c.material ? c.material.opacity : null })
      })
      return { rot: grp.rotation.y, n: grp.children.length, out }
    }''')
    print(json.dumps(dump, indent=1))
    b.close()
print('OK')
