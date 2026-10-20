/* eslint-disable @typescript-eslint/no-explicit-any -- 原型页用简化的实体替身，不进生产包 */
// 原型预览页：派对客重制（?mode=front | side | close | poses | colors；&real=1 用真实感材质；&cpu=1 CPU 烘焙蒙皮）
import * as THREE from 'three'
import { buildPartygoerMesh, animatePartygoer, partygoerBudget, PARTYGOER_CPU_SKIN } from '../game/renderer/partygoerMesh'
import { setMaterialMode } from '../game/renderer/shared'
import type { PartyState } from '../game/engine/partygoerAI'
import { partygoerLook } from '../game/entities/partygoerLook'
const Q = new URLSearchParams(location.search)
const mode = Q.get('mode') ?? 'poses'
if (Q.get('real') === '1') setMaterialMode('realistic')
// ?cpu=1：把蒙皮姿态在 CPU 上烘焙成静态网格再渲染（同一套骨骼权重与矩阵）——无头 SwiftShader 链接大型蒙皮着色器会失败
const cpuSkin = Q.get('cpu') === '1'
function bakeSkin(root: THREE.Object3D) {
  root.updateMatrixWorld(true)
  const list: THREE.SkinnedMesh[] = []
  root.traverse((o) => { if ((o as THREE.SkinnedMesh).isSkinnedMesh) list.push(o as THREE.SkinnedMesh) })
  for (const sk of list) {
    sk.skeleton.update()
    const g = sk.geometry.clone(), pos = g.attributes.position as THREE.BufferAttribute, nor = g.attributes.normal as THREE.BufferAttribute
    const v = new THREE.Vector3(), a = new THREE.Vector3(), n = new THREE.Vector3()
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i); n.fromBufferAttribute(nor, i)
      a.copy(v).addScaledVector(n, 0.01)
      sk.applyBoneTransform(i, v); sk.applyBoneTransform(i, a)
      pos.setXYZ(i, v.x, v.y, v.z); a.sub(v).normalize(); nor.setXYZ(i, a.x, a.y, a.z)
    }
    g.deleteAttribute('skinIndex'); g.deleteAttribute('skinWeight')
    const m = new THREE.Mesh(g, sk.material); m.userData.baked = true; m.position.copy(sk.position); m.quaternion.copy(sk.quaternion); m.scale.copy(sk.scale)
    sk.parent!.add(m); sk.visible = false
  }
}
const W = innerWidth, H = innerHeight
const renderer = new THREE.WebGLRenderer({ antialias: true }); renderer.setSize(W, H); renderer.outputColorSpace = THREE.SRGBColorSpace
document.body.appendChild(renderer.domElement)
const scene = new THREE.Scene(); scene.background = new THREE.Color('#2d271f'); scene.fog = new THREE.Fog(scene.background as THREE.Color, 12, 40)
// L601 图书馆：木地板 + 书架墙
const fl = new THREE.Mesh(new THREE.PlaneGeometry(400, 60), new THREE.MeshLambertMaterial({ color: '#8a7656' })); fl.rotation.x = -Math.PI / 2; fl.position.x = 100; scene.add(fl)
const wl = new THREE.Mesh(new THREE.PlaneGeometry(400, 8), new THREE.MeshLambertMaterial({ color: '#b9a888' })); wl.position.set(100, 3.5, -3); scene.add(wl)
{
  const shelf = new THREE.MeshLambertMaterial({ color: '#5a3e24' }), books = ['#7a2a22', '#2c4a6a', '#3d5a34', '#8a6a2a', '#5a2c4a', '#a08458']
  let a = 11; const R = () => { a = (a * 16807) % 2147483647; return a / 2147483647 }
  for (let x = -10; x < 220; x += 2.4) {
    const s = new THREE.Mesh(new THREE.BoxGeometry(2.3, 2.6, 0.4), shelf); s.position.set(x, 1.3, -2.75); scene.add(s)
    for (let r = 0; r < 4; r++) for (let k = 0; k < 9; k++) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.45 + R() * 0.12, 0.3), new THREE.MeshLambertMaterial({ color: books[Math.floor(R() * books.length)] }))
      b.position.set(x - 1.0 + k * 0.24, 0.35 + r * 0.62, -2.5); scene.add(b)
    }
  }
}
scene.add(new THREE.HemisphereLight('#fff2d8', '#3a3024', 1.15)); const sun = new THREE.DirectionalLight('#fff0d4', 1.55); sun.position.set(2.5, 5, 6); scene.add(sun)
const fillL = new THREE.DirectionalLight('#c8d8ff', 0.35); fillL.position.set(-4, 2, -2); scene.add(fillL)
const cam = new THREE.PerspectiveCamera(32, W / H, 0.1, 80)
const lab = document.getElementById('lab')!
const cells: { cam: THREE.PerspectiveCamera; x: number; y: number; w: number; h: number }[] = []
const base: Partial<PartyState> = { phase: 'party', speed: 0, gait: 0.6, wave: 0, offer: 0, reach: 0, bite: 0, open: 0, claw: 0, down: 0, crawl: 0, burn: 0, armHp: [26, 26], armCut: [0, 0], hitT: 99, shareT: 99 }
let worst = { meshes: 0, draws: 0, tris: 0 }
function place(seed: number, st: Partial<PartyState>, x: number, z: number, rotY: number, t = 1.7) {
  const g = buildPartygoerMesh(seed)
  g.position.set(x, 0, z); g.rotation.y = rotY; scene.add(g)
  const look = partygoerLook(seed)
  const e: any = { id: seed, def: { hp: 130 }, hp: 130, pg: { ...base, intern: look.intern, balloon: look.intern && (st.armHp?.[look.balloonArm] ?? 26) > 0, balloonArm: look.balloonArm, balloonFly: (st.armHp?.[look.balloonArm] ?? 26) > 0 ? 0 : 20, ...st } }
  animatePartygoer(g, e, t, 0, 0)
  const b = partygoerBudget(g); if (b.draws > worst.draws || b.tris > worst.tris) worst = b
  if (cpuSkin && !PARTYGOER_CPU_SKIN) bakeSkin(g) // 模型自身已在 ?cpu=1 下走 CPU 蒙皮替身，这里只作兜底
  return g
}
const smoke = (x: number, z: number) => { // 火烧格的黑烟示意（游戏里是粒子）
  const m = new THREE.MeshBasicMaterial({ color: '#141210', transparent: true, opacity: 0.45, depthWrite: false })
  for (let i = 0; i < 16; i++) { const s = new THREE.Mesh(new THREE.SphereGeometry(0.16 + i * 0.03, 8, 6), m); s.position.set(x + Math.sin(i * 1.7) * 0.25, 0.3 + i * 0.13, z + Math.cos(i * 2.3) * 0.2); scene.add(s) }
  const f = new THREE.PointLight('#ff7a2a', 3, 4); f.position.set(x, 0.4, z + 0.3); scene.add(f)
}
// 模型正面 = +X；rotY = -π/2 让正面朝向 +Z（相机）
const FACE_CAM = -Math.PI / 2
if (mode === 'front') {
  cam.position.set(0, 1.25, 5.6); cam.lookAt(0, 1.1, 0)
  place(3, { phase: 'party' }, 0, 0, FACE_CAM)
} else if (mode === 'side') {
  cam.position.set(5.6, 1.25, 0.6); cam.lookAt(0, 1.1, 0)
  place(3, { phase: 'party' }, 0, 0, FACE_CAM)
} else if (mode === 'back') {
  cam.position.set(0.4, 1.4, -5); cam.lookAt(0, 1.1, 0)
  place(3, { phase: 'party' }, 0, 0, FACE_CAM)
} else if (mode === 'close') {
  cam.position.set(0.15, 1.95, 1.35); cam.lookAt(0, 1.85, 0)
  place(3, { phase: 'party' }, 0, 0, FACE_CAM)
} else if (mode === 'chest') { // 狂战士开胸近景
  cam.position.set(0.5, 1.55, 2.6); cam.lookAt(0, 1.35, 0)
  place(3, { phase: 'hunt', open: 1, armHp: [0, 0], armCut: [1, 1] }, 0, 0, FACE_CAM)
} else if (mode === 'colors') {
  // 五种颜色变体（金黄为主）+ 实习生红气球
  const pick = (want: string, intern: boolean) => { for (let id = 1; id < 4000; id++) { const l = partygoerLook(id); if (l.color === want && l.intern === intern) return id } return 1 }
  const items: [number, string][] = [[pick('yellow', true), '金黄 · 实习生（红气球）'], [pick('yellow', false), '金黄（最常见）'], [pick('red', false), '红'], [pick('blue', true), '蓝 · 实习生'], [pick('green', false), '绿'], [pick('white', false), '白']]
  const cols = 3, rowsN = 2, cw = W / cols, ch = H / rowsN
  items.forEach(([id, name], i) => {
    const x = i * 30
    place(id, { phase: 'party', wave: i === 3 ? 1 : 0 }, x, 0, FACE_CAM + 0.35)
    const cc = new THREE.PerspectiveCamera(34, cw / ch, 0.1, 40); cc.position.set(x + 0.4, 1.4, 5.4); cc.lookAt(x, 1.35, 0)
    const col = i % cols, row = Math.floor(i / cols)
    cells.push({ cam: cc, x: col * cw, y: (rowsN - 1 - row) * ch, w: cw, h: ch })
    lab.insertAdjacentHTML('beforeend', `<div class="l" style="left:${col * cw + cw / 2}px;top:${row * ch + ch - 34}px">${name}</div>`)
  })
} else {
  // poses：8 个姿态，4×2 分镜，各自的相机，彼此相距 30m
  const dummy = (x: number, z: number) => { const m = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 1.1, 4, 10), new THREE.MeshLambertMaterial({ color: '#4a6378' })); m.position.set(x, 0.78, z); scene.add(m) }
  const pickSeed = (want: string, intern: boolean, skip = 0) => { let k = 0; for (let id = 1; id < 4000; id++) { const l = partygoerLook(id); if (l.color === want && l.intern === intern && k++ >= skip) return id } return 1 }
  const items: [Partial<PartyState>, string, number][] = [
    [{ phase: 'party', speed: 1.0, gait: 1.1 }, '游荡', 0],
    [{ phase: 'party', offer: 1, speed: 0.6, gait: 0.4 }, '假装友善：递蛋糕', 0],
    [{ phase: 'bite', reach: 1, bite: 1 }, '面条臂抓咬', 1],
    [{ phase: 'hunt', open: 1, armHp: [0, 0], armCut: [1, 1], speed: 3.5, gait: 2.0 }, '狂战士：胸甲弹开', 0],
    [{ phase: 'claw', open: 1, claw: 0.12, armHp: [0, 0], armCut: [1, 1] }, '蜈蚣爪抓挠', 1],
    [{ phase: 'down', open: 1, down: 1, armHp: [0, 0], armCut: [1, 1] }, '倒地静止', 2],
    [{ phase: 'crawl', open: 1, down: 1, crawl: 1, armHp: [0, 0], armCut: [1, 1], speed: 0.4 }, '面朝下爬走', 2],
    [{ phase: 'burn', open: 1, down: 1, burn: 0.55, armHp: [0, 0], armCut: [1, 1] }, '火烧（火盐 / 火油桶）', 3],
  ]
  const cols = 4, rowsN = 2, cw = W / cols, ch = H / rowsN
  items.forEach(([st, name, kind], i) => {
    const x = i * 30
    const rot = kind === 1 ? -0.55 : kind === 2 ? FACE_CAM + 1.25 : FACE_CAM + 0.5
    place(i === 1 || i === 2 ? pickSeed('yellow', true, i) : pickSeed('yellow', false, i), st, x, 0, rot, 1.7 + i * 0.3)
    if (kind === 1) dummy(x + 1.55 * Math.cos(0.55), 1.55 * Math.sin(0.55))
    if (kind === 3) smoke(x + 0.3, 0)
    const cc = new THREE.PerspectiveCamera(36, cw / ch, 0.1, 40)
    if (kind === 2 || kind === 3) { cc.position.set(x + 0.6, 2.4, 4.4); cc.lookAt(x + 0.2, 0.25, 0) }
    else if (kind === 1) { cc.position.set(x + 0.9, 1.55, 5.2); cc.lookAt(x + 0.7, 1.2, 0) }
    else { cc.position.set(x + 0.35, 1.45, 5.6); cc.lookAt(x, 1.2, 0) }
    const col = i % cols, row = Math.floor(i / cols)
    cells.push({ cam: cc, x: col * cw, y: (rowsN - 1 - row) * ch, w: cw, h: ch })
    lab.insertAdjacentHTML('beforeend', `<div class="l" style="left:${col * cw + cw / 2}px;top:${row * ch + ch - 34}px">${name}</div>`)
  })
}
lab.insertAdjacentHTML('beforeend', `<div class="l" style="left:${W - 150}px;top:8px"><span class="s">单只最多 ${worst.meshes} 个网格 / ${worst.draws} 次绘制 / ${worst.tris} 三角面</span></div>`)
cam.updateMatrixWorld()
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
