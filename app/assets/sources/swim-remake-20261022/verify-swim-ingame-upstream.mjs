// [swim] 游泳重制阶段 2 实机截图：蛙泳手臂、踩水、憋气晕影、缺氧黑屏（真实应用、真实引擎与渲染器）。
// 用法：node scripts/verify-swim-ingame.mjs → reports/swim-ingame/
// swiftshader 下一帧要好几秒：用假的 rAF 时间戳让每个渲染帧固定前进 1/30s，逐帧截图合成 GIF。
// 用法：node scripts/verify-tiny-ingame.mjs [l7] [l8]      截图与结果 → reports/tiny-ingame/
// 流程：标题页 → 写一个 L7 存档走「继续游戏」进入 → 借调试入口把玩家放到环形场台心门（世界坐标 L7_ARENA）前 →
//   (a) 小小盘踞在门上方；(b) 真实使用动作连吹 4 声石卡祖笛（engine.useSlot + engine.step）→ 小小进入 repel，抱头退开；
//   (d) 第一人称：持笛静止手型 + 吹奏动作中段（门上方的小小正在抱头）；
//   再用调试入口 devJump(8) 进 L8 → 传送到乐器洞（l8InstrumentCave(seed)）→ (c) 洞厅全景、岩壁乐器近景（按渲染层真实网格位置取景）。
// swiftshader 下每秒只有零点几到几帧：每张图前等 near-world 就绪、实体网格 visible，并按 rAF 计数预热 ≥ 40 帧。
// 若 TINY_QA_URL 未提供且 3473 端口无服务，本脚本自己启动 vite（--port 3473 --strictPort），结束时关闭。
// 本脚本自己启动/关闭专属 QA 浏览器（/workspace/work/.pw-libs/chromium.sh、--headless=new、独立用户目录 .cache/swim-ingame-qa、调试端口 9473）。
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
const port = process.env.SWIM_QA_CDP ?? '9475', out = process.env.SWIM_OUT ?? 'reports/swim-ingame/'
const vport = process.env.SWIM_PORT ?? '3475'
const base = process.env.TINY_QA_URL ?? `http://127.0.0.1:${vport}`
const want = new Set(process.argv.slice(2).length ? process.argv.slice(2) : ['l7', 'l8'])
const W = 1280, H = 720
mkdirSync(out, { recursive: true })
// 中文字体（HUD 提示）：/workspace/work/.fonts 里的 NotoSansSC，经一份最小 fontconfig 交给 Chromium
mkdirSync('.cache', { recursive: true })
if (!existsSync('.cache/fonts.conf')) writeFileSync('.cache/fonts.conf', '<?xml version="1.0"?>\n<!DOCTYPE fontconfig SYSTEM "fonts.dtd">\n<fontconfig><include ignore_missing="yes">/etc/fonts/fonts.conf</include><dir>/workspace/work/.fonts</dir></fontconfig>\n')
const up = async () => { try { return (await fetch(base + '/')).ok } catch { return false } }
let vite = null
if (!(await up())) {
  vite = spawn('npx', ['vite', '--port', vport, '--strictPort', '--host', '127.0.0.1'], { stdio: 'ignore', detached: true, env: { ...process.env, L0_VERIFY: '1' } })
  for (let i = 0; i < 240 && !(await up()); i++) await new Promise((r) => setTimeout(r, 500))
}
const chrome = spawn(process.env.CHROME ?? '/workspace/work/.pw-libs/chromium.sh', ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${process.cwd()}/.cache/swim-ingame-qa`, '--enable-automation', '--no-first-run', '--no-default-browser-check', '--disable-gpu-sandbox', '--no-sandbox', '--enable-unsafe-swiftshader', '--use-angle=swiftshader', `--window-size=${W},${H}`, 'about:blank'], { stdio: 'ignore', env: { ...process.env, FONTCONFIG_FILE: process.env.FONTCONFIG_FILE ?? `${process.cwd()}/.cache/fonts.conf` } })
const errors = [], result = { checks: [], shots: [], info: {} }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a)
try {
  let page
  for (let i = 0; i < 120 && !page; i++) { await sleep(250); try { page = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find((p) => p.type === 'page') } catch { /* 等浏览器起来 */ } }
  if (!page) throw Error('QA 浏览器未启动')
  const ws = new WebSocket(page.webSocketDebuggerUrl); await new Promise((r) => ws.addEventListener('open', r, { once: true }))
  let seq = 0; const pending = new Map()
  ws.addEventListener('message', (e) => {
    const r = JSON.parse(e.data)
    if (r.method === 'Runtime.exceptionThrown') errors.push(JSON.stringify(r.params.exceptionDetails).slice(0, 600))
    if (r.method === 'Runtime.consoleAPICalled' && r.params.type === 'error') errors.push(r.params.args?.map((a) => a.value ?? a.description).join(' ').slice(0, 600))
    const p = pending.get(r.id); if (p) { pending.delete(r.id); r.error ? p.reject(r.error) : p.resolve(r.result) }
  })
  const send = (method, params = {}) => new Promise((resolve, reject) => { const id = ++seq; pending.set(id, { resolve, reject }); ws.send(JSON.stringify({ id, method, params })) })
  const ev = async (expression) => { const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw Error(JSON.stringify(r.exceptionDetails).slice(0, 900)); return r.result?.value }
  const until = async (expr, label, tries = 900) => { for (let i = 0; i < tries; i++) { if (await ev(`Boolean(${expr})`).catch(() => false)) return; await sleep(250) } throw Error('超时：' + label) }
  const shot = async (name) => { writeFileSync(out + name + '.png', Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).data, 'base64')); result.shots.push(out + name + '.png'); log('📷', name) }
  const check = (ok, label) => { result.checks.push(`${ok ? '✔' : '✘'} ${label}`); log(`${ok ? '✔' : '✘'} ${label}`) }
  await send('Runtime.enable'); await send('Page.enable')
  const ver = await send('Browser.getVersion'), cl = await send('Browser.getBrowserCommandLine')
  if (!ver.userAgent.includes('HeadlessChrome') || !cl.arguments.includes('--headless=new')) throw Error('不是本脚本的无头 QA 浏览器')
  await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false })
  const init = await send('Page.addScriptToEvaluateOnNewDocument', { source: `(()=>{const raf=window.requestAnimationFrame.bind(window);let fake=performance.now();window.requestAnimationFrame=(cb)=>raf(()=>{fake+=1000/30;cb(fake)})})();localStorage.clear();sessionStorage.clear();localStorage.setItem('br_settings',JSON.stringify({renderResolution:'native',renderScale:100,maxPixelRatio:1,dynamicRes:false,lightMode:'realistic',sceneLightLimit:8,shadowQuality:0,lightShadows:0,loadingBudgetMs:6,devMode:true}))` })
  await send('Page.navigate', { url: base + '/' })
  await until('window.__engine && document.querySelector(".title-menu")', '标题页')
  await send('Page.removeScriptToEvaluateOnNewDocument', { identifier: init.identifier })
  log('标题页就绪')
  // 写一个 L7 存档，走「继续游戏」进入（真实加载路径）
  await ev(`(()=>{const raw=__engine.snapshot();localStorage.setItem('br_save_slot1',JSON.stringify({...raw,seed:720,level:7,mapSeed:720,savedAt:Date.now(),player:{...raw.player,level:7}}))})()`)
  await send('Page.reload')
  await until(`document.querySelector('canvas[data-title-level="7"][data-title-ready=true]')`, 'L7 存档标题')
  const click = (sel, text) => ev(`(()=>{const b=[...document.querySelectorAll(${JSON.stringify(sel)})].find(b=>b.textContent.includes(${JSON.stringify(text)}));if(!b)throw Error('缺按钮 '+${JSON.stringify(text)});b.click()})()`)
  await click('.menu-btn', '继续游戏'); await sleep(300); await click('.hud-panel button', '继续')
  const playable = (lv) => `__engine.player.level===${lv} && !__engine.paused && !__engine.transition && !document.querySelector("[data-cutscene]") && __renderer.isNearWorldReady(__engine)`
  await until(playable(7), 'L7 可玩', 1200)
  check(true, '进入 L7（读档继续游戏）')
  // 页面侧工具：rAF 帧计数、固定玩家位置/视角（主循环的游泳浮力不会把镜头带走）、钉住小小的抱头 recoil
  await ev(`(()=>{window.__fc=0;window.__pin=null;window.__holdRecoil=null;(function f(){__fc++;const e=__engine,p=e.player,q=__pin;if(q){const m=e.map;p.x=q.wx-(m.inf?.ox??0);p.y=q.wy-(m.inf?.oy??0);p.z=q.z;p.vz=0;__look.yaw=q.yaw;__look.pitch=q.pitch;e.particles=e.particles.filter(o=>Math.hypot(o.x-p.x,o.y-p.y)>2.5)}
    if(__holdRecoil!==null){for(const [id,g] of __renderer.entityMeshes){const sm=g.userData.tinySm;if(sm&&id===__holdRecoil)sm.recoilT=Math.max(sm.recoilT,1.0)}}requestAnimationFrame(f)})()})()`)
  // swiftshader 下 L8 体积洞穴一块 chunk 要好几秒：放宽每帧建网格预算（默认 3/6ms，设置里最多 6/8ms）
  await ev(`(()=>{__renderer.chunkBudgetMs=60;__renderer.loadingBudgetMs=60})()`)
  const settle = async (minFrames = 40, extra = '', maxWait = 1200) => {
    await sleep(600)
    for (let i = 0; i < maxWait; i++) { if (await ev(`__engine.map.entities.every(q=>!q.presentationPending) && __renderer.isNearWorldReady(__engine) ${extra}`).catch(() => false)) break; if (i === maxWait - 1) { result.checks.push('⚠ 就绪等待超时'); log('⚠ 就绪等待超时') } await sleep(250) }
    const f0 = await ev('__fc'); for (let i = 0; i < 2400; i++) { if ((await ev('__fc')) - f0 >= minFrames) break; await sleep(100) }
    result.info.lastFrames = (await ev('__fc')) - f0
  }
  // 镜头：站在 (x,y,z)（地图局部坐标，z = 脚底），看向 (tx,ty,tz)。钉住的是世界坐标：
  // 无限层窗口平移（updateInfiniteWindow 把玩家坐标减掉平移量）后仍站在原地——钉局部坐标会让窗口一路平移下去
  const aim = (x, y, z, tx, ty, tz) => ev(`(()=>{const dx=${tx}-(${x}),dy=${ty}-(${y}),dz=${tz}-(${z}+1.55);const m=__engine.map;window.__pin={wx:${x}+(m.inf?.ox??0),wy:${y}+(m.inf?.oy??0),z:${z},yaw:Math.atan2(-dx,-dy),pitch:Math.atan2(dz,Math.hypot(dx,dy))};__engine.player.facing=Math.atan2(dy,dx);return __pin})()`)


  await ev(`(()=>{const e=__engine,p=e.player;e.dev.god=true;e.dev.statLock=false;e.dev.frozenAI=true
    p.flashlight=true;p.battery=100;p.equip.offhand={type:'flashlight',count:1};p.hotbar[p.selected]=null;e.syncPassives?.();e.map.entities=[];return true})()`)
  const goto = async (wx, wy, z) => {
    await ev(`(()=>{const e=__engine,m=e.map,p=e.player;p.x=${wx}-m.inf.ox;p.y=${wy}-m.inf.oy;p.z=${z};e.updateInfiniteWindow();p.x=${wx}-m.inf.ox;p.y=${wy}-m.inf.oy;p.z=${z}})()`)
    await sleep(400)
  }
  const L = await ev(`(async()=>{const L7=await import('/src/game/world/infiniteL7.ts');return {O:L7.L7_ORIGIN}})()`)
  const O = L.O
  const wx = O.x + 70, wy = O.y + 10
  const key = (code, down) => ev(`window.dispatchEvent(new KeyboardEvent('${down ? 'keydown' : 'keyup'}',{code:'${code}'}))`)
  const pin = (z, yaw, pitch, breath) => ev(`(()=>{const m=__engine.map;window.__pin={wx:${wx}+0*(m.inf?.ox??0),wy:${wy},z:${z},yaw:${yaw},pitch:${pitch}};window.__breath=${breath ?? 'null'};return 1})()`)
  // 每个 rAF：钉住世界坐标与视角（游泳速度照常算，划水和手臂照常动）；可选钉住憋气程度
  await ev(`(()=>{window.__fc=0;window.__pin=null;window.__breath=null;(function f(){__fc++;const e=__engine,p=e.player,q=__pin;if(q){const m=e.map;p.x=q.wx-(m.inf?.ox??0);p.y=q.wy-(m.inf?.oy??0);p.z=q.z;p.vz=0;__look.yaw=q.yaw;__look.pitch=q.pitch;e.particles=e.particles.filter(o=>Math.hypot(o.x-p.x,o.y-p.y)>1.2)}
    if(__breath!==null)e.breathT=__breath;requestAnimationFrame(f)})()})()`)
  await ev(`(()=>{__renderer.chunkBudgetMs=60;__renderer.loadingBudgetMs=60})()`)
  const waitFrames = async (n) => { const f0 = await ev('__fc'); for (let i = 0; i < 6000; i++) { if ((await ev('__fc')) - f0 >= n) break; await sleep(50) } }
  const ready = async () => { for (let i = 0; i < 600; i++) { if (await ev('__renderer.isNearWorldReady(__engine)').catch(() => false)) break; await sleep(250) } }
  const shotSeq = async (name, n) => { for (let i = 0; i < n; i++) { await waitFrames(1); await shot(`${name}-${String(i).padStart(2, '0')}`) } }
  await goto(wx, wy, -6)
  await pin(-6, 1.2, -0.12)
  await ready(); await waitFrames(30)
  if (process.env.SWIM_PROBE) {
    await ev('__breath=35*0.75'); await waitFrames(20)
    result.info.probe = await ev(`({hud:!!document.querySelector('.game-hud'),panels:document.querySelectorAll('.hud-panel').length,o2:!!document.querySelector('.anim-o2Pulse'),stage:__engine.swim.stage,o2k:__engine.swim.o2k,hudHidden:__engine.hudHidden,overlay:document.querySelector('.game-hud')?.getAttribute('style')?.slice(0,80),ui:document.documentElement.dataset.ui||document.body.dataset.ui||'',chain:(()=>{const out=[];let el=document.querySelector('.anim-o2Pulse');while(el&&el!==document.body){const cs=getComputedStyle(el);out.push([el.className.slice(0,40),cs.opacity,cs.display,cs.visibility,cs.zIndex,cs.transform.slice(0,30)]);el=el.parentElement}return out})(),canvasZ:getComputedStyle(document.querySelector('canvas')).zIndex,top:(()=>{const e=document.elementFromPoint(640,360);return e?e.tagName+'.'+String(e.className).slice(0,50):''})()})`)
    log(JSON.stringify(result.info.probe)); await shot('probe'); throw Error('probe done')
  }
  // A：水下冲刺划水（W + Shift）
  await key('KeyW', true); await key('ShiftLeft', true)
  await waitFrames(20)
  const st = await ev('({stroke:__engine.swim.strokes,since:__engine.swim.sinceStroke,v:Math.hypot(__engine.swim.vx,__engine.swim.vy,__engine.swim.vz),sub:__engine.submerged})')
  check(st.stroke > 0 && st.sub, `水下冲刺在划水（${JSON.stringify(st)}）`)
  await shotSeq('a-stroke', 18)
  await key('ShiftLeft', false); await key('KeyW', false)
  // B：水面踩水
  await pin(0.05, 1.2, -0.05)
  await waitFrames(40)
  await shotSeq('b-tread', 8)
  // C：憋气 → 胸口抽动 → 缺氧
  await pin(-6, 1.2, -0.12, 35 * 0.75)
  await waitFrames(30); await shot('c1-urge')
  await ev('__breath=35*0.93'); await waitFrames(40); await shot('c2-contract')
  await ev('__breath=37.5'); await waitFrames(80); await shot('c3-blackout')
  check(await ev('__engine.swim.blackK>0.2'), '缺氧黑屏在推进')
  writeFileSync(out + 'verify-result.json', JSON.stringify(result, null, 2) + '\n')
  await send('Browser.close').catch(() => {})
  ws.close()
} catch (err) {
  result.error = String(err?.stack ?? err)
  console.error(err)
} finally {
  result.errors = errors
  writeFileSync(out + 'verify-result.json', JSON.stringify(result, null, 2) + '\n')
  try { chrome.kill('SIGKILL') } catch { /* 已退出 */ }
  if (vite) try { process.kill(-vite.pid, 'SIGKILL') } catch { /* 已退出 */ }
  log(errors.length ? `浏览器错误 ${errors.length} 条（见 verify-result.json）` : '无浏览器错误')
  process.exit(0)
}
