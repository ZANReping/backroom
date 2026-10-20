// v29a 冒烟断言：L0「向下的灰色阶梯」模型几何（踏步/顺坡护栏）与碰撞（护栏限位/走入触发换层）
// 运行：npx tsx verifier/v1/smoke-v29-stairs.mts

const mem = new Map<string, string>()
;(globalThis as any).localStorage = {
  getItem: (k: string) => (mem.has(k) ? mem.get(k)! : null),
  setItem: (k: string, v: string) => void mem.set(k, String(v)),
  removeItem: (k: string) => void mem.delete(k),
}

let failures = 0
const ok = (cond: boolean, msg: string) => {
  if (cond) console.log(`  ✓ ${msg}`)
  else { console.error(`  ✗ ${msg}`); failures++ }
}

console.log('== v29a L0 灰色阶梯模型+碰撞冒烟 ==')

const THREE = await import('three')
const { buildExit } = await import('../../src/game/renderer/structures')
const { LEVELS } = await import('../../src/game/levels')
const { Engine } = await import('../../src/game/engine')
const { look } = await import('../../src/game/renderer3d')

// ---- 1. 模型几何：踏步与引擎坡道对齐（z=-1.2308·s），顶点范围合理 ----
{
  const g = buildExit('graystairs', LEVELS[0])
  g.updateMatrixWorld(true)
  const steps: THREE.Mesh[] = []
  const rails: THREE.Mesh[] = []
  for (const o of g.children) {
    const geo = (o as THREE.Mesh).geometry as THREE.BufferGeometry
    const size = new THREE.Box3().setFromBufferAttribute(geo.getAttribute('position') as any).getSize(new THREE.Vector3())
    if (Math.abs(size.x - 1.1) < 0.01 && Math.abs(size.z - 0.26) < 0.01) steps.push(o as THREE.Mesh)
    else if (Math.abs(size.x - 0.08) < 0.01 && size.z > 3.5) rails.push(o as THREE.Mesh)
  }
  ok(steps.length === 12, `下行阶梯 12 级踏步（${steps.length}）`)
  let align = true
  for (const st of steps) {
    const s = -st.position.z // 走向距离
    const expect = -1.2308 * s - 0.01 // 引擎坡道踏面高度
    const top = st.position.y + 0.05
    if (Math.abs(top - expect) > 0.03) { align = false; console.error(`    踏步 s=${s.toFixed(2)} 踏面 ${top.toFixed(2)} ≠ 坡道 ${expect.toFixed(2)}`) }
  }
  ok(align, '12 级踏步踏面与引擎行走坡道（-1.2308·s）严格对齐')
  ok(rails.length === 2, `两侧顺坡护栏（${rails.length}）`)
  // 护栏全程高出踏面 0.6~1.2m（采样护栏轴线上若干点对应的踏面高度）
  let railOk = rails.length === 2
  for (const r of rails) {
    for (const t of [-0.5, 0, 0.5]) {
      const v = new THREE.Vector3(0, 0, t * 4.0).applyMatrix4(r.matrix)
      const s = -v.z, stepTop = -1.2308 * s - 0.01
      const clearance = v.y - stepTop
      if (clearance < 0.5 || clearance > 1.25) { railOk = false; console.error(`    护栏 s=${s.toFixed(2)} 高出踏面 ${clearance.toFixed(2)}m`) }
    }
  }
  ok(railOk, '护栏顺坡斜置：全程高出踏面 0.5~1.25m（不再水平浮空）')
  // 模型顶点范围（碰撞相关部分：踏步/护栏/漆黑平面；不含地板出口标记光盘）：横向 ≤ 护栏外沿，纵深覆盖坡道全程
  const bbox = new THREE.Box3()
  for (const o of g.children) {
    if ((o as THREE.Mesh).geometry?.type === 'CircleGeometry') continue
    bbox.expandByObject(o)
  }
  ok(Math.abs(bbox.min.x) <= 0.66 && Math.abs(bbox.max.x) <= 0.66, `模型横向范围 ±${Math.max(Math.abs(bbox.min.x), Math.abs(bbox.max.x)).toFixed(2)} ≤ 0.66（洞口半宽 0.5 + 护栏 0.16）`)
  ok(bbox.min.z <= -2.4 && bbox.max.z <= 1.25, `模型纵深覆盖坡道（z ${bbox.min.z.toFixed(2)}..${bbox.max.z.toFixed(2)}）`)
  ok(bbox.min.y <= -3.2 && bbox.max.y <= 1.35, `模型高度范围 y ${bbox.min.y.toFixed(2)}..${bbox.max.y.toFixed(2)}（下探 3.2m + 护栏顶）`)
}

