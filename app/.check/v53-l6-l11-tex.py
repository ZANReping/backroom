# v53 验证：L6~L11 地形贴图 + 房顶/楼体贴图 + EL3A 二层贴图渲染抽查
# 用法：先启动 npm run dev（:3000），再 python .check/v53-l6-l11-tex.py
from playwright.sync_api import sync_playwright

PORT = 3000
errors = []


def jump(pg, label):
    """DevPanel 世界页点跳转按钮，收起面板后等层级加载"""
    pg.locator('button:has-text("展开开发者面板"), button[aria-label="展开开发者面板"]').first.click() if pg.locator('button[aria-label="展开开发者面板"]').count() else None
    pg.locator('button:has-text("世界")').first.click()
    pg.wait_for_timeout(300)
    pg.locator(f'button:text-is("{label}")').first.click()
    pg.wait_for_timeout(400)
    # 收起面板再截图
    col = pg.locator('button[aria-label="收起开发者面板"]')
    if col.count():
        col.first.click()
    pg.wait_for_timeout(2600)


with sync_playwright() as pw:
    b = pw.chromium.launch()
    pg = b.new_page(viewport={'width': 1280, 'height': 800})
    pg.on('console', lambda m: errors.append(m.text[:200]) if m.type == 'error' else None)
    pg.on('pageerror', lambda e: errors.append(str(e)[:200]))
    pg.add_init_script('localStorage.setItem("br_settings", JSON.stringify({devMode:true}))')
    pg.goto(f'http://localhost:{PORT}/', wait_until='networkidle')
    pg.wait_for_timeout(1200)
    pg.locator('button:has-text("开始游戏")').first.click()
    pg.wait_for_timeout(2500)
    sk = pg.locator('text=进入').first
    if sk.count():
        try: sk.click()
        except Exception: pass
    pg.wait_for_timeout(2500)

    for lv in ['L6', 'L7', 'L8', 'L9', 'L10', 'L11']:
        jump(pg, lv)
        if lv == 'L6':
            # L6 极暗：开一键照明才能看清贴图
            exp = pg.locator('button[aria-label="展开开发者面板"]')
            if exp.count(): exp.first.click()
            pg.locator('button:has-text("世界")').first.click(); pg.wait_for_timeout(300)
            pg.locator('button:has-text("一键照明")').first.click()
            col = pg.locator('button[aria-label="收起开发者面板"]')
            if col.count(): col.first.click()
            pg.wait_for_timeout(800)
        pg.keyboard.down('w'); pg.wait_for_timeout(1200); pg.keyboard.up('w')
        pg.wait_for_timeout(400)
        pg.screenshot(path=f'.check/v53-{lv.lower()}.png')
        pg.mouse.move(640, 400); pg.mouse.move(640, 700)  # 低头看地板
        pg.wait_for_timeout(300)
        pg.screenshot(path=f'.check/v53-{lv.lower()}-floor.png')
        pg.mouse.move(640, 120)                            # 抬头看天花/屋顶
        pg.wait_for_timeout(300)
        pg.screenshot(path=f'.check/v53-{lv.lower()}-ceil.png')
        pg.mouse.move(640, 400)

    # EL3A 据点（二层夹楼贴图）
    exp = pg.locator('button[aria-label="展开开发者面板"]')
    if exp.count(): exp.first.click()
    pg.locator('button:has-text("世界")').first.click(); pg.wait_for_timeout(300)
    pg.locator('button:has-text("办公区EL3A")').first.click()
    pg.wait_for_timeout(2600)
    col = pg.locator('button[aria-label="收起开发者面板"]')
    if col.count(): col.first.click()
    pg.keyboard.down('w'); pg.wait_for_timeout(1000); pg.keyboard.up('w')
    pg.wait_for_timeout(400)
    pg.screenshot(path='.check/v53-el3a.png')
    pg.mouse.move(640, 400); pg.mouse.move(640, 150)  # 抬头看夹楼
    pg.wait_for_timeout(300)
    pg.screenshot(path='.check/v53-el3a-up.png')

    logs = [e for e in errors if 'fallback' in e or '加载失败' in e]
    print('console errors:', len(errors), '| texture fallback:', len(logs))
    for e in errors[:8]: print('  !', e)
    b.close()
print('OK -> .check/v53-*.png')
