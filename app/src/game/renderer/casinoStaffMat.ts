// [casino] 赌场员工程序 PBR：逐像素烘焙到 canvas（只烘一次、按名字缓存）。
//   布料贴图都是近白的「纹理底」，乘顶点色出各自颜色（同一套几何换色复用）：
//   skin 皮肤毛孔 · cloth 羊毛斜纹（西装 / 制服）· patch 补丁布（格纹 + 粗花呢）· wood 台球杆枫木 / 胡桃木纹 · fur 猩红长毛 · velvet 品红绒面（sheen）· leather 皮革
//   metal 黄铜 / 金（顶点色定色）· dark 黑亮漆（鞋 / 纽扣 / 口腔）
//   ball 台球图集（2048×1024）：Billy 的 4 号球头、Louie 的 5 号球眼、杆顶 14/3/9、手托 11、假肢人纽扣眼 15/1、帽带 $$、E164 三瞳主眼、
//        轮盘脸、老虎机 777（screen 材质自发光共用这张图集）
import * as THREE from 'three'
import { bakeLouieFace, bakeLouieFaceAsync, louieFaceCached, louieFaceDetail, LOUIE_PREVIEW_SIZE } from './casinoStaffLouieFace'

export type Tile = [number, number, number, number]
/** 图集分区（UV 0..1，v 向上） */
export const TILES: Record<string, Tile> = {
  billy: [0, 0.5, 0.5, 0.5], louieEye: [0.5, 0.5, 0.25, 0.5], e164Eye: [0.75, 0.5, 0.25, 0.5],
  ball14: [0, 0.25, 0.125, 0.25], ball3: [0.125, 0.25, 0.125, 0.25], ball9: [0.25, 0.25, 0.125, 0.25], ball11: [0.375, 0.25, 0.125, 0.25],
  button15: [0.5, 0.25, 0.125, 0.25], button1: [0.625, 0.25, 0.125, 0.25], hat: [0.75, 0.25, 0.125, 0.25], dice: [0.875, 0.25, 0.125, 0.25],
  roulette: [0, 0, 0.125, 0.25], slot: [0.125, 0, 0.25, 0.25],
}
type TileKind = { kind: 'ball'; num: number; label?: number; up?: number } | { kind: 'billy' } | { kind: 'e164' } | { kind: 'button'; num: number } | { kind: 'hat' } | { kind: 'roulette' } | { kind: 'slot' } | { kind: 'dice' }
const TILE_KIND: Record<string, TileKind> = {
  billy: { kind: 'billy' }, louieEye: { kind: 'ball', num: 5, label: 0.62 }, e164Eye: { kind: 'e164' },
  ball14: { kind: 'ball', num: 14 }, ball3: { kind: 'ball', num: 3 }, ball9: { kind: 'ball', num: 9 }, ball11: { kind: 'ball', num: 11 },
  button15: { kind: 'button', num: 15 }, button1: { kind: 'button', num: 1 }, hat: { kind: 'hat' }, dice: { kind: 'dice' }, roulette: { kind: 'roulette' }, slot: { kind: 'slot' },
}
/** 标准台球色（1–8 实色、9–15 同色花球） */
export const BALL_COL = ['#f2f2ee', '#f0b81c', '#1f4fb8', '#c8261e', '#5b2a8c', '#ec6a1a', '#1d7a3a', '#7a1d22', '#121212']
const hex = (h: string): [number, number, number] => [parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255]
const mix = (a: number[], b: number[], t: number): [number, number, number] => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
const sm = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t) }
const hash = (x: number, y: number, s: number) => { let h = (x * 374761393 + y * 668265263 + s * 2147483647) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967296 }
function vnoise(x: number, y: number, s: number, per: number) {
  const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi, u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy)
  const w = (a: number) => ((a % per) + per) % per
  const a = hash(w(xi), w(yi), s), b = hash(w(xi + 1), w(yi), s), c = hash(w(xi), w(yi + 1), s), d = hash(w(xi + 1), w(yi + 1), s)
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v
}
const fbm = (u: number, v: number, f: number, s: number, oct = 4) => { let t = 0, a = 0.5, n = 0; for (let o = 0; o < oct; o++) { t += a * vnoise(u * f, v * f, s + o * 17, f); n += a; a *= 0.5; f *= 2 } return t / n }

const mk = (w: number, h: number): HTMLCanvasElement => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c }

