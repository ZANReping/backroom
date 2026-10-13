// 细化物品图集：原创程序化绘制，确定性种子；无网络、无外部素材、无运行时 canvas 工作。
// 输出 public/textures/items-refined/<atlas>/{color,normal,roughness}.png 与 layout.json。
// color 1024² sRGB；normal 512² OpenGL(+Y)；roughness 512² 线性灰度。每套 4×4 分区、8 px 内缩、边缘外扩。
// 子区约定与 src/game/renderer/refinedItemMesh.ts 的 SUB/R 常量一致（分区内坐标 240×240，y 向下 = 1 - v）。
import { createCanvas } from '@napi-rs/canvas'
import { mkdirSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('../public/textures/items-refined/', import.meta.url))
const SIZE = 1024, TILE = 256, PAD = 8, W = 240

// ---------- 噪声 ----------
const hash = (x, y, k = 0) => { let h = Math.imul(x + 17, 374761393) ^ Math.imul(y + 31, 668265263) ^ Math.imul(k + 7, 1274126177); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967295 }
const lerp = (a, b, t) => a + (b - a) * t
const vnoise = (x, y, k) => { const ix = Math.floor(x), iy = Math.floor(y), u = x - ix, v = y - iy, a = u * u * (3 - 2 * u), b = v * v * (3 - 2 * v); return lerp(lerp(hash(ix, iy, k), hash(ix + 1, iy, k), a), lerp(hash(ix, iy + 1, k), hash(ix + 1, iy + 1, k), a), b) }
const fbm = (x, y, k, oct = 4) => { let s = 0, a = .5, f = 1; for (let i = 0; i < oct; i++) { s += vnoise(x * f, y * f, k + i * 13) * a; f *= 2; a *= .5 } return s / (1 - Math.pow(.5, oct)) }
const clamp = (x, a = 0, b = 255) => Math.max(a, Math.min(b, x))
const hex = (s) => [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16)]
const mix3 = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)]

/**
 * 每个分区的绘制上下文：
 *  c  —— 颜色 2D 上下文（已平移到分区可绘制区左上角，坐标 0..240）
 *  h  —— 高度 2D 上下文（灰度，128 = 基准，亮 = 凸）
 *  r  —— 粗糙度 2D 上下文（灰度，255 = 完全粗糙）
 *  px —— 逐像素函数 (fn(x, y, [r,g,b], height, rough) => [rgb, height, rough])，在区域 [x0,y0,x1,y1) 内运行
 */
function makeAtlas(name, tiles) {
  const color = createCanvas(SIZE, SIZE), height = createCanvas(SIZE, SIZE), rough = createCanvas(SIZE, SIZE)
  const cc = color.getContext('2d'), hc = height.getContext('2d'), rc = rough.getContext('2d')
  cc.fillStyle = '#9a968a'; cc.fillRect(0, 0, SIZE, SIZE)
  hc.fillStyle = '#808080'; hc.fillRect(0, 0, SIZE, SIZE)
  rc.fillStyle = '#b4b4b4'; rc.fillRect(0, 0, SIZE, SIZE)
  const strengths = []
  tiles.forEach((tile, id) => {
    const ox = id % 4 * TILE + PAD, oy = Math.floor(id / 4) * TILE + PAD
    for (const ctx of [cc, hc, rc]) { ctx.save(); ctx.translate(ox, oy); ctx.beginPath(); ctx.rect(0, 0, W, W); ctx.clip() }
    const px = (fn, x0 = 0, y0 = 0, x1 = W, y1 = W) => {
      const w = x1 - x0, hgt = y1 - y0
      const ci = cc.getImageData(ox + x0, oy + y0, w, hgt), hi = hc.getImageData(ox + x0, oy + y0, w, hgt), ri = rc.getImageData(ox + x0, oy + y0, w, hgt)
      for (let y = 0; y < hgt; y++) for (let x = 0; x < w; x++) {
        const o = (y * w + x) * 4
        const out = fn(x0 + x, y0 + y, [ci.data[o], ci.data[o + 1], ci.data[o + 2]], hi.data[o], ri.data[o])
        if (!out) continue
        const [rgb, hh, rr] = out
        if (rgb) { ci.data[o] = clamp(rgb[0]); ci.data[o + 1] = clamp(rgb[1]); ci.data[o + 2] = clamp(rgb[2]); ci.data[o + 3] = 255 }
        if (hh !== undefined) hi.data[o] = hi.data[o + 1] = hi.data[o + 2] = clamp(hh)
        if (rr !== undefined) ri.data[o] = ri.data[o + 1] = ri.data[o + 2] = clamp(rr)
      }
      cc.putImageData(ci, ox + x0, oy + y0); hc.putImageData(hi, ox + x0, oy + y0); rc.putImageData(ri, ox + x0, oy + y0)
    }
    const api = { c: cc, h: hc, r: rc, px, id, seed: name.length * 100 + id }
    strengths[id] = tile.paint(api) ?? tile.normal ?? 1
    for (const ctx of [cc, hc, rc]) ctx.restore()
  })
  // 分区边缘外扩到内缩带，避免 mipmap 串色
  for (const cv of [color, height, rough]) {
    const ctx = cv.getContext('2d')
    for (let id = 0; id < 16; id++) {
      const x = id % 4 * TILE, y = Math.floor(id / 4) * TILE
      ctx.drawImage(cv, x + PAD, y + PAD, 1, W, x, y + PAD, PAD, W)
      ctx.drawImage(cv, x + PAD + W - 1, y + PAD, 1, W, x + PAD + W, y + PAD, PAD, W)
      ctx.drawImage(cv, x, y + PAD, TILE, 1, x, y, TILE, PAD)
      ctx.drawImage(cv, x, y + PAD + W - 1, TILE, 1, x, y + PAD + W, TILE, PAD)
    }
  }
  // 法线（OpenGL +Y）与粗糙度：512²，按分区夹取采样，不跨区
  const hd = hc.getImageData(0, 0, SIZE, SIZE).data, rd = rc.getImageData(0, 0, SIZE, SIZE).data
  const normal = createCanvas(512, 512), roughOut = createCanvas(512, 512)
  const nc = normal.getContext('2d'), ro = roughOut.getContext('2d'), ni = nc.createImageData(512, 512), rI = ro.createImageData(512, 512)
  for (let y = 0; y < 512; y++) for (let x = 0; x < 512; x++) {
    const sx = x * 2, sy = y * 2, tx = Math.floor(sx / TILE) * TILE, ty = Math.floor(sy / TILE) * TILE, id = (ty / TILE) * 4 + tx / TILE
    const s = (strengths[id] ?? 1) * 2.2
    const at = (px, py) => hd[(clamp(py, ty + PAD, ty + PAD + W - 1) * SIZE + clamp(px, tx + PAD, tx + PAD + W - 1)) * 4] / 255
    const dx = (at(sx + 2, sy) - at(sx - 2, sy)) * s, dy = (at(sx, sy + 2) - at(sx, sy - 2)) * s, len = Math.hypot(dx, dy, 1), o = (y * 512 + x) * 4
    ni.data[o] = (-dx / len * .5 + .5) * 255; ni.data[o + 1] = (dy / len * .5 + .5) * 255; ni.data[o + 2] = (1 / len * .5 + .5) * 255; ni.data[o + 3] = 255
    const rv = (rd[(sy * SIZE + sx) * 4] + rd[(sy * SIZE + sx + 1) * 4] + rd[((sy + 1) * SIZE + sx) * 4] + rd[((sy + 1) * SIZE + sx + 1) * 4]) / 4
    rI.data[o] = rI.data[o + 1] = rI.data[o + 2] = rv; rI.data[o + 3] = 255
  }
  nc.putImageData(ni, 0, 0); ro.putImageData(rI, 0, 0)
  const dir = `${ROOT}${name}/`
  mkdirSync(dir, { recursive: true })
  writeFileSync(`${dir}color.png`, color.toBuffer('image/png'))
  writeFileSync(`${dir}normal.png`, normal.toBuffer('image/png'))
  writeFileSync(`${dir}roughness.png`, roughOut.toBuffer('image/png'))
  writeFileSync(`${dir}layout.json`, JSON.stringify({ size: SIZE, padding: PAD, normalSize: 512, roughnessSize: 512, tiles: Object.fromEntries(tiles.map((t, i) => [t.name, [i % 4 * TILE, Math.floor(i / 4) * TILE, TILE, TILE]])) }, null, 2) + '\n')
  return color
}

