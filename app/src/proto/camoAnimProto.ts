// 迷彩爬行者第 2 阶段动画预览（proto-camocrawler.html?anim=<片段>）。
//   单帧采样：?anim=<clip>&t=<秒>[&view=side|three|front|back|top]
//   网格截帧：?anim=<clip>&frames=N[&cols=4&cw=420&ch=360]（非循环片段从 0 采到 len，循环片段采一整圈）
//   GIF 序列：?anim=<clip>&frames=N&fps=20&period=<秒>（第 i 帧 t=(i/fps) mod period，非循环片段超过 len 停在末帧）
// 行走/奔跑按 CAMO_CLIPS.speed 把整只往 +X 推、相机跟随，地面网格就能看出脚是否锁地。
// 每帧的 dataURL 放进 window.__frames（拼 GIF 用），每帧的穿地/漂浮/打滑统计放进 window.__info。
import * as THREE from 'three'
import { buildCamoCrawlerMesh, buildCamoBoulder } from '../game/renderer/camoCrawlerMesh'
import { CAMO_CLIPS, CAMO_CLING_WALL_X, poseCamo, camoJointPos, camoContactInfo, type CamoClip } from '../game/renderer/camoCrawlerAnim'

const Q = new URLSearchParams(location.search)
const clip = (CAMO_CLIPS[Q.get('anim') as CamoClip] ? Q.get('anim') : 'walk') as CamoClip
const info = CAMO_CLIPS[clip]
const single = Q.has('t'), frames = single ? 1 : +(Q.get('frames') ?? 8)
const fps = Q.has('fps') ? +Q.get('fps')! : 0, period = +(Q.get('period') ?? info.len)
const view = Q.get('view') ?? (clip === 'walk' || clip === 'run' ? 'side' : 'three')
const CW = +(Q.get('cw') ?? (single ? 900 : 420)), CH = +(Q.get('ch') ?? (single ? 800 : 360))
const cols = Math.min(frames, +(Q.get('cols') ?? 4)), rows = Math.ceil(frames / cols)
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true }); renderer.setSize(CW, CH); renderer.outputColorSpace = THREE.SRGBColorSpace
const scene = new THREE.Scene(); scene.background = new THREE.Color('#201f1c')
scene.add(new THREE.HemisphereLight('#e6e4dc', '#2a2620', 1.0)); const sun = new THREE.DirectionalLight('#f4efe2', 1.4); sun.position.set(2.5, 5, 4); scene.add(sun)
const fill = new THREE.DirectionalLight('#cfd8ff', 0.35); fill.position.set(-3, 1.5, -2); scene.add(fill)
// 地面 + 0.25m 网格（看脚是否锁地）
const fl = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.MeshLambertMaterial({ color: '#5d5850' })); fl.rotation.x = -Math.PI / 2; scene.add(fl)
const grid = new THREE.GridHelper(60, 240, '#77716a', '#6c665e'); grid.position.y = 0.002; scene.add(grid)
const g = buildCamoCrawlerMesh(+(Q.get('seed') ?? 0)); scene.add(g)
// 伪装 / 现身：身后岩壁（取模型的岩面贴图，对齐伪装）
if (clip === 'idle_camo' || clip === 'reveal') {
  const tex = (g.userData.camoRig.camo.uRock.value as THREE.Texture).clone(); tex.needsUpdate = true; tex.repeat.set(5, 3.5)
  const wg = new THREE.PlaneGeometry(4.5, 3.2, 40, 30), pa = wg.attributes.position as THREE.BufferAttribute
  for (let i = 0; i < pa.count; i++) { const px = pa.getX(i), py = pa.getY(i); pa.setZ(i, 0.025 * Math.sin(px * 3.1 + py * 1.7) * Math.sin(py * 2.3)) }
  wg.computeVertexNormals()
  const w = new THREE.Mesh(wg, new THREE.MeshLambertMaterial({ map: tex })); w.rotation.y = Math.PI / 2; w.position.set(CAMO_CLING_WALL_X - 0.03, 1.6, 0); scene.add(w)
}
// 被引开：投掷物落点放一块小石子
const target = new THREE.Vector3(0.62, 0, 0.42)
if (clip === 'distracted') { const p = new THREE.Mesh(new THREE.IcosahedronGeometry(0.05, 1), new THREE.MeshLambertMaterial({ color: '#bdb3a2' })); p.position.copy(target).setY(0.04); scene.add(p) }
// 巨石：几何居中，把真实半尺寸告诉动画
let boulder: THREE.Mesh | null = null, boulderHalf: { y: number; z: number } | undefined
if (clip === 'lift' || clip === 'slam') {
  boulder = buildCamoBoulder(2); boulder.geometry.computeBoundingBox()
  const bb = boulder.geometry.boundingBox!, c = bb.getCenter(new THREE.Vector3()); boulder.geometry.translate(-c.x, -c.y, -c.z); boulder.geometry.computeBoundingBox()
  const s = boulder.geometry.boundingBox!.getSize(new THREE.Vector3()); boulderHalf = { y: s.y / 2, z: s.z / 2 }; (window as any).__bx = s.x / 2
}
const opts = { boulderHalf, target }

