import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createCanvas, loadImage } from '@napi-rs/canvas'

const appRoot = path.resolve(fileURLToPath(new URL('..', import.meta.url)))
const inputRoot = path.join(appRoot, 'assets', 'l11-signage')
const publicRoot = path.join(appRoot, 'public', 'textures')
const manifestPath = path.join(inputRoot, 'source-manifest.json')

const fail = message => { throw new Error(`[L11 signage] ${message}`) }
const imageData = (image, width, height) => { const c = createCanvas(width, height); const ctx = c.getContext('2d'); ctx.drawImage(image, 0, 0, width, height); return ctx.getImageData(0, 0, width, height) }
const alphaAt = (data, x, y) => data.data[(y * data.width + x) * 4 + 3]

function detectBands(data) {
  const dense = []
  for (let y = 0; y < data.height; y++) { let count = 0; for (let x = 0; x < data.width; x++) if (alphaAt(data, x, y) >= 224) count++; if (count / data.width > .55) dense.push(y) }
  const bands = []
  for (const y of dense) { const last = bands.at(-1); if (!last || y > last[1] + 3) bands.push([y, y]); else last[1] = y }
  if (bands.length !== 4) fail(`expected exactly four dense sign bands, found ${bands.length}`)
  for (const band of bands) {
    if (band[1] - band[0] < Math.max(4, data.height * .03)) fail(`sign band ${band[0]}-${band[1]} is too short`)
    const y0 = Math.floor(band[0] + (band[1] - band[0]) * .2), y1 = Math.ceil(band[1] - (band[1] - band[0]) * .2)
    let minX = data.width, maxX = -1
    const rowCount = y1 - y0 + 1, supported = []
    for (let x = 0; x < data.width; x++) { let support = 0; for (let y = y0; y <= y1; y++) if (alphaAt(data, x, y) >= 224) support++; if (support / rowCount >= .75) supported.push(x) }
    if (supported.length) { minX = supported[0]; maxX = supported.at(-1) }
    if (maxX < minX || maxX - minX < data.width * .1) fail(`sign band ${band[0]}-${band[1]} has no reasonable panel bounds`)
    band.push(minX, maxX)
  }
  return bands
}

function drawExtruded(ctx, source, sx, sy, sw, sh, dx, dy, dw, dh, inset) {
  ctx.drawImage(source, sx, sy, sw, sh, dx, dy, dw, dh)
  ctx.drawImage(source, sx, sy, sw, 1, dx, dy - inset, dw, inset)
  ctx.drawImage(source, sx, sy + sh - 1, sw, 1, dx, dy + dh, dw, inset)
  ctx.drawImage(source, sx, sy, 1, sh, dx - inset, dy, inset, dh)
  ctx.drawImage(source, sx + sw - 1, sy, 1, sh, dx + dw, dy, inset, dh)
  ctx.drawImage(source, sx, sy, 1, 1, dx - inset, dy - inset, inset, inset)
  ctx.drawImage(source, sx + sw - 1, sy, 1, 1, dx + dw, dy - inset, inset, inset)
  ctx.drawImage(source, sx, sy + sh - 1, 1, 1, dx - inset, dy + dh, inset, inset)
  ctx.drawImage(source, sx + sw - 1, sy + sh - 1, 1, 1, dx + dw, dy + dh, inset, inset)
}

