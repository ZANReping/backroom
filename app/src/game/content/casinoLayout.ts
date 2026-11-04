// [casino] Level 5.1 赌场大厅手工布局（地图米坐标，纯数据）：52 × 36 m、挑高 7 m（v2：由 64 × 44 收小加密）。
// 南墙正中是大门（唯一出口，回 L5）→ 前厅（金柱环形座椅 · TH 立牌 · 绳栏）→ 东侧兑换台 / 换筹码亭 / 休息沙发（Louie 的位置先留空）
// → 西区老虎机（西墙高顶箱一排 + 3 座背靠背岛 + 2 组环形 + 南墙一排，累积奖池大屏 / 计数柱）
// → 中部牌桌区（21 点 ×8、轮盘 ×3、骰子 ×2，桌间绳栏 + 灯柱，每桌头顶聚光）→ 东北环形酒吧（筒灯点阵 · 灯带 · 背光酒柜）
// → 西北野兽 VIP 包间 → 东墙员工门（锁）。
// 每个区域一套独有程序地毯（floors；交界黄铜压条），灯光分「实时点光」（lights 中 bake≠1，进 m.lights）与「只烘焙」（bake=1：筒灯点阵 / 屏幕辉光 / 聚光 / 跑马灯外溢），
// renderer/casinoBake 用全部灯烘地面光照贴图与静态网格逐顶点辐照度。
// 地图坐标：大厅内腔 x ∈ [OX, OX+52)、y ∈ [OY, OY+36)；北 = −y。mapgenOutpost.genCasino 按这里雕墙 / 放碰撞；renderer/casinoScene 按这里摆模型。
export const CASINO_W = 52, CASINO_D = 36, CASINO_H = 7
export const OX = 3, OY = 3
export const CASINO_MAP = { w: OX * 2 + CASINO_W, h: OY * 2 + CASINO_D + 6 } // 南面多 6 行：门外小门廊（出口）
export type CasinoPropKind = 'slot' | 'blackjack' | 'roulette' | 'craps' | 'bar' | 'barstool' | 'liquor' | 'cashier' | 'rope' | 'vipsofa' | 'viptable' | 'pillar' | 'planter' | 'thsign' | 'staffdoor' | 'cctv' | 'floorlamp' | 'chandelier' | 'chips' | 'cards'
  | 'jackpotpole' | 'jackpotboard' | 'kiosk' | 'cart' | 'lounge' | 'hangsign' | 'lamppost' | 'tablestool' | 'loungetable'
export interface CasinoProp { kind: CasinoPropKind; x: number; y: number; rot: number; data?: Record<string, number> }
/** 碰撞盒（地图米，AABB） */
export interface CasinoBox { x0: number; y0: number; x1: number; y1: number; top: number }
/** 灯：z 高度（米）；spot = 朝下聚光半角（弧度）；bake = 1 只进烘焙（不占实时点光池）；I = 烘焙强度倍率 */
export interface CasinoLight { x: number; y: number; z: number; r: number; color: string; flicker?: number; spot?: number; bake?: number; I?: number }
export interface CasinoZone { name: string; x0: number; y0: number; x1: number; y1: number }
/** 区域地毯 */
export type CarpetKind = 'carpetFoyer' | 'carpetCashier' | 'carpetSlots' | 'carpetTables' | 'carpetBar' | 'carpetVip'
export interface CasinoFloor { carpet: CarpetKind; x0: number; y0: number; x1: number; y1: number }
/** 主通道（验收：宽 ≥ 2.5 m、不压碰撞盒、全部可达） */
export interface CasinoAisle { name: string; x0: number; y0: number; x1: number; y1: number }

const X = (v: number) => OX + v, Y = (v: number) => OY + v
export const N = -Math.PI / 2, S = Math.PI / 2, E = 0, W = Math.PI
/** rot：模型局部 +Z（正面）朝向世界方向角 f（atan2(dy,dx)）；renderer rotation.y = π/2 − f */

