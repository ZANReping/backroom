import {readFileSync, existsSync, mkdirSync, writeFileSync} from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {createCanvas, loadImage} from '@napi-rs/canvas'

const app = fileURLToPath(new URL('../', import.meta.url))
const reportDir = path.join(app, 'reports', 'level-entry')
const finalDir = path.join(reportDir, 'final'), baselineDir = path.join(reportDir, 'baseline')
const runtime = JSON.parse(readFileSync(path.join(finalDir, 'runtime.json'), 'utf8'))
const baseline = JSON.parse(readFileSync(path.join(baselineDir, 'runtime.json'), 'utf8'))
const missing = []
const load = async file => { if (!existsSync(file)) { missing.push(file); return null } return loadImage(file) }
const fit = (ctx, image, x, y, w, h) => { if (!image) return; const scale = Math.min(w / image.width, h / image.height); const dw = image.width * scale, dh = image.height * scale; ctx.drawImage(image, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh) }
const text = (ctx, value, x, y, size = 22, color = '#f4f1e8') => { ctx.fillStyle = color; ctx.font = `${size}px Arial`; ctx.fillText(String(value), x, y) }
const background = (ctx, width, height) => { ctx.fillStyle = '#11151a'; ctx.fillRect(0, 0, width, height) }
const card = async (ctx, item, dir, x, y, w, h) => {
  ctx.fillStyle = '#1b222a'; ctx.fillRect(x, y, w, h)
  const image = await load(path.join(dir, `${item.id}-entry.png`))
  fit(ctx, image, x + 12, y + 40, w - 24, h - 52)
  text(ctx, `${item.id} · ${item.cold?.name ?? `Level ${item.id}`} · loadMs ${item.cold?.loadMs ?? '未测'}`, x + 14, y + 28, 18)
}

mkdirSync(reportDir, {recursive: true})
const cases = [...(runtime.cases ?? [])].sort((a, b) => Number(a.id) - Number(b.id))
for (let page = 0; page < Math.min(3, Math.ceil(cases.length / 10)); page++) {
  const canvas = createCanvas(1600, 1600), ctx = canvas.getContext('2d'); background(ctx, 1600, 1600)
  text(ctx, `Level entry contact sheet ${page + 1} · final`, 32, 42, 28)
  for (let i = 0; i < 10; i++) { const item = cases[page * 10 + i]; if (!item) break; await card(ctx, item, finalDir, (i % 2) * 800 + 20, 62 + Math.floor(i / 2) * 300, 760, 280) }
  writeFileSync(path.join(reportDir, `contact-sheet-${page + 1}.jpg`), canvas.toBuffer('image/jpeg', 0.9))
}

const keyIds = [0, 1, 5, 7, 11], canvas = createCanvas(1600, 1560), ctx = canvas.getContext('2d'); background(ctx, 1600, 1560)
text(ctx, 'Level entry before / after · same capture view', 32, 42, 28)
for (let i = 0; i < keyIds.length; i++) {
  const id = keyIds[i], item = cases.find(entry => Number(entry.id) === id) ?? {id}, beforeItem = baseline.cases?.find(entry => Number(entry.id) === id) ?? {id}
  await card(ctx, beforeItem, baselineDir, 20, 62 + i * 300, 760, 280)
  await card(ctx, item, finalDir, 820, 62 + i * 300, 760, 280)
}
writeFileSync(path.join(reportDir, 'before-after.jpg'), canvas.toBuffer('image/jpeg', 0.9))
console.log(JSON.stringify({pages: Math.min(3, Math.ceil(cases.length / 10)), beforeAfter: 'before-after.jpg', missing}))
