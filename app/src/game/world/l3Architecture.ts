import type { GenChunk } from './infiniteRegistry'
import type { GameMap } from './mapgen'
import {l3FenceFinish} from './l3Variations'
import {l3NarrowRoof} from './l3NarrowProfile'

export const L3_NARROW_TINT = 51
// Two circular arcs meet at a pointed crown, with vertical springing at the columns.
export function l3ArchProfile(t:number){
  const u=Math.max(0,Math.min(1,t)),side=Math.min(u,1-u)
  return Math.sqrt(1-(1-side)**2)/Math.sqrt(.75)
}
export const l3Height = (v?: string) => v === 'sanct' ? 8.4 : v === 'assembly' ? 6.2 : v === 'genhall' ? 4.6 : v === 'boiler' ? 3.1 : 3.25
export function l3StyleAt(m:GameMap,x:number,z:number) {
  if(!m.inf)return undefined
  const wx=x+m.inf.ox,wz=z+m.inf.oy,cx=Math.floor(wx/32),cz=Math.floor(wz/32)
  const v=m.inf.chunks.get(`${cx},${cz}`)?.variant
  const margin=v==='boiler'?11:v==='genhall'?3:v==='assembly'||v==='sanct'?2:0
  if(margin&&(wx-cx*32<margin||wx-cx*32>=32-margin||wz-cz*32<margin||wz-cz*32>=32-margin))return 'lit'
  return v
}
export function l3RoofAt(m:GameMap,x:number,z:number) {
  const tint=m.tint[Math.floor(z)*m.w+Math.floor(x)],v=l3StyleAt(m,x,z)
  if(tint===L3_NARROW_TINT)return l3NarrowRoof(x-Math.floor(x)-.5)
  if(tint===20){const xx=((x+(m.inf?.ox??0))%32+32)%32;const [a,b,r]=xx<10.5?[2,10.5,2.2]:xx<21.5?[10.5,21.5,3.75]:[21.5,30,2.2];return 4.53+r*l3ArchProfile((xx-a)/(b-a))}
  return l3Height(v)
}

