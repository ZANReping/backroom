import assert from 'node:assert/strict'
import * as THREE from 'three'
import {createCanvas} from '@napi-rs/canvas'
import {normalPixels} from '../src/game/renderer/normalPixels'
import {cloneRenderMaterial} from '../src/game/renderer/renderMaterial'
import {packGeometryTree,unpackGeometryTree} from '../src/game/renderer/geometryPacket'
import {traceMapSight,type SightField,type SightQuery} from '../src/game/world/mapSightTrace'
let checks=0
const ok=(v:unknown,label:string)=>{assert(v,label);checks++}
Object.assign(globalThis,{document:{createElement:()=>createCanvas(256,256),getElementById:()=>null,addEventListener(){},removeEventListener(){},body:{appendChild(){}}},window:{addEventListener(){},removeEventListener(){},matchMedia:()=>({matches:false}),devicePixelRatio:1}})
const {audio}=await import('../src/game/core/audio')
for(const key of Object.getOwnPropertyNames(Object.getPrototypeOf(audio)))if(key!=='constructor'&&typeof(audio as unknown as Record<string,unknown>)[key]==='function')(audio as unknown as Record<string,unknown>)[key]=()=>{}
{
 const texture=new THREE.CanvasTexture(createCanvas(8,8) as unknown as HTMLCanvasElement)
 texture.toJSON=()=>{throw new Error('Unexpected PNG serialization')}
 const m=new THREE.MeshStandardMaterial({map:texture,roughness:.41,normalMap:texture})
 const uniform={value:3};m.userData={textures:[texture],uniform}
 m.onBeforeCompile=()=>{};m.customProgramCacheKey=()=> 'custom-key'
 const c=cloneRenderMaterial(m)
 ok(c!==m&&c.uuid!==m.uuid,'material instances independent')
 ok(c.map===texture&&c.normalMap===texture&&c.userData.textures===m.userData.textures,'texture resources retain shared identity')
 ok(c.userData!==m.userData&&c.userData.uniform===uniform&&c.onBeforeCompile===m.onBeforeCompile&&c.customProgramCacheKey===m.customProgramCacheKey,'uniform and shader metadata preserved without encoding')
 c.roughness=.8;ok(m.roughness===.41,'clone cannot mutate source material')
 let disposed=0;texture.addEventListener('dispose',()=>disposed++);c.dispose();ok(disposed===0,'instance disposal cannot invalidate shared texture')
}
{
 const g=new THREE.BoxGeometry(1,2,3)
 g.setAttribute('skinIndex',new THREE.Uint16BufferAttribute(new Uint16Array(g.attributes.position.count*4),4))
 g.setAttribute('skinWeight',new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count*4).fill(.25),4))
 g.computeBoundingSphere();g.boundingSphere!.radius*=1.3;g.computeBoundingBox();g.setDrawRange(3,12)
 const before=new Float32Array(g.attributes.position.array),transfers:ArrayBuffer[]=[]
 const tree=packGeometryTree({body:g,fur:null,stats:{tris:12}},transfers)
 const moved=structuredClone(tree,{transfer:transfers}),out=unpackGeometryTree(moved) as {body:THREE.BufferGeometry;fur:null;stats:{tris:number}}
 ok(g.attributes.position.array.byteLength>0,'packet transfer cannot detach live geometry')
 assert.deepEqual(g.attributes.position.array,before);checks++
 for(const name of Object.keys(g.attributes)){
  assert.deepEqual(out.body.attributes[name].array,g.attributes[name].array);checks++
  ok(out.body.attributes[name].itemSize===g.attributes[name].itemSize,'attribute layout preserved '+name)
 }
 assert.deepEqual(out.body.index!.array,g.index!.array);assert.deepEqual(out.body.groups,g.groups);checks+=2
 ok(out.body.boundingSphere!.radius===g.boundingSphere!.radius&&out.body.drawRange.start===3&&out.body.drawRange.count===12,'expanded animated bounds and draw range survive transfer')
 ok(out.fur===null&&out.stats.tris===12,'geometry metadata preserved')
 g.dispose();out.body.dispose()
}
{
 const size=8,src=new Uint8ClampedArray(size*size*4).fill(128)
 const flat=normalPixels(src,size,size)
 for(let i=0;i<flat.length;i+=4)assert.deepEqual([...flat.slice(i,i+4)],[128,128,255,255])
 checks++
 for(let y=0;y<size;y++)for(let x=0;x<size;x++)src[(y*size+x)*4]=x*28+y*2
 const normal=normalPixels(src,size,size,2)
 ok(normal[(3*size+3)*4]<128&&normal[(3*size+3)*4+1]>128,'OpenGL normal orientation follows +U / +V height gradients')
 ok(normal[3]===255&&normal[normal.length-1]===255,'normal wrap seam stays opaque')
 assert.throws(()=>normalPixels(new Uint8ClampedArray(4),4,4));checks++
}
{
 const field:SightField={w:16,h:16,walls:new Uint8Array(256),bins:new Map()}
 const q:SightQuery={ox:8.5,oy:12.5,offsetX:0,offsetY:0,yaw:0,range:12,fov:Math.PI/2,near:1.6}
 for(let x=0;x<16;x++)field.walls![8*16+x]=1
 let sight=traceMapSight(field,q)
 ok(sight.cells.every(i=>Math.floor(i/16)>=8),'tile wall blocks exploration behind it')
 ok(sight.points.every(p=>p.y>=-3.500001),'map fan stops at exact visible wall face')
 field.walls!.fill(0)
 for(let x=0;x<16;x++)field.bins.set(9*16+x,[{x:0,y:9.1,w:16,h:.12}])
 sight=traceMapSight(field,q)
 ok(sight.points.every(p=>p.y>=-3.280001),'sub-metre partition blocks sight between tile centers')
 const shifted=traceMapSight(field,{...q,offsetX:.2,offsetY:.1,ox:q.ox+.2,oy:q.oy+.1})
 ok(shifted.points.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y)),'seated eye offset remains finite')
 const city:SightField={w:16,h:16,walls:null,bins:new Map()}
 for(let x=0;x<16;x++)city.bins.set(9*16+x,[{x:0,y:9,w:16,h:.1,polygon:[[[0,9],[16,9],[16,9.1],[0,9.1],[0,9]]]}])
 ok(traceMapSight(city,q).points.every(p=>p.y>=-3.40001),'polygon city facade blocks fan')
}
{
 const {Engine}=await import('../src/game/engine')
 const {syncChefStains}=await import('../src/game/renderer/chefRender')
 const {chefSave}=await import('../src/game/engine/chefAI')
 const e=new Engine();e.loadLevel(5,{mapSeed:424242,firstVisit:false})
 const scene=new THREE.Scene();scene.getObjectByName=()=>{throw new Error('Unexpected recursive scene search')}
 syncChefStains(scene,e);ok(scene.children.length===0,'empty stains do not traverse the scene')
 const saved=chefSave(e);saved.stains.push({x:4,y:5} as typeof saved.stains[number])
 syncChefStains(scene,e);ok(scene.children.length===1&&scene.children[0].children.length===1,'stain root created once')
 const root=scene.children[0];for(let i=0;i<30;i++)syncChefStains(scene,e)
 ok(scene.children[0]===root&&root.children.length===1,'repeated frames retain the same stain mesh')
 syncChefStains(scene,null);ok(!root.children[0].visible,'leaving hotel hides existing stains')
 scene.clear();syncChefStains(scene,e);ok(scene.children.length===1&&scene.children[0]!==root,'cleared scene reconstructs cached root safely')
}

