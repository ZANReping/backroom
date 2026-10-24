/* eslint-disable @typescript-eslint/no-explicit-any -- 预览页直接拨动引擎字段 */
// 售货机交互界面预览：真实 VendingOverlay + 真实 vendingAI 状态 + 3D 机器（vendingRender 同一套映射）。
// ?variant=normal|e36&press=A1&t=1.2&take=1&jam=1&kick=1&cry=1&tape=1&live=1
import * as THREE from 'three'
import { createRoot } from 'react-dom/client'
import { engine } from '@/game/engine'
import { makeEntity } from '@/game/entities'
import VendingOverlay from '@/components/VendingOverlay'
import { buildVendingMachine } from '@/game/renderer/vendingMesh'
import { animateVendingEntity, animateVendingStruct } from '@/game/renderer/vendingRender'
import { openVending, vendingPress, vendingTake, vendingKick, structMachine, vm36, tickVendMachine, VM } from '@/game/engine/vendingAI'
import { vendingSeedOfEntity, vendingSeedOfStruct } from '@/game/content/vendingLayout'

const q = new URLSearchParams(location.search)
const variant = q.get('variant') === 'e36' ? 'e36' : 'normal'
const W = innerWidth, H = innerHeight
const renderer = new THREE.WebGLRenderer({ antialias: true }); renderer.setSize(W, H); renderer.outputColorSpace = THREE.SRGBColorSpace
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.shadowMap.enabled = true
document.body.prepend(renderer.domElement)
const scene = new THREE.Scene(); scene.background = new THREE.Color(variant === 'e36' ? '#1a1712' : '#171615')
const wallC = variant === 'e36' ? '#7a6c4a' : '#6e6a5e'
const wl = new THREE.Mesh(new THREE.BoxGeometry(6, 3.2, 0.2), new THREE.MeshStandardMaterial({ color: wallC, roughness: 0.95 })); wl.position.set(0, 1.6, -0.5); scene.add(wl)
const fl = new THREE.Mesh(new THREE.BoxGeometry(6, 0.05, 6), new THREE.MeshStandardMaterial({ color: '#3a3732', roughness: 0.9 })); fl.position.set(0, -0.025, 2); fl.receiveShadow = true; scene.add(fl)
scene.add(new THREE.HemisphereLight('#e9e4d8', '#2a2622', 0.65))
const d = new THREE.DirectionalLight('#fff2dc', 1.1); d.position.set(-2, 4, 5); d.castShadow = true; scene.add(d)
// 第一人称：站在机器正前方约 1 m，略偏右（界面在右边，机器在左半屏）
const cam = new THREE.PerspectiveCamera(62, W / H, 0.02, 60)
cam.position.set(0.62, 1.25, 1.7); cam.lookAt(0.6, 0.9, 0)

// 引擎：最小地图（机器 + 玩家）
const eng: any = engine
const S = 20, N = S * S
eng.map = { w: S, h: S, tiles: new Uint8Array(N).fill(1), structures: [], items: [], lights: [], exits: [], entities: [], spawn: { x: 10, y: 10 } }
Object.assign(eng.player, { x: 10.5, y: 11.6, z: 0, level: 2 })
eng.msg = () => {}
const tapes = q.has('tape') ? 1 : 0
if (tapes) { eng.addItem('tape'); eng.player.tapes = 1 }
let grp: THREE.Group, tick: (dt: number) => void, draw: (time: number) => void
if (variant === 'normal') {
  const s: any = { kind: 'vending', x: 10, y: 10, w: 1, h: 1, solid: true, data: tapes ? {} : { trade: 1 } }
  eng.map.structures.push(s)
  grp = new THREE.Group(); grp.add(buildVendingMachine({ variant: 'normal', seed: vendingSeedOfStruct(s) })); scene.add(grp)
  openVending(eng, { s })
  if (tapes) structMachine(eng, s).credit = 2
  tick = (dt) => tickVendMachine(eng, structMachine(eng, s), dt)
  draw = (time) => animateVendingStruct(grp, s, eng, time)
} else {
  const e: any = makeEntity('vendingmachine', 10.5, 10.5); e.facing = Math.PI / 2
  eng.map.entities.push(e)
  grp = new THREE.Group(); const vm = buildVendingMachine({ variant: 'e36', seed: vendingSeedOfEntity(e.id) }); grp.add(vm); grp.userData.vmRoot = vm; scene.add(grp)
  vm36(e, eng)
  openVending(eng, { e })
  tick = (dt) => tickVendMachine(eng, vm36(e, eng), dt)
  draw = (time) => animateVendingEntity(grp, e, time, 0)
}
const seq = (q.get('press') ?? '').split('')
const rnd = Math.random
if (q.has('jam')) Math.random = () => 0.1
else if (seq.length) Math.random = () => 0.9
for (const k of seq) vendingPress(eng, k)
Math.random = rnd
const T = Number(q.get('t') ?? 0)
for (let t = 0; t < T; t += 1 / 60) tick(1 / 60)
if (q.has('kick')) { Math.random = () => 0.1; vendingKick(eng); Math.random = rnd; for (let t = 0; t < Number(q.get('t2') ?? 1.3); t += 1 / 60) tick(1 / 60) }
if (q.has('take')) vendingTake(eng)
if (q.has('cry')) { const st: any = vm36(eng.map.entities[0], eng); st.cry = '……妈妈？'; st.cryT = 9 }
void VM
createRoot(document.getElementById('ui')!).render(<VendingOverlay onClose={() => {}} />)
let time = 3
const live = q.has('live')
const loop = () => {
  if (live) { tick(1 / 60); time += 1 / 60 }
  draw(time); renderer.render(scene, cam); requestAnimationFrame(loop)
}
loop()
setTimeout(() => { (window as any).__ready = true }, 2500)
