// 原型预览页：近战武器重制——第 1 阶段静态建模。
// ?mode=lineup（五把完好 + 标尺）| broken（完好 vs 残件）| wear（干净 / 磨损 / 血污三档）| ground（地面掉落版）
//      | close&w=knife|crowbar|wrench|timber|axe（打击端特写）
// &real=1 真实材质；&cam=x,y,z&look=x,y,z 自定义镜头
import * as THREE from 'three'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { buildMeleeMesh, buildMeleeGroundMesh, setMeleeWear, meleeBudget, MELEE_TYPES, MELEE_DIM, type MeleeType, type MeleeRig } from '../game/renderer/meleeMesh'
import { setMaterialMode } from '../game/renderer/shared'

const Q = new URLSearchParams(location.search)
const mode = Q.get('mode') ?? 'lineup'
const real = Q.get('real') === '1'
if (real) setMaterialMode('realistic')
const W = innerWidth, H = innerHeight
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true }); renderer.setSize(W, H); renderer.outputColorSpace = THREE.SRGBColorSpace
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap
if (real) { renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05 }
document.body.appendChild(renderer.domElement)
const scene = new THREE.Scene()
scene.background = new THREE.Color('#1d1c1a')
if (real) { const pm = new THREE.PMREMGenerator(renderer); scene.environment = pm.fromScene(new RoomEnvironment(), .04).texture }
scene.add(new THREE.HemisphereLight('#fff4e0', '#3a3428', real ? .35 : 1.1))
const key = new THREE.DirectionalLight('#fff1dc', real ? 2.4 : 2.0); key.position.set(3, 4, 2.5); key.castShadow = true
key.shadow.mapSize.set(2048, 2048); key.shadow.camera.left = key.shadow.camera.bottom = -1.5; key.shadow.camera.right = key.shadow.camera.top = 1.5; key.shadow.bias = -.0004
scene.add(key)
const rim = new THREE.DirectionalLight('#a8c4ff', real ? 1.2 : .8); rim.position.set(-3, 2, -3); scene.add(rim)
const lab = document.getElementById('lab')!
const label = (x: number, y: number, txt: string) => lab.insertAdjacentHTML('beforeend', `<div class="l" style="left:${x}px;top:${y}px">${txt}</div>`)
const cam = new THREE.PerspectiveCamera(30, W / H, .01, 50)
const pending3: (() => void)[] = []
const label3 = (p: THREE.Vector3, txt: string, dy = 0) => pending3.push(() => { cam.updateMatrixWorld(true); const v = p.clone().project(cam); label((v.x * .5 + .5) * W, (-v.y * .5 + .5) * H + dy, txt) })
const V3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z)
const NAME: Record<MeleeType, string> = { knife: '刀', crowbar: '撬棍', wrench: '管钳', timber: '木板', axe: '斧头' }
const budget: Record<string, { tris: number; meshes: number }> = {}

// 混凝土地台
const floorTex = (() => { const cv = document.createElement('canvas'); cv.width = cv.height = 512; const g = cv.getContext('2d')!; g.fillStyle = '#5b574f'; g.fillRect(0, 0, 512, 512); for (let i = 0; i < 20000; i++) { const v = Math.random(); g.fillStyle = `rgba(${v > .5 ? 255 : 0},${v > .5 ? 250 : 0},${v > .5 ? 240 : 0},${.03 + Math.random() * .06})`; g.fillRect(Math.random() * 512, Math.random() * 512, 1 + Math.random() * 2, 1 + Math.random() * 2) } const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(4, 4); t.colorSpace = THREE.SRGBColorSpace; return t })()
const floor = new THREE.Mesh(new THREE.PlaneGeometry(8, 8), new THREE.MeshStandardMaterial({ map: floorTex, roughness: .95 }))
floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor)
// 后墙（L0 黄墙纸色，给武器一个后室的底）
const wall = new THREE.Mesh(new THREE.PlaneGeometry(8, 3), new THREE.MeshStandardMaterial({ color: '#8f8255', roughness: 1 }))
wall.position.set(-1.2, 1.5, 0); wall.rotation.y = Math.PI / 2; wall.receiveShadow = true; scene.add(wall)

function ruler(z: number, top: number) {
  const g = new THREE.Group(), my = new THREE.MeshBasicMaterial({ color: '#e0c060' }), mw = new THREE.MeshBasicMaterial({ color: '#f0ece0' })
  const bar = new THREE.Mesh(new THREE.BoxGeometry(.006, top, .006), my); bar.position.y = top / 2; g.add(bar)
  for (let k = 0; k * .05 <= top + 1e-6; k++) { const major = k % 2 === 0; const t = new THREE.Mesh(new THREE.BoxGeometry(.004, .004, major ? .04 : .02), major ? my : mw); t.position.set(0, k * .05, major ? -.02 : -.01); g.add(t) }
  g.position.set(0, 0, z); scene.add(g)
  for (let k = 0; k <= top * 10 + 1e-6; k++) label3(V3(0, k * .1, z + .03), `<span class="s">${k * 10}cm</span>`, -8)
}
/** 竖立陈列：握点放在 y=base，侧面朝镜头（镜头在 +X） */
function stand(t: MeleeType, z: number, o: { state?: 'intact' | 'broken'; blood?: number; worn?: number; yaw?: number; tag?: string } = {}) {
  const g = buildMeleeMesh(t, { state: o.state })
  setMeleeWear(g, { blood: o.blood ?? 0, worn: o.worn ?? (o.state === 'broken' ? 1 : 0) })
  const rig = g.userData.meleeRig as MeleeRig
  const box = new THREE.Box3().setFromObject(g)
  g.position.set(0, -box.min.y + .004, z); g.rotation.y = o.yaw ?? 0
  scene.add(g)
  budget[o.tag ?? `${NAME[t]}${o.state === 'broken' ? '（残件）' : ''}`] = meleeBudget(g)
  return { g, rig, top: box.max.y - box.min.y }
}

