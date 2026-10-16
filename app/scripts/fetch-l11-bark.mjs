import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import https from 'node:https';
import { fileURLToPath } from 'node:url';

const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const sourceMetadata = path.join(root, 'assets', 'l11-foliage', 'files.json');
const assetRoot = path.join(root, 'assets', 'l11-bark');
const publicRoot = path.join(root, 'public', 'textures', 'l11-bark');

const metadata=JSON.parse(await fs.readFile(sourceMetadata,'utf8'));
const jobs=['1k','2k'].flatMap(size=>[['color','branch_diff'],['normal','branch_nor_gl'],['roughness','branch_rough']].map(([kind,key])=>[size,kind,key]));

function download(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'backroom-l11-asset-fetch/1.0' } }, response => {
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        response.resume();
        download(new URL(response.headers.location, url).href).then(resolve, reject);
        return;
      }
      if (response.statusCode !== 200) {
        response.resume();
        reject(new Error(`HTTP ${response.statusCode} for ${url}`));
        return;
      }
      const chunks = [];
      response.on('data', chunk => chunks.push(chunk));
      response.on('end', () => resolve(Buffer.concat(chunks)));
      response.on('error', reject);
    }).on('error', reject);
  });
}

function md5(buffer) { return crypto.createHash('md5').update(buffer).digest('hex'); }

function jpegSize(buffer) {
  if (buffer[0] !== 0xff || buffer[1] !== 0xd8) throw new Error('not a JPEG');
  let offset = 2;
  while (offset + 9 < buffer.length) {
    if (buffer[offset] !== 0xff) { offset++; continue; }
    const marker = buffer[offset + 1];
    offset += 2;
    if (marker === 0xd8 || marker === 0xd9) continue;
    const length = buffer.readUInt16BE(offset);
    if (marker >= 0xc0 && marker <= 0xc3) {
      return { width: buffer.readUInt16BE(offset + 5), height: buffer.readUInt16BE(offset + 3) };
    }
    offset += length;
  }
  throw new Error('JPEG dimensions not found');
}

await fs.mkdir(assetRoot, { recursive: true });
const manifest = {
  asset: 'tree_small_02 branch bark maps',
  officialAssetUrl: 'https://polyhaven.com/a/tree_small_02',
  author: 'Rico Cilliers',
  license: 'CC0 1.0 Universal',
  licenseUrl: 'https://polyhaven.com/license',
  metadata: {filesUrl:'https://api.polyhaven.com/files/tree_small_02',localPath:'app/assets/l11-foliage/files.json'},
  normalConvention: 'OpenGL (nor_gl)',
  processing: 'Original JPEG bytes copied without generation, repainting, noise, or image processing.',
  files: [],
};

for (const [size, kind, key] of jobs) {
  const source = metadata[key]?.[size]?.jpg;
  if(!source?.url)throw new Error(`Missing ${key}/${size}/jpg metadata`);
  const filename=path.basename(new URL(source.url).pathname),originalPath=path.join(assetRoot,size,filename);
  let bytes;
  try{bytes=await fs.readFile(originalPath);if(bytes.length!==source.size||md5(bytes)!==source.md5)throw new Error('stale cached asset')}
  catch{bytes=await download(source.url)}
  const actualMd5 = md5(bytes);
  if (bytes.length !== source.size || actualMd5 !== source.md5) {
    throw new Error(`${filename}: expected ${source.size}/${source.md5}, got ${bytes.length}/${actualMd5}`);
  }
  const dimensions = jpegSize(bytes);
  if(dimensions.width!==Number(size[0])*1024||dimensions.height!==Number(size[0])*1024)throw new Error(`${filename}: unexpected dimensions`);
  const outputPath = path.join(publicRoot, size, `${kind}.jpg`);
  await fs.mkdir(path.dirname(originalPath), { recursive: true });
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(originalPath, bytes);
  await fs.writeFile(outputPath, bytes);
  manifest.files.push({ size, kind, sourceKey:key,sourceUrl: source.url, expectedMd5: source.md5, actualMd5, bytes: bytes.length, width: dimensions.width, height: dimensions.height, originalPath: 'app/'+path.relative(root, originalPath).replaceAll('\\', '/'), runtimePath: 'app/'+path.relative(root, outputPath).replaceAll('\\', '/') });
  console.log(`${size} ${kind}: ${dimensions.width}x${dimensions.height} ${actualMd5}`);
}

await fs.writeFile(path.join(assetRoot, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Wrote ${manifest.files.length} verified bark maps and manifest.`);
