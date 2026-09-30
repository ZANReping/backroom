# v7-world Playwright 冒烟：1280×800 进游戏非黑屏、console 无报错、z轴/室外场景截图
import sys, time, subprocess
from playwright.sync_api import sync_playwright
from PIL import Image
import numpy as np

PORT = 18332
proc = subprocess.Popen([sys.executable, '-m', 'http.server', str(PORT)], cwd='dist', stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1.0)

errors = []

with sync_playwright() as pw:
    browser = pw.chromium.launch()
    ctx = browser.new_context(viewport={'width': 1280, 'height': 800})
    page = ctx.new_page()
    page.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)
    page.on('pageerror', lambda e: errors.append(f'PAGEERROR {e}'))
    page.goto(f'http://localhost:{PORT}/', wait_until='networkidle')
    page.wait_for_timeout(1500)
    page.mouse.click(640, 400)
    page.wait_for_timeout(300)
    btn = page.locator('text=坠入后室').first
    if btn.count():
        btn.click()
    else:
        page.locator('button').first.click()
    page.wait_for_timeout(2500)
    skip = page.locator('text=进入').first
    if skip.count():
        try: skip.click()
        except Exception: pass
    page.wait_for_timeout(2000)
    page.wait_for_function('() => window.__engine && !window.__engine.paused && !!window.__engine.map', timeout=15000)
    page.wait_for_timeout(500)
    print('✓ 进入游戏')

    # L0 基础画面 + 空格跳跃（相机 z 起伏，不报错）
    page.evaluate('window.__engine.dev.god = true')
    page.keyboard.down('w'); page.wait_for_timeout(600)
    page.keyboard.press(' '); page.wait_for_timeout(300)
    page.keyboard.up('w')
    page.screenshot(path='/tmp/v7_l0.png')
    z = page.evaluate('window.__engine.player.z')
    print('✓ L0 截图, 跳跃中 z=', round(z, 2))

    def dismiss_intro():
        page.wait_for_timeout(600)
        sk = page.locator('text=进入').first
        if sk.count():
            try: sk.click()
            except Exception: pass
        page.wait_for_timeout(600)

    # L1：高台/检修沟 + 卷帘门小巷（室外）
    page.evaluate('window.__engine.devJump(1)')
    dismiss_intro()
    r = page.evaluate('''() => {
      const eng = window.__engine, m = eng.map
      // 传送到卷帘门前看向小巷
      const d = m.structures.find(s => s.kind === 'rollerdoor')
      if (d) {
        eng.player.x = d.x + 0.5; eng.player.y = d.y + 2.2
        eng.player.facing = Math.atan2(d.y + 0.5 - eng.player.y, d.x + 0.5 - eng.player.x)
      }
      return { roller: !!d, elev2: m.elev.filter(e => e === 2).length, elev1: m.elev.filter(e => e === 1).length }
    }''')
    assert r['roller'], 'L1 卷帘门缺失'
    assert r['elev2'] > 5 and r['elev1'] > 5, 'L1 高度档缺失'
    page.wait_for_timeout(1200)
    page.screenshot(path='/tmp/v7_l1_door.png')
    print('✓ L1 卷帘门截图')
    # 开门走进小巷（室外天空）
    page.evaluate('''() => {
      const eng = window.__engine, m = eng.map
      const d = m.structures.find(s => s.kind === 'rollerdoor')
      d.solid = false; d.data = { ...d.data, open: 1 }
      eng.player.x = d.x + 0.5; eng.player.y = d.y - 1.5
      eng.player.facing = Math.PI / 2 // 朝 +y（小巷在北侧则视角由雾色判定）
    }''')
    page.wait_for_timeout(1200)
    page.screenshot(path='/tmp/v7_l1_alley.png')
    print('✓ L1 小巷（室外）截图')

    # L4：玻璃窗雾中城市
    page.evaluate('window.__engine.devJump(4)')
    dismiss_intro()
    r = page.evaluate('''() => {
      const eng = window.__engine, m = eng.map
      const w = m.structures.find(s => s.kind === 'glasswin')
      if (w) {
        // 站在窗内侧看向窗外
        for (const [dx, dy] of [[0,1],[0,-1],[1,0],[-1,0]]) {
          const px = w.x + 0.5 + dx * 1.6, py = w.y + 0.5 + dy * 1.6
          const i = Math.floor(py) * m.w + Math.floor(px)
          if (m.tiles[i] === 1 && m.outdoor[i] === 0) {
            eng.player.x = px; eng.player.y = py
            eng.player.facing = Math.atan2(w.y + 0.5 - py, w.x + 0.5 - px)
            break
          }
        }
      }
      return { win: !!w }
    }''')
    assert r['win'], 'L4 玻璃窗缺失'
    page.wait_for_timeout(1200)
    page.screenshot(path='/tmp/v7_l4_window.png')
    print('✓ L4 雾中城市窗截图')

    # L5：庭院泳池（室外夜蓝）
    page.evaluate('window.__engine.devJump(5)')
    dismiss_intro()
    page.evaluate('''() => {
      const eng = window.__engine, m = eng.map
      const d = m.structures.find(s => s.kind === 'glassdoor')
      if (d) {
        d.solid = false; d.data = { ...d.data, open: 1 }
        eng.player.x = d.x + 0.5; eng.player.y = d.y + 1.6
        eng.player.facing = Math.PI / 2
      }
    }''')
    page.wait_for_timeout(1500)
    page.screenshot(path='/tmp/v7_l5_pool.png')
    print('✓ L5 庭院泳池截图')

    # 非黑屏检查
    for name in ['v7_l0', 'v7_l1_door', 'v7_l1_alley', 'v7_l4_window', 'v7_l5_pool']:
        im = np.array(Image.open(f'/tmp/{name}.png').convert('L'))
        h, w = im.shape
        mean = im[h//4:3*h//4, w//4:3*w//4].mean()
        print(name, 'center brightness:', round(float(mean), 1))
        assert mean > 3, f'{name} black screen suspected ({mean})'

    browser.close()

proc.terminate()
if errors:
    print('CONSOLE ERRORS:')
    for e in errors[:20]: print(' ', e)
    sys.exit(1)
print('OK: no console errors')
