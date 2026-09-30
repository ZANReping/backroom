# v12 室外地板修复验证：
# 1) 渲染覆盖断言：6 层 × 8 种子，所有 outdoor=1 且 BFS 可达的瓦片，从瓦片中心向下 raycast
#    必须命中地形网格（MeshLambertMaterial+vertexColors）且高度≈地面高度（无地板缺失）。
# 2) Playwright 像素断言（桌面 + iPhone 13 视口）：L5 庭院看向铺装地面，
#    画面下半部暖色（r>b）像素占比高（地板与藏青夜空/蓝色池水可区分，不再「虚空化」）；
#    L1 小巷地面平均亮度超过阈值（黑暗中可辨）。
# 全程 console 无报错。
import sys, time, subprocess
from playwright.sync_api import sync_playwright
from PIL import Image
import numpy as np

PORT = 18414
proc = subprocess.Popen([sys.executable, '-m', 'http.server', str(PORT)], cwd='dist', stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1.0)
errors, failed = [], []

def check(cond, msg):
    print(('✓ ' if cond else '✗ ') + msg)
    if not cond: failed.append(msg)

COVERAGE_CHECK = '''() => {
  const eng = window.__engine, m = eng.map, THREE = window.__THREE
  const scene = window.__renderer.scene
  const ELEV_H = [0, -1.2, 1.2, 0]
  const idx = (x, y) => y * m.w + x
  const solidAt = (x, y) => m.structures.some(s => s.solid && x >= s.x && x < s.x + s.w && y >= s.y && y < s.y + s.h)
  const OPENABLE = ['hoteldoor', 'rollerdoor', 'glassdoor']
  const openableAt = (x, y) => m.structures.some(s => s.solid && OPENABLE.includes(s.kind) && x >= s.x && x < s.x + s.w && y >= s.y && y < s.y + s.h)
  const tileH = (x, y) => {
    if (x < 0 || y < 0 || x >= m.w || y >= m.h) return 0
    const st = m.step[idx(x, y)]
    if (!(st & 7)) return ELEV_H[m.elev[idx(x, y)]]
    return Math.min(ELEV_H[(st >> 3) & 3], ELEV_H[(st >> 5) & 3])
  }
  const groundAt = (fx, fy) => {
    const tx = Math.floor(fx), ty = Math.floor(fy)
    if (tx < 0 || ty < 0 || tx >= m.w || ty >= m.h) return 0
    const st = m.step[idx(tx, ty)]
    if (!(st & 7)) return ELEV_H[m.elev[idx(tx, ty)]]
    const dir = st & 7, lo = ELEV_H[(st >> 3) & 3], hi = ELEV_H[(st >> 5) & 3]
    const t0 = dir === 1 ? fx - tx : dir === 2 ? 1 - (fx - tx) : dir === 3 ? fy - ty : 1 - (fy - ty)
    const t = t0 * t0 * (3 - 2 * t0)
    return lo + (hi - lo) * t
  }
  const passFloor = (x, y) => x >= 0 && y >= 0 && x < m.w && y < m.h && m.tiles[idx(x, y)] === 1 && (!solidAt(x, y) || openableAt(x, y))
  const reach = new Uint8Array(m.w * m.h)
  const q = [[m.spawn.x, m.spawn.y]]
  reach[idx(m.spawn.x, m.spawn.y)] = 1
  while (q.length) {
    const [x, y] = q.pop()
    const h0 = tileH(x, y)
    for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
      const nx = x + dx, ny = y + dy
      if (nx < 0 || ny < 0 || nx >= m.w || ny >= m.h || reach[idx(nx, ny)]) continue
      if (!passFloor(nx, ny)) continue
      if (tileH(nx, ny) - h0 > 1.35) continue
      reach[idx(nx, ny)] = 1; q.push([nx, ny])
    }
  }
  const ray = new THREE.Raycaster()
  const down = new THREE.Vector3(0, -1, 0)
  const isTerrain = (o) => o.isMesh && o.material && o.material.isMeshLambertMaterial && o.material.vertexColors
  const missing = []
  let total = 0
  for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) {
    const i = idx(x, y)
    if (m.tiles[i] !== 1 || m.outdoor[i] !== 1 || !reach[i]) continue
    if (solidAt(x, y)) continue
    total++
    ray.set(new THREE.Vector3(x + 0.5, 3, y + 0.5), down)
    const hits = ray.intersectObjects(scene.children, true).filter(h => isTerrain(h.object))
    const gh = groundAt(x + 0.5, y + 0.5)
    if (!hits.some(h => Math.abs(h.point.y - gh) < 0.08)) missing.push([x, y, hits.length ? +hits[0].point.y.toFixed(2) : null])
  }
  return { total, missing, seed: eng.seed }
}'''

