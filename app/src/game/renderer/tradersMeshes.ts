import * as THREE from 'three'
import {mergeGeometries} from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import type {Structure} from '../core/types'
import type {GameMap} from '../world/mapgen'
import type {TradersChunk} from '../world/tradersWorld'
import {TRADERS_BOUNDS,TRADERS_ROOMS,TRADERS_ZONES,TRADERS_WALLS,TRADERS_VAULT_CELLS,TRADERS_ENTRIES,tradersIntersects,tradersContains,tradersZoneAt,type TradersRect,type TradersRoom,type TradersZone} from '../content/tradersLayout'
import {tradersRibs,tradersHallPosts} from '../content/tradersRibs'
import {isTradeKind,tradeParts} from '../content/tradeDecor'
import {litMaterial,getMaterialMode} from './shared'
import {l1Texture,l1WorldUV} from './l1Materials'
import {buildTradersArchitectureDetails} from './tradersArchitectureDetails'
import {TRADERS_SIGN_TEXT} from '../content/tradersFitout'
import {materialBatchKey} from './materialBatch'
import {applyTradersBake,bakeTradersGeometry,tradersIrradiance,type TradersProbe,type TradersProbeField} from './tradersBakedLighting'

/** One atlas and material family per streamed world, independent of chunk retirement. */
export class TradersAssets{
 readonly materials=new Map<string,THREE.Material>()
 readonly atlas:THREE.CanvasTexture
 private labels:string[]
 constructor(){
  this.labels=[...new Set([...TRADERS_SIGN_TEXT,...TRADERS_ENTRIES.map(e=>e.sign),...TRADERS_ROOMS.map(r=>r.name),...TRADERS_ZONES.map(r=>r.name),'商人之家 / TRADERS KEEP','公共服务 / SERVICES','保险库登记','TGPF / 通行核验','L2 铁路 · 未开通','补给连接 · 未开通','返回 LEVEL 1','公共交易柜台','雇佣与业务登记','兑换与寄存','业务与调度','货物核验','封签核验','打包与交接','空摊位','冷藏柜','固定藏品 · 浅蓝色 250 GT','TH-001-A / S-014','TH-001-B / S-014','TH-001-C / S-014','TV-001 / S-014','TV-002 / S-014','TV-003 / S-014'])]
  const canvas=document.createElement('canvas');canvas.width=2048;canvas.height=2048
  const c=canvas.getContext('2d')!;c.fillStyle='#27362f';c.fillRect(0,0,2048,2048);c.textAlign='center';c.textBaseline='middle'
  for(let i=0;i<this.labels.length;i++){
   const x=i%8*256,y=Math.floor(i/8)*64
   const bay=/^[NS]\d{2}$/.test(this.labels[i])?Number(this.labels[i].slice(1)):-1
   c.fillStyle=bay<0?'#35473e':['#415e61','#765943','#545d77','#686247'][bay%4];c.fillRect(x+3,y+3,250,58);c.strokeStyle='#aaa17b';c.lineWidth=1;c.strokeRect(x+5,y+5,246,54)
   let font=30;do{c.font='600 '+font+'px sans-serif';font--}while(c.measureText(this.labels[i]).width>236&&font>12)
   c.fillStyle='#f0edd9';c.fillText(this.labels[i],x+128,y+32)
  }
  this.atlas=new THREE.CanvasTexture(canvas);this.atlas.colorSpace=THREE.SRGBColorSpace;this.atlas.anisotropy=4
 }
 material(surface:string,color:string,baked=true):THREE.Material{
  const key=surface+'|'+color+'|'+baked,old=this.materials.get(key);if(old)return old
  let mat:THREE.Material
  if(surface==='label')mat=new THREE.MeshBasicMaterial({map:this.atlas,toneMapped:false})
  else if(surface==='emitter')mat=new THREE.MeshBasicMaterial({color:new THREE.Color(color).multiplyScalar(2.7),toneMapped:false})
  else{
   const scans:Record<string,string>={tile:'settlements/tiles',ceiling:'settlements/ceiling',acoustic:'alpha/plaster',terrazzo:'alpha/terrazzo',steel:'alpha/steel',cardboard:'alpha/cardboard',fabric:'settlements/fabric',wood:'alpha/wood',stone:'l11_limestone',metal:'l11_metal',brass:'alpha/steel',concrete:'l11_concrete',plaster:'l11_plaster'}
   const printed=surface==='dressingprint',texture=printed?'traders/dressing':scans[surface]??'l11_plaster',folder=texture.includes('/'),plain=['rubber','paint','screen','paper','leaf','glass','frosted','ceramic','water','mirror'].includes(surface)
   const roughness=surface==='mirror'?.20:surface==='ceramic'?.25:surface==='water'?.15:surface==='frosted'?.64:surface==='glass'?.16:surface==='steel'?.38:surface==='brass'?.34:surface==='terrazzo'?.36:surface==='stone'?.53:surface==='tile'?.52:surface==='fabric'?.94:.78
   mat=litMaterial({color,roughness,metalness:surface==='mirror'?.92:surface==='steel'||surface==='metal'?.58:surface==='brass'?.72:0,
    ...(plain?{}:{map:l1Texture(texture+(folder?'_color.jpg':'.jpg')),normalMap:l1Texture(texture+(folder?'_normalgl.jpg':'_normal.jpg'),true),normalScale:new THREE.Vector2(surface==='fabric'?.25:surface==='plaster'?.09:.18,surface==='fabric'?.25:surface==='plaster'?.09:.18),
     ...(getMaterialMode()==='realistic'?{roughnessMap:l1Texture(texture+'_roughness.jpg',true)}:{})}),
    ...(surface==='glass'?{transparent:true,opacity:.13,depthWrite:false,side:THREE.DoubleSide,forceSinglePass:true}:{}),
    ...(surface==='screen'?{emissive:'#7a9e9c',emissiveIntensity:.16}:{})})
   mat.onBeforeCompile=shader=>{
    if(surface==='cardboard')shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>','#include <map_fragment>\ndiffuseColor.rgb=mix(diffuse*.92,diffuseColor.rgb,.23);')
    if(surface==='plaster')shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>','#include <map_fragment>\ndiffuseColor.rgb=mix(diffuse*.92,diffuseColor.rgb,.46);')
    if(surface==='acoustic'||surface==='terrazzo')shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`#include <map_fragment>
     ${surface==='terrazzo'?'diffuseColor.rgb=mix(diffuse*.94,diffuseColor.rgb,.60);':''}
     vec2 panelUV=vMapUv*vec2(${surface==='acoustic'?'4.0,2.0':'2.0,2.0'});
     vec2 panelEdge=min(fract(panelUV),1.0-fract(panelUV));
     vec2 panelAA=max(fwidth(panelUV),vec2(.0001));
     vec2 panelJoint=1.0-smoothstep(vec2(.002),vec2(.002)+panelAA,panelEdge);
     diffuseColor.rgb*=1.0-max(panelJoint.x,panelJoint.y)*${surface==='acoustic'?'.30':'.14'};
    `)
    shader.fragmentShader=shader.fragmentShader.replace('#include <roughnessmap_fragment>','#include <roughnessmap_fragment>\nroughnessFactor=max(roughnessFactor,'+(printed?.18:Math.max(.25,roughness-.14)).toFixed(2)+');')
   }
   mat.customProgramCacheKey=()=>'traders-fitout-pbr-1-'+surface
   if(baked)applyTradersBake(mat)
  }
  mat.userData.tradersShared=true;mat.userData.l1Owned=false
  this.materials.set(key,mat);return mat
 }
 labelGeometry(text:string,width:number,height:number){
  let i=this.labels.indexOf(text);if(i<0)i=this.labels.indexOf('商人之家 / TRADERS KEEP')
  const geo=new THREE.PlaneGeometry(width,height),uv=geo.getAttribute('uv')
  for(let j=0;j<uv.count;j++)uv.setXY(j,(i%8*256+5+uv.getX(j)*246)/2048,1-(Math.floor(i/8)*64+4+(1-uv.getY(j))*56)/2048)
  return geo
 }
 dispose(){for(const m of this.materials.values())m.dispose();this.materials.clear();this.atlas.dispose()}
}
interface Bucket{material:THREE.Material;geometries:THREE.BufferGeometry[]}
export class Builder{
 readonly buckets=new Map<THREE.Material,Bucket>()
 readonly assets:TradersAssets
 constructor(assets:TradersAssets){this.assets=assets}
 add(geo:THREE.BufferGeometry,mat:THREE.Material,uv=true){
  if(uv)l1WorldUV(geo,0,0,.42)
  let b=this.buckets.get(mat);if(!b){b={material:mat,geometries:[]};this.buckets.set(mat,b)}b.geometries.push(geo)
 }
 box(x:number,y:number,z:number,w:number,h:number,d:number,surface:string,color:string,baked=true,rotation=0){
  if(w<.001||h<.001||d<.001)return
  const geo=new THREE.BoxGeometry(w,h,d,Math.min(32,Math.max(1,Math.ceil(w))),Math.min(12,Math.max(1,Math.ceil(h))),Math.min(32,Math.max(1,Math.ceil(d))))
  if(rotation)geo.rotateY(rotation);geo.translate(x+w/2,y+h/2,z+d/2);this.add(geo,this.assets.material(surface,color,baked))
 }
 label(text:string,x:number,y:number,z:number,w:number,h:number,angle=0){
  const geo=this.assets.labelGeometry(text,w,h);geo.rotateY(angle);geo.translate(x,y,z);this.add(geo,this.assets.material('label','#ffffff',false),false)
 }
 *finish(parent:THREE.Group):Generator<void,void,unknown>{
  for(const b of this.buckets.values()){
   if(!b.geometries.length)continue
   const geo=mergeGeometries(b.geometries,false);b.geometries.forEach(g=>g.dispose())
   if(!geo)throw Error('Traders geometry merge')
   if(b.material.userData.tradersBaked)yield* bakeTradersGeometry(geo)
   const mesh=new THREE.Mesh(geo,b.material);mesh.castShadow=mesh.receiveShadow=b.material.userData.tradersBaked===true
   parent.add(mesh);yield
  }
  this.buckets.clear()
 }
 dispose(){for(const b of this.buckets.values())for(const g of b.geometries)g.dispose();this.buckets.clear()}
}
function floorColor(kind:string){return kind==='street'?'#c9bca0':kind==='vault'?'#9da29d':kind==='office'||kind==='dorm'?'#b8b4a1':kind==='logistics'||kind==='rail'||kind==='dock'?'#8e9693':'#c2c3b8'}
function ceilingColor(kind:string){return kind==='street'?'#b9aa8c':kind==='vault'?'#b2b3a6':kind==='office'||kind==='dorm'?'#c5c5b9':'#777d74'}
function clip(a:TradersRect,b:TradersRect){const x=Math.max(a.x,b.x),y=Math.max(a.y,b.y);return{x,y,w:Math.min(a.x+a.w,b.x+b.w)-x,h:Math.min(a.y+a.h,b.y+b.h)-y}}
function cuts(lo:number,hi:number,axis:'x'|'y'){
 const values=new Set<number>([lo,hi])
 for(let p=Math.ceil(lo);p<hi;p++)values.add(p)
 for(const r of TRADERS_ZONES){for(const p of [r[axis],r[axis]+(axis==='x'?r.w:r.h),...(r.kind==='hall'&&((axis==='x')===(r.w<r.h))?[r[axis]+(axis==='x'?r.w:r.h)*.36,r[axis]+(axis==='x'?r.w:r.h)*.64]:[])])if(p>lo+.0001&&p<hi-.0001)values.add(p)}
 return [...values].sort((a,b)=>a-b)
}
function panel(points:number[],normals:number[]){
 const geo=new THREE.BufferGeometry()
 const index=[0,1,2,0,2,3];geo.setIndex(index);geo.setAttribute('position',new THREE.Float32BufferAttribute(points,3));geo.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));geo.setAttribute('uv',new THREE.Float32BufferAttribute(new Float32Array(8),2));return geo
}
function roofHeight(zone:TradersZone|undefined,x:number,z:number){
 if(zone?.kind!=='street')return zone?.height??4.8
 const t=zone.w>zone.h?(z-zone.y)/zone.h:(x-zone.x)/zone.w
 return 4.8+2.4*Math.sqrt(Math.max(0,1-(Math.max(0,Math.min(1,t))*2-1)**2))
}
/** Sample the neighbour at the edge interior: a corner belongs to several
 * regions and must not grow a triangular fascia across an unchanged roof. */