export interface CasinoLayout { props: CasinoProp[]; boxes: CasinoBox[]; lights: CasinoLight[]; zones: CasinoZone[]; floors: CasinoFloor[]; aisles: CasinoAisle[]; door: { x: number; y: number }; spawn: { x: number; y: number }; walls: CasinoBox[] }
/** 屏幕辉光调色（ref6：蓝 / 品红 / 青 / 橙 / 紫） */
export const SLOT_GLOW = ['#4aa8ff', '#ff4fd0', '#3ff0e0', '#ffa040', '#9a6bff', '#ff5a6a']
let cached: CasinoLayout | null = null
export function casinoLayout(): CasinoLayout {
  if (cached) return cached
  const props: CasinoProp[] = [], boxes: CasinoBox[] = [], lights: CasinoLight[] = [], walls: CasinoBox[] = []
  const P = (kind: CasinoPropKind, x: number, y: number, rot: number, data?: Record<string, number>) => props.push({ kind, x: X(x), y: Y(y), rot, data })
  const B = (x0: number, y0: number, x1: number, y1: number, top = 9) => boxes.push({ x0: X(x0), y0: Y(y0), x1: X(x1), y1: Y(y1), top })
  const L = (x: number, y: number, z: number, r: number, color: string, o: Partial<CasinoLight> = {}) => lights.push({ x: X(x), y: Y(y), z, r, color, ...o })
  const LB = (x: number, y: number, z: number, r: number, color: string, o: Partial<CasinoLight> = {}) => L(x, y, z, r, color, { bake: 1, ...o })
  // ---- 内墙（VIP 包间）：内墙厚 0.3，南墙留 3 m 门洞 x 4..7 ----
  const IW = (x0: number, y0: number, x1: number, y1: number) => { walls.push({ x0: X(x0), y0: Y(y0), x1: X(x1), y1: Y(y1), top: CASINO_H }); B(x0, y0, x1, y1, 9) }
  IW(0, 9, 4, 9.3); IW(7, 9, 11, 9.3); IW(11, 0, 11.3, 9.3)

  let slotI = 0
  const glowOf = (i: number) => SLOT_GLOW[(i * 7 + 3) % SLOT_GLOW.length]
  const slot = (x: number, y: number, rot: number, tall = 0) => {
    const i = slotI++
    P('slot', x, y, rot, { i, tall, glow: (i * 7 + 3) % SLOT_GLOW.length })
    // 屏幕辉光（只烘焙）：机器正面 0.45 m、离地 1.2 m
    LB(x + Math.cos(rot) * 0.45, y + Math.sin(rot) * 0.45, 1.25, 2.6, glowOf(i), { I: tall ? 0.95 : 0.75 })
  }
  // ================= 前厅（南门内 x 15.5..36, y 27..36）=================
  for (const sx of [20.5, 31.5]) { P('pillar', sx, 31.2, 0, { seat: 1 }); B(sx - 1.15, 30.05, sx + 1.15, 32.35, 9) } // 包金立柱 + 环形座椅
  P('thsign', 26, 29.4, S); B(24.6, 29.1, 27.4, 29.7)
  for (const sx of [24.4, 27.6]) for (let y = 31; y <= 34.5; y += 1.75) P('rope', sx, y, S, { len: 1.75 })
  for (const sx of [24.4, 27.6]) B(sx - 0.06, 31, sx + 0.06, 34.5 + 1.75, 1)
  for (const [sx, sy] of [[18.2, 34.8], [33.8, 34.8], [22.6, 28.4], [29.4, 28.4]]) P('floorlamp', sx, sy, 0)
  for (const [sx, sy] of [[16.6, 35.2], [35.2, 35.2], [22.3, 35.3], [29.7, 35.3]]) { P('planter', sx, sy, 0); B(sx - 0.5, sy - 0.5, sx + 0.5, sy + 0.5) }
  P('chandelier', 26, 32.5, 0, { big: 1 }); P('chandelier', 20.5, 34, 0); P('chandelier', 31.5, 34, 0)
  L(26, 32.5, 5.2, 9, '#ffcf96', { flicker: 1 })
  LB(26, 35.2, 3.0, 7, '#ff5a28', { I: 3.2 }) // 门洞跑马灯外溢（ref5 红橙）
  LB(24.2, 35.4, 2.6, 5, '#ff8a3a', { I: 1.8 }); LB(27.8, 35.4, 2.6, 5, '#ff8a3a', { I: 1.8 })
  for (const [sx, sy] of [[18.2, 34.8], [33.8, 34.8], [22.6, 28.4], [29.4, 28.4]]) LB(sx, sy, 0.8, 2.4, '#ffc070', { I: 0.6 })
  for (const sx of [20.5, 31.5]) LB(sx, 31.2, 6.6, 6, '#ffd9a0', { spot: 0.5, I: 2.2 })

  // ================= 兑换台 / 通道（东南 x 34.5..52, y 18..36）=================
  P('cashier', 49.2, 30.5, W); B(48.6, 27, 50.8, 34, 2.6) // 柜台沿 y 长 7 m，面朝西（Louie 的位置先留空）
  P('kiosk', 40.5, 21.5, S); B(39.4, 20.6, 41.6, 22.4, 2.8) // 换筹码亭
  P('lounge', 38.2, 33.6, N); B(36.2, 33.0, 40.2, 34.4, 0.9); P('lounge', 43.8, 33.6, N); B(41.8, 33.0, 45.8, 34.4, 0.9)
  P('loungetable', 41, 31.4, 0); B(40.4, 30.8, 41.6, 32.0, 0.5)
  // 兑换区小老虎机岛（背靠背 2 × 6）
  for (let i = 0; i < 6; i++) { const x = 42.9 + i * 0.95; slot(x, 21.5 - 0.55, N); slot(x, 21.5 + 0.55, S) }
  B(42.35, 20.5, 48.0, 22.5, 2.3); B(42.4, 20.05, 47.95, 20.5, 1.0); B(42.4, 22.5, 47.95, 22.95, 1.0)
  P('cart', 37.4, 19.6, E); B(36.8, 19.25, 38.0, 19.95, 1.1) // 酒水服务车
  for (const [sx, sy] of [[51.3, 19], [51.3, 35.3], [36.2, 18.4]]) { P('planter', sx, sy, 0); B(sx - 0.5, sy - 0.5, sx + 0.5, sy + 0.5) }
  P('chandelier', 41, 31.6, 0); P('chandelier', 45.5, 24.5, 0)
  L(46.5, 30.5, 3.4, 7, '#ffe2a8'); L(41, 31.6, 4.4, 6, '#ffc78a', { flicker: 1 }); L(40.5, 21.5, 3.2, 5, '#ffd27a')
  LB(48.2, 30.5, 2.9, 6, '#ffd36a', { I: 1.6 }) // CASHIER 霓虹 + 柜台灯
  for (let y = 27.5; y <= 33.5; y += 2) LB(46.8, y, 6.8, 4, '#fff0d0', { spot: 0.55, I: 1.4 })

  // ================= 老虎机区（西 x 0..15.5, y 9.3..36）=================
  // 西墙一排高顶箱（面朝东）
  for (let y = 10.6; y <= 33.9; y += 0.95) slot(0.55, y, E, 1)
  B(0, 10.1, 1.1, 34.4, 3.2); B(1.1, 10.2, 1.6, 34.3, 1.0)
  // 3 座背靠背岛（沿 x，每侧 11 台）
  for (const ry of [13.4, 17.9, 22.4]) {
    for (let i = 0; i < 11; i++) { const x = 3.6 + i * 0.95; slot(x, ry - 0.55, N); slot(x, ry + 0.55, S) }
    B(3.05, ry - 1.0, 13.65, ry + 1.0, 2.3); B(3.1, ry - 1.45, 13.6, ry - 1.0, 1.0); B(3.1, ry + 1.0, 13.6, ry + 1.45, 1.0) // 机位椅子（挡人）
    P('chandelier', 8.35, ry + 2.25, 0); L(8.35, ry + 2.25, 4.6, 7, '#ffb468', { flicker: 1 })
    L(8.35, ry, 2.6, 5, glowOf(ry * 3 | 0)) // 岛顶实时彩光
  }
  // 2 组环形（8 台背朝中心）+ 中央累积奖池计数柱
  for (const [rx, ry] of [[5.6, 29.4], [12.0, 29.4]] as [number, number][]) {
    for (let k = 0; k < 8; k++) { const a = k / 8 * Math.PI * 2 + Math.PI / 8; slot(rx + Math.cos(a) * 1.3, ry + Math.sin(a) * 1.3, a) }
    P('jackpotpole', rx, ry, 0); B(rx - 1.75, ry - 1.75, rx + 1.75, ry + 1.75, 2.3); B(rx - 2.0, ry - 2.0, rx + 2.0, ry + 2.0, 1.0)
    L(rx, ry, 3.6, 6, '#ff60c0'); LB(rx, ry, 3.4, 5, '#ffcf60', { I: 1.6 })
  }
  // 南墙一排（面朝北，门西侧）
  for (let i = 0; i < 12; i++) slot(3.0 + i * 0.95, 35.45, N)
  B(2.45, 34.9, 14.05, 36, 2.3); B(2.5, 34.35, 13.95, 34.9, 1.0)
  // 累积奖池大屏（西墙高处、壁挂）
  P('jackpotboard', 0.12, 22.2, E); LB(0.6, 22.2, 4.4, 9, '#ff9a3a', { I: 2.2 })
  L(5, 33, 4.2, 6, '#5ab8ff'); L(1.2, 16, 2.8, 5, '#ff4fd0'); L(1.2, 28, 2.8, 5, '#4aa8ff')

  // ================= 牌桌区（中 x 11.3/15.5..34.5, y 0..27）=================
  const spot = (x: number, y: number, I = 2.6) => { LB(x, y, 6.7, 7, '#ffe6c0', { spot: 0.34, I }); P('lamppost', x, y, 0, { ceil: 1 }) } // 吊顶聚光筒（ceil：只画灯筒）
  const BJ: [number, number][] = [[19.6, 3.0], [24.6, 3.0], [29.6, 3.0], [19.6, 8.6], [24.6, 8.6], [29.6, 8.6], [14.3, 3.0], [25.0, 19.6]]
  BJ.forEach(([x, y], i) => {
    P('blackjack', x, y, S, { i }); B(x - 1.15, y - 0.9, x + 1.15, y + 0.55, 1.0)
    P('chips', x - 0.5, y - 0.3, 0, { seed: i * 7 + 1 }); P('cards', x + 0.15, y + 0.05, 0, { seed: i })
    for (let k = 0; k < 5; k++) { const t = Math.PI * (0.2 + k * 0.15); P('tablestool', x + Math.cos(t) * 1.55, y - 0.55 + Math.sin(t) * 1.55, t + Math.PI) }
    B(x - 1.3, y + 0.55, x + 1.3, y + 1.25, 0.8) // 玩家凳一排
    spot(x, y - 0.2)
  })
  for (const [i, [x, y]] of ([[19.7, 14.0], [25.1, 14.0], [30.5, 14.0]] as [number, number][]).entries()) {
    P('roulette', x, y, W, { i }); B(x - 1.4, y - 0.75, x + 1.4, y + 0.75, 1.0); P('chips', x + 0.6, y + 0.25, 0, { seed: 40 + i })
    for (const sx of [-0.9, 0.1, 1.1]) P('tablestool', x + sx, y + 1.25, N)
    B(x - 1.2, y + 0.75, x + 1.4, y + 1.5, 0.8)
    spot(x, y)
  }
  for (const [i, [x, y]] of ([[19.6, 19.6], [30.4, 19.6]] as [number, number][]).entries()) {
    P('craps', x, y, S, { i }); B(x - 1.6, y - 0.8, x + 1.6, y + 0.8, 1.0); P('chips', x - 0.9, y + 0.45, 0, { seed: 60 + i })
    spot(x - 0.8, y, 2.2); spot(x + 0.8, y, 2.2)
  }
  // 桌间绳栏 + 灯柱：牌桌区西界（主通道东沿）与两排 21 点之间
  for (let y = 11.5; y <= 19; y += 2.5) { if (y >= 16 && y <= 17) continue; P('rope', 17.6, y + 1.25, S, { len: 2.5 }); B(17.54, y, 17.66, y + 2.5, 1) }
  for (const y of [11.5, 14, 19, 21.5]) P('lamppost', 17.6, y, 0)
  for (const x of [22.1, 27.1]) { P('rope', x, 5.8, S, { len: 1.6 }); B(x - 0.06, 5.0, x + 0.06, 6.6, 1); P('lamppost', x, 5.8, 0) }
  for (const x of [22.4, 27.8]) P('lamppost', x, 16.8, 0)
  for (let x = 19; x <= 32; x += 4.5) for (const y of [5.8, 16.8]) LB(x, y, 6.8, 6, '#ffd8a8', { I: 0.9 }) // 普通筒灯
  for (const [x, y] of [[22.1, 5.8], [27.1, 5.8], [22.4, 16.8], [27.8, 16.8], [19.6, 11.2], [29.6, 11.2]]) L(x, y, 4.2, 7, '#ffd8b0')
  L(25.1, 14, 3.1, 6, '#ff9fd0'); L(24.6, 3.0, 3.1, 6, '#ffb0e0'); L(25, 19.6, 3.1, 6, '#ffb0e0')
  P('chandelier', 22.1, 11.3, 0, { big: 1 }); P('chandelier', 27.6, 11.3, 0, { big: 1 }); L(24.85, 11.3, 5.2, 10, '#ffc78a', { flicker: 1 })
  P('cctv', 25, 16.8, 0, { z: CASINO_H - 0.4 })

  // ================= 环形酒吧（东北 x 34.5..52, y 0..18）=================
  const BC = { x: 44.8, y: 8.6 }, BR = 4.4
  P('bar', BC.x, BC.y, S, { r: BR })
  // 吧台碰撞：沿西半环（南 → 西 → 北，开口朝东墙 = 酒保侧）取 19 段小盒；高脚凳在环外 0.75 m
  for (let k = 0; k <= 18; k++) {
    const a = Math.PI * (0.5 + k / 18), cx = X(BC.x) + Math.cos(a) * BR, cy = Y(BC.y) + Math.sin(a) * BR
    boxes.push({ x0: cx - 0.42, y0: cy - 0.42, x1: cx + 0.42, y1: cy + 0.42, top: 1.12 })
  }
  for (let k = 0; k < 12; k++) { const a = Math.PI * (0.56 + k * 0.08); const sx = BC.x + Math.cos(a) * (BR + 0.75), sy = BC.y + Math.sin(a) * (BR + 0.75); P('barstool', sx, sy, a + Math.PI); B(sx - 0.25, sy - 0.25, sx + 0.25, sy + 0.25, 0.8) }
  P('liquor', BC.x + 2.0, BC.y, W); B(BC.x + 1.5, BC.y - 2.7, BC.x + 2.6, BC.y + 2.7, 2.4)
  // ref8：下沉环顶筒灯点阵（两圈 + 吧台上方）→ 全部只烘焙；实时只留 3 盏
  for (let k = 0; k < 28; k++) { const a = k / 28 * Math.PI * 2; LB(BC.x + Math.cos(a) * 6.3, BC.y + Math.sin(a) * 6.3, 6.4, 4.5, '#ffd090', { spot: 0.6, I: 1.15 }) }
  for (let k = 0; k < 16; k++) { const a = Math.PI * (0.5 + k / 15); LB(BC.x + Math.cos(a) * BR, BC.y + Math.sin(a) * BR, 6.4, 4, '#ffc880', { spot: 0.45, I: 1.3 }) }
  for (let x = 36; x <= 51; x += 2.5) for (const y of [1.2, 16.2]) LB(x, y, 6.8, 4, '#ffd8a0', { spot: 0.6, I: 0.9 })
  LB(BC.x, BC.y, 0.15, 5.5, '#ffb060', { I: 1.4 }) // 吧台底灯带外溢
  LB(BC.x + 1.4, BC.y, 1.5, 5, '#ffb050', { I: 2.0 }) // 背光酒柜
  L(BC.x - 2.6, BC.y, 4.8, 9, '#ffcf8f'); L(BC.x - 5.6, BC.y + 3.6, 3.4, 6, '#ffb070', { flicker: 1 }); L(BC.x - 5.6, BC.y - 3.6, 3.4, 6, '#ffb070')
  for (const a of [Math.PI * 0.62, Math.PI, Math.PI * 1.38]) { P('pillar', BC.x + Math.cos(a) * (BR + 3.1), BC.y + Math.sin(a) * (BR + 3.1), 0, { slim: 1 }) ; const px = BC.x + Math.cos(a) * (BR + 3.1), py = BC.y + Math.sin(a) * (BR + 3.1); B(px - 0.35, py - 0.35, px + 0.35, py + 0.35) }
  P('cctv', BC.x, BC.y + 1, 0, { z: CASINO_H - 0.6 })
  P('lounge', 37.6, 15.6, N); B(35.6, 15.0, 39.6, 16.4, 0.9)
  // 酒吧区鸡尾酒高桌（每桌 3 张高脚凳）+ 北墙一排高顶箱老虎机
  for (const [tx, ty] of [[42.2, 16.2], [46.0, 16.4], [49.6, 15.2], [37.4, 11.6], [37.4, 5.0]] as [number, number][]) {
    P('loungetable', tx, ty, 0, { high: 1 }); B(tx - 0.8, ty - 0.8, tx + 0.8, ty + 0.8, 1.1)
    for (let k = 0; k < 3; k++) { const a = k / 3 * Math.PI * 2 + 0.5; P('barstool', tx + Math.cos(a) * 0.62, ty + Math.sin(a) * 0.62, a + Math.PI) }
  }
  for (let i = 0; i < 5; i++) slot(36.0 + i * 0.95, 0.55, S, 1)
  B(35.45, 0, 40.35, 1.1, 3.2); B(35.5, 1.1, 40.3, 1.55, 1.0)

  // ================= 野兽 VIP 包间（西北 x 0..11, y 0..9）=================
  P('vipsofa', 5.5, 1.9, S); B(3.3, 1.1, 7.7, 2.7, 0.9)
  P('viptable', 5.5, 4.8, 0); B(4.5, 4.2, 6.5, 5.4, 0.6)
  P('vipsofa', 1.6, 5.4, E); B(0.8, 3.5, 2.4, 7.3, 0.9)
  P('vipsofa', 9.4, 5.4, W); B(8.6, 3.5, 10.2, 7.3, 0.9)
  for (let x = 4.2; x <= 6.8; x += 1.3) P('rope', x, 9.9, 0, { len: 1.3, vip: 1 })
  P('chips', 5.7, 4.7, 0, { seed: 99, big: 1 }); P('cards', 5.1, 4.9, 0, { seed: 9 })
  L(5.5, 4.8, 3.2, 6, '#ff4a3a', { flicker: 1 }); P('chandelier', 5.5, 4.8, 0, { vip: 1 })
  LB(5.5, 4.8, 3.0, 4.5, '#ff6040', { spot: 0.7, I: 2.2 }); LB(9.8, 8.4, 3.0, 4, '#40c070', { I: 0.8 }); for (const [vx, vy] of [[2.2, 2], [8.8, 2], [2.2, 7.6], [8.8, 7.6]]) LB(vx, vy, 3.2, 4, '#ffb070', { I: 1.3 }) // 包间壁灯
  P('planter', 10.2, 8.4, 0); B(9.7, 7.9, 10.7, 8.9)
  P('cctv', 10.4, 8.4, 0, { z: 4.2 })

  // ---- 员工门（东墙中段，锁）----
  P('staffdoor', 51.85, 24.5, W); B(51.4, 23.5, 52, 25.5)
  P('cctv', 50.6, 23.5, 0, { z: 4.5 }); P('cctv', 26, 26, 0, { z: CASINO_H - 0.4 })
  // 壁挂 TH 霓虹（南墙两侧）
  P('thsign', 8, 35.85, N, { wall: 1 }); P('thsign', 44, 35.85, N, { wall: 1 })
  // 天花板吊挂区域标识（0 老虎机 / 1 牌桌 / 2 酒吧 / 3 兑换）
  P('hangsign', 8.35, 20.2, S, { idx: 0 }); P('hangsign', 24.9, 23.6, S, { idx: 1 }); P('hangsign', 38.0, 8.6, E, { idx: 2 }); P('hangsign', 45.5, 27.0, W, { idx: 3 })
  // 洗墙灯（沿四面墙内 0.7 m、高 6.6 m，烘焙）：墙纸 / 护墙板不再死黑（ref8 背景墙是亮的）
  for (let x = 2; x < CASINO_W; x += 3.5) for (const y of [0.7, CASINO_D - 0.7]) LB(x, y, 6.6, 5, '#ffc890', { I: 0.9 })
  for (let y = 2; y < CASINO_D; y += 3.5) for (const x of [0.7, CASINO_W - 0.7]) LB(x, y, 6.6, 5, '#ffc890', { I: 0.9 })
  // 大厅普通筒灯（烘焙底光，避免死黑）
  for (let x = 2; x < CASINO_W; x += 4) for (let y = 2; y < CASINO_D; y += 4) LB(x, y, 6.9, 6, '#ffe2bc', { I: 1.2 })

  const zones: CasinoZone[] = [
    { name: '前厅', x0: X(15.5), y0: Y(27), x1: X(34.5), y1: Y(36) }, { name: '兑换台', x0: X(34.5), y0: Y(18), x1: X(52), y1: Y(36) },
    { name: '老虎机街机区', x0: X(0), y0: Y(9.3), x1: X(15.5), y1: Y(36) }, { name: '牌桌区', x0: X(15.5), y0: Y(0), x1: X(34.5), y1: Y(27) },
    { name: '环形酒吧', x0: X(34.5), y0: Y(0), x1: X(52), y1: Y(18) }, { name: '野兽 VIP 包间', x0: X(0), y0: Y(0), x1: X(11), y1: Y(9) },
    { name: '员工通道', x0: X(48), y0: Y(22), x1: X(52), y1: Y(27) },
  ]
  const F = (carpet: CarpetKind, x0: number, y0: number, x1: number, y1: number): CasinoFloor => ({ carpet, x0: X(x0), y0: Y(y0), x1: X(x1), y1: Y(y1) })
  const floors: CasinoFloor[] = [
    F('carpetVip', 0, 0, 11.15, 9.15), F('carpetTables', 11.15, 0, 15.5, 9.15), F('carpetSlots', 0, 9.15, 15.5, 36),
    F('carpetTables', 15.5, 0, 34.5, 27), F('carpetFoyer', 15.5, 27, 34.5, 36), F('carpetBar', 34.5, 0, 52, 18), F('carpetCashier', 34.5, 18, 52, 36),
  ]
  const A = (name: string, x0: number, y0: number, x1: number, y1: number): CasinoAisle => ({ name, x0: X(x0), y0: Y(y0), x1: X(x1), y1: Y(y1) })
  const aisles: CasinoAisle[] = [
    A('门 → 前厅中轴', 24.6, 29.9, 27.4, 36), A('东西主通道', 1.6, 23.9, 50.4, 26.6), A('老虎机 / 牌桌间南北主通道', 14.0, 10.0, 16.9, 34.5),
    A('牌桌 / 酒吧间南北主通道', 32.5, 0.4, 35.1, 26.6), A('前厅 → 兑换台', 34.5, 26.6, 47.8, 29.6),
  ]
  cached = { props, boxes, lights, zones, floors, aisles, walls, door: { x: X(26), y: Y(CASINO_D) }, spawn: { x: X(26), y: Y(34.2) } }
  return cached
}
