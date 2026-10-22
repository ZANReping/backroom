/* Behavior checks for integrating the swim remake with the current project. */
import { createCanvas } from '@napi-rs/canvas'
Object.assign(globalThis,{document:{createElement:()=>createCanvas(32,32)},window:{addEventListener(){},removeEventListener(){},matchMedia:()=>({matches:false})},localStorage:{getItem:()=>null,setItem(){},removeItem(){}}})
const { Engine }=await import('../src/game/engine')
const SW=await import('../src/game/engine/swim')
const { startMeleeSwing }=await import('../src/game/engine/melee')
const { MELEE,MELEE_KINDS }=await import('../src/game/content/melee')
const { swimBreathVisuals }=await import('../src/game/renderer/photoPass')
const { canOccupy }=await import('../src/game/core/player')
let n=0,failures=0
const ok=(v:unknown,s:string,detail?:unknown)=>{n++;console.log(`${v?'PASS':'FAIL'} ${s}${!v&&detail?' '+JSON.stringify(detail):''}`);if(!v)failures++}
const near=(a:number,b:number)=>Math.abs(a-b)<1e-8
function water(){
 const e:any=new Engine(),N=80*80,z=()=>new Uint8Array(N)
 e.player.level=7;e.map={w:80,h:80,structures:[],tiles:z().fill(1),items:[],lights:[],exits:[],entities:[],spawn:{x:40,y:40},wet:z(),elev:z(),outdoor:z(),step:z(),crawl:z(),ceiling:z(),up:z(),upWall:z(),up2:z(),upWall2:z(),stair:new Int32Array(N),liquid:z().fill(1),seaFloor:new Float32Array(N).fill(150),floors:1,dn:z(),dnWall:z(),tint:z()}
 Object.assign(e.player,{x:40.5,y:40.5,z:-20,vz:0,floor:0,stamina:100});Object.assign(e.input,{mx:0,my:0,jump:false,crouch:false,sprint:false});e.inLiquid=1;e.submerged=true;e.swimMode='flat';e.emit=()=>{};e.persist=()=>{};return e
}
{
 const e=water(),s=e.swim;e.map.structures=[{kind:'handrail',x:42,y:30,w:.2,h:20,solid:true,data:{deg:270,mount:150}}];s.cx=12;s.cy=4
 SW.stepCurrent(e,s,.5)
 ok(e.player.x<41.7,'Water currents cannot pass through a thin submerged collider',e.player)
 ok(e.player.y>41,'Blocked currents slide along the collider')
 ok(canOccupy(e.map,e.player.x,e.player.y,.32,{z:e.player.z,band:0}),'Current leaves the player outside the collider')
 const f=water();f.map.structures=e.map.structures;f.swim.cx=1000;SW.stepCurrent(f,f.swim,.1)
 ok(f.player.x<41.7&&f.player.x>40.5,'Strong impulses cannot tunnel through the thin collider',f.player)
}
{
 const e=water();for(let y=0;y<80;y++)e.map.tiles[y*80+42]=2;e.swim.cx=15;SW.stepCurrent(e,e.swim,.5)
 ok(e.player.x<41.7,'A terrain wall blocks external water forces')
 const bank=water();for(let y=0;y<80;y++)for(let x=42;x<80;x++)bank.map.liquid[y*80+x]=0;bank.swim.cx=8;SW.stepCurrent(bank,bank.swim,1)
 ok(bank.player.x<42&&bank.map.liquid[Math.floor(bank.player.y)*80+Math.floor(bank.player.x)]===1,'Water forces stop at the shore instead of pushing onto dry land')
 const free=water();free.swim.cx=4;SW.stepCurrent(free,free.swim,.5);ok(free.player.x>41&&free.swim.cx>0&&free.swim.cx<4,'Unblocked currents retain a decaying drift')
}
{
 const e=water(),s=e.swim;s.vx=1;s.vy=.4;s.lx=e.player.x;s.ly=e.player.y;s.lz=e.player.z
 e.map.inf={ox:64,oy:-32};e.player.x-=64;e.player.y+=32
 const context={maxSpeed:2.448,sprint:false,surfaceZ:.1,floorZ:-150}
 SW.stepSwimVelocity(e,s,.02,context)
 ok(s.vx>.9&&s.vy>.3,'Origin rebasing preserves inertia when world position stays unchanged')
 s.lx=e.player.x+64;s.ly=e.player.y-32;s.lz=e.player.z;e.player.x+=4
 SW.stepSwimVelocity(e,s,.02,context)
 ok(s.vx===0&&s.vy===0,'A real teleport clears the old swimming velocity')
 ok([s.vx,s.vy,s.vz].every(Number.isFinite),'Swimming velocity remains finite after rebase and teleport')
}
{
 const e=water(),s=e.swim;s.cx=8;s.cy=4;s.lx=e.player.x;s.ly=e.player.y;s.lz=e.player.z;e.player.x+=5
 const x=e.player.x,y=e.player.y;SW.stepCurrent(e,s,.1);ok(e.player.x===x&&e.player.y===y&&s.cx===0&&s.cy===0,'Teleports clear external currents before they can move the new position')
 s.out={t:0,sx:x,sy:y,sz:e.player.z,tx:x+1,ty:y,tz:1.2};e.player.x+=10;const target=e.player.x
 SW.stepClimbOut(e,s,.1);ok(s.out===null&&e.player.x===target,'Teleporting during a mantle cannot pull the player back to the old bank')
}
const numericTable=JSON.stringify(MELEE)
for(const kind of MELEE_KINDS)for(const heavy of [false,true]){
 const start=(submerged:boolean)=>{const e=water();e.submerged=submerged;e.player.hotbar[0]={type:kind,count:1};e.player.selected=0;e.attackCooldownT=0;const success=startMeleeSwing(e,heavy,heavy?1:0);return{e,success}}
 const land=start(false),waterCase=start(true),a=land.e,b=waterCase.e
 ok(land.success&&waterCase.success&&near(b.attackAnimDur,a.attackAnimDur*1.3)&&near(b.attackCooldownDur,a.attackCooldownDur*1.3),`${kind} ${heavy?'heavy':'light'} animation and cooldown use underwater resistance`)
 ok(near(b.meleePending.t,a.meleePending.t*1.3)&&near(a.player.stamina,b.player.stamina),`${kind} ${heavy?'heavy':'light'} hit timing slows without extra stamina cost`)
}
ok(JSON.stringify(MELEE)===numericTable,'Water resistance does not mutate shared weapon damage, reach or durability tables')
{
 const s=SW.newSwimState();Object.assign(s,{vx:3,vy:-2,vz:4,cx:9,cy:8,stage:3,o2k:2,blackK:1,bendsT:45,bendsSev:1,fastUp:30,deepMax:80,pressStage:4,out:{t:.2,sx:1,sy:2,sz:3,tx:4,ty:5,tz:6}});SW.resetSwim(s)
 const initial=SW.newSwimState();ok(JSON.stringify(s)===JSON.stringify(initial),'Reset clears velocity, currents, breath, pressure, bends and mantle state')
 const separate=SW.newSwimState();s.vx=8;ok(separate.vx===0,'Separate swimming controllers do not share mutable state')
 const normal=swimBreathVisuals(0,0,0,0),urge=swimBreathVisuals(1,.7,0,0),contract=swimBreathVisuals(2,.93,0,0),black=swimBreathVisuals(3,1.2,.7,0)
 ok(Object.values(normal).every(v=>v===0),'Normal oxygen leaves the rendered image unchanged')
 ok(urge.edge>0&&urge.gray===0&&contract.edge>urge.edge&&contract.gray>0&&black.black>0,'Breath visuals progress from edge contraction to desaturation and blackout')
 for(const stage of [0,1,2,3])for(const k of [0,.6,.85,1,1.5]){
  const f=swimBreathVisuals(stage,k,k,123.4);ok(Object.values(f).every(v=>Number.isFinite(v)&&v>=0&&v<=1),`Breath uniforms are bounded at stage ${stage}, oxygen ${k}`)
 }
 ok(Object.values(swimBreathVisuals(0,0,0,123)).every(v=>v===0),'Recovery clears the effect regardless of pulse phase')
}
{
 const {buildRetroHand,SWIM_HAND_POSE,SWIM_LEFT_HAND_POSE}=await import('../src/game/renderer/retroViewHand')
 const {Vector3}=await import('three')
 const right=buildRetroHand(),left=buildRetroHand({left:true})
 right.setPose(SWIM_HAND_POSE);left.setPose(SWIM_LEFT_HAND_POSE);right.group.updateMatrixWorld(true);left.group.updateMatrixWorld(true)
 const points=(hand:typeof right,mirror=false)=>{const pos=hand.skin.geometry.attributes.position,v=new Vector3(),keys=new Set<string>();for(let i=0;i<pos.count;i++){v.fromBufferAttribute(pos,i).applyMatrix4(hand.skin.matrixWorld);keys.add([mirror?-v.x:v.x,v.y,v.z].map(n=>Math.round(n*1e5)).join(','))}return keys}
 const a=points(right,true),b=points(left);ok(a.size===b.size&&[...a].every(v=>b.has(v)),'Swimming hands and thumbs mirror in camera space')
 right.skin.geometry.computeBoundingBox();const openTip=right.skin.geometry.boundingBox!.min.z
 right.setPose({...SWIM_HAND_POSE,open:false});right.skin.geometry.computeBoundingBox();const fistTip=right.skin.geometry.boundingBox!.min.z
 ok(openTip<fistTip-.015,'Swimming fingers extend rather than forming the empty-hand fist',{openTip,fistTip})
 right.dispose();left.dispose()
}
console.log(`${n-failures}/${n} integration checks passed`);if(failures)process.exitCode=1
