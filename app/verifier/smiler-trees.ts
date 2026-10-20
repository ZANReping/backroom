import * as THREE from 'three'

const baseline = new URLSearchParams(location.search).has('baseline')
const root = baseline ? '/.cache/smiler-trees/baseline/src/game' : '/src/game'
const [{ makeEntity }, ai, pose, { buildStructure }, { structColliders }] = await Promise.all([
  import(/* @vite-ignore */root + '/entities/index.ts'), import(/* @vite-ignore */root + '/engine/smilerAI.ts'),
  import(/* @vite-ignore */root + '/entities/smilerPose.ts'), import(/* @vite-ignore */root + '/renderer/structures.ts'), import(/* @vite-ignore */root + '/world/mapgen.ts'),
])
const kinds = ['common', 'phantom', 'starved', 'canid', 'great']
const cases = kinds.flatMap(k => [k + '-windup', k + '-impact']).concat(['l9-street', 'l9-forms', 'l9-forms-back', 'l10-field', 'l10-forms', 'l10-forms-back', 'great-outdoor'])
const frame = () => new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
async function frames(n=12) { for(let i=0;i<n;i++) await frame() }
async function sampleFixed(qa:any){const running=qa.sample(120,1500);qa.freezeRenderTime(20);return await running}
const check=(ok:unknown,message:string)=>{if(!ok)throw Error(message)}
let gallery:THREE.Group|undefined, currentKind='', actor:any, point:any
export function setup(qa:any) { qa.hide(); qa.r.resize(1920,1080,1); return cases }

