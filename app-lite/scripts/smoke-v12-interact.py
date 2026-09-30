# v12 多可交互物优先级修复验证：
# 构造上锁房门 + 普通房门相邻场景（注入结构 + 强制渲染重建），断言：
#   A) 角度优先：上锁门更近但偏 45°、普通门正对稍远 → 提示与执行目标一致且为普通门
#   B) 同角同距平局：两门对称 → 可执行（普通门）优先于不可执行（上锁无撬棍）
#   C) HUD 提示文本 = engine.getInteract().label = 实际执行目标（三者一致）
# Playwright 截图（桌面 + iPhone 13），全程 console 无报错。
import sys, time, subprocess
from playwright.sync_api import sync_playwright

PORT = 18417
proc = subprocess.Popen([sys.executable, '-m', 'http.server', str(PORT)], cwd='dist', stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1.0)
errors, failed = [], []

def check(cond, msg):
    print(('✓ ' if cond else '✗ ') + msg)
    if not cond: failed.append(msg)

# 找一块 3×3 全地板、周边 2.6m 无结构/物品/出口的室内空地，返回瓦片坐标
FIND_SPOT = '''() => {
  const m = window.__engine.map
  const idx = (x, y) => y * m.w + x
  const noStruct = (x, y) => !m.structures.some(s => x >= s.x - 0.6 && x < s.x + s.w + 0.6 && y >= s.y - 0.6 && y < s.y + s.h + 0.6)
  for (let y = 3; y < m.h - 3; y++) for (let x = 3; x < m.w - 3; x++) {
    let ok = true
    for (let j = y - 2; j <= y && ok; j++) for (let i = x - 1; i <= x + 1 && ok; i++)
      if (m.tiles[idx(i, j)] !== 1 || m.outdoor[idx(i, j)] === 1) ok = false
    if (!ok) continue
    // 周边 2.6m 无结构、2.2m 无物品、2.0m 无出口
    for (const s of m.structures) if (Math.hypot(s.x + s.w/2 - (x + 0.5), s.y + s.h/2 - (y + 0.5)) < 2.6) { ok = false; break }
    if (!ok) continue
    for (const it of m.items) if (Math.hypot(it.x - (x + 0.5), it.y - (y + 0.5)) < 2.2) { ok = false; break }
    if (!ok) continue
    for (const e of m.exits) if (Math.hypot(e.x + 0.5 - (x + 0.5), e.y + 0.5 - (y + 0.5)) < 2.0) { ok = false; break }
    if (ok) return { x, y }
  }
  return null
}'''

# 注入一对相邻房门并强制渲染重建；doors = [[dx,dy,locked],...]（相对 spot 瓦片）
INJECT = '''({ spot, doors }) => {
  const eng = window.__engine, m = eng.map
  const made = []
  for (const [dx, dy, locked] of doors) {
    const s = { kind: 'hoteldoor', x: spot.x + dx, y: spot.y + dy, w: 1, h: 1, solid: true, data: { open: 0, locked, injected: 1 } }
    m.structures.push(s); made.push(s)
  }
  window.__renderer.builtMap = null // 强制渲染层重建，注入的门可见
  window.__injected = (window.__injected || []).concat(made)
  return made.map(s => ({ x: s.x, y: s.y, locked: s.data.locked }))
}'''

CLEANUP = '''() => {
  const eng = window.__engine, m = eng.map
  m.structures = m.structures.filter(s => !s.data?.injected)
  window.__renderer.builtMap = null
  window.__injected = []
}'''

# 传送玩家到 spot 瓦片中心（dy 偏移），面朝北
PLACE_PLAYER = '''({ spot, dy }) => {
  const eng = window.__engine
  eng.player.x = spot.x + 0.5; eng.player.y = spot.y + 0.5 + dy; eng.player.z = 0
  eng.player.facing = -Math.PI / 2
  window.__look.yaw = Math.PI / 2; window.__look.pitch = 0
  eng.player.flashlight = true; eng.player.battery = 100
  eng.dev.god = true; eng.dev.invisible = true
}'''

DOOR_STATES = '''() => (window.__injected || []).map(s => ({ x: s.x, y: s.y, locked: s.data?.locked, open: s.data?.open }))'''

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

def jump_l5(page):
    page.evaluate('window.__engine.devJump(5)')
    page.wait_for_timeout(600)
    vw = page.viewport_size
    for _ in range(6):
        if not page.evaluate('() => document.body.innerText.includes("SEED:")'): break
        page.mouse.click(int(vw['width']/2), int(vw['height']/2))
        page.wait_for_timeout(500)
    page.wait_for_timeout(400)

