import { createCanvas } from '@napi-rs/canvas'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

const N = 512
const outDir = resolve(process.cwd(), 'public/textures')
mkdirSync(outDir, { recursive: true })

type RGB = [number, number, number]
type Kind = 'soil' | 'grass' | 'rut' | 'packed' | 'shore' | 'wood' | 'wheat' | 'hedge' | 'metal' | 'hay'
type Profile = { name: string; seed: number; kind: Kind; dark: RGB; light: RGB; rough: number; normal: number }

const profiles: Profile[] = [
  { name: 'l10_dry_soil', seed: 101, kind: 'soil', dark: [73, 57, 39], light: [158, 130, 86], rough: .91, normal: 3.2 },
  { name: 'l10_grass', seed: 211, kind: 'grass', dark: [39, 54, 30], light: [112, 129, 72], rough: .96, normal: 4.1 },
  { name: 'l10_wet_rut', seed: 307, kind: 'rut', dark: [30, 25, 20], light: [83, 66, 46], rough: .31, normal: 5.4 },
  { name: 'l10_packed_dirt', seed: 401, kind: 'packed', dark: [82, 65, 45], light: [164, 137, 96], rough: .82, normal: 2.4 },
  { name: 'l10_damp_shore', seed: 503, kind: 'shore', dark: [54, 52, 43], light: [132, 125, 101], rough: .48, normal: 3.0 },
  { name: 'l10_wood', seed: 601, kind: 'wood', dark: [60, 40, 24], light: [160, 118, 72], rough: .73, normal: 3.7 },
  { name: 'l10_wheat', seed: 701, kind: 'wheat', dark: [118, 89, 35], light: [225, 201, 109], rough: .93, normal: 3.5 },
  { name: 'l10_hedge', seed: 809, kind: 'hedge', dark: [31, 49, 27], light: [102, 126, 73], rough: .96, normal: 4.5 },
  { name: 'l10_metal', seed: 907, kind: 'metal', dark: [55, 55, 51], light: [143, 137, 122], rough: .66, normal: 2.8 },
  { name: 'l10_hay', seed: 1009, kind: 'hay', dark: [111, 78, 25], light: [226, 190, 91], rough: .96, normal: 4.7 },
]

const clamp = (v: number, a = 0, b = 1) => Math.max(a, Math.min(b, v))
const smooth = (t: number) => t * t * (3 - 2 * t)
const hash = (x: number, y: number, seed: number) => {
  let h = Math.imul(x ^ seed, 0x45d9f3b) ^ Math.imul(y + seed * 17, 0x27d4eb2d)
  h ^= h >>> 16; h = Math.imul(h, 0x7feb352d); h ^= h >>> 15
  return (h >>> 0) / 4294967296
}
const valueNoise = (x: number, y: number, cell: number, seed: number) => {
  const count = N / cell
  const gx = Math.floor(x / cell), gy = Math.floor(y / cell)
  const fx = smooth((x % cell) / cell), fy = smooth((y % cell) / cell)
  const at = (ix: number, iy: number) => hash((ix + count) % count, (iy + count) % count, seed)
  const a = at(gx, gy), b = at(gx + 1, gy), c = at(gx, gy + 1), d = at(gx + 1, gy + 1)
  return (a + (b - a) * fx) + ((c + (d - c) * fx) - (a + (b - a) * fx)) * fy
}
const fbm = (x: number, y: number, seed: number) =>
  valueNoise(x, y, 128, seed) * .43 + valueNoise(x, y, 64, seed + 1) * .29
  + valueNoise(x, y, 32, seed + 2) * .18 + valueNoise(x, y, 16, seed + 3) * .10

