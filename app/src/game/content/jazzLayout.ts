// [jazz] 爵士脑（Entity 197「Jazz Brain」）阶段 3：厨师餐厅里的舞台 / 观众区 / 吧台 / 立式钢琴 / 监控探头（世界坐标，纯函数）。
// ZAN 定稿：演出放厨师的餐厅（chefLayout 餐厅格搭台，加钢琴、吧台、监控摄像头）。
// 餐厅东北角让出一块（chefLayout.inJazzBlock，那里不摆餐桌）：
//   舞台 stage   东墙下 4 × 7 格（x1−3..x1、sy+5..sy+11），台面 0.45 m（= jazzAnim JAZZ_STAGE.h），台口朝西；北沿一段台阶（乐手上下台）。
//   观众区 aud    舞台前 7 × 7 格（x1−10..x1−4），铺地毯；站在这里 = 在听演出。
//   吧台 bar      后场墙下一排 5 格（x1−9..x1−5、sy+1），台面 1.05、近边 = 南沿（= JAZZ_BAR：站位在近边外 0.34 m、面朝北）。
//   立式钢琴      舞台东北角、背靠东墙：鼓手坐琴凳面朝东，钢琴原点在他前方 0.695 m（= JAZZ_PIANO.origin）、琴背离东墙 0.13 m。
//   监控探头      餐厅东北角墙角 2.95 m 高，对着观众区（= glanceCamera 看的那台）。
//   海报          餐厅南墙正门西边：迎宾女郎画的演出预告。
// 乐手站位（台上，面朝西 f = π）：头儿台口正中、萨克斯北、低音提琴南、鼓手在头儿身后。台口在乐手前方 1.2 m（JAZZ_STAGE.edgeZ）。
// 地图坐标 = 世界坐标 − (inf.ox, inf.oy)。
import type { ChefSite, Spot, TileRect } from './chefLayout'
import type { JazzWho } from '../renderer/jazzRig'

