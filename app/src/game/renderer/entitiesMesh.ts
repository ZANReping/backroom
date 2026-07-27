// 实体/物品低模（骨骼式分组：四肢/头独立 pivot，可程序化动画）
// v14：全实体模型审计+精细化——每种实体专属分支、统一正面=+X、
// 面部特征 mesh 打 userData.face 标记（验收脚本据此校验朝向质心）。
// v23：按 Backrooms Wikidot / Fandom 正文重做 hound / duller / clump / faceling /
// skinstealer / smiler / deathmoth，并补齐 Level 6–11 / Level 601 的 14 种新实体与 20 件新物品。
import * as THREE from 'three'
import { ENTITIES } from '../entities'
import { box, cyl, glow, mulberry } from './shared'

// ---------- 物品低模 ----------
export function buildItemMesh(type: string): THREE.Group {
  const grp = new THREE.Group()
  grp.userData.itemType = type
  const em = (w: number, h: number, d: number, color: string | number, x = 0, y = 0, z = 0, rx = 0, rz = 0) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshLambertMaterial({ color, emissive: color as number, emissiveIntensity: 0.25 }))
    m.position.set(x, y, z)
    m.rotation.x = rx; m.rotation.z = rz
    grp.add(m)
    return m
  }
  const cm = (rt: number, rb: number, h: number, color: string | number, x = 0, y = 0, z = 0, seg = 8, rx = 0, rz = 0): THREE.Mesh => {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), new THREE.MeshLambertMaterial({ color, emissive: color as number, emissiveIntensity: 0.2 }))
    m.position.set(x, y, z)
    m.rotation.x = rx; m.rotation.z = rz
    grp.add(m)
    return m
  }
  switch (type) {
    case 'almond': // 杏仁水：乳白瓶身 + 绿盖 + 标签带
      em(0.14, 0.26, 0.14, '#d8cfc0'); em(0.08, 0.07, 0.08, '#7a9a5a', 0, 0.17, 0)
      em(0.145, 0.07, 0.145, '#a8c9a0', 0, -0.02, 0); break
    case 'canned': // 罐头：铁罐 + 顶盖 + 标签
      cm(0.1, 0.1, 0.2, '#8a8a8a'); cm(0.105, 0.105, 0.02, '#a8a8a8', 0, 0.1, 0)
      em(0.21, 0.09, 0.21, '#b8a05a', 0, -0.02, 0); break
    case 'bandage': // 绷带卷：布卷 + 垂下布条 + 红十字
      cm(0.09, 0.09, 0.14, '#e8e2d2', 0, 0, 0, 10, Math.PI / 2)
      em(0.1, 0.02, 0.16, '#ddd6c4', 0, -0.07, 0.06)
      em(0.05, 0.015, 0.05, '#c94a3a', 0, 0.09, 0); break
    case 'battery': // 电池：金身 + 正极 + 黑负极环
      cm(0.07, 0.07, 0.2, '#c9a03a'); em(0.05, 0.04, 0.05, '#c0c0c0', 0, 0.12, 0)
      cm(0.072, 0.072, 0.04, '#3a3a3a', 0, -0.06, 0); break
    case 'crowbar': // 撬棍：主杆 + 鹅颈弯 + 分叉头
      em(0.46, 0.05, 0.05, '#a63a2e'); em(0.05, 0.12, 0.05, '#a63a2e', 0.22, 0.05, 0)
      em(0.1, 0.04, 0.05, '#8a2e22', 0.26, 0.12, 0); em(0.05, 0.09, 0.05, '#a63a2e', -0.24, 0.02, 0, 0, 0.5); break
    case 'tape': // 磁带：黑盒 + 双卷轴 + 标签窗
      em(0.26, 0.17, 0.05, '#2a2a2e'); em(0.07, 0.07, 0.06, '#d6cfae', -0.06, 0.01, 0); em(0.07, 0.07, 0.06, '#d6cfae', 0.06, 0.01, 0)
      em(0.2, 0.06, 0.052, '#8a2e22', 0, -0.05, 0); break
    case 'lighter': // 打火机：机身 + 铰链盖 + 火轮
      em(0.09, 0.13, 0.06, '#c9c2a8'); em(0.09, 0.05, 0.06, '#b0a890', 0, 0.08, 0)
      em(0.03, 0.03, 0.065, '#6a6a6a', 0.02, 0.05, 0); break
    case 'rabbit': // 幸运兔脚：腿骨 + 毛爪
      em(0.06, 0.14, 0.06, '#d8cfc0', 0, 0.05, 0); em(0.1, 0.1, 0.08, '#b8a890', 0, -0.08, 0); break
    case 'wallpaper': // 壁纸碎片：两片卷曲黄纸
      em(0.22, 0.02, 0.16, '#c9b458'); em(0.1, 0.02, 0.16, '#b8a448', 0.1, 0.03, 0, 0, 0.5); break
    case 'glowstick': { // 荧光棒：通体发光
      const gs = cm(0.03, 0.03, 0.3, '#a8e0a0', 0, 0, 0, 6, 0, 0.5)
      gs.material = new THREE.MeshBasicMaterial({ color: '#a8e0a0' })
      em(0.05, 0.03, 0.05, '#6a9a6a', -0.08, 0.1, 0); break }
    case 'flashlight': { // 手电筒：筒身 + 灯头 + 镜片（整体沿 +X 横放）
      // 修复 v20：原用 rx=π/2 把圆柱放到 Z 轴，灯头/镜片却沿 X 偏移 → 头部与筒身垂直脱节；
      // 改 rz=π/2（柱轴 +Y→-X：rt=尾部/-X，rb=前端/+X），灯头前口外扩、镜片贴前口
      cm(0.05, 0.06, 0.24, '#2a2d30', 0, 0, 0, 8, 0, Math.PI / 2)
      cm(0.06, 0.078, 0.09, '#4a4d52', 0.15, 0, 0, 8, 0, Math.PI / 2)
      const lens = cm(0.062, 0.062, 0.015, '#fff2d0', 0.2, 0, 0, 8, 0, Math.PI / 2)
      lens.material = new THREE.MeshBasicMaterial({ color: '#fff2d0' })
      em(0.04, 0.02, 0.02, '#c94a3a', -0.04, 0.06, 0); break }
    case 'carkey': // 车钥匙：遥控柄 + 按键 + 钥匙片
      em(0.07, 0.12, 0.03, '#2a2d30'); em(0.02, 0.02, 0.035, '#c94a3a', 0, 0.03, 0)
      em(0.03, 0.1, 0.015, '#b0b0b0', 0, 0.11, 0); break
    case 'skeleton': // 万能钥匙：黄铜匙环 + 杆 + 双齿
      cm(0.05, 0.05, 0.02, '#b08d46', 0, 0.11, 0, 10, Math.PI / 2)
      em(0.03, 0.16, 0.02, '#b08d46', 0, 0, 0); em(0.05, 0.02, 0.02, '#b08d46', 0.03, -0.06, 0); em(0.04, 0.02, 0.02, '#b08d46', 0.025, -0.02, 0); break
    case 'gas': // 汽油罐：罐体 + 把手 + 斜嘴
      em(0.2, 0.28, 0.14, '#a63a2e'); em(0.12, 0.03, 0.04, '#8a2e22', 0, 0.16, 0)
      em(0.05, 0.1, 0.05, '#6a3a2e', 0.07, 0.14, 0, 0, -0.4); break
    case 'wrench': // 管钳：手柄 + 活动钳口两片
      em(0.3, 0.06, 0.05, '#8a8a8a'); em(0.09, 0.05, 0.05, '#9a9a9a', -0.17, 0.045, 0, 0, 0.45); em(0.09, 0.05, 0.05, '#7a7a7a', -0.17, -0.02, 0, 0, -0.3); break
    case 'gloves': // 隔热手套：掌 + 拇指
      em(0.13, 0.18, 0.09, '#b89a2e'); em(0.05, 0.08, 0.05, '#a88a26', 0.08, -0.02, 0); break
    case 'suit': // 绝缘服（叠放）：躯干 + 头罩
      em(0.26, 0.3, 0.1, '#3a5a3a'); em(0.16, 0.12, 0.1, '#2e4a2e', 0, 0.2, 0); break
    case 'fuse': // 保险丝：陶瓷身 + 双金属帽
      cm(0.05, 0.05, 0.16, '#d9cfb0'); cm(0.06, 0.06, 0.04, '#d9b13b', 0, 0.09, 0, 6); cm(0.06, 0.06, 0.04, '#d9b13b', 0, -0.09, 0, 6); break
    case 'capacitor': // 电容器：蓝壳 + 银顶 + 双引脚
      cm(0.08, 0.08, 0.16, '#3a6a8a'); cm(0.082, 0.082, 0.02, '#c0c0c0', 0, 0.08, 0)
      em(0.02, 0.08, 0.02, '#c0c0c0', -0.03, -0.12, 0); em(0.02, 0.08, 0.02, '#c0c0c0', 0.03, -0.12, 0); break
    case 'coffee': // 咖啡：纸杯 + 盖 + 套
      cm(0.07, 0.055, 0.18, '#d8cfc0', 0, 0, 0, 8); cm(0.075, 0.075, 0.03, '#6a4a2e', 0, 0.1, 0, 8)
      cm(0.072, 0.068, 0.06, '#8a6a42', 0, -0.01, 0, 8); break
    case 'stapler': // 订书机：底座 + 上臂
      em(0.22, 0.03, 0.06, '#3a3d42'); em(0.2, 0.05, 0.05, '#4a4d52', -0.01, 0.05, 0, 0, 0.12); break
    case 'keycard': // 门禁卡：卡 + 磁条 + 芯片
      em(0.18, 0.02, 0.12, '#7fb0c9'); em(0.18, 0.021, 0.03, '#2a2d30', 0, 0, -0.035); em(0.04, 0.021, 0.04, '#d9b13b', -0.04, 0, 0.02); break
    case 'silverware': // 银餐具：叉 + 匙交叉
      em(0.2, 0.02, 0.04, '#d8d8e0', 0, 0, 0, 0, 0.5); em(0.18, 0.02, 0.05, '#c8c8d0', 0, 0.01, 0, 0, -0.5); break
    case 'sedative': // 镇定剂：针管 + 推杆 + 针头
      cm(0.045, 0.045, 0.16, '#9adfff', 0, 0, 0, 8)
      em(0.02, 0.08, 0.02, '#c0c0c0', 0, 0.12, 0); em(0.012, 0.1, 0.012, '#d8d8e0', 0, -0.13, 0); break

    // ---------- v23：Level 6–11 / Level 601 专属物品 ----------
    case 'chalkstub': // 粉笔头：磨短的粉笔 + 断口 + 落下的粉屑
      cm(0.026, 0.03, 0.1, '#e8e4d8', 0, 0, 0, 6, 0, Math.PI / 2)
      em(0.03, 0.036, 0.036, '#cfc9ba', -0.055, 0, 0)
      em(0.05, 0.008, 0.05, '#d8d4c8', 0.03, -0.045, 0.02); break
    case 'megfolder': // M.E.G. 文件夹：牛皮纸夹 + 夹页 + 徽记色块
      em(0.26, 0.02, 0.32, '#c9a86a'); em(0.24, 0.012, 0.3, '#e8e2d2', 0.006, 0.016, 0)
      em(0.26, 0.02, 0.32, '#bd9a58', 0, 0.032, -0.012, 0.07)
      em(0.08, 0.012, 0.08, '#3a5a7a', -0.06, 0.048, 0.09); break
    case 'rope': { // 尼龙绳：盘绕两圈 + 绳头
      const coil = (r: number, y: number, cc: string) => {
        const m = new THREE.Mesh(new THREE.TorusGeometry(r, 0.032, 4, 12), new THREE.MeshLambertMaterial({ color: cc }))
        m.rotation.x = Math.PI / 2; m.position.y = y; grp.add(m)
      }
      coil(0.15, 0, '#d8c9a0'); coil(0.12, 0.06, '#c9b98e')
      cm(0.028, 0.028, 0.12, '#b8a878', 0.15, 0.03, 0.05, 6, Math.PI / 2); break }
    case 'divemask': // 潜水面罩：框体 + 视窗玻璃 + 头带 + 接口
      em(0.24, 0.14, 0.06, '#2a2d30'); em(0.19, 0.09, 0.02, '#9adfff', 0, 0.01, 0.04)
      em(0.27, 0.04, 0.03, '#1a1c1e', 0, 0.02, -0.05); em(0.06, 0.06, 0.05, '#3a3d42', 0, -0.09, 0.02); break
    case 'thingmeat': // 巨兽之肉：油腻肉块 + 脂肪层 + 反光
      em(0.26, 0.09, 0.18, '#8a3a3a'); em(0.22, 0.03, 0.15, '#d8b8a8', 0, 0.05, 0)
      em(0.1, 0.02, 0.07, '#e8d0c0', 0.05, 0.07, 0.02); break
    case 'oddbook': // 来源不明的书：硬壳封面 + 书页 + 书脊
      em(0.2, 0.04, 0.26, '#4a3a5a'); em(0.18, 0.05, 0.24, '#e8e2d2', 0.012, 0.004, 0)
      em(0.03, 0.06, 0.26, '#3a2c48', -0.1, 0, 0); break
    case 'cavingsuit': // 洞穴保温服（叠放）：外层防水 + 内层抓绒 + 反光条
      em(0.26, 0.1, 0.2, '#3a5a6a'); em(0.24, 0.07, 0.18, '#6a5a3a', 0, 0.08, 0)
      em(0.26, 0.015, 0.05, '#d8d8e0', 0, 0.035, 0.05); break
    case 'xenonmarble': { // 氙气玻璃珠：半透明发光玻璃球 + 内芯
      const shell = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8),
        new THREE.MeshBasicMaterial({ color: '#66e0d0', transparent: true, opacity: 0.55 }))
      const inner = new THREE.Mesh(new THREE.IcosahedronGeometry(0.045, 0), new THREE.MeshBasicMaterial({ color: '#eafff8' }))
      grp.add(shell, inner)
      em(0.06, 0.008, 0.06, '#3a8a80', 0, -0.09, 0); break }
    case 'driedfruit': // 干果与干菜：布袋 + 扎口 + 露出的果干
      cm(0.09, 0.12, 0.16, '#a8925a'); cm(0.05, 0.07, 0.05, '#7a6a3a', 0, 0.1, 0, 6)
      em(0.05, 0.04, 0.05, '#8a4a2a', 0.04, 0.12, 0.03); em(0.04, 0.035, 0.04, '#6a3a1e', -0.03, 0.13, -0.02); break
    case 'uvlamp': { // 人工紫外灯：紫色灯管 + 两端灯座
      const tube = cm(0.035, 0.035, 0.3, '#b06ad9', 0, 0, 0, 8, 0, Math.PI / 2)
      tube.material = new THREE.MeshBasicMaterial({ color: '#b06ad9' })
      em(0.04, 0.055, 0.055, '#4a4d52', -0.16, 0, 0); em(0.04, 0.055, 0.055, '#4a4d52', 0.16, 0, 0); break }
    case 'stonekazoo': // 石卡祖笛：天然岩管 + 顶部吹孔 + 岩刺
      cm(0.045, 0.05, 0.2, '#8a8474', 0, 0, 0, 6, 0, Math.PI / 2)
      cm(0.03, 0.036, 0.06, '#7a7466', 0.02, 0.06, 0, 6)
      em(0.045, 0.04, 0.04, '#9a9484', -0.11, 0.012, 0.012); break
    case 'pockets': // Pockets（Object 51）：布袋 + 束口 + 抽绳
      cm(0.1, 0.14, 0.2, '#6a5a7a'); cm(0.06, 0.08, 0.06, '#4a3d5a', 0, 0.13, 0, 6)
      em(0.17, 0.02, 0.02, '#c9a0d0', 0, 0.15, 0); break
    case 'housekey': // 门廊钥匙：匙环 + 匙杆 + 匙齿
      cm(0.045, 0.045, 0.015, '#9a9a8a', 0, 0.1, 0, 10, Math.PI / 2)
      em(0.025, 0.14, 0.015, '#9a9a8a'); em(0.04, 0.02, 0.015, '#8a8a7a', 0.03, -0.05, 0)
      em(0.03, 0.02, 0.015, '#8a8a7a', 0.025, -0.012, 0); break
    case 'wheatgrain': // 割下的小麦：三支麦秆 + 麦穗
      for (let i = 0; i < 3; i++) {
        cm(0.008, 0.011, 0.26, '#c9b458', (i - 1) * 0.035, 0, 0, 5, 0, (i - 1) * 0.18)
        em(0.036, 0.09, 0.036, '#e8d06a', (i - 1) * 0.058, 0.15, 0, 0, (i - 1) * 0.18)
      }
      break
    case 'nails': // 一把钉子：两根交叠的钉杆 + 钉帽
      cm(0.006, 0.009, 0.17, '#9a9a9a', 0, 0, 0, 5, 0, Math.PI / 2)
      cm(0.006, 0.009, 0.17, '#8a8a8a', 0, 0.014, 0.045, 5, 0, Math.PI / 2 + 0.3)
      em(0.012, 0.032, 0.032, '#a8a8a8', -0.085, 0, 0); em(0.012, 0.032, 0.032, '#a8a8a8', -0.077, 0.038, 0.045); break
    case 'timber': // 木板：板身 + 木纹 + 钉头
      em(0.42, 0.04, 0.13, '#8a6a42'); em(0.42, 0.006, 0.02, '#6a4e30', 0, 0.023, 0.03)
      em(0.022, 0.012, 0.022, '#a8a8a8', 0.15, 0.026, -0.03); break
    case 'presses': // 压印币：三枚叠放的硬币 + 压印
      cm(0.07, 0.07, 0.014, '#c9a03a'); cm(0.07, 0.07, 0.014, '#b8912e', 0.012, 0.016, 0.008)
      cm(0.07, 0.07, 0.014, '#d9b13b', -0.008, 0.032, -0.006)
      em(0.032, 0.004, 0.032, '#8a6a1e', -0.008, 0.041, -0.006); break
    case 'pamphlet': // 宣传册：折页两面 + 印刷色块
      em(0.16, 0.01, 0.22, '#e8e2d2', -0.07, 0, 0, 0, 0.25)
      em(0.16, 0.01, 0.22, '#dcd6c4', 0.07, 0.012, 0, 0, -0.25)
      em(0.08, 0.012, 0.1, '#c94a3a', -0.07, 0.028, 0.04, 0, 0.25); break
    case 'citywater': // 市政自来水：玻璃瓶 + 水位 + 瓶盖
      cm(0.06, 0.065, 0.24, '#9fd8e8'); cm(0.058, 0.062, 0.13, '#3a8ab0', 0, -0.05, 0)
      cm(0.035, 0.035, 0.05, '#c0c0c0', 0, 0.14, 0, 6); break
    case 'endnote': // 烧焦的字条：纸片 + 焦边 + 墨迹
      em(0.2, 0.01, 0.14, '#d8cfae'); em(0.2, 0.012, 0.04, '#3a2a1e', 0, 0.001, -0.052)
      em(0.12, 0.012, 0.01, '#2a2620', -0.01, 0.008, 0.02); break

    default: em(0.2, 0.2, 0.2, '#d6cfae')
  }
  // 发光描边底座（按稀有度/类别配色）
  const ITEM_GLOW: Record<string, string> = {
    tape: '#ffd94d', // 胜利物品：金
    almond: '#8fd98f', canned: '#8fd98f', coffee: '#8fd98f', // 补给：绿
    bandage: '#e8e2d2', sedative: '#9adfff', // 医疗：白/蓝
    battery: '#e8b93c', fuse: '#e8b93c', capacitor: '#e8b93c', glowstick: '#a8e0a0', flashlight: '#e8b93c', // 电气：琥珀
    crowbar: '#d96a4a', wrench: '#d96a4a', gas: '#d96a4a', stapler: '#d96a4a', // 武器/工具：红
    keycard: '#7fb0c9', carkey: '#7fb0c9', skeleton: '#7fb0c9', // 钥匙：冰蓝
    suit: '#9a8fd0', gloves: '#9a8fd0', rabbit: '#c9a0d0', lighter: '#c9a0d0', // 装备：紫
    silverware: '#d8d8e0', wallpaper: '#c9b458',
    // v23 新增：Level 6–11 / Level 601
    driedfruit: '#8fd98f', thingmeat: '#8fd98f', wheatgrain: '#8fd98f', citywater: '#8fd98f', // 补给：绿
    uvlamp: '#b06ad9', xenonmarble: '#66e0d0', // 光源：紫外紫 / 氙气蓝绿
    timber: '#d96a4a', nails: '#d96a4a', // 武器/工具：红
    housekey: '#7fb0c9', // 钥匙：冰蓝
    cavingsuit: '#9a8fd0', divemask: '#9a8fd0', rope: '#9a8fd0', pockets: '#c9a0d0', // 装备：紫
    megfolder: '#c9b458', oddbook: '#c9b458', pamphlet: '#c9b458', endnote: '#c9b458', chalkstub: '#e8e2d2', // 纸物/文书
    stonekazoo: '#a8a294', presses: '#e8b93c',
  }
  const gc = ITEM_GLOW[type] ?? '#e8b93c'
  const halo = new THREE.Mesh(new THREE.RingGeometry(0.18, 0.26, 10), new THREE.MeshBasicMaterial({ color: gc, transparent: true, opacity: 0.45, side: THREE.DoubleSide }))
  halo.rotation.x = -Math.PI / 2
  halo.position.y = -0.28
  grp.add(halo)
  return grp
}

