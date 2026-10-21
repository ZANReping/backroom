// 近战武器重制 阶段 3：五把近战武器的机制参数（引擎与渲染共用；纯数据，无 three 依赖）。
// 时间表必须与 renderer/meleeAnim.ts 的关键帧一致（check:melee 校验 dur / windup / active）。

export type MeleeKind = 'knife' | 'crowbar' | 'wrench' | 'timber' | 'axe'
export const MELEE_KINDS: MeleeKind[] = ['knife', 'crowbar', 'wrench', 'timber', 'axe']
export const isMelee = (t: string | undefined | null): t is MeleeKind => !!t && (MELEE_KINDS as string[]).includes(t)

export interface MeleeTiming { dur: number; windup: number; active: number }
export interface MeleeStats {
  /** 攻击距离（米），残件按 brokenReach */
  reach: number; brokenReach: number
  /** 满耐久 */
  maxDur: number
  /** 一次能打中的目标数（木板横扫 3，其余 1） */
  targets: number
  /** 命中硬直（秒），缺省 0.35 */
  stun: number
  /** 背刺倍率（只有刀） */
  backstab?: number
  /** 残件伤害倍率 */
  brokenDmg: number
  /** 蓄力到满所需时间（秒） */
  chargeTime: number
  light: MeleeTiming; heavy: MeleeTiming
}
export const MELEE: Record<MeleeKind, MeleeStats> = {
  knife: { reach: 1.6, brokenReach: 1.35, maxDur: 60, targets: 1, stun: .3, backstab: 2, brokenDmg: .5, chargeTime: .55,
    light: { dur: .42, windup: .26, active: .55 }, heavy: { dur: .62, windup: .34, active: .52 } },
  crowbar: { reach: 2.0, brokenReach: 1.8, maxDur: 150, targets: 1, stun: .4, brokenDmg: .6, chargeTime: .8,
    light: { dur: .85, windup: .4, active: .6 }, heavy: { dur: 1.23, windup: .45, active: .6 } },
  wrench: { reach: 1.9, brokenReach: 1.75, maxDur: 120, targets: 1, stun: .6, brokenDmg: .55, chargeTime: .75,
    light: { dur: .78, windup: .38, active: .6 }, heavy: { dur: 1.13, windup: .48, active: .62 } },
  timber: { reach: 2.3, brokenReach: 1.7, maxDur: 25, targets: 3, stun: .35, brokenDmg: .5, chargeTime: .85,
    light: { dur: .94, windup: .42, active: .64 }, heavy: { dur: 1.36, windup: .5, active: .64 } },
  axe: { reach: 2.0, brokenReach: 1.2, maxDur: 40, targets: 1, stun: .45, brokenDmg: .35, chargeTime: 1.0,
    light: { dur: 1.12, windup: .45, active: .58 }, heavy: { dur: 1.62, windup: .5, active: .6 } },
}

/** 重击：伤害 ×(1.4..1.8 随蓄力)，体力 ×2，耐久消耗 ×2 */
export const HEAVY_MIN_CHARGE = .4
export const heavyDamageMul = (charge: number) => 1.4 + .4 * Math.max(0, Math.min(1, (charge - HEAVY_MIN_CHARGE) / (1 - HEAVY_MIN_CHARGE)))
export const HEAVY_STAMINA_MUL = 2
/** 按住多久才开始蓄力（之前松开 = 普攻） */
export const CHARGE_DELAY = .2
/** 耐久消耗：命中 1、重击命中 2、打墙弹刀 3、斧头劈门 8 */
export const DUR_HIT = 1, DUR_HEAVY_HIT = 2, DUR_WALL = 3, DUR_DOOR = 8
/** 修理：消耗 1 份材料，耐久修到上限的 50%（已高于 50% 不能修）；残件修好变回完好 */
export const REPAIR_MATERIALS = ['nails', 'rope'] as const
export const REPAIR_TO = .5
export const REPAIR_TIME = 3.2
/** 低耐久阈值（≤25% 出现裂纹并提示一次） */
export const LOW_DUR = .25
