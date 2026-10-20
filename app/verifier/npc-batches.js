import * as THREE from 'three'
import { buildPlayerModel } from '/src/game/renderer/playerModel.ts'
import { applyNpcGear } from '/src/game/renderer/npcGear.ts'
import { batchNpcParts, setNpcBatchesEnabled } from '/src/game/renderer/npcBatches.ts'
import { NPCS, npcAvatar, brcWorkerDef, jerryFollowerDef } from '/src/game/content/npcs.ts'
import { DEFAULT_AVATAR } from '/src/game/core/avatar.ts'

export async function verifyNpcBatches(diagnostic=false) {
  delete window.npcBatchFailure
  const three=new THREE.WebGLRenderer({antialias:false}),rows=[],failures=[],cases=Object.values(NPCS).map(def=>({id:def.id,def,cfg:npcAvatar(def)}))
  three.setSize(320,320,false);three.shadowMap.type=THREE.PCFSoftShadowMap
  for(let i=0;i<16;i++){
    const def=brcWorkerDef(424242,i,-i,i);cases.push({id:`brc-${i}`,def,cfg:npcAvatar(def)})
  }
  for(let i=0;i<4;i++){const def=jerryFollowerDef(424242,i);cases.push({id:`jerry-${i}`,def,cfg:npcAvatar(def)})}
  for(let i=0;i<32;i++)cases.push({id:`avatar-${i}`,cfg:{...DEFAULT_AVATAR,gender:i%2,hair:i%16,topStyle:i%8,pantsStyle:i%6,face:i%4,glasses:i%4,beard:i%3,shoes:i%3}})
  const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(38,1,.01,30)
  scene.background=new THREE.Color('#777a80')
  scene.add(new THREE.AmbientLight('#bcc9ef',.75))
  const sun=new THREE.DirectionalLight('#ffe5bd',2)
  sun.position.set(3,6,4);sun.castShadow=true;sun.shadow.mapSize.set(256,256)
  sun.shadow.camera.left=-2;sun.shadow.camera.right=2;sun.shadow.camera.top=2;sun.shadow.camera.bottom=-2
  sun.shadow.camera.near=.1;sun.shadow.camera.far=15
  scene.add(sun)
  const floor=new THREE.Mesh(new THREE.PlaneGeometry(8,8),new THREE.MeshLambertMaterial({color:'#737373'}))
  floor.rotation.x=-Math.PI/2;floor.position.y=-.03;floor.receiveShadow=true;scene.add(floor)
  camera.position.set(2.4,1.35,3.8);camera.lookAt(0,.85,0)
  const before=new Uint8Array(320*320*4),after=new Uint8Array(before.length)
  const dispose=root=>{
    const geometries=new Set(),materials=new Set()
    root.traverse(o=>{if(o.geometry)geometries.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:o.material?[o.material]:[])materials.add(m)})
    for(const g of geometries)g.dispose();for(const m of materials)m.dispose()
  }
  const draw=buffer=>{three.info.reset();three.render(scene,camera);const gl=three.getContext();gl.readPixels(0,0,320,320,gl.RGBA,gl.UNSIGNED_BYTE,buffer);return three.info.render.calls}
  try {
    for(const test of cases){
      const model=buildPlayerModel(test.cfg),parts=model.userData.parts
      if(test.def?.faction==='brc'){
        const faces=[];parts.head.traverse(o=>{if(o.userData.face)faces.push(o)})
        for(const face of faces){face.removeFromParent();dispose(face)}
      }else if(test.def?.uniform?.badge){
        const badge=new THREE.Mesh(new THREE.BoxGeometry(.07,.09,.015),new THREE.MeshLambertMaterial({color:test.def.uniform.badge}))
        badge.position.set(-.1,1.2,.125);model.add(badge)
      }
      if(test.def)applyNpcGear(parts,test.def.id,test.def)
      model.traverse(o=>{if(o.isMesh){o.castShadow=!o.userData.noCastShadow;o.receiveShadow=true}})
      batchNpcParts(model,parts);scene.add(model)
      try {
        for(let pose=0;pose<4;pose++)for(const shadows of [false,true]){
          three.shadowMap.enabled=shadows
          model.rotation.set(0,pose*1.37,pose===3?1.2:0);model.scale.setScalar(pose===3?.45:1)
          parts.head.rotation.set(pose*.04,pose*.11,0)
          parts.torso.scale.y=1+pose*.015;parts.torso.rotation.y=pose*.07
          parts.armL.rotation.set(pose===2?-1.55:Math.sin(pose)*.5,0,pose*.08)
          parts.armR.rotation.set(pose===2?-2.2:-Math.sin(pose)*.5,0,-pose*.08)
          parts.legL.rotation.x=Math.sin(pose)*.5;parts.legR.rotation.x=-Math.sin(pose)*.5
          const guitar=parts.torso.children.find(o=>o.userData.joeyGuitar)
          if(guitar){guitar.position.set(-.1+pose*.04,.06-pose*.03,-.2+pose*.1);guitar.rotation.y=-pose*.03}
          setNpcBatchesEnabled(model,true);const afterCalls=draw(after)
          setNpcBatchesEnabled(model,false);const beforeCalls=draw(before)
          let large=0,total=0,maxDelta=0
          for(let i=0;i<before.length;i++){const d=Math.abs(before[i]-after[i]);total+=d;maxDelta=Math.max(maxDelta,d);if(d>8)large++}
          // Check large changes in BOTH directions against a one-pixel
          // neighbourhood. This accepts edge raster rounding, not a missing
          // feature or a changed interior color, at this close-up resolution.
          let unmatched=0
          const nearby=(source,destination,index)=>{
            const pixel=index/4,x=pixel%320,y=Math.floor(pixel/320)
            for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
              if(x+dx<0||x+dx>=320||y+dy<0||y+dy>=320)continue
              const j=((y+dy)*320+x+dx)*4
              if(Math.max(...[0,1,2].map(c=>Math.abs(source[index+c]-destination[j+c])))<=8)return true
            }
            return false
          }
          for(let i=0;i<before.length;i+=4)if(Math.max(...[0,1,2].map(c=>Math.abs(before[i+c]-after[i+c])))>8){
            if(!nearby(before,after,i)||!nearby(after,before,i))unmatched++
          }
          const row={id:test.id,pose,shadows,beforeCalls,afterCalls,meanDelta:total/before.length,maxDelta,large,unmatched}
          rows.push(row)
          // At 320px an entire sub-pixel triangle can round to one pixel in
          // just one image. Permit at most one such pixel, plus the same
          // channel/mean limits used by the existing geometry batch verifier.
          if(row.meanDelta>.03||large/before.length>.0001||unmatched>1){
            const png=buffer=>{const c=document.createElement('canvas');c.width=c.height=320;const context=c.getContext('2d');context.putImageData(new ImageData(new Uint8ClampedArray(buffer),320,320),0,0);return c.toDataURL()}
            if(!window.npcBatchFailure||row.meanDelta>window.npcBatchFailure.row.meanDelta)window.npcBatchFailure={row,before:png(before),after:png(after)}
            failures.push(row)
            if(!diagnostic)throw new Error(`NPC batch raster mismatch ${JSON.stringify(row)}`)
          }
          if(afterCalls>=beforeCalls)throw new Error(`NPC batch draw reduction missing ${JSON.stringify(row)}`)
        }
      } finally {model.removeFromParent();dispose(model)}
      await new Promise(requestAnimationFrame)
    }
  } finally {
    dispose(floor);sun.shadow.map?.dispose();sun.shadow.mapPass?.dispose();three.dispose();three.forceContextLoss()
  }
  return {passed:rows.length-failures.length,cases:cases.length,failures,rows}
}
