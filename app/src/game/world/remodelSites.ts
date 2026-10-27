// 后室装修公司「施工许可」在 Level 0 留下的施工点（世界坐标，永久留存于存档 player.remodel.sites）。
// 纯数据 + 区块注入：Level 0 的 chunk 实例化时（infinite.ts instantiate）调用 applyRemodelSites，
// 把施工门出口与路障碰撞体注入该区块；渲染层（renderer/remodelSites.ts）另行绘制门与路障模型，
// 着色器（renderer/remodelZones.ts）按施工点做「停嗡鸣 / 地毯变干 / 灯光转冷白」的空间渐变。
import type { ExitDef, Structure } from '../core/types'
import type { GenChunk } from './infiniteRegistry'
import { L02_ID } from './l02Layout'

export type RemodelPropKind = 'barricade' | 'cone' | 'sign' | 'worklamp'
export interface RemodelProp { kind: RemodelPropKind; x: number; y: number; yaw: number }
export interface RemodelSite {
  id: string
  /** 改造区中心（世界坐标）。 */
  x: number; y: number
  /** 改造区半径（m）：半径内完全改造，向外 2 m 渐变回 Level 0。 */
  r: number
  /** 施工门：墙面点（世界坐标）与朝向（门面法线 = (sin yaw, cos yaw)，指向房间一侧）。 */
  door: { x: number; y: number; yaw: number }
  /** 创建时的游戏时间（秒）；改造渐变按此推进。 */
  t0: number
  /** 改造渐变完成（读档后直接视为完成）。 */
  done?: boolean
  props: RemodelProp[]
}

/** 可调参数（第一阶段）。 */
export const REMODEL_TUNING = {
  /** 与后室装修公司声望需「大于」此值才能申请许可。 */
  permitRep: 60,
  /** 改造区半径（m）。 */
  zoneR: 6,
  /** 改造区外缘渐变宽度（m）。 */
  zoneFeather: 2,
  /** 使用许可后改造渐变时长（秒）：嗡鸣渐停、地毯变干、灯光转冷白、路障出现。 */
  transformDur: 6,
  /** 施工门搜索：玩家附近多远内的墙面可以开门（m；上限 4，受 l0WallSurface 限制）。 */
  doorSearch: 4,
  /** 门与门框尺寸（m）。 */
  doorW: 1.0, doorH: 2.1,
}

/** 施工门出口定义（L0 → L0.2）。 */
export const REMODEL_DOOR_EXIT: ExitDef = { kind: 'remodeldoor', name: '施工场所的门', dest: L02_ID, anim: 'shutter' }

let active: RemodelSite[] = []
/** 引擎在切换层级 / 读档 / 使用许可后同步当前存档里的施工点。 */
export function setRemodelSites(list: RemodelSite[] | undefined) { active = list ?? [] }
export function remodelSites(): readonly RemodelSite[] { return active }

/** 施工门前方（房间一侧）距门 d 米的点（世界坐标）。 */
export function doorFront(s: RemodelSite, d: number) {
  return { x: s.door.x + Math.sin(s.door.yaw) * d, y: s.door.y + Math.cos(s.door.yaw) * d }
}

/** 改造强度 0..1（世界坐标；now=游戏时间）。 */
export function remodelStrengthAt(wx: number, wy: number, now: number, sites: readonly RemodelSite[] = active) {
  let k = 0
  for (const s of sites) {
    const d = Math.hypot(wx - s.x, wy - s.y)
    const space = 1 - Math.min(1, Math.max(0, (d - s.r) / REMODEL_TUNING.zoneFeather))
    k = Math.max(k, space * remodelProgress(s, now))
  }
  return k
}
export function remodelProgress(s: RemodelSite, now: number) {
  if (s.done) return 1
  const t = Math.min(1, Math.max(0, (now - s.t0) / REMODEL_TUNING.transformDur))
  return t * t * (3 - 2 * t)
}

/** 路障碰撞尺寸（半宽 × 半深，沿 yaw 的局部轴；cone/lamp 近似圆柱）。 */
export function propFootprint(p: RemodelProp): { hw: number; hd: number } {
  return p.kind === 'barricade' ? { hw: 0.62, hd: 0.2 } : p.kind === 'sign' ? { hw: 0.32, hd: 0.3 } : p.kind === 'worklamp' ? { hw: 0.22, hd: 0.22 } : { hw: 0.17, hd: 0.17 }
}

/** 在 Level 0 区块原始数据里注入施工点（出口 + 路障碰撞）。返回新对象，不改输入。 */
export function applyRemodelSites(raw: GenChunk, cx: number, cy: number): GenChunk {
  if (!active.length) return raw
  const X = cx * 32, Y = cy * 32
  const inChunk = (x: number, y: number) => x >= X && x < X + 32 && y >= Y && y < Y + 32
  let out: GenChunk | null = null
  const own = () => (out ??= { ...raw, exits: [...raw.exits], structures: [...raw.structures] })
  for (const s of active) {
    const f = doorFront(s, 0.62)
    if (inChunk(s.door.x, s.door.y)) own().exits.push({ def: REMODEL_DOOR_EXIT, x: f.x - 0.5, y: f.y - 0.5, discovered: true, remodelSite: s.id })
    for (const [i, p] of s.props.entries()) {
      if (!inChunk(p.x, p.y)) continue
      const { hw, hd } = propFootprint(p)
      // 轴对齐包围盒（路障朝向只取 0/90°附近，误差可接受）
      const c = Math.abs(Math.cos(p.yaw)), sn = Math.abs(Math.sin(p.yaw))
      const ex = hw * c + hd * sn, ey = hw * sn + hd * c
      const st: Structure = { kind: 'pillar', x: p.x - ex, y: p.y - ey, w: ex * 2, h: ey * 2, solid: true, data: { l0Wall: 1, l0Prop: 1, remodelProp: 1, bottom: 0, top: p.kind === 'cone' ? 0.7 : 1.1, sid: hashSid(s.id, i) } }
      own().structures.push(st)
    }
  }
  return out ?? raw
}
function hashSid(id: string, i: number) { let h = 0x5eed ^ i; for (let k = 0; k < id.length; k++) h = Math.imul(h ^ id.charCodeAt(k), 16777619) >>> 0; return 0x7a000000 + (h & 0xffffff) }
