// Transient developer clearing, applied to the same data used by streaming,
// collision, maps and lighting. Never changes the seeded generator or save schema.
import type {GenChunk} from './infiniteRegistry'
import type {L0Layout,L0Rect,L0Wall} from './l0Architecture'
import {l0Hash} from './l0Regions'

export const l0FieldContains=(r:L0Rect,x:number,y:number)=>x>=r.x&&y>=r.y&&x<r.x+r.w&&y<r.y+r.h
// Local/world round-trips can put an abutting face a few ulps past its edge.
export const l0FieldIntersects=(a:L0Rect,b:L0Rect)=>a.x<b.x+b.w-1e-6&&a.x+a.w>b.x+1e-6&&a.y<b.y+b.h-1e-6&&a.y+a.h>b.y+1e-6

/** Cut at real boundaries rather than deleting an entire wall crossing the field. */
export function subtractL0Field<T extends L0Rect>(r:T,field:L0Rect):T[]{
 if(!l0FieldIntersects(r,field))return[r]
 const x0=Math.max(r.x,field.x),y0=Math.max(r.y,field.y),x1=Math.min(r.x+r.w,field.x+field.w),y1=Math.min(r.y+r.h,field.y+field.h)
 return [
  {...r,h:y0-r.y},
  {...r,y:y1,h:r.y+r.h-y1},
  {...r,y:y0,w:x0-r.x,h:y1-y0},
  {...r,x:x1,y:y0,w:r.x+r.w-x1,h:y1-y0},
 ].filter(p=>p.w>1e-6&&p.h>1e-6)
}

type TileKey='tiles'|'wet'|'elev'|'step'|'tint'|'crawl'|'outdoor'|'ceiling'|'liquid'|'up'|'upWall'|'up2'|'upWall2'|'dn'|'dnWall'|'stair'
type FieldChunk=Pick<GenChunk,'l0'|'variant'|'tiles'|'wet'|'elev'|'tint'|'crawl'|'structures'|'items'|'lights'|'exits'>
 & Partial<Pick<GenChunk,Exclude<TileKey,'tiles'|'wet'|'elev'|'tint'|'crawl'>>>
 & {entities:{x:number;y:number}[]}
const tileKeys:TileKey[]=['tiles','wet','elev','step','tint','crawl','outdoor','ceiling','liquid','up','upWall','up2','upWall2','dn','dnWall','stair']

/** Pure overlay; origin is zero for raw chunks and the window origin for live chunks. */
export function applyL0TestField<T extends FieldChunk>(source:T,field:L0Rect|undefined,ox=0,oy=0):T{
 const a=source.l0
 if(!a||!field)return source
 const bounds={x:a.cx*32,y:a.cy*32,w:32,h:32}
 const layout:L0Layout={...a,testField:field}
 if(!l0FieldIntersects(bounds,field))return{...source,l0:layout}
 const inside=(p:{x:number;y:number})=>l0FieldContains(field,p.x+ox,p.y+oy)
 const overlaps=(p:L0Rect)=>l0FieldIntersects(field,{...p,x:p.x+ox,y:p.y+oy})
 const full=field.x<=bounds.x&&field.y<=bounds.y&&field.x+field.w>=bounds.x+32&&field.y+field.h>=bounds.y+32
 if(full){layout.baseRegion='open';layout.region='open'}
 layout.walls=a.walls.flatMap(w=>subtractL0Field(w,field))
 layout.pits=a.pits.flatMap(p=>subtractL0Field(p,field))
 layout.puddles=a.puddles.flatMap(p=>subtractL0Field(p,field))
 layout.arches=a.arches.filter(p=>!l0FieldIntersects(field,{x:p.x,y:p.y,w:.36,h:p.length}))
 layout.props=a.props?.filter(p=>!l0FieldIntersects(field,{x:p.x-p.radius,y:p.y-p.radius,w:p.radius*2,h:p.radius*2}))
 layout.vents=a.vents?.filter(p=>!l0FieldIntersects(field,p))
 layout.flickers=a.flickers?.filter(p=>!l0FieldContains(field,p.x,p.y))
 layout.entries=a.entries?.filter(p=>!l0FieldIntersects(field,p))
 layout.redZones=a.redZones?.filter(z=>!l0FieldIntersects(field,z.bounds))
 if(a.meeting&&l0FieldIntersects(field,a.meeting))layout.meeting=undefined
 if(a.trap&&l0FieldIntersects(field,a.trap))layout.trap=undefined
 layout.mapRegions=a.mapRegions?.slice()
 layout.lamps=a.lamps.filter(p=>!l0FieldContains(field,p.x,p.y))
 const lights:GenChunk['lights']=[]
 for(let y=field.y+4;y<field.y+field.h;y+=8)for(let x=field.x+4;x<field.x+field.w;x+=8){
  if(!l0FieldContains(bounds,x,y))continue
  layout.lamps.push({x,y,red:false,off:false,round:false,width:1.2,depth:.6})
  lights.push({x:x-ox,y:y-oy,r:4.2,color:'#f7f4dd',flickerSeed:l0Hash(a.seed,x,y),fixZ:2.66,noFix:1,gen:1,intensityMul:.42})
 }
 const copy={...source,l0:layout,variant:layout.region}
 for(const key of tileKeys){
  const values=source[key]?.slice();if(!values)continue
  for(let y=0;y<32;y++)for(let x=0;x<32;x++)if(l0FieldContains(field,bounds.x+x+.5,bounds.y+y+.5)){
   values[y*32+x]=key==='tiles'?1:0
   if(layout.mapRegions)layout.mapRegions[y*32+x]=0
  }
  Object.assign(copy,{[key]:values})
 }
 const collider=(w:L0Wall)=>({kind:'pillar' as const,x:w.x-ox,y:w.y-oy,w:w.w,h:w.h,solid:true,data:{l0Wall:1,bottom:w.bottom,top:w.top,sid:l0Hash(a.seed,a.cx,a.cy,0xde7,Math.round(w.x*1000),Math.round(w.y*1000),Math.round(w.w*1000),Math.round(w.h*1000))}})
 copy.structures=[...source.structures.filter(s=>(!s.data?.l0Wall||!!s.data.l0Prop)&&!overlaps(s)),...layout.walls.map(collider)]
 copy.items=source.items.filter(p=>!inside(p))
 copy.lights=[...source.lights.filter(p=>!inside(p)),...lights]
 copy.exits=source.exits.filter(p=>!inside(p))
 copy.entities=source.entities.filter(p=>!inside(p))
 return copy
}
