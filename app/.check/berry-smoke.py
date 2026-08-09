# 迁跃浆果层级标签验证：打标 → 不混堆 → 按标签传送
import sys, time, subprocess
from playwright.sync_api import sync_playwright

PORT = 3000
errors = []

with sync_playwright() as pw:
    b = pw.chromium.launch()
    pg = b.new_page(viewport={'width': 1280, 'height': 800})
    pg.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)
    pg.on('pageerror', lambda e: errors.append(str(e)))
    pg.add_init_script('localStorage.clear(); localStorage.setItem("br_settings", JSON.stringify({devMode:true}))')
    pg.goto(f'http://localhost:{PORT}/', wait_until='networkidle')
    pg.wait_for_timeout(1200)
    pg.locator('button:has-text("开始游戏")').first.click()
    pg.wait_for_timeout(2500)
    sk = pg.locator('text=进入').first
    if sk.count():
        try: sk.click()
        except Exception: pass
    pg.wait_for_timeout(2500)

    def give_warpberry():
        for _ in range(3):
            pg.locator('button:has-text("下一页")').first.click()
            pg.wait_for_timeout(150)
        pg.locator('button:has-text("迁跃浆果")').first.click()
        pg.wait_for_timeout(200)

    # L0 给一颗（标签 L0）
    give_warpberry()
    # 跳到 L1 再给一颗（标签 L1）
    pg.locator('button:has-text("世界")').first.click()
    pg.wait_for_timeout(200)
    pg.locator('button:text-is("L1")').first.click()
    pg.wait_for_timeout(3000)
    print('HUD now:', pg.locator('text=/LEVEL \\d/').first.text_content())
    pg.locator('button:has-text("召唤")').first.click()
    pg.wait_for_timeout(200)
    give_warpberry()
    # 打开背包验证两格分放（限定在背包覆盖层内计数）
    pg.keyboard.press('Tab')
    pg.wait_for_timeout(600)
    inv = pg.locator('div.fixed.z-50')
    berries = inv.locator('img[src*="item_warpberry"]')
    n = berries.count()
    print('warpberry slots in inventory (expect 2):', n)
    # 选中第二颗（L1 标签），看标签文案
    berries.nth(1).click()
    pg.wait_for_timeout(400)
    pg.screenshot(path='.check/berry-inv.png')
    print('slot2 tag:', pg.locator('text=/标签：发现于/').first.text_content())
    # 选中第一颗（L0 标签）并食用 → 应传送回 L0
    berries.nth(0).click()
    pg.wait_for_timeout(300)
    print('slot1 tag:', pg.locator('text=/标签：发现于/').first.text_content())
    pg.locator('button:text-is("使用")').first.click()
    pg.wait_for_timeout(3500)
    pg.keyboard.press('Escape')  # 传送后关闭背包
    pg.wait_for_timeout(500)
    print('HUD after eat:', pg.locator('text=/LEVEL \\d/').first.text_content())
    pg.screenshot(path='.check/berry-after.png')
    b.close()

print('console errors:', errors if errors else 'none')
