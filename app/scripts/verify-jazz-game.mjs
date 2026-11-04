// [jazz] 爵士脑（Entity 197）阶段 3 实机截图：nohup node scripts/verify-jazz-game.mjs > .cache/jazz-game.log 2>&1 &（约 10–20 分钟，SwiftShader + CPU 蒙皮）
// 与 verify-chef-game.mjs 同一套启动（L5 存档 → 继续游戏，入口 ?cpu=1），vite 端口 3507 / CDP 9509 / 浏览器目录 .cache/jazz-qa-game。种子 800：出生点西边那座厨师餐厅里搭了舞台。
// 跑前删 .cache/jazz-qa-game；跑时别改 src；同时只开一个浏览器（结束时按 pid 杀）。输出 reports/jazz/game/*.png + verify-result.json。
// AI 冻结（JAZZ_QA.freeze / CHEF_QA.freeze），排期钉在 jazzQaClock，片段时刻直接拨 modeT。JAZZ_ONLY=bar,menu 只补拍这几张。
import { spawn } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
const port = process.env.VM_QA_CDP ?? '9509', out = 'reports/jazz/game/'
const base = process.env.VM_QA_URL ?? 'http://127.0.0.1:3507'
mkdirSync(out, { recursive: true })
const up = async () => { try { return (await fetch(base + '/index.html')).ok } catch { return false } }
let vite = null
if (!(await up())) {
  vite = spawn('npx', ['vite', '--port', '3507', '--strictPort', '--host', '127.0.0.1'], { stdio: 'ignore', detached: true, env: { ...process.env, L0_VERIFY: '1' } })
  for (let i = 0; i < 160 && !(await up()); i++) await new Promise((r) => setTimeout(r, 500))
}
const chrome = spawn(process.env.CHROME ?? '/workspace/work/.pw-libs/chromium.sh', ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${process.cwd()}/.cache/jazz-qa-game`, '--enable-automation', '--no-first-run', '--no-default-browser-check', '--disable-gpu-sandbox', '--no-sandbox', '--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--autoplay-policy=no-user-gesture-required', 'about:blank'], { stdio: 'ignore' })
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
  const ev = async (expression, awaitPromise = false) => { const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise }); if (r.exceptionDetails) console.log('EVAL', JSON.stringify(r.exceptionDetails).slice(0, 400)); return r.result?.value }
  await send('Runtime.enable'); await send('Page.enable')
  const ver = await send('Browser.getVersion'), cl = await send('Browser.getBrowserCommandLine')
  if (!ver.userAgent.includes('HeadlessChrome') || !cl.arguments.includes('--headless=new')) throw Error('不是本脚本的无头 QA 浏览器')
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  const waitFor = async (expr, label, tries = 900) => { for (let i = 0; i < tries; i++) { if (await ev(`Boolean(${expr})`)) return; await sleep(300) } throw Error('超时：' + label) }
  const soft = async (expr, tries) => { for (let i = 0; i < tries; i++) { if (await ev(`Boolean(${expr})`)) return true; await sleep(300) } return false }
  const shot = async (name) => { writeFileSync(out + name + '.png', Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).data, 'base64')); console.log('shot', name, new Date().toISOString().slice(11, 19)) }
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 760, deviceScaleFactor: 1, mobile: false })
  const init = await send('Page.addScriptToEvaluateOnNewDocument', { source: `localStorage.clear();sessionStorage.clear();localStorage.setItem('br_settings',JSON.stringify({renderResolution:'native',renderScale:100,maxPixelRatio:1,dynamicRes:false,lightMode:'full',sceneLightLimit:16,shadowQuality:1,lightShadows:1,loadingBudgetMs:200,devMode:false}))` })
  await send('Page.navigate', { url: base + '/?cpu=1' })
  console.log('nav'); await waitFor('window.__engine && document.querySelector(".title-menu")', 'title'); console.log('title ok')
  await send('Page.removeScriptToEvaluateOnNewDocument', { identifier: init.identifier })
  await ev(`(()=>{const raw=__engine.snapshot();localStorage.setItem('br_save_slot1',JSON.stringify({...raw,seed:800,level:5,mapSeed:800,savedAt:Date.now(),player:{...raw.player,level:5}}))})()`)
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
  await ev(`(()=>{__renderer.chunkBudgetMs=250;const e=__engine;e.dev.god=true;e.dev.statLock=true;e.introT=0;e.map.entities=[];return 1})()`)
  console.log('near', await soft('__renderer.isNearWorldReady(__engine)', 300))
  const J = `(await import('/src/game/engine/jazzAI.ts'))`, CH = `(await import('/src/game/engine/chefAI.ts'))`, BA = `(await import('/src/game/engine/beastAI.ts'))`
  // 站进观众区 → 四人出现；排期钉在第一场演奏中；冻结 AI
  const site = await ev(`(async()=>{const J=${J};const C=${CH};const e=__engine;const cs=C.chefSite(e);const o=e.map.inf;e.player.x=cs.front.x+1-o.ox;e.player.y=cs.hall.y1-1.5-o.oy;C.stepChefWorld(e,0.05);C.CHEF_QA.freeze=true;const s=J.jazzSite(e);e.player.x=s.audC.x-o.ox;e.player.y=s.audC.y-o.oy;J.jazzQaClock(e,0,40);for(let i=0;i<3;i++)J.stepJazzWorld(e,0.05);J.JAZZ_QA.freeze=true;window.__jzS=s;return {s,n:J.findJazz(e).length,ox:o.ox,oy:o.oy}})()`, true)
  console.log('site', JSON.stringify(site))
  const S = site.s
  const cam = async (x, y, tx, ty, pitch) => { await ev(`(()=>{const o=__engine.map.inf;const P=__engine.player;P.x=(${x})-o.ox;P.y=(${y})-o.oy;P.z=0;P.facing=Math.atan2((${ty})-(${y}),(${tx})-(${x}));__look.yaw=-P.facing-Math.PI/2;__look.pitch=${pitch};return 1})()`); await sleep(1500) }
  /** 摆一个乐手：世界坐标、朝向、片段、片段时刻、地台高度 */
  const pose = (who, x, y, f, clip, t, h = 0, mode = 'act', lookP = false) => ev(`(async()=>{const J=${J};const e=J.findJazz(__engine,'${who}')[0];if(!e)return 'none';const s=J.ensureJazz(e);const o=__engine.map.inf;e.x=${x}-o.ox;e.y=${y}-o.oy;e.facing=${f};s.mode='${mode}';s.clip='${clip}';s.seq++;s.blend=0.01;s.modeT=${t};s.h=${h};s.lookAt=${lookP ? 'J.eyeOf(__engine)' : 'null'};s.mistFrom=null;return s.clip})()`, true)
  /** [修] 注视 / 雾源跟着当前相机（玩家）位置刷新 */
  const lookAll = (on = true, mist = false) => ev(`(async()=>{const J=${J};const p=__engine.player;for(const e of J.findJazz(__engine)){const s=J.ensureJazz(e);s.lookAt=${on}?J.eyeOf(__engine):null;s.mistFrom=${mist}?{x:p.x,y:p.y,z:(p.z??0)+1.15}:null}return 1})()`, true)
  const clock = (k, t) => ev(`(async()=>{const J=${J};J.jazzQaClock(__engine,${k},${t});J.stepJazzWorld(__engine,0.01);return J.jazzDebug(__engine).phase})()`, true)
  const say = (text, who = '') => ev(`(async()=>{const J=${J};J.jazzSay(__engine,${JSON.stringify(text)},${JSON.stringify(who)},999,true);return 1})()`, true)
  const clearSay = () => ev(`(async()=>{const J=${J};J.jazzDebug(__engine).subs.length=0;return 1})()`, true)
  const st = () => ev(`(()=>{return {band:__engine.map.entities.filter(x=>x.def.type==='jazz').map(x=>[x.jz.who,x.jz.clip,+x.jz.modeT.toFixed(2),!!__renderer.entityMeshes.get(x.id)]),hud:document.querySelector('[data-jazz-show]')?.textContent,fake:document.querySelector('[data-jazz-fake]')?.textContent,menu:!!document.querySelector('[data-jazz-menu]'),sub:document.querySelector('[data-jazz-sub]')?.textContent}})()`)
  const ready = async () => { await soft('__renderer.isNearWorldReady(__engine)', 200); await soft(`__engine.map.entities.filter(x=>x.def.type==='jazz').every(x=>__renderer.entityMeshes.get(x.id)&&!x.presentationPending)`, 400) }
  const ONLY = process.env.JAZZ_ONLY ? new Set(process.env.JAZZ_ONLY.split(',')) : null
  const snap = async (name, ms = 6000) => { if (ONLY && !ONLY.has(name)) { await sleep(500); return } await ready(); await sleep(ms); await shot(name); console.log(JSON.stringify(await st())) }
  const P = S.play, PI = Math.PI, H = 0.45
  const onStage = async (solo) => {
    await pose('leader', P.leader.x, P.leader.y, PI, solo ? 'trumpetSolo' : 'trumpetPlay', solo ? 3.1 : 1.0, H, 'play')
    await pose('sax', P.sax.x, P.sax.y, PI, 'saxPlay', 1.6, H, 'play')
    await pose('bass', P.bass.x, P.bass.y, PI, 'bassPlay', 0.7, H, 'play')
    await pose('drum', P.drum.x, P.drum.y, PI, 'drumPlay', 2.2, H, 'play')
  }
  // ① 舞台全景：演出中（头儿小号独奏），从观众区后排看
  await clock(0, 50); await onStage(true)
  await ev(`(async()=>{const J=${J};const r=J.jazzDebug(__engine);r.soloWho='leader';r.song=0;return 1})()`, true)
  await cam(S.aud.x0 + 0.6, S.audC.y + 2.2, S.stageC.x, S.stageC.y - 0.3, 0.14)
  await snap('stage', 7000)
  // ② 终曲假吸魂：站在观众区低着头（HUD 装死提示 + 魂雾）
  await clock(0, 120 - 3.6 - 6)
  for (const w of ['leader', 'sax', 'bass', 'drum']) await pose(w, P[w].x, P[w].y, PI, 'fakeSoulSuck', 2.1, H, 'play')
  await cam(S.stage.x0 - 3.4, S.audC.y + 0.6, S.stage.x0 + 1.5, S.audC.y - 0.2, -0.40)
  await ev(`(async()=>{const J=${J};const r=J.jazzDebug(__engine);r.wasIn=true;r.sus=22;r.pv=0;return 1})()`, true)
  await snap('fake', 7000)
  // ③ 老板坐在后排：从台口回看观众区
  await ev(`(async()=>{const B=${BA};const o=__engine.map.inf;B.beastSpawnAudience(__engine,${S.aud.x0 + 0.6}-o.ox,${S.audC.y + 0.4}-o.oy,0);return !!B.findBeast(__engine)})()`, true).then((r) => console.log('beast', r))
  await cam(S.stage.x0 - 0.4, S.audC.y - 1.6, S.aud.x0 + 0.6, S.audC.y + 0.5, 0.02)
  await snap('beast', 8000)
  await ev(`(async()=>{const B=${BA};const b=B.findBeast(__engine);if(b)__engine.map.entities=__engine.map.entities.filter(x=>x!==b);return 1})()`, true)
  // ④ 场间吧台：头儿喝啤酒（倒进领口）、萨克斯随拍摇、低音提琴扶着头
  await clock(-1, 0)
  const bA = S.barAt
  await pose('leader', bA.leader.x, bA.leader.y, -PI / 2, 'drinkBeer', 3.4, 0)
  await pose('sax', bA.sax.x, bA.sax.y, -PI / 2 + 0.5, 'talkGesture', 1.2, 0)
  await pose('bass', bA.bass.x, bA.bass.y, -PI / 2, 'holdHead', 2.2, 0)
  await pose('drum', S.bench.x, S.bench.y, 0, 'pianoPlay', 1.4, H)
  await say('我得减点肥。这颗头已经够沉了，脖子受不了。', '低音提琴')
  await cam(bA.sax.x - 0.6, bA.sax.y + 3.4, bA.sax.x - 0.3, bA.sax.y - 0.4, 0.16)
  await snap('bar', 7000)
  await clearSay()
  // ⑤ 鼓手更爱弹钢琴（台上东北角）
  await cam(S.bench.x - 2.6, S.bench.y + 2.4, S.bench.x + 0.4, S.bench.y - 0.1, 0.0)
  await snap('piano', 7000)
  // ⑥ 监控探头：墙角红灯；低音提琴心虚地瞄它
  await pose('bass', bA.bass.x, bA.bass.y, -PI / 2 + 0.6, 'glanceCamera', 1.6, 0)
  await cam(S.cctv.x - 2.3, S.cctv.y + 2.1, S.cctv.x, S.cctv.y, 0.4) // [修] 机位拉近（原 3.0 / 2.9 m 外），探头 ×3
  await snap('cctv', 7000)
  // ⑦ 点歌菜单：萨克斯「你点名，我来吹」
  await pose('sax', bA.sax.x, bA.sax.y, PI / 2 - 0.2, 'talkGesture', 1.9, 0)
  await say('谱号？那玩意儿我从来没看懂过。你点名，我来吹。', '萨克斯')
  await cam(bA.sax.x - 0.2, bA.sax.y + 1.9, bA.sax.x, bA.sax.y, 0.22)
  await ev(`(async()=>{const J=${J};J.jazzOpenMenu(__engine);return 1})()`, true)
  await soft(`document.querySelector('[data-jazz-menu]')&&__engine.paused`, 40)
  results.menuOpen = await ev(`({overlay:!!document.querySelector('[data-jazz-menu]'),paused:__engine.paused})`)
  await snap('menu', 6000)
  // [修] 菜单打开 = 暂停；Esc 关；关后数字键照常切快捷栏
  // 无头页面没有焦点时 CDP 的按键到不了 window：先 bringToFront + focus；仍收不到（keydown 计数没涨）就在 window 上派发同样的 KeyboardEvent
  await ev(`(()=>{window.__kd=0;window.addEventListener('keydown',()=>{window.__kd++});return 1})()`)
  const key = async (k, code, vk) => {
    await send('Page.bringToFront').catch(() => {}); await ev('window.focus(),document.body.focus?.(),1')
    const n0 = await ev('window.__kd')
    await send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: k, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk }); if (k.length === 1) await send('Input.dispatchKeyEvent', { type: 'char', key: k, code, text: k }); await sleep(120); await send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk }); await sleep(1500)
    if ((await ev('window.__kd')) === n0) { results.synthKeys = (results.synthKeys ?? 0) + 1; await ev(`(()=>{const o={key:${JSON.stringify(k)},code:${JSON.stringify(code)},bubbles:true,cancelable:true};window.dispatchEvent(new KeyboardEvent('keydown',o));window.dispatchEvent(new KeyboardEvent('keyup',o));return 1})()`) }
    await sleep(3000) // SwiftShader 下一帧 1–2 s：多等一会儿
  }
  const sel0 = await ev('__engine.player.selected')
  await key('3', 'Digit3', 51)
  results.menuDigitWhileOpen = await ev(`({selected:__engine.player.selected,menu:!!document.querySelector('[data-jazz-menu]')})`)
  await ev(`(async()=>{const J=${J};J.jazzRequest(__engine,-1);return J.jazzMenuOpen(__engine)})()`, true)
  if (results.menuDigitWhileOpen.menu === false) { await ev(`(async()=>{const J=${J};J.jazzOpenMenu(__engine);return 1})()`, true); await sleep(1200) }
  await key('Escape', 'Escape', 27)
  results.menuAfterEsc = await ev(`({overlay:!!document.querySelector('[data-jazz-menu]'),paused:__engine.paused})`)
  await key('4', 'Digit4', 52)
  results.menuDigitAfter = await ev(`({selected:__engine.player.selected,before:${sel0}})`)
  console.log('menu', JSON.stringify([results.menuOpen, results.menuDigitWhileOpen, results.menuAfterEsc, results.menuDigitAfter]))
  // 不管按键结果如何：后面的截图前确保菜单关着
  await ev(`(async()=>{const J=${J};J.jazzCloseMenu(__engine);return 1})()`, true); await soft(`!document.querySelector('[data-jazz-menu]')`, 40)
  await clearSay()
  // ⑧ 哈瓦那辣椒酱：低音提琴塞给你一瓶（手持模型 + 吧台上那两瓶）
  await ev(`(()=>{const p=__engine.player;p.hotbar[0]={type:'habanero',count:1};p.selected=0;__engine.syncPassives?.();return 1})()`)
  await pose('bass', bA.bass.x, bA.bass.y, PI / 2, 'talkGesture', 2.4, 0)
  await say('拿着。哈瓦那的。抹在什么上都行——别抹在厨子的菜上，他会哭的。', '低音提琴')
  await cam(bA.bass.x + 0.3, bA.bass.y + 1.8, bA.bass.x - 0.1, bA.bass.y - 0.3, 0.12)
  await snap('sauce', 7000)
  await clearSay()
  await ev(`(()=>{const p=__engine.player;p.hotbar[0]=null;__engine.syncPassives?.();return 1})()`)
  // ⑨ 迎宾女郎画的演出海报（餐厅南墙正门边）
  await cam(S.poster.x + 0.5, S.poster.y - 1.2, S.poster.x + 0.5, S.poster.y + 1, 0.12)
  await snap('poster', 5000)
  // ⑩ HUD：演出中在听（进度 / 曲名 / 点歌增益 / 辣椒酱暖身 / 乐手字幕）
  await clock(0, 62); await onStage(false)
  await ev(`(async()=>{const J=${J};const e=__engine;const s=J.jazzSave(e);s.buff=2;s.buffT=48;s.sauceT=190;const r=J.jazzDebug(e);r.song=2;r.soloWho=null;r.wasIn=true;return 1})()`, true)
  await say('「哈瓦那辣椒」——这首是给你的。', '萨克斯')
  await cam(S.audC.x - 0.5, S.audC.y + 0.4, S.stageC.x, S.stageC.y, 0.1)
  await snap('hud', 6000)
  await clearSay()
  // ⑪ 场间吵架：被头儿按肩劝和
  await clock(-1, 0)
  const ag = await ev(`(async()=>{const J=${J};const s=window.__jzS;const o=__engine.map.inf;const w=(k)=>{const a=J.argueSpot(__engine,s,k);return {x:a.x+o.ox,y:a.y+o.oy,f:a.f}};return {l:w('leader'),s:w('sax'),b:w('bass')}})()`, true)
  await pose('leader', ag.l.x, ag.l.y, ag.l.f, 'argueReconcile', 3.6, 0)
  await pose('sax', ag.s.x, ag.s.y, ag.s.f, 'argueReconcile', 3.6, 0)
  await pose('bass', ag.b.x, ag.b.y, ag.b.f, 'argueReconcile', 3.6, 0)
  await cam(ag.l.x - 0.4, ag.l.y + 3.0, ag.l.x, ag.l.y, 0.12)
  await snap('argue', 7000)
  // ⑫ 告发：站在监控下按住 X（进度条）
  await ev(`(async()=>{const J=${J};const e=__engine;J.jazzSave(e).sawFinale=1;J.jazzDebug(e).reportT=0.9;return 1})()`, true)
  await cam(S.cctv.x - 0.6, S.cctv.y + 1.6, S.cctv.x - 0.2, S.cctv.y + 0.2, 0.55)
  await snap('report', 5000)
  // ===== [修] 已知问题修复的对照图（reports/jazz/stage3-fix.jpg 用）=====
  await ev(`(async()=>{const J=${J};J.jazzDebug(__engine).reportT=0;return 1})()`, true)
  // ⑬ 台口装饰柱 + 吧台背墙：墙上的木壁柱不再穿过台面 / 吧台
  await clock(0, 50); await onStage(false)
  await cam(S.aud.x0 + 0.8, S.aud.y0 + 2.6, S.stage.x0 + 0.6, S.bar.y0 + 0.8, 0.12)
  await snap('pillar', 6000)
  // ⑭ 魂雾近景（侧面看：软边拉丝 + 软粒子）
  await clock(0, 120 - 3.6 - 6)
  for (const w of ['leader', 'sax', 'bass', 'drum']) await pose(w, P[w].x, P[w].y, PI, 'fakeSoulSuck', 2.0, H, 'play')
  await cam(S.stage.x0 - 1.2, S.stage.y0 - 0.9, S.stage.x0 - 2.6, S.audC.y + 1.2, 0.18)
  await snap('mist', 6000)
  // ⑮ 注视：场间吧台，你从侧面走近——头 / 颈转过来看你（身体不转）
  await clock(-1, 0)
  await pose('leader', bA.leader.x, bA.leader.y, -PI / 2, 'idleSway', 1.0, 0)
  await pose('sax', bA.sax.x, bA.sax.y, -PI / 2, 'idleSway', 2.2, 0)
  await pose('bass', bA.bass.x, bA.bass.y, -PI / 2, 'idleSway', 3.1, 0)
  await clearSay()
  await cam(bA.bass.x + 2.3, bA.bass.y + 1.5, bA.sax.x - 0.3, bA.sax.y - 0.1, 0.06) // 侧面：身子朝北（吧台），头转过来
  await lookAll(true)
  await snap('look', 6000)
  await lookAll(false)
  // ⑯ 避让：你堵在台阶上，萨克斯停下「劳驾，让一让」
  await pose('leader', bA.leader.x, bA.leader.y, -PI / 2, 'idleSway', 1.0, 0)
  await pose('bass', bA.bass.x, bA.bass.y, -PI / 2, 'idleSway', 3.1, 0)
  await pose('sax', S.stepTop.x - 0.15, S.stage.y0 - 2.2, PI / 2, 'idleSway', 0.6, 0, 'walk', true)
  await say('劳驾，让一让，我的键怕磕。', '萨克斯')
  await cam(S.stepTop.x, S.stage.y0 - 0.45, S.stepTop.x - 0.15, S.stage.y0 - 2.2, 0.05)
  await lookAll(true)
  await snap('yield', 6000)
  await clearSay()
  // ⑰ 告发后离场：瞪你、摇头、收谱（packUp），一个已经走下台阶
  await ev(`(async()=>{const J=${J};const s=J.jazzSave(__engine);s.reported=1;s.goneT=1800;J.jazzDebug(__engine).leave={t:3};return 1})()`, true)
  await clock(-1, 0)
  await pose('leader', P.leader.x, P.leader.y, PI, 'packUp', 0.75, H, 'act', true)
  await pose('sax', P.sax.x, P.sax.y, PI, 'packUp', 2.1, H, 'act', true)
  await pose('drum', P.drum.x, P.drum.y, PI, 'packUp', 2.8, H, 'act', true)
  await pose('bass', S.stepTop.x, S.stage.y0 - 0.5, -PI / 2, 'walk', 0.3, 0.2, 'walk', false)
  await say('台上四个人一齐看向你。小号头儿摇了摇头，开始收拾谱架。')
  await cam(S.stage.x0 - 3.2, S.audC.y - 0.6, S.stage.x0 + 1, S.audC.y - 1.2, 0.12)
  await lookAll(true)
  await ev(`(async()=>{const J=${J};const e=J.findJazz(__engine,'bass')[0];J.ensureJazz(e).lookAt=null;return 1})()`, true)
  await snap('leave', 6000)
  // ⑱ 离场：沿后墙走向后场门（弹簧门）
  const ex = S.exit.out
  await pose('leader', ex.x + 2.2, ex.y + 0.2, PI, 'walk', 0.2, 0, 'walk')
  await pose('sax', ex.x + 4.0, ex.y + 0.3, PI, 'walk', 0.6, 0, 'walk')
  await pose('drum', ex.x + 5.8, ex.y + 0.25, PI, 'walk', 0.9, 0, 'walk')
  await pose('bass', ex.x + 0.6, ex.y - 0.7, -PI / 2, 'walk', 0.4, 0, 'walk')
  await clearSay()
  await cam(ex.x + 8.5, ex.y + 2.4, ex.x, ex.y - 0.6, 0.1)
  await snap('leave2', 6000)
  // ⑲ 回来以后的真吸魂：雾从你身上被抽走（暖红）、灯光变暗变冷、乐手僵直
  await ev(`(async()=>{const J=${J};const s=J.jazzSave(__engine);s.reported=1;s.goneT=0;const r=J.jazzDebug(__engine);r.leave=null;return 1})()`, true)
  await clock(0, 120 - 3.6 - 6)
  for (const w of ['leader', 'sax', 'bass', 'drum']) await pose(w, P[w].x, P[w].y, PI, 'trueSoulSuck', w === 'leader' ? 1.0 : w === 'sax' ? 1.9 : w === 'bass' ? 0.4 : 2.9, H, 'play', true)
  await cam(S.stage.x0 - 3.0, S.audC.y + 0.3, S.stage.x0 + 1.5, S.audC.y - 0.2, -0.12)
  await lookAll(true, true)
  await ev(`(async()=>{const J=${J};const r=J.jazzDebug(__engine);r.grade=1;r.wasIn=true;return 1})()`, true)
  await say('白雾真的流进了乐器口里。你觉得身体里少了点什么。')
  await snap('real', 6000)
  results.real = await ev(`({grade:document.querySelector('[data-jazz-real]')?.getAttribute('data-jazz-real'),edge:!!document.querySelector('.jz-realfx-edge')})`)
  await clearSay()
  results.final = await st()
  await send('Browser.close').catch(() => {})
  ws.close()
} catch (err) { console.log('ERR', String(err)); results.err = String(err) } finally {
  writeFileSync(out + 'verify-result.json', JSON.stringify({ results, errors }, null, 2) + '\n')
  try { chrome.kill('SIGKILL') } catch { /* 已退出 */ }
  if (vite) { try { process.kill(-vite.pid, 'SIGTERM') } catch { /* 已退出 */ } }
  if (errors.length) console.log('浏览器错误：', JSON.stringify(errors).slice(0, 3000))
  process.exit(0)
}
