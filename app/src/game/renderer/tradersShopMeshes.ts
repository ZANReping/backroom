import * as THREE from 'three'
import type {Structure} from '../core/types'
import type {DressingKind} from '../content/tradersDressingShapes'
import type {DressingParts} from './tradersDressingParts'
import {TRADERS_SHOPS,shopSurface,type TradersShop} from '../content/tradersShops'

/**
 * 北排主题小店的实体模型（每个 shopPiece 道具一组合批网格）。
 * 五家店刻意用完全不同的材质语汇：五金铺 = 旧木 + 洞洞板 + 搪瓷吊灯；劳保店 = 花纹钢 + 波纹钢 + 冷光灯条；
 * 糖果铺 = 粉白条纹 + 玻璃糖罐 + 霓虹；文具铺 = 棋盘格 + 薄荷护墙板 + 橡木玻璃柜；户外店 = 原木 + 石板 + 灯笼。
 */
type P=DressingParts
const rnd=(seed:number)=>{let s=(seed*2654435761)>>>0||1;return()=>{s^=s<<13;s>>>=0;s^=s>>17;s^=s<<5;s>>>=0;return s/4294967296}}
const pick=<T,>(r:()=>number,a:readonly T[])=>a[Math.floor(r()*a.length)%a.length]
/** Bottom-anchored box. */
function B(p:P,x:number,y:number,z:number,w:number,h:number,d:number,s:string,c:string,round=0){if(w>.001&&h>.001&&d>.001)p.box(x,y+h/2,z,w,h,d,s,c,round)}
function cyl(p:P,x:number,y:number,z:number,r:number,h:number,s:string,c:string,seg=10,r2=r){const g=new THREE.CylinderGeometry(r2,r,h,seg);g.translate(x,y+h/2,z);p.add(g,s,c)}
/** Horizontal cylinder along local x (axis 'x') or z. */
function hcyl(p:P,x:number,y:number,z:number,r:number,len:number,axis:'x'|'z',s:string,c:string,seg=8){const g=new THREE.CylinderGeometry(r,r,len,seg);if(axis==='x')g.rotateZ(Math.PI/2);else g.rotateX(Math.PI/2);g.translate(x,y,z);p.add(g,s,c)}
function ball(p:P,x:number,y:number,z:number,r:number,s:string,c:string,sx=1,sy=1,sz=1,seg=10){const g=new THREE.SphereGeometry(r,seg,Math.max(4,seg*.6|0));g.scale(sx,sy,sz);g.translate(x,y,z);p.add(g,s,c)}
function glow(p:P,g:THREE.BufferGeometry,c:string){p.add(g,'emitter',c,false)}
function rod(p:P,a:[number,number,number],b:[number,number,number],r:number,s:string,c:string){p.rod(new THREE.Vector3(...a),new THREE.Vector3(...b),r,s,c)}
function sign(p:P,key:string,x:number,y:number,z:number,w:number,h:number,angle=0){const g=p.assets.signGeometry(key,w,h);g.rotateY(angle);g.translate(x,y,z);p.add(g,'sign','#ffffff',false)}
function signSize(p:P,key:string,w:number,h:number){const g=p.assets.signGeometry(key,w,h);g.computeBoundingBox();const b=g.boundingBox!;g.dispose();return[b.max.x-b.min.x,b.max.y-b.min.y] as const}
function goods(p:P,tile:number,x:number,y:number,z:number,w:number,h:number,d:number){
 const g=new THREE.BoxGeometry(w,h,d),uv=g.getAttribute('uv')
 for(let i=0;i<uv.count;i++)uv.setXY(i,(tile%4*256+8+uv.getX(i)*240)/1024,1-(Math.floor(tile/4)*256+8+(1-uv.getY(i))*240)/2048)
 g.translate(x,y+h/2,z);p.add(g,'goods','#ffffff',false)
}
/** Hanging two-sided sign on chains. */
function hangSign(p:P,key:string,w:number,bottom:number,frame:string,chain:string){
 const [sw,sh]=signSize(p,key,w,1.2),y=bottom+sh/2
 B(p,0,bottom-.03,0,sw+.06,sh+.06,.04,'paint',frame);for(const side of [-1,1])sign(p,key,0,y,side*.022,sw,sh,side<0?Math.PI:0)
 for(const sx of [-sw/2+.12,sw/2-.12])rod(p,[sx,bottom+sh,0],[sx,4.78,0],.006,'steel',chain)
}

// ---------------- Shell: wall liners, trims, ceiling structure, light fixtures ----------------
const HW=8.91,HD=11.91,TOP=4.78,DOOR=8.3,HEAD=3.2
/** Wall liner faces for the three solid walls and the front piers/header (local, inner faces). */
function liners(p:P,surf:string,c:string,y0=0,y1=TOP,t=.03){
 const h=y1-y0
 B(p,-HW+t/2,y0,0,t,h,HD*2,surf,c);B(p,HW-t/2,y0,0,t,h,HD*2,surf,c);B(p,0,y0,-HD+t/2,HW*2,h,t,surf,c)
 for(const s of [-1,1])B(p,s*(HW+DOOR)/2,y0,HD-t/2,HW-DOOR,h,t,surf,c)
 if(y1>HEAD)B(p,0,Math.max(y0,HEAD),HD-t/2,DOOR*2,y1-Math.max(y0,HEAD),t,surf,c)
}
/** Horizontal trim band around the three walls (and the front piers). */
function band(p:P,y:number,h:number,depth:number,s:string,c:string,front=true){
 B(p,-HW+depth/2,y,0,depth,h,HD*2,s,c);B(p,HW-depth/2,y,0,depth,h,HD*2,s,c);B(p,0,y,-HD+depth/2,HW*2,h,depth,s,c)
 if(front)for(const side of [-1,1])B(p,side*(HW+DOOR)/2,y,HD-depth/2,HW-DOOR,h,depth,s,c)
}
function shell(p:P,shop:TradersShop){
 const wall=shopSurface(shop,'wall'),L=shop.lights
 switch(shop.id){
 case 'hardware':{
  liners(p,wall,'#ffffff',0,3.0)
  liners(p,'paint','#3d5a45',3.0,TOP,.025)
  band(p,0,.16,.05,'wood','#5e4228');band(p,2.96,.12,.07,'wood','#6e4d2c');band(p,3.08,.05,.05,'wood','#8a6438')
  B(p,0,.004,9.6,3.2,.012,1.8,'fabric','#a24a34')
  for(const [x,z] of L){rod(p,[x,TOP,z],[x,shop.lightZ+.32,z],.008,'steel','#2a2a2a');cyl(p,x,shop.lightZ+.08,z,.07,.22,'steel','#2f3d33',10,.07)
   const g=new THREE.ConeGeometry(.34,.24,16,1,true);g.translate(x,shop.lightZ+.06,z);p.add(g,'paint','#2f5a40');const gi=new THREE.ConeGeometry(.33,.23,16,1,true);gi.scale(-1,1,1);gi.translate(x,shop.lightZ+.055,z);p.add(gi,'paint','#e8e2cc')
   const bulb=new THREE.SphereGeometry(.07,10,6);bulb.translate(x,shop.lightZ-.03,z);glow(p,bulb,shop.light)}
  break}
 case 'workwear':{
  liners(p,wall,'#ffffff')
  band(p,0,.12,.04,'steel','#30343a')
  for(let z=-10;z<=10;z+=4)B(p,0,4.42,z,HW*2,.34,.16,'steel','#3a3f45') // exposed I-beams
  for(let z=-10;z<=10;z+=4){B(p,0,4.42,z,HW*2,.03,.36,'steel','#3a3f45');B(p,0,4.73,z,HW*2,.03,.36,'steel','#3a3f45')}
  // Hazard tape lanes and the fitting-area outline.
  for(const x of [-2.1,2.1])B(p,x,.004,1.5,.12,.01,19,'paint','#e3c21b')
  for(let i=0;i<9;i++)for(const s of [-1,1])B(p,s*3.4,.006,8.6+(i-4)*.001,.06,.008,.06,'paint','#151515')
  for(const s of [-1,1]){B(p,s*3.4,.004,8.6,1.6,.01,.1,'paint','#e3c21b');B(p,s*3.4,.004,8.6,.1,.01,1.6,'paint','#e3c21b');B(p,s*3.4,.004,7.8,1.6,.01,.08,'paint','#e3c21b');B(p,s*3.4,.004,9.4,1.6,.01,.08,'paint','#e3c21b')}
  for(let i=0;i<6;i++)B(p,-7.5+i*.36,.005,11.0,.18,.01,1.4,'paint',i%2?'#151515':'#e3c21b')
  for(const [x,z] of L){for(const dx of [-1.1,1.1])rod(p,[x+dx,TOP,z],[x+dx,shop.lightZ+.06,z],.004,'steel','#9aa1a6')
   B(p,x,shop.lightZ,z,2.5,.07,.16,'steel','#c9ced3');const g=new THREE.BoxGeometry(2.4,.02,.1);g.translate(x,shop.lightZ-.005,z);glow(p,g,shop.light)}
  break}
 case 'candy':{
  liners(p,wall,'#ffffff',1.05,TOP)
  liners(p,'paint','#fbf6f2',0,1.05,.04)
  band(p,0,.12,.06,'paint','#e2557f');band(p,1.0,.07,.07,'paint','#e2557f');band(p,4.55,.23,.06,'paint','#9fdcc6')
  for(let i=0;i<30;i++){const x=-HW+.3+i*.6;if(Math.abs(x)<HW-.3)ball(p,x,4.55,-HD+.06,.3,'paint','#9fdcc6',1,.45,.25,10)}
  const rug=new THREE.CylinderGeometry(1.4,1.4,.012,28);rug.translate(0,.006,9.2);p.add(rug,'fabric','#f2a3c0')
  const rug2=new THREE.CylinderGeometry(1.0,1.0,.014,28);rug2.translate(0,.007,9.2);p.add(rug2,'fabric','#fbf3f6')
  for(const [x,z] of L){rod(p,[x,TOP,z],[x,shop.lightZ+.28,z],.007,'steel','#c9a54a');cyl(p,x,shop.lightZ+.2,z,.05,.08,'brass','#c9a54a')
   const g=new THREE.SphereGeometry(.24,14,10);g.translate(x,shop.lightZ,z);glow(p,g,shop.light)}
  break}
 case 'office':{
  liners(p,wall,'#ffffff',1.15,TOP)
  liners(p,'paint','#9fcdb9',0,1.15,.04)
  for(const s of [-1,1])for(let z=-11;z<11.5;z+=1.0)B(p,s*(HW-.045),.22,z,.012,.78,.82,'paint','#b2dccb')
  for(let x=-8.4;x<8.5;x+=1.0)B(p,x,.22,-HD+.045,.82,.78,.012,'paint','#b2dccb')
  band(p,0,.18,.06,'wood','#6e4d2c');band(p,1.12,.06,.08,'wood','#8a6438');band(p,4.6,.18,.07,'paint','#f3ecd8')
  B(p,0,.004,9.4,2.4,.012,1.6,'fabric','#a8484e')
  for(const [x,z] of L){rod(p,[x,TOP,z],[x,shop.lightZ+.3,z],.008,'brass','#a88a4a');cyl(p,x,shop.lightZ+.18,z,.09,.12,'brass','#a88a4a',12,.06)
   const g=new THREE.SphereGeometry(.2,14,10);g.scale(1,1.2,1);g.translate(x,shop.lightZ,z);glow(p,g,shop.light)}
  break}
 case 'guns':{
  // 鎏金兵械库：墨绿金纹墙纸 + 胡桃木护墙板 + 金色腰线；试射道一侧是混凝土 + 吸音棉
  liners(p,wall,'#ffffff',1.1,TOP)
  liners(p,'wood','#4a2c1c',0,1.1,.04)
  band(p,1.08,.06,.06,'brass','#c9a04a');band(p,0,.14,.05,'wood','#2a1a10');band(p,TOP-.18,.18,.08,'wood','#3a2416')
  for(const [x,z] of L){rod(p,[x,TOP,z],[x,shop.lightZ+.3,z],.006,'brass','#b08a3a')
   const sh=new THREE.CylinderGeometry(.12,.3,.26,14,1,true);sh.translate(x,shop.lightZ+.1,z);p.add(sh,'brass','#c9a04a')
   const si=new THREE.CylinderGeometry(.115,.29,.25,14,1,true);si.scale(-1,1,1);si.translate(x,shop.lightZ+.1,z);p.add(si,'paint','#f0e2c0')
   const bulb=new THREE.SphereGeometry(.07,10,6);bulb.translate(x,shop.lightZ-.02,z);glow(p,bulb,shop.light)}
  break}
 case 'outdoor':{
  liners(p,wall,'#ffffff')
  for(let z=-10.5;z<=10.5;z+=3)hcyl(p,0,4.56,z,.16,HW*2,'x','wood','#7a5534',10)
  hcyl(p,0,4.58,0,.18,HD*2-.1,'z','wood','#6b4a2c',10)
  for(const s of [-1,1])for(let z=-10.5;z<=10.5;z+=3)cyl(p,s*(HW-.18),0,z,.17,4.4,'wood','#7a5534',10) // wall post logs under each beam
  B(p,0,.004,8.8,3.0,.012,2.0,'fabric','#b04a3a');for(let i=0;i<5;i++)B(p,-1.2+i*.6,.011,8.8,.08,.004,2.0,'fabric','#1e1e1e');for(let i=0;i<4;i++)B(p,0,.012,8.0+i*.53,3.0,.004,.08,'fabric','#1e1e1e')
  for(const [x,z] of L){rod(p,[x,4.4,z],[x,shop.lightZ+.34,z],.01,'steel','#2a2a2a')
   B(p,x,shop.lightZ-.2,z,.26,.04,.26,'steel','#23262a');B(p,x,shop.lightZ+.22,z,.28,.06,.28,'steel','#23262a');const roof=new THREE.ConeGeometry(.2,.12,4);roof.rotateY(Math.PI/4);roof.translate(x,shop.lightZ+.31,z);p.add(roof,'steel','#23262a')
   for(const [dx,dz] of [[-1,-1],[1,-1],[-1,1],[1,1]])B(p,x+dx*.12,shop.lightZ-.16,z+dz*.12,.02,.38,.02,'steel','#23262a')
   const g=new THREE.CylinderGeometry(.07,.07,.2,10);g.translate(x,shop.lightZ,z);glow(p,g,shop.light)}
  break}
 }
}

