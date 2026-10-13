import * as THREE from 'three'
import type {L1BakeResult} from '../world/l1BakeTypes'
import {l1PortalVisibility,l1PortalRevision} from './l1PortalLighting'
export const l1NativePower={value:1},l1ProbeActive={value:0}
const SIZE=64,data=new Float32Array(SIZE*SIZE*4),texture=new THREE.DataTexture(data,SIZE,SIZE,THREE.RGBAFormat,THREE.FloatType)
texture.minFilter=texture.magFilter=THREE.LinearFilter;texture.generateMipmaps=false;texture.colorSpace=THREE.NoColorSpace
const field={value:texture},bounds={value:new THREE.Vector2()},installed=new Map<string,L1BakeResult>(),owners=new Map<L1BakeResult,number>()
let revision=0,lastKey=''
export function registerL1Probes(r:L1BakeResult){owners.set(r,(owners.get(r)??0)+1);installed.set(`${r.seed}:${r.cx},${r.cy}`,r);revision++}
export function removeL1Probes(r:L1BakeResult){
 const n=owners.get(r)??0;if(n>1){owners.set(r,n-1);return}owners.delete(r)
 if(installed.get(`${r.seed}:${r.cx},${r.cy}`)===r){installed.delete(`${r.seed}:${r.cx},${r.cy}`);revision++}
}
export function updateL1Probes(seed:number,ox:number,oz:number,active:boolean){
 l1ProbeActive.value=active?1:0;if(!active)return
 const key=`${seed}:${ox},${oz}:${revision}:${l1PortalRevision()}`;if(key===lastKey)return;lastKey=key;data.fill(0);bounds.value.set(-48,-48)
 for(const r of installed.values())if(r.seed===seed)for(const p of r.probes){const x=Math.floor((p.position[0]-ox+48)/4),z=Math.floor((p.position[2]-oz+48)/4);if(x<0||z<0||x>=SIZE||z>=SIZE)continue;const i=(z*SIZE+x)*4,k=l1PortalVisibility(seed,r.portalIds,p.indirectPortal);for(let j=0;j<3;j++)data[i+j]=p.indirect[j]*k;data[i+3]=1}texture.needsUpdate=true
}
export function l1ProbeIlluminance(seed:number,x:number,z:number){
 const r=installed.get(`${seed}:${Math.floor(x/32)},${Math.floor(z/32)}`);if(!r)return 0
 let sum=0,weight=0;for(const p of r.probes){const d=Math.hypot(x-p.position[0],z-p.position[2]);if(d>7)continue;const k=1/(.1+d*d);sum+=(p.color[0]*.2126+p.color[1]*.7152+p.color[2]*.0722)*k*l1PortalVisibility(seed,r.portalIds,p.portal);weight+=k}return weight?sum/weight*l1NativePower.value:0
}
export function installL1DynamicProbe(mat:THREE.Material){
 const prior=mat.onBeforeCompile,key=mat.customProgramCacheKey()
 mat.onBeforeCompile=(shader,renderer)=>{
  prior.call(mat,shader,renderer);Object.assign(shader.uniforms,{l1ProbeActive,l1NativePower,l1ProbeField:field,l1ProbeOrigin:bounds})
  shader.vertexShader='varying vec2 vL1ProbePosition;\n'+shader.vertexShader
  shader.vertexShader=shader.vertexShader.replace('#include <project_vertex>',`vec4 l1ProbeWorld=vec4(transformed,1.);
   #ifdef USE_INSTANCING
   l1ProbeWorld=instanceMatrix*l1ProbeWorld;
   #endif
   vL1ProbePosition=(modelMatrix*l1ProbeWorld).xz;
   #include <project_vertex>`)
  shader.fragmentShader='uniform float l1ProbeActive,l1NativePower;uniform sampler2D l1ProbeField;uniform vec2 l1ProbeOrigin;varying vec2 vL1ProbePosition;\n'+shader.fragmentShader
  shader.fragmentShader=shader.fragmentShader.replace('#include <lights_fragment_maps>',`#include <lights_fragment_maps>
   #if defined(RE_IndirectDiffuse) && !defined(USE_LIGHTMAP)
   vec2 l1ProbeUV=(vL1ProbePosition-l1ProbeOrigin)/256.;
   if(l1ProbeActive>.5&&l1ProbeUV.x>=0.&&l1ProbeUV.y>=0.&&l1ProbeUV.x<1.&&l1ProbeUV.y<1.)irradiance+=texture2D(l1ProbeField,l1ProbeUV).rgb*3.14159265*l1NativePower;
   #endif`)
 }
 mat.customProgramCacheKey=()=>key+'|l1-dynamic-indirect-v4'
}
export function disposeL1Probes(){texture.dispose();installed.clear();owners.clear();lastKey=''}
