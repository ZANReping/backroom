// Large, seed-shaped districts. Six-colouring prevents nearby disconnected repeats.
export type L1District = 'parking'|'storage'|'gothic'|'ouroboros'|'garden'|'maintenance'
const TYPES:L1District[]=['parking','storage','garden','gothic','ouroboros','maintenance']
const mod=(n:number,d:number)=>(n%d+d)%d
export const L1_DISTRICT_SIZE=16
const compact=(variant:L1District)=>variant==='ouroboros'||variant==='garden'
type District={gx:number;gy:number;key:string;variant:L1District;cx:number;cy:number}
const districtCache=new Map<string,District>()
export const L1_START_OUTPOST_CHUNK={cx:3,cy:3} as const
function warped(seed:number,x:number,y:number){
  const phase=(seed>>>0)%997/997*Math.PI*2
  return [x+1.25*Math.sin(y/9+phase)-1.25*Math.sin(phase),y+1.25*Math.sin(x/11+phase)-1.25*Math.sin(phase)]
}
export function l1District(seed:number,cx:number,cy:number){
  const cacheKey=`${seed>>>0}:${cx},${cy}`,cached=districtCache.get(cacheKey)
  if(cached)return cached
  const [x,y]=warped(seed,cx,cy),bx=Math.floor((x+8)/16),by=Math.floor((y+8)/16)
  let best=Infinity,result!:District
  // Row-wise warping gives each compact core 10 contiguous columns over 12 rows.
  // Keeping its north/south bounds independent of x avoids isolated diagonal corner cells.
  for(let gy=by-1;gy<=by+1;gy++)for(let gx=bx-1;gx<=bx+1;gx++){
    const variant=TYPES[mod(gx+2*gy,6)]
    if(compact(variant)){
      const centerY=gy*32-warped(seed,gx*16,gy*16)[1]
      if(Math.abs(x-gx*16)<5&&Math.abs(cy-centerY)<6){
        result={gx,gy,key:`${gx},${gy}`,variant,cx:gx*16,cy:gy*16};best=-Infinity
      }
      continue
    }
    const score=(x-gx*16)**2+(y-gy*16)**2
    if(score<best){best=score;result={gx,gy,key:`${gx},${gy}`,variant,cx:gx*16,cy:gy*16}}
  }
  if(districtCache.size>=8192)districtCache.delete(districtCache.keys().next().value!)
  districtCache.set(cacheKey,result)
  return result
}
export function l1Transition(seed:number,cx:number,cy:number){
  const a=l1District(seed,cx,cy)
  // Only the boundary owner's chunk becomes a passage; never randomly selected.
  for(const [dx,dy] of [[1,0],[0,1]]){
    const b=l1District(seed,cx+dx,cy+dy)
    if(a.key!==b.key)return {a:a.variant,b:b.variant,axis:dx?'x' as const:'y' as const}
  }
  return null
}
export function l1LayoutVariant(seed:number,cx:number,cy:number){return l1Transition(seed,cx,cy)?'aisle':l1District(seed,cx,cy).variant}
export function l1TransitionStyle(seed:number,wx:number,wy:number){
  const cx=Math.floor(wx/32),cy=Math.floor(wy/32),t=l1Transition(seed,cx,cy)
  return t?(mod(t.axis==='x'?wx:wy,32)<16?t.a:t.b):l1District(seed,cx,cy).variant
}
export function l1Outpost(seed:number,cx:number,cy:number){
  const d=l1District(seed,cx,cy)
  // The first base stays deep inside the starting parking district, over 125 m from (15.5,15.5).
  const anchor=d.gx===0&&d.gy===0?L1_START_OUTPOST_CHUNK:{cx:d.cx,cy:d.cy}
  if(cx!==anchor.cx||cy!==anchor.cy)return undefined
  if(d.variant==='parking')return (['alpha','tom','cornucopia'] as const)[mod((d.gx+2*d.gy)/6,3)]
  return d.variant==='storage'?'bntg':d.variant==='gothic'?'ariane':undefined
}
/** A finite spatial metric: no teleport or camera rotation; footsteps use travelled proper distance. */
export function l1DistanceScale(seed:number,wx:number,wy:number){
  const cx=Math.floor(wx/32),cy=Math.floor(wy/32),t=l1Transition(seed,cx,cy)
  if(!t||t.a==='maintenance'||t.b==='maintenance')return 1
  const u=mod(t.axis==='x'?wx:wy,32),v=mod(t.axis==='x'?wy:wx,32)
  const envelope=Math.sin(Math.PI*u/32)**2*Math.sin(Math.PI*v/32)**2
  const stretch=mod(cx+cy+(seed>>>0),2)===0
  return 1+envelope*(stretch?-.72:1.4)
}

