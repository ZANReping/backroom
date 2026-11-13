import assert from 'node:assert/strict'
import * as THREE from 'three'
import { ModelWarmupQueue } from '../src/game/renderer/modelWarmup'
import { afterSceneCompile, afterRendererCompile } from '../src/game/renderer/sceneWarmup'

let checks = 0
const check = (ok: unknown, label: string) => { assert.ok(ok, label); checks++ }
const flush = async () => { for (let i=0;i<12;i++) await Promise.resolve() }
const geometry = new THREE.BoxGeometry(), material = new THREE.MeshLambertMaterial()
const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(), queue = new ModelWarmupQueue()
const calls: {objects: THREE.Object3D[], target: THREE.WebGLRenderTarget | null, resolve: () => void, reject: () => void}[] = []
let renderTarget: THREE.WebGLRenderTarget | null = null
const renderer = { info: { programs: [] }, getRenderTarget() { return renderTarget }, setRenderTarget(target: THREE.WebGLRenderTarget | null) { renderTarget = target }, compileAsync(view: THREE.Object3D, c: THREE.Camera, s: THREE.Scene) {
  check(c===camera && s===scene, 'compiler uses the live camera and scene lighting')
  const objects: THREE.Object3D[] = [];view.traverse(o=>objects.push(o))
  return new Promise<void>((resolve,reject)=>calls.push({objects,target:renderTarget,resolve,reject:()=>reject(new Error('driver unavailable'))}))
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
  const hdr = new THREE.WebGLRenderTarget(16,16), hdrNext = new THREE.WebGLRenderTarget(16,16), previousTarget = new THREE.WebGLRenderTarget(8,8)
  renderTarget=previousTarget
  let dynamicTarget: THREE.WebGLRenderTarget | null = null, getterReads=0
  const targetGetter=()=>{getterReads++;return dynamicTarget}
  const hdrStart=calls.length
  queue.enqueue(a,renderer,camera,scene,targetGetter)
  check(dynamicTarget===null,'target is null when the model is queued')
  dynamicTarget=hdr;advance(3)
  check(calls.length>hdrStart&&calls.slice(hdrStart).every(c=>c.target===hdr),'queued model compiles against the latest HDR target')
  check(renderTarget===previousTarget,'HDR compilation restores the previous render target')
  dynamicTarget=hdrNext;advance(3)
  check(calls.slice(hdrStart).some(c=>c.target===hdrNext)&&getterReads===calls.length-hdrStart,'target getter is read for every submitted batch')
  for(const c of calls.slice(hdrStart))c.resolve()
  await flush();advance(2);hdr.dispose();hdrNext.dispose();previousTarget.dispose()
  const failed = new ModelWarmupQueue(), throwing = { getRenderTarget() { return null }, setRenderTarget(_target: THREE.WebGLRenderTarget | null) {}, compileAsync(){throw new Error('synchronous failure')}} as unknown as THREE.WebGLRenderer
  failed.enqueue(a,throwing,camera,scene);failed.advance()
  assert.throws(()=>failed.advance(),/synchronous failure/);checks++
  check(!a.visible,'synchronous compiler failure restores hidden visibility')
  failed.cancel(a)
} finally {geometry.dispose();material.dispose()}

// upload=true: compile first, then initialize each unique texture and upload one
// zero-range mesh batch per frame while preserving the live scene state.
{
  const uploadQueue = new ModelWarmupQueue(), uploadScene = new THREE.Scene(), uploadCamera = new THREE.PerspectiveCamera()
  const shared = new THREE.Texture(), ignored = new THREE.Texture(); (ignored as any).isRenderTargetTexture = true
  const uploadTarget = new THREE.WebGLRenderTarget(4, 4), initCalls: THREE.Texture[] = [], renders: { objects: THREE.Object3D[]; target: unknown; autoClear: boolean; shadowAuto: boolean }[] = []
  let activeTarget: unknown = null
  const shadowMap = { autoUpdate: true, needsUpdate: false }
  const uploadRenderer = {
    info: { programs: [] }, autoClear: true, shadowMap,
    getRenderTarget: () => activeTarget,
    setRenderTarget: (target: unknown) => { activeTarget = target },
    compileAsync: () => Promise.resolve(),
    initTexture: (texture: THREE.Texture) => { initCalls.push(texture) },
    render: (view: THREE.Scene) => {
      const objects = [...view.children]
      renders.push({ objects, target: activeTarget, autoClear: uploadRenderer.autoClear, shadowAuto: shadowMap.autoUpdate })
      check(objects.every((o) => (o as THREE.Mesh).geometry?.drawRange.count === 0), 'upload render uses zero draw ranges')
    },
  } as unknown as THREE.WebGLRenderer
  const root = new THREE.Group(); root.visible = false
  const meshes: THREE.Mesh[] = []
  for (let i = 0; i < 9; i++) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial({ map: i === 8 ? ignored : shared }))
    mesh.visible = true; root.add(mesh); meshes.push(mesh)
  }
  uploadScene.add(root)
  const originalRanges = meshes.map((m) => m.geometry.drawRange.count), originalParents = meshes.map((m) => m.parent), originalVisible = meshes.map((m) => m.visible)
  uploadQueue.enqueue(root, uploadRenderer, uploadCamera, uploadScene, uploadTarget, true)
  const compileBefore = renders.length
  uploadQueue.advance(); check(initCalls.length === 0 && renders.length === compileBefore, 'compile pending does not initialize textures')
  for (let i = 0; i < 4; i++) uploadQueue.advance()
  await Promise.resolve()
  let guard = 0
  while (!uploadQueue.ready(root) && guard++ < 30) {
    const texturesBefore = initCalls.length, batchesBefore = renders.length
    uploadQueue.advance(); await Promise.resolve()
    check(initCalls.length - texturesBefore <= 1 && renders.length - batchesBefore <= 1, 'each advance uploads at most one texture or one batch')
    check(activeTarget === null && uploadRenderer.autoClear && shadowMap.autoUpdate && !shadowMap.needsUpdate, 'each upload step restores renderer state')
  }
  check(initCalls.length === 1, 'shared texture initializes exactly once')
  check(renders.length === 2 && renders.every((r) => r.objects.length <= 8), 'upload uses at most one 8-mesh batch per advance')
  check(renders.every((r) => r.target === uploadTarget && !r.autoClear && !r.shadowAuto), 'upload render uses target and disabled clearing/shadows')
  check(!root.visible && meshes.every((m, i) => m.parent === originalParents[i] && m.visible === originalVisible[i] && m.geometry.drawRange.count === originalRanges[i]), 'upload restores hierarchy, visibility, and draw ranges')
  const beforeCancel = initCalls.length + renders.length; uploadQueue.enqueue(root, uploadRenderer, uploadCamera, uploadScene, uploadTarget, true); uploadQueue.cancel(root); uploadQueue.advance()
  check(initCalls.length + renders.length === beforeCancel, 'cancelled upload cannot issue more work')
  shared.dispose(); ignored.dispose(); meshes.forEach((m) => { m.geometry.dispose(); (m.material as THREE.Material).dispose() }); uploadTarget.dispose()
}
console.log(JSON.stringify({passed:checks}))
