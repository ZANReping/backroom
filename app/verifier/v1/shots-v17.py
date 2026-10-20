#!/usr/bin/env python3
# v17：L0「教学关卡」无限生成验证截图
#   - 桌面 1280×800：无限行走 ~2 分钟（迷宫连续无边界）、六种变体房间、闪烁门出口交互进入 L1
#   - iPhone 13 视口（390×844）：行走冒烟 + 截图
# 用法：python3 verifier/v1/shots-v17.py [输出子目录名]
import os, subprocess, sys, time, socket, json
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(ROOT, 'verifier', 'runs', sys.argv[1] if len(sys.argv) > 1 else 'shots-v17')
os.makedirs(OUT, exist_ok=True)
PORT = 5197
failures = []


def wait_port(port: int, timeout: float = 40):
    t0 = time.time()
    while time.time() - t0 < timeout:
        try:
            socket.create_connection(('127.0.0.1', port), 0.5).close()
            return True
        except OSError:
            time.sleep(0.3)
    return False


def check(cond, msg):
    print(('  ✓ ' if cond else '  ✗ ') + msg)
    if not cond:
        failures.append(msg)


dev = subprocess.Popen(['npm', 'run', 'dev', '--', '--port', str(PORT), '--strictPort', '--host', '127.0.0.1'],
                       cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
try:
    assert wait_port(PORT), 'dev server 未启动'
    with sync_playwright() as pw:
        b = pw.chromium.launch(args=['--use-gl=swiftshader'])
        pg = b.new_page(viewport={'width': 1280, 'height': 800})
        errs = []
        pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
        pg.goto(f'http://127.0.0.1:{PORT}', wait_until='domcontentloaded')
        pg.locator('text=开始游戏').click(force=True, no_wait_after=True)
        pg.wait_for_function('window.__engine && !!window.__engine.map', timeout=30000)
        pg.evaluate('window.__engine.dev.god = true; window.__engine.dev.speed = true')
        pg.wait_for_timeout(3000)
        check(pg.evaluate('window.__engine.player.level') == 0, '起始于 L0 教学关卡')
        check(pg.evaluate('!!window.__engine.map.inf'), 'L0 无限模式激活')
        check(pg.evaluate('window.__engine.map.entities.length') == 0, 'L0 运行时零实体')
        pg.screenshot(path=os.path.join(OUT, 'v17-spawn.png'))

        # ---- 无限行走 ~2 分钟：随机转向一直前进，窗口应持续流式平移 ----
        pg.evaluate("""(() => {
          window.__baseYaw = 0
          window.__tickN = 0
          window.__walkT = setInterval(() => {
            window.__tickN++
            if (window.__tickN % 12 === 0) window.__baseYaw += Math.PI / 2 // 定期换向探索
            window.__look.yaw = window.__baseYaw + (Math.random() - 0.5) * 0.5
            // 软渲染帧率极低：以前进传送辅助模拟持续穿行（窗口平移由引擎自然触发）
            const e = window.__engine, p = e.player, m = e.map
            const fx = -Math.sin(window.__look.yaw), fz = -Math.cos(window.__look.yaw)
            for (let s = 20; s >= 2; s -= 2) {
              const tx = Math.floor(p.x + fx * s), ty = Math.floor(p.y + fz * s)
              if (tx >= 0 && ty >= 0 && tx < m.w && ty < m.h && m.tiles[ty * m.w + tx] === 1) { p.x += fx * s; p.y += fz * s; break }
            }
          }, 900)
        })()""")
        pg.keyboard.down('w')
        start = pg.evaluate('({x: window.__engine.map.inf.ox + window.__engine.player.x, y: window.__engine.map.inf.oy + window.__engine.player.y})')
        rev0 = pg.evaluate('window.__engine.map.inf.rev')
        t0 = time.time()
        while time.time() - t0 < 120:
            pg.wait_for_timeout(2000)
            # 卡住时大转向
            pg.evaluate('window.__look.yaw += (Math.random() < 0.3 ? 1.8 : 0)')
        end = pg.evaluate('({x: window.__engine.map.inf.ox + window.__engine.player.x, y: window.__engine.map.inf.oy + window.__engine.player.y})')
        rev1 = pg.evaluate('window.__engine.map.inf.rev')
        pg.keyboard.up('w')
        pg.evaluate('clearInterval(window.__walkT)')
        dist = ((end['x'] - start['x']) ** 2 + (end['y'] - start['y']) ** 2) ** 0.5
        nchunks = pg.evaluate('window.__engine.map.inf.chunks.size')
        check(dist > 120, f'无限行走 2 分钟世界位移 {dist:.0f}m >120m（迷宫连续无边界）')
        check(rev1 - rev0 >= 3, f'窗口平移 {rev1 - rev0} 次（流式生成/卸载进行中）')
        check(nchunks <= 25, f'已加载 chunk={nchunks} ≤25（内存/drawcall 受控）')
        check(pg.evaluate('window.__engine.map.entities.length') == 0, '行走 2 分钟后仍零实体')
        pg.wait_for_timeout(600)
        pg.screenshot(path=os.path.join(OUT, 'v17-infinite-walk.png'))

        # ---- 变体房间截图 ----
        for kind, label in [('arch', '拱门大厅'), ('pillarhall', '柱厅'), ('pit', '神坑'),
                            ('blackout', '熄灯区'), ('manila', '马尼拉室'), ('red', '红室')]:
            okk = pg.evaluate(f"window.__engine.devGotoVariant('{kind}')")
            check(okk, f'传送到变体「{label}」')
            if not okk:
                continue
            pg.wait_for_timeout(1500)
            # 环视选最开阔视角
            pg.evaluate("""(() => {
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
            })()""")
            pg.wait_for_timeout(800)
            pg.screenshot(path=os.path.join(OUT, f'v17-variant-{kind}.png'))

        # ---- 闪烁门出口：传送 → 截图 → 交互进入 L1 ----
        okk = pg.evaluate("window.__engine.devGotoExit()")
        check(okk, '传送到闪烁门出口')
        pg.wait_for_timeout(1200)
        pg.evaluate("""(() => {
          const e = window.__engine, p = e.player, ex = e.map.exits[0]
          if (ex) window.__look.yaw = Math.atan2(-(ex.x + 0.5 - p.x), -(ex.y + 0.5 - p.y))
          window.__look.pitch = 0
        })()""")
        pg.wait_for_timeout(500)
        pg.screenshot(path=os.path.join(OUT, 'v17-exit-flickerdoor.png'))
        lv0 = pg.evaluate('window.__engine.player.level')
        pg.evaluate('window.__engine.input.interact = true')
        try:
            pg.wait_for_function('window.__engine.player.level === 1', timeout=60000)
            check(True, '闪烁门交互成功进入 L1')
        except Exception:
            check(False, f'闪烁门交互未进入 L1（当前 level={pg.evaluate("window.__engine.player.level")}，交互前={lv0}）')
        pg.wait_for_timeout(1500)
        pg.screenshot(path=os.path.join(OUT, 'v17-l1-arrive.png'))

        check(len(errs) == 0, f'console 无报错（{len(errs)} 条）')
        if errs:
            print('CONSOLE ERRORS:', json.dumps(errs[:8], ensure_ascii=False, indent=1))
        pg.close()

        # ---- iPhone 13 视口 ----
        ctx = b.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True,
                            has_touch=True, device_scale_factor=3)
        mp = ctx.new_page()
        merrs = []
        mp.on('console', lambda m: merrs.append(m.text) if m.type == 'error' else None)
        mp.goto(f'http://127.0.0.1:{PORT}', wait_until='domcontentloaded')
        mp.locator('text=开始游戏').tap(force=True, no_wait_after=True)
        mp.wait_for_function('window.__engine && !!window.__engine.map', timeout=30000)
        mp.evaluate('window.__engine.dev.god = true; window.__engine.dev.speed = true')
        mp.wait_for_timeout(2500)
        mp.keyboard.down('w')
        mp.evaluate("""(() => {
          window.__walkT2 = setInterval(() => { window.__look.yaw += (Math.random() - 0.5) * 1.6 }, 900)
        })()""")
        mp.wait_for_timeout(25000)
        mp.keyboard.up('w')
        mp.evaluate('clearInterval(window.__walkT2)')
        check(mp.evaluate('!!window.__engine.map.inf'), '移动端：L0 无限模式激活')
        check(mp.evaluate('window.__engine.map.inf.chunks.size') <= 25, '移动端：chunk 数受控')
        mp.wait_for_timeout(500)
        mp.screenshot(path=os.path.join(OUT, 'v17-mobile-iphone13.png'))
        check(len(merrs) == 0, f'移动端 console 无报错（{len(merrs)} 条）')
        if merrs:
            print('MOBILE CONSOLE ERRORS:', json.dumps(merrs[:8], ensure_ascii=False, indent=1))
        ctx.close()
        b.close()
finally:
    dev.terminate()

print('结果：' + ('全部通过 ✓' if not failures else f'{len(failures)} 项失败 ✗'))
sys.exit(0 if not failures else 1)
