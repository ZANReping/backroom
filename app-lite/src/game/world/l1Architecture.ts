import { l1TransitionStyle, l1Outpost } from './l1Layout'
import { l1Puddles, l1PuddleContains } from './l1Puddles'
import type { GameMap } from './mapgen'
import type { GenChunk } from './infiniteRegistry'

export type L1Style = 'parking'|'storage'|'gothic'|'ouroboros'|'garden'|'aisle'|'maintenance'
export interface L1Profile { height:number; spacing:number; floor:string; wall:string; ceiling:string; lamp:string }
export const L1_PROFILES:Record<L1Style,L1Profile> = {
  parking:{height:3.6,spacing:8,floor:'#aaa99f',wall:'#c3c4bc',ceiling:'#b6b8b0',lamp:'#eff8ff'},
  storage:{height:6.4,spacing:8,floor:'#b8ac96',wall:'#f2f1e7',ceiling:'#8c8b80',lamp:'#fff9eb'},
  gothic:{height:3.8,spacing:5,floor:'#89816b',wall:'#aca58f',ceiling:'#aaa18b',lamp:'#f4d59c'},
  ouroboros:{height:4.8,spacing:8,floor:'#b9b1a0',wall:'#c2baa6',ceiling:'#40413f',lamp:'#f8f5e9'},
  garden:{height:6.4,spacing:8,floor:'#506132',wall:'#d0d1b6',ceiling:'#b3b895',lamp:'#fff1bc'},
  aisle:{height:3.6,spacing:8,floor:'#aaa99f',wall:'#c3c4bc',ceiling:'#b6b8b0',lamp:'#e8eee8'},
  maintenance:{height:3.6,spacing:8,floor:'#b5b3a8',wall:'#e1e0d6',ceiling:'#cccabf',lamp:'#e8e8e0'},
}
export const l1Profile=(v:string):L1Profile=>L1_PROFILES[v as L1Style]??L1_PROFILES.parking
// Cosmetic stream; never consumes the gameplay RNG. Works across negative chunks and window rebases.
export function l1Hash(x:number,z:number,salt=0):number {
  let h=Math.imul(Math.floor(x)^salt,374761393)^Math.imul(Math.floor(z),668265263)
  h=Math.imul(h^(h>>>13),1274126177); return ((h^(h>>>16))>>>0)/4294967296
}
export function l1StyleAt(m:GameMap,x:number,z:number):L1Style|undefined {
  if(!m.l1Architecture||!m.inf)return undefined
  const cx=Math.floor((x+m.inf.ox)/32),cy=Math.floor((z+m.inf.oy)/32)
  const v=m.inf.chunks.get(`${cx},${cy}`)?.variant as L1Style|undefined
  return v==='aisle'?l1TransitionStyle(m.inf.seed,x+m.inf.ox,z+m.inf.oy):v
}
// Cross vault underside: the maximum of two barrel vaults. Valleys meet at the column grid.
export function l1VaultHeight(wx:number,wz:number):number {
  const f=(v:number)=>{const t=((v-4.5)%5+5)%5,d=Math.min(t,5-t),u=Math.max(0,d-.48)/2.02;return Math.sqrt(Math.max(0,1-(1-u)**2))}
  return 1.92+1.88*Math.max(f(wx),f(wz))
}
export function l1VaultAt(m:GameMap,x:number,z:number):number {
  const ox=m.inf?.ox??0,oz=m.inf?.oy??0,wx=x+ox,wz=z+oz
  const gx=Math.round((wx-4.5)/5)*5+4.5,gz=Math.round((wz-4.5)/5)*5+4.5
  const c=m.inf?.chunks.get(`${Math.floor(gx/32)},${Math.floor(gz/32)}`)
  const supported=c?.structures.some(s=>s.data?.l1Column==='gothic'&&Math.abs(s.x+ox+.5-gx)<.01&&Math.abs(s.y+oz+.5-gz)<.01)
  const h=l1VaultHeight(wx,wz)
  if(supported||!c)return h
  const r=Math.max(Math.abs(wx-gx),Math.abs(wz-gz))/2.5,k=Math.min(1,r*r*(3-2*r))
  return 3.8+(h-3.8)*k
}
export function l1RoofAt(m:GameMap,x:number,z:number,fallback:number,underside=false):number {
  const v=l1StyleAt(m,x,z); if(!v)return fallback
  if(v==='gothic'&&underside)return l1VaultAt(m,x,z)
  return l1Profile(v).height
}

