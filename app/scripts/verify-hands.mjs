import {mkdirSync,writeFileSync} from 'node:fs'
const base=process.env.HANDS_QA_URL??'http://127.0.0.1:3011',port=process.env.HANDS_QA_CDP??'9242',out='reports/hands-import/'
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
 if(!version.userAgent.includes('HeadlessChrome')||!commandLine.arguments.includes('--headless=new')||!commandLine.arguments.includes('--remote-debugging-port='+port)||!commandLine.arguments.some(a=>a.replaceAll('\\','/').endsWith('/app/.cache/hands-qa')))throw Error('Wrong QA browser')
 save('browser.json',{version,commandLine})
 if(process.argv[2]==='cleanup')await send('Browser.close')
 else if(process.argv[2]==='probe')console.log(await ev(process.argv[3]))
 else if(process.argv[2]==='dark'){
  await send('Emulation.setDeviceMetricsOverride',{width:1920,height:1080,deviceScaleFactor:1,mobile:false})
  await navigate('/verifier/l0-remake.html?level=0&mode=realistic','!!window.qa?.ready')
  await ev('qa.hide();qa.anchor("blackout")')
  await ev('qa.eng.paused=false;qa.eng.player.hotbar[0]={type:"crowbar",count:1};qa.eng.player.selected=0;qa.eng.player.equip.offhand={type:"flashlight",count:1};qa.eng.syncPassives();qa.eng.player.flashlight=true;qa.r.resize(1920,1080,1);qa.warm()')
  const region=await ev('import("/src/game/world/l0Regions.ts").then(m=>m.l0EnvironmentAt(qa.eng.map.inf.seed,qa.eng.player.x+qa.eng.map.inf.ox,qa.eng.player.y+qa.eng.map.inf.oy))')
  if(region.blackout<.5)throw Error('Dark fixture is outside blackout region')
  save('dark-region.json',region);await shot('game-dark.png')
  await ev('qa.eng.player.flashlight=false');await new Promise(r=>setTimeout(r,150));await shot('game-dark-off.png')
  await ev('qa.eng.player.flashlight=true;qa.mode("classic");qa.warm()');await shot('game-dark-classic.png')
  if(errors.filter(e=>!e.url?.endsWith('/favicon.ico')).length)throw Error('Dark scene browser errors')
 }
 else{
 await send('Emulation.setDeviceMetricsOverride',{width:1920,height:1080,deviceScaleFactor:1,mobile:false})
 await navigate('/verifier/l0-remake.html?level=104&mode=realistic','!!window.qa?.ready')
 await ev("qa.hide();qa.r.resize(1920,1080,1);qa.r.setFov(75);qa.eng.paused=false;qa.eng.player.hotbar[0]={type:'crowbar',count:1};qa.eng.player.selected=0;qa.eng.player.equip.offhand={type:'flashlight',count:1};qa.eng.player.flashlight=true;qa.look.yaw=.42;qa.look.pitch=.015;qa.warm()")
 const phase=process.argv[2]??'after'
 await shot(phase+'-crowbar.png');save(phase+'-camera.json',await ev('({position:[qa.eng.player.x,qa.eng.player.y,qa.eng.player.z],look:qa.look,fov:qa.r.camera.fov})'))
 const samples=[];for(let i=0;i<5;i++)samples.push(await ev('qa.sample(180)'));save(phase+'-performance.json',samples)
 if(phase==='after'){
  save('runtime.json',await ev("import('/verifier/hands.ts').then(m=>m.verifyHands(qa))"))
  for(const view of ['crowbar','flashlight','lighter','drink','squirtgun','inspect','gloves','short','dark']){await ev('window.handsView('+JSON.stringify(view)+')');await shot('game-'+view+'.png')}
  await ev('qa.mode("classic");qa.warm()');await shot('game-dark-classic.png')
  for(const set of ['items','anims','looks','flash']){await navigate('/proto-retro-npc.html?mode=hands&set='+set,'window.__ready===true');await shot('models-'+set+'.png')}
 }
 if(errors.filter(e=>!e.url?.endsWith('/favicon.ico')).length)throw Error('Browser errors')
 }
}finally{save((process.argv[2]??'after')+'-errors.json',errors);ws.close()}
