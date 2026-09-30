import assert from 'node:assert/strict'
import {genL4ChunkRaw,l4SpawnElevSlot} from '../src/game/world/infiniteL4'
import {l4VoidAt,l4VoidCell,l4Biome} from '../src/game/world/l4Layout'
import {L4} from '../src/game/levels/l4'
import {CS} from '../src/game/world/infinite'
let checks=0,windows=0,traps=0,black=0,stairs=0
for(const seed of [424242,17,9091]){
  for(let my=-4;my<=4;my++)for(let mx=-4;mx<=4;mx++){
    let count=0;for(let y=0;y<4;y++)for(let x=0;x<4;x++)if(l4VoidCell(seed,mx*4+x,my*4+y))count++
    assert.equal(count,4);checks++
  }
  const chunks=new Map<string,ReturnType<typeof genL4ChunkRaw>>()
  for(let cy=-5;cy<=5;cy++)for(let cx=-5;cx<=5;cx++){
    const c=genL4ChunkRaw(L4,seed,cx,cy);chunks.set(`${cx},${cy}`,c)
    assert.deepEqual(c,genL4ChunkRaw(L4,seed,cx,cy));checks++
    for(let y=0;y<CS;y++)for(let x=0;x<CS;x++){
      const v=l4VoidAt(seed,cx*CS+x,cy*CS+y),i=y*CS+x
      assert.equal(!!c.outdoor?.[i],v);if(v)assert.equal(c.tiles[i],0)
    }
    for(const l of c.lights){const i=(Math.floor(l.y)-cy*CS)*CS+Math.floor(l.x)-cx*CS;assert.equal(c.tiles[i],1);assert.equal(c.outdoor?.[i],0)}
    const ids=c.structures.map(s=>s.data?.sid);assert.equal(new Set(ids).size,ids.length,JSON.stringify(c.structures.filter((s,i)=>ids.indexOf(s.data?.sid)!==i||ids.lastIndexOf(s.data?.sid)!==i)))
    for(const s of c.structures){
      assert.ok(s.x>=cx*CS&&s.x<(cx+1)*CS&&s.y>=cy*CS&&s.y<(cy+1)*CS)
      assert.ok(!l4VoidAt(seed,s.x,s.y))
      if(s.kind==='windowtrap')traps++;if(s.kind==='windowblack')black++;if(s.kind==='l4stairs')stairs++
      if(s.data?.coast){windows++;const deg=Number(s.data.deg),dx=deg===90?1:deg===270?-1:0,dy=deg===0?1:deg===180?-1:0;assert.ok(l4VoidAt(seed,s.x+dx,s.y+dy))}
    }
  }
  const tile=(x:number,y:number)=>{const cx=Math.floor(x/CS),cy=Math.floor(y/CS),c=chunks.get(`${cx},${cy}`);return c?.tiles[(y-cy*CS)*CS+x-cx*CS]??0}
  const start=l4SpawnElevSlot(seed);assert.equal(tile(start.x,start.y),1);assert.equal(tile(start.bx,start.by),2);assert.equal(tile(15,15),1)
  const seen=new Set<string>(),queue:[[number,number]]=[[15,15]];seen.add('15,15')
  for(let n=0;n<queue.length;n++){const[x,y]=queue[n];for(const[dx,dy]of [[1,0],[-1,0],[0,1],[0,-1]]){const xx=x+dx,yy=y+dy,key=`${xx},${yy}`;if(tile(xx,yy)!==1||seen.has(key))continue;seen.add(key);queue.push([xx,yy])}}
  let disconnected=0,sample=''
  for(let y=-128;y<160;y++)for(let x=-128;x<160;x++)if(tile(x,y)===1&&!seen.has(`${x},${y}`)){disconnected++;sample||=`${x},${y}`}
  assert.equal(disconnected,0,`seed ${seed}: disconnected floor (${sample})`);checks++
  for(let r=-10;r<10;r++)for(let k=-10;k<10;k++)if(l4Biome(seed,k,r)==='windowview')assert.ok([[1,0],[-1,0],[0,1],[0,-1]].some(([dx,dy])=>l4VoidCell(seed,k+dx,r+dy)))
}
assert.ok(windows>0&&traps>0&&black>traps*3&&stairs>0)
console.log(JSON.stringify({checks,windows,traps,black,stairs,voidRatio:.25},null,2))
