import {spawn} from 'node:child_process'
import {existsSync,mkdirSync,writeFileSync,realpathSync,rmSync} from 'node:fs'
import {fileURLToPath} from 'node:url'
import path from 'node:path'
import net from 'node:net'
import {performance} from 'node:perf_hooks'
const app=fileURLToPath(new URL('../',import.meta.url)),before=process.argv.includes('--before'),mode=process.argv.includes('--classic')?'classic':'realistic',entryOnly=process.argv.includes('--entry-only'),seed=Number(process.argv.find(a=>a.startsWith('--seed='))?.split('=')[1]??20261006),label=`${before?'before':'after'}-${mode}-${seed}${entryOnly?'-entry':''}${process.argv.includes('--pickup-only')?'-pickup':''}${process.argv.includes('--leave-test')?'-leave':''}${process.argv.includes('--entity-only')?'-entity':process.argv.includes('--scenes-only')?'-scenes':''}`,out=path.join(app,'reports/moth-watch-import-20261021',process.argv.find(a=>a.startsWith('--label='))?.slice(8)??label)
const pickupOnly=process.argv.includes('--pickup-only')
mkdirSync(out,{recursive:true});const profile=path.join(out,`qa-${Date.now()}-${process.pid}`);mkdirSync(profile)
const sleep=ms=>new Promise(r=>setTimeout(r,ms)),free=()=>new Promise(resolve=>{const s=net.createServer();s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>resolve(p))})})
const port=await free(),cdp=await free(),base=`http://127.0.0.1:${port}`,result={before,seed,mode,port,cdp,errors:[],failedRequests:[]};let server,browser,ws,seq=0,log='';const pending=new Map()
writeFileSync(path.join(out,'session.json'),JSON.stringify({port,cdp,profile,owner:process.pid}))
const wait=async(fn,label)=>{for(let i=0;i<1800;i++){if(result.errors.length||result.failedRequests.some(r=>r.status>=500))throw Error('Runtime/module error at '+label);try{const v=await fn();if(v)return v}catch(error){if(result.errors.length)throw error}await sleep(200)}throw Error('Timeout '+label)}
const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++seq,t=setTimeout(()=>{pending.delete(id);reject(Error('CDP timeout '+method))},360000);pending.set(id,{resolve:v=>{clearTimeout(t);resolve(v)},reject:e=>{clearTimeout(t);reject(e)}});ws.send(JSON.stringify({id,method,params}))})
const ev=async expression=>{if(ws?.readyState!==1)throw Error('QA browser is closed');const v=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(v.exceptionDetails)throw Error(JSON.stringify(v.exceptionDetails));return v.result?.value}
const shot=async name=>writeFileSync(path.join(out,name+'.png'),Buffer.from((await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false})).data,'base64'))
try{
 server=spawn(process.execPath,[path.join(app,'scripts/moth-watch-import-server.mjs'),String(port),profile,before?'before':'after'],{cwd:app,windowsHide:true,stdio:['ignore','pipe','pipe']});server.stdout.on('data',d=>log=(log+d).slice(-24000));server.stderr.on('data',d=>log=(log+d).slice(-24000));await wait(async()=>(await fetch(base)).ok,'server')
 browser=spawn(process.env.CHROME_PATH??'C:/Program Files/Google/Chrome/Application/chrome.exe',[`--user-data-dir=${profile}`,`--remote-debugging-port=${cdp}`,'--headless=new','--enable-automation','--no-first-run','--no-default-browser-check','--disable-background-networking','--window-size=1920,1080','about:blank'],{windowsHide:true,stdio:'ignore'})
 const page=await wait(async()=>(await(await fetch(`http://127.0.0.1:${cdp}/json/list`)).json()).find(p=>p.type==='page'),'browser');ws=new WebSocket(page.webSocketDebuggerUrl);await new Promise(r=>ws.addEventListener('open',r,{once:true}))
 ws.addEventListener('message',event=>{const v=JSON.parse(event.data);if(v.method==='Runtime.exceptionThrown'||v.method==='Runtime.consoleAPICalled'&&v.params.type==='error')result.errors.push(v.params);if(v.method==='Network.responseReceived'&&v.params.response.status>=400)result.failedRequests.push(v.params.response);const p=pending.get(v.id);if(p){pending.delete(v.id);v.error?p.reject(v.error):p.resolve(v.result)}})
 ws.addEventListener('close',()=>{for(const p of pending.values())p.reject(Error('QA browser closed'));pending.clear()})
 result.command=(await send('Browser.getBrowserCommandLine')).arguments;if(!result.command.includes('--headless=new')||!result.command.includes(`--user-data-dir=${profile}`)||!result.command.includes(`--remote-debugging-port=${cdp}`))throw Error('QA ownership mismatch')
 result.pids={browser:browser.pid,server:server.pid};await send('Runtime.enable');await send('Network.enable');await send('Page.enable');await send('Emulation.setDeviceMetricsOverride',{width:1920,height:1080,deviceScaleFactor:1,mobile:false})
 const boot=performance.now();await send('Page.navigate',{url:base+`/verifier/moth-watch-app.html?mode=${mode}&seed=${seed}`});await wait(()=>ev('window.mothWatchApp?.ready===true'),'app');result.appBootMs=performance.now()-boot
 await wait(()=>ev("[...document.querySelectorAll('button')].some(b=>b.textContent.includes('继续游戏'))"),'title')
 const start=performance.now();await ev("[...document.querySelectorAll('button')].find(b=>b.textContent.includes('继续游戏'))?.click()");await wait(()=>ev("[...document.querySelectorAll('button')].some(b=>b.textContent.trim()==='继续')"),'slot');await ev("[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='继续')?.click()");await wait(()=>ev("mothWatchApp.level===9&&!mothWatchApp.paused&&!document.querySelector('.loading-screen')"),'L9');result.entryMs=performance.now()-start
 result.firstPlayableMs=performance.now()-boot
 await ev(`import('/verifier/moth-watch-check.ts').then(async m=>window.importQA=await m.mount(mothWatchApp))`)
 result.gpu=await ev("(()=>{const gl=mothWatchApp.renderer().three.getContext(),ext=gl.getExtension('WEBGL_debug_renderer_info');return{renderer:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):null,contextLost:gl.isContextLost()}})()");if(!result.gpu.renderer||/swiftshader|llvmpipe|software/i.test(result.gpu.renderer)||result.gpu.contextLost)throw Error('Native GPU required');
 result.initial=await ev('importQA.status()');await shot('entry');console.log(JSON.stringify({mode,entryMs:result.entryMs,chunks:result.initial.chunks}))
 if(!process.argv.includes('--details-only')){
 result.setup=await ev('importQA.setup()');result.scenes=[]
 for(const name of ['watcher','watcher-beam','strider','mangled','mangled-wide','moth-male','moth-female','moth-guard','moth-larva']){console.log('[entity QA] '+name);result.scenes.push(await ev('importQA.scene('+JSON.stringify(name)+')'));await shot(name)}
 result.mechanics=await ev('importQA.mechanics()');await shot('live-mechanics')
 result.cycles=await ev('importQA.cycles()');result.performance=await ev('importQA.sample()')
 }
 result.level5=await ev('importQA.level5()');await shot('level5-nest')
 if(process.argv.includes('--details-only')){const portraits=await ev('importQA.portraits()');for(const p of portraits.images)writeFileSync(path.join(out,'portrait-'+p.name+'.png'),Buffer.from(p.src.split(',')[1],'base64'));result.portraits=portraits.stats}
 result.summary=await ev('importQA.summary()')
 result.gpu=await ev("(()=>{const gl=mothWatchApp.renderer().three.getContext(),ext=gl.getExtension('WEBGL_debug_renderer_info');return{renderer:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):null,contextLost:gl.isContextLost()}})()")
 if(!result.gpu.renderer||/swiftshader|llvmpipe|software/i.test(result.gpu.renderer)||result.gpu.contextLost)throw Error('Native GPU required')
 if(process.argv.includes('--details-only')){
  result.assetViews=[]
  for(const [page,view] of [['deathmoth','top'],['deathmoth','guardhead'],['deathmoth','larva'],['watch','eye'],['watch','strider'],['watch','faces']]){
   await send('Page.navigate',{url:base+'/proto-'+page+'.html?mode='+view+'&real='+(mode==='realistic'?'1':'0')+'&cpu=0'})
   await wait(()=>ev('window.__ready===true'),'native asset view '+page+'/'+view);await sleep(200)
   const meta=await ev('({ready:window.__ready,retries:window.__retries,budget:window.__budget,cpu:document.body.innerText.includes("CPU 蒙皮")})')
   if(meta.cpu||meta.retries>=6)throw Error('Native asset view failed '+view)
   await shot('asset-'+page+'-'+view);result.assetViews.push({page,view,...meta})
  }
 }
 result.ok=!result.errors.length&&!result.failedRequests.filter(r=>!r.url.endsWith('/favicon.ico')).length
}catch(error){result.ok=false;result.failure=String(error);console.error(error);try{result.partial=await ev('window.importQA?.summary()');result.bootstrap=await ev('({boot:window.mothWatchBoot,text:document.body.innerText.slice(0,1500)})');await shot('failure')}catch{}process.exitCode=1}
finally{
 if(ws?.readyState===1){try{await send('Browser.close')}catch{}ws.close()}if(browser?.exitCode===null)browser.kill();if(server?.exitCode===null)server.kill();await sleep(500)
 if(existsSync(profile)&&realpathSync(profile).startsWith(realpathSync(out)+path.sep)){try{rmSync(profile,{recursive:true,force:true,maxRetries:8,retryDelay:300})}catch{}}
 result.cleanup={browser:browser?.exitCode??browser?.signalCode,server:server?.exitCode??server?.signalCode,profileRemoved:!existsSync(profile)};writeFileSync(path.join(out,'result.json'),JSON.stringify(result,null,2));writeFileSync(path.join(out,'server.log'),log);console.log(JSON.stringify({ok:result.ok,out}));if(!result.ok)process.exitCode=1
}

