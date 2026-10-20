export async function verifyFlashlightTransition() {
  const {renderer:r,engine:e}=perfQA,checks=[]
  const assert=(ok,label)=>{if(!ok)throw new Error(label);checks.push(label)}
  const frame=()=>r.render(r.three.domElement,e,{grain:false,flicker:0,shake:false},1/60)
  r.setShadows(true)
  await perfQA.measure(0,5)
  e.player.equip.offhand={type:'flashlight'};e.player.flashlight=true;e.player.battery=100;e.player.flashJamT=0
  for(const id of [103,1]){
    e.loadLevel(id,{mapSeed:424242,firstVisit:false});e.paused=true;e.introT=0
    const start=performance.now()
    do {
      await new Promise(requestAnimationFrame);frame()
      assert(!r.vmFlash.visible,`L${id}: hidden during loading`)
      if(performance.now()-start>90_000)throw new Error('transition timed out')
    }while(!r.isNearWorldReady(e))
    const gl=r.three.getContext(),link=gl.linkProgram;let linked=0
    gl.linkProgram=function(...args){linked++;return link.apply(this,args)}
    try {
      e.paused=false;frame()
      assert(e.player.flashlight&&r.vmFlash.visible&&r.flash.intensity>0,`L${id}: carries an enabled flashlight across levels`)
      assert(linked===0,`L${id}: first visible frame uses prepared shaders`)
    }finally{gl.linkProgram=link}
  }
  return {passed:checks.length,checks}
}
