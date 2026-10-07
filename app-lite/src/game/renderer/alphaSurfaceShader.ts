import type * as THREE from 'three'
import type { AlphaSurface } from '../content/alphaDecor'

// Metre-based finishes stay continuous across the authored one-metre floor runs,
// split window walls and instanced batches. No extra meshes or unique textures.
const detailFunctions = /* glsl */`
varying vec3 vAlphaWorld;
varying vec2 vAlphaPlane;
float alphaHash(vec2 p) {
 vec3 q=fract(vec3(p.xyx)*0.1031);
 q+=dot(q,q.yzx+33.33);
 return fract((q.x+q.y)*q.z);
}
float alphaNoise(vec2 p) {
 vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);
 return mix(mix(alphaHash(i),alphaHash(i+vec2(1,0)),f.x),mix(alphaHash(i+vec2(0,1)),alphaHash(i+vec2(1,1)),f.x),f.y);
}
float alphaJoint(vec2 p,vec2 period,float width) {
 vec2 edge=min(fract(p/period),1.0-fract(p/period))*period;
 float distanceToJoint=min(edge.x,edge.y);
 float aa=max(fwidth(p.x),fwidth(p.y));
 return 1.0-smoothstep(width,width+max(aa,0.001),distanceToJoint);
}
float alphaScuff(vec2 p) {
 vec2 cell=floor(p/0.8),f=fract(p/0.8)-0.5;
 float seed=alphaHash(cell+17.0),aa=max(fwidth(p.x),fwidth(p.y));
 float line=abs(f.y+f.x*(alphaHash(cell+41.0)-0.5)*1.1+(seed-0.5)*0.25);
 return step(0.84,seed)*(1.0-smoothstep(0.002,0.008+aa,line))*(1.0-smoothstep(0.06,0.17,abs(f.x)));
}
`;