// ---------- 实体低模（骨骼式分组：四肢/头独立 pivot，可程序化动画）----------
// 朝向约定：模型正面 = +X（updateEntities 用 rotation.y = -e.facing 对齐移动/玩家方向）。
// 人形/正脸类模型按 +Z 建造（面部特征在 +Z），构建末期包一层 rotation.y=π/2 的内层组，
// 把正面旋到 +X，并以 userData.facesZ 标记（供追击前倾轴选择）。
// 面部特征（眼/牙/灯/面罩）统一打 userData.face=1，供朝向验收。
type PartMap = Record<string, THREE.Object3D>

export function buildEntityMesh(type: string): THREE.Group {
  const grp = new THREE.Group()
  grp.userData.entityType = type
  const def = ENTITIES[type]
  const c = def?.color ?? '#888888'
  const parts: PartMap = {}
  grp.userData.parts = parts
  const lam = (color: string | number) => new THREE.MeshLambertMaterial({ color })
  // 自发光 Lambert：高彩度伤口/黏膜/粉尘/烟雾等。刻意不用 MeshBasicMaterial——
  // 冒烟脚本按「所有 Basic 材质 mesh 的质心」判朝向，这类装饰不应参与统计。
  const emat = (color: string, inten = 0.35, opacity = 1) => new THREE.MeshLambertMaterial({
    color, emissive: new THREE.Color(color), emissiveIntensity: inten,
    transparent: opacity < 1, opacity,
  })
  const ebox = (w: number, h: number, d: number, color: string, x: number, y: number, z: number, inten = 0.35): THREE.Mesh => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), emat(color, inten))
    m.position.set(x, y, z)
    grp.add(m)
    return m
  }
  const basic = (color: string, opacity = 1) => new THREE.MeshBasicMaterial({ color, transparent: opacity < 1, opacity })
  // 球体助手（眼球/流线躯体/肉瘤）：只创建不挂载，由调用方决定父级
  const sph = (r: number, color: string | number, seg = 8, mat?: THREE.Material): THREE.Mesh =>
    new THREE.Mesh(new THREE.SphereGeometry(r, seg, Math.max(4, seg - 2)), mat ?? lam(color))
  // 关节 mesh：几何原点移到关节处（顶部），可整体旋转
  const joint = (w: number, h: number, d: number, color: string | number, x: number, y: number, z: number, part: string, mat?: THREE.Material) => {
    const geo = new THREE.BoxGeometry(w, h, d)
    geo.translate(0, -h / 2, 0)
    const m = new THREE.Mesh(geo, mat ?? lam(color))
    m.position.set(x, y, z)
    m.userData.part = part
    parts[part] = m
    grp.add(m)
    return m
  }
  // 挂在自定义 holder 上的关节肢：holder 承担预旋转/朝向。
  // renderer 只写部件自身的 rotation，不会覆盖 holder——预摆姿因此得以保留。
  const jointOn = (holder: THREE.Object3D, w: number, h: number, d: number, color: string | number, part: string) => {
    const geo = new THREE.BoxGeometry(w, h, d)
    geo.translate(0, -h / 2, 0)
    const m = new THREE.Mesh(geo, lam(color))
    m.userData.part = part
    parts[part] = m
    holder.add(m)
    return m
  }
  // 原生 +X 模型的肢体：holder 绕 Y 转 -π/2，使 renderer 写入的 rotation.x 摆动
  // 落在前后（±X）平面而不是左右；splay 为侧向外张角（写在 holder 上，不被覆盖）。
  const jointX = (w: number, h: number, d: number, color: string | number, x: number, y: number, z: number, part: string, splay = 0) => {
    const holder = new THREE.Group()
    holder.position.set(x, y, z)
    holder.rotation.y = -Math.PI / 2
    holder.rotation.z = splay
    grp.add(holder)
    return jointOn(holder, w, h, d, color, part)
  }
  // 修复 v15：tag 必须真正把部件挂入场景图——v14 多处 tag(box(...), 'torso') 未 grp.add，
  // 导致久坐者/猎犬躯干与头、运输车底盘、笑魇躯干、死亡飞蛾胸头等整件不可见。
  const tag = (m: THREE.Object3D, part: string) => { m.userData.part = part; parts[part] = m; if (!m.parent) grp.add(m); return m }
  const face = (m: THREE.Mesh) => { m.userData.face = 1; return m }
  // 双眼（+Z 面，供人形；facesX 模型需自行摆放到 +X）
  const eyes = (y: number, spread: number, color = '#ffffff', s = 0.05, z = 0.18) => {
    const e1 = face(glow(s, s, s, color, -spread, y, z))
    const e2 = face(glow(s, s, s, color, spread, y, z))
    grp.add(e1, e2)
    return [e1, e2]
  }
  // 通用人形：躯干/头/双臂/双腿独立 pivot；opts 支持分区配色与材质覆盖（半透明幽灵）
  interface HOpts { head?: string | number; limbs?: string | number; mat?: THREE.Material; armLen?: number }
  const humanoid = (h: number, bulk: number, color: string | number, opts: HOpts = {}) => {
    const lc = opts.limbs ?? color
    const armL = opts.armLen ?? h * 0.45
    const mk = (w: number, hh: number, d: number, cc: string | number, x: number, y: number, z: number) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, hh, d), opts.mat ?? lam(cc))
      m.position.set(x, y, z); grp.add(m); return m
    }
    tag(mk(0.42 * bulk, h * 0.5, 0.26 * bulk, color, 0, h * 0.55, 0), 'torso')
    tag(mk(0.3 * bulk, 0.3 * bulk, 0.28 * bulk, opts.head ?? color, 0, h * 0.93, 0), 'head')
    joint(0.12 * bulk, armL, 0.14 * bulk, lc, -0.3 * bulk, h * 0.72, 0, 'armL', opts.mat)
    joint(0.12 * bulk, armL, 0.14 * bulk, lc, 0.3 * bulk, h * 0.72, 0, 'armR', opts.mat)
    joint(0.15 * bulk, h * 0.38, 0.16 * bulk, lc, -0.12 * bulk, h * 0.38, 0, 'legL', opts.mat)
    joint(0.15 * bulk, h * 0.38, 0.16 * bulk, lc, 0.12 * bulk, h * 0.38, 0, 'legR', opts.mat)
  }
  // 在关节末端附加细节（爪/手套/靴——随肢体摆动）
  const tip = (parent: THREE.Object3D, w: number, h: number, d: number, color: string | number, y: number, z = 0) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), lam(color))
    m.position.set(0, y, z)
    parent.add(m)
    return m
  }

  switch (type) {
    case 'duller': { // 钝人（Entity 6）：约 2m；深灰近黑；皮肤干皱、局部「煮烂」破口露出紫红肌肉；
      //               没有脸也没有耳朵；手臂长得不成比例（过膝）；姿态扭曲、站姿摇晃。
      const dk = '#2f2f36', dl = '#26262c', dh = '#34343c', rip = '#6b2a4a'
      tag(box(0.42, 0.92, 0.28, dk, 0, 1.2, 0), 'torso')
      grp.add(box(0.5, 0.16, 0.3, dl, 0.02, 1.62, 0)) // 高低不齐的肩
      grp.add(box(0.12, 0.14, 0.12, dl, -0.24, 1.7, 0)) // 抬高的左肩（扭曲站姿）
      // 头：无面、无耳的拉长椭球——wiki 明确「没有脸也没有耳朵」，故不设眼睛
      const dhead = sph(0.15, dh, 8)
      dhead.scale.set(0.82, 1.42, 0.86)
      dhead.position.set(0.02, 1.82, 0)
      dhead.rotation.z = 0.17 // 歪斜的颈
      tag(dhead, 'head')
      // 无五官的正面平滑面：仅作朝向标记，不含任何五官（父级已带非等比缩放，此处按其比例配平）
      const blank = sph(0.13, '#3a3a43', 8)
      blank.scale.set(0.72, 0.9, 0.34)
      blank.position.set(0, 0, 0.12)
      face(blank); dhead.add(blank)
      // 不成比例的长臂（垂到膝下，wiki 称其还能继续伸长）
      joint(0.13, 1.3, 0.15, dl, -0.31, 1.5, 0, 'armL')
      joint(0.13, 1.36, 0.15, dl, 0.31, 1.47, 0, 'armR')
      tip(parts.armL, 0.12, 0.22, 0.13, dk, -1.32)
      tip(parts.armR, 0.12, 0.22, 0.13, dk, -1.38)
      joint(0.17, 0.74, 0.18, dl, -0.13, 0.76, 0, 'legL')
      joint(0.17, 0.74, 0.18, dl, 0.13, 0.74, 0, 'legR')
      tip(parts.legL, 0.19, 0.09, 0.26, dk, -0.72, 0.04)
      tip(parts.legR, 0.19, 0.09, 0.26, dk, -0.72, 0.04)
      for (let i = 0; i < 4; i++) grp.add(box(0.34 - i * 0.04, 0.02, 0.02, dl, 0, 1.5 - i * 0.16, 0.145)) // 干皱褶线
      // 破口/「煮烂」处露出的紫红肌肉——全身唯一的高彩度视觉锚点
      ebox(0.17, 0.13, 0.03, rip, -0.09, 1.36, 0.145, 0.5)
      ebox(0.1, 0.19, 0.03, rip, 0.14, 1.05, 0.145, 0.5)
      ebox(0.09, 0.11, 0.03, rip, -0.23, 1.55, 0.09, 0.5)
      ebox(0.12, 0.1, 0.03, rip, 0.06, 1.42, -0.15, 0.45)
      const armRip = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.17, 0.03), emat(rip, 0.5))
      armRip.position.set(0, -0.62, 0.08)
      parts.armL.add(armRip)
      break
    }
    case 'faceling': { // 无面灵（Entity 9）：与人类高度相似、头发完好，唯独完全缺失面部特征；
      //                 面部像一层皮肉绷在颅骨上，呈略鼓的「泡泡头」观感（鼓而非凹）。
      humanoid(1.7, 0.85, '#8a7f66', { limbs: '#b8ac88', head: '#c2b593' })
      const bulge = sph(0.14, '#c9bc9c', 10) // 略鼓的光滑空白脸（无任何五官）
      bulge.scale.set(0.95, 1.02, 0.62)
      bulge.position.set(0, 1.58, 0.09)
      face(bulge); grp.add(bulge)
      grp.add(box(0.28, 0.11, 0.27, '#3a2e26', 0, 1.71, -0.01)) // 头顶发块（头发完好）
      grp.add(box(0.27, 0.22, 0.1, '#33281f', 0, 1.58, -0.1)) // 后脑发
      grp.add(box(0.05, 0.17, 0.17, '#33281f', -0.12, 1.57, -0.03)) // 鬓角
      grp.add(box(0.05, 0.17, 0.17, '#33281f', 0.12, 1.57, -0.03))
      grp.add(box(0.44, 0.06, 0.28, '#6e6552', 0, 1.15, 0)) // 腰带
      break
    }
    case 'smiler': { // 笑魇（Entity 3）：完全无定形。主体 Nigrum ignem——纯黑、形态最接近「火」的
      //               不明幽质；发光的眼与齿是 Ardenti risu。
      const flame = new THREE.Group()
      flame.position.set(0, 0.95, 0)
      // 上窄下宽的火焰剪影：大小不一、带随机偏移与倾斜的黑块堆叠
      const fb = (w: number, h: number, d: number, x: number, y: number, z: number, rz: number, cc: string) => {
        const m = box(w, h, d, cc, x, y, z)
        m.rotation.z = rz; m.rotation.y = rz * 0.6
        flame.add(m)
      }
      fb(0.14, 0.34, 0.13, 0.03, 0.66, 0.01, 0.24, '#050505')
      fb(0.28, 0.4, 0.22, -0.05, 0.38, 0.02, -0.16, '#040404')
      fb(0.5, 0.5, 0.34, 0.03, 0.02, -0.02, 0.1, '#050505')
      fb(0.68, 0.46, 0.42, -0.02, -0.36, 0.01, -0.07, '#030303')
      fb(0.82, 0.36, 0.5, 0.04, -0.72, -0.03, 0.05, '#040404')
      const rng = mulberry(0x5311)
      for (let i = 0; i < 9; i++) { // 撕裂外缘的「火舌/烟缕」
        const a = rng() * Math.PI * 2
        const rr = 0.24 + rng() * 0.2
        fb(0.07 + rng() * 0.09, 0.18 + rng() * 0.26, 0.07 + rng() * 0.07,
          Math.cos(a) * rr, -0.6 + rng() * 1.3, Math.sin(a) * rr * 0.8, (rng() - 0.5) * 1.1, '#050505')
      }
      tag(flame, 'torso')
      eyes(1.36, 0.15, '#ffffff', 0.095)
      const teeth = new THREE.Group() // 齿列：细长上翘的长笑弧（比旧版更宽更弯）
      for (let i = 0; i < 11; i++) {
        const a = (i / 10 - 0.5) * 1.9
        const t = glow(0.048, 0.09 - Math.abs(a) * 0.025, 0.02, '#ffffff',
          Math.sin(a) * 0.28, 1.0 + (1 - Math.cos(a)) * 0.3, 0.2 - Math.abs(a) * 0.035)
        t.rotation.z = -a * 0.55
        face(t)
        teeth.add(t)
      }
      tag(teeth, 'teeth')
      grp.add(teeth)
      // 人形四肢：关节以非自然角度反折（悬浮，无腿）
      const sarm = (side: number, part: string) => {
        const a = joint(0.085, 0.34, 0.085, '#050505', side * 0.29, 1.24, 0, part)
        const fore = new THREE.Group()
        fore.position.y = -0.34; fore.rotation.x = 2.15 // 肘部反折
        fore.add(box(0.075, 0.33, 0.075, '#040404', 0, -0.165, 0))
        const hand = new THREE.Group()
        hand.position.y = -0.33; hand.rotation.x = -1.5 // 腕部再反折
        for (let i = 0; i < 3; i++) hand.add(box(0.02, 0.15, 0.02, '#050505', (i - 1) * 0.035, -0.075, 0))
        fore.add(hand); a.add(fore)
      }
      sarm(-1, 'armL'); sarm(1, 'armR')
      break
    }
    case 'skinstealer': { // 窃皮者（Entity 10）：高瘦、苍黄色皮肤；深凹的白色眼球；
      //                    体表覆微小凸起（似章鱼触手吸盘）；手部为尖锐附肢。
      const sc = '#c2b478', sd = '#a89a60', sh = '#cbbd83'
      humanoid(1.86, 0.9, sc, { limbs: sd, head: sh })
      // 深凹眼窝：眉骨/颧骨/眼角围成一圈外突的窝缘（前伸到 z≈0.175），
      // 纯白眼球缩在窝内（前沿 z≈0.154），窝底再垫一块深色板 → 眼睛明显内陷
      const socket = (x: number) => {
        grp.add(box(0.13, 0.04, 0.09, sd, x, 1.79, 0.13)) // 眉骨
        grp.add(box(0.13, 0.035, 0.09, sd, x, 1.665, 0.13)) // 颧骨
        grp.add(box(0.03, 0.13, 0.09, sd, x - 0.05 * Math.sign(x || 1), 1.73, 0.13)) // 外眼角
        grp.add(box(0.11, 0.1, 0.02, '#3f3a24', x, 1.73, 0.105)) // 窝底深色板
        const eb = sph(0.036, '#ffffff', 8, basic('#ffffff'))
        eb.position.set(x, 1.73, 0.118)
        face(eb); grp.add(eb)
      }
      socket(-0.075); socket(0.075)
      const rng = mulberry(0x51e)
      for (let i = 0; i < 18; i++) { // 吸盘状微小凸起
        const a = rng() * Math.PI * 2
        grp.add(box(0.022 + rng() * 0.016, 0.02 + rng() * 0.014, 0.022 + rng() * 0.016,
          rng() < 0.5 ? '#d4c894' : '#a89a60', Math.cos(a) * 0.2, 0.85 + rng() * 0.95, Math.sin(a) * 0.14))
      }
      for (const arm of [parts.armL, parts.armR]) { // 手部尖锐附肢
        tip(arm, 0.07, 0.14, 0.07, sd, -0.86)
        for (let i = 0; i < 3; i++) {
          const cl = box(0.022, 0.14, 0.022, '#5e5230', (i - 1) * 0.038, -1.0, 0.02)
          cl.rotation.x = -0.25
          arm.add(cl)
        }
      }
      break
    }
    case 'hound': { // 猎犬（Entity 8）：wiki 明确它是「人类」——病态消瘦的人形四足爬行者。
      //              前肢（手臂）加长到与后肢接近等长、肩胛高耸、脊柱前倾、肋骨与关节突出；
      //              头顶生出一大团垂落的黑色长发遮住整张脸，发帘之下是极大的嘴与尖牙；手部为利爪。（原生 +X）
      const sk = '#a1907c', sd = '#8a7867', hair = '#0a0a0d'
      // 躯干组：pivot 必须落在 y=0.55（renderer 按状态改写 torso.position.y=0.55/0.45 压低身位）
      const tg = new THREE.Group()
      tg.position.set(0, 0.55, 0)
      tg.add(box(0.46, 0.34, 0.34, sk, 0.16, 0.12, 0)) // 胸廓（前高——脊柱前倾）
      tg.add(box(0.36, 0.26, 0.3, sd, -0.2, 0.02, 0)) // 塌陷的腰
      tg.add(box(0.3, 0.32, 0.34, sk, -0.44, -0.01, 0)) // 骨盆
      tg.add(box(0.17, 0.16, 0.1, sd, 0.21, 0.3, -0.13)) // 高耸的肩胛
      tg.add(box(0.17, 0.16, 0.1, sd, 0.21, 0.3, 0.13))
      for (let i = 0; i < 4; i++) tg.add(box(0.03, 0.22, 0.36, sd, 0.3 - i * 0.11, 0.1, 0)) // 突出的肋骨
      for (let i = 0; i < 6; i++) tg.add(box(0.07, 0.08, 0.07, sd, 0.26 - i * 0.14, 0.29 - i * 0.035, 0)) // 前倾的脊线
      tag(tg, 'torso')
      // 头（pivot 在头中心）：人头轮廓 + 遮脸的黑色长发团 + 发帘下的巨口尖牙
      const hg = new THREE.Group()
      hg.position.set(0.52, 0.78, 0)
      hg.add(box(0.2, 0.24, 0.22, sk, 0, 0, 0)) // 人头颅
      hg.add(box(0.14, 0.1, 0.18, sd, 0.07, -0.1, 0)) // 颧/上颌
      const maw = box(0.17, 0.17, 0.25, '#1a0f0d', 0.1, -0.21, 0) // 极大的嘴
      face(maw); hg.add(maw)
      for (let i = 0; i < 6; i++) { // 上下两排尖牙
        const z = (i / 5 - 0.5) * 0.2
        hg.add(face(glow(0.03, 0.075, 0.028, '#efe8d8', 0.14, -0.15, z)))
        hg.add(face(glow(0.028, 0.062, 0.026, '#e0d8c6', 0.13, -0.27, z)))
      }
      hg.add(box(0.32, 0.28, 0.36, hair, -0.02, 0.15, 0)) // 头顶发团（头部最大的视觉体积）
      hg.add(box(0.13, 0.3, 0.35, hair, 0.11, 0.02, 0)) // 前垂发帘（遮住整张脸）
      hg.add(box(0.18, 0.52, 0.11, hair, 0.04, -0.1, -0.16)) // 两侧长发
      hg.add(box(0.18, 0.52, 0.11, hair, 0.04, -0.1, 0.16))
      hg.add(box(0.22, 0.54, 0.3, hair, -0.15, -0.06, 0)) // 后垂长发
      tag(hg, 'head')
      // 四肢：前肢=加长的人类手臂，与后肢接近等长（renderer 用 rotation.z 做对角步态）
      const fl = joint(0.11, 0.66, 0.12, sd, 0.3, 0.68, -0.16, 'armL')
      const fr = joint(0.11, 0.66, 0.12, sd, 0.3, 0.68, 0.16, 'armR')
      const bl = joint(0.13, 0.62, 0.14, sd, -0.42, 0.64, -0.15, 'legL')
      const br = joint(0.13, 0.62, 0.14, sd, -0.42, 0.64, 0.15, 'legR')
      for (const l of [fl, fr]) {
        tip(l, 0.13, 0.09, 0.13, sd, -0.33) // 突出的肘关节
        tip(l, 0.12, 0.07, 0.13, sk, -0.63) // 掌
        for (let i = 0; i < 4; i++) { // 利爪：向前撑地
          const cl = box(0.12, 0.022, 0.022, '#2e2620', 0.07, -0.65, (i - 1.5) * 0.036)
          cl.rotation.z = -0.3
          l.add(cl)
        }
      }
      for (const l of [bl, br]) {
        tip(l, 0.15, 0.1, 0.15, sd, -0.31) // 突出的膝关节
        l.add(box(0.22, 0.07, 0.13, sk, 0.05, -0.59, 0)) // 消瘦的脚（沿 +X 前伸）
      }
      // 保留 tail 部件名（renderer 会摆动它）：病态消瘦者外突拖曳的尾椎骨
      const tgeo = new THREE.BoxGeometry(0.26, 0.05, 0.05)
      tgeo.translate(-0.13, 0, 0)
      const tl = new THREE.Mesh(tgeo, lam(sd))
      tl.position.set(-0.6, 0.5, 0)
      tl.rotation.z = -0.32
      tag(tl, 'tail')
      break
    }
    case 'carrier': { // 运输车：机械厢体（底盘/货厢/驾驶室/风挡/保险杠/四轮/前后灯，原生 +X）
      // 修复 v15：v14 底盘（torso）从未挂入场景 → 车身悬浮于四轮之上、保险杠/车灯悬空。
      // 现把上部车体整合进 body 组并 tag 为 torso（冲撞时整体绕 z 微俯仰，轮组独立）。
      const body = new THREE.Group()
      body.add(box(1.7, 0.35, 0.95, '#4a4d45', 0, 0.42, 0)) // 底盘（连接车身与轮）
      body.add(box(1.05, 0.55, 0.85, '#3a3d38', -0.2, 0.85, 0)) // 货厢
      body.add(box(0.5, 0.5, 0.9, '#565a52', 0.55, 0.82, 0)) // 驾驶室
      body.add(box(0.03, 0.22, 0.7, '#10141a', 0.81, 0.88, 0)) // 风挡
      body.add(box(0.08, 0.14, 0.95, '#2e312c', 0.86, 0.32, 0)) // 保险杠
      body.add(box(0.04, 0.1, 0.3, '#6a7066', -0.2, 1.16, 0)) // 厢顶警示条
      const hlL = face(glow(0.14, 0.14, 0.05, '#ffeebb', 0.83, 0.48, -0.3)) // 车灯=眼睛（嵌在底盘前缘）
      const hlR = face(glow(0.14, 0.14, 0.05, '#ffeebb', 0.83, 0.48, 0.3))
      body.add(hlL, hlR)
      tag(hlL, 'hlL'); tag(hlR, 'hlR') // 已有 body 父级，tag 仅注册部件
      body.add(glow(0.08, 0.06, 0.03, '#c9302a', -0.86, 0.45, -0.3)) // 尾灯
      body.add(glow(0.08, 0.06, 0.03, '#c9302a', -0.86, 0.45, 0.3))
      tag(body, 'torso')
      const wheel = (x: number, z: number, part: string) => {
        const w = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.12, 10), lam('#1c1e1c'))
        w.rotation.x = Math.PI / 2
        w.position.set(x, 0.22, z)
        tag(w, part); grp.add(w)
        const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.13, 8), lam('#4a4d45'))
        w.add(hub)
      }
      wheel(0.55, -0.48, 'wheelFL'); wheel(0.55, 0.48, 'wheelFR')
      wheel(-0.55, -0.48, 'wheelBL'); wheel(-0.55, 0.48, 'wheelBR')
      break
    }
    case 'pipeworm': { // 管道蠕虫：六节蠕躯 + 口器环 + 獠牙 + 背脊（原生 +X）
      for (let i = 0; i < 6; i++) {
        const seg = cyl(0.22 - i * 0.02, 0.24 - i * 0.02, 0.3, i % 2 ? '#7a4a2c' : '#8a5632', -i * 0.3, 0.35, 0, 7)
        seg.rotation.z = Math.PI / 2
        tag(seg, `seg${i}`)
        grp.add(seg) // 修复：v13 起身体节段漏挂入场景（历史缺失部件 bug）
        grp.add(box(0.08, 0.06, 0.06, '#4a2c1a', -i * 0.3, 0.56 - i * 0.01, 0)) // 背脊
      }
      const mouth = cyl(0.2, 0.24, 0.16, '#8a4a2e', 0.16, 0.35, 0, 8)
      mouth.rotation.z = Math.PI / 2
      tag(mouth, 'mouth'); grp.add(mouth)
      for (let i = 0; i < 4; i++) { // 环形獠牙
        const a = (i / 4) * Math.PI * 2
        const f = face(glow(0.03, 0.08, 0.03, '#e8d8b0', 0.26, 0.35 + Math.sin(a) * 0.14, Math.cos(a) * 0.14))
        grp.add(f)
      }
      const weye1 = face(glow(0.06, 0.06, 0.06, '#ff5533', 0.1, 0.5, -0.1))
      const weye2 = face(glow(0.06, 0.06, 0.06, '#ff5533', 0.1, 0.5, 0.1))
      grp.add(weye1, weye2)
      break
    }
    case 'arcwraith': { // 电弧体：等离子核 + 内芯 + 环绕电屑 + 电缆残躯（各向对称，原生 +X）
      const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.3, 0), new THREE.MeshBasicMaterial({ color: '#9adfff' }))
      core.position.y = 1.2
      tag(core, 'core'); grp.add(core)
      const inner = new THREE.Mesh(new THREE.IcosahedronGeometry(0.16, 0), new THREE.MeshBasicMaterial({ color: '#eaf8ff' }))
      core.add(inner)
      grp.add(box(0.5, 0.5, 0.3, '#223038', 0, 0.7, 0)) // 电缆残躯
      grp.add(box(0.34, 0.4, 0.24, '#1a242c', 0, 0.3, 0))
      grp.add(box(0.2, 0.5, 0.14, '#151d24', 0, 0.55, 0.12))
      for (let i = 0; i < 4; i++) { // 环绕电屑（renderer 驱动公转）
        const s = glow(0.08, 0.02, 0.02, '#cfe8ff', 0, 1.2, 0)
        tag(s, `shard${i}`); grp.add(s)
      }
      const spark = face(glow(0.05, 0.05, 0.05, '#ffffff', 0.42, 1.28, 0)) // 前向电弧（定义正面）
      tag(spark, 'spark'); grp.add(spark)
      break
    }
    case 'insulator': { // 绝缘猎手：厚重橡胶绝缘服 + 面罩视窗 + 背部气瓶
      humanoid(1.85, 1.35, '#b89a2e', { limbs: '#a88a26' })
      grp.add(box(0.34, 0.28, 0.3, '#c9a83e', 0, 1.74, 0)) // 头盔
      const visor = face(glow(0.26, 0.08, 0.02, '#9adfff', 0, 1.74, 0.16)) // 面罩视窗
      grp.add(visor)
      grp.add(box(0.28, 0.5, 0.16, '#8a7226', 0, 1.2, -0.24)) // 背瓶
      grp.add(box(0.5, 0.06, 0.34, '#6a5a1e', 0, 0.95, 0)) // 腰带
      tip(parts.armL, 0.14, 0.12, 0.16, '#6a5a1e', -0.85) // 厚手套
      tip(parts.armR, 0.14, 0.12, 0.16, '#6a5a1e', -0.85)
      tip(parts.legL, 0.17, 0.1, 0.18, '#5a4c1a', -0.68) // 厚靴
      tip(parts.legR, 0.17, 0.1, 0.18, '#5a4c1a', -0.68)
      break
    }
    case 'copierwraith': { // 复印机幽灵：通体半透明蓝人形 + 漂浮复印纸
      const mat = new THREE.MeshLambertMaterial({ color: '#7fb0c9', transparent: true, opacity: 0.5 })
      humanoid(1.7, 0.88, '#7fb0c9', { mat })
      eyes(1.58, 0.08, '#cfe8ff', 0.05)
      const sheet = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.3, 0.01),
        new THREE.MeshLambertMaterial({ color: '#eaf4ff', transparent: true, opacity: 0.7 }))
      sheet.position.set(-0.45, 1.0, 0.2)
      tag(sheet, 'sheet'); grp.add(sheet)
      break
    }
    case 'seated': { // 久坐者：瘫坐办公椅（坐姿腿 + 扶手 + 五星椅脚）
      // 修复 v15：v14 的 torso/head 从未挂入场景（只剩一把空椅 + 悬浮四肢）；
      // 小腿悬空离地 0.11 无脚；手臂下垂整根穿过扶手。
      grp.add(box(0.5, 0.07, 0.5, '#3a352e', 0, 0.44, 0)) // 椅面
      grp.add(box(0.5, 0.6, 0.07, '#3a352e', 0, 0.78, -0.19)) // 椅背（贴住躯干，不再留缝）
      grp.add(cyl(0.04, 0.04, 0.3, '#2a2620', 0, 0.26, 0, 6)) // 气压杆
      grp.add(box(0.6, 0.04, 0.08, '#2a2620', 0, 0.05, 0)) // 五星脚（十字）
      grp.add(box(0.08, 0.04, 0.6, '#2a2620', 0, 0.05, 0))
      tag(box(0.42, 0.5, 0.3, '#6e6a5c', 0, 0.74, 0), 'torso')
      tag(box(0.26, 0.28, 0.26, '#8f8a7c', 0, 1.1, 0.02), 'head')
      grp.add(box(0.11, 0.09, 0.32, '#5a5648', -0.12, 0.5, 0.18)) // 大腿（前伸）
      grp.add(box(0.11, 0.09, 0.32, '#5a5648', 0.12, 0.5, 0.18))
      grp.add(box(0.1, 0.44, 0.1, '#4e4a3e', -0.12, 0.23, 0.32)) // 小腿（及地）
      grp.add(box(0.1, 0.44, 0.1, '#4e4a3e', 0.12, 0.23, 0.32))
      grp.add(box(0.1, 0.05, 0.2, '#3e3a30', -0.12, 0.03, 0.37)) // 鞋（踩地）
      grp.add(box(0.1, 0.05, 0.2, '#3e3a30', 0.12, 0.03, 0.37))
      joint(0.09, 0.26, 0.1, '#6e6a5c', -0.28, 0.9, 0, 'armL') // 手臂缩短搭在扶手上（不再穿模）
      joint(0.09, 0.26, 0.1, '#6e6a5c', 0.28, 0.9, 0, 'armR')
      tip(parts.armL, 0.08, 0.05, 0.12, '#8f8a7c', -0.24) // 手掌搭扶手面
      tip(parts.armR, 0.08, 0.05, 0.12, '#8f8a7c', -0.24)
      grp.add(box(0.06, 0.05, 0.3, '#2a2620', -0.3, 0.62, 0.08)) // 扶手
      grp.add(box(0.06, 0.05, 0.3, '#2a2620', 0.3, 0.62, 0.08))
      eyes(1.12, 0.07, '#ffe9b0', 0.04, 0.16)
      break
    }
    case 'bellhop': { // 侍者：酒红制服 + 金扣/帽带 + 白手套 + 黄铜行李车
      humanoid(1.8, 0.95, '#7a2e2e', { head: '#c9a58a' })
      eyes(1.68, 0.08, '#ffd9a0', 0.045)
      for (let i = 0; i < 3; i++) grp.add(glow(0.035, 0.035, 0.02, '#b08d46', 0, 1.3 - i * 0.18, 0.135)) // 金扣
      grp.add(box(0.3, 0.1, 0.28, '#7a2e2e', 0, 1.76, 0)) // 帽
      grp.add(box(0.31, 0.035, 0.29, '#b08d46', 0, 1.72, 0)) // 帽带
      grp.add(box(0.36, 0.2, 0.02, '#5e2424', 0, 0.62, -0.14)) // 衣摆后片
      tip(parts.armL, 0.1, 0.1, 0.1, '#e8e2d2', -0.8) // 白手套
      tip(parts.armR, 0.1, 0.1, 0.1, '#e8e2d2', -0.8)
      const cart = new THREE.Group() // 黄铜行李车
      cart.add(box(0.5, 0.04, 0.6, '#b08d46', 0, 0.12, 0))
      cart.add(cyl(0.025, 0.025, 0.95, '#b08d46', 0, 0.6, -0.26, 6))
      cart.add(cyl(0.025, 0.025, 0.95, '#b08d46', 0, 0.6, 0.26, 6))
      const bar = cyl(0.02, 0.02, 0.55, '#b08d46', 0, 1.05, 0, 6); bar.rotation.x = Math.PI / 2; cart.add(bar)
      const cw1 = cyl(0.07, 0.07, 0.05, '#6a5a2e', 0, 0.07, -0.2, 8); cw1.rotation.x = Math.PI / 2; cart.add(cw1)
      const cw2 = cyl(0.07, 0.07, 0.05, '#6a5a2e', 0, 0.07, 0.2, 8); cw2.rotation.x = Math.PI / 2; cart.add(cw2)
      cart.position.set(0.55, 0, 0)
      tag(cart, 'cart'); grp.add(cart)
      break
    }
    case 'mirrorself': { // 镜中人：苍白「你」+ 胸前镜片 + 纯黑眼
      humanoid(1.75, 0.9, '#d8ccc0')
      eyes(1.63, 0.08, '#0c0507', 0.05)
      const shard = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.36, 0.02),
        new THREE.MeshLambertMaterial({ color: '#dfeaf2', emissive: 0xdfeaf2, emissiveIntensity: 0.35 }))
      shard.position.set(0, 1.15, 0.14)
      face(shard); grp.add(shard)
      grp.add(box(0.2, 0.3, 0.02, '#c8d4dc', 0.05, 1.1, -0.14)) // 背部碎镜
      break
    }
    case 'deathmoth': { // 死亡飞蛾（Entity 4）：翼展约 1.5m，翅缘锯齿状不规则、翅面覆厚层灰色硬毛；
      //                 头极小与庞大身体严重不成比例；外凸的深黑色复眼；两眼之间是注射器状口器；
      //                 胸部宽厚覆深棕硬壳；腹部圆而肥大分节；腹端一对针尖状尾须；
      //                 腿短而粗壮、关节处有尖刺。（原生 +X）
      const chit = '#4a3524', chit2 = '#3a2a1c', fur = '#8f8578'
      const th = new THREE.Group() // 胸部：宽厚强健的深棕硬质外壳
      th.position.set(0.02, 0.15, 0)
      th.add(box(0.26, 0.21, 0.27, chit, 0, 0, 0))
      th.add(box(0.21, 0.08, 0.29, fur, 0, 0.11, 0)) // 背部硬毛
      th.add(box(0.22, 0.15, 0.21, chit2, -0.13, -0.02, 0))
      tag(th, 'torso')
      for (let i = 0; i < 4; i++) { // 腹部：圆而肥大、4 节递减
        const r = 0.135 - i * 0.023
        const s = cyl(r - 0.012, r, 0.16, i % 2 ? '#5a4634' : '#4a3826', -0.21 - i * 0.15, 0.11 - i * 0.014, 0, 8)
        s.rotation.z = Math.PI / 2
        grp.add(s)
      }
      for (const z of [-0.045, 0.045]) { // 尾须：一对针尖般锐利的细长突起
        const cer = cyl(0.002, 0.014, 0.22, '#2e2218', -0.88, 0.05, z, 5)
        cer.rotation.z = Math.PI / 2
        cer.rotation.y = z > 0 ? -0.3 : 0.3
        grp.add(cer)
      }
      const hg = new THREE.Group() // 头：极小，与庞大身体严重不成比例
      hg.position.set(0.2, 0.19, 0)
      hg.add(box(0.09, 0.09, 0.1, chit2, 0, 0, 0))
      for (const z of [-0.062, 0.062]) { // 外凸的深黑色复眼（大于头本身）
        const e = sph(0.055, '#08080a', 8, basic('#08080a'))
        e.position.set(0.02, 0.01, z)
        face(e); hg.add(e)
      }
      const pro = cyl(0.004, 0.018, 0.2, '#6a5a44', 0.12, -0.05, 0, 6) // 两眼之间的注射器状口器
      pro.rotation.z = -Math.PI / 2 - 0.55
      face(pro); hg.add(pro)
      tag(hg, 'head')
      const ant = (z: number, part: string) => { // 羽状触角（pivot 在基部，可抖动）
        const geo = new THREE.BoxGeometry(0.1, 0.015, 0.015); geo.translate(0.05, 0, 0)
        const a = new THREE.Mesh(geo, lam('#5a5044'))
        a.position.set(0.03, 0.32, z); a.rotation.z = 0.6; a.rotation.y = z > 0 ? 0.4 : -0.4
        for (let i = 0; i < 3; i++) a.add(box(0.012, 0.008, 0.05, '#4a4034', 0.03 + i * 0.03, 0, 0)) // 羽枝
        tag(a, part); grp.add(a)
      }
      ant(-0.03, 'antL'); ant(0.03, 'antR')
      for (let i = 0; i < 3; i++) { // 三对短而粗壮、关节处有尖刺的腿
        for (const s of [-1, 1]) {
          const lg = new THREE.Group()
          lg.position.set(0.12 - i * 0.11, 0.08, s * 0.09)
          lg.rotation.x = s * 0.95
          lg.add(box(0.055, 0.15, 0.055, chit2, 0, -0.075, 0))
          const sh = new THREE.Group()
          sh.position.y = -0.15; sh.rotation.x = -s * 1.5
          sh.add(box(0.045, 0.14, 0.045, chit, 0, -0.07, 0))
          sh.add(box(0.02, 0.06, 0.02, '#2a1e14', 0.035, -0.02, 0)) // 关节尖刺
          lg.add(sh)
          grp.add(lg)
        }
      }
      // 锯齿状不规则翅缘（THREE.Shape + ShapeGeometry）
      const jagGeo = (len: number, span: number, teeth: number) => {
        const s = new THREE.Shape()
        s.moveTo(len * 0.45, 0) // 翼根前缘
        s.lineTo(len * 0.5, span * 0.45) // 前缘外展
        s.lineTo(len * 0.12, span) // 翼尖
        for (let i = 1; i <= teeth; i++) { // 后缘锯齿（翼尖 → 翼根）
          const t = i / teeth
          const u = len * 0.12 + (-len * 0.62) * t
          const v = span * (1 - t)
          s.lineTo(u + len * 0.1, v + span * 0.02) // 齿间凹口
          s.lineTo(u, v - span * 0.03) // 齿尖
        }
        s.lineTo(len * 0.45, 0)
        return new THREE.ShapeGeometry(s)
      }
      const wmat = new THREE.MeshLambertMaterial({ color: '#8a7a5a', side: THREE.DoubleSide })
      const wmat2 = new THREE.MeshLambertMaterial({ color: '#6a5a42', side: THREE.DoubleSide })
      const wing = (dir: number, part: string) => { // dir=-1 左翼(-Z) / +1 右翼(+Z)
        const pivot = new THREE.Group()
        pivot.position.set(0, 0.18, dir * 0.06)
        const fore = new THREE.Mesh(jagGeo(0.62, 0.66, 5), wmat)
        fore.rotation.x = (dir * Math.PI) / 2 // shape 的 +v 落到 ±Z
        fore.position.set(0.04, 0, dir * 0.03)
        const hind = new THREE.Mesh(jagGeo(0.4, 0.42, 4), wmat2)
        hind.rotation.x = (dir * Math.PI) / 2
        hind.position.set(-0.24, -0.02, dir * 0.04)
        pivot.add(fore, hind)
        for (let i = 0; i < 4; i++) pivot.add(box(0.13, 0.014, 0.05, fur, 0.17 - i * 0.06, 0.014, dir * (0.14 + i * 0.12))) // 厚层灰色硬毛
        pivot.userData.wing = dir
        tag(pivot, part)
        grp.add(pivot)
      }
      wing(-1, 'wingL'); wing(1, 'wingR')
      break
    }
    case 'clump': { // 团块（Entity 5）：a bundle of human limbs——数十条长短粗细不一的人类手臂与腿
      //              放射状聚合成的球状物，没有统一躯干；一条远超其余长度的主臂；
      //              团块缝隙中露出散落的眼睛与耳朵，以及一张满是剃刀般利齿的嘴。（不同肢体不同肤色）
      const skins = ['#b89a7e', '#8a6a52', '#c2a888', '#6e5442', '#a4846a', '#d0b89a', '#7a5c48', '#9a7a60']
      const rng = mulberry(0x5c1a)
      const core = new THREE.Group() // 球心：肢体交汇的肉团（无解剖学躯干）
      core.position.set(0, 0.62, 0)
      core.add(new THREE.Mesh(new THREE.IcosahedronGeometry(0.4, 0), lam('#6a5240')))
      core.add(sph(0.26, '#5a4638', 7).translateX(0.2))
      core.add(sph(0.22, '#7a6248', 7).translateY(0.22))
      core.add(sph(0.2, '#544232', 7).translateZ(-0.2))
      tag(core, 'torso')
      // 放射状肢体束：12 条绕球心分布，长短粗细不一、不同肤色拼贴
      const limb = (dir: THREE.Vector3, len: number, w: number, cc: string, foot: boolean) => {
        const g2 = new THREE.Group()
        g2.position.copy(dir.clone().multiplyScalar(0.3)).add(new THREE.Vector3(0, 0.62, 0))
        g2.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), dir)
        g2.add(box(w, len * 0.55, w, cc, 0, -len * 0.28, 0))
        const lo = new THREE.Group() // 肘/膝以下反折一次
        lo.position.y = -len * 0.55
        lo.rotation.x = 0.35 + rng() * 0.7
        lo.add(box(w * 0.86, len * 0.45, w * 0.86, cc, 0, -len * 0.23, 0))
        if (foot) lo.add(box(w * 1.25, w * 0.7, w * 2.1, cc, 0, -len * 0.45, w * 0.55)) // 脚掌
        else for (let k = 0; k < 3; k++) lo.add(box(w * 0.3, len * 0.13, w * 0.3, cc, (k - 1) * w * 0.36, -len * 0.5, 0)) // 手指
        g2.add(lo)
        grp.add(g2)
      }
      for (let i = 0; i < 12; i++) {
        const yv = 0.9 - (i + 0.5) / 8.5 // 覆盖球体上四分之三（朝下的肢体缩短，避免穿地）
        const rr = Math.sqrt(Math.max(0.02, 1 - yv * yv))
        const a = i * 2.39996
        limb(new THREE.Vector3(Math.cos(a) * rr, yv, Math.sin(a) * rr).normalize(),
          (0.32 + rng() * 0.42) * (yv < -0.12 ? 0.5 : 1), 0.075 + rng() * 0.055,
          skins[i % skins.length], i % 2 === 0)
      }
      // 主臂：远超其余长度的一条（holder 预抬到前上方，renderer 的 rotation.x 在此基础上抓挠蠕动）
      const mainHold = new THREE.Group()
      mainHold.position.set(-0.24, 0.82, 0.26)
      mainHold.rotation.x = -1.15; mainHold.rotation.z = 0.3
      grp.add(mainHold)
      const mainArm = jointOn(mainHold, 0.13, 1.5, 0.13, '#c2a888', 'armL')
      const mainFore = new THREE.Group()
      mainFore.position.y = -1.5; mainFore.rotation.x = 0.5
      mainFore.add(box(0.11, 0.5, 0.11, '#d0b89a', 0, -0.25, 0))
      for (let k = 0; k < 4; k++) mainFore.add(box(0.028, 0.19, 0.028, '#d0b89a', (k - 1.5) * 0.035, -0.6, 0)) // 长指
      mainArm.add(mainFore)
      // 次臂与三条触手（rotation.z 预摆姿不会被 renderer 覆盖）
      const sideHold = new THREE.Group()
      sideHold.position.set(0.3, 0.8, 0.22); sideHold.rotation.x = -0.9; sideHold.rotation.z = -0.4
      grp.add(sideHold)
      const armR = jointOn(sideHold, 0.11, 0.6, 0.11, '#8a6a52', 'armR')
      tip(armR, 0.13, 0.09, 0.14, '#a4846a', -0.62)
      const tent = (part: string, x: number, y: number, z: number, rx: number, rz: number, len: number, cc: string) => {
        const h = new THREE.Group()
        h.position.set(x, y, z); h.rotation.x = rx; h.rotation.z = rz
        grp.add(h)
        jointOn(h, 0.065, len, 0.065, cc, part)
      }
      tent('t1', -0.32, 0.9, -0.16, 0.7, 0.6, 0.44, '#6e5442')
      tent('t2', 0.24, 1.0, -0.04, -0.4, -0.7, 0.38, '#a4846a')
      tent('t3', 0.06, 0.98, 0.22, -1.2, 0.1, 0.34, '#7a5c48')
      // 缝隙中露出的散落眼睛
      const clumpEye = (x: number, y: number, z: number, s: number) => {
        const e = face(glow(s, s, s, '#e8e2d2', x, y, z))
        e.add(glow(s * 0.45, s * 0.45, s * 0.3, '#1a1210', 0, 0, s * 0.4))
        grp.add(e)
      }
      clumpEye(0.02, 0.9, 0.36, 0.07); clumpEye(-0.22, 0.62, 0.35, 0.05)
      clumpEye(0.26, 0.74, 0.3, 0.045); clumpEye(0.06, 0.48, 0.4, 0.04)
      for (const [ex, ey, ez, ry] of [[-0.3, 0.78, 0.2, 0.9], [0.32, 0.5, 0.18, -1.1], [-0.06, 1.02, 0.12, 0.3]]) { // 缝隙中的耳朵
        const ear = box(0.03, 0.12, 0.1, '#c2a888', ex, ey, ez)
        ear.rotation.y = ry; ear.rotation.z = 0.3
        grp.add(ear)
      }
      const maw = box(0.3, 0.15, 0.06, '#2a1a14', 0.05, 0.34, 0.36) // 满是剃刀般利齿的嘴
      face(maw); grp.add(maw)
      for (let i = 0; i < 9; i++) {
        const t = face(glow(0.028, 0.055, 0.02, '#f0ece0', 0.05 + (i / 8 - 0.5) * 0.26, 0.34 + (i % 2 ? 0.03 : -0.03), 0.39))
        t.rotation.z = (i % 2 ? 1 : -1) * 0.16
        grp.add(t)
      }
      break
    }

    // ==================== v23：Level 6–11 / Level 601 ====================
    case 'mimicry': { // 模仿者（Level 6）：黑暗中的类人剪影，深色、轮廓模糊、无面部细节，
      //                只有一张过大的嘴（用于复制人声）。低调、不发光。
      humanoid(1.82, 0.95, '#20242a', { limbs: '#1a1e24', head: '#242830' })
      const blur = new THREE.MeshLambertMaterial({ color: '#181c22', transparent: true, opacity: 0.34 })
      for (const [w, h, d, y] of [[0.58, 0.66, 0.42, 1.02], [0.46, 0.38, 0.38, 1.7], [0.52, 0.52, 0.38, 0.5]]) {
        const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), blur) // 轮廓模糊：外层柔化壳
        m.position.set(0, y, 0)
        grp.add(m)
      }
      const maw = box(0.24, 0.12, 0.03, '#08090b', 0, 1.63, 0.125) // 过大的嘴（口腔深处）
      face(maw); grp.add(maw)
      const gum = ebox(0.22, 0.09, 0.02, '#3a2429', 0, 1.63, 0.118, 0.16) // 微亮的口腔内壁（不自发光）
      face(gum)
      grp.add(box(0.27, 0.022, 0.03, '#14171c', 0, 1.7, 0.135)) // 上唇
      grp.add(box(0.27, 0.022, 0.03, '#14171c', 0, 1.56, 0.135)) // 下唇
      break
    }
    case 'tiny': { // 小不点（Entity 720）：海洋捕食者——流线型鱼雷状躯体 + 巨大的侧向听觉耳廓 + 小眼。（原生 +X）
      const bc = '#5a7a86', bd = '#44606b', bl = '#7d9aa4'
      const body = new THREE.Group()
      body.position.set(0, 0.9, 0)
      const hull = sph(0.34, bc, 10)
      hull.scale.set(2.1, 0.92, 0.9) // 鱼雷形
      body.add(hull)
      body.add(box(0.34, 0.2, 0.04, bd, -0.1, 0.3, 0)) // 背鳍
      body.add(box(0.24, 0.04, 0.16, bd, 0.12, -0.12, -0.26)) // 胸鳍
      body.add(box(0.24, 0.04, 0.16, bd, 0.12, -0.12, 0.26))
      body.add(box(0.26, 0.1, 0.1, bd, -0.72, 0.02, 0)) // 尾柄
      body.add(box(0.06, 0.52, 0.04, bd, -0.86, 0.04, 0)) // 尾鳍
      tag(body, 'torso')
      const hg = new THREE.Group()
      hg.position.set(0.62, 0.94, 0)
      const snout = cyl(0.03, 0.18, 0.3, bl, 0.06, -0.02, 0, 8) // 尖吻
      snout.rotation.z = -Math.PI / 2
      hg.add(snout)
      for (const z of [-0.2, 0.2]) { // 巨大的侧向耳廓/听觉器官
        const ear = box(0.26, 0.36, 0.03, bd, -0.08, 0.06, z)
        ear.rotation.y = z > 0 ? -0.55 : 0.55
        ear.rotation.z = 0.25
        hg.add(ear)
        hg.add(box(0.06, 0.14, 0.06, bl, -0.04, 0.02, z * 0.55)) // 耳基
      }
      for (const z of [-0.1, 0.1]) hg.add(face(glow(0.035, 0.035, 0.035, '#1a1214', 0.06, 0.06, z))) // 小眼
      hg.add(box(0.14, 0.05, 0.16, '#241a1c', 0.15, -0.09, 0)) // 口裂
      for (let i = 0; i < 5; i++) hg.add(face(glow(0.02, 0.04, 0.02, '#e8e2d2', 0.19, -0.09, (i / 4 - 0.5) * 0.13))) // 齿
      tag(hg, 'head')
      break
    }
    case 'thething': { // 7 层之物：巨兽（约 4.6m 长）。器官长在不该长的位置——鳍与鳃错位生长、
      //                 器官呈堆叠状；体表覆一层与雾几乎相同的细白粉尘。（原生 +X）
      const dark = '#2e3a40', dk2 = '#263136', organ = '#3f4a44'
      const rng = mulberry(0x7107)
      const body = new THREE.Group()
      body.position.set(0, 1.5, 0)
      const mass = (r: number, sx: number, sy: number, sz: number, x: number, y: number, cc: string) => {
        const m = sph(r, cc, 9)
        m.scale.set(sx, sy, sz); m.position.set(x, y, 0)
        body.add(m)
      }
      mass(0.8, 1.15, 0.95, 1.0, 0.5, 0, dark) // 胸腔
      mass(0.72, 1.35, 0.9, 0.85, -0.9, -0.08, dk2) // 中段
      mass(0.5, 1.25, 0.75, 0.62, -2.0, -0.12, dark) // 尾段
      mass(0.24, 1.3, 0.6, 0.4, -2.9, -0.1, dk2) // 尾根
      for (let i = 0; i < 5; i++) { // 堆叠错位的器官团
        const o = sph(0.2 + rng() * 0.16, organ, 7)
        o.position.set(1.0 - i * 0.75, 0.3 + rng() * 0.5, (rng() - 0.5) * 1.0)
        body.add(o)
      }
      tag(body, 'torso')
      for (let i = 0; i < 9; i++) { // 错位生长的鳍：随机贴在背/腹/侧面，方向各异
        const fin = box(0.5 + rng() * 0.4, 0.5 + rng() * 0.45, 0.06, i % 2 ? dk2 : dark,
          1.0 - i * 0.5, 1.5 + (rng() - 0.5) * 1.5, (rng() - 0.5) * 1.5)
        fin.rotation.set(rng() * 2.4, rng() * 3, rng() * 2.4)
        grp.add(fin)
      }
      for (let i = 0; i < 4; i++) { // 错位的鳃裂（多数已不具功能）
        const gx = 0.9 - i * 0.9, gy = 1.2 + (rng() - 0.5) * 1.2, gz = (rng() < 0.5 ? -1 : 1) * (0.5 + rng() * 0.5)
        for (let k = 0; k < 4; k++) grp.add(box(0.05, 0.34 - k * 0.04, 0.1, '#1a2226', gx - k * 0.09, gy, gz))
      }
      for (let i = 0; i < 7; i++) { // 体表覆盖的细白粉尘层
        const d = new THREE.Mesh(new THREE.BoxGeometry(0.7 + rng() * 0.7, 0.16, 0.6 + rng() * 0.6), emat('#c9cec8', 0.1, 0.5))
        d.position.set(1.0 - i * 0.62, 2.0 + (rng() - 0.5) * 0.7, (rng() - 0.5) * 0.9)
        d.rotation.set((rng() - 0.5) * 0.5, rng() * 3, (rng() - 0.5) * 0.5)
        grp.add(d)
      }
      const hg = new THREE.Group() // 前端：巨口（它杀光了这片海里的一切）
      hg.position.set(1.55, 1.4, 0)
      hg.add(box(0.7, 0.85, 0.95, dark, 0, 0, 0))
      hg.add(box(0.3, 0.4, 0.8, '#0e1416', 0.4, -0.12, 0)) // 口腔深处
      for (let i = 0; i < 7; i++) {
        const z = (i / 6 - 0.5) * 0.72
        hg.add(face(glow(0.07, 0.19, 0.06, '#e0dccc', 0.42, 0.08, z))) // 上排巨齿
        hg.add(face(glow(0.06, 0.15, 0.05, '#cfc9b8', 0.4, -0.34, z))) // 下排
      }
      tag(hg, 'head')
      break
    }
    case 'wrangler': { // 缠斗者：蛇形巨躯——10 节递减圆柱蜿蜒；前端是一颗类人的头，
      //                 白色发光的双眼，嘴部是一个令人不安的宽阔笑容。（原生 +X）
      // renderer 会把 seg0..5 的 y 钉在 0.35（分节蠕动），故整体挂在抬高 0.55 的 hold 内。
      const hold = new THREE.Group()
      hold.position.y = 0.55
      grp.add(hold)
      const sc1 = '#4a3c34', sc2 = '#3d3129'
      for (let i = 0; i < 10; i++) {
        const r = 0.44 - i * 0.032
        const s = cyl(r - 0.02, r, 0.46, i % 2 ? sc1 : sc2, -i * 0.42, 0.35, Math.sin(i * 0.8) * 0.42, 8)
        s.rotation.z = Math.PI / 2
        s.rotation.y = Math.cos(i * 0.8) * 0.5 // 顺着蜿蜒方向摆正
        hold.add(s)
        if (i < 6) tag(s, `seg${i}`) // 前 6 节复用 renderer 的分节蠕动
        hold.add(box(0.1, 0.09, 0.09, '#2e241e', -i * 0.42, 0.35 + r * 0.9, Math.sin(i * 0.8) * 0.42)) // 背脊角质
      }
      // 颈：包一层组再 tag——renderer 会改写 torso.rotation.z（追击昂身），
      // 直接 tag 躺倒的圆柱会被复位成竖立
      const neck = new THREE.Group()
      neck.position.set(0.3, 0.35, 0)
      const nc = cyl(0.4, 0.44, 0.42, sc1, 0, 0, 0, 8)
      nc.rotation.z = Math.PI / 2
      neck.add(nc)
      hold.add(neck); tag(neck, 'torso')
      const hg = new THREE.Group() // 类人的头
      hg.position.set(0.72, 0.42, 0)
      hg.add(box(0.42, 0.46, 0.42, '#5a4a40', 0, 0, 0))
      hg.add(box(0.3, 0.17, 0.36, '#4e4036', 0.2, -0.16, 0)) // 下颌
      hg.add(box(0.12, 0.1, 0.36, '#4e4036', 0.24, 0.16, 0)) // 眉弓
      for (const z of [-0.13, 0.13]) hg.add(face(glow(0.1, 0.08, 0.08, '#ffffff', 0.19, 0.08, z))) // 白色发光的双眼
      for (let i = 0; i < 11; i++) { // 宽阔的笑容：一排白色发光牙组成的长弧
        const a = (i / 10 - 0.5) * 1.55
        const t = face(glow(0.035, 0.075, 0.05, '#f2f2ea', 0.23 - Math.abs(a) * 0.03,
          -0.12 + (1 - Math.cos(a)) * 0.22, Math.sin(a) * 0.2))
        t.rotation.x = a * 0.4
        hg.add(t)
      }
      hold.add(hg); tag(hg, 'head')
      break
    }
    case 'camocrawler': { // 迷彩爬行者：失明（头部无眼，靠回声定位）；四条手臂——前一对着地爬行、
      //                    后一对更粗壮专职投掷（抓着一块石头）；低伏四足姿态。（原生 +X）
      const cc1 = '#5c5a4a', cc2 = '#4c4a3c', cc3 = '#6a6754'
      const body = new THREE.Group()
      body.position.set(0, 0.72, 0)
      body.add(box(0.92, 0.4, 0.5, cc1, 0, 0, 0))
      body.add(box(0.52, 0.46, 0.48, cc2, -0.5, -0.05, 0)) // 粗壮的后胯（投掷发力）
      body.add(box(0.36, 0.32, 0.36, cc1, 0.5, 0.02, 0)) // 肩带
      for (const [px, py, pz, s] of [[0.2, 0.2, 0.1, 0.2], [-0.3, 0.18, -0.14, 0.16], [0.05, 0.16, 0.24, 0.14]]) {
        body.add(box(s * 1.6, 0.05, s, cc3, px, py, pz)) // 岩色迷彩斑块
      }
      tag(body, 'torso')
      const hg = new THREE.Group()
      hg.position.set(0.8, 0.68, 0)
      hg.add(box(0.3, 0.27, 0.27, cc3, 0, 0, 0)) // 光滑无特征的头（失明，无眼）
      hg.add(box(0.17, 0.14, 0.2, cc3, 0.2, -0.05, 0))
      for (const z of [-0.07, 0.07]) hg.add(face(box(0.05, 0.06, 0.06, '#171512', 0.28, 0.02, z))) // 回声定位孔
      hg.add(box(0.1, 0.05, 0.2, '#241c16', 0.24, -0.13, 0)) // 口裂
      for (let i = 0; i < 4; i++) hg.add(face(glow(0.02, 0.045, 0.02, '#ded4bc', 0.27, -0.14, (i / 3 - 0.5) * 0.14)))
      for (const z of [-0.14, 0.14]) { // 一对大耳（回声定位）
        const ear = box(0.06, 0.3, 0.22, cc2, -0.02, 0.22, z)
        ear.rotation.x = z > 0 ? 0.3 : -0.3
        ear.rotation.z = -0.2
        hg.add(ear)
      }
      tag(hg, 'head')
      jointX(0.12, 0.64, 0.13, cc2, 0.55, 0.66, -0.2, 'armL', -0.12) // 前一对手臂：着地爬行
      jointX(0.12, 0.64, 0.13, cc2, 0.55, 0.66, 0.2, 'armR', 0.12)
      for (const a of [parts.armL, parts.armR]) {
        tip(a, 0.14, 0.07, 0.16, cc3, -0.64, 0.04)
        for (let i = 0; i < 3; i++) a.add(box(0.1, 0.03, 0.03, '#33312a', 0, -0.66, (i - 1) * 0.05))
      }
      jointX(0.15, 0.6, 0.16, cc1, -0.45, 0.96, -0.24, 't1', -0.18) // 后一对手臂：更粗壮，专职投掷
      jointX(0.15, 0.6, 0.16, cc1, -0.45, 0.96, 0.24, 't2', 0.18)
      parts.t1.rotation.x = 1.9 // 抬起前伸的投掷姿（renderer 不驱动 t1/t2，预摆姿保留）
      parts.t2.rotation.x = 1.9
      for (const a of [parts.t1, parts.t2]) tip(a, 0.16, 0.1, 0.17, cc3, -0.62)
      const rock = new THREE.Mesh(new THREE.IcosahedronGeometry(0.24, 0), lam('#6e6a5e')) // 抓着的巨石
      rock.position.set(0.12, 1.22, 0)
      rock.rotation.set(0.4, 0.8, 0.3)
      grp.add(rock)
      jointX(0.15, 0.52, 0.16, cc2, -0.58, 0.52, -0.22, 'legL', -0.1) // 短后肢（支撑后半身）
      jointX(0.15, 0.52, 0.16, cc2, -0.58, 0.52, 0.22, 'legR', 0.1)
      for (const l of [parts.legL, parts.legR]) tip(l, 0.15, 0.08, 0.2, cc3, -0.52, 0.03)
      break
    }
    case 'lightguide': { // 引路者（Entity 35）：发光的「缀满宝石的星星」——核心 + 8 根向外辐射的
      //                   发光尖刺，全部蓝绿色 MeshBasicMaterial，直径约 0.4m，悬浮。（原生 +X）
      const gm = basic('#66e0d0'), gm2 = basic('#8ff0e2'), gm3 = basic('#eafff8')
      const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.1, 0), gm)
      core.position.set(0, 1.2, 0)
      tag(core, 'core') // renderer 驱动核心自转，尖刺作为子级一起翻滚
      const up = new THREE.Vector3(0, 1, 0)
      const dirs: [number, number, number][] = [
        [1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1], [0.7, 0.7, 0], [-0.7, -0.7, 0],
      ]
      dirs.forEach((d, i) => {
        const geo = new THREE.ConeGeometry(0.036, 0.17, 4)
        geo.translate(0, 0.085, 0) // 锥底贴核心、锥尖朝外
        const sp = new THREE.Mesh(geo, i % 2 ? gm : gm2)
        const v = new THREE.Vector3(d[0], d[1], d[2]).normalize()
        sp.position.copy(v.clone().multiplyScalar(0.1))
        sp.quaternion.setFromUnitVectors(up, v)
        core.add(sp)
        if (i === 0) face(sp) // +X 尖刺定义朝向
      })
      for (const [gx, gy] of [[0.07, 0.07], [-0.07, 0.07], [0.07, -0.07], [-0.07, -0.07]]) { // 缀满的宝石
        const gem = new THREE.Mesh(new THREE.IcosahedronGeometry(0.03, 0), gm3)
        gem.position.set(gx, gy, 0)
        core.add(gem)
      }
      break
    }
    case 'deathrat': { // 死亡鼠：小型四足啮齿实体——尖吻、长尾、竖耳，深褐色，体长约 0.4m。（原生 +X）
      const rc = '#3e3630', rd = '#332c27', rl = '#4c433b'
      const body = new THREE.Group()
      body.position.set(0, 0.17, 0)
      body.add(box(0.26, 0.14, 0.15, rc, 0, 0, 0))
      body.add(box(0.15, 0.13, 0.14, rd, -0.16, -0.01, 0)) // 后臀
      body.add(box(0.2, 0.03, 0.13, rd, 0.02, 0.08, 0)) // 背毛
      tag(body, 'torso')
      const hg = new THREE.Group()
      hg.position.set(0.2, 0.19, 0)
      hg.add(box(0.11, 0.1, 0.1, rl, 0, 0, 0))
      hg.add(box(0.09, 0.06, 0.06, rl, 0.09, -0.02, 0)) // 尖吻
      hg.add(box(0.025, 0.025, 0.025, '#1a1412', 0.14, -0.02, 0)) // 鼻
      for (const z of [-0.04, 0.04]) hg.add(face(glow(0.022, 0.022, 0.022, '#c94a3a', 0.06, 0.02, z))) // 眼
      hg.add(face(glow(0.022, 0.03, 0.035, '#e8e2d2', 0.13, -0.05, 0))) // 门牙
      for (const z of [-0.05, 0.05]) { // 竖耳
        const ear = box(0.02, 0.085, 0.075, rd, -0.02, 0.08, z)
        ear.rotation.x = z > 0 ? 0.22 : -0.22
        hg.add(ear)
      }
      tag(hg, 'head')
      const tgeo = new THREE.BoxGeometry(0.3, 0.025, 0.025) // 长尾
      tgeo.translate(-0.15, 0, 0)
      const tl = new THREE.Mesh(tgeo, lam('#4a3f38'))
      tl.position.set(-0.24, 0.17, 0)
      tl.rotation.z = -0.15
      tag(tl, 'tail')
      jointX(0.045, 0.13, 0.045, rd, 0.13, 0.13, -0.06, 'armL')
      jointX(0.045, 0.13, 0.045, rd, 0.13, 0.13, 0.06, 'armR')
      jointX(0.05, 0.13, 0.05, rd, -0.12, 0.13, -0.06, 'legL')
      jointX(0.05, 0.13, 0.05, rd, -0.12, 0.13, 0.06, 'legR')
      for (const l of [parts.armL, parts.armR, parts.legL, parts.legR]) tip(l, 0.05, 0.03, 0.06, '#241f1b', -0.13, 0.01)
      break
    }
    case 'wretch': { // 可怜虫（Entity 15）：骷髅般消瘦的人形；红棕色干裂皮肤，布满孔洞与脓疱；
      //               牙齿与指甲在错误的位置重新长出；眼睑已溶解——眼球完全外露、永远闭不上。
      const wc = '#8a4a3a', wd = '#6e3a2e', wl = '#9c5a46'
      humanoid(1.72, 0.68, wc, { limbs: wd, head: wl })
      const rng = mulberry(0x15e7)
      const eyeball = (x: number) => { // 无眼睑的外露眼球（微微外凸、充血）
        const e = sph(0.045, '#e8dcd2', 8, basic('#e8dcd2'))
        e.position.set(x, 1.62, 0.075)
        face(e); grp.add(e)
        const p = sph(0.02, '#2a1410', 6, basic('#2a1410'))
        p.position.set(0, 0, 0.036)
        e.add(p)
        const vein = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.006, 0.006), basic('#a02a22'))
        vein.position.set(0, 0.014, 0.026)
        e.add(vein)
      }
      eyeball(-0.055); eyeball(0.055)
      grp.add(box(0.12, 0.03, 0.03, '#3a1c16', 0, 1.52, 0.09)) // 溶解的嘴唇
      for (let i = 0; i < 14; i++) { // 皮肤上的孔洞与脓疱（沿躯干表面一圈分布）
        const a = rng() * Math.PI * 2
        const y = 0.6 + rng() * 1.05
        const px = Math.cos(a) * 0.155, pz = Math.sin(a) * 0.1
        if (rng() < 0.5) grp.add(box(0.045, 0.045, 0.03, '#3a1c16', px, y, pz)) // 孔洞
        else ebox(0.05, 0.045, 0.035, '#5e2018', px, y, pz, 0.3) // 脓疱
      }
      for (let i = 0; i < 4; i++) grp.add(box(0.2 - i * 0.02, 0.015, 0.02, wd, 0, 1.18 - i * 0.11, 0.09)) // 干裂的肋线
      const misplaced = (x: number, y: number, z: number, h: number, rz: number) => { // 错位长出的牙齿与指甲
        const t = box(0.022, h, 0.022, '#e0d6c2', x, y, z)
        t.rotation.z = rz; t.rotation.x = 0.3
        grp.add(t)
      }
      misplaced(-0.19, 1.32, 0.02, 0.08, 0.5); misplaced(0.2, 1.28, -0.04, 0.07, -0.6)
      misplaced(-0.05, 1.42, -0.11, 0.09, 0.2); misplaced(0.09, 1.05, 0.1, 0.06, -0.3)
      misplaced(-0.22, 0.98, 0.03, 0.07, 0.8); misplaced(0.16, 1.45, 0.05, 0.05, -0.2)
      for (const arm of [parts.armL, parts.armR]) {
        tip(arm, 0.07, 0.1, 0.07, wd, -0.78)
        for (let i = 0; i < 3; i++) arm.add(box(0.018, 0.07, 0.018, '#e0d6c2', (i - 1) * 0.03, -0.87, 0.015))
        arm.add(box(0.022, 0.06, 0.022, '#e0d6c2', 0.04, -0.4, 0.04)) // 手臂上多长的指甲
      }
      break
    }
    case 'watcher': { // 观察者（Entity 96）：巨型眼球（直径约 1.2m，白色巩膜 + 深色虹膜 + 黑瞳），
      //                表面伸出多条视神经/血管向后方辐射；静默悬浮。（原生 +X）
      const eyeGrp = new THREE.Group()
      eyeGrp.position.set(0, 1.8, 0)
      eyeGrp.add(sph(0.6, '#d8d2c4', 12))
      const rng = mulberry(0x9601)
      for (let i = 0; i < 8; i++) { // 巩膜血丝
        const a = (i / 8) * Math.PI * 2
        const v = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.012, 0.012), emat('#a8443a', 0.2))
        v.position.set(0.34, Math.sin(a) * 0.44, Math.cos(a) * 0.44)
        v.rotation.set(rng() * 3, rng() * 3, rng() * 3)
        eyeGrp.add(v)
      }
      tag(eyeGrp, 'torso')
      // 虹膜/瞳孔挂在以球心为原点的 head 组内：renderer 的待机张望使视线沿球面扫视
      const hg = new THREE.Group()
      const iris = sph(0.26, '#3a5560', 10)
      iris.scale.set(0.34, 1, 1)
      iris.position.set(0.52, 0, 0)
      face(iris); hg.add(iris)
      const pupil = sph(0.13, '#08080a', 8, basic('#08080a'))
      pupil.scale.set(0.4, 1, 1)
      pupil.position.set(0.575, 0, 0)
      face(pupil); hg.add(pupil)
      eyeGrp.add(hg); tag(hg, 'head')
      for (let i = 0; i < 11; i++) { // 视神经与血管：向后方辐射的扭曲管束
        const a = (i / 11) * Math.PI * 2
        const root = new THREE.Group()
        root.position.set(-0.3, Math.sin(a) * 0.42, Math.cos(a) * 0.42)
        root.rotation.z = -Math.PI / 2 + (rng() - 0.5) * 0.5
        root.rotation.y = (rng() - 0.5) * 0.6
        root.add(cyl(0.05, 0.075, 0.5, '#5e2430', 0, -0.25, 0, 6))
        const bend = new THREE.Group()
        bend.position.y = -0.5
        bend.rotation.x = (rng() - 0.5) * 1.3
        bend.rotation.z = (rng() - 0.5) * 1.0
        bend.add(cyl(0.026, 0.05, 0.46, '#4a1c26', 0, -0.23, 0, 6))
        root.add(bend)
        eyeGrp.add(root)
      }
      break
    }
    case 'strider': { // 阔步者（Entity 96）：中央一颗眼球（约 0.9m），下方六条约 2.4m 长的附肢——
      //                由脉络膜、视神经与血管构成（暗红紫分段柱，带一次膝关节弯折）。（原生 +X）
      const eyeGrp = new THREE.Group()
      eyeGrp.position.set(0, 2.5, 0)
      eyeGrp.add(sph(0.45, '#c8b9a4', 12))
      tag(eyeGrp, 'torso')
      const hg = new THREE.Group()
      const iris = sph(0.2, '#4a3a4e', 10)
      iris.scale.set(0.34, 1, 1)
      iris.position.set(0.39, 0, 0)
      face(iris); hg.add(iris)
      const pupil = sph(0.1, '#08080a', 8, basic('#08080a'))
      pupil.scale.set(0.4, 1, 1)
      pupil.position.set(0.43, 0, 0)
      face(pupil); hg.add(pupil)
      eyeGrp.add(hg); tag(hg, 'head')
      eyeGrp.add(sph(0.34, '#7a4a58', 8).translateY(-0.34)) // 附肢基座（血管盘结）
      // [part, x, z, splay]；splay 正值把附肢推向 +Z，故 -Z 侧取负值才是向外张开
      const legPos: [string, number, number, number][] = [
        ['legL', 0.4, -0.42, -0.5], ['legR', 0.4, 0.42, 0.5],
        ['t1', 0, -0.48, -0.62], ['t2', 0, 0.48, 0.62],
        ['armL', -0.4, -0.42, -0.5], ['armR', -0.4, 0.42, 0.5],
      ]
      for (const [part, x, z, splay] of legPos) {
        const up = jointX(0.11, 1.15, 0.11, '#5a2a44', x, 2.25, z, part, splay)
        const knee = new THREE.Group() // 膝关节：下段回摆到竖直，落点贴地
        knee.position.y = -1.15
        knee.rotation.z = -splay
        knee.add(box(0.085, 1.25, 0.085, '#47203a', 0, -0.62, 0))
        knee.add(box(0.1, 0.1, 0.1, '#6a2f4c', 0, -0.02, 0)) // 关节结
        knee.add(box(0.07, 0.09, 0.16, '#3a1a2e', 0, -1.25, 0.03)) // 足尖
        for (let k = 0; k < 3; k++) knee.add(box(0.09, 0.02, 0.09, '#8a3a52', 0, -0.3 - k * 0.35, 0)) // 血管环
        up.add(knee)
      }
      break
    }
    case 'mangled': { // 残破者（Entity 63）：房子大小的蜘蛛状轮廓，被浓密翻涌的烟雾遮蔽；
      //                烟雾之下的本体是无数人脸融合成的团块。（原生 +X）
      const rng = mulberry(0x6303)
      const core = new THREE.Group() // 人脸团块核心
      core.position.set(0, 2.0, 0)
      const skins = ['#b8a08a', '#a08872', '#c2ab94', '#8f7a66']
      const faceBlk = (dir: THREE.Vector3, idx: number, tagIt: boolean) => {
        const g2 = new THREE.Group()
        g2.position.copy(dir.clone().multiplyScalar(0.52))
        g2.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir)
        const s = 0.26 + rng() * 0.16
        g2.add(box(s, s * 1.2, s * 0.9, skins[idx % skins.length], 0, 0, 0))
        const eL = box(0.05, 0.04, 0.02, '#100c0a', -s * 0.22, s * 0.22, s * 0.46)
        const eR = box(0.05, 0.04, 0.02, '#100c0a', s * 0.22, s * 0.22, s * 0.46)
        const mo = box(s * 0.5, 0.03, 0.02, '#100c0a', 0, -s * 0.3, s * 0.46)
        g2.add(eL, eR, mo)
        if (tagIt) { face(eL); face(eR); face(mo) }
        core.add(g2)
      }
      for (let i = 0; i < 14; i++) { // 密集堆叠成球状的脸块
        const yv = 1 - (i + 0.5) / 7
        const rr = Math.sqrt(Math.max(0.04, 1 - yv * yv))
        const a = i * 2.39996
        faceBlk(new THREE.Vector3(Math.cos(a) * rr, yv, Math.sin(a) * rr).normalize(), i, false)
      }
      // 正面三张脸（左右对称，把面部质心稳稳压在 +X）
      faceBlk(new THREE.Vector3(1, 0.15, 0).normalize(), 0, true)
      faceBlk(new THREE.Vector3(0.86, -0.1, 0.3).normalize(), 1, true)
      faceBlk(new THREE.Vector3(0.86, -0.1, -0.3).normalize(), 2, true)
      core.add(sph(0.42, '#8f7a66', 8)) // 团块内核（脑状整体结构）
      tag(core, 'torso')
      // 八条细长蜘蛛腿（其中四条复用 renderer 的步态摆动）
      const legDef: [string | null, number, number, number][] = [ // [part, x, z, splay]
        ['legL', 0.5, -0.5, -1.15], ['legR', 0.5, 0.5, 1.15],
        ['armL', -0.5, -0.5, -1.15], ['armR', -0.5, 0.5, 1.15],
        [null, 0.9, -0.3, -1.3], [null, 0.9, 0.3, 1.3], [null, -0.9, -0.3, -1.3], [null, -0.9, 0.3, 1.3],
      ]
      for (const [part, x, z, splay] of legDef) {
        const holder = new THREE.Group()
        holder.position.set(x, 2.2, z)
        holder.rotation.y = -Math.PI / 2
        holder.rotation.z = splay
        grp.add(holder)
        const up = part ? jointOn(holder, 0.13, 1.5, 0.13, '#3a3038', part) : (() => {
          const geo = new THREE.BoxGeometry(0.13, 1.5, 0.13); geo.translate(0, -0.75, 0)
          const m = new THREE.Mesh(geo, lam('#3a3038')); holder.add(m); return m
        })()
        const knee = new THREE.Group()
        knee.position.y = -1.5
        knee.rotation.z = -splay
        knee.add(box(0.1, 1.6, 0.1, '#2e262c', 0, -0.8, 0))
        knee.add(box(0.16, 0.16, 0.16, '#4a4048', 0, -0.03, 0)) // 关节
        knee.add(box(0.08, 0.12, 0.24, '#241e22', 0, -1.6, 0.05)) // 足尖
        up.add(knee)
      }
      const smoke = new THREE.MeshLambertMaterial({ color: '#3d3a42', transparent: true, opacity: 0.42 })
      const smoke2 = new THREE.MeshLambertMaterial({ color: '#4a4048', transparent: true, opacity: 0.35 })
      for (let i = 0; i < 8; i++) { // 浓密翻涌的烟雾（前 4 团命名 shard0..3）
        const puff = new THREE.Mesh(new THREE.SphereGeometry(1.0 + rng() * 0.6, 8, 6), i % 2 ? smoke : smoke2)
        const a = (i / 8) * Math.PI * 2
        puff.position.set(Math.cos(a) * 1.1, 1.5 + rng() * 1.4, Math.sin(a) * 1.1)
        grp.add(puff)
        if (i < 4) tag(puff, `shard${i}`)
      }
      break
    }
    case 'partygoer': { // 派对客（Entity 67）：高大两足（约 2.2m）、鲜黄色光滑皮革皮肤、腿部厚重呈块状；
      //                 长而软的面条状手臂，末端不是手而是吸盘状的口（环 + 内圈小尖牙）；
      //                 面部只有一个血涂的「=)」刻痕；胸前甲壳内藏第二对带爪之手。
      const yc = '#e8c93c', yd = '#c9a92c', yl = '#f2dd6a', blood = '#8a1f1f'
      joint(0.29, 0.92, 0.32, yd, -0.2, 0.95, 0, 'legL') // 厚重块状的腿
      joint(0.29, 0.92, 0.32, yd, 0.2, 0.95, 0, 'legR')
      tip(parts.legL, 0.33, 0.13, 0.44, '#a88a22', -0.9, 0.06)
      tip(parts.legR, 0.33, 0.13, 0.44, '#a88a22', -0.9, 0.06)
      tag(box(0.5, 0.72, 0.34, yc, 0, 1.36, 0), 'torso')
      tag(box(0.34, 0.34, 0.32, yl, 0, 1.92, 0), 'head')
      grp.add(box(0.4, 0.12, 0.3, yd, 0, 1.73, 0)) // 颈/肩
      // 血涂的「=)」刻痕：一对短横作眼 + 一条上翘弧线作嘴
      grp.add(face(box(0.1, 0.024, 0.02, blood, -0.08, 1.99, 0.165)))
      grp.add(face(box(0.1, 0.024, 0.02, blood, 0.08, 1.99, 0.165)))
      for (let i = 0; i < 7; i++) {
        const a = (i / 6 - 0.5) * 1.7
        grp.add(face(box(0.038, 0.032, 0.02, blood, Math.sin(a) * 0.115, 1.85 + (1 - Math.cos(a)) * 0.2, 0.165)))
      }
      const noodle = (side: number, part: string) => { // 面条状长臂：5 段递减小圆柱串成柔软观感
        const root = new THREE.Group()
        root.position.set(side * 0.3, 1.62, 0)
        grp.add(root); tag(root, part)
        let cur: THREE.Object3D = root
        for (let i = 0; i < 5; i++) {
          const seg = new THREE.Group()
          seg.position.y = i === 0 ? 0 : -0.26
          seg.rotation.z = side * 0.17
          seg.rotation.x = 0.09
          const r = 0.075 - i * 0.009
          const m = cyl(r, r + 0.007, 0.27, i % 2 ? yd : yc, 0, -0.135, 0, 7)
          seg.add(m)
          cur.add(seg)
          cur = seg
        }
        const mouth = new THREE.Group() // 末端吸盘状的口
        mouth.position.y = -0.26
        mouth.rotation.x = Math.PI / 2
        mouth.add(new THREE.Mesh(new THREE.TorusGeometry(0.085, 0.028, 4, 10), lam('#b8971f')))
        for (let i = 0; i < 8; i++) { // 内圈倒钩小尖牙
          const a = (i / 8) * Math.PI * 2
          mouth.add(box(0.022, 0.032, 0.022, '#e8e2d2', Math.cos(a) * 0.052, Math.sin(a) * 0.052, 0.012))
        }
        cur.add(mouth)
      }
      noodle(-1, 'armL'); noodle(1, 'armR')
      // 胸前甲壳：renderer 会把 sheet 的 y 钉在 1.0±0.12 并绕 Y 自转，
      // 故挂在抬高 0.42 的 holder 内（世界 y≈1.42=胸口），且做成绕 Y 对称的甲壳筒——自转不产生跳动。
      const shHold = new THREE.Group()
      shHold.position.set(0, 0.42, 0)
      grp.add(shHold)
      const sheet = new THREE.Group()
      sheet.position.y = 1.0
      sheet.add(cyl(0.24, 0.31, 0.44, '#d8b62e', 0, 0, 0, 8))
      sheet.add(cyl(0.325, 0.325, 0.05, '#a8891c', 0, -0.16, 0, 8)) // 甲壳开合缝
      shHold.add(sheet); tag(sheet, 'sheet')
      const clawArm = (side: number, part: string) => { // 甲壳内藏的第二对带爪之手
        const a = new THREE.Group()
        a.position.set(side * 0.14, 1.52, 0.03)
        a.rotation.z = side * 0.5
        a.add(box(0.08, 0.34, 0.09, '#6a4a12', 0, -0.17, 0))
        const hand = new THREE.Group()
        hand.position.y = -0.34
        hand.rotation.x = -0.6
        for (let i = 0; i < 3; i++) hand.add(box(0.02, 0.12, 0.02, '#e8e2d2', (i - 1) * 0.03, -0.06, 0.02))
        a.add(hand)
        grp.add(a); tag(a, part)
      }
      clawArm(-1, 't1'); clawArm(1, 't2')
      break
    }
    case 'soilworm': { // 土壤蠕虫：小型分节蠕虫（5 节递减 + 前端口器环），土褐色，体长约 0.5m。（原生 +X）
      // renderer 会把 seg 的 y 钉在 0.35 并叠加 ±0.12 蠕动——对 0.5m 小虫过大，
      // 故整体挂在 scale=0.3 的外层组内按 3.33 倍建模，缩放后落到 y≈0.105、幅度 ±0.036。
      const sw = new THREE.Group()
      sw.scale.setScalar(0.3)
      grp.add(sw)
      const c1 = '#8a6a52', c2 = '#6e523e'
      for (let i = 0; i < 5; i++) {
        const r = 0.26 - i * 0.035
        const s = cyl(r - 0.02, r, 0.34, i % 2 ? c1 : c2, -i * 0.33, 0.35, 0, 7)
        s.rotation.z = Math.PI / 2
        sw.add(s); tag(s, `seg${i}`)
        sw.add(box(0.05, 0.06, r * 2.1, '#5a4232', -i * 0.33 - 0.16, 0.35, 0)) // 环节褶
      }
      sw.add(box(0.07, 0.22, 0.22, '#3a281c', 0.2, 0.35, 0)) // 口腔
      for (let i = 0; i < 6; i++) { // 前端一圈小口器
        const a = (i / 6) * Math.PI * 2
        sw.add(face(box(0.07, 0.055, 0.055, '#d8c9a8', 0.23, 0.35 + Math.sin(a) * 0.16, Math.cos(a) * 0.16)))
      }
      break
    }
    case 'windowent': { // 窗户（Entity 2）：木框窗 + 十字窗棂 + 半透明玻璃；玻璃后是一个纯黑、
      //                  边缘弥散的人形剪影——极长的手、很小的躯干、畸形的腿。（固定不动）
      const wood = '#6a5a44', wood2 = '#57492f'
      const fw = 1.12, fh = 1.6, fy = 0.6 + fh / 2
      grp.add(box(fw, 0.1, 0.14, wood, 0, fy + fh / 2, 0)) // 上框
      grp.add(box(fw, 0.13, 0.17, wood2, 0, fy - fh / 2, 0)) // 窗台
      grp.add(box(0.1, fh, 0.14, wood, -fw / 2 + 0.05, fy, 0)) // 侧框
      grp.add(box(0.1, fh, 0.14, wood, fw / 2 - 0.05, fy, 0))
      grp.add(box(0.05, fh - 0.12, 0.11, wood2, 0, fy, 0.015)) // 竖窗棂
      grp.add(box(fw - 0.12, 0.05, 0.11, wood2, 0, fy, 0.015)) // 横窗棂
      grp.add(box(0.08, 0.62, 0.1, wood2, -fw / 2 + 0.06, 0.3, 0)) // 落地支柱
      grp.add(box(0.08, 0.62, 0.1, wood2, fw / 2 - 0.06, 0.3, 0))
      const glass = new THREE.Mesh(new THREE.BoxGeometry(fw - 0.14, fh - 0.08, 0.02),
        new THREE.MeshLambertMaterial({ color: '#8fa2a8', transparent: true, opacity: 0.34 }))
      glass.position.set(0, fy, 0.07)
      face(glass); grp.add(glass)
      for (const gx of [-0.26, 0.26]) { // 玻璃反光（左右对称，稳住面部质心在 +Z）
        const hl = new THREE.Mesh(new THREE.BoxGeometry(0.11, fh - 0.36, 0.01), emat('#cfe0e6', 0.22, 0.5))
        hl.position.set(gx, fy + 0.04, 0.076)
        hl.rotation.z = 0.12
        face(hl); grp.add(hl)
      }
      const sil = new THREE.Group() // 深色人形剪影（玻璃之后）
      sil.position.set(0, fy - 0.12, -0.03)
      const smat = new THREE.MeshLambertMaterial({ color: '#07070a' })
      const sm = (w: number, h: number, d: number, x: number, y: number, rz: number) => {
        const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), smat)
        m.position.set(x, y, 0)
        m.rotation.z = rz
        sil.add(m)
        return m
      }
      face(sm(0.17, 0.2, 0.1, 0, 0.5, 0)) // 头
      sm(0.19, 0.28, 0.1, 0, 0.26, 0) // 很小的躯干
      sm(0.06, 0.72, 0.07, -0.16, 0.06, 0.12) // 极长的手（垂到踝下）
      sm(0.06, 0.72, 0.07, 0.16, 0.06, -0.12)
      sm(0.07, 0.16, 0.07, -0.2, -0.32, 0.3) // 长手的掌
      sm(0.07, 0.16, 0.07, 0.2, -0.32, -0.3)
      sm(0.08, 0.28, 0.08, -0.07, -0.02, -0.4) // 畸形的腿（外翻弯折）
      sm(0.08, 0.28, 0.08, 0.07, -0.02, 0.5)
      sm(0.07, 0.3, 0.07, -0.16, -0.28, 0.35)
      sm(0.07, 0.3, 0.07, 0.16, -0.3, -0.2)
      tag(sil, 'torso')
      const haze = new THREE.MeshLambertMaterial({ color: '#0c0c10', transparent: true, opacity: 0.4 })
      for (const [hw, hh, hy] of [[0.5, 0.5, 0.34], [0.34, 0.34, 0.5], [0.44, 0.4, 0.0]]) { // 边缘弥散
        const m = new THREE.Mesh(new THREE.BoxGeometry(hw, hh, 0.04), haze)
        m.position.set(0, hy, -0.01)
        sil.add(m)
      }
      break
    }
    default: humanoid(1.7, 0.9, c); eyes(1.6, 0.08, '#ffffff', 0.05)
  }
  // 统一正面到 +X：猎犬/运输车/管道蠕虫/电弧体/死亡飞蛾，以及 v23 的水生/蛇形/四足/眼球类
  // 原生面向 +X（或各向对称）；其余按 +Z 建造的模型包一层 rotation.y=π/2 内层组把正面旋到 +X。
  const facesX = type === 'hound' || type === 'carrier' || type === 'pipeworm' || type === 'arcwraith' || type === 'deathmoth'
    || type === 'tiny' || type === 'thething' || type === 'wrangler' || type === 'camocrawler' || type === 'lightguide'
    || type === 'deathrat' || type === 'watcher' || type === 'strider' || type === 'mangled' || type === 'soilworm'
  if (!facesX) {
    const inner = new THREE.Group()
    inner.rotation.y = Math.PI / 2
    for (const ch of [...grp.children]) inner.add(ch)
    grp.add(inner)
    grp.userData.facesZ = 1
  }
  return grp
}
