// 玩家完整低模（预览/捏人用；第一人称仍只显示手部，见 viewmodel.ts）
// 身高固定 ~1.75m（与碰撞体积一致，不可编辑），正面 +Z。
// v34：性别体型 / 发型×8（v41 细化：分层+高光暗部+发际线+鬓角）/ 上衣×4 / 裤子×3 / 表情×4 / 装备细化（绝缘服/保温服/手套/潜水面罩/头灯）。
// 四肢为关节 mesh（几何原点在肩/髋，rotation.x 摆动），grp.userData.parts 供骨骼式动画——
// 无面灵等「类人」实体直接复用本模型（摘除 userData.face 面部件即可）。
import * as THREE from 'three'
import type { AvatarCfg } from '../avatar'

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
  // 性别体型参数
  const shoulder = fem ? 0.38 : 0.46, torsoD = fem ? 0.21 : 0.24
  const armX = fem ? 0.245 : 0.29, armW = fem ? 0.095 : 0.11
  const legX = fem ? 0.125 : 0.11, legW = fem ? 0.14 : 0.15
  const legD = legW + 0.02

  // ---- 腿（裤款 + 鞋；关节在髋 y=0.78）----
  const mkLeg = (x: number) => {
    const short = cfg.pantsStyle === 1
    const leg = joint(legW, short ? 0.36 : 0.72, legD, limbC, x, 0.78)
    if (short) bx(leg, legW - 0.02, 0.36, legD - 0.02, skin, 0, -0.54, 0) // 短裤露小腿
    if (cfg.pantsStyle === 2) { // 工装侧袋
      bx(leg, 0.035, 0.15, 0.11, shade(limbC, 0.75), legW / 2 + 0.017 * Math.sign(x), -0.2, 0.02)
    }
    bx(leg, legW + 0.01, 0.08, legD + 0.05, shoeC, 0, -0.68, 0.02) // 鞋
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
  }
  if (ev.suit) bx(g, 0.03, 0.5, 0.012, '#243a24', 0, 1.04, fz + 0.006) // 绝缘服拉链
  if (ev.cavingsuit) { // 保温服反光条（胸 + 腰）
    bx(g, shoulder + 0.012, 0.045, torsoD + 0.015, '#c9c9b8', 0, 1.18, 0)
    bx(g, shoulder + 0.012, 0.045, torsoD + 0.015, '#c9c9b8', 0, 0.9, 0)
  }

  // ---- 手臂（袖款 + 手；关节在肩 y=1.30）----
  const mkArm = (x: number) => {
    const tee = cfg.topStyle === 0 && !suited
    const arm = joint(armW, tee ? 0.26 : 0.44, armW + 0.02, sleeveC, x, 1.3)
    if (tee) bx(arm, armW - 0.015, 0.26, armW, skin, 0, -0.37, 0) // T 恤露小臂
    bx(arm, armW - 0.02, 0.1, armW, handC, 0, tee ? -0.55 : -0.5, 0) // 手
    return arm
  }
  const armL = mkArm(-armX), armR = mkArm(armX)

  // ---- 头（枢轴在颈 y=1.37；面部件均打 userData.face）----
  const headG = new THREE.Group()
  headG.position.set(0, 1.37, 0)
  g.add(headG)
  bx(headG, 0.26, 0.26, 0.24, skin, 0, 0.13, 0)
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
  // 发型（8 款；v41 细化：分层结构 + 高光/暗部发色 + 发际线碎发 + 鬓角 + 发尾变化）
  const hc = cfg.hairColor
  const hcL = shade(hc, 1.22) // 高光
  const hcD = shade(hc, 0.78) // 暗部
  // 额前发际线碎发（参差三段，多数款共用）
  const hairline = () => {
    bx(headG, 0.08, 0.03, 0.03, hc, -0.08, 0.245, 0.115)
    bx(headG, 0.09, 0.04, 0.03, hc, 0.01, 0.24, 0.115)
    bx(headG, 0.07, 0.025, 0.03, hc, 0.09, 0.25, 0.115)
  }
  // 鬓角（耳前小条，暗色）
  const sideburns = (len = 0.1) => {
    bx(headG, 0.03, len, 0.05, hcD, -0.128, 0.14, 0.06)
    bx(headG, 0.03, len, 0.05, hcD, 0.128, 0.14, 0.06)
  }
  if (cfg.hair === 1) { // 短发：分层顶盖 + 高光顶流 + 枕部收束 + 鬓角
    bx(headG, 0.28, 0.09, 0.26, hc, 0, 0.295, 0) // 顶层
    bx(headG, 0.24, 0.05, 0.22, hcL, 0, 0.345, -0.01) // 高光顶流
    bx(headG, 0.28, 0.16, 0.06, hc, 0, 0.19, -0.12) // 后枕
    bx(headG, 0.24, 0.08, 0.04, hcD, 0, 0.13, -0.125) // 枕部收束（暗）
    hairline(); sideburns()
  } else if (cfg.hair === 2) { // 寸头：薄顶 + 青皮高光 + 额缘发际线 + 颞侧过渡
    bx(headG, 0.27, 0.04, 0.25, hc, 0, 0.275, 0)
    bx(headG, 0.2, 0.025, 0.18, hcL, 0, 0.298, -0.02) // 青皮高光
    bx(headG, 0.27, 0.05, 0.03, hcD, 0, 0.245, 0.115) // 额缘发际线
    bx(headG, 0.03, 0.06, 0.2, hcD, -0.132, 0.22, -0.02) // 颞侧过渡（左）
    bx(headG, 0.03, 0.06, 0.2, hcD, 0.132, 0.22, -0.02) // 颞侧过渡（右）
  } else if (cfg.hair === 3) { // 背头：后仰顶层 + 高光 + 两侧后梳分层 + 鬓角 + 后枕加厚
    const top = bx(headG, 0.29, 0.11, 0.27, hc, 0, 0.305, -0.02); top.rotation.x = -0.08
    bx(headG, 0.25, 0.05, 0.22, hcL, 0, 0.35, -0.05) // 顶部高光
    bx(headG, 0.29, 0.22, 0.07, hc, 0, 0.18, -0.13) // 后枕
    bx(headG, 0.25, 0.1, 0.05, hcD, 0, 0.12, -0.135) // 枕底暗部
    bx(headG, 0.05, 0.14, 0.2, hc, -0.14, 0.21, -0.04) // 侧梳（左）
    bx(headG, 0.05, 0.14, 0.2, hc, 0.14, 0.21, -0.04) // 侧梳（右）
    bx(headG, 0.04, 0.1, 0.16, hcL, -0.135, 0.24, -0.03) // 侧梳高光（左）
    bx(headG, 0.04, 0.1, 0.16, hcL, 0.135, 0.24, -0.03) // 侧梳高光（右）
    sideburns(0.12)
  } else if (cfg.hair === 4) { // 中长发：及肩后发分层 + 侧绺 + 前侧分绺 + 发尾内扣
    bx(headG, 0.28, 0.09, 0.26, hc, 0, 0.295, 0)
    bx(headG, 0.24, 0.05, 0.22, hcL, 0, 0.345, -0.01)
    bx(headG, 0.28, 0.34, 0.07, hc, 0, 0.1, -0.125) // 后发主体
    bx(headG, 0.24, 0.18, 0.05, hcD, 0, -0.02, -0.13) // 发尾内扣（暗、略窄）
    bx(headG, 0.05, 0.3, 0.12, hc, -0.135, 0.12, -0.03) // 侧绺（左）
    bx(headG, 0.05, 0.3, 0.12, hc, 0.135, 0.12, -0.03) // 侧绺（右）
    bx(headG, 0.04, 0.22, 0.04, hcL, -0.11, 0.14, 0.09) // 前侧分绺（左）
    bx(headG, 0.04, 0.22, 0.04, hcL, 0.11, 0.14, 0.09) // 前侧分绺（右）
    hairline()
  } else if (cfg.hair === 5) { // 双马尾：分段马尾（上粗下细微外撇）+ 发圈 + 碎刘海 + 顶高光
    bx(headG, 0.28, 0.08, 0.26, hc, 0, 0.29, 0)
    bx(headG, 0.24, 0.045, 0.22, hcL, 0, 0.335, -0.01) // 顶高光
    hairline()
    for (const s of [-1, 1]) {
      bx(headG, 0.09, 0.05, 0.09, shade(hc, 0.5), s * 0.17, 0.27, -0.06) // 发圈
      const t1 = bx(headG, 0.08, 0.18, 0.08, hc, s * 0.17, 0.16, -0.06); t1.rotation.z = -s * 0.12 // 马尾上段
      const t2 = bx(headG, 0.06, 0.14, 0.06, hc, s * 0.19, 0.01, -0.06); t2.rotation.z = -s * 0.22 // 马尾下段（细、外撇）
      bx(headG, 0.05, 0.05, 0.05, hcD, s * 0.21, -0.07, -0.06) // 发梢
    }
  } else if (cfg.hair === 6) { // 齐刘海：盖额刘海（分缝锯齿）+ 鬓角长绺 + 后枕
    bx(headG, 0.28, 0.09, 0.26, hc, 0, 0.295, 0)
    bx(headG, 0.24, 0.05, 0.22, hcL, 0, 0.345, -0.01)
    bx(headG, 0.27, 0.07, 0.03, hc, 0, 0.22, 0.115) // 刘海主体
    bx(headG, 0.07, 0.03, 0.032, hc, -0.09, 0.185, 0.115) // 刘海锯齿（左）
    bx(headG, 0.1, 0.035, 0.032, hc, 0.01, 0.18, 0.115) // 刘海锯齿（中）
    bx(headG, 0.06, 0.025, 0.032, hc, 0.1, 0.19, 0.115) // 刘海锯齿（右）
    bx(headG, 0.28, 0.14, 0.06, hc, 0, 0.19, -0.12) // 后枕
    bx(headG, 0.04, 0.16, 0.05, hc, -0.13, 0.1, 0.04) // 鬓角长绺（左）
    bx(headG, 0.04, 0.16, 0.05, hc, 0.13, 0.1, 0.04) // 鬓角长绺（右）
  } else if (cfg.hair === 7) { // 乱发：顶发 + 五撮不同角度翘发 + 鬓角
    bx(headG, 0.28, 0.08, 0.26, hc, 0, 0.29, 0)
    bx(headG, 0.22, 0.04, 0.2, hcD, 0, 0.33, -0.02) // 顶层暗部
    const t1 = bx(headG, 0.07, 0.1, 0.07, hc, -0.08, 0.33, 0.03); t1.rotation.z = 0.4
    const t2 = bx(headG, 0.06, 0.09, 0.06, hc, 0.09, 0.335, -0.02); t2.rotation.z = -0.35
    const t3 = bx(headG, 0.06, 0.08, 0.06, hc, 0.01, 0.34, -0.08); t3.rotation.x = -0.4
    const t4 = bx(headG, 0.05, 0.08, 0.05, hcL, -0.04, 0.345, -0.04); t4.rotation.set(0.3, 0, 0.25)
    const t5 = bx(headG, 0.05, 0.07, 0.05, hc, 0.06, 0.34, 0.05); t5.rotation.set(-0.25, 0, -0.3)
    hairline(); sideburns()
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
