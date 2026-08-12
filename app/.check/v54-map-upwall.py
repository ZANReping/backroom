# v54：大地图多层视图——上层内部墙（upWall/upWall2）可见性验证
# Gemma 基地（levelDef 106）：玩家送 2F，开大地图（M），截 2F 视图 + 1F 回归视图
# 并像素级断言：2F 视图画布含墙体色 #1d2b25，1F 视图不含
# 用法：cd app && python .check/v54-map-upwall.py（dev 服务器须已在 :3000 运行）
from playwright.sync_api import sync_playwright

WALL = '1d2b25'  # #1d2b25

def canvas_colors(pg):
    return pg.evaluate('''() => {
      const c = [...document.querySelectorAll('canvas')]
        .filter((el) => el.style.imageRendering === 'pixelated')
        .sort((a, b2) => b2.width - a.width)[0]
      const g = c.getContext('2d')
      const d = g.getImageData(0, 0, c.width, c.height).data
      const set = new Set()
      for (let i = 0; i < d.length; i += 4) {
        if (d[i + 3] < 255) continue
        set.add(((1 << 24) | (d[i] << 16) | (d[i + 1] << 8) | d[i + 2]).toString(16).slice(1))
      }
      return [...set]
    }''')

with sync_playwright() as pw:
    b = pw.chromium.launch()
    pg = b.new_page(viewport={'width': 1280, 'height': 800})
    errors = []
    pg.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)
    pg.on('pageerror', lambda e: errors.append(str(e)))
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
    try:
        pg.locator('button[aria-label="收起开发者面板"]').first.click()
        pg.wait_for_timeout(300)
    except Exception:
        pass

    pg.evaluate("() => window.__engine.devJumpOutpost('gamma')")
    for _ in range(25):
        pg.wait_for_timeout(400)
        if pg.evaluate('window.__engine.levelDef && window.__engine.levelDef.id') == 106 and not pg.evaluate('!!window.__engine.transition'):
            break

    # 送玩家到 2F：找 m.up[i]===1 且紧邻 upWall 的格（保证 2F 视图中心附近就有隔墙）
    pos = pg.evaluate('''() => {
      const eng = window.__engine, m = eng.map
      for (let y = 1; y < m.h - 1; y++) for (let x = 1; x < m.w - 1; x++) {
        const i = y * m.w + x
        if (m.up[i] !== 1 || m.upWall[i] === 1) continue
        if (m.upWall[i + 1] === 1 || m.upWall[i - 1] === 1 || m.upWall[i + m.w] === 1 || m.upWall[i - m.w] === 1)
          return { x: x + 0.5, y: y + 0.5 }
      }
      return null
    }''')
    assert pos, 'no 2F spot near upWall found'
    print('2F spot:', pos)
    dbg = pg.evaluate('''() => {
      const eng = window.__engine, m = eng.map
      let wAll = 0, wExp = 0
      for (let i = 0; i < m.w * m.h; i++) if (m.upWall[i] === 1) { wAll++; if (eng.explored[i]) wExp++ }
      return { wAll, wExp, floors: m.floors }
    }''')
    print('upWall cells:', dbg)
    pg.evaluate(f'''() => {{
      const eng = window.__engine, p = eng.player
      p.hp = 100000; p.flashlight = false
      p.x = {pos['x']}; p.y = {pos['y']}; p.z = 3.05; p.vz = 0
      eng.dev.frozenAI = true
    }}''')
    pg.wait_for_timeout(800)

    # 开大地图（M），默认跟随玩家所在层 = 2F 视图；放大让隔墙清晰
    pg.keyboard.press('m')
    pg.wait_for_timeout(900)
    plus = pg.locator('button.menu-btn:has-text("＋")').first
    for _ in range(5):  # 4 -> 9
        plus.click()
        pg.wait_for_timeout(250)
    pg.wait_for_timeout(400)
    colors_2f = canvas_colors(pg)
    print('2F has wall color:', WALL in colors_2f, '| 2F has slab color:', '31423a' in colors_2f)
    pg.screenshot(path='.check/v54-map-upwall.png')
    print('shot 2F view')

    # 1F 回归
    pg.locator('button[title="查看 1F"]').first.click()
    pg.wait_for_timeout(500)
    colors_1f = canvas_colors(pg)
    print('1F has wall color (should be False):', WALL in colors_1f, '| 1F has floor color:', '3a3423' in colors_1f)
    pg.screenshot(path='.check/v54-map-upwall-1f.png')
    print('shot 1F view')

    print('errors:', errors[:5])
    b.close()
print('OK')
