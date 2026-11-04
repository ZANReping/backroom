// [casino] Level 5.1 阶段 4b：入座后桌面 / 机器上的实体牌局（不暂停）。
//   老虎机：三条 3D 转轴（canvas 矢量符号贴图）、拉杆、LED、赢线灯、出币口硬币落进托盘；
//   21 点 / 野兽：牌靴发出 3D 扑克牌（canvas 牌面）、滑到桌面再翻面，下注圈筹码堆，结算推 / 收筹码；
//   轮盘：实体转盘（真实格序）+ 球（外轨减速 → 落格弹跳），桌面下注区用准星选格放筹码；
//   骰宝：骰盅摇晃 → 揭盅露出 3 颗 3D 骰子（四元数 = 结果）；兑换台：贴在台面的价目牌（准星上下选行），Louie 把筹码 / 奖品推过台面；
//   免费饮料：侍应送到桌边的杯子，拿起喝（镜头由 renderer 读 drinkT）。所有终态都由 engine/casinoShow 的同一组函数求值。
import * as THREE from 'three'
import type { Engine } from '../engine'
import * as C from '../engine/casinoAI'
import * as SH from '../engine/casinoShow'
import { casinoLayout } from '../content/casinoLayout'
import type { Card } from '../engine/casinoGames'

const TAU = Math.PI * 2
const canvas = (w: number, h: number) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c }
const texOf = (c: HTMLCanvasElement) => { const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t }

