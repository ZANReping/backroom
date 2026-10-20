import { canOccupy } from '../src/game/core/player'
import { alphaBakeParts,alphaBakeFingerprint } from '../src/game/content/alphaBakeLayout'
import { ALPHA_BLUEPRINT,ALPHA_LIGHTS } from '../src/game/content/alphaBlueprint'
import { alphaBakedActive } from '../src/game/renderer/alphaBakedLighting'
import { storage } from '../src/game/core/storage'
import { verifyAlphaRuntime,verifyAlphaCommunityRuntime } from './alpha-runtime'
/** Fixed cameras shared by the before/after game captures; references remain local. */
export const views: Record<string, [number, number, number, number, number?]> = {
  radio: [30.5, 33, .2, -.01], meeting: [36.7, 54.7, .18, -.04],
  storage: [28.1, 19.8, .48, -.03], dorm: [17.2, 35.2, -.07, -.06],
  laboratory: [78, 41.1, -.38, -.04], office: [77.15, 47.55, Math.PI + .05, -.04],
  specimens: [105, 51.5, .82, -.12], archivists: [57.9, 37.7, 0, -.18],
  tech: [69.4, 37.4, .5, -.12], paper_archive: [61.35, 30.6, .06, -.02],
  admin_lobby: [74.6, 29.9, .42, -.015], assembly: [90, 27.8, 0, -.05, .96],
  trade: [111.9, 7.5, -1.25, -.04], mushrooms: [112.5, 26.6, .34, -.16],
  library: [45, 97.5, .06, -.035], zephyr: [93, 122.5, 0, -.025],
  kitchen_sink:[59.5,59.72,.04,-.77], tea_cups:[65.25,102.9,0,-.66],
  laboratory_sink:[82.75,36.86,0,-.65], duty_sink:[34.5,62.1,0,-.68],
  mounted_research:[94,55.5,.48,.02], mounted_expedition:[22,60.5,1.22,.02],
  doorway_radio:[29.7,37.7,.62,.06], doorway_admin:[73.2,17.45,.65,.04],
  doorway_admin_open:[73.2,17.45,.65,.04], doorway_radio_inside:[27.4,34.5,Math.PI+.65,.04],
  reception_post:[68.1,20.3,-.91,-.035], repair_post:[122.25,70.7,-1.44,-.035],
}

export async function runtime(qa:any){
 const check=(ok:unknown,label:string)=>{if(!ok)throw Error(label)}
 check(alphaBakedActive(),'offline bake is active in the actual scene')
 const lamps=qa.r.activeLightPool.filter((p:any)=>p.userData.l0Baked)
 check(lamps.length>0&&lamps.every((p:any)=>p.shadow.intensity===0),'native lamps use baked shadows without cube-map updates')
 const saved={get:storage.get,set:storage.set,remove:storage.remove}
 let services,community
 try{
  // The QA Chrome profile is disposable; existing runtime regressions deliberately
  // use localStorage and restore it themselves. Player save slots are never loaded.
  storage.get=k=>localStorage.getItem(k);storage.set=(k,v)=>localStorage.setItem(k,v);storage.remove=k=>localStorage.removeItem(k)
  services=verifyAlphaRuntime();community=verifyAlphaCommunityRuntime()
 }finally{Object.assign(storage,saved)}
 const cycles=[]
 for(let i=0;i<3;i++){
  await qa.scene(108);await qa.warm();check(!alphaBakedActive(),'leaving Alpha releases its GPU atlas owners')
  await qa.scene(101,'open',424242);await view(qa,'radio')
  check(alphaBakedActive(),'returning Alpha reuses decoded bake without stale ownership')
  cycles.push({...qa.r.three.info.memory})
 }
 check(JSON.stringify(cycles[1])===JSON.stringify(cycles[2]),'GPU geometry and texture counts stabilize after repeated returns')
 const mode=qa.r.lightMode,qualityCycles=[]
 for(let i=0;i<2;i++){
  qa.mode(mode==='realistic'?'classic':'realistic');await qa.warm()
  check(alphaBakedActive(),'bake remains active in the alternate material mode')
  qa.mode(mode);await qa.warm();qualityCycles.push({...qa.r.three.info.memory})
 }
 check(JSON.stringify(qualityCycles[0])===JSON.stringify(qualityCycles[1]),'quality switching releases prior atlas and batch attributes')
 qa.eng.player.flashlight=true;await qa.warm()
 const flashlight=qa.r.flash?.intensity??qa.r.flashLight?.intensity
 qa.eng.player.flashlight=false
 check(flashlight>0,'flashlight remains a live light on baked furniture')
 return {services,community,cycles,qualityCycles,flashlight,nativeLamps:lamps.length}
}
export async function view(qa: any, id: string) {
  const [x, y, yaw, pitch, z = 0] = views[id]
  Object.assign(qa.eng.player, { x, y, z, floor: 0, flashlight: false })
  Object.assign(qa.look, { yaw, pitch, roll: 0 }); qa.r.setFov(70)
  if(id==='doorway_admin'||id==='doorway_admin_open'){
   const s=qa.eng.map.structures.find((s:any)=>s.data?.settlementDoor&&s.x>70&&s.x<73&&s.y>15&&s.y<16.1)
   if(!s)throw Error('Missing overseer door')
   s.data.open=id.endsWith('_open')?1:0;s.solid=!s.data.open
  }
  await qa.warm()
  const bake:any[]=[];qa.r.scene.traverse((o:any)=>{if(o.userData.alphaBake!==undefined)bake.push(o.userData.alphaBake)})
  return { x, y, z, yaw, pitch, fov: 70, bake, fingerprints:[alphaBakeFingerprint(alphaBakeParts(qa.eng.map.structures),ALPHA_LIGHTS),alphaBakeFingerprint(alphaBakeParts(ALPHA_BLUEPRINT.decorations!),ALPHA_LIGHTS)], safe: canOccupy(qa.eng.map, x, y, .32, { z, band: 0 }) }
}
