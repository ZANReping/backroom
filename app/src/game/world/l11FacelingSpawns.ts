import type { GenChunk } from './infiniteRegistry'
import type { L11Building } from './l11Types'
import type { L11FacelingHome } from './l11FacelingTypes'
import { l11Hash,l11Rand,l11World,l11StairAt } from './l11Layout'
import { l11InteriorPlan,type L11Room } from './l11Interiors'
import { l11RoomFixtures,type L11RoomFixture } from './l11RoomFurnishing'
import { l11DecorDef } from '../content/l11Decor'
import { segmentDistance,type Point } from './l11Geometry'
import { l11PedestrianSurface,L11_FACELING_RADIUS } from './l11PedestrianSpace'
import { l11StreetHeight } from './l11Hydrology'

const homesCache=new WeakMap<L11Building,L11FacelingHome[]>()
const textSeed=(seed:number,id:string)=>l11Hash(seed,...Array.from(id,c=>c.charCodeAt(0)))

/** Conservative furniture envelopes are intentional here: workers must have
 * room for their whole body beside a chair/counter, not merely under a desk. */
function clearInRoom(b:L11Building,r:L11Room,fixtures:L11RoomFixture[],p:Point){
  const [x,y]=p,pad=L11_FACELING_RADIUS+.15
  if(x<r.x+pad||y<r.y+pad||x>r.x+r.w-pad||y>r.y+r.h-pad)return false
  const floor=l11InteriorPlan(b).floors[r.floor]
  if(floor.walls.some(w=>segmentDistance(x,y,w.a,w.b)<pad))return false
  if(floor.doors.some(d=>Math.hypot(x-d.center[0],y-d.center[1])<1.05))return false
  if(l11StairAt(b,...l11World(b,x,y),r.floor))return false
  return !fixtures.some(f=>{
    const def=l11DecorDef('l11_'+f.key);if(!def?.solid||(f.mount??0)>1.9)return false
    const dx=x-f.x,dy=y-f.y,c=Math.cos(f.angle),s=Math.sin(f.angle)
    return Math.abs(dx*c+dy*s)<def.w/2+pad&&Math.abs(-dx*s+dy*c)<def.d/2+pad
  })
}

export function l11IndoorFacelingHomes(b:L11Building):L11FacelingHome[]{
  const hit=homesCache.get(b);if(hit)return hit
  const homes:L11FacelingHome[]=[];homesCache.set(b,homes)
  if(b.sealed||b.archetype==='unfinished-frame'||b.id==='l11:public-archive')return homes
  const fixtures=l11RoomFixtures(b),rooms=l11InteriorPlan(b).floors.flatMap(f=>f.rooms)
    .filter(r=>['shop','workspace','staffroom','reception'].includes(r.kind))
    .sort((a,c)=>textSeed(b.seed,a.id)-textSeed(b.seed,c.id))
  for(const r of rooms){
    if(homes.length>=3)break
    const seed=textSeed(b.seed,r.id),shop=r.kind==='shop'
    if(l11Rand(seed,950)>(shop?.48:.22))continue
    const furniture=fixtures.filter(f=>f.floor===r.floor&&f.roomId===r.id)
    const desks=furniture.filter(f=>shop?f.key==='retail_checkout':f.key==='office_desk'||f.key==='reception_desk')
    for(const f of desks){
      const def=l11DecorDef('l11_'+f.key)!,c=Math.cos(f.angle),s=Math.sin(f.angle)
      const candidates:Point[]=[]
      if(shop){for(const side of [0,-.45,.45])candidates.push([f.x-s*(def.d/2+.58)+c*side,f.y+c*(def.d/2+.58)+s*side])}
      else for(const side of [-1,1])for(const depth of [-.55,.55,0])candidates.push([f.x+c*side*(def.w/2+.6)-s*depth,f.y+s*side*(def.w/2+.6)+c*depth])
      const home=candidates.find(p=>clearInRoom(b,r,furniture,p));if(!home)continue
      const clearLine=(a:Point,end:Point)=>{const n=Math.ceil(Math.hypot(end[0]-a[0],end[1]-a[1])/.2);for(let k=0;k<=n;k++)if(!clearInRoom(b,r,furniture,[a[0]+(end[0]-a[0])*k/Math.max(1,n),a[1]+(end[1]-a[1])*k/Math.max(1,n)]))return false;return true}
      const stops:Point[]=[home]
      const choices:Point[]=shop?[-.65,.65].map(t=>[home[0]+c*t,home[1]+s*t]):[[r.x+r.w/2,r.y+r.h/2],...Array.from({length:10},(_,i):Point=>[r.x+.7+l11Rand(seed,i,951)*(r.w-1.4),r.y+.7+l11Rand(seed,i,952)*(r.h-1.4)])]
      for(const p of choices)if(stops.length<4&&Math.hypot(p[0]-home[0],p[1]-home[1])<5&&Math.hypot(p[0]-home[0],p[1]-home[1])>.5&&clearLine(home,p))stops.push(p)
      homes.push({id:r.id+':faceling',role:shop?'shopkeeper':'office',seed,position:l11World(b,...home),facing:b.angle+Math.atan2(f.y-home[1],f.x-home[0]),floor:r.floor as 0|1|2,buildingId:b.id,roomId:r.id,fixtureId:f.id,stops:stops.map(p=>l11World(b,...p))})
      break
    }
  }
  return homes
}

/** Stable ownership is by the actual feet position, so cross-chunk rooms never
 * duplicate residents. Decoration revisions do not reroll their occupations. */
export function addL11Facelings(raw:GenChunk){
  const data=raw.l11! ,{seed,cx,cy}=data,x0=cx*32,y0=cy*32
  const owns=(p:Point)=>Math.floor(p[0]/32)===cx&&Math.floor(p[1]/32)===cy
  for(const b of data.buildings)for(const home of l11IndoorFacelingHomes(b))if(owns(home.position))raw.entities.push({type:'faceling',x:home.position[0],y:home.position[1],z:b.base+home.floor*3+.03,calm:true,facing:home.facing,l11Home:home})
  if(Math.hypot(x0+16,y0+16)<55||l11Rand(seed,cx,cy,953)>.5)return
  // Keep away from chunk edges so neighbouring owned props cannot cover a spawn.
  const start=l11Hash(seed,cx,cy,954)%784
  for(let k=0;k<784;k++){
    const i=(start+k*83)%784,x=x0+2.5+i%28,y=y0+2.5+Math.floor(i/28)
    if(l11PedestrianSurface(data,x,y)!=='sidewalk')continue
    if(raw.structures.some(s=>s.solid&&!s.l11&&(s.floor??0)===0&&x>s.x-.5&&x<s.x+s.w+.5&&y>s.y-.5&&y<s.y+s.h+.5))continue
    const road=data.roads.reduce((best,r)=>{
      const d=Math.min(...r.points.slice(1).map((p,i)=>segmentDistance(x,y,r.points[i],p)))
      return d<best.d?{d,r}:best
    },{d:Infinity,r:data.roads[0]})
    const a=road.r?.points[0],b=road.r?.points[1],facing=a&&b?Math.atan2(b[1]-a[1],b[0]-a[0])+(l11Rand(seed,cx,cy,955)<.5?Math.PI:0):0
    const home:L11FacelingHome={id:`l11:${seed}:pedestrian:${cx}:${cy}`,role:'pedestrian',seed:l11Hash(seed,cx,cy,956),position:[x,y],facing,floor:0}
    raw.entities.push({type:'faceling',x,y,z:l11StreetHeight(data,x,y)+.03,calm:true,facing,l11Home:home});break
  }
}
