import * as THREE from 'three'
import { makeCanvasCtx, toTex } from './shared'

let cached: { wing: THREE.Texture; skin: THREE.Texture; relief: THREE.Texture; facets: THREE.Texture } | undefined
/** Deterministic painted scale layers: cached for the entire colony. */
export function mothTextures() {
  if (cached) return cached
  const n = 512, [c, ctx] = makeCanvasCtx(n, n), pixels = ctx.createImageData(n, n)
  const noise = (x: number, y: number) => ((Math.imul(x + 17, 73856093) ^ Math.imul(y + 51, 19349663)) >>> 0) % 1021 / 1021
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const u = x / n, v = y / n, band = u + Math.sin(v * 8) * .055 + Math.sin(v * 29) * .011
    const scales = noise(x >> 1, y >> 1) * .18 + Math.sin(y * 2.2 + x * .31) * .045
    const stripe = Math.exp(-Math.pow((band - .68) / .043, 2)) * .34 + Math.exp(-Math.pow((band - .37) / .022, 2)) * .17
    const edge = Math.max(0, (u - .91) * 7), k = .82 + scales - stripe - edge
    const i = (y * n + x) * 4
    pixels.data[i] = 170 * k; pixels.data[i + 1] = 147 * k; pixels.data[i + 2] = 93 * k; pixels.data[i + 3] = 255
  }
  ctx.putImageData(pixels, 0, 0)
  // Veins branch from the wing root; the thin pale ridge borders each darker vein.
  for (let i = 0; i < 10; i++) {
    const yy = 18 + i * 53
    for (const [color, width, off] of [['#736449', 2.1, 0], ['#c7b57c', .7, 2]] as const) {
      ctx.strokeStyle = color; ctx.lineWidth = width; ctx.beginPath(); ctx.moveTo(0, 310)
      ctx.bezierCurveTo(140, 280, 270, yy + 12 + off, 512, yy + off); ctx.stroke()
      ctx.beginPath(); ctx.moveTo(270, yy + 20); ctx.lineTo(465, yy + 41); ctx.stroke()
    }
  }
  for (let j = 0; j < 7; j++) {
    ctx.fillStyle = j % 2 ? '#52432e' : '#d1bd85'
    ctx.beginPath(); ctx.ellipse(447 + Math.sin(j * 2) * 9, 30 + j * 72, 10, 14, .5, 0, Math.PI * 2); ctx.fill()
  }
  ctx.fillStyle = '#58492f'; ctx.beginPath(); ctx.ellipse(280, 260, 15, 24, -.4, 0, Math.PI * 2); ctx.fill()
  ctx.strokeStyle = '#d6c08a'; ctx.lineWidth = 3; ctx.stroke()
  const wing = toTex(c); wing.anisotropy = 4
  const [sc, sx] = makeCanvasCtx(256, 256), [bc, bx] = makeCanvasCtx(256, 256)
  const skinData = sx.createImageData(256, 256), bumpData = bx.createImageData(256, 256)
  for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) {
    const i = (y * 256 + x) * 4, grit = noise(x, y), mottling = noise(x >> 3, y >> 3)
    const ridge = Math.pow(.5 + .5 * Math.sin(y * .31 + Math.sin(x * .09)), 8)
    const k = .63 + grit * .22 + mottling * .15 - ridge * .13
    skinData.data[i] = 238 * k; skinData.data[i + 1] = 226 * k; skinData.data[i + 2] = 200 * k; skinData.data[i + 3] = 255
    bumpData.data[i] = bumpData.data[i + 1] = bumpData.data[i + 2] = 100 + grit * 75 + ridge * 60; bumpData.data[i + 3] = 255
  }
  sx.putImageData(skinData, 0, 0); bx.putImageData(bumpData, 0, 0)
  const skin = toTex(sc), relief = toTex(bc); relief.colorSpace = THREE.NoColorSpace
  const [ec, ex] = makeCanvasCtx(128, 128)
  ex.fillStyle = '#424242'; ex.fillRect(0, 0, 128, 128)
  for (let row = -1; row < 22; row++) for (let col = -1; col < 19; col++) {
    const x = col * 7.2 + (row % 2) * 3.6, y = row * 6.2
    const gradient = ex.createRadialGradient(x - .5, y - .5, 0, x, y, 3.4)
    gradient.addColorStop(0, '#cccccc'); gradient.addColorStop(1, '#646464')
    ex.fillStyle = gradient; ex.beginPath()
    for (let v = 0; v < 6; v++) { const a = v * Math.PI / 3 + Math.PI / 6; ex.lineTo(x + Math.cos(a) * 3.4, y + Math.sin(a) * 3.4) }
    ex.closePath(); ex.fill()
  }
  const facets = toTex(ec); facets.colorSpace = THREE.NoColorSpace
  cached = { wing, skin, relief, facets }; return cached
}
