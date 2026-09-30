import assert from 'node:assert/strict'
import { freshCareer, route } from '../src/game/engine/career'
Object.assign(globalThis,{window:{addEventListener(){},removeEventListener(){},matchMedia:()=>({matches:false})},document:{createElement:()=>({getContext:()=>null,style:{}}),getElementById:()=>null,addEventListener(){},removeEventListener(){},body:{appendChild(){}}},localStorage:undefined})
await import('../src/game/engine')
const {MpSession}=await import('../src/game/net/session')
function peer(id:string){return {selfId:id,other:null as any,handler:null as any,onMessage(fn:any){this.handler=fn},onOpen(){},onClose(){},send(_id:string,msg:any){queueMicrotask(()=>this.other.handler(id,msg))},broadcast(msg:any){queueMicrotask(()=>this.other.handler(id,msg))},connIds(){return [this.other.selfId]},destroy(){}}}
const hp=peer('HOST'),cp=peer('guest');hp.other=cp;cp.other=hp
const host=await MpSession.host({name:'Host',avatar:{}},hp as never),guest=await MpSession.join('TEST',{name:'Guest',avatar:{}},cp as never)
const pause=()=>new Promise(r=>setTimeout(r,110))
const fake=(x:number)=>({career:freshCareer(),rep:{brc:60},player:{x,y:5,z:0,facing:0,level:1,hotbar:[],selected:0,crouching:false},map:{inf:undefined,entities:[],structures:[{kind:'settlementstation',x:5,y:5,data:{faction:'brc',services:['stabilize']}}]},input:{mx:0,my:0,sprint:false},over:false,inLiquid:0,attackAnimT:0,los:()=>true})
try{
 await pause();host.setReady(true);guest.setReady(true);await pause();assert(host.startGame(424242));await pause()
 const h=fake(5),g=fake(5);route(h as never,'brc').rank=3;route(g as never,'brc').rank=3;host.tick(h as never,0);guest.tick(g as never,0);await pause()
 assert(guest.requestStabilizer());await pause();assert.equal(host.stabilizers.length,1);assert.equal(guest.stabilizers.length,1);assert.equal(host.stabilizers[0].owner,'guest')
 const expires=host.stabilizers[0].expires;guest.sendEvent({t:'stabilizerRequest',eventId:'guest:1'});await pause();assert.equal(host.stabilizers[0].expires,expires,'replay cannot renew a device')
 guest.sendEvent({t:'stabilizers',at:Date.now(),devices:[]});await pause();assert.equal(host.stabilizers.length,1,'client cannot overwrite authoritative devices')
 assert(guest.requestStabilizer());await pause();assert.equal(host.stabilizers.length,1,'one device per owner')
 assert(host.requestStabilizer());await pause();assert.equal(host.stabilizers.length,2)
 g.player.x=50;await pause();guest.requestStabilizer();await pause();assert.equal(host.stabilizers.find(d=>d.owner==='guest')!.x,5,'remote deployment rejected')
 assert.equal(g.career.settled.length,0,'world events do not grant private rewards')
 console.log('Career network checks passed: host authority, sender identity, replay, one device per player, physical worksite, private rewards.')
}finally{host.leave();guest.leave()}
