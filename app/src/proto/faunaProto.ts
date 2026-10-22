// 原型预览页：受眷鸟 + 微光向导重制（?mode=bird | birdclose | birdmale | birditems | flock | guide | guidesize | guidecave）
// 第 2 阶段动画采样：?anim=<片段>&ent=bird|guide&t=<秒>（单帧）或 &frames=N（网格 + window.__frames，拼 GIF 用），见 faunaAnimProto.ts
import * as THREE from 'three'
import { buildCurabiturMesh, poseCurabitur, buildCurabiturGelJar, gelCoat, buildCurabiturSpore, buildSporeRotPuddle } from '../game/renderer/curabiturMesh'
import { buildLightguideMesh, LIGHTGUIDE_COLORS, type LightguideMood } from '../game/renderer/lightguideMesh'
if (new URLSearchParams(location.search).has('anim')) void import('./faunaAnimProto')
else staticModes()

/** 第 1 阶段的静态视图（保持不变） */
function staticModes() {
  const q = new URLSearchParams(location.search)
  const mode = q.get('mode') ?? 'bird'
  const W = innerWidth, H = innerHeight
  const renderer = new THREE.WebGLRenderer({ antialias: true }); renderer.setSize(W, H); renderer.outputColorSpace = THREE.SRGBColorSpace
  document.body.appendChild(renderer.domElement)
  const dark = mode.startsWith('guide') || mode === 'flock'
  const scene = new THREE.Scene(); scene.background = new THREE.Color(dark ? '#07090f' : '#141a26')
  const fl = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.MeshLambertMaterial({ color: '#5a5650' })); fl.rotation.x = -Math.PI / 2; scene.add(fl)
  scene.add(new THREE.HemisphereLight('#c8d0e8', '#1a1814', dark ? 0.08 : 0.9)); const sun = new THREE.DirectionalLight('#dfe6ff', dark ? 0.0 : 0.9); sun.position.set(2, 4, 3); scene.add(sun)
  const cam = new THREE.PerspectiveCamera(34, W / H, 0.02, 60)
  const lab = document.getElementById('lab')!
  const label = (p3: THREE.Vector3, html: string) => { const p = p3.clone().project(cam); lab.insertAdjacentHTML('beforeend', `<div class="l" style="left:${(p.x * 0.5 + 0.5) * W}px;top:${(0.5 - p.y * 0.5) * H}px">${html}</div>`) }
  const count = (g: THREE.Object3D) => { let c = 0, t = 0; g.traverse((m: any) => { if (m.isMesh) { c++; t += (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3 } }); return { meshes: c, tris: Math.round(t) } }
  const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z)
  const vec = (s: string | null) => s ? new THREE.Vector3(...s.split(',').map(Number) as [number, number, number]) : null
  const wall = (z: number, w = 12, h = 4, col = '#6a6458') => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshLambertMaterial({ color: col })); m.position.set(0, h / 2, z); scene.add(m) }
  const info: any = {}
  if (mode === 'bird') {
    wall(-1.2)
    cam.position.set(0, 1.25, 4.6); cam.lookAt(0, 1.0, 0)
    const items: [string, () => THREE.Group][] = [
      ['雌性（约 0.8m）', () => { const g = buildCurabiturMesh('female', 0, { lights: true }); poseCurabitur(g, {}); return g }],
      ['雄性（较小、带孢子囊）', () => { const g = buildCurabiturMesh('male', 0, { lights: true }); poseCurabitur(g, {}); return g }],
      ['舌光诱捕', () => { const g = buildCurabiturMesh('female', 1, { lights: true }); poseCurabitur(g, { beak: 0.7, tongue: 2 }); return g }],
      ['爪刺扑击', () => { const g = buildCurabiturMesh('female', 2, { lights: true }); poseCurabitur(g, { beak: 1, tongue: 0.3, strike: 1 }); return g }],
    ]
    items.forEach(([name, f], i) => { const x = (i - 1.5) * 1.05; const g = f(); g.position.set(x, 1.05, 0); g.rotation.y = -0.5; scene.add(g); label(V(x, 0.42, 0), name); info[name] = count(g) })
  } else if (mode === 'birdclose') {
    wall(-1.2)
    cam.position.set(0.85, 0.95, 0.55); cam.lookAt(0.05, 1.08, 0)
    const g = buildCurabiturMesh('female', 0, { lights: true }); poseCurabitur(g, { beak: 0.35 }); g.position.set(0, 1.05, 0); scene.add(g)
  } else if (mode === 'birdmale') {
    wall(-1.2)
    cam.position.set(0.25, 1.1, 1.35); cam.lookAt(0, 1.08, 0)
    const g = buildCurabiturMesh('male', 3, { lights: true }); poseCurabitur(g, {}); g.position.set(0, 1.05, 0); scene.add(g)
  } else if (mode === 'birditems') {
    cam.position.set(0, 0.55, 1.5); cam.lookAt(0, 0.08, 0)
    const jar = buildCurabiturGelJar(0.8); jar.position.set(-0.45, 0, 0); scene.add(jar); label(V(-0.45, -0.06, 0), '受眷胶')
    const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.014, 0.4, 8), new THREE.MeshLambertMaterial({ color: '#6a4a2c' })); stick.rotation.z = 1.2; stick.position.set(-0.12, 0.05, 0); stick.add(gelCoat(stick, 1)); scene.add(stick); label(V(-0.12, -0.06, 0), '涂胶木棍（12 小时）')
    const L = new THREE.PointLight('#b8ff60', 0.5, 1.5, 1.6); L.position.set(-0.12, 0.08, 0); scene.add(L)
    for (let i = 0; i < 6; i++) { const s = buildCurabiturSpore(i / 6); s.position.set(0.15 + (i % 3) * 0.06, 0.03 + Math.floor(i / 3) * 0.06, 0.05); scene.add(s) }
    label(V(0.21, -0.06, 0), '发光孢子（新鲜→将腐）')
    const p = buildSporeRotPuddle(1, 0.14); p.position.set(0.5, 0, 0); scene.add(p); label(V(0.5, -0.06, 0), '孢子腐液（驱蛾）')
  } else if (mode === 'flock') {
    // 星群：洞顶下方十几只、舌光连成一片
    cam.position.set(0, 1.4, 6.5); cam.lookAt(0, 2.4, 0)
    const R = (() => { let s = 7; return () => (s = (s * 16807) % 2147483647) / 2147483647 })()
    for (let i = 0; i < 16; i++) { const g = buildCurabiturMesh(R() < 0.5 ? 'female' : 'male', i, { lights: i % 4 === 0 }); poseCurabitur(g, { tongue: 1.4 + R() * 0.6, beak: 0.4 }); g.position.set((R() - 0.5) * 7, 2.2 + R() * 1.6, -R() * 4); g.rotation.y = R() * 6; scene.add(g) }
    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), new THREE.MeshLambertMaterial({ color: '#4a4640' })); ceil.rotation.x = Math.PI / 2; ceil.position.y = 4.2; scene.add(ceil)
  } else if (mode === 'guide') {
    wall(-1.0, 12, 4, '#4e4a44')
    cam.position.set(0, 1.2, 3.8); cam.lookAt(0, 1.1, 0)
    const moods: LightguideMood[] = ['idle', 'guide', 'warn', 'nest']
    moods.forEach((m, i) => { const x = (i - 1.5) * 1.1; const g = buildLightguideMesh(0.1, m, { lights: true }); g.position.set(x, 1.15, 0); scene.add(g); label(V(x, 0.62, 0), LIGHTGUIDE_COLORS[m].label); info[m] = count(g) })
  } else if (mode === 'guidesize') {
    // 附图对照：深蓝背景里一大一小两颗；下方 5 / 10 / 15cm 三档
    scene.background = new THREE.Color('#3c4a68'); fl.visible = false
    cam.position.set(0, 0, 1.6); cam.lookAt(0, 0, 0)
    ;[[0.05, -0.36], [0.1, 0], [0.15, 0.38]].forEach(([s, x]) => { const g = buildLightguideMesh(s, s === 0.05 ? 'warn' : 'guide'); g.position.set(x, 0.02, 0); scene.add(g); label(V(x, -0.17, 0), `${Math.round(s * 100)} cm`) })
  } else if (mode === 'guidecave') {
    // 洞穴通道里：三只向导带路，照亮岩壁（协同时亮度叠加）
    for (const z of [-1.1]) wall(z, 14, 4, '#6a645a')
    const side = new THREE.Mesh(new THREE.PlaneGeometry(14, 4), new THREE.MeshLambertMaterial({ color: '#6a645a' })); side.rotation.y = Math.PI / 2; side.position.set(-2.2, 2, 0); scene.add(side)
    cam.position.set(1.4, 1.3, 3.4); cam.lookAt(-0.4, 1.0, -0.4)
    ;[[-0.2, 1.2, 0.1], [-0.9, 1.0, -0.3], [-1.5, 1.35, -0.6]].forEach(([x, y, z], i) => { const g = buildLightguideMesh(0.08 + i * 0.02, 'guide', { lights: true }); g.position.set(x, y, z); scene.add(g) })
  }
  const c = vec(q.get('cam')), l = vec(q.get('look')); if (c) cam.position.copy(c); if (l) cam.lookAt(l)
  cam.updateMatrixWorld(); renderer.render(scene, cam); (window as any).__info = info; (window as any).__ready = true
}