function aim(qa:any,x:number,y:number,z:number,tx:number,ty:number,height=1.55) {
  Object.assign(qa.eng.player,{x,y,z,vz:0,crouching:false,flashlight:true})
  qa.eng.camShake=0;qa.r.bobPhase=0
  qa.look.yaw=Math.atan2(x-tx,y-ty);qa.look.pitch=Math.atan2(height-(z+1.55),Math.hypot(tx-x,ty-y));qa.look.roll=0
}
function findCorridor(qa:any,distance:number) {
  const {eng,r}=qa,m=eng.map,ox=m.inf?.ox??0,oy=m.inf?.oy??0
  // Start near the already warmed player so no unrelated chunk is streamed.
  for(let radius=0;radius<32;radius+=2)for(let dy=-radius;dy<=radius;dy+=2)for(let dx=-radius;dx<=radius;dx+=2){
    const x=Math.floor(eng.player.x+dx)+.5,y=Math.floor(eng.player.y+dy)+.5
    if(x<4||y<4||x>m.w-4||y>m.h-4)continue
    for(const a of [0,Math.PI/2,Math.PI,Math.PI*1.5]){
      const ex=x+Math.cos(a)*distance,ey=y+Math.sin(a)*distance
      const z=eng.entityWalkH(m,x|0,y|0,0),end=eng.entityWalkH(m,ex|0,ey|0,0)
      if(z===null||end===null||Math.abs(z-end)>.05||!eng.los(x,y,ex,ey))continue
      let safe=true
      for(let d=0;d<=distance;d+=.2){const h=eng.entityWalkH(m,Math.floor(x+Math.cos(a)*d),Math.floor(y+Math.sin(a)*d),0);if(h===null||Math.abs(h-z)>.05)safe=false}
      if(safe)return {x,y,z,ex,ey,a,world:[x+ox,y+oy],roof:r.wallH}
    }
  }
  throw Error('No clear production-map approach corridor')
}
function disposeGallery(){if(gallery){gallery.removeFromParent();gallery.traverse((o:any)=>o.geometry?.dispose());gallery=undefined}}
function rendererState(qa:any){return {stats:qa.stats(),pose:{x:qa.eng.player.x+(qa.eng.map.inf?.ox??0),y:qa.eng.player.y+(qa.eng.map.inf?.oy??0),z:qa.eng.player.z,yaw:qa.look.yaw,pitch:qa.look.pitch,fov:qa.r.camera.fov},seed:20261006}}
async function showSmiler(qa:any,id:string) {
  const outdoor=id==='great-outdoor',kind=outdoor?'great':id.split('-')[0]
  if(qa.eng.player.level!==(outdoor?10:3)){disposeGallery();await qa.scene(outdoor?10:3);await qa.warm();currentKind=''}
  const {eng,r}=qa,p=eng.player
  if(currentKind!==kind||outdoor){
    disposeGallery();eng.dev.bright=false
    const dist=pose.SMILER_STOP[kind]
    point=findCorridor(qa,dist)
    actor=makeEntity('smiler',point.ex,point.ey,point.z,kind);actor.id=7100+kinds.indexOf(kind)
    ai.initSmiler(eng,actor,kind,1,false);actor.facing=point.a+Math.PI
    Object.assign(actor.sm,{phase:'pounce',aware:10,vis:1,glow:1,grin:1});currentKind=kind
  }
  const age=id.endsWith('windup')?.24:.38
  Object.assign(actor.sm,{strikeAge:age,strikeT:Math.max(0,.38-age)})
  actor.state='attack';actor.animT=0;eng.map.entities=[actor];p.hotbar.fill(null)
  aim(qa,point.x,point.y,point.z,point.ex,point.ey,point.z+1.55);r.setFov(60)
  await qa.sample(1,0);await qa.warm();qa.freezeRenderTime(12);await frames(30)
  const g=r.entityMeshes.get(actor.id),rig=g?.userData.smilerRig;check(rig,'Missing production smiler rig')
  const bounds=new THREE.Box3(),v=new THREE.Vector3()
  for(const mesh of [rig.eyes,rig.upper,rig.lower]){const p=mesh.geometry.getAttribute('position');for(let i=0;i<p.count;i++)bounds.expandByPoint(v.fromBufferAttribute(p,i).applyMatrix4(mesh.matrixWorld).project(r.camera))}
  if(!baseline)check(bounds.min.x>-.99&&bounds.max.x<.99&&bounds.min.y>-.99&&bounds.max.y<.99,`${id}: clipped face ${JSON.stringify({bounds,point,camera:r.camera.position,rotation:g.rotation.toArray(),scale:g.scale,face:rig.face.getWorldPosition(new THREE.Vector3()),eyes:rig.eyes.getWorldPosition(new THREE.Vector3())})}`)
  return {kind,age,distance:Math.hypot(actor.x-p.x,actor.y-p.y),faceNDC:bounds,bend:rig.bend,...rendererState(qa)}
}
async function showTrees(qa:any,id:string) {
  const level=id.startsWith('l9')?9:10
  const host=id.includes('forms')?10:level
  if(qa.eng.player.level!==host){disposeGallery();await qa.scene(host);await qa.warm();currentKind=''}
  if(gallery&&gallery.userData.level!==level)disposeGallery()
  const {eng,r}=qa,m=eng.map
  let naturalTree:any
  m.entities=[];eng.player.flashlight=level===9
  Object.assign(eng.l10Weather,{kind:'calm',k:0,wetness:0})
  if(id.endsWith('street')||id.endsWith('field')){
    disposeGallery()
    // Fixed world cameras, independent of the spawn clearance or collider
    // changes between revisions. Both revisions render the same generated lot.
    const [wx,wy,tx,ty]=level===9?[5.5,27.5,5.5,20.5]:[4.5,-24.5,-4.5,-24.5]
    qa.moveTo(wx,wy)
    const ox=eng.map.inf?.ox??0,oy=eng.map.inf?.oy??0
    naturalTree=eng.map.structures.filter((s:any)=>s.kind===`l${level}tree`).sort((a:any,b:any)=>Math.hypot(a.x+a.w/2+ox-tx,a.y+a.h/2+oy-ty)-Math.hypot(b.x+b.w/2+ox-tx,b.y+b.h/2+oy-ty))[0]
    check(naturalTree&&Math.hypot(naturalTree.x+naturalTree.w/2+ox-tx,naturalTree.y+naturalTree.h/2+oy-ty)<.05,`L${level}: fixed camera tree missing`)
    aim(qa,wx-ox,wy-oy,0,tx-ox,ty-oy,level===9?2.6:3.3);r.setFov(65)
  }else{
    if(!gallery){
      gallery=new THREE.Group();gallery.name='qa-six-production-tree-forms'
      const x=eng.player.x,y=eng.player.y-10
      for(let i=0;i<6;i++){
        // Production constructors, no QA-only material or replacement geometry.
        const s:any={id:95000+i,kind:`l${level}tree`,x:x+(i-2.5)*6-.3,y:y-.3,w:.6,h:.6,solid:true,data:{style:i,v:i,scale:100}}
        if(!baseline){const {outdoorTreeIdentity}=await import('/src/game/renderer/outdoorTrees.ts');const identity=outdoorTreeIdentity(s,level,{x:m.inf?.ox??0,y:m.inf?.oy??0});s.data.style+=i-identity.form;s.data.v+=i-identity.form}
        const tree=buildStructure(s,{...eng.levelDef,id:level},m,r.wallH);tree.position.set(s.x+s.w/2,0,s.y+s.h/2);gallery.add(tree)
      }
      gallery.userData.center={x,y};gallery.userData.level=level;r.scene.add(gallery)
    }
    const {x,y}=gallery.userData.center,back=id.endsWith('back')
    // Elevated inspection across six silhouettes; also keep street/field eye-level views.
    aim(qa,x,y+(back?-29:29),2.0,x,y,level===9?2.5:3.5);r.setFov(70)
    eng.player.flashlight=level===9
  }
  // Both model galleries use the real overcast field lighting for inspection;
  // the natural L9 street capture retains its nighttime lighting and flashlight.
  eng.dev.bright=false;eng.player.flashlight=host===9
  await qa.sample(1,0);await qa.warm();qa.freezeRenderTime(20);await frames(30)
  const models:any[]=[]
  gallery?.traverse((o:any)=>{if(o.userData.treeForm)models.push({form:o.userData.treeForm,arrangement:o.userData.treeArrangement})})
  const samples:any[]=[]
  if(!gallery)for(let round=0;round<5;round++)samples.push(await sampleFixed(qa))
  const sample=samples[0]
  qa.freezeRenderTime(20);await frames(8)
  const colliders=naturalTree?structColliders(naturalTree,eng.map):undefined
  if(!baseline&&colliders)check(colliders.length===1&&colliders[0].x1-colliders[0].x0<.9&&colliders[0].y1-colliders[0].y0<.9,`L${level}: tree crown blocks walking`)
  return {level,hostLevel:host,natural:!gallery,models,sample,samples,colliders,...rendererState(qa)}
}
export async function view(qa:any,id:string){return id.startsWith('l9')||id.startsWith('l10')?showTrees(qa,id):showSmiler(qa,id)}