// ===================================================================== 矢量图案（不依赖 emoji 字体）
function drawSym(g: CanvasRenderingContext2D, sym: string) {
  g.save()
  if (sym === '樱桃') {
    g.strokeStyle = '#2f7d2a'; g.lineWidth = 6; g.beginPath(); g.moveTo(-20, 8); g.quadraticCurveTo(-6, -30, 14, -36); g.moveTo(22, 12); g.quadraticCurveTo(16, -20, 14, -36); g.stroke()
    g.fillStyle = '#3c9a33'; g.beginPath(); g.ellipse(24, -34, 14, 6, -0.4, 0, TAU); g.fill()
    for (const [x, y] of [[-22, 18], [22, 22]]) { const gr = g.createRadialGradient(x - 6, y - 6, 2, x, y, 18); gr.addColorStop(0, '#ff8a8a'); gr.addColorStop(1, '#a3000f'); g.fillStyle = gr; g.beginPath(); g.arc(x, y, 17, 0, TAU); g.fill() }
  } else if (sym === '铃') {
    const gr = g.createLinearGradient(-30, 0, 30, 0); gr.addColorStop(0, '#9a6a10'); gr.addColorStop(0.45, '#ffe07a'); gr.addColorStop(1, '#8a5a08'); g.fillStyle = gr
    g.beginPath(); g.moveTo(0, -36); g.bezierCurveTo(22, -36, 24, -8, 28, 16); g.lineTo(34, 24); g.lineTo(-34, 24); g.lineTo(-28, 16); g.bezierCurveTo(-24, -8, -22, -36, 0, -36); g.fill()
    g.fillStyle = '#7a4a06'; g.beginPath(); g.arc(0, 30, 7, 0, TAU); g.fill(); g.fillRect(-3, -44, 6, 9)
  } else if (sym === 'BAR') {
    g.fillStyle = '#111'; g.strokeStyle = '#e8d070'; g.lineWidth = 4; const r = 8, w = 120, h = 46
    g.beginPath(); g.roundRect(-w / 2, -h / 2, w, h, r); g.fill(); g.stroke()
    g.fillStyle = '#fff4c8'; g.font = 'bold 36px Arial, Helvetica, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('BAR', 0, 2)
  } else if (sym === '7') {
    // 7：多边形（不靠字体）
    g.fillStyle = '#d6101e'; g.strokeStyle = '#ffd34a'; g.lineWidth = 4
    g.beginPath(); g.moveTo(-26, -34); g.lineTo(30, -34); g.lineTo(30, -24); g.lineTo(2, 36); g.lineTo(-14, 36); g.lineTo(12, -20); g.lineTo(-26, -20); g.closePath(); g.fill(); g.stroke()
  } else if (sym === 'TH') {
    const gr = g.createRadialGradient(0, 0, 4, 0, 0, 40); gr.addColorStop(0, '#fff6c0'); gr.addColorStop(1, '#b07a10'); g.fillStyle = gr
    g.beginPath(); g.arc(0, 0, 38, 0, TAU); g.fill(); g.strokeStyle = '#5a2a00'; g.lineWidth = 3; g.stroke()
    // T 与 H 的笔画（矩形拼）
    g.fillStyle = '#5a1020'; g.fillRect(-28, -18, 26, 7); g.fillRect(-18, -18, 7, 36); g.fillRect(4, -18, 7, 36); g.fillRect(21, -18, 7, 36); g.fillRect(4, -3, 24, 7)
  } else { g.fillStyle = 'rgba(80,60,40,.35)'; g.beginPath(); g.arc(0, 0, 5, 0, TAU); g.fill() }
  g.restore()
}
let REEL_TEX: THREE.Texture | null = null
function reelTex() {
  if (REEL_TEX) return REEL_TEX
  const cw = 96, c = canvas(cw * SH.REEL_N, 196), g = c.getContext('2d')!
  const bg = g.createLinearGradient(0, 0, 0, 196); bg.addColorStop(0, '#d8cfb8'); bg.addColorStop(0.5, '#fffaf0'); bg.addColorStop(1, '#d8cfb8'); g.fillStyle = bg; g.fillRect(0, 0, c.width, 196)
  for (let k = 0; k <= SH.REEL_N; k++) {
    // 第 k 格中心在 u = k / N（k = N 是第 0 格的环绕副本）；canvas x → 世界「上」，所以旋转 90° 画
    g.save(); g.translate(k * cw, 98); g.rotate(Math.PI / 2); g.scale(0.95, 0.95); drawSym(g, SH.REEL[k % SH.REEL_N]); g.restore()
    g.fillStyle = 'rgba(0,0,0,.18)'; g.fillRect(k * cw + cw / 2 - 1, 0, 2, 196)
  }
  REEL_TEX = texOf(c); REEL_TEX.wrapS = THREE.RepeatWrapping
  return REEL_TEX
}
function drawSuit(g: CanvasRenderingContext2D, s: number, x: number, y: number, k: number) {
  g.save(); g.translate(x, y); g.scale(k, k); g.fillStyle = s === 1 || s === 2 ? '#c8101c' : '#111'
  g.beginPath()
  if (s === 1) { g.moveTo(0, 10); g.bezierCurveTo(-14, 0, -12, -12, -5, -12); g.bezierCurveTo(-2, -12, 0, -9, 0, -7); g.bezierCurveTo(0, -9, 2, -12, 5, -12); g.bezierCurveTo(12, -12, 14, 0, 0, 10) }
  else if (s === 2) { g.moveTo(0, -12); g.lineTo(9, 0); g.lineTo(0, 12); g.lineTo(-9, 0) }
  else if (s === 0) { g.moveTo(0, -12); g.bezierCurveTo(14, 0, 12, 10, 4, 8); g.lineTo(6, 13); g.lineTo(-6, 13); g.lineTo(-4, 8); g.bezierCurveTo(-12, 10, -14, 0, 0, -12) }
  else { for (const [cx, cy] of [[0, -6], [-6, 3], [6, 3]]) { g.moveTo(cx + 5.5, cy); g.arc(cx, cy, 5.5, 0, TAU) } g.moveTo(-3, 13); g.lineTo(3, 13); g.lineTo(1, 4); g.lineTo(-1, 4) }
  g.closePath(); g.fill(); g.restore()
}
const RANK = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K']
const CARD_MAT = new Map<string, THREE.MeshStandardMaterial>()
function cardMat(c: Card | null) {
  const key = c ? c.r + '_' + c.s : 'back'
  let m = CARD_MAT.get(key); if (m) return m
  const cv = canvas(128, 180), g = cv.getContext('2d')!
  g.fillStyle = '#fbfaf4'; g.beginPath(); g.roundRect(0, 0, 128, 180, 12); g.fill()
  if (!c) { g.fillStyle = '#6a1020'; g.beginPath(); g.roundRect(8, 8, 112, 164, 8); g.fill(); g.strokeStyle = '#d9b25a'; g.lineWidth = 2; for (let i = -180; i < 180; i += 14) { g.beginPath(); g.moveTo(8, 8 + i + 112); g.lineTo(120, 8 + i); g.stroke() } g.fillStyle = '#d9b25a'; g.font = 'bold 34px Georgia, serif'; g.textAlign = 'center'; g.fillText('TH', 64, 102) }
  else {
    g.fillStyle = c.s === 1 || c.s === 2 ? '#c8101c' : '#111'; g.font = 'bold 30px Georgia, serif'; g.textAlign = 'center'
    g.fillText(RANK[c.r], 22, 34); drawSuit(g, c.s, 22, 52, 0.9)
    g.save(); g.translate(128, 180); g.rotate(Math.PI); g.fillText(RANK[c.r], 22, 34); drawSuit(g, c.s, 22, 52, 0.9); g.restore()
    drawSuit(g, c.s, 64, 92, c.r >= 10 ? 2.2 : 2.8)
  }
  m = new THREE.MeshStandardMaterial({ map: texOf(cv), roughness: 0.55 }); CARD_MAT.set(key, m); return m
}
function dieMats() {
  const face = (v: number) => {
    const cv = canvas(64, 64), g = cv.getContext('2d')!
    g.fillStyle = '#f6f2e8'; g.fillRect(0, 0, 64, 64); g.fillStyle = v === 1 || v === 4 ? '#c8101c' : '#151515'
    const P: Record<number, [number, number][]> = { 1: [[32, 32]], 2: [[18, 18], [46, 46]], 3: [[16, 16], [32, 32], [48, 48]], 4: [[18, 18], [46, 18], [18, 46], [46, 46]], 5: [[16, 16], [48, 16], [32, 32], [16, 48], [48, 48]], 6: [[18, 14], [46, 14], [18, 32], [46, 32], [18, 50], [46, 50]] }
    for (const [x, y] of P[v]) { g.beginPath(); g.arc(x, y, v === 1 ? 9 : 6, 0, TAU); g.fill() }
    return new THREE.MeshStandardMaterial({ map: texOf(cv), roughness: 0.3 })
  }
  return [face(3), face(4), face(1), face(6), face(2), face(5)] // BoxGeometry 面序 +X −X +Y −Y +Z −Z = DIE_FACES
}
function ledCanvas() { const c = canvas(512, 72); return { c, g: c.getContext('2d')!, tex: texOf(c), last: '' } }
function drawLed(L: ReturnType<typeof ledCanvas>, text: string, col = '#ff3a28') {
  if (L.last === text) return; L.last = text
  const g = L.g; g.fillStyle = '#080404'; g.fillRect(0, 0, 512, 72); g.fillStyle = col; g.font = 'bold 38px "Courier New", monospace'; g.textBaseline = 'middle'; g.fillText(text, 14, 38); L.tex.needsUpdate = true
}

