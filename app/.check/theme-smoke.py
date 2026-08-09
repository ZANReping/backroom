# 主题冒烟：琥珀（默认）与阈限（liminal）标题屏 + 设置面板主题页截图
import sys, time, subprocess
from playwright.sync_api import sync_playwright

PORT = 18499
proc = subprocess.Popen([sys.executable, '-m', 'http.server', str(PORT)], cwd='dist', stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1.0)
errors = []

with sync_playwright() as pw:
    b = pw.chromium.launch()
    pg = b.new_page(viewport={'width': 1280, 'height': 800})
    pg.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)
    pg.goto(f'http://localhost:{PORT}/', wait_until='networkidle')
    pg.wait_for_timeout(1500)
    pg.screenshot(path='.check/theme-amber-title.png')

    # 打开设置 → 主题页
    pg.locator('button:has-text("设置")').first.click()
    pg.wait_for_timeout(400)
    pg.locator('button:has-text("主题")').first.click()
    pg.wait_for_timeout(300)
    pg.screenshot(path='.check/theme-amber-settings.png')

    # 切换到阈限
    pg.locator('button:has-text("阈限")').last.click()
    pg.wait_for_timeout(400)
    pg.screenshot(path='.check/theme-liminal-settings.png')
    theme = pg.evaluate('document.documentElement.dataset.theme')
    print('data-theme =', theme)
    pg.locator('button:has-text("关闭")').first.click()
    pg.wait_for_timeout(400)
    pg.screenshot(path='.check/theme-liminal-title.png')

    # 刷新后应保持
    pg.reload(wait_until='networkidle')
    pg.wait_for_timeout(1200)
    print('after reload data-theme =', pg.evaluate('document.documentElement.dataset.theme'))
    b.close()

proc.terminate()
print('console errors:', errors if errors else 'none')
