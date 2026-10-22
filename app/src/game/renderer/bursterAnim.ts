// 爆酸者重制 阶段 2：动画。
// 全部是刚性关节组的逐帧姿势，没有蒙皮。平面两骨 IK 把手掌和后足跗关节钉在地上，躯干可以起伏和俯仰；
// 蜷缩（休眠）用 FK 预设，与 IK 姿势按 curl 插值。
// 动画片段：sleep 休眠呼吸 / wake 惊醒起身 / crawl 爬行 / chase 追击小跑 / burst 弓背、胼胝鼓胀并依次爆裂喷酸 /
// wait 喷完原地等待、歪头打量、水泡慢慢回涨 / cocoon 蜷缩并硬化成茧。
import * as THREE from 'three'
import { buildBursterCocoon, updateBlisters, type BursterRig } from './bursterMesh'

export interface BursterAnim {
  /** 片段内时间（秒），驱动步态和呼吸 */
  t: number
  /** 0 原地，1 爬行，2 小跑；可取中间值 */
  move: number
  curl: number; arch: number; jaw: number
  headYaw: number; headPitch: number; headRoll: number
  /** 喷酸进度：<0 不喷；0→1 鼓胀→依次爆裂→喷射 */
  burst: number
  /** 爆后回涨：0 刚爆完 → 1 恢复如初 */
  regrow: number
  /** 结茧：0 无 → 1 完全被茧壳包住 */
  cocoon: number
  /** 呼吸幅度（休眠时大） */
  breathe: number
}
export const BURSTER_REST: BursterAnim = { t: 0, move: 0, curl: 0, arch: 0, jaw: 0, headYaw: 0, headPitch: 0, headRoll: 0, burst: -1, regrow: 1, cocoon: 0, breathe: 0.3 }

const sst = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t) }
const lerp = (a: number, b: number, k: number) => a + (b - a) * k
const fract = (x: number) => x - Math.floor(x)

interface LegRest { p: THREE.Vector3[]; l1: number; l2: number; a1: number; a2: number; bend: number; foot: THREE.Vector3 }
interface AnimCache { legs: LegRest[]; order: number[]; seeds: number[]; spray: THREE.InstancedMesh; cocoon: THREE.Group | null }

function cache(grp: THREE.Group, rig: BursterRig): AnimCache {
  let c = grp.userData.bursterAnim as AnimCache | undefined
  if (c) return c
  const legs = rig.legs.map((L) => {
    // 各关节在躯干坐标系中的静止位置（关节组只有平移，没有旋转）
    const p: THREE.Vector3[] = []; let acc = new THREE.Vector3()
    for (const j of L.j) { acc = acc.clone().add(j.position); p.push(acc) }
    const S = p[0], E = p[1], W = p[2]
    const a1 = Math.atan2(E.y - S.y, E.x - S.x), a2 = Math.atan2(W.y - E.y, W.x - E.x)
    const cross = (E.x - S.x) * (W.y - S.y) - (E.y - S.y) * (W.x - S.x)
    return { p, l1: Math.hypot(E.x - S.x, E.y - S.y), l2: Math.hypot(W.x - E.x, W.y - E.y), a1, a2, bend: Math.sign(cross) || 1, foot: W.clone() }
  })
  // 水泡爆裂顺序与每个水泡的随机量
  const n = rig.blisters.length, seeds = rig.blisters.map((_, i) => fract(Math.sin(i * 91.7 + 3.1) * 43758.5))
  const order = seeds.map((s, i) => [s, i]).sort((a, b) => a[0] - b[0]).map((x) => x[1])
  // 酸液飞沫：每个水泡 6 滴
  const spray = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 6, 4), new THREE.MeshBasicMaterial({ color: '#c9dc48' }), n * 6)
  spray.frustumCulled = false; spray.count = 0
  rig.body.add(spray)
  c = { legs, order, seeds, spray, cocoon: null }
  grp.userData.bursterAnim = c
  return c
}

// 步态：后左→前左→后右→前右 的爬行顺序；支撑相占比随速度从 0.66 降到 0.5
const PHASE: Record<string, number> = { 'h-1': 0, 'f-1': 0.25, 'h1': 0.5, 'f1': 0.75 }
function footOffset(ph: number, stride: number, lift: number, duty: number) {
  if (ph < duty) { const u = ph / duty; return { dx: stride * (0.5 - u), dy: 0, sw: 0 } }
  const u = (ph - duty) / (1 - duty), k = sst(0, 1, u)
  return { dx: stride * (k - 0.5), dy: lift * Math.sin(Math.PI * u), sw: Math.sin(Math.PI * u) }
}

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _p = new THREE.Vector3(), _v = new THREE.Vector3()

