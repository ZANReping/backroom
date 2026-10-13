// v63：钝人（Entity 6）专属 AI——依据中文维基 Entity 6：
//  · 胆怯：会逃离任何主动靠近它的东西；被流浪者「注意到」（直视）时狩猎战术失效，悄无声息地逃走。
//  · 隔墙狩猎：在与猎物一墙之隔的走廊里潜伏，把修长的手臂「切」出墙体，抓住另一边的猎物拖进自己所在的走廊。
//  · 拖入之后做什么未知：游戏里表现为把人按在地上撕扯片刻，随即因被看清而逃走。
//  · 携物：有时手里攥着看似随机的物品，带着它照样急速奔跑；被杀死时掉落。
//  · 厌恶杏仁水：避开地上的杏仁水；饮用杏仁水后一段时间内不会被它抓取，附近的钝人会逃离；
//    用杏仁水滋它会让它缩回墙里逃走；身上带着杏仁水时它伸手前会犹豫（前摇更长，更容易被你注意到）。
//  · 受到攻击（未在抓取中）会逃离威胁；体质异常强壮——拖拽无法挣脱，只能靠攻击它或杏仁水打断。
// 运行时状态保存在 e.dl（不入存档/联机）。
import { audio } from '../core/audio'
import { ITEMS } from '../content/items'
import type { Entity } from '../entities'
import type { Engine } from '../engine'
import { canOccupy } from '../core/player'
import { bandOfPlayerZ, floorHeight, wallAt, structBlocksSight, structColliders } from '../world/mapgen'

export type DullerPhase = 'roam' | 'lurk' | 'reach' | 'drag' | 'hold' | 'flee'
export interface DullerState {
  phase: DullerPhase
  t: number
  spook: number // 受惊冷却：期间不再对玩家狩猎
  lastHp: number
  carry?: string // 携带的随机物品
  // 潜伏点（墙另一侧）与拖拽终点
  lx: number; ly: number; retarget: number
  wait: number
  fromX: number; fromY: number // 抓取时玩家位置（拖拽起点/打断时回弹点）
  toX: number; toY: number // 拖拽终点（钝人所在走廊里可站立的点）
  grabZ?: number
  wallX?: number; wallY?: number; wallAngle?: number // World position and outward wall normal.
  hitT: number
  // 渲染姿态量
  reach: number // 0..1 手臂伸出程度
  reachLen: number // 手臂需要伸到的水平距离（米）
  wallD: number // 沿朝向到墙面的距离（米；<0 表示没有墙）
  sway: number // 摇晃幅度
  run: number // 奔逃姿态
}

const CARRY_POOL = ['canned', 'battery', 'bandage', 'glowstick', 'fuse', 'coffee', 'flashlight']
const newFrame = (map: Engine['map']) => ({ map, px: 0, py: 0, vx: 0, vy: 0, init: false, scentT: 0, told: new Set<string>(), captor: undefined as Entity | undefined })
let frames = new WeakMap<Engine, ReturnType<typeof newFrame>>()
function frameFor(eng: Engine) {
  let f = frames.get(eng)
  if (!f || f.map !== eng.map) { f = newFrame(eng.map); frames.set(eng,f) }
  return f
}
const origin = (eng: Engine) => [eng.map?.inf?.ox ?? 0, eng.map?.inf?.oy ?? 0] as const
export function beginDullerFrame(eng: Engine, dt: number) {
  const F = frameFor(eng), [ox,oy] = origin(eng)
  const p = eng.player
  const x=p.x+ox,y=p.y+oy
  if (!F.init || dt <= 0) { F.px = x; F.py = y; F.init = true }
  const vx = dt > 0 ? (x - F.px) / dt : 0, vy = dt > 0 ? (y - F.py) / dt : 0
  F.vx = F.vx * 0.7 + Math.max(-12, Math.min(12, vx)) * 0.3
  F.vy = F.vy * 0.7 + Math.max(-12, Math.min(12, vy)) * 0.3
  F.px = x; F.py = y
  F.scentT = Math.max(0, F.scentT - dt)
}
/** 测试/重开关卡用：清除一次性提示与杏仁水气味 */
export function resetDullerFrame(eng?: Engine) { if(eng)frames.delete(eng);else frames=new WeakMap() }
const once = (eng: Engine, key: string, text: string, kind: 'system' | 'damage' = 'system') => { const F=frameFor(eng); if (!F.told.has(key)) { F.told.add(key); eng.msg(text, kind) } }
const setPhase = (s: DullerState, ph: DullerPhase) => { if (s.phase !== ph) { s.phase = ph; s.t = 0 } }

