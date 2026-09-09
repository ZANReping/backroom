import * as THREE from 'three'
import type { GameMap } from '../world/mapgen'
import type { Structure } from '../core/types'
import { furnishings,settlementCeiling } from '../world/settlement'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { litMaterial } from './shared'
import { l1Texture } from './l1Materials'

type Box=[number,number,number,number,number,number]
/** Instancing is local to each room, so ordinary frustum culling discards whole interiors. */
function batch(parent:THREE.Group,boxes:Map<string,Box[]>,geometry:THREE.BoxGeometry,materials:Map<string,THREE.Material>){
 const matrix=new THREE.Matrix4(),q=new THREE.Quaternion()
 for(const [color,items] of boxes){
  let mat=materials.get(color)
  if(!mat){
   const wood=['#937659','#8c6c4d','#856447'].includes(color),floor=['#9eaead','#ada89b'].includes(color),wall=['#dce5de','#d0cbbd','#bbb9af'].includes(color)
   const metal=['#767e80','#8b9493','#8e9694','#5c6363','#596b77'].includes(color)
   const cloth=['#455e73','#663a35','#9ebbb1','#e6e2d6'].includes(color)
   const prefix=wood?'l11_wood':cloth?'settlements/fabric':['#ccd0c8','#d3c5ad'].includes(color)?'settlements/ceiling':color==='#dce5de'?'settlements/tiles':floor?(color==='#ada89b'?'l11_concrete':'settlements/tiles'):wall?'l11_plaster':metal?'l11_metal':null
   const file=(kind:'color'|'normal'|'roughness')=>prefix!.startsWith('settlements/')?`${prefix}_${kind==='normal'?'normalgl':kind}.jpg`:`${prefix}${kind==='color'?'':'_'+kind}.jpg`
   mat=litMaterial({color:wood?'#dbd0ba':color,roughness:metal?.5:.82,metalness:metal?.55:0,...(prefix?{map:l1Texture(file('color')),normalMap:l1Texture(file('normal'),true),normalScale:new THREE.Vector2(cloth?.12:.2,cloth?.12:.2),roughnessMap:l1Texture(file('roughness'),true)}:{})})
   if(color==='#a8c8c1'){mat.transparent=true;mat.opacity=.3;mat.depthWrite=false}
   mat.userData.l1Owned=true
   if(prefix){mat.onBeforeCompile=shader=>{shader.vertexShader=shader.vertexShader.replace('#include <uv_vertex>',`#include <uv_vertex>
     vec3 sw = (modelMatrix * instanceMatrix * vec4(position,1.0)).xyz;
     vec2 suv = abs(normal.y) > 0.5 ? sw.xz * 0.5 : vec2(sw.x+sw.z,sw.y)*0.5;
     #ifdef USE_MAP
     vMapUv = suv;
     #endif
     #ifdef USE_NORMALMAP
     vNormalMapUv = suv;
     #endif
     #ifdef USE_ROUGHNESSMAP
     vRoughnessMapUv = suv;
     #endif`);if(!metal)shader.fragmentShader=shader.fragmentShader.replace('#include <roughnessmap_fragment>',`#include <roughnessmap_fragment>\nroughnessFactor=max(roughnessFactor,${cloth?'0.85':wood?'0.57':'0.72'});`)};mat.customProgramCacheKey=()=> `settlement-world-uv-v2-${cloth?'cloth':wood?'wood':metal?'metal':'matte'}`}
   materials.set(color,mat)
  }
  const mesh=new THREE.InstancedMesh(geometry,mat,items.length)
  items.forEach(([x,y,z,w,h,d],i)=>{matrix.compose(new THREE.Vector3(x,y,z),q,new THREE.Vector3(w,h,d));mesh.setMatrixAt(i,matrix)})
  mesh.computeBoundingSphere();parent.add(mesh)
 }
}
export function buildSettlementTerrain(m:GameMap,parent:THREE.Group){
 const s=m.settlement!,b=s.blueprint
 const geometry=new THREE.BoxGeometry(1,1,1),materials=new Map<string,THREE.Material>()
 const vaults:THREE.BufferGeometry[]=[]
 const batches=new Map<number,Map<string,Box[]>>()
 const add=(ri:number,color:string,x:number,y:number,z:number,w:number,h:number,d:number)=>{let group=batches.get(ri);if(!group)batches.set(ri,group=new Map());let list=group.get(color);if(!list)group.set(color,list=[]);list.push([x,y,z,w,h,d])}
 for(let y=0;y<m.h;y++)for(let x=0;x<m.w;x++){
  const i=y*m.w+x,r=b.rooms[s.roomIndex[i]],ri=-1,H=s.heights[i]
  const domestic=r&&['bedroom','residential','dining','library'].includes(r.style),medical=r&&['lab','clinic','wash','kitchen'].includes(r.style)
  if(m.tiles[i]===1){
   add(ri,domestic?'#937659':medical?'#9eaead':'#ada89b',x+.5,-.09,y+.5,1,.18,1)
   add(ri,domestic?'#d3c5ad':'#ccd0c8',x+.5,H+.15,y+.5,1,.3,1)
   if(b.id==='ariane'&&s.roomIndex[i]<0){
    const vault=new THREE.PlaneGeometry(1,1,6,2);vault.rotateX(Math.PI/2);vault.translate(x+.5,0,y+.5)
    const p=vault.getAttribute('position');for(let j=0;j<p.count;j++)p.setY(j,settlementCeiling(m,p.getX(j),p.getZ(j)))
    vault.computeVertexNormals();vaults.push(vault)
   }
   // Seal the upper cavity at all low/high transitions, including door headers.
   for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){
    const j=(y+dy)*m.w+x+dx,next=s.heights[j]??H
    if(next>H)add(ri,'#bbb9af',x+.5+dx*.48,(H+next)/2,y+.5+dy*.48,dx?.06:1,next-H,dy?.06:1)
   }
  }else{
   const top=Math.max(H,...[[1,0],[-1,0],[0,1],[0,-1]].map(([dx,dy])=>s.heights[(y+dy)*m.w+x+dx]??H))
   const window=r&&['lab','clinic','holding'].includes(r.style)&&x===r.x&&y>=r.y+2&&y<=r.y+3
   if(window){
    add(ri,'#dce5de',x+.5,.5,y+.5,1,1,1)
    add(ri,'#dce5de',x+.5,(top+2.1)/2,y+.5,1,top-2.1,1)
    add(ri,'#a8c8c1',x+.5,1.55,y+.5,.07,1.1,1)
    add(ri,'#546b69',x+.5,1.05,y+.5,1.025,.06,1)
   }else add(ri,medical?'#dce5de':'#d0cbbd',x+.5,top/2,y+.5,1,top,1)
   if(domestic)add(ri,'#8c6c4d',x+.5,.55,y+.5,1.025,1.1,1.025)
  }
 }
 b.rooms.forEach((r,ri)=>{
  for(const p of furnishings(r))add(ri,p.color,p.x+p.w/2,p.z+p.h/2,p.y+p.d/2,p.w,p.h,p.d)
  // Structural ceiling grid, service duct and suspended brackets; no duplicate luminous boxes.
  for(let x=r.x+2;x<r.x+r.w-1;x+=3)add(ri,'#8e9694',x,r.height-.06,r.y+r.h/2,.045,.1,r.h-2)
  add(ri,'#8b9493',r.x+r.w/2,r.height-.23,r.y+1.5,r.w-2,.28,.4)
  for(let x=r.x+2;x<r.x+r.w-1;x+=3)add(ri,'#5c6363',x,r.height-.14,r.y+1.5,.04,.28,.55)
 })
 for(const [ri,boxes] of batches){const room=new THREE.Group();room.name=ri<0?'公共通廊':b.rooms[ri].name;if(ri>=0)room.userData.settlementBounds=b.rooms[ri];batch(room,boxes,geometry,materials);parent.add(room)}
 if(vaults.length){const mat=litMaterial({color:'#aaa896',map:l1Texture('l11_concrete.jpg'),side:THREE.DoubleSide});mat.userData.l1Owned=true;parent.add(new THREE.Mesh(mergeGeometries(vaults),mat));vaults.forEach(g=>g.dispose())}
}
export function buildSettlementStation(s:Structure){
 const g=new THREE.Group();g.position.set(s.x+s.w/2,0,s.y+s.h/2)
 const mat=litMaterial({color:'#657b77'});
   mat.userData.l1Owned=true;const body=new THREE.Mesh(new THREE.BoxGeometry(.48,.9,.32),mat);body.position.y=.45;g.add(body)
 const canvas=document.createElement('canvas');canvas.width=512;canvas.height=192
 const ctx=canvas.getContext('2d')!;ctx.fillStyle='#1e302f';ctx.fillRect(0,0,512,192);ctx.fillStyle='#eee8ca';ctx.font='28px sans-serif';ctx.textAlign='center'
 ctx.fillText(String(s.data?.label??'服务台'),256,64,494);ctx.font='23px sans-serif';ctx.fillText(Number(s.data?.access)>0?'工作人员服务 / 资格核验':'公共服务 / 按 E 查看',256,116,490)
 const texture=new THREE.CanvasTexture(canvas),sign=new THREE.Mesh(new THREE.BoxGeometry(1.4,.525,.035),new THREE.MeshBasicMaterial({map:texture}));sign.material.userData.l1Owned=true;sign.material.userData.settlementLabelTexture=true;sign.position.y=1.55;g.add(sign);return g
}



