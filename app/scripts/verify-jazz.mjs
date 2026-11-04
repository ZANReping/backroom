// [jazz] 爵士脑（Entity 197）阶段 1 截图验收：node scripts/verify-jazz.mjs [视图...] | sheet
//   输出 reports/jazz/*.png；`sheet` 只拼图：stage1.jpg（四人合影 + 每人正 / 侧 / 背 / ¾ + 道具 / 老人手 / LOD）、
//   stage1-compare.jpg（附图 | 头儿 | 萨克斯 同构图）、heads.jpg（四个头特写：正 / ¾）。
// 端口 3507（vite）/ 9507（chromium 调试），同时只开一个浏览器（脚本结束 SIGKILL 自己起的那个，不 pkill 别人的）。默认 ?cpu=1。
// 字体丢失：mkdir -p ~/.fonts && cp /workspace/work/fonts/* ~/.fonts && fc-cache -f
import { spawn, spawnSync } from 'node:child_process'
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs'
const port = '9507', out = 'reports/jazz/', base = 'http://127.0.0.1:3507'
const REF = '/workspace/work/jazz/ref.png'
mkdirSync(out, { recursive: true })
const EXTRA = process.env.J_Q ? '&' + process.env.J_Q : ''
const P = (q, w = 900, h = 900) => ['/proto-jazz.html?cpu=1&' + q + EXTRA, w, h]
const WHO = ['leader', 'sax', 'bass', 'drum']
const VIEWS = { all: P('who=all&view=front', 1800, 1000), props: P('view=props', 1000, 900), hands: P('who=leader&view=hands', 900, 900), lod1: P('who=bass&view=lod1', 700, 1000), lod2: P('who=bass&view=lod2', 700, 1000) }
for (const w of WHO) {
  for (const v of ['front', 'side', 'back', 'three']) VIEWS[`${w}-${v}`] = P(`who=${w}&view=${v}`, 700, 1000)
  for (const v of ['head', 'headq', 'headside', 'play', 'rigtest']) VIEWS[`${w}-${v}`] = P(`who=${w}&view=${v}`, v === 'play' ? 700 : 900, v === 'play' ? 1000 : 900)
  VIEWS[`${w}-ref`] = P(`who=${w}&view=ref${w === 'leader' ? '' : '&pose=rest'}`, 900, 900)
  VIEWS[`${w}-near`] = P(`who=${w}&view=ref&pose=rest`, 900, 900)
}
for (const r of (process.env.J_RAW ?? '').split(';').filter(Boolean)) { const [k] = r.split('='); VIEWS[k] = P(r.slice(k.length + 1), Number(process.env.J_RW ?? 900), Number(process.env.J_RH ?? 900)) }
const args = process.argv.slice(2)
const want = args.filter((a) => a !== 'sheet')
const results = {}
if (want.length) {
  const up = async () => { try { return (await fetch(base + '/proto-jazz.html')).ok } catch { return false } }
  if (!(await up())) { spawn('node_modules/.bin/vite', ['--port', '3507', '--strictPort', '--host', '127.0.0.1'], { stdio: 'ignore', detached: true }).unref(); for (let i = 0; i < 160 && !(await up()); i++) await new Promise((r) => setTimeout(r, 500)) }
  const chrome = spawn('/workspace/work/.pw-libs/chromium.sh', ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${process.cwd()}/.cache/jazz-qa`, '--no-first-run', '--no-sandbox', '--enable-unsafe-swiftshader', '--use-angle=swiftshader', 'about:blank'], { stdio: 'ignore' })
  for (const sig of ['SIGTERM', 'SIGINT']) process.on(sig, () => { try { chrome.kill('SIGKILL') } catch {} process.exit(1) })
  const deadline = Date.now() + Number(process.env.J_BUDGET ?? 100) * 1000
  try {
    let page
    for (let i = 0; i < 240 && !page; i++) { await new Promise((r) => setTimeout(r, 250)); try { page = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find((p) => p.type === 'page') } catch {} }
    const ws = new WebSocket(page.webSocketDebuggerUrl); await new Promise((r) => ws.addEventListener('open', r, { once: true }))
    let seq = 0; const pending = new Map()
    ws.addEventListener('message', (e) => { const r = JSON.parse(e.data); if (r.method === 'Runtime.exceptionThrown') console.log('EXC', JSON.stringify(r.params.exceptionDetails).slice(0, 900)); if (r.method === 'Runtime.consoleAPICalled' && r.params.type === 'error') console.log('ERR', JSON.stringify(r.params.args).slice(0, 500)); const p = pending.get(r.id); if (p) { pending.delete(r.id); r.error ? p.reject(r.error) : p.resolve(r.result) } })
    const send = (method, params = {}) => new Promise((res, rej) => { const id = ++seq; pending.set(id, { resolve: res, reject: rej }); ws.send(JSON.stringify({ id, method, params })) })
    const ev = async (expression) => (await send('Runtime.evaluate', { expression, returnByValue: true })).result?.value
    await send('Runtime.enable'); await send('Page.enable')
    for (const name of want) {
      if (!VIEWS[name]) { console.log('no view', name); continue }
      if (Date.now() > deadline) { console.log('BUDGET skip', name); continue }
      const [path, w, h] = VIEWS[name]
      await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false })
      const ws2 = JSON.stringify(new URL(base + path).search)
      await send('Page.navigate', { url: 'about:blank' }); await new Promise((r) => setTimeout(r, 300))
      await send('Page.navigate', { url: base + path })
      let ok = false
      while (Date.now() < deadline + 8000) { await new Promise((r) => setTimeout(r, 300)); try { if (await ev(`window.__ready===true && location.search===${ws2}`)) { ok = true; break } } catch {} }
      const info = await ev('window.__info'); results[name] = { info, ok }
      console.log(name, ok ? '' : 'TIMEOUT', JSON.stringify(info, (k, v) => (k === 'stats' ? undefined : v)))
      if (ok) writeFileSync(out + name + '.png', Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).data, 'base64'))
    }
  } finally { chrome.kill('SIGKILL') }
  const f = out + 'verify-result.json'; let old = {}; try { old = JSON.parse(readFileSync(f, 'utf8')) } catch {} writeFileSync(f, JSON.stringify({ ...old, ...results }, null, 1))
}
if (args.includes('sheet')) {
  const font = ['-font', '/workspace/work/fonts/NotoSansSC-Bold.otf']
  const R = (() => { try { return JSON.parse(readFileSync(out + 'verify-result.json', 'utf8')) } catch { return {} } })()
  const ZH = { leader: '头儿 · 小号头', sax: '萨克斯头', bass: '低音提琴头', drum: '鼓头（军鼓 + 双镲）' }
  const VZ = { front: '正面', side: '侧面', back: '背面', three: '¾' }
  const tile = (src, dst, label, w, h, bg = '#24110d', fit = false) => spawnSync('convert', [src, '-resize', `${w}x${h}${fit ? '' : '^'}`, '-background', bg, '-gravity', 'center', '-extent', `${w}x${h}`, '-gravity', 'south', '-background', '#120806', '-splice', '0x40', ...font, '-fill', '#f3eedf', '-pointsize', '22', '-annotate', '+0+7', label, dst])
  const crop = (src, dst, geo) => spawnSync('convert', [src, '-crop', geo, '+repage', dst])
  const trisOf = (w) => { for (const k of [`${w}-front`, 'all']) { const i = R[k]?.info?.[w]; if (i?.lods) return `LOD0 ${i.lods[0]} / LOD1 ${i.lods[1]} / LOD2 ${i.lods[2]} 三角` } return '' }
  // stage1：标题 + 合影 + 4 行 × 4 视角 + 1 行（道具 / 老人手 / 低音提琴 LOD1 / LOD2）
  const rows = []
  for (const w of WHO) {
    const tiles = []
    for (const v of ['front', 'side', 'back', 'three']) { const src = out + `${w}-${v}.png`; if (!existsSync(src)) continue; const dst = out + `_t_${w}-${v}.png`; crop(src, out + '_c.png', '700x940+0+60'); tile(out + '_c.png', dst, `${ZH[w]} · ${VZ[v]}`, 420, 600); tiles.push(dst) }
    if (tiles.length === 4) { const rr = out + `_row_${w}.png`; spawnSync('convert', [...tiles, '+append', rr]); const rl = out + `_rowl_${w}.png`; spawnSync('convert', ['-size', '1680x34', 'xc:#120806', ...font, '-fill', '#e0b23c', '-pointsize', '22', '-gravity', 'west', '-annotate', '+14+0', `${ZH[w]}　${trisOf(w)}`, rl]); rows.push(rl, rr) }
  }
  const extra = []
  for (const [n, t] of [['props', '道具：钢琴·谱架·啤酒·辣椒酱·探头'], ['hands', '头儿的老人手（指节突出、老年斑）'], ['lod1', '低音提琴头 LOD1'], ['lod2', '低音提琴头 LOD2']]) { if (!existsSync(out + n + '.png')) continue; const dst = out + `_t_${n}.png`; let src = out + n + '.png'; if (n !== 'props') { const [ww, hh] = n === 'hands' ? [900, 840] : [700, 940]; crop(src, out + '_c.png', `${ww}x${hh}+0+60`); src = out + '_c.png' } tile(src, dst, t, 420, 600, '#2a120d', n === 'props'); extra.push(dst) }
  if (extra.length === 4) { spawnSync('convert', [...extra, '+append', out + '_row_x.png']); rows.push(out + '_row_x.png') }
  if (existsSync(out + 'all.png') && rows.length) {
    spawnSync('convert', [out + 'all.png', '-crop', '1800x820+0+40', '+repage', '-resize', '1680x', out + '_all.png'])
    spawnSync('convert', ['-size', '1680x64', 'xc:#120806', ...font, '-fill', '#f3eedf', '-pointsize', '32', '-gravity', 'center', '-annotate', '+0+0', '爵士脑 Entity 197（Jazz Brain）四人乐队 · 阶段 1 建模', out + '_head.png'])
    const r = spawnSync('convert', [out + '_head.png', out + '_all.png', ...rows, '-append', '-quality', '86', out + 'stage1.jpg'])
    console.log('stage1', r.status, String(r.stderr || '').slice(0, 200))
  }
  // compare：附图 | 头儿 | 萨克斯
  if (existsSync(out + 'leader-ref.png') && existsSync(out + 'sax-ref.png')) {
    tile(REF, out + '_k1.png', 'ZAN 附图', 620, 620, '#b8203a')
    tile(out + 'leader-ref.png', out + '_k2.png', '头儿（小号头）同构图：按活塞', 620, 620)
    tile(out + 'sax-ref.png', out + '_k3.png', '萨克斯头 · 正面近景', 620, 620)
    const ks = [out + '_k1.png', out + '_k2.png']
    if (existsSync(out + 'leader-near.png')) { tile(out + 'leader-near.png', out + '_k4.png', '头儿 · 正面近景', 620, 620); ks.push(out + '_k4.png') }
    ks.push(out + '_k3.png')
    const r = spawnSync('convert', [...ks, '+append', '-quality', '88', out + 'stage1-compare.jpg'])
    console.log('compare', r.status, String(r.stderr || '').slice(0, 200))
  }
  // heads：4 列 × 2 行（正 / ¾）
  const ht = []
  for (const v of ['head', 'headq']) for (const w of WHO) { const src = out + `${w}-${v}.png`; if (!existsSync(src)) continue; const dst = out + `_h_${w}-${v}.png`; crop(src, out + '_c.png', '900x840+0+60'); tile(out + '_c.png', dst, `${ZH[w]} · ${v === 'head' ? '正面' : '¾'}`, 480, 480); ht.push(dst) }
  if (ht.length === 8) {
    spawnSync('montage', [...ht, '-background', '#120806', '-tile', '4x2', '-geometry', '+2+2', out + '_hg.png'])
    spawnSync('convert', ['-size', '1936x56', 'xc:#120806', ...font, '-fill', '#f3eedf', '-pointsize', '28', '-gravity', 'center', '-annotate', '+0+0', '爵士脑 E197 · 四个乐器头特写（乐器就是头，没有脸）', out + '_hh.png'])
    const r = spawnSync('convert', [out + '_hh.png', out + '_hg.png', '-append', '-quality', '88', out + 'heads.jpg'])
    console.log('heads', r.status)
  }
}
process.exit(0)
