import { l1TransitionStyle, l1Outpost,l1District,l1LayoutVariant } from './l1Layout'
import { l1Puddles, l1PuddleContains } from './l1Puddles'
import type { GameMap } from './mapgen'
import type { GenChunk } from './infiniteRegistry'
import {l1ParkingAt,l1HallWall,l1ReferenceAt,l1PathRoom} from './l1Spatial'
import {l1BuildingRoof,l1BuildingStyleAt} from './l1Building'
import {L1_CRATE} from './l1Crate'

export type L1Style = 'parking'|'storage'|'gothic'|'ouroboros'|'garden'|'aisle'|'maintenance'|'fabled'
export interface L1Profile { height:number; spacing:number; floor:string; wall:string; ceiling:string; lamp:string }
export const L1_PROFILES:Record<L1Style,L1Profile> = {
  parking:{height:3.6,spacing:8,floor:'#aaa99f',wall:'#c3c4bc',ceiling:'#b6b8b0',lamp:'#eff8ff'},
  storage:{height:6.4,spacing:8,floor:'#b8ac96',wall:'#f2f1e7',ceiling:'#8c8b80',lamp:'#fff9eb'},
  gothic:{height:3.8,spacing:5,floor:'#89816b',wall:'#aca58f',ceiling:'#aaa18b',lamp:'#f4d59c'},
  ouroboros:{height:4.8,spacing:8,floor:'#c8bda8',wall:'#c6c7c0',ceiling:'#575854',lamp:'#f0f3f1'},
  garden:{height:6.4,spacing:8,floor:'#506132',wall:'#d0d1b6',ceiling:'#b3b895',lamp:'#fff1bc'},
  aisle:{height:3.6,spacing:8,floor:'#aaa99f',wall:'#c3c4bc',ceiling:'#b6b8b0',lamp:'#e8eee8'},
  fabled:{height:3.3,spacing:6,floor:'#5e4a3a',wall:'#b8934f',ceiling:'#4a3426',lamp:'#fff0d8'},
  maintenance:{height:3.6,spacing:8,floor:'#9ea7ad',wall:'#d0d8dd',ceiling:'#ced8de',lamp:'#eaf3ff'},
}
export const l1Profile=(v:string):L1Profile=>L1_PROFILES[v as L1Style]??L1_PROFILES.parking
// Cosmetic stream; never consumes the gameplay RNG. Works across negative chunks and window rebases.
export function l1Hash(x:number,z:number,salt=0):number {
  let h=Math.imul(Math.floor(x)^salt,374761393)^Math.imul(Math.floor(z),668265263)
  h=Math.imul(h^(h>>>13),1274126177); return ((h^(h>>>16))>>>0)/4294967296
}
export function l1StyleAt(m:GameMap,x:number,z:number):L1Style|undefined {
  if(!m.l1Architecture||!m.inf)return undefined
  if(m.inf.chunks.values().next().value?.l1)return l1BuildingStyleAt(m.inf.seed,x+m.inf.ox,z+m.inf.oy)
  const c=m.inf.chunks.get(`${Math.floor((x+m.inf.ox)/32)},${Math.floor((z+m.inf.oy)/32)}`)
  return c?.variant==='aisle'?l1TransitionStyle(m.inf.seed,x+m.inf.ox,z+m.inf.oy):c?.variant as L1Style|undefined
}
// Cross vault underside: the maximum of two barrel vaults. Valleys meet at the column grid.
export function l1VaultHeight(wx:number,wz:number):number {
  const distance=(v:number)=>{const t=((v-4.5)%5+5)%5;return Math.min(t,5-t)}
  const f=(d:number)=>{const u=Math.min(1,Math.max(0,d-.48)/2.02);return Math.sqrt(Math.max(0,1-(1-u)**2))}
  const dx=distance(wx),dz=distance(wz),r=Math.hypot(dx,dz),t=Math.min(1,Math.max(0,(r-.7)/.9)),blend=t*t*(3-2*t)
  // Round the springing around each circular shaft, then join the intersecting barrels.
  return 1.92+1.88*(f(r)*(1-blend)+Math.max(f(dx),f(dz))*blend)
}
const vaultSupports=new WeakMap<GameMap,{structures:GameMap['structures'];ox:number;oz:number;keys:Set<string>}>()
export function l1VaultAt(m:GameMap,x:number,z:number):number {
  const ox=m.inf?.ox??0,oz=m.inf?.oy??0,wx=x+ox,wz=z+oz
  const gx=Math.round((wx-4.5)/5)*5+4.5,gz=Math.round((wz-4.5)/5)*5+4.5
  const c=m.inf?.chunks.get(`${Math.floor(gx/32)},${Math.floor(gz/32)}`)
  let cache=vaultSupports.get(m)
  if(!cache||cache.structures!==m.structures||cache.ox!==ox||cache.oz!==oz){
    const keys=new Set<string>();for(const s of m.structures)if(s.data?.l1Column==='gothic')keys.add(`${s.x+ox+.5},${s.y+oz+.5}`)
    cache={structures:m.structures,ox,oz,keys};vaultSupports.set(m,cache)
  }
  const supported=cache.keys.has(`${gx},${gz}`)
  const h=l1VaultHeight(wx,wz)
  if(supported||!c)return h
  const r=Math.max(Math.abs(wx-gx),Math.abs(wz-gz))/2.5,k=Math.min(1,r*r*(3-2*r))
  return 3.8+(h-3.8)*k
}
export function l1RoofAt(m:GameMap,x:number,z:number,fallback:number,underside=false):number {
  if(m.l1Architecture&&m.inf?.chunks.values().next().value?.l1)return l1BuildingRoof(m.inf.seed,x+m.inf.ox,z+m.inf.oy,underside)
  const v=l1StyleAt(m,x,z); if(!v)return fallback
  if(v==='gothic'&&underside)return l1VaultAt(m,x,z)
  return l1Profile(v).height
}
/** Restored drops keep their identity; only newly obstructed positions are moved. */
export function l1RestoredDropPosition(c:GenChunk,cx:number,cy:number,x:number,y:number){
 const ox=cx*32,oy=cy*32
 const free=(px:number,py:number)=>{
  for(const dx of [-.16,.16])for(const dy of [-.16,.16]){
   const tx=Math.floor(px+dx-ox),ty=Math.floor(py+dy-oy)
   if(tx<0||ty<0||tx>=32||ty>=32||c.tiles[ty*32+tx]!==1)return false
  }
  return !c.structures.some(s=>s.solid&&!s.data?.l1Hidden&&px>s.x-.16&&px<s.x+s.w+.16&&py>s.y-.16&&py<s.y+s.h+.16)
 }
 if(free(x,y))return{x,y}
 for(let r=0;r<=16;r++)for(let dy=-r;dy<=r;dy++)for(let dx=-r;dx<=r;dx++){
  if(Math.max(Math.abs(dx),Math.abs(dy))!==r)continue
  const px=Math.floor(x)+dx+.5,py=Math.floor(y)+dy+.5;if(free(px,py))return{x:px,y:py}
 }
 throw new Error(`Level 1 存档物品无法安全迁移：区块 ${cx},${cy}，原位置 ${x},${y}；原存档保留。`)
}

