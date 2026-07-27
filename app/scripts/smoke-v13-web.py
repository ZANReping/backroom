# v13 多层/液体 Web 冒烟（Playwright，桌面 1280×800 + iPhone 13）：
#  L4：双层生成（map.floors===2）、楼梯/上层截图、player.floor 随 z 切换
#  L5：泳池水下截图（下沉+水下视野）、回廊截图
#  全程 console 无报错。
import sys, time, subprocess
from playwright.sync_api import sync_playwright

PORT = 18431
proc = subprocess.Popen([sys.executable, '-m', 'http.server', str(PORT)], cwd='dist', stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1.0)
errors, failed = [], []

def check(cond, msg):
    print(('✓ ' if cond else '✗ ') + msg)
    if not cond: failed.append(msg)

def enter_game(page, mobile):
    page.add_init_script('localStorage.setItem("br_settings", JSON.stringify({devMode:true}))')
    page.goto(f'http://localhost:{PORT}/', wait_until='networkidle')
    page.wait_for_timeout(1200)
    btn = page.locator('text=坠入后室').first
    b = btn if btn.count() else page.locator('button').first
    try:
        b.tap() if mobile else b.click()
    except Exception: pass
    page.wait_for_timeout(2200)
    sk = page.locator('text=进入').first
    if sk.count():
        try: sk.click()
        except Exception: pass
    page.wait_for_function('() => window.__engine && !window.__engine.paused && !!window.__engine.map && window.__renderer', timeout=15000)
    page.wait_for_timeout(600)

def jump(page, lvl):
    page.evaluate(f'window.__engine.devJump({lvl})')
    page.wait_for_timeout(600)
    # 层级过渡遮罩（含 SEED: 字样）需点击跳过，否则引擎暂停不更新
    vw = page.viewport_size
    for _ in range(6):
        if not page.evaluate('() => document.body.innerText.includes("SEED:")'): break
        page.mouse.click(int(vw['width']/2), int(vw['height']/2))
        page.wait_for_timeout(500)
    page.wait_for_timeout(400)

# 传送到楼梯底格、面朝楼梯方向（看楼梯）；返回是否存在楼梯
GOTO_STAIR = '''() => {
  const eng = window.__engine, m = eng.map
  for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) {
    const v = m.stair[y * m.w + x]
    if ((v & 7) && ((v >> 3) & 0x3fff) === 0) {
      const dir = v & 7
      // 站在底格前方 1.2m 回望楼梯
      const dx = dir === 1 ? 1 : dir === 2 ? -1 : 0, dy = dir === 3 ? 1 : dir === 4 ? -1 : 0
      eng.player.x = x + 0.5 - dx * 1.2; eng.player.y = y + 0.5 - dy * 1.2; eng.player.z = 0
      eng.player.facing = Math.atan2(dy, dx)
      window.__look.yaw = -Math.atan2(dy, dx) + Math.PI / 2 // 朝向约定：facing=atan2，yaw=-facing+PI/2（v12 惯例）
      window.__look.pitch = 0.15
      eng.player.flashlight = true; eng.player.battery = 100
      eng.dev.god = true; eng.dev.invisible = true
      return { x, y, dir }
    }
  }
  return null
}'''

# 走上楼梯顶（模拟输入），返回最终 z/floor
CLIMB_STAIR = '''async () => {
  const eng = window.__engine
  window.__look.yaw = 0; window.__look.pitch = 0.1 // 屏幕系输入=世界系（applyView 恒等）
  const p = eng.player, m = eng.map
  for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) {
    const v = m.stair[y * m.w + x]
    if ((v & 7) && ((v >> 3) & 0x3fff) === 0) {
      const dir = v & 7
      p.x = x + 0.5; p.y = y + 0.5; p.z = 0; p.vz = 0
      const mv = dir === 1 ? [1, 0] : dir === 2 ? [-1, 0] : dir === 3 ? [0, 1] : [0, -1]
      for (let k = 0; k < 300 && !(p.floor === 1 && p.z > 2.9); k++) {
        eng.input.mx = mv[0]; eng.input.my = mv[1]
        await new Promise(r => requestAnimationFrame(r))
      }
      eng.input.mx = 0; eng.input.my = 0
      await new Promise(r => setTimeout(r, 400))
      return { z: p.z, floor: p.floor, x: p.x, y: p.y }
    }
  }
  return null
}'''

