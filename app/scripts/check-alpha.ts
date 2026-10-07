import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { ALPHA_BLUEPRINT as b, ALPHA_DISTRICTS, ALPHA_ENTRIES, ALPHA_LIGHTS, ALPHA_DOORWAYS, ALPHA_PLACEMENT_CLEARANCES, ALPHA_REMOVED_DOOR_PROPS } from '../src/game/content/alphaBlueprint'
import { alphaRegionAt, alphaRegionRooms, alphaRegionBounds, ALPHA_MAP_REGIONS } from '../src/game/content/alphaMap'
import { ALPHA_DEFS, alphaParts, isAlphaKind } from '../src/game/content/alphaDecor'
import { archiveCodeIndex } from '../src/game/content/alphaArchiveDecor'
import { ARCHIVE_NAMES } from '../src/game/content/alphaArchiveDecor'
import { ADMIN_NAMES } from '../src/game/content/alphaAdminDecor'
import { COMMUNITY_NAMES } from '../src/game/content/alphaCommunityDecor'
import { ALPHA_PEOPLE, ALPHA_COMMUNITY_STAFF, ALPHA_REVISIONS } from '../src/game/content/alphaPeople'
import { NPCS, npcAvatar } from '../src/game/content/npcs'
import { alphaWorldParts, blocksAlphaDoor } from '../src/game/content/alphaPlacement'
import { DECOR_REGISTRY } from '../src/game/content/decorRegistry'
import { generateLevel, enableRuntimeStructCollisionIndex, structColliders, ceilingHeightAt, structStandTopAt } from '../src/game/world/mapgen'
import { canOccupy, moveStep, PLAYER_RADIUS } from '../src/game/core/player'
import { levelDefOf } from '../src/game/levels'
let checks=0
const check=(condition:unknown,message:string)=>{checks++;assert(condition,message)}
const m=generateLevel(levelDefOf(101)!,424242,true)
enableRuntimeStructCollisionIndex(m)
check(m.w===152&&m.h===152,'expanded authored map')
check(m.exits.length===3&&m.exits.every(e=>e.def.dest==='back'),'all three exits retain L1 return behavior')
check(!m.items.length&&!m.entities.length,'settlement remains safe and does not spawn loot')
const wing=ALPHA_DISTRICTS[0]
for(const id of ['radio','meeting']){const r=b.rooms.find(r=>r.id===id)!;check(r.x>wing.x+10&&r.x+r.w<wing.x+wing.w-8&&r.y>wing.y+15&&r.y+r.h<wing.y+wing.h-8,id+' central in exploration wing')}
check(b.rooms.filter(r=>r.id.startsWith('duty_dorm_')).length===4,'four separate duty dormitories')
check(b.rooms.filter(r=>r.id.startsWith('equipment')).length===2,'two peripheral storage rooms')
check(b.rooms.some(r=>r.id==='duty_clinic')&&b.rooms.some(r=>r.id==='duty_dining'),'living wing has medical and dining rooms')
const assembly=b.rooms.find(r=>r.id==='assembly')!
check(assembly.enclosed&&b.rooms.filter(r=>r.id!=='assembly'&&!r.id.endsWith('_hall')).every(r=>r.w*r.h<assembly.w*assembly.h),'assembly is the largest actual room')
check(b.decorations!.filter(s=>s.kind==='alpha_hall_seat').length===128,'128 tiered auditorium seats')
check(alphaRegionRooms('administration').length===5,'administration map shows all five rooms including trade annex')
for(const s of b.decorations!.filter(s=>s.kind in ADMIN_NAMES)){
 const r=b.rooms.find(r=>r.id===s.data?.room)!
 check(!!r,'administration furnishing has an owning room '+s.kind)
 for(const p of alphaWorldParts(s))check(p.x>=r.x+.17&&p.y>=r.y+.17&&p.x+p.w<=r.x+r.w-.17&&p.y+p.h<=r.y+r.h-.17&&p.top<=r.height,'administration furnishing stays inside walls '+r.id+'/'+s.kind)
}
for(const direction of [1,-1]){
 const p={x:90,y:direction===1?12:31},end=direction===1?31:12;let z=0,highest=0
 while(Math.abs(p.y-end)>.051){
  const moved=moveStep(m,p,0,.05*direction,PLAYER_RADIUS,{z,band:0})
  check(Math.abs(moved.y)>.049,'walk auditorium centre stair '+p.y.toFixed(2))
  z=Math.max(0,structStandTopAt(m,p.x,p.y,z,0));highest=Math.max(highest,z)
  check(canOccupy(m,p.x,p.y,PLAYER_RADIUS,{z,band:0}),'clear body on auditorium stair')
 }
 check(Math.abs(highest-.96)<.001&&z===0,'auditorium stair rises to 0.96 m and returns to floor')
}
for(const x of [80,100])for(let y=12;y<31;y+=.2)check(canOccupy(m,x,y,PLAYER_RADIUS,{z:0,band:0}),'auditorium side aisle')
const occupy=(x:number,y:number)=>canOccupy(m,x,y,PLAYER_RADIUS,{z:0,band:0,crouch:false})
check(occupy(m.spawn.x,m.spawn.y),'safe arrival')
check(b.rooms.filter(r=>r.id.startsWith('research_office_')).length===3,'three separate compact researcher offices')
for(const id of ['sample','botany','microbiology','research_reagents','research_specimens','cold_samples'])check(b.rooms.some(r=>r.id===id&&r.enclosed),'enclosed research function '+id)
check(alphaRegionRooms('research').length===9,'research map subdivides three labs, three offices and three stores')
check(alphaRegionAt(128,48)==='anemoia'&&alphaRegionAt(40,75)==='epiphany'&&alphaRegionAt(69,48)==='archives','annexes share their named district')
for(const r of ALPHA_MAP_REGIONS){
 const bounds=alphaRegionBounds(r.id),rooms=alphaRegionRooms(r.id)
 check(bounds.w>0&&bounds.h>0&&rooms.length>0,'map region has detail '+r.id)
 for(const room of rooms)check(alphaRegionAt(room.x+room.w/2,room.y+room.h/2)===r.id,'room belongs to map region '+room.id)
}
for(const entry of ALPHA_ENTRIES){
 check(alphaRegionAt(entry.exit.x+.5,entry.exit.y+.5)===entry.id,'return exit belongs to independent vestibule '+entry.id)
 check(Math.hypot(entry.exit.x+.5-m.spawn.x,entry.exit.y+.5-m.spawn.y)>4,'spawn cannot immediately trigger return '+entry.id)
 const rad=entry.mount.deg*Math.PI/180,nx=Math.round(Math.sin(rad)),ny=Math.round(Math.cos(rad))
 for(const offset of [-.4,0,.4])for(let distance=.7;distance<2.01;distance+=.1)check(occupy(entry.mount.x+nx*distance+ny*offset,entry.mount.y+ny*distance-nx*offset),'outer entrance approach '+entry.id)
}
check(!b.decorations!.some(s=>s.kind==='labbench'),'research replaces generic laboratory furniture')
check(b.decorations!.filter(s=>s.kind==='alpha_sample_rack').length>=7,'classified sample, reagent and instrument storage')
check(alphaRegionRooms('archives').length===5,'archive map shows two offices, tech, public archive and controlled records')
for(const id of ['query','archives_office_b']){
 const r=b.rooms.find(r=>r.id===id)!;check(r.enclosed&&r.w*r.h>=80,'spacious separate archivist office '+id)
 check(b.decorations!.filter(s=>s.kind==='alpha_archive_cubicle'&&s.data?.room===id).length===4,'four furnished cubicles '+id)
}
check(b.decorations!.filter(s=>s.kind==='alpha_tech_bench').length===3,'three multi-monitor software workstations')
const archiveBanks=b.decorations!.filter(s=>s.kind==='alpha_archive_bank'),locations=new Map<string,{x:number;y:number;z:number}>()
for(const bank of archiveBanks){
 const parts=alphaParts(bank),world=alphaWorldParts(bank)
 parts.forEach((p,i)=>{if(p.panel==='archive_code'){
  check(!locations.has(p.text!),'unique physical archive code '+p.text);check(archiveCodeIndex(p.text!)<480,'atlas slot '+p.text)
  locations.set(p.text!,{x:world[i].x,y:world[i].y,z:p.z})
  check(Math.abs(p.z-(.333+(Number(p.text![1])-1)*.43))<.001,'bottom-up drawer row '+p.text)
 }})
}
for(const aisle of ['A','B','C'])for(let row=1;row<=5;row++)for(let col=1;col<=24;col++)check(locations.has(`${aisle}${row}${String(col).padStart(2,'0')}`),'complete archive index '+aisle+row+col)
check(locations.get('A124')!.z<.5&&locations.get('A124')!.y>locations.get('A123')!.y,'A124 is bottom row, horizontal position 24')
for(const x of [56.8,59.4,62])for(let y=20.6;y<30.6;y+=.2)check(occupy(x,y),'walkable full archive aisle '+x+','+y)
for(const y of [20.56,30.75])for(let x=56.6;x<64.4;x+=.2)check(occupy(x,y),'connected archive cross aisle '+x+','+y)
// A swept player-radius flood, including sub-tile walls and furnished room entrances.
const flood=()=>{const start=Math.floor(m.spawn.y)*m.w+Math.floor(m.spawn.x),seen=new Set([start]),q=[start]
 for(let j=0;j<q.length;j++){const i=q[j],x=i%m.w+.5,y=Math.floor(i/m.w)+.5;for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){const nx=x+dx,ny=y+dy,k=Math.floor(ny)*m.w+Math.floor(nx);if(nx<0||ny<0||nx>=m.w||ny>=m.h||seen.has(k))continue;if([.2,.4,.6,.8,1].every(t=>occupy(x+dx*t,y+dy*t))){seen.add(k);q.push(k)}}}return seen}
