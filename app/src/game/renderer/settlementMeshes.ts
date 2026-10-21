import {factionSignTexture,signStyleFor,drawFactionSign} from './factionSigns'
import {buildAlphaBatchJob} from './alphaMeshes'
import * as THREE from 'three'
import type { GameMap } from '../world/mapgen'
import type { Structure } from '../core/types'
import type { SurfaceMaterial } from '../content/settlementTypes'
import { furnishings,settlementCeiling,settlementColumns } from '../world/settlement'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { getMaterialMode, litMaterial } from './shared'
import { l1Texture } from './l1Materials'
import {buildTradeBatchJob} from './tradeMeshes'
type Box=[number,number,number,number,number,number]
const prefixes:Partial<Record<SurfaceMaterial,string>>={wood:'l11_wood',concrete:'l11_concrete',plaster:'l11_plaster',metal:'l11_metal',fabric:'settlements/fabric',tile:'settlements/tiles',ceiling:'settlements/ceiling'}
function material(kind:SurfaceMaterial,color:string){
 const prefix=prefixes[kind],metal=kind==='metal'
 const file=(v:string)=>prefix!.startsWith('settlements/')?prefix+'_'+(v==='normal'?'normalgl':v)+'.jpg':prefix+(v==='color'?'':'_'+v)+'.jpg'
 const mat=litMaterial({color,roughness:metal?.55:.85,metalness:metal?.45:0,...(prefix?{map:l1Texture(file('color')),normalMap:l1Texture(file('normal'),true),roughnessMap:getMaterialMode()==='realistic'?l1Texture(file('roughness'),true):undefined,normalScale:new THREE.Vector2(.18,.18)}:{})})
 mat.userData.l1Owned=true
 if(kind==='glass'){mat.transparent=true;mat.opacity=.22;mat.depthWrite=false}
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
 #endif`)};mat.customProgramCacheKey=()=> 'settlement-v2-world-'+kind}
 return mat
}
export function* buildSettlementTerrainJob(m:GameMap,parent:THREE.Group):Generator<void,void,unknown>{
 if(m.settlement?.blueprint.id==='alpha'){yield* buildAlphaBatchJob(m.structures,parent);return}
 if(m.settlement?.blueprint.decorations){yield* buildTradeBatchJob(m.structures,parent);return}
 const s=m.settlement!,b=s.blueprint,geometry=new THREE.BoxGeometry(1,1,1),materials=new Map<string,THREE.Material>(),batches=new Map<string,Map<string,Box[]>>()
 const vaults:THREE.BufferGeometry[]=[]
 const add=(kind:SurfaceMaterial,color:string,x:number,y:number,z:number,w:number,h:number,d:number)=>{
  if(h<=0)return
  const grid=Math.floor(x/16)+':'+Math.floor(z/16);let group=batches.get(grid);if(!group)batches.set(grid,group=new Map())
  const key=kind+'|'+color;let list=group.get(key);if(!list)group.set(key,list=[]);list.push([x,y,z,w,h,d])
 }
 for(let y=0;y<m.h;y++){for(let x=0;x<m.w;x++){
  const i=y*m.w+x,H=s.heights[i],r=b.rooms[s.roomIndex[i]],roof=b.shells[s.roofIndex[i]]
  if(m.tiles[i]===1){
   const floor=r?.floorMaterial??'concrete'
   add(floor,floor==='wood'?'#c0b497':floor==='tile'?'#c4ccc4':'#b8b4a7',x+.5,-.09,y+.5,1,.18,1)
   add(roof?.roof==='domestic'?'ceiling':'concrete','#d0d0bd',x+.5,H+.16,y+.5,1,.32,1)
   if(roof?.roof==='vault'){
    const g=new THREE.PlaneGeometry(1,1,6,2);g.rotateX(Math.PI/2);g.translate(x+.5,0,y+.5)
    const p=g.getAttribute('position');for(let j=0;j<p.count;j++)p.setY(j,settlementCeiling(m,Math.min(m.w-.001,p.getX(j)),Math.min(m.h-.001,p.getZ(j))))
    g.computeVertexNormals();vaults.push(g)
   }
   for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){
    const nx=x+dx,ny=y+dy,j=ny*m.w+nx,next=s.heights[j]??H
    if(nx<0||ny<0||nx>=m.w||ny>=m.h||m.tiles[j]!==1){
     add('plaster','#c5c3b5',x+.5+dx*.49,H/2,y+.5+dy*.49,dx?.18:1,H,dy?.18:1)
     add('wood','#95846b',x+.5+dx*.48,.13,y+.5+dy*.48,dx?.2:1,.26,dy?.2:1)
    }else if(next>H)add('plaster','#bcbbaa',x+.5+dx*.49,(H+next)/2,y+.5+dy*.49,dx?.1:1,next-H,dy?.1:1)
   }
  }
 }yield}
 for(const p of b.partitions){
  add(p.material,p.material==='glass'?'#a8c8c1':'#d0d0bf',p.x+p.w/2,(p.bottom??0)+p.height/2,p.y+p.h/2,p.w,p.height,p.h)
  if(p.material==='glass'){add('metal','#687a77',p.x+p.w/2,.85,p.y+p.h/2,p.w+.03,.06,p.h+.03)}
 yield}
 for(const r of b.rooms){for(const p of furnishings(r))add(p.material,p.color,p.x+p.w/2,p.z+p.h/2,p.y+p.d/2,p.w,p.h,p.d);yield}
 for(const p of settlementColumns(b)){
  add('concrete','#b9b6a6',p.x,p.height/2,p.y,.6,p.height,.6)
  add('concrete','#a4a493',p.x,.18,p.y,.74,.36,.74)
 yield}
 // Primary structure and service trunks span the entire open shell.
 const main=b.shells[0]
 if(main.roof!=='domestic')for(let y=main.y+5;y<main.y+main.h;y+=10){
  add('concrete','#a5a897',main.x+main.w/2,main.height-.2,y,main.w,.38,.35)
  add('metal','#8c9894',main.x+main.w/2,main.height-.52,y+1,main.w,.32,.5)
  for(let x=main.x+2;x<main.x+main.w;x+=5)add('metal','#707d79',x,main.height-.3,y+1,.05,.6,.65)
 }
 if(main.roof==='industrial'||main.roof==='slab')for(let x=main.x+5;x<main.x+main.w;x+=10)add('concrete','#b4b6a6',x,main.height-.12,main.y+main.h/2,.3,.24,main.h)
 // Outside approaches contain utility runs; they are narrow L1 connections, not empty halls.
 for(const c of b.corridors)add('metal','#89918b',c.x+c.w/2,3.2,c.y+c.h/2,c.w,.18,.25)
 const matrix=new THREE.Matrix4(),q=new THREE.Quaternion()
 for(const [grid,group] of batches){
  const node=new THREE.Group();node.name='settlement-grid-'+grid;parent.add(node)
  for(const [key,items] of group){
   let mat=materials.get(key);if(!mat){const [kind,color]=key.split('|');mat=material(kind as SurfaceMaterial,color);materials.set(key,mat)}
   const mesh=new THREE.InstancedMesh(geometry,mat,items.length)
   items.forEach(([x,y,z,w,h,d],i)=>{matrix.compose(new THREE.Vector3(x,y,z),q,new THREE.Vector3(w,h,d));mesh.setMatrixAt(i,matrix)})
   mesh.computeBoundingSphere();node.add(mesh);yield
  }
  yield
 }
 if(vaults.length){const mat=litMaterial({color:'#b1b09d',map:l1Texture('l11_concrete.jpg'),side:THREE.DoubleSide});mat.userData.l1Owned=true;parent.add(new THREE.Mesh(mergeGeometries(vaults),mat));vaults.forEach(g=>g.dispose())}
}
const drain=(job:Generator<void,void,unknown>)=>{for(let r=job.next();!r.done;r=job.next()){}
}
export function buildSettlementTerrain(m:GameMap,parent:THREE.Group){drain(buildSettlementTerrainJob(m,parent))}
export function buildSettlementStation(s:Structure){
 const g=new THREE.Group();g.position.set(s.x+s.w/2,0,s.y+s.h/2)
 // v3: each faction's counter plate in its own trade dress (factionSigns.ts); shared cached texture.
 const label=String(s.data?.label??'服务台'),sub=Number(s.data?.access)>0?'工作人员 · 资格核验':'公共服务 · 按 E 查看'
 const mat=new THREE.MeshBasicMaterial({map:factionSignTexture(signStyleFor(String(s.data?.faction??'')),label,.95/.356,sub)})
 mat.userData.l1Owned=true
 // Small counter placard; no freestanding identical door-side service poles.
 const sign=new THREE.Mesh(new THREE.BoxGeometry(.95,.356,.035),mat);sign.position.y=1.3;g.add(sign)
 return g
}

