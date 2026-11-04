// [jazz] 爵士脑（Entity 197）阶段 1 建模预览：
// proto-jazz.html?who=leader|sax|bass|drum|all&view=front|side|back|three|head|headside|headq|headback|play|hands|lod1|lod2|rigtest|hold|ref|props
//   [&lod=0..2][&cpu=1][&pose=rest|play|rigtest|holdHead][&cam=x,y,z&at=x,y,z&fov=][&label=][&bg=][&nolab=1]
//   who=all：四人合影（萨克斯 / 头儿 / 低音提琴 / 鼓，从左到右），每人头顶标名字与三角数
//   ref：附图同款（红墙、近景、头儿吹小号）；props：道具一格（立式钢琴 / 谱架 / 啤酒杯 / 辣椒酱 / 监控探头）
//   window.__ready / __info（tris、生成耗时、身高 h 等）
import * as THREE from 'three'
import { buildJazz, buildJazzGeometry, jazzTris, setJazzPose, JAZZ_UNI, type JazzRig, type JazzPose } from '../game/renderer/jazzMesh'
import { JAZZ_WHO, JAZZ_ZH, makeJazzRig, type JazzWho } from '../game/renderer/jazzRig'
import { buildUprightPiano, buildMusicStand, buildBeerMug, buildHotSauce, buildCctvCamera } from '../game/renderer/jazzProps'
import { QA_CPU_SKIN, syncSceneCpuSkins } from '../game/renderer/qaCpuSkin'
import { setMaterialMode } from '../game/renderer/shared'
const q = new URLSearchParams(location.search)
const view = q.get('view') ?? 'three'
const whoQ = q.get('who') ?? 'leader'
const lod = Number(q.get('lod') ?? (view === 'lod1' ? 1 : view === 'lod2' ? 2 : 0))
if (q.get('real') === '1') setMaterialMode('realistic')
const W = innerWidth, H = innerHeight
const renderer = new THREE.WebGLRenderer({ antialias: true }); renderer.setSize(W, H); renderer.outputColorSpace = THREE.SRGBColorSpace
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap
document.body.appendChild(renderer.domElement)
const isRef = view === 'ref'
const scene = new THREE.Scene(); scene.background = new THREE.Color(q.get('bg') ?? (isRef ? '#b8203a' : '#24110d'))
const floor = new THREE.Mesh(new THREE.PlaneGeometry(20, 20), new THREE.MeshStandardMaterial({ color: '#3a2418', roughness: 0.85 })); floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor)
const wall = new THREE.Mesh(new THREE.PlaneGeometry(20, 7), new THREE.MeshStandardMaterial({ color: isRef ? '#c4233f' : '#4c1a14', roughness: 0.9 })); wall.position.set(0, 3.5, -2.6); wall.receiveShadow = true; scene.add(wall)
const lab = document.getElementById('lab')!
scene.add(new THREE.HemisphereLight('#fff0dc', '#3a1a10', isRef ? 1.5 : 1.15))
const key = new THREE.DirectionalLight('#fff1dc', isRef ? 3.0 : 2.6); key.position.set(2.0, 3.4, 3.2); key.castShadow = true; key.shadow.mapSize.set(2048, 2048)
Object.assign(key.shadow.camera, { left: -3, right: 3, top: 3, bottom: -0.3, near: 0.1, far: 14 }); key.shadow.bias = -0.0003; key.shadow.normalBias = 0.01; scene.add(key)
const fill = new THREE.DirectionalLight('#dfe4ff', 0.8); fill.position.set(-3, 1.6, 1.6); scene.add(fill)
const rim = new THREE.DirectionalLight('#ffe0c0', 1.0); rim.position.set(1.0, 2.8, -3); scene.add(rim)