export function initDuller(eng: Engine, e: Entity, carry?: string | null): DullerState {
  const [ox,oy]=origin(eng)
  let c = carry === null ? undefined : carry
  if (carry === undefined) {
    const r = ((e.id * 2654435761) >>> 0) / 4294967296 // 按实体 id 确定性：约 40% 携带随机物品
    if (r < 0.4) { const pick = CARRY_POOL[Math.floor(r / 0.4 * CARRY_POOL.length)]; if (ITEMS[pick]) c = pick }
  }
  const s: DullerState = { phase: 'roam', t: 0, spook: 0, lastHp: Math.max(e.hp,e.def.hp), carry: c, lx: e.x+ox, ly: e.y+oy, retarget: 0, wait: 0, fromX: 0, fromY: 0, toX: 0, toY: 0, hitT: 0, reach: 0, reachLen: 1, wallD: -1, sway: 1, run: 0 }
  e.dl = s
  return s
}

/** 饮用杏仁水（inventory 钩子）：60 秒内钝人不会抓你，靠近的会逃走；正被抓着时立刻挣脱 */
export function dullerAlmondScent(eng: Engine) {
  frameFor(eng).scentT = 60
  for (const e of eng.map?.entities ?? []) {
    if (e.dead || e.def.type !== 'duller' || Math.abs(e.z-eng.player.z)>=1.4) continue
    if(!e.dl)initDuller(eng,e)
    const s=e.dl!
    if (s.phase === 'drag' || s.phase === 'hold' || s.phase === 'reach') {
      flee(eng, e, s, 20)
      eng.msg('甜腻的杏仁水气味一冒出来，那双灰色的手就像被烫到一样松开、缩了回去。', 'system')
    }else if(Math.hypot(e.x-eng.player.x,e.y-eng.player.y)<8)flee(eng,e,s,10)
  }
}
/** 杏仁水滋中（combat 钩子） */
export function dullerSquirted(eng: Engine, e: Entity) {
  const s = e.dl ?? initDuller(eng, e)
  flee(eng, e, s, 30)
  once(eng, 'dsquirt', '杏仁水溅在钝人身上——它像被烫伤一样抽搐着缩回墙里，无声地逃远了。')
}
/** 击杀掉落携带物（combat.killCheck 钩子）；返回掉落的物品类型 */
export function dullerDrop(e: Entity): string | undefined {
  const c = e.dl?.carry
  if (e.dl) e.dl.carry = undefined
  return c
}

function flee(eng: Engine, e: Entity, s: DullerState, spook: number) {
  releaseDullerPlayer(eng,e)
  setPhase(s, 'flee'); s.spook = Math.max(s.spook, spook); s.wait = 0
}

/** 杏仁水驱避区：地上的杏仁水（含投掷落地）周围 3 米 */
function almondNear(eng: Engine, x: number, y: number, r = 3): boolean {
  for (const it of eng.map?.items ?? []) if (it.type === 'almond' && Math.abs((it.z??0)-eng.player.z)<1 && Math.hypot(it.x - x, it.y - y) < r) return true
  return false
}

