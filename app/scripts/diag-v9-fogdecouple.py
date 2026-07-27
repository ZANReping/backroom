# v9 诊断：验证 3D 渲染与 explored/visible（战争迷雾）解耦
# 同机位对比：正常 vs explored/visible 全清零 vs 全置 1 —— 3D 画面应逐像素一致（仅小地图变）
import sys, time, subprocess
from playwright.sync_api import sync_playwright
from PIL import Image
import numpy as np

PORT = 18342
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

    # 固定机位：走廊视角（L0 spawn 附近）
    page.evaluate('''() => {
      const eng = window.__engine, look = window.__look
      eng.player.x = eng.map.spawn.x + 0.5; eng.player.y = eng.map.spawn.y + 0.5
      look.yaw = 0.7; look.pitch = 0
      // 停 HUD 小地图之外的干扰：冻结实体
      eng.dev.frozenAI = true
    }''')
    page.wait_for_timeout(800)

    # 截屏区域排除 HUD 小地图（右上角）与准星动画：取中央 800×500
    def shot(name):
        page.screenshot(path=f'/tmp/{name}.png', clip={'x': 240, 'y': 150, 'width': 800, 'height': 500})

    shot('v9_dec_normal')
    page.evaluate('''() => { const e = window.__engine; e.explored.fill(0); e.visible.fill(0); e.player.stamina = 100 }''')
    page.wait_for_timeout(400)
    shot('v9_dec_zero')
    page.evaluate('''() => { const e = window.__engine; e.explored.fill(1); e.visible.fill(1) }''')
    page.wait_for_timeout(400)
    shot('v9_dec_full')
    browser.close()

proc.terminate()
a = np.array(Image.open('/tmp/v9_dec_normal.png').convert('RGB'), dtype=np.int16)
b = np.array(Image.open('/tmp/v9_dec_zero.png').convert('RGB'), dtype=np.int16)
c = np.array(Image.open('/tmp/v9_dec_full.png').convert('RGB'), dtype=np.int16)
d1 = np.abs(a - b).mean()
d2 = np.abs(a - c).mean()
print(f'normal vs explored=0  mean|Δ| = {d1:.3f}')
print(f'normal vs explored=1  mean|Δ| = {d2:.3f}')
print('3D 与探索状态解耦' if d1 < 2.0 and d2 < 2.0 else '!! 3D 画面受探索状态影响（pop-in 根源）')
print('ERRORS:' if errors else 'no console errors')
for e in errors[:10]: print(' ', e)
