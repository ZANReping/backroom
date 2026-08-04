// v35 精致天空盒（系统重置）：2048×1024 等距柱状投影程序化天空——
//   · 三段大气垂直渐变 + 日/月方位前向散射暖调
//   · 日光盘（柔和边缘 + 内晕 + 广域光轮）/ 月盘（环形山 + 明暗交界 + 冷晕）
//   · 分级星野（暗星尘 / 亮星十字芒 / 蓝橙双色，水平无缝）
//   · 银河光带（大圆弧轨道 + fBm 尘埃纹理 + 暗尘带，仅夜空层）
//   · 双层云：低层 fBm 积云（向阳银边 + 地平霾化）+ 高层拉伸卷云，x 向晶格周期化保证 360° 无缝
//   · 地平辉光带沿方位起伏（霓虹/工业光），亮度噪声调制
//   · 全图抖动去色带；逐层确定性生成（同层恒定），CanvasTexture 按层缓存
import * as THREE from 'three'
import type { GameMap } from '../mapgen'
import type { LevelDef } from '../types'

export interface SkyProfile {
  zenith: string
  zenithMid?: string
  horizon: string
  haze: string
  stars?: number // 星野密度 0..1
  milkyWay?: number // 银河光带强度 0..1（仅夜空层）
  clouds?: { density: number; color: string; alpha: number; cirrus?: number }
  sun?: { az: number; elv: number; size: number; color: string; glow: string }
  moon?: { az: number; elv: number; size: number; color: string }
  horizonGlow?: { color: string; alpha: number }[] // 低角度地平光晕（霓虹/工业光）
  sunLight?: number
  sunColor?: string
}

// 有室外场景的层级：L2 管道（昏灰工业霾）/ L3 发电站（工业夜）/ L4 办公室（雾灰）/
// L5 酒店（夜蓝霓虹）/ L7 深海（海面阴云）/ L9 郊区（午夜银河）/ L10 丰收（阴沉铅灰）/ L11 不夜城（白昼）
export const SKY_PROFILES: Record<number, SkyProfile> = {
  2: {
    zenith: '#4c463e', zenithMid: '#5a5348', horizon: '#6e6355', haze: '#38342d',
    clouds: { density: 0.55, color: '#756c5e', alpha: 0.24, cirrus: 0.15 },
    sun: { az: 210, elv: 22, size: 13, color: '#e8dcc4', glow: '#b3a488' },
    horizonGlow: [{ color: '#c98850', alpha: 0.07 }],
    sunLight: 0.3, sunColor: '#d8cbb2',
  },
  3: {
    zenith: '#070a12', zenithMid: '#101523', horizon: '#232f45', haze: '#0a0e16',
    stars: 0.8, milkyWay: 0.35,
    clouds: { density: 0.14, color: '#161d2e', alpha: 0.18 },
    moon: { az: 300, elv: 38, size: 14, color: '#e8edf5' },
    horizonGlow: [
      { color: '#e8a24c', alpha: 0.13 },
      { color: '#ff7a3c', alpha: 0.07 },
    ],
    sunLight: 0.06, sunColor: '#b8c4d8',
  },
  4: {
    zenith: '#868e93', zenithMid: '#798185', horizon: '#6a7276', haze: '#4e5458',
    clouds: { density: 0.62, color: '#939ca0', alpha: 0.28, cirrus: 0.2 },
    sun: { az: 160, elv: 30, size: 13, color: '#eef3f4', glow: '#c3cbce' },
    sunLight: 0.5, sunColor: '#e6ecee',
  },
  5: {
    zenith: '#0a1226', zenithMid: '#16264a', horizon: '#31487c', haze: '#121a30',
    stars: 0.55, milkyWay: 0.3,
    clouds: { density: 0.18, color: '#1a2a50', alpha: 0.2 },
    moon: { az: 280, elv: 42, size: 16, color: '#ecf1f8' },
    horizonGlow: [
      { color: '#ff5f9e', alpha: 0.16 },
      { color: '#78b4ff', alpha: 0.12 },
    ],
    sunLight: 0.08, sunColor: '#9fb0d8',
  },
  7: {
    zenith: '#41545f', zenithMid: '#465c68', horizon: '#4b6572', haze: '#2e3d46',
    clouds: { density: 0.5, color: '#5c6f76', alpha: 0.26, cirrus: 0.1 },
    sun: { az: 200, elv: 20, size: 11, color: '#d3dde1', glow: '#8ba4b0' },
    sunLight: 0.35, sunColor: '#c2ccd2',
  },
  9: {
    zenith: '#070b18', zenithMid: '#111832', horizon: '#27314f', haze: '#0a0f1e',
    stars: 1, milkyWay: 0.85,
    clouds: { density: 0.08, color: '#101828', alpha: 0.16 },
    moon: { az: 60, elv: 48, size: 20, color: '#f2f5fb' },
    horizonGlow: [
      { color: '#6a5a9a', alpha: 0.12 },
      { color: '#3a4a7a', alpha: 0.08 },
    ],
    sunLight: 0.12, sunColor: '#b8c6e0',
  },
  10: {
    zenith: '#9ea2a6', zenithMid: '#8f9398', horizon: '#83878b', haze: '#5c6165',
    clouds: { density: 0.82, color: '#b0b4b7', alpha: 0.32, cirrus: 0.25 },
    sunLight: 0.22, sunColor: '#d0d4d6',
  },
  11: {
    zenith: '#3a7abd', zenithMid: '#6fa3cf', horizon: '#b9cbd4', haze: '#7d8a92',
    clouds: { density: 0.45, color: '#f4f8fa', alpha: 0.55, cirrus: 0.3 },
    sun: { az: 120, elv: 52, size: 15, color: '#fff8e0', glow: '#ffe9a8' },
    horizonGlow: [{ color: '#ffd9a0', alpha: 0.06 }],
    sunLight: 1.15, sunColor: '#ffedc0',
  },
}

