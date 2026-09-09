import * as THREE from 'three'
import { getMaterialMode, litMaterial, noiseTexture, levelTexture } from './shared'
import { l1Profile } from '../world/l1Architecture'
const cache=new Map<string,THREE.Material>()
export function l1Texture(name:string,data=false):THREE.Texture {
  const t=levelTexture(name,()=>noiseTexture(data?'#8080ff':'#98998d',data?'#8080ff':'#7d7c71'))
  const mark=data?'data':'color'
  if(t.userData.l1Space!==mark){t.colorSpace=data?THREE.NoColorSpace:THREE.SRGBColorSpace;t.anisotropy=4;t.userData.l1Space=mark;t.needsUpdate=true}
  return t
}
export function l1Material(variant:string,surface:'wall'|'floor'|'ceiling'|'concrete'|'metal'|'red'|'cable'|'peeling'|'leaf'|'ground'|'wet'|'line'):THREE.Material {
  const key=`${getMaterialMode()}:${variant}:${surface}`,hit=cache.get(key);if(hit)return hit
  const p=l1Profile(variant)
  let prefix='l11_concrete',color=surface==='wall'?p.wall:surface==='floor'?p.floor:surface==='ceiling'?p.ceiling:'#c4c2b4'
  if(surface==='wall'&&variant==='storage')prefix='l11_plaster'
  if(surface==='metal'){prefix='l11_metal';color='#a6aaa7'}
  if(surface==='red'){prefix='l11_metal';color='#9f342b'}
  if(surface==='cable'){prefix='l11_metal';color='#343733'}
  const peeling=surface==='peeling'||(surface==='wall'&&variant==='ouroboros')
  const ground=surface==='ground'||(surface==='floor'&&variant==='garden')
  const foliage=surface==='leaf'
  const custom=peeling?'peeling':ground?'ground':undefined
  if(custom||foliage)color='#ffffff'
  const map=l1Texture(foliage?'l1/ivy.png':custom?`l1/${custom}.png`:`${prefix}.jpg`)
  const mat=litMaterial({map,color,side:foliage?THREE.DoubleSide:THREE.FrontSide,
    ...(foliage?{alphaTest:.4}:{normalMap:l1Texture(custom?`l1/${custom}-normal.png`:`${prefix}_normal.jpg`,true),normalScale:new THREE.Vector2(.38,.38),roughnessMap:l1Texture(custom?`l1/${custom}-rough.png`:`${prefix}_roughness.jpg`,true)}),
    roughness:surface==='wet'?.12:surface==='metal'?.48:.86,metalness:surface==='metal'||surface==='red'?.55:0,envBase:surface==='wet'?.7:.12,
  })
  if(mat instanceof THREE.MeshStandardMaterial&&!['wet','metal','red','cable'].includes(surface)){
    mat.onBeforeCompile=shader=>{shader.fragmentShader=shader.fragmentShader.replace('#include <roughnessmap_fragment>','#include <roughnessmap_fragment>\nroughnessFactor=max(roughnessFactor,0.72);')}
    mat.customProgramCacheKey=()=> 'l1-matte-concrete'
  }
  if(surface==='wet'){
    mat.transparent=true;mat.opacity=.64;mat.depthWrite=false
    if(mat instanceof THREE.MeshStandardMaterial){mat.roughnessMap=null;mat.color.set('#515953')}
  }
  if(surface==='line'){mat.map=null;mat.color.set('#b9b39a')}
  mat.name=`l1-${variant}-${surface}`;mat.userData.l1Shared=true;cache.set(key,mat);return mat
}
export function l1WorldUV(geo:THREE.BufferGeometry,ox=0,oz=0,scale=.32) {
  const p=geo.getAttribute('position'),n=geo.getAttribute('normal'),uv=geo.getAttribute('uv')
  if(!uv)return
  for(let i=0;i<p.count;i++){const top=Math.abs(n.getY(i))>.55;uv.setXY(i,(p.getX(i)+ox+(top?0:p.getZ(i)+oz))*scale,(top?p.getZ(i)+oz:p.getY(i))*scale)}
}

export function disposeL1Owned(o:THREE.Object3D){
  const mesh=o as THREE.Mesh;if(!mesh.material)return
  for(const mat of Array.isArray(mesh.material)?mesh.material:[mesh.material]){
    if(mat.userData.l1Owned&&!mat.userData.l1Disposed){if(mat.userData.settlementLabelTexture)(mat as THREE.MeshBasicMaterial).map?.dispose();mat.dispose();mat.userData.l1Disposed=true}
  }
}
export function disposeL1Materials(){for(const mat of cache.values())mat.dispose();cache.clear()}