export function animateBurster(grp: THREE.Group, a: BursterAnim) {
  const rig = grp.userData.bursterRig as BursterRig | undefined
  if (!rig) return
  const C = cache(grp, rig)
  const c = a.curl, mv = Math.max(0, a.move), run = sst(1, 2, mv), walk = Math.min(1, mv)
  const freq = lerp(1.05, 1.9, run), ph0 = a.t * freq
  const stride = walk * lerp(0.3, 0.5, run), lift = walk * lerp(0.07, 0.11, run), duty = lerp(0.66, 0.5, run)
  // ---------- 躯干：起伏、俯仰、呼吸 ----------
  const breath = Math.sin(a.t * (c > 0.5 ? 1.6 : 2.6)) * a.breathe
  const bob = walk * Math.abs(Math.sin(ph0 * Math.PI * 2)) * lerp(0.015, 0.03, run)
  const pitch = -a.arch * 0.1 + run * 0.04 // 弓背时前低后高
  const bodyY = a.arch * 0.05 - bob * 0.5 + breath * 0.006
  rig.body.position.set(0, bodyY * (1 - c), 0)
  rig.body.rotation.set(0, 0, pitch * (1 - c))
  rig.body.scale.set(1, 1 + breath * 0.025, 1 + breath * 0.035)
  const th = c * 1.48 // 侧卧翻转（与 poseBurster 一致）
  rig.root.rotation.set(th, Math.sin(ph0 * Math.PI * 2) * 0.03 * walk * (1 - c), c * 0.1)
  rig.root.position.set(c * 0.05, c * (0.17 - 0.8 * Math.cos(th)), -0.8 * Math.sin(th))
  // ---------- 四肢：IK 姿势 与 蜷缩 FK 按 curl 插值 ----------
  const cp = Math.cos(-pitch * (1 - c)), sp = Math.sin(-pitch * (1 - c)), by = bodyY * (1 - c)
  rig.legs.forEach((L, i) => {
    const R = C.legs[i], key = (L.front ? 'f' : 'h') + L.side
    const f = footOffset(fract(ph0 + PHASE[key]), stride, lift, duty)
    // 目标点：地面坐标 → 躯干坐标（去掉躯干起伏与俯仰）
    const gx = R.foot.x + f.dx + (L.front ? a.arch * 0.05 : -a.arch * 0.03), gy = R.foot.y + f.dy
    const tx = cp * gx - sp * (gy - by), ty = sp * gx + cp * (gy - by)
    const S = R.p[0], dxs = tx - S.x, dys = ty - S.y
    const d = Math.max(Math.abs(R.l1 - R.l2) + 1e-3, Math.min(R.l1 + R.l2 - 1e-3, Math.hypot(dxs, dys)))
    const axis = Math.atan2(dys, dxs), spread = Math.acos(Math.max(-1, Math.min(1, (R.l1 * R.l1 + d * d - R.l2 * R.l2) / (2 * R.l1 * d))))
    const up = axis - R.bend * spread
    const ex = S.x + Math.cos(up) * R.l1, ey = S.y + Math.sin(up) * R.l1
    const lo = Math.atan2(S.y + Math.sin(axis) * d - ey, S.x + Math.cos(axis) * d - ex)
    const r0 = up - R.a1, r1 = lo - R.a2 - r0
    // 末端：前肢手腕在摆动相屈起；后肢跗跖保持竖直、趾在离地时蜷起
    const r2 = -(r0 + r1) - (pitch * (1 - c)) + (L.front ? -f.sw * 0.6 : f.sw * 0.5)
    const cur = L.front ? [0.55, 2.3, 0.2] : [1.05, -0.55, 0.9, 0.4] // 与 poseBurster 的蜷缩角度一致
    const breatheCurl = c * Math.sin(a.t * 1.6) * 0.03
    L.j[0].rotation.z = lerp(r0, cur[0] + breatheCurl, c)
    L.j[1].rotation.z = lerp(r1, cur[1], c)
    L.j[2].rotation.z = lerp(r2, cur[2], c)
    if (!L.front) L.j[3].rotation.z = lerp(-f.sw * 0.5, cur[3], c)
  })
  // ---------- 头 ----------
  const sway = walk * Math.sin(ph0 * Math.PI * 2) * 0.06
  rig.head.rotation.set(a.headRoll * (1 - c), (a.headYaw + sway) * (1 - c), -0.22 + a.headPitch * (1 - c) - c * 0.75 + a.arch * 0.4 - pitch)
  rig.jaw.rotation.z = -0.06 - a.jaw * 0.45
  // ---------- 水泡：呼吸起伏 / 鼓胀 / 依次爆裂 / 回涨 ----------
  const n = rig.blisters.length
  C.spray.count = 0
  rig.blisters.forEach((b, i) => {
    const s = C.seeds[i], rank = C.order.indexOf(i) / Math.max(1, n - 1)
    const pulse = 0.08 * Math.max(0, Math.sin(a.t * 1.6 + s * 6)) * (a.breathe > 0.5 ? 1 : 0.4)
    if (a.burst < 0) { b.swell = pulse; b.burst = 1 - sst(0, 1, a.regrow + s * 0.15); return }
    const tb = 0.5 + rank * 0.25 // 爆裂时刻：鼓胀到顶后由少到多连环爆开
    b.swell = Math.max(pulse, sst(0, 0.42 + s * 0.08, a.burst))
    b.burst = sst(tb, tb + 0.03, a.burst)
    // 飞沫：沿水泡外法向 + 正前方喷出，抛物线下落
    const age = (a.burst - tb) * 1.6
    if (age > 0 && age < 0.45) {
      for (let k = 0; k < 6; k++) {
        const r1 = fract(Math.sin((i * 7 + k) * 12.9898) * 43758.5), r2 = fract(Math.sin((i * 7 + k) * 78.233) * 43758.5)
        _v.copy(b.n).multiplyScalar(0.35 + r1 * 0.3).add(_p.set(3.4 + r2 * 1.6, 1.1 + r1 * 0.6, (r2 - 0.5) * 0.5)) // 朝前上方（猎物脸部高度）的一股酸液
        _p.copy(b.p).addScaledVector(_v, age); _p.y -= 4.9 * age * age
        const sz = 0.005 + r1 * 0.007
        _s.set(sz * (2.2 + age * 2), sz, sz)
        _q.setFromUnitVectors(_s.clone().set(1, 0, 0), _v.clone().setY(_v.y - 9.8 * age).normalize())
        C.spray.setMatrixAt(C.spray.count++, _m.compose(_p, _q, _s))
      }
    }
  })
  C.spray.instanceMatrix.needsUpdate = true
  updateBlisters(rig)
  // ---------- 结茧：茧壳从身下长出来包住身体 ----------
  if (a.cocoon > 0 && !C.cocoon) { C.cocoon = buildBursterCocoon(grp.id, 0); grp.add(C.cocoon) }
  if (C.cocoon) {
    const k = a.cocoon
    C.cocoon.visible = k > 0
    const g = sst(0, 0.85, k)
    C.cocoon.scale.set(lerp(0.7, 1.32, g), lerp(0.15, 1.05, g), lerp(0.6, 1.12, g)) // 茧长 1.3m，包住整条蜷缩的身体（含头）
    C.cocoon.position.set(0.12, 0, 0)
    rig.root.visible = k < 0.9
    rig.root.scale.setScalar(1 - 0.12 * sst(0.3, 0.9, k))
  } else rig.root.visible = true
}

