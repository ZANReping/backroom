import * as THREE from 'three'
import {configureSurfaceTexture,litMaterial,levelTexture,noiseTexture,getMaterialMode} from './shared'
export type L2Surface='wall'|'floor'|'ceiling'|'insulation'|'steel'|'rust'|'brick'|'black'|'red'|'wet'
const materials=new Map<string,THREE.MeshLambertMaterial|THREE.MeshStandardMaterial>()
function source(variant:string,surface:L2Surface):string {
 if(surface==='rust')return 'Rust004'
 if(surface==='brick')return 'Bricks006'
 if(['steel','black','red'].includes(surface))return 'Metal012'
 if(surface==='insulation'||surface==='wall'&&(variant==='tidy'||variant==='narrow'))return 'Plaster001'
 if(surface==='floor')return variant==='dirty'?'Concrete023':'Concrete030'
 return variant==='dim'?'Concrete030':'Concrete012'
}
export function l2Texture(variant:string,surface:L2Surface,map='Color'):THREE.Texture {
 const data=map!=='Color',asset=source(variant,surface)
 const t=levelTexture(`l2/${asset}_${map}.jpg`,()=>noiseTexture(data?'#8080ff':'#aaaa9e',data?'#8080ff':'#a09e90'))
 configureSurfaceTexture(t,data?THREE.NoColorSpace:THREE.SRGBColorSpace)
 return t
}
export function l2Material(variant:string,surface:L2Surface) {
 const key=`${getMaterialMode()}:${variant}:${surface}`,cached=materials.get(key);if(cached)return cached
 const color=surface==='wall'?(variant==='dirty'?'#c7b997':variant==='warped'?'#a1a18e':variant==='dim'?'#aab1ab':'#d1d3c6')
 :surface==='floor'?(variant==='dirty'?'#8f7756':variant==='dim'?'#737d79':'#a39d81')
 :surface==='ceiling'?(variant==='dirty'?'#74674d':'#919589')
 :surface==='rust'?'#ffffff':surface==='insulation'?'#d8d8c4':surface==='steel'?'#a6b0ad':surface==='red'?'#9e3023':surface==='wet'?'#252c27':surface==='brick'?'#a1a18e':'#2c322e'
 const strength=surface==='insulation'?.075:surface==='wall'&&variant==='tidy'?.16:surface==='rust'?.85:.48
 const mat=litMaterial({map:l2Texture(variant,surface),color,normalMap:l2Texture(variant,surface,'NormalGL'),normalScale:new THREE.Vector2(strength,strength),roughnessMap:getMaterialMode()==='realistic'?l2Texture(variant,surface,'Roughness'):undefined,roughness:surface==='wet'?.15:surface==='steel'?.48:.92,metalness:surface==='steel'?.55:surface==='rust'?.12:0,envBase:surface==='wet'?.3:.1})
 if((surface==='wall'||surface==='ceiling')&&(variant==='dirty'||variant==='warped')) {
  mat.onBeforeCompile=shader=>{
   shader.uniforms.l2Damage={value:l2Texture('dirty','rust')}
   shader.uniforms.l2Plaster={value:l2Texture('dirty','wall')}
   shader.fragmentShader='uniform sampler2D l2Damage;\nuniform sampler2D l2Plaster;\n'+shader.fragmentShader
   shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`#include <map_fragment>
    float scar = smoothstep(0.035,0.19,texture2D(l2Damage,vMapUv*0.73).r);
    diffuseColor.rgb *= mix(vec3(0.44,0.43,0.39),vec3(1.0),scar);`)
  }
  mat.customProgramCacheKey=()=>`l2-${variant}-mineral-coating`
 }
 if(surface==='rust'||surface==='brick') {
  mat.onBeforeCompile=shader=>{shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`#include <map_fragment>
   float oxideLuma=dot(diffuseColor.rgb,vec3(0.299,0.587,0.114));
   diffuseColor.rgb=mix(diffuseColor.rgb,vec3(oxideLuma)*${surface==='rust'?'vec3(2.3,1.3,0.46)':'vec3(1.06,1.02,0.9)'},0.72);`)}
  mat.customProgramCacheKey=()=>`l2-${surface}-reference-grade`
 }
 materials.set(key,mat);return mat
}
export function disposeL2Owned(obj:THREE.Object3D){
 const mesh=obj as THREE.Mesh;if(!mesh.material)return
 for(const mat of Array.isArray(mesh.material)?mesh.material:[mesh.material])if(mat.userData.l2Owned&&!mat.userData.l2Disposed){mat.dispose();mat.userData.l2Disposed=true}
}
export function l2WorldUV(geo:THREE.BufferGeometry,ox:number,oz:number,scale=.5) {
 const p=geo.getAttribute('position'),n=geo.getAttribute('normal'),uv=geo.getAttribute('uv') as THREE.BufferAttribute
 for(let i=0;i<p.count;i++) {
  const flat=Math.abs(n.getY(i))>.6
  uv.setXY(i,(flat?p.getX(i)+ox:p.getX(i)+ox+p.getZ(i)+oz)*scale,(flat?p.getZ(i)+oz:p.getY(i))*scale)
 }
}
