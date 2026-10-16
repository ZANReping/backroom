import type { Engine } from '../engine'
import { bounds, inPolygon, type Point } from '../world/l11Geometry'
import { l11Archetype, type L11BuildingGroup } from './l11Buildings'
import { l11Local } from '../world/l11Layout'
import type { L11Building, L11Variant } from '../world/l11Types'
import type { L11RoomKind } from '../world/l11Interiors'

export interface MapBounds {x:number;y:number;w:number;h:number}
export interface L11MapView {x:number;y:number;scale:number;width:number;height:number}
export interface L11MapContext {kind:'city'|'interior'|'metro';id:string;floor:number;building?:L11Building;title:string}
export const L11_MAP_COLORS={
  land:'#edf1eb',paper:'#f8faf7',unknown:'#d8dfdd',road:'#fffefd',arterial:'#fff7dd',roadEdge:'#b8c3c3',
  alley:'#d6dcda',pedestrian:'#e9dfcb',water:'#a5d3e4',bank:'#d9e8de',park:'#c2dcb9',wall:'#506374',door:'#008b83',
  player:'#1374cf',exit:'#bd475a',loot:'#ad7223',corridor:'#fffdfa',stairs:'#96b4ca',
}
export const L11_MAP_BUILDINGS:Record<L11BuildingGroup,{label:string;color:string}>={
  residential:{label:'住宅',color:'#e7d8b4'},office:{label:'办公',color:'#b8d1e2'},
  commercial:{label:'商业',color:'#efcbbb'},industrial:{label:'工业',color:'#d1c8dd'},civic:{label:'公共',color:'#b9d7c9'},
}
export const L11_MAP_DISTRICTS:Record<L11Variant,{label:string;color:string}>={
  lowrise:{label:'多层住宅区',color:'#e8eadc'},apartments:{label:'中层公寓区',color:'#e4e7cf'},
  mixed:{label:'混合街区',color:'#eee4dd'},highrise:{label:'高层办公区',color:'#dfe8ec'},
  industrial:{label:'工业与运河区',color:'#e3dfe8'},park:{label:'市政公园区',color:'#c2dcb9'},
  transit:{label:'交通枢纽区',color:'#dce4dc'},
}
export const L11_MAP_ROOMS={
  home:{label:'起居 / 卧室',color:'#f0dfbd'},work:{label:'办公 / 教学',color:'#cbddeb'},
  public:{label:'营业 / 公共',color:'#d1e4d6'},wet:{label:'厨房 / 卫浴',color:'#bce0e3'},
  service:{label:'库房 / 设备',color:'#ddd4e4'},
}
const ROOM_GROUP:Record<L11RoomKind,keyof typeof L11_MAP_ROOMS>={
  living:'home',bedroom:'home',studio:'home',bathroom:'wet',kitchen:'wet',breakroom:'wet',
  workspace:'work',meeting:'work',staffroom:'work',classroom:'work',reception:'public',
  records:'service',reading:'public',shop:'public',stockroom:'service',gallery:'public',fitness:'public',
  workshop:'service',plant:'service',waiting:'public',parking:'service',
}
export const l11RoomMapColor=(kind:L11RoomKind)=>L11_MAP_ROOMS[ROOM_GROUP[kind]].color
export const l11BuildingMapStyle=(b:L11Building)=>L11_MAP_BUILDINGS[l11Archetype(b.archetype).group]
export const mapProject=(view:L11MapView,x:number,y:number):Point=>[(x-view.x)*view.scale+view.width/2,(y-view.y)*view.scale+view.height/2]
export const mapUnproject=(view:L11MapView,x:number,y:number):Point=>[view.x+(x-view.width/2)/view.scale,view.y+(y-view.height/2)/view.scale]
export const mapViewBounds=(v:L11MapView):MapBounds=>({x:v.x-v.width/v.scale/2,y:v.y-v.height/v.scale/2,w:v.width/v.scale,h:v.height/v.scale})
export function zoomMapView(v:L11MapView,scale:number,px=v.width/2,py=v.height/2){
  const [x,y]=mapUnproject(v,px,py)
  return {...v,scale,x:x-(px-v.width/2)/scale,y:y-(py-v.height/2)/scale}
}
export function l11MapKnown(eng:Engine,x:number,y:number){
  const m=eng.map,inf=m?.inf;if(!inf)return false
  const ix=Math.floor(x),iy=Math.floor(y),lx=ix-inf.ox,ly=iy-inf.oy
  if(lx>=0&&ly>=0&&lx<m.w&&ly<m.h)return !!eng.explored[ly*m.w+lx]
  const cx=Math.floor(ix/32),cy=Math.floor(iy/32)
  return !!inf.explored.get(`${cx},${cy}`)?.[(iy-cy*32)*32+ix-cx*32]
}
/** A building's courtyard/air above the accessible floors is still outdoors. */
export function l11MapContext(eng:Engine):L11MapContext {
  const p=eng.player,inf=eng.map?.inf,floor=p.floor??0
  if(!eng.map||p.level!==11)return {kind:'city',id:'city',floor:0,title:'无限城市'}
  if(floor<0)return {kind:'metro',id:'metro',floor:-1,title:'地铁步行通道'}
  const x=p.x+(inf?.ox??0),y=p.y+(inf?.oy??0)
  for(const s of eng.map.structures){
    const b=s.l11
    if(!b||b.sealed||floor>=b.accessible||x<b.x||y<b.y||x>b.x+b.w||y>b.y+b.h||!inPolygon(x,y,b.footprint))continue
    const [u,v]=l11Local(b,x,y)
    if(!b.volumes.some(t=>p.z>=b.base+t.lo-.6&&p.z<b.base+Math.min(t.hi,b.accessible*3)-.05&&u>=t.x&&v>=t.y&&u<=t.x+t.w&&v<=t.y+t.d))continue
    return {kind:'interior',id:b.id,floor,building:b,title:l11Archetype(b.archetype).name}
  }
  return {kind:'city',id:'city',floor:0,title:'无限城市'}
}
export function fitL11Map(eng:Engine,context:L11MapContext,width:number,height:number,mini=false):L11MapView {
  const inf=eng.map!.inf!,b=context.building
  if(b&&!mini){const r=bounds(b.footprint);return {x:r.x+r.w/2,y:r.y+r.h/2,scale:Math.min((width-64)/(r.w+4),(height-64)/(r.h+4),18),width,height}}
  return {x:eng.player.x+inf.ox,y:eng.player.y+inf.oy,scale:mini?(b?Math.max(3,width/34):width/112):Math.min(width/240,height/180),width,height}
}
/** Horizontal runs preserve the exact exploration mask, including narrow doorways. */
export function l11KnownRuns(eng:Engine,view:MapBounds):MapBounds[]{
  const inf=eng.map?.inf;if(!inf)return []
  const runs:MapBounds[]=[]
  const chunks=new Set([...inf.explored.keys(),...inf.chunks.keys()])
  for(const key of chunks){
    const [cx,cy]=key.split(',').map(Number),x0=Math.max(cx*32,Math.floor(view.x)),x1=Math.min(cx*32+32,Math.ceil(view.x+view.w)),y0=Math.max(cy*32,Math.floor(view.y)),y1=Math.min(cy*32+32,Math.ceil(view.y+view.h))
    for(let y=y0;y<y1;y++){
      let start:number|null=null
      for(let x=x0;x<=x1;x++){
        const known=x<x1&&l11MapKnown(eng,x,y)
        if(known&&start===null)start=x
        if(!known&&start!==null){runs.push({x:start,y,w:x-start,h:1});start=null}
      }
    }
  }
  return runs
}
