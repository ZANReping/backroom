// [l5map] L5 楼层导览图实机截图（改自 verify-casino-game）（真实游戏 119 层）：nohup node scripts/verify-casino-game.mjs > .cache/casino-game.log 2>&1 &
// 同 verify-jazz-game 的启动（L5 存档 → 继续游戏 → casinoEnter 推门进 119，?cpu=1）；vite 3509 / CDP 9510 / 浏览器目录 .cache/l5map-qa-game（跑前删）。
// 只开一个浏览器，结束按 pid 杀。输出 reports/casino/game/*.png + verify-result.json；拼图由 scripts/casino-stage4-sheet.py 出 stage4.jpg。
import { spawn } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
const port = '9510', out = 'reports/l5map/game/', base = 'http://127.0.0.1:3509'
mkdirSync(out, { recursive: true })
const up = async () => { try { return (await fetch(base + '/index.html')).ok } catch { return false } }
let vite = null
if (!(await up())) { vite = spawn('npx', ['vite', '--port', '3509', '--strictPort', '--host', '127.0.0.1'], { stdio: 'ignore', detached: true }); for (let i = 0; i < 160 && !(await up()); i++) await new Promise((r) => setTimeout(r, 500)) }
const chrome = spawn('/workspace/work/.pw-libs/chromium.sh', ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${process.cwd()}/.cache/l5map-qa-game`, '--enable-automation', '--no-first-run', '--no-default-browser-check', '--disable-gpu-sandbox', '--no-sandbox', '--enable-unsafe-swiftshader', '--use-angle=swiftshader', 'about:blank'], { stdio: 'ignore' })
console.log('chrome pid', chrome.pid, 'vite pid', vite?.pid)
writeFileSync(out + 'pids.json', JSON.stringify({ chrome: chrome.pid, vite: vite?.pid ?? null }))
const errors = [], results = {}
try {
  let page
  for (let i = 0; i < 80 && !page; i++) { await new Promise((r) => setTimeout(r, 250)); try { page = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find((p) => p.type === 'page') } catch { /* */ } }
  if (!page) throw Error('QA 浏览器未启动')
  const ws = new WebSocket(page.webSocketDebuggerUrl); await new Promise((r) => ws.addEventListener('open', r, { once: true }))
  let seq = 0; const pending = new Map()
  ws.addEventListener('message', (e) => { const r = JSON.parse(e.data); if (r.method === 'Runtime.exceptionThrown') { errors.push(r.params.exceptionDetails); console.log('EXC', JSON.stringify(r.params.exceptionDetails).slice(0, 600)) }; const p = pending.get(r.id); if (p) { pending.delete(r.id); r.error ? p.reject(r.error) : p.resolve(r.result) } })
  const send = (method, params = {}) => new Promise((resolve, reject) => { const id = ++seq; pending.set(id, { resolve, reject }); ws.send(JSON.stringify({ id, method, params })) })
  const ev = async (expression, awaitPromise = true) => { const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise }); if (r.exceptionDetails) console.log('EVAL', JSON.stringify(r.exceptionDetails).slice(0, 400)); return r.result?.value }
  await send('Runtime.enable'); await send('Page.enable')
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  const waitFor = async (expr, label, tries = 900) => { for (let i = 0; i < tries; i++) { if (await ev(`Boolean(${expr})`, false)) return; await sleep(300) } throw Error('超时：' + label) }
  const soft = async (expr, tries) => { for (let i = 0; i < tries; i++) { if (await ev(`Boolean(${expr})`, false)) return true; await sleep(300) } return false }
  const shot = async (name) => { writeFileSync(out + name + '.png', Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).data, 'base64')); console.log('shot', name, new Date().toISOString().slice(11, 19)) }
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 760, deviceScaleFactor: 1, mobile: false })
  const init = await send('Page.addScriptToEvaluateOnNewDocument', { source: `localStorage.clear();sessionStorage.clear();localStorage.setItem('br_settings',JSON.stringify({renderResolution:'native',renderScale:100,maxPixelRatio:1,dynamicRes:false,lightMode:'full',sceneLightLimit:16,shadowQuality:1,lightShadows:1,loadingBudgetMs:200,devMode:false}))` })
  await send('Page.navigate', { url: base + '/?cpu=1' })
  await waitFor('window.__engine && document.querySelector(".title-menu")', 'title'); console.log('title ok')
  await send('Page.removeScriptToEvaluateOnNewDocument', { identifier: init.identifier })
  await ev(`(()=>{const raw=__engine.snapshot();localStorage.setItem('br_save_slot1',JSON.stringify({...raw,seed:800,level:5,mapSeed:800,savedAt:Date.now(),player:{...raw.player,level:5}}))})()`, false)
  await send('Page.reload')
  await waitFor(`window.__engine && document.querySelector(".title-menu")`, 'title2')
  for (let i = 0; i < 60; i++) {
    if (await ev('__engine.player.level===5 && !__engine.paused', false)) break
    await ev(`(()=>{const b=[...document.querySelectorAll('.menu-btn')].find(b=>b.textContent.includes('继续游戏'));b&&b.click()})()`, false)
    await sleep(1500)
    await ev(`(()=>{const b=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='继续');b&&b.click()})()`, false)
    await sleep(3000)
  }
  await waitFor('__engine.player.level===5 && !__engine.paused', 'in L5'); console.log('in L5')

  const MAPm = `(await import('/src/game/content/l5Map.ts'))`, HUDm = `(await import('/src/game/engine/hud.ts'))`
  const key = async (code, k) => { await send('Input.dispatchKeyEvent', { type: 'keyDown', code, key: k }); await send('Input.dispatchKeyEvent', { type: 'keyUp', code, key: k }) }
  const prep = async (r = 26) => ev(`(async()=>{const M=${MAPm};const H=${HUDm};const e=__engine;e.dev.god=true;e.dev.statLock=true;H.unlockAllHud(e);const m=e.map,px=Math.floor(e.player.x),py=Math.floor(e.player.y);for(let y=Math.max(0,py-${r});y<Math.min(m.h,py+${r});y++)for(let x=Math.max(0,px-${r});x<Math.min(m.w,px+${r});x++)e.explored[y*m.w+x]=1;M.recordL5Map(e);M.flushL5Map(e);if(!e.hotelBook.floors.includes(e.hotel.floor))e.hotelBook.floors.push(e.hotel.floor);return M.pageKeyOf(e)})()`)
  const floor = async (f) => { await ev(`(()=>{const e=__engine;e.hotel.floor=${f};e.arriveElevator=true;e.transition={anim:'shutter',t:0,dest:5};e.emit({kind:'transition',anim:'shutter',dest:5});return 1})()`, false); await sleep(1500); await waitFor(`__engine.player.level===5 && !__engine.transition && __engine.hotel.floor===${f}`, 'floor ' + f, 600); await soft('__renderer.isNearWorldReady(__engine)', 200); await soft(`!document.body.innerText.includes('正在准备')`, 300); await sleep(3000); console.log('exits', await ev(`JSON.stringify(__engine.map.exits.map(x=>x.def.kind))+' l5Floor='+__engine.map.l5Floor`, false)) }
  const mkey = () => ev(`(()=>{window.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyM',key:'m',bubbles:true}));window.dispatchEvent(new KeyboardEvent('keyup',{code:'KeyM',key:'m',bubbles:true}));return 1})()`, false)
  const openMap = async () => { await mkey(); await sleep(1800); const r = await ev(`(()=>({map:Boolean(document.querySelector('[data-l5-bigmap]')),txt:(document.querySelector('[data-l5-map]')||document.querySelector('.hud-panel'))?.textContent?.slice(0,80)}))()`, false); console.log('openMap', JSON.stringify(r)); if (!r?.map) { await key('KeyM', 'm'); await sleep(1800); console.log('openMap2', await ev(`Boolean(document.querySelector('[data-l5-bigmap]'))`, false)) } }
  const closeMap = async () => { if (await ev(`Boolean(document.querySelector('[data-l5-bigmap]'))`, false)) await mkey(); await sleep(900) }
  const legend = async (want) => ev(`(()=>{const a=document.querySelector('[data-l5-legend]');if(!a)return 'none';if((a.dataset.l5Legend==='open')!==${want})a.querySelector('button').click();return 1})()`, false)
  const stats = async (n) => { results[n] = await ev(`(()=>{const c=document.querySelector('[data-l5-bigmap]');const mm=document.querySelector('[data-l5-minimap]');return {page:c?.dataset.page,stats:c?.dataset.stats,mini:mm?.dataset.redraws,floor:__engine.hotel.floor,level:__engine.player.level}})()`, false); console.log(n, JSON.stringify(results[n])) }
  if (!process.env.ONLY_CASINO) {
  // 1F：HUD 小地图
  console.log('prep', await prep(28)); await sleep(2500)
  await shot('1-hud'); await stats('1-hud')
  // 1F 大地图（大堂层）+ 图例展开
  await openMap(); await legend(true); await sleep(800); await shot('2-1f-legend'); await stats('2-1f-legend')
  // 低理智
  await ev(`(()=>{__engine.dev.statLock=false;__engine.player.sanity=12;__engine.dev.statLock=true;return 1})()`, false); await sleep(1200)
  await shot('3-lowsan'); await stats('3-lowsan'); await closeMap(); await sleep(1500); await shot('3b-lowsan-hud')
  await ev(`(()=>{__engine.dev.statLock=false;__engine.player.sanity=90;__engine.dev.statLock=true;return 1})()`, false)
  // 2F 客房层：房卡绑定一扇门 → 我的房间高亮
  await floor(2); console.log('prep2', await prep(34))
  console.log('card', await ev(`(async()=>{const M=${MAPm};const e=__engine;const pg=M.l5MapPage(e,'f2');const d=[...pg.pois.values()].filter(p=>p.k==='guestDoor'&&p.n).sort((a,b)=>Math.hypot(a.x-e.player.x-e.map.inf.ox,a.y-e.player.y-e.map.inf.oy)-Math.hypot(b.x-e.player.x-e.map.inf.ox,b.y-e.player.y-e.map.inf.oy))[0];if(!d)return null;e.hotel.objs={...(e.hotel.objs??{v:1,smashed:[],locker:[],dieCd:0,hallu:0,receipt:0}),card:{no:d.n,floor:2,dx:1,dy:1}};if(!e.countItem('roomcard'))e.addItem('roomcard');return d.n})()`))
  await openMap(); await legend(false); await sleep(800); await shot('4-2f'); await stats('4-2f'); await closeMap()
  // B1
  await floor(0); console.log('prepB1', await prep(40))
  await openMap(); await legend(false); await sleep(800); await shot('5-b1'); await stats('5-b1'); await closeMap()
  }
  // 赌场
  const CAm = `(await import('/src/game/engine/casinoAI.ts'))`
  console.log('enter', await ev(`(async()=>{const C=${CAm};const e=__engine;e.map.entities=[];for(let t=0;t<1440;t+=5){if(C.casinoPhase(e.seed,t).open&&C.casinoPhase(e.seed,t).left>600){e.time=t;break}}return C.casinoEnter(e)})()`))
  await waitFor('__engine.player.level===119 && !__engine.transition', 'in 119', 1200); await soft('__renderer.isNearWorldReady(__engine)', 300); await soft(`!document.body.innerText.includes('正在准备')`, 300); await sleep(3000)
  await prep(10); await sleep(6000); await soft(`!document.body.innerText.includes('正在准备')`, 300); await shot('6-casino-hud')
  await openMap(); await legend(true); await sleep(3000); await shot('7-casino'); await stats('7-casino'); await closeMap()
  // 手机竖屏：紧凑大地图（图例可点开）
  await send('Emulation.setDeviceMetricsOverride', { width: 844, height: 390, deviceScaleFactor: 1, mobile: true }); await sleep(1500)
  results.mobile = await ev(`Boolean(document.querySelector('[data-l5-minimap]'))`, false)
  await shot('8-mobile')
} catch (err) { console.log('ERR', err?.message ?? err); errors.push(String(err?.message ?? err)) }
finally {
  writeFileSync(out + 'verify-result.json', JSON.stringify({ results, errors: errors.length }, null, 1))
  try { process.kill(chrome.pid, 'SIGKILL') } catch { /* */ }
  if (vite) try { process.kill(-vite.pid, 'SIGKILL') } catch { /* */ }
  console.log('done'); process.exit(0)
}
