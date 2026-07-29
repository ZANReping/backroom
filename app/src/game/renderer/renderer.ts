// Three.js 第一人称低多边形渲染器：主循环（静态几何/灯光池/实体动画编排，构建逻辑见同级模块）
import * as THREE from 'three'
import type { Engine } from '../engine'
import { tileH, groundHeightAt, type GameMap } from '../mapgen'
import type { LevelDef, Structure } from '../types'
import { LEVELS } from '../levels'
import { WALL_H, SKY, col, box, glow, look, type RenderOpts } from './shared'
import { buildTerrain } from './geometry'
import { CS, WIN_CHUNKS, type LiveChunk } from '../infinite'
import { buildSkyAndLiquids } from './liquidsSky'
import { buildStructure, buildExit } from './structures'
import { buildDecorations } from './decorations'
import { buildEntityMesh, buildItemMesh } from './entitiesMesh'
import { buildViewmodel, buildHeldItem, buildCrosshair, vmat } from './viewmodel'
import { getAvatar } from '../avatar'

export class Renderer3D {
  private three: THREE.WebGLRenderer
  private scene = new THREE.Scene()
  private camera: THREE.PerspectiveCamera
  private levelGroup: THREE.Group | null = null
  private builtMap: GameMap | null = null
  private builtRev = -1 // 已构建地图的 engine.mapRev（开发者就地改图时触发重建）
  private lightPool: THREE.PointLight[] = []
  private flash!: THREE.SpotLight
  private lighterLight!: THREE.PointLight // v22：打火机装备效果——玩家周围小火光
  private ambient!: THREE.AmbientLight
  private hemi!: THREE.HemisphereLight
  // v10：按层级 darkness 设定的最低环境光/半球光基准（黑暗中结构轮廓兜底）
  private ambientBase = 0.1
  private hemiBase = 0.12
  private entityMeshes = new Map<number, THREE.Group>()
  private itemMeshes = new Map<number, THREE.Group>()
  private projMeshes = new Map<number, THREE.Group>() // 飞行中的投掷物（引擎 projectiles 按 id 对应）
  private markMeshes = new Map<string, THREE.Group>() // 墙上的粉笔记号（key = wx,wy,dir）
  private structMeshes = new Map<Structure, THREE.Group>()
  private exitMeshes: { mesh: THREE.Object3D; mat: THREE.MeshBasicMaterial }[] = []
  // v17：无限模式（L0）按 chunk 构建的几何组（进入视野构建、远离卸载、平移只动 position）
  private chunkGroups = new Map<string, { group: THREE.Group; wx: number; wy: number; structs: Structure[]; fixtures: { mat: THREE.MeshBasicMaterial; seed: number }[]; exitMeshes: { mesh: THREE.Object3D; mat: THREE.MeshBasicMaterial }[] }>()
  private chunkRedo = -1 // 已同步的 inf.redo（红室蔓延等全图变化时全部重建）
  // v17：tint 氛围雾（红室红雾/熄灯区近黑/马尼拉暖调）平滑混合
  private tintK = 0
  private tintC = new THREE.Color('#3a0a08')
  private fakeMeshes: THREE.Group[] = []
  private fixtures: { mat: THREE.MeshBasicMaterial; seed: number }[] = []
  private particlesPts!: THREE.Points
  private particlesGeo!: THREE.BufferGeometry
  private dust!: THREE.Points
  private steamT = 0
  private bobPhase = 0
  private time = 0
  private wallH = 3
  private levelCfg: LevelDef | null = null
  private fovBase = 72
  private camShakeX = 0
  private camShakeY = 0
  // v7：蹲伏相机下沉量（平滑）+ 室外雾/天空混合系数 + 室内雾基准
  private crouchDrop = 0
  private outK = 0
  private fogC = new THREE.Color('#000000')
  private fogNear = 1.2
  private fogFar = 17
  private fogEnabled = true // 设置项：战争迷雾（距离雾）开关
  private skyC = new THREE.Color('#0a0a0c')
  private uwK = 0 // v13：水下视野混合（0=水上 1=水下：蓝绿浑浊短视距）
  // 第一人称手部 viewmodel（挂相机）
  private vm = new THREE.Group()
  private vmItem: THREE.Group | null = null
  private vmHeld = ''
  private vmFlash = new THREE.Group()
  private vmParts!: { hand: THREE.Mesh; lhand: THREE.Mesh; sleeve: THREE.Mesh } // 手部/袖子（肤色与装备联动）
  // 副手打火机 viewmodel（装备打火机时显示；与手电互斥——副手只有一个槽位）
  private vmLighter = new THREE.Group()
  private vmLighterFlame!: THREE.Mesh
  private vmLighterHand!: THREE.Mesh
  // 屏幕中心准心（DOM 注入，内联样式）
  private cross!: HTMLDivElement
  private crossState = ''


