// [spokes] 迎宾女郎（Entity 28）阶段 3 实机截图：nohup node scripts/verify-spokes-game.mjs &（整段跑约 10–20 分钟，SwiftShader + CPU 蒙皮）
// 与 verify-beast-game.mjs 同一套启动（L5 存档 → 继续游戏，入口 ?cpu=1），自己的 vite 端口 3505 / CDP 9505 / 浏览器目录 .cache/spokes-qa-game。
// 跑前删 .cache/spokes-qa-game；跑时别改 src；同时只开一个浏览器（结束时按 pid 杀）。输出 reports/spokes/game/<S_SHEET 前缀>*.png + verify-result.json。
// 顺序：推开大堂门（L5 快照）→ 118 大堂：迎宾转圈（双字幕）→ 推销（心声线索）→ 鞠躬邀请（邀请卡）→ 放兔子 → 兔子跳向正门 → 照片（photoRecall、清晰心声）
//       → 办公室：丢海报进洞 A → 坐在书桌后 → 老板拍肩。片段时刻靠直接拨 AI 的 modeT（渲染层非循环片段的时间就是 modeT）。
import { spawn } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
const port = process.env.VM_QA_CDP ?? '9505', out = 'reports/spokes/game/', pre = process.env.S_SHEET ?? ''
const base = process.env.VM_QA_URL ?? 'http://127.0.0.1:3505'
mkdirSync(out, { recursive: true })
const up = async () => { try { return (await fetch(base + '/proto-spokes.html')).ok } catch { return false } }
let vite = null
if (!(await up())) {
  vite = spawn('npx', ['vite', '--port', '3505', '--strictPort', '--host', '127.0.0.1'], { stdio: 'ignore', detached: true, env: { ...process.env, L0_VERIFY: '1' } })
  for (let i = 0; i < 160 && !(await up()); i++) await new Promise((r) => setTimeout(r, 500))
}
const chrome = spawn(process.env.CHROME ?? '/workspace/work/.pw-libs/chromium.sh', ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${process.cwd()}/.cache/spokes-qa-game`, '--enable-automation', '--no-first-run', '--no-default-browser-check', '--disable-gpu-sandbox', '--no-sandbox', '--enable-unsafe-swiftshader', '--use-angle=swiftshader', 'about:blank'], { stdio: 'ignore' })
console.log('chrome pid', chrome.pid, 'vite pid', vite?.pid)
writeFileSync(out + 'pids.json', JSON.stringify({ chrome: chrome.pid, vite: vite?.pid ?? null }))
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
  const G = `__engine.map.entities.find(x=>x.def.type==='greeter')`
  const st = async () => ev(`(()=>{const g=${G};const b=__engine.map.entities.find(x=>x.def.type==='beast');return {lv:__engine.player.level,mode:g?.gr?.mode,clip:g?.gr?.clip,t:g?.gr?.modeT,pend:g?.presentationPending,bmode:b?.bst?.mode,top:document.querySelector('[data-spokes-top]')?.textContent,inner:document.querySelector('[data-spokes-inner]')?.textContent}})()`)
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 760, deviceScaleFactor: 1, mobile: false })
  const init = await send('Page.addScriptToEvaluateOnNewDocument', { source: `localStorage.clear();sessionStorage.clear();localStorage.setItem('br_settings',JSON.stringify({renderResolution:'native',renderScale:100,maxPixelRatio:1,dynamicRes:false,lightMode:'full',sceneLightLimit:16,shadowQuality:1,lightShadows:1,loadingBudgetMs:200,devMode:false}))` })
  await send('Page.navigate', { url: base + '/?cpu=1' })
  console.log('nav'); await waitFor('window.__engine && document.querySelector(".title-menu")', 'title'); console.log('title ok')
  await send('Page.removeScriptToEvaluateOnNewDocument', { identifier: init.identifier })
  await ev(`(()=>{const raw=__engine.snapshot();localStorage.setItem('br_save_slot1',JSON.stringify({...raw,seed:282828,level:5,mapSeed:282828,savedAt:Date.now(),player:{...raw.player,level:5}}))})()`)
  await send('Page.reload')
  await waitFor(`window.__engine && document.querySelector(".title-menu")`, 'title2')
  for (let i = 0; i < 60; i++) {
    if (await ev('__engine.player.level===5 && !__engine.paused')) break
    await ev(`(()=>{const b=[...document.querySelectorAll('.menu-btn')].find(b=>b.textContent.includes('继续游戏'));b&&b.click()})()`)
    await sleep(1500)
    await ev(`(()=>{const b=[...document.querySelectorAll('.hud-panel button')].find(b=>b.textContent.includes('继续'))||[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='继续');b&&b.click()})()`)
    await sleep(3000)
  }
  await waitFor('__engine.player.level===5 && !__engine.paused', 'in L5')
  console.log('in L5')
  await ev(`(()=>{__renderer.chunkBudgetMs=250;const e=__engine;e.dev.god=true;e.dev.statLock=false;e.introT=0;e.map.entities=[];return 1})()`)
  console.log('near', await soft('__renderer.isNearWorldReady(__engine)', 300))
  // ---- 推开大堂门（L5 快照 → 118）----
  await ev(`(async()=>{const H=await import('/src/game/engine/l5Hotel.ts');const e=__engine;e.player.facing=0;__look.yaw=-Math.PI/2;return H.hotelEnterPocket(e,'lobby')})()`, true)
  await waitFor(`__engine.player.level===118 && !__engine.transition`, 'lobby', 900)
  console.log('lobby near', await soft('__renderer.isNearWorldReady(__engine)', 300))
  const S = `(await import('/src/game/engine/spokesAI.ts'))`
  // 她不要自己跑日程：先固定在前台
  await ev(`(async()=>{const S=${S};const e=__engine,g=${G};g.gr.phaseLen=1e9;S.spokesDebug(e).tapNext=1e9;S.spokesDebug(e).inviteCd=1e9;const P=e.player;P.x=20.0;P.y=13.6;P.facing=-Math.PI/2;__look.yaw=-P.facing-Math.PI/2;__look.pitch=0.06;return 1})()`, true)
  console.log('warm', await soft(`(()=>{const g=${G};return g&&__renderer.entityMeshes.get(g.id)&&!g.presentationPending})()`, 600))
  const setT = (t) => ev(`(()=>{const g=${G};if(g&&g.gr){g.gr.modeT=${t};return g.gr.mode}return null})()`)
  const force = (mode, clip, t, extra = '') => ev(`(()=>{const g=${G};const s=g.gr;s.mode='${mode}';s.clip='${clip}';s.seq++;s.blend=0.01;s.modeT=${t};s.applied=true;${extra};return s.mode})()`)
  const cam = (x, y, tx, ty, pitch) => ev(`(()=>{const P=__engine.player;P.x=${x};P.y=${y};P.facing=Math.atan2(${ty}-${y},${tx}-${x});__look.yaw=-P.facing-Math.PI/2;__look.pitch=${pitch};return 1})()`)
  const frames = (ms = 4500) => sleep(ms)
  // ① 迎宾转圈 + 双字幕
  await ev(`(async()=>{const S=${S};S.spokesDebug(__engine).greeted=false;return 1})()`, true)
  await cam(20.4, 14.4, 20.0, 10.45, 0.08)
  await soft(`${G}.gr.mode==='greet'`, 60); await setT(2.3); await frames(); await shot('greet'); console.log(JSON.stringify(await st()))
  // ② 推销 + 心声里的真线索
  await force('talk', 'speakerTalk', 1.6)
  await ev(`(async()=>{const S=${S};const e=__engine;S.spokesSay(e,S.PITCH[2],S.spokesClues(e)[0],999,true);return S.spokesClues(e)})()`, true).then((c) => { results.clues = c; console.log('clues', JSON.stringify(c)) })
  await cam(20.25, 12.6, 20.0, 10.45, 0.16); await frames(); await shot('talk'); console.log(JSON.stringify(await st()))
  // ③ 鞠躬邀请（邀请卡）
  await ev(`(async()=>{const S=${S};S.spokesDebug(__engine).subs.length=0;return 1})()`, true)
  await cam(20.15, 12.9, 20.0, 10.45, 0.0)
  await force('invite', 'bowInvite', 1.9, 's.applied=false')
  await ev(`(async()=>{const S=${S};S.spokesSay(__engine,'加入我吧！和我一起参观，发现恐怖旅馆的一切优点。亲眼看到真相！','不要！拒绝我！',999,true);return 1})()`, true)
  await frames(); await shot('bow')
  await setT(2.45); await soft(`document.querySelector('[data-greeter-invite]')`, 60); await frames(2500); await shot('invite')
  await ev(`(()=>{const b=document.querySelector('[data-greeter-decline]');b&&b.click();return !!b})()`)
  await frames(2500); await shot('declined'); console.log(JSON.stringify(await st()))
  // ④ 放兔子（windRabbit 5.6 s：兔子刚松手）→ 兔子跳向正门
  await ev(`(async()=>{const S=${S};S.spokesDebug(__engine).subs.length=0;const g=${G};const L=(await import('/src/game/content/spokesLayout.ts')).SPOKES_LOBBY;g.x=L.wind.x;g.y=L.wind.y;g.facing=L.wind.f;return 1})()`, true)
  await force('wind', 'windRabbit', 3.2, 's.applied=false;s.then="desk"')
  await cam(21.3, 15.2, 19.9, 13.2, -0.3); await frames(); await shot('wind')
  await setT(6.99); await soft(`__engine.map.entities.some(x=>x.def.type==='windup')`, 60)
  await ev(`(()=>{const g=${G};g.gr.route=[];g.gr.ri=0;g.gr.mode='desk';g.gr.clip='idle';g.gr.seq++;return 1})()`)
  await ev(`(async()=>{const S=${S};S.spokesSay(__engine,'请跟着我的小兔子，它会带您参观最精彩的地方！','别跟着它。它们只会把人送去一个地方。',999,true);return 1})()`, true)
  await soft(`(()=>{const r=__engine.map.entities.find(x=>x.def.type==='windup');return r&&__renderer.entityMeshes.get(r.id)&&!r.presentationPending})()`, 200)
  await sleep(2500)
  await ev(`(async()=>{const g=${G};const L=(await import('/src/game/content/spokesLayout.ts')).SPOKES_LOBBY;g.x=L.front.x;g.y=L.front.y;g.facing=L.front.f;return 1})()`, true) // 她回前台（别挡镜头）
  await soft(`(()=>{const r=__engine.map.entities.find(x=>x.def.type==='windup');return r&&r.y>15.6})()`, 120)
  results.rabbit = await ev(`(()=>{const r=__engine.map.entities.find(x=>x.def.type==='windup');if(!r)return null;r.wu.lobby=true;const P=__engine.player;P.x=r.x+1.7;P.y=r.y+1.5;P.facing=Math.atan2(r.y-P.y,r.x-P.x);__look.yaw=-P.facing-Math.PI/2;__look.pitch=-0.5;return {x:r.x,y:r.y,mode:r.wu.mode,dest:r.wu.dest}})()`)
  console.log('rabbit', JSON.stringify(results.rabbit))
  await frames(3000); await shot('rabbit')
  // ⑤ 照片：photoRecall（清晰的心声）
  await ev(`(async()=>{const S=${S};const e=__engine,g=${G};const L=(await import('/src/game/content/spokesLayout.ts')).SPOKES_LOBBY;g.x=L.front.x;g.y=L.front.y;g.facing=L.front.f;e.map.entities=e.map.entities.filter(x=>x.def.type!=='windup');e.addItem('spokesphoto');S.spokesSave(e).photo=0;g.gr.mode='desk';return S.spokesShowPhoto(e)})()`, true).then((r) => console.log('photo', r))
  await cam(20.35, 12.0, 20.0, 10.45, 0.14)
  await ev(`(async()=>{const S=${S};const r=S.spokesDebug(__engine);r.clearT=999;r.subs.length=0;S.spokesSay(__engine,'……这位客人？我、我好像没有见过她。',S.spokesKeyHint(__engine),999,true);return 1})()`, true)
  await setT(3.4); await frames(); await shot('photo'); console.log(JSON.stringify(await st()))
  await setT(5.4); await frames(); await shot('photo2')
  // ⑥ 办公室：丢海报进洞 A
  await ev(`(async()=>{const S=${S};const r=S.spokesDebug(__engine);r.clearT=0;r.subs.length=0;const g=${G};const L=(await import('/src/game/content/spokesLayout.ts')).SPOKES_LOBBY;g.x=L.dropA.x;g.y=L.dropA.y;g.facing=L.dropA.f;g.gr.photo=0;return 1})()`, true)
  await force('drop', 'dropPoster', 2.2)
  await cam(23.9, 4.1, 22.4, 2.3, 0.02)
  await soft('__renderer.isNearWorldReady(__engine)', 100)
  await frames(5500); await shot('drop')
  await setT(3.3); await frames(); await shot('drop2'); console.log(JSON.stringify(await st()))
  // ⑦ 坐在书桌后（铭牌 / 收音机 / 海报叠）
  await ev(`(async()=>{const g=${G};const L=(await import('/src/game/content/spokesLayout.ts')).SPOKES_LOBBY;g.x=L.seat.x;g.y=L.seat.y;g.facing=L.seat.f;return 1})()`, true)
  await force('seat', 'seatedIdle', 1.0, 's.phaseLen=1e9')
  await ev(`(async()=>{const S=${S};S.spokesSay(__engine,'欢迎来到我的办公室！海报马上就画好啦！',S.spokesClues(__engine).find(c=>c.includes('出口')||c.includes('电梯')||c.includes('楼梯'))??S.INNER[0],999,true);return 1})()`, true)
  await cam(20.9, 6.6, 20.5, 4.2, -0.12); await frames(5500); await shot('seat')
  // ⑧ 老板拍肩
  await ev(`(async()=>{const S=${S};const g=${G};const L=(await import('/src/game/content/spokesLayout.ts')).SPOKES_LOBBY;g.x=L.draw.x;g.y=L.draw.y;g.facing=L.draw.f;g.gr.mode='draw';g.gr.clip='drawPoster';g.gr.seq++;return !!S.spokesBossVisit(__engine,g)})()`, true).then((r) => console.log('visit', r))
  await cam(18.7, 5.9, 20.4, 3.85, 0.0)
  await soft(`(()=>{const b=__engine.map.entities.find(x=>x.def.type==='beast');return b&&__renderer.entityMeshes.get(b.id)&&!b.presentationPending})()`, 300)
  await ev(`(()=>{const b=__engine.map.entities.find(x=>x.def.type==='beast');const g=${G};if(b)b.bst.modeT=1.5;if(g)g.gr.modeT=1.2;return 1})()`)
  await frames(5000); await shot('tap'); console.log(JSON.stringify(await st()))
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
