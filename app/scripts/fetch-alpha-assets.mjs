import fs from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const outDir = path.join(root, 'public', 'textures', 'alpha')
const cacheDir = path.join(root, '.cache', 'alpha-assets')
const assets = [
  { id: 'Wood051', prefix: 'wood' },
  { id: 'Plaster004', prefix: 'plaster' },
  { id: 'Terrazzo001', prefix: 'terrazzo' },
  { id: 'Metal012', prefix: 'steel' },
  { id: 'Cardboard004', prefix: 'cardboard' },
  { id: 'Concrete034', prefix: 'concrete' },
  { id: 'Rock035', prefix: 'cave_rock' },
]

await fs.mkdir(outDir, { recursive: true })
await fs.mkdir(cacheDir, { recursive: true })
const manifest = []
for (const asset of assets) {
  const apiUrl = `https://ambientcg.com/api/v2/full_json?id=${asset.id}&include=downloadData`
  const api = await (await fetch(apiUrl)).json()
  const found = api.foundAssets?.[0]
  const dl = found?.downloadFolders?.default?.downloadFiletypeCategories?.zip?.downloads?.find(x => x.attribute === '1K-JPG')
  if (!dl?.fullDownloadPath) throw new Error(`No 1K-JPG download for ${asset.id}`)
  const zip = path.join(cacheDir, dl.fileName)
  const extract = path.join(cacheDir, asset.id)
  if (!(await fs.stat(zip).catch(() => null))) await fs.writeFile(zip, Buffer.from(await (await fetch(dl.fullDownloadPath)).arrayBuffer()))
  if (path.dirname(path.resolve(extract)) !== path.resolve(cacheDir)) throw new Error('Extraction target outside asset cache')
  await fs.mkdir(extract, { recursive: true })
  execFileSync('tar', ['-xf', zip, '-C', extract], { stdio: 'ignore' })
  for (const map of ['Color', 'NormalGL', 'Roughness']) {
    const files = await fs.readdir(extract, { recursive: true })
    const src = files.find(f => f.toLowerCase().endsWith(`_${map.toLowerCase()}.jpg`))
    if (!src) throw new Error(`Missing ${map} map in ${asset.id}`)
    const target = path.join(outDir, `${asset.prefix}_${map.toLowerCase()}.jpg`)
    await fs.copyFile(path.join(extract, src), target)
    const data = await fs.readFile(target)
    if (data[0] !== 0xff || data[1] !== 0xd8) throw new Error(`Invalid JPEG signature: ${target}`)
    manifest.push({ file: path.basename(target), sourceFile: src, assetId: asset.id, apiUrl, url: dl.fullDownloadPath, license: 'CC0', retrieved: new Date().toISOString().slice(0, 10), bytes: data.length, sha256: createHash('sha256').update(data).digest('hex') })
  }
}
await fs.writeFile(path.join(outDir, 'manifest.json'), JSON.stringify({ licenseUrl: 'https://docs.ambientcg.com/license/', assets: manifest }, null, 2) + '\n')
await fs.writeFile(path.join(outDir, 'SOURCES.md'), '# Alpha base material sources\n\nAll published maps are 1K JPG files from ambientCG and are released under CC0.\n\n| File | Asset | License | API | Download | Bytes | SHA-256 |\n|---|---|---|---|---|---:|---|\n' + manifest.map(x => `| ${x.file} | ${x.assetId} (${x.sourceFile}) | CC0 | [metadata](${x.apiUrl}) | [download](${x.url}) | ${x.bytes} | \`${x.sha256}\` |`).join('\n') + '\n\nLicense: [ambientCG terms](https://docs.ambientcg.com/license/)\n')
console.log(`Fetched ${manifest.length} alpha maps.`)
