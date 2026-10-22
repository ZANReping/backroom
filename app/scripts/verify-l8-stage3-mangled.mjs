import{spawn}from'node:child_process'
import{existsSync,mkdirSync,writeFileSync,realpathSync,rmSync}from'node:fs'
import{fileURLToPath}from'node:url'
import path from'node:path'
import net from'node:net'
import{performance}from'node:perf_hooks'
const app=fileURLToPath(new URL('../',import.meta.url)),mode=process.argv.includes('--classic')?'classic':'realistic',label=process.argv.find(a=>a.startsWith('--label='))?.slice(8)??('game-'+mode),seed=424242,out=path.join(app,'reports/l8-stage3-mangled-20261022',label)
mkdirSync(out,{recursive:true});const profile=path.join(out,`qa-${Date.now()}-${process.pid}`);mkdirSync(profile)
const sleep=ms=>new Promise(r=>setTimeout(r,ms)),free=()=>new Promise(resolve=>{const s=net.createServer();s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>resolve(p))})})
const port=await free(),cdp=await free(),base=`http://127.0.0.1:${port}`,result={seed,mode,port,cdp,errors:[],failedRequests:[]};let server,browser,ws,seq=0,log='';const pending=new Map()
writeFileSync(path.join(out,'session.json'),JSON.stringify({port,cdp,profile,owner:process.pid}))
const wait=async(fn,label)=>{const start=performance.now();while(performance.now()-start<360000){if(result.errors.length||result.failedRequests.some(r=>r.status>=500))throw Error('Runtime/module error at '+label);try{const v=await fn();if(v)return v}catch(error){if(result.errors.length)throw error}await sleep(200)}throw Error('Timeout '+label)}
const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++seq,t=setTimeout(()=>{pending.delete(id);reject(Error('CDP timeout '+method))},360000);pending.set(id,{resolve:v=>{clearTimeout(t);resolve(v)},reject:e=>{clearTimeout(t);reject(e)}});ws.send(JSON.stringify({id,method,params}))})
const ev=async expression=>{if(ws?.readyState!==1)throw Error('QA browser closed');const v=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(v.exceptionDetails)throw Error(JSON.stringify(v.exceptionDetails));return v.result?.value}
const shot=async name=>writeFileSync(path.join(out,name+'.png'),Buffer.from((await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false})).data,'base64'))
try{
 server=spawn(process.execPath,[path.join(app,'scripts/l4-melee-wrangler-import-server.mjs'),String(port),profile],{cwd:app,windowsHide:true,stdio:['ignore','pipe','pipe']});server.stdout.on('data',d=>log=(log+d).slice(-24000));server.stderr.on('data',d=>log=(log+d).slice(-24000));await wait(async()=>(await fetch(base)).ok,'server')
 browser=spawn(process.env.CHROME_PATH??'C:/Program Files/Google/Chrome/Application/chrome.exe',[`--user-data-dir=${profile}`,`--remote-debugging-port=${cdp}`,'--headless=new','--enable-automation','--no-first-run','--no-default-browser-check','--disable-background-networking','--window-size=1920,1080','about:blank'],{windowsHide:true,stdio:'ignore'})
 const page=await wait(async()=>(await(await fetch(`http://127.0.0.1:${cdp}/json/list`)).json()).find(p=>p.type==='page'),'browser');ws=new WebSocket(page.webSocketDebuggerUrl);await new Promise(r=>ws.addEventListener('open',r,{once:true}))
 ws.addEventListener('message',event=>{const v=JSON.parse(event.data);if(v.method==='Runtime.exceptionThrown'||v.method==='Runtime.consoleAPICalled'&&v.params.type==='error')result.errors.push(v.params);if(v.method==='Network.responseReceived'&&v.params.response.status>=400)result.failedRequests.push(v.params.response);const p=pending.get(v.id);if(p){pending.delete(v.id);v.error?p.reject(v.error):p.resolve(v.result)}})
 ws.addEventListener('close',()=>{for(const p of pending.values())p.reject(Error('QA browser closed'));pending.clear()})
 result.command=(await send('Browser.getBrowserCommandLine')).arguments;if(!result.command.includes('--headless=new')||!result.command.includes(`--user-data-dir=${profile}`)||!result.command.includes(`--remote-debugging-port=${cdp}`))throw Error('QA ownership mismatch')
 result.pids={browser:browser.pid,server:server.pid};await send('Runtime.enable');await send('Network.enable');await send('Page.enable');await send('Emulation.setDeviceMetricsOverride',{width:1920,height:1080,deviceScaleFactor:1,mobile:false})
 const boot=performance.now();await send('Page.navigate',{url:base+`/verifier/l4-melee-wrangler-app.html?mode=${mode}&seed=${seed}`});await wait(()=>ev('window.l4ImportApp?.ready===true'),'app');result.appBootMs=performance.now()-boot
 await wait(()=>ev("[...document.querySelectorAll('button')].some(b=>b.textContent.includes('继续游戏'))"),'title')
 const start=performance.now();await ev("[...document.querySelectorAll('button')].find(b=>b.textContent.includes('继续游戏'))?.click()");await wait(()=>ev("[...document.querySelectorAll('button')].some(b=>b.textContent.trim()==='继续')"),'slot');await ev("[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='继续')?.click()");await wait(()=>ev("l4ImportApp.level===4&&!l4ImportApp.paused&&!document.querySelector('.loading-screen')"),'L4');result.entryMs=performance.now()-start;result.firstPlayableMs=performance.now()-boot
 await ev("import('/verifier/l8-stage3-mangled-check.ts').then(async m=>window.importQA=await m.mount(l4ImportApp))")
 result.gpu=await ev("(()=>{const gl=l4ImportApp.renderer().three.getContext(),ext=gl.getExtension('WEBGL_debug_renderer_info');return{renderer:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):null,contextLost:gl.isContextLost()}})()");if(!result.gpu.renderer||/swiftshader|llvmpipe|software/i.test(result.gpu.renderer)||result.gpu.contextLost)throw Error('Native GPU required')
 await ev('document.querySelector(\'[aria-label="收起开发者面板"]\')?.click()');result.initial=await ev('importQA.summary()');await shot('entry');console.log(JSON.stringify({mode,entryMs:result.entryMs,...result.initial}))


 result.boot=await ev('importQA.boot()');await shot('l8-entry');console.log('boot',JSON.stringify(result.boot))
 if(!process.argv.includes('--resources-only'))for(const [type,kind]of [...['wolf','weaver','jumper','blindcave','broodswarm','harvestman','diving','colossus','widow','regen','undying','fireproof','anoxic','cavescorpion','whipscorpion','tick','mitecloud'].map(k=>['arachnid',k]),['camocrawler'],['curabitur','female'],['curabitur','male'],['lightguide']]){const name=type+(kind?'-'+kind:'');result[name]=await ev('importQA.specimen('+JSON.stringify(type)+','+JSON.stringify(kind??null)+')');await shot(name);console.log(name,JSON.stringify(result[name]))}
 for(const [name,fn]of (process.argv.includes('--resources-only')?[['resource-cycles','recycle'],['cleanup','cleanup']]:[['camo-reveal','camoWake'],['bird-live','birdIdle'],['acid-web-vision','vision'],['glowing-items','items'],['rune-nest','nest'],['resource-cycles','recycle'],['cleanup','cleanup'],['mangled-manual','mangledStart'],['mangled-first','mangledFirst'],['mangled-repeat','mangledAgain']])){result[name]=await ev('importQA.'+fn+'()');await shot(name);console.log(name,JSON.stringify(result[name]))}
 result.summary=await ev('importQA.summary()');result.ok=!result.errors.length&&!result.failedRequests.filter(r=>!r.url.endsWith('/favicon.ico')).length
}catch(error){result.ok=false;result.failure=String(error);console.error(error);try{result.partial=await ev('window.importQA?.summary()');result.bootstrap=await ev('({boot:window.l4ImportBoot,text:document.body.innerText.slice(0,1800)})');await shot('failure')}catch{}process.exitCode=1}
finally{
 if(ws?.readyState===1){try{await send('Browser.close')}catch{}ws.close()}if(browser?.exitCode===null)browser.kill();if(server?.exitCode===null)server.kill();await sleep(500)
 if(existsSync(profile)&&realpathSync(profile).startsWith(realpathSync(out)+path.sep)){try{rmSync(profile,{recursive:true,force:true,maxRetries:8,retryDelay:300})}catch{}}
 result.cleanup={browser:browser?.exitCode??browser?.signalCode,server:server?.exitCode??server?.signalCode,profileRemoved:!existsSync(profile)};writeFileSync(path.join(out,'result.json'),JSON.stringify(result,null,2));writeFileSync(path.join(out,'server.log'),log);console.log(JSON.stringify({ok:result.ok,out}));if(!result.ok)process.exitCode=1
}
