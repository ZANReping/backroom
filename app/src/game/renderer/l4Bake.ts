import * as THREE from 'three'
import type {GameMap} from '../world/mapgen'
import {L4_HEIGHT,l4StyleAt} from '../world/l4Layout'

// Level 4 v2 baked lighting (CPU, per vertex). Matches the reference photos:
// evenly lit carpet under 600×600 troffers with soft pools, bright ceilings from
// carpet bounce, walls lit from above, and cool daylight falling in from the
// facade windows. Occlusion is a 2D DDA through wall tiles and closed doors.
// The result is stored in a vec4 `l4Bake` attribute (rgb = irradiance,
// w = 0 marks baked geometry; unbaked meshes read WebGL's default w = 1).

const LAMP=new THREE.Color('#fff7ee'),SKY=new THREE.Color('#a9c4d8')
const RANGE=11,SKY_RANGE=14,BIN=4,LAMP_Z=L4_HEIGHT-.06
export const L4_BAKE_VERSION=3
type Lamp={x:number;z:number;k:number}
type Win={x:number;z:number;dx:number;dz:number}
type Foot={x0:number;z0:number;x1:number;z1:number;k:number}
// v2 detail: furniture contact shadows on the carpet and wall/corner occlusion.
const FOOT_KINDS:Record<string,number>={cubicle:.8,desk:.5,table:.5,cabinet:.62,vending:.6,watercooler:.66,l4prop:.62,glasswin:.85}
export interface L4Sampler{sample(px:number,py:number,pz:number,nx:number,ny:number,nz:number,ox?:number,oz?:number):[number,number,number]}