// ===================================================================== 筹码实体（InstancedMesh）
const CHIP_COL: Record<string, string> = { red: '#c01822', blue: '#1d4fd0', yellow: '#e8c020', green: '#159a3c' }
const CHIP_G = new THREE.CylinderGeometry(0.019, 0.019, 0.0045, 18)
class Chips {
  im: THREE.InstancedMesh; n = 0
  constructor(parent: THREE.Object3D, max = 400) { this.im = new THREE.InstancedMesh(CHIP_G, new THREE.MeshStandardMaterial({ roughness: 0.4, metalness: 0.05 }), max); this.im.count = 0; this.im.frustumCulled = false; parent.add(this.im) }
  /** 在 (x, y, z) 处摆 value 的筹码堆（每摞 20 枚，摞间 0.042 m） */
  set(value: number, x: number, y: number, z: number, start = 0) {
    const st = SH.chipStacks(value), M = new THREE.Matrix4(), c = new THREE.Color()
    let i = start
    for (const s of st) { if (i >= this.im.instanceMatrix.count) break; M.makeTranslation(x + s.stack * 0.042, y + 0.0025 + s.h * 0.0047, z + ((s.stack * 7) % 3 - 1) * 0.004); this.im.setMatrixAt(i, M); this.im.setColorAt(i, c.set(CHIP_COL[s.color])); i++ }
    return i
  }
  done(n: number) { this.n = n; this.im.count = n; this.im.instanceMatrix.needsUpdate = true; if (this.im.instanceColor) this.im.instanceColor.needsUpdate = true }
}

// ===================================================================== 场景里被实体版替换的静态零件（隐藏 / 还原）
function hideInstance(root: THREE.Object3D, name: string, idx: number, hide: boolean) {
  const im = root.getObjectByName(name) as THREE.InstancedMesh | undefined; if (!im) return
  const key = 'hid' + idx, M = new THREE.Matrix4()
  if (hide) { if (im.userData[key]) return; im.getMatrixAt(idx, M); im.userData[key] = M.clone(); im.setMatrixAt(idx, new THREE.Matrix4().makeScale(0, 0, 0)) }
  else { const o = im.userData[key] as THREE.Matrix4 | undefined; if (!o) return; im.setMatrixAt(idx, o); delete im.userData[key] }
  im.instanceMatrix.needsUpdate = true
}

// ===================================================================== 实体牌局
interface Rig {
  kind: SH.SeatKind; g: THREE.Group; top: number; chips: Chips; restore: () => void
  reels?: THREE.Mesh[]; lever?: THREE.Group; led?: ReturnType<typeof ledCanvas>; lamps?: THREE.MeshBasicMaterial; coins?: THREE.InstancedMesh
  cards?: THREE.Group[]; wheel?: THREE.Group; ball?: THREE.Mesh; cup?: THREE.Mesh; dice?: THREE.Mesh[]; cursor?: THREE.Mesh; layout?: { x0: number; x1: number; z0: number; z1: number }
  glass?: THREE.Mesh // 兑换台不再入座：无价目牌 / 递交方块（兑换走 CasinoMenu 覆盖层）
  aim: { u: number; v: number } | null
}
const RIGS = new WeakMap<THREE.Object3D, Rig>()
/** 当前准星落在桌面下注区的格子（HUD / 输入读） */
export let casinoAimCell: { kind: string; pick: number } | null = null

