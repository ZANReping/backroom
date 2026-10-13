// 原型预览页：笑魇重制（?mode=lineup | grin | dark）
import * as THREE from 'three'
import { buildEntityMesh } from '../game/renderer/entitiesMesh'
import { animateSmiler } from '../game/renderer/smilerMesh'
import { SMILER_KINDS, type SmilerKind } from '../game/entities/smilers'

const mode = new URLSearchParams(location.search).get('mode') ?? 'lineup'
const W = innerWidth, H = innerHeight
const renderer = new THREE.WebGLRenderer({ antialias: true })
renderer.setSize(W, H); renderer.outputColorSpace = THREE.SRGBColorSpace
document.body.appendChild(renderer.domElement)
const scene = new THREE.Scene()
const dark = mode === 'dark'
scene.background = new THREE.Color(dark ? '#0a0905' : '#5e5530')
scene.fog = new THREE.Fog(scene.background as THREE.Color, 6, dark ? 16 : 30)
const floor = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.MeshLambertMaterial({ color: '#6e5f36' }))
floor.rotation.x = -Math.PI / 2; scene.add(floor)
const wall = new THREE.Mesh(new THREE.PlaneGeometry(40, 6), new THREE.MeshLambertMaterial({ color: '#b8aa62' }))
wall.position.set(0, 3, -2.2); scene.add(wall)
scene.add(new THREE.HemisphereLight('#fff2c0', '#3a321a', dark ? 0.12 : 1.0))
const sun = new THREE.DirectionalLight('#fff3c8', dark ? 0 : 1.2); sun.position.set(2, 5, 4); scene.add(sun)
const cam = new THREE.PerspectiveCamera(36, W / H, 0.1, 60)
if (dark) { const sp = new THREE.SpotLight('#fff1cc', 30, 14, 0.42, 0.6, 1.4); sp.position.set(-0.3, 1.5, 7); sp.target.position.set(0.4, 1.2, 0); scene.add(sp, sp.target) }
const lab = document.getElementById('lab')!
const label = (x: number, y: number, z: number, html: string, top?: number) => {
  const p = new THREE.Vector3(x, y, z).project(cam)
  lab.insertAdjacentHTML('beforeend', `<div class="l" style="left:${(p.x * 0.5 + 0.5) * W}px;top:${top ?? (-p.y * 0.5 + 0.5) * H}px">${html}</div>`)
}
const fakeE = (kind: SmilerKind, grin: number, phase = 'stalk', vis = 1): any => ({ id: 3, x: 0, y: 0, state: 'chase', animT: 1.3, dead: false, sm: { kind, grin, glow: 1, vis, phase } })
const place = (kind: SmilerKind, x: number, z: number, grin: number, rotY = -Math.PI / 2 + 0.35, vis = 1, phase = 'stalk') => {
  const g = buildEntityMesh('smiler', { smilerKind: kind, seed: 3 })
  g.position.set(x, 0, z); g.rotation.y = rotY
  g.scale.setScalar(SMILER_KINDS[kind].scale)
  scene.add(g); animateSmiler(g, fakeE(kind, grin, phase, vis), 2.3, 0)
  g.position.x = x; g.position.z = z
  return g
}
const stats = (o: THREE.Object3D) => { let calls = 0, tris = 0; o.traverse((m: any) => { if (m.isMesh) { calls++; const g = m.geometry; tris += (g.index ? g.index.count : g.attributes.position.count) / 3 } }); return { calls, tris: Math.round(tris) } }

if (mode === 'lineup' || mode === 'dark') {
  cam.position.set(0, 1.35, 8.6); cam.lookAt(0, 1.0, 0); cam.updateMatrixWorld()
  const ks: SmilerKind[] = ['common', 'phantom', 'starved', 'canid', 'great']
  ks.forEach((k, i) => {
    const x = (i - 2) * 1.75
    const g = place(k, x, 0, dark ? 0.55 : 0.4, k === 'canid' ? -Math.PI / 2 + 0.9 : -Math.PI / 2 + 0.3, 1)
    const st = stats(g)
    if (!dark) label(x, 0, 0, `${SMILER_KINDS[k].name}<div class="s">${st.calls} 次绘制 · ${st.tris} 面</div>`, H - 92)
  })
} else if (mode === 'grin') {
  cam.position.set(0, 1.45, 3.4); cam.lookAt(0, 1.32, 0); cam.updateMatrixWorld()
  const items: [SmilerKind, number, string, number][] = [['common', 0.05, '游荡：闭嘴', 1], ['common', 0.45, '察觉：咧嘴', 1], ['common', 1, '扑击：张到最大', 1], ['phantom', 1, '幽影：近身现形', 1], ['phantom', 1, '幽影：远处只剩余光', 0.15]]
  items.forEach(([k, gr, name, vis], i) => {
    const x = (i - 2) * 0.95
    place(k, x, 0, gr, -Math.PI / 2, vis)
    label(x, 0, 0, name, H - 70)
  })
}
renderer.render(scene, cam)
;(window as any).__ready = true
