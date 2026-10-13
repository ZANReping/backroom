import {writeFileSync,mkdirSync} from 'node:fs';
const qaTag=process.env.QA_TAG??'iteration-16';
if(!/^[a-z0-9-]+$/.test(qaTag))throw new Error('QA_TAG must match /^[a-z0-9-]+$/');
const out=new URL(`../reports/l0-remake/${qaTag}/`,import.meta.url);mkdirSync(out,{recursive:true});
async function connection(url){const ws=new WebSocket(url);await new Promise(r=>ws.addEventListener('open',r,{once:true}));let seq=0;const jobs=new Map(),errors=[];ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails);const p=jobs.get(m.id);if(p){jobs.delete(m.id);m.error?p.reject(m.error):p.resolve(m.result)}};return{ws,errors,send:(method,params={})=>new Promise((resolve,reject)=>{const id=++seq;jobs.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params}))})}}
const version=await(await fetch('http://127.0.0.1:9235/json/version')).json(),browser=await connection(version.webSocketDebuggerUrl);
const {browserContextId}=await browser.send('Target.createBrowserContext');let page,report={checks:[]};
try{
 const {targetId}=await browser.send('Target.createTarget',{url:'about:blank',browserContextId});const info=(await(await fetch('http://127.0.0.1:9235/json/list')).json()).find(t=>t.id===targetId);page=await connection(info.webSocketDebuggerUrl);
 const send=page.send,ev=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result?.value};
 const wait=async(test,ms=120000)=>{const until=Date.now()+ms;while(Date.now()<until){if(await ev(test))return;await new Promise(r=>setTimeout(r,300))}throw Error('Timeout '+test)};
 const check=async(expression,label)=>{if(!await ev(expression))throw Error(label);report.checks.push(label)};
 const click=async label=>{const okay=await ev(`(()=>{const b=[...document.querySelectorAll('button')].find(b=>b.textContent.trim().replace(/^▸\\s*/, '')===${JSON.stringify(label)});b?.click();return !!b})()`);if(!okay)throw Error('Missing button '+label);await new Promise(r=>setTimeout(r,200))};
 await send('Runtime.enable');await send('Page.enable');await send('Emulation.setDeviceMetricsOverride',{width:1280,height:900,deviceScaleFactor:1,mobile:false});
 await send('Page.addScriptToEvaluateOnNewDocument',{source:`if(location.hostname==='127.0.0.1'&&!localStorage.getItem('br_settings'))localStorage.setItem('br_settings',JSON.stringify({devMode:true,lightMode:'realistic',dynamicRes:false,muted:true,bgm:0,ambient:0}));`});
 await send('Page.navigate',{url:'http://127.0.0.1:3004/'});await wait(`window.__engine&&document.body.innerText.includes('开始游戏')`);await send('Page.bringToFront');
 await click('设置');await check(`!document.body.innerText.includes('预载全部层级')&&document.body.innerText.includes('新游戏种子')`,'preload option replaced by seed input');
 const fill=async value=>{await ev(`(()=>{const i=document.querySelector('input[placeholder="留空=随机"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(i,${JSON.stringify(value)});i.dispatchEvent(new Event('input',{bubbles:true}))})()`);await new Promise(r=>setTimeout(r,100))};
 await fill('123wrong');await check(`[...document.querySelectorAll('button')].find(b=>b.textContent==='应用').disabled`,'invalid seed rejected');
 await fill('20261006');await click('应用');await check(`JSON.parse(localStorage.getItem('br_settings')).newGameSeed===Number(20261006).toString(16).toUpperCase().padStart(8,'0').replace(/(.{4})(.{4})/,'$1-$2')`,'decimal seed stored in displayed format');
 let image=await send('Page.captureScreenshot',{format:'png'});writeFileSync(new URL('settings-seed.png',out),Buffer.from(image.data,'base64'));
 await click('关闭');await click('开始游戏');await wait(`window.__engine.map&&window.__engine.seed===20261006`);await wait(`!document.body.innerText.includes('正在准备资源')&&!document.body.innerText.includes('准备附近场景')`);
 for(let i=0;i<140;i++){
  await ev(`(()=>{const b=[...document.querySelectorAll('button')].find(b=>/跳过|继续前进|进入层级/.test(b.textContent));b?.click()})()`);
  await send('Input.dispatchKeyEvent',{type:'keyDown',code:'KeyM',key:'m',windowsVirtualKeyCode:77});await send('Input.dispatchKeyEvent',{type:'keyUp',code:'KeyM',key:'m',windowsVirtualKeyCode:77});
  if(await ev(`!!document.querySelector('canvas[data-world-map]')`))break;await new Promise(r=>setTimeout(r,500));
 }
 await check(`!!document.querySelector('canvas[data-world-map]')&&!document.body.innerText.includes('开发者地图')`,'original map exposes reveal and no separate developer map');
 const initialMapRect=await ev(`(()=>{const c=document.querySelector('canvas[data-world-map]'),r=c.getBoundingClientRect();return{w:r.width,h:r.height,parent:r.parentElement?.getBoundingClientRect().width??0}})()`);
 await check(`${initialMapRect.w>=470&&initialMapRect.h>=470}`,'big map opens at full available size');
 await check(`(()=>{const l=document.querySelector('[data-l0-map-legend]');return !!l&&['红室','熄灯区','深坑','拱门','马尼拉'].every(t=>l.textContent.includes(t))&&l.querySelectorAll('svg').length>=7})()`,'original map legend lists L0 regions');
 await ev(`(()=>{const l=[...document.querySelectorAll('label')].find(l=>l.textContent.includes('地图全开'));l.querySelector('input').click()})()`);
 const before=await ev(`({x:__engine.player.x+(__engine.map.inf?.ox??0),y:__engine.player.y+(__engine.map.inf?.oy??0),items:__engine.map.items.length,entities:__engine.map.entities.length,explored:[...__engine.explored].reduce((a,b)=>a+b,0),chunks:__engine.map.inf?.chunks.size})`);
 await new Promise(r=>setTimeout(r,4000));await check(`__engine.map.items.length===${before.items}&&__engine.map.entities.length===${before.entities}&&[...__engine.explored].reduce((a,b)=>a+b,0)===${before.explored}`,'map preview does not spawn or explore the world');
 const rect=await ev(`(()=>{const c=document.querySelector('canvas[data-world-map]');const r=c.getBoundingClientRect();return{x:r.x,y:r.y,w:r.width,h:r.height}})()`);
 await send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',buttons:1,x:rect.x+rect.w/2,y:rect.y+rect.h/2,clickCount:1});await send('Input.dispatchMouseEvent',{type:'mouseMoved',button:'left',buttons:1,x:rect.x+rect.w/2+40,y:rect.y+rect.h/2});await send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',buttons:0,x:rect.x+rect.w/2+40,y:rect.y+rect.h/2,clickCount:1});
 await check(`Math.abs(__engine.player.x+(__engine.map.inf?.ox??0)-${before.x})<.01`,'drag does not teleport');await click('回正');
 await check(`(()=>{const c=document.querySelector('canvas[data-world-map]'),r=c.getBoundingClientRect();return Math.abs(r.width-${initialMapRect.w})<1&&Math.abs(r.height-${initialMapRect.h})<1})()`,'big map size stays fixed after dragging');
 await send('Input.dispatchMouseEvent',{type:'mousePressed',button:'right',buttons:2,x:rect.x+rect.w/2+12,y:rect.y+rect.h/2,clickCount:1});await send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'right',buttons:0,x:rect.x+rect.w/2+12,y:rect.y+rect.h/2,clickCount:1});
 await wait(`document.body.innerText.includes('已传送到')`,10000);await check(`Math.abs(__engine.player.x+(__engine.map.inf?.ox??0)-${before.x})>.5`,'right click safely teleports');
 image=await send('Page.captureScreenshot',{format:'png'});writeFileSync(new URL('original-map.png',out),Buffer.from(image.data,'base64'));
 await click('关闭');await check(`!!document.querySelector('canvas[data-minimap]')&&!document.querySelector('[data-l0-map-legend]')`,'minimap has no legend below it');await click('世界');
 const exploredBeforeWorld=await ev('[...__engine.explored].reduce((a,b)=>a+b,0)');
 await click('地图全开');await check('!__engine.dev.mapReveal','world panel disables the shared reveal switch');
 await click('地图全开');await check(`__engine.dev.mapReveal&&[...__engine.explored].reduce((a,b)=>a+b,0)===${exploredBeforeWorld}`,'world panel reveals without writing exploration');
 image=await send('Page.captureScreenshot',{format:'png'});writeFileSync(new URL('world-map-switch.png',out),Buffer.from(image.data,'base64'));
 await send('Input.dispatchKeyEvent',{type:'keyDown',code:'KeyM',key:'m',windowsVirtualKeyCode:77});await send('Input.dispatchKeyEvent',{type:'keyUp',code:'KeyM',key:'m',windowsVirtualKeyCode:77});
 await wait('!!document.querySelector("canvas[data-world-map]")');await check(`(()=>{const l=[...document.querySelectorAll('label')].find(l=>l.textContent.includes('地图全开'));return l?.querySelector('input')?.checked})()`,'original map reflects the world panel switch');
 await click('关闭');
 await check(`__engine.devGotoVariant('arch')`,'arch map target reachable');await new Promise(r=>setTimeout(r,6000));
 await check(`!!document.querySelector('canvas[data-minimap]')&&!document.querySelector('[data-l0-map-legend]')`,'minimap has no legend below it');
 image=await send('Page.captureScreenshot',{format:'png'});writeFileSync(new URL('arch-minimap.png',out),Buffer.from(image.data,'base64'));
 await send('Input.dispatchKeyEvent',{type:'keyDown',code:'KeyM',key:'m',windowsVirtualKeyCode:77});await send('Input.dispatchKeyEvent',{type:'keyUp',code:'KeyM',key:'m',windowsVirtualKeyCode:77});
 await wait('!!document.querySelector("canvas[data-world-map]")');await new Promise(r=>setTimeout(r,2000));
 image=await send('Page.captureScreenshot',{format:'png'});writeFileSync(new URL('arch-original-map.png',out),Buffer.from(image.data,'base64'));
 report.mapDraw=await ev(`(async()=>{const {drawL0Map}=await import('/src/game/content/l0Map.ts'),rows=[];for(const [name,size,span]of [['mini',140,80],['large',480,120]]){const c=document.createElement('canvas');c.width=c.height=size;const g=c.getContext('2d'),s=size/span,x=__engine.player.x,y=__engine.player.y;const times=[];for(let i=0;i<120;i++){await new Promise(requestAnimationFrame);c.width=size;g.translate(size/2-x*s,size/2-y*s);const t=performance.now();drawL0Map(g,__engine,{x0:x-span/2,y0:y-span/2,x1:x+span/2,y1:y+span/2,scale:s});if(i>=20)times.push(performance.now()-t)}times.sort((a,b)=>a-b);rows.push({name,median:times[50],p95:times[95],samples:times.length,cadence:'one redraw per RAF after 20 warmup frames'})}return rows})()`);
 if(process.env.QA_ALL_MAPS==='1')for(const level of [1,4,101]){
  await ev(`__engine.loadLevel(${level},{mapSeed:20261006,firstVisit:false});__engine.introT=0;__engine.dev.mapReveal=true`)
  const selector=level===101?'[data-alpha-map] canvas':'canvas[data-world-map]'
  await wait(`!!document.querySelector(${JSON.stringify(selector)})`)
  await wait(`!document.body.innerText.includes('准备附近场景')&&!document.body.innerText.includes('正在准备资源')`)
  await new Promise(r=>setTimeout(r,300))
  await check(`(()=>{const c=document.querySelector(${JSON.stringify(selector)});return !!c&&c.getBoundingClientRect().width>100})()`,`all-map ${level} canvas rendered`)
  image=await send('Page.captureScreenshot',{format:'png'});writeFileSync(new URL(`all-map-${level}.png`,out),Buffer.from(image.data,'base64'))
 }
 report={...report,pass:true,errors:page.errors};console.log(JSON.stringify(report));
}catch(error){report={...report,pass:false,error:String(error),errors:page?.errors};if(page){const shot=await page.send('Page.captureScreenshot',{format:'png'});writeFileSync(new URL('controls-failure.png',out),Buffer.from(shot.data,'base64'));report.dom=(await page.send('Runtime.evaluate',{expression:'document.body.innerText',returnByValue:true})).result?.value}console.error(report);process.exitCode=1}
finally{writeFileSync(new URL('controls.json',out),JSON.stringify(report,null,2));page?.ws.close();await browser.send('Target.disposeBrowserContext',{browserContextId});browser.ws.close()}
