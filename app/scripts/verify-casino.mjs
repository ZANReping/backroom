// [casino] Level 5.1 阶段 1 截图：node scripts/verify-casino.mjs [视图...] | sheet
//   输出 reports/casino/*.png；sheet → stage1.jpg（9 格中文标注）、stage1-compare.jpg（与 ref5–ref8 并排）。
//   端口 3508（vite）/ 9508（chromium 调试），只开一个浏览器，结束时按 pid SIGKILL 自己起的那个。默认 ?cpu=1。
import { spawn, spawnSync } from 'node:child_process'
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs'
const port = '9508', out = 'reports/casino/', base = 'http://127.0.0.1:3508', REF = '/workspace/work/casino/ref/'
mkdirSync(out, { recursive: true })
const P = (q, w = 960, h = 640) => ['/proto-casino.html?cpu=1&nolab=1&' + q, w, h]
const VIEWS = { marquee: P('view=marquee'), foyer: P('view=foyer'), slots: P('view=slots'), tables: P('view=tables'), roulette: P('view=roulette'), bar: P('view=bar'), vip: P('view=vip'), pbr: P('view=pbr'), chips: P('view=chips'), hall: P('view=hall'), marqueeoff: P('view=marqueeoff') }
const args = process.argv.slice(2), want = args.filter((a) => a !== 'sheet'), results = {}
if (want.length) {
  const up = async () => { try { return (await fetch(base + '/proto-casino.html')).ok } catch { return false } }
  let vite = null
  if (!(await up())) { vite = spawn('node_modules/.bin/vite', ['--port', '3508', '--strictPort', '--host', '127.0.0.1'], { stdio: 'ignore', detached: true }); vite.unref(); for (let i = 0; i < 160 && !(await up()); i++) await new Promise((r) => setTimeout(r, 500)) }
  const chrome = spawn('/workspace/work/.pw-libs/chromium.sh', ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${process.cwd()}/.cache/casino-qa`, '--no-first-run', '--no-sandbox', '--enable-unsafe-swiftshader', '--use-angle=swiftshader', 'about:blank'], { stdio: 'ignore' })
  console.log('pids chrome', chrome.pid, 'vite', vite?.pid)
  for (const sig of ['SIGTERM', 'SIGINT']) process.on(sig, () => { try { chrome.kill('SIGKILL') } catch {} process.exit(1) })
  const deadline = Date.now() + Number(process.env.C_BUDGET ?? 600) * 1000
  try {
    let page
    for (let i = 0; i < 240 && !page; i++) { await new Promise((r) => setTimeout(r, 250)); try { page = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find((p) => p.type === 'page') } catch {} }
    const ws = new WebSocket(page.webSocketDebuggerUrl); await new Promise((r) => ws.addEventListener('open', r, { once: true }))
    let seq = 0; const pending = new Map()
    ws.addEventListener('message', (e) => { const r = JSON.parse(e.data); if (r.method === 'Runtime.exceptionThrown') console.log('EXC', JSON.stringify(r.params.exceptionDetails).slice(0, 700)); if (r.method === 'Runtime.consoleAPICalled' && r.params.type === 'error') console.log('ERR', JSON.stringify(r.params.args).slice(0, 400)); const p = pending.get(r.id); if (p) { pending.delete(r.id); r.error ? p.reject(r.error) : p.resolve(r.result) } })
    const send = (method, params = {}) => new Promise((res, rej) => { const id = ++seq; pending.set(id, { resolve: res, reject: rej }); ws.send(JSON.stringify({ id, method, params })) })
    const ev = async (expression) => (await send('Runtime.evaluate', { expression, returnByValue: true })).result?.value
    await send('Runtime.enable'); await send('Page.enable')
    for (const name of want) {
      if (!VIEWS[name] || Date.now() > deadline) { console.log('skip', name); continue }
      const [path, w, h] = VIEWS[name]
      await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false })
      const s2 = JSON.stringify(new URL(base + path).search)
      await send('Page.navigate', { url: 'about:blank' }); await new Promise((r) => setTimeout(r, 300))
      await send('Page.navigate', { url: base + path })
      let ok = false
      while (Date.now() < deadline + 8000) { await new Promise((r) => setTimeout(r, 400)); try { if (await ev(`window.__ready===true && location.search===${s2}`)) { ok = true; break } } catch {} }
      const info = await ev('window.__info'); results[name] = { info, ok }
      console.log(name, ok ? '' : 'TIMEOUT', JSON.stringify(info)?.slice(0, 300))
      if (ok) writeFileSync(out + name + '.png', Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).data, 'base64'))
    }
  } finally { chrome.kill('SIGKILL') }
  const f = out + 'verify-result.json'; let old = {}; try { old = JSON.parse(readFileSync(f, 'utf8')) } catch {} writeFileSync(f, JSON.stringify({ ...old, ...results }, null, 1))
}
if (args.includes('sheet')) {
  const font = ['-font', '/workspace/work/fonts/NotoSansSC-Bold.otf']
  const tile = (src, dst, label, w = 640, h = 427) => spawnSync('convert', [src, '-resize', `${w}x${h}^`, '-gravity', 'center', '-extent', `${w}x${h}`, '-gravity', 'south', '-background', '#120806', '-splice', '0x40', ...font, '-fill', '#f3e6c8', '-pointsize', '22', '-annotate', '+0+7', label, dst])
  const R = (() => { try { return JSON.parse(readFileSync(out + 'verify-result.json', 'utf8')) } catch { return {} } })()
  const hi = R.hall?.info ?? R.foyer?.info ?? {}
  const cells = [['hall', '全景：52×36 m 加密布局 · 分区地毯'], ['marquee', 'L5 贝弗莉室墙上的 TH 跑马灯大门（营业）'], ['foyer', '前厅：红金放射纹地毯 · 包金柱环形座椅'], ['slots', '老虎机岛：屏幕彩光烘焙到地面与椅子'], ['tables', '牌桌区：每桌头顶聚光 · 绳栏灯柱'], ['bar', '环形酒吧：筒灯点阵 · 灯带 · 背光酒柜'], ['vip', '野兽 VIP 包间（绳栏 · 皮沙发）'], ['pbr', 'PBR 贴图样板（程序烘焙 23 种，含 6 套区域地毯）'], ['chips', '筹码堆特写：红 1 / 蓝 5 / 黄 10 / 绿 20']]
  const ts = []
  for (const [n, l] of cells) { if (!existsSync(out + n + '.png')) continue; const d = out + `_t_${n}.png`; tile(out + n + '.png', d, l); ts.push(d) }
  const rows = []; for (let i = 0; i < ts.length; i += 3) { const r = out + `_r${i}.png`; spawnSync('convert', [...ts.slice(i, i + 3), '+append', r]); rows.push(r) }
  spawnSync('convert', ['-size', '1920x60', 'xc:#120806', ...font, '-fill', '#f3e6c8', '-pointsize', '28', '-gravity', 'center', '-annotate', '+0+0', `Level 5.1「恐怖旅馆赌场盛大开幕」阶段 1 · 内部 id 119 · 全场 ${hi.tris ?? '?'} 三角形 / ${hi.calls ?? '?'} 次绘制`, out + '_h.png'])
  console.log('stage1', spawnSync('convert', [out + '_h.png', ...rows, '-append', '-quality', '85', out + 'stage1.jpg']).status)
  // 对比：参考图 | 我们
  const pairs = [['ref5.jpg', 'marquee', 'ref5 大门'], ['ref6.jpg', 'slots', 'ref6 老虎机区'], ['ref7.gif', 'tables', 'ref7 品红绒面 21 点'], ['ref8.jpg', 'bar', 'ref8 环形酒吧']]
  const pr = []
  for (const [r, n, l] of pairs) { if (!existsSync(out + n + '.png')) continue; const a = out + `_ca_${n}.png`, b = out + `_cb_${n}.png`; tile(REF + r + (r.endsWith('gif') ? '[0]' : ''), a, '参考 · ' + l, 720, 480); tile(out + n + '.png', b, '我们 · ' + l.split(' ')[1], 720, 480); const rr = out + `_cr_${n}.png`; spawnSync('convert', [a, b, '+append', rr]); pr.push(rr) }
  console.log('compare', spawnSync('convert', [...pr, '-append', '-quality', '84', out + 'stage1-compare.jpg']).status)
}