/** Temporary render overrides for cost attribution; never used by gameplay. */
export async function profileTrees(qa:any){
  const leaves:THREE.Mesh[]=[],wood:THREE.Mesh[]=[]
  qa.r.scene.traverse((o:any)=>{if(o.isMesh&&!Array.isArray(o.material)){if(o.material.name==='l9-cc0-tree-leaves')leaves.push(o);if(o.material.name==='l9-cc0-tree-bark')wood.push(o)}})
  const report:any={leaves:leaves.length,wood:wood.length,steps:{}}
  const state=leaves.map(m=>({m,material:m.material,visible:m.visible,cast:m.castShadow,receive:m.receiveShadow}))
  const step=async(name:string)=>{await qa.sample(1,0);await qa.warm();report.steps[name]=await sampleFixed(qa)}
  try{
    await step('all')
    leaves.forEach(m=>m.visible=false);await step('withoutLeaves')
    leaves.forEach(m=>{m.visible=true;m.castShadow=false});await step('withoutLeafShadow')
    leaves.forEach(m=>{m.castShadow=true;m.receiveShadow=false});await step('withoutLeafReceive')
    for(const {m,material} of state){const old=material as THREE.MeshStandardMaterial;m.receiveShadow=true;m.material=new THREE.MeshLambertMaterial({map:old.map,color:old.color,alphaTest:old.alphaTest,vertexColors:true,side:THREE.DoubleSide})}
    await step('lambertLeaves')
  }finally{for(const s of state){if(s.m.material!==s.material)(s.m.material as THREE.Material).dispose();s.m.material=s.material;s.m.visible=s.visible;s.m.castShadow=s.cast;s.m.receiveShadow=s.receive}}
  return report
}

