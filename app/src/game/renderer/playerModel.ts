// 玩家完整低模（预览/捏人用；第一人称仍只显示手部，见 viewmodel.ts）
// 身高固定 ~1.75m（与碰撞体积一致，不可编辑），正面 +Z。
// v34：性别体型 / 发型×8（v41 细化：分层+高光暗部+发际线+鬓角）/ 上衣×4 / 裤子×3 / 表情×4 / 装备细化（绝缘服/保温服/手套/潜水面罩/头灯）。
// v54 细化：脖颈/下颌/耳 / 每款发型加层次件 / 衣褶·领口·下摆挂 torso 随动 / 裤线·裤脚 / 鞋拆鞋底鞋面 / 手掌+手指+拇指 / 四肢小幅收细。
// v54b 扩充：发型×16 / 上衣×8（+工装/背心/毛衣/风衣）/ 裤子×6（+牛仔裤/运动裤/阔腿裤）/ 眼镜×3 与胡须×2（面部件，打 userData.face）/ 鞋×3（便鞋/运动鞋/皮靴）。
// v54c 发型返修：发件统一 userData.hair=1（mesh-smoke 据此断言连接性/穿模），逐款修悬空件与面部/耳/躯干穿模。
// 四肢为关节 mesh（几何原点在肩/髋，rotation.x 摆动），grp.userData.parts 供骨骼式动画——
// 无面灵等「类人」实体直接复用本模型（摘除 userData.face 面部件即可）。
import * as THREE from 'three'
import type { AvatarCfg } from '../core/avatar'

export interface EquipVisual {
  gloves?: boolean // 隔热手套：手部变黄
  suit?: boolean // 绝缘服：橡胶绿套装 + 胸口拉链
  cavingsuit?: boolean // 保温服：棕褐棉衣 + 反光条
  divemask?: boolean // 潜水面罩：镜框 + 视窗玻璃 + 头带
  headlamp?: boolean // 头灯：头带 + 额前灯体
}

