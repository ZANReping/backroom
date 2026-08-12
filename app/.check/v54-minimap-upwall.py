# v54：小地图（HUD minimap）多层内部墙可见性验证
# Gemma 基地（levelDef 106）：玩家送 2F，小地图应画出该层 upWall 隔墙（#1d2b25）；1F 不回归
# 用法：cd app && python .check/v54-minimap-upwall.py（dev 服务器须已在 :3000 运行）
from playwright.sync_api import sync_playwright

WALL = '1d2b25'

def minimap_colors(pg):
    return pg.evaluate('''() => {
      const c = [...document.querySelectorAll('canvas')].find((el) => el.style.imageRendering === 'pixelated')
      if (!c) return null
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

    # 送玩家到 2F：找 m.up[i]===1 且紧邻 upWall 的格
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
    pg.evaluate(f'''() => {{
      const eng = window.__engine, p = eng.player
      p.hp = 100000; p.flashlight = false
      p.x = {pos['x']}; p.y = {pos['y']}; p.z = 3.05; p.vz = 0
      eng.dev.frozenAI = true
    }}''')
    pg.wait_for_timeout(1000)

    colors_2f = minimap_colors(pg)
    assert colors_2f, 'minimap canvas not found'
    print('2F minimap has wall color:', WALL in colors_2f, '| slab color:', '31423a' in colors_2f)
    mm = pg.locator('canvas[style*="pixelated"]').first
    box = mm.bounding_box()
    clip = {'x': max(0, box['x'] - 12), 'y': max(0, box['y'] - 12), 'width': box['width'] + 24, 'height': box['height'] + 24}
    pg.screenshot(path='.check/v54-minimap-upwall.png', clip=clip)
    print('shot 2F minimap')

    # 1F 回归：同区域送回主层（z=0）
    pg.evaluate(f'''() => {{
      const p = window.__engine.player
      p.x = {pos['x']}; p.y = {pos['y']}; p.z = 0; p.vz = 0
    }}''')
    pg.wait_for_timeout(800)
    colors_1f = minimap_colors(pg)
    print('1F minimap has wall color (should be False):', WALL in colors_1f)
    box = mm.bounding_box()
    clip = {'x': max(0, box['x'] - 12), 'y': max(0, box['y'] - 12), 'width': box['width'] + 24, 'height': box['height'] + 24}
    pg.screenshot(path='.check/v54-minimap-upwall-1f.png', clip=clip)
    print('shot 1F minimap')

    print('errors:', errors[:5])
    b.close()
print('OK')
