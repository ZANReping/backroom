export async function verifyLoadingCancellation() {
  const {engine:e,renderer:r}=perfQA,checks=[]
  const assert=(ok,label)=>{if(!ok)throw new Error(label);checks.push(label)}
  await perfQA.measure(105,5)
  const compile=r.three.compileAsync
  let release,submitted=0
  const gate=new Promise(resolve=>release=resolve)
  r.three.compileAsync=function(...args){
    let ownsL1=false
    args[0]?.traverse?.(object=>{const materials=Array.isArray(object.material)?object.material:object.material?[object.material]:[];if(materials.some(mat=>mat?.userData?.l1Owned))ownsL1=true})
    if(!ownsL1)return compile.apply(this,args)
    submitted++;return compile.apply(this,args).then(()=>gate)
  }
  let pending,disposed=0,owned
  try {
    e.loadLevel(101,{mapSeed:424242,firstVisit:false});e.paused=true
    const started=performance.now()
    while(!submitted){
      await new Promise(requestAnimationFrame)
      r.render(r.three.domElement,e,{grain:false,flicker:0,shake:false},1/60)
      if(performance.now()-started>30_000)throw new Error('precompile not reached')
    }
    pending=r.finitePendingRoot
    assert(!!pending&&!!r.finiteTask,'finite scene is pending during async compilation')
    owned=new Set()
    pending.traverse(o=>{for(const mat of Array.isArray(o.material)?o.material:o.material?[o.material]:[])if(mat.userData.l1Owned)owned.add(mat)})
    assert(owned.size>0,'pending scene has owned GPU materials')
    for(const mat of owned)mat.addEventListener('dispose',()=>disposed++)
    e.loadLevel(106,{mapSeed:424242,firstVisit:false})
    r.render(r.three.domElement,e,{grain:false,flicker:0,shake:false},1/60)
    assert(r.finitePendingRoot!==pending,'new level replaces the cancelled pending root')
    assert(pending.parent===null,'cancelled scene never becomes visible')
    assert(disposed===0,'materials stay alive while compiler completion is pending')
    r.three.compileAsync=compile;release()
    const waited=performance.now()
    while(disposed<owned.size){
      await new Promise(requestAnimationFrame)
      if(performance.now()-waited>10_000)throw new Error('cancelled materials not released')
    }
    assert(disposed===owned.size,'owned materials release exactly once after compilation')
    await perfQA.measure(106,5)
    assert(r.isNearWorldReady(e),'next level still reaches readiness')
    assert(pending.parent===null,'compiler completion cannot publish a cancelled scene')
  } finally {r.three.compileAsync=compile;release()}
  return {passed:checks.length,checks,materials:owned?.size??0}
}
