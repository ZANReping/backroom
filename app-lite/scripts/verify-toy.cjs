const { chromium } = require(process.argv[2] || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const base = 'http://127.0.0.1:4177';
const checks = [];
const qr = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=';
const fixture = `
window.sdkCalls=[];window.sdkNoChange=false;window.sdkFail=false;
window.sdkState={deviceType:'phone',viewport:{width:900,height:500},safeArea:{top:12,right:18,bottom:16,left:22},orientation:'portrait',immersive:false,changedFields:[]};
window.toy={
isSupport:async()=>true,
onContainerChange(fn){window.sdkListener=fn;fn(window.sdkState);return()=>{window.sdkListener=null}},
getContainerState:async()=>window.sdkState,
setContainerMode:async(mode)=>{window.sdkCalls.push(['mode',mode]);if(window.sdkFail)throw Error('denied');if(!window.sdkNoChange){window.sdkState={...window.sdkState,...mode};setTimeout(()=>window.sdkListener?.(window.sdkState),10)}},
getQrCode:async(req)=>{window.sdkCalls.push(['qr',req]);if(window.sdkFail)throw Error('offline');return {base64:${JSON.stringify(qr)},url:'https://www.bilibili.com/toy/example/'+req.path}},
share:async(req)=>{window.sdkCalls.push(['share',req]);if(window.sdkFail)throw Error('cancelled')},
saveImageToAlbum:async(req)=>{window.sdkCalls.push(['save',req.base64Data.length]);if(window.sdkFail)throw Error('permission');return{localPath:'mock.png'}}
};`;
(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--enable-unsafe-swiftshader'] });
  const contexts = [];
  async function setup(mock) {
    const context = await browser.newContext({ viewport: { width: 900, height: 500 } }); contexts.push(context);
    await context.route('https://fonts.googleapis.com/**', r => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
    await context.route('**/toy-sdk.js', r => mock ? r.fulfill({ contentType: 'application/javascript', body: fixture }) : r.abort());
    await context.addInitScript(() => {
      localStorage.setItem('br_settings', JSON.stringify({ bgmStyle: 'midi', renderResolution: '320p_ps1', shadows: false, grain: false, preloadAllLevels: false }));
    });
    const page = await context.newPage();
    const errors = [], requests = [], missingAssets = [];
    page.on('response', r => { if (r.url().startsWith(base + '/dist/') && r.status() >= 400) missingAssets.push([r.url(), r.status()]); });
    page.on('pageerror', e => { errors.push(e.message); console.log('PAGE ERROR:', e.message); });
    page.on('request', r => { if (/\/music\/.*\.(mp3|mid)/i.test(r.url())) requests.push(r.url()); });
    return { page, errors, requests, missingAssets, context };
  }
  try {
    // Actual production build with no SDK, legacy settings and a subdirectory URL.
    const plain = await setup(false), p = plain.page;
    await p.goto(base + '/dist/index.html', { waitUntil: 'domcontentloaded' });
    console.log('Production body:', (await p.locator('body').innerText()).slice(0, 800));
    await p.getByRole('button', { name: /开始游戏/ }).waitFor({ timeout: 60000 });
    assert.equal(await p.evaluate(() => JSON.parse(localStorage.getItem('br_settings')).bgmStyle), 'procedural');
    await p.getByRole('button', { name: /设置/ }).click();
    await p.getByRole('button', { name: '音频', exact: true }).click();
    assert.equal(await p.getByRole('button', { name: '程序化', exact: true }).isDisabled(), true);
    assert.equal(await p.getByRole('button', { name: 'MIDI', exact: true }).count(), 0);
    checks.push('production: legacy MIDI normalized, procedural-only settings, SDK failure fallback');
    await p.goto(base + '/dist/index.html?room=AB23');
    await p.getByPlaceholder('房间码').waitFor();
    assert.equal(await p.getByPlaceholder('房间码').inputValue(), 'AB23');
    assert.equal(await p.getByText('连接中…', { exact: true }).count(), 0);
    checks.push('production: invitation opens lobby and prefills code without automatic connection');
    await p.goto(base + '/dist/index.html');
    await p.getByRole('button', { name: /开始游戏/ }).click();
    await p.waitForFunction(() => !!window.__engine?.player && !!window.__renderer, null, { timeout: 60000 });
    await p.waitForTimeout(2000); await p.keyboard.press('Space');
    await p.waitForFunction(() => document.body.innerText.includes('LEVEL 0 ·'), null, { timeout: 45000 });
    await p.waitForFunction(() => window.__renderer.isNearWorldReady(window.__engine) && !window.__engine.paused, null, { timeout: 90000 });
    assert.equal(await p.locator('#boot-loader').count(), 0);
    for (const level of [2, 3, 4, 8, 11]) {
      await p.evaluate(id => { window.__engine.dev.god = true; window.__engine.loadLevel(id); }, level);
      await p.waitForFunction(id => window.__engine.player.level === id && document.body.innerText.includes(`LEVEL ${id} ·`), level, { timeout: 60000 });
      await p.waitForFunction(() => window.__renderer.isNearWorldReady(window.__engine) && !window.__engine.paused, null, { timeout: 90000 });
      await p.screenshot({ path: path.join(root, `reports/sync-level-${level}.png`) });
    }
    assert.deepEqual(plain.missingAssets, []);
    assert.ok(await p.evaluate(() => performance.getEntriesByType('resource').some(r => /chunks\.worker-/.test(r.name))));
    checks.push('synced Levels 2/3/4/8/11 become playable after scene warmup; chunk worker loads; no missing local resources');
    await p.evaluate(() => { window.__engine.musicianPlay(); window.__engine.emit({ kind: 'dead', text: '测试报告' }); });
    await p.getByRole('button', { name: '生成生存报告' }).click();
    await p.getByAltText('后室生存报告卡片').waitFor();
    assert.equal(await p.getByRole('link', { name: '下载报告图片' }).count(), 1);
    await p.screenshot({ path: path.join(root, 'reports/toy-report.png') });
    assert.deepEqual(plain.requests, []); assert.deepEqual(plain.errors, []);
    checks.push('production: start game, procedural musician, death report, PNG download, no music downloads or JS errors');
    await plain.context.close();

    const mock = await setup(true), m = mock.page;
    await m.goto(base + '/reports/toy-harness.html');
    await m.waitForFunction(() => window.toyTest?.toySnapshot().supported.share);
    await m.getByAltText('后室生存报告卡片').waitFor();
    await m.getByRole('button', { name: '分享到 B站' }).click();
    await m.waitForFunction(() => window.sdkCalls.some(c => c[0] === 'share'));
    await m.getByRole('button', { name: '保存到相册' }).click();
    await m.waitForFunction(() => window.sdkCalls.some(c => c[0] === 'save'));
    assert.ok(await m.evaluate(() => window.sdkCalls.find(c => c[0] === 'save')[1] < 2_000_000));
    const sharedPath = await m.evaluate(() => window.sdkCalls.find(c => c[0] === 'share')[1].path);
    assert.ok(sharedPath.startsWith('index.html?report='));
    checks.push('mock SDK: report shares a relative path; generated PNG fits 2MB base64 target');
    const parsing = await m.evaluate(() => {
      const t = window.toyTest;
      const s = { v: 1, outcome: 'dead', level: 'L0', cause: 'test', seconds: 10, kills: 0, tapes: 0, steps: 3, seed: 5 };
      return [t.readReport(t.reportPath(s).replace('index.html',''))?.seed === 5, t.readReport('?report=%7B') === null, t.readReport('?report='+encodeURIComponent(JSON.stringify({...s,seconds:-1}))) === null, t.validRoomCode('../x') === null, t.validRoomCode('ab23') === 'AB23', t.invitationPath('AB23') === 'index.html?room=AB23'];
    });
    assert.ok(parsing.every(Boolean));
    await m.evaluate(() => window.toyTest.enterToyGame());
    await m.waitForFunction(() => window.toyTest.toySnapshot().container.immersive);
    assert.equal(await m.evaluate(() => document.documentElement.style.getPropertyValue('--toy-safe-left')), '22px');
    await m.evaluate(() => { window.sdkNoChange = true; window.toyTest.requestToyMode({ orientation: 'portrait', immersive: false }); });
    await m.getByText('尚未确认横屏或沉浸模式，请手动横屏游玩。').waitFor({ timeout: 7000 });
    checks.push('mock SDK: safe area/viewport applied, confirmed mode change, no false success on missing callback, invalid links rejected');
    await m.getByRole('button', { name: '关闭报告', exact: true }).click();
    await m.getByRole('button', { name: '加入房间', exact: true }).click();
    await m.getByText(/模拟房间已关闭/).waitFor();
    await m.getByRole('button', { name: '创建房间（我是房主）' }).click();
    await m.getByRole('button', { name: '分享到 B站' }).click();
    await m.waitForFunction(() => window.sdkCalls.some(c => c[0] === 'share' && c[1].path === 'index.html?room=AB23'));
    await m.getByRole('button', { name: '显示二维码' }).click();
    await m.getByAltText('打开后室 Toy 的二维码').waitFor();
    await m.evaluate(() => { window.sdkFail = true; });
    await m.getByRole('button', { name: '分享到 B站' }).click();
    await m.getByText('操作未完成，可重试或复制链接。').waitFor();
    await m.evaluate(() => { const a=window.toyTest.audio;a.resume();a.setBgmStyle('midi');a.startBGM(0);a.playMusicianSong('rock_stones');a.previewPlay('l0'); });
    assert.equal(await m.evaluate(() => window.toyTest.audio.midiEnabled), false);
    assert.deepEqual(mock.requests, []); assert.deepEqual(mock.errors, []);
    checks.push('mock lobby: closed room error, host invitation/QR path, share rejection, forced procedural audio without network');
    const containerTest = await setup(true), c = containerTest.page;
    await c.goto(base + '/dist/index.html');
    await c.getByRole('button', { name: /横屏沉浸游玩/ }).click();
    await c.waitForFunction(() => !document.querySelector('.br-app')?.inert && window.sdkState.orientation === 'landscape');
    assert.equal(await c.evaluate(() => document.documentElement.style.getPropertyValue('--toy-safe-left')), '22px');
    await c.evaluate(() => { window.sdkState = { ...window.sdkState, orientation: 'portrait' }; window.sdkListener(window.sdkState); });
    await c.getByRole('button', { name: /无视，竖屏游玩/ }).click();
    await c.waitForFunction(() => !document.querySelector('.br-app')?.inert);
    assert.deepEqual(containerTest.errors, []);
    checks.push('production: new portrait notice respects Toy orientation and allows immersive entry or ignore');
    await containerTest.context.close();
    // Open the generated shared report in the actual production page.
    const landing = await setup(false);
    await landing.page.goto(base + '/dist/' + sharedPath);
    await landing.page.getByText('这是玩家分享的记录，仅供展示，不会覆盖你的存档。').waitFor();
    await landing.page.getByRole('button', { name: '进入游戏首页' }).click();
    assert.equal(new URL(landing.page.url()).searchParams.has('report'), false);
    checks.push('production: report landing displays shared data and returns to title without loading a save');
    console.log(JSON.stringify({ passed: true, checks }, null, 2));
    fs.writeFileSync(path.join(root, 'reports/toy-verification.json'), JSON.stringify({ passed: true, checks, realBilibiliClientTested: false }, null, 2));
  } finally { await Promise.all(contexts.map(c => c.close().catch(() => {}))); await browser.close(); }
})().catch(e => { fs.writeFileSync(path.join(root,'reports/toy-verification.json'), JSON.stringify({passed:false,checks,error:String(e)},null,2)); console.error(e); process.exitCode=1; });
