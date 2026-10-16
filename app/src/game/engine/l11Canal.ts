import type { Engine } from '../engine'
import { l11MapWater } from '../world/mapgen'
export const L11_DEEP_DWELL_SECONDS=25,L11_DEEP_HEAD_DEPTH=2
const visits=new WeakMap<Engine,{map:Engine['map'];seconds:number;warned:boolean}>()
/** Continuous deep-water time only: surfacing, leaving, climbing and reload reset it. */
export function stepL11Canal(eng:Engine,dt:number){
  let state=visits.get(eng)
  if(!state||state.map!==eng.map){state={map:eng.map,seconds:0,warned:false};visits.set(eng,state)}
  const water=eng.levelDef.id===11&&eng.map?l11MapWater(eng.map,eng.player.x,eng.player.y):null
  const deep=water&&water.surface-(eng.player.z+1.55)>=L11_DEEP_HEAD_DEPTH
  if(!deep||eng.climb||eng.transition||eng.dev.fly||eng.dev.noclip){state.seconds=0;state.warned=false;return}
  state.seconds+=Math.max(0,Math.min(dt,.25))
  if(state.seconds>=12&&!state.warned){state.warned=true;eng.msg('水底的墙壁逐渐模糊，远处传来海潮声。','lore')}
  if(state.seconds>=L11_DEEP_DWELL_SECONDS){
    state.seconds=0;eng.arriveL7SafeWater=true
    eng.msg('运河的岸壁消失了，冰冷的水把你带向一片无边的海。','lore')
    eng.takeExit({kind:'l11-canal-depth',name:'运河深处',dest:7,anim:'noclip',cutIn:'surface'})
  }
}
