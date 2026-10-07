import {mkdirSync,writeFileSync} from 'node:fs';
import {createCanvas,loadImage} from '@napi-rs/canvas';
const out=new URL('../reports/l0-remake/iteration-20/',import.meta.url);mkdirSync(out,{recursive:true});
const pages=await(await fetch('http://127.0.0.1:9235/json/list')).json();
const page=pages.find(p=>p.type==='page'&&p.url.includes('/verifier/l0-remake.html'));if(!page)throw Error('Open the isolated verifier');
const ws=new WebSocket(page.webSocketDebuggerUrl);await new Promise(r=>ws.addEventListener('open',r,{once:true}));
let id=0;const jobs=new Map(),errors=[],report={cases:[]};
ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails);if(m.method==='Runtime.consoleAPICalled'&&m.params.type==='error')errors.push(m.params.args);const p=jobs.get(m.id);if(p){jobs.delete(m.id);m.error?p.reject(m.error):p.resolve(m.result)}};
const send=(method,params={})=>new Promise((resolve,reject)=>{const n=++id;jobs.set(n,{resolve,reject});ws.send(JSON.stringify({id:n,method,params}))});
const ev=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result?.value};
const shot=async name=>{const r=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false}),data=Buffer.from(r.data,'base64');writeFileSync(new URL(name,out),data);const im=await loadImage(data),g=createCanvas(im.width,im.height).getContext('2d');g.drawImage(im,0,0);return g.getImageData(0,0,im.width,im.height).data};
try{
 await send('Runtime.enable');await send('Page.enable');await send('Emulation.setDeviceMetricsOverride',{width:1280,height:720,deviceScaleFactor:1,mobile:false});
 for(const [mode,lights,shadows]of [['classic',8,0],['realistic',8,0],['realistic',16,2]]){
  const name=`${mode}-${lights}-${shadows}`;
  await send('Page.navigate',{url:'http://127.0.0.1:3004/verifier/l0-remake.html?mode='+mode});
  for(let i=0;i<200&&!await ev('!!window.qa?.ready');i++)await new Promise(r=>setTimeout(r,250));
  await ev(`(async()=>{await qa.anchor('blackout');qa.r.setSceneLightLimit(${lights});qa.r.setLightShadows(${shadows});qa.look.pitch=-.35;await qa.warm();qa.hide()})()`);
  const dark=await shot(`${name}-dark.png`);
  await ev(`(async()=>{const e=qa.eng;e.player.hotbar[0]={type:'glowstick',count:1};e.player.selected=0;qa.r.applyView(e);e.throwHeld('glowstick');const {updateProjectiles}=await import('/src/game/engine/combat.ts');for(let i=0;i<200;i++)updateProjectiles(e,1/120);await qa.warm()})()`);
  const lit=await shot(`${name}-glow.png`);
  const actual=await ev(`(async()=>{const {l0StaticPointMask}=await import('/src/game/renderer/l0PointMask.ts'),{glowstickLights}=await import('/src/game/renderer/glowstickLights.ts'),e=qa.eng,points=[];qa.r.scene.traverseVisible(o=>{if(o.isPointLight&&o.layers.test(qa.r.camera.layers))points.push(o)});points.sort((a,b)=>Number(b.castShadow)-Number(a.castShadow));return{sources:glowstickLights(e),mask:points.map((o,i)=>({i,color:o.color.getHexString(),power:o.intensity,baked:!!o.userData.l0Baked,masked:l0StaticPointMask.value[i]})),stats:qa.stats()}})()`);
  if(!actual.mask.some(l=>l.color==='61ff67'&&l.power>0&&l.masked===0)||actual.mask.some(l=>l.masked!==Number(l.baked)))throw Error('Incorrect point-light mask '+name);
  let greenPixels=0,floorPixels=0;
  for(let i=0;i<lit.length;i+=4){const dg=lit[i+1]-dark[i+1],dr=lit[i]-dark[i],db=lit[i+2]-dark[i+2];if(dg>12&&dg>dr+8&&dg>db+8){greenPixels++;if(i/4/1280>430)floorPixels++}}
  if(floorPixels<1500)throw Error('Glowstick did not illuminate floor '+name+' '+floorPixels);
  await ev(`(async()=>{const e=qa.eng,it=e.map.items.find(i=>i.type==='glowstick'&&i.id<0x200000),{scanInteract,doInteract}=await import('/src/game/engine/interact.ts');if(!it)throw Error('Missing landed item');e.player.x=it.x;e.player.y=it.y+.75;qa.look.yaw=0;qa.look.pitch=Math.atan2(-1.1,.75);qa.r.applyView(e);await new Promise(requestAnimationFrame);scanInteract(e);if(e.interactTarget?.it!==it)throw Error('Wrong interaction target');doInteract(e);if(e.map.items.includes(it)||!e.hasItem('glowstick'))throw Error('Recovery failed');await new Promise(requestAnimationFrame)})()`);
  if(await ev(`qa.r.activeLightPool.some(l=>l.intensity>0&&l.color.getHexString()==='61ff67')`))throw Error('Light survived pickup');
  report.cases.push({mode,lights,shadows,greenPixels,floorPixels,...actual,recovered:true});console.log(name,greenPixels,floorPixels);
 }
 report.pass=true;if(errors.length)throw Error('Browser errors');
}catch(e){report.pass=false;report.error=String(e);process.exitCode=1;console.error(e)}
finally{report.errors=errors;writeFileSync(new URL('runtime-visibility.json',out),JSON.stringify(report,null,2));ws.close()}
