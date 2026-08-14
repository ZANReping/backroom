// 物品低模（自包含，仅依赖 three）——地面/投掷物/手持展示用的小模型 + 稀有度光环底座。
// 实体模型在 entitiesMesh.ts。
import * as THREE from 'three'
import { buildFlashlightMesh } from './flashlightMesh'

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
    case 'flashlight': { // 手电筒：与第一人称手持模型共用真实 UV 细化模型，地面版镜片不自发光
      const flashlight = buildFlashlightMesh({ orientation: 'ground', lit: false })
      flashlight.scale.setScalar(1.08)
      grp.add(flashlight)
      break
    }
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
    case 'capacitor': { // 电容器「瓶装闪电」（参考 Object 42）：玻璃烧瓶 + 软木塞 + 瓶中疾走的蓝色电荷
      const glass = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.095, 0.17, 8),
        new THREE.MeshLambertMaterial({ color: '#9fd8e8', transparent: true, opacity: 0.35, emissive: '#3a8ab0', emissiveIntensity: 0.3 }))
      glass.position.y = -0.03; grp.add(glass)
      const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.05, 0.06, 8),
        new THREE.MeshLambertMaterial({ color: '#9fd8e8', transparent: true, opacity: 0.35, emissive: '#3a8ab0', emissiveIntensity: 0.3 }))
      neck.position.y = 0.075; grp.add(neck)
      cm(0.03, 0.034, 0.05, '#a8865a', 0, 0.125, 0, 8) // 软木塞
      // 瓶中闪电：自发光芯 + 两道折线
      const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.04, 0), new THREE.MeshBasicMaterial({ color: '#8fd4ff' }))
      core.position.y = -0.03; core.scale.y = 1.7; grp.add(core)
      const bolt = (w: number, h: number, color: string, x: number, y: number, z: number, rz: number) => {
        const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.014), new THREE.MeshBasicMaterial({ color }))
        m.position.set(x, y, z); m.rotation.z = rz; grp.add(m)
      }
      bolt(0.014, 0.1, '#eaf7ff', 0.022, -0.02, 0.01, 0.5)
      bolt(0.014, 0.08, '#8fd4ff', -0.022, -0.05, -0.012, -0.55)
      break }
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
    case 'parcel': // v43 物流包裹：牛皮纸箱 + 十字胶带 + 面单 + BNTG 天平章
      em(0.24, 0.18, 0.2, '#a08653'); em(0.245, 0.02, 0.06, '#d8cfb0', 0, 0.08, 0)
      em(0.06, 0.02, 0.205, '#d8cfb0', 0, 0.081, 0); em(0.07, 0.05, 0.002, '#f0e6c0', 0.06, 0.02, 0.102)
      em(0.03, 0.03, 0.002, '#566c5a', -0.06, 0.03, 0.102); break
    case 'dryshrimp': { // 旱虾：分节橙褐躯体 + 鳍叶 + 扇尾（同实体造型的静物版）
      em(0.1, 0.06, 0.16, '#b3612e', 0.06, 0.03, 0); em(0.09, 0.055, 0.14, '#8f4a22', -0.03, 0.025, 0); em(0.08, 0.05, 0.12, '#b3612e', -0.11, 0.02, 0)
      em(0.13, 0.012, 0.05, '#d9a86a', 0.02, 0.01, 0.1, 0, 0.5); em(0.13, 0.012, 0.05, '#d9a86a', 0.02, 0.01, -0.1, 0, -0.5)
      em(0.02, 0.02, 0.02, '#101216', 0.12, 0.07, 0.03); em(0.02, 0.02, 0.02, '#101216', 0.12, 0.07, -0.03)
      em(0.1, 0.012, 0.04, '#d9a86a', -0.2, 0.03, 0.04, 0, 0.3); em(0.1, 0.012, 0.04, '#d9a86a', -0.2, 0.03, -0.04, 0, -0.3)
      break }
    case 'friedshrimp': { // 酥炸旱虾：金黄炸衣 + 露出的虾尾
      em(0.1, 0.07, 0.16, '#d99a3a', 0.05, 0.035, 0); em(0.09, 0.065, 0.14, '#e8b04a', -0.04, 0.03, 0)
      em(0.08, 0.05, 0.12, '#b3612e', -0.12, 0.02, 0)
      em(0.1, 0.012, 0.04, '#d9a86a', -0.21, 0.03, 0.04, 0, 0.3); em(0.1, 0.012, 0.04, '#d9a86a', -0.21, 0.03, -0.04, 0, -0.3)
      em(0.03, 0.015, 0.015, '#f5d88a', 0.05, 0.08, 0.05); em(0.025, 0.012, 0.012, '#f5d88a', 0, 0.085, -0.04)
      break }
    case 'firesalt': { // 火盐晶体：三枚橙色碎晶（自带余烬微光）
      em(0.07, 0.09, 0.06, '#e8823c', -0.05, 0.02, 0, 0, 0.4)
      em(0.05, 0.07, 0.05, '#f59a4a', 0.04, 0.02, -0.03, 0, -0.3)
      em(0.04, 0.05, 0.04, '#d96a2a', 0.02, 0.02, 0.06, 0, 0.2)
      break }
    case 'liquidpain': { // 液态痛苦：杏仁水瓶型 + 淡红液体
      em(0.14, 0.26, 0.14, '#d8cfc0'); em(0.08, 0.07, 0.08, '#c94a3a', 0, 0.17, 0)
      em(0.145, 0.12, 0.145, '#d94a3a', 0, -0.04, 0); break }
    case 'candysilver': { // 银舌头：舌头形金属糖（扁圆盘 + 中缝凸起）
      em(0.14, 0.05, 0.1, '#c9c9d4'); em(0.05, 0.03, 0.08, '#e8e8f0', 0, 0.035, 0)
      break }
    case 'candybullet': { // 咀嚼子弹：银箔子弹（竖立弹头）
      cm(0.035, 0.035, 0.09, '#9a9aa8', 0, 0.045, 0, 8); cm(0.012, 0.035, 0.05, '#8a8a98', 0, 0.115, 0, 8)
      cm(0.037, 0.037, 0.03, '#6a6a76', 0, 0.005, 0, 8)
      break }
    case 'candygun': { // 枪糖：金属小手枪
      em(0.14, 0.04, 0.05, '#5a5a64', 0.01, 0.08, 0); em(0.05, 0.035, 0.045, '#4a4a54', 0.09, 0.08, 0)
      em(0.045, 0.09, 0.045, '#6a4a3a', -0.03, 0.02, 0, 0, 0.3)
      break }
    case 'candystanley': { // 纸片人斯坦利：扁平人形糖纸（薄板身 + 头 + 双臂）
      em(0.08, 0.14, 0.012, '#d0d0c0', 0, 0.07, 0); cm(0.035, 0.035, 0.012, '#d0d0c0', 0, 0.16, 0, 8, Math.PI / 2)
      em(0.14, 0.03, 0.012, '#d0d0c0', 0, 0.09, 0, 0, 0)
      break }
    case 'candywaste': { // 危害废料：迷你危废桶
      cm(0.055, 0.055, 0.12, '#d9c93a', 0, 0.06, 0, 10)
      cm(0.057, 0.057, 0.025, '#3a3a30', 0, 0.035, 0, 10); cm(0.057, 0.057, 0.025, '#3a3a30', 0, 0.095, 0, 10)
      break }
    case 'candygenius': { // 天才糖：粉色威化（分层夹心）
      em(0.14, 0.05, 0.09, '#e8a0b8', 0, 0.025, 0)
      em(0.14, 0.012, 0.09, '#f4d0dc', 0, 0.012, 0); em(0.14, 0.012, 0.09, '#f4d0dc', 0, 0.038, 0)
      break }
    case 'candymint': { // 杏仁薄荷糖：O 形薄荷圈
      const mint = new THREE.Mesh(new THREE.TorusGeometry(0.055, 0.022, 8, 14),
        new THREE.MeshLambertMaterial({ color: '#a0d0b0', emissive: '#a0d0b0', emissiveIntensity: 0.25 }))
      mint.position.y = 0.035; mint.rotation.x = Math.PI / 2
      grp.add(mint)
      break }
    case 'manmade': { // 人制品：糖果纸包裹的肉色方块
      em(0.14, 0.06, 0.1, '#8a4a3a')
      em(0.15, 0.02, 0.11, '#d8cfc0', 0, 0.04, 0)
      em(0.03, 0.03, 0.03, '#c9a0a0', 0.06, 0.05, 0.03); break }
    case 'endnote': // 烧焦的字条：纸片 + 焦边 + 墨迹
      em(0.2, 0.01, 0.14, '#d8cfae'); em(0.2, 0.012, 0.04, '#3a2a1e', 0, 0.001, -0.052)
      em(0.12, 0.012, 0.01, '#2a2620', -0.01, 0.008, 0.02); break
    case 'welcomenote': // 致新流浪者的纸条：折起的横线纸（同字条低模，纸张更干净）
      em(0.2, 0.01, 0.14, '#f0e6c0'); em(0.2, 0.012, 0.04, '#c9bc90', 0, 0.001, -0.052)
      em(0.12, 0.012, 0.01, '#8a8474', -0.01, 0.008, 0.02); break

    // ---------- v32：后室扩展物品 ----------
    case 'cashew': // 腰果水：与杏仁水几乎一样的瓶子——但液体发褐，别搞混
      em(0.14, 0.26, 0.14, '#d8cfc0'); em(0.08, 0.07, 0.08, '#8a6a3a', 0, 0.17, 0)
      em(0.145, 0.07, 0.145, '#c9a05a', 0, -0.02, 0); break
    case 'luckymilk': { // v54：幸运豆奶（Object 28）：豆奶纸盒 + 四叶草标 + 顶折封口
      em(0.15, 0.24, 0.11, '#eef0e8') // 纸盒身（乳白）
      em(0.15, 0.05, 0.11, '#7ab06a', 0, 0.145, 0) // 顶折封口（绿）
      em(0.152, 0.08, 0.112, '#a8d89a', 0, -0.04, 0) // 四叶草标带（浅绿横带）
      em(0.04, 0.04, 0.01, '#4a8a3e', 0, -0.04, 0.06) // 四叶草（正面深绿点）
      break
    }
    case 'knife': // 刀：刀刃 + 护手 + 柄
      em(0.22, 0.012, 0.035, '#c9cdd4', 0.03, 0, 0)
      em(0.018, 0.04, 0.06, '#8a8a8a', -0.09, 0, 0)
      em(0.09, 0.025, 0.03, '#3a2e22', -0.15, 0, 0); break
    case 'axe': // 斧头：长柄 + 斧刃 + 斧楔
      cm(0.016, 0.02, 0.34, '#8a6a42', 0, 0, 0, 6, 0, Math.PI / 2)
      em(0.07, 0.1, 0.025, '#9aa0a8', 0.16, 0.02, 0)
      em(0.03, 0.05, 0.032, '#7a8288', 0.1, 0.02, 0); break
    case 'headlamp': // 头灯：头带 + 灯体 + 灯杯
      em(0.26, 0.035, 0.03, '#2a2d30')
      em(0.09, 0.08, 0.07, '#3a3d42', 0, 0, 0.05)
      em(0.06, 0.05, 0.015, '#fff2d0', 0, 0, 0.09); break
    case 'nightvision': // 夜视眼镜：双目镜筒 + 鼻梁 + 头带
      cm(0.05, 0.06, 0.12, '#26322b', -0.07, 0, 0.04, 8, Math.PI / 2)
      cm(0.05, 0.06, 0.12, '#26322b', 0.07, 0, 0.04, 8, Math.PI / 2)
      em(0.05, 0.025, 0.025, '#1b211d', 0, 0, 0.02)
      em(0.25, 0.025, 0.025, '#343b37', 0, 0, -0.055)
      em(0.035, 0.035, 0.012, '#78b886', -0.07, 0, 0.105)
      em(0.035, 0.035, 0.012, '#78b886', 0.07, 0, 0.105); break
    case 'notebook': // 笔记本和笔：皮面本 + 书页 + 笔
      em(0.2, 0.03, 0.26, '#5a3a2a')
      em(0.18, 0.025, 0.24, '#e8e2d2', 0.012, 0.026, 0)
      cm(0.008, 0.008, 0.2, '#2a2d30', 0.06, 0.05, 0.02, 6, 0, Math.PI / 2); break
    case 'fuyouyu': { // 福友玉：温润玉环 + 挂绳 + 玉坠
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.022, 8, 16),
        new THREE.MeshLambertMaterial({ color: '#6ad9a8', emissive: '#2a6a4a', emissiveIntensity: 0.4 }))
      ring.rotation.x = Math.PI / 2
      grp.add(ring)
      cm(0.006, 0.006, 0.16, '#8a3a3a', 0, 0.1, 0, 5)
      em(0.03, 0.01, 0.03, '#3a8a68', 0, -0.075, 0); break }
    case 'squirtgun': // 滋水枪：枪身 + 储水罐 + 扳机 + 枪口
      em(0.2, 0.06, 0.05, '#e86a3a')
      cm(0.045, 0.045, 0.09, '#4ac9e8', -0.03, 0.075, 0, 8)
      em(0.04, 0.07, 0.03, '#e8b93c', 0.03, -0.06, 0)
      em(0.06, 0.03, 0.03, '#e86a3a', 0.12, 0.005, 0); break
    case 'warpberry': { // 迁跃浆果：双果 + 空间涟漪环
      cm(0.05, 0.06, 0.06, '#8a4ae0', -0.03, 0, 0, 8)
      cm(0.04, 0.05, 0.05, '#b06ae0', 0.04, 0, 0.02, 8)
      const ripple = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.006, 6, 16),
        new THREE.MeshBasicMaterial({ color: '#c9a0ff', transparent: true, opacity: 0.6 }))
      ripple.rotation.x = Math.PI / 2
      grp.add(ripple)
      break }
    case 'royalration': // 皇家口粮：金色餐盒 + 红缎带 + 小冠饰
      em(0.18, 0.06, 0.12, '#d9b13b')
      em(0.18, 0.015, 0.03, '#a8283a', 0, 0.035, 0)
      em(0.05, 0.03, 0.05, '#e8c93d', 0, 0.05, 0); break

    // ---------- v40：此前走通用 fallback 的 12 件补齐 ----------
    case 'disinfectant': // 消毒液：白瓶 + 浅蓝药液 + 紫十字标签（阿丽亚娜紫）
      em(0.14, 0.24, 0.14, '#e8f0f2'); em(0.13, 0.1, 0.13, '#9fd0d8', 0, -0.05, 0)
      em(0.07, 0.07, 0.07, '#d8d4c8', 0, 0.155, 0)
      em(0.145, 0.08, 0.145, '#f4f6f0', 0, 0.01, 0)
      em(0.06, 0.02, 0.02, '#8676e2', 0, 0.01, 0.074); em(0.02, 0.06, 0.02, '#8676e2', 0, 0.01, 0.074); break
    case 'eaglecoin': // 天鹰币：两枚铜黄硬币叠放 + 顶面展翅雄鹰压印（区别于压印币的三枚薄币）
      cm(0.08, 0.08, 0.02, '#c9862e'); cm(0.08, 0.08, 0.02, '#b8752a', 0.012, 0.022, 0.006)
      em(0.07, 0.005, 0.016, '#8a5a1e', 0.012, 0.034, 0.006); em(0.016, 0.005, 0.05, '#8a5a1e', 0.012, 0.034, 0.006); break
    // Tom 的餐馆菜肴（v38 物品，v40 补低模；碗/盘/煲 + 内容物，风格同既有补给）
    case 'tomatosoup': { // 番茄浓汤：白碗 + 红色汤面 + 罗勒碎
      cm(0.13, 0.09, 0.1, '#e8e2d2', 0, 0, 0, 10)
      cm(0.115, 0.115, 0.02, '#d94a3a', 0, 0.045, 0, 10)
      em(0.02, 0.012, 0.02, '#5a8a30', 0.03, 0.06, 0.02); break }
    case 'gardensalad': { // 田园沙拉：浅碗 + 三团菜叶 + 番茄丁 + 完整叶片
      cm(0.13, 0.09, 0.08, '#e8e2d2', 0, 0, 0, 10)
      em(0.09, 0.05, 0.09, '#5a9a3a', -0.04, 0.05, 0); em(0.08, 0.06, 0.08, '#6aaa4a', 0.03, 0.055, 0.02)
      em(0.03, 0.03, 0.03, '#d94a3a', 0.01, 0.08, -0.03); em(0.05, 0.015, 0.03, '#7ac97a', 0.07, 0.08, 0); break }
    case 'garlicbread': // 蒜香烤面包：金黄面包块 + 割口 + 香草碎
      em(0.26, 0.07, 0.14, '#d9a85a'); em(0.26, 0.02, 0.14, '#b8863a', 0, -0.035, 0)
      em(0.02, 0.012, 0.1, '#f0d08a', -0.05, 0.041, 0, 0, 0.4); em(0.02, 0.012, 0.1, '#f0d08a', 0.05, 0.041, 0, 0, 0.4)
      em(0.015, 0.01, 0.015, '#6a8a3a', 0, 0.042, 0.03); break
    case 'pasta': { // 番茄意面：平盘 + 面条堆 + 番茄酱
      cm(0.16, 0.13, 0.03, '#e8e2d2', 0, 0, 0, 12)
      cm(0.1, 0.07, 0.06, '#e8d06a', 0, 0.04, 0, 10)
      em(0.09, 0.02, 0.07, '#c94a3a', 0, 0.075, 0); break }
    case 'meatstew': // 炖肉煲：深色陶煲 + 浓汤面 + 肉块
      cm(0.12, 0.1, 0.13, '#4a3a2e', 0, 0, 0, 10); cm(0.13, 0.13, 0.02, '#5a4a3a', 0, 0.06, 0, 10)
      cm(0.11, 0.11, 0.02, '#8a5a3a', 0, 0.065, 0, 10)
      em(0.04, 0.02, 0.04, '#6a3a2a', 0.03, 0.08, 0.02); em(0.03, 0.02, 0.03, '#d9c25a', -0.04, 0.08, -0.02); break
    case 'pizza': // 意式披萨：焦边圆底 + 番茄奶酪 + 辣香肠丁
      cm(0.15, 0.15, 0.025, '#d9a85a', 0, 0, 0, 12); cm(0.12, 0.12, 0.03, '#c94a3a', 0, 0.004, 0, 12)
      em(0.03, 0.008, 0.03, '#e8c93d', -0.04, 0.022, 0.02); em(0.03, 0.008, 0.03, '#e8c93d', 0.03, 0.022, -0.03)
      em(0.025, 0.008, 0.025, '#8a2e22', 0.05, 0.022, 0.04); break
    case 'lasagna': // 千层面：方块切件——面皮/肉酱/白酱分层 + 烤金黄顶
      em(0.2, 0.05, 0.16, '#e8b93c', 0, 0.05, 0)
      em(0.2, 0.025, 0.16, '#a8452e', 0, 0.015, 0); em(0.2, 0.025, 0.16, '#f0e0c0', 0, -0.01, 0)
      em(0.2, 0.03, 0.16, '#e8d8a8', 0, -0.038, 0); break
    case 'tomsspecial': { // Tom 招牌炖菜：金铜宽口煲 + 浓郁炖菜 + 月桂叶
      cm(0.12, 0.09, 0.11, '#b8912e', 0, 0, 0, 10); cm(0.135, 0.135, 0.02, '#d9b13b', 0, 0.055, 0, 10)
      cm(0.11, 0.11, 0.02, '#a85a2a', 0, 0.06, 0, 10)
      em(0.04, 0.02, 0.04, '#7a3a1e', 0.03, 0.075, 0.01); em(0.05, 0.012, 0.025, '#5a8a30', -0.04, 0.075, -0.02); break }
    case 'grilledsteak': // 烤兽肉排：煎烤肉排 + 油脂边 + 烤架焦纹
      em(0.26, 0.06, 0.18, '#8a5a3a'); em(0.26, 0.02, 0.04, '#d8b8a8', 0, 0.01, 0.07)
      em(0.02, 0.008, 0.16, '#3a2418', -0.06, 0.032, 0); em(0.02, 0.008, 0.16, '#3a2418', 0, 0.032, 0); em(0.02, 0.008, 0.16, '#3a2418', 0.06, 0.032, 0); break
    case 'jambread': // 果酱面包：吐司片 + 厚果酱层 + 流滴
      em(0.2, 0.05, 0.16, '#e8c98a'); em(0.2, 0.015, 0.16, '#d9a85a', 0, -0.026, 0)
      em(0.18, 0.018, 0.14, '#b03048', 0, 0.032, 0)
      em(0.03, 0.025, 0.03, '#b03048', 0.05, 0.045, 0.03); break

    default: em(0.2, 0.2, 0.2, '#d6cfae'); grp.userData.fallback = 1 // v40：标记通用 fallback（mesh-smoke 断言零 fallback）
  }
  // 发光描边底座（按稀有度/类别配色）
  const ITEM_GLOW: Record<string, string> = {
    tape: '#ffd94d', // 胜利物品：金
    almond: '#8fd98f', canned: '#8fd98f', coffee: '#8fd98f', // 补给：绿
    bandage: '#e8e2d2', sedative: '#9adfff', // 医疗：白/蓝
    battery: '#e8b93c', fuse: '#e8b93c', capacitor: '#6abfff', glowstick: '#a8e0a0', flashlight: '#e8b93c', // 电气：琥珀（电容器=瓶装闪电：蓝）
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
    megfolder: '#c9b458', oddbook: '#c9b458', pamphlet: '#c9b458', endnote: '#c9b458', welcomenote: '#c9b458', chalkstub: '#e8e2d2', // 纸物/文书
    stonekazoo: '#a8a294', presses: '#e8b93c',
    // v32 新增
    cashew: '#c9a05a', // 腰果水：褐
    luckymilk: '#a8d89a', // v54 幸运豆奶：浅绿（补给系）
    candysilver: '#c9c9d4', candybullet: '#9a9aa8', candygun: '#5a5a64', candystanley: '#d0d0c0',
    candywaste: '#d9c93a', candygenius: '#e8a0b8', candymint: '#a0d0b0', // Object 5 糖果
    manmade: '#c9a0a0', // 人制品：粉白
    firesalt: '#e8823c', liquidpain: '#d94a3a', // 火盐：橙 / 液态痛苦：红
    dryshrimp: '#b3612e', friedshrimp: '#d99a3a', // 旱虾：橙褐 / 酥炸：金黄
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
  const halo = new THREE.Mesh(new THREE.RingGeometry(0.18, 0.26, 10), new THREE.MeshBasicMaterial({ color: gc, transparent: true, opacity: 0.45, side: THREE.DoubleSide }))
  halo.rotation.x = -Math.PI / 2
  halo.position.y = -0.28
  grp.add(halo)
  return grp
}
