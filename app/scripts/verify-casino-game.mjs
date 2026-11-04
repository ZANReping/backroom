// [casino] Level 5.1 阶段 4 实机截图（真实游戏 119 层）：nohup node scripts/verify-casino-game.mjs > .cache/casino-game.log 2>&1 &
// 同 verify-jazz-game 的启动（L5 存档 → 继续游戏 → casinoEnter 推门进 119，?cpu=1）；vite 3509 / CDP 9510 / 浏览器目录 .cache/casino-qa-game（跑前删）。
// 只开一个浏览器，结束按 pid 杀。输出 reports/casino/game/*.png + verify-result.json；拼图由 scripts/casino-stage4-sheet.py 出 stage4.jpg。
import { spawn } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
const port = '9510', out = 'reports/casino/game/', base = 'http://127.0.0.1:3509'
mkdirSync(out, { recursive: true })
const up = async () => { try { return (await fetch(base + '/index.html')).ok } catch { return false } }
let vite = null
if (!(await up())) { vite = spawn('npx', ['vite', '--port', '3509', '--strictPort', '--host', '127.0.0.1'], { stdio: 'ignore', detached: true }); for (let i = 0; i < 160 && !(await up()); i++) await new Promise((r) => setTimeout(r, 500)) }
const chrome = spawn('/workspace/work/.pw-libs/chromium.sh', ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${process.cwd()}/.cache/casino-qa-game`, '--enable-automation', '--no-first-run', '--no-default-browser-check', '--disable-gpu-sandbox', '--no-sandbox', '--enable-unsafe-swiftshader', '--use-angle=swiftshader', 'about:blank'], { stdio: 'ignore' })
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
  const CAm = `(await import('/src/game/engine/casinoAI.ts'))`, STm = `(await import('/src/game/engine/casinoStaff.ts'))`
  // 拨到营业 → 推门
  console.log('enter', await ev(`(async()=>{const C=${CAm};const e=__engine;e.dev.god=true;e.dev.statLock=true;e.map.entities=[];for(let t=0;t<1440;t+=5){if(C.casinoPhase(e.seed,t).open&&C.casinoPhase(e.seed,t).left>600){e.time=t;break}}return C.casinoEnter(e)})()`))
  await waitFor('__engine.player.level===119 && !__engine.transition', 'in 119', 1200); console.log('in 119')
  await soft('__renderer.isNearWorldReady(__engine)', 400)
  const cam = async (x, y, tx, ty, pitch = -0.05) => { await ev(`(()=>{const P=__engine.player;P.x=${x};P.y=${y};P.z=0;P.facing=Math.atan2((${ty})-(${y}),(${tx})-(${x}));__look.yaw=-P.facing-Math.PI/2;__look.pitch=${pitch};return 1})()`, false); await sleep(1200) }
  const st = () => ev(`(async()=>{const S=${STm};const R=(await import('/src/game/renderer/casinoStaffRender.ts')).casinoStaffRenderStats();return {staff:S.staffList(__engine).map(a=>[a.who,a.state,a.clip]),render:R,menu:document.querySelector('[data-casino-menu]')?.getAttribute('data-casino-menu'),hud:document.querySelector('[data-casino-hud]')?.textContent?.slice(0,80)}})()`)
  const snap = async (name, ms = 5000) => { await sleep(ms); await shot(name); const s = await st(); results[name] = s; console.log(name, JSON.stringify(s).slice(0, 300)) }
  const menu = (js) => ev(`(async()=>{const C=${CAm};const e=__engine;${js};return C.casinoMenu(e)?.mode})()`)
  const close = () => ev(`(async()=>{const C=${CAm};C.casinoCloseMenu(__engine,true);document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}));return 1})()`)
  const X = (v) => 3 + v, Y = (v) => 3 + v
  // 让员工全部建好 LOD（每帧最多建 1 个）
  await cam(X(24), Y(12.2), X(20), Y(2.5), -0.08); await sleep(20000)
  await snap('1-staff', 3000)
  await cam(X(45.6), Y(30.5), X(51.3), Y(30.5), -0.05); await sleep(8000)
  await menu(`for(let i=0;i<3;i++)e.addItem('almond');e.addItem('babelbalm');C.casinoOpenMenu(e,'cashier');C.casinoSell(e,'almond');C.casinoSell(e,'babelbalm')`)
  await snap('2-cashier', 2500); await close()
  await cam(X(8.4), Y(11.6), X(8.4), Y(12.9)); await menu(`C.casinoSave(e).chips+=200;C.casinoOpenMenu(e,'slot');for(let i=0;i<4;i++){C.casinoSlot(e,1);const m=C.casinoMenu(e);m.drinkOffer=undefined;m.invite=undefined}`)
  await snap('3-slot', 2500); await close()
  await cam(X(19.6), Y(4.6), X(19.6), Y(1.7), -0.15); await menu(`C.casinoOpenMenu(e,'bj','billy');C.casinoBjDeal(e,10)`)
  await snap('4-blackjack', 2500); await menu(`C.casinoBjStand(e)`); await close()
  await cam(X(19.7), Y(16.2), X(19.7), Y(14)); await menu(`C.casinoOpenMenu(e,'rou');C.casinoRoulette(e,'red',0,10)`)
  await snap('5-roulette', 2500); await close()
  await cam(X(19.6), Y(21.6), X(19.6), Y(19.6)); await menu(`C.casinoOpenMenu(e,'dice');C.casinoDice(e,'big',1,10)`)
  await snap('6-dice', 2500); await close()
  await cam(X(38.4), Y(8.6), X(44.8), Y(8.6)); await menu(`const s=C.casinoSave(e);s.addict=62;s.again=3;s.drunkT=0;C.casinoOpenMenu(e,'rou');const m=C.casinoMenu(e);m.drinkOffer=1;m.line='连输三把。一位侍应端着托盘停在你身边：「酒保送您的，免费。」'`)
  await snap('7-drink-addict', 2500); await menu(`C.casinoDrink(e,true)`); await close()
  // 负数拦门：紫筹码 −50，员工直接摆到门口
  await ev(`(async()=>{const C=${CAm};const S=${STm};const e=__engine;const s=C.casinoSave(e);s.pchip=1;s.purple=-50;s.chips=0;const L=(await import('/src/game/content/casinoLayout.ts')).casinoLayout();for(const a of S.staffList(e)){if(a.who==='louie'||a.who==='prosthetic'||a.role==='门口保安'){const k=a.who==='louie'?0:a.who==='prosthetic'?-1.1:1.1;a.x=L.door.x+k;a.y=L.door.y-1.3;a.path=[];a.state='block'}}return 1})()`)
  await cam(X(26), Y(31.2), X(26), Y(36), -0.02); await sleep(2500)
  await snap('8-block', 4000)
  // 野兽挑战
  await ev(`(async()=>{const C=${CAm};const s=C.casinoSave(__engine);s.purple=-205;C.startBeast(__engine,true);C.casinoBeastDeal(__engine);return 1})()`)
  await ev(`(()=>{__look.yaw=0;__look.pitch=-0.1;return 1})()`, false)
  await snap('9-beast', 9000)
  await menu(`const m=C.casinoMenu(e);m.mode='ending'`)
  await snap('9b-ending', 2500)
} catch (err) { console.log('ERR', err?.message ?? err); errors.push(String(err?.message ?? err)) }
writeFileSync(out + 'verify-result.json', JSON.stringify({ results, errors: errors.slice(0, 20) }, null, 1))
try { process.kill(chrome.pid, 'SIGKILL') } catch { /* */ }
if (vite) try { process.kill(-vite.pid, 'SIGKILL') } catch { try { process.kill(vite.pid, 'SIGKILL') } catch { /* */ } }
console.log('done')
process.exit(0)
