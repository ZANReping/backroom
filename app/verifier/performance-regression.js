import '/src/game/world/mapgen.ts'
import { infiniteImplFor } from '/src/game/world/infiniteRegistry.ts'
import { ALL_LEVEL_DEFS } from '/src/game/levels/index.ts'
import { prepareChunkWindow, takePreparedChunk, prefetchChunks } from '/src/game/world/chunkCache.ts'
import { prepareL11Window, preparedL11 } from '/src/game/world/l11ChunkCache.ts'
import { configureSurfaceTexture, setSurfaceAnisotropy, levelTexture } from '/src/game/renderer/shared.ts'
import { batchL4Static } from '/src/game/renderer/l4Batch.ts'
import { materialBatchKey } from '/src/game/renderer/materialBatch.ts'
import * as THREE from 'three'

export async function runPerformanceRegressions() {
  const checks=[]
  const assert=(ok,label)=>{if(!ok)throw new Error(label);checks.push(label)}
  const texture=new THREE.Texture()
  setSurfaceAnisotropy(1)
  configureSurfaceTexture(texture,THREE.SRGBColorSpace)
  const version=texture.version
  for(let i=0;i<100;i++)configureSurfaceTexture(texture,THREE.SRGBColorSpace)
  assert(texture.version===version,'100 repeated surface configurations do not re-upload the texture')
  setSurfaceAnisotropy(4);configureSurfaceTexture(texture,THREE.SRGBColorSpace)
  assert(texture.version===version+1&&texture.anisotropy===4,'changing texture quality invalidates the texture exactly once')
  texture.dispose();setSurfaceAnisotropy(1)

  const three=perfQA.renderer.three,beforeMemory=three.info.memory.textures
  const load=THREE.TextureLoader.prototype.load,canvas=document.createElement('canvas');canvas.width=canvas.height=2
  const loaded=new THREE.Texture(canvas)
  THREE.TextureLoader.prototype.load=function(_url,onLoad){onLoad(loaded);return loaded}
  try {
    const replacement=levelTexture(`test-source-retirement-${performance.now()}`,()=>new THREE.DataTexture(new Uint8Array(16).fill(255),2,2))
    replacement.needsUpdate=true;three.initTexture(replacement)
    await Promise.resolve();await Promise.resolve()
    three.initTexture(replacement);replacement.dispose()
    assert(three.info.memory.textures===beforeMemory,'replacing an uploaded fallback Source releases both GPU allocations safely')
  } finally {THREE.TextureLoader.prototype.load=load;loaded.dispose()}
  const root=new THREE.Group(),batch=new THREE.Group()
  for(let i=0;i<4;i++){const mesh=new THREE.Mesh(new THREE.BoxGeometry(1,1,1),new THREE.MeshLambertMaterial({color:i===3?'#aa0000':'#889999'}));mesh.position.x=i*2;root.add(mesh)}
  batchL4Static(batch,[root])
  assert(batch.children.length===2,'L4 equivalent material instances merge while different colors remain separate')
  const beforeBox=new THREE.Box3().setFromObject(root),afterBox=new THREE.Box3().setFromObject(batch)
  assert(beforeBox.min.equals(afterBox.min)&&beforeBox.max.equals(afterBox.max),'L4 material batching preserves complete world bounds')
  for(const g of [root,batch])g.traverse(o=>{o.geometry?.dispose();o.material?.dispose()})
  const lambertA=new THREE.MeshLambertMaterial({color:'#889999'}),lambertB=new THREE.MeshLambertMaterial({color:'#889999'})
  assert(materialBatchKey(lambertA)===materialBatchKey(lambertB),'equivalent Lambert materials share a batch key')
  const differentColor=new THREE.MeshLambertMaterial({color:'#889998'}),bump=new THREE.MeshLambertMaterial({color:'#889999',bumpMap:new THREE.Texture()})
  differentColor.color.copy(lambertA.color);differentColor.color.r+=1e-8
  assert(materialBatchKey(lambertA)!==materialBatchKey(differentColor),'different exact color components do not share a batch key')
  assert(materialBatchKey(lambertA)!==materialBatchKey(bump),'different bump maps do not share a batch key')
  const phongA=new THREE.MeshPhongMaterial({specular:'#111111',shininess:12}),phongB=new THREE.MeshPhongMaterial({specular:'#111111',shininess:13})
  assert(materialBatchKey(phongA)!==materialBatchKey(phongB),'different Phong shininess does not share a batch key')
  phongB.shininess=phongA.shininess;phongB.specular.r+=.001
  assert(materialBatchKey(phongA)!==materialBatchKey(phongB),'different Phong specular colors do not share a batch key')
  const offsetA=new THREE.MeshLambertMaterial({polygonOffset:true,polygonOffsetFactor:1}),offsetB=new THREE.MeshLambertMaterial({polygonOffset:true,polygonOffsetFactor:2})
  assert(materialBatchKey(offsetA)!==materialBatchKey(offsetB),'different polygon offsets do not share a batch key')
  const depthA=new THREE.MeshLambertMaterial({depthFunc:THREE.LessDepth}),depthB=new THREE.MeshLambertMaterial({depthFunc:THREE.GreaterDepth})
  assert(materialBatchKey(depthA)!==materialBatchKey(depthB),'different depth functions do not share a batch key')
  const shaderA=new THREE.ShaderMaterial({uniforms:{u:{value:1}}}),shaderB=new THREE.ShaderMaterial({uniforms:{u:{value:2}}})
  assert(materialBatchKey(shaderA)!==materialBatchKey(shaderB),'different ShaderMaterials do not share a batch key')
  const customA=new THREE.MeshLambertMaterial(),customB=new THREE.MeshLambertMaterial();customB.onBeforeCompile=()=>{}
  assert(materialBatchKey(customA)!==materialBatchKey(customB),'custom onBeforeCompile materials do not share a batch key')
  lambertA.userData.envBase=.1;lambertB.userData.envBase=.2
  assert(materialBatchKey(lambertA)!==materialBatchKey(lambertB),'future material-update metadata stays distinct')
  const circular=[];circular.push(circular);lambertA.userData={circular}
  assert(materialBatchKey(lambertA).includes(lambertA.uuid),'cyclic metadata safely disables semantic merging')
  bump.bumpMap.dispose()
  for(const mat of [lambertA,lambertB,differentColor,bump,phongA,phongB,offsetA,offsetB,depthA,depthB,shaderA,shaderB,customA,customB])mat.dispose()

  const worker=new Worker(new URL('/src/game/world/chunks.worker.ts',location.href),{type:'module'})
  const rawFromWorker=job=>new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>reject(new Error('Worker timed out')),15_000)
    worker.onmessage=event=>{clearTimeout(timer);event.data.raw?resolve(event.data.raw):reject(new Error(event.data.error))}
    worker.onerror=event=>{clearTimeout(timer);reject(new Error(event.message))}
    worker.postMessage(job)
  })
  try {
    for(const def of ALL_LEVEL_DEFS.filter(d=>d.infinite))for(const [cx,cy] of [[0,0],[-3,2]]) {
      const job={key:`${def.id}:${cx}:${cy}`,def,seed:424242,cx,cy}
      const actual=await rawFromWorker(job),expected=infiniteImplFor(def.id).genRaw(def,job.seed,cx,cy)
      assert(JSON.stringify(actual)===JSON.stringify(expected),`L${def.id} (${cx},${cy}) worker generation matches the main thread`)
    }
  } finally {worker.terminate()}
  const zero=ALL_LEVEL_DEFS.find(d=>d.id===0)
  for(let attempt=0;attempt<2;attempt++) {
    await prepareChunkWindow(zero,71991)
    for(let y=-2;y<=2;y++)for(let x=-2;x<=2;x++)assert(!!takePreparedChunk(zero,71991,x,y),`L0 preparation ${attempt+1}: ${x},${y}`)
    assert(!takePreparedChunk(zero,71991,0,0),'a mutable cached chunk has only one consumer')
  }
  // updateInfinite prefetches before removing the outgoing live chunks. The
  // radius-3 ring must prepare these cells even though loaded still contains them.
  for(const [cx,cy] of [[1,0],[-1,1]]) {
    const seed=72991+cx
    await prepareChunkWindow(zero,seed)
    const loaded=new Map(),outgoing=[]
    for(let y=-2;y<=2;y++)for(let x=-2;x<=2;x++) {
      const live=takePreparedChunk(zero,seed,x,y)
      loaded.set(`${x},${y}`,live)
      // Live mutable arrays cannot become the prepared return copy.
      live.tiles.fill(255)
      if(Math.max(Math.abs(x-cx),Math.abs(y-cy))===3)outgoing.push([x,y])
    }
    const waiting=new Set(outgoing.map(([x,y])=>`0:${seed}:${x}:${y}`))
    const post=Worker.prototype.postMessage,listeners=new Map()
    let finished,timer
    const complete=new Promise(resolve=>{finished=resolve;timer=setTimeout(resolve,10000)})
    Worker.prototype.postMessage=function(...args) {
      if(!listeners.has(this)) {
        const listener=e=>{waiting.delete(e.data?.key);if(!waiting.size)finished()}
        listeners.set(this,listener);this.addEventListener('message',listener)
      }
      return post.apply(this,args)
    }
    try {prefetchChunks(zero,seed,cx,cy,loaded);await complete}
    finally {clearTimeout(timer);Worker.prototype.postMessage=post;for(const [w,listener] of listeners)w.removeEventListener('message',listener)}
    assert(!waiting.size,`outgoing return ring prepared for shift ${cx},${cy}`)
    for(const [x,y] of outgoing) {
      const raw=takePreparedChunk(zero,seed,x,y),expected=infiniteImplFor(0).genRaw(zero,seed,x,y)
      assert(JSON.stringify(raw)===JSON.stringify(expected),`return raw ${cx},${cy}/${x},${y} is pristine and deterministic`)
      assert(!takePreparedChunk(zero,seed,x,y),`return raw ${cx},${cy}/${x},${y} still has one consumer`)
    }
  }
  const city=ALL_LEVEL_DEFS.find(d=>d.id===11)
  const cityTimes=[]
  for(let attempt=0;attempt<2;attempt++) {
    const start=performance.now();await prepareL11Window(city,81991);cityTimes.push(performance.now()-start)
    for(let y=-2;y<=2;y++)for(let x=-2;x<=2;x++)preparedL11(city,81991,x,y)
  }
  assert(cityTimes.every(t=>t<9_000),'L11 repeated preparation completes without the 10-second fallback timeout')
  return {passed:checks.length,checks,cityPreparationMs:cityTimes}
}
