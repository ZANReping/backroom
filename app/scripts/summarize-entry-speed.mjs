#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'

const reportRoot = path.resolve(import.meta.dirname, '../reports/entry-speed-20261029')
const args = Object.fromEntries(process.argv.slice(2).map((arg) => {
  const [key, ...rest] = arg.replace(/^--/, '').split('=')
  return [key, rest.join('=') || true]
}))
const beforeLabel = args.before || 'baseline-app-realistic'
const afterLabel = args.after || 'final-priority-app-realistic'
const coldLabel = args.cold || null
const coldRetestLabel = args['cold-retest'] || null
const classicLabel = args.classic || null
const classicRetestLabel = args['classic-retest'] || null

const readJson = (label) => {
  const file = path.join(reportRoot, label, 'runtime.json')
  try { return JSON.parse(fs.readFileSync(file, 'utf8')) }
  catch (error) { throw new Error(`无法读取 ${file}: ${error.message}`) }
}
const before = readJson(beforeLabel)
const after = readJson(afterLabel)
const cold = coldLabel ? readJson(coldLabel) : null
const coldRetest = coldRetestLabel ? readJson(coldRetestLabel) : null
const classic = classicLabel ? readJson(classicLabel) : null
const classicRetest = classicRetestLabel ? readJson(classicRetestLabel) : null
// App-runtime runs intentionally omit the environment registry.  Use the
// independent realistic run as the canonical 31-level registration table.
const registry = readJson('baseline-realistic')
const catalog = (registry.environment?.levels || []).map((level) => [Number(level.id), level])
const catalogIds = catalog.map(([id]) => id)
if (catalog.length !== 31 || new Set(catalogIds).size !== catalog.length || catalog.some(([id]) => !Number.isInteger(id))) {
  throw new Error(`注册表必须恰好包含31个唯一整数 ID，实际为 ${catalog.length} 项`)
}
const names = new Map(catalog)
const ids = catalog.map(([id]) => id).sort((a, b) => a - b)
const entriesById = (data) => new Map((data.appLevels?.entries || []).map((entry) => [Number(entry.id), entry]))
const coldById = cold ? new Map((cold.cases || []).map((entry) => [Number(entry.id), entry])) : new Map()
const aggregateRetest = (data, initial) => {
  const all = data?.cases || []
  const groups = new Map()
  for (const entry of all) {
    const id = Number(entry.id)
    const group = groups.get(id) || []
    group.push(entry)
    groups.set(id, group)
  }
  const result = new Map()
  for (const id of ids) {
    const group = groups.get(id)
    if (!group?.length) {
      const original = initial?.get(id)
      if (original) result.set(id, { ...original, source: 'initial', n: 1, minLoadMs: original.loadMs, medianLoadMs: original.loadMs, maxLoadMs: original.loadMs })
      continue
    }
    const samples = initial?.has(id) ? [initial.get(id), ...group] : group
    const values = samples.map((entry) => Number(entry.loadMs)).filter(Number.isFinite).sort((a, b) => a - b)
    const max = values.at(-1)
    result.set(id, { ...samples.find((entry) => Number(entry.loadMs) === max), loadMs: max, source: 'initial+retest', n: values.length, minLoadMs: values[0], medianLoadMs: (values[Math.floor((values.length - 1) / 2)] + values[Math.floor(values.length / 2)]) / 2, maxLoadMs: max })
  }
  return result
}
const coldInitialById = cold ? new Map((cold.cases || []).map((entry) => [Number(entry.id), entry])) : new Map()
const coldFinalById = aggregateRetest(coldRetest, coldInitialById)
const classicInitialById = classic ? new Map((classic.cases || []).map((entry) => [Number(entry.id), entry])) : new Map()
const classicFinalById = aggregateRetest(classicRetest, classicInitialById)
const beforeById = entriesById(before)
const afterById = entriesById(after)
const duplicateIds = (items) => items.map((entry) => Number(entry.id)).filter((id, i, all) => all.indexOf(id) !== i)
const afterIds = [...afterById.keys()].sort((a, b) => a - b)
const missingAfter = ids.filter((id) => !afterById.has(id))
const extraAfter = afterIds.filter((id) => !names.has(id))
const duplicateAfter = duplicateIds(after.appLevels?.entries || [])

