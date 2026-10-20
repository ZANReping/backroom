import * as THREE from 'three'
import { batchStaticRootsJob } from '/src/game/renderer/staticBatch.ts'
import { batchL9StaticRoots as baseline } from '/.check/staticBatch-baseline.ts'
import { buildStructure } from '/src/game/renderer/structures.ts'
import { buildTerrain } from '/src/game/renderer/geometry.ts'
import { getMaterialMode, setMaterialMode, WALL_H } from '/src/game/renderer/shared.ts'

export async function verifyStaticBatchJob() {
  const {engine:e}=perfQA,oldMode=getMaterialMode(),checks=[],rows=[],assert=(ok,label)=>{if(!ok)throw new Error(label);checks.push(label)}
  const three=new THREE.WebGLRenderer({antialias:false}),scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(45,1,.01,1000),target=new THREE.WebGLRenderTarget(192,192)
  three.setRenderTarget(target);three.shadowMap.type=THREE.PCFSoftShadowMap
  scene.background=new THREE.Color('#8c919c');scene.fog=new THREE.Fog('#8c919c',70,300)
  scene.add(new THREE.AmbientLight('#dce7ff',.9));const sun=new THREE.DirectionalLight('#fff0d2',2.5);sun.castShadow=true;sun.shadow.mapSize.set(256,256);scene.add(sun,sun.target)
  const equalArray=(a,b)=>a?.constructor===b?.constructor&&a?.length===b?.length&&a.every((n,i)=>Object.is(n,b[i]))
  const equalGeometry=(a,b)=>!!a.index===!!b.index&&(!a.index||equalArray(a.index.array,b.index.array))&&JSON.stringify(a.groups)===JSON.stringify(b.groups)&&JSON.stringify(a.drawRange)===JSON.stringify(b.drawRange)&&Object.keys(a.attributes).join()===Object.keys(b.attributes).join()&&Object.entries(a.attributes).every(([k,v])=>v.itemSize===b.attributes[k].itemSize&&v.normalized===b.attributes[k].normalized&&equalArray(v.array,b.attributes[k].array))
  const equalMaterials=(a,b)=>Array.isArray(a)?Array.isArray(b)&&a.length===b.length&&a.every((m,i)=>m===b[i]):a===b
  const equalObject=(a,b)=>a.type===b.type&&a.visible===b.visible&&a.renderOrder===b.renderOrder&&a.castShadow===b.castShadow&&a.receiveShadow===b.receiveShadow&&JSON.stringify(a.userData)===JSON.stringify(b.userData)&&(!a.isMesh||equalMaterials(a.material,b.material)&&equalGeometry(a.geometry,b.geometry))&&(!a.isInstancedMesh||equalArray(a.instanceMatrix.array,b.instanceMatrix.array))&&a.children.length===b.children.length&&a.children.every((child,i)=>equalObject(child,b.children[i]))
  const draw=()=>{three.info.reset();three.shadowMap.needsUpdate=true;three.render(scene,camera);const pixels=new Uint8Array(192*192*4);three.readRenderTargetPixels(target,0,0,192,192,pixels);return {pixels,calls:three.info.render.calls}}
  const copyHooks=(source,copy)=>{for(const key of ['onBeforeRender','onAfterRender','onBeforeShadow','onAfterShadow'])copy[key]=source[key];source.children.forEach((child,i)=>copyHooks(child,copy.children[i]))}
  try {
    for(const mode of ['classic','realistic'])for(const level of [3,5,8,9,10,11,105,106]){
      setMaterialMode(mode);e.loadLevel(level,{mapSeed:424242,firstVisit:false});e.paused=true
      const m=e.map,def=e.levelDef,H=WALL_H[def.gen]??3
      for(const kind of ['terrain','structures']){
        const roots=[]
        if(kind==='terrain'){
          const x=Math.floor(e.player.x/32)*32,y=Math.floor(e.player.y/32)*32
          for(let row=0;row<8;row+=4){const root=new THREE.Group();buildTerrain(m,def,H,root,{x0:x,y0:y+row,x1:Math.min(m.w,x+32),y1:Math.min(m.h,y+row+4),variant:m.inf?[...m.inf.chunks.values()][0]?.variant:undefined});roots.push(root)}
        }else{
          const seen=new Set()
          for(const s of m.structures){
            const key=s.kind+':'+(s.data?.style??'');if(seen.has(key))continue;seen.add(key)
            const root=buildStructure({...s,data:s.data&&{...s.data}},def,m,H)
            if(root){root.position.x=roots.length%4*8;root.position.z=Math.floor(roots.length/4)*8;roots.push(root)}
            if(roots.length>=20)break
          }
        }
        assert(roots.length>0,`${mode}/${level}/${kind}: representative world sources exist`)
        const referenceRoots=roots.map(root=>{const copy=root.clone(true);copyHooks(root,copy);return copy}),before=new THREE.Group(),after=new THREE.Group()
        baseline(before,referenceRoots);const job=batchStaticRootsJob(after,roots);let steps=0
        try{
          while(!job.next().done){assert(after.children.length===0,`${mode}/${level}/${kind}/${steps}: no partial output`);if(++steps%32===0)await new Promise(requestAnimationFrame)}
          assert(equalObject(before,after),`${mode}/${level}/${kind}: output hierarchy, buffers, instance matrices and material identity match`)
          assert(after.children.length>0,`${mode}/${level}/${kind}: batch contains renderable content`)
          for(const root of [before,after])root.traverse(o=>{if(o.isMesh){o.castShadow=!o.userData.noCastShadow;o.receiveShadow=true}})
          scene.add(before,after)
          const bounds=new THREE.Box3().setFromObject(before),center=bounds.getCenter(new THREE.Vector3()),radius=Math.max(1,bounds.getSize(new THREE.Vector3()).length()*.5)
          sun.position.copy(center).add(new THREE.Vector3(radius,radius*2,radius));sun.target.position.copy(center)
          Object.assign(sun.shadow.camera,{left:-radius,right:radius,top:radius,bottom:-radius,near:.01,far:radius*6});sun.shadow.camera.updateProjectionMatrix()
          for(let pose=0;pose<6;pose++)for(const shadows of [false,true]){
            camera.position.copy(center).add(new THREE.Vector3(Math.sin(pose*Math.PI/3)*radius*2.6,radius*(pose%2?.4:1.3),Math.cos(pose*Math.PI/3)*radius*2.6));camera.lookAt(center);three.shadowMap.enabled=shadows
            const now=Date.now,fixed=now();let original,sliced
            try{
              Date.now=()=>fixed
              before.visible=true;after.visible=false;original=draw()
              before.visible=false;after.visible=true;sliced=draw()
            }finally{Date.now=now}
            let maxDelta=0;for(let i=0;i<original.pixels.length;i++)maxDelta=Math.max(maxDelta,Math.abs(original.pixels[i]-sliced.pixels[i]))
            assert(maxDelta===0&&original.calls===sliced.calls,`${mode}/${level}/${kind}/${pose}/${shadows}: pixels and draws match (delta ${maxDelta}, calls ${original.calls}/${sliced.calls})`)
            rows.push({mode,level,kind,pose,shadows,steps,maxDelta,calls:sliced.calls})
          }
        }finally{
          job.return();before.removeFromParent();after.removeFromParent()
          const geometries=new Set(),instances=new Set()
          for(const root of [before,after,...roots,...referenceRoots])root.traverse(o=>{if(o.geometry)geometries.add(o.geometry);if(o.isInstancedMesh)instances.add(o)})
          for(const mesh of instances)mesh.dispose();for(const g of geometries)g.dispose()
        }
      }
      await new Promise(requestAnimationFrame)
    }
    assert(three.getContext().getError()===three.getContext().NO_ERROR,'no WebGL errors')
  }finally{setMaterialMode(oldMode);sun.shadow.dispose();target.dispose();three.dispose();three.forceContextLoss()}
  return {passed:checks.length,comparisons:rows.length,checks,rows}
}