/** Apply the L1 visual and district rules after the base generator; use a separate deterministic stream. */
export function applyL1Architecture(c:GenChunk,cx:number,cy:number,seed=0,contentManifestOnly=false):GenChunk {
  const v=c.variant as L1Style, wx=cx*32,wz=cy*32,photo=l1ReferenceAt(seed,cx*32+16,cy*32+16)
  const reserve=(x:number,z:number)=>!!photo&&cx===Math.floor(photo.centerX/32)&&cy===Math.floor(photo.centerY/32)&&((photo.id==='parking-props'&&x>12&&x<24&&z>7&&z<14)||(photo.id==='crate'&&Math.hypot(x-16,z-16)<4))
  c.structures=c.structures.filter(s=>!['car','landmark','lightgrid','hanglight'].includes(s.kind))
  if(v!=='maintenance'){
    // The old generator finishes gameplay identity allocation before architecture
    // changes. New partitions leave actual items, containers and exits accessible.
    const protectedPoints=[...c.items,...c.exits,...c.entities,...(c.npcs??[])]
    const containers=c.structures.filter(s=>s.data?.sid!==undefined||s.kind==='scaffold')
    const [east,west,south,north]=[[1,0],[-1,0],[0,1],[0,-1]].map(([dx,dy])=>l1LayoutVariant(seed,cx+dx,cy+dy)==='maintenance')
    for(let z=0;z<32;z++)for(let x=0;x<32;x++){
      const px=wx+x+.5,pz=wz+z+.5
      // Keep path doorway walls/approaches; their adjoining chunk owns the door.
      if(x<4&&west||x>27&&east||z<4&&north||z>27&&south)continue
      const blocked=l1HallWall(seed,wx+x,wz+z,v)
      const protect=blocked&&(protectedPoints.some(q=>Math.hypot(q.x-px,q.y-pz)<1.5)||containers.some(s=>px>s.x-.7&&px<s.x+s.w+.7&&pz>s.y-.7&&pz<s.y+s.h+.7))
      c.tiles[z*32+x]=blocked&&!protect&&!reserve(x,z)?2:1
    }
  }else{
    const room=l1PathRoom(seed,cx,cy)
    if(room){
      for(let z=18;z<27;z++)for(let x=room.x0-wx;x<room.x1-wx;x++)c.tiles[z*32+x]=1
      // A two-metre branch joins the existing horizontal network.
      for(let x=2;x<30;x++)for(const z of [19,20])c.tiles[z*32+x]=1
    }
  }
  if(v==='maintenance'||v==='aisle'){
    let retained=0
    c.structures=c.structures.filter(s=>!s.data?.loot || (l1Hash(s.x,s.y,seed^409)<.18 && retained++<1))
  }
  if(!contentManifestOnly){
    c.wet.fill(0)
    if(v==='parking')for(const q of l1Puddles(seed,cx,cy))for(let z=0;z<32;z++)for(let x=0;x<32;x++)
      if(c.tiles[z*32+x]===1&&l1PuddleContains(q,wx+x+.5,wz+z+.5))c.wet[z*32+x]=1
  }
  const outpost=l1Outpost(seed,cx,cy)
  if(outpost){
    const names:Record<string,string>={alpha:'M.E.G. ALPHA',tom:'TOM / DINER',bntg:'B.N.T.G. TRADE',ariane:'ARIANE / MEDICAL',cornucopia:'ARGOS / CORNUCOPIA'}
    // The core room belongs to the district, not a randomly placed isolated prop.
    for(let z=9;z<=23;z++)for(let x=9;x<=23;x++)c.tiles[z*32+x]=1
    c.structures=c.structures.filter(s=>!(s.x>=wx+10&&s.x<wx+23&&s.y>=wz+10&&s.y<wz+23&&!s.data?.sid))
    c.structures.push({kind:'landmark',x:wx+20,y:wz+20,w:1,h:1,solid:false,data:{outpost}})
    for(const [x,z] of [[11,11],[21,11],[11,21],[23,22]])c.structures.push({kind:'wallsign',x:wx+x,y:wz+z,w:1,h:1,solid:false,data:{text:names[outpost]+' / CORE',org:outpost,l1Waymark:1,targetX:wx+20.5,targetY:wz+20.5}})
  }
  if(v!=='maintenance'&&v!=='aisle')for(let j=0;j<(v==='storage'?5:3);j++){
    for(let trial=0;trial<20;trial++){
      const x=3+Math.floor(l1Hash(cx*97+j*11,cy*79+trial,seed^701)*25),z=3+Math.floor(l1Hash(cx*71+trial,cy*93+j*17,seed^717)*25)
      if(reserve(x,z)||c.tiles[z*32+x]!==1||c.structures.some(s=>Math.hypot(s.x-wx-x,s.y-wz-z)<3)||[...c.exits,...c.items,...c.entities,...(c.npcs??[])].some(q=>Math.hypot(q.x-wx-x,q.y-wz-z)<3))continue
      if(cx===0&&cy===0&&Math.hypot(x-16,z-16)<5)continue
      c.structures.push({kind:'crate',x:wx+x,y:wz+z,w:1,h:1,solid:true,data:{sid:((cx&255)<<24)|((cy&255)<<16)|((240+j)<<4)|1,loot:1}});break
    }
  }
  // Stable reserve slots: hidden crates retain their identities and inventories.
  for(const s of c.structures)if(s.kind==='crate'&&s.data?.sid!==undefined){s.data.l1Prop='crate';s.data.l1Crate=1;s.data.l1Stack=l1Hash(s.x,s.y,seed^929)<.13?2:1;s.data.l1Hidden=l1Hash(s.x,s.y,seed^919)<.3?1:0}
  if(v==='aisle')for(const [x,z] of [[5,8],[5,24]])if(c.tiles[z*32+x]===1)c.structures.push({kind:'wallsign',x:wx+x,y:wz+z,w:1,h:1,solid:false,data:{text:'REF 08 / KEEP IN SIGHT',org:'meg',l1Waymark:1}})
  // Remove obsolete non-interactive scenery. Loot containers and NPC work anchors stay intact.
  c.structures=c.structures.filter(s=>s.kind!=='vaultcol' && !((v==='parking'||v==='aisle')&&s.kind==='pillar') &&
    !(v==='garden'&&['wheatpatch','hedgerow','glowshroom'].includes(s.kind)))
  const free=(x:number,z:number)=>{
    for(let dz=-1;dz<=1;dz++)for(let dx=-1;dx<=1;dx++){
      const xx=x+dx,zz=z+dz
      if(xx<0||zz<0||xx>=32||zz>=32){if(l1HallWall(seed,wx+xx,wz+zz,v))return false}
      else if(c.tiles[zz*32+xx]!==1)return false
    }
    const px=wx+x+.5,pz=wz+z+.5
    if(reserve(x,z)||cx===0&&cy===0&&Math.hypot(x-15.5,z-15.5)<3)return false
    if(c.structures.some(s=>px>s.x-1.2&&px<s.x+s.w+1.2&&pz>s.y-1.2&&pz<s.y+s.h+1.2))return false
    return ![...c.items,...c.exits,...c.entities,...(c.npcs??[])].some(s=>Math.hypot(px-s.x,pz-s.y)<2)
  }
  for(let z=0;z<32;z++)for(let x=0;x<32;x++){
    const style=v==='aisle'?l1TransitionStyle(seed,wx+x+.5,wz+z+.5):v,grid=l1Profile(style).spacing,offset=style==='gothic'?4:6
    if(style==='maintenance')continue
    if(((wx+x-offset)%grid+grid)%grid||((wz+z-offset)%grid+grid)%grid||!free(x,z))continue
    const width=style==='garden'?1.6:style==='storage'?.52:1
    c.structures.push({kind:'pillar',x:wx+x-(width-1)/2,y:wz+z-(width-1)/2,w:width,h:width,solid:true,data:{l1Column:style,l1Round:style==='parking'&&l1ParkingAt(seed,wx+x,wz+z).round?1:0,l1Dress:l1ParkingAt(seed,wx+x,wz+z).clean?0:Math.floor(l1Hash(wx+x,wz+z,seed^507)*5)}})
  }
  // The same absolute grid supplies both fixture meshes and illumination.
  const prop=(kind:string,x:number,z:number,w:number,h:number,deg=0)=>{
    for(let dz=Math.floor(z-.25);dz<Math.ceil(z+h+.25);dz++)for(let dx=Math.floor(x-.25);dx<Math.ceil(x+w+.25);dx++)if(dx<0||dz<0||dx>=32||dz>=32||c.tiles[dz*32+dx]!==1)return
    const sx=wx+x,sz=wz+z
    if(c.structures.some(s=>sx<s.x+s.w+.25&&sx+w+.25>s.x&&sz<s.y+s.h+.25&&sz+h+.25>s.y)||[...c.exits,...c.items,...c.entities,...(c.npcs??[])].some(q=>Math.hypot(q.x-sx,q.y-sz)<2))return
    c.structures.push({kind:'pillar',x:sx,y:sz,w,h,solid:true,data:{l1Prop:kind,deg}})
  }
  if(v==='parking'&&(photo?.id==='parking-props'||!photo&&l1Hash(cx,cy,seed^881)<.14)){
    for(let z=3;z<28;z++)for(let x=photo?.id==='parking-props'?15:3;x<26;x++)if(c.tiles[(z-1)*32+x]===2&&c.tiles[z*32+x]===1){
      prop('foldingtable',x,z+.5,1.55,.72);prop('seat',x+.25,z+1.7,.43,.43,160);prop('seat',x+1.1,z+1.9,.43,.43,205)
      prop('panel',x+2.5,z+.45,.9,.3);prop('extinguisher',x+3.9,z+.35,.25,.25);z=32;break
    }
  }
  if(photo?.id==='crate'&&cx===Math.floor(photo.centerX/32)&&cy===Math.floor(photo.centerY/32)){
    c.structures=c.structures.filter(s=>!reserve(s.x-wx,s.y-wz));c.entities=c.entities.filter(s=>!reserve(s.x-wx,s.y-wz))
    c.structures.push({kind:'crate',x:wx+16,y:wz+15,w:1,h:1,solid:true,data:{sid:((cx&255)<<24)|((cy&255)<<16)|(250<<4)|1,loot:1,l1Prop:'crate',l1Crate:1,l1Hidden:0,l1Stack:2,l1Number:1,l1UpperNumber:11}})
  }
  if(v==='maintenance'){
    if(photo?.id==='path-room'){
      prop('pathchair',17.4,23.4,.6,.7,180);prop('pathchair',17.65,21.65,.6,.7,172)
      prop('airunit',20.05,23.4,.25,.65,90);prop('caution',19.35,23.1,.3,.3)
    }else if(!photo&&l1Hash(cx,cy,seed^887)<.5){
      for(let z=3;z<28;z++)for(let x=3;x<28;x++)if(c.tiles[(z-1)*32+x]===2&&c.tiles[z*32+x]===1&&c.tiles[(z+1)*32+x]===1){prop('pathchair',x+.2,z+.5,.6,.7);z=32;break}
    }
  }
  // Sparse breadcrumbs lead towards the same existing outpost core; no discovery flags are set here.
  if(!photo&&!outpost&&v!=='maintenance'){
    const d=l1District(seed,cx,cy),ax=d.cx,ay=d.cy
    const target=l1Outpost(seed,ax,ay),dist=Math.abs(cx-ax)+Math.abs(cy-ay)
    if(target&&dist>=1&&dist<=3&&(cx===ax||cy===ay)&&c.tiles[16*32+16]===1)c.structures.push({kind:'wallsign',x:wx+16,y:wz+16,w:1,h:1,solid:false,data:{text:target.toUpperCase()+' / SHELTER',org:target,l1Waymark:1,targetX:ax*32+20.5,targetY:ay*32+20.5}})
  }
  c.lights=[]
  for(let z=0;z<32;z++)for(let x=0;x<32;x++){
    const sx=wx+x,sz=wz+z,style=v==='aisle'?l1TransitionStyle(seed,sx+.5,sz+.5):v
    const stride=style==='maintenance'?4:style==='storage'?6:8
    if(((sx-3)%stride+stride)%stride||((sz-3)%stride+stride)%stride||c.tiles[z*32+x]!==1)continue
    const parking=l1ParkingAt(seed,sx,sz),on=style!=='parking'||l1Hash(sx,sz,seed^97)<Math.max(.08,parking.brightness)
    c.lights.push({x:sx+.5,y:sz+.5,r:style==='garden'?8:style==='gothic'?4.8:6.5,
      color:l1Profile(style).lamp,gen:1,flickerSeed:l1Hash(sx,sz,seed)*100,intensityMul:on?1:0})
  }
  if(outpost)c.lights.push({x:wx+20.5,y:wz+20.5,r:7,color:'#fff2c8',gen:1,flickerSeed:0})
  if(photo?.id==='crate'&&cx===Math.floor(photo.centerX/32)&&cy===Math.floor(photo.centerY/32))c.lights.push({x:wx+16.5,y:wz+17.8,r:7,color:'#fff4d9',gen:1,flickerSeed:0})
  if((photo?.id==='parking-dim'||photo?.id==='parking-dark')&&cx===Math.floor(photo.centerX/32)&&cy===Math.floor(photo.centerY/32)){
    for(const [x,z]of [[11.5,5.5],[24.5,8.5]])c.lights.push({x:wx+x,y:wz+z,r:6.5,color:'#eef7f4',gen:1,flickerSeed:0})
  }
  for(const L of c.lights){
    const style=v==='aisle'?l1TransitionStyle(seed,L.x,L.y):v,p=l1Profile(style)
    L.fixZ=p.height-(style==='storage'?1.0:style==='garden'?.2:.45);L.noFix=1
    if(style==='gothic')L.fixZ=l1VaultHeight(L.x,L.y)-.24
    L.color=p.lamp
    L.intensityMul=(L.intensityMul??1)*(style==='garden'?.65:style==='storage'?1.05:style==='gothic'?.5:style==='parking'?Math.max(.65,l1ParkingAt(seed,L.x,L.y).brightness):.52)
    delete L.keep
    if(style==='garden')L.natural=1
  }
  // Side rooms use wall-side ceiling strips; they follow the same lighting and
  // blackout path as corridors, with no extra point lights or photo-only material.
  const sideRoom=v==='maintenance'?l1PathRoom(seed,cx,cy):null
  if(sideRoom)for(const L of c.lights)if(L.x>sideRoom.x0&&L.x<sideRoom.x1&&L.y>sideRoom.y0&&L.y<sideRoom.y1){
    L.x=sideRoom.x1-.32;L.fixZ=l1Profile(v).height-.16;L.intensityMul=.34
  }
  for(const s of c.structures)if(s.kind==='inkdoor'){
    s.data={...s.data,l1PathDoor:1}
    c.lights.push({x:s.x+s.w/2,y:s.y+s.h/2,r:1.65,color:'#6faa78',intensityMul:.06,keep:1,gen:1,noFix:1,fixZ:2.3,flickerSeed:0})
  }
  // wet[] and the visible puddles share the deterministic world-space footprint.
  for(const s of c.structures)if(s.data?.l1Crate){s.x+=(s.w-L1_CRATE.width)/2;s.y+=(s.h-L1_CRATE.depth)/2;s.w=L1_CRATE.width;s.h=L1_CRATE.depth}
  return c
}
