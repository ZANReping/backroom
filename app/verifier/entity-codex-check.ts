import {ENTITIES,entityForms} from '../src/game/entities'
import {entityPortraitStats,requestEntityPortrait} from '../src/components/entityPortrait'
const sleep=(ms=60)=>new Promise(r=>setTimeout(r,ms))
const until=async(fn:()=>unknown,label:string)=>{for(let i=0;i<600;i++){if(fn())return;await sleep(50)}throw Error('Timeout '+label)}
const click=(el:Element|undefined|null)=>{if(!el)throw Error('Missing UI action');(el as HTMLElement).click()}
const back=()=>[...document.querySelectorAll('button')].find(b=>b.textContent?.includes('返回图鉴'))
export function mount(app:any){
 const checks:string[]=[],records:any[]=[]
 const ok=(v:unknown,label:string)=>{if(!v)throw Error(label);checks.push(label)}
 const prepare=async()=>{
  await until(()=>!!document.querySelector('.codex-cat'),'actual game codex');click([...document.querySelectorAll('.codex-cat')].find(b=>b.textContent?.trim()==='实体'))
  await until(()=>document.querySelectorAll('[data-entity-card]').length>0,'entity category')
  ok(!document.querySelector('[data-entity-preview]'),'Entity list creates no model previews')
  ok(entityPortraitStats().builds===0,'Opening the list does not build every entity')
  ok(document.querySelectorAll('[data-entity-card]').length===Object.keys(ENTITIES).length-1,'Existing codex excludes only the internal activated form')
  return{stats:entityPortraitStats(),level:app.level,seed:app.engine.seed}
 }
 const select=async(type:string)=>{
  if(back()){click(back());await until(()=>!document.querySelector('[data-entity-preview]'),'return to list')}
  click(document.querySelector(`[data-entity-card="${type}"]`));await until(()=>!!document.querySelector(`[data-entity-preview="${type}"]`),'entity detail')
  const figure=document.querySelector<HTMLElement>(`[data-entity-preview="${type}"]`)!
  figure.scrollIntoView({block:'center'});await sleep(80);return figure
 }
 const open=async(type:string)=>{
  const figure=await select(type)
  await until(()=>figure.dataset.state!=='loading',type+' image')
  if(type==='malady'){ok(figure.dataset.state==='unavailable','Invisible entity has a truthful no-visible-body state');return{type,status:figure.dataset.state}}
  ok(figure.dataset.state==='ready','Model preview generated: '+type)
  const image=figure.querySelector('img')!;await image.decode();ok(image.naturalWidth===448&&image.naturalHeight===448,'Full resolution model image: '+type)
  ok(image.alt===`${ENTITIES[type].name}模型预览`,'Correct accessible specimen name: '+type)
  const c=document.createElement('canvas');c.width=c.height=64;const ctx=c.getContext('2d')!;ctx.drawImage(image,0,0,64,64)
  const pixels=ctx.getImageData(0,0,64,64).data;let opaque=0,minX=64,minY=64,maxX=0,maxY=0
  for(let y=0;y<64;y++)for(let x=0;x<64;x++)if(pixels[(y*64+x)*4+3]>20){opaque++;minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y)}
  ok(opaque>10,'Image contains rendered geometry rather than an empty canvas: '+type)
  if(type==='deathmoth')ok(maxX-minX>32&&maxY-minY>16,'Moth wings are visibly spread rather than an edge-on sliver')
  if(type==='thething')ok(maxX-minX>40,'Long body is readable in a broadside view')
  const fr=figure.getBoundingClientRect(),tr=document.querySelector('[data-entity-archive-text]')!.getBoundingClientRect()
  ok(fr.left>=tr.right+6,'Preview sits to the right of M.E.G. archive text: '+type)
  ok(fr.right<=document.querySelector('.wb-body')!.getBoundingClientRect().right+1,'Preview stays inside the actual archive panel: '+type)
  return{type,status:figure.dataset.state,pixels:opaque,silhouette:{w:maxX-minX+1,h:maxY-minY+1},bounds:{x:fr.x,y:fr.y,w:fr.width,h:fr.height},stats:entityPortraitStats()}
 }
 const all=async()=>{
  for(const type of Object.keys(ENTITIES).filter(t=>t!=='vmad'))records.push(await open(type))
  ok(entityPortraitStats().cached<=32&&entityPortraitStats().bytes<=6*1024*1024,'PNG cache obeys both entry and byte limits')
  return{records,stats:entityPortraitStats()}
 }
 const cycle=async(type:string,steps:number)=>{
  await open(type)
  const figure=document.querySelector<HTMLElement>(`[data-entity-preview="${type}"]`)!
  const seenForms=new Set<string>(),images:any[]=[]
  let lastAngle=figure.dataset.angle??'',lastSrc=figure.querySelector('img')!.src
  if(figure.dataset.form)seenForms.add(figure.dataset.form)
  for(let i=1;i<=steps;i++){
   const button=figure.querySelector<HTMLButtonElement>('button.entity-archive-image');ok(!!button&&!button.disabled,'Archive preview button available: '+type)
   click(button);await until(()=>figure.dataset.state==='ready'&&figure.dataset.view===String(i),`${type} view ${i}`)
   const image=figure.querySelector<HTMLImageElement>('img')!;await image.decode();ok(image.naturalWidth===448&&image.naturalHeight===448&&!!image.src,'Cycle image is a complete PNG: '+type+' '+i);ok(image.src!==lastSrc,'Cycle image changes: '+type+' '+i)
   ok(figure.dataset.angle!==lastAngle,'Cycle angle changes: '+type+' '+i);lastAngle=figure.dataset.angle??'';lastSrc=image.src
   const canvas=document.createElement('canvas');canvas.width=canvas.height=64;const ctx=canvas.getContext('2d')!;ctx.drawImage(image,0,0,64,64)
   const data=ctx.getImageData(0,0,64,64).data;let pixels=0;for(let p=3;p<data.length;p+=4)if(data[p]>20)pixels++
   ok(pixels>10,'Cycle image contains visible geometry: '+type+' '+i)
   if(i%4===0)ok(Number(figure.dataset.appearance)===i/4,'Cycle advances appearance after four angles: '+type+' '+i)
   if(figure.dataset.form){seenForms.add(figure.dataset.form);const form=entityForms(type).find(f=>f.id===figure.dataset.form);ok(!!form&&figure.querySelector('figcaption')!.textContent!.includes(form.name),'Preview identifies the actual registered form: '+type+' '+i)}
   images.push({view:i,angle:Number(figure.dataset.angle),appearance:Number(figure.dataset.appearance),form:figure.dataset.form,pixels})
  }
  ok(seenForms.size===entityForms(type).length,'Click tour reaches all registered forms: '+type)
  ok(entityPortraitStats().cached<=32&&entityPortraitStats().bytes<=6*1024*1024,'Click tour keeps the image cache bounded: '+type)
  return{type,steps,seenForms:[...seenForms],images,stats:entityPortraitStats()}
 }
 const cacheAndCancel=async()=>{
  await open('hound');const before=entityPortraitStats();await open('hound');const after=entityPortraitStats()
  ok(after.builds===before.builds&&after.hits>before.hits,'Reopening a cached entity does not rebuild its model')
  // Abort a cold request immediately, exactly as unmount cleanup does.
  let stale=false;const cancel=requestEntityPortrait('vmad',()=>{stale=true});cancel()
  await open('smiler');await until(()=>entityPortraitStats().queued===0&&!entityPortraitStats().active,'cancelled queue')
  ok(!stale,'Cancelled request never updates a different entity image')
  ok(document.querySelector('[data-entity-preview]')?.getAttribute('data-entity-preview')==='smiler','Rapid navigation retains the selected entity identity')
  return{before,after,stats:entityPortraitStats()}
 }
 const mobile=async()=>{await sleep(600);const record=await open('hound');ok(document.documentElement.scrollWidth<=innerWidth+1,'Touch layout has no horizontal overflow');return{record,viewport:[innerWidth,innerHeight],note:'Windows desktop Chrome touch emulation; not Android hardware'}}
 const closeAndRelease=async()=>{
  click(document.querySelector('.wb-head [aria-label="关闭"]'));await sleep(100)
  ok(!document.querySelector('[data-entity-preview]'),'Closing the actual game codex unmounts the preview')
  await until(()=>entityPortraitStats().queued===0&&!entityPortraitStats().active,'no queued preview jobs')
  // Cache remains useful after the shared studio has freed all GPU resources.
  await until(()=>!entityPortraitStats().studio,'automatic idle studio disposal')
  const released=entityPortraitStats();ok(!released.studio&&released.memory===null,'Idle studio automatically releases its WebGL context and GPU models')
  let cached=false;const builds=released.builds;requestEntityPortrait('hound',r=>{cached=r.status==='ready'})
  ok(cached&&entityPortraitStats().builds===builds&&!entityPortraitStats().studio,'Cached PNG works after GPU context release')
  return{released,stats:entityPortraitStats(),memoryKeys:[...app.memory.keys()]}
 }
 return{prepare,open,cycle,all,cacheAndCancel,mobile,closeAndRelease,result:()=>({checks:[...checks],records,stats:entityPortraitStats()})}
}