// ---- 2. 碰撞：走入触发换层 + 护栏横向限位 ----
{
  const e = new Engine()
  e.dev.god = true
  e.newRun(777, 'normal')
  const m = e.map!
  ok(!!m.inf, 'L0 为无限模式')
  // 在玩家附近召唤下行阶梯
  ok(e.devSummonExit('graystairs'), 'devSummonExit(graystairs) 成功')
  const ex = m.exits[m.exits.length - 1]
  const tx = Math.floor(ex.x), ty = Math.floor(ex.y)
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= m.w || y >= m.h ? 0 : m.tiles[y * m.w + x])
  const solidAt = (x: number, y: number) => m.structures.some((s) => s.solid && x >= s.x && x < s.x + s.w && y >= s.y && y < s.y + s.h)
  let dx = 0, dy = 0
  const sides: [number, number][] = []
  for (const [wx, wy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
    if (at(tx + wx, ty + wy) === 1) continue
    sides.push([wx, wy])
    let clear = true
    for (let k = 1; k <= 4; k++) if (at(tx - wx * k, ty - wy * k) !== 1 || solidAt(tx - wx * k, ty - wy * k)) { clear = false; break }
    if (clear) { dx = -wx; dy = -wy; break }
  }
  if (!dx && !dy) { dx = -sides[0][0]; dy = -sides[0][1] }
  // 走向 3 格应为深渊洞口（elev=4）
  let holes = 0
  for (let k = 1; k <= 3; k++) if (m.elev[(ty + dy * k) * m.w + (tx + dx * k)] === 4) holes++
  ok(holes === 3, `走向 3 格标记深渊洞口（${holes}/3）`)
  // 入口侧邻墙——从侧面地板格走向坡道（真实玩家路径：侧向接近→踏上出口格→沿走向下行）
  const p = e.player
  p.x = tx + 0.5 + dy * 1.1; p.y = ty + 0.5 - dx * 1.1; p.z = 0; p.vz = 0
  // 无头环境没有渲染层 applyView 旋转输入：look.yaw=0 时 input 即世界系方向
  look.yaw = 0; look.pitch = 0
  const goal = { x: tx + 0.5 + dx * 3.0, y: ty + 0.5 + dy * 3.0 } // 坡道远端（触发换层前）
  let descended = false
  let clampOk = true
  let frames = 0
  while (frames++ < 1200 && e.player.level === 0) {
    // 每帧朝目标点归一化寻路（无头无渲染层输入旋转）
    const gx = goal.x - p.x, gy = goal.y - p.y
    const gn = Math.hypot(gx, gy) || 1
    e.input.mx = gx / gn; e.input.my = gy / gn
    e.update(1 / 60)
    const s = (p.x - (tx + 0.5)) * dx + (p.y - (ty + 0.5)) * dy
    const latS = Math.abs((p.x - (tx + 0.5)) * dy - (p.y - (ty + 0.5)) * dx)
    if (s > 0.5 && p.z < -0.5) descended = true
    // 已下段（s>0.4）：横向不得越出护栏碰撞盒（0.24 + 帧余量）
    if (s > 0.4 && s < 3.0 && latS > 0.24 + 0.06) clampOk = false
    // 故意横移试探护栏：走到一半时把人横向推开
    if (frames === 200) { p.x += dy * 0.4; p.y -= dx * 0.4 }
  }
  e.input.my = 0
  ok(descended, '沿坡道真实下行（z < -0.5）')
  ok(clampOk, '下段横向被护栏碰撞盒限位（|lat| ≤ 0.30）')
  ok(e.player.level === 1 || !!e.transition, `走入尽头触发换层（level=${e.player.level} transition=${!!e.transition}）`)
  ok(p.z > -4.5, `全程未坠入深渊（z=${p.z.toFixed(2)} > -4.5）`)
}

if (failures > 0) { console.error(`\n${failures} 项断言失败`); process.exit(1) }
console.log('\n全部断言通过')
