// [bellhop] 行李员（Entity 135）阶段 3 实机截图：node scripts/verify-bellhop-game.mjs [game-watch game-turn]
// 与 verify-concierge-game.mjs 同一套启动（L5 存档 → 继续游戏，入口 ?cpu=1）。在玩家正前方的走廊里放下行李员（bellhopAI.spawnBellhop），
// game-watch = 看着他（stillWatch）；game-turn = 他背对你、头拧过来、换了一张脸（模拟你移开视线再看回来）。
// 跑前删 .cache/l5-qa-game；跑时别改 src；同时只开一个浏览器。输出 reports/bellhop/game-*.png。
import { spawn } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
const port = process.env.VM_QA_CDP ?? '9499', out = 'reports/bellhop/'
const base = process.env.VM_QA_URL ?? 'http://127.0.0.1:3498'
mkdirSync(out, { recursive: true })
const want = process.argv.slice(2).length ? process.argv.slice(2) : ['game-watch', 'game-turn']
const up = async () => { try { return (await fetch(base + '/proto-l5hotel.html')).ok } catch { return false } }
let vite = null
if (!(await up())) {
  vite = spawn('npx', ['vite', '--port', '3498', '--strictPort', '--host', '127.0.0.1'], { stdio: 'ignore', detached: true, env: { ...process.env, L0_VERIFY: '1' } })
  for (let i = 0; i < 120 && !(await up()); i++) await new Promise((r) => setTimeout(r, 500))
}
const chrome = spawn(process.env.CHROME ?? '/workspace/work/.pw-libs/chromium.sh', ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${process.cwd()}/.cache/l5-qa-game`, '--enable-automation', '--no-first-run', '--no-default-browser-check', '--disable-gpu-sandbox', '--no-sandbox', '--enable-unsafe-swiftshader', '--use-angle=swiftshader', 'about:blank'], { stdio: 'ignore' })
console.log('chrome pid', chrome.pid, 'vite pid', vite?.pid)
const errors = [], results = {}
try {
  let page
  for (let i = 0; i < 60 && !page; i++) { await new Promise((r) => setTimeout(r, 250)); try { page = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find((p) => p.type === 'page') } catch { /* 等浏览器起来 */ } }
  if (!page) throw Error('QA 浏览器未启动')
  const ws = new WebSocket(page.webSocketDebuggerUrl); await new Promise((r) => ws.addEventListener('open', r, { once: true }))
  let seq = 0; const pending = new Map()
  ws.addEventListener('message', (e) => { const r = JSON.parse(e.data); if (r.method === 'Runtime.exceptionThrown') { errors.push(r.params.exceptionDetails); console.log('EXC', JSON.stringify(r.params.exceptionDetails).slice(0, 800)) }; const p = pending.get(r.id); if (p) { pending.delete(r.id); r.error ? p.reject(r.error) : p.resolve(r.result) } })
  const send = (method, params = {}) => new Promise((resolve, reject) => { const id = ++seq; pending.set(id, { resolve, reject }); ws.send(JSON.stringify({ id, method, params })) })
  const ev = async (expression, awaitPromise = false) => { const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise }); return r.result?.value }
  await send('Runtime.enable'); await send('Page.enable')
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  const waitFor = async (expr, label, tries = 900) => { for (let i = 0; i < tries; i++) { if (await ev(`Boolean(${expr})`)) return; await sleep(300) } throw Error('超时：' + label) }
  const soft = async (expr, tries) => { for (let i = 0; i < tries; i++) { if (await ev(`Boolean(${expr})`)) return true; await sleep(300) } return false }
  const shot = async (name) => { writeFileSync(out + name + '.png', Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).data, 'base64')); console.log('shot', name, new Date().toISOString()) }
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 760, deviceScaleFactor: 1, mobile: false })
  const init = await send('Page.addScriptToEvaluateOnNewDocument', { source: `localStorage.clear();sessionStorage.clear();localStorage.setItem('br_settings',JSON.stringify({renderResolution:'native',renderScale:100,maxPixelRatio:1,dynamicRes:false,lightMode:'full',sceneLightLimit:16,shadowQuality:1,lightShadows:1,loadingBudgetMs:200,devMode:false}))` })
  await send('Page.navigate', { url: base + '/?cpu=1' })
  console.log('nav', new Date().toISOString()); await waitFor('window.__engine && document.querySelector(".title-menu")', 'title'); console.log('title ok')
  await send('Page.removeScriptToEvaluateOnNewDocument', { identifier: init.identifier })
  await ev(`(()=>{const raw=__engine.snapshot();localStorage.setItem('br_save_slot1',JSON.stringify({...raw,seed:515151,level:5,mapSeed:515151,savedAt:Date.now(),player:{...raw.player,level:5}}))})()`)
  await send('Page.reload')
  await waitFor(`window.__engine && document.querySelector(".title-menu")`, 'title2')
  await sleep(1500)
  await ev(`(()=>{const b=[...document.querySelectorAll('.menu-btn')].find(b=>b.textContent.includes('继续游戏'));b&&b.click()})()`)
  await sleep(1500)
  await ev(`(()=>{const b=[...document.querySelectorAll('.hud-panel button')].find(b=>b.textContent.includes('继续'));b&&b.click()})()`)
  await waitFor('__engine.player.level===5 && !__engine.paused', 'in L5')
  console.log('in L5', new Date().toISOString(), await ev('location.search'))
  await ev(`(()=>{__renderer.chunkBudgetMs=250;const e=__engine;e.dev.god=true;e.dev.statLock=true;e.introT=0;return 1})()`)
  console.log('floor', await ev('__engine.hotel.floor'))
  // 在玩家视线方向上找 4.5 m 处的可站点，放下行李员（面朝玩家）
  const aim = await ev(`(async()=>{const B=await import('/src/game/engine/bellhopAI.ts');const e=__engine,P=e.player,m=e.map;e.dev.frozenAI=true;
    for(const x of m.entities.filter(q=>q.def.type==='bellhop'))m.entities.splice(m.entities.indexOf(x),1);
    let best=null;for(let i=0;i<48&&!best;i++){const a=i/48*Math.PI*2;let ok=true;for(let d=0.6;d<=5.2;d+=0.3){const x=P.x+Math.cos(a)*d,y=P.y+Math.sin(a)*d;if(e.entityWalkH(m,Math.floor(x),Math.floor(y),0)===null){ok=false;break}}if(ok)best=a}
    if(best===null)return null;const bx=P.x+Math.cos(best)*4.5,by=P.y+Math.sin(best)*4.5;const b=B.spawnBellhop(e,{x:bx,y:by,f:best+Math.PI});
    P.facing=best;__look.yaw=-P.facing-Math.PI/2;__look.pitch=0.06;const s=B.ensureBellhop(b);s.mode='still';s.clip='stillWatch';s.seq++;s.face=0;s.headYaw=0;return {bx,by,best,id:b.id}})()`, true)
  console.log('aim', JSON.stringify(aim))
  if (!aim) throw Error('找不到放行李员的位置')
  console.log('bh', await soft(`(()=>{const e=__engine.map.entities.find(x=>x.def.type==='bellhop');return e&&__renderer.entityMeshes.get(e.id)&&!e.presentationPending})()`, 900))
  console.log('ready', await soft('__renderer.isNearWorldReady(__engine)', 400))
  await sleep(6000)
  results.probe = await ev(`(()=>{const e=__engine.map.entities.find(x=>x.def.type==='bellhop');const g=e&&__renderer.entityMeshes.get(e.id);return e&&{x:e.x,y:e.y,mode:e.bh&&e.bh.mode,clip:e.bh&&e.bh.clip,face:e.bh&&e.bh.face,lod0:!!(g&&g.userData.lod0&&g.userData.lod0.visible),P:[__engine.player.x,__engine.player.y]}})()`)
  console.log('probe', JSON.stringify(results.probe))
  for (const name of want) {
    if (name === 'game-watch') { await shot(name); continue }
    if (name === 'game-turn') {
      await ev(`(()=>{const e=__engine,b=e.map.entities.find(x=>x.def.type==='bellhop');const s=b.bh;b.facing+=Math.PI-0.25;s.headYaw=Math.PI-0.25;s.face=3;s.clip='idle';s.seq++;setTimeout(()=>{s.clip='stillWatch';s.seq++},400);return 1})()`)
      await sleep(4000); await shot(name)
    }
  }
  await send('Browser.close').catch(() => {})
  ws.close()
} catch (err) { console.log('ERR', String(err)); results.err = String(err) } finally {
  writeFileSync(out + 'game-result.json', JSON.stringify({ results, errors }, null, 2) + '\n')
  try { chrome.kill('SIGKILL') } catch { /* 已退出 */ }
  if (vite) { try { process.kill(-vite.pid, 'SIGTERM') } catch { /* 已退出 */ } }
  console.log('done', new Date().toISOString())
  process.exit(0)
}
