// v79：尸鼠（Entity 24）重制模型——依据中文维基 Entity 24 与 Level 2 / 3 / 5 / 8 条目（原创程序化建模，无外部素材）：
//  · 常见种：像普通家鼠，长身黑毛，头上一对弯曲的棕色怪角，角尖发红光（L9 等默认层级）。
//  · 无毛种（L2）：为抵御高温褪去毛发——粉褐起皱的裸皮、烫伤斑、浑浊的黄眼、大而薄的耳朵。
//  · 穴顶种（L8 罗特尼斯大丛林）：深褐短毛、短角，倒挂穴顶（渲染层翻转）并保留倒立排泄的粪粒。
//  · 酒店正装种（L5）：常见种穿小黑马甲、白衬衫襟、酒红领结。
//  · 水豚种（L3，latest:level-3）：外观与体型近似水豚——桶状躯干、钝方吻、小圆耳、几乎无尾；
//    牙齿刻意磨成锯齿；胸前绑着自制文字转语音音箱（胶带、喇叭网、LED、垂下的线缆），可能戴抢来的头灯/M.E.G. 臂章、背工具包。
// 造型：躯干/头/四肢/尾均为样条扫掠的平滑管体（复用 houndMesh 工具），毛皮/裸皮为可平铺程序化贴图；
// 模型正面 +X，原点在地面；动画分组内按材质合批，v80 含毛壳约 20~37 个网格。
import * as THREE from 'three'
import { litMaterial } from './shared'
import type { Entity } from '../entities'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { rng, merge, V, gauss, cap, ell, sweep, canvasTex } from './houndMesh'
import { ratLook, type RatMorph } from '../entities/rats'

interface Leg { hip: THREE.Group; knee: THREE.Group; front: boolean; side: number }
export interface RatRig {
  morph: RatMorph
  root: THREE.Group; body: THREE.Group; head: THREE.Group; jaw: THREE.Group
  tail: THREE.Group[]; legs: Leg[]; earL: THREE.Object3D; earR: THREE.Object3D
  prey: THREE.Object3D; led?: THREE.Mesh; scale: number
  fur: THREE.Mesh[] // 毛壳（远处隐藏）
}

// ---------- 程序化贴图（按种群缓存） ----------
const TEX = new Map<string, THREE.Texture | null>()
function furTex(kind: 'fur' | 'coarse' | 'bare') {
  if (TEX.has(kind)) return TEX.get(kind)!
  const t = canvasTex(128, 128, (c, R) => {
    const tile = (f: (ox: number, oy: number) => void) => { for (const ox of [-128, 0, 128]) for (const oy of [-128, 0, 128]) f(ox, oy) }
    if (kind === 'bare') {
      // 裸皮：粉褐底 + 皱褶细纹 + 烫伤斑 + 青色血管
      c.fillStyle = '#d8b0a4'; c.fillRect(0, 0, 128, 128)
      for (let i = 0; i < 30; i++) { const x = R() * 128, y = R() * 128, r = 4 + R() * 14, a = 0.06 + R() * 0.1; tile((ox, oy) => { c.fillStyle = `rgba(150,80,70,${a})`; c.beginPath(); c.arc(x + ox, y + oy, r, 0, 7); c.fill() }) }
      for (let i = 0; i < 9; i++) { const x = R() * 128, y = R() * 128, r = 3 + R() * 7; tile((ox, oy) => { c.fillStyle = 'rgba(120,40,34,0.32)'; c.beginPath(); c.ellipse(x + ox, y + oy, r, r * 0.6, R() * 3, 0, 7); c.fill() }) }
      for (let i = 0; i < 60; i++) { const x = R() * 128, y = R() * 128, l = 5 + R() * 12, a = R() * 0.6 - 0.3; tile((ox, oy) => { c.strokeStyle = 'rgba(110,64,58,0.35)'; c.lineWidth = 0.7; c.beginPath(); c.moveTo(x + ox, y + oy); c.quadraticCurveTo(x + ox + l * 0.5, y + oy + a * 6, x + ox + l, y + oy); c.stroke() }) }
      for (let i = 0; i < 6; i++) { let x = R() * 128, y = R() * 128, a = R() * 7; const pts: [number, number][] = [[x, y]]; for (let k = 0; k < 9; k++) { a += (R() - 0.5); x += Math.cos(a) * 6; y += Math.sin(a) * 6; pts.push([x, y]) } tile((ox, oy) => { c.strokeStyle = 'rgba(90,96,130,0.25)'; c.lineWidth = 0.8; c.beginPath(); pts.forEach(([px, py], k) => k ? c.lineTo(px + ox, py + oy) : c.moveTo(px + ox, py + oy)); c.stroke() }) }
    } else {
      // 毛皮：中灰底 + 顺向毛缕（亮/暗交替，由材质颜色着色）
      c.fillStyle = '#9a9a9a'; c.fillRect(0, 0, 128, 128)
      const n = kind === 'coarse' ? 340 : 520
      for (let i = 0; i < n; i++) {
        const x = R() * 128, y = R() * 128, l = (kind === 'coarse' ? 7 : 4) + R() * 6, tone = 70 + R() * 130, a = 0.35 + R() * 0.45
        const bend = (R() - 0.5) * 3
        tile((ox, oy) => { c.strokeStyle = `rgba(${tone},${tone},${tone},${a})`; c.lineWidth = kind === 'coarse' ? 1.3 : 0.9; c.beginPath(); c.moveTo(x + ox, y + oy); c.quadraticCurveTo(x + ox + bend, y + oy + l * 0.5, x + ox + bend * 0.5, y + oy + l); c.stroke() })
      }
    }
    const img = c.getImageData(0, 0, 128, 128), d = img.data
    for (let i = 0; i < d.length; i += 4) { const k = (R() - 0.5) * 12; d[i] += k; d[i + 1] += k; d[i + 2] += k }
    c.putImageData(img, 0, 0)
  }, true)
  if (t) t.userData.entityShared = true
  TEX.set(kind, t)
  return t
}

