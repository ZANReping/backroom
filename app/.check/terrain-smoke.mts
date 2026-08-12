// 真实 three 的地形构建冒烟（.check/tsconfig.real.json ——不用 three-stub！）：
// 桩 three 的 mergeGeometries 不会校验属性/索引一致性，会掩盖真实 three 的
// 「索引与非索引混并 → mergeGeometries 返回 null → Mesh(null) 抛异常」级事故
// （v46 EL3A 楼梯踏步 BoxGeometry 未 toNonIndexed，整层只渲染得出 NPC 的教训）。
// 用法：npx tsx --tsconfig .check/tsconfig.real.json .check/terrain-smoke.mts
const ctx2d = new Proxy({}, { get: (_t, k) => {
  if (k === 'canvas') return { width: 128, height: 128 }
  if (typeof k === 'string' && /Style|font|Alpha|Align|Baseline|Cap|Join|Operation|filter|shadow/.test(k)) return ''
  return (...a: unknown[]) => { void a; return k === 'measureText' ? { width: 10 } : k === 'createLinearGradient' || k === 'createRadialGradient' ? { addColorStop: () => {} } : k === 'getImageData' || k === 'createImageData' ? { data: new Uint8ClampedArray(4 * 128 * 128) } : undefined }
} })
;(globalThis as unknown as Record<string, unknown>).window = { addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false }) }
;(globalThis as unknown as Record<string, unknown>).document = {
  createElement: (t: string) => t === 'canvas' ? { width: 128, height: 128, getContext: () => ctx2d, toDataURL: () => 'data:,' } : { style: {}, appendChild: () => {}, setAttribute: () => {} },
  getElementById: () => null, addEventListener() {}, removeEventListener() {}, body: { appendChild() {} },
}
const { LEVELS, levelDefOf } = await import('../src/game/levels/index.ts')
const { generateLevel } = await import('../src/game/world/mapgen.ts')
const THREE = await import('three')
const { buildTerrain } = await import('../src/game/renderer/geometry.ts')
if (!THREE.REVISION) { console.log('✗ three 是桩而非真实 three——请用 tsconfig.real.json 运行'); process.exit(1) }

let fail = 0
const bad = (m: string) => { console.log('  ✗ ' + m); fail++ }
const ok = (m: string) => console.log('  ✓ ' + m)

// 全层级 + 全部据点（含多层 L4/L5/L274/EL3A/Gemma；v54：存储设施 107 / 蓝色救赎 108）
const defs = [...LEVELS, ...[101, 102, 103, 104, 105, 274, 106, 107, 108, 109, 110, 111, 112].map((id) => levelDefOf(id)!)]
for (const def of defs) {
  for (const seed of [424242, 1337]) {
    try {
      const m = generateLevel(def, seed, true)
      const g = new THREE.Group()
      buildTerrain(m, def, 3, g)
      let meshes = 0, empty = 0, nan = 0
      g.traverse((o) => {
        const mesh = o as THREE.Mesh
        if (!mesh.isMesh) return
        meshes++
        const geo = mesh.geometry as THREE.BufferGeometry
        const pos = geo.attributes?.position
        if (!pos || pos.count === 0) { empty++; return }
        geo.computeBoundingSphere()
        if (geo.boundingSphere && Number.isNaN(geo.boundingSphere.radius)) nan++
      })
      if (empty || nan || meshes === 0) bad(`[${def.name}](id ${def.id}, seed ${seed}) meshes=${meshes} 空网格=${empty} NaN=${nan}`)
    } catch (e) {
      bad(`[${def.name}](id ${def.id}, seed ${seed}) 构建抛异常：${(e as Error).message}`)
    }
  }
  ok(`[${def.name}](id ${def.id}) 真实 three 地形构建正常`)
}

if (fail) { console.log(`\n✗ ${fail} 项失败`); process.exit(1) }
console.log('\n✓ 真实 three 地形冒烟全部通过')
