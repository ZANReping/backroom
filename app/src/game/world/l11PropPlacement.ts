import { l11DecorDef } from '../content/l11Decor'
import { circlePolygon, rectangle, transform,inPolygon } from './l11Geometry'
import { l11MetroRamp, l11SurfaceAt,l11World, type L11Building, type L11ChunkData, type L11Variant } from './l11Layout'
import { l11FootprintsOverlap } from './l11Dressing'
import { l11EntranceFootprint } from './l11Entrance'
import { l11Shopfront } from './l11Shopfront'
import { l11QuayStairFootprint } from './l11QuayWing'
import { l11QuayPlanting } from './l11QuayPlanting'
import { l11ChunkCanalAccess } from './l11CanalAccess'
import { L11_ROAD_EXITS } from './l11ExitPlan'

/** Shared deterministic clearance rule for street props in streamed and distant views. */
export function l11StreetPropAllowed(seed:number,key:string,x:number,y:number,angle:number,neighbours:readonly L11Building[],plan:L11ChunkData,forced?:L11Variant){
  const d=l11DecorDef(`l11_${key}`);if(!d)return false
  const footprint=transform(rectangle(-d.w/2-.08,-d.d/2-.08,d.w+.16,d.d+.16),x,y,angle)
  if(L11_ROAD_EXITS.some(e=>circlePolygon(e.x+.5,e.y+.5,3.5,footprint)))return false
  if(l11ChunkCanalAccess(plan).some(p=>p.key==='canal_ladder'&&circlePolygon(p.landX,p.landY,1.3,footprint)))return false
  if(neighbours.some(b=>l11FootprintsOverlap(footprint,b.footprint)||b.entrance&&l11FootprintsOverlap(footprint,l11EntranceFootprint(b))||circlePolygon(...b.door,3.2,footprint))||circlePolygon(26.5,26.5,5,footprint))return false
  if(neighbours.some(b=>{const shop=l11Shopfront(b);return shop?.available&&circlePolygon(...l11World(b,...shop.door),2,footprint)}))return false
  if(neighbours.some(b=>b.architecture==='quay-service-wing'&&l11FootprintsOverlap(footprint,l11QuayStairFootprint(b))))return false
  if(neighbours.some(b=>l11QuayPlanting(b).some(bed=>l11FootprintsOverlap(footprint,bed.footprint))))return false
  // Keep non-road dressing out of the actual carriageway, including rotated
  // footprints. Road props (vehicles, drains and barriers) are intentionally
  // allowed here; bridge sidewalks remain valid because this is a polygon
  // overlap test rather than a blanket bridge rejection.
  if(!d.placement.includes('road')&&plan.roads.some(road=>road.polygon.some(polygon=>l11FootprintsOverlap(footprint,polygon))))return false
  // Motor traffic may cross a promenade only on an actual carriageway.
  if(['sedan','delivery_van','box_truck','taxi','bus','motor_scooter'].includes(key)&&plan.roads.some(r=>r.pedestrian&&r.polygon.some(p=>l11FootprintsOverlap(footprint,p)))&&!plan.roads.some(r=>!r.pedestrian&&r.polygon.some(p=>inPolygon(x,y,p))))return false
  if([[x,y],...footprint[0]].some(([px,py])=>l11MetroRamp(px,py)!==null||l11SurfaceAt(seed,px,py,forced,plan).kind==='canal'))return false
  return true
}
