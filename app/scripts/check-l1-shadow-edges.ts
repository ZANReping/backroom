import {readFileSync,writeFileSync,existsSync} from 'node:fs'
import {gunzipSync} from 'node:zlib'
import path from 'node:path'
import {buildL1Data} from '../src/game/world/l1Building'
import {layoutL1BakeCharts} from '../src/game/world/l1Bake'
import {L1_BAKE_REVISION} from '../src/game/world/l1BakeTypes'
import type {L1Box} from '../src/game/world/l1BuildingTypes'

let assertions=0
const ok=(v:unknown,m:string)=>{assertions++;if(!v)throw Error(m)}
const decode=(v:any):any=>{
 if(v?.type&&v?.base64){const b=Buffer.from(v.base64,'base64'),C=(globalThis as any)[v.type];return new C(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength))}
 return Array.isArray(v)?v.map(decode):v&&typeof v==='object'?Object.fromEntries(Object.entries(v).map(([k,x])=>[k,decode(x)])):v
}
const half=(v:number)=>{const e=(v>>10)&31,m=v&1023;return e===0?m*2**-24:(1+m/1024)*2**(e-15)}
const contains=(b:L1Box,x:number,z:number)=>{
 if(x<=b.min[0]+.012||x>=b.max[0]-.012||z<=b.min[2]+.012||z>=b.max[2]-.012)return false
 if(b.shape!=='round')return true
 return ((x-(b.min[0]+b.max[0])/2)/((b.max[0]-b.min[0])/2))**2+((z-(b.min[2]+b.max[2])/2)/((b.max[2]-b.min[2])/2))**2<.94
}
const audit=(r:any)=>{
 const data=buildL1Data(r.seed,r.cx,r.cy),solids=data.boxes.filter(b=>b.occlude&&b.min[1]<.004&&b.max[1]>.02)
 let covered=0,litUnder=0,maxUnder=0,texels=0,total=0,max=0;const leaks:any[]=[]
 for(const m of r.meshes)if(m.surface==='floor'||m.surface==='ground')for(let i=0;i<m.position.length/3;i+=4){
  const W=Math.round((m.uv1[i*2+2]-m.uv1[i*2])*r.size)+1,H=Math.round((m.uv1[i*2+7]-m.uv1[i*2+1])*r.size)+1
  const ax=Math.round(m.uv1[i*2]*r.size-.5),ay=Math.round(m.uv1[i*2+1]*r.size-.5)
  for(let y=0;y<H;y++)for(let x=0;x<W;x++){
   const u=W===1?.5:x/(W-1),v=H===1?.5:y/(H-1),X=m.position[i*3]+r.cx*32+(m.position[i*3+3]-m.position[i*3])*u+(m.position[i*3+6]-m.position[i*3])*v,Z=m.position[i*3+2]+r.cy*32+(m.position[i*3+5]-m.position[i*3+2])*u+(m.position[i*3+8]-m.position[i*3+2])*v
   const o=((ay+y)*r.size+ax+x)*4,l=.2126*half(r.irradiance[o])+.7152*half(r.irradiance[o+1])+.0722*half(r.irradiance[o+2])
   ok(Number.isFinite(l)&&l>=0,'Finite floor irradiance');texels++;total+=l;max=Math.max(max,l)
   const solid=solids.find(b=>contains(b,X,Z))
   if(solid){covered++;if(l>.00001){litUnder++;if(leaks.length<8)leaks.push({X,Z,l,solid,quad:Array.from(m.position.slice(i*3,i*3+12)),uv:Array.from(m.uv1.slice(i*2,i*2+8)),W,H,x,y})}maxUnder=Math.max(maxUnder,l)}
  }
 }
 return{covered,litUnder,maxUnder,texels,mean:total/texels,max,leaks}
}
const cases=JSON.parse(readFileSync('reports/l1-bake-smoothing/before-diagnostic.json','utf8')).cases,results=[]
for(const c of cases){
 const file=`chunk-${c.cx}-${c.cy}-high.json.gz`,load=(root:string)=>decode(JSON.parse(gunzipSync(readFileSync(path.join(root,file))).toString('utf8')))
 const after=load('public/assets/l1-bakes'),before=existsSync(path.join('.cache/hotbar-collision-shadow/before/public/assets/l1-bakes',file))?load('.cache/hotbar-collision-shadow/before/public/assets/l1-bakes'):null
 ok(after.bakeRevision===L1_BAKE_REVISION,'Published revision is current')
 const a=audit(after),b=before?audit(before):null
 if(a.litUnder)console.log(JSON.stringify({name:c.name,after:a,before:b}))
 ok(a.covered>0,`${c.name}: contact texels exercised`);ok(a.litUnder===0,`${c.name}: solid interiors must not contribute light at wall/column contact`)
 ok(after.size===(before?.size??512),`${c.name}: keep GPU atlas size`)
 if(before){
  ok(after.meshes.length===before.meshes.length,'No extra render batches')
  for(const m of after.meshes){
   const old=before.meshes.find((q:any)=>q.style===m.style&&q.surface===m.surface)
   ok(!!old,'Same rendered surface batch')
   for(const key of ['position','normal','uv','index'])ok(m[key].length===old[key].length&&m[key].every((v:number,i:number)=>v===old[key][i]),`No geometry/triangle/material-UV change: ${c.name} ${m.style}:${m.surface} ${key}`)
  }
 }
 let highDensity=0, floorMinW=Infinity, floorMaxW=0, floorMinH=Infinity, floorMaxH=0, floorTiles=0
 for(const quality of ['low','high'] as const){
  const layout=layoutL1BakeCharts(buildL1Data(after.seed,c.cx,c.cy),quality),used=new Uint8Array(layout.size**2)
  for(const f of layout.faces)if(f.surface!=='leaf'){
   ok(f.x>=1&&f.y>=1&&f.x+f.w<layout.size&&f.y+f.h<layout.size,'Chart has a full linear-filter gutter')
   for(let y=f.y-1;y<=f.y+f.h;y++)for(let x=f.x-1;x<=f.x+f.w;x++){const i=y*layout.size+x;ok(!used[i],'No chart/gutter overlap');used[i]=1}
   if(quality==='high'&&(f.surface==='floor'||f.surface==='ground')){floorTiles++;floorMinW=Math.min(floorMinW,f.w);floorMaxW=Math.max(floorMaxW,f.w);floorMinH=Math.min(floorMinH,f.h);floorMaxH=Math.max(floorMaxH,f.h)}
  }
  if(quality==='high'){
   highDensity=layout.density
   for(const f of layout.faces)if(f.surface==='floor'||f.surface==='ground'){
    const width=Math.hypot(...f.p[1].map((v,i)=>v-f.p[0][i])),height=Math.hypot(...f.p[3].map((v,i)=>v-f.p[0][i]))
    if(width>=1.999&&height>=1.999)ok(f.w>=10&&f.h>=10,`${c.name}: a full 2m floor chart keeps at least ten samples on both axes`)
   }
  }
 }
 ok(floorTiles>0,`${c.name}: floor charts exercised`)
 results.push({name:c.name,cx:c.cx,cy:c.cy,before:b,after:a,metrics:after.metrics,highFloorDensity:highDensity,floorTileBounds:{minW:floorMinW,maxW:floorMaxW,minH:floorMinH,maxH:floorMaxH,samples:floorTiles}})
}
// Compare shipped high-quality samples at a real streaming boundary, including
// negative coordinates. This catches footprint/cache discontinuity as well as
// neighbourhood-dependent light transport without another expensive bake.
const border=(r:any,worldX:number)=>{
 const values=new Map<string,number[]>()
 for(const m of r.meshes)if(m.surface==='floor'||m.surface==='ground')for(let i=0;i<m.position.length/3;i++){
  if(Math.abs(m.position[i*3]+r.cx*32-worldX)>.0001)continue
  const key=(m.position[i*3+2]+r.cy*32).toFixed(4),u=Math.round(m.uv1[i*2]*r.size-.5),v=Math.round(m.uv1[i*2+1]*r.size-.5),o=(v*r.size+u)*4
  values.set(key,Array.from(r.irradiance.slice(o,o+3),half))
 }return values
}
let seamCount=0,seamMax=0
for(const c of cases){
 const load=(cx:number)=>decode(JSON.parse(gunzipSync(readFileSync(`public/assets/l1-bakes/chunk-${cx}-${c.cy}-high.json.gz`)).toString('utf8')))
 const a=load(c.cx),b=load(c.cx+1),A=border(a,(c.cx+1)*32),B=border(b,(c.cx+1)*32)
 for(const [key,value]of A){const other=B.get(key);if(!other)continue;seamCount++;for(let j=0;j<3;j++)seamMax=Math.max(seamMax,Math.abs(value[j]-other[j]))}
}
ok(seamCount>40&&seamMax<.012,'Published high-quality chunk borders keep matching irradiance')
const result={passed:true,assertions,bakeRevision:L1_BAKE_REVISION,seamCount,seamMax,cases:results}
writeFileSync('reports/hotbar-collision-shadow/atlas.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result))