export const JAZZ_STAGE_H = 0.45
export const JAZZ_STEP_RUN = 0.9 // 台阶水平长度（m）
export interface JazzSite {
  key: string
  stage: TileRect
  aud: TileRect
  bar: TileRect
  /** 世界米：台上演出站位 / 吧台站位（钢琴凳给鼓手） */
  play: Record<JazzWho, Spot>
  barAt: Record<JazzWho, Spot>
  bench: Spot
  /** 台阶：台上一点 / 台下一点（乐手上下台的路点） */
  stepTop: { x: number; y: number }; stepFoot: { x: number; y: number }
  /** 钢琴结构格（舞台上，纯视觉）+ 原点（世界米，朝西 = 琴键朝鼓手） */
  piano: { x: number; y: number; ox: number; oy: number; f: number }
  /** 监控探头（世界米 + 高度）；看向 audC */
  cctv: { x: number; y: number; z: number }
  audC: { x: number; y: number }
  stageC: { x: number; y: number }
  /** 吵架劝和：头儿站位（萨克斯 / 低音提琴按 JAZZ_ARGUE 在他 root 空间里） */
  argue: Spot
  poster: { x: number; y: number }
  stools: { x: number; y: number }[]
  /** [修 E197 阶段 3] 台上谱架（世界米；= jazzRender stage 道具里的三个谱架）/ 台口两侧装饰柱（圆心 + 半径）/ 后场门（离场：先到 out 再穿过 door） */
  stands: { x: number; y: number }[]
  columns: { x: number; y: number; r: number }[]
  exit: { out: { x: number; y: number }; door: { x: number; y: number } }
  /** 餐桌（世界米中心）：走位绕开（桌面 1.5 × 1.3 + 东西两侧椅子比格子大） */
  tables: { x: number; y: number }[]
}
/** 台上谱架：stage 道具局部 [z0, x0]（台面格西北角为原点）→ 世界 (S.x0 + x0 − 0.5, S.y0 + z0 + 0.78) */
export const JAZZ_STAND_LOCAL: readonly (readonly [number, number])[] = [[3.5, 1.2], [1.6, 1.3], [5.5, 1.4]]
/** 台口两侧装饰柱（融入舞台：原本餐厅墙上的壁柱在舞台 / 吧台背后不做，挪到台口两角）：离台口 / 台侧各 0.2 m、半径 0.13、高到台面以上 3.3 m */
export const JAZZ_COLUMN = { inset: 0.2, r: 0.13, h: 3.3 }
export function jazzSiteOf(s: ChefSite): JazzSite {
  const { x1 } = s.hall, sy = s.sy, y1 = s.hall.y1
  const W = Math.PI, N = -Math.PI / 2, E = 0, S = Math.PI / 2
  const stage = { x0: x1 - 3, y0: sy + 5, x1, y1: sy + 11 }
  const aud = { x0: x1 - 10, y0: sy + 5, x1: x1 - 4, y1: sy + 11 }
  const bar = { x0: x1 - 9, y0: sy + 1, x1: x1 - 5, y1: sy + 1 }
  const by = sy + 2 + 0.34
  const bench = { x: x1 - 0.12, y: sy + 5.9, f: E }
  void W
  return {
    key: `${s.hk},${s.hr}`, stage, aud, bar,
    play: {
      leader: { x: x1 - 1.8, y: sy + 8.5, f: Math.PI },
      sax: { x: x1 - 1.7, y: sy + 6.6, f: Math.PI },
      bass: { x: x1 - 1.6, y: sy + 10.5, f: Math.PI },
      drum: { x: x1 - 0.45, y: sy + 8.6, f: Math.PI },
    },
    barAt: {
      leader: { x: x1 - 8.3, y: by, f: N },
      sax: { x: x1 - 7.0, y: by, f: N },
      bass: { x: x1 - 5.6, y: by, f: N },
      drum: bench,
    },
    bench,
    stepTop: { x: x1 - 1.5, y: sy + 5.45 }, stepFoot: { x: x1 - 1.5, y: sy + 5 - JAZZ_STEP_RUN - 0.35 },
    piano: { x: x1, y: sy + 5, ox: bench.x + 0.695, oy: bench.y, f: E },
    cctv: { x: x1 + 1 - 0.18, y: sy + 1 + 0.18, z: 2.95 },
    audC: { x: (aud.x0 + aud.x1 + 1) / 2, y: (aud.y0 + aud.y1 + 1) / 2 },
    stageC: { x: (stage.x0 + stage.x1 + 1) / 2, y: (stage.y0 + stage.y1 + 1) / 2 },
    argue: { x: x1 - 7.0, y: sy + 3.7, f: S },
    poster: { x: s.front.x - 2, y: y1 },
    stools: [{ x: x1 - 4.5, y: sy + 2.55 }, { x: x1 - 9.6, y: sy + 2.55 }],
    stands: JAZZ_STAND_LOCAL.map(([z0, x0]) => ({ x: stage.x0 + x0 - 0.5, y: stage.y0 + z0 + 0.78 })),
    columns: [{ x: stage.x0 + JAZZ_COLUMN.inset, y: stage.y0 + JAZZ_COLUMN.inset, r: JAZZ_COLUMN.r }, { x: stage.x0 + JAZZ_COLUMN.inset, y: stage.y1 + 1 - JAZZ_COLUMN.inset, r: JAZZ_COLUMN.r }],
    exit: { out: { ...s.at.swingOut }, door: { x: s.swing[1].x + 0.05, y: s.swing[1].y + 0.5 } },
    tables: s.tables.map((t) => ({ x: t.x + 0.5, y: t.y + 0.5 })),
  }
}
/** 乐手走位的静态障碍（世界米）：圆（高脚凳 / 谱架 / 台口柱 / 餐桌连椅子）+ 盒（钢琴 / 琴凳）。check:jazz 与 jazzAI 共用 */
export function jazzObstacles(js: JazzSite): { circles: { x: number; y: number; r: number }[]; boxes: { x0: number; y0: number; x1: number; y1: number }[] } {
  return {
    circles: [
      ...js.stools.map((p) => ({ x: p.x, y: p.y, r: 0.25 })),
      ...js.stands.map((p) => ({ x: p.x, y: p.y, r: 0.24 })),
      ...js.columns.map((c) => ({ x: c.x, y: c.y, r: c.r + 0.04 })),
      ...js.tables.map((p) => ({ x: p.x, y: p.y, r: 1.0 })),
    ],
    boxes: [
      { x0: js.piano.ox - 0.36, y0: js.piano.oy - 0.8, x1: js.piano.ox + 0.36, y1: js.piano.oy + 0.8 }, // 立式钢琴（琴身深 0.6、宽 1.48）
      { x0: js.bench.x - 0.22, y0: js.bench.y - 0.48, x1: js.bench.x + 0.22, y1: js.bench.y + 0.48 }, // 琴凳
    ],
  }
}
/** 台阶通道（世界米）：台下 → 台上唯一的连接（台阶 0.9 m + 台上 0.5 m） */
export const jazzInSteps = (js: JazzSite, x: number, y: number) => Math.abs(x - js.stepTop.x) <= 0.55 && y >= js.stage.y0 - JAZZ_STEP_RUN - 0.45 && y <= js.stage.y0 + 0.5
/** 台上可走（世界米，半径 r）：离台口 / 台侧边 ≥ r、离东墙幕布 ≥ 0.35 + r */
export const jazzOnStageOk = (js: JazzSite, x: number, y: number, r: number) => { const S = js.stage; return x >= S.x0 + r && x <= S.x1 + 1 - 0.35 - r && y >= S.y0 + r && y <= S.y1 + 1 - r }
/** [修 E197] 餐厅墙上的壁柱（l5Architecture：每 3 格一根，木 0.16 宽、出墙 0.12 m，从地面到檐口）在这些墙面上不做——
 *  舞台（东墙下）、吧台（后场墙下）、钢琴、监控、海报背后；舞台的「柱子」改成台口两侧的装饰柱（JAZZ_COLUMN）。
 *  参数：墙内侧那一格的瓦片坐标；props = jazzprop 结构的瓦片矩形（与之同一坐标系，l5Architecture 用地图坐标） */