// ---------------- Hardware ----------------
const HW_COL={wood:'#7a5a3a',dark:'#4f3a26',brass:'#c9a54a',steel:'#9aa1a6',red:'#b8312b',green:'#2f5a40'}
function shelfGoodsHardware(p:P,r:()=>number,x0:number,x1:number,y:number,z:number,depth:number){
 for(let x=x0;x<x1-.2;){
  const k=r(),w=.22+r()*.3;if(x+w>x1)break;const cx=x+w/2
  if(k<.25)goods(p,pick(r,[11,15]),cx,y,z,w*.9,.18+r()*.12,depth*.7)
  else if(k<.42){B(p,cx,y,z,w*.9,.16,depth*.5,'paint',HW_COL.red,.01);B(p,cx,y+.16,z,w*.5,.03,.03,'steel','#2a2a2a')}
  else if(k<.6){const n=Math.max(1,Math.floor(w/.11));for(let i=0;i<n;i++)cyl(p,x+(i+.5)*w/n,y,z,.045,.12,'steel',pick(r,['#c0c4c6','#d8b33c','#9aa1a6']),8)}
  else if(k<.75){const g=new THREE.TorusGeometry(Math.min(.12,w*.4),.035,5,12);g.rotateX(Math.PI/2);g.translate(cx,y+.04,z);p.add(g,'fabric',pick(r,['#3a6a3a','#d8641e','#2a4f8a']))}
  else for(let i=0;i<3;i++)B(p,cx,y+i*.05,z,w*.9,.045,depth*.6,'paint',pick(r,['#3a3f46','#5c6a74','#e8b51c']))
  x+=w+.04
 }
}
function hardware(p:P,part:string,w:number,d:number,s:Structure,r:()=>number){
 switch(part){
 case 'hwBins':{
  B(p,0,0,0,w,2.3,d,'wood',HW_COL.dark);B(p,0,2.3,0,w+.1,.08,d+.08,'wood','#8a6438')
  const fz=d/2+.005
  for(let col=0;col<8;col++)for(let row=0;row<2;row++){const x=-w/2+.5+col*(w-.2)/8,y=.12+row*.4;B(p,x,y,fz,(w-.2)/8-.06,.34,.02,'wood','#9a7046');B(p,x,y+.2,fz+.015,.16,.03,.03,'brass',HW_COL.brass)}
  const cols=16,rows=7,cw=(w-.2)/cols,rh=(2.25-.95)/rows
  for(let col=0;col<cols;col++)for(let row=0;row<rows;row++){const x=-w/2+.1+(col+.5)*cw,y=.95+row*rh;B(p,x,y+.01,fz,cw-.025,rh-.025,.02,'wood',(col+row)%3?'#8d6640':'#7e5a36');B(p,x,y+rh*.62,fz+.012,cw*.5,.04,.012,'paper','#efe6cc');B(p,x,y+rh*.3,fz+.016,.06,.025,.03,'brass',HW_COL.brass)}
  return true}
 case 'hwPegTools':{
  // Tools hung on the pegboard back wall (silhouettes in real proportions).
  for(let i=0;i<34;i++){
   const x=-w/2+.3+(i%17)*(w-.6)/16,y=1.15+Math.floor(i/17)*.85+r()*.08,k=i*7%6,z=-d/2+.05
   if(k===0){B(p,x,y,z,.035,.34,.03,'wood','#b58a58');B(p,x,y+.33,z,.12,.05,.05,'steel','#3a3f45')}
   else if(k===1){const g=new THREE.BoxGeometry(.5,.14,.008);g.translate(x,y+.2,z);p.add(g,'steel','#c9cdd0');B(p,x+.27,y+.13,z,.1,.14,.03,'wood','#9a3a28')}
   else if(k===2){rod(p,[x,y,z],[x,y+.3,z],.012,'steel','#c0c4c6');const g=new THREE.TorusGeometry(.035,.012,5,10);g.translate(x,y+.33,z);p.add(g,'steel','#c0c4c6')}
   else if(k===3){const g=new THREE.TorusGeometry(.14,.03,6,14);g.translate(x,y+.25,z);p.add(g,'rubber','#2f7a3a')}
   else if(k===4){B(p,x,y+.1,z,.09,.09,.04,'paint','#e8c21b');B(p,x-.06,y+.12,z,.04,.02,.02,'steel','#2a2a2a')}
   else{B(p,x,y,z,.03,.5,.025,'wood','#c8a273');B(p,x,y+.48,z,.16,.07,.03,'steel','#6a6f74')}
  }
  return true}
 case 'hwCounter':{
  B(p,0,0,0,w,.96,d,'wood','#6e4d2c');B(p,0,.96,0,w+.08,.05,d+.08,'wood','#4a3220')
  for(let i=0;i<6;i++)B(p,-w/2+.5+i*(w-1)/5,.12,d/2+.01,.86,.7,.02,'wood','#8a6438')
  // Brass cash register, key cutting machine, counter bell, key board behind.
  B(p,-1.6,1.01,-.1,.5,.18,.42,'brass','#b8964a');B(p,-1.6,1.19,-.18,.46,.16,.24,'brass','#c9a54a');B(p,-1.6,1.35,-.26,.3,.1,.05,'paper','#f3ecd8')
  for(let i=0;i<4;i++)for(let j=0;j<3;j++)cyl(p,-1.75+i*.1,1.19,.02+j*.06,.02,.04,'paper','#efe6cc',6)
  B(p,1.2,1.01,0,.42,.16,.3,'steel','#5c6a74');cyl(p,1.12,1.17,0,.07,.04,'steel','#c0c4c6',12);cyl(p,1.32,1.17,0,.07,.04,'steel','#c0c4c6',12);B(p,1.22,1.21,0,.12,.1,.06,'steel','#3a3f45')
  cyl(p,.4,1.01,.15,.06,.05,'brass','#c9a54a',12);ball(p,.4,1.07,.15,.05,'brass','#c9a54a')
  B(p,0,1.2,-3.85,1.6,.9,.04,'wood','#6e4d2c')
  for(let i=0;i<8;i++)for(let j=0;j<4;j++){B(p,-.7+i*.2,1.3+j*.2,-3.82,.012,.012,.04,'steel','#9aa1a6');B(p,-.7+i*.2,1.24+j*.2,-3.8,.03,.06,.006,'brass','#d8b45a')}
  return true}
 case 'hwGondola':{
  const H=1.85
  B(p,0,0,0,w,.12,d,'wood','#4f3a26');B(p,0,0,0,w-.04,H,.05,'wood','#8d6640');for(const x of [-w/2+.03,w/2-.03])B(p,x,0,0,.05,H,d,'wood','#6e4d2c')
  for(const side of [-1,1])for(let lv=0;lv<4;lv++){const y=.12+lv*.43;B(p,0,y,side*d/4,w-.1,.03,d/2-.04,'wood','#a07a4c');shelfGoodsHardware(p,r,-w/2+.12,w/2-.12,y+.03,side*d/4,d/2-.1);B(p,0,y-.03,side*(d/2-.01),w-.1,.05,.012,'paper','#efe6cc')}
  B(p,0,H,0,w,.04,d,'wood','#4f3a26')
  return true}
 case 'hwLumber':{
  for(const x of [-w/2+.2,0,w/2-.2]){B(p,x,0,-d/2+.1,.12,2.4,.12,'paint','#2f5a40');B(p,x,0,0,.3,.06,d,'steel','#2f5a40');for(let lv=0;lv<4;lv++)B(p,x,.35+lv*.55,0,.08,.06,d-.1,'paint','#2f5a40')}
  for(let lv=0;lv<4;lv++)for(let i=0;i<5+Math.floor(r()*3);i++){const t=.04+r()*.05,dd=.09+r()*.1;B(p,(r()-.5)*.3,.41+lv*.55+Math.floor(i/3)*.06,-d/2+.2+(i%3)*.32,w-.4-r()*.6,t,dd,'wood',pick(r,['#c8a273','#b8935f','#d4b17e']))}
  for(let i=0;i<3;i++){const g=new THREE.BoxGeometry(1.22,2.2,.018);g.rotateX(-.12);g.translate(-w/2-.9+i*.03,1.1,d/2-.15+i*.02);p.add(g,'wood','#cbb08a')}
  return true}
 case 'hwPaint':{
  B(p,0,0,0,w,.12,d,'wood','#6e4d2c')
  for(let tier=0;tier<5;tier++){const n=5-tier,m=3-Math.floor(tier/2);for(let i=0;i<n;i++)for(let j=0;j<Math.max(1,m);j++){const x=(i-(n-1)/2)*.23,z=(j-(m-1)/2)*.23,y=.12+tier*.2,c=pick(r,['#b8312b','#2a5aa8','#e8c21b','#f2f0e8','#2f7a4a','#7a4a8a'])
   cyl(p,x,y,z,.1,.19,'steel','#c0c4c6',12);cyl(p,x,y+.05,z,.102,.09,'paint',c,12)}}
  return true}
 case 'hwBuckets':{
  cyl(p,-.5,0,0,.3,.85,'wood','#6e4d2c',14);for(const y of [.12,.7])cyl(p,-.5,y,0,.305,.04,'steel','#3a3f45',14)
  for(let i=0;i<9;i++){const a=i*.7,rr=.18*r();rod(p,[-.5+Math.cos(a)*rr,.5,Math.sin(a)*rr],[-.5+Math.cos(a)*rr*1.6,1.35+r()*.1,Math.sin(a)*rr*1.6],.02,'wood','#c8a273')}
  for(let i=0;i<4;i++)cyl(p,.45,i*.09,0,.17,.3,'steel','#b9bec2',14,.14)
  for(const dx of [.85,.95]){rod(p,[dx,0,-.45],[dx-.1,1.4,-.5],.016,'wood','#b58a58');B(p,dx,0,-.42,.22,.04,.28,'steel','#6a6f74')}
  return true}
 case 'hwSign':hangSign(p,String(s.data?.sign),w,2.9,'#3a2a1c','#3a3f45');return true
 }
 return false
}

