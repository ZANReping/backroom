/** World-space controls; no loaded chunks, mutable RNG or renderer dependencies. */
import {L1_REFERENCE_CASES} from './l1ReferenceCases'
import {l1PlanTile,l1PlanRooms,l1RegionAt,type L1Room,type L1RoomType} from './l1Plan'
export const L1_GENERATION_VERSION=6
export const L1_SHOWCASE_SEED=20261006
export const l1Mod=(x:number,n:number)=>(x%n+n)%n
export const l1SkylightAt=(x:number,y:number)=>{const dx=l1Mod(Math.floor(x)-3,8),dy=l1Mod(Math.floor(y)-3,8);return Math.min(dx,8-dx)<=1&&Math.min(dy,8-dy)<=1}
export function l1Noise(x:number,y:number,seed=0){
 let h=Math.imul(Math.floor(x)^seed,374761393)^Math.imul(Math.floor(y),668265263)
 h=Math.imul(h^(h>>>13),1274126177);return ((h^(h>>>16))>>>0)/4294967296
}
const smooth=(t:number)=>t*t*(3-2*t)
function field(seed:number,x:number,y:number,scale:number){
 const gx=Math.floor(x/scale),gy=Math.floor(y/scale),u=smooth(l1Mod(x,scale)/scale),v=smooth(l1Mod(y,scale)/scale)
 const a=l1Noise(gx,gy,seed),b=l1Noise(gx+1,gy,seed),c=l1Noise(gx,gy+1,seed),d=l1Noise(gx+1,gy+1,seed)
 return (a+(b-a)*u)*(1-v)+(c+(d-c)*u)*v
}
const refs=[
 ['parking-common','天鹰段-合集/最普遍的天鹰段.jpg','parking',800,600],
 ['parking-round','天鹰段-合集/圆柱天鹰段，天鹰段的墙壁.png','parking',835,617],
 ['parking-room','天鹰段-合集/天鹰段中的小房间.png','parking',838,619],
 ['parking-water','天鹰段-合集/天鹰段的水洼.png','parking',752,528],
 ['parking-bright','天鹰段-合集/较为光亮的天鹰段.png','parking',591,454],
 ['parking-clean','天鹰段-合集/较为干净的天鹰段.png','parking',531,407],
 ['parking-dry','天鹰段-合集/较为干燥的天鹰段.jpg','parking',4080,2296],
 ['parking-dim','天鹰段-合集/较为黑暗的天鹰段.png','parking',2048,1536],
 ['parking-dark','天鹰段-合集/黑暗的天鹰段.png','parking',2048,1536],
 ['parking-props','天鹰段自然生成的装饰物.avif','parking',1974,1481],
 ['storage','跃金段.jpg','storage',1199,864],
 ['gothic','哥特段.png','gothic',1358,858],
 ['ouroboros','衔尾段.png','ouroboros',1482,746],
 ['garden','花园段.png','garden',1920,1080],
 ['path-corridor','小径走廊.jpg','maintenance',2048,2048],
 ['path-room','小径的房间之一.png','maintenance',3000,4000],
 ['crate','板条箱.png','storage',467,529],
 ['power-out','闪烁事件后的天鹰段.png','parking',1000,633],
] as const
export const L1_PHOTO_ANCHORS=refs.map(([id,file,variant,width,height],i)=>{
 const cx=2064+i*256,poses:Record<string,number[]>={
  'parking-common':[2.5,3,0,-.09,.10,70],'parking-round':[3,6,0,.11,.04,65],
  'parking-room':[6,3.5,0,-.4,.02,67],'parking-water':[2,3,0,.35,-.13,65],
  'parking-bright':[2,4,0,-.13,.12,68],'parking-clean':[3.5,3,0,.05,0,67],
  'parking-dry':[0,8,0,0,.06,62],'parking-dim':[2.5,3,0,-.2,.03,70],
  'parking-dark':[3,3,0,0,-.03,68],'parking-props':[1.5,4,0,0,-.04,70],
  storage:[4,4,0,.05,.12,70],gothic:[2.5,4,0,-.13,.035,72],ouroboros:[4,4,0,.12,.10,70],garden:[3,4,0,.05,.035,70],
  'path-corridor':[-1,9,0,0,.035,66],'path-room':[2.8,11.3,0,0,-.19,61],
  crate:[.5,1,-.65,0,-.15,52],'power-out':[3,3,0,.1,.08,68],
 },[dx,dy,z,yaw,pitch,fov,roll=0]=L1_REFERENCE_CASES[id]?.camera??poses[id]
 return{id,file,variant,width,height,x:cx+dx,y:16+dy,z,yaw,pitch,roll,fov,centerX:cx,centerY:16,blackout:id==='power-out'}
})
/** v2 reference bays: the 18 authored photo cases (module proportions, partitions, puddles,
 * lighting state, recorded camera) are planted at the centre of real 区段 halls. Each hall
 * region of a matching section gets at most one bay; its influence is a box of ±L1_REF_HALF m
 * clipped to the region, so the rest of the hall stays procedural. */
