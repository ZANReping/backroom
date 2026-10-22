import {bursterControlsPlayer} from './bursterAI'
import { wranglerControlsPlayer } from './wranglerAI'
import { nguithrSpeedMult } from './nguithrAI'
import { stepL7Events } from './l7Events'
import { stepThingWorld } from './thingAI'
import { tickL0 } from './l0State'
import { l0Sample } from '../world/l0Architecture'
import { stableAt } from './career'
import { dullerControlsPlayer } from './dullerAI'
import { clumpControlsPlayer } from './clumpAI'
import { nwControlsPlayer } from './watchAI'
import { armsControlsPlayer } from './armsAI'
import { l1DistanceScale } from '../world/l1Layout'
import { l1BuildingStyleAt } from '../world/l1Building'
// v53：移动/输入积分 + 垂直物理（固定子步积分主段、液体浮沉、跳跃重力、梯子攀爬）——
// 自 engine.ts step 内联段拆分，逻辑逐语句搬运；updateMovement 返回 null 表示本帧已死亡/终止（原 step 的 return）。
import { bandOfZ, bandOfPlayerZ, groundHeightAt, structStandTopAt, ceilingHeightAt, l11HeadCeilingAt, l11MapWater, floorHeight, liquidSurfaceH, POOL_DEPTH, FLOOR_H } from '../world/mapgen'
import { L11_WATER_SURFACE } from '../world/l11Hydrology'
import { integrateMove, resolvePlayerPenetration } from '../core/player'
import { WALL_H, look } from '../renderer/shared'
import { levelDefOf, NORMAL_LEVELS } from '../levels'
import { audio } from '../core/audio'
import { RemotePlayerViews } from '../renderer/remotePlayers' // v58：联机玩家碰撞查询
import type { Engine } from '../engine'
/** [thing] L7 贴崖自动上攀速度（米/秒）与本帧状态（单机玩家，模块级即可） */
export const L7_CLIFF_CLIMB = 3.4
let l7CliffClimb = false
import { l8AvenuePortalContact } from '../world/infiniteL8'
import { makeEntity } from '../entities'
import { integrateFlight } from '../core/flight'
import { ratProvoke } from './ratAI'
import { stepL11Canal } from './l11Canal'
import { stepL11Shaft } from './l11Exits'
import { updateSitting } from './seating'
import { camoSound } from './camoAI' // [L8-camo]
import { arachnidMoveMul } from './arachnidAI' // [L8-arachnid]

type DiffMult = { dmg: number; drain: number }

