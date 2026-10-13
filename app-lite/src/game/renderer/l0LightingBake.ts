import {l0LayoutEnvironment} from '../world/l0Regions'
import {L0_HEIGHT,type L0Layout,type L0Wall} from '../world/l0Architecture'
import {l0FixtureLight} from './l0Light'

const CELL=4,RANGE=10
type Lamp=L0Layout['lamps'][number]
export function l0LightBlocked(w:L0Wall,x:number,z:number,lx:number,lz:number,h?:number,targetH=L0_HEIGHT-.035){
 let lo=0,hi=1
 const dx=lx-x,dz=lz-z
 if(Math.abs(dx)<1e-6){if(x<w.x||x>w.x+w.w)return false}
 else{const a=(w.x-x)/dx,b=(w.x+w.w-x)/dx;lo=Math.max(lo,Math.min(a,b));hi=Math.min(hi,Math.max(a,b));if(lo>hi)return false}
 if(Math.abs(dz)<1e-6){if(z<w.y||z>w.y+w.h)return false}
 else{const a=(w.y-z)/dz,b=(w.y+w.h-z)/dz;lo=Math.max(lo,Math.min(a,b));hi=Math.min(hi,Math.max(a,b));if(lo>hi)return false}
 if(h!==undefined){const dh=targetH-h
  if(Math.abs(dh)<1e-6){if(h<w.bottom||h>w.top)return false}
  else{const a=(w.bottom-h)/dh,b=(w.top-h)/dh;lo=Math.max(lo,Math.min(a,b));hi=Math.min(hi,Math.max(a,b));if(lo>hi)return false}
 }
 return hi>.002&&lo<.998
}
const blocks=l0LightBlocked
/** CPU-only spatial bins: cost follows nearby walls/lamps, not the entire
 * window. No additional lights, render targets or per-frame work. */
export function createL0LightSampler(a:L0Layout,neighbours:L0Layout[]){
 const lampBins=new Map<string,Lamp[]>(),wallBins=new Map<string,L0Wall[]>()
 const key=(x:number,z:number)=>`${x},${z}`
 for(const area of [a,...neighbours]){
  for(const l of area.lamps)if(!l.off){const k=key(Math.floor(l.x/CELL),Math.floor(l.y/CELL));const list=lampBins.get(k)??[];list.push(l);lampBins.set(k,list)}
  for(const w of area.walls)for(let z=Math.floor(w.y/CELL);z<=Math.floor((w.y+w.h)/CELL);z++)for(let x=Math.floor(w.x/CELL);x<=Math.floor((w.x+w.w)/CELL);x++){
   const k=key(x,z),list=wallBins.get(k)??[];list.push(w);wallBins.set(k,list)
  }
 }
 type Candidate={l:Lamp;walls:L0Wall[];samples:Lamp[]}
 const candidateBins=new Map<string,Candidate[]>(),woods=[a,...neighbours].flatMap(a=>a.wood?[a.wood]:[])
 const candidatesAt=(bx:number,bz:number)=>{
  const k=key(bx,bz),old=candidateBins.get(k);if(old)return old
  const found:Candidate[]=[],x=bx*CELL,z=bz*CELL
  for(let lz=Math.floor((z-RANGE)/CELL);lz<=Math.floor((z+CELL+RANGE)/CELL);lz++)for(let lx=Math.floor((x-RANGE)/CELL);lx<=Math.floor((x+CELL+RANGE)/CELL);lx++)for(const l of lampBins.get(key(lx,lz))??[]){
   const candidates=new Set<L0Wall>()
   for(let wz=Math.floor((Math.min(z,l.y)-.8)/CELL);wz<=Math.floor((Math.max(z+CELL,l.y)+.8)/CELL);wz++)for(let wx=Math.floor((Math.min(x,l.x)-.8)/CELL);wx<=Math.floor((Math.max(x+CELL,l.x)+.8)/CELL);wx++)for(const w of wallBins.get(key(wx,wz))??[])candidates.add(w)
   const samples:Lamp[]=[]
   for(const dx of [-1,1])for(const dz of [-1,1])samples.push({...l,x:l.x+dx*(l.round?.075:(l.width??1.2)*.875*.289),y:l.y+dz*(l.round?.075:(l.depth??.6)*.289)})
   found.push({l,walls:[...candidates],samples})
  }
  candidateBins.set(k,found);return found
 }
 const visibility=new Map<string,{samples:{l:Lamp;partial:L0Wall[]}[]}[]>(),colors=new Map<string,number>(),environments=new Map<string,ReturnType<typeof l0LayoutEnvironment>>()
 return (x:number,z:number,h:number,nx:number,ny:number,nz:number)=>{
  const k=`${x.toFixed(4)},${z.toFixed(4)},${h.toFixed(4)},${nx.toFixed(2)},${ny.toFixed(2)},${nz.toFixed(2)}`
  const old=colors.get(k);if(old!==undefined)return old
  const sx=x+nx*.015,sz=z+nz*.015,hk=`${sx.toFixed(4)},${sz.toFixed(4)},${nx.toFixed(2)},${nz.toFixed(2)}`
  let nearby=visibility.get(hk)
  if(!nearby){
   nearby=[]
   for(const {l,walls:candidates,samples:areaSamples} of candidatesAt(Math.floor(sx/CELL),Math.floor(sz/CELL))){
    if((l.x-sx)**2+(l.y-sz)**2>RANGE*RANGE)continue
    const samples:{l:Lamp;partial:L0Wall[]}[]=[]
    for(const sample of areaSamples){
     const partial:L0Wall[]=[]
     let visible=true
     for(const w of candidates)if(blocks(w,sx,sz,sample.x,sample.y)){
      if(w.bottom<=0&&w.top>=L0_HEIGHT-.01){visible=false;break}
      partial.push(w)
     }
     if(visible)samples.push({l:sample,partial})
    }
    if(samples.length)nearby.push({samples})
   }
   visibility.set(hk,nearby)
  }
  const inRoom=woods.some(w=>sx>=w.x&&sx<=w.x+w.w&&sz>=w.y&&sz<=w.y+w.h)
  let environment=environments.get(hk);if(!environment){environment=l0LayoutEnvironment(a,sx,sz);environments.set(hk,environment)}
  let contact=0
  if(ny>.5){for(const w of wallBins.get(key(Math.floor(sx/CELL),Math.floor(sz/CELL)))??[]){if(w.bottom>.05)continue;const d=Math.hypot(Math.max(w.x-sx,0,sx-w.x-w.w),Math.max(w.y-sz,0,sz-w.y-w.h));contact=Math.max(contact,.22*Math.exp(-d/.16))}}
  else if(ny<.5&&h>=0)contact=.22*Math.exp(-h/.16)
  let value=(inRoom?.19:.105)*(1-environment.blackout)*(1-contact)
  for(const {samples}of nearby)for(const s of samples)if(!s.partial.some(w=>blocks(w,sx,sz,s.l.x,s.l.y,h+ny*.015)))value+=l0FixtureLight(s.l,sx,sz,h,nx,ny,nz)/4
  const redGain=1+environment.red*.35
  value*=(h<0?Math.exp(h/2.5):1)*redGain
  colors.set(k,value);return value
 }
}
