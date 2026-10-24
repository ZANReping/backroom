import {TRADERS_DUTIES,type TradersDuty} from '../content/tradersFitout'
import {tradersArchPosts,tradersHallPosts} from '../content/tradersRibs'
import type {Engine} from '../engine'
import type {GameMap} from './mapgen'
import {enableRuntimeStructCollisionIndex} from './mapgen'
import type {LevelDef,Structure,LightSource} from '../core/types'
import type {NpcState,NpcDef} from '../content/npcs'
import {NPCS} from '../content/npcs'
import {TRADERS_MARKET_HOMES,TRADERS_MARKET_PEOPLE} from '../content/tradersMarket'
import {TRADERS_SHOP_HOMES,TRADERS_SHOP_PEOPLE,tradersShopAt,tradersShopLights} from '../content/tradersShops'
import {canOccupy} from '../core/player'
import {createTradersResident} from '../content/tradersPeople'
import {ferrenCageStructures,FERREN_CAGE} from '../content/ferrenCage'
import {makeEntity} from '../entities'
import {tradersFurnishingsForChunk} from '../content/tradersFurnishings'
import {TRADERS_BLUEPRINT,TRADERS_BOUNDS,TRADERS_MAP_SIZE,TRADERS_LAYOUT_VERSION,TRADERS_FIXED_PEOPLE,TRADERS_ENTRIES,TRADERS_SPAWN,TRADERS_ROOMS,TRADERS_ZONES,tradersContains,tradersIntersects,tradersWallStructures,tradersShopFrontStructures,tradersDoorStructures,tradersServiceStructures,tradersCeilingAt,tradersZoneAt,type TradersRect} from '../content/tradersLayout'

export interface TradersWorldSave{
 version:4;fitout?:1;seed:number;structures:Record<string,{open?:number;looted?:boolean}>
 residents:Record<string,{x:number;y:number;facing:number;dead?:boolean;hp?:number;hostile?:boolean}>
}
export interface TradersChunk{key:string;cx:number;cy:number;bounds:TradersRect;structures:Structure[];details:Structure[];lights:LightSource[]}
export interface TradersHome{id:string;x:number;y:number;facing:number;slot?:number}
export interface TradersRuntime{
 version:4;seed:number;chunks:Map<string,TradersChunk>;base:Structure[];states:TradersWorldSave['structures']
 homes:TradersHome[];residents:Map<string,NpcState>;definitions:Map<string,NpcDef>
 savedResidents:TradersWorldSave['residents'];revision:number;created:number;peakChunks:number;maxCpuMs:number
 duties:Map<string,TradersDuty>;fitout?:1;lastNpcAt:number;lastNpcX:number;lastNpcY:number;pendingNearNpcs:boolean
}
export const tradersChunkKey=(cx:number,cy:number)=>cx+','+cy
export function tradersChunkBounds(cx:number,cy:number):TradersRect{return{x:cx*32,y:cy*32,w:32,h:32}}
const distanceTo=(r:TradersRect,x:number,y:number)=>Math.hypot(Math.max(r.x-x,0,x-r.x-r.w),Math.max(r.y-y,0,y-r.y-r.h))
const hash=(a:number,b:number)=>{let h=Math.imul(a^0x51ed270b,b+0x165667b1);h^=h>>>16;h=Math.imul(h,0x85ebca6b);return(h^(h>>>13))>>>0}
const unit=(seed:number,i:number,salt=0)=>hash(seed^salt,i+1)/4294967296

export function tradersHomes(seed:number):TradersHome[]{
 const a:TradersHome[]=TRADERS_FIXED_PEOPLE.map(p=>({...p}))
 for(const h of TRADERS_MARKET_HOMES)a.push({...h})
 for(const h of TRADERS_SHOP_HOMES)a.push({...h})
 for(const d of TRADERS_DUTIES){const slot=Number(d.id.split('_').at(-1));a.push({id:d.id,slot,x:d.x,y:d.y,facing:d.facing})}
 // Appearance is seeded, while job/seat geometry remains authored.
 void seed
 return a
}

