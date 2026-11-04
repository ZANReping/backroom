// [chef] 厨师（Entity 800）阶段 3 实机截图：nohup node scripts/verify-chef-game.mjs &（整段约 10–20 分钟，SwiftShader + CPU 蒙皮）
// 与 verify-spokes-game.mjs 同一套启动（L5 存档 → 继续游戏，入口 ?cpu=1），vite 端口 3507 / CDP 9508 / 浏览器目录 .cache/chef-qa-game。种子 800：出生点西边就有一座带后场的餐厅。
// 跑前删 .cache/chef-qa-game；跑时别改 src；同时只开一个浏览器（结束时按 pid 杀）。输出 reports/chef/game/*.png + verify-result.json。
// 顺序：餐厅全景（顾客）→ 后厨（融进环境 → 被看见：闪光僵住）→ 敲桌 → 抡锅 → 冷库（铐着 + HUD）→ 取刀 → 打烊闩门 → 吃饭（变暖 + 念头）→ 守灶 → 远景吐锅。AI 冻结（CHEF_QA.freeze），片段时刻直接拨 modeT。
//
import { spawn } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
const port = process.env.VM_QA_CDP ?? '9508', out = 'reports/chef/game/', pre = process.env.S_SHEET ?? ''
const base = process.env.VM_QA_URL ?? 'http://127.0.0.1:3507'
mkdirSync(out, { recursive: true })
const up = async () => { try { return (await fetch(base + '/index.html')).ok } catch { return false } }
let vite = null
if (!(await up())) {
  vite = spawn('npx', ['vite', '--port', '3507', '--strictPort', '--host', '127.0.0.1'], { stdio: 'ignore', detached: true, env: { ...process.env, L0_VERIFY: '1' } })
  for (let i = 0; i < 160 && !(await up()); i++) await new Promise((r) => setTimeout(r, 500))
}
const chrome = spawn(process.env.CHROME ?? '/workspace/work/.pw-libs/chromium.sh', ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${process.cwd()}/.cache/chef-qa-game`, '--enable-automation', '--no-first-run', '--no-default-browser-check', '--disable-gpu-sandbox', '--no-sandbox', '--enable-unsafe-swiftshader', '--use-angle=swiftshader', 'about:blank'], { stdio: 'ignore' })
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
  await ev(`(()=>{__renderer.chunkBudgetMs=250;const e=__engine;e.dev.god=true;e.dev.statLock=false;e.introT=0;e.map.entities=[];return 1})()`)
  console.log('near', await soft('__renderer.isNearWorldReady(__engine)', 300))
  const C = `(await import('/src/game/engine/chefAI.ts'))`
  const CH = `__engine.map.entities.find(x=>x.def.type==='chef')`
  const st = async () => ev(`(()=>{const c=${CH};return {mode:c?.ck?.mode,clip:c?.ck?.clip,t:c?.ck?.modeT,vis:c?.ck?.vis,pend:c?.presentationPending,sub:document.querySelector('[data-chef-sub]')?.textContent,cuff:document.querySelector('[data-chef-cuff]')?.textContent}})()`)
  // 站进餐厅 → 他在灶前出现；冻结 AI
  const site = await ev(`(async()=>{const C=${C};const e=__engine;const s=C.chefSite(e);const ox=e.map.inf.ox,oy=e.map.inf.oy;window.__ckW=(p)=>({x:p.x-ox,y:p.y-oy,f:p.f});window.__ckS=s;e.player.x=s.front.x+1-ox;e.player.y=s.hall.y1-1.5-oy;e.hotel.attn=0;for(let i=0;i<3;i++)C.stepChefWorld(e,0.05);C.CHEF_QA.freeze=true;return {hall:s.hall,sy:s.sy,bcx:s.bcx,stove:s.at.stove,ox,oy}})()`, true)
  console.log('site', JSON.stringify(site))
  /** 全部用世界坐标（窗口会随玩家重新居中，ox / oy 每次现取） */
  const cam = async (x, y, tx, ty, pitch) => { await ev(`(()=>{const o=__engine.map.inf;const P=__engine.player;P.x=(${x})-o.ox;P.y=(${y})-o.oy;P.z=0;P.facing=Math.atan2((${ty})-(${y}),(${tx})-(${x}));__look.yaw=-P.facing-Math.PI/2;__look.pitch=${pitch};return 1})()`); await sleep(1500) }
  const wx = (x) => x, wy = (y) => y
  const pose = (x, y, f, mode, clip, t, vis, extra = '') => ev(`(async()=>{const C=${C};const c=${CH};const s=C.ensureChef(c);const o=__engine.map.inf;c.x=${x}-o.ox;c.y=${y}-o.oy;c.facing=${f};s.mode='${mode}';s.clip='${clip}';s.seq++;s.blend=0.01;s.modeT=${t};s.vis=${vis};s.turn=0;${extra};return s.mode})()`, true)
  const say = (text, kind = 'sys') => ev(`(async()=>{const C=${C};C.chefSay(__engine,${JSON.stringify(text)},'${kind}',999,true);return 1})()`, true)
  const clearSay = () => ev(`(async()=>{const C=${C};C.chefDebug(__engine).subs.length=0;return 1})()`, true)
  const ready = async () => { await soft('__renderer.isNearWorldReady(__engine)', 200); await soft(`(()=>{const c=${CH};return c&&__renderer.entityMeshes.get(c.id)&&!c.presentationPending})()`, 400) }
  const frames = (ms = 5000) => sleep(ms)
  /** CHEF_ONLY=eat,guard 只补拍这几张（步骤照走，跳过等待和截图；浏览器中途崩了时用） */
  const ONLY = process.env.CHEF_ONLY ? new Set(process.env.CHEF_ONLY.split(',')) : null
  const snap = async (name, rd, ms) => { if (ONLY && !ONLY.has(name)) { await sleep(800); return } if (rd) await ready(); await frames(ms); await shot(name) }
  const S0 = site.stove, sx = wx(S0.x), sy0 = wy(S0.y)
  // ① 餐厅全景：吊灯 / 天鹅绒壁纸 / 白桌布 / 着迷进食的顾客（他在后厨，看不见）
  await cam(wx(site.bcx + 1), wy(site.hall.y1 - 0.8), wx(site.bcx + 1), wy(site.sy + 2), 0.06)
  await snap('dining', true, 6000); console.log(JSON.stringify(await st()))
  // ② 后厨：他与环境融为一体（清晰度 0.18）
  await cam(wx(site.bcx + 2.2), wy(site.sy - 0.9), sx, sy0 - 0.3, 0.02)
  await pose(sx, sy0, S0.f, 'cook', 'idle', 2.0, 0.3)
  await snap('blend', true, 6000); console.log(JSON.stringify(await st()))
  // ③ 闪光 → 僵住 → 被看见
  await cam(wx(site.bcx + 1.4), wy(site.sy - 1.2), sx, sy0, 0.05)
  await pose(sx, sy0, Math.PI / 2 + 0.25, 'freeze', 'flashFreeze', 0.9, 1)
  await say('闪光灯一亮，灶台边那个肥胖的人形僵住了。两只耳朵猛地竖了起来。')
  await snap('seen', false, 6000); console.log(JSON.stringify(await st()))
  await clearSay()
  // ④ 敲桌：你在桌子南边，他绕到对面敲三下
  const tb = await ev(`(()=>{const s=window.__ckS;const t=s.tables.filter(t=>t.y>s.sy+4).sort((a,b)=>Math.abs(a.x-s.bcx)-Math.abs(b.x-s.bcx))[0];return t})()`)
  const tx = wx(tb.x), ty = wy(tb.y)
  await cam(tx + 0.45, ty + 0.5 + 1.05, tx + 0.75, ty - 0.2, -0.02)
  await pose(tx + 0.8, ty + 0.5 - 1.07, Math.PI / 2, 'tap', 'tapTable', 1.42, 1, `C.chefSave(__engine).marked=1`)
  await say('他就站在桌子对面，用胖手指敲你的桌子。别回头。别看门。')
  await snap('tap', true, 6000); console.log(JSON.stringify(await st()))
  await clearSay()
  // ⑤ 背身 → 抡锅（蓄力到顶）
  await cam(tx + 0.75, ty + 0.5 + 2.75, tx + 0.45, ty + 0.5 + 1.2, 0.12)
  await pose(tx + 0.5, ty + 0.5 + 1.4, Math.PI / 2, 'swing', 'potSwing', 1.32, 1)
  await snap('swing', false, 6000); console.log(JSON.stringify(await st()))
  // ⑥ 冷库：铐在铁管上（HUD 面板 / 霜边 / 档案员遗物）
  await ev(`(async()=>{const C=${C};C.CHEF_QA.freeze=false;const e=__engine;const c=${CH};C.capture(e,c,'beast');C.chefDebug(e).ko=0;C.CHEF_QA.freeze=true;return !!C.chefDebug(e).cuff})()`, true).then((r) => console.log('cuffed', r))
  await ev(`(()=>{__look.pitch=0.02;return 1})()`)
  await snap('cold', true, 6500); console.log(JSON.stringify(await st()))
  // ⑦ 时限到：他在刀墙前取下那把雕刻刀
  const K = await ev(`(()=>window.__ckS.at.knife)()`)
  await ev(`(async()=>{const C=${C};const r=C.chefDebug(__engine);r.cuff=null;return 1})()`, true)
  await cam(K.x - 2.1, K.y + 1.9, K.x - 0.1, K.y - 0.2, 0.08)
  await pose(K.x, K.y, K.f, 'knife', 'takeKnife', 2.4, 1, 's.knife=true')
  await say('门外传来一声轻响：刀，从磁条上取了下来。')
  await snap('knife', true, 6000); console.log(JSON.stringify(await st()))
  await clearSay()
  // ⑧ 打烊：正门里面绑绳、推门闩
  const B = await ev(`(()=>window.__ckS.at.barricade)()`)
  await ev(`(async()=>{const C=${C};const e=__engine;const r=C.chefDebug(e);e.hotelShift.phase='shift';r.phase='shift';r.closed=true;r.closedUntil=1e9;return 1})()`, true)
  await cam(B.x + 1.9, B.y - 1.7, B.x - 0.1, B.y + 0.4, 0.0)
  await pose(B.x, B.y, B.f, 'barricade', 'barricade', 4.6, 1, 's.knife=false')
  await snap('barricade', true, 6500); console.log(JSON.stringify(await st()))
  // ⑨ 吃饭：屏幕边缘变暖 + 「再来一份」
  await ev(`(async()=>{const C=${C};const e=__engine;const r=C.chefDebug(e);e.hotelShift.phase='play';r.phase='play';r.closed=false;r.closedUntil=-1;r.plates.clear();const c=${CH};const s=C.ensureChef(c);s.mode='cook';s.clip='idle';s.seq++;s.vis=0;const st=window.__ckS.at.stove;const o=__engine.map.inf;c.x=st.x-o.ox;c.y=st.y-o.oy;c.facing=st.f;r.eating={key:'${tb.x},${tb.y}',t:0.5,dish:0};r.warmT=8;return 1})()`, true)
  await say('……再来一份也没关系吧。', 'thought')
  await cam(tx + 0.5, ty + 0.5 + 1.0, tx + 0.5, ty + 0.75, -0.62)
  await snap('eat', true, 6000); console.log(JSON.stringify(await st()))
  await clearSay()
  await ev(`(async()=>{const C=${C};C.chefDebug(__engine).eating=null;C.chefDebug(__engine).warmT=0;return 1})()`, true)
  // ⑩ 关掉燃气灶：他守着灶（stoveLean），火灭了
  await ev(`(async()=>{const C=${C};C.chefSave(__engine).stoveT=200;return 1})()`, true)
  await cam(wx(site.bcx + 2.6), wy(site.sy - 1.0), sx, sy0 - 0.4, 0.0)
  await pose(sx, sy0, S0.f, 'guard', 'stoveLean', 1.5, 1)
  await snap('guard', true, 6000); console.log(JSON.stringify(await st()))
  // ⑪ 远景背身：对着大锅吐
  await ev(`(async()=>{const C=${C};C.chefSave(__engine).stoveT=0;return 1})()`, true)
  await cam(wx(site.bcx + 1.2), wy(site.sy + 0.4), sx, sy0, 0.08)
  await pose(sx, sy0, S0.f, 'vomit', 'vomitPot', 2.6, 0.6)
  await snap('vomit', false, 6000); console.log(JSON.stringify(await st()))
  // ⑫ 摇铃引开：他走出后厨来到铃台前，耳朵抽搐
  const BS = await ev(`(()=>window.__ckS.at.bellStand)()`), BA = await ev(`(()=>window.__ckS.at.bellAt)()`)
  await cam(BS.x + 2.4, BS.y - 2.0, BS.x + 0.2, BS.y + 0.3, 0.04)
  await pose(BS.x, BS.y, BS.f, 'twitch', 'earTwitch', 0.75, 1)
  await say('叮——后厨的弹簧门晃了一下。')
  await snap('bell', true, 6000); console.log(JSON.stringify(await st()), JSON.stringify(BA))
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
