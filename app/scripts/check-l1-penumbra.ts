import {mkdirSync,writeFileSync} from 'node:fs'
import {tree} from '../src/game/world/l1BakeRaycast'
import {l1EmitterVisibility} from '../src/game/world/l1BakeVisibility'
import type {L1Box,L1Emitter,V3} from '../src/game/world/l1BuildingTypes'

let assertions=0
const ok=(v:unknown,m:string)=>{assertions++;if(!v)throw Error(m)}
const wall:L1Box={id:'occluder',min:[-.5,0,1.4999],max:[.5,2.6,1.5001],style:'parking',surface:'wall',solid:true,occlude:true}
const root=tree([wall]),lamp:L1Emitter={id:'tube',position:[0,3,0],normal:[0,-1,0],tangent:[1,0,0],width:1.2,height:.045,kind:'tube',color:[1,1,1],power:1,range:12,style:'parking'}
const profiles:any[]=[],values=new Set<number>();let maximumError=0,maxStep=0,last=0,adaptive=0
for(let i=0;i<=420;i++){
 const x=i*.005,p:V3=[x,.006,3],v=l1EmitterVisibility(root,lamp,p,true)
 const expected=1-Math.max(0,Math.min(.6,1-x)-Math.max(-.6,-1-x))/1.2
 maximumError=Math.max(maximumError,Math.abs(v.visibility-expected));maxStep=Math.max(maxStep,Math.abs(v.visibility-last));last=v.visibility;values.add(v.visibility)
 ok(v.rays===2||v.rays===16,'Bounded adaptive visibility samples');if(v.rays===16)adaptive++
 const again=l1EmitterVisibility(root,lamp,[...p],true)
 ok(v.visibility===again.visibility,'Deterministic absolute-coordinate visibility at chart seams')
 const filtered=l1EmitterVisibility(root,lamp,p,true,1/6)
 ok(filtered.visibility>=0&&filtered.visibility<=1,'Finite footprint visibility')
 profiles.push({x,expected,visibility:v.visibility,filtered:filtered.visibility,rays:v.rays})
}
ok(values.size>=13,'Penumbra contains many levels instead of quarter-light bands')
ok(maximumError<.115,'Visibility follows the finite tube analytic penumbra')
ok(maxStep<=.125,'No quarter/half-light jumps across a smooth penumbra')
ok(adaptive>100&&adaptive<400,'Extra rays apply only near the shadow edge')
// A finite panel must also see an occluder on its short axis. Rotating the
// same arrangement swaps axes without changing the integral.
const rotatedRoot=tree([{...wall,min:[1.4999,0,-.5],max:[1.5001,2.6,.5]}])
for(const x of [.2,.6,.9,1.2,1.7]){
 const a=l1EmitterVisibility(root,lamp,[x,.006,3],true),b=l1EmitterVisibility(rotatedRoot,{...lamp,tangent:[0,0,1]},[3,.006,x],true)
 ok(a.visibility===b.visibility,'Rotated emitter/receiver preserve visibility')
}
mkdirSync('reports/hotbar-collision-shadow',{recursive:true})
const result={passed:true,assertions,levels:values.size,maximumError,maxStep,adaptive,profiles}
writeFileSync('reports/hotbar-collision-shadow/penumbra.json',JSON.stringify(result,null,2));console.log(JSON.stringify({...result,profiles:undefined}))