function sample(profile: Profile, x: number, y: number) {
  const n = fbm(x, y, profile.seed)
  const fine = valueNoise(x, y, 8, profile.seed + 11)
  let h = n * .72 + fine * .28, tone = n * .78 + fine * .22, rough = profile.rough
  const px = ((x % N) + N) % N, py = ((y % N) + N) % N
  if (profile.kind === 'grass') {
    const blades = Math.abs(Math.sin(px * .37 + n * 8)) * Math.pow(fine, 2)
    h += blades * .32; tone = clamp(tone * .72 + blades * .28)
  } else if (profile.kind === 'rut') {
    const track = .5 + .5 * Math.cos(px * Math.PI / 64)
    h = h * .42 - track * .28 + Math.sin(py * .075 + n * 5) * .08
    tone = clamp(tone * .58 + track * .08); rough += (fine - .5) * .12
  } else if (profile.kind === 'packed') {
    h = n * .46 + fine * .09; tone = n * .65 + fine * .18 + .08
  } else if (profile.kind === 'shore') {
    const silt = Math.sin((px + py) * .055 + n * 7) * .06
    h = n * .38 + fine * .18 + silt; tone = clamp(n * .64 + fine * .15)
  } else if (profile.kind === 'wood') {
    const seam = Math.min(py % 64, 64 - py % 64)
    const grain = Math.sin(px * .105 + n * 13 + Math.sin(py * .025) * 2)
    h = n * .22 + grain * .13 - (seam < 2.2 ? .48 : 0)
    tone = clamp(.48 + grain * .18 + n * .32 - (seam < 3 ? .35 : 0))
  } else if (profile.kind === 'wheat') {
    const fiber = Math.pow(.5 + .5 * Math.sin(px * .29 + n * 9), 5)
    h = n * .34 + fiber * .32; tone = clamp(.35 + n * .45 + fiber * .24)
  } else if (profile.kind === 'hedge') {
    const leaf = Math.pow(valueNoise(px, py, 16, profile.seed + 71), 1.7)
    h = n * .28 + leaf * .62; tone = clamp(n * .42 + leaf * .52)
  } else if (profile.kind === 'metal') {
    const brushed = Math.sin(px * .45 + n * 3) * .035
    const rust = valueNoise(px, py, 32, profile.seed + 81)
    h = n * .13 + brushed - (rust > .76 ? (rust - .76) * .9 : 0)
    tone = clamp(.38 + n * .35 - Math.max(0, rust - .67) * .7)
    rough = clamp(profile.rough + Math.max(0, rust - .55) * .55)
  } else if (profile.kind === 'hay') {
    // 高密度横向纤维 + 少量断茬亮点，模拟被压缩后仍可辨认的干草束。
    const fiber = Math.pow(.5 + .5 * Math.sin(py * .56 + n * 18 + Math.sin(px * .075) * 2.7), 7)
    const crossing = Math.pow(.5 + .5 * Math.sin((px + py * .16) * .31 + fine * 9), 12)
    const fleck = Math.max(0, valueNoise(px, py, 8, profile.seed + 93) - .67) * 2.6
    h = n * .24 + fiber * .46 + crossing * .18 + fleck * .2
    tone = clamp(.25 + n * .46 + fiber * .27 + crossing * .12 + fleck * .14)
    rough = clamp(profile.rough + (fine - .5) * .04)
  }
  return { h, tone: clamp(tone), rough: clamp(rough + (fine - .5) * .08) }
}

function writeJpeg(name: string, pixels: Uint8ClampedArray) {
  // 已下载的 ambientCG CC0 通道优先；生成器只补齐缺失文件，不覆盖真实摄影材质。
  const target = resolve(outDir, name)
  if (existsSync(target)) return
  const canvas = createCanvas(N, N), ctx = canvas.getContext('2d')
  const image = ctx.createImageData(N, N); image.data.set(pixels); ctx.putImageData(image, 0, 0)
  writeFileSync(target, canvas.toBuffer('image/jpeg', 92))
}

for (const p of profiles) {
  const heights = new Float32Array(N * N), tones = new Float32Array(N * N), roughness = new Float32Array(N * N)
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const s = sample(p, x, y), i = y * N + x
    heights[i] = s.h; tones[i] = s.tone; roughness[i] = s.rough
  }
  const diff = new Uint8ClampedArray(N * N * 4), normal = new Uint8ClampedArray(N * N * 4), rough = new Uint8ClampedArray(N * N * 4)
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const i = y * N + x, o = i * 4, t = tones[i]
    for (let c = 0; c < 3; c++) diff[o + c] = Math.round(p.dark[c] + (p.light[c] - p.dark[c]) * t)
    diff[o + 3] = 255
    const xm = (x - 1 + N) % N, xp = (x + 1) % N, ym = (y - 1 + N) % N, yp = (y + 1) % N
    const dx = (heights[y * N + xp] - heights[y * N + xm]) * p.normal
    const dy = (heights[yp * N + x] - heights[ym * N + x]) * p.normal
    const iz = 1 / Math.hypot(dx, dy, 1)
    normal[o] = Math.round((-.5 * dx * iz + .5) * 255)
    normal[o + 1] = Math.round((-.5 * dy * iz + .5) * 255)
    normal[o + 2] = Math.round((.5 * iz + .5) * 255); normal[o + 3] = 255
    const rv = Math.round(roughness[i] * 255)
    rough[o] = rough[o + 1] = rough[o + 2] = rv; rough[o + 3] = 255
  }
  writeJpeg(`${p.name}_diff.jpg`, diff)
  writeJpeg(`${p.name}_normal.jpg`, normal)
  writeJpeg(`${p.name}_rough.jpg`, rough)
}

console.log(`Ensured ${profiles.length * 3} L10 PBR map slots in ${dirname(resolve(outDir, 'x'))}`)
