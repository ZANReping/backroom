import { Engine } from '../src/game/engine'
import { getRenderer,look } from '../src/game/renderer'
import { SETTLEMENTS } from '../src/game/content/settlementBlueprints'
import { canOccupy } from '../src/game/core/player'
import { furnishings } from '../src/game/world/settlement'
import {tradeParts,isTradeKind} from '../src/game/content/tradeDecor'
const canvas=document.querySelector('canvas')!,e=new Engine(),renderer=getRenderer(canvas)
const base=document.querySelector<HTMLSelectElement>('#base')!,room=document.querySelector<HTMLSelectElement>('#room')!,plan=document.querySelector<HTMLDivElement>('#plan')!
const bntgOnly=new URLSearchParams(location.search).has('bntg')
const ids=bntgOnly?[102]:Object.keys(SETTLEMENTS).map(Number)
let id=bntgOnly?102:101,mode:'classic'|'realistic'='classic',last=performance.now(),times:number[]=[],view='entry'
const runs:unknown[]=[]
e.seed=424242;e.paused=true;e.dev.god=true;e.dev.frozenAI=true;e.dev.statLock=true
renderer.resize(1920,1080,1);renderer.setBloomFx(false);renderer.setTextureQuality(2)
canvas.style.width='100vw';canvas.style.height='100vh'
for(const b of Object.values(SETTLEMENTS))base.add(new Option(b.name,String(b.level)))
function position(x:number,y:number){const m=e.map!;for(let r=0;r<10;r++)for(let dy=-r;dy<=r;dy++)for(let dx=-r;dx<=r;dx++)if(canOccupy(m,x+dx,y+dy,.3,{z:0,band:0,crouch:false})){e.player.x=x+dx;e.player.y=y+dy;e.player.z=0;e.player.floor=0;return}}
function selectRoom(rid:string){const r=SETTLEMENTS[id].rooms.find(r=>r.id===rid)!;room.value=rid;position(r.x+r.w/2,r.y+r.h-2);look.yaw=0;look.pitch=.05;view=rid;times=[];plan.style.display='none'}
function load(){e.loadLevel(id,{mapSeed:424242,firstVisit:false});base.value=String(id);e.introT=0;e.player.flashlight=false;room.replaceChildren();for(const r of SETTLEMENTS[id].rooms)room.add(new Option(r.name,r.id));entry()}
function entry(){position(e.map!.spawn.x+.5,e.map!.spawn.y+.5);look.yaw=Math.PI;look.pitch=.02;times=[];view='entry';plan.style.display='none'}
function publicView(){const b=SETTLEMENTS[id];position(b.focus.x,b.focus.y);look.yaw=Math.PI;look.pitch=.02;times=[];view='public';plan.style.display='none'}
base.onchange=()=>{record();id=Number(base.value);load()};room.onchange=()=>selectRoom(room.value)
document.querySelector<HTMLButtonElement>('#entry')!.onclick=entry
document.querySelector<HTMLButtonElement>('#core')!.onclick=()=>selectRoom(({101:'radio',102:'vault_entry',103:'lab_a',104:'dining',116:'casefiles'} as Record<number,string>)[id]??SETTLEMENTS[id].rooms[0].id)
document.querySelector<HTMLButtonElement>('#living')!.onclick=()=>selectRoom(SETTLEMENTS[id].rooms.find(r=>r.style==='bedroom'||r.style==='residential')!.id)
document.querySelector<HTMLButtonElement>('#public')!.onclick=publicView
document.querySelector<HTMLButtonElement>('#up')!.onclick=()=>{publicView();look.pitch=.8;view='public:up';times=[]}
document.querySelector<HTMLButtonElement>('#mode')!.onclick=()=>{record();mode=mode==='classic'?'realistic':'classic';renderer.setLightMode(mode);times=[]}
document.querySelector<HTMLButtonElement>('#planButton')!.onclick=()=>{
 const b=SETTLEMENTS[id],colors:Record<string,string>={lab:'#62928d',clinic:'#85b4a8',bedroom:'#ad8f63',residential:'#ac8e67',vault:'#8c966b',archive:'#818cb2'}
 const rect=(r:{x:number;y:number;w:number;h:number},fill:string,stroke='none')=>`<rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" fill="${fill}" stroke="${stroke}"/>`
 const furniture=b.decorations?b.decorations.filter(s=>isTradeKind(s.kind)&&!['trade_floor','trade_ceiling','trade_beam','trade_roof','trade_duct'].includes(s.kind)).map(s=>`<g transform="rotate(${-Number(s.data?.deg??0)} ${s.x+s.w/2} ${s.y+s.h/2})">${tradeParts(s).filter(p=>p.solid).map(p=>rect({x:s.x+p.x,y:s.y+p.y,w:p.w,h:p.d},'#444f4b')).join('')}</g>`).join(''):b.rooms.flatMap(r=>furnishings(r).filter(f=>f.solid).map(f=>rect(f,'#4f5555'))).join('')
 plan.innerHTML=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${b.size} ${b.size}"><rect width="${b.size}" height="${b.size}" fill="#303534"/>${b.shells.map(s=>rect(s,'#858b88')).join('')}${b.corridors.map(c=>rect(c,'#c5cbc6')).join('')}${b.rooms.map(r=>`${rect(r,colors[r.style]??'#78958b')}<text x="${r.x+1}" y="${r.y+3}" font-size="1.5" fill="#17201f">${r.name}</text>`).join('')}${b.partitions.map(p=>rect(p,p.material==='glass'?'#8ec6c4':'#525b59')).join('')}${b.doors.map(d=>rect(d,'#e69a40')).join('')}${b.services.map(s=>`<circle cx="${s.x}" cy="${s.y}" r=".45" fill="#47b878"/>`).join('')}${furniture}${b.exits.map(p=>`<circle cx="${p.x}" cy="${p.y}" r="1.5" fill="#b83728"/>`).join('')}</svg>`;plan.style.display='block';view='plan'
}
function stats(){const a=[...times].sort((a,b)=>a-b),gl=renderer.three.getContext(),ext=gl.getExtension('WEBGL_debug_renderer_info');return {id,mode,view,frames:a.length,medianMs:a[Math.floor(a.length*.5)],p95Ms:a[Math.floor(a.length*.95)],draws:renderer.three.info.render.calls,triangles:renderer.three.info.render.triangles,memory:{...renderer.three.info.memory},resolution:[canvas.width,canvas.height],gpu:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER)}}
function record(){if(times.length>10)runs.push(stats())}
document.querySelector<HTMLButtonElement>('#export')!.onclick=()=>{record();const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify(runs,null,2)],{type:'application/json'}));a.download='settlements-performance.json';a.click();URL.revokeObjectURL(a.href)}
load()
const nextFrames=(count:number)=>new Promise<void>(resolve=>{const next=()=>--count>0?requestAnimationFrame(next):resolve();requestAnimationFrame(next)})
document.querySelector<HTMLButtonElement>('#memory')!.onclick=async()=>{
 const button=document.querySelector<HTMLButtonElement>('#memory')!;button.disabled=true;const samples:unknown[]=[]
 try{for(let cycle=0;cycle<4;cycle++)for(const nextId of ids){id=nextId;base.value=String(id);load();await nextFrames(60);samples.push({cycle,...stats()});button.textContent=`重复载入 ${cycle+1}/4 · ${id}`}
 await fetch('/__settlement_capture',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:`settlement-${id}-${mode}-memory.json`,data:JSON.stringify(samples,null,2)})});button.textContent='重复载入记录已保存'
 }finally{button.disabled=false}
}
document.querySelector<HTMLButtonElement>('#captureAll')!.onclick=async()=>{
 const button=document.querySelector<HTMLButtonElement>('#captureAll')!;button.disabled=true
 try{
  for(const nextMode of ['classic','realistic'] as const){mode=nextMode;renderer.setLightMode(mode)
    for(const nextId of ids){id=nextId;base.value=String(id);load();const mapStats:unknown[]=[]
    const save=async(ext:string,data:string,kind:string)=>{const response=await fetch('/__settlement_capture',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:`settlement-${id}-${mode}-${kind}.${ext}`,data})});if(!response.ok)throw new Error(await response.text())}
    for(const shot of (id===102?['entry','hall-up','street','street-up','vault','vault-up','logistics','logistics-up','living','living-up','plan']:['entry','public','core','living','up','plan'])){
     button.textContent=`正在导出 ${id} / ${mode} / ${shot}`
     if(id===102&&shot!=='plan'){
      const key=shot.replace('-up',''),point=({entry:[40,11,Math.PI],hall:[40,11,Math.PI],street:[17,27,Math.PI],vault:[40,29,Math.PI],logistics:[60,60,Math.PI],living:[35,63,Math.PI/2]} as Record<string,number[]>)[key]!
      position(point[0],point[1]);look.yaw=point[2];look.pitch=shot.endsWith('-up')?.65:.03;plan.style.display='none';times=[];view=shot
     }else document.querySelector<HTMLButtonElement>(shot==='plan'?'#planButton':`#${shot}`)!.click()
     await nextFrames(60)
     if(shot==='plan')await save('svg',plan.innerHTML,shot)
     else {renderer.render(canvas,e,{grain:false,flicker:0,shake:false},0);await save('png',canvas.toDataURL('image/png'),shot)}
     if(shot!=='plan')mapStats.push(stats())
    }
    await save('json',JSON.stringify(mapStats,null,2),'stats')
   }
  }
  button.textContent='对照图和性能记录已保存'
 }catch(error){button.textContent=`导出失败：${error}`}finally{button.disabled=false}
}
function frame(now:number){const ms=now-last;last=now;times.push(ms);if(times.length>240)times.shift();renderer.applyView(e);renderer.render(canvas,e,{grain:false,flicker:0,shake:false},Math.min(.05,ms/1000));if(times.length%30===0)document.querySelector('#stats')!.textContent=JSON.stringify(stats());requestAnimationFrame(frame)}
requestAnimationFrame(frame)
