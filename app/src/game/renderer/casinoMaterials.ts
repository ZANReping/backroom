// [casino] Level 5.1 专属程序 PBR：逐像素烘焙 albedo / height→normal / roughness / metalness 到 canvas（按名字缓存，只烘一次）。
// 全部是这一层独有的表面，不复用 L5 材质：星纹地毯（ref8）、品红绒面 + 金色印刷线（ref7，21 点 / 轮盘 / 骰子三种印花）、抛光黑大理石、黄铜、胡桃木、
// 酒红皮革、霓虹灯管、灯泡、镜面 / 暗金藻井吊顶、墙纸；另有筹码面（红 1 / 蓝 5 / 黄 10 / 绿 20，边纹参照 ref1）与扑克牌面。
import * as THREE from 'three'
import type { CarpetKind } from '../content/casinoLayout'
/** 区域地毯平铺尺寸（米 / 一张贴图）与主图案直径（米）——验收要求主图案 0.4–0.6 m（ref8 实测约 0.5 m） */
export const CARPET_TILE: Record<CarpetKind, { tile: number; motif: number; label: string }> = {
  carpetBar: { tile: 0.8, motif: 0.54, label: '酒吧 · 棕橙星纹八角（ref8）' }, carpetFoyer: { tile: 1.1, motif: 0.55, label: '前厅 · 红金放射纹' },
  carpetCashier: { tile: 0.5, motif: 0.42, label: '兑换台 / 通道 · 深红金细回纹' }, carpetSlots: { tile: 1.0, motif: 0.46, label: '老虎机 · 深蓝紫底霓虹彩点（ref6）' },
  carpetTables: { tile: 0.9, motif: 0.52, label: '牌桌 · 酒红金大马士革' }, carpetVip: { tile: 0.8, motif: 0.46, label: 'VIP · 墨绿金暗纹' },
}

export type CasinoSurface = CarpetKind | 'feltBJ' | 'feltRoulette' | 'feltCraps' | 'marble' | 'brass' | 'walnut' | 'leather' | 'neon' | 'bulb' | 'ceiling' | 'wallpaper' | 'chipRed' | 'chipBlue' | 'chipYellow' | 'chipGreen' | 'card' | 'screen'
export const CASINO_SURFACES: CasinoSurface[] = ['carpetBar', 'carpetFoyer', 'carpetCashier', 'carpetSlots', 'carpetTables', 'carpetVip', 'feltBJ', 'feltRoulette', 'feltCraps', 'marble', 'brass', 'walnut', 'leather', 'neon', 'bulb', 'ceiling', 'wallpaper', 'chipRed', 'chipBlue', 'chipYellow', 'chipGreen', 'card', 'screen']
export interface CasinoBake { size: number; albedo: HTMLCanvasElement; normal: HTMLCanvasElement; rough: HTMLCanvasElement; metal: HTMLCanvasElement; nan: number; mean: [number, number, number] }

// ---- 噪声 ----
const hash = (x: number, y: number, s: number) => { let h = (x * 374761393 + y * 668265263 + s * 2147483647) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967296 }
function vnoise(x: number, y: number, s: number, per: number) {
  const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi, u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy)
  const w = (a: number) => ((a % per) + per) % per
  const a = hash(w(xi), w(yi), s), b = hash(w(xi + 1), w(yi), s), c = hash(w(xi), w(yi + 1), s), d = hash(w(xi + 1), w(yi + 1), s)
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v
}
/** 可平铺 fbm：u,v ∈ [0,1) */
const fbm = (u: number, v: number, f: number, s: number, oct = 4) => { let t = 0, a = 0.5, n = 0; for (let o = 0; o < oct; o++) { t += a * vnoise(u * f, v * f, s + o * 17, f); n += a; a *= 0.5; f *= 2 } return t / n }
const sm = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t) }
const hex = (h: string): [number, number, number] => [parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255]
const mix = (a: number[], b: number[], t: number): [number, number, number] => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]

type Px = (u: number, v: number) => { c: [number, number, number]; h: number; r: number; m: number }
const C = { carpetBg: hex('#2a130b'), black: hex('#0b0605'), orange: hex('#d5832c'), amber: hex('#f0a646'), felt: hex('#a3155a'), gold: hex('#d9b25a'), brass: hex('#b8913f'), walnut0: hex('#3b2215'), walnut1: hex('#6a4026'), leather: hex('#5a0e17'), paper0: hex('#3a0d14'), paper1: hex('#24070b') }

