import { prepareBeastGeometry } from './beastMesh'
import { prepareSpokesGeometry } from './spokesMesh'
import { buildChefGeometry } from './chefMesh'
import { packGeometryTree } from './geometryPacket'
self.onmessage = ({ data }: MessageEvent<{ id: number; kind: 'beast' | 'spokes' | 'chef'; lod: number }>) => {
  try {
    const started = performance.now()
    const drain = <T>(task: Generator<void, T>) => { let step = task.next(); while (!step.done) step = task.next(); return step.value }
    const built = data.kind === 'beast' ? drain(prepareBeastGeometry(data.lod, false))
      : data.kind === 'spokes' ? drain(prepareSpokesGeometry(data.lod, false)) : buildChefGeometry(data.lod)
    const transfer: ArrayBuffer[] = [], tree = packGeometryTree(built, transfer)
    self.postMessage({ id: data.id, tree, ms: performance.now() - started }, { transfer })
  } catch (error) { self.postMessage({ id: data.id, error: String(error) }) }
}