// ---------------- Workwear ----------------
function workwear(p:P,part:string,w:number,d:number,s:Structure,r:()=>number){
 switch(part){
 case 'wwHelmets':{
  B(p,0,.8,-d/2+.02,w,1.9,.04,'paint','#d7dadc');for(let i=0;i<9;i++)B(p,0,.95+i*.2,-d/2+.045,w,.02,.012,'steel','#9aa1a6')
  for(let row=0;row<5;row++)for(let col=0;col<12;col++){
   const x=-w/2+.4+col*(w-.8)/11,y=1.0+row*.34,c=pick(r,['#e8c21b','#f2f0e8','#d8641e','#b8312b','#2a5aa8','#e8c21b'])
   const g=new THREE.SphereGeometry(.13,12,6,0,Math.PI*2,0,Math.PI/2);g.scale(1,.85,1.15);g.translate(x,y+.04,-d/2+.2);p.add(g,'paint',c)
   const b=new THREE.CylinderGeometry(.16,.16,.012,14);b.scale(1,1,1.2);b.translate(x,y+.04,-d/2+.22);p.add(b,'paint',c);B(p,x,y-.03,-d/2+.08,.03,.08,.08,'steel','#9aa1a6')}
  return true}
 case 'wwLockers':{
  const n=8,lw=w/n
  for(let i=0;i<n;i++){const x=-w/2+(i+.5)*lw;B(p,x,.08,0,lw-.02,1.9,d,'steel','#5f7488');B(p,x,.1,d/2,lw-.06,1.86,.012,'steel','#6f8598')
   for(let k=0;k<4;k++)B(p,x,1.6+k*.05,d/2+.008,lw*.5,.012,.008,'steel','#2e3a46');B(p,x+lw*.3,1.0,d/2+.012,.03,.14,.03,'steel','#c0c4c6');B(p,x,1.82,d/2+.01,.12,.06,.006,'paper','#f3f1e8')}
  B(p,0,0,0,w,.08,d,'steel','#2e3a46');B(p,0,1.98,0,w,.03,d+.02,'steel','#4c5e70')
  return true}
 case 'wwBoots':{
  B(p,0,0,-d/2+.03,w,1.9,.05,'steel','#3a3f45');for(const x of [-w/2+.03,w/2-.03])B(p,x,0,0,.05,1.9,d,'steel','#3a3f45')
  for(let lv=0;lv<4;lv++){const y=.1+lv*.45;B(p,0,y,0,w-.08,.03,d-.04,'steel','#9aa1a6')
   for(let i=0;i<7;i++){const x=-w/2+.35+i*(w-.7)/6,c=pick(r,['#5a3a22','#1e1e1e','#c88a2a','#3a2a1a']);for(const dx of [-.06,.06]){B(p,x+dx,y+.03,.02,.1,.08,.28,'rubber',c,.02);B(p,x+dx,y+.03,-.07,.1,.24,.1,'rubber',c,.02);B(p,x+dx,y+.03,.02,.105,.025,.29,'rubber','#151515')}}}
  return true}
 case 'wwRack':{
  for(const x of [-w/2+.1,w/2-.1]){rod(p,[x,0,0],[x,1.62,0],.022,'steel','#d0d4d8');B(p,x,0,0,.08,.04,.7,'steel','#9aa1a6')}
  rod(p,[-w/2+.1,1.62,0],[w/2-.1,1.62,0],.02,'steel','#d0d4d8')
  const cols=['#1d2c55','#d8641e','#e3c21b','#3d4a3a','#5c6a74','#1d2c55']
  for(let x=-w/2+.35;x<w/2-.3;x+=.15){const c=pick(r,cols),len=1.0+r()*.25
   const g=new THREE.TorusGeometry(.03,.006,4,8,Math.PI);g.translate(x,1.6,0);p.add(g,'steel','#9aa1a6')
   B(p,x,1.58-len,0,.05,len,.48,'fabric',c,.01);if(c!=='#3d4a3a')B(p,x+.028,1.58-len*.45,0,.006,.05,.48,'paint','#d8dde2')}
  return true}
 case 'wwTable':{
  B(p,0,.85,0,w,.05,d,'shop:ww_floor','#ffffff');for(const [x,z] of [[-1,-1],[1,-1],[-1,1],[1,1]])B(p,x*(w/2-.06),0,z*(d/2-.06),.05,.85,.05,'steel','#3a3f45')
  for(let i=0;i<6;i++){const x=-w/2+.3+(i%3)*.8,z=i<3?-.25:.25,c=pick(r,['#c88a2a','#e3c21b','#1e1e1e','#5c6a74']);for(let k=0;k<1+Math.floor(r()*4);k++)B(p,x,.9+k*.05,z,.3,.045,.24,'fabric',c,.01)}
  return true}
 case 'wwMannequin':{
  const c=String(s.data?.suit??'#d8641e')
  cyl(p,0,0,0,.4,.08,'steel','#3a3f45',18);rod(p,[0,.08,0],[0,.55,0],.02,'steel','#9aa1a6')
  B(p,-.1,.55,0,.15,.82,.16,'fabric',c,.03);B(p,.1,.55,0,.15,.82,.16,'fabric',c,.03)
  B(p,0,1.3,0,.46,.6,.24,'fabric',c,.05);B(p,0,1.42,.125,.42,.035,.006,'paint','#d8dde2');B(p,0,1.08,.125,.42,.035,.006,'paint','#d8dde2')
  for(const sx of [-1,1]){const g=new THREE.CylinderGeometry(.06,.055,.62,8);g.rotateZ(sx*.18);g.translate(sx*.3,1.25,0);p.add(g,'fabric',c)}
  ball(p,0,1.78,0,.12,'paint','#d9d4c8',1,1.15,1);const h=new THREE.SphereGeometry(.15,12,6,0,Math.PI*2,0,Math.PI/2);h.translate(0,1.84,0);p.add(h,'paint','#f2f0e8')
  B(p,0,1.73,.1,.18,.07,.02,'glass','#2a3036')
  return true}
 case 'wwCase':{
  B(p,0,0,0,w,.8,d,'steel','#3a3f45');for(const [x,z] of [[-1,-1],[1,-1],[-1,1],[1,1]])B(p,x*(w/2-.02),.8,z*(d/2-.02),.03,1.05,.03,'steel','#c0c4c6');B(p,0,1.85,0,w,.04,d,'steel','#c0c4c6')
  for(const z of [-d/2+.01,d/2-.01])B(p,0,.8,z,w-.06,1.05,.01,'glass','#cfe6f6');for(const x of [-w/2+.01,w/2-.01])B(p,x,.8,0,.01,1.05,d-.06,'glass','#cfe6f6')
  for(const y of [.82,1.32]){B(p,0,y,0,w-.1,.02,d-.1,'glass','#e2eef4');for(let i=0;i<5;i++){const x=-w/2+.3+i*(w-.6)/4;B(p,x,y+.02,0,.22,.12,.1,'rubber','#1e1e1e',.03);B(p,x,y+.06,.051,.17,.07,.005,'glass','#9fc8e0')}}
  return true}
 case 'wwCounter':{
  B(p,0,0,0,w,.98,d,'steel','#1d2c55');B(p,0,.98,0,w+.06,.05,d+.06,'shop:ww_floor','#ffffff');B(p,0,.06,d/2+.01,w-.1,.08,.02,'paint','#e3c21b')
  for(let i=0;i<8;i++)B(p,-w/2+.2+i*(w-.4)/7,.3,d/2+.012,.3,.04,.006,'paint',i%2?'#151515':'#e3c21b')
  B(p,-1.5,1.03,-.1,.36,.14,.28,'steel','#2a2f33');B(p,-1.5,1.24,-.17,.36,.24,.03,'screen','#9db7a8')
  for(let k=0;k<5;k++)B(p,.8,1.03+k*.05,0,.4,.045,.3,'fabric',k%2?'#e3c21b':'#d8641e',.01)
  B(p,1.8,1.03,.1,.18,.12,.1,'paint','#b8312b')
  return true}
 case 'wwCage':{
  for(const x of [-w/2,-w/4,0,w/4,w/2])rod(p,[x,0,d/2-.02],[x,2.6,d/2-.02],.02,'steel','#5c6a74')
  rod(p,[-w/2,2.6,d/2-.02],[w/2,2.6,d/2-.02],.02,'steel','#5c6a74')
  for(let x=-w/2+.1;x<w/2;x+=.1)rod(p,[x,.05,d/2-.02],[x,2.55,d/2-.02],.003,'steel','#9aa1a6')
  for(let y=.15;y<2.6;y+=.1)rod(p,[-w/2,y,d/2-.02],[w/2,y,d/2-.02],.003,'steel','#9aa1a6')
  for(const y of [.05,.9,1.75]){B(p,0,y,-.05,w-.1,.03,d-.2,'steel','#5c6a74');for(let i=0;i<9;i++){if(r()<.2)continue;goods(p,pick(r,[12,15]),-w/2+.5+i*(w-1)/8,y+.03,-.05,.7,.35+r()*.3,.6)}}
  return true}
 case 'wwSign':hangSign(p,String(s.data?.sign),w,2.85,'#151515','#9aa1a6');return true
 }
 return false
}

