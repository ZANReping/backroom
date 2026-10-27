// 猎犬（Entity 8）重制·阶段 1：无头 Chromium 截图验收（proto-hound.html）。用法：node scripts/verify-hound.mjs [视图名...]
// 输出 reports/hound/*.png、verify-result.json 与汇总图 stage1.jpg（ImageMagick）。同时只开一个浏览器；端口 3496（vite）/ 9496（CDP）。
// 猎犬皮肤 / 毛发是 SkinnedMesh：无头 SwiftShader 画 GPU 蒙皮会崩，所以所有视图都带 cpu=1（qaCpuSkin 的 CPU 替身）。
import { spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
const port = process.env.HD_QA_CDP ?? '9496', out = 'reports/hound/'
const base = process.env.HD_QA_URL ?? 'http://127.0.0.1:3496'
mkdirSync(out, { recursive: true })
const P = (q, w = 1500, h = 620) => ['/proto-hound.html?cpu=1&' + q, w, h]
const VIEWS = {
  front: P('view=front', 1800, 600),
  side: P('view=side', 1800, 1050),
  back: P('view=back', 1800, 600),
  head0: P('view=head&part=0', 760, 620),
  head1: P('view=head&part=1', 760, 620),
  headF0: P('view=head&part=0&cam=1.62,0.62,0.0&look=0.75,0.555,0', 760, 620),
  headF1: P('view=head&part=1&cam=1.62,0.62,0.0&look=0.75,0.555,0', 760, 620),
  headN: P('view=head&part=0&nohair=1', 760, 620),
  headNS: P('view=head&part=0&nohair=1&cam=0.8,0.56,1.05&look=0.8,0.52,0', 760, 620),
  eyeC: P('view=head&part=0&nohair=1&cam=0.98,0.6,0.32&look=0.72,0.56,0.03', 760, 620),
  headNF: P('view=head&part=0&nohair=1&cam=1.62,0.62,0.0&look=0.75,0.555,0', 760, 620),
  tailC: P('view=ref&cam=-0.6,0.9,-1.9&look=-1.25,0.25,0&title=' + encodeURIComponent('尾巴特写'), 1000, 640),
  backtop: P('view=ref&cam=0.3,1.3,-1.1&look=-0.05,0.72,0&title=' + encodeURIComponent('背部特写'), 1000, 640),
  backtopN: P('view=ref&nohair=1&cam=0.3,1.3,-1.1&look=-0.05,0.72,0&title=' + encodeURIComponent('背部特写·无毛'), 1000, 640),
  refN: P('view=ref&nohair=1&title=' + encodeURIComponent('去掉毛发（检查躯体）'), 1280, 768),
  ref: P('view=ref', 1280, 768),
  compare: P('view=compare', 1800, 620),
  poses: P('view=poses', 1800, 460),
  stage3: P('view=stage3', 1800, 760),
  // 阶段 3.1：扑倒挣脱进度条 HUD（第一人称压倒视角 + 真实 HoundPinBar；移动端带「挣脱」情境按钮检查不重叠）
  pinhud: ['/proto-hound-pinhud.html?cpu=1', 1280, 720],
  'pinhud-mobile': ['/proto-hound-pinhud.html?cpu=1&mobile=1&bite=0&p=0.3&left=2.6', 390, 844],
  'ref-neutral': P('view=ref&kind=neutral&title=' + encodeURIComponent('中立猎犬 3/4'), 900, 560),
  'ref-ambusher': P('view=ref&kind=ambusher&title=' + encodeURIComponent('高智能猎犬 3/4'), 900, 560),
}
// 阶段 2：每个动作一张逐帧网格（4×4，每格 640×400）
const CLIPS = ['idle', 'walk', 'stalk', 'trot', 'gallop', 'pounce', 'bite', 'howl', 'cower', 'habituate', 'sit', 'wag', 'flee', 'hit', 'death', 'pin']
for (const c of CLIPS) VIEWS['anim-' + c] = P(`anim=1&clip=${c}&grid=1&frames=16&cols=4`, 2560, 1600)
VIEWS['anim-cower-ambusher'] = P('anim=1&clip=cower&kind=ambusher&grid=1&frames=16&cols=4', 2560, 1600)
VIEWS['anim-sit-ambusher'] = P('anim=1&clip=sit&kind=ambusher&grid=1&frames=16&cols=4', 2560, 1600)
if (process.argv[2] === 'anim') process.argv.splice(2, 1, ...CLIPS.map((c) => 'anim-' + c))
let want = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(VIEWS).filter((k) => !k.startsWith('anim-'))
const up = async () => { try { return (await fetch(base + '/proto-hound.html')).ok } catch { return false } }
let vite = null
if (!(await up())) {
  vite = spawn('npx', ['vite', '--port', '3496', '--strictPort', '--host', '127.0.0.1'], { stdio: 'ignore', detached: true })
  for (let i = 0; i < 120 && !(await up()); i++) await new Promise((r) => setTimeout(r, 500))
}
const chrome = spawn(process.env.CHROME ?? '/workspace/work/.pw-libs/chromium.sh', ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${process.cwd()}/.cache/hd-qa`, '--enable-automation', '--no-first-run', '--no-default-browser-check', '--disable-gpu-sandbox', '--no-sandbox', '--enable-unsafe-swiftshader', '--use-angle=swiftshader', 'about:blank'], { stdio: 'ignore' })
console.log('chrome pid', chrome.pid, 'vite pid', vite?.pid)
const errors = [], results = {}
try {
  let page
  for (let i = 0; i < 240 && !page; i++) { await new Promise((r) => setTimeout(r, 250)); try { page = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find((p) => p.type === 'page') } catch { /* 等浏览器起来 */ } }
  if (!page) throw Error('QA 浏览器未启动')
  const ws = new WebSocket(page.webSocketDebuggerUrl); await new Promise((r) => ws.addEventListener('open', r, { once: true }))
  let seq = 0; const pending = new Map()
  ws.addEventListener('message', (e) => { const r = JSON.parse(e.data); if (r.method === 'Runtime.exceptionThrown') { errors.push(r.params.exceptionDetails); console.log('EXC', JSON.stringify(r.params.exceptionDetails).slice(0, 800)) }; if (r.method === 'Runtime.consoleAPICalled' && (r.params.type === 'error' || r.params.type === 'warning')) { const m = r.params.args?.map((a) => a.value ?? a.description).join(' '); if (r.params.type === 'error') errors.push(m); console.log(r.params.type, String(m).slice(0, 600)) }; const p = pending.get(r.id); if (p) { pending.delete(r.id); r.error ? p.reject(r.error) : p.resolve(r.result) } })
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
    for (let i = 0; i < 600 && !ok; i++) { await new Promise((r) => setTimeout(r, 200)); ok = !!(await ev(`location.href===${JSON.stringify(base + path)} && window.__ready===true`)) }
    await new Promise((r) => setTimeout(r, 300))
    results[name] = { ready: ok, info: await ev('window.__info') }
    writeFileSync(out + name + '.png', Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).data, 'base64'))
    console.log(name, JSON.stringify(results[name]))
  }
  await send('Browser.close').catch(() => {})
  ws.close()
} finally {
  let prev = {}
  try { if (existsSync(out + 'verify-result.json')) prev = JSON.parse(readFileSync(out + 'verify-result.json', 'utf8')).results ?? {} } catch { /* 忽略 */ }
  writeFileSync(out + 'verify-result.json', JSON.stringify({ results: { ...prev, ...results }, errors }, null, 2) + '\n')
  try { process.kill(chrome.pid, 'SIGTERM') } catch { /* 已退出 */ }
  if (vite) try { process.kill(-vite.pid, 'SIGTERM') } catch { /* 已退出 */ }
}
// 汇总图：参考图 + 3/4、三形态正 / 侧 / 背、头部特写四格、新旧对比
const have = (n) => existsSync(out + n + '.png')
if (['ref', 'front', 'side', 'back', 'head0', 'head1', 'headF0', 'headF1', 'compare'].every(have)) {
  const ref = process.env.HD_REF ?? '../../../projects/e0cd64b2-425c-4ea5-8bdb-bc0f453e036c/files/uploads/image-0a5c802a2a74.webp'
  const im = (args) => { const r = spawnSync('convert', args, { stdio: 'inherit' }); if (r.status) throw Error('convert 失败 ' + args.join(' ')) }
  const row1 = out + '.row1.png', row4 = out + '.row4.png'
  im([existsSync(ref) ? ref : '-size', ...(existsSync(ref) ? [] : ['1280x768', 'xc:#333']), '-resize', 'x620', out + 'ref.png', '-resize', 'x620', '+append', '-resize', '1800x', row1])
  im([out + 'head0.png', out + 'head1.png', out + 'headF0.png', out + 'headF1.png', '-resize', 'x420', '+append', '-resize', '1800x', row4])
  im([row1, out + 'side.png', out + 'front.png', out + 'back.png', row4, out + 'compare.png', '-resize', '1800x', '-background', '#222', '-gravity', 'center', '-append', '-quality', '86', out + (process.env.HD_SHEET ?? 'stage1.jpg')])
  console.log('sheet', out + (process.env.HD_SHEET ?? 'stage1.jpg'))
}
