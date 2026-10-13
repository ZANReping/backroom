// Back-project source-photo annotations onto a known horizontal building plane.
// This produces calibration data only; it never changes the camera or image.
import {readFileSync} from 'node:fs'
import {PerspectiveCamera,Raycaster,Vector2,Vector3,Plane} from 'three'
const iteration=process.env.L1_QA_ITERATION??'iteration-9',id=process.argv[2],height=Number(process.env.L1_QA_PLANE_HEIGHT??0)
if(!/^iteration-\d+$/.test(iteration)||!Number.isFinite(height))throw Error('Invalid calibration arguments')
const root=`reports/l1-remake/${iteration}`,a=JSON.parse(readFileSync(`${root}/reference-data.json`,'utf8')).cases[id]?.anchor
const pose=JSON.parse(readFileSync(`${root}/final/actual-cameras.json`,'utf8')).find(p=>p.id===id)
if(!a||!pose)throw Error('No recorded reference camera')
const camera=new PerspectiveCamera(pose.fov,pose.aspect,.05,1000);camera.position.fromArray(pose.worldPosition);camera.rotation.fromArray(pose.rotation);camera.updateMatrixWorld()
const ray=new Raycaster(),plane=new Plane(new Vector3(0,1,0),-height)
const rows=process.argv.slice(3).map(value=>{const uv=value.split(',').map(Number);if(uv.length!==2||uv.some(v=>!Number.isFinite(v)||v<0||v>1))throw Error('Expected normalized u,v')
 ray.setFromCamera(new Vector2(uv[0]*2-1,1-uv[1]*2),camera);const p=ray.ray.intersectPlane(plane,new Vector3())
 return{uv,world:p?.toArray()??null,relative:p?[p.x-a.centerX,p.y,p.z-a.centerY]:null}
})
console.log(JSON.stringify({id,height,rows},null,2))
