// 预制件模块对外出口（兼容原 src/game/prefabs.ts 的全部导出）
export type { PrefabDef } from './shared'
export { PREFABS, levelOf, prefabRule, prefabsForLevel } from './all'
export { placePrefabs, placePrefabForced } from './placement'
export { scatterFeatures } from './scatter'