// 星纹地毯（ref8 酒吧）：八角星玫瑰花窗（橙 / 黑）+ 八角框 + 斜向链环 + 小方格底；平铺 0.8 m → 星直径约 0.54 m
const carpetBar: Px = (u, v) => {
  const x = u - 0.5, y = v - 0.5, d = Math.hypot(x, y), a = Math.atan2(y, x)
  const star = 0.27 + 0.07 * Math.cos(8 * a), fib = fbm(u, v, 64, 3, 2)
  let c = C.carpetBg, h = 0.5
  const chk = (Math.floor(u * 16) + Math.floor(v * 16)) % 2
  c = chk ? C.carpetBg : mix(C.carpetBg, C.black, 0.6)
  // 角上四分之一玫瑰（下一格的花）+ 斜链
  const cd = Math.hypot(Math.min(u, 1 - u), Math.min(v, 1 - v))
  if (cd < 0.11) c = cd < 0.05 ? C.black : C.orange
  const diag = Math.min(Math.abs(Math.abs(x) - Math.abs(y)), 1)
  if (diag < 0.022 && d > star + 0.03 && cd > 0.11) c = C.orange
  if (d < star) {
    c = C.orange
    const pet = Math.cos(8 * a + Math.PI / 8)
    if (d < 0.07) c = C.black
    else if (d < 0.1) c = C.amber
    else if (d > 0.13 && d < 0.2 && pet > 0.35) c = C.black
    if (d > star - 0.025) c = C.black
  }
  const oct = Math.max(Math.abs(x), Math.abs(y), (Math.abs(x) + Math.abs(y)) * 0.7071)
  if (Math.abs(oct - 0.4) < 0.014 && cd > 0.11) c = C.amber // 八角框
  c = mix(c, [c[0] * 0.75, c[1] * 0.75, c[2] * 0.75], 1 - fib)
  h = 0.45 + fib * 0.3
  return { c, h, r: 0.96, m: 0 }
}
// 品红绒面（ref7）——印花是在桌面贴图（整张，不平铺）上画的；这里给纤维与印花金线
function feltPx(kind: 'BJ' | 'Roulette' | 'Craps'): Px {
  return (u, v) => {
    const fib = fbm(u, v, 48, 11, 3), x = (u - 0.5) * 2, y = v * 1.35 // 桌面：u 横向，v 从庄家（0）到玩家（1）
    let c = mix(C.felt, [C.felt[0] * 0.7, C.felt[1] * 0.7, C.felt[2] * 0.7], 1 - fib), line = 0
    const ring = (cx: number, cy: number, r: number, w: number) => (Math.abs(Math.hypot(x - cx, y - cy) - r) < w ? 1 : 0)
    if (kind === 'BJ') {
      const R = Math.hypot(x, y)
      line = Math.max(ring(0, 0, 0.62, 0.012), ring(0, 0, 0.78, 0.012), Math.abs(R - 0.7) < 0.035 && Math.abs(Math.sin(Math.atan2(y, x) * 46)) < 0.35 && y > 0.12 ? 1 : 0) // 弧带 + 弧带里的「字」
      for (let i = 0; i < 7; i++) { const t = Math.PI * (0.13 + i * 0.123), r0 = 1.06; line = Math.max(line, ring(Math.cos(t) * r0, Math.sin(t) * r0, 0.085, 0.01), ring(Math.cos(t) * (r0 + 0.17), Math.sin(t) * (r0 + 0.17), 0.065, 0.01)) }
      line = Math.max(line, ring(0, 0, 0.25, 0.01) * (y > 0.05 ? 1 : 0))
    } else if (kind === 'Roulette') {
      // 下注格：3 × 12 网格 + 0 + 外围格
      const gx = (u - 0.12) / 0.8 * 12, gy = (v - 0.25) / 0.45 * 3
      if (gx > 0 && gx < 12 && gy > 0 && gy < 4.2) {
        const fx = gx - Math.floor(gx), fy = gy - Math.floor(gy)
        line = fx < 0.04 || fy < 0.06 ? 1 : 0
        if (gy < 3 && fx > 0.25 && fx < 0.75 && fy > 0.3 && fy < 0.7) { const red = (Math.floor(gx) + Math.floor(gy)) % 2 === 0; c = red ? mix(c, hex('#b8121b'), 0.85) : mix(c, hex('#140808'), 0.85) }
      }
      if (u < 0.12 && u > 0.05 && v > 0.25 && v < 0.7) line = Math.max(line, Math.abs(u - 0.05) < 0.005 ? 1 : 0)
    } else {
      line = Math.max(ring(0, 0.68, 0.32, 0.012), Math.abs(y - 0.25) < 0.01 || Math.abs(y - 1.15) < 0.01 ? 1 : 0, (Math.abs(x) - 0.88) ** 2 < 0.0001 ? 1 : 0)
      if (Math.abs(y - 0.95) < 0.07 && Math.abs(x) < 0.75) line = Math.max(line, Math.abs(Math.sin(x * 40)) < 0.3 ? 1 : 0) // PASS LINE 字
    }
    if (line) c = mix(C.gold, [1, 0.95, 0.75], fib * 0.3)
    return { c, h: 0.5 + fib * 0.15 + line * 0.05, r: line ? 0.55 : 0.97, m: line ? 0.35 : 0 }
  }
}
const fib2 = (u: number, v: number, s: number) => fbm(u, v, 64, s, 2)
const shade = (c: number[], f: number): [number, number, number] => mix(c, [c[0] * 0.72, c[1] * 0.72, c[2] * 0.72], 1 - f)
// 前厅：深红底 + 金色放射太阳纹圆章（16 道光芒 + 双圈）+ 角上四分之一圆章 + 细金格线
const carpetFoyer: Px = (u, v) => {
  const x = u - 0.5, y = v - 0.5, d = Math.hypot(x, y), a = Math.atan2(y, x), f = fib2(u, v, 81)
  const red = hex('#a8180e'), deep = hex('#5a0a06'), gold = hex('#eab84a'), pale = hex('#ffe29a')
  let c = mix(red, deep, sm(0.3, 0.5, d)), g = 0
  if (d < 0.25) { const ray = Math.abs(Math.cos(a * 8)); c = d < 0.06 ? pale : ray > 0.55 ? gold : mix(red, hex('#b0181e'), 0.6); g = 1; if (Math.abs(d - 0.18) < 0.012) c = pale }
  if (Math.abs(d - 0.25) < 0.012) { c = gold; g = 1 }
  if (d > 0.27 && d < 0.47 && Math.abs(Math.sin(a * 16)) < 0.06 * (0.47 - d) * 10) { c = mix(c, gold, 0.85); g = 1 }
  const cd = Math.hypot(Math.min(u, 1 - u), Math.min(v, 1 - v)); if (cd < 0.09) { c = cd < 0.04 ? gold : deep; g = 1 }
  if (Math.min(Math.abs(u - 0.5), Math.abs(v - 0.5)) < 0.006 && d > 0.27) { c = mix(c, gold, 0.6); g = 1 }
  return { c: shade(c, f), h: 0.45 + f * 0.3 + g * 0.04, r: 0.95, m: 0 }
}
// 兑换台 / 通道：深红底 + 金色细回纹（希腊回纹带）+ 小菱点；平铺 0.5 m
const carpetCashier: Px = (u, v) => {
  const f = fib2(u, v, 83), red = hex('#34030c'), gold = hex('#a87a28')
  const gx = Math.floor(u * 10), gy = Math.floor(v * 10), fx = u * 10 - gx, fy = v * 10 - gy
  // 外框回纹带（v 在 0..0.2 与 0.5..0.7）：按 10×10 网格画回字
  const band = (vv: number) => vv >= 0 && vv < 0.2
  let g = 0
  for (const off of [0, 0.5]) {
    const bv = v - off
    if (band(bv)) { const ly = Math.floor(bv * 10), lx = gx % 4; const fret = [[1, 1, 1, 1], [1, 0, 0, 1]][ly] ?? [0, 0, 0, 0]; if (fret[lx] && (fy > 0.25 && fy < 0.75 || fx > 0.25 && fx < 0.75)) g = 1; if (ly === 1 && lx === 1 && fx < 0.5 && fy > 0.25 && fy < 0.75) g = 1 }
  }
  const dx = Math.abs(u % 0.5 - 0.25), dy = Math.abs((v + 0.1) % 0.5 - 0.25) + 0.0
  if (dx + Math.abs(dy - 0.12) < 0.035) g = 1
  const c = g ? gold : red
  return { c: shade(c, f), h: 0.45 + f * 0.3 + g * 0.04, r: 0.95, m: 0 }
}
// 老虎机：深蓝紫底 + 霓虹彩色碎点 / 小圈 / 三角（ref6 暗色彩点）；平铺 1.0 m，每张 6×6 小格散落
const carpetSlots: Px = (u, v) => {
  const f = fib2(u, v, 85), bg = mix(hex('#0b0a2a'), hex('#1c0a33'), fbm(u, v, 3, 86, 3))
  const neon = ['#ff3fb4', '#2fe0ff', '#ffd23a', '#7a5cff', '#3aff9a', '#ff7a2a'].map(hex)
  let c: [number, number, number] = [bg[0], bg[1], bg[2]], g = 0
  const n = 6
  for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
    const cx = Math.floor(u * n) + i, cy = Math.floor(v * n) + j, wx = ((cx % n) + n) % n, wy = ((cy % n) + n) % n
    for (let k = 0; k < 3; k++) {
      const px = (cx + hash(wx, wy, 87 + k)) / n, py = (cy + hash(wx, wy, 90 + k)) / n, t = Math.floor(hash(wx, wy, 93 + k) * 4), col = neon[Math.floor(hash(wx, wy, 96 + k) * 6)]
      const dx = u - px, dy = v - py, d = Math.hypot(dx, dy), s = 0.018 + hash(wx, wy, 99 + k) * 0.02
      let hit = false
      if (t === 0) hit = d < s
      else if (t === 1) hit = Math.abs(d - s * 1.4) < 0.006
      else if (t === 2) { const a = Math.atan2(dy, dx); hit = d < s * 1.5 * (0.6 + 0.4 * Math.cos(3 * a)) && d < s * 1.5 }
      else hit = Math.abs(dx) < s * 1.6 && Math.abs(dy) < 0.004 || Math.abs(dy) < s * 1.6 && Math.abs(dx) < 0.004
      if (hit) { c = col; g = 1 }
    }
  }
  // 主图案：每张 1 个霓虹圈花（直径约 0.46 m）
  const d0 = Math.hypot(u - 0.5, v - 0.5)
  if (Math.abs(d0 - 0.21) < 0.01 || Math.abs(d0 - 0.23) < 0.004) { c = neon[1]; g = 1 }
  if (d0 < 0.21 && Math.abs(Math.cos(Math.atan2(v - 0.5, u - 0.5) * 6)) > 0.97 && d0 > 0.05) { c = neon[0]; g = 1 }
  return { c: shade(c, f), h: 0.45 + f * 0.3 + g * 0.04, r: 0.94, m: 0 }
}
// 牌桌：酒红底 + 金色大马士革（镜像花叶，极坐标花瓣 + 卷须）；平铺 0.9 m
const carpetTables: Px = (u, v) => {
  const f = fib2(u, v, 101), base = hex('#520a2c'), gold = hex('#c99a45'), dark = hex('#30051a')
  const x = Math.abs(u - 0.5) * 2, y = (v - 0.5) * 2 // 左右镜像
  let g = 0
  const leaf = (cx: number, cy: number, rx: number, ry: number) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 < 1
  if (leaf(0, 0, 0.16, 0.5) && !leaf(0, 0, 0.09, 0.4)) g = 1
  if (leaf(0.22, -0.12, 0.2, 0.1) && !leaf(0.22, -0.12, 0.13, 0.05)) g = 1
  if (leaf(0.18, 0.28, 0.14, 0.08)) g = 1
  if (Math.abs(Math.hypot(x - 0.32, y + 0.38) - 0.12) < 0.025 && y < -0.3) g = 1 // 卷须
  if (leaf(0, -0.62, 0.06, 0.06) || leaf(0, 0.62, 0.05, 0.08)) g = 1
  // 角上小花（相邻图案之间）
  const cd = Math.hypot(Math.min(u, 1 - u), Math.min(v, 1 - v)); if (cd < 0.06) g = 1
  let c = g ? gold : mix(base, dark, (Math.floor(u * 18) + Math.floor(v * 18)) % 2 * 0.25)
  if (!g && leaf(0, 0, 0.36, 0.62)) c = mix(c, hex('#5e0e1c'), 0.6) // 暗纹衬底
  return { c: shade(c, f), h: 0.45 + f * 0.3 + g * 0.05, r: 0.95, m: 0 }
}
// VIP：墨绿底 + 金色菱格暗纹 + 小鸢尾；平铺 0.8 m
const carpetVip: Px = (u, v) => {
  const f = fib2(u, v, 111), base = hex('#0c2a1e'), dark = hex('#061a12'), gold = hex('#b8954a')
  const x = u - 0.5, y = v - 0.5, dia = Math.abs(x) + Math.abs(y)
  let g = 0
  if (Math.abs(dia - 0.5) < 0.008) g = 1
  if (Math.abs(dia - 0.23) < 0.01) g = 1
  const a = Math.atan2(y, x), d = Math.hypot(x, y)
  if (d < 0.2 && d > 0.04 && Math.abs(Math.cos(a * 2)) > 0.9 - d) g = 0.7
  if (d < 0.035) g = 1
  const c = g ? mix(base, gold, g) : mix(base, dark, sm(0.1, 0.5, dia) * 0.6)
  return { c: shade(c, f), h: 0.45 + f * 0.3 + g * 0.04, r: 0.93, m: 0 }
}
const marble: Px = (u, v) => {
  const n = fbm(u, v, 3, 21, 5), w = fbm(u, v, 6, 23, 4)
  const vein = Math.pow(1 - Math.abs(Math.sin((u * 2 + v * 1 + n * 3.2) * Math.PI * 2)), 18) + 0.5 * Math.pow(1 - Math.abs(Math.sin((u * -1 + v * 3 + w * 2.6) * Math.PI * 2)), 30)
  const c = mix(mix(hex('#060506'), hex('#16131a'), w), hex('#c9c2b8'), Math.min(1, vein))
  return { c, h: 0.5 - vein * 0.05, r: 0.08 + vein * 0.12, m: 0 }
}
const brass: Px = (u, v) => { const s = fbm(u * 0.15, v * 8, 32, 31, 3), sp = fbm(u, v, 12, 33, 3); return { c: mix(C.brass, hex('#e2c27a'), s * 0.6 - sp * 0.25 + 0.15), h: 0.5 + s * 0.05, r: 0.22 + sp * 0.2, m: 1 } }
const walnut: Px = (u, v) => { const n = fbm(u, v, 4, 41, 4), g = Math.sin((v * 22 + n * 5) * Math.PI * 2) * 0.5 + 0.5, fl = fbm(u * 0.1, v * 4, 64, 43, 2); return { c: mix(C.walnut0, C.walnut1, Math.pow(g, 2.2) * 0.8 + fl * 0.25), h: 0.5 + g * 0.06 - fl * 0.04, r: 0.38 + (1 - g) * 0.15, m: 0 } }
const leather: Px = (u, v) => {
  // 卵石纹：取最近格点距离
  const f = 28, gx = u * f, gy = v * f, xi = Math.floor(gx), yi = Math.floor(gy)
  let d1 = 9; for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) { const X = xi + i, Y = yi + j, px = X + hash(((X % f) + f) % f, ((Y % f) + f) % f, 51), py = Y + hash(((X % f) + f) % f, ((Y % f) + f) % f, 52); d1 = Math.min(d1, Math.hypot(gx - px, gy - py)) }
  const n = fbm(u, v, 6, 53, 3), crease = sm(0.55, 0.75, d1)
  return { c: mix(C.leather, hex('#2a0509'), crease * 0.6 + (1 - n) * 0.3), h: 0.6 - crease * 0.3, r: 0.48 + crease * 0.25, m: 0 }
}
const neon: Px = (_u, v) => { const core = 1 - Math.abs(v - 0.5) * 2; return { c: mix(hex('#ff2a50'), [1, 0.9, 0.92], Math.pow(Math.max(0, core), 4)), h: 0.5 + core * 0.2, r: 0.15, m: 0 } }
const bulb: Px = (u, v) => { const d = Math.hypot(u - 0.5, v - 0.5), fil = Math.abs(v - 0.5) < 0.03 && Math.abs(u - 0.5) < 0.18 ? 1 : 0; return { c: mix(hex('#ffcf7a'), [1, 0.98, 0.9], Math.max(fil, sm(0.5, 0, d))), h: 0.5 - d * 0.2, r: 0.1, m: 0 } }
// 藻井吊顶：暗金框 + 镜面板（ref8 的金色层叠顶 + 筒灯）
const ceiling: Px = (u, v) => {
  const fx = Math.min(u, 1 - u), fy = Math.min(v, 1 - v), e = Math.min(fx, fy), n = fbm(u, v, 8, 61, 3)
  const frame = e < 0.09, bevel = e >= 0.09 && e < 0.12
  const c = frame ? mix(hex('#5a4220'), hex('#8c6a32'), n) : bevel ? hex('#c7a35a') : mix(hex('#141012'), hex('#2a2220'), n * 0.5)
  return { c, h: frame ? 0.62 : bevel ? 0.55 - (e - 0.09) * 3 : 0.4, r: frame ? 0.4 : bevel ? 0.25 : 0.06, m: frame || bevel ? 0.85 : 0.95 }
}
// 墙纸：酒红丝面 + 暗金菱格 + 扇形纹
const wallpaper: Px = (u, v) => {
  const x = u * 4, y = v * 4, fx = x - Math.floor(x) - 0.5, fy = y - Math.floor(y) - 0.5, dia = Math.abs(fx) + Math.abs(fy)
  const n = fbm(u, v, 32, 71, 2), lat = Math.abs(dia - 0.5) < 0.025 ? 1 : 0
  const fan = dia < 0.28 && Math.abs(Math.sin(Math.atan2(fy, fx) * 6)) > 0.65 && dia > 0.08 ? 1 : 0
  const g = Math.max(lat, fan)
  return { c: g ? mix(hex('#8a6a34'), hex('#c9a45a'), n) : mix(C.paper1, C.paper0, n), h: 0.5 + g * 0.08, r: g ? 0.42 : 0.82, m: g ? 0.7 : 0 }
}
// 筹码面（ref1）：主色 + 边缘 8 块白色嵌片 + 白色虚线内圈 + 骰点；u,v 映射整枚筹码顶面（圆外为侧边条纹，用 v>0.97 的一行）
function chipPx(main: string): Px {
  const M = hex(main), Wt = hex('#f2eee4')
  return (u, v) => {
    const x = u - 0.5, y = v - 0.5, d = Math.hypot(x, y) * 2, a = Math.atan2(y, x)
    let c = M
    if (d > 0.78 && d <= 1.02) { if (Math.cos(a * 8) > 0.55) c = Wt }
    else if (d > 0.6 && d < 0.66) { if (Math.sin(a * 36) > 0) c = Wt }
    else if (d > 0.66 && d < 0.78) { const k = Math.floor((a + Math.PI) / (Math.PI / 4)), ca = -Math.PI + (k + 0.5) * Math.PI / 4; const px = Math.cos(ca) * 0.36, py = Math.sin(ca) * 0.36; if (Math.hypot(x - px, y - py) < 0.018 || Math.hypot(x - px * 0.9, y - py * 0.9) < 0.014) c = Wt }
    if (d > 1.02) c = Math.cos(a * 8) > 0.55 ? Wt : M
    return { c, h: 0.5 + (d > 0.98 ? -0.1 : 0) + (d > 0.58 && d < 0.6 ? -0.08 : 0), r: 0.5, m: 0 }
  }
}
const card: Px = (u, v) => { const e = Math.min(u, 1 - u, v * 0.7, (1 - v) * 0.7), ink = (Math.hypot(u - 0.5, (v - 0.5) * 0.7) < 0.12) || (u < 0.2 && v < 0.18 && Math.abs(Math.sin(u * 60)) < 0.4); const red = ink; return { c: e < 0.025 ? hex('#d8d2c6') : red ? hex('#b0121c') : hex('#f4f0e6'), h: 0.5, r: 0.35, m: 0 } }
// 老虎机屏幕底（发光 / 动态由着色器给）：深蓝渐变 + 扫描线
const screen: Px = (_u, v) => ({ c: mix(hex('#0a1a3a'), hex('#4ac8ff'), (1 - v) * 0.6 + (Math.floor(v * 64) % 2) * 0.05), h: 0.5, r: 0.05, m: 0 })

