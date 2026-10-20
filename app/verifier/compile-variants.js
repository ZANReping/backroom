import * as THREE from 'three'
import { compileSceneJob, afterSceneCompile, afterRendererCompile } from '/src/game/renderer/sceneWarmup.ts'

// A driver may finish one variant before another. Hold the first actual GL
// program pending so this race is repeatable even with a warm driver cache.
export async function probeCompileVariants(compile=compileSceneJob,verify=false) {
  const rows=[]
  for(const mode of ['classic','realistic'])for(const kind of ['double-sided','shared-instances']) {
    const checks=[],assert=(ok,label)=>{if(!ok)throw new Error(`${mode}/${kind}: ${label}`);checks.push(label)}
    const renderer=new THREE.WebGLRenderer({antialias:false})
    const scene=new THREE.Scene(),root=new THREE.Group(),camera=new THREE.PerspectiveCamera(60,1,.1,100)
    const target=new THREE.WebGLRenderTarget(96,96)
    renderer.setRenderTarget(target);scene.background=new THREE.Color('#515867');scene.fog=new THREE.Fog('#515867',8,30)
    const geometry=new THREE.BoxGeometry(),Material=mode==='classic'?THREE.MeshLambertMaterial:THREE.MeshStandardMaterial,material=new Material({
      transparent:kind==='double-sided',opacity:.6,side:kind==='double-sided'?THREE.DoubleSide:THREE.FrontSide,
    })
    const mesh=new THREE.Mesh(geometry,material);mesh.position.x=-.7;root.add(mesh)
    const instances=kind==='shared-instances'?new THREE.InstancedMesh(geometry,material,1):null
    if(instances){instances.setMatrixAt(0,new THREE.Matrix4().makeTranslation(.7,0,0));root.add(instances)}
    const light=new THREE.DirectionalLight('#ffe0b0',2);light.position.set(2,4,3)
    scene.add(light,new THREE.AmbientLight(0xffffff,.6))
    root.updateWorldMatrix(true,true)
    const children=[...root.children],snapshots=children.map(o=>({o,parent:o.parent,matrix:o.matrixWorld.toArray(),material:o.material}))
    const unchanged=()=>root.parent===null&&root.children.every((o,i)=>o===children[i])&&snapshots.every(s=>s.o.parent===s.parent&&s.o.material===s.material&&s.o.matrixWorld.toArray().every((v,i)=>v===s.matrix[i]))
    const gl=renderer.getContext(),ext=gl.getExtension('KHR_parallel_shader_compile')
    if(!ext)throw new Error('This race probe requires KHR_parallel_shader_compile')
    const link=gl.linkProgram,get=gl.getProgramParameter,programs=[],polls=new Map()
    let held=true
    gl.linkProgram=function(program){programs.push(program);return link.call(this,program)}
    gl.getProgramParameter=function(program,name){
      if(name===ext.COMPLETION_STATUS_KHR){polls.set(program,(polls.get(program)??0)+1);if(held&&program===programs[0])return false}
      return get.call(this,program,name)
    }
    const job=compile(renderer,root,camera,scene)
    try {
      let done=false,steps=0
      const start=performance.now()
      while(!done&&performance.now()-start<100){done=job.next().done;steps++;await new Promise(resolve=>setTimeout(resolve,5))}
      const row={mode,kind,programs:programs.length,doneWhileFirstProgramPending:done,firstProgramPolls:polls.get(programs[0])??0,steps,checks,images:[]}
      rows.push(row)
      if(verify){assert(programs.length===2,'fixture compiles two real program variants');assert(!done,'scene remains pending while the first variant is unfinished');assert(unchanged(),'preparation leaves materials and hierarchy unchanged')}
      held=false
      const finish=performance.now()
      while(!job.next().done){if(performance.now()-finish>5000)throw new Error('Compiler did not finish');await new Promise(resolve=>setTimeout(resolve,5))}
      if(verify){
        assert(programs.every(p=>get.call(gl,p,ext.COMPLETION_STATUS_KHR)),'all variants really complete before first draw')
        assert(unchanged(),'completion does not reparent or replace source objects')
        scene.add(root)
        const draw=()=>{renderer.render(scene,camera);const bytes=new Uint8Array(96*96*4);renderer.readRenderTargetPixels(target,0,0,96,96,bytes);return bytes}
        camera.position.set(3,2,4);camera.lookAt(0,0,0)
        const before=programs.length;draw();assert(programs.length===before,'first draw uses prepared versions')
        for(let pose=0;pose<6;pose++){
          camera.position.set(Math.sin(pose*1.1)*4,pose%2?-1.5:2,Math.cos(pose*1.1)*4);camera.lookAt(0,0,0)
          const warmed=draw();material.dispose();const cold=draw()
          let delta=0;for(let i=0;i<cold.length;i++)delta=Math.max(delta,Math.abs(cold[i]-warmed[i]))
          assert(delta===0,`view ${pose} preserves exact pixels`);row.images.push({pose,maxDelta:delta})
        }
        assert(gl.getError()===gl.NO_ERROR,'no WebGL errors')
      }
    } finally {
      held=false;job.return();gl.linkProgram=link;gl.getProgramParameter=get
      geometry.dispose();material.dispose();instances?.dispose();target.dispose();renderer.dispose();renderer.forceContextLoss()
    }
  }
  return rows
}

