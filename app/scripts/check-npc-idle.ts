// NPC 待机层校验：性格映射、闲聊台词、站立「活体层」持续有微动、换重心时脚不滑、各动作姿势有限且手到位、坐/靠墙姿势稳定。
import assert from 'node:assert/strict'
import { mkdirSync, writeFileSync } from 'node:fs'
import * as THREE from 'three'
import { DEFAULT_AVATAR } from '../src/game/core/avatar'
import { buildAvatarModel } from '../src/game/renderer/retroAvatar'
import { humanoidMotion } from '../src/game/renderer/humanoidMotion'
import { applyIdleUpper, type IdleFrame } from '../src/game/renderer/npcIdlePose'
import { applySeatedPose } from '../src/game/renderer/seatedPlayer'
import { IDLE_ACT_DUR, idleTemper, type IdleAct } from '../src/game/engine/npcIdle'
import { CHAT_FACTION, CHAT_GENERAL, pickChatExchange } from '../src/game/content/npcChatLines'

let checks = 0
const ok = (v: unknown, label: string) => { assert(v, label); checks++ }
const report: Record<string, unknown> = {}

// ---- 性格 → 待机气质
const RAND_PERS = ['沉默寡言，但做事极稳。', '热心肠，见谁都聊两句。', '谨小慎微，规矩挂在嘴边。', '大大咧咧，笑声比脚步声先到。', '慢条斯理，说什么都要想三秒。', '眼里有活，手上永远停不下来。']
const want = ['calm', 'warm', 'wary', 'loud', 'plain', 'busy']
RAND_PERS.forEach((p, i) => ok(idleTemper(p) === want[i], `temper ${p} → ${idleTemper(p)}`))

// ---- 闲聊台词：每组 2–4 句，单句 ≤ 18 字（气泡 1.7 m 宽一行可读）
for (const ex of [...CHAT_GENERAL, ...Object.values(CHAT_FACTION).flat()]) {
  ok(ex.length >= 2 && ex.length <= 4, `exchange length ${ex.join('/')}`)
  for (const l of ex) ok(l.length > 0 && l.length <= 18, `line length ${l}`)
}
let seedR = 1; const rnd = () => (seedR = (seedR * 16807) % 2147483647) / 2147483647
for (let i = 0; i < 200; i++) ok(pickChatExchange(['meg', 'bntg', 'tom', 'xx', undefined][i % 5], ['ariane', undefined, 'meg'][i % 3], rnd).length >= 2, 'pick exchange')
report.chatExchanges = CHAT_GENERAL.length + Object.values(CHAT_FACTION).flat().length

// ---- 姿势层
function subject(gender: number, seed: number) {
  const root = new THREE.Group(), model = buildAvatarModel({ ...DEFAULT_AVATAR, gender }, { faceless: true, seed })
  model.rotation.y = Math.PI / 2; root.add(model)
  const motion = humanoidMotion(root)!, rig = motion.rig
  const frame = (t: number, idle?: IdleFrame, seat?: number) => {
    motion.update({ time: t, x: 0, y: 0, z: 0, facing: 0, idle, ground: () => 0 })
    if (seat && idle) { applySeatedPose(model, { blend: 1, seatHeight: seat, relaxed: false, time: t }); applyIdleUpper(rig, { ...idle, seated: true }, { time: t, x: 0, y: 0, z: 0, facing: 0, scale: rig.group.scale.y }, 0) }
    root.updateMatrixWorld(true); rig.mesh.skeleton.update()
    ok(Array.from(rig.mesh.skeleton.boneMatrices).every(Number.isFinite), 'finite pose')
    const w = (b: THREE.Bone) => b.getWorldPosition(new THREE.Vector3())
    return { footL: w(rig.bones.footL), footR: w(rig.bones.footR), handL: w(rig.bones.handL), handR: w(rig.bones.handR), head: w(rig.bones.head), hips: w(rig.bones.hips), q: rig.bones.head.quaternion.clone(), chest: rig.bones.chest.quaternion.clone() }
  }
  return { rig, frame }
}
const base = (seed: number, extra: Partial<IdleFrame> = {}): IdleFrame => ({ seed, act: '', actT: 0, actDur: 0, look: null, lookK: 0, temper: 'plain', ...extra })

// 1) 站立 60 秒：修改前头部几乎只做固定正弦；修改后每个 3 秒窗口都有可见的头/躯干运动，且至少换过 2 次重心（髋部左右移）
for (const [g, seed] of [[0, 11], [1, 4242], [0, 987654]] as const) {
  const q = subject(g, seed), idle = base(seed)
  let last = q.frame(0, idle), minWin = Infinity, winMove = 0, shifts = 0, side = 0, maxSlip = 0, minSole = Infinity
  const planted = [last.footL.clone(), last.footR.clone()]
  for (let i = 1; i <= 60 * 30; i++) {
    const t = i / 30, f = q.frame(t, idle)
    winMove += f.q.angleTo(last.q) + f.chest.angleTo(last.chest)
    if (i % 90 === 0) { minWin = Math.min(minWin, winMove); winMove = 0 }
    const s = Math.sign(Math.round(f.hips.z * 100) / 100); if (s && s !== side) { if (side) shifts++; side = s }
    for (const [j, p] of [f.footL, f.footR].entries()) {
      const sole = p.y - .085 * q.rig.group.scale.y, prev = planted[j].y - .085 * q.rig.group.scale.y; minSole = Math.min(minSole, sole)
      if (sole < .0015 && prev < .0015) maxSlip = Math.max(maxSlip, p.distanceTo(planted[j]))
      planted[j].copy(p)
    }
    last = f
  }
  ok(minWin > .02, `idle micro-motion every 3 s window (${minWin.toFixed(3)} rad)`)
  ok(shifts >= 2, `weight shifts in 60 s: ${shifts}`)
  ok(minSole > -.012, `soles stay on floor ${minSole.toFixed(4)}`)
  ok(maxSlip < .006, `planted feet do not slide ${maxSlip.toFixed(4)}`)
  report[`stand_${seed}`] = { minWindowRad: +minWin.toFixed(3), shifts, minSole: +minSole.toFixed(4), maxSlip: +maxSlip.toFixed(4) }
}

