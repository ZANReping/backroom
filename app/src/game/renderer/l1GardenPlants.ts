import * as THREE from 'three'
import type {L1ArchitectureData} from '../world/l1BuildingTypes'
import {l1Noise} from '../world/l1Spatial'
import {l1BuildingRoof} from '../world/l1Building'
import {l1Material} from './l1Materials'
/** The v3 atlas decorations supplement (rather than rebuild) the existing baked ivy.
 * Absolute coordinates select the same plants in both render modes and load orders. */
export function* buildL1GardenPlants(data:L1ArchitectureData,ox:number,oz:number,root:THREE.Group):Generator<void,void,unknown>{
 if(!data.styles.includes(4))return
 const x0=data.cx*32,z0=data.cy*32,layers=[0,1,2].map(()=>({p:[] as number[],n:[] as number[],uv:[] as number[]}))
 const noise=(x:number,z:number,s:number)=>l1Noise(x,z,data.seed^s)
 const floor=(x:number,z:number)=>{const lx=Math.floor(x)-x0,lz=Math.floor(z)-z0;if(lx<0||lz<0||lx>=32||lz>=32)return false;const i=lz*32+lx;return !!data.floor[i]&&data.styles[i]===4}
 let serial=0
 const sprite=(x:number,y:number,z:number,w:number,h:number,angle:number,q:number)=>{
  const u0=(q%2)*.5+.004,v0=(q<2?.5:0)+.004,id=serial++
  for(let lod=0;lod<3;lod++){if(lod===1&&id%2||lod===2&&id%5)continue;const a=layers[lod]
   for(const extra of [0,Math.PI/2]){const c=Math.cos(angle+extra),s=Math.sin(angle+extra)
    for(const [u,v]of [[0,0],[1,0],[1,1],[0,0],[1,1],[0,1]]){const p=(u-.5)*w;a.p.push(x-x0+p*c,y+v*h,z-z0-p*s);a.n.push(s,0,c);a.uv.push(u0+u*.492,v0+v*.492)}
   }
  }
 }
 for(const b of data.boxes)if(b.style==='garden'&&b.id.startsWith('column:')){
  const x=(b.min[0]+b.max[0])/2,z=(b.min[2]+b.max[2])/2,cover=noise(x,z,61)
  if(noise(x,z,63)<.35)for(let j=0;j<2+Math.floor(cover*3);j++){
   const a=j*2.1+cover*6,rad=(b.max[0]-b.min[0])/2+.35+noise(j,x,65)*.4,sz=.7+noise(j,z,67)*.7
   const px=x+Math.cos(a)*rad,pz=z+Math.sin(a)*rad;if(floor(px,pz))sprite(px,0,pz,sz*1.15,sz,a,2)
  }
  yield
 }
 // Four-metre ceiling grid; only real open garden floor can host a trailing vine.
 for(let gz=Math.ceil(z0/4);gz*4<z0+32;gz++)for(let gx=Math.ceil(x0/4);gx*4<x0+32;gx++){
  const x=gx*4,z=gz*4;if(!floor(x,z))continue
  const v=noise(x*3,z*3,71),H=l1BuildingRoof(data.seed,x,z,true)
  if(v<.55)for(let j=0;j<1+Math.floor(v*6);j++){
   const length=1.6+noise(j,x*5,73)*Math.max(.1,H-2.2),px=x+(noise(j,z,75)-.5)*3.4,pz=z+(noise(j,x,77)-.5)*3.4
   if(floor(px,pz))sprite(px,H-length,pz,.45+length*.08,length,noise(j,j,79)*3,0)
  }
  yield
 }
 for(let gz=Math.ceil(z0/1.2);gz*1.2<z0+32;gz++){
  for(let gx=Math.ceil(x0/1.2);gx*1.2<x0+32;gx++){
   const x=gx*1.2,z=gz*1.2;if(!floor(x,z))continue
   const r=noise(gx*7,gz*7,11),jx=(r-.5)*.6,jz=(noise(gx*11,gz*11,37)-.5)*.6
   const fern=noise(Math.floor(x/6),Math.floor(z/6),81),tuft=noise(Math.floor(x/5),Math.floor(z/5),83)
   if(fern>.68&&r<.32){const s=.55+r*1.6;sprite(x+jx,0,z+jz,s*1.2,s,r*9,1)}
   else if(tuft>.62&&r>.82){const s=.3+(r-.82)*2.6;sprite(x+jx,0,z+jz,s*1.3,s,r*7,3)}
  }
  yield
 }
 const lod=new THREE.LOD();lod.name='l1-garden-plants-lod';lod.position.set(x0-ox+16,0,z0-oz+16)
 for(let i=0;i<layers.length;i++){
  const a=layers[i];if(!a.p.length)continue
  const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(a.p,3));geo.setAttribute('normal',new THREE.Float32BufferAttribute(a.n,3));geo.setAttribute('uv',new THREE.Float32BufferAttribute(a.uv,2));geo.translate(-16,0,-16);geo.computeBoundingSphere()
  const mesh=new THREE.Mesh(geo,l1Material('garden','plant'));mesh.userData.noCastShadow=i>0;lod.addLevel(mesh,[0,26,52][i])
 }
 if(lod.levels.length)root.add(lod)
}