export function createL4Sampler(m:GameMap):L4Sampler{
  const W=m.w,H=m.h,block=new Uint8Array(W*H)
  for(let i=0;i<W*H;i++)block[i]=m.tiles[i]===2?1:0
  for(const s of m.structures)if(s.kind==='hoteldoor'||s.kind==='elevdoor'){const x=Math.floor(s.x),y=Math.floor(s.y);if(x>=0&&y>=0&&x<W&&y<H)block[y*W+x]=1}
  const lamps=new Map<number,Lamp[]>(),wins=new Map<number,Win[]>(),key=(bx:number,bz:number)=>bx*73856093^bz*19349663
  const push=<T>(map:Map<number,T[]>,x:number,z:number,v:T)=>{const k=key(Math.floor(x/BIN),Math.floor(z/BIN));const l=map.get(k);if(l)l.push(v);else map.set(k,[v])}
  for(const l of m.lights){const st=l4StyleAt(m,l.x,l.y);push(lamps,l.x,l.y,{x:l.x,z:l.y,k:st==='smallrooms'?2.6:st==='officehall'?3.0:st==='hall'?2.0:2.2})}
  for(const s of m.structures)if(s.data?.l4Facade){
    const deg=Number(s.data.deg),ox=deg===90?1:deg===270?-1:0,oz=deg===0?1:deg===180?-1:0 // outside direction
    push(wins,s.x+.5,s.y+.5,{x:s.x+.5+ox*.4,z:s.y+.5+oz*.4,dx:-ox,dz:-oz})
  }
  const feet=new Map<number,Foot[]>()
  for(const st of m.structures){const k=FOOT_KINDS[st.kind];if(k===undefined||!st.solid)continue
    const f={x0:st.x,z0:st.y,x1:st.x+st.w,z1:st.y+st.h,k}
    for(let bz=Math.floor((f.z0-1.2)/BIN);bz<=Math.floor((f.z1+1.2)/BIN);bz++)for(let bx=Math.floor((f.x0-1.2)/BIN);bx<=Math.floor((f.x1+1.2)/BIN);bx++){const kk=key(bx,bz),l=feet.get(kk);if(l)l.push(f);else feet.set(kk,[f])}}
  const solidAt=(x:number,z:number)=>x<0||z<0||x>=W||z>=H?0:block[z*W+x]
  /** distance (m) from a point to the nearest wall tile within ~1 m */
  const wallDist=(px:number,pz:number,exX=-9e9,exZ=-9e9)=>{let d=9;const tx=Math.floor(px),tz=Math.floor(pz)
    for(let z=tz-1;z<=tz+1;z++)for(let x=tx-1;x<=tx+1;x++)if(solidAt(x,z)&&!(x===exX&&z===exZ)){const dx=Math.max(x-px,0,px-x-1),dz=Math.max(z-pz,0,pz-z-1);d=Math.min(d,Math.hypot(dx,dz))}
    return d}
  const ss=(a:number,b:number,v:number)=>{const t=Math.min(1,Math.max(0,(v-a)/(b-a)));return t*t*(3-2*t)}
  const occlusion=(px:number,py:number,pz:number,nx:number,ny:number,nz:number)=>{
    let ao=1
    if(ny>.5){ // carpet: wall skirting + furniture contact
      ao*=1-.45*(1-ss(0,.8,wallDist(px,pz)))
      for(const f of feet.get(key(Math.floor(px/BIN),Math.floor(pz/BIN)))??[]){
        const dx=Math.max(f.x0-px,0,px-f.x1),dz=Math.max(f.z0-pz,0,pz-f.z1),d=Math.hypot(dx,dz)
        if(d>.9)continue;ao*=d<=0?f.k:1-(1-f.k)*.9*(1-ss(0,.9,d))
      }
    }else if(ny<-.5)ao*=1-.22*(1-ss(0,.5,wallDist(px,pz)))
    else{ // walls: inner corners (sampled off the face) + floor/ceiling junctions
      const ix=Math.round(nx),iz=Math.round(nz)
      if(ix||iz){const own=[Math.floor(px-nx*.5),Math.floor(pz-nz*.5)],fx=own[0]+ix,fz=own[1]+iz,tx=iz?1:0,tz=ix?1:0
        let dc=9
        for(const sgn of [-1,1])if(solidAt(fx+tx*sgn,fz+tz*sgn)){const along=tx?px:pz,edge=tx?(sgn>0?fx+1:fx):(sgn>0?fz+1:fz);dc=Math.min(dc,Math.abs(edge-along))}
        ao*=1-.3*(1-ss(0,.6,dc))}
      ao*=1-.18*(1-ss(0,.35,py))-.12*(1-ss(0,.3,L4_HEIGHT-py))
    }
    return ao
  }
  const blocked=(ax:number,az:number,bx:number,bz:number)=>{
    // Amanatides–Woo walk; the end tile is the emitter's own tile (never blocks).
    let x=Math.floor(ax),z=Math.floor(az);const ex=Math.floor(bx),ez=Math.floor(bz)
    const dx=bx-ax,dz=bz-az,sx=dx>0?1:-1,sz=dz>0?1:-1
    const tdx=Math.abs(1/(dx||1e-9)),tdz=Math.abs(1/(dz||1e-9))
    let tx=(dx>0?x+1-ax:ax-x)*tdx,tz=(dz>0?z+1-az:az-z)*tdz
    for(let n=0;n<64;n++){
      if(x===ex&&z===ez)return false
      if(tx<tz){tx+=tdx;x+=sx}else{tz+=tdz;z+=sz}
      if(x===ex&&z===ez)return false
      if(x<0||z<0||x>=W||z>=H)return false
      if(block[z*W+x])return true
    }
    return false
  }
  return{sample(px,py,pz,nx,ny,nz,ox=px+nx*.05,oz=pz+nz*.05){
    let r=0,g=0,b=0,bounce=0,sky=0,halo=0
    const bx0=Math.floor((px-SKY_RANGE)/BIN),bx1=Math.floor((px+SKY_RANGE)/BIN),bz0=Math.floor((pz-SKY_RANGE)/BIN),bz1=Math.floor((pz+SKY_RANGE)/BIN)
    for(let bz=bz0;bz<=bz1;bz++)for(let bx=bx0;bx<=bx1;bx++){
      for(const l of lamps.get(key(bx,bz))??[]){
        const vx=l.x-px,vy=LAMP_Z-py,vz=l.z-pz,d2=vx*vx+vy*vy+vz*vz
        if(d2>RANGE*RANGE)continue
        if(blocked(ox,oz,l.x,l.z))continue
        const d=Math.sqrt(d2),ce=Math.max(0,vy/d),cs=Math.max(0,(vx*nx+vy*ny+vz*nz)/d)
        const f0=1-Math.min(1,d/RANGE),fall=f0*f0
        r+=l.k*ce*cs/(d2+1.0)*fall
        bounce+=l.k*ce/(d2+5)*fall
        if(ny<-.5){const h2=vx*vx+vz*vz;halo+=l.k*.045/(h2+.3)}
      }
      for(const w of wins.get(key(bx,bz))??[]){
        const vx=w.x-px,vy=1.75-py,vz=w.z-pz,d2=vx*vx+vy*vy+vz*vz
        if(d2>SKY_RANGE*SKY_RANGE||d2<.01)continue
        const d=Math.sqrt(d2),ce=Math.max(0,-(vx*w.dx+vz*w.dz)/d)
        if(ce<=0||blocked(ox,oz,w.x-w.dx*.8,w.z-w.dz*.8))continue
        const cs=Math.max(0,(vx*nx+vy*ny+vz*nz)/d)
        sky+=1.25*ce*(.3+.7*cs)/(d2+1.5)*(1-Math.min(1,d/SKY_RANGE))
      }
    }
    // Carpet → ceiling/wall bounce, plus a soft ambient floor so no surface goes black.
    const up=ny<-.5?.24:ny>.5?.5:.75
    const ind=bounce*.42*up+halo+.025
    r+=ind;g=r;b=r
    const ao=occlusion(px,py,pz,nx,ny,nz)
    return[(r*LAMP.r+sky*SKY.r)*ao,(g*LAMP.g+sky*SKY.g)*ao,(b*LAMP.b+sky*SKY.b)*ao]
  }}
}

