#!/usr/bin/env python3
# v14 验收标准 7：Playwright 截图（dev 模式逐个召唤实体），校验每种实体形态可辨（画面非黑/有内容）
# 运行：python3 verifier/v1/shots.py
import os, subprocess, sys, time, socket
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(ROOT, 'verifier', 'runs', 'shots')
os.makedirs(OUT, exist_ok=True)
PORT = 5188
ENTITIES = ['duller', 'faceling', 'smiler', 'skinstealer', 'hound', 'carrier', 'pipeworm',
            'arcwraith', 'insulator', 'copierwraith', 'seated', 'bellhop', 'mirrorself',
            'deathmoth', 'clump']
DIST = {'carrier': 5.0, 'pipeworm': 4.6, 'bellhop': 4.2, 'seated': 3.8, 'clump': 4.0, 'hound': 4.0, 'deathmoth': 2.8}  # 默认 3.6
FOFF = {'pipeworm': 1.35, 'carrier': 0.75, 'hound': 0.7, 'clump': 0.7, 'deathmoth': 0.7}  # 3/4 视角偏移（长体/四足更接近侧视），默认 0.55


def wait_port(port: int, timeout: float = 30):
    t0 = time.time()
    while time.time() - t0 < timeout:
        try:
            socket.create_connection(('127.0.0.1', port), 0.5).close()
            return True
        except OSError:
            time.sleep(0.3)
    return False


def brightness(path: str) -> float:
    from PIL import Image
    import numpy as np
    a = np.asarray(Image.open(path).convert('L'), dtype=float)
    return float(a.mean())


dev = subprocess.Popen(['npm', 'run', 'dev', '--', '--port', str(PORT), '--strictPort', '--host', '127.0.0.1'],
                       cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
results = []
try:
    assert wait_port(PORT), 'dev server 未启动'
    with sync_playwright() as p:
        b = p.chromium.launch(args=['--use-gl=swiftshader'])
        pg = b.new_page(viewport={'width': 1280, 'height': 800})
        pg.goto(f'http://127.0.0.1:{PORT}', wait_until='domcontentloaded')
        pg.click('text=开始游戏')
        pg.wait_for_function('window.__engine && !!window.__engine.map', timeout=30000)
        pg.evaluate('window.__engine.dev.god = true')
        pg.wait_for_timeout(2600)  # 等层级进入卡消失
        # 旋转玩家视线到最开阔的方向，避免实体被墙遮挡
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
        # 手电常亮、面向实体方向
        for t in ENTITIES:
            dist = DIST.get(t, 3.6)
            foff = FOFF.get(t, 0.55)
            pg.evaluate(f"""(() => {{
              const e = window.__engine
              if (window.__freeze) clearInterval(window.__freeze)
              window.__look.pitch = -0.12 // 略微俯视，低身位实体完整入镜
              e.devSpawnEntity('{t}', 4)
              e.fakes.splice(0); e.player.sanity = 100 // 清低理智幻影
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
              const ef = Math.atan2(-dir.z, -dir.x) + {foff} // 3/4 视角：正面特征+身体轮廓同时可辨
              const pin = () => {{
                for (const en of e.map.entities) {{
                  if (en.def.type !== '{t}') continue
                  en.def = Object.assign({{}}, en.def, {{ sight: 0, hearing: 0, speed: 0, lightLure: false, drainsLight: false, jamsLight: false }}) // 屏蔽 AI 感知
                  en.x = ex; en.y = ey; en.facing = ef
                  en.disguised = undefined; en.hidden = false
                  en.state = 'idle'; en.stateT = 999; en.targetX = ex; en.targetY = ey
                  en.attackCd = 999
                }}
              }}
              pin()
              window.__freeze = setInterval(pin, 50) // AI 每帧会转向/走位，持续钉住直到截图完成
            }})()""")
            pg.wait_for_timeout(500)
            path = os.path.join(OUT, f'{t}.png')
            pg.screenshot(path=path)
            br = brightness(path)
            ok = br > 8
            results.append((t, ok, br))
            print(f'{"PASS" if ok else "FAIL"} {t}: 截图 {os.path.getsize(path)}B 平均亮度 {br:.1f}')
            # 清场：移除该实体，避免互相遮挡
            pg.evaluate(f"""(() => {{
              if (window.__freeze) {{ clearInterval(window.__freeze); window.__freeze = null }}
              const m = window.__engine.map
              m.entities.splice(0, m.entities.length, ...m.entities.filter((en) => en.def.type !== '{t}'))
            }})()""")
        b.close()
finally:
    dev.terminate()

fails = [t for t, ok, _ in results if not ok]
print(f'\n结果：{len(results) - len(fails)}/{len(results)} 实体截图可辨')
if fails:
    print('失败：' + ','.join(fails))
    sys.exit(1)
