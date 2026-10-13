import assert from 'node:assert/strict'
import {createCanvas} from '@napi-rs/canvas'
import {writeFileSync,mkdirSync} from 'node:fs'
import * as THREE from 'three'
import {l1HallWall,l1HallPartitions,l1PathRoom,l1PathPlasterAt,L1_PHOTO_ANCHORS,L1_SHOWCASE_SEED} from '../src/game/world/l1Spatial'
import {genL1ChunkRaw} from '../src/game/world/infiniteL1'
import {l1RestoredDropPosition} from '../src/game/world/l1Architecture'
import {L1} from '../src/game/levels/l1'
import {l1WorldUV,l1SurfaceScale,l1PathWallFaces} from '../src/game/renderer/l1Materials'
import {l1PuddleGeometry} from '../src/game/renderer/l1Water'
import {l1Puddles,l1PuddleField} from '../src/game/world/l1Puddles'
import {buildL1Prop} from '../src/game/renderer/l1Props'

Object.defineProperty(globalThis,'document',{value:{createElement:()=>createCanvas(128,128),createElementNS:()=>({})}})
let bays=0
const hashes=new Set<string>()
for(const seed of [1,42,7391,20261006])for(const style of ['parking','storage','gothic','garden','ouroboros'])for(const [gx,gy]of [[-3,-2],[0,0],[2,-4],[5,3]]){
 const floor=new Set<number>(),size=64
 const walls=l1HallPartitions(seed,gx,gy,style)
 hashes.add(JSON.stringify(walls.map(r=>[r.x0-gx*64,r.y0-gy*64,r.x1-gx*64,r.y1-gy*64])))
 for(let y=0;y<size;y++)for(let x=0;x<size;x++)if(!l1HallWall(seed,gx*64+x,gy*64+y,style))floor.add(y*size+x)
 const reached=new Set([0]),queue=[0]
 for(const i of queue){const x=i%size,y=Math.floor(i/size);for(const [dx,dy]of [[1,0],[-1,0],[0,1],[0,-1]]){
  const xx=x+dx,yy=y+dy,n=yy*size+xx;if(xx<0||yy<0||xx>=size||yy>=size||!floor.has(n)||reached.has(n))continue
  reached.add(n);queue.push(n)
 }}
 assert.equal(reached.size,floor.size,`enclosed bay ${seed}:${style}:${gx},${gy}`);bays++
}
assert(hashes.size>25,'bays vary beyond translating one repeated wall shape')
for(const seed of [1,42,7391]){
 const coords=[[-2,-2],[-1,-2],[0,0],[1,0],[2,2]]
 const forward=coords.map(([x,y])=>genL1ChunkRaw(L1,seed,x,y))
 for(const [x,y]of [...coords].reverse())assert.deepEqual(genL1ChunkRaw(L1,seed,x,y),forward[coords.findIndex(c=>c[0]===x&&c[1]===y)],'load order determinism')
 for(const [cx,cy]of coords){
  const c=genL1ChunkRaw(L1,seed,cx,cy)
  for(const q of [...c.items,...c.exits,...c.entities,...(c.npcs??[])])assert.equal(c.tiles[Math.floor(q.y-cy*32)*32+Math.floor(q.x-cx*32)],1,'gameplay object remains on floor')
  const blocked=c.tiles.indexOf(2)
  if(blocked>=0){const x=cx*32+blocked%32+.5,y=cy*32+Math.floor(blocked/32)+.5,p=l1RestoredDropPosition(c,cx,cy,x,y)
   assert.equal(c.tiles[Math.floor(p.y-cy*32)*32+Math.floor(p.x-cx*32)],1,'obstructed old drop moves to floor')
   assert.deepEqual(l1RestoredDropPosition(c,cx,cy,p.x,p.y),p,'drop migration is idempotent')
  }
 }
}
const crateAnchor=L1_PHOTO_ANCHORS.find(a=>a.id==='crate')!,crateChunk=genL1ChunkRaw(L1,L1_SHOWCASE_SEED,Math.floor(crateAnchor.x/32),Math.floor(crateAnchor.y/32))
for(let y=14;y<=18;y++)for(let x=15;x<=17;x++)assert.equal(crateChunk.tiles[y*32+x],1,'crate display and interaction approach remain clear')
const roomAnchor=L1_PHOTO_ANCHORS.find(a=>a.id==='path-room')!,cx=Math.floor(roomAnchor.x/32),cy=Math.floor(roomAnchor.y/32)
const room=l1PathRoom(L1_SHOWCASE_SEED,cx,cy)!,chunk=genL1ChunkRaw(L1,L1_SHOWCASE_SEED,cx,cy)
for(let y=room.y0;y<room.y1;y++)for(let x=room.x0;x<room.x1;x++)assert.equal(chunk.tiles[(y-cy*32)*32+x-cx*32],1,'plastered room shares actual floor bounds')
assert(l1PathPlasterAt(L1_SHOWCASE_SEED,room.x0,room.y0+.5));assert(!l1PathPlasterAt(L1_SHOWCASE_SEED,room.x0-1,room.y0+.5))
const roomLights=chunk.lights.filter(l=>l.x>room.x0&&l.x<room.x1&&l.y>room.y0&&l.y<room.y1)
assert(roomLights.length>0,'side room has native light sources')
for(const light of roomLights){assert(Math.abs(light.x-(room.x1-.32))<1e-6,'side-room lighting follows wall-side fixture');const emitter=chunk.l1?.emitters.find(e=>Math.abs(e.position[0]-light.x)<1e-6&&Math.abs(e.position[2]-light.y)<1e-6);assert(emitter,'side-room light has architecture emitter');assert.equal(light.fixZ,emitter.position[1]+.2);assert.equal(emitter.kind,'tube');assert(!emitter.kind||!light.keep,'side room participates in blackouts')}
const chairs=chunk.structures.filter(s=>s.data?.l1Prop==='pathchair')
assert.equal(chairs.length,2,'both reference seats fit the room without overlap')
assert.equal(chunk.structures.filter(s=>s.data?.l1Prop==='airunit').length,1)
assert.equal(chunk.structures.filter(s=>s.data?.l1Prop==='caution').length,1)
const sideWall=new THREE.BoxGeometry(1,3.6,1);sideWall.translate(room.x0-cx*32-.5,1.8,room.y0-cy*32+.5)
const [brickWall,paintWall]=l1PathWallFaces(sideWall,L1_SHOWCASE_SEED,cx*32,cy*32)
assert(brickWall&&paintWall,'one solid wall box has brick exterior and plaster interior')
assert(new THREE.Raycaster(new THREE.Vector3(room.x0-cx*32+1,1.5,room.y0-cy*32+.5),new THREE.Vector3(-1,0,0),0,3).intersectObject(new THREE.Mesh(paintWall,new THREE.MeshBasicMaterial())).length,'interior plaster face is visible')
sideWall.dispose();brickWall.dispose();paintWall.dispose()

