import { ALL_LEVEL_DEFS, levelLabel } from '/src/game/levels/index.ts'
import { prepareChunkWindow } from '/src/game/world/chunkCache.ts'
import { attachOutpostLoading } from './outpost-loading.js'

// The same Engine, map generators, renderer and readiness gate used by App.
// No simplified maps, disabled objects, timeout-based release or real save writes.
export function attachLevelEntry(qa, mode = 'realistic') {
  const setup = attachOutpostLoading(qa, mode)
  const { engine: e, renderer: r, look } = qa
  const frame = () => new Promise(requestAnimationFrame)
  let metrics, current
  for (const name of ['buildInfiniteChunk', 'buildLevel', 'warmSceneTextures']) {
    const original = r[name]
    r[name] = function* (...args) {
      const job = original.apply(this, args)
      try {
        for (;;) {
          const t = performance.now(), step = job.next(), ms = performance.now() - t
          if (metrics) {
            const m = metrics[name] ??= { calls: 0, cpuMs: 0, maxMs: 0 }
            m.calls++; m.cpuMs += ms; m.maxMs = Math.max(m.maxMs, ms)
          }
          if (step.done) return step.value
          yield step.value
        }
      } finally { job.return() }
    }
  }
  const pending = () => ({
    chunks: r.chunkGroups.size, chunkTask: r.cityChunkTask?.key,
    finiteTask: !!r.finiteTask, flashlight: !!r.flashWarmup, moth: !r.mothWarmupDone,
    items: r.itemMeshes.size, npcs: r.npcMeshes.size,
    texturesPending: [...r.worldTextures].filter(t => t.userData.fileImagePending).length,
    ready: r.isNearWorldReady(e), memory: { ...r.three.info.memory },
  })
  async function measure(id, seed = 424242, timeout = 120000) {
    const def = ALL_LEVEL_DEFS.find(d => d.id === id)
    if (!def) throw Error(`Unknown level ${id}`)
    const start = performance.now()
    current = { id, name: levelLabel(id), seed, mode, status: 'preparing', elapsedMs: 0 }
    metrics = {}
    await prepareChunkWindow(def, seed)
    const preparationMs = performance.now() - start, generateAt = performance.now()
    e.loadLevel(id, { mapSeed: seed, firstVisit: true })
    const generationMs = performance.now() - generateAt
    e.dev.god = true; e.dev.statLock = true; e.dev.frozenAI = true
    e.paused = true; e.introT = 0; look.yaw = 0; look.pitch = 0
    const frames = [], milestones = []
    let previous = performance.now(), previousChunks = -1, ready = false
    current.status = 'rendering'
    while (performance.now() - start < timeout) {
      await frame()
      const now = performance.now(), cpu = performance.now()
      qa.outpost.draw()
      frames.push({ ms: now - previous, cpuMs: performance.now() - cpu })
      previous = now
      current.elapsedMs = performance.now() - start
      if (r.chunkGroups.size !== previousChunks) {
        previousChunks = r.chunkGroups.size
        milestones.push({ atMs: current.elapsedMs, ...pending() })
      }
      if (r.isNearWorldReady(e)) { ready = true; break }
    }
    const readyMs = performance.now() - start
    if (ready) for (let i = 0; i < 2; i++) { await frame(); qa.outpost.draw() }
    const quantile = (a, q) => [...a].sort((a, b) => a - b)[Math.floor((a.length - 1) * q)] ?? 0
    Object.assign(current, {
      status: ready ? 'ready' : 'timeout', readyMs, loadMs: performance.now() - start,
      preparationMs, generationMs, sceneMs: readyMs - preparationMs - generationMs,
      frames: frames.length, cpuTotalMs: frames.reduce((n, f) => n + f.cpuMs, 0),
      cpuMaxMs: Math.max(0, ...frames.map(f => f.cpuMs)),
      frameP95Ms: quantile(frames.map(f => f.ms), .95),
      metrics, milestones, pending: pending(), firstReady: qa.outpost.snapshot(),
    })
    if (id === 1) current.bakes = (await import('/src/game/renderer/l1BakeQueue.ts')).l1BakeStats()
    return current
  }
  qa.entry = { measure, pending, levels: ALL_LEVEL_DEFS.map(d => ({ id: d.id, name: levelLabel(d.id) })), get current() { return current } }
  return { ...setup, hardwareConcurrency: navigator.hardwareConcurrency }
}