const ALL = whoQ === 'all'
const order: JazzWho[] = ALL ? ['sax', 'leader', 'bass', 'drum'] : [JAZZ_WHO.includes(whoQ as JazzWho) ? whoQ as JazzWho : 'leader']
const t0 = performance.now()
const men: { who: JazzWho; g: THREE.Group; rig: JazzRig; x: number }[] = []
const xs = ALL ? [-1.35, -0.45, 0.5, 1.45] : [0]
order.forEach((who, i) => {
  const g = buildJazz(who, { lod }); g.rotation.set(0, 0, 0); g.position.x = xs[i]
  scene.add(g); men.push({ who, g, rig: g.userData.jazz as JazzRig, x: xs[i] })
})
const genMs = performance.now() - t0
const POSE: Record<string, JazzPose> = { play: 'play', rigtest: 'rigtest', hold: 'holdHead', ref: 'play' }
const pose = (q.get('pose') as JazzPose) ?? POSE[view] ?? 'rest'
for (const m of men) setJazzPose(m.rig, pose)
if (view === 'ref') { const r = men[0].rig; r.chest.rotation.y = -0.15 }
const main = men[0], def = makeJazzRig(main.who), Hd = def.J.head
// 头部中心 / 尺寸（相机取景用）
const HC: Record<JazzWho, [number[], number]> = { leader: [[0, 0.13, 0.06], 0.3], sax: [[0, 0.2, 0.04], 0.34], bass: [[0, 0.42, 0.02], 0.62], drum: [[0, 0.24, 0.03], 0.36] }
const [ho, hs] = HC[main.who]
const hc = [Hd[0] + ho[0], Hd[1] + ho[1], Hd[2] + ho[2]]
const tall = main.who === 'bass' ? 2.5 : main.who === 'sax' ? 2.08 : 1.98
const cy = tall * 0.5, dist = tall * 2.25
const cam = new THREE.PerspectiveCamera(30, W / H, 0.01, 80)
const VW: Record<string, [number[], number[], number?]> = {
  front: [[0, cy + 0.05, dist], [0, cy, 0]], side: [[dist, cy + 0.05, 0], [0, cy, 0]], back: [[-0.4, cy + 0.1, -dist], [0, cy, 0]], three: [[dist * 0.56, cy + 0.45, dist * 0.82], [0, cy, 0]],
  lod1: [[dist * 0.56, cy + 0.45, dist * 0.82], [0, cy, 0]], lod2: [[dist * 0.56, cy + 0.45, dist * 0.82], [0, cy, 0]], play: [[dist * 0.4, cy + 0.2, dist * 0.9], [0, cy, 0]], hold: [[dist * 0.4, cy + 0.2, dist * 0.9], [0, cy, 0]],
  rigtest: [[dist * 0.3, hc[1] + 0.2, dist * 0.45], hc, 32],
  head: [[hc[0], hc[1] + hs * 0.25, hc[2] + hs * 4.6], hc], headside: [[hc[0] + hs * 4.6, hc[1] + hs * 0.2, hc[2]], hc], headq: [[hc[0] + hs * 3.0, hc[1] + hs * 1.6, hc[2] + hs * 3.3], hc], headback: [[hc[0] - hs * 1.4, hc[1] + hs * 1.2, hc[2] - hs * 4.2], hc],
  hands: [[-0.2, 1.05, 1.15], [-0.18, 0.92, 0.05], 30],
  ref: main.who === 'sax' ? [[-0.2, hc[1] - 0.06, 1.6], [0.02, hc[1] + 0.0, 0.05], 42] : [[-0.2, hc[1] - 0.22, 1.25], [0.02, hc[1] - 0.12, 0.05], 42],
}
if (ALL) { VW.front = [[0, 1.25, 7.3], [0.05, 1.18, 0], 30]; VW.three = [[3.8, 1.8, 8.2], [0.05, 1.12, 0], 30] }
let [p, l, fv] = VW[view] ?? VW.three
if (q.get('cam')) p = q.get('cam')!.split(',').map(Number)
if (q.get('at')) l = q.get('at')!.split(',').map(Number)
cam.fov = Number(q.get('fov') ?? fv ?? 30); cam.updateProjectionMatrix()
cam.position.set(p[0], p[1], p[2]); cam.lookAt(l[0], l[1], l[2])
if (view === 'back' || view === 'headback') { wall.position.z = 2.6; wall.rotation.y = Math.PI }
if (view === 'side' || view === 'headside') { wall.position.set(-2.6, 3.5, 0); wall.rotation.y = Math.PI / 2 }
if (view === 'props') {
  for (const m of men) m.g.visible = false
  const put = (o: THREE.Object3D, x: number, y: number, z: number, ry = 0, s = 1) => { o.position.set(x, y, z); o.rotation.y = ry; o.scale.setScalar(s); o.traverse((m) => { (m as THREE.Mesh).castShadow = true }); scene.add(o); return o }
  put(buildUprightPiano(), -0.55, 0, -0.6, 0.25)
  put(buildMusicStand(), 0.85, 0, -0.35, -0.4)
  const table = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.03, 32), new THREE.MeshStandardMaterial({ color: '#2a160c', roughness: 0.5 })); table.position.set(0.45, 0.74, 0.55); table.castShadow = table.receiveShadow = true; scene.add(table)
  const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.05, 0.73, 12), table.material); leg.position.set(0.45, 0.365, 0.55); scene.add(leg)
  put(buildBeerMug(), 0.35, 0.755, 0.6, -0.5)
  put(buildHotSauce(), 0.6, 0.755, 0.48, 0.3)
  const cc = put(buildCctvCamera(), 1.55, 2.1, -2.59, 0); cc.rotation.y = -0.5
  cam.position.set(0.5, 1.75, 3.7); cam.lookAt(0.25, 0.85, -0.3); cam.fov = 38; cam.updateProjectionMatrix()
}
for (const m of men) m.g.updateMatrixWorld(true)
if (QA_CPU_SKIN) syncSceneCpuSkins(scene)
cam.updateMatrixWorld(true)
JAZZ_UNI.uSpecDir.value.copy(key.position).normalize().transformDirection(cam.matrixWorldInverse)
const info: Record<string, unknown> = { genMs: Math.round(genMs) }
const bboxOf = (g: THREE.Object3D) => { const b = new THREE.Box3(); g.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh && m.userData.cpuSkin && m.visible) { m.geometry.computeBoundingBox(); b.union(m.geometry.boundingBox!.clone().applyMatrix4(m.matrixWorld)) } }); if (b.isEmpty()) b.setFromObject(g); return b }
for (const m of men) {
  const tm = jazzTris(m.g), b = bboxOf(m.g), st = m.g.userData.jazzStats as Record<string, number>
  const wantL = ALL || view === 'front' || view === 'lod1' || view === 'lod2' || q.get('lods') === '1'
  const lt = [0, 1, 2].map((k) => (wantL || k === lod ? buildJazzGeometry(m.who, k).stats.tris : NaN))
  info[m.who] = { tris: st.tris, meshes: tm.meshes, lods: lt, stats: st, h: +b.max.y.toFixed(3), w: +(b.max.x - b.min.x).toFixed(3), d: +(b.max.z - b.min.z).toFixed(3) }
  if (ALL && !q.get('nolab')) {
    const v = new THREE.Vector3(m.x, b.max.y + 0.08, 0).project(cam)
    lab.insertAdjacentHTML('beforeend', `<div class="l" style="left:${(v.x * 0.5 + 0.5) * W}px;top:${(-v.y * 0.5 + 0.5) * H - 76}px;font-size:24px">${JAZZ_ZH[m.who]}<br><span class="s" style="font-size:16px">LOD0 / 1 / 2：${lt[0]} / ${lt[1]} / ${lt[2]}<br>高 ${b.max.y.toFixed(2)} m</span></div>`)
  }
}
;(window as any).__info = info
if (!q.get('nolab') && !isRef && !ALL && view !== 'props') {
  const m = men[0], i = info[m.who] as { tris: number; lods: number[]; h: number }
  const fmt = (v: number) => (Number.isFinite(v) ? String(v) : '—')
  lab.insertAdjacentHTML('beforeend', `<div class="l" style="left:${W / 2}px;top:8px">爵士脑 E197 · ${JAZZ_ZH[m.who]} · ${q.get('label') ?? view}${lod ? ' · LOD' + lod : ''}<br><span class="s">${i.tris} 三角形（LOD0 ${fmt(i.lods[0])} / LOD1 ${fmt(i.lods[1])} / LOD2 ${fmt(i.lods[2])}）· 高 ${i.h.toFixed(2)} m · 生成 ${genMs.toFixed(0)} ms${QA_CPU_SKIN ? ' · CPU 蒙皮' : ''}</span></div>`)
}
let n = 0; const loop = () => {
  if (QA_CPU_SKIN) syncSceneCpuSkins(scene); renderer.render(scene, cam); if (++n < 8) requestAnimationFrame(loop); else (window as any).__ready = true
}; loop()
