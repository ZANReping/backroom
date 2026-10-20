import {NPCS,npcAvatar} from '../src/game/content/npcs'
import {L11_PEOPLE} from '../src/game/content/l11People'
import {getAvatar} from '../src/game/core/avatar'
import {npcPortraitStats,requestNpcPortrait} from '../src/components/npcPortrait'
import {DEFAULT_AVATAR} from '../src/game/core/avatar'
const frame=()=>new Promise<void>(r=>requestAnimationFrame(()=>r())),wait=(n=80)=>new Promise(r=>setTimeout(r,n))
async function until(test:()=>unknown){for(let i=0;i<400;i++){if(test())return;await wait()}throw Error('UI wait timed out')}
const findButton=(text:string)=>[...document.querySelectorAll('button')].find(b=>b.textContent?.trim()===text)
export async function setupPeopleUI(){
 const ui=(window as any).__ui,definitions=[...new Map([...Object.values(NPCS),...L11_PEOPLE].map(n=>[n.id,n])).values()]
 ui.engine.knownNpcs=definitions;ui.memory.set('br_codex',JSON.stringify(Object.fromEntries(definitions.map(n=>['npc_'+n.id,true]))))
 let captures=0;const original=HTMLCanvasElement.prototype.toDataURL
 HTMLCanvasElement.prototype.toDataURL=function(...args){captures++;return original.apply(this,args)}
 const longTasks:{start:number;duration:number}[]=[];const observer=new PerformanceObserver(list=>{for(const v of list.getEntries())longTasks.push({start:v.startTime,duration:v.duration})});observer.observe({type:'longtask',buffered:true})
 const people=async()=>{
  ui.show('inventory');await until(()=>document.querySelector('.wb-body'));[...document.querySelectorAll<HTMLButtonElement>('.wb-tab')].find(b=>b.textContent?.trim().startsWith('图鉴'))!.click();await until(()=>findButton('人士'));captures=0;const start=performance.now();findButton('人士')!.click();await frame();await frame();const firstPaint=performance.now()-start;await wait(3500)
  return {people:definitions.length,firstPaint,captures,images:document.querySelectorAll('img').length,longTasks:longTasks.filter(v=>v.start>=start),maxTask:Math.max(0,...longTasks.filter(v=>v.start>=start).map(v=>v.duration)),portraits:npcPortraitStats()}
 }
 const close=async()=>{ui.show('hud');await frame();await frame()}
 const editor=async()=>{ui.show('avatar');await until(()=>document.querySelector('canvas'));await wait(1000);return{tabs:[...document.querySelectorAll('[role=tab]')].map(t=>t.textContent),canvas:!!document.querySelector('canvas')}}
 const matrix=()=>{
  const canvas=document.querySelector('canvas')!,gl=canvas.getContext('webgl2')!,program=gl.getParameter(gl.CURRENT_PROGRAM),loc=program&&gl.getUniformLocation(program,'modelViewMatrix')
  if(!loc)throw Error('Preview camera matrix missing');return Array.from(gl.getUniform(program,loc) as Float32Array)
 }
 const editorChecks=async()=>{
  let checks=0;const ok=(v:unknown,s:string)=>{if(!v)throw Error(s);checks++}
  await editor();const canvas=document.querySelector('canvas')!,gl=canvas.getContext('webgl2')!,start=matrix();await wait(600)
  ok(matrix().every((v,i)=>Math.abs(v-start[i])<.0001),'No automatic rotation while idle');ok(canvas.dataset.focus==='head','Head tab focuses head')
  const body=[...document.querySelectorAll<HTMLButtonElement>('[role=tab]')].find(b=>b.textContent==='身体')!;body.click();await wait(250)
  ok(canvas===document.querySelector('canvas')&&!gl.isContextLost(),'Tab switch reuses WebGL canvas');ok(canvas.dataset.focus==='body','Body tab focuses body');ok(Math.abs(matrix()[14]-start[14])>.4,'Body camera moves away from head framing')
  body.focus();body.dispatchEvent(new KeyboardEvent('keydown',{key:'Home',bubbles:true}));await wait(150);ok(canvas.dataset.focus==='head'&&document.activeElement?.textContent==='头部','Tab keyboard navigation')
  const select=document.querySelector<HTMLSelectElement>('select[aria-label="发型"]')!;select.value='12';select.dispatchEvent(new Event('change',{bubbles:true}));await wait(200)
  ok(getAvatar().hair===12,'Editing is saved');ok(canvas===document.querySelector('canvas')&&!gl.isContextLost(),'Editing reuses WebGL context')
  const x=matrix();await wait(400);ok(matrix().every((v,i)=>Math.abs(v-x[i])<.0001),'Edited model remains stationary');return{checks,avatar:getAvatar(),matrix:x}
 }
 const scrollPeople=async()=>{const before=npcPortraitStats();const body=document.querySelector('.wb-body')!;body.scrollTop=body.scrollHeight;await wait(1400);return{before,after:npcPortraitStats(),bottom:body.scrollTop}}
 const cleanupChecks=async()=>{
  await close();await wait(100);const before=npcPortraitStats(),cancel=requestNpcPortrait({avatar:{...DEFAULT_AVATAR,hairColor:'#126789'},size:83,framing:'identity'},()=>{throw Error('Cancelled portrait callback fired')});cancel();await frame();await wait(100)
  if(npcPortraitStats().queued!==0||npcPortraitStats().builds!==before.builds)throw Error('Cancelled portrait still generated')
  return npcPortraitStats()
 }
 const cycles=async()=>{const samples=[];for(let i=0;i<3;i++){await close();samples.push(await people())}if(samples.some(v=>v.captures!==0||v.portraits.queued!==0))throw Error('Reopening regenerated cached portraits');return samples}
 const special=async()=>{const image=[...document.querySelectorAll<HTMLImageElement>('img')].find(i=>i.alt===NPCS.tiny.name+' 的证件照');if(!image)throw Error('Tiny record missing');image.scrollIntoView({block:'center'});await wait(1400);if(!image.src.startsWith('data:image/png'))throw Error('Tiny portrait not ready');return npcPortraitStats()}
 const examples=async()=>{const images=[];for(const id of ['lan','tom','aiko','kowalski','martin','tiny']){const def=NPCS[id],src=await new Promise<string>(resolve=>requestNpcPortrait({avatar:npcAvatar(def),npcId:id,npcDef:def,size:240,framing:'identity'},resolve));if(!src)throw Error('Portrait example failed '+id);images.push({id,src})}return images}
 Object.assign(window,{peopleUI:{people,close,editor,findButton,matrix,editorChecks,scrollPeople,cleanupChecks,cycles,special,examples}})
 return{people:definitions.length}
}
