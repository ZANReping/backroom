// Run in /verifier/performance.html. This harness uses isolated, non-persistent saves.
export async function verifyFlashlight({levels=[0,2,9],shadows=true}={}) {
  const {renderer:r,engine:e}=perfQA, checks=[], rows=[], players=[]
  const assert=(ok,label)=>{if(!ok)throw new Error(label);checks.push(label)}
  const gl=r.three.getContext(), originals={}, oldShadows=r.flashShadowsOn, oldPaused=e.paused
  let current=null
  for(const name of ['compileShader','linkProgram','bufferData','texImage2D']) {
    originals[name]=gl[name]
    gl[name]=function(...args){if(current)current.gl[name]=(current.gl[name]??0)+1;return originals[name].apply(this,args)}
  }
  const updateShadow=r.flash.shadow.updateMatrices
  r.flash.shadow.updateMatrices=function(...args){if(current)current.shadowUpdates++;return updateShadow.apply(this,args)}
  const frame=async(on,paused=false)=>{
    e.player.flashlight=on;e.paused=paused;await new Promise(requestAnimationFrame)
    const row={level:e.player.level,on,paused,gl:{},shadowUpdates:0}, started=performance.now()
    current=row
    try {r.three.info.reset();r.render(r.three.domElement,e,{grain:false,flicker:0,shake:false},0)}
    finally {current=null}
    Object.assign(row,{cpu:performance.now()-started,intensity:r.flash.intensity,cast:r.flash.castShadow,
      visible:r.vmFlash.visible,calls:r.three.info.render.calls,programs:r.three.info.programs.length})
    rows.push(row);return row
  }
  try {
    r.setShadows(shadows)
    for(const id of [...new Set([...levels,6])]) {
      await perfQA.measure(id,5)
      // newRun replaces the player object; obtain the current one after loading.
      const p=e.player
      players.push({p,offhand:p.equip.offhand,flashlight:p.flashlight,battery:p.battery,flashJamT:p.flashJamT})
      p.equip.offhand={type:'flashlight'};p.battery=100;p.flashJamT=0
      assert(r.isNearWorldReady(e)&&!r.flashWarmup&&!!r.flashWarmupKey,`L${id}: hand model ready before gameplay`)
      const group=[]
      for(const on of [false,true,false,true])group.push(await frame(on))
      assert(group.every(x=>x.cast===shadows),`L${id}: shadow shader slot stays fixed`)
      assert(group.every(x=>!x.gl.compileShader&&!x.gl.linkProgram),`L${id}: switches submit no new shader programs (${JSON.stringify(group)})`)
      assert(group.every(x=>x.programs===group[0].programs),`L${id}: program count stays fixed`)
      assert(group.filter(x=>!x.on).every(x=>x.intensity===0&&!x.visible&&x.shadowUpdates===0),`L${id}: off hides model and skips shadow draws`)
      assert(group.filter(x=>x.on).every(x=>x.visible&&(r.levelCfg.noFlashlight?x.intensity===0:x.intensity>0)),`L${id}: on visibility and level light restriction`)
      if(shadows){
        assert(!!r.flash.shadow.map,`L${id}: shadow target prepared`)
        const matrix=r.flash.shadow.matrix.elements
        assert(matrix.every(Number.isFinite)&&matrix.some((v,i)=>v!==(i%5===0?1:0)),`L${id}: shadow projection initialized`)
      }
      const paused=await frame(true,true)
      assert(!paused.visible,`L${id}: pause hides hand model`)
      const resumed=await frame(true)
      assert(resumed.visible&&!resumed.gl.compileShader,`L${id}: resume uses prepared model`)
      p.battery=0;const empty=await frame(true)
      assert(empty.intensity===0&&!empty.visible&&empty.cast===shadows&&!empty.gl.compileShader,`L${id}: empty battery keeps shader slot`)
      p.battery=100;p.flashJamT=1;const jam=await frame(true)
      assert(jam.intensity===0&&!jam.visible&&jam.cast===shadows&&!jam.gl.compileShader,`L${id}: jam keeps shader slot`)
      p.flashJamT=0
    }
    assert(gl.getError()===gl.NO_ERROR,'no WebGL error')
  } finally {
    for(const saved of players){const {p,...state}=saved; p.equip.offhand=state.offhand;delete state.offhand;Object.assign(p,state)}
    e.paused=oldPaused;r.setShadows(oldShadows)
    for(const [name,fn] of Object.entries(originals))gl[name]=fn
    r.flash.shadow.updateMatrices=updateShadow
  }
  return {passed:checks.length,checks,rows}
}
