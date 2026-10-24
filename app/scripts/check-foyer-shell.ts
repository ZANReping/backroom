import assert from 'node:assert/strict'
import { FOYER_CEIL, FOYER_DOORS, foyerWallBlocks, foyerWallUnion } from '../src/game/world/foyerLayout'
import { resetBreakCube, setBreakCubeCapturer, captureBreakCube, takeBreakCube, prepareBreakCube, type BreakCubeCapture } from '../src/game/core/breakCube'
const blocks=foyerWallBlocks(),{faces,soffits}=foyerWallUnion();let checks=0
const ok=(v:unknown,s:string)=>{assert(v,s);checks++}
const inside=(x:number,y:number,z:number)=>blocks.some(b=>x>b.x0&&x<b.x1&&y>b.y0&&y<b.y1&&z>b.bottom&&z<b.top)
// Every exposed face has solid wall behind it, empty space in front, and finite geometry.
for(const f of faces){
 const mid=(f.a+f.b)/2,z=(f.bottom+f.top)/2,point=(off:number)=>f.axis==='y'?[f.at+off,mid,z]:[mid,f.at+off,z]
 ok(Object.values(f).every(v=>typeof v!=='number'||Number.isFinite(v))&&f.b>f.a&&f.top>f.bottom,'valid face')
 ok(inside(...point(-f.sign*.0001) as [number,number,number])&&!inside(...point(f.sign*.0001) as [number,number,number]),'no internal overlap cap')
}
for(const [x,y]of [[12,8],[9,8],[9,9]])for(const z of [.05,1.55,2.79])ok(inside(x+.025,y+.025,z)&&inside(x-.025,y-.025,z),'joined L/T corner')
for(const d of FOYER_DOORS.filter(d=>d.style!=='security')){
 const mid=(d.a+d.b)/2;ok(!inside(mid,d.at,1.55),'door clear');ok(inside(mid,d.at,FOYER_CEIL-.01),'header closed')
}
ok(soffits.length>0,'headers have downward faces')
// A reset must abort pending readback and ignore its late result, including on a new run.
const pending:{resolve:(c:BreakCubeCapture|null)=>void;signal:AbortSignal}[]=[];let prepared=0,released=0
setBreakCubeCapturer((_canvas,signal)=>new Promise(resolve=>pending.push({resolve,signal})),()=>prepared++,()=>released++)
prepareBreakCube();prepareBreakCube();ok(prepared===1,'one preparation per cut')
captureBreakCube({} as HTMLCanvasElement);resetBreakCube();ok(pending[0].signal.aborted&&released===1,'reset aborts and releases')
pending[0].resolve({face:99} as BreakCubeCapture);await Promise.resolve();ok(takeBreakCube()===null,'stale capture never reaches next run')
prepareBreakCube();captureBreakCube({} as HTMLCanvasElement);pending[1].resolve({face:42} as BreakCubeCapture);await Promise.resolve()
ok(takeBreakCube()?.face===42&&takeBreakCube()===null,'capture consumed exactly once')
setBreakCubeCapturer(null)
console.log(JSON.stringify({ok:true,checks,blocks:blocks.length,faces:faces.length,soffits:soffits.length}))
