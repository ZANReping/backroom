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
    try: pg.locator('button[aria-label="收起开发者面板"]').first.click()
    except Exception: pass

    def world():
        return pg.evaluate('() => { const e = window.__engine; return [e.player.x + e.map.inf.ox, e.player.y + e.map.inf.oy] }')
    def hop(wx, wy):
        for _ in range(140):
            cur = world(); dx, dy = wx - cur[0], wy - cur[1]; d = math.hypot(dx, dy)
            if d < 2: return True
            step = min(20, d)
            pg.evaluate(f'() => {{ const p = window.__engine.player; p.x += {dx / d * step}; p.y += {dy / d * step}; p.z = 0; p.vz = 0 }}')
            pg.wait_for_timeout(350)
        return False

    target = None
    hops = [(0, 0)]
    for rad in range(1, 7):
        for k in range(-rad, rad + 1): hops.append((k, -rad)); hops.append((k, rad))
        for k in range(-rad + 1, rad): hops.append((-rad, k)); hops.append((rad, k))
    for (hx, hy) in hops:
        hop(hx * 32 + 16, hy * 32 + 16)
        pg.wait_for_timeout(300)
        t = pg.evaluate('''() => {
          const m = window.__engine.map, inf = m.inf
          const at = (x, y) => { const lx = x - inf.ox, ly = y - inf.oy
            return lx < 0 || ly < 0 || lx >= m.w || ly >= m.h ? -1 : (m.outdoor[ly * m.w + lx] === 1 ? 2 : m.tiles[ly * m.w + lx]) }
          for (const s of m.structures) {
            if (s.kind !== 'glasswin' || !s.data || !s.data.rain) continue
            const wx = s.x + inf.ox, wy = s.y + inf.oy
            // 四邻找虚空侧与房间侧
            for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
              if (at(wx + dx, wy + dy) === 2 && at(wx - dx, wy - dy) === 1)
                return { wx, wy, dx, dy } // 房间侧 = (-dx,-dy)
            }
          }
          return null
        }''')
        if t: target = t; break
    print('window', target)
    if target:
        sx = target['wx'] + 0.5 - target['dx'] * 1.3
        sy = target['wy'] + 0.5 - target['dy'] * 1.3
        hop(sx, sy)
        pg.evaluate(f'''() => {{
          const inf = window.__engine.map.inf, p = window.__engine.player
          p.x = {sx} - inf.ox; p.y = {sy} - inf.oy; p.z = 0; p.vz = 0
          window.__look.yaw = Math.atan2(-({target['dy']}), -({target['dx']}))
          window.__look.pitch = 0.0
          window.__engine.dev.frozenAI = true
        }}''')
        pg.wait_for_timeout(900)
        print('pos', world())
        pg.screenshot(path='.check/v54-l4-void-rain.png')
    b.close()
print('OK')
