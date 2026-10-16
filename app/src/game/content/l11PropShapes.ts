import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import type { L11PropPart } from './l11PropKit'

const units={box:new THREE.BoxGeometry(1,1,1),cylinder:new THREE.CylinderGeometry(.5,.5,1,16),sphere:new THREE.SphereGeometry(.5,12,8),plane:new THREE.PlaneGeometry(1,1)}
const cushion=new RoundedBoxGeometry(1,1,1,2,.09)
const roundUnits=new Map<string,THREE.BufferGeometry>()
const prepared=new WeakMap<L11PropPart,{geometry:THREE.BufferGeometry;matrix:THREE.Matrix4}>()

/** Shared CPU geometry and world transform for an L11 prop part.
 * Materials and GPU buffers are intentionally outside this module. */
export function l11PropShape(p:L11PropPart){
  const hit=prepared.get(p);if(hit)return hit
  let geometry:THREE.BufferGeometry,sz=p.d
  if(p.profile){
    // A longitudinal (z,y) silhouette extruded across the vehicle width.
    // The same closed mesh supplies render geometry and collision triangles.
    const key='profile:'+JSON.stringify([p.profile,p.bevel,p.crown,p.nose])
    geometry=roundUnits.get(key)!
    if(!geometry){
      const outline=new THREE.Shape(p.profile.map(([z,y])=>new THREE.Vector2(z,y)))
      const bevel=p.bevel??0
      geometry=new THREE.ExtrudeGeometry(outline,{depth:1-bevel*2,steps:1,bevelEnabled:bevel>0,bevelSize:bevel,bevelThickness:bevel,bevelSegments:3}).rotateY(-Math.PI/2)
      geometry.computeBoundingBox()
      const box=geometry.boundingBox!,size=box.getSize(new THREE.Vector3()),center=box.getCenter(new THREE.Vector3())
      geometry.translate(-center.x,-center.y,-center.z).scale(1/size.x,1/size.y,1/size.z)
      if(p.crown||p.nose){
        const vertices=geometry.getAttribute('position')
        for(let i=0;i<vertices.count;i++){
          const top=vertices.getY(i)+.5,end=Math.max(0,(Math.abs(vertices.getZ(i))-.32)/.18)
          vertices.setX(i,vertices.getX(i)*(1-(1-(p.crown??1))*top)*(1-(p.nose??0)*end*end))
        }
        geometry.computeVertexNormals()
      }
      roundUnits.set(key,geometry)
    }
  }else if(p.shape==='ring'){
    sz=Math.min(p.w,p.h)
    const tube=Math.min(.24,Math.max(.005,p.d/sz/2)),arc=p.arc??Math.PI*2,key=`ring:${tube}:${arc}`
    geometry=roundUnits.get(key)??new THREE.TorusGeometry(.5-tube,tube,8,Math.max(4,Math.ceil(20*arc/(Math.PI*2))),arc);roundUnits.set(key,geometry)
  }else if(p.shape==='cylinder'&&p.taper!==undefined){
    const key=`taper:${p.taper}`
    geometry=roundUnits.get(key)??new THREE.CylinderGeometry(.5*p.taper,.5,1,16);roundUnits.set(key,geometry)
  }else geometry=p.shape==='box'&&p.surface==='fabric'&&p.h>.055?cushion:units[p.shape as keyof typeof units]
  const matrix=new THREE.Matrix4().compose(new THREE.Vector3(p.x,p.y,p.z),new THREE.Quaternion().setFromEuler(new THREE.Euler(p.rx??0,p.ry??0,p.rz??0)),new THREE.Vector3(p.w,p.h,p.shape==='plane'?1:sz))
  const value={geometry,matrix};prepared.set(p,value);return value
}
