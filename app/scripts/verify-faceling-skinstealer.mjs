import {mkdirSync,writeFileSync} from 'node:fs'
const base=process.env.ENTITY_QA_URL??'http://127.0.0.1:3012',port=process.env.ENTITY_QA_CDP??'9243',out='reports/faceling-skinstealer-import/'
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

try {
 await send('Runtime.enable');await send('Log.enable');await send('Page.enable')
 const version=await send('Browser.getVersion'),commandLine=await send('Browser.getBrowserCommandLine')
 if(!version.userAgent.includes('HeadlessChrome')||!commandLine.arguments.includes('--headless=new')||!commandLine.arguments.includes('--remote-debugging-port='+port)||!commandLine.arguments.some(a=>a.replaceAll('\\','/').endsWith('/app/.cache/faceling-skinstealer-qa')))throw Error('Wrong QA browser')
 save('browser.json',{version,commandLine})
 if(process.argv[2]==='cleanup')await send('Browser.close')
 else if(process.argv[2]==='probe')console.log(await ev(process.argv[3]))
 else if(process.argv[2]==='environments'){
  await send('Emulation.setDeviceMetricsOverride',{width:1920,height:1080,deviceScaleFactor:1,mobile:false})
  await navigate('/verifier/l0-remake.html?level=104&mode=realistic','!!window.qa?.ready')
  await ev('qa.hide();qa.r.resize(1920,1080,1)')
  for(const level of (process.argv[3]?process.argv[3].split(',').map(Number):[0,5,3])){
   save('level-'+level+'.json',await ev("import('/verifier/faceling-skinstealer.ts').then(m=>m.environmentEntity(qa,"+level+"))"))
   await shot('game-level-'+level+'.png')
   if(level===0){await ev('qa.eng.player.flashlight=false');await new Promise(r=>setTimeout(r,300));await shot('game-dark-off.png')}
  }
  if(errors.filter(e=>!e.url?.endsWith('/favicon.ico')).length)throw Error('Environment browser errors')
 }
 else {
  await send('Emulation.setDeviceMetricsOverride',{width:1920,height:1080,deviceScaleFactor:1,mobile:false})
  await navigate('/verifier/l0-remake.html?level=104&mode=realistic','!!window.qa?.ready')
  await ev('qa.hide();qa.r.resize(1920,1080,1);qa.warm()')
  save('runtime.json',await ev("import('/verifier/faceling-skinstealer.ts').then(m=>m.verifyEntities(qa))"))
  for(const view of ['faceling','faceling-l3','faceling-l3-close','skin-human','skin-true','skin-peel','skin-true-close']){
   await ev('window.entityView('+JSON.stringify(view)+')');await shot('game-'+view+'.png')
  }
  await ev('qa.mode("classic");qa.warm();window.entityView("faceling-l3")');await shot('game-faceling-classic.png')
  await ev('window.entityView("skin-true")');await shot('game-skin-classic.png')
  save('transitions.json',await ev('window.entityCycles()'))
  await ev('qa.mode("realistic");window.entityView("skin-true").then(()=>qa.warm())')
  const samples=[];for(let i=0;i<5;i++)samples.push(await ev('qa.sample(180)'));save('performance.json',samples)
  if(errors.filter(e=>!e.url?.endsWith('/favicon.ico')).length)throw Error('Browser errors')
 }
}finally{save((process.argv[2]??'after')+'-errors.json',errors);ws.close()}
