// Dedicated headless runner for the developer exit teleport performance cases.
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, writeFileSync, realpathSync, rmSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import net from 'node:net'

const args=process.argv.slice(2),label=args.find(x=>x.startsWith('--label='))?.slice(8)||'optimized'
const casesArg=args.find(x=>x.startsWith('--cases='))?.slice(8)||'outbound,return,cancel,repeat'
const profileEnabled=args.includes('--profile')
const cases=casesArg.split(',').map(x=>x.trim()).filter(Boolean)
const allowed=new Set(['outbound','return','cancel','repeat','far','generic']);if(!cases.length||cases.some(x=>!allowed.has(x)))throw Error('Invalid --cases')
if(!['baseline','optimized','regression'].includes(label))throw Error('Invalid --label')
const app=fileURLToPath(new URL('../',import.meta.url)),out=path.join(app,'reports/dev-teleport-performance',label),run=`qa-${Date.now()}-${process.pid}`,profile=path.join(out,run)
mkdirSync(out,{recursive:true});mkdirSync(profile,{recursive:true})
const freePort=()=>new Promise(resolve=>{const s=net.createServer();s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>resolve(p))})})
const port=await freePort(),cdp=await freePort(),base=`http://127.0.0.1:${port}`
const chrome=[process.env.L11_CHROME,path.join(process.env.PROGRAMFILES??'C:/Program Files','Google/Chrome/Application/chrome.exe'),path.join(process.env['PROGRAMFILES(X86)']??'C:/Program Files (x86)','Microsoft/Edge/Application/msedge.exe')].find(p=>p&&existsSync(p))
if(!chrome)throw Error('Set L11_CHROME to Chrome/Edge executable')
const server=spawn(process.execPath,[path.join(app,'scripts/l11-map-server.mjs'),String(port),profile],{cwd:app,windowsHide:true,stdio:['ignore','pipe','pipe']})
let browser,ws,seq=0,serverLog='',browserLog='';const errors=[],networkErrors=[],pending=new Map(),result={ok:false,label,cases,run,port,cdp,profile}
server.stdout.on('data',d=>serverLog=(serverLog+d).slice(-20000));server.stderr.on('data',d=>serverLog=(serverLog+d).slice(-20000))
const sleep=ms=>new Promise(r=>setTimeout(r,ms))
async function waitFor(f,label,limit=120000){const t=Date.now();for(;;){try{const v=await f();if(v)return v}catch{}if(Date.now()-t>limit)throw Error(`Timeout: ${label}`);await sleep(200)}}
const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++seq,timer=setTimeout(()=>{pending.delete(id);reject(Error('CDP timeout: '+method))},180000);pending.set(id,{resolve:v=>{clearTimeout(timer);resolve(v)},reject:e=>{clearTimeout(timer);reject(e)}});ws.send(JSON.stringify({id,method,params}))})
const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result?.value}
const capture=async name=>{const r=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});writeFileSync(path.join(out,`${name}.png`),Buffer.from(r.data,'base64'))}
const assert=(condition,message)=>{if(!condition)throw Error(message)}
try{
  await waitFor(async()=>(await fetch(base)).ok,'Vite',20000)
  browser=spawn(chrome,[`--user-data-dir=${profile}`,`--remote-debugging-port=${cdp}`,'--headless=new','--enable-automation','--no-first-run','--no-default-browser-check','--disable-background-networking','--window-size=1920,1080','about:blank'],{windowsHide:true,stdio:['ignore','pipe','pipe']})
  browser.stderr.on('data',d=>browserLog=(browserLog+d).slice(-20000))
  const pages=await waitFor(async()=>{const p=await(await fetch(`http://127.0.0.1:${cdp}/json/list`)).json();return p.length?p:null},'Chrome')
  ws=new WebSocket(pages.find(p=>p.type==='page').webSocketDebuggerUrl);await new Promise(r=>ws.addEventListener('open',r,{once:true}))
  ws.addEventListener('close',()=>{for(const p of pending.values())p.reject(Error('Owned QA browser closed'));pending.clear()})
  ws.addEventListener('message',e=>{const r=JSON.parse(e.data);if(r.method==='Runtime.exceptionThrown'||r.method==='Runtime.consoleAPICalled'&&r.params.type==='error')errors.push(r.params);if(r.method==='Network.loadingFailed'||r.method==='Network.responseReceived'&&r.params.response.status>=400)networkErrors.push(r.params);const p=pending.get(r.id);if(p){pending.delete(r.id);r.error?p.reject(r.error):p.resolve(r.result)}})
  const command=await send('Browser.getBrowserCommandLine');assert(command.arguments.includes('--headless=new')&&command.arguments.includes(`--user-data-dir=${profile}`),'Browser ownership/headless');result.command=command.arguments;result.browser=await send('Browser.getVersion');result.pids={server:server.pid,browser:browser.pid}
  await send('Page.enable');await send('Runtime.enable');await send('Network.enable');await send('Emulation.setDeviceMetricsOverride',{width:1920,height:1080,deviceScaleFactor:1,mobile:false})
  await send('Page.navigate',{url:`${base}/verifier/l11-map.html?level=${cases.every(c=>c==='generic')?0:11}&mode=realistic`});await waitFor(()=>evaluate('window.qa?.ready'),'game ready')
  await evaluate("qa.hide();qa.r.setDetailDistance(.55);qa.r.setSceneLightLimit(8);qa.r.setLightShadows(0);qa.r.setShadows(false);qa.r.setBloomFx(false);qa.eng.dev.frozenAI=true;qa.eng.player.flashlight=false;qa.look.yaw=-2.55;qa.freezeRenderTime(10)")
  await evaluate('qa.warm()');await evaluate("import('/verifier/dev-teleport-performance.ts').then(m=>m.attachTeleportPerformance(qa))")
  result.stats=await evaluate('qa.stats()');result.cases={}
  for(const name of cases){
    console.log(`${label}+${name} start`)
    let cpuprofile
    if(profileEnabled){await send('Profiler.enable');await send('Profiler.start',{samplingInterval:1000})}
    try{result.cases[name]=await evaluate(`qa.teleportPerf.runCase(${JSON.stringify(name)})`);if(name==='outbound'||name==='return'||name==='repeat'||name==='far')await capture(name)}
    finally{if(profileEnabled){cpuprofile=await send('Profiler.stop');writeFileSync(path.join(out,`${name}.cpuprofile`),JSON.stringify(cpuprofile.profile??cpuprofile))}}
    const sample=result.cases[name]??{}
    console.log(`${label}+${name} end actionMs=${sample.actionMs??'n/a'} nearReadyMs=${sample.nearReadyMs??'n/a'} eventLoop.max=${sample.eventLoop?.max??'n/a'}`)
  }
  result.errors=errors;assert(!errors.length,`${errors.length} runtime errors`);result.networkErrors=networkErrors;result.ok=true
}catch(error){result.ok=false;result.failure=String(error);result.errors=errors;result.networkErrors=networkErrors;console.error(error);process.exitCode=1;try{if(ws?.readyState===WebSocket.OPEN)await capture('failure')}catch{}}
finally{
  if(ws?.readyState===WebSocket.OPEN){try{await send('Browser.close')}catch{}ws.close()};if(browser&&browser.exitCode===null)browser.kill();if(server.exitCode===null)server.kill();await sleep(800)
  result.cleanup={browserExit:browser?.exitCode??browser?.signalCode,serverExit:server.exitCode??server?.signalCode}
  try{if(realpathSync(profile).startsWith(realpathSync(out)+path.sep))rmSync(profile,{recursive:true,force:true,maxRetries:3,retryDelay:300})}catch{}
  result.cleanup.profileRemoved=!existsSync(profile);writeFileSync(path.join(out,'runtime.json'),JSON.stringify(result,null,2));writeFileSync(path.join(out,'console.json'),JSON.stringify(errors,null,2));writeFileSync(path.join(out,'server.log'),serverLog);writeFileSync(path.join(out,'browser.log'),browserLog)
}
