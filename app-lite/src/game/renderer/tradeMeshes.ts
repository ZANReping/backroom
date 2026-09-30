import * as THREE from 'three'
import type {Structure} from '../core/types'
import {tradeParts,isTradeKind,type TradePart} from '../content/tradeDecor'
import {l1Texture} from './l1Materials'
import {litMaterial} from './shared'
function* buildJob(structs:Structure[],parent:THREE.Group,batching:boolean):Generator<void,void,unknown>{
 const materials=new Map<string,THREE.Material>(),geo=new THREE.BoxGeometry(1,1,1),parts:{s:Structure;p:TradePart}[]=[]
 for(const s of structs){for(const p of tradeParts(s))parts.push({s,p});yield}
 const texts=[...new Set(parts.flatMap(({p})=>p.text?[p.text]:[]))],canvas=document.createElement('canvas');canvas.width=2048;canvas.height=Math.max(128,Math.ceil(texts.length/4)*128)
 const ctx=canvas.getContext('2d')!;ctx.font='bold 30px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle'
 for(const [i,t] of texts.entries()){const x=i%4*512,y=Math.floor(i/4)*128;ctx.fillStyle='#f1d896';ctx.fillRect(x,y,512,128);ctx.fillStyle='#253e35';ctx.fillText(t,x+256,y+64,495);yield}
 const atlas=new THREE.CanvasTexture(canvas);atlas.colorSpace=THREE.SRGBColorSpace
 const labelMat=new THREE.MeshBasicMaterial({map:atlas,side:THREE.DoubleSide});labelMat.userData.l1Owned=true;labelMat.userData.settlementLabelTexture=true
 function mat(p:TradePart){const key=p.surface+p.color;if(materials.has(key))return materials.get(key)!
  const prefix={concrete:'l11_concrete',wood:'l11_wood',metal:'l11_metal',tile:'settlements/tiles',fabric:'settlements/fabric'}[p.surface as 'wood']
  const suffix=(v:string)=>prefix.startsWith('settlements/')?'_'+(v==='normal'?'normalgl':v)+'.jpg':(v==='color'?'':'_'+v)+'.jpg'
  const material=litMaterial({color:p.color,roughness:p.surface==='metal'?.55:.85,metalness:p.surface==='metal'?.3:0,...(prefix?{map:l1Texture(prefix+suffix('color')),normalMap:l1Texture(prefix+suffix('normal'),true),normalScale:new THREE.Vector2(.12,.12),roughnessMap:l1Texture(prefix+suffix('roughness'),true)}:{})})
  if(p.surface==='glass'){material.transparent=true;material.opacity=.25;material.depthWrite=false}material.userData.l1Owned=true;materials.set(key,material);return material
 }
 const buckets=new Map<string,{p:TradePart;s:Structure;matrix:THREE.Matrix4}[]>()
 let partCount=0
 for(const {s,p} of parts){
  if(++partCount%8===0)yield
  const turn=Number(s.data?.deg??0)*Math.PI/180,q=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),turn)
  const position=new THREE.Vector3(p.x+p.w/2-s.w/2,p.z+p.h/2,p.y+p.d/2-s.h/2).applyQuaternion(q).add(new THREE.Vector3(s.x+s.w/2,0,s.y+s.h/2))
  const matrix=new THREE.Matrix4().compose(position,q,new THREE.Vector3(p.w,p.h,p.d))
  if(!p.shape&&!p.text&&batching){const key=Math.floor(s.x/16)+':'+Math.floor(s.y/16)+':'+p.surface+p.color;const list=buckets.get(key)??[];list.push({p,s,matrix});buckets.set(key,list);continue}
  let mesh:THREE.Mesh
  if(p.shape==='arch'){
   const shape=new THREE.Shape(),rx=p.w/2,ry=p.h
   for(let i=0;i<=32;i++){const t=Math.PI-i*Math.PI/32,x=Math.cos(t)*rx,y=Math.sin(t)*ry;if(i===0)shape.moveTo(x,y);else shape.lineTo(x,y)}
   for(let i=32;i>=0;i--){const t=Math.PI-i*Math.PI/32;shape.lineTo(Math.cos(t)*(rx-.2),Math.sin(t)*(ry-.2))}
   shape.closePath();const g=new THREE.ExtrudeGeometry(shape,{depth:p.d,bevelEnabled:false,curveSegments:16});g.translate(0,-p.h/2,-p.d/2)
   mesh=new THREE.Mesh(g,mat(p));mesh.position.copy(position);mesh.quaternion.copy(q)
  }else if(p.shape==='wheel'){const g=new THREE.CylinderGeometry(.5,.5,1,12);g.rotateX(Math.PI/2);mesh=new THREE.Mesh(g,mat(p));mesh.applyMatrix4(matrix)}
  else{mesh=new THREE.Mesh(geo,mat(p));mesh.applyMatrix4(matrix)}
  parent.add(mesh)
  if(p.text){
   const i=texts.indexOf(p.text),g=new THREE.PlaneGeometry(p.w,p.h),uv=g.getAttribute('uv')
   for(let j=0;j<uv.count;j++)uv.setXY(j,(i%4+uv.getX(j))/4,1-(Math.floor(i/4)+1-uv.getY(j))*128/canvas.height)
   for(const sign of [-1,1]){const label=new THREE.Mesh(g,labelMat);label.position.copy(position).add(new THREE.Vector3(0,0,sign*(p.d/2+.012)).applyQuaternion(q));label.quaternion.copy(q);if(sign<0)label.rotateY(Math.PI);parent.add(label)}
  }
 }
 for(const items of buckets.values()){const mesh=new THREE.InstancedMesh(geo,mat(items[0].p),items.length);items.forEach((e,i)=>mesh.setMatrixAt(i,e.matrix));mesh.computeBoundingSphere();parent.add(mesh);yield}
 if(!texts.length){atlas.dispose();labelMat.dispose()}
}
export function* buildTradeBatchJob(structs:Structure[],parent:THREE.Group):Generator<void,void,unknown>{yield* buildJob(structs.filter(s=>isTradeKind(s.kind)&&s.kind!=='trade_anomaly'),parent,true)}
const drain=(job:Generator<void,void,unknown>)=>{for(let r=job.next();!r.done;r=job.next()){}
}
export function buildTradeDecor(s:Structure){const g=new THREE.Group();g.userData.tradeOrigin={x:s.x,y:s.y};if(isTradeKind(s.kind))drain(buildJob([s],g,false));return g}
export function buildTradeBatch(structs:Structure[],parent:THREE.Group){drain(buildTradeBatchJob(structs,parent))}