const vA=new THREE.Vector3(),nA=new THREE.Vector3()
let sharedMemo:Map<string,[number,number,number]>|null=null
/** Terrain builds share one sample cache so neighbouring planes reuse corner samples. */
export function l4BakeMemo(on:boolean){sharedMemo=on?new Map():null}
/** Writes the l4Bake attribute from world-space positions/normals. `toWorld` maps geometry space to map-local space. */
export function bakeL4Geometry(geo:THREE.BufferGeometry,sampler:L4Sampler,toWorld?:THREE.Matrix4,occ?:(x:number,y:number,z:number,nx:number,ny:number,nz:number)=>[number,number]){
  const pos=geo.getAttribute('position'),nor=geo.getAttribute('normal');if(!pos||!nor)return
  const out=new Float32Array(pos.count*4),nm=toWorld?new THREE.Matrix3().getNormalMatrix(toWorld):null
  const memo=sharedMemo??new Map<string,[number,number,number]>()
  for(let i=0;i<pos.count;i++){
    vA.fromBufferAttribute(pos,i);nA.fromBufferAttribute(nor,i)
    if(toWorld){vA.applyMatrix4(toWorld);nA.applyMatrix3(nm!).normalize()}
    const o=occ?.(vA.x,vA.y,vA.z,nA.x,nA.y,nA.z)
    const k=`${vA.x.toFixed(2)},${vA.y.toFixed(2)},${vA.z.toFixed(2)},${nA.x.toFixed(1)},${nA.y.toFixed(1)},${nA.z.toFixed(1)}`
    let c=memo.get(k);if(!c){c=sampler.sample(vA.x,vA.y,vA.z,nA.x,nA.y,nA.z,o?.[0],o?.[1]);memo.set(k,c)}
    out[i*4]=c[0];out[i*4+1]=c[1];out[i*4+2]=c[2];out[i*4+3]=0
  }
  geo.setAttribute('l4Bake',new THREE.BufferAttribute(out,4))
}

