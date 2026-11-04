// 物品建模补全预览截图：node scripts/verify-items-sheet.mjs [query] [out]
// 自己的 vite 端口 3511 / CDP 9504 / 浏览器目录 .cache/l5fix-qa；同时只开一个浏览器，结束时按 pid 杀（不 pkill）。
import { spawn } from 'node:child_process'
import { mkdirSync, writeFileSync, rmSync } from 'node:fs'
const port = '9511', base = 'http://127.0.0.1:3511', query = process.argv[2] ?? '', out = process.argv[3] ?? 'reports/items/items-sheet.png'
mkdirSync(out.replace(/[^/]+$/, ''), { recursive: true })
const up = async () => { try { return (await fetch(base + '/proto-l5items-fix.html')).ok } catch { return false } }
let vite = null
if (!(await up())) {
  vite = spawn('node_modules/.bin/vite', ['--port', '3511', '--strictPort', '--host', '127.0.0.1', '--force'], { stdio: 'ignore', detached: true })
  for (let i = 0; i < 160 && !(await up()); i++) await new Promise((r) => setTimeout(r, 500))
}
rmSync('.cache/l5fix-qa', { recursive: true, force: true })
const chrome = spawn('/workspace/work/.pw-libs/chromium.sh', ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${process.cwd()}/.cache/l5fix-qa`, '--no-first-run', '--no-sandbox', '--disable-gpu-sandbox', '--enable-unsafe-swiftshader', '--use-angle=swiftshader', 'about:blank'], { stdio: 'ignore' })
console.log('chrome pid', chrome.pid, 'vite pid', vite?.pid)
const errors = []
try {
  let page
  for (let i = 0; i < 80 && !page; i++) { await new Promise((r) => setTimeout(r, 250)); try { page = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find((p) => p.type === 'page') } catch { } }
  if (!page) throw Error('QA 浏览器未启动')
  const ws = new WebSocket(page.webSocketDebuggerUrl); await new Promise((r) => ws.addEventListener('open', r, { once: true }))
  let seq = 0; const pending = new Map()
  ws.addEventListener('message', (e) => { const r = JSON.parse(e.data); if (r.method === 'Runtime.exceptionThrown') errors.push(JSON.stringify(r.params.exceptionDetails).slice(0, 400)); if (r.method === 'Runtime.consoleAPICalled' && r.params.type === 'error') errors.push(r.params.args?.map((a) => a.value ?? a.description).join(' ')); const p = pending.get(r.id); if (p) { pending.delete(r.id); r.error ? p.reject(r.error) : p.resolve(r.result) } })
  const send = (method, params = {}) => new Promise((resolve, reject) => { const id = ++seq; pending.set(id, { resolve, reject }); ws.send(JSON.stringify({ id, method, params })) })
  const ev = async (expression) => (await send('Runtime.evaluate', { expression, returnByValue: true })).result?.value
  await send('Runtime.enable'); await send('Page.enable')
  await send('Emulation.setDeviceMetricsOverride', { width: 1800, height: 2400, deviceScaleFactor: 1, mobile: false })
  await send('Page.navigate', { url: `${base}/proto-l5items-fix.html${query}` })
  for (let i = 0; i < 400; i++) { if (await ev('!!window.__ready || !!window.__err')) break; await new Promise((r) => setTimeout(r, 300)) }
  const err = await ev('window.__err'); if (err) throw Error(err)
  const h = await ev('document.querySelector("canvas").height'), w = await ev('document.querySelector("canvas").width')
  await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false })
  await new Promise((r) => setTimeout(r, 600))
  const fmt = out.endsWith('.jpg') ? 'jpeg' : 'png'
  writeFileSync(out, Buffer.from((await send('Page.captureScreenshot', { format: fmt, ...(fmt === 'jpeg' ? { quality: 88 } : {}), clip: { x: 0, y: 0, width: w, height: h, scale: 1 } })).data, 'base64'))
  console.log('shot', out, w, h, 'errors', errors.length, errors.slice(0, 5))
  ws.close()
} finally {
  try { process.kill(chrome.pid, 'SIGKILL') } catch { }
  if (vite && process.env.KEEP_VITE !== '1') try { process.kill(-vite.pid, 'SIGKILL') } catch { }
}