export function createTradersMap(def:LevelDef,seed:number):GameMap{
 const {w,h}=TRADERS_MAP_SIZE,n=w*h
 const bytes=()=>new Uint8Array(n)
 const m:GameMap={w,h,tiles:bytes(),structures:[],items:[],lights:[],exits:[],entities:[],spawn:{x:TRADERS_SPAWN.x-.5,y:TRADERS_SPAWN.y-.5},npcs:[],npcDefs:[],zones:[],
 wet:bytes(),elev:bytes(),outdoor:bytes(),step:bytes(),crawl:bytes(),ceiling:bytes(),up:bytes(),upWall:bytes(),up2:bytes(),upWall2:bytes(),stair:new Int32Array(n),liquid:bytes(),seaFloor:new Float32Array(n),floors:1,tint:bytes(),dn:bytes(),dnWall:bytes(),hasUnderground:false,terrain:new Float32Array(n)}
 m.tiles.fill(2)
 const heights=new Float32Array(n).fill(4.8),roomIndex=new Int16Array(n).fill(-1),roofIndex=new Int16Array(n).fill(-1)
 for(let y=4;y<280;y++)for(let x=4;x<424;x++){m.tiles[y*w+x]=1;roofIndex[y*w+x]=0}
 TRADERS_ZONES.forEach((r,ri)=>{
  if(!r.priority)return
  for(let y=Math.floor(r.y);y<Math.ceil(r.y+r.h);y++)for(let x=Math.floor(r.x);x<Math.ceil(r.x+r.w);x++){
   if(x<4||y<4||x>=424||y>=280)continue
   const i=y*w+x;roomIndex[i]=ri-1;heights[i]=tradersCeilingAt(x+.5,y+.5)
  }
  m.zones!.push({name:r.kind==='vault'&&r.id!=='vault'?'交易保险库 · '+r.name:r.name,x:r.x+r.w/2,y:r.y+r.h/2,x0:r.x,y0:r.y,x1:r.x+r.w,y1:r.y+r.h})
 })
 m.zones!.sort((a,b)=>(a.x1!-a.x0!)*(a.y1!-a.y0!)-(b.x1!-b.x0!)*(b.y1!-b.y0!))
 m.settlement={blueprint:TRADERS_BLUEPRINT,heights,roomIndex,roofIndex}
 const base=[...tradersWallStructures(),...tradersShopFrontStructures(),...tradersArchPosts(),...tradersHallPosts(),...tradersDoorStructures(),...tradersServiceStructures(),...ferrenCageStructures()] // [ferren] 迎新与路线中心的小雪貂笼（围栏/窝/食盆）
 m.structures=base.slice()
 m.exits=TRADERS_ENTRIES.map(e=>({x:e.x-.5,y:e.y-.5,discovered:true,def:{kind:'unlockeddoor',name:e.name,dest:'back',anim:'bloom'}}))
 m.traders={version:4,seed:seed>>>0,chunks:new Map(),base,states:{},homes:tradersHomes(seed>>>0),residents:new Map(),definitions:new Map(),savedResidents:{},revision:0,created:0,peakChunks:0,maxCpuMs:0,fitout:1,duties:new Map(TRADERS_DUTIES.map(d=>[d.id,d])),lastNpcAt:-Infinity,lastNpcX:Infinity,lastNpcY:Infinity,pendingNearNpcs:false}
 enableRuntimeStructCollisionIndex(m)
 m.entities.push(makeEntity('ferren',FERREN_CAGE.spawn.x,FERREN_CAGE.spawn.y)) // [ferren] 只有 1 只，只住这里（ferrenAI 接管）
 void def
 return m
}