def warm_ratio(path):
    """画面中部偏下区域暖色（r>b+6）像素占比：庭院铺装 vs 藏青天空/蓝池水判别"""
    im = np.array(Image.open(path).convert('RGB')).astype(int)
    h, w = im.shape[:2]
    c = im[int(h*0.45):int(h*0.8), int(w*0.35):int(w*0.65)]
    r, g, b = c[:,:,0], c[:,:,1], c[:,:,2]
    warm = ((r > b + 6) & (r + g + b > 60)).mean()
    return float(warm)

def luminance(path):
    im = np.array(Image.open(path).convert('RGB')).astype(int)
    h, w = im.shape[:2]
    c = im[int(h*0.45):int(h*0.8), int(w*0.35):int(w*0.65)]
    return float((0.299*c[:,:,0] + 0.587*c[:,:,1] + 0.114*c[:,:,2]).mean())

def enter_game(page):
    page.add_init_script('localStorage.setItem("br_settings", JSON.stringify({devMode:true}))')
    page.goto(f'http://localhost:{PORT}/', wait_until='networkidle')
    page.wait_for_timeout(1200)
    btn = page.locator('text=坠入后室').first
    if btn.count(): btn.tap() if page.context._impl_obj._options.get('is_mobile') else btn.click()
    else:
        b = page.locator('button').first
        b.tap() if page.context._impl_obj._options.get('is_mobile') else b.click()
    page.wait_for_timeout(2200)
    sk = page.locator('text=进入').first
    if sk.count():
        try: sk.click()
        except Exception: pass
    page.wait_for_function('() => window.__engine && !window.__engine.paused && !!window.__engine.map && window.__renderer && window.__THREE', timeout=15000)
    page.wait_for_timeout(600)

def wait_level_ready(page):
    # devJump 弹出的层级介绍卡（fixed z-50 全屏黑卡，点击或 2.4s 后自动关闭）：主动点击中心跳过
    page.wait_for_timeout(600)
    vw = page.viewport_size['width'], page.viewport_size['height']
    for _ in range(6):
        present = page.evaluate('() => document.body.innerText.includes("SEED:")')
        if not present: break
        page.mouse.click(int(vw[0]/2), int(vw[1]/2))
        page.wait_for_timeout(500)
    st = page.evaluate('() => ({intro: document.body.innerText.includes("SEED:"), paused: window.__engine.paused})')
    print('  [wait_level_ready]', st)
    page.wait_for_timeout(400)

def shoot_l5_courtyard(page, path):
    page.evaluate('window.__engine.devJump(5)')
    wait_level_ready(page)
    page.evaluate('''() => {
      const eng = window.__engine, m = eng.map
      // 站庭院西北角铺装区（避开泳池 x46..52 y25..29），向东看铺装地面
      eng.player.x = 44.5; eng.player.y = 23.5; eng.player.z = 0
      eng.player.flashlight = true; eng.player.battery = 100
      eng.dev.god = true; eng.dev.invisible = true
      window.__look.yaw = -1.5708; window.__look.pitch = -0.55
    }''')
    page.wait_for_timeout(700)
    page.screenshot(path=path)