// ---------- 数字字形（canvas fillText → alpha 采样） ----------
const glyphs = new Map<string, { a: Uint8ClampedArray; n: number }>()
function glyph(s: string) {
  let g = glyphs.get(s)
  if (!g) {
    const n = 128, c = mk(n, n), x = c.getContext('2d')!
    x.fillStyle = '#000'; x.fillRect(0, 0, n, n); x.fillStyle = '#fff'; x.textAlign = 'center'; x.textBaseline = 'middle'
    const fs = s.length >= 3 ? 46 : s.length === 2 ? 74 : 100
    x.font = `bold ${fs}px "DejaVu Sans", "Noto Sans", Arial, sans-serif`; x.fillText(s, n / 2, n / 2 + fs * 0.04)
    const d = x.getImageData(0, 0, n, n).data, a = new Uint8ClampedArray(n * n)
    for (let i = 0; i < n * n; i++) a[i] = d[i * 4]
    glyphs.set(s, (g = { a, n }))
  }
  return g
}
/** 字形采样：x,y ∈ [-1,1]（y 向上） */
function gs(s: string, x: number, y: number) {
  const g = glyph(s), px = Math.floor((x * 0.5 + 0.5) * g.n), py = Math.floor((0.5 - y * 0.5) * g.n)
  if (px < 0 || py < 0 || px >= g.n || py >= g.n) return 0
  return g.a[py * g.n + px] / 255
}

