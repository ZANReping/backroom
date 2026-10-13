// Actual app, dedicated headless Chrome + server. Both owned processes are closed in finally.
import {spawn,spawnSync} from 'node:child_process'
import {mkdirSync,writeFileSync} from 'node:fs'
import {fileURLToPath} from 'node:url'
import net from 'node:net'
const root=fileURLToPath(new URL('../',import.meta.url)),out=root+'reports/l5-entry/',profile=root+'.cache/l5-entry-01a105d1',port=3188,cdp=9388,base=`http://127.0.0.1:${port}`
mkdirSync(out,{recursive:true});mkdirSync(profile,{recursive:true})
const free=port=>new Promise((resolve,reject)=>{const s=net.createServer();s.once('error',reject);s.listen(port,'127.0.0.1',()=>s.close(resolve))})
await free(port);await free(cdp)
const ultra=process.argv.includes('--ultra')
const mode=process.argv.includes('--classic')?'classic':'realistic'
const wait=ms=>new Promise(r=>setTimeout(r,ms)),checks=[],shots=[],errors=[],logs=[],network=[],audit=[]
let server,browser,ws,next=0,complete=false;const pending=new Map()
const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++next,timer=setTimeout(()=>{pending.delete(id);reject(Error('CDP timeout: '+method))},method==='Browser.close'?3000:45000);pending.set(id,{resolve:r=>{clearTimeout(timer);resolve(r)},reject:e=>{clearTimeout(timer);reject(e)}});ws.send(JSON.stringify({id,method,params}))})
const ev=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result?.value}
const check=(v,label)=>{if(!v)throw Error(label);checks.push(label);console.log(label)}
async function until(expression,ms=120000){const end=Date.now()+ms;while(Date.now()<end){if(await ev(`Boolean(${expression})`))return;await wait(200)}throw Error('Timeout: '+expression)}
const shot=async name=>{await wait(300);const r=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});writeFileSync(out+name+'.png',Buffer.from(r.data,'base64'));shots.push(name)}
const click=async(selector,text)=>{await ev(`(()=>{const b=[...document.querySelectorAll(${JSON.stringify(selector)})].find(e=>e.textContent.includes(${JSON.stringify(text)}));if(!b)throw Error('Missing button '+${JSON.stringify(text)});b.click()})()`);await wait(150)}
async function size(width,height,mobile=false){await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile});await send('Emulation.setTouchEmulationEnabled',{enabled:mobile})}
try{
 server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:root,env:{...process.env,L0_VERIFY:'1'},windowsHide:true,stdio:['ignore','pipe','pipe']})
 server.stdout.on('data',b=>logs.push(b.toString()));server.stderr.on('data',b=>logs.push(b.toString()))
 for(let i=0;i<160;i++){try{if((await fetch(base)).ok)break}catch{}await wait(250)}
 const chrome=process.env.CHROME_PATH??'C:/Program Files/Google/Chrome/Application/chrome.exe'
 const args=['--headless=new','--enable-automation',`--remote-debugging-port=${cdp}`,`--user-data-dir=${profile}`,'--no-first-run','--disable-background-timer-throttling','--disable-renderer-backgrounding','about:blank']
 browser=spawn(chrome,args,{windowsHide:true,stdio:'ignore'})
 let page;for(let i=0;i<100;i++){try{const list=await(await fetch(`http://127.0.0.1:${cdp}/json/list`)).json();page=list.find(p=>p.type==='page');if(page)break}catch{}await wait(200)}
 if(!page)throw Error('Dedicated Chrome did not start')
 ws=new WebSocket(page.webSocketDebuggerUrl);await new Promise(r=>ws.addEventListener('open',r,{once:true}))
 ws.addEventListener('message',e=>{const r=JSON.parse(e.data);if(r.method==='Runtime.exceptionThrown')errors.push(r.params.exceptionDetails);if(r.method==='Runtime.consoleAPICalled'&&['error','warning'].includes(r.params.type))logs.push(JSON.stringify(r.params));if(r.method==='Network.loadingFailed')network.push(r.params);const p=pending.get(r.id);if(p){pending.delete(r.id);r.error?p.reject(r.error):p.resolve(r.result)}})
 const command=await send('Browser.getBrowserCommandLine');check(command.arguments.includes('--headless=new')&&command.arguments.some(a=>a.includes('l5-entry-01a105d1')),'owned browser uses true headless mode and dedicated profile')
 await send('Runtime.enable');await send('Page.enable');await send('Network.enable');await size(1440,900)

 const init=await send('Page.addScriptToEvaluateOnNewDocument',{source:"localStorage.clear();sessionStorage.clear();localStorage.setItem('br_settings',JSON.stringify({renderResolution:'native',renderScale:100,maxPixelRatio:1,dynamicRes:false,lightMode:'"+mode+"',sceneLightLimit:16,shadowQuality:1,farLights:false,devMode:true}))"})
 await send('Page.navigate',{url:base});await until("document.querySelector('.title-menu')",180000);await send('Page.removeScriptToEvaluateOnNewDocument',{identifier:init.identifier})
 await ev("(async()=>{const s=await import('/src/game/engine/save.ts');const raw=s.snapshot(window.__engine);localStorage.setItem('br_save_slot1',JSON.stringify({...raw,seed:424242,level:4,mapSeed:424242,savedAt:Date.now()}))})()")
 await send('Page.reload');await wait(800);await until("document.querySelector('.title-menu')&&document.querySelector('canvas[data-title-level=\"4\"][data-title-ready=true]')",180000)
 await click('.menu-btn','继续游戏');await click('.hud-panel button','继续')
 await until("window.__engine.player.level===4&&document.querySelector('.hud-location-cluster')&&!window.__engine.paused",180000)
 check(true,'Continue enters Level 4')
 if(ultra)await ev("window.__engine.on(e=>{if(e.kind==='levelchange'&&window.__engine.player.level===5){window.__renderer.setSceneLightLimit(48);window.__renderer.setFarLights(true)}})")
 await send('Profiler.enable');await send('Profiler.start');const profileStart=Date.now();let profiling=true
 await ev("(()=>{const r=window.__renderer.three,old=r.compileAsync;window.__compiles=[];r.compileAsync=function(...args){const rec={at:performance.now(),meshes:0};args[0].traverse(o=>{if(o.isMesh)rec.meshes++});window.__compiles.push(rec);const p=old.apply(this,args);rec.submit=performance.now()-rec.at;return p.finally(()=>{rec.ms=performance.now()-rec.at})}})()")
 await ev("(()=>{const e=window.__engine;e.dev.god=true;e.dev.frozenAI=true;const exit=e.levelDef.exits.find(e=>e.kind==='oldstairs');if(!exit)throw Error('Missing L4 stairs definition');e.takeExit(exit)})()")
 const end=Date.now()+150000
 while(Date.now()<end){
   const state=await ev("(()=>{const e=window.__engine,r=window.__renderer;return {time:performance.now(),level:e.player.level,transition:e.transition,seed:e.mapSeed,paused:e.paused,ready:r.isNearWorldReady(e),mothReady:r.mothWarmupDone,mothJob:!!r.mothWarmup,flashJob:!!r.flashWarmup,built:r.builtMap===e.map,chunks:r.chunkGroups.size,task:r.cityChunkTask?.key,npcs:e.npcs.map(n=>({id:n.id,d:Math.hypot(n.x-e.player.x,n.y-e.player.y),mesh:r.npcMeshes.has(n.id)})),cut:document.querySelector('[data-cutscene]')?.getAttribute('data-phase'),intro:!!document.querySelector('[data-level-intro]'),text:document.body.innerText.slice(-1200),frame:r.three.info.render.frame}})()")
   if(profiling&&Date.now()-profileStart>16000){const {profile}=await send('Profiler.stop');writeFileSync(out+'loading.cpuprofile',JSON.stringify(profile));profiling=false}
   audit.push(state);console.log(JSON.stringify({...state,npcs:state.npcs.length,text:state.text.slice(-120)}))
   writeFileSync(out+'diagnostics.json',JSON.stringify({mode,audit,errors,logs},null,2))
   if(state.level===5&&state.ready&&!state.paused&&!state.intro&&!state.cut){check(true,'Level 4 staircase transition finishes');break}
   if(errors.length)break
   await wait(2000)
 }
 if(profiling){const {profile}=await send('Profiler.stop');writeFileSync(out+'loading.cpuprofile',JSON.stringify(profile))}
 writeFileSync(out+'compile-times.json',JSON.stringify(await ev('window.__compiles')))
 await shot('level5-entry-'+mode+(ultra?'-ultra':''))
 check(await ev('window.__engine.player.level===5&&!window.__engine.paused&&window.__renderer.isNearWorldReady(window.__engine)'),'Level 5 playable')
 await ev("window.__engine.persist()")
 if(ultra)await ev("localStorage.setItem('br_settings',JSON.stringify({...JSON.parse(localStorage.getItem('br_settings')),sceneLightLimit:48,farLights:true}))")
 await send('Page.reload');await wait(800);await until("document.querySelector('.title-menu')&&document.querySelector('canvas[data-title-level=\"5\"][data-title-ready=true]')",180000)
 check(true,'Level 5 saved title background loads')
 await click('.menu-btn','继续游戏');await click('.hud-panel button','继续')
 await until("window.__engine.player.level===5&&document.querySelector('.hud-location-cluster')&&!window.__engine.paused&&!document.querySelector('[data-level-intro]')",180000)
 await shot('level5-continue-'+mode+(ultra?'-ultra':''))
 const before=await ev('({x:window.__engine.player.x,y:window.__engine.player.y})')
 await ev("(async()=>{const {canOccupy,PLAYER_RADIUS}=await import('/src/game/core/player.ts');const e=window.__engine;for(const [x,y]of [[0,-1],[1,0],[0,1],[-1,0]]){if(canOccupy(e.map,e.player.x+x,e.player.y+y,PLAYER_RADIUS,{z:e.player.z})){window.__look.yaw=Math.atan2(-x,-y);break}}})()")
 await send('Input.dispatchKeyEvent',{type:'keyDown',key:'ArrowUp',code:'ArrowUp',windowsVirtualKeyCode:38});await wait(800);await send('Input.dispatchKeyEvent',{type:'keyUp',key:'ArrowUp',code:'ArrowUp',windowsVirtualKeyCode:38})
 const after=await ev('({x:window.__engine.player.x,y:window.__engine.player.y})')
 check(Math.hypot(after.x-before.x,after.y-before.y)>.1,'restored Level 5 accepts movement input')
 check(true,'Continue restores Level 5 and dismisses loading')
 check(!logs.some(s=>/Shader Error|VALIDATE_STATUS|Error compiling|program is not valid/.test(s)),'no shader compilation errors')
 check(errors.length===0,'no uncaught runtime exceptions')
 complete=true
}finally{
 writeFileSync(out+mode+(ultra?'-ultra':'')+'-verification.json',JSON.stringify({status:complete?'passed':'incomplete',checks,shots,errors,network,audit},null,2)+'\n');writeFileSync(out+mode+(ultra?'-ultra':'')+'-console.log',logs.join('\n'))
 if(ws?.readyState===WebSocket.OPEN){try{await send('Browser.close')}catch{}ws.close()}
 for(const child of [browser,server])if(child?.pid&&child.exitCode===null)spawnSync('taskkill.exe',['/PID',String(child.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'})
}

