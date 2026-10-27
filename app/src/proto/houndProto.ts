// 猎犬（Entity 8）重制·阶段 1 预览页（proto-hound.html）。截图脚本 scripts/verify-hound.mjs。
// ?view=front|side|back  三形态（普通 / 中立 / 高智能）并排，正面 / 侧面 / 背面
// ?view=head&part=0|1    头部特写：0 = 头发盖脸（默认），1 = 掀发（发缕骨链向两侧撩开）露出脸
// ?view=ref              与附图同角度的 3/4 侧视
// ?view=compare          新旧模型对比（旧 v62.3 模型为 src/proto/houndLegacyMesh.ts 原样副本）
// ?view=poses            旧接口 animateHound 的几个姿态（潜行 / 冲锋 / 嚎叫 / 被直视 / 中立坐下）
// ?anim=1&clip=<HOUND_CLIPS 名>&kind=…   阶段 2 动作实时预览（移动片段整只往前走，地面网格看脚有没有滑）
//   &grid=1&frames=16&cols=4               离线逐帧（dt=1/30 推进二阶摆动），按时间均匀取帧拼成网格（verify-hound 的 anim-* 截图用）
// ?view=stage3            阶段 3 机制示意：左 = 群猎包抄站位（头犬正面吸引、两翼按 houndFlankGoal 绕到侧后方）；右 = pin（前爪按玩家实际位置落在胸口）
// 可选：&kind=hostile|neutral|ambusher  &cam=x,y,z  &look=x,y,z  &title=…  &cpu=1（无头 SwiftShader 必须，CPU 蒙皮替身）
import * as THREE from 'three'
import { buildHoundMesh, animateHound, houndHairPart, type HoundKind } from '../game/renderer/houndMesh'
import { animateHoundClip, HOUND_CLIPS, type HoundClip } from '../game/renderer/houndAnim'
import { HD, houndFlankGoal } from '../game/engine/houndAI'
import { buildHoundMesh as buildLegacy, animateHound as animateLegacy } from './houndLegacyMesh'
import { QA_CPU_SKIN, syncSceneCpuSkins } from '../game/renderer/qaCpuSkin'