{
  const sockets: FakeWorker[] = []
  class FakeWorker {
    onmessage: ((event: {data: {id:number;cells?:Uint32Array;ms?:number}})=>void) | null = null
    onerror: (()=>void) | null = null
    onmessageerror: (()=>void) | null = null
    sent: {id:number}[] = []; stopped=false
    constructor(){sockets.push(this)}
    postMessage(data:{id:number}){this.sent.push(data)}
    terminate(){this.stopped=true}
  }
  Object.assign(globalThis,{Worker:FakeWorker})
  const {requestSight,sightWorkerStats,disposeSightWorker}=await import('../src/game/world/mapSightWorker')
  const field:SightField={w:4,h:4,walls:new Uint8Array(16),bins:new Map()}
  const q:SightQuery={ox:1.5,oy:1.5,offsetX:0,offsetY:0,yaw:0,range:2,fov:1,near:1}
  const results:(number|null)[]=[]
  requestSight(field,q,c=>results.push(c?.[0]??null))
  requestSight(field,q,c=>results.push(c?.[0]??null))
  requestSight(field,q,c=>results.push(c?.[0]??null))
  ok(sockets[0].sent.length===1&&sightWorkerStats().queued===1&&results[0]===null,'sight queue keeps only one active and the latest pending job')
  sockets[0].onmessage!({data:{id:sockets[0].sent[0].id,cells:new Uint32Array([3]),ms:.5}})
  ok(sockets[0].sent.length===2&&results[1]===3,'latest pending observation starts after acknowledgement')
  sockets[0].onmessage!({data:{id:sockets[0].sent[1].id,cells:new Uint32Array([7]),ms:.5}})
  ok(results[2]===7,'completed observation delivered exactly once')
  disposeSightWorker()
  ok(sockets[0].stopped&&!sightWorkerStats().running&&!sightWorkerStats().active&&!sightWorkerStats().queued,'worker disposal drains jobs and releases context')
  Object.assign(globalThis,{Worker:class{constructor(){throw new Error('Worker blocked')}},OffscreenCanvas:class{}})
  ok(!requestSight(field,q,()=>{throw Error('Unsubmitted job cannot complete')}),'constructor failure cleanly selects synchronous sight fallback')
  const {Engine}=await import('../src/game/engine'),{revealMapSight}=await import('../src/game/world/mapSight')
  const fallbackEngine=new Engine();fallbackEngine.loadLevel(11,{mapSeed:424242,firstVisit:false})
  const first=revealMapSight(fallbackEngine),second=revealMapSight(fallbackEngine)
  ok(first.length>0&&second.length>0,'failed Worker retains continuous synchronous visible cells')
  assert.deepEqual(first,second);checks++
  const {normalTexture,heightToNormal,phonoSet}=await import('../src/game/renderer/pbrCanvas')
  const src=createCanvas(32,32),g=src.getContext('2d');g.fillStyle='#888';g.fillRect(0,0,32,32);g.fillStyle='#222';g.fillRect(0,0,16,16)
  const n=normalTexture(src as unknown as HTMLCanvasElement,2,'fallback-test')
  ok(!n.userData.generatedPending,'texture Worker failure does not leave loading pending')
  assert.deepEqual(n.image.getContext('2d').getImageData(0,0,32,32).data,heightToNormal(src as unknown as HTMLCanvasElement).getContext('2d')!.getImageData(0,0,32,32).data);checks++
  const p=phonoSet('fallback-wood',{surface:'wood',variant:'old'})
  ok([p.map,p.normalMap,p.roughnessMap].every(t=>t&&!t.userData.generatedPending),'complete brush recipe falls back without a stuck material')
  const {requestHotelGeometry}=await import('../src/game/renderer/hotelGeometryQueue')
  ok(!requestHotelGeometry('chef',1,()=>{throw Error('No geometry request sent')}),'geometry Worker failure cleanly selects existing generator')
  delete (globalThis as unknown as Record<string,unknown>).Worker
  delete (globalThis as unknown as Record<string,unknown>).OffscreenCanvas
}

console.log(JSON.stringify({checks,ok:true}))
