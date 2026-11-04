// [beast] 第五层的野兽（Entity 18）阶段 3 实机截图：node scripts/verify-beast-game.mjs
// 与 verify-concierge-game.mjs 同一套启动（L5 存档 → 继续游戏，入口 ?cpu=1：无头 SwiftShader 不能画 GPU 蒙皮），但用自己的 vite 端口 3503 / CDP 9503 / 浏览器目录 .cache/beast-qa-game。
// 跑前删 .cache/beast-qa-game；跑时别改 src；同时只开一个浏览器（结束时按 pid 杀）。输出 reports/beast/game/<B_SHEET 前缀>*.png + verify-result.json。
// 顺序：余光（摆在视线 40°）→ 正视 vanish → 关注度满：熄灯 → 背后缠抓 → 拖进办公室 → 强签界面 → 握手 → 办公室全景（活画像）→ 倒茶 → 契约界面 → 推契约递笔 → 握手 → 动手 = 怀疑：doubtFreeze → reveal → 缠抓。
import { spawn } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
const port = process.env.VM_QA_CDP ?? '9503', out = 'reports/beast/game/', pre = process.env.B_SHEET ?? ''
const base = process.env.VM_QA_URL ?? 'http://127.0.0.1:3503'
mkdirSync(out, { recursive: true })
const up = async () => { try { return (await fetch(base + '/proto-l5hotel.html')).ok } catch { return false } }
let vite = null
if (!(await up())) {
  vite = spawn('npx', ['vite', '--port', '3503', '--strictPort', '--host', '127.0.0.1'], { stdio: 'ignore', detached: true, env: { ...process.env, L0_VERIFY: '1' } })
  for (let i = 0; i < 160 && !(await up()); i++) await new Promise((r) => setTimeout(r, 500))
}
const chrome = spawn(process.env.CHROME ?? '/workspace/work/.pw-libs/chromium.sh', ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${process.cwd()}/.cache/beast-qa-game`, '--enable-automation', '--no-first-run', '--no-default-browser-check', '--disable-gpu-sandbox', '--no-sandbox', '--enable-unsafe-swiftshader', '--use-angle=swiftshader', 'about:blank'], { stdio: 'ignore' })
console.log('chrome pid', chrome.pid, 'vite pid', vite?.pid)
const errors = [], results = {}
try {
  let page
  for (let i = 0; i < 80 && !page; i++) { await new Promise((r) => setTimeout(r, 250)); try { page = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find((p) => p.type === 'page') } catch { /* 等浏览器起来 */ } }
  if (!page) throw Error('QA 浏览器未启动')
  const ws = new WebSocket(page.webSocketDebuggerUrl); await new Promise((r) => ws.addEventListener('open', r, { once: true }))
  let seq = 0; const pending = new Map()
  ws.addEventListener('message', (e) => { const r = JSON.parse(e.data); if (r.method === 'Runtime.exceptionThrown') { errors.push(r.params.exceptionDetails); console.log('EXC', JSON.stringify(r.params.exceptionDetails).slice(0, 600)) }; if (r.method === 'Runtime.consoleAPICalled' && r.params.type === 'error') errors.push(r.params.args?.map((a) => a.value ?? a.description).join(' ')); const p = pending.get(r.id); if (p) { pending.delete(r.id); r.error ? p.reject(r.error) : p.resolve(r.result) } })
  const send = (method, params = {}) => new Promise((resolve, reject) => { const id = ++seq; pending.set(id, { resolve, reject }); ws.send(JSON.stringify({ id, method, params })) })
  const ev = async (expression, awaitPromise = false) => { const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise }); return r.result?.value }
  await send('Runtime.enable'); await send('Page.enable')
  const ver = await send('Browser.getVersion'), cl = await send('Browser.getBrowserCommandLine')
  if (!ver.userAgent.includes('HeadlessChrome') || !cl.arguments.includes('--headless=new')) throw Error('不是本脚本的无头 QA 浏览器')
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  const waitFor = async (expr, label, tries = 900) => { for (let i = 0; i < tries; i++) { if (await ev(`Boolean(${expr})`)) return; await sleep(300) } throw Error('超时：' + label) }
  const soft = async (expr, tries) => { for (let i = 0; i < tries; i++) { if (await ev(`Boolean(${expr})`)) return true; await sleep(300) } return false }
  const shot = async (name) => { writeFileSync(out + pre + name + '.png', Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).data, 'base64')); console.log('shot', name, new Date().toISOString().slice(11, 19)) }
  const st = async () => ev(`(()=>{const b=__engine.map.entities.find(x=>x.def.type==='beast');return {lv:__engine.player.level,mode:b?.bst?.mode,clip:b?.bst?.clip,t:b?.bst?.modeT,pend:b?.presentationPending,ov:!!document.querySelector('[data-beast-deal]'),sub:document.querySelector('[data-beast-sub]')?.textContent}})()`)
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 760, deviceScaleFactor: 1, mobile: false })
  const init = await send('Page.addScriptToEvaluateOnNewDocument', { source: `localStorage.clear();sessionStorage.clear();localStorage.setItem('br_settings',JSON.stringify({renderResolution:'native',renderScale:100,maxPixelRatio:1,dynamicRes:false,lightMode:'full',sceneLightLimit:16,shadowQuality:1,lightShadows:1,loadingBudgetMs:200,devMode:false}))` })
  await send('Page.navigate', { url: base + '/?cpu=1' })
  console.log('nav'); await waitFor('window.__engine && document.querySelector(".title-menu")', 'title'); console.log('title ok')
  await send('Page.removeScriptToEvaluateOnNewDocument', { identifier: init.identifier })
  await ev(`(()=>{const raw=__engine.snapshot();localStorage.setItem('br_save_slot1',JSON.stringify({...raw,seed:515151,level:5,mapSeed:515151,savedAt:Date.now(),player:{...raw.player,level:5}}))})()`)
  await send('Page.reload')
  await waitFor(`window.__engine && document.querySelector(".title-menu")`, 'title2')
  // 继续游戏 → 继续（菜单可能还没就绪：反复点直到进了 L5）
  for (let i = 0; i < 60; i++) {
    if (await ev('__engine.player.level===5 && !__engine.paused')) break
    await ev(`(()=>{const b=[...document.querySelectorAll('.menu-btn')].find(b=>b.textContent.includes('继续游戏'));b&&b.click()})()`)
    await sleep(1500)
    await ev(`(()=>{const b=[...document.querySelectorAll('.hud-panel button')].find(b=>b.textContent.includes('继续'))||[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='继续');b&&b.click()})()`)
    await sleep(3000)
  }
  await waitFor('__engine.player.level===5 && !__engine.paused', 'in L5')
  console.log('in L5')
  await ev(`(()=>{__renderer.chunkBudgetMs=250;const e=__engine;e.dev.god=true;e.dev.statLock=false;e.introT=0;e.map.entities=e.map.entities.filter(x=>x.def.type==='beast');return 1})()`)
  console.log('near', await soft('__renderer.isNearWorldReady(__engine)', 300))
  await sleep(3000)
  // ---- 余光：摆在视线 40°、9 m（找一个两侧开阔的朝向）----
  results.peri = await ev(`(async()=>{const A=await import('/src/game/engine/beastAI.ts');A.BE.periLife=999;A.BE.periLost=999;const e=__engine,P=e.player;e.hotel.attn=60;
    for(let k=0;k<64;k++){const f=k*Math.PI/32;P.facing=f;__look.yaw=-f-Math.PI/2;__look.pitch=0.02;for(const s of [1,-1]){const a=f+s*0.7,d=9,x=P.x+Math.cos(a)*d,y=P.y+Math.sin(a)*d;const m=e.map;if(e.entityWalkH(m,Math.floor(x),Math.floor(y),0)!==null&&e.los(P.x,P.y,x,y)){const g=A.beastSpawnPeripheral(e,{x,y});window.__bst=g;return {f,x,y,s}}}}return null})()`, true)
  console.log('peri', JSON.stringify(results.peri))
  console.log('warm', await soft('window.__bst && __renderer.entityMeshes.get(window.__bst.id) && !window.__bst.presentationPending', 600))
  await sleep(2500); await shot('peri'); console.log(JSON.stringify(await st()))
  // SwiftShader + CPU 蒙皮下帧率很低（游戏 dt 每帧有上限，片段要跑很久）：下面直接把 AI 的 modeT 拨到要看的时刻（渲染层非循环片段的时间就是 modeT），等几帧再截
  const B = `__engine.map.entities.find(x=>x.def.type==='beast')`
  const setT = (t) => ev(`(()=>{const b=${B};if(b&&b.bst){b.bst.modeT=${t};return b.bst.mode}return null})()`)
  const waitMode = (m, tries = 300) => soft(`(()=>{const b=${B};return b&&b.bst&&b.bst.mode==='${m}'&&!b.presentationPending})()`, tries)
  const frames = (ms = 4500) => sleep(ms)
  // ---- 正视 → vanish ----
  await ev(`(()=>{const e=__engine,P=e.player,g=window.__bst;P.facing=Math.atan2(g.y-P.y,g.x-P.x);__look.yaw=-P.facing-Math.PI/2;return 1})()`)
  await waitMode('vanish', 60); await setT(1.15); await frames(); await shot('vanish'); console.log(JSON.stringify(await st()))
  await setT(2.39); await sleep(3000)
  // ---- 关注度满：熄灯 → 背后缠抓 ----
  await ev(`(async()=>{const H=await import('/src/game/engine/l5Hotel.ts');const A=await import('/src/game/engine/beastAI.ts');H.hotelAddAttn(__engine,200);const r=A.beastDebug(__engine);if(r.pun)r.pun.t=0.8;return !!r.pun})()`, true)
  await frames(3500); await shot('blackout'); console.log(JSON.stringify(await st()))
  await ev(`(async()=>{const A=await import('/src/game/engine/beastAI.ts');const r=A.beastDebug(__engine);if(r.pun&&r.pun.phase==='black')r.pun.t=A.BE.blackLen;return 1})()`, true)
  console.log('grab ready', await waitMode('grab', 300))
  await setT(1.65); await frames(); await shot('grab'); console.log(JSON.stringify(await st()))
  await setT(3.59)
  // ---- 拖进办公室 → 强签 ----
  await waitFor(`__engine.player.level===117 && !__engine.transition`, 'office', 900)
  console.log('office near', await soft('__renderer.isNearWorldReady(__engine)', 200))
  await soft(`document.querySelector('[data-beast-deal=forced]')`, 100)
  await frames(3000); await shot('forced'); console.log(JSON.stringify(await st()))
  await ev(`(()=>{const c=document.querySelector('[data-beast-harsh=mind]');c&&c.click();return !!c})()`)
  // 站到书桌前
  await ev(`(()=>{const e=__engine,P=e.player,b=${B};P.x=b.x+Math.cos(b.facing)*1.55;P.y=b.y+Math.sin(b.facing)*1.55;P.facing=Math.atan2(b.y-P.y,b.x-P.x);__look.yaw=-P.facing-Math.PI/2;__look.pitch=-0.12;return 1})()`)
  console.log('lod0', await waitMode('sign', 300))
  await setT(3.7); await frames(); await shot('sign-forced')
  await setT(6.39); await waitMode('shake', 60); await setT(1.7); await frames(); await shot('shake'); console.log(JSON.stringify(await st()))
  await setT(3.59); await waitMode('seat', 60)
  // ---- 办公室全景（活画像）----
  await ev(`(()=>{const e=__engine,P=e.player,b=${B};P.x=b.x+Math.cos(b.facing)*3.6+0.6;P.y=b.y+Math.sin(b.facing)*3.6;P.facing=Math.atan2(b.y-0.4-P.y,b.x-P.x);__look.yaw=-P.facing-Math.PI/2;__look.pitch=0.1;return 1})()`)
  await frames(6000); await shot('office')
  // ---- 谈生意：倒茶 → 契约界面 ----
  await ev(`(()=>{const e=__engine,P=e.player,b=${B};P.x=b.x+Math.cos(b.facing)*1.55;P.y=b.y+Math.sin(b.facing)*1.55;P.facing=Math.atan2(b.y-P.y,b.x-P.x);__look.yaw=-P.facing-Math.PI/2;__look.pitch=-0.18;e.specialPressed=true;return 1})()`)
  await waitMode('tea', 100); await setT(3.5); await frames(); await shot('tea'); console.log(JSON.stringify(await st()))
  await setT(6.99)
  await soft(`document.querySelector('[data-beast-deal=offer]')`, 200)
  await frames(2500); await shot('deal')
  await ev(`(()=>{const c=document.querySelector('[data-beast-offer=calm]');c&&c.click();return !!c})()`)
  await ev(`(()=>{__look.pitch=-0.12;return 1})()`)
  await waitMode('sign', 60); await setT(4.5); await frames(); await shot('sign')
  await setT(6.39); await waitMode('shake', 60); await setT(1.7); await frames(); await shot('shake2'); console.log(JSON.stringify(await st()))
  await setT(3.59); await waitMode('seat', 60)
  // ---- 动手 = 怀疑：doubtFreeze → colorFlash → reveal → 缠抓 ----
  await ev(`(async()=>{const A=await import('/src/game/engine/beastAI.ts');const e=__engine,b=${B};A.beastSave(e).strikes=0;b.hp-=10;A.beastKillGuard(e,b);__look.pitch=0.05;return 1})()`, true)
  await waitMode('doubt', 60); await setT(1.9); await frames(); await shot('doubt')
  await setT(4.39); await waitMode('flash', 60); await setT(1.0); await frames(); await shot('flash')
  await setT(2.39); await waitMode('reveal', 60); await setT(3.0); await frames(); await shot('reveal')
  await setT(3.59); await waitMode('grab', 60); await setT(1.6); await frames(); await shot('grab-office'); console.log(JSON.stringify(await st()))
  await setT(3.59)
  await soft(`document.querySelector('[data-beast-deal=forced]')`, 100)
  await frames(2500); await shot('forced2')
  results.final = await st()
  await send('Browser.close').catch(() => {})
  ws.close()
} catch (err) { console.log('ERR', String(err)); results.err = String(err) } finally {
  writeFileSync(out + pre + 'verify-result.json', JSON.stringify({ results, errors }, null, 2) + '\n')
  try { chrome.kill('SIGKILL') } catch { /* 已退出 */ }
  if (vite) { try { process.kill(-vite.pid, 'SIGTERM') } catch { /* 已退出 */ } }
  if (errors.length) console.log('浏览器错误：', JSON.stringify(errors).slice(0, 3000))
  process.exit(0)
}
