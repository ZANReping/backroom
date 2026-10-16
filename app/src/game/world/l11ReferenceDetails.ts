import type { L11Building } from './l11Types'
import { l11VerticalSignMount } from './l11VerticalSignMounts'
import { l11EntranceFrame } from './l11Entrance'
import { l11ShopSigns } from './l11ShopSigns'
import { l11Shopfront } from './l11Shopfront'
import { l11QuayWing } from './l11QuayWing'
import { l11RetailPiers } from './l11RetailFacade'
import { l11QuayPlanting } from './l11QuayPlanting'
import { l11Twins } from './l11Twins'

export interface L11BuildingDetail {
  x:number;y:number;z:number;w:number;h:number;d:number
  surface:'concrete'|'paint'|'metal'|'wood'|'grass';color:string
  tier:0|1|2
  solid?:boolean
  slope?:[number,number]
}
const cache=new WeakMap<L11Building,L11BuildingDetail[]>()
/** Architectural parts belong to the building. Physics uses the same boxes
 * before a renderer exists; no camera-dependent facade or platform is added. */
export function l11ReferenceDetails(b:L11Building):L11BuildingDetail[]{
  const found=cache.get(b);if(found)return found
  const parts:L11BuildingDetail[]=[];cache.set(b,parts)
  const box=(x:number,y:number,z:number,w:number,h:number,d:number,surface:L11BuildingDetail['surface'],color:string,tier:0|1|2=1)=>parts.push({x,y,z,w,h,d,surface,color,tier})
  const planting=(x:number,z:number,soil:number,w:number,d:number,color:string)=>{
    // The lower leaves overlap the soil. Fine stems support the visible crown
    // from close/low viewpoints; they never introduce a solid hedge air wall.
    box(x,soil+.34,z,w,1.16,d,'grass',color,2);parts.at(-1)!.solid=false
    const cols=Math.max(1,Math.ceil(w/.8)),rows=Math.max(1,Math.ceil(d/.8))
    for(let i=0;i<cols;i++)for(let j=0;j<rows;j++){
      const px=x-w/2+(i+.5)*w/cols+Math.sin(i*7+j*13)*.08,pz=z-d/2+(j+.5)*d/rows+Math.cos(i*11+j*3)*.08
      box(px,soil+.18,pz,.024,.38,.024,'wood','#6d7254',0);parts.at(-1)!.solid=false
      for(const side of [-1,1]){
        box(px+side*.06,soil+.33,pz,.13,.015,.015,'wood','#6d7254',0)
        parts.at(-1)!.slope=[side*1.5,0];parts.at(-1)!.solid=false
      }
    }
  }
  if(b.entrance){
    const e=b.entrance,{point,tx,ty,nx,ny}=l11EntranceFrame(b),landing=Math.min(1.5,e.run*.25),steps=Math.round(e.rise/.15),tread=(e.run-landing)/steps
    for(const v of b.volumes.filter(v=>v.lo===0)){
      const glazed=b.architecture==='glazed-terrace'
      box(v.x+v.w/2,-e.rise/2-.05,v.y+v.d/2,v.w,e.rise+.1,v.d,glazed?'paint':'concrete',glazed?'#59605a':'#92998f',2)
      if(glazed){
        // Cut plinth panels wrap the whole office, including the rear. Joints
        // are real shallow strips and stop at the raised ground-floor datum.
        for(let u=0;u<=v.w;u+=2.4)for(const z of [v.y-.016,v.y+v.d+.016])box(v.x+u,-e.rise/2,z,.012,e.rise,.024,'metal','#8c9389',0)
        for(let z=0;z<=v.d;z+=2.4)for(const x of [v.x-.016,v.x+v.w+.016])box(x,-e.rise/2,v.y+z,.024,e.rise,.012,'metal','#8c9389',0)
      }
    }
    const place=(u:number,v:number,y:number,w:number,h:number,d:number,surface:L11BuildingDetail['surface'],color:string,tier:0|1|2=1)=>{const p=point(u,v);box(p[0],y,p[1],Math.abs(tx)*w+Math.abs(ty)*d,h,Math.abs(ty)*w+Math.abs(tx)*d,surface,color,tier)}
    for(let k=1;k<=steps;k++){const height=e.rise*k/steps;place(0,e.run-(k-.5)*tread,-e.rise+height/2-.06,e.width,height+.12,tread+.002,'concrete','#b7bbb1',2)}
    place(0,landing/2,-.11,e.width,.22,landing,'concrete','#c6c9c0',2)
    for(const side of [-1,1]){
      const u=side*(e.width/2-.18),flight=e.run-landing
      place(u,landing/2,.95,.055,.055,landing,'metal','#65716d',1)
      place(u,(e.run+landing)/2,.95-e.rise/2,.055,.055,flight,'metal','#65716d',1)
      parts.at(-1)!.slope=[-nx*e.rise/flight,-ny*e.rise/flight]
      for(let k=0;k<=4;k++){const v=landing+flight*k/4;place(u,v,.475-e.rise*k/4,.055,.95,.055,'metal','#65716d',1)}
      place(u,.12,.475,.055,.95,.055,'metal','#65716d',1)
    }
    // Railings border the landing and gardens, while the whole stair remains
    // open to the street. Planting never crosses the entrance or pavement.
    if(e.gardens)for(const side of [-1,1]){
      const u=side*(e.width/2+2.45),depth=e.run-.5,width=4.2
      place(u,depth/2,-e.rise+.3,width,.6,depth,'concrete','#9ca59c',2)
      place(u,depth/2,-e.rise+.65,width-.3,.14,depth-.3,'wood','#394331',1)
      for(const off of [-width/2,width/2])for(let v=.2;v<depth;v+=.8)place(u+off,v,-e.rise+1,.045,1.4,.045,'metal','#455551',1)
      for(const y of [-e.rise+.7,-e.rise+1.65]){
        for(const off of [-width/2,width/2])place(u+off,depth/2,y,.055,.055,depth,'metal','#455551',1)
        place(u,depth,y,width,.055,.055,'metal','#455551',1)
      }
      const p=point(u,depth/2)
      planting(p[0],p[1],-e.rise+.72,Math.abs(tx)*(width-.4)+Math.abs(ty)*(depth-.4),Math.abs(ty)*(width-.4)+Math.abs(tx)*(depth-.4),'#658354')
    }
  }
  for(const p of l11QuayPlanting(b)){
    box(p.x,p.bottom+.29,p.z,p.w,.58,p.d,'concrete','#b5ac91',2)
    box(p.x,p.bottom+.61,p.z,p.w+.1,.12,p.d+.1,'concrete','#c9bea0',2)
    box(p.x,p.bottom+.68,p.z,p.w-.22,.05,p.d-.22,'paint','#474c37',1)
    planting(p.x,p.z,p.bottom+.705,p.w-.28,p.d-.28,'#60734b')
  }
  const sign=l11VerticalSignMount(b)
  if(sign){
    const {x,y,z,w,d,spec,nx,nz,offset,faceX,faceZ,blade}=sign
    box(x,y,z,w,spec.height,d,'paint',spec.id==='pegasus'?'#c65b20':'#414a47',2)
    for(const h of [y-spec.height/2+.25,y,y+spec.height/2-.25])box(faceX+nx*offset/2,h,faceZ+nz*offset/2,nx?offset:.1,.08,nz?offset:.1,'metal','#626c67',blade?1:0)
  }
  if(!b.facadeProfile)return parts
  if(b.architecture==='quay-service-wing'){
    const q=l11QuayWing(b.width,b.depth,b.front),{wing,projection,stair,point}=q
    const part=(u:number,v:number,y:number,w:number,h:number,d:number,surface:L11BuildingDetail['surface'],color:string,tier:0|1|2=1)=>{const p=point(u,v);box(p[0],y,p[1],q.ew?d:w,h,q.ew?w:d,surface,color,tier)}
    const rail=(u0:number,u1:number,v:number,y0:number,y1:number,width=.045,tier:0|1|2=1)=>{
      const a=point(u0,v),z=point(u1,v),dx=z[0]-a[0],dz=z[1]-a[1]
      box((a[0]+z[0])/2,(y0+y1)/2,(a[1]+z[1])/2,Math.abs(dx)+width,width,Math.abs(dz)+width,'metal','#475652',tier)
      parts.at(-1)!.slope=[Math.abs(dx)>.001?(y1-y0)/dx:0,Math.abs(dz)>.001?(y1-y0)/dz:0]
    }
    // The source has shallow floor-edge bands on the projecting glass wing;
    // the open stairs are in its side recess, not balconies across the facade.
    const lower=wing+.2,upper=lower+stair,landing=.85,run=stair-landing*2,lane=(projection-.5)/2
    for(let f=0;f<=b.floors;f++){
      const y=f*3
      part(wing/2,.025,y-.08,wing,.16,.28,'paint','#c7cfca',2)
      part(wing-.025,projection/2,y-.08,.28,.16,projection,'paint','#c7cfca',2)
      if(f===b.floors)break
      part(upper-landing/2,(projection+.1)/2,y-.1,landing,.2,projection+.1,'concrete','#969e98',2)
      part(lower+landing/2-.1,(projection+.1)/2,y+1.4,landing+.2,.2,projection+.1,'concrete','#969e98',2)
      for(const [laneIndex,dir]of [[0,-1],[1,1]]){
        const v=.18+lane*(laneIndex+.5),u0=dir<0?upper-landing:lower+landing,u1=dir<0?lower+landing:upper-landing,start=y+laneIndex*1.5
        for(let k=1;k<=10;k++)part(u0+(u1-u0)*(k-.5)/10,v,start+k*.15-.055,run/10+.004,.11,lane-.08,'metal','#7c8781',1)
        for(const off of [-lane/2+.06,lane/2-.06]){
          rail(u0,u1,v+off,start-.1,start+1.4,.13,2)
          rail(u0,u1,v+off,start+1.03,start+2.53,.045,1)
          for(const t of [0,.5,1])part(u0+(u1-u0)*t,v+off,start+1.5*t+.51,.04,1.02,.04,'metal','#475652',1)
        }
      }
      for(const [u,h]of [[upper-landing/2,y],[lower+landing/2,y+1.5]]){
        for(const v of [.09,projection-.09]){
          rail(u-landing/2,u+landing/2,v,h+1.03,h+1.03)
          for(const du of [-landing/2,landing/2])part(u+du,v,h+.51,.04,1.02,.04,'metal','#475652',1)
        }
      }
      // Closed service doors terminate at a real wall; public circulation
      // continues through the independent main entrance and interior stairs.
      part(upper-landing/2,projection-.035,y+1.12,.72,2.24,.07,'paint','#4b5551',1)
      part(upper-landing/2+.22,projection-.09,y+1.06,.055,.13,.07,'metal','#adb5aa',0)
    }
  }
  for(const p of l11ShopSigns(b))if(p.spec.shape==='circle'){
    const nx=p.side==='e'?1:p.side==='w'?-1:0,nz=p.side==='s'?1:p.side==='n'?-1:0
    box(p.x-nx*.36,p.y,p.z-nz*.36,nx?.58:.055,.055,nz?.58:.055,'metal','#737975',1)
  }
  if(b.architecture==='ribbon-twins')for(const v of b.volumes.filter(v=>v.soffit)){
    const q=l11Twins(b.width,b.depth,b.front)
    const part=(u:number,depth:number,y:number,w:number,h:number,d:number,color:string,tier:0|1|2,surface:L11BuildingDetail['surface']='paint')=>{
      const p=q.point(u,depth);box(p[0],y,p[1],q.ew?d:w,h,q.ew?w:d,surface,color,tier)
    }
    // The source shows a panelled underside supported at both tower walls.
    box(v.x+v.w/2,v.lo-.08,v.y+v.d/2,v.w,.16,v.d,'paint','#b8bcb7',2)
    // Thin longitudinal panel joints, with wider-spaced cross joints. The
    // photograph shows long soffit panels, not a coarse square suspended grid.
    const cols=Math.max(1,Math.round(q.linkDepth/1.2)),rows=Math.max(1,Math.round(q.gap/3))
    for(let i=1;i<cols;i++)part(q.start+q.gap/2,i*q.linkDepth/cols,v.lo-.162,q.gap,.004,.007,'#777f7c',1,'metal')
    for(let i=1;i<rows;i++)part(q.start+i*q.gap/rows,q.linkDepth/2,v.lo-.162,.007,.004,q.linkDepth,'#777f7c',1,'metal')
    // Bearing strips enter both tower envelopes. End flashing and side returns
    // close the panel edges when seen from the courtyard or rear of the link.
    for(const u of [q.start,q.end])part(u,q.linkDepth/2,v.lo-.13,.36,.20,q.linkDepth,'#a8b1ac',2)
    for(const depth of [.045,q.linkDepth-.045])part(q.start+q.gap/2,depth,v.lo-.13,q.gap,.12,.09,'#a8b1ac',1)
  }
  if(!b.entrance&&b.architecture==='stone-terrace'&&b.front==='w'&&b.depth>=23){
    // A shallow seating terrace is backed by a planter, not a false doorway.
    // Its outer edge retains two metres of continuous public pavement.
    const scale=b.width>50?1:.4,length=b.width>50?11:5,z=b.width>50?b.depth-10:b.depth-4
    for(let k=0;k<4;k++){const width=(2.8-k*.55)*scale,h=(k+1)*.15;box(-width/2,h/2,z,width,h,length,'concrete','#b2b5ab',1)}
    box(-.35*scale,.92,z,.65*scale,.65,length-.5,'concrete','#b2b5ab',1)
  }
  if(b.architecture==='pier-retail'||b.architecture==='blue-retail'){
    for(const p of l11RetailPiers(b))box(p.x,1.47,p.z,p.w,2.94,p.d,'paint','#343c39',2)
    // Front canopy follows the building's own street orientation. Small lots
    // use a 1.1m projection, retaining the standard service/pavement clearance.
    const shop=l11Shopfront(b)
    for(const side of shop?[shop.side,shop.back]:[b.front]){
    const ew=side==='e'||side==='w',extent=ew?b.depth:b.width,projection=b.width>50?1.8:1.1,n=side==='w'||side==='n'?-1:1
    const x=ew?(side==='e'?b.width:0)+n*projection*.4:b.width/2,z=ew?b.depth/2:(side==='s'?b.depth:0)+n*projection*.4,blue=b.architecture==='blue-retail'
    box(x,blue?3.25:3.02,z,ew?projection:extent,.18,ew?extent:projection,'paint',blue?'#226baf':'#343d3c',2)
    if(blue)parts.at(-1)!.slope=ew?[-n*.33,0]:[0,-n*.33]
    box(x+(ew?n*projection*.5:0),3.1,z+(ew?0:n*projection*.5),ew?.08:extent,.35,ew?extent:.08,'paint',blue?'#297bc1':'#293331',1)
    }
    if(shop){
      // Both straight runs stop at the building corner. Their overhangs need
      // a real corner infill and two fascia returns, also in the distant LOD.
      const projection=b.width>50?1.8:1.1,sx=shop.east?1:-1,sz=shop.south?1:-1
      const x=shop.corner[0]+sx*projection*.4,z=shop.corner[1]+sz*projection*.4
      box(x,3.02,z,projection,.18,projection,'paint','#343d3c',2)
      box(shop.corner[0]+sx*projection*.9,3.1,z,.08,.35,projection,'paint','#293331',1)
      box(x,3.1,shop.corner[1]+sz*projection*.9,projection,.35,.08,'paint','#293331',1)
      // Warm ceiling-edge trim is inside the glass on both sides of the same
      // corner shop, with no opaque partition across the glazed return.
      if(shop.available){
        box(shop.east?b.width-.22:.22,2.20,shop.y+shop.h/2,.07,.045,shop.h,'paint','#c9b77d',0)
        box(shop.x+shop.w/2,2.20,shop.south?b.depth-.22:.22,shop.w,.045,.07,'paint','#c9b77d',0)
      }
    }
    if(b.architecture==='blue-retail'){
      // Stepped parapet, rooftop tank base and services complete all views.
      box(b.width*.7,b.floors*3+.3,b.depth*.7,2.4,.6,2.4,'concrete','#c3c4b5',1)
    }
  }
  const quay=b.architecture==='canal-portico'&&(b.front==='e'||b.front==='w')
  if(quay){
    const west=b.front==='e',face=west?b.width:0,sign=west?1:-1,depth=b.width>50?(west?4.5:5.5):1.25,x=face+sign*depth*.5
    // A six-metre portico has real columns and a closed soffit. Its central
    // entrance bay stays clear and links to the interior circulation plan.
    box(x,6.2,b.depth/2,depth+.25,.5,b.depth,'paint','#d7dcd5',2)
    for(let z=3;z<b.depth-1;z+=6){
      if(Math.abs(z-b.doorLocal[1])<4)continue
      box(face+sign*(depth-.6),3,z,.72,6,.78,'concrete','#d7d7cd',2)
      box(face+sign*(depth-.6),.09,z,.9,.18,.96,'concrete','#9ca39d',1)
      if(west)box(face+sign*(depth-.6),4.85,z,.82,.12,1,'paint','#d7dcd5',1)
    }
    // Side seating terraces leave the central door and the full quayside
    // walking strip unobstructed. Four 15cm risers are real step surfaces.
    if(!west&&b.width>50)for(const [z,length]of [[13,16],[b.depth-12,15]])for(let step=0;step<4;step++){
      const width=5.4-step*.7,height=(step+1)*.15
      box(face-width/2,height/2,z,width,height,length,'concrete','#c3c6bc',1)
    }
  }
  if(b.facadeProfile==='brick-apartments'){
    // Wood entrance surround, inset letterbox bank and a weathered stone sill.
    const {point,tx,ty}=l11EntranceFrame(b)
    const part=(u:number,out:number,y:number,w:number,h:number,d:number,surface:L11BuildingDetail['surface'],color:string,tier:0|1|2)=>{const p=point(u,out);box(p[0],y,p[1],Math.abs(tx)*w+Math.abs(ty)*d,h,Math.abs(ty)*w+Math.abs(tx)*d,surface,color,tier)}
    for(const u of [-1.42,1.42])part(u,.11,1.35,.35,2.7,.34,'wood','#a46e45',1)
    part(0,.11,2.72,3.2,.2,.5,'concrete','#68695f',1)
    for(let i=0;i<5;i++)part(2.05+(i%2)*.29,.24,.96+Math.floor(i/2)*.21,.25,.17,.13,'metal','#7a7161',0)
  }
  // Roof plant is proportionate to the actual tower, visible from both the
  // front and the rear. Every cap has a top; nothing is an open billboard.
  const highest=Math.max(...b.volumes.map(v=>v.hi)),H=highest
  const width=Math.min(15,b.width*.3),depth=Math.min(10,b.depth*.3),x=b.width*.46,z=b.depth*.46
  if(b.volumes.some(v=>v.hi===H&&x-width/2>v.x&&x+width/2<v.x+v.w&&z-depth/2>v.y&&z+depth/2<v.y+v.d)){
    box(x,H+1.35,z,width,2.7,depth,'concrete','#a9ada5',2)
    box(x,H+2.75,z,width+.4,.18,depth+.4,'metal','#8b9694',1)
    for(let i=0;i<8;i++)box(x,H+.35+i*.27,z-depth/2-.03,width-.5,.08,.08,'metal','#566664',0)
  }
  return parts
}
