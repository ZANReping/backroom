import type {L1Box,L1Module,V3} from './l1BuildingTypes'

/** Services are fixed to building bays, not 4m streaming cells or the viewer.
 * Keep uninterrupted pipes long; only clip at actual walls and ownership edges. */
export function l1ParkingServices(p:L1Module,x0:number,z0:number,allowed:(x:number,z:number)=>boolean):L1Box[]{
 const boxes:L1Box[]=[],industrial=p.services==='service-rack',rack=p.services==='red-rack'||industrial,drop=p.serviceDrop??(industrial?.30:rack?.20:.17)
 const add=(id:string,min:V3,max:V3,surface:L1Box['surface'],detail=true,axis?:0|1|2,occlude=!detail)=>{
  boxes.push({id:`service:${id}`,min,max,style:'parking',surface,solid:false,detail,occlude,...(axis===undefined?{}:{shape:'round' as const,axis})})
 }
 const starts=(lo:number,hi:number,phase:number,spacing:number)=>{const out:number[]=[];for(let i=Math.ceil((lo-phase)/spacing);phase+i*spacing<hi;i++)out.push(phase+i*spacing);return out}
 const segments=(axis:0|2,fixed:number,visit:(a:number,b:number)=>void)=>{
  const lo=axis===2?z0:x0,hi=lo+32;let start:number|undefined
  for(let a=lo;a<=hi;a++){
   const on=a<hi&&allowed(axis===2?fixed:a+.5,axis===2?a+.5:fixed)
   if(on&&start===undefined)start=a
   if(!on&&start!==undefined){visit(start,a);start=undefined}
  }
 }
 const pipe=(id:string,axis:0|2,fixed:number,y:number,r:number,surface:L1Box['surface'],detail:boolean)=>segments(axis,fixed,(a,b)=>{
  add(`${id}:${axis}:${fixed}:${a}`,axis===2?[fixed-r,y-r,a]:[a,y-r,fixed-r],axis===2?[fixed+r,y+r,b]:[b,y+r,fixed+r],surface,detail,axis)
 })
 const phase=p.phaseX+p.spacingX*(p.serviceOffset??.57)
 // Small white/silver mains in ordinary bays; a denser red rack in service aisles.
 for(const x of starts(x0-1.5,x0+33.5,phase,p.spacingX)){
  const owns=(xx:number)=>xx>=x0&&xx<x0+32
  const tubes=industrial?[-.6,0,.65]:rack?[-.48,-.25,0,.25,.48]:[-.16,.16]
  for(const [i,offset]of tubes.entries())if(owns(x+offset))pipe(`main:${i}`,2,x+offset,p.height-drop,industrial?[.065,.045,.09][i]:rack?.021:i?.025:.043,rack&&!industrial||!rack&&i===0?'red':'whitePipe',industrial?false:rack||i>0) // v2: refs show a red sprinkler main in ordinary bays too
  const trayX=x+(rack?.94:.58),half=rack?.22:.12,y=p.height-drop-.025
  for(const side of [-1,1])if(owns(trayX+side*half))segments(2,trayX+side*half,(a,b)=>add(`tray:${side}:${trayX}:${a}`,[trayX+side*half-.011,y-.025,a],[trayX+side*half+.011,y+.025,b],'metal',true,undefined,industrial))
  if(owns(trayX))for(const z of starts(z0,z0+32,p.phaseZ+.45,rack?.65:1.4))if(allowed(trayX,z))add(`rung:${trayX}:${z}`,[trayX-half,y-.025,z-.011],[trayX+half,y-.01,z+.011],'metal',true,undefined,industrial)
  // Threaded rods and a slim cross support keep the rack suspended near the slab.
  if(owns(x))for(const z of starts(z0,z0+32,p.phaseZ+.65,p.spacingZ/2))if(allowed(x,z)){
   const halfWidth=rack?1.2:.84
   add(`support:${x}:${z}`,[x-.33,y-.055,z-.014],[x+halfWidth,y-.035,z+.014],'metal')
   for(const offset of [-.31,halfWidth-.02])add(`hanger:${offset}:${x}:${z}`,[x+offset-.004,y-.035,z-.004],[x+offset+.004,p.height-.015,z+.004],'metal')
  }
 }
 for(const z of starts(z0,z0+32,p.phaseZ+p.spacingZ*.42,p.spacingZ)){
  const y=p.height-drop-.075
  pipe('sprinkler',0,z,y,.024,rack&&!industrial?'red':'whitePipe',true)
  for(const x of starts(x0,x0+32,p.phaseX+1.1,3.2))if(allowed(x,z)){
   add(`sprinkler-neck:${x}:${z}`,[x-.009,y-.070,z-.009],[x+.009,y,z+.009],'metal',true,1)
   add(`sprinkler-head:${x}:${z}`,[x-.032,y-.076,z-.032],[x+.032,y-.061,z+.032],'red',true,1)
  }
 }
 if(rack){
  // A separate insulated main along the aisle edge, not a dark ladder across it.
  for(const x of starts(x0,x0+32,p.phaseX+.85,p.spacingX))pipe('insulated',2,x,p.height-.16,.065,'whitePipe',false)
 }
 return boxes
}
