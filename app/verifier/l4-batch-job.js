import * as THREE from 'three'
import { batchL4StaticJob } from '/src/game/renderer/l4Batch.ts'
import { batchL4Static as baseline } from '/.check/l4Batch-baseline.ts'
import { buildStructure } from '/src/game/renderer/structures.ts'
import { buildTerrain } from '/src/game/renderer/geometry.ts'
import { disposeL4Owned } from '/src/game/renderer/l4Meshes.ts'
import { getMaterialMode, setMaterialMode } from '/src/game/renderer/shared.ts'

export async function verifyL4BatchJob() {
  const {engine:e,renderer:r}=perfQA
  await perfQA.measure(4,5)
  const m=e.map,def=e.levelDef,oldMode=getMaterialMode(),checks=[],rows=[]
  const assert=(ok,label)=>{if(!ok)throw new Error(label);checks.push(label)}
  const three=new THREE.WebGLRenderer({antialias:false}),scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(45,1,.1,500),target=new THREE.WebGLRenderTarget(192,192)
  three.setRenderTarget(target);three.shadowMap.type=THREE.PCFSoftShadowMap;scene.background=new THREE.Color('#a2a5a8');scene.fog=new THREE.Fog('#a2a5a8',100,400)
  scene.add(new THREE.AmbientLight('#e0e4ff',.75));const light=new THREE.DirectionalLight('#fff0d5',2.4);light.castShadow=true;light.shadow.mapSize.set(512,512);scene.add(light,light.target)
  const equalArray=(a,b)=>a?.constructor===b?.constructor&&a?.length===b?.length&&a.every((v,i)=>Object.is(v,b[i]))
  const equalGeometry=(a,b)=>{
    if(!!a.index!==!!b.index||a.index&&!equalArray(a.index.array,b.index.array)||JSON.stringify(a.groups)!==JSON.stringify(b.groups))return false
    if(Object.keys(a.attributes).join()!==Object.keys(b.attributes).join())return false
    return Object.entries(a.attributes).every(([name,x])=>{const y=b.attributes[name];return x.itemSize===y.itemSize&&x.normalized===y.normalized&&equalArray(x.array,y.array)})
  }
  const draw=()=>{three.shadowMap.needsUpdate=true;three.info.reset();three.render(scene,camera);const pixels=new Uint8Array(192*192*4);three.readRenderTargetPixels(target,0,0,192,192,pixels);return {pixels,calls:three.info.render.calls}}
  const structureSets=[['cubicle','officechair'],['l4prop'],['glasswin','windowblack','pillar','desk','table','l4stairs']]
  try {
    for(const mode of ['classic','realistic'])for(let fixture=0;fixture<4;fixture++) {
      setMaterialMode(mode)
      const roots=[]
      if(fixture<3){
        const chosen=[],seen=new Set()
        for(const s of m.structures){if(!structureSets[fixture].includes(s.kind))continue;const key=s.kind+':'+(s.data?.detail??'');if(fixture===1&&seen.has(key))continue;seen.add(key);chosen.push(s);if(chosen.length>=12)break}
        for(const s of chosen){const root=buildStructure({...s,data:s.data&&{...s.data}},def,m,r.wallH);if(root)roots.push(root)}
      }else{
        const c=[...m.inf.chunks.values()].sort((a,b)=>Math.hypot(a.cx*32-m.inf.ox-e.player.x,a.cy*32-m.inf.oy-e.player.y)-Math.hypot(b.cx*32-m.inf.ox-e.player.x,b.cy*32-m.inf.oy-e.player.y))[0]
        const x=c.cx*32-m.inf.ox,y=c.cy*32-m.inf.oy
        for(let z=y;z<y+32;z+=4){const root=new THREE.Group();buildTerrain(m,def,r.wallH,root,{x0:x,y0:z,x1:x+32,y1:z+4,variant:c.variant});roots.push(root)}
      }
      assert(roots.length>0,`${mode}/${fixture}: actual world sources exist`)
      const expected=new THREE.Group(),actual=new THREE.Group();baseline(expected,roots)
      let steps=0,unpublished=true
      const job=batchL4StaticJob(actual,roots)
      try {
        while(!job.next().done){steps++;unpublished&&=actual.children.length===0;if(steps%16===0)await new Promise(requestAnimationFrame)}
        assert(unpublished&&steps>1,`${mode}/${fixture}: detached result publishes only when complete`)
        assert(expected.children.length===actual.children.length,`${mode}/${fixture}: output mesh count matches`)
        for(let i=0;i<actual.children.length;i++){
          const a=actual.children[i],b=expected.children[i]
          assert(a.material===b.material&&equalGeometry(a.geometry,b.geometry)&&a.castShadow===b.castShadow&&a.receiveShadow===b.receiveShadow&&a.renderOrder===b.renderOrder&&a.userData.noCastShadow===b.userData.noCastShadow,`${mode}/${fixture}/${i}: geometry, ordering and material match`)
        }
        const bounds=new THREE.Box3().setFromObject(expected),center=bounds.getCenter(new THREE.Vector3()),radius=Math.max(1,bounds.getSize(new THREE.Vector3()).length()*.5)
        scene.add(expected,actual);light.position.copy(center).add(new THREE.Vector3(radius,2*radius,radius));light.target.position.copy(center)
        Object.assign(light.shadow.camera,{left:-radius,right:radius,top:radius,bottom:-radius,near:.1,far:radius*6});light.shadow.camera.updateProjectionMatrix()
        for(let pose=0;pose<8;pose++)for(const shadows of [false,true]) {
          camera.position.copy(center).add(new THREE.Vector3(Math.sin(pose*.785)*radius*2.6,(pose%2?.8:1.8)*radius,Math.cos(pose*.785)*radius*2.6));camera.lookAt(center);three.shadowMap.enabled=shadows
          expected.visible=true;actual.visible=false;const before=draw()
          expected.visible=false;actual.visible=true;const after=draw()
          let maxDelta=0;for(let i=0;i<before.pixels.length;i++)maxDelta=Math.max(maxDelta,Math.abs(before.pixels[i]-after.pixels[i]))
          assert(maxDelta===0&&before.calls===after.calls,`${mode}/${fixture}/${pose}/${shadows}: rendered pixels and draw count match`)
          rows.push({mode,fixture,pose,shadows,steps,maxDelta,calls:after.calls})
        }
      }finally{
        job.return();expected.removeFromParent();actual.removeFromParent()
        const geometries=new Set();for(const root of [...roots,expected,actual])root.traverse(o=>{if(o.geometry)geometries.add(o.geometry)})
        for(const g of geometries)g.dispose();for(const root of roots)root.traverse(disposeL4Owned)
      }
    }
  }finally{setMaterialMode(oldMode);light.shadow.dispose();target.dispose();three.dispose();three.forceContextLoss()}
  return {passed:checks.length,comparisons:rows.length,checks,rows}
}