function layoutTex(kind: 'rou' | 'dice') {
  const c = canvas(1024, 464), g = c.getContext('2d')!
  g.fillStyle = 'rgba(0,0,0,0)'; g.clearRect(0, 0, 1024, 464); g.strokeStyle = '#f2e6c0'; g.lineWidth = 3; g.textAlign = 'center'; g.textBaseline = 'middle'
  const U = (u: number) => (u + 1) / 2 * 1024, V = (v: number) => (v + 1) / 2 * 464
  const cell = (u0: number, v0: number, u1: number, v1: number, label: string, fill?: string) => { if (fill) { g.fillStyle = fill; g.fillRect(U(u0), V(v0), U(u1) - U(u0), V(v1) - V(v0)) } g.strokeRect(U(u0), V(v0), U(u1) - U(u0), V(v1) - V(v0)); g.fillStyle = '#fff6dc'; g.font = 'bold ' + Math.min(44, (V(v1) - V(v0)) * 0.5) + 'px Georgia, "Noto Serif CJK SC", serif'; g.fillText(label, (U(u0) + U(u1)) / 2, (V(v0) + V(v1)) / 2) }
  if (kind === 'rou') {
    cell(-1, -1, -0.86, -0.27, '00', '#0e6a2c'); cell(-1, -0.27, -0.86, 0.45, '0', '#0e6a2c')
    for (let col = 0; col < 12; col++) for (let row = 0; row < 3; row++) { const n = col * 3 + (3 - row), u0 = -0.86 + col * 1.86 / 12, v0 = -1 + row * 1.45 / 3; cell(u0, v0, u0 + 1.86 / 12, v0 + 1.45 / 3, String(n), [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36].includes(n) ? '#a8141c' : '#141010') }
    cell(-1, 0.45, -0.5, 1, '红', '#a8141c'); cell(-0.5, 0.45, 0, 1, '黑', '#141010'); cell(0, 0.45, 0.5, 1, '单'); cell(0.5, 0.45, 1, 1, '双')
  } else {
    cell(-1, -1, -0.5, 0, '小 4–10'); cell(-0.5, -1, 0, 0, '单'); cell(0, -1, 0.5, 0, '双'); cell(0.5, -1, 1, 0, '大 11–17')
    for (let k = 0; k < 6; k++) { const u0 = -1 + k / 3; cell(u0, 0, u0 + 1 / 3, 1, '·'.repeat(0) + String(k + 1)) }
  }
  return texOf(c)
}

