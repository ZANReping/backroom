// [l5items v2] 写实维多利亚 / 爱德华时代喇叭留声机（Object 18 客房陷阱版 'new' + 休息室做旧版 'old'）。
// 结构（正面 +Z，原点在地面中心，单位 m）：
//   车削雕花四脚 → 红木柜座（倒角圆角盒 + 门板 + 黄铜拉手）→ 线脚顶板 → 机芯木盒（倒角）+ 黄铜铭牌 + 右侧摇柄
//   → 毡垫转盘 + 虫胶唱片（沟纹法线 + 中心标签「陌生又熟悉」）→ 鹅颈唱臂（唱头 + 唱针）→ 弯管 + 八瓣花瓣喇叭（内壁暗、外壁抛光、铆钉缝）。
// 贴图：pbrCanvas 程序生成颜色 / 法线 / 粗糙度 / 金属度；木纹沿 UV u 方向（盒面长边），喇叭分瓣缝在 u = k/8（与车削分瓣同位）。
// 动画句柄（userData，LOD0/LOD1 各一份，updateStructs 驱动）：spins[] 转盘组、arms[] 唱臂抬起组（rotation.x）、horns[] 喇叭组、
//   intact[] 完整唱片、shards[] 碎唱片、platters[] 转盘（砸烂时歪斜）。applyPhonographState(grp, {arm, broke, dent}) 统一摆姿态。
import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { pbrSet, pbrMaterial, rng, type Ctx } from './pbrCanvas'

export type PhonoVariant = 'new' | 'old'
const CJK = '"Noto Serif SC","Noto Sans SC","Source Han Sans SC","PingFang SC",serif'
const PETALS = 8

