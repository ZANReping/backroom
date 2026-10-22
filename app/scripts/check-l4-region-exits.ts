import assert from 'node:assert/strict'
import {createCanvas,Path2D} from '@napi-rs/canvas'
import '../src/game/world/infiniteL1'
import {infiniteImplFor} from '../src/game/world/infiniteRegistry'
import {genL4ChunkRaw} from '../src/game/world/infiniteL4'
import {L4} from '../src/game/levels/l4'
import {drawL4Map,L4_MAP_KEY} from '../src/game/content/l4Map'
import type {Engine} from '../src/game/engine'
Object.assign(globalThis,{Path2D})
let checks=0;function ok(v:unknown,m:string){assert(v,m);checks++}
const allowed=[51,52,54,55],cache=new Map<string,ReturnType<typeof genL4ChunkRaw>>()
function raw(seed:number,cx:number,cy:number){const k=[seed,cx,cy].join(',');let r=cache.get(k);if(!r){r=genL4ChunkRaw(L4,seed,cx,cy);cache.set(k,r)}return r}
function at(seed:number,x:number,y:number,field:'tiles'|'elev'='tiles'){const cx=Math.floor(x/32),cy=Math.floor(y/32);return raw(seed,cx,cy)[field][(y-cy*32)*32+x-cx*32]}
const impl1=infiniteImplFor(1),impl4=infiniteImplFor(4)
ok(!('aisle' in impl1.variantNames)&&!impl1.rareVariants.includes('aisle'),'retired L1 aisle absent from registry')
ok(!('windowview' in impl4.variantNames)&&!impl4.rareVariants.includes('windowview'),'retired L4 windowview absent from registry')
const counts:Record<string,number>={}
for(const seed of [424242,17,9091])for(let cy=-5;cy<=5;cy++)for(let cx=-5;cx<=5;cx++){
 const r=raw(seed,cx,cy)
 ok([...r.tint].every(t=>t===0||allowed.includes(t)), 'four region tints only '+[seed,cx,cy])
 for(const s of r.structures)ok(s.x>=cx*32&&s.x<(cx+1)*32&&s.y>=cy*32&&s.y<(cy+1)*32,'structure anchor belongs to owner chunk')
 for(const e of r.exits){
  counts[e.def.kind]=(counts[e.def.kind]??0)+1
  ok(Number.isFinite(e.l4?.yaw),'exit has explicit finite orientation')
  ok(e.x>=cx*32&&e.x<(cx+1)*32&&e.y>=cy*32&&e.y<(cy+1)*32,'exit belongs to owner chunk')
  if(e.def.kind==='elevatorshaft'){
   ok(e.l4!.yaw===Math.PI/2,'elevator faces west into approach')
   for(let n=-1;n<=1;n++){ok(at(seed,e.x,e.y+n)===1,'whole elevator opening is floor');ok(at(seed,e.x+1,e.y+n)===2,'elevator has solid shaft back');ok(at(seed,e.x-1,e.y+n)===1,'elevator has clear west approach')}
  }else if(e.def.kind==='oldstairs'){
   ok(e.l4!.yaw===0,'old stairs face north')
   for(let n=1;n<=3;n++){
    const x=e.x,y=e.y-n,q=raw(seed,Math.floor(x/32),Math.floor(y/32))
    ok(at(seed,x,y)===1&&at(seed,x,y,'elev')===4,'stair shaft crosses chunk boundary continuously')
    ok(q.structures.some(s=>s.kind==='stairrail'&&s.x===x&&s.y===y&&s.data?.deg===0),'stair rails follow shaft in owner chunk')
   }
  }else ok(at(seed,e.x,e.y)===1,'trapdoor lies on floor')
 }
}
for(const k of ['elevatorshaft','oldstairs','trapdoor'])ok(counts[k]>0,'sample covers '+k)
const canvas=createCanvas(256,256),g=canvas.getContext('2d'),tiles=new Uint8Array(1024).fill(1),tint=new Uint8Array(1024)
for(let y=0;y<32;y++)for(let x=0;x<32;x++)tint[y*32+x]=allowed[(x>=16?1:0)+(y>=16?2:0)]
const chunk={key:'-2,-2',cx:-2,cy:-2,tiles,tint,structures:[] as any[]},inf={ox:-64,oy:-64,chunks:new Map([[chunk.key,chunk]]),explored:new Map()},explored=new Uint8Array(1024).fill(1)
const eng={map:{w:32,h:32,inf},explored,devEnabled:false,dev:{mapReveal:false}} as unknown as Engine
const hex=(x:number,y:number)=>{const p=g.getImageData(x,y,1,1).data;return '#'+[...p.slice(0,3)].map(n=>n.toString(16).padStart(2,'0')).join('')}
const draw=()=>{g.clearRect(0,0,256,256);drawL4Map(g as unknown as CanvasRenderingContext2D,eng,{x0:0,y0:0,x1:32,y1:32,scale:8})}
draw();for(let j=0;j<4;j++)ok(hex((j%2*16+2)*8+4,(Math.floor(j/2)*16+2)*8+4)===L4_MAP_KEY[j].color,'real canvas region color '+L4_MAP_KEY[j].name)
chunk.structures.push({x:2,y:2,w:1,h:1,solid:true,kind:'pillar'});draw();ok(hex(20,20)==='#bbb5a3','live structures use local coordinates at negative world origin')
explored.fill(0);explored[6*32+6]=1;const before=explored.slice();draw();for(let y=0;y<256;y++)for(let x=0;x<256;x++)if(x<48||x>=56||y<48||y>=56)ok(g.getImageData(x,y,1,1).data[3]===0,'motifs and walls do not leak into unexplored cells')
ok(explored.every((v,i)=>v===before[i]),'map does not modify exploration')
eng.devEnabled=true;eng.dev.mapReveal=true;g.clearRect(0,0,256,256);g.save();g.translate(256,0)
const preview={cells:[{cx:-3,cy:-2,tiles,tint:new Uint8Array(1024).fill(54),elev:new Uint8Array(1024),walls:[{x:-93,y:-61,w:1,h:1}]}],labels:[]}
drawL4Map(g as unknown as CanvasRenderingContext2D,eng,{x0:-32,y0:0,x1:0,y1:32,scale:8,preview});g.restore();ok(hex(28,28)==='#bbb5a3','preview wall uses world coordinates');ok(hex(20,20)===L4_MAP_KEY[2].color,'preview floor outside live window')
explored.fill(1);g.clearRect(0,0,256,256);drawL4Map(g as unknown as CanvasRenderingContext2D,eng,{x0:0,y0:0,x1:32,y1:32,scale:8,preview:{cells:[{...preview.cells[0],cx:-2,cy:-2}],labels:[]}});ok(hex(92,92)===L4_MAP_KEY[0].color,'live terrain overrides preview')
console.log(JSON.stringify({checks,chunks:cache.size,exits:counts,colors:L4_MAP_KEY.map(k=>({name:k.name,color:k.color}))}))