const CW = 2048
const CH = 1024
// 贴图布局：行 0 = 天顶 → 行 CH = 地平线（半球网格 uv.y 从 1 到 0 覆盖整张贴图高度，
// 不是旧版误以为的"只取上半张"——旧布局导致下半张霾色渲染在 el<45° 的低空、天顶暗色压成黑色圆盖）

type RGB = [number, number, number]

// 手工解析 hex（不走 THREE.Color，避免色彩管理把 sRGB 转成线性值写进 sRGB 纹理）
function rgb(hex: string): RGB {
  const n = parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}
const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v)
const smoothstep = (a: number, b: number, v: number) => {
  const t = clamp01((v - a) / (b - a))
  return t * t * (3 - 2 * t)
}
const wrapDeg = (d: number) => ((d + 540) % 360) - 180
const D2R = Math.PI / 180

// 确定性伪随机（按层恒定，天空每次重建一致）
function rngFrom(seed: number) {
  let s = (seed >>> 0) || 1
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296)
}

// x 向晶格周期化的 value noise / fBm：period 为 x 向周期（八度翻倍仍为整数周期），
// 采样跨 360° 接缝时图案连续——云/银河/辉光调制环绕无缝
function makeNoise(seed: number) {
  const s = seed | 0
  const hash = (x: number, y: number) => {
    let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ s
    h = Math.imul(h ^ (h >>> 13), 1274126177)
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296
  }
  const vn = (x: number, y: number, period: number) => {
    const ix = Math.floor(x), iy = Math.floor(y)
    const fx = x - ix, fy = y - iy
    const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy)
    const xa = ((ix % period) + period) % period
    const xb = (xa + 1) % period
    const a = hash(xa, iy), b = hash(xb, iy), c = hash(xa, iy + 1), d = hash(xb, iy + 1)
    return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy
  }
  const fbm = (x: number, y: number, period: number, oct: number) => {
    let v = 0, amp = 0.5, norm = 0, p = period, fx = x, fy = y
    for (let i = 0; i < oct; i++) {
      v += vn(fx, fy, p) * amp
      norm += amp
      amp *= 0.5; fx *= 2; fy *= 2; p *= 2
    }
    return v / norm
  }
  return { hash, vn, fbm }
}