const Q = new URLSearchParams(location.search)
const view = Q.get('view') ?? 'ref'
const W = innerWidth, H = innerHeight
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true }); renderer.setSize(W, H); renderer.outputColorSpace = THREE.SRGBColorSpace
renderer.setPixelRatio(1)
document.body.appendChild(renderer.domElement)
const scene = new THREE.Scene(); scene.background = new THREE.Color('#4a4434'); scene.fog = new THREE.Fog(scene.background as THREE.Color, 12, 40)
const fl = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshLambertMaterial({ color: '#6b6146' })); fl.rotation.x = -Math.PI / 2; scene.add(fl)
const wl = new THREE.Mesh(new THREE.PlaneGeometry(400, 8), new THREE.MeshLambertMaterial({ color: '#a89b6a' })); wl.position.set(0, 4, -4); scene.add(wl)
scene.add(new THREE.HemisphereLight('#fff4d0', '#3a3220', 1.25))
const sun = new THREE.DirectionalLight('#fff1cc', 1.5); sun.position.set(2.5, 5, 4); scene.add(sun)
const rim = new THREE.DirectionalLight('#c8d4ff', 0.5); rim.position.set(-4, 3, -5); scene.add(rim)
const cam = new THREE.PerspectiveCamera(30, W / H, 0.02, 80)
const lab = document.getElementById('lab')!
const v3 = (s: string | null, d: [number, number, number]) => { const a = s ? s.split(',').map(Number) : d; return new THREE.Vector3(a[0], a[1], a[2]) }
const label = (p: THREE.Vector3, html: string, top?: number) => {
  cam.updateMatrixWorld(); const q = p.clone().project(cam)
  lab.insertAdjacentHTML('beforeend', `<div class="l" style="left:${(q.x * 0.5 + 0.5) * W}px;top:${top ?? (1 - (q.y * 0.5 + 0.5)) * H}px">${html}</div>`)
}
const KIND_NAME: Record<HoundKind, string> = { hostile: '普通猎犬（hostile）', neutral: '中立猎犬（neutral）', ambusher: '高智能猎犬（ambusher）' }
const fake = (over: any = {}) => ({ id: 0, state: 'idle', animT: 0, hd: { phase: 'roam', crouch: 0, howlPose: 0, sit: 0, jaw: 0, wag: 0, ...over } }) as any
/** 新模型：静止站姿（头不转动），可选张嘴 / 掀发 */
const hound = (kind: HoundKind, x: number, z: number, rotY: number, o: { jaw?: number; part?: number; seed?: number } = {}) => {
  const g = buildHoundMesh(kind === 'neutral', o.seed ?? 2, kind)
  scene.add(g)
  animateHound(g, fake({ jaw: o.jaw ?? 0.25 }), 0, 0)
  const r = g.userData.houndRig; r.head.rotation.y = 0; r.head.rotation.x = 0
  if (o.part) houndHairPart(g, o.part)
  if (Q.get('nohair')) g.traverse((m: any) => { if (m.name === 'houndHair') m.visible = false })
  g.position.set(x, 0, z); g.rotation.y = rotY
  return g
}
const stats = (g: THREE.Object3D) => { let tris = 0, calls = 0; g.traverse((o: any) => { if (o.isMesh && !o.userData.cpuSkin) { calls++; tris += (o.geometry.index?.count ?? o.geometry.attributes.position.count) / 3 } }); return { tris, calls } }
const info: any = { view }
const kinds: HoundKind[] = ['hostile', 'neutral', 'ambusher']

