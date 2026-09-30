import assert from 'node:assert/strict'
import type { Engine } from '../src/game/engine'
import { CAREERS, CAREER_IDS } from '../src/game/content/careers'
import { isEnhancedFaction } from '../src/game/content/factionTerminals'
import { generateLevel } from '../src/game/world/mapgen'
import { levelDefOf } from '../src/game/levels'
import { freshCareer, restoreCareer, route, joinCareer, startCareer, performCareer, workStep, EXAMS, actualRank, reward, claimRewards, recordField, stableAt, deployStabilizer } from '../src/game/engine/career'

const make = () => {
 const bag:string[]=[]
 const e={career:freshCareer(),rep:{},seed:424242,los:()=>true,player:{x:0,y:0,level:101,steps:0},msg(){},changeRep(id:string,n:number){this.rep[id]=(this.rep[id]??0)+n},addItem(it:string){bag.push(it);return true}} as unknown as Engine
 return {e,bag}
}
let tasks=0
for(const id of CAREER_IDS.filter(id=>!isEnhancedFaction(id))){
 const {e}=make(),def=CAREERS[id]
 e.map=generateLevel(levelDefOf(def.home)!,424242,true)
 // BRC's procedural crews are validated separately by check:l1. Here use their staffed service contract.
 if(id==='brc')e.map.structures.push({kind:'settlementstation',x:5,y:5,w:.5,h:.5,solid:false,data:{faction:id,access:0,services:[...new Set(def.chapters.flatMap(c=>c.stations))]}})
 const register=e.map.structures.find(s=>(s.kind==='settlementstation'||s.data?.facility)&&s.data?.faction===id&&((s.data.services as string[])?.includes('career')||(s.data.services as string[])?.includes(def.chapters[0].stations[0])))!
 assert(register,id+': registration facility');e.player.x=register.x+register.w/2;e.player.y=register.y+register.h/2;e.player.level=def.home
 joinCareer(e,id)
 for(let task=0;task<12;task++){
  const p=route(e,id),ch=def.chapters[Math.floor(task/3)],service=ch.stations[task%3]
  e.map=generateLevel(levelDefOf(def.home)!,424242,true)
  if(id==='brc')e.map.structures.push({kind:'settlementstation',x:5,y:5,w:.5,h:.5,solid:false,data:{faction:id,access:0,services:[...new Set(def.chapters.flatMap(c=>c.stations))]}})
  const station=e.map.structures.find(s=>(s.kind==='settlementstation'||s.data?.facility)&&s.data?.faction===id&&Number(s.data.access??0)<=actualRank(e,id)&&(s.data.services as string[])?.includes(service))
  assert(station,`${id}/${task}: no unlocked ${service} facility`)
  e.player.x=station.x;e.player.y=station.y;e.player.level=def.home
  assert(startCareer(e,id))
  if(task%3===1){
   p.points=[0,1,2].map(i=>({x:100+i*35,y:100,level:ch.level}))
   assert.equal(recordField(e,id),false,'cannot record remotely')
   e.player.level=ch.level
   for(let i=0;i<3;i++){e.player.x=100+i*35-(e.map.inf?.ox??0);e.player.y=100-(e.map.inf?.oy??0);e.player.steps+=40;assert(recordField(e,id),`${id}/${task}: field record ${i}`)}
   assert.equal(recordField(e,id),false,'cannot repeat last field point')
   e.player.level=def.home;e.player.x=station.x;e.player.y=station.y
  }
  const exam=EXAMS[id]
  if(task%3!==2){assert.match(performCareer(e,id),/三项专业操作/);for(let i=0;i<3;i++)workStep(e,id,i)}
  else {performCareer(e,id,(exam.correct+1)%3);assert.equal(p.task,task,'failed exam must preserve task')}
  performCareer(e,id,exam.correct)
  assert.equal(p.task,task+1,`${id}/${task}: submission did not advance`)
  const settled=e.career.settled.length;performCareer(e,id,EXAMS[id].correct);assert.equal(e.career.settled.length,settled)
  e.career=restoreCareer(JSON.parse(JSON.stringify(e.career)))
  tasks++
 }
 assert.equal(e.rep[id],80);assert.equal(actualRank(e,id),4)
}
{
 const {e,bag}=make();e.rep.meg=100;assert.equal(actualRank(e,'meg'),0,'legacy reputation alone gives no qualification')
 CAREER_IDS.forEach(id=>{route(e,id).joined=true})
 for(const id of CAREER_IDS.filter(isEnhancedFaction))assert.equal(startCareer(e,id),false,`${id} must stay out of legacy exam tracking`)
 for(const id of ['brc','argos','tom'] as const)assert(startCareer(e,id),`${id} legacy career should start`)
 assert.equal(CAREER_IDS.filter(id=>!isEnhancedFaction(id)&&e.career.routes[id]?.active).length,3,'the three legacy routes fit the tracking limit')
 e.addItem=()=>false;assert(reward(e,'escrow-test',['bandage','eaglecoin']));assert.equal(reward(e,'escrow-test',['bandage']),false)
 e.career=restoreCareer(JSON.parse(JSON.stringify(e.career)));e.addItem=it=>{bag.push(it);return true};claimRewards(e);claimRewards(e);assert.deepEqual(bag,['bandage','eaglecoin'])
 e.map=generateLevel(levelDefOf(101)!,424242,true);e.player.level=101;e.player.x=5.25;e.player.y=5.25
 e.map.structures.push({kind:'settlementstation',x:5,y:5,w:.5,h:.5,solid:false,data:{faction:'brc',services:['stabilize']}})
 assert.equal(deployStabilizer(e),false);route(e,'brc').rank=3;e.rep.brc=60;assert(deployStabilizer(e));assert(stableAt(e,10,5));assert.equal(stableAt(e,12,5),false)
 e.career.clock+=91;assert.equal(stableAt(e,5,5),false)
}
console.log(`Career checks passed: ${tasks} task submissions across three legacy routes, reloads, field distance, escrow, tracking limit, stabilizer radius and expiry.`)