export function jazzWallClear(props: readonly { x0: number; y0: number; x1: number; y1: number }[], wx: number, wy: number): boolean {
  return props.some((r) => wx >= r.x0 && wx <= r.x1 && wy >= r.y0 && wy <= r.y1)
}
/** 壁柱的世界米包围盒（l5Architecture 同参数：宽 0.16、出墙 0.022–0.142（含金线）、高 0..H−0.24）——check:jazz 用来查相交 */
export function l5PilasterBox(wx: number, wy: number, dx: number, dy: number, H: number) {
  const cx = wx + 0.5 + dx * 0.493, cy = wy + 0.5 + dy * 0.493, out0 = 0.022, out1 = 0.142
  // 出墙方向 = −(dx, dy)
  const ax = dx ? [cx - dx * out1, cx - dx * out0] : [cx - 0.08, cx + 0.08]
  const ay = dy ? [cy - dy * out1, cy - dy * out0] : [cy - 0.08, cy + 0.08]
  return { x0: Math.min(ax[0], ax[1]), x1: Math.max(ax[0], ax[1]), y0: Math.min(ay[0], ay[1]), y1: Math.max(ay[0], ay[1]), z0: 0, z1: H - 0.24 }
}
export const inTR = (r: TileRect, x: number, y: number) => x >= r.x0 && x < r.x1 + 1 && y >= r.y0 && y < r.y1 + 1
/** 世界米 → 这一点的地台高度（舞台 0.45；北沿台阶线性过渡；其余 0） */
export function jazzFloorH(js: JazzSite, x: number, y: number): number {
  const S = js.stage
  if (x >= S.x0 && x < S.x1 + 1) {
    if (y >= S.y0 && y < S.y1 + 1) return JAZZ_STAGE_H
    if (y < S.y0 && y >= S.y0 - JAZZ_STEP_RUN && x >= js.stepTop.x - 0.8 && x <= js.stepTop.x + 0.8) return JAZZ_STAGE_H * (1 - (S.y0 - y) / JAZZ_STEP_RUN)
  }
  return 0
}
/** 乐手 root 空间（+Z 正前、+X 角色左侧）→ 世界米（与 chefFromRoot 同约定） */
export const jazzFromRoot = (e: { x: number; y: number; facing: number }, rx: number, rz: number) => {
  const c = Math.cos(e.facing), s = Math.sin(e.facing)
  return { x: e.x + rx * s + rz * c, y: e.y - rx * c + rz * s }
}
export const jazzToRoot = (e: { x: number; y: number; facing: number }, wx: number, wy: number): [number, number] => {
  const dx = wx - e.x, dy = wy - e.y, c = Math.cos(e.facing), s = Math.sin(e.facing)
  return [dx * s - dy * c, dx * c + dy * s]
}
