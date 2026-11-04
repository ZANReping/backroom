// [l5items v2] O666 命运之骰的世界内 3D 表现：读 objSave(eng).anim（rollFateDie 写入，瞬态不存档），
// 用 fateDieSim 预先算好整段刚体轨迹（地面 + 附近墙体平面），逐帧采样；停下后结果面浮现图案（显现动画）。
//   flat：停稳 → 图案 0.9 s 浮现（墨迹由中心晕开 + 微光）→ 停留 5 s → 淡出（回到手里）
//   edge：停在棱上精确平衡，两侧面各浮现一半淡淡的棱纹；o.die 清除（有人靠近）后 0.45 s 倒下
//   spin：落地后原地加速高速旋转（嗡鸣由 audio 层按 spinRate 驱动，若可用）；5 min 满 → 浮现「枪」→ 从棱上裂成两半
import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import type { Engine } from '../engine'
import { tileAt } from '../world/mapgen'
import { simulateDieThrow, dieWallPlanes, samplePose, spinAngle, spinRate, snapFlat, qslerp, RESULT_FACE, FACE_AXES, dieHumTarget, type DieThrow, type DiePlane, type Q, type V } from '../engine/fateDieSim'
import { O666T, liveDieAnim, winOrigin, type O666Face } from '../engine/l5Objects'
import { audio } from '../core/audio'
import { FateDieHum } from '../core/fateDieHum'
import { pbrSet, pbrMaterial, canvas, tex, rng, type Ctx } from './pbrCanvas'

