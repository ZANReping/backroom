import * as THREE from 'three'
const cache=new Map<string,THREE.BufferGeometry>()
const maxEntries=96,maxBytes=32*1024*1024
let cachedBytes=0
const bytes=(g:THREE.BufferGeometry)=>Object.values(g.attributes).reduce((n,a)=>n+a.array.byteLength,0)+(g.index?.array.byteLength??0)
export const l11FoliageCacheInfo=()=>({entries:cache.size,bytes:cachedBytes,maxEntries,maxBytes})
/** Individual leaf cards fill a three-dimensional branch crown. The UV island
 * selects one intact leaf from the CC0 atlas; the atlas's unused padding and
 * branch UV islands are never stretched over a whole tree. All dimensions
 * are full extents, as on L11PropPart / L11BuildingDetail. */
export function l11FoliageGeometry(w:number,h:number,d:number,density=1,shape:'ellipsoid'|'trimmed'='ellipsoid'){
  const key=`${w}:${h}:${d}:${density}:${shape}`,hit=cache.get(key)
  if(hit){cache.delete(key);cache.set(key,hit);return hit}
  const positions:number[]=[],normals:number[]=[],uvs:number[]=[],indices:number[]=[]
  const random=(n:number)=>{const v=Math.sin(n*127.1+49.7)*43758.5453;return v-Math.floor(v)}
  // Hedges are shallow volumes: a volume-only count leaves small shrubs
  // almost empty. Leaf coverage follows their exposed area instead.
  const count=Math.max(24,Math.round((shape==='trimmed'?(w*h+w*d+h*d)*95:w*h*d*52)*density)),v=new THREE.Vector3(),normal=new THREE.Vector3(),q=new THREE.Quaternion()
  for(let i=0;i<count;i++){
    const az=i*2.39996323,ny=1-2*(i+.5)/count,r=Math.sqrt(1-ny*ny),scale=Math.cbrt(.3+.7*random(i+3))
    const signedPower=(v:number,p:number)=>Math.sign(v)*Math.abs(v)**p
    // A superellipsoid retains rounded corners while expressing the clipped
    // upper/lower envelope visible on the avenue and the continuous hedges.
    const sx=signedPower(Math.cos(az)*r,shape==='trimmed'?.55:1),sy=signedPower(ny,shape==='trimmed'?.65:1),sz=signedPower(Math.sin(az)*r,shape==='trimmed'?.55:1)
    const size=(.85+random(i+41)*.3)/Math.sqrt(density),width=(shape==='trimmed'?.18:.205)*size,height=(shape==='trimmed'?.115:.13)*size
    const center=new THREE.Vector3(sx*Math.max(0,w/2-width*.6)*scale,sy*Math.max(0,h/2-width*.6)*scale,sz*Math.max(0,d/2-width*.6)*scale)
    normal.set(sx,sy*.35+.65,sz).normalize()
    q.setFromEuler(new THREE.Euler(random(i+23)*2.5,az,random(i+29)*6.28))
    const start=positions.length/3
    for(const [x,y,u,t]of [[-1,-1,.048,.855],[1,-1,.188,.855],[1,1,.188,.948],[-1,1,.048,.948]]){
      v.set(x*width/2,y*height/2,Math.abs(x*y)*.012).applyQuaternion(q).add(center)
      positions.push(v.x,v.y,v.z);normals.push(normal.x,normal.y,normal.z);uvs.push(u,t)
    }
    indices.push(start,start+1,start+2,start,start+2,start+3)
  }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));g.setIndex(indices);g.computeBoundingSphere()
  // Arbitrary city lots produce arbitrary hedge lengths. CityBatch copies all
  // vertices synchronously; these source geometries are never scene meshes.
  // Eviction therefore cannot dispose the merged geometry of a loaded chunk.
  const size=bytes(g)
  if(size<=maxBytes){
    while(cache.size>=maxEntries||cachedBytes+size>maxBytes){const [oldKey,old]=cache.entries().next().value!;cache.delete(oldKey);cachedBytes-=bytes(old);old.dispose()}
    cache.set(key,g);cachedBytes+=size
  }
  return g
}
