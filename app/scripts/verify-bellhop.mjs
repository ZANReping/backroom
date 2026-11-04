// [bellhop] 行李员（Entity 135）截图验收：node scripts/verify-bellhop.mjs [视图...]；输出 reports/bellhop/*.png + stage1.jpg（八视角汇总）+ faces.jpg（8 张脸）。
// 端口 3501（vite）/ 9501（chromium 调试），同时只开一个浏览器。默认 ?cpu=1（无头 SwiftShader 不能画 GPU 蒙皮）。B_Q 追加查询参数；B_RAW='名字=查询串;…' 追加任意单张。
import { spawn, spawnSync } from 'node:child_process'
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs'
const port = '9501', out = 'reports/bellhop/', base = 'http://127.0.0.1:3501'
mkdirSync(out, { recursive: true })
const EXTRA = process.env.B_Q ? '&' + process.env.B_Q : ''
const P = (q, w = 1100, h = 1000) => ['/proto-bellhop.html?cpu=1&' + q + EXTRA, w, h]
const VIEWS = {
  three: P('view=three'), front: P('view=front'), side: P('view=side'), back: P('view=back'),
  head: P('view=head', 1000, 900), headq: P('view=headq', 1000, 900), headside: P('view=headside', 1000, 900), headback: P('view=headback', 1000, 900),
  hands: P('view=hands', 1000, 900), faces: P('view=faces', 1600, 1000), props: P('view=props', 1300, 1000), tea: P('view=tea', 1000, 1000), turn: P('view=turn', 1000, 900),
  torso: P('view=torso', 1000, 900), collar: P('view=collar', 1000, 900), feet: P('view=feet', 1000, 900), lod1: P('view=lod1'), lod1head: P('view=headq&lod=1', 1000, 900),
  facesq: P('view=faces&cam=0.62,1.74,0.72&at=0,1.69,0.03', 1600, 1000),
  // 8 张脸的侧视（检查喙在侧面凸出面盘、钩尖离开面盘）
  facesside: P('view=faces&cam=0.9,1.7,0.005&at=0,1.69,0.005&fov=26', 1600, 1000),
}
// 阶段 2：anim-<clip> 8 帧网格（4×2）；gif-<clip> 按 10 fps 全帧（每格 300²，GIF 切帧用）；walk-<clip> 根位移前进的侧面全帧（walk / pushCart）
const CLIPS = ['idle', 'headTurn', 'ringFriendly', 'ringAnnoyed', 'bow', 'walk', 'pushCart', 'takeItem', 'giveBack', 'tagHand', 'teaSip', 'faceShift', 'pickUp', 'stillWatch']
const DUR = { idle: 6, headTurn: 3.2, ringFriendly: 2.4, ringAnnoyed: 3.4, bow: 3, walk: 1.05, pushCart: 1.25, takeItem: 3.2, giveBack: 3.2, tagHand: 3, teaSip: 6, faceShift: 1.4, pickUp: 4.6, stillWatch: 2 }
const AQ = process.env.B_AQ ? '&' + process.env.B_AQ : ''
for (const c of CLIPS) {
  VIEWS['anim-' + c] = P('anim=1&clip=' + c + '&grid=8&cols=4' + (c === 'stillWatch' ? '&turn=2.4&tilt=0.25' : '') + AQ, 1600, 900)
  const fps = Number(process.env.B_FPS ?? 10), tile = Number(process.env.B_TILE ?? 300), n = Math.max(1, Math.round(DUR[c] * fps)), cols = Math.min(n, 10), rows = Math.ceil(n / cols)
  VIEWS['gif-' + c] = P(`anim=1&clip=${c}&gif=1&fps=${fps}&tile=${tile}` + (c === 'stillWatch' ? '&turn=2.4&tilt=0.25' : '') + AQ, cols * tile, rows * tile)
}
for (const c of ['walk', 'pushCart']) { const fps = 20, n = Math.round(DUR[c] * 2 * fps), cols = 10, rows = Math.ceil(n / cols); VIEWS['walk-' + c] = P(`anim=1&clip=${c}&gif=1&fps=${fps}&tile=400&move=1&cycles=2&cam=4.6,1.15,0.6&at=0,0.95,0.6` + AQ, cols * 400, rows * 300) }
for (const r of (process.env.B_RAW ?? '').split(';').filter(Boolean)) { const [k] = r.split('='); VIEWS[k] = P(r.slice(k.length + 1), Number(process.env.B_RW ?? 1000), Number(process.env.B_RH ?? 1000)) } // B_RW / B_RH：自定义单张尺寸
const SHEET = ['three', 'front', 'side', 'back', 'head', 'headq', 'headside', 'hands']
const want = process.argv.slice(2).length ? process.argv.slice(2).flatMap((a) => a === 'anim' ? CLIPS.map((c) => 'anim-' + c) : a === 'gif' ? CLIPS.map((c) => 'gif-' + c) : [a]) : Object.keys(VIEWS).filter((k) => !/^(anim|gif|walk)-/.test(k))
const results = {}
const up = async () => { try { return (await fetch(base + '/proto-bellhop.html')).ok } catch { return false } }
if (!(await up())) { spawn('npx', ['vite', '--port', '3501', '--strictPort', '--host', '127.0.0.1'], { stdio: 'ignore', detached: true }).unref(); for (let i = 0; i < 120 && !(await up()); i++) await new Promise((r) => setTimeout(r, 500)) }
const chrome = spawn('/workspace/work/.pw-libs/chromium.sh', ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${process.cwd()}/.cache/bellhop-qa`, '--no-first-run', '--no-sandbox', '--enable-unsafe-swiftshader', '--use-angle=swiftshader', 'about:blank'], { stdio: 'ignore' })
try {
  let page
  for (let i = 0; i < 240 && !page; i++) { await new Promise((r) => setTimeout(r, 250)); try { page = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find((p) => p.type === 'page') } catch {} }
  const ws = new WebSocket(page.webSocketDebuggerUrl); await new Promise((r) => ws.addEventListener('open', r, { once: true }))
  let seq = 0; const pending = new Map()
  ws.addEventListener('message', (e) => { const r = JSON.parse(e.data); if (r.method === 'Runtime.exceptionThrown') console.log('EXC', JSON.stringify(r.params.exceptionDetails).slice(0, 800)); if (r.method === 'Runtime.consoleAPICalled' && r.params.type === 'error') console.log('ERR', JSON.stringify(r.params.args).slice(0, 400)); const p = pending.get(r.id); if (p) { pending.delete(r.id); r.error ? p.reject(r.error) : p.resolve(r.result) } })
  const send = (method, params = {}) => new Promise((res, rej) => { const id = ++seq; pending.set(id, { resolve: res, reject: rej }); ws.send(JSON.stringify({ id, method, params })) })
  const ev = async (expression) => (await send('Runtime.evaluate', { expression, returnByValue: true })).result?.value
  await send('Runtime.enable'); await send('Page.enable')
  for (const name of want) {
    if (!VIEWS[name]) { console.log('no view', name); continue }
    const [path, w, h] = VIEWS[name]
    await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false })
    try { await ev('window.__ready=false') } catch {}
    await send('Page.navigate', { url: base + path })
    const ws2 = JSON.stringify(new URL(base + path).search)
    for (let i = 0; i < 1200; i++) { await new Promise((r) => setTimeout(r, 300)); try { if (await ev(`window.__ready===true && location.search===${ws2}`)) break } catch {} }
    const info = await ev('window.__info'); results[name] = { info }
    console.log(name, JSON.stringify(info).slice(0, 300))
    if (name === 'head') { const u = await ev('window.__hairTex && window.__hairTex()'); if (u) writeFileSync(out + 'hairtex.png', Buffer.from(u.split(',')[1], 'base64')) }
    writeFileSync(out + name + '.png', Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).data, 'base64'))
  }
} finally { chrome.kill('SIGKILL') }
{ const f = out + 'verify-result.json'; let old = {}; try { old = JSON.parse(readFileSync(f, 'utf8')) } catch {} writeFileSync(f, JSON.stringify({ ...old, ...results }, null, 1)) }
if (SHEET.every((n) => existsSync(out + n + '.png')) && want.some((w) => SHEET.includes(w))) {
  const r = spawnSync('montage', [...SHEET.map((n) => out + n + '.png'), '-resize', '600x560^', '-gravity', 'center', '-extent', '600x560', '-tile', '4x2', '-geometry', '+3+3', '-background', '#0c0b0a', '-quality', '86', out + (process.env.B_SHEET ?? 'stage1.jpg')])
  console.log('sheet', r.status)
}
if (want.includes('faces') && existsSync(out + 'faces.png')) {
  const parts = ['faces', 'facesq', 'facesside'].filter((n) => existsSync(out + n + '.png')).map((n) => out + n + '.png')
  const r = spawnSync('montage', [...parts, '-tile', '1x' + parts.length, '-geometry', '+0+4', '-background', '#0c0b0a', '-quality', '88', out + 'faces.jpg'])
  console.log('faces sheet', r.status)
}
process.exit(0)
