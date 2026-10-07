import {redZonesNear,insideRedZone,type L0RedProgressMap,type L0RedGate} from '../world/l0RedZone'
import {l0Sample} from '../world/l0Architecture'
import type {Engine} from '../engine'
import type {ChunkDynState} from '../world/infinite'
import {snapshotChunkState,saveExplored,rebuildL0,restitch} from '../world/infinite'
import {genL0Architecture,l0At,l0Inside,l0Meeting,l0Hash,type L0SpaceState,type L0Layout,type L0Wall} from '../world/l0Architecture'
import {type GameMap} from '../world/mapgen'
import {look} from '../renderer/shared'
import {audio} from '../core/audio'
import type {MpEvent} from '../net/protocol'
export interface L0WorldSave {version:1;generationVersion:1|2|3;seed:number;space:L0SpaceState;chunks:[string,ChunkDynState][];taken:number[];explored:[string,number[]][];loops:number}
export interface L0Pending {key:string;layout:L0Layout;revision:number;ready?:boolean;redProgress?:L0RedProgressMap;affected?:string[];closing?:L0RedGate[]}
export function captureL0(eng:Engine):L0WorldSave|undefined{
 const m=eng.map,inf=m?.inf;if(eng.player.level!==0||!m||!inf?.l0)return eng.l0World
 saveExplored(m,eng.explored)
 const chunks=new Map(inf.state)
 for(const c of inf.chunks.values())chunks.set(c.key,snapshotChunkState(m,c))
 // Fresh drops may not yet have crossed a streaming boundary and acquired a chunk owner.
 for(const [key,state]of chunks){const [cx,cy]=key.split(',').map(Number);state.extraItems=m.items.filter(it=>it.id<0x200000&&Math.floor((it.x+inf.ox)/32)===cx&&Math.floor((it.y+inf.oy)/32)===cy).map(it=>({...it,x:it.x+inf.ox,y:it.y+inf.oy})).concat(state.extraItems.filter(it=>!m.items.some(active=>active.id===it.id)&&!inf.chunks.has(key)))}
 return{version:1,generationVersion:3,seed:inf.seed,space:structuredClone(inf.l0),chunks:structuredClone([...chunks]),taken:[...inf.taken],explored:[...inf.explored].map(([k,v])=>[k,[...v]]),loops:eng.l0Loops}
}
export function restoreL0(eng:Engine){
 const m=eng.map,inf=m?.inf,s=eng.l0World;if(!m||!inf?.l0||!s||s.version!==1||s.seed!==inf.seed)return
 if(s.space.trapped&&s.space.space!=='shared'){
  // One-time migration of retired private-room saves into a sealed real enclosure.
  let zone:ReturnType<typeof redZonesNear>[number]|undefined
  for(let radius=0;radius<=180&&!zone;radius++)for(let cy=-radius;cy<=radius&&!zone;cy++)for(let cx=-radius;cx<=radius&&!zone;cx++)if(Math.max(Math.abs(cx),Math.abs(cy))===radius)zone=redZonesNear(s.seed,cx,cy)[0]
  if(!zone)throw Error('No red enclosure available for legacy save')
  const oldDrops=s.chunks.flatMap(([,v])=>v.extraItems),oldLights=s.chunks.flatMap(([,v])=>v.extraLights),shared=eng.l0SharedWorld
  s.chunks=shared?.seed===s.seed?structuredClone(shared.chunks):[];s.taken=[...new Set([...s.taken,...(shared?.taken??[])])];s.explored=shared?.seed===s.seed?structuredClone(shared.explored):[]
  s.space={...s.space,space:'shared',revisions:shared?.space.revisions??{},redProgress:{...(shared?.space.redProgress??{}),[zone.id]:{entered:true,closed:zone.gates.map(g=>g.id),lastSeal:eng.time}}}
  const r=zone.bounds,center={x:r.x+r.w/2,y:r.y+r.h/2}
  const entry=(x:number,y:number)=>{const key=`${Math.floor(x/32)},${Math.floor(y/32)}`;let v=s.chunks.find(c=>c[0]===key)?.[1];if(!v){v={structs:[],extraItems:[],extraLights:[],exitDisc:false};s.chunks.push([key,v])}return v}
  const relocate=(item:{x:number;y:number})=>({x:center.x+((item.x%16+16)%16)-8,y:center.y+((item.y%16+16)%16)-8})
  for(const item of oldDrops){const p=relocate(item),state=entry(p.x,p.y);if(!state.extraItems.some(v=>v.id===item.id))state.extraItems.push({...item,...p})}
  for(const light of oldLights){const p=relocate(light);entry(p.x,p.y).extraLights.push({...light,...p})}
  for(let cy=Math.floor(r.y/32);cy<=Math.floor((r.y+r.h)/32);cy++)for(let cx=Math.floor(r.x/32);cx<=Math.floor((r.x+r.w)/32);cx++){
   const raw=genL0Architecture(eng.levelDef,s.seed,cx,cy,undefined,0,s.space.redProgress)
   s.taken.push(...raw.items.filter(it=>insideRedZone(zone!,it.x,it.y)).map(it=>it.id))
   const state=entry(cx*32,cy*32)
   for(const st of raw.structures)if(!st.data?.l0Wall&&insideRedZone(zone,st.x,st.y)&&typeof st.data?.sid==='number')state.structs.push({sid:st.data.sid,looted:true,data:{lootItems:[]}})
  }
  eng.l0RestorePosition=center;s.generationVersion=2
  eng.msg('旧红室进度已迁入原地图的封闭红室；掉落物保留，围墙保持封闭。','lore')
 }
 if(s.generationVersion!==3){
  // Geometry-only migration: immutable generated supplies keep their old
  // positions/IDs. Move a player drop only if a new partition covers it.
  for(const [key,state]of s.chunks){
   const [cx,cy]=key.split(',').map(Number),layout=genL0Architecture(eng.levelDef,s.seed,cx,cy).l0!
   const safe=(x:number,y:number)=>x>=cx*32+.35&&x<(cx+1)*32-.35&&y>=cy*32+.35&&y<(cy+1)*32-.35&&!layout.walls.some(w=>w.bottom<1.5&&x>w.x-.3&&x<w.x+w.w+.3&&y>w.y-.3&&y<w.y+w.h+.3)&&!layout.pits.some(r=>l0Inside(r,x,y))
   for(const item of [...state.extraItems,...state.extraLights])if(!safe(item.x,item.y)){
    outer:for(let d=.5;d<=12;d+=.5)for(const [dx,dy]of [[d,0],[-d,0],[0,d],[0,-d]])if(safe(item.x+dx,item.y+dy)){item.x+=dx;item.y+=dy;break outer}
   }
  }
  s.generationVersion=3;eng.msg('Level 0 的隔墙布局已更新，物资、搜刮记录与个人进度已保留。','lore')
 }
 inf.l0=structuredClone(s.space);inf.l0.unseen={};inf.state=new Map(structuredClone(s.chunks));inf.taken=new Set(s.taken);inf.explored=new Map(s.explored.map(([k,v])=>[k,new Uint8Array(v)]));eng.l0Loops=s.loops;rebuildL0(m,eng.levelDef,eng.explored)
}
/** Kept as an engine entry point; red rooms are now ordinary shared-world geometry. */
export function enterL0Red(eng:Engine){
 const inf=eng.map?.inf;if(!inf?.l0)return
 const x=eng.player.x+inf.ox,y=eng.player.y+inf.oy
 for(const z of redZonesNear(inf.seed,Math.floor(x/32),Math.floor(y/32)))if(insideRedZone(z,x,y,.35)){
  const progress=inf.l0.redProgress??={},old=progress[z.id]
  if(!old?.entered){progress[z.id]={closed:old?.closed??[],entered:true,lastSeal:eng.time};eng.l0Blur=.35;eng.msg('墙纸的背面泛着红色。你刚才经过的开口似乎少了几个。','lore')}
 }
}
/** Conservative horizontal frustum plus actual wall occlusion. Close only unseen apertures. */
export function l0GateObserved(eng:Engine,gate:L0RedGate){
 const m=eng.map!,inf=m.inf!,px=eng.player.x+inf.ox,py=eng.player.y+inf.oy
 if(Math.hypot(px-gate.x-gate.w/2,py-gate.y-gate.h/2)<1.4)return true
 for(const [x,y]of [[gate.x+.02,gate.y+.02],[gate.x+gate.w-.02,gate.y+gate.h-.02],[gate.x+gate.w/2,gate.y+gate.h/2]]){
  const dx=x-px,dy=y-py,d=Math.hypot(dx,dy)
  if((dx*-Math.sin(look.yaw)+dy*-Math.cos(look.yaw))/Math.max(.01,d)<Math.cos(75*Math.PI/180))continue
  const blocked=m.structures.some(s=>{
   if(!s.data?.l0Wall||Number(s.data.bottom)>1.4)return false
   let lo=0,hi=1
   for(const [p,v,mn,mx]of [[px,dx,s.x+inf.ox,s.x+inf.ox+s.w],[py,dy,s.y+inf.oy,s.y+inf.oy+s.h]]){
    if(Math.abs(v)<1e-6){if(p<mn||p>mx)return false}else{const a=(mn-p)/v,b=(mx-p)/v;lo=Math.max(lo,Math.min(a,b));hi=Math.min(hi,Math.max(a,b));if(lo>hi)return false}
   }
   return hi>.005&&lo<.985
  })
  if(!blocked)return true
 }
 return false
}
function tickRedClosures(eng:Engine){
 const m=eng.map!,inf=m.inf!,state=inf.l0!;if(inf.l0Pending)return
 const wx=eng.player.x+inf.ox,wy=eng.player.y+inf.oy
 for(const zone of redZonesNear(inf.seed,Math.floor(wx/32),Math.floor(wy/32))){
  if(!insideRedZone(zone,wx,wy,.35))continue
  enterL0Red(eng)
  const old=state.redProgress?.[zone.id];if(!old||eng.time-old.lastSeal<.4)continue
  const closing=zone.gates.filter(g=>!old.closed.includes(g.id)&&!l0GateObserved(eng,g)&&!m.items.some(it=>it.x+inf.ox>g.x-.4&&it.x+inf.ox<g.x+g.w+.4&&it.y+inf.oy>g.y-.4&&it.y+inf.oy<g.y+g.h+.4))
  if(!closing.length)continue
  const progress=structuredClone(state.redProgress??{});progress[zone.id]={entered:true,closed:[...old.closed,...closing.map(g=>g.id)],lastSeal:eng.time}
  const affected=new Set<string>()
  for(const g of closing)for(let cy=Math.floor((g.y-10)/32);cy<=Math.floor((g.y+g.h+10)/32);cy++)for(let cx=Math.floor((g.x-10)/32);cx<=Math.floor((g.x+g.w+10)/32);cx++)if(inf.chunks.has(`${cx},${cy}`))affected.add(`${cx},${cy}`)
  const key=[...affected][0];if(!key)return
  const [cx,cy]=key.split(',').map(Number),revision=state.revisions[key]??0
  inf.l0Pending={key,revision,layout:genL0Architecture(eng.levelDef,inf.seed,cx,cy,undefined,revision,progress).l0!,redProgress:progress,affected:[...affected],closing};return
 }
}
function observers(eng:Engine){
 const inf=eng.map!.inf!,list=[{x:eng.player.x+inf.ox,y:eng.player.y+inf.oy,yaw:look.yaw}]
 for(const r of eng.mpSession?.remotes.values()??[])if(r.s.level===0&&!r.s.dead&&(!r.s.l0Space||r.s.l0Space==='shared'))list.push({x:r.s.x,y:r.s.y,yaw:-Math.PI/2-r.s.yaw})
 return list
}
export function l0VisibleTo(box:L0Wall,p:{x:number;y:number;yaw:number}){
 const dx=box.x+box.w/2-p.x,dy=box.y+box.h/2-p.y,d=Math.hypot(dx,dy),radius=Math.hypot(box.w,box.h)/2
 if(d-radius<12)return true
 // Conservative expanded frustum: occluded walls are also protected, so no false "unseen" edits.
 return d-radius<65&&(dx*-Math.sin(p.yaw)+dy*-Math.cos(p.yaw))/d>Math.cos(80*Math.PI/180)-radius/d
}
function changedWalls(a:L0Layout,b:L0Layout){return [...a.walls.filter(w=>!b.walls.some(v=>JSON.stringify(w)===JSON.stringify(v))),...b.walls.filter(w=>!a.walls.some(v=>JSON.stringify(w)===JSON.stringify(v)))]}
export function l0Connected(a:L0Layout){
 const X=a.cx*32,Y=a.cy*32,blocked=(x:number,y:number)=>a.walls.some(w=>w.bottom<1.48&&x>w.x-.32&&x<w.x+w.w+.32&&y>w.y-.32&&y<w.y+w.h+.32)
 const valid=new Uint8Array(4096);let total=0,start=-1
 for(let y=0;y<64;y++)for(let x=0;x<64;x++)if(!blocked(X+x*.5+.25,Y+y*.5+.25)){valid[y*64+x]=1;total++;start=y*64+x}
 if(start<0)return false
 // Clipped elbows can split one chunk while their bypass lies next door.
 // Require every open component to reach a streaming edge, not a single corner.
 const q:number[]=[]
 for(let i=0;i<4096;i++)if(valid[i]&&(i%64===0||i%64===63||i<64||i>=4032)){q.push(i);valid[i]=2}
 if(!q.length){q.push(start);valid[start]=2}
 for(let n=0;n<q.length;n++){const i=q[n],x=i%64,y=i>>6;for(const [dx,dy]of [[1,0],[-1,0],[0,1],[0,-1]]){const xx=x+dx,yy=y+dy,j=yy*64+xx;if(xx>=0&&yy>=0&&xx<64&&yy<64&&valid[j]===1){valid[j]=2;q.push(j)}}}
 return q.length===total
}
export function l0RevisionSafe(eng:Engine,next:L0Layout){
 const m=eng.map!,inf=m.inf!,c=inf.chunks.get(`${next.cx},${next.cy}`);if(!c?.l0)return false
 const changes=changedWalls(c.l0,next);if(!changes.length)return false
 for(const w of changes){
  if(observers(eng).some(p=>l0VisibleTo(w,p)))return false
  const nearby=(x:number,y:number)=>Math.hypot(x+inf.ox-w.x-w.w/2,y+inf.oy-w.y-w.h/2)<Math.hypot(w.w,w.h)/2+3
  if(m.items.some(it=>nearby(it.x,it.y))||m.exits.some(e=>e.discovered&&nearby(e.x,e.y))||m.structures.some(s=>!s.data?.l0Wall&&nearby(s.x,s.y)))return false
 }
 return l0Connected(next)
}
/** Called by the renderer only after the replacement geometry is prepared. */
export function commitL0Revision(eng:Engine,pending:L0Pending){
 const m=eng.map!,inf=m.inf!;if(!inf.l0||!inf.chunks.has(pending.key))return false
 if(pending.closing?pending.closing.some(g=>l0GateObserved(eng,g)||m.items.some(it=>it.x+inf.ox>g.x-.4&&it.x+inf.ox<g.x+g.w+.4&&it.y+inf.oy>g.y-.4&&it.y+inf.oy<g.y+g.h+.4)):!l0RevisionSafe(eng,pending.layout)){inf.l0Pending=undefined;return false}
 for(const it of m.items){const owner=inf.chunks.get(`${Math.floor((it.x+inf.ox)/32)},${Math.floor((it.y+inf.oy)/32)}`);if(owner&&!owner.items.includes(it))owner.items.push(it)}
 if(pending.redProgress){
  inf.l0.redProgress=pending.redProgress
  const x=eng.player.x+inf.ox,y=eng.player.y+inf.oy
  if(redZonesNear(inf.seed,Math.floor(x/32),Math.floor(y/32)).some(z=>insideRedZone(z,x,y)&&pending.redProgress![z.id]?.closed.length===z.gates.length)){inf.l0.trapped=true;eng.l0Blur=.35;eng.msg('最后的开口已被完整的墙面替代。通路依然相接，来路却已消失。','lore')}
 }
 else inf.l0.revisions[pending.key]=pending.revision
 for(const key of pending.affected??[pending.key]){
  const c=inf.chunks.get(key);if(!c)continue
  const raw=genL0Architecture(eng.levelDef,inf.seed,c.cx,c.cy,undefined,inf.l0.revisions[key]??0,inf.l0.redProgress)
  c.l0=raw.l0;c.structures=[...c.structures.filter(s=>!s.data?.l0Wall),...raw.structures.filter(s=>s.data?.l0Wall).map(s=>({...s,x:s.x-inf.ox,y:s.y-inf.oy}))]
  c.lights=[...c.lights.filter(l=>!l.gen),...raw.lights.map(l=>({...l,x:l.x-inf.ox,y:l.y-inf.oy}))]
 }
 inf.l0Pending=undefined;restitch(m);inf.rev++;return true
}
export function syncL0Revisions(eng:Engine,seed:number,revisions:Record<string,number>){
 const inf=eng.map?.inf;if(eng.player.level!==0||!inf?.l0||inf.seed!==seed||inf.l0.trapped||eng.mpSession?.isHost)return
 for(const [key,revision]of Object.entries(revisions))if(Number.isSafeInteger(revision)&&revision>(inf.l0.revisions[key]??0)){
  const c=inf.chunks.get(key);if(c?.l0&&!inf.l0Pending)inf.l0Pending={key,revision,layout:genL0Architecture(eng.levelDef,seed,c.cx,c.cy,undefined,revision).l0!}
  else if(!c)inf.l0.revisions[key]=revision
 }
}
export function tickL0(eng:Engine,dt:number){
 const m=eng.map!,inf=m.inf;if(eng.player.level!==0||!inf?.l0)return
 const state=inf.l0,a=l0At(m,eng.player.x,eng.player.y);eng.l0Blur=Math.max(0,eng.l0Blur-dt*.12)
 eng.l0Meeting=l0Meeting(m,eng.player.x,eng.player.y)
 const e=l0Sample(m,eng.player.x,eng.player.y)
 audio.setL0Ambience(eng.l0Meeting,(e?.blackout??0)>.5,(e?.red??0)>.5)
 if((e?.red??0)>.1){const key=e?.id??`${a?.cx},${a?.cy}`;if(!eng.redAnnounced.has(key)){eng.redAnnounced.add(key);eng.msg('墙纸开始泛红，地毯变得黏脚。围墙上还有许多通向黄室的开口。','lore')}}
 tickRedClosures(eng)
 if(eng.mpSession?.started&&!eng.mpSession.isHost)return
 for(const c of inf.chunks.values())if(c.l0){const box={x:c.cx*32,y:c.cy*32,w:32,h:32,bottom:0,top:2.7,surface:'wall' as const};if(state.unseen[c.key]===undefined||observers(eng).some(p=>l0VisibleTo(box,p)))state.unseen[c.key]=eng.time}
 if(eng.time<state.checkAt||inf.l0Pending)return;state.checkAt=eng.time+30
 for(const c of inf.chunks.values()){
  const a=c.l0;if(!a||a.reference||a.redZones?.length||!['maze','open','pillarhall'].includes(a.baseRegion)||eng.time-(state.unseen[c.key]??eng.time)<5)continue
  const revision=(state.revisions[c.key]??0)+1,prob=a.region==='blackout'?.3:a.region==='pillarhall'?.2:.15
  if(l0Hash(inf.seed,c.cx,c.cy,Math.floor(eng.time/30))%1000>=prob*1000)continue
  const layout=genL0Architecture(eng.levelDef,inf.seed,c.cx,c.cy,undefined,revision,state.redProgress).l0!
  if(l0RevisionSafe(eng,layout)){inf.l0Pending={key:c.key,revision,layout,affected:[...inf.chunks.values()].filter(n=>Math.abs(n.cx-c.cx)<=1&&Math.abs(n.cy-c.cy)<=1).map(n=>n.key)};break}
 }
}
export function l0Space(m:GameMap|undefined|null){return m?.inf?.l0?.space??'shared'}

