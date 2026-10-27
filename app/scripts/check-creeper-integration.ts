/* Focused creeper integration/resource regression checks. */
import * as THREE from 'three'
import { createCanvas } from '@napi-rs/canvas'

const memory = new Map<string, string>()
Object.assign(globalThis, {
  window: { addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false }) },
  document: { createElement: (tag: string) => tag === 'canvas' ? createCanvas(64, 64) : ({ style: {}, getContext: () => null }), getElementById: () => null, addEventListener() {}, removeEventListener() {}, body: { appendChild() {} } },
  localStorage: { getItem: (k: string) => memory.get(k) ?? null, setItem: (k: string, v: string) => memory.set(k, v), removeItem: (k: string) => memory.delete(k) },
})

const R = await import('../src/game/renderer/creeperRender')
const M = await import('../src/game/renderer/creeperMesh')
const { disposeL8Tree } = await import('../src/game/renderer/l8ModelResources')
const { disposeCharacterModel } = await import('../src/game/renderer/retroResources')
const { buildEntityArchiveModel } = await import('../src/game/renderer/entityArchiveModel')
const { buildRetroHand } = await import('../src/game/renderer/retroViewHand')
const C = await import('../src/game/engine/creeperAI')

let checks = 0, failures = 0
const ok = (v: unknown, msg: string) => { checks++; if (!v) { failures++; console.error(`FAIL ${msg}`) } }
const finiteTree = (root: THREE.Object3D) => {
  let good = true, meshes = 0
  root.updateMatrixWorld(true)
  root.traverse((o) => {
    if (o.matrixWorld.elements.some((n) => !Number.isFinite(n))) good = false
    const m = o as THREE.Mesh
    if (!m.isMesh) return
    meshes++
    if (!m.geometry.attributes.position || Object.values(m.geometry.attributes).some(a => Array.from(a.array as ArrayLike<number>).some(n => !Number.isFinite(n)))) good = false
    for (const mat of (Array.isArray(m.material) ? m.material : [m.material])) if (mat && mat.userData && Object.values(mat.userData).some((x: any) => typeof x === 'number' && !Number.isFinite(x))) good = false
  })
  return good && meshes > 0
}
const resources = (root: THREE.Object3D) => {
  const geos = new Set<THREE.BufferGeometry>(), mats = new Set<THREE.Material>()
  root.traverse(o => { const m = o as THREE.Mesh; if (m.geometry) geos.add(m.geometry); if (m.material) for (const x of Array.isArray(m.material) ? m.material : [m.material]) mats.add(x) })
  return { geos, mats }
}

// Cooperative jobs: all hosts, their highest meaningful stages, and cancellation.
for (const host of ['rat', 'arachnid', 'human'] as const) {
  const stage = host === 'human' ? 5 : 4
  const job = R.buildCreeperEntityJob({ host, stage, seed: 17, morph: 'common', variant: 'wolf' })
  let n = job.next(), steps = 1
  while (!n.done && steps < 20000) { n = job.next(); steps++ }
  ok(n.done && steps > 2, `${host} stage ${stage} job completes cooperatively`)
  if (n.done) { ok(finiteTree(n.value), `${host} geometry/position/UV values finite`); disposeL8Tree(n.value) }
  const cancelled = R.buildCreeperEntityJob({ host, stage, seed: 23, morph: 'common', variant: 'wolf' })
  const add=THREE.Object3D.prototype.add;let partial:THREE.Object3D|undefined
  THREE.Object3D.prototype.add=function(...objects:THREE.Object3D[]){const result=add.apply(this,objects);if(this.name==='creeper-entity')partial=this;return result}
  try {
    for(let i=0;i<20000&&!partial;i++){const step=cancelled.next();if(step.done)break}
    ok(!!partial, `${host} cancelled job has an allocated root`)
    const own=resources(partial!),counts=new Map<object,number>()
    for(const x of [...own.geos,...own.mats]){counts.set(x,0);x.addEventListener('dispose',()=>counts.set(x,counts.get(x)!+1))}
    cancelled.return(undefined as never)
    ok([...counts].filter(([x])=>!(x as THREE.BufferGeometry).userData.entityShared).every(([,n])=>n===1), `${host} cancelled job releases owned resources once`)
    ok([...counts].filter(([x])=>(x as THREE.BufferGeometry).userData.entityShared).every(([,n])=>n===0), `${host} cancelled job retains shared resources`)
  } finally {THREE.Object3D.prototype.add=add}
}

