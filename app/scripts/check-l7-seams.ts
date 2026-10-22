import {createCanvas} from '@napi-rs/canvas'
Object.assign(globalThis,{document:{createElement:()=>createCanvas(256,256)},window:{addEventListener(){},removeEventListener(){},matchMedia:()=>({matches:false})},localStorage:{getItem:()=>null,setItem(){},removeItem(){}}})
const THREE=await import('three')
const {L7}=await import('../src/game/levels/l7')
const {generateInfinite,updateInfinite}=await import('../src/game/world/infinite')
const {l7SeaHAt,l7SeaTile,l7SeaNodeH}=await import('../src/game/world/mapgen')
const {buildTerrain}=await import('../src/game/renderer/geometry')
let pass=0,fail=0;const ok=(b:unknown,s:string)=>{if(b)pass++;else{fail++;console.error('FAIL',s)}}
function edge(g:InstanceType<typeof THREE.Group>,ox:number,oy:number,axis:'x'|'z',at:number){
 const out=new Map<number,{h:number;n:number[]}>(),v=new THREE.Vector3()
 g.updateWorldMatrix(true,true);g.traverse((o:any)=>{
  if(!o.isMesh||!o.material?.customProgramCacheKey?.().includes('l7seabed'))return
  const p=o.geometry.attributes.position,n=o.geometry.attributes.normal
  for(let i=0;i<p.count;i++){v.fromBufferAttribute(p,i).applyMatrix4(o.matrixWorld);v.x+=ox;v.z+=oy;if(Math.abs(v[axis]-at)<1e-4)out.set(Math.round((axis==='x'?v.z:v.x)*2),{h:v.y,n:[n.getX(i),n.getY(i),n.getZ(i)]})}
 });return out
}
function dispose(g:InstanceType<typeof THREE.Group>){g.traverse((o:any)=>o.geometry?.dispose())}
const finite:any={w:4,h:4,l7SeaTerrain:true,tiles:new Uint8Array(16).fill(1),outdoor:new Uint8Array(16).fill(1),liquid:new Uint8Array(16).fill(1),seaFloor:new Float32Array(16).fill(50),elev:new Uint8Array(16)}
ok(l7SeaNodeH(finite,4,1.5)===-50&&l7SeaNodeH(finite,0,1.5)===-50,'finite ocean edges keep their original height clamp')
const records:any[]=[]
for(const seed of [1,777,424242])for(const dir of [0,1,2,3]){
 const m=generateInfinite(L7,seed,false),inf=m.inf!,horizontal=dir<2
 const center=dir===0?{x:-10,y:15}:dir===1?{x:35,y:15}:dir===2?{x:15,y:-10}:{x:15,y:35}
 updateInfinite(m,L7,center.x-inf.ox,center.y-inf.oy)
 const edgeWorld=dir===0?64:dir===1?-32:dir===2?64:-32
 const oldChunk=dir===0?{x:1,y:0}:dir===1?{x:-1,y:0}:dir===2?{x:0,y:1}:{x:0,y:-1}
 const newChunk=dir===0?{x:2,y:0}:dir===1?{x:-2,y:0}:dir===2?{x:0,y:2}:{x:0,y:-2}
 const old=new THREE.Group(),ox=inf.ox,oy=inf.oy
 const build=(g:InstanceType<typeof THREE.Group>,c:{x:number;y:number})=>{const x=c.x*32-inf.ox,y=c.y*32-inf.oy;for(let z=y;z<y+32;z+=4)buildTerrain(m,L7,3,g,{x0:x,y0:z,x1:x+32,y1:z+4})}
 build(old,oldChunk)
 const a=edge(old,ox,oy,horizontal?'x':'z',edgeWorld)
 updateInfinite(m,L7,15-inf.ox,15-inf.oy)
 old.position.set(ox-inf.ox,0,oy-inf.oy)
 const fresh=new THREE.Group();build(fresh,newChunk)
 const b=edge(fresh,inf.ox,inf.oy,horizontal?'x':'z',edgeWorld)
 let gap=0,norm=0,n=0
 for(const [key,p]of a){const q=b.get(key);if(!q)continue;n++;gap=Math.max(gap,Math.abs(p.h-q.h));norm=Math.max(norm,...p.n.map((v,i)=>Math.abs(v-q.n[i])))}
 ok(n>=60,`seed ${seed} dir ${dir} real seam vertices exist (${n})`)
 ok(gap<.0001,`seed ${seed} dir ${dir} old/new mesh heights agree (${gap}m)`)
 ok(norm<.0001,`seed ${seed} dir ${dir} old/new mesh normals agree (${norm})`)
 for(const [key,p]of a){const x=horizontal?edgeWorld:key/2,y=horizontal?key/2:edgeWorld,lx=x-inf.ox,ly=y-inf.oy;if(l7SeaTile(m,Math.floor(lx),Math.floor(ly)))ok(Math.abs(p.h-l7SeaHAt(m,lx,ly))<.0001,`collision matches retained mesh at ${x},${y}`)}
 records.push({seed,dir,gap,norm,samples:n});dispose(old);dispose(fresh)
 // The exact same world node is invariant at a former outer window corner.
 const wx=edgeWorld,wy=edgeWorld,prior=l7SeaNodeH(m,wx-inf.ox,wy-inf.oy)
 updateInfinite(m,L7,wx-30-inf.ox,wy-30-inf.oy)
 ok(Math.abs(prior-l7SeaNodeH(m,wx-inf.ox,wy-inf.oy))<.0001,`seed ${seed} dir ${dir} corner sampling is load-order independent`)
}
console.log(JSON.stringify({pass,fail,records},null,2));if(fail)process.exit(1)
