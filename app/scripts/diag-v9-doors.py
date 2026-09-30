# v9 门朝向目视检查：L5 客房门（水平墙线，应面朝走廊）与楼梯间双开门（垂直墙线，应面朝走廊）
import sys, time, subprocess
from playwright.sync_api import sync_playwright

PORT = 18343
proc = subprocess.Popen([sys.executable, '-m', 'http.server', str(PORT)], cwd='dist', stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1.0)
errors = []

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
    sk = page.locator('text=进入').first
    if sk.count():
        try: sk.click()
        except Exception: pass
    page.wait_for_timeout(1500)
    page.wait_for_function('() => window.__engine && !window.__engine.paused && !!window.__engine.map', timeout=15000)
    page.evaluate('window.__engine.dev.god = true')

    page.evaluate('window.__engine.devJump(5)')
    page.wait_for_timeout(800)
    sk = page.locator('text=进入').first
    if sk.count():
        try: sk.click()
        except Exception: pass
    page.wait_for_timeout(800)

    def look_at(px, py, tx, ty, name):
        page.evaluate(f'''() => {{
          const eng = window.__engine, look = window.__look
          eng.player.x = {px}; eng.player.y = {py}
          look.yaw = Math.atan2(-({tx} - {px}), -({ty} - {py})); look.pitch = 0
        }}''')
        page.wait_for_timeout(500)
        page.screenshot(path=f'/tmp/v9_door_{name}.png')

    # 客房门（北排，门在 y=9 水平墙线）：站在走廊 y=11 看北面的门
    door = page.evaluate('''() => {
      const m = window.__engine.map
      const d = m.structures.find(s => s.kind === 'hoteldoor' && s.y === 9)
      return d ? { x: d.x, y: d.y } : null
    }''')
    if door:
        look_at(door['x'] + 0.5, 11.5, door['x'] + 0.5, 9.5, 'guest_front')
    # 楼梯间双开门（x=70 垂直墙线 y10/11）：站在走廊 x=68 看东面
    look_at(67.5, 10.5, 70.5, 10.5, 'dbl_front')
    # 宴会厅双开门（y=20 水平墙线 x11/12）：站宴会厅内看北面
    look_at(11.5, 23.5, 11.5, 20.0, 'banquet_front')
    # 开门动画：把客房门打开看铰链
    page.evaluate('''() => {
      const m = window.__engine.map
      const d = m.structures.find(s => s.kind === 'hoteldoor' && s.y === 9)
      d.solid = false; d.data = { ...d.data, open: 1 }
    }''')
    page.wait_for_timeout(900)
    if door:
        look_at(door['x'] + 0.5, 11.5, door['x'] + 0.5, 9.5, 'guest_open')
    browser.close()
proc.terminate()
print('ERRORS:' if errors else 'no console errors')
for e in errors[:10]: print(' ', e)
