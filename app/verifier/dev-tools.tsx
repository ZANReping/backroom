import React from 'react'
import { createRoot } from 'react-dom/client'
import HUD from '../src/components/HUD'
import TouchControls from '../src/components/TouchControls'
import { defaultSettings } from '../src/components/SettingsModal'
import { ENTITY_FORMS, entityForms } from '../src/game/entities'
import { canFlyOccupy } from '../src/game/core/flight'
import { ceilingHeightAt } from '../src/game/world/mapgen'
import '../src/index.css'

const tick = async (n=4) => {for(let i=0;i<n;i++) await new Promise<void>(r=>requestAnimationFrame(()=>r()))}
const check = (value:unknown,message:string) => {if(!value)throw Error(message)}
let unmount: (()=>void) | undefined
export async function mount(qa:any,mobile=false,touch=false) {
  unmount?.()
  qa.hide();qa.setFrozen(true);qa.eng.devEnabled=true;qa.eng.dev.frozenAI=true;qa.eng.dev.god=true
  const host=document.createElement('div');host.id='dev-tools-qa-hud';document.body.append(host);const root=createRoot(host),noop=()=>{}
  const render=()=>root.render(<>{touch&&<TouchControls engine={qa.eng} settings={{...defaultSettings,devMode:true}} onInventory={noop}/>}<HUD engine={qa.eng} isMobile={mobile} log={[]} toasts={[]} devMode fxScale={1} onPause={noop} onInventory={noop} onSelectSlot={noop} onUseSlot={noop}/></>)
  render();const timer=setInterval(render,100)
  unmount=()=>{clearInterval(timer);root.unmount();host.remove()}
  await tick()
  return {parents:Object.keys(ENTITY_FORMS),forms:Object.entries(ENTITY_FORMS).flatMap(([type,forms])=>forms.map(f=>({type,id:f.id})))}
}
export async function summon(qa:any,type:string,form?:string) {
  const eng=qa.eng,p=eng.player,r=qa.r
  qa.setFrozen(true);eng.devEnabled=true;eng.devSetFlight(false);eng.dev.frozenAI=true
  p.x=40.25;p.y=25.5;p.z=0;p.floor=0;p.hp=100;p.sanity=100;p.flashlight=false
  eng.map.entities=[];eng.particles=[];qa.look.yaw=-Math.PI/2;qa.look.pitch=-.12;qa.look.roll=0;r.setFov(60)
  const input=document.querySelector<HTMLInputElement>('[aria-label="搜索实体或变种"]')!
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(input,type);input.dispatchEvent(new Event('input',{bubbles:true}));await tick()
  const row=document.querySelector<HTMLElement>(`[data-entity="${type}"]`)!
  check(row,'entity card missing: '+type)
  const select=row.querySelector('select')
  if(form){check(select,'variant selector missing');select!.value=form;select!.dispatchEvent(new Event('change',{bubbles:true}));await tick()}
  else check(!entityForms(type).length,'variant required')
  row.querySelector('button')!.click();await tick(12)
  const e=eng.map.entities.at(-1);check(e,`UI spawn failed: ${type}/${form}`)
  const actual=e.def.entityForm??e.def.mothForm??e.def.smilerKind
  check(actual===form,`wrong selected form: ${actual} vs ${form}`)
  const spawn=[e.x,e.y,e.z]
  e.x=43.3;e.y=25.5;e.facing=Math.PI
  if(['corpserat','arachnid'].includes(type)||form==='larva')qa.look.pitch=-.4
  if(form==='corpserat-ceiling')qa.look.pitch=.3
  if(type==='smiler'&&form==='great'){p.x=38;qa.look.pitch=.06;r.setFov(72)}
  await tick(12);await qa.warm()
  const g=r.entityMeshes.get(e.id)
  check(g?.visible,`missing rendered entity ${form}`)
  if(type==='wretch')check(g.userData.wretchRig.kind===e.wr.kind&&e.wr.kind===e.def.wretchKind,'wretch AI/model mismatch')
  if(type==='hound')check(g.userData.houndNeutral===e.hd.neutral,'hound AI/model mismatch')
  if(type==='skinstealer')check(g.userData.wasDisguised===(e.ss.phase==='skinned'),'skin phase/disguise mismatch')
  if(type==='faceling')check(!!g.userData.facePlan===!!e.def.l3face,'faceling model mismatch')
  if(type==='duller')check(g.userData.dullerCarry===(e.dl?.carry??''),'duller carry mismatch')
  const f=entityForms(type).find(v=>v.id===form)!
  for(const [key,value] of Object.entries(f?.traits??{}))check(e.def[key]===value,'spawn lost trait '+key)
  let meshes=0,triangles=0
  g.traverse((o:any)=>{if(o.isMesh){meshes++;triangles+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3}})
  check(meshes>0&&Number.isFinite(triangles),'invalid geometry')
  return {type,form,id:e.id,spawn,pose:[p.x,p.y,p.z,qa.look.yaw,qa.look.pitch,r.camera.fov],hp:e.hp,meshes,triangles,phase:e.ss?.phase,weapon:e.cl?.weapon,fasting:e.cl?.fasting,memory:{...r.three.info.memory}}
}
export async function flightChecks(qa:any) {
  const eng=qa.eng,p=eng.player,m=eng.map,checks:string[]=[]
  const ok=(v:unknown,s:string)=>{check(v,s);checks.push(s)}
  qa.setFrozen(true);eng.devEnabled=true;eng.map.entities=[];eng.introT=0;eng.paused=false;eng.dev.noclip=false
  p.x=40.25;p.y=25.5;p.z=0;p.floor=0;p.vz=0;eng.devSetFlight(true)
  const step=(seconds:number)=>{for(let i=0;i<seconds*60;i++)eng.updateMovement(1/60,{dmg:1,drain:1},false)}
  eng.input.jump=true;step(2);const high=p.z,ceil=ceilingHeightAt(m,p.x,p.y,3,0)
  ok(high>.5&&high+1.55<=ceil+.001,'actual game: rise stops at ceiling')
  ok(eng.input.jump,'held jump is not consumed')
  eng.input.jump=false;step(1);ok(p.z===high,'actual game: released input hovers')
  eng.input.crouch=true;step(2);ok(p.z>=-.01&&p.z<.04,'actual game: descend stops at floor')
  ok(!p.crouching,'descent does not shrink the collision body')
  eng.input.crouch=false;p.z=.5
  let wallX=p.x
  while(wallX<m.w-1&&canFlyOccupy(m,wallX,p.y,.5,3))wallX+=.05
  eng.input.mx=1;eng.input.my=0;step(12)
  ok(p.x<=wallX+.05,'actual game: horizontal flight stops at obstacle')
  const blocked=p.x;eng.dev.noclip=true;step(1);ok(p.x>blocked+3,'actual game: noclip passes the same obstacle')
  eng.input.mx=0;eng.input.jump=true;step(3);ok(p.z>ceil,'actual game: noclip passes ceiling')
  eng.input.jump=false;p.x=40.25;p.y=25.5;p.z=.7;eng.dev.noclip=false
  eng.devSetFlight(false);step(2);ok(p.z<.04,'actual game: disabling flight restores gravity')
  eng.devEnabled=false;eng.devSetFlight(true);ok(!eng.dev.fly,'flight cannot be enabled outside developer mode')
  eng.devEnabled=true;eng.devSetFlight(false);eng.input.mx=eng.input.my=0
  await tick()
  return {checks,ceiling:ceil,stoppedAt:high,wallX}
}
