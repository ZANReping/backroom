// [thing] 七层之物（Entity 20）动画——阶段 2。
// 8 个片段：drift 休眠漂流（装死） / cruise 缓游 / circle 盘旋 / dash 冲刺 / bite 扑咬 /
//           flinch 畏光收鳃偏头 / flee 惊逃甩身 / glitch 故障抖动（也作为常驻低频叠加）。
// 躯干是一条世界空间的跟随链：每节追随前一节、保持节距 THING.spacing；在链的切线法向上叠加
// 一列从头往后传的游动波（鳗形 anguilliform：振幅随离头距离增大）。头部的颌、鳃、颏须饵球、眼按片段驱动。
// grp 只做平移 + 绕 Y 旋转（与渲染器其余实体一致），本模块把每节的世界位姿换算回 grp 局部。
import * as THREE from 'three'
import { THING } from './thingMesh'

export type ThingClip = 'drift' | 'cruise' | 'circle' | 'dash' | 'bite' | 'flinch' | 'flee' | 'glitch'
export const THING_CLIPS: readonly ThingClip[] = ['drift', 'cruise', 'circle', 'dash', 'bite', 'flinch', 'flee', 'glitch']
/** 一次性片段的时长（秒）；其余循环 */
export const THING_CLIP_LEN: Partial<Record<ThingClip, number>> = { bite: 1.6, flinch: 1.8, flee: 2.4 }

interface ClipParams {
  /** 侧向游动波振幅（米，尾端） */ amp: number
  /** 波速（弧度/秒） */ freq: number
  /** 相邻两节相位差（弧度） */ k: number
  /** 竖直起伏振幅（米） */ vamp: number
  /** 链跟随速度（越大越紧） */ follow: number
  /** 鳃开合频率（弧度/秒）与张度 */ gillRate: number; gill: number
  /** 静息张口 */ gape: number
  /** 饵球亮度 */ lure: number
  /** 故障强度 */ glitch: number
}
const P: Record<ThingClip, ClipParams> = {
  drift: { amp: 0.22, freq: 0.32, k: 0.28, vamp: 0.35, follow: 0.9, gillRate: 0.5, gill: 0.15, gape: 0.1, lure: 0.35, glitch: 0.08 },
  cruise: { amp: 1.35, freq: 1.15, k: 0.42, vamp: 0.18, follow: 2.2, gillRate: 1.3, gill: 0.35, gape: 0.06, lure: 0.8, glitch: 0.1 },
  circle: { amp: 0.75, freq: 1.0, k: 0.4, vamp: 0.15, follow: 2.0, gillRate: 1.4, gill: 0.45, gape: 0.14, lure: 1, glitch: 0.12 },
  dash: { amp: 1.7, freq: 2.9, k: 0.5, vamp: 0.12, follow: 4.2, gillRate: 3.4, gill: 0.85, gape: 0.25, lure: 1, glitch: 0.15 },
  bite: { amp: 1.1, freq: 2.2, k: 0.48, vamp: 0.1, follow: 3.6, gillRate: 3, gill: 0.9, gape: 0, lure: 1, glitch: 0.15 },
  flinch: { amp: 0.6, freq: 1.4, k: 0.45, vamp: 0.2, follow: 3, gillRate: 0, gill: 0, gape: 0, lure: 0.1, glitch: 0.35 },
  flee: { amp: 2.6, freq: 3.6, k: 0.55, vamp: 0.3, follow: 4.8, gillRate: 4, gill: 0.7, gape: 0.35, lure: 0.2, glitch: 0.25 },
  glitch: { amp: 1.2, freq: 1.1, k: 0.42, vamp: 0.18, follow: 2.2, gillRate: 1.3, gill: 0.35, gape: 0.06, lure: 0.7, glitch: 1 },
}

