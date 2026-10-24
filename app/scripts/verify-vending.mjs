// 售货机 重制：无头 Chromium 截图验收（proto-vending.html）。用法：node scripts/verify-window.mjs [视图名...]
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
const port = process.env.VM_QA_CDP ?? '9493', out = 'reports/vending/'
let base = process.env.VM_QA_URL ?? 'http://127.0.0.1:3493'
mkdirSync(out, { recursive: true })
const P = (q, w = 1280, h = 900) => ['/proto-vending.html?' + q, w, h]
const VIEWS = {
  'lineup': P('mode=lineup', 1800, 900),
  'e36': P('mode=e36', 1800, 900),
  'close-normal': P('mode=close&variant=normal', 1000, 1000),
  'close-e36': P('mode=close&variant=e36', 1000, 1000),
  'products': P('mode=products', 1400, 900),
  'arm': P('mode=arm', 1200, 1000),
}
const A = (clip, frames = 16, cols = 4, ex = '') => ['/proto-vending.html?anim=1&clip=' + clip + '&frames=' + frames + '&cols=' + cols + ex, cols * 400, Math.ceil(frames / cols) * 300 + 30]
const CLIPS = ['idle', 'coil', 'jam', 'hand', 'restock', 'stand', 'crawl', 'open', 'chop', 'grab', 'stun', 'whisper']
for (const c of CLIPS) VIEWS['anim-' + c] = A(c)
for (const c of CLIPS) VIEWS['gif-' + c] = A(c, 24, 6)
VIEWS['legs-crawl'] = A('crawl', 8, 4, '&view=legs'); VIEWS['legs-crawl2'] = A('crawl', 8, 4, '&view=legs2'); VIEWS['legs-stand'] = A('stand', 8, 4, '&view=legs')
VIEWS['corpse-face'] = A('whisper', 4, 2, '&view=corpse2')
VIEWS['cut-coil'] = A('coil', 8, 4, '&view=cut&slot=1'); VIEWS['gif-cut'] = A('coil', 24, 6, '&view=cut&slot=1'); VIEWS['gif-coil1'] = A('coil', 24, 6, '&slot=1'); VIEWS['gif-hand1'] = A('hand', 24, 6, '&slot=1')
const U = (qs, w = 1280, h = 720) => ['/proto-vending-ui.html?' + qs, w, h]
Object.assign(VIEWS, {
  'ui-idle': U('variant=normal'), 'ui-drop': U('variant=normal&press=A2&t=1.15'), 'ui-bin': U('variant=normal&press=A2&t=2.2'),
  'ui-jam': U('variant=normal&press=B3&jam=1&t=2'), 'ui-tape': U('variant=normal&tape=1'),
  'ui-e36': U('variant=e36'), 'ui-e36-hand': U('variant=e36&press=A3&t=1.3&cry=1'), 'ui-e36-bin': U('variant=e36&press=A3&t=2.6&cry=1'),
  'ui-mobile': U('variant=normal&press=A2&t=2.2', 420, 860),
})
const want = process.argv.slice(2).length ? process.argv.slice(2).flatMap((a) => a.endsWith('*') ? Object.keys(VIEWS).filter((k) => k.startsWith(a.slice(0, -1))) : [a]) : Object.keys(VIEWS)
const up = async () => { try { return (await fetch(base + '/proto-vending.html')).ok } catch { return false } }
let vite = null
if (!(await up())) {
  vite = spawn('npx', ['vite', '--port', '3493', '--strictPort', '--host', '127.0.0.1'], { stdio: 'ignore', detached: true, env: { ...process.env, L0_VERIFY: '1' } })
  for (let i = 0; i < 120 && !(await up()); i++) await new Promise((r) => setTimeout(r, 500))
}
const chrome = spawn(process.env.CHROME ?? '/workspace/work/.pw-libs/chromium.sh', ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${process.cwd()}/.cache/vm-qa`, '--enable-automation', '--no-first-run', '--no-default-browser-check', '--disable-gpu-sandbox', '--no-sandbox', '--enable-unsafe-swiftshader', '--use-angle=swiftshader', 'about:blank'], { stdio: 'ignore' })
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