// ---------- 通用笔刷 ----------
/** 底色 + fbm 明暗/高度起伏 */
function base(api, col, { amp = 14, scale = .05, hAmp = 10, rough = 180, rAmp = 0, x0 = 0, y0 = 0, x1 = W, y1 = W, k = 0 } = {}) {
  const c = typeof col === 'string' ? hex(col) : col
  api.px((x, y) => { const n = fbm(x * scale, y * scale, api.seed + k) - .5, f = hash(x, y, api.seed + k) - .5; return [[c[0] + n * amp * 2 + f * amp * .4, c[1] + n * amp * 2 + f * amp * .4, c[2] + n * amp * 2 + f * amp * .4], 128 + n * hAmp * 2, rough + n * rAmp] }, x0, y0, x1, y1)
}
/** 拉丝金属：横向细纹 */
function brushed(api, col, { x0 = 0, y0 = 0, x1 = W, y1 = W, rough = 90, vertical = false, k = 0, amp = 1 } = {}) {
  const c = hex(col)
  api.px((x, y) => {
    const a = vertical ? x : y, b = vertical ? y : x
    const line = ((hash(a, 0, api.seed + k) - .5) * 22 + (fbm(b * .01, a * .4, api.seed + k) - .5) * 18) * amp
    const scratch = hash(Math.floor(b / 9), a, api.seed + 3 + k) > .993 ? -20 : 0
    return [[c[0] + line + scratch, c[1] + line + scratch, c[2] + line + scratch], 128 + line * .25 + scratch, rough + Math.abs(line) * .6 - scratch]
  }, x0, y0, x1, y1)
}
function text(api, str, x, y, { size = 20, color = '#222', font = 'Arial', weight = 'bold', align = 'center', emboss = 0, rot = 0, sx = 1, baseline = 'middle' } = {}) {
  for (const [ctx, style] of [[api.c, color], ...(emboss ? [[api.h, emboss > 0 ? '#c8c8c8' : '#404040']] : [])]) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.scale(sx, 1)
    ctx.font = `${weight} ${size}px ${font}`; ctx.textAlign = align; ctx.textBaseline = baseline; ctx.fillStyle = style
    ctx.fillText(str, 0, 0); ctx.restore()
  }
}
function shapeFill(api, fn, color, { height, rough } = {}) {
  for (const [ctx, style] of [[api.c, color], [api.h, height], [api.r, rough]]) {
    if (style === undefined) continue
    ctx.save(); ctx.fillStyle = typeof style === 'number' ? `rgb(${style},${style},${style})` : style; ctx.beginPath(); fn(ctx); ctx.fill(); ctx.restore()
  }
}
function strokeAll(api, fn, color, width, { height, rough } = {}) {
  for (const [ctx, style] of [[api.c, color], [api.h, height], [api.r, rough]]) {
    if (style === undefined) continue
    ctx.save(); ctx.strokeStyle = typeof style === 'number' ? `rgb(${style},${style},${style})` : style; ctx.lineWidth = width; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.beginPath(); fn(ctx); ctx.stroke(); ctx.restore()
  }
}
/** 布料编织 */
function weave(api, col, { pitch = 4, amp = 18, x0 = 0, y0 = 0, x1 = W, y1 = W, rough = 230, k = 0 } = {}) {
  const c = hex(col)
  api.px((x, y) => {
    const cx = Math.floor(x / pitch), cy = Math.floor(y / pitch), over = (cx + cy) % 2 === 0
    const fx = (x % pitch) / pitch, fy = (y % pitch) / pitch
    const t = over ? Math.sin(fy * Math.PI) : Math.sin(fx * Math.PI)
    const n = (fbm(x * .04, y * .04, api.seed + k) - .5) * 18 + (hash(x, y, api.seed + k) - .5) * 6
    const s = (t - .5) * amp + n
    return [[c[0] + s, c[1] + s, c[2] + s], 128 + (t - .5) * 50, rough]
  }, x0, y0, x1, y1)
}
/** 斑点 */
function speckle(api, col, density, size, { x0 = 0, y0 = 0, x1 = W, y1 = W, k = 0, height = 0 } = {}) {
  const c = hex(col)
  api.px((x, y) => {
    const gx = Math.floor(x / size), gy = Math.floor(y / size)
    if (hash(gx, gy, api.seed + 77 + k) > density) return null
    const cx = (gx + .5 + (hash(gx, gy, 5 + k) - .5) * .6) * size, cy = (gy + .5 + (hash(gx, gy, 6 + k) - .5) * .6) * size
    const d = Math.hypot(x - cx, y - cy) / (size * .45)
    if (d > 1) return null
    return [c, 128 + height * (1 - d)]
  }, x0, y0, x1, y1)
}
function trefoil(ctx, cx, cy, r, color) {
  ctx.save(); ctx.fillStyle = color
  ctx.beginPath(); ctx.arc(cx, cy, r * .18, 0, Math.PI * 2); ctx.fill()
  for (let i = 0; i < 3; i++) {
    const a = -Math.PI / 2 + i * Math.PI * 2 / 3
    ctx.beginPath(); ctx.moveTo(cx + Math.cos(a - .5) * r * .3, cy + Math.sin(a - .5) * r * .3)
    ctx.arc(cx, cy, r, a - .5, a + .5); ctx.lineTo(cx + Math.cos(a + .5) * r * .3, cy + Math.sin(a + .5) * r * .3); ctx.arc(cx, cy, r * .3, a + .5, a - .5, true); ctx.fill()
  }
  ctx.restore()
}
function eagle(ctx, cx, cy, s, color) {
  // 原创简化纹章鹰：圆头弯喙、展开双翼（每侧六枚羽尖）、扇形尾、双爪
  ctx.save(); ctx.translate(cx, cy); ctx.scale(s, s); ctx.fillStyle = color
  ctx.beginPath(); ctx.ellipse(0, 2, 11, 22, 0, 0, Math.PI * 2); ctx.fill()
  ctx.beginPath(); ctx.arc(0, -24, 8, 0, Math.PI * 2); ctx.fill()
  ctx.beginPath(); ctx.moveTo(6, -27); ctx.quadraticCurveTo(15, -26, 12, -18); ctx.lineTo(7, -21); ctx.fill()
  for (const side of [1, -1]) {
    ctx.beginPath(); ctx.moveTo(side * 6, -10)
    ctx.quadraticCurveTo(side * 30, -34, side * 62, -30)
    for (let i = 0; i < 6; i++) { const x = side * (62 - i * 8), y = -30 + i * 7; ctx.lineTo(x, y); ctx.lineTo(side * (56 - i * 8), y + 2) }
    ctx.quadraticCurveTo(side * 20, 6, side * 6, 8); ctx.closePath(); ctx.fill()
  }
  ctx.beginPath(); ctx.moveTo(-8, 18); for (let i = 0; i <= 4; i++) { ctx.lineTo(-12 + i * 6, 40); ctx.lineTo(-9 + i * 6, 34) } ctx.lineTo(8, 18); ctx.closePath(); ctx.fill()
  ctx.lineWidth = 3; ctx.strokeStyle = color
  for (const side of [1, -1]) { ctx.beginPath(); ctx.moveTo(side * 5, 16); ctx.lineTo(side * 14, 26); ctx.lineTo(side * 18, 24); ctx.moveTo(side * 14, 26); ctx.lineTo(side * 15, 31); ctx.stroke() }
  ctx.restore()
}
function handwriting(api, lines, x, y, gap, color, { size = 13, seed = 0, width = 190 } = {}) {
  lines.forEach((ln, i) => {
    api.c.save(); api.c.translate(x, y + i * gap); api.c.rotate((hash(i, seed, 3) - .5) * .03)
    api.c.font = `italic ${size}px "Comic Sans MS", "Segoe Script", cursive, serif`; api.c.fillStyle = color; api.c.textBaseline = 'alphabetic'
    const m = api.c.measureText(ln).width; api.c.scale(Math.min(1, width / Math.max(1, m)), 1)
    api.c.fillText(ln, 0, 0); api.c.restore()
  })
}

