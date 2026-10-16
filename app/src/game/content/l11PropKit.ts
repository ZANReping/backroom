import type { L11DecorDef } from './l11Decor'
export type L11PropSurface='metal'|'paint'|'wood'|'rawwood'|'bark'|'concrete'|'glass'|'sealedglass'|'grass'|'tile'|'brick'|'fabric'|'rubber'|'paper'|'porcelain'|'plastic'
export interface L11PropPart {x:number;y:number;z:number;w:number;h:number;d:number;surface:L11PropSurface;color?:string;shape:'box'|'cylinder'|'sphere'|'ring'|'plane';solid:boolean;rx?:number;ry?:number;rz?:number;taper?:number;arc?:number;profile?:[number,number][];bevel?:number;crown?:number;nose?:number;grain?:'x'|'y'|'z';uvScale?:number;uvOffset?:[number,number];foliage?:'ellipsoid'|'trimmed'}
/** Coordinates: x/z centred on the footprint, front is -z, y is height above the floor.
 * rx/ry/rz use Three's XYZ Euler convention, shared by rendering and collision. */
export class L11PropBuilder {
  parts:L11PropPart[]=[]
  def:L11DecorDef
  constructor(def:L11DecorDef){this.def=def}
  box(x:number,y:number,z:number,w:number,h:number,d:number,surface:L11PropSurface='metal',color?:string,solid=true){this.parts.push({x,y,z,w,h,d,surface,color,shape:'box',solid});return this.parts.at(-1)!}
  cylinder(x:number,y:number,z:number,r:number,h:number,surface:L11PropSurface='metal',color?:string,solid=true){const p=this.box(x,y,z,r*2,h,r*2,surface,color,solid);p.shape='cylinder';return p}
  panel(x:number,y:number,z:number,w:number,h:number,surface:L11PropSurface='glass',color?:string){const p=this.box(x,y,z,w,h,.004,surface,color,surface==='glass');p.shape='plane';return p}
  sphere(x:number,y:number,z:number,w:number,h:number,d:number,surface:L11PropSurface='grass',color?:string,solid=false){const p=this.box(x,y,z,w,h,d,surface,color,solid);p.shape='sphere';return p}
  ring(x:number,y:number,z:number,r:number,t:number,surface:L11PropSurface='metal',color?:string,solid=false){const p=this.box(x,y,z,r*2,r*2,t*2,surface,color,solid);p.shape='ring';return p}
  bar(a:[number,number,number],c:[number,number,number],r=.025,surface:L11PropSurface='metal',color?:string,solid=true){const dx=c[0]-a[0],dy=c[1]-a[1],dz=c[2]-a[2],p=this.cylinder((a[0]+c[0])/2,(a[1]+c[1])/2,(a[2]+c[2])/2,r,Math.hypot(dx,dy,dz),surface,color,solid);p.rz=-Math.atan2(dx,Math.hypot(dy,dz));p.rx=Math.atan2(dz,dy);return p}
  legs(w:number,d:number,h:number,surface:L11PropSurface='metal'){for(const x of [-w/2+.07,w/2-.07])for(const z of [-d/2+.07,d/2-.07])this.box(x,h/2,z,.065,h,.065,surface)}
  slats(w:number,d:number,y:number,n=5,surface:L11PropSurface='wood'){for(let i=0;i<n;i++)this.box(0,y,-d/2+(i+.5)*d/n,w,.055,d/n*.82,surface)}
  panelGrid(w:number,h:number,z:number,rows:number,cols:number,y=.15){for(let j=0;j<rows;j++)for(let i=0;i<cols;i++){const a=-w/2+(i+.5)*w/cols,b=y+(j+.5)*h/rows;this.box(a,b,z,w/cols-.015,h/rows-.02,.025,'paint','#a7a69b');this.box(a+w/cols*.23,b,z-.022,.035,.08,.03,'metal')}}
}

/** Rotate a part-local point before translating; kept independent of Three for Workers. */
export function l11PartPoint(p:L11PropPart,x:number,y:number,z:number):[number,number,number]{
  const rx=p.rx??0,ry=p.ry??0,rz=p.rz??0,a=x*Math.cos(rz)-y*Math.sin(rz),b=x*Math.sin(rz)+y*Math.cos(rz),u=a*Math.cos(ry)+z*Math.sin(ry),v=-a*Math.sin(ry)+z*Math.cos(ry)
  return [u+p.x,b*Math.cos(rx)-v*Math.sin(rx)+p.y,b*Math.sin(rx)+v*Math.cos(rx)+p.z]
}