const lightCache=new Map<string,LightSource[]>()
export function tradersLightsForChunk(cx:number,cy:number):LightSource[]{
 const key=tradersChunkKey(cx,cy),cached=lightCache.get(key);if(cached)return cached
 const b=tradersChunkBounds(cx,cy),lights:LightSource[]=[]
 const push=(x:number,y:number,z:number,color:string,r=6)=>lights.push({x,y,r,color,fixZ:z,keep:1,gen:1,flickerSeed:hash(Math.round(x*10),Math.round(y*10)),intensityMul:.75})
 for(let y=Math.ceil(b.y/8)*8+4;y<b.y+32;y+=8)for(let x=Math.ceil(b.x/8)*8+4;x<b.x+32;x+=8){
  if(!tradersContains(TRADERS_BOUNDS,x,y)||TRADERS_ROOMS.some(r=>r.w<12&&r.h<12&&tradersContains(r,x,y))||[[0,0],[.8,0],[-.8,0],[0,.8],[0,-.8]].some(([dx,dy])=>tradersShopAt(x+dx,y+dy)))continue
  push(x,y,tradersCeilingAt(x,y)-.16,tradersZoneAt(x,y)?.kind==='street'?'#f2dfbb':'#e7e9df',7)
 }
 for(const r of TRADERS_ROOMS)if(r.w<12&&r.h<12){
  const x=r.x+r.w/2,y=r.y+r.h/2
  if(tradersContains(b,x,y))push(x,y,r.height-.14,r.storage==='cold'?'#dce8ec':'#e5e6dc',4.8)
 }
 lights.push(...tradersShopLights(b))
 lightCache.set(key,lights);if(lightCache.size>160)lightCache.delete(lightCache.keys().next().value!)
 return lights
}
export function tradersLightsNear(x:number,y:number,reach=18){
 const a:LightSource[]=[]
 for(let cy=Math.floor((y-reach)/32);cy<=Math.floor((y+reach)/32);cy++)for(let cx=Math.floor((x-reach)/32);cx<=Math.floor((x+reach)/32);cx++)
  for(const l of tradersLightsForChunk(cx,cy))if((l.x-x)**2+(l.y-y)**2<=reach*reach)a.push(l)
 return a
}
function owner(s:Structure,cx:number,cy:number){return Math.floor((s.x+s.w/2)/32)===cx&&Math.floor((s.y+s.h/2)/32)===cy}
function remember(world:TradersRuntime,s:Structure){
 const id=s.data?.tradersId
 if(typeof id!=='string'||(!s.data?.tradersDoor&&s.looted===undefined))return
 const v:TradersWorldSave['structures'][string]={}
 if(s.data?.tradersDoor)v.open=Number(s.data.open??0)>0?1:0
 if(s.looted!==undefined)v.looted=s.looted
 world.states[id]=v
}
function applyState(world:TradersRuntime,s:Structure){
 const id=s.data?.tradersId;if(typeof id!=='string')return
 const state=world.states[id];if(!state)return
 if(state.open!==undefined&&s.data?.tradersDoor){s.data.open=state.open?1:0;s.solid=!s.data.open}
 if(state.looted!==undefined)s.looted=state.looted
}
export function generateTradersChunk(m:GameMap,cx:number,cy:number):TradersChunk|undefined{
 const world=m.traders;if(!world)return
 const key=tradersChunkKey(cx,cy),old=world.chunks.get(key);if(old)return old
 const bounds=tradersChunkBounds(cx,cy);if(!tradersIntersects(bounds,TRADERS_BOUNDS))return
 const started=performance.now(),details=tradersFurnishingsForChunk(cx,cy)
 for(const s of details)applyState(world,s)
 const structures=[...world.base.filter(s=>s.kind!=='trade_wall'&&!s.data?.tradersArchitectural&&s.data?.cargoId===undefined&&owner(s,cx,cy)),...details]
 const c:TradersChunk={key,cx,cy,bounds,structures,details,lights:tradersLightsForChunk(cx,cy)}
 world.chunks.set(key,c);m.structures.push(...details);m.lights.push(...c.lights)
 world.revision++;world.created++;world.peakChunks=Math.max(world.peakChunks,world.chunks.size);world.lastNpcAt=-Infinity
 world.maxCpuMs=Math.max(world.maxCpuMs,performance.now()-started)
 return c
}
export function ensureTradersAt(m:GameMap,x:number,y:number,reach=24){
 if(!m.traders)return
 for(let cy=Math.floor((y-reach)/32);cy<=Math.floor((y+reach)/32);cy++)for(let cx=Math.floor((x-reach)/32);cx<=Math.floor((x+reach)/32);cx++){
  if(distanceTo(tradersChunkBounds(cx,cy),x,y)<=reach)generateTradersChunk(m,cx,cy)
 }
}
export function streamTradersWorld(m:GameMap,x:number,y:number,budgetMs=1.4){
 const world=m.traders;if(!world)return
 let removed=false
 for(const [key,c] of world.chunks)if(distanceTo(c.bounds,x,y)>118){
  for(const s of c.details)remember(world,s)
  world.chunks.delete(key);removed=true
 }
 if(removed){m.structures=[...world.base,...[...world.chunks.values()].flatMap(c=>c.details)];m.lights=[...world.chunks.values()].flatMap(c=>c.lights);world.revision++;world.lastNpcAt=-Infinity}
 const queue:{cx:number;cy:number;d:number}[]=[]
 for(let cy=Math.floor((y-94)/32);cy<=Math.floor((y+94)/32);cy++)for(let cx=Math.floor((x-94)/32);cx<=Math.floor((x+94)/32);cx++){
  const r=tradersChunkBounds(cx,cy),d=distanceTo(r,x,y)
  if(d<=94&&tradersIntersects(r,TRADERS_BOUNDS)&&!world.chunks.has(tradersChunkKey(cx,cy)))queue.push({cx,cy,d})
 }
 queue.sort((a,b)=>a.d-b.d||a.cy-b.cy||a.cx-b.cx)
 const end=performance.now()+Math.max(.2,budgetMs);let made=0
 for(const p of queue){generateTradersChunk(m,p.cx,p.cy);if(++made>=2||performance.now()>=end)break}
}
function safeHome(m:GameMap,h:TradersHome){
 if(canOccupy(m,h.x,h.y,.3,{z:0,band:0,crouch:false}))return{x:h.x,y:h.y}
 for(let r=.4;r<=4;r+=.4)for(let i=0;i<16;i++){const x=h.x+Math.cos(i*Math.PI/8)*r,y=h.y+Math.sin(i*Math.PI/8)*r;if(canOccupy(m,x,y,.3,{z:0,band:0,crouch:false}))return{x,y}}
 return undefined
}
export function syncTradersResidents(eng:Engine,force=false){
 const m=eng.map,w=m?.traders;if(!m||!w)return
 const now=performance.now(),p=eng.player
 if(!force&&now-w.lastNpcAt<150&&(p.x-w.lastNpcX)**2+(p.y-w.lastNpcY)**2<2.25)return
 w.lastNpcAt=now;w.lastNpcX=p.x;w.lastNpcY=p.y
 const candidates=w.homes.map(h=>({h,d:Math.hypot(h.x-p.x,h.y-p.y)})).filter(v=>v.d<48&&w.chunks.has(tradersChunkKey(Math.floor(v.h.x/32),Math.floor(v.h.y/32)))).sort((a,b)=>a.d-b.d||a.h.id.localeCompare(b.h.id)).slice(0,32)
 const active:NpcState[]=[];let created=0;w.pendingNearNpcs=false
 for(const {h,d} of candidates){
  let n=w.residents.get(h.id)
  if(!n){
   if(created>=2){if(d<=24)w.pendingNearNpcs=true;continue}
   const duty=w.duties.get(h.id),pos=duty?.seatHeight?{x:h.x,y:h.y}:safeHome(m,h);if(!pos)continue
   const def=h.slot===undefined?(TRADERS_MARKET_PEOPLE[h.id]??TRADERS_SHOP_PEOPLE[h.id]?{...(TRADERS_MARKET_PEOPLE[h.id]??TRADERS_SHOP_PEOPLE[h.id])}:{...NPCS[h.id],wanderRadius:.6}):createTradersResident(h.slot,w.seed).def
   if(!def.id)continue
   w.definitions.set(h.id,def);created++
   n={id:h.id,def,...pos,facing:h.facing,homeX:pos.x,homeY:pos.y,homeFacing:h.facing,tx:pos.x,ty:pos.y,moveT:1+unit(w.seed,h.slot??200)*4,bubbleText:'',bubbleT:0,floor:0}
   const saved=w.savedResidents[h.id]
   if(saved){n.dead=!!saved.dead;n.hp=saved.hp;n.hostile=saved.hostile;if(w.fitout===1&&duty?.activity==='walk'&&canOccupy(m,saved.x,saved.y,.26,{z:0,band:0,crouch:false})){n.x=saved.x;n.y=saved.y;n.facing=saved.facing;n.tx=n.x;n.ty=n.y}}
   w.residents.set(h.id,n)
  }
  if(n.dead&&Number(n.deathT??0)<=0)continue
  active.push(n)
  if(!eng.knownNpcs.some(k=>k.id===n!.id))eng.knownNpcs.push(n.def)
 }
 eng.npcs=active
 if(w.pendingNearNpcs)w.lastNpcAt=-Infinity
}
export function captureTradersWorld(m:GameMap):TradersWorldSave|undefined{
 const w=m.traders;if(!w)return
 for(const s of m.structures)remember(w,s)
 const residents={...w.savedResidents}
 for(const n of w.residents.values())residents[n.id]={x:n.x,y:n.y,facing:n.facing,dead:n.dead,hp:n.hp,hostile:n.hostile}
 return{version:4,fitout:1,seed:w.seed,structures:structuredClone(w.states),residents}
}
export function restoreTradersWorld(m:GameMap,save?:TradersWorldSave){
 const w=m.traders;if(!w||save?.version!==TRADERS_LAYOUT_VERSION)return
 w.seed=Number.isFinite(save.seed)?save.seed>>>0:w.seed
 w.fitout=save.fitout;w.states=structuredClone(save.structures??{});w.homes=tradersHomes(w.seed)
 const allowed=new Set(w.homes.map(h=>h.id))
 w.savedResidents=structuredClone(Object.fromEntries(Object.entries(save.residents??{}).filter(([id])=>allowed.has(id))))
 for(const s of w.base)applyState(w,s)
}
