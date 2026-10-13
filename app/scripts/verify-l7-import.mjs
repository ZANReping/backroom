// Dedicated, true-headless CDP verification of the production Engine/Renderer.
import { mkdirSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
const stage = process.argv[2] ?? 'after'
const base = process.env.L7_QA_URL ?? 'http://127.0.0.1:3009'
const port = process.env.L7_QA_CDP ?? '9240'
const out = fileURLToPath(new URL('../reports/l7-import/', import.meta.url))
mkdirSync(out, { recursive: true })
const pages = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()
const page = pages.find(p => p.type === 'page' && p.url.startsWith(base)) ?? pages.find(p => p.type === 'page' && p.url === 'chrome-error://chromewebdata/')
if (!page) throw Error('Missing dedicated local QA page')
const ws = new WebSocket(page.webSocketDebuggerUrl)
await new Promise(r => ws.addEventListener('open', r, { once: true }))
let next = 0
const pending = new Map(), errors = []
ws.addEventListener('message', e => {
  const r = JSON.parse(e.data)
  if (r.method === 'Runtime.consoleAPICalled' && r.params.type === 'error') errors.push(r.params)
  if (r.method === 'Runtime.exceptionThrown') errors.push(r.params.exceptionDetails)
  if (r.method === 'Log.entryAdded' && r.params.entry.level === 'error') errors.push(r.params.entry)
  const p = pending.get(r.id)
  if (p) { pending.delete(r.id); r.error ? p.reject(r.error) : p.resolve(r.result) }
})
const send = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++next; pending.set(id, { resolve, reject }); ws.send(JSON.stringify({ id, method, params }))
})
const evaluate = async expression => {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
  if (r.exceptionDetails) throw Error(JSON.stringify(r.exceptionDetails))
  return r.result?.value
}
const save = (name, data) => writeFileSync(out + name, JSON.stringify(data, null, 2) + '\n')
const screenshot = async name => {
  const r = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
  writeFileSync(out + name, Buffer.from(r.data, 'base64'))
}
async function navigate(path, ready) {
  await send('Page.navigate', { url: base + path }); await new Promise(r => setTimeout(r, 700))
  for (let i = 0; i < 240; i++) {
    if (await evaluate(`location.href === ${JSON.stringify(base+path)} && (${ready})`)) return
    await new Promise(r => setTimeout(r, 300))
  }
  throw Error('Timed out: ' + path)
}
try {
 await send('Runtime.enable');await send('Log.enable');await send('Page.enable');
 const version=await send('Browser.getVersion'),commandLine=await send('Browser.getBrowserCommandLine');
 if(!commandLine.arguments.includes('--headless=new')||!version.userAgent.includes('HeadlessChrome')||!commandLine.arguments.some(a=>a.replaceAll('\\','/').endsWith('/app/.cache/l7-qa'))||!commandLine.arguments.includes('--remote-debugging-port='+port))throw Error('Wrong QA browser');
 save('browser.json',{version,commandLine});
 await send('Emulation.setDeviceMetricsOverride',{width:1920,height:1080,deviceScaleFactor:1,mobile:false});
 await navigate('/verifier/l0-remake.html?level=7&mode=realistic'+(stage==='before'?'&baseline=l7':''),'!!window.qa?.ready');
 await evaluate(`qa.hide();qa.r.resize(1920,1080,1);qa.warm=async()=>{const start=performance.now();let stable=start,prev='';for(;;){const p=qa.pendingWork(),s=JSON.stringify([qa.r.chunkGroups.size,qa.r.three.info.memory,qa.r.three.info.programs.length]),now=performance.now();if(Object.values(p).some(Boolean)||s!==prev){stable=now;prev=s}if(now-start>3000&&now-stable>1000)return {elapsed:now-start,pending:p};if(now-start>180000)throw Error('Cold rebuild timeout '+JSON.stringify(p));await new Promise(r=>setTimeout(r,100))}}`);
 await evaluate('qa.warm()');
 await screenshot(stage+'-entry.png');
 await evaluate(`(async()=>{const e=qa.eng,p=e.player;p.x=64-e.map.inf.ox;p.y=64-e.map.inf.oy;e.updateInfiniteWindow();p.z=.1;qa.look.yaw=0;qa.look.pitch=.18;await qa.warm();qa.freezeRenderTime(60)})()`);
 await screenshot(stage+'-surface.png');save(stage+'-camera.json',await evaluate('({seed:qa.eng.mapSeed,x:64,y:64,z:.1,yaw:qa.look.yaw,pitch:qa.look.pitch,fov:qa.r.camera.fov})'));
 if(!process.env.L7_QA_TEST_ONLY){const samples=[];for(let i=0;i<5;i++){samples.push(await evaluate('qa.sample(180)'));save(stage+'-performance.json',samples)}}
 if(stage==='after'){save('runtime.json',await evaluate("import('/verifier/l7-import.ts').then(m=>m.verifyL7Import(qa))"));for(const view of await evaluate('window.l7Views')){await evaluate('window.l7SetView('+JSON.stringify(view)+')');await screenshot('after-'+view.id+'.png');if(!process.env.L7_QA_TEST_ONLY&&['shallow-rays','cave','wall-outside'].includes(view.id)){const perf=[];for(let i=0;i<5;i++)perf.push(await evaluate('qa.sample(180)'));save('performance-'+view.id+'.json',perf)}save('camera-'+view.id+'.json',await evaluate('({stats:qa.stats(),world:{x:qa.eng.player.x+qa.eng.map.inf.ox,y:qa.eng.player.y+qa.eng.map.inf.oy,z:qa.eng.player.z},look:qa.look,mode:qa.r.lightMode})'))}}
 const relevant=errors.filter(e=>!e.url?.endsWith('/favicon.ico'));if(relevant.length)throw Error(relevant.length+' browser errors');
}finally{save(stage+'-errors.json',errors);ws.close()}