export function tradersCeilingStep(ax:number,az:number,bx:number,bz:number,dx:number,dz:number,h0:number,h1:number){
 const neighbour=tradersZoneAt((ax+bx)/2+dx*.006,(az+bz)/2+dz*.006)
 const nh0=roofHeight(neighbour,ax,az),nh1=roofHeight(neighbour,bx,bz)
 if(Math.max(h0-nh0,h1-nh1)<.06)return null
 return{points:[ax,Math.min(nh0,h0),az,bx,Math.min(nh1,h1),bz,bx,h1,bz,ax,h0,az],normals:Array.from({length:4},()=>[-dx,0,-dz]).flat()}
}
function ceilingNormal(zone:TradersZone|undefined,x:number,z:number){
 const e=.012,dx=(roofHeight(zone,x+e,z)-roofHeight(zone,x-e,z))/(2*e),dz=(roofHeight(zone,x,z+e)-roofHeight(zone,x,z-e))/(2*e)
 const n=new THREE.Vector3(dx,-1,dz).normalize();return[n.x,n.y,n.z]
}
function roomFront(r:TradersRoom){return{x:r.side==='w'?r.x:r.side==='e'?r.x+r.w:r.x+r.w/2,z:r.side==='n'?r.y:r.side==='s'?r.y+r.h:r.y+r.h/2,angle:r.side==='n'?Math.PI:r.side==='e'?Math.PI/2:r.side==='w'?-Math.PI/2:0}}
const tradersMetresLocal=(n:number)=>4+n*.6
function owned(r:TradersRect,x:number,y:number){return tradersContains(r,x,y)}

