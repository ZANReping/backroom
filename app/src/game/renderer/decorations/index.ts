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
export function buildDecorations(
m: GameMap,
def: LevelDef,
wallH: number,
g: THREE.Group,
fixtures: { mat: THREE.MeshBasicMaterial; seed: number; src?: LightSource }[],
range?: { x0: number; y0: number; x1: number; y1: number; variant?: string }, // v17：无限模式按 chunk 范围构建（含 chunk 变体）
) {
  const c = createDecorCtx(m, def, wallH, g, fixtures, range)

  switch (def.gen) {
    case 'rooms': { // L0 黄色迷宫
      decal.roomsPeelPatches(c)   // 墙纸剥落补丁
      decal.roomsCarpetStains(c)  // 地毯水渍反光
      prop.roomsTiltedLamps(c)    // 歪斜荧光灯
      decal.roomsFakeDoors(c)     // 远处假门
      break
    }
    case 'garage': { // L1 停车场
      prop.garageWreckCars(c)     // 废弃车（仅天鹰段）
      decal.garageOilStains(c)    // 油渍
      decal.garageParkSigns(c)    // 停车编号牌
      prop.garageTrafficCones(c)  // 交通锥
      break
    }
    case 'pipes': { // L2 管道走廊
      decal.pipesGaugeDials(c)        // 压力表盘
      decal.pipesCautionTapes(c)      // 警示带
      prop.pipesDripPipes(c)          // 滴水管 + 小水洼
      prop.pipesInsulationScraps(c)   // 保温棉破损
      break
    }
    case 'grid': { // L3 发电大厅
      prop.gridIndicatorRows(c)   // 闪烁指示灯排
      decal.gridWarnSigns(c)      // 警告标识牌
      prop.gridCableRuns(c)       // 电缆束沿墙走线
      break
    }
    case 'office': { // L4 办公室
      decal.officeScatteredPapers(c)  // 散落文件纸张
      prop.officeFallenChairs(c)      // 翻倒的转椅
      decal.officeWhiteboards(c)      // 白板残留字迹
      prop.officeWaterCoolers(c)      // 饮水机
      break
    }
    case 'hotel': { // L5 酒店
      prop.hotelLuggageCarts(c)   // 行李车
      prop.hotelServiceCarts(c)   // 客房服务推车
      decal.hotelPaintings(c)     // 油画框（含金框低模边条）
      prop.hotelVases(c)          // 走廊尽头花瓶
      break
    }

    // ================= v23：Level 6–11 与 Level 601 =================
    case 'darkhall': { // L6「Lights Out」——黑到几乎看不见，只做可触摸的东西
      decal.darkhallScratchMarks(c)   // 墙上划痕与手印
      prop.darkhallPipeBrackets(c)    // 沿墙管道支架
      prop.darkhallDeadFlashlights(c) // 被丢弃的手电
      break
    }
    case 'ocean': { // L7「Thalassophobia」——海床与遗骸
      decal.oceanCarpetShreds(c)    // 海床地毯碎片
      prop.oceanRustScraps(c)       // 锈蚀金属碎片
      prop.oceanScatteredBones(c)   // 散落骨头
      break
    }
    case 'caves': { // L8「Cave Systems」——岩壁、苔藓、被风化的路标
      decal.cavesRockWear(c)      // 岩壁风化痕
      prop.cavesRubble(c)         // 碎石堆
      prop.cavesGlowMoss(c)       // 发光苔藓斑
      decal.cavesOldRoadsigns(c)  // 风化旧路标
      break
    }
    case 'suburb': { // L9「The Suburbs」——湿沥青、落叶、水洼
      decal.suburbPuddles(c)    // 水洼
      prop.suburbLeaves(c)      // 落叶
      prop.suburbTrashcans(c)   // 垃圾桶
      break
    }
    case 'field': { // L10「Bumper Crop」——车辙、干草、木料
      decal.fieldRuts(c)      // 车辙
      prop.fieldHayBales(c)   // 干草堆
      prop.fieldTimber(c)     // 木料
      break
    }
    case 'city': { // L11「不夜城」——广告柱、脚手架、施工围挡、垃圾桶
      prop.cityAdPillars(c)       // 广告柱
      prop.cityScaffolds(c)       // 脚手架
      prop.cityStreetTrashcans(c) // 垃圾桶
      decal.cityStreetSigns(c)    // 街道标识
      break
    }
    case 'library': { // L601「The End」——书、阅览灯、地板蜡的反光
      decal.libraryPaintings(c)   // 挂画
      prop.libraryOpenBooks(c)    // 摊开在地上的书
      prop.libraryReadingLamps(c) // 阅览灯
      break
    }
  }

  flushDecor(c)
}
