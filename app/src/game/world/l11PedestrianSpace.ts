import type { L11ChunkData } from './l11Types'
import { inPolygon, segmentDistance, type Point } from './l11Geometry'
import { l11CanalAt } from './l11Hydrology'
import { l11MetroRamp } from './l11Layout'

export const L11_FACELING_RADIUS=.28
/** Split at paving/marking boundaries before testing intervals. Endpoint or
 * fixed-distance samples can miss an arbitrarily thin forbidden wedge where
 * a diagonal clips the end of a zebra crossing. Coordinates are world-space. */
export function l11PedestrianSegment(data:L11ChunkData,a:Point,b:Point){
  const dx=b[0]-a[0],dy=b[1]-a[1],cuts=[0,1],r=L11_FACELING_RADIUS
  const cut=(origin:Point,ux:number,uy:number,offset:number)=>{
    const rate=dx*ux+dy*uy;if(Math.abs(rate)<1e-10)return
    const t=(offset-(a[0]-origin[0])*ux-(a[1]-origin[1])*uy)/rate
    if(t>0&&t<1)cuts.push(t)
  }
  const circle=(p:Point,radius:number)=>{
    const x=a[0]-p[0],y=a[1]-p[1],aa=dx*dx+dy*dy,bb=2*(x*dx+y*dy),cc=x*x+y*y-radius*radius,disc=bb*bb-4*aa*cc
    if(aa<1e-12||disc<0)return
    for(const t of [(-bb-Math.sqrt(disc))/(2*aa),(-bb+Math.sqrt(disc))/(2*aa)])if(t>0&&t<1)cuts.push(t)
  }
  for(const road of data.roads){
    const bb=road.bounds,pad=3+r
    if(Math.max(a[0],b[0])<bb.x-pad||Math.min(a[0],b[0])>bb.x+bb.w+pad||Math.max(a[1],b[1])<bb.y-pad||Math.min(a[1],b[1])>bb.y+bb.h+pad)continue
    for(let i=1;i<road.points.length;i++){
      const p=road.points[i-1],q=road.points[i],len=Math.hypot(q[0]-p[0],q[1]-p[1]);if(len<1e-6)continue
      const nx=-(q[1]-p[1])/len,ny=(q[0]-p[0])/len
      for(const width of [road.width/2+r,road.width/2+3-r]){
        cut(p,nx,ny,width);cut(p,nx,ny,-width);circle(p,width);circle(q,width)
      }
    }
  }
  for(const c of data.crosswalks??[])for(const sign of [-1,1]){
    cut(c.center,c.axis[0],c.axis[1],sign*(1.4-r))
    cut(c.center,-c.axis[1],c.axis[0],sign*(c.width/2+r))
  }
  cuts.sort((x,y)=>x-y)
  for(let i=0;i<cuts.length;i++){
    const t=cuts[i];if(!l11PedestrianSurface(data,a[0]+dx*t,a[1]+dy*t))return false
    if(i){const mid=(cuts[i-1]+t)/2;if(!l11PedestrianSurface(data,a[0]+dx*mid,a[1]+dy*mid))return false}
  }
  return true
}
/** The entire body stays on paving; the only permitted carriageway is a painted
 * crossing. A waterfront path never makes an intersecting motor road walkable. */
export function l11PedestrianSurface(data:L11ChunkData,x:number,y:number,r=L11_FACELING_RADIUS):'sidewalk'|'crosswalk'|undefined {
  if(l11MetroRamp(x,y,data.seed)!==null)return
  if(data.buildings.some(b=>x>=b.x-r&&x<=b.x+b.w+r&&y>=b.y-r&&y<=b.y+b.h+r&&inPolygon(x,y,b.footprint)))return
  const canal=l11CanalAt(data,x,y);if(canal&&!canal.bridge)return
  let sidewalk=false,crosswalk=false
  for(const road of data.roads){
    const bb=road.bounds;if(x<bb.x-3-r||x>bb.x+bb.w+3+r||y<bb.y-3-r||y>bb.y+bb.h+3+r)continue
    let distance=Infinity
    for(let i=1;i<road.points.length;i++)distance=Math.min(distance,segmentDistance(x,y,road.points[i-1],road.points[i]))
    if(!road.pedestrian&&distance<road.width/2+r){
      const marked=data.crosswalks?.some(c=>c.roadId===road.id&&Math.abs((x-c.center[0])*c.axis[0]+(y-c.center[1])*c.axis[1])<=1.4-r+1e-7&&Math.abs((x-c.center[0])*c.axis[1]-(y-c.center[1])*c.axis[0])<=c.width/2+r+1e-7)
      if(!marked)return
      crosswalk=true
    }
    if(distance<=road.width/2+3-r&&(road.pedestrian||distance>=road.width/2+r))sidewalk=true
  }
  // Quays are also sidewalks, with a margin from their unprotected edges.
  if(!sidewalk&&!crosswalk)sidewalk=data.canals.some(c=>c.banks.some(p=>inPolygon(x,y,p)))
  return crosswalk?'crosswalk':sidewalk?'sidewalk':undefined
}
