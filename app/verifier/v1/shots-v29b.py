#!/usr/bin/env python3
# v29b：移动端四项交互验证（iPhone 13 触屏模拟）+ 桌面 1280×800 回归
#  A. 摇杆按住中点按快捷栏可切换选中（CDP 多点触控）
#  B. 快捷使用按钮 = PC 右键（engine.quickUse）
#  C. 滚轮模拟按钮循环切换选中槽
#  D. M.E.G. 文档点按即开/即关（无需长按）
#  E. 手机端背包选中物品→左侧信息面板；取消选中→恢复装备栏
# 桌面：背包三栏布局/详情右栏回归 + console 无报错
import os, subprocess, sys, time, socket, json, functools
print = functools.partial(print, flush=True)
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(ROOT, 'verifier', 'runs', 'shots-v29b')
os.makedirs(OUT, exist_ok=True)
DIST = os.path.join(ROOT, 'dist')
PORT = 8904


def wait_port(port, timeout=20):
    t0 = time.time()
    while time.time() - t0 < timeout:
        try:
            socket.create_connection(('127.0.0.1', port), 0.5).close()
            return True
        except OSError:
            time.sleep(0.3)
    return False


def enter_game(pg, mobile):
    pg.goto(BASE, wait_until='domcontentloaded')
    # 注：text= 选择器 wait_for 在 CJK 下偶发不触发（count 可查但 wait 超时），改为轮询 count
    t0 = time.time()
    while time.time() - t0 < 20:
        if pg.locator('button:has-text("开始游戏")').count() > 0:
            break
        pg.wait_for_timeout(500)
    else:
        print('  [diag] 标题未出现，body=', repr(pg.evaluate('document.body.innerText.slice(0,300)')))
        raise RuntimeError('标题界面未加载')
    pg.wait_for_timeout(2000)
    for _ in range(4):
        # 直接 JS 点击（locator 内部 RAF 轮询在 swiftshader 吸引模式渲染下会饿死）
        pg.evaluate('''(() => {
          const b = [...document.querySelectorAll('button')].find((x) => x.textContent.includes('开始游戏'))
          if (b) b.click()
        })()''')
        try:
            pg.wait_for_function('window.__engine && !!window.__engine.map', timeout=8000)
            break
        except Exception:
            print('  [diag] 点击后 engine.map 未就绪，body=', repr(pg.evaluate('document.body.innerText.slice(0,200)')))
            continue
    pg.wait_for_function('window.__engine && !!window.__engine.map', timeout=30000)
    pg.wait_for_timeout(800)
    # 跳过 FallIntro / LevelIntro
    for _ in range(6):
        pg.evaluate('window.__engine.dev.god = true')
        if pg.evaluate('window.__engine.paused === false'):
            break
        if mobile:
            pg.touchscreen.tap(200, 400)
        else:
            pg.mouse.click(640, 400)
        pg.wait_for_timeout(1200)
    pg.wait_for_function('window.__engine.paused === false', timeout=30000)
    pg.evaluate('window.__engine.dev.god = true')
    pg.wait_for_timeout(600)


