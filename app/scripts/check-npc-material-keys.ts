import * as THREE from 'three'
import { materialBatchKey } from '../src/game/renderer/materialBatch'

let checks = 0
const assert = (ok: boolean, label: string) => { checks++; if (!ok) throw new Error(label) }
const white = new THREE.Color(1, 1, 1)
const a = new THREE.MeshLambertMaterial({ color: '#8a3322' })
const b = new THREE.MeshLambertMaterial({ color: '#224488' })
const ar = [a.color.r, a.color.g, a.color.b]
const br = [b.color.r, b.color.g, b.color.b], aColor = a.color, bColor = b.color
assert(materialBatchKey(a) !== materialBatchKey(b), 'ordinary color differences remain distinct')
assert(materialBatchKey(a, white) === materialBatchKey(b, white), 'white override shares NPC vertex-color signature')
assert(Object.is(a.color.r, ar[0]) && Object.is(a.color.g, ar[1]) && Object.is(a.color.b, ar[2]), 'color reference values are unchanged')
assert(a.color === aColor && b.color === bColor && [b.color.r,b.color.g,b.color.b].every((v,i)=>Object.is(v,br[i])), 'both original color objects and values survive override')

const base = () => new THREE.MeshLambertMaterial({ color: '#8a3322', emissive: '#101010', opacity: .8, transparent: true, side: THREE.DoubleSide, fog: false, depthWrite: false, emissiveIntensity: .4, alphaTest: .2, vertexColors: true, map: new THREE.Texture() })
const mutations: [string, (m: THREE.MeshLambertMaterial) => void][] = [
  ['emissive', m => m.emissive.set('#202020')], ['opacity', m => { m.opacity = .7 }], ['transparent', m => { m.transparent = false }],
  ['side', m => { m.side = THREE.BackSide }], ['fog', m => { m.fog = true }], ['depthWrite', m => { m.depthWrite = true }],
  ['emissiveIntensity', m => { m.emissiveIntensity = .8 }], ['alphaTest', m => { m.alphaTest = .3 }], ['vertexColors', m => { m.vertexColors = false }],
]
for (const [name, mutate] of mutations) { const x = base(), y = x.clone(); assert(materialBatchKey(x, white) === materialBatchKey(y, white), `${name} comparison starts with identical properties and texture`); mutate(y); assert(materialBatchKey(x, white) !== materialBatchKey(y, white), `${name} remains in signature`) }
const mapA = new THREE.Texture(), mapB = new THREE.Texture(), mapMatA = base(), mapMatB = base(); mapMatA.map = mapA; mapMatB.map = mapA
assert(materialBatchKey(mapMatA, white) === materialBatchKey(mapMatB, white), 'same map reference shares signature'); mapMatB.map = mapB
assert(materialBatchKey(mapMatA, white) !== materialBatchKey(mapMatB, white), 'different map references differ')
const customA = new THREE.MeshLambertMaterial(), customB = new THREE.MeshLambertMaterial(); customB.onBeforeCompile = () => {}
assert(materialBatchKey(customA, white) !== materialBatchKey(customB, white), 'custom onBeforeCompile remains unique')
const shaderA = new THREE.ShaderMaterial({ uniforms: { u: { value: 1 } } }), shaderB = new THREE.ShaderMaterial({ uniforms: { u: { value: 1 } } })
assert(materialBatchKey(shaderA, white) !== materialBatchKey(shaderB, white), 'ShaderMaterial remains unique')
const unchanged = new THREE.Color().copy(a.color); materialBatchKey(a, white); assert(a.color.equals(unchanged), 'override never mutates source color')
console.log(`NPC material key regression passed: ${checks} checks`)
