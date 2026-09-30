import fs from 'node:fs/promises'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const dir = path.join(root, 'public', 'textures', 'settlements')
const manifest = JSON.parse(await fs.readFile(path.join(dir, 'manifest.json'), 'utf8'))
const failures = []
const maps = new Map()
for (const entry of manifest.assets ?? []) {
  const file = path.join(dir, entry.file)
  const data = await fs.readFile(file).catch(() => null)
  if (!data) { failures.push(`missing ${entry.file}`); continue }
  if (data.length !== entry.bytes) failures.push(`${entry.file}: bytes ${data.length} != manifest ${entry.bytes}`)
  if (data[0] !== 0xff || data[1] !== 0xd8) failures.push(`${entry.file}: invalid JPEG header`)
  const hash = createHash('sha256').update(data).digest('hex')
  if (hash !== entry.sha256) failures.push(`${entry.file}: SHA256 mismatch`)
  const match = entry.file.match(/^(.+)_(color|normalgl|roughness)\.jpg$/)
  if (match) maps.set(`${match[1]}:${match[2]}`, true)
}
for (const prefix of ['ceiling', 'tiles', 'fabric']) for (const map of ['color', 'normalgl', 'roughness']) if (!maps.has(`${prefix}:${map}`)) failures.push(`missing map ${prefix}_${map}.jpg`)
for (const stem of ['l11_concrete', 'l11_plaster', 'l11_metal', 'l11_wood']) for (const suffix of ['', '_normal', '_roughness']) {
  const file = path.join(root, 'public', 'textures', `${stem}${suffix}.jpg`)
  if (!await fs.stat(file).catch(() => null)) failures.push(`missing reused L11 asset ${path.basename(file)}`)
}
if (failures.length) { console.error(`Settlement asset checks failed (${failures.length}):`); failures.forEach(x => console.error(`- ${x}`)); process.exitCode = 1 }
else console.log(`Settlement assets verified: ${manifest.assets.length} maps + L11 material reuse files.`)
