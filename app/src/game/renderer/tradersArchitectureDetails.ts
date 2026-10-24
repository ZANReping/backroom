import * as THREE from 'three'
import type {Builder} from './tradersMeshes'
import {tradersRoomSign,tradersSignKey,tradersSignAspect} from '../content/tradersSigns'
import {TRADERS_ROOMS,TRADERS_SHOP_GLAZING,TRADERS_ZONES,TRADERS_VAULT_BOUNDS,TRADERS_PASSAGES,tradersContains,tradersIntersects,type TradersRect,type TradersPassage,type TradersWall} from '../content/tradersLayout'
const own=(r:TradersRect,x:number,z:number)=>tradersContains(r,x,z)
/** Stop wall-skirt/cornice end caps at new openings; padding is only safe on the solid side. */
export function tradersWallFinishBounds(w:TradersWall,clipped:TradersRect,pad:number):TradersRect{
 const horizontal=w.w>=w.h,start=horizontal?w.x:w.y,end=start+(horizontal?w.w:w.h),fixed=horizontal?w.y+w.h/2:w.x+w.w/2
 let low=pad,high=pad
 for(const p of TRADERS_PASSAGES){
  if(p.axis!==(horizontal?'x':'y')||Math.abs((horizontal?p.y:p.x)-fixed)>.001)continue
  const center=horizontal?p.x:p.y
  if(Math.abs(start-center-p.width/2)<.001)low=Math.min(pad,(horizontal?clipped.x:clipped.y)-start)
  if(Math.abs(end-center+p.width/2)<.001)high=Math.min(pad,end-(horizontal?clipped.x+clipped.w:clipped.y+clipped.h))
 }
 return horizontal?{x:clipped.x-low,y:clipped.y-pad,w:clipped.w+low+high,h:clipped.h+pad*2}:{x:clipped.x-pad,y:clipped.y-low,w:clipped.w+pad*2,h:clipped.h+low+high}
}
/** Minimum-corner boxes; the 12mm trim overlap hides coplanar structural wall caps. */
export function buildTradersPassageFrame(b:Builder,p:TradersPassage){
 const surface=p.kind==='public'?'stone':'steel',color=p.kind==='public'?'#b8ad94':'#858d82'
 const box=(u:number,bottom:number,w:number,h:number,d:number,material=surface,tint=color)=>{
  if(p.axis==='x')b.box(p.x+u-w/2,bottom,p.y-d/2,w,h,d,material,tint)
  else b.box(p.x-d/2,bottom,p.y+u-w/2,d,h,w,material,tint)
 }
 for(const side of [-1,1])box(side*(p.width/2+.04),0,.104,p.height,.24)
 box(0,p.height-.012,p.width+.16,.112,.24)
 box(0,0,p.width,.008,.42,'stone','#b8ad94')
}
/** Real, repeated construction details; kept in the same chunk/material batches. */
export function* buildTradersArchitectureDetails(b:Builder,bounds:TradersRect){
 for(const room of TRADERS_ROOMS){
  const horizontal=room.side==='n'||room.side==='s',x=horizontal?room.x+room.w/2:room.side==='w'?room.x:room.x+room.w,z=horizontal?room.side==='n'?room.y:room.y+room.h:room.y+room.h/2
  if(!own(bounds,x,z))continue
  const angle=room.side==='n'?Math.PI:room.side==='s'?0:room.side==='w'?-Math.PI/2:Math.PI/2,w=room.doorWidth
  const local=(lx:number,y:number,lz:number,a:number,h:number,d:number,surface:string,color:string)=>{
   const px=x+lx*Math.cos(angle)+lz*Math.sin(angle),pz=z-lx*Math.sin(angle)+lz*Math.cos(angle)
   b.box(px-a/2,y,pz-d/2,a,h,d,surface,color,true,angle)
  }
  if(room.kind==='shop'||room.kind==='anchor'){
   for(const side of [-1,1]){
    local(side*(w/2+.22),.08,0,.32,3.15,.35,'wood','#8d7557')
    local(side*(w/2+.22),.03,.025,.48,.16,.43,'stone','#b8ad94')
    local(side*(w/2+.22),2.92,0,.53,.23,.43,'wood','#b29b75')
    for(const strip of [-.09,.09])local(side*(w/2+.22)+strip,.28,.20,.018,2.45,.025,'brass','#ac9567')
   }
   local(0,3.12,0,w+1.25,.38,.46,'wood','#a28b66')
   local(0,3.49,.015,Math.min(w+1.48,(horizontal?room.w:room.h)-.08),.09,.55,'brass','#9b8b67')
   local(0,3.61,.14,w+1.15,.62,.16,'paint','#374d48')
   const fascia=tradersRoomSign(room.id)
   if(fascia){
    // Full-width tenant/leasing graphic on the fascia band (AI artwork, aspect kept).
    const band=Math.min(w+1.1,(horizontal?room.w:room.h)-.3),fh=Math.min(room.kind==='anchor'?1.15:.86,band/tradersSignAspect(fascia)),fw=Math.min(band,fh*tradersSignAspect(fascia))
    local(0,3.5,.2,fw+.16,fh+.14,.06,'paint','#1e2226')
    b.sign(fascia,x+Math.sin(angle)*.238,3.57+fh/2,z+Math.cos(angle)*.238,fw,fh,angle)
   }else b.label(room.name,x+Math.sin(angle)*.235,3.94,z+Math.cos(angle)*.235,Math.min(w,3.5),.43,angle)
   local(0,.005,.03,w,.012,.62,'stone','#a49b83')
   const gap=3.6,pane=(w-gap)/2
   for(const side of [-1,1]){
    local(side*gap/2,0,.02,.07,3.12,.12,'steel','#9c9d8b')
    for(let offset=gap/2+1.6;offset<w/2-.4;offset+=1.6)local(side*offset,0,.01,.045,3.12,.10,'brass','#887e60')
    local(side*(gap/2+pane/2),.10,.01,pane,.075,.12,'steel','#7b8174')
   }
   // Empty framed notice pockets: no invented store name, merchandise or business.
   for(const side of w<10?[-1,1]:[]){
    local(side*(w/2+1.15),1.35,.12,1.05,1.18,.08,'wood','#7c735e')
    local(side*(w/2+1.15),1.40,.17,.90,1.05,.012,'paint','#c3bfa9')
   }
   const px=x+Math.cos(angle)*(w/2+.35)+Math.sin(angle)*1.1,pz=z-Math.sin(angle)*(w/2+.35)+Math.cos(angle)*1.1
   b.box(px-.055,3.1,pz-.055,.11,.98,.11,'brass','#8d815f')
   b.label(room.name,px,3.62,pz,.9,.65,angle+Math.PI/2)
  }else if(room.kind==='vault'){
   local(0,2.80,.05,w+.20,.08,.16,'steel','#748078')
   const mark=room.storage==='cold'?'#779da8':room.storage==='secure'?'#965d50':'#9c976f'
   local(0,2.94,.045,w+.40,.19,.035,'paint',mark)
   for(const side of [-1,1]){local(side*(w/2+.05),0,.02,.10,2.76,.14,'steel','#69766f');local(side*(w/2+.05),.04,.10,.16,.10,.08,'steel','#b2b6a8')}
  }
  yield
 }
 // Fixed public/service openings use a shallow architectural reveal instead of
 // a separate door asset.  The passage center owns the reveal so neighboring
 // chunks never duplicate the frame.
 for(const p of TRADERS_PASSAGES){
  if(!own(bounds,p.x,p.y))continue
  buildTradersPassageFrame(b,p)
  yield
 }
 for(const pane of TRADERS_SHOP_GLAZING)if(own(bounds,pane.x+pane.w/2,pane.y+pane.h/2)){
  const horizontal=pane.w>pane.h,width=horizontal?pane.w:pane.h,g=new THREE.PlaneGeometry(width,3.12)
  if(!horizontal)g.rotateY(Math.PI/2);g.translate(pane.x+pane.w/2,1.56,pane.y+pane.h/2);b.add(g,b.assets.material('glass','#bdcfc2',false));yield
 }
 // Ceiling service spines and coffer strips make the terminal roof a built object.
 for(const zone of TRADERS_ZONES){
  if(zone.id==='public'||!tradersIntersects(zone,bounds))continue
  const hall=['hall','bank','food'].includes(zone.kind),office=['office','dorm','guard'].includes(zone.kind)
  if(hall||office){
   const z0=Math.max(bounds.y,zone.y),z1=Math.min(bounds.y+bounds.h,zone.y+zone.h),x0=Math.max(bounds.x,zone.x),x1=Math.min(bounds.x+bounds.w,zone.x+zone.w),h=zone.height
   for(let x=Math.ceil(x0/6)*6;x<x1;x+=6)b.box(x-.04,h-.17,z0,.08,.16,z1-z0,'steel',hall?'#46534c':'#b1b6aa')
   for(let z=Math.ceil(z0/3)*3;z<z1;z+=3)b.box(x0,h-.055,z-.018,x1-x0,.05,.036,'steel',hall?'#586257':'#b7bbae')
   for(let x=Math.ceil(x0/12)*12+3;x<x1;x+=12)for(let z=Math.ceil(z0/12)*12+3;z<z1;z+=12){
    b.box(x-.45,h-.075,z-.29,.90,.055,.58,'steel','#616d63')
    for(let i=0;i<7;i++)b.box(x-.38,h-.105,z-.22+i*.065,.76,.025,.025,'steel','#adb1a2')
   }
  }
  if(zone.kind==='street'){
   const horizontal=zone.w>zone.h,span=horizontal?zone.h:zone.w
   for(const side of [-1,1]){
    const x=horizontal?Math.max(zone.x,bounds.x):zone.x+zone.w/2+side*(span/2-.08),z=horizontal?zone.y+zone.h/2+side*(span/2-.08):Math.max(zone.y,bounds.y),w=horizontal?Math.min(zone.x+zone.w,bounds.x+bounds.w)-x:.16,d=horizontal?.16:Math.min(zone.y+zone.h,bounds.y+bounds.h)-z
    if(w>0&&d>0)b.box(x,4.58,z,w,.16,d,'stone','#b5a788')
   }
  }
  yield
 }
 // Exposed vault pipes, labelled cross-aisles, and narrow safety edge strips.
 const v=TRADERS_VAULT_BOUNDS
 if(tradersIntersects(v,bounds))for(let row=0;row<4;row++){
  const z=4+(131+row*22)*.6,x0=Math.max(v.x+.5,bounds.x),x1=Math.min(v.x+v.w-.5,bounds.x+bounds.w)
  if(z<bounds.y||z>=bounds.y+bounds.h||x1<=x0)continue
  for(const off of [-.45,.45])b.box(x0,2.99,z+off,x1-x0,.055,.055,'steel','#818d83')
  for(let x=Math.ceil(x0/3)*3;x<x1;x+=3){b.box(x-.035,2.94,z-.63,.07,.065,1.26,'steel','#646f65');for(const dz of [-.6,.6])b.box(x-.012,3.03,z+dz,.024,.13,.024,'steel','#b1b4a6')}
  for(const off of [-1.53,1.53])b.box(x0,.003,z+off,x1-x0,.008,.07,'paint','#ae9b63')
  if(own(bounds,v.x+4,z)){const key='vault_row_'+'ABCD'[row];b.box(v.x+4-.03,2.2,z-.75,.06,.46,1.5,'steel','#596168');for(const side of [-1,1])b.sign(key,v.x+4+side*.035,2.43,z,1.95,.42,side>0?Math.PI/2:-Math.PI/2)}
  yield
 }
 // Public wayfinding boards are suspended above human clearance.
 for(const [text,x,z,angle] of [['北步行街 / NORTH MALL',90,42,Math.PI/2],['南步行街 / SOUTH MALL',90,174,Math.PI/2],['公共服务 / SERVICES',67,109,Math.PI/2],['交易保险库 / TRADERS VAULT',202,138,0],['货物交接 / DISPATCH',212,174,0]] as const){
  if(!own(bounds,x,z))continue
  const key=text==='公共服务 / SERVICES'?'way_services':tradersSignKey(text)!,sh=.66,sw=Math.min(4.2,sh*tradersSignAspect(key))
  const g=new THREE.BoxGeometry(sw+.06,sh+.06,.09);g.rotateY(angle);g.translate(x,3.34,z);b.add(g,b.assets.material('paint','#24292d'))
  for(const side of [-1,1])b.sign(key,x+side*Math.sin(angle)*.047,3.34,z+side*Math.cos(angle)*.047,sw,sh,angle+(side<0?Math.PI:0))
  for(const side of [-1,1])b.box(x+side*Math.cos(angle)*(sw/2-.3)-.014,3.67,z-side*Math.sin(angle)*(sw/2-.3)-.014,.028,1.13,.028,'steel','#8d998d')
  yield
 }
}
