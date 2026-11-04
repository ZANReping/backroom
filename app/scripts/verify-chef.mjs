// [chef] 厨师（Entity 800）阶段 1 截图验收：node scripts/verify-chef.mjs [视图...]；输出 reports/chef/*.png + stage1.jpg（汇总，带中文标注）+ stage1-compare.jpg（与附图并排 + 猪头侧面与真猪对照）。
// 端口 3506（vite）/ 9506（chromium 调试），同时只开一个浏览器（脚本结束 SIGKILL 自己起的那个，不 pkill 别人的）。
// 默认 ?cpu=1（无头 SwiftShader 不能画 GPU 蒙皮）。C_Q 追加查询参数；C_RAW='名字=查询串;…' 追加任意单张（C_RW / C_RH 尺寸）。
// 字体丢失：cp /workspace/work/fonts/* ~/.fonts && fc-cache
import { spawn, spawnSync } from 'node:child_process'
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs'
const port = '9506', out = 'reports/chef/', base = 'http://127.0.0.1:3506'
const REF = '/workspace/work/chef/ref.png', PIG = '/workspace/work/chef/pigref/p1.jpg'
mkdirSync(out, { recursive: true })
const EXTRA = process.env.C_Q ? '&' + process.env.C_Q : ''
const P = (q, w = 1000, h = 1000) => ['/proto-chef.html?cpu=1&' + q + EXTRA, w, h]
const VIEWS = {
  front: P('view=front', 800, 1100), side: P('view=side', 800, 1100), three: P('view=three', 800, 1100), back: P('view=back', 800, 1100),
  head: P('view=head'), headside: P('view=headside'), headq: P('view=headq'), headback: P('view=headback'), hands: P('view=hands'),
  props: P('view=props', 1000, 1100), weapon: P('view=weapon', 800, 1100), lod1: P('view=lod1', 800, 1100), lod2: P('view=lod2', 800, 1100),
  rigtest: P('view=rigtest', 900, 1000), blood0: P('view=blood0', 800, 1100), blood1: P('view=blood1', 800, 1100), ref: P('view=ref', 900, 900),
}
for (const r of (process.env.C_RAW ?? '').split(';').filter(Boolean)) { const [k] = r.split('='); VIEWS[k] = P(r.slice(k.length + 1), Number(process.env.C_RW ?? 1000), Number(process.env.C_RH ?? 1000)) }
const want = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(VIEWS)
const results = {}
const up = async () => { try { return (await fetch(base + '/proto-chef.html')).ok } catch { return false } }
if (!(await up())) { spawn('node_modules/.bin/vite', ['--port', '3506', '--strictPort', '--host', '127.0.0.1'], { stdio: 'ignore', detached: true }).unref(); for (let i = 0; i < 160 && !(await up()); i++) await new Promise((r) => setTimeout(r, 500)) }
const chrome = spawn('/workspace/work/.pw-libs/chromium.sh', ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${process.cwd()}/.cache/chef-qa`, '--no-first-run', '--no-sandbox', '--enable-unsafe-swiftshader', '--use-angle=swiftshader', 'about:blank'], { stdio: 'ignore' })
for (const sig of ['SIGTERM', 'SIGINT']) process.on(sig, () => { try { chrome.kill('SIGKILL') } catch {} process.exit(1) })
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
    for (let attempt = 0; attempt < 2 && !ok; attempt++) {
      await send('Page.navigate', { url: 'about:blank' }); await new Promise((r) => setTimeout(r, 400))
      try { await ev('window.__ready=false') } catch {}
      await send('Page.navigate', { url: base + path })
      for (let i = 0; i < 1200; i++) { await new Promise((r) => setTimeout(r, 300)); try { if (await ev(`window.__ready===true && location.search===${ws2}`)) { ok = true; break } } catch {} }
      if (ok && !(await ev(`innerWidth===${w} && innerHeight===${h}`))) { console.log(name, 'viewport mismatch, retry'); ok = false }
    }
    const info = await ev('window.__info'); results[name] = { info, ok }
    const i2 = info ? { tm: info.tm, genMs: info.genMs, h: info.h, w: info.w, d: info.d, zMax: info.zMax } : null
    console.log(name, ok ? '' : 'TIMEOUT', JSON.stringify(i2))
    writeFileSync(out + name + '.png', Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).data, 'base64'))
  }
} finally { chrome.kill('SIGKILL') }
{ const f = out + 'verify-result.json'; let old = {}; try { old = JSON.parse(readFileSync(f, 'utf8')) } catch {} writeFileSync(f, JSON.stringify({ ...old, ...results }, null, 1)) }
const font = ['-font', '/workspace/work/fonts/NotoSansSC-Bold.otf']
// 汇总：4×4（全身四视角 / 头部特写 + 手 / 道具 + 举锅 + LOD1 + LOD2 / 血量 0 · 1 + 附图同款 + 后脑）
const tri = (n) => { const i = results[n]?.info ?? (() => { try { return JSON.parse(readFileSync(out + 'verify-result.json', 'utf8'))[n]?.info } catch { return null } })(); return i?.tm ? `（${i.tm.tris} 三角）` : '' }
const SHEET = [
  ['front', '正面'], ['side', '侧面'], ['three', '¾ 前'], ['back', '背面'],
  ['head', '头部特写 · 正'], ['headside', '头部特写 · 侧'], ['headq', '头部 ¾'], ['hands', '肥厚人手（短粗手指、深色指甲）'],
  ['props', '道具格'], ['weapon', '举起带把手的大汤锅'], ['lod1', 'LOD1'], ['lod2', 'LOD2'],
  ['blood0', 'bloodLevel = 0'], ['blood1', 'bloodLevel = 1'], ['ref', '附图同款（捧紫甘蓝、暗红餐厅）'], ['headback', '后脑 / 帽后'],
]
if (SHEET.every(([n]) => existsSync(out + n + '.png')) && want.some((w) => SHEET.some(([n]) => n === w))) {
  const tiles = []
  for (const [n, t] of SHEET) {
    const dst = out + '_t_' + n + '.png', label = /^(front|lod1|lod2)$/.test(n) ? t + tri(n) : t
    spawnSync('convert', [out + n + '.png', '-resize', '560x620^', '-background', '#2a0e0b', '-gravity', 'center', '-extent', '560x620', '-gravity', 'south', '-background', '#120605', '-splice', '0x40', ...font, '-fill', '#f3eedf', '-pointsize', '23', '-annotate', '+0+6', label, dst]); tiles.push(dst)
  }
  const a = spawnSync('montage', [...tiles, '-background', '#120605', '-tile', '4x4', '-geometry', '+3+3', out + '_grid.png'])
  const head = spawnSync('convert', ['-size', '2276x70', 'xc:#120605', ...font, '-fill', '#f3eedf', '-pointsize', '34', '-gravity', 'center', '-annotate', '+0+0', '厨师 Entity 800（The Chef）· 阶段 1 建模', out + '_head.png'])
  const c = spawnSync('convert', [out + '_head.png', out + '_grid.png', '-append', '-quality', '86', out + 'stage1.jpg'])
  console.log('sheet', a.status, head.status, c.status, String(a.stderr || '').slice(0, 300))
}
// 对照：上行 附图 | 附图同款渲染；下行 真猪侧面照片 | 猪头侧面
if (existsSync(out + 'ref.png') && existsSync(out + 'headside.png') && (want.includes('ref') || want.includes('headside'))) {
  const lab = (src, dst, t, pre = []) => spawnSync('convert', [src, ...pre, '-resize', '760x760^', '-gravity', 'center', '-extent', '760x760', '-gravity', 'south', '-background', '#120605', '-splice', '0x46', ...font, '-fill', '#f3eedf', '-pointsize', '25', '-annotate', '+0+8', t, dst])
  lab(REF, out + '_c1.png', 'ZAN 附图')
  lab(out + 'ref.png', out + '_c2.png', '阶段 1 模型（同构图：捧紫甘蓝、低头、暗红餐厅暖光）')
  lab(PIG, out + '_c3.png', '真猪侧面（参考照片：长直吻部、平额、圆鼻盘、颌下肉垂）', ['-crop', '1060x880+0+20', '+repage'])
  lab(out + 'headside.png', out + '_c4.png', '阶段 1 猪头侧面', ['-crop', '900x900+50+40', '+repage'])
  const r1 = spawnSync('convert', [out + '_c1.png', out + '_c2.png', '+append', out + '_cr1.png'])
  const r2 = spawnSync('convert', [out + '_c3.png', out + '_c4.png', '+append', out + '_cr2.png'])
  const r = spawnSync('convert', [out + '_cr1.png', out + '_cr2.png', '-append', '-quality', '88', out + 'stage1-compare.jpg'])
  console.log('compare', r1.status, r2.status, r.status, String(r.stderr || '').slice(0, 200))
}
process.exit(0)
