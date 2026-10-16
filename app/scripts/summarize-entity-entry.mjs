import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const out = fileURLToPath(new URL('../reports/rat-v80/', import.meta.url))
const load = side => JSON.parse(readFileSync(path.join(out, `first-appearance-${side}-realistic/runtime.json`), 'utf8'))
const before = load('before'), after = load('after')
if (![before, after].every(r => r.ok && r.runs.length === 3 && r.runs.every(v => v.ok))) throw Error('Three successful cold-browser rounds required on both sides')
const median = xs => [...xs].sort((a,b) => a-b)[Math.floor(xs.length/2)]
const summarize = rows => Object.fromEntries(['maxCpu', 'buildMax', 'medianCpu', 'p95Cpu', 'maxRaf', 'appearanceMs'].map(key => [key, {
  median: median(rows.map(r => r[key])), min: Math.min(...rows.map(r => r[key])), max: Math.max(...rows.map(r => r[key])),
}]))
const data = before.runs[0].data.results.map(row => {
  const pick = source => source.runs.map(r => {
    const v = r.data.results.find(v => v.type === row.type)
    if (!v || v.failure) throw Error(`Missing/failed entity: ${row.type}`)
    return v
  })
  return { type: row.type, before: summarize(pick(before)), after: summarize(pick(after)) }
})
const summary = { rounds: 3, types: data.length, gpu: after.runs[0].data.gpu, viewport: [1920,1080], seed: 20261006, level: 104, mode: 'realistic', data }
writeFileSync(path.join(out, 'performance.json'), JSON.stringify(summary, null, 2))
const fmt = n => n.toFixed(1)
const pair = (r,k) => `${fmt(r.before[k].median)} → ${fmt(r.after[k].median)}`
const lines = [
  '# 全实体首次出现：三轮对照', '',
  '固定种子 20261006，L104 实际游戏据点，1920×1080、DPR 1、原生分辨率、真实光影、纹理档 2、阴影档 2、场景灯上限 16、泛光开启。使用 Vite 运行生产源码；不是压缩构建的帧率承诺。设备：' + summary.gpu + '。', '',
  '每轮新建无头 Chrome 配置与独立服务，先准备固定场景，再按 ID 排序依次召唤全部 38 种父实体。保留同轮已有的共享资源缓存；每只实体的随机形态以固定种子生成。冻结 AI，仅测首次模型准备和实际渲染。每种采样包含等待模型显现，以及显现后至少 20 帧和 400ms。', '',
  '单位 ms。箭头表示改造前 → 后；表中峰值是三轮各自峰值的中位数，最后一列给出三轮中的最坏帧间隔。CPU 为 renderer.render 的主线程耗时，RAF 为相邻真实渲染回调的间隔，两者不能混为同一指标。显现等待包含异步准备时间，并非整段冻结。', '',
  '| 实体 ID | CPU 峰值 | RAF 峰值 | 显现等待 | 改后最坏 RAF |',
  '|---|---:|---:|---:|---:|',
  ...data.map(r => `| ${r.type} | ${pair(r,'maxCpu')} | ${pair(r,'maxRaf')} | ${pair(r,'appearanceMs')} | ${fmt(r.after.maxRaf.max)} |`), '',
  '尸鼠同时更换了模型：基线是旧方块版本，改后是带毛壳的 v80 版本，不能把这一行当作相同内容的纯性能对照。其余实体保留原有模型；整体采用分批编译/上传，肢团与飞蛾额外拆分程序生成。仍有几何构建和 GPU/驱动调度长帧，未达到所有首次出现帧均低于 16.7ms。', '',
  '未覆盖每个自然栖息地、每种换形/攻击状态、海量实体同时出现及 Android 真机。经典模式进行了尸鼠功能与外观回归，但未采三轮全实体性能对照。早期调整记录保留在同目录的 initial / entry-* 子目录，不作为最终数据。', '',
  '复现：`node scripts/verify-entity-entry.mjs --baseline --rounds=3`、`node scripts/verify-entity-entry.mjs --rounds=3`、`node scripts/summarize-entity-entry.mjs`。基线命令需保留本任务开始前保存的 `.cache/rat-v80/baseline/src/`。', '',
  '原始数据：[改前](first-appearance-before-realistic/runtime.json)、[改后](first-appearance-after-realistic/runtime.json)、[汇总 JSON](performance.json)。每轮记录真实 Chrome 启动参数、GPU、端口、进程、控制台和清理结果。', '',
]
writeFileSync(path.join(out, 'performance.md'), lines.join('\n'))
console.log(JSON.stringify({ rounds: 3, types: data.length, cpuWorst: Math.max(...data.map(v => v.after.maxCpu.max)), rafWorst: Math.max(...data.map(v => v.after.maxRaf.max)), output: out }))
