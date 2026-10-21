import type {GameMap} from '../world/mapgen'
import {TRADERS_WALLS,TRADERS_DOORS,TRADERS_ROOMS,TRADERS_VAULT_CELLS,TRADERS_BOUNDS,tradersContains,tradersIntersects} from '../content/tradersLayout'
interface Block{x:number;y:number;w:number;h:number;door?:string}
const grid=new Map<string,Block[]>(),blocks:Block[]=[...TRADERS_WALLS.filter(w=>w.bottom<1.65&&w.bottom+w.height>1.65),...TRADERS_DOORS.map(d=>({...d,door:d.id}))]
for(const b of blocks)for(let y=Math.floor(b.y/8);y<=Math.floor((b.y+b.h)/8);y++)for(let x=Math.floor(b.x/8);x<=Math.floor((b.x+b.w)/8);x++){const key=x+','+y,a=grid.get(key)??[];a.push(b);grid.set(key,a)}
const cache=new WeakMap<GameMap,{x:number;y:number;reach:number;doors:number;keys:Set<string>}>()
function distance(b:Block,x:number,y:number,dx:number,dy:number,limit:number){
 let lo=0,hi=limit
 for(const [p,d,a,z] of [[x,dx,b.x,b.x+b.w],[y,dy,b.y,b.y+b.h]]){
  if(Math.abs(d)<1e-9){if(p<a||p>z)return Infinity;continue}
  let aa=(a-p)/d,bb=(z-p)/d;if(aa>bb)[aa,bb]=[bb,aa];lo=Math.max(lo,aa);hi=Math.min(hi,bb);if(lo>hi)return Infinity
 }
 return lo
}
/** Readiness/prioritisation only: never hide meshes or invent an occluding wall.
 * Trace the actual complete plan in every direction, including open doorways.
 * Closed rooms behind real walls need not delay the first visible frame. */
export function tradersVisibleChunks(m:GameMap,x:number,y:number,reach=94):ReadonlySet<string>{
 const opened=new Set<string>();let fingerprint=0
 for(const s of m.traders?.base??[])if(s.data?.tradersDoor){const id=String(s.data.tradersId);fingerprint=Math.imul(fingerprint^Number(s.solid),16777619);if(!s.solid)opened.add(id)}
 const old=cache.get(m);if(old&&Math.hypot(old.x-x,old.y-y)<.35&&old.doors===fingerprint&&old.reach===reach)return old.keys
 const keys=new Set<string>(),add=(gx:number,gy:number)=>{const cx=Math.floor(gx/4),cy=Math.floor(gy/4);if(Math.hypot(Math.max(cx*32-x,0,x-cx*32-32),Math.max(cy*32-y,0,y-cy*32-32))<=reach&&tradersIntersects({x:cx*32,y:cy*32,w:32,h:32},TRADERS_BOUNDS))keys.add(cx+','+cy)}
 const angles=Array.from({length:512},(_,i)=>i*Math.PI*2/512)
 for(const r of TRADERS_ROOMS){
  const horizontal=r.side==='n'||r.side==='s',px=r.side==='w'?r.x:r.side==='e'?r.x+r.w:r.x+r.w/2,py=r.side==='n'?r.y:r.side==='s'?r.y+r.h:r.y+r.h/2
  if(Math.hypot(px-x,py-y)>reach+2)continue
  for(const off of [-r.doorWidth/2+.02,0,r.doorWidth/2-.02])angles.push(Math.atan2(py-y+(horizontal?0:off),px-x+(horizontal?off:0)))
 }
 for(const a of angles){
  const dx=Math.cos(a),dy=Math.sin(a),sx=dx>=0?1:-1,sy=dy>=0?1:-1,tx=Math.abs(dx)<1e-9?Infinity:8/Math.abs(dx),ty=Math.abs(dy)<1e-9?Infinity:8/Math.abs(dy)
  let gx=Math.floor(x/8),gy=Math.floor(y/8),nx=Math.abs(dx)<1e-9?Infinity:((dx>=0?(gx+1)*8:gx*8)-x)/dx,ny=Math.abs(dy)<1e-9?Infinity:((dy>=0?(gy+1)*8:gy*8)-y)/dy,limit=reach
  const seen=new Set<Block>()
  for(let step=0;step<40;step++){
   add(gx,gy)
   for(const b of grid.get(gx+','+gy)??[]){if(seen.has(b)||b.door&&opened.has(b.door))continue;seen.add(b);limit=Math.min(limit,distance(b,x,y,dx,dy,limit))}
   const next=Math.min(nx,ny)
   if(limit<=next){add(Math.floor((x+dx*(limit+.22))/8),Math.floor((y+dy*(limit+.22))/8));break}
   if(nx<ny){gx+=sx;nx+=tx}else{gy+=sy;ny+=ty}
  }
 }
 cache.set(m,{x,y,reach,doors:fingerprint,keys});return keys
}

/** Closed vault contents are prepared before the opening comes within reach.
 * Data/collision/loot identities are already present; only decorative meshes wait. */
export function tradersVaultsToPrepare(m:GameMap,x:number,y:number){
 const doors=new Map((m.traders?.base??[]).filter(s=>s.data?.tradersDoor).map(s=>[String(s.data?.room),s]))
 return new Set(TRADERS_VAULT_CELLS.filter(r=>{
  const px=r.x+r.w/2,py=r.side==='n'?r.y:r.y+r.h
  return !doors.get(r.id)?.solid||tradersContains(r,x,y)||Math.hypot(x-px,y-py)<=4
 }).map(r=>r.id))
}