/** 玩家能否站在 (x,y)：瓦片可走 + 真实碰撞体积（模拟地图无 tiles 时只看瓦片） */
function standable(eng: Engine, x: number, y: number, z=eng.player.z): boolean {
  const m = eng.map!, p = eng.player
  const band = m.tiles ? bandOfPlayerZ(m, z) : 0
  const h=eng.entityWalkH(m, Math.floor(x), Math.floor(y), band)
  if (h === null || Math.abs(h-z)>.4) return false
  return !m.tiles || (m.elev[Math.floor(y)*m.w+Math.floor(x)]!==4 && canOccupy(m, x, y, undefined, { z, band, crouch:p.crouching }))
}

/** Current captive is exclusive. Safe endpoints also protect saves made mid-wall. */
export function dullerSafePosition(eng: Engine, e=frameFor(eng).captor) {
  const s=e?.dl
  if(!s || (s.phase!=='drag'&&s.phase!=='hold'))return undefined
  const [ox,oy]=origin(eng),z=s.grabZ??eng.player.z
  const ends=s.phase==='hold'?[[s.toX,s.toY],[s.fromX,s.fromY]]:[[s.fromX,s.fromY],[s.toX,s.toY]]
  for(const [wx,wy] of ends){
    const x=wx-ox,y=wy-oy
    if(standable(eng,x,y,z))return {x,y,z}
    for(let r=.25;r<=2;r+=.25)for(let i=0;i<16;i++){
      const nx=x+Math.cos(i*Math.PI/8)*r,ny=y+Math.sin(i*Math.PI/8)*r
      if(standable(eng,nx,ny,z))return {x:nx,y:ny,z}
    }
  }
  return undefined
}
export function releaseDullerPlayer(eng: Engine, e=frameFor(eng).captor) {
  if(!e?.dl)return
  const F=frameFor(eng),s=e.dl
  if(F.captor && F.captor!==e)return
  if((s.phase==='drag'||s.phase==='hold') && Math.abs(eng.player.z-(s.grabZ??eng.player.z))<.5){
    const safe=dullerSafePosition(eng,e)
    if(safe)Object.assign(eng.player,safe,{vz:0})
  }
  if(s.phase==='drag'||s.phase==='hold'){setPhase(s,'flee');s.spook=Math.max(s.spook,20);eng.player.slowT=0}
  F.captor=undefined
}
export function dullerControlsPlayer(eng: Engine): boolean {
  const e=frameFor(eng).captor,s=e?.dl
  if(!e||!s||!['drag','hold'].includes(s.phase))return false
  if(e.dead||e.hp<s.lastHp||e.stunT>0||!eng.map?.entities.includes(e)||eng.dev.frozenAI||eng.dev.invisible||eng.player.hp<=0||Math.abs(eng.player.z-(s.grabZ??eng.player.z))>.5){releaseDullerPlayer(eng,e);return false}
  eng.player.vz=0
  return true
}
export function dullerHurt(eng: Engine,e:Entity) {
  if(e.dead||e.def.type!=='duller')return
  const s=e.dl??initDuller(eng,e)
  if(e.hp<s.lastHp){flee(eng,e,s,25);s.lastHp=e.hp}
}
export function dullerDropPosition(eng:Engine,e:Entity){
  for(let r=0;r<=6;r+=.5)for(let i=0;i<16;i++){
    const x=e.x+Math.cos(i*Math.PI/8)*r,y=e.y+Math.sin(i*Math.PI/8)*r
    if(standable(eng,x,y,e.z))return {x,y,z:eng.map?.tiles?floorHeight(eng.map,x,y,bandOfPlayerZ(eng.map,e.z)):e.z}
  }
  return {x:e.x,y:e.y,z:e.z}
}
/** 寻找墙另一侧的潜伏点：离玩家 1.5~2.5 米、与玩家之间被墙隔开、本身可站立 */
function findLurk(eng: Engine, e: Entity): [number, number] | null {
  const p = eng.player, m = eng.map!
  let best: [number, number] | null = null, bestScore = Infinity
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2
    for (const r of [1.6, 2.0, 2.4]) {
      const x = p.x + Math.cos(a) * r, y = p.y + Math.sin(a) * r
      if (x < 0.3 || y < 0.3 || (m.w && (x > m.w - 0.3 || y > m.h - 0.3))) continue
      if (!standable(eng, x, y)) continue
      if (!wallHit(eng,p.x,p.y,x,y)?.wall) continue // Real walls/pillars, not a low cabinet or generator.
      if (almondNear(eng, x, y)) continue
      // 越靠近钝人当前位置越好；更偏好正好在墙后（2m 左右）
      const sc = Math.hypot(x - e.x, y - e.y) + Math.abs(r - 2) * 0.8
      if (sc < bestScore) { bestScore = sc; best = [x, y] }
    }
  }
  return best
}

