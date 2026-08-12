// v53：移动/输入积分 + 垂直物理（固定子步积分主段、液体浮沉、跳跃重力、梯子攀爬）——
// 自 engine.ts step 内联段拆分，逻辑逐语句搬运；updateMovement 返回 null 表示本帧已死亡/终止（原 step 的 return）。
import { bandOfZ, groundHeightAt, structStandTopAt, ceilingHeightAt, POOL_DEPTH, FLOOR_H } from '../world/mapgen'
import { integrateMove } from '../core/player'
import { WALL_H } from '../renderer/shared'
import { levelDefOf, NORMAL_LEVELS } from '../levels'
import { audio } from '../core/audio'
import { chunkKey, CS, applyRedPlague } from '../world/infinite'
import type { Engine } from '../engine'

type DiffMult = { dmg: number; drain: number }

/** 移动主段（原 step「---- 移动 ----」至离水判定一整段；返回本帧输入向量模长 mag，null=中止本帧） */
export function updateMovement(eng: Engine, dt: number, dm: DiffMult, introLock: boolean): number | null {
  const p = eng.player, m = eng.map!
  // ---- 移动 ----
  const mag = Math.hypot(eng.input.mx, eng.input.my)
  const tileI = Math.floor(p.y) * m.w + Math.floor(p.x)
  const wet = m.wet[tileI] === 1
  // v13：楼层高度带（供 HUD/小地图与碰撞）
  const band = bandOfZ(p.z)
  p.floor = band
  // v54e：带界误吸修复——band 随 z 即时翻转，z 刚过带界（1.5/4.5）但仍在上层板底之下时，
  // band 地面=上层板面（3.0/6.0），贴地跟随会把人直接吸穿楼板（2F 高柜顶/掉落穿 3F 板）。
  // 修正：本格有上层板且 z 未达板底时，地面按下一层带取（坡道格由坡道面高度接管，豁免）
  let gBand = band
  if ((m.stair[tileI] & 7) === 0) {
    if (gBand === 2 && m.up2[tileI] === 1 && p.z < 2 * FLOOR_H - 0.35) gBand = 1
    else if (gBand >= 1 && m.up[tileI] === 1 && p.z < FLOOR_H - 0.35) gBand = 0
  }
  // v13：液体状态（深水=可沉没游泳；浅水=减速涟漪）
  const lq = band === 0 ? m.liquid[tileI] : 0
  if (lq !== eng.inLiquid) {
    if (lq === 1 && eng.inLiquid === 0) { // 入水扑通
      audio.splash()
      eng.splashParticles(p.x, p.y, 0)
      eng.msg('你跌进了水里——冰冷刺骨。', 'system')
    } else if (eng.inLiquid === 1 && lq !== 1) { // 出水
      audio.splash(0.5)
      eng.splashParticles(p.x, p.y, 0)
      eng.breathT = 0
    }
    eng.inLiquid = lq
  }
  // 蹲伏状态：按住蹲伏键，或身处低通道被风道强制压低头
  p.crouching = eng.input.crouch || m.crawl[tileI] === 1
  let speed = 3.4
  const wantSprint = eng.input.sprint && !p.crouching && mag > 0.1 && p.stamina > 1 && lq !== 1
  if (eng.input.sprint && mag > 0.1 && p.stamina <= 1) {
    // 体力耗尽提示（节流 4 秒）
    if (eng.statusMsgT.stamina <= 0) { eng.msg('体力耗尽——喘口气再跑。', 'system'); eng.statusMsgT.stamina = 4 }
  }
  if (wantSprint) { speed = 6.0; p.stamina = Math.max(0, p.stamina - 22 * (eng.manmadeT > 0 ? 2 : 1) * dt) } // v51：人制品效应中体力消耗 ×2
  else p.stamina = Math.min(100, p.stamina + (p.coffeeT > 0 ? 24 : 12) * (eng.inOutpost ? 2 : 1) * (eng.manmadeT > 0 ? 0.5 : 1) * (p.infection >= 100 ? 0.9 : 1) * dt) // v51：人制品效应中体力恢复 ×0.5；v55：疫疾一阶起 ×0.9
  if (p.crouching) speed *= 0.5 // 蹲伏减速
  if (wet && lq === 0) speed *= 0.55
  if (lq !== 0) speed *= 0.5 // v13：液体中移动减速
  if (p.slowT > 0) { p.slowT -= dt; speed *= 0.5 }
  if (eng.webbedT > 0) speed *= 0.5 // v51：镇静剂麻痹——移动迟缓
  if (p.flashJamT > 0) p.flashJamT -= dt
  if (eng.dev.speed) speed *= 1.8
  if (eng.plantK > 0) speed *= 1 - 0.55 * Math.min(1, eng.plantK) // v30 植殖癌：行为逐渐僵硬
  if (p.infection >= 300) speed *= 0.8 // v55：疫疾三阶（并发期）——移速降低
  if (p.coffeeT > 0) p.coffeeT -= dt
  eng.statusMsgT.stamina -= dt
  eng.statusMsgT.hunger -= dt
  eng.statusMsgT.thirst -= dt
  // v23：The Manila Room——墙内传出敲击声与砰砰声，灯灭期间最响；灯亮度剧烈波动、周期性全黑
  {
    const mi = Math.floor(p.y) * m.w + Math.floor(p.x)
    const inManila = m.tint?.[mi] === 1
    if (inManila) {
      eng.manilaT -= dt
      if (eng.manilaT <= 0) {
        eng.manilaT = 9 + Math.random() * 11
        const dark = eng.blackoutT > 0
        const lines = dark
          ? ['灯全灭了。墙里那阵敲击声一下子变得很近——就在你背后那面墙的里面。',
             '黑暗中，砰、砰、砰。有规律，像是在回应什么。']
          : ['墙里传来敲击声。你贴上去听，它停了；你退开，它又开始了。',
             '砰的一声闷响从墙体内部传来。这间房的墙有两格厚。',
             '如果有人从门口进来，你会先看见一个轮廓「淡入现形」。别和别人同时走同一个门。']
        eng.msg(lines[Math.floor(Math.random() * lines.length)], 'lore')
        if (dark) { p.sanity = Math.max(0, p.sanity - 6); eng.emit({ kind: 'sanityhit' }) }
      }
    } else eng.manilaT = 4
  }
  // v30：植殖癌（Level 1 花园段）——行为逐渐僵硬、视野逐渐变绿，最终原地生根化为一株植物
  {
    const inf = m.inf
    const realGarden = eng.levelDef.id === 1 && !!inf &&
      inf.chunks.get(chunkKey(Math.floor((inf.ox + p.x) / CS), Math.floor((inf.oy + p.y) / CS)))?.variant === 'garden'
    // 开发者面板现象开关：可强制触发/屏蔽植殖癌（无视所在区段）
    const inGarden = (realGarden || eng.dev.phenOn.has('plantcancer')) && !eng.dev.phenOff.has('plantcancer')
    eng.inGardenEff = inGarden
    if (inGarden) eng.plantK = Math.min(1, eng.plantK + dt / 75)
    else eng.plantK = Math.max(0, eng.plantK - dt / 37)
    const stages: [number, string][] = [
      [0.25, '你的关节有些发僵，像是很久没有活动过。'],
      [0.5, '视野的边缘泛起一层新绿。你的动作越来越迟缓了。'],
      [0.75, '皮肤下浮现出叶脉般的纹路——阳光照在身上，竟有种光合作用的暖意。'],
    ]
    while (eng.plantStage < stages.length && eng.plantK >= stages[eng.plantStage][0]) {
      eng.msg(stages[eng.plantStage][1], 'damage')
      eng.plantStage++
    }
    if (eng.plantK <= 0.05 && eng.plantStage > 0) {
      eng.plantStage = 0
      eng.msg('绿意从视野里褪去，四肢重新听使唤了。', 'system')
    }
    if (eng.plantK >= 1) { eng.die('植殖癌——你在阳光里生根，化作了一株绿植'); return null }
  }
  // v23：⚠ 切勿把 Pockets 带入 Level 9——会立即引来 Entity 96「The Neighborhood Watch」
  if (p.hasPockets && eng.levelDef.id === 9) {
    eng.pocketsAlarmT -= dt
    if (eng.pocketsAlarmT <= 0) {
      eng.pocketsAlarmT = 22
      let n = 0
      for (const e of m.entities) {
        if (e.dead || (e.def.type !== 'watcher' && e.def.type !== 'strider')) continue
        e.state = 'chase'; e.targetX = p.x; e.targetY = p.y; e.stateT = 0
        n++
      }
      if (n) {
        eng.msg('背包里的 Pockets 在发烫。街区尽头，有什么东西同时转了过来。', 'damage')
        audio.aggro()
      }
    }
  }
  eng.statusMsgT.battery -= dt
  // v13：电梯乘降 / 梯子攀爬进行中：锁定水平移动（垂直由对应逻辑驱动）
  // v51：脚滑漂移量足够时，即使松开方向键也会继续滑动
  const slipDrift = Math.hypot(eng.slipVx, eng.slipVy)
  if ((mag > 0.1 || (eng.slipperyT > 0 && slipDrift > 0.05)) && !eng.ride && !eng.climb && !introLock) {
    // 固定子步积分：dt 先入累加器，按 FIXED_STEP 切分子步逐次「移动→解碰撞」。
    // 高帧率不会积分抖动，低帧率不会大步长穿墙弹回；脚步声/噪音按实际位移计。
    const scale = mag > 0.1 ? Math.min(mag, 1) / mag : 0
    // v51：咀嚼子弹脚滑——输入叠加衰减的惯性漂移，停步后仍会向前滑出
    if (eng.slipperyT > 0) {
      eng.slipperyT -= dt
      eng.slipVx += eng.input.mx * dt * 3
      eng.slipVy += eng.input.my * dt * 3
      eng.slipVx *= Math.max(0, 1 - dt * 1.8)
      eng.slipVy *= Math.max(0, 1 - dt * 1.8)
    } else { eng.slipVx = 0; eng.slipVy = 0 }
    const moved = integrateMove(m, p, eng.input.mx * scale + eng.slipVx, eng.input.my * scale + eng.slipVy, speed, dt, eng.moveIt, { noclip: eng.dev.noclip, z: eng.onStairs ? 0 : p.z, crouch: p.crouching, band: eng.onStairs ? 0 : band })
    const movedDist = Math.hypot(moved.x, moved.y)
    // v51 修复：删除移动方向覆写 p.facing 的旧行——facing 由 609 行每帧锁定为视角方向；
    // 移动中（尤其侧移/后退）被覆写成移动方向，导致 inView 视锥错位、交互提示一会有一会无
    eng.stepAcc += movedDist
    p.steps += movedDist
    if (eng.stepAcc > 0.9) {
      eng.stepAcc = 0
      const g0 = eng.levelDef.gen
      if (lq !== 0) audio.swim() // 水中移动划水声
      else audio.footstep(g0 === 'garage' || g0 === 'grid' ? 'concrete' : g0 === 'pipes' ? 'metal' : 'carpet')
      eng.noise = Math.min(1, eng.noise + (wantSprint ? 0.5 : 0.15))
      if (wantSprint) eng.noiseEvent(p.x, p.y, 10, true)
      else eng.noiseEvent(p.x, p.y, p.crouching ? 1 : 4, false) // 蹲行近乎无声（肢团听不见）
    }
    // v13：移动涟漪（浅水与水面）
    if (lq !== 0 && movedDist > 0.01) {
      eng.rippleT -= dt
      if (eng.rippleT <= 0) { eng.rippleT = 0.22; eng.rippleParticles(p.x, p.y) }
    }
  }
  eng.noise = Math.max(0, eng.noise - dt * 1.2)
  eng.playerNoiseT = Math.max(0, eng.playerNoiseT - dt)

  // ---- v17：无限模式（L0）——玩家跨出中心 chunk 时流式平移窗口 ----
  if (m.inf) {
    eng.updateInfiniteWindow()
    // 红室（v34）：到达刷新红室的区块先播报预警；玩家真正走进红厅（瓦片 tint=2）才触发蔓延
    const inf = m.inf
    if (!inf.plague) {
      const ck = chunkKey(Math.floor((inf.ox + p.x) / CS), Math.floor((inf.oy + p.y) / CS))
      const c = inf.chunks.get(ck)
      if (c?.variant === 'red') {
        if (!eng.redAnnounced.has(ck)) {
          eng.redAnnounced.add(ck)
          eng.msg('空气里多了一股铁锈味。前方有个房间透着不祥的红光——档案里管那种地方叫「红室」，别久留。', 'lore')
        }
        if (m.tint[Math.floor(p.y) * m.w + Math.floor(p.x)] === 2) {
          // 红室蔓延：周围所有房间与即将生成的新区域全部变成红室（不再产物资）
          applyRedPlague(m)
          p.sanity = Math.max(0, p.sanity - 15)
          eng.camShake = Math.min(1, eng.camShake + 0.5)
          audio.whisper(1)
          eng.msg('红色漫过了你的脚踝——墙纸、地毯、灯光，一切都在变红。档案说得对：已经来不及了。', 'lore')
        }
      }
    }
  }

  // ---- v13：电梯乘降（交互后轿厢垂直送达另一层）----
  if (eng.ride) {
    const r = eng.ride
    r.t += dt
    const k = Math.min(1, r.t / 1.7)
    const s = k * k * (3 - 2 * k)
    p.x = r.sx; p.y = r.sy // 轿厢内固定
    p.z = r.from + (r.to - r.from) * s
    p.vz = 0
    const liftS = m.structures.find((st) => st.kind === 'lift' && Math.floor(st.x) === Math.floor(r.sx) && Math.floor(st.y) === Math.floor(r.sy))
    if (liftS) liftS.data = { ...liftS.data, carZ: p.z } // 轿厢随玩家升降
    if (k >= 1) {
      if (liftS) liftS.data = { ...liftS.data, car: bandOfZ(r.to), carZ: r.to }
      eng.ride = null
      audio.pickup()
      eng.msg(bandOfZ(p.z) === 1 ? '电梯门滑开——上层。' : '电梯门滑开——回到了楼下。', 'system')
    }
  }

  // ---- v23：绊线（Wikidot Level 6「意外绊到线 → Level 6.1」）----
  if (!eng.transition) {
    const tw = m.structures.find((st) => st.kind === 'tripwire' && !st.data?.tripped
      && Math.hypot(st.x + 0.5 - p.x, st.y + 0.5 - p.y) < 0.62)
    if (tw) {
      tw.data = { ...tw.data, tripped: 1 }
      eng.msg('脚踝碰到了一根绷紧的细线。', 'damage')
      audio.hurt()
      p.hp -= 6
      eng.emit({ kind: 'damage' })
      if (p.hp <= 0) { eng.die('绊线'); return null }
      const td = Math.floor(Math.random() * NORMAL_LEVELS)
      eng.transition = { anim: 'noclip', t: 0, dest: td }
      eng.emit({ kind: 'transition', anim: 'noclip', cutIn: levelDefOf(td)?.entryAnim ?? 'dark', dest: td })
    }
  }

  // ---- v53：L3 尸鼠陷阱（wikidot L3 高智能尸鼠设陷阱）——踩上：轻伤+减速，并被附近尸鼠视为猎物 ----
  if (eng.levelDef.id === 3) {
    const tr = m.structures.find((st) => st.kind === 'rattrap' && !st.data?.sprung
      && Math.hypot(st.x + 0.5 - p.x, st.y + 0.5 - p.y) < 0.6)
    if (tr) {
      tr.data = { ...tr.data, sprung: 1 }
      p.hp -= 5
      p.slowT = Math.max(p.slowT, 1.2)
      eng.emit({ kind: 'damage' })
      audio.hurt()
      eng.msg('脚踝「咔」地一痛——你踩中了尸鼠设下的陷阱！附近的尸鼠把你当成了猎物。', 'damage')
      for (const q of m.entities) {
        if (q.dead || q.def.type !== 'corpserat') continue
        if (Math.hypot(q.x - p.x, q.y - p.y) < 14) { q.provoked = true; q.targetEnt = undefined; q.state = 'chase'; q.stateT = 0 }
      }
      if (p.hp <= 0) { eng.die('尸鼠陷阱'); return null }
    }
  }

  // ---- v13：梯子攀爬（贴近按住前进即竖直攀爬）----
  if (!eng.ride) eng.updateClimb(dt, mag)

  // ---- v7：垂直（跳跃/重力/高度档贴地）+ v13 深水浮沉 ----
  if (eng.ride || eng.climb || eng.onStairs) {
    // 垂直位置由电梯/梯子/可行走阶梯脚本驱动（onStairs 时由 updateStairs 绑定坡道高度）
  } else if (lq === 1) {
    // 深水中：下沉→池底；跳跃=向上划水；浮力趋向水面
    const FLOAT_Z = -0.5 // 浮起时水面下的平衡高度（头露出水面）
    if (eng.input.jump) {
      eng.input.jump = false
      p.vz = 2.6 // 划水上浮
      audio.swim()
    }
    p.vz -= 5.0 * dt // 水中重力（缓沉）
    if (p.z > FLOAT_Z && p.vz > 0) p.vz -= 9 * dt // 水面附近压回
    p.vz = Math.max(-1.5, Math.min(2.6, p.vz))
    p.z += p.vz * dt
    if (p.z <= -POOL_DEPTH) { p.z = -POOL_DEPTH; p.vz = 0 } // 池底
    if (p.z > 0.1) { p.z = 0.1; p.vz = 0 } // 不越出水面
    // 水下状态：屏气 + 低通滤波 + 气泡
    const sub = p.z + 1.55 < 0
    if (sub && !eng.wasSubmerged) eng.msg('水没过了头顶——视野变成浑浊的蓝。', 'system')
    eng.submerged = sub
    eng.wasSubmerged = sub
    audio.setUnderwater(sub)
    if (sub) {
      eng.breathT += dt
      eng.bubbleT -= dt
      if (eng.bubbleT <= 0) { eng.bubbleT = 0.5; eng.bubbleParticles(p.x, p.y, p.z + 1.3) }
      if (eng.breathT > 8 && !eng.dev.god) {
        p.hp -= 2.5 * dt * dm.dmg
        if (eng.statusMsgT.hunger <= 0) { eng.statusMsgT.hunger = 5; eng.msg('你快喘不上气了——快浮上去！', 'damage') }
        if (p.hp <= 0) { eng.die('溺亡在泳池里'); return null }
      }
    } else eng.breathT = Math.max(0, eng.breathT - dt * 2)
  } else {
    // v26：地面高度 = 地形地面 与 可站立结构顶面（桌/床/箱等低矮家具）取高者
    const g = Math.max(groundHeightAt(m, p.x, p.y, gBand), structStandTopAt(m, p.x, p.y, p.z, gBand))
    if (eng.input.jump && !introLock) {
      eng.input.jump = false
      // 贴地且未蹲伏才能起跳（蹲伏中无法发力）
      if (!p.crouching && p.vz <= 0 && p.z <= g + 0.02) {
        p.vz = 5.4 // 跳跃初速（重力 11 → 跳跃顶点 ≈1.32m，可跃上 +1.2m 高台）
        p.z = g + 0.02
        audio.footstep('concrete')
      }
    }
    if (p.z > g || p.vz > 0) {
      // 滞空：重力积分
      p.vz -= 11 * dt
      p.z += p.vz * dt
      if (p.z <= g) {
        // 落地（重着地震屏 + 脚步声）
        if (p.vz < -4) {
          eng.camShake = Math.min(1, eng.camShake + 0.18)
          const g0 = eng.levelDef.gen
          audio.footstep(g0 === 'garage' || g0 === 'grid' ? 'concrete' : g0 === 'pipes' ? 'metal' : 'carpet')
        }
        p.z = g; p.vz = 0
      }
    } else {
      p.z = g // 贴地跟随（坡道平滑上下）
      if (p.vz < 0) p.vz = 0
    }
  }
  // v26：天花板碰撞——跳跃/上浮头顶不穿天花板（室外/挑高区按各自顶高；风道底 1.15m）
  if (!eng.ride && !eng.climb) {
    const ceil = ceilingHeightAt(m, p.x, p.y, WALL_H[eng.levelDef.gen] ?? 3, band)
    const headH = p.crouching ? 0.95 : 1.55
    let maxZ = ceil - headH
    // v54c：跳跃顶穿楼板修复——band 随 z 即时翻转（越过 1.5/4.5 即按上层取天花），
    // 站家具起跳时 z 过 1.5 后 band 切到 2F、天花判定跳到 3F——人直接穿进 2F 板。
    // 修正：当前格有上层楼板而 z 尚未到达该层地面时，头顶按板底拦截（坡道格由 updateStairs 接管，豁免）
    const ti = Math.floor(p.y) * m.w + Math.floor(p.x)
    if ((m.stair[ti] & 7) === 0) {
      if (band >= 1 && m.up[ti] === 1 && p.z < FLOOR_H) maxZ = Math.min(maxZ, FLOOR_H - 0.35 - headH)
      if (band === 2 && m.up2[ti] === 1 && p.z < 2 * FLOOR_H) maxZ = Math.min(maxZ, 2 * FLOOR_H - 0.35 - headH)
    }
    if (p.z > maxZ) {
      p.z = Math.max(groundHeightAt(m, p.x, p.y, gBand), maxZ) // v54e：gBand——板下不得取上层板面当地面（防吸穿）
      if (p.vz > 0) p.vz = 0
    }
  }
  // v29：可行走灰色阶梯——走下去/走上去自动换层（覆盖本帧重力贴地结果）
  eng.updateStairs(dt)
  // 深坑坠落：跌入深渊（elev=4，洞底 -10m）持续下坠，超过 -4.5m 即死（环境抹除，无视无敌）
  if (!eng.ride && !eng.climb && p.z < -4.5 && !eng.dev.noclip) { eng.die('坠入深坑', true); return null }
  // 离水判定（走出液体格）
  if (eng.inLiquid !== 0 && m.liquid[tileI] === 0) {
    eng.inLiquid = 0
    eng.submerged = false
    eng.wasSubmerged = false
    eng.breathT = 0
    audio.setUnderwater(false)
  }
  return mag
}
// ---- v13：梯子攀爬 ----
// 贴近攀爬梯（base 在主层 / top 在上层），按住前进且面朝梯子即开始竖直攀爬，脚本化送达
export function updateClimb(eng: Engine, dt: number, mag: number) {
  const p = eng.player, m = eng.map!
  if (eng.climb) {
    const c = eng.climb
    p.z += c.dir * 1.9 * dt
    p.vz = 0
    if (c.dir === 1 && p.z >= FLOOR_H) {
      p.x = c.topX + 0.5; p.y = c.topY + 0.5; p.z = FLOOR_H
      eng.climb = null
      eng.climbCd = 0.9
      audio.footstep('metal')
      eng.msg('你爬上梯子，翻上了高处。', 'system')
    } else if (c.dir === -1 && p.z <= 0) {
      p.x = c.baseX + 0.5; p.y = c.baseY + 0.5; p.z = 0
      eng.climb = null
      eng.climbCd = 0.9
      audio.footstep('metal')
    }
    return
  }
  if (eng.climbCd > 0) { eng.climbCd -= dt; return }
  if (mag < 0.1) return
  const fx = Math.cos(p.facing), fy = Math.sin(p.facing)
  for (const s of m.structures) {
    if (s.kind !== 'ladder' || !s.data?.climb) continue
    const tx = s.data.tx as number, ty = s.data.ty as number
    const band = bandOfZ(p.z)
    if (band === 0) {
      const cx = s.x + 0.5, cy = s.y + 0.5
      const dx = cx - p.x, dy = cy - p.y
      const d = Math.hypot(dx, dy)
      // 接近环（0.2..1.0m）且面朝梯子中心；送达梯底（d<0.2）不会原地再触发
      if (d > 0.2 && d < 1.0 && (dx / d) * fx + (dy / d) * fy > 0.3) {
        eng.climb = { baseX: Math.floor(s.x), baseY: Math.floor(s.y), topX: tx, topY: ty, dir: 1 }
        audio.footstep('metal')
        return
      }
    } else {
      // 上层：站在顶格附近且面朝梯口方向（顶格→底格），按住前进即攀下；
      // 刚爬上来时面朝夹层内侧（背向梯口）不会误触发
      const cx = tx + 0.5, cy = ty + 0.5
      const dx = cx - p.x, dy = cy - p.y
      const d = Math.hypot(dx, dy)
      const bx = s.x + 0.5 - cx, by = s.y + 0.5 - cy
      const bd = Math.hypot(bx, by) || 1
      if (d < 1.0 && (bx / bd) * fx + (by / bd) * fy > 0.5) {
        eng.climb = { baseX: Math.floor(s.x), baseY: Math.floor(s.y), topX: tx, topY: ty, dir: -1 }
        audio.footstep('metal')
        return
      }
    }
  }
}