// ---------- 毛发：壳层（shell）毛皮 ----------
// 同一块皮肤沿法线外扩 N 层，每层用「毛根高度图」做 alphaTest 裁切：越外层只剩越高的毛，叠起来就是一簇簇立体毛丝。
// 单个材质：每层的裁切阈值写进顶点色 alpha（diffuse.a = 高度 × alpha，≥0.5 才保留），毛梢逐层提亮；
// 层越外越顺着「梳毛方向」（向后、略向下）偏移，形成倒伏的毛流。远处（>10m）由渲染层隐藏壳层。
function strandTex(kind: 'fine' | 'shaggy') {
  const key = 'strand-' + kind
  if (TEX.has(key)) return TEX.get(key)!
  const t = canvasTex(128, 128, (c, R) => {
    c.clearRect(0, 0, 128, 128)
    const tile = (f: (ox: number, oy: number) => void) => { for (const ox of [-128, 0, 128]) for (const oy of [-128, 0, 128]) f(ox, oy) }
    const n = kind === 'shaggy' ? 1100 : 1800
    c.lineCap = 'round'
    for (let i = 0; i < n; i++) {
      // 每根毛丝 = 一道短笔触（大致顺着 v 方向，带随机偏角）；alpha = 毛丝高度，颜色 = 明暗
      const x = R() * 128, y = R() * 128, h = 0.3 + R() ** 0.7 * 0.7
      const len = (kind === 'shaggy' ? 5 : 3) + R() * (kind === 'shaggy' ? 6 : 3), ang = Math.PI / 2 + (R() - 0.5) * 0.9
      const tone = 140 + R() * 115
      c.lineWidth = kind === 'shaggy' ? 1.4 : 1.1
      c.strokeStyle = `rgba(${tone},${tone},${tone},${h})`
      tile((ox, oy) => { c.beginPath(); c.moveTo(x + ox, y + oy); c.lineTo(x + ox + Math.cos(ang) * len, y + oy + Math.sin(ang) * len); c.stroke() })
    }
  }, true)
  if (t) { t.premultiplyAlpha = false; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter }
  if (t) t.userData.entityShared = true
  TEX.set(key, t)
  return t
}
/** 一块皮肤 → N 层毛壳（合并为一个几何）。len=毛长；comb=梳毛方向（局部坐标，按层高平方偏移）；tip=毛梢提亮 */
function furShells(g: THREE.BufferGeometry, n: number, len: number, comb: THREE.Vector3, tip = 0.35, uvScale = 3) {
  const src = g.index ? g.toNonIndexed() : g
  const P = src.getAttribute('position'), N = src.getAttribute('normal'), U = src.getAttribute('uv'), C = src.getAttribute('color')
  const cnt = P.count
  const pos = new Float32Array(cnt * 3 * n), nor = new Float32Array(cnt * 3 * n), uv = new Float32Array(cnt * 2 * n), col = new Float32Array(cnt * 4 * n)
  for (let k = 0; k < n; k++) {
    const t = (k + 1) / n, off = len * t, cb = len * t * t
    const a = 0.5 / (0.08 + 0.9 * t) // 阈值：t 越大只留越高的毛丝
    const lift = 0.8 + tip * t
    for (let i = 0; i < cnt; i++) {
      const j = k * cnt + i, nx = N.getX(i), ny = N.getY(i), nz = N.getZ(i)
      // 腹面毛更短（法线朝下时缩短），避免肚皮下面拖出一层「裙子」
      const belly = ny < -0.4 ? 0.55 : 1
      pos[j * 3] = P.getX(i) + nx * off * belly + comb.x * cb; pos[j * 3 + 1] = P.getY(i) + ny * off * belly + comb.y * cb; pos[j * 3 + 2] = P.getZ(i) + nz * off * belly + comb.z * cb
      nor[j * 3] = nx; nor[j * 3 + 1] = ny; nor[j * 3 + 2] = nz
      uv[j * 2] = U.getX(i) * uvScale; uv[j * 2 + 1] = U.getY(i) * uvScale
      const v = C ? C.getX(i) : 1
      col[j * 4] = col[j * 4 + 1] = col[j * 4 + 2] = v * lift; col[j * 4 + 3] = a
    }
  }
  const out = new THREE.BufferGeometry()
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3))
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
  out.setAttribute('color', new THREE.BufferAttribute(col, 4))
  if (src !== g) src.dispose()
  return out
}

interface MorphSpec {
  fur: string; furTex: 'fur' | 'coarse' | 'bare'; bare: string; eye: string
  len: number; girth: number; head: number; snout: number; ear: number; tail: number; leg: number
  horns: boolean; hornLen: number; capy: boolean
  shells: number; furLen: number; tip?: string
}
const SPEC: Record<RatMorph, MorphSpec> = {
  common: { fur: '#2a2522', furTex: 'fur', bare: '#b48e86', eye: '#2a0c0a', len: 0.42, girth: 0.082, head: 1, snout: 1, ear: 1, tail: 0.42, leg: 1, horns: true, hornLen: 1, capy: false, shells: 4, furLen: 0.007, tip: '#7a6a5e' },
  hotel: { fur: '#2a2522', furTex: 'fur', bare: '#b48e86', eye: '#2a0c0a', len: 0.42, girth: 0.082, head: 1, snout: 1, ear: 1, tail: 0.42, leg: 1, horns: true, hornLen: 0.85, capy: false, shells: 4, furLen: 0.006, tip: '#7a6a5e' },
  cave: { fur: '#4a3a30', furTex: 'fur', bare: '#9c7a70', eye: '#3a1410', len: 0.38, girth: 0.076, head: 0.95, snout: 0.95, ear: 0.85, tail: 0.38, leg: 0.95, horns: true, hornLen: 0.6, capy: false, shells: 4, furLen: 0.007, tip: '#8a7058' },
  hairless: { fur: '#e2b8ac', furTex: 'bare', bare: '#d4a294', eye: '#c9a03a', len: 0.45, girth: 0.08, head: 1, snout: 1.08, ear: 1.3, tail: 0.46, leg: 1.05, horns: false, hornLen: 0, capy: false, shells: 0, furLen: 0 },
  capybara: { fur: '#5e4430', furTex: 'coarse', bare: '#8a4e34', eye: '#100a08', len: 0.58, girth: 0.122, head: 1.6, snout: 1.25, ear: 0.7, tail: 0.04, leg: 1.2, horns: false, hornLen: 0, capy: true, shells: 6, furLen: 0.022, tip: '#a8845a' },
}

export function ratTexturesReady(morph: RatMorph) {
  const spec = SPEC[morph]
  return TEX.has(spec.furTex) && TEX.has('bare') && (!spec.shells || TEX.has('strand-' + (spec.capy ? 'shaggy' : 'fine')))
}
/** Paint one shared map at a time before the live encounter builds its geometry. */
export function* prepareRatTextures(morph: RatMorph): Generator<void, void> {
  const spec = SPEC[morph]
  if (!TEX.has(spec.furTex)) { yield; furTex(spec.furTex) }
  if (!TEX.has('bare')) { yield; furTex('bare') }
  if (spec.shells && !TEX.has('strand-' + (spec.capy ? 'shaggy' : 'fine'))) { yield; strandTex(spec.capy ? 'shaggy' : 'fine') }
}

const shadeAO = (lo: number, hi: number) => (_t: number, d: THREE.Vector3) => lo + (hi - lo) * (0.5 + 0.5 * d.y)
function colorize(g: THREE.BufferGeometry, v = 1) {
  if (!g.getAttribute('color')) g.setAttribute('color', new THREE.Float32BufferAttribute(new Array(g.attributes.position.count * 3).fill(v), 3))
  if (!g.getAttribute('uv')) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Array(g.attributes.position.count * 2).fill(0), 2))
  return g
}

