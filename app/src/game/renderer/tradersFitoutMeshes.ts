import {tradersLocalStructure} from '../content/tradersDressingShapes'
import {buildTradersDressing} from './tradersDressingMeshes'
import * as THREE from 'three'
import {RoundedBoxGeometry} from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import {mergeGeometries} from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import type {Structure} from '../core/types'
import type {TradersAssets} from './tradersMeshes'
import type {TradersModel} from '../content/tradersFitout'
import {l1WorldUV} from './l1Materials'

/** Small authored objects: closed silhouettes, real thickness and shared scanned PBR. */
class Parts{
 readonly assets:TradersAssets
 buckets=new Map<THREE.Material,THREE.BufferGeometry[]>()
 constructor(assets:TradersAssets){this.assets=assets}
 add(g:THREE.BufferGeometry,surface:string,color:string,uv=true){if(g.index){const flat=g.toNonIndexed();g.dispose();g=flat}if(uv)l1WorldUV(g,0,0,surface==='wood'?.7:surface==='fabric'?1.5:.6);const mat=this.assets.material(surface,color);const a=this.buckets.get(mat)??[];a.push(g);this.buckets.set(mat,a)}
 box(x:number,y:number,z:number,w:number,h:number,d:number,surface:string,color:string,round=0){const g=round?new RoundedBoxGeometry(w,h,d,1,Math.min(round,w/4,h/4,d/4)):new THREE.BoxGeometry(w,h,d);g.translate(x,y,z);this.add(g,surface,color)}
 cylinder(x:number,y:number,z:number,r:number,h:number,surface:string,color:string,r2=r){const g=new THREE.CylinderGeometry(r,r2,h,12);g.translate(x,y,z);this.add(g,surface,color)}
 rod(a:THREE.Vector3,b:THREE.Vector3,r:number,surface:string,color:string){const delta=b.clone().sub(a),g=new THREE.CylinderGeometry(r,r,delta.length(),8);g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),delta.normalize()));g.translate((a.x+b.x)/2,(a.y+b.y)/2,(a.z+b.z)/2);this.add(g,surface,color)}
 label(text:string,x:number,y:number,z:number,w:number,h:number,angle=0){const g=this.assets.labelGeometry(text,w,h);g.rotateY(angle);g.translate(x,y,z);const mat=this.assets.material('label','#ffffff',false),a=this.buckets.get(mat)??[];a.push(g);this.buckets.set(mat,a)}
 print(tile:number,x:number,y:number,z:number,w:number,h:number,angle=0){const g=new THREE.PlaneGeometry(w,h);g.rotateY(angle);g.translate(x,y,z);const uv=g.getAttribute('uv');for(let i=0;i<uv.count;i++)uv.setXY(i,(tile%4*256+8+uv.getX(i)*240)/1024,1-(Math.floor(tile/4)*256+8+(1-uv.getY(i))*240)/1024);this.add(g,'dressingprint','#ffffff',false)}
 finish(root:THREE.Group){for(const [material,parts] of this.buckets){const g=mergeGeometries(parts);for(const part of parts)part.dispose();if(!g)throw Error('Fit-out material layout mismatch');const m=new THREE.Mesh(g,material);m.castShadow=m.receiveShadow=true;root.add(m)}this.buckets.clear()}
}
const steel='#8f9996',dark='#26332f',wood='#b7a082',brass='#a39062',paper='#ddd7c4'
function chair(p:Parts,x:number,z:number,office=false){
 p.box(x,.45,z,.54,.09,.49,'fabric',office?'#475853':'#425e64',.025)
 p.box(x,.76,z+.22,.54,.48,.055,'fabric',office?'#475853':'#425e64',.02)
 if(office){p.cylinder(x,.23,z,.055,.42,'steel',steel);for(let i=0;i<5;i++){const a=i*Math.PI*2/5;p.rod(new THREE.Vector3(x,.08,z),new THREE.Vector3(x+Math.cos(a)*.31,.08,z+Math.sin(a)*.31),.018,'steel',dark);p.cylinder(x+Math.cos(a)*.31,.045,z+Math.sin(a)*.31,.036,.065,'rubber','#303633')}}
 else for(const dx of [-.2,.2])for(const dz of [-.19,.19])p.box(x+dx,.23,z+dz,.035,.43,.035,'steel',steel)
}
function screen(p:Parts,x:number,y:number,z:number,w=.6,facing=1){
 p.box(x,y,z,w,.38,.045,'rubber',dark,.018);p.box(x,y+.01,z+.025*facing,w-.055,.31,.006,'screen','#a1b8a4')
 p.print(5,x,y+.01,z+.029*facing,w-.06,.28,facing<0?Math.PI:0)
 p.box(x,y-.28,z,.045,.22,.055,'steel',dark);p.box(x,y-.39,z,.29,.024,.18,'steel',steel)
}
function desk(p:Parts,x:number,z:number){
 p.box(x,.745,z,2.4,.065,1.08,'wood',wood,.018)
 for(const dx of [-1.05,1.05]){p.box(x+dx,.36,z,.055,.72,.82,'steel',dark);p.box(x+dx,.035,z,.42,.04,.9,'steel',steel)}
 p.box(x-.76,.41,z-.04,.43,.64,.68,'paint','#b3b1a2');for(let i=0;i<3;i++){p.box(x-.76,.25+i*.18,z+.315,.40,.015,.012,'rubber','#656a61');p.box(x-.76,.29+i*.18,z+.33,.12,.015,.025,'steel',steel)}
 screen(p,x+.2,1.18,z-.20)
 p.box(x+.12,.795,z+.22,.64,.026,.19,'rubber','#3e4941',.007)
 for(let row=0;row<3;row++)p.box(x+.12,.811,z+.16+row*.045,.55,.004,.008,'steel','#90968b')
 p.box(x+.65,.785,z+.2,.15,.015,.2,'rubber','#58655f',.012)
 p.box(x-.54,.81,z+.16,.28,.06,.37,'paper',paper)
 for(let i=0;i<3;i++)p.box(x-.56,.846+i*.012,z+.16,.25,.009,.32,'paper',i%2?paper:'#b6bcab')
 p.cylinder(x-.90,.84,z+.26,.045,.15,'steel',steel)
 p.rod(new THREE.Vector3(x+.1,.72,z-.40),new THREE.Vector3(x+.1,.12,z-.40),.013,'rubber','#313c37')
 chair(p,x,z+.88,true)
}
function plant(p:Parts,w=1.05){
 p.box(0,.3,0,w,.6,w,'stone','#c5bba4',.025);p.box(0,.61,0,w-.05,.055,w-.05,'stone','#a69b82')
 p.box(0,.635,0,w-.13,.025,w-.13,'concrete','#3c3b2c')
 for(let i=0;i<5;i++){
  const a=i*2.4,tip=new THREE.Vector3(Math.sin(a)*w*.34,1.15+(i%3)*.16,Math.cos(a)*w*.34);p.rod(new THREE.Vector3(0,.64,0),tip,.014,'wood','#665d39')
  for(let side=-1;side<=1;side+=2){const c=tip.clone().add(new THREE.Vector3(side*.12,-.09,.05)),g=new THREE.SphereGeometry(.18,6,4);g.scale(1,.34,1.5);g.rotateZ(side*.6);g.translate(c.x,c.y,c.z);p.add(g,'leaf',i%2?'#4f6544':'#3b533c')}
 }
}
export function buildTradersFitout(s:Structure,assets:TradersAssets){
 const model=s.data?.tradersModel as TradersModel|undefined;if(!model)return null
 if(model==='dressing')return buildTradersDressing(s,assets)
 s=tradersLocalStructure(s)
 const root=new THREE.Group();root.userData.tradersOwnGeometry=true;root.name='traders-'+model;root.position.set(s.x+s.w/2,0,s.y+s.h/2);root.rotation.y=Number(s.data?.deg??0)*Math.PI/180
 const p=new Parts(assets),label=String(s.data?.label??'B.N.T.G.')
 switch(model){
 case 'waiting':{
  p.box(0,.28,0,3.7,.09,.12,'steel',steel)
  for(const x of [-1.36,1.36]){p.box(x,.16,0,.08,.3,.12,'steel',dark);p.box(x,.035,.04,.45,.055,.72,'steel',steel,.012)}
  for(const x of [-1.18,0,1.18]){
   p.box(x,.46,.015,.79,.08,.54,'fabric','#495f63',.027)
   p.box(x,.76,-.22,.79,.52,.065,'fabric','#495f63',.028)
   p.box(x,.75,-.263,.75,.43,.018,'steel',steel)
   for(const dx of [-.45,.45]){p.rod(new THREE.Vector3(x+dx,.37,-.17),new THREE.Vector3(x+dx,.65,-.17),.021,'steel',steel);p.rod(new THREE.Vector3(x+dx,.65,-.17),new THREE.Vector3(x+dx,.65,.24),.021,'steel',steel)}
  }
  break}
 case 'planter':plant(p,s.w);break
 case 'directory':{
  p.box(0,.035,0,s.w*.8,.07,.65,'steel',dark,.018);p.box(0,1.12,0,s.w*.88,2.15,.16,'paint','#3f504c',.025)
  p.box(0,1.2,.092,s.w*.78,1.75,.022,'paint','#e0ddce');p.label(label,0,1.92,.11,s.w*.76,.28)
  if(s.w>2){p.label('北步行街 / NORTH MALL',0,1.48,.11,s.w*.72,.25);p.label('交易保险库 / TRADERS VAULT',0,1.04,.11,s.w*.72,.28);p.label('货物交接 / DISPATCH',0,.61,.11,s.w*.72,.25)}
  else{screen(p,0,1.31,.15,.67);p.box(0,.87,.13,.65,.12,.3,'steel',dark);p.box(0,.72,.175,.20,.035,.01,'rubber','#16241f')}
  break}
 case 'queue':{
  for(const x of [-s.w/2,s.w/2])for(const z of [-s.h/2,s.h/2]){p.cylinder(x,.025,z,.16,.05,'steel',steel);p.cylinder(x,.49,z,.028,.92,'steel',steel);p.cylinder(x,.96,z,.048,.08,'steel',dark)}
  for(const x of [-s.w/2,s.w/2])p.box(x,.91,0,.018,.07,s.h,'fabric','#485e61')
  break}
 case 'workstation':desk(p,0,-.12);break
 case 'locker':{
  p.box(0,.9,0,s.w,1.8,.58,'paint','#8e9a91',.018)
  for(const x of [-s.w/4,s.w/4]){p.box(x,.92,.303,s.w/2-.025,1.68,.018,'steel','#b7bcb2');p.box(x+.14,.95,.326,.025,.18,.04,'steel',dark);for(let i=0;i<4;i++)p.box(x,1.58+i*.038,.316,s.w*.3,.009,.007,'rubber','#48564f')}
  break}
 case 'divider':{
  p.box(0,1.01,0,s.w,2.02,s.h,'wood','#a8997d');p.box(0,2.035,0,s.w+.03,.045,s.h+.035,'brass',brass)
  for(let x=-s.w/2+.3;x<s.w/2;x+=1.2)p.box(x,1.1,s.h/2+.01,.025,1.7,.018,'wood','#786e59')
  break}
 case 'waterpoint':{
  p.box(-.44,.47,0,.55,.92,.55,'paint','#c2c6b8',.022);p.box(-.44,.97,0,.60,.07,.61,'steel',steel)
  p.cylinder(-.44,1.13,0,.15,.28,'glass','#a5b8b3');p.box(-.44,.75,.285,.25,.28,.015,'rubber',dark)
  for(const x of [.19,.73]){p.box(x,.40,0,.48,.8,.54,'steel','#6b8076',.02);p.box(x,.83,0,.49,.06,.56,'steel',dark);p.box(x,.845,.03,.27,.008,.15,'rubber','#26302c')}
  p.label('饮水与回收 / WATER',.2,1.33,.02,1.65,.24);break}
 case 'noticeboard':{
  p.box(0,1.42,0,s.w,1.45,.11,'wood','#796b4e');p.box(0,1.42,.065,s.w-.12,1.32,.025,'fabric','#9b946e')
  for(let i=0;i<8;i++){const x=-s.w*.38+i%4*s.w*.25,y=1.13+Math.floor(i/4)*.51;p.box(x,y,.085,.38,.43,.009,'paper',i%3?'#d6d3bd':'#b1c0b7');for(let j=0;j<4;j++)p.box(x,y+.06-j*.05,.092,.28,.008,.003,'paint','#777c6a')}
  break}
 case 'servicebay':case 'reception':{
  const w=s.w,d=s.h;p.box(0,.51,0,w,1.02,d,'wood','#90785c',.022);p.box(0,1.08,.02,w+.10,.09,d+.10,'stone','#d1cbb7',.018)
  p.box(0,.16,d/2+.015,w-.2,.05,.03,'brass',brass)
  for(let x=-w/2+.4;x<w/2;x+=1.2){p.box(x,.52,d/2+.012,.024,.7,.018,'wood','#645c49');screen(p,x,1.49,-d*.13,.53,-1)}
  p.label(label,0,.65,d/2+.035,Math.min(w-.3,3.1),.34)
  p.box(-w*.23,1.17,d*.22,.36,.08,.38,'paper',paper);p.cylinder(w*.34,1.17,d*.24,.05,.12,'steel',steel)
  break}
 case 'parcel_cart':{
  p.box(0,.21,0,1.05,.07,1.50,'steel',steel)
  for(const x of [-.43,.43])for(const z of [-.62,.62]){const g=new THREE.CylinderGeometry(.09,.09,.10,10);g.rotateZ(Math.PI/2);g.translate(x,.11,z);p.add(g,'rubber','#303c36')}
  for(const x of [-.48,.48])p.rod(new THREE.Vector3(x,.2,-.64),new THREE.Vector3(x,1.05,-.64),.025,'steel',steel)
  p.rod(new THREE.Vector3(-.48,1.05,-.64),new THREE.Vector3(.48,1.05,-.64),.025,'steel',steel)
  for(let i=0;i<3;i++){const x=i%2?.24:-.23,y=.44+Math.floor(i/2)*.43,z=i===2?0:.15;p.box(x,y,z,.48,.43,.66,'cardboard','#c1a77b');p.box(x,y+.22,z,.06,.005,.67,'paper','#a79a73');p.box(x,y,z+.337,.24,.13,.008,'paper',paper)}
  break}
 case 'lounge':{
  for(const x of [-1.55,1.55]){p.box(x,.27,0,1.3,.5,2.6,'wood','#59645c',.03);p.box(x,.51,0,1.22,.13,2.4,'fabric','#796d58',.035)}
  p.box(0,.41,0,1.1,.07,1.2,'wood',wood,.025);p.box(0,.2,0,.42,.4,.75,'steel',dark)
  for(const x of [-.12,.13])p.box(x,.46,0,.2,.035,.28,'paper',paper)
  break}
 }
 p.finish(root);if(model==='waterpoint'||model==='noticeboard')root.traverse(o=>{if((o as THREE.Mesh).isMesh)(o as THREE.Mesh).geometry.translate(model==='waterpoint'?-.115:0,0,model==='noticeboard'?-.019:0)});return root
}
