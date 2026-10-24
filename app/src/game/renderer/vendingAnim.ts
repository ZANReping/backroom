// [vending] 售货机重制——阶段 2 动画。animateVending(group, clip, t, opts) 无状态：每次先把相关部件复位到建模姿势，再按片段时间求值，
// 所以预览可以任意顺序逐帧渲染，游戏里每帧按 AI 状态调用即可。
//   普通机：coil 螺旋线转一圈把货推下 → 货掉进取货口、翻板晃动；jam 卡货（转到一半停住，货斜卡在格口）
//   Entity 36：hand 白骨手推货（玻璃起雾、灯光变暗一下）；restock 瞬间补货（整机一震，空格一帧补满）；
//              idle 休眠（数码屏偶尔闪、灯箱轻微频闪）；stand 底门打开、双臂腿撑起机身；crawl 用两只手「走路」（循环）；
//              open 顶门打开、巨臂升起；chop 劈砍；grab 抓取；stun 被瓶装闪电击中——电弧 + 整机抽搐 + 腿软瘫下；
//              whisper 拆解后暗格里的艾里克尸体下颌开合低语（循环）
import * as THREE from 'three'
import { VM_SHELF_EDGE, legIK, LEG_ROOT_Y, LEG_WRIST_Y, poseVendingStand, VENDING_DIM, type BoneArm, type VendingHandles } from './vendingMesh'

export type VendingClip = 'idle' | 'coil' | 'jam' | 'hand' | 'restock' | 'stand' | 'crawl' | 'open' | 'chop' | 'grab' | 'stun' | 'whisper'
export const VENDING_CLIPS: Record<VendingClip, { dur: number; loop: boolean; e36: boolean; zh: string }> = {
  idle: { dur: 4, loop: true, e36: true, zh: '休眠' },
  coil: { dur: 1.8, loop: false, e36: false, zh: '螺旋线出货' },
  jam: { dur: 1.6, loop: false, e36: false, zh: '卡货' },
  hand: { dur: 2.4, loop: false, e36: true, zh: '白骨手推货' },
  restock: { dur: 1.0, loop: false, e36: true, zh: '瞬间补货' },
  stand: { dur: 1.6, loop: false, e36: true, zh: '伸腿站起' },
  crawl: { dur: 1.4, loop: true, e36: true, zh: '手腿爬行' },
  open: { dur: 1.2, loop: false, e36: true, zh: '顶门伸臂' },
  chop: { dur: 1.1, loop: true, e36: true, zh: '劈砍' },
  grab: { dur: 1.3, loop: false, e36: true, zh: '抓取' },
  stun: { dur: 2.2, loop: false, e36: true, zh: '电晕瘫痪' },
  whisper: { dur: 3, loop: true, e36: true, zh: '暗格低语' },
}
export interface VendingAnimOpts { slot?: number; time?: number; standing?: boolean }

const clamp = (x: number, a = 0, b = 1) => Math.min(b, Math.max(a, x))
const seg = (t: number, a: number, b: number) => clamp((t - a) / (b - a))
const ease = (x: number) => x * x * (3 - 2 * x)
const lerp = (a: number, b: number, k: number) => a + (b - a) * k