interface Node { x: number; y: number; z: number }
export interface ThingAnimState {
  chain: Node[] | null
  /** 当前片段与它开始的时刻（一次性片段按此求进度） */
  clip: ThingClip
  clipT0: number
  /** 平滑后的参数（片段切换时插值，避免跳变） */
  cur: ClipParams
  phase: number
  originX?: number; originY?: number
}
export function makeThingAnimState(): ThingAnimState {
  return { chain: null, clip: 'cruise', clipT0: 0, cur: { ...P.cruise }, phase: 0 }
}

/** 所有「米」制幅度都按模型的世界缩放放大（参数表按单位空间写） */
const SC = THING.S
const h = (n: number) => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s) }
const sstep = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t) }
const _q = new THREE.Quaternion(), _v = new THREE.Vector3(), _X = new THREE.Vector3(1, 0, 0), _qy = new THREE.Quaternion(), _Y = new THREE.Vector3(0, 1, 0)

export interface ThingAnimInput {
  t: number
  originX?: number; originY?: number
  dt: number
  clip: ThingClip
  /** 外部强光刺激 0..1（叠加在任意片段上：收鳃、偏头、闭口） */
  recoil?: number
  /** 一次性片段的进度覆盖（0..1）。不给就按 clipT0 计时 */
  progress?: number
}