const seen=flood(),near=(set:Set<number>,x:number,y:number,r:number)=>{for(let yy=Math.floor(y-r);yy<=y+r;yy++)for(let xx=Math.floor(x-r);xx<=x+r;xx++)if(Math.hypot(xx+.5-x,yy+.5-y)<=r&&set.has(yy*m.w+xx))return true;return false}
for(const exit of m.exits)check(near(seen,exit.x+.5,exit.y+.5,1),'reachable '+exit.def.name)
for(const s of b.services.filter(s=>!s.access))check(near(seen,s.x,s.y,2.5),'reachable service '+s.id)
for(const r of b.rooms.filter(r=>!r.access))check(near(seen,r.x+r.w/2,r.y+r.h/2,3.5),'reachable room '+r.id)
for(const id of ['nightingale','justin','kat','river','faust','suanpan','brandt'])check(m.npcs!.some(n=>n.id===id),'story contact '+id)
for(const door of m.structures.filter(s=>s.data?.careerDoor)){door.solid=false;door.data!.open=1}
enableRuntimeStructCollisionIndex(m);const qualified=flood()
for(const s of b.services)check(near(qualified,s.x,s.y,2.5),'qualified service '+s.id)
check(!m.structures.some(s=>s.kind==='settlementstation'),'no floating service objects remain')
check(m.structures.filter(s=>s.data?.facility).length===b.services.length,'all services bound to physical furnishings')
for(const door of ALPHA_DOORWAYS){
 const horizontal=door.side==='n'||door.side==='s'
 for(const offset of [-.4,0,.4])for(let distance=-1.2;distance<=1.21;distance+=.15){
  const x=door.cx+(horizontal?offset:distance),y=door.cy+(horizontal?distance:offset)
  check(occupy(x,y),`full doorway approach ${door.room}/${door.side} at ${x.toFixed(2)},${y.toFixed(2)}`)
 }
 const probe={kind:'alpha_desk' as const,x:door.cx-.5,y:door.cy-.3,w:1,h:.6,solid:true}
 check(blocksAlphaDoor(probe,ALPHA_DOORWAYS),'door placement guard rejects desk '+door.room)
}
// Door liners must cover the dressed wall cut, not share its exposed plane.
// Include non-collidable wainscot/rails: walking checks alone cannot catch their z-fighting.
const timberFrames=b.decorations!.filter(s=>s.kind==='alpha_wall'&&s.data?.skin==='door_frame')
const wallCuts=b.decorations!.filter(s=>s.kind==='alpha_wall'&&String(s.data?.skin).startsWith('res_')).flatMap(alphaWorldParts)
let framedDoorCount=0
for(const door of ALPHA_DOORWAYS){
 const horizontal=door.side==='n'||door.side==='s'
 const frames=timberFrames.filter(s=>Math.abs(horizontal?s.y+s.h/2-door.cy:s.x+s.w/2-door.cx)<.001&&Math.hypot(s.x+s.w/2-door.cx,s.y+s.h/2-door.cy)<1.2)
 if(!frames.length)continue
 framedDoorCount++;check(frames.length===3,'three continuous timber frame members '+door.room+'/'+door.side)
 const opening={x:door.cx-(horizontal?.904:.13),y:door.cy-(horizontal?.13:.904),w:horizontal?1.808:.26,h:horizontal?.26:1.808}
 const overlap=(p:{x:number;y:number;w:number;h:number})=>p.x<opening.x+opening.w-1e-5&&p.x+p.w>opening.x+1e-5&&p.y<opening.y+opening.h-1e-5&&p.y+p.h>opening.y+1e-5
 check(!wallCuts.some(p=>overlap(p)&&p.bottom<2.304&&p.top>0),'wall cut and mouldings recessed behind wood liner '+door.room+'/'+door.side)
 const jambs=frames.filter(s=>Number(s.data?.z??0)===0),header=frames.find(s=>Number(s.data?.z)===2.3)
 const spans=jambs.map(s=>horizontal?[s.x,s.x+s.w]:[s.y,s.y+s.h]).sort((a,b)=>a[0]-b[0])
 check(spans.length===2&&Math.abs(spans[1][0]-spans[0][1]-1.8)<1e-6&&!!header,'finished opening remains 1.8 m by 2.3 m '+door.room+'/'+door.side)
}
check(framedDoorCount>=26,'all residential door frames covered by geometry regression')
for(const s of b.decorations!.filter(s=>s.kind==='alpha_board'||s.kind==='alpha_blinds')){
 const r=b.rooms.find(r=>r.id===s.data?.room)!
 check(!!r,'wall-mounted component has owning room')
 for(const p of alphaWorldParts(s))check(p.x>=r.x-.001&&p.y>=r.y-.001&&p.x+p.w<=r.x+r.w+.001&&p.y+p.h<=r.y+r.h+.001&&p.top<=r.height,'mounted component fits '+r.id+'/'+s.kind)
 if(s.kind==='alpha_blinds'){
  check(alphaParts(s).some(p=>p.surface==='glass'&&p.solid),'real collidable pane '+r.id)
  const y=s.y+s.h/2,z=Number(s.data?.z)+Number(s.data?.height)/2,x=r.x+r.w-.09
  check(!m.structures.filter(s=>s.kind==='alpha_wall').some(wall=>structColliders(wall).some(p=>x>p.x0+.001&&x<p.x1-.001&&y>p.y0+.001&&y<p.y1-.001&&z>(p.bottom??0)&&z<p.top)),'glass aperture is not backed by an opaque wall '+r.id)
 }
}
for(const s of b.decorations!)check(!blocksAlphaDoor(s,ALPHA_PLACEMENT_CLEARANCES),'no prop in door approach '+s.kind)
check(ALPHA_REMOVED_DOOR_PROPS.length===0,'authored props already respect clearances; none needs automatic omission')
// Corridor additions must stay outside enclosed rooms and retain continuous public passage.
const communityProps=b.decorations!.filter(s=>s.data?.community),walls=b.decorations!.filter(s=>s.kind==='alpha_wall').flatMap(alphaWorldParts)
check(communityProps.length>=60,'corridor activity pockets are furnished')
for(const kind of Object.keys(COMMUNITY_NAMES))check(communityProps.some(s=>s.kind===kind),'community prop placed '+kind)
for(const s of communityProps){
 check(!b.rooms.some(r=>r.enclosed&&!r.id.startsWith('entry_')&&s.x+s.w/2>r.x+.18&&s.x+s.w/2<r.x+r.w-.18&&s.y+s.h/2>r.y+.18&&s.y+s.h/2<r.y+r.h-.18),'corridor prop stays outside enclosed rooms '+s.kind+'/'+s.data?.community)
 for(const p of alphaWorldParts(s).filter(p=>p.solid))check(!walls.some(q=>q.solid&&p.x<q.x+q.w-.01&&p.x+p.w>q.x+.01&&p.y<q.y+q.h-.01&&p.y+p.h>q.y+.01&&p.bottom<q.top-.01&&p.top>q.bottom+.01),'community furnishing does not pierce walls '+s.kind+'/'+s.data?.community)
}
for(let x=31.5;x<79;x+=.4)for(const y of [106,106.5,107])check(occupy(x,y),'continuous south promenade')
check(m.npcs!.length>=29&&new Set(m.npcs!.map(n=>n.id)).size===m.npcs!.length,'larger distinct Alpha population')
for(const anchor of ALPHA_COMMUNITY_STAFF){
 const n=m.npcs!.find(n=>n.id===anchor.id)!,def=NPCS[anchor.id]
 check(!!n&&occupy(n.x,n.y),'authored community resident safely placed '+anchor.id)
 check(Math.hypot(n.x-anchor.x,n.y-anchor.y)<1.1,'resident remains beside assigned activity '+anchor.id)
 check(!ALPHA_PLACEMENT_CLEARANCES.some(r=>n.x>r.x-.22&&n.x<r.x+r.w+.22&&n.y>r.y-.22&&n.y<r.y+r.h+.22),'resident leaves door approach empty '+anchor.id)
 check(!!def.communityGear&&def.idle.length>=3&&def.lines.length>=4,'resident has accessories and individual conversations '+anchor.id)
 check(JSON.stringify(npcAvatar(def))!==JSON.stringify(npcAvatar(NPCS.justin)),'resident custom appearance '+anchor.id)
}
for(const id of [...Object.keys(ALPHA_PEOPLE),...Object.keys(ALPHA_REVISIONS)]){
 const def=NPCS[id],seen=new Set<number>(),queue=[0]
 while(queue.length){const i=queue.shift()!;if(seen.has(i))continue;seen.add(i);const node=def.lines[i];check(!!node,'dialogue target exists '+id+'/'+i);check(node.opts.some(o=>o.action==='leave'||o.action==='trade'||o.next!==undefined),'dialogue has an exit '+id+'/'+i)
  for(const o of node.opts){if(o.next!==undefined){check(Number.isInteger(o.next)&&o.next>=0&&o.next<def.lines.length,'valid dialogue link '+id);queue.push(o.next)}if(o.action==='trade')check(!!def.trade?.length||!!def.barter?.length,'trade action retains shop '+id)}
 }
 check(seen.size===def.lines.length,'all authored conversation branches reachable '+id)
}
check(NPCS.suanpan.warehouse==='meg'&&!!NPCS.suanpan.trade?.length,'quartermaster retains inventory and warehouse services')
for(const s of b.decorations!.filter(s=>s.kind in ARCHIVE_NAMES)){
 const r=b.rooms.find(r=>r.id===s.data?.room)!
 check(!!r,'archive furniture has an owning room '+s.kind)
 for(const p of alphaWorldParts(s))check(p.x>=r.x+.17&&p.y>=r.y+.17&&p.x+p.w<=r.x+r.w-.17&&p.y+p.h<=r.y+r.h-.17&&p.top<=r.height,'archive furniture stays inside walls '+r.id+'/'+s.kind)
}

