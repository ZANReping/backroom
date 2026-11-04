import { existsSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ids = [
  'mahjongtile', 'key437', 'bagTag', 'roomtea', 'gentletter', 'spokesposter',
  'spokesphoto', 'detbadge', 'windupgear', 'chefpot', 'megcamera', 'megmic',
  'megform', 'habanero', 'chefphoto', 'roomcard', 'fatedie', 'brokendie',
  'diereceipt', 'brokenrecord', 'silencejuice', 'mysteryegg',
];

const scriptDir = dirname(fileURLToPath(import.meta.url));
const appDir = resolve(scriptDir, '..');
const sourceDir = resolve(appDir, 'art', 'l5-item-icons');
const outputDir = resolve(appDir, 'public', 'textures', 'icons', 'pixel');
const luaScript = resolve(scriptDir, 'draw-l5-item-icons.lua');
const aseprite = process.env.ASEPRITE_PATH || 'E:/ZAN/Aseprite/aseprite.exe';

function fail(message) {
  console.error(`L5 icon generation failed: ${message}`);
  process.exitCode = 1;
}

if (!existsSync(luaScript)) fail(`missing Aseprite script: ${luaScript}`);

else {
  mkdirSync(sourceDir, { recursive: true });
  const result = spawnSync(aseprite, [
    '-b',
    '--script-param', `sources=${sourceDir}`,
    '--script-param', `output=${outputDir}`,
    '--script', luaScript,
  ], { cwd: appDir, stdio: 'inherit', windowsHide: true });

  if (result.error) fail(result.error.message);
  else if (result.status !== 0) fail(`Aseprite exited with status ${result.status}`);
  else {
    const pngHeader = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    for (const id of ids) {
      const asepriteFile = join(sourceDir, `item_${id}.aseprite`);
      const pngFile = join(outputDir, `item_${id}.png`);
      if (!existsSync(asepriteFile) || statSync(asepriteFile).size === 0) {
        fail(`missing or empty source: ${asepriteFile}`);
        break;
      }
      if (!existsSync(pngFile)) {
        fail(`missing exported PNG: ${pngFile}`);
        break;
      }
      const png = readFileSync(pngFile);
      const validSize = png.length >= 24 && png.subarray(0, 8).equals(pngHeader)
        && png.readUInt32BE(16) === 128 && png.readUInt32BE(20) === 128;
      if (!validSize) {
        fail(`expected 128x128 PNG: ${pngFile}`);
        break;
      }
    }
    if (process.exitCode !== 1) console.log(`Validated ${ids.length} L5 Aseprite icons at ${outputDir}`);
  }
}
