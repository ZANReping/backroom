import * as THREE from 'three'

type AttributePacket = { array: THREE.TypedArray; itemSize: number; normalized: boolean }
export type GeometryPacket = {
  tag: 'geometry-v1'; attributes: Record<string, AttributePacket>; index: AttributePacket | null
  groups: { start: number; count: number; materialIndex?: number }[]; drawRange: { start: number; count: number }
  sphere: { center: number[]; radius: number } | null; box: { min: number[]; max: number[] } | null
}
export type GeometryTree = null | number | string | boolean | GeometryPacket | { [key: string]: GeometryTree }
/** Worker cache stays valid: transfer copies of its immutable geometry arrays. */
export function packGeometryTree(value: unknown, transfer: ArrayBuffer[] = []): GeometryTree {
  if (value === null || typeof value === 'number' || typeof value === 'string' || typeof value === 'boolean') return value
  if ((value as THREE.BufferGeometry)?.isBufferGeometry) {
    const g = value as THREE.BufferGeometry
    if(Object.keys(g.morphAttributes).length)throw new Error('Morph geometry needs an explicit packet')
    const attr = (a: THREE.BufferAttribute): AttributePacket => {
      const array = a.array.slice() as THREE.TypedArray; transfer.push(array.buffer as ArrayBuffer)
      return { array, itemSize: a.itemSize, normalized: a.normalized }
    }
    return { tag: 'geometry-v1', attributes: Object.fromEntries(Object.entries(g.attributes).map(([name, a]) => {
      if ((a as THREE.InterleavedBufferAttribute).isInterleavedBufferAttribute) throw new Error('Interleaved geometry requires an explicit packet')
      return [name, attr(a as THREE.BufferAttribute)]
    })), index: g.index ? attr(g.index) : null, groups: g.groups.map(g => ({ ...g })), drawRange: { ...g.drawRange },
      sphere: g.boundingSphere ? { center: g.boundingSphere.center.toArray(), radius: g.boundingSphere.radius } : null,
      box: g.boundingBox ? { min: g.boundingBox.min.toArray(), max: g.boundingBox.max.toArray() } : null }
  }
  if (typeof value !== 'object' || !value) throw new Error('Unsupported geometry metadata')
  return Object.fromEntries(Object.entries(value).map(([key, v]) => [key, packGeometryTree(v, transfer)]))
}
export function unpackGeometryTree(value: GeometryTree): unknown {
  if (!value || typeof value !== 'object') return value
  if (value.tag === 'geometry-v1') {
    const p = value as GeometryPacket, g = new THREE.BufferGeometry()
    for (const [name, a] of Object.entries(p.attributes)) g.setAttribute(name, new THREE.BufferAttribute(a.array, a.itemSize, a.normalized))
    if (p.index) g.setIndex(new THREE.BufferAttribute(p.index.array, p.index.itemSize, p.index.normalized))
    for (const group of p.groups) g.addGroup(group.start, group.count, group.materialIndex)
    g.setDrawRange(p.drawRange.start, p.drawRange.count)
    if (p.sphere) g.boundingSphere = new THREE.Sphere(new THREE.Vector3().fromArray(p.sphere.center), p.sphere.radius)
    if (p.box) g.boundingBox = new THREE.Box3(new THREE.Vector3().fromArray(p.box.min), new THREE.Vector3().fromArray(p.box.max))
    return g
  }
  return Object.fromEntries(Object.entries(value).map(([key, v]) => [key, unpackGeometryTree(v as GeometryTree)]))
}
