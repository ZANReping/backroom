// [spokes] 迎宾女郎（Entity 28）阶段 1 截图验收：node scripts/verify-spokes.mjs [视图...]；输出 reports/spokes/*.png + stage1.jpg（汇总，带中文标注）+ stage1-compare.jpg（与附图并排）。
// 端口 3505（vite）/ 9505（chromium 调试），同时只开一个浏览器（脚本结束 SIGKILL 自己起的那个，不 pkill 别人的）。
// 默认 ?cpu=1（无头 SwiftShader 不能画 GPU 蒙皮）。S_Q 追加查询参数；S_RAW='名字=查询串;…' 追加任意单张（S_RW / S_RH 尺寸）。
// 字体丢失：cp /workspace/work/fonts/* ~/.fonts && fc-cache
import { spawn, spawnSync } from 'node:child_process'
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs'
const port = '9505', out = 'reports/spokes/', base = 'http://127.0.0.1:3505'
const REF = '/workspace/work/spokes/ref.png'
mkdirSync(out, { recursive: true })
const EXTRA = process.env.S_Q ? '&' + process.env.S_Q : ''
const P = (q, w = 1000, h = 1000) => ['/proto-spokes.html?cpu=1&' + q + EXTRA, w, h]
const VIEWS = {
  front: P('view=front', 800, 1100), side: P('view=side', 800, 1100), back: P('view=back', 800, 1100), three: P('view=three', 800, 1100),
  head: P('view=head'), headq: P('view=headq'), headside: P('view=headside'), headback: P('view=headback'),
  neck: P('view=neck'), collar: P('view=collar'), plaid: P('view=plaid'), hands: P('view=hands'), cross: P('view=cross', 900, 1000), crossside: P('view=crossside', 900, 1000),
  tpose: P('view=tpose', 1300, 1000), apose: P('view=apose', 1000, 1000), ref: P('view=ref', 768, 768), props: P('view=props', 990, 1096), windup: P('view=windup', 1000, 900),
  lod1: P('view=lod1', 800, 1100), lod2: P('view=lod2', 800, 1100),
  // 兔头背面轮廓（E28 v3）：hbk 与 head 关于头中心镜像同距（背面剪影可与正面直接比）；hsw 侧后；hbq ¾ 后方；hbn 颈背 / 后领
  hbk: P('view=head&label=hbk&cam=0,1.64,-1.01&at=0,1.645,0.02'), hsw: P('view=head&label=hsw&cam=1.0,1.66,-0.28&at=0,1.64,0'),
  hbq: P('view=head&label=hbq&cam=0.72,1.74,-0.78&at=0,1.62,-0.03'), hbn: P('view=head&label=hbn&cam=0.5,1.62,-0.66&at=0,1.5,-0.04'),
}
for (const r of (process.env.S_RAW ?? '').split(';').filter(Boolean)) { const [k] = r.split('='); VIEWS[k] = P(r.slice(k.length + 1), Number(process.env.S_RW ?? 1000), Number(process.env.S_RH ?? 1000)) }
const want = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(VIEWS)
const results = {}
const up = async () => { try { return (await fetch(base + '/proto-spokes.html')).ok } catch { return false } }
if (!(await up())) { spawn('npx', ['vite', '--port', '3505', '--strictPort', '--host', '127.0.0.1'], { stdio: 'ignore', detached: true }).unref(); for (let i = 0; i < 160 && !(await up()); i++) await new Promise((r) => setTimeout(r, 500)) }
const chrome = spawn('/workspace/work/.pw-libs/chromium.sh', ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${process.cwd()}/.cache/spokes-qa`, '--no-first-run', '--no-sandbox', '--enable-unsafe-swiftshader', '--use-angle=swiftshader', 'about:blank'], { stdio: 'ignore' })
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
    console.log(name, ok ? '' : 'TIMEOUT', JSON.stringify(info).slice(0, 300))
    writeFileSync(out + name + '.png', Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).data, 'base64'))
  }
} finally { chrome.kill('SIGKILL') }
{ const f = out + 'verify-result.json'; let old = {}; try { old = JSON.parse(readFileSync(f, 'utf8')) } catch {} writeFileSync(f, JSON.stringify({ ...old, ...results }, null, 1)) }
// 汇总：第一行 正面 / 侧面 / 背面 / ¾；第二行 头部正面 / 头部 ¾ / 头部侧面 / 颈部衔接；第三行 双臂交叉 / T 姿势 / 道具 / LOD1
const SHEET = [['front', '正面'], ['side', '侧面'], ['back', '背面'], ['three', '¾ 斜前'], ['head', '头部特写 · 正面'], ['headq', '头部特写 · ¾'], ['headside', '头部特写 · 侧面'], ['neck', '兔头与人颈衔接'], ['cross', '双臂交叉静帧（骨骼摆出）'], ['tpose', 'T 姿势'], ['props', '道具：海报 / 发条兔 / 铭牌 / 收音机 / 投递洞 / 音箱'], ['lod1', 'LOD1']]
const font = ['-font', '/workspace/work/fonts/NotoSansSC-Bold.otf']
if (SHEET.every(([n]) => existsSync(out + n + '.png')) && want.some((w) => SHEET.some(([n]) => n === w))) {
  const tiles = []
  for (const [n, t] of SHEET) { const dst = out + '_t_' + n + '.png'; spawnSync('convert', [out + n + '.png', '-resize', n === 'props' ? '560x620' : '560x620^', '-background', '#3a3833', '-gravity', 'center', '-extent', '560x620', '-gravity', 'south', '-background', '#0c0b0a', '-splice', '0x40', ...font, '-fill', '#f3eedf', '-pointsize', '24', '-annotate', '+0+6', t, dst]); tiles.push(dst) }
  const a = spawnSync('montage', [...tiles, '-background', '#0c0b0a', '-tile', '4x3', '-geometry', '+3+3', out + '_grid.png'])
  const head = spawnSync('convert', ['-size', '2276x70', 'xc:#0c0b0a', ...font, '-fill', '#f3eedf', '-pointsize', '34', '-gravity', 'center', '-annotate', '+0+0', '迎宾女郎 Entity 28（The Spokeslady）· 阶段 1 建模', out + '_head.png'])
  const c = spawnSync('convert', [out + '_head.png', out + '_grid.png', '-append', '-quality', '86', out + 'stage1.jpg'])
  console.log('sheet', a.status, head.status, c.status, String(a.stderr || '').slice(0, 300))
}
if (existsSync(out + 'ref.png') && want.includes('ref')) {
  spawnSync('convert', [REF, '-resize', '768x768', '-gravity', 'south', '-background', '#0c0b0a', '-splice', '0x44', ...font, '-fill', '#f3eedf', '-pointsize', '26', '-annotate', '+0+6', 'ZAN 附图', out + '_cref.png'])
  spawnSync('convert', [out + 'ref.png', '-resize', '768x768', '-gravity', 'south', '-background', '#0c0b0a', '-splice', '0x44', ...font, '-fill', '#f3eedf', '-pointsize', '26', '-annotate', '+0+6', '阶段 1 模型（同角度、双臂交叉、暖光）', out + '_cour.png'])
  const r = spawnSync('convert', [out + '_cref.png', out + '_cour.png', '+append', '-quality', '88', out + 'stage1-compare.jpg'])
  console.log('compare', r.status, String(r.stderr || '').slice(0, 200))
}
// 兔头侧面四联：修改前（/workspace/work/spokes/before/headside.png，b6bc334 版）/ 上一版（a735bfe，后脑勺缺失）/ 本次（枕部饱满）/
// 真家兔侧面照片（Alamy 2R9WMED，裁掉底部 86 px 黑色水印条（y ≥ 870），水平镜像成同朝向）
{
  const BEFORE = '/workspace/work/spokes/before/headside.png', PREV = '/workspace/work/spokes/prev/headside.png', RAB = '/workspace/work/spokes/rabbitref/r3.jpg'
  if (want.includes('headside') && existsSync(BEFORE) && existsSync(PREV) && existsSync(RAB)) {
    const lab = (src, dst, t, pre = []) => spawnSync('convert', [src, ...pre, '-resize', '600x600^', '-gravity', 'center', '-extent', '600x600', '-gravity', 'south', '-background', '#0c0b0a', '-splice', '0x46', ...font, '-fill', '#f3eedf', '-pointsize', '23', '-annotate', '+0+8', t, dst])
    const crop = ['-crop', '900x900+100+50', '+repage']
    lab(BEFORE, out + '_hs_a.png', '修改前（吻部尖长、头扁长）', crop)
    lab(PREV, out + '_hs_b.png', '上一版（耳后即收、后脑勺缺失）', crop)
    lab(out + 'headside.png', out + '_hs_c.png', '本次（耳后枕部圆隆、颈背顺滑）', crop)
    lab(RAB, out + '_hs_d.png', '真家兔侧面（参考照片，镜像）', ['-crop', '862x862+100+0', '+repage', '-flop'])
    const r = spawnSync('convert', [out + '_hs_a.png', out + '_hs_b.png', out + '_hs_c.png', out + '_hs_d.png', '+append', '-quality', '88', out + 'head-side-compare.jpg'])
    console.log('head-side-compare', r.status, String(r.stderr || '').slice(0, 200))
  }
}
// 兔头背面 v3 对比（3×3）：行 正面 / 背面 / 侧面；列 上一版（/workspace/work/spokes/prev2，b038a14）/ 本次 / 补充（背面叠正面剪影 · ¾ 后方 · 颈背后领）
{
  const PV = '/workspace/work/spokes/prev2/', need = ['head', 'hbk', 'hsw', 'hbq', 'hbn']
  if (want.includes('hbk') && need.every((n) => existsSync(PV + n + '.png') && existsSync(out + n + '.png'))) {
    const lab = (src, dst, t, pre = []) => spawnSync('convert', [src, ...pre, '-resize', '600x600^', '-gravity', 'center', '-extent', '600x600', '-gravity', 'south', '-background', '#0c0b0a', '-splice', '0x46', ...font, '-fill', '#f3eedf', '-pointsize', '23', '-annotate', '+0+8', t, dst])
    // 正面剪影：从上两角泛洪取背景（墙色均匀），取边缘描成青色线，水平镜像后叠到本次背面（两机位关于头中心镜像同距）
    spawnSync('convert', [out + 'head.png', '-fill', 'black', '-fuzz', '7%', '-draw', 'color 2,80 floodfill', '-draw', 'color 997,80 floodfill', '-fill', 'white', '+opaque', 'black', '-fill', 'black', '-draw', 'rectangle 0,0 999,62', '-morphology', 'Open', 'Disk:3', '-morphology', 'EdgeOut', 'Disk:2.5', '-flop', out + '_hb_edge.png'])
    spawnSync('convert', [out + 'hbk.png', '(', '-size', '1000x1000', 'xc:#28e0ff', ')', '(', out + '_hb_edge.png', '-alpha', 'off', ')', '-composite', out + '_hb_ovl.png'])
    const crop = ['-crop', '860x860+70+90', '+repage']
    const T = [
      [PV + 'head.png', '上一版 · 正面'], [out + 'head.png', '本次 · 正面（前脸不动）'], [out + '_hb_ovl.png', '本次背面 + 正面剪影（青线）'],
      [PV + 'hbk.png', '上一版 · 背面（上宽下窄灯泡形）'], [out + 'hbk.png', '本次 · 背面（上窄下宽）'], [out + 'hbq.png', '本次 · ¾ 后方'],
      [PV + 'hsw.png', '上一版 · 侧面'], [out + 'hsw.png', '本次 · 侧面（头顶→颈背连续圆弧）'], [out + 'hbn.png', '本次 · 颈背与后领'],
    ]
    const tiles = T.map(([s, t], i) => { const d = out + '_hb3_' + i + '.png'; lab(s, d, t, crop); return d })
    const a = spawnSync('montage', [...tiles, '-background', '#0c0b0a', '-tile', '3x3', '-geometry', '+3+3', '-quality', '86', out + 'head-back-v3.jpg'])
    console.log('head-back-v3', a.status, String(a.stderr || '').slice(0, 200))
  }
}
process.exit(0)
