// 原型预览页：容器「尸体」= Object 70（?mode=lineup | stages | search | close | items）
//  lineup：五款三件套西装（新鲜）· stages：新鲜 / 腐败 / 白骨 · search：搜刮前 → 搜索中 → 搜完 → 取空
//  close：近景（右颈黑素瘤 / 银戒 / 公文包）· 在旧代码树里运行 mode=search 显示旧模型（盖布侧滑）
import '../game/renderer/renderer'
import * as THREE from 'three'
import { buildStructure } from '../game/renderer/structures'
import { retroModelReady } from '../game/renderer/retroAvatar'
const q = new URLSearchParams(location.search)
const mode = q.get('mode') ?? 'lineup'
const W = innerWidth, H = innerHeight
const renderer = new THREE.WebGLRenderer({ antialias: true }); renderer.setSize(W, H); renderer.outputColorSpace = THREE.SRGBColorSpace
document.body.appendChild(renderer.domElement)
const scene = new THREE.Scene(); scene.background = new THREE.Color('#3c3a30'); scene.fog = new THREE.Fog(scene.background as THREE.Color, 10, 30)
const fl = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.MeshLambertMaterial({ color: '#8a7c52' })); fl.rotation.x = -Math.PI / 2; scene.add(fl)
scene.add(new THREE.HemisphereLight('#fff2dc', '#3a3426', 1.3)); const sun = new THREE.DirectionalLight('#fff4e0', 1.2); sun.position.set(2, 6, 4); scene.add(sun)
const cam = new THREE.PerspectiveCamera(Number(q.get('fov') ?? 32), W / H, 0.02, 60)
const lab = document.getElementById('lab')!
const label = (x: number, z: number, html: string, y = 0) => { const p = new THREE.Vector3(x, y, z).project(cam); lab.insertAdjacentHTML('beforeend', `<div class="l" style="left:${(p.x * 0.5 + 0.5) * W}px;top:${(-p.y * 0.5 + 0.5) * H}px">${html}</div>`) }
const map: any = { w: 64, h: 64, tiles: new Uint8Array(64 * 64).fill(1), structures: [], floors: 1 }
const def: any = { id: 6 }
let animate: ((ch: THREE.Object3D, part: string, k: number, looted: boolean) => void) | null = null
try { animate = ((await import('../game/renderer/object70Mesh')) as any).animateObject70Part } catch { animate = null }
function corpse(wx: number, wy: number, x: number, z: number, k = 0, looted = false, ry?: number) {
  const s: any = { kind: 'corpse', x: wx, y: wy, w: 1, h: 1, solid: false, data: { loot: 1, sid: wx * 100 + wy }, looted }
  const g = buildStructure(s, def, map, 3) as THREE.Group
  g.position.set(x, 0, z)
  if (ry !== undefined) g.rotation.y = ry
  g.traverse((ch) => {
    if (!ch.userData.lid) return
    const part = ch.userData.part ?? 'lid'
    if (animate) animate(ch, part, k, looted)
    else { ch.position.x = ch.userData.bx + k * 0.8; ch.rotation.z = ch.userData.brz + k * 0.3 } // 旧版：盖布侧滑掀开
  })
  scene.add(g)
  const o70 = g.userData.o70
  let tris = 0, calls = 0; g.traverse((m: any) => { if (m.isMesh && m.visible) { calls++; const gi = m.geometry; tris += (gi.index ? gi.index.count : gi.attributes.position.count) / 3 } })
  return { g, o70, tris: Math.round(tris), calls }
}
async function main() {
  const diag: any = { items: [] }
  const SUIT = ['棕褐', '炭灰', '海军蓝', '橄榄褐', '黑'], ST = ['新鲜', '腐败', '白骨']
  // 按变体挑坐标（种子 = 世界坐标哈希）
  const M = animate ? await import('../game/renderer/object70Mesh') : null
  const seedOf = (wx: number, wy: number) => (((wx * 73856093) ^ (wy * 19349663) ^ (6 * 83492791)) >>> 0)
  const find = (ok: (v: any) => boolean, from = 0) => { for (let i = from; i < 40000; i++) { const wx = 10 + (i % 200), wy = 10 + Math.floor(i / 200); if (M && ok(M.object70Variant(seedOf(wx, wy)))) return [wx, wy] } return [10, 10] }
  if (mode === 'lineup') {
    cam.position.set(0, 3.6, 5.2); cam.lookAt(0, 0, 0.2)
    for (let i = 0; i < 5; i++) {
      const [wx, wy] = find((v) => v.suit === i && v.stage === 0 && v.pose === (i % 2), i * 37)
      const x = (i - 2) * 1.35, c = corpse(wx, wy, x, 0, 0, false, 0)
      c.g.children[0].rotation.y = 0; c.g.traverse((o) => { if (o.name === 'object70') o.rotation.y = 0 })
      label(x, 1.25, `${SUIT[i]}<br><span class="s">${c.tris} 三角面 · ${c.calls} 网格</span>`)
      diag.items.push({ suit: SUIT[i], tris: c.tris, calls: c.calls })
    }
  } else if (mode === 'stages') {
    cam.position.set(0, 3.2, 4.4); cam.lookAt(0, 0, 0.2)
    for (let i = 0; i < 3; i++) {
      const [wx, wy] = find((v) => v.stage === i && v.suit === (i === 1 ? 1 : 0), i * 101)
      const x = (i - 1) * 1.6, c = corpse(wx, wy, x, 0, 0, false, 0)
      c.g.traverse((o) => { if (o.name === 'object70') o.rotation.y = 0 })
      label(x, 1.25, `${ST[i]}<br><span class="s">${['70%', '20%', '10%'][i]}</span>`)
    }
  } else if (mode === 'search') {
    cam.position.set(0, 3.6, 6.4); cam.lookAt(0, 0, 0.2)
    const ks: [number, boolean, string][] = [[0, false, '搜刮前'], [0.25, false, '搜索中'], [0.5, false, '进度条走完'], [1, false, '箱盖全开'], [1, true, '取空后']]
    const [wx, wy] = M ? find((v) => v.stage === 0 && v.suit === 0 && v.pose === 0) : [12, 12]
    ks.forEach(([k, lt, n], i) => {
      const x = (i - 2) * 1.25, c = corpse(wx, wy, x, 0, k, lt, 0)
      c.g.traverse((o) => { if (o.name === 'object70') o.rotation.y = 0 })
      label(x, 1.2, animate ? n : `旧版 · ${n}`)
    })
  } else if (mode === 'close') {
    const [wx, wy] = find((v) => v.stage === 0 && v.suit === 0 && v.pose === 0 && v.head === 1)
    const c = corpse(wx, wy, 0, 0, Number(q.get('k') ?? 0), false, 0)
    c.g.traverse((o) => { if (o.name === 'object70') o.rotation.y = 0 })
    const v = q.get('view') ?? 'head'
    if (v === 'head') { cam.position.set(0.9 * (q.get('side') === 'l' ? -1 : 1), 0.8, 1.5); cam.lookAt(0, 0.05, 0.55) }
    else if (v === 'full') { cam.position.set(1.8, 1.3, 1.6); cam.lookAt(0, 0.05, 0) }
    else { c.g.updateMatrixWorld(true); const b = new THREE.Vector3(); c.g.getObjectByName('briefcase')!.getWorldPosition(b); cam.position.set(b.x * 2.6, 0.95, b.z + 0.9); cam.lookAt(b.x, 0.03, b.z) }
  }
  for (let i = 0; i < 150; i++) { if (retroModelReady(scene)) break; await new Promise((r) => setTimeout(r, 100)) }
  renderer.render(scene, cam)
  diag.render = { calls: renderer.info.render.calls, triangles: renderer.info.render.triangles, memory: { ...renderer.info.memory } }
  ;(window as any).__diag = diag
  ;(window as any).__ready = true
}
main()
