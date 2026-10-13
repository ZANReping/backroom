// Actual app, dedicated headless Chrome + server. Both owned processes are closed in finally.
import {spawn,spawnSync} from 'node:child_process'
import {mkdirSync,writeFileSync} from 'node:fs'
import {fileURLToPath} from 'node:url'
import net from 'node:net'
const root=fileURLToPath(new URL('../',import.meta.url)),out=root+'reports/title-save/',profile=root+'.cache/title-save-01a105d1',port=3188,cdp=9388,base=`http://127.0.0.1:${port}`
mkdirSync(out,{recursive:true});mkdirSync(profile,{recursive:true})
const free=port=>new Promise((resolve,reject)=>{const s=net.createServer();s.once('error',reject);s.listen(port,'127.0.0.1',()=>s.close(resolve))})
await free(port);await free(cdp)
const loadingOnly=process.argv.includes('--loading-only')
const wait=ms=>new Promise(r=>setTimeout(r,ms)),checks=[],shots=[],errors=[],logs=[],network=[],audit=[],delayed=[]
let server,browser,ws,next=0,complete=false;const pending=new Map()
const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++next;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params}))})
const ev=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result?.value}
const check=(v,label)=>{if(!v)throw Error(label);checks.push(label);console.log(label)}
async function until(expression,ms=120000){const end=Date.now()+ms;while(Date.now()<end){if(await ev(`Boolean(${expression})`))return;await wait(200)}throw Error('Timeout: '+expression)}
const shot=async name=>{await wait(300);const r=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});writeFileSync(out+name+'.png',Buffer.from(r.data,'base64'));shots.push(name)}
const click=async(selector,text)=>{await ev(`(()=>{const b=[...document.querySelectorAll(${JSON.stringify(selector)})].find(e=>e.textContent.includes(${JSON.stringify(text)}));if(!b)throw Error('Missing button '+${JSON.stringify(text)});b.click()})()`);await wait(150)}
async function size(width,height,mobile=false){await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile});await send('Emulation.setTouchEmulationEnabled',{enabled:mobile})}
async function title(level,label){await wait(700);await until(`document.querySelector('canvas[data-title-ready=true]')?.dataset.titleLevel==='${level}' && document.querySelector('.title-menu') && !document.querySelector('#boot-loader')`);check(await ev(`window.__renderer.levelCfg.id===${level}`),`${label}: actual scene is level ${level}`);const a=await ev('({...window.__titleAudit,seed:document.querySelector("canvas[data-title-seed]").dataset.titleSeed,viewport:[innerWidth,innerHeight],settings:JSON.parse(localStorage.getItem("br_settings")||"{}")})');audit.push({label,...a});check(!a.premature,`${label}: menu never precedes ready scene`);await shot(label)}
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
 const command=await send('Browser.getBrowserCommandLine');check(command.arguments.includes('--headless=new')&&command.arguments.some(a=>a.includes('title-save-01a105d1')),'owned browser uses true headless mode and dedicated profile')
 await send('Runtime.enable');await send('Page.enable');await send('Network.enable');await size(1440,900)
 await send('Page.addScriptToEvaluateOnNewDocument',{source:`window.__titleAudit={premature:false,firstFrame:null,menu:null,bootRemoved:null};setInterval(()=>{const a=window.__titleAudit,c=document.querySelector('canvas[data-title-ready]'),menu=document.querySelector('.title-menu');if(c&&!a.firstFrame)a.firstFrame=performance.now();if(menu&&!a.menu)a.menu=performance.now();if(menu&&c?.dataset.titleReady!=='true')a.premature=true;if(!document.querySelector('#boot-loader')&&!a.bootRemoved)a.bootRemoved=performance.now()},20)`})
 const init=await send('Page.addScriptToEvaluateOnNewDocument',{source:"localStorage.clear();sessionStorage.clear();localStorage.setItem('br_settings',JSON.stringify({renderResolution:'native',renderScale:100,maxPixelRatio:1,dynamicRes:false,lightMode:'classic',devMode:true}))"})
 await send('Page.navigate',{url:base});await title(0,'empty-save-level0');await send('Page.removeScriptToEvaluateOnNewDocument',{identifier:init.identifier})
 // Seed real snapshots in this browser's isolated localStorage without starting/overwriting a user run.
 await ev(`(async()=>{const s=await import('/src/game/engine/save.ts');const e=window.__engine;window.__testSnapshot={...s.snapshot(e),savedAt:100,level:1,mapSeed:20261008};localStorage.setItem('br_save_slot1',JSON.stringify(window.__testSnapshot));localStorage.setItem('br_save_auto',JSON.stringify({...window.__testSnapshot,level:4,savedAt:200}));localStorage.setItem('br_settings',JSON.stringify({...JSON.parse(localStorage.getItem('br_settings')||'{}'),renderResolution:'native',renderScale:100,maxPixelRatio:1,dynamicRes:false,lightMode:'classic',devMode:true}));window.__saveBaseline=[localStorage.getItem('br_save_slot1'),localStorage.getItem('br_save_auto')];sessionStorage.setItem('title-test-saves',JSON.stringify(window.__saveBaseline))})()`)
 if(loadingOnly){
   await send('Network.setCacheDisabled',{cacheDisabled:true})
   ws.addEventListener('message',e=>{const r=JSON.parse(e.data);if(r.method!=='Fetch.requestPaused')return;const index=delayed.length;delayed.push({url:r.params.request.url});void(async()=>{Object.assign(delayed[index],await ev("({boot:!!document.querySelector('#boot-loader'),menu:!!document.querySelector('.title-menu'),scene:document.querySelector('canvas[data-title-level]')?.dataset.titleLevel})"));if(index===0)await shot('boot-preparing-level4');await wait(1500);await send('Fetch.continueRequest',{requestId:r.params.requestId})})().catch(error=>logs.push(String(error)))})
   await send('Fetch.enable',{patterns:[{urlPattern:'*textures/l4*',requestStage:'Request'}]})
 }
 await send('Page.reload',{ignoreCache:true});await title(4,'latest-auto-level4')
 check(await ev("JSON.stringify([localStorage.getItem('br_save_slot1'),localStorage.getItem('br_save_auto')])===sessionStorage.getItem('title-test-saves')&&window.__engine.map===null&&window.__engine.player.level===0"),'title preview leaves snapshots and live player untouched')
 check(await ev("[...document.querySelectorAll('.menu-hint')].some(e=>e.textContent.includes('Level 4'))"),'Continue summary and scene choose the same latest slot')
 if(loadingOnly){check(delayed.some(r=>r.boot&&!r.menu&&r.scene==='4'),'delayed texture loading starts under boot screen while menu stays hidden');await send('Fetch.disable')}
 else{
 await click('.menu-btn','继续游戏');await click('.hud-panel button','继续')
 await until("document.querySelector('.hud-location-cluster') && !document.querySelector('#boot-loader')")
 check(await ev("window.__engine.player.level===4&&document.querySelector('.hud-location-cluster [data-title-theme]').dataset.titleTheme==='office'"),'Continue enters the saved level with its themed HUD')
 await shot('game-level4-hud')
 // Change an actual running level through the existing developer API, then save/quit using the real menu.
 await ev('window.__engine.devJump(10)');await until("window.__engine.player.level===10&&document.querySelector('.hud-location-cluster [data-title-theme=wheat]')&&!document.querySelector('[data-cutscene]')&&window.__renderer.isNearWorldReady(window.__engine)",120000)
 await shot('game-level10-hud')
 const font=await ev("getComputedStyle(document.querySelector('.hud-loc-name')).fontFamily");check(font.includes('Backroom Title Hand'),'wheat HUD uses the loading title handwriting font')
 await size(844,390,true);await shot('game-level10-hud-mobile');check(await ev("document.querySelector('.hud-loc-mobile[data-title-theme=wheat]')!==null"),'mobile HUD uses the same level theme')
 await size(1440,900,false);await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});await until("document.querySelector('.pause-panel')")
 await click('.pause-panel button','保存并退出到标题');await title(10,'quit-saved-level10')
 // Finite outpost and invalid JSON.
 for(const [level,label] of [[104,'finite-tom-diner'],[5,'hotel-level5']]){
 await ev(`(()=>{const raw=JSON.parse(localStorage.getItem('br_save_auto')||localStorage.getItem('br_save_slot1'));localStorage.setItem('br_save_slot2',JSON.stringify({...raw,level:${level},mapSeed:20261008,savedAt:Date.now()+10000}));})()`)
 await send('Page.reload');await title(level,label)
 }
 await ev("localStorage.setItem('br_save_slot2','invalid json');localStorage.removeItem('br_save_slot1');localStorage.removeItem('br_save_slot3');localStorage.removeItem('br_save_auto')");await send('Page.reload');await title(0,'invalid-save-fallback')
 }
 check(errors.length===0,'no uncaught runtime exceptions')
 complete=true
}finally{
 writeFileSync(out+(loadingOnly?'loading':'verification')+'.json',JSON.stringify({status:complete?'passed':'incomplete',checks,shots,errors,network,audit,delayed},null,2)+'\n');writeFileSync(out+(loadingOnly?'loading-console':'server-console')+'.log',logs.join('\n'))
 // These handles were created above after port ownership checks. Never discover/kill other servers.
 if(ws?.readyState===WebSocket.OPEN){try{await send('Browser.close')}catch{}ws.close()}
 for(const child of [browser,server])if(child?.pid&&child.exitCode===null)spawnSync('taskkill.exe',['/PID',String(child.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'})
}