// 颜色按系数压暗（手动 hex 运算，离线桩环境无 THREE.Color 全套 API）
const shade = (color: string, k: number) => {
  const n = parseInt(color.slice(1), 16)
  const r = Math.min(255, Math.round(((n >> 16) & 255) * k))
  const g = Math.min(255, Math.round(((n >> 8) & 255) * k))
  const b = Math.min(255, Math.round((n & 255) * k))
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`
}

export function buildPlayerModel(cfg: AvatarCfg, ev: EquipVisual = {}): THREE.Group {
  const g = new THREE.Group()
  const mat = (color: string) => new THREE.MeshLambertMaterial({ color })
  // 普通盒（几何居中）
  const bx = (parent: THREE.Object3D, w: number, h: number, d: number, color: string, x: number, y: number, z = 0) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color))
    m.position.set(x, y, z)
    parent.add(m)
    return m
  }
  // 关节盒（几何原点在顶部，可绕肩/髋摆动）
  const joint = (w: number, h: number, d: number, color: string, x: number, y: number) => {
    const geo = new THREE.BoxGeometry(w, h, d)
    geo.translate(0, -h / 2, 0)
    const m = new THREE.Mesh(geo, mat(color))
    m.position.set(x, y, 0)
    g.add(m)
    return m
  }
  const faceMark = (m: THREE.Mesh) => { m.userData.face = 1; return m }

  const fem = cfg.gender === 1
  const skin = cfg.skin
  const suited = ev.suit || ev.cavingsuit
  const topC = ev.suit ? '#3a5a3a' : ev.cavingsuit ? '#8a7a5c' : cfg.top
  const limbC = ev.suit ? '#2e4a2e' : ev.cavingsuit ? '#7a6a4e' : cfg.pants
  const sleeveC = suited ? limbC : topC
  const handC = ev.gloves ? '#b89a2e' : ev.suit ? '#2e4a2e' : skin
  const shoeC = ev.suit ? '#243a24' : '#26262a'
  // 性别体型参数（v54：四肢小幅收细，肩宽/挂点坐标不变）
  const shoulder = fem ? 0.38 : 0.46, torsoD = fem ? 0.21 : 0.24
  const armX = fem ? 0.245 : 0.29, armW = fem ? 0.09 : 0.105
  const legX = fem ? 0.125 : 0.11, legW = fem ? 0.135 : 0.145
  const legD = legW + 0.02

  // ---- 腿（裤款 + 鞋；关节在髋 y=0.78）----
  const mkLeg = (x: number) => {
    const short = cfg.pantsStyle === 1
    const leg = joint(legW, short ? 0.36 : 0.72, legD, limbC, x, 0.78)
    if (short) bx(leg, legW - 0.02, 0.36, legD - 0.02, skin, 0, -0.54, 0) // 短裤露小腿
    if (cfg.pantsStyle === 2) { // 工装侧袋
      bx(leg, 0.035, 0.15, 0.11, shade(limbC, 0.75), legW / 2 + 0.017 * Math.sign(x), -0.2, 0.02)
    }
    if (short) { // 短裤裤脚卷边
      bx(leg, legW + 0.008, 0.04, legD + 0.008, shade(limbC, 0.85), 0, -0.35, 0)
    } else if (cfg.pantsStyle === 3) { // 牛仔裤：裤线 + 磨白裤脚 + 后袋
      bx(leg, 0.02, 0.5, 0.006, shade(limbC, 0.78), 0, -0.34, legD / 2 + 0.003)
      bx(leg, legW + 0.01, 0.04, legD + 0.01, shade(limbC, 1.25), 0, -0.615, 0) // 磨白裤脚
      bx(leg, 0.07, 0.08, 0.008, shade(limbC, 0.85), 0, -0.14, -legD / 2 - 0.003) // 后袋
    } else if (cfg.pantsStyle === 4) { // 运动裤：外侧条纹 + 收口裤脚
      bx(leg, 0.014, 0.56, legD + 0.006, shade(limbC, 1.6), (legW / 2 + 0.005) * Math.sign(x), -0.36, 0) // 侧条纹
      bx(leg, legW + 0.006, 0.06, legD + 0.006, shade(limbC, 0.72), 0, -0.62, 0) // 收口裤脚
    } else if (cfg.pantsStyle === 5) { // 阔腿裤：下段加宽 + 大脚口（无裤线）
      bx(leg, legW + 0.045, 0.34, legD + 0.045, limbC, 0, -0.53, 0) // 阔腿下段
      bx(leg, legW + 0.055, 0.05, legD + 0.055, shade(limbC, 0.85), 0, -0.665, 0) // 大脚口
    } else { // 长裤/工装裤：裤线（前中烫迹）+ 裤脚
      bx(leg, 0.02, 0.5, 0.006, shade(limbC, 0.78), 0, -0.34, legD / 2 + 0.003)
      bx(leg, legW + 0.008, 0.05, legD + 0.008, shade(limbC, 0.85), 0, -0.615, 0)
    }
    // 鞋三款（底缘均 y=-0.72 不漂移）：便鞋=鞋底+鞋面+鞋头 / 运动鞋=浅厚底+鞋带 / 皮靴=高筒
    if (cfg.shoes === 1 && !ev.suit) { // 运动鞋
      bx(leg, legW + 0.02, 0.035, legD + 0.06, '#c8c8cc', 0, -0.7025, 0.025) // 厚底
      bx(leg, legW + 0.01, 0.05, legD + 0.02, '#e0e0e4', 0, -0.66, 0.005) // 鞋面
      bx(leg, legW - 0.03, 0.035, 0.07, '#c8c8cc', 0, -0.662, legD / 2 + 0.02) // 鞋头
      bx(leg, legW - 0.02, 0.008, 0.05, '#9a9aa0', 0, -0.648, legD / 2 + 0.012) // 鞋带横痕
    } else if (cfg.shoes === 2 && !ev.suit) { // 皮靴
      const btC = '#4a3424'
      bx(leg, legW + 0.02, 0.03, legD + 0.05, shade(btC, 0.55), 0, -0.705, 0.02) // 靴底
      bx(leg, legW + 0.015, 0.2, legD + 0.015, btC, 0, -0.59, 0) // 靴筒
      bx(leg, legW - 0.03, 0.05, 0.07, shade(btC, 1.3), 0, -0.675, legD / 2 + 0.015) // 靴头
    } else { // 便鞋（默认；绝缘服亦用）：鞋底（深色贴地）+ 鞋面 + 鞋头（微亮）
      bx(leg, legW + 0.02, 0.03, legD + 0.06, shade(shoeC, 0.55), 0, -0.705, 0.025) // 鞋底
      bx(leg, legW + 0.01, 0.055, legD + 0.02, shoeC, 0, -0.662, 0.005) // 鞋面
      bx(leg, legW - 0.03, 0.04, 0.07, shade(shoeC, 1.35), 0, -0.665, legD / 2 + 0.02) // 鞋头
    }
    return leg
  }
  const legL = mkLeg(-legX), legR = mkLeg(legX)
  if (fem) bx(g, shoulder + 0.04, 0.12, torsoD + 0.02, limbC, 0, 0.81, 0) // 女款胯部

  // ---- 躯干（上衣 + 款式细节）----
  const torso = bx(g, shoulder, 0.58, torsoD, topC, 0, 1.06)
  const fz = torsoD / 2 // 前表面
  if (fem) { // v40：女性体型——胸部适度隆起（低调不夸张，两块小盒体；男性不变；玩家与女 NPC 自动生效）
    bx(g, 0.1, 0.11, 0.035, topC, -0.082, 1.19, fz + 0.008)
    bx(g, 0.1, 0.11, 0.035, topC, 0.082, 1.19, fz + 0.008)
  }
  if (cfg.topStyle === 1) { // 衬衫：领口 + 门襟
    bx(g, 0.2, 0.05, 0.04, shade(topC, 0.85), 0, 1.36, fz - 0.03)
    bx(g, 0.03, 0.5, 0.012, shade(topC, 0.7), 0, 1.04, fz + 0.006)
  } else if (cfg.topStyle === 2) { // 连帽衫：帽兜 + 前袋
    bx(g, 0.24, 0.2, 0.12, shade(topC, 0.85), 0, 1.34, -fz - 0.05)
    bx(g, 0.24, 0.14, 0.03, shade(topC, 0.8), 0, 0.92, fz + 0.015)
  } else if (cfg.topStyle === 3) { // 夹克：拉链 + 肩线 + 下摆
    bx(g, 0.025, 0.56, 0.012, '#1c1a18', 0, 1.06, fz + 0.006)
    bx(g, 0.1, 0.06, torsoD + 0.02, shade(topC, 0.85), -(shoulder / 2 - 0.03), 1.36, 0)
    bx(g, 0.1, 0.06, torsoD + 0.02, shade(topC, 0.85), shoulder / 2 - 0.03, 1.36, 0)
    bx(g, shoulder + 0.01, 0.05, torsoD + 0.01, shade(topC, 0.8), 0, 0.79, 0)
  } else if (cfg.topStyle === 4) { // v54b 工装：背带×2 + 胸前大袋 + 背带扣（挂 torso 局部系随动）
    bx(torso, 0.05, 0.52, 0.014, shade(topC, 0.78), -0.09, 0.04, torsoD / 2 + 0.006) // 背带（左）
    bx(torso, 0.05, 0.52, 0.014, shade(topC, 0.78), 0.09, 0.04, torsoD / 2 + 0.006) // 背带（右）
    bx(torso, 0.16, 0.14, 0.02, shade(topC, 0.9), 0, -0.08, torsoD / 2 + 0.01) // 胸前大袋
    bx(torso, 0.03, 0.03, 0.016, shade(topC, 1.35), -0.09, 0.24, torsoD / 2 + 0.008) // 背带扣（左）
    bx(torso, 0.03, 0.03, 0.016, shade(topC, 1.35), 0.09, 0.24, torsoD / 2 + 0.008) // 背带扣（右）
  } else if (cfg.topStyle === 5) { // v54b 背心：V 领开口 + 襟边 + 腰袋（无袖，见 mkArm）
    const v1 = bx(torso, 0.05, 0.16, 0.012, shade(topC, 0.6), -0.05, 0.19, torsoD / 2 + 0.005); v1.rotation.z = -0.42 // V 领（左）
    const v2 = bx(torso, 0.05, 0.16, 0.012, shade(topC, 0.6), 0.05, 0.19, torsoD / 2 + 0.005); v2.rotation.z = 0.42 // V 领（右）
    bx(torso, 0.025, 0.5, 0.012, shade(topC, 0.7), 0, 0.02, torsoD / 2 + 0.006) // 前襟边
    bx(torso, 0.08, 0.07, 0.014, shade(topC, 0.85), -0.12, -0.18, torsoD / 2 + 0.007) // 腰袋（左）
    bx(torso, 0.08, 0.07, 0.014, shade(topC, 0.85), 0.12, -0.18, torsoD / 2 + 0.007) // 腰袋（右）
  } else if (cfg.topStyle === 6) { // v54b 毛衣：高领 + 罗纹下摆横条
    bx(torso, 0.2, 0.07, 0.16, shade(topC, 0.9), 0, 0.29, 0.02) // 高领
    bx(torso, shoulder + 0.006, 0.02, torsoD + 0.006, shade(topC, 0.78), 0, -0.24, 0) // 罗纹（上）
    bx(torso, shoulder + 0.006, 0.02, torsoD + 0.006, shade(topC, 0.78), 0, -0.275, 0) // 罗纹（下）
  } else if (cfg.topStyle === 7) { // v54b 风衣：翻领 + 腰带 + 双排扣 + 过臀长下摆
    const l1 = bx(torso, 0.06, 0.18, 0.014, shade(topC, 0.82), -0.07, 0.17, torsoD / 2 + 0.006); l1.rotation.z = -0.35 // 翻领（左）
    const l2 = bx(torso, 0.06, 0.18, 0.014, shade(topC, 0.82), 0.07, 0.17, torsoD / 2 + 0.006); l2.rotation.z = 0.35 // 翻领（右）
    bx(torso, shoulder + 0.01, 0.045, torsoD + 0.012, shade(topC, 0.72), 0, -0.06, 0) // 腰带
    bx(torso, 0.025, 0.025, 0.012, shade(topC, 0.5), -0.05, 0.02, torsoD / 2 + 0.008) // 双排扣（左）
    bx(torso, 0.025, 0.025, 0.012, shade(topC, 0.5), 0.05, 0.02, torsoD / 2 + 0.008) // 双排扣（右）
    bx(torso, shoulder + 0.03, 0.18, torsoD + 0.03, shade(topC, 0.92), 0, -0.36, 0) // 过臀下摆
  }
  if (ev.suit) bx(g, 0.03, 0.5, 0.012, '#243a24', 0, 1.04, fz + 0.006) // 绝缘服拉链
  if (ev.cavingsuit) { // 保温服反光条（胸 + 腰）
    bx(g, shoulder + 0.012, 0.045, torsoD + 0.015, '#c9c9b8', 0, 1.18, 0)
    bx(g, shoulder + 0.012, 0.045, torsoD + 0.015, '#c9c9b8', 0, 0.9, 0)
  }
  // v54：上衣通用细化——直接挂在 torso 网格下（局部系：中心 y±0.29、前表面 z=torsoD/2），随挺胸动画不脱节
  { // 衣褶（正面两条斜置浅痕 + 背部一条横痕）
    const w1 = bx(torso, 0.15, 0.014, 0.008, shade(topC, 0.86), -0.06, 0.08, torsoD / 2 + 0.003); w1.rotation.z = 0.1
    const w2 = bx(torso, 0.13, 0.014, 0.008, shade(topC, 0.86), 0.07, -0.03, torsoD / 2 + 0.003); w2.rotation.z = -0.08
    bx(torso, 0.18, 0.014, 0.008, shade(topC, 0.9), 0.02, 0.14, -torsoD / 2 - 0.003)
  }
  if (cfg.topStyle === 0) { // T 恤圆领（其余款式自带领口/帽兜/拉链）
    bx(torso, 0.15, 0.03, 0.012, shade(topC, 0.72), 0, 0.258, torsoD / 2 + 0.004)
    const c1 = bx(torso, 0.055, 0.024, 0.012, shade(topC, 0.72), -0.088, 0.272, torsoD / 2 + 0.002); c1.rotation.z = 0.5
    const c2 = bx(torso, 0.055, 0.024, 0.012, shade(topC, 0.72), 0.088, 0.272, torsoD / 2 + 0.002); c2.rotation.z = -0.5
  }
  if (cfg.topStyle !== 3 && cfg.topStyle !== 6 && cfg.topStyle !== 7) bx(torso, shoulder + 0.006, 0.045, torsoD + 0.006, shade(topC, 0.82), 0, -0.266, 0) // 下摆（夹克/毛衣/风衣已有）

  // ---- 手臂（袖款 + 手；关节在肩 y=1.30）----
  const mkArm = (x: number) => {
    const tee = (cfg.topStyle === 0 || cfg.topStyle === 5) && !suited // T 恤/背心：无袖露小臂
    const arm = joint(armW, tee ? 0.26 : 0.44, armW + 0.02, sleeveC, x, 1.3)
    if (tee) bx(arm, armW - 0.015, 0.26, armW, skin, 0, -0.37, 0) // T 恤露小臂
    // v54：手部分件——手掌 + 三根简化手指 + 拇指（掌心仍在原手位 y≈-0.5/-0.55，NPC 手持物挂点不变）
    const handY = tee ? -0.55 : -0.5
    bx(arm, armW - 0.02, 0.07, armW, handC, 0, handY - 0.005, 0) // 手掌
    for (let f = -1; f <= 1; f++) bx(arm, 0.022, 0.05, armW - 0.025, handC, f * 0.028, handY - 0.055, 0.003) // 简化手指
    bx(arm, 0.024, 0.05, 0.03, handC, -Math.sign(x) * (armW / 2 - 0.012), handY - 0.01, 0.015) // 拇指（朝身体内侧）
    return arm
  }
  const armL = mkArm(-armX), armR = mkArm(armX)

  // ---- 头（枢轴在颈 y=1.37；面部件均打 userData.face）----
  const headG = new THREE.Group()
  headG.position.set(0, 1.37, 0)
  g.add(headG)
  bx(headG, 0.26, 0.26, 0.24, skin, 0, 0.13, 0)
  // v54：头部过渡件——脖颈（补头-躯干缝隙）/ 下颌（略窄的颏部台阶；均非五官，无面灵保留）
  bx(headG, 0.13, 0.08, 0.13, shade(skin, 0.95), 0, -0.02, 0) // 脖颈
  bx(headG, 0.22, 0.06, 0.2, skin, 0, 0.03, 0.01) // 下颌
  // 耳（五官，打 face 标记，无面灵/BRC 黑影摘除后头部回归光滑平面）
  faceMark(bx(headG, 0.03, 0.06, 0.05, shade(skin, 0.95), -0.135, 0.13, 0)) // 耳（左）
  faceMark(bx(headG, 0.03, 0.06, 0.05, shade(skin, 0.95), 0.135, 0.13, 0)) // 耳（右）
  // 眼睛
  const eyeH = cfg.face === 3 ? 0.02 : 0.04
  faceMark(bx(headG, 0.035, eyeH, 0.012, '#1c1a18', -0.06, 0.15, 0.121))
  faceMark(bx(headG, 0.035, eyeH, 0.012, '#1c1a18', 0.06, 0.15, 0.121))
  // 眉（随表情变角度/高度）
  const browC = shade(cfg.hairColor, 0.7)
  const bL = faceMark(bx(headG, 0.05, 0.012, 0.01, browC, -0.06, 0.19, 0.121))
  const bR = faceMark(bx(headG, 0.05, 0.012, 0.01, browC, 0.06, 0.19, 0.121))
  if (cfg.face === 1) { bL.rotation.z = 0.18; bR.rotation.z = -0.18 } // 微笑：眉梢上扬
  else if (cfg.face === 2) { bL.rotation.z = -0.3; bR.rotation.z = 0.3; bL.position.y = bR.position.y = 0.183 } // 严肃：内压
  else if (cfg.face === 3) { bL.position.y = bR.position.y = 0.178 } // 困倦：低垂
  // 嘴
  if (cfg.face === 1) { // 微笑：弯月三点
    faceMark(bx(headG, 0.06, 0.014, 0.01, '#7a4a3a', 0, 0.07, 0.121))
    faceMark(bx(headG, 0.014, 0.016, 0.01, '#7a4a3a', -0.036, 0.078, 0.121))
    faceMark(bx(headG, 0.014, 0.016, 0.01, '#7a4a3a', 0.036, 0.078, 0.121))
  } else if (cfg.face === 2) faceMark(bx(headG, 0.06, 0.01, 0.01, '#4a3028', 0, 0.068, 0.121)) // 严肃
  else if (cfg.face === 3) faceMark(bx(headG, 0.04, 0.026, 0.01, '#5a3a30', 0, 0.062, 0.121)) // 困倦（微张）
  else faceMark(bx(headG, 0.05, 0.012, 0.01, '#6a4a3c', 0, 0.07, 0.121)) // 平静
  // v54b：眼镜（面部件，打 face 标记——无面灵摘除时一起去掉；圆框/方框/墨镜）
  if (cfg.glasses === 1) { // 圆框：小圆角双框 + 鼻梁
    faceMark(bx(headG, 0.058, 0.058, 0.012, '#3a3d42', -0.062, 0.15, 0.126))
    faceMark(bx(headG, 0.058, 0.058, 0.012, '#3a3d42', 0.062, 0.15, 0.126))
    faceMark(bx(headG, 0.026, 0.01, 0.012, '#3a3d42', 0, 0.152, 0.126))
  } else if (cfg.glasses === 2) { // 方框：宽扁双框 + 鼻梁 + 上梁
    faceMark(bx(headG, 0.068, 0.05, 0.012, '#2a2d30', -0.064, 0.15, 0.126))
    faceMark(bx(headG, 0.068, 0.05, 0.012, '#2a2d30', 0.064, 0.15, 0.126))
    faceMark(bx(headG, 0.024, 0.01, 0.012, '#2a2d30', 0, 0.148, 0.126))
    faceMark(bx(headG, 0.18, 0.012, 0.01, '#2a2d30', 0, 0.178, 0.124))
  } else if (cfg.glasses === 3) { // 墨镜：深色实心双片 + 鼻梁 + 上梁
    faceMark(bx(headG, 0.078, 0.052, 0.014, '#101014', -0.064, 0.15, 0.127))
    faceMark(bx(headG, 0.078, 0.052, 0.014, '#101014', 0.064, 0.15, 0.127))
    faceMark(bx(headG, 0.026, 0.012, 0.012, '#101014', 0, 0.15, 0.127))
    faceMark(bx(headG, 0.19, 0.014, 0.01, '#101014', 0, 0.182, 0.124))
  }
  // v54b：胡须（下颌部面部件，同打 face 标记；发色压暗）
  const beardC = shade(cfg.hairColor, 0.85)
  if (cfg.beard === 1) { // 山羊胡：颏须 + 唇上须
    faceMark(bx(headG, 0.05, 0.045, 0.016, beardC, 0, 0.032, 0.118))
    faceMark(bx(headG, 0.062, 0.014, 0.012, beardC, 0, 0.092, 0.122))
  } else if (cfg.beard === 2) { // 络腮胡：下颌前板 + 两腮 + 唇上须
    faceMark(bx(headG, 0.19, 0.07, 0.018, beardC, 0, 0.04, 0.116))
    faceMark(bx(headG, 0.028, 0.09, 0.1, beardC, -0.118, 0.07, 0.04))
    faceMark(bx(headG, 0.028, 0.09, 0.1, beardC, 0.118, 0.07, 0.04))
    faceMark(bx(headG, 0.062, 0.014, 0.012, beardC, 0, 0.092, 0.122))
  }
  // 发型（16 款；v41 细化：分层结构 + 高光/暗部发色 + 发际线碎发 + 鬓角 + 发尾变化；v54b 新增 8 款同惯例；
  // v54c 返修：全部发件经 hb 打 userData.hair=1，逐件保证与头盒/相邻发件相接、不穿面部（y≤0.20 前脸带）/耳（x±0.135）/躯干（顶 y=1.35、背 z=-0.12））
  const hc = cfg.hairColor
  const hcL = shade(hc, 1.22) // 高光
  const hcD = shade(hc, 0.78) // 暗部
  // 发件专用盒：挂 headG 并打 userData.hair=1（mesh-smoke 发型防回归断言据此收集）
  const hb = (w: number, h: number, d: number, color: string, x: number, y: number, z = 0) => {
    const m = bx(headG, w, h, d, color, x, y, z)
    m.userData.hair = 1
    m.userData.dim = [w, h, d] // mesh-smoke 发型断言据此算 AABB（离线 three 桩无 Box3）
    return m
  }
  // 额前发际线碎发（参差三段，多数款共用；底缘 y≥0.22 不压眉）
  const hairline = () => {
    hb(0.08, 0.03, 0.03, hc, -0.08, 0.245, 0.115)
    hb(0.09, 0.04, 0.03, hc, 0.01, 0.24, 0.115)
    hb(0.07, 0.025, 0.03, hc, 0.09, 0.25, 0.115)
  }
  // 鬓角（耳前小条，暗色；z 0.035 起避开耳盒）
  const sideburns = (len = 0.1) => {
    hb(0.03, len, 0.05, hcD, -0.128, 0.14, 0.06)
    hb(0.03, len, 0.05, hcD, 0.128, 0.14, 0.06)
  }
  if (cfg.hair === 0) { // 光头：头皮青茬薄层 + 后枕青茬（贴头皮不隆起）
    hb(0.24, 0.015, 0.22, shade(hc, 1.45), 0, 0.263, -0.01)
    hb(0.2, 0.05, 0.02, shade(hc, 1.45), 0, 0.2, -0.115) // 后枕青茬
  } else if (cfg.hair === 1) { // 短发：分层顶盖 + 高光顶流 + 枕部收束 + 鬓角 + 刘海分片/头顶分缝
    hb(0.28, 0.09, 0.26, hc, 0, 0.295, 0) // 顶层
    hb(0.24, 0.05, 0.22, hcL, 0, 0.345, -0.01) // 高光顶流
    hb(0.28, 0.16, 0.06, hc, 0, 0.19, -0.12) // 后枕
    hb(0.24, 0.08, 0.04, hcD, 0, 0.13, -0.125) // 枕部收束（暗）
    hb(0.07, 0.035, 0.02, hc, -0.05, 0.228, 0.126) // 刘海分片（左）
    hb(0.06, 0.03, 0.02, hcD, 0.05, 0.232, 0.126) // 刘海分片（右，暗）
    hb(0.015, 0.012, 0.18, hcD, 0.03, 0.368, -0.01) // 头顶分缝（v54c：下移与高光顶流咬合）
    hairline(); sideburns()
  } else if (cfg.hair === 2) { // 寸头：薄顶 + 青皮高光 + 额缘发际线 + 颞侧过渡 + 发旋/后颈发际
    hb(0.27, 0.04, 0.25, hc, 0, 0.272, 0) // 薄顶（v54c：下沉嵌入头皮）
    hb(0.2, 0.025, 0.18, hcL, 0, 0.296, -0.02) // 青皮高光
    hb(0.27, 0.05, 0.03, hcD, 0, 0.245, 0.115) // 额缘发际线
    hb(0.03, 0.06, 0.2, hcD, -0.132, 0.22, -0.02) // 颞侧过渡（左）
    hb(0.03, 0.06, 0.2, hcD, 0.132, 0.22, -0.02) // 颞侧过渡（右）
    hb(0.045, 0.012, 0.045, hcD, 0.04, 0.29, -0.06) // 头顶发旋
    hb(0.2, 0.03, 0.02, hcD, 0, 0.045, -0.115) // 后颈发际线
  } else if (cfg.hair === 3) { // 背头：后仰顶层 + 高光 + 两侧后梳分层（v54c：侧梳后移避耳）+ 鬓角 + 后枕加厚
    const top = hb(0.29, 0.11, 0.27, hc, 0, 0.305, -0.02); top.rotation.x = -0.08
    hb(0.25, 0.05, 0.22, hcL, 0, 0.35, -0.05) // 顶部高光
    hb(0.29, 0.22, 0.07, hc, 0, 0.18, -0.13) // 后枕
    hb(0.25, 0.1, 0.05, hcD, 0, 0.12, -0.135) // 枕底暗部
    hb(0.05, 0.12, 0.11, hc, -0.14, 0.22, -0.085) // 侧梳（左，z 收至耳后）
    hb(0.05, 0.12, 0.11, hc, 0.14, 0.22, -0.085) // 侧梳（右）
    hb(0.04, 0.1, 0.1, hcL, -0.138, 0.23, -0.08) // 侧梳高光（左）
    hb(0.04, 0.1, 0.1, hcL, 0.138, 0.23, -0.08) // 侧梳高光（右）
    const fl1 = hb(0.018, 0.012, 0.2, hcL, -0.05, 0.36, -0.03); fl1.rotation.x = -0.08 // 顶部发流线（左）
    const fl2 = hb(0.018, 0.012, 0.18, hcD, 0.05, 0.358, -0.02); fl2.rotation.x = -0.08 // 顶部发流线（右，暗）
    hb(0.03, 0.05, 0.02, hc, -0.11, 0.235, 0.122) // 额侧碎发（v54c：抬高避开眉带）
    sideburns(0.12)
  } else if (cfg.hair === 4) { // 中长发：及肩后发分层 + 侧绺 + 前侧分绺 + 发尾内扣（v54c：后发收短避躯干、侧绺后移避耳）
    hb(0.28, 0.09, 0.26, hc, 0, 0.295, 0)
    hb(0.24, 0.05, 0.22, hcL, 0, 0.345, -0.01)
    hb(0.28, 0.3, 0.06, hc, 0, 0.13, -0.13) // 后发主体（底缘抵肩 y=1.35 止）
    hb(0.24, 0.18, 0.05, hcD, 0, -0.02, -0.15) // 发尾内扣（暗、略窄；z 外移避开背板）
    hb(0.05, 0.29, 0.06, hc, -0.135, 0.125, -0.07) // 侧绺（左，耳后）
    hb(0.05, 0.29, 0.06, hc, 0.135, 0.125, -0.07) // 侧绺（右）
    hb(0.04, 0.22, 0.03, hcL, -0.11, 0.14, 0.07) // 前侧分绺（左，z 后收避开前脸带）
    hb(0.04, 0.22, 0.03, hcL, 0.11, 0.14, 0.07) // 前侧分绺（右）
    hb(0.24, 0.06, 0.02, hcL, 0, 0.17, -0.158) // 后发表层高光
    const tw = hb(0.2, 0.04, 0.04, hc, 0, -0.115, -0.155); tw.rotation.x = 0.18 // 发尾外翘
    hairline()
  } else if (cfg.hair === 5) { // 双马尾：分段马尾（上粗下细微外撇）+ 发圈 + 碎刘海 + 顶高光（v54c：马尾后移，下段贴背不穿躯干）
    hb(0.28, 0.08, 0.26, hc, 0, 0.29, 0)
    hb(0.24, 0.045, 0.22, hcL, 0, 0.335, -0.01) // 顶高光
    hb(0.014, 0.012, 0.16, hcD, 0, 0.352, 0.03) // 头顶中缝
    hairline()
    for (const s of [-1, 1]) {
      hb(0.09, 0.05, 0.09, shade(hc, 0.5), s * 0.16, 0.27, -0.06) // 发圈（v54c：内移咬出头侧）
      const t1 = hb(0.08, 0.18, 0.08, hc, s * 0.16, 0.16, -0.135); t1.rotation.z = -s * 0.12 // 马尾上段
      hb(0.085, 0.018, 0.085, hcD, s * 0.172, 0.075, -0.14) // 马尾环纹（束痕）
      const t2 = hb(0.06, 0.14, 0.06, hc, s * 0.19, 0.01, -0.155); t2.rotation.z = -s * 0.22 // 马尾下段（细、外撇；z≤-0.125 贴背）
      hb(0.05, 0.05, 0.05, hcD, s * 0.21, -0.07, -0.16) // 发梢
    }
  } else if (cfg.hair === 6) { // 齐刘海：盖额刘海（分缝锯齿，v54c：底缘齐眉上 y≥0.20）+ 鬓角长绺 + 后枕
    hb(0.28, 0.09, 0.26, hc, 0, 0.295, 0)
    hb(0.24, 0.05, 0.22, hcL, 0, 0.345, -0.01)
    hb(0.27, 0.06, 0.03, hc, 0, 0.235, 0.115) // 刘海主体
    hb(0.07, 0.035, 0.032, hc, -0.09, 0.22, 0.115) // 刘海锯齿（左）
    hb(0.1, 0.04, 0.032, hc, 0.01, 0.221, 0.115) // 刘海锯齿（中）
    hb(0.06, 0.03, 0.032, hc, 0.1, 0.225, 0.115) // 刘海锯齿（右）
    hb(0.28, 0.14, 0.06, hc, 0, 0.19, -0.12) // 后枕
    hb(0.012, 0.04, 0.034, hcD, -0.04, 0.22, 0.115) // 刘海分缝（左）
    hb(0.012, 0.04, 0.034, hcD, 0.06, 0.22, 0.115) // 刘海分缝（右）
    hb(0.2, 0.03, 0.062, hcL, 0, 0.245, -0.12) // 后枕高光
    hb(0.04, 0.16, 0.04, hc, -0.13, 0.1, 0.05) // 鬓角长绺（左，z 前移避开耳盒）
    hb(0.04, 0.16, 0.04, hc, 0.13, 0.1, 0.05) // 鬓角长绺（右）
  } else if (cfg.hair === 7) { // 乱发：顶发 + 七撮不同角度翘发 + 鬓角（均与顶盖/暗部交叠）
    hb(0.28, 0.08, 0.26, hc, 0, 0.29, 0)
    hb(0.22, 0.04, 0.2, hcD, 0, 0.33, -0.02) // 顶层暗部
    const t1 = hb(0.07, 0.1, 0.07, hc, -0.08, 0.33, 0.03); t1.rotation.z = 0.4
    const t2 = hb(0.06, 0.09, 0.06, hc, 0.09, 0.335, -0.02); t2.rotation.z = -0.35
    const t3 = hb(0.06, 0.08, 0.06, hc, 0.01, 0.34, -0.08); t3.rotation.x = -0.4
    const t4 = hb(0.05, 0.08, 0.05, hcL, -0.04, 0.345, -0.04); t4.rotation.set(0.3, 0, 0.25)
    const t5 = hb(0.05, 0.07, 0.05, hc, 0.06, 0.34, 0.05); t5.rotation.set(-0.25, 0, -0.3)
    const t6 = hb(0.04, 0.06, 0.04, hc, -0.11, 0.32, -0.06); t6.rotation.set(0.2, 0, 0.45) // 翘发（左后）
    const t7 = hb(0.035, 0.055, 0.035, hcL, 0.12, 0.325, 0.02); t7.rotation.set(-0.2, 0, -0.4) // 翘发（右前，亮）
    hairline(); sideburns()
  } else if (cfg.hair === 8) { // 丸子头：顶盖 + 发髻底座 + 丸子（带高光）+ 后枕 + 发际线
    hb(0.28, 0.08, 0.26, hc, 0, 0.29, 0)
    hb(0.24, 0.045, 0.22, hcL, 0, 0.335, -0.01) // 顶高光
    hb(0.1, 0.05, 0.1, hcD, 0, 0.35, -0.03) // 发髻底座
    hb(0.13, 0.11, 0.13, hc, 0, 0.415, -0.03) // 丸子
    hb(0.07, 0.04, 0.07, hcL, -0.02, 0.455, -0.02) // 丸子高光
    hb(0.28, 0.12, 0.06, hc, 0, 0.2, -0.12) // 后枕
    hairline()
  } else if (cfg.hair === 9) { // 斜刘海：顶盖 + 斜扫刘海（主/副片同角，v54c：抬高旋转件底缘出眉带）+ 长侧绺 + 后枕
    hb(0.28, 0.09, 0.26, hc, 0, 0.295, 0)
    hb(0.24, 0.05, 0.22, hcL, 0, 0.345, -0.01)
    const sb1 = hb(0.18, 0.055, 0.03, hc, -0.03, 0.255, 0.115); sb1.rotation.z = 0.18 // 斜刘海主体
    const sb2 = hb(0.1, 0.045, 0.028, hcD, 0.09, 0.26, 0.116); sb2.rotation.z = 0.18 // 副片（暗）
    hb(0.05, 0.12, 0.03, hc, 0.125, 0.14, 0.075) // 长侧绺（z 后收避开前脸带与耳）
    hb(0.28, 0.14, 0.06, hc, 0, 0.19, -0.12) // 后枕
    sideburns()
  } else if (cfg.hair === 10) { // 脏辫：顶盖 + 两侧/脑后垂辫（v54c：侧辫让出耳位 z 带、脑后辫收短不穿肩）
    hb(0.27, 0.07, 0.25, hc, 0, 0.285, 0)
    hb(0.22, 0.035, 0.2, hcL, 0, 0.325, -0.01) // 顶高光
    for (const s of [-1, 1]) for (let i = 0; i < 3; i++)
      hb(0.032, 0.24 - i * 0.03, 0.032, i === 1 ? hcD : hc, s * 0.125, 0.1, [0.06, -0.057, -0.1][i]) // 侧辫
    for (let i = 0; i < 4; i++)
      hb(0.032, i % 2 ? 0.2 : 0.24, 0.032, i % 2 ? hcD : hc, -0.09 + i * 0.06, i % 2 ? 0.12 : 0.1, -0.132) // 脑后辫
    hairline()
  } else if (cfg.hair === 11) { // 长直发：及背后发（v54c：上下两段，下段 z≤-0.13 贴背不穿躯干）+ 长侧绺 + 前侧分绺
    hb(0.28, 0.09, 0.26, hc, 0, 0.295, 0)
    hb(0.24, 0.05, 0.22, hcL, 0, 0.345, -0.01)
    hb(0.28, 0.28, 0.06, hc, 0, 0.13, -0.145) // 后发上段（底缘抵肩止）
    hb(0.26, 0.24, 0.05, hc, 0, -0.1, -0.155) // 后发下段（及背，z 外移贴背板外）
    hb(0.24, 0.3, 0.02, hcL, 0, 0.05, -0.178) // 表层高光
    hb(0.22, 0.16, 0.04, hcD, 0, -0.16, -0.15) // 下层暗部
    hb(0.05, 0.28, 0.06, hc, -0.135, 0.12, -0.065) // 长侧绺（左，耳后、底缘抵肩）
    hb(0.05, 0.28, 0.06, hc, 0.135, 0.12, -0.065) // 长侧绺（右）
    hb(0.04, 0.24, 0.03, hcL, -0.11, 0.12, 0.07) // 前侧分绺（左，z 后收避前脸带）
    hb(0.04, 0.24, 0.03, hcL, 0.11, 0.12, 0.07) // 前侧分绺（右）
    hairline()
  } else if (cfg.hair === 12) { // 短卷发：顶盖 + 卷团簇（大小/明暗不一，均与顶盖交叠）+ 后枕卷
    hb(0.28, 0.08, 0.26, hc, 0, 0.29, 0)
    hb(0.09, 0.07, 0.09, hcL, -0.09, 0.33, 0.04) // 卷团
    hb(0.1, 0.08, 0.1, hc, 0.02, 0.335, -0.02)
    hb(0.08, 0.07, 0.08, hcD, 0.1, 0.325, 0.05)
    hb(0.09, 0.07, 0.09, hc, -0.02, 0.33, -0.09)
    hb(0.07, 0.06, 0.07, hcL, 0.11, 0.3, -0.06)
    hb(0.26, 0.1, 0.07, hcD, 0, 0.16, -0.12) // 后枕卷
    sideburns(0.06)
  } else if (cfg.hair === 13) { // 莫西干：中央发脊（v54c：分段下沉咬合头皮、段间 z 交叠成链）+ 两侧青皮
    hb(0.05, 0.09, 0.06, hc, 0, 0.3, 0.075) // 发脊段（前）
    hb(0.05, 0.12, 0.06, hc, 0, 0.315, 0.02) // 发脊段（中高）
    hb(0.05, 0.12, 0.06, hc, 0, 0.315, -0.035) // 发脊段（中高）
    hb(0.05, 0.08, 0.06, hc, 0, 0.295, -0.09) // 发脊段（后）
    hb(0.04, 0.03, 0.2, hcL, 0, 0.388, -0.025) // 脊顶高光
    hb(0.02, 0.08, 0.2, shade(hc, 1.45), -0.125, 0.24, -0.01) // 青皮（左）
    hb(0.02, 0.08, 0.2, shade(hc, 1.45), 0.125, 0.24, -0.01) // 青皮（右）
    hb(0.24, 0.03, 0.02, shade(hc, 1.45), 0, 0.245, 0.115) // 额缘青茬
  } else if (cfg.hair === 14) { // 双丸子：顶盖 + 两侧发髻（底座+丸子+高光，逐级交叠）
    hb(0.28, 0.08, 0.26, hc, 0, 0.29, 0)
    hb(0.24, 0.045, 0.22, hcL, 0, 0.335, -0.01) // 顶高光
    hb(0.014, 0.012, 0.16, hcD, 0, 0.352, 0.03) // 头顶中缝
    for (const s of [-1, 1]) {
      hb(0.07, 0.05, 0.07, hcD, s * 0.12, 0.34, -0.02) // 发髻底座
      hb(0.11, 0.1, 0.11, hc, s * 0.14, 0.41, -0.02) // 丸子
      hb(0.06, 0.04, 0.06, hcL, s * 0.15, 0.445, -0.01) // 丸子高光
    }
    hairline()
  } else if (cfg.hair === 15) { // 高马尾：顶盖 + 高发圈 + 分段马尾（垂至肩背，z≤-0.12 不穿躯干）+ 发梢
    hb(0.28, 0.08, 0.26, hc, 0, 0.29, 0)
    hb(0.24, 0.045, 0.22, hcL, 0, 0.335, -0.01) // 顶高光
    hb(0.1, 0.06, 0.1, shade(hc, 0.5), 0, 0.33, -0.1) // 高发圈
    const p1 = hb(0.09, 0.22, 0.09, hc, 0, 0.2, -0.135); p1.rotation.x = 0.15 // 马尾上段
    hb(0.095, 0.018, 0.095, hcD, 0, 0.1, -0.15) // 环纹（束痕）
    const p2 = hb(0.07, 0.2, 0.07, hc, 0, 0.0, -0.165); p2.rotation.x = 0.1 // 马尾下段
    hb(0.05, 0.06, 0.05, hcD, 0, -0.12, -0.175) // 发梢
    hairline()
  }
  // 潜水面罩（头饰栏）：镜框 + 视窗 + 环绕头带
  if (ev.divemask) {
    bx(headG, 0.24, 0.11, 0.03, '#2a2d30', 0, 0.15, 0.13)
    bx(headG, 0.19, 0.07, 0.012, '#7ac9d9', 0, 0.15, 0.148)
    bx(headG, 0.02, 0.05, 0.26, '#2a2d30', -0.135, 0.16, 0)
    bx(headG, 0.02, 0.05, 0.26, '#2a2d30', 0.135, 0.16, 0)
    bx(headG, 0.27, 0.05, 0.02, '#2a2d30', 0, 0.16, -0.125)
  }
  // 头灯（头饰栏）：头带 + 额前灯体 + 灯珠
  if (ev.headlamp) {
    bx(headG, 0.27, 0.035, 0.25, '#3a3a3e', 0, 0.2, 0)
    bx(headG, 0.08, 0.06, 0.04, '#2a2d30', 0, 0.2, 0.14)
    bx(headG, 0.05, 0.04, 0.012, '#fff2c0', 0, 0.2, 0.165)
  }

  g.userData.parts = { torso, head: headG, armL, armR, legL, legR }
  return g
}
