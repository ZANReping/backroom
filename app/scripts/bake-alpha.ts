/** Offline, deterministic area-source transport. No ray tracing runs in gameplay. */
import { mkdirSync, writeFileSync } from 'node:fs'
import { gzipSync } from 'node:zlib'
import { createCanvas } from '@napi-rs/canvas'
import { ALPHA_BLUEPRINT, ALPHA_LIGHTS } from '../src/game/content/alphaBlueprint'
import { alphaBakeParts, alphaBakeFingerprint, ALPHA_BAKE_DENSITY, ALPHA_BAKE_VERSION, type AlphaBakePart } from '../src/game/content/alphaBakeLayout'
import {alphaHosePoint,ALPHA_HOSE_SIZE} from '../src/game/content/alphaHose'

type V = [number, number, number]
type Box = { lo: V; hi: V; part: AlphaBakePart; color: V }
type Node = { lo: V; hi: V; left?: Node; right?: Node; boxes?: Box[] }
type Chart = { id: number; face: number; w: number; h: number; x: number; y: number }
const started = performance.now(), parts = alphaBakeParts(ALPHA_BLUEPRINT.decorations!), charts: Chart[] = []
const linear = (s: string): V => [1,3,5].map(i => { const x = parseInt(s.slice(i,i+2),16)/255; return x<=.04045?x/12.92:((x+.055)/1.055)**2.4 }) as V
const boxes: Box[] = parts.filter(({part:p}) => !['glass','light','water','coffee'].includes(p.surface) && p.shape!=='cup' && p.shape!=='cup_handle' && p.w*p.h*p.d>.00003 && Math.max(p.w,p.h,p.d)>.075).map(p=>{
  const w=(Math.abs(p.c)*p.part.w+Math.abs(p.s)*p.part.d)/2,d=(Math.abs(p.s)*p.part.w+Math.abs(p.c)*p.part.d)/2
  return {lo:[p.x-w,p.y-p.part.h/2,p.z-d],hi:[p.x+w,p.y+p.part.h/2,p.z+d],part:p,color:linear(p.part.color)}
})
function tree(boxes: Box[]): Node {
  const lo:V=[Infinity,Infinity,Infinity],hi:V=[-Infinity,-Infinity,-Infinity]
  for(const b of boxes)for(let j=0;j<3;j++){lo[j]=Math.min(lo[j],b.lo[j]);hi[j]=Math.max(hi[j],b.hi[j])}
  if(boxes.length<=8)return{lo,hi,boxes}
  const axis=hi[0]-lo[0]>hi[2]-lo[2]?0:2
  boxes.sort((a,b)=>a.lo[axis]+a.hi[axis]-b.lo[axis]-b.hi[axis]);const m=boxes.length>>1
  return {lo,hi,left:tree(boxes.slice(0,m)),right:tree(boxes.slice(m))}
}
const root=tree(boxes)
function bound(lo:V,hi:V,o:V,d:V,limit:number):number{
  let near=0,far=limit
  for(let j=0;j<3;j++){
    if(Math.abs(d[j])<1e-9){if(o[j]<lo[j]||o[j]>hi[j])return Infinity;continue}
    const a=(lo[j]-o[j])/d[j],b=(hi[j]-o[j])/d[j];near=Math.max(near,Math.min(a,b));far=Math.min(far,Math.max(a,b));if(far<near)return Infinity
  }
  return near
}
let rays=0
function trace(o:V,d:V,limit:number,ignore?:AlphaBakePart,any=false):{box:Box;t:number;n:V}|undefined{
  rays++;let nearest=limit,hit:ReturnType<typeof trace>
  const visit=(node:Node)=>{
    if(any&&hit||bound(node.lo,node.hi,o,d,nearest)===Infinity)return
    if(node.boxes)for(const box of node.boxes){
      if(box.part===ignore||bound(box.lo,box.hi,o,d,nearest)===Infinity)continue
      const p=box.part,dx=o[0]-p.x,dz=o[2]-p.z,local:V=[dx*p.c-dz*p.s,o[1]-p.y,dx*p.s+dz*p.c],dir:V=[d[0]*p.c-d[2]*p.s,d[1],d[0]*p.s+d[2]*p.c]
      const size:V=[p.part.w/2,p.part.h/2,p.part.d/2]
      let t=bound(size.map(x=>-x) as V,size,local,dir,nearest)
      if(p.part.shape==='hose'){
        t=Infinity
        for(let i=0;i<=20;i++){
          const h=alphaHosePoint(i/20).map((v,j)=>v*size[j]*2/ALPHA_HOSE_SIZE[j]),q=local.map((v,j)=>v-h[j]),b=q.reduce((v,x,j)=>v+x*dir[j],0),disc=b*b-q.reduce((v,x)=>v+x*x,0)+.095*.095
          if(disc>=0){const hit=-b-Math.sqrt(disc);if(hit>.0005&&hit<t)t=hit}
        }
      }
      if(t===Infinity||t<.0005||t>=nearest)continue
      const hp=local.map((x,j)=>x+dir[j]*t),axis=[0,1,2].sort((a,b)=>Math.abs(Math.abs(hp[a])-size[a])-Math.abs(Math.abs(hp[b])-size[b]))[0],n:V=[0,0,0]
      n[axis]=hp[axis]<0?-1:1;const world:V=[n[0]*p.c+n[2]*p.s,n[1],-n[0]*p.s+n[2]*p.c]
      nearest=t;hit={box,t,n:world};if(any)return
    }else{visit(node.left!);visit(node.right!)}
  };visit(root);return hit
}
const sources=ALPHA_LIGHTS.map(l=>({x:l.x,y:l.fixZ??2.6,z:l.y,r:Math.max(l.r,5),power:(l.intensityMul??.6)*7.5,color:linear(l.color),width:1.05}))
// Task lamps under shelves and cove strips are real emitting surfaces too.
for(const p of parts)if(p.part.surface==='light'&&p.structure.kind!=='alpha_light'&&p.part.w*p.part.d>.015){
  sources.push({x:p.x,y:p.y-.035,z:p.z,r:3.2,power:Math.min(2.2,p.part.w*p.part.d*8),color:linear(p.part.color),width:Math.min(1.4,p.part.w)})
}
const lightBins=new Map<string,typeof sources>()
function nearby(p:V){const k=Math.floor(p[0]/4)+','+Math.floor(p[2]/4);let a=lightBins.get(k);if(!a){const x=Math.floor(p[0]/4)*4+2,z=Math.floor(p[2]/4)*4+2;a=sources.filter(l=>Math.hypot(l.x-x,l.z-z)<l.r+4);lightBins.set(k,a)}return a}
function direct(p:V,n:V,ignore?:AlphaBakePart):V{
  const color:V=[0,0,0]
  for(const l of nearby(p)){
    if(Math.abs(l.x-p[0])>l.r||Math.abs(l.z-p[2])>l.r)continue
    for(const offset of [-.38,0,.38]){
      const dx=l.x+offset*l.width-p[0],dy=l.y-p[1],dz=l.z-p[2],dist=Math.hypot(dx,dy,dz)
      const cos=Math.max(0,(n[0]*dx+n[1]*dy+n[2]*dz)/dist);if(cos<=0||dist>=l.r)continue
      const emit=dy>=0?.25+.75*dy/dist:.1,fade=(1-(dist/l.r)**4)**2,energy=l.power*cos*emit*fade/(dist*dist+.25)/3
      if(energy<.0008||trace(p,[dx/dist,dy/dist,dz/dist],dist-.06,ignore,true))continue
      for(let j=0;j<3;j++)color[j]+=l.color[j]*energy
    }
  }
  return color
}
const bounceCache=new Map<string,V>()
function bounced(p:V,n:V,ignore:AlphaBakePart):V{
  // A sparse cache stores outgoing diffuse light, not visibility. Every receiving
  // texel still traces its own occlusion rays, so shelves cannot borrow wall light.
  const axis=Math.abs(n[1])>.7?1:Math.abs(n[0])>.7?0:2,t:V=axis===1?[1,0,0]:[0,1,0],b:V=[n[1]*t[2]-n[2]*t[1],n[2]*t[0]-n[0]*t[2],n[0]*t[1]-n[1]*t[0]]
  const result:V=[0,0,0];let access=0
  for(let i=0;i<8;i++){
    const radius=Math.sqrt((i+.5)/8),angle=i*2.3999632297,up=Math.sqrt(1-radius*radius),d=n.map((v,j)=>v*up+t[j]*radius*Math.cos(angle)+b[j]*radius*Math.sin(angle)) as V
    const h=trace(p,d,5,ignore)
    access+=h?Math.min(1,h.t/1.2):1
    if(!h)continue
    const q=p.map((v,j)=>v+d[j]*h.t+h.n[j]*.012) as V
    const key=q.map(v=>Math.round(v*3)).join(',')+':'+h.n.map(v=>Math.round(v)).join(',')
    let radiance=bounceCache.get(key)
    if(!radiance){const light=direct(q,h.n,h.box.part);radiance=light.map((v,j)=>v*Math.min(.72,h.box.color[j]+.12)) as V;bounceCache.set(key,radiance)}
    for(let j=0;j<3;j++)result[j]+=radiance[j]/8
  }
  // Small multi-bounce residue with local contact attenuation. No player-dependent fill.
  const residue=.055*(.18+.82*access/8)
  return result.map(v=>v*.9+residue) as V
}
const WIDTH=4096
parts.forEach(({part:p},id)=>{
  const spans=[[p.d,p.h],[p.d,p.h],[p.w,p.d],[p.w,p.d],[p.w,p.h],[p.w,p.h]]
  spans.forEach(([u,v],face)=>{
    const detail=u*v<.12||Math.min(u,v)<.045||p.surface==='light'||!!p.panel
    charts.push({id,face,w:detail?1:Math.max(2,Math.ceil(u*ALPHA_BAKE_DENSITY)+1),h:detail?1:Math.max(2,Math.ceil(v*ALPHA_BAKE_DENSITY)+1),x:0,y:0})
  })
})
// Height-sorted shelves, including a one-texel gutter on every side.
charts.sort((a,b)=>b.h-a.h||b.w-a.w||a.id-b.id||a.face-b.face)
let x=0,y=0,row=0
for(const c of charts){if(x+c.w+2>WIDTH){x=0;y+=row;row=0}c.x=x+1;c.y=y+1;x+=c.w+2;row=Math.max(row,c.h+2)}
const height=Math.ceil((y+row)/4)*4,bytes=new Uint8ClampedArray(WIDTH*height*4),rects=new Uint16Array(parts.length*24)
const point=(p:AlphaBakePart,face:number,u:number,v:number):[V,V]=>{
  const a=p.part;let q:V,n:V
  if(face<2){q=[face===0?.5:-.5,v-.5,u-.5];n=[face===0?1:-1,0,0]}
  else if(face<4){q=[u-.5,face===2?.5:-.5,v-.5];n=[0,face===2?1:-1,0]}
  else {q=[u-.5,v-.5,face===4?.5:-.5];n=[0,0,face===4?1:-1]}
  q=[q[0]*a.w,q[1]*a.h,q[2]*a.d];const normal:V=[n[0]*p.c+n[2]*p.s,n[1],-n[0]*p.s+n[2]*p.c]
  return [[p.x+q[0]*p.c+q[2]*p.s+normal[0]*.012,p.y+q[1]+normal[1]*.012,p.z-q[0]*p.s+q[2]*p.c+normal[2]*.012],normal]
}
console.log(JSON.stringify({parts:parts.length,occluders:boxes.length,charts:charts.length,atlas:[WIDTH,height]}))
for(let ci=0;ci<charts.length;ci++){
  const c=charts[ci],p=parts[c.id],idx=c.id*24+c.face*4
  rects.set([c.x,c.y,c.w,c.h],idx)
  for(let v=0;v<c.h;v++)for(let u=0;u<c.w;u++){
    const [q,n]=point(p,c.face,c.w===1?.5:u/(c.w-1),c.h===1?.5:v/(c.h-1)),d=direct(q,n,p),b=bounced(q,n,p)
    const pixel=((c.y+v)*WIDTH+c.x+u)*4
    for(let j=0;j<3;j++)bytes[pixel+j]=Math.round(Math.sqrt(Math.min(4,d[j]+b[j])/4)*255)
    bytes[pixel+3]=255
  }
  for(let v=-1;v<=c.h;v++)for(const u of [-1,c.w]){
    const dst=((c.y+v)*WIDTH+c.x+u)*4,src=((c.y+Math.max(0,Math.min(c.h-1,v)))*WIDTH+c.x+Math.max(0,Math.min(c.w-1,u)))*4
    bytes.set(bytes.subarray(src,src+4),dst)
  }
  for(let u=0;u<c.w;u++)for(const v of [-1,c.h]){
    const dst=((c.y+v)*WIDTH+c.x+u)*4,src=((c.y+Math.max(0,Math.min(c.h-1,v)))*WIDTH+c.x+u)*4;bytes.set(bytes.subarray(src,src+4),dst)
  }
  if(ci%25000===0)console.log(`Alpha bake ${ci}/${charts.length} ${(performance.now()-started).toFixed(0)} ms`)
}
const out='public/assets/alpha-bake';mkdirSync(out,{recursive:true})
const canvas=createCanvas(WIDTH,height),ctx=canvas.getContext('2d'),pixels=ctx.createImageData(WIDTH,height);pixels.data.set(bytes);ctx.putImageData(pixels,0,0)
const png=canvas.toBuffer('image/png'),data=gzipSync(Buffer.from(rects.buffer));writeFileSync(out+'/irradiance.png',png);writeFileSync(out+'/rects.bin.gz',data)
const controls={radioWallOccludes:!!trace([25,1.4,35.5],[0,0,1],1),radioDoorTransmits:!trace([28.5,1.4,35.5],[0,0,1],1)}
const manifest={version:ALPHA_BAKE_VERSION,fingerprint:alphaBakeFingerprint(parts,ALPHA_LIGHTS),width:WIDTH,height,parts:parts.length,density:ALPHA_BAKE_DENSITY,encoding:'sqrt-linear-rgb-range4',samples:charts.reduce((n,c)=>n+c.w*c.h,0),rays,bakeMs:performance.now()-started,pngBytes:png.length,rectBytes:data.length,controls}
writeFileSync(out+'/manifest.json',JSON.stringify(manifest,null,2)+'\n');console.log(manifest)
