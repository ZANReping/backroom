import * as THREE from 'three'
import { ModelWarmupQueue } from '/src/game/renderer/modelWarmup.ts'
import { buildItemMesh } from '/src/game/renderer/itemsMesh.ts'
import { batchRigidItem } from '/src/game/renderer/itemBatches.ts'
import { getMaterialMode, setMaterialMode } from '/src/game/renderer/shared.ts'

export async function verifyModelWarmup() {
  const checks=[],rows=[],assert=(ok,label)=>{if(!ok)throw new Error(label);checks.push(label)}
  const oldMode=getMaterialMode(),load=THREE.TextureLoader.prototype.load
  let loading=0,loadErrors=0
  THREE.TextureLoader.prototype.load=function(url,onLoad,onProgress,onError){loading++;return load.call(this,url,async texture=>{try{await onLoad?.(texture)}finally{loading--}},onProgress,error=>{loadErrors++;loading--;onError?.(error)})}
  const three=new THREE.WebGLRenderer({antialias:false}),scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(40,1,.01,20),target=new THREE.WebGLRenderTarget(128,128)
  three.setRenderTarget(target);scene.background=new THREE.Color('#73767b');scene.fog=new THREE.Fog('#73767b',2,8)
  scene.add(new THREE.AmbientLight('#eef1ff',.7));const light=new THREE.PointLight('#ffeecb',4);light.position.set(1,2,1);scene.add(light)
  const gl=three.getContext(),create=gl.createProgram.bind(gl);let programs=0
  gl.createProgram=(...args)=>{programs++;return create(...args)}
  const draw=()=>{three.render(scene,camera);const bytes=new Uint8Array(128*128*4);three.readRenderTargetPixels(target,0,0,128,128,bytes);return bytes}
  const wait=async(done,step=()=>{})=>{const start=performance.now();while(!done()){step();await new Promise(requestAnimationFrame);if(performance.now()-start>20000)throw new Error('Model preparation timed out')}}
  const resources=root=>{const geometries=new Set(),materials=new Set();root.traverse(o=>{if(o.geometry)geometries.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:o.material?[o.material]:[])materials.add(m)});return {geometries,materials}}
  try {
    for(const mode of ['classic','realistic'])for(const type of ['coffee','almond','bandage','battery','warpberry','disinfectant']) {
      setMaterialMode(mode)
      const root=buildItemMesh(type);batchRigidItem(root);scene.add(root)
      const queue=new ModelWarmupQueue(),owned=resources(root),children=[...root.children]
      root.visible=false;queue.enqueue(root,three,camera,scene)
      try {
        await wait(()=>queue.ready(root),()=>{queue.advance();assert(!root.visible&&root.parent===scene&&root.children.every((o,i)=>o===children[i]),`${mode}/${type}: preparation preserves scene state`)})
        await wait(()=>loading===0);assert(loadErrors===0,'all requested source images loaded')
        root.visible=true;camera.position.set(.65,.35,.85);camera.lookAt(0,0,0)
        const before=programs;draw()
        assert(programs===before,`${mode}/${type}: first draw creates no new shader programs`)
        for(let pose=0;pose<4;pose++) {
          root.rotation.set(pose*.27,pose*.71,pose*.1)
          camera.position.set(.65,pose%2?.7:-.2,.85);camera.lookAt(0,0,0)
          const warmed=draw();for(const material of owned.materials)material.dispose();const cold=draw()
          let delta=0;for(let i=0;i<cold.length;i++)delta=Math.max(delta,Math.abs(cold[i]-warmed[i]))
          assert(delta===0,`${mode}/${type}/${pose}: precompiled and normal draw pixels match`)
          rows.push({mode,type,pose,maxDelta:delta})
        }
      } finally {queue.cancel(root);root.removeFromParent();for(const g of owned.geometries)g.dispose();for(const m of owned.materials)m.dispose()}
    }
  } finally {THREE.TextureLoader.prototype.load=load;setMaterialMode(oldMode);gl.createProgram=create;target.dispose();three.dispose();three.forceContextLoss()}

  const {renderer:r,engine:e}=perfQA
  await perfQA.measure(4,5)
  const item={...e.map.items[0],id:98765.321,type:'coffee',x:e.player.x+.8,y:e.player.y,z:e.player.z}
  const id=Math.round(item.id*1000)%100000000
  e.map.items.push(item);r.updateItems(e,1/60)
  const root=r.itemMeshes.get(id)
  assert(root&&!root.visible&&!r.itemWarmup.ready(root),'new nearby ground item waits for compilation')
  assert(!r.isNearWorldReady(e),'entry readiness includes nearby item preparation')
  await wait(()=>r.itemWarmup.ready(root),()=>r.itemWarmup.advance())
  r.updateItems(e,1/60);r.updateVisualInteractionHit(e)
  assert(root.visible&&r.isNearWorldReady(e),'prepared nearby item restores world readiness')
  assert(root.userData.interactionTarget?.item===item,'prepared model remains an exact pickup target')
  e.map.items.splice(e.map.items.indexOf(item),1);r.updateItems(e,1/60)
  assert(root.parent===null&&r.itemPool.some(p=>p.group===root),'removed item returns to the existing pool')
  e.map.items.push(item);r.updateItems(e,1/60)
  assert(r.itemMeshes.get(id)===root&&root.visible&&r.itemWarmup.ready(root),'pool reuse displays the already prepared model immediately')
  e.map.items.splice(e.map.items.indexOf(item),1);r.updateItems(e,1/60)
  const projectile=r.acquireItemModel('coffee',false)
  assert(projectile.visible&&r.itemWarmup.ready(projectile),'projectiles remain immediate')
  r.disposeItemModel(projectile)

  // Pause the actual driver promise, then retire a model while it is pending.
  const compile=r.three.compileAsync,retired=r.acquireItemModel('stapler'),owned=resources(retired)
  let release,started=0,disposed=0
  const gate=new Promise(resolve=>release=resolve)
  r.three.compileAsync=function(...args){started++;return Promise.all([compile.apply(this,args),gate]).then(([value])=>value)}
  for(const m of owned.materials)m.addEventListener('dispose',()=>disposed++)
  try {
    await wait(()=>started>0,()=>r.itemWarmup.advance())
    r.disposeItemModel(retired)
    assert(disposed===0,'retirement keeps materials alive while the real compiler is pending')
    release();await wait(()=>disposed===owned.materials.size)
    assert(disposed===owned.materials.size,'retired model materials release exactly once')
    assert(r.itemWarmup.ready(retired)&&retired.parent===null,'completion cannot reattach a retired model')
  } finally {r.three.compileAsync=compile;release()}
  return {passed:checks.length,comparisons:rows.length,checks,rows}
}