export function buildRatMesh(morph: RatMorph = 'common', seed = 0, ceiling = false, dead = false): THREE.Group {
  const S = SPEC[morph], L = ratLook(seed), R = rng(0x2a7 + seed * 977)
  const sz = S.capy ? 1 : L.size
  const grp = new THREE.Group()
  grp.userData.entityType = 'corpserat'
  const parts: Record<string, THREE.Object3D> = {}
  grp.userData.parts = parts
  const furM = litMaterial({ color: S.fur, map: furTex(S.furTex), vertexColors: true })
  const bareM = litMaterial({ color: S.bare, map: furTex('bare'), vertexColors: true })
  const toothM = litMaterial({ color: S.capy ? '#e0c878' : '#d8c27a', emissive: '#2a2414', vertexColors: true })
  const eyeM = litMaterial({ color: S.eye, emissive: S.eye, emissiveIntensity: morph === 'hairless' ? 0.35 : 0.15 })
  const glowM = new THREE.MeshBasicMaterial({ color: '#ff3a24' })
  const shellM = S.shells ? litMaterial({ color: new THREE.Color(S.fur).lerp(new THREE.Color(S.tip ?? S.fur), 0.55), map: strandTex(S.capy ? 'shaggy' : 'fine'), vertexColors: true, alphaTest: 0.5 }) : null
  const furShellMeshes: THREE.Mesh[] = []
  const addShell = (parent: THREE.Object3D, g: THREE.BufferGeometry, comb: THREE.Vector3, k = 1, uvS = 3) => {
    if (!shellM) return
    const m = new THREE.Mesh(furShells(g, S.shells, S.furLen * k, comb, 0.4, uvS), shellM)
    m.name = 'ratFur'; parent.add(m); furShellMeshes.push(m)
  }
  const nailM = litMaterial({ color: '#d8ccb0', vertexColors: true })
  const furG: THREE.BufferGeometry[] = [], headFurG: THREE.BufferGeometry[] = [], bareG: THREE.BufferGeometry[] = [], toothG: THREE.BufferGeometry[] = []

  const root = new THREE.Group(); root.scale.setScalar(sz); grp.add(root)
  const hipY = (S.capy ? 0.16 : 0.085) * S.leg
  // 身体原点在后髋：抬起前身（站立嗅闻/张望）时绕后髋转动
  const body = new THREE.Group(); body.position.set(-S.len * 0.32, hipY + S.girth * 0.55, 0); root.add(body)
  {
    const Lx = S.len
    const spine = S.capy
      ? [V(-0.06, 0.0, 0), V(0.08, 0.02, 0), V(0.25, 0.03, 0), V(0.42, 0.02, 0), V(0.56, 0.0, 0)]
      : [V(-0.05, 0.0, 0), V(0.06, 0.018, 0), V(0.17, 0.01, 0), V(0.27, -0.005, 0), V(Lx * 0.82, 0.0, 0)]
    // 截面半径：臀部最粗 → 腰 → 胸 → 颈
    const prof = S.capy ? [[0, 0.5], [0.12, 0.95], [0.4, 1], [0.75, 0.92], [0.92, 0.7], [1, 0.45]] : [[0, 0.45], [0.18, 1], [0.45, 0.92], [0.72, 0.78], [0.9, 0.6], [1, 0.42]]
    const base = (t: number) => { for (let i = 1; i < prof.length; i++) if (t <= prof[i][0]) { const [t0, r0] = prof[i - 1], [t1, r1] = prof[i]; const k = (t - t0) / (t1 - t0); return r0 + (r1 - r0) * (k * k * (3 - 2 * k)) } return 0.4 }
    const torso = sweep(spine, (t, d, cs, sn) => S.girth * base(t) * cap(t, 0.07) * ell(cs, sn, 1, S.capy ? 1 : 0.86) * (d.y < -0.3 ? 1 + 0.06 * gauss(t, 0.45, 0.2) : 1)
      + (L.scar && !S.capy ? -0.004 * gauss(t, 0.55, 0.04) * Math.max(0, d.z) : 0), { radial: 16, seg: 22, vRep: 3, uRep: 2, shade: shadeAO(0.7, 1.05) })
    furG.push(torso)
    addShell(body, torso, V(-0.9, -0.35, 0), 1, 4)
  }
  // —— 头：沿吻部方向扫掠（颅 → 吻尖），水豚种钝方吻 ——
  const head = new THREE.Group()
  head.position.set(S.len * (S.capy ? 0.9 : 0.8), S.capy ? 0.06 : 0.012, 0)
  body.add(head)
  const hl = 0.11 * S.head * S.snout, hr = 0.048 * S.head
  {
    let skull: THREE.BufferGeometry
    if (S.capy) {
      // 水豚头：侧面近乎长方——颅顶平直、吻部又高又钝（比宽更高），正面几乎是一块平面；鼻垫在吻端上部
      const sq = (cs: number, sn: number, a: number, b: number, p = 3) => 1 / Math.pow(Math.pow(Math.abs(cs) / a, p) + Math.pow(Math.abs(sn) / b, p), 1 / p)
      const hp = [V(-0.035 * S.head, 0.012, 0), V(hl * 0.25, 0.008, 0), V(hl * 0.65, -0.004, 0), V(hl, -0.014, 0)]
      skull = sweep(hp, (t, d, cs, sn) => hr * (1 - 0.12 * t) * cap(t, t < 0.5 ? 0.18 : 0.04) * sq(cs, sn, 1.18 - 0.12 * t + (d.y > 0 ? 0 : 0.06), 0.9 - 0.3 * t, t > 0.6 ? 3.2 : 2.4), { radial: 18, seg: 14, shade: (t, d) => (0.72 + 0.3 * (0.5 + 0.5 * d.y)) * (1 - 0.18 * t * Math.max(0, -d.y)) })
      // 鼻垫：宽而扁的深色鼻垫 + 两道鼻孔裂
      bareG.push(colorize(new THREE.SphereGeometry(hr * 0.42, 10, 6).scale(0.22, 0.48, 0.95).translate(hl + hr * 0.02, -0.002, 0), 0.14))
      for (const z of [-1, 1]) bareG.push(colorize(new THREE.BoxGeometry(hr * 0.06, hr * 0.06, hr * 0.2).rotateX(z * 0.6).translate(hl + hr * 0.1, hr * 0.06, z * hr * 0.2), 0.1))
      // 上唇裂（Y 形）
      bareG.push(colorize(new THREE.BoxGeometry(hr * 0.05, hr * 0.32, hr * 0.04).translate(hl + hr * 0.08, -hr * 0.25, 0), 0.15))
    } else {
      const hp = [V(-0.02 * S.head, 0.004, 0), V(hl * 0.3, 0.006, 0), V(hl * 0.7, -0.006 * S.head, 0), V(hl, -0.016 * S.head, 0)]
      skull = sweep(hp, (t, _d, cs, sn) => hr * (1 - 0.74 * t ** 0.9) * cap(t, 0.08) * ell(cs, sn, 1, 0.9), { radial: 14, seg: 12, shade: shadeAO(0.75, 1.05) })
      // 鼻头
      bareG.push(colorize(new THREE.SphereGeometry(hr * 0.26, 8, 6).scale(0.7, 0.8, 1.2).translate(hl + 0.002, -0.012 * S.head, 0), 0.6))
    }
    headFurG.push(skull)
    addShell(head, skull, V(-0.7, -0.15, 0), S.capy ? 0.7 : 0.75)
    // 眼：两颗小圆眼（常见种暗红有反光，L2 浑浊黄）
    for (const z of [-1, 1]) {
      const ex = S.capy ? hl * 0.16 : hl * 0.28, ey = hr * (S.capy ? 0.66 : 0.42), ez = z * hr * (S.capy ? 0.78 : 0.62)
      const eye = new THREE.Mesh(new THREE.SphereGeometry(hr * (S.capy ? 0.12 : 0.19), 8, 6), eyeM)
      if (S.capy) eye.scale.set(1.25, 0.8, 0.7) // 水豚：高而靠后的细长小眼，上眼睑半垂
      eye.position.set(ex, ey, ez); head.add(eye)
    }
    // 耳：薄圆片（水豚小圆耳 / L2 大而薄 / 缺耳的个体只剩半片）
    const ear = (z: number) => {
      const torn = L.torn === z
      const g = new THREE.SphereGeometry(0.03 * S.ear * S.head * (S.capy ? 0.6 : 1), 10, 8, 0, Math.PI * 2, 0, torn ? Math.PI * 0.55 : Math.PI)
      g.scale(0.35, 1, 0.9)
      const m = new THREE.Mesh(colorize(g, S.capy ? 0.4 : 0.85), bareM)
      const pivot = new THREE.Group(); pivot.position.set(S.capy ? -0.03 : -0.004, hr * (S.capy ? 0.98 : 0.72), z * hr * (S.capy ? 0.62 : 0.5)); pivot.add(m)
      m.position.y = 0.02 * S.ear * S.head * (S.capy ? 0.6 : 1); pivot.rotation.x = z * 0.4
      head.add(pivot); return pivot
    }
    const earL = ear(-1), earR = ear(1)
    parts.earL = earL; parts.earR = earR
    // 胡须：细长三棱管（与牙爪同批）
    if (!S.capy) for (const z of [-1, 1]) for (let k = 0; k < 3; k++) {
      const a = V(hl * 0.82, -0.008 + k * 0.006, z * hr * 0.22)
      toothG.push(sweep([a, a.clone().add(V(0.035, 0.004 - k * 0.006, z * 0.04)), a.clone().add(V(0.06, -0.004 - k * 0.01, z * 0.075))], (t) => 0.0011 * (1 - t * 0.8), { radial: 3, seg: 3 }))
    }
    // 怪角：头顶两支向后弯曲再上翘的棕色角，角尖发红光
    if (S.horns) for (const z of [-1, 1]) {
      const hk = S.hornLen * L.horn
      const a = V(hr * 0.15, hr * 0.78, z * hr * 0.32)
      const pts = [a, a.clone().add(V(-0.02 * hk, 0.025 * hk, z * 0.012 * hk)), a.clone().add(V(-0.048 * hk, 0.036 * hk, z * 0.022 * hk)), a.clone().add(V(-0.066 * hk, 0.06 * hk, z * 0.028 * hk))]
      const horn = sweep(pts, (t) => 0.0085 * (1 - t * 0.78) * (0.88 + 0.12 * Math.cos(t * 30)), { radial: 6, seg: 8, shade: (t) => 0.55 + 0.25 * t })
      const hm = new THREE.Mesh(horn, litMaterial({ color: '#6a4628', vertexColors: true }))
      head.add(hm)
      const tip = new THREE.Mesh(new THREE.SphereGeometry(0.0042, 6, 4), glowM)
      tip.position.copy(pts[3]); head.add(tip)
    }
  }
  // —— 下颌（啃食/撕咬时张合）+ 门牙 ——
  const jaw = new THREE.Group(); jaw.position.set(hl * 0.25, -hr * 0.42, 0); head.add(jaw)
  {
    const jl = hl * 0.62
    furG.push(sweep([V(0, 0, 0), V(jl * 0.5, -0.004, 0), V(jl, -0.002, 0)].map((v) => v.add(jaw.position)), (t, _d, cs, sn) => hr * 0.42 * (1 - 0.6 * t) * cap(t, 0.12) * ell(cs, sn, 1, 0.6), { radial: 8, seg: 6, shade: shadeAO(0.6, 0.9) }).translate(-jaw.position.x, -jaw.position.y, 0))
    const jawGeo = furG.pop()!
    const jm = new THREE.Mesh(jawGeo, furM); jaw.add(jm)
    const tw = hr * (S.capy ? 0.13 : 0.11), th = hr * (S.capy ? 0.4 : 0.36)
    for (const z of [-1, 1]) {
      // 上门牙（挂在头上）/ 下门牙（随下颌）
      toothG.push(new THREE.BoxGeometry(tw, th, tw * 0.9).translate(hl * 0.94, -0.016 * S.head - th * 0.45, z * tw * 0.55))
      const lo = colorize(new THREE.BoxGeometry(tw, th * 0.75, tw * 0.9).translate(jl * 0.95, th * 0.3, z * tw * 0.55), 0.95)
      jaw.add(new THREE.Mesh(lo, toothM))
    }
    if (S.capy) {
      // 刻意磨尖的锯齿牙：上下两排参差的三棱锥
      for (let i = 0; i < 6; i++) {
        const z = (i - 2.5) * hr * 0.17, h = hr * (0.24 + R() * 0.2)
        toothG.push(new THREE.ConeGeometry(hr * 0.06, h, 3).rotateX(Math.PI).translate(hl * (0.7 + R() * 0.12), -0.018 * S.head - h * 0.4, z))
        jaw.add(new THREE.Mesh(colorize(new THREE.ConeGeometry(hr * 0.05, h * 0.8, 3).translate(jl * (0.6 + R() * 0.25), h * 0.3, z * 0.9), 0.9), toothM))
      }
    }
  }
  // —— 叼着的猎物（死亡飞蛾的残翅）——
  const prey = new THREE.Group()
  {
    const wingM = litMaterial({ color: '#8a8070', side: THREE.DoubleSide })
    for (const z of [-1, 1]) { const w = new THREE.Mesh(new THREE.CircleGeometry(0.05, 5).scale(1.4, 0.8, 1), wingM); w.position.set(0.0, 0.0, z * 0.025); w.rotation.set(Math.PI / 2 + z * 0.5, 0, 0.4); prey.add(w) }
    prey.add(new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.006, 0.05, 5).rotateZ(Math.PI / 2), litMaterial({ color: '#4a4036' })))
    prey.position.set(hl * 0.95, -hr * 0.5, 0); prey.visible = false
    head.add(prey)
  }
  // —— 四肢：两段扫掠 + 小爪掌（前肢细短，后肢粗长、跖部着地）——
  const legs: Leg[] = []
  const limb = (front: boolean, side: number) => {
    const hip = new THREE.Group()
    hip.position.set(front ? S.len * 0.66 : 0.01, -S.girth * (front ? 0.35 : 0.3), side * S.girth * (S.capy ? 0.62 : 0.55))
    body.add(hip)
    const top = hipY + S.girth * 0.55 + hip.position.y
    const l1 = top * (front ? 0.52 : 0.5), l2 = top * (front ? 0.5 : 0.52)
    const r0 = S.girth * (front ? 0.36 : 0.55), r1 = S.girth * (front ? 0.2 : 0.24)
    const p1 = V(front ? -0.01 : 0.03, -l1, 0)
    furG.push(sweep([V(0, 0.01, 0), V(p1.x * 0.5, -l1 * 0.5, 0), p1.clone()].map((v) => v.add(hip.position)), (t, _d, cs, sn) => (r0 + (r1 - r0) * t) * cap(t, 0.15) * ell(cs, sn, 1, 0.8), { radial: 8, seg: 6, shade: shadeAO(0.6, 1) }).translate(-hip.position.x, -hip.position.y, -hip.position.z))
    const upG = furG.pop()!
    hip.add(new THREE.Mesh(upG, furM))
    addShell(hip, upG, V(-0.2, -0.8, 0), S.capy ? 0.8 : 0.6, 2)
    const knee = new THREE.Group(); knee.position.copy(p1); hip.add(knee)
    const p2 = V(front ? 0.012 : -0.02, -l2 + (S.capy ? 0.012 : 0.008), 0)
    const lowG = sweep([V(0, 0, 0), p2.clone().multiplyScalar(0.5), p2], (t, _d, cs, sn) => r1 * (1 - 0.35 * t) * cap(t, 0.15) * ell(cs, sn, 1, 0.85), { radial: 7, seg: 5, shade: shadeAO(0.65, 0.95) })
    const jointG = colorize(new THREE.SphereGeometry(r1 * 1.12, 8, 6), 0.85) // 膝/肘关节球：填平上下两段之间的缝
    knee.add(new THREE.Mesh(merge([lowG, jointG]), bareM)) // 小腿裸皮（水豚：红褐色裸皮，参照图）
    // 爪掌 + 趾爪
    const pl = (front ? 0.026 : 0.04) * (S.capy ? 1.8 : 1), pw = r1 * (S.capy ? 1.45 : 1.15) // 水豚：宽而扁的蹼足
    const palm = colorize(new THREE.SphereGeometry(1, 8, 5).scale(pl * 0.6, pw * 0.42, pw).translate(p2.x + pl * 0.45, p2.y + pw * 0.2, 0), 0.75)
    const toes: THREE.BufferGeometry[] = []
    for (let k = 0; k < (S.capy ? 3 : 4); k++) {
      const z = (k - (S.capy ? 1 : 1.5)) * pw * 0.55
      toes.push(new THREE.ConeGeometry(pw * 0.14, pl * 0.5, 4).rotateZ(-Math.PI / 2).translate(p2.x + pl * 1.05, p2.y + pw * 0.08, z))
    }
    knee.add(new THREE.Mesh(palm, bareM))
    if (S.capy) {
      // 水豚：粗趾（后足 3 趾 / 前足 4 趾）+ 苍白的钝趾甲（参照图）
      const fingers: THREE.BufferGeometry[] = [], nails: THREE.BufferGeometry[] = []
      const nT = front ? 4 : 3
      for (let k = 0; k < nT; k++) {
        const z = (k - (nT - 1) / 2) * pw * (front ? 0.42 : 0.55), L0 = pl * (front ? 0.75 : 0.9) * (1 - Math.abs(k - (nT - 1) / 2) * 0.12)
        const a0 = V(p2.x + pl * 0.6, p2.y + pw * 0.16, z * 0.8), a1 = V(p2.x + pl * 0.6 + L0, p2.y + pw * 0.1, z)
        fingers.push(sweep([a0, a0.clone().lerp(a1, 0.5).add(V(0, 0.003, 0)), a1], (t, _d, cs, sn) => pw * 0.17 * (1 - 0.2 * t) * cap(t, 0.2) * ell(cs, sn, 0.75, 1), { radial: 6, seg: 4, shade: () => 0.8 }))
        nails.push(colorize(new THREE.SphereGeometry(pw * 0.12, 6, 4).scale(1.4, 0.7, 1).translate(a1.x + pw * 0.06, a1.y - pw * 0.02, a1.z), 1))
      }
      knee.add(new THREE.Mesh(merge(fingers.map((g) => colorize(g))), bareM))
      knee.add(new THREE.Mesh(merge(nails), nailM))
    } else knee.add(new THREE.Mesh(colorize(merge(toes), 0.3), bareM)) // 趾爪：深色顶点色，与爪掌同批
    legs.push({ hip, knee, front, side })
  }
  limb(true, -1); limb(true, 1); limb(false, -1); limb(false, 1)
  // —— 尾：三节可摆动的裸尾（水豚种几乎无尾；断尾个体只剩一节）——
  const tail: THREE.Group[] = []
  {
    // 一根下垂再微翘的裸尾（单网格；整体摆动）；断尾个体只剩三分之一
    const tl = S.capy ? S.tail : L.stub ? S.tail / 3 : S.tail, r0 = S.capy ? 0.03 : 0.013
    const g = new THREE.Group(); g.position.set(-0.04, -0.005, 0); body.add(g)
    const pts = S.capy ? [V(0, 0, 0), V(-tl * 0.6, -0.004, 0), V(-tl, -0.01, 0)]
      : [V(0, 0, 0), V(-tl * 0.3, -0.03, 0), V(-tl * 0.6, -0.06, 0.02), V(-tl * 0.85, -0.065, -0.01), V(-tl, -0.05, 0.015)]
    const geo = sweep(pts, (t, _d, cs, sn) => r0 * (1 - 0.75 * t) * cap(t, 0.06) * ell(cs, sn, 1, 1), { radial: 6, seg: 14, vRep: 6, shade: (t) => 0.8 + 0.1 * Math.sin(t * 90) })
    g.add(new THREE.Mesh(geo, S.capy ? furM : bareM))
    tail.push(g)
  }
  // —— 种群配件 ——
  let led: THREE.Mesh | undefined
  if (morph === 'hotel') {
    // 小西装黑马甲 + 白衬衫襟 + 酒红领结（套在胸背上）
    const vestM = litMaterial({ color: '#16141a' }), shirtM = litMaterial({ color: '#e8e4da' }), tieM = litMaterial({ color: '#7a1e24' })
    const vest = sweep([V(S.len * 0.32, 0.016, 0), V(S.len * 0.5, 0.012, 0), V(S.len * 0.7, 0.004, 0)], (t, _d, cs, sn) => S.girth * (0.98 - 0.15 * t) * 1.08 * ell(cs, sn, 1, 0.88), { radial: 14, seg: 6 })
    body.add(new THREE.Mesh(vest, vestM))
    const bib = new THREE.Mesh(new THREE.PlaneGeometry(0.05, 0.04), shirtM); bib.position.set(S.len * 0.74, -S.girth * 0.2, 0); bib.rotation.y = Math.PI / 2; bib.rotation.x = 0.3; body.add(bib)
    const tie = new THREE.Group(); tie.position.set(S.len * 0.78, -S.girth * 0.05, 0)
    for (const z of [-1, 1]) tie.add(new THREE.Mesh(new THREE.ConeGeometry(0.012, 0.022, 4).rotateX(z * Math.PI / 2).translate(0, 0, z * 0.011), tieM))
    tie.add(new THREE.Mesh(new THREE.SphereGeometry(0.006, 5, 4), tieM)); body.add(tie)
  }
  if (S.capy) {
    // 胸前的自制文字转语音音箱：灰塑料盒 + 胶带 + 喇叭网 + LED + 垂线；颈部一圈布带
    const boxM = litMaterial({ color: '#5a5a58' }), tapeM = litMaterial({ color: '#b8b098' })
    const dev = new THREE.Group(); dev.position.set(S.len * 0.9, -S.girth * 0.62, 0); dev.rotation.z = -0.5
    dev.add(new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.085, 0.11), boxM))
    dev.add(new THREE.Mesh(new THREE.BoxGeometry(0.048, 0.018, 0.114), tapeM).translateY(0.014))
    const grill = new THREE.Mesh(new THREE.CircleGeometry(0.022, 10), litMaterial({ color: '#1e1e1e' })); grill.position.set(0.024, -0.014, -0.018); grill.rotation.y = Math.PI / 2; dev.add(grill)
    led = new THREE.Mesh(new THREE.SphereGeometry(0.006, 6, 4), new THREE.MeshBasicMaterial({ color: '#ff3020' })); led.position.set(0.024, 0.026, 0.036); dev.add(led)
    const wire = sweep([V(0, -0.03, 0.03), V(0.01, -0.06, 0.045), V(-0.01, -0.09, 0.03), V(-0.02, -0.11, 0.05)], () => 0.003, { radial: 4, seg: 6 })
    dev.add(new THREE.Mesh(wire, litMaterial({ color: '#b02a20' })))
    body.add(dev)
    const strap = new THREE.Mesh(new THREE.TorusGeometry(S.girth * 0.7, 0.01, 4, 16), litMaterial({ color: '#3a3226' })); strap.position.set(S.len * 0.82, 0, 0); strap.rotation.y = Math.PI / 2; body.add(strap)
    if (L.lamp) { // 抢来的头灯
      const lamp = new THREE.Group(); lamp.position.set(hl * 0.25, hr * 0.85, 0)
      lamp.add(new THREE.Mesh(new THREE.TorusGeometry(hr * 0.95, 0.006, 4, 14).rotateY(Math.PI / 2).rotateZ(0.35), litMaterial({ color: '#222' })))
      const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.016, 0.014, 8).rotateZ(Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#f4e8b0' })); lens.position.set(0.02, 0.012, 0); lamp.add(lens)
      head.add(lamp)
    }
    if (L.band) { // M.E.G. 臂章（左前腿）
      const band = new THREE.Mesh(new THREE.CylinderGeometry(S.girth * 0.3, S.girth * 0.3, 0.02, 8, 1, true), litMaterial({ color: '#d0742a', side: THREE.DoubleSide }))
      band.position.set(0.0, -0.04, 0); legs[0].hip.add(band)
    }
    if (L.pack) { // 背上的工具包（胶带捆着的螺丝刀、线卷）
      const pack = new THREE.Group(); pack.position.set(S.len * 0.42, S.girth * 0.95, 0)
      pack.add(new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.05, 0.1), litMaterial({ color: '#4a4a36' })))
      pack.add(new THREE.Mesh(new THREE.TorusGeometry(0.022, 0.009, 5, 10).rotateX(Math.PI / 2), litMaterial({ color: '#b87333' })).translateY(0.035).translateX(-0.03))
      pack.add(new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.1, 5).rotateZ(Math.PI / 2), litMaterial({ color: '#c9c9c0' })).translateY(0.03).translateZ(0.03))
      body.add(pack)
    }
  }
  // 合批
  body.add(new THREE.Mesh(merge(furG.map((g) => colorize(g))), furM))
  head.add(new THREE.Mesh(merge(headFurG), furM))
  if (bareG.length) head.add(new THREE.Mesh(merge(bareG), bareM))
  const headTeeth = toothG.splice(0)
  if (headTeeth.length) head.add(new THREE.Mesh(merge(headTeeth.map((g) => colorize(g, 0.95))), toothM))
  // 穴顶种：倒立排泄的粪粒（renderer 已有循环逻辑：parts.dung）
  if (ceiling) {
    const dung = new THREE.Mesh(new THREE.SphereGeometry(0.02, 6, 5), litMaterial({ color: '#3a2919' }))
    dung.scale.set(0.85, 1.2, 0.85); dung.position.set(-0.05, 0.05, 0); dung.visible = false
    grp.add(dung); parts.dung = dung
  }
  bakeLeaves(grp, new Set<THREE.Object3D>([prey, ...furShellMeshes, ...(led ? [led] : []), ...(parts.dung ? [parts.dung] : [])]))
  const rig: RatRig = { morph, root, body, head, jaw, tail, legs, earL: parts.earL, earR: parts.earR, prey, led, scale: sz, fur: furShellMeshes }
  grp.userData.ratRig = rig
  grp.traverse((o) => { if ((o as THREE.Mesh).isMesh) { o.castShadow = o.name !== 'ratFur' } })
  if (dead) poseDead(rig, seed)
  return grp
}

