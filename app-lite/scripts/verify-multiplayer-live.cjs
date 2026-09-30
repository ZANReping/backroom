// Live public signaling and real WebRTC. No MpSession, PeerJS, or transport mocks.
const { chromium } = require(process.argv[2] || 'playwright');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const relay = process.argv.includes('--relay');
const early = process.argv.includes('--early-disconnect');
const preview = process.argv.includes('--preview');
const published = process.argv.includes('--published') || preview;
const base = published ? 'https://www.bilibili.com/toy/BackroomsRoguelike/index.html' : 'http://127.0.0.1:4177/dist/index.html';
const report = { passed: false, checks: [], stage: 'init', contexts: [], realBilibiliClientTested: false, forcedRelay: relay, topology: 'two isolated browser contexts on one computer; public PeerJS signaling; real WebRTC' };
(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--enable-unsafe-swiftshader', '--disable-background-timer-throttling', '--disable-renderer-backgrounding'] });
  report.publishedToyDesktopTested = published; report.localAssetOverride = preview;
  const contexts = [];
  async function client(name) {
    const context = await browser.newContext({ viewport: { width: 960, height: 600 } }); contexts.push(context);
    if (preview) {
      const assets = path.join(root, 'dist/assets');
      const files = new Set(fs.readdirSync(assets));
      // The upstream boot now imports App and workers as separate chunks.
      // Serve the matching HTML and all its assets together in this test browser.
      await context.route('https://www.bilibilitoy.com/toy/BackroomsRoguelike/**/index.html*', r => r.fulfill({ contentType: 'text/html', body: fs.readFileSync(path.join(root, 'dist/index.html')) }));
      await context.route('https://www.bilibilitoy.com/toy/BackroomsRoguelike/**/assets/*', r => {
        const name = new URL(r.request().url()).pathname.split('/').pop();
        if (!files.has(name)) return r.continue();
        const contentType = name.endsWith('.js') ? 'application/javascript' : name.endsWith('.css') ? 'text/css' : 'font/woff2';
        return r.fulfill({ contentType, body: fs.readFileSync(path.join(assets, name)) });
      });
      await context.route('https://www.bilibilitoy.com/toy/BackroomsRoguelike/**/multiplayer.json', r => r.fulfill({ contentType: 'application/json', body: fs.readFileSync(path.join(root, 'dist/multiplayer.json')) }));
    }
    if (!published) await context.route('**/toy-sdk.js', r => r.abort());
    await context.route('https://fonts.googleapis.com/**', r => r.fulfill({ contentType: 'text/css', body: '' }));
    await context.addInitScript(({name, relay}) => {
      localStorage.setItem('br_mp_name', name);
      localStorage.setItem('br_settings', JSON.stringify({ bgmStyle: 'procedural', renderResolution: '320p_ps1', shadows: false, grain: false, preloadAllLevels: false }));
      window.__pcs = [];
      window.RTCPeerConnection = new Proxy(window.RTCPeerConnection, { construct(target, args) { if (relay) args[0] = { ...args[0], iceTransportPolicy: 'relay' }; const pc = new target(...args); window.__pcs.push(pc); return pc; } });
    }, { name, relay });
    const page = await context.newPage(); page.setDefaultTimeout(40000);
    const evidence = { name, pageErrors: [], networkErrors: [], websocketErrors: [] }; report.contexts.push(evidence);
    page.on('pageerror', e => evidence.pageErrors.push(e.stack || e.message));
    page.on('requestfailed', r => { if (!/toy-sdk/.test(r.url())) evidence.networkErrors.push({ url: r.url().split('?')[0], error: r.failure()?.errorText }); });
    page.on('websocket', ws => ws.on('socketerror', e => evidence.websocketErrors.push(String(e))));
    if (!published) return page;
    let game;
    return new Proxy(page, { get(target, key) {
      if (key === 'goto') return async url => {
        await target.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await target.waitForFunction(() => !!document.querySelector('iframe'));
        game = target.frames().find(f => f.url().includes('bilibilitoy.com'));
        if (!game) { await target.waitForTimeout(1500); game = target.frames().find(f => f.url().includes('bilibilitoy.com')); }
        await game.waitForFunction(() => !!window.__engine, null, { timeout: 60000 });
      };
      if (['locator','getByRole','getByText','getByPlaceholder','evaluate','waitForFunction'].includes(key)) return game[key].bind(game);
      const value = target[key]; return typeof value === 'function' ? value.bind(target) : value;
    } });
  }
  let host, guest;
  try {
    host = await client('Toy测试房主'); guest = await client('Toy测试客人');
    report.stage = 'host-public-signaling'; console.log(report.stage);
    await host.goto(base);
    await host.getByRole('button', { name: /联机模式/ }).click();
    if (preview) {
      await host.getByRole('button', { name: '联机诊断', exact: true }).click();
      await host.getByRole('status').filter({ hasText: '发布包未配置 TURN 中继' }).waitFor();
      report.checks.push('new build in actual Toy iframe diagnoses missing TURN accurately');
    }
    await host.getByRole('button', { name: '创建房间（我是房主）' }).click();
    await host.waitForFunction(() => /房间码\s+[A-HJ-NP-Z2-9]{4}/.test(document.body.innerText) || document.body.innerText.includes('创建房间失败'), null, { timeout: 25000 });
    const text = await host.locator('body').innerText();
    if (text.includes('创建房间失败')) throw Error(text.match(/创建房间失败[^\n]*/)?.[0]);
    const code = text.match(/房间码\s+([A-HJ-NP-Z2-9]{4})/)[1];
    report.checks.push('host created room through public PeerJS signaling');
    report.stage = 'guest-invitation-join'; console.log(report.stage);
    await guest.goto(base + '?room=' + code);
    assert.equal(await guest.getByPlaceholder('房间码').inputValue(), code);
    assert.equal(await guest.getByText('连接中…', { exact: true }).count(), 0);
    await guest.getByRole('button', { name: '加入房间', exact: true }).click();
    await guest.waitForFunction(() => document.body.innerText.includes('Toy测试房主') || document.body.innerText.includes('加入失败'), null, { timeout: 35000 });
    const guestText = await guest.locator('body').innerText();
    if (guestText.includes('加入失败')) throw Error(guestText.match(/加入失败[^\n]*/)?.[0]);
    await host.getByText('Toy测试客人', { exact: true }).waitFor();
    report.checks.push('invitation prefill, explicit join, both real clients see each other in lobby');
    report.stage = 'ready-start'; console.log(report.stage);
    await host.getByRole('button', { name: '准备', exact: true }).click();
    await guest.getByRole('button', { name: '准备', exact: true }).click();
    await host.getByRole('button', { name: '开始游戏', exact: true }).click();
    if (early) {
      report.stage = 'disconnect-during-loading';
      await guest.waitForFunction(() => !!window.__mpSession && document.body.innerText.includes('准备附近场景'), null, { timeout: 60000 });
      await host.evaluate(() => window.__mpSession.leave());
      await guest.getByRole('status').filter({ hasText: '联机已结束' }).waitFor();
      await guest.waitForTimeout(3000);
      await guest.getByRole('button', { name: /开始游戏/ }).waitFor();
      assert.equal(await guest.evaluate(() => window.__engine.mpSession), null);
      report.checks.push('host disconnect during async scene warmup cancels pending start and returns guest to title');
      assert.ok(report.contexts.every(c => !c.pageErrors.length));
      report.passed = true; report.stage = 'complete';
      return;
    }
    for (const p of [host, guest]) {
      await p.waitForFunction(() => window.__mpSession?.started && window.__engine?.player, null, { timeout: 60000 });
      await p.waitForTimeout(2000);
      await p.keyboard.press('Space');
      await p.waitForFunction(() => document.body.innerText.includes('LEVEL 0 ·'), null, { timeout: 45000 });
      await p.waitForFunction(() => window.__mpSession.remotes.size > 0, null, { timeout: 45000 });
    }
    assert.equal(await host.evaluate(() => window.__engine.seed), await guest.evaluate(() => window.__engine.seed));
    report.checks.push('both clients ready and start with identical world seed');
    report.stage = 'bidirectional-state'; console.log(report.stage);
    await guest.evaluate(() => { window.__engine.dev.god = true; window.__engine.loadLevel(1); });
    await host.waitForFunction(() => [...window.__mpSession.remotes.values()].some(r => r.s.level === 1), null, { timeout: 20000 });
    await host.evaluate(() => { window.__engine.dev.god = true; window.__engine.loadLevel(1); });
    await guest.waitForFunction(() => [...window.__mpSession.remotes.values()].some(r => r.id === 'HOST' && r.s.level === 1), null, { timeout: 20000 });
    const guestPosition = await guest.evaluate(() => { const e = window.__engine; return { x: e.player.x + (e.map.inf?.ox ?? 0), y: e.player.y + (e.map.inf?.oy ?? 0) }; });
    await host.waitForFunction(pos => [...window.__mpSession.remotes.values()].some(r => Math.abs(r.s.x-pos.x)<0.1 && Math.abs(r.s.y-pos.y)<0.1 && !r.s.iso), guestPosition, { timeout: 15000 });
    report.checks.push('player state crosses real WebRTC data channel in both directions');
    for (const p of [host, guest]) await p.waitForFunction(() => [...window.__renderer.remoteViews.views.values()].some(v => v.grp.visible), null, { timeout: 15000 });
    await guest.evaluate(() => window.__mpSession.sendEvent({ t: 'exit', dest: 2 }));
    await host.getByText('远处传来动静——有同行者进入了别的层级。', { exact: true }).waitFor();
    await host.evaluate(() => window.__mpSession.sendEvent({ t: 'died', text: '联机验证事件' }));
    await guest.getByText('有同行者死去了：联机验证事件', { exact: true }).waitFor();
    report.checks.push('remote avatar models visible outside Level 0 isolation; world event delivery works in both directions');
    await guest.waitForTimeout(1500);
    for (const [index, p] of [host, guest].entries()) {
      report.contexts[index].rtc = await p.evaluate(async () => {
        const result = [];
        for (const pc of window.__pcs) {
          const stats = await pc.getStats(); const entries = [...stats.values()];
          const transport = entries.find(s => s.type === 'transport' && s.selectedCandidatePairId);
          const pair = transport && stats.get(transport.selectedCandidatePairId);
          result.push({ connectionState: pc.connectionState, iceConnectionState: pc.iceConnectionState, localCandidateType: pair && stats.get(pair.localCandidateId)?.candidateType, remoteCandidateType: pair && stats.get(pair.remoteCandidateId)?.candidateType, bytesSent: pair?.bytesSent, bytesReceived: pair?.bytesReceived });
        }
        return result;
      });
      await p.screenshot({ path: path.join(root, `reports/multiplayer-${index ? 'guest' : 'host'}.png`) });
    }
    report.stage = 'host-disconnect'; console.log(report.stage);
    await host.evaluate(() => window.__mpSession.leave());
    await guest.waitForFunction(() => /房主解散|与房主断开/.test(document.body.innerText), null, { timeout: 15000 });
    report.checks.push('guest receives host disconnect notification');
    assert.ok(report.contexts.every(c => !c.pageErrors.length));
    report.passed = true; report.stage = 'complete';
  } catch (e) {
    report.error = String(e);
    for (const [index, p] of [host, guest].entries()) if (p) {
      report.contexts[index].visibleText = (await p.locator('body').innerText().catch(() => '')).slice(-2500);
      await p.screenshot({ path: path.join(root, `reports/multiplayer-failure-${index}.png`) }).catch(() => {});
    }
    process.exitCode = 1;
  } finally {
    await Promise.all(contexts.map(c => c.close().catch(() => {}))); await browser.close();
    fs.writeFileSync(path.join(root, preview ? 'reports/multiplayer-toy-preview.json' : published ? 'reports/multiplayer-published.json' : relay ? 'reports/multiplayer-relay.json' : early ? 'reports/multiplayer-early-disconnect.json' : 'reports/multiplayer-live.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
  }
})();