export const L1_REF_HALF=56
const REF_WEIGHTS:Record<string,[string,number][]>={
 parking:[['parking-common',3],['parking-round',1.5],['parking-water',1.5],['parking-bright',1.5],['parking-clean',1.5],['parking-dry',1],['parking-room',1],['parking-dim',1],['parking-dark',.8],['parking-props',1],['power-out',.4]],
 storage:[['storage',2],['crate',1]],gothic:[['gothic',1]],ouroboros:[['ouroboros',1]],garden:[['garden',1]],
}
type L1Anchor=(typeof L1_PHOTO_ANCHORS)[number]
const refCache=new Map<string,L1Anchor|null>()
export function l1RegionReference(seed:number,r:{id:string;ix0:number;iy0:number;ix1:number;iy1:number;section:string}):L1Anchor|null{
 const key=seed+':'+r.id;const hit=refCache.get(key);if(hit!==undefined)return hit
 let out:L1Anchor|null=null
 const w=REF_WEIGHTS[r.section],h=l1Noise(r.ix0*7+r.iy1,r.iy0*13+r.ix1,seed^0x5eed)
 if(w&&Math.min(r.ix1-r.ix0,r.iy1-r.iy0)>=70&&h<.85){
  const total=w.reduce((s,[,v])=>s+v,0);let t=l1Noise(r.ix1,r.iy0,seed^0xbad)*total,id=w[0][0]
  for(const [k,v]of w){if(t<v){id=k;break}t-=v}
  const base=L1_PHOTO_ANCHORS.find(a=>a.id===id)
  if(base){// snap to a chunk centre (32k+16): authored props/reserves/lights assume the old strip's chunk-centred anchors
   const cx=Math.floor((r.ix0+r.ix1)/64)*32+16,cy=Math.floor((r.iy0+r.iy1)/64)*32+16
   out={...base,x:base.x-base.centerX+cx,y:base.y-base.centerY+cy,centerX:cx,centerY:cy}}
 }
 if(refCache.size>4096)refCache.delete(refCache.keys().next().value!)
 refCache.set(key,out);return out
}
export function l1ReferenceAt(seed:number,x:number,y:number):L1Anchor|undefined{
 const r=l1RegionAt(seed,Math.floor(x),Math.floor(y));if(!r)return undefined
 const a=l1RegionReference(seed,r as any);if(!a)return undefined
 return Math.abs(x-a.centerX)<=L1_REF_HALF&&Math.abs(y-a.centerY)<=L1_REF_HALF?a:undefined
}
/** Nearest reference bay of a given case id (dev capture / checks). */
export function l1FindReference(seed:number,id:string,rx=1500):L1Anchor|undefined{
 let best:L1Anchor|undefined,bd=1e18
 for(let y=-rx;y<=rx;y+=40)for(let x=-rx;x<=rx;x+=40){const r=l1RegionAt(seed,x,y);if(!r)continue;const a=l1RegionReference(seed,r as any);if(a&&a.id===id){const d=Math.hypot(a.centerX,a.centerY);if(d<bd){bd=d;best=a}}}
 return best
}
const SKIN_WEIGHTS:[string,number][]=[['common',3],['round',1.4],['water',1.3],['bright',1.2],['clean',1.2],['dry',1],['room',.8],['dim',1],['dark',.7]]
/** v3: which of the nine 天鹰 reference looks a parking hall wears. A hall with a reference bay
 * takes that photo's look everywhere; other halls draw one by weight from their region id. */
