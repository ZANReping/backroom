import * as THREE from 'three'
import { buildItemMesh } from '/src/game/renderer/itemsMesh.ts'
import { batchRigidItem } from '/src/game/renderer/itemBatches.ts'
import { getMaterialMode, setMaterialMode } from '/src/game/renderer/shared.ts'

export async function verifyHaloPass() {
  const rows=[],checks=[],assert=(ok,label)=>{if(!ok)throw new Error(label);checks.push(label)}
  const oldMode=getMaterialMode(),three=new THREE.WebGLRenderer({antialias:false}),scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(45,1,.01,10)
  const target=new THREE.WebGLRenderTarget(192,192);three.setRenderTarget(target);three.shadowMap.type=THREE.PCFSoftShadowMap
  scene.background=new THREE.Color('#79828a');scene.fog=new THREE.Fog('#79828a',1,4)
  scene.add(new THREE.AmbientLight('#d5dfff',.8));const light=new THREE.DirectionalLight('#fff1d7',2);light.position.set(1,3,2);light.castShadow=true
  Object.assign(light.shadow.camera,{left:-2,right:2,top:2,bottom:-2,near:.1,far:10});light.shadow.mapSize.set(256,256);scene.add(light)
  const floor=new THREE.Mesh(new THREE.PlaneGeometry(5,5),new THREE.MeshLambertMaterial({color:'#73706a'}));floor.rotation.x=-Math.PI/2;floor.position.y=-.4;floor.receiveShadow=true;scene.add(floor)
  const draw=()=>{three.info.reset();three.shadowMap.needsUpdate=true;three.render(scene,camera);const bytes=new Uint8Array(192*192*4);three.readRenderTargetPixels(target,0,0,192,192,bytes);return {bytes,calls:three.info.render.calls}}
  try {
    for(const mode of ['classic','realistic'])for(const type of ['almond','coffee','warpberry','flashlight','bandage','capacitor','stapler']) {
      setMaterialMode(mode);const root=buildItemMesh(type);batchRigidItem(root)
      const halo=root.children.find(o=>o.isMesh&&o.geometry.type==='RingGeometry')
      assert(halo?.material.forceSinglePass===true,`${mode}/${type}: factory selects a single pass for the planar ring`)
      const materials=new Set(),geometries=new Set()
      root.traverse(o=>{if(!o.isMesh)return;geometries.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:[o.material])materials.add(m);o.castShadow=o!==halo;o.receiveShadow=true})
      scene.add(root)
      try {
        for(let pose=0;pose<12;pose++)for(const shadows of [false,true]) {
          root.rotation.set(pose>=6?.6:0,pose*.43,pose>=9?.7:0);root.scale.x=pose%4===3?-1:1
          camera.position.set(Math.sin(pose*.71)*.9,pose%3===0?.65:pose%3===1?-.75:-.2799,Math.cos(pose*.71)*.9);camera.lookAt(0,-.08,0)
          floor.visible=pose%3===0;three.shadowMap.enabled=shadows
          halo.material.forceSinglePass=false;halo.material.needsUpdate=true;const before=draw()
          halo.material.forceSinglePass=true;halo.material.needsUpdate=true;const after=draw()
          let maxDelta=0;for(let i=0;i<before.bytes.length;i++)maxDelta=Math.max(maxDelta,Math.abs(before.bytes[i]-after.bytes[i]))
          assert(maxDelta===0,`${mode}/${type}/${pose}/${shadows}: plane, overlap, winding and shadow pixels match`)
          assert(after.calls===before.calls-1,`${mode}/${type}/${pose}/${shadows}: visible halo removes exactly one draw call`)
          rows.push({mode,type,pose,shadows,maxDelta,beforeCalls:before.calls,afterCalls:after.calls})
        }
      } finally {root.removeFromParent();for(const g of geometries)g.dispose();for(const m of materials)m.dispose()}
    }
    const noHalo=buildItemMesh('coffee',{halo:false})
    assert(!noHalo.children.some(o=>o.isMesh&&o.geometry.type==='RingGeometry'),'projectile option still omits the halo')
    const geos=new Set(),mats=new Set();noHalo.traverse(o=>{if(o.geometry)geos.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:o.material?[o.material]:[])mats.add(m)})
    for(const g of geos)g.dispose();for(const m of mats)m.dispose()
    assert(three.getContext().getError()===three.getContext().NO_ERROR,'no WebGL error')
  } finally {setMaterialMode(oldMode);floor.geometry.dispose();floor.material.dispose();light.shadow.dispose();target.dispose();three.dispose();three.forceContextLoss()}
  return {passed:checks.length,comparisons:rows.length,checks,rows}
}

export async function measureHaloPassPairs() {
  const {renderer:r,engine:e}=perfQA
  await perfQA.measure(4,5)
  if(r.itemWarmup.jobs.size)throw new Error('Ground models are still preparing')
  const halos=[]
  for(const root of r.itemMeshes.values())for(const mesh of root.children)if(mesh.isMesh&&mesh.geometry.type==='RingGeometry'){
    const single=mesh.material,double=single.clone();double.forceSinglePass=false
    halos.push({mesh,single,double})
  }
  const render=enabled=>{for(const h of halos)h.mesh.material=enabled?h.single:h.double;r.three.info.reset();const t=performance.now();r.three.render(r.scene,r.camera);return {cpu:performance.now()-t,calls:r.three.info.render.calls}}
  const rows=[]
  try {
    if(!halos.length)throw new Error('No ground halos in fixture')
    for(let i=0;i<12;i++){await new Promise(requestAnimationFrame);render(false);render(true)}
    for(let i=0;i<240;i++){
      await new Promise(requestAnimationFrame)
      const order=i%2?[true,false]:[false,true],pair={}
      for(const enabled of order)pair[enabled?'single':'double']=render(enabled)
      rows.push(pair)
    }
  }finally{for(const h of halos){h.mesh.material=h.single;h.double.dispose()}}
  const p=(values,q)=>[...values].sort((a,b)=>a-b)[Math.floor((values.length-1)*q)]
  const summarize=key=>({cpuP50:p(rows.map(row=>row[key].cpu),.5),cpuP90:p(rows.map(row=>row[key].cpu),.9),calls:p(rows.map(row=>row[key].calls),.5)})
  return {note:'One frozen L4 scene, 240 paired draws with alternating order. Model positions, camera, image sources, lighting and draw contents remain identical.',level:e.player.level,halos:halos.length,results:[{double:summarize('double'),single:summarize('single'),rows}],environment:perfQA.report()}
}
