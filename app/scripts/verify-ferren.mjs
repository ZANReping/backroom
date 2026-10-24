// [ferren] Ferren（Entity 92）重制·阶段 1：无头 Chromium 截图验收（proto-ferren.html）。用法：node scripts/verify-ferren.mjs [视图名...]
// 输出 reports/ferren/*.png 与汇总图 stage1.jpg（ImageMagick montage）。同时只开一个浏览器；端口 3494。
import { spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
const port = process.env.FER_QA_CDP ?? '9494', out = 'reports/ferren/'
let base = process.env.FER_QA_URL ?? 'http://127.0.0.1:3494'
mkdirSync(out, { recursive: true })
const P = (q, w = 1200, h = 900) => ['/proto-ferren.html?' + q, w, h]
const VIEWS = {
  'front': P('view=front'),
  'side': P('view=side', 1400, 800),
  'three': P('view=three'),
  'top': P('view=top', 1000, 1000),
  'head': P('view=head', 1000, 900),
  'nest': P('view=nest'),
  'nest-back': P('view=nest&back=1'),
  'ref': P('view=ref', 1400, 820),
  'back': P('view=back'),
  'neck': P('view=neck', 1000, 900),
  'neckside': P('view=neckside', 1000, 900),
}
// 阶段 2 动画：anim-<片段>（16 帧 4 列检查图）、gif-<片段>（24 帧 6 列，scripts/faceling-gif.py 切帧合成 stage2.gif）
const CLIPS = ['idle', 'walk', 'run', 'wardance', 'sniff', 'stand', 'sleep', 'eat', 'pet', 'stretch', 'noclip', 'roll']
const A = (clip, frames = 16, cols = 4, ex = '') => ['/proto-ferren.html?anim=1&clip=' + clip + '&frames=' + frames + '&cols=' + cols + ex, cols * 360, Math.ceil(frames / cols) * 300 + 30]
for (const c of CLIPS) VIEWS['anim-' + c] = A(c)
for (const c of CLIPS) VIEWS['gif-' + c] = A(c, 24, 6)
VIEWS['anim-sleep-top'] = A('sleep', 4, 4, '&view=nestTop'); VIEWS['anim-sleep-close'] = A('sleep', 2, 2, '&view=nestClose', ); VIEWS['anim-sleep-close2'] = A('sleep', 2, 2, '&view=nestClose2'); VIEWS['anim-sleep-side'] = A('sleep', 4, 4, '&view=side')
VIEWS['anim-walk-q'] = A('walk', 8, 4, '&view=q'); VIEWS['anim-run-q'] = A('run', 8, 4, '&view=q'); VIEWS['anim-stand-side'] = A('stand', 8, 4, '&view=side'); VIEWS['anim-roll-side'] = A('roll', 8, 4, '&view=side')
// 阶段 3 机制视图：proto-ferren-mech.html 里跑真实 Engine + 商人之家地图 + ferrenAI，用游戏的结构/渲染接入画出来
const M = (mech, w = 1200, h = 900) => ['/proto-ferren-mech.html?mech=' + mech, w, h]
VIEWS['mech-sleep'] = M('sleep'); VIEWS['mech-eat'] = M('eat'); VIEWS['mech-play'] = M('play'); VIEWS['mech-noclip'] = M('noclip', 1500, 900)
const SHEET3 = ['mech-sleep', 'mech-eat', 'mech-play', 'mech-noclip']
// 游戏内视图：真实游戏（标题 → 继续游戏 → 商人之家存档）里走到雪貂笼前截图；game-* 走 gameShots()（一次进游戏连拍三张）
VIEWS['game-sleep'] = ['/', 1280, 800]; VIEWS['game-eat'] = ['/', 1280, 800]; VIEWS['game-noclip'] = ['/', 1280, 800]
const GAME = ['game-sleep', 'game-eat', 'game-noclip']
const SHEET = ['three', 'side', 'front', 'top', 'head', 'nest']
const SHEET_NAME = process.env.FER_SHEET ?? 'stage1.jpg' // 汇总图文件名（阶段 1 修正版用 FER_SHEET=stage1-fix.jpg）
const want = process.argv.slice(2).length ? process.argv.slice(2).flatMap((a) => a.endsWith('*') ? Object.keys(VIEWS).filter((k) => k.startsWith(a.slice(0, -1))) : [a]) : Object.keys(VIEWS).filter((k) => !k.startsWith('anim-') && !k.startsWith('gif-'))
const up = async () => { try { return (await fetch(base + '/proto-ferren.html')).ok } catch { return false } }
let vite = null
if (!(await up())) {
  vite = spawn('npx', ['vite', '--port', '3494', '--strictPort', '--host', '127.0.0.1'], { stdio: 'ignore', detached: true, env: { ...process.env, L0_VERIFY: '1' } })
  for (let i = 0; i < 120 && !(await up()); i++) await new Promise((r) => setTimeout(r, 500))
}
const chrome = spawn(process.env.CHROME ?? '/workspace/work/.pw-libs/chromium.sh', ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${process.cwd()}/.cache/fer-qa`, '--enable-automation', '--no-first-run', '--no-default-browser-check', '--disable-gpu-sandbox', '--no-sandbox', '--enable-unsafe-swiftshader', '--use-angle=swiftshader', 'about:blank'], { stdio: 'ignore' })
const errors = [], results = {}
try {
  let page
  for (let i = 0; i < 60 && !page; i++) { await new Promise((r) => setTimeout(r, 250)); try { page = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find((p) => p.type === 'page') } catch { /* 等浏览器起来 */ } }
  if (!page) throw Error('QA 浏览器未启动')
  const ws = new WebSocket(page.webSocketDebuggerUrl); await new Promise((r) => ws.addEventListener('open', r, { once: true }))
  let seq = 0; const pending = new Map()
  ws.addEventListener('message', (e) => { const r = JSON.parse(e.data); if (r.method === 'Runtime.exceptionThrown') { errors.push(r.params.exceptionDetails); console.log('EXC', JSON.stringify(r.params.exceptionDetails).slice(0, 800)) }; if (r.method === 'Runtime.consoleAPICalled' && r.params.type === 'error') errors.push(r.params.args?.map((a) => a.value ?? a.description).join(' ')); const p = pending.get(r.id); if (p) { pending.delete(r.id); r.error ? p.reject(r.error) : p.resolve(r.result) } })
  const send = (method, params = {}) => new Promise((resolve, reject) => { const id = ++seq; pending.set(id, { resolve, reject }); ws.send(JSON.stringify({ id, method, params })) })
  const ev = async (expression) => { const r = await send('Runtime.evaluate', { expression, returnByValue: true }); return r.result?.value }
  await send('Runtime.enable'); await send('Page.enable')
  const ver = await send('Browser.getVersion'), cl = await send('Browser.getBrowserCommandLine')
  if (!ver.userAgent.includes('HeadlessChrome') || !cl.arguments.includes('--headless=new')) throw Error('不是本脚本的无头 QA 浏览器')
  const until = async (expr, label, ms = 180000) => { const t0 = Date.now(); for (;;) { try { if (await ev(`Boolean(${expr})`)) return } catch { /* 页面切换中 */ } if (Date.now() - t0 > ms) throw Error('超时：' + label); await new Promise((r) => setTimeout(r, 300)) } }
  const evA = async (expression) => { const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw Error(JSON.stringify(r.exceptionDetails).slice(0, 600)); return r.result?.value }
  const shoot = async (name) => writeFileSync(out + name + '.png', Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).data, 'base64'))
  /** 游戏内：写一个停在商人之家的存档 → 标题「继续游戏」→ 槽 1 → 传送到笼前，按 AI 时段拍睡觉 / 进食 / 切行带人 */
  async function gameShots(names) {
    await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false })
    const init = await send('Page.addScriptToEvaluateOnNewDocument', { source: `localStorage.clear();sessionStorage.clear();localStorage.setItem('br_settings',JSON.stringify({renderResolution:'native',renderScale:100,maxPixelRatio:1,dynamicRes:false,dynamicExposure:false,lightMode:'classic',textureQuality:1,sceneLightLimit:12,shadowQuality:1,loadingBudgetMs:8,chunkBudgetMs:4,devMode:true,muted:true,grain:false,shake:false}))` })
    await send('Page.navigate', { url: base + '/' })
    // vite 依赖扫描失败时首次加载会边加载边重新优化依赖（同一个包两份 ?v= → 「入口连接失败」）：等它优化完再刷新，最多 4 次
    for (let k = 0; k < 4; k++) {
      const t0 = Date.now(); let st = ''
      while (Date.now() - t0 < 120000) { st = await ev(`document.querySelector('.title-menu')&&window.__engine?'ok':document.body.innerText.includes('入口连接失败')?'fail':''`).catch(() => ''); if (st) break; await new Promise((r) => setTimeout(r, 500)) }
      if (st === 'ok') break
      console.log('游戏入口加载失败，等依赖优化后刷新（' + (k + 1) + '）'); await new Promise((r) => setTimeout(r, 6000)); await send('Page.reload')
    }
    await until(`window.__engine && document.querySelector('.title-menu')`, '标题界面', 240000)
    await send('Page.removeScriptToEvaluateOnNewDocument', { identifier: init.identifier })
    await evA(`(async()=>{const {snapshot}=await import('/src/game/engine/save.ts');const s=snapshot(__engine);localStorage.setItem('br_save_slot1',JSON.stringify({...s,seed:424242,level:102,mapSeed:424242,bntgLayout:4,savedAt:Date.now(),ferren:{clock:3*1200+900,tuck:null,petGain:0,petCycle:0,petCd:0},player:{...s.player,level:102,x:335.2,y:153.2,z:0,floor:0}}))})()`)
    await send('Page.reload'); await until(`document.querySelector('.title-menu')`, '存档标题', 240000)
    await new Promise((r) => setTimeout(r, 1500))
    await evA(`(()=>{const b=[...document.querySelectorAll('.menu-btn')].find(b=>b.textContent.includes('继续游戏'));if(!b)throw Error('没有继续游戏');b.click()})()`)
    await new Promise((r) => setTimeout(r, 800))
    await evA(`(()=>{const b=[...document.querySelectorAll('.hud-panel button')].find(b=>b.textContent.trim()==='继续'&&b.parentElement.textContent.includes('存档槽 1'));if(b)b.click()})()`)
    await until(`__engine.player.level===102 && !__engine.paused && __renderer.isNearWorldReady(__engine)`, '进入商人之家', 300000)
    await evA(`(()=>{const e=__engine;e.dev.god=true;e.dev.statLock=true;e.handsStowed=true;[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='▾')?.click()})()`)
    const keyX = async () => { await send('Input.dispatchKeyEvent', { type: 'keyDown', code: 'KeyX', key: 'x', windowsVirtualKeyCode: 88 }); await new Promise((r) => setTimeout(r, 250)); await send('Input.dispatchKeyEvent', { type: 'keyUp', code: 'KeyX', key: 'x', windowsVirtualKeyCode: 88 }) }
    const F = `await import('/src/game/engine/ferrenAI.ts')`
    const at = async (x, y, tx, ty, pitch) => {
      await evA(`(async()=>{const {devMapTeleport}=await import('/src/game/engine/devMap.ts');await devMapTeleport(__engine,{x:${x},y:${y},floor:0});const dx=${tx}-${x},dy=${ty}-${y};__look.yaw=Math.atan2(-dx,-dy);__look.pitch=${pitch};return true})()`)
      // 笼子附近已经流式加载过：近景就绪最多等 40 s（软件渲染下这个标志偶尔迟迟不翻），之后照常截图
      await until(`__renderer.isNearWorldReady(__engine)`, '近景就绪', 40000).catch(() => console.log('近景就绪等待超时，继续'))
      await new Promise((r) => setTimeout(r, 1500))
    }
    const fer = `__engine.map.entities.find(e=>e.def.type==='ferren'&&!e.dead)`
    const setPhase = (kind, at, idx = 0) => `(async()=>{const F=${F};const ph=F.FERREN_SCHEDULE.filter(p=>p.kind==='${kind}')[${idx}];const [a,b]=F.phaseSeconds(ph);__engine.ferrenRun.clock=4*1200+a+(b-a)*${at};return true})()`
    const info = {}
    if (names.includes('game-sleep')) {
      await evA(setPhase('sleep', 0.3)); await evA(`(()=>{const f=${fer};f.x=334.8;f.y=150.1;return true})()`)
      await until(`${fer}?.fr?.act==='nestSleep'`, '回窝睡觉', 60000)
      await at(335.9, 152.1, 334.8, 150.2, -0.42)
      await evA(`(()=>{const f=${fer};__engine.player.x=f.x+0.6;__engine.player.y=f.y+1.1;return true})()`)
      await new Promise((r) => setTimeout(r, 400))
      info.sleepAction = await evA(`(async()=>{const {specialAction}=await import('/src/game/engine/special.ts');return specialAction(__engine)?.label})()`)
      await keyX() // 真实按键：App 的 keydown → engine.specialHeld → ferrenAI 取上升沿
      await new Promise((r) => setTimeout(r, 1200))
      info.sleep = await evA(`({tuck:__engine.ferrenRun.tuck,hint:document.querySelector('[data-ferren-hint]')?.textContent,bntg:__engine.rep.bntg,d:Math.hypot(__engine.player.x-${fer}.x,__engine.player.y-${fer}.y),inNest:${fer}.fr.inNest,overlay:document.activeElement?.tagName})`)
      console.log('sleep', JSON.stringify(info))
      await shoot('game-sleep')
    }
    if (names.includes('game-eat')) {
      await evA(setPhase('meal', 0.1, 2))
      await until(`${fer}?.fr?.act==='eat'`, '去食盆', 60000)
      await at(336.3, 151.75, 337.1, 150.25, -0.62); await new Promise((r) => setTimeout(r, 600))
      info.eat = await evA(`({hint:document.querySelector('[data-ferren-hint]')?.textContent,clip:${fer}.fr.clip})`)
      await shoot('game-eat')
    }
    if (names.includes('game-noclip')) {
      await evA(setPhase('play', 0.3)); await evA(`(async()=>{const F=${F};F.FR.SPONT_RATE=0;return true})()`)
      await new Promise((r) => setTimeout(r, 1500))
      await at(336.3, 148.4, 336, 150.6, -0.35)
      await evA(`(async()=>{const F=${F};const f=${fer};f.x=336;f.y=148.9;f.fr.act='idle';f.fr.actT=5;f.fr.spontCd=0;__engine.player.x=336.3;__engine.player.y=148.45;F.FR.SPONT_RATE=1e6;await new Promise(r=>setTimeout(r,120));F.FR.SPONT_RATE=0;return !!f.fr.noclip})()`)
      await until(`__engine.ferrenRun.flash>0.75`, '切行闪白', 20000)
      info.noclipPre = await evA(`({flash:__engine.ferrenRun.flash,t:${fer}?.fr?.noclip?.t})`)
      await shoot('game-noclip-flash')
      await until(`${fer}?.fr?.noclip?.done && __engine.ferrenRun.flash<0.3`, '换位后', 20000)
      await new Promise((r) => setTimeout(r, 250))
      info.noclip = await evA(`(()=>{const f=${fer};return {carried:__engine.ferrenRun.carried,ferren:[f.x,f.y],player:[__engine.player.x,__engine.player.y],flash:__engine.ferrenRun.flash,msg:document.body.innerText.includes('切行')}})()`)
      await evA(`(()=>{const f=${fer};const dx=f.x-__engine.player.x,dy=f.y-__engine.player.y;__look.yaw=Math.atan2(-dx,-dy);__look.pitch=-0.55;return true})()`)
      await new Promise((r) => setTimeout(r, 700))
      await shoot('game-noclip')
    }
    results.game = info
    console.log('game', JSON.stringify(info))
  }
  const gameWant = want.filter((n) => GAME.includes(n))
  if (gameWant.length) await gameShots(gameWant)
  for (const name of want.filter((n) => !GAME.includes(n))) {
    const [path, w, h] = VIEWS[name]
    await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false })
    await send('Page.navigate', { url: base + path })
    let ok = false
    for (let i = 0; i < 500 && !ok; i++) { await new Promise((r) => setTimeout(r, 200)); ok = !!(await ev(`location.href===${JSON.stringify(base + path)} && window.__ready===true`)) }
    await new Promise((r) => setTimeout(r, 400))
    results[name] = { ready: ok, retries: await ev('window.__retries'), budget: await ev('window.__budget'), info: await ev('window.__info') }
    writeFileSync(out + name + '.png', Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).data, 'base64'))
    console.log(name, JSON.stringify(results[name]))
  }
  await send('Browser.close').catch(() => {})
  ws.close()
} finally {
  // 与上次结果合并（分批运行时保留其它视图的记录；本次运行的视图覆盖旧值、错误只记本次）
  let prev = {}
  try { if (existsSync(out + 'verify-result.json')) prev = JSON.parse(readFileSync(out + 'verify-result.json', 'utf8')).results ?? {} } catch { /* 旧文件损坏则忽略 */ }
  writeFileSync(out + 'verify-result.json', JSON.stringify({ results: { ...prev, ...results }, errors }, null, 2) + '\n')
  try { chrome.kill('SIGKILL') } catch { /* 已退出 */ }
  if (vite) { try { process.kill(-vite.pid, 'SIGTERM') } catch { /* 已退出 */ } }
  if (errors.length) console.log('浏览器错误：', JSON.stringify(errors).slice(0, 3000))
}
// 阶段 3 汇总图：2×2 拼版（FER_SHEET3 改名）
if (want.some((n) => SHEET3.includes(n)) && SHEET3.every((n) => existsSync(out + n + '.png'))) {
  const name = process.env.FER_SHEET3 ?? 'stage3.jpg'
  const r = spawnSync('montage', [...SHEET3.map((n) => out + n + '.png'), '-resize', '960x720^', '-gravity', 'center', '-extent', '960x720', '-tile', '2x2', '-geometry', '+4+4', '-background', '#0c0b0a', '-quality', '88', out + name], { stdio: 'inherit' })
  console.log(name, r.status === 0 ? 'ok' : 'montage 失败 ' + r.status)
}
// 汇总图：3×2 拼版
if (want.some((n) => SHEET.includes(n)) && SHEET.every((n) => existsSync(out + n + '.png'))) {
  const r = spawnSync('montage', [...SHEET.map((n) => out + n + '.png'), '-resize', '800x600^', '-gravity', 'center', '-extent', '800x600', '-tile', '3x2', '-geometry', '+4+4', '-background', '#0c0b0a', '-quality', '88', out + SHEET_NAME], { stdio: 'inherit' })
  console.log(SHEET_NAME, r.status === 0 ? 'ok' : 'montage 失败 ' + r.status)
}
