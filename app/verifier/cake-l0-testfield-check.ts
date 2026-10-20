import {l0FieldContains,l0FieldIntersects} from '../src/game/world/l0TestField'
import {l0Sample,type L0Rect} from '../src/game/world/l0Architecture'
import {canOccupy} from '../src/game/core/player'
import {floorHeight} from '../src/game/world/mapgen'
import {captureL0} from '../src/game/engine/l0State'

const sleep=(ms:number)=>new Promise(r=>setTimeout(r,ms))
const until=async(f:()=>unknown,label:string)=>{const start=performance.now();while(!f()){if(performance.now()-start>90000)throw Error('Timeout '+label);await sleep(100)}}
const buttons=()=>[...document.querySelectorAll('button')]
const key=(code:string,key:string)=>{window.dispatchEvent(new KeyboardEvent('keydown',{code,key,bubbles:true}));window.dispatchEvent(new KeyboardEvent('keyup',{code,key,bubbles:true}))}

export async function mount(app:any){
 const e=app.engine,r=app.renderer(),checks:string[]=[],memory:any[]=[]
 const ok=(v:unknown,label:string)=>{if(!v)throw Error(label);checks.push(label)}
 let field:L0Rect
 e.devEnabled=true;e.dev.god=true;e.dev.frozenAI=true;e.dev.statLock=true
 async function warm(){
  const start=performance.now();let stable=performance.now(),last=''
  while(true){
   const m=e.map,inf=m.inf,p=e.player,reach=(r.fogEnabled?Math.min(r.camera.far,r.scene.fog?.far??60):r.camera.far)+32
   const missing=[...inf.chunks.values()].some((c:any)=>{const x=c.cx*32-inf.ox,y=c.cy*32-inf.oy;return Math.max(x-p.x,0,p.x-x-32)**2+Math.max(y-p.y,0,p.y-y-32)**2<=reach*reach&&!r.chunkGroups.has(c.key)})
   const signature=JSON.stringify([r.chunkGroups.size,r.three.info.memory,r.three.info.programs.length])
   if(missing||r.cityChunkTask||r.finiteTask||r.precompileRunning||r.precompileDirty||r.precompileTimer!==null||r.retiredWorld.length||r.retiredTextures.size||signature!==last){stable=performance.now();last=signature}
   if(performance.now()-start>=1800&&performance.now()-stable>700)return
   if(performance.now()-start>90000)throw Error('Field warmup timeout '+signature)
   await sleep(100)
  }
 }
 function view(){app.look.yaw=.42;app.look.pitch=-.03;app.look.roll=0;r.setFov(72);e.player.flashlight=false}
 const status=()=>({seed:e.seed,mapSeed:e.mapSeed,mode:app.mode,field,player:[e.player.x+e.map.inf.ox,e.player.y+e.map.inf.oy,e.player.z],look:[app.look.yaw,app.look.pitch],fov:r.camera.fov,origin:[e.map.inf.ox,e.map.inf.oy],resources:{...r.three.info.memory,programs:r.three.info.programs.length},chunks:e.map.inf.chunks.size})
 const inspect=(label:string)=>{
  const m=e.map,inf=m.inf
  ok(!m.structures.some((s:any)=>s.solid&&l0FieldIntersects(field,{...s,x:s.x+inf.ox,y:s.y+inf.oy})),label+': cleared thin walls and colliders')
  const lamps=[...inf.chunks.values()].flatMap((c:any)=>c.l0?.lamps??[]).filter((p:any)=>l0FieldContains(field,p.x,p.y))
  ok(lamps.length===100&&new Set(lamps.map((p:any)=>`${p.x},${p.y}`)).size===100&&lamps.every((p:any)=>!p.off&&!p.red),label+': one hundred lit fixtures')
  let samples=0
  for(let y=field.y+1;y<field.y+79;y+=7)for(let x=field.x+1;x<field.x+79;x+=7){
   const px=x-inf.ox,py=y-inf.oy,env=l0Sample(m,px,py)
   if(!canOccupy(m,px,py)||floorHeight(m,px,py)!==0||!env||env.effect!=='none'||env.arch!==0)throw Error(label+' floor/collision/region at '+x+','+y)
   samples++
  }
  ok(samples>100,label+': walkable flat floor and neutral materials across chunk seams')
  ok(!r.three.getContext().isContextLost(),label+': WebGL context alive')
 }
 const before=async()=>{
  const m=e.map,inf=m.inf,p=e.player,cx=Math.max(42,Math.min(m.w-42,Math.round(p.x+48))),cy=Math.max(42,Math.min(m.h-42,Math.round(p.y)))
  const baselineField={x:inf.ox+cx-40,y:inf.oy+cy-40,w:80,h:80}
  // Exact pre-fix function snapshot; only the isolated verifier imports it.
  const baseline=await import('./fixtures/l0-testfield-before')
  baseline.beforeTestField(e);e.updateInfiniteWindow();view();await warm()
  const stale=[...inf.chunks.values()].reduce((n:number,c:any)=>n+(c.l0?.walls.filter((w:any)=>l0FieldIntersects(w,baselineField)).length??0),0)
  ok(stale>0,'Pre-fix function reproduces remaining rendered thin walls after tile clearing')
  return{...status(),baselineField,remainingWalls:stale,baseline:'Exact devTestField snapshot before this fix; current renderer'}
 }
 const open=async()=>{
  e.loadLevel(0,{mapSeed:7391,firstVisit:false});e.introT=0;e.devEnabled=true;e.dev.god=true;e.dev.frozenAI=true;e.dev.statLock=true
  view();await warm()
  document.querySelector<HTMLButtonElement>('[aria-label="展开开发者面板"]')?.click()
  await until(()=>buttons().some(b=>b.textContent?.trim()==='传送'),'developer tabs')
  buttons().find(b=>b.textContent?.trim()==='传送')!.click()
  await until(()=>buttons().some(b=>b.textContent?.includes('测试场地（L0）')),'L0 test field button')
  buttons().find(b=>b.textContent?.includes('测试场地（L0）'))!.click()
  await until(()=>e.map.inf.l0TestField,'test field applied')
  field={...e.map.inf.l0TestField};view();await warm()
  ok(field.w===80&&field.h===80,'Actual developer panel activates the 80x80 test field')
  inspect('Initial field')
  return status()
 }
 const icon=async()=>{
  e.player.hotbar[0]={type:'velvetcake',count:1};e.player.selected=0
  document.querySelector<HTMLButtonElement>('[aria-label="收起开发者面板"]')?.click()
  await until(()=>document.querySelector<HTMLImageElement>('img[src$="item_velvetcake.png"]')?.naturalWidth===128,'hotbar cake PNG')
  ok(!!document.querySelector<HTMLImageElement>('img.pixel-icon[src$="item_velvetcake.png"]'),'Production hotbar uses the new pixel image')
  key('KeyI','i');await until(()=>!!document.querySelector('.wb-tabs[role="tablist"]'),'inventory')
  await sleep(500)
  const icons=[...document.querySelectorAll<HTMLImageElement>('img[src$="item_velvetcake.png"]')]
  ok(!!document.querySelector('.wb-tabs')&&icons.length>0&&icons.every(i=>i.complete&&i.naturalWidth===128&&i.naturalHeight===128),'Inventory and hotbar load the 128x128 PNG without fallback')
  return{...status(),icons:icons.map(i=>({src:i.getAttribute('src'),size:[i.naturalWidth,i.naturalHeight],display:[i.width,i.height]}))}
 }
 const stream=async()=>{
  document.querySelector<HTMLButtonElement>('.set-close[aria-label="关闭"]')!.click();await until(()=>!document.querySelector('.wb-tabs'),'inventory closed');await sleep(300)
  const inf=e.map.inf,center={x:field.x+40,y:field.y+40},before={x:e.player.x+inf.ox,y:e.player.y+inf.oy}
  e.input.mx=1;e.input.my=0;app.look.yaw=0;app.look.pitch=0;r.applyView(e)
  for(let i=0;i<400;i++)e.updateMovement(1/60,{dmg:1,drain:1},false)
  e.input.mx=0
  const moved=Math.hypot(e.player.x+inf.ox-before.x,e.player.y+inf.oy-before.y)
  ok(moved>12,'Real movement crosses chunk seams without an invisible wall')
  const id=1999903;e.map.items.push({id,type:'velvetcake',x:e.player.x+1,y:e.player.y})
  e.player.x=center.x+320-inf.ox;e.player.y=center.y-inf.oy;e.updateInfiniteWindow();await warm()
  ok(![...inf.chunks.values()].some((c:any)=>l0FieldContains(field,c.cx*32+16,c.cy*32+16)),'Streaming removes the test-field chunks from the live window')
  e.player.x=center.x-inf.ox;e.player.y=center.y-inf.oy;e.updateInfiniteWindow();view();await warm()
  inspect('Reloaded field')
  ok(e.map.items.filter((it:any)=>it.id===id).length===1,'A dropped cake returns once after unloading/reloading')
  ok(!JSON.stringify(captureL0(e)).includes('testField'),'Temporary field is absent from the serialized world')
  return{...status(),walkedMetres:moved}
 }
 const finish=async()=>{
  if(!field)return{checks,status:status()}
  for(let i=0;i<3;i++){
   ok(e.devTestField(),'Repeated test-field activation '+(i+1));view();await warm();memory.push({...r.three.info.memory})
  }
  ok(memory[1].geometries===memory[2].geometries&&memory[1].textures===memory[2].textures,'Repeated field rebuilds stabilize geometry and texture counts')
  inspect('Reused field')
  return{checks,memory,status:status()}
 }
 return{before,open,icon,stream,finish,result:()=>({checks,memory,status:status()})}
}
