import type {L0Region,L0Layout,L0Rect} from './l0Architecture'

export const l0Hash=(...v:number[])=>{let h=2166136261;for(const n of v){h=Math.imul(h^(n|0),16777619);h^=h>>>13;h=Math.imul(h,0x85ebca6b);h^=h>>>16}return h>>>0}
const rand=(...v:number[])=>l0Hash(...v)/4294967296
export type L0BaseRegion=Exclude<L0Region,'red'|'blackout'>
export type L0Effect='none'|'red'|'blackout'
export interface L0EffectPatch {id:string;kind:Exclude<L0Effect,'none'>;x:number;y:number;rx:number;ry:number}
export interface L0Environment {base:L0BaseRegion;effect:L0Effect;red:number;blackout:number;arch:number;id?:string}
const smooth=(v:number)=>{const t=Math.max(0,Math.min(1,v));return t*t*(3-2*t)}
const referenceRegions:L0Region[]=['open','arch','pillarhall','pit','blackout','red','manila']
export function referenceL0Region(seed:number,cx:number,cy:number):L0Region|undefined{
 if(seed!==20261006)return
 if(cx===6&&Math.abs(cy)<=1)return'pillarhall'
 if(cx===15&&cy>=-2&&cy<=1)return'red'
 if(cy===0&&cx>=0&&cx<=18&&cx%3===0)return referenceRegions[cx/3]
}
/** Frozen v1/v2 content selection: supplies and container identities survive layout changes. */
export function legacyL0Region(seed:number,cx:number,cy:number):L0Region{
 const ref=referenceL0Region(seed,cx,cy);if(ref)return ref
 if(Math.abs(cx)<=1&&Math.abs(cy)<=1)return cx===0&&cy===0?'open':'maze'
 if(rand(seed,0x91,Math.floor(cx/2),Math.floor(cy/2))<.09)return'pillarhall'
 const r=rand(seed,0x92,cx,cy)
 if(r<.0154){const rx=Math.floor(cx/8),ry=Math.floor(cy/8);return cx===rx*8+l0Hash(seed,0xe11,rx,ry)%8&&cy===ry*8+l0Hash(seed,0xe12,rx,ry)%8?'maze':'red'}
 return r<.0506?'manila':r<.0902?'blackout':r<.189?'pit':r<.2878?'arch':r<.68?'maze':r<.86?'pillars':'open'
}
const asBase=(r:L0Region):L0BaseRegion=>r==='red'||r==='blackout'||r==='pillars'?'pillarhall':r
/** One candidate per 256m tile, then a deterministic 256m exclusion across
 * tile boundaries. Never dependent on which streaming cell loads first. */
