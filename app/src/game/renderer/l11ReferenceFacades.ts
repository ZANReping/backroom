import type { L11Building,L11Volume } from '../world/l11Types'
import type { Polygon,Point } from '../world/l11Geometry'
import { l11WallSegments } from '../world/l11Collision'
import { l11InteriorPlan } from '../world/l11Interiors'
import { CityBatch } from './l11Batch'
import { l11Material,l11ArchitecturalGlass,l11StorefrontGlass,l11BronzeGlass,l11FacadeStone } from './l11Materials'
import { addL11Sign } from './l11Signs'
import * as THREE from 'three'
import type {L11FacadeProfile} from '../world/l11ReferenceDistrict'
import { l11QuayWing } from '../world/l11QuayWing'
import { l11RetailBays } from '../world/l11RetailFacade'
import { l11Twins } from '../world/l11Twins'

/** Profiles describe real bays on every exterior and courtyard elevation.
 * All trim goes through CityBatch's physical solids, including headroom. */
export function referenceFacade(batch:CityBatch,b:L11Building,polygon:Polygon,lo:number,hi:number,detail:number,faces?:L11Volume['faceProfiles'],frameAngle=0,worldDatum?:number):boolean {
  if(!b.facadeProfile)return false
  const datum=worldDatum??0,storey=(h:number)=>Math.round((h-datum)/3)
  const open=worldDatum===undefined&&!b.sealed&&hi<=b.accessible*3,original=open?l11WallSegments(b):polygon.flatMap(r=>r.slice(1).map((q,i)=>({a:r[i],b:q,entrance:false})))
  const segments:{a:Point;b:Point;entrance:boolean;profile?:L11FacadeProfile}[]=original.flatMap(s=>{
    if(open&&b.architecture==='quay-service-wing'){
      const q=l11QuayWing(b.width,b.depth,b.front),a=q.local(...s.a),z=q.local(...s.b)
      const cuts=[0,1,...[q.projection].map(v=>(v-a[1])/(z[1]-a[1])).filter(t=>Number.isFinite(t)&&t>0&&t<1)].sort((a,b)=>a-b)
      const point=(t:number):Point=>[s.a[0]+(s.b[0]-s.a[0])*t,s.a[1]+(s.b[1]-s.a[1])*t]
      return cuts.slice(1).map((t,i)=>{const mid=(t+cuts[i])/2,u=a[0]+(z[0]-a[0])*mid,v=a[1]+(z[1]-a[1])*mid;return {a:point(cuts[i]),b:point(t),entrance:s.entrance,profile:u<=q.wing+.001&&v<q.projection-.001?'green-curtain' as const:'service-wall' as const}})
    }
    if(b.architecture!=='ribbon-twins'||lo-datum>=6-.001||faces)return [s]
    // The low shared lobby has the same blue/glass entrance band below the
    // two inward tower faces. Clip the actual facade, including the off-centre
    // door, instead of putting a second opaque board in front of its windows.
    const origin=worldDatum===undefined?[0,0]:polygon[0][0],c=Math.cos(frameAngle),n=Math.sin(frameAngle)
    const local=(p:Point)=>[(p[0]-origin[0])*c+(p[1]-origin[1])*n,-(p[0]-origin[0])*n+(p[1]-origin[1])*c]
    const q=l11Twins(b.width,b.depth,b.front),p=local(s.a),r=local(s.b),a=q.local(p[0],p[1]),z=q.local(r[0],r[1])
    if(Math.abs(a[1]-z[1])>.001||Math.min(Math.abs(a[1]),Math.abs(a[1]-q.depth))>.001)return [s]
    const cuts=[0,1,...[q.start,q.end].map(u=>(u-a[0])/(z[0]-a[0])).filter(t=>t>0&&t<1)].sort((u,v)=>u-v)
    const point=(t:number):Point=>[s.a[0]+(s.b[0]-s.a[0])*t,s.a[1]+(s.b[1]-s.a[1])*t]
    return cuts.slice(1).map((t,i)=>{const u=a[0]+(z[0]-a[0])*(cuts[i]+t)/2;return {a:point(cuts[i]),b:point(t),entrance:s.entrance,profile:u>q.start&&u<q.end?'glazed-core' as const:undefined}})
  })
  for(const segment of segments){
    const a=segment.a,end=segment.b,len=Math.hypot(end[0]-a[0],end[1]-a[1]),ux=(end[0]-a[0])/len,uy=(end[1]-a[1])/len,nx=uy,ny=-ux
    const lx=nx*Math.cos(frameAngle)+ny*Math.sin(frameAngle),lz=-nx*Math.sin(frameAngle)+ny*Math.cos(frameAngle),side=Math.abs(lx)>Math.abs(lz)?lx>0?'e':'w':lz>0?'s':'n',profile=segment.profile??faces?.[side]??b.facadeProfile
  const piers=profile==='civic-piers',stone=profile==='sandstone-grid',core=profile==='glazed-core',bronze=profile==='bronze-curtain',green=profile==='green-curtain',service=profile==='service-wall',curtain=profile==='blue-curtain'||core||bronze||green,ribbon=profile==='white-ribbon',brick=profile==='brick-apartments'
  const wall=stone?l11FacadeStone():l11Material(brick?'brick':piers?'concrete':'paint',brick?'#acadaa':piers?'#7b7d73':bronze?'#49534b':curtain?'#657f80':service?'#b6bdbb':'#e1dfd3')
  if(brick&&!wall.userData.referenceGrey){
    const prior=wall.onBeforeCompile
    wall.onBeforeCompile=(shader,renderer)=>{prior.call(wall,shader,renderer);shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>','#include <map_fragment>\nfloat brickGrey=dot(diffuseColor.rgb,vec3(0.2126,0.7152,0.0722));diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.045+brickGrey*.75),.94);')}
    wall.customProgramCacheKey=()=> 'l11-grey-fired-brick';wall.userData.referenceGrey=true;wall.needsUpdate=true
  }
  const trim=l11Material('paint',brick?'#efeee5':stone?'#b9aa8f':piers?'#797c74':'#b7c5c4'),metal=l11Material('paint',curtain?'#7d9599':piers?'#4a504e':'#394749')
  const glazing=l11Material('sealedglass',piers?'#18272b':stone?'#424440':brick?'#20373e':curtain?'#254a58':'#294954'),glass=l11ArchitecturalGlass(),lining=l11Material('paint','#b7b5aa',true),dark=l11Material('paint','#242e30',true)
    const pos=(t:number,o=0):Point=>[a[0]+ux*t+nx*o,a[1]+uy*t+ny*o]
    const pane=(l:number,r:number,z0:number,z1:number,mat:THREE.Material,o=-.16)=>{if(r<=l||z1<=z0)return;const p=pos(l,o),q=pos(r,o);batch.quad(mat,[[p[0],z0,p[1]],[q[0],z0,q[1]],[q[0],z1,q[1]],[p[0],z1,p[1]]],[nx,0,ny])}
    const fill=(l:number,r:number,z0:number,z1:number)=>{if(r<=l||z1<=z0)return;batch.wall(wall,pos(l),pos(r),z0,z1,.38);if(open&&detail<2)pane(l,r,z0,z1,lining,-.197)}
    const origin=worldDatum===undefined?[0,0]:polygon[0][0],c=Math.cos(frameAngle),n=Math.sin(frameAngle)
    const local=(p:Point):Point=>[(p[0]-origin[0])*c+(p[1]-origin[1])*n,-(p[0]-origin[0])*n+(p[1]-origin[1])*c]
    const retailBays=b.architecture==='pier-retail'?l11RetailBays(b,local(a),local(end)):undefined
    if(segment.entrance&&lo<.1){
      fill(0,len,lo+2.45,hi)
      for(const t of [0,len-.08])batch.wall(metal,pos(t),pos(t+.08),lo,lo+2.45,.4)
      if(detail<2&&b.architecture!=='pier-retail'&&b.architecture!=='blue-retail'&&b.architecture!=='ribbon-twins'&&b.architecture!=='glazed-terrace'&&b.architecture!=='quay-service-wing'){batch.wall(metal,pos(-.3,.7),pos(len+.3,.7),2.67,2.83,1.6);batch.wall(trim,pos(-.3,1.45),pos(len+.3,1.45),2.68,2.8,.08)}
      continue
    }
    if(open&&lo<.1&&(b.architecture==='pier-retail'||b.architecture==='blue-retail')){
      // Full-height clear glazing and narrow mullions enclose actual furnished
      // shop rooms. The same apertures remain solid to bodies and loot rays.
      const count=Math.max(1,Math.ceil(len/3.2)),pitch=len/count,frame=l11Material('metal','#303c3e')
      const bays=retailBays??Array.from({length:count},(_,i)=>({l:i*pitch,r:(i+1)*pitch,start:i*pitch,end:(i+1)*pitch}))
      const shopHead=b.architecture==='pier-retail'?2.30:2.55
      fill(0,len,0,.12);fill(0,len,shopHead,3)
      for(const [i,bay] of bays.entries()){
        const left=Math.max(bay.start,bay.l+.06),right=Math.min(bay.end,bay.r-.06)
        if(right-left<.12){pane(bay.start,bay.end,.16,shopHead-.05,l11StorefrontGlass(),-.07);continue}
        pane(left,right,.16,shopHead-.05,l11StorefrontGlass(),-.07)
        if(detail<2){batch.wall(frame,pos(left-.045),pos(left),.12,shopHead,.17);batch.wall(frame,pos(right),pos(right+.045),.12,shopHead,.17)}
        if(b.architecture==='blue-retail'&&detail<2&&i%3===1){const p=pos((left+right)/2,.23);addL11Sign(batch,['store','books','cafe','bakery'][(b.seed+i)%4],p[0],2.79,p[1],Math.atan2(nx,ny),Math.min(2.7,pitch-.25),.43)}
      }
      batch.wall(frame,pos(0),pos(len),shopHead-.06,shopHead+.02,.17)
      continue
    }
    if(curtain){
      // A curtain wall is a continuous glazed skin with narrow pressure caps,
      // opaque floor spandrels and a shallow reveal, on every elevation.
      // It must not turn into deeply punched masonry windows in the near LOD.
      const count=Math.max(1,Math.round(len/(bronze?1.65:green?.68:1.35))),pitch=len/count,capWidth=bronze?.085:green||core?.065:.045,cap=l11Material(bronze||green||core?'paint':'metal',bronze?'#9d9274':green||core?'#9caea5':'#899a96'),spandrel=bronze?l11Material('sealedglass','#2d3b32'):l11Material('sealedglass',core?'#849b95':green?'#82978c':'#526d70')
      const panels=(green?['#658c7b','#608475','#708d80']:['#657f83','#607b82','#71898a']).map(c=>l11Material('sealedglass',c))
      let bays=Array.from({length:count},(_,i)=>({l:i*pitch,r:(i+1)*pitch,index:i}))
      if(core&&b.architecture==='ribbon-twins'){
        // One blue/dark/blue composition occupies the side wall under the
        // connector. It must not repeat along the entire deep tower slab.
        // The podium grid uses the same frontage origin across door cuts.
        const q=l11Twins(b.width,b.depth,b.front),podium=lo-datum<6-.001
        const normal:Point=b.front==='w'?[-1,0]:b.front==='e'?[1,0]:b.front==='n'?[0,-1]:[0,1]
        const outward:Point=[normal[0]*c-normal[1]*n,normal[0]*n+normal[1]*c]
        const frontPlane=Math.max(...polygon.flat().map(p=>p[0]*outward[0]+p[1]*outward[1]))
        const coordinate=(p:Point)=>podium?q.local(...local(p))[0]-q.start:frontPlane-p[0]*outward[0]-p[1]*outward[1]
        const ca=coordinate(a),cb=coordinate(end),module=(podium?q.gap:q.linkDepth)/5
        bays=[]
        for(let i=Math.floor((Math.min(ca,cb)+1e-6)/module);i<Math.ceil((Math.max(ca,cb)-1e-6)/module);i++){
          const t0=(i*module-ca)/(cb-ca)*len,t1=((i+1)*module-ca)/(cb-ca)*len
          bays.push({l:Math.max(0,Math.min(t0,t1)),r:Math.min(len,Math.max(t0,t1)),index:i})
        }
      }
      for(let floor=lo;floor<hi-1e-6;floor+=3){
        const top=Math.min(hi,floor+3),belt=core?(storey(floor)%2?.04:1.45):bronze?(storey(floor)===0?.9:.3):green?.49:.72
        // Blue panels flank a dark centre bay in 11canal; no yellow panels.
        const centres=bays.filter(bay=>bay.index===2),coreBlue=(i:number)=>core&&(i===1||i===3)
        const faceAt=(i:number)=>bronze?l11BronzeGlass(open,(Math.floor(i/4)+Math.floor(storey(floor)/4)+b.seed)%3):coreBlue(i)?l11Material('paint','#315d8a'):core&&i===2?l11Material('sealedglass','#273d40'):open?glass:core?l11Material('sealedglass','#819c94'):panels[(Math.floor(i/5)+Math.floor(storey(floor)/3)+b.seed)%3]
        if(detail===2){
          pane(0,len,floor,floor+.035,cap,0);pane(0,len,floor+.035,Math.min(top,floor+belt-.035),spandrel,0)
          pane(0,len,Math.min(top,floor+belt-.035),Math.min(top,floor+belt),cap,0)
          for(const {l,r,index} of bays){
            pane(l,l+capWidth,floor+belt,top,cap,0)
            pane(l+capWidth,r,floor+belt,top-.035,faceAt(index),0)
            pane(l+capWidth,r,top-.035,top,cap,0)
          }
          if(core&&storey(floor)%2===0)for(const {l,r} of centres)pane(l,r,floor+belt,floor+belt+.055,l11Material('paint','#854b4b'),.004)
          continue
        }
        pane(0,len,floor,Math.min(top,floor+belt),spandrel,.012)
        for(const {l,r,index} of bays){
          pane(l+capWidth/2,r-capWidth/2,Math.min(top,floor+belt),top-.025,faceAt(index),.012)
          batch.wall(cap,pos(l,green?.08:.045),pos(l+capWidth,green?.08:.045),floor,top,bronze?.18:green?.14:.075)
        }
        for(const z of [floor+.025,Math.min(top-.035,floor+belt)]){
          if(detail<2)batch.wall(cap,pos(0,.045),pos(len,.045),z,z+.035,.075)
          else pane(0,len,z,z+.035,cap,.03)
        }
        if(green){
          // Pale pressure caps and a low transom distinguish this close-spaced
          // green-grey curtain from the dark blue tower behind it.
          batch.wall(cap,pos(0,.08),pos(len,.08),floor+.94,floor+.975,.14)
        }
        if(core){
          if(storey(floor)%2===0)for(const {l,r} of centres)batch.wall(l11Material('paint','#854b4b'),pos(l,.065),pos(r,.065),floor+belt,floor+belt+.055,.07)
          if(Math.abs(belt-1.5)>.08&&floor+1.5<top)batch.wall(cap,pos(0,.045),pos(len,.045),floor+1.5,floor+1.532,.075)
        }
        if(open)for(const p of l11InteriorPlan(b).floors[Math.floor(floor/3)]?.walls.flatMap(w=>[w.a,w.b])??[]){
          const t=(p[0]-a[0])*ux+(p[1]-a[1])*uy,offset=(p[0]-a[0])*nx+(p[1]-a[1])*ny
          if(t>.1&&t<len-.1&&Math.abs(offset)<.24)batch.wall(cap,pos(t-.09,-.04),pos(t+.09,-.04),floor,top,.22)
        }
      }
      if(detail<2)batch.wall(cap,pos(len-capWidth,.045),pos(len,.045),lo,hi,bronze?.18:.075)
      continue
    }
    const pitchTarget=service?len/3:piers?2.25:curtain?1.35:stone?2.15:brick?(storey(lo)===0?1.85:3.45):3.3,count=retailBays?.length??Math.max(1,Math.round(len/pitchTarget)),pitch=len/count
    const bay=(i:number,floor:number)=>{
      const grid=retailBays?.[i],l=grid?.start??i*pitch,r=grid?.end??(i+1)*pitch,margin=piers?.18:curtain?.035:stone?.21:brick?(storey(floor)===0?pitch*.36:(i+storey(floor))%5===2?pitch*.4:.36):.045
      if(grid)return {l,r,left:Math.min(r,Math.max(l,grid.l+margin)),right:Math.max(l,Math.min(r,grid.r-margin)),sill:floor+.16,head:Math.min(hi-.12,floor+2.78)}
      if(service){const wide=i===2,width=Math.min(pitch*.35,wide?1.1:.38),centre=(l+r)/2;return {l,r,left:centre-width/2,right:centre+width/2,sill:floor+(wide?1.72:1.22),head:Math.min(hi-.12,floor+(wide?2.04:2.05))}}
      return {l,r,left:l+Math.min(margin,pitch*.42),right:r-Math.min(margin,pitch*.42),sill:floor+(curtain||piers?.16:brick?.84:stone?.95:.8),head:Math.min(hi-.12,floor+(ribbon?2.14:brick?2.58:stone?2.56:2.78))}
    }
    if(detail===2){
      for(let floor=lo;floor<hi-1e-6;floor+=3)for(let i=0;i<count;i++){
        const {l,r,left,right,sill,head}=bay(i,floor)
        if(right-left<.12){pane(l,r,floor,Math.min(hi,floor+3),wall,0);continue}
        // The far facade is a non-overlapping wall/window tessellation.
        // Decals only 3cm in front of a backing wall z-fight at city distances.
        pane(l,r,floor,sill,wall,0);pane(l,r,head,Math.min(hi,floor+3),wall,0)
        pane(l,left,sill,head,wall,0);pane(right,r,sill,head,wall,0)
        const shade=(i*7+storey(floor)*9+b.seed)%11
        pane(left,right,sill,head,stone&&shade%3!==0?l11Material('sealedglass',shade%2?'#8f9589':'#737c72'):glazing,0)
      }
      continue
    }
    for(let floor=lo;floor<hi-1e-6;floor+=3)for(let i=0;i<count;i++){
      const {l,r,left,right,sill,head}=bay(i,floor)
      if(right-left<.12){fill(l,r,floor,Math.min(hi,floor+3));continue}
      fill(l,r,floor,sill);fill(l,r,head,Math.min(hi,floor+3));fill(l,left,sill,head);fill(right,r,sill,head)
      // Two jambs and a sill provide shadowed depth even in the middle LOD.
      const frame=brick&&floor===0?l11Material('propwood','#aa6944'):brick?trim:metal,fw=brick?.075:curtain?.03:.055
      for(const t of [left,right-fw])batch.wall(frame,pos(t,-.11),pos(t+fw,-.11),sill,head,.12)
      for(const h of [sill,head-.045])batch.wall(frame,pos(left,-.11),pos(right,-.11),h,h+.045,.13)
      const variation=(i*7+storey(floor)*9+b.seed)%11,stoneBay=stone&&!open&&detail===0,face=open||stoneBay?glass:stone&&variation%3!==0?l11Material('sealedglass',variation%2?'#8f9589':'#737c72'):variation<2?l11Material('sealedglass',brick?'#637a7b':stone?'#706b5d':'#49646b'):glazing
      if(stoneBay){
        // Shallow, enclosed window bays on inaccessible floors. Curtains sit
        // behind real glass; the dark back and returns prevent sight through
        // the entire tower when viewing an upper window obliquely.
        pane(left,right,sill,head,dark,-.62)
        for(const t of [left,right])batch.wall(lining,pos(t,-.41),pos(t+.04,-.41),sill,head,.42)
        for(const h of [sill,head-.04])batch.wall(lining,pos(left,-.41),pos(right,-.41),h,h+.04,.42)
        if(variation%3!==0){
          const fabric=l11Material('fabric',variation%2?'#b6b6a6':'#b4b8ac',true),width=(right-left)*(.42+(variation%4)*.15),start=variation%2?left:right-width
          pane(start,start+width,sill+.08,head-.07,fabric,-.34)
          for(let t=start+.07;t<start+width-.03;t+=.22)batch.wall(fabric,pos(t,-.31),pos(t+.035,-.31),sill+.08,head-.07,.045)
        }
      }
      pane(left+fw,right-fw,sill+.04,head-.04,face,-.2)
      if(core&&i%4===1)pane(left+fw,right-fw,sill+.04,head-.04,l11Material('paint',storey(floor)%7===3?'#b08755':'#315c8a'),-.19)
      if(!detail){
        const mullion=brick?(variation%3===0?.23:.72):.5,t=left+(right-left)*mullion
        if(!curtain&&(!service||i===2))batch.wall(frame,pos(t,-.08),pos(t+fw,-.08),sill,head,.13)
        if(stone){const t2=left+(right-left)*.78;batch.wall(frame,pos(t2,-.08),pos(t2+fw*.75,-.08),sill,head,.13)}
        if(brick&&variation%4===0){const t2=left+(right-left)*.47;batch.wall(frame,pos(t2,-.08),pos(t2+fw,-.08),sill,head,.13)}
        if(brick&&!open&&variation%3===1){
          // An inset curtain occupies part of a window, with a shaded reveal;
          // it is not painted onto the wall or used to fake an accessible room.
          const curtain=l11Material('fabric',variation%2?'#b9c3b8':'#b8ac95',true)
          const edge=left+(right-left)*(.24+(variation%3)*.06)
          pane(left+fw,edge,sill+.07,head-.08,curtain,-.185)
          for(let t=left+fw+.07;t<edge;t+=.16)batch.wall(lining,pos(t,-.17),pos(t+.025,-.17),sill+.08,head-.08,.03)
        }
        if(!open&&!stoneBay&&variation%4===0){
          // Closed upper floors show a recessed blind, not a bright flat box.
          const blind=l11Material('paint',stone?'#96907b':'#8e9c9b')
          pane(left+.12,right-.12,head-.42,head-.09,blind,-.15)
          for(let slat=0;slat<4;slat++){const z=head-.4+slat*.075;batch.wall(metal,pos(left+.12,-.13),pos(right-.12,-.13),z,z+.012,.025)}
        }
        if(piers){const t=retailBays?.[i].l??l;if(t>=-.001)batch.wall(trim,pos(t-.11,.19),pos(t+.11,.19),floor,Math.min(hi,floor+3),.68)}
        if(stone){batch.wall(wall,pos(left-.035,.015),pos(right+.035,.015),sill-.045,sill,.30)}
        if(brick){batch.wall(trim,pos(left-.045,.03),pos(right+.045,.03),sill-.055,sill,.43)}
      }
      if(piers&&detail===1){const t=retailBays?.[i].l??l;if(t>=-.001)batch.wall(trim,pos(t-.11,.19),pos(t+.11,.19),floor,Math.min(hi,floor+3),.68)}
      if(stone){
        batch.wall(trim,pos(l-.045,.065),pos(l+.045,.065),floor,Math.min(hi,floor+3),.22)
        if(!detail)batch.wall(trim,pos(l,.065),pos(r,.065),floor+.03,floor+.09,.22)
      }
      // A partition meeting a glazed bay gets a real opaque backing and jamb.
      if(open)for(const p of l11InteriorPlan(b).floors[Math.floor(floor/3)]?.walls.flatMap(w=>[w.a,w.b])??[]){
        const t=(p[0]-a[0])*ux+(p[1]-a[1])*uy,offset=(p[0]-a[0])*nx+(p[1]-a[1])*ny
        if(t>left+.1&&t<right-.1&&Math.abs(offset)<.24)batch.wall(trim,pos(t-.09,-.04),pos(t+.09,-.04),sill,head,.42)
      }
    }
    if(lo<.1)batch.wall(l11Material('concrete','#74766e'),a,end,0,.2,.42)
    if(stone&&hi>=b.floors*3-.01)for(let k=0;k<3;k++)batch.wall(trim,pos(0,.08+k*.09),pos(len,.08+k*.09),hi-.5+k*.17,hi-.35+k*.17,.4+k*.16)
    if(curtain)batch.wall(metal,a,end,hi-.09,hi,.43)
    if(ribbon)batch.wall(wall,a,end,hi-.12,hi,.58)
    // Closed upper floors have true floor edges behind their glazing.
    if(!open&&!detail)batch.wall(dark,pos(0,-.3),pos(len,-.3),lo,lo+.14,.18)
  }
  return true
}
