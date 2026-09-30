import { Engine } from '../src/game/engine'
import { captureL1, flickerL1Crates, syncL1Crates } from '../src/game/engine/l1State'
import { canOccupy } from '../src/game/core/player'
import { ceilingHeightAt } from '../src/game/world/mapgen'
import { l1RoofAt } from '../src/game/world/l1Architecture'
import { verifyL1Smilers } from './l1-smilers'
import { l1LayoutVariant, l1Transition } from '../src/game/world/l1Layout'


export function verifyL1Runtime(){
  const results:string[]=[],ok=(v:unknown,label:string)=>{if(!v)throw Error(label);results.push(label)}
  const e=new Engine();e.newRun(424242,'normal');e.loadLevel(1,{mapSeed:424242,firstVisit:false});e.dev.frozenAI=true
  let m=e.map!,inf=m.inf!,c=inf.chunks.get('0,0')!
  const reserve=c.structures.find(s=>s.data?.l1Crate)!
  ok(reserve,'reserve crate exists')
  const sid=reserve.data!.sid
  reserve.looted=true;reserve.data!.searched=1;reserve.data!.lootItems=[]
  const before=new Map([...inf.chunks.values()].flatMap(c=>c.structures.filter(s=>s.data?.l1Crate).map(s=>[s,Number(s.data!.l1Hidden)] as const)))
  flickerL1Crates(e)
  let changed=0
  for(const [s,hidden] of before)if(Number(s.data!.l1Hidden)!==hidden)changed++
  ok(changed>0,'flicker changes distant crates')
  ok([...before.keys()].filter(s=>s.data!.l1Hidden).every(s=>!m.structures.includes(s)),'hidden crates excluded from interaction and collision list')
  const near=[...before.keys()].filter(s=>Math.hypot(s.x+.5-e.player.x,s.y+.5-e.player.y)<24)
  ok(near.every(s=>Number(s.data!.l1Hidden)===before.get(s)),'nearby crates protected')
  const hiddenBox=[...before.keys()].find(s=>s.data!.l1Hidden&&canOccupy(m,s.x+.5,s.y+.5))
  ok(hiddenBox,'hidden crate footprint is traversable')
  const snapshot=JSON.parse(JSON.stringify(captureL1(e)))
  e.l1World=snapshot;e.loadLevel(1,{mapSeed:424242,firstVisit:false})
  m=e.map!;inf=m.inf!;c=inf.chunks.get('0,0')!
  let restored=c.structures.find(s=>s.data?.sid===sid)!
  ok(restored.looted&&Array.isArray(restored.data?.lootItems)&&restored.data.lootItems.length===0,'JSON save/reload preserves searched empty crate')
  ok(inf.l1Dynamics?.epoch===snapshot.dynamics.epoch,'flicker epoch survives save')
  // Move beyond the streaming window, then return to the saved crate.
  e.player.x+=320;e.updateInfiniteWindow();e.player.x=16-e.map!.inf!.ox;e.player.y=16-e.map!.inf!.oy;e.updateInfiniteWindow()
  restored=e.map!.inf!.chunks.get('0,0')!.structures.find(s=>s.data?.sid===sid)!
  ok(restored.looted&&restored.data?.lootItems?.length===0,'unload/reload preserves empty inventory')
  e.loadLevel(0);e.loadLevel(1)
  restored=e.map!.inf!.chunks.get('0,0')!.structures.find(s=>s.data?.sid===sid)!
  ok(restored.looted&&e.map!.inf!.seed===424242,'outpost/level round trip keeps L1 seed and inventory')
  e.blackoutPendingDur=5;e.applyBlackout()
  ok(e.map!.inf!.blackout&&e.map!.lights.every(l=>!l.gen||l.keep),'blackout retains independent power only')
  e.endBlackout();ok(!e.map!.inf!.blackout&&e.map!.lights.some(l=>l.gen&&!l.keep),'power recovery restores main lights')
  const guest=new Engine();guest.newRun(424242,'normal');guest.loadLevel(1,{mapSeed:424242,firstVisit:false})
  const host=e.map!.inf!.l1Dynamics!
  syncL1Crates(guest,host.epoch,host.hidden)
  const visibility=(engine:Engine)=>[...engine.map!.inf!.chunks.values()].flatMap(c=>c.structures.filter(s=>s.data?.l1Crate).map(s=>`${c.key}:${s.data!.sid}:${s.data!.l1Hidden}`)).sort().join('|')
  ok(visibility(e)===visibility(guest),'host/guest crate visibility converges')
  const rev=guest.map!.inf!.redo;syncL1Crates(guest,host.epoch,host.hidden)
  ok(rev===guest.map!.inf!.redo,'duplicate network event is idempotent')
  for(let cx=-12;cx<=12;cx++)for(let cy=-12;cy<=12;cy++)if(l1LayoutVariant(424242,cx,cy)==='aisle')ok(!!l1Transition(424242,cx,cy),'transition derives from district boundary')
  verifyL1Smilers(ok)
  m=e.map!
  for(let y=67;y<90;y+=3)for(let x=67;x<90;x+=3)if(m.tiles[y*m.w+x]===1)ok(Math.abs(ceilingHeightAt(m,x+.5,y+.5,0)-l1RoofAt(m,x+.5,y+.5,3.6,true))<.001,'visual and collision roof match')
  return {passed:results.length,checks:[...new Set(results)],epoch:host.epoch,changedCrates:changed}
}