// ---------------- 贴图 ----------------
function woodSet(v: PhonoVariant) {
  const old = v === 'old'
  const base = old ? ['#4a2618', '#5e321f', '#3a1c12'] : ['#6e2414', '#8a3420', '#561a0e']
  const grain = (x: Ctx, s: number, R: () => number, mode: 'c' | 'h') => {
    // 年轮纹：沿 u（横向）流动的正弦纹 + 节疤
    for (let y = 0; y < s; y += 1) {
      const k = Math.sin(y * .09 + Math.sin(y * .013) * 6) * .5 + .5, k2 = Math.sin(y * .41 + Math.sin(y * .05) * 3) * .5 + .5
      if (mode === 'c') { x.fillStyle = `rgba(${k > .6 ? '30,10,4' : '255,190,140'},${(Math.abs(k - .6) * .22 + k2 * .05).toFixed(3)})` }
      else x.fillStyle = `rgba(255,255,255,${(.08 + k * .14 + k2 * .05).toFixed(3)})`
      x.fillRect(0, y, s, 1)
    }
    for (let i = 0; i < 1400; i++) { // 导管孔
      const px = R() * s, py = R() * s, l = 6 + R() * 26
      x.fillStyle = mode === 'c' ? `rgba(20,6,2,${.06 + R() * .1})` : 'rgba(0,0,0,.18)'; x.fillRect(px, py, l, 1)
    }
    for (let i = 0; i < 3; i++) { // 节疤
      const cx = R() * s, cy = R() * s
      for (let r = 26; r > 2; r -= 3) { x.strokeStyle = mode === 'c' ? `rgba(30,10,4,${.05 + (26 - r) * .006})` : 'rgba(0,0,0,.06)'; x.beginPath(); x.ellipse(cx, cy, r * 2.6, r, 0, 0, Math.PI * 2); x.stroke() }
    }
  }
  const joinery = (x: Ctx, s: number, col: string, w: number) => { // 盒面四周榫接线 + 45° 斜接角
    x.strokeStyle = col; x.lineWidth = w; const m = s * .055
    x.strokeRect(m, m, s - 2 * m, s - 2 * m)
    x.beginPath(); for (const [a, b, c, d] of [[0, 0, m, m], [s, 0, s - m, m], [0, s, m, s - m], [s, s, s - m, s - m]]) { x.moveTo(a, b); x.lineTo(c, d) } x.stroke()
  }
  return pbrSet('phono-wood-' + v, {
    size: 512, normalStrength: 1.1,
    color: (x, s) => {
      const R = rng(old ? 77 : 18), g = x.createLinearGradient(0, 0, s, s); g.addColorStop(0, base[0]); g.addColorStop(.5, base[1]); g.addColorStop(1, base[2])
      x.fillStyle = g; x.fillRect(0, 0, s, s); grain(x, s, R, 'c')
      joinery(x, s, 'rgba(20,6,2,.55)', 3)
      if (old) { // 磨损：边缘露出浅色木、划痕、积灰
        x.strokeStyle = 'rgba(190,130,80,.35)'; x.lineWidth = 10; x.strokeRect(4, 4, s - 8, s - 8)
        for (let i = 0; i < 90; i++) { x.strokeStyle = `rgba(200,150,100,${.1 + R() * .25})`; x.lineWidth = .8 + R(); const px = R() * s, py = R() * s, a = R() * Math.PI; x.beginPath(); x.moveTo(px, py); x.lineTo(px + Math.cos(a) * (10 + R() * 60), py + Math.sin(a) * (10 + R() * 60)); x.stroke() }
        for (let i = 0; i < 26; i++) { x.fillStyle = `rgba(160,150,130,${.05 + R() * .08})`; x.beginPath(); x.ellipse(R() * s, R() * s, 20 + R() * 60, 10 + R() * 30, R() * 3, 0, Math.PI * 2); x.fill() }
      } else { // 清漆高光带
        const h = x.createLinearGradient(0, 0, 0, s); h.addColorStop(0, 'rgba(255,220,190,.10)'); h.addColorStop(.3, 'rgba(255,220,190,0)'); h.addColorStop(1, 'rgba(0,0,0,.08)'); x.fillStyle = h; x.fillRect(0, 0, s, s)
      }
    },
    height: (x, s) => { const R = rng(old ? 78 : 19); x.fillStyle = '#808080'; x.fillRect(0, 0, s, s); grain(x, s, R, 'h'); joinery(x, s, '#000', 4); if (old) for (let i = 0; i < 120; i++) { x.fillStyle = 'rgba(0,0,0,.3)'; x.fillRect(R() * s, R() * s, 4 + R() * 30, 1.5) } },
    rough: (x, s) => { const R = rng(5); x.fillStyle = old ? '#9a9a9a' : '#3c3c3c'; x.fillRect(0, 0, s, s); for (let i = 0; i < 600; i++) { x.fillStyle = `rgba(255,255,255,${R() * (old ? .25 : .08)})`; x.fillRect(R() * s, R() * s, 8, 2) } if (old) { x.strokeStyle = 'rgba(255,255,255,.4)'; x.lineWidth = 12; x.strokeRect(4, 4, s - 8, s - 8) } },
  })
}
function brassSet(v: PhonoVariant, inner = false) {
  const old = v === 'old'
  const seams = (x: Ctx, s: number, col: string, w: number, rivet: string) => {
    for (let k = 0; k <= PETALS; k++) {
      const u = (k / PETALS) * s; x.strokeStyle = col; x.lineWidth = w; x.beginPath(); x.moveTo(u, 0); x.lineTo(u, s); x.stroke()
      for (let j = 1; j < 12; j++) { x.fillStyle = rivet; x.beginPath(); x.arc(u + (j % 2 ? 5 : -5), (j / 12) * s, 3.2, 0, Math.PI * 2); x.fill() }
    }
    x.strokeStyle = col; x.lineWidth = w * 2.2; x.beginPath(); x.moveTo(0, 6); x.lineTo(s, 6); x.stroke() // 口沿卷边（v=1 在画布顶）
  }
  return pbrSet(`phono-brass-${v}${inner ? '-in' : ''}`, {
    size: 512, normalStrength: 3,
    color: (x, s) => {
      const R = rng(old ? 91 : 31)
      const g = x.createLinearGradient(0, 0, s, 0)
      const stops = inner ? ['#3a2a10', '#5a4218', '#2a1e0a'] : old ? ['#8a6a2a', '#b08a40', '#6e5222'] : ['#f6d478', '#d9a83e', '#fbe7a0']
      for (let i = 0; i < 9; i++) g.addColorStop(i / 8, stops[i % 3])
      x.fillStyle = g; x.fillRect(0, 0, s, s)
      for (let i = 0; i < 260; i++) { x.strokeStyle = `rgba(${R() < .5 ? '255,245,210' : '60,40,8'},${.05 + R() * .08})`; x.lineWidth = .6; const px = R() * s, py = R() * s; x.beginPath(); x.moveTo(px, py); x.lineTo(px + (R() - .5) * 40, py + R() * 6); x.stroke() }
      if (old && !inner) { // 氧化：暗斑 + 铜绿
        for (let i = 0; i < 40; i++) { x.fillStyle = `rgba(40,25,8,${.08 + R() * .15})`; x.beginPath(); x.ellipse(R() * s, R() * s, 10 + R() * 50, 6 + R() * 30, R() * 3, 0, Math.PI * 2); x.fill() }
        for (let i = 0; i < 22; i++) { x.fillStyle = `rgba(70,140,110,${.15 + R() * .3})`; x.beginPath(); x.ellipse(R() * s, s * (.5 + R() * .5), 4 + R() * 18, 3 + R() * 10, R() * 3, 0, Math.PI * 2); x.fill() }
      }
      seams(x, s, inner ? 'rgba(10,6,0,.6)' : 'rgba(80,50,10,.65)', 2.5, inner ? 'rgba(90,70,30,.8)' : old ? 'rgba(200,170,90,.9)' : 'rgba(255,240,190,.95)')
    },
    height: (x, s) => { x.fillStyle = '#808080'; x.fillRect(0, 0, s, s); if (old) { const R = rng(4); for (let i = 0; i < 160; i++) { const g = x.createRadialGradient(0, 0, 0, 0, 0, 1); void g; x.fillStyle = 'rgba(0,0,0,.18)'; x.beginPath(); x.arc(R() * s, R() * s, 4 + R() * 8, 0, Math.PI * 2); x.fill() } } seams(x, s, '#202020', 4, '#ffffff') },
    rough: (x, s) => { const R = rng(9); x.fillStyle = inner ? '#b0b0b0' : old ? '#7a7a7a' : '#2a2a2a'; x.fillRect(0, 0, s, s); for (let i = 0; i < 400; i++) { x.fillStyle = `rgba(255,255,255,${R() * .12})`; x.fillRect(R() * s, R() * s, 12, 1) } },
    metal: (x, s) => { x.fillStyle = inner ? '#aaaaaa' : '#ffffff'; x.fillRect(0, 0, s, s); if (old && !inner) { const R = rng(91); for (let i = 0; i < 22; i++) { x.fillStyle = 'rgba(0,0,0,.8)'; x.beginPath(); x.ellipse(R() * s, s * (.5 + R() * .5), 4 + R() * 18, 3 + R() * 10, R() * 3, 0, Math.PI * 2); x.fill() } } },
  })
}
export function recordSet(label = '陌生又熟悉', key = 'phono-record') {
  const groove = (x: Ctx, s: number, col: (r: number) => string) => { const c = s / 2; for (let r = s * .47; r > s * .17; r -= 1.5) { x.strokeStyle = col(r); x.lineWidth = 1; x.beginPath(); x.arc(c, c, r, 0, Math.PI * 2); x.stroke() } }
  return pbrSet(key, {
    size: 512, normalStrength: .45,
    color: (x, s) => {
      const c = s / 2, R = rng(66); x.fillStyle = '#121112'; x.fillRect(0, 0, s, s)
      groove(x, s, (r) => `rgba(255,255,255,${(.02 + (Math.sin(r * 1.7) * .5 + .5) * .03 + (r % 40 < 2 ? .06 : 0)).toFixed(3)})`)
      const sh = x.createLinearGradient(0, 0, s, s); sh.addColorStop(.35, 'rgba(255,255,255,0)'); sh.addColorStop(.5, 'rgba(255,255,255,.07)'); sh.addColorStop(.65, 'rgba(255,255,255,0)'); x.fillStyle = sh; x.fillRect(0, 0, s, s)
      // 标签
      x.fillStyle = '#7a1418'; x.beginPath(); x.arc(c, c, s * .16, 0, Math.PI * 2); x.fill()
      x.strokeStyle = '#d8b25a'; x.lineWidth = 2; x.beginPath(); x.arc(c, c, s * .15, 0, Math.PI * 2); x.stroke(); x.beginPath(); x.arc(c, c, s * .105, 0, Math.PI * 2); x.stroke()
      x.fillStyle = '#e8c56a'; x.textAlign = 'center'; x.textBaseline = 'middle'
      if (label) { x.font = `bold ${Math.round(s * .034)}px ${CJK}`; x.fillText(label, c, c - s * .06); x.font = `${Math.round(s * .02)}px ${CJK}`; x.fillText('无尽圆舞曲 · 78 r.p.m.', c, c + s * .06) }
      x.fillStyle = '#d8d0c0'; x.beginPath(); x.arc(c, c, s * .012, 0, Math.PI * 2); x.fill()
      for (let i = 0; i < 60; i++) { x.fillStyle = `rgba(255,255,255,${R() * .05})`; x.fillRect(R() * s, R() * s, 1, 1) }
    },
    height: (x, s) => { x.fillStyle = '#808080'; x.fillRect(0, 0, s, s); groove(x, s, (r) => (Math.floor(r / 1.5) % 2 ? '#8c8c8c' : '#747474')) },
    rough: (x, s) => { x.fillStyle = '#4a4a4a'; x.fillRect(0, 0, s, s); x.fillStyle = '#909090'; x.beginPath(); x.arc(s / 2, s / 2, s * .16, 0, Math.PI * 2); x.fill() },
  })
}
function feltSet() {
  return pbrSet('phono-felt', {
    size: 256, normalStrength: 1,
    color: (x, s) => { const R = rng(12); x.fillStyle = '#2e4a2e'; x.fillRect(0, 0, s, s); for (let i = 0; i < 4000; i++) { x.fillStyle = `rgba(${R() < .5 ? '10,20,10' : '90,120,80'},${R() * .25})`; x.fillRect(R() * s, R() * s, 1, 1) } },
    height: (x, s) => { const R = rng(13); x.fillStyle = '#808080'; x.fillRect(0, 0, s, s); for (let i = 0; i < 5000; i++) { x.fillStyle = R() < .5 ? '#000' : '#fff'; x.globalAlpha = .15; x.fillRect(R() * s, R() * s, 1, 1) } x.globalAlpha = 1 },
  })
}
function plateSet(v: PhonoVariant) {
  return pbrSet('phono-plate-' + v, {
    size: 256, normalStrength: 2,
    color: (x, s) => {
      const g = x.createLinearGradient(0, 0, s, s); g.addColorStop(0, v === 'old' ? '#9a7a3a' : '#f2d27a'); g.addColorStop(1, v === 'old' ? '#6a5020' : '#b8892e'); x.fillStyle = g; x.fillRect(0, 0, s, s)
      x.strokeStyle = 'rgba(60,40,8,.8)'; x.lineWidth = 6; x.strokeRect(10, 60, s - 20, s - 120)
      x.save(); x.translate(s / 2, s / 2); x.scale(1 / 3.6 * 1.6, 1); x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillStyle = 'rgba(50,30,6,.95)'
      x.font = `bold 46px ${CJK}`; x.fillText('HOTEL GRAMOPHONE', 0, -14); x.font = `30px ${CJK}`; x.fillText('恐怖旅馆 · 第五层', 0, 30); x.restore()
    },
    height: (x, s) => { x.fillStyle = '#808080'; x.fillRect(0, 0, s, s); x.strokeStyle = '#000'; x.lineWidth = 6; x.strokeRect(10, 60, s - 20, s - 120) },
  })
}

