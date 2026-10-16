// Each invocation owns an isolated server, true-headless browser and profile.
import {spawn} from 'node:child_process'
import {existsSync,mkdirSync,writeFileSync,realpathSync,rmSync} from 'node:fs'
import {fileURLToPath} from 'node:url'
import path from 'node:path'
import net from 'node:net'
const args=process.argv.slice(2),value=name=>args.find(a=>a.startsWith(name+'='))?.slice(name.length+1)
const label=(value('--label')??'final').replace(/[^a-z0-9-]/gi,'-'),mode=args.includes('--classic')?'classic':'realistic'
const production=args.includes('--production')
const levels=production?[]:(value('--levels')??'0,1,2,3,4,5,6,7,8,9,10,11,12,101,102,103,104,105,106,107,108,109,110,111,112,113,114,116,274').split(',').map(Number)
const app=fileURLToPath(new URL('../',import.meta.url)),out=path.join(app,'reports/level-entry',label),run=`qa-${Date.now()}-${process.pid}`,profile=path.join(out,run)
mkdirSync(profile,{recursive:true})
const freePort=()=>new Promise(resolve=>{const s=net.createServer();s.listen(0,'127.0.0.1',()=>{const port=s.address().port;s.close(()=>resolve(port))})})
const port=await freePort(),cdp=await freePort(),base=`http://127.0.0.1:${port}`
const chrome=[process.env.CHROME_PATH,'C:/Program Files/Google/Chrome/Application/chrome.exe'].find(p=>p&&existsSync(p))
if(!chrome)throw Error('Set CHROME_PATH to Chrome')
let browser,ws,seq=0,serverLog='',browserLog='';const errors=[],networkErrors=[],pending=new Map(),result={run,label,mode,production,port,cdp,profile,levels,cases:[]}
const server=spawn(process.execPath,[path.join(app,production?'scripts/level-entry-preview.mjs':'scripts/l11-map-server.mjs'),String(port),profile],{cwd:app,windowsHide:true,stdio:['ignore','pipe','pipe']})
server.stdout.on('data',d=>serverLog=(serverLog+d).slice(-30000));server.stderr.on('data',d=>serverLog=(serverLog+d).slice(-30000))
const sleep=ms=>new Promise(r=>setTimeout(r,ms))
async function waitFor(fn,label,limit=180000){const start=Date.now();for(;;){try{const v=await fn();if(v)return v}catch{}if(Date.now()-start>limit)throw Error('Timeout: '+label);await sleep(200)}}
const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++seq,timer=setTimeout(()=>{pending.delete(id);reject(Error('CDP timeout: '+method))},method==='Browser.close'?3000:240000);pending.set(id,{resolve:v=>{clearTimeout(timer);resolve(v)},reject:e=>{clearTimeout(timer);reject(e)}});ws.send(JSON.stringify({id,method,params}))})
const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result?.value}
const capture=async name=>{const r=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});writeFileSync(path.join(out,name+'.png'),Buffer.from(r.data,'base64'))}
try{
  console.log(`Level entry QA ${label}: Vite ${port}, headless CDP ${cdp}`)
  await waitFor(async()=>(await fetch(base)).ok,'Vite',30000)
  browser=spawn(chrome,[`--user-data-dir=${profile}`,`--remote-debugging-port=${cdp}`,'--headless=new','--enable-automation','--no-first-run','--no-default-browser-check','--disable-background-networking','--window-size=1920,1080','about:blank'],{windowsHide:true,stdio:['ignore','pipe','pipe']})
  browser.stderr.on('data',d=>browserLog=(browserLog+d).slice(-30000))
  const page=await waitFor(async()=>(await(await fetch(`http://127.0.0.1:${cdp}/json/list`)).json()).find(p=>p.type==='page'),'Chrome')
  ws=new WebSocket(page.webSocketDebuggerUrl);await new Promise(r=>ws.addEventListener('open',r,{once:true}))
  ws.addEventListener('message',e=>{const r=JSON.parse(e.data);if(r.method==='Runtime.exceptionThrown'||r.method==='Runtime.consoleAPICalled'&&r.params.type==='error')errors.push(r.params);if(r.method==='Network.loadingFailed'||r.method==='Network.responseReceived'&&r.params.response.status>=400)networkErrors.push(r.params);const p=pending.get(r.id);if(p){pending.delete(r.id);r.error?p.reject(r.error):p.resolve(r.result)}})
  const command=await send('Browser.getBrowserCommandLine');if(!command.arguments.includes('--headless=new')||!command.arguments.includes(`--user-data-dir=${profile}`))throw Error('Browser ownership/headless mismatch')
  result.command=command.arguments;result.browser=await send('Browser.getVersion');result.pids={server:server.pid,browser:browser.pid}
  await send('Page.enable');await send('Runtime.enable');await send('Network.enable');await send('Emulation.setDeviceMetricsOverride',{width:1920,height:1080,deviceScaleFactor:1,mobile:false})
  for(const id of levels){
    await send('Page.navigate',{url:`${base}/verifier/performance.html?outpost=${id}`})
    await waitFor(()=>evaluate('!!window.perfQA'),'production renderer')
    result.setup=await evaluate(`import('/verifier/level-entry.js').then(m=>m.attachLevelEntry(perfQA,${JSON.stringify(mode)}))`)
    const row={id};result.cases.push(row)
    if(args.includes('--programs'))await evaluate("import('/verifier/entry-program-audit.js').then(m=>window.programAudit=m.auditEntryPrograms(perfQA.renderer.three))")
    if(args.includes('--profile')){await send('Profiler.enable');await send('Profiler.setSamplingInterval',{interval:500});await send('Profiler.start')}
    console.log('Cold entry: '+id)
    row.cold=await evaluate(`perfQA.entry.measure(${id},${Number(value('--seed')??424242)},120000)`)
    if(args.includes('--profile')){const {profile:p}=await send('Profiler.stop');writeFileSync(path.join(out,`${id}.cpuprofile`),JSON.stringify(p));await send('Profiler.disable')}
    if(args.includes('--programs'))row.programAudit=await evaluate('window.programAudit')
    await capture(`${id}-entry`)
    if(args.includes('--survey')){row.survey=await evaluate('perfQA.outpost.survey()');await capture(`${id}-survey`)}
    if(args.includes('--revisit')){
      await evaluate(`perfQA.outpost.measure(${id===104?103:104})`)
      row.revisit=await evaluate(`perfQA.outpost.measure(${id},true)`)
      await capture(`${id}-revisit`)
    }
    console.log(JSON.stringify({id,status:row.cold.status,total:row.cold.loadMs,prepare:row.cold.preparationMs,generation:row.cold.generationMs,scene:row.cold.sceneMs,pending:row.cold.pending}))
    writeFileSync(path.join(out,'runtime.json'),JSON.stringify(result,null,2))
  }
  if(args.includes('--regressions')){
    console.log('Cancellation and resource lifetime checks')
    result.cancellation=await evaluate("import('/verifier/loading-cancellation.js').then(m=>m.verifyLoadingCancellation())")
    await evaluate("import('/verifier/entry-texture-audit.js').then(m=>window.entryTextureAudit=m.auditEntryTextures(perfQA.renderer.three))")
    result.cycles=[]
    for(let i=0;i<4;i++){
      await evaluate(`entryTextureAudit.begin(${i})`)
      await evaluate('perfQA.outpost.measure(101)');await evaluate('perfQA.outpost.measure(104)')
      // Allow retired GPU references and compiler promises to drain normally.
      await evaluate('perfQA.outpost.survey()');await evaluate("import('/verifier/level-entry-regressions.js').then(m=>m.settleEntryResources())");result.cycles.push(await evaluate('perfQA.outpost.snapshot()'))
    }
    result.textureAudit=await evaluate('entryTextureAudit.snapshot()');await evaluate('entryTextureAudit.stop()')
    try{result.chunkRegression=await evaluate("import('/verifier/level-entry-regressions.js').then(m=>m.verifyLevelEntryRegressions())")}
    catch(e){result.chunkRegression=await evaluate('perfQA.entryRegression');throw e}
    if(result.cycles.at(-1).memory.geometries>result.cycles.at(-2).memory.geometries+2||result.cycles.at(-1).memory.textures>result.cycles.at(-2).memory.textures+2)throw Error('Repeated outpost loads retain resources')
  }
  if(value('--app-levels')){
    console.log('Actual game UI: registered level transitions and movement')
    result.appLevels=await (await import('./level-entry-app-check.mjs')).verifyLevelEntryApp({send,evaluate,capture,base,waitFor,mode,levels:value('--app-levels').split(',').map(Number),
      onEntry:r=>{result.appLevels=r;writeFileSync(path.join(out,'runtime.json'),JSON.stringify(result,null,2))},
      profileEntry:args.includes('--profile')?async(stage,id)=>{if(stage==='start'){await send('Profiler.enable');await send('Profiler.setSamplingInterval',{interval:500});await send('Profiler.start')}else{const {profile:p}=await send('Profiler.stop');writeFileSync(path.join(out,`app-${id}.cpuprofile`),JSON.stringify(p));await send('Profiler.disable')}}:undefined})
    if(result.appLevels.entries.some(r=>!r.movementPassed))throw Error('Some entries did not accept movement; see per-level results')
  }
  if(args.includes('--app')){
    console.log('Actual game UI: enter, walk, return, save and restore')
    result.app=await (await import('./outpost-app-check.mjs')).verifyOutpostApp({send,evaluate,capture,base,waitFor,mode})
  }
  if(errors.length)throw Error(`${errors.length} browser errors`)
  result.ok=true
}catch(error){result.ok=false;result.failure=String(error);process.exitCode=1;console.error(error);try{if(ws?.readyState===WebSocket.OPEN){
  result.failureState=await evaluate(`(()=>{const e=window.__engine??window.perfQA?.engine,r=window.__renderer??window.perfQA?.renderer;return {level:e?.player.level,paused:e?.paused,transition:e?.transition,ready:e&&r&&r.isNearWorldReady(e),pending:!!r?.finiteTask,root:!!r?.finitePendingRoot,cut:document.querySelector('[data-cutscene]')?.getAttribute('data-phase'),text:document.body.innerText.slice(-1600)}})()`)
  await capture('failure')
}}catch{}}
finally{
  if(ws?.readyState===WebSocket.OPEN){try{await send('Browser.close')}catch{}ws.close()}
  if(browser?.exitCode===null)browser.kill();if(server.exitCode===null)server.kill()
  await sleep(800)
  result.cleanup={browserExit:browser?.exitCode??browser?.signalCode,serverExit:server.exitCode??server.signalCode}
  try{if(realpathSync(profile).startsWith(realpathSync(out)+path.sep))rmSync(profile,{recursive:true,force:true,maxRetries:3,retryDelay:300})}catch{}
  result.cleanup.profileRemoved=!existsSync(profile);result.errors=errors;result.networkErrors=networkErrors
  writeFileSync(path.join(out,'runtime.json'),JSON.stringify(result,null,2));writeFileSync(path.join(out,'console.json'),JSON.stringify(errors,null,2));writeFileSync(path.join(out,'server.log'),serverLog);writeFileSync(path.join(out,'browser.log'),browserLog)
}