export const DIE_HALF = .03
const ICON_INK = '#2a1a14'
/** 结果图标（白骰面上浮现的「点数」）：宝箱 / 心 / 门 / 枪 / 乌贼 / 旅馆 / 赌徒 / 空白（向下的楼梯，极淡）/ 棱（无） */
export function drawDieIcon(x: Ctx, face: O666Face, s: number) {
  x.save(); x.translate(s / 2, s / 2); x.scale(s / 256, s / 256)
  x.strokeStyle = ICON_INK; x.fillStyle = ICON_INK; x.lineWidth = 9; x.lineCap = 'round'; x.lineJoin = 'round'
  const P = (pts: number[][], close = false, fill = false) => { x.beginPath(); pts.forEach(([a, b], i) => (i ? x.lineTo(a, b) : x.moveTo(a, b))); if (close) x.closePath(); if (fill) x.fill(); else x.stroke() }
  switch (face) {
    case 'rare': // 宝箱
      x.strokeRect(-62, -10, 124, 70); x.beginPath(); x.moveTo(-62, -10); x.quadraticCurveTo(0, -78, 62, -10); x.stroke()
      x.fillRect(-12, -18, 24, 30); P([[-62, 22], [62, 22]]); break
    case 'sanity': // 心
      x.beginPath(); x.moveTo(0, 62); x.bezierCurveTo(-90, 0, -60, -74, 0, -30); x.bezierCurveTo(60, -74, 90, 0, 0, 62); x.fill(); break
    case 'teleport': // 门
      x.strokeRect(-42, -72, 84, 144); x.fillRect(-30, -60, 60, 120); x.fillStyle = '#f7f4ec'; x.beginPath(); x.arc(18, 6, 6, 0, Math.PI * 2); x.fill(); break
    case 'weapon': // 枪（霰弹枪侧影）
      P([[-96, 6], [40, 6], [40, -10], [96, -10], [96, 2], [40, 2]], false); x.fillRect(-96, -4, 136, 14); x.fillRect(-100, 6, 34, 36); P([[-10, 10], [-4, 34]]); break
    case 'squid': // 乌贼
      x.beginPath(); x.moveTo(0, -84); x.quadraticCurveTo(46, -40, 34, 16); x.lineTo(-34, 16); x.quadraticCurveTo(-46, -40, 0, -84); x.fill()
      for (let i = -3; i <= 3; i++) { x.beginPath(); x.moveTo(i * 10, 16); x.quadraticCurveTo(i * 14 + (i % 2 ? 12 : -12), 50, i * 18, 84); x.stroke() }
      x.fillStyle = '#f7f4ec'; x.beginPath(); x.arc(-13, -4, 7, 0, Math.PI * 2); x.arc(13, -4, 7, 0, Math.PI * 2); x.fill(); break
    case 'hotel': // 旅馆：门廊 + 窗格 + 屋顶旗
      x.strokeRect(-66, -40, 132, 104); P([[-78, -40], [0, -86], [78, -40]]); for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) x.fillRect(-50 + i * 38, -24 + j * 30, 22, 18); x.fillRect(-14, 30, 28, 34); break
    case 'gambler': // 赌徒：礼帽 + 两张牌
      x.fillRect(-46, -80, 92, 54); x.fillRect(-78, -30, 156, 12)
      x.save(); x.rotate(-.25); x.strokeRect(-56, 2, 52, 74); x.restore(); x.save(); x.rotate(.25); x.strokeRect(4, 2, 52, 74); x.restore()
      x.font = 'bold 40px serif'; x.textAlign = 'center'; x.fillText('♠', -18, 56); break
    case 'blank': // 空白：只有极淡的一段向下的楼梯
      x.globalAlpha = .18; for (let i = 0; i < 5; i++) P([[-60 + i * 24, -50 + i * 24], [-36 + i * 24, -50 + i * 24], [-36 + i * 24, -26 + i * 24]]); break
    case 'edge': break
  }
  x.restore()
}
const iconTex = new Map<string, THREE.CanvasTexture>()
function iconTexture(face: O666Face) {
  let t = iconTex.get(face)
  if (!t) { const c = canvas(256); drawDieIcon(c.getContext('2d')!, face, 256); t = tex(c, true, 'die-icon-' + face); iconTex.set(face, t) }
  return t
}
/** 微瓷 / 树脂白：温白底 + 极细斑驳，粗糙度略低；法线是细密橘皮 */
export function dieSet(cracked = false) {
  const crack = (x: Ctx, s: number, col: string, w: number) => { x.strokeStyle = col; x.lineWidth = w; x.beginPath(); x.moveTo(s * .08, s * .16); x.lineTo(s * .34, s * .41); x.lineTo(s * .45, s * .38); x.lineTo(s * .62, s * .6); x.lineTo(s * .58, s * .66); x.lineTo(s * .9, s * .93); x.moveTo(s * .45, s * .38); x.lineTo(s * .52, s * .18); x.moveTo(s * .62, s * .6); x.lineTo(s * .8, s * .55); x.stroke() }
  return pbrSet('fatedie-' + (cracked ? 'cracked' : 'whole'), {
    size: 256, normalStrength: 1.4,
    color: (x, s) => {
      const R = rng(66), g = x.createRadialGradient(s / 2, s / 2, s * .1, s / 2, s / 2, s * .75); g.addColorStop(0, '#fbfaf5'); g.addColorStop(1, '#ebe6da'); x.fillStyle = g; x.fillRect(0, 0, s, s)
      for (let i = 0; i < 1500; i++) { x.fillStyle = `rgba(160,150,130,${R() * .04})`; x.fillRect(R() * s, R() * s, 2, 2) }
      if (cracked) { crack(x, s, 'rgba(120,110,95,.5)', 6); crack(x, s, '#3a342e', 2.2) }
    },
    height: (x, s) => { const R = rng(67); x.fillStyle = '#808080'; x.fillRect(0, 0, s, s); for (let i = 0; i < 2500; i++) { x.fillStyle = R() < .5 ? 'rgba(0,0,0,.08)' : 'rgba(255,255,255,.08)'; x.beginPath(); x.arc(R() * s, R() * s, 1 + R() * 2, 0, Math.PI * 2); x.fill() } if (cracked) crack(x, s, '#000', 3) },
    rough: (x, s) => { x.fillStyle = '#4c4c4c'; x.fillRect(0, 0, s, s); if (cracked) crack(x, s, '#ffffff', 4) },
  })
}
let dieMat: THREE.Material | null = null, dieMatCr: THREE.Material | null = null
export function dieMaterial(cracked = false) {
  if (cracked) return (dieMatCr ??= pbrMaterial(dieSet(true), .3, 0, { emissive: '#14110d' }))
  return (dieMat ??= pbrMaterial(dieSet(false), .28, 0, { emissive: '#1a1611' })) // 暗处微微透出的温光：近似次表面
}
/** 命运之骰（世界内投掷用，边长 2h）；faceIcon 平面贴在 RESULT_FACE 那一面外 0.4 mm */
export function buildThrownDie(half = DIE_HALF) {
  const root = new THREE.Group(); root.name = 'fatedie-thrown'
  const body = new THREE.Mesh(new RoundedBoxGeometry(half * 2, half * 2, half * 2, 4, half * .24), dieMaterial()); root.add(body)
  const decal = new THREE.Mesh(new THREE.PlaneGeometry(half * 1.6, half * 1.6), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }))
  decal.visible = false; root.add(decal)
  // 裂开：两半（沿对角棱）
  const halves = new THREE.Group(); halves.visible = false; root.add(halves)
  for (const s of [-1, 1]) { const m = new THREE.Mesh(new RoundedBoxGeometry(half * 2, half, half * 2, 3, half * .2), dieMaterial(true)); m.position.y = s * half / 2; m.userData.side = s; halves.add(m) }
  root.userData = { body, decal, halves, half }
  return root
}
/** 把图标平面放到局部面 f 上（朝外） */
function placeDecal(decal: THREE.Mesh, f: number, half: number) {
  const ax = new THREE.Vector3(...FACE_AXES[f])
  decal.position.copy(ax).multiplyScalar(half + .0004)
  decal.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), ax)
}

