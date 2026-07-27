# v11 门浮空部件专项：站 2.5m 外正对客房门，关→开→关截图
import sys, time, subprocess
from playwright.sync_api import sync_playwright

PORT = 18356
proc = subprocess.Popen([sys.executable, '-m', 'http.server', str(PORT)], cwd='dist', stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1.0)
errors = []
with sync_playwright() as pw:
    browser = pw.chromium.launch()
    ctx = browser.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, is_mobile=True, has_touch=True)
    page = ctx.new_page()
    page.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)
    page.on('pageerror', lambda e: errors.append(f'PAGEERROR {e}'))
    page.add_init_script('localStorage.setItem("br_settings", JSON.stringify({devMode:true}))')
    page.goto(f'http://localhost:{PORT}/', wait_until='networkidle')
    page.wait_for_timeout(1200)
    btn = page.locator('text=坠入后室').first
    if btn.count(): btn.tap()
    else: page.locator('button').first.tap()
    page.wait_for_timeout(2000)
    sk = page.locator('text=进入').first
    if sk.count():
        try: sk.tap()
        except Exception: pass
    page.wait_for_function('() => window.__engine && !window.__engine.paused && !!window.__engine.map', timeout=15000)
    page.evaluate('window.__engine.devJump(5)')
    page.wait_for_timeout(2500)
    info = page.evaluate('''() => {
      const eng = window.__engine, m = eng.map
      // 北排客房门（y=9，走廊在 y=10.5）：站走廊里距门 2.5m 朝北看
      const s = m.structures.find(s => s.kind === 'hoteldoor' && !s.data?.dbl && s.y === 9)
      if (!s) return null
      s.data.open = 0
      eng.player.x = s.x + 0.5; eng.player.y = s.y + 3.0; eng.player.z = 0
      eng.player.flashlight = true; eng.player.battery = 100
      eng.dev.god = true; eng.dev.invisible = true
      window.__look.yaw = 0; window.__look.pitch = 0.05
      return { x: s.x, y: s.y }
    }''')
    print('door:', info)
    page.wait_for_timeout(1000)
    page.screenshot(path='/tmp/v11_door2_closed.png')
    page.evaluate('''() => {
      const m = window.__engine.map
      const s = m.structures.find(s => s.kind === 'hoteldoor' && !s.data?.dbl && s.y === 9)
      s.data.open = 1
    }''')
    page.wait_for_timeout(1500)
    page.screenshot(path='/tmp/v11_door2_open.png')
    page.evaluate('''() => {
      const m = window.__engine.map
      const s = m.structures.find(s => s.kind === 'hoteldoor' && !s.data?.dbl && s.y === 9)
      s.data.open = 0
    }''')
    page.wait_for_timeout(1500)
    page.screenshot(path='/tmp/v11_door2_reclosed.png')
    browser.close()
print('console errors:', errors)
proc.terminate()
