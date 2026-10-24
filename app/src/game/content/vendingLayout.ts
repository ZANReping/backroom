// [vending] 售货机重制——格位布局（渲染 / 引擎 / 交互界面三方共用，不依赖 three）
// 同一个种子在三处得出同样的品牌和每格商品，所以界面上看到的就是玻璃后面摆着的那件。
export type VendingVariant = 'normal' | 'e36'
export type VendingBrand = 'northstar' | 'almondo' | 'kopi' | 'fuyou' | 'kindred'
/** 普通机实际出的五种货（都是现成物品 type） */
export const NORMAL_PRODUCTS = ['almond', 'coffee', 'canned', 'cashew', 'luckymilk'] as const
/** Entity 36 的十种产品（维基「目前记录下的产品」）；取出后都是物品「人制品」 */
export const E36_PRODUCTS = ['meatcandy', 'spinechips', 'bloodhalf', 'bloodsoda', 'heart', 'esophagus', 'teeth', 'ears', 'drumstick', 'frostskin'] as const
export type VendingProduct = typeof NORMAL_PRODUCTS[number] | typeof E36_PRODUCTS[number]
export const PRODUCT_NAME: Record<VendingProduct, string> = {
  almond: '杏仁水', coffee: '罐装咖啡', canned: '无标签罐头', cashew: '腰果水', luckymilk: '福友豆奶',
  meatcandy: '糖纸肉块', spinechips: '脊髓薯片', bloodhalf: '半瓶血', bloodsoda: '气泡血', heart: '一颗心脏',
  esophagus: '带血的食道', teeth: '一袋牙齿', ears: '耳朵礼盒', drumstick: '「鸡腿」', frostskin: '糖霜人皮',
}
/** 界面上的一行小字（E36 的货写得像正经零食广告，更瘆人） */
export const PRODUCT_BLURB: Record<VendingProduct, string> = {
  almond: '冰镇 · 每一口都安心', coffee: '微糖 · 一罐醒神', canned: '标签被撕掉了', cashew: '颜色比杏仁水深一点', luckymilk: '四叶草牧场直供',
  meatcandy: '糖纸包装 · 入口即化', spinechips: '香脆 · 原味', bloodhalf: '常温 · 请勿摇晃', bloodsoda: '加气 · 冰镇更佳', heart: '新鲜 · 还在跳？',
  esophagus: '整根 · 不切段', teeth: '一袋 32 颗 · 不含蛀牙', ears: '礼盒装 · 送亲友', drumstick: '大份 · 骨头很长', frostskin: '撒满糖霜',
}
export const SLOT_CODES = ['A1', 'A2', 'A3', 'A4', 'B1', 'B2', 'B3', 'B4'] as const
export const NORMAL_BRANDS: VendingBrand[] = ['northstar', 'almondo', 'kopi', 'fuyou']
export const BRAND_LABEL: Record<VendingBrand, { title: string; sub: string; ink: string; accent: string; body: string; face: string }> = {
  northstar: { title: 'N★RTHSTAR', sub: 'DRAFT · SODA · COFFEE', ink: '#1f3fae', accent: '#d8262c', body: '#2b2d31', face: '#e9e8e2' },
  almondo: { title: 'ALMONDO', sub: '杏仁水 · 每一口都安心', ink: '#2f6b3d', accent: '#c9a046', body: '#2f4a3a', face: '#e4ead9' },
  kopi: { title: 'KOPI TIME', sub: 'HOT & COLD · 一罐醒神', ink: '#6b2f1c', accent: '#e38a2b', body: '#5a2a24', face: '#efe4d6' },
  fuyou: { title: '福友 LUCKY', sub: '四叶草牧场 · 豆奶与果汁', ink: '#1e4f9c', accent: '#3aa35a', body: '#24395e', face: '#e2e8f0' },
  kindred: { title: 'KINDRED', sub: 'COLA · 家的味道', ink: '#b21e24', accent: '#2a2a2a', body: '#7e2a2c', face: '#ece6dc' },
}

function prng(seed: number) {
  let s = ((Math.floor(Math.abs(seed)) * 7919) % 2147483647) || 1
  return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646 }
}
/** 普通售货机 structure 的种子（按坐标） */
export function vendingSeedOfStruct(s: { x: number; y: number; data?: Record<string, number | string | boolean | string[]> }, ox = 0, oy = 0): number {
  if (typeof s.data?.vendingSeed === 'number') return s.data.vendingSeed
  const seed = Math.abs(Math.floor((s.x + ox) * 31 + (s.y + oy) * 17)) + 1
  s.data = { ...s.data, vendingSeed: seed }
  return seed
}
/** Entity 36 的种子（按实体 id） */
export function vendingSeedOfEntity(id: number): number { return (Math.floor(Math.abs(id)) % 100000) + 4 }

export interface VendingLayout { variant: VendingVariant; brand: VendingBrand; products: VendingProduct[]; stock: number[] }
/** 品牌 + 8 格商品 + 初始库存（普通机每格 1–3 件；E36 每格 2 件，定时一瞬间补满） */
export function vendingLayout(variant: VendingVariant, seed: number): VendingLayout {
  const r = prng(seed)
  const brand: VendingBrand = variant === 'e36' ? 'kindred' : NORMAL_BRANDS[Math.floor(r() * NORMAL_BRANDS.length)]
  const pool: VendingProduct[] = variant === 'e36' ? [...E36_PRODUCTS] : ['almond', 'almond', 'coffee', 'coffee', 'canned', 'canned', 'cashew', 'luckymilk']
  for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]] }
  const products = pool.slice(0, 8)
  const stock = products.map(() => (variant === 'e36' ? VENDING_E36_STOCK : 1 + Math.floor(r() * 3)))
  return { variant, brand, products, stock }
}
export const VENDING_E36_STOCK = 2
