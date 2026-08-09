import * as THREE from 'three'
;(globalThis as unknown as Record<string, unknown>).document = {
  createElement: () => ({ width: 1, height: 1, getContext: () => null, style: {} }),
  getElementById: () => null, body: { appendChild: () => {} },
}
const { buildEntityMesh } = await import('../src/game/renderer/entitiesMesh.ts')
const g = buildEntityMesh('dryshrimp')
g.updateMatrixWorld(true)
const parts = g.userData.parts as Record<string, THREE.Object3D>
for (const k of ['head', 'tail', 'torso']) {
  const b = new THREE.Box3().setFromObject(parts[k])
  const c = b.getCenter(new THREE.Vector3())
  console.log(`${k}: 质心 (${c.x.toFixed(2)}, ${c.z.toFixed(2)})`)
}
console.log('头应在 +X、尾应在 -X')