// ---------- 图集像素 ----------
function tilePx(k: TileKind, s: number, t: number): [number, number, number] {
  if (k.kind === 'ball' || k.kind === 'billy' || k.kind === 'e164') {
    const u = s - 0.5, v = 1 - t
    const a = u * Math.PI * 2, l = (v - 0.5) * Math.PI
    const d = [Math.cos(l) * Math.sin(a), Math.sin(l), Math.cos(l) * Math.cos(a)]
    if (k.kind === 'e164') {
      // 三瞳主眼：泛黄粉的巩膜 + 边缘血丝 + 暗红虹膜环里三只静止猩红瞳孔（品字形）
      const ang = Math.acos(Math.max(-1, Math.min(1, d[2])))
      const vein = Math.pow(Math.abs(Math.sin(Math.atan2(d[1], d[0]) * 9 + fbm(s, t, 8, 5) * 9)), 30) * sm(0.6, 1.4, ang)
      let c = mix(hex('#efe0d2'), hex('#c98f86'), sm(0.9, 1.6, ang) * 0.8 + fbm(s, t, 16, 2) * 0.12)
      c = mix(c, hex('#a3121c'), Math.min(1, vein * 0.9))
      const ir = 0.62
      if (ang < ir) {
        const X = d[0] / Math.sin(ir), Y = d[1] / Math.sin(ir), rr = Math.hypot(X, Y)
        c = mix(hex('#4a0508'), hex('#8c0c12'), sm(0, 1, rr) * 0.6 + 0.25 * fbm(Math.atan2(Y, X) / 6.283 + 0.5, rr, 24, 9))
        for (let i = 0; i < 3; i++) {
          const pa = Math.PI / 2 + (i * Math.PI * 2) / 3, px = Math.cos(pa) * 0.42, py = Math.sin(pa) * 0.42 - 0.04
          const pd = Math.hypot(X - px, Y - py)
          if (pd < 0.27) c = mix(hex('#ff2a2a'), hex('#5a0000'), sm(0.08, 0.27, pd))
          if (pd < 0.1) c = mix(hex('#1a0000'), hex('#ff3b30'), sm(0.0, 0.1, pd) * 0.3)
        }
        c = mix(c, hex('#200204'), sm(0.85, 1.0, rr))
      }
      return c
    }
    if (k.kind === 'billy') {
      // 4 号紫球头：标签圆偏上，圆下方嘴缝（两侧暗月牙），其余紫色
      const base = hex(BALL_COL[4]), la = 0.43, up = 0.12
      const cz = Math.cos(up), sy = Math.sin(up)
      const cosang = d[1] * sy + d[2] * cz
      let c = mix(base, mix(base, hex('#2a1040'), 0.4), fbm(s, t, 6, 3) * 0.15)
      const X = d[0] / Math.sin(la), Y = (d[1] * cz - d[2] * sy) / Math.sin(la)
      if (cosang > Math.cos(la)) { c = hex('#f4f1e8'); const g = gs('4', X * 1.05, Y * 1.05 + 0.05); c = mix(c, hex('#141018'), g) }
      if (cosang > Math.cos(la + 0.012) && cosang <= Math.cos(la)) c = hex('#2a1a30')
      // 嘴：标签下缘两侧暗月牙（舌头从中间伸出）
      if (d[2] > 0) { const mx = d[0] / 0.25, my = (d[1] + 0.08) / 0.07; const m = mx * mx + my * my; if (m < 1 && Math.abs(d[0]) > 0.035) c = mix(hex('#140812'), c, sm(0.6, 1, m)) }
      return c
    }
    const num = k.num, stripe = num > 8, col = hex(BALL_COL[num > 8 ? num - 8 : num])
    let c: [number, number, number] = stripe ? (Math.abs(d[1]) < 0.47 ? col : hex('#f3f0e6')) : col
    const la = (k.label ?? 0.47) * 0.75
    if (d[2] > Math.cos(la)) {
      const X = d[0] / Math.sin(la), Y = d[1] / Math.sin(la)
      c = hex('#fbfaf6'); c = mix(c, hex('#111'), gs(String(num), X * 1.1, Y * 1.1))
      if (k.label) { const rr = Math.hypot(X, Y); if (rr > 0.84 && rr < 0.92) c = hex('#222') }
    }
    return c
  }
  const x = s * 2 - 1, y = t * -2 + 1, r = Math.hypot(x, y)
  if (k.kind === 'button') {
    const col = hex(BALL_COL[k.num > 8 ? k.num - 8 : k.num])
    let c = mix(col, hex('#2a1810'), sm(0.82, 0.98, r) * 0.65)
    if (r > 0.98) c = hex('#1a1010')
    if (r < 0.5) { c = hex('#f4efe2'); c = mix(c, hex('#151010'), gs(String(k.num), x / 0.5 * 1.05, y / 0.5 * 1.05)); if (r > 0.45) c = hex('#2a2020') }
    for (let i = 0; i < 4; i++) { const a = Math.PI / 4 + (i * Math.PI) / 2, hx2 = Math.cos(a) * 0.68, hy = Math.sin(a) * 0.68; const hd = Math.hypot(x - hx2, y - hy); if (hd < 0.075) c = hex('#0c0606') }
    // 树脂纽扣的流纹（真实缝线是几何，不再画在贴图上）
    c = mix(c, mix(c, hex('#ffffff'), 0.18), Math.pow(Math.abs(Math.sin((x * 3 + fbm(s, t, 6, 21) * 4) * 3)), 6) * sm(0.55, 0.7, r) * (1 - sm(0.8, 0.95, r)))
    return c
  }
  if (k.kind === 'hat') {
    let c = hex('#3a0c22')
    const g = Math.max(gs('$', (x + 0.45) * 1.6, y * 1.6), gs('$', (x - 0.45) * 1.6, y * 1.6))
    c = mix(c, hex('#e3b84e'), g)
    if (Math.abs(y) > 0.85) c = hex('#d9a93e')
    return c
  }
  if (k.kind === 'dice') return hex('#f4efe6')
  if (k.kind === 'roulette') {
    const a = Math.atan2(-y, x), i = Math.floor(((a / (Math.PI * 2)) + 1) * 37) % 37
    if (r > 0.97) return hex('#1a0d08')
    if (r > 0.88) return mix(hex('#c99a3c'), hex('#8a6420'), fbm(s, t, 20, 4))
    if (r > 0.58) { const sep = Math.abs(((a / (Math.PI * 2)) * 37 % 1 + 1) % 1 - 0.5) > 0.46; if (sep) return hex('#d9b25a'); const c = i === 0 ? hex('#127a3a') : i % 2 ? hex('#b0141c') : hex('#151012'); if (r > 0.8) { const g = gs(String(i), ((a / (Math.PI * 2)) * 37 % 1 + 1) % 1 * 2 - 1, (r - 0.84) / 0.06); return mix(c, hex('#f2ead8'), g * 0.9) } return c }
    if (r > 0.5) return hex('#d9b25a')
    return mix(hex('#5a3420'), hex('#8a5a34'), fbm(s, t, 14, 6))
  }
  // slot：三个滚轮窗（白底红 7）+ 金框
  const cell = Math.floor((x + 1) / (2 / 3)), lx = ((x + 1) % (2 / 3)) / (2 / 3) * 2 - 1
  if (Math.abs(lx) > 0.86 || Math.abs(y) > 0.8) return mix(hex('#c99a3c'), hex('#6a4a18'), fbm(s, t, 12, 7) * 0.5)
  const sh = 1 - 0.35 * y * y
  const c = mix(hex('#fff8ea'), hex('#d8102a'), gs('7', lx * 1.1, y * 1.0 - 0.02))
  void cell
  return [c[0] * sh, c[1] * sh, c[2] * sh]
}

