import * as THREE from 'three'

export async function verifyFlashlightVisual() {
  const {renderer:r,engine:e,look}=perfQA,three=r.three,checks=[],images=[]
  const assert=(ok,label)=>{if(!ok)throw new Error(label);checks.push(label)}
  const target=new THREE.WebGLRenderTarget(240,135), previous=three.getRenderTarget()
  const capture=()=>{three.setRenderTarget(target);three.render(r.scene,r.camera);const p=new Uint8Array(240*135*4);three.readRenderTargetPixels(target,0,0,240,135,p);return p}
  try {
    r.setShadows(true)
    for(const level of [0,2,9]){
      await perfQA.measure(level,5);e.paused=false;e.player.flashlight=false
      r.render(three.domElement,e,{grain:false,flicker:0,shake:false},0)
      const pose=r.camera.rotation.clone()
      for(let i=0;i<4;i++){
        r.camera.rotation.y=pose.y+i*Math.PI/2;r.camera.updateMatrixWorld(true)
        r.flash.castShadow=true;const stable=capture()
        r.flash.castShadow=false;const old=capture()
        const diff=stable.reduce((max,value,index)=>Math.max(max,Math.abs(value-old[index])),0)
        images.push({level,view:i,maxChannelDifference:diff})
        assert(diff===0,`L${level} view ${i}: zero-intensity shadow slot preserves pixels`)
      }
      r.camera.rotation.copy(pose);r.flash.castShadow=true;three.setRenderTarget(previous)
    }
    assert(three.getContext().getError()===three.getContext().NO_ERROR,'no WebGL errors')
  } finally {r.flash.castShadow=r.flashShadowsOn;three.setRenderTarget(previous);target.dispose();r.applyView(e)}
  return {passed:checks.length,checks,images}
}