/**
 * 合批：同一父节点下的「叶子网格」按材质合并（有贴图/发光/基础材质按材质实例分组；纯色 Lambert 统一烘成顶点色共用一个材质）。
 * 动画用的 Group（头/下颌/四肢/尾/耳）保持独立；keep 里的对象不参与。
 */
function bakeLeaves(root: THREE.Object3D, keep: Set<THREE.Object3D>) {
  const resources = () => {
    const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>()
    root.traverse(o => {
      const m = o as THREE.Mesh
      if (m.geometry) geometries.add(m.geometry)
      for (const mat of Array.isArray(m.material) ? m.material : m.material ? [m.material] : []) materials.add(mat)
    })
    return { geometries, materials }
  }
  const before = resources()
  const flatM = litMaterial({ color: '#ffffff', vertexColors: true })
  const flatDS = litMaterial({ color: '#ffffff', vertexColors: true, side: THREE.DoubleSide })
  const visit = (node: THREE.Object3D) => {
    for (const ch of [...node.children]) visit(ch)
    const groups = new Map<string, { mat: THREE.Material; geos: THREE.BufferGeometry[]; meshes: THREE.Mesh[] }>()
    for (const ch of node.children) {
      const m = ch as THREE.Mesh
      if (!m.isMesh || m.children.length || keep.has(m)) continue
      const mat = m.material as THREE.MeshLambertMaterial
      const flat = (mat.type === 'MeshLambertMaterial' || mat.type === 'MeshStandardMaterial') && !mat.map && !(mat.emissive && mat.emissive.getHex() && mat.emissiveIntensity > 0.2) && !mat.transparent
      const key = flat ? (mat.side === THREE.DoubleSide ? 'flatDS' : 'flat') : mat.uuid
      m.updateMatrix()
      const g = (m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone()).applyMatrix4(m.matrix)
      if (!g.getAttribute('normal')) g.computeVertexNormals()
      if (!g.getAttribute('uv')) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Array(g.attributes.position.count * 2).fill(0), 2))
      const n = g.attributes.position.count, c = g.getAttribute('color') as THREE.BufferAttribute | undefined
      const out = new Float32Array(n * 3)
      const col = flat ? mat.color : new THREE.Color(1, 1, 1)
      for (let i = 0; i < n; i++) { const v = c ? c.getX(i) : 1; out[i * 3] = (c ? c.getX(i) : v) * col.r; out[i * 3 + 1] = (c ? c.getY(i) : v) * col.g; out[i * 3 + 2] = (c ? c.getZ(i) : v) * col.b }
      g.setAttribute('color', new THREE.BufferAttribute(out, 3))
      for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(k)) g.deleteAttribute(k)
      const slot = groups.get(key) ?? { mat: flat ? (key === 'flatDS' ? flatDS : flatM) : mat, geos: [], meshes: [] }
      slot.geos.push(g); slot.meshes.push(m); groups.set(key, slot)
    }
    for (const { mat, geos, meshes } of groups.values()) {
      if (meshes.length === 1 && mat === meshes[0].material) { for (const g of geos) g.dispose(); continue }
      for (const m of meshes) node.remove(m)
      if (!(mat as THREE.MeshLambertMaterial).vertexColors) { (mat as THREE.MeshLambertMaterial).vertexColors = true }
      const merged = new THREE.Mesh(mergeGeometries(geos)!, mat)
      merged.castShadow = true
      node.add(merged)
      for (const g of geos) g.dispose()
    }
  }
  visit(root)
  const retained = resources()
  for (const g of before.geometries) if (!retained.geometries.has(g)) g.dispose()
  for (const m of [...before.materials, flatM, flatDS]) if (!retained.materials.has(m)) m.dispose()
}

