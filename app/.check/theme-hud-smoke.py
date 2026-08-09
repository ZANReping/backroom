# 阈限主题游戏内 HUD 截图
import sys, time, subprocess
from playwright.sync_api import sync_playwright

PORT = 18501
proc = subprocess.Popen([sys.executable, '-m', 'http.server', str(PORT)], cwd='dist', stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1.0)
errors = []

with sync_playwright() as pw:
    b = pw.chromium.launch()
    pg = b.new_page(viewport={'width': 1280, 'height': 800})
    pg.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)
    pg.add_init_script('localStorage.setItem("br_settings", JSON.stringify({theme:"liminal", devMode:true}))')
    pg.goto(f'http://localhost:{PORT}/', wait_until='networkidle')
    pg.wait_for_timeout(1200)
    pg.locator('button:has-text("开始游戏")').first.click()
    pg.wait_for_timeout(2500)
    sk = pg.locator('text=进入').first
    if sk.count():
        try: sk.click()
        except Exception: pass
    pg.wait_for_timeout(2500)
    # 走两步触发日志
    pg.keyboard.down('w'); pg.wait_for_timeout(800); pg.keyboard.up('w')
    pg.wait_for_timeout(600)
    pg.screenshot(path='.check/theme-liminal-hud.png')
    b.close()

proc.terminate()
print('console errors:', errors if errors else 'none')
