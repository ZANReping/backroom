import type { Engine } from '../src/game/engine'
import type { GameMap } from '../src/game/world/mapgen'
import { spawnBlackoutSmilers } from '../src/game/engine/ambient'
import { l1StyleAt } from '../src/game/world/l1Architecture'
import { l1Transition } from '../src/game/world/l1Layout'

export function verifyL1Smilers(ok:(v:unknown,label:string)=>void){
  const seed=424242
  const harness=(variant:string,cx=0,cy=0)=>{
    const map={l1Architecture:true,entities:[],inf:{seed,ox:cx*32,oy:cy*32,chunks:new Map([[`${cx},${cy}`,{variant}]])}} as unknown as GameMap
    return {map,player:{level:1,x:16.5,y:16.5},entityWalkH:()=>0} as unknown as Engine
  }
  const spawn=(e:Engine,random:number)=>{
    const saved=Math.random
    try{Math.random=()=>random;spawnBlackoutSmilers(e)}finally{Math.random=saved}
    return e.map!.entities
  }
  ok(spawn(harness('maintenance'),0).length===0,'maintenance blocks blackout smilers on otherwise walkable tiles')
  ok(spawn(harness('parking'),0).length>0,'parking still allows blackout smilers')
  let covered=0
  const seen=new Set<string>()
  for(let cy=-40;cy<=40;cy++)for(let cx=-40;cx<=40;cx++){
    const t=l1Transition(seed,cx,cy)
    if(!t||(t.a!=='maintenance'&&t.b!=='maintenance'))continue
    const first=t.a==='maintenance',key=`${t.axis}:${first}`
    if(seen.has(key))continue
    seen.add(key)
    const e=harness('aisle',cx,cy),axis=t.axis==='x'?'x':'y'
    e.player[axis]=first?12.5:22.5
    ok(l1StyleAt(e.map!,e.player.x,e.player.y)==='maintenance','test player starts in maintenance half')
    const random=t.axis==='x'?(first?0:.5):(first?.25:.75)
    const entities=spawn(e,random)
    ok(entities.length>0&&entities.every(s=>l1StyleAt(e.map!,s.x,s.y)!=='maintenance'),'valid adjacent half spawns while player is in maintenance')
    const blocked=harness('aisle',cx,cy)
    blocked.player[axis]=first?22.5:12.5
    const reverse=t.axis==='x'?(first?.5:0):(first?.75:.25)
    ok(spawn(blocked,reverse).length===0,'maintenance half rejects candidates from adjacent sector')
    covered++
  }
  ok(covered===4,'both transition axes and maintenance orientations covered')
}
