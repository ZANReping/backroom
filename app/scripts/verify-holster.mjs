import {spawn} from 'node:child_process'
import {existsSync,mkdirSync,writeFileSync,realpathSync,rmSync} from 'node:fs'
import {fileURLToPath} from 'node:url'
import path from 'node:path'
import net from 'node:net'
const app=fileURLToPath(new URL('../',import.meta.url)),touch=process.argv.includes('--touch'),label=touch?'touch':'desktop'
const out=path.join(app,'reports/holster',label);mkdirSync(out,{recursive:true})
const profile=path.join(out,`qa-holster-${Date.now()}-${process.pid}`);mkdirSync(profile)
const free=()=>new Promise(resolve=>{const s=net.createServer();s.once('error',()=>resolve(free()));s.listen(16000+Math.floor(Math.random()*16000),'127.0.0.1',()=>{const p=s.address().port;s.close(()=>resolve(p))})})
const sleep=ms=>new Promise(r=>setTimeout(r,ms)),wait=async(fn,name)=>{for(let i=0;i<600;i++){if(result.errors.length||result.failedRequests.some(r=>r.status>=500))throw Error('Browser runtime or module error during '+name);try{const v=await fn();if(v)return v}catch(error){if(result.errors.length)throw error}await sleep(200)}throw Error('Timeout '+name)}
const port=await free(),cdp=await free(),base=`http://127.0.0.1:${port}`,result={label,port,cdp,views:[],checks:[],errors:[],failedRequests:[]}
let server,browser,ws,seq=0,log='';const pending=new Map()
const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++seq,timer=setTimeout(()=>{pending.delete(id);reject(Error('CDP timeout '+method))},180000);pending.set(id,{resolve:v=>{clearTimeout(timer);resolve(v)},reject:e=>{clearTimeout(timer);reject(e)}});ws.send(JSON.stringify({id,method,params}))})
const ev=async expression=>{const r=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result?.value}
const shot=async name=>writeFileSync(path.join(out,name+'.png'),Buffer.from((await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false})).data,'base64'))
const alt=async(repeat=false,right=false)=>{const code=right?'AltRight':'AltLeft';await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Alt',code,windowsVirtualKeyCode:18,nativeVirtualKeyCode:18,modifiers:1,autoRepeat:repeat,isSystemKey:true});if(!repeat)await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Alt',code,windowsVirtualKeyCode:18,nativeVirtualKeyCode:18,modifiers:0,isSystemKey:true})}
const tap=async(id)=>{const rows=await ev('holsterQA.buttons()'),b=rows.find(b=>b.id===id);if(!b)throw Error('Missing touch button '+id);await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:b.rect.cx,y:b.rect.cy,id:1}]});await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await sleep(80)}
async function open(query=''){
 await send('Page.navigate',{url:base+'/verifier/holster-app.html'+query});await wait(()=>ev('!!window.holsterApp?.ready'),'isolated production App')
 console.log('HOLSTER App mounted '+query)
 await wait(()=>ev("[...document.querySelectorAll('.menu-label')].some(b=>b.textContent.trim()==='继续游戏')"),'continue menu')
 await ev("[...document.querySelectorAll('.menu-label')].find(b=>b.textContent.trim()==='继续游戏').closest('button').click()")
 await wait(()=>ev("[...document.querySelectorAll('button')].some(b=>b.textContent.trim()==='继续')"),'continue button')
 await ev("[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='继续').click()")
 await wait(()=>ev("holsterApp.engine.player.level===104&&!holsterApp.engine.paused&&!document.querySelector('.loading-screen')"),'loaded actual game')
 console.log('HOLSTER actual game ready '+query)
 await ev("import('/verifier/holster-check.ts').then(async m=>window.holsterQA=await m.mount(holsterApp))")
 return ev('holsterQA.prepare()')
}
try{
 server=spawn(process.execPath,[path.join(app,'scripts/l11-map-server.mjs'),String(port),profile],{cwd:app,windowsHide:true,stdio:['ignore','pipe','pipe']});server.stdout.on('data',d=>log=(log+d).slice(-20000));server.stderr.on('data',d=>log=(log+d).slice(-20000));await wait(async()=>(await fetch(base)).ok,'server')
 browser=spawn('C:/Program Files/Google/Chrome/Application/chrome.exe',[`--user-data-dir=${profile}`,`--remote-debugging-port=${cdp}`,'--headless=new','--enable-automation','--no-first-run','--no-default-browser-check','--disable-background-networking','--window-size=1920,1080','about:blank'],{windowsHide:true,stdio:'ignore'})
 const page=await wait(async()=>(await(await fetch(`http://127.0.0.1:${cdp}/json/list`)).json()).find(p=>p.type==='page'),'browser');ws=new WebSocket(page.webSocketDebuggerUrl);await new Promise(r=>ws.addEventListener('open',r,{once:true}))
 ws.addEventListener('message',e=>{const r=JSON.parse(e.data);if(r.method==='Runtime.exceptionThrown'||r.method==='Runtime.consoleAPICalled'&&r.params.type==='error')result.errors.push(r.params);if(r.method==='Network.responseReceived'&&r.params.response.status>=400)result.failedRequests.push(r.params.response);const p=pending.get(r.id);if(p){pending.delete(r.id);r.error?p.reject(r.error):p.resolve(r.result)}})
 result.command=(await send('Browser.getBrowserCommandLine')).arguments
 if(!result.command.includes('--headless=new')||!result.command.includes(`--user-data-dir=${profile}`)||!result.command.includes(`--remote-debugging-port=${cdp}`))throw Error('Ownership mismatch')
 result.pids={server:server.pid,browser:browser.pid};await send('Runtime.enable');await send('Network.enable');await send('Page.enable');await send('Emulation.setDeviceMetricsOverride',{width:touch?844:1920,height:touch?390:1080,deviceScaleFactor:1,mobile:touch});await send('Emulation.setTouchEmulationEnabled',{enabled:touch,maxTouchPoints:5})
 if(touch){
  for(const [name,query] of [['default',''],['left','?left=1'],['custom','?custom=1']]){
   const drawn=await open(query);await shot(name+'-drawn');await tap('holster');const hidden=await ev('holsterQA.mobileCheck(true)');await shot(name+'-stowed')
   await tap('attack');await tap('quickuse');const blocked=await ev('holsterQA.mobileBlocked()');await tap('holster');const restored=await ev('holsterQA.mobileCheck(false)');result.views.push({name,drawn,hidden,blocked,restored});result.checks.push(await ev('holsterQA.result()'))
  }
 }else{
  result.drawn=await open();await shot('drawn');await alt();result.stowed=await ev('holsterQA.stowed()');await shot('stowed');result.guards=await ev('holsterQA.guardChecks()');result.interaction=await ev('holsterQA.interaction()');await alt(false,true);result.restored=await ev('holsterQA.restored()');await shot('restored')
  result.binding=await ev('holsterQA.repeatAndRebind()');result.checks.push(await ev('holsterQA.result()'))
  result.gameFaces=await ev('holsterQA.faces()');await shot('poolfaces-in-game');result.checks.push(await ev('holsterQA.result()'))
 }
 result.ok=result.errors.length===0&&result.failedRequests.filter(r=>!r.url.endsWith('/favicon.ico')).length===0&&result.checks.every(c=>c.checks.length>0)
}catch(error){result.ok=false;result.failure=String(error);console.error(error);try{await shot('failure');result.partial=await ev('window.holsterQA?.result()')}catch{}process.exitCode=1}
finally{
 if(ws?.readyState===1){try{await send('Browser.close')}catch{}ws.close()}
 if(browser?.exitCode===null)browser.kill();if(server?.exitCode===null)server.kill();await sleep(500)
 if(existsSync(profile)&&realpathSync(profile).startsWith(realpathSync(out)+path.sep)){try{rmSync(profile,{recursive:true,force:true,maxRetries:8,retryDelay:300})}catch{}}
 result.cleanup={browser:browser?.exitCode??browser?.signalCode,server:server?.exitCode??server?.signalCode,profileRemoved:!existsSync(profile)}
 writeFileSync(path.join(out,'result.json'),JSON.stringify(result,null,2));writeFileSync(path.join(out,'server.log'),log);console.log(JSON.stringify({ok:result.ok,out}));if(!result.ok)process.exitCode=1
}