export function* buildTradersArchitecture(m:GameMap,c:TradersChunk,parent:THREE.Group,assets:TradersAssets):Generator<void,void,unknown>{
 const b=new Builder(assets),r=clip(c.bounds,TRADERS_BOUNDS),xs=cuts(r.x,r.x+r.w,'x'),zs=cuts(r.y,r.y+r.h,'y')
 try{
  for(let zi=0;zi<zs.length-1;zi++){
   for(let xi=0;xi<xs.length-1;xi++){
    const x0=xs[xi],x1=xs[xi+1],z0=zs[zi],z1=zs[zi+1],mx=(x0+x1)/2,mz=(z0+z1)/2,zone=tradersZoneAt(mx,mz)
    const geo=panel([x0,0,z0,x0,0,z1,x1,0,z1,x1,0,z0],[0,1,0,0,1,0,0,1,0,0,1,0]);b.add(geo,assets.material(zone?.kind==='vault'||zone?.kind==='logistics'||zone?.kind==='rail'?'concrete':zone?.kind==='street'?'stone':'terrazzo',zone?.kind==='hall'?(((zone.w>zone.h?(mz-zone.y)/zone.h:(mx-zone.x)/zone.w)>.36&&(zone.w>zone.h?(mz-zone.y)/zone.h:(mx-zone.x)/zone.w)<.64)?'#b0bab3':'#c9c6b7'):floorColor(zone?.kind??'hall')))
    const pts=[[x0,z0],[x1,z0],[x1,z1],[x0,z1]]
    const cp:number[]=[],cn:number[]=[]
    for(const [x,z] of pts){cp.push(x,roofHeight(zone,x,z),z);cn.push(...(zone?.kind==='street'?ceilingNormal(zone,x,z):[0,-1,0]))}
    b.add(panel(cp,cn),assets.material(zone?.kind==='street'?'plaster':'acoustic',ceilingColor(zone?.kind??'hall')))
    // A real fascia closes each change in ceiling elevation, including arch ends.
    for(const [a,d,dx,dz] of [[0,1,0,-1],[1,2,1,0],[2,3,0,1],[3,0,-1,0]]){
     const step=tradersCeilingStep(cp[a*3],cp[a*3+2],cp[d*3],cp[d*3+2],dx,dz,cp[a*3+1],cp[d*3+1])
     if(step)b.add(panel(step.points,step.normals),assets.material('plaster','#bab6a6'))
    }
   }yield
  }
  for(const w of TRADERS_WALLS)if(tradersIntersects(w,c.bounds)){
   const a=clip(w,c.bounds);b.box(a.x,w.bottom,a.y,a.w,w.height,a.h,'plaster',w.surface==='vault'?'#c5c4b5':'#c9cbc1')
   if(w.bottom<.01&&w.height>2){
    b.box(a.x-.012,.04,a.y-.012,a.w+.024,1.02,a.h+.024,w.surface==='vault'?'concrete':'stone',w.surface==='vault'?'#8d9994':'#b7af96')
    b.box(a.x-.02,1.07,a.y-.02,a.w+.04,.045,a.h+.04,'brass','#938564')
    b.box(a.x-.015,w.height-.19,a.y-.015,a.w+.03,.14,a.h+.03,'plaster','#d5d0bd')
   }
   yield
  }
  for(const rib of tradersRibs(c.bounds)){
   const points:THREE.Vector3[]=[]
   for(let i=0;i<=24;i++){const t=Math.PI*i/24,offset=Math.cos(t)*(rib.span/2-.18),h=4.8+2.4*Math.sin(t);points.push(new THREE.Vector3(rib.x+(rib.horizontal?0:offset),h,rib.y+(rib.horizontal?offset:0)))}
   const geo=new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points),24,.22,6,false);b.add(geo,assets.material('stone','#b8ac92'))
   for(const side of rib.post?[-1,1]:[])b.box(rib.x+(rib.horizontal?0:side*(rib.span/2-.18))-.21,0,rib.y+(rib.horizontal?side*(rib.span/2-.18):0)-.21,.42,4.8,.42,'plaster','#c4bea9')
   yield
  }
  for(const s of tradersHallPosts())if(tradersContains(c.bounds,s.x+s.w/2,s.y+s.h/2)){
   b.box(s.x,0,s.y,s.w,Number(s.data?.height??4.8),s.h,'plaster','#bbc4bc')
   b.box(s.x-.01,.08,s.y-.01,s.w+.02,.96,s.h+.02,'metal','#35453f');yield
  }
  for(const room of TRADERS_ROOMS){
   if(room.kind==='shop'||room.kind==='anchor')continue // Detailed facade owns its sign, trim and lighting.
   const f=roomFront(room);if(!owned(c.bounds,f.x,f.z))continue
   const height=room.kind==='vault'?2.94:Math.min(3.45,room.height-.13),labelHeight=room.height<=3.3?.22:.65
   const normal=new THREE.Vector3(Math.sin(f.angle),0,Math.cos(f.angle))
   b.label(room.name,f.x+normal.x*.13,height,f.z+normal.z*.13,room.kind==='vault'?1.05:2.8,room.kind==='vault'?.26:labelHeight,f.angle)
   const w=room.doorWidth
   for(const side of [-1,1]){
    const offset=side*(w/2+.06)
    const x=f.x+Math.cos(f.angle)*offset,z=f.z-Math.sin(f.angle)*offset
    b.box(x-.045,0,z-.045,.09,room.kind==='vault'?2.75:Math.min(3.1,room.height-.10),.09,'metal','#8b9593')
   }
  }
  for(const l of c.lights){
   const h=(l.fixZ??4.6),zone=tradersZoneAt(l.x,l.y),vault=zone?.kind==='vault'
   b.box(l.x-.65,h-.015,l.y-.30,1.3,.10,.60,'metal','#7c8581')
   b.box(l.x-.59,h-.055,l.y-.245,1.18,.04,.49,'plaster','#b5b9af')
   for(let tube=0;tube<4;tube++)b.box(l.x-.53,h-.08,l.y-.20+tube*.125,1.06,.034,.055,'emitter',l.color,false)
   if(vault)b.box(l.x-.7,h+.09,l.y-.035,1.4,.045,.07,'metal','#787e7b')
   yield
  }
  for(const s of c.structures)if(isTradeKind(s.kind)&&s.kind!=='trade_anomaly'&&!s.data?.tradersModel){
   const theta=Number(s.data?.deg??0)*Math.PI/180,cos=Math.cos(theta),sin=Math.sin(theta)
   for(const p of tradeParts(s)){
    const lx=p.x+p.w/2-s.w/2,lz=p.y+p.d/2-s.h/2,x=s.x+s.w/2+lx*cos+lz*sin,z=s.y+s.h/2-lx*sin+lz*cos
    if(p.text)b.label(p.text,x,p.z+p.h/2,z+p.d/2+.01,p.w,p.h,theta)
    else if(p.shape==='wheel'){
     const g=new THREE.CylinderGeometry(p.w/2,p.w/2,p.d,10);g.rotateX(Math.PI/2);g.rotateY(theta);g.translate(x,p.z+p.h/2,z);b.add(g,assets.material(p.surface,p.color))
    }else b.box(x-p.w/2,p.z,z-p.d/2,p.w,p.h,p.d,p.surface==='paint'?'plaster':p.surface,p.color,true,theta)
   }
   yield
  }
  for(const [text,x,z,angle] of [['公共服务 / SERVICES',tradersMetresLocal(115),tradersMetresLocal(175),-Math.PI/2],['商人之家 / TRADERS KEEP',tradersMetresLocal(110),tradersMetresLocal(155),0],['保险库登记',tradersMetresLocal(350),tradersMetresLocal(220),0]] as const){
   if(owned(c.bounds,x,z)){b.box(x-2.6,3.42,z-.11,5.2,.75,.22,'metal','#33463f',true,angle);b.label(text,x+Math.sin(angle)*.12,3.8,z+Math.cos(angle)*.12,5,.62,angle)}
  }
  // Transport remains architectural only; no new destination or automatic travel.
  for(const [id,text] of [['rail_terminal','L2 铁路 · 未开通'],['dock','补给连接 · 未开通']] as const){
   const room=TRADERS_ROOMS.find(r=>r.id===id)!,x=room.x+room.w/2,z=room.y+1
   if(owned(c.bounds,x,z))b.label(text,x,2.5,z,4.2,.8,0)
  }
  yield* buildTradersArchitectureDetails(b,c.bounds)
  yield* b.finish(parent)
 }finally{b.dispose()}
 void m
}
export function buildTradersRoundTable(s:Structure,assets:TradersAssets){
 const root=new THREE.Group();root.userData.tradersOwnGeometry=true;root.position.set(s.x+s.w/2,0,s.y+s.h/2)
 const top=new THREE.Mesh(new THREE.CylinderGeometry(.55,.55,.045,20),assets.material('wood','#d2c7b0'))
 top.position.y=.735;root.add(top)
 const pole=new THREE.Mesh(new THREE.CylinderGeometry(.045,.065,.69,8),assets.material('metal','#737e7b'));pole.position.y=.355;root.add(pole)
 const base=new THREE.Mesh(new THREE.CylinderGeometry(.28,.34,.035,12),assets.material('metal','#697572'));base.position.y=.02;root.add(base)
 return root
}
/** Per-instance geometry / materials remain independent of cached prop factories. */
export function* bakeTradersProp(root:THREE.Object3D,assets:TradersAssets):Generator<void,void,unknown>{
 root.updateMatrixWorld(true)
 // Compact furniture has six directional samples. Long shelves/counters use
 // a 3 by 3 set along their length and height, retaining the lighting gradient
 // without tracing every bevel, box corner, binder and label independently.
 const bounds=new THREE.Box3().setFromObject(root),size=bounds.getSize(new THREE.Vector3()),center=bounds.getCenter(new THREE.Vector3())
 const sample=(at:THREE.Vector3):TradersProbe=>[[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]].map(([x,y,z])=>tradersIrradiance(at.x,at.y,at.z,x,y,z))
 let probe:TradersProbe|TradersProbeField|undefined
 if(Math.max(size.x,size.y,size.z)<=3)probe=sample(center)
 else if(Math.max(size.x,size.z)<=8.2&&Math.min(size.x,size.z)<=3&&size.y<=3){
  const axis=size.x>=size.z?'x':'z',span=size[axis],low=bounds.min[axis]+span/6,high=bounds.max[axis]-span/6
  const bottom=bounds.min.y+Math.min(.10,size.y*.1),top=bounds.max.y-Math.min(.10,size.y*.1),rows=[0,.5,1].map(h=>[0,.5,1].map(k=>{const at=center.clone();at[axis]=low+(high-low)*k;at.y=bottom+(top-bottom)*h;return sample(at)}))
  probe={axis,low,high,probes:rows[0],bottom,top,rows}
 }
 const meshes:THREE.Mesh[]=[]
 root.traverse(o=>{if((o as THREE.Mesh).isMesh)meshes.push(o as THREE.Mesh)})
 for(const mesh of meshes){
  if((mesh as THREE.InstancedMesh).isInstancedMesh)continue
  const original=mesh.geometry;if(!root.userData.tradersOwnGeometry)mesh.geometry=original.clone()
  const convert=(source:THREE.Material)=>{
   if(source.userData.tradersShared)return source
   const key='prop|'+materialBatchKey(source)
   let mat=assets.materials.get(key);if(mat)return mat
   mat=source.clone();mat.onBeforeCompile=source.onBeforeCompile;mat.customProgramCacheKey=source.customProgramCacheKey;applyTradersBake(mat)
   mat.userData.l1Owned=false;mat.userData.tradersShared=true;assets.materials.set(key,mat);return mat
  }
  mesh.material=Array.isArray(mesh.material)?mesh.material.map(convert):convert(mesh.material)
  yield* bakeTradersGeometry(mesh.geometry,mesh.matrixWorld,probe)
  yield
 }
}
export const tradersVaultCellCount=TRADERS_VAULT_CELLS.length

