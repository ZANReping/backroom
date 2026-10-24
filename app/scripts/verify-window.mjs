// 窗户 Entity 2 重制：无头 Chromium 截图验收（proto-window.html）。用法：node scripts/verify-window.mjs [视图名...]
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
const port = process.env.WIN_QA_CDP ?? '9482', out = 'reports/window/'
let base = process.env.WIN_QA_URL ?? 'http://127.0.0.1:3482'
mkdirSync(out, { recursive: true })
const P = (q, w = 1280, h = 900) => ['/proto-window.html?' + q, w, h]
const VIEWS = {
  'occupied': P('mode=state&state=occupied', 1700, 820),
  'newborn': P('mode=state&state=newborn', 1700, 820),
  'dying': P('mode=state&state=dying', 1700, 820),
  'viewers': P('mode=viewers', 1700, 820),
  'arm': P('mode=arm', 1200, 900),
  'old': P('mode=old', 900, 900),
  'close-l601': P('mode=close&style=l601', 900, 900),
  'close-l2': P('mode=close&style=l2', 900, 900),
  'close-dying': P('mode=close&style=l4&state=dying', 900, 900),
}
const A = (clip, view = '', frames = 16, cols = 4, ex = '') => ['/proto-window.html?anim=1&clip=' + clip + (view ? '&view=' + view : '') + '&frames=' + frames + '&cols=' + cols + ex, cols * 400, Math.ceil(frames / cols) * 300 + 30]
for (const c of ['idle', 'lure', 'reach', 'drag', 'release', 'feed', 'newborn', 'dying', 'vanish']) VIEWS['anim-' + c] = A(c)
// GIF 用：12.5 fps
for (const [c, n] of [['idle', 75], ['lure', 30], ['reach', 8], ['drag', 32], ['release', 10], ['feed', 25], ['newborn', 40], ['dying', 50], ['vanish', 32]]) VIEWS['gif-' + c] = A(c, '', n, 8)
const want = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(VIEWS)
const up = async () => { try { return (await fetch(base + '/proto-window.html')).ok } catch { return false } }
let vite = null
if (!(await up())) {
  vite = spawn('npx', ['vite', '--port', '3482', '--strictPort', '--host', '127.0.0.1'], { stdio: 'ignore', detached: true, env: { ...process.env, L0_VERIFY: '1' } })
  for (let i = 0; i < 120 && !(await up()); i++) await new Promise((r) => setTimeout(r, 500))
}
const chrome = spawn(process.env.CHROME ?? '/workspace/work/.pw-libs/chromium.sh', ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${process.cwd()}/.cache/win-qa`, '--enable-automation', '--no-first-run', '--no-default-browser-check', '--disable-gpu-sandbox', '--no-sandbox', '--enable-unsafe-swiftshader', '--use-angle=swiftshader', 'about:blank'], { stdio: 'ignore' })
const errors = [], results = {}
try {
  let page
  for (let i = 0; i < 60 && !page; i++) { await new Promise((r) => setTimeout(r, 250)); try { page = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find((p) => p.type === 'page') } catch { /* 等浏览器起来 */ } }
  if (!page) throw Error('QA 浏览器未启动')
  const ws = new WebSocket(page.webSocketDebuggerUrl); await new Promise((r) => ws.addEventListener('open', r, { once: true }))
  let seq = 0; const pending = new Map()
  ws.addEventListener('message', (e) => { const r = JSON.parse(e.data); if (r.method === 'Runtime.exceptionThrown') { errors.push(r.params.exceptionDetails); console.log('EXC', JSON.stringify(r.params.exceptionDetails).slice(0, 800)) }; if (r.method === 'Runtime.consoleAPICalled' && r.params.type === 'error') errors.push(r.params.args?.map((a) => a.value ?? a.description).join(' ')); const p = pending.get(r.id); if (p) { pending.delete(r.id); r.error ? p.reject(r.error) : p.resolve(r.result) } })
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
    for (let i = 0; i < 500 && !ok; i++) { await new Promise((r) => setTimeout(r, 200)); ok = !!(await ev(`location.href===${JSON.stringify(base + path)} && window.__ready===true`)) }
    await new Promise((r) => setTimeout(r, 400))
    results[name] = { ready: ok, retries: await ev('window.__retries'), budget: await ev('window.__budget'), info: await ev('window.__info') }
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