/** Apply the L1 visual and district rules after the base generator; use a separate deterministic stream. */
export function applyL1Architecture(c:GenChunk,cx:number,cy:number,seed=0):GenChunk {
  const v=c.variant as L1Style, wx=cx*32,wz=cy*32
  c.structures=c.structures.filter(s=>s.kind!=='car'&&s.kind!=='landmark')
  if(v==='maintenance'||v==='aisle'){
    let retained=0
    c.structures=c.structures.filter(s=>!s.data?.loot || (l1Hash(s.x,s.y,seed^409)<.18 && retained++<1))
  }
  c.wet.fill(0)
  if(v==='parking')for(const q of l1Puddles(seed,cx,cy))for(let z=1;z<31;z++)for(let x=1;x<31;x++)
    if(c.tiles[z*32+x]===1&&l1PuddleContains(q,wx+x+.5,wz+z+.5))c.wet[z*32+x]=1
  const outpost=l1Outpost(seed,cx,cy)
  if(outpost){
    const names:Record<string,string>={alpha:'M.E.G. ALPHA',tom:'TOM / DINER',bntg:'B.N.T.G. TRADE',ariane:'ARIANE / MEDICAL',cornucopia:'ARGOS / CORNUCOPIA'}
    // The core room belongs to the district, not a randomly placed isolated prop.
    for(let z=9;z<=23;z++)for(let x=9;x<=23;x++)c.tiles[z*32+x]=1
    c.structures=c.structures.filter(s=>!(s.x>=wx+10&&s.x<wx+23&&s.y>=wz+10&&s.y<wz+23&&!s.data?.sid))
    c.structures.push({kind:'landmark',x:wx+20,y:wz+20,w:1,h:1,solid:false,data:{outpost}})
    for(const [x,z] of [[11,11],[21,11],[11,21],[23,22]])c.structures.push({kind:'wallsign',x:wx+x,y:wz+z,w:1,h:1,solid:false,data:{text:names[outpost]+' / CORE',l1Waymark:1,targetX:wx+20.5,targetY:wz+20.5}})
    c.lights.push({x:wx+20.5,y:wz+20.5,r:7,color:'#fff2c8',keep:1,gen:1,flickerSeed:0})
  }
  if(v!=='maintenance'&&v!=='aisle')for(let j=0;j<(v==='storage'?5:3);j++){
    for(let trial=0;trial<20;trial++){
      const x=3+Math.floor(l1Hash(cx*97+j*11,cy*79+trial,seed^701)*25),z=3+Math.floor(l1Hash(cx*71+trial,cy*93+j*17,seed^717)*25)
      if(c.tiles[z*32+x]!==1||c.structures.some(s=>Math.hypot(s.x-wx-x,s.y-wz-z)<3)||[...c.exits,...c.items,...c.entities,...(c.npcs??[])].some(q=>Math.hypot(q.x-wx-x,q.y-wz-z)<3))continue
      if(cx===0&&cy===0&&Math.hypot(x-16,z-16)<5)continue
      c.structures.push({kind:'crate',x:wx+x,y:wz+z,w:1,h:1,solid:true,data:{sid:((cx&255)<<24)|((cy&255)<<16)|((240+j)<<4)|1,loot:1}});break
    }
  }
  // Stable reserve slots: hidden crates retain their identities and inventories.
  for(const s of c.structures)if(s.kind==='crate'&&s.data?.sid!==undefined){s.data.l1Crate=1;s.data.l1Hidden=l1Hash(s.x,s.y,seed^919)<.3?1:0}
  if(v==='aisle')for(const [x,z] of [[5,8],[5,24]])if(c.tiles[z*32+x]===1)c.structures.push({kind:'wallsign',x:wx+x,y:wz+z,w:1,h:1,solid:false,data:{text:'REF 08 / KEEP IN SIGHT',l1Waymark:1}})
  if(v==='maintenance')return c
  // Remove obsolete non-interactive scenery. Loot containers and NPC work anchors stay intact.
  c.structures=c.structures.filter(s=>s.kind!=='vaultcol' && !((v==='parking'||v==='aisle')&&s.kind==='pillar') &&
    !(v==='garden'&&['wheatpatch','hedgerow','glowshroom'].includes(s.kind)))
  const free=(x:number,z:number)=>{
    for(let dz=-1;dz<=1;dz++)for(let dx=-1;dx<=1;dx++){
      const xx=x+dx,zz=z+dz
      if(xx<1||zz<1||xx>=31||zz>=31||c.tiles[zz*32+xx]!==1)return false
    }
    const px=wx+x+.5,pz=wz+z+.5
    if(cx===0&&cy===0&&Math.hypot(x-15.5,z-15.5)<3)return false
    if(c.structures.some(s=>px>s.x-1.2&&px<s.x+s.w+1.2&&pz>s.y-1.2&&pz<s.y+s.h+1.2))return false
    return ![...c.items,...c.exits,...c.entities,...(c.npcs??[])].some(s=>Math.hypot(px-s.x,pz-s.y)<2)
  }
  for(let z=1;z<31;z++)for(let x=1;x<31;x++){
    const style=v==='aisle'?l1TransitionStyle(seed,wx+x+.5,wz+z+.5):v,grid=l1Profile(style).spacing,offset=style==='gothic'?4:6
    if(style==='maintenance')continue
    if(((wx+x-offset)%grid+grid)%grid||((wz+z-offset)%grid+grid)%grid||!free(x,z))continue
    c.structures.push({kind:'pillar',x:wx+x,y:wz+z,w:1,h:1,solid:true,data:{l1Column:style}})
  }
  for(const L of c.lights){
    const style=v==='aisle'?l1TransitionStyle(seed,L.x,L.y):v,p=l1Profile(style)
    L.fixZ=p.height-(style==='storage'?1.0:style==='garden'?.2:.45);L.noFix=1
    if(style==='gothic')L.fixZ=l1VaultHeight(L.x,L.y)-.24
    L.color=v==='ouroboros'&&l1Hash(L.x,L.y,27)>.82?'#ffdfa8':p.lamp
    L.intensityMul=v==='garden'?1.3:v==='storage'?1.05:v==='gothic'?.42:.8
    if(style==='garden'){L.natural=1;L.keep=1}
  }
  // wet[] and the visible puddles share the deterministic world-space footprint.
  return c
}

