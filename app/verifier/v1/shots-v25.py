#!/usr/bin/env python3
# v25 验收：Playwright 截图——① 新物品图标（dev 给予全部 20 件新物品，背包界面无默认 box）
#           ② 栖息地实体生成位置（L9 街道室外 / L5 酒店室内 / L1 运输车小巷）
# 运行：python3 verifier/v1/shots-v25.py
import os, subprocess, sys, time, socket
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(ROOT, 'verifier', 'runs', 'shots-v25')
os.makedirs(OUT, exist_ok=True)
PORT = 5192
NEW_ITEMS = ['chalkstub', 'megfolder', 'rope', 'divemask', 'thingmeat', 'oddbook', 'cavingsuit',
             'xenonmarble', 'driedfruit', 'uvlamp', 'stonekazoo', 'pockets', 'housekey',
             'wheatgrain', 'nails', 'timber', 'presses', 'pamphlet', 'citywater', 'endnote']


def wait_port(port: int, timeout: float = 40):
    t0 = time.time()
    while time.time() - t0 < timeout:
        try:
            socket.create_connection(('127.0.0.1', port), 0.5).close()
            return True
        except OSError:
            time.sleep(0.3)
    return False


fails = []
def check(cond, msg):
    print(('  ✓ ' if cond else '  ✗ ') + msg)
    if not cond:
        fails.append(msg)


dev = subprocess.Popen(['npm', 'run', 'dev', '--', '--port', str(PORT), '--strictPort', '--host', '127.0.0.1'],
                       cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
try:
    assert wait_port(PORT), 'dev server 未启动'
    with sync_playwright() as p:
        b = p.chromium.launch(args=['--use-gl=swiftshader'])
        pg = b.new_page(viewport={'width': 1280, 'height': 800})
        errors = []
        pg.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)
        pg.on('pageerror', lambda e: errors.append(str(e)))
        pg.goto(f'http://127.0.0.1:{PORT}', wait_until='domcontentloaded')
        pg.evaluate("(() => { const b = [...document.querySelectorAll('button')].find(x => x.textContent.includes('开始游戏')); b && b.click() })()")
        pg.wait_for_function('window.__engine && !!window.__engine.map', timeout=30000)
        pg.evaluate('window.__engine.dev.god = true')
        pg.wait_for_timeout(2600)

        # ---- ① 新物品图标 ----
        print('[1] 新物品图标（背包界面）')
        for t in NEW_ITEMS:
            pg.evaluate(f"window.__engine.devGiveItem('{t}')")
        pg.wait_for_timeout(400)
        pg.keyboard.press('Tab')  # 打开背包
        pg.wait_for_timeout(800)
        stats = pg.evaluate("""(() => {
          const svgs = [...document.querySelectorAll('svg')]
          let itemSvgs = 0, boxSvgs = 0
          for (const s of svgs) {
            const h = s.innerHTML
            if (!h.includes('currentColor')) continue
            itemSvgs++
            if (/^<rect x="7" y="7" width="10" height="10"/.test(h.trim())) boxSvgs++
          }
          return { itemSvgs, boxSvgs }
        })()""")
        check(stats['boxSvgs'] == 0, f"无默认 box 图标（box={stats['boxSvgs']}，currentColor svg 共 {stats['itemSvgs']}）")
        check(stats['itemSvgs'] >= 20, f"物品图标数量 ≥20（实际 {stats['itemSvgs']}）")
        pg.screenshot(path=os.path.join(OUT, 'items.png'))
        pg.keyboard.press('Escape')
        pg.wait_for_timeout(400)

        # ---- ② 栖息地生成位置 ----
        def face_and_shot(level, types, name, want_outdoor):
            pg.evaluate(f'window.__engine.loadLevel({level})')
            pg.wait_for_timeout(2200)
            info = pg.evaluate("""(() => {
              const e = window.__engine, m = e.map
              return m.entities.filter(x => %s.includes(x.def.type) && !x.dead)
                .map(x => ({ t: x.def.type, x: x.x, y: x.y,
                  out: m.outdoor[Math.floor(x.y) * m.w + Math.floor(x.x)] === 1 }))
            })()""" % repr(types))
            ok_all = len(info) > 0 and all(e['out'] == want_outdoor for e in info)
            check(ok_all, f'L{level} {"/".join(types)} 全部生成在{"室外" if want_outdoor else "室内"}'
                          f'（{[(e["t"], round(e["x"]), round(e["y"]), e["out"]) for e in info]}）')
            if info:
                e0 = info[0]
                pg.evaluate(f"""(() => {{
                  const en = window.__engine, p = en.player
                  const t = {{ x: {e0['x']}, y: {e0['y']} }}
                  const dx = t.x - p.x, dy = t.y - p.y, d = Math.hypot(dx, dy)
                  const ux = dx / d, uy = dy / d
                  p.x = t.x - ux * 5; p.y = t.y - uy * 5; p.z = 0; p.vz = 0
                  window.__look.yaw = Math.atan2(-uy, -ux); window.__look.pitch = -0.05
                }})()""")
                pg.wait_for_timeout(900)
            pg.screenshot(path=os.path.join(OUT, name))

        print('[2] 栖息地实体生成位置')
        face_and_shot(9, ['watcher', 'strider', 'mangled'], 'habitat-l9-outdoor.png', True)
        face_and_shot(5, ['bellhop', 'mirrorself', 'skinstealer'], 'habitat-l5-indoor.png', False)
        # L1 运输车（若有）必须在室外小巷
        pg.evaluate('window.__engine.loadLevel(1)')
        pg.wait_for_timeout(2200)
        carriers = pg.evaluate("""(() => {
          const m = window.__engine.map
          return m.entities.filter(x => x.def.type === 'carrier')
            .map(x => ({ out: m.outdoor[Math.floor(x.y) * m.w + Math.floor(x.x)] === 1 }))
        })()""")
        check(all(c['out'] for c in carriers) if carriers else True,
              f'L1 运输车均在室外（{carriers if carriers else "本种子未生成"}）')
        pg.screenshot(path=os.path.join(OUT, 'habitat-l1.png'))

        check(len(errors) == 0, f'console 无报错（{errors[:3]}）')
        b.close()
finally:
    dev.terminate()
    try:
        dev.wait(timeout=5)
    except Exception:
        dev.kill()

print('\n结果：' + (f'{len(fails)} 项失败' if fails else '全部通过'))
sys.exit(1 if fails else 0)
