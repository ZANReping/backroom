import assert from 'node:assert/strict'
import * as THREE from 'three'
import { afterRendererCompile, afterSceneCompile, compileSceneJob } from '../src/game/renderer/sceneWarmup'

type Call = { objects: THREE.Object3D[]; resolve: () => void; reject: () => void }
const root = new THREE.Group(), camera = new THREE.PerspectiveCamera(), scene = new THREE.Scene()
camera.layers.enable(0); camera.layers.disable(1)
const before = new Map<THREE.Object3D, { parent: THREE.Object3D | null; children: THREE.Object3D[]; visible: boolean; matrix: number[]; mask: number }>()
const remember = (o: THREE.Object3D) => { before.set(o, { parent: o.parent, children: [...o.children], visible: o.visible, matrix: o.matrix.toArray(), mask: o.layers.mask }) }
for (let i = 0; i < 17; i++) { const m = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial()); m.name = `mesh-${i}`; root.add(m); remember(m) }
const hidden = new THREE.Group(); hidden.visible = false; const hiddenMesh = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial()); hidden.add(hiddenMesh); root.add(hidden); remember(hidden); remember(hiddenMesh)
const maskedParent = new THREE.Group(); maskedParent.layers.set(1); const childMatch = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial()); childMatch.name = 'child-layer-match'; maskedParent.add(childMatch); root.add(maskedParent); remember(maskedParent); remember(childMatch)
const maskedMesh = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial()); maskedMesh.layers.set(1); root.add(maskedMesh); remember(maskedMesh)
const light = new THREE.PointLight(); root.add(light); remember(light)
const hiddenLight = new THREE.PointLight(); hiddenLight.visible = false; root.add(hiddenLight); remember(hiddenLight)
remember(root)
const calls: Call[] = []
const renderer = { info: { programs: [] }, compileAsync(view: THREE.Object3D, _camera: THREE.Camera, _scene: THREE.Scene) { assert.equal(_camera,camera);assert.equal(_scene,scene);const objects: THREE.Object3D[] = []; view.traverse(o => objects.push(o));const visible:THREE.Object3D[]=[];view.traverseVisible(o=>visible.push(o));assert.deepEqual(visible,objects); let resolve!: () => void, reject!: () => void; const promise = new Promise<void>((res, rej) => { resolve = res; reject = rej }); calls.push({ objects, resolve, reject }); return promise } } as unknown as THREE.WebGLRenderer
const job = compileSceneJob(renderer, root, camera, scene)
assert.equal(job.next().done, false)
while (calls.length < 3) job.next()
assert.equal(calls.length, 3)
for (const call of calls) { const renderables = call.objects.filter(o => o !== light); assert.ok(renderables.length <= 8); assert.ok(call.objects.includes(light)); assert.ok(!call.objects.includes(hiddenLight)); assert.ok(!call.objects.includes(hiddenMesh)); assert.ok(!call.objects.includes(maskedMesh)) }
const compiled = calls.flatMap(c => c.objects).filter(o => o !== light)
assert.equal(new Set(compiled).size, 18)
assert.equal(compiled.length, 18)
assert.ok(compiled.includes(childMatch))
assert.ok(compiled.includes(root.children[0]))
for (const [o, state] of before) assert.equal(o.parent, state.parent); for (const [o, state] of before) { assert.deepEqual(o.children, state.children); assert.equal(o.visible, state.visible); assert.deepEqual(o.matrix.toArray(), state.matrix); assert.equal(o.layers.mask, state.mask) }
assert.equal(job.next().done, false)
let releasedRoot=false,releasedRenderer=false
const emptyRoot=new THREE.Group();let releasedEmpty=false
afterSceneCompile(root,()=>releasedRoot=true);afterRendererCompile(renderer,()=>releasedRenderer=true)
afterSceneCompile(emptyRoot,()=>releasedEmpty=true)
assert.ok(releasedEmpty);assert.ok(!releasedRoot&&!releasedRenderer)
for (const call of calls) call.resolve()
for(let n=0;!job.next().done;n++){assert.ok(n<20);await Promise.resolve()}

for(let n=0;!releasedRoot||!releasedRenderer;n++){assert.ok(n<20);await Promise.resolve()}
const rejectJob = compileSceneJob(renderer, root, camera, scene); rejectJob.next(); while (calls.length < 6) rejectJob.next(); for (const call of calls.slice(3)) call.reject(); for(let n=0;!rejectJob.next().done;n++){assert.ok(n<20);await Promise.resolve()}
const cancelCalls = calls.length, cancelJob = compileSceneJob(renderer, root, camera, scene); cancelJob.next(); cancelJob.return(); cancelJob.next(); assert.equal(calls.length, cancelCalls)
const pendingJob=compileSceneJob(renderer,root,camera,scene);pendingJob.next();pendingJob.next()
const submitted=calls.length;pendingJob.return();let cancelledReleased=false
afterSceneCompile(root,()=>cancelledReleased=true);assert.ok(!cancelledReleased)
calls.at(-1)!.resolve();for(let n=0;!cancelledReleased;n++){assert.ok(n<20);await Promise.resolve()}
assert.equal(calls.length,submitted);assert.equal(pendingJob.next().done,true)
console.log(`scene warmup regression passed: ${calls.length} batches`)
