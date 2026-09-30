# Playwright 冒烟：桌面 + iPhone 13（竖屏/横屏）截图、console 报错、移动/拾取/搜索模拟
import sys, time, subprocess, socket
from playwright.sync_api import sync_playwright

PORT = 18321
proc = subprocess.Popen([sys.executable, '-m', 'http.server', str(PORT)], cwd='dist', stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1.0)

errors = []
shots = []

def run(pw, name, vw, vh, mobile=False, actions=True):
    ctx = pw.new_context(viewport={'width': vw, 'height': vh}, is_mobile=mobile, has_touch=mobile,
                         device_scale_factor=2 if mobile else 1,
                         user_agent='Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' if mobile else None)
    page = ctx.new_page()
    page.on('console', lambda m: errors.append(f'{name}: {m.text}') if m.type == 'error' else None)
    page.on('pageerror', lambda e: errors.append(f'{name}: PAGEERROR {e}'))
    page.goto(f'http://localhost:{PORT}/', wait_until='networkidle')
    page.wait_for_timeout(1500)
    page.screenshot(path=f'/tmp/v4_{name}_title.png')
    shots.append(f'/tmp/v4_{name}_title.png')
    # 开始游戏
    page.mouse.click(vw/2, vh/2) if not mobile else page.touchscreen.tap(vw/2, vh/2)
    page.wait_for_timeout(300)
    btn = page.locator('text=坠入后室').first
    if btn.count():
        btn.click()
    else:
        page.locator('button').first.click()
    page.wait_for_timeout(3000)
    # 跳过层级进入卡
    skip = page.locator('text=进入').first
    if skip.count():
        try: skip.click()
        except Exception: pass
    page.wait_for_timeout(2000)
    if actions and not mobile:
        # 模拟移动
        page.keyboard.down('w'); page.wait_for_timeout(1200); page.keyboard.up('w')
        # 拾取/交互冒烟（引擎层直接验证）
        r = page.evaluate('''() => {
          const eng = window.__engine
          const p = eng.player, m = eng.map
          const out = {items: m.items.length, picked: false, searched: false, looted: 0, entities: m.entities.length}
          if (m.items.length) {
            const it = m.items[0]
            p.x = it.x + 0.6; p.y = it.y
            p.facing = Math.atan2(it.y - p.y, it.x - p.x)
            eng.update(0.016)
            const t = eng.getInteract()
            if (t && t.kind === 'item') { eng.input.interact = true; eng.update(0.016); out.picked = true }
          }
          const crate = m.structures.find(s => s.kind === 'crate' && !s.looted)
          if (crate) {
            p.x = crate.x + 0.5; p.y = crate.y + 1.2
            p.facing = Math.atan2(crate.y + 0.5 - p.y, crate.x + 0.5 - p.x)
            eng.addItem('crowbar')
            eng.update(0.016)
            const t = eng.getInteract()
            if (t && t.kind === 'crate') {
              eng.input.interact = true; eng.update(0.016)
              for (let i = 0; i < 200 && !eng.lootPanel; i++) eng.update(0.016)
              if (eng.lootPanel) { out.searched = true; out.looted = eng.lootPanel.items.length; eng.takeAllLoot(); eng.closeLootPanel() }
            }
          }
          return out
        }''')
        print(name, 'engine smoke:', r)
        assert r['picked'], 'pickup failed'
        assert r['searched'], 'search failed'
        page.wait_for_timeout(800)
    page.screenshot(path=f'/tmp/v4_{name}_game.png')
    shots.append(f'/tmp/v4_{name}_game.png')
    # 非黑屏检查：截图中心区域像素均值（WebGL 无法 drawImage 读回，用截图判断）
    import io
    from PIL import Image
    import numpy as np
    shot = page.screenshot()
    im = np.array(Image.open(io.BytesIO(shot)).convert('L'))
    h, w = im.shape
    mean = im[h//4:3*h//4, w//4:3*w//4].mean()
    print(name, 'screenshot center brightness:', round(float(mean), 1))
    assert mean > 3, f'{name} black screen suspected ({mean})'
    ctx.close()

with sync_playwright() as pw:
    browser = pw.chromium.launch()
    run(browser, 'desktop', 1280, 800)
    run(browser, 'iphone13', 390, 844, mobile=True, actions=False)
    run(browser, 'iphone13_land', 844, 390, mobile=True, actions=False)
    browser.close()

proc.terminate()
print('screenshots:', shots)
if errors:
    print('CONSOLE ERRORS:')
    for e in errors[:20]: print(' ', e)
    sys.exit(1)
print('OK: no console errors')
