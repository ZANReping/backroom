import {mkdirSync,writeFileSync} from 'node:fs'
const base=process.env.RETRO_QA_URL??'http://127.0.0.1:3010',port=process.env.RETRO_QA_CDP??'9241',out='reports/retro-avatar-import/'
mkdirSync(out,{recursive:true})
const page=(await(await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find(p=>p.type==='page'&&p.url.startsWith(base))
if(!page)throw Error('Missing owned QA page')
const ws=new WebSocket(page.webSocketDebuggerUrl);await new Promise(r=>ws.addEventListener('open',r,{once:true}))
let seq=0;const pending=new Map(),errors=[]
ws.addEventListener('message',e=>{const r=JSON.parse(e.data);if(r.method==='Runtime.exceptionThrown')errors.push(r.params.exceptionDetails);if(r.method==='Runtime.consoleAPICalled'&&r.params.type==='error')errors.push(r.params);if(r.method==='Log.entryAdded'&&r.params.entry.level==='error')errors.push(r.params.entry);const p=pending.get(r.id);if(p){pending.delete(r.id);r.error?p.reject(r.error):p.resolve(r.result)}})
const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++seq;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params}))})
const ev=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result?.value}
const save=(n,v)=>writeFileSync(out+n,JSON.stringify(v,null,2)+'\n')
const shot=async n=>writeFileSync(out+n,Buffer.from((await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false})).data,'base64'))
async function navigate(path,ready){await send('Page.navigate',{url:base+path});for(let i=0;i<400;i++){await new Promise(r=>setTimeout(r,300));if(await ev(`location.href===${JSON.stringify(base+path)}&&(${ready})`))return}throw Error('Navigation timeout '+path)}
try{
 await send('Runtime.enable');await send('Log.enable');await send('Page.enable')
 const version=await send('Browser.getVersion'),commandLine=await send('Browser.getBrowserCommandLine')
 if(!version.userAgent.includes('HeadlessChrome')||!commandLine.arguments.includes('--headless=new')||!commandLine.arguments.includes('--remote-debugging-port='+port)||!commandLine.arguments.some(a=>a.replaceAll('\\','/').endsWith('/app/.cache/retro-avatar-qa')))throw Error('Wrong QA browser')
 save('browser.json',{version,commandLine})
 if(process.argv[2]==='cleanup'){await send('Browser.close')}
 else if(process.argv[2]==='probe'){console.log(await ev(process.argv[3]));process.exitCode=0}
 else if(process.argv[2]==='bootstrap'){
  await send('Emulation.setDeviceMetricsOverride',{width:1920,height:1080,deviceScaleFactor:1,mobile:false})
  await navigate('/','[...document.querySelectorAll("button")].some(b=>b.textContent.includes("形象编辑"))')
  await ev('[...document.querySelectorAll("button")].find(b=>b.textContent.includes("形象编辑")).click()')
  await new Promise(r=>setTimeout(r,2500))
  const result=await ev('({selects:document.querySelectorAll("select").length,beard:[...document.querySelectorAll("option")].some(o=>o.textContent==="长须"),canvas:document.querySelectorAll("canvas").length})')
  if(result.selects<5||!result.beard||!result.canvas)throw Error('Main app avatar editor failed')
  save('bootstrap.json',result);await shot('main-avatar-editor.png')
  if(errors.filter(e=>!e.url?.endsWith('/favicon.ico')).length)throw Error('Main app runtime errors')
 }
 else{
 await send('Emulation.setDeviceMetricsOverride',{width:1920,height:1080,deviceScaleFactor:1,mobile:false})
 await navigate('/verifier/l0-remake.html?level=104&mode=realistic','!!window.qa?.ready')
 await ev('qa.hide();qa.r.resize(1920,1080,1);qa.warm()')
 save('runtime.json',await ev("import('/verifier/retro-avatar.ts').then(m=>m.verifyRetroAvatar(qa))"))
 for(const mode of ['realistic','classic']){await ev(`window.retroView(${JSON.stringify(mode)})`);await shot('game-tom-'+mode+'.png');save('camera-'+mode+'.json',await ev('({player:qa.eng.player,look:qa.look,stats:qa.stats()})'))}
 const samples=[];for(let i=0;i<5;i++)samples.push(await ev('qa.sample(180)'));save('performance.json',samples)
 for(const view of ['compare','close','hair&row=0','hair&row=1','player&part=equip','beards&close=1','named&ids=joey&walk=1']){
  await navigate('/proto-retro-npc.html?mode='+view+'&live=1&t=1.25','window.__ready===true');await shot('models-'+view.replaceAll(/[^a-z0-9]+/g,'-')+'.png')
 }
 await navigate('/verifier/retro-avatar-ui.html','window.retroUIReady===true')
 save('ui.json',await ev('window.retroUIResult'));await shot('avatar-ui.png')
 const relevant=errors.filter(e=>!e.url?.endsWith('/favicon.ico'));if(relevant.length)throw Error(relevant.length+' browser errors')
 }
}finally{save(process.argv[2]==='cleanup'?'cleanup-errors.json':process.argv[2]==='bootstrap'?'bootstrap-errors.json':process.argv[2]==='probe'?'probe-errors.json':'browser-errors.json',errors);ws.close()}