/** L2 的尸鼠尸体：侧翻、四肢僵直、嘴张开 */
function poseDead(r: RatRig, seed: number) {
  const R = rng(seed + 5)
  r.root.rotation.x = Math.PI / 2 * (R() < 0.5 ? 1 : -1)
  r.root.position.y = 0.05 * r.scale
  for (const L of r.legs) { L.hip.rotation.z = (L.front ? 0.9 : -0.7) + (R() - 0.5) * 0.4; L.knee.rotation.z = (R() - 0.5) * 0.6 }
  r.jaw.rotation.z = -0.5
  r.head.rotation.z = -0.3
  for (const t of r.tail) t.rotation.y = (R() - 0.5) * 0.8
}

/** 渲染层每帧驱动：碎步小跑 / 冲刺弹跳 / 站立嗅闻张望 / 低头啃食 / 叼猎物 / 抱栅栏磨牙 / 伏地布雷 / 扑咬 */
export function animateRat(grp: THREE.Group, e: Entity, time: number, _gz: number) {
  const r = grp.userData.ratRig as RatRig | undefined
  if (!r) return
  const s = e.rt
  const ph = s?.phase ?? 'roam'
  const t = time + e.id * 1.37
  const dA = e.animT - (grp.userData.lastAnimT ?? e.animT); grp.userData.lastAnimT = e.animT
  const moving = ph === 'roam' || ph === 'flee' || ph === 'hunt' || ph === 'drag' || ph === 'chase' || (ph === 'command' && dA > 1e-4) || (ph === 'grind' && e.state !== 'idle')
  // 水豚种：指挥时停下来就像参照图那样坐在后腿上（前腿撑直、胸口挺起）
  const sitK = r.morph === 'capybara' && !moving && ph === 'command' ? 1 : 0
  const fast = ph === 'flee' || ph === 'chase' || ph === 'hunt'
  const g = e.animT * (r.morph === 'capybara' ? 7 : 11)
  const amp = moving ? (fast ? 0.75 : 0.45) : 0
  let rear = 0, headPitch = 0, headYaw = 0, jawOpen = 0, crouch = 0
  if (ph === 'sniff') { rear = 0.55 + Math.sin(t * 1.3) * 0.05; headPitch = 0.25 + Math.sin(t * 9) * 0.05; headYaw = Math.sin(t * 1.8) * 0.4 }
  else if (ph === 'watch') { rear = 0.75; headPitch = 0.1; headYaw = Math.sin(t * 0.6) * 0.15 }
  else if (ph === 'gnaw') { headPitch = -0.55 + Math.sin(t * 7) * 0.08; jawOpen = 0.25 + Math.sin(t * 17) * 0.2; crouch = 0.3 }
  else if (ph === 'drag') { headPitch = -0.35; crouch = 0.2 }
  else if (ph === 'grind') { headPitch = 0.15; headYaw = Math.sin(t * 13) * 0.12; jawOpen = 0.2 + Math.abs(Math.sin(t * 14)) * 0.3; rear = e.state === 'idle' ? 0.35 : 0 }
  else if (ph === 'plant') { headPitch = -0.6; crouch = 0.45 }
  else if (ph === 'command') { rear = moving ? 0 : 0.2; headPitch = 0.12 }
  if (sitK) { rear = 0.62; headPitch = -0.22; headYaw = Math.sin(t * 0.5) * 0.18 }
  if (e.lungeT > 0) { const k = Math.sin(Math.min(1, e.lungeT / 0.28) * Math.PI); jawOpen = Math.max(jawOpen, 0.9 * k); headPitch -= 0.25 * k; crouch = Math.max(crouch, 0.3 * (1 - k)) }
  if (ph === 'chase' && !e.lungeT) jawOpen = Math.max(jawOpen, 0.25 + Math.sin(t * 11) * 0.15)
  // 身体：前身绕后髋抬起；小跑颠动；冲刺弹跳步（前后肢成对）
  const bound = fast ? Math.sin(g) : 0
  r.body.rotation.z = rear + bound * 0.12 * amp - crouch * 0.12
  r.body.position.y = r.body.userData.y0 ?? (r.body.userData.y0 = r.body.position.y)
  r.body.position.y += Math.abs(Math.sin(g)) * amp * 0.012 - crouch * 0.02 - sitK * r.body.position.y * 0.55
  for (const L of r.legs) {
    const phase = fast ? (L.front ? 0 : Math.PI * 0.85) + (L.side < 0 ? 0 : 0.25) : (L.front ? (L.side < 0 ? 0 : Math.PI) : (L.side < 0 ? Math.PI : 0))
    const sw = Math.sin(g + phase) * amp
    if (sitK && L.front) { L.hip.rotation.z = -r.body.rotation.z + 0.08; L.knee.rotation.z = -0.05; continue }
    if (sitK) { L.hip.rotation.z = -r.body.rotation.z + 1.35; L.knee.rotation.z = -2.3; continue }
    if (L.front) {
      // 抬起前身时前爪收在胸前；布雷时前爪交替刨动
      const tuck = rear * 1.6
      L.hip.rotation.z = -tuck + sw * 0.7 - (ph === 'plant' ? 0.5 + Math.sin(t * 16 + L.side) * 0.35 : 0)
      L.knee.rotation.z = tuck * 0.9 + Math.max(0, -sw) * 0.6
    } else {
      // 后肢补偿身体转角，保持脚掌着地
      L.hip.rotation.z = -r.body.rotation.z + sw * 0.6 + crouch * 0.3
      L.knee.rotation.z = Math.max(0, sw) * 0.5 - crouch * 0.4
    }
  }
  r.head.rotation.z = headPitch - rear * 0.6
  r.head.rotation.y = headYaw + (moving ? 0 : Math.sin(t * 0.7) * 0.1)
  r.jaw.rotation.z = -Math.max(0, jawOpen) * 0.5
  r.prey.visible = (s?.carry ?? 0) > 0
  // 耳：警觉竖起 / 逃跑贴后；尾：小跑时左右甩、冲刺时拖直
  const earK = ph === 'flee' ? 0.7 : ph === 'watch' || ph === 'sniff' ? -0.2 : Math.sin(t * 2.3) * 0.08
  r.earL.rotation.z = earK; r.earR.rotation.z = earK
  for (let i = 0; i < r.tail.length; i++) {
    const tl = r.tail[i]
    tl.rotation.y = Math.sin(t * (fast ? 5 : 2.2) - i * 0.8) * (fast ? 0.18 : 0.3)
    tl.rotation.z = (i === 0 ? 0.15 + rear * 0.5 : 0) + (fast ? 0.12 : Math.sin(t * 1.4 + i) * 0.06)
  }
  if (r.led) (r.led.material as THREE.MeshBasicMaterial).color.set((s?.bubbleT ?? 0) > 0 ? (Math.sin(t * 20) > 0 ? '#ff4a2a' : '#5a1008') : Math.sin(t * 2) > 0.6 ? '#ff4a2a' : '#4a0e06')
}

