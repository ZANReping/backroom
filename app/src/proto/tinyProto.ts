// 原型预览页：小小（Entity 720）+ 石卡祖笛 + L8 乐器洞（?mode=lineup | head | open | kazoo | cave），可加 &cam=x,y,z&look=x,y,z
import * as THREE from 'three'
import { buildTinyMesh, poseTiny, type TinyPose } from '../game/renderer/tinyMesh'
import { animateTiny, TINY_REST } from '../game/renderer/tinyAnim'
import { buildRefinedItemMesh } from '../game/renderer/refinedItemMesh'
import { stoneInstrumentGeometry, buildStoneWindchime } from '../game/renderer/stoneInstrumentsMesh'
import { buildViewmodel, buildHeldItem, heldHandPose, heldBox, vmAnimPose } from '../game/renderer/viewmodel'
import { KAZOO } from '../game/engine/tinyAI'
const KAZOO_USE_T = KAZOO.useT
import { levelTexture, noiseTexture, litMaterial } from '../game/renderer/shared'
// 与 structures.ts 的 L8 岩体材质同源（同一组贴图），预览页不引入整个结构渲染模块
const caveRockMaterial = (v: string) => litMaterial({
  color: v === 'flowstone' ? '#efe4cf' : '#c5beb0', map: levelTexture('l8_wall.jpg', () => noiseTexture('#645d51', '#817665')),
  normalMap: levelTexture('l8_wall_normal.jpg', () => noiseTexture('#8080ff', '#7f7fff')), normalScale: new THREE.Vector2(0.88, 0.88),
  roughness: 0.97, envBase: 0.18,
})
const q = new URLSearchParams(location.search)
const mode = q.get('mode') ?? 'lineup'
const W = innerWidth, H = innerHeight
const renderer = new THREE.WebGLRenderer({ antialias: true }); renderer.setSize(W, H); renderer.outputColorSpace = THREE.SRGBColorSpace
document.body.appendChild(renderer.domElement)
const scene = new THREE.Scene()
const cam = new THREE.PerspectiveCamera(34, W / H, 0.02, 80)
const lab = document.getElementById('lab')!
const label = (x: number, html: string, y = -0.12, z = 0.6) => { const p = new THREE.Vector3(x, y, z).project(cam); lab.insertAdjacentHTML('beforeend', `<div class="l" style="left:${(p.x * 0.5 + 0.5) * W}px;top:${(0.5 - p.y * 0.5) * H}px">${html}</div>`) }
const count = (g: THREE.Object3D) => { let c = 0, t = 0; g.traverse((m: any) => { if (m.isMesh) { c++; t += (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3 } }); return { meshes: c, tris: Math.round(t) } }
const vec = (s: string | null) => s ? new THREE.Vector3(...s.split(',').map(Number) as [number, number, number]) : null
let info: any = {}
const water = () => {
  // L7 暮色带：冷蓝水色、沙质海床（预览适当提亮以看清造型）
  scene.background = new THREE.Color('#14263a'); scene.fog = new THREE.Fog(scene.background as THREE.Color, 8, 30)
  const fl = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.MeshLambertMaterial({ color: '#4d5a5c' })); fl.rotation.x = -Math.PI / 2; scene.add(fl)
  scene.add(new THREE.HemisphereLight('#cfe4f2', '#1d2a33', 1.05)); const sun = new THREE.DirectionalLight('#eaf4ff', 1.35); sun.position.set(3, 6, 4); scene.add(sun)
}
const tinyAt = (x: number, z: number, ry: number, pose: TinyPose) => { const g = buildTinyMesh(); g.position.set(x, 0, z); g.rotation.y = ry; poseTiny(g, pose); scene.add(g); return g }
if (mode === 'lineup') {
  water()
  cam.position.set(0.3, 1.3, 9.2); cam.lookAt(0.3, 1.2, 0)
  const items: [string, number, TinyPose][] = [
    ['正面', -Math.PI / 2, {}],
    ['斜前', -Math.PI / 4, {}],
    ['侧面', 0, {}],
    ['背面', Math.PI / 2, {}],
    ['甲壳张开 · 前刺', -Math.PI / 3, { open: 1, spear: 'thrust', lean: 0.4 }],
  ]
  items.forEach(([name, ry, pose], i) => { const x = (i - 2) * 1.95 - 0.15; const g = tinyAt(x, 0, ry, pose); label(x, name); info[name] = count(g) })
  const c = count(buildTinyMesh())
  lab.insertAdjacentHTML('beforeend', `<div class="l" style="left:${W / 2}px;top:14px"><span class="s">小小 · 身高约 2.44 m · ${c.meshes} 个网格 · ${c.tris} 个三角形</span></div>`)
} else if (mode === 'head' || mode === 'open') {
  water()
  const g = tinyAt(0, 0, -Math.PI / 2 + 0.55, mode === 'open' ? { open: 1 } : {})
  g.updateMatrixWorld(true)
  const hp = new THREE.Vector3(); (g.userData.parts.head as THREE.Object3D).getWorldPosition(hp)
  cam.position.set(hp.x - 0.45, hp.y + 0.1, hp.z + 1.0); cam.lookAt(hp.x, hp.y + 0.02, hp.z)
} else if (mode === 'face') {
  water()
  const g = tinyAt(0, 0, -Math.PI / 2 - 0.25, {}); g.updateMatrixWorld(true)
  const hp = new THREE.Vector3(); (g.userData.parts.head as THREE.Object3D).getWorldPosition(hp)
  cam.position.set(hp.x + 0.05, hp.y + 0.02, hp.z + 0.75); cam.lookAt(hp.x + 0.02, hp.y - 0.01, hp.z)
} else if (mode === 'three') {
  water()
  tinyAt(0, 0, -Math.PI / 2 + 0.7, {})
  cam.position.set(1.6, 1.7, 3.6); cam.lookAt(0, 1.25, 0)
}
else if (mode === 'kazoo') {
  // 石卡祖笛：放大 6 倍的三视角 + 原尺寸放在手掌大小的参照旁
  scene.background = new THREE.Color('#24221f')
  scene.add(new THREE.HemisphereLight('#efeae0', '#2a2620', 1.1)); const sun = new THREE.DirectionalLight('#fff4e2', 1.5); sun.position.set(2, 4, 5); scene.add(sun)
  cam.position.set(0, 0.5, 4.2); cam.lookAt(0, 0.3, 0)
  const views: [string, number, number][] = [['侧面（笛口在左）', 0, 0], ['斜上（笛膜座）', -0.6, 0.55], ['出音口', -Math.PI / 2 + 0.25, 0.15]]
  views.forEach(([name, ry, rx], i) => { const g = buildRefinedItemMesh('stonekazoo'); g.scale.setScalar(6); const x = (i - 1) * 1.25; g.position.set(x, 0.32, 0); g.rotation.set(rx, ry, 0); scene.add(g); label(x, name, -0.15, 0); info[name] = count(g) })
} else if (mode === 'vm') {
  // [tiny 收尾] 第一人称持笛手型：与游戏内同一套 buildViewmodel / buildHeldItem / heldHandPose / vmAnimPose；&blow=0..1 = 吹奏动作进度
  scene.background = new THREE.Color('#2a2c2e')
  scene.add(new THREE.HemisphereLight('#f2eee6', '#383430', 1.6)); const sun = new THREE.DirectionalLight('#fff4e2', 1.4); sun.position.set(-1, 3, 2); scene.add(sun)
  cam.fov = 70; cam.near = 0.01; cam.updateProjectionMatrix(); cam.position.set(0, 0, 0); cam.lookAt(0, 0, -1); scene.add(cam)
  const vm = new THREE.Group(), vf = new THREE.Group()
  const parts = buildViewmodel(vm, vf, cam); vf.visible = false
  const it = buildHeldItem('stonekazoo')
  parts.right.setPose(heldHandPose('stonekazoo', heldBox(it)), it); vm.add(it)
  const bp = q.get('blow')
  const st = vmAnimPose({ mx: 0, my: 0, bobPhase: 0, time: 0, usingItem: bp === null ? null : { t: Number(bp) * KAZOO_USE_T, dur: KAZOO_USE_T, anim: 'blow' }, attackAnimT: 0, attackAnimDur: 1 })
  vm.position.set(st.px, st.py, st.pz); vm.rotation.x = st.rx; vm.rotation.y = st.ry; vm.rotation.z = st.rz
  info.pose = st
} else if (mode === 'mech') {
  // [tiny] 阶段 3 机制示意：L7 环形场台心门 + 小小盘踞 + 门被挡 5m / 笛声有效 8m / 逼退逃离 18m；玩家在门边连吹石卡祖笛
  scene.background = new THREE.Color('#122336')
  scene.add(new THREE.HemisphereLight('#cfe4f2', '#1d2a33', 1.2)); const sun = new THREE.DirectionalLight('#eaf4ff', 1.5); sun.position.set(4, 10, 6); scene.add(sun)
  const fl = new THREE.Mesh(new THREE.CircleGeometry(24, 64), new THREE.MeshLambertMaterial({ color: '#3f4c50' })); fl.rotation.x = -Math.PI / 2; scene.add(fl)
  const dais = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.6, 0.42, 32), new THREE.MeshLambertMaterial({ color: '#6b6c64' })); dais.position.y = 0.21; scene.add(dais)
  const door = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.06, 1.7), new THREE.MeshLambertMaterial({ color: '#6a4426' })); door.position.y = 0.45; scene.add(door)
  for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2 + 0.62; const c = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.55, 1.4, 10), new THREE.MeshLambertMaterial({ color: '#59605c' })); c.position.set(Math.cos(a) * 6.5, 0.7, Math.sin(a) * 6.5); scene.add(c) }
  const ring = (r: number, color: string, dashed = false, y = 0.06) => {
    const pts: THREE.Vector3[] = []; for (let i = 0; i <= 128; i++) { const a = i / 128 * Math.PI * 2; pts.push(new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r)) }
    const g = new THREE.BufferGeometry().setFromPoints(pts)
    const l = new THREE.Line(g, dashed ? new THREE.LineDashedMaterial({ color, dashSize: 0.6, gapSize: 0.4 }) : new THREE.LineBasicMaterial({ color })); if (dashed) l.computeLineDistances(); scene.add(l)
    const band = new THREE.Mesh(new THREE.RingGeometry(r - 0.06, r + 0.06, 128), new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide })); band.rotation.x = -Math.PI / 2; band.position.y = y; scene.add(band)
  }
  ring(5, '#e0594a'); ring(18, '#e8e2d0', true)
  const perch = buildTinyMesh(); perch.position.set(0, 0.63, 0); perch.rotation.y = Math.PI * 0.85; perch.scale.setScalar(1.6); animateTiny(perch, { ...TINY_REST, perch: 1, glow: 1 }); scene.add(perch)
  const fled = buildTinyMesh(); fled.position.set(-12.7, 3.2, -12.7); fled.rotation.y = -Math.PI * 0.75; fled.scale.setScalar(1.6); animateTiny(fled, { ...TINY_REST, recoil: 1, swim: 1.4, phase: 1.2, glow: 0.6 }); scene.add(fled)
  // 玩家：简单人形标记 + 放大的石卡祖笛 + 声波
  const pl = new THREE.Group(); pl.position.set(4.3, 0, 1.6); scene.add(pl)
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.28, 1.1, 4, 10), new THREE.MeshLambertMaterial({ color: '#d9a441' })); body.position.y = 0.85; pl.add(body)
  const kz = buildRefinedItemMesh('stonekazoo'); kz.scale.setScalar(5); kz.position.set(-0.35, 1.55, 0); kz.rotation.y = Math.PI; pl.add(kz)
  for (let i = 0; i < 4; i++) { const w = new THREE.Mesh(new THREE.TorusGeometry(0.7 + i * 0.9, 0.035, 6, 48, Math.PI * 0.9), new THREE.MeshBasicMaterial({ color: '#7fe0ff', transparent: true, opacity: 0.85 - i * 0.18 })); w.rotation.set(Math.PI / 2, 0, Math.PI * 0.55); w.position.set(0, 1.55, 0); pl.add(w) }
  const repel = new THREE.Mesh(new THREE.RingGeometry(7.94, 8.06, 128), new THREE.MeshBasicMaterial({ color: '#7fe0ff', side: THREE.DoubleSide })); repel.rotation.x = -Math.PI / 2; repel.position.y = 0.07; scene.add(repel)
  const arrow = new THREE.ArrowHelper(new THREE.Vector3(-1, 0.18, -1).normalize(), new THREE.Vector3(-1.4, 2.4, -1.4), 14.5, 0xe8e2d0, 1.1, 0.6); scene.add(arrow)
  cam.fov = 40; cam.far = 120; cam.updateProjectionMatrix()
  cam.position.set(10, 27, 27); cam.lookAt(-3.2, 0, -3.6); cam.updateMatrixWorld()
  label(0, '小小盘踞在「小小的谎言」上方', 4.6, 0)
  label(5 * Math.cos(2.4), '<span style="color:#ff8a7a">门心 5 m：它在圈内，门打不开</span>', 0.1, 5 * Math.sin(2.4) + 0.4)
  label(8 * Math.cos(-0.5), '<span style="color:#9be9ff">声源离它 8 m 内才算数</span>', 0.1, 8 * Math.sin(-0.5) - 0.5)
  label(4.3, '玩家：6 秒内连吹 4 声<br><span class="s">水下每声耗氧 5 s · 吹到一半停下 = 记 1 次恼怒</span>', 2.6, 1.6)
  label(-12.7, '被逼退：抱头逃到 18 m 外<br><span class="s">25 s 后游回门上（这期间门可通行）</span>', 7.6, -12.7)
  label(18 * Math.cos(-2.6), '<span class="s">逃离距离 18 m</span>', 0.1, 18 * Math.sin(-2.6))
  lab.insertAdjacentHTML('beforeend', `<div class="l" style="left:${W / 2}px;top:14px">小小 · 阶段 3 机制：持续的笛声逼退它，断续的响动激怒它<br><span class="s">快速游泳 / 东西落水 / 爆炸 = 恼怒 +1（4 s 内只记一次，安静 45 s 减 1）· 恼怒 2 或任何肢体接触 → 追杀（攻击无效，它不可杀）· 追杀中同样能用笛声逼退 · 模型放大 1.6 倍示意</span></div>`)
} else if (mode === 'cave') {
  // L8 乐器洞：岩壁上斜嵌小提琴、吉他、长号；洞顶风铃与断口钟乳石；马桶周围一圈邦戈鼓（有两架倒了）
  scene.background = new THREE.Color('#1b1a18'); scene.fog = new THREE.Fog(scene.background as THREE.Color, 7, 18)
  const rock = caveRockMaterial('phreatic')
  const tiled = (g: THREE.BufferGeometry, k: number) => { const uv = g.attributes.uv as THREE.BufferAttribute; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * k, uv.getY(i) * k * 0.66); return g }
  const fl = new THREE.Mesh(tiled(new THREE.PlaneGeometry(12, 8), 4), rock); fl.rotation.x = -Math.PI / 2; scene.add(fl)
  const wall = new THREE.Mesh(tiled(new THREE.PlaneGeometry(12, 4, 40, 16), 4), rock); wall.position.set(0, 2, -1.6); scene.add(wall)
  const ceil = new THREE.Mesh(tiled(new THREE.PlaneGeometry(12, 8), 4), rock); ceil.rotation.x = Math.PI / 2; ceil.position.y = 2.6; scene.add(ceil)
  scene.add(new THREE.HemisphereLight('#f0ece2', '#3a3630', 2.2)); const sun = new THREE.DirectionalLight('#f4ecdc', 2.4); sun.position.set(1.5, 4, 5); scene.add(sun)
  const lamp = new THREE.PointLight('#ffe2b0', 14, 9, 1.4); lamp.position.set(0.4, 1.6, 1.6); scene.add(lamp)
  const drip = caveRockMaterial('flowstone') // 乐器是后长出来的流石，比岩壁略浅
  const put = (kind: Parameters<typeof stoneInstrumentGeometry>[0], x: number, y: number, z: number, rx: number, ry: number, rz: number, s = 1) => { const m = new THREE.Mesh(stoneInstrumentGeometry(kind), drip); m.position.set(x, y, z); m.rotation.set(rx, ry, rz); m.scale.setScalar(s); scene.add(m); return m }
  put('violin', -2.3, 1.15, -1.55, -0.1, 0.1, 0.55, 1.5)
  put('guitar', -1.15, 0.55, -1.5, 0.05, -0.15, -0.35, 1.25)
  put('trombone', 1.55, 0.85, -1.45, 0.2, 0.3, 1.15, 1.4)
  put('toilet', 0.3, 0, -0.5, 0, 0.25, 0)
  const bongos: [number, number, number, number][] = [[-0.45, -0.35, 0.3, 0], [-0.3, 0.25, 1.4, 0], [0.4, 0.45, 2.6, 0], [1.05, 0.05, 3.5, 0], [0.95, -0.75, 4.4, 1.35], [-0.35, -0.95, 5.3, 1.5]]
  for (const [x, z, ry, tip] of bongos) { const m = put('bongo', 0.3 + x, tip ? 0.1 : 0, -0.5 + z, tip, ry, 0); if (tip) m.position.y = 0.11 }
  const ch = buildStoneWindchime(drip); ch.position.set(-0.75, 2.6, 0.35); scene.add(ch)
  put('kazoospike', 1.75, 2.6, 0.5, 0, 0, 0)
  const kz = buildRefinedItemMesh('stonekazoo'); kz.position.set(1.55, 0.03, 1.3); kz.rotation.y = 0.7; kz.scale.setScalar(1.6); scene.add(kz)
  cam.position.set(0.0, 1.35, 4.6); cam.lookAt(0.0, 1.2, -0.4)
}
const c = vec(q.get('cam')), l = vec(q.get('look')); if (c) cam.position.copy(c); if (l) cam.lookAt(l)
cam.updateMatrixWorld(); renderer.render(scene, cam); (window as any).__info = info
// 贴图是异步加载的：持续重绘约 3 秒再标记就绪，截图时贴图已到位
const t0 = performance.now(); const loop = () => { renderer.render(scene, cam); if (performance.now() - t0 < 3000) requestAnimationFrame(loop); else (window as any).__ready = true }; loop()
