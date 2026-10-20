import {l1PlanRegions,l1PlanTile,type L1Region} from './l1Plan'
import {l1RegionOutpost} from './l1Layout'

export interface L1OutpostSite {id:string;outpost:string;x:number;z:number;dir:number}
const cache=new Map<string,L1OutpostSite|null>()
/** Closed shutters mount on the path-facing exterior of a hall boundary. The
 * entire 1.94 m frame and its approach must fit; an internal maze wall is not a
 * substitute. Ownership follows the new position, not the retired hall core. */
export function l1OutpostSite(seed:number,r:L1Region):L1OutpostSite|undefined {
 const key=`${seed}:${r.id}`,hit=cache.get(key);if(hit!==undefined)return hit??undefined
 const outpost=l1RegionOutpost(seed,r);let best:L1OutpostSite|undefined,score=Infinity
 if(outpost)for(const [axis,face,side,lo,hi,dir]of [
  [0,r.ix0,-1,r.iy0+3,r.iy1-3,1],[0,r.ix1+1,1,r.iy0+3,r.iy1-3,3],
  [2,r.iy0,-1,r.ix0+3,r.ix1-3,2],[2,r.iy1+1,1,r.ix0+3,r.ix1-3,0],
 ])for(let t=lo;t+2<=hi;t++){
  let valid=true
  for(const along of [.04,1,1.96]){
   const wall=l1PlanTile(seed,axis===0?face-side*.5:t+along,axis===2?face-side*.5:t+along)
   if(wall.floor||wall.region?.id!==r.id){valid=false;break}
   for(const depth of [.06,.5,1.3]){
    const p=l1PlanTile(seed,axis===0?face+side*depth:t+along,axis===2?face+side*depth:t+along)
    if(!p.floor||p.style!=='maintenance'||p.room){valid=false;break}
   }
  }
  if(!valid)continue
  const x=axis===0?face+side*.5:t+1,z=axis===2?face+side*.5:t+1
  const d=Math.hypot(x-(r.ix0+r.ix1)/2,z-(r.iy0+r.iy1)/2)
  if(d<score){score=d;best={id:`outpost:${r.id}`,outpost,x:x-.5,z:z-.5,dir}}
 }
 if(cache.size>=2048)cache.delete(cache.keys().next().value!)
 cache.set(key,best??null);return best
}
export function l1OutpostSites(seed:number,x0:number,z0:number,x1:number,z1:number){
 return l1PlanRegions(seed,x0-2,z0-2,x1+2,z1+2).flatMap(r=>{
  const p=l1OutpostSite(seed,r);return p&&p.x+.5>=x0&&p.x+.5<x1&&p.z+.5>=z0&&p.z+.5<z1?[p]:[]
 })
}