def shoot_l1_alley(page, path):
    page.evaluate('window.__engine.devJump(1)')
    wait_level_ready(page)
    page.evaluate('''() => {
      const eng = window.__engine, m = eng.map
      // 小巷室外区中心，沿巷看地面
      const out = []
      for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++)
        if (m.tiles[y*m.w+x] === 1 && m.outdoor[y*m.w+x] === 1) out.push([x, y])
      if (!out.length) return
      const c = out[Math.floor(out.length/2)]
      eng.player.x = c[0] + 0.5; eng.player.y = c[1] + 0.5; eng.player.z = 0
      eng.player.flashlight = true; eng.player.battery = 100
      eng.dev.god = true; eng.dev.invisible = true
      window.__look.yaw = -1.5708; window.__look.pitch = -0.5
    }''')
    page.wait_for_timeout(700)
    page.screenshot(path=path)

with sync_playwright() as pw:
    browser = pw.chromium.launch()
    # ===== 桌面视口：覆盖断言 + 像素断言 =====
    ctx = browser.new_context(viewport={'width': 1280, 'height': 720})
    page = ctx.new_page()
    page.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)
    page.on('pageerror', lambda e: errors.append(f'PAGEERROR {e}'))
    enter_game(page)
    print('✓ 进入游戏（桌面视口）')

    # 1) 6 层 × 8 种子 渲染覆盖断言
    cov_fail = 0
    for lvl in [0, 1, 2, 3, 4, 5]:
        page.evaluate(f'window.__engine.devJump({lvl})')
        page.wait_for_timeout(2000)
        for seed in range(8):
            if seed > 0:
                page.evaluate('window.__engine.devRegenLevel(true)')
                page.wait_for_timeout(2000)
            r = page.evaluate(COVERAGE_CHECK)
            if r['missing']:
                cov_fail += 1
                check(False, f'L{lvl} 种子#{seed}：{len(r["missing"])}/{r["total"]} 室外可达瓦片缺地板 {r["missing"][:8]}')
    check(cov_fail == 0, '6 层 × 8 种子：所有 outdoor=1 且可达瓦片均有地面几何（渲染覆盖）')

    # 2) L5 庭院截图 + 像素断言（地板与天空/池水可区分）
    shoot_l5_courtyard(page, '/tmp/v12_L5_courtyard_desktop.png')
    wr = warm_ratio('/tmp/v12_L5_courtyard_desktop.png')
    check(wr > 0.5, f'L5 庭院铺装地面暖色可辨（暖色占比 {wr*100:.1f}% > 50%，区别于藏青夜空/蓝池水）')
    # 3) L1 小巷截图 + 亮度断言
    shoot_l1_alley(page, '/tmp/v12_L1_alley_desktop.png')
    lm = luminance('/tmp/v12_L1_alley_desktop.png')
    check(lm > 30, f'L1 小巷地面亮度可辨（亮度 {lm:.1f} > 30，黑暗中不再像虚空）')
    ctx.close()

    # ===== iPhone 13 视口：L5 庭院截图确认 =====
    ctx2 = browser.new_context(
        viewport={'width': 390, 'height': 844}, device_scale_factor=3,
        is_mobile=True, has_touch=True, user_agent='Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1')
    page2 = ctx2.new_page()
    page2.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)
    page2.on('pageerror', lambda e: errors.append(f'PAGEERROR {e}'))
    enter_game(page2)
    print('✓ 进入游戏（iPhone 13 视口）')
    shoot_l5_courtyard(page2, '/tmp/v12_L5_courtyard_iphone.png')
    wr2 = warm_ratio('/tmp/v12_L5_courtyard_iphone.png')
    check(wr2 > 0.5, f'iPhone 13：L5 庭院铺装地面暖色可辨（{wr2*100:.1f}% > 50%）')
    ctx2.close()
    browser.close()

print('--- console errors:', len(errors))
for e in errors[:10]: print('  ', e)
check(len(errors) == 0, 'console 无报错')
proc.terminate()
if failed:
    print('FAILED:', failed); sys.exit(1)
print('ALL PASS')