// Shared pools must survive either release helper, while owned resources release once.
for (const [label, release] of [['l8', disposeL8Tree], ['retro', disposeCharacterModel] ] as const) {
  const a = R.buildCreeperEntityMesh({ host: 'rat', stage: 4, seed: 31, morph: 'common', variant: 'wolf' })
  const b = R.buildCreeperEntityMesh({ host: 'rat', stage: 4, seed: 31, morph: 'common', variant: 'wolf' })
  const ar = resources(a), sharedG = [...ar.geos].filter(x => x.userData.entityShared), sharedM = [...ar.mats].filter(x => x.userData.entityShared)
  const counts = new Map<object, number>()
  for (const x of [...ar.geos, ...ar.mats]) { const old = x.dispose.bind(x); counts.set(x, 0); x.dispose = () => { counts.set(x, counts.get(x)! + 1); old() } }
  release(a)
  ok([...ar.geos,...ar.mats].filter(x=>!x.userData.entityShared).every(x=>counts.get(x)===1), `${label} all owned geometry/materials released exactly once`)
  ok(sharedG.every(x => counts.get(x) === 0) && sharedM.every(x => counts.get(x) === 0), `${label} release preserves entityShared geometry/material`)
  ok(finiteTree(b), `${label} release leaves second creeper renderable`)
  const brs = resources(b); for (const x of brs.geos) if (!x.userData.entityShared) ok(counts.get(x) === undefined || counts.get(x) === 0, `${label} B-owned geometry not released with A`)
  R.animateCreeperEntity(b, { cr: { host: 'rat', stage: 4, clip: 'walk', clipT: 0, speed: .2, seed: 1 }, def: { scale: 1 }, facing: 0, dead: false } as any, .016, 0, 5)
  R.applyCreepLod(b, 2); ok(finiteTree(b), `${label} second creeper animates and changes LOD`)
  release(b)
}

// Archive lighting must not mutate the shared scene material shader hooks.
const sceneModel = R.buildCreeperEntityMesh({ host: 'rat', stage: 3, seed: 41, morph: 'common', variant: 'wolf' })
const sharedHooks = new Map<THREE.Material, [Function | undefined, Function | undefined]>()
sceneModel.traverse(o => { const m = o as THREE.Mesh; for (const mat of (Array.isArray(m.material) ? m.material : [m.material])) if (mat?.userData?.entityShared) sharedHooks.set(mat, [mat.onBeforeCompile, mat.customProgramCacheKey]) })
const archive = buildEntityArchiveModel('creeper')
ok(archive && finiteTree(archive), 'creeper archive model builds')
for (const [mat, hooks] of sharedHooks) ok(mat.onBeforeCompile === hooks[0] && mat.customProgramCacheKey === hooks[1], 'archive leaves shared material shader hooks unchanged')
if (archive) disposeL8Tree(archive); disposeL8Tree(sceneModel)

// Nail cache follows source-hand geometry disposal; overlay disposal does not own the hand mesh.
const hand = buildRetroHand()
const overlay = M.creepHandOverlay(hand, 4, 7)
overlay.setStage(0); overlay.setStage(2); overlay.setStage(3); overlay.setStage(4)
ok(finiteTree(overlay.group), 'hand overlay remains valid through stages 0/2/3/4')
const handGeo = hand.skin.geometry
let nailGeometry: THREE.BufferGeometry | undefined
overlay.group.traverse(o => { if (o.name === 'creep-nails') nailGeometry = (o as THREE.Mesh).geometry })
let nailDisposed = 0
if (nailGeometry) { const oldNailDispose = nailGeometry.dispose.bind(nailGeometry); nailGeometry.dispose = () => { nailDisposed++; oldNailDispose() } }
overlay.dispose(); ok(nailDisposed === 0, 'overlay.dispose does not dispose cached nail geometry')
handGeo.dispatchEvent({ type: 'dispose' } as any); ok(!nailGeometry || nailDisposed === 1, 'nail cache source geometry disposal releases nails')
hand.dispose();ok(!nailGeometry||nailDisposed===1,'repeated base-geometry disposal does not release nails twice')

