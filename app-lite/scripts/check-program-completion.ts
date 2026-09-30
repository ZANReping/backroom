import assert from 'node:assert/strict'
import * as THREE from 'three'
import { waitForSubmittedPrograms } from '../src/game/renderer/programCompletion'
import { afterRendererCompile, afterSceneCompile, compileSceneJob } from '../src/game/renderer/sceneWarmup'

let checks=0
const check=(ok:unknown,label:string)=>{assert.ok(ok,label);checks++}
const flush=async()=>{for(let n=0;n<24;n++)await Promise.resolve()}
type Entry={program:object|undefined}
const fake=(entries:Entry[]=[])=>{
  const state={lost:false,extension:true,ready:new Set<object>(),queries:[] as object[]}
  const gl={
    isContextLost:()=>state.lost,
    getExtension:()=>state.extension?{COMPLETION_STATUS_KHR:0x91b1}:null,
    getProgramParameter:(program:object,name:number)=>{
      check(!!program&&!state.lost&&name===0x91b1,'only valid non-blocking program queries are issued')
      state.queries.push(program);return state.ready.has(program)
    },
  }
  const renderer={info:{programs:entries},getContext:()=>gl,compileAsync:()=>Promise.resolve()} as unknown as THREE.WebGLRenderer
  return {renderer,state,entries}
}
const timers:(()=>void)[]=[]
const timeout=globalThis.setTimeout
globalThis.setTimeout=((callback:()=>void,delay:number)=>{check(delay===10,'polling uses a bounded timer interval');timers.push(callback);return 1}) as typeof setTimeout
const tick=async()=>{const due=timers.splice(0);for(const callback of due)callback();await flush()}
try {
  const a={},b={},later={},r=fake([{program:a},{program:b}]);r.state.ready.add(a)
  let done=false;const wait=waitForSubmittedPrograms(r.renderer).then(()=>done=true)
  await flush();check(!done&&timers.length===1,'one ready and one pending variant keep preparation pending')
  r.entries.push({program:later});await tick()
  check(!r.state.queries.includes(later),'later programs are outside the earlier snapshot')
  r.state.ready.add(b);await tick();await wait;check(done,'the original snapshot completes without waiting for a later submission')
  r.entries.pop();const queryCount=r.state.queries.length
  await waitForSubmittedPrograms(r.renderer);check(r.state.queries.length===queryCount,'completed variants never repeat GL completion queries')

  const shared={},s=fake([{program:shared}])
  const first=waitForSubmittedPrograms(s.renderer),second=waitForSubmittedPrograms(s.renderer)
  check(timers.length===1&&s.state.queries.length===1,'overlapping callers share one poller per actual program')
  s.state.ready.add(shared);await tick();await Promise.all([first,second])
  check(timers.length===0,'a completed shared poller leaves no timer')

  const noExtension=fake([{program:{}}]);noExtension.state.extension=false
  await waitForSubmittedPrograms(noExtension.renderer)
  check(noExtension.state.queries.length===0&&timers.length===0,'unsupported extension preserves the existing fallback')
  const empty=fake();await waitForSubmittedPrograms(empty.renderer)
  check(empty.state.queries.length===0&&timers.length===0,'empty program lists complete immediately')
  const missing=fake([{program:undefined}]);await waitForSubmittedPrograms(missing.renderer)
  check(missing.state.queries.length===0,'already deleted programs are never queried')
  const lost=fake([{program:{}}]);lost.state.lost=true;await waitForSubmittedPrograms(lost.renderer)
  check(lost.state.queries.length===0,'a lost context is never queried')

  for(const cause of ['deleted','context-lost']){
    const entry:Entry={program:{}},pending=fake([entry]);let finished=false
    const promise=waitForSubmittedPrograms(pending.renderer).then(()=>finished=true)
    await flush();check(!finished,'retirement fixture begins pending')
    const before=pending.state.queries.length
    if(cause==='deleted')entry.program=undefined;else pending.state.lost=true
    await tick();await promise
    check(finished&&pending.state.queries.length===before,`${cause} ends polling without touching an invalid handle`)
  }
  const handle={},entry={program:handle},one=fake([entry]),two=fake([entry]);let firstDone=false,secondDone=false
  const oneWait=waitForSubmittedPrograms(one.renderer).then(()=>firstDone=true),twoWait=waitForSubmittedPrograms(two.renderer).then(()=>secondDone=true)
  check(timers.length===2,'renderer completion registries are independent')
  one.state.ready.add(handle);await tick()
  check(firstDone&&!secondDone&&timers.length===1,'one renderer cannot complete another renderer')
  two.state.ready.add(handle);await tick();await Promise.all([oneWait,twoWait])

  for(const reject of [false,true]){
    const root=new THREE.Group(),scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera()
    const geometry=new THREE.BoxGeometry(),material=new THREE.MeshLambertMaterial()
    root.add(new THREE.Mesh(geometry,material))
    const current={},nonCurrent={},pending=fake();let submitted=0,disposed=0,rendererDisposed=0
    material.addEventListener('dispose',()=>disposed++)
    pending.renderer.compileAsync=()=>{
      submitted++;pending.entries.push({program:current},{program:nonCurrent});pending.state.ready.add(current)
      return reject?Promise.reject(new Error('original compiler failed')):Promise.resolve(root)
    }
    const job=compileSceneJob(pending.renderer,root,camera,scene)
    job.next();job.next();await flush()
    check(submitted===1&&!job.next().done,'a settled compiler promise cannot hide an unfinished non-current variant')
    job.return();afterSceneCompile(root,()=>{geometry.dispose();material.dispose()});afterRendererCompile(pending.renderer,()=>rendererDisposed++)
    await flush();check(disposed===0&&rendererDisposed===0,'cancel retains resources until every submitted variant finishes')
    pending.state.ready.add(nonCurrent);await tick()
    check(disposed===1&&rendererDisposed===1,'cancel releases root and renderer resources exactly once')
    await tick();check(disposed===1&&rendererDisposed===1&&root.parent===null,'completion cannot repeat disposal or publish a cancelled root')
  }
  check(timers.length===0,'all regression fixtures release their pollers')
} finally {globalThis.setTimeout=timeout}
console.log(JSON.stringify({passed:checks}))
