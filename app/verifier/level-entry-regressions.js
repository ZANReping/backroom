// Actual WebGL cancellation and lifetime checks for the concurrent chunk queue.
export async function settleEntryResources() {
  const r=perfQA.renderer,{afterRendererCompile}=await import('/src/game/renderer/sceneWarmup.ts')
  const started=performance.now()
  for(;;){
    await new Promise(resolve=>afterRendererCompile(r.three,resolve))
    await new Promise(requestAnimationFrame);perfQA.outpost.draw()
    if(!r.retiredWorld.length&&!r.itemWarmup.jobs.size&&![...r.worldTextures].some(t=>t.userData.fileImagePending))break
    if(performance.now()-started>30000)throw Error('GPU/image retirement did not settle')
  }
}

export async function verifyLevelEntryRegressions() {
  const { engine: e, renderer: r } = perfQA, checks = [], cycles = []
  const report = perfQA.entryRegression = { checks, cycles }
  const assert = (ok, label) => { if (!ok) throw Error(label); checks.push(label) }
  const drawUntil = async (predicate, label, limit = 60000) => {
    const started = performance.now()
    while (!predicate()) {
      await new Promise(requestAnimationFrame); perfQA.outpost.draw()
      if (performance.now() - started > limit) throw Error(label)
    }
  }
  await perfQA.entry.measure(104)
  const compile = r.three.compileAsync, roots = new Set()
  let release, disposed = 0
  const gate = new Promise(resolve => { release = resolve })
  r.three.compileAsync = function (...args) {
    let chunk = false
    args[0].traverse(object => {
      for (let parent = object; parent; parent = parent.parent) if (parent.name === 'l0-static') {
        roots.add(parent.parent); chunk = true; break
      }
    })
    const promise = compile.apply(this, args)
    return chunk ? promise.then(() => gate) : promise
  }
  let owned = new Set()
  try {
    e.loadLevel(0, { mapSeed: 424242, firstVisit: false }); e.paused = true
    await drawUntil(() => roots.size >= 2, 'Two concurrent chunk compiles not reached')
    assert(r.chunkBuilds.size <= 4 && roots.size >= 2, 'Entry overlaps chunk compiler waits within the four-job bound')
    for (const root of roots) root.traverse(o => { if (o.geometry) owned.add(o.geometry) })
    assert(owned.size > 0, 'Pending chunks own geometry')
    for (const geometry of owned) geometry.addEventListener('dispose', () => { disposed++ })
    e.loadLevel(106, { mapSeed: 424242, firstVisit: false }); perfQA.outpost.draw()
    assert(r.chunkBuilds.size === 0, 'Switching level cancels every pending chunk job')
    assert([...roots].every(root => root.parent === null), 'Cancelled chunks never become visible')
    assert(disposed === 0, 'Pending compiler references keep geometry alive')
    r.three.compileAsync = compile; release()
    await drawUntil(() => disposed >= owned.size, 'Cancelled chunk geometry not drained')
    assert(disposed === owned.size, 'Cancelled geometry releases exactly once after compiler completion')
    await drawUntil(() => r.isNearWorldReady(e), 'Next finite level not ready')
    assert([...roots].every(root => root.parent === null), 'Late compiler completion cannot publish old chunks')
  } finally { r.three.compileAsync = compile; release() }

  report.cancelledGeometry = owned.size
  for (let i = 0; i < 5; i++) {
    await perfQA.entry.measure(5)
    assert(r.mothProgramOwners.length === 4, `Cycle ${i + 1}: all four warmed moth templates retained`)
    await perfQA.entry.measure(104)
    assert(r.mothProgramOwners.length === 0, `Cycle ${i + 1}: leaving hotel releases warmed templates`)
    await perfQA.outpost.survey()
    await settleEntryResources()
    const gpuGeometries=root=>{const values=new Set();root.traverse(o=>{const g=o.geometry;if(g?._listeners?.dispose?.some(fn=>fn.name==='onGeometryDispose'))values.add(g.id)});return [...values]}
    cycles.push({...perfQA.outpost.snapshot(),pool:r.itemPool.map(p=>({key:p.key,gpu:gpuGeometries(p.group)})),sceneGpu:gpuGeometries(r.scene),retired:r.retiredWorld.length,entityMeshes:r.entityMeshes.size})
  }
  assert(cycles.at(-1).memory.geometries <= cycles.at(-2).memory.geometries + 2, 'Repeated hotel/outpost switches have stable geometry counts')
  assert(cycles.at(-1).memory.textures <= cycles.at(-2).memory.textures + 2, 'Repeated hotel/outpost switches have stable texture counts')
  return { passed: checks.length, checks, cancelledGeometry: owned.size, cycles }
}
