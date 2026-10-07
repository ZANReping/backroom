import{writeFileSync}from'node:fs';
const target=await(await fetch('http://127.0.0.1:9235/json/new?about:blank',{method:'PUT'})).json();
const ws=new WebSocket(target.webSocketDebuggerUrl);await new Promise(r=>ws.addEventListener('open',r,{once:true}));
let seq=0;const requests=new Map(),errors=[],failed=[];
ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails);if(m.method==='Runtime.consoleAPICalled'&&m.params.type==='error')errors.push(m.params.args);if(m.method==='Network.loadingFailed')failed.push(m.params);if(requests.has(m.id)){requests.get(m.id)(m.result);requests.delete(m.id)}};
const send=(method,params={})=>new Promise(resolve=>{const id=++seq;requests.set(id,resolve);ws.send(JSON.stringify({id,method,params}))});
const ev=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value};
try{
 await send('Runtime.enable');await send('Network.enable');await send('Page.enable');await send('Emulation.setDeviceMetricsOverride',{width:1920,height:1080,deviceScaleFactor:1,mobile:false});await send('Page.navigate',{url:'http://127.0.0.1:3004/'});await send('Page.bringToFront');
 const click=async label=>{const found=await ev(`(()=>{const b=[...document.querySelectorAll('button')].find(b=>b.textContent.replace(/\\s/g,'').endsWith(${JSON.stringify(label.replace(/[▸\s]/g,''))}));b?.click();return !!b})()`);if(!found)throw Error('Missing control: '+label);await new Promise(r=>setTimeout(r,150))};
 for(let i=0;i<120&&!await ev(`!![...document.querySelectorAll('button')].find(b=>b.textContent.includes('开始游戏'))`);i++)await new Promise(r=>setTimeout(r,250));
 await click('▸ 设置');await click('画面');await click('光影');await click('真实');await click('半分辨率');
 const controls=await ev(`document.body.innerText.includes('环境遮蔽')&&document.body.innerText.includes('阴影刷新率')`);
 await new Promise(r=>setTimeout(r,2000));const shot=await send('Page.captureScreenshot',{format:'png'});writeFileSync(new URL('../reports/l0-remake/settings-realistic.png',import.meta.url),Buffer.from(shot.data,'base64'));
 writeFileSync(new URL('../reports/l0-remake/settings-ui.json',import.meta.url),JSON.stringify({controls,errors,failed},null,2)+'\n');console.log(JSON.stringify({controls,errors,failed}));
}finally{await new Promise(resolve=>{ws.addEventListener('close',resolve,{once:true});ws.close()});await fetch('http://127.0.0.1:9235/json/close/'+target.id)}
