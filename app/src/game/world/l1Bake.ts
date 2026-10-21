import {buildL1Data,l1BuildingRoof} from './l1Building'
import {l1Noise,l1PathPlasterAt,l1PathRoom} from './l1Spatial'
import type {L1ArchitectureData,L1Emitter,L1Opening,L1StyleName,L1SurfaceName,V3} from './l1BuildingTypes'
import type {L1BakeQuality,L1BakeResult,L1BakedMesh,L1Probe} from './l1BakeTypes'
import {L1_BAKE_REVISION} from './l1BakeTypes'
import {tree,covered,trace,occluded,type Occluder} from './l1BakeRaycast'
import {l1EmitterVisibility} from './l1BakeVisibility'
import {clipL1VaultTriangle,l1VaultSplitHeight} from './l1VaultMesh'
import {l1CutRect,L1_WALL_NORMALS} from './l1WallFixtures'

const add=(a:V3,b:V3):V3=>[a[0]+b[0],a[1]+b[1],a[2]+b[2]]
const mul=(a:V3,b:number):V3=>[a[0]*b,a[1]*b,a[2]*b]
const sub=(a:V3,b:V3):V3=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]]
const dot=(a:V3,b:V3)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2]
const cross=(a:V3,b:V3):V3=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]]
const unit=(a:V3)=>mul(a,1/Math.max(1e-8,Math.hypot(...a)))
const luminance=(a:V3)=>a[0]*.2126+a[1]*.7152+a[2]*.0722
/** Finite segment through the actual doorway, not a player-distance darkening. */
export function l1RayCrossesPortal(portal:L1Opening,a:V3,b:V3){
 const axis=portal.w>portal.d?2:0,other=axis===0?2:0,centre=axis===0?portal.x+portal.w/2:portal.z+portal.d/2,delta=b[axis]-a[axis]
 if(Math.abs(delta)<1e-7)return false
 const t=(centre-a[axis])/delta;if(t<=.0001||t>=.9999)return false
 const h=a[1]+(b[1]-a[1])*t,s=a[other]+(b[other]-a[other])*t,lo=other===0?portal.x:portal.z,span=other===0?portal.w:portal.d
 return h>=0&&h<=portal.height&&s>lo+.12&&s<lo+span-.12
}
interface Radiance {rgb:V3;portal:V3[]}
interface Face {p:V3[];n:V3[];style:L1StyleName;surface:L1SurfaceName;detail:boolean;x:number;y:number;w:number;h:number;smooth?:boolean;vaultSeed?:number;leafUV?:[number,number,number,number]}
function facesFor(data:L1ArchitectureData,quality:L1BakeQuality):Face[]{
 const room=l1PathRoom(data.seed,data.cx,data.cy)
 const faces:Face[]=[],q=(p:V3[],style:L1StyleName,surface:L1SurfaceName,detail=false,n?:V3[]):void=>{
  const normal=unit(cross(sub(p[1],p[0]),sub(p[3],p[0])))
  if(style==='maintenance'&&surface==='wall'&&room&&Math.abs(normal[1])<.1){
   const axis=Math.abs(normal[0])>.5?2:0,span=p[1][axis]-p[0][axis]
   const bounds=[...new Set([room,...(room.alcove?[room.alcove]:[])].flatMap(r=>axis===0?[r.x0,r.x1]:[r.y0,r.y1]))]
   const cuts=[0,...bounds.map(v=>(v-p[0][axis])/span).filter(t=>t>.0001&&t<.9999),1].sort((a,b)=>a-b)
   if(cuts.length>2){
    for(let i=0;i<cuts.length-1;i++){
     const a=cuts[i],b=cuts[i+1],mix=(v:V3,w:V3,t:number)=>add(v,mul(sub(w,v),t))
     q([mix(p[0],p[1],a),mix(p[0],p[1],b),mix(p[3],p[2],b),mix(p[3],p[2],a)],style,surface,detail)
    }
    return
   }
  }
  if(style==='maintenance'&&surface==='wall'&&l1PathPlasterAt(data.seed,(p[0][0]+p[2][0])/2+normal[0]*.02,(p[0][2]+p[2][2])/2+normal[2]*.02))surface='paint'
  faces.push({p,n:n??[normal,normal,normal,normal],style,surface,detail,x:0,y:0,w:0,h:0})
 }
 for(const b of data.boxes){
  const [x,y,z]=b.min,[X,Y,Z]=b.max,s=b.style,t=b.surface
  if(b.shape==='round'){
   const axis=b.axis??1,u=axis===0?2:axis===2?1:0,v=axis===0?1:axis===2?0:2,steps=axis===1?(quality==='high'?24:12):(quality==='high'?8:6)
   const cx=(b.min[u]+b.max[u])/2,cz=(b.min[v]+b.max[v])/2,rx=(b.max[u]-b.min[u])/2,rz=(b.max[v]-b.min[v])/2
   const point=(a:number,h:number):V3=>{const p:V3=[0,0,0];p[u]=cx+rx*Math.cos(a);p[axis]=h;p[v]=cz+rz*Math.sin(a);return p}
   const norm=(a:number):V3=>{const n:V3=[0,0,0];n[u]=Math.cos(a);n[v]=Math.sin(a);return n}
   for(let k=0;k<steps;k++){const a=k/steps*Math.PI*2,c=(k+1)/steps*Math.PI*2,n=norm(a),N=norm(c);q([point(c,b.min[axis]),point(a,b.min[axis]),point(a,b.max[axis]),point(c,b.max[axis])],s,t,!!b.detail,[N,n,n,N]);faces[faces.length-1].smooth=axis===1&&!b.detail}
   // Column caps meet a roof; horizontal services have visible circular ends.
   if(axis!==1)for(const end of [b.min[axis],b.max[axis]])for(let k=0;k<steps;k++){
    const middle:V3=[0,0,0],n:V3=[0,0,0];middle[u]=cx;middle[v]=cz;middle[axis]=end;n[axis]=end===b.min[axis]?-1:1
    const a=k/steps*Math.PI*2,c=(k+1)/steps*Math.PI*2,p=[middle,point(a,end),point(c,end),middle];if(n[axis]>0)p.reverse();q(p,s,t,true,[n,n,n,n])
   }
  }else{
   q([[x,y,Z],[X,y,Z],[X,Y,Z],[x,Y,Z]],s,t,b.detail);q([[X,y,z],[x,y,z],[x,Y,z],[X,Y,z]],s,t,b.detail)
   q([[x,y,z],[x,y,Z],[x,Y,Z],[x,Y,z]],s,t,b.detail);q([[X,y,Z],[X,y,z],[X,Y,z],[X,Y,Z]],s,t,b.detail)
  }
  if(b.shape!=='round')q([[x,Y,Z],[X,Y,Z],[X,Y,z],[x,Y,z]],s,t,b.detail)
  if(y>.01&&b.shape!=='round')q([[x,y,z],[X,y,z],[X,y,Z],[x,y,Z]],s,t,b.detail)
 }
 for(const r of data.roofs){
  // Small roof patches share absolute sample coordinates, including the vault normals.
  const step=2
  for(let z=r.z;z<r.z+r.d;z+=step)for(let x=r.x;x<r.x+r.w;x+=step){
   const X=Math.min(r.x+r.w,x+step),Z=Math.min(r.z+r.d,z+step)
   const height=(a:number,b:number)=>r.style==='gothic'?l1BuildingRoof(data.seed,a,b,true):r.height
   if(!r.sky){const p:V3[]=[[x,height(x,z),z],[X,height(X,z),z],[X,height(X,Z),Z],[x,height(x,Z),Z]]
    const ns=p.map(v=>unit([height(v[0]+.025,v[2])-height(v[0]-.025,v[2]),-.05,height(v[0],v[2]+.025)-height(v[0],v[2]-.025)] as V3));q(p,r.style,'ceiling',false,ns);if(r.style==='gothic')faces[faces.length-1].vaultSeed=data.seed}
  }
  const exit=data.exit,[dx,dz]=exit?L1_WALL_NORMALS[exit.dir]:[0,0]
  const floor=exit?.kind==='stairs'?l1CutRect(r.x,r.z,r.x+r.w,r.z+r.d,{x:exit.x+dx,z:exit.z+dz,w:1,d:1}):[[r.x,r.z,r.x+r.w,r.z+r.d]]
  for(const [x,z,X,Z]of floor)q([[x,0,Z],[X,0,Z],[X,0,z],[x,0,z]],r.style,r.style==='garden'?'ground':'floor')
  if(r.style==='garden'){
   // Leaf clusters and climbing stems share the building grid; each cluster is
   // a few opaque-cutout cards rather than stacked transparent foliage sheets.
   const leaf=(x:number,y:number,z:number,w:number,h:number,a:number,tilt=0)=>{
    const right:V3=[Math.cos(a)*w/2,0,Math.sin(a)*w/2],up:V3=[-Math.sin(a)*Math.sin(tilt)*h/2,Math.cos(tilt)*h/2,Math.cos(a)*Math.sin(tilt)*h/2],p:V3=[x,y,z]
    q([sub(sub(p,right),up),add(sub(p,up),right),add(add(p,right),up),add(sub(p,right),up)],'garden','leaf',true)
   }
   // D's 0.7m moss/clover grid also belongs to the active baked renderer.
   // World-grid ownership avoids overlapping cards at 2m patch/chunk seams;
   // lower quality samples one third of clusters, with identical positions.
   for(let gz=Math.ceil(r.z/.7);gz*.7<r.z+r.d;gz++)for(let gx=Math.ceil(r.x/.7);gx*.7<r.x+r.w;gx++){
    if(quality==='low'&&((gx+gz)%3+3)%3!==0)continue
    const x=gx*.7,z=gz*.7,v=l1Noise(gx,gz,data.seed^11),jx=(v-.5)*.6,jz=(l1Noise(gx,gz,data.seed^37)-.5)*.6
    for(let j=0;j<4;j++)leaf(x+.3+jx+Math.sin(j*1.7)*.16,.025+v*.035,z+.3+jz+Math.cos(j*1.7)*.16,.085,.12,v*6+j,-1.25)
   }
   if(r.sky)for(let k=0;k<100;k+=quality==='high'?1:3){const t=k/100;leaf(r.x+.15+Math.sin(t*9)*.2+Math.sin(k*1.9)*.09,r.height-.1-t*3.2,r.z+Math.cos(k*2.4)*.1,.14,.17,k*2.4)}
  }
 }
 for(const b of data.boxes)if(b.style==='garden'&&b.surface==='column')for(let i=0;i<768;i+=quality==='high'?1:3){
  const side=i%4,h=.12+(i/768)*(b.max[1]-.24),u=(.5+.25*Math.sin(h*1.3+side*1.7)+(l1Noise(i,b.min[0],data.seed)-.5)*.55),x=side<2?(side===0?b.min[0]-.028:b.max[0]+.028):b.min[0]+u*(b.max[0]-b.min[0]),z=side>=2?(side===2?b.min[2]-.028:b.max[2]+.028):b.min[2]+u*(b.max[2]-b.min[2])
  const a=(l1Noise(i,b.min[2],data.seed^71)-.5)*2.1,w=.06+l1Noise(i,41,data.seed)*.05,c=Math.cos(a),s=Math.sin(a),right:V3=side<2?[0,s*w,c*w]:[c*w,s*w,0],up:V3=side<2?[0,c*w,-s*w]:[-s*w,c*w,0],p:V3=[x,h,z]
  q([sub(sub(p,right),up),add(sub(p,up),right),add(add(p,right),up),add(sub(p,right),up)],'garden','leaf',true)
  if(i%3===1)faces[faces.length-1].leafUV=[.445,.51,.267,.48]
  else if(i%3===2)faces[faces.length-1].leafUV=[.095,.013,.267,.38]
 }
 return faces
}
function chartExtent(f:Face,density:number,quality:L1BakeQuality){
 if(f.detail||f.surface==='leaf')return[1,1]
 const u=Math.hypot(...sub(f.p[1],f.p[0])),v=Math.hypot(...sub(f.p[3],f.p[0]))
 const floor=f.surface==='floor'||f.surface==='ground',broad=floor||f.surface==='ceiling'
 const boost=floor&&quality==='high'?2:f.vaultSeed!==undefined&&f.n.some(n=>n[1]>-.6)?1.65:1
 // Charts store endpoints as well as intervals. Reserve floor resolution even
 // in service-heavy bays instead of reducing it to a handful of corner texels.
 const minimum=broad&&u>=1&&v>=1?floor&&quality==='high'?5:2:1
 return[Math.max(f.smooth?2:minimum,Math.ceil(u*density*boost)+1),Math.max(minimum,Math.ceil(v*density*boost)+1)]
}
function pack(faces:Face[],density:number,size:number,quality:L1BakeQuality){
 let x=0,y=0,row=0
 const sorted=faces.map((f,index)=>{[f.w,f.h]=chartExtent(f,density,quality);return{f,index}})
  .filter(({f})=>f.surface!=='leaf').sort((a,b)=>b.f.h-a.f.h||b.f.w-a.f.w||a.index-b.index)
 for(const {f}of sorted){
  if(f.surface==='leaf'){f.x=f.y=f.w=f.h=1;continue}
  if(f.w+2>size||f.h+2>size)return false
  if(x+f.w+2>size){x=0;y+=row;row=0}if(y+f.h+2>size)return false
  f.x=x+1;f.y=y+1;x+=f.w+2;row=Math.max(row,f.h+2)
 }return true
}
/** Height-sorted packing prevents a long pipe from wasting the rest of every
 * atlas row. Mesh order stays stable; only the chart coordinates are repacked. */