let ATLAS: HTMLCanvasElement | null = null
export function bakeStaffAtlas(W = 2048, H = 1024): HTMLCanvasElement {
  if (ATLAS) return ATLAS
  const c = mk(W, H), x = c.getContext('2d')!, img = x.createImageData(W, H), D = img.data
  for (let i = 0; i < W * H; i++) { D[i * 4] = 40; D[i * 4 + 1] = 20; D[i * 4 + 2] = 30; D[i * 4 + 3] = 255 }
  for (const [name, T] of Object.entries(TILES)) {
    const k = TILE_KIND[name]
    const x0 = Math.round(T[0] * W), x1 = Math.round((T[0] + T[2]) * W), y0 = Math.round((1 - T[1] - T[3]) * H), y1 = Math.round((1 - T[1]) * H)
    for (let py = y0; py < y1; py++) for (let px = x0; px < x1; px++) {
      const s = (px + 0.5 - x0) / (x1 - x0), t = (py + 0.5 - y0) / (y1 - y0)
      const col = tilePx(k, s, t), o = (py * W + px) * 4
      D[o] = Math.round(Math.min(1, col[0]) * 255); D[o + 1] = Math.round(Math.min(1, col[1]) * 255); D[o + 2] = Math.round(Math.min(1, col[2]) * 255)
    }
  }
  x.putImageData(img, 0, 0)
  return (ATLAS = c)
}

