# v52 验证：游戏正常启动 + L0 地板/天花板（世界空间 UV 改造）渲染正常
# 用法：先启动 npm run dev（:3000），再 python .check/v52-l0-tex.py
from playwright.sync_api import sync_playwright

PORT = 3000
errors = []

with sync_playwright() as pw:
    b = pw.chromium.launch()
    pg = b.new_page(viewport={'width': 1280, 'height': 800})
    pg.on('console', lambda m: errors.append(m.text[:200]) if m.type == 'error' else None)
    pg.on('pageerror', lambda e: errors.append(str(e)[:200]))
    pg.add_init_script('localStorage.clear()')
    pg.goto(f'http://localhost:{PORT}/', wait_until='networkidle')
    pg.wait_for_timeout(1200)
    pg.locator('button:has-text("开始游戏")').first.click()
    pg.wait_for_timeout(2500)
    sk = pg.locator('text=进入').first
    if sk.count():
        try: sk.click()
        except Exception: pass
    pg.wait_for_timeout(2500)
    pg.keyboard.down('w'); pg.wait_for_timeout(1500); pg.keyboard.up('w')
    pg.wait_for_timeout(600)
    pg.screenshot(path='.check/v52-l0.png')          # 平视：墙/地/顶同框
    pg.mouse.move(640, 400); pg.mouse.move(640, 700)  # 低头看地板
    pg.wait_for_timeout(400)
    pg.screenshot(path='.check/v52-l0-floor.png')
    pg.mouse.move(640, 100)                           # 抬头看天花板
    pg.wait_for_timeout(400)
    pg.screenshot(path='.check/v52-l0-ceil.png')
    logs = [e for e in errors if 'fallback' in e or '加载失败' in e]
    print('console errors:', len(errors), '| texture fallback:', len(logs))
    for e in errors[:5]: print('  !', e)
    b.close()
print('OK -> .check/v52-l0*.png')
