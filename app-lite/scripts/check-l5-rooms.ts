import assert from 'node:assert/strict'
import { LEVELS } from '../src/game/levels'
import '../src/game/world/mapgen'
import { genL5ChunkRaw,l5CorridorAt,l5CorrX,l5RowY,l5RegionAt,l5ServiceLayout } from '../src/game/world/infiniteL5'
import { L5_DECOR_DEFS } from '../src/game/content/l5Decor'
import { DECOR_REGISTRY } from '../src/game/content/decorRegistry'

const seed=424242,def=LEVELS[5],chunks=new Map<string,ReturnType<typeof genL5ChunkRaw>>()
function chunk(x:number,y:number){const cx=Math.floor(x/32),cy=Math.floor(y/32),key=`${cx},${cy}`;let c=chunks.get(key);if(!c){c=genL5ChunkRaw(def,seed,cx,cy);chunks.set(key,c)}return c}
function tile(x:number,y:number){const c=chunk(x,y),i=((y%32+32)%32)*32+(x%32+32)%32;return{t:c.tiles[i],tint:c.tint[i]}}
const rooms=new Map<string,NonNullable<ReturnType<typeof l5RegionAt>>>()
for(let x=-260;x<=260;x+=8)for(let y=-260;y<=260;y+=8){const r=l5RegionAt(seed,x,y);if(r)rooms.set(`${r.x0},${r.y0}`,r)}
let halls=0,staffDoors=0,locked=0,boilers=0,plant=0,gallery=0,portals=0
for(const r of rooms.values()){
  if(!['maintenance','beverly','boilerroom'].includes(r.variant))continue
  const pieces:ReturnType<typeof genL5ChunkRaw>[]=[]
  for(let cy=Math.floor((r.y0-1)/32);cy<=Math.floor((r.y1+1)/32);cy++)for(let cx=Math.floor((r.x0-1)/32);cx<=Math.floor((r.x1+1)/32);cx++)pieces.push(chunk(cx*32,cy*32))
  const inside=(s:{x:number;y:number})=>s.x>=r.x0-1&&s.x<=r.x1+1&&s.y>=r.y0-1&&s.y<=r.y1+1
  const all=pieces.flatMap(c=>c.structures).filter(inside),doors=all.filter(s=>s.kind==='hoteldoor'),frames=all.filter(s=>s.kind==='ceilingbeam'&&s.data?.profile==='portal')
  for(const d of doors)assert(frames.some(f=>f.x===d.x&&f.y===d.y),'door must have aligned threshold/frame')
  portals+=frames.length
  if(r.variant==='maintenance'){
    halls++
    const serviceDoors=doors.filter(d=>d.data?.serviceEntry===1),staff=doors.filter(d=>d.data?.staff===1)
    assert.equal(staff.length,4,'maintenance keeps four external staff doors')
    assert.equal(serviceDoors.length,2,'maintenance exposes two boiler service doors')
    assert(staff.every(d=>!d.data?.serviceEntry));assert(serviceDoors.every(d=>!d.data?.staff&&!d.data?.locked&&d.data?.profile==='boilerroom'))
    staffDoors+=staff.length;locked+=staff.filter(d=>d.data?.locked).length
    assert(all.some(s=>s.kind==='cabinet'&&s.data?.profile==='maintenance'))
    assert(all.some(s=>s.kind==='hotelwindow'&&s.data?.profile==='serviceLift'))
    // Internal partitions must remain connected, including all external doorway approaches.
    const walk=new Set<string>()
    for(let y=r.y0-1;y<=r.y1+1;y++)for(let x=r.x0-1;x<=r.x1+1;x++)if(tile(x,y).t===1&&!all.some(s=>s.solid&&s.kind!=='hoteldoor'&&x>=s.x&&x<s.x+s.w&&y>=s.y&&y<s.y+s.h))walk.add(`${x},${y}`)
    const first=walk.values().next().value!;const seen=new Set([first]),q=[first]
    while(q.length){const[x,y]=q.pop()!.split(',').map(Number);for(const[dx,dy]of[[1,0],[-1,0],[0,1],[0,-1]]){const k=`${x+dx},${y+dy}`;if(walk.has(k)&&!seen.has(k)){seen.add(k);q.push(k)}}}
    assert.equal(seen.size,walk.size,'partitioned maintenance rooms remain connected')
  }else if(r.variant==='beverly'){
    assert.equal(doors.length,doors.some(d=>d.data?.mothNest)?7:8);assert.equal(all.filter(s=>s.kind==='oddtable').length,1);assert.equal(all.filter(s=>s.kind==='chandelier'&&s.data?.profile==='beverly').length,1)
    assert(all.some(s=>s.kind==='wallsign'&&s.data?.text==='贝弗莉室'&&s.data?.silver))
    assert(!all.some(s=>['sofa','boiler','dtable','rug'].includes(s.kind)),'ballroom stays empty around its one table')
  }else{
    const boilerModels=all.filter(s=>s.kind==='boiler'&&s.w===2&&s.h===3)
    boilers+=boilerModels.length
    assert.equal(boilerModels.length>0,true,'boiler region has a large boiler')
    const service=(() => {
      for(let hk=-20;hk<=20;hk++)for(let hr=-20;hr<=20;hr++){
        const layout=l5ServiceLayout(seed,hk,hr)
        if(layout.boilers.some(b=>b.x0===r.x0&&b.y0===r.y0&&b.x1===r.x1&&b.y1===r.y1))return layout
      }
      return null
    })()
    assert(service,'boiler region belongs to a maintenance service layout')
    const bi=service!.boilers.findIndex(b=>b.x0===r.x0&&b.y0===r.y0&&b.x1===r.x1&&b.y1===r.y1)
    const entry=service!.entries[bi],entryDoor=all.filter(s=>s.kind==='hoteldoor'&&s.data?.serviceEntry===1&&s.x===entry.x&&s.y===entry.y)
    assert.equal(entryDoor.length,1,'boiler has one maintenance entry door')
    assert(!entryDoor[0].data?.locked&&!entryDoor[0].data?.staff&&entryDoor[0].data?.profile==='boilerroom')
    assert.equal(tile(entry.x,entry.y-1).tint,25,'boiler service entry is on maintenance floor')
    const perimeter=new Set<string>()
    for(let x=r.x0-1;x<=r.x1+1;x++){perimeter.add(`${x},${r.y0-1}`);perimeter.add(`${x},${r.y1+1}`)}
    for(let y=r.y0;y<=r.y1;y++){perimeter.add(`${r.x0-1},${y}`);perimeter.add(`${r.x1+1},${y}`)}
    const openPerimeter=[...perimeter].filter(k=>{const [x,y]=k.split(',').map(Number);return tile(x,y).t===1})
    assert.deepEqual(openPerimeter,[`${entry.x},${entry.y}`],'boiler has no public corridor opening')
    const walk=new Set<string>()
    for(let y=r.y0-1;y<=r.y1+1;y++)for(let x=r.x0-1;x<=r.x1+1;x++)if(tile(x,y).t===1&&!all.some(s=>s.solid&&s.kind!=='hoteldoor'&&x>=s.x&&x<s.x+s.w&&y>=s.y&&y<s.y+s.h))walk.add(`${x},${y}`)
    const first=walk.values().next().value!;const seen=new Set([first]),q=[first]
    while(q.length){const[x,y]=q.pop()!.split(',').map(Number);for(const[dx,dy]of[[1,0],[-1,0],[0,1],[0,-1]]){const k=`${x+dx},${y+dy}`;if(walk.has(k)&&!seen.has(k)){seen.add(k);q.push(k)}}}
    assert.equal(seen.size,walk.size,'boiler machinery and service aisle remain connected')
    const t=tile(Math.floor((r.x0+r.x1)/2),Math.floor((r.y0+r.y1)/2)).tint
    if(t===24)plant++;if(t===67)gallery++
    assert(all.some(s=>s.kind==='piperack'||s.kind==='pipes'))
  }
}
assert(halls>0&&staffDoors>0&&locked/staffDoors>.85);assert(boilers>0&&plant>0&&gallery>0&&portals>0)
let whiteJunctions=0
for(let k=-12;k<=12;k++)for(let r=-12;r<=12;r++){
  const x=l5CorrX(seed,k)+1,y=l5RowY(seed,r)
  // Look outside the crossing to identify each wing's independent style.
  const v=l5CorridorAt(seed,x,y-5),h=l5CorridorAt(seed,x+6,y)
  if(!v.plain&&!h.plain)continue
  for(let xx=x-1;xx<=x+1;xx++)for(let yy=y;yy<y+2;yy++){
    if(l5RegionAt(seed,xx,yy))continue
    assert(l5CorridorAt(seed,xx,yy).plain);assert.equal(tile(xx,yy).tint,60);whiteJunctions++
  }
}
assert(whiteJunctions>0)
assert.equal(new Set(L5_DECOR_DEFS.map(d=>d.id)).size,25)
for(const d of L5_DECOR_DEFS){const rows=DECOR_REGISTRY.filter(r=>r.id===d.id);assert.equal(rows.length,1);assert(!rows[0].container&&!rows[0].interactive)}
console.log(`L5 room checks passed: ${halls} maintenance complexes / ${staffDoors} staff doors, ${boilers} large boilers, ${plant}/${gallery} plant/gallery rooms, ${whiteJunctions} white junction tiles, 25 reusable decorations.`)
