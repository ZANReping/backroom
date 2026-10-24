import * as THREE from 'three'
import {RoundedBoxGeometry} from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import {mergeGeometries} from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import {l1WorldUV} from './l1Materials'
import type {TradersAssets} from './tradersMeshes'
import {TRADERS_SHOP_UV} from '../content/tradersShops'
export const DRESSING_COLORS={steel:'#8f9996',dark:'#26332f',wood:'#a58e6b',paper:'#ddd7c4',cream:'#c8c5b5',green:'#536b5f',red:'#984a3d',brass:'#a39062'} as const
/** Local geometry collector. Each print uses the same padded offline atlas UVs. */
export class DressingParts{
 readonly buckets=new Map<THREE.Material,THREE.BufferGeometry[]>()
 readonly assets:TradersAssets
 constructor(assets:TradersAssets){this.assets=assets}
 add(g:THREE.BufferGeometry,surface:string,color:string,uv=true){
  if(g.index){const next=g.toNonIndexed();g.dispose();g=next}
  if(uv)l1WorldUV(g,0,0,TRADERS_SHOP_UV[surface]??(surface==='wood'?.7:surface==='fabric'?1.5:.6))
  surface=surface==='metal'?'steel':surface==='plastic'?'paint':surface==='cork'?'fabric':surface
  const m=this.assets.material(surface,color),a=this.buckets.get(m)??[];a.push(g);this.buckets.set(m,a)
 }
 box(x:number,y:number,z:number,w:number,h:number,d:number,surface:string,color:string,round=0){const g=round?new RoundedBoxGeometry(w,h,d,1,Math.min(round,w/4,h/4,d/4)):new THREE.BoxGeometry(w,h,d);g.translate(x,y,z);this.add(g,surface,color)}
 cylinder(x:number,y:number,z:number,r:number,h:number,surface:string,color:string,r2=r){const g=new THREE.CylinderGeometry(r,r2,h,12);g.translate(x,y,z);this.add(g,surface,color)}
 rod(a:THREE.Vector3,b:THREE.Vector3,r:number,surface:string,color:string){const v=b.clone().sub(a),g=new THREE.CylinderGeometry(r,r,v.length(),8);g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),v.normalize()));g.translate((a.x+b.x)/2,(a.y+b.y)/2,(a.z+b.z)/2);this.add(g,surface,color)}
 torus(x:number,y:number,z:number,r:number,tube:number,surface:string,color:string,rx=0){const g=new THREE.TorusGeometry(r,tube,5,16);g.rotateX(rx);g.translate(x,y,z);this.add(g,surface,color)}
 print(tile:number,x:number,y:number,z:number,w:number,h:number,angle=0){const g=new THREE.PlaneGeometry(w,h);g.rotateY(angle);g.translate(x,y,z);this.atlas(g,tile);this.add(g,'dressingprint','#ffffff',false)}
 gridPrint(tile:number,x:number,y:number,z:number,w:number,h:number,nx:number,ny:number){for(let row=0;row<ny;row++)for(let col=0;col<nx;col++)this.print(tile,x-w/2+(col+.5)*w/nx,y-h/2+(row+.5)*h/ny,z,w/nx,h/ny)}
 printDisk(tile:number,x:number,y:number,z:number,r:number){const g=new THREE.CircleGeometry(r,24);g.translate(x,y,z);this.atlas(g,tile);this.add(g,'dressingprint','#ffffff',false)}
 private atlas(g:THREE.BufferGeometry,tile:number){const uv=g.getAttribute('uv');for(let i=0;i<uv.count;i++)uv.setXY(i,(tile%4*256+8+uv.getX(i)*240)/1024,1-(Math.floor(tile/4)*256+8+(1-uv.getY(i))*240)/1024)}
 finish(root:THREE.Group){try{for(const [m,a] of this.buckets){const g=mergeGeometries(a);if(!g)throw Error('Dressing geometry layout');const mesh=new THREE.Mesh(g,m);mesh.castShadow=mesh.receiveShadow=true;root.add(mesh)}}finally{this.dispose()}}
 dispose(){for(const a of this.buckets.values())for(const g of a)g.dispose();this.buckets.clear()}
}
