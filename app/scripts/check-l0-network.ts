import assert from 'node:assert/strict'
const sessionData=new Map<string,string>()
Object.assign(globalThis,{window:{addEventListener(){},removeEventListener(){},matchMedia:()=>({matches:false})},document:{createElement:()=>({getContext:()=>null,style:{}}),getElementById:()=>null,addEventListener(){},removeEventListener(){},body:{appendChild(){}}},sessionStorage:{getItem:(k:string)=>sessionData.get(k)??null,setItem:(k:string,v:string)=>sessionData.set(k,v)},localStorage:undefined})
await import('../src/game/world/mapgen')
const {Engine}=await import('../src/game/engine'),{MpSession}=await import('../src/game/net/session'),{applyMpEvent}=await import('../src/game/net/apply'),{enterL0Red}=await import('../src/game/engine/l0State')
function peer(id:string){return{selfId:id,other:null as any,handler:null as any,close:null as any,onMessage(fn:any){this.handler=fn},onOpen(){},onClose(fn:any){this.close=fn},send(_id:string,msg:any){queueMicrotask(()=>this.other.handler?.(id,structuredClone(msg)))},broadcast(msg:any){queueMicrotask(()=>this.other.handler?.(id,structuredClone(msg)))},connIds(){return[this.other.selfId]},destroy(){this.other.close?.(id)}}}
const hp=peer('HOST'),cp=peer('guest');hp.other=cp;cp.other=hp
const host=await MpSession.host({name:'Host',avatar:{}},hp as never),guest=await MpSession.join('L0TEST',{name:'Guest',avatar:{}},cp as never)
const pause=()=>new Promise(r=>setTimeout(r,125)),h=new Engine(),g=new Engine();let rejoined:InstanceType<typeof MpSession>|undefined
try{
 await pause();host.setReady(true);guest.setReady(true);await pause();assert(host.startGame(763));await pause()
 for(const [eng,session]of [[h,host],[g,guest]]as const){eng.mpSession=session;eng.seed=763;eng.loadLevel(0,{mapSeed:763,firstVisit:false});session.onLocalEvent=e=>applyMpEvent(eng,e);session.tick(eng,0)}await pause()
 g.map!.items.push({id:.01,type:'almond',x:g.player.x,y:g.player.y});guest.sendEvent({t:'dropItem',id:.01,it:'almond',x:g.player.x+g.map!.inf!.ox,y:g.player.y+g.map!.inf!.oy});await pause();assert(h.map!.items.some(i=>i.id===.01),'guest drop arrives at host')
 guest.sendEvent({t:'takeItem',id:.01});await pause();assert(!h.map!.items.some(i=>i.id===.01),'shared pickup removed');assert(h.map!.inf!.taken.has(.01))
 host.sendEvent({t:'l0world',seed:763,revisions:{'12,12':2},taken:[.01],chunks:[]});await pause();assert.equal(g.map!.inf!.l0!.revisions['12,12'],2,'host revisions synchronized')
 guest.sendEvent({t:'l0world',seed:763,revisions:{'12,12':99},taken:[],chunks:[]});await pause();assert.notEqual(h.map!.inf!.l0!.revisions['12,12'],99,'client cannot publish authoritative revision')
 enterL0Red(g);await pause();guest.sendEvent({t:'dropItem',id:.02,it:'canned',x:5,y:27});await pause();assert(!h.map!.items.some(i=>i.id===.02),'private red drop cannot contaminate shared world')
 host.sendEvent({t:'dropItem',id:.03,it:'canned',x:5,y:27});await pause();assert(!g.map!.items.some(i=>i.id===.03),'shared event cannot contaminate red world')
 g.l0Loops=4;guest.leave();await pause();const cp2=peer('reconnected');hp.other=cp2;cp2.other=hp
 rejoined=await MpSession.join('L0TEST',{name:'Guest',avatar:{}},cp2 as never);const resumed=new Engine();resumed.mpSession=rejoined;rejoined.onStart=seed=>resumed.newRun(seed,'normal','slot1');await pause()
 assert(rejoined.started,'original token accepted after disconnect');assert(resumed.map!.inf!.l0!.trapped,'reconnect restores personal red trap');assert.equal(resumed.l0Loops,4,'reconnect restores loop position');assert.equal(host.players.length,2,'reconnect replaces departed member')
 rejoined.tick(resumed,0);rejoined.onLocalEvent=e=>applyMpEvent(resumed,e);await pause()
 console.log('L0 network checks passed: two sessions, host authority, shared drop/pickup, red isolation, disconnect/resume, persistent personal state.')
}finally{rejoined?.leave();guest.leave();host.leave()}
