# v12 诊断：6 层 × 8 种子，outdoor=1 且可达瓦片的地板几何覆盖检查
# 页面内断言：对每个 outdoor=1 & tiles=1 & BFS 可达瓦片，从瓦片中心上方 3m 向下 raycast，
# 只接受 MeshLambertMaterial + vertexColors 的网格（地板/墙/坡道/风道），命中高度须≈地面高度。
import sys, time, subprocess
from playwright.sync_api import sync_playwright

PORT = 18413
proc = subprocess.Popen([sys.executable, '-m', 'http.server', str(PORT)], cwd='dist', stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1.0)
errors = []

CHECK = '''() => {
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
  // BFS 可达（复制 mapgen 规则）
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
  // raycast 地板覆盖（只统计 Lambert+vertexColors 网格 = 地板/墙/坡道/风道合并网格）
  const ray = new THREE.Raycaster()
  const down = new THREE.Vector3(0, -1, 0)
  const isTerrain = (o) => o.isMesh && o.material && o.material.isMeshLambertMaterial && o.material.vertexColors
  const missing = []
  let total = 0
  for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) {
    const i = idx(x, y)
    if (m.tiles[i] !== 1 || m.outdoor[i] !== 1 || !reach[i]) continue
    if (solidAt(x, y)) continue // 结构占位瓦片不站人
    total++
    ray.set(new THREE.Vector3(x + 0.5, 3, y + 0.5), down)
    const hits = ray.intersectObjects(scene.children, true).filter(h => isTerrain(h.object))
    const gh = groundAt(x + 0.5, y + 0.5)
    const ok = hits.some(h => Math.abs(h.point.y - gh) < 0.08)
    if (!ok) missing.push([x, y, hits.length ? +hits[0].point.y.toFixed(2) : null])
  }
  return { level: eng.map ? undefined : 0, total, missing, seed: eng.seed }
}'''

with sync_playwright() as pw:
    browser = pw.chromium.launch()
    ctx = browser.new_context(viewport={'width': 960, 'height': 600})
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
    page.wait_for_function('() => window.__engine && !window.__engine.paused && !!window.__engine.map && window.__renderer && window.__THREE', timeout=15000)
    page.wait_for_timeout(500)

    allbad = []
    for lvl in [0, 1, 2, 3, 4, 5]:
        page.evaluate(f'window.__engine.devJump({lvl})')
        page.wait_for_timeout(2000)
        for seed in range(8):
            if seed > 0:
                page.evaluate('window.__engine.devRegenLevel(true)')
                page.wait_for_timeout(2000)
            r = page.evaluate(CHECK)
            tag = f'L{lvl} seed#{seed} (seed={r["seed"]})'
            if r['missing']:
                print(f'✗ {tag}: outdoor={r["total"]} 缺地板 {len(r["missing"])}: {r["missing"][:12]}')
                allbad.append((lvl, seed, r['missing']))
            else:
                print(f'✓ {tag}: outdoor 可达 {r["total"]} 瓦片地板全覆盖')
    browser.close()

print('--- console errors:', len(errors))
for e in errors[:5]: print('  ', e)
proc.terminate()
if allbad:
    print('MISSING FLOOR REPRODUCED:', len(allbad), 'cases'); sys.exit(1)
print('NO MISSING FLOOR FOUND')