// ---------------- Candy ----------------
const CANDY=['#c8ccd2','#b08a3a','#3a3f46','#efe6cc','#9fd23a','#7a4ad8','#7fe0b8']
const POP=['#e94e8a','#f7c531','#3fbfa4','#5aa8f0','#f07a3a','#b06ae0','#e8313a','#7fe0b8']
function candy(p:P,part:string,w:number,d:number,s:Structure,r:()=>number){
 switch(part){
 case 'cdJarWall':{
  B(p,0,0,-d/2+.03,w,2.5,.05,'paint','#fbf6f2');for(let i=0;i<=7;i++)B(p,-w/2+i*w/7,0,0,.06,2.5,d,'paint','#fbf6f2')
  B(p,0,0,0,w,.3,d,'paint','#e2557f')
  for(let lv=0;lv<4;lv++){const y=.3+lv*.54;B(p,0,y,0,w,.035,d,'paint','#fbf6f2');B(p,0,y,d/2,w,.035,.02,'paint','#9fdcc6')
   for(let x=-w/2+.2;x<w/2-.15;x+=.29){if(Math.abs(((x+w/2)%(w/7)))<.12)continue;const c=pick(r,POP),h=.3+r()*.1
    cyl(p,x,y+.04,0,.11,h-.04,'paint',c,10);cyl(p,x,y+.035,0,.12,h,'glass','#f2f8fb',10);cyl(p,x,y+.035+h,0,.08,.04,'glass','#f2f8fb',10);cyl(p,x,y+.075+h,0,.09,.04,'paint',pick(r,['#e2557f','#9fdcc6','#c9a54a']),10)}}
  B(p,0,2.5,-.05,w+.1,.08,d+.1,'paint','#9fdcc6')
  // Neon lollipop above the jar wall.
  for(const [rr,c] of [[.62,'#ff6fae'],[.42,'#ffffff'],[.22,'#ff6fae']] as const){const g=new THREE.TorusGeometry(rr,.025,6,30);g.translate(0,3.55,-d/2+.08);glow(p,g,c)}
  {const g=new THREE.CylinderGeometry(.025,.025,.7,6);g.translate(0,2.85,-d/2+.08);glow(p,g,'#ffffff')}
  for(const sx of [-1,1])for(let i=0;i<3;i++){const g=new THREE.TorusGeometry(.18,.02,5,16);g.translate(sx*(2.6+i*1.3),3.5+(i%2)*.25,-d/2+.08);glow(p,g,i%2?'#7fffd9':'#ffd36f')}
  return true}
 case 'cdBins':{
  B(p,0,0,0,w,.85,d,'paint','#e2557f');B(p,0,.85,0,w+.04,.04,d+.04,'stone','#f4f0ea')
  for(let i=0;i<10;i++)B(p,-w/2+.4+i*(w-.8)/9,.15,d/2+.01,.5,.5,.02,'paint','#f6a7c4')
  for(let row=0;row<2;row++)for(let col=0;col<10;col++){
   const x=-w/2+.42+col*(w-.84)/9,y=.92+row*.34,z=-.2+row*-.05,c=pick(r,POP)
   const g=new THREE.BoxGeometry(.66,.28,.42);g.rotateX(-.35);g.translate(x,y+.16,z+.1);p.add(g,'glass','#f2f8fb')
   const f=new THREE.BoxGeometry(.6,.16,.36);f.rotateX(-.35);f.translate(x,y+.1,z+.08);p.add(f,'paint',c)}
  B(p,0,1.62,-d/2+.06,w,.04,.12,'paint','#9fdcc6')
  return true}
 case 'cdBags':{
  B(p,0,0,-d/2+.03,w,2.1,.05,'paint','#fbf6f2');for(const x of [-w/2+.03,0,w/2-.03])B(p,x,0,0,.05,2.1,d,'paint','#fbf6f2')
  for(let lv=0;lv<5;lv++){const y=.08+lv*.42;B(p,0,y,0,w-.06,.03,d-.02,'paint','#fbf6f2');B(p,0,y,d/2-.01,w-.06,.05,.012,'paint','#e2557f')
   for(let i=0;i<14;i++){const x=-w/2+.3+i*(w-.6)/13,c=CANDY[(i+lv*2)%7];B(p,x,y+.03,0,.24,.3,.12,'paper',c,.02);B(p,x,y+.2,.062,.2,.06,.004,'paper','#ffffff');B(p,x,y+.33,0,.2,.03,.1,'paper',c)}}
  return true}
 case 'cdCounter':{
  const segs=9,R=7.5
  for(let i=0;i<segs;i++){const a0=(i/segs-.5)*.95,a=a0+.95/segs/2,x=Math.sin(a)*R,z=Math.cos(a)*R-R+.2,len=2*R*Math.sin(.95/segs/2)+.02,ang=a
   const box=(y:number,h:number,dd:number,off:number,su:string,c:string)=>{const g=new THREE.BoxGeometry(len,h,dd);g.translate(0,y+h/2,off);g.rotateY(ang);g.translate(x,0,z);p.add(g,su,c)}
   box(0,.62,d,0,'paint','#f6a7c4');box(.08,.46,.02,d/2+.005,'paint','#9fdcc6');box(.62,.03,d,0,'stone','#fbf6f2');box(.65,.42,.01,d/2-.02,'glass','#e6f4fa');box(1.07,.04,d,0,'stone','#fbf6f2')
   for(let k=0;k<2;k++){const g=new THREE.BoxGeometry(len*.42,.06,.32);g.translate((k-.5)*len*.48,.7,.1);g.rotateY(ang);g.translate(x,0,z);p.add(g,'paint',pick(r,POP))}}
  B(p,-1.6,1.11,-.2,.42,.22,.32,'paint','#9fdcc6',.03);B(p,-1.6,1.33,-.28,.34,.12,.05,'paint','#fbf6f2')
  cyl(p,1.4,1.11,-.15,.05,.18,'brass','#c9a54a',8);cyl(p,1.4,1.29,-.15,.17,.03,'brass','#c9a54a',16)
  cyl(p,.4,1.11,-.25,.12,.24,'glass','#f2f8fb',12);cyl(p,.4,1.12,-.25,.11,.16,'paint','#e94e8a',12)
  return true}
 case 'cdLolly':{
  const c=String(s.data?.color??'#e94e8a')
  cyl(p,0,0,0,.32,.1,'paint','#fbf6f2',18);rod(p,[0,.1,0],[0,2.05,0],.035,'paint','#fbf6f2')
  for(let i=0;i<5;i++){const g=new THREE.TorusGeometry(.08+i*.085,.045,6,24);g.translate(0,2.1+.32,0);p.add(g,'paint',i%2?'#fbf6f2':c)}
  cyl(p,0,2.42-.05,0,.03,.1,'paint',c,8)
  const ribbon=new THREE.TorusGeometry(.07,.02,5,10);ribbon.translate(0,2.0,0);p.add(ribbon,'fabric','#9fdcc6')
  return true}
 case 'cdGumball':{
  cyl(p,0,0,0,.18,.7,'paint','#e2557f',14);cyl(p,0,.7,0,.75,.05,'paint','#fbf6f2',24);cyl(p,0,.66,0,.76,.04,'paint','#e2557f',24)
  for(const [x,z,c] of [[-.35,-.2,'#e8313a'],[.35,-.15,'#3a7ad8'],[0,.35,'#f7c531']] as const){
   cyl(p,x,.75,z,.12,.24,'paint',c,12,.09);B(p,x,.83,z+.1,.06,.06,.04,'steel','#c0c4c6');ball(p,x,1.1,z,.16,'glass','#f2f8fb')
   for(let i=0;i<10;i++)ball(p,x+(r()-.5)*.18,1.02+r()*.14,z+(r()-.5)*.18,.035,'paint',pick(r,POP),1,1,1,6);cyl(p,x,1.24,z,.05,.04,'paint',c,10)}
  return true}
 case 'cdCake':{
  for(const [y,rr,c] of [[0,.7,'#f6a7c4'],[.4,.52,'#9fdcc6'],[.75,.34,'#fbe7a0']] as const){cyl(p,0,y,0,rr,.36,'paint',c,24);cyl(p,0,y+.34,0,rr+.02,.04,'paint','#fbf6f2',24)
   for(let i=0;i<Math.round(rr*14);i++){const a=i/Math.round(rr*14)*Math.PI*2;ball(p,Math.cos(a)*(rr-.05),y+.42,Math.sin(a)*(rr-.05),.045,'paint',pick(r,POP),1,1,1,6)}}
  for(let i=0;i<7;i++){const a=i/7*Math.PI*2;rod(p,[Math.cos(a)*.18,1.1,Math.sin(a)*.18],[Math.cos(a)*.22,1.45,Math.sin(a)*.22],.012,'paint','#fbf6f2');ball(p,Math.cos(a)*.22,1.5,Math.sin(a)*.22,.07,'paint',POP[i],1,1,.4,10)}
  return true}
 case 'cdCrates':{
  for(const [x,y,z] of [[-.55,0,0],[.55,0,0],[-.5,.5,0],[.45,.5,.05],[0,1.0,0]] as const){B(p,x,y,z,1.0,.48,.7,'wood','#b8935f');for(const yy of [.08,.38])B(p,x,y+yy,z+.355,1.0,.06,.01,'wood','#8d6640');B(p,x,y+.2,z+.36,.4,.12,.004,'paper','#e2557f')}
  B(p,1.25,0,.1,.5,.04,.5,'steel','#5c6a74');rod(p,[1.48,0,-.12],[1.5,1.2,-.14],.02,'steel','#5c6a74');rod(p,[1.02,0,-.12],[1.0,1.2,-.14],.02,'steel','#5c6a74')
  return true}
 case 'cdSign':hangSign(p,String(s.data?.sign),w,2.9,'#9fdcc6','#c9a54a');return true
 }
 return false
}

