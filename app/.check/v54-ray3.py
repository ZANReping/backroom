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
    pg.evaluate('''() => {
      const p = window.__engine.player
      p.x = 28.3; p.y = 16.5; p.z = 0; p.vz = 0
      window.__look.yaw = Math.PI; window.__look.pitch = 0
      window.__engine.dev.frozenAI = true
    }''')
    pg.wait_for_timeout(500)
    info = pg.evaluate('''() => {
      const r = window.__renderer, m = window.__engine.map
      const s = m.structures.find((s2) => s2.kind === 'wallwindow')
      const grp = r.structMeshes.get(s)
      // 子网格在相机的视锥内吗？手动算：子网格世界位置 + 到相机的向量与朝向点积
      const cam = r.camera
      const fx = -Math.cos(window.__look.yaw), fz = -Math.sin(window.__look.yaw)
      const rows = []
      grp.updateMatrixWorld(true)
      for (const c of grp.children) {
        const wp = new c.position.constructor()
        c.getWorldPosition(wp)
        const dx = wp.x - cam.position.x, dz = wp.z - cam.position.z
        rows.push({ wp: [wp.x.toFixed(2), wp.y.toFixed(2), wp.z.toFixed(2)], ahead: +(dx * fx + dz * fz).toFixed(2), vis: c.visible,
                    inFrustum: c.frustumCulled })
      }
      // 隐藏 levelGroup 其他孩子
      const lg = r.levelGroup
      let hidden = 0
      for (const c of lg.children) if (c !== grp && !grp.children.includes(c) && c.visible) { c.visible = false; hidden++ }
      return { rows: rows.slice(0, 4), hidden, lgChildren: lg.children.length, grpParentIsLG: grp.parent === lg }
    }''')
    print(json.dumps(info))
    pg.wait_for_timeout(300)
    pg.screenshot(path='.check/v54-ww-solo.png')
    b.close()
print('OK')