// ---------- 水豚种的装置：电击陷阱 / 土制炸弹 ----------
export function buildRatGearMesh(kind: 'trap' | 'bomb', seed = 0): THREE.Group {
  const grp = new THREE.Group()
  const R = rng(seed * 13 + 7)
  const iron = litMaterial({ color: '#3e4044' }), rust = litMaterial({ color: '#5a4434' })
  const tape = litMaterial({ color: '#b8b098' }), red = litMaterial({ color: '#b02a20' }), blk = litMaterial({ color: '#1e1e1e' })
  const led = new THREE.Mesh(new THREE.SphereGeometry(0.008, 6, 4), new THREE.MeshBasicMaterial({ color: '#ff3020' }))
  const wire = (pts: THREE.Vector3[], m: THREE.Material) => new THREE.Mesh(sweep(pts, () => 0.0028, { radial: 4, seg: 8 }), m)
  if (kind === 'trap') {
    // 捕兽夹（锈底板 + 一对锯齿夹颚）+ 一节 9V 电池 + 红黑电线缠在夹颚上
    grp.add(new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.016, 0.24), rust).translateY(0.008))
    grp.add(new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.012, 0.1), iron).translateY(0.022))
    const jaws: THREE.Group[] = []
    for (const sgn of [-1, 1]) {
      const jaw = new THREE.Group(); jaw.position.set(0, 0.022, 0)
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.007, 4, 18, Math.PI), iron); ring.rotation.x = -Math.PI / 2; ring.rotation.z = sgn < 0 ? Math.PI : 0
      jaw.add(ring)
      for (let k = 0; k < 7; k++) { const a = (k + 0.5) / 7 * Math.PI; const tooth = new THREE.Mesh(new THREE.ConeGeometry(0.008, 0.028, 3), iron); tooth.position.set(Math.cos(a) * 0.13, 0.012, sgn * Math.sin(a) * 0.13); jaw.add(tooth) }
      jaw.rotation.x = sgn * 1.2
      grp.add(jaw); jaws.push(jaw)
    }
    const bat = new THREE.Group(); bat.position.set(0.2, 0.025, -0.06 + R() * 0.12)
    bat.add(new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.05, 0.028), litMaterial({ color: '#2a5ad0' })))
    bat.add(new THREE.Mesh(new THREE.BoxGeometry(0.047, 0.016, 0.03), tape).translateY(0.008))
    grp.add(bat)
    grp.add(wire([V(0.2, 0.05, bat.position.z), V(0.15, 0.06, 0.02), V(0.08, 0.03, 0.09), V(0.0, 0.035, 0.12)], red))
    grp.add(wire([V(0.21, 0.05, bat.position.z - 0.01), V(0.16, 0.04, -0.05), V(0.05, 0.03, -0.12), V(-0.04, 0.035, -0.12)], blk))
    led.position.set(0.2, 0.056, bat.position.z); grp.add(led)
    grp.userData.jaws = jaws
  } else {
    // 土制炸弹：一截镀锌水管 + 两头管帽 + 胶带捆着的电池组 + 闪烁的红灯 + 外露线
    const pipe = new THREE.Group(); pipe.position.y = 0.04
    pipe.add(new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.22, 10).rotateZ(Math.PI / 2), litMaterial({ color: '#8a8c88' })))
    for (const x of [-0.12, 0.12]) pipe.add(new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.042, 0.03, 8).rotateZ(Math.PI / 2), iron).translateX(x))
    for (const x of [-0.05, 0.04]) pipe.add(new THREE.Mesh(new THREE.CylinderGeometry(0.037, 0.037, 0.02, 10).rotateZ(Math.PI / 2), tape).translateX(x))
    grp.add(pipe)
    const pack = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.035, 0.06), litMaterial({ color: '#3a3a30' })); pack.position.set(0, 0.09, 0.0); grp.add(pack)
    led.position.set(0.03, 0.11, 0.02); grp.add(led)
    grp.add(wire([V(-0.02, 0.1, 0.02), V(-0.06, 0.11, 0.05), V(-0.1, 0.07, 0.04), V(-0.13, 0.04, 0.0)], red))
    grp.add(wire([V(0.02, 0.1, -0.02), V(0.07, 0.12, -0.05), V(0.12, 0.06, -0.03)], blk))
  }
  bakeLeaves(grp, new Set([led]))
  grp.rotation.y = R() * Math.PI * 2
  grp.userData.led = led
  return grp
}
/** 每帧：陷阱触发后夹颚合拢；红灯闪烁（炸弹倒计时越来越快） */
export function animateRatGear(grp: THREE.Group, gear: { kind: string; sprung: boolean; fuse: number; t: number }, time: number) {
  const led = grp.userData.led as THREE.Mesh | undefined
  if (gear.kind === 'trap') {
    const jaws = grp.userData.jaws as THREE.Group[] | undefined
    const k = gear.sprung ? Math.min(1, gear.t / 0.08) : 0
    if (jaws) jaws.forEach((j, i) => { j.rotation.x = (i ? 1 : -1) * 1.2 * (1 - k) })
    if (led) (led.material as THREE.MeshBasicMaterial).color.set(gear.sprung ? '#2a0806' : Math.sin(time * 3) > 0.7 ? '#ff3020' : '#4a0e06')
  } else if (led) {
    const rate = gear.fuse >= 0 ? 14 + (1.4 - gear.fuse) * 30 : 2
    ;(led.material as THREE.MeshBasicMaterial).color.set(Math.sin(time * rate) > (gear.fuse >= 0 ? 0 : 0.85) ? '#ff3020' : '#3a0a04')
  }
}
