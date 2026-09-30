// Production Level 5 integration check; no game/runtime mocks.
const { chromium } = require(process.argv[2] || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const base = 'http://127.0.0.1:4177/dist/';
const report = { passed: false, checks: [], regions: [], errors: [], missing: [], musicRequests: [] };
(async () => {
  const browser = await chromium.launch({ channel: 'chromium', headless: true, args: ['--use-angle=d3d11'] });
  const page = await browser.newPage({ viewport: { width: 1100, height: 700 } });
  page.on('pageerror', e => report.errors.push(e.stack || e.message));
  page.on('response', r => { if (r.url().startsWith(base) && r.status() >= 400) report.missing.push([r.url(), r.status()]); });
  page.on('request', r => { if (/\/music\/.*\.(mid|mp3)/i.test(r.url())) report.musicRequests.push(r.url()); });
  await page.route('**/toy-sdk.js', r => r.abort());
  await page.route('https://fonts.googleapis.com/**', r => r.fulfill({ contentType: 'text/css', body: '' }));
  await page.addInitScript(() => localStorage.setItem('br_settings', JSON.stringify({ bgmStyle: 'midi', renderResolution: '480p_retro', shadows: false, grain: false })));
  const ready = () => page.waitForFunction(() => window.__renderer?.isNearWorldReady(window.__engine) && !window.__engine.paused, null, { timeout: 240000 });
  const diagnostic = setInterval(async () => {
    const state = await page.evaluate(() => {
      const e = window.__engine, r = window.__renderer;
      if (!e?.map || !r) return null;
      return { level:e.player.level, paused:e.paused, ready:r.isNearWorldReady(e), flash:!!r.flashWarmup, moth:r.mothWarmupDone,
        chunks:r.chunkGroups.size, task:r.cityChunkTask?.key, rev:e.map.inf?.rev, programs:r.three.info.programs.length,
        missingItems:e.map.items.filter(i=>Math.hypot(i.x-e.player.x,i.y-e.player.y)<=3).map(i=>({type:i.type,group:r.itemMeshes.has(Math.round(i.id*1000)%100000000),ready:r.itemWarmup.ready(r.itemMeshes.get(Math.round(i.id*1000)%100000000))})),
        missingNpcs:e.npcs.filter(n=>Math.hypot(n.x-e.player.x,n.y-e.player.y)<=24&&!r.npcMeshes.has(n.id)).map(n=>n.id) };
    }).catch(()=>null);
    console.log('readiness', JSON.stringify(state));
  }, 15000);
  try {
    await page.goto(base, { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: /开始游戏/ }).waitFor({ timeout: 60000 });
    const settings = await page.evaluate(() => JSON.parse(localStorage.getItem('br_settings')));
    assert.equal(settings.bgmStyle, 'procedural'); assert.equal(settings.preloadAllLevels, false);
    await page.getByRole('button', { name: /开始游戏/ }).click();
    await page.waitForFunction(() => document.body.innerText.includes('LEVEL 0 ·'), null, { timeout: 90000 });
    await ready();
    report.gpu = await page.evaluate(() => { const gl=window.__renderer.three.getContext(), ext=gl.getExtension('WEBGL_debug_renderer_info'); return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'unknown'; });
    await page.evaluate(() => { window.__engine.dev.god = true; window.__engine.loadLevel(5); });
    await page.waitForFunction(() => window.__engine.player.level === 5, null, { timeout: 60000 });
    await ready();
    report.checks.push('UI start, default preload off, legacy MIDI normalized, Level 5 playable');
    for (const kind of ['mainhall', 'beverly', 'boilerroom', 'mothnest']) {
      console.log('Level 5 region:', kind);
      assert.ok(await page.evaluate(kind => window.__engine.devGotoVariant(kind), kind), `region ${kind} found`);
      await ready();
      await page.waitForTimeout(600);
      await page.screenshot({ path: path.join(root, `reports/l5-lite-${kind}.png`) });
      report.regions.push(await page.evaluate(kind => ({ kind, level: window.__engine.player.level, structures: window.__engine.map.structures.length, entities: window.__engine.map.entities.length, ready: window.__renderer.isNearWorldReady(window.__engine) }), kind));
    }
    for (const form of ['male', 'female', 'larva', 'guard']) {
      assert.ok(await page.evaluate(form => window.__engine.devSpawnEntity('deathmoth', 3, form), form), `spawn ${form}`);
    }
    await page.waitForTimeout(1600);
    report.checks.push('main hall, Beverly room, boiler room, moth nest stream/render; all four moth forms spawn');
    const names = fs.readdirSync(path.join(root, 'public/textures/l5')).filter(n => /\.jpg$/i.test(n));
    const decoded = await page.evaluate(async names => {
      const results = [];
      for (const name of names) {
        const image = new Image(); image.src = './textures/l5/' + name; await image.decode();
        results.push({ name, width: image.naturalWidth, height: image.naturalHeight });
      }
      return results;
    }, names);
    assert.equal(decoded.length, 27);
    assert.ok(decoded.every(d => Math.max(d.width, d.height) <= 512));
    report.textures = decoded;
    report.checks.push('all 27 new compressed textures decode at <=512px');
    assert.deepEqual(report.errors, []); assert.deepEqual(report.missing, []); assert.deepEqual(report.musicRequests, []);
    report.passed = true;
  } catch (error) {
    report.failure = String(error);
    await page.screenshot({ path: path.join(root, 'reports/l5-lite-failure.png') }).catch(() => {});
    throw error;
  } finally {
    clearInterval(diagnostic);
    fs.writeFileSync(path.join(root, 'reports/l5-lite-browser.json'), JSON.stringify(report, null, 2));
    await browser.close();
  }
  console.log(JSON.stringify(report, null, 2));
})().catch(error => { console.error(error); process.exitCode = 1; });
