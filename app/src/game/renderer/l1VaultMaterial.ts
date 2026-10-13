import type * as THREE from 'three'
import {l1MaterialOrigin} from './l1SurfaceField'

/** The shaft and curved springing share a world-scale plaster projection. The
 * horizontal lightmap remains independent; its UV must not drive surface detail. */
export function installL1VaultMaterial(mat:THREE.Material){
 const prior=mat.onBeforeCompile,key=mat.customProgramCacheKey()
 mat.onBeforeCompile=(shader,renderer)=>{
  prior.call(mat,shader,renderer)
  shader.uniforms.l1VaultOrigin=l1MaterialOrigin
  shader.uniforms.l1VaultSpringing={value:1.35}
  shader.vertexShader='varying vec3 vL1VaultPosition;varying vec3 vL1VaultNormal;\n'+shader.vertexShader
  shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>
   vL1VaultPosition=(modelMatrix*vec4(transformed,1.)).xyz;
   vL1VaultNormal=normalize(mat3(modelMatrix)*normal);`)
  shader.fragmentShader=`uniform vec2 l1VaultOrigin;uniform float l1VaultSpringing;varying vec3 vL1VaultPosition;varying vec3 vL1VaultNormal;
   vec4 l1VaultSample(sampler2D tex,vec3 p,vec3 w){return texture2D(tex,p.zy)*w.x+texture2D(tex,p.xz)*w.y+texture2D(tex,p.xy)*w.z;}
  `+shader.fragmentShader
  shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`#include <map_fragment>
   vec3 l1VaultP=(vL1VaultPosition+vec3(l1VaultOrigin.x,0.,l1VaultOrigin.y))*.32;
   vec3 l1VaultN=normalize(vL1VaultNormal),l1VaultW=pow(abs(l1VaultN),vec3(4.));l1VaultW/=max(.0001,dot(l1VaultW,vec3(1.)));
   sampledDiffuseColor=l1VaultSample(map,l1VaultP,l1VaultW);
   diffuseColor=vec4(diffuse*sampledDiffuseColor.rgb,opacity);
   vec3 l1Patina=l1VaultSample(map,l1VaultP*.71+vec3(.31,.07,.53),l1VaultW).rgb;
   float l1PatinaL=dot(l1Patina,vec3(.2126,.7152,.0722));
   float l1Shaft=1.-smoothstep(l1VaultSpringing-.08,l1VaultSpringing+.25,vL1VaultPosition.y);
   float l1Joint=1.-smoothstep(.016,.06,abs(vL1VaultPosition.y-l1VaultSpringing));
   float l1Dirt=1.-smoothstep(.15,.55,l1PatinaL);
   diffuseColor.rgb*=1.-l1Shaft*l1Dirt*.52-l1Joint*(.22+.26*l1Dirt);`)
  shader.fragmentShader=shader.fragmentShader.replace('#include <normal_fragment_maps>',`
   #ifdef USE_NORMALMAP
    vec3 l1NX=texture2D(normalMap,l1VaultP.zy).xyz*2.-1.,l1NY=texture2D(normalMap,l1VaultP.xz).xyz*2.-1.,l1NZ=texture2D(normalMap,l1VaultP.xy).xyz*2.-1.;
    vec3 l1Perturb=vec3(0.,l1NX.y,l1NX.x)*l1VaultW.x+vec3(l1NY.x,0.,l1NY.y)*l1VaultW.y+vec3(l1NZ.x,l1NZ.y,0.)*l1VaultW.z;
    l1Perturb*=normalScale.x;
    normal=normalize(mat3(viewMatrix)*normalize(l1VaultN+l1Perturb));
   #endif`)
  shader.fragmentShader=shader.fragmentShader.replace('#include <roughnessmap_fragment>',`
   float roughnessFactor=roughness;
   #ifdef USE_ROUGHNESSMAP
    roughnessFactor*=l1VaultSample(roughnessMap,l1VaultP,l1VaultW).g;
   #endif`)
 }
 mat.customProgramCacheKey=()=>key+'|l1-vault-triplanar-v2'
}