const rows = ids.slice().sort((a, b) => a - b).map((id) => {
  const b = beforeById.get(id)
  const a = afterById.get(id)
  const c = coldFinalById.get(id)
  const ci = coldInitialById.get(id)
  const k = classicFinalById.get(id)
  const ki = classicInitialById.get(id)
  return {
    id,
    name: names.get(id)?.name || names.get(id)?.title || `Level ${id}`,
    title: names.get(id)?.title || '',
    beforePlayableMs: b?.playableMs ?? null,
    afterPlayableMs: a?.playableMs ?? null,
    afterMovementPassed: a?.movementPassed ?? null,
    coldInitialMs: ci?.loadMs ?? null,
    coldLoadMs: c?.loadMs ?? null,
    coldStats: c ? { minMs: c.minLoadMs, medianMs: c.medianLoadMs, maxMs: c.maxLoadMs, n: c.n, source: c.source } : null,
    coldPrepareMs: c?.prepareMs ?? null,
    coldGenerationMs: c?.generationMs ?? null,
    beforeSeconds: b ? b.playableMs / 1000 : null,
    afterSeconds: a ? a.playableMs / 1000 : null,
    coldSeconds: c ? c.loadMs / 1000 : null,
    classicInitialMs: ki?.loadMs ?? null,
    classicLoadMs: k?.loadMs ?? null,
    classicStats: k ? { minMs: k.minLoadMs, medianMs: k.medianLoadMs, maxMs: k.maxLoadMs, n: k.n, source: k.source } : null,
    classicSeconds: k ? k.loadMs / 1000 : null,
  }
})
const overTen = (field) => rows.filter((row) => row[field] != null && row[field] > 10).map((row) => ({ id: row.id, name: row.name, seconds: row[field] }))
const range = (field) => {
  const values = rows.map((row) => row[field]).filter((value) => value != null)
  return values.length ? { min: Math.min(...values), max: Math.max(...values) } : null
}
const result = {
  generatedAt: new Date().toISOString(),
  before: { label: beforeLabel, measurement: '原生桌面刷新（baseline）' },
  after: { label: afterLabel, measurement: '60Hz QA 回调调度（final）' },
  cold: coldLabel ? { label: coldLabel, measurement: '独立冷入口 runtime', retest: coldRetestLabel || null } : null,
  classic: classicLabel ? { label: classicLabel, measurement: '经典模式独立冷入口 runtime', retest: classicRetestLabel || null } : null,
  note: 'before 是原生桌面刷新、after 默认 60Hz QA 回调调度；两者不能当作严格百分比性能对照。此报告不写 Android 或全设备保证。',
  validation: { expectedIds: ids, afterIds, missingAfter, extraAfter, duplicateAfter, afterCoveredAll: missingAfter.length === 0 && extraAfter.length === 0 && duplicateAfter.length === 0 },
  summary: { beforeSeconds: range('beforeSeconds'), afterSeconds: range('afterSeconds'), coldSeconds: range('coldSeconds'), classicSeconds: range('classicSeconds'), overTenBefore: overTen('beforeSeconds'), overTenAfter: overTen('afterSeconds'), overTenCold: overTen('coldSeconds'), overTenClassic: overTen('classicSeconds'), beforeErrors: before.errors || [], afterErrors: after.errors || [], coldErrors: cold?.errors || [], coldRetestErrors: coldRetest?.errors || [], classicErrors: classic?.errors || [], classicRetestErrors: classicRetest?.errors || [], beforeCleanup: before.cleanup || null, afterCleanup: after.cleanup || null, coldCleanup: cold?.cleanup || null, coldRetestCleanup: coldRetest?.cleanup || null, classicCleanup: classic?.cleanup || null, classicRetestCleanup: classicRetest?.cleanup || null },
  newGames: after.newGames || null,
  entries: rows,
}
const formatSeconds = (value) => value == null ? '—' : `${value.toFixed(3)}s`
const labelFor = (row) => row.id === 12 ? 'Level 601' : row.id === 900 ? '前厅' : row.id === 902 ? 'Level 0.2' : row.name
const md = [
  `# 入口速度对照（${beforeLabel} → ${afterLabel}）`, '',
  result.note, '',
  `覆盖校验：${result.validation.afterCoveredAll ? '通过' : '未完成'}（期望 ${ids.length} 项，after ${afterIds.length} 项；缺失 ${missingAfter.join(', ') || '无'}；重复 ${duplicateAfter.join(', ') || '无'}）`, '',
  '| ID | 层级 | before 可玩 | after 可玩 | after 移动 | 真实冷入口 | 经典冷入口 |',
  '|---:|---|---:|---:|:---:|---:|---:|',
  ...rows.map((row) => `| ${row.id} | ${labelFor(row)} | ${formatSeconds(row.beforeSeconds)} | ${formatSeconds(row.afterSeconds)} | ${row.afterMovementPassed == null ? '—' : row.afterMovementPassed ? '通过' : '失败'} | ${formatSeconds(row.coldSeconds)} | ${formatSeconds(row.classicSeconds)} |`), '',
  `超过 10 秒（before）：${result.summary.overTenBefore.map((item) => `${item.name} ${item.seconds.toFixed(3)}s`).join('、') || '无'}`,
  `超过 10 秒（after）：${result.summary.overTenAfter.map((item) => `${item.name} ${item.seconds.toFixed(3)}s`).join('、') || '无'}`,
  `超过 10 秒（冷入口）：${result.summary.overTenCold.map((item) => `${item.name} ${item.seconds.toFixed(3)}s`).join('、') || (coldLabel ? '无' : '未提供')}`, '',
  `超过 10 秒（经典冷入口）：${result.summary.overTenClassic.map((item) => `${item.name} ${item.seconds.toFixed(3)}s`).join('、') || (classicLabel ? '无' : '未提供')}`,
  '复测结果按初测与复测合并后的保守 max(loadMs) 采用；baseline 为原生 DEV，final 为 60Hz production，两者不构成严格百分比性能对照。',
  `errors：before ${result.summary.beforeErrors.length}，after ${result.summary.afterErrors.length}，cold ${result.summary.coldErrors.length}`,
  `cleanup：before ${JSON.stringify(result.summary.beforeCleanup)}；after ${JSON.stringify(result.summary.afterCleanup)}${cold ? `；cold ${JSON.stringify(result.summary.coldCleanup)}` : ''}`,
].join('\n') + '\n'
fs.writeFileSync(path.join(reportRoot, 'comparison.json'), JSON.stringify(result, null, 2) + '\n')
fs.writeFileSync(path.join(reportRoot, 'comparison.md'), md)
console.log(`wrote ${path.join(reportRoot, 'comparison.json')} and comparison.md`)