def hud_hint(page, label):
    # HUD 提示（桌面 [E] 标签 / 移动端图标+标签）须展示 engine.getInteract() 的同一 label
    return page.evaluate('''(label) => {
      const els = [...document.querySelectorAll('div,span')].filter(e => e.children.length <= 2 && e.textContent.includes(label))
      return els.length > 0
    }''', label)

def run_scenarios(page, tag, shot_prefix):
    jump_l5(page)
    spot = page.evaluate(FIND_SPOT)
    check(spot is not None, f'{tag}：找到 3×3 干净室内空地 {spot}')
    if spot is None: return

    # ===== 场景 B：同角同距平局——对称两门，可执行（普通门）优先 =====
    page.evaluate(INJECT, { 'spot': spot, 'doors': [[-1, -2, 1], [1, -2, 0]] })  # 左=上锁 右=普通
    page.evaluate(PLACE_PLAYER, { 'spot': spot, 'dy': -1.0 })  # 玩家站 (spot, spot-1) 面朝北
    page.wait_for_timeout(400)
    label = page.evaluate('window.__engine.getInteract()?.label ?? null')
    check(label == '打开 房门', f'{tag} 平局场景：提示目标=「{label}」（应为「打开 房门」而非上锁门）')
    check(hud_hint(page, label or ''), f'{tag} 平局场景：HUD 提示文本与 engine 一致（均显示「{label}」）')
    page.screenshot(path=f'/tmp/{shot_prefix}_tie_hint.png')
    page.evaluate('window.__engine.input.interact = true')
    page.wait_for_timeout(400)
    states = page.evaluate(DOOR_STATES)
    normal = [s for s in states if not s['locked']]
    locked = [s for s in states if s['locked']]
    check(normal and normal[0]['open'] == 1, f'{tag} 平局场景：执行后普通门已开（{states}）')
    check(locked and locked[0]['open'] == 0 and locked[0]['locked'] == 1, f'{tag} 平局场景：上锁门未被触发（{states}）')
    page.screenshot(path=f'/tmp/{shot_prefix}_tie_after.png')
    page.evaluate(CLEANUP)
    page.wait_for_timeout(300)

    # ===== 场景 A：角度优先——上锁门更近(45°偏角) 普通门正对稍远 =====
    page.evaluate(INJECT, { 'spot': spot, 'doors': [[1, -1, 1], [0, -2, 0]] })  # 东北近处=上锁 正北远处=普通
    page.evaluate(PLACE_PLAYER, { 'spot': spot, 'dy': 0.0 })
    page.wait_for_timeout(400)
    label = page.evaluate('window.__engine.getInteract()?.label ?? null')
    check(label == '打开 房门', f'{tag} 角度优先：正对普通门优先于更近偏角上锁门（提示=「{label}」）')
    check(hud_hint(page, label or ''), f'{tag} 角度优先：HUD 提示与执行目标一致（均显示「{label}」）')
    page.screenshot(path=f'/tmp/{shot_prefix}_angle_hint.png')
    page.evaluate('window.__engine.input.interact = true')
    page.wait_for_timeout(400)
    states = page.evaluate(DOOR_STATES)
    normal = [s for s in states if not s['locked']]
    locked = [s for s in states if s['locked']]
    check(normal and normal[0]['open'] == 1, f'{tag} 角度优先：执行后普通门已开（{states}）')
    check(locked and locked[0]['open'] == 0 and locked[0]['locked'] == 1, f'{tag} 角度优先：上锁门未被触发（{states}）')
    page.screenshot(path=f'/tmp/{shot_prefix}_angle_after.png')
    page.evaluate(CLEANUP)

with sync_playwright() as pw:
    browser = pw.chromium.launch()
    # 桌面视口
    ctx = browser.new_context(viewport={'width': 1280, 'height': 720})
    page = ctx.new_page()
    page.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)
    page.on('pageerror', lambda e: errors.append(f'PAGEERROR {e}'))
    enter_game(page, False)
    print('✓ 进入游戏（桌面视口）')
    run_scenarios(page, '桌面', 'v12_interact_desktop')
    ctx.close()
    # iPhone 13 视口
    ctx2 = browser.new_context(
        viewport={'width': 390, 'height': 844}, device_scale_factor=3,
        is_mobile=True, has_touch=True, user_agent='Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1')
    page2 = ctx2.new_page()
    page2.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)
    page2.on('pageerror', lambda e: errors.append(f'PAGEERROR {e}'))
    enter_game(page2, True)
    print('✓ 进入游戏（iPhone 13 视口）')
    run_scenarios(page2, 'iPhone', 'v12_interact_iphone')
    ctx2.close()
    browser.close()

print('--- console errors:', len(errors))
for e in errors[:10]: print('  ', e)
check(len(errors) == 0, 'console 无报错')
proc.terminate()
if failed:
    print('FAILED:', failed); sys.exit(1)
print('ALL PASS')
