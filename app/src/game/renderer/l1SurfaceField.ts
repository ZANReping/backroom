import * as THREE from 'three'
import type {GameMap} from '../world/mapgen'
const origin={value:new THREE.Vector2()}
export const l1MaterialOrigin=origin
/** Material variation uses absolute coordinates. It never blends through a wall,
 * samples a loaded window, or uploads a 256m field when the player crosses a chunk. */
export function updateL1SurfaceField(m:GameMap){if(m.inf)origin.value.set(m.inf.ox,m.inf.oy)}
export function installL1SurfaceField(mat:THREE.Material,surface:'floor'|'wall'|'ceiling',_maps:{ground:THREE.Texture;peeling:THREE.Texture;groundNormal:THREE.Texture;peelingNormal:THREE.Texture}){
 const prior=mat.onBeforeCompile,key=mat.customProgramCacheKey()
 mat.onBeforeCompile=(shader,renderer)=>{
  prior.call(mat,shader,renderer);shader.uniforms.l1WorldOrigin=origin
  shader.fragmentShader=`uniform vec2 l1WorldOrigin;
   float l1Noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);vec4 n=fract(sin(vec4(dot(i,vec2(127.1,311.7)),dot(i+vec2(1,0),vec2(127.1,311.7)),dot(i+vec2(0,1),vec2(127.1,311.7)),dot(i+1.,vec2(127.1,311.7))))*43758.5453);return mix(mix(n.x,n.y,f.x),mix(n.z,n.w,f.x),f.y);}
  `+shader.fragmentShader
  shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`#include <map_fragment>
   vec2 l1World=vL0WorldXZ+l1WorldOrigin;
   float l1Broad=l1Noise(l1World*.11+vec2(13.2,7.1));
   float l1Wear=l1Noise(l1World*.43+vec2(l1Broad*2.));
   diffuseColor.rgb*=mix(.86,1.09,l1Broad)*mix(.95,1.03,l1Wear);
   ${surface==='floor'?'diffuseColor.rgb*=mix(vec3(.97,.99,1.02),vec3(1.045,1.015,.975),l1Broad);':''}`)
  shader.fragmentShader=shader.fragmentShader.replace('#include <roughnessmap_fragment>','#include <roughnessmap_fragment>\nroughnessFactor=clamp(roughnessFactor+(.5-l1Wear)*.12,.12,1.);')
 }
 mat.customProgramCacheKey=()=>key+'|l1-world-material-v4-'+surface
}
export function disposeL1SurfaceField(){origin.value.set(0,0)}
