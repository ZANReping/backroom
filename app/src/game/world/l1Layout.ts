import {l1PlanTile,l1RegionAt,l1PlanHash,type L1Region} from './l1Plan'
// v2: 过道 regions (one 区段 each) separated by 小径 belts; see l1Plan.ts.
export type L1District = 'parking'|'storage'|'gothic'|'ouroboros'|'garden'|'maintenance'|'fabled'
export const L1_DISTRICT_SIZE=16
const mod=(n:number,d:number)=>(n%d+d)%d
/** The spawn hall's base sits ~100 m from the arrival point. */
export const L1_START_OUTPOST_CHUNK={cx:3,cy:3} as const
type District={gx:number;gy:number;key:string;variant:L1District;cx:number;cy:number;region?:L1Region}
/** The region (or path) that owns a chunk's centre. cx/cy point to the region's anchor chunk. */
export function l1District(seed:number,cx:number,cy:number):District{
  const x=cx*32+16,y=cy*32+16,r=l1RegionAt(seed,x,y)
  if(!r)return {gx:cx,gy:cy,key:`path:${cx},${cy}`,variant:'maintenance',cx,cy}
  const a=regionAnchor(r)
  return {gx:r.sx*64+r.index,gy:r.sy,key:r.id,variant:r.section,cx:a?.cx??cx,cy:a?.cy??cy,region:r}
}
// Keep the legacy terrain fallback typed; v2 uses real hall/path doorways.
export function l1Transition(_seed:number,_cx:number,_cy:number):{a:L1District;b:L1District;axis:'x'|'y'}|null{return null}
export function l1LayoutVariant(seed:number,cx:number,cy:number):L1District{
  return l1PlanTile(seed,cx*32+16,cy*32+16).style as L1District
}
export function l1TransitionStyle(seed:number,wx:number,wy:number):L1District{
  return l1PlanTile(seed,wx,wy).style as L1District
}
/** A chunk whose 9..23 core lies wholly inside a hall can host the region's settlement. */
function coreInside(r:L1Region,cx:number,cy:number){
  return cx*32+8>r.ix0+4&&cx*32+24<r.ix1-4&&cy*32+8>r.iy0+4&&cy*32+24<r.iy1-4
}
function regionAnchor(r:L1Region){
  const spawn=r.ix0<=15&&r.ix1>=15&&r.iy0<=15&&r.iy1>=15
  if(spawn&&coreInside(r,L1_START_OUTPOST_CHUNK.cx,L1_START_OUTPOST_CHUNK.cy))return L1_START_OUTPOST_CHUNK
  const cx=Math.floor(((r.ix0+r.ix1)/2-16)/32+.5),cy=Math.floor(((r.iy0+r.iy1)/2-16)/32+.5)
  for(const [dx,dy] of [[0,0],[1,0],[0,1],[-1,0],[0,-1],[1,1],[-1,-1]])if(coreInside(r,cx+dx,cy+dy)){
    if(spawn&&Math.hypot(cx+dx,cy+dy)<3)continue
    return {cx:cx+dx,cy:cy+dy}
  }
  return undefined
}
export function l1Outpost(seed:number,cx:number,cy:number){
  const r=l1RegionAt(seed,cx*32+16,cy*32+16)
  if(!r)return undefined
  const a=regionAnchor(r)
  if(!a||a.cx!==cx||a.cy!==cy)return undefined
  return l1RegionOutpost(seed,r)
}
/** Settlement quota belongs to the hall; its visible entrance belongs to the path wall. */
export function l1RegionOutpost(seed:number,r:L1Region){
  if(!regionAnchor(r))return undefined
  const spawn=r.ix0<=15&&r.ix1>=15&&r.iy0<=15&&r.iy1>=15
  if(spawn)return 'alpha' as const
  // Settlements are sparse: roughly one large hall in three hosts one.
  const area=(r.ix1-r.ix0)*(r.iy1-r.iy0),u=l1PlanHash(seed,0x0b5,r.sx,r.sy,r.index)
  if(area<110*110||u>.45)return undefined
  if(r.section==='parking')return (['alpha','tom','cornucopia'] as const)[mod(Math.floor(u*1000),3)]
  return r.section==='storage'?'bntg' as const:r.section==='gothic'?'ariane' as const:undefined
}
/** A finite spatial metric: no teleport or camera rotation; footsteps use travelled proper distance. */
export function l1DistanceScale(seed:number,wx:number,wy:number){
  // 过道 are non-Euclidean, 小径 are not (wiki). Distances breathe gently across each hall.
  const r=l1RegionAt(seed,wx,wy)
  if(!r)return 1
  const u=(wx-r.ix0)/Math.max(1,r.ix1-r.ix0),v=(wy-r.iy0)/Math.max(1,r.iy1-r.iy0)
  const envelope=Math.sin(Math.PI*u)**2*Math.sin(Math.PI*v)**2
  const stretch=l1PlanHash(seed,0xd15,r.sx,r.sy,r.index)<.5
  return 1+envelope*(stretch?-.28:.35)
}