/** 推进一帧。grp 的 position / rotation.y 由调用方先摆好（头在 grp 原点、朝 +X）。 */
export function animateThing(grp: THREE.Group, st: ThingAnimState, inp: ThingAnimInput): void {
  const parts = grp.userData.parts as Record<string, THREE.Object3D>
  const { t, dt } = inp
  const ox = inp.originX ?? 0, oy = inp.originY ?? 0
  if (st.chain && st.originX !== undefined && st.originY !== undefined) {
    const dx = ox - st.originX, dy = oy - st.originY
    if (dx || dy) for (const n of st.chain) { n.x -= dx; n.z -= dy }
  }
  st.originX = ox; st.originY = oy
  if (inp.clip !== st.clip) { st.clip = inp.clip; st.clipT0 = t }
  const tgt = P[st.clip]
  const blend = Math.min(1, dt * 2.5)
  for (const k of Object.keys(tgt) as (keyof ClipParams)[]) st.cur[k] += (tgt[k] - st.cur[k]) * blend
  const c = st.cur
  st.phase += c.freq * dt * 0.7 // 体长两百多米，游动波比小鱼慢
  const len = THING_CLIP_LEN[st.clip]
  const prog = inp.progress ?? (len ? Math.min(1, (t - st.clipT0) / len) : 0)
  const recoil = Math.max(inp.recoil ?? 0, st.clip === 'flinch' ? Math.sin(Math.min(1, prog * 1.6) * Math.PI) ** 0.6 : 0)

  // ---------- 头部 ----------
  let gape = c.gape + Math.max(0, Math.sin(t * 0.37)) ** 6 * 0.08 // 偶尔无意识地张一下
  let headYaw = Math.sin(t * 0.29) * 0.05, headPitch = Math.sin(t * 0.21) * 0.03, lunge = 0
  if (st.clip === 'bite') {
    // 0~0.38 慢慢张到最大（头微抬）→ 0.38~0.5 猛扑合口（头前冲 2.4m）→ 之后回收
    const open = sstep(0, 0.38, prog) * (1 - sstep(0.4, 0.5, prog))
    gape = Math.max(gape, open * 1.0)
    headPitch += open * 0.16 - sstep(0.38, 0.5, prog) * (1 - sstep(0.55, 0.95, prog)) * 0.12
    lunge = sstep(0.36, 0.5, prog) * (1 - sstep(0.55, 1, prog)) * 2.4 * SC
  }
  if (st.clip === 'flee') { gape = Math.max(gape, 0.35 * (1 - prog)); headYaw += Math.sin(t * 7) * 0.12 * (1 - prog) }
  // 畏光：头偏开、下压，闭口、鳃收紧、饵球熄灭
  headYaw += recoil * 0.55; headPitch -= recoil * 0.18; gape *= 1 - recoil
  if (parts.head) parts.head.rotation.set(0, headYaw, headPitch)
  if (parts.jaw) parts.jaw.rotation.z = -gape * 1.08
  const gillOpen = (c.gill * (0.5 + 0.5 * Math.sin(t * c.gillRate))) * (1 - recoil)
  if (parts.gillL) parts.gillL.rotation.x = -gillOpen * 0.55
  if (parts.gillR) parts.gillR.rotation.x = gillOpen * 0.55
  const lm = grp.userData.thingLureMat as THREE.MeshStandardMaterial | undefined
  if (lm) lm.emissiveIntensity = (0.15 + c.lure * (0.6 + 0.6 * Math.max(0, Math.sin(t * 0.8)) ** 3)) * (1 - recoil * 0.9)
  const pm = grp.userData.eyeMats as THREE.MeshStandardMaterial[] | undefined
  if (pm) for (const m of pm) m.emissiveIntensity = (0.22 + 0.12 * Math.sin(t * 0.6)) * (1 - recoil * 0.7)

  // ---------- 躯干跟随链 ----------
  const n = THING.segs, sp = THING.spacing
  const ry = grp.rotation.y, cs = Math.cos(ry), sn = Math.sin(ry)
  // 头部 +X 方向的世界向量（three：rotation.y=ry 时局部 +X → (cos ry, 0, -sin ry)）
  const fx = cs, fz = -sn
  // 扑咬前冲：整条链的锚点跟着头一起前冲（头不与颈部脱开）
  if (parts.head) parts.head.position.set(lunge, 0, 0)
  const hx = grp.position.x + fx * (lunge - 0.3 * SC), hy = grp.position.y, hz = grp.position.z + fz * (lunge - 0.3 * SC)
  if (!st.chain) st.chain = Array.from({ length: n + 1 }, (_, i) => ({ x: hx - fx * sp * i, y: hy, z: hz - fz * sp * i }))
  const ch = st.chain
  ch[0].x = hx; ch[0].y = hy; ch[0].z = hz
  for (let i = 1; i <= n; i++) {
    const a = ch[i - 1], b = ch[i]
    // 先松弛地向前一节靠拢（后段更懒），再硬约束节距
    const lag = Math.min(1, dt * c.follow * (1 - i / (n + 6)))
    b.y += (a.y - b.y) * lag * 0.6
    let dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z
    const d = Math.hypot(dx, dy, dz) || 1
    dx /= d; dy /= d; dz /= d
    b.x = a.x + dx * sp; b.y = a.y + dy * sp; b.z = a.z + dz * sp
  }
  // 故障：常驻低频，偶尔一节「跳帧」——位置瞬间错开再弹回
  const gPulse = (i: number) => {
    const slot = Math.floor(t * (3 + c.glitch * 9) + i * 0.37)
    const on = h(slot * 13.1 + i * 7.7) < 0.04 + c.glitch * 0.22
    return on ? (h(slot + i) - 0.5) * (0.4 + c.glitch * 1.4) * SC : 0
  }
  const wpos: THREE.Vector3[] = []
  for (let i = 0; i <= n; i++) {
    const a = ch[Math.max(0, i - 1)], b = ch[Math.min(n, i + 1)]
    let tx = a.x - b.x, tz = a.z - b.z
    const tl = Math.hypot(tx, tz) || 1; tx /= tl; tz /= tl
    // 振幅：头后几节很小，越往后越大（鳗形游动）
    const u = i / n
    const env = 0.12 + 0.88 * sstep(0, 0.7, u)
    let lat = Math.sin(st.phase - i * c.k) * c.amp * env * SC
    if (st.clip === 'flee') lat += Math.sin(st.phase * 0.5 - i * 0.2) * 2.2 * SC * env * (1 - prog * 0.5) // 惊逃：整条身体甩出一个大 S
    if (st.clip === 'flinch') lat += Math.sin(Math.min(1, prog * 1.6) * Math.PI) * -1.6 * SC * (1 - u) * (u > 0.02 ? 1 : 0) // 受刺激时颈部向反侧弯
    const ver = (Math.sin(st.phase * 0.7 - i * c.k * 0.6 + 1.3) * c.vamp * env + (st.clip === 'drift' ? Math.sin(t * 0.2 + i * 0.15) * 0.6 * u : 0)) * SC
    const gj = gPulse(i)
    wpos.push(new THREE.Vector3(ch[i].x - tz * (lat + gj), ch[i].y + ver + gj * 0.4, ch[i].z + tx * (lat + gj)))
  }
  // 头本身也跟着第一节轻摆（让颈部过渡自然）
  for (let i = 0; i < n; i++) {
    const seg = parts[`seg${i}`]; if (!seg) continue
    const p0 = wpos[i], p1 = wpos[i + 1]
    // 世界 → grp 局部
    const ox = p0.x - grp.position.x, oz = p0.z - grp.position.z
    seg.position.set(ox * cs - oz * sn, p0.y - grp.position.y, ox * sn + oz * cs)
    // 体节局部 +X 指向前一节（朝头）：方向 = p0 - p1
    _v.set(p0.x - p1.x, p0.y - p1.y, p0.z - p1.z).normalize()
    // 转到 grp 局部
    const lx = _v.x * cs - _v.z * sn, lz = _v.x * sn + _v.z * cs
    _v.set(lx, _v.y, lz)
    _q.setFromUnitVectors(_X, _v)
    // 绕自身轴的缓慢翻滚（死物般的漂浮感，drift 更明显）
    _qy.setFromAxisAngle(_X, Math.sin(t * 0.3 + i * 0.25) * (0.05 + (st.clip === 'drift' ? 0.18 : 0)))
    seg.quaternion.copy(_q).multiply(_qy)
    // 故障体节：后半截的错位漂浮
    const b = parts[`seg${i}b`]
    if (b) {
      const gk = 0.35 + c.glitch * 0.9
      const jump = gPulse(i + 100) * 0.8 / SC
      b.position.set(-0.45 * gk + jump * 0.3, Math.sin(t * 1.3 + i) * 0.3 * gk + jump, Math.cos(t * 1.1 + i * 1.7) * 0.35 * gk)
      b.rotation.set(Math.sin(t * 0.9 + i) * 0.12 * gk, Math.sin(t * 0.7 + i) * 0.1 * gk, Math.cos(t * 0.8 + i) * 0.08 * gk)
    }
    // 偶发「拉伸切片」：极短的一帧体节被拉长/压扁
    const s = gPulse(i + 50)
    const s1 = s / SC // gPulse 已乘 SC，这里要的是无量纲
    seg.scale.set(SC * (1 + Math.abs(s1) * 0.25), SC * (1 - Math.abs(s1) * 0.12), SC * (1 + s1 * 0.1))
  }
  void _Y
  // 错位的鳍：随波拍动；冲刺/惊逃贴身收拢
  const tuck = sstep(1.2, 2.8, c.freq)
  for (const key of Object.keys(parts)) {
    if (key.startsWith('fin')) {
      const o = parts[key], i = Number(key.slice(3).split('_')[0])
      o.rotation.z = Math.sin(st.phase * 1.3 - i * 0.5) * 0.25 * (1 - tuck) - tuck * 0.6
    } else if (key.startsWith('gill') && key.includes('_')) {
      const o = parts[key], i = Number(key.slice(4).split('_')[0])
      const br = 1 + Math.max(0, Math.sin(t * c.gillRate - i * 0.4)) * c.gill * 0.5 * (1 - recoil)
      for (const sl of o.children) sl.scale.set(1, br, 1)
    }
  }
}
