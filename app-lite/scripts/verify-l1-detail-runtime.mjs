// Isolated true-headless Chrome; only this script's process/profile/port is owned.
// Usage: node scripts/verify-l1-detail-runtime.mjs [capture|classic|detail|runtime|power|performance|resources|all]
import {spawn} from 'node:child_process'
import {mkdirSync,writeFileSync} from 'node:fs'
import {fileURLToPath} from 'node:url'
import {relative,resolve} from 'node:path'
const app=fileURLToPath(new URL('../',import.meta.url)),stage=process.argv[2]??'all'
const base=process.env.L1_QA_URL??'http://127.0.0.1:3009',port=Number(process.env.L1_QA_CDP??9249)
const reportsRoot=resolve(app,'reports/l1-remake'),configuredOut=process.env.L1_QA_REPORT??'iteration-4/current',out=resolve(reportsRoot,configuredOut)
const outRelative=relative(reportsRoot,out);if(outRelative.startsWith('..')||outRelative.includes(':'))throw Error('L1_QA_REPORT must stay inside app/reports/l1-remake')
const profile=resolve(app,`.cache/l1-qa-chrome-${port}`),qaAnchors=process.env.L1_QA_ANCHORS?.split(',').map(v=>v.trim()).filter(Boolean)??null
const chrome=process.env.L1_QA_CHROME??'C:/Program Files/Google/Chrome/Application/chrome.exe'
mkdirSync(out,{recursive:true});mkdirSync(profile,{recursive:true})
const wait=ms=>new Promise(r=>setTimeout(r,ms)),save=(file,value)=>writeFileSync(resolve(out,file),JSON.stringify(value,null,2)+'\n')
try{await fetch(`http://127.0.0.1:${port}/json/version`);throw Error(`Port ${port} already belongs to a browser; refusing to attach`)}catch(e){if(!String(e).includes('fetch failed'))throw e}
const args=['--headless=new','--enable-automation',`--remote-debugging-port=${port}`,'--remote-debugging-address=127.0.0.1',`--user-data-dir=${profile}`,'--no-first-run','--no-default-browser-check','--disable-background-timer-throttling','--disable-renderer-backgrounding','--disable-backgrounding-occluded-windows','--window-size=1920,1080','about:blank']
const child=spawn(chrome,args,{windowsHide:true,stdio:['ignore','ignore','pipe']})
const errors=[],consoleMessages=[],networkErrors=[];let stderr='',ws,bws,sequence=0
child.stderr.on('data',s=>{stderr+=String(s)});child.on('error',e=>errors.push({launch:String(e)}))
const connect=async url=>{const w=new WebSocket(url);await new Promise((res,rej)=>{w.addEventListener('open',res,{once:true});w.addEventListener('error',rej,{once:true})});return w}
const one=async(w,method,params={},timeoutMs=150000)=>{if(w.readyState!==WebSocket.OPEN)throw Error('Owned QA browser closed');const id=++sequence;return new Promise((res,rej)=>{const clean=()=>{clearTimeout(timer);w.removeEventListener('message',listener);w.removeEventListener('close',closed)},closed=()=>{clean();rej(Error('Owned QA browser closed during '+method))},timer=setTimeout(()=>{clean();rej(Error(method+' timed out'))},timeoutMs),listener=e=>{const d=JSON.parse(e.data);if(d.id===id){clean();d.error?rej(Error(JSON.stringify(d.error))):res(d.result)}};w.addEventListener('message',listener);w.addEventListener('close',closed);w.send(JSON.stringify({id,method,params}))})}
const ev=async (expression,timeoutMs=150000)=>{const r=await one(ws,'Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true},timeoutMs);if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result?.value}
const run=fn=>ev(`(${fn})()`)
async function shot(dir,id,w=1280,h=720){mkdirSync(resolve(out,dir),{recursive:true});const url=await ev(`qa.captureFrame(${w},${h})`);writeFileSync(resolve(out,dir,id+'.png'),Buffer.from(url.split(',')[1],'base64'))}
async function show(id){return ev(`(async()=>{const a=(await import('/src/game/world/l1Spatial.ts')).L1_PHOTO_ANCHORS.find(a=>a.id===${JSON.stringify(id)});await qa.scene(1);qa.moveTo(a.x,a.y);qa.eng.player.z=a.z;Object.assign(qa.look,{yaw:a.yaw,pitch:a.pitch,roll:a.roll});qa.r.setFov(a.fov,35);qa.freezeRenderTime(15);if(a.blackout){qa.eng.blackoutPendingDur=60;qa.eng.applyBlackout()}await qa.warm();return a})()`)}
async function classic(){
 const defaults=['parking-common','storage','garden','gothic','path-room'],cameras=await ev("import('/src/game/world/l1Spatial.ts').then(m=>m.L1_PHOTO_ANCHORS)")
 if(qaAnchors?.some(id=>!cameras.some(a=>a.id===id)))throw Error('Unknown L1_QA_ANCHORS id')
 const ids=qaAnchors??defaults
 try{
  await ev("qa.mode('classic')")
  for(const id of ids){await show(id);await shot('classic',id);console.log('classic',id)}
 }finally{await ev("qa.mode('realistic')")}
}
async function capture(full=true){
 const cameras=await ev("import('/src/game/world/l1Spatial.ts').then(m=>m.L1_PHOTO_ANCHORS)");save('cameras.json',cameras)
 if(qaAnchors?.some(id=>!cameras.some(a=>a.id===id)))throw Error('Unknown L1_QA_ANCHORS id')
 const actualCameras=[]
 for(const a of cameras.filter(a=>!qaAnchors||qaAnchors.includes(a.id))){
  await show(a.id);const s=Math.min(1,1920/a.width,1920/a.height);await shot('reference',a.id,Math.round(a.width*s),Math.round(a.height*s))
  actualCameras.push(await ev(`({id:${JSON.stringify(a.id)},...qa.lastCapturePose})`))
  save('actual-cameras.json',actualCameras);console.log('capture',a.id)
 }
 if(!full)return
 const normal=[]
 for(const seed of [1,42,7391])for(const [x,y,yaw]of [[30.5,24.5,.7],[34.5,24.5,Math.PI+.7]]){
  const pose=await ev(`(async()=>{await qa.scene(1,'open',${seed});qa.moveTo(${x},${y});(await import('/src/game/engine/level.ts')).restoreSavedPlayerPosition(qa.eng,{x:${x},y:${y}});Object.assign(qa.look,{yaw:${yaw},pitch:.025,roll:0});qa.r.setFov(72);qa.freezeRenderTime(15);await qa.warm();return{seed:${seed},x:qa.eng.player.x+qa.eng.map.inf.ox,y:qa.eng.player.y+qa.eng.map.inf.oy,yaw:${yaw},pitch:.025,fov:72}})()`)
  pose.id=`seed-${seed}-${x}`;normal.push(pose);await shot('normal',pose.id);console.log('capture',pose.id)
 }
 save('normal-cameras.json',normal)
 await classic()
}
async function runtime(){const result=await ev("import('/verifier/l1-remake-runtime.ts').then(m=>m.verifyL1Runtime(qa))");save('runtime.json',result);console.log('runtime',JSON.stringify(result))}
async function partitions(){const result=await ev("import('/verifier/l1-partitions-runtime.ts').then(m=>m.verifyL1Partitions(qa))");mkdirSync(resolve(out,'partitions'),{recursive:true});for(const [name,data]of Object.entries(result.images)){writeFileSync(resolve(out,'partitions',name+'.png'),Buffer.from(data.split(',')[1],'base64'));result.images[name]='partitions/'+name+'.png'}save('partitions.json',result);console.log('partitions',JSON.stringify(result.checks))}
async function shaderAB(){
 const cameras=await ev("import('/src/game/world/l1Spatial.ts').then(m=>m.L1_PHOTO_ANCHORS)"),records=[]
 for(const id of qaAnchors??['parking-round','gothic','crate']){
  const a=cameras.find(a=>a.id===id);if(!a)throw Error('Unknown shader A/B anchor')
  await show(id)
  // Both variants use the same live scene, including the same pickup phases.
  // Only substitute the original zero-contribution evaluation for the branch.
  const count=await ev(`(()=>{const entries=[];qa.r.scene.traverse(o=>{for(const m of [o.material].flat().filter(Boolean))if(m.userData.l1Baked&&!entries.some(e=>e.m===m))entries.push({m,compile:m.onBeforeCompile,key:m.customProgramCacheKey})});qa.shaderABEntries=entries;for(const e of entries){e.m.onBeforeCompile=function(s,r){e.compile.call(this,s,r);const open='if ( l1BakedMask[i] < .5 ) {\\npointLight = pointLights[ i ];',direct='RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );';if(s.fragmentShader.includes(open))s.fragmentShader=s.fragmentShader.replace(open,'pointLight = pointLights[ i ];').replace(direct+'\\n}','directLight.color *= 1. - l1BakedMask[i];\\n'+direct)};e.m.customProgramCacheKey=()=>e.key()+'|qa-evaluate-native';e.m.needsUpdate=true}return entries.length})()`)
  if(!count)throw Error('No baked shader materials')
  const scale=Math.min(1,1920/a.width,1920/a.height),w=Math.round(a.width*scale),h=Math.round(a.height*scale)
  await ev('qa.warm()');await shot('shader-baseline',id,w,h)
  const before=await ev('qa.lastCapturePose')
  await ev('for(const e of qa.shaderABEntries){e.m.onBeforeCompile=e.compile;e.m.customProgramCacheKey=e.key;e.m.needsUpdate=true}qa.shaderABEntries=[];qa.warm()')
  await shot('shader-optimized',id,w,h)
  records.push({id,count,before,after:await ev('qa.lastCapturePose')});save('shader-ab.json',records);console.log('shader-ab',id,count)
 }
}
async function v4(){const result=await ev("import('/verifier/l1-v4-runtime.ts').then(m=>m.verifyL1V4(qa))"),images=result.images??{};mkdirSync(resolve(out,'v4'),{recursive:true});for(const [name,data] of Object.entries(images)){if(typeof data==='string'&&data.startsWith('data:image/png;base64,')){writeFileSync(resolve(out,'v4',name+'.png'),Buffer.from(data.slice('data:image/png;base64,'.length),'base64'));images[name]='v4/'+name+'.png'}}result.images=images;save('v4-runtime.json',result);console.log('v4',JSON.stringify(result))}
async function movement(){const result=await ev("import('/verifier/l1-v4-runtime.ts').then(m=>m.verifyL1Movement(qa))",360000);save('movement.json',result);console.log('movement',JSON.stringify({median:result.median,p95:result.p95,max:result.max,moveElapsed:result.moveElapsed,end:result.end.memory}))}
async function portals(){const result=await ev("import('/verifier/l1-portals-runtime.ts').then(m=>m.verifyL1Portals(qa))");mkdirSync(resolve(out,'portals'),{recursive:true});for(const [name,data]of Object.entries(result.images)){writeFileSync(resolve(out,'portals',name+'.png'),Buffer.from(data.split(',')[1],'base64'));result.images[name]='portals/'+name+'.png'}save('portals.json',result);console.log('portals',JSON.stringify(result))}
async function cache(){const result=await ev("import('/verifier/l1-bake-cache-runtime.ts').then(m=>m.verifyL1BakeTransport(qa))");save('bake-transport.json',result);console.log('cache',JSON.stringify(result))}
async function crossLevel(){const result=await ev("import('/verifier/l1-v4-cross-level.ts').then(m=>m.verifyL1CrossLevel(qa))");mkdirSync(resolve(out,'cross-level'),{recursive:true});for(const [name,data] of Object.entries(result.images)){writeFileSync(resolve(out,'cross-level',name+'.png'),Buffer.from(data.split(',')[1],'base64'));result.images[name]='cross-level/'+name+'.png'}save('cross-level.json',result);console.log('cross-level',result.records.length)}
async function detail(){
 const boundary=await run(async()=>{const m=await import('/src/game/world/l1Layout.ts');for(let cy=-24;cy<=24;cy++)for(let cx=-24;cx<=24;cx++){const t=m.l1Transition(7391,cx,cy);if(t&&t.a!==t.b&&[t.a,t.b].includes('storage')&&![t.a,t.b].includes('maintenance'))return{...t,x:cx*32+16,y:cy*32+16,seed:7391}}throw Error('No transition found')})
 const poses=[];await ev('qa.scene(1,"open",7391)')
 for(const offset of [-8,0,8]){
  const x=boundary.x+(boundary.axis==='x'?offset:0),y=boundary.y+(boundary.axis==='y'?offset:0)
  const pose=await ev(`(async()=>{qa.moveTo(${x},${y});const{restoreSavedPlayerPosition}=await import('/src/game/engine/level.ts');restoreSavedPlayerPosition(qa.eng,{x:${x},y:${y}});Object.assign(qa.look,{yaw:${boundary.axis==='x'?-Math.PI/2:Math.PI},pitch:-.23,roll:0});qa.r.setFov(78);qa.freezeRenderTime(15);await qa.warm();return{x:qa.eng.player.x+qa.eng.map.inf.ox,y:qa.eng.player.y+qa.eng.map.inf.oy,yaw:qa.look.yaw,pitch:qa.look.pitch,fov:78}})()`)
  pose.id='transition-'+offset;poses.push(pose);await shot('detail',pose.id,1600,900);console.log('detail',pose.id)
 }
 save('detail-cameras.json',{boundary,poses})
}
async function power(){
 await show('garden');await ev('qa.r.setEyeAdaptation(true)');const rows=[]
 async function record(name){const row=await run(()=>({exposure:qa.r.eyeAdaptation.exposure,target:qa.r.eyeAdaptation.target,glare:qa.r.eyeAdaptation.glare,shafts:qa.r.l1Shafts.mesh.visible?qa.r.l1Shafts.mesh.count:0,groups:[...qa.r.chunkGroups].map(([k,v])=>[k,v.group.id])}));row.name=name;rows.push(row);await shot('power',name);save('power.json',rows);console.log('power',name,row.exposure,row.shafts)}
 await ev('qa.freezeRenderTime(16)');await wait(1200);await record('native-on')
 await ev('qa.eng.blackoutWarnT=2;qa.freezeRenderTime(17)');await wait(500);await record('warning');await ev('qa.eng.blackoutWarnT=0;qa.eng.blackoutPendingDur=60;qa.eng.applyBlackout();qa.freezeRenderTime(18)');await wait(200);await record('blackout-200ms');await wait(3800);await record('blackout-4s')
 await ev('qa.eng.endBlackout();qa.freezeRenderTime(23)');await wait(100);await record('restored-100ms');await wait(1000);await record('restored-1100ms')
 const checks={nativeShafts:rows[0].shafts>0,blackoutNoShafts:rows[2].shafts===0&&rows[3].shafts===0,restoreShafts:rows[4].shafts>0,exposureBound:rows.every(r=>r.exposure<=1.350001),warningHeld:Math.abs(rows[1].exposure-rows[0].exposure)<.001,chunkIdentity:rows.every(r=>JSON.stringify(r.groups)===JSON.stringify(rows[0].groups))};save('power-checks.json',checks);if(Object.values(checks).some(v=>!v))throw Error('Power checks: '+JSON.stringify(checks))
}
async function performance(){const rows=[],defaults=['parking-common','storage','gothic','ouroboros','garden','path-corridor'],cameras=await ev("import('/src/game/world/l1Spatial.ts').then(m=>m.L1_PHOTO_ANCHORS)");if(qaAnchors?.some(id=>!cameras.some(a=>a.id===id)))throw Error('Unknown L1_QA_ANCHORS id');const ids=qaAnchors??defaults;for(const id of ids){const camera=await show(id),rounds=[];for(let i=0;i<5;i++){rounds.push(await ev('qa.sample(120)'));console.log('performance',id,i+1,rounds.at(-1).median,rounds.at(-1).p95)}const extra=await ev(`(async()=>({actual:qa.eng.map.inf.chunks.get('${Math.floor(camera.x/32)},${Math.floor(camera.y/32)}')?.variant,build:qa.buildStats(),bake:await import('/src/game/renderer/l1BakeQueue.ts').then(m=>m.l1BakeStats()),mainStages:await import('/src/game/renderer/l1BuildMetrics.ts').then(m=>m.l1BuildMetrics()),viewport:[innerWidth,innerHeight],renderSize:[qa.r.three.domElement.width,qa.r.three.domElement.height]}))()`);if(extra.actual!==camera.variant)throw Error('Wrong performance region');rows.push({variant:camera.variant,anchor:id,camera,...extra,rounds});save('regions-performance.json',rows)}}
async function resources(){const cameras=await ev("import('/src/game/world/l1Spatial.ts').then(m=>m.L1_PHOTO_ANCHORS)"),ids=qaAnchors??['garden','storage','gothic','parking-common'];if(ids.some(id=>!cameras.some(a=>a.id===id)))throw Error('Unknown L1_QA_ANCHORS id');const rows=[];for(let i=0;i<4;i++){for(const id of ids)await show(id);await ev("qa.mode('classic');qa.warm()");await ev("qa.mode('realistic');qa.warm()");rows.push(await ev("(async()=>({...qa.stats(),portals:(await import('/src/game/renderer/l1PortalLighting.ts')).l1PortalLightingStats()}))()"));save('resources.json',{anchors:ids,resources:rows});console.log('resources',i+1,rows.at(-1).memory,rows.at(-1).programs)}}
async function profileWork(){
 await one(ws,'Profiler.enable');await one(ws,'Profiler.setSamplingInterval',{interval:1000})
 await ev("window.l1LongTasks=[];window.l1LongObserver=new PerformanceObserver(list=>l1LongTasks.push(...list.getEntries().map(e=>({start:e.startTime,duration:e.duration,name:e.name}))));l1LongObserver.observe({type:'longtask',buffered:false})")
 await one(ws,'Profiler.start')
 try{await show('ouroboros');await movement()}finally{
  const {profile}=await one(ws,'Profiler.stop');save('cpu-profile.json',profile)
  const nodes=new Map(profile.nodes.map(n=>[n.id,n])),self=new Map(),inclusive=new Map(),parents=new Map()
  for(const n of profile.nodes)for(const c of n.children??[])parents.set(c,n.id)
  for(let i=0;i<(profile.samples?.length??0);i++){let id=profile.samples[i],dt=(profile.timeDeltas?.[i]??1000)/1000;self.set(id,(self.get(id)??0)+dt);while(id){inclusive.set(id,(inclusive.get(id)??0)+dt);id=parents.get(id)}}
  const rows=profile.nodes.map(n=>({name:n.callFrame.functionName,url:n.callFrame.url,line:n.callFrame.lineNumber+1,selfMs:self.get(n.id)??0,totalMs:inclusive.get(n.id)??0})).sort((a,b)=>b.totalMs-a.totalMs)
  save('cpu-summary.json',rows.slice(0,250));save('long-tasks.json',await ev('l1LongObserver.disconnect();l1LongTasks'))
  console.log('profile',JSON.stringify(rows.filter(n=>n.url.includes('/src/')).slice(0,16)))
 }
}
try{
 let version;for(let i=0;i<80;i++){try{version=await(await fetch(`http://127.0.0.1:${port}/json/version`)).json();break}catch{await wait(250)}}if(!version)throw Error('Headless Chrome failed to start')
 bws=await connect(version.webSocketDebuggerUrl);const launch=await one(bws,'Browser.getBrowserCommandLine');if(!launch.arguments.includes('--headless=new')||!launch.arguments.includes(`--user-data-dir=${profile}`))throw Error('Browser ownership/headless assertion failed')
 const pages=await(await fetch(`http://127.0.0.1:${port}/json/list`)).json(),page=pages.find(p=>p.type==='page'&&p.url==='about:blank');if(!page)throw Error('No owned blank target')
 ws=await connect(page.webSocketDebuggerUrl);ws.addEventListener('message',e=>{const v=JSON.parse(e.data);if(v.method==='Runtime.exceptionThrown')errors.push(v.params.exceptionDetails);if(v.method==='Runtime.consoleAPICalled'&&['error','warning'].includes(v.params.type))consoleMessages.push(v.params);if(v.method==='Network.loadingFailed')networkErrors.push(v.params)})
 await one(ws,'Page.enable');await one(ws,'Runtime.enable');await one(ws,'Network.enable');await one(ws,'Emulation.setDeviceMetricsOverride',{width:1920,height:1080,deviceScaleFactor:1,mobile:false});await one(ws,'Page.navigate',{url:base+'/verifier/l0-remake.html?level=1'})
 for(let i=0;i<600;i++){if(await ev("window.qa?.ready&&document.querySelector('#status')?.textContent.includes('取景已就绪')"))break;if(i===599)throw Error('Initial verifier timeout');await wait(250)}
 save('environment-'+stage+'.json',{at:new Date().toISOString(),stage,base,port,pid:child.pid,profile,version,launch:launch.arguments,stats:await ev('qa.stats()')})
 if(stage==='all'||stage==='runtime')await runtime()
 if(stage==='v4')await v4()
 if(stage==='partitions')await partitions()
 if(stage==='shader-ab')await shaderAB()
 if(stage==='water-inspect'){
  await show('parking-common');await shot('water','original',800,600)
  const result=await ev(`(async()=>{const m=qa.r.l1Water.mirror;if(!m)return{missing:true};const T=await import('/node_modules/three/build/three.module.js'),target=m.getRenderTarget(),pixels=new Uint16Array(target.width*target.height*4);qa.r.three.readRenderTargetPixels(target,0,0,target.width,target.height,pixels);const c=document.createElement('canvas');c.width=target.width;c.height=target.height;const g=c.getContext('2d'),im=g.createImageData(c.width,c.height);let max=0,bright=0;for(let i=0;i<pixels.length;i+=4){const x=i/4%c.width,y=Math.floor(i/4/c.width),dst=((c.height-1-y)*c.width+x)*4;for(let k=0;k<3;k++){const v=T.DataUtils.fromHalfFloat(pixels[i+k]);max=Math.max(max,v);im.data[dst+k]=Math.round(255*Math.pow(Math.min(1,Math.max(0,v)),1/2.2))}im.data[dst+3]=255;if(T.DataUtils.fromHalfFloat(pixels[i])>1)bright++}g.putImageData(im,0,0);return{visible:m.visible,vertices:m.geometry.getAttribute('position').count,color:m.material.uniforms.color.value.toArray(),strength:m.material.uniforms.strength.value,projection:m.material.uniforms.textureMatrix.value.toArray(),target:{width:c.width,height:c.height,max,bright},image:c.toDataURL('image/png')}})()`)
  if(result.image){writeFileSync(resolve(out,'water/reflection-target.png'),Buffer.from(result.image.split(',')[1],'base64'));result.image='water/reflection-target.png'}save('water-inspect.json',result)
  await ev('qa.r.l1Water.last=-Infinity');await shot('water','forced-current-camera',800,600)
  const projections=await ev(`(()=>{const rows=[],originalFov=qa.r.camera.fov;for(const [w,h,fov]of [[800,600,originalFov],[1280,720,70],[600,800,55],[800,600,originalFov]]){qa.r.setFov(fov,35);qa.captureFrame(w,h);const m=qa.r.l1Water.mirror,p=m.getReflectionCamera(qa.r.camera).projectionMatrix.elements,actual=p[5]/p[0],focal=1/Math.tan(fov*Math.PI/360);rows.push({viewport:[w,h],fov,expected:w/h,actual,focal:p[5],passed:Math.abs(actual-w/h)<1e-6&&Math.abs(p[5]-focal)<1e-6})}return rows})()`)
  save('water-projection.json',projections);if(projections.some(r=>!r.passed))throw Error('Reflection camera did not follow reference aspect on the same frame')
 }
 if(stage==='portals')await portals()
 if(stage==='movement')await movement()
 if(stage==='profile')await profileWork()
 if(stage==='cross-level')await crossLevel()
 if(stage==='cache')await cache()
 if(stage==='refinement'){await runtime();await v4();await cache();await performance()}
 if(stage==='reference')await capture(false)
 if(stage==='photo-inspect'){
  await show('path-room')
  save('photo-inspect.json',await ev(`(async()=>{const T=await import('/node_modules/three/build/three.module.js'),ray=new T.Raycaster();ray.setFromCamera(new T.Vector2(.18,-.83),qa.r.camera);return{camera:qa.r.camera.position.toArray(),origin:[qa.eng.map.inf.ox,qa.eng.map.inf.oy],items:qa.eng.map.items.filter(i=>Math.hypot(i.x-qa.eng.player.x,i.y-qa.eng.player.y)<8),hits:ray.intersectObjects(qa.r.scene.children,true).slice(0,8).map(h=>({point:h.point.toArray(),parents:(()=>{let p=h.object,a=[];while(p){a.push({name:p.name,uuid:p.uuid,userData:p.userData.type??p.userData.itemId});p=p.parent}return a})()}))}})()`))
 }
 if(stage==='classic')await classic()
 if(stage==='all'||stage==='capture')await capture()
 if(stage==='all'||stage==='detail')await detail()
 if(stage==='all'||stage==='power')await power()
 if(stage==='all'||stage==='performance')await performance()
 if(stage==='all'||stage==='resources')await resources()
 if(errors.length||consoleMessages.some(v=>v.type==='error'))throw Error('Browser runtime/console errors: see saved log')
 save('result-'+stage+'.json',{passed:true,at:new Date().toISOString(),errors:errors.length,consoleErrors:consoleMessages.filter(v=>v.type==='error').length});console.log('PASS',stage)
}catch(e){save('failure-'+stage+'.json',{error:String(e),pending:ws?await ev('qa?.pendingWork?.()').catch(()=>null):null,stats:ws?await ev('qa?.stats?.()').catch(()=>null):null,bake:ws?await ev("import('/src/game/renderer/l1BakeQueue.ts').then(m=>m.l1BakeStats())").catch(()=>null):null,mainStages:ws?await ev("import('/src/game/renderer/l1BuildMetrics.ts').then(m=>m.l1BuildMetrics())").catch(()=>null):null});console.error(e);process.exitCode=1}
finally{save('console-'+stage+'.json',{errors,consoleMessages,networkErrors,stderr});if(ws)ws.close();if(bws){await one(bws,'Browser.close').catch(()=>{});bws.close()}if(child.exitCode===null)child.kill()}
