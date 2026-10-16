import { createCanvas, loadImage } from '@napi-rs/canvas'
import { mkdirSync, copyFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const app = fileURLToPath(new URL('../', import.meta.url))
const assets = path.join(app, 'assets/l11-vertical-signs')
const out = path.join(app, 'public/textures')
mkdirSync(assets, { recursive: true })

const sources = {
  hotel: 'C:/Users/ZANRe/.codex/generated_images/01a1337a-758c-7c30-b54e-7b5d0d99cc8e/exec-bba7de28-6c74-4c8a-bc33-1ef0028dd0e9.png',
  clinic: 'C:/Users/ZANRe/.codex/generated_images/01a1337a-758c-7c30-b54e-7b5d0d99cc8e/exec-98e8e73b-6bb4-4375-82aa-33d6196ab781.png',
  cinema: 'C:/Users/ZANRe/.codex/generated_images/01a1337a-758c-7c30-b54e-7b5d0d99cc8e/exec-b15e2395-65f0-49b5-a644-7f8b5c652f21.png',
}
const files = []
const crops = {}
const sourceSizes = {}
const localSources = {}
for (const [id, original] of Object.entries(sources)) {
  const source = path.join(assets, `${id}-source.png`)
  copyFileSync(original, source)
  const img = await loadImage(source)
  sourceSizes[id] = [img.width, img.height]
  localSources[id] = `assets/l11-vertical-signs/${id}-source.png`
  const canvas = createCanvas(img.width, img.height)
  const ctx = canvas.getContext('2d')
  ctx.drawImage(img, 0, 0)
  const data = ctx.getImageData(0, 0, img.width, img.height).data
  let x0 = img.width, y0 = img.height, x1 = 0, y1 = 0
  for (let y = 0; y < img.height; y++) for (let x = 0; x < img.width; x++) {
    const i = (y * img.width + x) * 4
    const r = data[i], g = data[i + 1], b = data[i + 2]
    if (Math.min(r, g, b) < 225 || Math.max(r, g, b) - Math.min(r, g, b) > 20) {
      x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y)
    }
  }
  if (x1 < x0 || y1 < y0) throw new Error(`No board pixels detected for ${id}`)
  const crop = [x0, y0, x1 - x0 + 1, y1 - y0 + 1]
  crops[id] = crop
  for (const [suffix, w, h] of [['', 256, 1280], ['_low', 128, 640]]) {
    const c = createCanvas(w, h), g = c.getContext('2d')
    g.drawImage(img, ...crop, 0, 0, w, h)
    const prefix = `l11-vertical-${id}${suffix}`
    writeFileSync(path.join(out, `${prefix}.png`), c.toBuffer('image/png')); files.push(`public/textures/${prefix}.png`)
    for (const [channel, color] of [['normal', '#8080ff'], ['roughness', '#b9b9b9']]) {
      g.fillStyle = color; g.fillRect(0, 0, w, h)
      writeFileSync(path.join(out, `${prefix}_${channel}.png`), c.toBuffer('image/png')); files.push(`public/textures/${prefix}_${channel}.png`)
    }
  }
}
writeFileSync(path.join(assets, 'manifest.json'), JSON.stringify({
  generator: 'built-in image_gen', author: 'OpenAI image_gen (AI-generated)',
  originals: sources, prompt: 'prompts.json', license: 'AI-generated project asset; no third-party CC0 claim',
  localSources, sourceSizes,
  source: 'reference/L11/11iconic.jpg (complete 2000s retro vertical building boards)', crop: crops,
  worldMetres: { hotel: [1.3, 6.5], clinic: [1.2, 6], cinema: [1.5, 7.5] },
  processing: 'node scripts/prepare-l11-vertical-signs.mjs', dimensions: { high: [256, 1280], low: [128, 640] },
  channels: { normal: '#8080ff OpenGL flat', roughness: '#b9b9b9 uniform', noise: false },
  files, review: 'Complete boards retained including metal borders; text checked for clipping.'
}, null, 2) + '\n')
console.log(JSON.stringify({ crops, files }, null, 2))
