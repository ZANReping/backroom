/* eslint-disable @typescript-eslint/no-explicit-any -- 出图脚本 */
// [l5tails] 出图素材（无头）：肖像 / 章鱼头画布、墙纸人脸叠墙纸、各楼层俯视（走廊肖像 / 书架 / 行李 / 灯 / 水洼 / 黑门）。
// 运行：npx esbuild scripts/l5tails-dump.ts --bundle --platform=node --format=esm --external:@napi-rs/canvas --outfile=.cache/l5tails-dump.mjs && node .cache/l5tails-dump.mjs
import { createCanvas } from '@napi-rs/canvas'
import { writeFileSync, mkdirSync } from 'node:fs'
const memory = new Map<string, string>()
Object.assign(globalThis, {
  document: { createElement: () => createCanvas(256, 256), getElementById: () => null, addEventListener() {}, removeEventListener() {}, body: { appendChild() {} } },
  window: { addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false }), devicePixelRatio: 1 },
  localStorage: { getItem: (k: string) => memory.get(k) ?? null, setItem: (k: string, v: string) => memory.set(k, v), removeItem: (k: string) => memory.delete(k) },
})
const { Engine } = await import('../src/game/engine')
const P = await import('../src/game/renderer/l5Portrait')
const RT = await import('../src/game/renderer/l5Tails')
const out = 'reports/l5tails/parts/'
mkdirSync(out, { recursive: true })
const png = (c: any, name: string) => writeFileSync(out + name, c.toBuffer('image/png'))
const img = (t: any) => t.image as any

// ① 肖像：9 张人像 + 3 张章鱼头
{
  const c = createCanvas(256 * 6, 320 * 2), g = c.getContext('2d')
  for (let i = 0; i < 9; i++) { const gr = P.buildL5Portrait(i, 1.12, 1.4, false); const t = ((gr.userData.portrait.front.children[0]) as any).material.map; g.drawImage(img(t), (i % 6) * 256, Math.floor(i / 6) * 320) }
  for (let k = 0; k < 3; k++) g.drawImage(img(P.paintOcto([0, 4, 6][k])), (3 + k) * 256, 320)
  png(c, 'portraits.png')
}
// ② 墙纸人脸：程序墙纸底 + 4 种脸，透明度 0.25 / 0.6 / 0.9
{
  const c = createCanvas(4 * 200, 250), g = c.getContext('2d')
  for (let k = 0; k < 4; k++) {
    const x0 = k * 200
    g.fillStyle = '#6a4a2c'; g.fillRect(x0, 0, 200, 250)
    g.strokeStyle = 'rgba(214,170,96,.45)'; g.lineWidth = 2
    for (let y = -20; y < 270; y += 36) for (let x = x0 - 20; x < x0 + 220; x += 36) { g.beginPath(); g.moveTo(x, y + 18); g.quadraticCurveTo(x + 18, y, x + 36, y + 18); g.quadraticCurveTo(x + 18, y + 36, x, y + 18); g.stroke() }
    g.globalAlpha = [0.3, 0.6, 0.9, 0.9][k]; g.drawImage(img(RT.wallFaceTexture(k)), x0 + 20, 10, 160, 200); g.globalAlpha = 1
  }
  png(c, 'wallface.png')
}
// ③④⑥ 俯视：每层一张（墙 / 地板 / 走廊肖像 / 书架 / 行李 / 走廊灯 / 水洼 / 黑门）
const plot = (floor: number, sd: number, name: string, crop?: { cx: number; cy: number; r: number }) => {
  const e: any = new Engine(); e.seed = sd * 313; e.emit = () => {}; e.hotel.floor = floor
  e.loadLevel(5, { mapSeed: sd * 313 + floor, firstVisit: true })
  const m = e.map, S = 4
  let x0 = 0, y0 = 0, w = m.w, h = m.h
  if (crop) { x0 = Math.max(0, crop.cx - crop.r); y0 = Math.max(0, crop.cy - crop.r); w = Math.min(m.w - x0, crop.r * 2); h = Math.min(m.h - y0, crop.r * 2) }
  const c = createCanvas(w * S, h * S), g = c.getContext('2d')
  g.fillStyle = '#1b1410'; g.fillRect(0, 0, w * S, h * S)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (m.tiles[(y + y0) * m.w + x + x0] === 1) { g.fillStyle = '#5a2c26'; g.fillRect(x * S, y * S, S, S) }
  const dot = (x: number, y: number, col: string, r = 3) => { g.fillStyle = col; g.beginPath(); g.arc((x - x0 + 0.5) * S, (y - y0 + 0.5) * S, r, 0, Math.PI * 2); g.fill() }
  for (const s of m.structures) {
    if (s.kind === 'lightgrid' && s.data?.axis) dot(s.x, s.y, '#ffe9a0', 1.6)
    if (s.kind === 'bigpainting' && s.data?.gaze) dot(s.x, s.y, s.data?.corridor ? '#ff5a5a' : '#ff9a9a', 3)
    if (s.kind === 'libshelf' && s.data?.corridor) { g.fillStyle = '#4ad07a'; g.fillRect((s.x - x0) * S, (s.y - y0) * S, S, S) }
    if (s.kind === 'l5luggage') { g.fillStyle = '#48a8ff'; g.fillRect((s.x - x0) * S, (s.y - y0) * S, S, S) }
    if (s.kind === 'l5puddle') dot(s.x, s.y, '#7ff', 3)
  }
  for (const x of m.exits ?? []) if (x.def?.kind === 'boilerdeep') { dot(x.x, x.y, '#000', 7); dot(x.x, x.y, '#ff00ff', 4) }
  png(c, name)
  return { exits: (m.exits ?? []).filter((x: any) => x.def?.kind === 'boilerdeep').map((x: any) => [x.x, x.y]), w: m.w, h: m.h }
}
const r1 = plot(1, 1, 'f1.png', { cx: 96, cy: 96, r: 48 })
plot(7, 1, 'f7.png', { cx: 96, cy: 96, r: 48 })
plot(9, 1, 'f9.png', { cx: 96, cy: 96, r: 48 })
plot(10, 1, 'f10.png', { cx: 96, cy: 96, r: 48 })
const b = plot(0, 2, 'b1.png')
console.log(JSON.stringify({ r1, b1: b }))
