# 光影模式对比验证：classic vs realistic（L0 室内 / L10 田野日光 / L7 海面）
import sys, time, subprocess
from playwright.sync_api import sync_playwright

PORT = 3000
errors = []

def enter_game(pg):
    pg.goto(f'http://localhost:{PORT}/', wait_until='networkidle')
    pg.wait_for_timeout(1200)
    pg.locator('button:has-text("开始游戏")').first.click()
    pg.wait_for_timeout(2500)
    sk = pg.locator('text=进入').first
    if sk.count():
        try: sk.click()
        except Exception: pass
    pg.wait_for_timeout(2500)
    # 手电照墙视角（看软阴影/反射）
    pg.keyboard.down('w'); pg.wait_for_timeout(900); pg.keyboard.up('w')
    pg.wait_for_timeout(500)

with sync_playwright() as pw:
    b = pw.chromium.launch()

    def new_page(settings):
        pg = b.new_page(viewport={'width': 1280, 'height': 800})
        pg.on('console', lambda m: errors.append(m.text[:200]) if m.type == 'error' else None)
        pg.on('pageerror', lambda e: errors.append(str(e)[:200]))
        pg.add_init_script(f'localStorage.clear(); localStorage.setItem("br_settings", JSON.stringify({{devMode:true, {settings}}}))')
        return pg

    # 1) classic L0（基线）
    pg = new_page('lightMode:"classic"')
    enter_game(pg)
    pg.screenshot(path='.check/lm-classic-l0.png')
    pg.close()

    # 2) realistic L0（软阴影 + 环境反射 + 泛光）
    pg = new_page('lightMode:"realistic"')
    enter_game(pg)
    pg.screenshot(path='.check/lm-real-l0.png')
    # 设置面板光影分区
    pg.keyboard.press('Escape'); pg.wait_for_timeout(300)
    pg.locator('button:has-text("设置")').first.click()
    pg.wait_for_timeout(400)
    pg.locator('button:has-text("画面")').first.click()
    pg.wait_for_timeout(300)
    pg.locator('div.max-h-\\[50dvh\\]').first.evaluate('(el) => el.scrollTop = el.scrollHeight')
    pg.wait_for_timeout(200)
    pg.screenshot(path='.check/lm-settings.png')
    pg.close()

    # 3) realistic 跳 L10（田野白昼日光投影）
    pg = new_page('lightMode:"realistic"')
    enter_game(pg)
    pg.locator('button:has-text("世界")').first.click(); pg.wait_for_timeout(200)
    pg.locator('button:text-is("L10")').first.click(); pg.wait_for_timeout(3500)
    pg.keyboard.down('w'); pg.wait_for_timeout(700); pg.keyboard.up('w')
    pg.wait_for_timeout(500)
    pg.screenshot(path='.check/lm-real-l10.png')
    # 4) 跳 L7（海面反射）
    pg.locator('button:has-text("世界")').first.click(); pg.wait_for_timeout(200)
    pg.locator('button:text-is("L7")').first.click(); pg.wait_for_timeout(3500)
    pg.keyboard.down('w'); pg.wait_for_timeout(700); pg.keyboard.up('w')
    pg.wait_for_timeout(500)
    pg.screenshot(path='.check/lm-real-l7.png')
    pg.close()
    b.close()

print('console errors:', errors if errors else 'none')
