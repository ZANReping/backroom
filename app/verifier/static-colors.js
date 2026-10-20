export async function verifyStaticColors() {
  const {engine:e,renderer:r,look}=perfQA, rows=[]
  try {
    for(const mode of ['classic','realistic']) {
      r.setLightMode(mode)
      for(const level of [4,5,105,106]) {
        await perfQA.measure(level,5)
        e.paused=true;r.wallOcclusion.enabled=false
        e.player.flashlight=true;e.player.battery=100;e.player.flashJamT=0
        const owners=r.levelGroup?[r.levelGroup]:[...r.chunkGroups.values()].map(c=>c.group)
        const structures=new Set(r.structMeshes.values()), generated=[],sources=[]
        for(const owner of owners) {
          for(const group of owner.children) if(['finite-static-details-batch','l4-static-details-batch','l3-static-equipment-batch'].includes(group.name))
            for(const object of group.children)if(!structures.has(object))generated.push(object)
          for(const root of structures)if(root.parent===owner&&!root.visible)sources.push(root)
        }
        if(!generated.length||!sources.length)throw new Error(`Missing static comparison L${level}`)
        const gl=r.three.getContext(),width=gl.drawingBufferWidth,height=gl.drawingBufferHeight
        const before=new Uint8Array(width*height*4),after=new Uint8Array(before.length)
        for(const shadows of [false,true]) {
          r.setShadows(shadows)
          for(let pose=0;pose<12;pose++) {
            look.yaw=pose*Math.PI/6;look.pitch=pose>=8?.2:0
            r.render(r.three.domElement,e,{grain:false,flicker:0,shake:false},0)
            const now=Date.now,fixedTime=now()
            Date.now=()=>fixedTime
            try {
              r.three.shadowMap.needsUpdate=true;r.three.info.reset();r.three.render(r.scene,r.camera)
              const callsAfter=r.three.info.render.calls
              gl.readPixels(0,0,width,height,gl.RGBA,gl.UNSIGNED_BYTE,after)
              for(const object of generated)object.visible=false
              for(const object of sources)object.visible=true
              r.three.shadowMap.needsUpdate=true;r.three.info.reset();r.three.render(r.scene,r.camera)
              const callsBefore=r.three.info.render.calls
              gl.readPixels(0,0,width,height,gl.RGBA,gl.UNSIGNED_BYTE,before)
              let changed=0,large=0,total=0,maxDelta=0
              for(let i=0;i<before.length;i++){const d=Math.abs(before[i]-after[i]);if(d)changed++;if(d>8)large++;total+=d;maxDelta=Math.max(maxDelta,d)}
              const row={mode,level,shadows,pose,callsBefore,callsAfter,changed,large,maxDelta,meanDelta:total/before.length}
              rows.push(row)
              if(row.meanDelta>.03||large/before.length>.0001)throw new Error(`Static color image mismatch ${JSON.stringify(row)}`)
            } finally {
              Date.now=now
              for(const object of generated)object.visible=true
              for(const object of sources)object.visible=false
              r.three.shadowMap.needsUpdate=true
            }
            await new Promise(requestAnimationFrame)
          }
        }
      }
    }
  } finally {r.setShadows(false);r.setLightMode('classic');r.wallOcclusion.enabled=true}
  return {passed:rows.length,rows}
}
