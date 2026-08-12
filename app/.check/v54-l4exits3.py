from playwright.sync_api import sync_playwright
import math
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

    def world():
        return pg.evaluate('() => { const e = window.__engine; return [e.player.x + e.map.inf.ox, e.player.y + e.map.inf.oy] }')

    def hop(wx, wy):
        for _ in range(120):
            cur = world()
            dx, dy = wx - cur[0], wy - cur[1]
            d = math.hypot(dx, dy)
            if d < 2:
                return True
            step = min(20, d)
            pg.evaluate(f'() => {{ const p = window.__engine.player; p.x += {dx / d * step}; p.y += {dy / d * step}; p.z = 0; p.vz = 0 }}')
            pg.wait_for_timeout(400)
        return False

    def shoot(key, wx, wy, dist, pitch):
        if not hop(wx, wy):
            print(key, 'HOP FAIL', world()); return
        r = pg.evaluate(f'''() => {{
          const m = window.__engine.map, inf = m.inf, p = window.__engine.player
          const at = (x, y) => {{ const lx = x - inf.ox, ly = y - inf.oy
            return lx < 0 || ly < 0 || lx >= m.w || ly >= m.h ? 0 : m.tiles[ly * m.w + lx] }}
          for (const d of [{dist}, {dist} + 1, {dist} + 2]) {{
            for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]]) {{
              const tx = Math.floor({wx} + dx * d), ty = Math.floor({wy} + dy * d)
              if (at(tx, ty) !== 1) continue
              p.x = tx + 0.5 - inf.ox; p.y = ty + 0.5 - inf.oy; p.z = 0; p.vz = 0
              window.__look.yaw = Math.atan2(-({wy} + 0.5 - tx - 0.5), -({wx} + 0.5 - ty - 0.5)) + Math.PI
              window.__look.yaw = Math.atan2(-(({wy} + 0.5) - (ty + 0.5)), -(({wx} + 0.5) - (tx + 0.5))) + Math.PI
              window.__look.pitch = {pitch}
              window.__engine.dev.frozenAI = true
              return [tx, ty]
            }}
          }}
          return null
        }}''')
        pg.wait_for_timeout(600)
        print(key, 'at', r)
        pg.screenshot(path=f'.check/v54-l4-{key}.png')

    shoot('fakeup', -79, 5, 3.0, 0)
    shoot('fakedown', -88, 5, 3.0, -0.15)
    shoot('trap', 60, 69, 1.8, -0.6)
    shoot('old', -1161, -1262, 3.0, -0.15)
    b.close()
print('OK')