// ---------------- 几何 ----------------
const V2 = (a: readonly (readonly [number, number])[]) => a.map(([r, y]) => new THREE.Vector2(r, y))
const tube = (pts: [number, number, number][], r: number, seg: number, sides: number) => new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p))), seg, r, sides, false)
/** 八瓣花瓣喇叭：指数型车削，分瓣在 u=k/8 内凹（缝），瓣间外鼓；口沿按瓣起伏（花瓣口） */
function hornGeometry(seg: number, rings: number, len = .55, r0 = .02, r1 = .28) {
  const k = Math.log(r1 / r0) / len, pts: THREE.Vector2[] = []
  for (let i = 0; i < rings; i++) { const y = (i / (rings - 1)) * len; pts.push(new THREE.Vector2(r0 * Math.exp(k * y), y)) }
  const g = new THREE.LatheGeometry(pts, seg), pos = g.getAttribute('position'), uv = g.getAttribute('uv')
  for (let i = 0; i < pos.count; i++) {
    const u = uv.getX(i), vv = uv.getY(i), phi = u * Math.PI * 2, petal = Math.abs(Math.sin(PETALS * phi / 2))
    const bulge = 1 + .075 * vv * vv * (petal - .5), lift = vv > .97 ? .025 * petal : 0
    pos.setX(i, pos.getX(i) * bulge); pos.setZ(i, pos.getZ(i) * bulge); pos.setY(i, pos.getY(i) + lift)
  }
  // UV v 按 ∫ds/r 重新分布（保角：u 方向 1 ↔ 周长 2πr，v 同比例，喉部到口沿各处纹素宽高比恒定、无拉伸；分瓣缝仍在 u=k/8）
  const cum = [0]; for (let i = 1; i < rings; i++) { const a = pts[i - 1], b = pts[i]; cum.push(cum[i - 1] + Math.hypot(b.x - a.x, b.y - a.y) / ((a.x + b.x) / 2)) }
  for (let i = 0; i < uv.count; i++) { const j = Math.round(uv.getY(i) * (rings - 1)); uv.setY(i, cum[j] / cum[rings - 1]) }
  g.computeVertexNormals(); g.userData.uvDone = true
  return g
}
/** UV 去拉伸：盒子 → 统一比例的主轴投影（木纹沿 u，宽高比正确）；圆柱侧面 → v 按 高/周长 压缩；管 → 绕向按 周长/长度 压缩 */
const fixed = new WeakMap<THREE.BufferGeometry, THREE.BufferGeometry>()
function fixUV(g0: THREE.BufferGeometry): THREE.BufferGeometry {
  const hit = fixed.get(g0); if (hit) return hit
  const isBox = g0.type === 'RoundedBoxGeometry' || g0.type === 'BoxGeometry'
  const g = isBox && g0.index ? g0.toNonIndexed() : g0
  fixed.set(g0, g)
  const uv = g.getAttribute('uv') as THREE.BufferAttribute | undefined, pos = g.getAttribute('position'), nor = g.getAttribute('normal')
  if (!uv) return g
  const P = (g0 as THREE.BufferGeometry & { parameters?: Record<string, number> & { path?: THREE.Curve<THREE.Vector3> } }).parameters ?? {}
  if (isBox) { // 每个三角形按自身面法线选投影轴（倒角处整三角形同轴，不撕裂）
    g.computeBoundingBox(); const bb = g.boundingBox!, sz = bb.getSize(new THREE.Vector3()), M = Math.max(sz.x, sz.y, sz.z)
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3()
    for (let i = 0; i < pos.count; i += 3) {
      a.fromBufferAttribute(pos, i); b.fromBufferAttribute(pos, i + 1).sub(a); c.fromBufferAttribute(pos, i + 2).sub(a); const n = b.cross(c)
      const nx = Math.abs(n.x), ny = Math.abs(n.y), nz = Math.abs(n.z)
      for (let k = i; k < i + 3; k++) {
        const x = (pos.getX(k) - bb.min.x) / M, y = (pos.getY(k) - bb.min.y) / M, z = (pos.getZ(k) - bb.min.z) / M
        if (nz >= nx && nz >= ny) uv.setXY(k, x, y); else if (nx >= ny) uv.setXY(k, z, y); else uv.setXY(k, x, z)
      }
    }
  } else if (g.type === 'CylinderGeometry') {
    const r = Math.max(P.radiusTop ?? .01, P.radiusBottom ?? .01), k = Math.min(1, (P.height ?? 1) / (2 * Math.PI * r))
    for (let i = 0; i < pos.count; i++) if (Math.abs(nor.getY(i)) < .99) uv.setY(i, .5 + (uv.getY(i) - .5) * k)
  } else if (g.type === 'LatheGeometry' && !g.userData.uvDone) {
    const pts = (g0 as THREE.LatheGeometry).parameters.points; let L = 0, ra = 0
    for (let i = 1; i < pts.length; i++) L += pts[i].distanceTo(pts[i - 1])
    for (const p of pts) ra += p.x / pts.length
    const k = L / (2 * Math.PI * Math.max(1e-4, ra))
    for (let i = 0; i < uv.count; i++) { if (k < 1) uv.setY(i, uv.getY(i) * k); else uv.setX(i, uv.getX(i) / k) }
  } else if (g.type === 'TubeGeometry') {
    const L = P.path ? P.path.getLength() : 1, c = 2 * Math.PI * (P.radius ?? .01)
    for (let i = 0; i < uv.count; i++) { if (L > c) uv.setY(i, uv.getY(i) * c / L); else uv.setX(i, uv.getX(i) * L / c) }
  }
  uv.needsUpdate = true
  return g
}
const mesh = (g: THREE.BufferGeometry, m: THREE.Material, p: [number, number, number] = [0, 0, 0], r: [number, number, number] = [0, 0, 0]) => { const o = new THREE.Mesh(fixUV(g), m); o.position.set(...p); o.rotation.set(...r); return o }

