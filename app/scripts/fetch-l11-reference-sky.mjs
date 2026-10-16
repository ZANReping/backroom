import { createHash } from 'node:crypto'
import { mkdir, writeFile, readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(fileURLToPath(new URL('../', import.meta.url)))
const asset = 'kloofendal_48d_partly_cloudy_puresky'
const infoUrl = `https://api.polyhaven.com/info/${asset}`
const filesUrl = `https://api.polyhaven.com/files/${asset}`
const sourceDir = path.join(root, 'assets/l11-reference-sky')
const outputDir = path.join(root, 'public/textures/l11-sky')
await mkdir(sourceDir, { recursive: true })
await mkdir(outputDir, { recursive: true })

const getJson = async url => {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}: ${url}`)
  return response.json()
}
const info = await getJson(infoUrl)
const files = await getJson(filesUrl)
await writeFile(path.join(sourceDir, 'info.json'), JSON.stringify(info, null, 2) + '\n')
await writeFile(path.join(sourceDir, 'files.json'), JSON.stringify(files, null, 2) + '\n')

const downloads = [
  { size: '2k', output: 'sky-2k.hdr', metadata: files.hdri['2k'].hdr },
  { size: '4k', output: 'sky-4k.hdr', metadata: files.hdri['4k'].hdr },
]
const sha256 = data => createHash('sha256').update(data).digest('hex')
const md5 = data => createHash('md5').update(data).digest('hex')
const verified = []
for (const item of downloads) {
  const response = await fetch(item.metadata.url)
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}: ${item.metadata.url}`)
  const data = Buffer.from(await response.arrayBuffer())
  const actualMd5 = md5(data)
  if (actualMd5 !== item.metadata.md5) throw new Error(`${item.output}: MD5 ${actualMd5} != ${item.metadata.md5}`)
  await writeFile(path.join(outputDir, item.output), data)
  verified.push({ size: item.size, localPath: `app/public/textures/l11-sky/${item.output}`, sourceUrl: item.metadata.url, expectedMd5: item.metadata.md5, actualMd5, bytes: data.length, sha256: sha256(data), unchangedBytes: true })
  console.log(`Downloaded and verified ${item.output}: ${data.length} bytes, MD5 ${actualMd5}`)
}
const manifest = { asset, officialAssetUrl: `https://polyhaven.com/a/${asset}`, metadata: { infoUrl, filesUrl }, authors: info.authors, license: 'CC0 1.0 Universal', licenseUrl: 'https://polyhaven.com/license', modifications: 'Unchanged bytes; no image processing.', pbr: 'HDR radiance environment maps require no PBR normal or roughness maps.', files: verified }
await writeFile(path.join(sourceDir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n')
console.log(`Wrote ${path.join(sourceDir, 'manifest.json')}`)
