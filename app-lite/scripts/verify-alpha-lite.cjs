// Production Alpha integration check; no game/runtime mocks.
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
    await page.evaluate(() => { window.__engine.dev.god = true; window.__engine.loadLevel(101); });
    await page.waitForFunction(() => window.__engine.player.level === 101, null, { timeout: 60000 });
    await ready();
    report.base = await page.evaluate(() => ({id:window.__engine.map.settlement.blueprint.id,npcs:window.__engine.npcs.length,structures:window.__engine.map.structures.length}));
    assert.equal(report.base.id,'alpha'); assert.ok(report.base.npcs>0);
    await page.screenshot({path:path.join(root,'reports/alpha-lite-world.png')});
    await page.keyboard.press('m');
    const select = page.getByLabel('查看 Alpha 地图区块');
    await select.waitFor({timeout:10000});
    const regions=await select.locator('option').evaluateAll(options=>options.map(o=>o.value).filter(v=>v!=='auto'));
    for(const region of regions){
      await select.selectOption(region);
      await page.waitForTimeout(180);
      assert.equal(await page.locator('[data-alpha-map]').getAttribute('data-alpha-map'),region);
      report.regions.push(region);
    }
    await select.selectOption('overview');
    await page.screenshot({path:path.join(root,'reports/alpha-lite-map.png')});
    await page.setViewportSize({width:740,height:390});
    await page.waitForTimeout(500);
    await page.screenshot({path:path.join(root,'reports/alpha-lite-map-mobile.png')});
    const box=await page.locator('[data-alpha-map]').boundingBox();
    assert.ok(box && box.width<=740 && box.height<=390);
    report.checks.push('UI start, preload off, MIDI normalized, Alpha playable, all map regions selectable, compact map fits viewport');
    const names = fs.readdirSync(path.join(root, 'public/textures/alpha')).filter(n => /\.jpg$/i.test(n));
    const decoded = await page.evaluate(async names => {
      const results = [];
      for (const name of names) {
        const image = new Image(); image.src = './textures/alpha/' + name; await image.decode();
        results.push({ name, width: image.naturalWidth, height: image.naturalHeight });
      }
      return results;
    }, names);
    assert.equal(decoded.length, 21);
    assert.ok(decoded.every(d => Math.max(d.width, d.height) <= 512));
    report.textures = decoded;
    report.checks.push('all 21 new compressed textures decode at <=512px');
    assert.deepEqual(report.errors, []); assert.deepEqual(report.missing, []); assert.deepEqual(report.musicRequests, []);
    report.passed = true;
  } catch (error) {
    report.failure = String(error);
    await page.screenshot({ path: path.join(root, 'reports/alpha-lite-failure.png') }).catch(() => {});
    throw error;
  } finally {
    clearInterval(diagnostic);
    fs.writeFileSync(path.join(root, 'reports/alpha-lite-browser.json'), JSON.stringify(report, null, 2));
    await browser.close();
  }
  console.log(JSON.stringify(report, null, 2));
})().catch(error => { console.error(error); process.exitCode = 1; });