// Resident facilities are actual furnished rooms; retained services remain reachable.
for(const district of ['anemoia','crimson','epiphany','river','zephyr'])check(b.rooms.filter(r=>r.id.startsWith(district+'_home_')).length>=4,'multiple independent homes '+district)
check(b.decorations!.filter(s=>s.kind==='alpha_mushroom_block').length===80,'floor-grown mushroom blocks in two cultivation batches')
check(b.decorations!.filter(s=>s.kind==='alpha_library_shelf').length===24,'dense double-sided library stacks')
check(b.decorations!.filter(s=>s.kind==='alpha_library_terminal').length===4,'four multimedia computer and headphone desks')
check(b.decorations!.some(s=>s.kind==='alpha_memorial'&&s.data?.room==='river_services'),'Asher River memorial in River district')
for(const x of [112,112.5,113])for(let y=13.5;y<28;y+=.2)check(occupy(x,y),'clear mushroom harvesting aisle')
for(const x of [44.5,45,45.5])for(let y=84;y<99.5;y+=.2)check(occupy(x,y),'clear library central aisle')
for(const x of [92.5,93,93.5])for(let y=83.5;y<124;y+=.2)check(occupy(x,y),'continuous Zephyr residential corridor')
for(const s of b.decorations!.filter(s=>s.data?.room&&(['anemoia','crimson','epiphany','river','zephyr'].some(prefix=>String(s.data?.room).startsWith(prefix))||s.data?.room==='library'||s.data?.room==='community_dining'))){
 const r=b.rooms.find(r=>r.id===s.data?.room)!
 for(const p of alphaWorldParts(s))check(p.x>=r.x+.16&&p.y>=r.y+.16&&p.x+p.w<=r.x+r.w-.16&&p.y+p.h<=r.y+r.h-.16&&p.top<=r.height+.001,'resident furniture within room '+r.id+'/'+s.kind)
}
for(const kind of ['alpha_floor','alpha_wall','alpha_ceiling'])check(b.decorations!.some(s=>s.kind===kind&&s.data?.skin==='aquila'),'Aquila concrete on boundary '+kind)
check(b.decorations!.some(s=>s.kind==='alpha_light'&&s.data?.skin==='louvered'),'louvered fluorescent fixtures')
for(const d of ALPHA_DEFS){
 const entry=DECOR_REGISTRY.find(e=>e.id===d.id);check(entry&&!entry.container&&entry.levels.includes('据点101'),'registered non-loot prop '+d.id)
 const s={kind:d.id,x:10,y:10,w:d.w,h:d.d,solid:d.solid,data:{height:d.height,deg:90}}
 const parts=alphaParts(s);check(parts.length>0&&parts.every(p=>[p.x,p.y,p.z,p.w,p.d,p.h].every(Number.isFinite)&&p.w>0&&p.d>0&&p.h>0),'valid mesh '+d.id)
 check(!d.solid||structColliders(s).length>0,'collision '+d.id)
 check(structColliders({...s,solid:false}).length===0,'non-solid override '+d.id)
}
for(const s of b.decorations!)check(DECOR_REGISTRY.some(d=>d.id===s.kind),'placed decoration registered '+s.kind)
for(const l of ALPHA_LIGHTS)check(l.noFix===1&&l.fixZ!<ceilingHeightAt(m,l.x,l.y,3,0)&&l.fixZ!>.2,'fixture below room ceiling '+l.x+','+l.y)
const parts=b.decorations!.filter(s=>isAlphaKind(s.kind)).flatMap(alphaParts)
check(parts.some(p=>p.panel==='clock')&&parts.some(p=>p.panel==='radio'),'analogue rack instruments')
const manifest=JSON.parse(readFileSync('public/textures/alpha/manifest.json','utf8'))
for(const asset of manifest.assets){const bytes=readFileSync('public/textures/alpha/'+asset.file);check(bytes.length===asset.bytes&&createHash('sha256').update(bytes).digest('hex')===asset.sha256,'asset hash '+asset.file)}
console.log(`Alpha: ${checks} checks passed; ${seen.size} public and ${qualified.size} qualified walk cells, ${ALPHA_DEFS.length} registered components, ${ALPHA_LIGHTS.length} lights.`)
