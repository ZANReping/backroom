import * as THREE from 'three'
import { getMaterialMode, litMaterial, noiseTexture, levelTexture } from './shared'
import { l1Profile } from '../world/l1Architecture'
import {l1PathPlasterAt} from '../world/l1Spatial'
import {installL1SurfaceField} from './l1SurfaceField'
import {installL1Lighting} from './l1Lighting'
import {installL1VaultMaterial} from './l1VaultMaterial'
import {l1BakedPointLights} from './l1BakedShader'
import {l0StaticPointMask} from './l0PointMask'
const cache=new Map<string,THREE.Material>()
/** Repeats per metre. Colour, GL normal and roughness always use the same UV. */
export function l1SurfaceScale(variant:string,surface:'floor'|'wall'|'ceiling'|'concrete'){
  if(variant==='maintenance'&&surface==='wall')return .18
  return surface==='floor'?.22:surface==='ceiling'?.24:.32
}
export function l1Texture(name:string,data=false):THREE.Texture {
  const t=levelTexture(name,()=>noiseTexture(data?'#8080ff':'#98998d',data?'#8080ff':'#7d7c71'))
  const mark=data?'data':'color'
  if(t.userData.l1Space!==mark){t.colorSpace=data?THREE.NoColorSpace:THREE.SRGBColorSpace;t.anisotropy=4;t.userData.l1Space=mark;t.needsUpdate=true}
  return t
}
export function l1Material(variant:string,surface:'wall'|'brick'|'floor'|'ceiling'|'concrete'|'column'|'columnRaw'|'columnPaint'|'guard'|'metal'|'red'|'whitePipe'|'cable'|'peeling'|'leaf'|'ground'|'wet'|'line'):THREE.Material {
  const key=`${getMaterialMode()}:${variant}:${surface}`,hit=cache.get(key);if(hit)return hit
  const p=l1Profile(variant==='maintenance-plaster'?'maintenance':variant)
  let prefix='l11_concrete',color=surface==='wall'?p.wall:surface==='floor'?p.floor:surface==='ceiling'?p.ceiling:'#c4c2b4'
  if(surface==='wall'&&variant==='storage')prefix='l11_plaster'
  if(variant==='maintenance-plaster'){prefix='l11_plaster';color='#b9cede'}
  if(surface==='metal'){prefix='l11_metal';color='#a6aaa7'}
  if(surface==='column')color=p.wall
  if(variant==='gothic'&&(surface==='column'||surface==='ceiling'))color='#aaa9a0'
  if(surface==='columnRaw')color=variant==='ouroboros'?'#888b89':'#a7a69e'
  if(surface==='columnPaint'){prefix='l11_plaster';color='#d8d9d2'}
  if(surface==='guard'){prefix='l11_metal';color='#a59664'}
  if(variant==='storage'&&(surface==='ceiling'||surface==='metal')){prefix=surface==='ceiling'?'l1/steel':'l11_metal';color=surface==='ceiling'?'#9b9e96':'#b0aca1'}
  if(variant==='storage'&&surface==='concrete'){prefix='l11_plaster';color='#e3e3d8'}
  if(surface==='red'){prefix='l11_metal';color='#9f342b'}
  if(surface==='whitePipe'){prefix='l11_metal';color='#d4d5cc'}
  if(surface==='cable'){prefix='l11_metal';color='#343733'}
  const continuous=surface==='floor'||surface==='ceiling'||surface==='wall'&&!variant.startsWith('maintenance')
  const peeling=surface==='peeling'
  const ground=surface==='ground'
  const foliage=surface==='leaf'
  const custom=peeling?'peeling':ground?'ground':undefined
  if(custom||foliage)color='#ffffff'
  if(foliage)color='#506d38'
  if(ground)color='#56743f'
  const masonry=variant==='maintenance'&&surface==='wall'||surface==='brick'
  if(surface==='brick')color='#c3c4bc'
  const wornFloor=surface==='floor'&&!ground
  const plasterCeiling=surface==='ceiling'&&['parking','maintenance','aisle'].includes(variant)
  if(plasterCeiling)prefix='l11_plaster'
  if(surface==='ceiling'&&variant==='parking')color='#7f837d'
  // The reference paint is smooth, with faint mottling rather than exposed render.
  const plaster=prefix==='l11_plaster'
  const map=l1Texture(foliage?'l1/polyhaven/leaves_diff.jpg':wornFloor?'l3/polyhaven/concrete_floor_worn_001_Color.jpg':masonry?'l3/polyhaven/painted_brick_Color.jpg':custom?`l1/${custom}.png`:`${prefix}.jpg`)
  const mat=litMaterial({map,color,side:foliage?THREE.DoubleSide:THREE.FrontSide,
    ...(foliage?{alphaTest:.45,alphaMap:l1Texture('l1/polyhaven/leaves_alpha.jpg',true),normalMap:l1Texture('l1/polyhaven/leaves_nor_gl.jpg',true),normalScale:new THREE.Vector2(.4,.4),roughnessMap:getMaterialMode()==='realistic'?l1Texture('l1/polyhaven/leaves_rough.jpg',true):undefined}:{normalMap:l1Texture(wornFloor?'l3/polyhaven/concrete_floor_worn_001_NormalGL.jpg':masonry?'l3/polyhaven/painted_brick_NormalGL.jpg':custom?`l1/${custom}-normal.png`:`${prefix}_normal.jpg`,true),normalScale:new THREE.Vector2(masonry?.1:plaster?.045:surface==='floor'?.14:.24,masonry?.1:plaster?.045:surface==='floor'?.14:.24),roughnessMap:getMaterialMode()==='realistic'?l1Texture(wornFloor?'l3/polyhaven/concrete_floor_worn_001_Roughness.jpg':masonry?'l3/polyhaven/painted_brick_Roughness.jpg':custom?`l1/${custom}-rough.png`:`${prefix}_roughness.jpg`,true):undefined}),
    roughness:surface==='wet'?.12:surface==='metal'?.48:.86,metalness:surface==='metal'||surface==='red'?(variant==='storage'?.18:.55):0,envBase:surface==='wet'?.7:.12,
  })
  if(plaster){
    const prior=mat.onBeforeCompile,key=mat.customProgramCacheKey()
    mat.onBeforeCompile=(shader,renderer)=>{prior.call(mat,shader,renderer);shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>','#include <map_fragment>\nfloat paintL=dot(sampledDiffuseColor.rgb,vec3(.2126,.7152,.0722));diffuseColor.rgb=diffuse*mix(.66,.82,smoothstep(.025,.65,paintL));')}
    mat.customProgramCacheKey=()=>key+'|l1-smooth-painted-plaster-v3'
  }
  if(masonry){
    const prior=mat.onBeforeCompile,key=mat.customProgramCacheKey()
    mat.onBeforeCompile=(shader,renderer)=>{prior.call(mat,shader,renderer);shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>','#include <map_fragment>\nfloat plasterL=dot(sampledDiffuseColor.rgb,vec3(.2126,.7152,.0722));diffuseColor.rgb=diffuse*mix(.58,.89,smoothstep(.015,.58,plasterL));')}
    mat.customProgramCacheKey=()=>key+'|l1-white-painted-brick-v2'
  }
  if(wornFloor){
    const prior=mat.onBeforeCompile,key=mat.customProgramCacheKey()
    mat.onBeforeCompile=(shader,renderer)=>{prior.call(mat,shader,renderer);shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>','#include <map_fragment>\ndiffuseColor.rgb=diffuse*clamp(sampledDiffuseColor.rgb*1.65,vec3(.04),vec3(.82));')}
    mat.customProgramCacheKey=()=>key+'|l1-worn-floor'
  }
  if(variant==='storage'&&['ceiling','metal','whitePipe'].includes(surface)){
    const prior=mat.onBeforeCompile,key=mat.customProgramCacheKey()
    mat.onBeforeCompile=(shader,renderer)=>{prior.call(mat,shader,renderer);shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>','#include <map_fragment>\nfloat steelPaintL=dot(sampledDiffuseColor.rgb,vec3(.2126,.7152,.0722));diffuseColor.rgb=diffuse*mix(.42,.72,smoothstep(.02,.7,steelPaintL));')}
    mat.customProgramCacheKey=()=>key+'|l1-painted-steel-v1'
  }
  if(surface==='column'||surface==='columnRaw'){
    const prior=mat.onBeforeCompile,key=mat.customProgramCacheKey()
    mat.onBeforeCompile=(shader,renderer)=>{prior.call(mat,shader,renderer);shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`#include <map_fragment>
      float footHeight=vMapUv.y/.32;
      float stainNoise=dot(sampledDiffuseColor.rgb,vec3(.2126,.7152,.0722));
      float stainTop=.20+.27*smoothstep(.04,.4,stainNoise);
      float footStain=(1.-smoothstep(stainTop,stainTop+.32,footHeight))*(.08+.13*smoothstep(.02,.32,stainNoise));
      diffuseColor.rgb*=1.-footStain;`)}
    mat.customProgramCacheKey=()=>key+'|l1-column-footwear-v3'
  }
  if(mat instanceof THREE.MeshStandardMaterial&&!['wet','metal','red','cable','whitePipe'].includes(surface)){
    const prior=mat.onBeforeCompile,key=mat.customProgramCacheKey.bind(mat)
    mat.onBeforeCompile=(shader,renderer)=>{prior.call(mat,shader,renderer);shader.fragmentShader=shader.fragmentShader.replace('#include <roughnessmap_fragment>',`#include <roughnessmap_fragment>\nroughnessFactor=max(roughnessFactor,${plaster?'.52':surface==='floor'?'.55':'.72'});`)}
    const priorKey=key();mat.customProgramCacheKey=()=>priorKey+'|l1-matte-concrete-v2'
  }
  if(surface==='wet'){
    mat.transparent=true;mat.opacity=.38;mat.depthWrite=false
    if(mat instanceof THREE.MeshStandardMaterial){mat.roughnessMap=null;mat.color.set('#515953')}
    const prior=mat.onBeforeCompile,key=mat.customProgramCacheKey()
    mat.onBeforeCompile=(shader,renderer)=>{
      prior.call(mat,shader,renderer)
      // The floor below already receives baked native light and the reflector
      // images the actual tubes. Native point-light specular here creates a
      // second, round highlight unrelated to their long shape. Portable lights
      // remain live, including the flashlight and thrown glowsticks.
      shader.uniforms.l1BakedMask=l0StaticPointMask
      shader.fragmentShader='uniform float l1BakedMask[128];\n'+shader.fragmentShader
      shader.fragmentShader=shader.fragmentShader.replace('#include <lights_fragment_begin>',l1BakedPointLights(THREE.ShaderChunk.lights_fragment_begin))
      shader.vertexShader='attribute float l1WetEdge;varying float vL1WetEdge;\n'+shader.vertexShader
      shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvL1WetEdge=l1WetEdge;')
      shader.fragmentShader='varying float vL1WetEdge;\n'+shader.fragmentShader
      shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>','#include <map_fragment>\ndiffuseColor.a*=smoothstep(0.,.8,vL1WetEdge);')
    }
    mat.customProgramCacheKey=()=>key+'|l1-wet-edge-reflected-native'
  }
  if(surface==='line'){
    // Worn parking paint inherits the existing floor scan instead of a uniformly
    // bright strip. World UVs keep the wear continuous across streaming edges.
    mat.map=l1Texture('l3/polyhaven/concrete_floor_worn_001_Color.jpg');mat.color.set('#b9b39a')
    const prior=mat.onBeforeCompile,key=mat.customProgramCacheKey()
    mat.onBeforeCompile=(shader,renderer)=>{prior.call(mat,shader,renderer);shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>','#include <map_fragment>\nfloat stripeWear=dot(sampledDiffuseColor.rgb,vec3(.2126,.7152,.0722));diffuseColor.rgb=diffuse*mix(.3,.8,smoothstep(.025,.45,stripeWear));')}
    mat.customProgramCacheKey=()=>key+'|l1-worn-parking-paint-v1'
  }
  if(continuous)installL1SurfaceField(mat,surface as 'floor'|'wall'|'ceiling',{ground:l1Texture('l1/ground.png'),peeling:l1Texture('l1/peeling.png'),groundNormal:l1Texture('l1/ground-normal.png',true),peelingNormal:l1Texture('l1/peeling-normal.png',true)})
  if(variant==='gothic'&&(surface==='column'||surface==='ceiling'))installL1VaultMaterial(mat)
  installL1Lighting(mat)
  mat.name=`l1-${variant}-${surface}`;mat.userData.l1Shared=true;cache.set(key,mat);return mat
}
export function l1WorldUV(geo:THREE.BufferGeometry,ox=0,oz=0,scale=.32) {
  const p=geo.getAttribute('position'),n=geo.getAttribute('normal'),uv=geo.getAttribute('uv')
  if(!uv)return
  for(let i=0;i<p.count;i++){
    const top=Math.abs(n.getY(i))>.55,xFace=Math.abs(n.getX(i))>Math.abs(n.getZ(i))
    // Dominant-axis projection: moving along a wall never samples a diagonal of the scan.
    uv.setXY(i,(top?p.getX(i)+ox:xFace?p.getZ(i)+oz:p.getX(i)+ox)*scale,(top?p.getZ(i)+oz:p.getY(i))*scale)
  }
}

/** A tile wall is a full box: classify its faces, not its solid-centre position. */
export function l1PathWallFaces(geo:THREE.BufferGeometry,seed:number,ox:number,oz:number){
  const p=geo.getAttribute('position'),n=geo.getAttribute('normal'),index=geo.index
  const groups=[{p:[] as number[],n:[] as number[]},{p:[] as number[],n:[] as number[]}]
  for(let i=0;i<(index?.count??p.count);i+=3){
    const ids=[0,1,2].map(k=>index?index.getX(i+k):i+k)
    const x=ids.reduce((a,j)=>a+p.getX(j)+n.getX(j)*.01,0)/3+ox,z=ids.reduce((a,j)=>a+p.getZ(j)+n.getZ(j)*.01,0)/3+oz
    const a=groups[l1PathPlasterAt(seed,x,z)?1:0]
    for(const j of ids){a.p.push(p.getX(j),p.getY(j),p.getZ(j));a.n.push(n.getX(j),n.getY(j),n.getZ(j))}
  }
  return groups.map((a,i)=>{
    if(!a.p.length)return null
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(a.p,3));g.setAttribute('normal',new THREE.Float32BufferAttribute(a.n,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(new Float32Array(a.p.length/3*2),2));g.setIndex(Array.from({length:a.p.length/3},(_,i)=>i))
    l1WorldUV(g,ox,oz,i?.32:.18);return g
  })
}
export function disposeL1Owned(o:THREE.Object3D){
  const mesh=o as THREE.Mesh;if(!mesh.material)return
  for(const mat of Array.isArray(mesh.material)?mesh.material:[mesh.material]){
    if(mat.userData.l1Owned&&!mat.userData.l1Disposed){if(mat.userData.settlementLabelTexture)(mat as THREE.MeshBasicMaterial).map?.dispose();mat.dispose();mat.userData.l1Disposed=true}
  }
}
export function disposeL1Materials(){for(const mat of cache.values())mat.dispose();cache.clear()}

