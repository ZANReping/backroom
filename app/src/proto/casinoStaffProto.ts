// [casino] Level 5.1 赌场员工预览：proto-casino-staff.html?cpu=1&view=sheet|turn|lineup|scene|bar|face[&who=louie|prosthetic|billy|bartender|dealer|waiter|guard][&lod=0..2][&ang=度][&pal=0..2][&props=0]
//   sheet：同一角色正 / 侧 / ¾ 三视图 + 身高标尺（中文标注）；turn：转台（ang 指定角度，不给则自转）；lineup：全员正面并排；
//   scene / bar：站在赌场场景里（大厅前厅 / 环形酒吧）；face：头部特写。window.__ready / __info
import * as THREE from 'three'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { buildCasinoStaff, staffTris } from '../game/renderer/casinoStaffMesh'
import { attachStaffProps } from '../game/renderer/casinoStaffProps'
import { staffTexturesReady } from '../game/renderer/casinoStaffMat'
import { STAFF_WHO, STAFF_ZH, type StaffWho } from '../game/renderer/casinoStaffRig'
import { animateStaffPreroll, STAFF_CLIPS } from '../game/renderer/casinoStaffAnim'
const q = new URLSearchParams(location.search), view = q.get('view') ?? 'sheet', who = (q.get('who') ?? 'louie') as StaffWho
const lod = Number(q.get('lod') ?? 0), pal = Number(q.get('pal') ?? 0), withProps = q.get('props') !== '0'
const W = innerWidth, H = innerHeight
const renderer = new THREE.WebGLRenderer({ antialias: true }); renderer.setSize(W, H); renderer.outputColorSpace = THREE.SRGBColorSpace
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = Number(q.get('exp') ?? 1.05)
document.body.appendChild(renderer.domElement)
const scene = new THREE.Scene()
const pm = new THREE.PMREMGenerator(renderer); const env = pm.fromScene(new RoomEnvironment(), 0.04).texture
const cam = new THREE.PerspectiveCamera(Number(q.get('fov') ?? 24), W / H, 0.03, 200)
const lab = document.getElementById('lab')!
const labels: { p: THREE.Vector3; html: string }[] = []
const t0 = performance.now()
const info: Record<string, unknown> = {}
/** 角色实例：外层组负责位置 / 朝向（模型 +Z 面朝 θ） */
function make(w: StaffWho, l = lod, p = pal) {
  const g = buildCasinoStaff(w, { lod: l, palette: p }); g.rotation.y = 0
  if (withProps) attachStaffProps(g)
  const o = new THREE.Group(); o.add(g); return o
}
function heightOf(o: THREE.Object3D) { o.updateMatrixWorld(true); const b = new THREE.Box3().setFromObject(o, true); return b }
function studio(bg = '#1a1216') {
  scene.background = new THREE.Color(bg); scene.environment = env; scene.environmentIntensity = 0.35
  scene.add(new THREE.HemisphereLight('#fff1e0', '#2a1418', 0.7))
  const k = new THREE.DirectionalLight('#fff3e2', 2.6); k.position.set(2.5, 4, 5); scene.add(k)
  const r = new THREE.DirectionalLight('#ffe8d6', 1.2); r.position.set(-4, 3, -4); scene.add(r)
  const f = new THREE.DirectionalLight('#c8d8ff', 0.6); f.position.set(-4, 2, 3); scene.add(f)
  const fl = new THREE.Mesh(new THREE.CircleGeometry(12, 48), new THREE.MeshStandardMaterial({ color: '#2a1a1e', roughness: 0.9 })); fl.rotation.x = -Math.PI / 2; scene.add(fl)
}
function ruler(x: number, z: number, h: number) {
  const m = new THREE.LineBasicMaterial({ color: '#e9d39a' }), pts: THREE.Vector3[] = [new THREE.Vector3(x, 0, z), new THREE.Vector3(x, h, z)]
  for (let y = 0; y <= h + 1e-6; y += 0.25) { pts.push(new THREE.Vector3(x, y, z), new THREE.Vector3(x + (y % 0.5 < 1e-6 ? 0.08 : 0.04), y, z)) }
  pts.push(new THREE.Vector3(x - 0.05, h, z), new THREE.Vector3(x + 0.3, h, z))
  scene.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), m))
}
let spin: THREE.Object3D | null = null
if (view === 'sheet' || view === 'turn' || view === 'face') {
  studio()
  const angs = view === 'sheet' ? [0, 90, 45] : [Number(q.get('ang') ?? 30)]
  const names = ['正面', '侧面', '¾ 侧']
  const objs = angs.map((a) => { const o = make(who); o.rotation.y = (a * Math.PI) / 180; scene.add(o); return o })
  const b0 = heightOf(objs[0]), w0 = Math.max(b0.max.x - b0.min.x, b0.max.z - b0.min.z, 0.9)
  const gap = w0 * 1.15
  objs.forEach((o, i) => { o.position.x = (i - (objs.length - 1) / 2) * gap })
  const bb = new THREE.Box3(); objs.forEach((o) => bb.union(heightOf(o)))
  const g = objs[0].children[0] as THREE.Group, st = g.userData.staffStats
  const headTop = (g.userData.staff.def.J.headTop ?? [0, b0.max.y])[1]
  const hTot = bb.max.y
  info.tris = st.tris; info.mats = st.mats; info.parts = st.parts; info.h = +hTot.toFixed(3); info.genMs = st.genMs; info.headTop = headTop
  if (view === 'face') {
    const hy = who === 'bartender' ? 1.2 : who === 'billy' ? 1.0 : who === 'prosthetic' ? 1.72 : 1.6
    cam.fov = 22; cam.position.set(0.25, hy + 0.04, 1.45); cam.lookAt(0, hy - 0.02, 0)
  } else if (view === 'sheet') {
    ruler(bb.min.x - 0.35, 0, Math.ceil(hTot * 4) / 4)
    const span = bb.max.x - bb.min.x + 0.8, d = Math.max(hTot * 1.25, span * H / W * 1.15) / (2 * Math.tan((cam.fov * Math.PI) / 360))
    cam.position.set(0, hTot * 0.52, d); cam.lookAt(0, hTot * 0.47, 0)
    objs.forEach((o, i) => labels.push({ p: new THREE.Vector3(o.position.x, 0, 0.3), html: `${names[i]}` }))
    labels.push({ p: new THREE.Vector3(bb.min.x - 0.35, hTot + 0.02, 0), html: `${hTot.toFixed(2)} m` })
    labels.push({ p: new THREE.Vector3(0, hTot + 0.13, 0), html: `${STAFF_ZH[who]}<div class="s">LOD${lod} · ${st.tris.toLocaleString()} 三角形 · 材质 ${st.mats.length} · 总高 ${hTot.toFixed(2)} m</div>` })
  } else {
    const d = (hTot * 1.3) / (2 * Math.tan((cam.fov * Math.PI) / 360))
    cam.position.set(0, hTot * 0.55, d); cam.lookAt(0, hTot * 0.48, 0)
    if (!q.get('ang')) spin = objs[0]
  }
} else if (view === 'close') {
  // 近景：part=head|hand，按骨骼世界坐标对焦（展示写实细节）
  studio()
  const part0 = q.get('part') ?? 'head', faceK = part0 === 'facef' ? 0 : part0 === 'faces' ? 1 : -1
  const o = make(who); o.rotation.y = (Number(q.get('ang') ?? (faceK === 0 ? 20 : faceK === 1 ? -62 : 22)) * Math.PI) / 180; scene.add(o); o.updateMatrixWorld(true)
  const g = o.children[0] as THREE.Group, rig = g.userData.staff, part = q.get('part') ?? 'head'
  const bn = part === 'head' || faceK >= 0 ? (who === 'bartender' ? 'eye' : 'head') : (who === 'prosthetic' || who === 'billy' || who === 'louie' ? 'handR' : who === 'bartender' ? 'clawR' : 'handL')
  const b = rig.bones[bn] as THREE.Bone, p = new THREE.Vector3(); b.getWorldPosition(p)
  const up = faceK >= 0 ? 0.075 : part === 'head' ? ({ louie: 0.1, prosthetic: 0.13, billy: -0.36, bartender: 0.0 } as Record<string, number>)[who] ?? 0.16 : (({ louie: 0.0, bartender: -0.03, billy: 0.1, prosthetic: 0.05 } as Record<string, number>)[who] ?? -0.08)
  const dist = faceK >= 0 ? 0.74 : part === 'head' ? ({ billy: 2.1, bartender: 1.7, prosthetic: 1.45 } as Record<string, number>)[who] ?? 1.05 : 0.75
  const tgt = p.clone().add(new THREE.Vector3(0, up, 0)), dir = new THREE.Vector3(Math.sin(0.35), 0.12, Math.cos(0.35)).normalize()
  cam.fov = 20; cam.position.copy(tgt.clone().addScaledVector(dir, dist)); cam.lookAt(tgt)
  info.tris = g.userData.staffStats.tris
} else if (view === 'lineup') {
  studio()
  const list = STAFF_WHO.filter((w) => q.get('who') === null || q.get('who')!.split(',').includes(w))
  let x = 0; const objs: THREE.Object3D[] = []
  for (const w of list) { const o = make(w); const b = heightOf(o); const wd = Math.max(0.7, b.max.x - b.min.x); o.position.x = x + wd / 2; x += wd + 0.25; scene.add(o); objs.push(o); labels.push({ p: new THREE.Vector3(o.position.x, -0.02, 0.3), html: `${STAFF_ZH[w]}<div class="s">${b.max.y.toFixed(2)} m</div>` }) }
  objs.forEach((o) => (o.position.x -= x / 2))
  cam.fov = 26; const d = Math.max(2.6, x * 0.62 * H / W) / Math.tan((cam.fov * Math.PI) / 360) * 0.95
  cam.position.set(0, 1.25, d); cam.lookAt(0, 1.0, 0)
} else if (view === 'anim') {
  // 阶段 3 动画：window.__frame(clip, t) 预跑弹簧后摆到 t 帧并渲染（原地，不带根运动）；台面 / 吧台按片段显示
  studio()
  const o = make(who, Number(q.get('lod') ?? 1)); o.rotation.y = (Number(q.get('ang') ?? 35) * Math.PI) / 180; scene.add(o)
  const g = o.children[0] as THREE.Group
  const top = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.06, 0.5), new THREE.MeshStandardMaterial({ color: '#5a1830', roughness: 0.6 })); scene.add(top)
  const leg = new THREE.Mesh(new THREE.BoxGeometry(1.3, 1, 0.42), new THREE.MeshStandardMaterial({ color: '#2a1410', roughness: 0.7 })); scene.add(leg)
  const TABLE: Record<string, [number, number]> = { 'louie.exchange': [1.0, 0.42], 'louie.warn': [1.0, 0.42], 'louie.deal': [0.92, 0.35], 'billy.deal': [0.92, 0.42], 'billy.knock': [0.92, 0.42], 'bartender.shake': [0.95, 0.66], 'bartender.pour': [0.95, 0.66], 'bartender.wipe': [0.95, 0.66], 'bartender.serve': [0.95, 0.66], 'bartender.idle': [0.95, 0.66], 'bartender.stare': [0.95, 0.66], 'dealer.work': [0.92, 0.42] }
  const hT = ({ louie: 2.1, prosthetic: 2.1, billy: 1.7, bartender: 1.9 } as Record<string, number>)[who] ?? 1.95
  const camAt = (hh: number) => { const d = hh * 1.8 + 0.55; cam.position.set(0.15, hh * 0.6, d); cam.lookAt(0, hh * 0.47, 0); cam.fov = 30; cam.updateProjectionMatrix() }
  camAt(hT)
  const frame = (clip: string, t: number) => {
    const tb = TABLE[`${who}.${clip}`] ?? TABLE[`${who}.*`]
    top.visible = leg.visible = !!tb
    if (tb) { const z = tb[1] + 0.25, wq = new THREE.Vector3(0, tb[0] - 0.03, z).applyAxisAngle(new THREE.Vector3(0, 1, 0), o.rotation.y); top.position.copy(wq); top.rotation.y = o.rotation.y; leg.position.set(wq.x, (tb[0] - 0.06) / 2, wq.z); leg.scale.y = tb[0] - 0.06; leg.rotation.y = o.rotation.y }
    animateStaffPreroll(g, clip, t, { inPlace: true }, 0.8)
    if (!q.get('nolab')) lab.innerHTML = `<div class="l" style="left:12px;top:10px;transform:none;font-size:18px">${STAFF_ZH[who]} · ${STAFF_CLIPS[who][clip].zh}</div>`
    renderer.render(scene, cam); return true
  }
  ;(window as unknown as { __frame: unknown; __clips: unknown }).__frame = frame; (window as unknown as { __clips: unknown }).__clips = STAFF_CLIPS[who]
  frame(q.get('clip') ?? 'idle', Number(q.get('t') ?? 0.5))
} else if (view === 'l5') {
  // 第三轮：Louie 与其他 L5 人形并排（同光同比例）：行李员 E135 / 看门人 E131 / 管家 E111
  studio()
  const { buildBellhopMesh, bellhopTris } = await import('../game/renderer/bellhopMesh')
  const { buildConciergeMesh, conciergeTris } = await import('../game/renderer/conciergeMesh')
  const { buildMaidMesh, maidTris } = await import('../game/renderer/maidMesh')
  const wrap = (g: THREE.Object3D) => { g.rotation.y = 0; const o = new THREE.Group(); o.add(g); return o }
  const cnt = (o: THREE.Object3D) => { let n = 0; o.traverse((m) => { const x = m as THREE.Mesh; if (x.isMesh && x.geometry) n += (x.geometry.index ? x.geometry.index.count : x.geometry.attributes.position.count) / 3 }); return n }
  void bellhopTris; void conciergeTris; void maidTris
  const items: [string, THREE.Object3D][] = [['行李员 E135', wrap(buildBellhopMesh({ lod: 0 }))], ['Louie（第三轮）', make('louie')], ['看门人 E131', wrap(buildConciergeMesh({ lod: 0 }))], ['管家 E111', wrap(buildMaidMesh())]]
  let x = 0; const objs: THREE.Object3D[] = []
  for (const [, o] of items) { const b = heightOf(o); const wd = Math.max(0.75, b.max.x - b.min.x); o.position.x = x + wd / 2; x += wd + 0.3; scene.add(o); objs.push(o) }
  objs.forEach((o) => (o.position.x -= x / 2))
  items.forEach(([name, o]) => { const h = heightOf(o).max.y; labels.push({ p: new THREE.Vector3(o.position.x, 0, 0.35), html: `${name}<div class="s">LOD0 ${Math.round(cnt(o)).toLocaleString()} 三角形 · ${h.toFixed(2)} m</div>` }) })
  ruler(-x / 2 - 0.25, 0, 2.25)
  cam.fov = 26; const d = Math.max(2.6, x * 0.62 * H / W) / Math.tan((cam.fov * Math.PI) / 360) * 0.95
  cam.position.set(0, 1.2, d); cam.lookAt(0, 1.02, 0)
} else {
  // 站在赌场里
  const { buildCasinoScene } = await import('../game/renderer/casinoScene')
  const { casinoLayout, OX, OY } = await import('../game/content/casinoLayout')
  const cs = buildCasinoScene({ lights: true }); scene.add(cs.group); cs.update(2.3)
  scene.background = new THREE.Color('#050203'); scene.environment = env; scene.environmentIntensity = 0.15
  scene.add(new THREE.HemisphereLight('#ffe0c0', '#200a10', 0.35))
  const L = casinoLayout(), X = (v: number) => OX + v, Z = (v: number) => OY + v
  const put = (w: StaffWho, x: number, z: number, face: [number, number], p = pal) => { const o = make(w, 0, p); o.position.set(X(x), 0, Z(z)); o.rotation.y = Math.atan2(face[0] - x, face[1] - z); scene.add(o); const sp = new THREE.SpotLight('#ffe6c8', 9, 6, 0.5, 0.6, 1.2); sp.position.set(X(x) + 0.6, 3.6, Z(z) + 1.2); sp.target = o; scene.add(sp); return o }
  if (view === 'bar') {
    const bar = L.props.find((p) => p.kind === 'bar')!
    put('bartender', bar.x - 3.5, bar.y + 0.5, [bar.x - 9.6, bar.y + 2.6])
    put('louie', bar.x - 6.9, bar.y + 1.0, [bar.x - 9.6, bar.y + 3.0])
    put('waiter', bar.x - 7.1, bar.y + 3.0, [bar.x - 9.6, bar.y + 3.6], 1)
    cam.fov = 50; cam.position.set(X(bar.x - 10.0), 1.66, Z(bar.y + 2.6)); cam.lookAt(X(bar.x - 4.6), 1.15, Z(bar.y + 1.3))
  } else {
    const cx = 26, cz = 31.6, F = (x: number): [number, number] => [cx + x * 0.3, cz + 9]
    put('billy', cx - 1.7, cz, F(-1.7)); put('louie', cx, cz + 0.15, F(0)); put('prosthetic', cx + 1.8, cz, F(1.8))
    put('bartender', cx - 2.9, cz - 1.7, F(-2.9)); put('waiter', cx - 0.9, cz - 1.9, F(-0.9), 0); put('dealer', cx + 0.95, cz - 1.9, F(0.95), 0); put('guard', cx + 3.0, cz - 1.8, F(3), 1)
    cam.fov = 58; cam.position.set(X(cx), 1.62, Z(cz + 3.9)); cam.lookAt(X(cx), 1.05, Z(cz - 0.6))
  }
  info.casino = cs.stats()
}
cam.updateProjectionMatrix()
info.genMsTotal = Math.round(performance.now() - t0)
let total = 0; scene.traverse((o) => { if ((o as THREE.SkinnedMesh).isSkinnedMesh) total += staffTris(o) }); info.staffTris = total
renderer.render(scene, cam)
info.calls = renderer.info.render.calls
;(window as unknown as { __info: unknown }).__info = info
const drawLabels = () => { if (q.get('nolab')) return; lab.innerHTML = labels.map((l) => { const v = l.p.clone().project(cam); return `<div class="l" style="left:${((v.x + 1) / 2) * W}px;top:${((1 - v.y) / 2) * H}px">${l.html}</div>` }).join('') }
drawLabels()
let frames = 0, last = performance.now()
let texOk = false
void staffTexturesReady().then((ok) => { texOk = true; info.faceDetail = ok })
const loop = () => { const now = performance.now(), dt = Math.min(0.05, (now - last) / 1000); last = now; if (spin) spin.rotation.y += dt * 0.6; renderer.render(scene, cam); if (++frames >= 3 && texOk && frames < 1e9) { frames = 1e9; (window as unknown as { __ready: boolean }).__ready = true }; requestAnimationFrame(loop) }
loop()
