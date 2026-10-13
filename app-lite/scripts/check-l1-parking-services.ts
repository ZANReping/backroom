import assert from 'node:assert/strict'
import {l1ParkingServices} from '../src/game/world/l1ParkingServices'
import type {L1Module,L1Box} from '../src/game/world/l1BuildingTypes'

const moduleBase:L1Module={height:3.5,spacingX:6.4,spacingZ:6,phaseX:-2.5,phaseZ:-1.2,columnWidth:1,columnDepth:1,round:false,beamDepth:.4,beamWidth:.4,lampSpacing:4,wallTubes:false,power:1,finish:'raw',services:'white-pipes'}
const chunks=[-64,-32,0,32]
const styles=['white-pipes','red-rack','service-rack'] as const
const make=(services:typeof styles[number],x:number,z:number,allowed:(x:number,z:number)=>boolean)=>l1ParkingServices({...moduleBase,services},x,z,allowed)
const validate=(boxes:L1Box[],height:number,services:typeof styles[number])=>{
 const ids=new Set<string>()
 for(const b of boxes){
  assert(!ids.has(b.id),`duplicate id ${b.id}`);ids.add(b.id)
  for(let i=0;i<3;i++){assert(Number.isFinite(b.min[i])&&Number.isFinite(b.max[i]),`non-finite ${b.id}`);assert(b.max[i]>b.min[i],`non-positive extent ${b.id}`)}
  assert.equal(b.solid,false,`solid service ${b.id}`);assert(b.min[1]>height-(services==='service-rack'?.5:.4),`low service ${b.id}`);assert(b.max[1]<=height,`service above height ${b.id}`)
 }
}
for(const services of styles)for(const x of chunks)for(const z of chunks){
 const boxes=make(services,x,z,()=>true);validate(boxes,moduleBase.height,services);assert.deepEqual(boxes,make(services,x,z,()=>true),`${services} ${x},${z} not deterministic`)
}
for(const services of styles){
 const mainAt=(x:number,z:number)=>make(services,x,z,()=>true).filter(b=>b.id.startsWith('service:main:')&&b.axis===2)
 let mainSeams=0
 for(const z of [-32,0,32]){
  const left=mainAt(0,z-32),right=mainAt(0,z)
  for(const a of left.filter(b=>b.max[2]===z)){
   const b=right.find(q=>q.min[2]===z&&q.min[0]===a.min[0]&&q.max[0]===a.max[0]&&q.min[1]===a.min[1]&&q.max[1]===a.max[1]&&q.surface===a.surface)
   assert(b,`main boundary mismatch for ${services} at z=${z}`);mainSeams++
  }
 }
 assert(mainSeams>0,`no main seams for ${services}`)
}
for(const services of styles){
 const transverseAt=(x:number,z:number)=>make(services,x,z,()=>true).filter(b=>b.id.startsWith('service:sprinkler:')&&b.axis===0)
 let sprinklerSeams=0
 for(const x of [-32,0,32]){
  const left=transverseAt(x-32,0),right=transverseAt(x,0)
  for(const a of left.filter(b=>b.max[0]===x)){
   const b=right.find(q=>q.min[0]===x&&q.min[1]===a.min[1]&&q.max[1]===a.max[1]&&q.min[2]===a.min[2]&&q.max[2]===a.max[2]&&q.surface===a.surface)
   assert(b,`sprinkler boundary mismatch for ${services} at x=${x}`);sprinklerSeams++
  }
 }
 assert(sprinklerSeams>0,`no sprinkler seams for ${services}`)
}
for(const services of styles){
 const filteredMains=make(services,0,-16,(_x,z)=>z<0).filter(q=>q.id.startsWith('service:main:'))
 assert(filteredMains.length>0,`${services} negative-z filter produced no main pipes`)
 for(const b of filteredMains)assert(b.max[2]<=0,`disallowed ${services} main crosses z=0: ${b.id}`)
}
const rack=make('service-rack',0,0,()=>true)
for(const prefix of ['service:main:','service:tray:','service:rung:'])assert(rack.some(b=>b.id.startsWith(prefix)&&b.occlude),`service-rack missing occluding ${prefix}`)
console.log('L1 parking services regression passed')