const panels: { cam: THREE.PerspectiveCamera; x: number; y: number; w: number; h: number }[] = []
const ANIM = !!Q.get('anim')
if (ANIM) animMode()
else if (view === 'front' || view === 'side' || view === 'back') {
  // 三形态各自一格（相距 20 m 互不入镜）：正面 / 背面三列，侧面三行
  const rot = view === 'side' ? 0 : -Math.PI / 2 // 背面 = 同样朝 +z，相机绕到身后
  kinds.forEach((k, i) => {
    const X = i * 20
    const g = hound(k, X, 0, rot)
    const s = stats(g); info[k] = s
    const c = new THREE.PerspectiveCamera(view === 'side' ? 24 : 30, 1, 0.02, 80)
    let px: number, py: number, pw: number, ph: number
    if (view === 'side') { pw = W; ph = Math.floor(H / 3); px = 0; py = i * ph; c.position.set(X - 0.6, 0.5, 2.55); c.lookAt(X - 0.6, 0.42, 0) }
    else { pw = Math.floor(W / 3); ph = H; px = i * pw; py = 0; const sgn = view === 'front' ? 1 : -1; c.position.set(X, 0.72, sgn * 2.85); c.lookAt(X, 0.4, 0) }
    c.aspect = pw / ph; c.updateProjectionMatrix()
    panels.push({ cam: c, x: px, y: py, w: pw, h: ph })
    lab.insertAdjacentHTML('beforeend', `<div class="l" style="left:${px + (view === 'side' ? 140 : pw / 2)}px;top:${py + (view === 'side' ? 12 : ph - 62)}px">${KIND_NAME[k]}<br><span class="s">${s.tris} 三角形 · ${s.calls} 次绘制</span></div>`)
  })
} else if (view === 'stage3') {
  stage3()
} else if (view === 'head') {
  const part = Number(Q.get('part') ?? 0), kind = (Q.get('kind') ?? 'hostile') as HoundKind
  const g = hound(kind, 0, 0, 0, { jaw: Number(Q.get('jaw') ?? 0.45), part })
  g.updateMatrixWorld(true)
  const hp = new THREE.Vector3(); g.userData.houndRig.head.getWorldPosition(hp)
  const look = hp.clone().add(new THREE.Vector3(0.1, -0.03, 0))
  cam.fov = 26; cam.updateProjectionMatrix()
  cam.position.copy(v3(Q.get('cam'), [look.x + 0.75, look.y + 0.12, look.z + 0.42])); cam.lookAt(v3(Q.get('look'), [look.x, look.y, look.z]))
  label(look, `<span>${part ? '掀发版（houndHairPart：刘海骨链上撩、两侧拢后）' : '盖脸版（默认）'}</span>`, 18)
  info.head = stats(g)
} else if (view === 'compare') {
  const old = buildLegacy(false, 2); scene.add(old)
  animateLegacy(old, fake(), 0, 0); old.userData.houndRig.head.rotation.y = 0
  old.position.set(-1.6, 0, 0)
  const g = hound('hostile', 1.6, 0, 0)
  cam.position.set(0.2, 1.45, -5.6); cam.lookAt(0, 0.42, 0)
  label(new THREE.Vector3(-1.6, 0, 0), `旧模型 v62.3<br><span class="s">${stats(old).tris} 三角形 · ${stats(old).calls} 次绘制</span>`, H - 62)
  label(new THREE.Vector3(1.6, 0, 0), `新模型（阶段 1）<br><span class="s">${stats(g).tris} 三角形 · ${stats(g).calls} 次绘制</span>`, H - 62)
  // 相机在 -z 一侧，模型 +x 朝屏幕左（与附图同向）
  info.old = stats(old); info.new = stats(g)
} else if (view === 'poses') {
  const items: [HoundKind, string, string, any, string, number][] = [
    ['hostile', 'stalk', 'chase', { crouch: 0.45 }, '潜行逼近', 0.7], ['hostile', 'charge', 'chase', { jaw: 0.6 }, '冲锋', 0.35],
    ['hostile', 'howl', 'chase', { howlPose: 1, jaw: 1 }, '仰头嚎叫', 0], ['hostile', 'cower', 'stunned', { crouch: 1, jaw: 0.25 }, '被直视：伏低后退', 0],
    ['neutral', 'sit', 'wander', { sit: 1, wag: 1 }, 'L11 中立：坐下观察', 0]]
  cam.position.set(0, 1.5, 8.6); cam.lookAt(0, 0.4, 0); cam.updateMatrixWorld()
  items.forEach(([k, ph, st, hd, name, aT], i) => {
    const x = (i - 2) * 3.4
    const g = buildHoundMesh(k === 'neutral', 2, k); scene.add(g)
    const e = fake({ phase: ph, ...hd }); e.state = st; e.animT = aT
    animateHound(g, e, 1.7, 0); g.position.set(x + 0.5, 0, 0); g.rotation.y = 0
    label(new THREE.Vector3(x, 0, 0), name, H - 50)
  })
} else {
  // ref：与附图同角度——猎犬朝画面左、略朝向观者，相机稍高于脊背
  const kind = (Q.get('kind') ?? 'hostile') as HoundKind
  const g = hound(kind, 0, 0, 0, { jaw: 0.55 })
  const s = stats(g); info.ref = s
  cam.fov = 30; cam.updateProjectionMatrix()
  cam.position.copy(v3(Q.get('cam'), [1.25, 1.05, -2.9])); cam.lookAt(v3(Q.get('look'), [-0.32, 0.4, 0]))
  label(new THREE.Vector3(0, 0, 0), `${Q.get('title') ?? '与附图同角度 3/4 侧视'}<br><span class="s">${s.tris} 三角形 · ${s.calls} 次绘制</span>`, 14)
}
if (!ANIM && Q.get('cam') && view !== 'head' && view !== 'ref') { cam.position.copy(v3(Q.get('cam'), [0, 1, 5])); cam.lookAt(v3(Q.get('look'), [0, 0.4, 0])) }
cam.updateMatrixWorld()
if (QA_CPU_SKIN && !ANIM) syncSceneCpuSkins(scene)
if (ANIM) { /* animMode 自己渲染 */ }
else if (panels.length) {
  renderer.setScissorTest(true)
  for (const p of panels) { const y = H - p.y - p.h; renderer.setViewport(p.x, y, p.w, p.h); renderer.setScissor(p.x, y, p.w, p.h); renderer.render(scene, p.cam) }
  renderer.setScissorTest(false)
} else renderer.render(scene, cam)
if (!ANIM) { ;(window as any).__info = info; (window as any).__ready = true }