export function buildTradersShutter(s:Structure,assets:TradersAssets){
 const root=new THREE.Group(),width=Math.max(s.w,s.h),height=Number(s.data?.height??2.7)
 root.position.set(s.x+s.w/2,0,s.y+s.h/2);root.rotation.y=(s.data?.axis==='y'?Math.PI/2:0)+(Number(s.data?.face??1)<0?Math.PI:0)
 const geometry=new THREE.BufferGeometry(),p:number[]=[],uv:number[]=[],indices:number[]=[],steps=Math.ceil(height/.035)
 for(let row=0;row<=steps;row++){
  const y=height*row/steps,z=.026+Math.sin(y/.085*Math.PI*2)*.014
  p.push(-width/2,y,z,width/2,y,z);uv.push(0,y*.42,width*.42,y*.42)
  if(row<steps){const i=row*2;indices.push(i,i+1,i+3,i,i+3,i+2)}
 }
 geometry.setAttribute('position',new THREE.Float32BufferAttribute(p,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geometry.setIndex(indices);geometry.computeVertexNormals()
 const material=assets.material('metal','#b9bfbb',false),front=new THREE.Mesh(geometry,material);front.userData.lid=1;front.castShadow=front.receiveShadow=true;root.add(front)
 const backing=new THREE.BoxGeometry(width,height,.055);backing.translate(0,height/2,-.025)
 const back=new THREE.Mesh(backing,material);back.userData.lid=1;root.add(back)
 const frame=new THREE.Mesh(new THREE.BoxGeometry(width+.20,.19,.22),assets.material('metal','#919e96',false));frame.position.y=height+.10;root.add(frame)
 for(const side of [-1,1]){const guide=new THREE.Mesh(new THREE.BoxGeometry(.055,height,.11),assets.material('steel','#9ba79b',false));guide.position.set(side*(width/2+.04),height/2,.03);root.add(guide)}
 const hardware=(x:number,y:number,z:number,w:number,h:number,d:number)=>{const g=new THREE.BoxGeometry(w,h,d);g.translate(x,y,z);const mesh=new THREE.Mesh(g,assets.material('steel','#b8bfb3',false));mesh.userData.lid=1;root.add(mesh)}
 hardware(0,.055,.065,width,.075,.07)
 for(const side of [-1,1])hardware(side*.18,.76,.09,.035,.15,.08)
 hardware(0,.76,.135,.39,.035,.035)
 hardware(width*.28,.26,.10,.075,.14,.05)
 const open=Number(s.data?.open??0)>0?1:0;root.userData.open=open;root.userData.rollerLift=height*.8
 root.traverse(o=>{if(o.userData.lid){o.position.y=open*height*.8;o.scale.y=1-open*.8}})
 return root
}
export function buildTradersCargo(s:Structure,assets:TradersAssets){
 const root=new THREE.Group(),height=Number(s.data?.height??.9),x=s.x+s.w/2,z=s.y+s.h/2
 root.userData.tradeOrigin={x:s.x,y:s.y}
 const mesh=new THREE.Mesh(new THREE.BoxGeometry(s.w,height,s.h),assets.material('wood','#b9a686',false));mesh.position.set(x,height/2,z);root.add(mesh)
 const strap=new THREE.Mesh(new THREE.BoxGeometry(.10,height+.012,s.h+.012),assets.material('metal','#71816e',false));strap.position.set(x,height/2,z);root.add(strap)
 const label=new THREE.Mesh(assets.labelGeometry(String(s.data?.label??''),s.w-.18,.26),assets.material('label','#ffffff',false));label.position.set(x,height*.62,z+s.h/2+.008);root.add(label)
 return root
}
