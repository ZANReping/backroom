import {mkdirSync,writeFileSync,readFileSync,existsSync,unlinkSync} from 'node:fs';
const version=process.argv[2]??'after',action=process.argv[3]??'all',base='http://127.0.0.1:3004',qaTag=process.env.QA_TAG??'';
if(qaTag&&!/^[a-z0-9-]+$/.test(qaTag))throw Error('QA_TAG must match /^[a-z0-9-]+$/');
const out=new URL(`../reports/l0-remake/${qaTag?`${qaTag}/`:''}`,import.meta.url);
mkdirSync(out,{recursive:true});
const pages=await(await fetch('http://127.0.0.1:9235/json/list')).json();
const page=pages.find(p=>p.type==='page'&&p.url.includes('l0-remake.html'));if(!page)throw Error('Open dedicated verifier tab');
const ws=new WebSocket(page.webSocketDebuggerUrl);await new Promise(r=>ws.addEventListener('open',r,{once:true}));
let id=0;const pending=new Map(),errors=[];
ws.addEventListener('message',e=>{const v=JSON.parse(e.data);if(v.method==='Runtime.exceptionThrown')errors.push(v.params.exceptionDetails);if(v.method==='Runtime.consoleAPICalled'&&v.params.type==='error')errors.push({console:v.params.args.map(a=>a.value??a.description).join(' ')});const p=pending.get(v.id);if(p){pending.delete(v.id);v.error?p.reject(v.error):p.resolve(v.result)}});
const send=(method,params={})=>new Promise((resolve,reject)=>{const n=++id;pending.set(n,{resolve,reject});ws.send(JSON.stringify({id:n,method,params}))});
const ev=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result?.value};
const save=(name,v)=>writeFileSync(new URL(name,out),JSON.stringify(v,null,2)+'\n');
const shot=async name=>{const r=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});writeFileSync(new URL(name,out),Buffer.from(r.data,'base64'))};
try{
 await send('Runtime.enable');await send('Page.enable');await send('Emulation.setDeviceMetricsOverride',{width:1920,height:1080,deviceScaleFactor:1,mobile:false});
 await send('Page.navigate',{url:base+'/verifier/l0-remake.html?'+(version==='before'?'before&':version==='baseline-v2'?'baseline=v2&':'')+'mode=realistic'});
 await send('Page.bringToFront');
 for(let i=0;i<160;i++){if(await ev('!!window.qa?.ready'))break;await new Promise(r=>setTimeout(r,250))}
 const resultFile=new URL(`${version}-performance.json`,out);
 const results=(process.env.QA_LEVEL||process.env.QA_RESUME==='1')&&action==='bench'&&existsSync(resultFile)?JSON.parse(readFileSync(resultFile,'utf8')):[];
 if(action==='anchors'){
  const dims={'yellow':[640,480],'arch':[640,480],'pillars':[500,375],'pits':[640,480],'blackout':[500,375],'red':[800,600],'red-lost':[330,280],'manila-inside':[640,480],'manila-door':[640,480],'manila-outside':[500,375],'manila-wall':[800,594],'manila-plan':[960,960]};
  const anchorFile=new URL(`${version}-anchors.json`,out);
  const anchorResults=process.env.QA_ANCHOR&&existsSync(anchorFile)?JSON.parse(readFileSync(anchorFile,'utf8')):[];
  for(const [anchor,[width,height]]of Object.entries(dims)){
   if(process.env.QA_ANCHOR&&process.env.QA_ANCHOR!==anchor)continue;
   await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});
   const pose=await ev(`qa.anchor(${JSON.stringify(anchor)})`);await ev('qa.warm()');
   const actualCamera=await ev('(()=>{const c=qa.r.camera,m=qa.eng.map,inf=m?.inf;return {fov:c.fov,aspect:c.aspect,viewport:[innerWidth,innerHeight],position:{x:c.position.x+(inf?.ox??0),y:c.position.y,z:c.position.z+(inf?.oy??0)},rotation:{x:c.rotation.x,y:c.rotation.y,z:c.rotation.z}}})()');
   if(Math.abs(actualCamera.aspect-width/height)>.0001||actualCamera.viewport[0]!==width||actualCamera.viewport[1]!==height||Math.abs(actualCamera.fov-pose.fov)>.001)throw Error('Reference camera/viewport mismatch: '+anchor);
   await ev('qa.hide()');await shot(`${version}-${anchor}-reference.png`);const row={pose,width,height,actualCamera,stats:await ev('qa.stats()')};const existing=anchorResults.findIndex(v=>v.pose?.id===pose.id);if(existing>=0)anchorResults.splice(existing,1,row);else anchorResults.push(row);console.log('anchor',anchor);
  }save(`${version}-anchors.json`,process.env.QA_ANCHOR?anchorResults:anchorResults);
 }
 if(action==='all'||action==='visual')for(const variant of ['open','arch','pillarhall','pit','blackout','red','manila']){
  await ev(`qa.scene(0,${JSON.stringify(variant)})`);await ev('qa.warm()');await ev('qa.hide()');await shot(`${version}-${variant}.png`);console.log('captured',variant);
 }
 if(action==='all'||action==='bench')for(const level of await ev('qa.levels')){
  if(process.env.QA_LEVEL&&String(level.id)!==process.env.QA_LEVEL)continue;
  if(process.env.QA_RESUME==='1'&&!process.env.QA_LEVEL&&results.some(v=>v.id===level.id))continue;
  await ev(`qa.scene(${level.id})`);let warmup;
  try{warmup=await ev('qa.warm()')}catch(error){if(!String(error).includes('Warmup timed out'))throw error;console.log('warmup timeout, recorded retry',level.id);warmup={firstTimeout:String(error),retry:await ev('qa.warm()')};save(`${version}-warmup-${level.id}.json`,warmup)}
  const build=await ev('qa.buildStats?.()');await ev('qa.hide()');await shot(`${version}-level-${level.id}.png`);const rounds=[];
  for(let n=0;n<5;n++)rounds.push(await ev('qa.sample(120)'));
  const existing=results.findIndex(v=>v.id===level.id);if(existing>=0)results.splice(existing,1,{level,...level,build,warmup,rounds});else results.push({level,...level,build,warmup,rounds});save(`${version}-performance.json`,results);console.log('measured',level.id,level.name);
 }
 if(action==='conditions')for(const condition of ['1:power-out','7:underwater','10:rain','11:rain','9:night']){
  const pose=await ev(`qa.condition(${JSON.stringify(condition)})`);await ev('qa.warm()');await ev('qa.hide()');await shot(`${version}-${condition.replace(':','-')}.png`);const rounds=[];for(let n=0;n<5;n++)rounds.push(await ev('qa.sample(120)'));results.push({condition,pose,rounds});save(`${version}-conditions.json`,results);console.log('condition',condition);
 }
 if(action==='normal'){
  for(const [seed,x,y,yaw]of [[7391,16,16,.42],[7391,29,27,-Math.PI/2],[7391,33,27,-Math.PI/2],[7391,64,46,.8],[781,-32,-16,Math.PI/2],[42561,48,31,Math.PI]]){
   const pose=await ev(`qa.normal(${seed},${x},${y},${yaw})`);if(!pose.canOccupy)throw Error('Normal camera inside wall');await ev('qa.warm()');const build=await ev('qa.buildStats()');await ev('qa.hide()');await shot(`after-normal-${seed}-${x}-${y}.png`);const rounds=[];
   for(let n=0;n<5;n++)rounds.push(await ev('qa.sample(120)'));
   results.push({pose,build,rounds});save('after-normal.json',results);console.log('normal',seed,x,y);
  }
 }
 if(action==='rtc'){save('after-rtc.json',await ev('qa.rtc()'));console.log('local RTC checks passed')}
 if(action==='photo'){await ev('qa.warm()');save('after-photo-regression.json',await ev('qa.photoRegression()'));console.log('GPU AO regression checks passed')}
 if(action==='blackout'){
  await ev(`qa.anchor('blackout')`);await ev('qa.warm()');await ev('qa.hide()');
  for(const state of ['dark','flashlight','nightvision','bright']){
   await ev(`qa.eng.player.flashlight=${state==='flashlight'};qa.eng.player.equip.head=${state==='nightvision'?"{type:'nightvision',n:1}":'null'};qa.eng.player.battery=100;qa.eng.dev.bright=${state==='bright'}`);
   await ev('qa.warm()');await shot(`after-blackout-${state}.png`);results.push({state,stats:await ev('qa.stats()')});
  }save('after-blackout.json',results);
 }
 if(action==='refinements'){
  await send('Emulation.setDeviceMetricsOverride',{width:960,height:720,deviceScaleFactor:1,mobile:false});
  const exit=await ev(`(async()=>{await qa.anchor('manila-outside');const m=qa.eng.map,a=[...m.inf.chunks.values()].find(c=>c.l0?.wood).l0,f=a.flickers[0];qa.moveTo(f.x+f.nx*2.3+f.ny*.35,f.y+f.ny*2.3-f.nx*.35);qa.eng.player.z=0;qa.look.yaw=Math.atan2(f.nx,f.ny);qa.look.pitch=-.20;qa.r.setFov(67);return f})()`);
  await ev('qa.warm()');await ev('qa.hide()');
  for(const state of ['off','on']){
   let t=0;for(;t<5;t+=.025){const v=Math.sin(t*4.900884+exit.phase)+.28*Math.sin(t*17.3+exit.phase*2.1)*Math.sin(t*6.7+exit.phase);if(state==='on'?v>.6:v<-.6)break}
   await ev(`qa.freezeRenderTime(${t});new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))`);await shot(`after-wall-exit-${state}.png`);results.push({state,time:t,exit});
  }
  const {createCanvas,loadImage}=await import('@napi-rs/canvas'),images=[];
  for(const state of ['off','on']){const img=await loadImage(readFileSync(new URL(`after-wall-exit-${state}.png`,out))),c=createCanvas(img.width,img.height),g=c.getContext('2d');g.drawImage(img,0,0);images.push(g.getImageData(0,0,img.width,img.height).data)}
  let changed=0,floorChanged=0;for(let i=0;i<images[0].length;i+=4){const d=images[1][i]+images[1][i+1]+images[1][i+2]-images[0][i]-images[0][i+1]-images[0][i+2];if(d>9){changed++;if(i/4/960>460)floorChanged++}}
  if(changed<1000||floorChanged<200)throw Error(`Exit illumination missing: ${changed}/${floorChanged}`);
  const preview=await ev(`(async()=>{const {requestDevMapPreview}=await import('/src/game/engine/devMap.ts');const e=qa.eng;e.devEnabled=true;const m=e.map,inf=m.inf,before=[m.items.length,m.entities.length,inf.chunks.size,e.explored.reduce((s,v)=>s+v,0)],rows=[];for(const [name,x,y,span]of [['live',e.player.x+inf.ox,e.player.y+inf.oy,120],['distant',4000,4000,120],['cached',4000,4000,120]]){const t=performance.now(),r=await requestDevMapPreview(e,{x,y,span,floor:0},new AbortController().signal);rows.push({name,ms:performance.now()-t,cells:r.cells.length})}return{rows,before,after:[m.items.length,m.entities.length,inf.chunks.size,e.explored.reduce((s,v)=>s+v,0)]}})()`);
  if(JSON.stringify(preview.before)!==JSON.stringify(preview.after))throw Error('Preview mutated live world');
  save('after-refinements.json',{exit:results,changedPixels:changed,floorChangedPixels:floorChanged,preview});
 }
 if(action==='details'){
  await send('Emulation.setDeviceMetricsOverride',{width:960,height:720,deviceScaleFactor:1,mobile:false});
  for(const id of ['cabinet','chair','door','lamp','vent','outlet']){
   if(process.env.QA_DETAIL&&process.env.QA_DETAIL!==id)continue;
   const pose=await ev(`qa.detail(${JSON.stringify(id)})`);await ev('qa.warm()');await ev('qa.hide()');await shot(`after-detail-${id}.png`);results.push({pose,stats:await ev('qa.stats()')});console.log('detail',id);
  }save('after-details.json',results);
 }
 if(action==='bloom'){
  await send('Emulation.setDeviceMetricsOverride',{width:960,height:720,deviceScaleFactor:1,mobile:false});
  const pose=await ev(`qa.detail('lamp')`);await ev('qa.warm()');await ev('qa.hide()');
  for(const enabled of [false,true]){
   await ev(`qa.r.setBloomFx(${enabled});new Promise(resolve=>{let n=0;function step(){if(++n===8)resolve();else requestAnimationFrame(step)}requestAnimationFrame(step)})`);
   await shot(`after-lamp-bloom-${enabled?'on':'off'}.png`);
  }
  const {createCanvas,loadImage}=await import('@napi-rs/canvas');
  const pixels=async name=>{const image=await loadImage(readFileSync(new URL(name,out))),canvas=createCanvas(image.width,image.height),ctx=canvas.getContext('2d');ctx.drawImage(image,0,0);return ctx.getImageData(0,0,image.width,image.height).data};
  const off=await pixels('after-lamp-bloom-off.png'),on=await pixels('after-lamp-bloom-on.png');let haloPixels=0,total=0,max=0;
  for(let i=0;i<off.length;i+=4){const delta=(on[i]+on[i+1]+on[i+2]-off[i]-off[i+1]-off[i+2])/3;total+=Math.max(0,delta);max=Math.max(max,delta);if(delta>1&&(off[i]+off[i+1]+off[i+2])/3<240)haloPixels++}
  if(haloPixels<100)throw Error('Fluorescent bloom is not visible outside its white core');
  save('after-bloom.json',{pose,haloPixels,meanAddedBrightness:total/(off.length/4),maxAddedBrightness:max,errors});console.log('fluorescent bloom halo pixels',haloPixels);
 }
 if(action==='presentation'){
  await send('Emulation.setDeviceMetricsOverride',{width:960,height:720,deviceScaleFactor:1,mobile:false});
  for(const [id,x,y,eye,tx,ty,h,fov]of [
   ['arch-joint',113.3,20.14,1.5,116.18,20.14,1.35,65],
   ['arch-end',113.5,30.3,1.5,116.18,29.8,1.35,65],
   ['arch-props',112.0,25.5,1.3,110.85,23.7,.55,60],
   ['red-interior',480.7,20.6,1.55,488,20.6,1.35,75],
  ]){
   await ev(`qa.scene(0);qa.moveTo(${x},${y});qa.eng.player.z=${eye}-1.55;qa.look.yaw=Math.atan2(${x}-${tx},${y}-${ty});qa.look.pitch=Math.atan2(${h}-${eye},Math.hypot(${tx}-${x},${ty}-${y}));qa.look.roll=0;qa.r.setFov(${fov},35)`);
   for(const mode of ['realistic','classic']){await ev(`qa.mode('${mode}');qa.warm()`);await ev('qa.hide()');await shot(`after-${id}-${mode}.png`)}
   results.push({id,x,y,eye,tx,ty,h,fov,stats:await ev('qa.stats()')});console.log('presentation',id);
  }save('after-presentation.json',results);
 }
 if(action==='chair-poses'){
  await send('Emulation.setDeviceMetricsOverride',{width:640,height:480,deviceScaleFactor:1,mobile:false});
  for(const anchor of ['manila-inside','manila-door']){
   await ev(`qa.anchor('${anchor}');qa.warm()`);await ev('qa.warm()');await ev('qa.hide()');
   for(const deg of [60,80,100,120,140]){
    await ev(`(async()=>{const {buildL0Furniture}=await import('/src/game/renderer/l0Furniture.ts');for(const [s,g]of qa.r.structMeshes)if(s.data?.fallen){const n=buildL0Furniture({...s,data:{...s.data,deg:${deg},roll:-90}});g.quaternion.copy(n.quaternion);g.position.y=n.position.y;g.updateMatrix();g.updateMatrixWorld(true);n.traverse(o=>{o.geometry?.dispose();o.material?.dispose()})}await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))})()`);
    await shot(`chair-pose-reverse-${anchor}-${deg}.png`);
   }
  }
 }
 if(action==='focus'){
  await send('Emulation.setDeviceMetricsOverride',{width:660,height:560,deviceScaleFactor:1,mobile:false});
  for(const mode of ['realistic','classic'])for(const [state,sanity,red]of [['clear',100,0],['low-sanity',0,0],['red-transition',100,1],['combined',0,1]]){
   await ev(`qa.anchor('red-lost');qa.mode(${JSON.stringify(mode)})`);await ev('qa.warm()');
   await ev(`qa.eng.player.sanity=${sanity};qa.eng.l0Blur=${red};qa.hide()`);await ev('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');
   await shot(`after-focus-${mode}-${state}.png`);results.push({mode,state,sanity,red,blur:await ev('qa.r.photoFinish.uniforms.blur.value'),stats:await ev('qa.stats()')});console.log('focus',mode,state);
  }save('after-focus.json',results);
 }
 if(action==='regions')for(const region of ['yellow','arch','pillars','pits','blackout','red','manila-inside','sealed-red']){
  if(region==='sealed-red')await ev('qa.red()');else await ev(`qa.anchor(${JSON.stringify(region)})`);
  await ev('qa.warm()');await ev('qa.hide()');await shot(`after-region-${region}.png`);const rounds=[];
  for(let n=0;n<5;n++)rounds.push(await ev('qa.sample(120)'));
  results.push({region,rounds});save('after-regions.json',results);console.log('region',region);
 }
 if(action==='functional'){save('after-functional.json',await ev('qa.functional()'));console.log('production runtime checks passed')}
 if(action==='map-preview'){save('after-map-preview.json',await ev('qa.mapPreview()'));console.log('distant map preview and teleport rollback checks passed')}
 if(action==='views')for(const anchor of ['yellow','arch','pillars','pits','blackout','red','manila-inside']){
  await ev(`qa.anchor(${JSON.stringify(anchor)});qa.mode('classic')`);await ev('qa.warm()');await ev('qa.hide()');await shot(`after-${anchor}-classic.png`);
  await ev(`qa.mode('realistic');qa.eng.player.flashlight=true;qa.look.yaw+=Math.PI`);await ev('qa.warm()');await shot(`after-${anchor}-back-flashlight.png`);console.log('views',anchor);
 }
 if(action==='lifecycle'){
  await ev('qa.anchor("yellow")');await ev('qa.warm()');
  for(let round=0;round<5;round++){
   for(const [x,y]of [[110,28],[205,27],[594,16],[13.5,25.7]]){await ev(`qa.moveTo(${x},${y})`);await ev('qa.warm()')}
   await ev('qa.mode("classic");qa.r.setTextureQuality(0)');await ev('qa.warm()');await ev('qa.mode("realistic");qa.r.setTextureQuality(2)');await ev('qa.warm()');results.push({round,stats:await ev('qa.stats()')});save('after-lifecycle.json',results);console.log('lifecycle',round);
  }
 }
 save(`${version}-${action}-errors.json`,errors);
 if(errors.length)throw Error(`${errors.length} browser errors during ${action}`);
 const failure=new URL(`${version}-${action}-failure.json`,out);if(existsSync(failure))unlinkSync(failure);
}catch(error){save(`${version}-${action}-failure.json`,{error:String(error),errors});throw error}finally{ws.close()}
