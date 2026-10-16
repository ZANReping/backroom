import { ShapeUtils,Vector2 } from 'three'
import { clipping,rectangle,inPolygon,transform,bounds,area,type Polygon } from './l11Geometry'
import type { L11ChunkData,L11Bridge,L11Road } from './l11Types'
import { makeL11Solid,l11SolidCollider,l11SolidSurface,type SolidPoint,type L11SolidCollider } from './l11Solid'

// Absolute heights shared by the visible surface, riverbed, swimming and optics.
export const L11_WATER_SURFACE=-1.1
export const L11_WATER_DEPTH=5
export const L11_CANAL_BED=L11_WATER_SURFACE-L11_WATER_DEPTH
export const L11_BRIDGE_THICKNESS=.65
export const L11_BRIDGE_TOP_LIFT=.028
export const L11_HYDROLOGY_VERSION=3
export function l11TerrainHeight(seed:number,x:number,y:number){const fade=Math.min(1,Math.max(0,(Math.hypot(x,y)-180)/240));return fade*(Math.sin(x/620+seed%17)*.22+Math.sin(y/470)*.18)}

/** An arch is tied to the road axis, including rotated roads and macro seams. */
export function l11BridgeArch(road:L11Road,polygon:Polygon):NonNullable<L11Bridge['arch']>{
  const bb=bounds(polygon),x=bb.x+bb.w/2,y=bb.y+bb.h/2
  const segments=road.points.slice(1).map((b,i)=>{const a=road.points[i],len=Math.hypot(b[0]-a[0],b[1]-a[1]),axis:[number,number]=[(b[0]-a[0])/len,(b[1]-a[1])/len];return {a,axis,d:Math.abs((x-a[0])*axis[1]-(y-a[1])*axis[0])}}).sort((a,b)=>a.d-b.d)
  const {a:origin,axis}=segments[0],ts=polygon.flat().map(p=>(p[0]-origin[0])*axis[0]+(p[1]-origin[1])*axis[1]),start=Math.min(...ts),end=Math.max(...ts)
  return {origin,axis,start,end,width:road.width+6,rise:Math.min(1.35,Math.max(.65,(end-start)*.025)),approach:8}
}
/** Crossroads over water form one civil structure. Independent arches would
 * disagree at their junction and produce a step across the carriageway. */
export function joinL11BridgeArches(bridges:L11Bridge[]){
  const groups:number[][]=[]
  for(let i=0;i<bridges.length;i++){
    const hits=groups.filter(g=>g.some(j=>clipping.intersection(bridges[i].polygon,bridges[j].polygon).some(p=>area(p)>.001)))
    const joined=[i,...hits.flat()];for(const group of hits)groups.splice(groups.indexOf(group),1);groups.push(joined)
  }
  for(const group of groups){
    // Shared boundary arterials retain the profile computed from the complete
    // crossing on both banks of a macro boundary, before polygon clipping.
    const members=group.map(i=>bridges[i]),ref=[...members].sort((a,b)=>Number(b.roadId.startsWith('h:'))-Number(a.roadId.startsWith('h:'))||(a.arch!.end-a.arch!.start)-(b.arch!.end-b.arch!.start))[0].arch!,ps=members.flatMap(b=>b.polygon.flat()),ns=ps.map(p=>-(p[0]-ref.origin[0])*ref.axis[1]+(p[1]-ref.origin[1])*ref.axis[0]),offset=(Math.min(...ns)+Math.max(...ns))/2
    const arch={...ref,origin:[ref.origin[0]-ref.axis[1]*offset,ref.origin[1]+ref.axis[0]*offset] as [number,number],width:Math.max(...ns)-Math.min(...ns)+.002,owner:members.map(b=>b.id).sort()[0],deck:clipping.union(members[0].polygon,...members.slice(1).map(b=>b.polygon))}
    for(const b of members)b.arch=arch
  }
}
/** Include approach ramps in chunk queries as well as the water crossing. */
export function l11BridgeRegion(bridge:L11Bridge):Polygon {
  const b=bridge.arch;return b?transform(rectangle(b.start-b.approach,-b.width/2,b.end-b.start+2*b.approach,b.width),...b.origin,Math.atan2(b.axis[1],b.axis[0])):bridge.polygon
}
const along=(b:NonNullable<L11Bridge['arch']>,x:number,y:number)=>(x-b.origin[0])*b.axis[0]+(y-b.origin[1])*b.axis[1]
function archLift(b:NonNullable<L11Bridge['arch']>,t:number){
  const start=b.start-b.approach,span=b.end-b.start+b.approach*2,n=Math.ceil(span/2),step=span/n,k=Math.max(0,Math.min(n,(t-start)/step)),i=Math.floor(k)
  const at=(i:number)=>Math.sin(Math.PI*Math.min(n,i)/n)**2*b.rise
  return at(i)+(at(i+1)-at(i))*(k-i)
}
export function l11StreetHeight(data:Pick<L11ChunkData,'seed'|'bridges'>,x:number,y:number){
  let lift=0
  for(const {arch:b}of data.bridges)if(b&&Math.abs((x-b.origin[0])*b.axis[1]-(y-b.origin[1])*b.axis[0])<=b.width/2+.001){const t=along(b,x,y);if(t>=b.start-b.approach&&t<=b.end+b.approach)lift=Math.max(lift,archLift(b,t))}
  return l11TerrainHeight(data.seed,x,y)+lift
}
/** Split faces at the exact arch stations. Sampling only the four original
 * corners would flatten a road and make its collision disagree with its mesh. */
