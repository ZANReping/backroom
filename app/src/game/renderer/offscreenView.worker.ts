import { RENDER_WORKER_PROTOCOL, type RenderWorkerCommand, type RenderWorkerEvent, type RenderWorkerInit, type RenderPose } from './offscreenProtocol'
import { installOffscreenPlatform } from './offscreenPlatform'
import { Engine } from '../engine'
import { Renderer3D } from './renderer'
import { look } from './shared'
import { audio } from '../core/audio'
import { storage } from '../core/storage'

let renderer: Renderer3D | null = null, engine: Engine | null = null, canvas: OffscreenCanvas | null = null
let pose: RenderPose | null = null, sequence = 0, frames = 0, active = true, raf = 0, last = 0, reportAt = 0, disposed = false
const send = (event: RenderWorkerEvent) => self.postMessage(event)
function stop() { disposed = true; cancelAnimationFrame(raf); renderer?.dispose(); renderer = null; engine = null; canvas = null }
function frame(now: number) {
  if (disposed || !renderer || !engine || !canvas || !pose) return
  raf = requestAnimationFrame(frame)
  if (!active) { last = now; return }
  const dt = Math.min(.05, Math.max(0, (now - (last || now)) / 1000)); last = now
  try {
    Object.assign(engine.player, { x: pose.worldX-(engine.map?.inf?.ox??0), y: pose.worldY-(engine.map?.inf?.oy??0), z: pose.z })
    engine.updateInfiniteWindow()
    engine.time = pose.time; look.yaw = pose.yaw; look.pitch = pose.pitch
    const start = performance.now()
    renderer.beginFrameStats()
    renderer.render(canvas, engine, { grain: false, flicker: 0, shake: false }, dt)
    frames++
    if (now - reportAt > 100) {
      reportAt = now
      send({ kind: 'frame', worldX:engine.player.x+(engine.map?.inf?.ox??0),worldY:engine.player.y+(engine.map?.inf?.oy??0),originX:engine.map?.inf?.ox??0,originY:engine.map?.inf?.oy??0,width:canvas.width,height:canvas.height, at:performance.timeOrigin+now, frames, sequence, ready: renderer.isTitleWorldReady(engine) && !renderer.getPreparationStats().distant && renderer.getPreparationStats().chunks===0, cpuMs: performance.now() - start, ...renderer.getFrameStats() })
    }
  } catch (error) { send({ kind: 'error', message: error instanceof Error ? error.stack ?? error.message : String(error) }); stop() }
}
function init(target: OffscreenCanvas, options: RenderWorkerInit) {
  for(const level of ['warn','error'] as const){const original=console[level].bind(console);console[level]=(...args:unknown[])=>{original(...args);send({kind:'log',level,message:args.map(String).join(' ').slice(0,4000)})}}
  installOffscreenPlatform(options.width, options.height, options.assetBase)
  storage.get = () => null; storage.set = () => {}; storage.remove = () => {}
  audio.setMuted(true)
  canvas = target; engine = new Engine()
  engine.seed = options.seed
  if(options.level===5)engine.hotel.floor=options.floor??1
  engine.loadLevel(options.level, { mapSeed: options.seed, firstVisit: false, ...(options.level === 5 ? { l5Floor: options.floor ?? 1 } : {}) })
  engine.introT = 0; engine.paused = true; engine.dev.frozenAI = true; engine.dev.statLock = true; engine.dev.god = true
  pose = options.pose
  renderer = new Renderer3D(canvas)
  renderer.resize(options.width, options.height, options.dpr)
  renderer.setLightMode(options.mode); renderer.setTextureQuality(2); renderer.setSceneLightLimit(16)
  renderer.setChunkBudget(2); renderer.setLoadingBudget(4); renderer.setDetailDistance(.65)
  renderer.setShadows(true); renderer.setBloomFx(true)
  renderer.beginFrameStats()
  send({ kind: 'ready', protocol: RENDER_WORKER_PROTOCOL })
  raf = requestAnimationFrame(frame)
}
self.onmessage = ({ data }: MessageEvent<RenderWorkerCommand>) => {
  try {
    if (data.kind === 'init') {
      if (data.protocol !== RENDER_WORKER_PROTOCOL || renderer) throw new Error('Invalid rendering initialization')
      init(data.canvas, data.init)
    } else if (data.kind === 'view' && data.sequence > sequence) { sequence = data.sequence; pose = data.pose; send({kind:'view-ack',sequence}) }
    else if (data.kind === 'resize') {
      Object.assign(globalThis, { innerWidth: data.width, innerHeight: data.height })
      renderer?.resize(data.width, data.height, data.dpr)
    } else if (data.kind === 'active') active = data.value
    else if (data.kind === 'dispose') stop()
  } catch (error) { send({ kind: 'error', message: error instanceof Error ? error.stack ?? error.message : String(error) }); stop() }
}
