// Propose camera changes from fixed source annotations. This never edits source
// landmarks or game geometry; silhouette/occlusion review is still required.
import * as THREE from 'three'
import {mkdirSync,writeFileSync} from 'node:fs'
import {resolve} from 'node:path'
import {fileURLToPath} from 'node:url'
import {L1_PHOTO_ANCHORS} from '../src/game/world/l1Spatial'
import {L1_REFERENCE_CASES} from '../src/game/world/l1ReferenceCases'
import {buildL1Data,l1BuildingFloorAt} from '../src/game/world/l1Building'
import {projectReferencePoint,projectReferenceParallel} from './l1-reference-projection.mjs'
import {genL1ChunkRaw} from '../src/game/world/infiniteL1'
import {L1} from '../src/game/levels/l1'
import {structColliders} from '../src/game/world/mapgen'
const iteration=process.env.L1_QA_ITERATION??'iteration-6';if(!/^iteration-\d+$/.test(iteration))throw Error('Invalid iteration')
const root=resolve(fileURLToPath(new URL('../',import.meta.url)),'reports/l1-remake',iteration),rows=[]
const camera=new THREE.PerspectiveCamera()
const selected=process.env.L1_QA_ANCHORS?.split(',').filter(Boolean)
if(selected?.some(id=>!L1_PHOTO_ANCHORS.some(a=>a.id===id)))throw Error('Unknown camera case')
const solids=new Map<string,ReturnType<typeof structColliders>>()
function clear(x:number,z:number){
 for(const dx of [-.32,0,.32])for(const dz of [-.32,0,.32])if(!l1BuildingFloorAt(20261006,x+dx,z+dz))return false
 for(let cz=Math.floor((z-.32)/32);cz<=Math.floor((z+.32)/32);cz++)for(let cx=Math.floor((x-.32)/32);cx<=Math.floor((x+.32)/32);cx++){
  const key=`${cx},${cz}`;let boxes=solids.get(key)
  if(!boxes){boxes=genL1ChunkRaw(L1,20261006,cx,cz).structures.filter(s=>s.solid&&!s.data?.l1Hidden).flatMap(s=>structColliders(s));solids.set(key,boxes)}
  for(const b of boxes)if(b.top>.65&&(b.bottom??0)<1.48){const dx=x-Math.max(b.x0,Math.min(b.x1,x)),dz=z-Math.max(b.y0,Math.min(b.y1,z));if(dx*dx+dz*dz<=.32*.32)return false}
 }
 return true
}
for(const a of L1_PHOTO_ANCHORS.filter(a=>!selected||selected.includes(a.id))){
 const fitShaft=a.id==='gothic'&&process.argv.includes('--gothic-shaft')
 const marks=L1_REFERENCE_CASES[a.id].landmarks,parallels=L1_REFERENCE_CASES[a.id].parallels??[],initial=[a.x-a.centerX,a.y-a.centerY,a.z,a.yaw,a.pitch,a.fov,a.roll,...(fitShaft?[L1_REFERENCE_CASES.gothic.module.columnWidth!/2,L1_REFERENCE_CASES.gothic.module.springHeight??1.35]:[])]
 const bounds=[[-20,20],[-12,28],[a.id==='storage'||a.id==='crate'?-1.25:-.5,a.id==='gothic'?1.25:.5],a.id==='parking-props'?[-.08,.08]:[-1.4,1.4],[-.45,.45],[a.id==='crate'?35:parallels.length?25:48,88],a.id==='parking-props'?[-.012,.012]:fitShaft?[-.025,.025]:parallels.length?[-.25,.25]:[-.07,.07],...(fitShaft?[[.32,.65],[1.1,2.4]]:[])],scale=a.id==='crate'?[.15,.2,.1,.05,.05,4,.025]:[2,2,.15,.1,.08,6,.025,...(fitShaft?[.12,.3]:[])],dimensions=initial.length
 const project=(v:number[])=>{camera.aspect=a.width/a.height;camera.fov=v[5];camera.position.set(v[0],1.55+v[2],v[1]);camera.rotation.order='YXZ';camera.rotation.set(v[4],v[3],v[6]);camera.updateProjectionMatrix();camera.updateMatrixWorld();return marks.map(m=>{const mark=fitShaft&&m.world[1]>0?{...m,world:[m.world[0],v[8],m.world[2]],...(m.profile?{profile:{...m.profile,center:[m.profile.center[0],v[8],m.profile.center[2]],radius:v[7]}}:{})}:m;const p=projectReferencePoint(camera,mark);return{x:p.uv[0],y:p.uv[1],z:p.z}})}
 const evaluate=(v:number[])=>{
  let penalty=0;for(let j=0;j<dimensions;j++)penalty+=Math.max(bounds[j][0]-v[j],0,v[j]-bounds[j][1])**2*10
  if(penalty>0)return 100+penalty
  if(!clear(a.centerX+v[0],a.centerY+v[1]))return 100
  const points=project(v);let sum=0
  let worst=0
  for(let i=0;i<marks.length;i++){const p=points[i],m=marks[i],x=(p.x-m.image[0])**2,y=(p.y-m.image[1])**2;sum+=x+y;worst=Math.max(worst,x,y);if(p.z>=1||p.z<=-1)sum+=10}
  for(const line of parallels)sum+=projectReferenceParallel(camera,line).endpointError**2*8
  if(fitShaft)sum+=worst*5
  // A weak preference for a nearby tripod position limits the underdetermined
  // two-point cases. It must never count as independent visual evidence.
  for(let j=0;j<dimensions;j++)sum+=.000002*((v[j]-initial[j])/scale[j])**2
  return sum
 }
 let best={v:initial,e:evaluate(initial)}
 for(let start=0;start<8;start++){
  const seed=initial
  const s=seed.map((v,j)=>v+(start===0?0:Math.sin(start*13.7+j*5.3)*scale[j]))
  let simplex=[s,...s.map((_,i)=>s.map((v,j)=>v+(i===j?scale[j]:0)))].map(v=>({v,e:evaluate(v)}))
  for(let n=0;n<1100;n++){
   simplex.sort((a,b)=>a.e-b.e);const centroid=initial.map((_,i)=>simplex.slice(0,dimensions).reduce((s,p)=>s+p.v[i],0)/dimensions),worst=simplex[dimensions]
   const candidate=(factor:number)=>{const v=centroid.map((p,j)=>p+(p-worst.v[j])*factor);return{v,e:evaluate(v)}}
   const reflected=candidate(1)
   if(reflected.e<simplex[0].e){const expanded=candidate(2);simplex[dimensions]=expanded.e<reflected.e?expanded:reflected}
   else if(reflected.e<simplex[dimensions-1].e)simplex[dimensions]=reflected
   else{const contracted=candidate(reflected.e<worst.e?.5:-.5);if(contracted.e<Math.min(worst.e,reflected.e))simplex[dimensions]=contracted;else simplex=simplex.map((p,i)=>{if(!i)return p;const v=p.v.map((q,j)=>(q+simplex[0].v[j])*.5);return{v,e:evaluate(v)}})}
  }
  simplex.sort((a,b)=>a.e-b.e);if(simplex[0].e<best.e)best=simplex[0]
 }
 const v=best.v.map(v=>Math.round(v*10000)/10000),x=a.centerX+v[0],z=a.centerY+v[1],d=buildL1Data(20261006,Math.floor(x/32),Math.floor(z/32))
 const safe=clear(x,z)&&!d.boxes.some(b=>b.solid&&x>b.min[0]-.3&&x<b.max[0]+.3&&z>b.min[2]-.3&&z<b.max[2]+.3)
 const origin=marks[0]?.world,nonCollinear=origin&&marks.some((m,i)=>marks.slice(i+1).some(n=>new THREE.Vector3(...m.world).sub(new THREE.Vector3(...origin)).cross(new THREE.Vector3(...n.world).sub(new THREE.Vector3(...origin))).lengthSq()>1e-6))
 project(v)
 rows.push({id:a.id,initial,proposed:v.slice(0,7),...(fitShaft?{module:{columnWidth:v[7]*2,columnDepth:v[7]*2,springHeight:v[8]}}:{}),safe,parallels:parallels.map(line=>({id:line.id,...projectReferenceParallel(camera,line)})),landmarks:marks.length,underdetermined:marks.length<3||!nonCollinear,maxErrorPercent:Math.max(...project(v).flatMap((p,i)=>[Math.abs(p.x-marks[i].image[0]),Math.abs(p.y-marks[i].image[1])]))*100})
}
mkdirSync(root,{recursive:true});writeFileSync(resolve(root,selected?'camera-fit-proposals-'+selected.join('_')+'.json':'camera-fit-proposals.json'),JSON.stringify(rows,null,2)+'\n');console.log(JSON.stringify(rows))
