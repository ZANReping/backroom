import {writeFileSync,mkdirSync} from 'node:fs';
const qaTag=process.env.QA_TAG??'iteration-19';
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
 const shot=async name=>{const image=await send('Page.captureScreenshot',{format:'png'});writeFileSync(new URL(name,out),Buffer.from(image.data,'base64'))};
 const input=async(selector,value)=>{await ev(`(()=>{const i=document.querySelector(${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(i,${JSON.stringify(value)});i.dispatchEvent(new Event('input',{bubbles:true}))})()`);await new Promise(r=>setTimeout(r,120))};
 const preset=async label=>{await ev(`(()=>{const b=[...document.querySelectorAll('button')].find(b=>b.firstElementChild?.textContent===${JSON.stringify(label)});if(!b)throw Error('Preset missing');b.click()})()`);await new Promise(r=>setTimeout(r,200))};
 await click('设置');await click('画面');await preset('平衡');
 await check(`[...document.querySelectorAll('button')].find(b=>b.firstElementChild?.textContent==='平衡').getAttribute('aria-pressed')==='true'`,'built-in preset activates when applied');
 const before=await ev(`JSON.parse(localStorage.getItem('br_settings'))`);
 await click('氛围');await check(`!!document.querySelector('button[aria-label="人眼动态曝光"]')&&!document.body.innerText.includes('灯光闪烁强度')`,'atmosphere has eye adaptation, no global flicker slider');
 await ev(`document.querySelector('button[aria-label="人眼动态曝光"]').click()`);await new Promise(r=>setTimeout(r,150));
 await shot('atmosphere-settings.png');await click('基础');
 await check(`[...document.querySelectorAll('button')].find(b=>b.firstElementChild?.textContent==='平衡').getAttribute('aria-pressed')==='false'`,'manual setting change clears preset activation');
 await input('input[aria-label="自定义预设名称"]','我的夜游');await click('保存当前画面');
 await check(`[...document.querySelectorAll('button')].find(b=>b.textContent==='我的夜游')?.getAttribute('aria-pressed')==='true'`,'saved custom preset immediately active');
 await check(`(()=>{const p=JSON.parse(localStorage.getItem('br_graphics_presets_v1'))[0];return p.name==='我的夜游'&&!p.values.eyeAdaptation&&!('llmApiKey' in p.values)&&!('volume' in p.values)&&!('newGameSeed' in p.values)})()`,'saved preset contains graphics only');
 await preset('性能优先');await click('我的夜游');
 await check(`JSON.parse(localStorage.getItem('br_settings')).volume===${before.volume}&&JSON.parse(localStorage.getItem('br_settings')).newGameSeed===${JSON.stringify(before.newGameSeed)}&&JSON.parse(localStorage.getItem('br_settings')).flicker===0`,'preset application preserves audio/seed and keeps global flicker zero');
 await shot('custom-preset.png');await click('氛围');await ev(`document.querySelector('button[aria-label="人眼动态曝光"]').click()`);await new Promise(r=>setTimeout(r,100));await click('基础');
 await check(`[...document.querySelectorAll('button')].find(b=>b.firstElementChild?.textContent==='平衡').getAttribute('aria-pressed')==='true'`,'manual return to exact settings reactivates built-in preset');
 await send('Page.reload');await wait(`window.__engine&&document.body.innerText.includes('开始游戏')`);await click('设置');await click('画面');
 await check(`!![...document.querySelectorAll('button')].find(b=>b.textContent==='我的夜游')`,'custom preset survives page reload');await click('关闭');
 await click('开始游戏');await wait(`window.__engine.map&&!document.body.innerText.includes('正在准备资源')&&!document.body.innerText.includes('准备附近场景')`);
 for(let i=0;i<18;i++){await ev(`(()=>{const b=[...document.querySelectorAll('button')].find(b=>/跳过|继续前进|进入层级/.test(b.textContent));b?.click()})()`);await new Promise(r=>setTimeout(r,250))}
 report.letterAnimation=await ev(`(async()=>{__engine.emit({kind:'doc',text:'backrooms_basics'});let a;for(let i=0;i<20;i++){await new Promise(requestAnimationFrame);a=document.querySelector('[data-manila-letter]');if(a)break}if(!a)throw Error('Letter did not open');const frames=[],sample=()=>{const s=getComputedStyle(a);frames.push({animation:s.animationName,duration:s.animationDuration,opacity:Number(s.opacity),transform:s.transform})};sample();await new Promise(r=>setTimeout(r,100));sample();await new Promise(r=>setTimeout(r,250));sample();return frames})()`);
 if(report.letterAnimation[0].animation!=='slideUp'||report.letterAnimation[0].opacity>=report.letterAnimation.at(-1).opacity||report.letterAnimation.at(-1).opacity!==1)throw Error('Letter opening animation did not run');
 report.checks.push('Foundation letter actually animates from transparent/offset to fully visible in 0.28s');
 await check(`(()=>{const a=document.querySelector('[data-manila-letter]');return a.querySelectorAll('p').length===4&&a.textContent.includes('同舟共济')&&a.querySelector('img').complete&&a.querySelector('img').naturalWidth>0&&getComputedStyle(a).backgroundColor==='rgb(255, 255, 255)'})()`,'Foundation letter has four original paragraphs, loaded logo and white paper');
 await shot('foundation-letter.png');
 await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});await new Promise(r=>setTimeout(r,300));
 await check(`(()=>{const a=document.querySelector('[data-manila-letter]');const r=a.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.bottom<=innerHeight})()`,'letter fits mobile viewport with internal scroll');await shot('foundation-letter-mobile.png');
 await click('放回（Esc）');
 report={...report,pass:true,errors:page.errors};console.log(JSON.stringify(report));
}catch(error){report={...report,pass:false,error:String(error),errors:page?.errors};if(page){const shot=await page.send('Page.captureScreenshot',{format:'png'});writeFileSync(new URL('experience-ui-failure.png',out),Buffer.from(shot.data,'base64'));report.dom=(await page.send('Runtime.evaluate',{expression:'document.body.innerText',returnByValue:true})).result?.value}console.error(report);process.exitCode=1}
finally{writeFileSync(new URL('experience-ui.json',out),JSON.stringify(report,null,2));page?.ws.close();await browser.send('Target.disposeBrowserContext',{browserContextId});browser.ws.close()}
