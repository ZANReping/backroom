import { structColliders } from '/src/game/world/mapgen.ts'

export async function verifyMovingInstances(lightMode='classic') {
  perfQA.renderer.setLightMode(lightMode)
  await perfQA.measure(105,30)
  const {engine:e,renderer:r,look}=perfQA,rows=[],checks=[]
  e.paused=true;r.wallOcclusion.enabled=false
  r.render(r.three.domElement,e,{grain:false,flicker:0,shake:false},0)
  const shelves=[...r.animatedStructMeshes].filter(([s,g])=>s.kind==='binshelf'&&g.getObjectByName('moving-part-instances'))
  if(!shelves.length)throw new Error('No instanced shelves available')
  const groups=shelves.map(([,g])=>g.getObjectByName('moving-part-instances'))
  const sources=[]
  for(const [,g] of shelves)g.traverse(o=>{
    if(!o.isMesh||o.visible||!o.userData.colliderProxy)return
    for(let parent=o;parent&&parent!==g;parent=parent.parent)if(parent.userData.lid){sources.push(o);break}
  })
  const gl=r.three.getContext(),width=gl.drawingBufferWidth,height=gl.drawingBufferHeight
  const before=new Uint8Array(width*height*4),after=new Uint8Array(before.length)
  const assert=(condition,label)=>{if(!condition)throw new Error(label);checks.push(label)}
  let closedCollisions
  try {
    for(const [open,steps] of [[0,60],[1,1],[1,3],[1,60],[0,1],[0,3],[0,60]]){
      for(const [s] of shelves){s.data??={};s.data.opened=open}
      for(let n=0;n<steps;n++)r.updateStructs(.05)
      const collisions=shelves.map(([s])=>JSON.stringify(structColliders(s,e.map)))
      if(open===0&&steps===60){if(closedCollisions)assert(collisions.every((b,i)=>b===closedCollisions[i]),'closed shelf colliders return exactly');else closedCollisions=collisions}
      for(let pose=0;pose<8;pose++){
        look.yaw=pose*Math.PI/4;look.pitch=pose>=6?.2:0
        r.render(r.three.domElement,e,{grain:false,flicker:0,shake:false},0)
        r.three.info.reset();r.three.render(r.scene,r.camera)
        const drawsAfter=r.three.info.render.calls
        gl.readPixels(0,0,width,height,gl.RGBA,gl.UNSIGNED_BYTE,after)
        for(const group of groups)group.visible=false
        for(const source of sources)source.visible=true
        r.three.info.reset();r.three.render(r.scene,r.camera)
        const drawsBefore=r.three.info.render.calls
        gl.readPixels(0,0,width,height,gl.RGBA,gl.UNSIGNED_BYTE,before)
        for(const group of groups)group.visible=true
        for(const source of sources)source.visible=false
        let large=0,totalDelta=0,maxDelta=0
        for(let i=0;i<before.length;i++){const d=Math.abs(before[i]-after[i]);if(d>8)large++;totalDelta+=d;maxDelta=Math.max(maxDelta,d)}
        const row={open,steps,pose,drawsBefore,drawsAfter,large,meanDelta:totalDelta/before.length,maxDelta};rows.push(row)
        assert(row.meanDelta<=.03&&large/before.length<=.0001,`shelf pose ${rows.length} matches original geometry: ${JSON.stringify(row)}`)
      }
    }
    assert(rows.some(row=>row.drawsBefore>row.drawsAfter+10),'visible shelves use fewer draw submissions')
    const versions=groups.flatMap(g=>g.children.map(m=>m.instanceMatrix.version))
    for(let n=0;n<20;n++)r.updateStructs(1/60)
    assert(groups.flatMap(g=>g.children.map(m=>m.instanceMatrix.version)).every((v,i)=>v===versions[i]),'idle shelf instances do not upload matrices')
  } finally {
    for(const group of groups)group.visible=true
    for(const source of sources)source.visible=false
    r.wallOcclusion.enabled=true
    r.setLightMode('classic')
  }
  return {lightMode,passed:checks.length,shelves:shelves.length,sources:sources.length,rows}
}