export function l1ParkingSkin(seed:number,x:number,y:number):string{
 const r=l1RegionAt(seed,Math.floor(x),Math.floor(y));if(!r)return 'common'
 const a=l1RegionReference(seed,r as any)
 if(a&&a.variant==='parking')return a.id==='power-out'?'dark':a.id==='parking-props'?'common':a.id.slice(8)
 const total=SKIN_WEIGHTS.reduce((s,[,v])=>s+v,0);let t=l1Noise((r as any).ix0*3+(r as any).iy1,(r as any).iy0*5+(r as any).ix1,seed^0x5c1d)*total
 for(const [k,v]of SKIN_WEIGHTS){if(t<v)return k;t-=v}
 return 'common'
}
export function l1ParkingAt(seed:number,x:number,y:number){
 const ref=l1ReferenceAt(seed,x,y),id=ref?.id
 const wet=id==='parking-dry'||id==='parking-clean'||id==='parking-room'?0:id==='parking-water'?.95:id==='parking-common'||id==='parking-bright'?.7:field(seed^71,x,y,91)
 const brightness=id==='parking-dark'?.07:id==='parking-dim'?.22:id==='parking-bright'?1.15:id==='parking-clean'?1.05:.48+field(seed^313,x,y,113)*.62
 return {wet,brightness,round:id==='parking-round'||(!ref&&field(seed^519,x,y,157)>.72),clean:id==='parking-clean',
  corridor:id==='parking-dry'||(!ref&&field(seed^97,x,y,131)>.76),room:id==='parking-room',props:id==='parking-props'}
}
/** Compatibility summary; actual halls and path belts are classified per tile. */
export function l1PathChunk(seed:number,cx:number,cy:number){
 return l1PlanTile(seed,cx*32+16,cy*32+16).style==='maintenance'
}
/** Stable side-room data, shared by layout and wall finish. Coordinates are absolute. */
export function l1PathRoom(seed:number,cx:number,cy:number):{x0:number;x1:number;y0:number;y1:number;vx:number;type?:L1RoomType;door?:L1Room['door'];alcove?:{x0:number;x1:number;y0:number;y1:number}}|null{
 const rooms=l1PlanRooms(seed,cx*32,cy*32,cx*32+32,cy*32+32).filter(r=>Math.floor((r.x0+r.x1)/2/32)===cx&&Math.floor((r.y0+r.y1)/2/32)===cy)
 const r=rooms[0];if(!r)return null
 return {x0:r.x0,x1:r.x1,y0:r.y0,y1:r.y1,vx:r.x0-cx*32,type:r.type,door:r.door}
}
export function l1PathRoomLegacy(seed:number,cx:number,cy:number){
 const ref=l1ReferenceAt(seed,cx*32+16,cy*32+16)
 if(ref?ref.id!=='path-room':l1Noise(cx,cy,seed^1223)>=.45)return null
 const vx=ref?14:5+3*Math.floor(l1Noise(cx,cy,seed^1237)*8)
 if(ref)return{x0:cx*32+17,x1:cx*32+19,y0:cy*32+19,y1:cy*32+25,vx,alcove:{x0:cx*32+19,x1:cx*32+20,y0:cy*32+22,y1:cy*32+25}}
 return{x0:cx*32+Math.min(23,vx+3),x1:cx*32+Math.min(28,vx+6)+1,y0:cy*32+18,y1:cy*32+27,vx}
}
export function l1PathPlasterAt(seed:number,x:number,y:number){
 return l1PlanRooms(seed,x-.5,y-.5,x+.5,y+.5).some(b=>x>=b.x0-1.05&&x<=b.x1+.05&&y>=b.y0-1.05&&y<=b.y1+.05)
}
type Partition={x0:number;y0:number;x1:number;y1:number}
const partitionCache=new Map<string,readonly Partition[]>()
/** Industrial bays, independent of 32m streaming. Every template is open-ended;
 * the outer five metres form shared bypasses instead of sealed chunk rooms. */
