import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const assets = ['dirty_carpet', 'ceiling_interior', 'white_plaster_02', 'denim_fabric'];
const maps = [
  ['Diffuse', 'Color'],
  ['nor_gl', 'NormalGL'],
  ['Rough', 'Roughness'],
];
const outDir = join(process.cwd(), 'public', 'textures', 'l4');

async function getJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}: ${url}`);
  return response.json();
}

await mkdir(outDir, { recursive: true });
for (const asset of assets) {
  const files = await getJson(`https://api.polyhaven.com/files/${asset}`);
  for (const [apiMap, outputMap] of maps) {
    const variants = files[apiMap]?.['1k'];
    const format = variants?.jpg ? 'jpg' : variants?.png ? 'png' : null;
    if (!format) throw new Error(`Missing 1k jpg/png ${apiMap} map for ${asset}`);
    const source = variants[format];
    const response = await fetch(source.url);
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}: ${source.url}`);
    const data = Buffer.from(await response.arrayBuffer());
    if (data.length === 0) throw new Error(`Empty download: ${source.url}`);
    const path = join(outDir, `${asset}_${outputMap}.${format}`);
    await writeFile(path, data);
    console.log(`${path} (${data.length} bytes)`);
  }
}
