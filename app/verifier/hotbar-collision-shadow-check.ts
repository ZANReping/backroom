import * as Player from '../src/game/core/player'
import {structStandTopAt,structColliders,ceilingHeightAt} from '../src/game/world/mapgen'
import {mount as mountLighting} from './l1-bake-smoothing-check'

const sleep=(ms=100)=>new Promise(r=>setTimeout(r,ms))
export async function mount(app:any,cases:any[],before=false){
 const lighting=await mountLighting(app,cases),e=app.engine,r=app.renderer(),checks:string[]=[],records:any[]=[]
 const ok=(v:unknown,label:string)=>{if(!v)throw Error(label);checks.push(label)}
 const hotbar=async(theme='default')=>{
  document.documentElement.setAttribute('data-ui',theme)
  e.input.mx=e.input.my=0;e.handsStowed=true
  for(const i of [0,5,6]){
   const buttons=document.querySelectorAll<HTMLButtonElement>('.hud-slot');ok(buttons.length===7,'Seven real hotbar slots at '+innerWidth)
   buttons[i].click();await sleep(210)
   const selected=document.querySelector<HTMLElement>('.hud-slot.is-selected')!,row=selected.parentElement!,b=selected.getBoundingClientRect(),p=row.getBoundingClientRect(),css=getComputedStyle(row)
   const scroll=(css.overflowX==='auto'||css.overflowX==='scroll')&&(row.scrollWidth>row.clientWidth||row.scrollHeight>row.clientHeight)
   const topVisible=css.overflowY==='visible'||b.top-1>=p.top-.5
   const value={kind:'hotbar',theme,viewport:[innerWidth,innerHeight],slot:i+1,selected:e.player.selected,scroll,topVisible,overflow:[css.overflowX,css.overflowY],scrollSize:[row.scrollWidth,row.scrollHeight],clientSize:[row.clientWidth,row.clientHeight],bounds:{x:p.x,y:p.y,w:p.width,h:p.height,selectedY:b.top},zoom:document.body.style.zoom}
   records.push(value)
   if(!before){ok(e.player.selected===i,'Actual hotbar selects '+(i+1));ok(!scroll,'No hotbar scrollbar after slot '+(i+1));ok(topVisible,'Animated top edge remains visible at slot '+(i+1));ok(p.left>=-1&&p.right<=innerWidth+1,'All seven slots fit the viewport')}
  }
  const row=document.querySelector('.hud-slot')!.parentElement!.getBoundingClientRect()
  return{clip:{x:Math.max(0,row.left-10),y:Math.max(0,row.top-15),width:Math.min(innerWidth-Math.max(0,row.left-10),row.width+20),height:Math.min(innerHeight-Math.max(0,row.top-15),row.height+30),scale:1},values:records.filter(v=>v.kind==='hotbar').slice(-3)}
 }
 const crate=async()=>{
  const previous=e.update;e.update=()=>{};e.input.crouch=e.input.jump=false;e.dev.noclip=false;e.dev.fly=false
  try{
   const entries=e.map.structures.filter((s:any)=>s.kind==='crate'&&s.data?.l1Crate&&r.structMeshes.has(s))
   const usable=entries.flatMap((s:any)=>{
    const x=s.x+s.w/2,y=s.y+s.h/2,h=Number(s.data.l1Stack??1)*.68
    if(!Player.canOccupy(e.map,x,y,.32,{z:h,band:0})||ceilingHeightAt(e.map,x,y,3.25,0)<h+1.7)return[]
    return [[-1,0],[1,0],[0,-1],[0,1]].filter(([dx,dy])=>[1.4,1.8,2.4,3.2,3.6].every(d=>Player.canOccupy(e.map,x+dx*d,y+dy*d,.32,{z:0,band:0}))).map(direction=>({s,x,y,h,direction}))
   }).sort((a:any,b:any)=>Math.hypot(a.x-e.player.x,a.y-e.player.y)-Math.hypot(b.x-e.player.x,b.y-e.player.y))
   ok(usable.length>0,'Natural L1 crate has an open route off its lid')
   const test=usable[0],{s,x,y,h,direction:[dx,dy]}=test,timeline:any[]=[]
   Object.assign(e.player,{x,y,z:h,vz:0,floor:0,crouching:false});e.input.mx=dx;e.input.my=dy
   app.look.yaw=Math.atan2(dx,dy);app.look.pitch=-.72;app.look.roll=0;r.setFov(70,35)
   for(let i=0;i<240;i++){
    // Slow joystick motion also represents the small outward component when
    // a player slides diagonally along a lid. A fast straight walk can clear
    // the body before gravity embeds it and would miss the reported failure.
    e.input.mx=dx*.25;e.input.my=dy*.25
    e.updateMovement(1/60,{dmg:1,drain:1},false)
    timeline.push({frame:i,x:e.player.x,y:e.player.y,z:e.player.z,clear:Player.canOccupy(e.map,e.player.x,e.player.y,.32,{z:e.player.z,band:0}),top:structStandTopAt(e.map,e.player.x,e.player.y,e.player.z,0)})
    if(i%15===0)await sleep(15)
   }
   e.input.mx=e.input.my=0;await sleep(200)
   const distance=Math.hypot(e.player.x-x,e.player.y-y),clear=Player.canOccupy(e.map,e.player.x,e.player.y,.32,{z:e.player.z,band:0})
   if(!before){ok(clear&&timeline.every(v=>v.clear),'Live movement never embeds the body in a crate edge');ok(distance>3&&Math.abs(e.player.z)<.001,'Live player leaves lid and lands on floor without sticking')}
   const record={kind:'crate',position:{x,y,h},stack:s.data.l1Stack??1,colliders:structColliders(s,e.map),direction:[dx,dy],distance,clear,timeline};records.push(record)
   if(!before){
    Object.assign(e.player,{x,y,z:0,vz:0});const start={x,y};e.updateMovement(1/60,{dmg:1,drain:1},false)
    const moved=Math.hypot(e.player.x-start.x,e.player.y-start.y)
    ok(Player.canOccupy(e.map,e.player.x,e.player.y,.32,{z:e.player.z,band:0})&&moved>0&&moved<=2,'Idle real movement locally recovers from an embedded model')
    ok(Math.abs(e.player.z)<.001,'Recovery preserves floor height')
    const saved={x:e.player.x,y:e.player.y};e.updateMovement(1/60,{dmg:1,drain:1},false)
    ok(Math.hypot(saved.x-e.player.x,saved.y-e.player.y)<1e-6,'Recovered idle player does not drift')
    records.push({kind:'recovery',distance:moved,position:{x:e.player.x,y:e.player.y,z:e.player.z}})
   }
   return record
  }finally{e.input.mx=e.input.my=0;e.update=previous}
 }
 return{...lighting,hotbar,crate,result:()=>({...lighting.result(),interactionChecks:checks,interactions:records})}
}
