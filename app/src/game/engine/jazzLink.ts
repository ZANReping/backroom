// [jazz] 爵士脑 E197 ↔ 厨师 E800 的小联动（单独一个模块，免得 chefAI / jazzAI 互相 import）：
//   live      演出进行中（jazzAI 每帧写）：餐厅演出时段营业——上菜更快（chefAI 读）
//   sauce     哈瓦那辣椒酱的暖身剩余秒数（存档 eng.hotel.jazz.sauceT）：压住「再来一份」的念头、饥饿不加快、冷库里体温掉得慢（chefAI 读）
import type { Engine } from '../engine'
const LIVE = new WeakMap<Engine, boolean>()
export const setJazzLive = (eng: Engine, on: boolean) => { LIVE.set(eng, on) }
export const jazzLive = (eng: Engine) => LIVE.get(eng) === true
export const jazzSauceWarm = (eng: Engine) => ((eng.hotel as { jazz?: { sauceT?: number } } | undefined)?.jazz?.sauceT ?? 0) > 0
/** 演出时段上菜间隔倍率 / 辣椒酱暖身时冷库体温下降倍率 */
export const JAZZ_LINK = { liveRefill: 0.5, sauceCold: 0.5 }