export function layoutL1BakeCharts(data:L1ArchitectureData,quality:L1BakeQuality){
 const faces=facesFor(data,quality),baseSize=quality==='high'?512:256
 let density=quality==='high'?3:1.25,lastDensity=density
 while(density>=.12){
  if(pack(faces,density,baseSize,quality))return{faces,size:baseSize,density,fallback:false}
  lastDensity=density;density*=.8
 }
 // A pathological number of padded charts can exceed even the minimum layout.
 for(let size=baseSize*2;size<=1024;size*=2)if(pack(faces,lastDensity,size,quality))return{faces,size,density:lastDensity,fallback:true}
 throw new Error(`L1 atlas chart capacity exceeded: ${data.cx},${data.cy}, ${faces.length} faces`)
}
function point(f:Face,u:number,v:number):V3{const p=add(add(mul(f.p[0],(1-u)*(1-v)),mul(f.p[1],u*(1-v))),add(mul(f.p[2],u*v),mul(f.p[3],(1-u)*v)));if(f.vaultSeed!==undefined)p[1]=l1BuildingRoof(f.vaultSeed,p[0],p[2],true);return p}
function normal(f:Face,u:number,v:number):V3{
 if(f.vaultSeed!==undefined){const p=point(f,u,v),h=(x:number,z:number)=>l1BuildingRoof(f.vaultSeed!,x,z,true);return unit([h(p[0]+.025,p[2])-h(p[0]-.025,p[2]),-.05,h(p[0],p[2]+.025)-h(p[0],p[2]-.025)])}
 return unit(add(add(mul(f.n[0],(1-u)*(1-v)),mul(f.n[1],u*(1-v))),add(mul(f.n[2],u*v),mul(f.n[3],(1-u)*v))))
}
function half(v:number){v=Math.min(65504,Math.max(0,v));if(v<6.103515625e-5)return Math.round(v/5.960464477539063e-8);let e=Math.floor(Math.log2(v));return((e+15)<<10)+Math.round((v/2**e-1)*1024)}
function albedo(style:L1StyleName,surface:L1SurfaceName):V3{
 if(style==='parking'&&surface==='ceiling')return[.34,.35,.33]
 if(style==='parking'&&surface==='floor')return[.35,.35,.33]
 if(style==='storage'&&surface==='ceiling')return[.24,.2,.16]
 if(style==='ouroboros'&&surface==='whitePipe')return[.7,.69,.66]
 if(style==='ouroboros'&&surface==='floor')return[.3,.29,.27]
 if(style==='ouroboros'&&surface==='ceiling')return[.06,.06,.06]
 if(style==='ouroboros'&&surface==='peeling')return[.34,.31,.26]
 if(style==='ouroboros'&&surface==='column')return[.3,.3,.29]
 if(style==='ouroboros'&&surface==='wall')return[.5,.49,.47]
 if(style==='storage'&&surface==='column')return[.36,.31,.24]
 if(style==='storage'&&surface==='floor')return[.4,.38,.34]
 if(style==='storage'&&surface==='metal')return[.3,.23,.16]
 if(style==='storage'&&['whitePipe','paint'].includes(surface))return[.56,.55,.51]
 if(surface==='metal'||surface==='red')return[.16,.16,.15]
 if(style==='garden')return surface==='floor'||surface==='ground'?[.2,.36,.1]:[.42,.45,.34]
 if(style==='fabled')return surface==='floor'?[.3,.26,.2]:surface==='ceiling'?[.13,.1,.08]:surface==='glass'?[.42,.4,.32]:surface==='wall'?[.52,.4,.21]:[.15,.11,.08]
 if(style==='gothic')return[.36,.31,.22]
 if(style==='maintenance')return[.54,.56,.57]
 return surface==='floor'?[.28,.28,.26]:style==='storage'?[.64,.62,.56]:[.47,.47,.44]
}
/** Shared CPU algorithm for the browser Worker and offline generation. All rays
 * query an immutable 96m neighbourhood; no loaded scene, player or clock input. */
