// Own a true-headless browser and server; never attach to a user's browser.
import {spawn} from 'node:child_process'
import {existsSync,mkdirSync,readFileSync,writeFileSync,realpathSync,rmSync} from 'node:fs'
import {fileURLToPath} from 'node:url'
import path from 'node:path'
import net from 'node:net'
const baseline=process.argv.includes('--before'),details=process.argv.includes('--details'),label=baseline?'before':details?'details':'after'
const app=fileURLToPath(new URL('../',import.meta.url)),out=path.join(app,'reports/wretch-import',label),run=`qa-wretch-${Date.now()}-${process.pid}`,profile=path.join(out,run)
mkdirSync(profile,{recursive:true})
if(baseline){
  // Replay the preserved pre-import factory with the same production renderer.
  // Only module paths change; geometry/material construction stays byte-equivalent.
  const old=readFileSync(path.join(app,'assets/wretch-import/baseline-entitiesMesh.ts.txt'),'utf8')
    .replace(/from (['"])\.\//g,'from $1/src/game/renderer/')
    .replace(/from (['"])\.\.\//g,'from $1/src/game/')
  writeFileSync(path.join(app,'reports/wretch-import/baseline-factory.ts'),old)
}
const freePort=()=>new Promise(resolve=>{const s=net.createServer();s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>resolve(p))})})
const port=await freePort(),cdp=await freePort(),base=`http://127.0.0.1:${port}`
const chrome=[process.env.CHROME_PATH,'C:/Program Files/Google/Chrome/Application/chrome.exe'].find(p=>p&&existsSync(p))
if(!chrome)throw Error('Chrome missing')
const sleep=ms=>new Promise(r=>setTimeout(r,ms))
let browser,ws,seq=0,serverLog='',browserLog='';const errors=[],networkErrors=[],pending=new Map(),result={run,label,port,cdp,profile,views:[]}
const server=spawn(process.execPath,[path.join(app,'scripts/l11-map-server.mjs'),String(port),profile],{cwd:app,windowsHide:true,stdio:['ignore','pipe','pipe']})
server.stdout.on('data',d=>serverLog=(serverLog+d).slice(-30000));server.stderr.on('data',d=>serverLog=(serverLog+d).slice(-30000))
async function waitFor(fn,label,limit=120000){const t=Date.now();for(;;){try{const v=await fn();if(v)return v}catch{}if(Date.now()-t>limit)throw Error('Timeout: '+label);await sleep(200)}}
const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++seq,timer=setTimeout(()=>{pending.delete(id);reject(Error('CDP timeout '+method))},method==='Browser.close'?3000:120000);pending.set(id,{resolve:v=>{clearTimeout(timer);resolve(v)},reject:e=>{clearTimeout(timer);reject(e)}});ws.send(JSON.stringify({id,method,params}))})
const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result?.value}
const capture=async name=>{const r=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});writeFileSync(path.join(out,name+'.png'),Buffer.from(r.data,'base64'))}
try{
  console.log(`${run}: server ${port}, headless CDP ${cdp}`)
  await waitFor(async()=>(await fetch(base)).ok,'Vite',30000)
  browser=spawn(chrome,[`--user-data-dir=${profile}`,`--remote-debugging-port=${cdp}`,'--headless=new','--enable-automation','--no-first-run','--no-default-browser-check','--disable-background-networking','--window-size=1920,1080','about:blank'],{windowsHide:true,stdio:['ignore','pipe','pipe']})
  browser.stderr.on('data',d=>browserLog=(browserLog+d).slice(-30000))
  const page=await waitFor(async()=>(await(await fetch(`http://127.0.0.1:${cdp}/json/list`)).json()).find(p=>p.type==='page'),'Chrome')
  ws=new WebSocket(page.webSocketDebuggerUrl);await new Promise(r=>ws.addEventListener('open',r,{once:true}))
  ws.addEventListener('message',e=>{const r=JSON.parse(e.data);if(r.method==='Runtime.exceptionThrown'||r.method==='Runtime.consoleAPICalled'&&r.params.type==='error')errors.push(r.params);if(r.method==='Network.loadingFailed'||r.method==='Network.responseReceived'&&r.params.response.status>=400)networkErrors.push(r.params);const p=pending.get(r.id);if(p){pending.delete(r.id);r.error?p.reject(r.error):p.resolve(r.result)}})
  result.command=(await send('Browser.getBrowserCommandLine')).arguments
  if(!result.command.includes('--headless=new')||!result.command.includes(`--user-data-dir=${profile}`))throw Error('Headless/ownership mismatch')
  result.browser=await send('Browser.getVersion');result.pids={server:server.pid,browser:browser.pid}
  await send('Page.enable');await send('Runtime.enable');await send('Network.enable');await send('Emulation.setDeviceMetricsOverride',{width:1920,height:1080,deviceScaleFactor:1,mobile:false})
  await send('Page.navigate',{url:`${base}/verifier/l0-remake.html?level=104&mode=realistic`})
  await waitFor(()=>evaluate('!!window.qa?.ready'),'game')
  await evaluate('qa.hide();qa.r.resize(1920,1080,1);qa.warm()')
  result.setup=await evaluate(`import('/verifier/wretch-import.ts').then(m=>m.setupWretches(qa,${baseline}))`)
  if(details){
    for(const [kind,pose] of [['mutant','back'],['sprinter','run'],['smart','attack'],['shambler','bash'],['shambler','death']]){
      result.views.push(await evaluate(`wretchView('${kind}','${pose}')`));await capture(kind+'-'+pose)
    }
    result.audio=await evaluate("import('/verifier/wretch-import.ts').then(m=>m.verifyWretchVoices())")
    result.dark=await evaluate("import('/verifier/wretch-import.ts').then(m=>m.verifyWretchHabitat(qa,6))");await capture('level-6-dark')
    await evaluate('qa.eng.player.flashlight=true;qa.eng.player.battery=100;qa.warm()')
    result.level6Flash=await evaluate('qa.r.flash.intensity')
    if(result.level6Flash!==0)throw Error('Level 6 should keep its flashlight restriction')
    result.litHabitat=await evaluate("import('/verifier/wretch-import.ts').then(m=>m.verifyWretchHabitat(qa,2))");await capture('level-2-no-flash')
    await evaluate('qa.eng.player.flashlight=true;qa.eng.player.battery=100;qa.warm()');await capture('level-2-flash')
    result.level2Flash=await evaluate('qa.r.flash.intensity')
    if(!(result.level2Flash>0))throw Error('Level 2 flashlight did not illuminate the model')
  }else{
  for(const kind of baseline?['shambler']:['shambler','sprinter','smart','mutant']){
    result.views.push(await evaluate(`wretchView('${kind}').then(()=>qa.warm()).then(()=>wretchView('${kind}'))`));await capture(kind)
    if(!baseline){result.views.push(await evaluate(`wretchView('${kind}','close')`));await capture(kind+'-face')}
  }
  if(!baseline){
    result.behavior=await evaluate("import('/verifier/wretch-import.ts').then(m=>m.verifyWretches(qa))")
    await evaluate("qa.mode('classic');wretchView('mutant').then(()=>qa.warm())");await capture('classic-mutant')
    result.cycles=await evaluate("window.wretchCycles()")
  }
  await evaluate("qa.mode('realistic');wretchView('shambler').then(()=>qa.warm())")
  result.performance=[];for(let i=0;i<5;i++)result.performance.push(await evaluate('qa.sample(120)'))
  if(!baseline){result.habitat=await evaluate("import('/verifier/wretch-import.ts').then(m=>m.verifyWretchHabitat(qa))");await capture('level-2-developer-summon')}
  }
  if(errors.length)throw Error(`${errors.length} runtime/console errors`)
  result.ok=true
}catch(e){result.ok=false;result.failure=String(e);console.error(e);process.exitCode=1;try{await capture('failure')}catch{}}
finally{
  if(ws?.readyState===WebSocket.OPEN){try{await send('Browser.close')}catch{}ws.close()}
  if(browser?.exitCode===null)browser.kill();if(server.exitCode===null)server.kill();await sleep(800)
  result.cleanup={browserExit:browser?.exitCode??browser?.signalCode,serverExit:server.exitCode??server.signalCode}
  try{if(realpathSync(profile).startsWith(realpathSync(out)+path.sep))rmSync(profile,{recursive:true,force:true,maxRetries:3,retryDelay:300})}catch{}
  result.cleanup.profileRemoved=!existsSync(profile);result.errors=errors;result.networkErrors=networkErrors
  writeFileSync(path.join(out,'runtime.json'),JSON.stringify(result,null,2));writeFileSync(path.join(out,'console.json'),JSON.stringify(errors,null,2));writeFileSync(path.join(out,'server.log'),serverLog);writeFileSync(path.join(out,'browser.log'),browserLog)
  console.log(JSON.stringify({ok:result.ok,failure:result.failure,cleanup:result.cleanup,output:out}))
}