/** 阶段 2 动作预览 / 逐帧网格 */
function animMode() {
  const clip = (Q.get('clip') ?? 'gallop') as HoundClip, kind = (Q.get('kind') ?? (clip === 'sit' || clip === 'wag' ? 'neutral' : 'hostile')) as HoundKind
  const C = HOUND_CLIPS[clip]
  const g = buildHoundMesh(kind === 'neutral', 2, kind); scene.add(g)
  // 地面网格：移动片段整只往前走，脚掌相对网格不动 = 没滑步
  const grid = new THREE.GridHelper(400, 800, 0x3a3222, 0x4a4030); grid.position.y = 0.002; scene.add(grid)
  if (clip === 'pin') { // 被扑倒的玩家（示意）
    const m = new THREE.MeshLambertMaterial({ color: '#4c5a6a' })
    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.17, 0.95, 4, 10), m); torso.rotation.z = Math.PI / 2; torso.position.set(0.95, 0.12, 0); scene.add(torso)
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 10), new THREE.MeshLambertMaterial({ color: '#c9a88a' })); head.position.set(1.6, 0.12, 0); scene.add(head)
  }
  const speed = C.speed ?? 0
  const grp = g as THREE.Group
  const camFor = (c: THREE.PerspectiveCamera, x: number) => { const k = clip === 'pin' ? 0.25 : 0; c.position.set(x + 1.15 + k, 1.0, -2.75); c.lookAt(x - 0.3 + k, 0.36, 0) }
  const step = (t: number, dt: number) => {
    grp.position.x = speed * t
    grp.updateMatrixWorld(true)
    animateHoundClip(grp, clip, Math.max(0, t), kind, dt)
    grp.updateMatrixWorld(true)
  }
  const meta: any = { clip, kind, title: C.title, dur: C.dur }
  if (Q.get('grid')) {
    const frames = Number(Q.get('frames') ?? 16), cols = Number(Q.get('cols') ?? 4), rows = Math.ceil(frames / cols)
    const span = Number(Q.get('span') ?? (C.loop ? Math.max(C.dur * 2, 1.2) : C.dur + 0.25))
    const pw = Math.floor(W / cols), ph = Math.floor(H / rows)
    const c = new THREE.PerspectiveCamera(30, pw / ph, 0.02, 80)
    renderer.setScissorTest(true)
    const dt = 1 / 30, warm = C.loop ? 0.6 : 0 // 循环片段先跑一段让摆动进入稳态
    let t = -warm, k = 0
    const times = Array.from({ length: frames }, (_, i) => (i / frames) * span)
    while (k < frames) {
      step(t, dt)
      if (t >= times[k] - 1e-6) {
        camFor(c, grp.position.x + grp.userData.houndRig.body.position.x * 0.8); c.updateMatrixWorld()
        if (QA_CPU_SKIN) syncSceneCpuSkins(scene)
        const x = (k % cols) * pw, y = Math.floor(k / cols) * ph
        renderer.setViewport(x, H - y - ph, pw, ph); renderer.setScissor(x, H - y - ph, pw, ph); renderer.render(scene, c)
        lab.insertAdjacentHTML('beforeend', `<div class="l" style="left:${x + 70}px;top:${y + 6}px;font-size:13px">t=${times[k].toFixed(2)}s</div>`)
        k++
      }
      t += dt
    }
    renderer.setScissorTest(false)
    Object.assign(meta, { frames, cols, rows, span, ms: Math.round((span / frames) * 1000) })
    ;(window as any).__info = meta; (window as any).__ready = true
    return
  }
  // 实时：循环播放
  const t0 = performance.now()
  let last = 0
  const loop = () => {
    const now = (performance.now() - t0) / 1000
    const span = C.loop ? 1e9 : C.dur + 0.8
    const t = now % span
    step(t, Math.min(0.05, Math.max(0, t - last))); last = t
    camFor(cam, grp.position.x + grp.userData.houndRig.body.position.x * 0.8); cam.updateMatrixWorld()
    if (QA_CPU_SKIN) syncSceneCpuSkins(scene)
    renderer.render(scene, cam)
    requestAnimationFrame(loop)
  }
  loop()
  ;(window as any).__info = meta; (window as any).__ready = true
}

