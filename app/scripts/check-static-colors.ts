import assert from 'node:assert/strict'
import * as THREE from 'three'
import { batchStaticColorsJob } from '../src/game/renderer/staticColors'

let checks = 0
const check = (value: boolean, label: string) => { checks++; assert.ok(value, label) }
const bytes = (a: ArrayLike<number> & { buffer: ArrayBufferLike; byteOffset: number; byteLength: number }) => new Uint8Array(a.buffer, a.byteOffset, a.byteLength)
const makeGeometry = (offset = 0) => {
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute([offset, 0, 0, offset + 1, 0, 0, offset, 1, 0], 3))
  g.setAttribute('normal', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 0, 0, 1], 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1], 2))
  g.setIndex([0, 1, 2])
  return g
}
const mesh = (geometry: THREE.BufferGeometry, color: number, material = new THREE.MeshLambertMaterial({ color })) => new THREE.Mesh(geometry, material)
const run = (target: THREE.Group) => { const job = batchStaticColorsJob(target); while (!job.next().done) {} }

const target = new THREE.Group()
const firstGeometry = makeGeometry(), secondGeometry = makeGeometry(2)
const first = mesh(firstGeometry, 0xff0000), second = mesh(secondGeometry, 0x00ff00)
const firstPosition = bytes(firstGeometry.getAttribute('position').array as any).slice(), firstNormal = bytes(firstGeometry.getAttribute('normal').array as any).slice(), firstUv = bytes(firstGeometry.getAttribute('uv').array as any).slice(), firstIndex = bytes(firstGeometry.index!.array as any).slice()
const originalColor = first.material.color.clone(), originalVertexColors = first.material.vertexColors
let firstDisposals = 0, secondDisposals = 0
const firstDispose = firstGeometry.dispose.bind(firstGeometry), secondDispose = secondGeometry.dispose.bind(secondGeometry)
firstGeometry.dispose = () => { firstDisposals++; firstDispose() }; secondGeometry.dispose = () => { secondDisposals++; secondDispose() }
target.add(first, second); run(target)
const merged = target.children.find(child => child.name === 'static-color-batch') as THREE.Mesh
check(!!merged && target.children.length === 1, 'equivalent colors merge into one mesh')
check(first.material.color.equals(originalColor) && first.material.vertexColors === originalVertexColors, 'original material unchanged')
check(bytes(firstGeometry.getAttribute('position').array as any).every((v, i) => v === firstPosition[i]), 'positions unchanged')
check(bytes(firstGeometry.getAttribute('normal').array as any).every((v, i) => v === firstNormal[i]), 'normals unchanged')
check(bytes(firstGeometry.getAttribute('uv').array as any).every((v, i) => v === firstUv[i]), 'uvs unchanged')
check(bytes(firstGeometry.index!.array as any).every((v, i) => v === firstIndex[i]), 'indices unchanged')
const mergedColors = merged.geometry.getAttribute('color').array as Float32Array
assert.deepEqual(mergedColors,new Float32Array([1,0,0,1,0,0,1,0,0,0,1,0,0,1,0,0,1,0])); checks++
for(const name of ['position','normal','uv']) {
  const expected = new Float32Array([...firstGeometry.getAttribute(name).array,...secondGeometry.getAttribute(name).array])
  assert.deepEqual(bytes(merged.geometry.getAttribute(name).array as any),bytes(expected),`merged ${name} preserves source byte order`);checks++
}
assert.deepEqual(Array.from(merged.geometry.index!.array),[0,1,2,3,4,5]);checks++
check(merged.material.vertexColors === true && merged.material.color.equals(new THREE.Color(1, 1, 1)), 'merged material is white vertex-color material')
check(firstDisposals === 1 && secondDisposals === 1, 'consumed source geometry disposed once')
let mergedMaterialDisposals = 0; const disposeMergedMaterial = merged.material.dispose.bind(merged.material); merged.material.dispose = () => { mergedMaterialDisposals++; disposeMergedMaterial() }
merged.geometry.dispose(); merged.geometry.dispose(); check(mergedMaterialDisposals === 1, 'merged material disposed once with repeated geometry disposal')