export function l1HallPartitions(seed:number,gx:number,gy:number,style:string):readonly Partition[]{
 const key=`${seed}:${gx}:${gy}:${style}`,cached=partitionCache.get(key);if(cached)return cached
 const out:Partition[]=[],size=64,ox=gx*size,oy=gy*size
 const r=(salt:number)=>l1Noise(gx,gy,seed^salt),turn=Math.floor(r(839)*4)
 const wall=(x0:number,y0:number,x1:number,y1:number)=>{
  const rotate=(x:number,y:number)=>turn===0?[x,y]:turn===1?[size-y,x]:turn===2?[size-x,size-y]:[y,size-x]
  const a=rotate(x0,y0),b=rotate(x1,y1)
  out.push({x0:ox+Math.min(a[0],b[0]),y0:oy+Math.min(a[1],b[1]),x1:ox+Math.max(a[0],b[0]),y1:oy+Math.max(a[1],b[1])})
 }
 const offset=8+Math.floor(r(863)*6),opening=24+Math.floor(r(883)*13)
 const p=l1ParkingAt(seed,ox+32,oy+32)
 if(style==='gothic'||style==='garden'){
  if(r(887)<.2)wall(12,offset,39,offset+1)
 }else if(style==='parking'&&p.corridor){
  for(const x of [offset,offset+13]){wall(x,6,x+1,opening);wall(x,opening+4,x+1,57)}
  wall(offset+22,43,55,44)
 }else if(style==='parking'&&r(907)<.3){
  // Open service alcove beside a broad hall; never a closed room perimeter.
  wall(offset,9,offset+1,27);wall(offset,9,offset+15,10);wall(offset+14,9,offset+15,22)
  wall(36,38,57,39);wall(56,38,57,53)
 }else{
  wall(offset,7,offset+1,opening);wall(offset,opening+4,offset+1,55)
  if(style!=='storage'||r(911)>.32)wall(offset,54,offset+16,55)
  wall(36,16,56,17);if(r(919)>.28)wall(55,16,56,36)
  if(style==='parking'&&r(929)>.58)wall(34,43,47,44)
 }
 if(partitionCache.size>=1024)partitionCache.delete(partitionCache.keys().next().value!)
 partitionCache.set(key,out);return out
}
/** Full partitions are generated in world coordinates and clipped by streaming. */
export function l1HallWall(seed:number,wx:number,wy:number,style:string){
 const x=Math.floor(wx),y=Math.floor(wy),ref=l1ReferenceAt(seed,wx,wy)
 if(Math.abs(wx-15.5)<5&&Math.abs(wy-15.5)<5)return false
 // v2: partitions only stand well inside a hall region, clear of its boundary doors.
 const region=l1RegionAt(seed,x,y)
 if(!region||x<region.ix0+7||x>region.ix1-7||y<region.iy0+7||y>region.iy1-7)return false
 if(style!=='parking'&&style!=='storage')return false
 if(ref){
  const u=x-ref.centerX,v=y-ref.centerY,id=ref.id
  // Reference bays are real authored architecture, with the same walls/collision/UV.
  if(id==='parking-props')return v===-8&&u>=-13&&u<15
  // The dark service bay remains open between columns. A right-hand wall
  // receives the distant lamp's pipe shadows; no random partition hides it.
  if(id==='parking-dim')return u===6&&v>=-45&&v<4||v===-31&&u>=-14&&u<6&&!(u>=-2&&u<2)
  if(id==='parking-dark')return v===-22&&u>=-18&&u<20
  if(id==='parking-round')return u===3&&v>=-46&&v<22||u===-5&&v>=-46&&v<22&&l1Mod(v+4,20)>3||v===-20&&u>=-3&&u<3
  if(id==='parking-common'||id==='parking-water')return u===9&&v>=-52&&v<24||u===-17&&v>=-40&&v<8
  if(id==='parking-bright')return u===-7&&v>=-38&&v<20||v===-21&&u>=-7&&u<24&&!(u>=4&&u<9)
  if(id==='parking-clean')return u===-5&&v>=-48&&v<18&&l1Mod(v+2,24)>4
  if(id==='parking-dry')return (u===-7||u===8)&&v>=-55&&v<30&&l1Mod(v+5,24)>3
  if(id==='parking-room')return u===10&&v>=-20&&v<13||v===-5&&u>=-3&&u<=10&&!(u>=4&&u<7)||v===4&&u>=-12&&u< -3||u===-3&&v>=-5&&v<4
  if(id==='storage')return v===-24&&u>=-28&&u<34&&!(u>=12&&u<16)||u===-17&&v>=-24&&v<22
 }
 return l1HallPartitions(seed,Math.floor(x/64),Math.floor(y/64),style).some(r=>x>=r.x0&&x<r.x1&&y>=r.y0&&y<r.y1)
}
/** Frozen v2 placement mask. Only the legacy gameplay RNG uses this mask;
 * applyL1Architecture replaces its walls after assigning existing item/container IDs. */
export function l1PlacementWallV2(seed:number,wx:number,wy:number,style:string){
 const x=Math.floor(wx),y=Math.floor(wy),size=48,gx=Math.floor(x/size),gy=Math.floor(y/size),ref=l1ReferenceAt(seed,wx,wy)
 const u=ref?l1Mod(x-ref.centerX+16,size):l1Mod(x,size),v=ref?l1Mod(y-ref.centerY+16,size):l1Mod(y,size)
 if(Math.abs(wx-15.5)<5&&Math.abs(wy-15.5)<5)return false
 const r=l1Noise(gx,gy,seed^839),p=l1ParkingAt(seed,wx,wy)
 if(style==='parking'&&p.props)return v===8&&u>=3&&u<31
 if(style==='gothic'||style==='garden')return r<.12&&u===34&&v>8&&v<22
 if(style==='parking'&&p.corridor)return (u===9||u===22)&&v!==14&&v!==15&&v!==34&&v!==35
 if(style==='parking'&&p.room)return (u===27&&v>=8&&v<=21)||(v===8&&u>=19&&u<27)||(v===21&&u>=19&&u<27)||(u===19&&(v<12||v>16)&&v>=8&&v<=21)
 return (u===34&&v>8&&v<30)||(v===29&&u>=34&&u<43&&r>.35)
}
