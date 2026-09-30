import { CAREERS } from '../content/careers'
import { NPCS, genRandomNpcs } from '../content/npcs'
import { RNG } from '../core/rng'
import type { GameMap } from './mapgen'
import type { LevelDef } from '../core/types'
import type { RoomSpec, SettlementBlueprint, SurfaceMaterial, Rect } from '../content/settlementTypes'
export interface Furnishing {x:number;y:number;w:number;d:number;z:number;h:number;color:string;material:SurfaceMaterial;solid?:boolean}
export function settlementCeiling(m:GameMap,x:number,y:number){
 const s=m.settlement!,i=Math.floor(y)*m.w+Math.floor(x),roof=s.blueprint.shells[s.roofIndex[i]]
 if(roof?.roof==='vault')return roof.height-.75+.75*Math.sqrt(Math.max(0,1-((x%5-2.5)/2.5)**2))
 return s.heights[i]
}
// The same authored furniture components drive both rendering and collision.
export function furnishings(r:RoomSpec):Furnishing[]{
 const a:Furnishing[]=[]
 const box=(x:number,y:number,w:number,d:number,z:number,h:number,material:SurfaceMaterial,color:string,solid=false)=>a.push({x:r.x+x,y:r.y+y,w,d,z,h,material,color,solid})
 const table=(x:number,y:number,w:number,d:number,mat:SurfaceMaterial='wood')=>{
  box(x,y,w,d,.74,.09,mat,mat==='wood'?'#c6aa82':'#c3cccb',true)
  for(const dx of [0,w-.08])for(const dy of [0,d-.08])box(x+dx,y+dy,.08,.08,0,.74,'metal','#666e70')
 }
 const chair=(x:number,y:number)=>{box(x,y,.5,.5,.43,.12,'fabric','#746b5b',true);box(x,y+.43,.5,.07,.55,.4,'fabric','#746b5b');for(const dx of [0,.43])box(x+dx,y,.07,.5,0,.43,'metal','#686c69')}
 for(const p of r.furniture??[]){
  const {x,y}=p,w=p.w??2,d=p.d??.8
  switch(p.kind){
   case 'table':case 'desk':case 'lab':
    table(x,y,w,d,p.kind==='lab'?'metal':'wood')
    if(p.kind==='desk'){box(x+.3,y+.15,.7,.16,.85,.5,'dark','#243233');box(x+.35,y+.32,.6,.03,.9,.36,'paint','#87aba6');chair(x+.5,y+d+.7)}
    if(p.kind==='lab')for(let j=.4;j<w-.5;j+=1.7){box(x+j,y+.2,.3,.3,.84,.2,'paint','#91a9a1');box(x+j+.4,y+.2,.08,.08,.84,.5,'metal','#858f8b');box(x+j+.3,y+.2,.3,.2,1.25,.12,'dark','#303a3a')}
    if(p.seats){const n=Math.ceil(p.seats/2);for(let i=0;i<n;i++){chair(x+(i+.5)*w/n-.25,y-.85);if(i+n<p.seats)chair(x+(i+.5)*w/n-.25,y+d+.45)}}
    break
   case 'counter':
    box(x,y,w,d,0,1,'wood','#bba17f',true);box(x-.03,y-.03,w+.06,d+.06,1,.08,'metal','#ced0bd')
    if(p.seats)for(let i=0;i<p.seats;i++){box(x-.85,y+(i+.5)*d/p.seats,.4,.4,.77,.12,'fabric','#7d4c40',true);box(x-.71,y+(i+.5)*d/p.seats+.14,.1,.1,0,.77,'metal','#6a6c65')}
    break
   case 'shelf':case 'radio':case 'locker':case 'fridge':{
    const height=p.kind==='fridge'?2.1:2
    if(p.kind==='locker'||p.kind==='fridge')box(x,y,w,d,0,height,'metal',p.kind==='fridge'?'#d8ddd6':'#788681',true)
    else{
     box(x,y,.07,d,0,height,'metal','#777f7d',true);box(x+w-.07,y,.07,d,0,height,'metal','#777f7d',true)
     for(let j=0;j<5;j++){box(x,y,w,d,j*.4,.06,'metal','#777f7d',true);for(let k=.15;k<w-.4;k+=.8)box(x+k,y+.08,.6,d-.1,j*.4+.07,.28,p.kind==='radio'?'dark':'wood',p.kind==='radio'?'#35434a':'#baa27a')}
    }
    for(let k=.4;k<w;k+=.9)box(x+k,y+d,.08,.04,.8,.4,'metal','#b7b6a4')
    break
   }
   case 'bed':
    box(x,y,1.2,2.1,.2,.25,'wood','#a89272',true);box(x+.02,y+.02,1.16,2.06,.45,.2,'fabric','#d6d4bf')
    box(x+.1,y+.1,1,.4,.65,.12,'fabric','#ede7cd');box(x+.02,y+.9,1.16,1.15,.65,.04,'fabric','#688c89');break
   case 'sofa':case 'booth':
    box(x,y,w,.8,.28,.3,'fabric',p.kind==='booth'?'#754b45':'#8a8873',true);box(x,y,w,.14,.58,.6,'fabric',p.kind==='booth'?'#754b45':'#8a8873')
    if(p.kind==='booth'){table(x,y+1,w,.65);chair(x+.4,y+2.1)}break
   case 'sink':case 'stove':
    box(x,y,w,d,0,.88,'metal','#bfc7c3',true)
    for(let i=.2;i<w-.3;i+=1.2)box(x+i,y+.1,.75,d-.2,.88,.06,'dark','#4b605e')
    if(p.kind==='sink'){box(x+.5,y,.06,.06,.88,.4,'metal','#bac6c1');box(x+.5,y,.06,.3,1.24,.06,'metal','#bac6c1')}
    else{box(x,y,w,d,2.05,.35,'metal','#7f8986');box(x+w/2-.2,y,.4,.4,2.4,.7,'metal','#7f8986')}break
   case 'board':box(x,y,w,.08,1.15,1.25,'paint','#344f50');break
   case 'screen':box(x,y,w,d,.15,1.65,'fabric','#adc2b8',true);break
   case 'planter':
    box(x,y,w,d,0,.55,'concrete','#9d9c88',true)
    for(let i=.2;i<w-.1;i+=.4)box(x+i,y+.15,.25,Math.max(.2,d-.3),.55,.25+(i%1)*.5,'leaf','#567343')
    break
  }
 }
 return a
}
export function settlementColumns(b:SettlementBlueprint){
 const shell=b.shells[0],a:{x:number;y:number;height:number}[]=[]
 if(b.id==='tom'||b.decorations)return a
 const step=b.id==='ariane'?5:10
 for(let y=shell.y+5;y<shell.y+shell.h-2;y+=step)for(let x=shell.x+5;x<shell.x+shell.w-2;x+=step){
  if(b.rooms.some(r=>r.enclosed&&x>r.x-2&&x<r.x+r.w+2&&y>r.y-2&&y<r.y+r.h+2)||b.circulation.some(r=>x>r.x-.7&&x<r.x+r.w+.7&&y>r.y-.7&&y<r.y+r.h+.7)||b.services.some(s=>Math.hypot(s.x-x,s.y-y)<2.5))continue
  a.push({x,y,height:shell.height})
 }
 return a
}
export function genSettlement(m:GameMap,def:LevelDef,b:SettlementBlueprint){
 m.tiles.fill(2);m.npcs=[];m.zones=[]
 const heights=new Float32Array(m.w*m.h).fill(3.6),roomIndex=new Int16Array(m.w*m.h).fill(-1),roofIndex=new Int16Array(m.w*m.h).fill(-1)
 const paint=(r:Rect,fn:(i:number)=>void)=>{for(let y=Math.floor(r.y);y<Math.ceil(r.y+r.h);y++)for(let x=Math.floor(r.x);x<Math.ceil(r.x+r.w);x++)if(x>=0&&y>=0&&x<m.w&&y<m.h)fn(y*m.w+x)}
 for(const r of b.corridors)paint(r,i=>m.tiles[i]=1)
 b.shells.forEach((r,ri)=>paint(r,i=>{m.tiles[i]=1;heights[i]=r.height;roofIndex[i]=ri}))
 b.rooms.forEach((r,ri)=>{
  paint(r,i=>roomIndex[i]=ri)
  m.zones!.push({name:r.name,x:r.x+r.w/2,y:r.y+r.h/2,x0:r.x,y0:r.y,x1:r.x+r.w,y1:r.y+r.h})
  for(const p of furnishings(r))if(p.solid)m.structures.push({kind:'settlementprop',x:p.x,y:p.y,w:p.w,h:p.d,solid:true,data:{height:p.z+p.h}})
 })
 m.settlement={blueprint:b,heights,roomIndex,roofIndex}
 if(b.decorations)m.structures.push(...structuredClone(b.decorations))
 for(const p of b.partitions)m.structures.push({kind:'settlementprop',x:p.x,y:p.y,w:p.w,h:p.h,solid:true,data:{height:(p.bottom??0)+p.height,bottom:p.bottom??0,partition:1}})
 for(const p of settlementColumns(b))m.structures.push({kind:'settlementprop',x:p.x-.3,y:p.y-.3,w:.6,h:.6,solid:true,data:{height:p.height,partition:1}})
 for(const d of b.doors)m.structures.push({kind:'hoteldoor',x:d.x,y:d.y,w:d.w,h:d.h,solid:true,data:{careerDoor:1,settlementDoor:1,height:d.height,axis:d.axis,access:d.access,faction:b.faction,open:0}})
 const clear=(x:number,y:number)=>m.tiles[Math.floor(y)*m.w+Math.floor(x)]===1&&!m.structures.some(s=>s.solid&&Number(s.data?.bottom??0)<1.8&&x>s.x-.45&&x<s.x+s.w+.45&&y>s.y-.45&&y<s.y+s.h+.45)&&!m.npcs!.some(n=>Math.hypot(n.x-x,n.y-y)<1.5)
 for(const s of b.services){
  if(!b.decorations)m.structures.push({kind:'settlementstation',x:s.x,y:s.y,w:.2,h:.2,solid:false,data:{room:s.zone,label:s.label,services:s.services,service:s.services[0],faction:b.faction,access:s.access??0,npc:s.npc??'',mount:s.mount??'counter'}})
  if(s.npc&&NPCS[s.npc]&&!m.npcs!.some(n=>n.id===s.npc)){
   let placed=false
   for(let radius=1;radius<5&&!placed;radius+=.5)for(let j=0;j<8&&!placed;j++){const x=s.x+Math.cos(j*Math.PI/4)*radius,y=s.y+Math.sin(j*Math.PI/4)*radius;if(clear(x,y)){m.npcs!.push({id:s.npc,x,y});placed=true}}
  }
 }
 // Story contacts must survive replacement of legacy outpost layouts. Place them before residents.
 for(const person of b.staff??[]){
  if(!NPCS[person.id]||m.npcs!.some(n=>n.id===person.id))continue
  let placed=false
  for(let radius=0;radius<=3&&!placed;radius+=.5)for(let j=0;j<16&&!placed;j++){
   const x=person.x+Math.cos(j*Math.PI/8)*radius,y=person.y+Math.sin(j*Math.PI/8)*radius
   if(clear(x,y)){m.npcs!.push({id:person.id,x,y});placed=true}
  }
 }
 // Lighting follows common ceiling runs. Table lamps are local in the small restaurant.
 for(let y=3;y<m.h-2;y+=b.id==='tom'?6:6)for(let x=3;x<m.w-2;x+=6){
  const i=y*m.w+x;if(m.tiles[i]!==1)continue
  m.lights.push({x:x+.5,y:y+.5,r:7,color:b.id==='tom'?'#ffdbad':'#e5e6d9',fixZ:settlementCeiling(m,x+.5,y+.5)-.25,flickerSeed:x+y,keep:1})
 }
 b.exits.forEach((p,i)=>m.exits.push({...p,def:def.exits[i%def.exits.length],discovered:true}))
 const rng=new RNG(b.level*104729),people=genRandomNpcs(()=>rng.next(),b.id==='alpha'?12:8,b.id==='bntg'?'bntg':b.id==='ariane'?'ariane':b.id==='tom'?'mixed':'meg')
 const zones=b.rooms.filter(r=>!r.enclosed&&['residential','dining','market','classroom','office','library','intake'].includes(r.style))
 m.npcDefs??=[]
 people.forEach((person,i)=>{
  const r=zones[i%zones.length];person.id='settlement_'+b.level+'_resident_'+i
  if(b.id==='cornucopia'){person.faction='argos';person.role=i%2?'巡逻队员':'案卷协作员';person.background='在旧贸易设施改建的丰饶角轮值。'}
  for(let y=r.y+1.5;y<r.y+r.h-1;y++)for(let x=r.x+1.5;x<r.x+r.w-1;x++)if(clear(x,y)){m.npcDefs!.push(person);m.npcs!.push({id:person.id,x,y});return}
 })
 m.spawn={...b.spawn}
 if(b.id==='bntg'){
  for(const [id,name,role,x,y] of [['bntg_guard_n','凯恩','TGPF 库区警备',36,26],['bntg_guard_s','艾琳','TGPF 库区警备',44,26],['bntg_employment','莫里斯','雇佣登记',25,16.5],['bntg_dispatch','西蒙','物流调度',14,64.5]] as const){
   const npc=structuredClone(NPCS.dorian);npc.id=id;npc.name=name;npc.role=role;delete npc.trade;delete npc.warehouse;npc.background='在商人之家担任'+role+'，负责本岗位的值班与业务引导。';npc.lines=[{npc:role+'：办理业务请使用对应柜台；职业履历可在图鉴的团体页面查看。',opts:[{text:'明白了。',action:'leave'}]}]
   m.npcDefs!.push(npc);m.npcs!.push({id,x,y})
  }
 }
 return [{cx:b.spawn.x,cy:b.spawn.y},...b.rooms.map(r=>({cx:r.x+r.w/2,cy:r.y+r.h/2}))]
}
/** Existing outposts keep their previous service identities and geometry. */
export function appendLegacyStations(m:GameMap){
 if(m.settlement)return
 const done=new Set<string>()
 for(const npc of m.npcs??[]){
  const def=NPCS[npc.id]??m.npcDefs?.find(d=>d.id===npc.id),f=def?.faction
  if(!f||!(f in CAREERS)||done.has(f))continue
  const services=[...new Set(Object.values(CAREERS).filter(c=>c.id===f).flatMap(c=>c.chapters.flatMap(ch=>ch.stations)))]
  m.structures.push({kind:'settlementstation',x:npc.x+.6,y:npc.y,w:.4,h:.3,solid:false,floor:npc.floor,data:{label:def!.name+' · 协作工单',room:'legacy_'+npc.id,faction:f,services,access:0}});done.add(f)
 }
}
