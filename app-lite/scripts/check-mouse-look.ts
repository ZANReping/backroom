import assert from 'node:assert/strict'
import {MouseLookInput,requestMouseCapture,type MouseMotion} from '../src/game/core/mouseLook'
const event=(x:number,y:number,t:number,type='mousemove'):MouseMotion=>({movementX:x,movementY:y,timeStamp:t,type})
const input=new MouseLookInput()
assert.equal(input.read(event(2000,500,0),false),null,'inactive input cannot steer camera')
assert.equal(input.read(event(120,99,1),true),null,'mousemove first event is dropped')
assert.deepEqual(input.read(event(10,-5,2),true),{x:10,y:-5},'normal mousemove retains exact delta')
const ignored=event(600,-480,3,'pointermove');assert.equal(input.read(ignored,true),null);assert.deepEqual(input.read(event(120,99,4),true),{x:120,y:99})
assert.equal(input.read(event(-600,480,5,'pointermove'),true),null)
assert.deepEqual(input.read(event(-120,99,6),true),{x:-120,y:99})
assert.deepEqual(input.read(event(1800,0,7),true),{x:1800,y:0})
assert.deepEqual(input.read(event(-3000,0,8),true),{x:-3000,y:0})
assert.equal(input.read(event(0,0,9),true),null)
const coalescedThrow=Object.assign(event(1,1,10),{getCoalescedEvents:()=>{throw new Error('must not call')}})
assert.deepEqual(input.read(coalescedThrow,true),{x:1,y:1})
assert.equal(input.read(event(1,1,11,'keydown'),true),null)
input.reset();assert.equal(input.read(event(0,0,20),true),null)
input.reset(100);assert.equal(input.read(event(10,0,99),true),null);assert.deepEqual(input.read(event(4,1,100),true),null);assert.deepEqual(input.read(event(4,1,101),true),{x:4,y:1})
assert.equal(input.read(event(NaN,Infinity,102),true),null)
// Regression: filtering 600 out of [600,-480] turns the browser's +120
// displacement into -480. The child list must never replace the locked total.
for(const sign of [1,-1]) {
 const motion=Object.assign(event(sign*120,0,103),{
  getCoalescedEvents:()=>[event(sign*600,0,102),event(sign*-480,0,103)],
 })
 assert.deepEqual(input.read(motion,true),{x:sign*120,y:0},'recenter batch keeps signed net motion')
}
assert.equal(input.read(Object.assign(event(0,0,104),{getCoalescedEvents:()=>[event(600,0,104),event(-600,0,104)]}),true),null,'zero-net recenter cannot steer')
input.reset(200)
assert.equal(input.read(event(300,0,201,'pointermove'),true),null)
assert.equal(input.read(event(1,0,202,'keydown'),true),null)
assert.equal(input.read(event(900,0,203),true),null,'other event types cannot prime capture')
assert.deepEqual(input.read(event(3000,0,204),true),{x:3000,y:0})
assert.deepEqual(input.read(event(-3000,0,205),true),{x:-3000,y:0},'fast turn and reversal cancel without queued motion')
assert.equal(input.read(event(1,1,NaN),true),null)
const capture=async()=>{
 let successCalls=0
 await requestMouseCapture({requestPointerLock:function(options){assert.deepEqual(options,{unadjustedMovement:true});successCalls++}})
 assert.equal(successCalls,1,'successful capture calls once')
 let voidCalls=0
 await requestMouseCapture({requestPointerLock:function(options){assert.deepEqual(options,{unadjustedMovement:true});voidCalls++;return undefined}})
 assert.equal(voidCalls,1,'legacy void capture calls once')
 let syncCalls=0
 const syncError=new Error('sync denied')
 await assert.rejects(()=>requestMouseCapture({requestPointerLock:function(options){assert.deepEqual(options,{unadjustedMovement:true});syncCalls++;throw syncError}}),syncError)
 assert.equal(syncCalls,1,'synchronous failure never retries')
 let asyncCalls=0
 const asyncError=new Error('async denied')
 await assert.rejects(()=>requestMouseCapture({requestPointerLock:async function(options){assert.deepEqual(options,{unadjustedMovement:true});asyncCalls++;throw asyncError}}),asyncError)
 assert.equal(asyncCalls,1,'asynchronous failure never retries')
 let unsupportedCalls=0
 const unsupported=Object.assign(new Error('unsupported'),{name:'NotSupportedError'})
 await assert.rejects(()=>requestMouseCapture({requestPointerLock:function(options){assert.deepEqual(options,{unadjustedMovement:true});unsupportedCalls++;throw unsupported}}),unsupported)
 assert.equal(unsupportedCalls,1,'NotSupportedError does not trigger compatibility retry')
};await capture()
console.log('PASS: mouse look regression checks')
