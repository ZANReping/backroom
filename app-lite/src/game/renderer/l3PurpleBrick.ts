import * as THREE from 'three'
import type {GameMap} from '../world/mapgen'
import {findL3PurpleBrick} from '../world/l3Variations'
import {getMaterialMode,litMaterial,levelTexture,noiseTexture} from './shared'

const materials=new Map<string,THREE.Material>()
/** A rare mineral alteration of one existing brick, not a pickup or light. */
export function buildL3PurpleBrick(m:GameMap,cx:number,cz:number){
 const brick=findL3PurpleBrick(m,cx,cz);if(!brick)return null
 const geo=new THREE.PlaneGeometry(brick.width,brick.height,40,18)
 const p=geo.getAttribute('position'),uv=geo.getAttribute('uv'),colors=new Float32Array(p.count*3)
 const plum=new THREE.Color('#a75b99'),pink=new THREE.Color('#e6a0c6'),cream=new THREE.Color('#edcfcf'),char=new THREE.Color('#51434e')
 const smooth=(a:number,b:number,t:number)=>{const q=THREE.MathUtils.clamp((t-a)/(b-a),0,1);return q*q*(3-2*q)}
 for(let i=0;i<p.count;i++){
  const u=uv.getX(i),v=uv.getY(i),noise=Math.sin(u*237+v*163+brick.hash%100)*Math.sin(v*347-u*113)
  const radius=Math.hypot((u-.34)*1.45,(v-1.35)*.85)
  const veins=.5+.5*Math.sin(radius*16+Math.sin(v*7)*.55+Math.sin(u*19+v*8)*.32)
  const c=plum.clone().lerp(pink,smooth(.08,.66,veins)).lerp(cream,smooth(.74,.97,veins)*.85)
  c.lerp(char,smooth(.85+Math.sin(u*31)*.025,1,v)*.85).multiplyScalar(1+noise*.07)
  colors.set([c.r,c.g,c.b],i*3)
  const edge=Math.min(u,1-u,v,1-v)
  p.setZ(i,.0002*noise+.002*smooth(0,.09,edge))
  uv.setXY(i,.112+u*.17,.944+v*.044)
 }
 geo.setAttribute('color',new THREE.BufferAttribute(colors,3));geo.computeVertexNormals()
 let mat=materials.get(getMaterialMode())
 if(!mat){
  const map=levelTexture('l3/polyhaven/factory_brick_Color.jpg',()=>noiseTexture('#887b77','#615b58'))
  map.colorSpace=THREE.SRGBColorSpace
  const normal=levelTexture('l3/polyhaven/factory_brick_NormalGL.jpg',()=>noiseTexture('#8080ff','#8080ff'));normal.colorSpace=THREE.NoColorSpace
  mat=litMaterial({vertexColors:true,map,normalMap:normal,normalScale:new THREE.Vector2(.28,.28),roughness:.76,metalness:0,envBase:.015})
  mat.onBeforeCompile=shader=>{shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`float mineralGrain=dot(texture2D(map,vMapUv).rgb,vec3(.299,.587,.114));
    diffuseColor.rgb*=clamp(pow(max(.001,mineralGrain),.55)*2.0,.5,1.1);`)}
  mat.customProgramCacheKey=()=> 'l3-purple-mineral-brick'
  materials.set(getMaterialMode(),mat)
 }
 const mesh=new THREE.Mesh(geo,mat);mesh.position.set(brick.x,brick.y,brick.z);mesh.rotation.y=Math.atan2(brick.nx,brick.nz)
 mesh.name='l3-purple-brick';mesh.receiveShadow=true;mesh.userData.noCastShadow=true
 mesh.userData.worldBrick={x:brick.x+(m.inf?.ox??0),z:brick.z+(m.inf?.oy??0),y:brick.y}
 return mesh
}
