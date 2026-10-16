import { inPolygon, bounds, intersects, type Polygon, type Point } from './l11Geometry'

// Dressing cache changes must not change city-plan IDs, loot or saved roads.
export const L11_DRESSING_VERSION=13
// Road surfacing and inset hardware share the same height above the terrain.
export const L11_ROAD_SURFACE_LIFT=.045
export const l11FaceToward=(dx:number,dy:number)=>Math.atan2(dy,dx)+Math.PI/2
export const l11CurbFacing=(tangent:number,side:number)=>tangent+(side<0?Math.PI:0)
export const l11TrafficFacing=(tangent:number,side:number)=>tangent+(side>0?-Math.PI/2:Math.PI/2)

/** Exact footprint rejection for oblique props, without allocating clipped polygons. */
export function l11FootprintsOverlap(a:Polygon,b:Polygon):boolean {
  if(!intersects(bounds(a),bounds(b)))return false
  if(a[0].some(([x,y])=>inPolygon(x,y,b))||b[0].some(([x,y])=>inPolygon(x,y,a)))return true
  const side=(p:Point,q:Point,r:Point)=>(q[0]-p[0])*(r[1]-p[1])-(q[1]-p[1])*(r[0]-p[0])
  for(const ar of a)for(const br of b)for(let i=1;i<ar.length;i++)for(let j=1;j<br.length;j++){
    const p=ar[i-1],q=ar[i],r=br[j-1],s=br[j]
    if(side(p,q,r)*side(p,q,s)<-1e-10&&side(r,s,p)*side(r,s,q)<-1e-10)return true
  }
  return false
}

/** Place the back of a cabinet against the nearest usable wall and face inward.
 * Uses the actual polygon, so courtyard and oblique walls follow the same rule. */
export function l11WallSlot(polygon:Polygon,u:number,v:number,width:number,depth:number){
  let best:{u:number;v:number;turn:number;wall:[number,number];distance:number}|undefined
  for(const ring of polygon)for(let i=1;i<ring.length;i++){
    const a=ring[i-1],b=ring[i],dx=b[0]-a[0],dy=b[1]-a[1],length=Math.hypot(dx,dy),edge=width/2+.3
    if(length<edge*2)continue
    const tx=dx/length,ty=dy/length,t=Math.max(edge,Math.min(length-edge,(u-a[0])*tx+(v-a[1])*ty)),x=a[0]+tx*t,y=a[1]+ty*t
    let nx=-ty,ny=tx
    if(!inPolygon(x+nx*.1,y+ny*.1,polygon)){nx=-nx;ny=-ny}
    const centerU=x+nx*(depth/2+.18),centerV=y+ny*(depth/2+.18),distance=Math.hypot(centerU-u,centerV-v)
    if(!best||distance<best.distance)best={u:centerU,v:centerV,turn:l11FaceToward(nx,ny),wall:[x,y],distance}
  }
  return best
}
