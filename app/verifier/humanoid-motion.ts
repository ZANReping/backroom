import { humanoidMotion } from '../src/game/renderer/humanoidMotion'
import { humanoidAttackPhase } from '../src/game/core/humanoidMelee'
import { canOccupy } from '../src/game/core/player'
import { floorHeight } from '../src/game/world/mapgen'
import { attachL11Ecology } from './l11-ecology'
import { brcWorkerDef } from '../src/game/content/npcs'

export function attachHumanoidMotion(qa: any) {
  const eng = qa.eng, r = qa.r, canvas = r.three.domElement
  const frame = () => new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
  let actor: any, npc = false, checks = 0, damage: {time: number; amount: number}[] = []
  const ok = (v: unknown, label: string) => { if (!v) throw Error(label); checks++ }
  const root = () => npc ? r.npcMeshes.get(actor.id)?.grp : r.entityMeshes.get(actor.id)
  const motion = () => humanoidMotion(root())!
  const camera = () => {
    eng.player.z = npc ? floorHeight(eng.map, actor.x, actor.y, actor.floor ?? 0) : actor.z
    let found = false
    outer: for (const d of [3.3, 2.9, 2.5]) for (const turn of [npc ? .9 : -1.1, 1.4, -1.4, 0, 2.3, -2.3]) {
      const a = actor.facing + turn
      let clear = true
      for (let step = .4; step <= d; step += .2) if (!canOccupy(eng.map, actor.x + Math.cos(a) * step, actor.y + Math.sin(a) * step, .13, {z:eng.player.z, band:actor.floor ?? actor.l11Home?.floor ?? 0})) { clear = false; break }
      if (clear) { eng.player.x = actor.x + Math.cos(a) * d; eng.player.y = actor.y + Math.sin(a) * d; found = true; break outer }
    }
    ok(found, 'unobstructed floor-level camera segment')
    qa.look.yaw = Math.atan2(eng.player.x - actor.x, eng.player.y - actor.y)
    qa.look.pitch = -.18; qa.look.roll = 0; r.setFov(59)
  }
  const render = () => r.render(canvas, eng, { grain: false, flicker: 0, shake: false }, 1 / 60)
  const tick = (ai = true) => {
    eng.time += 1 / 60
    if (ai) {
      if (npc) eng.updateNpcs(1 / 60)
      else { eng.dev.frozenAI = false; eng.updateEntities(1 / 60, 1); eng.dev.frozenAI = true }
    }
    render()
  }
  const state = () => ({ checks, npc, id: actor.id, x: actor.x, y: actor.y, z: actor.z,
    speed: motion().speed, distance: motion().distance, phase: motion().phase, resets: motion().resets,
    attack: humanoidAttackPhase(actor.lungeT, actor.meleeRecoveryT), damage: [...damage], stats: qa.stats(),
    bones: ['thighL', 'shinL', 'footL', 'upperArmL', 'foreArmL'].map(k => ({name:k,rotation: (motion().rig.bones as any)[k].rotation.toArray()})),
  })
  qa.motion = {
    state,
    async street() {
      attachL11Ecology(qa); await qa.ecology.setup()
      npc = false; actor = eng.map.entities.find((e: any) => e.l11Home?.role === 'pedestrian')
      eng.map.entities = [actor]; camera(); await qa.warm(); render()
      ok(root() && motion(), 'natural faceling uses production motion controller')
      for (let i = 0; i < 1800 && motion().distance < 1.4; i++) { tick(); if (i % 30 === 0) { camera(); await frame() } }
      ok(motion().distance > 1, 'natural sidewalk AI advances measured gait')
      camera(); render(); return state()
    },
    async walk(seconds = .18) {
      const before = motion().distance
      for (let i = 0; i < 900 && motion().distance - before < seconds * (npc ? .7 : .88); i++) {
        tick(); if (i % 30 === 0) { camera(); await frame() }
      }
      ok(motion().distance > before + .06, 'walk screenshot contains real locomotion')
      camera(); render(); await frame(); return state()
    },
    async stopped() {
      const phase = motion().phase
      // Preserve a far target while actual position stops (pause/blocked movement).
      const oldTarget = npc ? [actor.tx, actor.ty] : [actor.targetX, actor.targetY]
      for (let i = 0; i < 45; i++) tick(false)
      ok(motion().phase === phase, 'a remaining AI target does not drive treadmill animation')
      ok(motion().feet.every(f => f.lift === 0), 'idle has both feet grounded')
      return {...state(), oldTarget}
    },
    async npc() {
      await qa.scene(104); qa.hide(); eng.dev.invisible = true
      actor = eng.npcs.find((n: any) => n.id === 'tom'); npc = true
      ok(actor, 'real named NPC spawns in settlement')
      eng.npcs = [actor]
      camera(); await qa.warm(); render()
      // Pick an actual unobstructed floor segment for a reproducible ordinary walk.
      let chosen = false
      for (let a = 0; a < Math.PI * 2; a += Math.PI / 12) {
        let clear = true
        for (let d = .1; d <= 2; d += .1) if (!canOccupy(eng.map, actor.x + Math.cos(a) * d, actor.y + Math.sin(a) * d, .24, {z: eng.player.z, band: actor.floor ?? 0})) { clear = false; break }
        if (clear) { actor.tx = actor.x + Math.cos(a) * 2; actor.ty = actor.y + Math.sin(a) * 2; actor.moveT = 100; actor.facing = a; chosen = true; break }
      }
      ok(chosen, 'safe NPC walking segment')
      camera(); render()
      const start = motion().distance
      for (let i = 0; i < 60; i++) tick()
      ok(motion().distance - start > .6 && Math.abs(motion().speed - .7) < .05, 'NPC gait follows actual 0.7m/s movement')
      camera(); render(); return state()
    },
    async attackStart() {
      damage = []
      if (!eng.motionOriginalHurt) {
        eng.motionOriginalHurt = eng.hurtPlayer.bind(eng)
        eng.hurtPlayer = (amount: number, cause: string) => { damage.push({time: eng.time, amount}); eng.motionOriginalHurt(amount, cause) }
      }
      eng.dev.invisible = false; eng.dev.god = true
      // Keep the real player within melee reach for simulation; screenshots use a separate safe tripod.
      const a = actor.facing
      eng.player.x = actor.x + Math.cos(a) * .8; eng.player.y = actor.y + Math.sin(a) * .8
      eng.player.z = npc ? floorHeight(eng.map, actor.x, actor.y, actor.floor ?? 0) : actor.z
      if (npc) { actor.hostile = true; actor.atkT = 0; actor.lungeT = 0; tick() }
      else { actor.provoked = true; actor.state = 'attack'; actor.stateT = 20; actor.lungeT = .32; actor.attackCd = 1.4; render() }
      ok(damage.length === 0, 'windup does not deal early damage')
      return state()
    },
    async toolNpc() {
      const def = {...brcWorkerDef(37,0,0,0), id:'brc_motion_qa', workLoop:'hammer'}
      actor = {...actor, id:def.id, def, hostile:false, lungeT:0, meleeRecoveryT:0, atkT:0, homeFacing:actor.facing}
      eng.npcs = [actor]; camera(); await qa.warm(); render()
      ok(motion().rig.bones.handL.children.some(c => c.userData.humanoidAttachment), 'production BRC tool follows wrist')
      return state()
    },
    async attackStep(count: number, expectHits: number) {
      for (let i = 0; i < count; i++) tick()
      ok(damage.length === expectHits, 'damage occurs once at hand contact')
      await frame(); return state()
    },
    async tripod() {
      const saved = {...eng.player}, invisible = eng.dev.invisible
      camera(); render(); const result = qa.captureFrame(1920, 1080)
      Object.assign(eng.player, saved); eng.dev.invisible = invisible
      return result
    },
    async evade() {
      await qa.motion.attackStart()
      for (let i = 0; i < 6; i++) tick()
      eng.player.x += 4; eng.player.y += 4
      for (let i = 0; i < 16; i++) tick()
      ok(damage.length === 0, 'moving out of reach during windup prevents damage')
      eng.dev.invisible = true; return state()
    },
  }
}
