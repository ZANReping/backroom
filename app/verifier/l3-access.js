import {canOccupy,moveStep} from '/src/game/core/player.ts'
import {l3StyleAt,L3_NARROW_TINT} from '/src/game/world/l3Architecture.ts'
import {genL3ChunkRaw,l3VariantOf,L3_VARIANT_NAMES,L3_VARIANT_LORE,L3_RARE_VARIANTS} from '/src/game/world/infiniteL3.ts'
import {registerInfiniteLevel,infiniteImplFor} from '/src/game/world/infiniteRegistry.ts'
import {devLevelStructures} from '/src/game/engine/dev.ts'
import {levelDefOf} from '/src/game/levels/index.ts'
const check=(v,msg)=>{if(!v)throw new Error(msg)}
const frame=()=>new Promise(requestAnimationFrame)
async function settle(qa){
 for(let i=0;i<3;i++)await frame()
 const start=performance.now()
 while(qa.renderer.builtMap!==qa.engine.map||qa.renderer.chunkGroups.size<qa.engine.map.inf.chunks.size||qa.renderer.cityChunkTask){
  if(performance.now()-start>90000)throw new Error('streaming timeout')
  await frame()
 }
 for(let i=0;i<5;i++)await frame()
}
export async function portalView(qa){
 qa.setVariant('narrow');await settle(qa)
 const m=qa.engine.map
 for(let z=66;z<94;z++)for(let x=66;x<94;x++)if(m.tint[z*m.w+x]===51)for(const dir of [-1,1]){
  if(m.tiles[(z+dir)*m.w+x]!==1||m.tint[(z+dir)*m.w+x]===51)continue
  if(!canOccupy(m,x+.5,z+.5+dir*1.4))continue
  qa.view(x+.5+m.inf.ox,z+.5+dir*1.4+m.inf.oy,dir>0?0:Math.PI,0)
  return {x:x+m.inf.ox,z:z+m.inf.oy,dir}
 }
 throw new Error('no portal view')
}
export async function verify(qa){
 qa.setVariant('narrow');await settle(qa)
 const results=[],m=qa.engine.map
 let traversals=0
 for(let z=34;z<126&&traversals<36;z++)for(let x=34;x<126&&traversals<36;x++){
  if(m.tint[z*m.w+x]!==L3_NARROW_TINT)continue
  for(const dir of [-1,1]){
   if(m.tiles[(z+dir)*m.w+x]!==1||m.tint[(z+dir)*m.w+x]===L3_NARROW_TINT)continue
   for(const offset of [-.16,0,.16]){
    const inside=z+.5,outside=inside+dir
    if(!canOccupy(m,x+.5+offset,inside)||!canOccupy(m,x+.5+offset,outside))continue
    const p={x:x+.5+offset,y:outside}
    for(let i=0;i<20;i++)moveStep(m,p,0,-dir*.05)
    check(Math.abs(p.y-inside)<.001,'entrance traversable near both jambs')
    for(let i=0;i<20;i++)moveStep(m,p,0,dir*.05)
    check(Math.abs(p.y-outside)<.001,'exit traversable near both jambs');traversals++
   }
  }
 }
 check(traversals>=30,'enough entrance movement samples');results.push(`${traversals} portal crossings and returns at centre/left/right`)
 // Restore actual procedural registration instead of the visual page's forced biomes.
 registerInfiniteLevel(3,{genRaw:genL3ChunkRaw,variantOf:l3VariantOf,variantNames:L3_VARIANT_NAMES,variantLore:L3_VARIANT_LORE,rareVariants:L3_RARE_VARIANTS})
 const e=qa.engine;e.loadLevel(3,{mapSeed:424242,firstVisit:false});e.introT=0;await settle(qa)
 const list=e.devLevelStructures().variants
 check(list.some(v=>v.id==='lit')&&list.some(v=>v.id==='dark'),'common areas listed')
 check(new Set(list.map(v=>v.id)).size===list.length,'no duplicate area buttons')
 const validate=kind=>{
  const map=e.map,p=e.player
  check(l3StyleAt(map,p.x,p.y)===kind&&map.tint[Math.floor(p.y)*map.w+Math.floor(p.x)]!==51,'teleport lands in requested common region')
  check(canOccupy(map,p.x,p.y),'teleport landing is walkable')
 }
 check(e.devGotoVariant('lit'),'teleport to loaded lit');await settle(qa);validate('lit')
 results.push('common lit area listed and loaded-area teleport safe')
 let target
 search:for(let cy=8;cy<70;cy++)for(let cx=8;cx<70;cx++){
  let allLit=true
  for(let dz=-2;dz<=2;dz++)for(let dx=-2;dx<=2;dx++)if(l3VariantOf(424242,cx+dx,cy+dz)!=='lit')allLit=false
  if(allLit){target={cx,cy};break search}
 }
 check(target,'all-lit test window exists')
 e.player.x=target.cx*32+16-e.map.inf.ox;e.player.y=target.cy*32+16-e.map.inf.oy;e.updateInfiniteWindow();await settle(qa)
 check(!e.devLevelStructures().variants.find(v=>v.id==='dark').found,'dark begins outside loaded window')
 check(e.devGotoVariant('dark'),'teleport to unloaded dark');await settle(qa);validate('dark')
 check(!e.map.structures.some(s=>s.kind==='trade_terminal'||s.data?.facility),'streamed Level 3 has no business terminals')
 results.push('unloaded dark region streamed, target verified, no terminals')
 for(const id of [0,1,2,3,4,5,6,7,8,9,10,11]){
  const impl=infiniteImplFor(id),entries=devLevelStructures({map:{inf:{chunks:new Map()}},levelDef:levelDefOf(id)}).variants
  check(Object.keys(impl.variantNames).every(key=>entries.some(e=>e.id===key)),`all registered Level ${id} regions listed`)
  check(entries.length===new Set(entries.map(e=>e.id)).size,`Level ${id} region ids unique`)
 }
 results.push('all 12 infinite-level registered region lists include common areas without duplicates')
 return results
}
