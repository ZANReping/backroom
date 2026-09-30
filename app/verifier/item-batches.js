import * as THREE from 'three'
import { buildItemMesh } from '/src/game/renderer/itemsMesh.ts'
import { batchRigidItem } from '/src/game/renderer/itemBatches.ts'
import { getMaterialMode, setMaterialMode } from '/src/game/renderer/shared.ts'

export async function verifyItemBatches() {
  const oldMode=getMaterialMode(),rows=[],rayRows=[]
  const three=new THREE.WebGLRenderer({antialias:false}),scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(35,1,.01,20)
  three.setSize(320,320,false);three.shadowMap.type=THREE.PCFSoftShadowMap
  scene.background=new THREE.Color('#777a80');scene.add(new THREE.AmbientLight('#bcc9ef',1))
  const light=new THREE.DirectionalLight('#ffe5bd',3);light.position.set(1,2,3);light.castShadow=true
  light.shadow.mapSize.set(512,512);Object.assign(light.shadow.camera,{left:-1,right:1,top:1,bottom:-1,near:.1,far:10})
  scene.add(light)
  const floor=new THREE.Mesh(new THREE.PlaneGeometry(6,6),new THREE.MeshLambertMaterial({color:'#777777'}))
  floor.rotation.x=-Math.PI/2;floor.position.y=-.35;floor.receiveShadow=true;scene.add(floor)
  const a=new Uint8Array(320*320*4),b=new Uint8Array(a.length)
  const dispose=roots=>{
    const geometries=new Set(),materials=new Set()
    for(const root of roots)root.traverse(o=>{if(o.geometry)geometries.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:o.material?[o.material]:[])materials.add(m)})
    for(const geometry of geometries)geometry.dispose();for(const material of materials)material.dispose()
  }
  const draw=buffer=>{three.shadowMap.needsUpdate=true;three.info.reset();three.render(scene,camera);const gl=three.getContext();gl.readPixels(0,0,320,320,gl.RGBA,gl.UNSIGNED_BYTE,buffer);return three.info.render.calls}
  try {
    for(const mode of ['classic','realistic'])for(const type of ['almond','cashew','canned','bandage','battery'])for(const halo of [false,true]) {
      setMaterialMode(mode)
      const original=buildItemMesh(type,{halo}),batched=original.clone(true),textures=new Set()
      for(const model of [original,batched])model.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;for(const m of Array.isArray(o.material)?o.material:[o.material])if(m.map)textures.add(m.map)}})
      batchRigidItem(batched)
      const start=performance.now()
      while([...textures].some(t=>!t.userData.loadedImage)&&performance.now()-start<10000)await new Promise(requestAnimationFrame)
      if([...textures].some(t=>!t.userData.loadedImage))throw new Error('Item textures not ready: '+type)
      scene.add(original,batched)
      try {
        for(let pose=0;pose<8;pose++)for(const shadows of [false,true]) {
          three.shadowMap.enabled=shadows
          for(const model of [original,batched]){model.rotation.set(pose>=4?.8:0,pose*.63,pose>=6?1.1:0);model.position.y=Math.sin(pose)*.03}
          camera.position.set(.5,pose%2?.7:.25,1.05);camera.lookAt(0,.02,0)
          original.visible=true;batched.visible=false;const beforeCalls=draw(a)
          original.visible=false;batched.visible=true;const afterCalls=draw(b)
          let sum=0,large=0,maxDelta=0,unmatched=0
          const nearby=(source,dest,i)=>{
            const x=(i/4)%320,y=Math.floor(i/4/320)
            for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
              if(x+dx<0||x+dx>=320||y+dy<0||y+dy>=320)continue
              const j=((y+dy)*320+x+dx)*4
              if(Math.max(...[0,1,2].map(c=>Math.abs(source[i+c]-dest[j+c])))<=8)return true
            }return false
          }
          for(let i=0;i<a.length;i++){const d=Math.abs(a[i]-b[i]);sum+=d;maxDelta=Math.max(maxDelta,d);if(d>8)large++}
          for(let i=0;i<a.length;i+=4)if(Math.max(...[0,1,2].map(c=>Math.abs(a[i+c]-b[i+c])))>8&&(!nearby(a,b,i)||!nearby(b,a,i)))unmatched++
          const row={mode,type,halo,pose,shadows,beforeCalls,afterCalls,meanDelta:sum/a.length,maxDelta,large,unmatched};rows.push(row)
          if(row.meanDelta>.03||large/a.length>.0001||unmatched>1)throw new Error('Item raster mismatch '+JSON.stringify(row))
          if(afterCalls>=beforeCalls)throw new Error('No item draw reduction '+JSON.stringify(row))
          // Picking still intersects the same triangles while the whole item moves.
          original.updateMatrixWorld(true);batched.updateMatrixWorld(true)
          const raycaster=new THREE.Raycaster();let hits=0,maxDistanceDelta=0
          for(let x=-2;x<=2;x++)for(let y=-2;y<=2;y++){
            raycaster.setFromCamera(new THREE.Vector2(x*.1,y*.1),camera)
            const aa=raycaster.intersectObject(original,true)[0],bb=raycaster.intersectObject(batched,true)[0]
            if(Boolean(aa)!==Boolean(bb))throw new Error('Item picking hit mismatch '+JSON.stringify(row))
            if(aa){hits++;maxDistanceDelta=Math.max(maxDistanceDelta,Math.abs(aa.distance-bb.distance))}
          }
          if(maxDistanceDelta>1e-5)throw new Error('Item picking distance changed')
          rayRows.push({mode,type,halo,pose,shadows,hits,maxDistanceDelta})
        }
      } finally {scene.remove(original,batched);dispose([original,batched])}
      await new Promise(requestAnimationFrame)
    }
  } finally {setMaterialMode(oldMode);dispose([floor]);light.shadow.map?.dispose();light.shadow.mapPass?.dispose();three.dispose();three.forceContextLoss()}
  return {passed:rows.length,rayChecks:rayRows.length*25,rows,rayRows}
}

