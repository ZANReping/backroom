// [maid] 管家（Entity 111）截图验收：node scripts/verify-maid.mjs [视图...]；输出 reports/maid/*.png + stage1.jpg。端口 3499，同时只开一个浏览器。
import { spawn, spawnSync } from 'node:child_process'
import { mkdirSync, writeFileSync, existsSync } from 'node:fs'
const port = '9499', out = 'reports/maid/', base = 'http://127.0.0.1:3499'
mkdirSync(out, { recursive: true })
const P = (q, w = 1100, h = 1000) => ['/proto-maid.html?' + q, w, h]
const VIEWS = { three: P('view=three'), front: P('view=front'), side: P('view=side'), back: P('view=back'), head: P('view=head', 1000, 900), headside: P('view=headside', 1000, 900), headback: P('view=headback', 1000, 900), headq: P('view=headq', 1000, 900), cart: P('view=cart'), scene: P('view=scene', 1300, 1000) }
const CLIPS = ['idle', 'push', 'turn', 'park', 'sweep', 'wipe', 'pick', 'watch', 'greet', 'shush', 'sigh', 'approach', 'clean', 'tidy']
for (const c of CLIPS) VIEWS['anim-' + c] = P('clip=' + c + (process.env.MAID_CAM ? '&cam=' + process.env.MAID_CAM : ''), 1600, 1200)
const SHEET = ['three', 'front', 'side', 'back', 'head', 'headq', 'headside', 'headback']
const want = process.argv.slice(2).length ? process.argv.slice(2).flatMap((a) => a === 'anim' ? CLIPS.map((c) => 'anim-' + c) : [a]) : Object.keys(VIEWS).filter((k) => !k.startsWith('anim-'))
const up = async () => { try { return (await fetch(base + '/proto-maid.html')).ok } catch { return false } }
if (!(await up())) { spawn('npx', ['vite', '--port', '3499', '--strictPort', '--host', '127.0.0.1'], { stdio: 'ignore', detached: true }).unref(); for (let i = 0; i < 120 && !(await up()); i++) await new Promise((r) => setTimeout(r, 500)) }
const chrome = spawn('/workspace/work/.pw-libs/chromium.sh', ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${process.cwd()}/.cache/maid-qa`, '--no-first-run', '--no-sandbox', '--enable-unsafe-swiftshader', '--use-angle=swiftshader', 'about:blank'], { stdio: 'ignore' })
try {
  let page
  for (let i = 0; i < 80 && !page; i++) { await new Promise((r) => setTimeout(r, 250)); try { page = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find((p) => p.type === 'page') } catch {} }
  const ws = new WebSocket(page.webSocketDebuggerUrl); await new Promise((r) => ws.addEventListener('open', r, { once: true }))
  let seq = 0; const pending = new Map()
  ws.addEventListener('message', (e) => { const r = JSON.parse(e.data); if (r.method === 'Runtime.exceptionThrown') console.log('EXC', JSON.stringify(r.params.exceptionDetails).slice(0, 600)); const p = pending.get(r.id); if (p) { pending.delete(r.id); r.error ? p.reject(r.error) : p.resolve(r.result) } })
  const send = (method, params = {}) => new Promise((res, rej) => { const id = ++seq; pending.set(id, { resolve: res, reject: rej }); ws.send(JSON.stringify({ id, method, params })) })
  const ev = async (expression) => (await send('Runtime.evaluate', { expression, returnByValue: true })).result?.value
  await send('Runtime.enable'); await send('Page.enable')
  for (const name of want) {
    const [path, w, h] = VIEWS[name]
    await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false })
    await send('Page.navigate', { url: base + path })
    for (let i = 0; i < 400; i++) { await new Promise((r) => setTimeout(r, 300)); try { if (await ev('window.__ready===true')) break } catch {} }
    console.log(name, JSON.stringify(await ev('window.__info')))
    writeFileSync(out + name + '.png', Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).data, 'base64'))
  }
} finally { chrome.kill('SIGKILL') }
if (!want.some((w) => w.startsWith('anim-')) && SHEET.every((n) => existsSync(out + n + '.png'))) {
  const r = spawnSync('montage', [...SHEET.map((n) => out + n + '.png'), '-resize', '600x560^', '-gravity', 'center', '-extent', '600x560', '-tile', '4x2', '-geometry', '+3+3', '-background', '#0c0b0a', '-quality', '86', out + (process.env.MAID_SHEET ?? 'stage1.jpg')])
  console.log('sheet', r.status)
}
process.exit(0)
