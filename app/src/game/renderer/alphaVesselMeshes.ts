import * as THREE from 'three'
import {litMaterial,getMaterialMode} from './shared'
import type {AlphaPart} from '../content/alphaDecor'

export function alphaVesselGeometries(){
 const profile=[[0,-.5],[.40,-.5],[.45,-.45],[.49,.43],[.49,.48],[.47,.5],[.425,.49],[.417,.44],[.38,-.37],[.35,-.40],[0,-.40]]
 const cup=new THREE.LatheGeometry(profile.map(([r,y])=>new THREE.Vector2(r,y)),20)
 const handle=new THREE.TorusGeometry(.34,.09,6,14,Math.PI*1.4)
 handle.rotateZ(-Math.PI*.7);handle.computeBoundingBox()
 const b=handle.boundingBox!,size=new THREE.Vector3();b.getSize(size)
 handle.translate(-(b.min.x+b.max.x)/2,-(b.min.y+b.max.y)/2,0);handle.scale(1/size.x,1/size.y,1/size.z)
 const disc=new THREE.CircleGeometry(.5,20);disc.rotateX(-Math.PI/2)
 const plane=new THREE.PlaneGeometry(1,1);plane.rotateX(-Math.PI/2)
 return {cup,cup_handle:handle,liquid_disc:disc,liquid_plane:plane}
}

/** Existing environment/flashlight supplies highlights: no refraction pass or extra light. */
export function alphaLiquidMaterial(p:AlphaPart){
 const water=p.surface==='water'
 const mat=litMaterial({color:p.color,roughness:water?.12:.18,metalness:0,envBase:.55,transparent:water,opacity:water?.46:1,depthWrite:!water})
 mat.name='alpha-'+p.surface;mat.userData.l1Owned=true;mat.userData.alphaLiquid=true
 if(getMaterialMode()==='realistic'){
  const prior=mat.onBeforeCompile,key=mat.customProgramCacheKey()
  mat.onBeforeCompile=(shader,renderer)=>{
   prior.call(mat,shader,renderer)
   shader.vertexShader='varying vec2 vAlphaLiquidUv;\n'+shader.vertexShader
   shader.vertexShader=shader.vertexShader.replace('#include <uv_vertex>','#include <uv_vertex>\nvAlphaLiquidUv=uv;')
   shader.fragmentShader='varying vec2 vAlphaLiquidUv;\n'+shader.fragmentShader
   shader.fragmentShader=shader.fragmentShader.replace('#include <normal_fragment_maps>',`#include <normal_fragment_maps>
    vec2 slope=vec2(cos(vAlphaLiquidUv.x*25.+vAlphaLiquidUv.y*9.),sin(vAlphaLiquidUv.y*21.-vAlphaLiquidUv.x*7.))*.006;
    normal=normalize(normal+vec3(slope,0.));`)
   if(water)shader.fragmentShader=shader.fragmentShader.replace('#include <opaque_fragment>',`float waterGrazing=pow(1.-clamp(dot(normal,normalize(vViewPosition)),0.,1.),4.);
    diffuseColor.a=mix(.25,.78,waterGrazing);
    #include <opaque_fragment>`)
  };mat.customProgramCacheKey=()=>key+'|alpha-liquid-v1'
 }
 return mat
}
