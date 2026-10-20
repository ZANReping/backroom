import { canOccupy, PLAYER_RADIUS } from '../src/game/core/player'
import { floorHeight } from '../src/game/world/mapgen'
import { __vBarn, __vLake } from '../src/proto/l10Views'
import { waterUniforms } from '../src/game/renderer/water'
import { l10WindUniforms } from '../src/game/renderer/l10Wind'
import { restoreSavedPlayerPosition } from '../src/game/engine/level'

// Drives the production engine/renderer in the isolated verifier, never a player save slot.
export async function verifyL10Import(q: any) {
  const { eng, r, look } = q, checks: string[] = []
  const check = (v: unknown, name: string) => { if (!v) throw Error(name); checks.push(name) }
  const move = async (v: number[]) => {
    eng.player.x = v[0] - eng.map.inf.ox; eng.player.y = v[1] - eng.map.inf.oy
    eng.updateInfiniteWindow(); eng.player.z = floorHeight(eng.map, eng.player.x, eng.player.y, 0)
    look.yaw = Math.atan2(-(v[2] - v[0]), -(v[3] - v[1])); look.pitch = 0
    await q.warm()
  }
  await move(__vBarn(20261006)!)
  const m = eng.map, p = eng.player
  const barn = m.structures.filter((s: any) => s.kind === 'barn').sort((a: any, b: any) => Math.hypot(a.x-p.x,a.y-p.y)-Math.hypot(b.x-p.x,b.y-p.y))[0]
  check(barn?.solid, 'solid barn generated in fully built production chunk')
  const angle = Number(barn.data.deg) * Math.PI / 180, dx = Math.sin(angle), dy = Math.cos(angle)
  const cx = barn.x + barn.w / 2, cy = barn.y + barn.h / 2, d = Number(barn.data.deg)%180 ? barn.w : barn.h
  const worldCX = cx + m.inf.ox, worldCY = cy + m.inf.oy
  for (let t = d/2+1; t >= d/2-2; t -= .15) {
    const x=cx+dx*t,y=cy+dy*t,z=floorHeight(m,x,y,0)
    check(canOccupy(m,x,y,PLAYER_RADIUS,{z,band:0}), `barn front doorway clear at ${t.toFixed(2)}m`)
  }
  const wx = cx + Math.cos(angle)*(Number(barn.data.deg)%180?barn.h:barn.w)/2
  const wy = cy - Math.sin(angle)*(Number(barn.data.deg)%180?barn.h:barn.w)/2
  check(!canOccupy(m,wx,wy,PLAYER_RADIUS,{z:floorHeight(m,wx,wy,0),band:0}), 'barn side wall blocks movement')
  // Actual movement through the entrance, with gameplay collision and ground tracking.
  Object.assign(p,{x:cx+dx*(d/2+1),y:cy+dy*(d/2+1),z:floorHeight(m,cx,cy,0),floor:0,vz:0})
  eng.input.mx=-dx;eng.input.my=-dy
  for(let i=0;i<45;i++)eng.updateMovement(1/30,{dmg:1,drain:1},false)
  eng.input.mx=eng.input.my=0
  check((p.x+m.inf.ox-worldCX)*dx+(p.y+m.inf.oy-worldCY)*dy<d/2-.3,'player walks through production barn doorway')
  const snapshot=eng.snapshot(), saved={...snapshot.worldPos}, hp=p.hp
  p.x+=2;p.y+=2
  const placement=restoreSavedPlayerPosition(eng,snapshot.worldPos)
  check(Math.hypot(p.x+m.inf.ox-saved.x!,p.y+m.inf.oy-saved.y!)<.01&&p.hp===hp,'saved world position restores inside rebuilt barn')
  const before=l10WindUniforms.uL10WindTime.value
  Object.assign(eng.l10Weather,{kind:'rain',k:1,wetness:1})
  await new Promise(resolve=>setTimeout(resolve,200))
  check(l10WindUniforms.uL10WindTime.value>before,'wind phase advances under rain')
  check(waterUniforms.uWaterRain.value===1,'rain reaches lake shader')
  const resources=[]
  for(let i=0;i<3;i++) {
    await move(__vLake(20261006)!);await move(__vBarn(20261006)!)
    resources.push({...r.three.info.memory,programs:r.three.info.programs.length})
    check(waterUniforms.uWaterOrigin.value.x===eng.map.inf.ox&&waterUniforms.uWaterOrigin.value.y===eng.map.inf.oy,'water origin tracks streaming window')
  }
  check(resources.slice(1).every(v=>v.geometries===resources[0].geometries&&v.textures===resources[0].textures),'geometry and textures stable over three stream-return cycles')
  check(r.three.info.programs.every((v:any)=>v.diagnostics?.runnable!==false),'all compiled programs runnable')
  return {checks,resources,placement,barn:{x:worldCX,y:worldCY,deg:barn.data.deg},scope:'single-player production gameplay and rendering; isolated memory storage'}
}