interface Mats { recordDS: THREE.Material; wood: THREE.Material; woodDark: THREE.Material; brass: THREE.Material; brassIn: THREE.Material; record: THREE.Material; felt: THREE.Material; plate: THREE.Material; steel: THREE.Material }
const matCache = new Map<PhonoVariant, Mats>()
function mats(v: PhonoVariant): Mats {
  let m = matCache.get(v); if (m) return m
  const w = woodSet(v), b = brassSet(v), bi = brassSet(v, true), rec = recordSet(), f = feltSet(), pl = plateSet(v)
  m = {
    wood: pbrMaterial(w, v === 'old' ? .62 : .24, 0), woodDark: pbrMaterial(w, v === 'old' ? .7 : .3, 0, { color: '#b08070' }),
    brass: pbrMaterial(b, v === 'old' ? .45 : .2, 1), brassIn: pbrMaterial(bi, .6, .8, { side: THREE.BackSide }),
    record: pbrMaterial(rec, .3, 0), recordDS: pbrMaterial(rec, .3, 0, { side: THREE.DoubleSide }), felt: pbrMaterial(f, .95, 0), plate: pbrMaterial(pl, .3, 1),
    steel: pbrMaterial(b, .25, 1, { color: '#d8d8e0' }),
  }
  matCache.set(v, m)
  return m
}

