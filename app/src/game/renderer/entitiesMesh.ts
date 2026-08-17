// 实体低模（骨骼式分组：四肢/头独立 pivot，可程序化动画）
// v14：全实体模型审计+精细化——每种实体专属分支、统一正面=+X、
// 面部特征 mesh 打 userData.face 标记（验收脚本据此校验朝向质心）。
// v23：按 Backrooms Wikidot / Fandom 正文重做 hound / duller / clump / faceling /
// skinstealer / smiler / deathmoth，并补齐 Level 6–11 / Level 601 的 14 种新实体。
//
// ★ 建模准则（新增/修改实体时必须遵守）★
// 实体模型必须尽可能精致，把该实体的全部设定特征都表现出来——形态/配色/标志性
// 器官/伤口/姿态，一个都不能少，拒绝「几个方块拼个人形」式的敷衍。典例（达标线）：
//   悲尸 wretch / 观察者 watcher / 派对客 partygoer / 猎犬 hound / 死亡飞蛾 deathmoth / 肢团 clump
// 新实体请先读这些 case 再动手；设定依据在 entities/ 各定义的 codex 注释里。
import * as THREE from 'three'
import { ENTITIES } from '../entities'
import { box, cyl, glow, mulberry } from './shared'
import { buildPlayerModel } from './playerModel'
import { randomAvatar } from '../core/avatar'

// ---------- 实体低模（骨骼式分组：四肢/头独立 pivot，可程序化动画）----------
// 朝向约定：模型正面 = +X（updateEntities 用 rotation.y = -e.facing 对齐移动/玩家方向）。
// 人形/正脸类模型按 +Z 建造（面部特征在 +Z），构建末期包一层 rotation.y=π/2 的内层组，
// 把正面旋到 +X，并以 userData.facesZ 标记（供追击前倾轴选择）。
// 面部特征（眼/牙/灯/面罩）统一打 userData.face=1，供朝向验收。
type PartMap = Record<string, THREE.Object3D>

