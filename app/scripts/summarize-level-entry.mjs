import {readFileSync, writeFileSync, mkdirSync, existsSync} from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'

const app = fileURLToPath(new URL('../', import.meta.url))
const root = path.join(app, 'reports', 'level-entry')
const args = process.argv.slice(2)
const arg = name => args.find(value => value.startsWith(`${name}=`))?.slice(name.length + 1)
const beforeLabel = arg('--before') ?? 'baseline'
const afterLabel = arg('--after') ?? 'final'
const appLabel = arg('--app')
const classicLabel = arg('--classic')
const errors = []

function readRun(label) {
  const file = path.join(root, label, 'runtime.json')
  if (!existsSync(file)) {
    errors.push(`${label}: runtime.json is missing`)
    return null
  }
  try { return JSON.parse(readFileSync(file, 'utf8')) }
  catch (error) { errors.push(`${label}: ${error.message}`); return null }
}

const before = readRun(beforeLabel)
const after = readRun(afterLabel)
const appRun = appLabel ? readRun(appLabel) : null
const classicRun = classicLabel ? readRun(classicLabel) : null
const appEntries = new Map((appRun?.appLevels?.entries ?? []).filter(item => item && item.id !== undefined).map(item => [String(item.id), item]))
const runCases = run => new Map((run?.cases ?? []).filter(item => item && item.id !== undefined).map(item => [String(item.id), item]))
const classicCases = runCases(classicRun)
const beforeCases = runCases(before)
const afterCases = runCases(after)
const ids = [...new Set([...beforeCases.keys(), ...afterCases.keys()])].sort((a, b) => Number(a) - Number(b) || a.localeCompare(b))
const value = (row, key) => Number.isFinite(row?.cold?.[key]) ? row.cold[key] : null
const seconds = ms => ms === null ? null : Number((ms / 1000).toFixed(3))
const measured = (run, key) => run?.[key] ?? null
const setupSource = after?.setup ?? before?.setup ?? {}
const setup = {
  ...setupSource,
  beforeLabel,
  afterLabel,
  before: before?.setup ?? null,
  after: after?.setup ?? null,
  gpu: setupSource.gpu ?? null,
  viewport: setupSource.viewport ?? null,
  settings: setupSource.settings ?? null,
  seed: setupSource.seed ?? 424242,
  mode: setupSource.mode ?? after?.mode ?? before?.mode ?? null
}

const cases = ids.map(id => {
  const b = beforeCases.get(id)
  const a = afterCases.get(id)
  const finalLoadMs = value(a, 'loadMs')
  const beforeLoadMs = value(b, 'loadMs')
  const production = appEntries.get(id)
  const playableMs = Number.isFinite(production?.playableMs) ? production.playableMs : null
  const timeout = production?.timeout === true || production?.status === 'timeout'
  const classic = classicCases.get(id)
  const classicLoadMs = value(classic, 'loadMs')
  return {
    id: a?.id ?? b?.id ?? id,
    name: a?.cold?.name ?? b?.cold?.name ?? `Level ${id}`,
    before: b ? {name: b.cold?.name ?? null, status: b.cold?.status ?? null, totalSeconds: seconds(beforeLoadMs), loadMs: beforeLoadMs} : null,
    after: a ? {name: a.cold?.name ?? null, status: a.cold?.status ?? null, totalSeconds: seconds(finalLoadMs), loadMs: finalLoadMs} : null,
    totalSeconds: seconds(finalLoadMs),
    improvementSeconds: beforeLoadMs !== null && finalLoadMs !== null ? Number(((beforeLoadMs - finalLoadMs) / 1000).toFixed(3)) : null,
    finalMapPreparationSeconds: seconds(value(a, 'preparationMs')),
    finalGenerationSeconds: seconds(value(a, 'generationMs')),
    finalRenderPreparationSeconds: seconds(value(a, 'sceneMs')),
    within10SecondsAndReady: finalLoadMs !== null && a?.cold?.status === 'ready' ? finalLoadMs <= 10000 : null,
    production: production ? {playableSeconds: seconds(playableMs), within10Seconds: playableMs !== null && !timeout ? playableMs <= 10000 : false, movementPassed: production.movementPassed === true, timeout} : null,
    classic: classic ? {name: classic.cold?.name ?? null, status: classic.cold?.status ?? null, loadMs: classicLoadMs, totalSeconds: seconds(classicLoadMs), within10SecondsAndReady: classicLoadMs !== null && classic.cold?.status === 'ready' ? classicLoadMs <= 10000 : false} : null,
    measured: Boolean(a || b)
  }
})

