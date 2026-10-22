import * as THREE from 'three'
import {mergeGeometries} from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import {materialBatchKey} from '../../src/game/renderer/materialBatch'
import {cloneRenderGeometry} from '../../src/game/renderer/renderGeometry'

// Stable fixture copied from the pre-optimization synchronous L4 batching algorithm.
export function batchL4Static(target:THREE.Group,roots:THREE.Object3D[]){
  const groups=new Map<string,{mat:THREE.Material;cast:boolean;noCast:boolean;order:number;geos:THREE.BufferGeometry[]}>()
  const materialKeys=new Map<THREE.Material,string>()
  for(const root of roots){
    root.updateWorldMatrix(true,true)
    root.traverse(o=>{
      const mesh=o as THREE.Mesh
      if(!mesh.isMesh||!mesh.visible||!mesh.geometry||Array.isArray(mesh.material))return
      const geo=cloneRenderGeometry(mesh.geometry).applyMatrix4(mesh.matrixWorld),mat=mesh.material
      if(mat.transparent){const pane=new THREE.Mesh(geo,mat);pane.renderOrder=mesh.renderOrder;target.add(pane);return}
      const normalized=geo.index?geo.toNonIndexed():geo
      if(normalized!==geo)geo.dispose()
      const layout=Object.keys(normalized.attributes).sort().map(key=>{const a=normalized.getAttribute(key);return `${key}:${a.itemSize}:${a.normalized}:${a.array.constructor.name}`}).join('|')
      const noCast=!!mesh.userData.noCastShadow
      const key=`${materialKeys.get(mat)??(materialKeys.set(mat,materialBatchKey(mat)),materialKeys.get(mat)!)}|${mesh.castShadow}|${noCast}|${mesh.renderOrder}|${layout}`
      const group=groups.get(key)??{mat,cast:mesh.castShadow,noCast,order:mesh.renderOrder,geos:[]};group.geos.push(normalized);groups.set(key,group)
    })
  }
  for(const{mat,cast,noCast,order,geos}of groups.values()){
    const result=mergeGeometries(geos,false)
    for(const geo of result?[result]:geos){const mesh=new THREE.Mesh(geo,mat);mesh.castShadow=cast;mesh.receiveShadow=true;mesh.userData.noCastShadow=noCast;mesh.renderOrder=order;target.add(mesh)}
    if(result)for(const geo of geos)geo.dispose()
  }
  target.name='l4-static-details-batch'
}
