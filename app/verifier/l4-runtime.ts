import {canOccupy,moveStep} from '../src/game/core/player'
import {triggerStructs} from '../src/game/engine/interact'
import {l4VoidAt} from '../src/game/world/l4Layout'
import type {Engine} from '../src/game/engine'
import {structColliders} from '../src/game/world/mapgen'
import {Box3,type Group} from 'three'
import type {Structure} from '../src/game/core/types'
import type {Renderer3D} from '../src/game/renderer/renderer'
export function verifyL4RenderedStairs(renderer:Renderer3D){
  const roots=(renderer as unknown as {structMeshes:Map<Structure,Group>}).structMeshes
  let checks=0
  for(const [s,g] of roots)if(s.kind==='l4stairs'){
    if(Math.abs(g.position.y)>.01)throw new Error('stair mesh must start at entrance floor, not descending void floor')
    const bounds=new Box3().setFromObject(g)
    if(bounds.min.y> -2.9||bounds.max.y<5.8)throw new Error('rendered stairwell must span both flights')
    checks+=2
  }
  if(!checks)throw new Error('wait for a stairwell chunk to finish rendering')
  return{checks}
}
export function verifyL4(engine:Engine){
  let checks=0;const assert=(v:unknown,msg:string)=>{if(!v)throw new Error(msg);checks++}
  const m=engine.map!,p=engine.player,old={x:p.x,y:p.y,z:p.z,sanity:p.sanity},ox=m.inf!.ox,oy=m.inf!.oy
  const doors=m.structures.filter(s=>s.kind==='hoteldoor'||s.kind==='glassdoor')
  let doorsTested=0
  for(const door of doors){
    if(door.x<3||door.y<3||door.x>m.w-3||door.y>m.h-3)continue
    const oldSolid=door.solid,open=door.data?.open;door.solid=true
    assert(!canOccupy(m,door.x+.5,door.y+.5),'closed door blocks')
    door.solid=false
    if(canOccupy(m,door.x+.5,door.y+.5)){
      const dx=door.data?.axis==='y'?1:0,dy=dx?0:1
      for(const sign of [-1,1]){
        const q={x:door.x+.5-dx*.9*sign,y:door.y+.5-dy*.9*sign}
        if(!canOccupy(m,q.x,q.y))continue
        for(let n=0;n<60;n++)moveStep(m,q,dx*.03*sign,dy*.03*sign)
        assert((q.x-door.x-.5)*dx*sign+(q.y-door.y-.5)*dy*sign>.5,'open door crosses both directions');doorsTested++
      }
    }
    door.solid=oldSolid;if(door.data)door.data.open=open??0
    if(doorsTested>25)break
  }
  const windows=m.structures.filter(s=>s.data?.coast)
  for(const s of windows){
    const b=structColliders(s)[0];assert(!!b,'window collider exists')
    assert(!canOccupy(m,(b.x0+b.x1)/2,(b.y0+b.y1)/2),'all window types block passage')
    assert(!canOccupy(m,(b.x0+b.x1)/2,(b.y0+b.y1)/2,undefined,{z:1.2,band:0}),'cannot jump through clear glass')
    assert(!l4VoidAt(m.inf!.seed,s.x+ox,s.y+oy),'window anchored in office')
  }
  const trap=m.structures.find(s=>s.kind==='windowtrap')
  assert(trap,'trap sample exists')
  if(trap){const before=trap.data?.triggered;trap.data!.triggered=0;p.x=trap.x+.5;p.y=trap.y+.5;p.sanity=100
    triggerStructs(engine,0,{dmg:1,drain:1});assert(p.sanity===86,'trap reduces sanity once')
    triggerStructs(engine,0,{dmg:1,drain:1});assert(p.sanity===86,'trap does not repeat');trap.data!.triggered=before??0
  }
  const stair=m.structures.find(s=>s.kind==='l4stairs');assert(stair,'loop stair sample exists')
  if(stair)for(const lane of [1,3]){
    p.x=stair.x+lane;p.y=stair.y+.8;p.z=0
    let max=0,min=0,returned=false
    for(let n=0;n<180;n++){
      moveStep(m,p,0,.035,undefined,{z:0,band:0});engine.updateStairs(1/60)
      max=Math.max(max,p.z);min=Math.min(min,p.z)
      if(p.y<stair.y+.5){returned=true;break}
    }
    assert(lane===1?max>2.4:min< -2.4,'stairs physically ascend/descend')
    assert(returned&&p.z===0&&p.level===4&&!engine.transition,'both flights return to SAME stairwell')
    assert(canOccupy(m,p.x,p.y),'return landing is occupiable')
  }
  const cubicle=m.structures.find(s=>s.kind==='cubicle')
  if(cubicle){const x=Number(cubicle.data?.deg)===270?cubicle.x+cubicle.w-.5:cubicle.x+.5;assert(canOccupy(m,x,cubicle.y+1),'cubicle opening can be entered')}
  Object.assign(p,old);engine.onStairs=false
  return{checks,doorsTested,windows:windows.length,stairs:!!stair}
}

export function verifyL4Streaming(engine:Engine){
  const m=engine.map!,p=engine.player,inf=m.inf!,origin={x:p.x+inf.ox,y:p.y+inf.oy}
  const door=m.structures.find(s=>s.kind==='hoteldoor')!,trap=m.structures.find(s=>s.kind==='windowtrap')!,cabinet=m.structures.find(s=>s.kind==='cabinet')!
  const ids=[door,trap,cabinet].map(s=>s.data!.sid),start={ox:inf.ox,oy:inf.oy}
  door.data!.open=1;door.solid=false;trap.data!.triggered=1;cabinet.looted=true;cabinet.data!.lootItems=[]
  let checks=0
  for(let pass=0;pass<3;pass++){
    p.x=15+640-inf.ox;p.y=15-inf.oy;engine.updateInfiniteWindow()
    if(m.structures.some(s=>ids.includes(s.data?.sid)))throw new Error('expected samples to unload')
    checks++
    p.x=origin.x-inf.ox;p.y=origin.y-inf.oy;engine.updateInfiniteWindow()
    const restored=ids.map(id=>m.structures.find(s=>s.data?.sid===id))
    if(!restored.every(Boolean)||restored[0]!.data?.open!==1||restored[0]!.solid||restored[1]!.data?.triggered!==1||!restored[2]!.looted)throw new Error('L4 streaming state lost')
    if(inf.ox!==start.ox||inf.oy!==start.oy)throw new Error('L4 origin was not restored')
    checks+=4
  }
  return{checks,roundTrips:3,states:['open door','triggered trap','looted cabinet']}
}
