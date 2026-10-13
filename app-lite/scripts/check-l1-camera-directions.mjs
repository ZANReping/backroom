import assert from 'node:assert/strict'
import {existsSync,readFileSync,writeFileSync} from 'node:fs'
import {PerspectiveCamera,Vector3} from 'three'
import {projectReferenceParallel} from './l1-reference-projection.mjs'

// Independent projection checks: changing position cannot change a vanishing
// direction; reversed source segments have the same unsigned error.
const camera=new PerspectiveCamera(62,1.35,.05,1000)
camera.position.set(3,1.7,9);camera.rotation.order='YXZ';camera.rotation.set(-.18,.24,-.08);camera.updateMatrixWorld()
for(const axis of [0,1,2]){
 const a=new Vector3(-1,.8,-4),b=a.clone();b.setComponent(axis,b.getComponent(axis)+1)
 const uv=p=>{const v=p.clone().project(camera);return[(v.x+1)/2,(1-v.y)/2]}
 const line={axis,from:uv(a),to:uv(b)},error=projectReferenceParallel(camera,line)
 assert(Math.abs(error.endpointError)<1e-9)
 camera.position.addScalar(100);camera.updateMatrixWorld()
 assert(Math.abs(projectReferenceParallel(camera,line).endpointError)<1e-9)
 camera.position.addScalar(-100);camera.updateMatrixWorld()
 const wrong={...line,to:[line.to[0]+.04,line.to[1]-.02]}
 assert(Math.abs(projectReferenceParallel(camera,wrong).endpointError-projectReferenceParallel(camera,{...wrong,from:wrong.to,to:wrong.from}).endpointError)<1e-9)
}
// Direction exactly parallel to the image plane has a vanishing point at infinity.
camera.rotation.set(0,0,0);camera.updateMatrixWorld()
assert.equal(projectReferenceParallel(camera,{axis:0,from:[.1,.2],to:[.9,.2]}).endpointError,0)

const iteration=process.env.L1_QA_ITERATION??'iteration-11';assert(/^iteration-\d+$/.test(iteration))
const root=`reports/l1-remake/${iteration}`,reference=JSON.parse(readFileSync(`${root}/reference-data.json`,'utf8'))
const beforeFile=existsSync(`${root}/baseline/actual-cameras.json`)?`${root}/baseline/actual-cameras.json`:'reports/l1-remake/iteration-9/final/actual-cameras.json'
const before=JSON.parse(readFileSync(beforeFile,'utf8'))
const after=JSON.parse(readFileSync(`${root}/final/actual-cameras.json`,'utf8'))
const rows=[]
for(const [id,c]of Object.entries(reference.cases))if(c.parallels?.length){
 const measurements=[]
 for(const [phase,poses]of [['before',before],['after',after]]){
  const pose=poses.find(p=>p.id===id);assert(pose,`Missing recorded ${phase} camera for ${id}`)
  const cam=new PerspectiveCamera(pose.fov,pose.aspect,.05,1000);cam.position.fromArray(pose.worldPosition);cam.rotation.fromArray(pose.rotation);cam.updateMatrixWorld()
  measurements.push({phase,pose,lines:c.parallels.map(line=>({id:line.id,...projectReferenceParallel(cam,line)}))})
 }
 rows.push({id,measurements})
}
writeFileSync(`${root}/camera-direction-change.json`,JSON.stringify({passed:true,beforeFile,method:'Identical source line annotations and recorded actual cameras. Direction errors do not measure surface placement or full image similarity.',rows},null,2)+'\n')
console.log(JSON.stringify({passed:true,cases:rows.length,errors:rows.map(r=>({id:r.id,...Object.fromEntries(r.measurements.map(m=>[m.phase,{meanAngleDegrees:m.lines.reduce((s,l)=>s+Math.abs(l.angleDegrees),0)/m.lines.length,maxEndpointPercent:Math.max(...m.lines.map(l=>l.endpointError))*100}]))}))}))
