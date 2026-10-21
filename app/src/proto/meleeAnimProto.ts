// 近战武器重制 阶段 2 预览：第一人称手臂握持 + 挥砍动画（与游戏 renderer 同一套 buildViewmodel / buildHeldItem / vmAnimPose）。
// ?anim=1&mode=grid —— 5 把 × 普攻/重击 共 10 格；window.__frame(pr) 渲染进度 pr（0..1）那一帧
// ?anim=1&mode=hold —— 5 把待机握持
// ?anim=1&mode=one&w=axe&heavy=1 —— 单格大图；&charge=0.8 / &bounce=1 看蓄力 / 弹刀
// &real=1 真实材质
import * as THREE from 'three'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { buildViewmodel, buildHeldItem, heldHandPose, heldBox, vmAnimPose, sleeveKindOf } from '../game/renderer/viewmodel'
import { meleeSwing } from '../game/renderer/meleeAnim'
import { MELEE_TYPES, setMeleeWear, type MeleeType } from '../game/renderer/meleeMesh'
import { setMaterialMode } from '../game/renderer/shared'

const Q = new URLSearchParams(location.search)
const mode = Q.get('mode') ?? 'grid'
const real = Q.get('real') === '1'
if (real) setMaterialMode('realistic')
const W = innerWidth, H = innerHeight
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true }); renderer.setSize(W, H); renderer.outputColorSpace = THREE.SRGBColorSpace
renderer.setScissorTest(true)
if (real) { renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.1 }
document.body.appendChild(renderer.domElement)
const envTex = real ? new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), .04).texture : null
const lab = document.getElementById('lab')!
const NAME: Record<MeleeType, string> = { knife: '刀', crowbar: '撬棍', wrench: '管钳', timber: '木板', axe: '斧头' }
const look = { skin: '#c9a58a', sleeve: '#3a3f46', sleeveKind: sleeveKindOf(3), topStyle: 3 }

interface Cell { type: MeleeType; heavy: boolean; charge?: number; bounce?: number; sc: THREE.Scene; cm: THREE.PerspectiveCamera; vm: THREE.Group; x: number; y: number; w: number; h: number; side: number }
const wallTex = (() => { const cv = document.createElement('canvas'); cv.width = cv.height = 256; const g = cv.getContext('2d')!; g.fillStyle = '#c2ad62'; g.fillRect(0, 0, 256, 256); g.strokeStyle = 'rgba(120,96,40,.35)'; g.lineWidth = 3; for (let x = 0; x < 256; x += 32) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, 256); g.stroke() } for (let i = 0; i < 3000; i++) { g.fillStyle = `rgba(90,70,30,${Math.random() * .08})`; g.fillRect(Math.random() * 256, Math.random() * 256, 2, 2) } const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(6, 3); t.colorSpace = THREE.SRGBColorSpace; return t })()
function makeCell(type: MeleeType, heavy: boolean, x: number, y: number, w: number, h: number, o: { charge?: number; bounce?: number; side?: number } = {}): Cell {
  const sc = new THREE.Scene(); sc.background = new THREE.Color('#6b6136'); if (envTex) { sc.environment = envTex; sc.environmentIntensity = .6 }
  sc.add(new THREE.HemisphereLight('#fff3d0', '#4a4330', real ? .7 : 1.1))
  const dl = new THREE.DirectionalLight('#fff0d0', real ? 2.2 : 1.3); dl.position.set(-1, 2, 1.5); sc.add(dl)
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(12, 6), new THREE.MeshLambertMaterial({ map: wallTex })); wall.position.set(0, .6, -3); sc.add(wall)
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(12, 8), new THREE.MeshLambertMaterial({ color: '#8a7650' })); floor.rotation.x = -Math.PI / 2; floor.position.y = -1.6; sc.add(floor)
  const cm = new THREE.PerspectiveCamera(72, w / h, .02, 30); sc.add(cm)
  const vm = new THREE.Group(), vf = new THREE.Group()
  const parts = buildViewmodel(vm, vf, cm)
  parts.right.setLook(look); parts.left.setLook(look)
  const item = buildHeldItem(type + (Q.get('broken') === '1' ? ':broken' : ''))
  if (Q.has('worn')) setMeleeWear(item.userData.meleeMesh, { worn: Number(Q.get('worn')), blood: Number(Q.get('blood') ?? 0) })
  const box = heldBox(item)
  parts.right.setPose(heldHandPose(type, box), item)
  vm.add(item)
  return { type, heavy, charge: o.charge, bounce: o.bounce, sc, cm, vm, x, y, w, h, side: o.side ?? 1 }
}
const cells: Cell[] = []
const label = (x: number, y: number, txt: string) => lab.insertAdjacentHTML('beforeend', `<div class="l" style="left:${x}px;top:${y}px">${txt}</div>`)
if (mode === 'grid') {
  const cw = Math.floor(W / 5), ch = Math.floor(H / 2)
  MELEE_TYPES.forEach((t, i) => {
    cells.push(makeCell(t, false, i * cw, 0, cw, ch))
    cells.push(makeCell(t, true, i * cw, ch, cw, ch))
    const a = meleeSwing(t), b = meleeSwing(t, true)
    label(i * cw + cw / 2, 6, `${NAME[t]} 普攻 <span class="s">${a.dur}s</span>`)
    label(i * cw + cw / 2, ch + 6, `${NAME[t]} 重击 <span class="s">${b.dur}s</span>`)
  })
} else if (mode === 'hold') {
  const cw = Math.floor(W / 3), ch = Math.floor(H / 2)
  MELEE_TYPES.forEach((t, i) => { const x = (i % 3) * cw, y = Math.floor(i / 3) * ch; cells.push(makeCell(t, false, x, y, cw, ch)); label(x + cw / 2, y + 6, NAME[t]) })
} else {
  const t = (Q.get('w') ?? 'axe') as MeleeType
  cells.push(makeCell(t, Q.get('heavy') === '1', 0, 0, W, H, { charge: Number(Q.get('charge') ?? 0), bounce: Number(Q.get('bounce') ?? 0), side: Number(Q.get('side') ?? 1) }))
}
const phaseEl = document.createElement('div'); phaseEl.className = 'l'; phaseEl.style.cssText = 'left:50%;bottom:8px;top:auto'; lab.appendChild(phaseEl)

