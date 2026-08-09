# 图鉴评分组件截图：层级等级横幅 + IETS 盒（含悬停展开）
import sys, time, subprocess
from playwright.sync_api import sync_playwright

PORT = 18505
proc = subprocess.Popen([sys.executable, '-m', 'http.server', str(PORT)], cwd='dist', stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1.0)
errors = []

with sync_playwright() as pw:
    b = pw.chromium.launch()
    pg = b.new_page(viewport={'width': 1280, 'height': 800})
    pg.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)
    pg.add_init_script('''
      localStorage.setItem("br_settings", JSON.stringify({theme:"liminal"}));
      localStorage.setItem("br_codex", JSON.stringify({level_8:true, level_6:true}));
      localStorage.setItem("br_codex_seen", JSON.stringify({smiler:6, partygoer:6}));
    ''')
    pg.goto(f'http://localhost:{PORT}/', wait_until='networkidle')
    pg.wait_for_timeout(1200)
    pg.locator('button:has-text("图鉴档案")').first.click()
    pg.wait_for_timeout(500)
    # 层级 Level 8 详情
    pg.locator('button:has-text("Level 8 ·")').first.click()
    pg.wait_for_timeout(400)
    pg.screenshot(path='.check/widget-level.png')
    pg.locator('button:has-text("返回图鉴")').first.click()
    pg.wait_for_timeout(300)
    # 实体 笑魇 详情（含 IETS 悬停展开）
    pg.locator('button:has-text("实体")').first.click()
    pg.wait_for_timeout(400)
    pg.locator('button:has-text("笑魇")').first.click()
    pg.wait_for_timeout(400)
    pg.screenshot(path='.check/widget-entity.png')
    box = pg.locator('.iets-box').first
    box.hover()
    pg.wait_for_timeout(400)
    pg.screenshot(path='.check/widget-entity-hover.png')
    b.close()

proc.terminate()
print('console errors:', errors if errors else 'none')
