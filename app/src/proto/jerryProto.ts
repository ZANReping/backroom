/* eslint-disable @typescript-eslint/no-explicit-any -- 原型页用简化的实体替身，不进生产包 */
// 原型预览页：鹉主杰瑞重制（?mode=front | side | back | close | poses | shoulder | perch；&real=1 真实感材质；&cpu=1 CPU 蒙皮替身）
import * as THREE from 'three'
import { buildJerryMesh, animateJerry, jerryBudget, jerryShoulderPoint } from '../game/renderer/jerryMesh'
import { preloadRetroAvatarTextures, retroModelReady } from '../game/renderer/retroAvatar'
import { setMaterialMode } from '../game/renderer/shared'
import { QA_CPU_SKIN, syncSceneCpuSkins } from '../game/renderer/qaCpuSkin'
import type { JerryPose } from '../game/engine/jerryAI'
import { buildCharacterModel } from '../game/renderer/characterModel'
import { humanoidMotion } from '../game/renderer/humanoidMotion'
import { NPCS, npcAvatar } from '../game/content/npcs'

const Q = new URLSearchParams(location.search)
const mode = Q.get('mode') ?? 'poses'
if (Q.get('real') === '1') setMaterialMode('realistic')
const W = innerWidth, H = innerHeight
const renderer = new THREE.WebGLRenderer({ antialias: true }); renderer.setSize(W, H); renderer.outputColorSpace = THREE.SRGBColorSpace
document.body.appendChild(renderer.domElement)
const scene = new THREE.Scene(); scene.background = new THREE.Color('#9aa4d6'); scene.fog = new THREE.Fog(scene.background as THREE.Color, 14, 40)
// L274 教堂：蓝灰石板地面 + 蓝白石墙
const fl = new THREE.Mesh(new THREE.PlaneGeometry(400, 60), new THREE.MeshLambertMaterial({ color: '#7d86b8' })); fl.rotation.x = -Math.PI / 2; fl.position.x = 100; scene.add(fl)
const wl = new THREE.Mesh(new THREE.PlaneGeometry(400, 9), new THREE.MeshLambertMaterial({ color: '#d4d9f2' })); wl.position.set(100, 4, -3.2); scene.add(wl)
scene.add(new THREE.HemisphereLight('#f4f2ff', '#4a4f78', 1.25)); const sun = new THREE.DirectionalLight('#fff8ee', 1.7); sun.position.set(2.5, 5, 6); scene.add(sun)
const fillL = new THREE.DirectionalLight('#c8d8ff', 0.45); fillL.position.set(-4, 2, -2); scene.add(fillL)
const cam = new THREE.PerspectiveCamera(30, W / H, 0.05, 80)
const lab = document.getElementById('lab')!
const cells: { cam: THREE.PerspectiveCamera; x: number; y: number; w: number; h: number }[] = []
let waitFor: THREE.Object3D | null = null
let worst = { meshes: 0, draws: 0, tris: 0, bones: 0 }
const P0: JerryPose = { gazeYaw: 0, gazePitch: 0, tilt: 0, talk: 0, preen: 0, preenSide: 1, shake: 0, spread: 0, flap: 0, glide: 0, pounce: 0, crouch: 0, scream: 0 }
/** 栖木（与 structures.ts 'perch' 同尺寸：横杆顶面 1.48m） */
function perch(x: number, z: number) {
  const g = new THREE.Group(), wood = new THREE.MeshLambertMaterial({ color: '#6a4e34' }), stone = new THREE.MeshLambertMaterial({ color: '#c8ccd8' }), gold = new THREE.MeshLambertMaterial({ color: '#d4af37' })
  const c = (rt: number, rb: number, h: number, m: THREE.Material, y: number) => { const o = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, 12), m); o.position.y = y; g.add(o); return o }
  c(0.3, 0.36, 0.14, stone, 0.07); c(0.16, 0.2, 0.08, stone, 0.18); c(0.035, 0.05, 1.24, wood, 0.84); c(0.06, 0.06, 0.05, gold, 1.39)
  const bar = c(0.036, 0.036, 0.78, new THREE.MeshLambertMaterial({ color: '#7a5a3a' }), 1.444); bar.rotation.z = Math.PI / 2
  g.position.set(x, 0, z); scene.add(g); return g
}
/** 放一只杰瑞：x/z 位置、y 高度、rotY（模型正面 +X；-π/2 让正面朝 +Z 相机） */
function place(st: Partial<JerryPose>, x: number, y: number, z: number, rotY: number, t = 1.7) {
  const g = buildJerryMesh()
  g.position.set(x, y, z); g.rotation.y = rotY; scene.add(g)
  animateJerry(g, { jy: { ...P0, ...st } } as any, t)
  const b = jerryBudget(g); if (b.tris > worst.tris || b.draws > worst.draws) worst = b
  return g
}
const FACE_CAM = -Math.PI / 2
const label = (x: number, y: number, txt: string) => lab.insertAdjacentHTML('beforeend', `<div class="l" style="left:${x}px;top:${y}px">${txt}</div>`)
if (mode === 'front' || mode === 'side' || mode === 'back') {
  perch(0, 0)
  place({ gazeYaw: 0.0, tilt: 0.18 }, 0, 1.48, 0, FACE_CAM)
  if (mode === 'front') { cam.position.set(0.05, 1.6, 2.3); cam.lookAt(0, 1.35, 0) }
  else if (mode === 'side') { cam.position.set(2.3, 1.55, 0.15); cam.lookAt(0, 1.35, 0) }
  else { cam.position.set(-0.3, 1.65, -2.3); cam.lookAt(0, 1.35, 0) }
} else if (mode === 'close') {
  perch(0, 0)
  place({ gazeYaw: 0.35, tilt: 0.25, talk: 0.8 }, 0, 1.48, 0, FACE_CAM, 0.12)
  cam.position.set(0.32, 1.9, 0.62); cam.lookAt(0, 1.84, 0.05)
} else if (mode === 'perch') {
  // 栖木全景：人高参照 + 长尾羽垂在杆后
  perch(0, 0)
  place({ gazeYaw: 0.5, tilt: -0.3 }, 0, 1.48, 0, FACE_CAM + 0.5)
  const man = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 1.25, 4, 10), new THREE.MeshLambertMaterial({ color: '#5a6a88' })); man.position.set(0.9, 0.85, 0.3); scene.add(man)
  cam.position.set(1.4, 1.5, 3.6); cam.lookAt(0.3, 1.1, 0)
} else if (mode === 'shoulder') {
  // 站在青鸟神父左肩上（与游戏渲染层相同：贴到 upperArmL 骨骼的世界位置上方 7.2cm）
  const pm = buildCharacterModel(npcAvatar(NPCS.bluebird), { npcId: 'bluebird', npcDef: NPCS.bluebird, driven: true })
  const inner = new THREE.Group(); inner.rotation.y = Math.PI / 2; inner.add(pm)
  const npc = new THREE.Group(); npc.add(inner); npc.rotation.y = FACE_CAM + 0.35; scene.add(npc)
  scene.updateMatrixWorld(true)
  const hm = humanoidMotion(pm)
  hm?.update({ time: 1, x: 0, y: 0, z: 0, facing: -npc.rotation.y, attack: 0, tool: false, special: false, ground: () => 0 } as any)
  scene.updateMatrixWorld(true)
  const v = new THREE.Vector3()
  if (hm) jerryShoulderPoint(hm.rig.bones.upperArmL, hm.rig.bones.clavicleL, v); else v.set(0, 1.45, 0.2)
  place({ gazeYaw: -0.4, tilt: 0.3 }, v.x, v.y, v.z, npc.rotation.y)
  waitFor = pm
  ;(window as any).__shoulder = v.toArray()
  cam.position.set(0.9, 1.75, 2.6); cam.lookAt(0, 1.45, 0)
} else {
  // poses：8 个姿态，4×2 分镜
  const items: [Partial<JerryPose>, string, number][] = [
    [{ tilt: 0.42, gazeYaw: 0.5 }, '歪头注视', 0],
    [{ preen: 1, preenSide: 1 }, '梳理羽毛', 0],
    [{ talk: 1, gazeYaw: 0.25, tilt: -0.15 }, '说话（喙开合）', 0],
    [{ shake: 1 }, '抖羽', 0],
    [{ spread: 1, flap: 0.15 }, '展翅', 0],
    [{ spread: 1, flap: 1, crouch: 0.3 }, '笨拙扑跳（振翅）', 1],
    [{ spread: 1, glide: 1, flap: 0.1 }, '短距滑翔', 1],
    [{ spread: 1, pounce: 1, scream: 1, flap: 0.35 }, '尖啸扑击', 1],
  ]
  const cols = 4, rowsN = 2, cw = W / cols, ch = H / rowsN
  items.forEach(([st, name, kind], i) => {
    const x = i * 20
    if (kind === 0) perch(x, 0)
    place(st, x, kind === 0 ? 1.48 : 1.25, 0, FACE_CAM + (kind === 1 ? 0.75 : 0.45), 1.7 + i * 0.37)
    const cc = new THREE.PerspectiveCamera(34, cw / ch, 0.05, 40)
    if (kind === 1) { cc.position.set(x + 0.4, 1.9, 2.4); cc.lookAt(x, 1.3, 0) } else { cc.position.set(x + 0.3, 1.55, 2.1); cc.lookAt(x, 1.42, 0) }
    const col = i % cols, row = Math.floor(i / cols)
    cells.push({ cam: cc, x: col * cw, y: (rowsN - 1 - row) * ch, w: cw, h: ch })
    label(col * cw + cw / 2, row * ch + ch - 34, name)
  })
}
label(W - 170, 8, `<span class="s">单只 ${worst.meshes} 网格 / ${worst.draws} 次绘制 / ${worst.tris} 三角面 / ${worst.bones} 骨骼${QA_CPU_SKIN ? ' · CPU 蒙皮' : ''}</span>`)
cam.updateMatrixWorld()
if (waitFor) { preloadRetroAvatarTextures(); for (let i = 0; i < 60 && !retroModelReady(waitFor); i++) await new Promise((r) => setTimeout(r, 100)) } // 等人物贴图加载
if (QA_CPU_SKIN) syncSceneCpuSkins(scene)
let retries = 0
for (; retries < 6; retries++) {
  if (cells.length) {
    renderer.setScissorTest(true)
    for (const c of cells) { renderer.setViewport(c.x, c.y, c.w, c.h); renderer.setScissor(c.x, c.y, c.w, c.h); renderer.render(scene, c.cam) }
    renderer.setScissorTest(false)
  } else renderer.render(scene, cam)
  const bad = (renderer.info.programs ?? []).some((p: any) => p.diagnostics && p.diagnostics.runnable === false)
  if (!bad) break
}
;(window as any).__retries = retries; (window as any).__ready = true; (window as any).__budget = worst
