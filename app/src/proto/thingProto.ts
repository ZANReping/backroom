// 原型预览页：七层之物（Entity 20）重制模型（?mode=lineup | head | mouth | under | detail），可加 &cam=x,y,z&look=x,y,z
import * as THREE from 'three'
import { buildTarWriting } from '../game/renderer/tarWriting'
import { buildThingMesh, poseThing, THING, updateThingLod, thingVisibleTris, type ThingPose } from '../game/renderer/thingMesh'
const S = THING.S

const q = new URLSearchParams(location.search)
const mode = q.get('mode') ?? 'lineup'
const W = innerWidth, H = innerHeight
const renderer = new THREE.WebGLRenderer({ antialias: true }); renderer.setSize(W, H); renderer.outputColorSpace = THREE.SRGBColorSpace
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.15
document.body.appendChild(renderer.domElement)
const scene = new THREE.Scene()
const cam = new THREE.PerspectiveCamera(36, W / H, 0.05, 2000)
const lab = document.getElementById('lab')!
const label = (p3: THREE.Vector3, html: string) => { const p = p3.clone().project(cam); lab.insertAdjacentHTML('beforeend', `<div class="l" style="left:${(p.x * 0.5 + 0.5) * W}px;top:${(0.5 - p.y * 0.5) * H}px">${html}</div>`) }
const count = (g: THREE.Object3D) => { let c = 0, t = 0; g.traverse((m: any) => { if (m.isMesh) { c++; t += (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3 } }); return { meshes: c, tris: Math.round(t) } }
const vec = (s: string | null) => s ? new THREE.Vector3(...s.split(',').map(Number) as [number, number, number]) : null
const info: any = {}
// 深海：冷暗的水色 + 指数雾；一盏顶光模拟残余的天光，一盏暖白聚光模拟潜水手电
const water = (fogD = 0.012) => {
  scene.background = new THREE.Color('#071521'); scene.fog = new THREE.FogExp2('#071521', fogD / S)
  scene.add(new THREE.HemisphereLight('#7fa3bd', '#0b1218', 0.75))
  const sun = new THREE.DirectionalLight('#cfe2f0', 0.9); sun.position.set(10, 30, 12); scene.add(sun)
}
const torch = (from: THREE.Vector3, to: THREE.Vector3, power = 900) => {
  const s = new THREE.SpotLight('#fff1d6', power * S * (mode === 'head' || mode === 'mouth' || mode === 'under' || mode === 'lineup' ? S : 0.45), 60 * S, 0.42, 0.55, 1.6); s.position.copy(from); s.target.position.copy(to); scene.add(s, s.target)
}
/** 把体节排成一条缓弯的曲线（静态预览用，阶段 2 换成拖链动画） */
const layout = (g: THREE.Group, bend = 0.06, rise = 0.015, glitchGap = 1) => {
  const parts = g.userData.parts as Record<string, THREE.Object3D>
  let x = -0.1 * S, z = 0, y = 0, ang = 0
  for (let i = 0; i < THING.segs; i++) {
    const seg = parts[`seg${i}`]
    seg.position.set(x, y, z); seg.rotation.y = -ang
    ang += bend * Math.sin(i * 0.33 + 0.4); y += rise * Math.sin(i * 0.5) * THING.spacing
    x -= Math.cos(ang) * THING.spacing; z -= Math.sin(ang) * THING.spacing
    const b = parts[`seg${i}b`]
    if (b) { b.position.set(-0.55 * glitchGap, 0.35 * glitchGap * Math.sin(i), 0.4 * glitchGap * Math.cos(i * 1.7)); b.rotation.set(0.08 * glitchGap, 0.12 * glitchGap, -0.05 * glitchGap) }
  }
}
const thing = (pose: ThingPose, bend?: number) => { const g = buildThingMesh(); poseThing(g, pose); layout(g, bend); scene.add(g); return g }
/** 一栋两层小楼（约 7m 高）作尺度参照 */
const house = (x: number, y: number, z: number) => {
  const m = new THREE.MeshStandardMaterial({ color: '#8a8478', roughness: 0.9 }), g = new THREE.Group()
  const box = new THREE.Mesh(new THREE.BoxGeometry(8, 5.2, 6.5), m); box.position.y = 2.6; g.add(box)
  const roof = new THREE.Mesh(new THREE.ConeGeometry(5.6, 2.4, 4), m); roof.rotation.y = Math.PI / 4; roof.scale.z = 0.8; roof.position.y = 6.4; g.add(roof)
  g.position.set(x, y, z); scene.add(g); return g
}
// 人形标尺（1.75m）
const person = (x: number, y: number, z: number) => {
  const m = new THREE.MeshStandardMaterial({ color: '#d9d2c0', roughness: 0.8 })
  const g = new THREE.Group()
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 1.1, 4, 8), m); body.position.y = 0.75; g.add(body)
  const hd = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 8), m); hd.position.y = 1.58; g.add(hd)
  g.position.set(x, y, z); scene.add(g); return g
}
if (mode === 'lineup') {
  water(0.006)
  scene.add(new THREE.HemisphereLight('#9ec2da', '#1a242c', 1.1))
  const g = thing({ gape: 0.25, lure: 0.9 }, 0.09)
  g.rotation.y = 0.35
  person(9, -8, 20)
  house(2, -8, 22)
  const c0 = vec(q.get('cam')) ?? new THREE.Vector3(40, -4, 78), l0 = vec(q.get('look')) ?? new THREE.Vector3(-12, 2, 0)
  cam.fov = 44; cam.updateProjectionMatrix(); cam.position.copy(c0); cam.lookAt(l0); cam.updateMatrixWorld(true)
  info.count = count(g)
  label(new THREE.Vector3(9, -5.8, 20), '<span class="s">人 1.75 m</span>'); label(new THREE.Vector3(2, 0.6, 22), '<span class="s">两层小楼 7.6 m</span>')
  lab.insertAdjacentHTML('beforeend', `<div class="l" style="left:${W / 2}px;top:14px">七层之物 · 可见长度约 ${(THING.headLen + THING.segs * THING.spacing).toFixed(0)} m（末段没入雾中，不做尾）<br><span class="s">${info.count.meshes} 个网格 · ${info.count.tris} 个三角形 · 故障断节 ${THING.glitchSegs.length} 处 · 错位鳍 ${THING.fins.length} · 错位鳃 ${THING.gills.length}</span></div>`)
} else if (mode === 'head' || mode === 'mouth' || mode === 'under' || mode === 'eye' || mode === 'gill' || mode === 'teeth') {
  water(0.02)
  const g = thing({ gape: mode === 'mouth' ? 1 : mode === 'under' ? 0.35 : 0.12, lure: 1, gill: mode === 'mouth' ? 1 : 0.4 }, 0.03)
  const views: Record<string, [THREE.Vector3, THREE.Vector3]> = {
    head: [new THREE.Vector3(5.2, 0.8, 9.0), new THREE.Vector3(2.0, -0.4, 0)],
    mouth: [new THREE.Vector3(9.5, 0.2, 6.5), new THREE.Vector3(2.4, -1.3, 0)],
    under: [new THREE.Vector3(6.5, -4.2, 6.5), new THREE.Vector3(2.2, -1.6, 0)],
    eye: [new THREE.Vector3(4.6, 0.7, 2.6), new THREE.Vector3(3.6, 0.3, 0.6)],
    gill: [new THREE.Vector3(0.6, -0.4, 3.6), new THREE.Vector3(0.6, -1.0, 1.0)],
    teeth: [new THREE.Vector3(5.6, -0.4, 2.0), new THREE.Vector3(3.8, -0.6, 0.4)],
  }
  const [c0, l0] = views[mode].map((v) => v.multiplyScalar(S))
  cam.position.copy(vec(q.get('cam')) ?? c0); cam.lookAt(vec(q.get('look')) ?? l0)
  torch(cam.position.clone().add(new THREE.Vector3(0.5, 0.4, 0)), (vec(q.get('look')) ?? l0), 700)
  // 背后一道冷色轮廓光：深海里只有轮廓被勾出来
  const rim = new THREE.DirectionalLight('#6f9fbf', 1.4); rim.position.set(-8, 6, -10); scene.add(rim)
  if (mode === 'head') person(4.6 * S, -2.6 * S, 0.4 * S)
  info.count = count(g)
  const t = { head: '头部侧面（头长约 18m、高约 12m，左下是 1.75m 的人）', mouth: '巨口全张（下颌掀开约 62°）', under: '仰视：颏须与饵球（那点「肮脏黄光」）', eye: '眼部特写：骨质眼眶 · 照膜反光 · 眼后放射皱褶', gill: '鳃部特写：鳃盖缝沟 · 粉红鳃丝 · 侧线孔', teeth: '牙齿特写：玻璃獠牙 · 下颌骨杆 · 腹侧发光点' }[mode]
  lab.insertAdjacentHTML('beforeend', `<div class="l" style="left:${W / 2}px;top:14px">${t}</div>`)
} else if (mode === 'tar') {
  water(0.02)
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshStandardMaterial({ color: '#3a3a34', roughness: 0.95 }))
  floor.rotation.x = -Math.PI / 2; floor.position.y = -14; scene.add(floor)
  const words = ['还给我', '别动', 'STAY STILL']
  words.forEach((w, i) => { const t = buildTarWriting({ w: 4, h: 2, data: { text: w, fresh: i === 0 ? 1 : 0, rot: (i - 1) * 0.3 } }); t.position.set(22 + i * 9, -14, 14 + (i - 1) * 6); t.scale.setScalar(1.6); scene.add(t) })
  const g = thing({ gape: 0.08, lure: 0.5 }, 0.02); g.position.y = -2
  cam.position.set(50, 6, 34); cam.lookAt(18, -10, 6)
  torch(cam.position.clone(), new THREE.Vector3(28, -14, 14), 900)
  person(30, -14, 22)
  lab.insertAdjacentHTML('beforeend', `<div class="l" style="left:${W / 2}px;top:14px">它会写字：海床焦油上拖出来的字（「还给我」只在割过它的肉之后出现）</div>`)
} else if (mode === 'skin') {
  water(0.02)
  const g = thing({ gape: 0.1 }, 0.02)
  const parts = g.userData.parts as Record<string, THREE.Object3D>
  const p = new THREE.Vector3(); parts.seg2.getWorldPosition(p); p.x -= THING.spacing * 0.5; p.y += 1.0 * S
  cam.position.copy(p.clone().add(new THREE.Vector3(2, 1.6, 4.2).multiplyScalar(S * 0.5))); cam.lookAt(p.clone().add(new THREE.Vector3(0, 0, 1.2 * S)))
  torch(cam.position.clone().add(new THREE.Vector3(0, 1, 0)), p, 650)
  lab.insertAdjacentHTML('beforeend', `<div class="l" style="left:${W / 2}px;top:14px">躯干皮肤特写：覆瓦鳞板 · 掉鳞露出的皱皮 · 旧疤沟</div>`)
} else if (mode === 'detail') {
  water(0.02)
  const g = thing({ gape: 0.1 }, 0.02)
  // 镜头对准第一处故障断节
  const parts = g.userData.parts as Record<string, THREE.Object3D>
  const si = THING.glitchSegs[0]
  const p = new THREE.Vector3(); parts[`seg${si}`].getWorldPosition(p); p.x -= THING.spacing * 0.4
  cam.position.copy(vec(q.get('cam')) ?? p.clone().add(new THREE.Vector3(3.5, 2.6, 6.2).multiplyScalar(S))); cam.lookAt(vec(q.get('look')) ?? p)
  torch(cam.position.clone().add(new THREE.Vector3(0, 1, 0)), p, 650)
  lab.insertAdjacentHTML('beforeend', `<div class="l" style="left:${W / 2}px;top:14px">故障断节：断成两截仍跟着游，切面是凝血胶质与白色寄生虫</div>`)
}
// 分部位 LOD：按镜头距离挑精细 / 远景级（&lod=hi|lo 可强制）
scene.traverse((o) => { if (o.name === 'thething') { updateThingLod(o as THREE.Group, cam.position, 99, (q.get('lod') as any) ?? 'auto'); info.visibleTris = thingVisibleTris(o as THREE.Group) } })
renderer.render(scene, cam)
requestAnimationFrame(() => { renderer.render(scene, cam); (window as any).__ready = true; (window as any).__info = info })