# 上层环顾（站在上层可达格，四下看）
GOTO_UPPER = '''() => {
  const eng = window.__engine, m = eng.map
  // 找离楼梯顶最近的上层格
  for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) {
    const i = y * m.w + x
    if (m.up[i] === 1 && m.upWall[i] !== 1 && m.stair[i] === 0 && !m.structures.some(s => (s.floor ?? 0) === 1 && x >= s.x && x < s.x + s.w && y >= s.y && y < s.y + s.h)) {
      eng.player.x = x + 0.5; eng.player.y = y + 0.5; eng.player.z = 3.0; eng.player.vz = 0
      window.__look.pitch = -0.1
      return { x, y }
    }
  }
  return null
}'''

# 泳池入水：传送到池中央，轮询等待下沉至池底（无头 rAF 帧率不定，按模拟时间等待）
GOTO_POOL = '''async () => {
  const eng = window.__engine
  const p = eng.player
  p.x = 49.5; p.y = 27.5; p.z = 0; p.vz = 0
  eng.dev.god = true
  for (let k = 0; k < 120 && !(p.z <= -1.6); k++) await new Promise(r => setTimeout(r, 100))
  return { z: p.z, inLiquid: eng.inLiquid, submerged: eng.submerged, uwK: window.__renderer.uwK }
}'''

def run(page, tag, mobile):
    # ---- L4 多层 ----
    jump(page, 4)
    info = page.evaluate('() => ({ floors: window.__engine.map.floors, lifts: window.__engine.map.structures.filter(s => s.kind === "lift").length })')
    check(info['floors'] == 2, f'{tag} L4 双层生成（floors={info["floors"]}）')
    check(info['lifts'] >= 1, f'{tag} L4 电梯存在（{info["lifts"]}）')
    st = page.evaluate(GOTO_STAIR)
    check(st is not None, f'{tag} L4 楼梯存在 {st}')
    page.wait_for_timeout(500)
    page.screenshot(path=f'/tmp/v13_{tag}_l4_stairs.png')
    r = page.evaluate(CLIMB_STAIR)
    check(r is not None and r['floor'] == 1 and r['z'] > 2.9, f'{tag} L4 走楼梯上二层（z={r and round(r["z"],2)} floor={r and r["floor"]}）')
    page.wait_for_timeout(400)
    page.screenshot(path=f'/tmp/v13_{tag}_l4_upper.png')
    up = page.evaluate(GOTO_UPPER)
    check(up is not None, f'{tag} L4 上层可站立格 {up}')
    page.wait_for_timeout(400)
    page.screenshot(path=f'/tmp/v13_{tag}_l4_upper2.png')
    # ---- L5 泳池水下 ----
    jump(page, 5)
    fl = page.evaluate('() => window.__engine.map.floors')
    check(fl == 2, f'{tag} L5 回廊/夹层生成（floors={fl}）')
    r = page.evaluate(GOTO_POOL)
    check(r['inLiquid'] == 1 and r['z'] <= -1.6, f'{tag} L5 泳池下沉（z={round(r["z"],2)} inLiquid={r["inLiquid"]}）')
    check(r['submerged'], f'{tag} L5 头没入水下（submerged={r["submerged"]}）')
    page.wait_for_timeout(500)
    page.screenshot(path=f'/tmp/v13_{tag}_l5_underwater.png')
    # 回廊截图
    up5 = page.evaluate(GOTO_UPPER)
    check(up5 is not None, f'{tag} L5 回廊可站立 {up5}')
    page.wait_for_timeout(400)
    page.screenshot(path=f'/tmp/v13_{tag}_l5_gallery.png')

with sync_playwright() as pw:
    # 容器 /dev/shm 小易致 chromium 崩（EPIPE），禁用 + swiftshader
    LAUNCH_ARGS = ['--disable-dev-shm-usage', '--enable-unsafe-swiftshader', '--disable-gpu']
    # 桌面 1280×800
    b = pw.chromium.launch(args=LAUNCH_ARGS)
    ctx = b.new_context(viewport={'width': 1280, 'height': 800})
    page = ctx.new_page()
    page.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)
    page.on('pageerror', lambda e: errors.append(str(e)))
    enter_game(page, False)
    run(page, 'pc', False)
    ctx.close(); b.close()
    # iPhone 13
    b = pw.chromium.launch(args=LAUNCH_ARGS)
    ctx = b.new_context(**pw.devices['iPhone 13'])
    page = ctx.new_page()
    page.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)
    page.on('pageerror', lambda e: errors.append(str(e)))
    enter_game(page, True)
    run(page, 'mob', True)
    ctx.close(); b.close()

check(len(errors) == 0, f'console 无报错（{len(errors)}）' + (f'：{errors[:3]}' if errors else ''))
proc.terminate()
print('\n== v13-web 冒烟全部通过 ==' if not failed else f'\n== v13-web {len(failed)} 项失败 ==')
sys.exit(1 if failed else 0)
