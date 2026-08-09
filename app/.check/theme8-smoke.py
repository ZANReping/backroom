# 8 主题标题屏 + 设置主题页截图
import sys, time, subprocess
from playwright.sync_api import sync_playwright

PORT = 18503
proc = subprocess.Popen([sys.executable, '-m', 'http.server', str(PORT)], cwd='dist', stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1.0)
themes = ['amber', 'liminal', 'basalt', 'dark-liminal', 'greyspace', 'database', 'fandom', 'meg']
errors = []

with sync_playwright() as pw:
    b = pw.chromium.launch()
    for t in themes:
        pg = b.new_page(viewport={'width': 1280, 'height': 800})
        pg.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)
        pg.add_init_script(f'localStorage.setItem("br_settings", JSON.stringify({{theme:"{t}"}}))')
        pg.goto(f'http://localhost:{PORT}/', wait_until='networkidle')
        pg.wait_for_timeout(1300)
        pg.screenshot(path=f'.check/t8-{t}.png')
        pg.close()
    # 设置主题页（8 张卡片）
    pg = b.new_page(viewport={'width': 1280, 'height': 800})
    pg.goto(f'http://localhost:{PORT}/', wait_until='networkidle')
    pg.wait_for_timeout(1200)
    pg.locator('button:has-text("设置")').first.click()
    pg.wait_for_timeout(400)
    pg.locator('button:has-text("主题")').first.click()
    pg.wait_for_timeout(300)
    pg.screenshot(path='.check/t8-settings.png')
    b.close()

proc.terminate()
print('console errors:', errors if errors else 'none')

# 拼 2 张 2x2 对比图
from PIL import Image
files = [(t, Image.open(f'.check/t8-{t}.png').resize((640, 400))) for t in themes]
for sheet in range(2):
    img = Image.new('RGB', (1280, 800))
    for i, (t, im) in enumerate(files[sheet*4:(sheet+1)*4]):
        img.paste(im, ((i % 2) * 640, (i // 2) * 400))
    img.save(f'.check/t8-sheet{sheet+1}.png')
print('sheets done')