const excluded = new THREE.Group()
const differing = mesh(makeGeometry(), 0xff0000), emissive = mesh(makeGeometry(2), 0x00ff00)
;(emissive.material as THREE.MeshLambertMaterial).emissive.set(0x101010)
const textured = mesh(makeGeometry(4), 0x0000ff); (textured.material as THREE.MeshLambertMaterial).map = new THREE.Texture()
const transparent = mesh(makeGeometry(6), 0xffffff); transparent.material.transparent = true
const precolored = mesh(makeGeometry(8), 0xffffff); precolored.geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(9), 3))
const transformed = mesh(makeGeometry(10), 0xffffff); transformed.position.x = 1
const instanced = new THREE.InstancedMesh(makeGeometry(12), new THREE.MeshBasicMaterial({ color: 0xffffff }), 1)
const morph = mesh(makeGeometry(14), 0xffffff); morph.geometry.morphAttributes.position = [new THREE.Float32BufferAttribute(new Float32Array(9), 3)]
const ordered = mesh(makeGeometry(16), 0xffffff); ordered.renderOrder = 1
const callback = mesh(makeGeometry(18), 0xffffff); callback.onBeforeRender = () => {}
for (const object of [differing, emissive, textured, transparent, precolored, transformed, instanced, morph, ordered, callback]) excluded.add(object)
run(excluded)
check(excluded.children.length === 10, 'incompatible meshes remain unmerged')
check(excluded.children.includes(differing) && excluded.children.includes(emissive) && excluded.children.includes(textured), 'material state differences exclude merging')
check(excluded.children.includes(transparent) && excluded.children.includes(precolored) && excluded.children.includes(transformed), 'render state differences exclude merging')
check(excluded.children.includes(instanced) && excluded.children.includes(morph) && excluded.children.includes(ordered) && excluded.children.includes(callback), 'structural and callback differences exclude merging')

const cancelled = new THREE.Group(), cancelA = mesh(makeGeometry(), 0xff0000), cancelB = mesh(makeGeometry(2), 0x00ff00)
cancelled.add(cancelA, cancelB); const cancelledJob = batchStaticColorsJob(cancelled)
const disposals=new Map<THREE.BufferGeometry,number>(),dispose=THREE.BufferGeometry.prototype.dispose
THREE.BufferGeometry.prototype.dispose=function(){disposals.set(this,(disposals.get(this)??0)+1);dispose.call(this)}
try {
  check(cancelledJob.next().done === false, 'job yields before consuming sources')
  check(cancelledJob.next().done === false, 'job suspends after allocating the first temporary buffer')
  cancelledJob.return(undefined);cancelledJob.return(undefined)
  check(cancelled.children.length === 2 && cancelled.children.includes(cancelA) && cancelled.children.includes(cancelB), 'cancel leaves originals attached')
  check(!disposals.has(cancelA.geometry)&&!disposals.has(cancelB.geometry),'cancel leaves both source geometries alive')
  check(disposals.size===1&&[...disposals.values()][0]===1,'cancel disposes its allocated intermediate exactly once')
} finally {THREE.BufferGeometry.prototype.dispose=dispose}

for(const different of ['depthFunc','map','emissive','userData'] as const) {
  const group=new THREE.Group(),a=mesh(makeGeometry(),0x874921),b=mesh(makeGeometry(2),0x524799)
  if(different==='depthFunc')b.material.depthFunc=THREE.GreaterDepth
  if(different==='map')b.material.map=new THREE.Texture()
  if(different==='emissive')b.material.emissive.setHex(0x221122)
  if(different==='userData')b.material.userData={pulse:1}
  group.add(a,b);run(group);check(group.children.includes(a)&&group.children.includes(b),`${different} state remains separate`)
}
const basic=new THREE.Group()
basic.add(new THREE.Mesh(makeGeometry(),new THREE.MeshBasicMaterial({color:0x123456})),new THREE.Mesh(makeGeometry(2),new THREE.MeshBasicMaterial({color:0x654321})))
run(basic);check(basic.children.length===1,'Basic materials also merge')
const basicMesh=basic.children[0] as THREE.Mesh<THREE.BufferGeometry,THREE.MeshBasicMaterial>
check(basicMesh.material.isMeshBasicMaterial&&basicMesh.material.vertexColors,'Basic shading model retained')
console.log(`static colors regression passed: ${checks} checks`)
