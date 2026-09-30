// Contract/failure tests. Native Bilibili operations are simulated, never sent to users.
const { chromium } = require(process.argv[2] || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const base = 'http://127.0.0.1:4177';
const sdkBytes = fs.readFileSync(path.join(root, '.cache/toy-sdk-live.js'));
const checks = [];
const addCheck = message => { checks.push(message); console.log('PASS:', message); };
// Use a valid small PNG, also used by the main regression fixture.
const validPng = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=';
function fixture(qr, mode) {
  window.calls = []; window.qrMode = mode; window.shareMode = 'ok'; window.saveMode = 'ok'; window.stale = [];
  window.state = { deviceType: 'phone', viewport: { width: 1000, height: 800 }, safeArea: { top: 12, right: 18, bottom: 16, left: 22 }, orientation: 'landscape', immersive: true, changedFields: [] };
  const result = req => ({ base64: qr, url: 'https://www.bilibili.com/toy/test-platform/' + req.path });
  window.toy = {
    isSupport: async a => { if (mode === 'broken-probe' && a === 'share') throw Error('probe'); if (mode === 'broken-probe' && a === 'saveImageToAlbum') return new Promise(() => {}); return true; },
    onContainerChange: fn => { window.listener = fn; fn(window.state); return () => { window.unsubscribed = true; }; },
    getContainerState: async () => window.state,
    setContainerMode: async req => { window.calls.push(['mode', req]); window.state = { ...window.state, ...req }; window.listener(window.state); },
    getQrCode: async req => {
      window.calls.push(['qr', req]);
      if (window.qrMode === 'fail') throw Object.assign(Error('offline'), { type: 'unsupported' });
      if (window.qrMode === 'bad-url') return { ...result(req), url: 'javascript:alert(1)' };
      if (window.qrMode === 'stale' && req.path.includes('AB23')) return new Promise(resolve => window.stale.push(() => resolve(result(req))));
      return result(req);
    },
    share: async req => { window.calls.push(['share', req]); if (window.shareMode === 'hang') return new Promise(() => {}); if (window.shareMode === 'limited') throw { type: 'http_error', code: 307044 }; },
    saveImageToAlbum: async req => { window.calls.push(['save', req]); if (window.saveMode === 'deny') throw new DOMException('Denied', 'NotAllowedError'); return { localPath: 'mock.png' }; }
  };
}
(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--enable-unsafe-swiftshader'] });
  const contexts = [];
  let realSdkObservation;
  async function setup(mode = 'ok', production = false, delay = 0) {
    const context = await browser.newContext({ viewport: { width: 1000, height: 800 } }); contexts.push(context);
    await context.route('https://fonts.googleapis.com/**', r => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
    await context.route('**/toy-sdk.js', async r => {
      if (delay) await new Promise(resolve => setTimeout(resolve, delay));
      await r.fulfill({ contentType: 'application/javascript', body: mode === 'real' ? sdkBytes : `(${fixture.toString()})(${JSON.stringify(validPng)},${JSON.stringify(mode)})` });
    });
    const page = await context.newPage(), errors = [];
    page.setDefaultTimeout(15000);
    console.log('START:', mode, production ? 'production' : 'harness');
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(base + (production ? '/dist/index.html' : '/reports/toy-harness.html?share'), { waitUntil: 'domcontentloaded' });
    return { page, errors, context };
  }
  try {
    // The exact official SDK bytes, with no window.toy replacement or fake platform context.
    const real = await setup('real', true), p = real.page;
    await p.getByRole('button', { name: /分享游戏 \/ 跨设备打开/ }).click();
    await p.waitForFunction(() => !!window.toy);
    realSdkObservation = await p.evaluate(async () => {
      const abilities = {};
      for (const a of ['share', 'getQrCode', 'saveImageToAlbum', 'setContainerMode']) abilities[a] = await window.toy.isSupport(a);
      const failures = {};
      for (const [name, req] of [['getQrCode', { path: 'index.html', size: 240 }], ['saveImageToAlbum', { base64Data: 'x'.repeat(5242881) }]]) {
        try { await window.toy[name](req); } catch (e) { failures[name] = { type: e.type, message: e.message }; }
      }
      return { abilities, failures };
    });
    assert.equal(realSdkObservation.abilities.share, false);
    assert.equal(realSdkObservation.abilities.saveImageToAlbum, false);
    assert.equal(realSdkObservation.abilities.getQrCode, true);
    assert.equal(realSdkObservation.failures.saveImageToAlbum.type, 'invalid_param');
    assert.ok(realSdkObservation.failures.getQrCode, 'local page must not pretend to have a real Toy context');
    await p.getByRole('button', { name: '显示二维码', exact: true }).click();
    await p.getByRole('status').filter({ hasText: /当前环境不支持|操作未完成|操作超时/ }).waitFor();
    assert.equal(await p.getByRole('button', { name: '分享到 B站' }).count(), 0);
    await p.getByText('查看链接', { exact: true }).click();
    assert.equal(await p.getByLabel('分享链接').inputValue(), base + '/dist/index.html');
    await p.screenshot({ path: path.join(root, 'reports/toy-real-sdk-fallback.png') });
    assert.deepEqual(real.errors, []);
    addCheck('official SDK: actual Web ability flags, 5MB validation, missing platform context gracefully falls back');
    await real.context.close();

    const home = await setup('ok', true), h = home.page;
    await h.getByRole('button', { name: /分享游戏 \/ 跨设备打开/ }).click();
    await h.getByText('查看链接', { exact: true }).click();
    await h.waitForFunction(() => document.querySelector('input[aria-label="分享链接"]')?.value === 'https://www.bilibili.com/toy/test-platform/index.html');
    await h.evaluate(() => Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async text => { window.copied = text; } } }));
    await h.getByRole('button', { name: '复制链接', exact: true }).click();
    assert.equal(await h.evaluate(() => window.copied), 'https://www.bilibili.com/toy/test-platform/index.html');
    await h.getByRole('button', { name: '显示二维码', exact: true }).click();
    await h.getByRole('link', { name: '下载二维码', exact: true }).waitFor();
    await h.getByRole('button', { name: '保存二维码到相册', exact: true }).click();
    await h.getByText('二维码已保存。', { exact: true }).waitFor();
    assert.equal(await h.evaluate(() => window.calls.filter(c => c[0] === 'qr').length), 1);
    await h.screenshot({ path: path.join(root, 'reports/toy-home-share.png') });
    await h.keyboard.press('Escape');
    assert.equal(await h.getByRole('dialog').count(), 0);
    addCheck('home: platform URL copied, QR request deduplicated, QR album/download actions, modal Escape dismissal');
    await home.context.close();

    const faults = await setup('fail'), f = faults.page;
    await f.getByRole('button', { name: '显示二维码', exact: true }).waitFor();
    await f.getByRole('button', { name: '显示二维码', exact: true }).click();
    await f.getByRole('status').filter({ hasText: '当前环境不支持' }).waitFor();
    await f.evaluate(() => { window.qrMode = 'ok'; });
    await f.getByRole('button', { name: '显示二维码', exact: true }).click();
    await f.getByAltText('打开后室 Toy 的二维码').waitFor();
    await f.evaluate(() => { window.saveMode = 'deny'; });
    await f.getByRole('button', { name: '保存二维码到相册' }).click();
    await f.getByRole('status').filter({ hasText: '未获得权限' }).waitFor();
    assert.equal(await f.getByRole('link', { name: '下载二维码' }).count(), 1);
    await f.evaluate(() => { window.shareMode = 'hang'; });
    await f.getByRole('button', { name: '分享到 B站' }).click();
    await f.getByRole('status').filter({ hasText: '操作超时' }).waitFor({ timeout: 12000 });
    assert.equal(await f.getByRole('button', { name: '分享到 B站' }).isEnabled(), true);
    await f.evaluate(() => { window.shareMode = 'limited'; });
    await f.getByRole('button', { name: '分享到 B站' }).click();
    await f.getByText('请求过于频繁，请稍后再试。', { exact: true }).waitFor();
    assert.deepEqual(faults.errors, []);
    addCheck('failures: QR retry, denied album permission retains download, hung bridge releases buttons, rate-limit feedback');
    await faults.context.close();

    const stale = await setup('stale'), s = stale.page;
    await s.waitForFunction(() => window.stale.length === 1);
    await s.getByRole('button', { name: '切换邀请目标' }).click();
    await s.getByText('查看链接', { exact: true }).click();
    await s.waitForFunction(() => document.querySelector('input')?.value.endsWith('room=CD45'));
    await s.evaluate(() => window.stale.forEach(resolve => resolve()));
    await s.waitForTimeout(100);
    assert.ok((await s.getByLabel('分享链接').inputValue()).endsWith('room=CD45'));
    assert.deepEqual(stale.errors, []);
    addCheck('invitation: delayed response for previous room cannot overwrite current target');
    await stale.context.close();

    const broken = await setup('broken-probe'), b = broken.page;
    await b.getByRole('button', { name: '显示二维码', exact: true }).waitFor({ timeout: 8000 });
    assert.equal(await b.getByRole('button', { name: '分享到 B站' }).count(), 0);
    assert.equal(await b.evaluate(() => window.toyTest.toySnapshot().supported.saveImageToAlbum), false);
    assert.deepEqual(broken.errors, []);
    addCheck('capability discovery: one rejected/hung ability does not block other supported features');
    await broken.context.close();

    const late = await setup('ok', false, 5500), l = late.page;
    await l.getByRole('button', { name: '显示二维码', exact: true }).waitFor({ timeout: 10000 });
    await l.getByRole('button', { name: '显示二维码', exact: true }).click();
    await l.getByAltText('打开后室 Toy 的二维码').waitFor();
    assert.deepEqual(late.errors, []);
    addCheck('late SDK: features recover after script arrives beyond initial readiness deadline');
    await late.context.close();
    const report = { passed: true, checks, realSdkObservation, sdkSHA256: crypto.createHash('sha256').update(sdkBytes).digest('hex'), realBilibiliClientTested: false };
    fs.writeFileSync(path.join(root, 'reports/toy-contract-verification.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
  } catch (error) { for (const c of contexts) for (const page of c.pages()) await page.screenshot({ path: path.join(root, 'reports/toy-contract-failure.png') }).catch(() => {}); throw error; } finally { await Promise.all(contexts.map(c => c.close().catch(() => {}))); await browser.close(); }
})().catch(error => { fs.writeFileSync(path.join(root, 'reports/toy-contract-verification.json'), JSON.stringify({ passed: false, checks, error: String(error) }, null, 2)); console.error(error); process.exitCode = 1; });
