# v12 诊断：L5 庭院泳池区 / L1 小巷 室外地板缺失复现
# 方法：Playwright 进入游戏 → devJump(5) → 传送到庭院 → 朝下看截图；
#       同时从每个 outdoor=1 且 tiles=1 的瓦片正上方向下 raycast，统计未命中地板的瓦片。
import sys, time, subprocess
from playwright.sync_api import sync_playwright

PORT = 18412
proc = subprocess.Popen([sys.executable, '-m', 'http.server', str(PORT)], cwd='dist', stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1.0)
errors = []

RAYCAST_CHECK = '''() => {
  const eng = window.__engine, m = eng.map
  const THREE = window.__THREE
  const scene = window.__scene
  const ray = new THREE.Raycaster()
  const down = new THREE.Vector3(0, -1, 0)
  const missing = [], hit0 = []
  let total = 0
  for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) {
    const i = y * m.w + x
    if (m.tiles[i] !== 1 || m.outdoor[i] !== 1) continue
    total++
    ray.set(new THREE.Vector3(x + 0.5, 5, y + 0.5), down)
    const hits = ray.intersectObjects(scene.children, true).filter(h => h.object.visible)
    if (!hits.length) { missing.push([x, y]); continue }
    const hy = hits[0].point.y
    // 命中结构（灯杆/门）也算有东西，但地板高度应为 ELEV_H[elev]±0.1
    if (Math.abs(hy - 0) > 0.15 && hy > 0.2) hit0.push([x, y, +hy.toFixed(2)])
  }
  return { total, missing, hit0: hit0.slice(0, 20), hit0n: hit0.length }
}'''

with sync_playwright() as pw:
    browser = pw.chromium.launch(args=['--use-gl=angle', '--enable-webgl'])
    ctx = browser.new_context(viewport={'width': 1280, 'height': 720})
    page = ctx.new_page()
    page.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)
    page.on('pageerror', lambda e: errors.append(f'PAGEERROR {e}'))
    page.add_init_script('localStorage.setItem("br_settings", JSON.stringify({devMode:true}))')
    page.goto(f'http://localhost:{PORT}/', wait_until='networkidle')
    page.wait_for_timeout(1200)
    btn = page.locator('text=坠入后室').first
    if btn.count(): btn.click()
    else: page.locator('button').first.click()
    page.wait_for_timeout(2200)
    sk = page.locator('text=进入').first
    if sk.count():
        try: sk.click()
        except Exception: pass
    page.wait_for_function('() => window.__engine && !window.__engine.paused && !!window.__engine.map', timeout=15000)
    page.wait_for_timeout(800)

    # 暴露 THREE 与 scene 供 raycast
    exposed = page.evaluate('''() => {
      const eng = window.__engine
      // renderer 实例挂在哪？找 scene
      let scene = null
      if (window.__renderer) scene = window.__renderer.scene
      if (!scene && eng.renderer) scene = eng.renderer.scene
      if (!scene) {
        // 从 engine 找
        for (const k of Object.keys(eng)) { const v = eng[k]; if (v && v.scene) { scene = v.scene; break } }
      }
      window.__scene = scene
      return { hasScene: !!scene, hasTHREE: !!window.__THREE, keys: Object.keys(eng).slice(0, 30) }
    }''')
    print('exposed:', exposed)

    for lvl in [5, 1]:
        page.evaluate(f'window.__engine.devJump({lvl})')
        page.wait_for_timeout(2500)
        # 找室外瓦片并传送
        info = page.evaluate('''() => {
          const eng = window.__engine, m = eng.map
          const out = []
          for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) {
            const i = y * m.w + x
            if (m.tiles[i] === 1 && m.outdoor[i] === 1) out.push([x, y])
          }
          if (!out.length) return { n: 0 }
          const c = out[Math.floor(out.length / 2)]
          eng.player.x = c[0] + 0.5; eng.player.y = c[1] + 0.5; eng.player.z = 0
          eng.player.flashlight = true; eng.player.battery = 100
          eng.dev.god = true; eng.dev.invisible = true
          return { n: out.length, center: c, all: out.slice(0, 400) }
        }''')
        print(f'L{lvl} outdoor tiles:', info.get('n'), 'center:', info.get('center'))
        if not info.get('n'): continue
        page.wait_for_timeout(600)
        # 朝下看
        page.evaluate('window.__look.yaw = 0; window.__look.pitch = -1.3')
        page.wait_for_timeout(500)
        page.screenshot(path=f'/tmp/v12_L{lvl}_outdoor_down.png')
        # 平视图
        page.evaluate('window.__look.pitch = -0.35')
        page.wait_for_timeout(400)
        page.screenshot(path=f'/tmp/v12_L{lvl}_outdoor_view.png')
        if exposed.get('hasScene'):
            rc = page.evaluate(RAYCAST_CHECK)
            print(f'L{lvl} raycast: total={rc["total"]} missing={rc["missing"]} badHeight n={rc["hit0n"]} sample={rc["hit0"][:8]}')
    browser.close()

print('--- console errors:', len(errors))
for e in errors[:10]: print('  ', e)
proc.terminate()
