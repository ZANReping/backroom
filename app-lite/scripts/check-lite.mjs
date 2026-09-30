import { createHash } from 'node:crypto';
import { lstat, readdir, readFile } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const dist = join(root, 'dist');
const publicDir = join(root, 'public');
const budget = 50_000_000;

async function filesUnder(dir) {
  const out = [];
  async function visit(current) {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const path = join(current, entry.name);
      const info = await lstat(path);
      if (info.isSymbolicLink()) throw new Error(`Symbolic link is not allowed: ${path}`);
      if (info.isDirectory()) await visit(path);
      else if (info.isFile()) out.push(path);
    }
  }
  await visit(dir);
  return out;
}

async function sha256(path) {
  return createHash('sha256').update(await readFile(path)).digest('hex');
}

const errors = [];
let total = 0;
try {
  const distInfo = await lstat(dist);
  if (!distInfo.isDirectory() || distInfo.isSymbolicLink()) throw new Error('dist must be a real directory');
  const distFiles = await filesUnder(dist);
  for (const path of distFiles) {
    if (/\.(?:mid|mp3)$/i.test(path)) errors.push(`forbidden external music asset: dist/${relative(dist, path).replaceAll('\\', '/')}`);
  }
  for (const path of distFiles) total += (await lstat(path)).size;
  if (!distFiles.some((path) => relative(dist, path).replaceAll('\\', '/') === 'index.html')) errors.push('dist/index.html is missing');
  const publicFiles = await filesUnder(publicDir);
  for (const path of publicFiles) {
    if (/\.(?:mid|mp3)$/i.test(path)) errors.push(`forbidden external music asset: public/${relative(publicDir, path).replaceAll('\\', '/')}`);
  }
  for (const source of publicFiles) {
    const rel = relative(publicDir, source);
    const target = join(dist, rel);
    try {
      const targetInfo = await lstat(target);
      if (!targetInfo.isFile() || targetInfo.isSymbolicLink()) throw new Error('missing regular file');
      if (await sha256(source) !== await sha256(target)) throw new Error('SHA256 mismatch');
    } catch (error) { errors.push(`public/${rel.replaceAll('\\', '/')} -> dist/${rel.replaceAll('\\', '/')}: ${error.message}`); }
  }
} catch (error) { errors.push(error.message); }

const remaining = budget - total;
console.log(`total bytes: ${total}`);
console.log(`total MB: ${(total / 1_000_000).toFixed(3)}`);
console.log(`remaining bytes: ${remaining}`);
if (errors.length) { for (const error of errors) console.error(`ERROR: ${error}`); process.exitCode = 1; }
else if (total > budget) { console.error(`ERROR: dist exceeds ${budget} bytes`); process.exitCode = 1; }
else console.log('lite package check: PASS');
