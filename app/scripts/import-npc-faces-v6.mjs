#!/usr/bin/env node
/**
 * Import the user-provided NPC face v6 overlay.
 *
 * This script is intentionally opt-in: importing requires running this file.
 * It never executes files from the staging tree; it only reads PNG/WEBP files
 * and JSON, then copies the allow-listed assets into app/public and app/art-source.
 */
import { mkdir, readFile, writeFile, readdir, lstat, copyFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import process from 'node:process';

const appRoot = path.resolve(import.meta.dirname, '..');
const defaultStaging = path.resolve(appRoot, '.cache/npc-faces-v6-import/overlay/app');
const knownZipSha256 = '5dc39f09d1820e5c7fd04a2ba0b79faa76f07d78771bbcce9457afae891b860d';
const zipPath = 'C:/Users/ZANRe/Downloads/backroom-npc-faces-v6.zip';
const manifestRel = 'art-source/npc-retro/manifest.json';
const allowedRoots = ['public/textures/npc-retro/named', 'public/textures/npc-retro/pool', 'art-source/npc-retro/named'];

const staging = path.resolve(process.argv[2] || defaultStaging);
const normalize = (p) => path.resolve(p);
const inside = (root, target) => {
  const r = normalize(root) + path.sep;
  return normalize(target) === normalize(root) || normalize(target).startsWith(r);
};
const rel = (p) => path.relative(appRoot, p).replaceAll(path.sep, '/');
const fail = (message) => { throw new Error(message); };

async function ensureRegular(file, expectedExt) {
  const stat = await lstat(file);
  if (!stat.isFile()) fail(`拒绝非普通文件或符号链接: ${file}`);
  if (path.extname(file).toLowerCase() !== expectedExt) fail(`扩展名不匹配: ${file}`);
}

async function ensureNoSymlinks(file) {
  if (!inside(appRoot, file)) fail(`路径越界: ${file}`);
  let current = appRoot;
  for (const segment of path.relative(appRoot, file).split(path.sep)) {
    if (!segment) continue;
    current = path.join(current, segment);
    try { if ((await lstat(current)).isSymbolicLink()) fail(`拒绝符号链接: ${current}`); }
    catch (error) { if (error.code === 'ENOENT') break; throw error; }
  }
}

async function sha256(file) {
  const hash = createHash('sha256');
  hash.update(await readFile(file));
  return hash.digest('hex');
}

async function listFiles(root, ext) {
  const out = [];
  async function walk(dir) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name);
      if (entry.isSymbolicLink()) fail(`拒绝符号链接: ${file}`);
      if (entry.isDirectory()) await walk(file);
      else if (entry.isFile()) {
        if (path.extname(entry.name).toLowerCase() !== ext) fail(`源目录含不匹配扩展名文件: ${file}`);
        out.push(file);
      } else fail(`拒绝特殊文件: ${file}`);
    }
  }
  await walk(root);
  return out.sort();
}

async function main() {
  if (!inside(appRoot, staging)) fail(`staging 必须位于 app 内: ${staging}`);
  const sourceManifestPath = path.join(staging, manifestRel);
  const targetManifestPath = path.join(appRoot, manifestRel);
  await ensureNoSymlinks(sourceManifestPath);
  await ensureNoSymlinks(targetManifestPath);
  await ensureRegular(sourceManifestPath, '.json');
  const sourceManifest = JSON.parse(await readFile(sourceManifestPath, 'utf8'));
  if (!sourceManifest || typeof sourceManifest.named !== 'object' || Array.isArray(sourceManifest.named)) {
    fail('源 manifest 缺少对象字段 named');
  }

  const files = [];
  for (const [sourceRel, ext] of [
    ['public/textures/npc-retro/named', '.png'],
    ['public/textures/npc-retro/pool', '.png'],
    ['art-source/npc-retro/named', '.webp'],
  ]) {
    const dir = path.join(staging, sourceRel);
    await ensureNoSymlinks(dir);
    const entries = await listFiles(dir, ext);
    for (const source of entries) {
      const relative = path.relative(staging, source);
      const target = path.join(appRoot, relative);
      if (!inside(appRoot, target) || !allowedRoots.some((root) => inside(path.join(appRoot, root), target))) {
        fail(`目标路径越界: ${target}`);
      }
      await ensureRegular(source, ext);
      await ensureNoSymlinks(target);
      files.push({ source, target, rel: relative.replaceAll(path.sep, '/') });
    }
  }

  const targetManifest = JSON.parse(await readFile(targetManifestPath, 'utf8'));
  const backupRoot = path.join(appRoot, '.cache/npc-faces-v6-baseline/app');
  const backupManifest = path.join(backupRoot, manifestRel);
  await ensureNoSymlinks(backupRoot);
  let backedUp = false;
  try { await lstat(backupManifest); } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    await mkdir(path.dirname(backupManifest), { recursive: true });
    await copyFile(targetManifestPath, backupManifest);
    backedUp = true;
  }
  for (const item of files) {
      try {
        await ensureRegular(item.target, path.extname(item.target).toLowerCase());
        const backup = path.join(backupRoot, item.rel);
        try { await lstat(backup); continue; } catch (error) { if (error.code !== 'ENOENT') throw error; }
        await mkdir(path.dirname(backup), { recursive: true });
        await copyFile(item.target, backup);
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      }
  }

  const copied = [];
  for (const item of files) {
    await mkdir(path.dirname(item.target), { recursive: true });
    await copyFile(item.source, item.target);
    copied.push({ path: item.rel, bytes: (await lstat(item.target)).size, sha256: await sha256(item.target) });
  }
  const mergedManifest = { ...targetManifest, named: { ...(targetManifest.named || {}), ...sourceManifest.named } };
  await writeFile(targetManifestPath, `${JSON.stringify(mergedManifest, null, 2)}\n`, 'utf8');
  const report = {
    version: 1,
    zipPath,
    zipSha256: knownZipSha256,
    staging: rel(staging),
    backup: { path: rel(backupRoot), created: backedUp },
    copiedCount: copied.length,
    copiedBytes: copied.reduce((sum, item) => sum + item.bytes, 0),
    copied,
    manifest: { path: manifestRel, mergedNamedCount: Object.keys(sourceManifest.named.jobs || {}).length, changed: JSON.stringify(targetManifest.named) !== JSON.stringify(mergedManifest.named) },
  };
  const reportPath = path.join(appRoot, 'reports/npc-faces-v6/import.json');
  await mkdir(path.dirname(reportPath), { recursive: true });
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(`Imported ${copied.length} files (${report.copiedBytes} bytes); manifest named merged; report ${rel(reportPath)}`);
}

main().catch((error) => { console.error(`NPC faces v6 import failed: ${error.message}`); process.exitCode = 1; });
