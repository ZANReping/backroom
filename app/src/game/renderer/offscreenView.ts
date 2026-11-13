import { RENDER_WORKER_PROTOCOL, type RenderPose, type RenderWorkerCommand, type RenderWorkerEvent, type RenderWorkerInit } from './offscreenProtocol'

/** Isolated L1/L5/L11 rendering trial. Call only on an unused canvas; the normal
 * game backend stays intact until simulation feedback/capture paths are migrated. */
export class OffscreenLevelView {
  private readonly worker: Worker
  private sequence = 0
  private stopped = false
  private pending = false
  private latest: RenderPose | null = null
  private timer: ReturnType<typeof setTimeout>
  private resolveReady!: () => void
  private rejectReady!: (error: Error) => void
  readonly ready = new Promise<void>((resolve, reject) => { this.resolveReady = resolve; this.rejectReady = reject })
  stats: Extract<RenderWorkerEvent, { kind: 'frame' }> | null = null
  error: string | null = null
  readonly diagnostics: Extract<RenderWorkerEvent,{kind:'log'}>[] = []
  constructor(canvas: HTMLCanvasElement, init: RenderWorkerInit) {
    if (typeof Worker === 'undefined' || typeof canvas.transferControlToOffscreen !== 'function') throw new Error('Offscreen renderer is unavailable')
    this.worker = new Worker(new URL('./offscreenView.worker.ts', import.meta.url), { type: 'module' })
    this.timer = setTimeout(() => this.fail('Render Worker initialization timed out'), 30000)
    this.worker.onmessage = ({ data }: MessageEvent<RenderWorkerEvent>) => {
      if (this.stopped) return
      if (data.kind === 'log') { this.diagnostics.push(data);if(this.diagnostics.length>64)this.diagnostics.shift();return }
      if (data.kind === 'error') { this.fail(data.message); return }
      if (data.kind === 'ready') {
        if (data.protocol !== RENDER_WORKER_PROTOCOL) { this.fail('Render Worker protocol mismatch'); return }
        clearTimeout(this.timer); this.resolveReady()
      } else if(data.kind==='view-ack') {
        if(data.sequence===this.sequence)this.pending=false
        if(!this.pending&&this.latest){const pose=this.latest;this.latest=null;this.view(pose)}
      } else if (data.kind === 'frame') {
        this.stats = data
        if (data.sequence === this.sequence) this.pending = false
        if (!this.pending && this.latest) { const pose = this.latest; this.latest = null; this.view(pose) }
      }
    }
    this.worker.onerror = e => this.fail(e.message || 'Render Worker error')
    this.worker.onmessageerror = () => this.fail('Render Worker message decode failed')
    try { this.send({ kind: 'init', protocol: RENDER_WORKER_PROTOCOL, canvas: canvas.transferControlToOffscreen(), init }, true) }
    catch (error) { this.stopped=true;clearTimeout(this.timer);this.worker.terminate();throw error }
  }
  private send(command: RenderWorkerCommand, transfer = false) {
    this.worker.postMessage(command, transfer && command.kind === 'init' ? [command.canvas] : [])
  }
  private fail(message: string) { this.error = message; this.rejectReady(new Error(message)); this.dispose() }
  view(pose: RenderPose) {
    if (this.stopped) return
    if (this.pending) { this.latest = { ...pose }; return }
    this.pending = true
    this.send({ kind: 'view', sequence: ++this.sequence, pose })
  }
  resize(width: number, height: number, dpr = 1) { if (!this.stopped) this.send({ kind: 'resize', width, height, dpr }) }
  active(value: boolean) { if (!this.stopped) this.send({ kind: 'active', value }) }
  dispose() {
    if (this.stopped) return
    this.stopped = true; clearTimeout(this.timer); this.latest = null
    this.worker.postMessage({ kind: 'dispose' } satisfies RenderWorkerCommand)
    this.worker.terminate()
  }
}
