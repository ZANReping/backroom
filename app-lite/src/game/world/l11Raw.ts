import type { GenChunk } from './infiniteRegistry'
import type { LevelDef, Structure, FloorBand } from '../core/types'
import { L11_PEOPLE, l11Resident } from '../content/l11People'
import { l11Anchors, l11Axis, l11Buildings, l11Door, l11Hash, l11Rand, l11SurfaceAt, l11VariantOf, type L11Variant } from './l11Layout'

export function genL11ChunkRaw(def: LevelDef, seed: number, cx: number, cy: number, forced?: string, revision = 0): GenChunk {
  const fv = forced as L11Variant | undefined, variant = fv ?? l11VariantOf(seed, cx, cy)
  const wx = cx * 32, wy = cy * 32, n = 1024
  const raw: GenChunk = { variant, tiles: new Uint8Array(n).fill(1), wet: new Uint8Array(n), elev: new Uint8Array(n),
    step: new Uint8Array(n), tint: new Uint8Array(n), crawl: new Uint8Array(n), outdoor: new Uint8Array(n).fill(1), ceiling: new Uint8Array(n),
    liquid: new Uint8Array(n), seaFloor: new Float32Array(n), dn: new Uint8Array(n), dnWall: new Uint8Array(n),
    up: new Uint8Array(n), upWall: new Uint8Array(n), up2: new Uint8Array(n), upWall2: new Uint8Array(n), stair: new Uint32Array(n),
    structures: [], items: [], lights: [], exits: [], entities: [], npcs: [] }
  const owns = (x: number, y: number) => x >= wx && x < wx + 32 && y >= wy && y < wy + 32
  const at = (x: number, y: number) => owns(x, y) ? Math.floor(y - wy) * 32 + Math.floor(x - wx) : -1
  const add = (kind: Structure['kind'], x: number, y: number, w = 1, h = 1, solid = false, data: Structure['data'] = {}, floor: FloorBand = 0) => {
    if (owns(x, y)) raw.structures.push({ kind, x, y, w, h, solid, floor, data })
  }
  const sid = (x: number, y: number, salt: number) => l11Hash(seed, Math.round(x * 10), Math.round(y * 10), salt)
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
    const i = y * 32 + x, px = wx + x + .5, py = wy + y + .5
    const s = l11SurfaceAt(seed, px, py, fv)
    raw.tint[i] = s.kind === 'road' || s.kind === 'bridge' ? 51 : s.kind === 'grass' ? 54 : s.kind === 'canal' ? 55 : s.kind === 'plaza' ? 53 : 52
    if (s.kind === 'canal') { raw.liquid![i] = 1; raw.seaFloor![i] = 2.6 }
    // Rail tunnels share the arterial X axis. Stations and entry steps are separate structures.
    const tunnelX=Math.round((px-16)/512)*512+16
    if (Math.abs(px-tunnelX)<4) raw.dn![i] = 1
    if (s.kind === 'sidewalk' && ((wx + x) % 20 === 6 || (wy + y) % 20 === 6)) {
      const ax = l11Axis(px), ay = l11Axis(py)
      const alongX = ay.distance < ax.distance, d = alongX ? ay : ax
      if (Math.abs(d.distance - d.width / 2 - 1) < .6) {
        const dir = (alongX ? py : px) > d.road ? -1 : 1
        add('streetlamp', px - .25, py - .25, .5, .5, true, { mode: 2, deg: alongX ? dir < 0 ? 90 : 270 : dir > 0 ? 0 : 180 })
        raw.lights.push({ x: px, y: py, r: 8, color: '#ffe4b9', intensityMul: .4, noFix: 1, gen: 1, flickerSeed: 0, occluded: 1, outdoorOnly: 1 })
      }
    }
  }
  for (const b of l11Buildings(seed, wx, wy, wx + 32, wy + 32, fv)) {
    const door = l11Door(b)
    for (let y = Math.max(wy,b.y); y < Math.min(wy+32,b.y+b.h); y++) for (let x = Math.max(wx,b.x); x < Math.min(wx+32,b.x+b.w); x++) {
      const i = at(x,y), edge = x === b.x || y === b.y || x === b.x+b.w-1 || y === b.y+b.h-1
      const isDoor = y === door.y && x === door.x
      const window = edge && !isDoor && x > b.x && x < b.x+b.w-1 && (x-b.x)%4 === 2 || edge && !isDoor && y > b.y && y < b.y+b.h-1 && (y-b.y)%4 === 2
      raw.tiles[i] = b.sealed || (edge && !isDoor && !window) ? 2 : 1
      raw.outdoor![i] = 0; raw.tint[i] = b.use === 0 ? 57 : 56
      if (b.accessible > 1) { raw.up![i] = edge ? 0 : 1; raw.upWall![i] = edge ? 1 : 0 }
      if (b.accessible > 2) { raw.up2![i] = edge ? 0 : 1; raw.upWall2![i] = edge ? 1 : 0 }
      if (window && !b.sealed) add('l11window',x,y,1,1,true,{ axis: x === b.x || x === b.x+b.w-1 ? 1 : 0, sid: sid(x,y,34) })
    }
    add('l11building',b.x,b.y,b.w,b.h,b.sealed,{ ...b, buildingId: b.id, sid: sid(b.x,b.y,1) })
    if (b.sealed) continue
    add('hoteldoor', door.x,door.y,1,1,true,{ open:0, locked:0, sid:sid(b.x,b.y,2), l11:1, buildingId:b.id })
    for (let floor = 0; floor < b.accessible; floor++) {
      const fl = floor as FloorBand, off = { buildingId: b.id, l11Interior: 1, use: b.use }
      const partitionY=b.y+Math.floor(b.h/2),gapX=b.x+Math.floor(b.w/2)
      for(let x=b.x+1;x<b.x+b.w-5;x++){
        if(Math.abs(x-gapX)<=1)continue
        const i=at(x,partitionY)
        if(i>=0){if(floor===0)raw.tiles[i]=2;else if(floor===1)raw.upWall![i]=1;else raw.upWall2![i]=1}
        add('l11partition',x,partitionY,1,1,false,{buildingId:b.id},fl)
      }
      add('l11prop',b.x+3,b.y+3,2.5,1.1,true,{ ...off, prop: b.use === 0 ? 'sofa' : b.use === 3 || b.use === 6 ? 'shelf' : 'desk' },fl)
      add('l11prop',b.x+3,b.y+6,1,1,true,{ ...off, prop: 'chair' },fl)
      add('l11prop',b.x+b.w-5,b.y+3,2,1,true,{ ...off, prop: b.use === 0 ? 'kitchen' : 'shelf' },fl)
      add('l11prop',b.x+b.w-5,b.y+7,1,1,true,{ ...off, prop: 'sink', sid:sid(b.x,b.y,100+floor) },fl)
      add('l11prop',b.x+3,b.y+b.h-4,2,1,true,{ ...off, prop: b.use === 0 ? 'bed' : b.use === 9 ? 'exhibit' : 'desk' },fl)
      add('l11prop',b.x+6,b.y+1.15,1.8,.22,false,{ ...off, prop:'radiator' },fl)
      add('locker',b.x+b.w-3,b.y+3,1,1,true,{ ...off, sid:sid(b.x,b.y,200+floor), lootItems: floor === 0 ? ['almond', 'pamphlet'] : ['battery'] },fl)
      if (owns(b.x+6,b.y+6)) raw.lights.push({ x:b.x+6,y:b.y+6,z:floor*3,r:8,color:'#f1e8ce',intensityMul:.45,occluded:1,gen:1,flickerSeed:0 })
    }
    for (let floor=0;floor<b.accessible-1;floor++) {
      const sy = b.y + b.h - 9, sx = b.x + b.w - 4 - floor*3
      for (let k=0;k<6;k++) for (let dx=0;dx<2;dx++) {
        const i=at(sx+dx,sy+k); if(i<0)continue
        raw.stair![i] = 3 | ((floor*300+k*50)<<3) | ((floor*300+(k+1)*50)<<17)
        raw.ceiling![i]=1; raw.up![i]=1; if(floor===1)raw.up2![i]=1
      }
      add('l11stair',sx,sy,2,6,false,{ base:floor*3, buildingId:b.id })
    }
    if (b.floors>b.accessible) add('l11prop',b.x+b.w-4,b.y+2,1,1,true,{ prop:'lockedlift',sid:sid(b.x,b.y,300) })
  }
  const anchors = l11Anchors(seed)
  for (const key of ['capital','timesquare','beta'] as const) {
    const p=anchors[key]
    add('l11landmark',p.x,p.y,1,1,false,{ citySite:key, sid:sid(p.x,p.y,11), ...(key==='beta'?{outpost:'beta'}:{}) })
    if (key==='beta') add('l11prop',p.x-8,p.y+4,16,7,true,{prop:'betagate'})
    else {
      add('l11prop',p.x-8,p.y-2,4,2,true,{prop:key==='capital'?'memorial':'market'})
      add('l11prop',p.x+7,p.y-2,3,2,true,{prop:'market'})
      const named=L11_PEOPLE.find(n=>n.id===(key==='capital'?'l11_caretaker':'l11_trader'))!
      if(owns(p.x+3,p.y+2))raw.npcs!.push({def:named,x:p.x+3,y:p.y+2,facing:Math.PI})
    }
  }
  // Sparse population outside named districts; evenly spaced inhabitants around their central plaza.
  const center=variant==='capital'?anchors.capital:variant==='timesquare'?anchors.timesquare:null
  if(center)for(let k=0;k<14;k++) {
    const ang=k*Math.PI*2/14,px=center.x+Math.cos(ang)*17,py=center.y+Math.sin(ang)*17
    if(owns(px,py))raw.npcs!.push({def:l11Resident(`l11_${variant}_${k}`,variant==='capital'?'capital':'bntg',k),x:px,y:py,facing:ang})
  }
  if(!center&&l11Rand(seed,120,cx,cy)<.065) {
    const i=Array.from(raw.tint).findIndex((t,i)=>t===52&&raw.outdoor![i]===1)
    if(i>=0)raw.npcs!.push({def:l11Resident(`l11_resident_${cx}_${cy}`,'wanderer',l11Hash(seed,cx,cy)%6),x:wx+i%32+.5,y:wy+Math.floor(i/32)+.5})
  }
  if(Math.hypot(wx,wy)>100&&l11Rand(seed,121,cx,cy)<.16) {
    const i=Array.from(raw.tint).findIndex((t,i)=>(t===51||t===52)&&raw.outdoor![i]===1)
    const r=l11Rand(seed,122,cx,cy)
    if(i>=0)raw.entities.push({type:r<.55?'faceling':r<.9?'hound':r<.96?'deathmoth':'duller',x:wx+i%32+.5,y:wy+Math.floor(i/32)+.5,calm:r<.9})
  }
  const road=Array.from(raw.tint).findIndex((t,i)=>t===51 && (i%32)>3 && i%32<28 && i>96 && i<928)
  if(road>=0 && l11Rand(seed,123,cx,cy)<.36) {
    const x=wx+road%32,y=wy+Math.floor(road/32),a=l11SurfaceAt(seed,x,y)
    add('car',x,y,a.roadX?4:1.8,a.roadX?1.8:4,true,{sid:sid(cx,cy,702),lootItems:['battery'],deg:a.roadX?90:0,color:['#85857b','#4f6067','#aeafa9'][l11Hash(seed,cx,cy,revision)%3]})
  }
  for(let k=0;k<4;k++) {
    const x=wx+4+k*7,y=wy+5+l11Hash(seed,cx,cy,k)%20,i=at(x,y)
    if(raw.outdoor![i]!==1||raw.tiles[i]!==1||raw.liquid![i])continue
    if(raw.tint[i]===54) add('l11prop',x,y,1,1,true,{prop:'tree',style:l11Hash(seed,x,y)%3})
    else if(raw.tint[i]===52) add('l11prop',x,y,1,1,true,{prop:k%2?'bin':'bench',revision,style:l11Hash(seed,x,y,revision)%3})
  }
  if(l11Rand(seed,124,cx,cy)<.08) {
    const i=raw.tint.findIndex((t,i)=>t===52&&raw.tiles[i]===1&&raw.outdoor![i]===1)
    if(i>=0)add('l11prop',wx+i%32,wy+Math.floor(i/32),1,1,false,{prop:'anomaly',sid:sid(cx,cy,800),style:revision%4})
  }
  // Both source routes are actual, fixed exits. Signs do not pretend to lead to unimplemented levels.
  for(const [kind,x,y] of [['l11roadback',26,47],['countrypath',47,26]] as const) {
    const ed=def.exits.find(e=>e.kind===kind)
    if(ed&&owns(x,y))raw.exits.push({def:ed,x,y,discovered:false})
  }
  // Fixed metro stairs connect the ground concourse to the true -1 floor (no fake black doorway).
  const stationY=Math.floor((wy-40)/192)*192+40
  for(let sy=stationY;sy<wy+32;sy+=192) {
    const sx=Math.ceil((wx-29)/512)*512+26
    if(sx>=wx-16&&sx<wx+32&&sy>=wy-16) {
      add('l11subway',sx,sy,3,10,false,{sid:sid(sx,sy,801)})
      for(let y=sy;y<sy+10;y++)for(let x=sx;x<sx+3;x++) {
        const i=at(x,y);if(i<0)continue
        raw.tiles[i]=1;raw.outdoor![i]=1;raw.dn![i]=1;raw.tint[i]=58
      }
      for(let y=sy+7;y<sy+13;y++)for(let x=sx-14;x<sx+4;x++) {const i=at(x,y);if(i>=0)raw.dn![i]=1}
    }
  }
  return raw
}
