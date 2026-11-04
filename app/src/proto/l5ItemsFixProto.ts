// [l5items] 第三期物品 / L5 收尾预览：旧吊灯 vs 枝形吊灯、钩子上的锅、休息室旧留声机 vs O18 崭新留声机。?cpu=1
import '../game/renderer/renderer'
import * as THREE from 'three'
import { buildStructure } from '../game/renderer/structures'
import { buildChefProp } from '../game/renderer/chefRender'
const W = window as unknown as Record<string, unknown>
const N = 8, WALL_H = 4.2
const map: any = { w: N, h: N, tiles: new Uint8Array(N * N).fill(1), tint: new Uint8Array(N * N), ceiling: new Uint8Array(N * N), up: new Uint8Array(N * N), upWall: new Uint8Array(N * N), structures: [], floors: 1 }
const def: any = { id: 5, gen: 'hotel' }
const cell = 420, LAB = 28, TOP = 34
type V = { scene: THREE.Scene; cam: THREE.PerspectiveCamera; x: number; y: number; t: string }
const views: V[] = []
function view(i: number, title: string, obj: THREE.Object3D, look: [number, number, number], dist: number, el = 0.25, az = -0.5) {
  const s = new THREE.Scene(); s.background = new THREE.Color('#2a1a16')
  s.add(new THREE.HemisphereLight('#fff0dc', '#3a2418', 1.7)); const d = new THREE.DirectionalLight('#ffffff', 2); d.position.set(2, 4, 3); s.add(d)
  s.add(obj)
  const cam = new THREE.PerspectiveCamera(35, 1, 0.02, 40)
  cam.position.set(look[0] + Math.sin(az) * dist * Math.cos(el), look[1] + Math.sin(el) * dist, look[2] + Math.cos(az) * dist * Math.cos(el)); cam.lookAt(...look)
  views.push({ scene: s, cam, x: (i % 3) * cell, y: TOP + Math.floor(i / 3) * (cell + LAB), t: title })
}
const st = (kind: string, data: any = {}) => { const s: any = { kind, x: 0, y: 0, w: 1, h: 1, solid: false, data }; const g = buildStructure(s, def, map, WALL_H)!; return g }
function main() {
  const r = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true }); r.setPixelRatio(1)
  const old = st('chandelier', { l5: 1, profile: 'beverly' }), neu = st('chandelier', { l5: 1, profile: 'dining' })
  const cy = WALL_H - 1.05
  view(0, '旧吊灯（三层金环水晶灯，修前）', old, [0.5, cy, 0.5], 3.6, 0.12)
  view(1, '新：餐厅枝形吊灯（8+6 弯臂烛台 + 水晶坠）', neu, [0.5, cy, 0.5], 3.6, 0.12)
  view(2, '新：枝形吊灯 仰视', st('chandelier', { l5: 1, profile: 'dining' }), [0.5, cy - 0.3, 0.5], 3.2, -0.55)
  const stove: any = { kind: 'chefprop', x: 0, y: 0, w: 2, h: 1, solid: true, data: { prop: 'stove' } }
  const sg = buildChefProp(stove)!
  view(3, '修后：锅挂在钩子上（前移出墙 + S 钩）', sg, [2.25, 1.35, 0.3], 1.5, 0.1, -0.35)
  view(4, '休息室留声机（旧）', st('phonograph', { on: 1 }), [0.5, 0.9, 0.5], 2.4, 0.3)
  view(5, 'O18 崭新留声机（客房 3%）', st('phonograph', { on: 1, o18: 1 }), [0.5, 0.9, 0.5], 2.4, 0.3)
  const rows = Math.ceil(views.length / 3), Wd = 3 * cell, Ht = TOP + rows * (cell + LAB)
  r.setSize(Wd, Ht); r.outputColorSpace = THREE.SRGBColorSpace; r.toneMapping = THREE.ACESFilmicToneMapping; r.autoClear = false
  document.body.append(r.domElement)
  const lab = document.getElementById('labels')!
  document.getElementById('title')!.textContent = 'L5 收尾 · 吊灯 / 锅钩 / O18 留声机'
  for (const v of views) lab.insertAdjacentHTML('beforeend', `<div class="lb" style="left:${v.x + 8}px;top:${v.y + 4}px">${v.t}</div>`)
  const draw = () => { r.setScissorTest(false); r.setClearColor('#120c0a'); r.clear(); r.setScissorTest(true); for (const v of views) { const y = Ht - v.y - LAB - cell; r.setViewport(v.x + 2, y + 2, cell - 4, cell - 4); r.setScissor(v.x + 2, y + 2, cell - 4, cell - 4); r.render(v.scene, v.cam) } }
  let n = 0; const tick = () => { draw(); if (++n === 20) W.__ready = true; if (n < 40) requestAnimationFrame(tick) }; tick()
}
try { main() } catch (e) { W.__err = String(e) }
