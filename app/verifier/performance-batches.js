export async function verifyStaticBatches() {
  const {engine:e,renderer:r,look}=perfQA, rows=[]
  for(const id of [101,102,103,104,105,106,107,108,109,110,111,112,113,114,115,116,274]){
    await perfQA.measure(id,30)
    e.paused=true
    r.wallOcclusion.enabled=false
    r.render(r.three.domElement,e,{grain:false,flicker:.7,shake:false},0)
    const batches=r.levelGroup.children.filter(g=>g.name==='finite-static-details-batch')
    const structures=new Set(r.structMeshes.values())
    const generated=batches.flatMap(b=>b.children.filter(g=>!structures.has(g)))
    const originals=[...structures].filter(g=>g.parent===r.levelGroup&&g.userData.colliderProxy&&!g.visible)
    const gl=r.three.getContext(),width=gl.drawingBufferWidth,height=gl.drawingBufferHeight
    const before=new Uint8Array(width*height*4),after=new Uint8Array(before.length)
    for(let pose=0;pose<8;pose++){
      look.yaw=pose*Math.PI/4;look.pitch=pose>5?.2:0
      for(const b of generated)b.visible=true
      for(const g of originals)g.visible=false
      r.render(r.three.domElement,e,{grain:false,flicker:.7,shake:false},0)
      gl.readPixels(0,0,width,height,gl.RGBA,gl.UNSIGNED_BYTE,after)
      for(const b of generated)b.visible=false
      for(const g of originals)g.visible=true
      r.render(r.three.domElement,e,{grain:false,flicker:.7,shake:false},0)
      gl.readPixels(0,0,width,height,gl.RGBA,gl.UNSIGNED_BYTE,before)
      for(const b of generated)b.visible=true
      for(const g of originals)g.visible=false
      let changed=0,large=0,totalDelta=0,maxDelta=0
      for(let i=0;i<before.length;i++){
        const d=Math.abs(before[i]-after[i]);if(d)changed++;if(d>8)large++
        totalDelta+=d;maxDelta=Math.max(maxDelta,d)
      }
      const row={level:id,pose,batches:batches.length,originals:originals.length,changed,large,meanDelta:totalDelta/before.length,maxDelta}
      rows.push(row)
      if(row.meanDelta>.03||large/before.length>.0001)throw new Error(`Batch image mismatch ${JSON.stringify(row)}`)
      await new Promise(requestAnimationFrame)
    }
  }
  r.wallOcclusion.enabled=true
  return {passed:rows.length,rows}
}
