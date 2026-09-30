import assert from 'node:assert/strict'
import {genL2ChunkRaw,L2_RARE_VARIANTS,l2CorrX,l2VariantOf} from '../src/game/world/infiniteL2'
import {L2} from '../src/game/levels/l2'
import {generateLevel,type GameMap} from '../src/game/world/mapgen'
import {canOccupy,moveStep,PLAYER_RADIUS} from '../src/game/core/player'
import {infiniteImplFor,registerInfiniteLevel} from '../src/game/world/infiniteRegistry'
let chunks=0,services=0,fixtures=0,skew=0,colored=0
for(const seed of [424242,17,82719])for(const variant of L2_RARE_VARIANTS)for(const [cx,cy] of [[0,0],[0,1],[1,0],[-1,-1],[3,-2]]) {
  const a=genL2ChunkRaw(L2,seed,cx,cy,variant),b=genL2ChunkRaw(L2,seed,cx,cy,variant)
  assert.deepEqual(a,b,'same seed and chunk must be deterministic');chunks++
  for(const s of a.structures.filter(s=>s.data?.l2Service)) {
    services++;assert(s.solid)
    assert(s.w<=1.16,'service rack leaves at least 1.84m clear in a 3m corridor')
    for(let y=Math.floor(s.y);y<Math.ceil(s.y+s.h);y++)for(let x=Math.floor(s.x);x<Math.ceil(s.x+s.w-1e-6);x++)assert.equal(a.tiles[(y-cy*32)*32+x-cx*32],1,'rack footprint lies on carved floor')
    for(const d of a.structures.filter(d=>d.kind==='hoteldoor'))assert(!(s.x<d.x+d.w && s.x+s.w>d.x && s.y<d.y+d.h && s.y+s.h>d.y),'door footprint stays clear')
  }
  for(const s of a.structures.filter(s=>s.data?.l2WallProp)) {
    const x=Math.floor(s.x+s.w/2)-cx*32,y=Math.floor(s.y+s.h/2)-cy*32
    const [dx,dy]=[[0,-1],[1,0],[0,1],[-1,0]][Number(s.data?.l2WallDir)]
    assert.equal(a.tiles[y*32+x],1,'wall prop anchored on floor, not embedded in wall')
    assert.notEqual(a.tiles[(y+dy)*32+x+dx],1,'wall prop has stable backing wall')
  }
  for(const s of a.structures.filter(s=>s.kind==='hoteldoor'))assert.equal(s.data?.l2Variant,variant,'door inherits corridor palette')
  for(const l of a.lights.filter(l=>l.l2Mount)) {
    fixtures++;if(l.l2Yaw!==0&&l.l2Yaw!==Math.PI/2)skew++
    if(l.color==='#a9ccff'||l.color==='#ffb52e')colored++
    assert(l.fixZ>=1.7&&l.fixZ<=2.4)
    assert.equal(a.tiles[(Math.floor(l.y)-cy*32)*32+Math.floor(l.x)-cx*32],1)
    if(l.l2Mount==='wall')for(const dy of [-1,0,1])assert.notEqual(a.tiles[(Math.floor(l.y)+dy-cy*32)*32+Math.floor(l.x)-1-cx*32],1,'wall fixture cannot span a doorway or junction')
  }
  // Every main corridor row retains a continuous body-width centre passage.
  for(let k=-3;k<=6;k++) {
    const X=l2CorrX(seed,k),px=X+(variant==='narrow'?.85:variant==='dirty'?1.8:1.5)
    if(X<cx*32||X+2>=cx*32+32)continue
    for(let y=cy*32;y<cy*32+32;y++) {
      if(a.tiles[(y-cy*32)*32+X+1-cx*32]!==1)continue
      assert(!a.structures.some(s=>s.data?.l2Service&&px+.32>s.x&&px-.32<s.x+s.w&&y+.5>s.y&&y+.5<s.y+s.h),'player radius clears racks')
    }
  }
}
assert(services>100&&fixtures>100);assert(skew/fixtures<.12,'most fixtures aligned');assert(colored>0)
const variants=new Set<string>();for(let y=-30;y<=30;y++)for(let x=-30;x<=30;x++)variants.add(l2VariantOf(424242,x,y))
assert.deepEqual([...variants].sort(),[...L2_RARE_VARIANTS].sort());assert.equal(l2VariantOf(424242,0,0),'tidy')
// Multi-chunk topology remains a connected corridor network, even across biome changes.
const size=160,tiles=new Uint8Array(size*size)
for(let cy=-2;cy<=2;cy++)for(let cx=-2;cx<=2;cx++) {
 const c=genL2ChunkRaw(L2,424242,cx,cy)
 for(let y=0;y<32;y++)for(let x=0;x<32;x++)tiles[((cy+2)*32+y)*size+(cx+2)*32+x]=c.tiles[y*32+x]===1?1:0
}
const seen=new Set<number>(),queue=[77*size+78];seen.add(queue[0]);for(let q=0;q<queue.length;q++) {
 const i=queue[q],x=i%size,y=Math.floor(i/size)
 for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){const nx=x+dx,ny=y+dy,ni=ny*size+nx;if(nx>=0&&ny>=0&&nx<size&&ny<size&&tiles[ni]&&!seen.has(ni)){seen.add(ni);queue.push(ni)}}
}
// Locked side rooms can be isolated by world edges; verify the entire backbone, not off-window rooms.
for(let y=32;y<size-32;y++)for(let k=-1;k<=2;k++){const x=l2CorrX(424242,k)+65;if(x>=0&&x<size&&tiles[y*size+x])assert(seen.has(y*size+x),'corridor backbone connected')}
// Check real spawn centres, not integer tile corners, through the production
// infinite generator. The previous test suite never loaded a player at spawn.
const impl=infiniteImplFor(2);let spawns=0,crossings=0
let base:GameMap
try {
 for(const variant of L2_RARE_VARIANTS) {
  registerInfiniteLevel(2,{...impl,variantOf:()=>variant,genRaw:(d,s,x,y)=>genL2ChunkRaw(d,s,x,y,variant)})
  for(const seed of [424242,17,82719]){
   const m=generateLevel(L2,seed,false);base=m
   assert(canOccupy(m,m.spawn.x+.5,m.spawn.y+.5,PLAYER_RADIUS),'actual spawn centre must fit player')
   spawns++
  }
 }
} finally {registerInfiniteLevel(2,impl)}
// Exercise every ordered biome pair on both sides of a real chunk boundary.
// Collision and movement use the game's full player radius (also diagonal samples).
for(const seed of [424242,17,82719])for(const north of L2_RARE_VARIANTS)for(const south of L2_RARE_VARIANTS){
 const m={...base!,w:32,h:64,inf:undefined,structures:[],tiles:new Uint8Array(32*64).fill(2),elev:new Uint8Array(32*64),step:new Uint8Array(32*64),stair:new Uint32Array(32*64),crawl:new Uint8Array(32*64),liquid:new Uint8Array(32*64)} as GameMap
 for(const [cy,v] of [[-1,north],[0,south]] as const){
  const c=genL2ChunkRaw(L2,seed,0,cy,v),off=(cy+1)*1024
  m.tiles.set(c.tiles,off);m.elev.set(c.elev,off);m.crawl.set(c.crawl,off)
  m.structures.push(...c.structures.map(s=>({...s,y:s.y+32})))
 }
 const x=l2CorrX(seed,0)+1.44
 for(const sign of [-1,1]){
  const p={x,y:32-sign*1.5}
  for(let i=0;i<60;i++){assert(canOccupy(m,p.x,p.y,PLAYER_RADIUS,{crouch:true}),'seam corridor has body clearance');moveStep(m,p,0,sign*.05,PLAYER_RADIUS,{crouch:true})}
  assert(Math.abs(p.y-(32+sign*1.5))<.001,`${north}/${south} boundary traversable in both directions`);crossings++
 }
}
console.log(JSON.stringify({pass:true,chunks,services,fixtures,skew,colored,spawns,crossings,biomes:[...variants],reachableTiles:seen.size}))

