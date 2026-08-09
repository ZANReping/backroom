# 综合验证：形象编辑移动端 / 阵营实体列表卡 / 电容器新图标
import sys, time, subprocess
from playwright.sync_api import sync_playwright

PORT = 3000
errors = []

with sync_playwright() as pw:
    b = pw.chromium.launch()

    # 1) 形象编辑：iPhone 竖屏 + 横屏
    for w, h, tag in ((390, 844, 'portrait'), (844, 390, 'landscape')):
        pg = b.new_page(viewport={'width': w, 'height': h}, has_touch=True, is_mobile=True)
        pg.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)
        pg.goto(f'http://localhost:{PORT}/', wait_until='networkidle')
        pg.wait_for_timeout(1200)
        pg.locator('button:has-text("形象编辑")').first.tap()
        pg.wait_for_timeout(500)
        pg.screenshot(path=f'.check/v-avatar-{tag}.png')
        pg.close()

    # 2) 实体列表（jerry/ferren 阵营卡）+ 3) 电容器物品详情
    pg = b.new_page(viewport={'width': 1280, 'height': 800})
    pg.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)
    pg.add_init_script('''
      localStorage.setItem("br_codex", JSON.stringify({capacitor:true}));
      localStorage.setItem("br_codex_seen", JSON.stringify({jerry:6, ferren:6}));
    ''')
    pg.goto(f'http://localhost:{PORT}/', wait_until='networkidle')
    pg.wait_for_timeout(1200)
    pg.locator('button:has-text("图鉴档案")').first.click()
    pg.wait_for_timeout(400)
    pg.locator('button:has-text("实体")').first.click()
    pg.wait_for_timeout(300)
    pg.locator('button:has-text("鹉主杰瑞")').first.screenshot(path='.check/v-ent-jerry.png')
    pg.locator('button:has-text("Ferren")').first.screenshot(path='.check/v-ent-ferren.png')
    pg.locator('button:has-text("物品")').first.click()
    pg.wait_for_timeout(300)
    pg.locator('button:has-text("电容器")').first.click()
    pg.wait_for_timeout(400)
    pg.screenshot(path='.check/v-capacitor.png')
    pg.close()
    b.close()

print('console errors:', errors if errors else 'none')