const CEN: Record<string, [number, number, number]> = { lift: [0.35, 1.2, 0], slam: [0.4, 1.2, 0], death: [0.05, 0.6, 0], run: [0.2, 0.6, 0], distracted: [0.35, 0.65, 0.2], idle_camo: [0, 1.05, 0], reveal: [0, 1.05, 0] }
const C = new THREE.Vector3(...(CEN[clip] ?? [0.15, 0.9, 0]))
const dirs: Record<string, [number, number, number]> = { side: [0.05, 0.14, 1], front: [1, 0.2, 0.12], three: [0.8, 0.32, 0.9], back: [-0.8, 0.35, 0.7], top: [0.001, 1, 0.0001] }
const d = new THREE.Vector3(...(dirs[view] ?? dirs.three)).normalize()
const dist = +(Q.get('dist') ?? (clip === 'lift' || clip === 'slam' ? 5.4 : clip === 'idle_camo' || clip === 'reveal' ? 4.6 : 4.2))
const cam = new THREE.PerspectiveCamera(34, CW / CH, 0.05, 80)
if (view === 'top') cam.up.set(1, 0, 0)

const out = document.createElement('canvas'); out.width = cols * CW; out.height = rows * CH + (single ? 0 : 30)
const ctx = out.getContext('2d')!; ctx.fillStyle = '#111'; ctx.fillRect(0, 0, out.width, out.height)
document.body.appendChild(out); out.style.display = 'block'
const urls: string[] = [], stat: Record<string, unknown>[] = []
const box = new THREE.Box3()
const meshMinY = (o: THREE.Object3D) => { let m = Infinity; o.traverse((c) => { if ((c as THREE.Mesh).isMesh && c !== boulder && c.visible) { box.setFromObject(c, true); m = Math.min(m, box.min.y) } }); return m }
const rig = g.userData.camoRig
const minYof = (objs: THREE.Object3D[]) => Math.min(...objs.map(meshMinY))
const timeAt = (i: number) => single ? +Q.get('t')! : fps ? Math.min((i / fps) % period, info.len) : info.loop ? (i / frames) * info.len : (i / Math.max(1, frames - 1)) * info.len
for (let i = 0; i < frames; i++) {
  const t = timeAt(i)
  const pose = poseCamo(g, clip, t, opts, boulder)
  // 根位移（行走/奔跑）：整只沿 +X 前进，相机跟随
  const rx = (info.speed ?? 0) * t
  g.position.x = rx
  const Cw = C.clone().add(new THREE.Vector3(rx, 0, 0))
  cam.position.copy(Cw).addScaledVector(d, dist); cam.lookAt(Cw); cam.updateMatrixWorld()
  g.updateMatrixWorld(true)
  renderer.render(scene, cam)
  if (!single) {
    ctx.drawImage(renderer.domElement, (i % cols) * CW, 30 + Math.floor(i / cols) * CH)
    ctx.fillStyle = '#ddd6c2'; ctx.font = '13px sans-serif'; ctx.fillText(`t=${t.toFixed(2)}s`, (i % cols) * CW + 8, 30 + Math.floor(i / cols) * CH + 18)
  } else ctx.drawImage(renderer.domElement, 0, 0)
  urls.push(renderer.domElement.toDataURL('image/png'))
  const feet = rig.legs.map((L: any) => minYof([L.j[2]]))
  const lowerHands = rig.arms.filter((A: any) => !A.upper).map((A: any) => minYof([A.j[2]]))
  // 分部位最低点：四臂（整条，含手）、两腿、头
  const parts: Record<string, number> = {}
  rig.arms.forEach((A: any, k: number) => { parts[`arm${k}${A.upper ? 'U' : 'L'}`] = +minYof([A.j[0]]).toFixed(3) })
  rig.legs.forEach((L: any, k: number) => { parts[`leg${k}`] = +minYof([L.j[0]]).toFixed(3) })
  parts.head = +minYof([rig.head]).toFixed(3)
  { let m = Infinity; rig.chest.children.forEach((c: any) => { if (c.isMesh) { box.setFromObject(c, true); m = Math.min(m, box.min.y) } }); parts.torso = +m.toFixed(3) }
  const ank = [0, 1].map((k) => camoJointPos(g, pose, `g${k}_2`)!.x + rx)
  stat.push({ t: +t.toFixed(3), minY: +meshMinY(g).toFixed(4), feet: feet.map((v: number) => +v.toFixed(4)), hands: lowerHands.map((v: number) => +v.toFixed(4)), parts, stretch: +pose.stretch.toFixed(3), ankX: ank.map((v) => +v.toFixed(3)), boulderY: pose.boulder ? +(pose.boulder.pos.y - (boulderHalf?.y ?? 0)).toFixed(3) : null })
}
// 锁地检查：细采一圈，统计每只脚/下手在支撑相（离地 < 8mm）期间的世界 X 漂移
const slip: Record<string, number> = {}
if (info.speed) {
  const N = 96, ci = camoContactInfo(g)
  const tracks: Record<string, { x: number; y: number }[]> = {}
  for (let i = 0; i <= N; i++) {
    const t = (i / N) * info.len, p = poseCamo(g, clip, t, opts)
    const rx = info.speed * t
    for (const [n, drop] of [['g0_2', ci.footDrop], ['g1_2', ci.footDrop], ['a1_2', ci.handDrop[1]], ['a3_2', ci.handDrop[3]]] as const) {
      const v = camoJointPos(g, p, n)!; (tracks[n] ??= []).push({ x: v.x + rx, y: v.y - drop })
    }
  }
  for (const [n, tr] of Object.entries(tracks)) {
    let worst = 0, run: number[] = []
    for (const s of tr) { if (s.y < 0.012) run.push(s.x); else { if (run.length > 1) worst = Math.max(worst, Math.max(...run) - Math.min(...run)); run = [] } }
    if (run.length > 1) worst = Math.max(worst, Math.max(...run) - Math.min(...run))
    slip[n] = +worst.toFixed(4)
  }
}
if (!single) { ctx.fillStyle = '#f3eedf'; ctx.font = 'bold 15px sans-serif'; ctx.fillText(`迷彩爬行者 · ${clip}（${info.loop ? '循环' : '单次'} ${info.len}s${info.speed ? ` · 根速 ${info.speed.toFixed(2)} m/s` : ''}）`, 10, 20) }
const w = window as unknown as Record<string, unknown>
w.__frames = urls; w.__info = { clip, contact: camoContactInfo(g), frames: stat, slip, boulderHalf }; w.__ready = true
// 调试：window.__joints(clip, t) → 关节模型空间坐标
w.__joints = (c: CamoClip, t: number) => { const p = poseCamo(g, c, t, opts, boulder); const o: Record<string, number[]> = {}; for (const n of ['root', 'waist', 'chest', 'head', 'a0_0', 'a0_1', 'a0_2', 'a1_0', 'a1_1', 'a1_2', 'a2_0', 'a2_1', 'a2_2', 'a3_0', 'a3_1', 'a3_2', 'g0_0', 'g0_1', 'g0_2', 'g1_0', 'g1_1', 'g1_2']) o[n] = camoJointPos(g, p, n)!.toArray().map((v) => +v.toFixed(3)); return o }
