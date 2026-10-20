import {spawn} from 'node:child_process'
import {existsSync,mkdirSync,writeFileSync,readFileSync,realpathSync,rmSync} from 'node:fs'
import {fileURLToPath} from 'node:url'
import path from 'node:path'
import net from 'node:net'
import {performance} from 'node:perf_hooks'

const app=fileURLToPath(new URL('../',import.meta.url)),before=process.argv.includes('--before'),mode=process.argv.includes('--classic')?'classic':'realistic',only=process.argv.includes('--only-gothic'),benchOnly=process.argv.includes('--benchmark-only'),interactionsOnly=process.argv.includes('--interactions-only'),label=`${before?'before':'after'}-${mode}${only?'-gothic':benchOnly?'-benchmark':interactionsOnly?'-interactions':''}`,out=path.join(app,'reports/hotbar-collision-shadow',label)
const cases=JSON.parse(readFileSync(path.join(app,'reports/l1-bake-smoothing/before-diagnostic.json'),'utf8')).cases
mkdirSync(out,{recursive:true});const profile=path.join(out,`qa-${Date.now()}-${process.pid}`);mkdirSync(profile)
const sleep=ms=>new Promise(r=>setTimeout(r,ms)),free=()=>new Promise(resolve=>{const s=net.createServer();s.listen(16000+Math.floor(Math.random()*16000),'127.0.0.1',()=>{const p=s.address().port;s.close(()=>resolve(p))});s.once('error',()=>resolve(free()))})
const port=await free(),cdp=await free(),base=`http://127.0.0.1:${port}`,result={before,mode,port,cdp,errors:[],failedRequests:[],scenes:[]};let server,browser,ws,seq=0,log='';const pending=new Map()
writeFileSync(path.join(out,'session.json'),JSON.stringify({port,cdp,profile,owner:process.pid}))
const wait=async(fn,label)=>{for(let i=0;i<900;i++){if(result.errors.length||result.failedRequests.some(r=>r.status>=500))throw Error('Runtime/module error at '+label);try{const v=await fn();if(v)return v}catch(error){if(result.errors.length)throw error}await sleep(200)}throw Error('Timeout '+label)}
const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++seq,t=setTimeout(()=>{pending.delete(id);reject(Error('CDP timeout '+method))},240000);pending.set(id,{resolve:v=>{clearTimeout(t);resolve(v)},reject:e=>{clearTimeout(t);reject(e)}});ws.send(JSON.stringify({id,method,params}))})
const ev=async expression=>{const v=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(v.exceptionDetails)throw Error(JSON.stringify(v.exceptionDetails));return v.result?.value}
const shot=async(name,clip)=>writeFileSync(path.join(out,name+'.png'),Buffer.from((await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false,...(clip?{clip}:{})})).data,'base64'))
try{
 server=spawn(process.execPath,[path.join(app,'scripts/hotbar-collision-shadow-server.mjs'),String(port),profile,before?'before':'after'],{cwd:app,windowsHide:true,stdio:['ignore','pipe','pipe']});server.stdout.on('data',d=>log=(log+d).slice(-24000));server.stderr.on('data',d=>log=(log+d).slice(-24000));await wait(async()=>(await fetch(base)).ok,'server')
 browser=spawn('C:/Program Files/Google/Chrome/Application/chrome.exe',[`--user-data-dir=${profile}`,`--remote-debugging-port=${cdp}`,'--headless=new','--enable-automation','--no-first-run','--no-default-browser-check','--disable-background-networking','--window-size=1920,1080','about:blank'],{windowsHide:true,stdio:'ignore'})
 const page=await wait(async()=>(await(await fetch(`http://127.0.0.1:${cdp}/json/list`)).json()).find(p=>p.type==='page'),'browser');ws=new WebSocket(page.webSocketDebuggerUrl);await new Promise(r=>ws.addEventListener('open',r,{once:true}))
 ws.addEventListener('message',event=>{const v=JSON.parse(event.data);if(v.method==='Runtime.exceptionThrown'||v.method==='Runtime.consoleAPICalled'&&v.params.type==='error')result.errors.push(v.params);if(v.method==='Network.responseReceived'&&v.params.response.status>=400)result.failedRequests.push(v.params.response);const p=pending.get(v.id);if(p){pending.delete(v.id);v.error?p.reject(v.error):p.resolve(v.result)}})
 ws.addEventListener('close',()=>{for(const p of pending.values())p.reject(Error('QA browser closed'));pending.clear()})
 result.command=(await send('Browser.getBrowserCommandLine')).arguments;if(!result.command.includes('--headless=new')||!result.command.includes(`--user-data-dir=${profile}`)||!result.command.includes(`--remote-debugging-port=${cdp}`))throw Error('QA ownership mismatch')
 result.pids={browser:browser.pid,server:server.pid};await send('Runtime.enable');await send('Network.enable');await send('Page.enable');await send('Emulation.setDeviceMetricsOverride',{width:1920,height:1080,deviceScaleFactor:1,mobile:false})
 await send('Page.navigate',{url:base+`/verifier/l1v2-app.html?mode=${mode}`});await wait(()=>ev('window.l1v2App?.ready===true'),'app');await wait(()=>ev("[...document.querySelectorAll('button')].some(b=>b.textContent.includes('继续游戏'))"),'title')
 const start=performance.now();await ev("[...document.querySelectorAll('button')].find(b=>b.textContent.includes('继续游戏'))?.click()");await wait(()=>ev("[...document.querySelectorAll('button')].some(b=>b.textContent.trim()==='继续')"),'slot');await ev("[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='继续')?.click()");await wait(()=>ev("l1v2App.level===1&&!l1v2App.paused&&!document.querySelector('.loading-screen')"),'L1');result.entryMs=performance.now()-start
 await ev(`import('/verifier/hotbar-collision-shadow-check.ts').then(async m=>window.hotbarQA=await m.mount(l1v2App,${JSON.stringify(cases)},${before}))`)
 result.initial=await ev('hotbarQA.prepare()')
 if(!only&&!benchOnly){
  result.hotbar=[]
  for(const theme of ['default','immersive']){
   const value=await ev(`hotbarQA.hotbar('${theme}')`);result.hotbar.push(value);await shot('hotbar-desktop-'+theme,value.clip)
  }
  await ev("document.body.style.zoom='1.5'");const zoom=await ev("hotbarQA.hotbar('default')");result.hotbar.push(zoom);await shot('hotbar-desktop-150',zoom.clip);await ev("document.body.style.zoom=''")
  await send('Emulation.setDeviceMetricsOverride',{width:320,height:760,deviceScaleFactor:1,mobile:true});await send('Emulation.setTouchEmulationEnabled',{enabled:true});await sleep(500)
  for(const theme of ['default','immersive']){const value=await ev(`hotbarQA.hotbar('${theme}')`);result.hotbar.push(value);await shot('hotbar-mobile-'+theme,value.clip)}
  const touchPoint=await ev("(()=>{const b=document.querySelectorAll('.hud-slot')[5].getBoundingClientRect();return{x:b.x+b.width/2,y:b.y+b.height/2}})()")
  await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[touchPoint]});await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await sleep(100)
  result.touchSelected=await ev('l1v2App.engine.player.selected');if(!before&&result.touchSelected!==5)throw Error('Real touch does not select slot six');await sleep(650)
  await send('Emulation.setDeviceMetricsOverride',{width:800,height:400,deviceScaleFactor:1,mobile:true});await sleep(400);const landscape=await ev("hotbarQA.hotbar('default')");result.hotbar.push(landscape);await shot('hotbar-landscape',landscape.clip)
  await send('Emulation.setDeviceMetricsOverride',{width:1920,height:1080,deviceScaleFactor:1,mobile:false});await send('Emulation.setTouchEmulationEnabled',{enabled:false});await sleep(400)
  console.log('[qa] '+label+' live crate edge');result.crate=await ev('hotbarQA.crate()');await shot('crate-edge')
 }
 const scenes=interactionsOnly?[]:only?['gothic']:benchOnly?['parking-common-contact']:['parking-common','parking-common-contact','parking-round-contact','parking-dim','gothic','ouroboros']
 for(const name of scenes){console.log('[l1-placement] '+label+' '+name);result.scenes.push(await ev(`hotbarQA.scene('${name}')`));await shot(name)}
 if(!only&&!interactionsOnly){await ev('hotbarQA.scene(' + JSON.stringify('parking-common-contact') + ',false)');await shot('parking-common-contact-no-ao');result.bench=await ev('hotbarQA.bench()')}
 result.summary=await ev('hotbarQA.result()');result.gpu=await ev("(()=>{const gl=l1v2App.renderer().three.getContext(),ext=gl.getExtension('WEBGL_debug_renderer_info');return{renderer:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):null,contextLost:gl.isContextLost()}})()")
 if(!result.gpu.renderer||/swiftshader|llvmpipe|software/i.test(result.gpu.renderer)||result.gpu.contextLost)throw Error('Native GPU required '+JSON.stringify(result.gpu))
 result.ok=!result.errors.length&&!result.failedRequests.filter(r=>!r.url.endsWith('/favicon.ico')).length
}catch(error){result.ok=false;result.failure=String(error);console.error(error);try{result.partial=await ev('window.hotbarQA?.result()');result.bootstrap=await ev('({boot:window.l1v2Boot,text:document.body.innerText.slice(0,1500)})');await shot('failure')}catch{}process.exitCode=1}
finally{
 if(ws?.readyState===1){try{await send('Browser.close')}catch{}ws.close()}if(browser?.exitCode===null)browser.kill();if(server?.exitCode===null)server.kill();await sleep(500)
 if(existsSync(profile)&&realpathSync(profile).startsWith(realpathSync(out)+path.sep)){try{rmSync(profile,{recursive:true,force:true,maxRetries:8,retryDelay:300})}catch{}}
 result.cleanup={browser:browser?.exitCode??browser?.signalCode,server:server?.exitCode??server?.signalCode,profileRemoved:!existsSync(profile)};writeFileSync(path.join(out,'result.json'),JSON.stringify(result,null,2));writeFileSync(path.join(out,'server.log'),log);console.log(JSON.stringify({ok:result.ok,out}));if(!result.ok)process.exitCode=1
}