const PX: Record<CasinoSurface, [Px, number]> = {
  carpetBar: [carpetBar, 512], carpetFoyer: [carpetFoyer, 512], carpetCashier: [carpetCashier, 256], carpetSlots: [carpetSlots, 512], carpetTables: [carpetTables, 512], carpetVip: [carpetVip, 384], feltBJ: [feltPx('BJ'), 512], feltRoulette: [feltPx('Roulette'), 512], feltCraps: [feltPx('Craps'), 512], marble: [marble, 256], brass: [brass, 128], walnut: [walnut, 256], leather: [leather, 256],
  neon: [neon, 32], bulb: [bulb, 32], ceiling: [ceiling, 256], wallpaper: [wallpaper, 256], chipRed: [chipPx('#b51a1e'), 128], chipBlue: [chipPx('#1f4fb8'), 128], chipYellow: [chipPx('#e0b417'), 128], chipGreen: [chipPx('#178a3c'), 128], card: [card, 128], screen: [screen, 64],
}
const bakes = new Map<CasinoSurface, CasinoBake>()
const mkCanvas = (n: number) => { const c = document.createElement('canvas') as HTMLCanvasElement; c.width = n; c.height = n; return c }
export function bakeCasinoSurface(name: CasinoSurface): CasinoBake {
  const hit = bakes.get(name); if (hit) return hit
  const [fn, n] = PX[name]
  const H = new Float32Array(n * n), A = new Uint8ClampedArray(n * n * 4), R = new Uint8ClampedArray(n * n * 4), Mt = new Uint8ClampedArray(n * n * 4), N = new Uint8ClampedArray(n * n * 4)
  let nan = 0; const mean: [number, number, number] = [0, 0, 0]
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const p = fn((i + 0.5) / n, (j + 0.5) / n), k = j * n + i, o = k * 4
    for (const q of [p.c[0], p.c[1], p.c[2], p.h, p.r, p.m]) if (!Number.isFinite(q)) nan++
    H[k] = p.h
    for (let ch = 0; ch < 3; ch++) { A[o + ch] = p.c[ch] * 255; mean[ch] += p.c[ch] / (n * n) }
    A[o + 3] = 255
    R[o] = R[o + 1] = R[o + 2] = p.r * 255; R[o + 3] = 255 // roughnessMap 读 G
    Mt[o] = Mt[o + 1] = Mt[o + 2] = p.m * 255; Mt[o + 3] = 255 // metalnessMap 读 B
  }
  const s = n / 64 * 3 // 法线强度随分辨率
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const h = (x: number, y: number) => H[((y + n) % n) * n + ((x + n) % n)]
    const dx = (h(i + 1, j) - h(i - 1, j)) * s, dy = (h(i, j + 1) - h(i, j - 1)) * s
    const l = Math.hypot(dx, dy, 1), o = (j * n + i) * 4
    N[o] = (-dx / l * 0.5 + 0.5) * 255; N[o + 1] = (dy / l * 0.5 + 0.5) * 255; N[o + 2] = (1 / l * 0.5 + 0.5) * 255; N[o + 3] = 255
    if (!Number.isFinite(dx) || !Number.isFinite(dy)) nan++
  }
  const put = (data: Uint8ClampedArray) => { const c = mkCanvas(n), g = c.getContext('2d')!; const im = g.createImageData(n, n); im.data.set(data); g.putImageData(im, 0, 0); return c }
  const b: CasinoBake = { size: n, albedo: put(A), normal: put(N), rough: put(R), metal: put(Mt), nan, mean }
  bakes.set(name, b)
  return b
}