// ---------- 复位 ----------
function rest(o: THREE.Object3D) {
  const r = o.userData.rest as { p: THREE.Vector3; q: THREE.Euler; s: THREE.Vector3; v: boolean } | undefined
  if (!r) { o.userData.rest = { p: o.position.clone(), q: o.rotation.clone(), s: o.scale.clone(), v: o.visible }; return }
  o.position.copy(r.p); o.rotation.copy(r.q); o.scale.copy(r.s); o.visible = r.v
}
function restArm(a: BoneArm) { a.root.traverse((o) => { if ((o as any).isGroup) rest(o) }) }
/** 指骨（每根手指的节段 Group 链）弯曲 k（0 伸直 · 1 握拳） */
function curl(a: BoneArm, k: number, spread = 0) {
  a.fingers.forEach((f, i) => {
    let g: THREE.Object3D | undefined = f.children.find((c) => (c as any).isGroup)
    const thumb = i === 4
    f.rotation.z = (thumb ? 0.7 : (i - 1.5) * 0.08) + (thumb ? -0.4 * k : (i - 1.5) * spread)
    f.rotation.x = 0.25 * k
    while (g) { g.rotation.x = 0.12 + k * (thumb ? 0.9 : 1.25); g = g.children.find((c) => (c as any).isGroup) }
  })
}
/** 每台机器自己的一份玻璃 / 背光材质（起雾、变暗只影响这一台） */
function ownMats(H: VendingHandles) {
  const u = H.body.userData
  if (!u.ownMats) {
    const g0 = H.glass[0].material as THREE.MeshStandardMaterial, l0 = H.bayLights[0].material as THREE.MeshBasicMaterial, d0 = H.display.material as THREE.MeshBasicMaterial
    const glass = g0, lit = l0, disp = d0 // Factory already owns these materials; retain warmed programs.
    H.glass.forEach((m) => (m.material = glass)); H.bayLights.forEach((m) => (m.material = lit)); H.display.material = disp
    u.ownMats = { glass, lit, disp, glassOp: g0.opacity, glassC: g0.color.clone(), litC: l0.color.clone(), dispC: d0.color.clone() }
  }
  return u.ownMats as { glass: THREE.MeshStandardMaterial; lit: THREE.MeshBasicMaterial; disp: THREE.MeshBasicMaterial; glassOp: number; glassC: THREE.Color; litC: THREE.Color; dispC: THREE.Color }
}
/** 电弧：几条随机折线（瓶装闪电命中时） */
function arcs(H: VendingHandles) {
  const u = H.body.userData
  if (!u.arcs) {
    const grp = new THREE.Group(); grp.name = 'vmArcs'
    const mat = new THREE.LineBasicMaterial({ color: '#bfe8ff', toneMapped: false })
    for (let i = 0; i < 6; i++) { const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(10 * 3), 3)); grp.add(new THREE.Line(geo, mat)) }
    H.body.add(grp); u.arcs = grp
  }
  return u.arcs as THREE.Group
}
function setArcs(H: VendingHandles, t: number, k: number) {
  const g = arcs(H); g.visible = k > 0.01
  if (!g.visible) return
  const { w, h, d } = VENDING_DIM
  g.children.forEach((ln, i) => {
    const pos = ((ln as THREE.Line).geometry.getAttribute('position') as THREE.BufferAttribute)
    const seed = Math.floor(t * 18) * 13 + i * 71
    const R = (n: number) => { const x = Math.sin(seed * 12.9898 + n * 78.233) * 43758.5453; return x - Math.floor(x) }
    const side = i % 3, y0 = R(1) * h * 0.9 + 0.05
    for (let j = 0; j < 10; j++) {
      const a = j / 9
      let x = 0, y = y0 + (R(j + 3) - 0.5) * 0.12 + a * (R(2) - 0.5) * 0.6, z = 0
      if (side === 0) { x = lerp(-w / 2, w / 2, a); z = d / 2 + 0.02 + R(j + 9) * 0.03 }
      else { x = (side === 1 ? -1 : 1) * (w / 2 + 0.02 + R(j + 9) * 0.03); z = lerp(-d / 2, d / 2, a) }
      pos.setXYZ(j, x, y, z)
    }
    pos.needsUpdate = true; ln.visible = R(5) < 0.4 + k * 0.6
  })
}

function resetAll(g: THREE.Object3D, H: VendingHandles) {
  rest(H.body); rest(H.flap); restArm(H.pusher); restArm(H.topArm); H.legs.forEach(restArm); rest(H.hatchTop); H.hatchTop.children.forEach(rest); H.hatchBottom.children.forEach(rest)
  for (const s of H.slots) { if (s.item) rest(s.item); if (s.coil) rest(s.coil); rest(s.lampOk); rest(s.lampOut) }
  if (H.jamItem) rest(H.jamItem)
  H.eric.traverse((o) => { if (o.name === 'jaw') rest(o) })
  const M = ownMats(H); M.glass.opacity = M.glassOp; M.glass.color.copy(M.glassC); M.lit.color.copy(M.litC); M.disp.color.copy(M.dispC)
  if (H.body.userData.arcs) H.body.userData.arcs.visible = false
  const drop = H.body.userData.drop as THREE.Group | undefined; if (drop) drop.visible = false
  rest(g)
}
const EDGE = VENDING_DIM.d / 2 - VM_SHELF_EDGE // 搁板前沿
const CHUTE_Z = VENDING_DIM.d / 2 - 0.056 // 落货通道中线（搁板前沿 FRONT-0.10 与玻璃 FRONT-0.012 之间）
const BIN_FLOOR = 0.232, BIN_Z = VENDING_DIM.d / 2 - 0.085 // 取货斗底面 / 斗中线
/**
 * 货越过格口后（τ = 越过格口后的秒数）：货的原点在底面，所以只做小角度前倾（≤0.12 rad，顶部不会碰到玻璃），
 * 沿封闭落货通道自由落体（g=9.8）——经过两层之间、下层灯条后面时被面板挡住——落进取货斗，
 * 撞到斗底后侧倒、滚到斗中间躺平（沿 x 轴横躺，斗宽 50 cm 放得下），翻板被撞得晃。
 */
