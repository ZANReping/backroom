import * as THREE from 'three'
import { buildStructure } from '/src/game/renderer/structures.ts'
import { floorHeight, structColliders } from '/src/game/world/mapgen.ts'

export async function verifyPerformanceFlows() {
  const {engine:e,renderer:r}=window.perfQA,checks=[]
  const assert=(ok,label)=>{if(!ok)throw new Error(label);checks.push(label)}
  await perfQA.measure(5,60)
  const bounds=root=>{
    root.updateWorldMatrix(true,true)
    const box=new THREE.Box3(),matrix=new THREE.Matrix4(),world=new THREE.Matrix4()
    root.traverseVisible(node=>{
      if(!node.isMesh)return
      node.geometry.computeBoundingBox()
      if(node.isInstancedMesh)for(let i=0;i<node.count;i++){
        node.getMatrixAt(i,matrix);world.multiplyMatrices(node.matrixWorld,matrix)
        box.union(node.geometry.boundingBox.clone().applyMatrix4(world))
      }else box.union(node.geometry.boundingBox.clone().applyMatrix4(node.matrixWorld))
    })
    return box
  }
  const candidates=e.map.structures.filter(s=>['crate','cabinet','dresser','hoteldoor','bookcase','suitcase'].includes(s.kind)).slice(0,30)
  for(const s of candidates){
    const g=buildStructure(s,e.levelDef,e.map,r.wallH)
    if(!g)continue
    g.position.y+=floorHeight(e.map,s.x+s.w/2,s.y+s.h/2,s.floor??0)
    const before=bounds(g)
    r.batchContainerShell(s,g)
    const after=bounds(g)
    assert(before.min.distanceTo(after.min)<.001&&before.max.distanceTo(after.max)<.001,`${s.kind}: static shell keeps visible world bounds`)
    r.disposeItemModel(g)
  }
  const entry=[...r.animatedStructMeshes].find(([s,g])=>s.kind==='hoteldoor'&&g.getObjectByProperty('type','Group'))
  assert(!!entry,'a hotel door remains available for interaction')
  if(entry){
    const [s,g]=entry;s.data??={};s.data.open=0;g.userData.open=0
    let lid;g.traverse(o=>{if(o.userData.lid)lid=o})
    assert(!!lid,'door hinge survives batching')
    r.updateStructs(.05);g.updateWorldMatrix(true,true);const before=lid.matrixWorld.clone()
    const closedBoxes=JSON.stringify(structColliders(s,e.map))
    s.data.open=1;for(let i=0;i<30;i++)r.updateStructs(.05)
    g.updateWorldMatrix(true,true)
    assert(!before.equals(lid.matrixWorld),'opening a door updates the rendered hinge matrix')
    assert(g.getObjectByName('container-static-shell')?.userData.noCollision===true,'batched shell never replaces exact collision proxies')
    assert(JSON.stringify(structColliders(s,e.map))!==closedBoxes,'opening a door changes its collision boxes')
    s.data.open=0;for(let i=0;i<60;i++)r.updateStructs(.05)
    assert(JSON.stringify(structColliders(s,e.map))===closedBoxes,'closing a door restores its original collision boxes')
  }
  for(const type of ['crowbar','almond','canned','bandage'])r.setHeldItem(type)
  const cached=r.heldCache.get('classic:crowbar');r.setHeldItem('crowbar')
  assert(r.vmItem===cached,'hotbar re-selection reuses its model')
  r.setLightMode('realistic');r.setHeldItem('crowbar')
  assert(r.vmItem!==cached,'different light modes use separate held model entries')
  r.setLightMode('classic')
  return {passed:checks.length,checks}
}

export async function measureChunkCrossings(id=0,crossings=6) {
  await perfQA.measure(id,60)
  const {engine:e,renderer:r}=perfQA,rows=[]
  // Give the outer raw-data ring time to arrive, as during normal walking.
  await new Promise(resolve=>setTimeout(resolve,500))
  for(let i=0;i<crossings;i++){
    const before=e.map.inf.ox,started=performance.now()
    e.player.x+=i<crossings/2?32:-32
    e.updateInfiniteWindow()
    const shiftMs=performance.now()-started
    let frames=0,maxBuildMs=0,waitAt=performance.now()
    while(!r.isNearWorldReady(e)||frames<30){
      await new Promise(requestAnimationFrame)
      const t=performance.now();r.render(r.three.domElement,e,{grain:false,flicker:.7,shake:false},1/60)
      maxBuildMs=Math.max(maxBuildMs,performance.now()-t);frames++
      if(performance.now()-waitAt>60_000)throw new Error('Chunk crossing timed out')
    }
    rows.push({shiftMs,maxBuildMs,frames,originBefore:before,originAfter:e.map.inf.ox,chunks:r.chunkGroups.size,memory:{...r.three.info.memory}})
  }
  return {level:id,kind:`${crossings} forced adjacent-chunk crossings and return; not a walking FPS claim`,rows}
}
