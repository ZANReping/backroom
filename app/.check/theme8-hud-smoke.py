# 新主题游戏内 HUD 抽查（database / fandom / dark-liminal）
import sys, time, subprocess
from playwright.sync_api import sync_playwright

PORT = 18504
proc = subprocess.Popen([sys.executable, '-m', 'http.server', str(PORT)], cwd='dist', stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1.0)
errors = []

with sync_playwright() as pw:
    b = pw.chromium.launch()
    for t in ('database', 'fandom', 'dark-liminal'):
        pg = b.new_page(viewport={'width': 1280, 'height': 800})
        pg.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)
        pg.add_init_script(f'localStorage.setItem("br_settings", JSON.stringify({{theme:"{t}"}}))')
        pg.goto(f'http://localhost:{PORT}/', wait_until='networkidle')
        pg.wait_for_timeout(1200)
        pg.locator('button:has-text("开始游戏")').first.click()
        pg.wait_for_timeout(2500)
        sk = pg.locator('text=进入').first
        if sk.count():
            try: sk.click()
            except Exception: pass
        pg.wait_for_timeout(2500)
        pg.keyboard.down('w'); pg.wait_for_timeout(700); pg.keyboard.up('w')
        pg.wait_for_timeout(500)
        pg.screenshot(path=f'.check/t8-hud-{t}.png')
        pg.close()
    b.close()

proc.terminate()
print('console errors:', errors if errors else 'none')

from PIL import Image
img = Image.new('RGB', (1920, 400))
for i, t in enumerate(('database', 'fandom', 'dark-liminal')):
    img.paste(Image.open(f'.check/t8-hud-{t}.png').resize((640, 400)), (i * 640, 0))
img.save('.check/t8-hud-sheet.png')
print('sheet done')
