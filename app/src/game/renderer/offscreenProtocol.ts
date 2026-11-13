/** Experimental view protocol. Only a deterministic scene descriptor and compact
 * camera observations cross this boundary; no Engine/Three object is cloned. */
export const RENDER_WORKER_PROTOCOL = 1
export type RenderPose = { worldX: number; worldY: number; z: number; yaw: number; pitch: number; time: number }
export type RenderWorkerInit = {
  level: 1 | 5 | 11; seed: number; floor?: number; mode: 'classic' | 'realistic'
  width: number; height: number; dpr: number; assetBase: string; pose: RenderPose
}
export type RenderWorkerCommand =
  | { kind: 'init'; protocol: number; canvas: OffscreenCanvas; init: RenderWorkerInit }
  | { kind: 'view'; sequence: number; pose: RenderPose }
  | { kind: 'resize'; width: number; height: number; dpr: number }
  | { kind: 'active'; value: boolean }
  | { kind: 'dispose' }
export type RenderWorkerEvent =
  | { kind: 'ready'; protocol: number }
  | { kind: 'view-ack'; sequence: number }
  | { kind: 'frame'; worldX:number; worldY:number; originX:number; originY:number; width:number; height:number; at:number; frames: number; sequence: number; ready: boolean; cpuMs: number; calls: number; triangles: number; textures: number; geometries: number }
  | { kind: 'log'; level:'warn'|'error'; message:string }
  | { kind: 'error'; message: string }