export function l11BridgeSurfaceParts(p:Polygon,bridges:readonly L11Bridge[]):Polygon[]{
  let remaining:Polygon[]=[p],out:Polygon[]=[]
  for(const {arch:b}of bridges){if(!b)continue
    const angle=Math.atan2(b.axis[1],b.axis[0]),span=b.end-b.start+2*b.approach,n=Math.ceil(span/2),step=span/n
    const region=transform(rectangle(b.start-b.approach,-b.width/2,span,b.width),...b.origin,angle)
    if(!clipping.intersection(remaining,region).length)continue
    for(let i=0;i<n;i++){const slice=transform(rectangle(b.start-b.approach+i*step,-b.width/2,step,b.width),...b.origin,angle);out.push(...clipping.intersection(remaining,slice))}
    remaining=clipping.difference(remaining,region)
  }
  return out.concat(remaining)
}
export interface L11BridgePier {polygon:Polygon;top:number;bottom:number}
export function l11BridgePiers(seed:number,bridge:L11Bridge):L11BridgePier[]{
  const b=bridge.arch;if(!b||b.end-b.start<14||b.owner&&b.owner!==bridge.id)return []
  // Crossroad supports are clipped to their real deck, never a bounding box
  // extending into open water. Only the shared structure's owner emits them.
  return [1/3,2/3].flatMap(f=>{
    const t=b.start+(b.end-b.start)*f,slice=transform(rectangle(t-.475,-b.width/2+.6,.95,b.width-1.2),...b.origin,Math.atan2(b.axis[1],b.axis[0]))
    return clipping.intersection(b.deck??[bridge.polygon],slice).filter(p=>area(p)>.1).map(polygon=>({polygon,top:Math.max(...polygon.flat().map(([x,y])=>l11TerrainHeight(seed,x,y)+archLift(b,along(b,x,y))))+L11_BRIDGE_TOP_LIFT-L11_BRIDGE_THICKNESS,bottom:L11_CANAL_BED-.35}))
  })
}
interface BridgeDeck {polygons:Polygon[];colliders:L11SolidCollider[];supports:L11SolidCollider[]}
const decks=new WeakMap<L11ChunkData,BridgeDeck>()
/** Clip and triangulate once. Both the underside mesh and collision use these
 * exact sloping triangular prisms, including oblique and overlapping roads. */
export function l11BridgeDeck(data:L11ChunkData):BridgeDeck {
  const hit=decks.get(data);if(hit)return hit
  const polygons=data.bridges.length?clipping.intersection(clipping.union(data.bridges[0].polygon,...data.bridges.slice(1).map(b=>b.polygon)),rectangle(data.cx*32,data.cy*32,32,32)).flatMap(p=>l11BridgeSurfaceParts(p,data.bridges)):[]
  const colliders:L11SolidCollider[]=[]
  for(const p of polygons){
    const rings=p.map(r=>r.slice(0,-1).map(v=>new Vector2(...v))),points=rings.flat()
    for(const tri of ShapeUtils.triangulateShape(rings[0],rings.slice(1))){
      const top:SolidPoint[]=tri.map(i=>[points[i].x,l11StreetHeight(data,points[i].x,points[i].y)+L11_BRIDGE_TOP_LIFT,points[i].y])
      if(Math.abs((top[1][0]-top[0][0])*(top[2][2]-top[0][2])-(top[1][2]-top[0][2])*(top[2][0]-top[0][0]))<1e-7)continue
      colliders.push(l11SolidCollider(makeL11Solid(top.concat(top.map(p=>[p[0],p[1]-L11_BRIDGE_THICKNESS,p[2]])),[[0,1,2],[5,4,3],[0,3,4,1],[1,4,5,2],[2,5,3,0]])))
    }
  }
  const supports=data.bridges.flatMap(b=>l11BridgePiers(data.seed,b)).flatMap(p=>{
    const rings=p.polygon.map(r=>r.slice(0,-1).map(v=>new Vector2(...v))),points=rings.flat()
    return ShapeUtils.triangulateShape(rings[0],rings.slice(1)).map(tri=>{const top:SolidPoint[]=tri.map(i=>[points[i].x,p.top,points[i].y]);return l11SolidCollider(makeL11Solid(top.concat(top.map(q=>[q[0],p.bottom,q[2]])),[[0,1,2],[5,4,3],[0,3,4,1],[1,4,5,2],[2,5,3,0]]))})
  })
  const deck={polygons,colliders,supports};decks.set(data,deck);return deck
}
export function l11CanalAt(data:L11ChunkData,x:number,y:number){
  if(!data.canals.some(c=>c.water.some(p=>inPolygon(x,y,p))))return null
  let top=-Infinity,bottom=Infinity
  for(const b of l11BridgeDeck(data).colliders){
    if(x<b.x0||x>b.x1||y<b.y0||y>b.y1)continue
    top=Math.max(top,l11SolidSurface(b,x,y,0));bottom=Math.min(bottom,l11SolidSurface(b,x,y,0,false))
  }
  return {surface:L11_WATER_SURFACE,bottom:L11_CANAL_BED,depth:L11_WATER_DEPTH,bridge:Number.isFinite(top)?{top,bottom}:null}
}
