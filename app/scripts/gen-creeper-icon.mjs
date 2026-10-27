// Reproducible 32px pixel-art source, enlarged 4x with nearest-neighbour sampling.
import { createCanvas, loadImage } from '@napi-rs/canvas'
import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const outDir = fileURLToPath(new URL('../public/textures/icons/pixel/', import.meta.url))
const outPath = `${outDir}item_creepmeat.png`
mkdirSync(outDir, { recursive: true })

const source = createCanvas(32, 32)
const g = source.getContext('2d')
g.clearRect(0, 0, 32, 32)
g.imageSmoothingEnabled = false

// Dark outline and a thin, crooked strip of dark red-brown meat.
g.fillStyle = '#38241f'
g.fillRect(6, 13, 22, 8)
g.fillRect(8, 11, 17, 12)
g.fillStyle = '#6e3028'
g.fillRect(8, 13, 18, 8)
g.fillStyle = '#8f4434'
g.fillRect(10, 14, 15, 3)
g.fillRect(9, 18, 17, 2)
g.fillStyle = '#bd6950'
g.fillRect(11, 14, 6, 1)
g.fillRect(19, 15, 4, 1)
g.fillStyle = '#4b2924'
g.fillRect(7, 20, 19, 2)
g.fillRect(24, 12, 3, 2)

// Pale bone at the left end, with a small highlight.
g.fillStyle = '#4b3028'
g.fillRect(4, 13, 7, 9)
g.fillStyle = '#c8b99a'
g.fillRect(5, 14, 5, 7)
g.fillRect(4, 16, 2, 3)
g.fillStyle = '#eee2c1'
g.fillRect(6, 14, 3, 2)
g.fillStyle = '#927b63'
g.fillRect(5, 20, 4, 1)

// Sparse 2–4px clumps of off-white/grey-white fuzz and bright pinpoints.
const tufts = [[13, 12, 2, 2], [17, 19, 3, 2], [21, 12, 2, 3], [24, 18, 3, 2], [15, 15, 2, 2]]
for (const [x, y, w, h] of tufts) {
  g.fillStyle = '#d8d5bf'; g.fillRect(x, y, w, h)
  g.fillStyle = '#f2edd8'; g.fillRect(x + 1, y, 1, 1)
  g.fillStyle = '#a6aaa0'; if (w > 2) g.fillRect(x + w - 1, y + h - 1, 1, 1)
}
g.fillStyle = '#fff7dd'
for (const [x, y] of [[12, 13], [18, 18], [23, 13], [26, 17]]) g.fillRect(x, y, 1, 1)

const big = createCanvas(128, 128)
const b = big.getContext('2d')
b.imageSmoothingEnabled = false
b.drawImage(source, 0, 0, 128, 128)
writeFileSync(outPath, big.toBuffer('image/png'))

const image = await loadImage(readFileSync(outPath))
const pixels = big.getContext('2d').getImageData(0, 0, 128, 128).data
let transparent = 0
for (let i = 3; i < pixels.length; i += 4) if (pixels[i] === 0) transparent++
if (image.width !== 128 || image.height !== 128 || transparent === 0) throw new Error('icon validation failed')
console.log(`Wrote ${outPath} (${statSync(outPath).size} bytes, 128x128, transparent pixels: ${transparent})`)