function frame(pr: number, time = 0.6) {
  for (const c of cells) {
    const sw = meleeSwing(c.type, c.heavy, c.side)
    const attacking = pr >= 0 && !(c.charge || c.bounce)
    const pose = vmAnimPose({ mx: 0, my: 0, bobPhase: 0, time, attackAnimT: attacking ? (1 - pr) * sw.dur : 0, attackAnimDur: sw.dur, attackAnimKind: 'swing',
      melee: { type: c.type, heavy: c.heavy, side: c.side, charge: c.charge, bounce: c.bounce } })
    c.vm.position.set(pose.px, pose.py, pose.pz); c.vm.rotation.set(pose.rx, pose.ry, pose.rz)
    renderer.setViewport(c.x, H - c.y - c.h, c.w, c.h); renderer.setScissor(c.x, H - c.y - c.h, c.w, c.h)
    renderer.render(c.sc, c.cm)
  }
  // 阶段标注（以斧头普攻为参考时间轴之外，各格各自的阶段在下方 HUD 写出）
  const ph = (t: MeleeType, heavy: boolean) => { const s = meleeSwing(t, heavy); return pr < s.windup ? '前摇' : pr < s.active ? '<b style="color:#ff7a5a">判定</b>' : '收招' }
  phaseEl.innerHTML = mode === 'grid' ? `进度 ${(pr * 100).toFixed(0)}% <span class="s">${MELEE_TYPES.map((t) => NAME[t] + ph(t, false) + '/' + ph(t, true)).join(' · ')}</span>` : ''
}
const w = window as unknown as Record<string, unknown>
w.__frame = (pr: number, time?: number) => { frame(pr, time); return true }
frame(Q.has('pr') ? Number(Q.get('pr')) : -1)
requestAnimationFrame(() => { frame(Q.has('pr') ? Number(Q.get('pr')) : -1); w.__info = { mode, cells: cells.length }; w.__ready = true })