/** 阶段 3 机制示意（游戏坐标 x/y → three x/z） */
function stage3() {
  const pw = Math.floor(W * 0.56), qw = W - pw
  wl.visible = false
  // —— 左：群猎包抄 ——
  const ply = (x: number, z: number, lying = false) => {
    const m = new THREE.MeshLambertMaterial({ color: '#4c5a6a' }), sk = new THREE.MeshLambertMaterial({ color: '#c9a88a' })
    const g = new THREE.Group()
    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(lying ? 0.13 : 0.2, lying ? 1.0 : 1.05, 4, 10), m)
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 10), sk)
    if (lying) { torso.rotation.z = Math.PI / 2; torso.position.set(0.3, 0.13, 0); head.position.set(1.05, 0.13, 0) }
    else { torso.position.y = 0.75; head.position.y = 1.6 }
    g.add(torso, head); g.position.set(x, 0, z); scene.add(g); return g
  }
  ply(0, 0)
  // 玩家视野扇区（正对头犬 ±FLANK_VIEW）
  const fan = new THREE.Mesh(new THREE.CircleGeometry(9, 32, -HD.FLANK_VIEW, HD.FLANK_VIEW * 2), new THREE.MeshBasicMaterial({ color: '#fff3b0', transparent: true, opacity: 0.16, depthWrite: false }))
  fan.rotation.x = -Math.PI / 2; fan.position.y = 0.01; scene.add(fan)
  const lead = { x: HD.LEAD_HOLD, y: 0 }
  const line = (pts: { x: number; y: number }[], color: string) => {
    const g = new THREE.BufferGeometry().setFromPoints(pts.map((p) => new THREE.Vector3(p.x, 0.03, p.y)))
    const l = new THREE.Line(g, new THREE.LineDashedMaterial({ color, dashSize: 0.35, gapSize: 0.2 })); l.computeLineDistances(); scene.add(l)
  }
  const place = (clip: HoundClip, x: number, y: number, faceTo: { x: number; y: number }, t: number) => {
    const g = buildHoundMesh(false, 2 + Math.round(x * 3 + y), 'hostile'); scene.add(g)
    for (let i = 0; i < 18; i++) animateHoundClip(g, clip, t + i / 30, 'hostile', 1 / 30)
    g.position.set(x, 0, y); g.rotation.y = -Math.atan2(faceTo.y - y, faceTo.x - x); return g
  }
  place('stalk', lead.x, lead.y, { x: 0, y: 0 }, 0.3)
  for (const side of [1, -1]) {
    const start = { x: lead.x + 1.6, y: side * 1.6 }
    const wp = houndFlankGoal(0, 0, lead.x, lead.y, side, 0), goal = houndFlankGoal(0, 0, lead.x, lead.y, side, 1)
    line([start, wp, goal], side > 0 ? '#ff8a5c' : '#7cc4ff')
    line([goal, { x: goal.x * 0.35, y: goal.y * 0.35 }], '#ff4040')
    place('trot', goal.x, goal.y, { x: 0, y: 0 }, 0.1 + side * 0.07)
    const ghost = place('trot', wp.x, wp.y, goal, 0.2); ghost.traverse((o: any) => { if (o.isMesh) { o.material = o.material.clone(); o.material.transparent = true; o.material.opacity = 0.35 } })
  }
  line([{ x: lead.x, y: 0 }, { x: 0.6, y: 0 }], '#ff4040')
  const c1 = new THREE.PerspectiveCamera(42, pw / H, 0.05, 120); c1.position.set(2.2, 12.5, 7.2); c1.lookAt(1.4, 0, 0.2); c1.updateMatrixWorld()
  panels.push({ cam: c1, x: 0, y: 0, w: pw, h: H })
  const lab1 = (p: { x: number; y: number }, html: string) => { const q = new THREE.Vector3(p.x, 0, p.y).project(c1); lab.insertAdjacentHTML('beforeend', `<div class="l" style="left:${(q.x * 0.5 + 0.5) * pw}px;top:${(1 - (q.y * 0.5 + 0.5)) * H + 14}px;font-size:14px">${html}</div>`) }
  lab1({ x: 0, y: 0 }, '玩家<br><span class="s">视野 ±0.6 rad（黄扇区）</span>')
  lab1(lead, `头犬：嚎叫后在正面 ${HD.LEAD_HOLD} m 低伏吸引`)
  lab1(houndFlankGoal(0, 0, lead.x, lead.y, 1, 0), '① 横向绕开（不进正面视野）')
  lab1(houndFlankGoal(0, 0, lead.x, lead.y, -1, 1), `② 侧后方就位（横 ${HD.FLANK_SIDE} m · 后 ${HD.FLANK_BEHIND} m）→ ③ 全体收拢`)
  lab.insertAdjacentHTML('beforeend', `<div class="l" style="left:${pw / 2}px;top:10px">群猎包抄（2–3 只一群）</div>`)
  // —— 右：pin ——
  const X = 60, facing = 0, off = HD.PIN_OFF
  ply(X + off - 0.15, 0, true)
  const g = buildHoundMesh(false, 4, 'hostile'); scene.add(g)
  const e = fake({ phase: 'pin', jaw: 1 }); Object.assign(e, { x: X, y: 0, facing, state: 'attack', hp: 35, dead: false, deathT: 0, attackCd: 0, lungeT: 0 })
  g.position.set(X, 0, 0); g.rotation.y = -facing
  for (let i = 0; i < 24; i++) animateHound(g as THREE.Group, e, 0.5 + i / 30, 0, { dist: off, px: X + off, py: 0 })
  const c2 = new THREE.PerspectiveCamera(36, qw / H, 0.02, 80); c2.position.set(X + 0.9, 1.35, -3.4); c2.lookAt(X + 0.55, 0.3, 0); c2.updateMatrixWorld()
  panels.push({ cam: c2, x: pw, y: 0, w: qw, h: H })
  g.updateMatrixWorld(true)
  const paws = g.userData.houndRig.legs.filter((L: any) => L.front).map((L: any) => L.paw.getWorldPosition(new THREE.Vector3()))
  info.pinPaws = paws.map((v: THREE.Vector3) => [+(v.x - X).toFixed(3), +v.y.toFixed(3)])
  lab.insertAdjacentHTML('beforeend', `<div class="l" style="left:${pw + qw / 2}px;top:10px">扑倒压制 pin<br><span class="s">前爪落在玩家胸口（按玩家实际位置）· 每秒撕咬 ${HD.PIN_BITE} · 连按 ${HD.PIN_NEED} 下挣脱 / 手电照脸 / 同伴攻击</span></div>`)
}
