import { BufferGeometry } from './three-stub.ts'
export function mergeGeometries(geos: unknown[]): BufferGeometry | null {
  if (!Array.isArray(geos)) throw new Error('mergeGeometries: 非数组')
  if (geos.some((g) => !g)) throw new Error('mergeGeometries: 数组内含 undefined/null')
  if (!geos.length) return null
  return new BufferGeometry()
}
export function mergeVertices(g: unknown) { void g; return new BufferGeometry() }