export function bakeL1(seed:number,cx:number,cy:number,quality:L1BakeQuality='high',provisional=false):L1BakeResult {
 const start=performance.now(),data=buildL1Data(seed,cx,cy),neighbours:L1ArchitectureData[]=[]
 for(let dz=-1;dz<=1;dz++)for(let dx=-1;dx<=1;dx++)neighbours.push(buildL1Data(seed,cx+dx,cy+dz))
 const boxes:Occluder[]=neighbours.flatMap(d=>d.boxes.filter(b=>b.occlude)),lamps=neighbours.flatMap(d=>d.emitters).filter(e=>e.power>0&&e.kind!=='emergency')
 const portals=[...new Map(neighbours.flatMap(d=>d.openings).filter(p=>p.door).map(p=>[p.id,p])).values()]
  .filter(p=>Math.hypot(Math.max(cx*32-p.x,0,p.x-(cx+1)*32),Math.max(cy*32-p.z,0,p.z-(cy+1)*32))<28)
  .sort((a,b)=>Math.hypot(a.x-cx*32-16,a.z-cy*32-16)-Math.hypot(b.x-cx*32-16,b.z-cy*32-16)||a.id.localeCompare(b.id)).slice(0,8)
 const emptyPortal=()=>portals.map(()=>[0,0,0] as V3),empty=():Radiance=>({rgb:[0,0,0],portal:emptyPortal()})
 for(const d of neighbours)for(const p of d.openings){
  const axis=p.w>p.d?2:0,x=p.x+p.w/2,z=p.z+p.d/2
  boxes.push({id:p.id+':lintel',min:[axis===0?x-.25:p.x,p.height,axis===2?z-.25:p.z],max:[axis===0?x+.25:p.x+p.w,l1BuildingRoof(seed,x,z),axis===2?z+.25:p.z+p.d],style:'maintenance',surface:'metal',solid:false,occlude:true})
 }
 for(const d of neighbours)for(const r of d.roofs){
  boxes.push({id:r.id+':floor',min:[r.x,-.15,r.z],max:[r.x+r.w,0,r.z+r.d],style:r.style,surface:'floor',solid:false,occlude:true})
  if(!r.sky){
   if(r.style==='gothic')for(let z=r.z;z<r.z+r.d;z++)for(let x=r.x;x<r.x+r.w;x++){
    const p:V3[]=[[x,l1BuildingRoof(seed,x,z,true),z],[x+1,l1BuildingRoof(seed,x+1,z,true),z],[x+1,l1BuildingRoof(seed,x+1,z+1,true),z+1],[x,l1BuildingRoof(seed,x,z+1,true),z+1]]
    boxes.push({id:r.id,min:[x,Math.min(...p.map(p=>p[1]))-.002,z],max:[x+1,Math.max(...p.map(p=>p[1]))+.002,z+1],style:r.style,surface:'ceiling',solid:false,occlude:true,triangles:[[p[0],p[1],p[2]],[p[0],p[2],p[3]]]})
   }else boxes.push({id:r.id,min:[r.x,r.height,r.z],max:[r.x+r.w,r.height+.16,r.z+r.d],style:r.style,surface:'ceiling',solid:false,occlude:true})
  }
 }
 const root=tree(boxes),generationMs=performance.now()-start,geometryStart=performance.now(),{faces,size}=layoutL1BakeCharts(data,quality)
 const batches=new Map<string,{style:L1StyleName;surface:L1SurfaceName;p:number[];n:number[];uv:number[];uv1:number[];ix:number[]}>()
 for(const f of faces){
  const key=f.style+':'+f.surface,b=batches.get(key)??{style:f.style,surface:f.surface,p:[],n:[],uv:[],uv1:[],ix:[]};batches.set(key,b)
  const offset=b.p.length/3,scale=f.surface==='ground'?1.05:f.surface==='floor'?.22:f.surface==='ceiling'?(f.style==='storage'?.45:.24):f.surface==='brick'||f.style==='maintenance'&&f.surface==='wall'?.18:.32
  // Geometry tessellation is independent of the 2m light chart. Curved roots
  // receive more vertices without creating thousands of one-texel UV islands.
  // Every chart edge uses the same world subdivision: adaptive per-chart counts
  // create T junctions along curved boundaries, even with identical end points.
  const steps=f.vaultSeed===undefined?1:quality==='high'?12:6
  const vertex=(u:number,v:number,height?:number)=>{
   const index=b.p.length/3,p=point(f,u,v),n=normal(f,u,v);if(height!==undefined)p[1]=height;b.p.push(p[0]-cx*32,p[1],p[2]-cy*32);b.n.push(...n)
   const top=f.vaultSeed!==undefined||Math.abs(n[1])>.55,xFace=Math.abs(n[0])>Math.abs(n[2]),leafUV=f.leafUV??[.003,.368,.433,.626]
   if(f.surface==='leaf')b.uv.push(leafUV[0]+u*leafUV[2],leafUV[1]+v*leafUV[3]);else b.uv.push((top?p[0]:xFace?p[2]:p[0])*scale,(top?p[2]:p[1])*scale)
   b.uv1.push((f.x+.5+u*(f.w-1))/size,(f.y+.5+v*(f.h-1))/size)
   return index
  }
  for(let z=0;z<=steps;z++)for(let x=0;x<=steps;x++)vertex(x/steps,z/steps)
  const triangle=(indices:number[])=>{
   if(f.vaultSeed!==undefined){
    const tri:V3[]=indices.map(i=>[b.p[i*3]+cx*32,b.p[i*3+1],b.p[i*3+2]+cy*32]),pieces=clipL1VaultTriangle(data.seed,tri.map(p=>[p[0],p[2]]),quality==='high'?24:12)
    if(pieces){for(const polygon of pieces){
     if(polygon.length<3)continue
     const add=(p:[number,number])=>vertex((p[0]-f.p[0][0])/(f.p[1][0]-f.p[0][0]),(p[1]-f.p[0][2])/(f.p[3][2]-f.p[0][2]),l1VaultSplitHeight(data.seed,tri,p))
     const ids=polygon.map(add)
     // A centre fan retains every boundary segment, including collinear XZ
     // cuts whose height bends down to the shaft. An endpoint fan drops them.
     const centre=add(polygon.reduce((sum,p)=>[sum[0]+p[0]/polygon.length,sum[1]+p[1]/polygon.length],[0,0] as [number,number]))
     for(let j=0;j<ids.length;j++)b.ix.push(centre,ids[j],ids[(j+1)%ids.length])
    }return}
   }
   b.ix.push(...indices)
  }
  for(let z=0;z<steps;z++)for(let x=0;x<steps;x++){const i=offset+z*(steps+1)+x;triangle([i,i+1,i+steps+2]);triangle([i,i+steps+2,i+steps+1])}
 }
 const meshes:L1BakedMesh[]=[...batches.values()].map(b=>({style:b.style,surface:b.surface,position:new Float32Array(b.p),normal:new Float32Array(b.n),uv:new Float32Array(b.uv),uv1:new Float32Array(b.uv1),index:new Uint32Array(b.ix)}))
 const geometryMs=performance.now()-geometryStart,bakeStart=performance.now(),irradiance=new Uint16Array(size*size*4),direction=new Uint8Array(size*size*4),portalWeights=portals.length?new Uint8Array(size*size*8):undefined
 let rays=0,samples=0
 const lampBins=new Map<string,L1Emitter[]>(),candidates=(p:V3)=>{const key=`${Math.floor(p[0]/4)},${Math.floor(p[2]/4)}`;let list=lampBins.get(key);if(!list){list=lamps.filter(e=>Math.hypot(e.position[0]-p[0],e.position[2]-p[2])<e.range+6);lampBins.set(key,list)}return list}
 const directCache=new Map<string,Radiance&{dir:V3}>()
 const direct=(p:V3,n:V3,footprint=0)=>{
  const rgb:V3=[0,0,0],portal=emptyPortal(),dir:V3=[0,0,0],origin=add(p,mul(n,.006));let weight=0
  // Coverage precedes the sub-texel transport cache: a shaded texel must never
  // borrow a nearby exposed sample from the other side of the column edge.
  if(covered(root,origin))return{rgb,portal,dir:n}
  const key=p.map(v=>Math.round(v*40)).join(',')+':'+n.map(v=>Math.round(v*32)).join(',')+':'+footprint.toFixed(4),cached=directCache.get(key);if(cached)return cached
  for(const e of candidates(p)){
   const toward=sub(e.position,p),distance=Math.hypot(...toward);if(distance>e.range||distance<.06)continue
   const l=mul(toward,1/distance),cos=Math.max(0,dot(n,l));if(cos<=0)continue
   const emit=e.kind==='sky'?Math.pow(Math.max(0,-dot(unit(e.normal),l)),10):e.kind==='tube'?.24+.76*Math.max(0,-dot(e.normal,l)):Math.max(e.backEmission??0,-dot(e.normal,l));if(emit<.002)continue
   const base=cos*emit*e.power*9/(.5+distance*distance)*Math.max(0,1-(distance/e.range)**4)
   if(provisional&&base<.01)continue
   const {visibility,through,rays:visibilityRays}=l1EmitterVisibility(root,e,origin,quality==='high'&&!provisional,footprint,portals.length?(a,b,i)=>l1RayCrossesPortal(portals[i],a,b):undefined,portals.length)
   rays+=visibilityRays
   const k=visibility*base
   for(let j=0;j<3;j++){rgb[j]+=e.color[j]*k;dir[j]+=l[j]*k}weight+=k
   for(let i=0;i<portal.length;i++)for(let j=0;j<3;j++)portal[i][j]+=e.color[j]*base*through[i]
  }const result={rgb,portal,dir:weight>0?unit(dir):n};directCache.set(key,result);return result
 }
 // Interpolate first-hit surfels in absolute surface coordinates. Reusing the
 // nearest 1.8m cell directly produces visible squares, and snapped ray origins
 // can land inside a wall. Visibility/support tests keep interpolation on the
 // receiving surface and preserve occlusion and portal transmission.
 const bounceCache=new Map<string,Radiance>(),bounces=provisional?0:quality==='high'?2:1
 const transfer=(p:V3,n:V3,depth:number):Radiance=>{
  const key=`${depth}:${p.map(v=>v.toFixed(4))}:${n.map(v=>v.toFixed(3))}`,cached=bounceCache.get(key);if(cached)return cached
  const out=empty();bounceCache.set(key,out)
  if(covered(root,add(p,mul(n,.006))))return out
  const tangent=unit(cross(n,Math.abs(n[1])<.8?[0,1,0]:[1,0,0])),bitangent=cross(n,tangent),count=quality==='high'&&depth>1?4:2
  for(let i=0;i<count;i++){
   const angle=(i+.5)*2.3999632297,r=Math.sqrt((i+.5)/count),d=add(mul(n,Math.sqrt(1-r*r)),add(mul(tangent,r*Math.cos(angle)),mul(bitangent,r*Math.sin(angle))))
   rays++;const hit=trace(root,add(p,mul(n,.006)),d,6);if(!hit)continue
   const e=direct(hit.p,hit.n),previous=indirect(hit.p,hit.n,depth-1,hit.style==='gothic'&&hit.surface==='ceiling'),rho=albedo(hit.style,hit.surface)
   for(let j=0;j<3;j++)out.rgb[j]+=(e.rgb[j]+previous.rgb[j])*rho[j]/count
   for(let k=0;k<portals.length;k++){const crossed=l1RayCrossesPortal(portals[k],p,hit.p);for(let j=0;j<3;j++)out.portal[k][j]+=(crossed?e.rgb[j]+previous.rgb[j]:e.portal[k][j]+previous.portal[k][j])*rho[j]/count}
  }return out
 }
 const indirect=(p:V3,n:V3,depth:number,curved=false):Radiance=>{
  if(depth<=0||covered(root,add(p,mul(n,.006))))return empty()
  const axis=curved?1:Math.abs(n[1])>.7?1:Math.abs(n[0])>.7?0:2
  // Cylinder normals must be evaluated on the cylinder, never on a snapped
  // tangent plane outside it. Axis-aligned surfaces share a small lattice.
  if(!curved&&Math.abs(n[axis])<.999)return transfer(p,n,depth)
  const axes=axis===0?[1,2]:axis===1?[0,2]:[0,1],spacing=1.8
  const a=Math.floor(p[axes[0]]/spacing),b=Math.floor(p[axes[1]]/spacing)
  const u=p[axes[0]]/spacing-a,v=p[axes[1]]/spacing-b,out=empty(),origin=add(p,mul(n,.006));let total=0
  for(let y=0;y<2;y++)for(let x=0;x<2;x++){
   const weight=(x?u:1-u)*(y?v:1-v);if(weight<1e-7)continue
   const q:V3=[...p];q[axes[0]]=(a+x)*spacing;q[axes[1]]=(b+y)*spacing;let normal=n
   if(curved){q[1]=l1BuildingRoof(seed,q[0],q[2],true);const h=(x:number,z:number)=>l1BuildingRoof(seed,x,z,true);normal=unit([h(q[0]+.025,q[2])-h(q[0]-.025,q[2]),-.05,h(q[0],q[2]+.025)-h(q[0],q[2]-.025)])}
   const target=add(q,mul(normal,.006))
   if(covered(root,target)||!curved&&!covered(root,add(q,mul(normal,-.006))))continue
   const delta=sub(target,origin),len=Math.hypot(...delta)
   if(len>.002){rays++;if(occluded(root,origin,mul(delta,1/len),len-.001))continue}
   const value=transfer(q,normal,depth);total+=weight
   for(let j=0;j<3;j++)out.rgb[j]+=value.rgb[j]*weight
   for(let k=0;k<portals.length;k++){const crossed=l1RayCrossesPortal(portals[k],p,q);for(let j=0;j<3;j++)out.portal[k][j]+=(crossed?value.rgb[j]:value.portal[k][j])*weight}
  }
  if(total<1e-5)return transfer(p,n,depth)
  for(let j=0;j<3;j++)out.rgb[j]/=total
  for(const p of out.portal)for(let j=0;j<3;j++)p[j]/=total
  return out
 }
 const put=(x:number,y:number,rgb:V3,dir:V3)=>{const o=(y*size+x)*4;for(let j=0;j<3;j++){irradiance[o+j]=half(rgb[j]);direction[o+j]=Math.round((dir[j]*.5+.5)*255)}irradiance[o+3]=half(1);direction[o+3]=255}
 const portalRatios=(rgb:V3,a:V3[],b?:V3[])=>a.map((v,k)=>Math.min(1,Math.max(0,luminance(b?add(v,b[k]):v)/Math.max(1e-6,luminance(rgb)))))
 for(const f of faces){
  if(f.surface==='leaf')continue
  const footprint=!provisional&&quality==='high'&&(f.surface==='floor'||f.surface==='ground')?Math.min(Math.hypot(...sub(f.p[1],f.p[0]))/Math.max(1,f.w-1),Math.hypot(...sub(f.p[3],f.p[0]))/Math.max(1,f.h-1)):0
  for(let y=0;y<f.h;y++)for(let x=0;x<f.w;x++){
   const u=f.w===1?.5:x/(f.w-1),v=f.h===1?.5:y/(f.h-1),p=point(f,u,v),n=normal(f,u,v),lit=direct(p,n,footprint),bounce=indirect(p,n,bounces,f.vaultSeed!==undefined)
   const rgb=add(lit.rgb,bounce.rgb);put(f.x+x,f.y+y,rgb,lit.dir);samples++
   if(portalWeights){const ratios=portalRatios(rgb,lit.portal,bounce.portal);for(let k=0;k<ratios.length;k++)portalWeights[((f.y+y+Math.floor(k/4)*size)*size+f.x+x)*4+k%4]=Math.round(ratios[k]*255)}
  }
  for(let y=-1;y<=f.h;y++)for(let x=-1;x<=f.w;x++)if(x<0||x>=f.w||y<0||y>=f.h){const a=((f.y+Math.max(0,Math.min(f.h-1,y)))*size+f.x+Math.max(0,Math.min(f.w-1,x)))*4,b=((f.y+y)*size+f.x+x)*4;irradiance.copyWithin(b,a,a+4);direction.copyWithin(b,a,a+4);if(portalWeights)for(let k=0;k<2;k++)portalWeights.copyWithin(b+k*size*size*4,a+k*size*size*4,a+k*size*size*4+4)}
 }
 const probes:L1Probe[]=[]
 for(let z=2;z<32;z+=4)for(let x=2;x<32;x+=4){
  if(!data.floor[Math.floor(z)*32+Math.floor(x)])continue
  const p:V3=[cx*32+x,1.3,cy*32+z],lit=direct(p,[0,1,0]),bounce=indirect(p,[0,1,0],bounces)
  const color=add(lit.rgb,bounce.rgb);probes.push({position:p,color,indirect:bounce.rgb,direction:lit.dir,...(portals.length?{portal:portalRatios(color,lit.portal,bounce.portal),indirectPortal:portalRatios(bounce.rgb,bounce.portal)}:{})})
 }
 const bakeMs=performance.now()-bakeStart,bytes=irradiance.byteLength+direction.byteLength+(portalWeights?.byteLength??0)+meshes.reduce((n,m)=>n+m.position.byteLength+m.normal.byteLength+m.uv.byteLength+m.uv1.byteLength+m.index.byteLength,0)
 return{version:4,bakeRevision:L1_BAKE_REVISION,fingerprint:data.fingerprint,seed,cx,cy,quality,...(provisional?{provisional:true as const}:{}),size,irradiance,direction,meshes,probes,...(portalWeights?{portalWeights,portalIds:portals.map(p=>p.id)}:{}),metrics:{generationMs,geometryMs,bakeMs,samples,rays,bytes}}
}
