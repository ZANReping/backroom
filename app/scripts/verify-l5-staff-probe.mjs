import{spawn}from'node:child_process'
import{existsSync,mkdirSync,writeFileSync,realpathSync,rmSync}from'node:fs'
import{fileURLToPath}from'node:url'
import path from'node:path'
import net from'node:net'
import{performance}from'node:perf_hooks'
const polish=process.argv.includes('--polish')
const devWorld=process.argv.includes('--dev-world')
const app=fileURLToPath(new URL('../',import.meta.url)),mode=process.argv.includes('--classic')?'classic':'realistic',label=process.argv.find(a=>a.startsWith('--label='))?.slice(8)??('game-'+mode),seed=515151.25,out=path.join(app,devWorld?'reports/l5-dev-world-20261104':polish?'reports/l5-polish-20261104':'reports/l5-staff-fixes-20261104',label)
mkdirSync(out,{recursive:true});const profile=path.join(out,`qa-${Date.now()}-${process.pid}`);mkdirSync(profile)
const sleep=ms=>new Promise(r=>setTimeout(r,ms)),free=()=>new Promise(resolve=>{const s=net.createServer();s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>resolve(p))})})
const port=await free(),cdp=await free(),base=`http://127.0.0.1:${port}`,result={seed,mode,port,cdp,errors:[],failedRequests:[]};let server,browser,ws,seq=0,log='';const pending=new Map()
writeFileSync(path.join(out,'session.json'),JSON.stringify({port,cdp,profile,owner:process.pid}))
const wait=async(fn,label)=>{const start=performance.now();while(performance.now()-start<100000){if(result.errors.length||result.failedRequests.some(r=>r.status>=500))throw Error('Runtime/module error at '+label);try{const v=await fn();if(v)return v}catch(error){if(result.errors.length)throw error}await sleep(200)}throw Error('Timeout '+label)}
const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++seq,t=setTimeout(()=>{pending.delete(id);reject(Error('CDP timeout '+method))},360000);pending.set(id,{resolve:v=>{clearTimeout(t);resolve(v)},reject:e=>{clearTimeout(t);reject(e)}});ws.send(JSON.stringify({id,method,params}))})
const ev=async expression=>{if(ws?.readyState!==1)throw Error('QA browser closed');const v=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(v.exceptionDetails)throw Error(JSON.stringify(v.exceptionDetails));return v.result?.value}
const shot=async name=>writeFileSync(path.join(out,name+'.png'),Buffer.from((await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false})).data,'base64'))
try{
 server=spawn(process.execPath,[path.join(app,'scripts/outpost-return-server.mjs'),String(port),profile,process.argv.includes('--baseline')?'baseline':'current'],{cwd:app,windowsHide:true,stdio:['ignore','pipe','pipe']});server.stdout.on('data',d=>log=(log+d).slice(-24000));server.stderr.on('data',d=>log=(log+d).slice(-24000));await wait(async()=>(await fetch(base)).ok,'server')
 browser=spawn(process.env.CHROME_PATH??'C:/Program Files/Google/Chrome/Application/chrome.exe',[`--user-data-dir=${profile}`,`--remote-debugging-port=${cdp}`,'--headless=new','--autoplay-policy=no-user-gesture-required','--enable-automation','--no-first-run','--no-default-browser-check','--disable-background-networking','--window-size=1920,1080','about:blank'],{windowsHide:true,stdio:'ignore'})
 const page=await wait(async()=>(await(await fetch(`http://127.0.0.1:${cdp}/json/list`)).json()).find(p=>p.type==='page'),'browser');ws=new WebSocket(page.webSocketDebuggerUrl);await new Promise(r=>ws.addEventListener('open',r,{once:true}))
 ws.addEventListener('message',event=>{const v=JSON.parse(event.data);if(v.method==='Inspector.targetCrashed'||v.method==='Target.targetCrashed')result.errors.push(v);if(v.method==='Runtime.exceptionThrown'||v.method==='Runtime.consoleAPICalled'&&v.params.type==='error')result.errors.push(v.params);if(v.method==='Network.responseReceived'&&v.params.response.status>=400)result.failedRequests.push(v.params.response);const p=pending.get(v.id);if(p){pending.delete(v.id);v.error?p.reject(v.error):p.resolve(v.result)}})
 ws.addEventListener('close',()=>{for(const p of pending.values())p.reject(Error('QA browser closed'));pending.clear()})
 result.command=(await send('Browser.getBrowserCommandLine')).arguments;if(!result.command.includes('--headless=new')||!result.command.includes(`--user-data-dir=${profile}`)||!result.command.includes(`--remote-debugging-port=${cdp}`))throw Error('QA ownership mismatch')
 result.pids={browser:browser.pid,server:server.pid};await send('Runtime.enable');await send('Inspector.enable');await send('Network.enable');await send('Page.enable');await send('Emulation.setDeviceMetricsOverride',{width:1920,height:1080,deviceScaleFactor:1,mobile:false})
 const boot=performance.now();await send('Page.navigate',{url:base+`/verifier/l5-full-import-app.html?mode=${mode}&seed=${seed}&baseline=${process.argv.includes('--baseline')?1:0}`});await wait(()=>ev('window.hotelImportApp?.ready===true'),'app');result.appBootMs=performance.now()-boot
 await wait(()=>ev("[...document.querySelectorAll('button')].some(b=>b.textContent.includes('继续游戏'))"),'title')
 const start=performance.now();await ev("[...document.querySelectorAll('button')].find(b=>b.textContent.includes('继续游戏'))?.click()");await wait(()=>ev("[...document.querySelectorAll('button')].some(b=>b.textContent.trim()==='继续')"),'slot');await ev("[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='继续')?.click()");await wait(()=>ev("hotelImportApp.level===5&&!hotelImportApp.paused&&!document.querySelector('.loading-screen')"),'L5');result.entryMs=performance.now()-start;result.firstPlayableMs=performance.now()-boot
 await ev("import('/verifier/l5-full-import-game.ts').then(async m=>window.importQA=await m.mount(hotelImportApp))")
 result.gpu=await ev("(()=>{const gl=hotelImportApp.renderer().three.getContext(),ext=gl.getExtension('WEBGL_debug_renderer_info');return{renderer:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):null,contextLost:gl.isContextLost()}})()");if(!result.gpu.renderer||/swiftshader|llvmpipe|software/i.test(result.gpu.renderer)||result.gpu.contextLost)throw Error('Native GPU required')
 await ev('document.querySelector(\'[aria-label="收起开发者面板"]\')?.click()');result.initial=await ev('importQA.summary()');await shot('entry');console.log(JSON.stringify({mode,entryMs:result.entryMs,...result.initial}))


 const key=async(code,vk)=>{await send('Input.dispatchKeyEvent',{type:'keyDown',code,key:code==='Escape'?'Escape':code.slice(3).toLowerCase(),windowsVirtualKeyCode:vk});await sleep(55);await send('Input.dispatchKeyEvent',{type:'keyUp',code,key:code==='Escape'?'Escape':code.slice(3).toLowerCase()});await sleep(45)}
 const run=async name=>{result[name]=await ev('importQA.'+name+'()');if(result[name]?.captureData){writeFileSync(path.join(out,name+'.png'),Buffer.from(result[name].captureData.split(',')[1],'base64'));delete result[name].captureData}else await shot(name);console.log(name,JSON.stringify({level:result[name].level,checks:result[name].checks,round5Checks:result[name].round5Checks}));writeFileSync(path.join(out,'progress.json'),JSON.stringify(result,null,2))}

 const arrived=(id,floor)=>wait(()=>ev('hotelImportApp.level==='+id+'&&!hotelImportApp.engine.transition&&!hotelImportApp.paused'+(floor===undefined?'':'&&hotelImportApp.engine.map.inf?.l5Floor==='+floor)), 'arrival '+id+'/'+floor)
 if(devWorld){
   await ev("import('/verifier/l5-dev-world-check.ts').then(m=>window.devWorldQA=m.mount(hotelImportApp))")
   await ev('devWorldQA.showWorld()')
   const run=async (name,expr)=>{result[name]=await ev('devWorldQA.'+expr);console.log(name,JSON.stringify(result[name]));writeFileSync(path.join(out,'progress.json'),JSON.stringify(result,null,2))}
   await run('attention','attention()');await shot('world-l5')
   await run('elevator','elevator()')
   await run('concierge','staff("concierge","看门人")')
   await run('lobbyDoor','lobbyDoor()')
   await run('chef','staff("chef","厨师")')
   await ev('devWorldQA.floor(2)');await arrived(5,2)
   await ev('devWorldQA.click("传送到赌场门口")');await arrived(5,1)
   await run('casinoDoor','casinoDoor()');await shot('casino-door')
   const from=await ev('devWorldQA.loc()')
   await ev('devWorldQA.click("直接进入赌场")');await arrived(119)
   await run('casino','checkScope(false,false)')
   await ev('devWorldQA.leavePocket()');await arrived(5,1)
   await run('casinoReturn','returned('+JSON.stringify(from)+')')
   await ev('devWorldQA.click("迎宾女郎")');await arrived(118)
   await run('greeter','staff("greeter")');await shot('greeter')
   await ev('devWorldQA.leavePocket()');await arrived(5,1)
   await ev('devWorldQA.click("第五层的野兽")');await arrived(117)
   await run('beast','staff("beast")')
   await ev('devWorldQA.leavePocket()');await arrived(5,1)
   await ev('hotelImportApp.engine.devJump(0)');await arrived(0)
   await run('l0','checkScope(false,true)');await shot('world-l0')
   await ev('devWorldQA.click("直接进 L0.2",document.querySelector("[data-dev-l02-section]"))');await arrived(902)
   await run('l02','checkScope(false,false)')
   await ev('devWorldQA.click("状态",document)')
   await wait(()=>ev('!!document.querySelector("[data-dev-l02-stage]")'),'L0.2 collapse controls in State')
   result.l02CollapseControls=true
   await shot('state-l02')
 }else if(polish){
   await ev("import('/verifier/l5-polish-check.ts').then(m=>window.polishQA=m.mount(hotelImportApp))")
   const run=async name=>{result[name]=await ev('polishQA.'+name+'()');console.log(name,JSON.stringify(result[name]));writeFileSync(path.join(out,'progress.json'),JSON.stringify(result,null,2))}
   await run('uiOrder');await run('icons');await shot('pixel-icons')
   const shortcut = await ev("(()=>{const b=document.querySelector('[data-hotel-ledger-shortcut]'), r=b.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2,logo:b.querySelector('img').naturalWidth}})()")
   if(!shortcut.logo)throw Error('Hotel logo did not load')
   const click={x:shortcut.x,y:shortcut.y,button:'left',clickCount:1}
   await send('Input.dispatchMouseEvent',{type:'mousePressed',...click});await send('Input.dispatchMouseEvent',{type:'mouseReleased',...click})
   await wait(()=>ev("!!document.querySelector('.hl-book')"),'HUD opens hotel ledger')
   result.hudLedger=true;await shot('hud-ledger')
   await key('Escape',27);await wait(()=>ev("!hotelImportApp.paused"),'close ledger')
   await send('Emulation.setDeviceMetricsOverride',{width:844,height:390,deviceScaleFactor:1,mobile:true,screenWidth:844,screenHeight:390})
   await send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:5})
   await sleep(450)
   const touch=await ev("(()=>{const r=document.querySelector('[data-hotel-ledger-shortcut]').getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()")
   await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[touch]})
   await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]})
   await wait(()=>ev("!!document.querySelector('.hl-book')"),'touch HUD opens hotel ledger')
   result.hudTouch=true
   await key('Escape',27);await wait(()=>ev("!hotelImportApp.paused"),'close touch ledger')
   await send('Emulation.setTouchEmulationEnabled',{enabled:false})
   await send('Emulation.setDeviceMetricsOverride',{width:1920,height:1080,deviceScaleFactor:1,mobile:false})
   await run('audio');await run('beast');await shot('corridor-beast')
   await run('jazz');await shot('jazz-quartet')
   await run('enterLobby');await arrived(118)
   await run('rabbit');await shot('clockwork-rabbit')
 }else{
 await ev("import('/verifier/l5-staff-probe.ts').then(m=>window.staffProbe=m.mount(hotelImportApp))")
 result.staff=[]
 for(const type of ['concierge','bellhop','maid','greeter','windup','beast','jazz','chef']){
  if(type==='jazz')result.dining=await ev('staffProbe.moveToDining()')
  const report=await ev('staffProbe.show('+JSON.stringify(type)+')')
  result.staff.push(report);await shot(type);console.log(JSON.stringify(report));writeFileSync(path.join(out,'progress.json'),JSON.stringify(result,null,2))
 }
 if(process.argv.includes('--gameplay')){
  result.icons=await ev('staffProbe.showIcons()');await shot('pixel-icons')
  await key('KeyM',77);await wait(()=>ev('!!document.querySelector("[data-l5-bigmap]")'),'hotel map')
  await ev('staffProbe.mapBefore()');await shot('normal-map')
  result.mapReveal=await ev('staffProbe.mapReveal()')
  await ev('hotelImportApp.engine.dev.mapReveal=true');await sleep(600);await shot('revealed-map')
  await ev('hotelImportApp.engine.dev.mapReveal=false');await key('Escape',27)
  await ev('importQA.enterOffice()');await arrived(117);await run('office')
  await ev('staffProbe.openDeal()')
  await wait(()=>ev('!!document.querySelector("[data-beast-deal=offer]")'),'normal deal')
  const declineBefore=await ev('staffProbe.beastState()')
  await ev('document.querySelector(".bd-actions button").click()')
  const declined=await ev('staffProbe.beastState()')
  if(declined.sanity>declineBefore.sanity-7.95||declined.attn<declineBefore.attn+9.95)throw Error('Decline had no cost')
  await ev('staffProbe.openDeal()')
  await wait(()=>ev('!!document.querySelector("[data-beast-deal=offer]")'),'second deal')
  await ev('document.querySelector(".bd-actions .doubt").click()')
  if(await ev('staffProbe.tryOfficeExit()'))throw Error('Doubt exit bypassed')
  await wait(()=>ev('!!document.querySelector("[data-beast-deal=forced]")'),'forced deal')
  result.deal={declineBefore,declined,forced:await ev('staffProbe.beastState()')};await shot('forced-deal')
  await ev('document.querySelector("[data-beast-harsh=mind]").click()')
  await wait(()=>ev('staffProbe.beastState().cut===20'),'mind penalty')
  result.deal.settled=await ev('staffProbe.beastState()')
  if(!await ev('staffProbe.tryOfficeExit()'))throw Error('Exit stayed locked after payment')
 }
 }
 result.ok=!result.errors.length&&!result.failedRequests.some(r=>!r.url.endsWith("/favicon.ico"))&&(devWorld||polish||result.staff.every(x=>x.finite&&x.visible&&x.meshes>0&&!x.pending&&!x.contextLost))
}catch(error){result.ok=false;result.failure=String(error);console.error(error);try{result.partial=await ev('window.importQA?.summary()');result.bootstrap=await ev('({boot:window.hotelImportBoot,text:document.body.innerText.slice(0,1800)})');await shot('failure')}catch{}process.exitCode=1}
finally{
 if(ws?.readyState===1){try{await send('Browser.close')}catch{}ws.close()}if(browser?.exitCode===null)browser.kill();if(server?.exitCode===null)server.kill();await sleep(500)
 if(existsSync(profile)&&realpathSync(profile).startsWith(realpathSync(out)+path.sep)){try{rmSync(profile,{recursive:true,force:true,maxRetries:8,retryDelay:300})}catch{}}
 result.cleanup={browser:browser?.exitCode??browser?.signalCode,server:server?.exitCode??server?.signalCode,profileRemoved:!existsSync(profile)};writeFileSync(path.join(out,'result.json'),JSON.stringify(result,null,2));writeFileSync(path.join(out,'server.log'),log);console.log(JSON.stringify({ok:result.ok,out}));if(!result.ok)process.exitCode=1
}