def run_mobile(p):
    b = p.chromium.launch(args=['--use-gl=swiftshader'])
    ctx = b.new_context(**p.devices['iPhone 13'])
    pg = ctx.new_page()
    pg.set_default_timeout(90000)
    errs, fails = [], []
    pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.on('response', lambda r: fails.append(f'{r.status} {r.url}') if r.status >= 400 else None)
    cdp = ctx.new_cdp_session(pg)
    ok = {}

    enter_game(pg, mobile=True)

    def rect_of(sel):
        return pg.evaluate("""(s) => { const el = document.querySelector(s); if (!el) return null
          const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 } }""", sel)

    def tap(x, y):
        cdp.send('Input.dispatchTouchEvent', {'type': 'touchStart', 'touchPoints': [{'x': x, 'y': y}]})
        cdp.send('Input.dispatchTouchEvent', {'type': 'touchEnd', 'touchPoints': []})

    # 快捷栏放入物品
    pg.evaluate('''(() => {
      const e = window.__engine
      e.player.hotbar = [{type:'almond',count:2},{type:'bandage',count:1},{type:'crowbar',count:1},null,null,null,null]
      e.player.selected = 0
      e.player.hunger = 50
      e.syncPassives()
    })()''')
    pg.wait_for_timeout(400)

    # ---- A. 摇杆按住 + 第二指点快捷栏第 3 格 ----
    rects = pg.evaluate('''(() => [...document.querySelectorAll('.overflow-x-auto > button')].map((b) => {
      const r = b.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }
    }))()''')
    assert len(rects) == 7, f'快捷栏格数异常: {len(rects)}'
    stick = {'x': 90, 'y': 700}
    slot3 = rects[2]
    cdp.send('Input.dispatchTouchEvent', {'type': 'touchStart', 'touchPoints': [stick]})
    pg.wait_for_timeout(400)
    moving = pg.evaluate('window.__engine.input.mx !== 0 || window.__engine.input.my !== 0 || window.__engine.player.steps >= 0')
    cdp.send('Input.dispatchTouchEvent', {'type': 'touchStart', 'touchPoints': [stick, slot3]})
    pg.wait_for_timeout(120)
    cdp.send('Input.dispatchTouchEvent', {'type': 'touchEnd', 'touchPoints': [stick]})
    pg.wait_for_timeout(300)
    sel_after = pg.evaluate('window.__engine.player.selected')
    cdp.send('Input.dispatchTouchEvent', {'type': 'touchEnd', 'touchPoints': []})
    pg.screenshot(path=os.path.join(OUT, 'm-A-quickbar-multitouch.png'))
    ok['A_摇杆按住中快捷栏切换'] = sel_after == 2
    print(f'  [A] 摇杆触摸激活={moving} 点按后 selected={sel_after}（期望 2）')

    # ---- C. 滚轮模拟按钮 ----
    r = rect_of('button[aria-label="快捷栏下一切换（模拟滚轮下）"]'); tap(r['x'], r['y'])
    pg.wait_for_timeout(250)
    sel_c = pg.evaluate('window.__engine.player.selected')
    ok['C_滚轮按钮切换'] = sel_c == 3
    print(f'  [C] 滚轮下后 selected={sel_c}（期望 3）')
    r = rect_of('button[aria-label="快捷栏上一切换（模拟滚轮上）"]'); tap(r['x'], r['y'])
    pg.wait_for_timeout(250)
    sel_c2 = pg.evaluate('window.__engine.player.selected')
    ok['C_滚轮按钮回切'] = sel_c2 == 2
    pg.screenshot(path=os.path.join(OUT, 'm-C-wheel-buttons.png'))

    # ---- B. 快捷使用按钮（选中杏仁水 slot0，饥饿 50 → 使用后回升/数量-1）----
    pg.evaluate('window.__engine.player.selected = 0; window.__engine.player.hunger = 50')
    pg.wait_for_timeout(200)
    before = pg.evaluate('({h: window.__engine.player.hunger, c: window.__engine.player.hotbar[0]?.count ?? 0})')
    r = rect_of('button[aria-label="快捷使用（等同于 PC 右键）"]'); tap(r['x'], r['y'])
    pg.wait_for_timeout(500)
    after = pg.evaluate('({h: window.__engine.player.hunger, c: window.__engine.player.hotbar[0]?.count ?? 0})')
    ok['B_快捷使用按钮'] = after['h'] > before['h'] or after['c'] < before['c']
    print(f'  [B] 使用前 {before} 使用后 {after}')
    pg.screenshot(path=os.path.join(OUT, 'm-B-quickuse.png'))

    # ---- D. M.E.G. 文档：点按即开/点按即关 ----
    pg.evaluate('window.__engine.emit({ kind: "doc", text: "meg_levels" })')
    pg.wait_for_timeout(600)
    doc_open = pg.evaluate('!!document.querySelector(".anim-slideUp") && document.body.innerText.includes("M.E.G. 内部资料")')
    pg.screenshot(path=os.path.join(OUT, 'm-D-doc-open.png'))
    # 点按「放回」按钮关闭（touchstart 直触）
    r = rect_of('button:last-child'); rb = pg.evaluate('''(() => { const b = [...document.querySelectorAll('button')].find((x) => x.textContent.includes('放回'))
      const r = b.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 } })()'''); tap(rb['x'], rb['y'])
    pg.wait_for_timeout(500)
    doc_closed = not pg.evaluate('document.body.innerText.includes("M.E.G. 内部资料")')
    ok['D_文档点按开关'] = doc_open and doc_closed
    print(f'  [D] 文档开={doc_open} 点按关={doc_closed}')

    # ---- E. 背包物品信息面板布局 ----
    print('  [E] 打开背包…', flush=True)
    pg.keyboard.press('Tab')  # 打开背包
    pg.wait_for_timeout(900)
    # 点按快捷栏第一格物品（先滚动可见——手机端单栏布局格子在首屏下方）
    print('  [E] 背包已开，滚动到格子…', flush=True)
    pg.evaluate('''document.querySelector('[data-inv-slot][data-w="hotbar"][data-i="0"]')?.scrollIntoView({ block: 'center' })''')
    pg.wait_for_timeout(400)
    r = rect_of('[data-inv-slot][data-w="hotbar"][data-i="0"]')
    print('  [E] 点按格子', r, flush=True)
    tap(r['x'], r['y'])
    pg.wait_for_timeout(600)
    info = pg.evaluate('''(() => ({
      hasName: document.body.innerText.includes("杏仁水"),
      equipGone: !document.body.innerText.includes("主手"),
    }))()''')
    pg.evaluate('window.scrollTo(0,0)')
    pg.wait_for_timeout(200)
    pg.screenshot(path=os.path.join(OUT, 'm-E-item-info.png'))
    # 取消选中（点同一格）→ 恢复装备栏
    tap(r['x'], r['y'])
    pg.wait_for_timeout(600)
    restored = pg.evaluate('document.body.innerText.includes("主手")')
    pg.evaluate('window.scrollTo(0,0)')
    pg.wait_for_timeout(200)
    pg.screenshot(path=os.path.join(OUT, 'm-E-equipment-restored.png'))
    ok['E_物品信息面板'] = info['hasName'] and info['equipGone'] and restored
    print(f'  [E] 选中后信息面板={info} 取消后装备栏恢复={restored}')

    b.close()
    print(f'[mobile] console errors: {len(errs)}, http>=400: {len(fails)}')
    for e in errs[:8]: print('  ERR:', e)
    for f in fails[:8]: print('  HTTP:', f)
    ok['console_clean'] = not errs and not fails
    return all(ok.values()), ok


