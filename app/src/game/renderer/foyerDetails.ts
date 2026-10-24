// 前厅（序章）细节陈设：开关面板、插座、门套线、壁挂空调等小件（静态合批，随前厅烘焙一并计算光照）。
// 与 foyerHome.ts 分离，便于和玩法里程碑（拾取物/教程）并行修改时减少冲突。
import { FOYER_DOORS, FOYER_DOOR_H, FOYER_WALL_T } from '../world/foyerLayout'
import { auditKey, type Ctx, type Mats } from './foyerHome'

type Face = { axis: 'x' | 'z'; at: number; sign: 1 | -1 } // 墙面：axis=法线方向轴，at=墙面坐标，sign=朝向房间的法线符号

/** 开关/插座面板中心位于墙面上 (along, h)。 */
let plateN = 0
function plate(c: Ctx, mats: Mats, f: Face, along: number, h: number, kind: 'switch' | 'switch2' | 'outlet' | 'outlet2') {
  // QA：贴墙方向（地图坐标，指向墙内）= -法线
  auditKey(`${kind}_${plateN++}`, kind, f.axis === 'x' ? -f.sign : 0, f.axis === 'z' ? -f.sign : 0)
  const body = mats.lit('plate', { color: '#f3f2ee', roughness: 0.32, envBase: 0.45 })
  const dark = mats.lit('plate-slot', { color: '#2a2a2a', roughness: 0.6 })
  const rocker = mats.lit('plate-rocker', { color: '#fbfbf8', roughness: 0.25, envBase: 0.5 })
  const W = kind === 'outlet2' ? 0.146 : 0.086, Hh = 0.086, T = 0.009
  const put = (w: number, h2: number, d: number, du: number, y: number, off: number, m: typeof body) => {
    const n = f.at + f.sign * off
    if (f.axis === 'x') c.box(m, d, h2, w, n, y, along + du)
    else c.box(m, w, h2, d, along + du, y, n)
  }
  put(W, Hh, T, 0, h - Hh / 2, T / 2, body)
  if (kind === 'switch') put(0.034, 0.05, 0.006, 0, h - 0.025, T + 0.003, rocker)
  if (kind === 'switch2') { put(0.03, 0.05, 0.006, -0.018, h - 0.025, T + 0.003, rocker); put(0.03, 0.05, 0.006, 0.018, h - 0.025, T + 0.003, rocker) }
  if (kind === 'outlet' || kind === 'outlet2') {
    const centers = kind === 'outlet2' ? [-0.03, 0.03] : [0]
    for (const cu of centers) {
      put(0.012, 0.004, 0.002, cu - 0.008, h + 0.012, T + 0.001, dark)
      put(0.012, 0.004, 0.002, cu + 0.008, h + 0.012, T + 0.001, dark)
      put(0.004, 0.012, 0.002, cu, h - 0.02, T + 0.001, dark)
    }
  }
}

export function buildFoyerDetails(c: Ctx, mats: Mats) {
  plateN = 0
  const t = FOYER_WALL_T / 2
  // ---- 开关：门锁闩一侧 1.3m 高，两面墙 ----
  plate(c, mats, { axis: 'z', at: 9 - t, sign: -1 }, 7.28, 1.32, 'switch2') // 卧室门（卧室侧）
  plate(c, mats, { axis: 'z', at: 9 + t, sign: 1 }, 7.28, 1.32, 'switch') // 卧室门（玄关侧）
  plate(c, mats, { axis: 'z', at: 8 - t, sign: -1 }, 11.07, 1.32, 'switch') // 卫生间门（卫生间侧）
  plate(c, mats, { axis: 'z', at: 8 + t, sign: 1 }, 11.07, 1.32, 'switch2') // 卫生间门（客厅侧：卫生间灯 + 排气扇）
  plate(c, mats, { axis: 'z', at: 14, sign: -1 }, 4.78, 1.32, 'switch2') // 防盗门内侧（玄关灯）
  plate(c, mats, { axis: 'x', at: 12 + t, sign: 1 }, 7.62, 1.32, 'switch') // 厨房
  // ---- 插座：踢脚线上方 0.3m；台面防溅墙 1.05m ----
  plate(c, mats, { axis: 'x', at: 4, sign: 1 }, 6.68, 0.3, 'outlet2') // 书桌旁
  plate(c, mats, { axis: 'z', at: 4, sign: 1 }, 6.72, 0.3, 'outlet') // 床头
  plate(c, mats, { axis: 'x', at: 17, sign: -1 }, 9.62, 0.3, 'outlet2') // 电视墙
  plate(c, mats, { axis: 'z', at: 14, sign: -1 }, 10.05, 0.3, 'outlet') // 客厅南墙（原位于 x=9 开放边界处、无墙）
  plate(c, mats, { axis: 'z', at: 4.002, sign: 1 }, 12.95, 1.05, 'outlet2') // 厨房台面
  plate(c, mats, { axis: 'z', at: 4.002, sign: 1 }, 16.0, 1.05, 'outlet')
  plate(c, mats, { axis: 'x', at: 9 + t, sign: 1 }, 4.62, 1.12, 'outlet') // 卫生间洗手台旁
  plate(c, mats, { axis: 'x', at: 4, sign: 1 }, 10.4, 0.3, 'outlet') // 玄关
  // ---- 门套线（室内门两面）：压在门套外沿，略高出墙面 ----
  auditKey(null)
  const trim = mats.lit('door-trim', { color: '#f4f1ea', roughness: 0.42, envBase: 0.3 })
  for (const d of FOYER_DOORS) {
    if (d.style === 'security' || d.axis !== 'x') continue
    const fw = 0.06, tw = 0.07, td = 0.012, T = FOYER_WALL_T + 0.04
    for (const s of [-1, 1]) {
      const z = d.at + s * (T / 2 + td / 2)
      c.box(trim, tw, FOYER_DOOR_H + fw + tw - 0.01, td, d.a - fw - tw / 2 + 0.035, 0, z)
      c.box(trim, tw, FOYER_DOOR_H + fw + tw - 0.01, td, d.b + fw + tw / 2 - 0.035, 0, z)
      c.box(trim, d.b - d.a + 2 * fw + 2 * tw - 0.07, tw, td, (d.a + d.b) / 2, FOYER_DOOR_H + fw - 0.01, z)
    }
  }
  // ---- 卧室壁挂空调（东墙高处）+ 冷凝管 ----
  const acBody = mats.lit('ac-body', { color: '#f1f1ee', roughness: 0.35, envBase: 0.35 })
  const acVent = mats.lit('ac-vent', { color: '#d9dad6', roughness: 0.5 })
  const ax = 9 - t
  auditKey('aircon', 'aircon', 1, 0)
  c.cushion(acBody, 0.2, 0.29, 0.84, ax - 0.1, 2.24, 7.55, 0.03)
  c.box(acVent, 0.012, 0.035, 0.74, ax - 0.2, 2.27, 7.55)
  c.box(mats.basic('ac-led', { color: '#7fd4ff' }), 0.004, 0.006, 0.02, ax - 0.201, 2.33, 7.88)
  c.box(acBody, 0.04, 0.02, 0.04, ax - 0.02, 2.2, 7.98)
  auditKey(null)
}
