// 售货机 重制：无头 Chromium 截图验收（proto-vending.html）。用法：node scripts/verify-window.mjs [视图名...]
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
const port = process.env.VM_QA_CDP ?? '9499', out = 'reports/l5hotel/game/'
let base = process.env.VM_QA_URL ?? 'http://127.0.0.1:3498'
mkdirSync(out, { recursive: true })
const want = process.argv.slice(2).length ? process.argv.slice(2) : ['game-portrait', 'game-notice', 'game-beastdoor', 'game-office', 'game-lobby', 'game-bev', 'game-bevdoor', 'game-boiler']
const up = async () => { try { return (await fetch(base + '/proto-l5hotel.html')).ok } catch { return false } }
let vite = null
if (!(await up())) {
  vite = spawn('npx', ['vite', '--port', '3498', '--strictPort', '--host', '127.0.0.1'], { stdio: 'ignore', detached: true, env: { ...process.env, L0_VERIFY: '1' } })
  for (let i = 0; i < 120 && !(await up()); i++) await new Promise((r) => setTimeout(r, 500))
}
const chrome = spawn(process.env.CHROME ?? '/workspace/work/.pw-libs/chromium.sh', ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${process.cwd()}/.cache/l5-qa-game`, '--enable-automation', '--no-first-run', '--no-default-browser-check', '--disable-gpu-sandbox', '--no-sandbox', '--enable-unsafe-swiftshader', '--use-angle=swiftshader', 'about:blank'], { stdio: 'ignore' })
const errors = [], results = {}
try {
  let page
  for (let i = 0; i < 60 && !page; i++) { await new Promise((r) => setTimeout(r, 250)); try { page = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find((p) => p.type === 'page') } catch { /* 等浏览器起来 */ } }
  if (!page) throw Error('QA 浏览器未启动')
  const ws = new WebSocket(page.webSocketDebuggerUrl); await new Promise((r) => ws.addEventListener('open', r, { once: true }))
  let seq = 0; const pending = new Map()
  ws.addEventListener('message', (e) => { const r = JSON.parse(e.data); if (r.method === 'Runtime.exceptionThrown') { errors.push(r.params.exceptionDetails); console.log('EXC', JSON.stringify(r.params.exceptionDetails).slice(0, 800)) }; if (r.method === 'Runtime.consoleAPICalled' && r.params.type === 'error') errors.push(r.params.args?.map((a) => a.value ?? a.description).join(' ')); const p = pending.get(r.id); if (p) { pending.delete(r.id); r.error ? p.reject(r.error) : p.resolve(r.result) } })
  const send = (method, params = {}) => new Promise((resolve, reject) => { const id = ++seq; pending.set(id, { resolve, reject }); ws.send(JSON.stringify({ id, method, params })) })
  const ev = async (expression, awaitPromise = false) => { const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise }); return r.result?.value }
  await send('Runtime.enable'); await send('Page.enable')
  const ver = await send('Browser.getVersion'), cl = await send('Browser.getBrowserCommandLine')
  if (!ver.userAgent.includes('HeadlessChrome') || !cl.arguments.includes('--headless=new')) throw Error('不是本脚本的无头 QA 浏览器')
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  const waitFor = async (expr, label, tries = 900) => { for (let i = 0; i < tries; i++) { if (await ev(`Boolean(${expr})`)) return; await sleep(300) } throw Error('超时：' + label) }
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 760, deviceScaleFactor: 1, mobile: false })
  const init = await send('Page.addScriptToEvaluateOnNewDocument', { source: `localStorage.clear();sessionStorage.clear();localStorage.setItem('br_settings',JSON.stringify({renderResolution:'native',renderScale:100,maxPixelRatio:1,dynamicRes:false,lightMode:'full',sceneLightLimit:16,shadowQuality:1,lightShadows:1,loadingBudgetMs:200,devMode:false}))` })
  await send('Page.navigate', { url: base + '/' })
  console.log('nav'); await waitFor('window.__engine && document.querySelector(".title-menu")', 'title'); console.log('title ok')
  await send('Page.removeScriptToEvaluateOnNewDocument', { identifier: init.identifier })
  await ev(`(()=>{const raw=__engine.snapshot();localStorage.setItem('br_save_slot1',JSON.stringify({...raw,seed:515151,level:5,mapSeed:515151,savedAt:Date.now(),player:{...raw.player,level:5}}))})()`)
  await send('Page.reload')
  await waitFor(`window.__engine && document.querySelector(".title-menu")`, 'title2')
  await sleep(1500)
  await ev(`(()=>{const b=[...document.querySelectorAll('.menu-btn')].find(b=>b.textContent.includes('继续游戏'));b&&b.click()})()`)
  await sleep(1500)
  await ev(`(()=>{const b=[...document.querySelectorAll('.hud-panel button')].find(b=>b.textContent.includes('继续'));b&&b.click()})()`)
  await waitFor('__engine.player.level===5 && !__engine.paused', 'in L5')
  await ev(`(()=>{__renderer.chunkBudgetMs=250;return 1})()`)
  await ev(`(()=>{const e=__engine;e.dev.god=true;e.dev.statLock=true;e.dev.frozenAI=true})()`)
  // 跳到某楼层 → 找结构 → 站位 + 朝向
  const soft = async (expr, tries) => { for (let i = 0; i < tries; i++) { if (await ev(`Boolean(${expr})`)) return true; await sleep(300) } return false }
  // 真实电梯换层（与玩家按楼层键同一条路径：过场 → loadLevel → 预热），再在已载入地图里找结构站位
  const go = async (floor, pick) => {
    const cur = await ev('__engine.hotel.floor')
    if (cur !== floor) {
      const prevMap = await ev('(window.__mapTag=(window.__mapTag||0)+1, __engine.map.__tag=window.__mapTag, 1)')
      void prevMap
      await ev(`(async()=>{const L=await import('/src/game/engine/l5Elevator.ts');L.openElevator(__engine,${floor === 0 ? "'service'" : "'main'"});L.elevatorGo(__engine,${floor});return 1})()`)
      await waitFor(`__engine.hotel.floor===${floor} && !__engine.transition && __engine.map && __engine.map.__tag===undefined`, 'elevator ' + floor, 600)
      console.log('arrived', floor, await soft('__renderer.isNearWorldReady(__engine)', 300))
    }
    await ev('(()=>{const e=__engine;e.introT=0;e.map.entities=[];return 1})()')
    const r = await ev(`(()=>{const e=__engine,m=e.map,P=e.player,walk=(x,y)=>m.tiles[Math.floor(y)*m.w+Math.floor(x)]===1;${pick};})()`)
    console.log('aim', floor, JSON.stringify(r))
    await sleep(1500)
    console.log('ready', floor, await soft('__renderer.isNearWorldReady(__engine)', 200))
    await sleep(4000)
    return r
  }
  const shot = async (name) => { writeFileSync(out + name + '.png', Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).data, 'base64')); console.log('shot', name) }
  // 站在 (sx,sy) 看 (tx,ty)
  const AIM = `const aim=(sx,sy,tx,ty,pitch=0)=>{P.x=sx;P.y=sy;P.z=0;P.facing=Math.atan2(ty-sy,tx-sx);__look.yaw=-P.facing-Math.PI/2;__look.pitch=pitch;return {sx,sy,tx,ty}};`
  for (const name of want) {
    try {
      if (name === 'game-maid' || name === 'game-maid-approach') {
        // [maid] 管家实机：直走廊里，管家在前方 4.5 m 面朝玩家；approach 视图把车停在她身后
        const appr = name === 'game-maid-approach'
        results[name] = await go(1, AIM + `for(let r=2;r<30;r++)for(let a=0;a<6.28;a+=0.4){const x=Math.floor(P.x+Math.cos(a)*r)+.5,y=Math.floor(P.y+Math.sin(a)*r)+.5;for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){let okk=true;for(let k=0;k<=8;k++)if(!walk(x+dx*k,y+dy*k)||!walk(x+dx*k+dy,y+dy*k+dx)&&!walk(x+dx*k-dy,y+dy*k-dx))okk=false;if(okk){window.__mp={x,y,dx,dy};return aim(x+dy*0.4,y+dx*0.4,x+dx*5,y+dy*5,0.04)}}}return null`)
        await ev(`(async()=>{const M=await import('/src/game/engine/maidAI.ts');const e=__engine,q=window.__mp;const mx=q.x+q.dx*${appr ? 3.2 : 4.6},my=q.y+q.dy*${appr ? 3.2 : 4.6};const m=M.spawnMaid(e,{x:mx,y:my});m.facing=Math.atan2(-q.dy,-q.dx);const s=M.ensureMaid(m);s.greeted=true;if(${appr}){s.cart={x:mx+q.dx*1.6,y:my+q.dy*1.6,f:Math.atan2(-q.dy,-q.dx)+0.35};s.mode='approach';s.clip='approach';s.look=[0.15,0];s.speed=1.3}else{s.mode='patrol';s.clip='push';s.speed=1.1}s.seq++;window.__maid=m;return {id:m.id,x:m.x,y:m.y,n:e.map.entities.length}})()`, true).then((r) => console.log('maid', JSON.stringify(r))).catch((x) => console.log('maid-err', String(x)))
        console.log('warm', await soft('window.__maid && __renderer.entityMeshes.get(window.__maid.id) && !window.__maid.presentationPending', 600))
        await sleep(3000)
        console.log('probe', JSON.stringify(await ev(`(()=>{const m=window.__maid,R=__renderer,g=R.entityMeshes.get(m.id);return {inMap:__engine.map.entities.includes(m),g:!!g,vis:g&&g.visible,pos:g&&[g.position.x,g.position.y,g.position.z],P:[__engine.player.x,__engine.player.y],pend:m.presentationPending,hidden:m.hidden}})()`)))
      } else
      if (name === 'game-bev') {
        results[name] = await go(4, AIM + `const t=m.structures.find(s=>s.kind==='oddtable');if(!t)return null;const tx=t.x+.5,ty=t.y+.5;for(const [dx,dy] of [[6,5],[-6,5],[6,-5],[-6,-5],[5,0],[0,5]]){if(walk(tx+dx,ty+dy))return aim(tx+dx,ty+dy,tx-dx*.6,ty-dy*.6,-0.05)}return null`)
      } else if (name === 'game-notice') {
        results[name] = await go(1, AIM + `const ds=m.structures.filter(s=>s.kind==='l5rule'&&!s.data.ontable).sort((a,b)=>Math.hypot(a.x-P.x,a.y-P.y)-Math.hypot(b.x-P.x,b.y-P.y));for(const d of ds){for(const [dx,dy] of [[0,1],[0,-1],[1,0],[-1,0]]){if(!walk(d.x+.5-dx,d.y+.5-dy)&&walk(d.x+.5+dx*1.6,d.y+.5+dy*1.6))return aim(d.x+.5+dx*1.6,d.y+.5+dy*1.6,d.x+.5,d.y+.5,0.12)}}return null`)
        await sleep(800); await shot('game-notice')
        console.log('read', await ev(`(async()=>{const H=await import('/src/game/engine/l5Hotel.ts');const e=__engine,P=e.player,m=e.map;const d=e.interactTarget&&e.interactTarget.s;if(!d||d.kind!=='l5rule')return 'no-target';H.hotelReadRule(e,d);return 1})()`, true))
        await sleep(1500); console.log('dbg', await ev(`JSON.stringify({paused:__engine.paused,veil:!!document.querySelector('.hn-veil'),html:(document.querySelector('.hn-card')||{}).outerHTML?.slice(0,120)})`)); await shot('game-notice-read')
        await ev(`window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}))`); await sleep(800)
        continue
      } else if (name === 'game-flicker') {
        await go(1, AIM + `return {x:P.x,y:P.y}`)
        await sleep(4000); await shot('flicker-on')
        await ev(`(()=>{const e=__engine;window.__flk=setInterval(()=>{e.hotelFlicker={x:e.player.x,y:e.player.y,t:2.85}},10);return 1})()`)
        await sleep(3000); await shot('flicker-dark')
        console.log('probe', JSON.stringify(await ev(`(()=>{const R=__renderer,e=__engine,out=[],v=new (R.scene.position.constructor)();const fx=new Set(R.fixtures.map(f=>f.mat));R.scene.traverse(o=>{if(!o.isMesh||!o.visible)return;const g=o.geometry;if(!g.boundingSphere)g.computeBoundingSphere();v.copy(g.boundingSphere.center).applyMatrix4(o.matrixWorld);const d=Math.hypot(v.x-e.player.x,v.z-e.player.y)-g.boundingSphere.radius;if(d>5)return;for(const m of [].concat(o.material)){const c=m.color;if(!c||c.r+c.g+c.b<1.4)continue;out.push([o.type,m.type,c.getHexString(),fx.has(m)?1:0,R.flGlow?R.flGlow.some(x=>x.mat===m)?1:0:-1,o.isInstancedMesh?o.count:0,!!m.vertexColors,(m.emissive?m.emissive.getHexString():'')])}});return out.slice(0,40)})()`)))
        await ev(`(()=>{clearInterval(window.__flk);__engine.hotelFlicker=null;return 1})()`)
        continue
      } else if (name === 'maidcodex') {
        // [maid] 图鉴专页：遭遇 6 次全解锁 + 失物车里放几件东西
        await go(1, AIM + `return {x:P.x,y:P.y}`)
        await ev(`(async()=>{const S=await import('/src/game/core/storage.ts');const seen=JSON.parse(S.storage.get('br_codex_seen')||'{}');seen.maid=6;S.storage.set('br_codex_seen',JSON.stringify(seen));
          const M=await import('/src/game/engine/maidAI.ts');const sv=M.maidSave(__engine);sv.warn=3;sv.clean=1;sv.reclaim=2;sv.cart.push({type:'crowbar',count:1,t:Date.now()},{type:'almond',count:2,t:Date.now()},{type:'flashlight',count:1,t:Date.now()});return 1})()`, true)
        await ev(`__engine.emit({kind:'faction',text:'terrorhotel'})`); await sleep(2000)
        await ev(`(()=>{const b=[...document.querySelectorAll('button')].find(b=>b.textContent==='← 返回'||b.textContent?.includes('返回团体'));b&&b.click();return 1})()`); await sleep(600)
        await ev(`(()=>{const b=[...document.querySelectorAll('button')].find(b=>b.textContent?.trim()==='实体');b&&b.click();return !!b})()`); await sleep(1200)
        await ev(`(()=>{const c=document.querySelector('[data-entity-card=maid]');c&&c.scrollIntoView({block:'center'});return !!c})()`); await sleep(800); await shot('maidcodex-list')
        await ev(`(()=>{document.querySelector('[data-entity-card=maid]').click();return 1})()`); await sleep(1500)
        await ev(`(()=>{const p=document.querySelector('.hud-panel');p&&p.scrollIntoView({block:'start'});return 1})()`); await sleep(500); await shot('maidcodex-top')
        await ev(`(()=>{const p=document.querySelector('.mcf');p&&p.scrollIntoView({block:'start'});return 1})()`); await sleep(500); await shot('maidcodex-file')
        for (let k = 0; k < 4; k++) {
          await ev(`(()=>{const f=document.querySelector('[data-entity-preview=maid]');f&&f.scrollIntoView({block:'center'});return 1})()`)
          await soft(`document.querySelector('[data-entity-preview=maid]')?.dataset.state==='ready'`, 240); await sleep(400); await shot('maidcodex-pose' + k)
          for (let c = 0; c < 4; c++) { await soft(`!document.querySelector('[data-entity-preview=maid] button')?.disabled`, 240); await ev(`(()=>{document.querySelector('[data-entity-preview=maid] button')?.click();return 1})()`); await sleep(300) }
        }
        await ev(`window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}))`); await sleep(800)
        results[name] = await ev(`({ok:1})`)
        continue
      } else if (name === 'ledger') {
        await go(1, AIM + `return {x:P.x,y:P.y}`)
        await ev(`(async()=>{const H=await import('/src/game/engine/l5Hotel.ts');const e=__engine,b=e.hotelBook;
          const cards=e.map.structures.filter(s=>s.kind==='l5rule').slice(0,8);for(const c of cards)H.hotelReadRule(e,c);
          const ids=Object.keys(b.rules);if(ids[0]){b.rules[ids[0]]='true'};if(ids[1])H.hotelPencil(e,ids[1],'false');if(ids[2])H.hotelPencil(e,ids[2],'true');
          if(!b.rules.desk13){b.rules.desk13='false';b.src.desk13='4F · 走廊'}
          b.floors=[...new Set([...b.floors,1,2,4,0,8])];Object.assign(b.seen,{beverly:4,boilerroom:0,flicker:1,office:1,lounge:2});b.rooms=['lobby'];b.gazes=2;
          e.hotel.lost.push({type:'crowbar',count:1,t:Date.now()},{type:'almond',count:2,t:Date.now()},{type:'flashlight',count:1,t:Date.now()});
          e.hotel.attn=62;e.hotel.stay=1384;H.saveBook(b);return 1})()`, true)
        await sleep(600)
        await ev(`__engine.emit({kind:'faction',text:'terrorhotel'})`)
        await sleep(2500)
        const tabs = ['登记卡', '员工名录', '住客须知', '楼层图录', '契约与失物']
        for (let i = 0; i < tabs.length; i++) {
          await ev(`(()=>{const b=[...document.querySelectorAll('.hl-tabs button')].find(b=>b.textContent==='${tabs[i]}');b&&b.click();const p=document.querySelector('.hl-book');p&&p.scrollIntoView({block:'start'});return !!b})()`)
          await sleep(1500); await shot('ledger-' + (i + 1))
        }
        await ev(`(()=>{__engine.player.sanity=28;const b=[...document.querySelectorAll('.hl-tabs button')].find(b=>b.textContent==='登记卡');b&&b.click();return 1})()`)
        await sleep(300)
        await ev(`(()=>{const b=[...document.querySelectorAll('.hl-tabs button')].find(b=>b.textContent==='住客须知');b&&b.click();return 1})()`)
        await sleep(1500); await shot('ledger-mad')
        await ev(`window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}))`); await sleep(800)
        results[name] = await ev(`({book:document.querySelectorAll('.hl-book').length})`)
        continue
      } else if (name === 'game-beastdoor') {
        await go(1, AIM + `return {x:P.x,y:P.y}`)
        results[name] = await ev(`(async()=>{const H=await import('/src/game/engine/l5Hotel.ts');const e=__engine,P=e.player;for(let k=0;k<16;k++){P.facing=k*Math.PI/8;__look.yaw=-P.facing-Math.PI/2;const s=H.hotelFlickerEvent(e);if(s){window.__bd=s;return {x:s.x,y:s.y,k}}}return null})()`, true)
        await sleep(1200); await shot('game-beastdoor-flicker')
        await sleep(3500); await soft('__renderer.isNearWorldReady(__engine)', 60); await sleep(1500)
      } else if (name === 'game-office' || name === 'game-lobby') {
        const kind = name === 'game-office' ? 'beast' : 'lobby', id = kind === 'beast' ? 117 : 118
        await ev(`(async()=>{const H=await import('/src/game/engine/l5Hotel.ts');if(__engine.player.level!==5)return 0;H.hotelEnterPocket(__engine,'${kind}');return 1})()`, true)
        await waitFor(`__engine.player.level===${id} && !__engine.transition`, 'pocket ' + id, 600)
        console.log('pocket ready', await soft('__renderer.isNearWorldReady(__engine)', 200))
        results[name] = await ev(`(()=>{const e=__engine,P=e.player;P.facing=-Math.PI/2;__look.yaw=-P.facing-Math.PI/2;__look.pitch=0.05;return {x:P.x,y:P.y,sanity:P.sanity}})()`)
        await sleep(10000); await shot(name)
        await ev(`(()=>{const e=__engine;e.takeExit(e.map.exits[0].def);return 1})()`)
        await waitFor('__engine.player.level===5 && !__engine.transition', 'back to L5', 600)
        results[name].back = await ev(`({floor:__engine.hotel.floor,rooms:__engine.hotelBook.rooms,last:__engine.msgLog.slice(-4).map(m=>m.text)})`)
        continue
      } else if (name === 'game-bevdoor') {
        results[name] = await go(4, AIM + `const ds=m.structures.filter(s=>s.kind==='l5walldoor');for(const d of ds){for(const [dx,dy] of [[0,1],[0,-1],[1,0],[-1,0]]){if(!walk(d.x+.5-dx,d.y+.5-dy)&&walk(d.x+.5+dx*3.2,d.y+.5+dy*3.2))return aim(d.x+.5+dx*3.2,d.y+.5+dy*3.2,d.x+.5,d.y+.5,0.02)}}return null`)
      } else if (name === 'game-portrait') {
        results[name] = await go(1, AIM + `const ds=m.structures.filter(s=>s.kind==='bigpainting'&&s.data&&s.data.gaze);for(const d of ds){for(const [dx,dy] of [[0,1],[0,-1],[1,0],[-1,0]]){if(!walk(d.x+.5-dx,d.y+.5-dy)&&walk(d.x+.5+dx*2.6,d.y+.5+dy*2.6))return aim(d.x+.5+dx*2.6+dy*0.8,d.y+.5+dy*2.6+dx*0.8,d.x+.5,d.y+.5,0.1)}}return null`)
      } else if (name === 'game-boiler') {
        results[name] = await go(0, AIM + `const ds=m.structures.filter(s=>s.kind==='pipes'&&s.data&&s.data.steam===1);for(const d of ds){const dir=d.data.dir;const sx=d.x+.5+dir*2.6,sy=d.y+.5+2.2;if(walk(sx,sy)){window.__pipe=d;return aim(sx,sy,d.x+.5+dir*0.9,d.y+.5,-0.08)}}return null`)
        // 等到喷射相位
        for (let i = 0; i < 60; i++) { if (await ev(`(()=>{const d=window.__pipe;return d&&d.data.jet===1})()`)) break; await sleep(250) }
        await sleep(700)
      }
      await shot(name)
    } catch (err) { console.log('ERR', name, String(err)); results[name] = { err: String(err) } }
  }
  await send('Browser.close').catch(() => {})
  ws.close()
} finally {
  // 与上次结果合并（分批运行时保留其它视图的记录；本次运行的视图覆盖旧值、错误只记本次）
  let prev = {}
  try { if (existsSync(out + 'verify-result.json')) prev = JSON.parse(readFileSync(out + 'verify-result.json', 'utf8')).results ?? {} } catch { /* 旧文件损坏则忽略 */ }
  writeFileSync(out + 'verify-result.json', JSON.stringify({ results: { ...prev, ...results }, errors }, null, 2) + '\n')
  try { chrome.kill('SIGKILL') } catch { /* 已退出 */ }
  if (vite) { try { process.kill(-vite.pid, 'SIGTERM') } catch { /* 已退出 */ } }
  if (errors.length) console.log('浏览器错误：', JSON.stringify(errors).slice(0, 3000))
}
