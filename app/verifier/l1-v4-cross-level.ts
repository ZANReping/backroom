import {l1ProbeActive} from '../src/game/renderer/l1Probes'

export async function verifyL1CrossLevel(qa:any){
 const scenes=[['l1-real',1,'realistic'],['l0-real',0,'realistic'],['l0-classic',0,'classic'],['l1-real-again',1,'realistic'],['l0-real-again',0,'realistic']] as const
 const records:any[]=[],images:Record<string,string>={}
 for(const [name,level,mode] of scenes){
  await qa.scene(level);await qa.mode(mode);await qa.warm()
  const materials:any[]=[];let badUniform=false
  qa.r.scene.traverse((o:any)=>{for(const m of Array.isArray(o.material)?o.material:[o.material]){if(!m)continue;materials.push(m);for(const u of Object.values(m.uniforms??{} ) as any[])for(const v of [u?.value])if(typeof v==='number'&&!Number.isFinite(v))badUniform=true}})
  if(!materials.length)throw Error(`${name}: no scene materials`)
  if(badUniform)throw Error(`${name}: NaN/invalid material uniform`)
  const expected=level===1?1:0;if(l1ProbeActive.value!==expected)throw Error(`${name}: l1ProbeActive=${l1ProbeActive.value}, expected ${expected}`)
  records.push({name,level,mode,probeActive:l1ProbeActive.value,materials:materials.length,stats:qa.stats()});images[name]=await qa.captureFrame(960,540)
 }
 return{records,images}
}