/** The shared ledger also receives events while the host is in another level/private room. */
export function rememberL0Event(eng:Engine,e:MpEvent){
 if(e.scopeLevel!==0||e.space!=='shared')return
 const current=eng.player.level===0&&l0Space(eng.map)==='shared'
 const saved=current?captureL0(eng):eng.l0SharedWorld??eng.l0World;if(!saved||saved.space.trapped)return
 if(e.t==='takeItem'&&!saved.taken.includes(e.id))saved.taken.push(e.id)
 const at=e.t==='door'||e.t==='dropItem'?[e.x,e.y]:e.worldAt
 if(at){
  const key=`${Math.floor(at[0]/32)},${Math.floor(at[1]/32)}`;let state=saved.chunks.find(v=>v[0]===key)?.[1]
  if(!state){state={structs:[],extraItems:[],extraLights:[],exitDisc:false};saved.chunks.push([key,state])}
  if(e.t==='dropItem'&&!saved.taken.includes(e.id)&&!state.extraItems.some(v=>v.id===e.id))state.extraItems.push({id:e.id,type:e.it,x:e.x,y:e.y})
  const sid=e.t==='loot'?e.sid:e.structureId
  if(sid!==undefined&&(e.t==='loot'||e.t==='door')){let ss=state.structs.find(v=>v.sid===sid);if(!ss){ss={sid};state.structs.push(ss)}if(e.t==='loot'){ss.looted=true;ss.data={...ss.data,lootItems:[]}}else ss.data={...ss.data,open:e.open?1:0}}
  if(current)eng.map!.inf!.state.set(key,structuredClone(state))
 }
 if(current)for(const id of saved.taken)eng.map!.inf!.taken.add(id)
 eng.l0SharedWorld=saved;if(!eng.l0World?.space.trapped)eng.l0World=saved
}