/** First wall face from the player; world-independent local sampling includes thin colliders. */
function wallHit(eng:Engine,x0:number,y0:number,x1:number,y1:number){
  const m=eng.map!,p=eng.player,d=Math.hypot(x1-x0,y1-y0)
  if(!m.tiles)return eng.los(x0,y0,x1,y1)?null:{x:(x0+x1)/2,y:(y0+y1)/2,nx:Math.sign(x0-x1),ny:0,wall:true}
  const band=bandOfPlayerZ(m,p.z),ux=(x1-x0)/Math.max(.001,d),uy=(y1-y0)/Math.max(.001,d)
  const blocked=(x:number,y:number)=>wallAt(m,Math.floor(x),Math.floor(y),band)||structBlocksSight(m,x,y,p.z+1.25,band)
  for(let t=.04;t<d;t+=.04){
    const x=x0+ux*t,y=y0+uy*t
    if(!blocked(x,y))continue
    let lo=Math.max(0,t-.04),hi=t
    for(let i=0;i<7;i++){const mid=(lo+hi)/2;if(blocked(x0+ux*mid,y0+uy*mid))hi=mid;else lo=mid}
    const hx=x0+ux*hi,hy=y0+uy*hi
    const gx=Number(blocked(hx+.02,hy))-Number(blocked(hx-.02,hy))
    const gy=Number(blocked(hx,hy+.02))-Number(blocked(hx,hy-.02))
    const nx=gx?-Math.sign(gx):gy?0:-Math.sign(ux),ny=gy&&!gx?-Math.sign(gy):0
    const wall=wallAt(m,Math.floor(x),Math.floor(y),band)||m.structures.some(s=>{
      if(!s.solid||(s.floor??0)!==band||s.data?.noSight===1||!(s.data?.l0Wall||['pillar','cubicle','hoteldoor','glassdoor','glasswin','windowblack','windowtrap'].includes(s.kind)))return false
      const base=floorHeight(m,s.x+s.w/2,s.y+s.h/2,band)
      return structColliders(s,m).some(b=>x>=b.x0&&x<=b.x1&&y>=b.y0&&y<=b.y1&&p.z+1.25>=base+(b.bottom??0)&&p.z+1.25<=base+b.top)
    })
    return {x:hx+nx*.012,y:hy+ny*.012,nx,ny,wall}
  }
  return null
}

