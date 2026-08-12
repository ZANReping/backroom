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
      // 父链
      const chain = []
      let o = grp
      while (o) { chain.push(o.type + (o.visible ? '' : '(INVISIBLE)')); o = o.parent }
      const wp = new (grp.position.constructor)()
      grp.getWorldPosition(wp)
      // 相机与朝向
      const cam = r.camera
      const look = window.__look
      return {
        chain, world: [wp.x.toFixed(2), wp.y.toFixed(2), wp.z.toFixed(2)],
        camPos: cam ? [cam.position.x.toFixed(2), cam.position.y.toFixed(2), cam.position.z.toFixed(2)] : null,
        yaw: look.yaw, pitch: look.pitch,
        player: [window.__engine.player.x, window.__engine.player.y],
        tilesAround: [m.tiles[16 * m.w + 28], m.tiles[16 * m.w + 29], m.tiles[16 * m.w + 30], m.tiles[15 * m.w + 29], m.tiles[17 * m.w + 29]],
      }
    }''')
    print(json.dumps(info, indent=1))
    b.close()
print('OK')
