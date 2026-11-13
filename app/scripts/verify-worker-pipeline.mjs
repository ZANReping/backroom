import {spawn,spawnSync} from 'node:child_process'
import {mkdirSync,writeFileSync,existsSync,realpathSync,rmSync} from 'node:fs'
import path from 'node:path'
import net from 'node:net'
const root=process.cwd(),mode=process.argv.includes('--classic')?'classic':'realistic',only=process.argv.includes('--pilot')?'pilot':process.argv.includes('--app')?'app':'all',suffix=process.argv.find(a=>a.startsWith('--label='))?.slice(8)??only+'-'+mode
const dir=path.join(root,'reports/offscreen-20261108',suffix);mkdirSync(dir,{recursive:true})
const profile=path.join(dir,'qa-'+Date.now()+'-'+process.pid);mkdirSync(profile)
const free=()=>new Promise(r=>{const s=net.createServer();s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>r(p))})})
const port=await free(),cdp=await free(),base='http://127.0.0.1:'+port
const sleep=ms=>new Promise(r=>setTimeout(r,ms)),report={mode,only,checks:[],scenes:[],errors:[],console:[],httpErrors:[],port,cdp,profile}
let server,browser,ws,id=0,serverLog='';const pending=new Map()
const send=(method,params={})=>new Promise((resolve,reject)=>{const n=++id,t=setTimeout(()=>{pending.delete(n);reject(Error('CDP timeout '+method))},240000);pending.set(n,{resolve:v=>{clearTimeout(t);resolve(v)},reject:e=>{clearTimeout(t);reject(e)}});ws.send(JSON.stringify({id:n,method,params}))})
const ev=async expression=>{const r=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value}
async function until(fn,label,ms=180000){const t=Date.now();while(Date.now()-t<ms){let v;try{v=await fn()}catch(e){if(e.fatal||report.errors.length)throw e}if(v)return v;await sleep(150)}throw Error('Timeout '+label)}
const check=(v,label)=>{if(!v)throw Error(label);report.checks.push(label);console.log(label)}
const shot=async name=>writeFileSync(path.join(dir,name+'.png'),Buffer.from((await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false})).data,'base64'))
writeFileSync(path.join(dir,'session.json'),JSON.stringify({port,cdp,profile,owner:process.pid}))
const persist=()=>writeFileSync(path.join(dir,'result.json'),JSON.stringify(report,null,2))
try{
 server=spawn(process.execPath,['scripts/worker-pipeline-server.mjs',String(port),path.join(profile,'vite')],{cwd:root,windowsHide:true,stdio:['ignore','pipe','pipe']})
 for(const stream of[server.stdout,server.stderr])stream.on('data',b=>serverLog=(serverLog+b).slice(-30000))
 await until(async()=>(await fetch(base)).ok,'vite')
 browser=spawn('C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless=new','--enable-automation',`--remote-debugging-port=${cdp}`,`--user-data-dir=${profile}`,'--no-first-run','--no-default-browser-check','--disable-background-networking','--disable-background-timer-throttling','--disable-renderer-backgrounding','--window-size=1920,1080','about:blank'],{windowsHide:true,stdio:'ignore'})
 const page=await until(async()=>(await(await fetch(`http://127.0.0.1:${cdp}/json/list`)).json()).find(p=>p.type==='page'),'chrome')
 ws=new WebSocket(page.webSocketDebuggerUrl);await new Promise(r=>ws.addEventListener('open',r,{once:true}))
 ws.addEventListener('message',e=>{const m=JSON.parse(e.data),job=pending.get(m.id);if(job){pending.delete(m.id);m.error?job.reject(Error(JSON.stringify(m.error))):job.resolve(m.result)}if(m.method==='Runtime.exceptionThrown')report.errors.push(m.params);if(m.method==='Runtime.consoleAPICalled'&&['error','warning'].includes(m.params.type))report.console.push(m.params);if(m.method==='Network.responseReceived'&&m.params.response.status>=400)report.httpErrors.push(m.params.response)})
 report.command=(await send('Browser.getBrowserCommandLine')).arguments
 check(report.command.includes('--headless=new')&&report.command.includes(`--user-data-dir=${profile}`)&&report.command.includes(`--remote-debugging-port=${cdp}`),'owned native headless session')
 await send('Runtime.enable');await send('Page.enable');await send('Network.enable');await send('Emulation.setDeviceMetricsOverride',{width:1920,height:1080,deviceScaleFactor:1,mobile:false})
 if(process.argv.includes('--fallback'))await send('Page.addScriptToEvaluateOnNewDocument',{source:'Object.defineProperty(window,"Worker",{value:undefined,configurable:true});Object.defineProperty(window,"OffscreenCanvas",{value:undefined,configurable:true})'})
 if(only!=='pilot'){
  for(const level of(process.argv.includes('--fallback')||process.argv.includes('--lifecycle')?[5]:[1,5,11])){
   await send('Page.navigate',{url:base+`/verifier/worker-pipeline-app.html?level=${level}&mode=${mode}`})
   await until(()=>ev('!!window.workerApp?.ready'),'actual App')
   await until(()=>ev("!!document.querySelector('canvas[data-title-ready=true]')"),'title world')
   await ev("[...document.querySelectorAll('button')].find(b=>b.textContent.includes('继续游戏'))?.click()")
   await until(()=>ev("[...document.querySelectorAll('button')].some(b=>b.textContent.trim()==='继续')"),'save slot')
   await ev("[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='继续')?.click()")
   await until(()=>ev('!workerApp.engine.paused&&!workerApp.engine.transition&&workerApp.renderer().isNearWorldReady(workerApp.engine)&&!workerApp.renderer().getPreparationStats().distant'),'playable actual game')
   await ev("(()=>{const r=workerApp.renderer(),draw=r.render;r.render=function(...args){this.beginFrameStats();return draw.apply(this,args)}})()")
   const scene=await ev("(async()=>{const {sightWorkerStats}=await import('/src/game/world/mapSightWorker.ts');const {pbrPixelStats}=await import('/src/game/renderer/pbrPixelQueue.ts');const {hotelGeometryStats}=await import('/src/game/renderer/hotelGeometryQueue.ts');await new Promise(r=>setTimeout(r,1000));return {level:workerApp.engine.player.level,gpu:workerApp.renderer().getFrameStats(),sight:sightWorkerStats(),pbr:pbrPixelStats(),geometry:hotelGeometryStats(),explored:workerApp.engine.explored.reduce((a,b)=>a+Number(b>0),0)}})()")
   report.scenes.push(scene);check(process.argv.includes('--fallback')?!scene.sight.submitted:scene.sight.completed>0&&!scene.sight.failed,'Level '+level+' actual App sight backend');await shot('actual-'+level);persist()
   if(level===5){
    const pixels=await ev(`(async()=>{const {phonoSet,heightToNormal,normalTexture}=await import('/src/game/renderer/pbrCanvas.ts');const {phonoTextureRecipe}=await import('/src/game/renderer/phonoTextureRecipe.ts');const {pbrPixelStats}=await import('/src/game/renderer/pbrPixelQueue.ts');const rows=[];for(const recipe of [{surface:'wood',variant:'old'},{surface:'brass',variant:'new',inner:true},{surface:'record',label:'陌生又熟悉'},{surface:'felt'},{surface:'plate',variant:'new'}]){const set=phonoSet('qa-'+recipe.surface+Date.now(),recipe),d=phonoTextureRecipe(recipe);while(Object.values(set).some(t=>t?.userData?.generatedPending))await new Promise(r=>setTimeout(r,15));const paint=fn=>{const c=document.createElement('canvas');c.width=c.height=d.size;fn(c.getContext('2d'),d.size);return c};const channels={map:paint(d.color),...(d.height?{normalMap:heightToNormal(paint(d.height),d.normalStrength??2)}:{}),...(d.rough?{roughnessMap:paint(d.rough)}:{}),...(d.metal?{metalnessMap:paint(d.metal)}:{})};for(const [key,c]of Object.entries(channels)){const a=c.getContext('2d').getImageData(0,0,d.size,d.size).data,b=set[key].image.getContext('2d').getImageData(0,0,d.size,d.size).data;let diff=0,max=0;for(let i=0;i<a.length;i++){const v=Math.abs(a[i]-b[i]);if(v)diff++;max=Math.max(max,v)}rows.push({surface:recipe.surface,key,diff,max})}}return {rows,stats:pbrPixelStats()}})()`)
    report.pixels=pixels;check(pixels.rows.every(r=>r.diff===0)&&(process.argv.includes('--fallback')?pixels.stats.completed===0:pixels.stats.completed>0&&!pixels.stats.failed),'Offscreen PBR brushes and GL normals match Canvas fallback byte for byte')
    const geometry=await ev(`(async()=>{const {prepareBeastGeometry,beastGeometryReady}=await import('/src/game/renderer/beastMesh.ts');const {prepareSpokesGeometry,spokesGeometryReady}=await import('/src/game/renderer/spokesMesh.ts');const {prepareChefGeometry,chefGeometryReady}=await import('/src/game/renderer/chefMesh.ts');const {hotelGeometryStats}=await import('/src/game/renderer/hotelGeometryQueue.ts');for(const task of [prepareBeastGeometry(1),prepareSpokesGeometry(1),prepareBeastGeometry(0),prepareSpokesGeometry(0)]){let step=task.next();while(!step.done){await new Promise(r=>setTimeout(r,16));step=task.next()}}prepareChefGeometry(1);prepareChefGeometry(2);prepareChefGeometry(0);while(!chefGeometryReady(1)||!chefGeometryReady(2)||!chefGeometryReady(0))await new Promise(r=>setTimeout(r,16));return {beast:beastGeometryReady(1)&&beastGeometryReady(0),spokes:spokesGeometryReady(1)&&spokesGeometryReady(0),chef:chefGeometryReady(0)&&chefGeometryReady(1)&&chefGeometryReady(2),stats:hotelGeometryStats()}})()`)
    report.geometry=geometry;check(geometry.beast&&geometry.spokes&&geometry.chef&&(process.argv.includes('--fallback')?geometry.stats.completed===0:geometry.stats.completed>0&&!geometry.stats.failed),'Beast, greeter and chef geometry prepared in real Worker')
    const shown=await ev("(async()=>{const e=workerApp.engine,r=workerApp.renderer(),rows=[];for(const type of ['beast','greeter','chef']){const before=new Set(e.map.entities.map(x=>x.id));if(!e.devSpawnEntity(type,4))throw Error('Cannot spawn '+type);const ent=e.map.entities.find(x=>x.def.type===type&&!before.has(x.id));const start=performance.now();while((!r.entityMeshes.get(ent.id)||ent.presentationPending)&&performance.now()-start<30000)await new Promise(r=>setTimeout(r,50));const model=r.entityMeshes.get(ent.id);if(!model||ent.presentationPending)throw Error('Model not ready '+type);let finite=true,meshes=0;model.traverse(o=>{if(o.isSkinnedMesh){meshes++;o.skeleton.update();for(const n of o.skeleton.boneMatrices)if(!Number.isFinite(n))finite=false}});rows.push({type,finite,meshes});ent.hidden=true}return rows})()")
    report.models=shown;check(shown.every(x=>x.finite&&x.meshes>0),'transferred hotel models render with finite skinned animation matrices')
    const stale=await ev("(async()=>{const {Engine}=await import('/src/game/engine.ts'),{revealMapSight}=await import('/src/game/world/mapSight.ts');const e=new Engine();e.loadLevel(1,{mapSeed:71234,firstVisit:false});revealMapSight(e);e.loadLevel(7,{mapSeed:71234,firstVisit:false});e.paused=true;e.explored.fill(0);await new Promise(r=>setTimeout(r,150));return e.explored.every(x=>x===0)})()")
    check(stale,'late sight result cannot reveal a replacement map')
    if(process.argv.includes('--lifecycle')){
      const workerStats="(async()=>({sight:(await import('/src/game/world/mapSightWorker.ts')).sightWorkerStats(),pixel:(await import('/src/game/renderer/pbrPixelQueue.ts')).pbrPixelStats(),geometry:(await import('/src/game/renderer/hotelGeometryQueue.ts')).hotelGeometryStats(),resources:workerApp.renderer().getFrameStats()}))()"
      const before=await ev(workerStats)
      await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27})
      await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27})
      await until(()=>ev('workerApp.engine.paused'),'paused actual game')
      await sleep(17000)
      const idle=await ev(workerStats)
      check(!idle.sight.running&&!idle.pixel.running&&!idle.geometry.running,'idle CPU Workers release their heaps')
      await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27})
      await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27})
      await until(()=>ev('!workerApp.engine.paused'),'resume actual game')
      await until(async()=>{const s=await ev(workerStats);return s.sight.completed>idle.sight.completed},'sight Worker restart')
      const resumed=await ev(workerStats)
      report.lifecycle={before,idle,resumed}
      check(resumed.sight.running&&resumed.geometry.submitted===idle.geometry.submitted,'resume recreates sight Worker and reuses prepared geometry cache')
    }


   }
  }
 }
 if(only!=='app'){
  for(const level of[1,5,11]){
   await send('Page.navigate',{url:base+`/verifier/worker-render.html?level=${level}&mode=${mode}`})
   await until(async()=>{const v=await ev('window.renderTrial?{ready:renderTrial.ready,error:renderTrial.error,stats:renderTrial.view.stats}:null');if(v?.error)throw Object.assign(Error(v.error),{fatal:true});return v?.ready},'Offscreen Level '+level)
   check(await ev('renderTrial.view.stats.frames>0'),'Level '+level+' renders original scene in Worker');await sleep(1200);await shot('offscreen-'+level)
   const block=await ev('renderTrial.block(250)');await sleep(400)
   const state=await ev(`(()=>{const t=renderTrial;return {level:${level},stats:t.view.stats,mainFrames:t.mainFrames,diagnostics:t.view.diagnostics,withinBlock:t.events.filter(e=>e.at>=${block.start}&&e.at<=${block.end}),error:t.error}})()`)
   report.scenes.push(state);check(!state.error&&!state.diagnostics.some(d=>d.level==='error')&&state.withinBlock.length>0,'Level '+level+' continues rendering while main thread is blocked for 250 ms')
   await send('Emulation.setDeviceMetricsOverride',{width:1280,height:720,deviceScaleFactor:1,mobile:false});await until(()=>ev('!renderTrial.error&&renderTrial.view.stats.ready&&renderTrial.view.stats.width===1280&&renderTrial.view.stats.height===720'),'resized Worker framebuffer');check(await ev('!renderTrial.error&&renderTrial.view.stats.ready'),'Level '+level+' Worker resize');await shot('offscreen-'+level+'-resize')
   await send('Emulation.setDeviceMetricsOverride',{width:1920,height:1080,deviceScaleFactor:1,mobile:false})
   const crossed=await ev('renderTrial.cross()')
   await until(()=>ev('renderTrial.view.stats?.ready&&Math.abs(renderTrial.view.stats.worldX-'+crossed.worldX+')<.001&&Math.abs(renderTrial.view.stats.worldY-'+crossed.worldY+')<.001'),'cross-window world pose')
   report.scenes.push({level,crossed,afterCross:await ev('renderTrial.view.stats')})
   check(crossed.before.x!==crossed.after.x||crossed.before.y!==crossed.after.y,'Level '+level+' world pose survives a streaming-origin shift')
   await shot('offscreen-'+level+'-crossed')
   await ev('renderTrial.dispose()');persist()
  }
 }
 check(report.errors.length===0,'no uncaught page exceptions')
 check(!report.console.some(e=>e.type==='error'),'no page console errors')
 report.ok=true
}catch(error){report.ok=false;report.failure=String(error);console.error(error);try{await shot('failure');report.failureState=await ev('({text:document.body.innerText.slice(0,2400),trial:window.renderTrial?{stats:renderTrial.view.stats,error:renderTrial.error}:null})')}catch{}process.exitCode=1}
finally{
 if(ws?.readyState===1){try{await send('Browser.close')}catch{}ws.close()}
 for(const p of[browser,server])if(p?.pid&&p.exitCode===null)spawnSync('taskkill.exe',['/PID',String(p.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'})
 await sleep(600);if(existsSync(profile)&&realpathSync(profile).startsWith(realpathSync(dir)+path.sep))try{rmSync(profile,{recursive:true,force:true,maxRetries:5,retryDelay:300})}catch{}
 report.cleanup={profileRemoved:!existsSync(profile)};writeFileSync(path.join(dir,'server.log'),serverLog);persist();console.log(JSON.stringify({ok:report.ok,dir,checks:report.checks.length}));if(!report.ok)process.exitCode=1
}