async function main() {
  let manifest
  try { manifest = JSON.parse(await readFile(manifestPath, 'utf8')) } catch (error) { fail(`cannot read ${manifestPath}: ${error.message}`) }
  if (!Array.isArray(manifest) || manifest.length !== 8) fail('source-manifest.json must contain exactly eight source entries')
  const faces = [], seen = new Set(), signIds = new Set()
  for (const entry of manifest) {
    if (!entry || typeof entry.id !== 'string' || typeof entry.source !== 'string' || !Array.isArray(entry.signs) || entry.signs.length !== 4) fail('each source entry requires id, source and exactly four signs')
    if (seen.has(entry.id)) fail(`duplicate source id ${entry.id}`); seen.add(entry.id)
    const sourcePath = path.resolve(inputRoot, entry.source)
    if (!sourcePath.startsWith(inputRoot + path.sep)) fail(`source escapes signage directory: ${entry.source}`)
    let image; try { image = await loadImage(sourcePath) } catch (error) { fail(`cannot load ${entry.source}: ${error.message}`) }
    const pixels = imageData(image, image.width, image.height), bands = detectBands(pixels)
    for (let i = 0; i < 4; i++) { const [y0, y1, x0, x1] = bands[i]; const sign = entry.signs[i]; if (!sign || typeof sign.id !== 'string' || typeof sign.text !== 'string') fail(`invalid sign metadata in ${entry.id} row ${i}`); if (signIds.has(sign.id)) fail(`duplicate sign id ${sign.id}`); signIds.add(sign.id); faces.push({ id: sign.id, text: sign.text, source: entry.source, image, crop: [x0, y0, x1 - x0 + 1, y1 - y0 + 1] }) }
  }
  if (faces.length !== 32) fail(`expected 32 faces, found ${faces.length}`)
  await mkdir(publicRoot, { recursive: true })
  const atlas = (width, height, cellW, cellH, inset, color, name) => { const canvas = createCanvas(width, height), ctx = canvas.getContext('2d'); ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high'; ctx.fillStyle = color; ctx.fillRect(0, 0, width, height); return { canvas, ctx, width, height, cellW, cellH, inset, name } }
  const color = atlas(4096, 2048, 1024, 256, 8, 'rgba(0,0,0,0)', 'l11_signs.png'), normal = atlas(4096, 2048, 1024, 256, 8, 'rgb(128,128,255)', 'l11_signs_normal.png'), rough = atlas(4096, 2048, 1024, 256, 8, 'rgb(185,185,185)', 'l11_signs_roughness.png')
  const low = atlas(2048, 1024, 512, 128, 4, 'rgba(0,0,0,0)', 'l11_signs_low.png'), lowNormal = atlas(2048, 1024, 512, 128, 4, 'rgb(128,128,255)', 'l11_signs_normal_low.png'), lowRough = atlas(2048, 1024, 512, 128, 4, 'rgb(185,185,185)', 'l11_signs_roughness_low.png')
  const outputFaces = []
  for (let i = 0; i < faces.length; i++) { const f = faces[i], col = i % 4, row = Math.floor(i / 4), [sx, sy, sw, sh] = f.crop; const x = col * color.cellW + color.inset, y = row * color.cellH + color.inset, dw = color.cellW - color.inset * 2, dh = color.cellH - color.inset * 2; drawExtruded(color.ctx, f.image, sx, sy, sw, sh, x, y, dw, dh, color.inset); const lx = col * low.cellW + low.inset, ly = row * low.cellH + low.inset, ldw = low.cellW - low.inset * 2, ldh = low.cellH - low.inset * 2; drawExtruded(low.ctx, f.image, sx, sy, sw, sh, lx, ly, ldw, ldh, low.inset); const uv = [x / color.width, 1 - (y + dh) / color.height, (x + dw) / color.width, 1 - y / color.height]; outputFaces.push({ id: f.id, text: f.text, source: f.source, crop: f.crop, uv }) }
  const png = canvas => canvas.toBuffer('image/png')
  for (const [a, file] of [[color, 'l11_signs.png'], [normal, 'l11_signs_normal.png'], [rough, 'l11_signs_roughness.png'], [low, 'l11_signs_low.png'], [lowNormal, 'l11_signs_normal_low.png'], [lowRough, 'l11_signs_roughness_low.png']]) await writeFile(path.join(publicRoot, file), png(a.canvas))
  const output = { version: 1, atlas: { width: 4096, height: 2048, lowWidth: 2048, lowHeight: 1024, columns: 4, rows: 8, inset: 8, lowInset: 4, uvOrigin: 'bottom-left' }, faces: outputFaces }
  await writeFile(path.join(inputRoot, 'atlas-manifest.json'), JSON.stringify(output, null, 2)); const contentPath = path.join(appRoot, 'src', 'game', 'content', 'l11SignAtlas.json'); await mkdir(path.dirname(contentPath), { recursive: true }); await writeFile(contentPath, JSON.stringify(output, null, 2) + '\n')
}
main().catch(error => { console.error(error.stack || error); process.exitCode = 1 })
