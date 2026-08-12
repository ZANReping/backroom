// 真实 three 构建 Gamma 地形，从前厅/中庭各格向上射线找可见黑洞
;(globalThis as any).window = { addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false }) }
const ctx2d = new Proxy({}, { get: (_t, k) => {
  if (k === 'canvas') return { width: 128, height: 128 }
  if (typeof k === 'string' && /Style|font|Width|Alpha|Align|Baseline|Cap|Join|Operation|filter|Blur|Color/.test(k)) return ''
  return (...a: unknown[]) => { void a; return k === 'measureText' ? { width: 10 } : k === 'createLinearGradient' || k === 'createRadialGradient' ? { addColorStop: () => {} } : k === 'getImageData' || k === 'createImageData' ? { data: new Uint8ClampedArray(4 * 128 * 128) } : undefined }
} }) as any
;(globalThis as any).document = {
  createElement: (t: string) => t === 'canvas'
    ? { width: 128, height: 128, getContext: () => ctx2d, toDataURL: () => 'data:,' }
    : { width: 1, height: 1, getContext: () => null, style: {} },
  getElementById: () => null, addEventListener() {}, removeEventListener() {}, body: { appendChild() {} },
}
const { levelDefOf } = await import('../src/game/levels/index.ts')
const { generateLevel } = await import('../src/game/world/mapgen.ts')
const THREE = await import('three')
const { buildTerrain } = await import('../src/game/renderer/geometry.ts')
const def = levelDefOf(106)!
const m = generateLevel(def, 424242, true)
const g = new THREE.Group()
buildTerrain(m, def, 3, g as any)
g.updateMatrixWorld(true)
const ray = new THREE.Raycaster()
// 1F 前厅/迎宾廊/大厅北缘 + 凹龛：从 z=0.2 向上
const spots: [number, number][] = []
for (let y = 8; y <= 17; y++) for (let x = 33; x <= 46; x++) spots.push([x, y])
for (let y = 1; y <= 7; y++) for (let x = 38; x <= 41; x++) spots.push([x, y])
for (const [x, y] of spots) {
  const i = y * m.w + x
  if (m.tiles[i] !== 1) continue
  ray.set(new THREE.Vector3(x + 0.5, 0.2, y + 0.5), new THREE.Vector3(0, 1, 0))
  const hits = ray.intersectObject(g, true).filter((h) => h.face && h.face.normal.y < -0.3) // 只数朝下的面（头顶覆盖）
  if (!hits.length) console.log(`1F HOLE (${x},${y}) up=${m.up[i]} up2=${m.up2[i]} upWall2=${m.upWall2[i]} ceil=${m.ceiling[i]}`)
}
// 2F 平台（资料室上方）z=3.2 向上
for (let y = 9; y <= 17; y++) for (let x = 62; x <= 73; x++) {
  const i = y * m.w + x
  if (m.up[i] !== 1 || m.upWall[i] === 1) continue
  ray.set(new THREE.Vector3(x + 0.5, 3.2, y + 0.5), new THREE.Vector3(0, 1, 0))
  const hits = ray.intersectObject(g, true).filter((h) => h.face && h.face.normal.y < -0.3)
  if (!hits.length) console.log(`2F HOLE (${x},${y}) up2=${m.up2[i]} upWall2=${m.upWall2[i]} stair=${m.stair[i] & 7}`)
}
console.log('done')
