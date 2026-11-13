import { traceMapSight, type SightField, type SightQuery } from './mapSightTrace'

let field: SightField | undefined, fieldId = 0
self.onmessage = ({ data }: MessageEvent<{ id: number; fieldId: number; field?: SightField; query: SightQuery }>) => {
  try {
    if (data.field) { field = data.field; fieldId = data.fieldId }
    if (!field || data.fieldId !== fieldId) throw new Error('Missing sight field')
    const started = performance.now(), sight = traceMapSight(field, data.query)
    const cells = new Uint32Array(sight.cells)
    self.postMessage({ id: data.id, cells, ms: performance.now() - started }, { transfer: [cells.buffer] })
  } catch (error) { self.postMessage({ id: data.id, error: String(error) }) }
}
