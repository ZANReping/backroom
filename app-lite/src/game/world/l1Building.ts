import {l1LayoutVariant,l1TransitionStyle,l1Outpost} from './l1Layout'
import {l1HallWall,l1Mod,l1Noise,l1ParkingAt,l1ReferenceAt,l1PathRoom} from './l1Spatial'
import {L1_REFERENCE_CASES} from './l1ReferenceCases'
import {l1Puddles} from './l1Puddles'
import {l1ParkingServices} from './l1ParkingServices'
import {L1_STYLE_NAMES,type L1ArchitectureData,type L1Box,type L1Emitter,type L1Module,type L1StyleName,type V3} from './l1BuildingTypes'

const BASE:Record<L1StyleName,L1Module>={
 parking:{height:3.25,spacingX:7,spacingZ:7,phaseX:6.5,phaseZ:6.5,columnWidth:.92,columnDepth:1.08,round:false,beamDepth:.27,beamWidth:.42,lampSpacing:7,wallTubes:true,power:1.25,finish:'raw'},
 storage:{height:6.2,spacingX:10,spacingZ:9,phaseX:6.5,phaseZ:6.5,columnWidth:.42,columnDepth:.42,round:false,beamDepth:1.1,beamWidth:.30,lampSpacing:7,wallTubes:false,power:2,finish:'paint'},
 gothic:{height:3.65,spacingX:6,spacingZ:6,phaseX:4.5,phaseZ:4.5,columnWidth:1.08,columnDepth:1.08,round:true,beamDepth:0,beamWidth:0,lampSpacing:6,wallTubes:false,power:1.05,finish:'raw'},
 ouroboros:{height:4.25,spacingX:7,spacingZ:7,phaseX:6.5,phaseZ:6.5,columnWidth:.78,columnDepth:.78,round:false,beamDepth:.55,beamWidth:.55,lampSpacing:7,wallTubes:false,power:1.55,finish:'peeling'},
 garden:{height:7.8,spacingX:7.2,spacingZ:7.2,phaseX:6.5,phaseZ:6.5,columnWidth:1.65,columnDepth:1.65,round:false,beamDepth:.4,beamWidth:.65,lampSpacing:7.2,wallTubes:false,power:2.4,finish:'raw'},
 maintenance:{height:2.65,spacingX:8,spacingZ:8,phaseX:6.5,phaseZ:6.5,columnWidth:.6,columnDepth:.6,round:false,beamDepth:.14,beamWidth:.18,lampSpacing:5,wallTubes:false,power:.9,finish:'paint'},
}
export function l1BuildingStyleAt(seed:number,x:number,z:number):L1StyleName {
 const v=l1LayoutVariant(seed,Math.floor(x/32),Math.floor(z/32))
 return (v==='aisle'?l1TransitionStyle(seed,x,z):v) as L1StyleName
}
export function l1ModuleAt(seed:number,x:number,z:number,force?:L1StyleName):L1Module {
 const style=force??l1BuildingStyleAt(seed,x,z),ref=l1ReferenceAt(seed,x,z),override=ref?L1_REFERENCE_CASES[ref.id]?.module:undefined
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
export function l1BuildingFloorAt(seed:number,x:number,z:number,force?:L1StyleName){
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
  emitters.push({id,position:p,normal:n,tangent:t,width:w,height:h,style,kind,power,range:range??(kind==='sky'?20:kind==='emergency'?2.2:16),color:kind==='emergency'?[.27,.64,.4]:color,backEmission:kind==='panel'?.12:0})
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
 const ref=l1ReferenceAt(seed,x0+16,z0+16),partitions=ref?(L1_REFERENCE_CASES[ref.id].partitions??[]).map(b=>({min:[b.min[0]+ref.centerX,b.min[1]+ref.centerY],max:[b.max[0]+ref.centerX,b.max[1]+ref.centerY]})):[]
 for(const [i,b]of partitions.entries()){
  const x=Math.max(x0,b.min[0]),z=Math.max(z0,b.min[1]),X=Math.min(x0+32,b.max[0]),Z=Math.min(z0+32,b.max[1]);if(X<=x||Z<=z)continue
  const style=styleAt((x+X)/2,(z+Z)/2)
  addBox(`partition:${ref!.id}:${i}:${cx},${cy}`,[x,0,z],[X,l1ModuleAt(seed,x,z,style).height,Z],style,'wall',true)
 }
 const clear=(x:number,z:number,r=.6)=>{for(const dx of [-r,0,r])for(const dz of [-r,0,r])if(!l1BuildingFloorAt(seed,x+dx,z+dz,force))return false;return !partitions.some(b=>x+r>b.min[0]&&x-r<b.max[0]&&z+r>b.min[1]&&z-r<b.max[1])}
 const candidateStyles=[...new Set(Array.from(styles,n=>L1_STYLE_NAMES[n]))]
 for(const style of candidateStyles){
  const p=l1ModuleAt(seed,x0+16,z0+16,style)
  if(style==='maintenance')continue
  for(let gz=Math.ceil((z0-p.phaseZ)/p.spacingZ);;gz++){
   const z=p.phaseZ+gz*p.spacingZ;if(z>=z0+32)break
   for(let gx=Math.ceil((x0-p.phaseX)/p.spacingX);;gx++){
    const x=p.phaseX+gx*p.spacingX;if(x>=x0+32)break
    if(styleAt(x,z)!==style&&!force||!clear(x,z,Math.max(p.columnWidth,p.columnDepth)/2+.2))continue
    if(Math.hypot(x-15.5,z-15.5)<4||l1Outpost(seed,cx,cy)&&x>x0+9&&x<x0+24&&z>z0+9&&z<z0+24)continue
    const id=`column:${x.toFixed(3)},${z.toFixed(3)}`,top=style==='gothic'?(p.springHeight??1.35):p.height
    const round=p.round&&(p.columnPattern!=='mixed'||l1Mod(gz,3)===0)
    if(style==='storage'){
     // Painted steel sections, with a recessed web and two actual flanges.
     addBox(id+':web',[x-.045,0,z-p.columnDepth/2],[x+.045,top,z+p.columnDepth/2],style,'paint',true)
     for(const side of [-1,1])addBox(id+':flange'+side,[x-p.columnWidth/2,0,z+side*(p.columnDepth/2-.03)-.03],[x+p.columnWidth/2,top,z+side*(p.columnDepth/2-.03)+.03],style,'paint',true)
    }else addBox(id,[x-p.columnWidth/2,0,z-p.columnDepth/2],[x+p.columnWidth/2,top,z+p.columnDepth/2],style,p.finish==='peeling'?'peeling':p.finish==='paint'?'paint':'column',true,false,round?'round':undefined)
    const dress=Math.floor(l1Noise(gx,gz,seed^517)*5)
    if(style==='ouroboros'||style==='parking'&&dress===3){const h=style==='ouroboros'?1.7+(.3*dress):1.15;addBox(id+':repair',[x-p.columnWidth/2-.008,.22,z-p.columnDepth/2-.008],[x+p.columnWidth/2+.008,h,round?z+p.columnDepth/2+.008:z-p.columnDepth/2+.008],style,style==='ouroboros'?'peeling':'paint',false,true,round?'round':undefined)}
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
    addBox(`beam:${x},${z}`,[x,p.height-(style==='storage'?.32:p.beamDepth),z-p.beamWidth/2],[x+2,p.height+.1,z+p.beamWidth/2],style,style==='storage'?'metal':'ceiling')
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
  if(style==='parking')boxes.push(...l1ParkingServices(p,x0,z0,(x,z)=>styleAt(x,z)==='parking'&&clear(x,z,.05)))
  for(let z=z0;z<z0+32;z+=4)for(let x=x0;x<x0+32;x+=4){
   if(styleAt(x+2,z+2)!==style||!clear(x+2,z+2,.2))continue
   if(style==='ouroboros'){
    const count=6
    if(l1Mod(Math.floor((x+2-p.phaseX)/4),2)===0)for(let n=0;n<count;n++)addBox(`red:${x},${z}:${n}`,[x+.7+n*.13,p.height-.36,z],[x+.735+n*.13,p.height-.325,z+4],style,'red',false,true,'round',2)
    if(l1Mod(Math.floor((z+2-p.phaseZ)/4),3)===0)addBox(`pipe:${x},${z}`,[x,p.height-.52,z+1.85],[x+4,p.height-.32,z+2.05],style,'whitePipe',false,false,'round',0)
    if(l1Mod(Math.floor((x+2-p.phaseX)/4),3)===0){
     for(const side of [-1,1])addBox(`tray:${x},${z}:${side}`,[x+2+side*.25-.022,p.height-.62,z],[x+2+side*.25+.022,p.height-.53,z+4],style,'metal',false,true)
     for(let k=0;k<4;k++)addBox(`rung:${x},${z}:${k}`,[x+1.75,p.height-.62,z+k+.18],[x+2.25,p.height-.595,z+k+.22],style,'metal',false,true)
    }
   }
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
    if(style==='garden')continue // Actual skylight apertures below own their emission.
    lamp(`lamp:${x.toFixed(3)},${z.toFixed(3)}`,[x,(style==='gothic'?l1BuildingRoof(seed,x,z,true):p.height)-(style==='storage'?p.beamDepth+.25:.15),z],[0,-1,0],p.lampAlongZ?[0,0,1]:[1,0,0],style==='storage'?1.4:1.2,style==='storage'?.48:.045,style,style==='storage'?'panel':'tube',on?p.power:0)
   }
  }
 }
 for(const r of roofs)if(r.sky)lamp(r.id+':sun',[r.x+1,r.height+.04,r.z+1],[.32,-.92,-.2],[1,0,0],r.w,r.d,r.style,'sky',l1ModuleAt(seed,r.x,r.z).power)
 if(candidateStyles.includes('maintenance')&&sideRoom){
  const p=l1ModuleAt(seed,sideRoom.x0+1,sideRoom.y0+1,'maintenance')
  for(let z=sideRoom.y0+1.8;z<sideRoom.y1-.6;z+=3.0)lamp(`roomtube:${sideRoom.x1},${z}`,[sideRoom.x1-.32,p.height-.16,z],[0,-1,0],[0,0,1],1.18,.04,'maintenance','tube',p.power)
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
 if(candidateStyles.includes('maintenance'))for(const [dx,dz]of [[1,0],[-1,0],[0,1],[0,-1]]){
  if(l1LayoutVariant(seed,cx+dx,cy+dz)==='maintenance')continue
  const ex=cx+(dx>0?1:0),ez=cy+(dz>0?1:0),slot=4+2*Math.floor(l1Noise(ex,ez,seed^(dx?0xd001:0xd002))*12)
  const x=x0+(dx?(dx>0?31:0):slot),z=z0+(dz?(dz>0?31:0):slot),w=dx?1:2,d=dx?2:1
  const id=`door:${ex},${ez}:${dx?'x':'z'}`;openings.push({id,x,z,w,d,height:2.2,door:true})
  lamp(id+':sign',[x+w/2,2.35,z+d/2],[dx,0,dz],[dz?1:0,0,dx?1:0],.36,.14,'maintenance','emergency',.045)
 }
 let hash=2166136261
 const puddles=l1Puddles(seed,cx,cy),signature=JSON.stringify([boxes,roofs,emitters,openings,puddles])+(candidateStyles.includes('gothic')?'|vault-edge-3':'');for(let i=0;i<signature.length;i++)hash=Math.imul(hash^signature.charCodeAt(i),16777619)
 const result:L1ArchitectureData={version:4,seed,cx,cy,fingerprint:(hash>>>0).toString(16),boxes,roofs,emitters,openings,puddles,floor,styles}
 if(caches.size>=96)caches.delete(caches.keys().next().value!);caches.set(key,result);return result
}
