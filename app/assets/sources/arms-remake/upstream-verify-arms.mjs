// 「手臂」重制：无头 Chromium 截图验收（原型页 proto-arms.html）。
// 用法：node scripts/verify-arms.mjs [视图名...]
// 若 ARMS_QA_URL 未提供且 3377 端口无服务，本脚本自己启动 vite（--port 3377 --strictPort），结束时关闭。
// 本脚本自己启动/关闭专属 QA 浏览器（--headless=new、独立用户目录 .cache/arms-qa、调试端口 9377），不连接任何已有浏览器。
// 无头 SwiftShader 下 GPU 蒙皮会让 GPU 进程崩溃，所以所有视图都带 cpu=1（CPU 蒙皮替身，见 qaCpuSkin.ts）。
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
const port = process.env.ARMS_QA_CDP ?? '9377', out = 'reports/arms/'
let base = process.env.ARMS_QA_URL ?? 'http://127.0.0.1:3377'
mkdirSync(out, { recursive: true })
const P = (q, w = 1280, h = 900) => ['/proto-arms.html?cpu=1&' + q, w, h]
const VIEWS = {
  'under': P('mode=under'),
  'under-real': P('mode=under&real=1'),
  'side': P('mode=side', 1280, 900),
  'hand': P('mode=hand', 1280, 900),
  'hand-real': P('mode=hand&real=1', 1280, 900),
  'curl': P('mode=curl', 1500, 800),
  'grate': P('mode=grate', 1280, 900),
  'burn': P('mode=burn&burn=0.75', 1280, 900),
  'burn-real': P('mode=burn&burn=0.75&real=1', 1280, 900),
  'burn-under': P('mode=burn-under&burn=0.6'),
  'stretch': P('mode=stretch', 1100, 1000),
  'under-n1': P('mode=under&n=1&seed=5'),
  'hand-side': P('mode=hand&cam=0.85,0.2,0.2&look=0.05,-0.12,0'),
}
const want = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(VIEWS)
const up = async () => { try { return (await fetch(base + '/proto-arms.html')).ok } catch { return false } }
let vite = null
if (!(await up())) {
  vite = spawn('npx', ['vite', '--port', '3377', '--strictPort', '--host', '127.0.0.1'], { stdio: 'ignore', detached: true, env: { ...process.env, L0_VERIFY: '1' } })
  for (let i = 0; i < 120 && !(await up()); i++) await new Promise((r) => setTimeout(r, 500))
}
const chrome = spawn('chromium', ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${process.cwd()}/.cache/arms-qa`, '--enable-automation', '--no-first-run', '--no-default-browser-check', '--disable-gpu-sandbox', '--no-sandbox', '--enable-unsafe-swiftshader', '--use-angle=swiftshader', 'about:blank'], { stdio: 'ignore' })
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
  if (!ver.userAgent.includes('HeadlessChrome') || !cl.arguments.includes('--headless=new')) throw Error('不是本脚本的无头 QA 浏览器')
  for (const name of want) {
    const [path, w, h] = VIEWS[name]
    await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false })
    await send('Page.navigate', { url: base + path })
    let ok = false
    for (let i = 0; i < 300 && !ok; i++) { await new Promise((r) => setTimeout(r, 200)); ok = !!(await ev(`location.href===${JSON.stringify(base + path)} && window.__ready===true`)) }
    await new Promise((r) => setTimeout(r, 400))
    results[name] = { ready: ok, retries: await ev('window.__retries'), budget: await ev('window.__budget') }
    writeFileSync(out + name + '.png', Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).data, 'base64'))
    console.log(name, JSON.stringify(results[name]))
  }
  await send('Browser.close').catch(() => {})
  ws.close()
} finally {
  // 与上次结果合并（分批运行时保留其它视图的记录；本次运行的视图覆盖旧值、错误只记本次）
  let prev = {}
  try { if (existsSync(out + 'verify-result.json')) prev = JSON.parse(readFileSync(out + 'verify-result.json', 'utf8')).results ?? {} } catch { /* 旧文件损坏则忽略 */ }
  writeFileSync(out + 'verify-result.json', JSON.stringify({ results: { ...prev, ...results }, errors }, null, 2) + '\n')
  try { chrome.kill('SIGKILL') } catch { /* 已退出 */ }
  if (vite) { try { process.kill(-vite.pid, 'SIGTERM') } catch { /* 已退出 */ } }
  if (errors.length) console.log('浏览器错误：', JSON.stringify(errors).slice(0, 3000))
}