function buildRig(scene: THREE.Group, a: SH.SeatAnchor): Rig {
  const g = new THREE.Group(); g.name = 'casino-live-rig'; g.position.set(a.px, 0, a.py); g.rotation.y = Math.PI / 2 - a.rot; scene.add(g)
  const top = a.kind === 'beast' ? 0.62 : a.kind === 'dice' ? 0.82 : a.kind === 'slot' ? 0.81 : 0.86
  const rig: Rig = { kind: a.kind, g, top, chips: new Chips(g), restore: () => {}, aim: null }
  const brass = new THREE.MeshStandardMaterial({ color: '#c9a24a', metalness: 0.9, roughness: 0.3 })
  const L = casinoLayout()
  if (a.kind === 'slot') {
    const idx = L.props.filter((p) => p.kind === 'slot').findIndex((p) => Math.hypot(p.x - a.px, p.y - a.py) < 0.05)
    for (const n of ['slot-lever', 'slot-knob', 'slot-screen']) hideInstance(scene, n, idx, true)
    rig.restore = () => { for (const n of ['slot-lever', 'slot-knob', 'slot-screen']) hideInstance(scene, n, idx, false) }
    const tex = reelTex(), rm = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.45 })
    rig.reels = [-0.205, 0, 0.205].map((x) => { const cy = new THREE.CylinderGeometry(0.2, 0.2, 0.18, 48, 1, true); const m = new THREE.Mesh(cy, rm); const piv = new THREE.Group(); piv.position.set(x, 1.28, 0.08); m.rotation.z = Math.PI / 2; piv.add(m); g.add(piv); return m })
    // 窗框（遮住转轴与机身的穿插）+ 赢线 + 赢线灯
    const frame = new THREE.MeshStandardMaterial({ color: '#141014', metalness: 0.6, roughness: 0.4 })
    for (const [w, h, x, y] of [[0.74, 0.07, 0, 1.56], [0.74, 0.07, 0, 1.0], [0.06, 0.6, -0.34, 1.28], [0.06, 0.6, 0.34, 1.28], [0.02, 0.5, -0.103, 1.28], [0.02, 0.5, 0.103, 1.28]] as const) { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.05), frame); b.position.set(x, y, 0.27); g.add(b) }
    const pl = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.006, 0.004), new THREE.MeshBasicMaterial({ color: '#ff2020', transparent: true, opacity: 0.75, toneMapped: false })); pl.position.set(0, 1.28, 0.285); g.add(pl)
    rig.lamps = new THREE.MeshBasicMaterial({ color: '#402010', toneMapped: false })
    for (const y of [1.6, 0.965]) { const l = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.02, 0.01), rig.lamps); l.position.set(0, y, 0.3); g.add(l) }
    // LED（余额 / 下注 / 赢）
    rig.led = ledCanvas(); const led = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.07), new THREE.MeshBasicMaterial({ map: rig.led.tex, toneMapped: false })); led.position.set(0, 0.91, 0.262); led.rotation.x = -0.25; g.add(led)
    // 拉杆（支点在机身右侧，绕 X 转：拉向玩家）
    rig.lever = new THREE.Group(); rig.lever.position.set(0.47, 1.08, 0.0); g.add(rig.lever)
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.46, 10), brass); rod.position.y = 0.23; rig.lever.add(rod)
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.048, 14, 10), new THREE.MeshStandardMaterial({ color: '#c01020', roughness: 0.25 })); knob.position.y = 0.47; rig.lever.add(knob)
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.06, 14), brass); hub.rotation.z = Math.PI / 2; rig.lever.add(hub)
    // 出币口 + 托盘 + 硬币
    const tray = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.04, 0.14), brass); tray.position.set(0, 0.8, 0.3); g.add(tray)
    const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.06, 0.02), new THREE.MeshBasicMaterial({ color: '#050505' })); mouth.position.set(0, 0.9, 0.235); g.add(mouth)
    rig.coins = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.016, 0.016, 0.004, 14), new THREE.MeshStandardMaterial({ color: '#e7c55a', metalness: 0.95, roughness: 0.25 }), SH.SLOT_T.coinMax); rig.coins.count = 0; rig.coins.frustumCulled = false; g.add(rig.coins)
  } else if (a.kind === 'bj' || a.kind === 'beast') {
    rig.cards = []
    const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.09, 0.26), new THREE.MeshStandardMaterial({ color: '#1a1410', roughness: 0.5 })); shoe.position.set(SH.SHOE[0], top + 0.045, SH.SHOE[2]); g.add(shoe)
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.06, 0.068, 32), new THREE.MeshBasicMaterial({ color: '#f2e6c0', transparent: true, opacity: 0.8 })); ring.rotation.x = -Math.PI / 2; ring.position.set(0, top + 0.003, 0.36); g.add(ring)
  } else if (a.kind === 'rou') {
    // 实体转盘（替换场景里的装饰转盘）
    let hid: THREE.Object3D | null = null
    scene.traverse((o) => { if (o.userData.casinoWheel && Math.hypot(o.position.x - (a.px - Math.cos(a.rot) * 0.95), o.position.z - (a.py - Math.sin(a.rot) * 0.95)) < 0.1) hid = o })
    if (hid) (hid as THREE.Object3D).visible = false
    rig.restore = () => { if (hid) (hid as THREE.Object3D).visible = true }
    const W = new THREE.Group(); W.position.set(0, 0.86, -0.95); g.add(W)
    const bowl = new THREE.Mesh(new THREE.LatheGeometry([new THREE.Vector2(0.0, 0), new THREE.Vector2(0.52, 0), new THREE.Vector2(0.56, 0.1), new THREE.Vector2(0.5, 0.16), new THREE.Vector2(0.44, 0.1)], 48), new THREE.MeshStandardMaterial({ color: '#4a2c18', roughness: 0.5 })); W.add(bowl)
    const c = canvas(1024, 1024), q = c.getContext('2d')!
    q.translate(512, 512); q.fillStyle = '#3a2516'; q.beginPath(); q.arc(0, 0, 512, 0, TAU); q.fill()
    SH.WHEEL.forEach((n, k) => { const b0 = -(k + 0.5) * SH.POCKET, b1 = -(k - 0.5) * SH.POCKET; q.fillStyle = n === 0 || n === 37 ? '#0e7a32' : [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36].includes(n) ? '#b81a1e' : '#141010'; q.beginPath(); q.moveTo(0, 0); q.arc(0, 0, 500, b0, b1); q.fill(); q.save(); q.rotate(-k * SH.POCKET); q.translate(450, 0); q.rotate(Math.PI / 2); q.fillStyle = '#f4e4b0'; q.font = 'bold 34px Georgia, serif'; q.textAlign = 'center'; q.textBaseline = 'middle'; q.fillText(n === 37 ? '00' : String(n), 0, 0); q.restore() })
    q.fillStyle = '#3a2516'; q.beginPath(); q.arc(0, 0, 300, 0, TAU); q.fill(); q.strokeStyle = '#d9b25a'; q.lineWidth = 6; q.beginPath(); q.arc(0, 0, 300, 0, TAU); q.stroke()
    rig.wheel = new THREE.Group(); W.add(rig.wheel)
    const disc = new THREE.Mesh(new THREE.CircleGeometry(0.44, 76), new THREE.MeshStandardMaterial({ map: texOf(c), roughness: 0.35 })); disc.rotation.x = -Math.PI / 2; disc.position.y = 0.09; rig.wheel.add(disc)
    const cone = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.16, 0.1, 16), brass); cone.position.y = 0.14; rig.wheel.add(cone)
    for (let k = 0; k < 4; k++) { const arm = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.02, 0.02), brass); arm.position.y = 0.2; arm.rotation.y = k * Math.PI / 4; rig.wheel.add(arm) }
    rig.ball = new THREE.Mesh(new THREE.SphereGeometry(0.016, 12, 8), new THREE.MeshStandardMaterial({ color: '#fbf8f0', roughness: 0.15 })); W.add(rig.ball)
    rig.layout = { x0: -0.85, x1: 1.35, z0: -0.5, z1: 0.5 }
  } else if (a.kind === 'dice') {
    rig.cup = new THREE.Mesh(new THREE.SphereGeometry(0.11, 24, 12, 0, TAU, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#c9a24a', metalness: 0.85, roughness: 0.3, side: THREE.DoubleSide })); g.add(rig.cup)
    const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.16, 0.012, 32), new THREE.MeshStandardMaterial({ color: '#e8e0c8', roughness: 0.3 })); plate.position.set(0, top + 0.006, -0.2); g.add(plate)
    const dm = dieMats(); rig.dice = [0, 1, 2].map(() => { const d = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.045, 0.045), dm); g.add(d); return d })
    rig.layout = { x0: -1.2, x1: 1.2, z0: 0.0, z1: 0.62 }
  }
  if (a.kind !== 'cashier') { rig.glass = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.026, 0.1, 16), new THREE.MeshStandardMaterial({ color: '#d08a2a', transparent: true, opacity: 0.75, roughness: 0.05, emissive: '#3a1a00' })); rig.glass.visible = false; g.add(rig.glass) }
  if (rig.layout) {
    const lay = rig.layout, kind = a.kind as 'rou' | 'dice'
    const p = new THREE.Mesh(new THREE.PlaneGeometry(lay.x1 - lay.x0, lay.z1 - lay.z0), new THREE.MeshBasicMaterial({ map: layoutTex(kind), transparent: true, depthWrite: false })); p.rotation.x = -Math.PI / 2; p.position.set((lay.x0 + lay.x1) / 2, top + 0.002, (lay.z0 + lay.z1) / 2); g.add(p)
    rig.cursor = new THREE.Mesh(new THREE.RingGeometry(0.018, 0.026, 24), new THREE.MeshBasicMaterial({ color: '#ffe680', toneMapped: false, transparent: true, opacity: 0.9, depthTest: false })); rig.cursor.rotation.x = -Math.PI / 2; rig.cursor.renderOrder = 9; g.add(rig.cursor)
  }
  return rig
}
function disposeRig(rig: Rig) {
  rig.restore(); rig.g.parent?.remove(rig.g)
  rig.g.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh && m.geometry !== CHIP_G) m.geometry.dispose() })
}

