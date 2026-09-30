import * as THREE from 'three'
import {mergeGeometries} from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import {materialBatchKey} from './materialBatch'
import {cloneRenderGeometry} from './renderGeometry'

// Small spatial buckets keep culling useful. All opaque parts sharing a material
// merge, irrespective of box dimensions; unique phone/key/vent shapes don't each
// require an instanced draw. Transparent panes retain their ordering.
export function batchL4Static(target:THREE.Group,roots:THREE.Object3D[]){
  const job=batchL4StaticJob(target,roots)
  while(!job.next().done){/* synchronous callers retain the same complete result */}
}

export function* batchL4StaticJob(target:THREE.Group,roots:THREE.Object3D[]):Generator<void,void,unknown>{
  const groups=new Map<string,{mat:THREE.Material;cast:boolean;noCast:boolean;order:number;geos:THREE.BufferGeometry[]}>()
  const materialKeys=new Map<THREE.Material,string>()
  const staged=new THREE.Group(),owned=new Set<THREE.BufferGeometry>()
  try {
  for(const root of roots){
    yield
    root.updateWorldMatrix(true,true)
    const meshes:THREE.Mesh[]=[]
    root.traverse(o=>{
      const mesh=o as THREE.Mesh
      if(!mesh.isMesh||!mesh.visible||!mesh.geometry||Array.isArray(mesh.material))return
      meshes.push(mesh)
    })
    for(const mesh of meshes){
      yield
      const mat=mesh.material
      // Collection excludes material arrays; keep the original scalar material.
      if(Array.isArray(mat))continue
      const geo=cloneRenderGeometry(mesh.geometry)
      owned.add(geo);geo.applyMatrix4(mesh.matrixWorld)
      if(mat.transparent){const pane=new THREE.Mesh(geo,mat);pane.renderOrder=mesh.renderOrder;staged.add(pane);continue}
      const normalized=geo.index?geo.toNonIndexed():geo
      owned.add(normalized)
      if(normalized!==geo){geo.dispose();owned.delete(geo)}
      const layout=Object.keys(normalized.attributes).sort().map(key=>{const a=normalized.getAttribute(key);return `${key}:${a.itemSize}:${a.normalized}:${a.array.constructor.name}`}).join('|')
      const noCast=!!mesh.userData.noCastShadow
      const key=`${materialKeys.get(mat)??(materialKeys.set(mat,materialBatchKey(mat)),materialKeys.get(mat)!)}|${mesh.castShadow}|${noCast}|${mesh.renderOrder}|${layout}`
      const group=groups.get(key)??{mat,cast:mesh.castShadow,noCast,order:mesh.renderOrder,geos:[]};group.geos.push(normalized);groups.set(key,group)
    }
  }
  for(const{mat,cast,noCast,order,geos}of groups.values()){
    yield
    const result=mergeGeometries(geos,false)
    if(result)owned.add(result)
    // If an unusual geometry cannot merge, retain it rather than losing a part.
    for(const geo of result?[result]:geos){const mesh=new THREE.Mesh(geo,mat);mesh.castShadow=cast;mesh.receiveShadow=true;mesh.userData.noCastShadow=noCast;mesh.renderOrder=order;staged.add(mesh)}
    if(result)for(const geo of geos){geo.dispose();owned.delete(geo)}
  }
  // Publish together only after completion. A cancelled chunk never exposes a
  // partial batch, and its detached temporary buffers still have an owner.
  for(const mesh of [...staged.children])target.add(mesh)
  target.name='l4-static-details-batch'
  owned.clear()
  } finally {
    for(const geo of owned)geo.dispose()
    staged.clear()
  }
}
