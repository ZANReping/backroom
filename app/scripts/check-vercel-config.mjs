import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const app = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const root = path.dirname(app);
const json = relative => JSON.parse(fs.readFileSync(path.join(root, relative), 'utf8'));
const pkg = json('app/package.json'), lock = json('app/package-lock.json');
assert.equal(pkg.engines.node, '24.x');
assert.deepEqual(lock.packages[''].dependencies, pkg.dependencies);
assert.deepEqual(lock.packages[''].devDependencies, pkg.devDependencies);
assert.deepEqual(lock.packages[''].engines, pkg.engines);
assert.equal(json('package.json').engines.node, pkg.engines.node);
assert.equal(json('package-lock.json').packages[''].engines.node, pkg.engines.node);
assert.equal(json('package.json').scripts.build, 'npm --prefix app run build');
const contexts = [{ cwd: root, file: 'vercel.json', output: 'app/dist', build: 'npm --prefix app run build', prefix: ' --prefix app' }, { cwd: app, file: 'app/vercel.json', output: 'dist', build: 'npm run build', prefix: '' }];
for (const context of contexts) {
  const config = json(context.file);
  assert.equal(config.$schema, 'https://openapi.vercel.sh/vercel.json');
  assert.equal(config.framework, 'vite');
  assert.equal(config.outputDirectory, context.output, `${context.file}: Vite does not emit build/`);
  assert.equal(config.buildCommand, context.build);
  assert.equal(config.installCommand, `npm ci${context.prefix} --include=dev --no-audit --no-fund --registry=https://registry.npmjs.org`);
  assert.equal(path.resolve(context.cwd, config.outputDirectory), path.join(app, 'dist'));
  assert.ok(!('rootDirectory' in config), 'Root Directory is a project setting');
  const ignore = fs.readFileSync(path.join(context.cwd, '.vercelignore'), 'utf8').split(/\r?\n/).filter(Boolean);
  assert.ok(!ignore.some(rule => /^(?:app\/)?(?:public|src|scripts)(?:\/|$)/.test(rule)), 'Do not omit runtime or build inputs');
}
const sourceFiles = [];
function walk(directory) { for (const entry of fs.readdirSync(directory, { withFileTypes: true })) { const file = path.join(directory, entry.name); if (entry.isDirectory()) walk(file); else if (/\.(?:ts|tsx|js|mjs|css)$/.test(file)) sourceFiles.push(file); } }
walk(path.join(app, 'src'));
sourceFiles.push(path.join(app, 'vite.config.ts'), path.join(app, 'scripts/settlement-verifier-plugin.ts'));
let localImports = 0;
for (const file of sourceFiles) {
  for (const match of fs.readFileSync(file, 'utf8').matchAll(/(?:from\s*|import\s*\(?\s*|new URL\(\s*)["']([.@][^"']+)["']/g)) {
    const specifier = match[1];
    let resolved = specifier.startsWith('@/') ? path.join(app, 'src', specifier.slice(2)) : specifier.startsWith('.') ? path.resolve(path.dirname(file), specifier) : null;
    if (!resolved) continue;
    resolved = [resolved, ...['.ts', '.tsx', '.js', '.mjs', '.json', '/index.ts', '/index.tsx'].map(ext => resolved + ext)].find(candidate => fs.existsSync(candidate));
    if (!resolved) continue;
    const absolute = path.resolve(resolved); let parent = path.parse(absolute).root;
    for (const name of absolute.slice(parent.length).split(path.sep)) { assert.ok(fs.readdirSync(parent).includes(name), `Linux import case mismatch in ${path.relative(root, file)}: ${specifier}`); parent = path.join(parent, name); }
    localImports++;
  }
}
let assets = 0;
if (process.argv.includes('--built')) {
  const output = path.join(app, 'dist'), html = fs.readFileSync(path.join(output, 'index.html'), 'utf8');
  for (const match of html.matchAll(/(?:src|href)=["']([^"']+)["']/g)) {
    const url = match[1]; if (/^(?:[a-z]+:|\/\/|#)/i.test(url)) continue;
    const relative = decodeURIComponent(url.split(/[?#]/)[0]).replace(/^\//, '');
    assert.ok(fs.existsSync(path.join(output, relative)), `Missing built asset ${relative}`); assets++;
  }
  assert.ok(assets > 0, 'Built HTML must reference assets');
  for (const relative of ['assets/l1-bakes/manifest.json', 'textures']) assert.ok(fs.existsSync(path.join(output, relative)), `Missing runtime resource ${relative}`);
}
console.log(JSON.stringify({ passed: true, contexts: contexts.length, outputDirectory: 'app/dist', sourceFiles: sourceFiles.length, localImports, builtAssets: assets, built: process.argv.includes('--built') }));