function finish(surface:AlphaSurface):string {
 switch(surface){
 case 'admin_stone':return /* glsl */`
  vec2 p=vAlphaWorld.xz-vec2(67.0,18.0);
  float edge=min(min(p.x,10.0-p.x),min(p.y,14.0-p.y));
  float band=step(0.75,edge)*(1.0-step(1.17,edge))+step(1.55,edge)*(1.0-step(1.70,edge));
  float grain=dot(diffuseColor.rgb/max(diffuse,vec3(0.001)),vec3(0.333333));
  diffuseColor.rgb=mix(diffuse,vec3(0.61,0.56,0.40),band)*(0.82+grain*0.35)*(0.94+alphaHash(floor(p/0.45))*0.08);
  diffuseColor.rgb*=1.0-alphaJoint(p,vec2(0.45),0.002)*0.20-alphaScuff(p)*0.08;
  float alphaWear=0.02;
 `;
 case 'painted_block':return /* glsl */`
  vec2 p=vAlphaPlane;p.x+=mod(floor(p.y/0.2),2.0)*0.2;
  float joint=alphaJoint(p,vec2(0.4,0.2),0.004);
  diffuseColor.rgb=mix(diffuseColor.rgb*1.4,diffuse,0.8)*(0.96+alphaNoise(p*6.0)*0.07)*(1.0-joint*0.12);
  float alphaWear=0.08;
 `;
 case 'cardboard':return 'diffuseColor.rgb=mix(diffuseColor.rgb*1.65,diffuse,0.5)*(0.96+alphaNoise(vAlphaPlane*14.0)*0.07);float alphaWear=0.04;';
 case 'packing_tape':return 'diffuseColor.rgb=diffuse*(0.91+alphaNoise(vAlphaPlane*vec2(38.0,4.0))*0.17);float alphaWear=0.015;';
 case 'perforated_metal':return /* glsl */`
  vec2 hole=fract(vAlphaPlane/0.018)-0.5;
  float aa=max(fwidth(vAlphaPlane.x),fwidth(vAlphaPlane.y))/0.018;
  float dots=(1.0-smoothstep(0.18,0.23+aa,length(hole)))*(1.0-smoothstep(0.2,0.8,aa));
  diffuseColor.rgb=mix(diffuseColor.rgb*1.3,diffuse,0.85)*(1.0-dots*0.8);float alphaWear=0.03;
 `;
 case 'aquila_concrete':return /* glsl */`
  float cloud=alphaNoise(vAlphaPlane*0.48),surfacePatch=alphaNoise(vAlphaPlane*2.1);
  float grain=dot(diffuseColor.rgb/max(diffuse,vec3(0.001)),vec3(0.33333));
  float seam=alphaJoint(vAlphaPlane,vec2(3.2,2.4),0.004);
  diffuseColor.rgb=diffuse*(0.67+grain*0.6)*(0.78+cloud*0.3+surfacePatch*0.12);
  diffuseColor.rgb*=1.0-seam*0.08-alphaScuff(vAlphaPlane)*0.15;float alphaWear=cloud*0.09;
 `;
 case 'cave_rock':return 'float rockGrain=dot(diffuseColor.rgb/max(diffuse,vec3(0.001)),vec3(0.33333));diffuseColor.rgb=diffuse*(0.52+rockGrain*0.7)*(0.78+alphaNoise(vAlphaPlane*0.65)*0.3);float alphaWear=0.12;';
 case 'substrate':return /* glsl */`
  float speck=alphaNoise(vAlphaPlane*120.0),crust=smoothstep(0.64,0.8,alphaNoise(vAlphaPlane*65.0));
  diffuseColor.rgb=mix(diffuseColor.rgb*2.0,diffuse,0.45)*(0.65+speck*0.75);
  diffuseColor.rgb=mix(diffuseColor.rgb,vec3(0.58,0.55,0.44),crust*0.45);float alphaWear=0.12;
 `;
 case 'residential_panel':return /* glsl */`
  float line=alphaJoint(vec2(vAlphaPlane.x,0.2),vec2(0.16,4.0),0.0015);
  float grain=dot(diffuseColor.rgb/max(diffuse,vec3(0.001)),vec3(0.333333));
  diffuseColor.rgb=diffuse*(0.82+grain*0.35)*(0.96+alphaNoise(vAlphaPlane*1.3)*0.06)*(1.0-line*0.22);float alphaWear=0.03;
 `;
 case 'plaster': return /* glsl */`
  float pigment=dot(diffuseColor.rgb/max(diffuse,vec3(0.001)),vec3(0.2126,0.7152,0.0722));
  float cloud=alphaNoise(vAlphaPlane*0.43);
  float roller=alphaNoise(vec2(vAlphaPlane.x*3.5,vAlphaPlane.y*0.9));
  float lower=1.0-smoothstep(1.03,1.045,vAlphaWorld.y);
  float rail=1.0-smoothstep(0.009,0.014+fwidth(vAlphaWorld.y),abs(vAlphaWorld.y-1.045));
  float rub=alphaScuff(vec2(vAlphaPlane.x,vAlphaWorld.y*1.8))*(1.0-smoothstep(0.65,1.3,vAlphaWorld.y));
  float foot=exp(-max(vAlphaWorld.y-0.13,0.0)*7.0)*(0.3+0.7*cloud);
  diffuseColor.rgb=diffuse*(0.76+pigment*0.55)*(0.94+cloud*0.09+roller*0.035);
  diffuseColor.rgb*=mix(vec3(1.0),vec3(0.82,0.88,0.85),lower);
  diffuseColor.rgb=mix(diffuseColor.rgb,diffuse*0.72,rail*0.65);
  diffuseColor.rgb*=1.0-rub*0.15-foot*0.075;
  float alphaWear=cloud*0.07+rub*0.08;
 `;
 case 'ceiling': return /* glsl */`
  vec2 panelCell=floor(vAlphaWorld.xz/vec2(1.2,0.6));
  float panelTone=alphaHash(panelCell);
  float joint=alphaJoint(vAlphaWorld.xz,vec2(1.2,0.6),0.006);
  float panelEdge=alphaJoint(vAlphaWorld.xz,vec2(1.2,0.6),0.026);
  float grain=dot(diffuseColor.rgb/max(diffuse,vec3(0.001)),vec3(0.333333));
  float pores=step(0.87,alphaHash(floor(vAlphaWorld.xz*105.0)));
  pores*=1.0-smoothstep(0.006,0.025,max(fwidth(vAlphaWorld.x),fwidth(vAlphaWorld.z)));
  diffuseColor.rgb=diffuse*(0.86+grain*0.23)*(0.91+panelTone*0.10);
  diffuseColor.rgb*=1.0-panelEdge*0.065-pores*0.14;
  diffuseColor.rgb=mix(diffuseColor.rgb,diffuse*vec3(0.56,0.58,0.56),joint*0.55);
  // A few replaced / lightly yellowed panels, never baked-in fake lamps.
  diffuseColor.rgb*=mix(vec3(1.0),vec3(1.0,0.975,0.91),step(0.9,panelTone)*0.55);
  float alphaWear=0.05;
 `;
 case 'soffit': return /* glsl */`
  float cloud=alphaNoise(vAlphaWorld.xz*0.65);
  float joint=alphaJoint(vAlphaWorld.xz,vec2(2.4,1.2),0.004);
  float grain=dot(diffuseColor.rgb/max(diffuse,vec3(0.001)),vec3(0.333333));
  diffuseColor.rgb=diffuse*(0.78+grain*0.48)*(0.93+cloud*0.10);
  diffuseColor.rgb*=1.0-joint*0.14;
  float alphaWear=cloud*0.07;
 `;
 case 'terrazzo_floor': return /* glsl */`
  float joint=alphaJoint(vAlphaWorld.xz,vec2(1.2),0.0025);
  float mottle=alphaNoise(vAlphaWorld.xz*0.36);
  float scuff=alphaScuff(vAlphaWorld.xz);
  diffuseColor.rgb=mix(diffuseColor.rgb*1.65,diffuse,0.38);
  diffuseColor.rgb*=0.94+mottle*0.10;
  diffuseColor.rgb*=1.0-joint*0.22-scuff*0.17;
  float alphaWear=mottle*0.09+scuff*0.12;
 `;
 case 'tile': return /* glsl */`
  float joint=alphaJoint(vAlphaWorld.xz,vec2(0.6),0.0025);
  float edge=alphaJoint(vAlphaWorld.xz,vec2(0.6),0.009);
  float tileTone=alphaHash(floor(vAlphaWorld.xz/0.6));
  float scuff=alphaScuff(vAlphaWorld.xz);
  diffuseColor.rgb=mix(diffuseColor.rgb*1.6,diffuse,0.88)*(0.94+tileTone*0.075);
  diffuseColor.rgb*=1.0-joint*0.28-edge*0.06-scuff*0.12;
  float alphaWear=tileTone*0.09+scuff*0.15;
 `;
 case 'vinyl': return /* glsl */`
  float grain=dot(diffuseColor.rgb/max(diffuse,vec3(0.001)),vec3(0.333333));
  float tone=alphaHash(floor(vAlphaWorld.xz/0.6));
  float joint=alphaJoint(vAlphaWorld.xz,vec2(0.6),0.0015);
  float mottle=alphaNoise(vAlphaWorld.xz*0.7),scuff=alphaScuff(vAlphaWorld.xz);
  diffuseColor.rgb=diffuse*(0.76+grain*0.57)*(0.92+tone*0.09+mottle*0.06);
  diffuseColor.rgb*=1.0-joint*0.14-scuff*0.17;
  float alphaWear=mottle*0.14+scuff*0.12;
 `;
 case 'linoleum': return /* glsl */`
  float mottle=alphaNoise(vAlphaWorld.xz*0.4),scuff=alphaScuff(vAlphaWorld.xz);
  float weld=alphaJoint(vAlphaWorld.xz,vec2(2.0,12.0),0.0018);
  diffuseColor.rgb=mix(diffuseColor.rgb*1.55,diffuse,0.77)*(0.94+mottle*0.09);
  diffuseColor.rgb*=1.0-weld*0.10-scuff*0.10;
  float alphaWear=mottle*0.15+scuff*0.1;
 `;
 case 'carpet': return /* glsl */`
  float pile=alphaNoise(vAlphaWorld.xz*0.6);
  float tufts=alphaNoise(vAlphaWorld.xz*22.0);
  float weaveFootprint=max(length(dFdx(vMapUv)),length(dFdy(vMapUv)))*1024.0;
  float weaveDetail=1.0-smoothstep(0.75,2.5,weaveFootprint);
  diffuseColor.rgb=mix(diffuse*0.75,mix(diffuseColor.rgb*2.0,diffuse,0.26),weaveDetail)*(0.83+pile*0.25)*(0.91+tufts*0.18);
  float alphaWear=0.08;
 `;
 case 'office_fabric':return 'float weaveAA=1.0-smoothstep(0.7,2.5,max(length(dFdx(vMapUv)),length(dFdy(vMapUv)))*1024.0);diffuseColor.rgb=mix(diffuse*0.90,mix(diffuseColor.rgb*2.0,diffuse,0.72),weaveAA)*(0.94+alphaNoise(vAlphaPlane*24.0)*0.09);float alphaWear=0.04;';
 case 'laminate':return 'diffuseColor.rgb=mix(diffuseColor.rgb*3.0,diffuse,0.83);float alphaWear=alphaNoise(vAlphaPlane*5.0)*0.04;';
 case 'cabinet_metal':return 'diffuseColor.rgb=mix(diffuseColor.rgb*1.4,diffuse,0.85)*(0.94+alphaNoise(vAlphaPlane*7.0)*0.09);float alphaWear=alphaScuff(vAlphaPlane)*0.09;';
 case 'wood':return 'diffuseColor.rgb=mix(diffuseColor.rgb*4.0,diffuse,0.35);float alphaWear=0.0;';
 case 'terrazzo':return 'diffuseColor.rgb=mix(diffuseColor.rgb,diffuse,0.72);float alphaWear=0.0;';
 case 'steel':return 'diffuseColor.rgb=mix(diffuseColor.rgb,diffuse,0.55);float alphaWear=0.0;';
 default:return 'float alphaWear=0.0;';
 }
}