export async function verifyCompileVariants() {
  const baseline=await import('/.check/sceneWarmup-variant-baseline.ts')
  const before=await probeCompileVariants(baseline.compileSceneJob)
  if(!before.every(row=>row.doneWhileFirstProgramPending&&row.firstProgramPolls===0))throw new Error('Baseline no longer reproduces missed variant')
  const rows=await probeCompileVariants(compileSceneJob,true),checks=[]
  const assert=(ok,label)=>{if(!ok)throw new Error(label);checks.push(label)}
  const renderer=new THREE.WebGLRenderer(),scene=new THREE.Scene(),root=new THREE.Group(),camera=new THREE.PerspectiveCamera()
  const geometry=new THREE.BoxGeometry(),material=new THREE.MeshLambertMaterial({side:THREE.DoubleSide,transparent:true})
  root.add(new THREE.Mesh(geometry,material))
  const gl=renderer.getContext(),ext=gl.getExtension('KHR_parallel_shader_compile'),get=gl.getProgramParameter
  let hold=true,disposed=0,rendererReleased=0
  material.addEventListener('dispose',()=>disposed++)
  gl.getProgramParameter=function(program,name){if(hold&&name===ext.COMPLETION_STATUS_KHR&&program===renderer.info.programs[0]?.program)return false;return get.call(this,program,name)}
  const job=compileSceneJob(renderer,root,camera,scene)
  try {
    job.next();job.next();await new Promise(resolve=>setTimeout(resolve,50));job.return()
    afterSceneCompile(root,()=>material.dispose());afterRendererCompile(renderer,()=>rendererReleased++)
    await new Promise(resolve=>setTimeout(resolve,30))
    assert(disposed===0&&rendererReleased===0,'cancelling a root retains resources used by an unfinished non-current variant')
    hold=false
    const start=performance.now()
    while(!disposed||!rendererReleased){if(performance.now()-start>5000)throw new Error('Cancellation completion timed out');await new Promise(resolve=>setTimeout(resolve,10))}
    assert(disposed===1&&rendererReleased===1,'root and renderer release once after every version completes')
    assert(root.parent===null,'compiler completion never publishes a cancelled root')
    assert(gl.getError()===gl.NO_ERROR,'cancelled compilation has no WebGL error')
  } finally {hold=false;gl.getProgramParameter=get;geometry.dispose();renderer.dispose();renderer.forceContextLoss()}
  return {passed:before.length+rows.reduce((n,row)=>n+row.checks.length,0)+checks.length,comparisons:rows.reduce((n,row)=>n+row.images.length,0),before,rows,checks}
}