// ======================================================================
const tools = [
  { name: 'darkPlastic', paint: a => { base(a, '#26292c', { amp: 6, scale: .3, hAmp: 6, rough: 150 }); speckle(a, '#30343a', .5, 3, { height: 6 }); return .6 } },
  { name: 'steel', paint: a => {
    brushed(a, '#a9adb0', { y1: 180, rough: 80 })
    base(a, '#7a5a3c', { y0: 180, amp: 22, scale: .08, hAmp: 14, rough: 210 })
    a.px((x, y) => { const rust = fbm(x * .06, y * .06, 91); return rust > .55 ? [[132 - rust * 40, 70, 38], 128 + rust * 30, 235] : [[110, 110, 108], undefined, 140] }, 0, 180, W, W)
  } },
  { name: 'gasRed', paint: a => {
    base(a, '#a3281d', { amp: 10, scale: .04, hAmp: 4, rough: 120 })
    // 冲压 X 加强筋（高度）+ 模板字
    strokeAll(a, ctx => { ctx.moveTo(30, 30); ctx.lineTo(210, 210); ctx.moveTo(210, 30); ctx.lineTo(30, 210) }, 'rgba(255,120,100,.10)', 18, { height: 190 })
    strokeAll(a, ctx => { ctx.rect(16, 16, 208, 208) }, 'rgba(60,10,6,.35)', 6, { height: 170 })
    text(a, 'GASOLINE', 120, 120, { size: 30, color: '#f0d9a0', font: 'Impact, Arial Black, Arial', sx: .95 })
    text(a, 'FLAMMABLE · 20 L', 120, 150, { size: 13, color: '#f0d9a0' })
    a.px((x, y) => { const chip = fbm(x * .09, y * .09, 22); return chip > .78 ? [[105, 100, 92], 110, 200] : null })
  } },
  { name: 'enamelRed', paint: a => {
    base(a, '#b0261c', { amp: 8, scale: .05, hAmp: 3, rough: 100 })
    a.px((x, y) => { const wear = fbm(x * .05, y * .12, 3); return wear > .78 ? [[92, 88, 84], 118, 160] : null })
    text(a, 'HEAVY DUTY', 120, 108, { size: 28, color: '#f1d9b0', emboss: 1, sx: 1.1 })
    text(a, '14"  ·  350 mm', 120, 140, { size: 15, color: '#f1d9b0', emboss: 1 })
  } },
  { name: 'ceramicFuse', paint: a => {
    base(a, '#e3dcc4', { amp: 6, scale: .1, hAmp: 3, rough: 170 })
    for (const y of [70, 170]) shapeFill(a, ctx => ctx.rect(0, y, W, 4), '#b8ae8e')
    text(a, '250V  30A', 120, 100, { size: 24, color: '#2b3a6a' })
    text(a, 'FAST-ACTING · CLASS H', 120, 132, { size: 12, color: '#2b3a6a' })
    text(a, 'BRC-30', 120, 150, { size: 10, color: '#5a5a5a' })
  } },
  { name: 'brass', paint: a => {
    brushed(a, '#c9a048', { y1: 180, rough: 90, amp: .45 })
    a.px((x, y) => { const ox = fbm(x * .05, y * .05, 44); return ox > .74 ? [[132 + ox * 20, 112, 64], undefined, 160] : null }, 0, 0, W, 180)
    // 滚花 / 币边齿纹（竖线）
    a.px((x, y) => { const t = Math.sin(x * 1.3) ; return [[176 + t * 34, 140 + t * 28, 60 + t * 16], 128 + t * 60, 100] }, 0, 180, W, W)
  }, normal: 1.4 },
  { name: 'keycard', paint: a => {
    // 正面（上半）
    const g = a.c.createLinearGradient(0, 0, W, 120); g.addColorStop(0, '#2c6e9b'); g.addColorStop(1, '#7fbfd6')
    a.c.fillStyle = g; a.c.fillRect(0, 0, W, 120)
    a.c.fillStyle = 'rgba(255,255,255,.18)'; for (let i = 0; i < 6; i++) { a.c.beginPath(); a.c.arc(200, 20, 30 + i * 22, 0, Math.PI * 2); a.c.lineWidth = 2; a.c.strokeStyle = 'rgba(255,255,255,.12)'; a.c.stroke() }
    text(a, 'M.E.G.', 20, 22, { size: 18, color: '#ffffff', align: 'left' })
    text(a, 'ACCESS · LEVEL 2', 20, 40, { size: 9, color: '#dff2fa', align: 'left' })
    shapeFill(a, ctx => ctx.rect(160, 48, 58, 60), '#e8eef0')
    shapeFill(a, ctx => { ctx.arc(189, 70, 12, 0, Math.PI * 2) }, '#9aa8b0'); shapeFill(a, ctx => { ctx.ellipse(189, 104, 20, 14, 0, Math.PI, 0) }, '#9aa8b0')
    shapeFill(a, ctx => ctx.roundRect(22, 56, 34, 26, 4), '#d6b14a', { height: 150, rough: 80 })
    strokeAll(a, ctx => { ctx.moveTo(22, 69); ctx.lineTo(56, 69); ctx.moveTo(39, 56); ctx.lineTo(39, 82); ctx.moveTo(30, 56); ctx.lineTo(30, 82); ctx.moveTo(48, 56); ctx.lineTo(48, 82) }, '#8a6e22', 1.2, { height: 120 })
    text(a, 'ID 0451-2207', 22, 102, { size: 10, color: '#ffffff', align: 'left' })
    // 背面（下半）：磁条 + 签名栏 + 条款
    a.c.fillStyle = '#e9edef'; a.c.fillRect(0, 120, W, 120)
    a.c.fillStyle = '#1c1f22'; a.c.fillRect(0, 134, W, 26)
    a.c.fillStyle = '#ffffff'; a.c.fillRect(18, 172, 140, 18)
    for (let x = 18; x < 158; x += 6) { a.c.fillStyle = x % 12 ? '#dfe6ea' : '#c8d6de'; a.c.fillRect(x, 172, 3, 18) }
    text(a, 'IF FOUND RETURN TO ANY M.E.G. OUTPOST', 120, 212, { size: 8, color: '#6a7378' })
    a.px(() => [undefined, undefined, 70], 0, 0, W, W)
  }, normal: .5 },
  { name: 'wood', paint: a => {
    a.px((x, y) => {
      const warpv = fbm(x * .006, y * .05, 5) * 30, ring = Math.sin((y + warpv) * .55 + fbm(x * .02, y * .1, 8) * 4)
      const knot = Math.exp(-(((x - 150) / 18) ** 2 + ((y - 90) / 10) ** 2))
      const t = ring * .5 + .5 - knot * .8
      return [mix3([121, 84, 50], [176, 132, 84], clamp(t, 0, 1)), 128 + ring * 14 - knot * 40, 215 + ring * 10]
    }, 0, 0, W, 180)
    a.px((x, y) => {
      const d = Math.hypot((x - 90) / 3, y - 230) + fbm(x * .05, y * .05, 3) * 8, ring = Math.sin(d * 1.2)
      return [mix3([128, 92, 56], [170, 128, 82], ring * .5 + .5), 128 + ring * 20, 235]
    }, 0, 180, 180, W)
  } },
  { name: 'eagleCoin', paint: a => {
    a.px((x, y) => { const d = Math.hypot(x - 120, y - 120) / 120, n = fbm(x * .05, y * .05, 9); return [mix3([196, 122, 58], [150, 86, 38], n), 128 + (d > .86 && d < .96 ? 50 : 0), 110 + n * 40] })
    strokeAll(a, ctx => ctx.arc(120, 120, 100, 0, Math.PI * 2), '#a9632a', 3, { height: 170 })
    eagle(a.c, 120, 118, 1.15, '#e0a660'); eagle(a.h, 120, 118, 1.15, '#d0d0d0')
    a.c.save(); a.c.font = 'bold 14px Georgia, serif'; a.c.fillStyle = '#8a4a1e'; a.c.textAlign = 'center'
    const label = 'CAPITAL · ONE EAGLE · MCMXCI ·'
    for (let i = 0; i < label.length; i++) { const ang = -Math.PI * .85 + i / label.length * Math.PI * 1.7; a.c.save(); a.c.translate(120 + Math.cos(ang - Math.PI / 2) * 88, 120 + Math.sin(ang - Math.PI / 2) * 88); a.c.rotate(ang); a.c.fillText(label[i], 0, 0); a.c.restore() }
    a.c.restore()
    a.px(() => [[150, 88, 40], 128 + 30, 130], 0, 228, W, W)
  }, normal: 1.6 },
  { name: 'pressCoin', paint: a => {
    a.px((x, y) => { const n = fbm(x * .05, y * .05, 19); return [mix3([214, 172, 74], [168, 128, 44], n), 128, 100 + n * 50] })
    strokeAll(a, ctx => ctx.arc(120, 120, 104, 0, Math.PI * 2), '#9a7424', 4, { height: 190 })
    strokeAll(a, ctx => ctx.arc(120, 120, 70, 0, Math.PI * 2), '#9a7424', 2, { height: 160 })
    // 齿轮 + 握手（压印）
    shapeFill(a, ctx => { for (let i = 0; i < 12; i++) { const t = i / 12 * Math.PI * 2; ctx.lineTo(120 + Math.cos(t) * 52, 120 + Math.sin(t) * 52); ctx.lineTo(120 + Math.cos(t + .13) * 60, 120 + Math.sin(t + .13) * 60); ctx.lineTo(120 + Math.cos(t + .39) * 60, 120 + Math.sin(t + .39) * 60); ctx.lineTo(120 + Math.cos(t + .52) * 52, 120 + Math.sin(t + .52) * 52) } ctx.closePath() }, '#b8902e', { height: 175 })
    shapeFill(a, ctx => ctx.arc(120, 120, 34, 0, Math.PI * 2), '#d6ae52', { height: 128 })
    text(a, '1', 120, 122, { size: 38, color: '#9a7424', font: 'Georgia, serif', emboss: 1 })
    a.c.save(); a.c.font = 'bold 13px Arial'; a.c.fillStyle = '#7e5c16'; a.c.textAlign = 'center'
    const label = 'LEVEL 11 · PRESSED MARK · '
    for (let i = 0; i < label.length; i++) { const ang = i / label.length * Math.PI * 2; a.c.save(); a.c.translate(120 + Math.cos(ang - Math.PI / 2) * 86, 120 + Math.sin(ang - Math.PI / 2) * 86); a.c.rotate(ang); a.c.fillText(label[i], 0, 0); a.c.restore() }
    a.c.restore()
  }, normal: 1.6 },
  { name: 'syringe', paint: a => {
    a.px((x, y) => { const liquid = y > 70; const n = (hash(x, y, 4) - .5) * 4; return [liquid ? [150 + n, 214 + n, 238] : [222 + n, 232 + n, 236], 128, 40] })
    for (let i = 0; i <= 10; i++) { const y = 200 - i * 14; shapeFill(a, ctx => ctx.rect(70, y, i % 5 ? 22 : 40, 2), '#24313a'); if (i % 5 === 0) text(a, `${i / 10}`.replace('0.', '.'), 122, y + 1, { size: 11, color: '#24313a', align: 'left' }) }
    text(a, 'SEDATIVE 5 ml', 190, 140, { size: 12, color: '#1f4f7a', rot: -Math.PI / 2 })
    shapeFill(a, ctx => ctx.rect(0, 68, W, 3), 'rgba(80,140,170,.6)')
  }, normal: .4 },
  { name: 'uvTube', paint: a => {
    a.px((x, y) => { const core = Math.exp(-(((y - 120) / 70) ** 2)); const flick = (fbm(x * .02, y * .01, 2) - .5) * 20; return [[150 + core * 90 + flick, 70 + core * 120, 230 + core * 25], 128, 50] })
    text(a, 'UV-A 365nm', 120, 200, { size: 12, color: 'rgba(80,30,120,.6)' })
  }, normal: .2 },
  { name: 'strap', paint: a => {
    weave(a, '#202224', { pitch: 3, amp: 14, rough: 240 })
    for (const y of [60, 170]) a.px((x, yy) => [[118, 122, 126], 140, 220], 0, y, W, y + 10)
    text(a, 'BRC OUTDOOR', 120, 116, { size: 14, color: '#5f6366' })
  } },
  { name: 'lens', paint: a => {
    base(a, '#1a1c1e', { amp: 4, rough: 60 })
    // 左：暖白反光杯；右：夜视物镜（绿紫镀膜）
    a.px((x, y) => { const d = Math.hypot(x - 60, y - 120) / 60; if (d > 1) return null; const ring = Math.sin(d * 40) * .5 + .5; return [mix3([255, 248, 222], [190, 182, 160], ring * d), 128 + ring * 30 * d, 30] })
    a.px((x, y) => { const d = Math.hypot(x - 180, y - 120) / 60; if (d > 1) return null; const t = Math.atan2(y - 120, x - 180); return [mix3([40, 120, 70], [110, 60, 140], (Math.sin(t * 2 + d * 3) * .5 + .5) * (1 - d * .5)), 128 - d * 20, 25] })
    shapeFill(a, ctx => ctx.ellipse(168, 104, 14, 6, -.6, 0, Math.PI * 2), 'rgba(255,255,255,.35)')
    shapeFill(a, ctx => ctx.ellipse(48, 104, 14, 6, -.6, 0, Math.PI * 2), 'rgba(255,255,255,.5)')
  }, normal: .5 },
  { name: 'oliveRubber', paint: a => {
    base(a, '#3b4632', { amp: 8, scale: .12, hAmp: 8, rough: 215 }); speckle(a, '#45513a', .6, 2, { height: 10 })
    for (let y = 20; y < W; y += 24) a.px(() => [[44, 52, 37], 108, 225], 0, y, W, y + 3)
    text(a, 'GEN-II', 120, 140, { size: 18, color: '#596650', emboss: 1 })
  } },
  { name: 'rubberMix', paint: a => {
    base(a, '#b32b23', { x1: 120, y1: 120, amp: 8, scale: .2, rough: 200 })
    base(a, '#1d1f21', { x0: 120, y1: 120, amp: 6, scale: .2, rough: 220 })
    base(a, '#e8e8e2', { y0: 120, x1: 120, amp: 4, scale: .2, rough: 120 })
    base(a, '#5c5f63', { x0: 120, y0: 120, amp: 8, scale: .2, rough: 230 })
    text(a, '▲', 60, 60, { size: 40, color: '#d9564c', emboss: 1 }); text(a, '◆', 180, 60, { size: 36, color: '#2c2f32', emboss: 1 })
  } },
]

