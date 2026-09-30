// 层级装饰：贴墙/地面贴花 + 低模道具，避开实体/物品/出口/通路
// v53：原 renderer/decorations.ts 拆分为本目录——
//   context.ts  构建上下文（rng/取点/合批桶；rng 是唯一顺序流）
//   decals.ts   仅贴图贴花（贴墙/地面平面）
//   props.ts    无碰撞低模道具
// 对外签名 buildDecorations 不变；各特征的调用顺序与拆分前逐语句一致（同一种子摆位不变）。
// 与 game/decorations/（lore 文案 + 容器注册表，数据侧）分工不同，不要混淆。
import * as THREE from 'three'
import type { GameMap } from '../../world/mapgen'
import type { LevelDef, LightSource } from '../../core/types'
import { createDecorCtx, flushDecor } from './context'
import * as decal from './decals'
import * as prop from './props'

// ---------- 层级装饰：贴墙/地面贴花 + 低模道具，避开实体/物品/出口/通路 ----------
export function* buildDecorationsJob(
m: GameMap,
def: LevelDef,
wallH: number,
g: THREE.Group,
fixtures: { mat: THREE.MeshBasicMaterial; seed: number; src?: LightSource }[],
range?: { x0: number; y0: number; x1: number; y1: number; variant?: string }, // v17：无限模式按 chunk 范围构建（含 chunk 变体）
): Generator<void, void, unknown> {
  const c = createDecorCtx(m, def, wallH, g, fixtures, range)

  switch (def.gen) {
    case 'rooms': { // L0 黄色迷宫
      decal.roomsPeelPatches(c); yield
      decal.roomsCarpetStains(c); yield
      prop.roomsTiltedLamps(c); yield
      decal.roomsFakeDoors(c); yield
      break
    }
    case 'garage': { // L1 停车场
      break
    }
    case 'pipes': { // L2 管道走廊
      decal.pipesGaugeDials(c); yield
      decal.pipesCautionTapes(c); yield
      prop.pipesDripPipes(c); yield
      prop.pipesInsulationScraps(c); yield
      break
    }
    case 'grid': { // Dedicated L3 batches supply fixtures and wall services.
      break
    }
    case 'office': { // L4 办公室
      decal.officeScatteredPapers(c); yield
      prop.officeFallenChairs(c); yield
      decal.officeWhiteboards(c); yield
      prop.officeWaterCoolers(c); yield
      break
    }
    case 'hotel': { // L5 酒店
      // Remodeled L5 supplies room-specific furniture and wall art through its generator.
      // Generic scatter added luggage carts to the empty ballroom and buried picture canvases
      // behind new wall finishes, leaving stray gold frames.
      if(def.id===5)break
      prop.hotelLuggageCarts(c); yield
      prop.hotelServiceCarts(c); yield
      decal.hotelPaintings(c); yield
      prop.hotelVases(c); yield
      break
    }

    // ================= v23：Level 6–11 与 Level 601 =================
    case 'darkhall': { // L6「Lights Out」——黑到几乎看不见，只做可触摸的东西
      decal.darkhallScratchMarks(c); yield
      prop.darkhallPipeBrackets(c); yield
      prop.darkhallDeadFlashlights(c); yield
      break
    }
    case 'ocean': { // L7「Thalassophobia」——海床与遗骸
      decal.oceanCarpetShreds(c); yield
      prop.oceanRustScraps(c); yield
      prop.oceanScatteredBones(c); yield
      break
    }
    case 'caves': { // L8「洞穴系统」——只保留立体地面装饰，不再生成墙面贴花
      prop.cavesRubble(c); yield
      prop.cavesGlowMoss(c); yield
      break
    }
    case 'suburb': { // L9「The Suburbs」——湿沥青、落叶、水洼
      // 无限 L9 的湿地/落叶堆/垃圾袋已由 chunk 生成器按道路材质摆放；跳过旧版随机满地散布，
      // 避免装饰落进住宅室内，并省去每个已加载 chunk 数十块临时几何。
      if (!m.inf) {
        decal.suburbPuddles(c); yield
        prop.suburbLeaves(c); yield
        prop.suburbTrashcans(c); yield
      }
      break
    }
    case 'field': { // L10「Bumper Crop」——车辙、干草、木料
      decal.fieldRuts(c); yield
      // 无限 L10 的干草块已经是具有贴图与碰撞的正式结构；旧有限地图才保留低模视觉占位。
      if (!m.inf) { prop.fieldHayBales(c); yield }
      prop.fieldTimber(c); yield
      break
    }
    case 'city': { // L11「不夜城」——广告柱、脚手架、施工围挡、垃圾桶
      prop.cityAdPillars(c); yield
      prop.cityScaffolds(c); yield
      prop.cityStreetTrashcans(c); yield
      decal.cityStreetSigns(c); yield
      break
    }
    case 'library': { // L601「The End」——书、阅览灯、地板蜡的反光
      decal.libraryPaintings(c); yield
      prop.libraryOpenBooks(c); yield
      prop.libraryReadingLamps(c); yield
      break
    }
  }

  yield
  flushDecor(c)
}

/** 同步兼容入口：完整耗尽装饰构建任务。 */
export function buildDecorations(
  m: GameMap,
  def: LevelDef,
  wallH: number,
  g: THREE.Group,
  fixtures: { mat: THREE.MeshBasicMaterial; seed: number; src?: LightSource }[],
  range?: { x0: number; y0: number; x1: number; y1: number; variant?: string },
) {
  const job = buildDecorationsJob(m, def, wallH, g, fixtures, range)
  let result = job.next()
  while (!result.done) result = job.next()
}
