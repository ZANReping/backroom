// 全实体朝向审计：构建后（含 facesZ 包装）face 标记件质心应偏 +X；偏移 >40° 报警
import * as THREE from 'three'
;(globalThis as unknown as Record<string, unknown>).document = {
  createElement: () => ({ width: 1, height: 1, getContext: () => null, style: {} }),
  getElementById: () => null, body: { appendChild: () => {} },
}
const { buildEntityMesh } = await import('../src/game/renderer/entitiesMesh.ts')
const { ENTITIES } = await import('../src/game/entities/index.ts')

let bad = 0
for (const t of Object.keys(ENTITIES)) {
  const g = buildEntityMesh(t)
  g.updateMatrixWorld(true)
  const faces: THREE.Vector3[] = []
  g.traverse((o) => {
    const m = o as THREE.Mesh
    if (m.isMesh && o.userData.face === 1) {
      const p = new THREE.Vector3()
      new THREE.Box3().setFromObject(m).getCenter(p)
      faces.push(p)
    }
  })
  if (!faces.length) { console.log(`  - ${t}: 无 face 标记件（跳过）`); continue }
  const c = faces.reduce((a, v) => a.add(v), new THREE.Vector3()).divideScalar(faces.length)
  const ang = Math.atan2(-c.z, c.x) * 180 / Math.PI // 相对 +X 的偏航角（世界 z 向下为正时取 -z）
  const r = Math.hypot(c.x, c.z)
  const ok = r < 0.03 || Math.abs(ang) < 40
  if (!ok) bad++
  console.log(`  ${ok ? '✓' : '✗'} ${t}: face×${faces.length} 质心(${c.x.toFixed(2)},${c.z.toFixed(2)}) 偏航 ${ang.toFixed(0)}°${r < 0.03 ? '（居中/对称）' : ''}`)
}
console.log(bad ? `\n✗ ${bad} 种实体朝向异常` : '\n✓ 全部实体正面 = +X')
