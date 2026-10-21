// Level 4 v2 (continuous building) generation checks.
import assert from 'node:assert/strict'
import {genL4ChunkRaw,l4SpawnElevSlot,L4_SPAWN} from '../src/game/world/infiniteL4'
import {l4Block,l4BlockIndex,l4InteriorAt} from '../src/game/world/l4Plan'
import {L4} from '../src/game/levels/l4'
import {CS} from '../src/game/world/infinite'
let pass=0,fail=0
const ok=(c:boolean,msg:string)=>{if(c)pass++;else{fail++;if(fail<40)console.log('FAIL',msg)}}
const stats:Record<string,number>={hall:0,cubicle:0,open:0,rooms:0}
let coolers=0,reveals=0,windows=0,stairs=0,elev=0,trap=0,old=0,vending=0,floorTiles=0,tot=0,ents=0,chunksN=0
for(const seed of [424242,17,9091]){
  const R=6,chunks=new Map<string,ReturnType<typeof genL4ChunkRaw>>()
  for(let cy=-R;cy<=R;cy++)for(let cx=-R;cx<=R;cx++){
    const c=genL4ChunkRaw(L4,seed,cx,cy);chunks.set(`${cx},${cy}`,c);chunksN++
    if(Math.abs(cx)<=1&&Math.abs(cy)<=1)ok(JSON.stringify(c)===JSON.stringify(genL4ChunkRaw(L4,seed,cx,cy)),`deterministic ${seed} ${cx},${cy}`)
    ok(c.tiles.every(t=>t===1||t===2),`no void tiles ${seed} ${cx},${cy}`)
    ok(c.outdoor!.every(v=>v===0),`no outdoor ${seed} ${cx},${cy}`)
    for(const l of c.lights){const i=(Math.floor(l.y)-cy*CS)*CS+Math.floor(l.x)-cx*CS;ok(c.tiles[i]===1,`light on floor ${l.x},${l.y}`)}
    const ids=c.structures.map(s=>s.data?.sid);ok(new Set(ids).size===ids.length,`unique sid ${seed} ${cx},${cy}`)
    for(const s of c.structures){
      ok(s.x>=cx*CS&&s.x<(cx+1)*CS&&s.y>=cy*CS&&s.y<(cy+1)*CS,`struct in chunk ${s.kind}`)
      if(s.kind==='windowblack'||s.kind==='windowtrap')ok(false,'no blacked/trap windows in v2')
      if(s.data?.l4Facade){windows++
        const deg=Number(s.data.deg),dx=deg===90?1:deg===270?-1:0,dy=deg===0?1:deg===180?-1:0
        // outside of a facade window is the strip's wall, inside is walkable interior
        ok(!l4InteriorAt(seed,s.x+dx,s.y+dy),`facade window backs onto strip ${s.x},${s.y}`)
        ok(l4InteriorAt(seed,s.x-dx,s.y-dy),`facade window faces interior ${s.x},${s.y}`)
        // reveal side plates must sit against the pier (wall tile), never mid-bay against another window
        for(const side of [-1,1])if(s.data[side<0?'revealLeft':'revealRight']){
          const r=deg*Math.PI/180,nx=Math.floor(s.x)+Math.round(side*Math.cos(r)),ny=Math.floor(s.y)+Math.round(-side*Math.sin(r))
          if(nx>=cx*CS&&nx<(cx+1)*CS&&ny>=cy*CS&&ny<(cy+1)*CS){reveals++;ok(c.tiles[(ny-cy*CS)*CS+nx-cx*CS]===2&&!c.structures.some(o=>o.data?.l4Facade&&Math.floor(o.x)===nx&&Math.floor(o.y)===ny),`window reveal against pier ${s.x},${s.y} deg ${deg}`)}
        }
      }
      if(s.kind==='watercooler'){coolers++;ok(c.tiles[(Math.floor(s.y)-cy*CS)*CS+Math.floor(s.x)-cx*CS]===1,`watercooler on floor ${s.x},${s.y}`)}
      if(s.kind==='l4stairs')stairs++;if(s.kind==='vending')vending++
    }
    for(const e of c.exits){if(e.def.kind==='elevatorshaft')elev++;if(e.def.kind==='trapdoor')trap++;if(e.def.kind==='oldstairs')old++}
    ents+=c.entities.length
    for(const t of c.tiles){tot++;if(t===1)floorTiles++}
  }
  for(let j=-2;j<=2;j++)for(let i=-2;i<=2;i++)stats[l4Block(seed,i,j).type]++
  for(let j=-2;j<=2;j++)for(let i=-2;i<=2;i++){const b=l4Block(seed,i,j),n=b.ops.filter(o=>o.o==='light').length,area=(b.ix1-b.ix0)*(b.iy1-b.iy0);ok(n>=area/16,`lamps in block ${seed} ${i},${j}: ${n}`)}
  const tile=(x:number,y:number)=>{const cx=Math.floor(x/CS),cy=Math.floor(y/CS),c=chunks.get(`${cx},${cy}`);return c?.tiles[(y-cy*CS)*CS+x-cx*CS]??0}
  const solidAt=(x:number,y:number)=>{const cx=Math.floor(x/CS),cy=Math.floor(y/CS),c=chunks.get(`${cx},${cy}`);return !!c?.structures.some(s=>s.solid&&s.kind!=='hoteldoor'&&s.kind!=='glassdoor'&&x>=Math.floor(s.x)&&x<Math.ceil(s.x+s.w)&&y>=Math.floor(s.y)&&y<Math.ceil(s.y+s.h))}
  const sp=L4_SPAWN;ok(tile(sp.x,sp.y)===1&&!solidAt(sp.x,sp.y),`spawn floor ${seed}`)
  const slot=l4SpawnElevSlot(seed);ok(tile(slot.x,slot.y)===1&&tile(slot.bx,slot.by)===2,`spawn elevator slot ${seed}`)
  // connectivity over walkable tiles (doors passable, solid furniture blocks) inside the generated area
  const lo=-R*CS+40,hi=(R+1)*CS-40,walk=(x:number,y:number)=>x>=lo&&y>=lo&&x<hi&&y<hi&&tile(x,y)===1&&!solidAt(x,y)
  const seen=new Set<number>(),key=(x:number,y:number)=>(y+10000)*20000+x+10000,q:[number,number][]=[[sp.x,sp.y]];seen.add(key(sp.x,sp.y))
  for(let n=0;n<q.length;n++){const[x,y]=q[n];for(const[dx,dy]of [[1,0],[-1,0],[0,1],[0,-1]]){const a=x+dx,b=y+dy;if(!walk(a,b)||seen.has(key(a,b)))continue;seen.add(key(a,b));q.push([a,b])}}
  let lost=0,sample='',total=0
  for(let y=lo+20;y<hi-20;y++)for(let x=lo+20;x<hi-20;x++)if(walk(x,y)){total++;if(!seen.has(key(x,y))){lost++;sample||=`${x},${y}`}}
  ok(lost/total<.01,`seed ${seed}: unreachable walkable ${lost}/${total} (${sample})`)
  console.log(`seed ${seed}: reachable ${total-lost}/${total}`)
}
ok(windows>500,'many facade windows');ok(reveals>200,'window reveals checked '+reveals);ok(stairs>20,'loop stairs in cores');ok(elev>0,'elevators');ok(vending>5,'vending')
console.log(JSON.stringify({blocks:stats,windows,stairs,elev,trap,old,vending,coolers,floorRatio:+(floorTiles/tot).toFixed(3),entitiesPerChunk:+(ents/chunksN).toFixed(4)}))
console.log(`L4 v2: ${pass} passed, ${fail} failed`)
if(fail)process.exit(1)
