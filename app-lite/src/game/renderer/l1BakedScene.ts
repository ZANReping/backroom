import * as THREE from 'three'
import type {L1ArchitectureData} from '../world/l1BuildingTypes'
import type {LightSource} from '../core/types'
import {l1Material} from './l1Materials'
import {l0StaticPointMask} from './l0PointMask'
import {requestL1Bake} from './l1BakeQueue'
import {l1NativePower,registerL1Probes,removeL1Probes} from './l1Probes'
import {recordL1BuildStage} from './l1BuildMetrics'
import {bindL1Portals} from './l1PortalLighting'
import {l1ModuleAt} from '../world/l1Building'
import {l1BakedPointLights} from './l1BakedShader'
const bakedPointChunk=l1BakedPointLights(THREE.ShaderChunk.lights_fragment_begin)
type Fixture={mat:THREE.MeshBasicMaterial;seed:number;src?:LightSource;batch?:THREE.InstancedMesh;index?:number}
export function *buildL1BakedScene(data:L1ArchitectureData,ox:number,oz:number,group:THREE.Group,quality:'low'|'high'):Generator<void,void,unknown>{
 const entry=requestL1Bake(data,quality)
 while(entry.pending)yield
 if(entry.error||!entry.result)throw new Error(entry.error??'L1 bake unavailable')
 const r=entry.result;if(r.fingerprint!==data.fingerprint)throw new Error('Stale L1 lighting result')
 const light=new THREE.DataTexture(r.irradiance,r.size,r.size,THREE.RGBAFormat,THREE.HalfFloatType),direction=new THREE.DataTexture(r.direction,r.size,r.size)
 const portal=r.portalWeights?new THREE.DataTexture(r.portalWeights,r.size,r.size*2):null,binding=portal?bindL1Portals(r.seed,r.portalIds??[]):null
 for(const t of [light,direction,...(portal?[portal]:[])]){t.minFilter=t.magFilter=THREE.LinearFilter;t.colorSpace=THREE.NoColorSpace;t.generateMipmaps=false;t.needsUpdate=true;t.channel=1}
 let owners=0,registered=false
 for(const b of r.meshes){
  const started=performance.now()
  const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.BufferAttribute(b.position,3));geo.setAttribute('normal',new THREE.BufferAttribute(b.normal,3));geo.setAttribute('uv',new THREE.BufferAttribute(b.uv,2));geo.setAttribute('uv1',new THREE.BufferAttribute(b.uv1,2));geo.setIndex(new THREE.BufferAttribute(b.index,1));geo.computeBoundingSphere()
  const surface=b.surface==='paint'?(b.style==='maintenance'?'wall':'columnPaint'):b.surface
  const source=l1Material(b.style==='maintenance'&&b.surface==='paint'?'maintenance-plaster':b.style,surface),mat=source.clone() as THREE.MeshStandardMaterial
  mat.onBeforeCompile=source.onBeforeCompile;mat.customProgramCacheKey=source.customProgramCacheKey
  mat.userData={...source.userData,l1Owned:true,l1Baked:true,l1Textures:[direction,...(portal?[portal]:[])]};mat.lightMap=b.surface==='leaf'?null:light;mat.lightMapIntensity=Math.PI
  const prior=mat.onBeforeCompile,key=mat.customProgramCacheKey();owners++
  mat.onBeforeCompile=(shader,renderer)=>{
   prior.call(mat,shader,renderer);Object.assign(shader.uniforms,{l1NativePower,l1BakedMask:l0StaticPointMask,l1Dominant:{value:direction}})
   if(shader.uniforms.l1VaultSpringing)shader.uniforms.l1VaultSpringing.value=l1ModuleAt(data.seed,data.cx*32+16,data.cy*32+16,'gothic').springHeight??1.35
   shader.fragmentShader='uniform float l1BakedMask[128];uniform sampler2D l1Dominant;\n'+shader.fragmentShader
   if(portal&&binding){Object.assign(shader.uniforms,{l1PortalWeights:{value:portal},l1PortalClosed:binding.uniform});shader.fragmentShader='uniform sampler2D l1PortalWeights;uniform float l1PortalClosed[8];\n'+shader.fragmentShader}
   if(b.surface!=='leaf')shader.fragmentShader=shader.fragmentShader.replace('#include <lights_fragment_begin>',bakedPointChunk)
   shader.fragmentShader=shader.fragmentShader.replace('#include <lights_fragment_maps>',THREE.ShaderChunk.lights_fragment_maps.replace('irradiance += lightMapIrradiance;',`vec3 l1Direction=texture2D(l1Dominant,vLightMapUv).xyz*2.-1.;
    vec3 l1FineNormal=inverseTransformDirection(geometryNormal,viewMatrix);
    float l1DetailResponse=mix(.88,1.12,clamp(dot(l1FineNormal,l1Direction)*.5+.5,0.,1.));
    float l1Transmission=1.;
    ${portal?`vec4 l1GateA=texture2D(l1PortalWeights,vec2(vLightMapUv.x,vLightMapUv.y*.5));
    vec4 l1GateB=texture2D(l1PortalWeights,vec2(vLightMapUv.x,vLightMapUv.y*.5+.5));
    l1Transmission=max(0.,1.-dot(l1GateA,vec4(l1PortalClosed[0],l1PortalClosed[1],l1PortalClosed[2],l1PortalClosed[3]))-dot(l1GateB,vec4(l1PortalClosed[4],l1PortalClosed[5],l1PortalClosed[6],l1PortalClosed[7])));`:''}
    irradiance += lightMapIrradiance*l1NativePower*l1DetailResponse*l1Transmission;`))
  }
  mat.customProgramCacheKey=()=>key+'|l1-baked-v4|skip-native-v1'+(portal?'|portals':'');mat.addEventListener('dispose',()=>{if(--owners===0){light.dispose();direction.dispose();portal?.dispose();binding?.dispose();if(registered)removeL1Probes(r)}})
  const mesh=new THREE.Mesh(geo,mat);mesh.position.set(data.cx*32-ox,0,data.cy*32-oz);mesh.name=`l1-baked-${b.style}-${b.surface}`;mesh.userData.noCastShadow=['floor','ground','leaf'].includes(b.surface);group.add(mesh);recordL1BuildStage('meshAndMaterialCpu',performance.now()-started);yield
 }
 registerL1Probes(r);registered=true;group.userData.l1Bake=r.metrics
}
/** Exactly the same local frame as the emitter used by the CPU integrator. */
export function buildL1EmitterMeshes(data:L1ArchitectureData,ox:number,oz:number,g:THREE.Group,lights:LightSource[],fixtures:Fixture[]){
 const groups=new Map<string,{entries:{index:number;matrix:THREE.Matrix4}[];kind:string}>(),basis=new THREE.Matrix4()
 data.emitters.forEach((e,index)=>{
  if(e.kind==='sky')return
  const t=new THREE.Vector3(...e.tangent).normalize(),n=new THREE.Vector3(...e.normal).normalize(),v=new THREE.Vector3().crossVectors(t,n).normalize()
  basis.makeBasis(t,n,v);const q=new THREE.Quaternion().setFromRotationMatrix(basis),m=new THREE.Matrix4().compose(new THREE.Vector3(e.position[0]-ox,e.position[1],e.position[2]-oz),q,new THREE.Vector3(e.width,.045,e.height))
  const key=e.style+':'+e.kind,a=groups.get(key)??{entries:[],kind:e.kind};a.entries.push({index,matrix:m});groups.set(key,a)
 })
 for(const {entries,kind}of groups.values()){
  const mat=new THREE.MeshBasicMaterial({color:0xffffff,toneMapped:false});mat.userData.base=new THREE.Color(kind==='emergency'?'#558b62':'#f5f5e9').multiplyScalar(kind==='emergency'?.5:3)
  mat.userData.l1Owned=true;const mesh=new THREE.InstancedMesh(new THREE.BoxGeometry(1,1,1),mat,entries.length)
  entries.forEach((a,i)=>{mesh.setMatrixAt(i,a.matrix);mesh.setColorAt(i,(mat.userData.base as THREE.Color).clone());fixtures.push({mat,seed:lights[a.index]?.flickerSeed??0,src:lights[a.index],batch:mesh,index:i})})
  mesh.name='l1-emitter-'+kind;mesh.userData.noCastShadow=true;g.add(mesh)
 }
}
