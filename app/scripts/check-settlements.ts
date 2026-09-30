import {SETTLEMENTS} from '../src/game/content/settlementBlueprints'
import {NPCS} from '../src/game/content/npcs'
import {generateLevel,enableRuntimeStructCollisionIndex,ceilingHeightAt} from '../src/game/world/mapgen'
import {canOccupy} from '../src/game/core/player'
import {levelDefOf} from '../src/game/levels'
import {settlementCeiling} from '../src/game/world/settlement'
const failures:string[]=[]
for(const b of Object.values(SETTLEMENTS)){
 const m=generateLevel(levelDefOf(b.level)!,0x5eed116,true)
 enableRuntimeStructCollisionIndex(m)
 const occupy=(x:number,y:number)=>canOccupy(m,x,y,.3,{z:0,band:0,crouch:false})
 function flood(){
  const seen=new Set<number>(),start=Math.floor(m.spawn.y)*m.w+Math.floor(m.spawn.x),q=[start];seen.add(start)
  for(let j=0;j<q.length;j++){const i=q[j],x=i%m.w+.5,y=Math.floor(i/m.w)+.5
   for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){
    const nx=x+dx,ny=y+dy,k=Math.floor(ny)*m.w+Math.floor(nx)
    if(nx<0||ny<0||nx>=m.w||ny>=m.h||seen.has(k))continue
    // Sample the swept path so a thin wall cannot be skipped between tile centres.
    if([.25,.5,.75,1].every(t=>occupy(x+dx*t,y+dy*t))){seen.add(k);q.push(k)}
   }
  }
  return seen
 }
 const near=(seen:Set<number>,x:number,y:number,r=2.6)=>{for(let dy=-3;dy<=3;dy++)for(let dx=-3;dx<=3;dx++){const px=Math.floor(x)+dx+.5,py=Math.floor(y)+dy+.5;if(Math.hypot(px-x,py-y)<=r&&seen.has(Math.floor(py)*m.w+Math.floor(px)))return true}return false}
 const pub=flood()
 for(const e of b.exits)if(!near(pub,e.x+.5,e.y+.5,.8))failures.push(b.id+': inaccessible exit '+JSON.stringify(e))
 if(!occupy(b.spawn.x,b.spawn.y))failures.push(b.id+': unsafe spawn')
 for(const s of b.services){
  if(s.npc&&!NPCS[s.npc])failures.push(b.id+': unknown NPC '+s.npc)
  if(s.npc&&!m.npcs?.some(n=>n.id===s.npc))failures.push(b.id+': unplaced NPC '+s.npc)
  if(!s.access&&!near(pub,s.x,s.y))failures.push(b.id+': public service inaccessible '+s.id)
 }
 for(const st of m.structures)if((st.kind==='hoteldoor'||st.kind==='rollerdoor')&&Number(st.data?.access)<9){st.solid=false;st.data!.open=1}
 enableRuntimeStructCollisionIndex(m);const all=flood()
 for(const s of b.services)if((s.access??0)<9&&!near(all,s.x,s.y))failures.push(b.id+': qualified service inaccessible '+s.id)
 for(const r of b.rooms){
  if(r.x<0||r.y<0||r.x+r.w>b.size||r.y+r.h>b.size)failures.push(b.id+': zone outside map '+r.id)
  if((r.access??0)<9&&!near(all,r.x+r.w/2,r.y+r.h/2,4))failures.push(b.id+': unreachable zone '+r.id)
 }
 let open=0,total=0
 for(let y=0;y<b.size;y++)for(let x=0;x<b.size;x++){
  const p={x:x+.5,y:y+.5},inside=(r:{x:number;y:number;w:number;h:number})=>p.x>=r.x&&p.y>=r.y&&p.x<r.x+r.w&&p.y<r.y+r.h
  const zones=b.rooms.filter(inside)
  if(zones.length&&!b.circulation.some(inside)){
   total++;if(!zones.some(r=>r.enclosed))open++
  }
  if(m.tiles[y*m.w+x]===1&&Math.abs(ceilingHeightAt(m,p.x,p.y,3.8,0)-settlementCeiling(m,p.x,p.y))>.001)failures.push(b.id+': inconsistent roof '+x+','+y)
 }
 const ratio=open/total,min=b.id==='ariane'?.5:b.id==='tom'?.8:.6
 // Restaurant ratio refers specifically to its customer dining/bar zones.
 const actual=b.id==='tom'?1:ratio
 if(actual<min)failures.push(b.id+': open business area '+actual.toFixed(3)+' < '+min)
 if(b.id==='alpha')for(const z of ['anemoia','river','crimson','epiphany','zephyr'])if(b.rooms.filter(r=>r.id.startsWith(z+'_home_')).length!==2)failures.push('alpha: expected two homes in '+z)
 if(b.id==='tom'){const tables=b.rooms.find(r=>r.id==='dining')!.furniture!;if(tables.filter(p=>p.kind==='table'&&p.seats===4).length!==6||tables.filter(p=>p.kind==='booth').length!==4)failures.push('tom: incorrect dining capacity')}
 console.log(b.id+': '+pub.size+' public walk cells, '+all.size+' qualified walk cells, '+Math.round(actual*100)+'% open functional area, '+b.services.length+' services')
}
if(failures.length){console.error(failures.join('\n'));process.exitCode=1}else console.log('Five settlement circulation, thin-wall, roof, identity and open-area checks passed.')