// ---------- 平铺表面（写实化 v2：1024² 关键贴图；albedo 带色 tint + 高度 → 法线 + 粗糙度贴图）----------
//   频率都取整数（u、v 方向周期 1），保证可平铺。
type Px = (u: number, v: number) => { a: number; h: number; r?: number; tint?: [number, number, number] }
const TAU = Math.PI * 2
const wl = (u: number, v: number, a: number, b: number, w: number) => Math.sin(TAU * (a * u + b * v) + w)
const SURF: Record<string, Px> = {
  // 皮肤：毛孔（暗点、粗糙）+ 两向细纹 + 低频色斑（红 / 褐）+ 少量雀斑；高度给毛孔凹陷与细纹
  skin: (u, v) => {
    const warp = fbm(u, v, 4, 31, 3) * 5
    const pore = Math.pow(vnoise(u * 220, v * 220, 4, 220), 7), pore2 = Math.pow(vnoise(u * 90 + 0.5, v * 90, 5, 90), 9)
    const wr1 = Math.pow(1 - Math.abs(wl(u, v, 38, 11, warp)), 26), wr2 = Math.pow(1 - Math.abs(wl(u, v, -9, 31, warp * 1.3)), 30)
    const mot = fbm(u, v, 6, 32, 4), red = sm(0.5, 0.8, fbm(u, v, 3, 33, 3)), frk = Math.pow(vnoise(u * 40, v * 40, 34, 40), 14)
    const tint = mix(mix([1, 1, 1], [1.0, 0.82, 0.78], red * 0.55), [0.78, 0.6, 0.48], frk * 0.7)
    return { a: 0.9 + 0.08 * mot - pore * 0.12 - pore2 * 0.08 - (wr1 + wr2) * 0.04, h: mot * 0.25 - pore * 0.9 - pore2 * 0.6 - (wr1 + wr2) * 0.35, r: 0.85 + 0.25 * pore + 0.1 * (1 - mot), tint: tint as [number, number, number] }
  },
  // 羊毛精纺斜纹：2/2 斜纹（u+v 110 周）+ 经纬交织 + 起绒 / 毛粒
  cloth: (u, v) => {
    const tw = wl(u, v, 110, 110, 0) * 0.5 + 0.5, wp = wl(u, v, 220, 0, 0) * wl(u, v, 0, 220, 0), fz = fbm(u, v, 64, 2, 3), pill = Math.pow(vnoise(u * 60, v * 60, 3, 60), 10)
    return { a: 0.8 + 0.1 * tw + 0.06 * fz + 0.04 * wp + pill * 0.06, h: tw * 0.55 + wp * 0.15 + fz * 0.3, r: 0.95 + 0.05 * fz }
  },
  // 补丁：人字纹粗花呢 + 疏格 + 杂色毛点
  patch: (u, v) => {
    const band = Math.floor(u * 24), dir = band % 2 ? 1 : -1
    const hb = wl(u, v, 0, 72, dir * TAU * u * 24 * 0.5) * 0.5 + 0.5
    const g1 = sm(0.44, 0.5, Math.abs(((u * 4) % 1) - 0.5)), g2 = sm(0.44, 0.5, Math.abs(((v * 4) % 1) - 0.5))
    const nep = Math.pow(vnoise(u * 80, v * 80, 3, 80), 8), tw = fbm(u, v, 48, 3, 3)
    return { a: 0.66 + 0.18 * hb + 0.14 * tw - 0.22 * Math.max(g1, g2) + 0.25 * nep, h: hb * 0.6 + tw * 0.4 + nep * 0.3, r: 1, tint: nep > 0.3 ? [1.1, 1.05, 0.9] : undefined }
  },
  // 木：顺纹（v 方向 40 周 + 扰动）+ 导管孔 + 横向细磨痕（粗糙度升高）
  wood: (u, v) => {
    const r = u * 14 + fbm(u, v, 3, 8, 4) * 3, ring = Math.pow(Math.abs(Math.sin(r * Math.PI)), 0.5), pores = Math.pow(vnoise(u * 160, v * 18, 9, 160), 6)
    const scr = Math.pow(1 - Math.abs(wl(u, v, 3, 41, fbm(u, v, 5, 10, 2) * 8)), 60) * sm(0.55, 0.75, vnoise(u * 8, v * 8, 11, 8))
    return { a: 0.7 + 0.22 * ring - 0.12 * pores + 0.06 * scr, h: ring * 0.25 - pores * 0.5 - scr * 0.3, r: 0.8 + 0.8 * scr + 0.2 * pores }
  },
  fur: (u, v) => { const st = fbm(u * 3, v * 0.25, 48, 11, 3), cl = Math.pow(vnoise(u * 160, v * 16, 12, 160), 2); return { a: 0.55 + 0.45 * st - 0.2 * cl, h: st * 0.8 + cl * 0.4, r: 1 } },
  velvet: (u, v) => { const n = fbm(u, v, 40, 13, 3), pile = vnoise(u * 300, v * 300, 14, 300); return { a: 0.9 + 0.08 * n + 0.02 * pile, h: n * 0.5 + pile * 0.3, r: 1 } },
  leather: (u, v) => { const c = 1 - Math.pow(Math.abs(vnoise(u * 28, v * 28, 15, 28) - 0.5) * 2, 0.4), n = fbm(u, v, 20, 16, 3); return { a: 0.85 + 0.1 * n - 0.1 * c, h: n * 0.5 - c * 0.4, r: 0.9 + 0.3 * c } },
  // 黄铜：氧化斑（暗绿褐）+ 摩擦亮区 + 细划痕
  metal: (u, v) => {
    const ox = sm(0.55, 0.8, fbm(u, v, 5, 41, 4)), scr = Math.pow(1 - Math.abs(wl(u, v, 17, 5, fbm(u, v, 6, 42, 2) * 7)), 50), sp = Math.pow(vnoise(u * 90, v * 90, 43, 90), 10)
    return { a: 1 - 0.35 * ox - 0.25 * sp + 0.1 * scr, h: -ox * 0.2 - scr * 0.2, r: 0.8 + 0.9 * ox + 0.4 * sp - 0.3 * scr, tint: mix([1, 1, 1], [0.6, 0.75, 0.55], ox * 0.6) as [number, number, number] }
  },
}
const SIZE: Record<string, number> = { skin: 1024, cloth: 1024, patch: 1024, wood: 1024, fur: 512, velvet: 512, leather: 512, metal: 512 }
const surfCache = new Map<string, { albedo: HTMLCanvasElement; normal: HTMLCanvasElement; rough: HTMLCanvasElement }>()
export function bakeStaffSurface(name: string, size = SIZE[name] ?? 512) {
  let r = surfCache.get(name)
  if (r) return r
  const f = SURF[name], A = mk(size, size), N = mk(size, size), Rc = mk(size, size)
  const H = new Float32Array(size * size), ai = A.getContext('2d')!.createImageData(size, size), ni = N.getContext('2d')!.createImageData(size, size), ri = Rc.getContext('2d')!.createImageData(size, size)
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const p = f(x / size, y / size), o = (y * size + x); H[o] = p.h
    const t = p.tint ?? [1, 1, 1], a = Math.max(0, Math.min(1, p.a))
    for (let k = 0; k < 3; k++) ai.data[o * 4 + k] = Math.round(Math.min(1, a * t[k]) * 255)
    ai.data[o * 4 + 3] = 255
    const rr = Math.round(Math.max(0, Math.min(1, (p.r ?? 1) * 0.7)) * 255); ri.data[o * 4] = rr; ri.data[o * 4 + 1] = rr; ri.data[o * 4 + 2] = rr; ri.data[o * 4 + 3] = 255
  }
  const k = 2.5 * size / 256
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const at = (xx: number, yy: number) => H[((yy + size) % size) * size + ((xx + size) % size)]
    const dx = (at(x + 1, y) - at(x - 1, y)) * k, dy = (at(x, y + 1) - at(x, y - 1)) * k, l = Math.hypot(dx, dy, 1), o = (y * size + x) * 4
    ni.data[o] = Math.round((-dx / l * 0.5 + 0.5) * 255); ni.data[o + 1] = Math.round((dy / l * 0.5 + 0.5) * 255); ni.data[o + 2] = Math.round((1 / l * 0.5 + 0.5) * 255); ni.data[o + 3] = 255
  }
  A.getContext('2d')!.putImageData(ai, 0, 0); N.getContext('2d')!.putImageData(ni, 0, 0); Rc.getContext('2d')!.putImageData(ri, 0, 0)
  surfCache.set(name, (r = { albedo: A, normal: N, rough: Rc }))
  return r
}
/** 壳体毛丝贴图（512²，可平铺）：R = 每根毛的高度（0.25–1）、G = 毛丝截面（中心 1 → 边 0）。着色器：层号 > R 或 G < 层号 × 0.8 则裁掉（毛尖变细） */
let STRAND: HTMLCanvasElement | null = null
export function bakeStrandTexture(size = 512) {
  if (STRAND) return STRAND
  const c = mk(size, size), img = c.getContext('2d')!.createImageData(size, size), D = img.data, Ncell = 110, cs = size / Ncell
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const gi = Math.floor(x / cs), gj = Math.floor(y / cs)
    let best = 0, hgt = 0
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      const ci = ((gi + di) % Ncell + Ncell) % Ncell, cj = ((gj + dj) % Ncell + Ncell) % Ncell
      const px = (gi + di + 0.15 + 0.7 * hash(ci, cj, 71)) * cs, py = (gj + dj + 0.15 + 0.7 * hash(ci, cj, 72)) * cs
      const rad = cs * (0.42 + 0.3 * hash(ci, cj, 73)), d = Math.hypot(x + 0.5 - px, y + 0.5 - py) / rad
      const g = 1 - d
      if (g > best) { best = g; hgt = 0.25 + 0.75 * Math.pow(hash(ci, cj, 74), 0.6) }
    }
    const o = (y * size + x) * 4
    D[o] = Math.round(hgt * 255); D[o + 1] = Math.round(Math.max(0, best) * 255); D[o + 2] = 0; D[o + 3] = 255
  }
  c.getContext('2d')!.putImageData(img, 0, 0)
  return (STRAND = c)
}
/** 台球清漆的细划痕（与图集同尺寸 UV）：粗糙度贴图，底 0.5 灰 + 亮线划痕 */
let SCRATCH: HTMLCanvasElement | null = null
export function bakeBallScratches(W = 2048, H = 1024) {
  if (SCRATCH) return SCRATCH
  const c = mk(W, H), x = c.getContext('2d')!
  x.fillStyle = 'rgb(40,40,40)'; x.fillRect(0, 0, W, H)
  let seed = 9; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
  x.lineCap = 'round'
  for (let i = 0; i < 2600; i++) {
    const px = rnd() * W, py = rnd() * H, a = rnd() * TAU, L = 6 + rnd() * 50, b = (rnd() - 0.5) * 0.6
    const g = Math.round(90 + rnd() * 120); x.strokeStyle = `rgb(${g},${g},${g})`; x.lineWidth = 0.5 + rnd() * 1.1
    x.beginPath(); x.moveTo(px, py); x.quadraticCurveTo(px + Math.cos(a + b) * L * 0.5, py + Math.sin(a + b) * L * 0.5, px + Math.cos(a) * L, py + Math.sin(a) * L); x.stroke()
  }
  for (let i = 0; i < 900; i++) { const g = Math.round(70 + rnd() * 60); x.fillStyle = `rgb(${g},${g},${g})`; x.fillRect(rnd() * W, rnd() * H, 1.5, 1.5) }
  return (SCRATCH = c)
}
/** 每米重复次数（u, v）——UV 是米制（surf 的 su/sv 按周长 / 长度给） */
const REPEAT: Record<string, [number, number]> = { skin: [6, 6], cloth: [9, 9], patch: [7, 7], wood: [8, 1.2], fur: [5, 3], velvet: [8, 8], leather: [10, 10], metal: [6, 6] }

