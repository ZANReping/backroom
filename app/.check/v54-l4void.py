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
        for _ in range(140):
            cur = world()
            dx, dy = wx - cur[0], wy - cur[1]
            d = math.hypot(dx, dy)
            if d < 2: return True
            step = min(20, d)
            pg.evaluate(f'() => {{ const p = window.__engine.player; p.x += {dx / d * step}; p.y += {dy / d * step}; p.z = 0; p.vz = 0 }}')
            pg.wait_for_timeout(350)
        return False

    # 逐 chunk 螺旋搜带雨窗（glasswin data.rain）
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
          const s = m.structures.find((s2) => s2.kind === 'glasswin' && s2.data && s2.data.rain)
          return s ? { x: s.x + inf.ox, y: s.y + inf.oy, deg: s.data.deg } : null
        }''')
        if t: target = t; break
    print('window at', target, 'player', world())
    if target:
        th = target['deg'] * math.pi / 180
        dx, dy = math.sin(th), math.cos(th)  # 条带方向
        sx, sy = target['x'] + 0.5 - dx * 2.2, target['y'] + 0.5 - dy * 2.2
        hop(sx, sy)
        pg.evaluate(f'''() => {{
          const inf = window.__engine.map.inf, p = window.__engine.player
          p.x = {sx} - inf.ox; p.y = {sy} - inf.oy; p.z = 0; p.vz = 0
          window.__look.yaw = Math.atan2(-({dy}), -({dx}))
          window.__look.pitch = 0.02
          window.__engine.dev.frozenAI = true
        }}''')
        pg.wait_for_timeout(900)
        print('final pos', world())
        pg.screenshot(path='.check/v54-l4-void-rain.png')
    b.close()
print('OK')
