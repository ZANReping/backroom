import * as THREE from 'three'
import { configureSurfaceTexture, getMaterialMode, levelTexture, litMaterial, noiseTexture } from './shared'
import { l2WorldUV, l2Texture } from './l2Materials'
export type L3Surface='brick'|'wall'|'floor'|'ceiling'|'paint'|'blackpaint'|'iron'|'black'|'bronze'|'marble'|'green'
const cache=new Map<string,THREE.MeshLambertMaterial|THREE.MeshStandardMaterial>()
export const l3WorldUV=l2WorldUV
export function l3Material(v:string,s:L3Surface) {
  const key=`${getMaterialMode()}:${v}:${s}`;const old=cache.get(key);if(old)return old
  const brick=s==='brick'||s==='wall'&&v!=='assembly'
  const painted=s==='wall'&&v==='assembly'
  const asset=brick?'factory_brick':painted?'painted_brick':s==='floor'?(v==='lit'?'terrazzo_tiles':'concrete_floor_worn_001'):s==='wall'||s==='ceiling'?'Concrete012':s==='paint'||s==='marble'?'Plaster001':'Metal012'
  const folder=['factory_brick','painted_brick','concrete_floor_worn_001','terrazzo_tiles'].includes(asset)?'l3/polyhaven':'l2'
  const tex=(map:string)=>{
    const t=levelTexture(`${folder}/${asset}_${map}.jpg`,()=>noiseTexture(map==='NormalGL'?'#8080ff':'#aaa79c',map==='NormalGL'?'#8080ff':'#938f83'))
    configureSurfaceTexture(t,map==='Color'?THREE.SRGBColorSpace:THREE.NoColorSpace);return t
  }
  const color=brick?(v==='lit'?'#ffd1a3':v==='sanct'?'#c9b68b':v==='boiler'?'#96958a':'#bba888'):s==='ceiling'?(v==='assembly'?'#ebe9de':v==='boiler'?'#73746d':'#cbc9bd'):s==='wall'?'#f3eddf':s==='floor'?(v==='assembly'?'#d2c9b8':v==='lit'?'#c1bbae':'#b1a99a'):s==='marble'?'#d3cbb6':s==='paint'?'#c8c9c0':s==='blackpaint'?'#202326':s==='bronze'?(v==='sanct'?'#514936':'#947342'):s==='green'?'#57624c':s==='black'?'#24221d':'#b2b2a4'
  const metal=['iron','bronze','green','blackpaint'].includes(s)
  const m=litMaterial({color,map:tex('Color'),normalMap:tex('NormalGL'),normalScale:new THREE.Vector2(brick?.28:.18,brick?.28:.18),...(folder==='l3/polyhaven'?{roughnessMap:getMaterialMode()==='realistic'?tex('Roughness'):undefined}:{}),roughness:s==='blackpaint'?.55:metal?.68:.97,metalness:s==='blackpaint'?.65:metal?.45:0,envBase:metal?.12:.025,side:THREE.DoubleSide})
  if(brick){
    // Mineral mortar is neutral; increase terracotta only where the source is red.
    m.onBeforeCompile=shader=>{shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`#include <map_fragment>
      float clay = smoothstep(0.018,0.10,texture2D(map,vMapUv).r-texture2D(map,vMapUv).b);
      diffuseColor.rgb *= mix(vec3(0.85,0.87,0.84),vec3(1.15,0.90,0.72),clay*0.60);
      ${v==='boiler'?'diffuseColor.rgb=mix(diffuseColor.rgb,vec3(dot(diffuseColor.rgb,vec3(.299,.587,.114)))*vec3(1.08,1.04,.94),.86)*1.35; diffuseColor.rgb*=mix(0.34,1.0,smoothstep(0.05,1.25,vMapUv.y));':''}`)}
    m.customProgramCacheKey=()=>`l3-fired-brick-${v}`
  }
  if(painted){
    m.onBeforeCompile=shader=>{shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`#include <map_fragment>
      vec3 sourcePaint=texture2D(map,vMapUv).rgb;
      float mineral=pow(dot(sourcePaint,vec3(.21,.55,.24)),.67);
      diffuseColor.rgb=vec3(min(1.0,mineral*1.65))*vec3(.96,.945,.89)*diffuse;`)}
    m.customProgramCacheKey=()=> 'l3-whitewashed-factory-brick'
  }
  if(s==='floor'&&v==='lit'){
    m.onBeforeCompile=shader=>{shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`#include <map_fragment>
      float neutralStone=dot(diffuseColor.rgb,vec3(.299,.587,.114));
      diffuseColor.rgb=mix(diffuseColor.rgb,vec3(neutralStone)*vec3(1.05,1.02,.96),.72);`)}
    m.customProgramCacheKey=()=> 'l3-fine-aggregate-floor'
  }
  if(s==='floor'&&v==='assembly'){
    m.onBeforeCompile=shader=>{shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`#include <map_fragment>
      diffuseColor.rgb=min(vec3(.78),diffuseColor.rgb*2.1);`)}
    m.customProgramCacheKey=()=> 'l3-factory-pale-concrete-floor'
  }
  if(s==='blackpaint'){
    m.onBeforeCompile=shader=>{
      shader.uniforms.l3Weather={value:l2Texture('dirty','rust')}
      shader.fragmentShader='uniform sampler2D l3Weather;\n'+shader.fragmentShader
      shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`#include <map_fragment>
        float worn=smoothstep(0.08,0.30,texture2D(l3Weather,vMapUv*0.72).r);
        diffuseColor.rgb*=mix(vec3(.72,.75,.78),vec3(1.0),worn*.24);`)
    }
    m.customProgramCacheKey=()=> 'l3-black-painted-fence'
  }
  if(s==='bronze'||s==='paint'){
    m.onBeforeCompile=shader=>{
      shader.uniforms.l3Weather={value:l2Texture('dirty','rust')}
      shader.fragmentShader='uniform sampler2D l3Weather;\n'+shader.fragmentShader
      shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`#include <map_fragment>
        float worn=smoothstep(0.025,0.17,texture2D(l3Weather,vMapUv*0.81).r);
        diffuseColor.rgb*=mix(vec3(${s==='bronze'?'0.35,0.40,0.32':'0.65,0.61,0.54'}),vec3(1.0),worn);`)
    }
    m.customProgramCacheKey=()=>`l3-weathered-${s}`
  }
  cache.set(key,m);return m
}
