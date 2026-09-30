import type { Engine } from '../engine'
import type { Entity } from '../entities'
import { l5NestLayout } from '../world/infiniteL5'

/** All player damage paths, including host-authoritative hits, call killCheck. */
export function provokeMoths(eng: Engine, source: Entity) {
  const inf=eng.map?.inf
  if(eng.levelDef.id!==5 || !inf || source.def.type!=='deathmoth' || source.hp>=source.def.hp)return
  const alerts=inf.mothAlerts??={all:false,nests:{}}
  if(source.def.mothForm==='larva') {
    if(!alerts.all)eng.msg('幼虫释放出刺鼻的气味，整片酒店传来愤怒的扑翼声。','damage')
    alerts.all=true
    for(const e of eng.map!.entities)if(e.def.type==='deathmoth'&&e.def.mothForm!=='larva')e.provoked=true
  } else {
    source.provoked=true
    if(source.mothNest)alerts.nests[source.mothNest]=true
  }
}

export function updateMothDoors(eng: Engine) {
  const m=eng.map!,inf=m.inf
  if(eng.levelDef.id!==5||!inf)return
  if(inf.mothAlerts?.all)for(const e of m.entities)if(e.def.type==='deathmoth'&&e.def.mothForm!=='larva')e.provoked=true
  for(const s of m.structures)if(s.data?.mothNest&&s.data.open){
    const alerts=inf.mothAlerts??={all:false,nests:{}}
    alerts.nests[String(s.data.mothNest)]=true
  }
}

/** A closed door remains a collision barrier even after a colony is alarmed. */
export function updateNestMoth(eng: Engine,e: Entity,dt:number,d:number,dmgMult:number):boolean {
  if(e.def.type!=='deathmoth')return false
  const larva=e.def.mothForm==='larva',female=e.def.mothForm==='female',guard=e.def.mothForm==='guard'
  if(!larva&&!female&&!guard)return false
  const m=eng.map!,inf=m.inf,p=eng.player
  const coords=e.mothNest?.split(',').map(Number)
  const nest=coords&&inf?l5NestLayout(inf.seed,coords[0],coords[1]):null
  const ox=inf?.ox??0,oy=inf?.oy??0
  const alerted=!larva&&(e.provoked||!nest||inf?.mothAlerts?.all||!!inf?.mothAlerts?.nests[e.mothNest!])
  e.animT+=dt*(alerted?7:1.4)
  if(e.stunT>0){e.stunT-=dt;return true}
  if(!alerted||eng.dev.invisible){
    e.state='wander'
    if(e.stateT<=0){
      const a=e.id*2.39+e.animT*.3
      e.targetX=nest?nest.x0+1.2+(nest.x1-nest.x0-1.4)*(.5+.45*Math.sin(a))-ox:e.x+Math.sin(a)*.5
      e.targetY=nest?nest.y0+1.2+(nest.y1-nest.y0-1.4)*(.5+.45*Math.cos(a))-oy:e.y+Math.cos(a)*.5
      e.stateT=4+e.id%5
    }
    eng.stepEntity(e,e.def.speed*(larva?.45:.12),dt)
    return true
  }
  e.provoked=true;e.state='chase'
  e.targetX=p.x;e.targetY=p.y
  // Route through the sole east-facing doorway, not diagonally into the partition.
  if(nest){
    const ex=e.x+ox,ey=e.y+oy,px=p.x+ox,py=p.y+oy
    const inside=ex>=nest.x0&&ex<nest.doorX+1&&ey>=nest.y0&&ey<nest.y1+1
    const playerInside=px<nest.doorX&&px>=nest.x0&&py>=nest.y0&&py<=nest.y1+1
    if(inside&&!playerInside){
      e.targetX=(Math.abs(ey-(nest.doorY+.5))>.27?nest.doorX-.45:nest.doorX+1.6)-ox
      e.targetY=nest.doorY+.5-oy
    }
  }
  eng.stepEntity(e,e.def.speed,dt)
  if(d<(guard?1.05:.8)&&e.attackCd<=0&&eng.meleeZOk(e)&&eng.los(e.x,e.y,p.x,p.y)){
    e.attackCd=guard?2.1:1.5;e.state='attack';e.lungeT=.25
    eng.hurtPlayer(e.def.damage*dmgMult,e.def.name)
    if(guard)eng.webbedT=Math.max(eng.webbedT,2.5)
  }
  return true
}
