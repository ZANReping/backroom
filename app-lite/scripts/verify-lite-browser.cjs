// Local production smoke test. Pass the installed Playwright module path as argument 1.
const { chromium } = require(process.argv[2] || 'playwright');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const origin = 'http://127.0.0.1:4177';
const base = origin + '/dist/';
const walk = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);
(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [], failedLocalRequests = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('response', r => { if (r.url().startsWith(origin) && r.status() >= 400) failedLocalRequests.push([r.url(), r.status()]); });
  page.on('requestfailed', r => { if (r.url().startsWith(origin)) failedLocalRequests.push([r.url(), r.failure()]); });
  // Exercise offline font fallback, without downloading Google Fonts during verification.
  await page.route('https://fonts.googleapis.com/**', r => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  try {
    await page.goto(base, { waitUntil: 'domcontentloaded' });
    console.log('Title page:', (await page.locator('body').innerText()).slice(0, 1600), errors);
    await page.getByRole('button', { name: /开始游戏/ }).waitFor();
    await page.screenshot({ path: path.join(root, 'reports/title.png') });
    const files = walk(path.join(root, 'public')).map(f => path.relative(path.join(root, 'public'), f).replaceAll('\\', '/'));
    const decode = await page.evaluate(async ({ files, base }) => {
      const result = { images: 0, fonts: 0, music: 0, failures: [] };
      const audio = new AudioContext();
      for (const f of files) {
        try {
          if (/\.(png|jpg|svg)$/.test(f)) {
            const img = new Image(); img.src = base + f; await img.decode(); result.images++;
          } else if (/\.(woff2|ttf)$/.test(f)) {
            await new FontFace('lite-check-' + result.fonts, `url("${base + f}")`).load(); result.fonts++;
          } else if (f.endsWith('.mp3')) {
            const response = await fetch(base + f);
            const buffer = await audio.decodeAudioData(await response.arrayBuffer());
            if (buffer.duration <= 0) throw new Error('Empty audio');
            result.music++;
          }
        } catch (e) { result.failures.push({ file: f, error: String(e) }); }
      }
      await audio.close();
      return result;
    }, { files, base });
    await page.getByRole('button', { name: /开始游戏/ }).click();
    await page.waitForFunction(() => !!window.__renderer && !!window.__engine?.map, null, { timeout: 60000 });
    await page.waitForTimeout(5000);
    await page.keyboard.press('Space');
    await page.waitForTimeout(3000);
    await page.screenshot({ path: path.join(root, 'reports/game.png') });
    const game = await page.evaluate(() => ({ level: window.__engine.player.level, canvasCount: document.querySelectorAll('canvas').length, body: document.body.innerText.slice(-1200) }));
    const report = { productionUrl: base, decode, game, errors, failedLocalRequests };
    fs.writeFileSync(path.join(root, 'reports/browser.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
    if (decode.failures.length || errors.length || failedLocalRequests.length) process.exitCode = 1;
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