const runtimeErrors = [before, after].flatMap(run => run?.errors ?? [])
const networkErrors = [before, after].flatMap(run => run?.networkErrors ?? [])
const comparison = {
  setup,
  cases,
  ok: Boolean(before?.ok && after?.ok && (!appLabel || appRun?.ok) && !errors.length),
  errors: [...errors, ...runtimeErrors],
  networkErrors,
  cleanup: {before: measured(before, 'cleanup'), after: measured(after, 'cleanup')},
  source: {before: beforeLabel, after: afterLabel},
  production: appLabel ? {source: appLabel, ok: appRun?.ok ?? null, errors: appRun?.errors ?? [], cleanup: appRun?.cleanup ?? null, entries: appRun?.appLevels?.entries ?? []} : null,
  classic: classicLabel ? {source: classicLabel, ok: classicRun?.ok ?? null, errors: classicRun?.errors ?? [], networkErrors: classicRun?.networkErrors ?? [], cleanup: classicRun?.cleanup ?? null} : null,
  measurement: {
    loadMs: 'Called from map preparation start through two frames after Renderer3D.isNearWorldReady.',
    caveat: 'A single run is an observation and cannot guarantee performance across devices.'
  }
}

mkdirSync(root, {recursive: true})
writeFileSync(path.join(root, 'comparison.json'), JSON.stringify(comparison, null, 2) + '\n')

const fmt = value => value === null ? '未测' : `${value.toFixed(3)} s`
const lines = [
  `# Level entry comparison: ${beforeLabel} → ${afterLabel}`,
  '',
  `GPU: ${setup.gpu ?? '未测'}`,
  `Viewport: ${setup.viewport ? setup.viewport.join(' × ') : '未测'}`,
  `Seed: ${setup.seed ?? '未测'}`,
  `Mode: ${setup.mode ?? '未测'}`,
  `Settings: ${setup.settings ? JSON.stringify(setup.settings) : '未测'}`,
  '',
  `Measurement: loadMs runs from map preparation start until two frames after Renderer3D.isNearWorldReady. A single run cannot guarantee performance across devices.`,
  `Performance note: baseline enabled CPU Profiler, and background device load was not strictly controlled across runs; before/after differences are for bottleneck investigation and are not a strictly controlled performance percentage.`,
  '',
  `Reproduce final: \`node scripts/verify-level-entry.mjs --label=final\``,
  '',
  '| ID | Before total | After total | Improvement | Final map preparation | Final generation | Render preparation | ≤10,000 ms and ready |',
  '| --- | ---: | ---: | ---: | ---: | ---: | ---: | :---: |',
  ...cases.map(item => `| ${item.id} ${item.name} | ${fmt(item.before?.totalSeconds ?? null)} | ${fmt(item.totalSeconds)} | ${fmt(item.improvementSeconds)} | ${fmt(item.finalMapPreparationSeconds)} | ${fmt(item.finalGenerationSeconds)} | ${fmt(item.finalRenderPreparationSeconds)} | ${item.within10SecondsAndReady === null ? '未测' : item.within10SecondsAndReady ? '是' : '否'} |`),
  '',
  ...(appLabel ? [
    `Production source: ${appLabel}. 冷加载 loadMs 不包含过场；生产流程包含过场。`,
    `真实过场 ≤10秒且 movementPassed 的项：${cases.filter(item => item.production?.within10Seconds && item.production?.movementPassed).length}/${appEntries.size || 29}。`,
    `超过10秒列表：${cases.filter(item => item.production?.playableSeconds !== null && !item.production?.timeout && item.production.playableSeconds > 10).map(item => `${item.id} (${fmt(item.production.playableSeconds)})`).join('、') || '无'}。`,
    '',
    '| ID | Production playable | ≤10秒 | movementPassed |',
    '| --- | ---: | :---: | :---: |',
    ...cases.map(item => `| ${item.id} | ${fmt(item.production?.playableSeconds ?? null)} | ${item.production ? (item.production.within10Seconds ? '是' : '否') : '未测'} | ${item.production ? (item.production.movementPassed ? '是' : '否') : '未测'} |`),
    ''
  ] : []),
  ...(classicLabel ? [
    `Classic source: ${classicLabel}. ready 且 ≤10秒的项：${cases.filter(item => item.classic?.within10SecondsAndReady).length}/${classicCases.size || 29}。`,
    `Classic errors: ${comparison.classic.errors.length}; network errors: ${comparison.classic.networkErrors.length}; cleanup: ${JSON.stringify(comparison.classic.cleanup)}。`,
    '',
    '| ID | Classic load | status | ready 且 ≤10秒 |',
    '| --- | ---: | :---: | :---: |',
    ...cases.map(item => `| ${item.id} | ${fmt(item.classic?.totalSeconds ?? null)} | ${item.classic?.status ?? '未测'} | ${item.classic ? (item.classic.within10SecondsAndReady ? '是' : '否') : '未测'} |`),
    ''
  ] : []),
  `Result: ${comparison.ok ? 'ok' : 'has errors or incomplete runs'}`
]
writeFileSync(path.join(root, 'comparison.md'), lines.join('\n') + '\n')

console.log(`Wrote ${path.join(root, 'comparison.json')}`)
console.log(`Wrote ${path.join(root, 'comparison.md')}`)