function dropFall(H: VendingHandles, S: VendingHandles['slots'][number], tau: number, _time: number) {
  if (!S.item || tau <= 0) return
  const it = S.item, y0 = S.base.y
  it.position.z = lerp(EDGE, CHUTE_Z, ease(clamp(tau / 0.1)))
  const tf = Math.max(0, tau - 0.06)
  const tLand = Math.sqrt((2 * (y0 - BIN_FLOOR)) / 9.8)
  if (tf < tLand) {
    it.position.y = y0 - 4.9 * tf * tf
    it.rotation.x = 0.12 * Math.sin(clamp(tf / tLand) * Math.PI)
    it.rotation.y += tf * 2.2
    return
  }
  // 落地：0.3 s 内侧倒（绕 z 转 ±π/2，倒向斗中间那一侧）并滚到斗中线
  const k = ease(clamp((tf - tLand) / 0.3))
  const side = it.position.x < -0.07 ? -1 : 1
  const r = S.product === 'canned' ? 0.043 : S.product === 'coffee' ? 0.033 : 0.037
  it.rotation.x = 0
  it.rotation.y += tLand * 2.2
  it.rotation.z = side * (Math.PI / 2) * k
  it.position.y = BIN_FLOOR + r * k + Math.abs(Math.sin(k * Math.PI)) * 0.012
  it.position.z = lerp(CHUTE_Z, BIN_Z, k)
  const fr = clamp((tf - tLand) / 0.5)
  H.flap.rotation.x = -Math.sin(fr * Math.PI * 3) * 0.1 * (1 - fr)
}

