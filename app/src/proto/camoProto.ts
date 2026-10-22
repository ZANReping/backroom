// 原型预览页：迷彩爬行者重制（?mode=lineup | side | head | camo | lift），可加 &cam=x,y,z&look=x,y,z
import * as THREE from 'three'
import { buildCamoCrawlerMesh, poseCamoCrawler, buildCamoBoulder, setCamo } from '../game/renderer/camoCrawlerMesh'
const q = new URLSearchParams(location.search)
const mode = q.get('mode') ?? 'lineup'
const W = innerWidth, H = innerHeight
const renderer = new THREE.WebGLRenderer({ antialias: true }); renderer.setSize(W, H); renderer.outputColorSpace = THREE.SRGBColorSpace
document.body.appendChild(renderer.domElement)
// L8 洞穴：冷灰岩地与岩壁、偏暗的冷光（预览时适当提亮以看清造型）
const scene = new THREE.Scene(); scene.background = new THREE.Color('#1d1c1a'); scene.fog = new THREE.Fog(scene.background as THREE.Color, 9, 26)
const rockMat = () => new THREE.MeshLambertMaterial({ color: "#8c8478" })
const fl = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), rockMat()); fl.rotation.x = -Math.PI / 2; scene.add(fl)
scene.add(new THREE.HemisphereLight('#e6e4dc', '#2a2620', 1.0)); const sun = new THREE.DirectionalLight('#f4efe2', 1.3); sun.position.set(2.5, 5, 4); scene.add(sun)
const cam = new THREE.PerspectiveCamera(34, W / H, 0.05, 60)
const lab = document.getElementById('lab')!
const label = (x: number, html: string, y = -0.12) => { const p = new THREE.Vector3(x, y, 0.6).project(cam); lab.insertAdjacentHTML('beforeend', `<div class="l" style="left:${(p.x * 0.5 + 0.5) * W}px;top:${(0.5 - p.y * 0.5) * H}px">${html}</div>`) }
const count = (g: THREE.Object3D) => { let c = 0, t = 0; g.traverse((m: any) => { if (m.isMesh) { c++; t += (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3 } }); return { meshes: c, tris: Math.round(t) } }
const put = <T extends THREE.Object3D>(g: T, x: number, z: number, ry: number): T => { g.position.set(x, 0, z); g.rotation.y = ry; scene.add(g); return g }
const vec = (s: string | null) => s ? new THREE.Vector3(...s.split(',').map(Number) as [number, number, number]) : null
// 岩壁：带凹凸的平面，贴伪装用的同一种岩石（取模型内部的岩面贴图，保证伪装对得上）
function rockWall(x: number, z: number, w: number, h: number, ry = 0) {
  const g = new THREE.PlaneGeometry(w, h, 60, 40), pa = g.attributes.position as THREE.BufferAttribute
  for (let i = 0; i < pa.count; i++) { const px = pa.getX(i), py = pa.getY(i); pa.setZ(i, 0.06 * Math.sin(px * 3.1 + py * 1.7) * Math.sin(py * 2.3) + 0.03 * Math.sin(px * 9 + py * 7)) }
  g.computeVertexNormals()
  const probe = buildCamoCrawlerMesh(0); const tex = (probe.userData.camoRig.camo.uRock.value as THREE.Texture).clone(); tex.needsUpdate = true; tex.repeat.set(w * 1.1, h * 1.1)
  const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ color: '#ffffff', map: tex })); m.position.set(x, h / 2, z); m.rotation.y = ry; scene.add(m); return m
}
let info: any = {}
if (mode === 'lineup') {
  cam.position.set(0, 1.55, 9.2); cam.lookAt(0, 0.85, 0)
  const items: [string, (g: THREE.Group) => void, number][] = [
    ['伏行站姿', (g) => poseCamoCrawler(g, {}), 0],
    ['长毛个体', (g) => poseCamoCrawler(g, { headPitch: 0.15 }), 1],
    ['六肢低伏爬行', (g) => poseCamoCrawler(g, { crawl: 1 }), 2],
    ['四臂举石', (g) => poseCamoCrawler(g, { lift: 1, mand: 0.6, boulder: buildCamoBoulder(1) }), 4],
    ['张颚歪头听声', (g) => poseCamoCrawler(g, { mand: 1, headYaw: 0.5, headPitch: 0.2 }), 6],
  ]
  items.forEach(([name, f, seed], i) => { const x = (i - 2) * 1.95; const g = put(buildCamoCrawlerMesh(seed), x - 0.15, 0, -0.6); f(g); label(x, name); info[name] = count(g) })
  const one = buildCamoCrawlerMesh(0); const c = count(one)
  lab.insertAdjacentHTML('beforeend', `<div class="l" style="left:${W / 2}px;top:14px"><span class="s">单只 ${c.meshes} 个网格 · ${c.tris} 个三角形</span></div>`)
} else if (mode === 'side') {
  cam.position.set(0.1, 1.1, 4.2); cam.lookAt(0.1, 0.92, 0)
  poseCamoCrawler(put(buildCamoCrawlerMesh(0), 0, 0, 0))
} else if (mode === 'front') {
  cam.position.set(3.6, 1.3, 1.1); cam.lookAt(0, 0.95, 0)
  poseCamoCrawler(put(buildCamoCrawlerMesh(1), 0, 0, 0))
} else if (mode === 'head') {
  cam.position.set(1.15, 1.6, 0.42); cam.lookAt(0.42, 1.48, 0)
  poseCamoCrawler(put(buildCamoCrawlerMesh(0), 0, 0, 0), { mand: Number(q.get('mand') ?? 0.7) })
} else if (mode === 'lift') {
  cam.position.set(3.6, 1.7, 3.6); cam.lookAt(0, 1.3, 0)
  const b = buildCamoBoulder(2)
  poseCamoCrawler(put(buildCamoCrawlerMesh(0), 0, 0, 0), { lift: 1, mand: 0.5, boulder: b })
} else if (mode === 'camo') {
  // 同一面岩壁前三只：伪装 0 / 0.6 / 0.95；背贴岩壁、四臂张开
  rockWall(0, -0.42, 9, 3.4)
  cam.position.set(0, 1.25, 6.4); cam.lookAt(0, 1.05, 0)
  ;[0, 0.6, 0.95].forEach((k, i) => {
    const x = (i - 1) * 2.4
    const g = put(buildCamoCrawlerMesh(i), x, -0.22, -Math.PI / 2 + 0.0)
    g.rotation.y = -Math.PI / 2 // 面朝 +Z（朝镜头），背贴岩壁
    poseCamoCrawler(g, { cling: 1, headPitch: -0.1 }); setCamo(g, k)
    label(x, `伪装 ${Math.round(k * 100)}%`, 2.95)
  })
}
const c = vec(q.get('cam')), l = vec(q.get('look')); if (c) cam.position.copy(c); if (l) cam.lookAt(l)
cam.updateMatrixWorld(); renderer.render(scene, cam); (window as any).__info = info; (window as any).__ready = true
