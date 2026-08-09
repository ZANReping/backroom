# 图鉴页（Codex）两主题截图对比
import sys, time, subprocess
from playwright.sync_api import sync_playwright

PORT = 18502
proc = subprocess.Popen([sys.executable, '-m', 'http.server', str(PORT)], cwd='dist', stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1.0)

with sync_playwright() as pw:
    b = pw.chromium.launch()
    for theme in ('amber', 'liminal'):
        pg = b.new_page(viewport={'width': 1280, 'height': 800})
        pg.add_init_script(f'localStorage.setItem("br_settings", JSON.stringify({{theme:"{theme}"}}))')
        pg.goto(f'http://localhost:{PORT}/', wait_until='networkidle')
        pg.wait_for_timeout(1200)
        pg.locator('button:has-text("图鉴档案")').first.click()
        pg.wait_for_timeout(600)
        pg.screenshot(path=f'.check/codex-{theme}-1.png')
        # 切到实体分类看列表
        pg.locator('button:has-text("实体")').first.click()
        pg.wait_for_timeout(400)
        pg.screenshot(path=f'.check/codex-{theme}-2.png')
        pg.close()
    b.close()

proc.terminate()
print('done')
