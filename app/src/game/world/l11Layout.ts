// One spatial description for workers, physics, near meshes and the skyline.
import { clipping, rectangle, transform, strip, bounds, area, inPolygon, circlePolygon, segmentDistance, intersects, type Polygon, type Point, type MultiPolygon } from './l11Geometry'
import { L11_BUILDINGS, L11_FLOOR_RANGES, l11Archetype, type L11Archetype } from '../content/l11Buildings'
import { l11EntranceFootprint,l11EntranceSurface } from './l11Entrance'
import { l11InteriorPlan } from './l11Interiors'
import { l11TerrainHeight,l11CanalAt,l11BridgeArch,l11BridgeRegion,joinL11BridgeArches,l11StreetHeight,L11_CANAL_BED,L11_BRIDGE_TOP_LIFT } from './l11Hydrology'
import { l11ArchitectureFor,l11ArchitectureVolumes,L11_ARCHITECTURE } from '../content/l11Architecture'
import { l11QuayWing } from './l11QuayWing'
import { l11Twins } from './l11Twins'
import { l11MetroRampHeight } from './l11Metro'
import { l11PlanCrosswalks } from './l11RoadMarkings'
import { planL11ExitBuildings,l11ExteriorExit,L11_ROAD_EXITS } from './l11ExitPlan'
import { l11ReferenceRegion,l11ReferenceCanalX,l11CanalWidth,L11_REFERENCE_SEED,L11_REFERENCE_RESERVES,L11_REFERENCE_LOTS,type L11ReferenceLot } from './l11ReferenceDistrict'
export { l11TerrainHeight } from './l11Hydrology'
import type { L11Building, L11CityPlan, L11Road, L11Variant, L11Volume, L11ChunkData, L11Stair } from './l11Types'
export type * from './l11Types'
export const L11_CS=32, L11_MACRO=1024, L11_VERSION=3
export type L11EntrySource=9|10|'beta'|'default'
export const L11_VARIANT_NAMES:Record<L11Variant,string>={lowrise:'多层住宅区',apartments:'中层公寓区',mixed:'混合街区',highrise:'高层办公区',industrial:'工业与运河区',park:'市政公园区',transit:'交通枢纽区'}
export const L11_VARIANT_LORE=Object.fromEntries(Object.entries(L11_VARIANT_NAMES).map(([k,v])=>[k,[`${v}：道路、河岸和建筑保持稳定；无人照看的城市设施仍在运作。`]]))
export function l11Hash(...ns:number[]){let h=0x811c9dc5;for(const n of ns){h^=n>>>0;h=Math.imul(h,0x01000193);h^=h>>>13;h=Math.imul(h,0x85ebca6b);h^=h>>>16}return h>>>0}
export const l11Rand=(...n:number[])=>l11Hash(...n)/4294967296
export const L11_SPAWNS={9:{x:26.5,y:91.5},10:{x:93.5,y:26.5},beta:{x:26.5,y:26.5},default:{x:26.5,y:26.5}}
export const l11Anchors=(_seed:number)=>({archive:{x:52,y:76,radius:24},metro:{x:27.5,y:120,radius:12},L9:{...L11_ROAD_EXITS[0],radius:2},L10:{...L11_ROAD_EXITS[1],radius:2}})
export const L11_USES=['住宅','办公楼','商住楼','商店','停车楼','学校','公共档案馆','工业设施','交通站','博物馆','体育馆']
const macroAt=(v:number)=>Math.floor((v-16)/L11_MACRO),mod=(n:number,d:number)=>((n%d)+d)%d
export function l11CanalX(seed:number,stripe:number,y:number){return l11ReferenceCanalX(seed,stripe,y,stripe*1024+700+Math.sin(y/310+(l11Hash(seed,31)%100)/20)*43+Math.sin(y/790)*22)}
function densityAt(seed:number,x:number,y:number){let value=0;const mx=macroAt(x),my=macroAt(y);for(let j=my-1;j<=my+1;j++)for(let i=mx-1;i<=mx+1;i++)for(let k=0;k<2;k++){const cx=i*1024+230+l11Rand(seed,i,j,k,21)*570,cy=j*1024+220+l11Rand(seed,i,j,k,22)*580;value=Math.max(value,Math.exp(-Math.hypot(x-cx,y-cy)/210))}return value}
export function l11VariantAt(seed:number,x:number,y:number):L11Variant {if(Math.abs(x)<180&&Math.abs(y)<180)return 'lowrise';const d=densityAt(seed,x,y),r=l11Rand(seed,Math.floor(x/256),Math.floor(y/256),41),bank=Math.abs(x-l11CanalX(seed,Math.floor(x/1024),y));return r>.94?'park':bank<135&&r<.48?'industrial':r>.88?'transit':d>.62?'highrise':d>.39?'apartments':d>.25?'mixed':'lowrise'}
export const l11VariantOf=(seed:number,cx:number,cy:number)=>l11VariantAt(seed,cx*32+16,cy*32+16)
export function l11Volumes(archetype:L11Archetype,w:number,d:number,floors:number):L11Volume[]{
  const H=Math.max(3,floors)*3,podium=Math.min(9,H),shape=l11Archetype(archetype).shape,box=(x:number,y:number,a:number,b:number,lo=0,hi=H,roof?:L11Volume['shape']):L11Volume=>({x,y,w:a,d:b,lo,hi,shape:roof})
  switch(shape){
    case 'slab':return [box(0,0,w,d*.72),box(w*.38,d*.72,w*.24,d*.28,0,podium)]
    case 'court':return [box(0,0,w,d*.24),box(0,d*.24,w*.23,d*.76),box(w*.77,d*.24,w*.23,d*.76),box(w*.23,d*.78,w*.54,d*.22)]
    case 'corner':return [box(0,0,w,d*.44),box(0,d*.44,w*.43,d*.56)]
    case 'row':return [box(0,0,w,d*.72,0,H,'gable')]
    case 'house':return [box(w*.12,d*.1,w*.73,d*.65,0,H,'gable'),box(w*.3,d*.75,w*.4,d*.18,0,podium)]
    case 'tower':return [box(0,0,w,d,0,podium),box(w*.14,d*.12,w*.72,d*.74,podium,H)]
    case 'steps':{const low=Math.max(9,Math.floor(floors*.45)*3),mid=Math.max(low+3,Math.floor(floors*.75)*3);return [box(0,0,w,d,0,low),box(w*.08,d*.1,w*.84,d*.8,low,mid),box(w*.18,d*.2,w*.64,d*.6,mid,H)]}
    case 'round':return [box(0,0,w,d,0,H,'round')]
    case 'twins':return [box(0,0,w,d,0,podium),box(w*.04,d*.1,w*.38,d*.75,podium,H),box(w*.6,d*.18,w*.36,d*.72,podium,Math.max(podium,Math.floor(floors*.88)*3))]
    case 'strip':return [box(0,0,w,d*.64)]
    case 'shed':return [box(0,0,w,d*.9),box(w*.72,d*.9,w*.28,d*.1,0,podium)]
    case 'parking':return [box(0,0,w,d),box(w*.85,0,w*.15,d*.28,0,H+2)]
    case 'hotel':return [box(0,0,w,d*.32),box(0,d*.32,w*.28,d*.68),box(w*.72,d*.32,w*.28,d*.68)]
    case 'sawtooth':return [box(0,0,w,d,0,Math.max(H,4),'sawtooth')]
    case 'factory':return [box(0,0,w*.75,d,0,H),box(w*.75,0,w*.25,d*.5,0,Math.max(6,H))]
    case 'warehouse':return [box(0,0,w,d*.8,0,H,'gable'),box(0,d*.8,w*.22,d*.2,0,podium)]
    case 'workshop':return [box(0,0,w*.7,d,0,H,'gable'),box(w*.7,0,w*.3,d*.5,0,podium)]
    case 'utility':return [box(0,0,w,d*.42),box(w*.65,d*.42,w*.35,d*.4,0,H+3)]
    case 'pump':return [box(0,0,w*.72,d*.7,0,H,'gable'),box(w*.72,0,w*.28,d*.45,0,H+3)]
    case 'archive':return [box(0,0,w,d*.35),box(0,d*.35,w*.42,d*.65),box(w*.58,d*.35,w*.42,d*.65)]
    case 'school':return [box(0,0,w,d*.3),box(0,d*.3,w*.3,d*.7),box(w*.7,d*.3,w*.3,d*.7)]
    case 'museum':return [box(0,0,w,d*.38,0,podium),box(w*.12,d*.38,w*.76,d*.62)]
    case 'hall':return [box(0,0,w,d,0,H,'barrel')]
    case 'station':return [box(0,0,w,d*.45,0,H,'barrel'),box(0,d*.45,w*.25,d*.55,0,podium)]
    case 'municipal':return [box(0,0,w,d*.4),box(w*.25,d*.4,w*.5,d*.6),box(w*.38,d*.05,w*.24,d*.24,H,H+3)]
    default:return [box(0,0,w,d)]
  }
}
export function l11VolumePolygon(v:L11Volume):Polygon {if(v.shape!=='round')return rectangle(v.x,v.y,v.w,v.d);const r=Math.min(v.w,v.d)*.2,points:Point[]=[];for(const [cx,cy,start]of [[v.x+v.w-r,v.y+r,-Math.PI/2],[v.x+v.w-r,v.y+v.d-r,0],[v.x+r,v.y+v.d-r,Math.PI/2],[v.x+r,v.y+r,Math.PI]])for(let i=0;i<=4;i++){const a=start+i*Math.PI/8;points.push([cx+Math.cos(a)*r,cy+Math.sin(a)*r])}points.push(points[0]);return [points]}
export function l11Local(b:Pick<L11Building,'ox'|'oy'|'angle'>,x:number,y:number):Point {const c=Math.cos(b.angle),s=Math.sin(b.angle),u=x-b.ox,v=y-b.oy;return [u*c+v*s,-u*s+v*c]}
export function l11World(b:Pick<L11Building,'ox'|'oy'|'angle'>,x:number,y:number):Point {const c=Math.cos(b.angle),s=Math.sin(b.angle);return [b.ox+x*c-y*s,b.oy+x*s+y*c]}
export const l11Door=(b:L11Building)=>({x:b.door[0],y:b.door[1]})
export function l11BuildingColumns(b:L11Building):Point[]{
  if(l11Archetype(b.archetype).facade!=='colonnade')return []
  const a=b.doorAngle-b.angle,nx=Math.sin(a),ny=-Math.cos(a)
  return [-4,-2,2,4].map(t=>[b.doorLocal[0]+Math.cos(a)*t+nx*.65,b.doorLocal[1]+Math.sin(a)*t+ny*.65])
}
function makeBuilding(worldSeed:number,seed:number,id:string,x:number,y:number,w:number,d:number,angle:number,archetype:L11Archetype,district:L11Variant,blockId:string,front:L11Building['front']='n',design?:L11ReferenceLot):L11Building {
  const spec=l11Archetype(archetype),density=densityAt(worldSeed,x,y),r=l11Rand(seed,3)
  const [min,max]=L11_FLOOR_RANGES[archetype],floors=design?.floors??Math.min(max,min+Math.round((max-min)*Math.min(1,density*.85+l11Rand(seed,413)*.3)))
  const choices=L11_REFERENCE_LOTS.filter(l=>l.archetype===archetype),exemplar=!design&&seed%4!==0?choices[(seed>>>9)%choices.length]:undefined
  const architecture=design?.architecture??exemplar?.architecture??(!design&&!exemplar?l11ArchitectureFor(archetype,seed):undefined),profile=design?.profile??exemplar?.profile??(architecture?L11_ARCHITECTURE[architecture].profile:undefined)
  const terraced=architecture==='stone-terrace'||architecture==='glazed-terrace'
  const gardenEntry=!design&&terraced&&(seed>>>12)%3===0&&w>=26&&d>=26
  const quayEntry=architecture==='ribbon-twins'&&(front==='e'||front==='w')&&w>=28&&d>=28&&(design?design.accessible>0:l11Hash(seed,199)%3!==0)
  const gardenWidth=Math.min(22,(front==='e'||front==='w'?d:w)-11)
  // A grand entrance consumes its own private forecourt. Recess the building
  // before lot/interior planning so gardens never steal the public pavement.
  if(gardenEntry){const c=Math.cos(angle),s=Math.sin(angle);if(front==='w'){x+=c*7;y+=s*7;w-=7}else if(front==='e')w-=7;else if(front==='n'){x-=s*7;y+=c*7;d-=7}else d-=7}
  if(quayEntry&&!design){if(front==='w'){x+=Math.cos(angle)*5;y+=Math.sin(angle)*5}w-=5}
  // Preserve complete storeys when adapting an exemplar to its district height.
  const scaleHeight=(h:number)=>h===0?0:Math.min(floors*3,Math.max(9,Math.round(h/exemplar!.floors*floors/3)*3))
  const templateVolumes=exemplar?.volumes?.map(v=>({...v,x:v.x*w/exemplar.w,y:v.y*d/exemplar.d,w:v.w*w/exemplar.w,d:v.d*d/exemplar.d,lo:scaleHeight(v.lo),hi:scaleHeight(v.hi)})).filter(v=>v.hi>v.lo)
  const sealed=design?design.accessible===0:l11Hash(seed,199)%3===0,accessible=design?.accessible??(sealed?0:Math.min(floors,r<.7?1:r<.95?2:3)),volumes=design?.volumes??templateVolumes??(architecture?l11ArchitectureVolumes(architecture,w,d,floors,front):design||exemplar?[{x:0,y:0,w,d,lo:0,hi:floors*3}]:l11Volumes(archetype,w,d,floors)),ground=volumes.filter(v=>v.lo===0).map(l11VolumePolygon),localFootprint=clipping.union(ground[0],...ground.slice(1))[0]
  const target=front==='n'?-Math.PI/2:front==='s'?Math.PI/2:front==='w'?Math.PI:0
  let edge:[Point,Point]=[localFootprint[0][0],localFootprint[0][1]],score=-Infinity
  const ring=localFootprint[0];for(let i=0;i<ring.length-1;i++){const a=ring[i],b=ring[i+1],dx=b[0]-a[0],dy=b[1]-a[1],len=Math.hypot(dx,dy),q=(dy*Math.cos(target)-dx*Math.sin(target))/len*100+len;if(q>score&&len>3){edge=[a,b];score=q}}
  const quay=architecture==='quay-service-wing'?l11QuayWing(w,d,front):undefined
  const twins=architecture==='ribbon-twins'?l11Twins(w,d,front):undefined
  const dl:Point=quay?quay.point(quay.span*.83,quay.projection):twins?twins.point(twins.start+twins.gap/2,0):[(edge[0][0]+edge[1][0])/2,(edge[0][1]+edge[1][1])/2],footprint=transform(localFootprint,x,y,angle),bb=bounds(footprint),p=transform([[dl]],x,y,angle)[0][0]
  const entrance=design?.entrance??(quayEntry?{rise:1.2,run:4,width:Math.min(28,d*.34),gardens:false}:gardenEntry&&!sealed?{rise:2.1,run:6,width:gardenWidth,gardens:true}:terraced&&!sealed?{rise:.6,run:2.6,width:Math.min(12,(front==='e'||front==='w'?d:w)*.5),gardens:false}:undefined)
  const verticalSign=design?.verticalSign??(!design&&floors>=6&&seed%3===0&&['office','commercial'].includes(spec.group)?{id:(['pegasus','hotel','clinic','cinema'] as const)[(seed>>>6)%4],mount:(seed>>>8)%2?'flush' as const:'blade' as const,side:front}:undefined)
  return {id,...bb,ox:x,oy:y,width:w,depth:d,angle,base:l11TerrainHeight(worldSeed,x+w/2,y+d/2)+(entrance?.rise??0),floors,accessible,sealed,style:L11_BUILDINGS.indexOf(spec),finish:seed%6,use:spec.group==='residential'?0:spec.group==='office'?1:archetype==='archive'?6:archetype==='parking'?4:archetype==='school'?5:spec.group==='industrial'?7:archetype==='transit-station'?8:archetype==='museum'?9:archetype==='sports-hall'?10:3,front,district,seed,archetype,footprint,localFootprint,volumes,stairs:planStairs(localFootprint,w,d,accessible,dl),door:p,doorLocal:dl,doorAngle:Math.atan2(edge[1][1]-edge[0][1],edge[1][0]-edge[0][0])+angle,blockId,facadeProfile:profile,architecture,sourceRecipe:design?.key??exemplar?.key,verticalSign,entrance}
}
const cache=new Map<string,L11CityPlan>(),indices=new WeakMap<L11CityPlan,Map<string,L11Building[]>>()
const lineClip=(a:Point,b:Point,r:{x:number;y:number;w:number;h:number}):Point[]=>{let lo=0,hi=1;const dx=b[0]-a[0],dy=b[1]-a[1];for(const [p,q]of [[-dx,a[0]-r.x],[dx,r.x+r.w-a[0]],[-dy,a[1]-r.y],[dy,r.y+r.h-a[1]]]){if(Math.abs(p)<1e-10){if(q<0)return [];continue}const t=q/p;if(p<0)lo=Math.max(lo,t);else hi=Math.min(hi,t);if(lo>hi)return []}return [[a[0]+lo*dx,a[1]+lo*dy],[a[0]+hi*dx,a[1]+hi*dy]]}
const buffered=(points:Point[],width:number):MultiPolygon=>{
  const pieces=points.slice(1).map((p,i)=>strip(points[i],p,width))
  // Round joins close the triangular gaps between the butt ends of two segments.
  for(const p of points.slice(1,-1)){const ring:Point[]=Array.from({length:12},(_,i)=>[p[0]+Math.cos(i*Math.PI/6)*width/2,p[1]+Math.sin(i*Math.PI/6)*width/2]);ring.push(ring[0]);pieces.push([ring])}
  return pieces.length?clipping.union(pieces[0],...pieces.slice(1)):[]
}
export function l11CityPlan(seed:number,mx:number,my:number,forced?:L11Variant):L11CityPlan {
  const key=`${L11_VERSION}:${seed}:${mx}:${my}:${forced??''}`,hit=cache.get(key);if(hit)return hit
  // Keep existing lot/prop/save identities stable when the planning cache version advances.
  const x=mx*1024+16,y=my*1024+16,rect={x,y,w:1024,h:1024},domain=rectangle(x,y,1024,1024),id=`l11v2:${seed}:${mx}:${my}`
  const plan:L11CityPlan={version:L11_VERSION,seed,mx,my,id,bounds:rect,canals:[],roads:[],blocks:[],buildings:[],alleys:[],bridges:[],stages:['terrain','roads','blocks','buildings','alleys','dressing'],boundary:{north:`h:${mx}:${my}`,south:`h:${mx}:${my+1}`,west:`v:${mx}:${my}`,east:`v:${mx+1}:${my}`}}
  // 1. Terrain/water. The sample positions are world anchored across every boundary.
  const pts:Point[]=[];for(let q=y-32;q<=y+1056;q+=32)pts.push([l11CanalX(seed,mx,q),q])
  const reference=l11ReferenceRegion(seed,mx,my)&&!forced,canalWidth=l11CanalWidth(seed),fullWater=buffered(pts,canalWidth),water=clipping.intersection(fullWater,domain),banks=clipping.intersection(buffered(pts,canalWidth+12),domain)
  const pedestrianQuay=seed===L11_REFERENCE_SEED||l11Hash(seed,mx,87)%3===0
  plan.canals.push({id:`canal:${seed}:${mx}:${my}`,points:pts,width:canalWidth,water,banks,pedestrian:pedestrianQuay})
  // 2. Shared arterials, district collectors and waterfront curves.
  const road=(rid:string,points:Point[],width:number,cls:L11Road['class'],pedestrian=false)=>{if(points.length<2)return;const poly=clipping.intersection(buffered(points,width),domain);if(!poly.length)return;plan.roads.push({id:rid,points,width,sidewalk:3,class:cls,...(pedestrian?{pedestrian:true}:{}),polygon:poly,bounds:bounds(poly)})}
  for(let k=0;k<=2;k++){road(`h:${seed}:${mx}:${my*2+k}`,[[x,y+k*512],[x+1024,y+k*512]],k===1?14:18,'arterial');road(`v:${seed}:${mx*2+k}:${my}`,[[x+k*512,y],[x+k*512,y+1024]],k===1?14:18,'arterial')}
  const districts:{r:typeof rect;angle:number}[]=[]
  for(let j=0;j<2;j++)for(let i=0;i<2;i++){
    const r={x:x+i*512,y:y+j*512,w:512,h:512},angle=reference||mx===0&&my===0&&i===0&&j===0?0:([0,Math.PI/12,-Math.PI/10,Math.PI/6][l11Hash(seed,mx,my,i,j,51)%4])
    districts.push({r,angle});const c=Math.cos(angle),s=Math.sin(angle),pitch=mx===0&&my===0&&i===0&&j===0?128:96+l11Hash(seed,mx,my,i,j,52)%3*16
    if(reference&&j===1)continue
    for(let axis=0;axis<2;axis++)for(let k=-3;k<=3;k++){const a:Point=axis?[k*pitch,-500]:[-500,k*pitch],b:Point=axis?[k*pitch,500]:[500,k*pitch],rot=(p:Point):Point=>[r.x+256+p[0]*c-p[1]*s,r.y+256+p[0]*s+p[1]*c];const avenue=reference&&i===0&&axis===1&&k===0;road(`${id}:grid:${i}:${j}:${axis}:${k}`,lineClip(rot(a),rot(b),r),avenue?20:k===0?10:8,avenue?'arterial':k===0?'collector':'local')}
  }
  if(reference){
    for(const q of [562,616,784,912])road(`${id}:housing-road:${q}`,[[16,q],[528,q]],q===562||q===616?14:10,'collector')
    for(const q of [224,400])road(`${id}:housing-link:${q}`,[[q,528],[q,1040]],10,'collector')
    for(const q of [676,816,976])road(`${id}:quay-crossing:${q}`,[[528,q],[1040,q]],12,'collector')
    for(const q of [576,944])road(`${id}:quay-service:${q}`,[[q,528],[q,1040]],8,'local')
  }
  // Whole canal stripes share the same traffic policy across macro seams.
  for(const side of [-1,1])road(`${id}:quay:${side}`,pts.map(p=>[p[0]+side*(canalWidth/2+14),p[1]]),7,'waterfront',pedestrianQuay)
  for(const r of plan.roads)for(const whole of clipping.intersection(buffered(r.points,r.width+6),fullWater))for(const p of clipping.intersection(whole,domain))if(area(p)>2)plan.bridges.push({id:`bridge:${r.id}:${plan.bridges.length}`,roadId:r.id,polygon:p,arch:l11BridgeArch(r,whole)})
  joinL11BridgeArches(plan.bridges)
  const roadLand=plan.roads.map(r=>buffered(r.points,r.width+2*r.sidewalk)),obstacles=clipping.union(banks,...roadLand),reserved=rectangle(28,54,52,48)
  // 3. Blocks are connected land polygons enclosed by streets and banks.
  for(const {r,angle}of districts){const ps=clipping.difference(rectangle(r.x,r.y,r.w,r.h),obstacles,...(mx===0&&my===0?[reserved]:[]));ps.sort((a,b)=>bounds(a).y-bounds(b).y||bounds(a).x-bounds(b).x);for(const polygon of ps){if(area(polygon)<550)continue;const bb=bounds(polygon),cx=bb.x+bb.w/2,cy=bb.y+bb.h/2;plan.blocks.push({id:`${id}:block:${plan.blocks.length}`,polygon,angle,district:forced??l11VariantAt(seed,cx,cy),density:densityAt(seed,cx,cy),waterfront:Math.abs(cx-l11CanalX(seed,mx,cy))<110})}}
  // 4. Lots follow each block's frame. Setbacks reserve a four metre service gap.
  for(const block of plan.blocks){const frame=transform(block.polygon,0,0,-block.angle),bb=bounds(frame),gap=4,pitch=30+l11Hash(seed,Math.round(bb.x),Math.round(bb.y),61)%3*3,cols=Math.max(1,Math.floor(bb.w/pitch)),rows=Math.max(1,Math.floor(bb.h/pitch)),sw=bb.w/cols,sh=bb.h/rows;if(block.district==='park')continue
    for(let j=0;j<rows;j++)for(let i=0;i<cols;i++){
      if(cols>2&&rows>2&&i>0&&j>0&&i<cols-1&&j<rows-1)continue
      const u=bb.x+i*sw+gap/2,v=bb.y+j*sh+gap/2,w=Math.min(38,sw-gap),d=Math.min(38,sh-gap);if(w<14||d<14)continue
      if(clipping.difference(rectangle(u-.65,v-.65,w+1.3,d+1.3),frame).some(p=>area(p)>.01))continue
      const c=Math.cos(block.angle),s=Math.sin(block.angle),ox=u*c-v*s,oy=u*s+v*c,hs=l11Hash(seed,Math.round(u*10),Math.round(v*10),71),family=block.district==='industrial'?3:block.district==='highrise'?1:block.district==='lowrise'?0:block.district==='transit'?4:hs%5,spec=L11_BUILDINGS[family*6+hs%6]
      const center=l11World({ox,oy,angle:block.angle},w/2,d/2)
      let nearest:Point=[0,0],nearestDistance=Infinity
      for(const road of plan.roads)for(let k=1;k<road.points.length;k++){
        const a=road.points[k-1],p=road.points[k],dx=p[0]-a[0],dy=p[1]-a[1],t=Math.max(0,Math.min(1,((center[0]-a[0])*dx+(center[1]-a[1])*dy)/(dx*dx+dy*dy||1))),point:Point=[a[0]+dx*t,a[1]+dy*t],distance=Math.hypot(point[0]-center[0],point[1]-center[1])
        if(distance<nearestDistance){nearestDistance=distance;nearest=point}
      }
      const dir=l11Local({ox,oy,angle:block.angle},nearest[0],nearest[1]),front=Math.abs(dir[0]-w/2)>Math.abs(dir[1]-d/2)?dir[0]<w/2?'w':'e':dir[1]<d/2?'n':'s'
      if(reference&&L11_REFERENCE_RESERVES.some(r=>intersects(r,{x:ox,y:oy,w,h:d})))continue
      plan.buildings.push(makeBuilding(seed,hs,`${block.id}:lot:${i}:${j}`,ox,oy,w,d,block.angle,spec.id,block.district,block.id,front))
    }
  }
  if(reference)for(const lot of L11_REFERENCE_LOTS){
    const block=plan.blocks.find(b=>inPolygon(lot.x+lot.w/2,lot.y+lot.d/2,b.polygon))
    if(!block)throw Error('Reference lot outside a city block: '+lot.key)
    const b=makeBuilding(seed,l11Hash(seed,lot.x,lot.y,71),`${id}:reference:${lot.key}`,lot.x,lot.y,lot.w,lot.d,0,lot.archetype,lot.profile==='brick-apartments'?'apartments':'highrise',block.id,lot.front,lot)
    if(clipping.difference(b.footprint,block.polygon).some(p=>area(p)>.01))throw Error('Reference lot intersects street or bank: '+lot.key)
    plan.buildings.push(b)
  }
  if(mx===0&&my===0){const archive=makeBuilding(seed,l11Hash(seed,601),'l11:public-archive',36,62,36,30,0,'archive','mixed','l11:archive-block','w');archive.sealed=false;archive.accessible=2;archive.floors=4;archive.base=0;archive.volumes=l11Volumes('archive',36,30,4);archive.stairs=planStairs(archive.localFootprint,36,30,2,archive.doorLocal);plan.buildings.push(archive)}
  planL11ExitBuildings(plan,(old,kind)=>{
    // The reference brick front is a narrow urban frontage, not a warehouse
    // stretched across the entire old lot. Retain its street-facing edge.
    const brick=kind==='l11brickdoor',ns=old.front==='n'||old.front==='s',w=brick&&ns?Math.min(old.width,13):old.width,d=brick&&!ns?Math.min(old.depth,13):old.depth
    const ox=(old.width-w)/2,oy=(old.depth-d)/2,[x,y]=l11World(old,ox,oy)
    const b=makeBuilding(seed,old.seed,old.id,x,y,w,d,old.angle,brick?'barred-brick':'unfinished-frame',old.district,old.blockId,old.front)
    b.sealed=kind!=='l11liftshaft';b.accessible=b.sealed?0:1;b.stairs=[]
    const a=b.doorAngle-b.angle
    if(kind==='l11brickdoor'){
      const shift=(b.front==='n'||b.front==='s'?b.width:b.depth)*.29
      b.doorLocal=[b.doorLocal[0]+Math.cos(a)*shift,b.doorLocal[1]+Math.sin(a)*shift];b.door=l11World(b,...b.doorLocal)
    }
    b.exit=kind==='l11liftshaft'?{kind,center:[b.width/2,b.depth/2],angle:a,floor:0,width:2}:l11ExteriorExit(b,kind)
    return b
  })
  const archive=plan.buildings.find(b=>b.id==='l11:public-archive')
  if(archive)archive.exit={kind:'basebeta',center:[.24,25],angle:Math.PI/2,floor:0,width:1.4}
  for(const b of plan.buildings)if(b.entrance){const p=l11EntranceFootprint(b),bb=bounds(p);if(plan.roads.some(r=>intersects(bb,r.bounds)&&clipping.intersection(p,r.polygon).some(q=>area(q)>.001))||plan.canals.some(c=>intersects(bb,bounds(c.water))&&clipping.intersection(p,c.water).some(q=>area(q)>.001))||plan.buildings.some(other=>other!==b&&intersects(bb,other)&&clipping.intersection(p,other.footprint).some(q=>area(q)>.001))){b.base-=b.entrance.rise;delete b.entrance}}
  // 5. Alleys/courtyard connections are the connected residual space after building placement.
  for(const block of plan.blocks){const buildings=plan.buildings.filter(b=>b.blockId===block.id);if(!buildings.length)continue;for(const polygon of clipping.difference(block.polygon,...buildings.map(b=>b.footprint)))plan.alleys.push({id:`${block.id}:alley:${plan.alleys.length}`,polygon,width:4,buildingIds:buildings.map(b=>b.id)})}
  cache.set(key,plan);while(cache.size>12)cache.delete(cache.keys().next().value!);return plan
}
function buildingBounds(b:L11Building){if(!b.entrance)return b;const e=bounds(l11EntranceFootprint(b)),x=Math.min(b.x,e.x),y=Math.min(b.y,e.y);return {x,y,w:Math.max(b.x+b.w,e.x+e.w)-x,h:Math.max(b.y+b.h,e.y+e.h)-y}}
function indexed(plan:L11CityPlan){let index=indices.get(plan);if(index)return index;index=new Map();for(const b of plan.buildings){const bb=buildingBounds(b);for(let y=Math.floor(bb.y/32);y<=Math.floor((bb.y+bb.h)/32);y++)for(let x=Math.floor(bb.x/32);x<=Math.floor((bb.x+bb.w)/32);x++){const k=`${x}:${y}`,a=index.get(k)??[];a.push(b);index.set(k,a)}}indices.set(plan,index);return index}
export function l11Buildings(seed:number,x0:number,y0:number,x1:number,y1:number,forced?:L11Variant):L11Building[]{const out:L11Building[]=[],seen=new Set<string>(),rect={x:x0,y:y0,w:x1-x0,h:y1-y0};for(let my=macroAt(y0);my<=macroAt(y1);my++)for(let mx=macroAt(x0);mx<=macroAt(x1);mx++){const plan=l11CityPlan(seed,mx,my,forced);if(x1-x0>64||y1-y0>64){for(const b of plan.buildings)if(intersects(buildingBounds(b),rect))out.push(b);continue}const index=indexed(plan);for(let cy=Math.floor(y0/32);cy<=Math.floor(y1/32);cy++)for(let cx=Math.floor(x0/32);cx<=Math.floor(x1/32);cx++)for(const b of index.get(`${cx}:${cy}`)??[]){if(!seen.has(b.id)&&intersects(buildingBounds(b),rect)){seen.add(b.id);out.push(b)}}}return out}
export function l11ChunkData(seed:number,cx:number,cy:number,forced?:L11Variant):L11ChunkData {
  const rect={x:cx*32,y:cy*32,w:32,h:32},plans:L11CityPlan[]=[]
  for(let my=macroAt(rect.y);my<=macroAt(rect.y+32);my++)for(let mx=macroAt(rect.x);mx<=macroAt(rect.x+32);mx++)plans.push(l11CityPlan(seed,mx,my,forced))
  return {version:L11_VERSION,seed,cx,cy,macroIds:plans.map(p=>p.id),
    buildings:l11Buildings(seed,rect.x,rect.y,rect.x+32,rect.y+32,forced),
    roads:plans.flatMap(p=>p.roads.filter(r=>intersects(r.bounds,{x:rect.x-r.sidewalk,y:rect.y-r.sidewalk,w:rect.w+r.sidewalk*2,h:rect.h+r.sidewalk*2}))),
    crosswalks:[...new Map(l11PlanCrosswalks(plans).filter(c=>{
      const r=c.width/2+3;return c.center[0]+r>=rect.x&&c.center[0]-r<=rect.x+32&&c.center[1]+r>=rect.y&&c.center[1]-r<=rect.y+32
    }).map(c=>[c.id,c])).values()],
    canals:plans.flatMap(p=>p.canals.filter(c=>intersects(bounds(c.banks),rect))),
    bridges:plans.flatMap(p=>p.bridges.filter(b=>intersects(bounds(l11BridgeRegion(b)),rect)||intersects(bounds(b.polygon),rect))),
    alleys:plans.flatMap(p=>p.alleys.filter(a=>intersects(bounds(a.polygon),rect)))}
}
export interface L11Surface {kind:'road'|'sidewalk'|'yard'|'grass'|'canal'|'bridge'|'plaza';roadX:boolean;marking:boolean;crosswalk:boolean;angle:number;height:number}
export function l11SurfaceAt(seed:number,x:number,y:number,forced?:L11Variant,data?:Pick<L11ChunkData,'roads'|'canals'>&Partial<Pick<L11ChunkData,'bridges'>>):L11Surface {
  const plan=data??l11CityPlan(seed,macroAt(x),macroAt(y),forced)
  let best=Infinity,chosen:L11Road|undefined,angle=0,motorInside=false
  for(const road of plan.roads){
    if(!intersects(road.bounds,{x:x-4,y:y-4,w:8,h:8}))continue
    for(let i=1;i<road.points.length;i++){
      const a=road.points[i-1],b=road.points[i],edge=segmentDistance(x,y,a,b)-road.width/2,inside=!road.pedestrian&&edge<0
      // At a junction, the carriageway stays continuous across a footpath.
      if(inside&&!motorInside||inside===motorInside&&edge<best){best=edge;chosen=road;motorInside=inside;angle=Math.atan2(b[1]-a[1],b[0]-a[0])}
    }
  }
  const water=plan.canals.some(c=>c.water.some(p=>inPolygon(x,y,p))),bank=plan.canals.some(c=>c.banks.some(p=>inPolygon(x,y,p)))
  let kind:L11Surface['kind']=best<0?(water?'bridge':chosen?.pedestrian?'sidewalk':'road'):water?(best<3?'bridge':'canal'):best<3||bank?'sidewalk':(forced??l11VariantAt(seed,x,y))==='park'?'grass':'yard'
  if(x>28&&x<80&&y>54&&y<102&&kind==='yard')kind='plaza'
  return {kind,angle,roadX:Math.abs(Math.cos(angle))>.7,marking:!!chosen&&!chosen.pedestrian&&Math.abs(best+chosen.width/2)<.09&&mod(x*Math.cos(angle)+y*Math.sin(angle),8)<4,crosswalk:false,height:l11StreetHeight({seed,bridges:plan.bridges??[]},x,y)}
}
/** Compatibility for design tools; the city planner does not use this axis grid. */
export function l11Axis(p:number){const lo=Math.floor((p-16)/512)*512+16,hi=lo+512,road=p-lo<hi-p?lo:hi;return {lo,hi,road,width:18,distance:Math.abs(p-road),block:Math.floor((p-16)/512)}}
export const l11MetroRamp=l11MetroRampHeight
export function l11MetroAt(x:number,y:number){const dx=mod(x-16+4,512)-4,sy=Math.floor((y-120)/512)*512+120,sx=Math.floor((x-12)/512)*512+16;return Math.abs(dx)<4||(x>sx-4&&x<sx+14&&y>=sy+10&&y<sy+16)}
export function l11StairRect(stair:L11Stair,pad=0):Polygon {
  return rectangle(stair.x-pad,stair.y-pad,(stair.axis==='x'?stair.length:stair.width)+pad*2,(stair.axis==='y'?stair.length:stair.width)+pad*2)
}
function planStairs(footprint:Polygon,w:number,d:number,floors:number,door?:Point):L11Stair[]{
  const result:L11Stair[]=[]
  for(let flight=0;flight<floors-1;flight++){
    let found:L11Stair|undefined
    for(const axis of ['y','x'] as const){
      // Reserve a full landing between the first riser and the facade. With a
      // 1m setback, the approaching body's radius intersected the 38cm wall.
      for(let y=1.5;y<d-2&&!found;y+=1)for(let x=1.5;x<w-2&&!found;x+=1){
        const stair:L11Stair={x,y,width:1.8,length:7,axis,flight},box=l11StairRect(stair,.8)
        if(door&&circlePolygon(...door,2.7,box)||result.some(p=>intersects(bounds(box),bounds(l11StairRect(p,.45)))))continue
        if(box[0].every(([a,b])=>inPolygon(a,b,footprint))&&!clipping.difference(box,footprint).some(p=>area(p)>.001))found=stair
      }
      if(found)break
    }
    if(!found)throw new Error('No accessible stair rectangle in building footprint')
    result.push(found)
  }
  return result
}
export function l11StairAt(b:L11Building,x:number,y:number,band:number):{height:number;flight:number}|null {
  const [u,v]=l11Local(b,x,y)
  for(const s of b.stairs){const t=s.axis==='y'?v-s.y:u-s.x,q=s.axis==='y'?u-s.x:v-s.y
    if(q>=0&&q<=s.width&&t>=0&&t<=s.length&&Math.abs(band-s.flight)<=1)return {height:b.base+s.flight*3+t*3/s.length,flight:s.flight}
  }
  return null
}
/** Shared room plan drives both rendering and precise collision. */
export const l11InteriorWalls=(b:L11Building)=>l11InteriorPlan(b).walls
export function l11SpaceAt(data:L11ChunkData,x:number,y:number,band:number,feet?:number){
  // A canal can lie below the metro's numeric floor-band threshold without
  // becoming a subway. Under a bridge, feet select riverbed versus road deck.
  const canal=l11CanalAt(data,x,y)
  if(canal){const onDeck=canal.bridge&&(feet===undefined||feet>=canal.bridge.bottom-.025);return {height:onDeck?canal.bridge!.top-L11_BRIDGE_TOP_LIFT:L11_CANAL_BED,walkable:!!onDeck||feet!==undefined,stair:false}}
  for(const b of data.buildings){const entry=l11EntranceSurface(b,x,y);if(entry!==null)return {height:entry,walkable:band===0,stair:true}}
  const ramp=l11MetroRamp(x,y,data.seed)
  if(ramp!==null)return {height:ramp,walkable:band<=0,stair:true}
  if(band<0)return {height:-5,walkable:l11MetroAt(x,y),blocked:!l11MetroAt(x,y),stair:false}
  const b=data.buildings.find(b=>x>=b.x&&x<=b.x+b.w&&y>=b.y&&y<=b.y+b.h&&inPolygon(x,y,b.footprint))
  if(b){const stair=l11StairAt(b,x,y,band);if(stair)return {height:stair.height,walkable:true,stair:true};return {height:b.base+band*3,walkable:!b.sealed&&band<b.accessible,stair:false}}
  return {height:l11StreetHeight(data,x,y),walkable:band===0,stair:false}
}
export function clearL11PlanCache(){cache.clear()}
/** Map UI must never synchronously generate a macroregion on the render thread. */
export function peekL11CityPlan(seed:number,mx:number,my:number){return cache.get(`${L11_VERSION}:${seed}:${mx}:${my}:`)}
export function acceptL11Plans(plans:L11CityPlan[]){for(const p of plans)if(p.version===L11_VERSION){cache.set(`${L11_VERSION}:${p.seed}:${p.mx}:${p.my}:`,p)}while(cache.size>24)cache.delete(cache.keys().next().value!)}
