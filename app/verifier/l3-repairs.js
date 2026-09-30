import {canOccupy,moveStep} from '/src/game/core/player.ts'
import {structColliders} from '/src/game/world/mapgen.ts'
import {verify as existingChecks} from './l3-runtime.js'
const check=(value,message)=>{if(!value)throw new Error(message)}
const frame=()=>new Promise(requestAnimationFrame)
async function settle(qa){
 for(let i=0;i<3;i++)await frame()
 const start=performance.now()
 while(qa.renderer.builtMap!==qa.engine.map||qa.renderer.chunkGroups.size<25||qa.renderer.cityChunkTask){
  if(performance.now()-start>90000)throw new Error('streaming timeout')
  await frame()
 }
 for(let i=0;i<5;i++)await frame()
}
export async function verify(qa){
 const result=await existingChecks(qa)
 qa.setVariant('sanct');await settle(qa)
 const m=qa.engine.map,s=m.structures.find(s=>s.kind==='angelstatue'&&s.x+m.inf.ox>=0&&s.x+m.inf.ox<32&&s.y+m.inf.oy>=0&&s.y+m.inf.oy<32)
 check(s,'central sanctuary angel exists')
 const x=s.x+s.w/2,z=s.y+s.h/2
 check(!canOccupy(m,x,z),'actual base blocks player')
 for(const side of [-1,1]){
  const p={x:x+side*1.25,y:z-1.5}
  check(canOccupy(m,p.x,p.y),'clear approach beside angel')
  for(let i=0;i<60;i++)moveStep(m,p,0,.05)
  check(p.y>z+1.45,'player crosses beneath the raised wing without an air wall')
 }
 const boxes=structColliders(s,m),wing=boxes.find(b=>b.x0>x+1&&(b.bottom??0)>3)
 check(wing,'elevated wing collision remains')
 check(!canOccupy(m,(wing.x0+wing.x1)/2,(wing.y0+wing.y1)/2,.1,{z:wing.bottom,band:0}),'raised player collides with physical wing')
 result.push('angel: solid base, both wing undersides traversable, elevated wing blocks')
 qa.view(x+m.inf.ox,z+m.inf.oy+3.8,0,.28)
 return result
}
export async function entrance(qa,variant){
 qa.setVariant(variant);await settle(qa)
 const m=qa.engine.map,d=m.structures.find(s=>s.data?.l3Iron&&s.x+m.inf.ox>=0&&s.x+m.inf.ox<32&&s.y+m.inf.oy>=0&&s.y+m.inf.oy<32)
 const alongX=!!d.data.rot,coordinate=alongX?d.x+m.inf.ox:d.y+m.inf.oy,sign=coordinate<16?-1:1
 qa.view(d.x+.5+m.inf.ox+(alongX?sign*2.8:0),d.y+.5+m.inf.oy+(alongX?0:sign*2.8),alongX?sign*Math.PI/2:sign>0?0:Math.PI,0)
 return {variant,door:[d.x+m.inf.ox,d.y+m.inf.oy],view:[qa.engine.player.x+m.inf.ox,qa.engine.player.y+m.inf.oy]}
}
export async function corner(qa){
 qa.setVariant('lit');await settle(qa)
 const m=qa.engine.map,floor=(x,z)=>m.tiles[z*m.w+x]===1&&m.tint[z*m.w+x]!==51
 const candidates=[]
 for(let z=34;z<126;z++)for(let x=34;x<126;x++){
  const quadrants=[[-1,-1],[0,-1],[-1,0],[0,0]],cells=quadrants.filter(([dx,dz])=>floor(x+dx,z+dz))
  if(cells.length!==1&&cells.length!==3)continue
  const [dx,dz]=cells.length===1?cells[0]:quadrants.find(([dx,dz])=>!floor(x+dx,z+dz))
  const sign=cells.length===1?1:-1,sx=(dx===0?1:-1)*sign,sz=(dz===0?1:-1)*sign
  if(canOccupy(m,x+sx*.85,z+sz*.85))candidates.push({x,z,sx,sz,dist:Math.hypot(x-78,z-92)})
 }
 candidates.sort((a,b)=>a.dist-b.dist);const c=candidates[0];check(c,'viewable lit corner')
 qa.view(c.x+m.inf.ox+c.sx*.85,c.z+m.inf.oy+c.sz*.85,Math.atan2(c.sx,c.sz),.5)
 return c
}
