# 本地字体加载验证：团体页字体渲染 + document.fonts 状态
import sys, time, subprocess
from playwright.sync_api import sync_playwright

PORT = 18508
proc = subprocess.Popen([sys.executable, '-m', 'http.server', str(PORT)], cwd='dist', stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1.0)
errors = []

with sync_playwright() as pw:
    b = pw.chromium.launch()
    pg = b.new_page(viewport={'width': 1280, 'height': 800})
    pg.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)
    pg.goto(f'http://localhost:{PORT}/', wait_until='networkidle')
    pg.wait_for_timeout(1200)
    pg.locator('button:has-text("图鉴档案")').first.click()
    pg.wait_for_timeout(500)
    pg.locator('button:has-text("团体")').first.click()
    pg.wait_for_timeout(800)
    # 触发字体加载后检查状态
    status = pg.evaluate('''() => {
      const out = {}
      for (const f of ['Fantasque Sans Mono', '未来荧黑 Extended']) {
        out[f] = [...document.fonts].filter((x) => x.family === f).map((x) => x.status)
      }
      return out
    }''')
    print('font status:', status)
    pg.screenshot(path='.check/localfonts-factions.png')
    b.close()

proc.terminate()
print('console errors:', errors if errors else 'none')
