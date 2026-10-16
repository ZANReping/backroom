import {spawn} from 'node:child_process'
import {existsSync,mkdirSync,writeFileSync,realpathSync,rmSync} from 'node:fs'
import {fileURLToPath} from 'node:url'
import path from 'node:path'
import net from 'node:net'

const app=fileURLToPath(new URL('../',import.meta.url)),out=path.join(app,'reports/l11-navigation-interiors'),run=`qa-${Date.now()}-${process.pid}`,profile=path.join(out,run)
mkdirSync(profile,{recursive:true})
const freePort=()=>new Promise(r=>{const s=net.createServer();s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>r(p))})})
const port=await freePort(),cdp=await freePort(),base=`http://127.0.0.1:${port}`
const chrome=[process.env.L11_CHROME,path.join(process.env.PROGRAMFILES??'C:/Program Files','Google/Chrome/Application/chrome.exe'),path.join(process.env['PROGRAMFILES(X86)']??'C:/Program Files (x86)','Microsoft/Edge/Application/msedge.exe')].find(p=>p&&existsSync(p))
if(!chrome)throw Error('Chrome/Edge not found')
const server=spawn(process.execPath,[path.join(app,'scripts/l11-map-server.mjs'),String(port),profile],{cwd:app,windowsHide:true,stdio:['ignore','pipe','pipe']})
let browser,ws,seq=0,serverLog='',browserLog='';const errors=[],networkErrors=[],pending=new Map(),result={ok:false,run,port,cdp,profile}
server.stdout.on('data',d=>serverLog=(serverLog+d).slice(-18000));server.stderr.on('data',d=>serverLog=(serverLog+d).slice(-18000))
const sleep=ms=>new Promise(r=>setTimeout(r,ms))
async function waitFor(f,label,limit=120000){const t=Date.now();for(;;){try{const v=await f();if(v)return v}catch{}if(Date.now()-t>limit)throw Error('Timeout: '+label);await sleep(200)}}
const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++seq,timer=setTimeout(()=>{pending.delete(id);reject(Error('CDP timeout: '+method))},180000);pending.set(id,{resolve:v=>{clearTimeout(timer);resolve(v)},reject:e=>{clearTimeout(timer);reject(e)}});ws.send(JSON.stringify({id,method,params}))})
const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result?.value}
const capture=async name=>{const r=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});writeFileSync(path.join(out,name+'.png'),Buffer.from(r.data,'base64'))}
try{
  await waitFor(async()=>(await fetch(base)).ok,'Vite',20000)
  browser=spawn(chrome,[`--user-data-dir=${profile}`,`--remote-debugging-port=${cdp}`,'--headless=new','--enable-automation','--no-first-run','--no-default-browser-check','--disable-background-networking','--window-size=1920,1080','about:blank'],{windowsHide:true,stdio:['ignore','pipe','pipe']})
  browser.stderr.on('data',d=>browserLog=(browserLog+d).slice(-18000))
  const pages=await waitFor(async()=>{const p=await(await fetch(`http://127.0.0.1:${cdp}/json/list`)).json();return p.length?p:null},'Chrome')
  ws=new WebSocket(pages.find(p=>p.type==='page').webSocketDebuggerUrl);await new Promise(r=>ws.addEventListener('open',r,{once:true}))
  ws.addEventListener('close',()=>{for(const p of pending.values())p.reject(Error('Owned browser closed'));pending.clear()})
  ws.addEventListener('message',e=>{const r=JSON.parse(e.data);if(r.method==='Runtime.exceptionThrown'||r.method==='Runtime.consoleAPICalled'&&r.params.type==='error')errors.push(r.params);if(r.method==='Network.loadingFailed'||r.method==='Network.responseReceived'&&r.params.response.status>=400)networkErrors.push(r.params);const p=pending.get(r.id);if(p){pending.delete(r.id);r.error?p.reject(r.error):p.resolve(r.result)}})
  result.command=(await send('Browser.getBrowserCommandLine')).arguments
  if(!result.command.includes('--headless=new')||!result.command.includes(`--user-data-dir=${profile}`))throw Error('Headless ownership validation')
  result.browser=await send('Browser.getVersion');result.pids={server:server.pid,browser:browser.pid}
  await send('Page.enable');await send('Runtime.enable');await send('Network.enable');await send('Emulation.setDeviceMetricsOverride',{width:1920,height:1080,deviceScaleFactor:1,mobile:false})
  const phase=process.argv[2]??'after';result.phase=phase
  await send('Page.navigate',{url:`${base}/verifier/l11-map.html?level=11&mode=realistic`});await waitFor(()=>evaluate('window.qa?.ready'),'game')
  await evaluate("qa.hide();qa.eng.player.flashlight=false;qa.eng.dev.invisible=true")
  await evaluate("import('/verifier/l11-navigation-interiors.ts').then(m=>m.attachL11NavigationInteriors(qa))")
  if(phase==='entry'){
    result.entry=await evaluate('qa.cityFix.enter()');await capture('entry-inside');console.log('entry',JSON.stringify(result.entry))
  }else{
  result.views={}
  for(const kind of ['street','shop','office']){
    const pose=await evaluate(`qa.cityFix.view('${kind}')`)
    result.views[kind]={pose,performance:await evaluate('qa.cityFix.measure()')}
    await capture(phase+'-'+kind);console.log(kind,JSON.stringify(result.views[kind].performance))
  }
  result.parity=await evaluate('qa.cityFix.parity()')
  await evaluate('qa.eng.dev.frozenAI=false;qa.setFrozen(false);qa.eng.dev.god=true;qa.eng.dev.statLock=true')
  result.activeOffice=await evaluate('qa.cityFix.measure()');console.log('activeOffice',JSON.stringify(result.activeOffice))
  await send('Profiler.enable');await send('Profiler.start')
  await evaluate('qa.sample(90,1500)')
  const cpuProfile=(await send('Profiler.stop')).profile
  writeFileSync(path.join(out,phase+'-cpu-profile.json'),JSON.stringify(cpuProfile))
  const counts=new Map();for(let i=0;i<cpuProfile.samples.length;i++)counts.set(cpuProfile.samples[i],(counts.get(cpuProfile.samples[i])??0)+cpuProfile.timeDeltas[i])
  result.cpu=cpuProfile.nodes.map(n=>({name:n.callFrame.functionName,url:n.callFrame.url,line:n.callFrame.lineNumber,ms:(counts.get(n.id)??0)/1000})).sort((a,b)=>b.ms-a.ms).slice(0,24);console.log('cpu',JSON.stringify(result.cpu))
  await evaluate('qa.setFrozen(true);qa.eng.dev.frozenAI=true')
  result.walkers=await evaluate('qa.cityFix.walkers(180)');console.log('walkers',JSON.stringify(result.walkers))
  }
  result.stats=await evaluate('qa.stats()');result.errors=errors;result.networkErrors=networkErrors
  if(errors.length)throw Error(errors.length+' console/runtime errors')
  result.ok=true
}catch(error){result.failure=String(error);result.errors=errors;result.networkErrors=networkErrors;process.exitCode=1;console.error(error);try{if(ws?.readyState===WebSocket.OPEN)await capture('failure')}catch{}}
finally{
  if(ws?.readyState===WebSocket.OPEN){try{await send('Browser.close')}catch{}ws.close()}
  if(browser&&browser.exitCode===null)browser.kill();if(server.exitCode===null)server.kill();await sleep(900)
  result.cleanup={browserExit:browser?.exitCode??browser?.signalCode,serverExit:server.exitCode??server?.signalCode}
  try{if(realpathSync(profile).startsWith(realpathSync(out)+path.sep))rmSync(profile,{recursive:true,force:true,maxRetries:3,retryDelay:300})}catch{}
  result.cleanup.profileRemoved=!existsSync(profile);writeFileSync(path.join(out,(result.phase??'after')+'.json'),JSON.stringify(result,null,2));writeFileSync(path.join(out,'console.json'),JSON.stringify(errors,null,2));writeFileSync(path.join(out,'server.log'),serverLog);writeFileSync(path.join(out,'browser.log'),browserLog)
}
