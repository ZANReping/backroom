# v54：多层地图楼梯标记验证——大地图 + 小地图在楼梯格画亮青三角（#4de3ff，指向上行方向）
# gamma（106）：1F 大地图 → 2F 大地图 + 2F 小地图；el3a（105）：1F/2F 大地图回归
# 玩家传送到楼梯间旁再开图，保证标记在视野中心；颜色断言带容差（三角边抗锯齿）
# 用法：cd app && python .check/v54-map-stairs.py（dev 服务器须已在 :3000 运行）
from playwright.sync_api import sync_playwright

STAIR_RGB = (0x4d, 0xe3, 0xff)

def canvas_has_color(pg, biggest, rgb, tol=40):
    return pg.evaluate('''([biggest, rgb, tol]) => {
      const cs = [...document.querySelectorAll('canvas')].filter((el) => el.style.imageRendering === 'pixelated')
      if (!cs.length) return null
      cs.sort((a, b) => biggest ? b.width - a.width : a.width - b.width)
      const c = cs[0]
      const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data
      for (let i = 0; i < d.length; i += 4) {
        if (Math.abs(d[i] - rgb[0]) <= tol && Math.abs(d[i + 1] - rgb[1]) <= tol && Math.abs(d[i + 2] - rgb[2]) <= tol) return true
      }
      return false
    }''', [biggest, list(rgb), tol])

def enter_game(pg):
    pg.goto('http://localhost:3000/', wait_until='networkidle')
    pg.wait_for_timeout(1500)
    pg.locator('button:has-text("开始游戏")').first.click()
    pg.wait_for_timeout(9000)
    sk = pg.locator('text=进入').first
    if sk.count():
        try: sk.click()
        except Exception: pass
    pg.wait_for_timeout(2000)
    try:
        pg.locator('button[aria-label="收起开发者面板"]').first.click()
        pg.wait_for_timeout(300)
    except Exception:
        pass

def jump(pg, outpost, lid):
    pg.evaluate(f"() => window.__engine.devJumpOutpost('{outpost}')")
    for _ in range(25):
        pg.wait_for_timeout(400)
        if pg.evaluate('window.__engine.levelDef && window.__engine.levelDef.id') == lid and not pg.evaluate('!!window.__engine.transition'):
            return
    raise RuntimeError(f'jump to {outpost} timeout')

def goto_stair(pg, band):
    """把玩家传送到服务于 band 层的某个楼梯格旁（同层可站格），返回楼梯格坐标。"""
    return pg.evaluate('''(band) => {
      const eng = window.__engine, m = eng.map, p = eng.player
      const walk = (i) => band === 2 ? m.up2[i] === 1 : band === 1 ? m.up[i] === 1 : m.tiles[i] === 1
      for (let y = 1; y < m.h - 1; y++) for (let x = 1; x < m.w - 1; x++) {
        const i = y * m.w + x
        if ((m.stair[i] & 7) === 0 || !walk(i)) continue
        for (const [dx, dy] of [[2, 0], [-2, 0], [0, 2], [0, -2], [2, 2], [-2, -2]]) {
          const nx = x + dx, ny = y + dy, ni = ny * m.w + nx
          if (nx < 1 || ny < 1 || nx >= m.w - 1 || ny >= m.h - 1) continue
          if (!walk(ni) || (m.stair[ni] & 7) !== 0) continue
          if (band === 1 && m.upWall[ni] === 1) continue
          if (band === 2 && m.upWall2[ni] === 1) continue
          p.x = nx + 0.5; p.y = ny + 0.5; p.z = band * 3 + 0.05; p.vz = 0
          return { sx: x, sy: y, dir: m.stair[i] & 7 }
        }
      }
      return null
    }''', band)

def stair_dbg(pg):
    return pg.evaluate('''() => {
      const eng = window.__engine, m = eng.map
      let all = 0, exp = 0, onUp = 0
      for (let i = 0; i < m.w * m.h; i++) if ((m.stair[i] & 7) !== 0) {
        all++; if (eng.explored[i]) exp++; if (m.up[i] === 1) onUp++
      }
      return { all, exp, onUp, floors: m.floors }
    }''')

def bigmap_shot(pg, path, zoom_clicks=3):
    pg.keyboard.press('m')
    pg.wait_for_timeout(900)
    plus = pg.locator('button.menu-btn:has-text("＋")').first
    for _ in range(zoom_clicks):
        plus.click()
        pg.wait_for_timeout(250)
    pg.wait_for_timeout(400)
    has = canvas_has_color(pg, True, STAIR_RGB)
    pg.screenshot(path=path)
    pg.keyboard.press('Escape')
    pg.wait_for_timeout(400)
    return has

with sync_playwright() as pw:
    b = pw.chromium.launch()
    pg = b.new_page(viewport={'width': 1280, 'height': 800})
    errors = []
    pg.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)
    pg.on('pageerror', lambda e: errors.append(str(e)))
    pg.add_init_script('localStorage.clear(); localStorage.setItem("br_settings", JSON.stringify({devMode:true, fogOfWar:false, grain:false}))')
    enter_game(pg)

    # ---------- gamma ----------
    jump(pg, 'gamma', 106)
    print('gamma stairs:', stair_dbg(pg))
    pg.evaluate('() => { const p = window.__engine.player; p.hp = 100000; p.flashlight = false; window.__engine.dev.frozenAI = true }')

    st = goto_stair(pg, 0)
    print('gamma 1F stair:', st)
    pg.wait_for_timeout(600)
    print('gamma 1F bigmap stair:', bigmap_shot(pg, '.check/v54-map-stairs-gamma-1f.png'))

    st = goto_stair(pg, 1)
    print('gamma 2F stair:', st)
    pg.wait_for_timeout(900)
    # 2F 小地图（游戏画面内）
    print('gamma 2F minimap stair:', canvas_has_color(pg, False, STAIR_RGB))
    mm = pg.locator('canvas[style*="pixelated"]').first
    box = mm.bounding_box()
    pg.screenshot(path='.check/v54-map-stairs-gamma-2f-minimap.png',
                  clip={'x': max(0, box['x'] - 12), 'y': max(0, box['y'] - 12), 'width': box['width'] + 24, 'height': box['height'] + 24})
    print('gamma 2F bigmap stair:', bigmap_shot(pg, '.check/v54-map-stairs-gamma-2f.png'))

    # ---------- el3a ----------
    jump(pg, 'el3a', 105)
    print('el3a stairs:', stair_dbg(pg))
    pg.evaluate('() => { const p = window.__engine.player; p.hp = 100000; p.flashlight = false; window.__engine.dev.frozenAI = true }')

    st = goto_stair(pg, 0)
    print('el3a 1F stair:', st)
    pg.wait_for_timeout(600)
    print('el3a 1F bigmap stair:', bigmap_shot(pg, '.check/v54-map-stairs-el3a-1f.png'))

    st = goto_stair(pg, 1)
    print('el3a 2F stair:', st)
    pg.wait_for_timeout(900)
    print('el3a 2F bigmap stair:', bigmap_shot(pg, '.check/v54-map-stairs-el3a-2f.png'))

    print('errors:', errors[:5])
    b.close()
print('OK')
