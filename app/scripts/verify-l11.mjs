// This process owns its Vite child, Chrome profile and CDP port. No existing browser is reused.
import {spawn} from 'node:child_process'
import {existsSync,mkdirSync,writeFileSync,realpathSync,rmSync} from 'node:fs'
import {fileURLToPath} from 'node:url'
import path from 'node:path'
import net from 'node:net'
const refining=process.argv.includes('--refinement')
const props=process.argv.includes('--props')
const urban=process.argv.includes('--urban')
const roomFilter=process.argv.find(a=>a.startsWith('--room-filter='))?.split('=')[1].split(',')
const exteriorFilter=process.argv.find(a=>a.startsWith('--exterior-filter='))?.split('=')[1].split(',')
const resourcesOnly=process.argv.includes('--resources')
const streamingOnly=process.argv.includes('--streaming')
const propsOnly=process.argv.includes('--props-only'),propFilter=process.argv.find(a=>a.startsWith('--prop-filter='))?.split('=')[1].split(',')
const app=fileURLToPath(new URL('../',import.meta.url)),out=path.join(app,'reports',urban?'l11-urban':props?'l11-props':refining?'l11-refinement':'l11-remake'),run=`qa-${Date.now()}-${process.pid}`,profile=path.join(out,run)
mkdirSync(profile,{recursive:true})
const freePort=()=>new Promise(resolve=>{const s=net.createServer();s.listen(0,'127.0.0.1',()=>{const port=s.address().port;s.close(()=>resolve(port))})})
const port=await freePort(),cdp=await freePort(),base=`http://127.0.0.1:${port}`,mode=process.argv.includes('--classic')?'classic':process.argv.includes('--low')?'low':'realistic'
const profiling=process.argv.includes('--profile')
const signageOnly=process.argv.includes('--signs')
const reportName=mode+(resourcesOnly?'-resources':streamingOnly?'-streaming':propsOnly?'-props':profiling?'-profile':signageOnly?'-signs':process.argv.includes('--smoke')?'-smoke':'')
const lossless=process.argv.includes('--png'),imageExt=lossless?'png':'jpg'
const chrome=[process.env.L11_CHROME,path.join(process.env.PROGRAMFILES??'C:/Program Files','Google/Chrome/Application/chrome.exe'),path.join(process.env['PROGRAMFILES(X86)']??'C:/Program Files (x86)','Microsoft/Edge/Application/msedge.exe'),path.join(process.env.LOCALAPPDATA??'','Google/Chrome/Application/chrome.exe')].find(p=>p&&existsSync(p))
if(!chrome)throw Error('Chrome/Edge executable not found; set L11_CHROME')
const server=spawn(process.execPath,[path.join(app,'node_modules/vite/bin/vite.js'),'--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:app,windowsHide:true,stdio:['ignore','pipe','pipe']})
let serverLog='',browserLog='',browser,ws,seq=0,errors=[],result={mode,run,port,cdp,profile},pending=new Map()
server.stdout.on('data',d=>{serverLog=(serverLog+d).slice(-24000)});server.stderr.on('data',d=>{serverLog=(serverLog+d).slice(-24000)})
const sleep=ms=>new Promise(r=>setTimeout(r,ms))
async function waitFor(f,label,limit=120000){const start=Date.now();for(;;){try{const v=await f();if(v)return v}catch{}if(Date.now()-start>limit)throw Error(`Timeout: ${label}`);await sleep(200)}}
const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++seq,timer=setTimeout(()=>{pending.delete(id);reject(Error(`CDP timeout: ${method}`))},180000);pending.set(id,{resolve:v=>{clearTimeout(timer);resolve(v)},reject:e=>{clearTimeout(timer);reject(e)}});ws.send(JSON.stringify({id,method,params}))})
const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result?.value}
const capture=async name=>{const r=await send('Page.captureScreenshot',{format:lossless?'png':'jpeg',...(lossless?{}:{quality:94}),captureBeyondViewport:false});writeFileSync(path.join(out,`${mode}-${name}.${imageExt}`),Buffer.from(r.data,'base64'))}
// Let the actual exposure meter adapt at the new location before fixing only
// the final visual phase. Freezing render time during adaptation stalls its timer.
const photoSample=()=>evaluate('(async()=>{const stats=await qa.sample(120,2200);qa.freezeRenderTime(10);qa.r.bobPhase=0;await new Promise(requestAnimationFrame);return stats})()')
try{
  console.log(`L11 QA: starting owned server on ${port}`)
  await waitFor(async()=> (await fetch(base)).ok,'owned Vite',20000)
  console.log(`L11 QA: starting headless Chrome on ${cdp}`)
  browser=spawn(chrome,[`--user-data-dir=${profile}`,`--remote-debugging-port=${cdp}`,'--headless=new','--enable-automation','--no-first-run','--no-default-browser-check','--disable-background-networking','--disk-cache-size=8388608','--media-cache-size=1048576','--window-size=1920,1080','about:blank'],{windowsHide:true,stdio:['ignore','pipe','pipe']})
  browser.stderr.on('data',d=>{browserLog=(browserLog+d).slice(-24000)})
  const pages=await waitFor(async()=>{const p=await(await fetch(`http://127.0.0.1:${cdp}/json/list`)).json();return p.length?p:null},'owned Chrome')
  ws=new WebSocket(pages.find(p=>p.type==='page').webSocketDebuggerUrl);await new Promise(r=>ws.addEventListener('open',r,{once:true}))
  ws.addEventListener('message',e=>{const r=JSON.parse(e.data);if(r.method==='Runtime.exceptionThrown')errors.push(r.params.exceptionDetails);if(r.method==='Runtime.consoleAPICalled'&&r.params.type==='error')errors.push(r.params);const p=pending.get(r.id);if(p){pending.delete(r.id);r.error?p.reject(r.error):p.resolve(r.result)}})
  const command=await send('Browser.getBrowserCommandLine');if(!command.arguments.includes('--headless=new')||!command.arguments.includes(`--user-data-dir=${profile}`))throw Error('Browser ownership/headless assertion failed')
  result.browser=await send('Browser.getVersion');result.command=command.arguments;result.pids={server:server.pid,browser:browser.pid}
  await send('Runtime.enable');await send('Page.enable');await send('Emulation.setDeviceMetricsOverride',{width:1920,height:1080,deviceScaleFactor:1,mobile:false})
  await send('Page.navigate',{url:`${base}/verifier/l0-remake.html?level=11&mode=${mode==='low'?'realistic':mode}`})
  await waitFor(()=>evaluate('window.qa?.ready'),'L11 verifier ready')
  console.log('L11 QA: game loaded, warming scene')
  await evaluate('qa.hide();qa.eng.dev.frozenAI=true;qa.eng.player.flashlight=false;qa.eng.player.z=0;qa.look.yaw=-2.55;qa.look.pitch=.025;qa.freezeRenderTime(10)')
  if(mode==='low')await evaluate('qa.r.setTextureQuality(0);qa.r.setLightShadows(0);qa.r.setShadows(false);qa.r.setSunShadows(false);qa.r.setBloomFx(false);qa.r.setSceneLightLimit(8);qa.r.setDetailDistance(.55);qa.r.setParticleDensity(.4)');
  result.quality=await evaluate('({viewport:[innerWidth,innerHeight],texture:qa.r.textureQuality,shadowLights:qa.r.lightShadowCount,shadows:qa.r.three.shadowMap.enabled,sceneLights:qa.r.sceneLightLimit,bloom:qa.r.bloomOn,detail:qa.r.detailDistanceScale})');result.screenshotFormat=imageExt;
  result.warm=await evaluate('qa.warm()')
  result.world=await evaluate('({npcs:qa.eng.npcs.length,buildings:qa.eng.map.structures.filter(s=>s.l11).length,structures:qa.eng.map.structures.length,shared:[...qa.eng.map.inf.cityReferences],rendered:qa.r.cityInstances.size,exits:qa.eng.map.exits.map(e=>({name:e.def.name,kind:e.def.kind,req:e.def.req})),origin:[qa.eng.map.inf.ox,qa.eng.map.inf.oy]})')
  result.entry=await photoSample()
  result.lighting=await evaluate('({sun:qa.r.sunDir.intensity,ambient:qa.r.ambient.intensity,hemisphere:qa.r.hemi.intensity,exposure:qa.r.three.toneMappingExposure,shadowCamera:{extent:qa.r.sunDir.shadow.camera.right,far:qa.r.sunDir.shadow.camera.far},skyProbe:!!qa.r.scene.environment})')
  await capture('entry')
  if(urban&&!resourcesOnly&&!streamingOnly&&!process.argv.includes('--functional')&&!process.argv.includes('--smoke')){
    const groups=await evaluate("import('/verifier/l11-urban.ts').then(m=>m.l11UrbanPhotoCandidates())");result.roomViews=[];
    for(const group of groups){
      if(roomFilter&&!roomFilter.includes(group[0].id.slice(5)))continue;
      console.log('L11 QA: furnished interior '+group[0].id);
      const pose=await evaluate("import('/verifier/l11-urban.ts').then(m=>m.prepareL11UrbanPhoto(qa,"+JSON.stringify(group)+"))");
      const stats=await photoSample();await capture(pose.id);result.roomViews.push({...pose,stats});
    }
  }
  if(props&&!resourcesOnly&&!streamingOnly&&!process.argv.includes('--functional')&&!process.argv.includes('--smoke')){
    const candidates=await evaluate("import('/verifier/l11-props.ts').then(m=>m.l11PropPhotoCandidates())");result.propViews=[];
    for(const group of candidates){
      if(propFilter&&!propFilter.includes(group[0].kind.slice(4)))continue;
      console.log('L11 QA: generated prop closeup '+group[0].id);
      const pose=await evaluate("import('/verifier/l11-props.ts').then(m=>m.prepareL11PropPhoto(qa,"+JSON.stringify(group)+"))");
      const stats=await photoSample();await capture(pose.id);result.propViews.push({...pose,stats});
    }
    await evaluate('qa.r.setFov(75,35)');
  }
  if(!resourcesOnly&&!streamingOnly&&!profiling&&!process.argv.includes('--smoke')&&!process.argv.includes('--functional')){
    const signPoses=await evaluate("import('/verifier/l11-runtime.ts').then(m=>m.l11SignPhotoPoses())");
    result.photoPoses=urban?[{id:'archive',x:28,y:77,yaw:-Math.PI/2},{id:'mixed',x:528,y:272,yaw:1.05},...await evaluate("import('/verifier/l11-urban.ts').then(m=>m.l11UrbanExteriorPoses())")]:props?[{id:'interior',x:40,y:70,yaw:-1.2},{id:'mixed',x:528,y:272,yaw:1.05}]:signageOnly?signPoses:[{id:'archive',x:28,y:77,yaw:-Math.PI/2},{id:'interior',x:40,y:70,yaw:-1.2},{id:'mixed',x:528,y:272,yaw:1.05},{id:'canal',x:700,y:300,yaw:-.5},{id:'metro',x:27.5,y:120,yaw:Math.PI},...await evaluate("import('/verifier/l11-runtime.ts').then(m=>m.l11PhotoPoses())"),...signPoses];
    if(refining&&!signageOnly)result.photoPoses.push(...await evaluate("import('/verifier/l11-runtime.ts').then(m=>m.l11FloorPhotoPoses())"));
    for(const pose of result.photoPoses){
      if(exteriorFilter&&!exteriorFilter.includes(pose.id))continue;
      console.log('L11 QA: reference view '+pose.id);
      await evaluate(`qa.moveTo(${pose.x},${pose.y});qa.eng.player.z=${pose.z??0};qa.look.yaw=${pose.yaw};qa.look.pitch=${pose.pitch??.02};qa.freezeRenderTime(10);`);const warm=await evaluate('qa.warm()')
      const stats=await photoSample();await capture(pose.id)
      result[pose.id]={stats,warm,...await evaluate('({pending:qa.pendingWork(),models:qa.r.cityInstances.size,exposure:qa.r.three.toneMappingExposure,lighting:{sun:qa.r.sunDir.intensity,sunShadows:qa.r.sunDir.castShadow,shadowMap:qa.r.three.shadowMap.enabled,outdoor:qa.r.outK}})')}
    }
    if(refining&&mode==='low'&&!signageOnly){
      const indoor=result.interior.lighting,outdoor=result.mixed.lighting;
      if(indoor.sunShadows||indoor.shadowMap||indoor.sun>.05||outdoor.sun<1)throw Error('Unshadowed daylight leaks through the archive roof, or outdoor daylight is missing');
      result.unshadowedDaylight={ok:true,indoor,outdoor};
    }
    // Some catalog materials may not occur in these particular camera views.
    // Request them, then wait for their asynchronous file decode before auditing.
    const materialReport=`import('/src/game/renderer/l11Materials.ts').then(m=>Object.keys(m.L11_SURFACE_MAPS).map(kind=>{const mat=m.l11Material(kind);return {kind,maps:['map','normalMap','roughnessMap'].map(k=>({channel:k,width:mat[k]?.image?.width??0,height:mat[k]?.image?.height??0,repeat:mat[k]?.repeat.toArray()}))}}))`;
    result.materials=await waitFor(async()=>{const materials=await evaluate(materialReport);return materials.every(m=>m.maps.every(t=>t.width>=512&&t.height>=512))?materials:null},'all CC0 city PBR maps decoded',20000);
    result.signage=await evaluate("import('/verifier/l11-runtime.ts').then(m=>m.verifyL11Signage(qa))");
    if(refining)result.surfaceWeather=await evaluate("import('/verifier/l11-runtime.ts').then(m=>m.verifyL11SurfaceWeather(qa))");
  }
  if(!resourcesOnly&&!streamingOnly&&!propsOnly&&!signageOnly&&!profiling&&!process.argv.includes('--smoke')){
    console.log('L11 QA: exercising Worker parity and gameplay');
    result.worker=await evaluate("import('/verifier/l11-runtime.ts').then(m=>m.verifyL11Worker())");
    result.functional=await evaluate("import('/verifier/l11-runtime.ts').then(m=>m.verifyL11Runtime(qa))");
    if(urban){
      const targets=await evaluate("import('/verifier/l11-urban.ts').then(m=>m.L11_URBAN_WALK_TARGETS)");result.roomTraversal={ok:true,checks:[]};
      for(let i=0;i<targets.length;i++){
        console.log('L11 QA: two-way room traversal '+targets[i].join(':'));
        const checked=await evaluate("import('/verifier/l11-urban.ts').then(m=>m.verifyL11UrbanRooms(qa,"+i+"))");result.roomTraversal.checks.push(...checked.checks);
      }
    }
  }
  if(!propsOnly&&!signageOnly&&!process.argv.includes('--smoke')&&!process.argv.includes('--functional')){
    if(!resourcesOnly){
    console.log('L11 QA: measuring real walking across a macroregion boundary');
    await evaluate('qa.moveTo(528,994);qa.eng.player.z=0;qa.look.yaw=Math.PI;qa.look.pitch=.02;qa.eng.player.flashlight=false');await evaluate('qa.warm()');
    result.movingStart=await evaluate('({x:qa.eng.player.x+qa.eng.map.inf.ox,y:qa.eng.player.y+qa.eng.map.inf.oy,revision:qa.eng.map.inf.rev})');
    if(profiling){await send('Profiler.enable');await send('Profiler.start');await evaluate(`qa.timings={};qa.shaderStalls=[];const gl=qa.r.three.getContext(),originalLog=gl.getProgramInfoLog;gl.getProgramInfoLog=function(program){const t=performance.now();const result=originalLog.call(this,program);const ms=performance.now()-t;if(ms>30){const entry=qa.r.three.info.programs.find(p=>p.program===program);qa.shaderStalls.push({ms,name:entry?.name,type:entry?.type,cacheKey:entry?.cacheKey,y:qa.eng.player.y+qa.eng.map.inf.oy,stack:new Error().stack,sources:gl.getAttachedShaders(program)?.map(s=>gl.getShaderSource(s))})}return result};for(const key of ['updateMovement','updateSurvival','updateEntities','updateJerry','updateNpcs','scanInteract','triggerStructs','updateAmbient','computeVisibility','updateInfiniteWindow','update']){const original=qa.eng[key];qa.eng[key]=function(...args){const t=performance.now();try{return original.apply(this,args)}finally{const p=qa.timings[key]??(qa.timings[key]={ms:0,calls:0,max:0});const dt=performance.now()-t;p.ms+=dt;p.calls++;p.max=Math.max(p.max,dt)}}}`)}
    await evaluate('qa.setFrozen(false);qa.eng.dev.god=true;qa.eng.dev.statLock=true;qa.eng.dev.frozenAI=true');
    await send('Input.dispatchKeyEvent',{type:'keyDown',code:'KeyW',key:'w',windowsVirtualKeyCode:87});
    const walkingStarted=Date.now();
    try{
      // Keep the original 24-second performance sample, including streaming
      // stalls. The engine caps simulation dt, so wall time cannot establish
      // that a fixed distance was walked. Continue the same held key until the
      // actual boundary is crossed, recording extra time separately.
      result.moving=await evaluate('qa.sample(120,24000)');result.movingContinuation=[];
      for(;;){
        result.movingEnd=await evaluate('({x:qa.eng.player.x+qa.eng.map.inf.ox,y:qa.eng.player.y+qa.eng.map.inf.oy,revision:qa.eng.map.inf.rev})');
        if(Math.floor((result.movingEnd.y-16)/1024)>Math.floor((result.movingStart.y-16)/1024)||Date.now()-walkingStarted>=60000)break;
        result.movingContinuation.push(await evaluate('qa.sample(30,5000)'));
      }
      result.walkingElapsedMs=Date.now()-walkingStarted;
    }finally{await send('Input.dispatchKeyEvent',{type:'keyUp',code:'KeyW',key:'w',windowsVirtualKeyCode:87});await evaluate('qa.setFrozen(true)')}
    if(profiling){const profile=await send('Profiler.stop');writeFileSync(path.join(out,'walking.cpuprofile'),JSON.stringify(profile.profile));result.timings=await evaluate('qa.timings');writeFileSync(path.join(out,'shader-stalls.json'),JSON.stringify(await evaluate('qa.shaderStalls'),null,2))}
    result.crossedMacroregion=Math.floor((result.movingEnd.y-16)/1024)>Math.floor((result.movingStart.y-16)/1024);
    if(!result.crossedMacroregion||result.movingEnd.revision<=result.movingStart.revision)throw Error('Normal walking did not cross the macroregion boundary');
    await evaluate('qa.warm()');await capture('macro-boundary');
    }
    if(!profiling){
    console.log('L11 QA: checking repeated unload/reload resources');result.cycles=[];
    for(let cycle=0;cycle<3;cycle++){
      for(const [x,y] of [[26.5,26.5],[528,272],[700,300],[26.5,26.5]]){await evaluate('qa.moveTo('+x+','+y+');qa.eng.player.z=0');await evaluate('qa.warm()')}
      result.cycles.push(await evaluate("import('/verifier/l11-resources.ts').then(m=>m.l11ResourceSnapshot(qa))"));
    }
    const [first]=result.cycles;
    // Interior culling can defer uploads without changing the scene itself.
    // Check live model growth and off-scene GPU growth independently, so a
    // newly visible interior cannot masquerade as a leak (or hide one).
    if(result.cycles.some(c=>c.geometryAudit.scene.cpu>first.geometryAudit.scene.cpu+6||c.geometryAudit.offScene>first.geometryAudit.offScene+6||c.memory.textures>first.memory.textures+3||c.roots!==first.roots||c.buildings!==c.references))throw Error('Resource lifetime/dedup regression');
    for(const kind of ['calm','gust','rain','mist']){
      await evaluate('qa.moveTo(528,272);qa.look.yaw=1.05;Object.assign(qa.eng.l11Weather,{kind:"'+kind+'",k:'+(kind==='calm'?0:1)+',wetness:'+(kind==='rain'?1:0)+',t:120});qa.freezeRenderTime(10)');await evaluate('qa.warm()');await photoSample();await capture('weather-'+kind);
    }
    }
  }
  result.errors=errors;if(errors.length)throw Error(`${errors.length} runtime errors`)
  result.ok=true;console.log(JSON.stringify(result,null,2))
}catch(error){result.ok=false;result.failure=String(error);result.errors=errors;console.error(error);process.exitCode=1}
finally{
  if(ws?.readyState===WebSocket.OPEN){try{await send('Browser.close')}catch{}ws.close()}
  if(browser&&browser.exitCode===null)browser.kill();if(server.exitCode===null)server.kill()
  try{
    writeFileSync(path.join(out,`${reportName}-runtime.json`),JSON.stringify(result,null,2));writeFileSync(path.join(out,`${reportName}-console.json`),JSON.stringify(errors,null,2));writeFileSync(path.join(out,`${reportName}-server.log`),serverLog);writeFileSync(path.join(out,`${reportName}-browser.log`),browserLog)
  }finally{
    await sleep(800)
    // Cleanup must also run after a disk-full failure writing the report.
    // Only this run's profile can be removed, after confirming its resolved parent.
    try{if(realpathSync(profile).startsWith(realpathSync(out)+path.sep))rmSync(profile,{recursive:true,force:true,maxRetries:3,retryDelay:300})}catch{}
  }
}
