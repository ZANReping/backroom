// 前厅 RealityBreak 3D：回程终点抓取的「周围世界」六面图集（渲染层生产，过场消费，只取一次）。
export interface BreakCubeCapture {
  /** 3×2 图集：第 i 面在 列 i%3、行 ⌊i/3⌋（自上而下），每面 face×face 像素。 */
  atlas: HTMLCanvasElement
  face: number
  /** 6 面 × [右 xyz, 上 xyz, 前 xyz]（世界坐标，单位向量）。 */
  bases: number[]
  /** 地面相对眼睛的高度（负数，米）。 */
  groundY: number
  /** 抓取时游戏相机朝向（四元数 xyzw）与竖直视场角。 */
  quat: [number, number, number, number]
  fov: number
  bg: number
}

type Capturer = (canvas: HTMLCanvasElement, signal: AbortSignal) => Promise<BreakCubeCapture | null>
let capturer: Capturer | null = null
let prepare: (() => void) | null = null, release: (() => void) | null = null
let prepared = false, cube: BreakCubeCapture | null = null, epoch = 0, controller: AbortController | null = null
export function setBreakCubeCapturer(fn: Capturer | null, prewarm: (() => void) | null = null, reset: (() => void) | null = null) {
  resetBreakCube(); capturer = fn; prepare = prewarm; release = reset
}
export function prepareBreakCube() { if (!prepared) { prepared = true; prepare?.() } }
export function captureBreakCube(canvas: HTMLCanvasElement) {
  if (!capturer || controller) return
  const token = epoch, abort = new AbortController(); controller = abort
  void capturer(canvas,abort.signal).then(c => { if (token === epoch && !abort.signal.aborted) cube = c }).catch(() => {})
}
export function resetBreakCube() { epoch++; controller?.abort(); controller = null; cube = null; prepared = false; release?.() }
/** Consuming cancels unfinished work, so it cannot publish into a later run. */
export function takeBreakCube(): BreakCubeCapture | null {
  const c = cube; cube = null; epoch++; controller?.abort(); controller = null; prepared = false; return c
}
