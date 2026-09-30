import assert from 'node:assert/strict'
import * as THREE from 'three'
import {genL3ChunkRaw,l3ExitHost,l3VariantOf} from '../src/game/world/infiniteL3'
import {h32} from '../src/game/world/infinite'
import {L3} from '../src/game/levels/l3'
import {L3_NARROW_TINT} from '../src/game/world/l3Architecture'
import {l3NarrowProfile,l3NarrowRoof} from '../src/game/world/l3NarrowProfile'
import {l3NarrowPortal} from '../src/game/renderer/l3NarrowPortal'
let exits=0,relocated=0,hosts=0
for(const seed of [424242,17,91231])for(let rx=-5;rx<=5;rx++)for(let ry=-5;ry<=5;ry++){
 const host=l3ExitHost(seed,rx,ry);assert(host);hosts++
 assert.deepEqual(host,l3ExitHost(seed,rx,ry))
 assert.notEqual(l3VariantOf(seed,host.cx,host.cy),'narrow')
 const old={cx:rx*6+h32(seed,0xe11,rx,ry)%6,cy:ry*6+h32(seed,0xe12,rx,ry)%6}
 if(l3VariantOf(seed,old.cx,old.cy)==='narrow'){relocated++;assert.notDeepEqual(host,old)}
 const a=genL3ChunkRaw(L3,seed,host.cx,host.cy)
 const floor=(x:number,y:number)=>x>=0&&y>=0&&x<32&&y<32&&a.tiles[y*32+x]===1
 assert(!a.structures.some(s=>s.kind==='trade_terminal'||s.data?.facility),'no business facilities in Level 3')
 for(const e of a.exits){
  exits++;const x=e.x-host.cx*32,y=e.y-host.cy*32
  assert(x>=1&&x<31&&y>=1&&y<31,'elevator stays inside owned chunk')
  assert.notEqual(a.tint[y*32+x],L3_NARROW_TINT,'elevator recess is not an arched tunnel')
  assert([[1,0],[-1,0],[0,1],[0,-1]].some(([dx,dy])=>{
   const fx=x+dx,fy=y+dy
   return floor(fx,fy)&&floor(x+2*dx,y+2*dy)&&floor(fx+dy,fy-dx)&&floor(fx-dy,fy+dx)&&a.tint[fy*32+fx]!==L3_NARROW_TINT
  }),'elevator has a wide, clear approach')
 }
 const narrow=genL3ChunkRaw(L3,seed,host.cx,host.cy,'narrow');assert.equal(narrow.exits.length,0)
}
for(const variant of ['lit','dark','narrow','assembly','genhall','boiler','sanct']){
 const c=genL3ChunkRaw(L3,424242,0,0,variant)
 assert(!c.structures.some(s=>s.kind==='trade_terminal'||s.data?.facility),'origin has no business terminal')
}
assert(relocated>0);assert(exits>250)
const profile=l3NarrowProfile()
assert.deepEqual(profile[0],[-.5,0]);assert.deepEqual(profile.at(-1),[.5,0])
for(const[x,y]of profile)if(y<=1.8)assert(Math.abs(x)>=.5-1e-6,'no curved wall inside standing player corridor')
let clearRays=0
for(const dir of [-1,1]){
 const geometry=l3NarrowPortal(0,0,dir),mesh=new THREE.Mesh(geometry,new THREE.MeshBasicMaterial({side:THREE.DoubleSide}))
 geometry.computeBoundingBox();const bounds=geometry.boundingBox!
 assert(bounds.min.z>=-1e-6&&bounds.max.z<=1+1e-6,'portal never protrudes into outside passage')
 mesh.updateMatrixWorld(true)
 for(const offset of [-.49,-.32,0,.32,.49])for(const y of [.01,.2,.8,1.48,1.8]){
  const ray=new THREE.Raycaster(new THREE.Vector3(.5+offset,y,dir<0?-1:2),new THREE.Vector3(0,0,dir<0?1:-1))
  assert.equal(ray.intersectObject(mesh).length,0,'walkable entrance is not covered by arch triangles');clearRays++
 }
 assert(new THREE.Raycaster(new THREE.Vector3(.5,2.9,-1),new THREE.Vector3(0,0,1)).intersectObject(mesh).length>0,'stone above arch remains closed')
 assert(l3NarrowRoof(.49)>2,'render and headroom share a usable vault')
 geometry.dispose();(mesh.material as THREE.Material).dispose()
}
console.log(JSON.stringify({hosts,relocated,exits,clearRays,noTerminals:true,narrowHostsExcluded:true}))
