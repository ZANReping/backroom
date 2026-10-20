import {L1_PHOTO_ANCHORS} from '../src/game/world/l1Spatial'
export function attachL1Controls(qa:any){
 const {eng,r,look}=qa,aside=document.querySelector('aside')!,status=document.querySelector('#status')!
 document.title='Level 1 · Reference & lighting verification'
 aside.querySelector('b')!.textContent='Level 1 对照验收 · 种子 20261006'
 const select=document.querySelector<HTMLSelectElement>('#anchors')!;select.replaceChildren()
 for(const a of L1_PHOTO_ANCHORS){const o=document.createElement('option');o.value=a.id;o.textContent=a.file;select.append(o)}
 const show=async(id:string)=>{
  const a=L1_PHOTO_ANCHORS.find(a=>a.id===id)!;select.value=id;await qa.scene(1);qa.moveTo(a.x,a.y);eng.player.z=a.z
  look.yaw=a.yaw;look.pitch=a.pitch;look.roll=a.roll;r.setFov(a.fov,35);qa.freezeRenderTime(15)
  if(a.blackout){eng.blackoutPendingDur=60;eng.applyBlackout()}
  status.textContent=`${id} · 构建中…`;await qa.warm();status.textContent=`${id} · ${a.width}×${a.height} · 取景已就绪`
 };select.onchange=()=>void show(select.value)
 const controls=document.createElement('p');aside.append(controls)
 const button=(text:string,action:()=>unknown)=>{const b=document.createElement('button');b.textContent=text;b.onclick=()=>void action();controls.append(b);return b}
 const report=document.createElement('pre');report.style.cssText='max-height:220px;overflow:auto;white-space:pre-wrap';aside.append(report)
 const live=document.createElement('small');live.id='l1-live';aside.append(live)
 setInterval(()=>{live.textContent=JSON.stringify({pending:qa.pendingWork(),groups:r.chunkGroups.size,frame:qa.stats().median})},1000)
 button('生成当前参考画幅',async()=>{
  document.querySelector('#l1-single')?.remove()
  await qa.warm();const a=L1_PHOTO_ANCHORS.find(a=>a.id===select.value)!,scale=Math.min(1,1920/a.width,1920/a.height)
  const img=document.createElement('img');img.id='l1-single';img.alt=a.id;img.dataset.camera=JSON.stringify(a);img.dataset.mode=(document.querySelector('#mode') as HTMLSelectElement).value
  img.src=qa.captureFrame(Math.round(a.width*scale),Math.round(a.height*scale));img.style.width='100%';aside.append(img)
 })
 button('生成全部参考画幅',async()=>{
  document.querySelector('#l1-evidence')?.remove()
  const evidence=document.createElement('details');evidence.id='l1-evidence';evidence.append(Object.assign(document.createElement('summary'),{textContent:'18 个实际场景截图'}));aside.append(evidence)
  for(const a of L1_PHOTO_ANCHORS){
   await show(a.id);select.value=a.id
   const scale=Math.min(1,1920/a.width,1920/a.height),width=Math.round(a.width*scale),height=Math.round(a.height*scale)
   const img=document.createElement('img');img.alt=a.id;img.dataset.camera=JSON.stringify(a);img.src=qa.captureFrame(width,height);img.style.width='100%';evidence.append(img)
  }
  evidence.dataset.complete='true';status.textContent='18 个参考画幅已生成'
 })
 button('普通种子与接缝取景',async()=>{
  document.querySelector('#l1-normal-evidence')?.remove()
  const evidence=document.createElement('details');evidence.id='l1-normal-evidence';evidence.append(Object.assign(document.createElement('summary'),{textContent:'普通种子与接缝实机图'}));aside.append(evidence)
  const {restoreSavedPlayerPosition}=await import('../src/game/engine/level')
  for(const seed of [1,42,7391])for(const [x,y,yaw]of [[30.5,24.5,.7],[34.5,24.5,Math.PI+.7]]){
   await qa.scene(1,'open',seed);qa.moveTo(x,y);restoreSavedPlayerPosition(eng,{x,y});look.yaw=yaw;look.pitch=.025;r.setFov(72);qa.freezeRenderTime(15);await qa.warm()
   const inf=eng.map.inf,pose={seed,x:eng.player.x+inf.ox,y:eng.player.y+inf.oy,yaw,pitch:.025,fov:72},img=document.createElement('img')
   img.alt=`seed-${seed}-${x}`;img.dataset.camera=JSON.stringify(pose);img.src=qa.captureFrame(1280,720);evidence.append(img)
  }
  evidence.dataset.complete='true';status.textContent='普通种子与接缝取景完成'
 })
 button('检查切区与画质回收',async()=>{
  const rounds=[]
  for(let i=0;i<4;i++){
   for(const id of ['garden','storage','gothic','parking-common'])await show(id)
   qa.mode('classic');await qa.warm();qa.mode('realistic');await qa.warm()
   rounds.push(qa.stats());report.textContent=JSON.stringify({resources:rounds},null,2)
  }
  report.dataset.resourcesComplete='true'
 })
 button('切换停电',()=>{if(eng.blackoutT>0)eng.endBlackout();else{eng.blackoutPendingDur=60;eng.applyBlackout()}status.textContent=eng.blackoutT>0?'原生照明已停电':'照明已恢复'})
 button('测量当前视角（五轮）',async()=>{
  report.textContent='预热与测量中…';await qa.warm();const rounds=[]
  for(let i=0;i<5;i++)rounds.push(await qa.sample(120))
  report.textContent=JSON.stringify({view:select.value,viewport:[innerWidth,innerHeight],build:qa.buildStats(),rounds},null,2)
 })
 button('功能回归',async()=>{
  report.textContent='验证中…'
  try{const {verifyL1Runtime}=await import('./l1-remake-runtime');report.textContent=JSON.stringify(await verifyL1Runtime(qa),null,2)}catch(e){report.textContent=String(e);console.error(e)}
 })
 button('停电曝光与光柱序列',async()=>{
  await show('garden');r.setEyeAdaptation(true)
  document.querySelector('#l1-power-evidence')?.remove()
  const evidence=document.createElement('details');evidence.id='l1-power-evidence';evidence.append(Object.assign(document.createElement('summary'),{textContent:'曝光、光柱与停电实机序列'}));aside.append(evidence)
  const rows:any[]=[],wait=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms))
  const record=(name:string)=>{const img=document.createElement('img');img.alt=name;img.src=qa.captureFrame(1280,720);evidence.append(img);rows.push({name,exposure:r.eyeAdaptation.exposure,target:r.eyeAdaptation.target,glare:r.eyeAdaptation.glare,shafts:r.l1Shafts.mesh.visible?r.l1Shafts.mesh.count:0,groups:[...r.chunkGroups].map(([k,v]:any)=>[k,v.group.id])});report.textContent=JSON.stringify(rows,null,2)}
  qa.freezeRenderTime(16);await wait(1200);record('native-on')
  eng.blackoutWarnT=2;qa.freezeRenderTime(17);await wait(500);record('warning');eng.blackoutWarnT=0
  eng.blackoutPendingDur=60;eng.applyBlackout();qa.freezeRenderTime(18);await wait(200);record('blackout-200ms');await wait(3800);record('blackout-4s')
  eng.endBlackout();qa.freezeRenderTime(23);await wait(100);record('restored-100ms');await wait(1000);record('restored-1100ms')
  evidence.dataset.complete='true'
 })
 button('相同坐标性能对照',async()=>{
  report.textContent='六场景预热与测量中…'
  const baseline=await(await fetch('/reports/l1-remake/baseline/performance.json')).json(),rows=[]
  for(const row of baseline){
   await qa.scene(1);qa.moveTo(row.camera.x,row.camera.y);look.yaw=row.camera.yaw;look.pitch=row.camera.pitch;r.setFov(row.camera.fov)
   await qa.warm();const rounds=[];for(let i=0;i<5;i++)rounds.push(await qa.sample(120))
   rows.push({variant:row.variant,camera:row.camera,build:qa.buildStats(),rounds});report.textContent=JSON.stringify(rows,null,2)
  }
  report.dataset.complete='true'
 })
 button('六区域性能验收',async()=>{
  report.dataset.complete='false';const rows=[]
  for(const id of ['parking-common','storage','gothic','ouroboros','garden','path-corridor']){
   await show(id);const rounds=[];for(let i=0;i<5;i++)rounds.push(await qa.sample(120))
   const a=L1_PHOTO_ANCHORS.find(a=>a.id===id)!,inf=eng.map.inf
   const actualVariant=inf.chunks.get(`${Math.floor(a.x/32)},${Math.floor(a.y/32)}`)?.variant
   if(actualVariant!==a.variant)throw Error(`Unexpected region: ${id} / ${actualVariant}`)
   rows.push({variant:actualVariant,anchor:id,camera:a,viewport:[innerWidth,innerHeight],renderSize:[r.three.domElement.width,r.three.domElement.height],build:qa.buildStats(),rounds});report.textContent=JSON.stringify(rows,null,2)
  }
  report.dataset.complete='true'
 })
 const params=new URLSearchParams(location.search);void show(params.get('anchor')??L1_PHOTO_ANCHORS[0].id)
}