export function wallPlanes(eng: Engine, x: number, y: number): DiePlane[] { const m = eng.map; return m ? dieWallPlanes((tx, ty) => tileAt(m, tx, ty) === 1, x, y) : [] }
export function modeOf(face: O666Face) { return face === 'edge' ? 'edge' as const : face === 'weapon' ? 'spin' as const : 'flat' as const }

/** 某一时刻骰子的完整视觉状态（纯函数，无头可测） */
export function dieVisual(sim: DieThrow, _face: O666Face, t: number, st: { dieAlive: boolean; endT?: number }) {
  const settle = sim.settleT
  const base = samplePose(sim, Math.min(t, settle))
  let q: Q = base.q, p = base.p, reveal = 0, crack = 0, fade = 0, spin = 0
  if (sim.mode === 'flat') { reveal = Math.max(0, Math.min(1, (t - settle) / .9)); fade = Math.max(0, Math.min(1, (t - settle - 5.9) / .5)) }
  else if (sim.mode === 'spin') {
    const ts = t - settle, total = O666T.spin
    if (ts > 0) { spin = spinRate(ts, total); const a = spinAngle(ts, total); const qy: Q = [0, Math.sin(a / 2), 0, Math.cos(a / 2)]; q = mulQ(qy, base.q) }
    if (ts >= total) { reveal = Math.min(1, (ts - total) / .6); crack = Math.max(0, Math.min(1, (ts - total - .8) / .5)) }
    if (!st.dieAlive && st.endT !== undefined && st.endT - settle < total - 1) fade = Math.max(0, Math.min(1, (t - st.endT) / .5)) // 离开房间作废：倒下空白
    if (ts >= total) fade = Math.max(0, Math.min(1, (ts - total - 6) / .5))
  } else {
    if (!st.dieAlive && st.endT !== undefined) { const k = Math.max(0, Math.min(1, (t - st.endT) / .45)); q = qslerp(base.q, snapFlat(rotTip(base.q)), k * k); p = [p[0], DIE_HALF + (base.p[1] - DIE_HALF) * (1 - k * k), p[2]]; fade = Math.max(0, Math.min(1, (t - st.endT - 3) / .5)) }
  }
  return { p, q, reveal, crack, fade, spin, settled: t >= settle }
}
const mulQ = (a: Q, b: Q): Q => [a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1], a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0], a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3], a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2]]
function rotTip(q: Q): Q { const s = Math.sin(.12), c = Math.cos(.12); return mulQ([s, 0, 0, c], q) } // 轻推一下决定倒向

/** 松手衔接：渲染手中骰子与逻辑出手点的偏差（视角惯性 / 走路摆动 / 松手前转身），出手后 0.2 s 内线性收回到 0 */
export function releaseBlend(off: V, t: number): V { const k = Math.max(0, 1 - t / .2); return [off[0] * k, off[1] * k, off[2] * k] }

