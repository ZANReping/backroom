// 9 件 relic 物品的前后对比：上排地面模型，下排手持模型（与 refined-items 同一套光照）
import * as THREE from 'three'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { ITEMS } from '../src/game/content/items'
import { buildItemMesh } from '../src/game/renderer/itemsMesh'
import { buildHeldItem } from '../src/game/renderer/viewmodel'
import { setMaterialMode } from '../src/game/renderer/shared'
const P = new URLSearchParams(location.search)
setMaterialMode(P.get('mode') === 'classic' ? 'classic' : 'realistic')
const TYPES = ['acidcallus', 'ashpile', 'jerryflyer', 'fakelog', 'sedgland', 'bento', 'curabiturgel', 'curabiturspore', 'curabiturrepellent']
const W = innerWidth, H = innerHeight
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true })
renderer.setPixelRatio(1); renderer.setSize(W, H); renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping
document.body.append(renderer.domElement)
const scene = new THREE.Scene(); scene.background = new THREE.Color('#1c2427')
const aspect = W / H, half = 1.0
const camera = new THREE.OrthographicCamera(-half * aspect, half * aspect, half, -half, .01, 30); camera.position.z = 8
const pmrem = new THREE.PMREMGenerator(renderer), room = new RoomEnvironment(); scene.environment = pmrem.fromScene(room, .04).texture
scene.add(new THREE.HemisphereLight('#f5f0e1', '#596570', 1))
const key = new THREE.DirectionalLight('#fff1df', 2); key.position.set(-2, 3, 4); const rim = new THREE.DirectionalLight('#c4dce8', 1); rim.position.set(3, 1, -2); scene.add(key, rim)
const rot = Number(P.get('rot') ?? 0)
const labels = document.querySelector('#labels')!
document.querySelector('#t')!.textContent = P.get('title') ?? ''
for (let row = 0; row < 2; row++) for (const [i, type] of TYPES.entries()) {
  const model = row === 0 ? buildItemMesh(type, { halo: false }) : buildHeldItem(type)
  const pose = new THREE.Group(), root = new THREE.Group()
  const b = new THREE.Box3(); model.updateMatrixWorld(true); model.traverse(o => { if ((o as THREE.Mesh).isMesh) b.expandByObject(o) }); const s = b.getSize(new THREE.Vector3()), c = b.getCenter(new THREE.Vector3())
  model.position.sub(c); pose.add(model); root.add(pose)
  root.scale.setScalar(Math.min(2 * half * aspect / 9 * .8, half * .8) / Math.max(s.x, s.y, s.z)); pose.rotation.set(row === 0 ? .6 : .3, -.5 + rot, 0)
  root.position.set(-half * aspect + (i + .5) * 2 * half * aspect / 9, half - (row + .45) * half, 0)
  scene.add(root)
  const l = document.createElement('div'); l.className = 'label'; l.textContent = (ITEMS[type]?.name ?? type) + (row ? '（手持）' : '')
  const sm = document.createElement('small'); sm.textContent = type; l.append(sm); labels.append(l)
}
const tick = () => new Promise(r => requestAnimationFrame(r))
await renderer.compileAsync(scene, camera)
const pending = () => { let p = 0; scene.traverse(o => { const m = (o as THREE.Mesh).material as any; if (!m) return; for (const mm of Array.isArray(m) ? m : [m]) for (const k of ['map', 'normalMap', 'roughnessMap']) if (mm[k]?.userData?.fileImagePending) p++ }); return p }
for (let n = 0; n < 300 && pending() > 0; n++) { await new Promise(r => setTimeout(r, 100)); renderer.render(scene, camera) }
for (let n = 0; n < 10; n++) { await new Promise(r => setTimeout(r, 100)); renderer.render(scene, camera) }
document.title = 'ready'
;(window as any).__done = true
void tick
