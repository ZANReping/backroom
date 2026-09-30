import { structColliders } from '/src/game/world/mapgen.ts'

export async function verifyL8Batches() {
  await perfQA.measure(8,30)
  const {engine:e,renderer:r,look}=perfQA,rows=[]
  e.paused=true
  const kinds=new Set(['stalagspike','cavebank','caveboulder'])
  const roots=[...r.structMeshes].filter(([s])=>kinds.has(s.kind))
  const batches=[]
  for(const {group} of r.chunkGroups.values())group.traverse(o=>{if(o.name==='l8-static-rock-batch')batches.push(o)})
  if(!batches.length||!roots.length)throw new Error('No L8 rock batches to verify')
  if(roots.some(([,g])=>g.visible||!g.userData.colliderProxy)||batches.some(b=>!b.userData.noCollision))throw new Error('Rock collision proxies were not preserved')
  const collisions=roots.map(([s])=>JSON.stringify(structColliders(s,e.map)))
  const gl=r.three.getContext(),width=gl.drawingBufferWidth,height=gl.drawingBufferHeight
  const before=new Uint8Array(width*height*4),after=new Uint8Array(before.length)
  try {
    for(let pose=0;pose<24;pose++){
      look.yaw=pose*Math.PI/12;look.pitch=pose>=16?.35:pose>=8?-.35:0
      r.render(r.three.domElement,e,{grain:false,flicker:0,shake:false},0)
      r.three.info.reset();r.three.render(r.scene,r.camera)
      const drawsAfter=r.three.info.render.calls
      gl.readPixels(0,0,width,height,gl.RGBA,gl.UNSIGNED_BYTE,after)
      for(const b of batches)b.visible=false
      for(const [,g] of roots)g.visible=true
      r.three.info.reset();r.three.render(r.scene,r.camera)
      const drawsBefore=r.three.info.render.calls
      gl.readPixels(0,0,width,height,gl.RGBA,gl.UNSIGNED_BYTE,before)
      for(const b of batches)b.visible=true
      for(const [,g] of roots)g.visible=false
      let changed=0,large=0,totalDelta=0,maxDelta=0
      for(let i=0;i<before.length;i++){
        const d=Math.abs(before[i]-after[i]);if(d)changed++;if(d>8)large++
        totalDelta+=d;maxDelta=Math.max(maxDelta,d)
      }
      const row={pose,drawsBefore,drawsAfter,changed,large,meanDelta:totalDelta/before.length,maxDelta}
      rows.push(row)
      if(row.meanDelta>.03||large/before.length>.0001)throw new Error(`L8 rock batch image mismatch ${JSON.stringify(row)}`)
      await new Promise(requestAnimationFrame)
    }
    if(roots.some(([s],i)=>JSON.stringify(structColliders(s,e.map))!==collisions[i]))throw new Error('Rock collider bounds changed')
  } finally {
    for(const b of batches)b.visible=true
    for(const [,g] of roots)g.visible=false
  }
  return {passed:rows.length+2,batches:batches.length,proxies:roots.length,rows}
}
