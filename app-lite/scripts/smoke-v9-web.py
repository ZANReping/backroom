# v9-fix Playwright 冒烟：1280×800 进游戏无报错、非黑屏；
# 容器搜索出 LootPanel → 玩家走远（>2.5m）→ 面板自动关闭（截图对比）；
# 出口箭头朝向视线相对方向（屏幕内断言）
import sys, time, subprocess
from playwright.sync_api import sync_playwright
from PIL import Image
import numpy as np

PORT = 18422
proc = subprocess.Popen([sys.executable, '-m', 'http.server', str(PORT)], cwd='dist', stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1.0)
errors = []
failed = []

def check(cond, msg):
    print(('✓ ' if cond else '✗ ') + msg)
    if not cond: failed.append(msg)

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
    sk = page.locator('text=进入').first
    if sk.count():
        try: sk.click()
        except Exception: pass
    page.wait_for_timeout(1500)
    page.wait_for_function('() => window.__engine && !window.__engine.paused && !!window.__engine.map', timeout=15000)
    page.evaluate('window.__engine.dev.god = true')
    print('✓ 进入游戏')

    # ---- 非黑屏 ----
    page.wait_for_timeout(800)
    page.screenshot(path='/tmp/v9_web_l0.png')
    im = np.array(Image.open('/tmp/v9_web_l0.png').convert('L'))
    h, w = im.shape
    mean = im[h//4:3*h//4, w//4:3*w//4].mean()
    check(mean > 3, f'非黑屏（中心亮度 {mean:.1f}）')

    # ---- 容器搜索 → 走远自动关闭 ----
    # 传送到最近未搜容器并触发搜索（直接注入 searching 状态，dur 极短）
    r = page.evaluate('''() => {
      const eng = window.__engine
      eng.devTeleport('container')
      const m = eng.map, p = eng.player
      const KINDS = ['crate', 'corpse', 'car', 'cabinet', 'dresser', 'megcrate']
      let best = null, bd = 1e9
      for (const s of m.structures) {
        if (!KINDS.includes(s.kind) || s.looted) continue
        const d = Math.hypot(s.x + s.w / 2 - p.x, s.y + s.h / 2 - p.y)
        if (d < bd) { bd = d; best = s }
      }
      if (!best || bd > 2.4) return { ok: false, bd }
      if (!best.data || !best.data.sid) best.data = { ...best.data, sid: 424242 }
      eng.searching = { sid: 424242, t: 0, dur: 0.05, label: '补给箱' }
      return { ok: true, kind: best.kind }
    }''')
    check(r.get('ok'), f'传送至容器并触发搜索 {r}')
    page.wait_for_timeout(700)
    lp = page.evaluate('() => !!window.__engine.lootPanel')
    check(lp, '搜索完成，战利品面板已打开')
    page.wait_for_timeout(400)  # 等 HUD tick 渲染
    dom_panel = page.locator('text=全部拿取').count() > 0
    check(dom_panel, '战利品面板 DOM 可见')
    page.screenshot(path='/tmp/v9_loot_open.png')

    # 走远 6m（>2.5m 交互半径）
    page.evaluate('''() => {
      const eng = window.__engine
      const m = eng.map, p = eng.player
      // 向四个方向找能走的位置退开 6m
      for (const [dx, dy] of [[6,0],[-6,0],[0,6],[0,-6],[4,4],[-4,-4]]) {
        const nx = p.x + dx, ny = p.y + dy
        const i = Math.floor(ny) * m.w + Math.floor(nx)
        if (nx>0 && ny>0 && nx<m.w && ny<m.h && m.tiles[i]===1) { p.x = nx; p.y = ny; break }
      }
    }''')
    page.wait_for_timeout(600)
    lp2 = page.evaluate('() => window.__engine.lootPanel === null')
    check(lp2, '玩家走远（>2.5m）后 lootPanel 自动关闭')
    page.wait_for_timeout(400)
    dom_panel2 = page.locator('text=全部拿取').count() > 0
    check(not dom_panel2, '战利品面板 DOM 已消失')
    page.screenshot(path='/tmp/v9_loot_closed.png')
    # 容器仍可再次搜索（未拿空 → 未标记 looted）
    again = page.evaluate('''() => {
      const m = window.__engine.map
      const s = m.structures.find(x => x.data && x.data.sid === 424242)
      return s ? !s.looted : false
    }''')
    check(again, '容器未拿空仍保持未搜空状态（可再次搜索）')

    # ---- 出口箭头（屏幕内实时校验：箭头 CSS 旋转 vs 引擎实测方位）----
    arr = page.evaluate('''() => {
      const eng = window.__engine, look = window.__look
      eng.devTeleport('exit')
      const e = eng.nearestExit()
      if (!e) return { ok: false, why: 'no exit' }
      const m = eng.map, p = eng.player
      // 退到离出口约 8m 的可站立点（避免距离过近方向退化）
      let placed = false
      for (const [dx, dy] of [[8,0],[-8,0],[0,8],[0,-8],[6,6],[-6,6],[6,-6],[-6,-6]]) {
        const nx = e.x + 0.5 + dx, ny = e.y + 0.5 + dy
        const i = Math.floor(ny) * m.w + Math.floor(nx)
        if (nx>1 && ny>1 && nx<m.w-1 && ny<m.h-1 && m.tiles[i]===1) { p.x = nx; p.y = ny; placed = true; break }
      }
      if (!placed) return { ok: false, why: 'no spot 8m from exit' }
      const dx = e.x + 0.5 - p.x, dy = e.y + 0.5 - p.y
      look.yaw = Math.atan2(-dx, -dy) + Math.PI / 2 // 视线 = 出口方向左旋 90° ⇒ 出口在正右
      return { ok: true, d: Math.hypot(dx, dy) }
    }''')
    check(arr.get('ok'), f'出口箭头用例布置 {arr}')
    page.wait_for_timeout(600)
    rot = page.evaluate('''() => {
      const el = document.querySelector('.anim-pulse, [style*="rotate"]')
      const nodes = [...document.querySelectorAll('div')]
      const arrow = nodes.find(n => n.textContent === '➤' && n.parentElement && /rotate/.test(n.parentElement.style.transform || ''))
      if (!arrow) return null
      const m = /rotate\\((-?[0-9.]+)rad\\)/.exec(arrow.parentElement.style.transform)
      return m ? parseFloat(m[1]) : null
    }''')
    if rot is None:
        check(False, '未找到出口箭头元素（出口可能 >20m 或未渲染）')
    else:
        # 出口在正右 ⇒ 箭头应朝右 ⇒ cssRot ≈ 0
        err = abs(rot)
        check(err < 0.3, f'出口在正右方时箭头朝右（cssRot={rot:.3f}rad，误差 {err:.3f}）')
    page.screenshot(path='/tmp/v9_arrow_right.png')

    browser.close()

proc.terminate()
if errors:
    print('CONSOLE ERRORS:')
    for e in errors[:20]: print(' ', e)
    failed.append('console errors')
if failed:
    print(f'\n{len(failed)} 项失败')
    sys.exit(1)
print('\nv9-web 冒烟全部通过')
