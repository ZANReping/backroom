from playwright.sync_api import sync_playwright
import json, math
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
    pg.wait_for_timeout(1500)

    # 螺旋跳 chunk 收集目标（变体 + 出口）
    targets = {}  # name -> {wx, wy} 世界坐标（瓦片）
    want_v = {'officehall', 'open', 'windowview', 'smallrooms'}
    want_e = {'elevatorshaft': 'elev', 'fakestairsup': 'fakeup', 'fakestairsdown': 'fakedown', 'oldstairs': 'old', 'trapdoor': 'trap'}
    hops = [(0, 0)]
    for rad in range(1, 7):
        for k in range(-rad, rad + 1):
            hops.append((k, -rad)); hops.append((k, rad))
        for k in range(-rad + 1, rad):
            hops.append((-rad, k)); hops.append((rad, k))
    for (hx, hy) in hops:
        if len([k for k in want_v if k in targets]) == 4 and len([k for k in want_e.values() if k in targets]) == 5:
            break
        pg.evaluate(f'''() => {{
          const p = window.__engine.player
          p.x = {hx} * 32 + 16; p.y = {hy} * 32 + 16; p.z = 0; p.vz = 0
        }}''')
        pg.wait_for_timeout(900)
        got = pg.evaluate('''() => {
          const m = window.__engine.map, inf = m.inf
          const vs = []
          for (const c of inf.chunks.values()) vs.push({ v: c.variant, cx: c.cx, cy: c.cy })
          const es = m.exits.map((e) => ({ k: e.def.kind, x: e.x + inf.ox, y: e.y + inf.oy }))
          return { vs, es }
        }''')
        for c in got['vs']:
            if c['v'] in want_v and c['v'] not in targets:
                targets[c['v']] = {'wx': c['cx'] * 32 + 16, 'wy': c['cy'] * 32 + 16}
        for e in got['es']:
            if e['k'] in want_e and want_e[e['k']] not in targets:
                targets[want_e[e['k']]] = {'wx': e['x'], 'wy': e['y']}
    print('targets:', json.dumps(targets))

    def goto_face(wx, wy, dist=2.5, pitch=0):
        # 站到目标旁 dist 格的地板处并面向目标
        r = pg.evaluate(f'''() => {{
          const m = window.__engine.map, inf = m.inf, p = window.__engine.player
          const at = (x, y) => {{ const lx = x - inf.ox, ly = y - inf.oy
            return lx < 0 || ly < 0 || lx >= m.w || ly >= m.h ? 0 : m.tiles[ly * m.w + lx] }}
          for (const d of [{dist}, {dist + 1}]) {{
            for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]]) {{
              const tx = Math.floor({wx} + dx * d), ty = Math.floor({wy} + dy * d)
              if (at(tx, ty) !== 1) continue
              const steps = Math.max(Math.abs(dx), Math.abs(dy))
              let clear = true
              for (let i2 = 1; i2 < d; i2++) if (at(Math.floor({wx} + dx * i2 / steps * (steps - 0)), Math.floor({wy} + dy * i2 / steps)) !== 1) {{ clear = false; break }}
              if (!clear) continue
              p.x = tx + 0.5; p.y = ty + 0.5; p.z = 0; p.vz = 0
              const yaw = Math.atan2(-({wy} - p.y), -({wx} - p.x))
              window.__look.yaw = yaw + Math.PI; window.__look.pitch = {pitch}
              return [p.x, p.y]
            }}
          }}
          return null
        }}''')
        pg.wait_for_timeout(700)
        return r

    # 变体截图：站到目标 chunk 中心（少量挪动即可），朝东拍
    for v in ['officehall', 'open', 'windowview', 'smallrooms']:
        if v not in targets: print('MISSING variant', v); continue
        t = targets[v]
        pg.evaluate(f'''() => {{
          const p = window.__engine.player
          p.x = {t['wx']}; p.y = {t['wy']}; p.z = 0; p.vz = 0
        }}''')
        pg.wait_for_timeout(1000)
        # 朝最开阔方向看（四向取地板延伸最远者）
        yaw = pg.evaluate('''() => {
          const m = window.__engine.map, inf = m.inf, p = window.__engine.player
          const at = (x, y) => { const lx = Math.floor(x) - inf.ox, ly = Math.floor(y) - inf.oy
            return lx < 0 || ly < 0 || lx >= m.w || ly >= m.h ? 0 : m.tiles[ly * m.w + lx] }
          let best = 0, bd = -1
          for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
            let d = 0
            while (d < 14 && at(p.x + dx * (d + 1), p.y + dy * (d + 1)) === 1) d++
            if (d > bd) { bd = d; best = Math.atan2(-dy, -dx) }
          }
          window.__look.yaw = best + Math.PI; window.__look.pitch = 0
          return best
        }''')
        pg.wait_for_timeout(500)
        pg.screenshot(path=f'.check/v54-l4-{v}.png')
        print('shot', v, 'at', t, 'yaw', yaw)

    # 出口截图
    for key, dist, pitch in [('elev', 2.5, 0), ('fakeup', 3.0, 0), ('fakedown', 3.0, -0.15), ('old', 3.0, -0.15), ('trap', 1.8, -0.6)]:
        if key not in targets: print('MISSING exit', key); continue
        t = targets[key]
        r = goto_face(t['wx'], t['wy'], dist, pitch)
        print('shot', key, 'player at', r)
        pg.screenshot(path=f'.check/v54-l4-{key}.png')
    b.close()
print('OK')
