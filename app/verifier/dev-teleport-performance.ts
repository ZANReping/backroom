import { canOccupy, PLAYER_RADIUS } from '../src/game/core/player'
import { floorHeight } from '../src/game/world/mapgen'

const check=(ok:unknown,message:string)=>{if(!ok)throw Error(message)}
const delay=(ms:number)=>new Promise<void>(resolve=>setTimeout(resolve,ms))
const summary=(values:number[])=>{const s=[...values].sort((a,b)=>a-b);return {count:s.length,max:s.at(-1)??0,p95:s[Math.floor(s.length*.95)]??0,over50:s.filter(n=>n>50).length,over100:s.filter(n=>n>100).length}}

export function attachTeleportPerformance(qa:any){
  const eng=qa.eng,r=qa.r
  eng.devEnabled=true
  const position=()=>({x:eng.player.x+(eng.map.inf?.ox??0),y:eng.player.y+(eng.map.inf?.oy??0),z:eng.player.z,floor:eng.player.floor})
  const near=()=>r.isNearWorldReady(eng)
  qa.teleportPerf={async runCase(id:string){
    if(id==='generic'){
      check(eng.player.level===0,'Generic regression starts in the actual L0 game')
      const progress:string[]=[],before=position(),result=await eng.devOperateExit('flickerdoor','teleport',undefined,undefined,(s:string)=>progress.push(s))
      check(result.ok&&canOccupy(eng.map,eng.player.x,eng.player.y,PLAYER_RADIUS,{z:eng.player.z,band:eng.player.floor}),result.message)
      await qa.warm()
      check(canOccupy(eng.map,eng.player.x,eng.player.y,PLAYER_RADIUS,{z:eng.player.z,band:eng.player.floor}),'L0 unsafe after rendering')
      return {id,before,after:position(),result,progress,safe:true}
    }
    if(id==='cancel'){
      const before=position(),map=eng.map,controller=new AbortController()
      const start=performance.now(),progress:string[]=[]
      const job=eng.devOperateExit('l11officedoor','teleport',controller.signal,undefined,(message:string)=>{progress.push(message);if(message.includes(' / '))controller.abort()})
      const result=await job
      check(!result.ok&&eng.map===map&&JSON.stringify(before)===JSON.stringify(position()),'Cancellation changed player/map')
      check(progress.some(p=>p.includes(' / ')),'Did not cancel during destination generation')
      return {id,result,ms:performance.now()-start,unchanged:true,progress}
    }
    const kind=id==='return'||id==='far'?'basebeta':'l11officedoor'
    if(id==='far'){qa.moveTo(12304,-8160);eng.player.z=floorHeight(eng.map,eng.player.x,eng.player.y,0)+.02;eng.player.floor=0;await qa.warm()}
    const before=position(),start=performance.now(),frames:number[]=[],stalls:number[]=[],updates:number[]=[],clones:number[]=[],progress:{at:number;message:string}[]=[],phases:Record<string,number[]>={}
    const restore:(()=>void)[]=[]
    for(const [owner,key]of [[r,'updateL11Distant'],[r,'syncInfinite'],[r,'flushRetiredTextures'],[r,'drainRetiredWorld'],[r.three,'initTexture'],[r.three,'compile']]){
      const original=owner[key];owner[key]=function(...args:any[]){const t=performance.now();try{return original.apply(this,args)}finally{(phases[key]??=[]).push(performance.now()-t)}};restore.push(()=>owner[key]=original)
    }
    let active=true,last=performance.now(),lastTick=last,firstReady=0
    const loop=(now:number)=>{if(!active)return;frames.push(now-last);last=now;requestAnimationFrame(loop)}
    requestAnimationFrame(loop)
    const timer=setInterval(()=>{const now=performance.now();stalls.push(Math.max(0,now-lastTick-16));lastTick=now},16)
    const update=eng.updateInfiniteWindow,clone=globalThis.structuredClone
    eng.updateInfiniteWindow=function(...args:any[]){const t=performance.now();try{return update.apply(this,args)}finally{updates.push(performance.now()-t)}}
    globalThis.structuredClone=function<T>(value:T,options?:StructuredSerializeOptions){const t=performance.now();try{return clone(value,options)}finally{clones.push(performance.now()-t)}}
    try{
      const result=await eng.devOperateExit(kind,'teleport',undefined,undefined,(message:string)=>progress.push({at:performance.now()-start,message})),actionMs=performance.now()-start
      check(result.ok,result.message)
      check(canOccupy(eng.map,eng.player.x,eng.player.y,PLAYER_RADIUS,{z:eng.player.z,band:eng.player.floor}),'Unsafe arrival')
      while(!near()){check(performance.now()-start<120000,'Near scene timeout');await delay(16)}
      firstReady=performance.now()-start
      const after=position(),settled=await qa.warm()
      // Inspect the same actual collision state after all models have arrived.
      check(canOccupy(eng.map,eng.player.x,eng.player.y,PLAYER_RADIUS,{z:eng.player.z,band:eng.player.floor}),'Unsafe settled arrival')
      const inf=eng.map.inf,visible=[...r.chunkGroups.keys()]
      check(visible.every(k=>inf.chunks.has(k)),'Old chunks retained in the scene')
      return {id,kind,result,before,after,distance:Math.hypot(after.x-before.x,after.y-before.y),actionMs,nearReadyMs:firstReady,settledMs:performance.now()-start,updates,clones,frames:summary(frames),eventLoop:summary(stalls),settled,stats:qa.stats(),chunks:inf.chunks.size,renderChunks:visible.length,progress,phases:Object.fromEntries(Object.entries(phases).map(([key,v])=>[key,summary(v)]))}
    }finally{active=false;clearInterval(timer);eng.updateInfiniteWindow=update;globalThis.structuredClone=clone;restore.forEach(f=>f())}
  }}
}