const tex = (c: HTMLCanvasElement, srgb: boolean, rep: [number, number]) => { const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rep[0], rep[1]); t.anisotropy = 1; if (srgb) t.colorSpace = THREE.SRGBColorSpace; return t }
/** 次表面近似（包裹光照偏红透光）+ 逐顶点粗糙度（aRgh：嘴 / 舌 / 眼睑 / 接缝湿润区给低值）。只改直接光漫反射一行 */
function skinPatch(m: THREE.MeshPhysicalMaterial, sss: string, wetK = 1) {
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = 'attribute float aRgh;\nvarying float vRgh;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvRgh = aRgh;')
    const pars = THREE.ShaderChunk.lights_physical_pars_fragment.replace('vec3 irradiance = dotNL * directLight.color;',
      `vec3 irradiance = dotNL * directLight.color;\n\t{ float wrapNL = saturate( ( dot( geometryNormal, directLight.direction ) + 0.5 ) / 1.5 ); irradiance += directLight.color * ${sss} * max( wrapNL - dotNL, 0.0 ); }`)
    sh.fragmentShader = 'varying float vRgh;\n' + sh.fragmentShader.replace('#include <lights_physical_pars_fragment>', pars)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>\nroughnessFactor *= mix(1.0, clamp(vRgh / 0.62, 0.22, 1.25), ${wetK.toFixed(2)});`)
  }
  m.customProgramCacheKey = () => 'casinoSkin' + sss + wetK
  return m
}
/** 壳体毛：毛丝贴图逐层裁剪；根部按层号变暗（自阴影），毛尖略透光提亮 */
function shellPatch(m: THREE.MeshStandardMaterial) {
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = 'attribute float aEx;\nvarying float vEx;\nvarying vec2 vSUv;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvEx = aEx; vSUv = uv * 4.0;')
    sh.fragmentShader = 'uniform sampler2D tStrand;\nvarying float vEx;\nvarying vec2 vSUv;\n' + sh.fragmentShader
      .replace('#include <alphatest_fragment>', `vec4 sd = texture2D( tStrand, vSUv );\nif ( sd.r < vEx || sd.g < vEx * 0.85 + 0.05 ) discard;\ndiffuseColor.rgb *= mix( 0.86, 1.03, vEx ) * mix( 0.94, 1.0, sd.r );`)
    sh.uniforms.tStrand = { value: STRAND_T }
  }
  m.customProgramCacheKey = () => 'casinoShell'
  return m
}
let STRAND_T: THREE.Texture | null = null
let MATS: THREE.Material[] | null = null
/** 材质表，下标 = SM 材质号 */
export function staffMaterials(): THREE.Material[] {
  if (MATS) return MATS
  const S = (name: string, p: THREE.MeshPhysicalMaterialParameters) => { const b = bakeStaffSurface(name), rep = REPEAT[name]; return new THREE.MeshPhysicalMaterial({ vertexColors: true, map: tex(b.albedo, true, rep), normalMap: tex(b.normal, false, rep), roughnessMap: tex(b.rough, false, rep), ...p }) }
  const atlas = new THREE.CanvasTexture(bakeStaffAtlas()); atlas.colorSpace = THREE.SRGBColorSpace; atlas.anisotropy = 8
  const scr = new THREE.CanvasTexture(bakeBallScratches()); scr.anisotropy = 8
  STRAND_T = new THREE.CanvasTexture(bakeStrandTexture()); STRAND_T.wrapS = STRAND_T.wrapT = THREE.RepeatWrapping; STRAND_T.minFilter = THREE.LinearFilter; STRAND_T.generateMipmaps = false
  MATS = [
    skinPatch(S('skin', { roughness: 0.62, normalScale: new THREE.Vector2(0.55, 0.55), specularIntensity: 0.55, roughnessMap: null }), 'vec3(0.32, 0.075, 0.045)', 1),
    S('cloth', { roughness: 0.95, normalScale: new THREE.Vector2(0.75, 0.75), specularIntensity: 0.25, sheen: 0.25, sheenRoughness: 0.85, sheenColor: new THREE.Color('#3a3838') }),
    S('patch', { roughness: 1, normalScale: new THREE.Vector2(1.1, 1.1), specularIntensity: 0.2, sheen: 0.4, sheenRoughness: 0.8, sheenColor: new THREE.Color('#57524a') }),
    S('wood', { roughness: 0.55, clearcoat: 0.8, clearcoatRoughness: 0.14, normalScale: new THREE.Vector2(0.35, 0.35) }),
    S('metal', { metalness: 1, roughness: 0.4, normalScale: new THREE.Vector2(0.25, 0.25) }),
    new THREE.MeshPhysicalMaterial({ vertexColors: true, map: atlas, roughness: 0.22, roughnessMap: scr, clearcoat: 1, clearcoatRoughness: 0.05, clearcoatRoughnessMap: scr }),
    new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.38, clearcoat: 0.35, clearcoatRoughness: 0.2 }),
    S('fur', { roughness: 0.85, normalScale: new THREE.Vector2(1.0, 1.0), specularIntensity: 0.35, roughnessMap: null }),
    S('velvet', { roughness: 0.92, sheen: 0.35, sheenColor: new THREE.Color('#4a4448'), sheenRoughness: 0.7, normalScale: new THREE.Vector2(0.4, 0.4), specularIntensity: 0.2 }),
    new THREE.MeshStandardMaterial({ vertexColors: true, map: atlas, emissiveMap: atlas, emissive: new THREE.Color('#ffffff'), emissiveIntensity: 1.1, roughness: 0.25 }),
    S('leather', { roughness: 0.55, normalScale: new THREE.Vector2(0.5, 0.5), clearcoat: 0.2, clearcoatRoughness: 0.4 }),
    shellPatch(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, side: THREE.DoubleSide, alphaTest: 0.5 })),
    louieFaceMaterial(),
  ]
  // 细管（发束 / 眉毛 / 线）上导数切线退化 → 法线贴图扰动后的法线可能背光 / NaN（发白）：退回未扰动法线
  for (const m of MATS) {
    if (!(m as THREE.MeshPhysicalMaterial).normalMap) continue
    const prev = m.onBeforeCompile.bind(m), key = m.customProgramCacheKey.bind(m)
    m.onBeforeCompile = (sh, r) => { prev(sh, r); sh.fragmentShader = sh.fragmentShader.replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\nif ( any( isnan( normal ) ) || dot( normal, nonPerturbedNormal ) < 0.35 ) normal = nonPerturbedNormal;') }
    m.customProgramCacheKey = () => key() + '|nfix'
  }
  MATS.forEach((m, i) => (m.name = 'staff-' + ['skin', 'cloth', 'patch', 'wood', 'metal', 'ball', 'dark', 'fur', 'velvet', 'screen', 'leather', 'shell', 'face'][i]))
  return MATS
}

/** Louie 脸（第四轮）：2048² 专属 albedo / normal / roughness（casinoStaffLouieFace），头曲面 UV 一圈 = U 0..1（RepeatWrapping 跨正前接缝）；照片细节异步叠加 */
function louieFaceMaterial() {
  // [casino 阶段 4] 先用 256² 预览（约 1/64 成本，几十毫秒）；2048² 在 idle 回调里分块烘完再换图（之前同步烘 2048² 首次生成 15–20 s 卡死主线程）
  const full = louieFaceCached(), b = full ?? bakeLouieFace(LOUIE_PREVIEW_SIZE)
  const T = (c: HTMLCanvasElement, srgb: boolean) => { const t = new THREE.CanvasTexture(c); t.wrapS = THREE.RepeatWrapping; t.wrapT = THREE.ClampToEdgeWrapping; t.anisotropy = 8; if (srgb) t.colorSpace = THREE.SRGBColorSpace; return t }
  const map = T(b.albedo, true), normalMap = T(b.normal, false), roughnessMap = T(b.rough, false)
  const swap = (B: { albedo: HTMLCanvasElement; normal: HTMLCanvasElement; rough: HTMLCanvasElement }) => { for (const [t, c] of [[map, B.albedo], [normalMap, B.normal], [roughnessMap, B.rough]] as [THREE.Texture, HTMLCanvasElement][]) { if (t.image === c) continue; t.dispose(); t.image = c; t.needsUpdate = true } }
  if (!full) void bakeLouieFaceAsync().then(swap)
  void louieFaceDetail([map, normalMap])
  return skinPatch(new THREE.MeshPhysicalMaterial({ vertexColors: true, map, normalMap, roughnessMap, roughness: 1, normalScale: new THREE.Vector2(0.4, 0.4), specularIntensity: 0.5 }), 'vec3(0.32, 0.075, 0.045)', 1)
}
/** 员工贴图里需要异步加载的部分（Louie 脸照片细节）完成 */
export const staffTexturesReady = () => louieFaceDetail()
