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
    pg.evaluate('() => window.__engine.devJump(4)')
    for _ in range(25):
        pg.wait_for_timeout(400)
        if pg.evaluate('window.__engine.player.level') == 4 and not pg.evaluate('!!window.__engine.transition'):
            break
    pg.wait_for_timeout(1200)
    targets = {'elev': (20, 14), 'fakeup': (-52, 69), 'fakedown': (-40, 79), 'old': (-1161, -1262), 'trap': (60, 69)}
    for key, (wx, wy) in targets.items():
        dist = 1.8 if key == 'trap' else 2.6
        pitch = -0.6 if key == 'trap' else (-0.15 if 'down' in key or key == 'old' else 0)
        r = pg.evaluate(f'''() => {{
          const m = window.__engine.map, inf = m.inf, p = window.__engine.player
          p.x = {wx} + 0.5; p.y = {wy} + 0.5; p.z = 0; p.vz = 0 // 先挪进窗口范围
          return [p.x, p.y]
        }}''')
        pg.wait_for_timeout(1100)
        r = pg.evaluate(f'''() => {{
          const m = window.__engine.map, inf = m.inf, p = window.__engine.player
          const at = (x, y) => {{ const lx = x - inf.ox, ly = y - inf.oy
            return lx < 0 || ly < 0 || lx >= m.w || ly >= m.h ? 0 : m.tiles[ly * m.w + lx] }}
          for (const d of [{dist}, {dist} + 1, {dist} + 2]) {{
            for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]]) {{
              const tx = Math.floor({wx} + dx * d), ty = Math.floor({wy} + dy * d)
              if (at(tx, ty) !== 1) continue
              p.x = tx + 0.5; p.y = ty + 0.5; p.z = 0; p.vz = 0
              window.__look.yaw = Math.atan2(-({wy} + 0.5 - p.y), -({wx} + 0.5 - p.x)) + Math.PI
              window.__look.pitch = {pitch}
              window.__engine.dev.frozenAI = true
              return [p.x.toFixed(1), p.y.toFixed(1)]
            }}
          }}
          return null
        }}''')
        pg.wait_for_timeout(700)
        print(key, 'player at', r)
        pg.screenshot(path=f'.check/v54-l4-{key}.png')
    b.close()
print('OK')
