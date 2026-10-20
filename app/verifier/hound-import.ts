import { makeEntity } from '../src/game/entities'
import { initHound } from '../src/game/engine/houndAI'

/** Production renderer, isolated QA storage, no replacement materials or geometry. */
export async function verifyHoundImport(qa: any, level = 2) {
  const { eng, r, look } = qa, results: string[] = []
  const check = (v: unknown, message: string) => { if (!v) throw Error(message); results.push(message) }
  const settle = () => new Promise(resolve => setTimeout(resolve, 1200))
  await qa.scene(level); await qa.warm(); qa.hide()
  eng.player.flashlight = true; eng.player.hotbar.fill(null)
  eng.map.entities = []; await settle()
  const p = eng.player
  let point: [number, number] | undefined
  for (let d = 3.5; d >= 2 && !point; d -= .5) for (let i = 0; i < 16; i++) {
    const a = i * Math.PI / 8, x = p.x + Math.cos(a) * d, y = p.y + Math.sin(a) * d
    if (eng.entityWalkH(eng.map, Math.floor(x), Math.floor(y), p.z) !== null && eng.los(p.x, p.y, x, y)) { point = [x, y]; break }
  }
  if (!point) throw Error('No clear placement in Level ' + level)
  const [x, y] = point
  look.yaw = Math.atan2(-(x - p.x), -(y - p.y)); look.pitch = -.25; r.setFov(64)
  qa.freezeRenderTime(1.7)
  const spawn = (phase = 'stalk', neutral = level === 11) => {
    const e = makeEntity('hound', x, y, p.z)
    initHound(eng, e, neutral)
    e.facing = Math.atan2(p.y - y, p.x - x) + .35
    Object.assign(e.hd!, { phase, crouch: phase === 'cower' ? 1 : phase === 'stalk' ? .45 : 0,
      howlPose: phase === 'howl' ? 1 : 0, sit: phase === 'sit' ? 1 : 0,
      jaw: phase === 'howl' ? 1 : phase === 'charge' ? .6 : .1, wag: neutral ? 1 : 0 })
    e.state = phase === 'cower' ? 'stunned' : phase === 'sit' ? 'idle' : 'chase'
    e.animT = .2
    return e
  }
  async function show(phase: string) {
    const e = spawn(phase); eng.map.entities = [e]; await settle()
    const g = r.entityMeshes.get(e.id)
    check(g?.userData.houndNeutral === (level === 11), `${phase}: production skin selected`)
    check(g.visible && g.userData.houndRig, `${phase}: animated rig visible`)
    g.updateMatrixWorld(true)
    let meshes = 0, triangles = 0
    g.traverse((o: any) => { check(o.matrixWorld.elements.every(Number.isFinite), `${phase}: finite ${o.type} transform`); if (o.isMesh) { meshes++; triangles += (o.geometry.index?.count ?? o.geometry.attributes.position.count)/3 } })
    return { meshes, triangles }
  }
  for (const phase of ['stalk', 'howl', 'charge', 'cower', 'sit']) await show(phase)
  const lazy = makeEntity('hound', x, y, p.z); eng.map.entities = [lazy]; await settle()
  check(r.entityMeshes.get(lazy.id).userData.houndNeutral === (level === 11), 'frozen AI uses level skin before initialization')
  initHound(eng, lazy, true); await settle()
  const old = r.entityMeshes.get(lazy.id)
  lazy.hp -= 1; eng.killCheck(lazy); await settle()
  check(!lazy.hd!.neutral && lazy.provoked, 'combat hit provokes neutral hound immediately')
  check(r.entityMeshes.get(lazy.id) !== old && !r.entityMeshes.get(lazy.id).userData.houndNeutral, 'hostility rebuilds the skin')
  const resources = []
  for (let i = 0; i < 3; i++) {
    eng.map.entities = [spawn('howl', false), spawn('sit', true)]; await settle()
    check(r.entityMeshes.size === 2, `cycle ${i}: two cached models`)
    eng.map.entities = []; await qa.warm()
    check(r.entityMeshes.size === 0, `cycle ${i}: cache released`)
    resources.push({ ...r.three.info.memory, programs: r.three.info.programs.length })
  }
  check(resources.every(a => JSON.stringify(a) === JSON.stringify(resources[0])), 'resource counts stable after three cycles')
  check(r.three.info.programs.every((v: any) => v.diagnostics?.runnable !== false), 'production shaders compile')
  ;(window as any).houndQa = { show }
  const model = await show(level === 11 ? 'sit' : 'stalk')
  return { checks: results.length, results, resources, model, stats: qa.stats(), placement: { x, y, playerX: p.x, playerY: p.y }, scope: `production Level ${level} renderer; isolated storage; fixed AI poses, actual combat and cache lifecycle` }
}
