// [beast] 第五层的野兽（Entity 18）截图验收：node scripts/verify-beast.mjs [视图... | anim | gif]；输出 reports/beast/*.png + stage1.jpg（汇总，B_SHEET 改名）。
// 阶段 2：anim-<clip> / gif-<clip>（见下）；GIF / 逐帧汇总由 scripts/beast-gif.py 合成。
// 端口 3502（vite）/ 9502（chromium 调试），同时只开一个浏览器（脚本结束 SIGKILL 自己起的那个，不 pkill 别人的）。
// 默认 ?cpu=1（无头 SwiftShader 不能画 GPU 蒙皮）。B_Q 追加查询参数；B_RAW='名字=查询串;…' 追加任意单张（B_RW / B_RH 尺寸）。
// 字体丢失：cp /workspace/work/fonts/* ~/.fonts && fc-cache
import { spawn, spawnSync } from 'node:child_process'
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs'
const port = '9502', out = 'reports/beast/', base = 'http://127.0.0.1:3502'
const REF = '/workspace/projects/e0cd64b2-425c-4ea5-8bdb-bc0f453e036c/files/uploads/89992-5367f0f4f207.png'
mkdirSync(out, { recursive: true })
const EXTRA = process.env.B_Q ? '&' + process.env.B_Q : ''
const P = (q, w = 1100, h = 1000) => ['/proto-beast.html?cpu=1&' + q + EXTRA, w, h]
const VIEWS = {
  three: P('view=three'), front: P('view=front'), side: P('view=side'), back: P('view=back'),
  head: P('view=head', 1000, 900), headq: P('view=headq', 1000, 900), headside: P('view=headside', 1000, 900), headback: P('view=headback', 1000, 900),
  tentacles: P('view=tentacles', 1000, 900), tentlow: P('view=tentacles&cam=0.32,1.5,0.95&at=0,1.43,0.08&fov=34&label=tentacles2', 1000, 1000), hands: P('view=hands', 1000, 900), true: P('view=true', 1300, 1000), truehead: P('view=truehead', 1000, 900), trueside: P('view=trueside', 1300, 1000),
  props: P('view=props', 1000, 1000), portrait: P('view=portrait', 1300, 900), lod1: P('view=lod1'), lod1head: P('view=headq&lod=1', 1000, 900),
  moody: P('view=moody', 683, 1024),
  torso: P('view=front&cam=0.25,1.3,0.9&at=0,1.25,0.05&fov=40&label=torso', 1000, 1000),
}
// 阶段 2：anim-<clip> 8 帧网格（4×2，标时间）；gif-<clip> 按 10 fps 全帧（每格 B_TILE=320²，GIF / 逐帧汇总切帧用）。参数 B_AQ 追加到动画视图
const CLIPS = ['idle', 'seatedIdle', 'talk', 'beckon', 'handshake', 'pourTea', 'signContract', 'peripheralStill', 'vanish', 'portraitGaze', 'doubtFreeze', 'reveal', 'tentacleGrab', 'colorFlash']
const DUR = { idle: 6, seatedIdle: 6, talk: 4, beckon: 2.6, handshake: 3.6, pourTea: 7, signContract: 6.4, peripheralStill: 4, vanish: 2.4, portraitGaze: 6, doubtFreeze: 4.4, reveal: 3.6, tentacleGrab: 3.6, colorFlash: 2.4 }
const AQ = process.env.B_AQ ? '&' + process.env.B_AQ : ''
for (const c of CLIPS) {
  VIEWS['anim-' + c] = P('anim=1&clip=' + c + '&grid=8&cols=4' + AQ, 1600, 900)
  const fps = Number(process.env.B_FPS ?? 10), tile = Number(process.env.B_TILE ?? 320), n = Math.max(1, Math.round(DUR[c] * fps)), cols = Math.min(n, 10), rows = Math.ceil(n / cols)
  VIEWS['gif-' + c] = P(`anim=1&clip=${c}&gif=1&fps=${fps}&tile=${tile}` + AQ, cols * tile, rows * tile)
}
for (const r of (process.env.B_RAW ?? '').split(';').filter(Boolean)) { const [k] = r.split('='); VIEWS[k] = P(r.slice(k.length + 1), Number(process.env.B_RW ?? 1000), Number(process.env.B_RH ?? 1000)) }
const want = process.argv.slice(2).length ? process.argv.slice(2).flatMap((a) => a === 'anim' ? CLIPS.map((c) => 'anim-' + c) : a === 'gif' ? CLIPS.map((c) => 'gif-' + c) : [a]) : Object.keys(VIEWS).filter((k) => !/^(anim|gif)-/.test(k))
const results = {}
const up = async () => { try { return (await fetch(base + '/proto-beast.html')).ok } catch { return false } }
if (!(await up())) { spawn('npx', ['vite', '--port', '3502', '--strictPort', '--host', '127.0.0.1'], { stdio: 'ignore', detached: true }).unref(); for (let i = 0; i < 120 && !(await up()); i++) await new Promise((r) => setTimeout(r, 500)) }
const chrome = spawn('/workspace/work/.pw-libs/chromium.sh', ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${process.cwd()}/.cache/beast-qa`, '--no-first-run', '--no-sandbox', '--enable-unsafe-swiftshader', '--use-angle=swiftshader', 'about:blank'], { stdio: 'ignore' })
for (const sig of ['SIGTERM', 'SIGINT']) process.on(sig, () => { try { chrome.kill('SIGKILL') } catch {} process.exit(1) }) // 超时被杀时也收掉自己起的浏览器
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
    const ws2 = JSON.stringify(new URL(base + path).search)
    let ok = false
    // 视口覆盖生效前就建好画布会截到错尺寸（右 / 下黑边）：先到空白页等尺寸生效，就绪后再核对 innerWidth / innerHeight，不对就重来一次
    for (let attempt = 0; attempt < 2 && !ok; attempt++) {
      await send('Page.navigate', { url: 'about:blank' }); await new Promise((r) => setTimeout(r, 400))
      try { await ev('window.__ready=false') } catch {}
      await send('Page.navigate', { url: base + path })
      for (let i = 0; i < 1200; i++) { await new Promise((r) => setTimeout(r, 300)); try { if (await ev(`window.__ready===true && location.search===${ws2}`)) { ok = true; break } } catch {} }
      if (ok && !(await ev(`innerWidth===${w} && innerHeight===${h}`))) { console.log(name, "viewport mismatch, retry", await ev("innerWidth+\"x\"+innerHeight")); ok = false }
    }
    const info = await ev('window.__info'); results[name] = { info, ok }
    console.log(name, ok ? '' : 'TIMEOUT', JSON.stringify(info).slice(0, 400))
    writeFileSync(out + name + '.png', Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).data, 'base64'))
  }
} finally { chrome.kill('SIGKILL') }
{ const f = out + 'verify-result.json'; let old = {}; try { old = JSON.parse(readFileSync(f, 'utf8')) } catch {} writeFileSync(f, JSON.stringify({ ...old, ...results }, null, 1)) }
// 汇总：三行 4 格（全身四视角 / 头部特写 + 触须 / 真身 + 戒指 + 道具）+ 一行（moody 与附图并排、LOD1、画像）
const TOP = ['three', 'front', 'side', 'back', 'head', 'headq', 'headside', 'tentacles', 'true', 'truehead', 'hands', 'props']
const BOT = ['moody', 'lod1', 'portrait']
if ([...TOP, ...BOT].every((n) => existsSync(out + n + '.png')) && want.some((w) => TOP.includes(w) || BOT.includes(w))) {
  const font = ['-font', 'Noto-Sans-SC-Bold']
  const lab = (src, dst, text) => spawnSync('convert', [src, '-resize', 'x760', '-gravity', 'north', '-background', '#0c0b0a', ...font, '-fill', '#f3eedf', '-pointsize', '22', '-splice', '0x34', '-annotate', '+0+4', text, dst])
  lab(out + 'moody.png', out + '_moody.png', 'moody 预览（暗场青色侧光）')
  lab(REF, out + '_ref.png', 'ZAN 附图')
  const a = spawnSync('montage', [...TOP.map((n) => out + n + '.png'), '-background', '#0c0b0a', '-resize', '600x540^', '-gravity', 'center', '-extent', '600x540', '-tile', '4x3', '-geometry', '+3+3', out + '_top.png'])
  const b = spawnSync('montage', [out + '_moody.png', out + '_ref.png', out + 'lod1.png', out + 'portrait.png', '-background', '#0c0b0a', '-resize', '600x794', '-gravity', 'center', '-extent', '600x794', '-tile', '4x1', '-geometry', '+3+3', out + '_bot.png'])
  const c = spawnSync('convert', [out + '_top.png', out + '_bot.png', '-append', '-quality', '86', out + (process.env.B_SHEET ?? 'stage1.jpg')])
  console.log('sheet', a.status, b.status, c.status, String(a.stderr || '').slice(0, 300), String(c.stderr || '').slice(0, 300))
}
process.exit(0)
