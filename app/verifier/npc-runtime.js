import { setNpcBatchesEnabled } from '/src/game/renderer/npcBatches.ts'

export async function verifyNpcRuntime() {
  const {engine:e,renderer:r,look}=perfQA,checks=[],rows=[]
  const assert=(ok,label)=>{if(!ok)throw new Error(label);checks.push(label)}
  const roots=()=>[...r.npcMeshes.values()].map(rec=>{
    let model;rec.grp.traverse(o=>{if(o.userData.parts)model=o});return model
  }).filter(Boolean)
  try {
    for(const mode of ['classic','realistic'])for(const id of [101,104,105,106]){
      r.setLightMode(mode);await perfQA.measure(id,10);e.paused=true
      if(id===105){
        for(const rec of r.npcMeshes.values())r.disposeNpc(rec)
        r.npcMeshes.clear()
        const nearby=e.npcs.filter(n=>Math.hypot(n.x-e.player.x,n.y-e.player.y)<=24)
        assert(nearby.length>1,`${mode}: multiple nearby NPCs exercise the loading queue`)
        assert(!r.isNearWorldReady(e),`${mode}: nearby NPC loading gates entry`)
        const nearest=[...nearby].sort((a,b)=>Math.hypot(a.x-e.player.x,a.y-e.player.y)-Math.hypot(b.x-e.player.x,b.y-e.player.y))[0]
        for(let i=0;i<nearby.length;i++){
          const before=r.npcMeshes.size;r.updateNpcs(e,0)
          assert(r.npcMeshes.size===before+1,`${mode}: frame ${i} constructs exactly one NPC`)
          if(i===0)assert(r.npcMeshes.has(nearest.id),`${mode}: nearest NPC loads first`)
        }
        assert(r.isNearWorldReady(e),`${mode}: entry resumes once nearby NPCs exist`)
      }
      const models=roots(),gl=r.three.getContext(),w=gl.drawingBufferWidth,h=gl.drawingBufferHeight
      assert(models.length>0,`${mode} L${id}: NPC models exist`)
      assert(models.every(model=>model.getObjectByName('npc-rigid-color-batch')),`${mode} L${id}: runtime uses NPC batches`)
      const before=new Uint8Array(w*h*4),after=new Uint8Array(before.length)
      for(let pose=0;pose<8;pose++){
        look.yaw=pose*Math.PI/4;e.joeyPlaying=pose>=4
        for(const npc of e.npcs){npc.tx=npc.x+(pose%2);npc.ty=npc.y; npc.hostile=pose===6;npc.dead=pose===7;npc.deathT=.8}
        r.render(r.three.domElement,e,{grain:false,flicker:0,shake:false},.05)
        const now=Date.now,time=now();Date.now=()=>time
        try {
          for(const model of models)setNpcBatchesEnabled(model,true)
          r.three.render(r.scene,r.camera);gl.readPixels(0,0,w,h,gl.RGBA,gl.UNSIGNED_BYTE,after)
          for(const model of models)setNpcBatchesEnabled(model,false)
          r.three.render(r.scene,r.camera);gl.readPixels(0,0,w,h,gl.RGBA,gl.UNSIGNED_BYTE,before)
          let large=0,total=0,maxDelta=0
          for(let i=0;i<before.length;i++){const d=Math.abs(before[i]-after[i]);total+=d;maxDelta=Math.max(maxDelta,d);if(d>8)large++}
          const row={mode,level:id,pose,models:models.length,meanDelta:total/before.length,maxDelta,large};rows.push(row)
          assert(row.meanDelta<=.03&&large/before.length<=.0001,`runtime NPC pose: ${JSON.stringify(row)}`)
        } finally {Date.now=now;for(const model of models)setNpcBatchesEnabled(model,true)}
      }
    }
  } finally {r.setLightMode('classic')}
  return {passed:checks.length,checks,rows}
}