/** Shader hook: baked irradiance replaces most of the ambient term on baked geometry. */
export const L4_BAKE_VERTEX=['attribute vec4 l4Bake;\nvarying vec4 vL4Bake;\n','vL4Bake=l4Bake;']
export const L4_BAKE_FRAGMENT_HEAD='varying vec4 vL4Bake;\nuniform float l4BakeGain;\n'
export const L4_BAKE_FRAGMENT=`
  float l4Baked=1.-vL4Bake.w;
  reflectedLight.indirectDiffuse*=mix(1.,.35,l4Baked);
  reflectedLight.indirectDiffuse+=diffuseColor.rgb*vL4Bake.rgb*l4Baked*l4BakeGain;
`
export const l4BakeGain={value:1}
if(typeof window!=='undefined')Object.defineProperty(window,'__l4Gain',{configurable:true,get:()=>l4BakeGain.value,set:(v:number)=>{l4BakeGain.value=v}}) // dev: 截图对照
export function installL4Bake(shader:{vertexShader:string;fragmentShader:string;uniforms:Record<string,THREE.IUniform>}){
  shader.uniforms.l4BakeGain=l4BakeGain
  shader.vertexShader=L4_BAKE_VERTEX[0]+shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\n '+L4_BAKE_VERTEX[1])
  shader.fragmentShader=L4_BAKE_FRAGMENT_HEAD+shader.fragmentShader.replace('#include <lights_fragment_end>','#include <lights_fragment_end>\n'+L4_BAKE_FRAGMENT)
}

const samplers=new WeakMap<GameMap,{sig:string;s:L4Sampler}>()
/** One sampler per map state (window shift / new lights / new structures rebuild it). */
export function l4SamplerFor(m:GameMap):L4Sampler{
  const sig=`${m.inf?.ox},${m.inf?.oy},${m.lights.length},${m.structures.length},${m.w},${m.h}`,old=samplers.get(m)
  if(old&&old.sig===sig)return old.s
  const s=createL4Sampler(m);samplers.set(m,{sig,s});return s
}

/** Cheap bake for furniture/props: two samples at the mesh centre (up-facing and side-facing),
 * blended per vertex by its normal. Per-vertex sampling of detailed props is far too slow. */
export function bakeL4Coarse(geo:THREE.BufferGeometry,sampler:L4Sampler){
  const pos=geo.getAttribute('position'),nor=geo.getAttribute('normal');if(!pos||!nor)return
  geo.computeBoundingBox();const c=geo.boundingBox!.getCenter(vA),top=geo.boundingBox!.max.y
  const up=sampler.sample(c.x,top,c.z,0,1,0,c.x,c.z)
  const side=sampler.sample(c.x,c.y,c.z,.577,.577,.577,c.x,c.z),side2=sampler.sample(c.x,c.y,c.z,-.577,.577,-.577,c.x,c.z)
  const sd=[(side[0]+side2[0])*.5,(side[1]+side2[1])*.5,(side[2]+side2[2])*.5]
  const out=new Float32Array(pos.count*4)
  for(let i=0;i<pos.count;i++){const ny=nor.getY(i),k=ny>0?ny:0,dn=ny<0?1+ny*.6:1
    out[i*4]=(sd[0]+(up[0]-sd[0])*k)*dn;out[i*4+1]=(sd[1]+(up[1]-sd[1])*k)*dn;out[i*4+2]=(sd[2]+(up[2]-sd[2])*k)*dn;out[i*4+3]=0}
  geo.setAttribute('l4Bake',new THREE.BufferAttribute(out,4))
}