// v53：实体建模变体（L3 高智能实体：无面灵错位面部器官/石器工具、尸鼠水豚形态；seed=实体 id，保证重建一致）
// ratMorph：尸鼠按层级固定形态——L2 灰白廊道种群 / L3 水豚（capybara 优先）/ L5 酒店正装（小西装+领结）/ 其余层级深褐（旧档「死亡鼠」）
export interface EntityMeshOpts { l3face?: boolean; tool?: boolean; capybara?: boolean; ratMorph?: 'gray' | 'brown' | 'hotel'; seed?: number }
export function buildEntityMesh(type: string, opts?: EntityMeshOpts): THREE.Group {
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
    case 'faceling': { // 无面灵（Entity 9）：与人类高度相似——直接复用玩家形象模型（随机肤色/发型/服装），
      //                 唯独完全缺失面部特征：头部只剩一张没有五官的光滑平面。
      const pm = buildPlayerModel(randomAvatar(), {})
      // 摘除全部面部件（眼/眉/嘴）
      const faceParts: THREE.Object3D[] = []
      pm.traverse((o) => { if (o.userData.face === 1) faceParts.push(o) })
      for (const o of faceParts) o.parent?.remove(o)
      const pmParts = pm.userData.parts as Record<string, THREE.Object3D>
      // 注册骨骼部件（步态/待机敲键动画沿用现有驱动）
      for (const k of ['torso', 'head', 'armL', 'armR', 'legL', 'legR']) tag(pmParts[k], k)
      // v53：L3 高智能无面灵——面部长出类似眼/耳/鼻/口的器官，但位置与数量通常不对（按实体 id 确定性）
      if (opts?.l3face && pmParts.head) {
        const r = mulberry(((opts.seed ?? 1) * 7919 + 13) >>> 0)
        const dark = '#3a2e28', flesh = '#6a5040'
        const head = pmParts.head
        const eyeN = 1 + Math.floor(r() * 3) // 1~3 只眼（数量不对）
        for (let i = 0; i < eyeN; i++) {
          const eye = new THREE.Mesh(new THREE.BoxGeometry(0.032, 0.04, 0.014), lam(dark))
          eye.position.set((r() - 0.5) * 0.16, 0.06 + r() * 0.16, 0.121) // 位置随机错位：可能居中/斜排/跑到额头
          head.add(eye)
        }
        const nose = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.05, 0.03), lam(flesh)) // 鼻：长错位置的凸起
        nose.position.set((r() - 0.5) * 0.14, 0.05 + r() * 0.14, 0.135)
        head.add(nose)
        const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.07, 0.012), lam(dark)) // 口：竖过来的嘴缝
        mouth.position.set((r() - 0.5) * 0.12, 0.04 + r() * 0.08, 0.121)
        head.add(mouth)
        if (r() < 0.6) { // 耳：贴在正面的耳朵（本该长在两侧）
          const ear = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.06, 0.014), lam(flesh))
          ear.position.set((r() - 0.5) * 0.16, 0.1 + r() * 0.12, 0.118)
          head.add(ear)
        }
      }
      // v53：L3 部分无面灵使用石器工具（石锤握在右手）
      if (opts?.tool && pmParts.armR) {
        const tool = new THREE.Group()
        tool.add(new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.22, 0.03), lam('#6a4e30'))) // 木柄
        const stone = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.06, 0.05), lam('#7a7a76')) // 石锤头
        stone.position.set(0, 0.13, 0)
        tool.add(stone)
        tool.position.set(0, -0.66, 0.06)
        tool.rotation.x = -0.5
        pmParts.armR.add(tool)
      }
      grp.add(pm)
      break
    }
    case 'ferren': { // Ferren（Entity 92）：无害雪貂吉祥物——奶油色细长身，深棕面罩/四肢/尾尖
      const cream = '#d8cbb0', dark = '#4a3428', pink = '#c98a7a'
      tag(box(0.2, 0.16, 0.56, cream, 0, 0.18, 0), 'torso') // 细长身体
      const hd = box(0.18, 0.16, 0.2, cream, 0, 0.26, 0.36) // 头（正面 +z）
      tag(hd, 'head')
      hd.add(box(0.19, 0.09, 0.1, dark, 0, -0.01, 0.05)) // 面罩
      hd.add(box(0.05, 0.03, 0.04, pink, 0, -0.04, 0.1)) // 粉鼻
      hd.add(box(0.05, 0.05, 0.02, cream, -0.06, 0.1, 0.02)) // 耳（左）
      hd.add(box(0.05, 0.05, 0.02, cream, 0.06, 0.1, 0.02)) // 耳（右）
      face(glow(0.03, 0.03, 0.02, '#1c1a18', -0.045, 0.28, 0.47))
      face(glow(0.03, 0.03, 0.02, '#1c1a18', 0.045, 0.28, 0.47))
      grp.add(box(0.1, 0.09, 0.3, cream, 0, 0.22, -0.4)) // 尾（微翘）
      grp.add(box(0.11, 0.1, 0.14, dark, 0, 0.26, -0.58)) // 尾尖深棕
      joint(0.06, 0.14, 0.06, dark, -0.07, 0.16, 0.18, 'armL')
      joint(0.06, 0.14, 0.06, dark, 0.07, 0.16, 0.18, 'armR')
      joint(0.06, 0.14, 0.06, dark, -0.07, 0.16, -0.18, 'legL')
      joint(0.06, 0.14, 0.06, dark, 0.07, 0.16, -0.18, 'legR')
      break
    }
    case 'jerry': { // 鹉主杰瑞（Entity 7）：蓝色小鹦鹉——立姿：圆身/钩喙/冠羽/收翅/长尾羽，蓝得不像后室的造物
      const blue = '#2a5fd8', dark = '#1a3f9e', lite = '#6a9ae8', beak = '#e8a33c'
      tag(box(0.16, 0.22, 0.18, blue, 0, 0.24, 0), 'torso') // 圆身
      grp.add(box(0.12, 0.14, 0.13, lite, 0, 0.22, 0.05)) // 胸腹亮色
      const hd = box(0.13, 0.12, 0.12, blue, 0, 0.4, 0.03) // 头
      tag(hd, 'head')
      hd.add(box(0.05, 0.04, 0.06, beak, 0, -0.02, 0.08)) // 上钩喙
      hd.add(box(0.035, 0.025, 0.04, '#c97a1a', 0, -0.05, 0.06)) // 下喙
      face(glow(0.028, 0.028, 0.02, '#101828', -0.045, 0.42, 0.1)) // 眼（左）
      face(glow(0.028, 0.028, 0.02, '#101828', 0.045, 0.42, 0.1)) // 眼（右）
      // 冠羽（三根小羽，后脑）
      hd.add(box(0.02, 0.07, 0.02, dark, -0.03, 0.08, -0.04))
      hd.add(box(0.02, 0.09, 0.02, dark, 0, 0.09, -0.05))
      hd.add(box(0.02, 0.07, 0.02, dark, 0.03, 0.08, -0.04))
      // 收起的双翅（体侧深色块，微外张）
      const wl = box(0.04, 0.18, 0.14, dark, -0.09, 0.24, -0.01); wl.rotation.z = 0.12
      const wr = box(0.04, 0.18, 0.14, dark, 0.09, 0.24, -0.01); wr.rotation.z = -0.12
      tag(wl, 'wingL'); tag(wr, 'wingR')
      // 长尾羽（下垂微后翘，蓝黑相间）
      const tl = box(0.09, 0.03, 0.24, blue, 0, 0.12, -0.18); tl.rotation.x = -0.5
      tag(tl, 'tail')
      grp.add(box(0.05, 0.025, 0.18, dark, 0, 0.1, -0.26)) // 尾端深色
      // 爪（抓握横杆的两只小爪）
      grp.add(box(0.03, 0.05, 0.05, '#8a8a8e', -0.04, 0.04, 0.02))
      grp.add(box(0.03, 0.05, 0.05, '#8a8a8e', 0.04, 0.04, 0.02))
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
    case 'arms': { // 手臂（Level 1 特有）：自天花板通风管垂下的苍白长臂，指节反曲；
      //             停电时伸出管口猎捕（平时 hidden 缩回管内，渲染层不可见）。
      const sk = '#c9a684', sk2 = '#b08d6a'
      // 上臂自管口（y≈2.55，对齐 ceilvent 端口）垂下
      const upper = joint(0.14, 0.72, 0.14, sk, 0, 2.55, 0, 'armL')
      // 肘部反曲的前臂
      const fore = new THREE.Group()
      fore.position.y = -0.72; fore.rotation.x = 0.5
      upper.add(fore)
      fore.add(box(0.11, 0.6, 0.11, sk2, 0, -0.3, 0))
      // 爪状手：反曲的四根长指
      const hand = new THREE.Group()
      hand.position.y = -0.62
      hand.add(box(0.15, 0.17, 0.13, sk, 0, -0.06, 0))
      for (let i = 0; i < 4; i++) {
        const f = box(0.028, 0.24, 0.028, sk2, (i - 1.5) * 0.045, -0.22, 0.02)
        f.rotation.x = 0.5 // 指节反曲
        hand.add(f)
      }
      fore.add(hand)
      tag(hand, 'hand')
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
    case 'vendingmachine': case 'vmad': { // 人制品售货机（Entity 36）：前厅品牌售货机；活化后底部长出骷髅手腿
      const mad = type === 'vmad'
      const bodyC = mad ? '#5a3a3a' : '#4a5a66', trimC = '#2a3038'
      // 机身（1.8m 高柜体）
      grp.add(box(0.8, 1.8, 0.6, bodyC, 0, 0.9, 0))
      grp.add(box(0.82, 0.06, 0.62, trimC, 0, 1.78, 0)) // 顶檐
      // 正面展示窗（字母数字格，发光产品格）
      grp.add(box(0.6, 0.9, 0.04, '#1a2028', -0.06, 1.15, 0.29))
      for (let r = 0; r < 3; r++)
        for (let c2 = 0; c2 < 3; c2++)
          grp.add(glow(0.1, 0.1, 0.02, ['#c9a03a', '#8fd98f', '#c94a3a'][(r + c2) % 3], -0.24 + c2 * 0.18, 0.9 + r * 0.28, 0.32))
      // 取货口 + 按键区
      grp.add(box(0.5, 0.16, 0.06, trimC, -0.05, 0.35, 0.3))
      grp.add(box(0.12, 0.2, 0.03, '#c9cdd4', 0.3, 1.3, 0.3))
      grp.add(box(0.06, 0.06, 0.03, '#c94a3a', 0.3, 1.16, 0.3))
      // 骷髅手腿（活化才显示）：四只白骨手臂撑地
      const legs = new THREE.Group()
      for (const [lx, lz, rz] of [[-0.28, 0.2, 0.35], [0.28, 0.2, -0.35], [-0.28, -0.2, 0.3], [0.28, -0.2, -0.3]] as const) {
        const upper = box(0.05, 0.55, 0.05, '#d8d4c4', lx, 0.28, lz)
        upper.rotation.z = rz * 0.4
        legs.add(upper)
        const fore = box(0.04, 0.3, 0.04, '#c9c4b4', lx + rz * 0.12, 0.08, lz)
        fore.rotation.z = rz * 0.9
        legs.add(fore)
        for (let f = 0; f < 3; f++) legs.add(box(0.015, 0.09, 0.015, '#d8d4c4', lx + rz * 0.2 - 0.02 + f * 0.02, 0.01, lz + 0.02))
      }
      legs.visible = mad
      tag(legs, 'skLegs')
      break }
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
    case 'tiny': { // 小小（v58 重制 · Entity 720 参照 backrooms-wiki-cn）：巨型类人形——
      // 厚焦油罩袍 + 焦油层下两栖式生物荧光斑点 + 橡胶质坚韧皮肤 + 面部甲壳（终段张开露尖牙巨口）
      // + 巨物尸骨长矛 + 利爪。原生 +X；眼在暗处变亮、近水面暗淡（renderer 按深度驱动 eyeMats）。
      const skin = '#6f7d6b', skinD = '#525f4e', tar = '#14171c', tarL = '#232b34'
      const bone = '#d8cdb4', boneD = '#b0a586', faceC = '#d8c9a8', cara = '#39404a'
      // 眼睛材质（自发光强度由 renderer 按水深/光照写入——暗处亮、水面几乎无光）
      const eyeMat = emat('#9fd8e8', 0.25)
      const spotMat = emat('#7fd8e8', 0.5)
      grp.userData.eyeMats = [eyeMat]
      grp.userData.spotMat = spotMat
      // ---- 腿（髋部 pivot；泳姿由 renderer 驱动） ----
      for (const zs of [-1, 1]) {
        const leg = jointX(0.11, 0.52, 0.13, skin, 0, 1.06, zs * 0.1, zs < 0 ? 'legL' : 'legR', zs * 0.06)
        const shin = tip(leg, 0.09, 0.5, 0.11, skinD, -0.5)
        tip(shin, 0.05, 0.3, 0.02, tar, -0.22, 0.07) // 小腿后侧蹼刃
        for (let c = 0; c < 3; c++) tip(shin, 0.05, 0.1, 0.03, tar, -0.52, (c - 1) * 0.05) // 爪趾
        if (zs > 0) tip(leg, 0.03, 0.06, 0.03, '#7fd8e8', -0.3, 0.08).material = spotMat // 大腿荧光斑
      }
      // ---- 躯干（焦油罩袍） ----
      const torso = new THREE.Group()
      torso.position.set(0, 1.42, 0)
      torso.add(new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.62, 0.24), lam(skin))) // 精瘦胸廓
      const waist = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.16, 0.2), lam(skinD)) // 腰
      waist.position.set(0, -0.42, 0)
      torso.add(waist)
      const cowl = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.3, 0.34), lam(tar)) // 焦油罩肩
      cowl.position.set(-0.05, 0.22, 0)
      torso.add(cowl)
      for (let i = 0; i < 4; i++) { // 罩袍下垂的焦油条
        const strip = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.5 + (i % 2) * 0.18, 0.07), lam(i % 2 ? tar : tarL))
        strip.position.set(-0.16 - (i % 2) * 0.04, -0.28 - (i % 2) * 0.08, (i - 1.5) * 0.09)
        strip.rotation.z = 0.12
        torso.add(strip)
      }
      // 荧光斑点（焦油层下，躯干 +X 侧与两侧）
      const spotPos: [number, number, number][] = [[0.16, 0.12, 0.07], [0.16, -0.08, -0.06], [0.15, -0.26, 0.04], [0.02, 0.2, 0.18], [-0.02, -0.16, 0.16], [0.02, 0.02, -0.17]]
      for (const [sx, sy, sz] of spotPos) {
        const sp = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.05, 0.035), spotMat)
        sp.position.set(sx, sy, sz)
        torso.add(sp)
      }
      tag(torso, 'torso')
      // ---- 手臂（肩部 pivot；利爪；右臂持骨矛） ----
      for (const zs of [-1, 1]) {
        const arm = jointX(0.1, 0.46, 0.11, skin, 0.02, 1.92, zs * 0.26, zs < 0 ? 'armL' : 'armR', zs * 0.1)
        const fore = tip(arm, 0.09, 0.44, 0.1, skinD, -0.44)
        for (let c = 0; c < 3; c++) tip(fore, 0.03, 0.16, 0.03, boneD, -0.52, (c - 1) * 0.045) // 利爪
        tip(arm, 0.03, 0.06, 0.03, '#7fd8e8', -0.2, 0.07).material = spotMat // 手臂荧光斑
      }
      // ---- 骨矛（挂 armR 末端；随攻击前刺） ----
      const spear = new THREE.Group()
      spear.position.set(0.1, -0.8, 0.02)
      spear.rotation.z = -1.35 // 近乎持平前指
      const shaft = cyl(0.022, 0.028, 2.7, bone, 0, 0.6, 0, 6)
      spear.add(shaft)
      spear.add(cyl(0.05, 0.012, 0.5, boneD, 0, 2.05, 0, 5)) // 骨刃尖
      for (const wy of [-0.2, 0.05]) spear.add(cyl(0.045, 0.045, 0.06, tar, 0, wy, 0, 6)) // 缠柄焦油箍
      parts.armR!.add(spear)
      tag(spear, 'spear')
      // ---- 头（面部甲壳 + 眼 + 甲壳下尖牙巨口 + 焦油头冠） ----
      const hg = new THREE.Group()
      hg.position.set(0.04, 2.34, 0)
      hg.add(cyl(0.07, 0.09, 0.18, skinD, 0, -0.14, 0, 6)) // 颈
      const skull = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.3, 0.24), lam(skin))
      hg.add(skull)
      const faceplate = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.24, 0.18), lam(faceC)) // 面部浅色壳底
      faceplate.position.set(0.13, 0.01, 0)
      hg.add(faceplate)
      for (const zs of [-1, 1]) { // 双眼（+X 面）
        const eye = face(new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.055, 0.05), eyeMat))
        eye.position.set(0.165, 0.05, zs * 0.055)
        hg.add(eye)
      }
      // 尖牙巨口（甲壳下；终段张口时可见）
      const mouth = new THREE.Group()
      mouth.position.set(0.14, -0.07, 0)
      mouth.add(new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.09, 0.13), lam('#1c1016')))
      for (let i = 0; i < 6; i++) {
        const f1 = face(glow(0.02, 0.045, 0.02, '#e8e2d2', 0.03, 0.045, (i / 5 - 0.5) * 0.11))
        const f2 = face(glow(0.02, 0.045, 0.02, '#e8e2d2', 0.03, -0.045, (i / 5 - 0.5) * 0.11))
        mouth.add(f1, f2)
      }
      mouth.scale.setScalar(0.01) // 平时收起
      hg.add(mouth)
      tag(mouth, 'mouth')
      // 面部甲壳（左右两片；终段向两侧张开）
      for (const zs of [-1, 1]) {
        const plate = new THREE.Group()
        plate.position.set(0.1, 0.02, zs * 0.1)
        const pl = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.3, 0.06), lam(cara))
        pl.position.set(0.02, 0, -zs * 0.055)
        plate.add(pl)
        hg.add(plate)
        tag(plate, zs < 0 ? 'carL' : 'carR')
      }
      // 焦油头冠（向后上方扫出的标志性罩冠）
      const fin = new THREE.Group()
      fin.position.set(-0.1, 0.12, 0)
      for (let i = 0; i < 3; i++) {
        const seg = new THREE.Mesh(new THREE.BoxGeometry(0.34 - i * 0.07, 0.1, 0.2 - i * 0.04), lam(i === 1 ? tarL : tar))
        seg.position.set(-0.12 - i * 0.16, 0.1 + i * 0.09, 0)
        seg.rotation.z = 0.5 + i * 0.25
        fin.add(seg)
      }
      hg.add(fin)
      tag(fin, 'tarfin')
      tag(hg, 'head')
      break
    }
    case 'thething': { // 7 层之物（v58 重制 · Entity 20 Fandom；v58fix3 竖扁写实化）：巨鳗——
      // 竖直侧扁的缎带形巨躯（非圆滚）、烂革质斑驳皮、占头部三分之一的海口、针齿、红鳃丝、
      // 连续背鳍膜；个别体节「故障」般视觉扭曲。原生 +X；体节链 seg0..8 由 renderer 拖链驱动。
      const hide = '#211d18', hideD = '#17140f', flank = '#2a261f', belly = '#3a382e'
      const gill = '#6e2a2e', fin = '#15120e', scar = '#5c5f52', mottle = '#4a4a3c'
      // ---- 头（tag 'head'；下颚 tag 'jaw'——口裂占头长 1/3，攻击时大张） ----
      const hg = new THREE.Group()
      hg.position.set(1.2, 1.42, 0)
      hg.scale.setScalar(1.28) // v58fix4：头部整体放大（配合更大的躯体）
      const cranium = sph(0.55, hide, 12) // 颅骨：长、低、侧扁
      cranium.scale.set(1.5, 0.62, 0.42)
      hg.add(cranium)
      const upper = box(1.0, 0.13, 0.26, hideD, 0.75, -0.06, 0) // 上颌长吻（前伸微沉）
      upper.rotation.z = -0.06
      hg.add(upper)
      hg.add(box(0.72, 0.07, 0.2, '#3a1418', 0.72, -0.2, 0)) // 上腭暗红
      for (let i = 0; i < 10; i++) // 上颌针齿（前缘一排，参差）
        hg.add(face(glow(0.026, 0.1 + (i % 3) * 0.03, 0.026, '#d5cdb6', 0.36 + i * 0.085, -0.16 - (i % 2) * 0.02, (i / 9 - 0.5) * 0.24)))
      const jaw = new THREE.Group() // 下颚：后缘 pivot；口裂自吻尖裂到头长 1/3 处
      jaw.position.set(0.05, -0.26, 0)
      const jawM = box(1.45, 0.12, 0.22, flank, 0.55, -0.05, 0)
      jaw.add(jawM)
      jaw.add(box(1.0, 0.05, 0.16, '#3a1418', 0.6, 0.02, 0)) // 下口腔暗红
      for (let i = 0; i < 9; i++) // 下颌针齿
        jaw.add(face(glow(0.024, 0.09 + (i % 2) * 0.04, 0.024, '#c9c0a8', 0.02 + i * 0.14, 0.05, (i / 8 - 0.5) * 0.18)))
      hg.add(jaw)
      tag(jaw, 'jaw')
      for (const zs of [-1, 1]) { // 小而浊的侧眼（写实的阴冷小眼）
        const eye = face(sph(0.075, '#b9c4c2', 8))
        eye.position.set(0.42, 0.1, zs * 0.23)
        hg.add(eye)
        const pupil = face(glow(0.03, 0.04, 0.02, '#0a0c0a', 0.46, 0.1, zs * 0.24))
        hg.add(pupil)
      }
      for (const zs of [-1, 1]) { // 红色鳃丝扇（头后两侧）
        for (let i = 0; i < 5; i++) {
          const gf = box(0.025, 0.34, 0.015, gill, -0.32 - i * 0.05, -0.06, zs * (0.2 + i * 0.02))
          gf.rotation.x = zs * (0.5 + i * 0.12)
          hg.add(gf)
        }
        for (let i = 0; i < 3; i++) hg.add(box(0.5, 0.025, 0.012, hideD, 0.1 - i * 0.28, 0.16 - i * 0.12, zs * 0.24)) // 侧皮褶
      }
      hg.add(box(0.4, 0.025, 0.04, scar, 0.3, 0.28, 0.1)) // 旧疤
      hg.add(box(0.26, 0.025, 0.04, scar, 0.7, 0.16, -0.12))
      tag(hg, 'head')
      // ---- 体节链 seg0..seg8（竖扁缎带形；renderer 拖链每帧覆写位置） ----
      const glitchMat = emat('#8fd8d0', 0.0) // 「故障」斑块——renderer 无规则闪烁
      grp.userData.glitchMat = glitchMat
      for (let i = 0; i < 9; i++) {
        const seg = new THREE.Group()
        seg.position.set(0.3 - (i + 1) * 1.35, 1.45, 0)
        const t9 = i / 8
        const rr = 0.8 * (1 - t9 * 0.45) // v58fix4：整体增粗（向后渐细）
        const sb = sph(rr, i % 2 ? hide : hideD, 10)
        sb.scale.set(1.7, 1.55, 0.5) // 竖直侧扁（高而薄）——缎带形横截面
        seg.add(sb)
        const ub = sph(rr * 0.8, belly, 8) // 腹部浅色斑驳
        ub.scale.set(1.3, 1.15, 0.45)
        ub.position.y = -rr * 0.42
        seg.add(ub)
        // 连续背鳍膜（顶缘薄而高，后段渐低）
        const df = box(1.1, (0.62 - t9 * 0.34) * rr + 0.12, 0.045, fin, 0, rr * 1.35, 0)
        df.rotation.z = 0.08
        seg.add(df)
        if (i >= 5) { // 臀鳍膜（尾段腹缘）
          const af = box(0.95, 0.3 * (1 - (t9 - 0.6)), 0.04, fin, 0, -rr * 1.28, 0)
          af.rotation.z = -0.1
          seg.add(af)
        }
        if (i === 0) for (const zs of [-1, 1]) { // 胸鳍（头后第一节）
          const pf = box(0.3, 0.08, 0.02, fin, -0.1, -0.1, zs * (rr * 0.48 + 0.06))
          pf.rotation.x = zs * 0.6
          pf.rotation.z = -0.4
          seg.add(pf)
        }
        if (i < 3) { // 头后鳃裂（前三节侧面）
          for (let g = 0; g < 3; g++) seg.add(box(0.035, 0.42, 0.015, gill, -0.32 + g * 0.26, 0.05, rr * 0.5 + 0.01))
        }
        if (i % 2 === 0) { // 皮革质斑驳（侧腹不规则浅斑）
          seg.add(box(0.6, 0.16, 0.02, mottle, 0.1, rr * 0.42, rr * 0.5 + 0.01))
          seg.add(box(0.42, 0.13, 0.02, mottle, -0.3, -rr * 0.25, -(rr * 0.5 + 0.01)))
        }
        if (i === 2 || i === 5) { // 伤疤
          seg.add(box(0.55, 0.045, 0.03, scar, 0.1, rr * 0.66, rr * 0.34))
          seg.add(box(0.38, 0.045, 0.03, scar, -0.25, -rr * 0.42, -(rr * 0.38)))
        }
        if (i === 3 || i === 6) { // 「故障」体节：视觉扭曲斑块（renderer 闪烁抖动）
          for (let g = 0; g < 4; g++) {
            const gp = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.18 + (g % 2) * 0.12, 0.06), glitchMat)
            gp.position.set((g - 1.5) * 0.3, rr * 0.7 * (g % 2 ? 1 : -0.5), (g % 2 ? 1 : -1) * (rr * 0.52 + 0.01))
            seg.add(gp)
          }
        }
        if (i === 8) { // 尾鳍（竖扁上翘）
          const tf = box(0.6, 1.15, 0.05, fin, -0.55, 0.15, 0)
          tf.rotation.z = 0.25
          seg.add(tf)
        }
        tag(seg, `seg${i}`)
      }
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
    case 'nguithr': { // Nguithr'xurh（Entity 16）：十二条附肢的大蜘蛛——头胸 + 分节花腹 + 复眼 + 螯牙；恐怖节肢造型
      const cephC = '#3a332c', abdC = '#57503f', abdDark = '#332d24', band1 = '#2e2820', band2 = '#8a8272'
      const spider = new THREE.Group()
      // 头胸部（前方，低伏）
      const ceph = new THREE.Group()
      ceph.position.set(0.14, 0.1, 0)
      ceph.add(box(0.2, 0.13, 0.18, cephC, 0, 0, 0))
      ceph.add(box(0.1, 0.08, 0.12, abdDark, 0.08, -0.02, 0)) // 吻部前伸
      spider.add(ceph); tag(ceph, 'ceph')
      // 复眼群（两列暗红小点，恐怖感）
      for (const [ey, ez] of [[0.03, -0.05], [0.03, 0.05], [0.06, -0.03], [0.06, 0.03], [0.045, -0.07], [0.045, 0.07]] as const)
        ceph.add(face(glow(0.016, 0.016, 0.016, '#7a1a12', 0.09, ey, ez)))
      // 螯牙（向下钩）
      for (const z of [-0.04, 0.04]) {
        const fang = box(0.02, 0.07, 0.02, band1, 0.14, -0.06, z)
        fang.rotation.z = 0.5
        ceph.add(fang)
      }
      // 分节腹部（后拖，四节渐大，背斑花纹）
      const abd = new THREE.Group()
      abd.position.set(-0.02, 0.12, 0)
      const segs: [number, number, number][] = [[-0.08, 0.16, 0.14], [-0.2, 0.2, 0.18], [-0.32, 0.22, 0.2], [-0.44, 0.18, 0.16]]
      for (let i = 0; i < segs.length; i++) {
        const [sx, sw, sd] = segs[i]
        abd.add(box(sw, 0.14, sd, i % 2 ? abdDark : abdC, sx, 0, 0))
        abd.add(box(sw * 0.7, 0.02, sd * 0.5, band1, sx, 0.08, 0)) // 背部斑纹条
      }
      abd.add(glow(0.04, 0.02, 0.04, '#c9b98a', -0.26, 0.09, 0)) // 背斑亮点
      spider.add(abd); tag(abd, 'abdomen')
      // 12 条双节附肢（每侧 6：股节上挑外展 + 胫节下垂，深浅环带相间）
      for (let side = -1; side <= 1; side += 2) {
        for (let i = 0; i < 6; i++) {
          const leg = new THREE.Group()
          const hipX = 0.14 - i * 0.075, spread = 0.12 + (i % 3) * 0.02
          leg.position.set(hipX, 0.12, side * spread)
          // 股节（向外上方挑）
          const femur = box(0.02, 0.02, 0.16, i % 2 ? band1 : band2, -0.02, 0.05, side * 0.08)
          femur.rotation.x = side * 0.55
          leg.add(femur)
          // 胫节（折向下垂）
          const tibia = box(0.015, 0.18, 0.015, i % 2 ? band2 : band1, -0.02, -0.04, side * 0.17)
          tibia.rotation.x = side * -0.15
          leg.add(tibia)
          leg.rotation.y = side * (0.35 - i * 0.12) // 前后展开角
          leg.userData.baseRy = leg.rotation.y // 供动画在每帧重建摆动时保留展开角
          spider.add(leg); tag(leg, side < 0 ? `legL${i}` : `legR${i}`)
        }
      }
      tag(spider, 'spiderBody')
      // 球状网囊（半透白网纹球 + 一根悬丝）
      const sac = new THREE.Group()
      sac.add(box(0.3, 0.3, 0.3, '#e8e4d8', 0, 0, 0))
      sac.add(box(0.34, 0.02, 0.02, '#c9c4b4', 0, 0.06, 0))
      sac.add(box(0.02, 0.02, 0.34, '#c9c4b4', 0, -0.04, 0))
      sac.add(box(0.012, 1.2, 0.012, '#d8d4c4', 0, 0.75, 0)) // 悬丝向上
      tag(sac, 'sacGrp')
      break }
    case 'dryshrimp': { // 旱虾（Entity 20）：分节橙褐色躯体 + 两侧扇状鳍叶 + 柄眼与触须 + 扇尾（奇虾科造型）
      const shell = '#b3612e', shellD = '#8f4a22', fin = '#d9a86a', belly = '#c97a45'
      const body = new THREE.Group()
      body.position.set(0, 0.12, 0)
      // 分节躯体（头→尾渐窄，逐节微降）
      for (let i = 0; i < 5; i++) {
        const w = 0.1 - i * 0.008, x = 0.12 - i * 0.09
        body.add(box(0.1, 0.075, w * 2, i % 2 ? shell : shellD, x, -i * 0.004, 0))
        // 每节两侧扇状鳍叶（薄片外翻）
        for (const z of [-1, 1]) {
          const f = box(0.11, 0.012, 0.055, fin, x - 0.01, -0.02, z * (w + 0.04))
          f.rotation.x = z > 0 ? 0.5 : -0.5
          f.rotation.z = -0.15
          body.add(f)
        }
      }
      body.add(box(0.22, 0.04, 0.14, belly, 0, -0.045, 0)) // 腹甲
      tag(body, 'torso')
      // 头部：柄眼（黑珠）+ 前附肢 + 触须
      const hg = new THREE.Group()
      hg.position.set(0.2, 0.15, 0)
      hg.add(box(0.09, 0.07, 0.1, shell, 0, 0, 0))
      for (const z of [-0.05, 0.05]) {
        hg.add(box(0.035, 0.015, 0.015, shellD, 0.04, 0.045, z)) // 眼柄
        hg.add(glow(0.022, 0.022, 0.022, '#101216', 0.065, 0.055, z)) // 黑眼
        // 奇虾标志性前附肢（向下弯的须爪）
        const cl = box(0.02, 0.1, 0.02, shellD, 0.05, -0.06, z)
        cl.rotation.z = 0.5
        hg.add(cl)
        const at = box(0.12, 0.008, 0.008, fin, 0.1, 0.02, z)
        at.rotation.y = z > 0 ? -0.35 : 0.35 // 触须前伸外撇
        hg.add(at)
      }
      tag(hg, 'head')
      // 扇尾（三片尾鳍展开）
      const tail = new THREE.Group()
      tail.position.set(-0.34, 0.11, 0)
      for (const [ry, z] of [[-0.5, -0.05], [0, 0], [0.5, 0.05]] as const) {
        const t = box(0.14, 0.012, 0.05, fin, -0.05, 0, z)
        t.rotation.y = ry
        tail.add(t)
      }
      tag(tail, 'tail')
      break }
    case 'corpserat': { // 尸鼠（v42 合并死亡鼠，只保留一名）：形态按层级固定（v53）——
      // L2=灰白癞斑（廊道种群）/ L3=水豚形态（高智能变种，设陷阱）/ 其余=深褐竖耳（L8 天顶种群，旧档「死亡鼠」）。（原生 +X）
      // v53：L3 高智能尸鼠——水豚形态：桶状躯干、钝方吻、头顶小圆耳、几乎无尾，体型明显更大
      if (opts?.capybara) {
        const cc = '#6a563f', cd = '#584631', cl = '#7a6650'
        const body = new THREE.Group()
        body.position.set(0, 0.22, 0)
        body.add(box(0.42, 0.24, 0.24, cc, 0, 0, 0)) // 桶状躯干
        body.add(box(0.2, 0.2, 0.22, cd, -0.2, -0.02, 0)) // 后臀
        body.add(box(0.3, 0.04, 0.22, cd, 0.02, 0.13, 0)) // 背毛
        tag(body, 'torso')
        const hg = new THREE.Group()
        hg.position.set(0.28, 0.3, 0)
        hg.add(box(0.16, 0.15, 0.16, cl, 0, 0, 0))
        hg.add(box(0.12, 0.1, 0.12, cl, 0.12, -0.03, 0)) // 钝方吻
        hg.add(box(0.03, 0.03, 0.03, '#1a1412', 0.19, -0.01, 0)) // 鼻
        for (const z of [-0.05, 0.05]) hg.add(face(glow(0.024, 0.024, 0.024, '#241f1a', 0.088, 0.05, z))) // 眼（头盒前表面 x=0.08 之外，避免埋进头内）
        for (const z of [-0.05, 0.05]) hg.add(box(0.035, 0.045, 0.035, cd, -0.02, 0.09, z)) // 头顶小圆耳
        tag(hg, 'head')
        jointX(0.05, 0.15, 0.05, cd, 0.15, 0.16, -0.08, 'armL')
        jointX(0.05, 0.15, 0.05, cd, 0.15, 0.16, 0.08, 'armR')
        jointX(0.055, 0.15, 0.055, cd, -0.16, 0.16, -0.08, 'legL')
        jointX(0.055, 0.15, 0.055, cd, -0.16, 0.16, 0.08, 'legR')
        for (const l of [parts.armL, parts.armR, parts.legL, parts.legR]) tip(l, 0.055, 0.03, 0.07, '#241f1b', -0.15, 0.01)
        break
      }
      if (opts?.ratMorph !== 'gray') {
        // 深褐形态（旧死亡鼠）：小型四足啮齿——尖吻、长尾、竖耳，深褐色，体长约 0.4m
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
        if (opts?.ratMorph === 'hotel') { // v55：L5 酒店正装变种——小西装黑马甲 + 白衬衫襟 + 酒红领结
          body.add(box(0.28, 0.12, 0.17, '#1c1a1e', 0.01, -0.02, 0)) // 小西装躯干（马甲）
          body.add(box(0.1, 0.08, 0.02, '#e8e4da', 0.12, 0.01, 0.08)) // 白衬衫襟（左）
          body.add(box(0.1, 0.08, 0.02, '#e8e4da', 0.12, 0.01, -0.08)) // 白衬衫襟（右）
          hg.add(box(0.04, 0.03, 0.07, '#7a1e24', 0.08, -0.055, 0)) // 酒红领结
        }
      } else {
        // 灰白形态（原尸鼠）：灰白近腐的大型啮齿——癞斑脱毛、尖吻、裸尾，口边沾着飞蛾翅粉
        const rc = '#8a8078', rd = '#6e665e', rl = '#9a928a', bare = '#a08a80'
        const body = new THREE.Group()
        body.position.set(0, 0.19, 0)
        body.add(box(0.3, 0.16, 0.17, rc, 0, 0, 0))
        body.add(box(0.17, 0.15, 0.16, rd, -0.18, -0.01, 0)) // 后臀
        body.add(box(0.22, 0.03, 0.15, rd, 0.02, 0.09, 0)) // 背毛
        body.add(box(0.09, 0.02, 0.08, bare, 0.05, 0.105, 0.03)) // 癞斑（脱毛露皮）
        body.add(box(0.07, 0.02, 0.06, bare, -0.1, 0.1, -0.04))
        tag(body, 'torso')
        const hg = new THREE.Group()
        hg.position.set(0.22, 0.21, 0)
        hg.add(box(0.12, 0.11, 0.11, rl, 0, 0, 0))
        hg.add(box(0.1, 0.06, 0.06, rl, 0.1, -0.02, 0)) // 尖吻
        hg.add(box(0.03, 0.03, 0.03, '#1a1412', 0.16, -0.02, 0)) // 鼻
        for (const z of [-0.045, 0.045]) hg.add(face(glow(0.024, 0.024, 0.024, '#c9a03a', 0.065, 0.02, z))) // 眼（浑浊黄）
        hg.add(face(glow(0.024, 0.03, 0.04, '#e8e2d2', 0.15, -0.055, 0))) // 门牙
        hg.add(box(0.05, 0.015, 0.05, '#7a6a5a', 0.13, -0.06, 0)) // 口边沾的飞蛾翅粉
        for (const z of [-0.055, 0.055]) { // 竖耳
          const ear = box(0.02, 0.09, 0.08, rd, -0.02, 0.09, z)
          ear.rotation.x = z > 0 ? 0.22 : -0.22
          hg.add(ear)
        }
        tag(hg, 'head')
        const tgeo = new THREE.BoxGeometry(0.36, 0.022, 0.022) // 裸尾（无毛，灰粉）
        tgeo.translate(-0.18, 0, 0)
        const tl = new THREE.Mesh(tgeo, lam(bare))
        tl.position.set(-0.28, 0.19, 0)
        tl.rotation.z = -0.15
        tag(tl, 'tail')
        jointX(0.05, 0.15, 0.05, rd, 0.15, 0.15, -0.07, 'armL')
        jointX(0.05, 0.15, 0.05, rd, 0.15, 0.15, 0.07, 'armR')
        jointX(0.055, 0.15, 0.055, rd, -0.14, 0.15, -0.07, 'legL')
        jointX(0.055, 0.15, 0.055, rd, -0.14, 0.15, 0.07, 'legR')
        for (const l of [parts.armL, parts.armR, parts.legL, parts.legR]) tip(l, 0.055, 0.03, 0.065, '#3a332e', -0.15, 0.01)
      }
      break
    }
    case 'wretch': { // 悲尸（Entity 15）：骷髅般消瘦的人形；红棕色干裂皮肤，布满孔洞与脓疱；
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
    || type === 'corpserat' || type === 'watcher' || type === 'strider' || type === 'mangled' || type === 'soilworm'
    || type === 'nguithr' || type === 'dryshrimp'
  if (!facesX) {
    const inner = new THREE.Group()
    inner.rotation.y = Math.PI / 2
    for (const ch of [...grp.children]) inner.add(ch)
    grp.add(inner)
    grp.userData.facesZ = 1
  }
  return grp
}