/** 茧壳裂纹：裂纹档位变了就重建茧壳（每只最多重建几次） */
export function setBursterCocoonCrack(grp: THREE.Group, crack: number) {
  const C = grp.userData.bursterAnim as AnimCache | undefined
  if (!C) return
  const step = Math.round(Math.min(1, crack) * 4) / 4
  if (C.cocoon && C.cocoon.userData.crack === step) return
  const old = C.cocoon
  C.cocoon = buildBursterCocoon(grp.id, step); C.cocoon.userData.crack = step
  if (old) { C.cocoon.position.copy(old.position); C.cocoon.scale.copy(old.scale); C.cocoon.visible = old.visible; grp.remove(old); old.traverse((o) => { const m=o as THREE.Mesh;if(m.geometry)m.geometry.dispose();if(m.material)for(const mat of Array.isArray(m.material)?m.material:[m.material])mat.dispose() }) }
  grp.add(C.cocoon)
}

type Clip = { dur: number; loop: boolean; sample: (t: number) => Partial<BursterAnim> }
export const BURSTER_CLIPS: Record<string, Clip> = {
  sleep: { dur: 4, loop: true, sample: () => ({ curl: 1, breathe: 1 }) },
  wake: { dur: 1.4, loop: false, sample: (t) => { const k = t / 1.4; return { curl: 1 - sst(0.1, 0.75, k), headPitch: sst(0.5, 0.9, k) * 0.35, jaw: sst(0.6, 0.9, k) * 0.3, breathe: 1 - k * 0.7 } } },
  crawl: { dur: 1 / 1.05, loop: true, sample: () => ({ move: 1 }) },
  chase: { dur: 1 / 1.9, loop: true, sample: () => ({ move: 2, headPitch: 0.15 }) },
  burst: { dur: 1.6, loop: false, sample: (t) => { const k = t / 1.6; return { arch: sst(0, 0.35, k) * (1 - 0.4 * sst(0.8, 1, k)), burst: k, jaw: sst(0.3, 0.55, k) * 0.9, headPitch: 0.3 * sst(0.2, 0.5, k) } } },
  wait: { dur: 3, loop: true, sample: (t) => ({ headRoll: Math.sin(t * Math.PI * 2 / 3) * 0.35, headYaw: Math.sin(t * Math.PI * 2 / 3 + 1) * 0.2, headPitch: 0.15, regrow: t / 3 * 0.5, burst: -1 }) },
  cocoon: { dur: 2.2, loop: false, sample: (t) => { const k = t / 2.2; return { curl: sst(0, 0.4, k), cocoon: sst(0.25, 1, k), jaw: 0.6 * (1 - sst(0, 0.4, k)), breathe: 0.2 } } },
}
/** 采样一个片段：clip 内时间 t（秒）→ 完整动画参数 */
export function sampleBurster(name: string, t: number): BursterAnim {
  const c = BURSTER_CLIPS[name]
  const tt = c.loop ? fract(t / c.dur) * c.dur : Math.min(t, c.dur)
  return { ...BURSTER_REST, ...c.sample(tt), t }
}
