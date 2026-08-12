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

    def jump_outpost(key, lvl):
        pg.evaluate(f'() => window.__engine.devJumpOutpost({json.dumps(key)})')
        for _ in range(25):
            pg.wait_for_timeout(400)
            if pg.evaluate('window.__engine.player.level') == lvl and not pg.evaluate('!!window.__engine.transition'):
                return True
        return False

    def win_dump_shot(lvl, shot):
        return pg.evaluate(f'''() => {{
          const m = window.__engine.map, r = window.__renderer
          const s = m.structures.find((s2) => s2.kind === 'wallwindow')
          if (!s) return null
          const grp = r.structMeshes.get(s)
          const deg90 = Math.round((Number(s.data?.deg) || 0) / 90) % 2 !== 0
          const cx = s.x + 0.5, cy = s.y + 0.5
          const fl = (x, y) => m.tiles[y * m.w + x] === 1
          // 面侧：deg90 → (x, y±1)，否则 (x±1, y)
          const faces = deg90 ? [[0, -1, -Math.PI / 2], [0, 1, Math.PI / 2]] : [[-1, 0, Math.PI], [1, 0, 0]]
          let cam = null
          for (const [dx, dy, yaw] of faces) if (fl(s.x + dx, s.y + dy)) {{ cam = [cx + dx * 2.2, cy + dy * 2.2, yaw]; break }}
          const shapes = grp.children.map((c) => (c.geometry && c.geometry.parameters
            ? [c.geometry.parameters.width, c.geometry.parameters.height, c.geometry.parameters.depth].filter((v) => v !== undefined).map((v) => +v.toFixed(2)).join('x')
            : c.geometry ? c.geometry.type : c.type) + '@' + c.position.y.toFixed(2))
          return {{ cam, shapes, deg: s.data?.deg }}
        }}''') and None

    for key, lvl, shot in [('alpha', 101, 'v54-ww-alpha.png'), ('el3a', 105, 'v54-ww-el3a.png'), ('storage', 107, 'v54-ww-storage.png')]:
        if not jump_outpost(key, lvl):
            print(key, 'JUMP FAIL'); continue
        info = pg.evaluate('''() => {
          const m = window.__engine.map, r = window.__renderer
          const s = m.structures.find((s2) => s2.kind === 'wallwindow')
          if (!s) return null
          const grp = r.structMeshes.get(s)
          const deg90 = Math.round((Number(s.data?.deg) || 0) / 90) % 2 !== 0
          const cx = s.x + 0.5, cy = s.y + 0.5
          const fl = (x, y) => m.tiles[y * m.w + x] === 1
          const faces = deg90 ? [[0, -1, -Math.PI / 2], [0, 1, Math.PI / 2]] : [[-1, 0, Math.PI], [1, 0, 0]]
          let cam = null
          for (const [dx, dy, yaw] of faces) if (fl(s.x + dx, s.y + dy)) { cam = [cx + dx * 2.2, cy + dy * 2.2, yaw]; break }
          const shapes = grp.children.map((c) => (c.geometry && c.geometry.parameters
            ? [c.geometry.parameters.width, c.geometry.parameters.height, c.geometry.parameters.depth].filter((v) => v !== undefined).map((v) => +v.toFixed(2)).join('x')
            : c.geometry ? c.geometry.type : c.type) + '@' + c.position.y.toFixed(2))
          return { cam, shapes, deg: s.data?.deg }
        }''')
        print(key, json.dumps(info))
        if info and info['cam']:
            c = info['cam']
            pg.evaluate(f'''() => {{
              const p = window.__engine.player
              p.x = {c[0]}; p.y = {c[1]}; p.z = 0; p.vz = 0
              window.__look.yaw = {c[2]}; window.__look.pitch = 0
              window.__engine.dev.frozenAI = true
            }}''')
            pg.wait_for_timeout(500)
            pg.screenshot(path=f'.check/{shot}')
    b.close()
print('OK')