/** Deterministic finishing pass. All additions are contained by a one-tile masonry ring. */
export function finishL3Architecture(c: GenChunk, cx: number, cy: number, seed: number) {
  const ox=cx*32,oz=cy*32,v=c.variant
  const at=(x:number,z:number)=>z*32+x
  const floor=(x:number,z:number)=>x>=0&&z>=0&&x<32&&z<32&&c.tiles[at(x,z)]===1
  const hash=(x:number,z:number)=>((Math.imul(x+ox,73856093)^Math.imul(z+oz,19349663)^seed)>>>0)
  const occupied=(x:number,z:number,w=1,h=1)=>c.structures.some(s=>s.x<x+ox+w&&s.x+s.w>x+ox&&s.y<z+oz+h&&s.y+s.h>z+oz)
  const room=['assembly','genhall','boiler','sanct'].includes(v)
  // One-metre passages have their own surface/area identity, including occasional
  // segments inside a wider biome. The ellipse stays outside the walkable metre.
  if(!room) for(let z=0;z<32;z++)for(let x=1;x<31;x++)if(floor(x,z)&&!floor(x-1,z)&&!floor(x+1,z)&&!c.exits.some(e=>e.x===x+ox&&e.y===z+oz))c.tint[at(x,z)]=L3_NARROW_TINT

  // A barred exhibit is a SIDE ROOM, never the accessible far end of a gate.
  // Its back and both sides must be solid before excavation; no later room carving.
  if(!room&&v!=='narrow') {
    let count=0
    for(let z=3;z<25&&count<2;z++)for(let x=2;x<25&&count<2;x++) {
      if(hash(x,z)%31!==0)continue
      const side=hash(x,z)%2?1:-1,depth=4,len=3
      const x0=side===1?x+1:x-depth,x1=side===1?x+depth:x-1
      if(x0<2||x1>29||!floor(x,z)||!floor(x,z+1)||!floor(x,z+2))continue
      let ok=true
      for(let zz=z-1;zz<=z+len;zz++)for(let xx=x0-1;xx<=x1+1;xx++) {
        if(xx===x)continue
        if(floor(xx,zz)||occupied(xx,zz))ok=false
      }
      if(!ok||occupied(x,z,1,len))continue
      for(let zz=z;zz<z+len;zz++)for(let xx=x0;xx<=x1;xx++){c.tiles[at(xx,zz)]=1;c.tint[at(xx,zz)]=19}
      const fx=side===1?x0:x1
      c.structures.push({kind:'barfence',x:ox+fx,y:oz+z,w:1,h:len,solid:true,data:{rot:1,sealedExhibit:1,height:3.25}})
      c.structures.push({kind:'statue',x:ox+(side===1?x1-1:x0+1),y:oz+z+1,w:1,h:1,solid:true,data:{dmg:hash(x,z)%6,deg:side===1?270:90,exhibit:1}})
      c.lights.push({x:ox+(side===1?x1:x0)+.5,y:oz+z+1.5,r:2.5,color:'#ddd9c9',flickerSeed:hash(x,z)%100,gen:1,fixZ:2.85})
      c.lights.push({x:ox+fx+.5,y:oz+z+1.5,r:2.1,color:'#eee9dc',flickerSeed:17,gen:1,fixZ:2.75,intensityMul:.55})
      count++
    }
  }
  // Physical pipe-rack envelopes leave at least 1.1m clear in a 2m dark corridor.
  if(v==='dark') for(let z=1;z<31;z++)for(let x=1;x<31;x++) {
    if(!floor(x,z)||c.tint[at(x,z)]===L3_NARROW_TINT||occupied(x,z))continue
    for(const side of [-1,1]) {
      if(floor(x+side,z)||!floor(x-side,z)||!floor(x,z-1)||!floor(x,z+1)||floor(x+side,z-1)||floor(x+side,z+1))continue
      const w=.42,px=x+(side===1?1-w:0)
      c.structures.push({kind:'l3service',x:ox+px,y:oz+z,w,h:1,solid:true,data:{side,phase:hash(x,z)%9}})
      break
    }
  }
  if(v==='lit'||v==='assembly')for(let z=2;z<30;z++)for(let x=2;x<30;x++) {
    if(!floor(x,z)||occupied(x,z)||hash(x,z)%19!==0||c.tint[at(x,z)]===L3_NARROW_TINT)continue
    const walls=[[0,-1],[1,0],[0,1],[-1,0]]
    const side=walls.findIndex(([dx,dz])=>!floor(x+dx,z+dz))
    if(side>=0)c.structures.push({kind:'electricalriser',x:ox+x,y:oz+z,w:1,h:1,solid:false,data:{wallDir:side}})
  }
  for(const s of c.structures)if(s.kind==='barfence'||s.kind==='bargate')s.data={...s.data,l3FenceFinish:l3FenceFinish(seed,s)}
  for(const L of c.lights) {
    const x=Math.floor(L.x)-ox,z=Math.floor(L.y)-oz
    const narrow=c.tint[at(x,z)]===L3_NARROW_TINT
    L.fixZ=narrow?2.35:L.fixZ??(v==='sanct'?3.7:v==='assembly'?4.5:l3Height(v)-.25)
    L.noFix=1 // dedicated lamp housings share exactly the same light coordinates
    if(v==='assembly'){L.r=5.3;L.intensityMul=.72;L.fixZ=4.15;L.color='#f0f1ed'}
    if(narrow){L.r=2.4;L.color='#ffd399';L.x-=.18}
    const margin=v==='boiler'?11:v==='genhall'?3:v==='assembly'||v==='sanct'?2:0
    if(margin&&(x<margin||x>=32-margin||z<margin||z>=32-margin)){L.fixZ=Math.min(L.fixZ,3);L.r=3.5;L.intensityMul=.85}
  }
}
