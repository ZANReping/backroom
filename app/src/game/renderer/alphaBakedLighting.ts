import * as THREE from 'three'
import { ALPHA_BAKE_VERSION } from '../content/alphaBakeLayout'
import { l0StaticPointMask } from './l0PointMask'
import { l1BakedPointLights } from './l1BakedShader'

interface BakeManifest { version:number; fingerprint:string; width:number; height:number; parts:number }
interface BakeFiles { manifest:BakeManifest; rects:Uint16Array; image:ImageBitmap }
let pending:Promise<BakeFiles|null>|undefined, owners=0
export const alphaBakedActive=()=>owners>0
export const alphaBakeOverride={value:0}
/** One CPU asset cache; each world owns its GPU texture, released with its materials. */
export function requestAlphaBake(){
  return pending??=loadAlphaBake().catch(error=>{console.warn('Alpha uses its live-light fallback:',error);return null})
}
async function loadAlphaBake():Promise<BakeFiles>{
  const base=import.meta.env.BASE_URL+'assets/alpha-bake/'
  const response=await fetch(base+'manifest.json',{cache:'no-cache'})
  if(!response.ok)throw Error('Alpha bake manifest')
  const manifest=await response.json() as BakeManifest
  if(manifest.version!==ALPHA_BAKE_VERSION||!/^[a-f0-9]{8}$/.test(manifest.fingerprint))throw Error('Invalid Alpha bake version')
  // Deployments can cache static images much longer than the manifest. A bake
  // revision must fetch the matching image/coordinates, even at unchanged sizes.
  const url=(name:string)=>base+name+'?v='+manifest.fingerprint
  const [coordinates,bitmap]=await Promise.allSettled([
    fetch(url('rects.bin.gz')).then(async r=>{
      if(!r.ok)throw Error('Alpha bake coordinates')
      const raw=await r.arrayBuffer(),bytes=new Uint8Array(raw)
      // Hosts may already decode .gz responses through Content-Encoding.
      return new Uint16Array(bytes[0]===31&&bytes[1]===139?await new Response(new Blob([raw]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer():raw)
    }),
    fetch(url('irradiance.png')).then(async r=>{if(!r.ok)throw Error('Alpha irradiance');return createImageBitmap(await r.blob(),{imageOrientation:'flipY',premultiplyAlpha:'none',colorSpaceConversion:'none'})}),
  ])
    if(coordinates.status==='rejected'||bitmap.status==='rejected'){
      if(bitmap.status==='fulfilled')bitmap.value.close()
      throw Error('Alpha bake asset download failed')
    }
    const rects=coordinates.value,image=bitmap.value
    if(manifest.version!==ALPHA_BAKE_VERSION||rects.length!==manifest.parts*24||image.width!==manifest.width||image.height!==manifest.height){image.close();throw Error('Invalid Alpha bake assets')}
    return {manifest,rects,image}
}
const names=['alphaLmPX','alphaLmNX','alphaLmPY','alphaLmNY','alphaLmPZ','alphaLmNZ']
const points=l1BakedPointLights(THREE.ShaderChunk.lights_fragment_begin)
// Liquid keeps the existing lamps' moving view-dependent highlight, while its
// diffuse contribution still comes from the bake. No extra lamps/shadow maps.
const native=THREE.ShaderChunk.lights_fragment_begin,ps=native.indexOf('#if ( NUM_POINT_LIGHTS > 0 )'),pe=native.indexOf('#if ( NUM_SPOT_LIGHTS > 0 )')
const direct='RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );'
const liquidPoints=native.slice(0,ps)+native.slice(ps,pe).replace(direct,`{ vec3 alphaDiffuseBefore=reflectedLight.directDiffuse;
 ${direct}
 if(l1BakedMask[i]>.5)reflectedLight.directDiffuse=alphaDiffuseBefore; }`)+native.slice(pe)
export function alphaBakeTexture(files:BakeFiles){
  const texture=new THREE.Texture(files.image);texture.colorSpace=THREE.NoColorSpace
  // Charts have their own gutters; mipmaps would eventually mix unrelated rooms.
  // Low-frequency irradiance uses bilinear sampling. Albedo/normal retain mipmaps.
  texture.minFilter=texture.magFilter=THREE.LinearFilter;texture.generateMipmaps=false;texture.needsUpdate=true;texture.name='alpha-baked-irradiance'
  return texture
}
export function attachAlphaBakeRects(geometry:THREE.BufferGeometry,ids:number[],files:BakeFiles){
  const {width,height}=files.manifest
  names.forEach((name,face)=>{
    const data=new Float32Array(ids.length*4)
    ids.forEach((id,i)=>{const k=id*24+face*4;data.set([(files.rects[k]+.5)/width,(files.rects[k+1]+.5)/height,(files.rects[k+2]-1)/width,(files.rects[k+3]-1)/height],i*4)})
    geometry.setAttribute(name,new THREE.InstancedBufferAttribute(data,4))
  })
}
export function applyAlphaBake(mat:THREE.Material,texture:THREE.Texture){
  const prior=mat.onBeforeCompile,key=mat.customProgramCacheKey()
  const liquid=mat.userData.alphaLiquid&&mat instanceof THREE.MeshStandardMaterial
  mat.onBeforeCompile=(shader,renderer)=>{
    prior.call(mat,shader,renderer)
    Object.assign(shader.uniforms,{alphaIrradiance:{value:texture},alphaBakeOverride,l1BakedMask:l0StaticPointMask})
    shader.vertexShader=`${names.map(n=>'attribute vec4 '+n+';').join('\n')}\nvarying vec2 vAlphaBakeUv;\n`+shader.vertexShader
    shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>
      vec3 an=abs(normal);vec4 chart;vec2 faceUv;
      if(an.x>=an.y&&an.x>=an.z){chart=normal.x>0.?alphaLmPX:alphaLmNX;faceUv=position.zy+.5;}
      else if(an.y>=an.z){chart=normal.y>0.?alphaLmPY:alphaLmNY;faceUv=position.xz+.5;}
      else{chart=normal.z>0.?alphaLmPZ:alphaLmNZ;faceUv=position.xy+.5;}
      vAlphaBakeUv=chart.xy+clamp(faceUv,0.,1.)*chart.zw;vAlphaBakeUv.y=1.-vAlphaBakeUv.y;`)
    shader.fragmentShader='uniform sampler2D alphaIrradiance;uniform float alphaBakeOverride;uniform float l1BakedMask[128];varying vec2 vAlphaBakeUv;\n'+shader.fragmentShader
    shader.fragmentShader=shader.fragmentShader.replace('#include <lights_fragment_begin>',liquid?liquidPoints:points)
    shader.fragmentShader=shader.fragmentShader.replace('#include <lights_fragment_maps>',`#include <lights_fragment_maps>
      vec3 alphaBaked=texture2D(alphaIrradiance,vAlphaBakeUv).rgb;
      irradiance=mix(alphaBaked*alphaBaked*12.5663706,irradiance,alphaBakeOverride);`)
  }
  mat.customProgramCacheKey=()=>key+'|alpha-bake-v1'+(liquid?'|liquid-specular':'')
  mat.userData.alphaBaked=true
  // Renderer retirement owns materials. Keep the atlas alive until every batch
  // material has retired, including asynchronous quality-mode replacement.
  owners++;let released=false
  mat.addEventListener('dispose',()=>{if(!released){released=true;owners--;if(--refs.count===0)texture.dispose()}})
  const refs=texture.userData.alphaOwners??={count:0};refs.count++
}
