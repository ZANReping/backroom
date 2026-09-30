import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { l2Material } from './l2Materials'
import { getMaterialMode } from './shared'
const doorMaterials=new Map<string,THREE.MeshLambertMaterial|THREE.MeshStandardMaterial>()
export function l2DoorMaterial(variant:string='tidy',hue:number=0) {
  const hueIndex=((Math.round(hue)%4)+4)%4
  const modeKey=`${getMaterialMode()}:${variant}:${hueIndex}`
  const cached=doorMaterials.get(modeKey);if(cached)return cached
  const source=l2Material(variant,'wall') as THREE.MeshLambertMaterial|THREE.MeshStandardMaterial
  const mat=source.clone()
  const tint=['#d9c7c9','#c8d4df','#cad9c9','#ddd0b9'][hueIndex]
  mat.color.multiply(new THREE.Color('#ffffff').lerp(new THREE.Color(tint),.3))
  mat.userData={...source.userData,l2Door:true}
  mat.onBeforeCompile=source.onBeforeCompile
  mat.customProgramCacheKey=source.customProgramCacheKey
  doorMaterials.set(modeKey,mat);return mat
}
/** All components follow the existing hinge animation. */
export function addL2DoorDetails(panel:THREE.Object3D,hingeOff:number,mirror:boolean,sealed:boolean,variant:string='tidy',hue:number=0,doorPaint?:THREE.Material):void {
  const sign=mirror?-1:1,edge=hingeOff+sign*.31
  const paint=doorPaint??l2DoorMaterial(variant,hue),dark=l2Material('dim','black')
  const metal=l2Material('dim','steel')
  const box=(w:number,h:number,d:number,mat:THREE.Material,x:number,y:number,z:number)=>{
    const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat);mesh.position.set(x,y,z);panel.add(mesh);return mesh
  }
  for(const face of [-1,1]) {
    for(const [y,h] of [[.38,.47],[1.01,.49],[1.68,.57]]) {
      box(.59,h,.013,paint,hingeOff,y,face*.042)
      for(const x of [-.312,.312])box(.026,h+.05,.028,paint,hingeOff+x,y,face*.058)
      for(const off of [-h/2-.012,h/2+.012])box(.65,.026,.028,paint,hingeOff,y+off,face*.058)
    }
    box(.065,.18,.025,metal,edge,1.09,face*.067)
    box(.16,.035,.04,metal,edge-sign*.065,1.11,face*.10)
    box(.23,.09,.013,dark,hingeOff,1.36,face*.055)
    box(.07,.012,.005,metal,hingeOff-.04,1.36,face*.064)
    for(let i=0;i<42;i++) {
      const x=hingeOff+Math.sin(i*17.17)*.413,y=.07+(i%7)*.075
      const chip=box(.008+(i%3)*.008,.017+(i%4)*.012,.003,dark,x,y,face*.037)
      chip.rotation.z=Math.sin(i*7)*.7
    }
    if(sealed){
      const shackle=new THREE.Mesh(new THREE.TorusGeometry(.034,.009,6,12,Math.PI),metal)
      shackle.position.set(edge,1.025,face*.12);panel.add(shackle)
      box(.07,.082,.036,dark,edge,.983,face*.12)
    }
  }
  for(const y of [.28,1.07,1.88]) {
    const hinge=new THREE.Mesh(new THREE.CylinderGeometry(.024,.024,.14,10),dark)
    hinge.position.set(hingeOff-sign*.425,y,.055);panel.add(hinge)
  }
  const batches=new Map<THREE.Material,THREE.BufferGeometry[]>()
  for(const child of [...panel.children]) {
    if(!(child instanceof THREE.Mesh)||Array.isArray(child.material))continue
    child.updateMatrix();child.geometry.applyMatrix4(child.matrix)
    const batch=batches.get(child.material)??[];batch.push(child.geometry);batches.set(child.material,batch);panel.remove(child)
  }
  for(const [material,geos] of batches){panel.add(new THREE.Mesh(mergeGeometries(geos)!,material));for(const geo of geos)geo.dispose()}
}
