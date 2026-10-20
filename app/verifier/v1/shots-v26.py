#!/usr/bin/env python3
# v26 验收：Playwright 截图——① 右键装备互换（真实 mousedown Mouse2 事件链）
#           ② 马尼拉墙纸近景（tint=1 墙面显示米色竖纹墙纸纹理）
#           ③ 跳上桌子顶面站立 ④ 悬挂灯贴合天花板（桌面 + iPhone 13）
# 运行：python3 verifier/v1/shots-v26.py
import os, subprocess, sys, time, socket
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(ROOT, 'verifier', 'runs', 'shots-v26')
os.makedirs(OUT, exist_ok=True)
PORT = 5193


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
        # ================= 桌面 1280×800 =================
        b = p.chromium.launch(args=['--use-gl=swiftshader'])
        pg = b.new_page(viewport={'width': 1280, 'height': 800})
        errors = []
        pg.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)
        pg.on('pageerror', lambda e: errors.append(str(e)))
        pg.goto(f'http://127.0.0.1:{PORT}', wait_until='domcontentloaded')
        pg.evaluate("(() => { const b = [...document.querySelectorAll('button')].find(x => x.textContent.includes('开始游戏')); b && b.click() })()")
        pg.wait_for_function('window.__engine && !!window.__engine.map', timeout=30000)
        pg.evaluate('window.__engine.dev.god = true')
        pg.wait_for_timeout(3200)  # FallIntro 播完进入 game 屏

        # ---- ① 右键装备互换（真实 Mouse2 mousedown 事件链）----
        print('[1] 右键装备互换（桌面，事件链派发）')
        pg.evaluate("""(() => {
          const e = window.__engine
          e.player.hotbar = [null, null, null, null, null, null, null]
          e.devGiveItem('flashlight'); e.devGiveItem('lighter')
          e.player.selected = 0
          window.__look.locked = true // 模拟指针锁定状态（headless 无法真锁定）
        })()""")
        pg.wait_for_timeout(200)
        # 派发真实右键 mousedown（走 App.tsx onMouseDown → fireDiscrete('Mouse2') → quickUse）
        pg.evaluate("window.dispatchEvent(new MouseEvent('mousedown', { button: 2 }))")
        pg.wait_for_timeout(200)
        st1 = pg.evaluate("(() => ({ off: window.__engine.player.equip.offhand?.type, light: window.__engine.player.flashlight }))()")
        check(st1['off'] == 'flashlight', f"右键 → 手电装入副手（offhand={st1['off']}）")
        check(st1['light'] == True, '装备手电后点亮')
        pg.screenshot(path=os.path.join(OUT, 'd-rightclick-equip-flashlight.png'))
        # 选中打火机再右键 → 互换
        pg.evaluate("""(() => {
          const e = window.__engine
          e.player.selected = e.player.hotbar.findIndex(s => s && s.type === 'lighter')
        })()""")
        pg.evaluate("window.dispatchEvent(new MouseEvent('mousedown', { button: 2 }))")
        pg.wait_for_timeout(200)
        st2 = pg.evaluate("""(() => {
          const p = window.__engine.player
          return { off: p.equip.offhand?.type, back: p.hotbar.some(s => s && s.type === 'flashlight'), light: p.flashlight, lighter: p.hasLighter }
        })()""")
        check(st2['off'] == 'lighter' and st2['back'], f"右键 → 打火机与手电互换（offhand={st2['off']}，手电回快捷栏={st2['back']}）")
        check(st2['lighter'] == True and st2['light'] == False, '互换后打火机微光生效/手电关灯')
        pg.screenshot(path=os.path.join(OUT, 'd-rightclick-equip-swap.png'))

        # ---- ② 马尼拉墙纸近景 ----
        print('[2] 马尼拉墙纸近景（桌面）')
        got = pg.evaluate("window.__engine.devGotoVariant('manila')")
        check(got, '定位到马尼拉室')
        pg.wait_for_timeout(1500)
        # 找一面 tint=1 墙（非地板瓦片且 tint=1），站到其相邻地板格面对它
        shot2 = pg.evaluate("""(() => {
          const e = window.__engine, m = e.map, p = e.player
          const px = Math.floor(p.x), py = Math.floor(p.y)
          let best = null
          for (let r = 1; r <= 8 && !best; r++)
            for (let dy = -r; dy <= r && !best; dy++)
              for (let dx = -r; dx <= r && !best; dx++) {
                const x = px + dx, y = py + dy
                if (x < 0 || y < 0 || x >= m.w || y >= m.h) continue
                const i = y * m.w + x
                if (m.tint[i] !== 1 || m.tiles[i] === 1) continue
                // 找该墙瓦片相邻的 tint=1 地板格作为站位
                for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
                  const fx = x + ox, fy = y + oy
                  if (fx < 0 || fy < 0 || fx >= m.w || fy >= m.h) continue
                  const fi = fy * m.w + fx
                  if (m.tiles[fi] !== 1) continue
                  p.x = fx + 0.5; p.y = fy + 0.5; p.z = 0; p.vz = 0
                  const ux = (x + 0.5) - p.x, uy = (y + 0.5) - p.y
                  const d = Math.hypot(ux, uy)
                  window.__look.yaw = Math.atan2(-uy / d, ux / d)
                  window.__look.pitch = 0.05
                  best = { wall: [x, y], stand: [fx, fy] }
                  break
                }
              }
          return best
        })()""")
        check(bool(shot2), f'找到 tint=1 马尼拉墙并站位 {shot2}')
        pg.wait_for_timeout(1200)
        pg.screenshot(path=os.path.join(OUT, 'd-manila-wall-closeup.png'))
        # 断言：场景中存在使用马尼拉墙纸纹理的网格（256×256 程序化 CanvasTexture + 顶点色）
        mtex = pg.evaluate("""(() => {
          const r = window.__renderer
          let found = 0
          r.scene.traverse(o => {
            if (!o.isMesh) return
            const mat = o.material
            if (mat && mat.vertexColors && mat.map && mat.map.image && mat.map.image.width === 256) found++
          })
          return found
        })()""")
        check(mtex >= 1, f'场景存在马尼拉墙纸纹理网格（{mtex} 个）')

        # ---- ③ 跳上桌子顶面 ----
        print('[3] 跳上桌子顶面（桌面）')
        # 3a：助跑跳上桌子（真实输入链；失败不判死，3b 做确定性平台断言）
        st3 = pg.evaluate("""(() => {
          const e = window.__engine, m = e.map
          const t = m.structures.find(s => s.kind === 'table' && !s.data?.chair)
          if (!t) return null
          const p = e.player
          p.x = t.x + t.w / 2; p.y = t.y - 0.38; p.z = 0; p.vz = 0
          window.__look.yaw = Math.PI / 2; window.__look.pitch = -0.15 // 面向 +y（桌子方向）
          return { tx: t.x + t.w / 2, ty: t.y + t.h / 2 }
        })()""")
        check(bool(st3), '马尼拉室找到桌子')
        if st3:
            pg.evaluate("(() => { window.__engine.input.mx = 0; window.__engine.input.my = 1; window.__engine.input.jump = true })()")
            z = 0.0
            for _ in range(12):
                pg.wait_for_timeout(100)
                z = pg.evaluate("window.__engine.player.z")
                if abs(z - 0.75) < 0.05:
                    break
            pg.evaluate("(() => { window.__engine.input.my = 0 })()")
            pg.wait_for_timeout(400)
            z = pg.evaluate("window.__engine.player.z")
            print(f'    （助跑跳桌结果 z={z:.2f}；3b 做确定性断言）')
            # 3b：确定性平台断言——从桌面正上方 1.2m 落下，必须停在桌面 0.75m（顶面=可站立平台）
            pg.evaluate(f"""(() => {{
              const p = window.__engine.player
              p.x = {st3['tx']}; p.y = {st3['ty']}; p.z = 1.2; p.vz = 0
            }})()""")
            # headless 软件渲染帧率低，用条件等待而非固定时长
            try:
                pg.wait_for_function("Math.abs(window.__engine.player.z - 0.75) < 0.05 || window.__engine.player.z === 0", timeout=20000, polling=300)
            except Exception:
                pass
            z = pg.evaluate("window.__engine.player.z")
            check(abs(z - 0.75) < 0.05, f'桌子顶面可站立（落稳后 z={z:.2f} ≈ 0.75）')
            pg.evaluate("window.__look.pitch = -0.5")
            pg.wait_for_timeout(300)
            pg.screenshot(path=os.path.join(OUT, 'd-jump-onto-table.png'))

        # ---- ④ 悬挂灯贴合天花板 ----
        print('[4] 悬挂灯贴合天花板（桌面）')
        st4 = pg.evaluate("""(() => {
          const e = window.__engine, m = e.map
          const h = m.structures.find(s => s.kind === 'hanglight')
          if (!h) return null
          const p = e.player
          const cx = h.x + h.w / 2, cy = h.y + h.h / 2
          p.x = cx + 1.6; p.y = cy + 1.6; p.z = 0; p.vz = 0
          const ux = cx - p.x, uy = cy - p.y, d = Math.hypot(ux, uy)
          window.__look.yaw = Math.atan2(-uy / d, ux / d)
          window.__look.pitch = 0.55 // 抬头看灯
          return { kind: h.kind, x: cx, y: cy }
        })()""")
        check(bool(st4), f'找到悬挂灯 {st4}')
        pg.wait_for_timeout(900)
        pg.screenshot(path=os.path.join(OUT, 'd-hanglight-ceiling.png'))

        check(len(errors) == 0, f'桌面 console 无报错（{errors[:3]}）')
        b.close()

        # ================= iPhone 13 =================
        print('[5] iPhone 13 移动端')
        b2 = p.chromium.launch(args=['--use-gl=swiftshader'])
        ctx = b2.new_context(**p.devices['iPhone 13'])
        mp = ctx.new_page()
        merrors = []
        mp.on('console', lambda m: merrors.append(m.text) if m.type == 'error' else None)
        mp.on('pageerror', lambda e: merrors.append(str(e)))
        mp.goto(f'http://127.0.0.1:{PORT}', wait_until='domcontentloaded')
        mp.evaluate("(() => { const b = [...document.querySelectorAll('button')].find(x => x.textContent.includes('开始游戏')); b && b.click() })()")
        mp.wait_for_function('window.__engine && !!window.__engine.map', timeout=30000)
        mp.evaluate('window.__engine.dev.god = true')
        mp.wait_for_timeout(3200)
        mp.evaluate("window.__engine.devGotoVariant('manila')")
        mp.wait_for_timeout(1500)
        mp.evaluate("""(() => {
          const e = window.__engine, m = e.map, p = e.player
          const px = Math.floor(p.x), py = Math.floor(p.y)
          for (let r = 1; r <= 8; r++)
            for (let dy = -r; dy <= r; dy++)
              for (let dx = -r; dx <= r; dx++) {
                const x = px + dx, y = py + dy
                if (x < 0 || y < 0 || x >= m.w || y >= m.h) continue
                const i = y * m.w + x
                if (m.tint[i] !== 1 || m.tiles[i] === 1) continue
                for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
                  const fx = x + ox, fy = y + oy
                  if (fx < 0 || fy < 0 || fx >= m.w || fy >= m.h) continue
                  if (m.tiles[fy * m.w + fx] !== 1) continue
                  p.x = fx + 0.5; p.y = fy + 0.5; p.z = 0; p.vz = 0
                  const ux = (x + 0.5) - p.x, uy = (y + 0.5) - p.y, d = Math.hypot(ux, uy)
                  window.__look.yaw = Math.atan2(-uy / d, ux / d)
                  window.__look.pitch = 0.05
                  return true
                }
              }
          return false
        })()""")
        mp.wait_for_timeout(1200)
        mp.screenshot(path=os.path.join(OUT, 'm-manila-wall-closeup.png'))
        mp.evaluate("""(() => {
          const e = window.__engine, m = e.map
          const h = m.structures.find(s => s.kind === 'hanglight')
          if (!h) return
          const p = e.player
          const cx = h.x + h.w / 2, cy = h.y + h.h / 2
          p.x = cx + 1.4; p.y = cy + 1.4; p.z = 0; p.vz = 0
          const ux = cx - p.x, uy = cy - p.y, d = Math.hypot(ux, uy)
          window.__look.yaw = Math.atan2(-uy / d, ux / d)
          window.__look.pitch = 0.55
        })()""")
        mp.wait_for_timeout(900)
        mp.screenshot(path=os.path.join(OUT, 'm-hanglight-ceiling.png'))
        check(len(merrors) == 0, f'iPhone 13 console 无报错（{merrors[:3]}）')
        b2.close()
finally:
    dev.terminate()
    try:
        dev.wait(timeout=5)
    except Exception:
        dev.kill()

print('\n结果：' + (f'{len(fails)} 项失败' if fails else '全部通过'))
sys.exit(1 if fails else 0)
