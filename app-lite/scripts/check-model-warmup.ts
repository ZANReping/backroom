import assert from 'node:assert/strict'
import * as THREE from 'three'
import { ModelWarmupQueue } from '../src/game/renderer/modelWarmup'
import { afterSceneCompile, afterRendererCompile } from '../src/game/renderer/sceneWarmup'

let checks = 0
const check = (ok: unknown, label: string) => { assert.ok(ok, label); checks++ }
const flush = async () => { for (let i=0;i<12;i++) await Promise.resolve() }
const geometry = new THREE.BoxGeometry(), material = new THREE.MeshLambertMaterial()
const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(), queue = new ModelWarmupQueue()
const calls: {objects: THREE.Object3D[], resolve: () => void, reject: () => void}[] = []
const renderer = { info: { programs: [] }, compileAsync(view: THREE.Object3D, c: THREE.Camera, s: THREE.Scene) {
  check(c===camera && s===scene, 'compiler uses the live camera and scene lighting')
  const objects: THREE.Object3D[] = [];view.traverse(o=>objects.push(o))
  return new Promise<void>((resolve,reject)=>calls.push({objects,resolve,reject:()=>reject(new Error('driver unavailable'))}))
} } as unknown as THREE.WebGLRenderer
const model = () => {
  const root = new THREE.Group();root.visible=false
  for (let i=0;i<17;i++) root.add(new THREE.Mesh(geometry,material))
  const hidden = new THREE.Group();hidden.visible=false;hidden.add(new THREE.Mesh(geometry,material));root.add(hidden)
  const excluded = new THREE.Mesh(geometry,material);excluded.layers.set(1);root.add(excluded)
  scene.add(root);return root
}
const a=model(), b=model(), snapshots=[a,b].map(root=>({root,children:[...root.children],parent:root.parent}))
const advance = (count=1) => {
  for(let i=0;i<count;i++){
    const before=calls.length;queue.advance()
    check(calls.length-before<=1,'one frame issues at most one small compile batch')
    check(snapshots.every(s=>!s.root.visible&&s.root.parent===s.parent&&s.root.children.every((o,j)=>o===s.children[j])),'preparation preserves visibility and hierarchy')
  }
}
try {
  queue.enqueue(a,renderer,camera,scene);queue.enqueue(a,renderer,camera,scene);queue.enqueue(b,renderer,camera,scene)
  check(!queue.ready(a)&&!queue.ready(b)&&calls.length===0,'enqueue is deferred and deduplicated')
  advance(2);check(calls.length===0,'initial traversal yields before compiling')
  advance(6);check(calls.length===6,'two 17-mesh models produce three batches each')
  check(calls.every(c=>c.objects.length<=8),'compiler batch size stays bounded')
  check(calls.flatMap(c=>c.objects).every(o=>o.parent===a||o.parent===b),'hidden proxies and other camera layers are excluded')
  check(calls.map(c=>c.objects.length).join(',')==='8,8,8,8,1,1','round-robin scheduling preserves fair batch order')
  check(!queue.ready(a)&&!queue.ready(b),'models remain hidden while driver promises are pending')
  for(let i=1;i<calls.length;i+=2)calls[i].resolve()
  await flush();advance(4)
  check(queue.ready(b)&&!queue.ready(a),'a slow model does not block another completed model')
  let disposed=0,rendererDisposed=0
  queue.cancel(a);afterSceneCompile(a,()=>disposed++);afterRendererCompile(renderer,()=>rendererDisposed++)
  check(queue.ready(a)&&disposed===0&&rendererDisposed===0,'cancellation stops future work while preserving pending material lifetimes')
  const before=calls.length;advance(3);check(calls.length===before,'cancelled jobs cannot issue more compiler calls')
  for(let i=0;i<calls.length;i+=2)calls[i].resolve()
  await flush();check(disposed===1&&rendererDisposed===1,'pending root and renderer disposal each run exactly once')
  queue.enqueue(a,renderer,camera,scene);queue.cancel(a)
  afterSceneCompile(a,()=>disposed++)
  check(disposed===2,'cancellation before compilation disposes immediately')
  queue.enqueue(a,renderer,camera,scene);advance(4)
  for(const c of calls.slice(before))c.reject()
  await flush();advance(2)
  check(queue.ready(a),'rejected asynchronous compilation permits normal rendering fallback')
  const failed = new ModelWarmupQueue(), throwing = {compileAsync(){throw new Error('synchronous failure')}} as unknown as THREE.WebGLRenderer
  failed.enqueue(a,throwing,camera,scene);failed.advance()
  assert.throws(()=>failed.advance(),/synchronous failure/);checks++
  check(!a.visible,'synchronous compiler failure restores hidden visibility')
  failed.cancel(a)
} finally {geometry.dispose();material.dispose()}
console.log(JSON.stringify({passed:checks}))
