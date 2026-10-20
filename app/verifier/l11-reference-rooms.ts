import { l11CityPlan, l11World } from '../src/game/world/l11Layout'
import { l11InteriorPlan } from '../src/game/world/l11Interiors'
import { canOccupy } from '../src/game/core/player'
import { updateMovement } from '../src/game/engine/movement'

/**
 * Walks through one real reference building's first room of every generated
 * room kind on every floor.  This intentionally exercises the production
 * interior doors and collision map rather than a QA-only proxy mesh.
 */
export async function verifyL11ReferenceRooms(qa:any, buildingId:string){
  const eng=qa.eng, plan=l11CityPlan(20261014,0,0)
  const building=plan.buildings.find(b=>b.id.includes(':reference:')&&(b.id===buildingId||b.id.endsWith(`:reference:${buildingId}`)))
  if(!building)throw Error(`Missing reference building ${buildingId}`)
  const interior=l11InteriorPlan(building),checks:any[]=[]
  for(const floor of interior.floors){
    const kinds=[...new Set(floor.rooms.map(room=>room.kind))]
    for(const kind of kinds){
      const room=floor.rooms.find(candidate=>candidate.kind===kind)!
      const door=floor.doors.find(candidate=>candidate.from===room.id||candidate.to===room.id)
      if(!door)throw Error(`Reference room has no door ${building.id}:${floor.floor}:${room.id}`)
      const len=Math.hypot(door.b[0]-door.a[0],door.b[1]-door.a[1])
      if(!(len>0))throw Error(`Invalid reference room door ${building.id}:${floor.floor}:${room.id}`)
      const dx=(door.b[0]-door.a[0])/len,dy=(door.b[1]-door.a[1])/len
      const sides=[l11World(building,door.center[0]-dy*.65,door.center[1]+dx*.65),l11World(building,door.center[0]+dy*.65,door.center[1]-dx*.65)]
      const z=building.base+floor.floor*3
      qa.moveTo(...sides[0])
      eng.player.z=z;eng.player.floor=floor.floor;eng.player.vz=0;eng.player.crouching=false;eng.onStairs=false;eng.moveIt.acc=0
      eng.input.mx=eng.input.my=0;eng.input.jump=false;eng.input.sprint=false
      const clear=(p:[number,number])=>canOccupy(eng.map,p[0]-eng.map.inf.ox,p[1]-eng.map.inf.oy,.32,{z,band:floor.floor as 0|1|2})
      if(!clear(sides[0])||!clear(sides[1]))throw Error(`Reference room door blocked ${building.id}:${floor.floor}:${room.id}`)
      for(const target of [sides[1],sides[0]]){
        for(let i=0;i<100;i++){
          const x=eng.player.x+eng.map.inf.ox,y=eng.player.y+eng.map.inf.oy,d=Math.hypot(target[0]-x,target[1]-y)
          if(d<.03)break
          eng.input.mx=(target[0]-x)/d;eng.input.my=(target[1]-y)/d
          updateMovement(eng,1/60,{dmg:1,drain:1},false)
        }
        eng.input.mx=eng.input.my=0
        const ex=eng.player.x+eng.map.inf.ox,ey=eng.player.y+eng.map.inf.oy,error=Math.hypot(ex-target[0],ey-target[1]),heightError=Math.abs(eng.player.z-z)
        if(error>=.12||heightError>=.1)throw Error(`Reference room traversal failed ${building.id}:${floor.floor}:${room.id} error=${error.toFixed(3)} height=${heightError.toFixed(3)}`)
        checks.push({building:building.id,kind,floor:floor.floor,room:room.id,direction:target===sides[1]?'forward':'reverse',error,heightError})
      }
    }
  }
  return {ok:true,checks}
}
