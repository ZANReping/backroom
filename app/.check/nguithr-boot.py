# Nguithr'xurh 蜘蛛模型/动画改动后的启动检查：开页 → 开始游戏 → 等 HUD 出现 + 无 console error
import sys
from playwright.sync_api import sync_playwright

PORT = 3000
errors = []

with sync_playwright() as pw:
    b = pw.chromium.launch()
    pg = b.new_page(viewport={'width': 1280, 'height': 800})
    pg.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)
    pg.on('pageerror', lambda e: errors.append(str(e)))
    pg.add_init_script('localStorage.clear()')
    pg.goto(f'http://localhost:{PORT}/', wait_until='networkidle')
    pg.wait_for_timeout(1500)
    pg.locator('button:has-text("开始游戏")').first.click()
    pg.wait_for_timeout(12000)
    ok = pg.locator('text=/LEVEL/').count() > 0
    pg.screenshot(path='.check/nguithr-boot.png')
    b.close()

print('HUD LEVEL 出现:', ok)
print('console errors:', len(errors))
for e in errors[:5]:
    print('  -', e[:200])
sys.exit(0 if ok and not errors else 1)
