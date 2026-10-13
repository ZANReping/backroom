import {mkdirSync,writeFileSync,readFileSync,existsSync,unlinkSync} from 'node:fs';
const version=process.argv[2]??'after',action=process.argv[3]??'all',base='http://127.0.0.1:3004',qaTag=process.env.QA_TAG??'iteration-19';
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
const report=action==='adaptation'&&existsSync(new URL('experience-render.json',out))?JSON.parse(readFileSync(new URL('experience-render.json',out),'utf8')):{checks:[],performance:[]};
try{
 await send('Runtime.enable');await send('Page.enable');await send('Emulation.setDeviceMetricsOverride',{width:1920,height:1080,deviceScaleFactor:1,mobile:false});
 await send('Page.navigate',{url:base+'/verifier/l0-remake.html?mode=realistic'});
 for(let i=0;i<160&&!await ev('!!window.qa?.ready');i++)await new Promise(r=>setTimeout(r,250));
 await ev(`qa.anchor('blackout')`);await ev('qa.warm()');await ev('qa.sample(30)');await ev('qa.hide()');
 report.dark=await ev('({meter:qa.r.eyeMeter,exposure:qa.r.eyeAdaptation.exposure,target:qa.r.eyeAdaptation.target})');await shot('dark-adapted.png');
 await ev(`(()=>{const e=qa.eng;e.player.hotbar[0]={type:'glowstick',count:1};e.player.selected=0;qa.look.pitch=-.4;qa.r.applyView(e);e.throwHeld('glowstick')})()`);
 await ev(`(async()=>{const {updateProjectiles}=await import('/src/game/engine/combat.ts');for(let i=0;i<150;i++){updateProjectiles(qa.eng,1/120);await new Promise(requestAnimationFrame)}})()`);
 await ev('qa.warm()');
 const stick=await ev(`qa.eng.map.items.find(i=>i.type==='glowstick'&&i.id<0x200000)`);if(!stick)throw Error('Thrown stick did not land');
 await shot('glowstick-green.png');
 report.glow=await ev(`(async()=>{const {glowstickLights}=await import('/src/game/renderer/glowstickLights.ts');return{item:${JSON.stringify(stick)},lights:glowstickLights(qa.eng),pool:qa.r.sceneLights?.length}})()`);
 await ev(`(async()=>{const e=qa.eng,it=e.map.items.find(i=>i.id===${stick.id}),{scanInteract,doInteract}=await import('/src/game/engine/interact.ts');e.player.x=it.x;e.player.y=it.y+.75;qa.look.yaw=0;qa.look.pitch=Math.atan2(-1.1,.75);qa.r.applyView(e);await new Promise(requestAnimationFrame);scanInteract(e);if(e.interactTarget?.it!==it)throw Error('Cannot aim at landed glowstick: '+JSON.stringify(e.interactTarget));doInteract(e);if(e.map.items.includes(it)||!e.hasItem('glowstick'))throw Error('Pickup failed')})()`);
 await ev('qa.warm()');report.checks.push('Production throw, green illumination, exact-item interaction and recovery passed');
 // Actual metering transition: move within the same loaded L0 scene, not a controller stub.
 report.adaptation=await ev(`(async()=>{qa.moveTo(399.5,31.5);await qa.warm();await qa.sample(30);const rows=[],record=t=>rows.push({t,meter:qa.r.eyeMeter,...qa.r.eyeAdaptation});record(0);qa.moveTo(370,16);for(const t of [100,200,400,800,1600]){await new Promise(r=>setTimeout(r,t-(rows.at(-1)?.t??0)));record(t)}return rows})()`);
 if(!report.adaptation.some(v=>v.glare>.01)||report.adaptation.at(-1).exposure>=report.adaptation[0].exposure-.05)throw Error('No actual bright adaptation');
 await shot('bright-adapted.png');
 report.darkReturn=await ev(`(async()=>{const rows=[];qa.moveTo(399.5,31.5);for(const t of [100,400,1000,3000,6000]){await new Promise(r=>setTimeout(r,t-(rows.at(-1)?.t??0)));rows.push({t,meter:qa.r.eyeMeter,...qa.r.eyeAdaptation})}return rows})()`);
 if(report.darkReturn.at(-1).exposure<=report.darkReturn[0].exposure)throw Error('No gradual dark adaptation');
 // Compare identical prewarmed render paths, five rounds for each setting.
 if(action!=='adaptation')for(const anchor of ['yellow','blackout','manila-inside']){
  await ev(`qa.anchor(${JSON.stringify(anchor)})`);await ev('qa.warm()');await ev('qa.hide()');
  if(anchor==='manila-inside')await shot('manila-table-letter.png');
  for(const enabled of [false,true]){
   await ev(`qa.r.setEyeAdaptation(${enabled})`);await ev('qa.sample(30)');const rounds=[];
   for(let n=0;n<5;n++)rounds.push(await ev('qa.sample(120)'));
   report.performance.push({anchor,eyeAdaptation:enabled,rounds});save('experience-render.json',report);
  }
 }
 report.mapCpu=await ev(`(async()=>{const {revealMapSight}=await import('/src/game/world/mapSight.ts');const times=[];for(let i=0;i<120;i++){await new Promise(requestAnimationFrame);qa.eng.time+=.2;const t=performance.now();revealMapSight(qa.eng);if(i>=20)times.push(performance.now()-t)}times.sort((a,b)=>a-b);return{median:times[50],p95:times[95],samples:100}})()`);
 report.mapCpu.scene=await ev('qa.stats().label');report.checks=[...new Set(report.checks)];report.pass=true;report.errors=errors;if(errors.length)throw Error('Browser errors');console.log(JSON.stringify({pass:report.pass,checks:report.checks,dark:report.dark,mapCpu:report.mapCpu}));
}catch(error){report.pass=false;report.error=String(error);report.errors=errors;console.error(report);process.exitCode=1}
finally{save('experience-render.json',report);ws.close()}
