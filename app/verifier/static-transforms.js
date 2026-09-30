// Compare the normal render path against a forced full matrix refresh, on the
// same scene and animation pose. This also covers hidden interaction proxies.
export async function verifyStaticTransforms() {
  const {engine:e,renderer:r,look}=perfQA,rows=[]
  let matrixChecks=0,pixelChecks=0
  const verify=label=>{
    const now=Date.now,time=now()
    Date.now=()=>time // Procedural dust reads wall time in onBeforeRender.
    try {
    const saved=[]
    r.scene.traverse(node=>saved.push([node,node.matrixWorld.clone()]))
    const gl=r.three.getContext(),w=gl.drawingBufferWidth,h=gl.drawingBufferHeight
    const before=new Uint8Array(w*h*4),after=new Uint8Array(before.length)
    r.three.render(r.scene,r.camera)
    gl.readPixels(0,0,w,h,gl.RGBA,gl.UNSIGNED_BYTE,before)
    r.scene.updateMatrixWorld(true)
    for(const [node,matrix] of saved){
      if(!matrix.equals(node.matrixWorld))throw new Error(`${label}: stale matrix ${node.name||node.type} #${node.id}`)
      matrixChecks++
    }
    r.three.render(r.scene,r.camera)
    gl.readPixels(0,0,w,h,gl.RGBA,gl.UNSIGNED_BYTE,after)
    let differences=0,maxDelta=0,total=0
    for(let i=0;i<before.length;i++){const delta=Math.abs(before[i]-after[i]);if(delta)differences++;maxDelta=Math.max(maxDelta,delta);total+=delta}
    // A few edge channels occasionally round by one byte even with identical
    // matrices. Reject any larger change; retain the measured raster delta.
    const meanDelta=total/before.length
    if(maxDelta>1||meanDelta>.0001)throw new Error(`${label}: ${JSON.stringify({differences,maxDelta,meanDelta})}`)
    pixelChecks++;rows.push({label,nodes:saved.length,differences,maxDelta,meanDelta})
    } finally {Date.now=now}
  }
  for(const id of [0,1,4,5,8,9,10,11,105,106]){
    await perfQA.measure(id,5)
    e.paused=true
    for(const [open,steps] of [[0,1],[1,1],[1,10],[1,60],[0,1],[0,60]]){
      for(const [s] of r.animatedStructMeshes){s.data??={};s.data.open=open;s.data.opened=open}
      for(let n=0;n<steps;n++)r.updateStructs(.05)
      look.yaw+=.7
      r.render(r.three.domElement,e,{grain:false,flicker:0,shake:false},0)
      verify(`L${id} open=${open} steps=${steps}`)
    }
    if(e.map.inf)for(const dx of [32,32,-32,-32]){
      e.player.x+=dx;e.updateInfiniteWindow()
      // Inspect the first rebased frame as well as the fully loaded scene.
      r.render(r.three.domElement,e,{grain:false,flicker:0,shake:false},0)
      verify(`L${id} rebase ${dx} immediate`)
      const start=performance.now();let quiet=0
      while(quiet<3){
        await new Promise(requestAnimationFrame)
        r.render(r.three.domElement,e,{grain:false,flicker:0,shake:false},0)
        quiet=r.isNearWorldReady(e)&&!r.cityChunkTask?quiet+1:0
        if(performance.now()-start>60000)throw new Error(`L${id} rebase readiness timeout`)
      }
      verify(`L${id} rebase ${dx} ready`)
    }
  }
  return {passed:pixelChecks,matrixChecks,rows}
}