const gear = [
  { name: 'gloveLeather', paint: a => {
    base(a, '#c99a2c', { amp: 16, scale: .03, hAmp: 8, rough: 200 })
    a.px((x, y) => { const pore = hash(x >> 1, y >> 1, 4) > .9 ? -10 : 0, crease = Math.max(0, fbm(x * .03, y * .2, 7) - .62) * 120; return [[200 + pore - crease, 150 + pore - crease, 60 + pore - crease * .5], 128 + pore - crease * .6, 205] })
    for (const [x0, y0, x1, y1] of [[20, 20, 220, 20], [20, 220, 220, 220], [20, 20, 20, 220], [220, 20, 220, 220]]) {
      for (let t = 0; t < 1; t += .03) strokeAll(a, ctx => { const x = lerp(x0, x1, t), y = lerp(y0, y1, t); ctx.moveTo(x, y); ctx.lineTo(x + (x1 - x0) * .018, y + (y1 - y0) * .018) }, '#6e4a12', 2.5, { height: 170 })
    }
    text(a, 'HEAT 500°C', 120, 120, { size: 16, color: '#7a5414', emboss: -1 })
  } },
  { name: 'insulationSuit', paint: a => {
    base(a, '#41633f', { amp: 12, scale: .03, hAmp: 10, rough: 150 })
    for (const x of [60, 180]) a.px((xx, y) => [[52, 82, 50], 100, 160], x, 0, x + 4, W)
    // 中央高压补丁（SUB.suitPatch = x/y 72..168）
    shapeFill(a, ctx => ctx.arc(120, 120, 46, 0, Math.PI * 2), '#e9c32c', { height: 150 })
    strokeAll(a, ctx => ctx.arc(120, 120, 46, 0, Math.PI * 2), '#1b1b1b', 4)
    shapeFill(a, ctx => { ctx.moveTo(126, 86); ctx.lineTo(102, 124); ctx.lineTo(118, 124); ctx.lineTo(110, 156); ctx.lineTo(140, 112); ctx.lineTo(124, 112); ctx.lineTo(134, 86); ctx.closePath() }, '#1b1b1b', { height: 170 })
    text(a, '20 kV', 120, 200, { size: 14, color: '#c9d9b8' })
  } },
  { name: 'cavingNylon', paint: a => {
    base(a, '#2f6476', { amp: 8, scale: .05, hAmp: 4, rough: 120 })
    a.px((x, y) => (x % 12 === 0 || y % 12 === 0) ? [[42, 92, 108], 145, 140] : null)
    text(a, 'SPELEO-3', 120, 120, { size: 16, color: '#7ab0c0' })
  } },
  { name: 'fleece', paint: a => { base(a, '#6e5a3a', { amp: 22, scale: .25, hAmp: 26, rough: 250 }); speckle(a, '#86704c', .45, 3, { height: 30 }) } },
  { name: 'reflective', paint: a => {
    a.px((x, y) => { const g = (hash(x >> 1, y >> 1, 3) - .5) * 30; return [[190 + g, 196 + g, 198 + g], 128 + g * .3, 40] })
    a.px(() => [[230, 190, 40], 140, 150], 0, 0, W, 20); a.px(() => [[230, 190, 40], 140, 150], 0, 220, W, W)
  } },
  { name: 'rope', paint: a => {
    a.px((x, y) => { const s = Math.sin((x * .35 + y * .55)), s2 = Math.sin((x * .35 - y * .55) + 1.3); const t = Math.max(s, s2 * .8); const n = (hash(x, y, 1) - .5) * 14; return [[206 + t * 22 + n, 190 + t * 20 + n, 146 + t * 14 + n], 128 + t * 55, 235] })
    a.px((x, y) => Math.sin(x * .35 + y * .55) > .96 ? [[150, 40, 32], 160] : null)
  }, normal: 1.2 },
  { name: 'silicone', paint: a => { base(a, '#1a1c1d', { amp: 5, scale: .2, hAmp: 4, rough: 120 }); text(a, 'AQUA-PRO', 120, 120, { size: 16, color: '#2a2d2f', emboss: 1 }) } },
  { name: 'maskGlass', paint: a => {
    a.px((x, y) => { const s = Math.exp(-(((x - y * .6 - 60) / 18) ** 2)) * 60; return [[150 + s, 200 + s, 220 + s * .5], 128, 15] })
    text(a, 'TEMPERED', 190, 214, { size: 10, color: 'rgba(255,255,255,.5)' })
  }, normal: .2 },
  { name: 'chalk', paint: a => { base(a, '#ece8dc', { amp: 10, scale: .15, hAmp: 22, rough: 250 }); speckle(a, '#d6d0c0', .3, 3, { height: -20 }) } },
  { name: 'stone', paint: a => {
    a.px((x, y) => { const n = fbm(x * .04, y * .04, 3), m = fbm(x * .2, y * .2, 9), v = Math.max(0, .03 - Math.abs(fbm(x * .015, y * .015, 4) - .5)) * 1200; return [[128 + n * 50 - m * 26 + v, 124 + n * 46 - m * 24 + v, 110 + n * 40 - m * 20 + v * .9], 128 + n * 50 + m * 30, 220 + m * 30] })
    speckle(a, '#6d6a62', .12, 5, { height: -20 })
  }, normal: 1.3 },
  { name: 'straw', paint: a => {
    a.px((x, y) => { const stripe = Math.sin(x * .9) * .5 + .5, n = fbm(x * .1, y * .01, 4); const node = Math.exp(-((((y % 80) - 40) / 3) ** 2)); return [[200 + stripe * 24 - n * 30 - node * 40, 170 + stripe * 20 - n * 26 - node * 40, 82 + stripe * 10 - n * 16 - node * 20], 128 + stripe * 18 + node * 40, 190] })
    a.px((x, y) => [[154, 140, 72], 128, 200], 0, 192, W, W)
  } },
  { name: 'wheatEar', paint: a => {
    base(a, '#c9a548', { amp: 8, rough: 200 })
    for (let gy = 0; gy < 12; gy++) for (let gx = 0; gx < 8; gx++) {
      const cx = gx * 30 + (gy % 2) * 15 + 4, cy = gy * 20 + 10
      a.px((x, y) => { const d = Math.hypot((x - cx) / 12, (y - cy) / 9); if (d > 1) return null; const t = 1 - d; return [[200 + t * 50, 170 + t * 46, 76 + t * 30], 128 + t * 80, 170] }, Math.max(0, cx - 13), Math.max(0, cy - 10), Math.min(W, cx + 13), Math.min(W, cy + 10))
    }
  }, normal: 1.4 },
  { name: 'xenonGlass', paint: a => { a.px((x, y) => { const d = Math.hypot(x - 120, y - 120) / 170, n = fbm(x * .05, y * .05, 6); return [[70 + n * 60 + (1 - d) * 120, 210 + (1 - d) * 40, 190 + n * 40 + (1 - d) * 50], 128, 20] }) }, normal: .1 },
  { name: 'buckleMetal', paint: a => { brushed(a, '#5a5e62', { rough: 110 }); a.px((x, y) => hash(x >> 2, y >> 2, 7) > .97 ? [[150, 154, 156]] : null) } },
  { name: 'burlap', paint: a => { weave(a, '#a68a56', { pitch: 6, amp: 34, rough: 250 }); a.px((x, y) => hash(x, y >> 3, 11) > .985 ? [[120, 96, 60], 150] : null); text(a, 'DRIED GOODS', 120, 120, { size: 18, color: 'rgba(70,46,20,.55)', font: 'Impact, Arial' }) }, normal: 1.4 },
  { name: 'driedFruit', paint: a => {
    const q = [['#c86a22', '#e8963c'], ['#3a1f22', '#5a2e34'], ['#6a4430', '#8a5c3c'], ['#d6c48a', '#efe0a8']]
    q.forEach(([c0, c1], i) => {
      const x0 = (i % 2) * 120, y0 = Math.floor(i / 2) * 120
      a.px((x, y) => { const w = fbm(x * .08, y * .08, i + 30), wr = Math.sin((x + y * .5) * .3 + w * 6); return [mix3(hex(c0), hex(c1), w), 128 + wr * 40, 120 + w * 60] }, x0, y0, x0 + 120, y0 + 120)
    })
    speckle(a, '#e9dcc0', .25, 6, { x0: 0, y0: 120, x1: 120, y1: W, height: 30 })
  }, normal: 1.3 },
]

