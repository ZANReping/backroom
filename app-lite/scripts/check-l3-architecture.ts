import assert from 'node:assert/strict'
import {genL3ChunkRaw,l3CorrW,l3VariantOf} from '../src/game/world/infiniteL3'
import {L3} from '../src/game/levels/l3'
import {l3FenceFinish,l3HasPurpleBrick,findL3PurpleBrick} from '../src/game/world/l3Variations'
import type {GameMap} from '../src/game/world/mapgen'
const variants=['lit','dark','narrow','assembly','genhall','boiler','sanct']
let chunks=0,exhibits=0,services=0,risers=0,blackFences=0,paleFences=0
for(const seed of [424242,17,91231])for(const v of variants)for(const [cx,cy]of [[0,0],[2,3],[-3,-2],[7,-4]]) {
 const a=genL3ChunkRaw(L3,seed,cx,cy,v),b=genL3ChunkRaw(L3,seed,cx,cy,v);assert.deepEqual(a,b);chunks++
 const at=(x:number,y:number)=>a.tiles[(y-cy*32)*32+x-cx*32]===1
 if(['assembly','sanct','genhall','boiler'].includes(v)){
  const margin=v==='boiler'?11:v==='genhall'?3:2,ring=margin-1,far=32-margin
  let wall=0,total=0
  for(let i=margin;i<32-margin;i++)for(const[x,y]of [[i,ring],[i,far],[ring,i],[far,i]]){total++;if(a.tiles[y*32+x]!==1)wall++}
  assert(wall/total>.75,'exterior bypass must not erase the enclosing room walls')
  // The public corridor touches the room facade directly: there is no second
  // solid ring between it and the room wall, including the small boiler room.
  for(let i=margin;i<32-margin;i++)for(const[x,y]of [[i,ring-1],[i,far+1],[ring-1,i],[far+1,i]])
   assert.equal(a.tiles[y*32+x],1,`${v} corridor directly touches facade ${cx},${cy}`)
 }
 if(v==='genhall'||v==='boiler') {
  const doors=a.structures.filter(s=>s.data?.l3Iron);assert.equal(doors.length,1,`${v} one iron entrance ${cx},${cy}`)
  const d=doors[0];assert(at(d.x,d.y));assert.equal(d.data?.locked,0)
  assert(a.structures.some(s=>v==='boiler'?s.kind==='sphboiler':s.kind==='turbinegen'),`${v} equipment required`)
  // Room centre reaches outer bypass when the door is treated as open.
  const seen=new Set<number>(),q=[16*32+16];seen.add(q[0]);for(let i=0;i<q.length;i++){const p=q[i],x=p%32,y=Math.floor(p/32);for(const [dx,dy]of [[1,0],[-1,0],[0,1],[0,-1]]){const xx=x+dx,yy=y+dy,j=yy*32+xx;if(xx>=0&&xx<32&&yy>=0&&yy<32&&a.tiles[j]===1&&!seen.has(j)){seen.add(j);q.push(j)}}}
  assert(q.some(j=>j%32===0||j%32===31||j<32||j>=31*32),'room reaches natural exterior corridors')
  for(let t=0;t<32;t++)for(const j of [t,31*32+t,t*32,t*32+31])if(a.tiles[j]===1)assert(seen.has(j),'all exterior corridor mouths remain connected')
  const dx=d.x-cx*32,dy=d.y-cy*32,alongX=!!d.data?.rot
  const direction=(alongX?dx:dy)<16?-1:1
  // Sightline from the exterior corridor all the way to the actual iron door.
  for(let step=1;step<32;step++){
   const x=dx+(alongX?step*direction:0),y=dy+(alongX?0:step*direction)
   if(x<0||x>31||y<0||y>31)break
   assert.equal(a.tiles[y*32+x],1,`${v} door visible straight from corridor`)
  }
 }
 if(v==='sanct'){
  assert.equal(a.structures.filter(s=>s.kind==='angelstatue').length,1);assert.equal(a.entities.length,0);assert.equal(a.structures.filter(s=>s.data?.l3Column).length,8)
  const windows=a.structures.filter(s=>s.kind==='stainedglass');assert(windows.length,'three-figure stained glass present')
  for(let i=0;i<windows.length;i++){
   const w=windows[i];assert.equal(w.data?.geometryOnly,1);assert(!w.data?.tex,'no image used for glass')
   for(const other of windows.slice(i+1))assert(Math.hypot(w.x-other.x,w.y-other.y)>=(Number(w.data?.pw)+Number(other.data?.pw))/2+.39,'glass windows do not overlap')
  }
 }
 for(const f of a.structures.filter(s=>s.data?.sealedExhibit)) {
  exhibits++;assert(f.solid);assert.equal(f.kind,'barfence');assert(!a.structures.some(s=>s.kind==='bargate'&&s.x===f.x&&s.y===f.y))
  const statue=a.structures.find(s=>s.data?.exhibit&&Math.abs(s.y-f.y)<=3&&Math.abs(s.x-f.x)<=3);assert(statue)
  // Flood-fill from the statue, treating the entire fence plane as blocked.
  const start=(statue.y-cy*32)*32+statue.x-cx*32,seen=new Set<number>([start]),q=[start]
  for(let i=0;i<q.length;i++){const p=q[i],x=p%32,y=Math.floor(p/32);for(const[dx,dy]of [[1,0],[-1,0],[0,1],[0,-1]]){const xx=x+dx,yy=y+dy,j=yy*32+xx;if(xx<0||xx>31||yy<0||yy>31||a.tiles[j]!==1||seen.has(j))continue;const wx=xx+cx*32,wy=yy+cy*32;if(wx>=f.x&&wx<f.x+f.w&&wy>=f.y&&wy<f.y+f.h)continue;seen.add(j);q.push(j)}}
  assert(seen.size<=12,'sealed exhibit cannot be reached by a route around its fence')
 }
 services+=a.structures.filter(s=>s.kind==='l3service').length;risers+=a.structures.filter(s=>s.kind==='electricalriser').length
 for(const s of a.structures.filter(s=>s.kind==='barfence'||s.kind==='bargate')){
  assert.equal(s.data?.l3FenceFinish,l3FenceFinish(seed,s))
  if(s.data?.l3FenceFinish==='black')blackFences++;else paleFences++
 }
 for(const l of a.lights){assert(Number.isFinite(l.fixZ));assert(l.fixZ!>0&&l.fixZ!<8.4)}
}
assert(exhibits>0);assert(services>0);assert(risers>0)
let narrow=0;for(let k=-80;k<80;k++)for(let r=-80;r<80;r++)if(l3CorrW(12345,k,r)===1)narrow++
assert(narrow/(160*160)<.05,'one tile passages are significantly rarer than original 18%')
const count:Record<string,number>={};for(let x=-50;x<=50;x++)for(let y=-50;y<=50;y++){const v=l3VariantOf(424242,x,y);count[v]=(count[v]??0)+1}
assert(count.narrow>0&&count.narrow<count.assembly);assert(count.sanct<count.boiler)
assert(blackFences>0&&paleFences>0,'both fence finishes naturally generate')
let purpleEligible=0,purplePlaced=0
for(let cx=-80;cx<80;cx++)for(let cz=-80;cz<80;cz++){
 if(!l3HasPurpleBrick(424242,cx,cz))continue
 purpleEligible++
 const a=genL3ChunkRaw(L3,424242,cx,cz,'lit')
 const map={w:32,h:32,tiles:a.tiles,tint:a.tint,structures:a.structures.map(s=>({...s,x:s.x-cx*32,y:s.y-cz*32})),inf:{seed:424242,ox:cx*32,oy:cz*32,chunks:new Map([[`${cx},${cz}`,{variant:'lit'}]])}} as unknown as GameMap
 const brick=findL3PurpleBrick(map,cx,cz)
 if(brick){purplePlaced++;assert(brick.width<.3&&brick.height<.1,'alteration is one real brick');assert.deepEqual(brick,findL3PurpleBrick(map,cx,cz),'stable position across rebuilds');assert(brick.y+brick.height/2<2.6,'stays below concrete fascia')}
}
assert(purpleEligible>20&&purpleEligible<90,'purple bricks are extremely rare, about one eligible chunk in 512');assert(purplePlaced>0)
console.log(JSON.stringify({chunks,exhibits,services,risers,blackFences,paleFences,purpleEligible,purplePlaced,purpleSampleChunks:25600,narrowSegmentRate:narrow/25600,biomes:count},null,2))
