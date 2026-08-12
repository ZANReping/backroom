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
    pg.wait_for_timeout(800)
    info = pg.evaluate('''() => {
      const r = window.__renderer
      const cam = r.camera
      const THREE_R = cam.position.constructor // Vector3 ctor
      const origin = new THREE_R(cam.position.x, cam.position.y, cam.position.z)
      const dir = new THREE_R(-Math.cos(window.__look.yaw), 0, -Math.sin(window.__look.yaw))
      // 从 renderer 场景里找 Raycaster：通过 camera 的 constructor 命名空间不可行——用场景图手动求交
      // 改用 three 暴露：renderer 上一般有 THREE 命名空间不可达；直接遍历 structMeshes 求与线段相交太繁。
      // 简化：返回相机位置 + 玩家位置 + 窗口组世界包围盒
      const m = window.__engine.map
      const s = m.structures.find((s2) => s2.kind === 'wallwindow')
      const grp = r.structMeshes.get(s)
      const inScene = (() => { let o = grp; while (o.parent) o = o.parent; return o.type })()
      const vis = []
      let o = grp
      while (o) { vis.push(o.visible); o = o.parent }
      return { cam: [cam.position.x.toFixed(2), cam.position.y.toFixed(2), cam.position.z.toFixed(2)],
               player: [window.__engine.player.x.toFixed(2), window.__engine.player.y.toFixed(2)],
               rootType: inScene, visChain: vis, grpPos: [grp.position.x, grp.position.y, grp.position.z] }
    }''')
    print(json.dumps(info))
    pg.screenshot(path='.check/v54-ww-alpha2.png')
    b.close()
print('OK')