// 双线性采样浮点网格（x 环绕）——云/银河纹理先低分辨率算好再放大，柔软元素无可见损耗
function sampleGrid(buf: Float32Array, gw: number, gh: number, x: number, y: number) {
  const fx = clamp01(x / (gw - 1)) * (gw - 1)
  const fy = clamp01(y / (gh - 1)) * (gh - 1)
  const ix = Math.floor(fx), iy = Math.floor(fy)
  const tx = fx - ix, ty = fy - iy
  const ix1 = (ix + 1) % gw
  const i00 = iy * gw + ix, i10 = iy * gw + ix1, i01 = i00 + gw, i11 = i10 + gw
  const top = buf[i00] + (buf[i10] - buf[i00]) * tx
  const bot = buf[i01] + (buf[i11] - buf[i01]) * tx
  return top + (bot - top) * ty
}

interface Splatter {
  add: (x: number, y: number, c: RGB, k: number) => void
  over: (x: number, y: number, c: RGB, a: number) => void
}

function makeSplatter(d: Uint8ClampedArray): Splatter {
  const at = (x: number, y: number) => (y * CW + (((x % CW) + CW) % CW)) * 4
  return {
    add(x, y, c, k) {
      const i = at(x | 0, y | 0)
      d[i] = Math.min(255, d[i] + c[0] * k)
      d[i + 1] = Math.min(255, d[i + 1] + c[1] * k)
      d[i + 2] = Math.min(255, d[i + 2] + c[2] * k)
    },
    over(x, y, c, a) {
      const i = at(x | 0, y | 0)
      d[i] += (c[0] - d[i]) * a
      d[i + 1] += (c[1] - d[i + 1]) * a
      d[i + 2] += (c[2] - d[i + 2]) * a
    },
  }
}