/** 臂座在 (0.17, *, -0.13)；唱针落点在唱片半径约 0.1 m 处 */
const PLATTER: [number, number, number] = [-0.04, 0.787, 0.02], ARM_BASE: [number, number, number] = [0.17, 0.805, -0.13], ARM_YAW = Math.PI - Math.asin(.56)
const HORN_THROAT: [number, number, number] = [0.12, 1.0, -0.16], HORN_TILT = .95

function buildLevel(v: PhonoVariant, lod: 0 | 1): THREE.Group {
  const M = mats(v), g = new THREE.Group(); g.name = `phonograph-${v}-lod${lod}`
  const hi = lod === 0
  // 四脚
  if (hi) {
    const leg = new THREE.LatheGeometry(V2([[0, 0], [.022, 0], [.026, .012], [.018, .03], [.03, .07], [.024, .11], [.017, .13], [.028, .15], [.028, .16], [0, .16]]), 14)
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(mesh(leg, M.woodDark, [sx * .24, 0, sz * .19]))
  } else for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(mesh(new THREE.BoxGeometry(.05, .16, .05), M.woodDark, [sx * .24, .08, sz * .19]))
  // 柜座 + 门板 + 拉手 + 顶板线脚
  g.add(mesh(hi ? new RoundedBoxGeometry(.56, .42, .46, 2, .016) : new THREE.BoxGeometry(.56, .42, .46), M.wood, [0, .37, 0]))
  if (hi) {
    g.add(mesh(new RoundedBoxGeometry(.46, .32, .016, 2, .006), M.wood, [0, .37, .232]))
    g.add(mesh(new RoundedBoxGeometry(.4, .26, .01, 1, .003), M.woodDark, [0, .37, .242]))
    g.add(mesh(new THREE.SphereGeometry(.012, 10, 8), M.brass, [.17, .37, .25]))
    g.add(mesh(new RoundedBoxGeometry(.6, .036, .5, 2, .01), M.woodDark, [0, .598, 0]))
    g.add(mesh(new RoundedBoxGeometry(.58, .03, .48, 2, .008), M.woodDark, [0, .17, 0]))
  } else g.add(mesh(new THREE.BoxGeometry(.6, .036, .5), M.woodDark, [0, .598, 0]))
  // 机芯木盒 + 顶沿 + 铭牌
  g.add(mesh(hi ? new RoundedBoxGeometry(.44, .15, .38, 3, .014) : new THREE.BoxGeometry(.44, .15, .38), M.wood, [0, .6925, 0]))
  if (hi) {
    g.add(mesh(new RoundedBoxGeometry(.46, .02, .4, 2, .006), M.woodDark, [0, .772, 0]))
    g.add(mesh(new RoundedBoxGeometry(.11, .03, .004, 1, .0015), M.plate, [0, .695, .1915]))
    for (const sx of [-1, 1]) g.add(mesh(new THREE.CylinderGeometry(.003, .003, .004, 8), M.brass, [sx * .05, .695, .194], [Math.PI / 2, 0, 0]))
  }
  // 摇柄（右侧 +X）
  g.add(mesh(new THREE.CylinderGeometry(.007, .007, .06, hi ? 10 : 6), M.steel, [.25, .69, .05], [0, 0, Math.PI / 2]))
  g.add(mesh(hi ? new THREE.CylinderGeometry(.018, .018, .01, 12) : new THREE.BoxGeometry(.01, .03, .03), M.brass, [.225, .69, .05], [0, 0, Math.PI / 2]))
  g.add(mesh(new THREE.BoxGeometry(.012, .1, .014), M.steel, [.283, .65, .05]))
  g.add(mesh(new THREE.CylinderGeometry(.006, .006, .05, 8), M.steel, [.31, .605, .05], [0, 0, Math.PI / 2]))
  g.add(mesh(hi ? new THREE.LatheGeometry(V2([[0, 0], [.012, 0], [.016, .015], [.013, .04], [.015, .05], [0, .052]]), 12) : new THREE.CylinderGeometry(.014, .014, .05, 6), M.woodDark, [hi ? .312 : .337, .605, .05], [0, 0, -Math.PI / 2]))
  // 转盘组（spin）：毡垫 + 唱片 + 轴；碎片组
  const platter = new THREE.Group(); platter.position.set(...PLATTER); g.add(platter)
  platter.add(mesh(new THREE.CylinderGeometry(.148, .15, .014, hi ? 48 : 16), M.brass, [0, -.002, 0]))
  const spin = new THREE.Group(); platter.add(spin)
  spin.add(mesh(new THREE.CylinderGeometry(.145, .145, .003, hi ? 48 : 16), M.felt, [0, .0065, 0]))
  const rec = mesh(new THREE.CylinderGeometry(.135, .135, .003, hi ? 56 : 16), M.record, [0, .0095, 0]); spin.add(rec)
  spin.add(mesh(new THREE.CylinderGeometry(.004, .004, .022, 8), M.steel, [0, .015, 0]))
  const shards = new THREE.Group(); shards.visible = false; platter.add(shards)
  for (const [a0, a1, rr, y, tilt] of [[-.3, 1.9, .135, .012, .05], [2.0, 3.4, .12, .03, -.35], [3.5, 5.0, .11, -.06, .9]] as const) {
    const sh = new THREE.Shape(); sh.moveTo(0, 0); sh.absarc(0, 0, rr, a0, a1, false); sh.lineTo(Math.cos(a1) * .02, Math.sin(a1) * .02); sh.closePath()
    const geo = new THREE.ShapeGeometry(sh, hi ? 10 : 4); const pos = geo.getAttribute('position'), uv = geo.getAttribute('uv')
    for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i) / .3 + .5, pos.getY(i) / .3 + .5)
    shards.add(mesh(geo, M.recordDS, [0, y, 0], [-Math.PI / 2 + tilt, 0, a0]))
  }
  // 唱臂：臂座 + 偏航组 + 抬起组（rotation.x 正 = 唱头升起）
  g.add(mesh(new THREE.CylinderGeometry(.024, .03, .03, hi ? 16 : 8), M.brass, [ARM_BASE[0], .79, ARM_BASE[2]]))
  const yaw = new THREE.Group(); yaw.position.set(...ARM_BASE); yaw.rotation.y = ARM_YAW; g.add(yaw)
  const lift = new THREE.Group(); yaw.add(lift)
  lift.add(mesh(tube([[0, 0, 0], [0, .025, -.05], [0, .03, -.14], [0, .022, -.22], [0, .004, -.262]], .0075, hi ? 24 : 6, hi ? 10 : 5), M.brass))
  const head = new THREE.Group(); head.position.set(0, -.008, -.27); lift.add(head)
  head.add(mesh(new THREE.CylinderGeometry(.03, .03, .014, hi ? 24 : 10), M.brass, [0, 0, 0], [Math.PI / 2, 0, 0])) // 唱头（膜盒，竖立）
  if (hi) {
    head.add(mesh(new THREE.CylinderGeometry(.022, .022, .016, 20), M.steel, [0, 0, 0], [Math.PI / 2, 0, 0]))
    head.add(mesh(new THREE.BoxGeometry(.004, .03, .004), M.steel, [0, -.03, 0])) // 唱针杆
    head.add(mesh(new THREE.ConeGeometry(.002, .008, 6), M.steel, [0, -.048, 0], [Math.PI, 0, 0])) // 唱针
  }
  // 喇叭：弯管 + 支架 + 花瓣喇叭（外抛光 / 内暗）
  g.add(mesh(tube([[ARM_BASE[0], .81, ARM_BASE[2]], [ARM_BASE[0], .88, -.18], [.15, .95, -.19], HORN_THROAT], .018, hi ? 20 : 6, hi ? 12 : 6), M.brass))
  if (hi) g.add(mesh(tube([[-.15, .775, -.17], [-.1, .95, -.12], [.02, 1.13, .02]], .005, 12, 6), M.steel))
  const horn = new THREE.Group(); horn.position.set(...HORN_THROAT); horn.rotation.x = HORN_TILT; g.add(horn)
  const hg = hornGeometry(hi ? 64 : 16, hi ? 16 : 6)
  horn.add(mesh(hg, M.brass)); horn.add(mesh(hg, M.brassIn))
  if (hi) horn.add(mesh(new THREE.CylinderGeometry(.026, .02, .03, 16), M.brass, [0, .005, 0]))
  if (v === 'old') { horn.rotation.z = .04 }
  g.userData.parts = { spin, lift, horn, platter, rec, shards }
  return g
}

