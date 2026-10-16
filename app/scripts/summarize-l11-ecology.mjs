import {readFileSync,writeFileSync} from 'node:fs'
import {fileURLToPath} from 'node:url'
import path from 'node:path'
const out=fileURLToPath(new URL('../reports/l11-faceling-ecology/',import.meta.url))
const read=name=>JSON.parse(readFileSync(path.join(out,name),'utf8').replace(/^\uFEFF/,'')),g=read('generation.json'),r=read('runtime.json'),cleanup=read('cleanup.json')
if(!g.ok||!r.ok||!cleanup.passed)throw Error('Acceptance incomplete')
const fixed=n=>Number(n).toFixed(2),esc=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;')
const samples=['street','shopkeeper','office'].map(k=>{const s=r[k+'Simulation'];return {scene:k,entities:s.entities.length,...s.aiMs}})
const md=`# Level 11 无面灵生态验收

街头无面灵沿实际人行道与斑马线移动，过街前停留约 1.1–2.6 秒，受阻时等待或重新寻路。商店收银台后、办公室和接待室按种子概率出现个体；在岗位停留、朝向来访者，或在同一房间的可达空地短距离活动后返回。保留激怒、反击和恢复平静的原有机制。

## 生成与生命周期

- 合适的街道区块以 50% 概率尝试放置 1 个行人，避开出生点附近 55 米、深水、车道与装饰物。
- 合适的商店房间以 48% 概率尝试放置店员；办公或接待房间以 22% 概率尝试放置个体。必须具备对应柜台/办公桌及人体净空；每栋建筑最多 3 个，不在烂尾楼、封闭楼层或公共档案馆生成。
- 共用城市规划、房间/陈设布局、斑马线位置及模型碰撞。宏区接缝合并两侧道路后计算过街点，与渲染标线一致。
- 每个体有稳定生态 ID、世界坐标岗位与楼层。跨区块不重复生成，装饰版本变化不重抽岗位。生物仍沿用原有区块卸载后重新生成的机制，无需升级存档。
- 运行时状态使用 WeakMap；寻路缓存有上限，每帧全体最多展开 60 个节点，无同步宏区生成。

## 验证

- <code>npm run check:l11-ecology</code>：${g.checks} 项断言，种子 1、42、20261006；负坐标、宏区边界、生成顺序、装饰变化、上层岗位、连续移动、碰撞、自然行人出生区块卸载再加载去重。
- <code>npm run verify:l11-ecology</code>：真实生产 Engine / Renderer、独立存储、独立端口和配置目录、<code>--headless=new</code>；街头 120 秒、店铺与办公各 60 秒模拟。真实 Worker / 主线程结果一致，跨区块坐标和岗位稳定，激怒后反击及恢复平静通过。
- <code>npm run check:dev-teleport</code>：L0/L1/L11 后台准备与直接生成结果一致，25 个目标区块装配通过。
- <code>npm run build</code>：通过。原有字体路径、PostCSS 和大包提示保留在 build.log。
- <code>./scripts/check-l11-ecology-cleanup.ps1</code>：本次浏览器、服务器、端口与临时配置目录清理完成；检查为只读。

## 本机运行记录

浏览器：${r.browser.product}。GPU：${r.stats.gpu}。视口 1920 × 1080；真实光照，细节距离 0.55，最多 8 个场景光源，阴影及 Bloom 关闭。截图使用种子 20261006，均为自然生成个体。

| 场景 | 实体数 | AI 中位耗时 ms | AI P95 ms | AI 最大耗时 ms |
| --- | ---: | ---: | ---: | ---: |
${samples.map(s=>`| ${s.scene} | ${s.entities} | ${fixed(s.p50)} | ${fixed(s.p95)} | ${fixed(s.max)} |`).join('\n')}

上述为该样本中完整实体 AI 更新的 CPU 耗时，并非整帧帧率或对所有硬件的性能承诺。控制台/运行时错误 ${r.errors.length} 条。全部原始结果、坐标、相机和截图保存在本目录。
`
writeFileSync(path.join(out,'README.md'),md)
const cards=[['sidewalk-after','街头活动','沿人行道继续行走，避开街边设施。'],['crosswalk','斑马线过街','自然行人经过过街等待后，走入实际绘制的斑马线。'],['shopkeeper','商店前台','站在真实收银柜台的内侧，面向店内来访者。'],['office','上层办公间','按实际办公房间和楼层生成，保留桌椅与通道净空。']]
writeFileSync(path.join(out,'index.html'),`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>L11 无面灵生态验收</title><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;background:#edf0eb;color:#24332f;font:16px/1.7 system-ui,'Microsoft YaHei',sans-serif}main{max-width:1280px;margin:auto;padding:36px}h1{font-size:32px;margin:0 0 10px}.pass{color:#267552;font-weight:700}.intro{max-width:940px}.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:22px;margin:25px 0}article{background:white;border:1px solid #ccd5cc;border-radius:10px;overflow:hidden}article img{display:block;width:100%;aspect-ratio:16/9;object-fit:contain}article div{padding:16px}h2{font-size:20px;margin:0}p{margin:8px 0}a{color:#216f75}table{border-collapse:collapse;width:100%;background:#fff}td,th{padding:10px;text-align:left;border-bottom:1px solid #dde3dc}.small{font-size:14px;color:#56675e}@media(max-width:800px){.grid{grid-template-columns:1fr}main{padding:18px}}</style><main><h1>Level 11 · 无面灵的城市日常</h1><p class="pass">生成、实际游戏行为、Worker 一致性与资源清理检查通过</p><p class="intro">街头行人使用人行道和斑马线；店员留在收银台后，办公个体在所属房间内活动。全部使用通用种子生成规则与实际模型碰撞。激怒后的反击机制保留。</p><p class="small">种子 20261006 · 1920 × 1080 · ${esc(r.browser.product)} · ${esc(r.stats.gpu)}</p><div class="grid">${cards.map(([id,title,note])=>`<article><a href="${id}.png"><img src="${id}.png" alt="${title}"></a><div><h2>${title}</h2><p>${note}</p></div></article>`).join('')}</div><p>多种子检查 ${g.checks} 项断言；实际场景模拟包含街头 120 秒、店铺与上层办公各 60 秒，覆盖跨区块、岗位净空、过街等待和激怒恢复。</p><table><tr><th>场景</th><th>个体数</th><th>AI 中位 / P95 / 最大耗时</th></tr>${samples.map(s=>`<tr><td>${s.scene}</td><td>${s.entities}</td><td>${fixed(s.p50)} / ${fixed(s.p95)} / ${fixed(s.max)} ms</td></tr>`).join('')}</table><p class="small">耗时为本机样本中的完整实体 AI CPU 更新，非整帧帧率。控制台错误 ${r.errors.length} 条；测试浏览器、服务器及临时配置目录已清理。</p><p><a href="README.md">实现与验证说明</a> · <a href="generation.json">多种子结果</a> · <a href="runtime.json">运行结果与相机坐标</a> · <a href="cleanup.json">清理检查</a> · <a href="build.log">构建日志</a></p></main></html>`)
console.log('L11 ecology report written')