function renderSky(ctx: CanvasRenderingContext2D, p: SkyProfile, seed: number) {
  const img = ctx.createImageData(CW, CH)
  const d = img.data
  const zen = rgb(p.zenith), mid = rgb(p.zenithMid ?? p.zenith), hor = rgb(p.horizon), haze = rgb(p.haze)
  const noise = makeNoise(seed * 2654435761 + 97)
  const rnd = rngFrom(seed * 7919 + 17)
  const { sun, moon } = p
  const sunGlow = sun ? rgb(sun.glow) : null
  const moonGlow: RGB = [196, 214, 244]
  const glows = (p.horizonGlow ?? []).map((g) => ({ c: rgb(g.color), a: g.alpha }))
  const mwTint: RGB = [150, 168, 206]
  const mwCore: RGB = [226, 208, 184]

  // ---------- 1. 基础渐变 + 日月散射 + 地平辉光 + 银河 + 抖动 ----------
  // 银河纹理网格（低频起伏 + 暗尘带）
  const MW_GW = 512, MW_GH = 192
  const mwTex = p.milkyWay ? new Float32Array(MW_GW * MW_GH) : null
  const mwLane = p.milkyWay ? new Float32Array(MW_GW * MW_GH) : null
  if (mwTex && mwLane) {
    for (let gy = 0; gy < MW_GH; gy++)
      for (let gx = 0; gx < MW_GW; gx++) {
        const u = (gx / MW_GW) * 9, v = (gy / MW_GH) * 4.5
        mwTex[gy * MW_GW + gx] = noise.fbm(u, v, 9, 3)
        mwLane[gy * MW_GW + gx] = noise.fbm(u * 1.7 + 31, v * 1.7 + 11, 16, 3)
      }
  }
  for (let y = 0; y < CH; y++) {
    // 行基色：zenith→mid→horizon 铺满全高，末端 6% 混入地平霾色（与地面雾衔接）
    let r0: number, g0: number, b0: number
    const t = y / CH
    if (t < 0.55) { const k = t / 0.55; r0 = zen[0] + (mid[0] - zen[0]) * k; g0 = zen[1] + (mid[1] - zen[1]) * k; b0 = zen[2] + (mid[2] - zen[2]) * k }
    else if (t < 0.94) { const k = (t - 0.55) / 0.39; r0 = mid[0] + (hor[0] - mid[0]) * k; g0 = mid[1] + (hor[1] - mid[1]) * k; b0 = mid[2] + (hor[2] - mid[2]) * k }
    else { const k = (t - 0.94) / 0.06; r0 = hor[0] + (haze[0] - hor[0]) * k; g0 = hor[1] + (haze[1] - hor[1]) * k; b0 = hor[2] + (haze[2] - hor[2]) * k }
    const el = (1 - t) * 90
    const cosEl = Math.cos(el * D2R)
    const glowBand = glows.length ? Math.exp(-(((el - 3) / 9) ** 2)) : 0
    for (let x = 0; x < CW; x++) {
      let r = r0, g = g0, b = b0
      const i = (y * CW + x) * 4
      {
        const az = (x / CW) * 360
        // 太阳前向散射：日轮周围暖调增亮（近地平线更强）
        if (sun && sunGlow) {
          const dAz = wrapDeg(az - sun.az) * cosEl
          const dEl = el - sun.elv
          const a2 = dAz * dAz + dEl * dEl
          if (a2 < 8100) {
            const sc = (Math.exp(-a2 / 3025) * 0.15 + Math.exp(-a2 / 256) * 0.22) * (1.15 - el / 120)
            r += sunGlow[0] * sc; g += sunGlow[1] * sc; b += sunGlow[2] * sc
          }
        }
        // 月亮冷晕（弱、窄）
        if (moon) {
          const dAz = wrapDeg(az - moon.az) * cosEl
          const dEl = el - moon.elv
          const a2 = dAz * dAz + dEl * dEl
          if (a2 < 1200) {
            const sc = Math.exp(-a2 / 400) * 0.1
            r += moonGlow[0] * sc; g += moonGlow[1] * sc; b += moonGlow[2] * sc
          }
        }
        // 地平辉光带（沿方位噪声起伏 → 城市灯光的斑块感）
        if (glowBand > 0.01) {
          const mod = 0.55 + 0.45 * noise.fbm((x / CW) * 24, 7.3, 24, 2)
          for (const gl of glows) {
            const k = gl.a * glowBand * mod
            r += gl.c[0] * k; g += gl.c[1] * k; b += gl.c[2] * k
          }
        }
        // 银河光带 + 暗尘带（团块化破碎 + 地平线淡出，避免均匀光弧）
        if (mwTex && mwLane) {
          const elB = 26 * Math.sin((az + 25) * D2R) + 14
          const dd = el - elB
          if (dd > -34 && dd < 34) {
            const gx = (x / CW) * (MW_GW - 1), gy = (y / CH) * (MW_GH - 1)
            const tex = sampleGrid(mwTex, MW_GW, MW_GH, gx, gy)
            const lane = sampleGrid(mwLane, MW_GW, MW_GH, gx, gy)
            const patch = smoothstep(0.36, 0.72, tex) // 团块化：只在尘埃浓处显现
            const band = Math.exp(-((dd / 10) ** 2)) * patch * (1 - Math.exp(-(((dd + 4) / 2.6) ** 2)) * lane * 0.9)
            const core = Math.exp(-((dd / 4) ** 2)) * patch * 0.4
            const k = p.milkyWay! * 0.24 * smoothstep(4, 18, el)
            r += (mwTint[0] * band + mwCore[0] * core) * k
            g += (mwTint[1] * band + mwCore[1] * core) * k
            b += (mwTint[2] * band + mwCore[2] * core) * k
          }
        }
      }
      // 抖动去色带
      const dz = (noise.hash(x, y) - 0.5) * 2.2
      d[i] = r + dz; d[i + 1] = g + dz; d[i + 2] = b + dz; d[i + 3] = 255
    }
  }

  const splat = makeSplatter(d)

  // ---------- 2. 星野：暗星尘 + 亮星十字芒（边缘环绕复制，跨缝不断星） ----------
  if (p.stars) {
    const WHITE: RGB = [235, 240, 255], WARM: RGB = [255, 226, 188], BLUE: RGB = [188, 216, 255]
    const n = Math.round(p.stars * 1800)
    for (let s = 0; s < n; s++) {
      const x = rnd() * CW
      const y = 3 + Math.pow(rnd(), 1.35) * (CH - 20) // 略偏高空分布
      const mag = rnd()
      const elS = (1 - y / CH) * 90
      const a = (0.22 + Math.pow(rnd(), 2.2) * 0.78) * (0.3 + 0.7 * (1 - y / CH)) // 近地平线渐隐
        * (0.3 + 0.7 * clamp01((86 - elS) / 12)) // 近天极淡出（缓解极点 UV 汇聚处的 mip 平均环）
      const c = mag > 0.9 ? WARM : mag > 0.78 ? BLUE : WHITE
      const rad = 0.5 + mag * 1.1
      // 高斯小核（3×3，亮星 5×5）+ 水平环绕复制
      const ext = mag > 0.93 ? 2 : 1
      for (let oy = -ext; oy <= ext; oy++)
        for (let ox = -ext; ox <= ext; ox++) {
          const dd = (ox * ox + oy * oy) / (rad * rad)
          const k = a * Math.exp(-dd * 1.6)
          if (k < 0.01) continue
          const px = x + ox, py = y + oy
          if (py < 0 || py >= CH) continue
          splat.add(px, py, c, k)
          if (px < 4) splat.add(px + CW, py, c, k)
          else if (px > CW - 4) splat.add(px - CW, py, c, k)
        }
      // 亮星十字芒
      if (mag > 0.93) {
        const arm = 4 + rnd() * 4
        for (let t = 1; t <= arm; t++) {
          const k = a * 0.5 * (1 - t / arm)
          for (const [ox, oy] of [[t, 0], [-t, 0], [0, t], [0, -t]] as const) {
            const px = x + ox, py = y + oy
            if (py < 0 || py >= CH) continue
            splat.add(px, py, c, k)
            if (px < 8) splat.add(px + CW, py, c, k)
            else if (px > CW - 8) splat.add(px - CW, py, c, k)
          }
        }
      }
    }
  }

  // ---------- 3. 日/月光盘（柔和边缘 + 内晕；月面环形山与明暗交界） ----------
  const drawBody = (az: number, elv: number, size: number, color: RGB, halo: RGB, isMoon: boolean) => {
    const cx = (az / 360) * CW, cy = (1 - elv / 90) * CH
    const R = size * (CW / 512) // size 语义沿用旧版（512 宽参考像素），按分辨率放大
    const ext = Math.ceil(R * 6)
    // 广域内晕（加性）
    for (let oy = -ext; oy <= ext; oy++) {
      const py = cy + oy
      if (py < 0 || py >= CH) continue
      for (let ox = -ext; ox <= ext; ox++) {
        const dd = Math.sqrt(ox * ox + oy * oy) / R
        if (dd > 6) continue
        const k = Math.exp(-dd * dd * 0.55) * (isMoon ? 0.12 : 0.26)
        if (k < 0.004) continue
        const px = cx + ox
        splat.add(px, py, halo, k)
        if (px < ext) splat.add(px + CW, py, halo, k)
        else if (px > CW - ext) splat.add(px - CW, py, halo, k)
      }
    }
    // 盘体（覆盖混合，边缘羽化）
    const ri = Math.ceil(R * 1.05)
    for (let oy = -ri; oy <= ri; oy++) {
      const py = cy + oy
      if (py < 0 || py >= CH) continue
      for (let ox = -ri; ox <= ri; ox++) {
        const dd = Math.sqrt(ox * ox + oy * oy) / R
        if (dd > 1.05) continue
        const a = 1 - smoothstep(0.88, 1.02, dd)
        if (a <= 0) continue
        let sh = 1
        if (isMoon) sh = 0.8 + 0.2 * clamp01(ox / R * 0.5 + 0.5) // 明暗交界（+x 侧受光）
        const px = cx + ox
        const cc: RGB = [color[0] * sh, color[1] * sh, color[2] * sh]
        splat.over(px, py, cc, a)
        if (px < ri) splat.over(px + CW, py, cc, a)
        else if (px > CW - ri) splat.over(px - CW, py, cc, a)
      }
    }
    // 月面环形山（确定性四点，暗化高斯斑）
    if (isMoon) {
      const CRATER: RGB = [168, 182, 212]
      const spots = [[-0.32, -0.28, 0.2], [0.28, 0.22, 0.14], [0.05, -0.42, 0.11], [-0.1, 0.38, 0.09]] as const
      for (const [sx, sy, sr] of spots) {
        const cx2 = cx + sx * R, cy2 = cy + sy * R, rr = Math.ceil(sr * R * 2.2)
        for (let oy = -rr; oy <= rr; oy++) {
          const py = cy2 + oy
          if (py < 0 || py >= CH) continue
          for (let ox = -rr; ox <= rr; ox++) {
            const dd = Math.sqrt(ox * ox + oy * oy) / (sr * R)
            if (dd > 2.2) continue
            const k = Math.exp(-dd * dd * 1.4) * 0.3
            splat.over(cx2 + ox, py, CRATER, Math.min(0.5, k))
          }
        }
      }
    }
  }
  if (sun) drawBody(sun.az, sun.elv, sun.size, rgb(sun.color), sunGlow!, false)
  if (moon) drawBody(moon.az, moon.elv, moon.size, rgb(moon.color), moonGlow, true)

  // ---------- 4. 云层（低分辨率 fBm 网格 → 双线性放大混合；低层积云 + 高层卷云） ----------
  if (p.clouds && p.clouds.density > 0) {
    const cl = p.clouds
    const clRGB = rgb(cl.color)
    const sunU = sun ? sun.az / 360 : moon ? moon.az / 360 : 0.5
    const GW = 1024, GH = 288, Y_TOP = 24, Y_BOT = CH - 6
    const cA = new Float32Array(GW * GH) // 积云覆盖度
    const cL = new Float32Array(GW * GH) // 向阳侧亮度差（银边）
    for (let gy = 0; gy < GH; gy++) {
      const v = (((Y_TOP + (gy / (GH - 1)) * (Y_BOT - Y_TOP)) / CH) * 13)
      for (let gx = 0; gx < GW; gx++) {
        const u = (gx / GW) * 12
        const f = noise.fbm(u, v, 12, 4)
        cA[gy * GW + gx] = f
        // 向阳偏移采样：f 与偏移样本之差 → 朝阳边缘提亮
        const du = (u / 12 - sunU + 1.5) % 1 - 0.5
        const f2 = noise.fbm(u - Math.sign(du) * 0.4, v - 0.3, 12, 2)
        cL[gy * GW + gx] = f2 - f
      }
    }
    const cov = 1 - cl.density
    const cir = cl.cirrus ?? 0
    const lin = sun ? rgb(sun.glow) : moonGlow // 银边光色（日光色 / 月冷色）
    for (let y = Y_TOP; y < Y_BOT; y++) {
      const el = (1 - y / CH) * 90
      const horizFade = clamp01(el / 22) // 近地平线云体霾化变薄
      const gy = ((y - Y_TOP) / (Y_BOT - Y_TOP)) * (GH - 1)
      for (let x = 0; x < CW; x++) {
        const gx = (x / CW) * (GW - 1)
        const f = sampleGrid(cA, GW, GH, gx, gy)
        let a = smoothstep(cov, cov + 0.32, f) * cl.alpha * (0.35 + 0.65 * horizFade)
        // 卷云：强拉伸细丝，仅高空
        if (cir > 0 && y < CH * 0.72) {
          const uc = (x / CW) * 7, vc = (y / CH) * 45
          a += smoothstep(0.58, 0.92, noise.fbm(uc, vc, 7, 3)) * cir * cl.alpha * 0.4
        }
        if (a <= 0.004) continue
        a = Math.min(0.92, a)
        const lit = sampleGrid(cL, GW, GH, gx, gy)
        const silver = clamp01(lit * 2.6) * (sun || moon ? 1 : 0)
        const i = (y * CW + x) * 4
        // 云色：近地平线混入霾色；向阳边缘混入光色（银边）
        const hm = 1 - horizFade * 0.85
        const cr = clRGB[0] * hm + haze[0] * (1 - hm) + lin[0] * silver * 0.45
        const cg = clRGB[1] * hm + haze[1] * (1 - hm) + lin[1] * silver * 0.45
        const cb = clRGB[2] * hm + haze[2] * (1 - hm) + lin[2] * silver * 0.45
        d[i] += (Math.min(255, cr) - d[i]) * a
        d[i + 1] += (Math.min(255, cg) - d[i + 1]) * a
        d[i + 2] += (Math.min(255, cb) - d[i + 2]) * a
      }
    }
  }

  ctx.putImageData(img, 0, 0)
}