// ---------------- Office / stationery ----------------
function office(p:P,part:string,w:number,d:number,s:Structure,r:()=>number){
 const OAK='#9a6a3c',DARK='#5e3e22',BR='#c9a54a'
 switch(part){
 case 'ofCases':{
  for(const off of [-w/4,w/4]){const cw=w/2-.15
   B(p,off,0,0,cw,.72,d,'wood',DARK);B(p,off,.06,d/2+.01,cw-.1,.58,.012,'wood',OAK);B(p,off,.72,0,cw,.03,d,'wood',OAK)
   for(const z of [-d/2+.01,d/2-.01])B(p,off,.75,z,cw-.04,.25,.01,'glass','#e6f4fa');for(const x of [off-cw/2+.01,off+cw/2-.01])B(p,x,.75,0,.01,.25,d-.02,'glass','#e6f4fa');B(p,off,1.0,0,cw,.012,d,'glass','#e6f4fa')
   B(p,off,.755,0,cw-.06,.008,d-.06,'fabric','#7a2f35')
   for(let i=0;i<12;i++){const x=off-cw/2+.2+i*(cw-.4)/11,k=i%3
    if(k===0)for(let j=0;j<3;j++)rod(p,[x-.05+j*.05,.77,-.15],[x-.05+j*.05,.77,.15],.008,'paint',pick(r,['#1e1e1e','#7a2f35','#1d2c55','#c9a54a']))
    else if(k===1)B(p,x,.765,0,.16,.025,.22,'paper',pick(r,['#7a2f35','#2f6f6a','#1d2c55','#c88a2a']))
    else B(p,x,.765,0,.06,.09,.04,'steel',pick(r,['#c0c4c6','#c9a54a','#b8312b']))}}
  // Wall shelf with ledger spines above the cases.
  for(const y of [1.6,2.15]){B(p,0,y,-d/2+.15,w,.03,.28,'wood',OAK);for(let x=-w/2+.1;x<w/2-.1;){const bw=.04+r()*.04,bh=.22+r()*.12;B(p,x+bw/2,y+.03,-d/2+.16,bw,bh,.2,'paper',pick(r,['#7a2f35','#2f6f6a','#1d2c55','#5e3e22','#c88a2a','#3a3f46']));x+=bw+.005}}
  return true}
 case 'ofFiles':{
  B(p,0,0,0,w,2.2,d,'wood',DARK);B(p,0,2.2,0,w+.08,.06,d+.06,'wood',OAK)
  const cols=18,rows=9,cw=(w-.16)/cols,rh=(2.1-.1)/rows
  for(let c=0;c<cols;c++)for(let k=0;k<rows;k++){const x=-w/2+.08+(c+.5)*cw,y=.1+k*rh;B(p,x,y+.01,d/2+.005,cw-.02,rh-.02,.016,'wood',(c+k)%2?OAK:'#a8784a');B(p,x,y+rh*.6,d/2+.016,cw*.45,.035,.006,'brass',BR);B(p,x,y+rh*.3,d/2+.02,.04,.022,.02,'brass',BR)}
  return true}
 case 'ofCounter':{
  B(p,0,0,0,w,.95,d,'wood',DARK);B(p,0,.95,0,w+.06,.05,d+.06,'wood',OAK)
  for(let i=0;i<5;i++){const x=-w/2+.6+i*(w-1.2)/4;B(p,x,.12,d/2+.01,.9,.7,.012,'wood',OAK);B(p,x,.16,d/2+.02,.8,.62,.008,'wood','#8a5a32')}
  // Typewriter, bell, open ledger, pencil cup.
  B(p,-1.4,1.0,-.1,.46,.1,.36,'paint','#1e1e1e',.02);B(p,-1.4,1.1,-.22,.44,.1,.14,'paint','#1e1e1e',.02);hcyl(p,-1.4,1.22,-.25,.04,.52,'x','rubber','#151515',10)
  for(let i=0;i<4;i++)for(let j=0;j<10;j++)cyl(p,-1.58+j*.04,1.1,-.02+i*.04,.012,.02,'paper','#efe6cc',6)
  B(p,-1.4,1.24,-.3,.3,.18,.004,'paper','#f8f4e8')
  cyl(p,.3,1.0,.1,.06,.05,'brass',BR,12);ball(p,.3,1.06,.1,.05,'brass',BR)
  for(const sx of [-1,1]){const g=new THREE.BoxGeometry(.24,.02,.32);g.rotateZ(sx*.08);g.translate(.95+sx*.12,1.01,-.05);p.add(g,'paper','#f3ecd8')}
  cyl(p,1.7,1.0,-.1,.05,.12,'paint','#2f6f6a',10);for(let i=0;i<4;i++)rod(p,[1.7+(i-1.5)*.015,1.05,-.1],[1.7+(i-1.5)*.03,1.25,-.1],.005,'paint','#e8c21b')
  return true}
 case 'ofPaper':{
  B(p,0,0,-d/2+.02,w,2.4,.04,'wood',DARK);for(let i=0;i<=5;i++)B(p,-w/2+i*w/5,0,0,.05,2.4,d,'wood',OAK)
  for(let lv=0;lv<5;lv++){const y=.05+lv*.46;B(p,0,y,0,w,.03,d,'wood',OAK)
   for(let x=-w/2+.2;x<w/2-.25;x+=.34){const n=1+Math.floor(r()*5),c=pick(r,['#1d6f9a','#b8312b','#2f7a4a','#c88a2a','#7a4a8a']);for(let k=0;k<n;k++){B(p,x+.12,y+.03+k*.06,0,.26,.055,.34,'paper','#f8f6f0');B(p,x+.12,y+.03+k*.06,0,.06,.056,.341,'paper',c)}}}
  return true}
 case 'ofSpinner':{
  cyl(p,0,0,0,.3,.04,'steel','#3a3f45',16);rod(p,[0,.04,0],[0,1.85,0],.02,'steel','#c0c4c6')
  for(let tier=0;tier<5;tier++)for(let face=0;face<4;face++){const a=face*Math.PI/2,y=.5+tier*.27
   for(let k=0;k<3;k++){const g=new THREE.BoxGeometry(.11,.16,.008);g.rotateX(-.12);g.translate((k-1)*.12,y+.08,.2);g.rotateY(a);p.add(g,'paper',pick(r,['#f6a7c4','#9fdcc6','#f7c531','#5aa8f0','#f2f0e8','#b8312b','#7a4a8a']))}
   const rail=new THREE.BoxGeometry(.4,.01,.04);rail.translate(0,y,.2);rail.rotateY(a);p.add(rail,'steel','#c0c4c6')}
  ball(p,0,1.88,0,.04,'brass',BR)
  return true}
 case 'ofTable':{
  B(p,0,.82,0,w,.05,d,'wood',OAK);for(const [x,z] of [[-1,-1],[1,-1],[-1,1],[1,1]])B(p,x*(w/2-.08),0,z*(d/2-.08),.07,.82,.07,'wood',DARK)
  for(let i=0;i<8;i++){const x=-w/2+.3+(i%4)*.55,z=i<4?-.25:.25,c=pick(r,['#7a2f35','#2f6f6a','#1d2c55','#c88a2a','#3a3f46']),n=2+Math.floor(r()*5);for(let k=0;k<n;k++)B(p,x,.87+k*.022,z,.21,.02,.29,'paper',k===n-1?c:'#f3ecd8')}
  // Green banker's lamp.
  cyl(p,w/2-.25,.87,-.35,.07,.02,'brass',BR,12);rod(p,[w/2-.25,.89,-.35],[w/2-.25,1.15,-.35],.01,'brass',BR);hcyl(p,w/2-.25,1.17,-.35,.06,.32,'x','paint','#1f6a3a',12)
  return true}
 case 'ofDesk':{
  B(p,0,.74,0,w,.04,d,'wood',OAK);B(p,-w/2+.3,0,0,.55,.74,d-.06,'wood',DARK);B(p,w/2-.3,0,0,.55,.74,d-.06,'wood',DARK)
  for(const x of [-w/2+.3,w/2-.3])for(let k=0;k<3;k++){B(p,x,.06+k*.22,d/2-.02,.48,.18,.012,'wood',OAK);B(p,x,.15+k*.22,d/2,.1,.02,.02,'brass',BR)}
  B(p,0,.78,-d/2+.15,w-.2,.4,.18,'wood',DARK);for(let i=0;i<6;i++)B(p,-w/2+.35+i*(w-.7)/5,.82,-d/2+.24,.2,.12,.01,'paper','#f3ecd8')
  B(p,.2,.78,.05,.3,.06,.22,'paper','#e8e2cc');cyl(p,-.6,.78,.15,.04,.1,'paint','#1e1e1e',8)
  // Swivel chair.
  cyl(p,0,0,.95,.28,.04,'steel','#3a3f45',5);rod(p,[0,.04,.95],[0,.45,.95],.025,'steel','#c0c4c6');B(p,0,.45,.95,.46,.07,.44,'rubber','#5e2e22',.03);B(p,0,.52,1.16,.42,.5,.06,'rubber','#5e2e22',.03)
  return true}
 case 'ofSign':hangSign(p,String(s.data?.sign),w,2.95,'#3a2a1c',BR);return true
 }
 return false
}