/** 移动主段（原 step「---- 移动 ----」至离水判定一整段；返回本帧输入向量模长 mag，null=中止本帧） */
export function updateMovement(eng: Engine, dt: number, dm: DiffMult, introLock: boolean): number | null {
  if (eng.levelDef.id === 7) stepL7Events(eng, dt)
  stepThingWorld(eng, dt) // [thing] 口臭气味 + 读焦油字
  audio.setDeepPressure(eng.levelDef.id === 7 && eng.submerged ? Math.min(1, Math.max(0, (-eng.player.z - 30) / 170)) : 0, dt)
  const p = eng.player, m = eng.map!
  const verticalStart=p.z
  // A scripted wall crossing owns position temporarily; gravity must not snap onto a wall/upper floor.
  if(bursterControlsPlayer(eng)||wranglerControlsPlayer(eng)||dullerControlsPlayer(eng)||clumpControlsPlayer(eng)||nwControlsPlayer(eng)||armsControlsPlayer(eng,dt)){eng.seating=null;return 0}
  if (eng.devEnabled && eng.dev.fly) {
    eng.seating = null
    const mag = Math.hypot(eng.input.mx,eng.input.my), divisor = Math.max(1,mag)
    const speed = (eng.input.sprint ? 6 : 3.4)*(eng.dev.speed ? 1.8 : 1)
    p.vz = 0; p.crouching = false; eng.stepAcc = 0
    if (!introLock) integrateFlight(m,p,eng.input.mx/divisor,eng.input.my/divisor,Number(eng.input.jump)-Number(eng.input.crouch),speed,dt,eng.moveIt,WALL_H[eng.levelDef.gen]??3,eng.dev.noclip)
    p.floor = bandOfPlayerZ(m,p.z,p.x,p.y)
    if (m.inf) { eng.updateInfiniteWindow(); tickL0(eng,dt) }
    const current = eng.map!
    const surface = liquidSurfaceH(current,Math.floor(p.x),Math.floor(p.y))
    eng.inLiquid = surface !== null && surface !== undefined && p.z < surface ? 1 : 0
    eng.submerged = eng.inLiquid === 1 && p.z+1.55 < surface!
    eng.wasSubmerged = eng.submerged
    if (!eng.submerged) eng.breathT = 0
    audio.setUnderwater(eng.submerged)
    eng.noise = Math.max(0,eng.noise-dt*1.2)
    eng.playerNoiseT = Math.max(0,eng.playerNoiseT-dt)
    return introLock ? 0 : mag
  }
  // ---- 移动 ----
  const mag = eng.seating ? 0 : Math.hypot(eng.input.mx, eng.input.my)
  let tileI = Math.floor(p.y) * m.w + Math.floor(p.x)
  const wet = m.wet[tileI] === 1
  // v13：楼层高度带（供 HUD/小地图与碰撞）
  // v56 七轮：band 按实际楼层数钳制——单层图站家具起跳越过 1.5m（BAND_MID）时 bandOfZ 翻到
  // 不存在的「上层带」：groundHeightAt(band=1)=FLOOR_H 会把玩家吸到 3.0m 并卡在天花板上方/
  // 嵌进楼板；钳制后单层恒为 0、双层 ≤1、三层 ≤2
  let canal=eng.levelDef.id===11?l11MapWater(m,p.x,p.y):null
  const band = canal?0:bandOfPlayerZ(m, p.z,p.x,p.y)
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
  // v66：L7 水墙内（或刚离开水墙、仍在海面以上下坠）时，无论高度带都按深水处理
  const l7WallLiquid = eng.levelDef.id === 7 && (eng.l7fx.wall || eng.l7fx.wallFall) && m.up[tileI] !== 1 && m.liquid[tileI] === 1
  const cityLiquid=()=>canal&&p.z<=canal.surface+.08&&(!canal.bridge||p.z<canal.bridge.bottom-.025)?1:0
  let lq = eng.levelDef.id===11?cityLiquid():band === 0 || l7WallLiquid ? m.liquid[tileI] : 0
  const syncLiquid=()=>{if (lq !== eng.inLiquid) {
    if (lq === 1 && eng.inLiquid !== 1) { // 入水扑通（无液/浅水→深水；L7 入口房间浅水洼走出门廊即触发）
      audio.splash()
      eng.splashParticles(p.x, p.y, eng.levelDef.id===11?L11_WATER_SURFACE:0)
      eng.msg('你跌进了水里——冰冷刺骨。', 'system')
    } else if (eng.inLiquid === 1 && lq !== 1) { // 出水
      audio.splash(0.5)
      eng.splashParticles(p.x, p.y, eng.levelDef.id===11?L11_WATER_SURFACE:0)
      eng.breathT = 0
      if(eng.levelDef.id===11){eng.submerged=false;eng.wasSubmerged=false;audio.setUnderwater(false)}
    }
    eng.inLiquid = lq
  }}
  syncLiquid()
  // v58：L7 门廊舱门异常重力拖拽演出——脚本化把玩家加速拖向落海点（期间锁定移动与垂直物理）
  if (eng.porchDrop) {
    const gd = eng.porchDrop
    gd.t += dt
    const k = Math.min(1, gd.t / 0.62)
    p.x = gd.sx + (gd.dx - gd.sx) * k * k // 加速曲线：起步缓慢、末尾猛冲——重力拖拽感
    p.y = gd.sy + (gd.dy - gd.sy) * k * k
    // 越过门洞后被异常重力往下拽：z 压向海面（修复：若保持 2F 高度，楼层带把落点判定为
    // 「上层板面 FLOOR_H」，玩家会悬在门口半空落不下去）；kd 末段才下沉，避免穿门廊地板
    const kd = Math.max(0, (k - 0.65) / 0.35)
    p.z = gd.sz + (0.6 - gd.sz) * kd * kd
    p.vz = 0
    if (k >= 1) {
      eng.porchDrop = null
      p.vz = -2.2 // 抛出门廊——之后由正常重力坠落入海（入水 splash 由液体状态切换触发）
    }
    eng.noise = Math.min(1, eng.noise + dt * 2) // 拖拽动静不小
    return mag
  }
  // v58：舱门已开时再度靠近门口即被自动拖出（无需交互）；刚沿绳爬回的冷却内不误触发
  if (eng.levelDef.id === 7 && eng.inLiquid !== 1 && !eng.climb && !eng.ride && eng.climbCd <= 0 && !introLock) {
    const door = m.structures.find((s) => s.kind === 'hoteldoor' && s.data?.l7porch === 1)
    if (door && !door.solid && door.data?.open === 1) {
      const inMouth = Math.abs(p.x - (door.x + door.w / 2)) <= 0.9 && p.y > door.y - 1.4 && p.y <= door.y + door.h + 0.05
      if (inMouth) forceL7PorchDrop(eng)
    }
  }
  // 蹲伏状态：按住蹲伏键，或身处低通道被风道强制压低头
  p.crouching = eng.input.crouch || m.crawl[tileI] === 1
  const l7Swim = lq === 1 && eng.levelDef.id === 7
  let speed = 3.4
  // v57o：L7 深水允许快速游泳（消耗体力，噪音更大——会吸引 tiny）
  const wantSprint = eng.input.sprint && (!p.crouching || l7Swim) && mag > 0.1 && p.stamina > 1 && (lq !== 1 || l7Swim)
  if (eng.input.sprint && mag > 0.1 && p.stamina <= 1) {
    // 体力耗尽提示（节流 4 秒）
    if (eng.statusMsgT.stamina <= 0) { eng.msg('体力耗尽——喘口气再游。', 'system'); eng.statusMsgT.stamina = 4 }
  }
  if (wantSprint) { speed = 6.0; p.stamina = Math.max(0, p.stamina - (l7Swim ? 16 : 22) * (eng.manmadeT > 0 ? 2 : 1) * dt) } // v51：人制品效应中体力消耗 ×2
  else p.stamina = Math.min(100, p.stamina + (p.coffeeT > 0 ? 24 : 12) * (eng.inOutpost ? 2 : 1) * (eng.manmadeT > 0 ? 0.5 : 1) * (p.infection >= 100 ? 0.9 : 1) * dt) // v51：人制品效应中体力恢复 ×0.5；v55：疫疾一阶起 ×0.9
  if (p.crouching && !l7Swim) speed *= 0.5 // 蹲伏减速（L7 潜泳由下潜逻辑负责，不再额外砍半）
    const carpet=l0Sample(m,p.x,p.y)
    speed*=(1-.10*(carpet?.arch??0))*(1-.40*(carpet?.red??0))
  if (wet && lq === 0) speed *= 0.55
  if (lq === 1 && l7Swim) speed *= 0.72 // v57o：开放水域游泳比室内水池更快
  else if (lq !== 0) speed *= 0.5 // v13：液体中移动减速
  if (p.slowT > 0) { p.slowT -= dt; speed *= 0.5 }
  if (eng.webbedT > 0) speed *= 0.5 // v51：缠丝麻痹——移动迟缓
  speed *= arachnidMoveMul(eng)
  speed *= nguithrSpeedMult(eng) // Nguithr'xurh 轻度镇静：移动略慢
  if (p.flashJamT > 0) p.flashJamT -= dt
  if (eng.dev.speed) speed *= 1.8
  if (eng.plantK > 0) speed *= 1 - 0.55 * Math.min(1, eng.plantK) // v30 植殖癌：行为逐渐僵硬
  if (p.infection >= 300) speed *= 0.8 // v55：疫疾三阶（并发期）——移速降低
  if (p.coffeeT > 0) p.coffeeT -= dt
  eng.statusMsgT.stamina -= dt
  eng.statusMsgT.hunger -= dt
  eng.statusMsgT.thirst -= dt
  // v30：植殖癌（Level 1 花园段）——行为逐渐僵硬、视野逐渐变绿，最终原地生根化为一株植物
  {
    const inf = m.inf
    const realGarden = eng.levelDef.id === 1 && !!inf &&
      l1BuildingStyleAt(inf.seed, inf.ox + p.x, inf.oy + p.y) === 'garden'
    // 开发者面板现象开关：可强制触发/屏蔽植殖癌（无视所在区段）
    const inGarden = (realGarden || eng.dev.phenOn.has('plantcancer')) && !eng.dev.phenOff.has('plantcancer')
    eng.inGardenEff = inGarden
    if (inGarden) eng.plantK = Math.min(1, eng.plantK + dt / 300)
    else eng.plantK = Math.max(0, eng.plantK - dt / 150)
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
        eng.msg('背包里的「一些口袋」在发烫。街区尽头，有什么东西同时转了过来。', 'damage')
        audio.aggro()
      } else {
        // 当前窗口没有邻里守望时也必须真正“引来”观察者/挺进者，而不是静默失效。
        for (let a = 0; a < 48; a++) {
          const ang = Math.random() * Math.PI * 2, r = 11 + Math.random() * 8
          const tx = Math.floor(p.x + Math.cos(ang) * r), ty = Math.floor(p.y + Math.sin(ang) * r)
          if (tx < 1 || ty < 1 || tx >= m.w - 1 || ty >= m.h - 1) continue
          const ii = ty * m.w + tx
          if (m.outdoor[ii] !== 1 || eng.entityWalkH(m, tx, ty, 0) === null) continue
          const e = makeEntity(Math.random() < 0.52 ? 'watcher' : 'strider', tx + 0.5, ty + 0.5)
          e.state = 'chase'; e.targetX = p.x; e.targetY = p.y; e.stateT = 0
          m.entities.push(e)
          eng.msg('背包里的「一些口袋」突然发烫。一个属于“邻里守望”的轮廓出现在街角。', 'damage')
          audio.aggro()
          break
        }
      }
    }
  }
  eng.statusMsgT.battery -= dt
  if (updateSitting(eng, dt)) return 0
  // v13：电梯乘降 / 梯子攀爬进行中：锁定水平移动（垂直由对应逻辑驱动）
  // v51：脚滑漂移量足够时，即使松开方向键也会继续滑动
  l7CliffClimb = false
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
    // v57t：L7 快速游泳严格朝准星 3D 方向冲刺（WASD 只负责是否冲刺，不再决定方向）；
    // 水平位移按 cos(pitch) 投影，垂直分量由下方按 sin(pitch) 驱动。
    const fastSwim = wantSprint && l7Swim
    const fastPitch = fastSwim ? Math.cos(look.pitch) : 1
    const dirX = fastSwim ? -Math.sin(look.yaw) * fastPitch : eng.input.mx * scale + eng.slipVx
    const dirY = fastSwim ? -Math.cos(look.yaw) * fastPitch : eng.input.my * scale + eng.slipVy
    const metric=eng.levelDef.id===1&&m.inf&&!eng.dev.noclip&&!stableAt(eng,p.x,p.y)?l1DistanceScale(m.inf.seed,p.x+m.inf.ox,p.y+m.inf.oy):1
    const moved = integrateMove(m, p, dirX, dirY, speed*metric, dt, eng.moveIt, { noclip: eng.dev.noclip, z: eng.onStairs ? 0 : p.z, crouch: p.crouching, band: eng.onStairs ? 0 : band })
    const movedDist = Math.hypot(moved.x, moved.y)/metric
    // [thing] L7 贴崖上攀：游泳时朝崖壁推进被海床挡住，就沿崖面自动往上游（不必另按上浮键），
    // 免得玩家贴在陡崖上以为卡死。只看前方 0.5m 海床确实高过脚底，结构/墙挡住不算。
    if (l7Swim && !eng.dev.noclip && !p.crouching) {
      const want = Math.hypot(dirX, dirY) * speed * dt
      const dl = Math.hypot(dirX, dirY) || 1
      // 前方 0.06m 处身体 8 个采样点里最高的海床（与 canOccupy 同一组采样），高过脚底就往上游
      const ax = p.x + dirX / dl * 0.06, ay = p.y + dirY / dl * 0.06, R = 0.32
      let ahead = -Infinity
      for (const [ox, oy] of [[-R, -R], [R, -R], [-R, R], [R, R], [-R, 0], [R, 0], [0, -R], [0, R], [dirX / dl * 0.5, dirY / dl * 0.5]])
        ahead = Math.max(ahead, floorHeight(m, ax + ox, ay + oy, 0))
      l7CliffClimb = want > 1e-4 && movedDist < want * 0.6 && ahead > p.z + 0.25
    } else l7CliffClimb = false
    // v58：联机玩家碰撞体积——与同层远端玩家软推挤，双方不可重叠
    if (eng.mpSession?.started) {
      for (const rp of RemotePlayerViews.nearby(eng, eng.mpSession)) {
        const ddx = p.x - rp.x, ddy = p.y - rp.y
        const dd = Math.hypot(ddx, ddy)
        if (dd > 1e-4 && dd < 0.64 && Math.abs(rp.z - p.z) < 1.6) {
          const push = 0.64 - dd
          p.x += (ddx / dd) * push
          p.y += (ddy / dd) * push
        }
      }
    }
    // v51 修复：删除移动方向覆写 p.facing 的旧行——facing 由 609 行每帧锁定为视角方向；
    // 移动中（尤其侧移/后退）被覆写成移动方向，导致 inView 视锥错位、交互提示一会有一会无
    eng.stepAcc += movedDist
    p.steps += movedDist
    if (eng.stepAcc > 0.9) {
      eng.stepAcc = 0
      const g0 = eng.levelDef.gen
      if (wet&&eng.player.level===0) audio.splash(.1)
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
    // 窗口平移会同步改写玩家局部坐标并重缝 m 数组；后续深坑/液体/离水判定必须使用新索引。
    tileI = Math.floor(p.y) * m.w + Math.floor(p.x)
    tickL0(eng,dt)
    // Entering a personal red room replaces the map. Do not finish this frame's
    // physics against the old shared map or its pre-teleport tile index.
    if(eng.map!==m)return mag
    tileI = Math.floor(p.y) * m.w + Math.floor(p.x)
  }
  // Water continues beneath roads. Refresh after movement/streaming so crossing
  // a bridge edge cannot switch a submerged player onto its road-height floor.
  if(eng.levelDef.id===11){canal=l11MapWater(m,p.x,p.y);lq=cityLiquid();if(canal)p.floor=0;syncLiquid()}

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
      p.flashJamT = Math.max(p.flashJamT, 2) // v79：夹颚上缠着电池线——电弧让手电短暂熄灭
      eng.emit({ kind: 'damage' })
      audio.hurt(); audio.spark()
      eng.msg('脚踝「咔」地一痛，缠在夹子上的电线噼啪炸出火花——你踩中了尸鼠设下的陷阱！附近的尸鼠把你当成了猎物。', 'damage')
      for (const q of m.entities) {
        if (q.dead || q.def.type !== 'corpserat') continue
        if (Math.hypot(q.x - p.x, q.y - p.y) < 14) ratProvoke(q)
      }
      if (p.hp <= 0) { eng.die('尸鼠陷阱'); return null }
    }
  }

  // ---- v13：梯子攀爬（贴近按住前进即竖直攀爬）----
  if (!eng.ride) eng.updateClimb(dt, mag)
  // A canal ladder can finish on dry land during this update. Refresh the water
  // query before swimming physics, otherwise its old surface pulls us back down.
  if(eng.levelDef.id===11){canal=l11MapWater(m,p.x,p.y);lq=cityLiquid();syncLiquid()}

  // ---- v7：垂直（跳跃/重力/高度档贴地）+ v13 深水浮沉 ----
  if (eng.ride || eng.climb || eng.onStairs) {
    // 垂直位置由电梯/梯子/可行走阶梯脚本驱动（onStairs 时由 updateStairs 绑定坡道高度）
  } else if (lq === 1) {
    // v57o 细化游泳：不按方向键时浮向水面（浮力平衡在 FLOAT_Z）；
    // 跳跃/上浮键=向上划水，下蹲键=主动下潜；非 L7 的小水池仍可下潜到池底。
    const l7Water = eng.levelDef.id === 7
    const upMax = l7Water ? 5.0 : 2.6
    const sinkMax = l7Water ? -6.5 : -1.5
    const waterG = l7Water ? 7.0 : 5.0
    const floorZ = canal?.bottom??(m.l7SeaTerrain ? floorHeight(m, p.x, p.y, 0) : -(m.seaFloor?.[tileI] || POOL_DEPTH))
    const fastSwimVertical = wantSprint && l7Swim && mag > 0.1
    // v66：L7 水面上限 = 海面 + 涌浪抬升；位于重力交界区水墙内时上限抬到墙顶（可顺着水墙游上去）
    const l7f = l7Water ? eng.l7fx : null
    const wall = l7f?.wall ?? null
    const surfZ = canal?canal.surface+.1:0.1 + (l7f ? Math.max(0, l7f.surgeH) : 0)
    const ceilZ = wall ? wall.top - 1.7 : surfZ
    if (l7f) {
      if (wall) l7f.wallFall = p.z > surfZ + 0.3
      // 墙内重力偏向墙体中面：轻微横向拉力（「侧着」漂在水墙里）
      if (wall && p.z > 0.2) { p.x -= wall.nx * wall.perp * 0.7 * dt; p.y -= wall.ny * wall.perp * 0.7 * dt }
    }
    const airborne = !!l7f && !wall && p.z > surfZ + 0.05
    if (airborne) {
      // 离开水墙时已高出海面：按正常重力坠回海里
      p.vz = Math.max(-28, p.vz - 11 * dt)
      p.z += p.vz * dt
      if (p.z <= surfZ) {
        p.z = surfZ; p.vz = 0; l7f!.wallFall = false
        audio.splash(); eng.splashParticles(p.x, p.y, 0)
        eng.msg('你从水墙上摔回了海面。', 'system')
      }
    } else
    // v57q：取消被动浮力——只有主动操作才会改变深度。
    // v57t 优先级：快速游泳（严格按准星俯仰）> 蹲伏下潜 > 跳跃上浮 > 中性悬浮。
    if (fastSwimVertical) {
      // 准星所指方向即完整 3D 方向：水平分量已按 cos(pitch)，垂直分量严格等于 speed·sin(pitch)。
      p.vz = speed * Math.sin(look.pitch)
      eng.rippleT = 0
    } else if (eng.input.crouch && p.z > floorZ + (canal?0:0.08)) {
      // 长按下蹲=持续垂直下潜（非冲刺状态）；先清掉残余上浮速度，避免「按下潜却仍在上升」
      if (p.vz > 0) p.vz = 0
      p.vz -= waterG * 1.25 * dt
      eng.rippleT = 0
    } else if (eng.input.jump) {
      // 长按跳跃=持续垂直上浮（非冲刺状态；不消费跳跃输入，松开才停止）
      p.vz = upMax
      eng.rippleT = 0
      audio.swim()
    } else {
      // Deep canals use the same neutral swimming buoyancy as other water.
      p.vz = l7Water && l7CliffClimb ? L7_CLIFF_CLIMB : 0
    }
    if (!airborne) {
      p.vz = Math.max(sinkMax, Math.min(upMax, p.vz))
      p.z += p.vz * dt
    }
    if (p.z <= floorZ) { p.z = floorZ; p.vz = 0 } // 池底/海床（v57o：L7 按瓦片深度）
    if (p.z > ceilZ && !airborne) { p.z = ceilZ; p.vz = 0 } // 不越出水面（v66：涌浪/水墙抬升上限）
    // v57t：水面的自然漂浮起伏——无垂直输入时身体随波浪在 -0.1~0.1m 间浮动，
    // 而不是固定在 0.1m 像踩在固体平面上。
    if (l7Water && !wall && !airborne && !eng.input.jump && !eng.input.crouch && !fastSwimVertical && p.z > -0.12) {
      p.z = Math.max(-0.1, Math.min(0.1,
        Math.sin(eng.time * 1.35 + p.x * 0.7 + p.y * 0.55) * 0.09
        + Math.sin(eng.time * 2.3 + p.y * 1.1) * 0.04)) + (l7f?.surgeH ?? 0)
      p.vz = 0
    }
    // 水下状态：屏气 + 低通滤波 + 气泡
    const sub = p.z + (canal&&p.crouching?1:1.55) < (canal?canal.surface:wall ? wall.top : l7f ? l7f.surgeH : 0)
    if (sub && !eng.wasSubmerged) eng.msg('水没过了头顶——视野变成浑浊的蓝。', 'system')
    eng.submerged = sub
    eng.wasSubmerged = sub
    audio.setUnderwater(sub)
    if (sub) {
      // v57p：开发者状态锁定=氧气永远保持满
      if (eng.dev.statLock) eng.breathT = 0
      else eng.breathT += dt
      eng.bubbleT -= dt
      if (eng.bubbleT <= 0) { eng.bubbleT = 0.5; eng.bubbleParticles(p.x, p.y, p.z + 1.3) }
      // v57o：L7 真实水深压力——超过 150m 后开始持续伤害，越深越快（深渊带是真正死区）
      if (l7Water && !eng.dev.god) {
        const depth = -p.z
        if (depth > 150) {
          p.hp -= Math.min(3, (depth - 150) * 0.008) * dt * dm.dmg
          if (eng.statusMsgT.hunger <= 0) {
            eng.statusMsgT.hunger = 6
            eng.msg(`水压碾得你全身作响——这里已经有 ${Math.round(depth)} 米深了。`, 'damage')
          }
          if (p.hp <= 0) { eng.die('被深海的水压碾碎'); return null }
        }
      }
      const limit = breathLimit(eng)
      if (eng.breathT > limit && !eng.dev.god) {
        p.hp -= 2.5 * dt * dm.dmg
        if (eng.statusMsgT.hunger <= 0) { eng.statusMsgT.hunger = 5; eng.msg('你快喘不上气了——快浮上去！', 'damage') }
        if (p.hp <= 0) { eng.die('溺亡在水中'); return null }
      }
    } else eng.breathT = Math.max(0, eng.breathT - dt * 3) // 浮出水面快速恢复
  } else {
    // v26：地面高度 = 地形地面 与 可站立结构顶面（桌/床/箱等低矮家具）取高者
    const g = Math.max(groundHeightAt(m, p.x, p.y, gBand,p.z), structStandTopAt(m, p.x, p.y, p.z, gBand))
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
          camoSound(eng, p.x, p.y, 7) // [L8-camo] 跳跃落地声（只进迷彩爬行者的声音队列，不改其他实体的听觉）
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
    const headH = p.crouching ? 0.95 : 1.55
    const ceil = Math.min(ceilingHeightAt(m,p.x,p.y,WALL_H[eng.levelDef.gen]??3,band),eng.levelDef.id===11?l11HeadCeilingAt(m,p.x,p.y,verticalStart,headH):Infinity)
    let maxZ = ceil - headH
    // v54c：跳跃顶穿楼板修复——band 随 z 即时翻转（越过 1.5/4.5 即按上层取天花），
    // 站家具起跳时 z 过 1.5 后 band 切到 2F、天花判定跳到 3F——人直接穿进 2F 板。
    // 修正：当前格有上层楼板而 z 尚未到达该层地面时，头顶按板底拦截（坡道格由 updateStairs 接管，豁免）
    const ti = Math.floor(p.y) * m.w + Math.floor(p.x)
    if (eng.levelDef.id!==11&&(m.stair[ti] & 7) === 0) {
      if (band >= 1 && m.up[ti] === 1 && p.z < FLOOR_H) maxZ = Math.min(maxZ, FLOOR_H - 0.35 - headH)
      if (band === 2 && m.up2[ti] === 1 && p.z < 2 * FLOOR_H) maxZ = Math.min(maxZ, 2 * FLOOR_H - 0.35 - headH)
    }
    if (p.z > maxZ) {
      p.z = Math.max(groundHeightAt(m, p.x, p.y, gBand,verticalStart), maxZ) // v54e：gBand——板下不得取上层板面当地面（防吸穿）
      if (p.vz > 0) p.vz = 0
    }
  }
  // Keep vertical motion/late model bounds from leaving an idle player inside
  // a prop. Scripted seating, climbing and lifts retain position ownership.
  if(!eng.dev.noclip&&!eng.seating&&!eng.ride&&!eng.climb&&!eng.onStairs&&!eng.porchDrop)
    resolvePlayerPenetration(m,p,.32,{z:p.z,band:bandOfPlayerZ(m,p.z,p.x,p.y),crouch:p.crouching})
  // v29：可行走灰色阶梯——走下去/走上去自动换层（覆盖本帧重力贴地结果）
  eng.updateStairs(dt)
  // L8 第九大道末端是可穿行的狭窄洞口：玩家身体碰到洞口平面即自动前往 L9，
  // 不再需要对着一块隐形交互点按 E。判定沿大道末段切线展开，并与真实洞颈宽度一致。
  if (eng.levelDef.id === 8 && m.inf && !eng.transition) {
    const avenueExit = m.exits.find((e) => e.def.kind === 'ninthroad')
    if (avenueExit) {
      const wx = p.x + m.inf.ox, wy = p.y + m.inf.oy
      if (l8AvenuePortalContact(m.inf.seed, wx, wy)) {
        avenueExit.discovered = true
        eng.takeExit(avenueExit.def)
        return mag
      }
    }
  }
  // L6 地表塌陷坑不致死：落到阈值后切入同一无限地图的地下 FloorBand。
  if (eng.levelDef.id === 6 && m.elev[tileI] === 4 && p.z < -3.6 && p.vz < -0.1 && !eng.dev.noclip) {
    if (eng.switchL6Floor(-1, 'pit')) return mag
    // 极端情况下附近地下廊道没有安全落点，仍按真正坠入虚空处理，避免无限下坠。
    eng.die('坠入深坑', true)
    return null
  }
  // 普通层跌到 -4.5m 以下才死亡。L6 的合法地下层地面就在 -5m，不能套用这条规则；
  // L6 地表深坑已在上方完成“切到地下/失败才死亡”的完整分派。
  // 任何合法深水体都由游泳/溺水规则接管；不能把 L8 地下湖等深于 4.5m 的池底误判成虚空坠落。
  if (!m.hasUnderground && !eng.ride && !eng.climb && p.z < -4.5 && !eng.dev.noclip && (eng.levelDef.id===11?cityLiquid()!==1:m.liquid[tileI]!==1)) { eng.die('坠入深坑', true); return null }
  // 离水判定（走出液体格）
  if (eng.inLiquid !== 0 && (eng.levelDef.id===11?cityLiquid()===0:m.liquid[tileI] === 0)) {
    eng.inLiquid = 0
    eng.submerged = false
    eng.wasSubmerged = false
    eng.breathT = 0
    audio.setUnderwater(false)
  }
  stepL11Canal(eng,dt)
  stepL11Shaft(eng)
  return mag
}
/** v57o：水下屏气上限（秒）。L7 海面空气可让人长时屏息；潜水面罩进一步延长。 */
export function breathLimit(eng: Engine): number {
  const base = eng.levelDef.id === 7 ? 35 : 8
  return eng.player.equip.head?.type === 'divemask' ? base + 25 : base
}

