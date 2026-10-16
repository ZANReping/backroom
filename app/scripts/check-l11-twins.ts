import assert from 'node:assert/strict'
import {mkdirSync,writeFileSync} from 'node:fs'
import {createCanvas} from '@napi-rs/canvas'
import * as THREE from 'three'
import {l11CityPlan,l11VolumePolygon,l11World} from '../src/game/world/l11Layout'
import {l11ArchitectureVolumes} from '../src/game/content/l11Architecture'
import {l11Twins} from '../src/game/world/l11Twins'
import {l11ReferenceDetails} from '../src/game/world/l11ReferenceDetails'
import {l11BuildingColliders} from '../src/game/world/l11Collision'
import {l11SolidHits} from '../src/game/world/l11Solid'
import {L11_REFERENCE_SEED} from '../src/game/world/l11ReferenceDistrict'
import {referenceFacade} from '../src/game/renderer/l11ReferenceFacades'
import {CityBatch} from '../src/game/renderer/l11Batch'
import {transform} from '../src/game/world/l11Geometry'

Object.defineProperty(globalThis,'document',{value:{createElement:()=>createCanvas(128,128)}})
const source=l11CityPlan(L11_REFERENCE_SEED,0,0).buildings.find(b=>b.id.endsWith(':reference:quay-east-near'))!
const report={ok:true,fronts:[] as string[],lodFrames:0,blueVertices:0,collisions:0}
for(const front of ['n','s','e','w'] as const){
  const q=l11Twins(source.width,source.depth,front),volumes=l11ArchitectureVolumes('ribbon-twins',source.width,source.depth,source.floors,front)
  const b={...source,front,volumes,doorLocal:q.point(q.start+q.gap/2,0),angle:.37,base:2.3,sealed:true,accessible:0,entrance:undefined,stairs:[]}
  const connector=volumes.find(v=>v.soffit)!,inner=volumes.filter(v=>v.faceProfiles)
  const v0=q.local(connector.x,connector.y)[1],v1=q.local(connector.x+connector.w,connector.y+connector.d)[1]
  assert(Math.abs(Math.min(v0,v1))<1e-6&&Math.abs(Math.max(v0,v1)-q.linkDepth)<1e-6,'roof link begins at the actual street side')
  const colliders=l11BuildingColliders({kind:'l11building',x:b.x,y:b.y,w:b.w,h:b.h,solid:true,l11:b})
  const [wx,wz]=l11World(b,...q.point(q.start+q.gap/2,q.linkDepth/2))
  assert(colliders.some(c=>l11SolidHits(c,wx,wz,.01,connector.lo-.16,connector.lo-.04)),'soffit blocks an upward collision')
  assert(!colliders.some(c=>l11SolidHits(c,wx,wz,.01,connector.lo-2,connector.lo-1)),'clear space beneath connector')
  assert(colliders.some(c=>l11SolidHits(c,wx,wz,.01,connector.hi-.08,connector.hi+.01)),'roof has a solid upper surface')
  for(const u of [q.start,q.end]){
    const p=q.point(u,q.linkDepth/2)
    assert(l11ReferenceDetails(b).some(d=>d.h===.2&&Math.abs(d.x-p[0])<1e-6&&Math.abs(d.z-p[1])<1e-6),'bearing enters the corresponding tower wall')
  }
  report.collisions+=3
  for(const detail of [0,1,2]){
    const local=new THREE.Group(),world=new THREE.Group(),near=new CityBatch(),far=new CityBatch()
    for(const v of inner)for(let floor=v.lo;floor<v.hi;floor+=3){
      const polygon=l11VolumePolygon(v)
      referenceFacade(near,b,polygon,floor,floor+3,detail,v.faceProfiles)
      referenceFacade(far,b,transform(polygon,321,-187,b.angle),floor+b.base,floor+3+b.base,detail,v.faceProfiles,b.angle,b.base)
    }
    near.finish(local);far.finish(world)
    assert.equal(local.children.length,world.children.length,'local and distant material sets')
    const matrix=new THREE.Matrix4().makeTranslation(321,b.base,-187).multiply(new THREE.Matrix4().makeRotationY(-b.angle)),point=new THREE.Vector3()
    local.children.forEach((child,i)=>{
      const a=child as THREE.Mesh,b=world.children[i] as THREE.Mesh,mat=a.material as THREE.MeshStandardMaterial,p=a.geometry.attributes.position,z=b.geometry.attributes.position
      assert.equal(mat,b.material);assert.equal(p.count,z.count,`${front} LOD ${detail} ${mat.name}: same segmentation in transformed frame`)
      for(let j=0;j<p.count;j++){
        point.fromBufferAttribute(p,j).applyMatrix4(matrix)
        assert(point.distanceTo(new THREE.Vector3().fromBufferAttribute(z,j))<.0001,'same geometry in transformed frame')
        if(mat.color.getHexString()==='315d8a'){
          const [u,v]=q.local(p.getX(j),p.getZ(j))
          assert(v>=q.linkDepth*.2-.001&&v<=q.linkDepth*.8+.001,'blue belongs to a single composition beneath the connector')
          assert(Math.min(Math.abs(u-q.start),Math.abs(u-q.end))<.03,'blue is on an inward tower wall')
          report.blueVertices++
        }
      }
      a.geometry.dispose();b.geometry.dispose()
    })
    report.lodFrames++
  }
  report.fronts.push(front)
}
assert(report.blueVertices>0)
mkdirSync('reports/l11-reference/retail-v16',{recursive:true})
writeFileSync('reports/l11-reference/retail-v16/twins.json',JSON.stringify(report,null,2)+'\n')
console.log(JSON.stringify(report,null,2))