// Adjacent ceiling quads share exact UV endpoints through negative window rebases.
for(const ox of [-96,0,160]){
 const a=new THREE.PlaneGeometry(1,1),b=new THREE.PlaneGeometry(1,1)
 a.rotateX(Math.PI/2);b.rotateX(Math.PI/2);a.translate(.5,3.6,.5);b.translate(1.5,3.6,.5)
 l1WorldUV(a,ox,-64,l1SurfaceScale('parking','ceiling'));l1WorldUV(b,ox,-64,l1SurfaceScale('parking','ceiling'))
 const edge=(g:THREE.BufferGeometry)=>{const p=g.getAttribute('position'),uv=g.getAttribute('uv'),out:number[][]=[];for(let i=0;i<p.count;i++)if(p.getX(i)===1)out.push([p.getZ(i),uv.getX(i),uv.getY(i)]);return out.sort((a,b)=>a[0]-b[0])}
 assert.deepEqual(edge(a),edge(b));a.dispose();b.dispose()
}
for(const seed of [1,42,L1_SHOWCASE_SEED])for(const x of [-32,32,64])for(let y=-16;y<32;y+=.5){
 const field=(cx:number)=>l1Puddles(seed,cx,Math.floor(y/32)).reduce((v,p)=>Math.max(v,l1PuddleField(p,x,y)),0)
 assert.equal(field(x/32-1),field(x/32),'wet edge is independent of queried neighbor chunk')
}
const waterAnchor=L1_PHOTO_ANCHORS.find(a=>a.id==='parking-water')!,ox=Math.floor(waterAnchor.x/32)*32
const m={w:32,h:32,tiles:new Uint8Array(1024).fill(1),structures:[],l1Architecture:true,inf:{ox,oy:0,seed:L1_SHOWCASE_SEED,chunks:new Map([[`${ox/32},0`,{variant:'parking'}]])}} as any
const wet=l1PuddleGeometry(m,{x0:0,y0:0,x1:32,y1:32})!,edge=wet.getAttribute('l1WetEdge')
assert(edge&&edge.count===wet.getAttribute('position').count);assert(Array.from(edge.array).some(x=>x===0)&&Array.from(edge.array).some(x=>x===1));wet.dispose()
const crate=buildL1Prop({kind:'crate',x:0,y:0,w:1,h:1,solid:true,data:{l1Prop:'crate'}})!
crate.updateMatrixWorld(true)
assert(new THREE.Raycaster(new THREE.Vector3(.5,2,.5),new THREE.Vector3(0,-1,0),0,3).intersectObject(crate,true).length,'crate lid is present')
assert(new THREE.Raycaster(new THREE.Vector3(.5,-1,.5),new THREE.Vector3(0,1,0),0,3).intersectObject(crate,true).length,'crate bottom is present')