// ---- v57m：L7 门廊舱门开启后的强制落海 ----
// 舱门一旦打开，门边的人会立刻被海侧重力捕获；连续检测保证「后来靠近」的玩家同样会被推出去。
// v58：不再瞬间传送——进入 porchDrop 拖拽演出（updateMovement 推进：加速拖向舱门落点再抛下）。
export function forceL7PorchDrop(eng: Engine): boolean {
  if (eng.levelDef.id !== 7) return false
  const p = eng.player, m = eng.map!
  const door = m.structures.find((s) => s.kind === 'hoteldoor' && s.data?.l7porch === 1)
  if (!door || door.solid || !door.data?.open) return false
  if (eng.inLiquid === 1 || eng.porchDrop || eng.climb || eng.ride) return false // 已在海中/演出中/脚本移动中
  const dx = p.x - (door.x + door.w / 2)
  const dy = p.y - (door.y + door.h / 2)
  // 只捕获舱门北侧门廊里足够近的人；房内远处开门不会隔空被拽走
  if (Math.hypot(dx, dy) > 2.6 || p.y > door.y + door.h - 0.2) return false
  eng.porchDrop = {
    t: 0, sx: p.x, sy: p.y, sz: p.z,
    dx: door.x + Number(door.data?.dropDX ?? 0) + 0.5,
    dy: door.y + Number(door.data?.dropDY ?? 1) + 0.5,
  }
  audio.swing() // 拖拽风声
  if (!door.data?.forced) {
    door.data = { ...door.data, forced: 1 }
    eng.msg('门刚开了一条缝，海侧的重力就抓住了你——你被甩出了门廊！', 'damage')
  } else {
    eng.msg('海侧的重力再次抓住了你。', 'damage') // v58：已开过的舱门，靠近即被拖出（无需交互）
  }
  return true
}

