import * as THREE from 'three'
import { prepareArchitecturalGlassPasses } from '/src/game/renderer/architecturalGlassPasses.ts'
import { architecturalGlassMaterial, architecturalGlassPassMaterials, getReflectK, setReflectK } from '/src/game/renderer/shared.ts'

export function verifyGlassPassGuards() {
  const source=architecturalGlassMaterial(),planar=architecturalGlassMaterial(true),pair=architecturalGlassPassMaterials(),scale=getReflectK()
  const checks=[],assert=(ok,label)=>{if(!ok)throw new Error(label);checks.push(label)}
  const root=new THREE.Group(),ownGeometry=new Set(),ownMaterials=new Set(),instances=[]
  const box=()=>{const geometry=new THREE.BoxGeometry(1,1,.03);ownGeometry.add(geometry);return geometry}
  const mesh=(material=source,geometry=box())=>{const result=new THREE.Mesh(geometry,material);result.userData.noCastShadow=1;root.add(result);return result}
  const valid=mesh(),nonIndexedGeometry=box().toNonIndexed();ownGeometry.add(nonIndexedGeometry)
  const partial=mesh(source,nonIndexedGeometry);partial.geometry.setDrawRange(3,6)
  const sourceCopy=source.clone();ownMaterials.add(sourceCopy)
  const wrongSource=mesh(sourceCopy),plane=mesh(planar),beforeHook=mesh(),afterHook=mesh(),caster=mesh(),missingFlag=mesh(),empty=mesh(source,new THREE.BufferGeometry())
  ownGeometry.add(empty.geometry);beforeHook.onBeforeRender=()=>{};afterHook.onAfterRender=()=>{};caster.castShadow=true;delete missingFlag.userData.noCastShadow
  const instance=new THREE.InstancedMesh(box(),source,2);instance.userData.noCastShadow=1;root.add(instance);instances.push(instance)
  const nested=new THREE.Group(),nestedMesh=new THREE.Mesh(box(),source);nestedMesh.userData.noCastShadow=1;nested.add(nestedMesh);root.add(nested)
  const skipped=[wrongSource,plane,beforeHook,afterHook,caster,missingFlag,empty,instance,nestedMesh]
  const snapshots=skipped.map(object=>({object,geometry:object.geometry,groups:JSON.stringify(object.geometry.groups),material:object.material}))
  const originalGeometry=valid.geometry,index=valid.geometry.index,attributes={...valid.geometry.attributes},originalRange={...valid.geometry.drawRange}
  const sourceState=JSON.stringify(source.toJSON()),pairVersions=pair.map(material=>material.version)
  let sharedDisposals=0,geometriesReleased=false;const listener=()=>sharedDisposals++
  for(const material of [source,planar,...pair])material.addEventListener('dispose',listener)
  try {
    prepareArchitecturalGlassPasses(root)
    assert(valid.geometry===originalGeometry&&valid.geometry.index===index&&Object.entries(attributes).every(([name,value])=>valid.geometry.attributes[name]===value),'conversion retains geometry and all original render buffers')
    for(const object of [valid,partial]){
      const count=object.geometry.index?.count??object.geometry.getAttribute('position').count
      assert(object.material===pair&&JSON.stringify(object.geometry.groups)===JSON.stringify([{start:0,count,materialIndex:0},{start:0,count,materialIndex:1}]),'indexed and nonindexed glass use full back/front groups')
    }
    assert(valid.geometry.drawRange.start===originalRange.start&&valid.geometry.drawRange.count===originalRange.count&&partial.geometry.drawRange.start===3&&partial.geometry.drawRange.count===6,'draw ranges stay unchanged')
    for(const {object,geometry,groups,material} of snapshots)assert(object.geometry===geometry&&JSON.stringify(geometry.groups)===groups&&object.material===material,'unsupported, shared fallback, custom callback and shadow-casting objects stay unchanged')
    assert(pair[0].side===THREE.BackSide&&pair[1].side===THREE.FrontSide&&pair.every(material=>material.forceSinglePass),'stable sides retain back-then-front rendering')
    assert(JSON.stringify(source.toJSON())===sourceState,'source glass material is unchanged')
    prepareArchitecturalGlassPasses(root)
    assert(valid.material===pair&&valid.geometry.groups.length===2&&pair.every((material,i)=>material.version===pairVersions[i]),'conversion is idempotent without invalidating the shared programs')
    for(const factor of [0,.5,1,100/60]){
      setReflectK(factor);const again=architecturalGlassPassMaterials()
      assert(again===pair&&again.every(material=>Math.abs(material.envMapIntensity-.32*factor)<1e-10),'later chunks reuse the bounded pair at current reflection strength')
    }
    for(const geometry of ownGeometry)geometry.dispose()
    geometriesReleased=true
    assert(sharedDisposals===0,'private geometry disposal leaves the bounded shared material pair alive')
  } finally {
    if(!geometriesReleased)for(const geometry of ownGeometry)geometry.dispose()
    setReflectK(scale);architecturalGlassPassMaterials()
    for(const material of [source,planar,...pair])material.removeEventListener('dispose',listener)
    for(const instance of instances)instance.dispose()
    for(const material of ownMaterials)material.dispose()
  }
  return {passed:checks.length,checks}
}
