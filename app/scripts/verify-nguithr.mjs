// Nguithr'xurh 重制：无头 Chromium 截图验收（原型页 proto-nguithr.html）。
// 用法：先在 3376 端口起开发服务（npx vite --port 3376 --strictPort），再 node scripts/verify-nguithr.mjs [视图名...]
// 本脚本自己启动/关闭专属 QA 浏览器（--headless=new、独立用户目录 .cache/nguithr-qa、调试端口 9376），不连接任何已有浏览器。
import { spawn } from 'node:child_process'
import { mkdirSync, writeFileSync, existsSync,rmSync } from 'node:fs'
import net from 'node:net'
import path from 'node:path'
const free=()=>new Promise(resolve=>{const s=net.createServer();s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>resolve(p))})})
const port=await free(),serverPort=await free(),base=process.env.NG_QA_URL??'http://127.0.0.1:'+serverPort,out='reports/nguithr/'
const profile=path.resolve('.cache/nguithr-proto-'+Date.now()+'-'+process.pid)
const chromePath=[process.env.CHROME_PATH,'C:/Program Files/Google/Chrome/Application/chrome.exe','/usr/bin/chromium','/usr/bin/google-chrome'].find(p=>p&&existsSync(p))
if(!chromePath)throw Error('Set CHROME_PATH to Chrome')
const server=process.env.NG_QA_URL?null:spawn(process.execPath,['scripts/l1-entry-shrimp-server.mjs',String(serverPort),profile,'after'],{cwd:process.cwd(),windowsHide:true,stdio:'ignore'})
mkdirSync(out, { recursive: true })
const VIEWS = {
  under: ['/proto-nguithr.html?mode=under&cpu=0', 1280, 900],
  'under-real': ['/proto-nguithr.html?mode=under&cpu=0&real=1', 1280, 900],
  side: ['/proto-nguithr.html?mode=side&cpu=0', 1280, 720],
  front: ['/proto-nguithr.html?mode=front&cpu=0', 1280, 900],
  'front-real': ['/proto-nguithr.html?mode=front&cpu=0&real=1', 1280, 900],
  nest: ['/proto-nguithr.html?mode=nest&cpu=0', 1280, 900],
  'nest-real': ['/proto-nguithr.html?mode=nest&cpu=0&real=1', 1280, 900],
  pop: ['/proto-nguithr.html?mode=pop&cpu=0', 1280, 900],
  plan: ['/proto-nguithr.html?mode=plan&cpu=0', 1280, 900],
  scales: ['/proto-nguithr.html?mode=scales&cpu=0', 1600, 800],
}
// 第 2 阶段动画关键帧：anim-<名>（proto-nguithr.html?anim=...&t=...）
const A = (q, w = 1280, h = 800) => ['/proto-nguithr.html?cpu=0&' + q, w, h]
Object.assign(VIEWS, {
  'anim-idle-under': A('anim=idle&t=3', 1280, 900),
  'anim-idle-side': A('anim=idle&t=3&view=wide'),
  'anim-cut-reach': A('anim=cut&t=2.3', 1280, 900),
  'anim-cut-pop': A('anim=cut&t=3.1&view=wide'),
  'anim-descend-hang': A('anim=descend&t=2.4&view=follow&cam=1.6,0.2,1.4'),
  'anim-descend-mid': A('anim=descend&t=3.8&view=follow&cam=0.2,0.3,2.3'),
  'anim-descend-wide': A('anim=descend&t=3.8'),
  'anim-descend-land': A('anim=descend&t=5.6&view=follow&cam=0.3,0.25,2.2'),
  'anim-crawl-side-a': A('anim=crawl&t=3'),
  'anim-crawl-side-b': A('anim=crawl&t=3.45'),
  'anim-crawl-turn': A('anim=crawl&t=6.2&view=top', 1280, 900),
  'anim-feed': A('anim=feed&t=2.1&view=front3q'),
  'anim-climb-mid': A('anim=climb&t=3.6&view=follow&cam=2.4,0.1,2.2'),
  'anim-sleep': A('anim=sleep&t=3', 1280, 900),
  'anim-sleep-side': A('anim=sleep&t=3&view=wide'),
  'anim-cower': A('anim=cower&t=1.6', 1280, 900),
  'anim-cower-side': A('anim=cower&t=1.6&view=wide'),
  'anim-dead': A('anim=dead&t=3.6&view=front3q'),
  'anim-spray': A('anim=spray&t=1.7&view=front3q'),
  'anim-spray-side': A('anim=spray&t=1.7'),
})
// 序列帧：frames:<anim>:<view>:<t0>:<t1>:<步长>[:<宽>x<高>] → reports/nguithr/frames/<anim>-<view>-NNN.png（同一页面内 __render(t) 重渲）
const want = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(VIEWS)
const prefix = process.env.NG_SHOT_PREFIX ?? ''
const chrome = spawn(chromePath, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, '--enable-automation', '--no-first-run', '--no-default-browser-check', 'about:blank'], { stdio: 'ignore',windowsHide:true })
const errors = [], results = {}
try {
  let page
  for (let i = 0; i < 60 && !page; i++) { await new Promise((r) => setTimeout(r, 250)); try { page = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find((p) => p.type === 'page') } catch { /* 等浏览器起来 */ } }
  if (!page) throw Error('QA 浏览器未启动')
  const ws = new WebSocket(page.webSocketDebuggerUrl); await new Promise((r) => ws.addEventListener('open', r, { once: true }))
  let seq = 0; const pending = new Map()
  ws.addEventListener('message', (e) => { const r = JSON.parse(e.data); if (r.method === 'Runtime.exceptionThrown') errors.push(r.params.exceptionDetails); if (r.method === 'Runtime.consoleAPICalled' && r.params.type === 'error') errors.push(r.params.args?.map((a) => a.value ?? a.description).join(' ')); const p = pending.get(r.id); if (p) { pending.delete(r.id); r.error ? p.reject(r.error) : p.resolve(r.result) } })
  const send = (method, params = {}) => new Promise((resolve, reject) => { const id = ++seq; pending.set(id, { resolve, reject }); ws.send(JSON.stringify({ id, method, params })) })
  const ev = async (expression) => { const r = await send('Runtime.evaluate', { expression, returnByValue: true }); return r.result?.value }
  await send('Runtime.enable'); await send('Page.enable')
  const ver = await send('Browser.getVersion'), cl = await send('Browser.getBrowserCommandLine')
  if (!ver.userAgent.includes('HeadlessChrome') || !cl.arguments.includes('--headless=new')||!cl.arguments.includes('--user-data-dir='+profile)||!cl.arguments.includes('--remote-debugging-port='+port)) throw Error('不是本脚本的无头 QA 浏览器')
  for(let i=0;i<120;i++){try{if((await fetch(base)).ok)break}catch{}await new Promise(r=>setTimeout(r,200))}
  for (const name of want) {
    if (name.startsWith('frames:')) {
      const [, an, vw, a, b, st, wh] = name.split(':'); const [fw, fh] = (wh ?? '960x600').split('x').map(Number)
      const path = `/proto-nguithr.html?cpu=0&anim=${an}&view=${vw}&t=${a}`
      await send('Emulation.setDeviceMetricsOverride', { width: fw, height: fh, deviceScaleFactor: 1, mobile: false })
      await send('Page.navigate', { url: base + path })
      let ok = false
      for (let i = 0; i < 300 && !ok; i++) { await new Promise((r) => setTimeout(r, 200)); ok = !!(await ev(`location.href===${JSON.stringify(base + path)} && window.__ready===true`)) }
      mkdirSync(out + 'frames', { recursive: true })
      let n = 0
      for (let t = +a; t <= +b + 1e-6; t += +st, n++) {
        await ev(`window.__render(${t.toFixed(4)}), true`)
        writeFileSync(`${out}frames/${an}-${vw}-${String(n).padStart(3, '0')}.png`, Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).data, 'base64'))
      }
      results[name] = { ready: ok, frames: n }; console.log(name, n)
      continue
    }
    const [path, w, h] = VIEWS[name]
    await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false })
    await send('Page.navigate', { url: base + path })
    let ok = false
    for (let i = 0; i < 300 && !ok; i++) { await new Promise((r) => setTimeout(r, 200)); ok = !!(await ev(`location.href===${JSON.stringify(base + path)} && window.__ready===true`)) } // 必须确认已是新页面，否则会读到上一页的就绪标记
    if(!ok)throw Error('Prototype did not become ready: '+name)
    await new Promise((r) => setTimeout(r, 400))
    const gpu=await ev(`(()=>{const g=document.querySelector('canvas').getContext('webgl2'),e=g.getExtension('WEBGL_debug_renderer_info');return e?g.getParameter(e.UNMASKED_RENDERER_WEBGL):''})()`);if(!gpu||/swiftshader|software|llvmpipe/i.test(gpu))throw Error('Native GPU required')
    results[name] = { ready: ok,gpu, retries: await ev('window.__retries'), budget: await ev('window.__budget'), nest: await ev('window.__nest') }
    writeFileSync(out + prefix + name + '.png', Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).data, 'base64'))
    console.log(name, JSON.stringify(results[name]))
  }
  await send('Browser.close').catch(() => {})
  ws.close()
} finally {
  writeFileSync(out + prefix + 'verify-result.json', JSON.stringify({ results, errors }, null, 2) + '\n')
  try { chrome.kill('SIGKILL') } catch { /* 已退出 */ }
  server?.kill();await new Promise(r=>setTimeout(r,400));if(path.resolve(profile).startsWith(path.resolve('.cache')+path.sep))rmSync(profile,{recursive:true,force:true,maxRetries:8,retryDelay:300})
  if (errors.length){console.log('浏览器错误：', JSON.stringify(errors).slice(0, 2000));process.exitCode=1}
}