// ---- v13：梯子攀爬 ----
// 贴近攀爬梯（base 在主层 / top 在上层），按住前进且面朝梯子即开始竖直攀爬，脚本化送达
export function updateClimb(eng: Engine, dt: number, mag: number) {
  const p = eng.player, m = eng.map!
  if (eng.climb) {
    const c = eng.climb
    const z0 = c.zBase ?? 0
    const z1 = c.zTop ?? FLOOR_H
    p.z += c.dir * 1.9 * dt
    p.vz = 0
    if (c.dir === 1 && p.z >= z1) {
      p.x = c.topX + 0.5; p.y = c.topY + 0.5; p.z = z1
      eng.climb = null
      eng.climbCd = 0.9
      audio.footstep('metal')
      eng.msg(c.rope ? '你顺着尼龙绳爬回了门廊。' : '你爬上梯子，翻上了高处。', 'system')
    } else if (c.dir === -1 && p.z <= z0) {
      p.x = c.baseX + 0.5; p.y = c.baseY + 0.5; p.z = z0
      eng.climb = null
      eng.climbCd = 0.9
      audio.footstep('metal')
    }
    return
  }
  if (eng.climbCd > 0) { eng.climbCd -= dt; return }
  if (mag < 0.1) return
  const fx = Math.cos(p.facing), fy = Math.sin(p.facing)

  if(eng.levelDef.id===11)for(const s of m.structures){
    if(s.kind!=='l11_canal_ladder'||!s.data?.canalAccess)continue
    const x=s.x+s.w/2,y=s.y+s.h/2,dx=Number(s.data.climbDX),dy=Number(s.data.climbDY),length=Math.hypot(dx,dy)
    if(eng.inLiquid!==1||p.z<Number(s.data.climbBase)-.1||p.z>Number(s.data.climbTop)||Math.hypot(p.x-x,p.y-y)>1.1||(fx*dx+fy*dy)/length<.35)continue
    eng.climb={baseX:x-.5,baseY:y-.5,topX:x+dx-.5,topY:y+dy-.5,dir:1,zBase:Number(s.data.climbBase),zTop:Number(s.data.climbTop)}
    p.x=x;p.y=y;p.vz=0;eng.msg('你抓住岸边的梯子，开始向上攀爬。','system');return
  }

  // 常规攀爬梯（主层 ↔ 上层）
  for (const s of m.structures) {
    if (s.kind !== 'ladder' || !s.data?.climb) continue
    const tx = s.data.tx as number, ty = s.data.ty as number
    const band = bandOfPlayerZ(m, p.z,p.x,p.y)
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

  // v57m：L7 门廊尼龙绳——部署后可从海面沿绳爬回门廊出口，也可从门廊沿绳下降
  for (const s of m.structures) {
    if (s.kind !== 'ropeanchor' || s.data?.deployed !== 1) continue
    const topX = s.x + Number(s.data.ropeDX ?? 0)
    const topY = s.y + Number(s.data.ropeDY ?? 0)
    const baseX = s.x + Number(s.data.baseDX ?? 0)
    const baseY = s.y + Number(s.data.baseDY ?? 1)
    const zTop = floorHeight(m, topX + 0.5, topY + 0.5, 1) // v57m：L7 门廊出口位于 2F
    const zBase = Math.max(0.03, liquidSurfaceH(m, baseX, baseY) ?? 0.03)
    const band = bandOfPlayerZ(m, p.z,p.x,p.y)
    if (band === 0 && eng.inLiquid === 1) {
      // 水中：靠近绳底并面朝顶部绳口 → 向上攀
      const cx = baseX + 0.5, cy = baseY + 0.5
      const dx = cx - p.x, dy = cy - p.y
      const d = Math.hypot(dx, dy)
      if (d > 0.15 && d < 1.4 && (dx / d) * fx + (dy / d) * fy > 0.35) {
        eng.climb = { baseX, baseY, topX, topY, dir: 1, zBase, zTop, rope: 1 }
        audio.footstep('metal')
        return
      }
    } else if (band === 1 && p.z >= zTop - 0.3) {
      // 2F 门廊上：靠近顶部绳口并面朝绳底 → 向下攀
      const cx = topX + 0.5, cy = topY + 0.5
      const dx = cx - p.x, dy = cy - p.y
      const d = Math.hypot(dx, dy)
      const bx = baseX + 0.5 - cx, by = baseY + 0.5 - cy
      const bd = Math.hypot(bx, by) || 1
      if (d < 1.2 && (bx / bd) * fx + (by / bd) * fy > 0.5) {
        eng.climb = { baseX, baseY, topX, topY, dir: -1, zBase, zTop, rope: 1 }
        audio.footstep('metal')
        return
      }
    }
  }
}
