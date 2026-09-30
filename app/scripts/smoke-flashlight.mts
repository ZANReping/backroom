import assert from 'node:assert/strict'
import * as THREE from 'three'
import { buildFlashlightMesh } from '../src/game/renderer/flashlightMesh'

const meshByPart = (root: THREE.Object3D, part: string) => {
  let found: THREE.Mesh | null = null
  root.traverse((o) => {
    if ((o as THREE.Mesh).isMesh && o.userData.flashlightPart === part) found = o as THREE.Mesh
  })
  assert.ok(found, `missing flashlight part: ${part}`)
  return found
}

const uvRange = (mesh: THREE.Mesh) => {
  const uv = mesh.geometry.getAttribute('uv') as THREE.BufferAttribute
  let min = Infinity, max = -Infinity
  for (let i = 0; i < uv.count; i++) {
    min = Math.min(min, uv.getX(i))
    max = Math.max(max, uv.getX(i))
  }
  return { min, max }
}

const held = buildFlashlightMesh({ lit: true })
const required = [
  'tail-cap', 'tail-switch', 'knurled-grip', 'side-switch', 'pocket-clip',
  'neck', 'cooling-fin-1', 'flared-head', 'anti-roll-ring', 'reflector-cup',
  'glass-lens', 'led-emitter', 'lanyard-loop',
]
for (const part of required) meshByPart(held, part)
assert.ok(held.children.length >= 20, 'flashlight should keep the refined multi-part silhouette')

const metalUv = uvRange(meshByPart(held, 'tail-cap'))
assert.ok(metalUv.min >= 0.009 && metalUv.max <= 0.491, 'metal geometry UV must stay in the atlas left panel')
const rubberUv = uvRange(meshByPart(held, 'knurled-grip'))
assert.ok(rubberUv.min >= 0.509 && rubberUv.max <= 0.991, 'rubber geometry UV must stay in the atlas right panel')

const heldLens = meshByPart(held, 'glass-lens').material as THREE.MeshPhysicalMaterial
assert.ok(heldLens.emissiveIntensity > 0, 'lit viewmodel lens should glow')
const ground = buildFlashlightMesh({ lit: false, orientation: 'ground' })
const groundLens = meshByPart(ground, 'glass-lens').material as THREE.MeshPhysicalMaterial
assert.equal(groundLens.emissiveIntensity, 0, 'ground flashlight lens must not self-illuminate')
assert.ok(Math.abs(ground.rotation.y + Math.PI / 2) < 1e-6, 'ground flashlight should lie along +X')

console.log('Flashlight smoke passed: refined parts, atlas UV panels, lit/ground variants')