// ---------------- Outdoor outfitter ----------------
function outdoor(p:P,part:string,w:number,d:number,s:Structure,r:()=>number){
 const PINE='#a9763e',LOG='#7a5534'
 switch(part){
 case 'odTent':{
  B(p,0,.004,0,w,.012,w,'fabric','#4a4632')
  const dome=new THREE.SphereGeometry(1.35,18,8,0,Math.PI*2,0,Math.PI/2);dome.scale(1,1.32,1);p.add(dome,'fabric','#3d6a3a')
  const fly=new THREE.SphereGeometry(1.42,18,6,Math.PI*.15,Math.PI*1.2,0,Math.PI*.32);fly.scale(1,1.3,1);fly.translate(0,.02,0);p.add(fly,'fabric','#d8641e')
  const door=new THREE.CircleGeometry(.55,16,0,Math.PI);door.scale(1,1.5,1);door.translate(0,0,1.36);p.add(door,'fabric','#1e2a1e')
  for(let i=0;i<4;i++){const a=i*Math.PI/2+Math.PI/4;rod(p,[Math.cos(a)*.9,1.0,Math.sin(a)*.9],[Math.cos(a)*1.55,0,Math.sin(a)*1.55],.004,'fabric','#e8e2cc');B(p,Math.cos(a)*1.55,0,Math.sin(a)*1.55,.03,.08,.03,'steel','#c0c4c6')}
  for(const sx of [-.5,.5])B(p,sx+.2,0,1.75,.28,.08,.5,'fabric',sx<0?'#2a4f8a':'#b8312b',.03)
  return true}
 case 'odRock':{
  for(let i=0;i<7;i++){const g=new THREE.DodecahedronGeometry(.55+r()*.35,0);g.scale(1.3,.55+r()*.4,1);g.rotateY(r()*3);g.computeBoundingBox();g.translate((r()-.5)*(w-1),-g.boundingBox!.min.y-.02,(r()-.5)*(d-.8));p.add(g,'stone','#8f8a80')}
  for(const [x,z,h] of [[-1.1,-.6,1.5],[1.2,-.5,1.15]] as const){cyl(p,x,0,z,.22,.3,'paint','#6a4a32',10,.18);cyl(p,x,.3,z,.05,.25,'wood','#5a3a22',6)
   for(let k=0;k<4;k++){const g=new THREE.ConeGeometry(.42-k*.08,.42,8);g.translate(x,.62+k*h*.22,z);p.add(g,'leaf','#2c5a32')}}
  B(p,.2,.55,.3,.12,.1,.28,'rubber','#5a3a22',.02);B(p,.36,.55,.3,.12,.1,.28,'rubber','#5a3a22',.02);B(p,.2,.55,.2,.12,.26,.1,'rubber','#5a3a22',.02);B(p,.36,.55,.2,.12,.26,.1,'rubber','#5a3a22',.02)
  return true}
 case 'odRope':{
  B(p,0,.6,-d/2+.03,w,2.0,.04,'wood',PINE);for(let row=0;row<3;row++)B(p,0,.9+row*.62,-d/2+.08,w,.06,.06,'wood',LOG)
  for(let row=0;row<3;row++)for(let i=0;i<11;i++){const x=-w/2+.35+i*(w-.7)/10,y=.9+row*.62
   rod(p,[x,y+.03,-d/2+.1],[x,y+.03,-d/2+.28],.012,'wood','#3a2a1a')
   if(row<2){for(let k=0;k<3;k++){const g=new THREE.TorusGeometry(.17,.022+k*.004,5,14);g.translate(x,y-.14,-d/2+.16+k*.035);p.add(g,'fabric',pick(r,['#d8641e','#2a4f8a','#e3c21b','#3d6a3a','#b8312b','#efe6cc']))}}
   else for(let k=0;k<4;k++){const g=new THREE.TorusGeometry(.04,.008,4,10);g.translate(x-.06+k*.04,y-.05,-d/2+.2);p.add(g,'steel',pick(r,['#c0c4c6','#d8641e','#3a7ad8']))}}
  return true}
 case 'odPacks':{
  B(p,0,0,-d/2+.03,w,2.2,.05,'wood',PINE);for(const x of [-w/2+.04,0,w/2-.04])B(p,x,0,0,.07,2.2,d,'wood',LOG)
  for(const [lv,y] of [[0,.08],[1,1.12]] as const){B(p,0,y,0,w-.1,.04,d-.04,'wood',LOG)
   for(let i=0;i<7;i++){const x=-w/2+.55+i*(w-1.1)/6,c=pick(r,['#b8312b','#2a4f8a','#3d6a3a','#d8641e','#5c6a74','#7a4a8a']),h=.65+r()*.25
    B(p,x,y+.04,0,.42,h,.3,'fabric',c,.08);B(p,x,y+.04+h-.08,.02,.38,.16,.32,'fabric',c,.06);B(p,x,y+.12,.16,.3,.22,.06,'fabric','#2a2a2a',.03)
    for(const sx of [-.12,.12])B(p,x+sx,y+.2,-.17,.05,h-.2,.02,'fabric','#1e1e1e');if(lv===1&&r()<.6)hcyl(p,x,y+.04+h+.08,0,.07,.4,'x','fabric',pick(r,['#3d6a3a','#d8641e']),8)}}
  return true}
 case 'odCounter':{
  B(p,0,0,0,w,.96,d,'wood',LOG);for(let k=0;k<6;k++)hcyl(p,0,.09+k*.15,d/2-.02,.08,w,'x','wood',k%2?'#8a6238':'#7a5534',8)
  B(p,0,.96,0,w+.2,.09,d+.14,'wood','#5e3e22');for(const sx of [-1,1])cyl(p,sx*(w/2+.02),0,d/2-.05,.12,1.05,'wood','#6b4a2c',8)
  // Lantern, iron register, guide book stack.
  B(p,-1.5,1.05,0,.18,.03,.18,'steel','#23262a');for(const [dx,dz] of [[-1,-1],[1,-1],[-1,1],[1,1]])B(p,-1.5+dx*.07,1.08,dz*.07,.015,.26,.015,'steel','#23262a');B(p,-1.5,1.34,0,.2,.04,.2,'steel','#23262a')
  {const g=new THREE.CylinderGeometry(.05,.05,.15,10);g.translate(-1.5,1.2,0);glow(p,g,'#ffbe6e')}
  B(p,.9,1.05,-.1,.48,.2,.38,'steel','#2a2a2a',.02);B(p,.9,1.25,-.18,.42,.14,.2,'steel','#3a3a3a',.02);B(p,.9,1.4,-.25,.24,.08,.04,'paper','#efe6cc')
  for(let k=0;k<4;k++)B(p,1.9,1.05+k*.04,.05,.26,.035,.34,'paper',pick(r,['#2c5a32','#7a2a24','#c88a2a','#2a4f8a']))
  return true}
 case 'odFirewood':{
  for(let layer=0;layer<5;layer++)for(let i=0;i<Math.floor(w/.2);i++){const rr=.07+r()*.025;hcyl(p,-w/2+.12+i*.2+(layer%2)*.08,.08+layer*.17,0,rr,d-.1,'z','wood',pick(r,['#7a5534','#8a6238','#6b4a2c']),7)
   const end=new THREE.CircleGeometry(rr*.92,7);end.translate(-w/2+.12+i*.2+(layer%2)*.08,.08+layer*.17,d/2-.04);p.add(end,'wood','#d8b48a')}
  cyl(p,w/2+.5,0,.2,.3,.45,'wood','#8a6238',12);rod(p,[w/2+.5,.45,.2],[w/2+.35,1.0,.35],.02,'wood','#b58a58');B(p,w/2+.5,.44,.18,.16,.08,.03,'steel','#3a3f45')
  return true}
 case 'odMap':{
  const key=String(s.data?.sign),[sw,sh]=signSize(p,key,w,1.8)
  B(p,0,1.95-sh/2-.05,-.02,sw+.1,sh+.1,.04,'wood','#6b4a2c');sign(p,key,0,1.95,.004,sw,sh,0);return true}
 case 'odCanoe':{
  const hull=new THREE.SphereGeometry(1,20,10,0,Math.PI*2,Math.PI/2,Math.PI/2);hull.scale(.42,.32,2.5);hull.translate(0,3.35,0);p.add(hull,'paint','#b8312b')
  const rim=new THREE.TorusGeometry(1,.025,5,40);rim.rotateX(Math.PI/2);rim.scale(.42,1,2.5);rim.translate(0,3.35,0);p.add(rim,'wood','#c8a273')
  for(const z of [-1.2,0,1.2])B(p,0,3.31,z,.8,.03,.12,'wood','#c8a273')
  for(const z of [-1.6,1.6]){rod(p,[-.4,3.33,z],[0,4.78,z],.008,'fabric','#d8c79a');rod(p,[.4,3.33,z],[0,4.78,z],.008,'fabric','#d8c79a')}
  for(const sx of [-.15,.15]){rod(p,[sx,3.0,-1.0],[sx,3.0,.4],.02,'wood','#c8a273');B(p,sx,2.92,.55,.16,.03,.4,'wood','#c8a273')}
  return true}
 case 'odStove':{
  B(p,0,.12,0,.8,.7,.6,'steel','#1e1f21',.03);for(const [x,z] of [[-1,-1],[1,-1],[-1,1],[1,1]])B(p,x*.32,0,z*.24,.06,.14,.06,'steel','#1e1f21')
  B(p,0,.25,.305,.42,.38,.02,'steel','#2a2b2e');{const g=new THREE.PlaneGeometry(.32,.26);g.translate(0,.44,.317);glow(p,g,'#ff9a3a')}
  cyl(p,0,.82,-.1,.09,3.96,'steel','#1e1f21',10);cyl(p,.22,.82,.1,.11,.14,'steel','#5c6a74',12,.08);hcyl(p,.32,.92,.1,.012,.1,'x','steel','#5c6a74',6)
  B(p,0,0,0,1.2,.03,1.2,'stone','#6a6660')
  return true}
 }
 return false
}