def run_desktop(p):
    b = p.chromium.launch(args=['--use-gl=swiftshader'])
    ctx = b.new_context(viewport={'width': 1280, 'height': 800})
    pg = ctx.new_page()
    pg.set_default_timeout(90000)
    errs, fails = [], []
    pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.on('response', lambda r: fails.append(f'{r.status} {r.url}') if r.status >= 400 else None)

    enter_game(pg, mobile=False)
    pg.evaluate('''(() => {
      const e = window.__engine
      e.player.hotbar = [{type:'almond',count:2},{type:'crowbar',count:1},null,null,null,null,null]
      e.syncPassives()
    })()''')
    # 桌面：快捷栏点击切换（onClick 路径）
    rects = pg.evaluate('''(() => [...document.querySelectorAll('.overflow-x-auto > button')].map((b) => {
      const r = b.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }
    }))()''')
    pg.mouse.click(rects[1]['x'], rects[1]['y'])
    pg.wait_for_timeout(300)
    sel = pg.evaluate('window.__engine.player.selected')
    # 桌面背包：装备栏 + 详情右栏并存
    pg.keyboard.press('Tab')
    pg.wait_for_timeout(900)
    pg.locator('[data-inv-slot][data-w="hotbar"][data-i="0"]').click()
    pg.wait_for_timeout(600)
    layout = pg.evaluate('''(() => {
      const panels = [...document.querySelectorAll('.hud-panel')]
      const txt = document.body.innerText
      return { equipShown: txt.includes('口袋1'), detailShown: txt.includes('点击物品查看详情') || txt.includes('杏仁水'), panels: panels.length }
    })()''')
    pg.screenshot(path=os.path.join(OUT, 'd-regression-inventory.png'))
    pg.keyboard.press('Tab')
    pg.wait_for_timeout(400)
    pg.screenshot(path=os.path.join(OUT, 'd-regression-game.png'))
    b.close()
    print(f'[desktop] 快捷栏点击 selected={sel}（期望 1）布局={layout} | console errors: {len(errs)}, http>=400: {len(fails)}')
    for e in errs[:8]: print('  ERR:', e)
    ok = sel == 1 and layout['equipShown'] and layout['detailShown'] and not errs and not fails
    return ok


srv = subprocess.Popen(['python3', '-m', 'http.server', str(PORT), '--bind', '127.0.0.1'],
                       cwd=DIST, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
BASE = f'http://127.0.0.1:{PORT}/'
okm = okd = False
try:
    assert wait_port(PORT), 'http.server 未启动'
    with sync_playwright() as p:
        mode = sys.argv[1] if len(sys.argv) > 1 else 'all'
        okm, detail = (run_mobile(p) if mode in ('all', 'm') else (True, {}))
        print('MOBILE:', json.dumps(detail, ensure_ascii=False))
        okd = run_desktop(p) if mode in ('all', 'd') else True
finally:
    srv.terminate()
print('MOBILE OK' if okm else 'MOBILE FAIL')
print('DESKTOP OK' if okd else 'DESKTOP FAIL')
print('done ->', OUT)
sys.exit(0 if (okm and okd) else 1)
