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

    def wait_level(lvl):
        for _ in range(25):
            pg.wait_for_timeout(400)
            if pg.evaluate('window.__engine.player.level') == lvl and not pg.evaluate('!!window.__engine.transition'):
                return True
        return False

    # ---- Alpha 101 墙体窗（西侧 1.2m 正视；站位逐格校验是地板）----
    pg.evaluate('() => window.__engine.devJumpOutpost(\'alpha\')')
    wait_level(101)
    r = pg.evaluate('''() => {
      const m = window.__engine.map
      const s = m.structures.find((s2) => s2.kind === 'wallwindow')
      const fl = (x, y) => m.tiles[y * m.w + x] === 1
      const p = window.__engine.player
      let placed = null
      for (const d of [1.2, 1.6, 2.0]) {
        const tx = Math.floor(s.x + 0.5 - d), ty = Math.floor(s.y + 0.5)
        if (fl(tx, ty)) { p.x = s.x + 0.5 - d; p.y = s.y + 0.5; placed = [p.x, p.y]; break }
      }
      p.z = 0; p.vz = 0
      window.__look.yaw = Math.PI; window.__look.pitch = 0
      window.__engine.dev.frozenAI = true
      return { s: [s.x, s.y], placed }
    }''')
    pg.wait_for_timeout(500)
    r2 = pg.evaluate('() => [window.__engine.player.x, window.__engine.player.y]')
    print('alpha window at', r, 'player now', r2)
    pg.screenshot(path='.check/v54-ww-alpha.png')

    # ---- L4 酒店门双面把手：找一扇非双开门，两侧地板各拍一张 ----
    pg.evaluate('() => window.__engine.devJump(4)')
    wait_level(4)
    try: pg.locator('button[aria-label="收起开发者面板"]').first.click()
    except Exception: pass
    info = pg.evaluate('''() => {
      const m = window.__engine.map
      const fl = (x, y) => m.tiles[y * m.w + x] === 1
      const d = m.structures.find((s) => s.kind === 'hoteldoor' && !s.data?.dbl && !s.data?.sealed)
      if (!d) return null
      const cx = d.x + 0.5, cy = d.y + 0.5
      // 通道轴：两侧地板的方向
      const ns = fl(d.x, d.y - 1) && fl(d.x, d.y + 1)
      const ew = fl(d.x - 1, d.y) && fl(d.x + 1, d.y)
      return { d: [d.x, d.y], ns, ew, locked: !!d.data?.locked }
    }''')
    print('L4 door', json.dumps(info))
    if info and (info['ns'] or info['ew']):
        dx, dy = info['d']
        cx, cy = dx + 0.5, dy + 0.5
        if info['ns']:
            sides = [(cx, cy - 1.6, -1.5707963), (cx, cy + 1.6, 1.5707963)]  # 从北看南 / 从南看北
        else:
            sides = [(cx - 1.6, cy, 0.0), (cx + 1.6, cy, 3.14159265)]
        for i, (px, py, yaw) in enumerate(sides):
            pg.evaluate(f'''() => {{
              const p = window.__engine.player
              p.x = {px}; p.y = {py}; p.z = 0; p.vz = 0
              window.__look.yaw = {yaw}; window.__look.pitch = 0
              window.__engine.dev.frozenAI = true
            }}''')
            pg.wait_for_timeout(500)
            print('door side', i, 'player at', pg.evaluate('() => [window.__engine.player.x.toFixed(2), window.__engine.player.y.toFixed(2)]'))
            pg.screenshot(path=f'.check/v54-door-{"ab"[i]}.png')
    b.close()
print('OK')
