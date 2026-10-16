// Owns every server/browser/profile it creates. Exercises the production engine and renderer.
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, writeFileSync, realpathSync, rmSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import net from 'node:net'

const args=process.argv.slice(2),hasFlag=name=>args.includes(name),valueOf=name=>args.find(a=>a.startsWith(`${name}=`))?.slice(name.length+1)
const baseline=hasFlag('--baseline'),low=hasFlag('--low'),mode=hasFlag('--classic')?'classic':'realistic',requestedLabel=valueOf('--label'),safeLabel=value=>String(value).toLowerCase().replace(/[^a-z0-9-]/g,'-').replace(/^-+|-+$/g,'').slice(0,64)||'final'
const label=safeLabel(requestedLabel??(baseline?'baseline':low?'low':'final'))
const quick=hasFlag('--quick')
const app=fileURLToPath(new URL('../',import.meta.url)),out=path.join(app,'reports/l11-reference',label),run=`qa-${Date.now()}-${process.pid}`,profile=path.join(out,run)
mkdirSync(profile,{recursive:true})
const freePort=()=>new Promise(resolve=>{const s=net.createServer();s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>resolve(p))})})
const port=await freePort(),cdp=await freePort(),base=`http://127.0.0.1:${port}`
const chrome=[process.env.L11_CHROME,path.join(process.env.PROGRAMFILES??'C:/Program Files','Google/Chrome/Application/chrome.exe'),path.join(process.env['PROGRAMFILES(X86)']??'C:/Program Files (x86)','Microsoft/Edge/Application/msedge.exe')].find(p=>p&&existsSync(p))
if(!chrome)throw Error('Set L11_CHROME to Chrome/Edge executable')
const server=spawn(process.execPath,[path.join(app,'scripts/l11-map-server.mjs'),String(port),profile],{cwd:app,windowsHide:true,stdio:['ignore','pipe','pipe']})
let browser,ws,seq=0,serverLog='',browserLog='';const errors=[],networkErrors=[],pending=new Map(),result={run,port,cdp,profile,label,baseline,low,mode,quick,seed:20261014,views:[]}
server.stdout.on('data',d=>serverLog=(serverLog+d).slice(-20000));server.stderr.on('data',d=>serverLog=(serverLog+d).slice(-20000))
const sleep=ms=>new Promise(r=>setTimeout(r,ms))
async function waitFor(f,label,limit=120000){const t=Date.now();for(;;){try{const v=await f();if(v)return v}catch{}if(Date.now()-t>limit)throw Error(`Timeout: ${label}`);await sleep(200)}}
const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++seq,timer=setTimeout(()=>{pending.delete(id);reject(Error('CDP timeout: '+method))},180000);pending.set(id,{resolve:v=>{clearTimeout(timer);resolve(v)},reject:e=>{clearTimeout(timer);reject(e)}});ws.send(JSON.stringify({id,method,params}))})
const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result?.value}
const capture=async name=>{const r=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});writeFileSync(path.join(out,`${name}.png`),Buffer.from(r.data,'base64'))}
const assert=(condition,message)=>{if(!condition)throw Error(message)}
try{
  console.log(`L11 reference QA: ${label}, owned Vite ${port}, headless CDP ${cdp}`)
  await waitFor(async()=>(await fetch(base)).ok,'Vite',20000)
  browser=spawn(chrome,[`--user-data-dir=${profile}`,`--remote-debugging-port=${cdp}`,'--headless=new','--enable-automation','--no-first-run','--no-default-browser-check','--disable-background-networking','--window-size=1920,1080','about:blank'],{windowsHide:true,stdio:['ignore','pipe','pipe']})
  browser.stderr.on('data',d=>browserLog=(browserLog+d).slice(-20000))
  const pages=await waitFor(async()=>{const p=await(await fetch(`http://127.0.0.1:${cdp}/json/list`)).json();return p.length?p:null},'Chrome')
  ws=new WebSocket(pages.find(p=>p.type==='page').webSocketDebuggerUrl);await new Promise(r=>ws.addEventListener('open',r,{once:true}))
  ws.addEventListener('message',e=>{const r=JSON.parse(e.data);if(r.method==='Runtime.exceptionThrown'||r.method==='Runtime.consoleAPICalled'&&r.params.type==='error')errors.push(r.params);if(r.method==='Network.loadingFailed'||r.method==='Network.responseReceived'&&r.params.response.status>=400)networkErrors.push(r.params);const p=pending.get(r.id);if(p){pending.delete(r.id);r.error?p.reject(r.error):p.resolve(r.result)}})
  const command=await send('Browser.getBrowserCommandLine');assert(command.arguments.includes('--headless=new')&&command.arguments.includes(`--user-data-dir=${profile}`),'Browser ownership/headless');result.command=command.arguments;result.browser=await send('Browser.getVersion');result.pids={server:server.pid,browser:browser.pid}
  await send('Page.enable');await send('Runtime.enable');await send('Network.enable');await send('Emulation.setDeviceMetricsOverride',{width:1920,height:1080,deviceScaleFactor:1,mobile:false})
  await send('Page.navigate',{url:`${base}/verifier/l11-map.html?level=11&mode=${mode}`})
  await waitFor(()=>evaluate('window.qa?.ready'),'game ready')
  await evaluate("qa.hide();qa.r.setDetailDistance(.55);qa.r.setSceneLightLimit(8);qa.r.setLightShadows(0);qa.r.setShadows(false);qa.r.setBloomFx(false);qa.eng.dev.frozenAI=true;qa.eng.player.flashlight=false;qa.look.yaw=-2.55;qa.freezeRenderTime(10)")
  await evaluate("import('/verifier/l11-reference.ts').then(m=>m.attachL11Reference(qa))")
  if(hasFlag('--texture-audit')||hasFlag('--lifecycle'))await evaluate(`import('/verifier/l11-resources.ts').then(m=>m.installL11TextureAudit(qa,${hasFlag('--texture-audit')}))`)
  result.setup=await evaluate(`qa.reference.setup({baseline:${baseline},low:${low}})`)
  let cases=await evaluate('qa.reference.cases()');if(quick)cases=cases.slice(0,3);if(valueOf('--case'))cases=cases.filter(c=>valueOf('--case').split(',').some(prefix=>c.id.startsWith(prefix)));result.cases=cases
  assert(cases.length>0,'No reference camera matched')
  for(const item of cases){const id=item.id;console.log(`Reference: ${id}`);const view=await evaluate(`qa.reference.view(${JSON.stringify(id)})`);await capture(id);view.performance=await evaluate('qa.sample(100,1500)');result.views.push(view)}
  result.hardware=await evaluate(`(()=>{const gl=qa.r.three.getContext(),ext=gl.getExtension('WEBGL_debug_renderer_info');return {vendor:ext?gl.getParameter(ext.UNMASKED_VENDOR_WEBGL):gl.getParameter(gl.VENDOR),renderer:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),version:gl.getParameter(gl.VERSION)}})()`)
  if(hasFlag('--profile-view')){
    await send('Profiler.enable');await send('Profiler.setSamplingInterval',{interval:500});await send('Profiler.start')
    result.profileView=await evaluate('qa.sample(200,5000)')
    const {profile}=await send('Profiler.stop');writeFileSync(path.join(out,'view.cpuprofile'),JSON.stringify(profile));await send('Profiler.disable')
  }
  if(hasFlag('--interaction'))result.interaction=await evaluate("import('/verifier/l11-reference-interaction.ts').then(m=>m.verifyL11ReferenceInteraction(qa))")
  if(hasFlag('--greenery'))result.greenery=await evaluate("import('/verifier/l11-reference-greenery.ts').then(m=>m.verifyL11ReferenceGreenery(qa))")
  if(hasFlag('--retail'))result.retail=await evaluate("import('/verifier/l11-retail.ts').then(m=>m.verifyL11Retail(qa))")
  if(hasFlag('--glass-debug')){
    result.glassDebug=await evaluate(`(()=>{const mats=new Map();qa.r.scene.traverse(o=>{for(const m of Array.isArray(o.material)?o.material:[o.material])if(m)mats.set(m.uuid,m)});window.debugMats=[...mats.values()];const glass=debugMats.filter(m=>m.name==='l11-architectural-glass');for(const m of glass)m.visible=false;return {glass:glass.map(m=>({name:m.name,opacity:m.opacity,color:m.color.getHexString(),env:m.envMapIntensity})),sun:{intensity:qa.r.sunDir.intensity,position:qa.r.sunDir.position.toArray(),target:qa.r.sunDir.target.position.toArray()},ambient:qa.r.ambient.intensity,hemi:qa.r.hemi.intensity,exposure:qa.r.three.toneMappingExposure}})()`)
    await sleep(300);await capture('debug-glass-hidden')
    await evaluate('qa.r.scene.remove(qa.r.sunDir);void 0');await sleep(300);await capture('debug-no-sun')
    await evaluate('qa.r.scene.add(qa.r.sunDir);qa.r.scene.environment=null;void 0');await sleep(300);await capture('debug-no-environment')
    await evaluate(`debugMats.filter(m=>m.userData.l11Interior&&m.color).forEach(m=>m.color.multiplyScalar(.05))`);await sleep(300);await capture('debug-interior-dark')
  }
  if(hasFlag('--leaf-debug')){
    result.leafDebug=await evaluate(`(()=>{const mats=new Set();qa.r.scene.traverse(o=>{for(const m of Array.isArray(o.material)?o.material:[o.material])if(m?.alphaTest>0&&m.map)mats.add(m)});window.leafDebug=[...mats];return leafDebug.map(m=>({name:m.name,color:m.color.getHexString(),env:m.envMapIntensity,map:m.map.image?.src,size:[m.map.image?.width,m.map.image?.height],uvTransform:m.map.matrix.elements,normal:m.normalMap?.image?.src,rough:m.roughness,loaded:m.map.userData.loadedImage}))})()`)
    await evaluate(`leafDebug.forEach(m=>{m.normalMap=null;m.roughnessMap=null;m.envMapIntensity=0;m.roughness=1;m.needsUpdate=true})`);await sleep(500);await capture('leaf-diffuse-diagnostic')
  }
  if(hasFlag('--shadow-debug')){
    await evaluate('qa.r.setSunShadows(false);void 0');await sleep(600);await capture('debug-no-sun-shadow')
    await evaluate(`qa.r.scene.traverse(o=>{if(o.isMesh)o.receiveShadow=false});void 0`);await sleep(600);await capture('debug-no-receive-shadow')
  }
  if(!baseline&&!hasFlag('--visual-only')){
    result.validation=[]
    for(const id of await evaluate('qa.reference.validationCases()')){if(valueOf('--validate')&&!valueOf('--validate').split(',').some(key=>id.endsWith(key)))continue;console.log(`Traverse: ${id.split(':').at(-1)}`);result.validation.push(await evaluate(`qa.reference.validate(${JSON.stringify(id)})`))}
  }
  else result.validationSkipped=true
  if(hasFlag('--rooms')){
    result.roomWalks=[]
    for(const id of await evaluate('qa.reference.validationCases()')){
      if(valueOf('--validate')&&!valueOf('--validate').split(',').some(key=>id.endsWith(key)))continue
      console.log(`Room doors: ${id.split(':').at(-1)}`)
      result.roomWalks.push(await evaluate(`import('/verifier/l11-reference-rooms.ts').then(m=>m.verifyL11ReferenceRooms(qa,${JSON.stringify(id)}))`))
    }
  }
  if(hasFlag('--map')){
    await evaluate("qa.moveTo(794,868);qa.eng.player.z=0;qa.eng.player.floor=0;qa.eng.explored.fill(1);qa.eng.devEnabled=true");await evaluate('qa.warm()')
    await evaluate("import('/verifier/l11-map.tsx').then(m=>m.attachL11MapUI(qa))");await sleep(500);await evaluate('qa.mapUI.open()')
    await waitFor(()=>evaluate("document.querySelector('[data-l11-map-canvas]')?.dataset.mode==='city'&&document.querySelector('[data-l11-map-panel]')?.textContent.includes('步行岸道')"),'promenade map legend')
    await sleep(800);result.map=await evaluate("({context:qa.mapUI.context(),legend:document.querySelector('[data-l11-map-panel]').textContent,worker:qa.mapUI.state()})");await capture('39-canal-map');await evaluate('qa.mapUI.unmount()')
  }
  if(hasFlag('--lifecycle')){
    console.log('Reference district: normal walking and chunk streaming')
    await evaluate("qa.moveTo(272,403);qa.eng.player.z=0;qa.look.yaw=0;qa.look.pitch=.03;qa.eng.player.flashlight=false");await evaluate('qa.warm()')
    result.walkStart=await evaluate('({x:qa.eng.player.x+qa.eng.map.inf.ox,y:qa.eng.player.y+qa.eng.map.inf.oy,revision:qa.eng.map.inf.rev})')
    await evaluate(`(()=>{const e=qa.eng,original=e.updateInfiniteWindow;qa.streamTimings=[];qa.restoreStreamTimer=()=>{e.updateInfiniteWindow=original};e.updateInfiniteWindow=function(...args){const start=performance.now(),before=this.map.inf.rev,result=original.apply(this,args),ms=performance.now()-start;if(ms>5||before!==this.map.inf.rev)qa.streamTimings.push({ms,before,after:this.map.inf.rev,x:this.player.x+this.map.inf.ox,y:this.player.y+this.map.inf.oy});return result}})()`)
    await evaluate('qa.setFrozen(false);qa.eng.dev.god=true;qa.eng.dev.statLock=true;qa.eng.dev.frozenAI=true')
    if(hasFlag('--cpu-profile')){await send('Profiler.enable');await send('Profiler.setSamplingInterval',{interval:500});await send('Profiler.start')}
    await send('Input.dispatchKeyEvent',{type:'keyDown',code:'KeyW',key:'w',windowsVirtualKeyCode:87})
    const walkStarted=Date.now();result.walkExtensions=[]
    try{
      // Keep the original 24-second performance sample. Physical streaming
      // coverage is a distance requirement: the engine caps simulation dt at
      // low FPS, so allow bounded extra walking without hiding the slow sample.
      result.walking=await evaluate('qa.sample(120,24000)')
      for(;;){
        const current=await evaluate('({x:qa.eng.player.x+qa.eng.map.inf.ox,y:qa.eng.player.y+qa.eng.map.inf.oy})')
        const distance=Math.hypot(current.x-result.walkStart.x,current.y-result.walkStart.y),remaining=60000-(Date.now()-walkStarted)
        if(distance>=70||remaining<1000)break
        console.log(`Walking coverage: ${distance.toFixed(1)}m; continuing to cover city chunks`)
        result.walkExtensions.push(await evaluate(`qa.sample(20,${Math.min(12000,remaining)})`))
      }
      result.walkWallMs=Date.now()-walkStarted
    }
    finally{await send('Input.dispatchKeyEvent',{type:'keyUp',code:'KeyW',key:'w',windowsVirtualKeyCode:87});await evaluate('qa.setFrozen(true);qa.restoreStreamTimer()');if(hasFlag('--cpu-profile')){const {profile}=await send('Profiler.stop');writeFileSync(path.join(out,'walking.cpuprofile'),JSON.stringify(profile));await send('Profiler.disable')}}
    result.streamTimings=await evaluate('qa.streamTimings')
    result.walkEnd=await evaluate('({x:qa.eng.player.x+qa.eng.map.inf.ox,y:qa.eng.player.y+qa.eng.map.inf.oy,revision:qa.eng.map.inf.rev})')
    assert(result.walkStart.y-result.walkEnd.y>50&&result.walkEnd.revision>result.walkStart.revision,'Normal walk failed to cross city chunks')
    await evaluate('qa.warm()');await capture('13-walking')
    result.cycles=[]
    for(let i=0;i<3;i++){
      console.log(`Reference district: unload/reload cycle ${i+1}`)
      for(const [x,y]of [[272,403],[120,552],[760,967.8],[272,403]]){await evaluate(`qa.moveTo(${x},${y});qa.eng.player.z=0`);await evaluate('qa.warm()')}
      result.cycles.push(await evaluate("import('/verifier/l11-resources.ts').then(m=>m.l11ResourceSnapshot(qa))"))
      result.cycles.at(-1).foliageCache=await evaluate("import('/src/game/renderer/l11FoliageGeometry.ts').then(m=>m.l11FoliageCacheInfo())")
    }
    const first=result.cycles[0]
    assert(result.cycles.every(c=>c.geometryAudit.scene.cpu<=first.geometryAudit.scene.cpu+6&&c.geometryAudit.offScene<=first.geometryAudit.offScene+6&&c.nonPooledTextures<=first.nonPooledTextures+3&&c.cachedAvatarTextures<=57&&c.roots===first.roots&&c.buildings===c.references),'Reference district resource lifetime/dedup regression')
    assert(result.cycles.every(c=>c.foliageCache.bytes<=c.foliageCache.maxBytes&&c.foliageCache.entries<=c.foliageCache.maxEntries),'Foliage source cache exceeded city exploration budget')
  }
  if(hasFlag('--architecture')){
    console.log('Traverse: corner shop street entrance');result.inspected=await evaluate('qa.reference.inspection()')
    console.log('Traverse: curved bridge and submerged piers');result.civil=await evaluate('qa.reference.civil()');result.random=[]
    for(const kind of await evaluate('qa.reference.randomCases()')){if(valueOf('--random-cases')&&!valueOf('--random-cases').split(',').includes(kind))continue;console.log('Ordinary world: '+kind);result.random.push(await evaluate(`qa.reference.random(${JSON.stringify(kind)})`));await capture('random-'+kind)}
  }
  result.performance=await evaluate('qa.sample(100,1500)')
  result.errors=errors;assert(!errors.length,`${errors.length} runtime errors`);result.ok=true
  console.log('L11 reference QA passed')
}catch(error){result.ok=false;result.failure=String(error);result.errors=errors;console.error(error);process.exitCode=1;try{if(ws?.readyState===WebSocket.OPEN){
  result.failureState=await evaluate(`(()=>{const r=qa.r,gl=r.three.getContext(),ext=gl.getExtension('KHR_parallel_shader_compile');return {pending:qa.pendingWork(),stats:qa.stats(),chunk:r.cityChunkTask?.key,revision:qa.eng.map.inf?.rev,contextLost:gl.isContextLost(),programs:r.three.info.programs.map(p=>({id:p.id,name:p.name,used:p.usedTimes,ready:!p.program||!ext||gl.getProgramParameter(p.program,ext.COMPLETION_STATUS_KHR)}))}})()`)
  await capture('failure')
}}catch{}}
finally{
  if(ws?.readyState===WebSocket.OPEN){try{await send('Browser.close')}catch{}ws.close()}
  if(browser&&browser.exitCode===null)browser.kill();if(server.exitCode===null)server.kill()
  await sleep(800)
  result.cleanup={browserExit:browser?.exitCode??browser?.signalCode,serverExit:server.exitCode??server.signalCode}
  try { if (realpathSync(profile).startsWith(realpathSync(out)+path.sep)) rmSync(profile,{recursive:true,force:true,maxRetries:3,retryDelay:300}) } catch {}
  result.cleanup.profileRemoved=!existsSync(profile)
  result.networkErrors=networkErrors
  writeFileSync(path.join(out,'runtime.json'),JSON.stringify(result,null,2));writeFileSync(path.join(out,'console.json'),JSON.stringify(errors,null,2));writeFileSync(path.join(out,'server.log'),serverLog);writeFileSync(path.join(out,'browser.log'),browserLog)
}
