# v9 诊断：区域 pop-in 排查（只报告，不断言）
# 远距离 vs 走近截图对比，人眼检查几何是否突然才出现
import sys, time, subprocess
from playwright.sync_api import sync_playwright

PORT = 18341
proc = subprocess.Popen([sys.executable, '-m', 'http.server', str(PORT)], cwd='dist', stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1.0)
errors = []

def dismiss_intro(page):
    page.wait_for_timeout(700)
    sk = page.locator('text=进入').first
    if sk.count():
        try: sk.click()
        except Exception: pass
    page.wait_for_timeout(700)

with sync_playwright() as pw:
    browser = pw.chromium.launch()
    ctx = browser.new_context(viewport={'width': 1280, 'height': 800})
    page = ctx.new_page()
    page.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)
    page.on('pageerror', lambda e: errors.append(f'PAGEERROR {e}'))
    page.goto(f'http://localhost:{PORT}/', wait_until='networkidle')
    page.wait_for_timeout(1500)
    page.mouse.click(640, 400)
    page.wait_for_timeout(300)
    btn = page.locator('text=坠入后室').first
    if btn.count():
        btn.click()
    else:
        page.locator('button').first.click()
    page.wait_for_timeout(2500)
    dismiss_intro(page)
    page.wait_for_timeout(1500)
    page.wait_for_function('() => window.__engine && !window.__engine.paused && !!window.__engine.map', timeout=15000)
    page.evaluate('window.__engine.dev.god = true')
    print('entered game')

    # 每层：找一条 14 格直走廊，远看→走近对比
    for lvl in [0, 1, 2, 3, 4, 5]:
        page.evaluate(f'window.__engine.devJump({lvl})')
        dismiss_intro(page)
        info = page.evaluate('''() => {
          const eng = window.__engine, m = eng.map
          const fl = (x, y) => x>=0&&y>=0&&x<m.w&&y<m.h&&m.tiles[y*m.w+x]===1
          for (let y = 1; y < m.h - 1; y++)
            for (let x = 1; x < m.w - 15; x++) {
              let ok = true
              for (let i = 0; i <= 14; i++) if (!fl(x+i, y)) { ok = false; break }
              if (ok) return { x: x + 0.5, y: y + 0.5, tx: x + 14.5, ty: y + 0.5 }
            }
          return null
        }''')
        if not info:
            print(f'L{lvl}: no corridor found'); continue
        page.evaluate(f'''() => {{
          const eng = window.__engine, look = window.__look
          eng.player.x = {info['x']}; eng.player.y = {info['y']}
          const dx = {info['tx']} - eng.player.x, dy = {info['ty']} - eng.player.y
          look.yaw = Math.atan2(-dx, -dy); look.pitch = 0
        }}''')
        page.wait_for_timeout(600)
        page.screenshot(path=f'/tmp/v9_pop_l{lvl}_far.png')
        page.evaluate(f'''() => {{
          const eng = window.__engine
          const dx = {info['tx']} - eng.player.x, dy = {info['ty']} - eng.player.y
          const len = Math.hypot(dx, dy)
          eng.player.x += dx / len * 10; eng.player.y += dy / len * 10
        }}''')
        page.wait_for_timeout(600)
        page.screenshot(path=f'/tmp/v9_pop_l{lvl}_near.png')
        print(f'L{lvl}: corridor shots saved')

    # L5 庭院（玻璃门内侧远观庭院）
    page.evaluate('window.__engine.devJump(5)')
    dismiss_intro(page)
    page.evaluate('''() => {
      const eng = window.__engine, m = eng.map, look = window.__look
      const d = m.structures.find(s => s.kind === 'glassdoor')
      if (d) {
        eng.player.x = d.x + 0.5; eng.player.y = d.y - 2.5
        look.yaw = Math.atan2(-(d.x + 0.5 - eng.player.x), -(d.y + 8 - eng.player.y))
        look.pitch = 0
      }
    }''')
    page.wait_for_timeout(700)
    page.screenshot(path='/tmp/v9_pop_l5_court_far.png')
    page.evaluate('''() => {
      const eng = window.__engine, m = eng.map
      const d = m.structures.find(s => s.kind === 'glassdoor')
      d.solid = false; d.data = { ...d.data, open: 1 }
      eng.player.y = d.y + 3.0
    }''')
    page.wait_for_timeout(700)
    page.screenshot(path='/tmp/v9_pop_l5_court_in.png')
    print('L5 courtyard shots saved')

    browser.close()
proc.terminate()
print('ERRORS:' if errors else 'no console errors')
for e in errors[:10]: print(' ', e)
