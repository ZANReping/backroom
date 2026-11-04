// [spokes] 迎宾女郎（Entity 28）阶段 3：118 大堂 + 她的办公室的摆放（地图坐标，单位 m；口袋房间没有窗口偏移 = 绝对坐标）。
// mapgenOutpost.genHotelLobby 按这里放结构 / 碰撞；spokesAI 按这里走路、坐下、写海报、丢洞、放兔子；spokesRender 按这里摆道具。
// 朝向 f = atan2(dy, dx)（地图 x 东、y 南）：π/2 = 朝南（朝大堂正门），−π/2 = 朝北（朝办公室北墙的投递洞）。
// 动画约定（spokesAnim，她的 root 空间）：椅面 0.44、桌面 0.74、坐姿桌近边 z 0.24、站写桌近边 z 0.2、洞 A 口 [0.02,0.8,0.5]、发条兔 [−0.17,0,0.36]。
export type XY = { x: number; y: number }
export type Spot = XY & { f: number }
const S = Math.PI / 2, N = -Math.PI / 2

export const SPOKES_LOBBY = {
  /** 大堂前台后面（前台结构 x 19–21、y 11–12；她站在 y 10.45，桌沿在 0.55 m 外） */
  front: { x: 20.0, y: 10.45, f: S } as Spot,
  /** 大堂正门（出口格中心）——兔子跳出去的地方 */
  lobbyDoor: { x: 20.5, y: 29.2 } as XY,
  /** 放兔子的位置（前台南面的地毯上） */
  wind: { x: 20.0, y: 13.0, f: S } as Spot,
  /** 办公室门（大堂北墙 x 16、y 9 的门洞）两侧 */
  officeDoorLobby: { x: 16.5, y: 10.6 } as XY,
  officeDoorIn: { x: 16.5, y: 8.2 } as XY,
  /** 办公室：书桌后的皮椅（坐姿 root）——桌子中心在她正前方 0.59 m，1.4 × 0.7 m */
  seat: { x: 20.5, y: 4.0, f: S } as Spot,
  /** 站着写海报（桌近边 0.2 m） */
  draw: { x: 20.5, y: 4.04, f: S } as Spot,
  /** 北墙投递洞面板：中心 x、墙面 y（面板朝南）；洞 A 在 x −0.21、洞 B 在 x +0.21（面板局部 x = 世界 x） */
  holes: { x: 22.5, y: 2.0 },
  /** 丢海报的站位：洞口在她正前方 0.5 m（root +X = 西，所以站在洞右侧 0.02 m） */
  dropA: { x: 22.31, y: 2.54, f: N } as Spot,
  dropB: { x: 22.73, y: 2.54, f: N } as Spot,
  /** 桌上：铭牌（朝南、给访客看）、收音机 */
  nameplate: { x: 20.88, y: 4.84 },
  radio: { x: 20.0, y: 4.5 },
  /** 桌子碰撞格（1 × 1 瓦片）与地洞面板碰撞格 */
  deskTile: { x: 20, y: 4 },
}
const L = SPOKES_LOBBY
/** sitDesk 起点（root 偏移 [0.9, 0, −0.05]：她从座位左手边 0.9 m 走进来）→ 世界坐标 */
export function spokesSitFrom(seat: Spot = L.seat): XY {
  const c = Math.cos(seat.f), s = Math.sin(seat.f), rx = 0.9, rz = -0.05
  // root → world：+Z = 朝向、+X = 角色左侧（world = rootZ·(c,s) + rootX·(s,−c)）
  return { x: seat.x + rz * c + rx * s, y: seat.y + rz * s - rx * c }
}
/** 路线（地图坐标折线；不含起点）：AI 按顺序走 */
export const SPOKES_ROUTES: Record<string, XY[]> = {
  frontToOffice: [{ x: 18.2, y: 10.5 }, L.officeDoorLobby, { x: 16.5, y: 9.5 }, L.officeDoorIn, { x: 22.0, y: 6.0 }, { x: 22.0, y: 3.95 }, spokesSitFrom()],
  seatToDrop: [{ x: 21.7, y: 3.55 }],
  dropToWind: [{ x: 22.0, y: 6.0 }, L.officeDoorIn, { x: 16.5, y: 9.5 }, L.officeDoorLobby, { x: 17.4, y: 12.4 }, { x: L.wind.x, y: L.wind.y }],
  windToFront: [{ x: 22.2, y: 12.7 }, { x: 22.2, y: 10.45 }, { x: L.front.x, y: L.front.y }],
  frontToWind: [{ x: 22.2, y: 10.45 }, { x: 22.2, y: 12.7 }, { x: L.wind.x, y: L.wind.y }],
  frontToDoor: [{ x: 22.2, y: 10.45 }, { x: 22.2, y: 12.7 }, { x: 20.5, y: 16 }, { x: 20.5, y: 24.5 }, L.lobbyDoor],
  officeToDoor: [{ x: 21.7, y: 3.55 }, { x: 22.0, y: 6.0 }, L.officeDoorIn, { x: 16.5, y: 9.5 }, L.officeDoorLobby, { x: 18.0, y: 14 }, { x: 20.5, y: 24.5 }, L.lobbyDoor],
}
/** 办公室范围（地图格，含墙内地板）：x 16–24、y 2–8 */
export const SPOKES_OFFICE_RECT = { x0: 16, y0: 2, x1: 25, y1: 9 }
export const inSpokesOffice = (x: number, y: number) => x >= SPOKES_OFFICE_RECT.x0 && x < SPOKES_OFFICE_RECT.x1 && y >= SPOKES_OFFICE_RECT.y0 && y < SPOKES_OFFICE_RECT.y1
