# v6-world Playwright 冒烟：1280×800 截图验证手部模型+准心+门/吊灯生成、非黑屏、console 无报错
import sys, time, subprocess, io
from playwright.sync_api import sync_playwright
from PIL import Image
import numpy as np

PORT = 18331
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
    # 开始游戏
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

    # 等游戏主循环进入非暂停（层级进入卡关闭）
    page.wait_for_function('() => window.__engine && !window.__engine.paused && !!window.__engine.map', timeout=15000)
    page.wait_for_timeout(500)
    # 1. 准心存在且可见
    cross = page.locator('#br-crosshair')
    assert cross.count() == 1, 'crosshair element missing'
    assert cross.is_visible(), 'crosshair not visible'
    print('✓ 准心可见')

    # 2. 手部模型存在（viewmodel 挂在相机上）+ 手持撬棍模型切换
    r = page.evaluate('''() => {
      const eng = window.__engine
      eng.addItem('crowbar')
      const idx = eng.player.hotbar.findIndex(s => s && s.type === 'crowbar')
      eng.player.selected = idx
      return { selected: idx }
    }''')
    assert r['selected'] >= 0, 'crowbar not in hotbar'
    page.keyboard.down('w'); page.wait_for_timeout(900); page.keyboard.up('w')
    page.wait_for_timeout(400)
    page.screenshot(path='/tmp/v6_l0_crowbar.png')
    print('✓ L0 手持撬棍截图')

    # 3. 攻击动画（挥动 + 准心收缩）中间帧
    page.mouse.down(); page.wait_for_timeout(120)
    page.screenshot(path='/tmp/v6_attack.png')
    page.mouse.up()

    # 跳层辅助：devJump 后关掉层级进入卡
    def dismiss_intro():
        page.wait_for_timeout(600)
        sk = page.locator('text=进入').first
        if sk.count():
            try: sk.click()
            except Exception: pass
        page.wait_for_timeout(600)

    # 4. 跳 L5 看客房门/吊灯/床
    page.evaluate('''() => {
      window.__engine.dev.god = true
      window.__engine.devJump(5)
    }''')
    dismiss_intro()
    page.evaluate('''() => {
      const eng = window.__engine
      const m = eng.map
      // 传送到客房门前
      const door = m.structures.find(s => s.kind === 'hoteldoor')
      if (door) {
        // 找门两侧可站立的一侧取景
        const dirs = [[1,0],[-1,0],[0,1],[0,-1]]
        for (const [dx,dy] of dirs) {
          const px = door.x + 0.5 - dx * 2, py = door.y + 0.5 - dy * 2
          const t = m.tiles[Math.floor(py) * m.w + Math.floor(px)]
          if (t === 1) {
            eng.player.x = px; eng.player.y = py
            eng.player.facing = Math.atan2(door.y + 0.5 - py, door.x + 0.5 - px)
            break
          }
        }
      }
      const ch = m.structures.find(s => s.kind === 'chandelier')
      return { door: !!door, chandelier: !!ch, beds: m.structures.filter(s => s.kind === 'bed').length }
    }''')
    page.wait_for_timeout(1200)
    page.screenshot(path='/tmp/v6_l5_door.png')
    print('✓ L5 客房门截图')

    # 5. 吊灯视角
    page.evaluate('''() => {
      const eng = window.__engine
      const m = eng.map
      const ch = m.structures.find(s => s.kind === 'chandelier')
      if (ch) {
        eng.player.x = ch.x + 1.6; eng.player.y = ch.y + 1.6
        eng.player.facing = Math.atan2(ch.y + 0.5 - eng.player.y, ch.x + 0.5 - eng.player.x)
      }
    }''')
    page.wait_for_timeout(800)
    page.screenshot(path='/tmp/v6_l5_chandelier.png')
    print('✓ L5 吊灯截图')

    # 6. L4 涂黑窗户
    page.evaluate('window.__engine.devJump(4)')
    dismiss_intro()
    page.evaluate('''() => {
      const eng = window.__engine
      const m = eng.map
      const w = m.structures.find(s => s.kind === 'windowblack' || s.kind === 'windowtrap')
      if (w) {
        eng.player.x = w.x + 0.5; eng.player.y = w.y + 1.6
        eng.player.facing = Math.atan2(w.y + 0.5 - eng.player.y, w.x + 0.5 - eng.player.x)
      }
    }''')
    page.wait_for_timeout(1000)
    page.screenshot(path='/tmp/v6_l4_window.png')
    print('✓ L4 窗户截图')

    # 7. 非黑屏检查（每张截图中心亮度）
    for name in ['v6_l0_crowbar', 'v6_l5_door', 'v6_l5_chandelier', 'v6_l4_window']:
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