// v3: settlement notice boards (were blank teal boxes). Faction header strip + pinned notices, per blueprint.
const BOARD_NOTES:Record<string,string[]>={
 bntg:['今日汇率','杏仁水 ×3 = 1 电池','保险库开放 08–20','禁止私下交易','寻：手电筒','收购：绳索'],
 ariane:['候诊须知','请保持安静','免费诊疗','体温登记','药品发放 14:00','献血招募'],
 tom:['今日特供','炖菜 · 面包','欢迎光临','招服务员','卡座请勿占用','营业至深夜'],
 meg:['公告','巡逻排班','失踪人员','层级通报','禁止携带实体样本','报案请至窗口'],
 industrial:['公告','注意安全','值班表','维修登记','失物招领','禁止吸烟'],
}
const boardCache=new Map<string,THREE.CanvasTexture>()
export function boardTexture(style:string,title:string,w:number,seed:number){
 const key=style+'|'+title+'|'+w.toFixed(1)
 const hit=boardCache.get(key);if(hit)return hit
 const W=Math.min(2048,Math.max(256,Math.round(w*220))),H=275,cv=document.createElement('canvas');cv.width=W;cv.height=H
 const c=cv.getContext('2d')!
 let r=seed>>>0||1;const rnd=()=>{r^=r<<13;r^=r>>>17;r^=r<<5;return (r>>>0)/4294967296}
 // cork / felt field with frame
 const felt=style==='ariane'?'#6f8f8a':style==='meg'?'#4a5f6b':style==='tom'?'#7a5a3c':style==='bntg'?'#5b6448':'#6b6458'
 c.fillStyle='#3a332b';c.fillRect(0,0,W,H);c.fillStyle=felt;c.fillRect(8,8,W-16,H-16)
 for(let i=0;i<W*H/60;i++){c.fillStyle=`rgba(${rnd()<.5?0:255},${rnd()<.5?0:255},0,.05)`;c.fillRect(rnd()*W,rnd()*H,2,2)}
 const st=signStyleFor(style)
 drawFactionSign(c,14,14,W-28,58,st,title.split('·')[0].trim())
 const notes=BOARD_NOTES[style]??BOARD_NOTES.industrial
 const n=Math.max(3,Math.floor((W-28)/92))
 for(let i=0;i<n;i++){
  const nw=70+rnd()*14,nh=96+rnd()*60,x=20+i*((W-40)/n)+rnd()*8,y=84+rnd()*(H-96-nh-6)
  c.save();c.translate(x+nw/2,y+nh/2);c.rotate((rnd()-.5)*.12)
  c.fillStyle=['#efe9d6','#f3e7b4','#e6eef0','#f2dccf'][Math.floor(rnd()*4)];c.fillRect(-nw/2,-nh/2,nw,nh)
  c.fillStyle='rgba(0,0,0,.18)';c.fillRect(-nw/2+3,nh/2,nw,3)
  c.fillStyle='#2a2622';c.font=`bold 13px 'Noto Sans CJK SC','Microsoft YaHei',sans-serif`;c.textAlign='center'
  c.fillText(notes[i%notes.length],0,-nh/2+20,nw-8)
  c.fillStyle='rgba(40,36,30,.55)'
  for(let ly=-nh/2+32;ly<nh/2-8;ly+=9)c.fillRect(-nw/2+7,ly,(nw-14)*(.5+rnd()*.5),3)
  c.fillStyle=['#c0392b','#2e6fb0','#d4a017'][i%3];c.beginPath();c.arc(0,-nh/2+5,4,0,Math.PI*2);c.fill()
  c.restore()
 }
 const t=new THREE.CanvasTexture(cv);t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=4;boardCache.set(key,t);return t
}
export function buildSettlementBoard(s:Structure){
 const g=new THREE.Group(),w=s.w,h=1.25
 const style=String(s.data?.blueprint??s.data?.faction??'industrial')
 const tex=boardTexture(style,String(s.data?.title??'公告'),w,Math.floor(s.x*131+s.y*71))
 const mat=new THREE.MeshStandardMaterial({map:tex,roughness:.85,metalness:0})
 const plane=new THREE.Mesh(new THREE.PlaneGeometry(w,h),mat)
 plane.position.set(s.x+w/2,1.15+h/2,s.y+.08+.006)
 g.add(plane);return g
}
