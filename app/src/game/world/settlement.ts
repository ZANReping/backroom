import { stationServices } from '../engine/career'
import { CAREERS } from '../content/careers'
import { NPCS, genRandomNpcs } from '../content/npcs'
import { RNG } from '../core/rng'
import type { GameMap } from './mapgen'
import type { LevelDef } from '../core/types'
import type { RoomSpec, SettlementBlueprint } from '../content/settlementTypes'
export interface Furnishing { x:number;y:number;w:number;d:number;z:number;h:number;color:string;solid?:boolean }
export function settlementCeiling(m:GameMap,x:number,y:number){
 const s=m.settlement!,i=Math.floor(y)*m.w+Math.floor(x)
 if(s.blueprint.id==='ariane'&&s.roomIndex[i]<0)return 3.05+.75*Math.sqrt(Math.max(0,1-((x%5-2.5)/2.5)**2))
 return s.heights[i]
}
// The renderer and collision builder consume these exact same furniture footprints.
export function furnishings(r:RoomSpec):Furnishing[] {
 const a:Furnishing[]=[]
 const box=(x:number,y:number,w:number,d:number,z:number,h:number,color:string,solid=false)=>a.push({x:r.x+x,y:r.y+y,w,d,z,h,color,solid})
 const steel='#767e80',wood='#856447',white='#deded2',blue='#596b77',cloth='#455e73',dark='#293338'
 const table=(x:number,y:number,w=2,d=1,color=wood)=>{box(x,y,w,d,.72,.1,color,true);for(const u of [0,w-.08])for(const v of [0,d-.08])box(x+u,y+v,.08,.08,0,.72,steel)}
 const chair=(x:number,y:number,color=cloth)=>{box(x,y,.46,.46,.44,.09,color);box(x,y+.4,.46,.06,.52,.42,color);for(const u of [0,.4])box(x+u,y,.05,.45,0,.44,steel)}
 const shelf=(x:number,y:number,w=2,archive=false)=>{box(x,y,w,.65,0,2.05,steel,true);for(let j=0;j<5;j++)for(let k=0;k<4;k++)box(x+.05+k*(w/4),y+.655,w/4-.07,.08,.12+j*.38,.29,archive?'#aaa99a':blue)}
 const bed=(x:number,y:number)=>{box(x,y,1.2,2.15,.18,.28,wood,true);box(x+.04,y+.04,1.12,2.06,.46,.2,'#e6e2d6');box(x+.12,y+.12,.9,.4,.66,.1,'#f2efdd');box(x,y+1,1.2,1.1,.67,.04,cloth)}
 const sink=(x:number,y:number)=>{box(x,y,1.4,.7,0,.85,white,true);box(x+.1,y+.08,1.2,.5,.85,.06,steel);box(x+.8,y+.5,.06,.06,.91,.35,steel)}
 const desk=(x:number,y:number)=>{table(x,y,2.4);chair(x+.6,y+1.3);box(x+.3,y+.18,.65,.3,.82,.5,dark);box(x+.35,y+.15,.55,.035,.89,.34,'#7eaba1');box(x+1.25,y+.1,.32,.24,.82,.1,dark)}
 const center=r.w/2
 if(r.id==='dining'&&r.w===44){
  // Six four-person tables, four two-person booths and one eight-person communal table.
  for(let row=0;row<2;row++)for(let col=0;col<3;col++){const x=10+col*7,y=5+row*8;table(x,y,2.2,1.3);chair(x,y-1);chair(x+1.2,y-1);chair(x,y+1.8);chair(x+1.2,y+1.8);box(x+.9,y+.4,.3,.3,.83,.12,white)}
  for(let i=0;i<4;i++){const y=3+i*5;table(3,y,1.3,.9);box(1.2,y-.2,1,.9,.35,.45,'#663a35',true);box(1.1,y-.2,.15,.9,.8,.6,'#663a35');chair(5,y,'#663a35')}
  table(35,7,2,7);for(let i=0;i<4;i++){chair(33.8,7.2+i*1.6);chair(37.5,7.2+i*1.6)}
 }else if(r.id==='bar'){
  table(3,4,12,1,wood);box(3,4,12,1,0,1,wood,true);for(let i=0;i<6;i++){box(3.5+i*1.8,6,.4,.4,.85,.12,cloth);box(3.65+i*1.8,6.15,.1,.1,0,.85,steel)}
  box(4,4.1,1.3,.6,1,.55,steel);shelf(3,1.2,8);box(6,4.2,.3,.3,1,.3,white)
 }else if(r.id==='music'){
  table(2,2,1.6);box(2,2,1.3,.6,.84,.4,dark);for(const x of [5,12]){chair(x,4);chair(x+1,4);table(x,2.5,1.5,.8)}box(2,5,.5,.5,0,1.1,wood,true);box(2.2,5.2,.12,.12,1,1,wood)
 }else switch(r.style){
 case 'office': case 'intake': desk(1.5,2);if(r.w>11)desk(r.w-4.5,2);shelf(1.4,r.h-2.1,2,true);break
 case 'archive':case 'library': for(let x=1.5;x<r.w-2;x+=3.5)shelf(x,1.5,2.2,true);desk(1.5,r.h-3.8);break
 case 'radio': for(let x=1.5;x<r.w-2;x+=2){shelf(x,1.4,1.6);for(let j=0;j<5;j++)box(x+.2,2.06,.35,.08,.3+j*.32,.17,dark)}desk(1.5,r.h-3.8);if(r.w>10)desk(r.w-4.5,r.h-3.8);break
 case 'classroom':case 'auditorium':box(1.5,1.05,r.w-3,.08,1.15,1.15,'#25413c');table(2,2.2,2);for(let y=4;y<r.h-2;y+=2)for(let x=1.7;x<r.w-2;x+=3){if(Math.abs(x-center)<1.5)continue;if(r.style==='classroom')table(x,y,1.6,.65);chair(x+.3,y+1)}break
 case 'lab': sink(1.4,1.4);shelf(r.w-3.7,1.4);table(2.1,r.h/2,Math.max(2,r.w-4.2),1.1,white);for(let x=2.4;x<r.w-2.5;x+=2){box(x,r.h/2+.2,.25,.25,.83,.25,blue);box(x+.4,r.h/2+.3,.06,.06,.84,.65,steel);box(x+.3,r.h/2+.2,.35,.15,1.35,.13,dark)}box(1.4,1.5,1.6,.7,1.8,.5,steel);break
 case 'clinic':for(let x=1.5;x<r.w-2.5;x+=3.2){bed(x,2);box(x+1.4,2,.6,.6,0,.75,white,true);box(x+2.3,1.3,.07,3,.3,1.8,'#9ebbb1')}sink(1.5,r.h-2.4);break
 case 'bedroom':bed(1.5,1.5);if(r.housing!=='single'&&r.w>7)bed(r.w-3,1.5);if(r.housing==='family')bed(r.w-3,4.1);table(1.5,r.h-2.7,2);chair(3.8,r.h-2.8);box(1.5,1.07,.65,.06,1.4,.45,'#c7a37c');break
 case 'residential':table(2.4,2.6,2);for(let x=2;x<r.w-2;x+=2){chair(x,1.5);chair(x,4.2)}box(1.4,1.04,1.2,.06,1.2,.75,'#ac9b7c');break
 case 'holding':bed(1.5,1.5);sink(r.w-3,r.h-2.2);break
 case 'store':case 'vault':for(let x=1.5;x<r.w-2.5;x+=3.5){shelf(x,1.5,2.2);if(r.h>9)shelf(x,r.h-2,2.2)}break
 case 'market': table(1.5,2,Math.max(2,r.w-3),.8);box(1.5,2,.08,.8,.83,.6,steel);shelf(1.5,r.h-2.2);break
 case 'kitchen':for(let x=1.5;x<r.w-2.5;x+=2){table(x,1.5,1.8,.9,steel);box(x,1.5,1.8,.9,1.95,.45,steel);box(x+.3,1.65,.45,.45,.84,.25,dark)}sink(1.5,r.h-2.5);box(r.w-3,r.h-3,1.5,1.5,0,2,white,true);table(2.5,r.h/2,Math.max(2,r.w-5),1,steel);break
 case 'dining':for(let y=2;y<r.h-3;y+=4)for(let x=1.5;x<r.w-3;x+=5){if(Math.abs(x-center)<2)continue;table(x,y);chair(x,y-1);chair(x+1.1,y-1);chair(x,y+1.5);chair(x+1.1,y+1.5)}break
 case 'wash':for(let x=1.5;x<r.w-2;x+=2)sink(x,1.5);box(1.5,r.h-2.5,1,1,0,1.1,white,true);break
 case 'workshop':table(1.5,1.5,r.w-3,.9,steel);for(let x=2;x<r.w-2;x+=1.3)box(x,1.4,.15,.08,1.2,.6,blue);shelf(1.5,r.h-2);break
 case 'garden':for(let y=1.5;y<r.h-2;y+=2)for(let x=1.5;x<r.w-2;x+=2)box(x,y,1.3,1.1,0,.8,'#737b51',true);break
 }
 // Keep the entire door approach clear, including large freight doors.
 const dx=r.door==='w'?1:r.door==='e'?r.w-1:center,dy=r.door==='n'?1:r.door==='s'?r.h-1:r.h/2
 return a.filter(p=>!(p.x<r.x+dx+1.8&&p.x+p.w>r.x+dx-1.5&&p.y<r.y+dy+1.8&&p.y+p.d>r.y+dy-1.8)&&!(r.through&&p.x<r.x+center+1.3&&p.x+p.w>r.x+center-1.3))
}
export function genSettlement(m:GameMap,def:LevelDef,b: SettlementBlueprint){
 m.tiles.fill(2);m.npcs=[];m.zones=[]
 const heights=new Float32Array(m.w*m.h).fill(b.id==='bntg'?4.8:b.id==='cornucopia'?4.2:3.8),roomIndex=new Int16Array(m.w*m.h).fill(-1)
 m.settlement={blueprint:b,heights,roomIndex}
 for(const c of b.corridors)for(let y=c.y;y<c.y+c.h;y++)for(let x=c.x;x<c.x+c.w;x++)m.tiles[y*m.w+x]=1
 b.rooms.forEach((r,ri)=>{
  for(let y=r.y;y<r.y+r.h;y++)for(let x=r.x;x<r.x+r.w;x++){const i=y*m.w+x;m.tiles[i]=x===r.x||x===r.x+r.w-1||y===r.y||y===r.y+r.h-1?2:1;heights[i]=r.height;roomIndex[i]=ri}
  const vertical=r.door==='e'||r.door==='w',dx=vertical?(r.door==='w'?r.x:r.x+r.w-1):Math.floor(r.x+r.w/2)-1,dy=vertical?Math.floor(r.y+r.h/2)-1:(r.door==='n'?r.y:r.y+r.h-1)
  for(let k=0;k<2;k++)m.tiles[(dy+(vertical?k:0))*m.w+dx+(vertical?0:k)]=1
  if(r.through)for(let k=0;k<2;k++)m.tiles[(r.y+r.h-1)*m.w+Math.floor(r.x+r.w/2)-1+k]=1
  if(r.access)m.structures.push({kind:'hoteldoor',x:dx,y:dy,w:vertical?1:2,h:vertical?2:1,solid:true,data:{careerDoor:1,access:r.access,faction:b.faction,open:0,deg:vertical?90:0}})
  m.zones!.push({name:r.name,x:r.x+r.w/2,y:r.y+r.h/2,x0:r.x,y0:r.y,x1:r.x+r.w,y1:r.y+r.h})
  const station={x:dx+(vertical?(r.door==='w'?1.4:-1.4):2.2),y:dy+(vertical?2.2:r.door==='n'?1.4:-1.4)}
  m.structures.push({kind:'settlementstation',x:station.x,y:station.y,w:.5,h:.4,solid:false,data:{room:r.id,label:r.name,services:stationServices(r.style,r.service),service:r.service??'room',faction:b.faction,access:r.access??0}})
  const furniture=furnishings(r)
  if(r.npc){let placed=false;for(let y=r.y+2.5;y<r.y+r.h-1&&!placed;y++)for(let x=r.x+2.5;x<r.x+r.w-1&&!placed;x++)if(!furniture.some(p=>p.solid&&x>p.x-.4&&x<p.x+p.w+.4&&y>p.y-.4&&y<p.y+p.d+.4)){m.npcs!.push({id:r.npc,x,y});placed=true}}
  for(const p of furniture)if(p.solid)m.structures.push({kind:'settlementprop',x:p.x,y:p.y,w:p.w,h:p.d,solid:true,data:{height:p.z+p.h}})
  for(let y=r.y+2.5;y<r.y+r.h-1;y+=4.5)for(let x=r.x+2.5;x<r.x+r.w-1;x+=5)m.lights.push({x,y,r:5,color:['residential','bedroom','dining'].includes(r.style)?'#ffd9a0':'#e4eee8',flickerSeed:ri*31+x+y,fixZ:r.height-.13,keep:1})
 })
 for(let y=3;y<m.h-2;y+=6)for(let x=3;x<m.w-2;x+=6){const i=y*m.w+x;if(m.tiles[i]===1&&roomIndex[i]<0)m.lights.push({x:x+.5,y:y+.5,r:6,color:'#d8dedb',fixZ:heights[i]-.13,flickerSeed:x+y,keep:1})}
 b.exits.forEach((p,i)=>m.exits.push({...p,def:def.exits[i%def.exits.length],discovered:true}))
 const peopleRng=new RNG(b.level*104729),people=genRandomNpcs(()=>peopleRng.next(),b.id==='alpha'?12:8,b.id==='bntg'?'bntg':b.id==='ariane'?'ariane':b.id==='tom'?'mixed':'meg')
 const publicRooms=b.rooms.filter(r=>!r.access&&['residential','dining','market','classroom','office','library','intake'].includes(r.style))
 m.npcDefs??=[]
 people.forEach((person,i)=>{
  const r=publicRooms[i%publicRooms.length],f=furnishings(r)
  person.id=`settlement_${b.level}_resident_${i}`
  if(b.id==='cornucopia'){person.faction='argos';person.role=i%2?'巡逻队员':'案卷协作员';person.background='在旧贸易设施改建的丰饶角轮值。';person.idle=i%2?['先保护现场，别把猜测当作证据。']:['程序和结果有时并不一致，听证必须留下异议。'];person.lines=[{npc:person.idle[0],opts:[{text:'明白了。',action:'leave'}]}]}
  for(let y=r.y+2.5;y<r.y+r.h-1;y++)for(let x=r.x+2.5;x<r.x+r.w-1;x++){
   if(f.some(p=>p.solid&&x>p.x-.4&&x<p.x+p.w+.4&&y>p.y-.4&&y<p.y+p.d+.4)||m.npcs!.some(n=>Math.hypot(n.x-x,n.y-y)<1.5))continue
   m.npcDefs!.push(person);m.npcs!.push({id:person.id,x,y});return
  }
 })
 m.spawn={...b.spawn}
 return [{cx:b.spawn.x,cy:b.spawn.y},...b.rooms.map(r=>({cx:r.x+r.w/2,cy:r.y+r.h/2}))]
}

/** Existing outposts receive a staffed desk beside a real NPC, without altering their old layout. */
export function appendLegacyStations(m:GameMap){
 if(m.settlement)return
 const done=new Set<string>()
 for(const npc of m.npcs??[]){
  const def=NPCS[npc.id]??m.npcDefs?.find(d=>d.id===npc.id),f=def?.faction
  if(!f||!(f in CAREERS)||done.has(f))continue
  const services=[...new Set(Object.values(CAREERS).filter(c=>c.id===f).flatMap(c=>c.chapters.flatMap(ch=>ch.stations)))]
  m.structures.push({kind:'settlementstation',x:npc.x+.6,y:npc.y,w:.4,h:.3,solid:false,floor:npc.floor,data:{label:`${def!.name} · 协作工单`,room:`legacy_${npc.id}`,faction:f,services,access:0}});done.add(f)
 }
}