if (mode === 'lineup') {
  const zs = [.62, .3, 0, -.34, -.7]
  const order: MeleeType[] = ['knife', 'wrench', 'crowbar', 'timber', 'axe']
  order.forEach((t, i) => { const s = stand(t, zs[i], { yaw: .35 }); label3(V3(0, s.top + .05, zs[i]), `${NAME[t]}<br><span class="s">${MELEE_DIM[t].note}</span>`, -40) })
  ruler(.92, .9)
  cam.position.set(2.75, .55, -.03); cam.lookAt(0, .42, -.03)
} else if (mode === 'broken') {
  const order: MeleeType[] = ['knife', 'wrench', 'crowbar', 'timber', 'axe']
  const z0 = .95
  order.forEach((t, i) => {
    const z = z0 - i * .44
    const a = stand(t, z, { yaw: .35 }), b = stand(t, z - .17, { state: 'broken', yaw: .35 })
    label3(V3(0, Math.max(a.top, b.top) + .05, z - .085), `${NAME[t]}<br><span class="s">完好 ｜ 残件</span>`, -40)
  })
  cam.position.set(3.1, .6, .08); cam.lookAt(0, .4, .08)
} else if (mode === 'wear') {
  const order: MeleeType[] = ['knife', 'wrench', 'crowbar', 'timber', 'axe']
  order.forEach((t, i) => {
    const z = 1.05 - i * .5
    ;[{ b: 0, w: 0, s: '干净' }, { b: 0, w: 1, s: '磨损' }, { b: .8, w: .4, s: '血污' }].forEach((v, k) => {
      const s = stand(t, z - k * .14, { blood: v.b, worn: v.w, yaw: .45, tag: `${NAME[t]}-${v.s}` })
      label3(V3(0, s.top + .02, z - k * .14), `<span class="s">${v.s}</span>`, -18)
    })
    label3(V3(0, 0, z - .14), NAME[t], 14)
  })
  cam.position.set(3.4, .55, .02); cam.lookAt(0, .36, .02)
} else if (mode === 'ground') {
  const spots: [MeleeType, number, number, number][] = [['axe', .25, .45, .3], ['crowbar', -.2, .3, -.5], ['timber', .1, -.25, .15], ['wrench', -.35, -.1, 1.1], ['knife', -.3, -.45, -.9]]
  for (const [t, x, z, ry] of spots) { const g = buildMeleeGroundMesh(t); g.position.set(x, 0, z); g.rotation.y = ry; scene.add(g); budget[NAME[t] + '（地面）'] = meleeBudget(g); label3(V3(x, .06, z), `<span class="s">${NAME[t]}</span>`, -18) }
  cam.position.set(1.55, 1.25, .02); cam.lookAt(-.05, 0, .02)
} else if (mode === 'close') {
  const t = (Q.get('w') ?? 'axe') as MeleeType
  const s = stand(t, 0, { yaw: .55, blood: Number(Q.get('blood') ?? 0), worn: Number(Q.get('worn') ?? 0), state: Q.get('state') === 'broken' ? 'broken' : 'intact' })
  // 取打击端那一段（长武器取上 45%，短武器取全长）的包围盒，按视场把它装满画面
  const box = new THREE.Box3().setFromObject(s.g)
  const frac = t === 'knife' || t === 'wrench' ? 1 : t === 'crowbar' ? .42 : .38
  box.min.y = box.max.y - (box.max.y - box.min.y) * frac
  const ctr = box.getCenter(new THREE.Vector3()), sz = box.getSize(new THREE.Vector3())
  const span = Math.max(sz.y, sz.z * W / H) * 1.25
  const dist = span / 2 / Math.tan(cam.fov * Math.PI / 360)
  cam.position.set(ctr.x + dist * .8, ctr.y + dist * .22, ctr.z - dist * .56); cam.lookAt(ctr)
  label(W / 2, 20, `${NAME[t]}<br><span class="s">${MELEE_DIM[t].note}</span>`)
}
const cq = Q.get('cam'), lq = Q.get('look')
if (cq && lq) { const c = cq.split(',').map(Number), l = lq.split(',').map(Number); cam.position.set(c[0], c[1], c[2]); cam.lookAt(l[0], l[1], l[2]) }

renderer.render(scene, cam)
requestAnimationFrame(() => {
  renderer.render(scene, cam)
  for (const f of pending3) f()
  const w = window as unknown as Record<string, unknown>
  w.__budget = budget; w.__info = { mode, real, types: MELEE_TYPES.length }; w.__ready = true
})