export interface PhonoState { arm?: number; broke?: number; dent?: number }
/** 统一摆姿态：唱臂抬起（0..1 → 0..0.24 rad，约升起 6 cm）、砸烂（喇叭瘪下垂、转盘歪、唱片碎）、受击凹陷（每下喇叭横向压扁 6%） */
export function applyPhonographState(root: THREE.Object3D, st: PhonoState) {
  const levels = (root.userData.levels as THREE.Group[] | undefined) ?? []
  for (const lv of levels) {
    const p = lv.userData.parts as { spin: THREE.Group; lift: THREE.Group; horn: THREE.Group; platter: THREE.Group; rec: THREE.Mesh; shards: THREE.Group }
    const broke = !!st.broke, dent = Math.min(4, st.dent ?? 0)
    p.lift.rotation.x = broke ? -.12 : Math.max(0, Math.min(1, st.arm ?? 0)) * .24
    p.lift.rotation.z = broke ? .5 : 0
    p.horn.rotation.x = HORN_TILT - (broke ? .75 : dent * .04)
    p.horn.rotation.z = (lv.name.includes('-old') ? .04 : 0) + (broke ? .55 : dent * .03)
    p.horn.scale.set(1 - (broke ? .3 : dent * .06), broke ? .8 : 1, 1 - (broke ? .12 : dent * .02))
    p.platter.rotation.z = broke ? .16 : 0
    p.rec.visible = !broke; p.shards.visible = broke
  }
}
/** 留声机（LOD0 近 / LOD1 远 9 m 外）。返回的组 userData：levels / spins / lod */
export function buildPhonograph(v: PhonoVariant, st: PhonoState = {}): THREE.Group {
  const root = new THREE.Group(); root.name = `phonograph-${v}`
  const l0 = buildLevel(v, 0), l1 = buildLevel(v, 1)
  const lod = new THREE.LOD(); lod.addLevel(l0, 0); lod.addLevel(l1, 9); root.add(lod)
  root.userData.levels = [l0, l1]
  root.userData.spins = [l0.userData.parts.spin, l1.userData.parts.spin]
  root.userData.lod = lod
  applyPhonographState(root, st)
  return root
}