  constructor(canvas: HTMLCanvasElement) {
    this.three = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'low-power' })
    this.three.outputColorSpace = THREE.SRGBColorSpace
    // v28：ACES 电影级色调映射——高光自然滚降（手电照墙不再糊成一片白），光照层次更真实
    this.three.toneMapping = THREE.ACESFilmicToneMapping
    this.three.toneMappingExposure = 1.45
    // v28：手电实时阴影（PCF 软阴影；可在设置中关闭，移动端默认关）
    this.three.shadowMap.enabled = true
    this.three.shadowMap.type = THREE.PCFShadowMap
    this.camera = new THREE.PerspectiveCamera(this.fovBase, 1, 0.05, 60)
    this.camera.rotation.order = 'YXZ'
    this.ambient = new THREE.AmbientLight(0xffffff, 0.06)
    this.scene.add(this.ambient)
    // v10：半球光兜底（天空=冷灰微光 / 地面=暖暗），让无灯区墙/柱/天花板仍有剪影
    this.hemi = new THREE.HemisphereLight(0x9aa2b0, 0x3a342c, 0.12)
    this.scene.add(this.hemi)
    // 手电（v28：decay=1.8 近似平方反比 + 更柔和的边缘半影；略降衰减让光斑更柔、射程更自然）
    this.flash = new THREE.SpotLight(0xfff2d0, 0, 18, 0.55, 0.6, 1.8)
    this.flash.castShadow = true
    this.flash.shadow.mapSize.set(1024, 1024)
    this.flash.shadow.camera.near = 0.3
    this.flash.shadow.camera.far = 20
    this.flash.shadow.bias = -0.0005
    this.flash.shadow.normalBias = 0.03
    this.scene.add(this.flash)
    this.scene.add(this.flash.target)
    // 打火机（装备时启用）：暖橙小火光，半径小、随火苗闪烁
    this.lighterLight = new THREE.PointLight(0xff9a3c, 0, 4.2, 2)
    this.scene.add(this.lighterLight)
    // 灯光池（v31：10 → 24 盏——可视范围内的灯全部点亮，不再出现「离玩家远了就熄灯」；
    // 前 18 盏全亮，第 19-24 盏按距离名次渐隐，消除边界 pop-in；decay=1.6 近似漫反射回弹）
    for (let i = 0; i < 24; i++) {
      const l = new THREE.PointLight(0xffffff, 0, 9, 1.6)
      this.scene.add(l)
      this.lightPool.push(l)
    }
    // 引擎粒子（血/蒸汽）
    this.particlesGeo = new THREE.BufferGeometry()
    this.particlesGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(120 * 3), 3))
    this.particlesGeo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(120 * 3), 3))
    this.particlesPts = new THREE.Points(this.particlesGeo, new THREE.PointsMaterial({ size: 0.14, vertexColors: true, transparent: true, opacity: 0.9, depthWrite: false }))
    this.particlesPts.frustumCulled = false
    this.scene.add(this.particlesPts)
    // 灰尘
    const dustGeo = new THREE.BufferGeometry()
    const dn = 160
    const dp = new Float32Array(dn * 3)
    for (let i = 0; i < dn; i++) { dp[i * 3] = (Math.random() - 0.5) * 14; dp[i * 3 + 1] = Math.random() * 3; dp[i * 3 + 2] = (Math.random() - 0.5) * 14 }
    dustGeo.setAttribute('position', new THREE.BufferAttribute(dp, 3))
    this.dust = new THREE.Points(dustGeo, new THREE.PointsMaterial({ size: 0.03, color: 0xbfb598, transparent: true, opacity: 0.5, depthWrite: false }))
    this.dust.frustumCulled = false
    this.scene.add(this.dust)
    // 手部 viewmodel 挂相机（相机须入场景才渲染子节点）
    this.scene.add(this.camera)
    this.vmParts = buildViewmodel(this.vm, this.vmFlash, this.camera)
    // 副手打火机（装备时显示）：左手持机 + 跳动火苗（光效由 lighterLight 提供）
    {
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.075, 0.032), vmat('#c9c2a8'))
      this.vmLighter.add(body)
      const cap = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.026, 0.03), vmat('#8a8a8a'))
      cap.position.set(0, 0.05, 0)
      this.vmLighter.add(cap)
      this.vmLighterFlame = new THREE.Mesh(
        new THREE.ConeGeometry(0.015, 0.05, 6),
        new THREE.MeshBasicMaterial({ color: '#ffb347', transparent: true, opacity: 0.95 }),
      )
      this.vmLighterFlame.position.set(0, 0.095, 0)
      this.vmLighter.add(this.vmLighterFlame)
      this.vmLighterHand = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.055, 0.1), vmat('#c9a58a'))
      this.vmLighterHand.position.set(0, -0.06, 0.02)
      this.vmLighter.add(this.vmLighterHand)
      this.vmLighter.position.set(-0.24, -0.28, -0.42)
      this.camera.add(this.vmLighter)
    }
    this.cross = buildCrosshair()
  }

  private setHeldItem(type: string) {
    if (this.vmItem) { this.vm.remove(this.vmItem); this.vmItem = null }
    this.vmHeld = type
    if (type) {
      this.vmItem = buildHeldItem(type)
      this.vm.add(this.vmItem)
    }
  }


  private updateViewmodel(engine: Engine) {
    const p = engine.player
    const show = !engine.paused && !engine.over && !!engine.map
    this.vm.visible = show
    this.vmFlash.visible = show && p.equip.offhand?.type === 'flashlight' && p.flashlight && p.battery > 0 && p.flashJamT <= 0 // v32：手部模型仅手电（头灯戴在头上，无手部模型）
    // 副手打火机：装备即常显（火苗随时间跳动）
    this.vmLighter.visible = show && p.hasLighter
    if (this.vmLighter.visible) {
      const fl = 0.8 + Math.sin(this.time * 11) * 0.15 + Math.sin(this.time * 23.7) * 0.08
      this.vmLighterFlame.scale.set(fl, 0.85 + Math.sin(this.time * 17.3) * 0.3, fl)
      this.vmLighter.position.y = -0.28 - Math.abs(Math.cos(this.bobPhase)) * (Math.hypot(engine.input.mx, engine.input.my) > 0.1 ? 0.01 : 0)
    }
    // 手部外观联动：肤色取自捏人配置；隔热手套→黄色手套；绝缘服→绿色袖口
    {
      const av = getAvatar()
      const handC = p.hasGloves ? '#b89a2e' : av.skin
      const sleeveC = p.hasSuit ? '#3a5a3a' : av.top
      for (const [mesh, c] of [[this.vmParts.hand, handC], [this.vmParts.lhand, handC], [this.vmParts.sleeve, sleeveC], [this.vmLighterHand, handC]] as const) {
        const m = mesh.material as THREE.MeshLambertMaterial
        if (m.color.getHexString() !== c.slice(1)) { m.color.set(c); m.emissive.set(c) }
      }
    }
    if (!show) return
    const held = p.hotbar[p.selected]?.type ?? ''
    if (held !== this.vmHeld) this.setHeldItem(held)
    // 走路摆动（与头部 bob 同步，幅度更小）
    const mag = Math.hypot(engine.input.mx, engine.input.my)
    const moving = mag > 0.1
    const sway = moving ? Math.sin(this.bobPhase) : 0
    const sway2 = moving ? Math.abs(Math.cos(this.bobPhase)) : 0
    let px = 0.27 + sway * 0.012
    let py = -0.3 - sway2 * 0.016
    let pz = -0.55
    let rx = 0
    let rz = 0
    if (engine.attackAnimT > 0) {
      const pr = 1 - engine.attackAnimT / 0.35
      const k = Math.sin(pr * Math.PI)
      const kind = engine.attackAnimKind
      if (kind === 'punch') {
        // 空手出拳：直线快速前刺，节奏比挥舞更急促
        const kj = Math.sin(Math.min(1, pr * 1.3) * Math.PI)
        pz -= kj * 0.28; py += kj * 0.02; rx = -kj * 0.3; rz = kj * 0.1
      } else if (kind === 'throw') {
        // 投掷：抬臂后向前上方甩出
        rx = -k * 0.75; py += k * 0.12; pz -= k * 0.16; rz = -k * 0.18
      } else if (kind === 'spray') {
        // 滋水枪喷射：泵压式快速前顶两下
        const k2 = Math.max(0, Math.sin(pr * Math.PI * 2))
        pz -= k2 * 0.09; rx = -k2 * 0.12
      } else if (kind === 'drink') {
        // 饮用（滋水枪对自己喝）：抬起到嘴边
        rx = -k * 1.05; py += k * 0.1; pz += k * 0.07
      } else {
        // 武器挥舞（撬棍/扳手/木板）：横向挥砍弧线
        rx = -k * 1.0; rz = k * 0.55; pz -= k * 0.08; py += k * 0.04
      }
    } else if (engine.searching) {
      // 搜索动作：小幅翻找
      rx = -0.22 + Math.sin(this.time * 9) * 0.07
      px += Math.sin(this.time * 5.2) * 0.015
    }
    this.vm.position.set(px, py, pz)
    this.vm.rotation.x = rx
    this.vm.rotation.z = rz
    // 手电随移动轻微浮动
    this.vmFlash.position.y = -0.28 - sway2 * 0.01
  }

  private updateCrosshair(engine: Engine) {
    const el = this.cross
    const show = !engine.paused && !engine.over && !!engine.map
    const interact = show ? engine.getInteract() : null
    const atk = engine.attackAnimT > 0
    const aim = show ? engine.aimEntity() : null // 攻击可命中目标：准星变红放大
    const mobile = window.innerWidth < 800 || (typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches)
    const scale = (mobile ? 0.72 : 1) * (atk ? 0.6 : interact ? 1.55 : aim ? 1.3 : 1)
    const color = aim ? '#b3352b' : interact ? '#e8b93c' : '#e8e2d2' // 可命中=血红；交互=琥珀色展开；攻击=收缩
    const st = `${show}|${scale.toFixed(2)}|${color}`
    if (st === this.crossState) return
    this.crossState = st
    el.style.display = show ? 'block' : 'none'
    el.style.transform = `translate(-50%,-50%) scale(${scale})`
    for (const ch of Array.from(el.children) as HTMLElement[]) ch.style.background = color
  }

  resize(w: number, h: number, dpr: number) {
    this.three.setPixelRatio(dpr)
    this.three.setSize(w, h, false)
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
  }

  // 将屏幕系输入旋转到世界系（第一人称）
  applyView(engine: Engine) {
    const inp = engine.input
    const mx0 = inp.mx, my0 = inp.my
    if (Math.abs(mx0) < 1e-4 && Math.abs(my0) < 1e-4) return
    const s = Math.sin(look.yaw), c = Math.cos(look.yaw)
    inp.mx = c * mx0 + s * my0
    inp.my = -s * mx0 + c * my0
  }

  render(_canvas: HTMLCanvasElement, engine: Engine, opts: RenderOpts, dt: number) {
    this.time += dt
    const m = engine.map
    if (!m) { // 无地图（标题/菜单间隙）：准心同步隐藏，不等到下一帧状态变化
      this.cross.style.display = 'none'
      this.crossState = ''
      return
    }
    const def = LEVELS[engine.player.level]
    if (m.inf) {
      // v17：无限模式（L0）——chunk 几何按视野流式构建/卸载
      if (this.builtMap !== m) this.buildInfiniteEnv(m, def)
      this.syncInfinite(m, def, engine.player)
    } else if (this.builtMap !== m || this.builtRev !== engine.mapRev) {
      // 有限层：地图对象更换或开发者就地改图（mapRev++）时重建静态几何
      this.buildLevel(m, def)
      this.builtRev = engine.mapRev
    }

    const p = engine.player
    // 头部摆动
    const mag = Math.hypot(engine.input.mx, engine.input.my)
    const speed = mag > 0.1 ? (engine.input.sprint ? 6 : 3.4) : 0
    this.bobPhase += dt * (speed > 0 ? (engine.input.sprint ? 11 : 7.5) : 2)
    const bob = speed > 0 ? Math.sin(this.bobPhase) * (engine.input.sprint ? 0.055 : 0.035) : Math.sin(this.bobPhase) * 0.008

    // 相机震动（受伤震屏 + HP≤30 持续轻微晃动）
    const lowHp = p.hp <= 30 && p.hp > 0 ? 0.05 + Math.sin(this.time * 7) * 0.02 : 0
    const sh = opts.shake ? engine.camShake + lowHp : 0
    this.camShakeX = (Math.random() - 0.5) * sh * 0.1
    this.camShakeY = (Math.random() - 0.5) * sh * 0.1

    // 相机高度 = 眼高 + 玩家脚底高度(p.z) - 蹲伏下沉量（平滑），蹲伏时摆动减半
    const crouchTarget = p.crouching ? 0.55 : 0
    this.crouchDrop += (crouchTarget - this.crouchDrop) * Math.min(1, dt * 8)
    const eye = 1.55 + bob * (p.crouching ? 0.5 : 1) + p.z - this.crouchDrop
    this.camera.position.set(p.x + this.camShakeX, eye, p.y + this.camShakeY)
    // 低理智畸变：FOV 呼吸 + 侧倾
    const insanity = 1 - p.sanity / 100
    this.camera.rotation.y = look.yaw + this.camShakeX * 2
    this.camera.rotation.x = look.pitch + this.camShakeY * 2
    this.camera.rotation.z = Math.sin(this.time * 0.7) * 0.05 * insanity
    // 开场爬起：introT 3.2→0，相机从贴地侧躺缓慢起身、视线从地面抬起
    {
      const it = Math.max(0, Math.min(1, engine.introT / 3.2))
      if (it > 0) {
        const r = 1 - it, ease = r * r * (3 - 2 * r)
        this.camera.position.y = 0.35 + (this.camera.position.y - 0.35) * ease
        this.camera.rotation.z += (1 - ease) * 0.9
        this.camera.rotation.x += (1 - ease) * 0.3
      }
    }
    const fov = this.fovBase + Math.sin(this.time * 1.8) * 7 * insanity + (engine.input.sprint && mag > 0.1 ? 5 : 0)
    if (Math.abs(fov - this.camera.fov) > 0.05) { this.camera.fov = fov; this.camera.updateProjectionMatrix() }

    // 手电（低电量闪烁警告 / 电弧体瘫痪抖动）
    // v23：Level 6「Lights Out」——外带光源在本层完全不发光（noFlashlight）；
    //      Level 8 主动削弱光——100 流明的手电只剩约 12 流明（lightMul = 0.12）
    const lmul = this.levelCfg?.noFlashlight ? 0 : (this.levelCfg?.lightMul ?? 1)
    const fl = p.flashlight && p.battery > 0 && p.flashJamT <= 0 && lmul > 0
    let flI = fl ? 30 * (0.55 + 0.45 * (p.battery / 100)) * lmul : 0
    if (fl && p.battery <= 15) flI *= (Math.random() < 0.25 * opts.flicker ? 0.15 : 1) // 低电警告闪烁（受减闪烁设置约束）
    // 贴墙防过曝：沿视线步进探测最近墙体距离，近处衰减手电强度
    if (flI > 0 && engine.map) {
      const m = engine.map
      const dx = Math.cos(look.yaw), dy = Math.sin(look.yaw)
      let wallD = 6
      for (let s = 0.2; s <= 6; s += 0.2) {
        const tx = Math.floor(p.x + dx * s), ty = Math.floor(p.y + dy * s)
        if (tx < 0 || ty < 0 || tx >= m.w || ty >= m.h || m.tiles[ty * m.w + tx] !== 1) { wallD = s; break }
      }
      flI *= Math.min(1, Math.max(0.18, wallD / 3))
    }
    this.flash.intensity = flI
    // 光照来源按装备区分（v32）：
    // 头灯（头饰栏）——光心放额头正中（视线正前方、略高，阴影自然且左右对称）；
    // 手电筒（副手）——光心放左手位且略超前（与手电视图模型一致；光与视线错开产生可见阴影）
    const dir = new THREE.Vector3()
    this.camera.getWorldDirection(dir)
    const right = new THREE.Vector3().crossVectors(dir, this.camera.up).normalize()
    if (p.equip.head?.type === 'headlamp' && p.equip.offhand?.type !== 'flashlight') {
      this.flash.position.copy(this.camera.position).addScaledVector(dir, 0.35)
      this.flash.position.y += 0.14
    } else {
      this.flash.position.copy(this.camera.position).addScaledVector(dir, 0.7).addScaledVector(right, -0.18)
      this.flash.position.y -= 0.1
    }
    this.flash.target.position.copy(this.camera.position).addScaledVector(dir, 6)
    // v7 室外氛围混合：玩家身处室外时雾更远、背景过渡到层级天空色、环境光提高
    {
      const pi = Math.floor(p.y) * m.w + Math.floor(p.x)
      const isOut = m.outdoor[pi] === 1
      this.outK += ((isOut ? 1 : 0) - this.outK) * Math.min(1, dt * 2.5)
      const k = this.outK
      const fog = this.scene.fog as THREE.Fog | null
      if (fog) {
        fog.near = this.fogNear + (5 - this.fogNear) * k
        fog.far = this.fogFar + (48 - this.fogFar) * k
        fog.color.copy(this.fogC).lerp(this.skyC, k)
        if (this.scene.background instanceof THREE.Color) this.scene.background.copy(fog.color)
      }
      // 打火机微光（室内基准，v10 提高各层级最低值）→ 室外环境光提高
      this.ambient.intensity = (this.ambientBase + (p.hasLighter ? 0.03 : 0)) * (1 - k) + 0.38 * k
      // v22：打火机装备效果——玩家周围一圈暖橙小火光（火苗闪烁、水下/室外减弱）
      if (p.hasLighter) {
        const fl = 0.75 + Math.sin(this.time * 11) * 0.12 + Math.sin(this.time * 23.7) * 0.08 + Math.random() * 0.05
        this.lighterLight.intensity = 2.2 * fl * (1 - k * 0.5) * (this.uwK > 0.5 ? 0 : 1)
        this.lighterLight.position.set(this.camera.position.x, this.camera.position.y - 0.25, this.camera.position.z)
      } else {
        this.lighterLight.intensity = 0
      }
      this.hemi.intensity = this.hemiBase * (1 - k) + 0.3 * k
      // v13：水下视野——眼高没入深水面则蓝绿浑浊、视距骤减、环境光转冷
      const eyeZ = p.z + 1.55
      const under = m.liquid[pi] === 1 && eyeZ < 0.05
      this.uwK += ((under ? 1 : 0) - this.uwK) * Math.min(1, dt * 6)
      if (this.uwK > 0.01) {
        const uk = this.uwK
        const uwC = new THREE.Color('#0d3548')
        if (fog) {
          fog.near = fog.near * (1 - uk) + 0.15 * uk
          fog.far = fog.far * (1 - uk) + 7.5 * uk
          fog.color.lerp(uwC, uk)
          if (this.scene.background instanceof THREE.Color) this.scene.background.copy(fog.color)
        }
        this.ambient.intensity += 0.25 * uk
        this.hemi.intensity += 0.12 * uk // 水下微亮（能看清池壁）
      }
    }
    // v17：tint 氛围（红室=红雾 / 熄灯区=近黑短视距 / 马尼拉=暖调 / v29 浓雾区=灰白短视距 / v30 花园段=青翠阳光），按玩家所在瓦片平滑混合
    {
      const pi2 = Math.floor(p.y) * m.w + Math.floor(p.x)
      const tnt = m.tint[pi2]
      const target = tnt === 2 ? '#4a0503' : tnt === 3 ? '#000000' : tnt === 4 ? '#575b5e' : tnt === 1 ? '#161006' : tnt === 6 ? '#3d5c2f' : null
      this.tintK += ((target ? 1 : 0) - this.tintK) * Math.min(1, dt * 2.5)
      if (target) this.tintC.lerp(col(target), Math.min(1, dt * 4))
      const tk = this.tintK
      if (tk > 0.01) {
        const fog = this.scene.fog as THREE.Fog | null
        if (fog) {
          fog.color.lerp(this.tintC, tk * (tnt === 2 ? 0.95 : 0.9)) // 红室：雾气几乎全红
          if (tnt === 3) {
            fog.far = Math.max(3.5, fog.far * (1 - tk * 0.7)) // 熄灯区：视距大幅压缩
            // 熄灯区：环境光/半球光近乎完全熄灭（v28b：0.85→0.97——原保留 15% 环境光，
            // 黄色墙纸在高曝光下仍清晰可见；熄灯区应当伸手不见五指，手电成为唯一可靠光源）
            this.ambient.intensity *= 1 - tk * 0.97
            this.hemi.intensity *= 1 - tk * 0.97
          }
          if (tnt === 4) fog.far = fog.far * (1 - tk * 0.6) // v29 浓雾区（杏仁水洼蒸发）：视距压缩至 ~40%
          if (tnt === 6) { // v30 花园段：阳光充沛——环境光/半球光上调，青翠明亮（不压缩视距）
            this.ambient.intensity *= 1 + tk * 0.55
            this.hemi.intensity *= 1 + tk * 0.4
          }
          if (this.scene.background instanceof THREE.Color) this.scene.background.copy(fog.color)
        }
      }
    }

    // 设置项：战争迷雾关闭——雾推到远平面之外（背景色仍取雾色，远处天际线观感不变）
    if (!this.fogEnabled) {
      const fog = this.scene.fog as THREE.Fog | null
      if (fog) { fog.near = 9990; fog.far = 9999 }
    }

    // 设置项：漂浮尘埃粒子开关（默认关闭）
    this.dust.visible = opts.dust

    // 灯光池：最近 24 盏，前 18 盏全亮，第 19-24 盏按名次渐隐（1→0）——
    // 渐隐段落在雾距之外，可视范围内灯光不再随距离关闭（v31 取消「远灯自动熄灭」观感）
    const sorted = [...m.lights].sort((a, b) => (Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y)))
    for (let i = 0; i < this.lightPool.length; i++) {
      const pl = this.lightPool[i]
      const L = sorted[i]
      if (!L) { pl.intensity = 0; continue }
      const li = Math.floor(L.y) * m.w + Math.floor(L.x)
      pl.position.set(L.x, L.z !== undefined ? L.z + 2.4 : m.outdoor[li] === 1 ? 2.7 : this.wallH - 0.25, L.y)
      pl.color.set(L.color)
      const fl1 = Math.sin(this.time * 13 + L.flickerSeed * 17) * Math.sin(this.time * 7.3 + L.flickerSeed)
      const flick = 1 - opts.flicker * Math.max(0, fl1) * 0.7
      // v31：「闪烁」现象预警期——主区域灯光（非 keep）快速明灭数秒，随后才完全停电
      const warnF = engine.blackoutWarnT > 0 && L.keep !== 1 ? (Math.sin(this.time * 43 + L.flickerSeed * 29) > -0.2 ? 0.1 : 1.3) : 1
      const rankFade = i < 18 ? 1 : Math.max(0, 1 - (i - 17) / 6)
      // v23：层级光照系数——Level 6 的光本身被禁止（0），Level 8 主动削弱光（0.12）
      const lm = this.levelCfg?.lightMul ?? 1
      pl.intensity = 12 * flick * warnF * rankFade * (1 - (this.levelCfg?.darkness ?? 0.6) * 0.35) * lm * (this.levelCfg?.lightSoft ?? 1)
      pl.distance = L.r * 2.6 * (lm > 0 ? Math.max(0.35, lm) : 1)
    }
    // 灯具 flicker（自发光强度）
    for (const f of this.fixtures) {
      const fl1 = Math.sin(this.time * 13 + f.seed * 17) * Math.sin(this.time * 7.3 + f.seed)
      f.mat.color.setScalar(0)
      f.mat.color.copy(f.mat.userData.base as THREE.Color).multiplyScalar(1 - opts.flicker * Math.max(0, fl1) * 0.8)
    }
    // 出口脉动（闪烁的墙壁 strobe：规律明灭，约 1.2s 周期；其余出口为柔和呼吸）
    for (const e of this.exitMeshes) {
      const base = e.mat.userData.base as THREE.Color
      if (e.mat.userData.strobe) {
        const on = Math.sin(this.time * Math.PI * 2 * 0.85 + e.mesh.id * 0.7) > -0.1
        e.mat.color.copy(base).multiplyScalar(on ? 1.9 : 0.35) // 灭相位保留淡淡门形轮廓
      } else {
        e.mat.color.copy(base).multiplyScalar(1.1 + Math.sin(this.time * 3) * 0.5)
      }
    }

    this.updateEntities(engine, dt)
    this.updateItems(engine, dt)
    this.updateProjectiles(engine)
    this.updateWallMarks(engine)
    this.updateStructs(dt)
    this.updateParticles(engine, dt)
    this.updateAmbientFx(engine, def, dt)
    this.updateViewmodel(engine)
    this.updateCrosshair(engine)

    this.three.render(this.scene, this.camera)
  }

  // ---------- v17：公共拆卸（有限/无限层级切换时调用）----------
  // v28：为子树开启手电阴影（自发光 Basic 材质不投影——灯具/天空/出口辉光；其余既投也接）
  private enableShadows(root: THREE.Object3D) {
    root.traverse((o) => {
      const mm = o as THREE.Mesh
      if (!mm.isMesh) return
      const mat = mm.material as THREE.Material
      if ((mat as THREE.MeshBasicMaterial).isMeshBasicMaterial) return
      mm.castShadow = true
      mm.receiveShadow = true
    })
  }

  /** 设置开关：手电实时阴影（移动端默认关）。切换需刷新材质编译 */
  setShadows(on: boolean) {
    if (this.three.shadowMap.enabled === on && this.flash.castShadow === on) return
    this.three.shadowMap.enabled = on
    this.flash.castShadow = on
    this.scene.traverse((o) => {
      const mm = o as THREE.Mesh
      if (mm.material) (mm.material as THREE.Material).needsUpdate = true
    })
  }

  /** 设置开关：战争迷雾（距离雾）。关闭时每帧把雾推到可视范围外 */
  setFog(on: boolean) { this.fogEnabled = on }

  private teardown() {
    if (this.levelGroup) {
      this.scene.remove(this.levelGroup)
      this.levelGroup.traverse((o) => {
        const mm = o as THREE.Mesh
        if (mm.geometry) mm.geometry.dispose()
      })
      this.levelGroup = null
    }
    for (const [, cg] of this.chunkGroups) {
      this.scene.remove(cg.group)
      cg.group.traverse((o) => {
        const mm = o as THREE.Mesh
        if (mm.geometry) mm.geometry.dispose()
      })
    }
    this.chunkGroups.clear()
    for (const g of this.entityMeshes.values()) this.scene.remove(g)
    for (const g of this.itemMeshes.values()) this.scene.remove(g)
    for (const g of this.projMeshes.values()) this.scene.remove(g)
    for (const g of this.markMeshes.values()) this.scene.remove(g)
    this.entityMeshes.clear()
    this.itemMeshes.clear()
    this.projMeshes.clear()
    this.markMeshes.clear()
    this.structMeshes.clear()
    this.exitMeshes = []
    this.fixtures = []
  }

  // ---------- v17：无限模式环境（雾/环境光基线；几何由 syncInfinite 流式构建）----------
  private buildInfiniteEnv(m: GameMap, def: LevelDef) {
    this.teardown()
    this.builtMap = m
    this.levelCfg = def
    this.wallH = WALL_H[def.gen] ?? 3
    const pal = def.palette
    const fogC = col(pal.floor).multiplyScalar(0.12)
    const fogFar = 19 - def.darkness * 6
    this.scene.fog = new THREE.Fog(fogC, 2.0, fogFar)
    this.scene.background = new THREE.Color().copy(fogC)
    this.fogC.copy(fogC)
    this.fogNear = 2.0
    this.fogFar = fogFar
    this.skyC.set(SKY[def.id] ?? '#0a0a0c')
    this.outK = 0
    this.tintK = 0
    this.ambientBase = 0.09 + def.darkness * 0.06
    this.hemiBase = 0.12 + def.darkness * 0.06
    this.hemi.color.set(col(pal.wallTop).lerp(col('#9aa2b0'), 0.5))
    this.hemi.groundColor.set(col(pal.floor).multiplyScalar(0.8))
  }

  // ---------- v17：无限模式 chunk 同步（分帧构建、远离卸载、平移只动 position）----------
  private syncInfinite(m: GameMap, def: LevelDef, p: { x: number; y: number }) {
    const inf = m.inf!
    // 全图变化（红室蔓延）：卸载全部已构建 chunk，按新着色重建
    const redo = inf.redo ?? 0
    if (redo !== this.chunkRedo) {
      this.chunkRedo = redo
      for (const [, cg] of this.chunkGroups) {
        this.scene.remove(cg.group)
        cg.group.traverse((o) => {
          const mm = o as THREE.Mesh
          if (mm.geometry) mm.geometry.dispose()
        })
        for (const s of cg.structs) this.structMeshes.delete(s)
        this.fixtures = this.fixtures.filter((f) => !cg.fixtures.includes(f))
        this.exitMeshes = this.exitMeshes.filter((e) => !cg.exitMeshes.includes(e))
      }
      this.chunkGroups.clear()
    }
    const want = new Set<string>()
    const queue: LiveChunk[] = []
    for (const c of inf.chunks.values()) {
      want.add(c.key)
      const wx = c.cx * CS - inf.ox, wy = c.cy * CS - inf.oy
      const cg = this.chunkGroups.get(c.key)
      if (!cg) { queue.push(c); continue }
      if (cg.wx !== wx || cg.wy !== wy) {
        // 窗口平移：chunk 几何为烘焙绝对坐标 → 子节点整体位移，无需重建
        const ddx = wx - cg.wx, ddy = wy - cg.wy
        for (const ch of cg.group.children) { ch.position.x += ddx; ch.position.z += ddy }
        cg.wx = wx; cg.wy = wy
      }
    }
    // 卸载远离 chunk（控制内存与 drawcall）
    for (const [key, cg] of this.chunkGroups) {
      if (want.has(key)) continue
      this.scene.remove(cg.group)
      cg.group.traverse((o) => {
        const mm = o as THREE.Mesh
        if (mm.geometry) mm.geometry.dispose()
      })
      for (const s of cg.structs) this.structMeshes.delete(s)
      this.fixtures = this.fixtures.filter((f) => !cg.fixtures.includes(f))
      this.exitMeshes = this.exitMeshes.filter((e) => !cg.exitMeshes.includes(e))
      this.chunkGroups.delete(key)
    }
    // 分帧构建新 chunk（初始满编一次构建；平移增量每帧≤2，移动端流畅）
    queue.sort((a, b) =>
      (Math.abs(a.cx * CS - inf.ox - p.x) + Math.abs(a.cy * CS - inf.oy - p.y)) -
      (Math.abs(b.cx * CS - inf.ox - p.x) + Math.abs(b.cy * CS - inf.oy - p.y)))
    const budget = this.chunkGroups.size === 0 && queue.length > WIN_CHUNKS ? queue.length : 2
    for (const c of queue.slice(0, budget)) this.buildInfiniteChunk(m, def, c)
  }

  // v29：闪烁的墙壁——出口面片贴到相邻墙面（面向出口所在地板格；无相邻墙时保持居中）
  private orientExitToWall(m: GameMap, grp: THREE.Group, e: { x: number; y: number }) {
    const tx = Math.floor(e.x), ty = Math.floor(e.y)
    const at = (x: number, y: number) => (x < 0 || y < 0 || x >= m.w || y >= m.h ? 0 : m.tiles[y * m.w + x])
    const dirs = [
      { dx: 1, dy: 0, rot: -Math.PI / 2 }, // 墙在 +x：面片法线朝 -x
      { dx: -1, dy: 0, rot: Math.PI / 2 },
      { dx: 0, dy: 1, rot: Math.PI },
      { dx: 0, dy: -1, rot: 0 },
    ]
    for (const d of dirs) {
      if (at(tx + d.dx, ty + d.dy) === 1) continue // 该侧不是墙
      grp.rotation.y = d.rot
      grp.position.set(e.x + 0.5 + d.dx * 0.48, 0, e.y + 0.5 + d.dy * 0.48)
      return
    }
    grp.position.set(e.x + 0.5, 0, e.y + 0.5)
  }

  // v29：可行走阶梯朝向——踏步伸向邻墙且反侧 4 格畅通的方向（与引擎 updateStairs 同优先级；兜底第一面墙）
  private orientStairs(m: GameMap, grp: THREE.Group, e: { x: number; y: number }) {
    const tx = Math.floor(e.x), ty = Math.floor(e.y)
    const at = (x: number, y: number) => (x < 0 || y < 0 || x >= m.w || y >= m.h ? 0 : m.tiles[y * m.w + x])
    const solidAt = (x: number, y: number) => m.structures.some((s) => s.solid && x >= s.x && x < s.x + s.w && y >= s.y && y < s.y + s.h)
    const sides: [number, number][] = []
    for (const [wx, wy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      if (at(tx + wx, ty + wy) === 1) continue
      sides.push([wx, wy])
      let clear = true
      for (let k = 1; k <= 4; k++) if (at(tx - wx * k, ty - wy * k) !== 1 || solidAt(tx - wx * k, ty - wy * k)) { clear = false; break }
      if (clear) { grp.rotation.y = Math.atan2(wx, wy); grp.position.set(e.x + 0.5, 0, e.y + 0.5); return }
    }
    if (sides.length) grp.rotation.y = Math.atan2(sides[0][0], sides[0][1])
    grp.position.set(e.x + 0.5, 0, e.y + 0.5)
  }

  // v30：门类出口（楼梯井/未上锁的门）——组移到墙格中心（geometry 已在该墙格开门洞），开口朝向出口格
  private orientDoor(m: GameMap, grp: THREE.Group, e: { x: number; y: number }) {
    const tx = Math.floor(e.x), ty = Math.floor(e.y)
    const at = (x: number, y: number) => (x < 0 || y < 0 || x >= m.w || y >= m.h ? 0 : m.tiles[y * m.w + x])
    for (const [wx, wy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      if (at(tx + wx, ty + wy) === 1) continue
      grp.rotation.y = Math.atan2(wx, wy) // 局部 -z（开口）转向出口格
      grp.position.set(e.x + 0.5 + wx, 0, e.y + 0.5 + wy) // 墙格中心
      return
    }
    grp.position.set(e.x + 0.5, 0, e.y + 0.5)
  }

  private buildInfiniteChunk(m: GameMap, def: LevelDef, c: LiveChunk) {
    const inf = m.inf!
    const H = this.wallH
    const g = new THREE.Group()
    const wx = c.cx * CS - inf.ox, wy = c.cy * CS - inf.oy
    const range = { x0: wx, y0: wy, x1: wx + CS, y1: wy + CS }
    buildTerrain(m, def, H, g, range)
    // 结构（对象身份跨平移保持，structMeshes 引用稳定）
    const structs: Structure[] = []
    for (const s of c.structures) {
      const mesh = buildStructure(s, def, m, H)
      if (mesh) {
        const gy = tileH(m, Math.min(m.w - 1, Math.max(0, Math.floor(s.x + s.w / 2))), Math.min(m.h - 1, Math.max(0, Math.floor(s.y + s.h / 2))))
        ;(mesh as THREE.Group).position.y += gy
        g.add(mesh as THREE.Group)
        this.structMeshes.set(s, mesh as THREE.Group)
        structs.push(s)
      }
    }
    // 灯具（L0 全室内：自发光盒）
    const fixtures: { mat: THREE.MeshBasicMaterial; seed: number }[] = []
    for (const L of c.lights) {
      const mat = new THREE.MeshBasicMaterial({ color: L.color })
      mat.userData.base = col(L.color)
      const fix = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.08, 0.25), mat)
      fix.position.set(L.x, L.z !== undefined ? L.z + 2.55 : H - 0.05, L.y)
      g.add(fix)
      fixtures.push({ mat, seed: L.flickerSeed })
    }
    // 出口（闪烁的墙壁：strobe 规律明灭材质）
    const exitMeshes: { mesh: THREE.Object3D; mat: THREE.MeshBasicMaterial }[] = []
    for (const e of c.exits) {
      const grp = buildExit(e.def.kind, def)
      if (e.def.kind === 'flickerdoor') this.orientExitToWall(m, grp, e)
      else if (e.def.kind === 'graystairs' || e.def.kind === 'graystairsup') this.orientStairs(m, grp, e)
      else if (e.def.kind === 'stairs' || e.def.kind === 'unlockeddoor') this.orientDoor(m, grp, e)
      else grp.position.set(e.x + 0.5, 0, e.y + 0.5)
      g.add(grp)
      grp.traverse((o) => {
        const mm = o as THREE.Mesh
        const mat = mm.material as THREE.MeshBasicMaterial
        if (mat && mat.userData && (mat.userData.pulse || mat.userData.strobe)) exitMeshes.push({ mesh: mm, mat })
      })
    }
    // 装饰（chunk 范围）
    buildDecorations(m, def, H, g, fixtures, range)
    this.enableShadows(g)
    this.scene.add(g)
    this.chunkGroups.set(c.key, { group: g, wx, wy, structs, fixtures, exitMeshes })
    this.fixtures.push(...fixtures)
    this.exitMeshes.push(...exitMeshes)
  }

  // ---------- 构建层级 ----------
  private buildLevel(m: GameMap, def: LevelDef) {
    this.teardown()
    this.builtMap = m
    this.levelCfg = def
    this.wallH = WALL_H[def.gen] ?? 3

    const g = new THREE.Group()
    const pal = def.palette
    const H = this.wallH

    // 雾与背景（v10：near 推远至 2m、far 保底 ~15m，黑暗中近距离几何不再被雾整段吞掉）
    const fogC = col(pal.floor).multiplyScalar(0.12)
    if (def.gen === 'hotel') fogC.set('#0c0507')
    const fogFar = 19 - def.darkness * 6
    this.scene.fog = new THREE.Fog(fogC, 2.0, fogFar)
    this.scene.background = new THREE.Color().copy(fogC)
    // v7：室外混合基准（render() 每帧按玩家位置 lerp）
    this.fogC.copy(fogC)
    this.fogNear = 2.0
    this.fogFar = fogFar
    this.skyC.set(SKY[def.id] ?? '#0a0a0c')
    this.outK = 0
    // v10：层级最低环境光/半球光基准（darkness 越高兜底越亮，保证 10m 内结构轮廓可辨）
    this.ambientBase = 0.09 + def.darkness * 0.06
    this.hemiBase = 0.12 + def.darkness * 0.06
    this.hemi.color.set(col(pal.wallTop).lerp(col('#9aa2b0'), 0.5))
    this.hemi.groundColor.set(col(pal.floor).multiplyScalar(0.8))


    // ---- 地形（地面/台阶/接缝/天花板/风道/多层楼板/墙体，见 geometry.ts）----
    buildTerrain(m, def, H, g)


    // ---- 室外天空/远景剪影 + 液体水面（见 liquidsSky.ts）----
    buildSkyAndLiquids(m, def, g)


    // ---- 结构 ----
    this.structMeshes.clear()
    for (const s of m.structures) {
      const mesh = buildStructure(s, def, m, H)
      if (mesh) {
        // v7：结构模型按所在地面高度偏移（高台/低洼上的家具贴合地面）；v13：上层结构抬升 FLOOR_H
        const gy = s.floor === 1 ? 3.0
          : tileH(m, Math.min(m.w - 1, Math.max(0, Math.floor(s.x + s.w / 2))), Math.min(m.h - 1, Math.max(0, Math.floor(s.y + s.h / 2))))
        ;(mesh as THREE.Group).position.y += gy
        g.add(mesh as THREE.Group)
        this.structMeshes.set(s, mesh as THREE.Group)
      }
    }

    // ---- 灯具（自发光盒；室外=路灯杆）----
    for (const L of m.lights) {
      const mat = new THREE.MeshBasicMaterial({ color: L.color })
      mat.userData.base = col(L.color)
      const li = Math.floor(L.y) * m.w + Math.floor(L.x)
      if (m.outdoor[li] === 1) {
        // 路灯：灯杆 + 灯头
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.06, 2.8, 6), new THREE.MeshLambertMaterial({ color: '#23262a' }))
        pole.position.set(L.x, 1.4, L.y)
        g.add(pole)
        const head = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.12, 0.22), mat)
        head.position.set(L.x, 2.84, L.y)
        g.add(head)
        this.fixtures.push({ mat, seed: L.flickerSeed })
        continue
      }
      const fix = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.08, 0.25), mat)
      fix.position.set(L.x, (L.z !== undefined ? L.z + 2.55 : H - 0.05), L.y)
      g.add(fix)
      this.fixtures.push({ mat, seed: L.flickerSeed })
    }

    // ---- 出口 ----
    for (const e of m.exits) {
      const grp = buildExit(e.def.kind, def)
      if (e.def.kind === 'flickerdoor') this.orientExitToWall(m, grp, e)
      else if (e.def.kind === 'graystairs' || e.def.kind === 'graystairsup') this.orientStairs(m, grp, e)
      else if (e.def.kind === 'stairs' || e.def.kind === 'unlockeddoor') this.orientDoor(m, grp, e)
      else grp.position.set(e.x + 0.5, 0, e.y + 0.5)
      g.add(grp)
      grp.traverse((o) => {
        const mm = o as THREE.Mesh
        const mat = mm.material as THREE.MeshBasicMaterial
        if (mat && mat.userData && mat.userData.pulse) this.exitMeshes.push({ mesh: mm, mat })
      })
    }

    // ---- 层级装饰（纯氛围贴花 + 低模道具）----
    buildDecorations(m, def, H, g, this.fixtures)

    this.levelGroup = g
    this.enableShadows(g)
    this.scene.add(g)
  }

  private updateEntities(engine: Engine, dt: number) {
    const m = engine.map!
    const seen = new Set<number>()
    for (const e of m.entities) {
      seen.add(e.id)
      let grp = this.entityMeshes.get(e.id)
      if (!grp) {
        grp = e.disguised ? buildItemMesh(e.disguised) : buildEntityMesh(e.def.type)
        grp.userData.wasDisguised = !!e.disguised
        this.enableShadows(grp)
        this.entityMeshes.set(e.id, grp)
        this.scene.add(grp)
      }
      if (!e.disguised && grp.userData.wasDisguised) {
        // 现形
        this.scene.remove(grp)
        grp = buildEntityMesh(e.def.type)
        grp.userData.wasDisguised = false
        this.entityMeshes.set(e.id, grp)
        this.scene.add(grp)
      }
      const gz = e.z ?? groundHeightAt(m, e.x, e.y) // v7/v13：实体站在地面高度上（含上层/楼梯坡道）
      grp.position.set(e.x, gz, e.y)
      // 朝向：模型面向 +x
      grp.rotation.y = -e.facing
      grp.rotation.x = 0
      grp.scale.setScalar(1)
      // 动画：状态机驱动的程序化骨骼动画
      const t = this.time + e.id
      const parts = grp.userData.parts as Record<string, THREE.Object3D> | undefined
      const chase = e.state === 'chase' || e.state === 'attack'
      const gaitAmp = e.state === 'wander' || e.state === 'investigate' ? 0.45 : chase ? 0.75 : 0
      const gait = e.animT * 5.5
      const et = e.def.type
      const lunging = e.lungeT > 0
      const lk = Math.max(0, e.lungeT) / 0.32 // 攻击前摇 1 → 0（>0.45 蓄力 / ≤0.45 出手）
      if (et === 'deathmoth') {
        grp.position.y = gz + 0.9 + Math.sin(t * 3.1) * 0.25 // 飞行悬停（攻击俯冲在下方攻击分支叠加）
      } else if (et === 'smiler' || et === 'arcwraith') {
        grp.position.y = gz + 0.15 + Math.sin(t * 2.2) * 0.12
      } else if (!e.def.stationary) {
        grp.position.y = gz + Math.abs(Math.sin(gait)) * gaitAmp * 0.12
      }
      if (parts) {
        // 四肢摆动（行走循环）：双足左右交替；猎犬四足对角步态
        if (et === 'hound') {
          const g2 = e.animT * 7 // 猎犬步频更快
          parts.legL!.rotation.z = Math.sin(g2) * gaitAmp * 0.9 // 后左 + 前右
          parts.armR!.rotation.z = Math.sin(g2) * gaitAmp * 0.9
          parts.legR!.rotation.z = -Math.sin(g2) * gaitAmp * 0.9 // 后右 + 前左
          parts.armL!.rotation.z = -Math.sin(g2) * gaitAmp * 0.9
          if (parts.tail) parts.tail.rotation.y = Math.sin(t * (chase ? 9 : 4)) * 0.5 // 摆尾
        } else {
          if (parts.legL) parts.legL.rotation.x = Math.sin(gait) * gaitAmp
          if (parts.legR) parts.legR.rotation.x = -Math.sin(gait) * gaitAmp
          if (parts.armL && e.state !== 'attack' && et !== 'clump') parts.armL.rotation.x = -Math.sin(gait) * gaitAmp * 0.8
          if (parts.armR && e.state !== 'attack' && et !== 'clump') parts.armR.rotation.x = Math.sin(gait) * gaitAmp * 0.8
        }
        // 运输车：车轮滚动（移动时）
        if (et === 'carrier') {
          const spin = gaitAmp > 0 ? e.animT * 6 : 0
          for (const w of ['wheelFL', 'wheelFR', 'wheelBL', 'wheelBR']) if (parts[w]) parts[w].rotation.y = spin
          if (parts.torso && e.state !== 'attack' && !e.dead) parts.torso.rotation.z = 0 // 非冲撞时车身回正
        }
        // idle：呼吸 + 张望 + 各实体小动作
        if (e.state === 'idle' || e.state === 'wander') {
          if (parts.torso && et !== 'carrier') parts.torso.scale.y = 1 + Math.sin(t * 1.8) * 0.02
          if (parts.head) parts.head.rotation.y = Math.sin(t * 0.55) * 0.4
          if (et === 'faceling' && parts.armR) parts.armR.rotation.x = -0.5 + Math.sin(t * 3.2) * 0.12 // 习惯性敲键
          if (et === 'bellhop' && parts.torso) parts.torso.rotation.x = 0.08 + Math.sin(t * 1.1) * 0.06 // 殷勤微躬
          if (et === 'duller') { // 垂臂慢晃
            if (parts.armL) parts.armL.rotation.x = Math.sin(t * 1.2) * 0.08
            if (parts.armR) parts.armR.rotation.x = -Math.sin(t * 1.2) * 0.08
          }
        } else {
          if (parts.head) parts.head.rotation.y = 0
          if (et === 'bellhop' && parts.torso) parts.torso.rotation.x = 0 // 脱离待机时收躬
        }
        if (parts.antL) { parts.antL.rotation.z = 0.6 + Math.sin(t * 6) * 0.12; parts.antR!.rotation.z = 0.6 + Math.cos(t * 5.3) * 0.12 } // 飞蛾触角抖动
        // 死亡飞蛾：双翼扇动（悬停慢扇 / 追击狂扇）
        if (et === 'deathmoth' && parts.wingL && parts.wingR) {
          const f = 0.25 + Math.sin(t * (chase ? 26 : 13)) * (chase ? 0.7 : 0.5)
          parts.wingL.rotation.x = -f
          parts.wingR.rotation.x = f
        }
        // 电弧体：核心旋转脉冲 + 电屑公转
        if (parts.core) { parts.core.rotation.y = t * 3; parts.core.rotation.x = t * 1.7 }
        if (et === 'arcwraith') {
          for (let i = 0; i < 4; i++) {
            const s = parts[`shard${i}`]
            if (s) {
              const a = t * (chase ? 5 : 2.4) + (i * Math.PI) / 2
              s.position.set(Math.cos(a) * 0.45, 1.2 + Math.sin(t * 3 + i) * 0.15, Math.sin(a) * 0.45)
              s.rotation.y = -a
            }
          }
        }
        // 复印机幽灵：漂浮纸张翻飞
        if (parts.sheet) { parts.sheet.rotation.y = t * 1.4; parts.sheet.position.y = 1.0 + Math.sin(t * 2.2) * 0.12 }
        // 蠕虫：分节蠕动
        for (let i = 0; i < 6; i++) {
          const seg = parts[`seg${i}`]
          if (seg) seg.position.y = 0.35 + Math.sin(t * 6 - i * 0.9) * 0.12
        }
        // 追击：躯干前倾。朝向约定：模型正面=+X；facesZ 模型（原 +Z 建造、外包旋转层）
        // 的躯干在模型空间内前倾=绕本地 x 正转，+X 模型前倾=绕本地 z 负转
        if (parts.torso && et !== 'carrier' && et !== 'bellhop') {
          if (grp.userData.facesZ) { parts.torso.rotation.x = chase ? 0.16 : 0; parts.torso.rotation.z = 0 }
          else parts.torso.rotation.z = chase ? -0.16 : 0
        }
        // 猎犬：追击时压低身位（爬行姿态）
        if (et === 'hound' && parts.torso) parts.torso.position.y = chase ? 0.45 : 0.55
        // 团块：手臂与触手持续抓挠蠕动
        if (et === 'clump') {
          if (parts.armL && e.state !== 'attack') parts.armL.rotation.x = Math.sin(t * 2.6) * 0.5 - 0.3
          if (parts.armR && e.state !== 'attack') parts.armR.rotation.x = Math.cos(t * 2.1) * 0.5 - 0.3
          for (const tp of ['t1', 't2', 't3']) if (parts[tp]) parts[tp].rotation.x = Math.sin(t * 2.2 + tp.charCodeAt(1)) * 0.45
        }
        // ---------- 攻击前摇（每种实体专属姿态）----------
        if (e.state === 'attack') {
          const wind = lk > 0.45 ? (1 - lk) / 0.55 : 0 // 蓄力 0→1
          const strike = lk <= 0.45 ? 1 - lk / 0.45 : 0 // 出手 0→1
          if (et === 'hound') {
            // 后坐蓄力 → 前扑：躯干俯仰 + 前肢扬起 + 整体前冲
            if (parts.torso) parts.torso.rotation.z = wind * 0.35 - strike * 0.4
            if (parts.armL) parts.armL.rotation.z = -wind * 1.2 + strike * 0.6
            if (parts.armR) parts.armR.rotation.z = -wind * 1.2 + strike * 0.6
            grp.position.x += Math.cos(e.facing) * strike * 0.35
            grp.position.z += -Math.sin(e.facing) * strike * 0.35
          } else if (et === 'carrier') {
            // 鸣笛蓄力（车灯爆闪 + 车尾微翘）→ 冲撞前蹿（车头下压，前倾轴=本地 z，与正面 +X 约定一致）
            const fl = 1 + wind * 1.5 + strike * 0.5
            for (const h of ['hlL', 'hlR']) if (parts[h]) parts[h].scale.setScalar(fl)
            if (parts.torso) parts.torso.rotation.z = wind * 0.04 - strike * 0.09
            grp.position.x += Math.cos(e.facing) * strike * 0.4
            grp.position.z += -Math.sin(e.facing) * strike * 0.4
          } else if (et === 'pipeworm') {
            // 蜷缩蓄力 → 弹射前咬
            for (let i = 0; i < 6; i++) {
              const seg = parts[`seg${i}`]
              if (seg) seg.position.x = -i * 0.3 * (1 - wind * 0.35) + strike * (0.35 - i * 0.05)
            }
            if (parts.mouth) parts.mouth.scale.setScalar(1 + strike * 0.5)
          } else if (et === 'deathmoth') {
            // 拉升蓄力 → 俯冲扑脸
            grp.position.y += wind * 0.5 - strike * 0.9
            if (parts.wingL) { parts.wingL.rotation.x = -0.9; parts.wingR!.rotation.x = 0.9 }
          } else if (et === 'smiler') {
            // 狞笑扩张 → 猛扑
            if (parts.teeth) parts.teeth.scale.set(wind * 0.6 + strike * 0.5 + 1, 1 + wind * 0.9, 1)
            grp.position.x += Math.cos(e.facing) * strike * 0.3
            grp.position.z += -Math.sin(e.facing) * strike * 0.3
          } else if (et === 'arcwraith') {
            // 电屑外放 + 核心过载
            if (parts.core) parts.core.scale.setScalar(1 + wind * 0.3 + strike * 0.4)
            for (let i = 0; i < 4; i++) {
              const s = parts[`shard${i}`]
              if (s) { const a = t * 6 + (i * Math.PI) / 2; s.position.set(Math.cos(a) * (0.45 + strike * 0.5), 1.2, Math.sin(a) * (0.45 + strike * 0.5)) }
            }
          } else if (et === 'clump' && parts.armL && parts.armR) {
            // 双臂前探抓拖
            parts.armL.rotation.x = -wind * 0.6 - strike * 1.1
            parts.armR.rotation.x = -wind * 0.6 - strike * 1.1
          } else if (parts.armL && parts.armR) {
            // 双足人形通用：双臂高举过头，出手瞬间下劈
            const raise = lk > 0.45 ? (1 - lk) * 2 * -1.7 : -1.7 + (0.45 - lk) * 4.5
            parts.armL.rotation.z = -raise
            parts.armR.rotation.z = raise
            parts.armL.rotation.x = 0; parts.armR.rotation.x = 0
          }
        } else if (parts.armL && parts.armR && et !== 'clump' && et !== 'hound') {
          parts.armL.rotation.z = 0; parts.armR.rotation.z = 0
        }
      }
      // 攻击前摇整体缩放 + 受击硬直抖动
      if (lunging) grp.scale.setScalar(1.14)
      if (e.stunT > 0) grp.rotation.z = Math.sin(this.time * 40) * 0.1
      else grp.rotation.z = 0
      // ---------- 死亡动画（按实体差异化）----------
      if (e.dead) {
        const k = Math.max(0, e.deathT) / 1.4 // 1 → 0
        const d = 1 - k
        grp.rotation.y = -e.facing
        if (et === 'smiler' || et === 'copierwraith' || et === 'arcwraith') {
          // 消散：上浮 + 旋转 + 坍缩
          grp.position.y = gz + d * 1.3
          grp.rotation.y += d * 4
          grp.scale.setScalar(Math.max(0.01, k))
        } else if (et === 'deathmoth') {
          // 螺旋坠地
          grp.position.y = gz + 0.9 * k
          grp.rotation.y += d * 6
          grp.rotation.z = d * 0.9
        } else if (et === 'hound') {
          // 侧翻瘫倒、四肢抽搐收拢
          grp.rotation.z = d * 1.55
          grp.position.y = gz + 0.1 - d * 0.05
          if (parts) for (const l of ['legL', 'legR', 'armL', 'armR']) if (parts[l]) parts[l].rotation.z = d * 1.1
        } else if (et === 'carrier') {
          // 侧倾熄火：车灯渐灭
          grp.rotation.z = d * 0.32
          grp.position.y = gz - d * 0.12
          if (parts?.torso) parts.torso.rotation.z = 0 // 车身俯仰回正，避免死亡时残留冲撞前倾
          if (parts) for (const h of ['hlL', 'hlR']) if (parts[h]) parts[h].scale.setScalar(Math.max(0.05, k))
        } else if (et === 'pipeworm') {
          // 瘫扁沉回地里
          grp.scale.set(1, Math.max(0.05, k), 1)
          grp.position.y = gz - d * 0.28
        } else if (et === 'clump') {
          // 瘫软摊开
          grp.scale.set(1 + d * 0.35, Math.max(0.05, k), 1 + d * 0.35)
          grp.position.y = gz - d * 0.1
        } else if (et === 'seated') {
          // 瘫倒在前方扶手
          if (parts?.torso) parts.torso.rotation.x = d * 0.85
          if (parts?.head) parts.head.rotation.x = d * 0.6
          grp.position.y = gz - d * 0.06
        } else {
          // 人形通用：倒地 + 下沉
          grp.rotation.z = -d * 1.5
          grp.position.y = gz - d * 0.25
          grp.scale.setScalar(Math.max(0.01, k))
        }
      }
    }
    for (const [id, grp] of this.entityMeshes) {
      if (!seen.has(id)) {
        this.scene.remove(grp)
        this.entityMeshes.delete(id)
      }
    }
    // 低理智幻影：半透明黑影
    while (this.fakeMeshes.length < engine.fakes.length) {
      const g = new THREE.Group()
      g.add(box(0.5, 1.8, 0.3, '#050505', 0, 0.9, 0))
      g.add(glow(0.06, 0.06, 0.06, '#7a6fd0', -0.1, 1.6, 0.16))
      g.add(glow(0.06, 0.06, 0.06, '#7a6fd0', 0.1, 1.6, 0.16))
      this.scene.add(g)
      this.fakeMeshes.push(g)
    }
    while (this.fakeMeshes.length > engine.fakes.length) {
      this.scene.remove(this.fakeMeshes.pop()!)
    }
    engine.fakes.forEach((f, i) => {
      const g = this.fakeMeshes[i]
      g.position.set(f.x, Math.sin(this.time * 3 + i) * 0.15 + 0.1, f.y)
      g.rotation.y = Math.atan2(engine.player.x - f.x, engine.player.y - f.y)
      g.visible = f.t > 0.4 ? Math.sin(this.time * 9 + i) > -0.6 : true
    })
    void dt
  }

  private updateItems(engine: Engine, _dt: number) {
    const m = engine.map!
    const seen = new Set<number>()
    for (const it of m.items) {
      const id = Math.round(it.id * 1000) % 100000000
      seen.add(id)
      let grp = this.itemMeshes.get(id)
      if (!grp) {
        grp = buildItemMesh(it.type)
        grp.userData.phase = Math.random() * Math.PI * 2
        this.enableShadows(grp)
        this.itemMeshes.set(id, grp)
        this.scene.add(grp)
      }
      grp.position.set(it.x, (it.z ?? groundHeightAt(m, it.x, it.y)) + 0.45 + Math.sin(this.time * 1.6 + grp.userData.phase) * 0.08, it.y)
      grp.rotation.y = this.time * 0.9 + grp.userData.phase
    }
    for (const [id, grp] of this.itemMeshes) {
      if (!seen.has(id)) { this.scene.remove(grp); this.itemMeshes.delete(id) }
    }
  }

  // 飞行中的投掷物：复用物品低模（去掉地面光环），快速翻滚
  private updateProjectiles(engine: Engine) {
    const seen = new Set<number>()
    for (const pr of engine.projectiles) {
      seen.add(pr.id)
      let grp = this.projMeshes.get(pr.id)
      if (!grp) {
        grp = new THREE.Group()
        const src = buildItemMesh(pr.type)
        for (const ch of [...src.children]) {
          if ((ch as THREE.Mesh).geometry?.type === 'RingGeometry') continue // 地面光环：飞行中不显示
          grp.add(ch)
        }
        this.enableShadows(grp)
        this.projMeshes.set(pr.id, grp)
        this.scene.add(grp)
      }
      grp.position.set(pr.x, pr.z + 0.25, pr.y)
      grp.rotation.x = this.time * 12
      grp.rotation.y = this.time * 9
    }
    for (const [id, grp] of this.projMeshes) {
      if (!seen.has(id)) { this.scene.remove(grp); this.projMeshes.delete(id) }
    }
  }

  // 墙上的粉笔记号：几道白色涂抹（Basic 材质，无光照也可见——Level 6 黑暗中充当路标）
  private buildChalkMark(): THREE.Group {
    const g = new THREE.Group()
    const mat = new THREE.MeshBasicMaterial({ color: '#e8e2d2', transparent: true, opacity: 0.92 })
    const mk = (w: number, h: number, x: number, y: number, rz: number) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat)
      m.position.set(x, y, 0)
      m.rotation.z = rz
      g.add(m)
    }
    mk(0.4, 0.055, 0, 0.02, 0.08) // 主涂抹
    mk(0.26, 0.045, -0.04, -0.06, -0.12) // 副涂抹
    mk(0.14, 0.04, 0.1, 0.1, 0.3) // 上扬短划
    return g
  }

  private updateWallMarks(engine: Engine) {
    const m = engine.map!
    const ox = m.inf ? m.inf.ox : 0, oy = m.inf ? m.inf.oy : 0
    const seen = new Set<string>()
    for (const mk of engine.wallMarks) {
      if (mk.level !== engine.player.level) continue
      const key = `${mk.wx},${mk.wy},${mk.dir}`
      seen.add(key)
      let grp = this.markMeshes.get(key)
      if (!grp) {
        grp = this.buildChalkMark()
        this.markMeshes.set(key, grp)
        this.scene.add(grp)
      }
      const nx = [1, -1, 0, 0][mk.dir], ny = [0, 0, 1, -1][mk.dir]
      // 贴在墙面（tile 边界）朝向玩家一侧，略浮出表面避免 z-fighting
      grp.position.set(mk.wx - ox + 0.5 + nx * 0.49, 1.5, mk.wy - oy + 0.5 + ny * 0.49)
      grp.rotation.y = Math.atan2(nx, ny)
    }
    for (const [key, grp] of this.markMeshes) {
      if (!seen.has(key)) { this.scene.remove(grp); this.markMeshes.delete(key) }
    }
  }

  // ---------- 容器盖板/门开关/状态动画 ----------
  private updateStructs(dt: number) {
    for (const [s, g] of this.structMeshes) {
      const k0 = s.kind
      // v13：电梯轿厢平台跟随引擎 carZ 平滑升降
      if (k0 === 'lift') {
        const car = g.userData.car as THREE.Group | undefined
        if (car) {
          const target = (s.data?.carZ as number | undefined) ?? ((s.data?.car as number | undefined) === 1 ? 3.0 : 0)
          car.position.y += (target - car.position.y) * Math.min(1, dt * 4)
        }
        continue
      }
      if (k0 !== 'crate' && k0 !== 'car' && k0 !== 'cabinet' && k0 !== 'corpse'
        && k0 !== 'hoteldoor' && k0 !== 'dresser' && k0 !== 'megcrate'
        && k0 !== 'rollerdoor' && k0 !== 'glassdoor' && k0 !== 'inkdoor') continue
      const target = (k0 === 'hoteldoor' || k0 === 'rollerdoor' || k0 === 'glassdoor' || k0 === 'inkdoor') ? (s.data?.open ? 1 : 0) : (s.data?.opened ? 1 : 0)
      g.userData.open = (g.userData.open ?? 0) + (target - (g.userData.open ?? 0)) * Math.min(1, dt * (k0 === 'hoteldoor' ? 4 : 6))
      const k = g.userData.open as number
      for (const ch of g.children) {
        if (!ch.userData.lid) continue
        if (k0 === 'crate' || k0 === 'car' || k0 === 'megcrate') ch.rotation.x = -k * 1.9
        else if (k0 === 'cabinet' || k0 === 'dresser') ch.rotation.y = k * 1.9
        else if (k0 === 'hoteldoor') ch.rotation.y = -k * 1.55 * ((g.userData.swing as number) ?? 1) // v10：铰链门向门洞内侧旋开 ~89°（不穿侧墙；双开门镜像对开）
        else if (k0 === 'rollerdoor') { ch.position.y = k * 1.85; ch.scale.y = 1 - k * 0.8 } // v10：卷帘收进卷轴盒（不再悬穿门头/天花板）
        else if (k0 === 'glassdoor') ch.position.x = k * 0.95 // v10：玻璃门侧滑入墙袋（不再悬在半空）
        else if (k0 === 'inkdoor') ch.rotation.y = k * 1.85 // v31：墨黑色金属门向走廊内侧旋开 ~106°
        else ch.position.x = k * 0.8 // 尸体盖布滑开
      }
      // 搜空后变暗（状态可见）
      if (s.looted && !g.userData.dimmed) {
        g.userData.dimmed = true
        g.traverse((o) => {
          const mm = o as THREE.Mesh
          const mat = mm.material as THREE.MeshLambertMaterial
          if (mat && mat.color) mat.color.multiplyScalar(0.55)
        })
      }
    }
  }

  // ---------- 引擎粒子 → Points ----------
  private updateParticles(engine: Engine, _dt: number) {
    const pos = this.particlesGeo.attributes.position as THREE.BufferAttribute
    const colA = this.particlesGeo.attributes.color as THREE.BufferAttribute
    const pts = engine.particles.slice(-120)
    const c = new THREE.Color()
    for (let i = 0; i < 120; i++) {
      const pt = pts[i]
      if (pt) {
        const fade = 1 - pt.t / pt.life
        pos.setXYZ(i, pt.x, pt.z !== undefined ? pt.z : 0.5 + (pt.vy < 0 ? pt.t * 1.5 : pt.size * 0.04), pt.y)
        if (pt.color.startsWith('#')) c.set(pt.color)
        else c.setRGB(0.8, 0.75, 0.7)
        colA.setXYZ(i, c.r * fade, c.g * fade, c.b * fade)
      } else {
        pos.setXYZ(i, 0, -10, 0)
        colA.setXYZ(i, 0, 0, 0)
      }
    }
    pos.needsUpdate = true
    colA.needsUpdate = true
  }

  // ---------- 层级氛围特效 ----------
  private updateAmbientFx(engine: Engine, def: LevelDef, dt: number) {
    const p = engine.player
    // 灰尘围绕玩家漂浮（设置项 dust 关闭时整体隐藏，不再更新）
    if (this.dust.visible) {
      const dp = this.dust.geometry.attributes.position as THREE.BufferAttribute
      for (let i = 0; i < dp.count; i++) {
        let y = dp.getY(i) + Math.sin(this.time * 0.5 + i) * 0.001
        if (y < 0) y = 3
        dp.setY(i, y > 3 ? 0 : y)
      }
      dp.needsUpdate = true
      this.dust.position.set(p.x, 0, p.y)
      ;(this.dust.material as THREE.PointsMaterial).color.set(def.palette.light)
    }

    // L2 蒸汽柱 / L3 火花：定期在对应结构处喷粒子
    this.steamT -= dt
    if (this.steamT <= 0) {
      this.steamT = def.gen === 'pipes' ? 0.25 : def.gen === 'grid' ? 0.5 : 0.8
      const m = engine.map!
      for (const s of m.structures) {
        const d = Math.hypot(s.x - p.x, s.y - p.y)
        if (d > 12) continue
        if (def.gen === 'pipes' && (s.kind === 'valve' || s.kind === 'pipes' || s.kind === 'boiler') && Math.random() < 0.3) {
          engine.steamParticles(s.x + s.w / 2, s.y + s.h / 2)
        } else if (def.gen === 'grid' && (s.kind === 'cabinet' || s.kind === 'generator') && Math.random() < 0.15) {
          for (let i = 0; i < 4; i++) {
            const a = Math.random() * Math.PI * 2
            engine.particles.push({ x: s.x + s.w / 2, y: s.y + s.h / 2, vx: Math.cos(a) * 1.5, vy: Math.sin(a) * 1.5, t: 0, life: 0.35, color: '#9adfff', size: 2 })
          }
        }
      }
    }
  }

}


// 画布 → 渲染器缓存（避免同一 canvas 重复创建 WebGL 上下文）
const cache = new WeakMap<HTMLCanvasElement, Renderer3D>()
export function getRenderer(canvas: HTMLCanvasElement): Renderer3D {
  let r = cache.get(canvas)
  if (!r) { r = new Renderer3D(canvas); cache.set(canvas, r) }
  return r
}
