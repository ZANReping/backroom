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
if (!THREE.REVISION) { console.log('stub!'); process.exit(1) }
const { levelDefOf } = await import('../src/game/levels/index.ts')
const { generateLevel } = await import('../src/game/world/mapgen.ts')
const { buildStructure } = await import('../src/game/renderer/structures.ts')
const m = generateLevel(levelDefOf(106)!, 424242, true)
const s = m.structures.find((s2) => s2.kind === 'wallwindow')!
const g = buildStructure(s, levelDefOf(106)!, m, 3.0)
console.log('wallwindow group:', !!g, 'children:', g?.children.length)
g?.traverse((o) => { const mm = o as THREE.Mesh; if (mm.isMesh) console.log(' mesh', mm.geometry.type, (mm.material as THREE.Material).type) })
