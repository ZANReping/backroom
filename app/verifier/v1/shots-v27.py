#!/usr/bin/env python3
# v27：用户版新系统截图验证——L1 无限场景 / 档案·笔记本 UI / console 无报错无 404
# 桌面 1280×800 + iPhone 13；dist 静态服务（根路径）
# 用法：python3 verifier/v1/shots-v27.py [输出子目录名]
import os, subprocess, sys, time, socket
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(ROOT, 'verifier', 'runs', sys.argv[1] if len(sys.argv) > 1 else 'shots-v27')
os.makedirs(OUT, exist_ok=True)
DIST = os.path.join(ROOT, 'dist')


def wait_port(port: int, timeout: float = 20):
    t0 = time.time()
    while time.time() - t0 < timeout:
        try:
            socket.create_connection(('127.0.0.1', port), 0.5).close()
            return True
        except OSError:
            time.sleep(0.3)
    return False


OPEN_YAW_JS = """(() => {
  const e = window.__engine, m = e.map, p = e.player
  let best = 0, bestD = 0
  for (let i = 0; i < 16; i++) {
    const yaw = i * Math.PI / 8
    const fx = -Math.sin(yaw), fz = -Math.cos(yaw)
    let dd = 0
    for (let s = 0.5; s <= 12; s += 0.5) {
      const tx = Math.floor(p.x + fx * s), ty = Math.floor(p.y + fz * s)
      if (tx < 0 || ty < 0 || tx >= m.w || ty >= m.h || m.tiles[ty * m.w + tx] !== 1) break
      dd = s
    }
    if (dd > bestD) { bestD = dd; best = yaw }
  }
  window.__look.yaw = best; window.__look.pitch = 0
})()"""


def start_game(pg, mobile: bool):
    pg.goto(BASE, wait_until='domcontentloaded')
    pg.locator('text=开始游戏').wait_for(state='attached')
    pg.wait_for_timeout(1000)
    pg.locator('text=开始游戏').dispatch_event('click')
    pg.wait_for_function('window.__engine && !!window.__engine.map', timeout=30000)
    pg.evaluate('window.__engine.dev.god = true')
    pg.evaluate('(() => { const p = window.__engine.player; p.flashlight = true; p.battery = 100 })()')
    pg.wait_for_timeout(2500)


def run(tag: str, mobile: bool):
    with sync_playwright() as p:
        b = p.chromium.launch(args=['--use-gl=swiftshader'])
        if mobile:
            ctx = b.new_context(**p.devices['iPhone 13'])
        else:
            ctx = b.new_context(viewport={'width': 1280, 'height': 800})
        pg = ctx.new_page()
        pg.set_default_timeout(90000)
        errs, fails = [], []
        pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
        pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.on('response', lambda r: fails.append(f'{r.status} {r.url}') if r.status >= 400 else None)

        start_game(pg, mobile)

        # 1) L1 无限场景（宜居地带无限 chunk）
        pg.evaluate('window.__engine.loadLevel(1)')
        pg.wait_for_timeout(2500)
        pg.evaluate('(() => { const p = window.__engine.player; p.flashlight = true; p.battery = 100 })()')
        pg.evaluate(OPEN_YAW_JS)
        pg.wait_for_timeout(2500)
        n_chunks = pg.evaluate('window.__engine.map.inf ? window.__engine.map.inf.chunks.size : 0')
        pg.screenshot(path=os.path.join(OUT, f'{tag}-l1-infinite.png'))
        # 平移窗口（走 1.5 个 chunk）再截图，验证流式缝合渲染不崩
        pg.evaluate('''(() => {
          const e = window.__engine, p = e.player
          p.x += 48
          e.update(0.05)
        })()''')
        pg.wait_for_timeout(2000)
        pg.evaluate(OPEN_YAW_JS)
        pg.wait_for_timeout(1500)
        n_chunks2 = pg.evaluate('window.__engine.map.inf.chunks.size')
        pg.screenshot(path=os.path.join(OUT, f'{tag}-l1-infinite-moved.png'))

        # 2) 档案覆盖层（DocOverlay）
        pg.evaluate("window.__engine.emit({ kind: 'doc', text: 'meg_levels' })")
        pg.wait_for_timeout(900)
        pg.screenshot(path=os.path.join(OUT, f'{tag}-doc-overlay.png'))
        pg.keyboard.press('Escape')
        pg.wait_for_timeout(400)

        # 3) 笔记本覆盖层（NotebookOverlay）
        pg.evaluate('''(() => {
          const e = window.__engine
          e.devGiveItem('notebook')
          const i = e.player.hotbar.findIndex((s) => s && s.type === 'notebook')
          e.useSlot('hotbar', i)
        })()''')
        pg.wait_for_timeout(900)
        pg.screenshot(path=os.path.join(OUT, f'{tag}-notebook.png'))
        pg.keyboard.press('Escape')
        pg.wait_for_timeout(400)

        b.close()
        print(f'[{tag}] L1 chunks: {n_chunks} -> {n_chunks2} | console errors: {len(errs)}, http>=400: {len(fails)}')
        for e in errs[:8]:
            print('  ERR:', e)
        for f in fails[:8]:
            print('  HTTP:', f)
        return not errs and not fails and n_chunks == 25 and n_chunks2 == 25


srv = subprocess.Popen(['python3', '-m', 'http.server', '8902', '--bind', '127.0.0.1'],
                       cwd=DIST, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
BASE = 'http://127.0.0.1:8902/'
okd = okm = False
try:
    assert wait_port(8902), 'http.server 未启动'
    okd = run('d', False)
    okm = run('m', True)
finally:
    srv.terminate()
print('DESKTOP OK' if okd else 'DESKTOP FAIL', '|', 'MOBILE OK' if okm else 'MOBILE FAIL')
print('done ->', OUT)
sys.exit(0 if okd and okm else 1)