// Save compatibility preserves burnedDecor and tolerates missing field in old saves.
const eng: any = { creepRun: C.freshCreepRun() }; eng.creepRun.burnedDecor.add('2:3'); const saved = C.captureCreep(eng)
ok(saved.burnedDecor?.includes('2:3') === true, 'captureCreep preserves burnedDecor')
ok(C.restoreCreep({ ...saved, burnedDecor: undefined }).burnedDecor.size === 0, 'restoreCreep accepts old save without burnedDecor')
ok(C.restoreCreep(saved).burnedDecor.has('2:3'), 'restoreCreep restores burnedDecor')

// A fresh run clears infection; changing levels retains the disease and burned marks.
const {resetEffects}=await import('../src/game/engine/effects')
const {Engine}=await import('../src/game/engine')
const engine=new Engine();engine.creepRun.infected=true;engine.creepRun.courseT=245;engine.creepRun.burnedDecor.add('2:3')
resetEffects(engine,'loadLevel');ok(engine.creepRun.infected&&engine.creepRun.courseT===245,'level transition preserves disease course')
resetEffects(engine,'newRun');ok(!engine.creepRun.infected&&!engine.creepRun.load&&!engine.creepRun.burnedDecor.size,'fresh run clears all creeper runtime state')
// An actual attack phase cannot hit through a blocking wall, even when its target is within reach.
for(const host of ['rat','human'] as const){
 const q=C.spawnCreeper(host,host==='human'?5:4,0,0,0,2,13);q.cr!.mode='attack';q.cr!.clipT=host==='human'?.89:C.creepHostAttackTiming(4).hit-.01;q.cr!.lungeD=.6
 let hits=0;const blocked={player:{x:.5,y:0,z:0},levelDef:{id:2},map:{entities:[q]},creepRun:C.freshCreepRun(),dev:{},over:false,los:()=>false,meleeZOk:()=>true,hurtPlayer:()=>{hits++},stepEntity:()=>{},wanderTarget:()=>{},msg:()=>{}} as any
 C.updateCreeper(blocked,q,.02,.5,1);ok(hits===0,host+' attack respects solid-wall occlusion')
}
const {buildItemMesh}=await import('../src/game/renderer/itemsMesh')
const meat=buildItemMesh('creepmeat',{halo:false});ok(!meat.userData.fallback&&!!meat.getObjectByName('creeper-meat'),'infected meat has a dedicated live item model');ok(finiteTree(meat),'infected meat UV and vertex numbers finite');disposeL8Tree(meat)

// The real chunk scanner must never hang a zombie spider against tile-0 empty space.
const scanFixture=(seed:number,wall:number)=>{const tiles=new Uint8Array(1024);tiles[15*32+15]=1;tiles[15*32+14]=wall;tiles[14*32+15]=wall;const e={map:{w:32,h:32,inf:{seed,ox:0,oy:0,chunks:new Map([['0,0',{cx:0,cy:0,tiles}]])}},creepRun:C.freshCreepRun(),levelDef:{id:2},player:{x:15.5,y:15.5,z:0},dev:{god:true},over:false,specialHeld:false} as any;C.stepCreepWorld(e,.01);return [...e.creepRun.decor.values()].flat()}
let supportSeed=-1;for(let seed=0;seed<500&&supportSeed<0;seed++)if(scanFixture(seed,2).length)supportSeed=seed
ok(supportSeed>=0,'scanner finds a genuinely supported wall corner');ok(scanFixture(supportSeed,0).length===0,'empty space is not accepted as zombie-spider wall support')
const hearing=new Engine(),listener=C.spawnCreeper('human',5,5,0,0,2,13);hearing.map={entities:[listener]} as any
hearing.noiseEvent(0,0,12,true);ok(listener.cr!.alertT>0&&listener.cr!.mode==='chase','actual noiseEvent dispatch alerts creeper human');ok(listener.targetX===0&&listener.targetY===0,'auditory pursuit keeps the heard world position')
console.log(JSON.stringify({ checks, failures }))
if (failures) process.exitCode = 1
