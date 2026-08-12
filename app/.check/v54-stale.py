from playwright.sync_api import sync_playwright
import hashlib
with sync_playwright() as pw:
    b = pw.chromium.launch()
    pg = b.new_page(viewport={'width': 1280, 'height': 800})
    pg.add_init_script('localStorage.clear(); localStorage.setItem("br_settings", JSON.stringify({devMode:true, fogOfWar:false, grain:false}))')
    pg.goto('http://localhost:3000/', wait_until='networkidle')
    pg.wait_for_timeout(1500)
    pg.locator('button:has-text("开始游戏")').first.click()
    pg.wait_for_timeout(9000)
    sk = pg.locator('text=进入').first
    if sk.count():
        try: sk.click()
        except Exception: pass
    pg.wait_for_timeout(2000)
    try: pg.locator('button[aria-label="收起开发者面板"]').first.click()
    except Exception: pass
    pg.evaluate('() => window.__engine.devJumpOutpost(\'alpha\')')
    for _ in range(25):
        pg.wait_for_timeout(400)
        if pg.evaluate('window.__engine.player.level') == 101 and not pg.evaluate('!!window.__engine.transition'):
            break
    pg.evaluate('''() => {
      const p = window.__engine.player
      p.x = 28.3; p.y = 16.5; p.z = 0; p.vz = 0
      window.__look.yaw = Math.PI; window.__look.pitch = 0
      window.__engine.dev.frozenAI = true
    }''')
    pg.wait_for_timeout(1200)
    pg.screenshot(path='.check/v54-s1.png')
    pg.evaluate('() => { window.__look.yaw = 0 }')  # 转向西
    pg.wait_for_timeout(600)
    pg.screenshot(path='.check/v54-s2.png')
    h1 = hashlib.md5(open('.check/v54-s1.png','rb').read()).hexdigest()
    h2 = hashlib.md5(open('.check/v54-s2.png','rb').read()).hexdigest()
    print('frame changes with yaw flip:', h1 != h2)
    b.close()
print('OK')
