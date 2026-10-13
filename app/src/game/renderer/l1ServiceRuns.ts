export type L1ServiceRun = { key: string; start: number; end: number }

export function coalesceL1Runs(runs: readonly L1ServiceRun[]): L1ServiceRun[] {
  const sorted = runs.map(run => {
    if (!Number.isFinite(run.start) || !Number.isFinite(run.end) || run.end <= run.start) throw new RangeError('L1 service runs require finite end > start')
    return { key: run.key, start: run.start, end: run.end }
  }).sort((a, b) => a.key.localeCompare(b.key) || a.start - b.start)
  const out: L1ServiceRun[] = []
  for (const run of sorted) {
    const prev = out[out.length - 1]
    if (prev && prev.key === run.key && run.start <= prev.end + 1e-7) prev.end = Math.max(prev.end, run.end)
    else out.push(run)
  }
  return out
}
