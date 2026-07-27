#!/usr/bin/env python3
# v15 任务4：L0 走廊近景/中景墙纸验证截图
# 用法：python3 verifier/v1/shots-l0.py <输出子目录名>
import os, subprocess, sys, time, socket
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(ROOT, 'verifier', 'runs', sys.argv[1] if len(sys.argv) > 1 else 'shots-l0')
os.makedirs(OUT, exist_ok=True)
PORT = 5190


def wait_port(port: int, timeout: float = 30):
    t0 = time.time()
    while time.time() - t0 < timeout:
        try:
            socket.create_connection(('127.0.0.1', port), 0.5).close()
            return True
        except OSError:
            time.sleep(0.3)
    return False


dev = subprocess.Popen(['npm', 'run', 'dev', '--', '--port', str(PORT), '--strictPort', '--host', '127.0.0.1'],
                       cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
try:
    assert wait_port(PORT), 'dev server 未启动'
    with sync_playwright() as p:
        b = p.chromium.launch(args=['--use-gl=swiftshader'])
        pg = b.new_page(viewport={'width': 1280, 'height': 800})
        errs = []
        pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
        pg.goto(f'http://127.0.0.1:{PORT}', wait_until='domcontentloaded')
        pg.click('text=开始游戏')
        pg.wait_for_function('window.__engine && !!window.__engine.map', timeout=30000)
        pg.evaluate('window.__engine.dev.god = true')
        pg.wait_for_timeout(3200)  # 等层级进入卡 + 贴图加载
        # 中景：旋转到最开阔方向看走廊
        pg.evaluate("""(() => {
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
        })()""")
        pg.wait_for_timeout(2500)  # 等 jpg 贴图加载替换兜底
        pg.screenshot(path=os.path.join(OUT, 'l0-mid.png'))
        # 近景：退到走廊一侧，面向最近墙面（距离 ~0.8m）
        pg.evaluate("""(() => {
          const e = window.__engine, m = e.map, p = e.player
          // 找最近墙方向
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
          // 站在离墙 1.1m 处面向墙
          p.x = p.x + bx * (bd - 1.1); p.y = p.y + bz * (bd - 1.1)
          window.__look.yaw = Math.atan2(-bx, -bz) // 面向墙（yaw 约定：前向=(-sin,-cos)）
          window.__look.pitch = 0.05
        })()""")
        pg.wait_for_timeout(400)
        pg.screenshot(path=os.path.join(OUT, 'l0-near.png'))
        b.close()
        if errs:
            print('CONSOLE ERRORS:')
            for e in errs[:10]:
                print(' ', e)
finally:
    dev.terminate()
print('done ->', OUT)