const food = [
  { name: 'ceramicWhite', paint: a => { base(a, '#efece4', { amp: 4, scale: .02, hAmp: 1, rough: 55 }); a.px((x, y) => Math.abs(fbm(x * .03, y * .03, 4) - .5) < .006 ? [[208, 204, 196]] : null); a.px(() => [[62, 92, 150], 130, 60], 0, 6, W, 12) }, normal: .3 },
  { name: 'stoneware', paint: a => { base(a, '#4c3a2c', { amp: 16, scale: .06, hAmp: 8, rough: 170 }); speckle(a, '#2e221a', .5, 3, { height: -10 }); a.px((x, y) => y < 40 ? [[94 - y * .6, 64 - y * .4, 44]] : null) } },
  { name: 'copperPot', paint: a => { brushed(a, '#c27a45', { rough: 80, vertical: false }); a.px((x, y) => { const p = fbm(x * .03, y * .03, 8); return p > .74 ? [[96, 128, 104], 120, 200] : null }) }, normal: .8 },
  { name: 'tomatoSoup', paint: a => {
    a.px((x, y) => { const d = Math.hypot(x - 120, y - 120) / 120, sw = Math.sin(Math.atan2(y - 120, x - 120) * 2 + d * 9 + fbm(x * .03, y * .03, 4) * 3); return [mix3([196, 52, 32], [228, 120, 80], (sw * .5 + .5) * .35), 128 + sw * 6, 70] })
    strokeAll(a, ctx => { for (let t = 0; t < 12; t += .1) { const r = 10 + t * 6; ctx.lineTo(120 + Math.cos(t) * r, 120 + Math.sin(t) * r) } }, 'rgba(250,236,214,.85)', 4, { height: 150 })
    speckle(a, '#3e6a26', .12, 9, { height: 10 })
  }, normal: .6 },
  { name: 'saladLeaf', paint: a => {
    a.px((x, y) => { const vx = Math.abs(x - 120), vein = Math.exp(-((vx / 3) ** 2)) + Math.exp(-(((((y + vx * .8) % 36) - 18) / 1.6) ** 2)) * (vx < 110 ? .6 : 0), n = fbm(x * .04, y * .04, 2); return [mix3([62, 128, 44], [146, 196, 82], n * .7 + vein * .5), 128 + vein * 50 + n * 20, 90] })
    speckle(a, '#8a2a3e', .18, 14, { x0: 0, y0: 0, x1: W, y1: 80 })
  }, normal: 1.2 },
  { name: 'bread', paint: a => {
    a.px((x, y) => { const n = fbm(x * .05, y * .05, 3), t = fbm(x * .2, y * .2, 7); return [mix3([150, 84, 30], [222, 160, 82], n), 128 + t * 40, 220] }, 0, 0, W, 120)
    speckle(a, '#4a6a22', .3, 7, { y1: 120, height: 10 })
    a.px((x, y) => { const pore = fbm(x * .25, y * .25, 9), butter = fbm(x * .02, y * .02, 11); return [mix3([236, 214, 160], [244, 210, 100], butter * .8).map(v => v - (pore < .35 ? 40 : 0)), 128 - (pore < .35 ? 60 : 0) + pore * 20, 200 - butter * 60] }, 0, 120, W, W)
    speckle(a, '#3e7a22', .35, 6, { y0: 120, height: 8 }); speckle(a, '#f4ecd0', .2, 5, { y0: 120, height: 20 })
  }, normal: 1.2 },
  { name: 'pasta', paint: a => {
    base(a, '#e8cf6a', { amp: 6, rough: 120 })
    for (let i = 0; i < 70; i++) strokeAll(a, ctx => { let x = hash(i, 1, 2) * W, y = hash(i, 3, 4) * W; ctx.moveTo(x, y); for (let k = 0; k < 6; k++) { x += (hash(i, k, 5) - .5) * 80; y += (hash(i, k, 6) - .5) * 80; ctx.quadraticCurveTo(x + 20, y - 20, x, y) } }, i % 3 ? '#f2dc84' : '#d4b450', 5, { height: 175 })
    a.px((x, y) => { const s = fbm(x * .03, y * .03, 8); return s > .6 ? [[200, 64, 40], 140, 80] : null })
  }, normal: 1.2 },
  { name: 'stew', paint: a => {
    a.px((x, y) => { const n = fbm(x * .04, y * .04, 3), oil = Math.max(0, fbm(x * .1, y * .1, 9) - .62) * 300; return [[110 + n * 40 + oil, 62 + n * 24 + oil * .7, 34 + n * 10 + oil * .3], 128 + n * 30, 80 - oil * .2] })
    speckle(a, '#d8803a', .15, 16, { height: 40 }); speckle(a, '#e8d07a', .1, 12, { height: 30 }); speckle(a, '#4a6a2a', .1, 6, { height: 10 })
  }, normal: 1.1 },
  { name: 'pizzaTop', paint: a => {
    a.px((x, y) => { const d = Math.hypot(x - 120, y - 120) / 120; const cheese = fbm(x * .05, y * .05, 5); const sauce = d > .9 ? 1 : cheese < .42 ? 1 : 0; return [sauce ? [178, 44, 26] : mix3([238, 206, 110], [250, 232, 160], fbm(x * .2, y * .2, 7)), 128 + (sauce ? -10 : 20 + cheese * 30), sauce ? 70 : 110] })
    speckle(a, '#c46a2c', .25, 10, { height: 20 })
    strokeAll(a, ctx => { for (let i = 0; i < 4; i++) { const t = i / 4 * Math.PI; ctx.moveTo(120 - Math.cos(t) * 120, 120 - Math.sin(t) * 120); ctx.lineTo(120 + Math.cos(t) * 120, 120 + Math.sin(t) * 120) } }, 'rgba(90,30,14,.5)', 2, { height: 90 })
    speckle(a, '#2e5a1e', .1, 8, { height: 5 })
  }, normal: 1.1 },
  { name: 'lasagna', paint: a => {
    const layers = [['#e6c060', 14], ['#a8452e', 16], ['#f2e4c4', 10], ['#e6c060', 12], ['#9a3c26', 18], ['#f2e4c4', 10], ['#e6c060', 12], ['#b04a30', 16], ['#f0dcae', 12]]
    let y = 0
    for (const [c, t] of layers) { const yy = y; a.px((x, py) => { const n = fbm(x * .1, py * .1, yy); const wob = Math.sin(x * .05 + yy) * 2; return py - yy < wob ? null : [hex(c).map(v => v + (n - .5) * 30), 128 + (n - .5) * 40, 120] }, 0, yy, W, Math.min(120, yy + t + 3)); y += t }
    a.px((x, py) => { const n = fbm(x * .07, py * .07, 4), b = fbm(x * .2, py * .2, 6); return [mix3([214, 150, 50], [246, 214, 120], n).map(v => v - (b > .72 ? 70 : 0)), 128 + n * 40 - (b > .72 ? 20 : 0), 150] }, 0, 120, W, W)
    speckle(a, '#3e6a26', .2, 8, { y0: 120, height: 5 })
  }, normal: 1.1 },
  { name: 'rawMeat', paint: a => {
    a.px((x, y) => { const n = fbm(x * .03, y * .03, 4), m = Math.abs(fbm(x * .02, y * .06, 7) - .5); const fat = m < .035 ? 1 - m / .035 : 0; return [mix3(mix3([140, 34, 40], [186, 60, 64], n), [236, 214, 200], fat), 128 + fat * 30 + n * 20, 90 - fat * 20] })
  } },
  { name: 'steak', paint: a => {
    a.px((x, y) => { const n = fbm(x * .04, y * .04, 2), char = fbm(x * .15, y * .15, 5); return [mix3([96, 52, 30], [146, 88, 48], n).map(v => v - char * 20), 128 + char * 40, 150] }, 0, 0, W, 192)
    for (let i = -2; i < 6; i++) strokeAll(a, ctx => { ctx.moveTo(i * 44, 0); ctx.lineTo(i * 44 + 120, 192) }, 'rgba(34,18,10,.85)', 9, { height: 70 })
    speckle(a, '#c9b48a', .2, 5, { y1: 192, height: 10 })
    a.px((x, y) => { const n = fbm(x * .1, y * .3, 6); return y < 216 ? [[118 + n * 30, 66 + n * 20, 40], 128, 160] : [[232, 210, 184].map(v => v - n * 30), 140, 120] }, 0, 192, W, W)
  }, normal: 1.3 },
  { name: 'jam', paint: a => {
    a.px((x, y) => { const n = fbm(x * .03, y * .03, 3), seed = hash(x >> 2, y >> 2, 4) > .985; return [seed ? [230, 190, 120] : mix3([110, 10, 30], [196, 30, 60], n), 128 + n * 50 + (seed ? 20 : 0), 30] })
  }, normal: .9 },
  { name: 'shrimpShell', paint: a => {
    a.px((x, y) => { const band = Math.sin(y * .26) * .5 + .5, n = fbm(x * .06, y * .06, 3); return [mix3([170, 82, 36], [226, 140, 76], band * .6 + n * .4), 128 + band * 50, 90] }, 0, 0, W, 211)
    speckle(a, '#8a3a1a', .3, 5, { y1: 211, height: -10 })
    a.px((x, y) => [[30, 24, 22], 128, 60], 0, 211, W, W)
  }, normal: 1.2 },
  { name: 'batter', paint: a => {
    a.px((x, y) => { const n = fbm(x * .06, y * .06, 3), crumb = fbm(x * .3, y * .3, 9); return [mix3([196, 124, 40], [246, 196, 98], n * .5 + crumb * .5), 128 + crumb * 120 - 30, 210] })
    speckle(a, '#fae2a0', .4, 4, { height: 40 })
  }, normal: 1.6 },
  { name: 'garnish', paint: a => {
    a.px((x, y) => { const v = Math.exp(-(((x - 60) / 2.5) ** 2)), n = fbm(x * .06, y * .06, 2); return [mix3([38, 104, 34], [86, 156, 60], n + v * .4), 128 + v * 40, 100] }, 0, 0, 120, 120)
    a.px((x, y) => { const d = Math.hypot(x - 170, y - 50) / 70, n = fbm(x * .05, y * .05, 5); return [mix3([226, 50, 34], [180, 24, 20], n).map(v => v + Math.max(0, .3 - d) * 300), 128, 40] }, 120, 0, W, 120)
    a.px((x, y) => { const n = fbm(x * .08, y * .08, 7); return [mix3([240, 214, 140], [252, 236, 190], n), 128 + n * 30, 110] }, 0, 120, 120, W)
    a.px((x, y) => { const r = Math.sin(Math.hypot(x - 180, y - 180) * .5) * .5 + .5; return [mix3([226, 120, 30], [246, 160, 60], r), 128 + r * 20, 130] }, 120, 120, W, W)
  } },
]

