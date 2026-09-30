import * as THREE from 'three'
import {buildL4OfficeDetail} from '../src/game/renderer/l4OfficeDetails'
import {l4VoidAt} from '../src/game/world/l4Layout'
import type {Engine} from '../src/game/engine'
export function verifyL4Details(engine:Engine,renderer:any){
  let checks=0
  const assert=(v:unknown,msg:string)=>{if(!v)throw new Error(msg);checks++}
  for(const kind of ['services','wallkit','printer','pantry','toilet','server','archive','deskItems','blinds'] as const){
    const g=buildL4OfficeDetail(kind,17);let meshes=0
    g.traverse(o=>{const mesh=o as THREE.Mesh;if(!mesh.isMesh)return;meshes++;const p=mesh.geometry.getAttribute('position');assert(Array.from(p.array).every(Number.isFinite),kind+' has valid vertices');assert(!new THREE.Box3().setFromObject(mesh).isEmpty(),kind+' has bounds');mesh.geometry.dispose()})
    assert(meshes>0,kind+' has meshes')
  }
  const m=engine.map!,volume=renderer.l4Volume
  assert(volume.texture.image.data.length===32768,'one 32 KiB density texture')
  assert(volume.group.children.length===9,'fixed pool of nine world volumes')
  assert(volume.material.uniforms.steps.value<=20,'bounded raymarch samples')
  assert(volume.material.depthWrite===false,'fog never writes opaque depth')
  for(const box of volume.group.children){
    for(const dx of [-19.9,0,19.9])for(const dz of [-19.9,0,19.9])assert(l4VoidAt(m.inf!.seed,box.position.x+dx+m.inf!.ox,box.position.z+dz+m.inf!.oy),'fog stays in void')
  }
  let fixtureMeshes=0,fixtureInstances=0
  renderer.scene.traverse((o:THREE.Object3D)=>{if(o.name==='l4-instanced-fixtures'){fixtureMeshes++;fixtureInstances+=(o as THREE.InstancedMesh).count}})
  assert(fixtureInstances>fixtureMeshes*4,'fixtures use instancing')
  return{checks,fixtureMeshes,fixtureInstances,volumeSamples:volume.material.uniforms.steps.value,densityBytes:32768}
}
