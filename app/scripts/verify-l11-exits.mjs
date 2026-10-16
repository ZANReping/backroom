// Owns every server/browser/profile it creates. Exercises the production engine and renderer.
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, writeFileSync, realpathSync, rmSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import net from 'node:net'

const visualOnly=process.argv.includes('--visual-only'),materialsOnly=process.argv.includes('--materials-only'),brickOnly=process.argv.includes('--brick-only')
const app=fileURLToPath(new URL('../',import.meta.url)),out=path.join(app,'reports/l11-exits',brickOnly?'brick-final':materialsOnly?'materials-final':visualOnly?'visual-final':'runtime-final'),run=`qa-${Date.now()}-${process.pid}`,profile=path.join(out,run)
mkdirSync(profile,{recursive:true})
const freePort=()=>new Promise(resolve=>{const s=net.createServer();s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>resolve(p))})})
const port=await freePort(),cdp=await freePort(),base=`http://127.0.0.1:${port}`
const chrome=[process.env.L11_CHROME,path.join(process.env.PROGRAMFILES??'C:/Program Files','Google/Chrome/Application/chrome.exe'),path.join(process.env['PROGRAMFILES(X86)']??'C:/Program Files (x86)','Microsoft/Edge/Application/msedge.exe')].find(p=>p&&existsSync(p))
if(!chrome)throw Error('Set L11_CHROME to Chrome/Edge executable')
const server=spawn(process.execPath,[path.join(app,'scripts/l11-map-server.mjs'),String(port),profile],{cwd:app,windowsHide:true,stdio:['ignore','pipe','pipe']})
let browser,ws,seq=0,serverLog='',browserLog='';const errors=[],networkErrors=[],pending=new Map(),result={run,port,cdp,profile,seed:20261006}
server.stdout.on('data',d=>serverLog=(serverLog+d).slice(-20000));server.stderr.on('data',d=>serverLog=(serverLog+d).slice(-20000))
const sleep=ms=>new Promise(r=>setTimeout(r,ms))
async function waitFor(f,label,limit=120000){const t=Date.now();for(;;){try{const v=await f();if(v)return v}catch{}if(Date.now()-t>limit)throw Error(`Timeout: ${label}`);await sleep(200)}}
const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++seq,timer=setTimeout(()=>{pending.delete(id);reject(Error('CDP timeout: '+method))},180000);pending.set(id,{resolve:v=>{clearTimeout(timer);resolve(v)},reject:e=>{clearTimeout(timer);reject(e)}});ws.send(JSON.stringify({id,method,params}))})
const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result?.value}
const capture=async name=>{const r=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});writeFileSync(path.join(out,`${name}.png`),Buffer.from(r.data,'base64'))}
const assert=(condition,message)=>{if(!condition)throw Error(message)}
try{
  console.log(`L11 exits QA: owned Vite ${port}, headless CDP ${cdp}`)
  await waitFor(async()=>(await fetch(base)).ok,'Vite',20000)
  browser=spawn(chrome,[`--user-data-dir=${profile}`,`--remote-debugging-port=${cdp}`,'--headless=new','--enable-automation','--no-first-run','--no-default-browser-check','--disable-background-networking','--window-size=1920,1080','about:blank'],{windowsHide:true,stdio:['ignore','pipe','pipe']})
  browser.stderr.on('data',d=>browserLog=(browserLog+d).slice(-20000))
  const pages=await waitFor(async()=>{const p=await(await fetch(`http://127.0.0.1:${cdp}/json/list`)).json();return p.length?p:null},'Chrome')
  ws=new WebSocket(pages.find(p=>p.type==='page').webSocketDebuggerUrl);await new Promise(r=>ws.addEventListener('open',r,{once:true}))
  ws.addEventListener('close',()=>{for(const p of pending.values())p.reject(Error('Owned QA browser closed'));pending.clear()})
  ws.addEventListener('message',e=>{const r=JSON.parse(e.data);if(r.method==='Runtime.exceptionThrown'||r.method==='Runtime.consoleAPICalled'&&r.params.type==='error')errors.push(r.params);if(r.method==='Network.loadingFailed'||r.method==='Network.responseReceived'&&r.params.response.status>=400)networkErrors.push(r.params);const p=pending.get(r.id);if(p){pending.delete(r.id);r.error?p.reject(r.error):p.resolve(r.result)}})
  const command=await send('Browser.getBrowserCommandLine');assert(command.arguments.includes('--headless=new')&&command.arguments.includes(`--user-data-dir=${profile}`),'Browser ownership/headless');result.command=command.arguments;result.browser=await send('Browser.getVersion');result.pids={server:server.pid,browser:browser.pid}
  await send('Page.enable');await send('Runtime.enable');await send('Network.enable');await send('Emulation.setDeviceMetricsOverride',{width:1920,height:1080,deviceScaleFactor:1,mobile:false})
  await send('Page.navigate',{url:`${base}/verifier/l11-map.html?level=11&mode=realistic`})
  await waitFor(()=>evaluate('window.qa?.ready'),'game ready')
  await evaluate("qa.hide();qa.r.setDetailDistance(.55);qa.r.setSceneLightLimit(8);qa.r.setLightShadows(0);qa.r.setShadows(false);qa.r.setBloomFx(false);qa.eng.dev.frozenAI=true;qa.eng.player.flashlight=false;qa.look.yaw=-2.55;qa.freezeRenderTime(10)")
  await evaluate("import('/verifier/l11-exits.ts').then(m=>m.attachL11Exits(qa))")
  if(brickOnly){
    result.scene=await evaluate("qa.portals.exterior('l11brickdoor')");await capture('brick-exterior')
    await evaluate("qa.portals.photoDoor('l11brickdoor',5)");await capture('brick-detail')
    result.door=await evaluate("qa.portals.door('l11brickdoor')")
    const used=await evaluate('qa.portals.use()');assert(used.transition?.dest===3,'Brick door destination')
    result.arrival=await evaluate('qa.portals.travel(3)');await capture('arrival-3')
  }else if(materialsOnly){
    result.scenes={}
    for(const kind of ['l11unfinisheddoor','l11liftshaft']){
      result.scenes[kind]=await evaluate(`qa.portals.exterior('${kind}')`);await capture(kind+'-exterior')
      if(kind==='l11unfinisheddoor'){await evaluate(`qa.portals.exterior('${kind}',true)`);await capture(kind+'-rear')}
      await evaluate(`qa.portals.photoDoor('${kind}',3.1)`);await capture(kind+'-detail')
      if(kind==='l11liftshaft'){result.pit=await evaluate('qa.portals.shaftPit()');await capture('shaft-pit')}
    }
    result.shaft=await evaluate('qa.portals.shaft()');result.arrival=await evaluate('qa.portals.travel(2)');await capture('arrival-2')
  }else if(visualOnly){
    result.scenes={}
    for(const kind of ['l11unfinisheddoor','l11brickdoor','l11liftshaft']){
      result.scenes[kind]=await evaluate(`qa.portals.exterior('${kind}')`);await capture(kind+'-exterior')
      if(kind==='l11unfinisheddoor'){await evaluate(`qa.portals.exterior('${kind}',true)`);await capture(kind+'-rear')}
      await evaluate(`qa.portals.photoDoor('${kind}',${kind==='l11brickdoor'?6:3.1})`);await capture(kind+'-detail')
    }
    result.office=await evaluate("qa.portals.door('l11officedoor')");await evaluate("qa.portals.photoDoor('l11officedoor',2.5)");await capture('office-door')
    result.archive=await evaluate('qa.portals.archive(0)');await evaluate("qa.portals.photoDoor('basebeta',2.8)");await capture('archive-sealed')
    result.archiveSubmit=await evaluate('qa.portals.archive(6)');await evaluate("qa.portals.photoDoor('basebeta',2.8)");await capture('archive-open')
    result.archiveReload=await evaluate('qa.portals.reloadArchive()')
    result.shaft=await evaluate('qa.portals.shaft()');result.shaftArrival=await evaluate('qa.portals.travel(2)');await capture('arrival-2')
  }else{
  result.worker=await evaluate('qa.portals.worker()');console.log('Worker/main exit plans agree')
  result.scenes={};result.transitions=[]
  for(const [kind,dest]of [['l11unfinisheddoor',1],['l11brickdoor',3],['l11officedoor',4]]){
    console.log('Checking '+kind)
    result.scenes[kind]=await evaluate(`qa.portals.exterior('${kind}')`);await capture(kind+'-exterior')
    if(kind==='l11unfinisheddoor'){await evaluate(`qa.portals.exterior('${kind}',true)`);await capture(kind+'-rear')}
    if(kind==='l11officedoor')result.officeStairs=await evaluate('qa.portals.stairs()')
    await evaluate(`qa.portals.photoDoor('${kind}',${kind==='l11brickdoor'?5:2.8})`);await capture(kind+'-detail')
    result.scenes[kind].door=await evaluate(`qa.portals.door('${kind}')`);await capture(kind+'-door')
    const used=await evaluate('qa.portals.use()');assert(used.transition?.dest===dest,'Wrong requested destination '+kind)
    result.transitions.push(await evaluate(`qa.portals.travel(${dest})`));await capture('arrival-'+dest);await evaluate('qa.portals.back()')
  }
  console.log('Checking bare concrete interior and walk-in shaft')
  result.scenes.shaft=await evaluate("qa.portals.exterior('l11liftshaft')");await capture('shaft-exterior')
  await evaluate("qa.portals.photoDoor('l11liftshaft',3.1)");await capture('shaft-interior')
  result.shaft=await evaluate('qa.portals.shaft()');result.transitions.push(await evaluate('qa.portals.travel(2)'));await capture('arrival-2');await evaluate('qa.portals.back()')
  console.log('Checking archive tape submission and persisted two-step entrance')
  result.archive=[]
  for(const n of [0,5,7]){result.archive.push(await evaluate(`qa.portals.archive(${n})`));await evaluate("qa.portals.photoDoor('basebeta',2.8)");await capture('archive-'+n)}
  result.archiveReload=await evaluate('qa.portals.reloadArchive()');await capture('archive-unsealed-reloaded')
  const used=await evaluate('qa.portals.use()');assert(used.transition?.dest===12&&used.tapes===1,'Second interaction failed or charged twice')
  result.transitions.push(await evaluate('qa.portals.travel(12)'));await capture('arrival-601');await evaluate('qa.portals.back()')
  result.archiveRevisit=await evaluate("qa.portals.door('basebeta')");await capture('archive-revisit')
  assert(await evaluate('qa.eng.l11World.archiveUnlocked&&qa.eng.countItem("tape")===1'),'Revisit lost unlock/tapes')
  }
  result.errors=errors;assert(!errors.length,`${errors.length} runtime errors`);result.ok=true
  console.log('L11 exits QA passed')
}catch(error){result.ok=false;result.failure=String(error);result.errors=errors;console.error(error);process.exitCode=1;try{if(ws?.readyState===WebSocket.OPEN)await capture('failure')}catch{}}
finally{
  if(ws?.readyState===WebSocket.OPEN){try{await send('Browser.close')}catch{}ws.close()}
  if(browser&&browser.exitCode===null)browser.kill();if(server.exitCode===null)server.kill()
  await sleep(800)
  result.cleanup={browserExit:browser?.exitCode??browser?.signalCode,serverExit:server.exitCode??server.signalCode}
  try {
    if (realpathSync(profile).startsWith(realpathSync(out)+path.sep)) {
      rmSync(profile,{recursive:true,force:true,maxRetries:3,retryDelay:300})
    }
  } catch {}
  result.cleanup.profileRemoved=!existsSync(profile)
  result.networkErrors=networkErrors
  writeFileSync(path.join(out,'runtime.json'),JSON.stringify(result,null,2));writeFileSync(path.join(out,'console.json'),JSON.stringify(errors,null,2));writeFileSync(path.join(out,'server.log'),serverLog);writeFileSync(path.join(out,'browser.log'),browserLog)
}
