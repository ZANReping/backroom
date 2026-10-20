// 物品低模（自包含，仅依赖 three）——地面/投掷物/手持展示用的小模型 + 稀有度光环底座。
// 实体模型在 entitiesMesh.ts。
import * as THREE from 'three'
import { buildSixItemMesh } from './sixItemMesh'
import { buildFlashlightMesh } from './flashlightMesh'
import { buildBandageMesh, buildCannedFoodMesh } from './supplyMesh'
import { buildBatteryMesh, buildWaterThermosMesh } from './provisionsMesh'
import { buildDetailedItemMesh } from './detailItemsMesh'
import { buildFiresaltMesh } from './firesaltMesh'
import { buildSquirtGunMesh } from './squirtGunMesh'
import { buildLiquidPainMesh, buildRoyalRationMesh, buildWarpberryMesh } from './anomalousProvisionMesh'
import { buildRefinedItemMesh, isRefinedItemType } from './refinedItemMesh'
import { buildShrimpItemMesh } from './shrimpMesh'
import { buildBentoItemMesh } from './object70Mesh'
import { velvetCakeGeometry } from './partygoerMesh'

// ---------- 物品低模 ----------
// v59：halo 选项——联机远端玩家的手持物品不显示脚底稀有度光圈（地面掉落物保留）
export function buildItemMesh(type: string, opts?: { halo?: boolean }): THREE.Group {
  const grp = new THREE.Group()
  grp.userData.itemType = type
  const em = (w: number, h: number, d: number, color: string | number, x = 0, y = 0, z = 0, rx = 0, rz = 0) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshLambertMaterial({ color, emissive: color as number, emissiveIntensity: 0.25 }))
    m.position.set(x, y, z)
    m.rotation.x = rx; m.rotation.z = rz
    grp.add(m)
    return m
  }
  // 2026-10-07：此前以方块/圆柱拼接的 55 件统一改为 refinedItemMesh（四套共享 UV 图集，≤1,200 面、≤3 批）。
  // v81：旱虾三件（旱虾 / 活旱虾 / 酥炸旱虾）与 Entity 20 实体共用奇虾几何（shrimpMesh）
  if (type === 'dryshrimp' || type === 'liveshrimp' || type === 'friedshrimp') grp.add(buildShrimpItemMesh(type))
  else if (isRefinedItemType(type)) grp.add(buildRefinedItemMesh(type))
  else switch (type) {
    // Six detailed models share UV atlases; their factory emits at most three material batches.
    case 'luckymilk': case 'capacitor': case 'skeleton': case 'rabbit': case 'pockets': case 'fuyouyu':
      grp.add(buildSixItemMesh(type)); break
    case 'almond': // 杏仁水：不锈钢保温杯轮廓 +「杏仁水」真实环绕 UV
      grp.add(buildWaterThermosMesh('almond')); break
    case 'bento': // v83 自制便当（Object 70 公文包里的那只便当盒）
      grp.add(buildBentoItemMesh()); break
    case 'canned': // 罐头：真实 UV 纸标签 + 金属卷边端盖/压槽/易拉环
      grp.add(buildCannedFoodMesh()); break
    case 'bandage': // 绷带卷：真实 UV 棉纱 + 同心卷层/纸芯/弯曲垂带/散纱
      grp.add(buildBandageMesh()); break
    case 'battery': // 电池：钢壳/绝缘环/正负极 + 做旧包装 UV
      grp.add(buildBatteryMesh()); break
    case 'crowbar': // 撬棍：弯曲管身、开叉撬头、磨损喷漆 UV
    case 'tape': // 磁带：透明卷轴窗、螺丝、纸质标签 UV
    case 'lighter': // 打火机：拉丝钢壳、铰链、风罩与火轮
      grp.add(buildDetailedItemMesh(type)); break
    case 'wallpaper': // 壁纸碎片：不规则断边、卷边与 Level 0 墙纸 UV
    case 'glowstick': // 荧光棒：透明外壳、发光液芯、端盖与挂环
      grp.add(buildDetailedItemMesh(type)); break
    case 'flashlight': { // 手电筒：与第一人称手持模型共用真实 UV 细化模型，地面版镜片不自发光
      const flashlight = buildFlashlightMesh({ orientation: 'ground', lit: false })
      flashlight.scale.setScalar(1.08)
      grp.add(flashlight)
      break
    }
    case 'coffee': // 咖啡：锥形纸杯、瓦楞杯套、杯盖、饮口与印刷 UV
      grp.add(buildDetailedItemMesh(type)); break
    // ---------- v23：Level 6–11 / Level 601 专属物品 ----------
    case 'velvetcake': { // 派对客的丝绒蛋糕：纸托 + 深红蛋糕胚 + 奶油夹心/奶油顶 + 蜡烛（顶点色单网格，与派对客手里递的那块同一几何）
      const cake = new THREE.Mesh(velvetCakeGeometry(), new THREE.MeshLambertMaterial({ vertexColors: true }))
      cake.scale.setScalar(1.15)
      grp.add(cake); break
    }
    case 'firesalt': // 火盐：带 UV 的六棱主晶、伴生晶、断晶和矿物基质
      grp.add(buildFiresaltMesh()); break
    case 'liquidpain': // 液态痛苦：实验玻璃瓶、可见液体、警告标签与防拆盖 UV
      grp.add(buildLiquidPainMesh()); break
    // ---------- v32：后室扩展物品 ----------
    case 'cashew': // 腰果水：同型保温杯，但使用歪斜乱码标签与污损暖褐配色
      grp.add(buildWaterThermosMesh('cashew')); break
    case 'knife': // 刀：带刃线的钢刃、护手、铆钉与防滑柄 UV
    case 'axe': // 斧头：楔形斧刃、斧楔、木纹柄与包覆握把
      grp.add(buildDetailedItemMesh(type)); break
    case 'squirtgun': { // 滋水枪：共享成型枪壳、透明刻度罐、泵筒、供液管与三套 UV
      const gun = buildSquirtGunMesh()
      gun.scale.setScalar(.82)
      grp.add(gun)
      break
    }
    case 'warpberry': // 迁跃浆果：多果粒、枝叶、凹点和空间涟漪 UV
      grp.add(buildWarpberryMesh()); break
    case 'royalration': // 皇家口粮：金属口粮盒、缎带、搭扣、皇冠与印刷 UV
      grp.add(buildRoyalRationMesh()); break

    // ---------- v40：此前走通用 fallback 的 12 件补齐 ----------
    case 'disinfectant': // 消毒液：泵头瓶、可见液体与英文医用标签 UV
      grp.add(buildDetailedItemMesh(type)); break
    case 'jerryflyer': { // 重制杰瑞：信众传单——对折过的纸，正面印着蓝色大鸟与几行字
      em(0.2, 0.004, 0.14, '#e4e6ee', 0, 0.006, 0, 0, 0.04)
      em(0.075, 0.002, 0.06, '#2f54c6', -0.045, 0.01, 0, 0, 0.04) // 蓝鸟图样
      em(0.012, 0.002, 0.012, '#f2c419', -0.03, 0.0115, 0.012, 0, 0.04) // 黄色眼圈
      for (let i = 0; i < 4; i++) em(0.07, 0.002, 0.008, '#3a3e52', 0.045, 0.0105, -0.035 + i * 0.022, 0, 0.04) // 文字行
      break
    }
    case 'fakelog': { // 重制杰瑞：伪装成生存日志的残页——撕边的横格纸，字迹工整
      em(0.15, 0.003, 0.2, '#e9dfc2', 0, 0.005, 0, 0, -0.06)
      for (let i = 0; i < 7; i++) em(0.12, 0.002, 0.005, i === 0 ? '#7a2a22' : '#4a4436', 0, 0.008, -0.075 + i * 0.024, 0, -0.06) // 横格上的字迹
      break
    }
    default: em(0.2, 0.2, 0.2, '#d6cfae'); grp.userData.fallback = 1 // v40：标记通用 fallback（mesh-smoke 断言零 fallback）
  }
  // 发光描边底座（按稀有度/类别配色）
  const ITEM_GLOW: Record<string, string> = {
    tape: '#ffd94d', // 胜利物品：金
    almond: '#8fd98f', canned: '#8fd98f', bento: '#8fd98f', coffee: '#8fd98f', // 补给：绿
    bandage: '#e8e2d2', sedative: '#9adfff', // 医疗：白/蓝
    battery: '#e8b93c', fuse: '#e8b93c', capacitor: '#6abfff', glowstick: '#a8e0a0', flashlight: '#e8b93c', // 电气：琥珀（电容器=瓶装闪电：蓝）
    crowbar: '#d96a4a', wrench: '#d96a4a', gas: '#d96a4a', stapler: '#d96a4a', // 武器/工具：红
    keycard: '#7fb0c9', carkey: '#7fb0c9', skeleton: '#7fb0c9', // 钥匙：冰蓝
    suit: '#9a8fd0', gloves: '#9a8fd0', rabbit: '#c9a0d0', lighter: '#c9a0d0', // 装备：紫
    silverware: '#d8d8e0', wallpaper: '#c9b458',
    // v23 新增：Level 6–11 / Level 601
    driedfruit: '#8fd98f', thingmeat: '#8fd98f', ratmeat: '#8fd98f', wheatgrain: '#8fd98f', citywater: '#8fd98f', // 补给：绿
    uvlamp: '#b06ad9', xenonmarble: '#66e0d0', // 光源：紫外紫 / 氙气蓝绿
    timber: '#d96a4a', nails: '#d96a4a', // 武器/工具：红
    housekey: '#7fb0c9', // 钥匙：冰蓝
    cavingsuit: '#9a8fd0', divemask: '#9a8fd0', rope: '#9a8fd0', pockets: '#c9a0d0', // 装备：紫
    megfolder: '#c9b458', oddbook: '#c9b458', pamphlet: '#c9b458', jerryflyer: '#c9b458', fakelog: '#c9b458', endnote: '#c9b458', welcomenote: '#c9b458', chalkstub: '#e8e2d2', // 纸物/文书
    stonekazoo: '#a8a294', presses: '#e8b93c',
    // v32 新增
    cashew: '#c9a05a', // 腰果水：褐
    luckymilk: '#a8d89a', // v54 幸运豆奶：浅绿（补给系）
    candysilver: '#c9c9d4', candybullet: '#9a9aa8', candygun: '#5a5a64', candystanley: '#d0d0c0',
    candywaste: '#d9c93a', candygenius: '#e8a0b8', candymint: '#a0d0b0', // Object 5 糖果
    manmade: '#c9a0a0', // 人制品：粉白
    firesalt: '#e8823c', liquidpain: '#d94a3a', // 火盐：橙 / 液态痛苦：红
    dryshrimp: '#b3612e', liveshrimp: '#e0864a', friedshrimp: '#d99a3a', // 旱虾：橙褐 / 活旱虾：亮橙 / 酥炸：金黄
    knife: '#d96a4a', axe: '#d96a4a', // 武器：红
    headlamp: '#e8b93c', nightvision: '#78b886', // 电气 / 低照度光学
    notebook: '#c9b458', // 纸物
    fuyouyu: '#6ad9a8', squirtgun: '#4ac9e8', // 后室异物：玉绿 / 水蓝
    warpberry: '#b06ae0', royalration: '#ffd94d', // 珍稀：紫 / 金
    // v40 新增（此前走 fallback 的 12 件）
    disinfectant: '#e8e2d2', // 医疗：白
    eaglecoin: '#e8b93c', // 货币：琥珀金
    tomatosoup: '#8fd98f', gardensalad: '#8fd98f', garlicbread: '#8fd98f', pasta: '#8fd98f',
    meatstew: '#8fd98f', pizza: '#8fd98f', lasagna: '#8fd98f', tomsspecial: '#8fd98f',
    grilledsteak: '#8fd98f', jambread: '#8fd98f', // 菜肴：补给绿
  }
  const gc = ITEM_GLOW[type] ?? '#e8b93c'
  if (opts?.halo !== false) {
    // This zero-thickness plane ring does not need separate front/back draws.
    const halo = new THREE.Mesh(new THREE.RingGeometry(0.18, 0.26, 10), new THREE.MeshBasicMaterial({ color: gc, transparent: true, opacity: 0.45, side: THREE.DoubleSide, forceSinglePass: true }))
    halo.rotation.x = -Math.PI / 2
    halo.position.y = -0.28
    grp.add(halo)
  }
  return grp
}
