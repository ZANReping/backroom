/* eslint-disable @typescript-eslint/no-explicit-any -- 测试桩/原型页用简化的引擎替身，不进生产包 */
// 原型预览页：肢团重制（?mode=poses[&set=l3] | close | side；调试视角 back | top）
import * as THREE from 'three'
import { buildEntityMesh } from '../game/renderer/entitiesMesh'
import { animateClump } from '../game/renderer/clumpMesh'
import type { ClumpState } from '../game/engine/clumpAI'
const mode = new URLSearchParams(location.search).get('mode') ?? 'poses'
// ?cpu=1：把蒙皮姿态在 CPU 上烘焙成静态网格再渲染（同一套骨骼权重与矩阵）。无头 Chromium 的 SwiftShader
// 软件光栅在 GPU 蒙皮着色器上会崩溃（项目里已有的蒙皮死亡飞蛾同样复现），截图验收时用它绕开。
const cpuSkin = new URLSearchParams(location.search).get('cpu') === '1'
function bakeSkin(root: THREE.Object3D) {
  root.updateMatrixWorld(true)
  const list: THREE.SkinnedMesh[] = []
  root.traverse((o) => { if ((o as THREE.SkinnedMesh).isSkinnedMesh) list.push(o as THREE.SkinnedMesh) })
  for (const sk of list) {
    sk.skeleton.update()
    const g = sk.geometry.clone(), pos = g.attributes.position as THREE.BufferAttribute, nor = g.attributes.normal as THREE.BufferAttribute
    const v = new THREE.Vector3(), n = new THREE.Vector3(), a = new THREE.Vector3()
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i); n.fromBufferAttribute(nor, i)
      a.copy(v).addScaledVector(n, 0.01)
      sk.applyBoneTransform(i, v); sk.applyBoneTransform(i, a)
      pos.setXYZ(i, v.x, v.y, v.z); a.sub(v).normalize(); nor.setXYZ(i, a.x, a.y, a.z)
    }
    g.deleteAttribute('skinIndex'); g.deleteAttribute('skinWeight')
    const m = new THREE.Mesh(g, sk.material); m.userData.baked = true; m.position.copy(sk.position); m.quaternion.copy(sk.quaternion)
    sk.parent!.add(m); sk.visible = false
  }
}
const W = innerWidth, H = innerHeight
const renderer = new THREE.WebGLRenderer({ antialias: true }); renderer.setSize(W, H); renderer.outputColorSpace = THREE.SRGBColorSpace
document.body.appendChild(renderer.domElement)
const scene = new THREE.Scene(); scene.background = new THREE.Color('#2e2620'); scene.fog = new THREE.Fog(scene.background as THREE.Color, 10, 34)
const fl = new THREE.Mesh(new THREE.PlaneGeometry(600, 60), new THREE.MeshLambertMaterial({ color: '#5d544b' })); fl.rotation.x = -Math.PI / 2; fl.position.x = 90; scene.add(fl)
const wl = new THREE.Mesh(new THREE.PlaneGeometry(600, 8), new THREE.MeshLambertMaterial({ color: '#7a5a44' })); wl.position.set(90, 3.5, -4); scene.add(wl)
// 碎石堆（附图里肢团蹲踞在碎石上）
{
  const rocks = new THREE.Group(), m = new THREE.MeshLambertMaterial({ color: '#77736e', flatShading: true })
  let a = 7
  const R = () => { a = (a * 16807) % 2147483647; return a / 2147483647 }
  for (let i = 0; i < 520; i++) { const r = new THREE.Mesh(new THREE.DodecahedronGeometry(0.08 + R() * 0.16), m); r.position.set(-8 + R() * 200, 0.02, (R() - 0.5) * 7 - 1); r.scale.y = 0.55; r.rotation.set(R() * 3, R() * 3, 0); rocks.add(r) }
  scene.add(rocks)
}
scene.add(new THREE.HemisphereLight('#ffe9cc', '#2a221c', 1.05)); const sun = new THREE.DirectionalLight('#ffe6c4', 1.5); sun.position.set(3, 6, 5); scene.add(sun)
const cam = new THREE.PerspectiveCamera(34, W / H, 0.1, 80)
const lab = document.getElementById('lab')!
const cells: { cam: THREE.PerspectiveCamera; x: number; y: number; w: number; h: number }[] = []
type Pose = Partial<ClumpState>
const base: Pose = { phase: 'roam', speed: 0, arm: 0, armLen: 1.5, wind: 0, mouth: 0, chew: 0, sit: 0, ceil: 0, gait: 1.2, tangle: 0, shot: 0, harm: 0, pull: 0, lunge: 0, weapon: 'none' }
const pose = (l3: boolean, st: Pose, x: number, z: number, rotY: number, head = 2.8, seed = 2) => {
  const g = buildEntityMesh('clump', { seed, l3clump: l3 })
  const sc = l3 ? 1.5 : 1
  g.scale.setScalar(sc); g.position.set(x, 0, z); g.rotation.y = rotY; scene.add(g)
  const e: any = { id: seed, hp: 60, def: { hp: 60, scale: sc }, cl: { ...base, ...st } }
  animateClump(g, e, 1.7, 0, head)
  if (cpuSkin) bakeSkin(g)
  let c = 0, v = 0; g.traverse((m: any) => { if (m.isMesh && !m.userData.baked) { c++; if (m.visible || m.isSkinnedMesh) v++ } }); return { c, v }
}
const dummy = (x: number, z: number) => { // 被抓的流浪者示意
  const m = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 1.1, 4, 10), new THREE.MeshLambertMaterial({ color: '#4a6378' })); m.position.set(x, 0.78, z); scene.add(m)
}
if (mode === 'back') {
  cam.position.set(0.3, 1.0, -3.4); cam.lookAt(0.05, 0.4, 0)
  pose(false, { phase: 'roam' }, 0, 0, 0)
} else if (mode === 'top') {
  cam.position.set(0, 4.2, 0.01); cam.lookAt(0, 0, 0)
  pose(false, { phase: 'roam' }, 0, 0, 0)
} else if (mode === 'side') {
  cam.position.set(0.2, 1.1, 3.4); cam.lookAt(0.05, 0.42, 0)
  pose(false, { phase: 'roam' }, 0, 0, 0)
} else if (mode === 'close') {
  cam.position.set(1.55, 0.95, 0.9); cam.lookAt(0.2, 0.36, 0)
  pose(false, { phase: 'devour', mouth: 1 }, 0, 0, 0)
} else {
  // poses：普通肢团一排；&set=l3：L3 子变种一排
  const l3 = new URLSearchParams(location.search).get('set') === 'l3'
  const items: [Pose, string][] = l3 ? [
    [{ phase: 'hunt', speed: 5.5, weapon: 'brick', gait: 1.6 }, 'L3 持砖追击'],
    [{ phase: 'hunt', weapon: 'stone', lunge: 0.7 }, 'L3 石器挥砸'],
    [{ phase: 'hunt', weapon: 'squirt', shot: 0.6 }, 'L3 滋水枪（腰果水）'],
    [{ phase: 'hunt', weapon: 'bone', speed: 2 }, 'L3 骨刺'],
    [{ phase: 'hunt', ceil: 1, speed: 4, weapon: 'brick' }, 'L3 贴顶'],
    [{ phase: 'pounce', ceil: 0.45, weapon: 'brick' }, 'L3 俯扑'],
    [{ phase: 'pullup', pull: 0.6 }, 'L3 引体向上'],
  ] : [
    [{ phase: 'roam', speed: 0.6 }, '游荡'],
    [{ phase: 'hunt', speed: 5, gait: 2.1 }, '甩肢冲刺'],
    [{ phase: 'hunt', speed: 3, tangle: 1, gait: 3.3 }, '混乱期：肢体缠成一团'],
    [{ phase: 'windup', wind: 1 }, '蓄力（收紧主臂）'],
    [{ phase: 'grab', arm: 1, armLen: 2.2, mouth: 0.45 }, '主臂抓取、拖拽'],
    [{ phase: 'devour', mouth: 1, arm: 0.35, armLen: 0.8 }, '齿口吞食'],
    [{ phase: 'fasting', sit: 1 }, '绝食静坐'],
  ]
  // 网格分镜：每个姿态各占一格、各自的相机（4×2），彼此相距 30m 互不入镜
  const cols = 4, rowsN = 2, cw = W / cols, ch = H / rowsN
  let calls = { c: 0, v: 0 }
  items.forEach(([st, name], i) => {
    const x = i * 30, ox = st.phase === 'grab' ? -0.9 : 0
    if (l3 && (st.ceil ?? 0) > 0) {
      const ceil = new THREE.Mesh(new THREE.PlaneGeometry(5, 5), new THREE.MeshBasicMaterial({ color: '#8a7a6a', side: THREE.DoubleSide, transparent: true, opacity: 0.25, depthWrite: false }))
      ceil.rotation.x = Math.PI / 2; ceil.position.set(x, 2.8, 0); scene.add(ceil)
    }
    const rot = st.phase === 'grab' ? 0 : st.phase === 'windup' ? 2.5 : l3 ? -0.4 : -0.3
    const c = pose(l3, st, x + ox, 0, rot, 2.8, (l3 ? 11 : 2) + i)
    if (st.phase === 'grab') dummy(x + ox + 2.2, 0)
    if (c.v > calls.v) calls = c
    const col = i % cols, row = Math.floor(i / cols)
    const cc = new THREE.PerspectiveCamera(36, cw / ch, 0.1, 40)
    const high = l3 && ((st.ceil ?? 0) > 0 || st.phase === 'pullup')
    const wide = st.phase === 'grab'
    cc.position.set(x + (wide ? -0.1 : 0.3), high ? 1.75 : l3 ? 2.0 : 1.35, (high ? 6.6 : l3 ? 5.8 : 3.0) + (wide ? 2.0 : 0)); cc.lookAt(x + (wide ? -0.1 : 0.1), high ? 1.55 : l3 ? 0.7 : 0.38, 0) // L3 肉团更大：相机拉远，贴顶/引体向上抬高取景
    cells.push({ cam: cc, x: col * cw, y: (rowsN - 1 - row) * ch, w: cw, h: ch })
    lab.insertAdjacentHTML('beforeend', `<div class="l" style="left:${col * cw + cw / 2}px;top:${row * ch + ch - 34}px">${name}</div>`)
  })
  lab.insertAdjacentHTML('beforeend', `<div class="l" style="left:${3 * cw + cw / 2}px;top:${ch + ch / 2 - 20}px"><span class="s">${l3 ? 'L3 子变种（体型 ×1.5、持械、贴顶）' : '普通肢团'}<br>单只 ${calls.c} 个网格 / 可见 ${calls.v} 次绘制</span></div>`)
}
cam.updateMatrixWorld()
// 软件光栅（无头 SwiftShader）偶发链接失败且无日志：检测到不可运行的程序时释放材质重编译（最多 6 次），真实 GPU 上一次即过
let retries = 0
for (; retries < 6; retries++) {
  if (cells.length) {
    renderer.setScissorTest(true)
    for (const c of cells) { renderer.setViewport(c.x, c.y, c.w, c.h); renderer.setScissor(c.x, c.y, c.w, c.h); renderer.render(scene, c.cam) }
    renderer.setScissorTest(false)
  } else renderer.render(scene, cam)
  const bad = (renderer.info.programs ?? []).some((p: any) => p.diagnostics && p.diagnostics.runnable === false)
  if (!bad) break
  scene.traverse((o: any) => { if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m: THREE.Material) => m.dispose()) })
}
;(window as any).__retries = retries; (window as any).__ready = true