const manilaCache=new Map<string,{cx:number;cy:number;rank:number}|null>()
function manilaCandidate(seed:number,gx:number,gy:number){
 if(seed===20261006&&gx===2&&gy===0)return{cx:18,cy:0,rank:-1}
 const key=`${seed}:${gx},${gy}`;if(manilaCache.has(key))return manilaCache.get(key)!
 let result:{cx:number;cy:number;rank:number}|null=null
 // Thin existing candidates instead of relocating the room and its searched
 // furniture IDs. This also preserves the original red-enclosure positions.
 for(let y=0;y<8;y++)for(let x=0;x<8;x++){
  const cx=gx*8+x,cy=gy*8+y;if(legacyL0Region(seed,cx,cy)!=='manila')continue
  const rank=l0Hash(seed,cx,cy,0x6a12);if(!result||rank<result.rank)result={cx,cy,rank}
 }
 if(manilaCache.size>=2048)manilaCache.clear();manilaCache.set(key,result);return result
}
function hasManila(seed:number,cx:number,cy:number){
 const gx=Math.floor(cx/8),gy=Math.floor(cy/8),c=manilaCandidate(seed,gx,gy)
 if(!c||cx!==c.cx||cy!==c.cy||Math.abs(cx)<=1&&Math.abs(cy)<=1)return false
 const ref=referenceL0Region(seed,cx,cy);if(ref&&ref!=='manila')return false
 if(seed===20261006)for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)if(referenceL0Region(seed,cx+dx,cy+dy)==='arch')return false
 for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)if(dx||dy){
  const n=manilaCandidate(seed,gx+dx,gy+dy)
  if(!n)continue
  if(Math.max(Math.abs(n.cx-cx),Math.abs(n.cy-cy))<8&&(n.rank<c.rank||n.rank===c.rank&&(n.cx<cx||n.cx===cx&&n.cy<cy)))return false
 }
 return true
}
function hasPit(seed:number,cx:number,cy:number){
 if(legacyL0Region(seed,cx,cy)!=='pit'||hasManila(seed,cx,cy))return false
 const rank=referenceL0Region(seed,cx,cy)==='pit'?-1:l0Hash(seed,cx,cy,0x917)
 for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)if(dx||dy){
  const x=cx+dx,y=cy+dy;if(legacyL0Region(seed,x,y)!=='pit')continue
  const n=referenceL0Region(seed,x,y)==='pit'?-1:l0Hash(seed,x,y,0x917)
  if(n<rank||n===rank&&(x<cx||x===cx&&y<cy))return false
 }
 return true
}
const baseCache=new Map<string,L0BaseRegion>()
export function l0BaseRegion(seed:number,cx:number,cy:number):L0BaseRegion{
 const key=`${seed}:${cx},${cy}`,old=baseCache.get(key);if(old)return old
 const ref=referenceL0Region(seed,cx,cy)
 let result=asBase(legacyL0Region(seed,cx,cy))
 if(!ref){
  const previous=legacyL0Region(seed,cx,cy)
  if(previous==='red'||previous==='blackout')result=rand(seed,cx,cy,0xbd)<.55?'maze':'pillarhall'
  if(result==='manila'||result==='pit'&&!hasPit(seed,cx,cy))result='open'
  if(hasManila(seed,cx,cy))result='manila'
  // Manila has deterministic priority; an entire intervening ordinary cell
  // guarantees >12m separation, including diagonals, without load-order arbitration.
  if(result==='arch')for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)if(legacyL0Region(seed,cx+dx,cy+dy)==='manila')result='maze'
 }
 if(baseCache.size>4096)baseCache.clear();baseCache.set(key,result);return result
}
function distance(r:L0Rect,x:number,y:number){return Math.max(r.x-x,0,x-r.x-r.w,r.y-y,y-r.y-r.h)}
const patchCache=new Map<string,L0EffectPatch[]>()
/** Bounded neighbourhood of independent world-space patches, never chunk-sized rooms. */
function redFits(seed:number,x:number,y:number,rx:number,ry:number){
 for(let cy=Math.floor((y-ry-12)/32);cy<=Math.floor((y+ry+12)/32);cy++)for(let cx=Math.floor((x-rx-12)/32);cx<=Math.floor((x+rx+12)/32);cx++){
  // Red progress saves logical enclosure IDs, so keep their established mask
  // while thinning special buildings elsewhere in the world.
  let r=legacyL0Region(seed,cx,cy)
  if(r==='arch'&&!referenceL0Region(seed,cx,cy))for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)if(legacyL0Region(seed,cx+dx,cy+dy)==='manila')r='maze'
  const margin=r==='arch'||r==='manila'?12:0
  if(cx*32>=x+rx+margin||(cx+1)*32<=x-rx-margin||cy*32>=y+ry+margin||(cy+1)*32<=y-ry-margin)continue
  if(r==='arch'||r==='manila'||r==='pit'||Math.abs(cx)<=1&&Math.abs(cy)<=1||referenceL0Region(seed,cx,cy))return false
 }
 return true
}
export function l0EffectPatches(seed:number,cx:number,cy:number):L0EffectPatch[]{
 const key=`${seed}:${cx},${cy}`,old=patchCache.get(key);if(old)return old
 const patches:L0EffectPatch[]=[],wx=cx*32+16,wy=cy*32+16
 if(seed===20261006&&Math.abs(wx-496)<56&&Math.abs(wy)<96)patches.push({id:'reference-red',kind:'red',x:496,y:0,rx:16,ry:64})
 if(seed===20261006&&Math.abs(wx-400)<64&&Math.abs(wy-16)<64)patches.push({id:'reference-blackout',kind:'blackout',x:400,y:16,rx:29,ry:29})
 for(let gy=Math.floor((wy-72)/96);gy<=Math.floor((wy+72)/96);gy++)for(let gx=Math.floor((wx-72)/96);gx<=Math.floor((wx+72)/96);gx++){
  const h=l0Hash(seed,gx,gy,0xc031),roll=h%1000
  if(roll>=455)continue
  const kind=roll<210?'red':'blackout',rx=kind==='red'?20+(h>>>12)%7:30+(h>>>12)%13,ry=kind==='red'?20+(h>>>19)%7:28+(h>>>19)%13
  let x=gx*96+24+(h>>>4)%48,y=gy*96+24+(h>>>24)%48
  if(kind==='red'){let found=false;for(let attempt=0;attempt<12;attempt++){const k=l0Hash(seed,gx,gy,attempt,0xd37);x=gx*96+30+k%37;y=gy*96+30+(k>>>12)%37;if(redFits(seed,x,y,rx,ry)){found=true;break}}if(!found)continue}
  if(Math.abs(x-wx)>rx+24||Math.abs(y-wy)>ry+24)continue
  patches.push({id:`${gx},${gy}`,kind,x,y,rx,ry})
 }
 if(patchCache.size>4096)patchCache.clear();patchCache.set(key,patches);return patches
}
export function l0EnvironmentAt(seed:number,x:number,y:number):L0Environment{
 const cx=Math.floor(x/32),cy=Math.floor(y/32),base=l0BaseRegion(seed,cx,cy)
 let red=0,blackout=0,arch=0,id:string|undefined,allow=1
 // Each special building has a spatial footprint. Arch carpet terminates at
 // its architectural returns rather than at the streaming cell edge.
 for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
  const nx=cx+dx,ny=cy+dy,r=l0BaseRegion(seed,nx,ny),X=nx*32,Y=ny*32
  if(r==='manila'||r==='arch'||r==='pit'){
   const protect={x:X,y:Y,w:32,h:32};allow=Math.min(allow,smooth((distance(protect,x,y)-12)/4))
  }
  if(r==='arch'){
   const r={x:X+11.5,y:Y+4,w:19,h:27},d=Math.min(x-r.x,r.x+r.w-x,y-r.y,r.y+r.h-y)
   arch=Math.max(arch,smooth(d/1.2))
  }
 }
 if(base!=='arch'&&base!=='manila'&&base!=='pit'&&!(Math.abs(cx)<=1&&Math.abs(cy)<=1)){
  for(const p of l0EffectPatches(seed,cx,cy)){
   const d=p.kind==='red'?Math.min(p.rx-Math.abs(x-p.x),p.ry-Math.abs(y-p.y)):(1-Math.hypot((x-p.x)/p.rx,(y-p.y)/p.ry))*Math.min(p.rx,p.ry)
   // Red is an enclosed room: all material on the inside is fully converted.
   // The threshold transition fits entirely inside the .26m enclosure wall.
   const weight=p.kind==='red'?smooth(d/.26):smooth(d/4)*(p.id.startsWith('reference-')?1:allow)
   if(p.kind==='red'&&weight>red){red=weight;id=p.id}
   else if(p.kind==='blackout'&&weight>blackout){blackout=weight;id=p.id}
  }
  // Stable precedence makes overlap deterministic, with no competing light states.
  if(red>0)blackout=0
 }
 return{base,effect:red>.01?'red':blackout>.01?'blackout':'none',red,blackout,arch,id}
}
/** Forced developer/showcase/private layouts still use the same position interface. */
export function l0LayoutEnvironment(a:L0Layout,x:number,y:number):L0Environment{
 const e=l0EnvironmentAt(a.seed??0,x,y)
 if(a.effectOverride){e.red=a.effectOverride==='red'?1:0;e.blackout=a.effectOverride==='blackout'?1:0;e.effect=a.effectOverride;e.base=a.baseRegion}
 return e
}
