import { createHash } from 'node:crypto'
import { mkdir, readFile, rename, rm } from 'node:fs/promises'
import { createWriteStream } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import https from 'node:https'

const appDir = fileURLToPath(new URL('..', import.meta.url))
const outDir = path.join(appDir, 'public/textures/l1/polyhaven')
const channels = ['leaves_diff', 'leaves_alpha', 'leaves_nor_gl', 'leaves_rough']
const files = { leaves_diff: 'leaves_diff.jpg', leaves_alpha: 'leaves_alpha.jpg', leaves_nor_gl: 'leaves_nor_gl.jpg', leaves_rough: 'leaves_rough.jpg' }
const sources = {
  leaves_diff: ['https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/potted_plant_02/potted_plant_02_leaves_diff_1k.jpg', 'e8a026bd7bfa6497729d855c59da03ce'],
  leaves_alpha: ['https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/potted_plant_02/potted_plant_02_leaves_alpha_1k.jpg', 'f7a94b00b6094b55c59712c2145c6c97'],
  leaves_nor_gl: ['https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/potted_plant_02/potted_plant_02_leaves_nor_gl_1k.jpg', '2420d5c0ab87426f5318a5e91d1ea3bb'],
  leaves_rough: ['https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/potted_plant_02/potted_plant_02_leaves_rough_1k.jpg', 'ba934a78cc6496d934c014eb8a33af37'],
}

function download(url, target) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) return download(new URL(res.headers.location, url).href, target).then(resolve, reject)
      if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode} for ${url}`))
      const out = createWriteStream(target, { flags: 'wx' })
      res.pipe(out); out.on('finish', () => out.close(resolve)); out.on('error', reject)
    })
    req.on('error', reject)
  })
}
await mkdir(outDir, { recursive: true })
for (const channel of channels) {
  const [url, expected] = sources[channel]
  const target = path.join(outDir, files[channel])
  try { const hash = createHash('md5').update(await readFile(target)).digest('hex'); if (hash === expected) { console.log(`${channel}: already present and verified`); continue }; throw new Error(`Existing file MD5 mismatch for ${channel}: expected ${expected}, got ${hash}`) } catch (e) { if (e.code !== 'ENOENT') throw e }
  const temp = `${target}.download-${process.pid}`
  try {
    await download(url, temp)
    const hash = createHash('md5').update(await readFile(temp)).digest('hex')
    if (hash !== expected) throw new Error(`MD5 mismatch for ${channel}: expected ${expected}, got ${hash}`)
    await rename(temp, target)
    console.log(`${channel}: ${target}`)
  } catch (e) { await rm(temp, { force: true }); throw e }
}
