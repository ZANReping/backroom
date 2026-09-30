import type {GameMap} from '../world/mapgen'
import type {Structure} from '../core/types'
import type {TerrainRange} from './geometry'
import {L3Builder} from './l3Meshes'
import {l3Height,l3StyleAt,L3_NARROW_TINT} from '../world/l3Architecture'
import {l3PipeTurn,l3PipeElbow} from './l3PipeRouting'

/** Consolidate tile edges into continuous pipe runs. Ends enter a wall junction
 * box or turn up to the slab; pipes never terminate as open cylinders mid-air. */
export function* buildL3Pipes(m:GameMap,r:TerrainRange,b:L3Builder,structures:Structure[]):Generator<void>{
 const v=r.variant??'lit',H=l3Height(v),ox=m.inf?.ox??0,oz=m.inf?.oy??0
 const floor=(x:number,z:number)=>x>=0&&z>=0&&x<m.w&&z<m.h&&m.tiles[z*m.w+x]===1
 const runs=new Map<string,{axis:'x'|'z';fixed:number;side:number;cells:number[];height:number}>()
 if(v!=='sanct'&&v!=='narrow')for(let z=r.y0;z<r.y1;z++)for(let x=r.x0;x<r.x1;x++){
  if(!floor(x,z)||m.tint[z*m.w+x]===L3_NARROW_TINT)continue
  for(const[dx,dz]of [[1,0],[-1,0],[0,1],[0,-1]]){
   if(floor(x+dx,z+dz))continue
   const axis=dx?'z':'x',side=dx||dz,fixed=(dx?x:z)+.5+side*.485,height=l3Height(l3StyleAt(m,x+.5,z+.5)),key=`${axis}:${fixed}:${side}:${height}`
   const run=runs.get(key)??{axis,fixed,side,cells:[],height};run.cells.push(dx?z:x);runs.set(key,run)
  }
 }
 let segments=0
 for(const run of runs.values()){
  const list=run.cells.sort((a,b)=>a-b),axis=run.axis
  const point=(t:number,y:number,inset:number)=>axis==='z'?[run.fixed-run.side*inset,y,t]:[t,y,run.fixed-run.side*inset]
  for(let i=0;i<list.length;){
   const start=list[i];let end=start+1;while(++i<list.length&&list[i]===end)end++
   const len=end-start,room=v==='assembly'||v==='genhall'||v==='boiler'
   const wall=run.fixed+run.side*.015
   const usable=(x:number,z:number)=>floor(x,z)&&m.tint[z*m.w+x]!==L3_NARROW_TINT&&l3Height(l3StyleAt(m,x+.5,z+.5))===run.height
   const turns=[l3PipeTurn(axis,wall,start,1,run.side,usable),l3PipeTurn(axis,wall,end,-1,run.side,usable)]
   const count=v==='dark'?5:v==='boiler'?3:3,base=room?Math.min(run.height-.55,3.15):run.height-.66
   for(let k=0;k<count;k++){
    const y=base-k*.095,inset=.075+k*.039,rad=k===0?.036:.021,surf=v==='boiler'?'bronze':k===count-1?'black':'paint'
    const elbows=turns.map((turn,j)=>turn?l3PipeElbow(axis,wall,j===0?start:end,j===0?1:-1,run.side,turn,inset,y):null)
    const boundaries=[start===(axis==='x'?r.x0:r.y0),end===(axis==='x'?r.x1:r.y1)]
    const from=start+(elbows[0]?.trim??(boundaries[0]?0:.18))
    const to=end-(elbows[1]?.trim??(boundaries[1]?0:.18))
    if(to>from){const p=point((from+to)/2,y,inset);b.cyl(p[0],p[1],p[2],rad,to-from,surf,axis)}
    // A single smooth elbow joins each pair. No full-length straight remains
    // underneath it, so opposing pipes cannot cross or leave a saw-tooth seam.
    for(const elbow of elbows)if(elbow&&axis==='x')b.tube(elbow.points,rad,surf)
    // Sparse collars and anchored supports use world phase, not per-tile seams.
    const shift=axis==='x'?ox:oz
    for(let t=Math.ceil((from+shift+.06)/2.8)*2.8-shift;t<to-.06;t+=2.8){const q=point(t,y,inset);b.cyl(q[0],q[1],q[2],rad+.01,.05,'iron',axis)}
    for(const [j,t] of [start,end].entries()){
     if(elbows[j])continue
     // Chunk-edge runs continue into the adjoining chunk without a spurious cap.
     if(t===(axis==='x'?r.x0:r.y0)||t===(axis==='x'?r.x1:r.y1))continue
     const sign=t===start?1:-1,pts=[point(t+sign*.18,y,inset),point(t+sign*.065,y,inset*.7),point(t,y,.008)]
     b.tube(pts,rad,surf)
    }
   }
   for(let t=start+.5;t<end-.4;t+=2.8){const p=point(t,base-.14,.13);b.box(p[0],p[1],p[2],axis==='z'?.35:.038,.045,axis==='x'?.35:.038,'iron')}
   if(len>2.5){
    const t=start+Math.min(.65,len/3),p=point(t,base-.45,.1)
    b.box(p[0],p[1],p[2],axis==='x'?.30:.17,.33,axis==='z'?.30:.17,'green')
    b.tube([point(t,base-.3,.14),point(t,base-.07,.16),point(t+.18,base+.09,.14),point(t+.42,base+.09,.075)],.029,'black')
   }
   if(++segments%6===0)yield
  }
 }
 // Dark corridor pipe racks: retain the generated collision envelopes but render
 // one long cylinder per connected run instead of five capped cylinders per metre.
 const racks=new Map<number,Structure[]>()
 for(const s of structures)if(s.kind==='l3service'){const key=s.x+s.w/2,a=racks.get(key)??[];a.push(s);racks.set(key,a)}
 for(const[x,ss]of racks){
  ss.sort((a,b)=>a.y-b.y)
  for(let i=0;i<ss.length;){const first=ss[i],z0=first.y;let z1=z0+1;while(++i<ss.length&&ss[i].y===z1)z1++
   const side=Number(first.data?.side),wall=x+side*.22
   for(const[y,rad]of [[.38,.13],[.78,.105],[1.21,.07],[2.16,.095],[2.49,.055]]){
    b.cyl(x,y,(z0+z1)/2,rad,z1-z0,'black','z')
    for(let z=z0+.25;z<z1;z+=2.6){b.cyl(x,y,z,rad+.026,.085,'iron','z');if(rad>.1)for(const dx of [-1,1])b.cyl(x+dx*(rad+.037),y,z,.014,.09,'bronze','z')}
    for(const[z,sign]of [[z0,1],[z1,-1]])b.tube([[x,y,z+sign*.15],[x+side*.04,y,z+sign*.045],[wall,y,z]],rad,'black')
   }
   for(let z=z0+.25;z<z1;z+=2.6){b.box(wall,1.36,z,.035,2.65,.045,'iron');for(const y of [.28,.65,1.12,2.05,2.39])b.box((x+wall)/2,y,z,.28,.035,.055,'iron')}
   if(z1-z0>2){const zz=z0+(z1-z0)*.6;b.box(x,1.68,zz,.32,.42,.36,'green');for(let j=0;j<3;j++)b.tube([[x,1.88,zz-.1+j*.09],[x,2.04,zz-.1+j*.09],[x,2.61,zz+.24+j*.09]],.018,'black')}
   yield
  }
 }
 // Factory overhead mains and open cable trays. Long runs stop at the room wall.
 if(v==='assembly'||v==='genhall')for(let x=r.x0+5;x<r.x1-3;x+=6){
  const margin=v==='genhall'?3:2,lo=r.y0+margin,hi=r.y1-margin,y=H-.48
  for(const off of [0,.22])b.cyl(x+off,y,(lo+hi)/2,off?.035:.067,hi-lo,'paint','z')
  for(const z of [lo+.09,hi-.09]){b.cyl(x,y,z,.105,.08,'iron','z');b.box(x,y,z,.3,.3,.045,'iron')}
  for(let z=lo+.6;z<hi;z+=3.3){b.box(x+.1,y-.10,z,.5,.045,.065,'iron');b.cyl(x+.1,(y+H)/2,z,.012,H-y,'iron')}
  const tx=x+1.5,ty=y-.28
  for(const dx of [-.22,.22])b.box(tx+dx,ty,(lo+hi)/2,.035,.12,hi-lo,'iron')
  for(let z=lo;z<hi;z+=.45)b.box(tx,ty-.055,z,.45,.025,.045,'iron')
  for(let j=0;j<4;j++)b.tube([[tx-.15+j*.1,ty,lo],[tx-.15+j*.1,ty-.022,lo+7],[tx-.15+j*.1,ty,hi]],.019,'black')
  yield
 }
}
