import * as THREE from 'three'
import {l0StaticPointMask} from './l0PointMask'
import {l1BakedPointLights} from './l1BakedShader'
import {tradersArchPosts,tradersHallPosts} from '../content/tradersRibs'
import {TRADERS_WALLS,TRADERS_DOORS} from '../content/tradersLayout'
import {tradersLightsNear} from '../world/tradersWorld'

/** Static wall visibility is resolved against the complete cheap plan, never loaded neighbours. */
interface Block{x:number;z:number;w:number;d:number;bottom:number;top:number}
const blockers:Block[]=[...[...tradersArchPosts(),...tradersHallPosts()].map(s=>({x:s.x,z:s.y,w:s.w,d:s.h,bottom:0,top:Number(s.data?.height??4.8)})),...TRADERS_WALLS.map(w=>({x:w.x,z:w.y,w:w.w,d:w.h,bottom:w.bottom,top:w.bottom+w.height})),...TRADERS_DOORS.map(d=>({x:d.x,z:d.y,w:d.w,d:d.h,bottom:0,top:d.height}))]
let grid:Map<string,Block[]>|undefined
function spatial(){
 if(grid)return grid
 grid=new Map()
 for(const b of blockers)for(let z=Math.floor(b.z/8);z<=Math.floor((b.z+b.d)/8);z++)for(let x=Math.floor(b.x/8);x<=Math.floor((b.x+b.w)/8);x++){
  const key=x+','+z,a=grid.get(key)??[];a.push(b);grid.set(key,a)
 }
 return grid
}
function hit(b:Block,x:number,y:number,z:number,dx:number,dy:number,dz:number){
 let lo=.002,hi=.998
 for(const [v,d,a,c] of [[x,dx,b.x,b.x+b.w],[y,dy,b.bottom,b.top],[z,dz,b.z,b.z+b.d]]){
  if(Math.abs(d)<1e-9){if(v<a||v>c)return false;continue}
  let aa=(a-v)/d,bb=(c-v)/d;if(aa>bb){const t=aa;aa=bb;bb=t}
  lo=Math.max(lo,aa);hi=Math.min(hi,bb);if(lo>hi)return false
 }
 return true
}
export function tradersStaticVisibility(x:number,y:number,z:number,lx:number,ly:number,lz:number){
 const dx=lx-x,dy=ly-y,dz=lz-z,steps=Math.max(1,Math.ceil(Math.hypot(dx,dz)/4)),seen=new Set<Block>(),g=spatial()
 for(let i=0;i<=steps;i++){
  const gx=Math.floor((x+dx*i/steps)/8),gz=Math.floor((z+dz*i/steps)/8)
  for(const b of g.get(gx+','+gz)??[]){if(seen.has(b))continue;seen.add(b);if(hit(b,x,y,z,dx,dy,dz))return false}
 }
 return true
}
// Rotate whole generations: repeatedly deleting Map's first key leaves a long
// tombstone chain and makes a full cache progressively slower during travel.
const SAMPLE_GENERATION_SIZE=72000
let points=new Map<string,readonly [number,number,number]>(),previousPoints=new Map<string,readonly [number,number,number]>()
const colors=new Map<string,readonly [number,number,number]>()
function color(s:string):readonly [number,number,number]{
 let c=colors.get(s);if(c)return c
 const n=parseInt(s.replace('#',''),16);c=[((n>>16&255)/255)**2.2,((n>>8&255)/255)**2.2,((n&255)/255)**2.2];colors.set(s,c);return c
}
export function tradersIrradiance(x:number,y:number,z:number,nx:number,ny:number,nz:number):readonly [number,number,number]{
 const key=[x,y,z,nx,ny,nz].map(v=>Math.round(v*200)).join(':')
 const old=points.get(key)??previousPoints.get(key);if(old)return old
 const xx=x+nx*.026,yy=y+ny*.026,zz=z+nz*.026
 let r=.072,g=.076,b=.073
 const sources=tradersLightsNear(xx,zz,17)
 for(const l of sources){
  const ly=(l.fixZ??4.6)-.2,dx=l.x-xx,dy=ly-yy,dz=l.y-zz,d2=dx*dx+dy*dy+dz*dz
  if(d2>260)continue
  const len=Math.sqrt(d2),cos=Math.max(0,(nx*dx+ny*dy+nz*dz)/Math.max(.02,len))
  if(cos<=0)continue
  let visibility=0
  for(const [sx,sz] of [[0,0],[-.35,-.16],[.35,.16]])if(tradersStaticVisibility(xx,yy,zz,l.x+sx,ly,l.y+sz))visibility+=1/3
  if(!visibility)continue
  const down=dy>0?1:.30,energy=visibility*cos*down*7.4/(d2+2)*(1-d2/300),rgb=color(l.color)
  r+=rgb[0]*energy;g+=rgb[1]*energy;b+=rgb[2]*energy
 }
 if(ny>.8&&y<.2){
  let dist=2
  const near=spatial().get(Math.floor(xx/8)+','+Math.floor(zz/8))??[]
  for(const w of near)if(w.bottom<.12&&w.top>.25)dist=Math.min(dist,Math.hypot(Math.max(w.x-xx,0,xx-w.x-w.w),Math.max(w.z-zz,0,zz-w.z-w.d)))
  const t=Math.min(1,Math.max(0,dist/.52)),ao=.56+.44*t*t*(3-2*t)
  r*=ao;g*=ao;b*=ao
 }
 const result:[number,number,number]=[Math.min(1.8,r),Math.min(1.8,g),Math.min(1.8,b)]
 if(points.size>=SAMPLE_GENERATION_SIZE){previousPoints=points;points=new Map()}
 points.set(key,result)
 return result
}
export const tradersBakeOverride={value:0}
const nativePoints=l1BakedPointLights(THREE.ShaderChunk.lights_fragment_begin)
export function applyTradersBake(material:THREE.Material){
 if(material.userData.tradersBaked||!(material instanceof THREE.MeshLambertMaterial||material instanceof THREE.MeshStandardMaterial||material instanceof THREE.MeshPhongMaterial))return
 const prior=material.onBeforeCompile,key=material.customProgramCacheKey()
 material.onBeforeCompile=(shader,renderer)=>{
  prior.call(material,shader,renderer)
  Object.assign(shader.uniforms,{tradersBakeOverride,l1BakedMask:l0StaticPointMask})
  shader.vertexShader='attribute vec3 tradersLight;varying vec3 vTradersLight;\n'+shader.vertexShader
  shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvTradersLight=tradersLight;')
  shader.fragmentShader='varying vec3 vTradersLight;uniform float tradersBakeOverride;uniform float l1BakedMask[128];\n'+shader.fragmentShader
  shader.fragmentShader=shader.fragmentShader.replace('#include <lights_fragment_begin>',nativePoints)
  shader.fragmentShader=shader.fragmentShader.replace('#include <lights_fragment_maps>','#include <lights_fragment_maps>\nirradiance=mix(vTradersLight*3.14159265,irradiance,tradersBakeOverride);')
 }
 material.customProgramCacheKey=()=>key+'|traders-bake-4'
 material.userData.tradersBaked=true;material.userData.l1Owned=true;material.needsUpdate=true
}
export type TradersProbe=ReadonlyArray<readonly [number,number,number]>
export interface TradersProbeField{axis:'x'|'z';low:number;high:number;probes:readonly TradersProbe[];bottom?:number;top?:number;rows?:readonly (readonly TradersProbe[])[]}
export function* bakeTradersGeometry(geo:THREE.BufferGeometry,matrix?:THREE.Matrix4,probe?:TradersProbe|TradersProbeField):Generator<void,void,unknown>{
 const p=geo.getAttribute('position'),n=geo.getAttribute('normal');if(!p||!n)return
 const data=new Float32Array(p.count*3),v=new THREE.Vector3(),normal=new THREE.Vector3(),normalMatrix=matrix?new THREE.Matrix3().getNormalMatrix(matrix):undefined
 for(let i=0;i<p.count;i++){
  v.fromBufferAttribute(p,i);normal.fromBufferAttribute(n,i)
  if(matrix){v.applyMatrix4(matrix);normal.applyMatrix3(normalMatrix!).normalize()}
  if(probe){
   const field='axis' in probe?probe:undefined,t=field?Math.max(0,Math.min(1,(v[field.axis]-field.low)/Math.max(.001,field.high-field.low)))*(field.probes.length-1):0,index=Math.floor(t),blend=t-index
   const rows=field?.rows,ht=rows?Math.max(0,Math.min(1,(v.y-field!.bottom!)/Math.max(.001,field!.top!-field!.bottom!)))*(rows.length-1):0,row=Math.floor(ht),vertical=ht-row
   const lower=rows?rows[row]:field?.probes,upper=rows?rows[Math.min(rows.length-1,row+1)]:lower
   const a=lower?lower[index]:probe as TradersProbe,b=lower?lower[Math.min(lower.length-1,index+1)]:a,c=upper?upper[index]:a,d=upper?upper[Math.min(upper.length-1,index+1)]:b
   const xx=normal.x*normal.x,yy=normal.y*normal.y,zz=normal.z*normal.z,ix=normal.x>=0?0:1,iy=normal.y>=0?2:3,iz=normal.z>=0?4:5
   for(let channel=0;channel<3;channel++){
    const one=a[ix][channel]*xx+a[iy][channel]*yy+a[iz][channel]*zz,two=b[ix][channel]*xx+b[iy][channel]*yy+b[iz][channel]*zz,three=c[ix][channel]*xx+c[iy][channel]*yy+c[iz][channel]*zz,four=d[ix][channel]*xx+d[iy][channel]*yy+d[iz][channel]*zz
    const low=one+(two-one)*blend,high=three+(four-three)*blend;data[i*3+channel]=low+(high-low)*vertical
   }
  }else data.set(tradersIrradiance(v.x,v.y,v.z,normal.x,normal.y,normal.z),i*3)
  if(i%96===95)yield
 }
 geo.setAttribute('tradersLight',new THREE.BufferAttribute(data,3))
}
export function clearTradersBakeCache(){points.clear();previousPoints.clear();colors.clear()}