/** 沿 (e→player) 方向估算墙面距离：从 e 出发步进，找到第一个「玩家可见」的点前的墙面 */
function wallDist(eng: Engine, e: Entity, d: number): number {
  const p = eng.player
  const s=e.dl!,[ox,oy]=origin(eng)
  // Keep the entry face fixed while the camera passes through the wall.
  if((s.phase==='drag'||s.phase==='hold')&&s.wallX!==undefined&&s.wallY!==undefined)
    return Math.hypot(s.wallX-ox-e.x,s.wallY-oy-e.y)
  if (d < 0.05) return -1
  if(eng.map?.tiles){
    const hit=wallHit(eng,p.x,p.y,e.x,e.y)
    if(!hit){s.wallX=undefined;s.wallY=undefined;s.wallAngle=undefined;return -1}
    s.wallX=hit.x+ox;s.wallY=hit.y+oy;s.wallAngle=Math.atan2(hit.ny,hit.nx)
    return Math.hypot(hit.x-e.x,hit.y-e.y)
  }
  const ux = (p.x - e.x) / d, uy = (p.y - e.y) / d
  for (let s = 0.2; s < d; s += 0.1) {
    if (eng.los(p.x, p.y, e.x + ux * s, e.y + uy * s)) return Math.max(0.15, s - 0.05)
  }
  return -1
}

