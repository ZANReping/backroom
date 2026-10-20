import {spawn} from 'node:child_process'
import {existsSync,mkdirSync,writeFileSync,realpathSync,rmSync} from 'node:fs'
import {fileURLToPath} from 'node:url'
import path from 'node:path'
import net from 'node:net'

const app=fileURLToPath(new URL('../',import.meta.url))
const before=new Set(process.argv.slice(2)).has('--before')
const label=before?'before':'after'
const out=path.join(app,'reports/object70-v83',label)
mkdirSync(out,{recursive:true})
const profile=path.join(out,`qa-object70-${Date.now()}-${process.pid}`);mkdirSync(profile)
const sleep=ms=>new Promise(r=>setTimeout(r,ms))
const free=()=>new Promise(resolve=>{const s=net.createServer();s.once('error',()=>resolve(free()));s.listen(16000+Math.floor(Math.random()*16000),'127.0.0.1',()=>{const p=s.address().port;s.close(()=>resolve(p))})})
const wait=async(fn,name)=>{for(let i=0;i<600;i++){if(result.errors.length||result.failedRequests.some(r=>r.status>=500))throw Error('Browser runtime or module error during '+name);try{const v=await fn();if(v)return v}catch(error){if(result.errors.length)throw error}await sleep(200)}throw Error(`Timeout ${name}`)}
const port=await free(),cdp=await free(),base=`http://127.0.0.1:${port}`
const result={label,before,port,cdp,views:[],checks:null,errors:[],failedRequests:[]}
let server,browser,ws,seq=0,log='';const pending=new Map()
const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++seq,timer=setTimeout(()=>{pending.delete(id);reject(Error(`CDP timeout ${method}`))},180000);pending.set(id,{resolve:v=>{clearTimeout(timer);resolve(v)},reject:e=>{clearTimeout(timer);reject(e)}});ws.send(JSON.stringify({id,method,params}))})
const ev=async expression=>{const r=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result?.value}
const shot=async name=>writeFileSync(path.join(out,`${name}.png`),Buffer.from((await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false})).data,'base64'))
try{
  server=spawn(process.execPath,[path.join(app,'scripts/object70-server.mjs'),String(port),profile,label],{cwd:app,windowsHide:true,stdio:['ignore','pipe','pipe']})
  server.stdout.on('data',d=>log=(log+d).slice(-20000));server.stderr.on('data',d=>log=(log+d).slice(-20000))
  await wait(async()=>(await fetch(base)).ok,'server')
  browser=spawn('C:/Program Files/Google/Chrome/Application/chrome.exe',[`--user-data-dir=${profile}`,`--remote-debugging-port=${cdp}`,'--headless=new','--enable-automation','--no-first-run','--no-default-browser-check','--disable-background-networking','--window-size=1920,1080','about:blank'],{windowsHide:true,stdio:'ignore'})
  const page=await wait(async()=>(await(await fetch(`http://127.0.0.1:${cdp}/json/list`)).json()).find(p=>p.type==='page'),'browser')
  ws=new WebSocket(page.webSocketDebuggerUrl);await new Promise(r=>ws.addEventListener('open',r,{once:true}))
  ws.addEventListener('message',e=>{const r=JSON.parse(e.data);if(r.method==='Runtime.exceptionThrown'||(r.method==='Runtime.consoleAPICalled'&&r.params.type==='error'))result.errors.push(r.params);if(r.method==='Network.responseReceived'&&r.params.response.status>=400)result.failedRequests.push(r.params.response);const p=pending.get(r.id);if(p){pending.delete(r.id);r.error?p.reject(r.error):p.resolve(r.result)}})
  ws.addEventListener('close',()=>{for(const p of pending.values())p.reject(Error('QA browser closed'));pending.clear()})
  result.command=(await send('Browser.getBrowserCommandLine')).arguments
  if(!result.command.includes('--headless=new')||!result.command.includes(`--user-data-dir=${profile}`)||!result.command.includes(`--remote-debugging-port=${cdp}`))throw Error('QA browser ownership mismatch')
  result.pids={server:server.pid,browser:browser.pid};await send('Runtime.enable');await send('Network.enable');await send('Page.enable');await send('Emulation.setDeviceMetricsOverride',{width:1920,height:1080,deviceScaleFactor:1,mobile:false})
  await send('Page.navigate',{url:base+`/verifier/object70-app.html${before?'?before=1':''}`})
  await wait(()=>ev('window.object70App?.ready===true'),'object70App.ready')
  await wait(async()=>await ev("[...document.querySelectorAll('button')].some(b=>b.textContent.includes('继续游戏'))"),'title')
  await ev("[...document.querySelectorAll('button')].find(b=>b.textContent.includes('继续游戏'))?.click()")
  await wait(async()=>await ev("[...document.querySelectorAll('button')].some(b=>b.textContent.trim()==='继续')"),'slot')
  await ev("[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='继续')?.click()")
  await wait(()=>ev("object70App.level===1&&!object70App.paused&&!document.querySelector('.loading-screen')"),'game')
  await ev("import('/verifier/object70-check.ts').then(m=>window.object70QA=m.mount(object70App))")
  await wait(()=>ev('window.object70QA?.ready===true'),'object70QA')
  result.initial=await ev('window.object70QA.prepare()');await shot('closed')
  if(!before){for(const [method,name] of [['startSearch','searching'],['finishSearch','opened'],['takeAndRestore','looted-restored'],['bentoPrepare','bento']]){result[method]=await ev(`window.object70QA.${method}()`);await shot(name)};for(const method of ['eatBento','retirement'])result[method]=await ev(`window.object70QA.${method}()`)}
  result.checks=await ev('window.object70QA.result?.()||window.object70QA.checks?.()')
  if(!before)for(const view of ['stages','lineup','search','close&view=head','close&view=case&k=1']){await send('Page.navigate',{url:`${base}/proto-object70.html?mode=${view}`});await wait(()=>ev('window.__ready===true'),`proto ${view}`);result.views.push({view,diag:await ev('window.__diag||null')});await shot(`proto-${view.replaceAll('&','-').replaceAll('=','-')}`)}
  result.ok=result.errors.length===0&&result.failedRequests.filter(r=>!r.url.endsWith('/favicon.ico')).length===0&&!!result.checks
}catch(e){result.ok=false;result.failure=String(e);console.error(e);try{result.partial=await ev('window.object70QA?.result()');await shot('failure')}catch{}process.exitCode=1}
finally{if(ws?.readyState===1){try{await Promise.race([send('Browser.close'),sleep(1500)])}catch{}ws.close()};if(browser?.exitCode===null)browser.kill();if(server?.exitCode===null)server.kill();for(const p of pending.values())p.reject(Error('QA cleanup'));pending.clear();await sleep(500);if(existsSync(profile)&&realpathSync(profile).startsWith(realpathSync(out)+path.sep)){try{rmSync(profile,{recursive:true,force:true,maxRetries:8,retryDelay:300})}catch{}};result.cleanup={browser:browser?.exitCode??browser?.signalCode,server:server?.exitCode??server?.signalCode,profileRemoved:!existsSync(profile)};writeFileSync(path.join(out,'result.json'),JSON.stringify(result,null,2));writeFileSync(path.join(out,'server.log'),log);console.log(JSON.stringify({ok:result.ok,out}));if(!result.ok)process.exitCode=1}
