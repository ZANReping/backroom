import * as THREE from 'three'
import type {Structure} from '../core/types'
import type {DressingKind} from '../content/tradersDressingShapes'
import type {DressingParts} from './tradersDressingParts'
import {MARKET,MARKET_DEPTS} from '../content/tradersMarket'
import {prepareRefinedItemTextures} from './refinedItemMesh'

/**
 * 主力店 A · 批发市场的实体模型：部门档口、整托货架、结算台、会员服务台、收货区设备。
 * 商品包装用 AI 生成的 goods_atlas（1024×2048，4×8 格，每格 256px，8px 留边；16–23 为 v2 新档口），标牌用 signs_atlas。
 * 所有几何在 DressingParts 里按材质合批（每个道具一组网格）。
 */
type Goods='water'|'grocery'|'pharmacy'|'power'|'hardware'|'workwear'|'office'|'outdoor'|'liquids'|'rations'|'medkits'|'fuel'
const TILES:Record<Goods,number[]>={water:[0,1,2,3],grocery:[4,5,15],pharmacy:[6,7,15],power:[8,9,10],hardware:[11,15,14],workwear:[12,15],office:[13,15],outdoor:[14,10,15],liquids:[16,17,15],rations:[18,19,15],medkits:[20,21,15],fuel:[22,23,15]}
const C={steel:'#9aa1a6',dark:'#2a2f33',blue:'#2f5ea8',orange:'#e06a1e',wood:'#b59268',pallet:'#a9875c',wrap:'#d9dcd8',yellow:'#e8b51c',red:'#b8312b',rubber:'#202325'}
const rnd=(seed:number)=>{let s=(seed*2654435761)>>>0||1;return()=>{s^=s<<13;s>>>=0;s^=s>>17;s^=s<<5;s>>>=0;return s/4294967296}}

function tileUV(g:THREE.BufferGeometry,tile:number){const uv=g.getAttribute('uv');for(let i=0;i<uv.count;i++)uv.setXY(i,(tile%4*256+8+uv.getX(i)*240)/1024,1-(Math.floor(tile/4)*256+8+(1-uv.getY(i))*240)/2048)}
function goodsBox(p:DressingParts,tile:number,x:number,y:number,z:number,w:number,h:number,d:number,tint='#ffffff',rot=0){
 const g=new THREE.BoxGeometry(w,h,d);tileUV(g,tile);if(rot)g.rotateY(rot);g.translate(x,y+h/2,z);p.add(g,'goods',tint,false)
}
function sign(p:DressingParts,key:string,x:number,y:number,z:number,w:number,h:number,angle=0){
 const g=p.assets.signGeometry(key,w,h);g.rotateY(angle);g.translate(x,y,z);p.add(g,'sign','#ffffff',false)
}
function cyl(p:DressingParts,x:number,y:number,z:number,r:number,h:number,surface:string,color:string,seg=8){const g=new THREE.CylinderGeometry(r,r,h,seg);g.translate(x,y+h/2,z);p.add(g,surface,color)}

