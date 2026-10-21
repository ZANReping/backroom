// 死亡飞蛾（Entity 4）渲染接入层：旧接口 buildMothMesh / animateMoth 不变，内部换成重制模型（deathmothMesh）与片段动画（deathmothAnim）。
// 片段选择：AI 写入 e.mt.clip（engine/mothAI.ts）时优先使用；否则按实体状态推断。非循环片段按切换时刻计时。
import * as THREE from 'three'
import type { Entity, MothForm } from '../entities/types'
import { buildDeathmothMesh } from './deathmothMesh'
import { MOTH_CLIPS, poseMoth, sampleMoth, applyMothPose, mixMothPose, type MothClip, type MothPose } from './deathmothAnim'

export function buildMothMesh(form: MothForm = 'male', scale = 1): THREE.Group {
  const g = buildDeathmothMesh(form, scale)
  g.userData.parts = {} // 不交给渲染层的通用四肢摆动
  return g
}

function inferClip(form: MothForm, e: Entity | undefined, speed: number, attack: number, death: number): MothClip {
  if (death > 0 || e?.dead) return 'death'
  const forced = e?.mt?.clip
  if (forced && MOTH_CLIPS[form][forced]) return forced as MothClip
  if (form === 'larva') return speed > 0.02 ? 'crawl' : 'chew'
  if (form === 'guard') return attack > 0 ? 'stab' : speed > 1.6 ? 'run' : speed > 0.05 ? 'walk' : 'idle'
  if (attack > 0) return 'bite'
  return speed < 0.15 && e?.state !== 'chase' ? 'hover' : 'fly'
}

/** 每帧调用：time=全局时间，dt=帧间隔，speed=水平速度（m/s），attack/death=0..1 */
export function animateMoth(g: THREE.Group, time: number, dt: number, speed: number, attack = 0, death = 0, e?: Entity) {
  const form = g.userData.mothForm as MothForm
  const clip = inferClip(form, e, speed, attack, death)
  const ud = g.userData
  if (ud.mclip !== clip) { // 切换：记住上一帧姿态做 0.18s 过渡
    ud.mprev = ud.mpose as MothPose | undefined; ud.mblend = ud.mprev ? 0 : 1
    ud.mclip = clip; ud.mclipStart = time
  }
  const info = MOTH_CLIPS[form][clip]
  const local = info?.loop ? time : time - (ud.mclipStart as number)
  const opts = { speed, phase: e ? (e.id * 0.618) % 1 * 3 : 0 }
  let pose = sampleMoth(g, clip, local, opts)
  if (ud.mblend < 1 && ud.mprev) { ud.mblend = Math.min(1, ud.mblend + dt / 0.18); pose = mixMothPose(ud.mprev, pose, ud.mblend) }
  applyMothPose(g, pose)
  ud.mpose = pose
}
export { poseMoth }