// ---------------- Guns（鎏金兵械库）----------------
const GN={walnut:'#5a3420',dark:'#2a1a10',brass:'#c9a04a',blued:'#23272d',felt:'#3a5a3a',iron:'#8e9296'}
/** 架上的长枪剪影：枪口朝上竖放（x,z = 枪托底；len 全长） */
function rackGun(p:P,x:number,y:number,z:number,len:number,kind:number){
 const stockL=len*.36,bar=kind===2?'#9ea2a4':GN.blued
 B(p,x,y,z,.045,stockL,.032,'wood',kind===1?'#7a4a28':GN.walnut,.01)
 B(p,x,y+stockL,z,.03,.09,.028,kind===1?'brass':'steel',kind===1?GN.brass:'#6a6e72')
 cyl(p,x,y+stockL+.09,z-.004,.0105,len-stockL-.09,'steel',bar,8)
 if(kind===0)cyl(p,x+.022,y+stockL+.09,z-.004,.0105,len*.55,'steel',bar,8) // 双管
 if(kind!==3)B(p,x,y+stockL+.09,z+.01,.032,len*.3,.02,'wood',GN.walnut,.006)
}
function guns(p:P,part:string,w:number,d:number,s:Structure,r:()=>number){
 switch(part){
 case 'gnRackWall':{
  // 背墙长枪架：胡桃木背板 + 两层枪托槽 + 顶部金字横楣
  B(p,0,.0,-d/2+.04,w,2.75,.06,'wood','#4a2c1c');B(p,0,2.75,-d/2+.06,w+.1,.14,.12,'wood',GN.dark);B(p,0,2.62,-d/2+.1,w,.025,.02,'brass',GN.brass)
  B(p,0,.0,-d/2+.25,w,.32,.4,'wood',GN.dark);B(p,0,.32,-d/2+.25,w,.03,.42,'brass',GN.brass)
  for(let row=0;row<2;row++)B(p,0,1.25+row*.05,-d/2+.12,w,.05,.1,'wood',GN.walnut)
  const n=Math.floor(w/.32)
  for(let i=0;i<n;i++){const x=-w/2+.3+i*(w-.6)/(n-1);rackGun(p,x,.34,-d/2+.2,1.1+r()*.32,i%4)}
  return true}
 case 'gnRackSide':{
  // 侧墙：上层转轮手枪挂板（绿呢 + 黄铜钉），下层弹药盒格
  B(p,0,.9,-d/2+.03,w,1.6,.04,'fabric',GN.felt);B(p,0,.86,-d/2+.06,w+.06,.05,.1,'wood',GN.dark);B(p,0,2.5,-d/2+.06,w+.06,.06,.1,'wood',GN.dark)
  for(let row=0;row<3;row++)for(let i=0;i<9;i++){const x=-w/2+.5+i*(w-1)/8,y=1.15+row*.45
   B(p,x,y,-d/2+.07,.2,.03,.03,'steel',GN.blued);B(p,x+.08,y-.1,-d/2+.07,.04,.12,.03,'wood',GN.walnut);B(p,x-.04,y+.03,-d/2+.07,.22,.04,.025,'steel',r()<.3?'#8e8a86':GN.blued)}
  B(p,0,0,0,w,.85,d,'wood','#4a2c1c');B(p,0,.85,0,w+.04,.04,d+.04,'wood',GN.dark)
  for(let i=0;i<12;i++){const x=-w/2+.35+i*(w-.7)/11;B(p,x,.88,0,.3,.16,.22,'paper',pick(r,['#8e3a2a','#4b6a40','#c9a23a','#5a6a7a','#b8a888','#6a5a46']))}
  return true}
 case 'gnCounter':{
  B(p,0,0,0,w,1.0,d,'wood',GN.walnut,.02);B(p,0,1.0,0,w+.08,.06,d+.08,'stone','#2a2622')
  for(let i=0;i<6;i++)B(p,-w/2+.6+i*(w-1.2)/5,.15,d/2+.005,.9,.7,.01,'wood','#6a3e24',.01)
  B(p,0,.12,d/2+.01,w-.1,.03,.01,'brass',GN.brass);B(p,0,.94,d/2+.01,w-.1,.03,.01,'brass',GN.brass)
  // 柜台上：清洁垫 + 一把拆开的双管 + 收银机 + 一盒爆团弹
  B(p,-1.2,1.06,0,1.4,.01,.5,'fabric',GN.felt)
  hcyl(p,-1.2,1.085,0,.012,.7,'x','steel',GN.blued,8);hcyl(p,-1.2,1.085,.03,.012,.7,'x','steel',GN.blued,8);B(p,-1.75,1.07,.0,.32,.04,.06,'wood',GN.walnut)
  B(p,1.9,1.06,0,.45,.3,.42,'brass',GN.brass,.02);B(p,1.9,1.36,-.08,.42,.18,.06,'paint','#3a2a1a')
  B(p,.6,1.06,.05,.16,.07,.11,'paper','#c9a23a');B(p,.85,1.06,.05,.16,.07,.11,'paper','#8e3a2a')
  return true}
 case 'gnCase':{
  // 玻璃展柜（转轮手枪、纸包弹）
  B(p,0,0,0,w,.75,d,'wood',GN.walnut,.02);B(p,0,.75,0,w,.02,d,'fabric','#5a1a1a')
  for(let i=0;i<3;i++){const x=-w/2+.55+i*(w-1.1)/2;B(p,x,.77,0,.22,.02,.08,'steel',GN.blued);B(p,x+.09,.77,.06,.05,.02,.1,'wood',GN.walnut);cyl(p,x-.02,.775,-.0,.021,.03,'steel','#6a6e72',10)}
  const g=new THREE.BoxGeometry(w-.02,.28,d-.02);g.translate(0,.91,0);p.add(g,'glass','#cfe6ee')
  for(const sx of [-1,1])for(const sz of [-1,1])B(p,sx*(w/2-.02),.75,sz*(d/2-.02),.03,.3,.03,'brass',GN.brass)
  return true}
 case 'gnAmmo':{
  B(p,0,0,-d/2+.03,w,2.1,.04,'wood','#4a2c1c');for(const x of [-w/2+.03,w/2-.03])B(p,x,0,0,.05,2.1,d,'wood',GN.dark)
  for(let lv=0;lv<5;lv++){const y=.1+lv*.45;B(p,0,y,0,w-.06,.03,d-.04,'wood',GN.walnut)
   for(let i=0;i<14;i++){const x=-w/2+.3+i*(w-.6)/13,h=.12+r()*.08;B(p,x,y+.03,(r()-.5)*.1,.3,h,.22,'paper',pick(r,['#8e3a2a','#4b6a40','#c9a23a','#5a6a7a','#b8a888','#6a5a46','#2a4f8a']))}}
  return true}
 case 'gnBench':{
  // 射击位长凳：胡桃木台面 + 铁架，两侧各一个弹药盘
  B(p,0,.95,0,w,.06,d,'wood',GN.walnut,.01);for(const sx of [-1,0,1])B(p,sx*(w/2-.15),0,0,.08,.95,d-.1,'steel','#3a3d42')
  B(p,0,.2,0,w-.2,.03,d-.2,'steel','#3a3d42')
  for(const x of [-1.4,1.4]){B(p,x,1.01,.05,.4,.03,.25,'steel','#5a5e62');B(p,x+.1,1.04,.05,.12,.05,.08,'paper','#c9a23a')}
  return true}
 case 'gnDivider':B(p,0,0,0,w,2.2,.08,'wood','#3a2416');B(p,0,0,-d/2+.04,w,2.2,.08,'wood','#3a2416');B(p,0,1.0,0,w+.02,1.1,d-.08,'fabric','#7a766a');B(p,0,2.18,0,w+.03,.04,d,'wood','#3a2416');return true
 case 'gnPartition':{
  // 靶道隔墙：营业厅一侧护墙板 + 墙纸，靶道一侧吸音棉
  B(p,0,0,0,.12,4.78,d,'paint','#6a645a');B(p,w/2-.03,0,0,.04,1.1,d,'wood','#4a2c1c');B(p,w/2-.028,1.08,0,.045,.06,d,'brass',GN.brass)
  B(p,w/2-.03,1.14,0,.035,3.64,d,'shop:gn_wall','#ffffff') // 营业厅一侧：同店墙纸
  for(let i=0;i<Math.floor(d/.6);i++)B(p,-w/2+.04,.4,-d/2+.3+i*.6,.06,3.9,.56,'fabric',i%2?'#6e6a60':'#7a766a',.02) // 靶道一侧：吸音棉
  return true}
 case 'gnHalfWall':B(p,0,0,0,w,1.2,d,'wood',GN.walnut,.02);B(p,0,1.2,0,w+.06,.05,d+.06,'brass',GN.brass);return true
 case 'gnSandbags':{
  // 沙袋挡墙 + 后面的钢板弹挡
  B(p,0,0,-d/2+.06,w,2.5,.1,'steel','#4a4e52')
  for(let row=0;row<8;row++)for(let i=0;i<9;i++){const x=-w/2+.35+i*(w-.7)/8+(row%2?.3:0);if(x>w/2-.25)continue
   const g=new THREE.SphereGeometry(.34,10,6);g.scale(1,.38,.62);g.translate(x,.13+row*.27,.05+(r()-.5)*.06);p.add(g,'fabric',pick(r,['#a89a74','#9a8c66','#b2a47e']))}
  return true}
 case 'gnBaffle':B(p,0,3.75,0,w,.8,.1,'steel','#7a7e80');B(p,0,3.75,.06,w,.8,.02,'fabric','#6e6a60');return true
 case 'gnTarget':{
  // 纸靶：木框 + 白纸 + 黑色环；挂在顶上的导轨上
  const y0=1.05,hgt=.8,ring=Number(s.data?.ring??1)
  B(p,0,y0,0,w,hgt,.02,'paper','#efe8d6')
  for(let k=0;k<5;k++){const c=new THREE.RingGeometry(.05+k*.05,.058+k*.05,24);c.translate(0,y0+.4,.012+k*.0005);p.add(c,'paint','#1e1e1e')}
  const bull=new THREE.CircleGeometry(.05,20);bull.translate(0,y0+.4,.013);p.add(bull,'paint','#b8312b')
  B(p,0,y0-.03,0,w+.04,.03,.03,'wood',GN.dark);B(p,0,y0+hgt,0,w+.04,.03,.03,'wood',GN.dark)
  for(const sx of [-1,1])rod(p,[sx*(w/2-.05),y0+hgt,0],[sx*(w/2-.05),4.4,0],.005,'steel','#2a2a2a')
  B(p,0,4.4,0,.12,.05,.08,'steel','#2a2a2a');void ring
  return true}
 case 'gnSign':hangSign(p,String(s.data?.sign),w,2.75,GN.dark,'#b08a3a');return true
 case 'gnSafe':{B(p,0,0,0,w,1.9,d,'steel','#2a3a2a',.03);B(p,0,1.0,d/2+.01,.3,.3,.02,'brass',GN.brass);cyl(p,.3,.95,d/2+.02,.06,.03,'brass',GN.brass,12);B(p,0,1.6,d/2+.01,w-.2,.06,.01,'brass',GN.brass);return true}
 case 'gnRug':B(p,0,.004,0,w,.012,d,'fabric','#6a1e1a');B(p,0,.011,0,w-.3,.004,d-.3,'fabric','#c9a04a');B(p,0,.012,0,w-.4,.004,d-.4,'fabric','#5a1a16');return true
 }
 return false
}

