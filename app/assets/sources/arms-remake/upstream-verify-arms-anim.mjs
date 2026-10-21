// 「手臂」第 2 阶段：无头 Chromium 截图 / GIF 帧（不起 vite：esbuild 打成 IIFE，用 file:// 打开）。
// 用法：
//   node scripts/verify-arms-anim.mjs [视图名...]            截图到 reports/arms/<视图名>.png（不带参数 = 全部）
//   node scripts/verify-arms-anim.mjs --frames <起> <止>      导出 attack 序列 GIF 帧到 .cache/arms-gif/f####.png（10fps，帧号区间 [起, 止)）
// 本脚本自己启动/关闭专属无头浏览器（独立用户目录 .cache/arms-anim-qa、调试端口 9378），结束时 SIGKILL；所有视图带 cpu=1（CPU 蒙皮替身）。
import { spawn, execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const port = process.env.ARMS_QA_CDP ?? '9378', out = 'reports/arms/', dir = resolve('.cache/arms-anim')
mkdirSync(out, { recursive: true }); mkdirSync(dir, { recursive: true })
execFileSync('npx', ['esbuild', 'src/proto/armsProto.ts', '--bundle', '--format=iife', `--outfile=${dir}/proto.js`, '--log-level=error'], { stdio: 'inherit' })
const html = readFileSync('proto-arms.html', 'utf8').replace(/<script type="module" src="[^"]+"><\/script>/, '<script src="proto.js"></script>')
writeFileSync(`${dir}/index.html`, html)
const base = 'file://' + dir + '/index.html?' + (process.env.ARMS_GPU ? '' : 'cpu=1&') // ARMS_GPU=1：试 GPU 蒙皮（无头 SwiftShader 下 GPU 进程可能崩溃）
const A = (q, w = 1280, h = 860) => [q, w, h]
const VIEWS = {
  'anim-lurk': A('anim=lurk&t=1.0&view=under'),
  'anim-emerge-a': A('anim=emerge&t=2.6&view=under'),
  'anim-emerge-b': A('anim=emerge&t=3.3&view=side'),
  'anim-search': A('anim=search&t=2.2&view=player'),
  'anim-lunge-windup': A('anim=lunge&t=0.88&view=side'),
  'anim-lunge-strike': A('anim=lunge&t=1.24&view=side'),
  'anim-grab': A('anim=grab&t=0.9&view=close'),
  'anim-grab-side': A('anim=grab&t=0.9&view=side'),
  'anim-drag': A('anim=drag&t=2.1&view=side'),
  'anim-swallow': A('anim=swallow&t=0.8&view=side'),
  'anim-swallow-slam': A('anim=swallow&t=1.62&view=under'),
  'anim-flinch': A('anim=flinch&t=0.22&view=side'),
  'anim-burnRetreat': A('anim=burnRetreat&t=0.75&view=player'),
  'anim-burnRetreat-debris': A('anim=burnRetreat&t=2.7&view=floor'),
  'anim-spit': A('anim=spit&t=1.5&view=vent2'),
  'anim-spit-push': A('anim=spit&t=1.12&view=vent2'),
  // 第 1 阶段视图重拍（修正后的模型）
  'hand-real': A('mode=hand&real=1', 1280, 900),
  'stretch': A('mode=stretch', 1100, 1000),
  'under': A('mode=under', 1280, 900),
  'hand': A('mode=hand', 1280, 900),
}
const argv = process.argv.slice(2)
const gif = argv[0] === '--frames'
const FPS = 10
let jobs
if (gif) {
  mkdirSync('.cache/arms-gif', { recursive: true })
  const a = +argv[1], b = +argv[2]
  jobs = []
  for (let f = a; f < b; f++) jobs.push({ name: `f${String(f).padStart(4, '0')}`, q: 'anim=attack&view=side&hud=min', w: 560, h: 400, t: f / FPS, file: `.cache/arms-gif/f${String(f).padStart(4, '0')}.png` })
} else {
  const want = argv.length ? argv : Object.keys(VIEWS)
  const sfx = process.env.ARMS_GPU ? '-gpu' : ''
  jobs = want.map((name) => { const [q, w, h] = VIEWS[name]; return { name, q, w, h, file: out + name + sfx + '.png' } })
}
const chrome = spawn('chromium', ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${process.cwd()}/.cache/arms-anim-qa`, '--allow-file-access-from-files', '--enable-automation', '--no-first-run', '--no-default-browser-check', '--disable-gpu-sandbox', '--no-sandbox', '--enable-unsafe-swiftshader', '--use-angle=swiftshader', 'about:blank'], { stdio: 'ignore' })
const errors = [], results = {}
try {
  let page
  for (let i = 0; i < 60 && !page; i++) { await new Promise((r) => setTimeout(r, 250)); try { page = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find((p) => p.type === 'page') } catch { /* 等浏览器起来 */ } }
  if (!page) throw Error('QA 浏览器未启动')
  const ws = new WebSocket(page.webSocketDebuggerUrl); await new Promise((r) => ws.addEventListener('open', r, { once: true }))
  let seq = 0; const pending = new Map()
  ws.addEventListener('message', (e) => { const r = JSON.parse(e.data); if (r.method === 'Runtime.exceptionThrown') errors.push(JSON.stringify(r.params.exceptionDetails).slice(0, 600)); if (r.method === 'Runtime.consoleAPICalled' && r.params.type === 'error') errors.push(r.params.args?.map((a) => a.value ?? a.description).join(' ')); const p = pending.get(r.id); if (p) { pending.delete(r.id); r.error ? p.reject(r.error) : p.resolve(r.result) } })
  const send = (method, params = {}) => new Promise((resolve, reject) => { const id = ++seq; pending.set(id, { resolve, reject }); ws.send(JSON.stringify({ id, method, params })) })
  const ev = async (expression) => { const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); return r.result?.value }
  await send('Runtime.enable'); await send('Page.enable')
  const cl = await send('Browser.getBrowserCommandLine')
  if (!cl.arguments.includes('--headless=new')) throw Error('不是本脚本的无头 QA 浏览器')
  let loadedQ = null
  for (const j of jobs) {
    await send('Emulation.setDeviceMetricsOverride', { width: j.w, height: j.h, deviceScaleFactor: 1, mobile: false })
    if (gif) {
      if (loadedQ !== j.q) { // GIF：页面只加载一次（固定在 t=0），之后每帧调用 __render(t)
        await send('Page.navigate', { url: base + j.q + '&t=0' })
        let ok = false
        for (let i = 0; i < 300 && !ok; i++) { await new Promise((r) => setTimeout(r, 150)); ok = !!(await ev('window.__ready===true')) }
        loadedQ = j.q
      }
      await ev(`window.__render(${j.t})`)
    } else {
      const url = base + j.q
      await send('Page.navigate', { url })
      let ok = false
      for (let i = 0; i < 300 && !ok; i++) { await new Promise((r) => setTimeout(r, 150)); ok = !!(await ev(`location.href===${JSON.stringify(url)} && window.__ready===true`)) }
      await new Promise((r) => setTimeout(r, 300))
      results[j.name] = { ready: ok, retries: await ev('window.__retries'), budget: await ev('window.__budget') }
    }
    writeFileSync(j.file, Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).data, 'base64'))
    if (!gif) console.log(j.name, JSON.stringify(results[j.name]))
  }
  if (gif) console.log('帧', jobs[0]?.name, '…', jobs[jobs.length - 1]?.name)
  await send('Browser.close').catch(() => {})
  ws.close()
} finally {
  if (!gif) {
    let prev = {}
    try { if (existsSync(out + 'verify-anim-result.json')) prev = JSON.parse(readFileSync(out + 'verify-anim-result.json', 'utf8')).results ?? {} } catch { /* 忽略 */ }
    writeFileSync(out + 'verify-anim-result.json', JSON.stringify({ results: { ...prev, ...results }, errors }, null, 2) + '\n')
  }
  try { chrome.kill('SIGKILL') } catch { /* 已退出 */ }
  if (errors.length) console.log('浏览器错误：', JSON.stringify(errors).slice(0, 3000))
}