/** One product unit on a shelf, sized to its department; y is the shelf surface. */
function product(p:DressingParts,goods:Goods,r:()=>number,x:number,y:number,z:number,span:number,depth:number,maxH:number){
 const t=TILES[goods],tile=t[Math.floor(r()*t.length)]
 switch(goods){
 case 'water':{
  if(r()<.45){goodsBox(p,tile,x,y,z,span*.9,Math.min(maxH,.32),depth*.85);break}
  const n=Math.max(2,Math.floor(span/.13));for(let i=0;i<n;i++)cyl(p,x-span/2+(i+.5)*span/n,y,z,.05,Math.min(maxH,.3),'glass',tile===1?'#7fb4d8':'#d8c7a3',6)
  break}
 case 'grocery':{
  if(r()<.5){const n=Math.max(2,Math.floor(span/.11));for(let i=0;i<n;i++)for(const dz of [-.08,.08])cyl(p,x-span/2+(i+.5)*span/n,y,z+dz,.045,.12,'steel',i%2?'#c9c9c4':'#b8312b',6)}
  else if(r()<.5)p.box(x,y+Math.min(maxH,.3)/2,z,span*.9,Math.min(maxH,.3),depth*.8,'fabric','#a68a5b',.04)
  else goodsBox(p,tile,x,y,z,span*.9,Math.min(maxH,.28),depth*.85)
  break}
 case 'pharmacy':{
  const n=Math.max(2,Math.floor(span/.16));for(let i=0;i<n;i++)goodsBox(p,tile,x-span/2+(i+.5)*span/n,y,z,span/n*.85,Math.min(maxH,.14+r()*.08),depth*.6)
  break}
 case 'power':{
  const n=Math.max(2,Math.floor(span/.2));for(let i=0;i<n;i++){goodsBox(p,tile,x-span/2+(i+.5)*span/n,y,z,span/n*.8,Math.min(maxH,.22),.05);goodsBox(p,tile,x-span/2+(i+.5)*span/n,y,z-.12,span/n*.8,Math.min(maxH,.22),.05)}
  break}
 case 'hardware':{
  const k=r();if(k<.3){for(let i=0;i<3;i++)p.box(x,y+.03+i*.06,z,span*.95,.05,depth*.5,'wood','#c8a273')}
  else if(k<.55)p.box(x,y+.09,z,span*.6,.18,depth*.45,'paint','#b8312b',.01)
  else goodsBox(p,tile,x,y,z,span*.85,Math.min(maxH,.24),depth*.7)
  break}
 case 'workwear':{
  const cols=['#2b3a5e','#e8b51c','#5c6a74','#a34b2b','#3d4a3a'];const n=Math.max(1,Math.floor(span/.38))
  for(let i=0;i<n;i++){const hh=Math.min(maxH,.12+r()*.18);p.box(x-span/2+(i+.5)*span/n,y+hh/2,z,span/n*.85,hh,depth*.7,'fabric',cols[Math.floor(r()*cols.length)],.02)}
  if(r()<.4)goodsBox(p,tile,x,y+Math.min(maxH,.2),z+depth*.2,span*.4,.12,.05)
  break}
 case 'office':{
  const n=Math.max(1,Math.floor(span/.3));for(let i=0;i<n;i++)goodsBox(p,tile,x-span/2+(i+.5)*span/n,y,z,span/n*.8,Math.min(maxH,.08+r()*.2),depth*.6)
  break}
 // v2 新档口（2026-10-23）
 case 'liquids':{ // 琥珀色记忆汁玻璃罐 / 细长药瓶 / 整箱
  const k=r();if(k<.4){const n=Math.max(2,Math.floor(span/.15));for(let i=0;i<n;i++){const xx=x-span/2+(i+.5)*span/n,hh=Math.min(maxH,.17);cyl(p,xx,y,z,.06,hh-.025,'paint',i%3?'#c8782e':'#d9a05a',8);cyl(p,xx,y+hh-.025,z,.058,.025,'steel','#b0a47e',8)}}
  else if(k<.7){const n=Math.max(3,Math.floor(span/.07));for(let i=0;i<n;i++)for(const dz of [-.07,.07]){const xx=x-span/2+(i+.5)*span/n;cyl(p,xx,y,z+dz,.024,Math.min(maxH,.1),'paint',r()<.5?'#dfece9':'#d98a7e',6);cyl(p,xx,y+Math.min(maxH,.1),z+dz,.011,.025,'fabric','#a8804e',5)}}
  else goodsBox(p,tile,x,y,z,span*.85,Math.min(maxH,.26),depth*.7)
  break}
 case 'rations':{ // 金色口粮罐（堆叠）/ 紫色礼盒 / 润唇膏陈列盒
  const k=r();if(k<.4){const n=Math.max(2,Math.floor(span/.14));for(let i=0;i<n;i++)for(let lv=0;lv<2;lv++)cyl(p,x-span/2+(i+.5)*span/n,y+lv*.1,z,.055,.095,'steel','#c9a640',10)}
  else if(k<.7){const n=Math.max(2,Math.floor(span/.22));for(let i=0;i<n;i++)goodsBox(p,TILES.rations[1],x-span/2+(i+.5)*span/n,y,z,span/n*.8,Math.min(maxH,.12),depth*.5)}
  else goodsBox(p,TILES.rations[0],x,y,z,span*.85,Math.min(maxH,.24),depth*.7)
  break}
 case 'medkits':{ // 红色 / 橙色硬壳急救箱（带白十字面板）
  const n=Math.max(1,Math.floor(span/.32));for(let i=0;i<n;i++){
   const xx=x-span/2+(i+.5)*span/n,adv=r()<.4,hh=Math.min(maxH,adv?.22:.18)
   if(r()<.25){goodsBox(p,TILES.medkits[adv?1:0],xx,y,z,span/n*.85,hh+.04,depth*.6);continue}
   p.box(xx,y+hh/2,z,span/n*.82,hh,depth*.42,'paint',adv?'#e2741e':'#c8282a',.02)
   p.box(xx,y+hh/2,z+depth*.21+.004,.05,.12*hh/.18,.006,'paint','#f2f0e8');p.box(xx,y+hh/2,z+depth*.21+.004,.12*hh/.18,.05,.006,'paint','#f2f0e8')
   p.box(xx,y+hh+.015,z,.1,.03,.025,'paint','#2a2a2c')}
  break}
 case 'fuel':{ // 红色火油桶 / 火盐纸箱 / 瓶装闪电烧瓶
  const k=r();if(k<.4){const n=Math.max(1,Math.floor(span/.24));for(let i=0;i<n;i++){const xx=x-span/2+(i+.5)*span/n,hh=Math.min(maxH,.3);p.box(xx,y+hh/2,z,.18,hh,depth*.42,'paint','#b8312b',.015);p.box(xx-.04,y+hh+.015,z,.08,.03,.03,'paint','#2a2a2c')}}
  else if(k<.65){const n=Math.max(2,Math.floor(span/.16));for(let i=0;i<n;i++){const xx=x-span/2+(i+.5)*span/n;cyl(p,xx,y,z,.055,Math.min(maxH,.1),'paint','#4f9fe8',8);cyl(p,xx,y+.1,z,.016,.04,'paint','#cfe6f6',6);cyl(p,xx,y+.14,z,.017,.02,'fabric','#a8804e',6)}}
  else{const n=Math.max(2,Math.floor(span/.18));for(let i=0;i<n;i++)goodsBox(p,TILES.fuel[0],x-span/2+(i+.5)*span/n,y,z,span/n*.85,Math.min(maxH,.13),depth*.6)}
  break}
 case 'outdoor':{
  if(r()<.5){const g=new THREE.TorusGeometry(Math.min(.16,span*.3),.045,5,12);g.rotateX(Math.PI/2);g.translate(x,y+.05,z);p.add(g,'fabric',r()<.5?'#e06a1e':'#2a4f8a')}
  else if(r()<.5){const g=new THREE.CylinderGeometry(.09,.09,span*.85,8);g.rotateZ(Math.PI/2);g.translate(x,y+.09,z);p.add(g,'fabric',r()<.5?'#3d5a3a':'#7a3a2a')}
  else goodsBox(p,tile,x,y,z,span*.85,Math.min(maxH,.26),depth*.7)
  break}
 }
}
/** Gondola shelving run along local x, back at z0, facing +z (rotate the result for other faces). */
function gondola(p:DressingParts,goods:Goods,r:()=>number,cx:number,cz:number,len:number,angle:number,H=2.1,levels=5){
 const cos=Math.cos(angle),sin=Math.sin(angle),at=(lx:number,lz:number)=>[cx+lx*cos+lz*sin,cz-lx*sin+lz*cos] as const
 const bx=(lx:number,y:number,lz:number,w:number,h:number,d:number,s:string,c:string)=>{const g=new THREE.BoxGeometry(w,h,d);g.rotateY(angle);const [x,z]=at(lx,lz);g.translate(x,y+h/2,z);p.add(g,s,c)}
 bx(0,0,-.42,len,H,.05,'paint','#d5d7d6')
 for(const lx of [-len/2+.03,len/2-.03])bx(lx,0,0,.05,H,.9,'steel',C.steel)
 bx(0,0,0,len,.12,.9,'paint','#2f3438')
 for(let lv=0;lv<levels;lv++){
  const y=.12+lv*(H-.25)/levels;bx(0,y,0,len-.06,.03,.86,'steel',C.steel);bx(0,y-.01,.44,len-.06,.05,.012,'paint','#f2f2ee')
  const n=Math.max(2,Math.round(len/.55)),span=(len-.1)/n
  for(let i=0;i<n;i++){
   if(r()<.07)continue
   const lx=-len/2+.05+(i+.5)*span,[x,z]=at(lx,0)
   const sub=new ShelfProxy(p,angle,x,z);product(sub as unknown as DressingParts,goods,r,0,y+.03,0,span,.8,(H-.25)/levels-.06)
  }
 }
}
/** Rotates/translates whatever product() emits so shelves can face any direction. */
class ShelfProxy{
 readonly assets;readonly buckets
 readonly p:DressingParts;readonly angle:number;readonly x:number;readonly z:number
 constructor(p:DressingParts,angle:number,x:number,z:number){this.p=p;this.angle=angle;this.x=x;this.z=z;this.assets=p.assets;this.buckets=p.buckets}
 add(g:THREE.BufferGeometry,s:string,c:string,uv=true){g.rotateY(this.angle);g.translate(this.x,0,this.z);this.p.add(g,s,c,uv)}
 box(x:number,y:number,z:number,w:number,h:number,d:number,s:string,c:string){const g=new THREE.BoxGeometry(w,h,d);g.translate(x,y,z);this.add(g,s,c)}
}
function pallet(p:DressingParts,x:number,y:number,z:number,w=1.2,d=1.0){
 for(const dz of [-d/2+.05,0,d/2-.05])p.box(x,y+.05,z+dz,w,.1,.1,'wood',C.pallet)
 for(let i=0;i<7;i++)p.box(x-w/2+.08+i*(w-.16)/6,y+.125,z,.1,.025,d,'wood',C.pallet)
}
function load(p:DressingParts,goods:Goods,r:()=>number,x:number,y:number,z:number,h:number,w=1.15,d=.95){
 const t=TILES[goods],tile=t[Math.floor(r()*t.length)]
 if(r()<.55){goodsBox(p,tile,x,y,z,w,h,d,'#f4f4f4');p.box(x,y+h+.005,z,w*.98,.01,d*.98,'glass',C.wrap)}
 else{const rows=Math.max(1,Math.round(h/.32)),hh=h/rows;for(let row=0;row<rows;row++)for(const sx of [-1,1])for(const sz of [-1,1])goodsBox(p,tile,x+sx*w/4,y+row*hh,z+sz*d/4,w/2-.02,hh-.01,d/2-.02,'#ececec',row%2?Math.PI/2:0)}
}
export function buildTradersMarketProp(kind:DressingKind,p:DressingParts,w:number,d:number,s:Structure):boolean{
 const r=rnd(Number(s.data?.seed??0)+String(s.data?.tradersId??'').length*97+Math.round(s.x*13+s.y*7)),goods=(s.data?.goods??'grocery') as Goods
 switch(kind){
 case 'mkStall':{
  prepareRefinedItemTextures('memoryjuice')
  const dept=MARKET_DEPTS.find(x=>x.id===s.data?.dept)!,col=dept.color
  // Epoxy stall floor + safety edge, counter, three-sided gondola shelving, end-cap pallets, centre island.
  p.box(0,.003,0,w-.1,.006,d-.1,'paint','#8d8f8c')
  p.box(0,.007,d/2-.06,w-.1,.006,.1,'paint','#e8b51c')
  p.box(0,.45,d/2-.45,6.2,.9,.88,'paint',col,.02);p.box(0,.92,d/2-.45,6.35,.05,1.0,'stone','#c9c6bd');p.box(0,.06,d/2-.02,6.1,.12,.03,'rubber',C.rubber)
  p.box(-1.9,1.02,d/2-.55,.42,.16,.34,'paint','#2a2f33',.01);p.box(-1.9,1.25,d/2-.62,.36,.24,.04,'screen','#9db7a8');p.box(1.6,.98,d/2-.5,.5,.08,.42,'steel',C.steel)
  for(let i=0;i<5;i++)product(p,dept.goods,r,-.9+i*.55,.945,d/2-.55,.45,.4,.3)
  gondola(p,dept.goods,r,0,-d/2+.58,w-2.0,0,2.25)
  for(const side of [-1,1])gondola(p,dept.goods,r,side*(w/2-.58),-.4,d-2.0,side<0?Math.PI/2:-Math.PI/2,2.25)
  for(const side of [-1,1]){pallet(p,side*4.25,0,d/2-.7,1.9,1.1);load(p,dept.goods,r,side*4.25,.14,d/2-.7,.95+r()*.3,1.8,1.0)}
  p.box(0,.45,-1,5.2,.9,1.0,'paint','#d8d8d4',.02);p.box(0,.92,-1,5.3,.04,1.1,'steel',C.steel)
  for(let i=0;i<8;i++)product(p,dept.goods,r,-2.2+i*.63,.94,-1,.55,.8,.55)
  // Hanging department sign over the counter, both faces, on two cables.
  const sw=3.9,sh=.86
  p.box(0,3.55+sh/2+.05,d/2-.45,sw+.1,sh+.1,.06,'paint','#ffffff');for(const side of [-1,1])sign(p,String(s.data?.sign),0,3.55+sh/2+.05,d/2-.45+side*.033,sw,sh,side<0?Math.PI:0)
  for(const sx of [-sw/2+.3,sw/2-.3])p.rod(new THREE.Vector3(sx,3.55+sh+.1,d/2-.45),new THREE.Vector3(sx,4.8,d/2-.45),.008,'steel',C.steel)
  return true}
 case 'mkRack':{
  const H=Number(s.data?.height??4.15),bays=3,wi=w-.2,bw=wi/bays
  for(let i=0;i<=bays;i++)for(const z of [-d/2+.05,d/2-.05]){const x=-wi/2+i*bw;p.box(x,H/2,z,.09,H,.07,'paint',C.blue);p.box(x,.02,z,.18,.04,.16,'steel',C.steel)}
  for(let i=0;i<=bays;i++)for(let k=0;k<5;k++){const x=-wi/2+i*bw,y=.3+k*(H-.5)/5;p.rod(new THREE.Vector3(x,y,-d/2+.05),new THREE.Vector3(x,y+.7,d/2-.05),.014,'steel',C.blue)}
  const levels=[0,1.42,2.82]
  for(const y of levels.slice(1))for(const z of [-d/2+.05,d/2-.05])p.box(0,y-.06,z,wi,.12,.06,'paint',C.orange)
  for(let i=0;i<bays;i++)for(const [li,y] of levels.entries()){
   const x0=-wi/2+i*bw+bw/2
   for(const px of [-bw/4,bw/4]){
    if(li===2&&r()<.3)continue
    const x=x0+px*1.02;pallet(p,x,y,0,bw/2-.12,d-.08);load(p,goods,r,x,y+.14,0,li===2?.7+r()*.55:.8+r()*.4,bw/2-.18,d-.16)
   }
   if(li===0)p.box(x0,1.25,d/2-.02,.32,.08,.012,'paper','#f3f1e8')
  }
  return true}
 case 'mkCheckout':{
  p.box(0,.44,0,w,.88,d,'paint','#3a3f45',.02);p.box(-.6,.9,0,w-1.4,.04,d*.8,'rubber',C.rubber);p.box(-.6,.93,0,w-1.5,.012,d*.7,'rubber','#121416')
  p.box(1.55,.9,0,1.3,.05,d*.95,'stone','#c9c6bd');p.box(1.6,1.0,-.28,.32,.18,.28,'steel',C.dark);p.box(1.6,1.28,-.33,.34,.26,.04,'screen','#8fb0a3')
  p.box(1.15,1.02,.25,.22,.12,.16,'paint',C.dark);p.box(2.1,.55,0,.4,.55,d*.9,'steel',C.steel)
  p.box(-w/2+.04,.5,0,.08,1.0,d,'steel',C.steel)
  p.rod(new THREE.Vector3(w/2-.25,.9,0),new THREE.Vector3(w/2-.25,2.55,0),.03,'steel',C.steel)
  p.box(w/2-.25,2.86,0,.16,.62,1.14,'paint',C.dark)
  for(const side of [-1,1])sign(p,String(s.data?.sign),w/2-.25+side*.085,2.86,0,1.1,.55,side*Math.PI/2)
  return true}
 case 'mkService':{
  p.box(0,.5,0,w,1.0,d,'paint','#20324f',.02);p.box(0,1.03,0,w,.06,d,'stone','#d7d3c8');p.box(0,.1,d/2+.01,w-.2,.08,.02,'steel',C.steel)
  for(let x=-w/2+1;x<w/2;x+=2.2){p.box(x,1.08,-.2,.36,.06,.26,'steel',C.dark);p.box(x,1.35,-.3,.5,.32,.04,'screen','#93b3a7')}
  const sw=4.2,sh=1.1;p.box(0,2.66+sh/2,0,sw+.12,sh+.12,.08,'paint','#f2f2f0');for(const side of [-1,1])sign(p,String(s.data?.sign),0,2.66+sh/2,side*.044,sw,sh,side<0?Math.PI:0)
  for(const sx of [-sw/2+.4,sw/2-.4])p.rod(new THREE.Vector3(sx,2.66+sh+.06,0),new THREE.Vector3(sx,4.8,0),.008,'steel',C.steel)
  return true}
 case 'mkCarts':{
  for(const z of [-d/2+.05,d/2-.05])p.rod(new THREE.Vector3(-w/2,.9,z),new THREE.Vector3(w/2,.9,z),.025,'steel',C.steel)
  for(const x of [-w/2,0,w/2])for(const z of [-d/2+.05,d/2-.05])p.rod(new THREE.Vector3(x,0,z),new THREE.Vector3(x,.9,z),.03,'steel',C.steel)
  for(let row=0;row<2;row++)for(let i=0;i<5;i++){
   const x=-w/2+.3+i*.42,z=row?.55:-.55
   p.box(x,.62,z,.36,.38,.86,'glass','#9aa3a8');p.box(x,.42,z,.38,.02,.9,'steel',C.steel);p.box(x,.98,z+.45,.4,.035,.035,'paint',C.red)
   for(const dz of [-.36,.36])cyl(p,x,0,z+dz,.05,.06,'rubber',C.rubber,6)
  }
  p.rod(new THREE.Vector3(w/2-.45,0,0),new THREE.Vector3(w/2-.45,1.9,0),.03,'steel',C.steel);sign(p,'mk_carts',w/2-.45,1.85,.035,.85,.38,0);sign(p,'mk_carts',w/2-.45,1.85,-.035,.85,.38,Math.PI)
  return true}
 case 'mkBoard':{
  p.box(0,1.15,0,w,2.1,.12,'paint','#262a2e',.02)
  // Current bank policy supersedes the supplied CASH ONLY artwork. Typeset real text
  // on the existing plate atlas so both Chinese and credit terms stay accurate.
  for(const [text,y] of [['TRADERS WHOLESALE',1.86],['每个轮班均营业',1.49],['压印币 / BNTG 信用点',1.03],['支持现金、信用点及混合支付',.66]] as const){
   const g=p.assets.labelGeometry(text,w-.08,.23);g.translate(0,y,.065);p.add(g,'label','#ffffff',false)
  }
  return true}
 case 'mkDockDoor':{
  const dw=3.6,dh=3.7
  for(let i=0;i<16;i++)p.box(0,.05+i*dh/16+dh/32,.02,dw,dh/16-.012,.05,'steel','#b9bcbb')
  p.box(0,dh+.2,0,dw+.4,.4,.2,'steel','#7d8487');for(const side of [-1,1]){p.box(side*(dw/2+.12),dh/2,0,.12,dh,.16,'steel','#7d8487');p.box(side*(dw/2+.5),.6,.14,.22,1.2,.22,'paint',C.yellow);p.box(side*(dw/2-.2),.3,.14,.4,.35,.12,'rubber',C.rubber)}
  p.box(0,.004,.9,dw,.008,1.2,'paint',C.yellow);for(let i=0;i<6;i++)p.box(-dw/2+.3+i*.62,.009,.9,.2,.008,1.2,'paint','#1f1f1f')
  sign(p,String(s.data?.sign),0,dh+.62,.11,1.6,.42,0)
  return true}
 case 'mkForklift':{
  p.box(0,.55,.2,1.05,.75,1.9,'paint',C.yellow,.04);p.box(0,.55,1.25,1.1,.85,.4,'paint','#3a3d40',.03)
  for(const [x,z,rr] of [[-.48,-.45,.26],[.48,-.45,.26],[-.48,.95,.22],[.48,.95,.22]] as const){const g=new THREE.CylinderGeometry(rr,rr,.22,10);g.rotateZ(Math.PI/2);g.translate(x,rr,z);p.add(g,'rubber',C.rubber)}
  p.box(0,1.05,.55,.5,.12,.5,'fabric','#222');p.box(0,1.35,.8,.5,.5,.1,'fabric','#222')
  for(const x of [-.45,.45]){p.rod(new THREE.Vector3(x,.95,-.25),new THREE.Vector3(x,2.15,-.25),.03,'steel',C.dark);p.rod(new THREE.Vector3(x,.95,1.05),new THREE.Vector3(x,2.15,1.05),.03,'steel',C.dark)}
  p.box(0,2.18,.4,1.0,.06,1.45,'steel',C.dark)
  for(const x of [-.32,.32])p.box(x,1.15,-.85,.1,2.3,.1,'steel','#4a4e52');p.box(0,.45,-.92,.8,.1,.06,'steel','#4a4e52')
  for(const x of [-.28,.28])p.box(x,.06,-1.45,.12,.05,1.1,'steel','#4a4e52')
  p.box(0,.7,-.25,.3,.35,.1,'paint','#2a2f33');return true}
 case 'mkWrap':{
  cyl(p,0,0,0,w/2,.08,'steel','#5b6064',16);p.box(w/2-.07,1.2,0,.14,2.4,.14,'paint',C.dark);cyl(p,w/2-.05,.6,.15,.07,.5,'glass',C.wrap,8)
  pallet(p,0,.08,0,1.15,1.0);load(p,(['water','grocery','power'] as Goods[])[Math.floor(r()*3)],r,0,.22,0,1.3,1.1,.95);return true}
 case 'mkJack':{
  for(const x of [-.2,.2])p.box(x,.05,-.15,.16,.06,1.2,'paint',C.red);p.box(0,.2,.55,.55,.3,.25,'paint',C.red)
  p.rod(new THREE.Vector3(0,.3,.62),new THREE.Vector3(0,1.15,.78),.02,'steel',C.dark);p.box(0,1.16,.79,.3,.04,.04,'rubber',C.rubber);return true}
 case 'mkPalletStack':{
  const H=Number(s.data?.height??1)
  if(s.data?.empty){for(let i=0;i<Math.max(1,Math.round(H/.15));i++)pallet(p,0,i*.15,0,w-.02,d-.02);return true}
  pallet(p,0,0,0,w-.02,d-.02);load(p,goods,r,0,.14,0,H-.14,w-.08,d-.08);return true}
 case 'mkFloor':{
  // Painted power-aisle edges, cross-aisle hatching at receiving, checkout mats.
  const cx=s.x+s.w/2,cz=s.y+s.h/2,X=(x:number)=>x-cx,Z=(y:number)=>y-cz
  for(const ax of [MARKET.aisle0-.2,MARKET.aisle1+.2])p.box(X(ax),.004,Z((MARKET.y0+28.6+MARKET.y1-7.6)/2),.12,.008,MARKET.y1-7.6-(MARKET.y0+28.6),'paint',C.yellow)
  for(let i=0;i<14;i++)p.box(X(MARKET.x0+12+i*3.2),.004,Z(MARKET.y0+15.1),1.4,.008,.25,'paint',C.yellow)
  for(let i=0;i<3;i++)p.box(X(MARKET.x0+5.2+i*6.6),.006,Z(MARKET.y1-6.8),.9,.012,4.4,'rubber','#1d2022')
  p.box(X(MARKET.door),.006,Z(MARKET.y1-1.6),7,.012,2.8,'rubber','#22272b')
  return true}
 case 'mkHangSign':{
  const sh=Number(s.data?.signH??1),key=String(s.data?.sign),y=Number(s.data?.bottom??2.8)
  const sg=p.assets.signGeometry(key,w,sh);sg.computeBoundingBox();const bw=sg.boundingBox!.max.x-sg.boundingBox!.min.x,bh=sg.boundingBox!.max.y-sg.boundingBox!.min.y;sg.dispose()
  p.box(0,y+.03+bh/2,0,bw+.06,bh+.06,.04,'paint','#f0f0ee');for(const side of [-1,1])sign(p,key,0,y+.03+bh/2,side*.024,bw,bh,side<0?Math.PI:0)
  for(const sx of [-bw/2+.12,bw/2-.12])p.rod(new THREE.Vector3(sx,y+bh+.06,0),new THREE.Vector3(sx,4.8,0),.006,'steel',C.steel)
  return true}
 }
 return false
}
