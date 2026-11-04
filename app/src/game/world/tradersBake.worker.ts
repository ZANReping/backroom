import { tradersIrradiance } from '../renderer/tradersBakedLighting'
const scope = globalThis as unknown as {
  onmessage: (event: MessageEvent<{ id: number; positions: Float32Array; normals: Float32Array }>) => void
  postMessage: (data: { id: number; colors?: Float32Array }, transfer?: Transferable[]) => void
}
scope.onmessage = ({ data }) => {
  try {
    const { positions: p, normals: n } = data, colors = new Float32Array(p.length)
    if (p.length !== n.length || p.length % 3) throw Error('Invalid static bake attributes')
    for (let i = 0; i < p.length; i += 3) colors.set(tradersIrradiance(p[i], p[i + 1], p[i + 2], n[i], n[i + 1], n[i + 2]), i)
    scope.postMessage({ id: data.id, colors }, [colors.buffer])
  } catch { scope.postMessage({ id: data.id }) }
}
