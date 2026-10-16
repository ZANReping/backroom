import * as THREE from 'three'
import { CityBatch } from '../src/game/renderer/l11Batch'

const material = new THREE.MeshBasicMaterial()
const fail = (message:string):never => { throw new Error(message) }
const bucket = (batch:CityBatch) => (batch as unknown as { buckets:Map<THREE.Material,{p:number[];n:number[];uv:number[];idx:number[]}> }).buckets.get(material)!
const check = (name:string,b:{p:number[];n:number[];uv:number[];idx:number[]}) => {
  for(let i=0;i<b.idx.length;i+=3){
    const ia=b.idx[i]*3,ib=b.idx[i+1]*3,ic=b.idx[i+2]*3
    const a=new THREE.Vector3().fromArray(b.p,ia), bb=new THREE.Vector3().fromArray(b.p,ib), c=new THREE.Vector3().fromArray(b.p,ic)
    const gn=new THREE.Vector3().crossVectors(bb.clone().sub(a),c.clone().sub(a))
    if(gn.lengthSq()<1e-10)fail(`${name}: degenerate triangle ${i/3}`)
    gn.normalize()
    for(const n of [ia,ib,ic]) if(gn.dot(new THREE.Vector3().fromArray(b.n,n))<.99)fail(`${name}: vertex normal mismatch ${i/3}`)
  }
}
const batch = new CityBatch()
batch.wall(material,[0,0],[4,0],0,3,.2)
check('wall',bucket(batch))
const angled = new CityBatch()
const s=Math.SQRT1_2
angled.quad(material,[[0,0,0],[2.828427,1,2.828427],[2.828427,3,2.828427],[0,2,0]],[-s,0,s])
check('forward diagonal wall',bucket(angled))
const angledBack = new CityBatch()
angledBack.quad(material,[[0,0,0],[2.828427,1,2.828427],[2.828427,3,2.828427],[0,2,0]],[s,0,-s])
check('reverse diagonal wall',bucket(angledBack))
const slope = new CityBatch()
slope.quad(material,[[0,0,0],[4,0,0],[4,1,4],[0,1,4]],[0,.97,-.24])
check('slope',bucket(slope))
const box = new CityBatch(); box.box(material,0,1,0,2,2,3); check('box',bucket(box))
const u = bucket(angled).uv
const us = [u[0],u[2],u[4],u[6]]
if(Math.abs(Math.max(...us)-Math.min(...us)-4)>1e-6)fail(`45 degree wall U span is ${Math.max(...us)-Math.min(...us)}, expected 4`)
const explicit = new CityBatch()
const supplied=[[.1,.2],[.3,.4],[.5,.6],[.7,.8]]
explicit.quad(material,[[0,0,0],[1,0,0],[1,1,0],[0,1,0]],[0,0,1],1,supplied)
if(JSON.stringify(bucket(explicit).uv)!==JSON.stringify(supplied.flat()))fail('explicit sign UVs changed')
const continuous = new CityBatch()
continuous.quad(material,[[0,0,0],[2,0,0],[2,2,0],[0,2,0]],[0,0,1])
continuous.quad(material,[[2,0,0],[4,0,0],[4,2,0],[2,2,0]],[0,0,1])
const cu=bucket(continuous).uv
if(Math.abs(cu[2]-cu[8])>1e-6)fail('collinear wall UV seam is discontinuous')
console.log('check-l11-surfaces: ok (wall, box, diagonal walls, slope, explicit UVs, continuous UVs)')
