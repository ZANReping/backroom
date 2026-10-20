#!/usr/bin/env python3
# v15 任务1：seated/hound/carrier 三实体多角度截图（修复前后对比用）
# 用法：python3 verifier/v1/shots3.py <输出子目录名>
import os, subprocess, sys, time, socket
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(ROOT, 'verifier', 'runs', sys.argv[1] if len(sys.argv) > 1 else 'shots-v15')
os.makedirs(OUT, exist_ok=True)
PORT = 5188
ENTITIES = ['seated', 'hound', 'carrier']
DIST = {'carrier': 5.0, 'seated': 3.8, 'hound': 4.0}
# 每个实体拍三个角度：3/4 前视 / 正侧视 / 前正视
ANGLES = [('q', 0.55), ('side', 1.35), ('front', 0.05)]


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
        pg.wait_for_timeout(2600)
        pg.evaluate("""(() => {
          const e = window.__engine, m = e.map, p = e.player
          let best = 0, bestD = 0
          for (let i = 0; i < 16; i++) {
            const yaw = i * Math.PI / 8
            const fx = -Math.sin(yaw), fz = -Math.cos(yaw)
            let dd = 0
            for (let s = 0.5; s <= 8; s += 0.5) {
              const tx = Math.floor(p.x + fx * s), ty = Math.floor(p.y + fz * s)
              if (tx < 0 || ty < 0 || tx >= m.w || ty >= m.h || m.tiles[ty * m.w + tx] !== 1) break
              dd = s
            }
            if (dd > bestD) { bestD = dd; best = yaw }
          }
          window.__look.yaw = best
        })()""")
        pg.wait_for_timeout(300)
        for t in ENTITIES:
            for aname, foff in ANGLES:
                dist = DIST.get(t, 3.6)
                pg.evaluate(f"""(() => {{
                  const e = window.__engine
                  if (window.__freeze) clearInterval(window.__freeze)
                  window.__look.pitch = -0.12
                  e.devSpawnEntity('{t}', 4)
                  e.fakes.splice(0); e.player.sanity = 100
                  const r = window.__renderer, cam = r.camera
                  const dir = new window.__THREE.Vector3()
                  cam.getWorldDirection(dir)
                  let d = {dist}
                  const m = e.map
                  for (let s = 0.5; s <= {dist}; s += 0.25) {{
                    const tx = Math.floor(cam.position.x + dir.x * s), ty = Math.floor(cam.position.z + dir.z * s)
                    if (tx < 0 || ty < 0 || tx >= m.w || ty >= m.h || m.tiles[ty * m.w + tx] !== 1) {{ d = Math.max(1.2, s - 0.6); break }}
                  }}
                  const ex = cam.position.x + dir.x * d, ey = cam.position.z + dir.z * d
                  const ef = Math.atan2(-dir.z, -dir.x) + {foff}
                  const pin = () => {{
                    for (const en of e.map.entities) {{
                      if (en.def.type !== '{t}') continue
                      en.def = Object.assign({{}}, en.def, {{ sight: 0, hearing: 0, speed: 0, lightLure: false, drainsLight: false, jamsLight: false }})
                      en.x = ex; en.y = ey; en.facing = ef
                      en.disguised = undefined; en.hidden = false
                      en.state = 'idle'; en.stateT = 999; en.targetX = ex; en.targetY = ey
                      en.attackCd = 999
                    }}
                  }}
                  pin()
                  window.__freeze = setInterval(pin, 50)
                }})()""")
                pg.wait_for_timeout(500)
                path = os.path.join(OUT, f'{t}-{aname}.png')
                pg.screenshot(path=path)
                print(f'{t}-{aname}: {os.path.getsize(path)}B')
                pg.evaluate(f"""(() => {{
                  if (window.__freeze) {{ clearInterval(window.__freeze); window.__freeze = null }}
                  const m = window.__engine.map
                  m.entities.splice(0, m.entities.length, ...m.entities.filter((en) => en.def.type !== '{t}'))
                }})()""")
        b.close()
        if errs:
            print('CONSOLE ERRORS:')
            for e in errs[:10]:
                print(' ', e)
finally:
    dev.terminate()
print('done ->', OUT)
