import assert from 'node:assert/strict'
import { LEVELS } from '../src/game/levels'
import { genL5ChunkRaw, l5RegionAt, l5SpawnElevSlot } from '../src/game/world/infiniteL5'
import { l5StairWallDirection } from '../src/game/world/l5Topology'

const def=LEVELS[5],CS=32
const fail=(message:string):never=>{throw new Error(message)}
const chunk=(seed:number,cx:number,cy:number)=>genL5ChunkRaw(def,seed,cx,cy)
const at=(c:ReturnType<typeof chunk>,x:number,y:number)=>{const lx=((x%CS)+CS)%CS,ly=((y%CS)+CS)%CS;return{tile:c.tiles[ly*CS+lx],elev:c.elev[ly*CS+lx]}}
const lightNear=(c:ReturnType<typeof chunk>,x:number,y:number,r=1)=>c.lights.some(l=>Math.abs(l.x-.5-x)+Math.abs(l.y-.5-y)<=r)

for(let seed=1;seed<=64;seed++){
  const c=chunk(seed,0,0),old=c.exits.filter(e=>e.def.kind==='oldstairs')
  if(old.length!==1)fail(`seed=${seed} world=(0,0) oldstairs=${old.length}, expected exactly 1`)
  const slot=l5SpawnElevSlot(seed)
  if(!slot)fail(`seed=${seed} spawn elevator slot missing`)
  const ecx=Math.floor(slot!.x/CS),ecy=Math.floor(slot!.y/CS),ec=chunk(seed,ecx,ecy)
  const elevators=ec.exits.filter(e=>e.def.kind==='elevatorshaft'&&Math.floor(e.x)===slot!.x&&Math.floor(e.y)===slot!.y)
  if(elevators.length!==1)fail(`seed=${seed} elevator world=(${slot!.x},${slot!.y}) count=${elevators.length}, expected exactly 1`)
}

for(const seed of [424242,31337]) for(let cy=-8;cy<=8;cy++) for(let cx=-8;cx<=8;cx++){
  const c=chunk(seed,cx,cy),ox=cx*CS,oy=cy*CS
  for(const e of c.exits){
    const x=Math.floor(e.x),y=Math.floor(e.y)
    if(e.def.kind==='elevatorshaft'&&!lightNear(c,x,y))fail(`seed=${seed} elevator light missing at (${x},${y}) chunk=(${cx},${cy})`)
    if(e.def.kind==='oldstairs'){
      if(!lightNear(c,x,y))fail(`seed=${seed} oldstairs light missing at (${x},${y})`)
      const lx=x-ox,ly=y-oy
      const direction=l5StairWallDirection({w:CS,h:CS,elev:c.elev} as never,{x:lx,y:ly})
      if(!direction)fail(`seed=${seed} oldstairs direction missing at (${x},${y})`)
      for(let n=1;n<=3;n++){
        const p=at(c,x-direction[0]*n,y-direction[1]*n)
        if(p.elev!==4)fail(`seed=${seed} oldstairs stair run mismatch at (${x-direction[0]*n},${y-direction[1]*n})`)
        const solid=c.structures.some(s=>s.solid&&s.kind!=='stairrail'&&x-direction[0]*n>=s.x&&x-direction[0]*n<s.x+s.w&&y-direction[1]*n>=s.y&&y-direction[1]*n<s.y+s.h)
        if(solid)fail(`seed=${seed} oldstairs solid obstruction at (${x-direction[0]*n},${y-direction[1]*n})`)
      }
    }
    if(e.def.kind==='boilerdeep'){
      const region=l5RegionAt(seed,x,y)
      if(region?.variant!=='boilerroom')fail(`seed=${seed} boilerdeep outside boilerroom at (${x},${y})`)
      const covered=c.structures.some(s=>s.solid&&x>=s.x&&x<s.x+s.w&&y>=s.y&&y<s.y+s.h)
      if(covered)fail(`seed=${seed} boilerdeep solid furniture overlap at (${x},${y})`)
      if(c.tiles[(y-oy)*CS+(x-ox)]!==1)fail(`seed=${seed} boilerdeep not on floor at (${x},${y})`)
    }
  }
}
console.log('L5 exit checks passed: 64 spawn seeds, elevator/stair lighting and orientation, boiler doors.')