const mats = new Map<string, THREE.MeshStandardMaterial>()
const tex = (c: HTMLCanvasElement, srgb: boolean, rep: number) => { const t = new THREE.CanvasTexture(c); t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rep, rep); t.anisotropy = 4; t.needsUpdate = true; return t }
const EMISSIVE: Partial<Record<CasinoSurface, [string, number]>> = { neon: ['#ff2a50', 3.0], bulb: ['#ffc870', 3.4], screen: ['#5ab8ff', 2.0] } // >1：管线 bloom 阈值以上
/** 反射环境（等距柱状 canvas，渲染器自动 PMREM）：暗金藻井 + 筒灯点阵 + 中段暖色辉光带 + 彩色屏幕光点 → 大理石 / 黄铜 / 漆木 / 绒面金线上的暖光反射 */
let envTex: THREE.Texture | null = null
export function casinoEnv(): THREE.Texture {
  if (envTex) return envTex
  const w = 512, h = 256, c = mkCanvas(w); c.height = h; const g = c.getContext('2d')!
  const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#2a1c10'); gr.addColorStop(0.42, '#6a3c1c'); gr.addColorStop(0.5, '#a0602a'); gr.addColorStop(0.56, '#3a1a10'); gr.addColorStop(1, '#120806')
  g.fillStyle = gr; g.fillRect(0, 0, w, h)
  for (let r = 0; r < 5; r++) for (let k = 0; k < 24; k++) { const x = (k + (r % 2) * 0.5) / 24 * w, y = 10 + r * 18; const rg = g.createRadialGradient(x, y, 0, x, y, 6); rg.addColorStop(0, '#fff6dc'); rg.addColorStop(1, 'rgba(255,200,120,0)'); g.fillStyle = rg; g.fillRect(x - 6, y - 6, 12, 12) }
  const cols = ['#4aa8ff', '#ff4fd0', '#3ff0e0', '#ffa040']
  for (let k = 0; k < 40; k++) { g.fillStyle = cols[k % 4]; g.globalAlpha = 0.7; g.fillRect((k * 53) % w, 118 + (k * 7) % 14, 8, 6) }
  g.globalAlpha = 1
  const t = new THREE.CanvasTexture(c); t.mapping = THREE.EquirectangularReflectionMapping; t.colorSpace = THREE.SRGBColorSpace; envTex = t; return t
}
const ENV_K: Partial<Record<CasinoSurface, number>> = { marble: 1.1, brass: 1.3, walnut: 0.45, leather: 0.35, ceiling: 0.9, feltBJ: 0.25, feltRoulette: 0.25, feltCraps: 0.25, wallpaper: 0.35, chipRed: 0.3, chipBlue: 0.3, chipYellow: 0.3, chipGreen: 0.3, card: 0.2, screen: 0.4 }
/** 共享材质（按 名字 + 平铺 缓存）；emissive 类可传 color 覆盖 */
export function casinoMaterial(name: CasinoSurface, repeat = 1, opts: { color?: string; emissive?: string; key?: string } = {}): THREE.MeshStandardMaterial {
  if (name === 'brass') repeat = 2 // 黄铜是细噪声，平铺次数不影响观感 → 统一一份材质（省绘制批次）
  const key = `${name}:${repeat}:${opts.key ?? ''}:${opts.color ?? ''}:${opts.emissive ?? ''}`
  const hit = mats.get(key); if (hit) return hit
  const b = bakeCasinoSurface(name)
  const m = new THREE.MeshStandardMaterial({ map: tex(b.albedo, true, repeat), normalMap: tex(b.normal, false, repeat), roughnessMap: tex(b.rough, false, repeat), metalnessMap: tex(b.metal, false, repeat), roughness: 1, metalness: 1 })
  if (opts.color) m.color.set(opts.color)
  if (name.startsWith('felt')) { m.emissive.set('#ffffff'); m.emissiveMap = m.map; m.emissiveIntensity = 0.38 } // 品红绒面在头顶聚光下发亮（ref7）
  const ek = ENV_K[name]; if (ek) { m.envMap = casinoEnv(); m.envMapIntensity = ek }
  const em = EMISSIVE[name]
  if (em || opts.emissive) { m.emissive.set(opts.emissive ?? em![0]); m.emissiveIntensity = em?.[1] ?? 2.2; m.emissiveMap = m.map }
  m.name = `casino-${name}`
  m.userData.casino = name
  mats.set(key, m)
  return m
}
export function disposeCasinoMaterials() { for (const m of mats.values()) { m.map?.dispose(); m.normalMap?.dispose(); m.roughnessMap?.dispose(); m.metalnessMap?.dispose(); m.dispose() } mats.clear() }
