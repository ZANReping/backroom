import {createCanvas} from '@napi-rs/canvas'
Object.assign(globalThis,{document:{createElement:()=>createCanvas(256,256)},window:{addEventListener(){},removeEventListener(){}}})
const {l7ContourSegments,l7DeepestTile,drawL7Map}=await import('../src/game/content/l7Map')
const {l7BathymetryCell}=await import('../src/game/world/l7Bathymetry')
const {genL7ChunkRaw,l7NearestIsland}=await import('../src/game/world/infiniteL7')
const {L7}=await import('../src/game/levels/l7')
let pass=0,fail=0;const ok=(x:unknown,s:string)=>{if(x)pass++;else{fail++;console.error('FAIL',s)}}
for(let mask=0;mask<16;mask++){
 const values=[0,1,2,3].map(i=>mask&(1<<i)?20:0),segments=l7ContourSegments(values[0],values[1],values[2],values[3],10)
 ok(segments.length===(mask===0||mask===15?0:mask===5||mask===10?2:1),'contour topology mask '+mask)
 ok(segments.every(a=>a.length===4&&a.every(x=>Number.isFinite(x)&&x>=0&&x<=1)),'finite normalized endpoints '+mask)
}
ok(l7ContourSegments(10,10,10,10,10).length===0,'flat exact-depth plateau has no duplicated line')
const left=l7ContourSegments(0,30,60,20,45).flatMap(s=>[[s[0],s[1]],[s[2],s[3]]]).filter(p=>p[0]===1)
const right=l7ContourSegments(30,80,90,60,45).flatMap(s=>[[s[0],s[1]],[s[2],s[3]]]).filter(p=>p[0]===0)
ok(left.length===1&&right.length===1&&Math.abs(left[0][1]-right[0][1])<1e-10,'neighbouring cells have the same intersection on their shared edge')
for(const seed of [1,777,20261022]){
 const island=l7NearestIsland(seed,15,15),coords=[[0,0],[2,-3],[-4,5],...(island?[[Math.floor(island.x/32),Math.floor(island.y/32)]]:[])]
 for(const [cx,cy]of coords){
  const p=l7BathymetryCell(seed,cx,cy),q=genL7ChunkRaw(L7,seed,cx,cy)
  for(let i=0;i<1024;i++){
   ok(p.seaFloor[i]===q.seaFloor[i]&&p.liquid[i]===q.liquid[i]&&p.elev[i]===q.elev[i],`preview terrain agrees with game ${seed}/${cx}/${cy}/${i}`)
   ok(p.cabin[i]===(q.upWall?.[i]===1?2:q.up?.[i]===1?1:0),`cabin footprint agrees with game ${seed}/${cx}/${cy}/${i}`)
  }
  ok(!('entities'in p)&&!('items'in p)&&!('structures'in p),'preview contains no actors or loot')
 }
}
const canvas=createCanvas(256,256),ctx=canvas.getContext('2d') as any
const explored=new Uint8Array(1024),water=new Uint8Array(1024).fill(1),bottom=new Float32Array(1024)
for(let y=0;y<32;y++)for(let x=0;x<32;x++)bottom[y*32+x]=x>=20?300:80
const m:any={w:32,h:32,inf:{ox:320,oy:-320,seed:777,explored:new Map()},liquid:water,seaFloor:bottom,elev:new Uint8Array(1024)}
const eng:any={map:m,explored,player:{z:-5},devEnabled:true,dev:{mapReveal:false}}
const draw=()=>{ctx.clearRect(0,0,256,256);return drawL7Map(ctx,eng,{x0:0,y0:0,x1:32,y1:32,scale:8})}
ok(draw().known===0&&draw().maxDepth===null,'entirely undiscovered chart reveals no depths')
for(let y=2;y<30;y++)for(let x=2;x<10;x++)explored[y*32+x]=1
const shallow=draw(),before=explored.slice()
ok(shallow.maxDepth===80&&shallow.band==='微光带','deep unknown half does not change discovered band')
ok(ctx.getImageData(24*8,16*8,1,1).data[3]===0,'unknown terrain remains transparent under the map background')
eng.player.z=-250;const deepSwimmer=draw()
ok(deepSwimmer.maxDepth===shallow.maxDepth&&deepSwimmer.band===shallow.band,'swimming deeper does not relabel the chart')
eng.dev.mapReveal=true;const revealed=draw()
ok(revealed.maxDepth===300&&revealed.band==='深渊','developer chart includes deepest terrain only while enabled')
ok(explored.every((v,i)=>v===before[i]),'developer reveal does not mutate exploration')
eng.dev.mapReveal=false;ok(draw().maxDepth===80,'disabling reveal restores exploration fog and shallow label')
// A viewport crossing zero must retain its negative-coordinate half in the clip.
eng.dev.mapReveal=true;m.inf.explored.set('9,-10',new Uint8Array(1024).fill(1));const preview={cells:[l7BathymetryCell(777,9,-10)]}
ctx.clearRect(0,0,256,256);ctx.save();ctx.translate(128,0);drawL7Map(ctx,eng,{x0:-16,y0:0,x1:16,y1:32,scale:8,preview});ctx.restore()
ok(ctx.getImageData(32,100,1,1).data[3]===255,'negative local x is included in the map clip')
ok(l7DeepestTile(10,20,30,40,50,60,70,80,90)===45,'maximum includes deepest corner')
ok(l7DeepestTile(60,0,0,0,0,0,0,0,0)===60,'maximum includes tile center')
ok(l7DeepestTile(10,100,0,0,0,0,0,0,0)===55,'maximum includes shared edge')
console.log(JSON.stringify({pass,fail}));if(fail)process.exitCode=1