// 2) 每个动作：中段姿势有限，手的位置相对静止站姿确实移动了（动作可见），并在结束后回到静止姿势附近
const HAND_TARGETS: Partial<Record<IdleAct, (f: ReturnType<ReturnType<typeof subject>['frame']>) => boolean>> = {
  scratch: f => f.handR.y > f.head.y, stretch: f => f.handL.y > f.head.y + .15 && f.handR.y > f.head.y + .15,
  yawn: f => f.handR.distanceTo(f.head) < .25, neck: f => f.handR.distanceTo(f.head) < .25, wipe: f => f.handR.distanceTo(f.head) < .25,
  radio: f => f.handR.distanceTo(f.head) < .28, hardhat: f => f.handR.y > f.head.y - .02, headphones: f => f.handL.distanceTo(f.head) < .25 && f.handR.distanceTo(f.head) < .25,
  wave: f => f.handR.y > f.head.y - .1, watch: f => f.handL.y > 1.05, crouch: f => f.hips.y < .75, dust: f => f.handL.y < .9,
}
const acts = Object.keys(IDLE_ACT_DUR) as IdleAct[]
for (const act of acts) {
  const q = subject(act.length % 2, 77 + act.length), D = (IDLE_ACT_DUR[act][0] + IDLE_ACT_DUR[act][1]) / 2
  let rest = q.frame(0, base(5)); for (let i = 1; i <= 60; i++) rest = q.frame(i / 30, base(5))
  let peak = rest, moved = 0
  for (let i = 0; i <= Math.ceil(D * 30); i++) {
    const t = 2 + i / 30, f = q.frame(t, base(5, { act, actT: i / 30, actDur: D, look: act === 'glare' || act === 'avert' ? { x: 3, y: 0, z: 1.6 } : null, lookK: act === 'glare' || act === 'avert' ? 1 : 0 }))
    const m = Math.max(f.handL.distanceTo(rest.handL), f.handR.distanceTo(rest.handR), f.q.angleTo(rest.q) * .3, Math.abs(f.hips.y - rest.hips.y))
    if (m > moved) moved = m
    if (i === Math.round(D * 15)) peak = f
  }
  ok(moved > .03, `act ${act} visibly moves (${moved.toFixed(3)})`)
  const tgt = HAND_TARGETS[act]; if (tgt) ok(tgt(peak), `act ${act} reaches its target`)
  let after = peak; for (let i = 0; i < 45; i++) after = q.frame(2 + D + i / 30, base(5))
  ok(after.handR.distanceTo(rest.handR) < .12 && after.handL.distanceTo(rest.handL) < .12, `act ${act} returns to rest`)
  report[`act_${act}`] = +moved.toFixed(3)
}

// 3) 注视：目标在右前方时头转向目标一侧，目标在身后时被限幅
{
  const q = subject(0, 3)
  const look = (y: number) => { let f = q.frame(0, base(3)); for (let i = 1; i <= 40; i++) f = q.frame(i / 30, base(3, { look: { x: 2, y, z: 1.6 }, lookK: 1 })); return f }
  const fwd = new THREE.Vector3(0, 0, 1)
  const dir = (f: ReturnType<typeof look>) => fwd.clone().applyQuaternion(q.rig.bones.head.getWorldQuaternion(new THREE.Quaternion()))
  const a = look(2), da = dir(a), b = look(-2), db = dir(b)
  ok(Math.sign(da.z - db.z) !== 0 && Math.abs(da.angleTo(db)) > .6, `head follows look target (${da.angleTo(db).toFixed(2)} rad between sides)`)
  report.lookSpread = +da.angleTo(db).toFixed(2)
}

// 4) 坐姿与靠墙：脚着地、髋部高度合理
{
  const q = subject(1, 9), idle = base(9, { act: 'book', actT: 2, actDur: 6 })
  let f = q.frame(0, idle, .46); for (let i = 1; i <= 30; i++) f = q.frame(i / 30, idle, .46)
  ok(f.hips.y > .45 && f.hips.y < .7, `seated hips ${f.hips.y.toFixed(2)}`)
  ok(Math.min(f.footL.y, f.footR.y) < .15, 'seated feet near floor')
  const l = subject(0, 21), li = base(21, { lean: 1, leanArms: 'cross' })
  let g = l.frame(0, li); for (let i = 1; i <= 90; i++) g = l.frame(i / 30, li)
  ok(g.head.x < g.footL.x - .15 && g.head.x < g.footR.x - .15, 'leaning: head behind feet (toward the wall)')
  ok(Math.min(g.footL.y, g.footR.y) - .085 * l.rig.group.scale.y > -.012, 'leaning: feet on floor')
  report.seatedHips = +f.hips.y.toFixed(3); report.leanHeadBehind = +(Math.min(g.footL.x, g.footR.x) - g.head.x).toFixed(3)
}

mkdirSync('reports/npc-idle', { recursive: true })
writeFileSync('reports/npc-idle/check.json', JSON.stringify({ checks, ...report }, null, 2))
console.log(`NPC idle: ${checks} checks passed`)
