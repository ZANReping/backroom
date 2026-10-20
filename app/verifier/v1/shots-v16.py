#!/usr/bin/env python3
# v16：dist http.server 根路径 + 子路径(/room/) 两种方式验证 L0 墙纸
# 截图：近景手电直射墙面（图案清晰）/ 走廊中景（接缝不可见、图案跨墙连续）；console 无 404/报错
# 用法：python3 verifier/v1/shots-v16.py <输出子目录名>
import os, subprocess, sys, time, socket
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(ROOT, 'verifier', 'runs', sys.argv[1] if len(sys.argv) > 1 else 'shots-v16')
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


SCENE_JS = """
(() => {
  const e = window.__engine, m = e.map, p = e.player
  p.flashlight = true; p.battery = 100  // 手电全开（模拟玩家实测）
  const mode = arguments[0]
})()"""

OPEN_YAW_JS = """(() => {
  const e = window.__engine, m = e.map, p = e.player
  let best = 0, bestD = 0
  for (let i = 0; i < 16; i++) {
    const yaw = i * Math.PI / 8
    const fx = -Math.sin(yaw), fz = -Math.cos(yaw)
    let dd = 0
    for (let s = 0.5; s <= 10; s += 0.5) {
      const tx = Math.floor(p.x + fx * s), ty = Math.floor(p.y + fz * s)
      if (tx < 0 || ty < 0 || tx >= m.w || ty >= m.h || m.tiles[ty * m.w + tx] !== 1) break
      dd = s
    }
    if (dd > bestD) { bestD = dd; best = yaw }
  }
  window.__look.yaw = best; window.__look.pitch = 0
})()"""

NEAR_WALL_JS = """(() => {
  const e = window.__engine, m = e.map, p = e.player
  let bx = 0, bz = 0, bd = 99
  for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
    let d = 0
    for (let s = 0.3; s <= 6; s += 0.2) {
      const tx = Math.floor(p.x + dx * s), ty = Math.floor(p.y + dy * s)
      if (tx < 0 || ty < 0 || tx >= m.w || ty >= m.h) break
      if (m.tiles[ty * m.w + tx] !== 1) { d = s; break }
    }
    if (d > 0 && d < bd) { bd = d; bx = dx; bz = dy }
  }
  p.x = p.x + bx * (bd - 1.1); p.y = p.y + bz * (bd - 1.1)
  window.__look.yaw = Math.atan2(-bx, -bz)
  window.__look.pitch = 0.05
})()"""


def run(tag: str, base_url: str):
    with sync_playwright() as p:
        b = p.chromium.launch(args=['--use-gl=swiftshader'])
        pg = b.new_page(viewport={'width': 960, 'height': 600})
        pg.set_default_timeout(90000)  # swiftshader 软渲染下主线程慢，全面放宽超时
        errs, fails = [], []
        pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
        pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.on('response', lambda r: fails.append(f'{r.status} {r.url}') if r.status >= 400 else None)
        pg.goto(base_url, wait_until='domcontentloaded')
        # swiftshader 下标题动画占用主线程，Playwright actionability 检查会卡死 → DOM 直接 click
        try:
            pg.locator('text=开始游戏').wait_for(state='attached')
        except Exception:
            print(f'[{tag}] FAIL BODY:', repr(pg.inner_text('body')[:200]))
            print(f'[{tag}] url={pg.url} title={pg.title()} readyState:',
                  pg.evaluate('document.readyState'), 'scripts:', pg.evaluate('document.scripts.length'))
            print(f'[{tag}] console errs:', errs[:6])
            print(f'[{tag}] http fails:', fails[:6])
            pg.screenshot(path=os.path.join(OUT, f'{tag}-fail.png'))
            raise
        pg.wait_for_timeout(1000)
        pg.locator('text=开始游戏').dispatch_event('click')
        pg.wait_for_function('window.__engine && !!window.__engine.map', timeout=30000)
        pg.evaluate('window.__engine.dev.god = true')
        pg.evaluate('(() => { const p = window.__engine.player; p.flashlight = true; p.battery = 100 })()')
        pg.wait_for_timeout(3200)
        pg.evaluate(OPEN_YAW_JS)
        pg.wait_for_timeout(2500)  # 等 jpg 贴图异步换入
        pg.screenshot(path=os.path.join(OUT, f'{tag}-mid.png'))
        pg.evaluate(NEAR_WALL_JS)
        pg.wait_for_timeout(500)
        pg.screenshot(path=os.path.join(OUT, f'{tag}-near.png'))
        b.close()
        print(f'[{tag}] console errors: {len(errs)}, http>=400: {len(fails)}')
        for e in errs[:8]:
            print('  ERR:', e)
        for f in fails[:8]:
            print('  HTTP:', f)
        return not errs and not fails


# 根路径服务
srv1 = subprocess.Popen(['python3', '-m', 'http.server', '8900', '--bind', '127.0.0.1'],
                        cwd=DIST, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
# 子路径服务：/tmp/v16srv/room -> dist，访问 /room/
sub_root = '/tmp/v16srv'
os.makedirs(sub_root, exist_ok=True)
link = os.path.join(sub_root, 'room')
if not os.path.islink(link):
    if os.path.exists(link):
        os.remove(link)
    os.symlink(DIST, link)
srv2 = subprocess.Popen(['python3', '-m', 'http.server', '8901', '--bind', '127.0.0.1'],
                        cwd=sub_root, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
ok1 = ok2 = False
try:
    assert wait_port(8900) and wait_port(8901), 'http.server 未启动'
    ok1 = run('root', 'http://127.0.0.1:8900/')
    ok2 = run('subpath', 'http://127.0.0.1:8901/room/')
finally:
    srv1.terminate(); srv2.terminate()
print('ROOT OK' if ok1 else 'ROOT FAIL', '|', 'SUBPATH OK' if ok2 else 'SUBPATH FAIL')
print('done ->', OUT)