export async function runtime(qa:any){
  disposeGallery();await qa.scene(3);await qa.warm();qa.eng.dev.bright=false
  const {eng,r}=qa,results:any[]=[]
  const original=eng.hurtPlayer;let hits=0
  eng.hurtPlayer=()=>{hits++}
  try{for(const kind of kinds){
    const point=findCorridor(qa,5);aim(qa,point.x,point.y,0,point.ex,point.ey)
    const e=makeEntity('smiler',point.ex,point.ey,0,kind);ai.initSmiler(eng,e,kind,1,false);e.facing=point.a+Math.PI;e.sm.phase='pounce';e.sm.aware=10;eng.map.entities=[e]
    hits=0;let firstHit:number|undefined,minDistance=Infinity,animationFrames=0
    for(let i=0;i<300;i++){
      e.attackCd-=1/60;ai.beginSmilerFrame(eng,1/60,false);const old=hits
      ai.updateSmiler(eng,e,1/60,Math.hypot(e.x-eng.player.x,e.y-eng.player.y),1,true)
      const d=Math.hypot(e.x-eng.player.x,e.y-eng.player.y);minDistance=Math.min(minDistance,d)
      if(hits>old){check(d<=pose.smilerReach(kind)+1e-6,`${kind}: distant damage`);firstHit??=i/60}
      if(e.sm.strikeAge!==undefined)animationFrames++
      if(i%15===0)await frame()
    }
    check(hits>0&&animationFrames>20,`${kind}: real map attack or animation missing`)
    check(minDistance>=pose.SMILER_STOP[kind]-.02,`${kind}: approached inside face clearance`)
    results.push({kind,hits,firstHit,minDistance,animationFrames})
  }}finally{eng.hurtPlayer=original}
  await qa.sample(1,0);await qa.warm()
  const interrupted=eng.map.entities[0]
  Object.assign(interrupted.sm,{strikeAge:.2,strikeT:.18});interrupted.state='attack';interrupted.stunT=.8
  const {updateEntities}=await import(/* @vite-ignore */root+'/engine/entityAI.ts')
  eng.dev.frozenAI=false
  try{updateEntities(eng,1/60,1)}finally{eng.dev.frozenAI=true}
  check(interrupted.sm.strikeAge===undefined&&interrupted.sm.strikeT===undefined&&interrupted.state==='stunned','Outer AI retains interrupted attack pose')
  const memory=[]
  for(let i=0;i<3;i++){
    eng.map.entities=[];await qa.sample(1,0);await qa.warm()
    const p=eng.player,e=makeEntity('smiler',p.x+3,p.y,0,'great');ai.initSmiler(eng,e,'great',1,false);eng.map.entities=[e];await frames(10)
    eng.map.entities=[];await qa.warm();memory.push({...r.three.info.memory,programs:r.three.info.programs.length})
  }
  check(memory.every(m=>JSON.stringify(m)===JSON.stringify(memory[0])),'Smiler recycle resource growth '+JSON.stringify(memory))
  const stats=qa.stats(),treeMemory=[]
  await qa.scene(10);await qa.warm()
  for(let cycle=0;cycle<3;cycle++){
    gallery=new THREE.Group();r.scene.add(gallery)
    for(const level of [9,10])for(let i=0;i<6;i++){
      const s:any={kind:`l${level}tree`,x:eng.player.x-3+i,y:eng.player.y-6,w:.6,h:.6,solid:true,data:{style:i,v:i,scale:100}}
      gallery.add(buildStructure(s,{...eng.levelDef,id:level},eng.map,r.wallH))
    }
    await frames(30);disposeGallery();await qa.sample(1,0);await qa.warm()
    treeMemory.push({...r.three.info.memory,programs:r.three.info.programs.length})
  }
  check(treeMemory.every(m=>JSON.stringify(m)===JSON.stringify(treeMemory[0])),'Tree recycle resource growth '+JSON.stringify(treeMemory))
  return {attacks:results,stunInterrupted:true,memory,treeMemory,stats}
}