// Actual generated topology overview. Chunk grid is diagnostic, not game geometry.
const canvas=createCanvas(1024,1060),ctx=canvas.getContext('2d'),colors:Record<string,string>={parking:'#8f9697',maintenance:'#c3cfce',storage:'#b6a38a',gothic:'#8b8065',garden:'#68814b',ouroboros:'#91958f',aisle:'#7d8891'}
ctx.fillStyle='#15191b';ctx.fillRect(0,0,1024,1060);ctx.fillStyle='#fff';ctx.font='18px sans-serif';ctx.fillText('Level 1 · seed 7391 · 256 × 256m · actual tiles and solid structures',12,25)
for(let y=-4;y<4;y++)for(let x=-4;x<4;x++){
 const c=genL1ChunkRaw(L1,7391,x,y),bx=(x+4)*128,by=(y+4)*128+36
 for(let z=0;z<32;z++)for(let u=0;u<32;u++){ctx.fillStyle=c.tiles[z*32+u]===1?colors[c.variant]??'#999':'#292e31';ctx.fillRect(bx+u*4,by+z*4,4,4)}
 ctx.fillStyle='#313a3e';for(const s of c.structures)if(s.solid&&!s.data?.l1Hidden)ctx.fillRect(bx+(s.x-x*32)*4,by+(s.y-y*32)*4,s.w*4,s.h*4)
 ctx.strokeStyle='#ffffff25';ctx.strokeRect(bx,by,128,128)
}
mkdirSync('reports/l1-remake/iteration-5/checks',{recursive:true});writeFileSync('reports/l1-remake/iteration-5/checks/normal-layout.png',canvas.toBuffer('image/png'))
console.log(`L1 refinements passed: ${bays} connected bays; ${hashes.size} layouts; loading order, gameplay clearance, drop migration, room finish, UV seams, wet edges, crate caps.`)
