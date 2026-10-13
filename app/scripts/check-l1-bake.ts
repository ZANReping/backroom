import {buildL1Data} from '../src/game/world/l1Building'
import {bakeL1} from '../src/game/world/l1Bake'
import {registerL1Probes,removeL1Probes,l1ProbeIlluminance} from '../src/game/renderer/l1Probes'
const high=process.argv.includes('--high'),seed=20261006,cx=Math.floor(2064/32),cy=Math.floor(16/32)
const finite=(a:ArrayLike<number>)=>Array.from(a).every(Number.isFinite),same=(a:ArrayLike<number>,b:ArrayLike<number>)=>a.length===b.length&&Array.from(a).every((v,i)=>v===b[i])
function check(r:any){if(!finite(r.irradiance)||!finite(r.direction))throw Error('non-finite atlas');if(r.irradiance.some((v:number)=>v<0)||!r.irradiance.some((v:number)=>v>0))throw Error('invalid irradiance');if(!r.direction.length||!finite(r.direction))throw Error('invalid direction');for(const m of r.meshes){if(m.position.length%3||m.normal.length!==m.position.length||m.uv.length!==m.position.length/3*2||m.uv1.length!==m.uv.length||!finite(m.position)||!finite(m.normal)||!finite(m.uv)||!finite(m.uv1))throw Error('invalid mesh arrays');for(const v of m.uv1)if(!(v>0&&v<1))throw Error('UV1 out of range')}}
const a=bakeL1(seed,cx,cy,'low'),b=bakeL1(seed,cx,cy,'low'),expected=buildL1Data(seed,cx,cy);check(a);if(a.fingerprint!==expected.fingerprint||b.fingerprint!==a.fingerprint||!same(a.irradiance,b.irradiance)||!same(a.direction,b.direction)||a.meshes.length!==b.meshes.length)throw Error('non-deterministic bake')
if(high)check(bakeL1(seed,cx,cy,'high'))
for(const value of a.irradiance)if((value&0x7c00)===0x7c00)throw Error('Half-float Inf/NaN in atlas')
// Disposing one of two cached instances must not erase the surviving probes.
const shared={...a,seed:918273,cx:0,cy:0,probes:[{position:[2,1.3,2] as [number,number,number],color:[1,1,1] as [number,number,number],indirect:[.2,.2,.2] as [number,number,number],direction:[0,1,0] as [number,number,number]}]}
registerL1Probes(shared);registerL1Probes(shared);removeL1Probes(shared)
if(l1ProbeIlluminance(918273,2,2)!==1)throw Error('Shared probe removed before final owner')
removeL1Probes(shared);if(l1ProbeIlluminance(918273,2,2)!==0)throw Error('Probe leaked after final owner')
const half=(v:number)=>{const e=(v>>10)&31,m=v&1023;return e===0?m*2**-24:(1+m/1024)*2**(e-15)}
const edge=(r:ReturnType<typeof bakeL1>,worldX:number)=>{
 const values=new Map<string,number[]>()
 for(const m of r.meshes)if(m.surface==='floor')for(let i=0;i<m.position.length/3;i++){
  if(Math.abs(m.position[i*3]+r.cx*32-worldX)>.001)continue
  const z=m.position[i*3+2]+r.cy*32,u=Math.round(m.uv1[i*2]*r.size-.5),v=Math.round(m.uv1[i*2+1]*r.size-.5),index=(v*r.size+u)*4
  values.set(z.toFixed(3),Array.from(r.irradiance.slice(index,index+3),half))
 }return values
}
const left=bakeL1(7391,-1,-1,'low');buildL1Data(7391,13,-27);buildL1Data(7391,-7,4);const right=bakeL1(7391,0,-1,'low')
let seamMax=0,seamCount=0;for(const [z,rgb]of edge(left,0)){const q=edge(right,0).get(z);if(!q)continue;seamCount++;for(let j=0;j<3;j++)seamMax=Math.max(seamMax,Math.abs(rgb[j]-q[j]))}
if(!seamCount||seamMax>.012)throw Error('World-space seam illumination mismatch: '+JSON.stringify({seamCount,seamMax}))
console.log(JSON.stringify({sharedInstanceRelease:true,seamCount,seamMax}))
console.log(JSON.stringify({passed:true,lowFingerprint:a.fingerprint,highChecked:high,meshes:a.meshes.length}))