export function buildTradersShopProp(kind:DressingKind,p:DressingParts,w:number,d:number,s:Structure):boolean{
 if(kind!=='shopPiece')return false
 const shop=TRADERS_SHOPS.find(x=>x.id===s.data?.shop),part=String(s.data?.part??'')
 if(!shop)return true
 const r=rnd(Number(s.data?.seed??0)*131+part.length*17+7)
 // The shared 'wood' scan is very dark (mean ≈ #41342e); shop joinery uses the shop oak scan, tinted to the authored colour.
 const add=p.add
 p.add=function(this:P,g:THREE.BufferGeometry,surface:string,color:string,uv=true){if(surface==='wood'){surface='shop:hw_floor';color=woodTint(color)}add.call(this,g,surface,color,uv)}
 try{
  if(part==='shell'){shell(p,shop);return true}
  return hardware(p,part,w,d,s,r)||workwear(p,part,w,d,s,r)||candy(p,part,w,d,s,r)||office(p,part,w,d,s,r)||outdoor(p,part,w,d,s,r)||guns(p,part,w,d,s,r)||true
 }finally{p.add=add}
}
const WOOD_MEAN=[167,125,80]
function woodTint(c:string){const n=parseInt(c.slice(1),16),v=[n>>16&255,n>>8&255,n&255];return'#'+v.map((x,i)=>Math.min(255,Math.round(x*255/WOOD_MEAN[i]*.95)).toString(16).padStart(2,'0')).join('')}
