import { ceilingHeightAt, floorHeight } from '../src/game/world/mapgen'
import { canFlyOccupy } from '../src/game/core/flight'
import { seatedEyeHeight } from '../src/game/engine/seating'
const points: Record<string, [number, number, number]> = { living: [10.4, 9.5, 2.8], bedroom: [5.8, 7.3, 2.8], bathroom: [10.6, 6.7, 2.8], kitchen: [14.3, 6.2, 2.8], entry: [7.5, 12.5, 2.8], landing: [6, 16, 2.8], lobby: [40, 11, 3], stairs: [34.8, 11, 4.6], store: [77, 64, 3.1], street: [82, 54, Infinity] }
export function mountEntry(api: any) {
  const e = api.engine, look = api.look
  const state = () => { const r = api.renderer(), p = e.player, s = e.seating; return { level: p.level, pos: [p.x, p.y, p.z], ceiling: e.map ? ceilingHeightAt(e.map, p.x, p.y, 3) : null, seat: s ? { phase: s.phase, blend: s.blend, pid: s.structure.data?.pid, anchor: s.anchor, eye: seatedEyeHeight(e) } : null, camera: r.camera.position.toArray(), yaw: look.yaw, pitch: look.pitch, body: { visible: r.seatedPlayer.root.visible, model: !!r.seatedPlayer.model, hip: r.seatedPlayer.model?.userData.retro.bones.thighL.rotation.x, knee: r.seatedPlayer.model?.userData.retro.bones.shinL.rotation.x } } }
  const point = (name: string, fly = true) => {
    const [cx, cy, height] = points[name], m = e.map
    let target: { x: number; y: number; z: number } | null = null
    for (const dy of [0, .3, -.3, .6, -.6]) for (const dx of [0, .3, -.3, .6, -.6]) {
      const x = cx + dx, y = cy + dy, z = floorHeight(m, x, y, 0)
      if (!target && ceilingHeightAt(m,x,y,3) === height && canFlyOccupy(m,x,y,z,3)) target = { x,y,z }
    }
    if (!target) throw Error('No clear floor for ' + name)
    e.seating = null; e.climb = null; e.ride = null; e.introT = 0; e.dev.fly = fly; e.dev.noclip = false
    Object.assign(e.input, { mx: 0, my: 0, jump: false, crouch: false, sprint: false })
    Object.assign(e.player, target, { vz: 0, floor: 0, crouching: false })
    look.pitch = .8; look.yaw = -.4
    return { name, ...target, height: Number.isFinite(height) ? height : null }
  }
  const sample = (ms: number) => new Promise<any>(resolve => {
    const start = performance.now(); let maxZ = -Infinity, maxEye = -Infinity, maxHead = -Infinity
    const tick = () => { const p = e.player; maxZ = Math.max(maxZ,p.z); maxEye = Math.max(maxEye,api.renderer().camera.position.y); maxHead = Math.max(maxHead,p.z+(p.crouching?1.1:1.7)); if(performance.now()-start<ms)requestAnimationFrame(tick); else resolve({maxZ,maxEye,maxHead,end:state()}) }; requestAnimationFrame(tick)
  })
  return { state, point, sample, async jump() { point('living',false); e.player.z=.95; e.player.vz=4.5; return sample(1500) }, lookDown() { look.pitch=-1.1 }, restore() { point('bedroom',false); look.yaw=Math.PI/2;look.pitch=-.12 } }
}
