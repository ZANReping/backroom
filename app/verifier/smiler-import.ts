import { makeEntity } from '../src/game/entities'
import { initSmiler } from '../src/game/engine/smilerAI'
import { SMILER_KINDS, type SmilerKind } from '../src/game/entities/smilers'

/** Isolated verifier only: exercises the production entity cache and renderer. */
export async function verifySmilerImport(qa: any, level = 2) {
  const { eng, r, look } = qa, results: string[] = []
  const check = (v: unknown, message: string) => { if (!v) throw Error(message); results.push(message) }
  const settle = () => new Promise(resolve => setTimeout(resolve, 1200))
  await qa.scene(level); await qa.warm(); qa.hide()
  eng.player.flashlight = true; eng.player.hotbar.fill(null)
  eng.map.entities = []; await settle()
  const p = eng.player
  let point: [number, number] | undefined
  for (let d = 4; d >= 2 && !point; d -= .5) for (let i = 0; i < 16; i++) {
    const a = i * Math.PI / 8, x = p.x + Math.cos(a) * d, y = p.y + Math.sin(a) * d
    if (eng.entityWalkH(eng.map, Math.floor(x), Math.floor(y), 0) !== null && eng.los(p.x, p.y, x, y)) { point = [x, y]; break }
  }
  if (!point) throw Error('No clear placement in Level ' + level)
  const [x, y] = point
  look.yaw = Math.atan2(-(x - p.x), -(y - p.y)); look.pitch = -.04; r.setFov(72)
  const spawn = (kind: SmilerKind) => {
    const e = makeEntity('smiler', x, y, p.z)
    initSmiler(eng, e, kind, 1)
    e.facing = Math.atan2(p.y - y, p.x - x)
    e.sm!.grin = .65; e.sm!.glow = 1; e.sm!.vis = 1; e.sm!.phase = 'standoff'
    return e
  }
  async function show(kind: SmilerKind) {
    eng.map.entities = [spawn(kind)]; await settle()
    const e = eng.map.entities[0], g = r.entityMeshes.get(e.id)
    check(g?.userData.smilerKind === kind, `${kind}: production mesh selected`)
    check(g.visible && g.userData.smilerRig, `${kind}: animated rig visible`)
    return qa.stats()
  }
  const variants = Object.keys(SMILER_KINDS) as SmilerKind[]
  for (const kind of variants) await show(kind)
  // Runtime kind initialization must replace the previously displayed common model.
  eng.map.entities = [makeEntity('smiler', x, y, p.z)]; await settle()
  const lazy = eng.map.entities[0], old = r.entityMeshes.get(lazy.id)
  initSmiler(eng, lazy, 'phantom', 1); await settle()
  check(r.entityMeshes.get(lazy.id) !== old && r.entityMeshes.get(lazy.id).userData.smilerKind === 'phantom', 'first AI tick rebuilds the correct variant')
  const resources = []
  for (let i = 0; i < 3; i++) {
    eng.map.entities = variants.map(spawn); await settle()
    check(r.entityMeshes.size === variants.length, `cycle ${i}: five cached models`)
    eng.map.entities = []; await qa.warm()
    check(r.entityMeshes.size === 0, `cycle ${i}: removed entities leave no cached model`)
    resources.push({ ...r.three.info.memory, programs: r.three.info.programs.length })
  }
  check(resources.every(a => JSON.stringify(a) === JSON.stringify(resources[0])), 'resource counts stable after three create/remove cycles')
  const programs = r.three.info.programs ?? []
  check(programs.every((v: any) => v.diagnostics?.runnable !== false), 'production shaders compile')
  ;(window as any).smilerQa = { show }
  await show('common')
  return { results, resources, stats: qa.stats(), placement: { x, y, playerX: p.x, playerY: p.y }, scope: `production Level ${level} renderer; isolated storage; fixed AI poses` }
}