export function animateVending(g: THREE.Object3D, clip: VendingClip, t: number, o: VendingAnimOpts = {}) {
  const H = g.userData.vending as VendingHandles | undefined
  if (!H) return
  resetAll(g, H)
  const time = o.time ?? t
  const slot = o.slot ?? 1
  const S = H.slots[slot]
  const M = ownMats(H)
  const FRONT = VENDING_DIM.d / 2
  // 站着的状态（活化后）先摆站姿
  const standing = o.standing ?? ['crawl', 'chop', 'grab', 'stun'].includes(clip)
  if (H.variant === 'e36' && standing && clip !== 'stand') poseVendingStand(H, 1)
  switch (clip) {
    case 'idle': {
      // 数码屏偶尔闪（E36 的屏会闪出乱码般的暗红），灯箱 / 背光轻微频闪
      const fl = Math.sin(time * 37) * Math.sin(time * 5.3) > 0.82 ? 0.55 : 1
      M.lit.color.copy(M.litC).multiplyScalar(fl)
      M.disp.color.copy(M.dispC).multiplyScalar(0.6 + 0.4 * (Math.sin(time * 2.1) > -0.6 ? 1 : 0.2))
      if (H.variant === 'e36') H.body.position.x += Math.sin(time * 61) * 0.0006 // 几乎察觉不到的嗡嗡震
      break
    }
    case 'coil': case 'jam': {
      // 螺旋线转一个螺距，把货顶到格口外沿 → 货翻下格口，贴着玻璃后面的落货通道掉进取货口（全程不出玻璃）
      if (!S?.item) break
      const jam = clip === 'jam'
      const k1 = ease(seg(t, 0.1, jam ? 0.95 : 0.8))
      if (S.coil) S.coil.rotation.z -= k1 * Math.PI * 2 * (jam ? 0.6 : 1)
      if (jam) {
        // 卡货：只顶出一半，前沿下垂、斜卡在格口；螺旋线还想再转，抖两下停住
        S.item.position.z = lerp(S.base.z, EDGE - 0.012, k1)
        const k2 = ease(seg(t, 0.95, 1.2)); S.item.rotation.x += 0.2 * k2; S.item.position.y -= 0.006 * k2 // 前沿悬空、往前栽一点，卡在格口
        const wob = seg(t, 1.2, 1.6); S.item.rotation.x += Math.sin(wob * Math.PI * 4) * 0.06 * (1 - wob)
        if (S.coil) S.coil.rotation.z += Math.sin(wob * Math.PI * 4) * 0.15 * (1 - wob)
        break
      }
      S.item.position.z = lerp(S.base.z, EDGE, k1)
      dropFall(H, S, t - 0.8, time)
      break
    }
    case 'hand': {
      // 白骨手从格子背板后伸出，把产品往前推过格口（没有螺旋线）；推的时候玻璃起雾、灯光暗下去一下
      if (!S?.item) break
      const P = H.pusher
      P.root.visible = t > 0.15 && t < 2.0
      P.root.position.set(S.base.x, S.base.y + 0.06, FRONT - 0.28)
      P.root.rotation.x = -Math.PI / 2 - 0.5
      const ext = ease(seg(t, 0.2, 0.75)) - ease(seg(t, 1.3, 1.9))
      P.elbow.rotation.x = lerp(2.6, 1.15, ext)
      P.wrist.rotation.x = lerp(0.6, -0.3, ext)
      curl(P, lerp(0.7, 0.15, ext), 0.05)
      S.item.position.z = lerp(S.base.z, EDGE, ease(seg(t, 0.5, 1.0)))
      dropFall(H, S, t - 1.0, time)
      const fog = Math.sin(seg(t, 0.15, 2.2) * Math.PI)
      M.glass.opacity = lerp(M.glassOp, 0.78, fog)
      M.glass.color.set('#e8eef0')
      M.lit.color.copy(M.litC).multiplyScalar(1 - 0.45 * fog)
      break
    }
    case 'restock': {
      // 维基：每 12 小时瞬间补货——整机一震，所有格子同一帧补满，背光闪一下
      const hit = seg(t, 0.25, 0.32)
      const shake = Math.exp(-Math.max(0, t - 0.25) * 6) * (t > 0.25 ? 1 : 0)
      H.body.position.x += Math.sin(time * 90) * 0.012 * shake
      H.body.rotation.z += Math.sin(time * 70 + 1) * 0.012 * shake
      for (const s of H.slots) if (s.item) { const empty = t < 0.28; s.item.visible = !empty || s.code.endsWith('1'); s.item.scale.multiplyScalar(empty ? 1 : 1 + 0.12 * (1 - seg(t, 0.28, 0.5))) }
      for (const s of H.slots) { s.lampOk.visible = t >= 0.28 || s.code.endsWith('1'); s.lampOut.visible = !s.lampOk.visible }
      M.lit.color.copy(M.litC).multiplyScalar(1 + 0.8 * hit * (1 - seg(t, 0.32, 0.6)))
      break
    }
    case 'stand': {
      // 底门翻开 → 两条骷髅臂贴地伸出、手掌按地 → 机身被托起（先抖一下）
      const k = seg(t, 0.25, 1.4)
      poseVendingStand(H, k)
      H.body.position.x += Math.sin(time * 50) * 0.006 * (1 - seg(t, 0, 0.3))
      break
    }
    case 'crawl': {
      // 两只手交替「迈步」（IK）：支撑相手掌按在地上不动、相对机身向后滑；摆动相抬起前伸再按下。机身随步伐颠簸、左右晃
      const ph = (t / VENDING_CLIPS.crawl.dur) % 1
      H.body.position.y = 0.95 + Math.cos(ph * Math.PI * 4) * 0.025
      H.body.rotation.z = Math.sin(ph * Math.PI * 2) * 0.04
      H.body.rotation.x = 0.04 + Math.sin(ph * Math.PI * 4) * 0.015
      const rootH = H.body.position.y + LEG_ROOT_Y
      H.legs.forEach((L, i) => {
        const s = i ? 1 : -1
        const p = (ph + i * 0.5) % 1
        const swing = p < 0.4
        const a = swing ? p / 0.4 : (p - 0.4) / 0.6
        const tz = swing ? lerp(-0.22, 0.34, ease(a)) : lerp(0.34, -0.22, a)
        const lift = swing ? Math.sin(a * Math.PI) : 0
        legIK(L, s, tz, -(rootH - LEG_WRIST_Y - lift * 0.16), lift)
      })
      break
    }
    case 'open': case 'chop': case 'grab': {
      // 顶门向后掀开，巨臂竖直地从机身里「顶」出来（像潜望镜一样直线升起，不在机身里转动，避免穿出前后面板）
      const A = H.topArm, lid = H.hatchTop.getObjectByName('lid')
      const kOpen = clip === 'open' ? ease(seg(t, 0, 0.35)) : 1
      if (lid) lid.rotation.x = -1.7 * kOpen
      A.root.visible = true
      const H0 = VENDING_DIM.h, UP = -Math.PI + 0.12
      if (clip === 'open') {
        const kRise = ease(seg(t, 0.25, 1.0))
        A.root.position.y = lerp(H0 - A.len - 0.05, H0 + 0.02, kRise)
        A.root.rotation.x = UP
        curl(A, lerp(0.95, 0.2, ease(seg(t, 0.7, 1.2))), 0.06)
        A.wrist.rotation.x = Math.sin(seg(t, 0.8, 1.2) * Math.PI) * 0.3
      } else if (clip === 'chop') {
        // 竖直 → 后仰蓄力 → 上臂甩到水平前伸、前臂向下劈（肘部弯折，整条臂都在机身前上方，不穿进前面板）→ 收回
        A.root.position.y = H0 + 0.02
        const p = t / VENDING_CLIPS.chop.dur
        const wind = ease(seg(p, 0, 0.45)), strike = ease(seg(p, 0.45, 0.6)), back = ease(seg(p, 0.7, 1))
        const WIND = -Math.PI - 0.35, HIT = -1.62
        A.root.rotation.x = back > 0 ? lerp(HIT, UP, back) : strike > 0 ? lerp(WIND, HIT, strike) : lerp(UP, WIND, wind)
        A.elbow.rotation.x = back > 0 ? lerp(1.15, 0.2, back) : strike > 0 ? lerp(0.9, 1.15, strike) : lerp(0.2, 0.9, wind)
        A.wrist.rotation.x = 0.35 * strike * (1 - back)
        curl(A, 0.15 + 0.15 * strike)
        H.body.rotation.x += -0.05 * wind + 0.09 * strike - 0.04 * back
      } else {
        // 抓取：上臂前伸、前臂探下去 → 五指合拢 → 往回拖到机身上方
        A.root.position.y = H0 + 0.02
        const reach = ease(seg(t, 0, 0.5)), close = ease(seg(t, 0.45, 0.7)), pull = ease(seg(t, 0.7, 1.3))
        A.root.rotation.x = lerp(UP, -1.55, reach) - 0.9 * pull
        A.elbow.rotation.x = lerp(0.2, 0.75, reach) + 0.5 * pull
        A.wrist.rotation.x = lerp(0, 0.4, reach) - 0.4 * close
        curl(A, lerp(0.15, 0.05, reach) + 0.95 * close, 0.12 * reach * (1 - close))
      }
      break
    }
    case 'stun': {
      // 瓶装闪电命中：电弧爬满机身、整机抽搐、屏幕乱闪，两条腿一软，机身斜着瘫下来
      const k = 1 - ease(seg(t, 0.6, 1.6))
      const zap = 1 - seg(t, 1.4, 2.2)
      setArcs(H, time, zap)
      poseVendingStand(H, 0.35 + 0.65 * k)
      H.body.position.x += Math.sin(time * 83) * 0.014 * zap
      H.body.rotation.z += Math.sin(time * 67) * 0.03 * zap + (1 - k) * 0.12
      H.body.rotation.x += (1 - k) * 0.08
      H.legs.forEach((L, i) => { curl(L, 0.4 + 0.5 * Math.abs(Math.sin(time * 30 + i))) })
      const flick = Math.sin(time * 120) > 0 ? 1 : 0.15
      M.lit.color.copy(M.litC).multiplyScalar(lerp(1, flick, zap))
      M.disp.color.set(zap > 0.3 && Math.sin(time * 70) > 0 ? '#9fdfff' : '#3a0a08')
      break
    }
    case 'whisper': {
      // 拆解后：三具艾里克尸体的下颌错开节奏开合（低语）
      let i = 0
      H.eric.traverse((ob) => { if (ob.name === 'jaw') { ob.rotation.x += Math.max(0, Math.sin(time * 6 + i * 2.1) * Math.sin(time * 1.3 + i)) * 0.45; i++ } })
      break
    }
  }
}
