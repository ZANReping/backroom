import * as THREE from 'three'
import type {GameMap} from '../world/mapgen'
import {l0EnvironmentAt,l0LayoutEnvironment} from '../world/l0Regions'

const SIZE=128,STEP=2,data=new Uint8Array(SIZE*SIZE*4)
data.fill(255)
const texture=new THREE.DataTexture(data,SIZE,SIZE,THREE.RGBAFormat)
texture.minFilter=texture.magFilter=THREE.LinearFilter;texture.generateMipmaps=false;texture.needsUpdate=true
export const l0WorldLighting={enabled:{value:0},perception:{value:0},field:{value:texture},bounds:{value:new THREE.Vector4(-48,-48,SIZE*STEP,SIZE*STEP)}}
let lastKey=''
const samples=new Map<string,number>()
/** One shared, bounded field. Refilled only when the window/environment changes. */
export function updateL0EnvironmentShader(m:GameMap,level:number,bright:boolean,nightVision:boolean){
 const inf=m.inf,active=level===0&&!!inf?.l0
 l0WorldLighting.enabled.value=active&&!bright&&!nightVision?1:0;l0WorldLighting.perception.value=active&&!bright&&!nightVision?1:0
 if(!active||!inf)return
 const key=`${inf.seed}:${inf.ox},${inf.oy}:${inf.l0!.space}`;if(key===lastKey)return;lastKey=key
 for(let y=0;y<SIZE;y++)for(let x=0;x<SIZE;x++){
  const wx=inf.ox-48+(x+.5)*STEP,wy=inf.oy-48+(y+.5)*STEP,chunk=inf.chunks.get(`${Math.floor(wx/32)},${Math.floor(wy/32)}`)
  const sampleKey=`${inf.seed}:${wx},${wy}:${chunk?.l0?.effectOverride??''}`
  let value=samples.get(sampleKey)
  if(value===undefined){const e=chunk?.l0?l0LayoutEnvironment(chunk.l0,wx,wy):l0EnvironmentAt(inf.seed,wx,wy);value=Math.round(255*(1-e.blackout));if(samples.size>=32768)samples.delete(samples.keys().next().value!);samples.set(sampleKey,value)}
  const i=(y*SIZE+x)*4;data[i]=value;data[i+1]=data[i+2]=0;data[i+3]=255
 }
 texture.needsUpdate=true
}
/** Shared surface lighting, independent of the camera's current region. */
export function installL0EnvironmentShader(mat:THREE.Material){
 const previous=mat.onBeforeCompile.bind(mat)
 mat.onBeforeCompile=(shader,renderer)=>{
  previous(shader,renderer)
  Object.assign(shader.uniforms,{l0EnvironmentOn:l0WorldLighting.enabled,l0PerceptionOn:l0WorldLighting.perception,l0EnvironmentMap:l0WorldLighting.field,l0EnvironmentBounds:l0WorldLighting.bounds})
  shader.vertexShader='varying vec2 vL0WorldXZ;\n'+shader.vertexShader
  shader.vertexShader=shader.vertexShader.replace('#include <project_vertex>',`vec4 l0World=vec4(transformed,1.);
  #ifdef USE_INSTANCING
  l0World=instanceMatrix*l0World;
  #endif
  vL0WorldXZ=(modelMatrix*l0World).xz;
  #include <project_vertex>`)
  shader.fragmentShader='uniform float l0EnvironmentOn,l0PerceptionOn;uniform sampler2D l0EnvironmentMap;uniform vec4 l0EnvironmentBounds;varying vec2 vL0WorldXZ;\n'+shader.fragmentShader
  shader.fragmentShader=shader.fragmentShader.replace('#include <lights_fragment_end>',`#include <lights_fragment_end>
  if(l0EnvironmentOn>.5){
  float l0LocalFill=texture2D(l0EnvironmentMap,(vL0WorldXZ-l0EnvironmentBounds.xy)/l0EnvironmentBounds.zw).r;
  reflectedLight.indirectDiffuse*=l0LocalFill;
  reflectedLight.indirectSpecular*=l0LocalFill;}`)
  shader.fragmentShader=shader.fragmentShader.replace('#include <opaque_fragment>',`float l0Lum=dot(outgoingLight,vec3(.2126,.7152,.0722));
  float l0Chroma=mix(1.,mix(.4,1.,smoothstep(.002,.07,l0Lum)),l0PerceptionOn);
  outgoingLight=mix(vec3(l0Lum),outgoingLight,l0Chroma);
  #include <opaque_fragment>`)
 }
 mat.customProgramCacheKey=()=> 'l0-spatial-environment-v3'
}
