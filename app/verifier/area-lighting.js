import * as THREE from 'three'
import { l1StyleAt } from '/src/game/world/l1Architecture.ts'
import { l1LayoutVariant } from '/src/game/world/l1Layout.ts'
import { forceL7PorchDrop } from '/src/game/engine/movement.ts'

export async function verifyAreaLighting() {
  const {renderer:r,engine:e,look}=perfQA,checks=[],rows=[]
  const assert=(ok,label)=>{if(!ok)throw new Error(label);checks.push(label)}
  const frame=async(label,update=false)=>{
    await new Promise(requestAnimationFrame)
    const gl=r.three.getContext(),link=gl.linkProgram;let links=0
    gl.linkProgram=function(...args){links++;return link.apply(this,args)}
    const t=performance.now()
    try {r.applyView(e);if(update)e.update(1/60);r.render(r.three.domElement,e,{grain:false,flicker:0,shake:false},1/60)}
    finally{gl.linkProgram=link}
    const row={label,cpu:performance.now()-t,links,z:e.player.z,underwater:r.uwK,flash:e.player.flashlight}
    rows.push(row);return row
  }
  const settle=async()=>{const t=performance.now();let quiet=0;while(quiet<5){await frame('settling');quiet=r.isNearWorldReady(e)&&!r.cityChunkTask?quiet+1:0;if(performance.now()-t>90000)throw new Error('area did not settle')}}
  r.setLightMode('realistic');r.setShadows(true);r.setSunShadows(true);r.setBloomFx(false)
  await perfQA.measure(7,5)
  e.paused=false;e.player.flashlight=false;e.player.equip.offhand={type:'flashlight'}
  const warmKey=r.flashWarmupKey
  assert(r.sunDir.castShadow&&r.sunDir.intensity===0&&!!r.sunDir.shadow.map,'L7 interior already has an initialized dormant sun shadow')
  const door=e.map.structures.find(s=>s.kind==='hoteldoor'&&s.data?.l7porch===1)
  door.solid=false;door.data.open=1;e.player.x=door.x+door.w/2;e.player.y=door.y-.5;e.player.z=3;e.player.vz=0;e.inLiquid=0
  look.yaw=Math.PI;look.pitch=.25
  assert(forceL7PorchDrop(e),'actual porch drop starts')
  for(let i=0;i<220;i++){
    e.input.crouch=i>=50
    if(i===45||i===100)e.player.flashlight=!e.player.flashlight
    const row=await frame(i<50?'porch-drop':'dive',true)
    assert(r.sunDir.castShadow&&r.flashWarmupKey===warmKey,`L7 frame ${i}: water transition preserves light programs`)
    if(i>=30&&i<40)assert(row.links===0,`L7 doorway frame ${i}: no synchronous shader submission`)
  }
  assert(e.inLiquid===1&&r.uwK>.9&&e.player.z<-1.5,'actual simulation reaches underwater view')
  e.input.crouch=false
  await perfQA.measure(1,5);e.paused=false;e.player.equip.offhand={type:'flashlight'};e.player.flashlight=false
  const m=e.map,p=e.player,origin={x:p.x+m.inf.ox,y:p.y+m.inf.oy},key=r.flashWarmupKey
  let garden=null,best=Infinity
  for(let cy=-24;cy<=24;cy++)for(let cx=-24;cx<=24;cx++){if(l1LayoutVariant(m.inf.seed,cx,cy)!=='garden')continue;const x=cx*32+16,y=cy*32+16,d=Math.hypot(x-origin.x,y-origin.y);if(d<best){best=d;garden={x,y}}}
  assert(!!garden,'L1 has a garden test region')
  for(const point of [garden,origin]){
    p.x=point.x+0.5-e.map.inf.ox;p.y=point.y+0.5-e.map.inf.oy;p.z=0;e.updateInfiniteWindow()
    assert((l1StyleAt(e.map,p.x,p.y)==='garden')===(point===garden),'streamed actual garden/parking district')
    await frame('L1-region-entry')
    assert(r.l1Sun.castShadow&&r.flashWarmupKey===key,'garden boundary preserves flashlight preparation and shadow slots')
    await settle()
    for(const on of [true,false]){p.flashlight=on;const row=await frame('L1-region-flash');assert(row.links===0,'garden region flashlight switch uses existing programs')}
  }
  r.setLightShadows(2);await perfQA.measure(9,5);e.paused=false;e.player.equip.offhand={type:'flashlight'}
  const lightMap=e.map,originalLights=lightMap.lights,signature=r.flashWarmupKey
  try {
    for(const [label,lights] of [['dim',originalLights.map(l=>({...l,intensityMul:.1,occluded:0}))],['absent',[]],['restored',originalLights]]){
      lightMap.lights=lights;r.lightSortTime=-Infinity
      e.player.flashlight=false;await frame('pool-'+label)
      assert(r.activeLightPool.slice(0,2).every(l=>l.castShadow),'configured point shadow slots remain present')
      assert(r.flashWarmupKey===signature,'source changes do not invalidate the hand model')
      if(label!=='restored')assert(r.activeLightPool.slice(0,2).every(l=>l.shadow.intensity===0&&!l.shadow.needsUpdate),'dim/absent sources skip shadow updates')
      e.player.flashlight=true;const row=await frame('pool-'+label+'-flash')
      assert(row.links===0,'first flashlight switch after changing sources submits no shader')
      if(label==='dim'){
        const target=new THREE.WebGLRenderTarget(160,90),previous=r.three.getRenderTarget()
        const capture=()=>{r.three.setRenderTarget(target);r.three.render(r.scene,r.camera);const pixels=new Uint8Array(160*90*4);r.three.readRenderTargetPixels(target,0,0,160,90,pixels);return pixels}
        try {
          const stable=capture();r.activeLightPool.slice(0,2).forEach(l=>l.castShadow=false);const legacy=capture()
          assert(stable.every((v,i)=>v===legacy[i]),'reserved inactive point shadows preserve pixels')
        }finally{r.activeLightPool.slice(0,2).forEach(l=>l.castShadow=true);r.three.setRenderTarget(previous);target.dispose()}
      }
    }
  }finally{lightMap.lights=originalLights;r.lightSortTime=-Infinity;r.setLightShadows(0)}
  assert(r.three.getContext().getError()===0,'no WebGL error')
  return {passed:checks.length,checks,rows}
}