const paper = [
  { name: 'kraftFolder', paint: a => {
    base(a, '#c8a46a', { amp: 10, scale: .05, hAmp: 4, rough: 230 })
    a.px((x, y) => hash(x, y >> 1, 2) > .996 ? [[150, 120, 76]] : null)
    a.c.save(); a.c.translate(120, 108); a.c.rotate(-.2); a.c.strokeStyle = 'rgba(160,30,30,.75)'; a.c.lineWidth = 4; a.c.strokeRect(-80, -26, 160, 52)
    a.c.font = 'bold 22px "Courier New", monospace'; a.c.fillStyle = 'rgba(160,30,30,.8)'; a.c.textAlign = 'center'; a.c.textBaseline = 'middle'; a.c.fillText('CONFIDENTIAL', 0, -4)
    a.c.font = 'bold 10px Arial'; a.c.fillText('M.E.G. ARCHIVE · DO NOT REMOVE', 0, 16); a.c.restore()
    shapeFill(a, ctx => ctx.rect(30, 180, 90, 30), '#efe6cc'); text(a, 'FILE  L-11/07', 75, 195, { size: 11, color: '#3a3020', font: '"Courier New", monospace' })
  } },
  { name: 'paper', paint: a => {
    a.px((x, y) => { const line = y % 4 < 1 ? -26 : 0, n = (hash(x >> 3, y, 4) - .5) * 10; return [[236 + line + n, 230 + line + n, 214 + line + n], 128 + line, 240] }, 0, 0, W, 120)
    base(a, '#f2eee2', { y0: 120, amp: 4, rough: 230 })
    for (let y = 140; y < W; y += 12) a.px(() => [[170, 190, 214]], 0, y, W, y + 1)
    a.px(() => [[220, 120, 120]], 30, 120, 31, W)
  }, normal: .8 },
  { name: 'bookCloth', paint: a => {
    weave(a, '#4a3466', { pitch: 2, amp: 16, rough: 230 })
    strokeAll(a, ctx => ctx.rect(40, 14, 190, 212), '#c8a24a', 3, { height: 165, rough: 80 })
    strokeAll(a, ctx => { for (let i = 0; i < 7; i++) { const t = i / 7 * Math.PI * 2 - Math.PI / 2; ctx.lineTo(135 + Math.cos(t) * 46, 112 + Math.sin(t) * 46); const t2 = t + Math.PI / 7 * 3; ctx.lineTo(135 + Math.cos(t2) * 46, 112 + Math.sin(t2) * 46) } ctx.closePath() }, '#d4ae52', 3, { height: 175, rough: 80 })
    strokeAll(a, ctx => ctx.arc(135, 112, 56, 0, Math.PI * 2), '#d4ae52', 2, { height: 170, rough: 80 })
    text(a, 'ON THE NATURE', 135, 188, { size: 12, color: '#d4ae52', font: 'Georgia, serif', emboss: -1 })
    text(a, 'OF ROOMS', 135, 204, { size: 12, color: '#d4ae52', font: 'Georgia, serif', emboss: -1 })
    a.px((x, y) => [[54, 38, 74], 120, 230], 0, 0, 29, W)
  } },
  { name: 'pamphlet', paint: a => {
    base(a, '#f4efe2', { amp: 3, rough: 200 })
    const panel = (k, top) => {
      const x = k * 80, y = top ? 0 : 120
      if (top && k === 0) { shapeFill(a, ctx => ctx.rect(x + 4, y + 4, 72, 112), '#2f6d8a'); text(a, 'WELCOME', x + 40, y + 34, { size: 13, color: '#fff' }); text(a, 'TO THE', x + 40, y + 52, { size: 9, color: '#dff' }); text(a, 'CITY', x + 40, y + 74, { size: 18, color: '#ffd96a' }); shapeFill(a, ctx => ctx.rect(x + 14, y + 88, 52, 20), '#f3c14a') }
      else if (top && k === 1) { text(a, 'RULES', x + 40, y + 16, { size: 12, color: '#c0392b' }); for (let i = 0; i < 7; i++) shapeFill(a, ctx => ctx.rect(x + 8, y + 32 + i * 11, 60 - (i % 3) * 10, 4), '#8a8478') }
      else if (top && k === 2) { shapeFill(a, ctx => ctx.arc(x + 40, y + 50, 26, 0, Math.PI * 2), '#c0392b'); text(a, 'B.N.T.G.', x + 40, y + 50, { size: 11, color: '#fff' }); for (let i = 0; i < 3; i++) shapeFill(a, ctx => ctx.rect(x + 10, y + 86 + i * 9, 58, 3), '#8a8478') }
      else { text(a, ['MAP', 'HOURS', 'TRADE'][k], x + 40, y + 14, { size: 11, color: '#2f6d8a' }); for (let i = 0; i < 8; i++) shapeFill(a, ctx => ctx.rect(x + 8, y + 28 + i * 10, 64 - (i % 4) * 8, 3), '#9a948a'); if (k === 0) strokeAll(a, ctx => { ctx.rect(x + 10, y + 70, 60, 40); ctx.moveTo(x + 10, y + 90); ctx.lineTo(x + 70, y + 84) }, '#c0392b', 2) }
    }
    for (let k = 0; k < 3; k++) { panel(k, true); panel(k, false) }
  }, normal: .4 },
  { name: 'burntNote', paint: a => {
    a.px((x, y) => { const d = Math.min(x, y, W - x, W - y) / 120, n = fbm(x * .05, y * .05, 3), burn = clamp((.32 - d * 1.4 + (n - .5) * .5) * 4, 0, 1); return [mix3(mix3([222, 206, 160], [200, 180, 130], n), [30, 20, 14], burn), 128 - burn * 20, 240] })
    handwriting(a, ['if you find this', 'don\'t trust the', 'exit on level', 'the lights lie —'], 40, 80, 26, '#2c241c', { size: 15, seed: 3 })
  } },
  { name: 'welcomeNote', paint: a => {
    base(a, '#f4ecc8', { amp: 4, rough: 230 })
    for (let y = 30; y < W; y += 16) a.px(() => [[158, 182, 210]], 0, y, W, y + 1)
    handwriting(a, ['Welcome, wanderer.', 'Water is safe in', 'the thermos. Stay', 'off the carpet.', 'Count the lights.'], 18, 44, 32, '#203a6a', { size: 14, seed: 5, width: 96 })
    handwriting(a, ['You are not', 'alone here.', 'Head for the', 'Hub. — R.', ''], 136, 44, 32, '#203a6a', { size: 14, seed: 9, width: 96 })
    a.px(() => [[214, 204, 168]], 119, 0, 121, W)
  }, normal: .4 },
  { name: 'leather', paint: a => {
    a.px((x, y) => { const n = fbm(x * .05, y * .05, 3), p = fbm(x * .4, y * .4, 8); return [mix3([70, 40, 26], [112, 68, 42], n).map(v => v - (p < .3 ? 14 : 0)), 128 + p * 40, 170] }, 0, 0, W, 192)
    strokeAll(a, ctx => ctx.rect(12, 12, 216, 168), 'rgba(40,22,12,.7)', 2, { height: 100 })
    a.px((x, y) => [[24, 24, 26].map(v => v + Math.sin(x * .8) * 6), 128 + Math.sin(x * .8) * 20, 220], 0, 192, W, W)
  } },
  { name: 'cardboard', paint: a => {
    base(a, '#b28f58', { amp: 10, scale: .04, hAmp: 3, rough: 235 })
    a.px((x, y) => { const f = Math.sin(y * .8) * 4; return [[178 + f, 143 + f, 88 + f], 128 + f * 3] })
    // 左上：顶面（十字胶带 + 面单 + 天平章）
    a.px(() => [[212, 196, 152], 136, 80], 45, 0, 75, 120); a.px(() => [[212, 196, 152], 136, 80], 0, 45, 120, 75)
    shapeFill(a, ctx => ctx.rect(70, 8, 44, 32), '#f4ecd2'); for (let i = 0; i < 4; i++) shapeFill(a, ctx => ctx.rect(74, 14 + i * 6, 34 - i * 4, 2), '#4a4a4a')
    for (let i = 0; i < 10; i++) shapeFill(a, ctx => ctx.rect(74 + i * 3, 32, 1 + (i % 3), 6), '#222')
    strokeAll(a, ctx => { ctx.arc(26, 96, 14, 0, Math.PI * 2); ctx.moveTo(14, 92); ctx.lineTo(38, 92); ctx.moveTo(26, 84); ctx.lineTo(26, 106) }, '#3d5a40', 2)
    // 右上：侧面（竖胶带 + FRAGILE）
    a.px(() => [[212, 196, 152], 136, 80], 165, 0, 195, 120)
    text(a, 'FRAGILE', 150, 90, { size: 12, color: '#a02a20', rot: 0 })
    // 左下：箭头
    strokeAll(a, ctx => { for (const x of [40, 72]) { ctx.moveTo(x, 210); ctx.lineTo(x, 160); ctx.moveTo(x - 9, 170); ctx.lineTo(x, 158); ctx.lineTo(x + 9, 170) } }, '#3a2c1a', 4)
    text(a, 'THIS SIDE UP', 60, 224, { size: 9, color: '#3a2c1a' })
    // 右下：底面胶带
    a.px(() => [[212, 196, 152], 136, 80], 165, 120, 195, W)
  } },
  { name: 'foil', paint: a => {
    a.px((x, y) => { const c = fbm(x * .09, y * .09, 3), cr = Math.abs(fbm(x * .05, y * .05, 6) - .5) < .02 ? -60 : 0; const v = 160 + c * 80 + cr; return [[v, v + 2, v + 8], 128 + c * 60 + cr * .5, 50 + c * 30] }, 0, 0, W, 192)
    brushed(a, '#c49a42', { y0: 192, rough: 70 })
  }, normal: 1.4 },
  { name: 'gunmetal', paint: a => {
    brushed(a, '#3a3e46', { y1: 168, rough: 70 })
    a.px((x, y) => fbm(x * .05, y * .05, 8) > .7 ? [[96, 98, 102], undefined, 120] : null, 0, 0, W, 168)
    a.px((x, y) => { const ch = (Math.sin(x * .9 + y * .9) > .6 || Math.sin(x * .9 - y * .9) > .6) ? 1 : 0; return [[86 - ch * 30, 56 - ch * 20, 36 - ch * 10], 128 + ch * 50, 210] }, 0, 168, W, W)
  } },
  { name: 'stanley', paint: a => {
    base(a, '#ece8de', { amp: 4, rough: 220 })
    // 左半：人形正面（模型轮廓 x -.068..068，y -.075..132；映射到 x 0..120, y 0..240）
    const X = (mx) => (mx + .068) / .136 * 120, Y = (my) => (1 - (my + .075) / .207) * 240
    shapeFill(a, ctx => { ctx.arc(X(0), Y(.115), 13, 0, Math.PI * 2) }, '#f0d6b8')
    strokeAll(a, ctx => { ctx.arc(X(0), Y(.115), 13, 0, Math.PI * 2) }, '#2a2a2a', 1.5)
    shapeFill(a, ctx => { ctx.arc(X(-.005), Y(.118), 1.6, 0, 7); ctx.arc(X(.005), Y(.118), 1.6, 0, 7) }, '#2a2a2a')
    strokeAll(a, ctx => { ctx.arc(X(0), Y(.11), 5, .2, Math.PI - .2) }, '#2a2a2a', 1.2)
    shapeFill(a, ctx => ctx.rect(X(-.034), Y(.09), X(.034) - X(-.034), Y(0) - Y(.09)), '#fafafa')
    shapeFill(a, ctx => { ctx.moveTo(X(0), Y(.088)); ctx.lineTo(X(.006), Y(.075)); ctx.lineTo(X(0), Y(.02)); ctx.lineTo(X(-.006), Y(.075)); ctx.closePath() }, '#b02a2a')
    shapeFill(a, ctx => ctx.rect(X(-.032), Y(0), X(.032) - X(-.032), Y(-.075) - Y(0)), '#2b3442')
    strokeAll(a, ctx => { ctx.moveTo(X(0), Y(-.005)); ctx.lineTo(X(0), Y(-.075)) }, '#ece8de', 2)
    text(a, '427', X(0), Y(.055), { size: 9, color: '#888' })
    // 右半：背面文字
    text(a, 'STANLEY', 180, 100, { size: 14, color: '#555', rot: -Math.PI / 2 }); text(a, 'PAPER CANDY', 200, 130, { size: 9, color: '#888', rot: -Math.PI / 2 })
  }, normal: .4 },
  { name: 'hazardDrum', paint: a => {
    a.px((x, y) => { const n = fbm(x * .05, y * .05, 3); return [[220 - n * 30, 190 - n * 30, 40], 128, 140] }, 0, 0, W, 168)
    for (const y of [10, 150]) a.px(() => [[28, 28, 24], 120, 160], 0, y, W, y + 12)
    shapeFill(a, ctx => ctx.rect(70, 36, 100, 100), '#f2e9c0'); trefoil(a.c, 120, 76, 28, '#1a1a1a')
    text(a, 'HAZARDOUS', 120, 118, { size: 12, color: '#1a1a1a' }); text(a, 'CANDY WASTE', 120, 130, { size: 8, color: '#1a1a1a' })
    a.px((x, y) => { const n = fbm(x * .2, y * .2, 4); return n > .72 ? [[110, 70, 34], 110, 230] : null }, 0, 0, W, 168)
    a.px((x, y) => { const d = Math.hypot(x - 36, y - 204) / 36; return [[176 - d * 30, 168 - d * 30, 120], 128 + Math.sin(d * 18) * 20, 150] }, 0, 168, 72, W)
  } },
  { name: 'wafer', paint: a => {
    a.px((x, y) => { const g = (x % 20 < 3 || y % 20 < 3) ? 1 : 0, n = fbm(x * .1, y * .1, 3); return [[232 - g * 30 + n * 10, 160 - g * 30 + n * 10, 184 - g * 30], 128 + (g ? -40 : 20), 200] }, 0, 0, W, 120)
    a.px((x, y) => { const layer = Math.floor((y - 120) / 15) % 2, n = fbm(x * .2, y * .2, 6); return layer ? [[246, 222, 228], 120, 160] : [[226 + n * 20, 150, 176], 140 + n * 30, 220] }, 0, 120, W, W)
  } },
  { name: 'mint', paint: a => { base(a, '#a6d8b6', { amp: 10, scale: .1, hAmp: 10, rough: 80 }); speckle(a, '#e4f6ea', .4, 3, { height: 30 }); a.px((x, y) => Math.sin(x * .2) > .9 ? [[200, 236, 210]] : null) } },
  { name: 'manmade', paint: a => {
    base(a, '#eadcc4', { y1: 120, amp: 6, rough: 120 })
    for (let x = -20; x < W; x += 30) strokeAll(a, ctx => { ctx.moveTo(x, 0); ctx.lineTo(x + 40, 120) }, 'rgba(176,40,40,.5)', 6)
    shapeFill(a, ctx => ctx.roundRect(40, 30, 160, 60, 10), '#b02828'); text(a, 'MAN-MADE', 120, 54, { size: 22, color: '#fbe9d0', font: 'Impact, Arial' }); text(a, 'ARTISANAL CONFECTION', 120, 76, { size: 9, color: '#fbe9d0' })
    a.px((x, y) => { const n = fbm(x * .04, y * .04, 9), m = Math.abs(fbm(x * .03, y * .08, 4) - .5) < .03 ? 1 : 0; return [mix3(mix3([140, 70, 60], [196, 120, 108], n), [236, 210, 200], m), 128 + n * 30, 90] }, 0, 120, W, W)
  } },
  { name: 'cityWater', paint: a => {
    // 左半：标签
    a.px(() => [[240, 244, 246], 128, 160], 0, 0, 120, W)
    shapeFill(a, ctx => ctx.rect(0, 30, 120, 34), '#2a6aa8')
    text(a, 'CITY', 60, 47, { size: 18, color: '#ffffff', sx: .55 }); text(a, 'MUNICIPAL WATER', 60, 84, { size: 10, color: '#2a6aa8', sx: .5 })
    strokeAll(a, ctx => ctx.arc(60, 140, 26, 0, Math.PI * 2), '#2a6aa8', 3); text(a, 'L·11', 60, 140, { size: 13, color: '#2a6aa8', sx: .6 })
    for (let i = 0; i < 4; i++) shapeFill(a, ctx => ctx.rect(14, 184 + i * 9, 92 - i * 10, 3), '#9ab0c2')
    // 右上：玻璃；右中：水；右下：瓶盖
    a.px((x, y) => { const s = Math.exp(-(((x - 150) / 6) ** 2)) * 50; return [[200 + s, 226 + s, 230 + s * .5], 128, 10] }, 120, 0, W, 120)
    a.px((x, y) => { const n = fbm(x * .05, y * .05, 4); return [[90 + n * 30, 160 + n * 30, 210], 128, 10] }, 120, 120, W, 180)
    a.px((x) => { const t = Math.sin(x * 1.4); return [[150 + t * 30, 154 + t * 30, 160 + t * 30], 128 + t * 50, 80] }, 120, 180, W, W)
  }, normal: .6 },
]

const atlases = { tools, gear, food, paper }
for (const [name, tiles] of Object.entries(atlases)) {
  if (tiles.length !== 16) throw new Error(`${name}: ${tiles.length} tiles`)
  makeAtlas(name, tiles)
}
console.log('Generated refined-item atlases: tools, gear, food, paper (color 1024², OpenGL normal 512², roughness 512²)')