export class FateDieFx {
  readonly group = new THREE.Group()
  private die = buildThrownDie()
  private key = -1
  private sim: DieThrow | null = null
  private face: O666Face = 'blank'
  private endT: number | undefined
  private relOff: V | null = null
  private hum: FateDieHum | null = null
  private cracked = false
  /** 骰子已出手（在空中 / 地上）：手里的骰子模型隐藏 */
  hidesHeld = false
  /** 最近一帧的世界位置（场景坐标，调试 / 截图） */
  readonly world = new THREE.Vector3()
  constructor(scene: THREE.Scene) { this.group.name = 'fatedie-fx'; this.group.visible = false; this.group.add(this.die); scene.add(this.group) }
  /** hand = 渲染层第一人称手中骰子的世界位置（挥臂期间每帧给）；ear = 听者（相机）位置 */
  update(eng: Engine, hand?: THREE.Vector3 | null, ear?: THREE.Vector3 | null) {
    const o = (eng.hotel as unknown as { objs?: { die?: unknown; pend?: unknown } } | undefined)?.objs
    const a = liveDieAnim(eng)
    if (!a || eng.time - a.t0 < a.rel) { this.group.visible = false; this.hidesHeld = false; this.humUpdate(0, 1, 99); if (!a) this.key = -1; return }
    if (a.t0 !== this.key) {
      this.key = a.t0; this.face = a.face; this.endT = undefined; this.relOff = null; this.cracked = false
      this.sim = simulateDieThrow({ seed: a.seed, topFace: RESULT_FACE[a.face], mode: modeOf(a.face), yaw: a.yaw, from: a.from, half: DIE_HALF, walls: a.walls })
      const { decal } = this.die.userData as { decal: THREE.Mesh }
      const mat = decal.material as THREE.MeshBasicMaterial; mat.map = iconTexture(a.face === 'weapon' ? 'weapon' : a.face); mat.needsUpdate = true
      placeDecal(decal, RESULT_FACE[a.face], DIE_HALF)
    }
    const sim = this.sim!, t = eng.time - a.t0 - a.rel, { ox, oy } = winOrigin(eng)
    const bx = a.x - ox, bz = a.y - oy // 世界坐标 → 当前窗口（原点平移后照样对齐）
    if (!this.relOff) this.relOff = hand ? [hand.x - (bx + a.from[0]), hand.y - a.from[1], hand.z - (bz + a.from[2])] : [0, 0, 0]
    const alive = !!o?.die || !!o?.pend
    if (!alive && this.endT === undefined && sim.mode !== 'flat' && t > sim.settleT) this.endT = t
    const v = dieVisual(sim, this.face, t, { dieAlive: alive || t <= sim.settleT, endT: this.endT })
    const off = releaseBlend(this.relOff, t)
    this.group.visible = v.fade < 1
    this.hidesHeld = v.fade < 1
    this.group.position.set(bx + v.p[0] + off[0], v.p[1] + off[1], bz + v.p[2] + off[2])
    this.world.copy(this.group.position)
    this.die.quaternion.set(v.q[0], v.q[1], v.q[2], v.q[3])
    const { body, decal, halves } = this.die.userData as { body: THREE.Mesh; decal: THREE.Mesh; halves: THREE.Group }
    const dm = decal.material as THREE.MeshBasicMaterial
    decal.visible = v.reveal > 0 && this.face !== 'edge'
    dm.opacity = (1 - v.fade) * (v.reveal < 1 ? v.reveal * v.reveal * (3 - 2 * v.reveal) : 1)
    decal.scale.setScalar(.55 + .45 * Math.min(1, v.reveal * 1.4))
    body.visible = v.crack <= 0; halves.visible = v.crack > 0
    halves.children.forEach((h) => { const s = h.userData.side as number; h.position.set(s * v.crack * .012, s * DIE_HALF / 2 + v.crack * .004 * s, 0); h.rotation.z = s * v.crack * .5 })
    this.die.scale.setScalar(1 - v.fade * .6)
    const dist = ear ? ear.distanceTo(this.group.position) : 2
    this.humUpdate(v.spin, v.fade, dist)
    if (v.crack > 0 && !this.cracked) { this.cracked = true; this.humNode()?.crack(dist) }
  }
  private humNode() { if (!this.hum) { const n = audio.fxNodes(); if (n) this.hum = new FateDieHum(n.ctx, n.sfx) } return this.hum }
  private humUpdate(spin: number, fade: number, dist: number) { const tg = dieHumTarget(spin, fade, dist); if (tg.on || this.hum?.running) this.humNode()?.update(tg) }
}