export function alphaTextureScale(surface:AlphaSurface){
 if(surface==='aquila_concrete')return .42
 if(surface==='cave_rock')return .32
 if(surface==='substrate')return 3
 return surface==='office_fabric'?3:surface==='wood'?.65:surface==='fabric'||surface==='carpet'?2:surface==='terrazzo'||surface==='linoleum'?3:surface==='terrazzo_floor'?1.25:surface==='vinyl'?1.1:surface==='ceiling'?1.6:.5
}
export function alphaNormalScale(surface:AlphaSurface){
 if(surface==='aquila_concrete')return .5
 if(surface==='cave_rock')return .85
 if(surface==='substrate')return .65
 return surface==='packing_tape'?.025:surface==='cardboard'?.10:surface==='perforated_metal'?.035:surface==='office_fabric'?.04:surface==='laminate'?.035:surface==='cabinet_metal'?.07:surface==='plaster'?.2:surface==='ceiling'?.24:surface==='soffit'?.16:surface==='vinyl'||surface==='linoleum'?.065:surface==='terrazzo_floor'||surface==='tile'?.12:.18
}

export function applyAlphaSurface(mat:THREE.Material,surface:AlphaSurface){
 const roughness=surface==='packing_tape'?.18:surface==='perforated_metal'?.42:surface==='admin_stone'?.48:surface==='laminate'?.48:surface==='cabinet_metal'?.5:surface==='steel'?.32:surface==='wood'?.42:surface==='vinyl'||surface==='linoleum'?.54:surface==='terrazzo_floor'?.62:surface==='tile'?.7:surface==='terrazzo'?.78:.86
 mat.onBeforeCompile=shader=>{
  shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 vAlphaWorld;\nvarying vec2 vAlphaPlane;')
  shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\n'+detailFunctions)
  shader.vertexShader=shader.vertexShader.replace('#include <uv_vertex>',/* glsl */`#include <uv_vertex>
   vec4 ap=vec4(position,1.0);
   #ifdef USE_INSTANCING
   ap=instanceMatrix*ap;
   #endif
   vec3 aw=(modelMatrix*ap).xyz;
   vec2 plane=abs(normal.y)>0.5?aw.xz:vec2(aw.x+aw.z,aw.y);
   vAlphaWorld=aw;vAlphaPlane=plane;
   vec2 auv=${surface==='wood'?'plane.yx':'plane'}*${alphaTextureScale(surface).toFixed(3)};
   #ifdef USE_MAP
   vMapUv=auv;
   #endif
   #ifdef USE_NORMALMAP
   vNormalMapUv=auv;
   #endif
   #ifdef USE_ROUGHNESSMAP
   vRoughnessMapUv=auv;
   #endif`)
  shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>','#include <map_fragment>\n'+finish(surface))
  shader.fragmentShader=shader.fragmentShader.replace('#include <roughnessmap_fragment>',`#include <roughnessmap_fragment>\nroughnessFactor=clamp(max(roughnessFactor,${roughness.toFixed(3)})+alphaWear,0.0,1.0);`)
 }
 mat.customProgramCacheKey=()=> 'alpha-surfaces-v4-'+surface
}
