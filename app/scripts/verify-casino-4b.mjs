// [casino] Level 5.1 阶段 4b 实机截图（入座、实体牌局，不暂停）：setsid nohup node scripts/verify-casino-4b.mjs > .cache/casino-4b.log 2>&1 &
// 同 verify-jazz-game 的启动（L5 存档 → 继续游戏 → casinoEnter 推门进 119，?cpu=1）；vite 3509 / CDP 9510 / 浏览器目录 .cache/casino-qa-4b（跑前删）。
// 只开一个浏览器，结束按 pid 杀。输出 reports/casino/game4b/*.png + verify-result.json；拼图由 scripts/casino-stage4-sheet.py 出 stage4.jpg。
import { spawn } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
// 参数 --exchange：只拍兑换台虚拟 UI 菜单（按交互键打开）→ reports/casino/exchange-ui.jpg
const EX = process.argv.includes('--exchange')
const port = '9510', out = 'reports/casino/game4b/', base = 'http://127.0.0.1:3509'
mkdirSync(out, { recursive: true })
const up = async () => { try { return (await fetch(base + '/index.html')).ok } catch { return false } }
let vite = null
if (!(await up())) { vite = spawn('npx', ['vite', '--port', '3509', '--strictPort', '--host', '127.0.0.1', '--force'], { stdio: 'ignore', detached: true }); for (let i = 0; i < 160 && !(await up()); i++) await new Promise((r) => setTimeout(r, 500)) }
const chrome = spawn('/workspace/work/.pw-libs/chromium.sh', ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${process.cwd()}/.cache/casino-qa-4b`, '--enable-automation', '--no-first-run', '--no-default-browser-check', '--disable-gpu-sandbox', '--no-sandbox', '--enable-unsafe-swiftshader', '--use-angle=swiftshader', 'about:blank'], { stdio: 'ignore' })
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
  await cam(X(24), Y(12.2), X(20), Y(2.5), -0.08); await sleep(EX ? 8000 : 20000)
  // 兑换台：走到柜台西侧，按交互键（specialPressed = X，同一个入口 casinoPress）→ CasinoMenu cashier 覆盖层
  const exUi = async (file) => {
    await cam(X(47.6), Y(30.5), X(54.3), Y(30.5), 0.0)
    await ev(`(async()=>{const e=__engine;for(let i=0;i<3;i++)e.addItem('almond');e.specialPressed=true;return 1})()`)
    const opened = await soft(`document.querySelector('[data-casino-menu="cashier"]')`, 60)
    await sleep(1500)
    const c0 = await ev(`(async()=>{const C=${CAm};return C.casinoSave(__engine).chips})()`)
    await ev(`(()=>{const b=[...document.querySelectorAll('.cm-row')].find(b=>b.textContent.includes('杏仁')&&!b.disabled)||[...document.querySelectorAll('.cm-row')].find(b=>!b.disabled);b&&b.click();return b?b.textContent:null})()`, false); await sleep(1200)
    const r = await ev(`(async()=>{const C=${CAm};const S=${STm};const v=document.querySelector('[data-casino-menu]');const rc=v?.getBoundingClientRect();return {opened:${opened},cls:v?.className,w:rc?.width,h:rc?.height,x:rc?.left,y:rc?.top,vw:innerWidth,vh:innerHeight,paused:__engine.paused,seat:!!C.casinoSeat(__engine),rows:document.querySelectorAll('.cm-row').length,heads:[...document.querySelectorAll('.cm-h')].map(h=>h.textContent),chips0:${c0},chips:C.casinoSave(__engine).chips,louie:S.staffBy(__engine,'louie')?.clip,line:C.casinoMenu(__engine)?.line}})()`)
    writeFileSync(file, Buffer.from((await send('Page.captureScreenshot', { format: 'jpeg', quality: 86 })).data, 'base64')); console.log('shot', file)
    return r
  }
  if (EX) { results.exchange = await exUi('reports/casino/exchange-ui.jpg'); console.log('exchange', JSON.stringify(results.exchange)); throw 'EXDONE' }
  const SHm = `(await import('/src/game/engine/casinoShow.ts'))`, LYm = `(await import('/src/game/content/casinoLayout.ts'))`
  // 走到最近的那台 / 张前「入座」（与按 X 同一个入口：casinoOpenMenu + 就座锚点）
  const seat = (kind, mode, nx, ny, table = '') => ev(`(async()=>{const C=${CAm};const SH=${SHm};const L=${LYm}.casinoLayout();const e=__engine;const ps=L.props.filter(p=>p.kind==='${kind}').sort((a,b)=>Math.hypot(a.x-${nx},a.y-${ny})-Math.hypot(b.x-${nx},b.y-${ny}));const p=ps[0];const sk={slot:'slot',blackjack:'bj',roulette:'rou',craps:'dice'}['${kind}'];e.player.x=p.x+Math.cos(p.rot)*1.3;e.player.y=p.y+Math.sin(p.rot)*1.3;C.casinoOpenMenu(e,'${mode}','${table}',SH.seatAt(sk,p.x,p.y,p.rot));return [p.x,p.y,p.rot]})()`)
  // 无头 SwiftShader 帧率很低（每帧 dt 有上限），过渡按帧推进：等 blend 真到 1 / 起身真结束再拍
  const waitSeat = async () => { for (let i = 0; i < 200; i++) { if (await ev(`(async()=>{const C=${CAm};const v=C.casinoSeatView(__engine);return !!v&&v.seat.blend>=1})()`)) return; await sleep(300) } console.log('WARN seat blend timeout') }
  const waitStand = async () => { for (let i = 0; i < 200; i++) { if (await ev(`(async()=>{const C=${CAm};return !C.casinoSeatView(__engine)})()`)) return; await sleep(300) } console.log('WARN stand timeout') }
  const stand = async () => { await ev(`(async()=>{const C=${CAm};C.casinoStand(__engine,true);return 1})()`); await waitStand() }
  const run = (js) => ev(`(async()=>{const C=${CAm};const e=__engine;${js};return 1})()`)
  const pitch = (p, dy = 0) => ev(`(()=>{__look.pitch=${p};__look.yaw+=${dy};return 1})()`, false)
  const frames = async (pref, n, gap) => { for (let i = 0; i < n; i++) { writeFileSync(out + pref + String(i).padStart(2, '0') + '.jpg', Buffer.from((await send('Page.captureScreenshot', { format: 'jpeg', quality: 70 })).data, 'base64')); await sleep(gap) } }
  const idle = async (max = 240) => { for (let i = 0; i < max; i++) { if (!(await ev(`(async()=>{const C=${CAm};return C.casinoBusy(__engine)})()`))) return; await sleep(500) } }
  const view = () => ev(`(async()=>{const C=${CAm};const v=C.casinoSeatView(__engine);const s=v?.show?.s;return {paused:__engine.paused,seat:v?.seat.a.kind,blend:v?.seat.blend,t:v?.show?.t,res:s?.syms??s?.n??s?.d,deal:v?.deal.map(c=>[c.who,c.c.r,c.c.s]),chips:C.casinoSave(__engine).chips,shown:C.casinoShownChips(__engine)}})()`)
  await run(`C.casinoSave(e).chips+=400;C.casinoSave(e).ledger.exIn+=400;C.casinoSave(e).plays=99`)
  // 1 老虎机
  await seat('slot', 'slot', X(8.4), Y(12.9)); await waitSeat(); await sleep(2500); await pitch(0.02)
  await run(`C.casinoSlot(e,5)`); await frames('gs', 9, 0)
  await idle(); await sleep(1500); await shot('a-slot'); results.slot = await view(); console.log('slot', JSON.stringify(results.slot))
  await stand(); await sleep(1500)
  // 2 21 点（Billy）
  await seat('blackjack', 'bj', X(19.6), Y(1.7), 'billy'); await waitSeat(); await sleep(2500); await pitch(-0.42)
  await run(`C.casinoBjDeal(e,10)`); await idle(); await sleep(1000); await shot('b-bj'); results.bj = await view(); console.log('bj', JSON.stringify(results.bj))
  await run(`C.casinoBjStand(e)`); await sleep(1500); await stand(); await sleep(1500)
  // 3 轮盘（准星放筹码 → 转）
  await seat('roulette', 'rou', X(19.7), Y(14)); await waitSeat(); await sleep(2500); await pitch(-0.38)
  await run(`C.casinoRoulette(e,'red',0,10)`); await frames('gr', 9, 0)
  await idle(); await pitch(-0.5); await sleep(800); await shot('c-rou'); results.rou = await view(); console.log('rou', JSON.stringify(results.rou))
  // 7 送酒（同一张轮盘桌）
  await run(`const m=C.casinoMenu(e);m.drinkOffer=1`); await sleep(5000); await run(`C.casinoDrink(e,true)`); await sleep(650); await shot('g-drink'); results.drink = await view()
  await sleep(1500); await stand(); await sleep(1500)
  // 4 骰宝
  await seat('craps', 'dice', X(19.6), Y(19.6)); await waitSeat(); await sleep(2500); await pitch(-0.55)
  await run(`C.casinoDice(e,'big',1,10)`); await frames('gd', 7, 0)
  await idle(); await shot('d-dice'); results.dice = await view(); console.log('dice', JSON.stringify(results.dice))
  await stand(); await sleep(1500)
  // 5 兑换台（虚拟 UI 菜单，不入座）
  results.cashier = await exUi(out + 'e-cashier.jpg'); await close(); await sleep(1500)
  // 8 负数拦门（补光后）
  await ev(`(async()=>{const C=${CAm};const S=${STm};const e=__engine;const s=C.casinoSave(e);s.pchip=1;s.purple=-50;s.chips=0;const L=${LYm}.casinoLayout();for(const a of S.staffList(e)){if(a.who==='louie'||a.who==='prosthetic'||a.role==='门口保安'){const k=a.who==='louie'?0:a.who==='prosthetic'?-1.1:1.1;a.x=L.door.x+k;a.y=L.door.y-2.0;a.path=[]}}return 1})()`)
  await cam(X(26), Y(31.0), X(26), Y(36), -0.02); await sleep(6000); await shot('h-block')
  // 9 无竖线：不暂停的就座画面 + 暂停（Esc）画面
  await shot('i-live')
  await ev(`(()=>{window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',code:'Escape',bubbles:true}));return 1})()`, false); await sleep(3000); await shot('j-pause'); results.pause = await ev('__engine.paused', false)
  await ev(`(()=>{window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',code:'Escape',bubbles:true}));return 1})()`, false); await sleep(2000)
  // 6 野兽对桌
  await ev(`(async()=>{const C=${CAm};const s=C.casinoSave(__engine);s.purple=-205;C.startBeast(__engine,true);C.casinoBeastDeal(__engine);return 1})()`)
  await waitSeat(); await sleep(2500); await pitch(-0.12); await sleep(6000); await shot('f-beast'); results.beast = await view(); console.log('beast', JSON.stringify(results.beast))
  // 10 结局画面（4b 后唯一还用覆盖层的画面）：遮罩应铺满全屏，左右两半亮度一致（竖线根因 = 类名 cm-rou / cm-dice / cm-ending 与内容块 max-width 规则重名）
  await ev(`(async()=>{const C=${CAm};C.casinoOpenMenu(__engine,'ending');return 1})()`); await sleep(3000); await shot('k-ending')
  results.veil = await ev(`(()=>{const v=document.querySelector('[data-casino-menu]');if(!v)return null;const r=v.getBoundingClientRect();return {cls:v.className,w:r.width,h:r.height,vw:innerWidth,vh:innerHeight}})()`, false); console.log('veil', JSON.stringify(results.veil))
} catch (err) { if (err === 'EXDONE') { /* --exchange 完成 */ } else { console.log('ERR', err?.message ?? err); errors.push(String(err?.message ?? err)) } }
writeFileSync(out + (EX ? 'verify-exchange.json' : 'verify-result.json'), JSON.stringify({ results, errors: errors.slice(0, 20) }, null, 1))
try { process.kill(chrome.pid, 'SIGKILL') } catch { /* */ }
if (vite) try { process.kill(-vite.pid, 'SIGKILL') } catch { try { process.kill(vite.pid, 'SIGKILL') } catch { /* */ } }
console.log('done')
process.exit(0)