const tmpV = new THREE.Vector3(), tmpD = new THREE.Vector3(), tmpQ = new THREE.Quaternion()
const ease = (u: number) => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u))

/** 每帧（renderer：casinoScene.update 之后） */
export function syncCasinoTables(scene: THREE.Group, eng: Engine, camera: THREE.Camera) {
  const v = C.casinoSeatView(eng)
  let rig = RIGS.get(scene)
  if (!v) { if (rig) { disposeRig(rig); RIGS.delete(scene) } casinoAimCell = null; return }
  if (rig && (rig.kind !== v.seat.a.kind || Math.hypot(rig.g.position.x - v.seat.a.px, rig.g.position.z - v.seat.a.py) > 0.01)) { disposeRig(rig); rig = undefined }
  if (!rig) { rig = buildRig(scene, v.seat.a); RIGS.set(scene, rig) }
  const show = v.show, t = show?.t ?? 0, m = v.menu, top = rig.top
  let n = 0
  // ---- 玩家面前的筹码堆（实体数量 = 余额拆面额）
  const mine = C.casinoShownChips(eng)
  const mx = rig.kind === 'slot' ? 0.12 : 0.32, mz = rig.kind === 'slot' ? 0.3 : rig.kind === 'cashier' ? 0 : 0.5
  if (rig.kind !== 'cashier') n = rig.chips.set(mine, mx, top + (rig.kind === 'slot' ? 0.02 : 0), mz, n)
  // ---- 下注筹码（下注圈 / 准星格）→ 输：滑向庄家收走；赢：庄家推来赔付
  const betAt = (bet: number, ret: number, end: number, x: number, z: number) => {
    const k = ease((t - (end - 0.9)) / 0.7)
    if (t < end) {
      if (ret > 0) { n = rig!.chips.set(bet, x, top, z, n); if (k > 0) n = rig!.chips.set(ret - bet > 0 ? ret - bet : 0, x + 0.05, top, z - 0.6 * (1 - k), n) }
      else n = rig!.chips.set(bet, x, top, z - 0.6 * k, n)
    }
  }
  if (rig.kind === 'slot' && rig.reels && rig.lever && rig.led && rig.lamps && rig.coins) {
    const s = show?.s.kind === 'slot' ? show.s : null
    rig.reels.forEach((r, i) => { (r.parent as THREE.Group).rotation.x = s ? SH.reelAngle(s, i, t) : (C.casinoSave(eng).plays ? (r.parent as THREE.Group).rotation.x : 0) })
    rig.lever.rotation.x = s ? SH.leverPull(t) * 1.05 : 0
    const won = !!s && SH.slotStopped(s, t) && s.win > 0
    rig.lamps.color.set(won ? (Math.floor(t * 8) % 2 ? '#ffe040' : '#ff3060') : '#402010')
    drawLed(rig.led, `CR ${String(C.casinoSave(eng).chips).padStart(4)}  BET ${m?.bet ?? 0}  WIN ${s && SH.slotStopped(s, t) ? s.win : 0}`, won ? '#ffe040' : '#ff3a28')
    const coins = s ? SH.slotCoins(s, t) : 0, M = new THREE.Matrix4(), e = new THREE.Euler()
    for (let i = 0; i < coins; i++) { const age = t - SH.SLOT_T.stop[2] - (s!.near ? SH.SLOT_T.near : 0) - i * SH.SLOT_T.coinGap, fall = Math.min(1, age / 0.25); const jx = Math.sin(i * 12.9) * 0.15, jz = Math.cos(i * 7.3) * 0.04; M.compose(tmpV.set(jx * fall, 0.9 - (0.9 - 0.825 - (i % 5) * 0.004) * fall * fall, 0.245 + (0.055 + jz) * fall), tmpQ.setFromEuler(e.set(Math.sin(i) * 0.4 * fall + (1 - fall) * 1.4, 0, 0)), tmpV.clone().set(1, 1, 1)); rig.coins.setMatrixAt(i, M) }
    rig.coins.count = coins; rig.coins.instanceMatrix.needsUpdate = true
    if (s && t < s.end) n = rig.chips.set(s.bet, -0.18, top + 0.02, 0.3, n)
  } else if ((rig.kind === 'bj' || rig.kind === 'beast') && rig.cards) {
    const list = v.deal
    while (rig.cards.length < list.length) { const cg = new THREE.Group(); const f = new THREE.Mesh(new THREE.PlaneGeometry(0.063, 0.088), cardMat(null)); f.rotation.x = -Math.PI / 2; f.position.y = 0.0004; cg.add(f); const b = new THREE.Mesh(new THREE.PlaneGeometry(0.063, 0.088), cardMat(null)); b.rotation.x = Math.PI / 2; b.position.y = -0.0004; cg.add(b); rig.g.add(cg); rig.cards.push(cg) }
    while (rig.cards.length > list.length) { const cg = rig.cards.pop()!; rig.g.remove(cg) }
    list.forEach((c, i) => {
      const cg = rig!.cards![i], st = SH.cardAt(c, v.clock), face = cg.children[0] as THREE.Mesh
      face.material = cardMat(c.c)
      cg.visible = st.shown; cg.position.set(st.p[0], top - 0.86 + st.p[1], st.p[2] + (c.who === 'd' && rig!.kind === 'beast' ? -0.08 : 0)); cg.rotation.set(0, c.who === 'd' ? Math.PI : 0, Math.PI - st.flip)
    })
    const bj = m?.bj
    if (bj) { const last = list.length ? Math.max(...list.map((c) => c.t0)) + SH.DEAL_T.slide + SH.DEAL_T.flip : 0; const end = bj.done ? last + 1.4 : Infinity; const tt = v.clock; const k = bj.done ? ease((tt - (end - 0.9)) / 0.7) : 0
      if (!bj.done || tt < end) { n = rig.chips.set(bj.bet, 0, top, 0.36 - (bj.payout === 0 ? 0.6 * k : 0), n); if (bj.payout > bj.bet && k > 0) n = rig.chips.set(bj.payout - bj.bet, 0.05, top, 0.36 - 0.6 * (1 - k), n) } }
  } else if (rig.kind === 'rou' && rig.wheel && rig.ball) {
    const s = show?.s.kind === 'rou' ? show.s : null
    const w = s ? SH.wheelAngle(s, t) : rig.wheel.rotation.y + 0.004
    rig.wheel.rotation.y = w
    const rel = s ? SH.ballRel(s, t) : 0, R = s ? SH.ballRadius(t) : SH.ROU_T.rimR, a2 = w + rel
    rig.ball.position.set(Math.cos(a2) * R, 0.115 + (s ? SH.ballHop(t) : 0) + (R > 0.36 ? 0.012 : 0), -Math.sin(a2) * R)
    if (s) { const lay = rig.layout!; const p = cellPos(lay, s.betKind, s.pick, 'rou'); betAt(s.bet, s.ret, s.end, p[0], p[1]) }
  } else if (rig.kind === 'dice' && rig.cup && rig.dice) {
    const s = show?.s.kind === 'dice' ? show.s : null
    const cp = SH.cupAt(s ? t : 99)
    rig.cup.position.set(cp.shake * 0.04, top + 0.006 + (s ? cp.lift : 0.32) + Math.abs(cp.shake) * 0.03, -0.2); rig.cup.rotation.set(Math.PI, 0, cp.shake * 0.25)
    rig.dice.forEach((d, i) => { d.visible = !!s; if (!s) return; const q = SH.dieAt(s, i, t); d.quaternion.set(q[0], q[1], q[2], q[3]); d.position.set(s.pos[i][0], top + 0.012 + 0.0225, -0.2 + s.pos[i][1]) })
    if (s) { const p = cellPos(rig.layout!, s.betKind, s.pick, 'dice'); betAt(s.bet, s.ret, s.end, p[0], p[1]) }
  }
  // 侍应送到桌边的酒：落在玩家右手边台面；喝的时候举到嘴边
  if (rig.glass) {
    rig.glass.visible = v.glass > 0 || v.drinkT > 0
    if (v.drinkT > 0) { const u = 1 - v.drinkT / 1.6; camera.getWorldPosition(tmpV); rig.g.worldToLocal(tmpV); tmpD.set(0.45, top + 0.06, rig.kind === 'slot' ? 0.4 : 0.55); rig.glass.position.lerpVectors(tmpD, tmpV.add(new THREE.Vector3(0.05, -0.12, -0.12)), Math.sin(u * Math.PI)) }
    else rig.glass.position.set(0.45, top + 0.05, rig.kind === 'slot' ? 0.4 : 0.55)
  }
  rig.chips.done(n)
  // ---- 准星落点（轮盘 / 骰宝下注区）
  casinoAimCell = null
  if (rig.layout && rig.cursor) {
    camera.getWorldPosition(tmpV); camera.getWorldDirection(tmpD)
    const o = rig.g.worldToLocal(tmpV.clone()), dir = tmpD.clone().transformDirection(new THREE.Matrix4().copy(rig.g.matrixWorld).invert())
    const tt = dir.y < -1e-3 ? (top - o.y) / dir.y : -1
    rig.cursor.visible = false
    if (tt > 0) {
      const hx = o.x + dir.x * tt, hz = o.z + dir.z * tt, lay = rig.layout
      const u = (hx - lay.x0) / (lay.x1 - lay.x0) * 2 - 1, vv = (hz - lay.z0) / (lay.z1 - lay.z0) * 2 - 1
      const cell = rig.kind === 'rou' ? SH.rouCell(u, vv) : SH.diceCell(u, vv)
      if (cell) { casinoAimCell = cell; rig.cursor.visible = true; rig.cursor.position.set(hx, top + 0.004, hz) }
    }
  }
}
/** 下注格中心（桌局部 x, z） */
function cellPos(lay: NonNullable<Rig['layout']>, kind: string, pick: number, game: 'rou' | 'dice'): [number, number] {
  let u = 0, v = 0
  if (game === 'rou') {
    if (kind === 'num') { if (pick === 0 || pick === 37) { u = -0.93; v = pick === 37 ? -0.63 : 0.09 } else { const col = Math.floor((pick - 1) / 3), row = 3 - ((pick - 1) % 3 + 1); u = -0.86 + (col + 0.5) * 1.86 / 12; v = -1 + (row + 0.5) * 1.45 / 3 } }
    else { u = -0.75 + ['red', 'black', 'odd', 'even'].indexOf(kind) * 0.5; v = 0.72 }
  } else {
    if (kind === 'num') { u = -1 + (pick - 0.5) / 3; v = 0.5 } else { u = -0.75 + ['small', 'odd', 'even', 'big'].indexOf(kind) * 0.5; v = -0.5 }
  }
  return [lay.x0 + (u + 1) / 2 * (lay.x1 - lay.x0), lay.z0 + (v + 1) / 2 * (lay.z1 - lay.z0)]
}
export function disposeCasinoTables(scene: THREE.Group) { const r = RIGS.get(scene); if (r) { disposeRig(r); RIGS.delete(scene) } }