export function updateDuller(eng: Engine, e: Entity, dt: number, d: number, dmgMult: number) {
  const F=frameFor(eng),[ox,oy]=origin(eng)
  const p = eng.player, def = e.def
  const s = e.dl ?? initDuller(eng, e)
  s.t += dt; s.spook = Math.max(0, s.spook - dt); s.retarget -= dt
  const hurt = e.hp < s.lastHp
  s.lastHp = e.hp
  const zOk = Math.abs(e.z - p.z) < 1.4
  const los = zOk && d < 20 && !wallHit(eng,p.x,p.y,e.x,e.y)
  // 「注意到它」：视线内直视；或它正把手伸出墙时朝它的方向看
  const view = eng.viewAngle(e.x, e.y)
  const noticed = zOk && ((los && d < 9 && view < 0.42) || ((s.phase === 'reach' || s.phase === 'lurk') && s.reach > 0.15 && d < 5 && view < 0.55))
  // 「刻意靠近」：在它看得见的情况下朝它走/跑过去
  const toX = (e.x - p.x) / Math.max(0.1, d), toY = (e.y - p.y) / Math.max(0.1, d)
  const approach = los && d < 8 && F.vx * toX + F.vy * toY > 1.1
  const scented = F.scentT > 0
  const invisible = !!eng.dev?.invisible
  let speed = 0, tx = e.x, ty = e.y, face: [number, number] | null = null

  if((s.phase==='reach'||s.phase==='drag'||s.phase==='hold') && (invisible||!zOk||p.hp<=0||e.stunT>0))flee(eng,e,s,12)
  if((s.phase==='drag'||s.phase==='hold')&&F.captor&&F.captor!==e)flee(eng,e,s,12)

  if (hurt && s.phase !== 'flee') {
    flee(eng, e, s, 25)
    once(eng, 'dhurt', '钝人挨了一下就松手了——它不跟你缠斗，一转身没进墙里。')
  }

  switch (s.phase) {
    case 'roam': {
      e.state = 'wander'
      if (e.stateT <= 0 || Math.hypot(e.targetX - e.x, e.targetY - e.y) < 0.4) eng.wanderTarget(e)
      tx = e.targetX; ty = e.targetY; speed = def.speed * 0.45
      if (almondNear(eng, e.x, e.y)) { const a = Math.max(0.1, d); tx = e.x + (e.x - p.x) / a * 3; ty = e.y + (e.y - p.y) / a * 3 }
      if (!invisible && s.spook <= 0 && !scented && d < 14 && zOk) {
        if (noticed || approach) { flee(eng, e, s, 12); break }
        setPhase(s, 'lurk'); s.retarget = 0
      }
      break
    }
    case 'lurk': {
      e.state = 'investigate'
      if (invisible || d > 18 || !zOk) { setPhase(s, 'roam'); break }
      if (noticed || approach) {
        flee(eng, e, s, 15)
        once(eng, 'dnotice', '你注意到了它——那个没有脸的灰色人形僵了一瞬，随即一声不响地溜走了。')
        break
      }
      if (scented && d < 8) { flee(eng, e, s, 10); once(eng, 'dscent', '钝人在杏仁水的气味边缘停住，转身走开了。'); break }
      if (s.retarget <= 0) {
        const lp = findLurk(eng, e)
        s.retarget = 0.6
        if (lp) { s.lx = lp[0]+ox; s.ly = lp[1]+oy } else { s.lx = NaN }
      }
      if (Number.isNaN(s.lx)) {
        // 附近没有可以隔墙下手的位置：远远躲在视线外跟着
        if (los) { const a = Math.max(0.1, d); tx = e.x + (e.x - p.x) / a * 2; ty = e.y + (e.y - p.y) / a * 2; speed = def.speed * 0.5 }
        else if (d > 7) { tx = p.x; ty = p.y; speed = def.speed * 0.6 }
        break
      }
      const dl = Math.hypot(s.lx-ox - e.x, s.ly-oy - e.y)
      if (dl > 0.35) { tx = s.lx-ox; ty = s.ly-oy; speed = def.speed * (dl > 4 ? 1.1 : 0.75); s.wait = 0 }
      else {
        face = [p.x, p.y]
        s.wait += dt
        if (!F.captor && !los && d < 2.8 && s.wait > 0.6 && !almondNear(eng, p.x, p.y, 2.5)) {
          setPhase(s, 'reach')
          audio.dullerReach(Math.max(0.3, 1 - d / 8))
          if (eng.hasItem?.('almond')) once(eng, 'dhesit', '墙里传来一阵迟疑的刮擦声——它似乎嗅到了你身上的杏仁水。')
        }
      }
      break
    }
    case 'reach': {
      e.state = 'attack'; face = [p.x, p.y]
      const wind = eng.hasItem?.('almond') ? 1.25 : 0.85
      if (noticed) { flee(eng, e, s, 18); once(eng, 'dspot', '你正好看见两条灰色长臂从墙面里「切」了出来——被你盯住的瞬间，它们缩了回去。'); break }
      if (scented || F.captor || almondNear(eng,p.x,p.y,2.5)) { flee(eng, e, s, 10); break }
      if (d > 3.1 || los || !wallHit(eng,p.x,p.y,e.x,e.y)?.wall) { setPhase(s, 'lurk'); s.retarget = 0; break }
      if (s.t >= wind) {
        if(!standable(eng,p.x,p.y)){flee(eng,e,s,10);break}
        // 拖拽终点必须在墙另一侧且有完整身体净空；没有安全落点就放弃。
        const ux = (p.x - e.x) / Math.max(0.1, d), uy = (p.y - e.y) / Math.max(0.1, d)
        let target: {x:number;y:number}|undefined
        for (const [r, side] of [[0.7, 0], [0.5, 0], [0.5, 0.5], [0.5, -0.5], [0.35, 0], [0,0]]) {
          const x = e.x + ux * r - uy * side, y = e.y + uy * r + ux * side
          if (standable(eng, x, y) && wallHit(eng,p.x,p.y,x,y)?.wall) { target={x,y}; break }
        }
        if(!target){flee(eng,e,s,10);break}
        setPhase(s, 'drag');F.captor=e;s.fromX=p.x+ox;s.fromY=p.y+oy;s.toX=target.x+ox;s.toY=target.y+oy;s.grabZ=p.z;s.hitT=0
        eng.hurtPlayer(def.damage * 0.5 * dmgMult, def.name)
        p.sanity = Math.max(0, p.sanity - 8)
        eng.camShake = Math.min(1, (eng.camShake ?? 0) + 0.8)
        eng.msg('墙里猛地伸出一双灰色的长手，攥住你往墙里拖！', 'damage')
      }
      break
    }
    case 'drag': {
      e.state = 'attack'; face = [s.fromX-ox, s.fromY-oy]
      if(!standable(eng,s.toX-ox,s.toY-oy,s.grabZ)){flee(eng,e,s,15);break}
      // 拖过墙：0.9 秒内把玩家从原位拖到钝人跟前（墙的另一侧）
      const k = Math.min(1, s.t / 0.9), ease = k * k * (3 - 2 * k)
      p.x = s.fromX + (s.toX - s.fromX) * ease-ox; p.y = s.fromY + (s.toY - s.fromY) * ease-oy
      p.z=s.grabZ??p.z;p.vz=0
      p.slowT = Math.max(p.slowT ?? 0, 0.5)
      if (k >= 1) {
        setPhase(s, 'hold'); s.hitT = 0.4
        eng.hurtPlayer(def.damage * dmgMult, def.name)
        eng.camShake = Math.min(1, (eng.camShake ?? 0) + 0.6)
        eng.msg('你被硬生生拖穿了墙壁，摔在另一条走廊里。它用那双长手把你按在地上。', 'damage')
      }
      break
    }
    case 'hold': {
      e.state = 'attack'; face = [p.x, p.y]
      if(!standable(eng,s.toX-ox,s.toY-oy,s.grabZ)){flee(eng,e,s,15);break}
      p.x=s.toX-ox;p.y=s.toY-oy;p.vz=0
      p.slowT = Math.max(p.slowT ?? 0, 0.4)
      s.hitT -= dt
      if (s.hitT <= 0 && s.t < 1.5) { s.hitT = 0.7; eng.hurtPlayer(def.damage * 0.4 * dmgMult, def.name) }
      if (s.t >= 1.6) { flee(eng, e, s, 20); once(eng, 'dafter', '它松开手，像意识到自己被看清了一样，无声地退进墙里。') }
      break
    }
    case 'flee': {
      e.state = 'stunned'
      // 急速奔逃（携物也不减速），穿墙而去
      const a = Math.max(0.1, d); tx = e.x + (e.x - p.x) / a * 6; ty = e.y + (e.y - p.y) / a * 6
      speed = def.speed * 2.6
      if (s.t > 5 || (d > 16 && s.t > 2)) { setPhase(s, 'roam'); eng.wanderTarget(e) }
      break
    }
  }

  if (speed > 0) {
    e.targetX = tx; e.targetY = ty
    const stuck = eng.stepEntity(e, speed, dt)
    if (stuck && s.phase === 'roam') eng.wanderTarget(e)
    e.animT += dt * speed
  }
  if (face) eng.faceToward(e, face[0], face[1], dt, 6)
  else if (speed > 0) eng.faceToward(e, tx, ty, dt, 6)

  // 穿墙沙沙声：潜伏/游荡时可隔墙听见；逃离时悄无声息
  if ((s.phase === 'roam' || s.phase === 'lurk') && speed > 0 && d < 14) {
    e.scrapeT = (e.scrapeT ?? Math.random() * 0.8) - dt
    if (e.scrapeT <= 0) { e.scrapeT = 0.8; audio.scrape(Math.min(1, (1 - d / 14) * (s.phase === 'lurk' ? 0.8 : 1))) }
  }

  // 外观姿态量
  const k = Math.min(1, dt * 6)
  const want = s.phase === 'reach' ? Math.min(1, s.t / 0.5) : s.phase === 'drag' || s.phase === 'hold' ? 1 : 0
  s.reach += (want - s.reach) * (want > s.reach ? Math.min(1, dt * 8) : k)
  s.reachLen = s.phase === 'drag' || s.phase === 'hold' ? Math.max(0.6, Math.hypot(p.x - e.x, p.y - e.y)) : Math.max(0.6, Math.min(3, d))
  s.wallD = s.reach > 0.02 ? wallDist(eng, e, d) : -1
  s.run += ((s.phase === 'flee' ? 1 : 0) - s.run) * k
  s.sway += ((s.phase === 'reach' || s.phase === 'drag' || s.phase === 'hold' ? 0.2 : 1) - s.sway) * k
}
