// 原型预览：L7 海床材质（?mode=seabed&depth=米&view=flat|cliff）。用游戏同一份 l7SeabedMaterial，
// 场景只是一块带一道陡崖的高度场 + 按深度变暗的水色/雾 + 一盏潜水手电。
import * as THREE from 'three'
import { l7SeabedMaterial } from '../game/renderer/l7Seabed'
const q = new URLSearchParams(location.search)
const depth = Number(q.get('depth') ?? 60), view = q.get('view') ?? 'flat'
const W = innerWidth, H = innerHeight
const renderer = new THREE.WebGLRenderer({ antialias: true }); renderer.setSize(W, H); renderer.outputColorSpace = THREE.SRGBColorSpace
document.body.appendChild(renderer.domElement)
const scene = new THREE.Scene()
const k = Math.exp(-depth / 45) // 天光随深度衰减
const fogC = new THREE.Color('#0b3550').multiplyScalar(0.15 + 0.85 * k)
scene.background = fogC; scene.fog = new THREE.FogExp2(fogC, 0.03 + 0.03 * (1 - k))
scene.add(new THREE.HemisphereLight('#8fc0d8', '#0a1014', 0.15 + 1.4 * k))
const sun = new THREE.DirectionalLight('#d7ecf5', 1.6 * k); sun.position.set(5, 30, 8); scene.add(sun)
const N = 220, S = 44
const geo = new THREE.PlaneGeometry(S, S, N, N); geo.rotateX(-Math.PI / 2)
const pos = geo.attributes.position as THREE.BufferAttribute
const n2 = (x: number, z: number) => Math.sin(x * 0.7 + Math.sin(z * 0.4) * 1.3) * 0.25 + Math.sin(z * 1.3 + x * 0.2) * 0.12 + Math.sin(x * 2.9 + z * 3.1) * 0.04
for (let i = 0; i < pos.count; i++) {
  const x = pos.getX(i), z = pos.getZ(i)
  let y = -depth + n2(x, z)
  if (view === 'cliff') { const u = x - 6 + Math.sin(z * 0.5) * 1.5 + Math.sin(z * 1.7) * 0.5; if (u > 0) y += Math.min(30, u * 6) + Math.sin(z * 2.3 + u) * 0.4 * Math.min(1, u) }
  pos.setY(i, y)
}
geo.computeVertexNormals()
const col = new Float32Array(pos.count * 3).fill(1); geo.setAttribute('color', new THREE.BufferAttribute(col, 3))
scene.add(new THREE.Mesh(geo, l7SeabedMaterial()))
const cam = new THREE.PerspectiveCamera(60, W / H, 0.05, 200)
if (view === 'cliff') { cam.position.set(-4, -depth + 2.4, 6); cam.lookAt(7, -depth + 4.5, -1) }
else { cam.position.set(0, -depth + 2.2, 5); cam.lookAt(1.5, -depth, -1.5) }
const torch = new THREE.SpotLight('#fff3dc', 260, 26, 0.5, 0.6, 1.4); torch.position.copy(cam.position).add(new THREE.Vector3(0.3, -0.2, 0))
const tgt = new THREE.Vector3(); cam.getWorldDirection(tgt); torch.target.position.copy(cam.position).addScaledVector(tgt, 8); scene.add(torch, torch.target)
const lab = document.getElementById('lab')!
const band = depth < 24 ? '有光带' : depth < 90 ? '微光带' : depth < 230 ? '午夜带' : '深渊'
lab.insertAdjacentHTML('beforeend', `<div class="l" style="left:${W / 2}px;top:14px">${band} · 海床约 ${depth} m${view === 'cliff' ? ' · 陡崖' : ''}（潜水手电）</div>`)
let n = 0
const loop = () => { renderer.render(scene, cam); if (++n > 40) (window as any).__ready = true; requestAnimationFrame(loop) }
loop()
