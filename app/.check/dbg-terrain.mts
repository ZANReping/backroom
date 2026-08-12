;(globalThis as any).window = { addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false }) }
const ctx2d = new Proxy({}, { get: (_t, k) => {
  if (k === 'canvas') return { width: 128, height: 128 }
  return (...a: unknown[]) => { void a; return k === 'measureText' ? { width: 10 } : k === 'createLinearGradient' || k === 'createRadialGradient' ? { addColorStop: () => {} } : k === 'getImageData' || k === 'createImageData' ? { data: new Uint8ClampedArray(4 * 128 * 128) } : undefined }
} }) as unknown as CanvasRenderingContext2D
;(globalThis as any).document = {
  createElement: (t: string) => t === 'canvas'
    ? { width: 128, height: 128, getContext: () => ctx2d, toDataURL: () => 'data:,' }
    : { width: 1, height: 1, getContext: () => null, style: {} },
  getElementById: () => null, addEventListener() {}, removeEventListener() {}, body: { appendChild() {} },
}
const THREE = await import('three')
const { levelDefOf } = await import('../src/game/levels/index.ts')
const { generateLevel } = await import('../src/game/world/mapgen.ts')
const { buildTerrain } = await import('../src/game/renderer/geometry.ts')
const m = generateLevel(levelDefOf(106)!, 424242, true)
const g = new THREE.Group()
buildTerrain(m, levelDefOf(106)!, 3, g)
g.traverse((o) => {
  const mm = o as THREE.Mesh
  if (!mm.isMesh) return
  const pos = mm.geometry.attributes.position
  let cnt = 0
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i)
    if (x > 35.9 && x < 37.1 && z > 14.9 && z < 16.1 && y > 0.4 && y < 2.5) cnt++
  }
  if (cnt) console.log('MESH with verts in window tile:', mm.geometry.type, 'verts:', cnt, 'total:', pos.count)
})
console.log('done')
