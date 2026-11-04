// [concierge] 看门人（Entity 131）截图验收：node scripts/verify-concierge.mjs [视图...]；输出 reports/concierge/*.png + stage1.jpg（C_SHEET 改汇总名，C_Q 追加查询参数如 lod=1）。端口 3500，同时只开一个浏览器。默认 ?cpu=1（无头 SwiftShader 不能画 GPU 蒙皮）。
import { spawn, spawnSync } from 'node:child_process'
import { mkdirSync, writeFileSync, existsSync } from 'node:fs'
const port = '9500', out = 'reports/concierge/', base = 'http://127.0.0.1:3500'
mkdirSync(out, { recursive: true })
const EXTRA = process.env.C_Q ? '&' + process.env.C_Q : ''
const P = (q, w = 1100, h = 1000) => ['/proto-concierge.html?cpu=1&' + q + EXTRA, w, h]
const VIEWS = { three: P('view=three'), front: P('view=front'), side: P('view=side'), back: P('view=back'), head: P('view=head', 1000, 900), headside: P('view=headside', 1000, 900), headq: P('view=headq', 1000, 900), headback: P('view=headback', 1000, 900), arms: P('view=arms', 1000, 900), hands: P('view=hands', 1000, 900), legs: P('view=legs', 1000, 900), torso: P('view=torso', 1000, 900), collar: P('view=collar', 1000, 900), lod1: P('view=three&lod=1'), lod1head: P('view=headq&lod=1', 1000, 900), blink: P('view=headq&blink=1', 1000, 900), armblink: P('view=arms&blink=1', 1000, 900), fist: P('view=hands&fist=1', 1000, 900), jaw: P('view=headside&jaw=0.35', 1000, 900), jawlift: P('view=headside&jaw=0.35&headx=-0.3&label=jaw0.35+headx-0.3', 1000, 900), mouthside: P('view=headside&cam=0.62,1.7,0.2&at=0,1.68,0.06&fov=26&jaw=0.35&headx=-0.3&label=jaw0.35+headx-0.3 side', 1000, 900), mouthside0: P('view=headside&cam=0.62,1.7,0.2&at=0,1.68,0.06&fov=26&jaw=0.35&label=jaw0.35 side', 1000, 900), mouthside2: P('view=headside&cam=0.62,1.7,0.2&at=0,1.68,0.06&fov=26&jaw=0.2&label=jaw0.2 side', 1000, 900), mouthclosed: P('view=head&cam=0.25,1.72,0.5&at=0,1.69,0.12&fov=24&label=mouth closed', 1000, 900), cornerq: P('view=headq&cam=0.4,1.8,0.48&at=0.02,1.69,0.08&fov=24&label=mouth corner q', 1000, 900), jawfront: P('view=head&jaw=0.35&label=jaw0.35-front', 1000, 900), jawq: P('view=headq&jaw=0.35&label=jaw0.35-q', 1000, 900), eye: P('view=head&cam=0.34,1.9,0.33&at=0.083,1.84,0.108&fov=24&label=eye', 1000, 900), eyefront: P('view=head&cam=0.02,1.87,0.62&at=0.07,1.84,0.09&fov=18&label=eyefront', 1000, 900), eyetop: P('view=head&cam=0.25,2.15,0.25&at=0.08,1.84,0.1&fov=22&label=eyetop', 1000, 900), ear: P('view=head&cam=0.16,1.98,0.5&at=0.17,1.93,0.07&fov=26&label=ear', 1000, 900), eyeblink: P('view=head&cam=0.34,1.9,0.33&at=0.083,1.84,0.108&fov=24&blink=1&label=eyeblink', 1000, 900), top: P('view=head&cam=0.1,2.35,0.25&at=0,1.9,0.02&fov=30&label=top', 1000, 900), jawhalf: P('view=headside&jaw=0.2&label=jaw0.2', 1000, 900), mouth: P('view=head&cam=0.2,1.6,0.56&at=0,1.69,0.16&fov=26&label=mouth', 1000, 900), mouthopen: P('view=head&cam=0.2,1.6,0.56&at=0,1.69,0.16&fov=26&jaw=0.35&label=mouthopen', 1000, 900), desk: P('view=desk', 1300, 1000), scene: P('view=scene', 1300, 1000) }
// 阶段 2：anim-<clip> 8 帧网格（4×2）；gif-<clip> 按 10 fps 全帧（每格 300²，GIF 切帧用）；walk-<clip> 根位移前进的侧面全帧；
//   raw 视图：C_RAW='名字=查询串' 追加任意单张（如 C_RAW='p1=anim=1&clip=phone&t=2'）
const CLIPS = ['idle', 'phone', 'giveKey', 'walk', 'run', 'armWatch', 'blinkTeleport', 'talk', 'trip', 'bind', 'drag', 'stuffLift', 'pullRope', 'wipeHands', 'teaBreak', 'gnawMetal']
const DUR = { idle: 6, phone: 6.4, giveKey: 4.6, walk: 0.92, run: 0.6, armWatch: 3.4, blinkTeleport: 1.6, talk: 3.2, trip: 4.4, bind: 4.2, drag: 1.4, stuffLift: 3.6, pullRope: 1.4, wipeHands: 3.2, teaBreak: 6, gnawMetal: 1.6 }
const AQ = process.env.C_AQ ? '&' + process.env.C_AQ : ''
for (const c of CLIPS) {
  VIEWS['anim-' + c] = P('anim=1&clip=' + c + '&grid=8&cols=4' + AQ, 1600, 900)
  const fps = Number(process.env.C_FPS ?? 10), tile = Number(process.env.C_TILE ?? 300), n = Math.max(1, Math.round(DUR[c] * fps)), cols = Math.min(n, 10), rows = Math.ceil(n / cols)
  VIEWS['gif-' + c] = P(`anim=1&clip=${c}&gif=1&fps=${fps}&tile=${tile}` + AQ, cols * tile, rows * tile)
}
for (const c of ['walk', 'run', 'drag']) { const fps = 20, n = Math.round(DUR[c] * 2 * fps), cols = 10, rows = Math.ceil(n / cols); VIEWS['walk-' + c] = P(`anim=1&clip=${c}&gif=1&fps=${fps}&tile=400&move=1&cycles=2&cam=4.2,1.1,0.4&at=0,1.0,0.4` + AQ, cols * 400, rows * 300) }
for (const r of (process.env.C_RAW ?? '').split(';').filter(Boolean)) { const [k, v] = r.split('='); VIEWS[k] = P(r.slice(k.length + 1), 1000, 1000) }
const SHEET = ['three', 'front', 'side', 'back', 'head', 'headq', 'headside', 'arms']
const want = process.argv.slice(2).length ? process.argv.slice(2).flatMap((a) => a === 'anim' ? CLIPS.map((c) => 'anim-' + c) : a === 'gif' ? CLIPS.map((c) => 'gif-' + c) : [a]) : Object.keys(VIEWS).filter((k) => !/^(anim|gif|walk)-/.test(k))
const results = {}
const up = async () => { try { return (await fetch(base + '/proto-concierge.html')).ok } catch { return false } }
if (!(await up())) { spawn('npx', ['vite', '--port', '3500', '--strictPort', '--host', '127.0.0.1'], { stdio: 'ignore', detached: true }).unref(); for (let i = 0; i < 120 && !(await up()); i++) await new Promise((r) => setTimeout(r, 500)) }
const chrome = spawn('/workspace/work/.pw-libs/chromium.sh', ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${process.cwd()}/.cache/concierge-qa`, '--no-first-run', '--no-sandbox', '--enable-unsafe-swiftshader', '--use-angle=swiftshader', 'about:blank'], { stdio: 'ignore' })
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
    // 先清掉旧页的就绪标记，并核对地址 —— 否则导航尚未生效时会截到上一张（v3 修复）
    try { await ev('window.__ready=false') } catch {}
    await send('Page.navigate', { url: base + path })
    const want = JSON.stringify(new URL(base + path).search)
    for (let i = 0; i < 400; i++) { await new Promise((r) => setTimeout(r, 300)); try { if (await ev(`window.__ready===true && location.search===${want}`)) break } catch {} }
    const info = await ev('window.__info'); results[name] = { info }
    console.log(name, JSON.stringify(info))
    writeFileSync(out + name + '.png', Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).data, 'base64'))
  }
} finally { chrome.kill('SIGKILL') }
{ const f = out + 'verify-result.json'; let old = {}; try { old = JSON.parse((await import('node:fs')).readFileSync(f, 'utf8')) } catch {} writeFileSync(f, JSON.stringify({ ...old, ...results }, null, 1)) }
if (!want.some((w) => /^(anim|gif|walk|c)-/.test(w)) && SHEET.every((n) => existsSync(out + n + '.png'))) {
  const r = spawnSync('montage', [...SHEET.map((n) => out + n + '.png'), '-resize', '600x560^', '-gravity', 'center', '-extent', '600x560', '-tile', '4x2', '-geometry', '+3+3', '-background', '#0c0b0a', '-quality', '86', out + (process.env.C_SHEET ?? 'stage1.jpg')])
  console.log('sheet', r.status)
}
process.exit(0)
