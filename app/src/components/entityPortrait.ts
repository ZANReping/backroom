// One demand-driven studio, one model job at a time, bounded PNG cache.
import * as THREE from 'three'
import { buildEntityArchiveModel, entityArchiveOptions, frameEntityArchive } from '@/game/renderer/entityArchiveModel'
import { entityArchiveView } from '@/game/entities/archiveViews'
import { disposeCharacterModel } from '@/game/renderer/retroResources'
import { retroModelReady } from '@/game/renderer/retroAvatar'
import { prepareClumpBlob } from '@/game/renderer/clumpBlob'
import { prepareDeathmothJob } from '@/game/renderer/deathmothMesh'
import { prepareWatchJob } from '@/game/renderer/neighborhoodWatchMesh'
import { prepareMangledJob } from '@/game/renderer/watchRender'
import { prepareWranglerJob } from '@/game/renderer/wranglerMesh'
import { prepareShrimpTextures } from '@/game/renderer/shrimpMesh'
import { prepareRatTextures } from '@/game/renderer/ratMesh'
import { preparePartygoerJob } from '@/game/renderer/partygoerMesh'
import { getMaterialMode } from '@/game/renderer/shared'

export type EntityPortraitResult = { src: string; status: 'ready' | 'unavailable' | 'error' }
type Job = { key: string; type: string; view: number; listeners: Set<(result: EntityPortraitResult) => void>; abort: AbortController }
const cache = new Map<string, EntityPortraitResult>(), jobs = new Map<string, Job>()
const MAX_CACHE = 32, MAX_BYTES = 6 * 1024 * 1024, SIZE = 448
let bytes = 0, builds = 0, renders = 0, hits = 0, active: Job | null = null, idle = 0
let renderer: THREE.WebGLRenderer | null = null, scene: THREE.Scene | null = null, camera: THREE.PerspectiveCamera | null = null, retained: THREE.Group | null = null
const pause = () => new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
const check = (job: Job) => { if (job.abort.signal.aborted) throw new DOMException('Cancelled', 'AbortError') }

async function prepare(job: Job) {
  const options = entityArchiveOptions(job.type, job.view)
  const task = job.type === 'clump' ? prepareClumpBlob(!!options.l3clump, options.seed!)
    : job.type === 'deathmoth' ? prepareDeathmothJob(options.mothForm ?? 'male')
    : job.type === 'watcher' || job.type === 'strider' ? prepareWatchJob(job.type)
    : job.type === 'mangled' ? prepareMangledJob(1)
    : job.type === 'wrangler' ? prepareWranglerJob(options.wranglerKind??'male',!!options.wranglerPregnant)
    : job.type === 'dryshrimp' ? prepareShrimpTextures()
    : job.type === 'corpserat' ? prepareRatTextures(options.ratMorph ?? 'common')
    : job.type === 'partygoer' ? preparePartygoerJob() : null
  if (!task) return
  let done = false
  try { while (!done) {
    check(job)
    const deadline = performance.now() + 3
    do { done = !!task.next().done } while (!done && performance.now() < deadline)
    if (!done) await pause()
  } } finally { if (!done) task.return() }
}
function studio() {
  if (renderer) return
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true })
  renderer.setPixelRatio(1); renderer.setSize(SIZE, SIZE, false); renderer.setClearColor(0x000000, 0)
  renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping
  scene = new THREE.Scene(); camera = new THREE.PerspectiveCamera(40, 1, .01, 20)
  scene.add(new THREE.AmbientLight(0xd5dce7, 1.1))
  const key = new THREE.DirectionalLight(0xffefd9, 2.5); key.position.set(3, 5, 4); scene.add(key)
  const rim = new THREE.DirectionalLight(0x9bb9d7, 1.4); rim.position.set(-3, 2, -2); scene.add(rim)
}
function remember(key: string, value: EntityPortraitResult) {
  const old = cache.get(key); if (old) { bytes -= old.src.length * 2; cache.delete(key) }
  cache.set(key, value); bytes += value.src.length * 2
  while (cache.size > MAX_CACHE || bytes > MAX_BYTES) {
    const oldest = cache.keys().next().value!; bytes -= cache.get(oldest)!.src.length * 2; cache.delete(oldest)
  }
}
export function releaseEntityPortraitStudio() {
  if (active || jobs.size) return
  window.clearTimeout(idle); idle = 0
  if (retained) { disposeCharacterModel(retained); retained = null }
  renderer?.dispose(); renderer?.forceContextLoss(); renderer = null; scene = null; camera = null
}
function scheduleIdle() { window.clearTimeout(idle); idle = window.setTimeout(releaseEntityPortraitStudio, 15000) }
async function pump() {
  if (active) return
  const job = jobs.values().next().value as Job | undefined
  if (!job) { scheduleIdle(); return }
  active = job; window.clearTimeout(idle)
  let model: THREE.Group | null = null, root: THREE.Group | null = null
  try {
    // Paint the text first; no model work runs during React render.
    await pause(); check(job); await prepare(job); check(job)
    model = buildEntityArchiveModel(job.type, job.view); builds++
    let result: EntityPortraitResult
    if (!model) result = { src: '', status: 'unavailable' }
    else {
      const started = performance.now()
      while (!retroModelReady(model)) {
        check(job); if (performance.now() - started > 10000) throw new Error('Entity texture timeout')
        await new Promise(resolve => window.setTimeout(resolve, 60))
      }
      check(job); studio()
      root = frameEntityArchive(model, camera!).root; scene!.add(root)
      await renderer!.compileAsync(scene!, camera!); check(job)
      if (renderer!.getContext().isContextLost()) throw new Error('Preview context lost')
      renderer!.render(scene!, camera!); renders++
      result = { src: renderer!.domElement.toDataURL('image/png'), status: 'ready' }
      // Keep one program owner until its replacement is rendered, avoiding recompiles.
      if (retained) disposeCharacterModel(retained)
      retained = root
    }
    remember(job.key, result)
    if (!job.abort.signal.aborted) for (const listener of job.listeners) listener(result)
  } catch {
    if (!job.abort.signal.aborted) for (const listener of job.listeners) listener({ src: '', status: 'error' })
  } finally {
    if (root) scene?.remove(root)
    if (root !== retained && model) disposeCharacterModel(root ?? model)
    if (jobs.get(job.key) === job) jobs.delete(job.key)
    active = null
    void pump()
  }
}
export function requestEntityPortrait(type: string, listener: (result: EntityPortraitResult) => void, step = 0) {
  const view = entityArchiveView(type, step).index
  const key = `${type}:${getMaterialMode()}:${view}:v2`, hit = cache.get(key)
  if (hit) { hits++; cache.delete(key); cache.set(key, hit); listener(hit); return () => {} }
  let job = jobs.get(key)
  if (!job || job.abort.signal.aborted) { job = { key, type, view, listeners: new Set(), abort: new AbortController() }; jobs.set(key, job) }
  job.listeners.add(listener); void pump()
  return () => {
    job!.listeners.delete(listener)
    if (job!.listeners.size) return
    job!.abort.abort()
    if (jobs.get(key) === job) jobs.delete(key)
  }
}
export const entityPortraitStats = () => ({ builds, renders, hits, cached: cache.size, bytes, queued: jobs.size, active: active?.type ?? null, studio: !!renderer, memory: renderer ? { ...renderer.info.memory } : null })
