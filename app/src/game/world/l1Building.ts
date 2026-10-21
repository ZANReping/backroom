import {l1LayoutVariant,l1Outpost} from './l1Layout'
import {l1PlanTile,l1PlanDoors,l1RegionAt} from './l1Plan'
import {l1HallWall,l1Mod,l1Noise,l1ParkingAt,l1ReferenceAt,l1RegionReference,l1PathRoom} from './l1Spatial'
import {L1_REFERENCE_CASES} from './l1ReferenceCases'
import {l1Puddles} from './l1Puddles'
import {l1ParkingServices} from './l1ParkingServices'
import {fitL1Exit} from './l1WallFixtures'
import {L1_STYLE_NAMES,type L1ArchitectureData,type L1Box,type L1Emitter,type L1Module,type L1StyleName,type V3} from './l1BuildingTypes'

const BASE:Record<L1StyleName,L1Module>={
 parking:{height:3.25,spacingX:7,spacingZ:7,phaseX:6.5,phaseZ:6.5,columnWidth:.92,columnDepth:1.08,round:false,beamDepth:.27,beamWidth:.42,lampSpacing:7,wallTubes:true,power:1.25,finish:'raw'},
 storage:{height:6.2,spacingX:10,spacingZ:9,phaseX:6.5,phaseZ:6.5,columnWidth:.62,columnDepth:.62,round:false,beamDepth:1.1,beamWidth:.30,lampSpacing:7,wallTubes:false,power:2,finish:'raw'},
 gothic:{height:3.65,spacingX:6,spacingZ:6,phaseX:4.5,phaseZ:4.5,columnWidth:1.08,columnDepth:1.08,round:true,beamDepth:0,beamWidth:0,lampSpacing:6,wallTubes:false,power:1.05,finish:'raw'},
 ouroboros:{height:4.25,spacingX:7,spacingZ:7,phaseX:6.5,phaseZ:6.5,columnWidth:.78,columnDepth:.78,round:false,beamDepth:.55,beamWidth:.55,lampSpacing:7,wallTubes:false,power:1.1,finish:'peeling'},
 garden:{height:7.8,spacingX:7.2,spacingZ:7.2,phaseX:6.5,phaseZ:6.5,columnWidth:1.65,columnDepth:1.65,round:false,beamDepth:.4,beamWidth:.65,lampSpacing:7.2,wallTubes:false,power:4.6,finish:'raw'},
 fabled:{height:3.3,spacingX:6,spacingZ:6,phaseX:4.5,phaseZ:4.5,columnWidth:.34,columnDepth:.34,round:false,beamDepth:.32,beamWidth:.28,lampSpacing:6,wallTubes:false,power:3.4,finish:'paint'},
 maintenance:{height:2.65,spacingX:8,spacingZ:8,phaseX:6.5,phaseZ:6.5,columnWidth:.6,columnDepth:.6,round:false,beamDepth:.14,beamWidth:.18,lampSpacing:5,wallTubes:false,power:.9,finish:'paint'},
}
export function l1BuildingStyleAt(seed:number,x:number,z:number):L1StyleName {
 return l1PlanTile(seed,x,z).style as L1StyleName
}
export function l1ModuleAt(seed:number,x:number,z:number,force?:L1StyleName):L1Module {
 const style=force??l1BuildingStyleAt(seed,x,z),region=style==='gothic'?l1RegionAt(seed,x,z):undefined
 // A vault cannot change its shaft grid or springing height at the edge of a
 // photographic bay. Use one structural profile throughout its gothic hall.
 const candidate=region?.section==='gothic'?l1RegionReference(seed,region):l1ReferenceAt(seed,x,z)
 const ref=candidate?.variant===style?candidate:undefined,override=ref?L1_REFERENCE_CASES[ref.id]?.module:undefined
 const p={...BASE[style],...override}
 if(ref){p.phaseX+=ref.centerX;p.phaseZ+=ref.centerY}
 else if(style==='parking'){const a=l1ParkingAt(seed,x,z);p.round=a.round;if(a.clean)p.finish='paint';if(a.brightness<.3){p.lighting='service-bay';p.wallTubes=false}}
 return p
}
export function l1BuildingRoof(seed:number,x:number,z:number,underside=false){
 const style=l1BuildingStyleAt(seed,x,z),p=l1ModuleAt(seed,x,z)
 if(style!=='gothic'||!underside)return p.height
 const distance=(v:number,o:number,s:number)=>{const t=l1Mod(v-o,s);return Math.min(t,s-t)}
 const dx=distance(x,p.phaseX,p.spacingX),dz=distance(z,p.phaseZ,p.spacingZ),radius=p.columnWidth/2
 const arc=(d:number,span:number)=>{const t=Math.min(1,Math.max(0,d-radius)/(span/2-radius));return Math.sqrt(Math.max(0,1-(1-t)**2))}
 const r=Math.hypot(dx,dz),blend=Math.min(1,Math.max(0,(r-radius-.12)/.9))
 const springHeight=p.springHeight??1.35
 return springHeight+(p.height-springHeight)*(arc(r,Math.min(p.spacingX,p.spacingZ))*(1-blend)+Math.max(arc(dx,p.spacingX),arc(dz,p.spacingZ))*blend)
}
const pathTiles=new Map<string,Uint8Array>()
/** Stable path topology is independent of loot RNG and loaded chunks. */
function pathFloor(seed:number,cx:number,cz:number){
 const key=`${seed}:${cx},${cz}`,cached=pathTiles.get(key);if(cached)return cached
 const out=new Uint8Array(1024),ref=l1ReferenceAt(seed,cx*32+16,cz*32+16),room=l1PathRoom(seed,cx,cz)
 const vx=ref?14:8+Math.floor(l1Noise(cx,cz,seed^0x31)*12),hy=ref?14:9+Math.floor(l1Noise(cx,cz,seed^0x32)*10)
 const rect=(x0:number,z0:number,x1:number,z1:number)=>{for(let z=Math.max(0,z0);z<Math.min(32,z1);z++)for(let x=Math.max(0,x0);x<Math.min(32,x1);x++)out[z*32+x]=1}
 rect(vx,0,vx+2,32);rect(0,hy,32,hy+2)
 if(room){
  rect(room.x0-cx*32,room.y0-cz*32,room.x1-cx*32,room.y1-cz*32)
  if(room.alcove)rect(room.alcove.x0-cx*32,room.alcove.y0-cz*32,room.alcove.x1-cx*32,room.alcove.y1-cz*32)
  // The closet opens at its near end; the rear wall remains intact.
  const entry=ref?.id==='path-room'?room.y1-cz*32:19
  rect(vx,entry,room.x1-cx*32,entry+2)
 }
 if(!ref){rect(5,5,27,7);rect(5,25,27,27);rect(5,5,7,27);rect(25,5,27,27)}
 // Every border has one shared 2m portal; adjacent path chunks agree on its coordinate.
 for(const [dx,dz]of [[1,0],[-1,0],[0,1],[0,-1]]){
  const edgeX=cx+(dx>0?1:0),edgeZ=cz+(dz>0?1:0)
  const slot=4+2*Math.floor(l1Noise(edgeX,edgeZ,seed^(dx?0xd001:0xd002))*12)
  if(dx){rect(dx>0?vx:0,slot,dx>0?32:vx+2,slot+2);for(let z=0;z<32;z++)out[z*32+(dx>0?31:0)]=z===slot||z===slot+1?1:0}
  else{rect(slot,dz>0?hy:0,slot+2,dz>0?32:hy+2);for(let x=0;x<32;x++)out[(dz>0?31:0)*32+x]=x===slot||x===slot+1?1:0}
 }
 if(pathTiles.size>=512)pathTiles.delete(pathTiles.keys().next().value!);pathTiles.set(key,out);return out
}
export function l1BuildingFloorAt(seed:number,x:number,z:number,_force?:L1StyleName){
 const cx=Math.floor(x/32),cz=Math.floor(z/32),lx=l1Mod(Math.floor(x),32),lz=l1Mod(Math.floor(z),32)
 const t=l1PlanTile(seed,x,z)
 if(t.door)return true
 if(!t.floor)return false
 if(t.style==='maintenance')return true
 if(l1Outpost(seed,cx,cz)&&lx>=9&&lx<24&&lz>=9&&lz<24)return true
 return !l1HallWall(seed,x,z,t.style)
}
export function l1BuildingFloorAtLegacy(seed:number,x:number,z:number,force?:L1StyleName){
 const cx=Math.floor(x/32),cz=Math.floor(z/32),lx=l1Mod(Math.floor(x),32),lz=l1Mod(Math.floor(z),32),style=force??l1BuildingStyleAt(seed,x,z)
 const ref=l1ReferenceAt(seed,x,z)
 if(ref?.id==='crate'&&Math.abs(x-ref.centerX)<4&&Math.abs(z-ref.centerY)<4)return true
 if(style==='maintenance')return pathFloor(seed,cx,cz)[lz*32+lx]===1
 if(l1Outpost(seed,cx,cz)&&lx>=9&&lx<24&&lz>=9&&lz<24)return true
 // A path owns its perimeter; its neighbour preserves the matching approach.
 for(const [dx,dz]of [[1,0],[-1,0],[0,1],[0,-1]])if(l1LayoutVariant(seed,cx+dx,cz+dz)==='maintenance'&&(dx<0&&lx<3||dx>0&&lx>28||dz<0&&lz<3||dz>0&&lz>28))return true
 return !l1HallWall(seed,x,z,style)
}
const caches=new Map<string,L1ArchitectureData>()
export function buildL1Data(seed:number,cx:number,cy:number,force?:L1StyleName):L1ArchitectureData {
 const key=`${seed}:${cx},${cy}:${force??''}`,cached=caches.get(key);if(cached)return cached
 const x0=cx*32,z0=cy*32,boxes:L1Box[]=[],emitters:L1Emitter[]=[],roofs:L1ArchitectureData['roofs']=[],openings:L1ArchitectureData['openings']=[],floor=new Uint8Array(1024),styles=new Uint8Array(1024),sideRoom=l1PathRoom(seed,cx,cy)
 const styleAt=(x:number,z:number)=>force??l1BuildingStyleAt(seed,x,z)
 const addBox=(id:string,min:V3,max:V3,style:L1StyleName,surface:L1Box['surface'],solid=false,detail=false,shape?:'round',axis?:0|1|2)=>boxes.push({id,min,max,style,surface,solid,detail,occlude:!detail,shape,axis})
 const lamp=(id:string,p:V3,n:V3,t:V3,w:number,h:number,style:L1StyleName,kind:L1Emitter['kind'],power:number,range?:number)=>{
  const color:V3=style==='gothic'?[1,.9,.75]:style==='garden'?[1,.94,.75]:style==='storage'?[1,.97,.87]:[.93,.97,1]
  emitters.push({id,position:p,normal:n,tangent:t,width:w,height:h,style,kind,power,range:range??(kind==='sky'?20:kind==='emergency'?2.2:16),color:kind==='emergency'?[.27,.64,.4]:color,backEmission:kind==='panel'&&style!=='ouroboros'?.12:0})
 }
 for(let z=0;z<32;z++)for(let x=0;x<32;x++){const style=styleAt(x0+x+.5,z0+z+.5);styles[z*32+x]=L1_STYLE_NAMES.indexOf(style);floor[z*32+x]=+l1BuildingFloorAt(seed,x0+x,z0+z,force)}
 // Coalesce actual wall volumes; their exact faces are also the lighting occluders.
 const used=new Uint8Array(1024)
 for(let z=0;z<32;z++)for(let x=0;x<32;x++){
  const i=z*32+x;if(floor[i]||used[i])continue
  const style=L1_STYLE_NAMES[styles[i]],p=l1ModuleAt(seed,x0+x,z0+z,style)
  let w=1,d=1;while(x+w<32&&!floor[i+w]&&!used[i+w]&&styles[i+w]===styles[i])w++
  outer:while(z+d<32){for(let k=0;k<w;k++)if(floor[(z+d)*32+x+k]||used[(z+d)*32+x+k]||styles[(z+d)*32+x+k]!==styles[i])break outer;d++}
  for(let dz=0;dz<d;dz++)for(let dx=0;dx<w;dx++)used[(z+dz)*32+x+dx]=1
  addBox(`wall:${x0+x},${z0+z}`,[x0+x,0,z0+z],[x0+x+w,p.height,z0+z+d],style,p.wallFinish??'wall',true)
 }
 // 传说段 (ref 传说段.webp): dark timber wainscot on every hall-facing wall; most runs carry the old
 // timber-framed frosted-glass office partition up to ~2.5 m with a dark board fascia above.
 for(const b of boxes.slice())if(b.style==='fabled'&&b.solid&&b.id.startsWith('wall:')){
  const H=b.max[1]
  for(const [axis,side] of [[0,-1],[0,1],[2,-1],[2,1]] as const){
   const along=axis===0?2:0,face=side<0?b.min[axis]:b.max[axis],lo=b.min[along],hi=b.max[along]
   const floorAt=(t:number)=>{const q=face+side*.5;return axis===0?l1BuildingFloorAt(seed,q,t,force):l1BuildingFloorAt(seed,t,q,force)}
   let a=NaN
   for(let t=lo;t<=hi;t++){
    const ok=t<hi&&floorAt(t+.5)
    if(ok&&Number.isNaN(a))a=t
    if(!ok&&!Number.isNaN(a)){fabledWall(axis,side,face,a,t,H);a=NaN}
   }
  }
 }
 // 传说段 ceiling: exposed timber joists (ref) every 0.9 m along x, coalesced per run of fabled floor.
 for(let jx=Math.ceil((x0+.45)/.9)*.9-.45;jx<x0+32;jx+=.9){
  const cxI=Math.floor(jx-x0);let a=NaN
  for(let z=0;z<=32;z++){
   const ok=z<32&&floor[z*32+cxI]&&styles[z*32+cxI]===L1_STYLE_NAMES.indexOf('fabled')
   if(ok&&Number.isNaN(a))a=z
   if(!ok&&!Number.isNaN(a)){const H=l1ModuleAt(seed,jx,z0+a,'fabled').height;addBox(`fab:joist:${jx.toFixed(2)}:${z0+a}`,[jx-.05,H-.24,z0+a],[jx+.05,H,z0+z],'fabled','paint',false,true);a=NaN}
  }
 }
 function fabledWall(axis:0|2,side:-1|1,face:number,a:number,e:number,H:number){
  const box=(id:string,t0:number,t1:number,y0:number,y1:number,d0:number,d1:number,surface:L1Box['surface'])=>{
   const n0=side<0?face-d1:face+d0,n1=side<0?face-d0:face+d1
   addBox(`fab:${id}:${axis}${side}:${face}:${t0.toFixed(2)}`,axis===0?[n0,y0,t0]:[t0,y0,n0],axis===0?[n1,y1,t1]:[t1,y1,n1],'fabled',surface,false,true)
  }
  const glazed=((Math.imul(Math.floor(face*7+a*13+axis*31)^seed,2654435761)>>>0)%10)<7&&e-a>=3
  box('wainscot',a,e,0,1.05,0,.05,'paint');box('rail',a,e,1.05,1.13,0,.09,'paint')
  if(!glazed)return
  box('sill',a,e,1.13,1.2,0,.07,'paint');box('glass',a,e,1.2,2.42,0,.025,'glass');box('head',a,e,2.42,2.52,0,.08,'paint');box('fascia',a,e,2.52,H,0,.04,'paint')
  const n=Math.max(1,Math.round((e-a)/1.25))
  for(let i=0;i<=n;i++){const t=a+(e-a)*i/n;box('post',Math.max(a,t-.045),Math.min(e,t+.045),1.13,2.52,0,.075,'paint')}
  for(let i=0;i<n;i++){box('bar',a+(e-a)*i/n,a+(e-a)*(i+1)/n,1.78,1.83,0,.05,'paint')}
 }
 const ref=l1ReferenceAt(seed,x0+16,z0+16),partitions=ref?(L1_REFERENCE_CASES[ref.id].partitions??[]).map(b=>({min:[b.min[0]+ref.centerX,b.min[1]+ref.centerY],max:[b.max[0]+ref.centerX,b.max[1]+ref.centerY]})):[]
 for(const [i,b]of partitions.entries()){
  const x=Math.max(x0,b.min[0]),z=Math.max(z0,b.min[1]),X=Math.min(x0+32,b.max[0]),Z=Math.min(z0+32,b.max[1]);if(X<=x||Z<=z)continue
  const style=styleAt((x+X)/2,(z+Z)/2)
  addBox(`partition:${ref!.id}:${i}:${cx},${cy}`,[x,0,z],[X,l1ModuleAt(seed,x,z,style).height,Z],style,'wall',true)
 }
 const clear=(x:number,z:number,r=.6)=>{for(const dx of [-r,0,r])for(const dz of [-r,0,r])if(!l1BuildingFloorAt(seed,x+dx,z+dz,force))return false;return !partitions.some(b=>x+r>b.min[0]&&x-r<b.max[0]&&z+r>b.min[1]&&z-r<b.max[1])}
 const candidateStyles=[...new Set(Array.from(styles,n=>L1_STYLE_NAMES[n]))]
 // Mixed chunks can contain several hall grids. The centre of the streaming
 // chunk is never the authority for a pillar on its opposite edge.
 const profiles=new Map<string,{style:L1StyleName;p:L1Module}>(),profileKey=(style:L1StyleName,p:L1Module)=>style+JSON.stringify(p)
 for(let z=0;z<32;z++)for(let x=0;x<32;x++){
  const style=styleAt(x0+x+.5,z0+z+.5);if(style==='maintenance')continue
  const p=l1ModuleAt(seed,x0+x+.5,z0+z+.5,style);profiles.set(profileKey(style,p),{style,p})
 }
 for(const [key,{style,p}]of profiles){
  if(style==='maintenance')continue
  for(let gz=Math.ceil((z0-p.phaseZ)/p.spacingZ);;gz++){
   const z=p.phaseZ+gz*p.spacingZ;if(z>=z0+32)break
   for(let gx=Math.ceil((x0-p.phaseX)/p.spacingX);;gx++){
    const x=p.phaseX+gx*p.spacingX;if(x>=x0+32)break
    if(styleAt(x,z)!==style||profileKey(style,l1ModuleAt(seed,x,z,style))!==key)continue
    const radius=Math.max(p.columnWidth,p.columnDepth)/2
    // Shafts meeting perimeter walls become real engaged columns. Requiring a
    // clearance halo used to delete them while leaving their vaults suspended.
    const visible=style==='gothic'?[-radius,0,radius].some(dx=>[-radius,0,radius].some(dz=>styleAt(x+dx,z+dz)==='gothic'&&l1BuildingFloorAt(seed,x+dx,z+dz,force))):clear(x,z,radius+.2)
    if(!visible||style!=='gothic'&&Math.hypot(x-15.5,z-15.5)<4)continue
    const id=`column:${x.toFixed(3)},${z.toFixed(3)}`,top=style==='gothic'?(p.springHeight??1.35):p.height
    const round=p.round&&(p.columnPattern!=='mixed'||l1Mod(gz,3)===0)
    if(style==='storage'){
     // Painted steel sections, with a recessed web and two actual flanges.
     addBox(id+':web',[x-.045,0,z-p.columnDepth/2],[x+.045,top,z+p.columnDepth/2],style,'paint',true)
     for(const side of [-1,1])addBox(id+':flange'+side,[x-p.columnWidth/2,0,z+side*(p.columnDepth/2-.03)-.03],[x+p.columnWidth/2,top,z+side*(p.columnDepth/2-.03)+.03],style,'paint',true)
    }else if(style==='ouroboros'){
     // v3.2 衔尾段 (ref 衔尾段.png): three column finishes — fully spray-fireproofed with a lagged
     // drop cap, soot-black top over beige spotted paint (two-tone shader on 'peeling'), or raw concrete.
     const k=l1Noise(gx,gz,seed^0x0c01)
     const surf=k<.3?'whitePipe':k<.78?'peeling':'column'
     addBox(id,[x-p.columnWidth/2,0,z-p.columnDepth/2],[x+p.columnWidth/2,top,z+p.columnDepth/2],style,surf,true)
     if(surf==='whitePipe'){
      const cap=.95+l1Noise(gx,gz,seed^0x0c03)*.2,y1=p.height-p.beamDepth+.02,y0=y1-.34
      addBox(id+':cap',[x-cap,y0,z-cap],[x+cap,y1,z+cap],style,'whitePipe',false,true)
      addBox(id+':cap2',[x-cap*.62,y0-.14,z-cap*.62],[x+cap*.62,y0,z+cap*.62],style,'whitePipe',false,true)
      for(let n=0;n<4;n++){const q=l1Noise(gx*5+n,gz,seed^0x0c25),a=n*Math.PI/2+q,ox=Math.cos(a)*cap*.55,oz=Math.sin(a)*cap*.55,r=.22+q*.25
       addBox(id+':lump'+n,[x+ox-r,y0-.06-q*.08,z+oz-r],[x+ox+r,y0+.02,z+oz+r],style,'whitePipe',false,true)}
      for(let n=0;n<2;n++){const q=l1Noise(gx+n*3,gz*5,seed^0x0c27),y=.6+q*2.4,e=.025+q*.03
       addBox(id+':clump'+n,[x-p.columnWidth/2-e,y,z-p.columnDepth/2-e],[x+p.columnWidth/2+e,y+.25+q*.4,z+p.columnDepth/2+e],style,'whitePipe',false,true)}
     }
     if(l1Noise(gx,gz,seed^0x0c05)<.35)addBox(id+':tag',[x-.09,.42,z-p.columnDepth/2-.006],[x+.03,.52,z-p.columnDepth/2],style,'red',false,true)
    }else addBox(id,[x-p.columnWidth/2,0,z-p.columnDepth/2],[x+p.columnWidth/2,top,z+p.columnDepth/2],style,p.finish==='peeling'?'peeling':p.finish==='paint'?'paint':'column',true,false,round?'round':undefined)
    const dress=Math.floor(l1Noise(gx,gz,seed^517)*5)
    if(style==='parking'&&dress===3){const h=1.15;addBox(id+':repair',[x-p.columnWidth/2-.008,.22,z-p.columnDepth/2-.008],[x+p.columnWidth/2+.008,h,round?z+p.columnDepth/2+.008:z-p.columnDepth/2+.008],style,'paint',false,true,round?'round':undefined)}
    if(style==='parking'&&dress===1&&!round)for(const side of [-1,1])addBox(id+':guard'+side,[x+side*(p.columnWidth/2-.03)-.025,.06,z-p.columnDepth/2-.025],[x+side*(p.columnWidth/2-.03)+.025,.85,z-p.columnDepth/2+.07],style,'metal',false,true)
    if(p.wallTubes&&!p.lighting){
     const brightness=l1ParkingAt(seed,x,z).brightness,on=l1Noise(gx,gz,seed^771)<Math.min(1,brightness),side=p.tubeSide??1
     lamp(id+':tube',[x+side*(p.columnWidth/2+.065),p.height*.66,z],[side,0,0],[0,1,0],Math.min(1.35,p.height*.48),.045,style,'tube',on?p.power*1.5:0)
    }
   }
  }
 }
 // Roof patches are world-aligned. Services are authored against those patches,
 // rather than an unrelated renderer-side grid.
 for(let z=z0;z<z0+32;z+=2)for(let x=x0;x<x0+32;x+=2){
  const style=styleAt(x+1,z+1),p=l1ModuleAt(seed,x+1,z+1,style)
  const dx=l1Mod(x+1-p.phaseX,p.spacingX),dz=l1Mod(z+1-p.phaseZ,p.spacingZ)
  const sky=style==='garden'&&dx>p.spacingX*.3&&dx<p.spacingX*.7&&dz>p.spacingZ*.3&&dz<p.spacingZ*.7
  roofs.push({id:`roof:${x},${z}`,x,z,w:2,d:2,height:p.height,style,sky})
 }
 // Continuous beam/service runs are clipped to the streaming ownership bounds.
 for(const style of candidateStyles){
  const p=l1ModuleAt(seed,x0+16,z0+16,style)
  if(style!=='gothic'&&style!=='maintenance')for(let k=Math.ceil((z0-p.phaseZ)/p.spacingZ);;k++){
   const z=p.phaseZ+k*p.spacingZ;if(z>=z0+32)break
   for(let x=x0;x<x0+32;x+=2)if(styleAt(x+1,z)===style&&clear(x+1,z,.05)){
    addBox(`beam:${x},${z}`,[x,p.height-(style==='storage'?.32:p.beamDepth),z-p.beamWidth/2],[x+2,p.height+.1,z+p.beamWidth/2],style,style==='storage'?'metal':style==='ouroboros'?'whitePipe':'ceiling')
   }
  }
  if(style==='storage'){
   for(let k=Math.ceil((x0-p.phaseX)/p.spacingX);;k++){
    const x=p.phaseX+k*p.spacingX;if(x>=x0+32)break
    for(let z=z0;z<z0+32;z+=2)if(styleAt(x,z+1)===style){
     addBox(`steel-beam:${x},${z}`,[x-p.beamWidth/2,p.height-p.beamDepth,z],[x+p.beamWidth/2,p.height,z+2],style,'metal')
     addBox(`steel-flange:${x},${z}`,[x-p.beamWidth*.72,p.height-p.beamDepth-.035,z],[x+p.beamWidth*.72,p.height-p.beamDepth+.035,z+2],style,'metal')
    }
   }
   for(let n=0;n<2;n++)for(let k=Math.ceil((x0-p.phaseX-5.2-n*1.05)/p.spacingX);;k++){
    const x=p.phaseX+5.2+n*1.05+k*p.spacingX;if(x>=x0+32)break
    const r=n?.24:.34,y=p.height-.66
    for(let z=z0;z<z0+32;z+=4)if(styleAt(x,z+2)===style){
     addBox(`duct:${x},${z}`,[x-r,y-r,z],[x+r,y+r,z+4],style,'whitePipe',false,false,'round',2)
     for(let j=0;j<4;j++)addBox(`duct-band:${x},${z}:${j}`,[x-r-.012,y-r-.012,z+j+.2],[x+r+.012,y+r+.012,z+j+.24],style,'metal',false,true,'round',2)
    }
   }
  }
  if(style==='ouroboros'){
   // v3.2 衔尾段 ref: spray-fireproofed cross beams + rectangular lagged ducts on hangers, dense red
   // sprinkler mains with drops and elbows, all under a black bare slab.
   for(let k=Math.ceil((x0-p.phaseX)/p.spacingX);;k++){
    const x=p.phaseX+k*p.spacingX;if(x>=x0+32)break
    for(let z=z0;z<z0+32;z+=2)if(styleAt(x,z+1)===style&&clear(x,z+1,.05))addBox(`our-xbeam:${x},${z}`,[x-p.beamWidth/2,p.height-p.beamDepth,z],[x+p.beamWidth/2,p.height+.1,z+2],style,'whitePipe')
   }
   for(let k=Math.ceil((x0-p.phaseX-3.4)/(p.spacingX*2));;k++){
    const x=p.phaseX+3.4+k*p.spacingX*2;if(x>=x0+32)break
    const w=.62,t=.34,y=p.height-p.beamDepth-.12-t/2
    for(let z=z0;z<z0+32;z+=4)if(styleAt(x,z+2)===style){
     addBox(`our-duct:${x},${z}`,[x-w,y-t,z],[x+w,y+t,z+4],style,'whitePipe',false,true)
     // sprayed-on lumps: the coating bulges unevenly along the run
     for(let n=0;n<3;n++){const q=l1Noise(x*7+n,z,seed^0x0c21),zz=z+.3+n*1.25+q*.5,len=.35+q*.55,bw=.03+.05*l1Noise(n,x+z,seed^0x0c23)
      addBox(`our-lump:${x},${z}:${n}`,[x-w-bw,y-t-bw*.8,zz],[x+w+bw*.6,y+t+.005,zz+len],style,'whitePipe',false,true)}
     for(const o of [-w*.7,w*.7])addBox(`our-hanger:${x+o},${z}`,[x+o-.02,y+t,z+1.98],[x+o+.02,p.height,z+2.02],style,'whitePipe',false,true)
    }
   }
   for(let k=Math.ceil((x0-p.phaseX-1.2)/p.spacingX);;k++){
    const x=p.phaseX+1.2+k*p.spacingX;if(x>=x0+32)break
    for(let z=z0;z<z0+32;z+=4)if(styleAt(x,z+2)===style){
     for(const o of [0,.24])addBox(`our-red:${x+o},${z}`,[x+o-.05,p.height-.44,z],[x+o+.05,p.height-.34,z+4],style,'red',false,true,'round',2)
     // sprinkler drops: vertical riser, elbow and short branch at the lower level
     if(l1Mod(Math.floor(z/4),2)===0){
      const dz=z+1.3+l1Noise(x,z,seed^0x0c11)*1.4
      addBox(`our-drop:${x},${z}`,[x-.035,p.height-1.05,dz-.035],[x+.035,p.height-.4,dz+.035],style,'red',false,true,'round',1)
      addBox(`our-elbow:${x},${z}`,[x-.035,p.height-1.1,dz-.035],[x+.9,p.height-1.03,dz+.035],style,'red',false,true,'round',0)
     }
    }
   }
   // cross mains along x (a second red layer, as in the ref's left half)
   for(let j=Math.ceil((z0-p.phaseZ-2.3)/p.spacingZ);;j++){
    const z=p.phaseZ+2.3+j*p.spacingZ;if(z>=z0+32)break
    if(l1Mod(j,2))continue
    for(let x=x0;x<x0+32;x+=4)if(styleAt(x+2,z)===style)addBox(`our-redx:${x},${z}`,[x,p.height-.62,z-.06],[x+4,p.height-.5,z+.06],style,'red',false,true,'round',0)
   }
   // abandoned floor: paper scraps, rubble chips, dark bits, a few red/blue wrappers
   for(let n=0;n<40;n++){
    const x=x0+l1Noise(n,x0*3+z0,seed^0x7a1)*32,z=z0+l1Noise(n,z0*5+x0,seed^0x7a3)*32
    if(styleAt(x,z)!==style||!clear(x,z,.35))continue
    const q=l1Noise(n,x0+z0,seed^0x7a5),w=.05+q*.22,d=.04+l1Noise(n,7,seed^0x7a7)*.18,h=.006+q*q*.04
    addBox(`our-litter:${x.toFixed(2)},${z.toFixed(2)}`,[x,0,z],[x+w,h,z+d],style,q<.5?'line':q<.78?'column':q<.92?'cable':'red',false,true)
   }
  }
  if(style==='parking')boxes.push(...l1ParkingServices(p,x0,z0,(x,z)=>styleAt(x,z)==='parking'&&clear(x,z,.05)))
  for(let z=z0;z<z0+32;z+=4)for(let x=x0;x<x0+32;x+=4){
   if(styleAt(x+2,z+2)!==style||!clear(x+2,z+2,.2))continue
   if(style==='ouroboros'&&l1Mod(Math.floor((x+2-p.phaseX)/4),3)===0)addBox(`conduit:${x},${z}`,[x+1.97,p.height-.3,z],[x+2.03,p.height-.24,z+4],style,'cable',false,true,'round',2)
   if(style==='storage'){
    addBox(`purlin:${x},${z}`,[x+1.91,p.height-.24,z],[x+2.09,p.height-.195,z+4],style,'metal',false,true)
    addBox(`web:${x},${z}`,[x+1.975,p.height-.195,z],[x+2.025,p.height,z+4],style,'metal',false,true)
   }
  }
  if(style==='gothic')for(let z=Math.ceil((z0-p.phaseZ-3)/p.spacingZ)*p.spacingZ+p.phaseZ+3;z<z0+32;z+=p.spacingZ){
   // Individual parking bays leave a gap beside each column aisle. Clip the
   // same world-space segment at chunk edges, not a full-width white stripe.
   for(let gx=Math.floor((x0-p.phaseX)/p.spacingX)-1;gx<=Math.ceil((x0+32-p.phaseX)/p.spacingX);gx++){
    const a=Math.max(x0,p.phaseX+gx*p.spacingX+.7),b=Math.min(x0+32,p.phaseX+(gx+1)*p.spacingX-.9)
    if(b>a&&clear((a+b)/2,z,.05)&&styleAt((a+b)/2,z)===style)addBox(`parking-line:${a},${z}`,[a,.003,z-.028],[b,.005,z+.028],style,'line',false,true)
   }
  }
  if(p.lighting==='service-bay'){
   const config=p.serviceLight,offsetX=p.spacingX*(config?.offsetX??.48),offsetZ=config?.offsetZ??-4
   for(let iz=Math.ceil((z0-p.phaseZ-offsetZ)/28);;iz++){const z=p.phaseZ+offsetZ+iz*28;if(z>=z0+32)break
    for(let ix=Math.ceil((x0-p.phaseX-offsetX)/(p.spacingX*2));;ix++){const x=p.phaseX+offsetX+ix*p.spacingX*2;if(x>=x0+32)break
     if(styleAt(x,z)===style&&clear(x,z,.5))lamp(`service-light:${x},${z}`,[x,p.height-(config?.drop??.18),z],[0,-1,0],config?.alongZ?[0,0,1]:[1,0,0],1.5,.08,style,'tube',p.power*4,config?.range)
    }
   }
  }
  const spacing=p.lampSpacing,phaseX=p.lampPhaseX??.5,phaseZ=p.lampPhaseZ??.5
  for(let gz=Math.ceil((z0-p.phaseZ-spacing*phaseZ)/spacing);;gz++){
   const z=p.phaseZ+(gz+phaseZ)*spacing;if(z>=z0+32)break
   for(let gx=Math.ceil((x0-p.phaseX-spacing*phaseX)/spacing);;gx++){
    const x=p.phaseX+(gx+phaseX)*spacing;if(x>=x0+32)break
    if(styleAt(x,z)!==style||!clear(x,z,.4))continue
    if(style==='maintenance'&&sideRoom&&x>sideRoom.x0&&x<sideRoom.x1&&z>sideRoom.y0&&z<sideRoom.y1)continue
    if(p.lighting==='wall-bay'||p.lighting==='wall-tubes'&&l1Noise(gx,gz,seed^123)>.2)continue
    const on=p.lighting!=='service-bay'&&(style!=='parking'||!p.wallTubes||l1Noise(gx,gz,seed^123)<.25)
    if(style==='garden'&&l1Mod(gx+gz,2))continue // v2: skylights plus a sparse grey fill grid (ref is evenly bright moss)
    lamp(`lamp:${x.toFixed(3)},${z.toFixed(3)}`,[x,(style==='gothic'?l1BuildingRoof(seed,x,z,true):p.height)-(style==='storage'?p.beamDepth+.25:.15),z],[0,-1,0],p.lampAlongZ||style==='ouroboros'&&l1Mod(gx+gz,2)?[0,0,1]:[1,0,0],style==='storage'?1.4:style==='ouroboros'?2.6:1.2,style==='storage'?.48:.045,style,style==='storage'||style==='ouroboros'?'panel':'tube',on?(style==='garden'?p.power*.45:p.power):0)
   }
  }
 }
 // v2 小径: ceiling tubes along the 2 m maze corridors (one per other 3 m cell, centred across the corridor).
 if(candidateStyles.includes('maintenance')){
  const pm=BASE.maintenance,mf=(x:number,z:number)=>{const t=l1PlanTile(seed,Math.floor(x),Math.floor(z));return t.floor&&t.style==='maintenance'&&!t.room}
  for(let j=Math.floor(z0/3);j*3<z0+32;j++)for(let i=Math.floor(x0/3);i*3<x0+32;i++){
   if(l1Mod(i+2*j,3))continue
   for(const o of [1,2]){const x=i*3+o,z=j*3+o;if(x<x0||x>=x0+32||z<z0||z>=z0+32)continue
    if(!(mf(x-.5,z-.5)&&mf(x+.5,z-.5)&&mf(x-.5,z+.5)&&mf(x+.5,z+.5)))continue
    const alongZ=mf(x,z-1.6)&&mf(x,z+1.6),alongX=mf(x-1.6,z)&&mf(x+1.6,z)
    if(!alongZ&&!alongX)continue // no tube hard against a dead-end / corner wall
    lamp(`path-tube:${x},${z}`,[x,pm.height-.06,z],[0,-1,0],alongZ?[0,0,1]:[1,0,0],1.2,.06,'maintenance','tube',pm.power*.5,8);break}
  }
 }
 for(const r of roofs)if(r.sky)lamp(r.id+':sun',[r.x+1,r.height+.04,r.z+1],[.32,-.92,-.2],[1,0,0],r.w,r.d,r.style,'sky',l1ModuleAt(seed,r.x,r.z).power)
 if(candidateStyles.includes('maintenance')&&sideRoom){
  const p=l1ModuleAt(seed,sideRoom.x0+1,sideRoom.y0+1,'maintenance')
  for(let z=sideRoom.y0+1.8;z<sideRoom.y1-.6;z+=3.0)lamp(`roomtube:${sideRoom.x1},${z}`,[sideRoom.x1-.6,p.height-.16,z],[0,-1,0],[0,0,1],1.18,.04,'maintenance','tube',p.power*1.3)
  const {x0:x,x1:X,y0:z,y1:Z}=sideRoom,h=p.height-.3
  addBox(`room-pipe:${x},${z}`,[X-.18,h-.035,z+.3],[X-.11,h+.035,Z-.15],'maintenance','whitePipe',false,false,'round',2)
  addBox(`room-pipe-cross:${x},${z}`,[x+.2,h-.035,Z-1.04],[X-.11,h+.035,Z-.97],'maintenance','whitePipe',false,false,'round',0)
  // Skirting belongs to the side room rather than the whole path network.
  for(const bx of [x,X-.025])for(let zz=z;zz<Z;zz+=.5)if(l1BuildingFloorAt(seed,bx===x?x-.06:X+.06,zz+.25)===false)addBox(`room-skirting:${bx},${zz}`,[bx,0,zz],[bx+.025,.10,zz+.5],'maintenance','cable',false,true)
  addBox(`room-skirting-back:${x},${z}`,[x,0,z],[X,.10,z+.025],'maintenance','cable',false,true)
 }
 // The taller side owns the real roof fascia. This also blocks stray native
 // light above the adjoining low roof; no screenshot-only closure geometry.
 for(const r of roofs)for(const [dx,dz]of [[-1,0],[1,0],[0,-1],[0,1]]){
  const nx=r.x+1+dx*2,nz=r.z+1+dz*2,other=l1ModuleAt(seed,nx,nz).height
  if(other>=r.height-.1)continue
  const x=r.x+(dx>0?2:0),z=r.z+(dz>0?2:0)
  addBox(r.id+`:fascia:${dx},${dz}`,[dx?x-.06:r.x,other,dz?z-.06:r.z],[dx?x+.06:r.x+2,r.height,dz?z+.06:r.z+2],r.style,'wall')
 }
 // Wall-mounted vertical tubes illuminate the actual wall plane and nearby floor.
 for(const b of boxes.slice())if((b.surface==='brick'||b.surface==='wall')&&b.style==='parking'&&b.max[0]-b.min[0]>4&&b.max[2]-b.min[2]<2){
  const p=l1ModuleAt(seed,b.min[0],b.min[2]);if(p.lighting!=='wall-bay')continue
  const z=b.max[2]+.75
  for(let x=Math.ceil((b.min[0]-p.phaseX)/4)*4+p.phaseX;x<b.max[0];x+=4)if(clear(x,z,.3))lamp(`bay-wall-lamp:${x},${z}`,[x,p.height-.16,z],[0,-1,0],[1,0,0],1.18,.18,'parking','panel',p.power*2.8)
  for(const height of [1.85,2.3])addBox(`bay-wall-pipe:${b.id}:${height}`,[b.min[0],height-.055,b.max[2]+.12],[b.max[0],height+.055,b.max[2]+.23],'parking','whitePipe',false,false,'round',0)
 }
 for(const b of boxes.slice())if(b.surface==='wall'&&b.style==='parking'&&b.max[2]-b.min[2]>4&&b.max[0]-b.min[0]<2){
  const p=l1ModuleAt(seed,b.min[0],b.min[2]),side=l1BuildingFloorAt(seed,b.min[0]-.5,(b.min[2]+b.max[2])/2)?-1:1,x=side<0?b.min[0]-.06:b.max[0]+.06
  if(p.lighting==='service-bay')continue
  for(let z=Math.ceil(b.min[2]/p.spacingZ)*p.spacingZ+1;z<b.max[2];z+=p.spacingZ)lamp(`walltube:${x},${z}`,[x,p.height*.66,z],[side,0,0],[0,1,0],1.3,.045,'parking','tube',p.power*1.3)
 }
 // 过道 ↔ 小径 doors from the v2 plan. The green emergency lamp faces the hall (wiki: find the lit door).
 for(const door of l1PlanDoors(seed,x0,z0,x0+32,z0+32)){
  const w=door.axis==='x'?1:2,d=door.axis==='x'?2:1,x=door.x,z=door.y
  const nx=door.dir===0?1:door.dir===1?-1:0,nz=door.dir===2?1:door.dir===3?-1:0
  openings.push({id:door.id,x,z,w,d,height:2.2,door:true})
  lamp(door.id+':sign',[x+w/2+nx*.56,2.35,z+d/2+nz*.56],[nx,0,nz],[nz?1:0,0,nx?1:0],.36,.14,'maintenance','emergency',.045)
 }
 const puddles=l1Puddles(seed,cx,cy),result:L1ArchitectureData={version:4,seed,cx,cy,fingerprint:'',boxes,roofs,emitters,openings,puddles,floor,styles}
 if(!force)fitL1Exit(result,(x,z)=>l1BuildingRoof(seed,x,z,true))
 let hash=2166136261
 const signature=JSON.stringify([result.boxes,roofs,emitters,openings,puddles,result.exit])+(candidateStyles.includes('gothic')?'|vault-edge-4':'');for(let i=0;i<signature.length;i++)hash=Math.imul(hash^signature.charCodeAt(i),16777619)
 result.fingerprint=(hash>>>0).toString(16)
 if(caches.size>=96)caches.delete(caches.keys().next().value!);caches.set(key,result);return result
}