const texCache = new Map<number, THREE.CanvasTexture>()

export function skyTexture(defId: number): THREE.CanvasTexture {
  const hit = texCache.get(defId)
  if (hit) return hit
  const c = document.createElement('canvas')
  c.width = CW
  c.height = CH
  const ctx = c.getContext('2d')!
  renderSky(ctx, SKY_PROFILES[defId], defId)
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  // 禁用 mipmap：等距柱状贴图在天极处 u 向导数发散，mip 选择会把星点/银河平均成
  // 一个黑色圆盖（"巨大圆形遮挡"）；双线性即可，天空元素本身柔和、走样可忽略
  tex.generateMipmaps = false
  tex.minFilter = THREE.LinearFilter
  texCache.set(defId, tex)
  return tex
}

/** 天空盒网格：上半球（地平线以上），BackSide + fog:false + depthWrite:false。
 *  半径恒定 42 < 相机 far 60——旧版按地图外包取半径（大地图 r≈80+），球面超出远平面
 *  被裁剪，与相机等距的球壳交界在视野里形成一个巨大黑色圆盖；改小后由 renderer
 *  每帧把球心移到玩家头顶（大气无视差，跟随即无限天空），任意尺寸地图均不再被裁。 */
export function makeSkyMesh(m: GameMap, def: LevelDef): THREE.Mesh | null {
  const prof = SKY_PROFILES[def.id]
  if (!prof) return null
  const geo = new THREE.SphereGeometry(42, 48, 24, 0, Math.PI * 2, 0, Math.PI / 2)
  const mat = new THREE.MeshBasicMaterial({ map: skyTexture(def.id), side: THREE.BackSide, fog: false, depthWrite: false })
  const mesh = new THREE.Mesh(geo, mat)
  mesh.name = 'skybox'
  mesh.position.set(m.w / 2, 5.5, m.h / 2)
  return mesh
}

/** 日/月光照方向（世界单位向量），与天空盒上的光源方位一致 */
export function skyLightDir(defId: number): THREE.Vector3 {
  const p = SKY_PROFILES[defId]
  const body = p?.moon ?? p?.sun
  if (!body) return new THREE.Vector3(0, 1, 0)
  // three 球体 u→世界方位为 az_world = 180° - u·360°（x 取 -cos）：贴图上的天体方位需镜像还原
  const az = ((180 - body.az) * Math.PI) / 180
  const elv = (body.elv * Math.PI) / 180
  return new THREE.Vector3(Math.cos(az) * Math.cos(elv), Math.sin(elv), Math.sin(az) * Math.cos(elv))
}
