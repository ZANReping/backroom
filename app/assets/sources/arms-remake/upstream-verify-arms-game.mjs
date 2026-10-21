// 手臂（Entité 15-FR）重制第 3 阶段：在真实运行的游戏里验收（Level 1、真实渲染器/HUD/AI 数据结构，?cpu=1 CPU 蒙皮）。
// 先在 3388 端口起开发服务（npx vite --port 3388 --strictPort --host 127.0.0.1），再按阶段运行：
//   node scripts/verify-arms-game.mjs launch     启动本脚本专属无头 QA 浏览器（--headless=new、.cache/arms-game-qa、调试端口 9388）
//   node scripts/verify-arms-game.mjs enter      进入 L1（可重复运行直到进入）
//   node scripts/verify-arms-game.mjs shots      冻结 AI、按状态摆姿截图：风口待机 / 停电钻出 / 扑抓 / 被抓拖拽（第一人称）/ 手电烧焦缩回 / 焦皮碎片 / 被吐出
//   node scripts/verify-arms-game.mjs live       不冻结 AI：停电 + 奔跑噪音 → 真实出动 → 站着不动被抓 → 拖进风口 → 从别处吐出（截 game-live-*）
//   node scripts/verify-arms-game.mjs close      关闭 QA 浏览器
// 不连接任何已有浏览器；存档只写进本脚本独立浏览器目录的 localStorage。ARMS_QA_QUERY 默认 ?cpu=1。
import { spawn } from 'node:child_process'
import { mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
const query = process.env.ARMS_QA_QUERY ?? '?cpu=1'
const base = process.env.ARMS_QA_URL ?? 'http://127.0.0.1:3388', port = process.env.ARMS_GAME_CDP ?? '9388', out = 'reports/arms/'
mkdirSync(out, { recursive: true })
const profile = `${process.cwd()}/.cache/arms-game-qa`, pidFile = `${process.cwd()}/.cache/arms-game-qa.pid`
const phase = process.argv[2] ?? 'launch'
if (phase === 'launch') {
  rmSync(profile, { recursive: true, force: true })
  const c = spawn('chromium', ['--headless=new', '--enable-automation', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check', '--no-sandbox', '--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--window-size=1600,900', 'about:blank'], { stdio: 'ignore', detached: true })
  c.unref(); writeFileSync(pidFile, String(c.pid)); console.log('QA 浏览器 pid', c.pid); process.exit(0)
}
const errors = [], report = { phase, query, steps: [] }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
try {
  let page
  for (let i = 0; i < 80 && !page; i++) { await sleep(250); try { page = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find((p) => p.type === 'page') } catch { /* 等浏览器 */ } }
  if (!page) throw Error('QA 浏览器未启动')
  const ws = new WebSocket(page.webSocketDebuggerUrl); await new Promise((r) => ws.addEventListener('open', r, { once: true }))
  let seq = 0; const pending = new Map()
  ws.addEventListener('message', (e) => { const r = JSON.parse(e.data); if (r.method === 'Runtime.exceptionThrown') errors.push(JSON.stringify(r.params.exceptionDetails).slice(0, 600)); if (r.method === 'Runtime.consoleAPICalled' && r.params.type === 'error') errors.push(r.params.args?.map((a) => a.value ?? a.description).join(' ').slice(0, 600)); const p = pending.get(r.id); if (p) { pending.delete(r.id); r.error ? p.reject(r.error) : p.resolve(r.result) } })
  const send = (method, params = {}) => new Promise((resolve, reject) => { const id = ++seq; pending.set(id, { resolve, reject }); ws.send(JSON.stringify({ id, method, params })) })
  const ev = async (expression) => { const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw Error(JSON.stringify(r.exceptionDetails).slice(0, 900)); return r.result?.value }
  // live 阶段：无头 SwiftShader + CPU 蒙皮只有 ~1–2fps，而引擎每帧 dt 上限 0.05s，真实游戏时间走得极慢；
  // 每次轮询额外推进 ARMS_LIVE_PUMP（默认 8）个 0.05s 引擎步（同一套 engine.step / 真实 AI，只是不等渲染）
  const pump = phase === 'live' ? Number(process.env.ARMS_LIVE_PUMP ?? 8) : 0
  const until = async (expr, label, tries = 400, noPump = false) => { for (let i = 0; i < tries; i++) { await sleep(300); if (pump && !noPump) await ev(`(()=>{const e=__engine;for(let k=0;k<${pump};k++){if(${expr})break;e.step(0.05)}return true})()`); if (await ev(`Boolean(${expr})`)) return } throw Error('超时：' + label) }
  const shot = async (n) => writeFileSync(out + n + '.png', Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).data, 'base64'))
  const frames = async (n) => { const f0 = await ev('__renderer.frameTick'); await until(`__renderer.frameTick>=${f0 + n}`, `等待 ${n} 帧`, 300, true) } // 等渲染帧时不额外推进引擎
  const step = (name, data) => { report.steps.push({ name, ...data }); console.log(name, JSON.stringify(data)) }
  await send('Runtime.enable'); await send('Page.enable')
  const ver = await send('Browser.getVersion'), cl = await send('Browser.getBrowserCommandLine')
  if (!ver.userAgent.includes('HeadlessChrome') || !cl.arguments.includes('--headless=new') || !cl.arguments.some((a) => a.includes('arms-game-qa'))) throw Error('不是本脚本的无头 QA 浏览器')
  await send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 900, deviceScaleFactor: 1, mobile: false })
  if (phase === 'close') { await send('Browser.close').catch(() => {}); throw Error('closed') }
  const inGame = await ev(`Boolean(window.__engine && __engine.player.level===1 && __renderer?.isNearWorldReady(__engine))`).catch(() => false)
  if (phase === 'enter' && !inGame) {
    const navigated = await ev(`location.href.startsWith(${JSON.stringify(base)})`)
    if (!navigated) {
      const init = await send('Page.addScriptToEvaluateOnNewDocument', { source: `localStorage.clear();sessionStorage.clear();localStorage.setItem('br_settings',JSON.stringify({renderResolution:'native',renderScale:100,maxPixelRatio:1,dynamicRes:false,lightMode:'classic',sceneLightLimit:16,shadowQuality:1,lightShadows:1,loadingBudgetMs:6,devMode:true}))` })
      await send('Page.navigate', { url: base + '/' + query })
      await until('window.__engine && document.querySelector(".title-menu")', '标题界面')
      await send('Page.removeScriptToEvaluateOnNewDocument', { identifier: init.identifier })
    }
    await until('window.__engine && document.querySelector(".title-menu")', '标题界面')
    const hasSave = await ev(`Boolean(localStorage.getItem('br_save_slot1'))`)
    if (!hasSave) {
      await ev(`(()=>{const raw=__engine.snapshot();localStorage.setItem('br_save_slot1',JSON.stringify({...raw,seed:1601,level:1,mapSeed:1601,savedAt:Date.now(),player:{...raw.player,level:1}}))})()`)
      await send('Page.reload')
      await until(`document.querySelector('.title-menu')`, '读档标题')
    }
    await ev(`(()=>{const b=[...document.querySelectorAll('.menu-btn')].find(b=>b.textContent.includes('继续游戏'));b&&b.click()})()`)
    await sleep(800)
    await ev(`(()=>{const b=[...document.querySelectorAll('.hud-panel button')].find(b=>b.textContent.includes('继续'));b&&b.click()})()`)
    await until(`__engine.player.level===1 && !__engine.paused && __renderer.isNearWorldReady(__engine)`, '进入 L1', 600)
  }
  if (phase === 'enter') { step('已进入', { level: await ev('__engine.player.level') }); throw Error('enter-done') }
  if (!inGame) throw Error('还没有进入，先运行 enter')
  await ev(`(()=>{const b=[...document.querySelectorAll('.hud-panel button')].find(b=>b.textContent.trim()==='▾');b&&b.click();return true})()`) // 收起开发者面板

  // —— 在玩家附近找开阔地（半径 4m 同高可走、天花板 2.6–4.2m），放一只手臂 ——
  const live = phase === 'live'
  const setup = await ev(`(async()=>{
    const A=await import('/src/game/engine/armsAI.ts'),E=await import('/src/game/entities/index.ts'),M=await import('/src/game/world/mapgen.ts'),S=await import('/src/game/renderer/shared.ts')
    const e=__engine,m=e.map,p=e.player,wh=S.WALL_H[e.levelDef.gen]??3,R=4
    e.dev.god=${live ? 'false' : 'true'};e.dev.statLock=true;e.dev.frozenAI=${live ? 'false' : 'true'}
    e.dev.phenOff.${live ? 'delete' : 'add'}('flicker') // live 阶段不能屏蔽「闪烁」：phenOff 会让 ambient 每帧 endBlackout，停电立刻被结束
    const prev=m.entities.find(q=>q.id===990015)
    let spot=null
    if(prev&&prev.ar){const v=A.armsVentXY(e,prev.ar.vent);spot={x:v.x,y:v.y}}
    for(let rad=0;rad<40&&!spot;rad++)for(let dy=-rad;dy<=rad&&!spot;dy++)for(let dx=-rad;dx<=rad&&!spot;dx++){
      if(Math.max(Math.abs(dx),Math.abs(dy))!==rad)continue
      const cx=Math.floor(p.x)+dx+.5,cy=Math.floor(p.y)+dy+.5;let good=true
      for(let yy=-R;yy<=R&&good;yy+=.5)for(let xx=-R;xx<=R&&good;xx+=.5){if(xx*xx+yy*yy>R*R)continue;const x=cx+xx,y=cy+yy
        if(x<2||y<2||x>m.w-3||y>m.h-3||!M.walkableAt(m,Math.floor(x),Math.floor(y),0)||Math.abs(M.floorHeight(m,x,y,0))>.02||m.structures.some(s=>s.solid&&x>=s.x&&x<s.x+s.w&&y>=s.y&&y<s.y+s.h))good=false}
      const c=M.ceilingHeightAt(m,cx,cy,wh,0)
      if(good&&Number.isFinite(c)&&c>2.6&&c<4.2)spot={x:cx,y:cy}}
    if(!spot)throw Error('no open spot')
    if(!prev){
      m.entities=m.entities.filter(q=>Math.hypot(q.x-spot.x,q.y-spot.y)>16)
      const a=E.makeEntity('arms',spot.x,spot.y,0);a.id=990015;m.entities.push(a)
      const inf=m.inf;if(inf)inf.chunks.get(Math.floor((spot.x+inf.ox)/32)+','+Math.floor((spot.y+inf.oy)/32))?.entities.push(a)
      A.armsState(e,a)
    }
    const a=m.entities.find(q=>q.id===990015),s=A.armsState(e,a)
    p.equip.offhand={type:'flashlight',count:1};p.flashlight=false;p.battery=100;p.hp=100;p.sanity=100
    return{spot,ceil:s.vent.ceil,roof:s.vent.roof,count:s.count,seed:s.seed,yaw:+s.vent.yaw.toFixed(2),ductUp:s.vent.ductUp}})()`)
  step('setup', setup)
  const AM = `await import('/src/game/engine/armsAI.ts')`
  const placeLook = (x, y, tx, ty, tz) => ev(`(async()=>{const I=await import('/src/game/engine/interact.ts');const e=__engine,p=e.player;p.x=${x};p.y=${y};p.z=0;p.vz=0
    const dx=${tx}-p.x,dy=${ty}-p.y;__look.yaw=Math.atan2(-dx,-dy);__look.pitch=Math.atan2(${tz}-I.interactionEyeZ(e),Math.hypot(dx,dy));return true})()`)
  const lookAt = (tx, ty, tz) => ev(`(async()=>{const I=await import('/src/game/engine/interact.ts');const e=__engine,p=e.player;const dx=${tx}-p.x,dy=${ty}-p.y;__look.yaw=Math.atan2(-dx,-dy);__look.pitch=Math.atan2(${tz}-I.interactionEyeZ(e),Math.hypot(dx,dy));return true})()`)
  const info = () => ev(`(async()=>{const e=__engine,a=e.map.entities.find(q=>q.id===990015),R=__renderer,g=R.entityMeshes.get(990015);let cpu=0,sk=0,vents=0;g?.traverse(o=>{if(o.userData.cpuSkin&&o.visible)cpu++;if(o.isSkinnedMesh&&o.visible)sk++;if(o.name==='armsHome'||o.name==='armsTemp')vents++});
    return{mode:a?.ar?.mode,clipT:+(a?.ar?.clipT??0).toFixed(2),hidden:!!a?.hidden,visible:!!g?.visible,cpuSkinMeshes:cpu,gpuSkinVisible:sk,vents,run:e.armsRun.phase,hp:Math.round(e.player.hp),lost:R.three.getContext().isContextLost()}})()`)
  const S = (js) => ev(`(async()=>{const A=${AM};const e=__engine,a=e.map.entities.find(q=>q.id===990015),s=a.ar;${js};return true})()`)
  await until(`(()=>{const g=__renderer.entityMeshes.get(990015);return g&&g.visible&&g.userData.armsHome})()`, '模型就绪', 400)
  const take = async (name, data = {}, n = 6) => { await frames(n); step(name, { ...data, ...(await info()) }); await shot(`game-${name}`) }
  const want = (n) => !process.env.ARMS_SHOTS || process.env.ARMS_SHOTS.split(',').includes(n)
  const V = setup.spot, C = setup.ceil, MZ = C - 0.45
  const dir = { x: Math.cos(setup.yaw + Math.PI / 2), y: Math.sin(setup.yaw + Math.PI / 2) } // 观察方向：与管道水平段垂直
  const blackout = (on) => ev(`(()=>{const e=__engine;if(${on}){if(!(e.map.inf?.blackout||e.blackoutT>0)){e.blackoutPendingDur=9999;e.applyBlackout()}e.blackoutT=9999}else if(e.map.inf?.blackout||e.blackoutT>0)e.endBlackout();e.map.entities=e.map.entities.filter(q=>q.id===990015||!q.blackoutSpawn);return true})()`)

  if (phase === 'shots') {
    // 1) L1 天花板风口待机（来电，灯亮着；仰视）
    if (want('idle')) {
      await blackout(false)
      await S(`s.mode='hidden';s.t=0;s.clipT=0;a.hidden=true;e.armsRun.phase='none';e.armsRun.captor=-1`)
      await placeLook(V.x + dir.x * 2.2, V.y + dir.y * 2.2, V.x, V.y, C - 0.25); await take('idle', {}, 10)
    }
    // 2) 停电时钻出（手电开着照地面——不照手臂）
    if (want('emerge')) {
      await blackout(true)
      await ev(`(()=>{const p=__engine.player;p.flashlight=true;return true})()`)
      await placeLook(V.x + dir.x * 3.0, V.y + dir.y * 3.0, V.x, V.y, MZ - 0.9)
      await S(`s.mode='emerge';s.clipT=3.1;s.t=2.5;a.hidden=false`)
      await take('emerge', {}, 24)
    }
    // 3) 扑抓：爪张开扑向镜头（片段 1.12s，扑出瞬间）
    if (want('lunge')) {
      await blackout(true)
      const px = V.x + dir.x * 2.3, py = V.y + dir.y * 2.3
      await placeLook(px, py, V.x, V.y, MZ - 0.6)
      await S(`s.mode='search';s.t=1;s.clipT=1`)
      await frames(20)
      await S(`s.mode='lunge';s.clipT=0.5;s.strike={wx:${px}+(e.map.inf?.ox??0),wy:${py}+(e.map.inf?.oy??0),z:1.25}`)
      await frames(6)
      await S(`s.clipT=0.85`); await frames(10)
      await S(`s.clipT=1.13`); await take('lunge', {}, 8)
    }
    // 4) 被抓拖拽：第一人称（胸口被爪扣住、被提向风口，仰看风口与长臂）
    if (want('drag')) {
      await blackout(true)
      const px = V.x + dir.x * 2.1, py = V.y + dir.y * 2.1
      await placeLook(px, py, V.x, V.y, MZ)
      await S(`const ox=e.map.inf?.ox??0,oy=e.map.inf?.oy??0;const v=s.vent,mz=A.armsMouthZ(v);s.grabFrom={wx:${px}+ox,wy:${py}+oy,z:1.25};const gd=Math.hypot(${px}+ox-v.wx,${py}+oy-v.wy)||1;s.dragTo={wx:v.wx+(${px}+ox-v.wx)/gd*0.32,wy:v.wy+(${py}+oy-v.wy)/gd*0.32,z:mz-1.0};s.mode='grab';s.clipT=0.6;s.t=0.6;e.armsRun.captor=a.id;e.armsRun.phase='held';e.armsRun.struggle=4`)
      await frames(16)
      await S(`s.mode='drag';s.clipT=1.2`)
      await lookAt(V.x, V.y, MZ + 0.3); await take('drag', {}, 16)
      await ev(`(()=>{__look.pitch=-1.05;return true})()`); await take('drag-down', {}, 8)
      await S(`e.armsRun.phase='none';e.armsRun.captor=-1;s.mode='hidden';e.player.z=0`)
    }
    // 5) 手电照射：痉挛烧焦缩回（片段 0.75s）+ 6) 风口下的焦皮碎片
    if (want('burn')) {
      await blackout(true)
      await placeLook(V.x + dir.x * 2.8, V.y + dir.y * 2.8, V.x, V.y, MZ - 0.9)
      await ev(`(()=>{const p=__engine.player;p.flashlight=true;p.battery=100;return true})()`)
      await S(`s.mode='search';s.t=2;s.clipT=2`); await frames(20)
      await S(`s.mode='burnRetreat';s.clipT=0.2`); await frames(8)
      await S(`s.clipT=0.75`); await take('burn', {}, 10)
    }
    if (want('debris')) {
      await blackout(true)
      await S(`s.marks=s.marks.filter(m=>m.kind!=='burn');s.marks.push({kind:'burn',wx:s.vent.wx,wy:s.vent.wy,z:s.vent.floorZ,age:1.2,seed:7});s.mode='hidden';s.clipT=0;a.hidden=true`)
      await ev(`(()=>{const p=__engine.player;p.flashlight=true;return true})()`)
      await placeLook(V.x + dir.x * 1.6, V.y + dir.y * 1.6, V.x, V.y, 0.05); await take('debris', {}, 30)
    }
    // 7) 被吐出：另一个风口（临时风口），玩家刚摔在下方、仰看手臂缩回
    if (want('spit')) {
      await blackout(true)
      const sp = await ev(`(async()=>{const A=${AM};const e=__engine,a=e.map.entities.find(q=>q.id===990015),s=a.ar,m=e.map;const M=await import('/src/game/world/mapgen.ts');
        // 按 AI 的临时风口规则找一个 15–40m 外的吐出风口（远离实心结构/灯具、落点合法）
        let pick=null
        for(let t=0;t<12&&!pick;t++){const q=A.armsTempSpitFor(e,s.vent);if(q&&A.armsLandingOk(e,q.vent.wx-(m.inf?.ox??0)+q.dir.dx*3.4,q.vent.wy-(m.inf?.oy??0)+q.dir.dy*3.4,0))pick=q}
        if(!pick)throw Error('no spit spot')
        const ox=m.inf?.ox??0,oy=m.inf?.oy??0,v=pick.vent
        const best={x:v.wx-ox,y:v.wy-oy,dx:pick.dir.dx,dy:pick.dir.dy,c:v.ceil}
        s.temps=[v];const mz=best.c-.45
        s.spit={ventId:v.id,holdWX:v.wx+best.dx*.55,holdWY:v.wy+best.dy*.55,holdZ:mz-1.05,pushWX:v.wx+best.dx*1.35,pushWY:v.wy+best.dy*1.35,pushZ:mz-1.45,dirX:best.dx,dirY:best.dy}
        s.spitVent=v;s.mode='spit';s.clipT=0.4;e.armsRun.phase='none';e.armsRun.captor=-1
        return best})()`)
      await placeLook(sp.x + sp.dx * 3.4, sp.y + sp.dy * 3.4, sp.x, sp.y, sp.c - 1.2)
      await frames(12)
      await S(`s.clipT=1.0`); await frames(8)
      await S(`s.clipT=1.2`); await take('spit', { spot: sp }, 10)
      await S(`s.clipT=1.75`); await take('spit-retract', {}, 10)
      await S(`s.mode='hidden';s.spit=null;s.spitVent=null`)
    }
    await blackout(false)
    await ev(`(()=>{__engine.dev.frozenAI=false;__engine.player.flashlight=false;return true})()`)
    ws.close(); throw Error('shots-done')
  }
  if (phase === 'live') {
    // 真实 AI：停电 → 在风口旁奔跑（真实噪音事件）→ 刮擦 → 钻出 → 站着不动 → 扑抓 → 拖拽 → 吞入 → 吐出
    await S(`s.mode='hidden';s.cd=0;s.noise=0;s.t=0;s.clipT=0;a.hidden=true;e.armsRun.phase='none';e.armsRun.captor=-1;a.hp=30;s.hpSeen=30`)
    await blackout(true)
    await ev(`(()=>{const p=__engine.player;p.flashlight=false;p.hp=100;return true})()`)
    const px = V.x + dir.x * 2.2, py = V.y + dir.y * 2.2
    await placeLook(px, py, V.x, V.y, MZ - 0.6)
    for (let i = 0; i < 6; i++) { await ev(`(()=>{const e=__engine;e.noiseEvent(e.player.x,e.player.y,10,true);return true})()`); await sleep(120) }
    await until(`__engine.map.entities.find(q=>q.id===990015).ar.mode!=='hidden'`, '出动', 100)
    step('live-trigger', await info())
    await until(`(()=>{const s=__engine.map.entities.find(q=>q.id===990015).ar;return s.mode==='emerge'&&s.clipT>2.9||s.mode==='search'})()`, '钻出', 400)
    await take('live-emerge', {}, 2)
    await until(`__engine.armsRun.phase==='held'`, '被抓', 400)
    await take('live-grab', {}, 2)
    await until(`(()=>{const s=__engine.map.entities.find(q=>q.id===990015).ar;return s.mode==='drag'&&s.clipT>1.5})()`, '拖拽', 400)
    await lookAt(V.x, V.y, MZ + 0.2); await take('live-drag', {}, 2)
    await until(`__engine.armsRun.phase==='inside'`, '吞入', 600); await take('live-inside', {}, 2)
    await until(`__engine.armsRun.hint==='spat'&&__engine.armsRun.phase==='none'`, '吐出落地', 900)
    const land = await ev(`(async()=>{const A=${AM};const e=__engine,p=e.player,a=e.map.entities.find(q=>q.id===990015),s=a.ar;const v=s.temps[s.temps.length-1]??s.vent;const ox=e.map.inf?.ox??0,oy=e.map.inf?.oy??0;return{x:p.x,y:p.y,z:p.z,ok:A.armsLandingOk(e,p.x,p.y,p.z),dist:Math.hypot(p.x+ox-s.vent.wx,p.y+oy-s.vent.wy),vx:v.wx-ox,vy:v.wy-oy,c:v.ceil,hp:p.hp,over:e.over}})()`)
    await lookAt(land.vx, land.vy, land.c - 0.9); await take('live-spat', { land }, 4)
    await blackout(false)
    await ev(`(()=>{const e=__engine;e.dev.god=true;e.dev.frozenAI=true;return true})()`)
    ws.close(); throw Error('live-done')
  }
  ws.close()
} catch (err) { const m = String(err?.message ?? err); if (!['enter-done', 'closed', 'shots-done', 'live-done'].includes(m)) { report.error = m; console.log('失败：', m) } }
finally {
  report.errors = errors
  if (phase === 'shots' || phase === 'live') {
    const f = out + `game-verify-${phase}.json`
    if (process.env.ARMS_SHOTS) { try { const old = JSON.parse(readFileSync(f, 'utf8')); report.steps = [...old.steps.filter((o) => !report.steps.some((n) => n.name === o.name)), ...report.steps]; report.errors = [...(old.errors ?? []), ...report.errors] } catch { /* 首批 */ } }
    writeFileSync(f, JSON.stringify(report, null, 2) + '\n')
  }
  if (phase === 'close') { try { process.kill(-Number(readFileSync(pidFile, 'utf8')), 'SIGKILL') } catch { /* 已退出 */ } }
  if (errors.length) console.log('浏览器错误：', errors.length, JSON.stringify(errors.slice(0, 5)).slice(0, 1500))
  process.exit(0)
}
