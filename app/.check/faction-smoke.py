# 阵营主题实体页 + IOTS 物品分类 + 团体页字体 截图
import sys, time, subprocess
from playwright.sync_api import sync_playwright

PORT = 18507
proc = subprocess.Popen([sys.executable, '-m', 'http.server', str(PORT)], cwd='dist', stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1.0)
errors = []

with sync_playwright() as pw:
    b = pw.chromium.launch()
    pg = b.new_page(viewport={'width': 1280, 'height': 800})
    pg.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)
    pg.add_init_script('''
      localStorage.setItem("br_settings", JSON.stringify({theme:"liminal"}));
      localStorage.setItem("br_codex", JSON.stringify({almond:true}));
      localStorage.setItem("br_codex_seen", JSON.stringify({jerry:6, ferren:6}));
    ''')
    pg.goto(f'http://localhost:{PORT}/', wait_until='networkidle')
    pg.wait_for_timeout(1200)
    pg.locator('button:has-text("图鉴档案")').first.click()
    pg.wait_for_timeout(500)

    def open_detail(cat, name, shot):
        pg.locator(f'button:has-text("{cat}")').first.click()
        pg.wait_for_timeout(400)
        pg.locator(f'button:has-text("{name}")').first.click()
        pg.wait_for_timeout(400)
        pg.screenshot(path=f'.check/{shot}')
        pg.locator('button:has-text("返回图鉴")').first.click()
        pg.wait_for_timeout(300)

    open_detail('实体', '杰瑞', 'fac-jerry.png')
    open_detail('实体', 'Ferren', 'fac-ferren.png')
    open_detail('物品', '杏仁水', 'fac-item.png')
    # 团体页（阵营字体）
    pg.locator('button:has-text("团体")').first.click()
    pg.wait_for_timeout(400)
    pg.screenshot(path='.check/fac-factions.png')
    b.close()

proc.terminate()
print('console errors:', errors if errors else 'none')