/** Host snapshots repair missed events, retaining loaded interaction/render object identity. */
export function syncL0Dynamics(eng:Engine,s:{seed:number;taken:number[];chunks:L0WorldSave['chunks']}){
 const m=eng.map,inf=m?.inf;if(!m||eng.player.level!==0||!inf?.l0||inf.l0.trapped||inf.seed!==s.seed||eng.mpSession?.isHost)return
 for(const id of s.taken)inf.taken.add(id)
 m.items=m.items.filter(it=>!inf.taken.has(it.id))
 for(const [key,state]of s.chunks){
  inf.state.set(key,structuredClone(state));const c=inf.chunks.get(key);if(!c)continue
  c.items=c.items.filter(it=>!inf.taken.has(it.id))
  for(const ss of state.structs){const st=c.structures.find(v=>v.data?.sid===ss.sid);if(!st||st.data?.l0Wall)continue;st.looted=ss.looted;st.data={...st.data,...ss.data};if(st.kind==='hoteldoor')st.solid=!st.data.open}
  for(const it of state.extraItems)if(!inf.taken.has(it.id)&&!m.items.some(v=>v.id===it.id)){const live={...it,x:it.x-inf.ox,y:it.y-inf.oy};c.items.push(live);m.items.push(live)}
 }
}
