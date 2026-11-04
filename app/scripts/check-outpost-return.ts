import assert from 'node:assert/strict'
import { writeFileSync, mkdirSync } from 'node:fs'
const memory=new Map<string,string>()
Object.assign(globalThis,{
 document:{createElement:()=>({getContext:()=>null}),createElementNS:()=>({addEventListener(){},removeEventListener(){}})},
 window:{addEventListener(){},removeEventListener(){},setTimeout,clearTimeout,matchMedia:()=>({matches:false})},
 localStorage:{getItem:(k:string)=>memory.get(k)??null,setItem:(k:string,v:string)=>memory.set(k,v),removeItem:(k:string)=>memory.delete(k)}
})
const {Engine}=await import('../src/game/engine')
const {OUTPOSTS}=await import('../src/game/content/outposts')
const {nextMapSeed,takeExit}=await import('../src/game/engine/level')
const {rememberOutpostEntry,outpostBackLevel,pendingOutpostReturn,placeOutpostReturn}=await import('../src/game/engine/outpostReturn')
const {floorHeight,bandOfPlayerZ}=await import('../src/game/world/mapgen')
const {canOccupy,PLAYER_RADIUS}=await import('../src/game/core/player')
const {look}=await import('../src/game/renderer/shared')
const {gotoJerryRoom}=await import('../src/game/engine/npc')
const {NPCS}=await import('../src/game/content/npcs')
const {freshCareer,restoreCareer}=await import('../src/game/engine/career')
let checks=0
const ok=(v:unknown,label:string)=>{assert(v,label);checks++}
const eq=(a:unknown,b:unknown,label:string)=>{assert.deepEqual(a,b,label);checks++}
const close=(a:number,b:number,label:string)=>ok(Math.abs(a-b)<1e-5,label+' ('+a+' vs '+b+')')
const coords=(e:any)=>({level:e.player.level,mapSeed:e.mapSeed,x:e.player.x+(e.map.inf?.ox??0),y:e.player.y+(e.map.inf?.oy??0),z:e.player.z,floor:e.player.floor,yaw:look.yaw,pitch:look.pitch})
const safe=(e:any,band=0)=>{
 const m=e.map,cx=e.player.x,cy=e.player.y
 for(let r=0;r<=16;r++)for(let dy=-r;dy<=r;dy++)for(let dx=-r;dx<=r;dx++){
  if(Math.max(Math.abs(dx),Math.abs(dy))!==r)continue
  const x=Math.floor(cx)+dx+.5,y=Math.floor(cy)+dy+.5,i=Math.floor(y)*m.w+Math.floor(x),z=floorHeight(m,x,y,band)
  if(x<1||y<1||x>=m.w-1||y>=m.h-1||m.liquid[i]===1||m.elev[i]===4||(m.stair[i]&7))continue
  if(!canOccupy(m,x,y,PLAYER_RADIUS,{z,band}))continue
  Object.assign(e.player,{x,y,z,floor:band,vz:0,crouching:false});return
 }
 throw Error('No safe source approach')
}
const same=(e:any,b:any,label:string)=>{
 const a=coords(e);eq(a.level,b.level,label+' source level');eq(a.mapSeed,b.mapSeed,label+' original seed')
 for(const k of ['x','y','z','yaw','pitch'] as const)close(a[k],b[k],label+' '+k)
 eq(a.floor,b.floor,label+' floor');ok(canOccupy(e.map,e.player.x,e.player.y,PLAYER_RADIUS,{z:e.player.z,band:e.player.floor}),label+' body clearance')
}
const arrive=(e:any)=>{const t=e.transition;assert(t&&typeof t.dest==='number');e.transition=null;e.loadLevel(t.dest,undefined,t.mapSeed)}
const back=(e:any)=>{
 const exit=e.map.exits.find((x:any)=>x.def.dest==='back');ok(exit,'real outpost exit registered');takeExit(e,exit.def)
 ok(e.transition&&typeof e.transition.dest==='number','exit initiates transition');return e.transition
}
const rows:any[]=[]
const e=new Engine();e.newRun(424243,'normal','slot1',true,2);e.dev.frozenAI=true;e.dev.god=true;e.dev.statLock=true
// Every registered outpost uses the actual generation / entry / exit / load path.
for(const o of Object.values(OUTPOSTS)){
 const parent=o.id==='jerry'?2:o.parent
 e.career=freshCareer();e.outpostReturn=null;e.transition=null;e.time+=31.125
 const seed=424200+parent+.375;e.loadLevel(parent,{mapSeed:seed,firstVisit:false});safe(e)
 // Different absolute origins exercise rebasing instead of accidentally passing at local spawn.
 if(o.id==='alpha'||o.id==='omega'){
  e.player.x=-172.5-(e.map!.inf?.ox??0);e.player.y=280.5-(e.map!.inf?.oy??0);e.updateInfiniteWindow();safe(e)
 }
 look.yaw=1.175;look.pitch=-.23;const source=coords(e)
 e.rep.jerry=50;e.homelyApplied=true
 ok(e.enterOutpost(o.id,true),o.id+' enters')
 eq(e.career.returnAnchor?.mapSeed,source.mapSeed,o.id+' records source seed')
 eq(e.career.returnAnchor?.outpost,o.levelId,o.id+' records matching outpost')
 arrive(e);eq(e.player.level,o.levelId,o.id+' arrived')
 e.time+=137.875
 const t=back(e);eq(t.dest,parent,o.id+' return target');eq(nextMapSeed(e,parent),seed,o.id+' prewarm seed')
 if(t.mapSeed!==undefined)eq(t.mapSeed,seed,o.id+' prepared seed')
 eq(e.outpostReturn,parent,o.id+' keeps return origin until arrival')
 arrive(e);same(e,source,o.id)
 eq(e.career.returning,false,o.id+' return consumed');eq(e.outpostReturn,null,o.id+' origin cleared after arrival');eq(e.career.returnAnchor,undefined,o.id+' anchor cleared')
 eq(e.mapFirstVisit,false,o.id+' revisit avoids starter supply generation')
 rows.push({outpost:o.id,source,returned:coords(e)});console.log(o.id+' round trip passed')
}
// Full JSON save/reload while visiting and while leaving a base.
e.transition=null;e.loadLevel(4,{mapSeed:888123.625,firstVisit:false});safe(e);look.yaw=-.43;look.pitch=.12
const source=coords(e);ok(e.enterOutpost('omega'),'normal entry');arrive(e);e.time+=157.5;e.persist()
let resumed=new Engine();resumed.newRun(e.seed,'normal','slot1',false)
eq(resumed.player.level,109,'save resumes inside Omega');eq(resumed.career.returnAnchor,JSON.parse(JSON.stringify(e.career.returnAnchor)),'JSON restores full origin')
back(resumed);resumed.persist();resumed=new Engine();resumed.newRun(e.seed,'normal','slot1',false)
eq(resumed.player.level,109,'save during exit stays in base until exit');eq(resumed.outpostReturn,4,'pending save retains source')
back(resumed);arrive(resumed);same(resumed,source,'resumed return')
const auto=resumed.snapshot();close(auto.worldPos!.x,source.x,'auto save uses returned absolute x');eq(auto.mapSeed,source.mapSeed,'auto save uses source map seed')
// NPC-guided visit is a separate entry path, including nesting inside another outpost.
e.transition=null;e.loadLevel(2,{mapSeed:742125.25,firstVisit:false});safe(e);look.yaw=.7;look.pitch=0
const original=coords(e);ok(e.enterOutpost('el3a'),'EL3A visit');arrive(e);safe(e)
const nested=coords(e),n=Object.values(NPCS).find((n:any)=>n.faction==='jerry')!
ok(n,'Jerry guide available');e.npcs.push({id:n.id,def:n,dead:false} as any);e.rep.jerry=20
ok(gotoJerryRoom(e,n.id),'NPC guide visit');eq(e.career.returnAnchor?.mapSeed,nested.mapSeed,'NPC visit records source seed');ok(e.career.returnAnchor?.previous,'nested visit retains original entrance');arrive(e)
back(e);arrive(e);same(e,nested,'nested return');eq(e.outpostReturn,2,'previous origin reinstated');back(e);arrive(e);same(e,original,'nested final return')
// Refused and double entry must not corrupt a valid return record.
const old={level:4,x:12,y:13,yaw:0,mapSeed:12,outpost:109};e.career.returnAnchor=structuredClone(old);e.rep.jerry=0
ok(!e.enterOutpost('bluesalvation'),'gate rejects entry');eq(e.career.returnAnchor,old,'denial preserves anchor')
e.transition={anim:'bloom',t:0,dest:109};ok(!e.enterOutpost('alpha'),'duplicate transition rejected');eq(e.career.returnAnchor,old,'duplicate preserves anchor');e.transition=null
// Legacy records remain loadable and ordinary travel never consumes an outpost token.
e.career=restoreCareer({version:1,routes:{},settled:[],escrow:[],clock:0,returnAnchor:{level:4,x:12,y:13,yaw:0}} as any)
eq(e.career.returnAnchor,{level:4,x:12,y:13,yaw:0},'v1 legacy anchor compatibility');e.career.returning=false;eq(pendingOutpostReturn(e,4),undefined,'ordinary travel ignores anchor')
e.player.level=109;e.outpostReturn=null;eq(outpostBackLevel(e),4,'legacy anchor selects correct source');e.career.returnAnchor=undefined;eq(outpostBackLevel(e),4,'missing legacy origin uses registered parent');e.player.level=274;eq(outpostBackLevel(e),1,'self-parent never strands Jerry return')
// Controlled physical cases, independent of procedural placement.
const fixture=()=>{
 const t=new Engine(),w=24,n=w*w,a=()=>new Uint8Array(n)
 t.player=structuredClone(e.player);Object.assign(t.player,{level:2,x:4.5,y:4.5,z:0,floor:0});t.career=freshCareer();t.msg=()=>{}
 t.map={w,h:w,tiles:a().fill(1),wet:a(),elev:a(),outdoor:a(),step:a(),crawl:a(),ceiling:a(),up:a(),upWall:a(),up2:a(),upWall2:a(),stair:new Int32Array(n),liquid:a(),seaFloor:new Float32Array(n),dn:a(),dnWall:a(),tint:a(),floors:1,spawn:{x:4,y:4},structures:[],entities:[],items:[],exits:[],lights:[]} as any;t.mapSeed=123.5
 return t
}
{
 const t=fixture(),m=t.map!;m.up.fill(1);m.floors=2;t.player.floor=1;t.player.z=3.0;rememberOutpostEntry(t,105)
 eq(t.career.returnAnchor?.floor,bandOfPlayerZ(m,3.0,t.player.x,t.player.y),'entry captures upper band')
 const a=structuredClone(t.career.returnAnchor!);Object.assign(t.player,{x:4.5,y:4.5,z:0,floor:0})
 ok(placeOutpostReturn(t,{level:2,anchor:a}),'upper landing restored');close(t.player.z,3.0,'upper height retained');eq(t.player.floor,1,'upper band retained')
}
{
 const t=fixture(),m=t.map!,a={level:2,x:12.5,y:12.5,z:0,floor:0 as const,yaw:0,mapSeed:123.5,outpost:105}
 m.tiles[12*m.w+12]=0;m.liquid[11*m.w+12]=1;m.elev[12*m.w+11]=4
 ok(placeOutpostReturn(t,{level:2,anchor:a}),'blocked anchor relocates locally')
 ok(Math.hypot(t.player.x-a.x,t.player.y-a.y)<=3,'safe relocation stays near original entrance')
 ok(canOccupy(m,t.player.x,t.player.y,PLAYER_RADIUS,{z:t.player.z}),'local relocated body clear');ok(m.liquid[Math.floor(t.player.y)*m.w+Math.floor(t.player.x)]!==1,'no deep water landing')
}
{
 const t=fixture(),a={level:2,x:-10000,y:10000,z:0,yaw:0,mapSeed:123.5,outpost:105}
 ok(!placeOutpostReturn(t,{level:2,anchor:a}),'removed invalid anchor uses default')
 ok(canOccupy(t.map!,t.player.x,t.player.y,PLAYER_RADIUS,{z:t.player.z}),'invalid saved coordinate never embeds player');close(t.player.x,4.5,'fallback uses actual initial entry')
}
{
 const t=fixture(),m=t.map!;m.structures=[{kind:'landmark',x:17,y:12,w:1,h:1,solid:false,data:{outpost:'el3a'}}]
 ok(placeOutpostReturn(t,{level:2,outpostId:'el3a',anchor:{level:2,x:9,y:9,yaw:.6}}),'legacy return can find existing marker')
 ok(Math.hypot(t.player.x-17.5,t.player.y-12.5)<=3,'legacy coordinates prefer matching actual entry')
}
resumed.newRun(99,'normal','slot2',true,2);eq(resumed.career.returnAnchor,undefined,'new game clears anchor');eq(resumed.outpostReturn,null,'new game clears origin')
mkdirSync('reports/outpost-return-20261103',{recursive:true});writeFileSync('reports/outpost-return-20261103/unit.json',JSON.stringify({ok:true,checks,rows},null,2))
console.log('Outpost return checks passed: '+checks+' checks, '+rows.length+' actual registered outpost round trips.')