// Pair both draws in the same frozen world, alternating order to limit warm
// cache / system drift bias. This measures render submission, not playable FPS.
export async function measureItemBatchPairs(levels=[4,106]) {
  const {engine:e,renderer:r,look}=perfQA,results=[]
  const supported=new Set(['almond','cashew','canned','bandage','battery'])
  const p=(values,q)=>[...values].sort((a,b)=>a-b)[Math.floor((values.length-1)*q)]
  for(const level of levels) {
    await perfQA.measure(level,20);e.paused=true
    const pairs=[],rows=[]
    for(const current of r.itemMeshes.values())if(supported.has(current.userData.itemType)) {
      const original=buildItemMesh(current.userData.itemType);r.enableShadows(original);r.scene.add(original)
      pairs.push({current,original,visible:current.visible})
    }
    const draw=enabled=>{
      for(const pair of pairs){pair.current.visible=enabled&&pair.visible;pair.original.visible=!enabled&&pair.visible}
      r.three.info.reset();const start=performance.now();r.three.render(r.scene,r.camera)
      return {cpu:performance.now()-start,calls:r.three.info.render.calls,triangles:r.three.info.render.triangles}
    }
    try {
      for(let n=0;n<280;n++) {
        await new Promise(requestAnimationFrame)
        look.yaw=n*Math.PI*2/240
        r.render(r.three.domElement,e,{grain:false,flicker:0,shake:false},0)
        for(const pair of pairs){pair.visible=pair.current.visible;pair.original.position.copy(pair.current.position);pair.original.quaternion.copy(pair.current.quaternion);pair.original.scale.copy(pair.current.scale)}
        let before,after
        if(n%2){before=draw(false);after=draw(true)}else{after=draw(true);before=draw(false)}
        if(n>=40)rows.push({before,after})
      }
      results.push({level,items:pairs.length,samples:rows.length,beforeCpuP50:p(rows.map(v=>v.before.cpu),.5),afterCpuP50:p(rows.map(v=>v.after.cpu),.5),beforeCpuP90:p(rows.map(v=>v.before.cpu),.9),afterCpuP90:p(rows.map(v=>v.after.cpu),.9),pairedDeltaP50:p(rows.map(v=>v.after.cpu-v.before.cpu),.5),beforeCallsP50:p(rows.map(v=>v.before.calls),.5),afterCallsP50:p(rows.map(v=>v.after.calls),.5),rows})
    } finally {for(const pair of pairs){pair.current.visible=pair.visible;pair.original.removeFromParent();r.disposeItemModel(pair.original)}}
  }
  return {kind:'paired frozen-scene render submission CPU; alternating order; not frame rate',results}
}
