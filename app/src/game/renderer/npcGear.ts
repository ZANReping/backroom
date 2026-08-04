// NPC 标志性配饰（v35 起按 NPC id 附加到骨骼部件上，随部件动画）——
// v40 起抽为共享模块：游戏内 renderer 与图鉴「人士」页 AvatarPreview 走同一通道，
// 档案里的 3D 形象因此能直接看到职业配饰（不再平面脑补）。
// 坐标约定：head 局部（头块 y 0–0.26，面前 z≈0.12）、torso 局部（中心 y±0.29，前表面 z≈0.105–0.12，
// 配饰统一取 z≈0.135 微浮于表面）、四肢关节局部（原点在肩/髋，手臂下垂手部约 y −0.5）。
import * as THREE from 'three'
import { box, cyl } from './shared'
import type { NpcDef } from '../npcs'

export function applyNpcGear(parts: Record<string, THREE.Object3D>, id: string, def?: NpcDef) {
  const { head, armL, armR } = parts
  const glasses = () => {
    if (!head) return
    head.add(box(0.055, 0.045, 0.012, '#2a2d30', -0.06, 0.15, 0.126))
    head.add(box(0.055, 0.045, 0.012, '#2a2d30', 0.06, 0.15, 0.126))
    head.add(box(0.025, 0.01, 0.012, '#2a2d30', 0, 0.15, 0.126))
  }
  // v39：BRC 员工制服配饰（黑影 + 制服本体由 buildPlayerModel 淡蓝上衣/棕裤承担）——
  // 深灰军式贝雷帽（正面金属徽章按级别铜/银/金）/ 红色肩铠 / 白围裙 / 黑腰带 / 黑皮雨靴 / 手中工具
  if (id.startsWith('brc_')) {
    const badgeC = def?.uniform?.badge ?? '#b87333'
    if (head) {
      head.add(box(0.3, 0.07, 0.28, '#3a3d42', 0, 0.3, 0)) // 贝雷帽帽体
      head.add(box(0.2, 0.05, 0.18, '#3a3d42', 0.04, 0.36, -0.03)) // 帽顶（微斜）
      head.add(box(0.06, 0.06, 0.016, badgeC, 0, 0.28, 0.142)) // 正面金属徽章（级别色）
    }
    if (parts.torso) {
      parts.torso.add(box(0.12, 0.07, 0.26, '#a63a2e', -0.24, 0.27, 0)) // 红色肩铠（左）
      parts.torso.add(box(0.12, 0.07, 0.26, '#a63a2e', 0.24, 0.27, 0)) // 红色肩铠（右）
      parts.torso.add(box(0.3, 0.5, 0.02, '#e8e8e0', 0, -0.06, 0.135)) // 白围裙前襟
      parts.torso.add(box(0.32, 0.05, 0.02, '#dcd8cc', 0, -0.21, 0.135)) // 围裙腰带
      parts.torso.add(box(0.48, 0.06, 0.26, '#17171a', 0, -0.25, 0)) // 黑色腰带
    }
    if (parts.legL) parts.legL.add(box(0.19, 0.34, 0.21, '#17171a', 0, -0.45, 0.01)) // 黑皮雨靴（左）
    if (parts.legR) parts.legR.add(box(0.19, 0.34, 0.21, '#17171a', 0, -0.45, 0.01)) // 黑皮雨靴（右）
    // 手中工具（按工作循环；挂右臂关节随手摆动）
    const wl = def?.workLoop
    if (armR && wl === 'hammer') {
      armR.add(cyl(0.018, 0.018, 0.3, '#7a5a30', 0, -0.62, 0.04, 6)) // 木柄
      armR.add(box(0.06, 0.07, 0.14, '#8a8a8a', 0, -0.79, 0.04)) // 锤头
    } else if (armR && wl === 'saw') {
      armR.add(box(0.04, 0.09, 0.09, '#5a4a3a', 0, -0.52, 0.04)) // 锯柄
      armR.add(box(0.015, 0.08, 0.42, '#b8bcc0', 0, -0.55, 0.28)) // 锯片
    } else if (armR && wl === 'paint') {
      armR.add(cyl(0.014, 0.014, 0.2, '#7a5a30', 0, -0.58, 0.04, 6)) // 刷柄
      armR.add(box(0.05, 0.08, 0.03, '#d9c39a', 0, -0.7, 0.04)) // 刷毛
      if (armL) armL.add(cyl(0.055, 0.055, 0.09, '#9a9a9e', 0, -0.52, 0.05, 8)) // 左手漆桶
    } else if (armR && wl === 'mop') {
      const stick = cyl(0.016, 0.016, 0.85, '#7a5a30', 0, -0.85, 0.16, 6) // 拖把长杆
      stick.rotation.x = 0.38
      armR.add(stick)
      armR.add(box(0.13, 0.05, 0.13, '#c9c2a8', 0, -1.24, 0.33)) // 拖把头
    }
    return
  }
  // v47：青鸟神父（专属配饰优先于信众通用配饰）——蓝色长袍下摆 + 高冠 + 肩头小鹉（wikidot：鹉主偶尔站上他的肩头）
  if (id === 'bluebird') {
    if (parts.torso) {
      parts.torso.add(box(0.34, 0.62, 0.26, '#2a5fd8', 0, -0.42, 0)) // 长袍下摆（盖过裤腿）
      parts.torso.add(box(0.36, 0.05, 0.28, '#d4af37', 0, -0.14, 0)) // 金饰袍缘
      parts.torso.add(box(0.1, 0.14, 0.02, '#d4af37', 0, 0.14, 0.135)) // 胸前金徽
    }
    if (head) {
      head.add(box(0.24, 0.05, 0.22, '#2a5fd8', 0, 0.28, 0)) // 高冠基圈
      head.add(box(0.16, 0.16, 0.05, '#2a5fd8', 0, 0.38, -0.02)) // 高冠前板
      head.add(box(0.1, 0.1, 0.02, '#d4af37', 0, 0.38, 0.01)) // 冠上金饰
    }
    if (armR) { // 肩头小鹉（蓝色鹦鹉，偶有若无地栖在他右肩）
      armR.add(box(0.09, 0.08, 0.13, '#2a5fd8', 0.02, -0.04, 0)) // 鹉身
      armR.add(box(0.06, 0.06, 0.06, '#3a72e8', 0.02, 0.03, 0.05)) // 鹉头
      armR.add(box(0.03, 0.02, 0.03, '#e8a03a', 0.02, 0.02, 0.09)) // 喙
      armR.add(box(0.04, 0.02, 0.1, '#1a3f9e', 0.02, -0.02, -0.1)) // 尾羽
    }
    return
  }
  // v47：辛克莱·贝克特（专属配饰优先于信众通用配饰）——便装 + 蓝羽胸针 + 臂弯日记本（wikidot：便装出行的狂热者）
  if (id === 'sinclair') {
    if (parts.torso) {
      const pin = box(0.03, 0.09, 0.015, '#2a5fd8', 0.09, 0.18, 0.125) // 蓝羽胸针
      pin.rotation.z = -0.3
      parts.torso.add(pin)
      parts.torso.add(box(0.05, 0.05, 0.016, '#4142a5', 0.09, 0.1, 0.125)) // 信众色胸章
    }
    if (armL) { // 臂弯日记本（wikidot 作者页「辛克莱日记」）
      armL.add(box(0.14, 0.035, 0.19, '#5a4a6a', 0, -0.48, 0.08)) // 紫色封皮
      armL.add(box(0.12, 0.02, 0.17, '#e8e0c8', 0, -0.455, 0.08)) // 纸页
      armL.add(box(0.02, 0.04, 0.19, '#4142a5', 0.06, -0.475, 0.08)) // 书脊系带（信众蓝）
    }
    return
  }
  // v45：杰瑞的信众——蓝色额带 + 额侧鹉羽饰 + 胸前圣徽（副主题色 #0071c9）
  if (id.startsWith('jerry_') || def?.faction === 'jerry') {
    if (head) {
      head.add(box(0.28, 0.04, 0.26, '#4142a5', 0, 0.225, 0)) // 蓝色额带
      const feather = box(0.025, 0.12, 0.02, '#2a5fd8', 0.12, 0.31, -0.02)
      feather.rotation.z = -0.35
      head.add(feather) // 额侧鹉羽饰
    }
    if (parts.torso) {
      parts.torso.add(box(0.08, 0.1, 0.015, '#0071c9', 0, 0.14, 0.135)) // 胸前圣徽
      parts.torso.add(box(0.05, 0.05, 0.016, '#f5e3ae', 0, 0.14, 0.14)) // 徽上圣辉
    }
    return
  }
  switch (id) {
    case 'kat': // 监督者：臂弯文件夹
      if (armL) {
        armL.add(box(0.16, 0.02, 0.22, '#5a4a3a', 0, -0.5, 0.1))
        armL.add(box(0.14, 0.006, 0.18, '#f0e6c0', 0, -0.488, 0.1))
      }
      break
    case 'justin': // 迎新官：手中咖啡杯
      if (armR) armR.add(cyl(0.035, 0.035, 0.07, '#e8e8e0', 0, -0.52, 0.08, 8))
      break
    case 'nightingale': // 无线电员：头戴耳机 + 麦克风
      if (head) {
        head.add(box(0.28, 0.04, 0.26, '#2a2d30', 0, 0.245, 0))
        head.add(box(0.045, 0.09, 0.07, '#2a2d30', -0.145, 0.14, 0))
        head.add(box(0.045, 0.09, 0.07, '#2a2d30', 0.145, 0.14, 0))
        const mic = box(0.015, 0.015, 0.12, '#2a2d30', -0.12, 0.09, 0.1)
        mic.rotation.y = 0.5
        head.add(mic)
      }
      break
    case 'river': // 档案员：眼镜 + 臂弯书堆
      glasses()
      if (armL) {
        armL.add(box(0.16, 0.05, 0.22, '#6a3a3a', 0, -0.47, 0.06))
        armL.add(box(0.15, 0.04, 0.2, '#3a5a4a', 0, -0.425, 0.06))
      }
      break
    case 'faust': // 研究员：眼镜 + 蓝色丁腈手套
      glasses()
      if (armL) armL.add(box(0.1, 0.1, 0.1, '#4a7ac9', 0, -0.52, 0))
      if (armR) armR.add(box(0.1, 0.1, 0.1, '#4a7ac9', 0, -0.52, 0))
      break
    case 'suanpan': // 军需官：手中算盘
      if (armL) {
        armL.add(box(0.18, 0.025, 0.11, '#7a5a30', 0, -0.5, 0.08))
        for (let i = 0; i < 3; i++) armL.add(box(0.015, 0.04, 0.015, '#3a2a18', -0.05 + i * 0.05, -0.485, 0.08))
      }
      break

    // ================= v40：职业配饰补齐（让职业一目了然；图鉴档案同通道可见） =================
    case 'tom': // 厨师·店主：白色厨师高帽 + 白围裙
      if (head) {
        head.add(box(0.27, 0.06, 0.25, '#f0f0ea', 0, 0.28, 0)) // 帽箍
        head.add(box(0.24, 0.14, 0.22, '#f4f4ee', 0, 0.37, 0)) // 高帽筒
        head.add(box(0.2, 0.04, 0.18, '#e4e4de', 0, 0.45, 0)) // 帽顶
      }
      if (parts.torso) {
        parts.torso.add(box(0.12, 0.1, 0.015, '#f0eee8', 0, 0.2, 0.13)) // 围裙颈带
        parts.torso.add(box(0.3, 0.44, 0.02, '#f0eee8', 0, -0.1, 0.135)) // 围裙前襟
        parts.torso.add(box(0.32, 0.04, 0.02, '#dcd8cc', 0, -0.2, 0.135)) // 腰带
      }
      break
    case 'aiko': // 跑堂：蝴蝶结发饰（左侧）+ 小围裙
      if (head) {
        head.add(box(0.035, 0.035, 0.03, '#d94a5a', -0.12, 0.29, 0.03)) // 结心
        const w1 = box(0.07, 0.045, 0.02, '#d94a5a', -0.12, 0.315, -0.04); w1.rotation.x = 0.55 // 上翅
        const w2 = box(0.07, 0.045, 0.02, '#c93a4a', -0.12, 0.315, 0.1); w2.rotation.x = -0.55 // 下翅
        head.add(w1, w2)
      }
      if (parts.torso) {
        parts.torso.add(box(0.26, 0.3, 0.02, '#f0e6d0', 0, -0.14, 0.135)) // 小围裙前襟
        parts.torso.add(box(0.28, 0.035, 0.02, '#e0d2b8', 0, -0.22, 0.135)) // 腰带
      }
      // 金色斧头「幸运」（wikidot 佐藤爱子：随身金斧）——挂右臂手部
      if (armR) {
        armR.add(cyl(0.014, 0.014, 0.34, '#6a4a2a', 0, -0.66, 0.04, 6)) // 斧柄（斜挎手前）
        armR.add(box(0.025, 0.1, 0.13, '#d8a82a', 0, -0.86, 0.04)) // 金色斧刃
        armR.add(box(0.03, 0.045, 0.05, '#b8881a', 0, -0.8, 0.04)) // 斧头座
      }
      break
    case 'martin': // 护士长：护士帽（白 + 阿丽亚娜紫十字）
      if (head) {
        head.add(box(0.18, 0.045, 0.12, '#f0f0f2', 0, 0.295, 0.05)) // 帽体
        head.add(box(0.05, 0.014, 0.008, '#8676e2', 0, 0.295, 0.112)) // 十字横
        head.add(box(0.014, 0.04, 0.008, '#8676e2', 0, 0.295, 0.112)) // 十字竖
      }
      break
    case 'dupont': // 主任医师：听诊器挂颈（双胶管 + 胸件）
      if (parts.torso) {
        parts.torso.add(box(0.14, 0.03, 0.02, '#3a3d42', 0, 0.235, 0.125)) // 颈后挂弧
        parts.torso.add(box(0.018, 0.22, 0.018, '#3a3d42', -0.055, 0.11, 0.14)) // 左胶管
        parts.torso.add(box(0.018, 0.22, 0.018, '#3a3d42', 0.055, 0.11, 0.14)) // 右胶管
        parts.torso.add(box(0.05, 0.05, 0.02, '#9aa0a8', -0.055, -0.03, 0.14)) // 胸件
      }
      break
    case 'lefevre': // 实验室技术员：护目镜推在额头（双镜窗 + 头带）
      if (head) {
        head.add(box(0.28, 0.03, 0.26, '#2a2d30', 0, 0.215, 0)) // 头带
        head.add(box(0.075, 0.055, 0.02, '#3a3d42', -0.055, 0.225, 0.115)) // 左镜框
        head.add(box(0.075, 0.055, 0.02, '#3a3d42', 0.055, 0.225, 0.115)) // 右镜框
        head.add(box(0.055, 0.035, 0.012, '#9adfff', -0.055, 0.225, 0.127)) // 左镜片
        head.add(box(0.055, 0.035, 0.012, '#9adfff', 0.055, 0.225, 0.127)) // 右镜片
        head.add(box(0.03, 0.015, 0.02, '#3a3d42', 0, 0.225, 0.115)) // 鼻梁
      }
      break
    case 'morel': // 外科医生：手术帽 + 口罩
      if (head) {
        head.add(box(0.28, 0.07, 0.26, '#7ab0a8', 0, 0.285, 0)) // 手术帽
        head.add(box(0.28, 0.03, 0.26, '#5a9088', 0, 0.25, 0)) // 帽檐带
        head.add(box(0.15, 0.07, 0.02, '#d8e4e0', 0, 0.06, 0.126)) // 口罩
        head.add(box(0.02, 0.015, 0.18, '#c0ccc8', -0.135, 0.065, 0.02)) // 口罩侧带（左）
        head.add(box(0.02, 0.015, 0.18, '#c0ccc8', 0.135, 0.065, 0.02)) // 口罩侧带（右）
      }
      break
    case 'lecomte': // 通信主管：单边对讲耳机 + 挂绳对讲机（区别于夜莺的电台大耳机）
      if (head) {
        head.add(box(0.27, 0.02, 0.25, '#3a3d42', 0, 0.26, 0)) // 细头箍
        head.add(box(0.04, 0.08, 0.06, '#2a2d30', 0.145, 0.14, 0)) // 右侧听筒
        const mic2 = box(0.012, 0.012, 0.1, '#2a2d30', 0.12, 0.08, 0.08) // 麦克风杆
        mic2.rotation.y = 0.4
        head.add(mic2)
      }
      if (parts.torso) {
        parts.torso.add(box(0.012, 0.16, 0.012, '#6a5a3a', -0.025, 0.17, 0.13)) // 挂绳（左）
        parts.torso.add(box(0.012, 0.16, 0.012, '#6a5a3a', 0.025, 0.17, 0.13)) // 挂绳（右）
        parts.torso.add(box(0.07, 0.11, 0.035, '#2a2d30', 0, 0.02, 0.14)) // 对讲机
        parts.torso.add(box(0.012, 0.07, 0.012, '#1a1c1e', 0.03, 0.11, 0.14)) // 天线
      }
      break
    case 'muller': // 昆虫学家：手持捕虫网（长杆 + 网圈 + 网兜）
      if (armR) {
        armR.add(cyl(0.012, 0.012, 0.6, '#8a6a42', 0, -0.78, 0.06, 6)) // 网杆
        const hoop = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.012, 6, 12),
          new THREE.MeshLambertMaterial({ color: '#9aa0a8' }))
        hoop.rotation.x = Math.PI / 2 // 网圈放平
        hoop.position.set(0, -1.08, 0.06)
        armR.add(hoop)
        armR.add(cyl(0.085, 0.02, 0.14, '#e8e8e0', 0, -1.15, 0.06, 8)) // 网兜（锥形纱袋）
      }
      break
    case 'lan': // 行商/迎新大使：绿头巾（额带 + 脑后结与飘带）
      if (head) {
        head.add(box(0.28, 0.05, 0.26, '#5c8d5e', 0, 0.225, 0)) // 额带
        head.add(box(0.05, 0.05, 0.04, '#4a7a4c', 0, 0.21, -0.145)) // 脑后结
        head.add(box(0.025, 0.09, 0.02, '#4a7a4c', -0.02, 0.155, -0.15)) // 飘带（左）
        head.add(box(0.025, 0.09, 0.02, '#4a7a4c', 0.02, 0.155, -0.15)) // 飘带（右）
      }
      break
    case 'laozhangfang': // 保险库总账：老花镜（低架鼻梁）+ 臂弯账本
      if (head) {
        head.add(box(0.05, 0.04, 0.012, '#6a5a3a', -0.055, 0.115, 0.126)) // 左镜
        head.add(box(0.05, 0.04, 0.012, '#6a5a3a', 0.055, 0.115, 0.126)) // 右镜
        head.add(box(0.02, 0.008, 0.012, '#6a5a3a', 0, 0.115, 0.126)) // 鼻梁
      }
      if (armL) {
        armL.add(box(0.16, 0.045, 0.22, '#5a2e2e', 0, -0.48, 0.08)) // 账本红皮
        armL.add(box(0.15, 0.03, 0.2, '#f0e6c0', 0, -0.472, 0.08)) // 账页
        armL.add(box(0.02, 0.05, 0.05, '#c9a03a', 0.07, -0.48, 0.08)) // 铜扣
      }
      break
    case 'shen': // 首席鉴定师：手中放大镜（柄 + 铜圈 + 镜片）
      if (armR) {
        armR.add(cyl(0.012, 0.012, 0.14, '#5a4a3a', 0, -0.58, 0.06, 6)) // 柄
        const rim = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.01, 6, 12),
          new THREE.MeshLambertMaterial({ color: '#b08d46' }))
        rim.position.set(0, -0.7, 0.06)
        armR.add(rim)
        armR.add(cyl(0.045, 0.045, 0.008, '#bfe8ff', 0, -0.7, 0.06, 10)) // 镜片
      }
      break
    case 'tang': // 杂货摊主：腰侧小算盘串（木框 + 铜珠两档）
      if (parts.torso) {
        parts.torso.add(box(0.03, 0.15, 0.11, '#7a5a30', 0.2, -0.18, 0.02)) // 算盘框
        for (let i = 0; i < 3; i++) { // 三档铜珠（上下两排）
          parts.torso.add(box(0.036, 0.02, 0.02, '#c9a03a', 0.2, -0.15, -0.015 + i * 0.03))
          parts.torso.add(box(0.036, 0.02, 0.02, '#c9a03a', 0.2, -0.2, -0.015 + i * 0.03))
        }
      }
      break
    case 'kui': // TGPF 警备队长：斜挎肩带 + 腰侧警棍
      if (parts.torso) {
        const strap = box(0.05, 0.46, 0.02, '#17171a', 0, 0.02, 0.125) // 斜挎肩带
        strap.rotation.z = 0.5
        parts.torso.add(strap)
        parts.torso.add(box(0.045, 0.28, 0.045, '#23262a', 0.2, -0.32, 0.06)) // 警棍
        parts.torso.add(box(0.05, 0.06, 0.05, '#3a3d42', 0.2, -0.17, 0.06)) // 棍柄护手
      }
      break
    // ===== v43：办公区EL3A（BNTG 物流中转站） =====
    case 'mccauley': // 物流主管：臂弯运单夹板 + 胸前挂绳哨笔
      if (armL) {
        armL.add(box(0.15, 0.02, 0.21, '#4a3a2a', 0, -0.5, 0.1)) // 夹板
        armL.add(box(0.13, 0.006, 0.17, '#f0e6c0', 0, -0.488, 0.1)) // 运单页
        armL.add(box(0.05, 0.02, 0.03, '#8a8a8a', 0, -0.478, 0.02)) // 板夹
      }
      if (parts.torso) {
        parts.torso.add(box(0.02, 0.2, 0.012, '#c9a03a', 0, 0.14, 0.128)) // 挂绳
        parts.torso.add(box(0.03, 0.06, 0.02, '#2a2d33', 0, 0.02, 0.13)) // 哨笔
      }
      break
    case 'vesper': // 兑换员：臂弯小秤盘 + 腰间钱袋
      if (armL) {
        armL.add(cyl(0.09, 0.09, 0.015, '#c9b458', 0, -0.5, 0.1, 10)) // 秤盘
        armL.add(cyl(0.012, 0.012, 0.1, '#8a8a8a', 0, -0.44, 0.1, 6)) // 秤杆
      }
      if (parts.torso) parts.torso.add(box(0.14, 0.12, 0.06, '#6a5a40', -0.2, -0.24, 0.08)) // 钱袋
      break
    case 'pidge': // 分拣员：手中胶带枪 + 胸前记号笔
      if (armR) {
        armR.add(box(0.05, 0.1, 0.12, '#b04030', 0, -0.56, 0.06)) // 胶带枪身
        armR.add(cyl(0.035, 0.035, 0.05, '#e8e2d2', 0, -0.5, 0.1, 8).rotateZ(Math.PI / 2)) // 胶带卷
      }
      if (parts.torso) parts.torso.add(box(0.02, 0.09, 0.02, '#3a5a8a', 0.14, 0.2, 0.125)) // 胸袋记号笔
      break
    case 'boone': // 搬运工：肩头搭毛巾 + 劳动手套插腰
      if (parts.torso) {
        parts.torso.add(box(0.12, 0.04, 0.2, '#d8d2c2', -0.22, 0.3, 0)) // 肩上毛巾
        parts.torso.add(box(0.1, 0.16, 0.02, '#d8d2c2', -0.22, 0.2, 0.1)) // 垂下的毛巾角
        parts.torso.add(box(0.06, 0.08, 0.04, '#7a5a30', 0.18, -0.22, 0.06)) // 腰间手套
      }
      break
    // ===== v46：EL3A 夹楼办公区（2F 固定 NPC） =====
    case 'whitfield': // 运营主任：细头箍对讲耳机 + 臂弯调度图夹
      if (head) {
        head.add(box(0.27, 0.02, 0.25, '#3a3d42', 0, 0.26, 0)) // 细头箍
        head.add(box(0.04, 0.07, 0.06, '#2a2d30', 0.145, 0.14, 0)) // 右侧听筒
        const mic = box(0.012, 0.012, 0.09, '#2a2d30', 0.12, 0.09, 0.09)
        mic.rotation.y = 0.5
        head.add(mic) // 麦克风杆
      }
      if (armL) {
        armL.add(box(0.16, 0.02, 0.23, '#4a3a2a', 0, -0.5, 0.1)) // 调度图夹板
        armL.add(box(0.14, 0.006, 0.19, '#dce8dc', 0, -0.488, 0.1)) // 调度表（画着格线的纸）
        armL.add(box(0.14, 0.004, 0.02, '#5c6d5e', 0, -0.484, 0.05)) // 表上绿线
      }
      break
    case 'kowalski': // 老会计：圆老花镜（低架鼻梁）+ 手中老式计算器
      if (head) {
        head.add(box(0.05, 0.05, 0.012, '#3a3d42', -0.055, 0.115, 0.126)) // 左圆镜
        head.add(box(0.05, 0.05, 0.012, '#3a3d42', 0.055, 0.115, 0.126)) // 右圆镜
        head.add(box(0.02, 0.008, 0.012, '#3a3d42', 0, 0.115, 0.126)) // 鼻梁
      }
      if (armR) {
        armR.add(box(0.11, 0.03, 0.16, '#2e3236', 0, -0.52, 0.08)) // 计算器机身
        armR.add(box(0.07, 0.012, 0.03, '#7ac97a', 0, -0.5, 0.02)) // 绿色数码屏
      }
      break
  }
}
