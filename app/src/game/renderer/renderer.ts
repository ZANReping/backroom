// Three.js 第一人称低多边形渲染器：主循环（静态几何/灯光池/实体动画编排，构建逻辑见同级模块）
import * as THREE from 'three'
import type { Engine } from '../engine'
import { bandOfPlayerZ, floorHeight, FLOOR_H, tallCeilH, type GameMap } from '../world/mapgen'
import type { GroundItem, LevelDef, Structure, LightSource } from '../core/types'
import { levelDefOf } from '../levels'
import { WALL_H, SKY, col, box, glow, look, mulberry, type RenderOpts } from './shared'
import { buildTerrain } from './geometry'
import { CS, type LiveChunk } from '../world/infinite'
import { buildSkyAndLiquids } from './liquidsSky'
import { SKY_PROFILES, skyLightDir } from './skybox'
import { buildStructure, buildExit } from './structures'
import { buildDecorations } from './decorations'
import { buildEntityMesh } from './entitiesMesh'
import { buildItemMesh } from './itemsMesh'
import { buildViewmodel, buildHeldItem, buildCrosshair, vmat } from './viewmodel'
import { getAvatar, randomAvatar } from '../core/avatar'
import { buildPlayerModel } from './playerModel'
import { npcAvatar } from '../content/npcs'
import { applyNpcGear } from './npcGear'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'
import { envProbe, disposeEnvProbes } from './envProbe'
import { setMaterialMode, setReflectK, getReflectK } from './shared'

// v53：L3 高智能窃皮者「伪装成流浪者」模型——随机人类形象（按实体 id 确定性），
// 与 entitiesMesh 的 +Z 模型同一约定包 π/2 内层组把正面旋到 +X；
// v55：L5 伪装用酒店侍者形象（酒红制服夹克 + 黑裤 + 皮靴，按实体 id 确定性）
function humanDisguiseMesh(id: number, levelId = 3): THREE.Group {
  const grp = new THREE.Group()
  const inner = new THREE.Group()
  inner.rotation.y = Math.PI / 2
  const av = randomAvatar(mulberry((id * 2654435761) >>> 0))
  if (levelId === 5) Object.assign(av, { top: '#6e2a2e', topStyle: 3, pants: '#1c1a1e', pantsStyle: 0, shoes: 2 }) // 侍者制服
  inner.add(buildPlayerModel(av, {}))
  grp.add(inner)
  grp.userData.facesZ = 1
  return grp
}

// ---------- v50：光影模式（realistic=物理光照/反射；classic=现状，可一键退回）----------
export type LightMode = 'classic' | 'realistic'

// v54：容器开启动画注册表——key=kind 白名单，value=open 进度 lerp 速率
// （locker 薄钢门快脆 11 / safebox 厚重门迟缓 2.6 / mailbox 小门轻快 8；binshelf 非搜索容器，仅预留动画约定）
const CONTAINER_ANIM: Record<string, number> = {
  crate: 6, corpse: 6, car: 6, cabinet: 6, dresser: 6, megcrate: 6,
  locker: 11, toolbox: 6, suitcase: 6, fridge: 5, safebox: 2.6, mailbox: 8,
  barrel: 6, bookcase: 6, bonepile: 5, campstall: 6, elecbox: 6, binshelf: 6,
}
// v55c（任务3 性能）：结构动画登记——只有含可动件的结构进 updateStructs 每帧循环
// （门类/容器/电梯轿厢/留声机唱盘/饮料桌）；L5 单窗数百件地毯/灯带/贴墙件的逐帧过滤收敛为一次 userData 读
const ANIM_STRUCT = (s: Structure) =>
  s.kind === 'lift' || s.kind === 'phonograph' || s.kind in CONTAINER_ANIM
  || s.kind === 'hoteldoor' || s.kind === 'rollerdoor' || s.kind === 'glassdoor' || s.kind === 'inkdoor' || s.kind === 'bargate'
  || (s.kind === 'table' && !!s.data?.drink)

// VCR 滤镜着色器：扫描线 + 行跟踪失真带 + 色差串扰 + 隔行微闪 + 噪点 + 抬黑降饱和 + 暗角
const VcrShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    time: { value: 0 },
    resolution: { value: new THREE.Vector2(1, 1) },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float time;
    uniform vec2 resolution;
    varying vec2 vUv;

    float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

    void main() {
      vec2 uv = vUv;

      // 行跟踪失真：每隔几秒随机出现一条向上滚动的失真带，带内水平错位 + 白噪
      float bandSeed = floor(time * 1.4);
      float bandGate = step(0.82, hash(vec2(bandSeed, 3.7)));
      float bandY = fract(time * 0.22 + hash(vec2(bandSeed, 9.1)));
      float band = bandGate * smoothstep(0.06, 0.0, abs(uv.y - bandY));
      uv.x += band * (hash(vec2(floor(uv.y * resolution.y), bandSeed)) - 0.5) * 0.06;

      // 行同步误差：整行细微波形 + 逐行随机抖动
      uv.x += sin(uv.y * resolution.y * 0.8 + time * 8.0) * 0.0006;
      uv.x += (hash(vec2(floor(uv.y * resolution.y), floor(time * 24.0))) - 0.5) * 0.0012;

      // 色差（磁带色彩串扰），带轻微时间摆动；失真带内加剧
      float ab = 0.0018 + 0.0008 * sin(time * 0.9) + band * 0.004;
      vec3 col;
      col.r = texture2D(tDiffuse, uv + vec2(ab, 0.0)).r;
      col.g = texture2D(tDiffuse, uv).g;
      col.b = texture2D(tDiffuse, uv - vec2(ab, 0.0)).b;

      // 隔行扫描微闪（奇偶行交替 ±1%，净亮度不变）
      float field = mod(floor(uv.y * resolution.y) + floor(time * 60.0), 2.0);
      col *= 0.99 + 0.02 * field;

      // 扫描线（明暗相间、平均为零的波纹——保留纹理但不压暗画面）
      col *= 1.0 + 0.05 * cos(uv.y * resolution.y * 6.28318);

      // 磁带色彩：轻度降饱和 + 轻微抬黑（不压暗）
      float lum = dot(col, vec3(0.299, 0.587, 0.114));
      col = mix(col, vec3(lum), 0.12);
      col = col + 0.02;

      // 噪点（暗部更明显）+ 失真带内混入白噪条纹
      float n = hash(uv * resolution + fract(time) * 100.0);
      col += (n - 0.5) * (0.05 + 0.08 * (1.0 - lum));
      col = mix(col, vec3(n), band * 0.25);

      gl_FragColor = vec4(col, 1.0);
    }
  `,
}

// v35：NPC 渲染记录（据点居民；玩家模型 + 制服徽章 + 头顶气泡）
interface NpcMeshRec {
  grp: THREE.Group
  parts: Record<string, THREE.Object3D>
  bubble: THREE.Mesh
  bubbleCanvas: HTMLCanvasElement
  bubbleTex: THREE.CanvasTexture
  text: string
  facing: number
  phase: number
  guitarK: number // v56：乐手乔伊——吉他背姿↔弹奏位姿插值（0=背后 1=身前）
}

export class Renderer3D {
  private three: THREE.WebGLRenderer
  private scene = new THREE.Scene()
  private camera: THREE.PerspectiveCamera
  private levelGroup: THREE.Group | null = null
  private skyMesh: THREE.Mesh | null = null // v35：跟随玩家的天空球（buildSkyAndLiquids 内命名 'skybox'）
  private builtMap: GameMap | null = null
  private builtRev = -1 // 已构建地图的 engine.mapRev（开发者就地改图时触发重建）
  private lightPool: THREE.PointLight[] = []
  private lightPoolExtra: THREE.PointLight[] = [] // v41「远处灯光全开」扩展池（默认不进场景）
  private flash!: THREE.SpotLight
  private lighterLight!: THREE.PointLight // v22：打火机装备效果——玩家周围小火光
  private ambient!: THREE.AmbientLight
  private hemi!: THREE.HemisphereLight
  private sunDir!: THREE.DirectionalLight // v34：日月定向光（室外天空盒配套）
  // v10：按层级 darkness 设定的最低环境光/半球光基准（黑暗中结构轮廓兜底）
  private ambientBase = 0.1
  private hemiBase = 0.12
  private entityMeshes = new Map<number, THREE.Group>()
  // 实体显示朝向缓存（v34：转向平滑过渡——引擎 facing 瞬跳，渲染侧按角速度上限短弧插值）
  private entityFacing = new Map<number, number>()
  // v35：NPC 渲染池（不是实体，独立 Map 驱动）
  private npcMeshes = new Map<string, NpcMeshRec>()
  private itemMeshes = new Map<number, THREE.Group>()
  private projMeshes = new Map<number, THREE.Group>() // 飞行中的投掷物（引擎 projectiles 按 id 对应）
  private markMeshes = new Map<string, THREE.Group>() // 墙上的粉笔记号（key = wx,wy,dir）
  private structMeshes = new Map<Structure, THREE.Group>()
  private interactRaycaster = new THREE.Raycaster()
  private interactRayCenter = new THREE.Vector2(0, 0)
  private interactRayTargets: THREE.Object3D[] = []
  // 仅登记真正需要逐帧更新的门/容器/电梯等；L5 数百个静态装饰不再进入动画循环。
  private animatedStructMeshes = new Map<Structure, THREE.Group>()
  private lightSortScratch: LightSource[] = []
  private lightPowerScratch = new Map<LightSource, number>()
  private fullLightPool: THREE.PointLight[] = []
  private exitMeshes: { mesh: THREE.Object3D; mat: THREE.MeshBasicMaterial }[] = []
  // v17：无限模式（L0）按 chunk 构建的几何组（进入视野构建、远离卸载、平移只动 position）
  private chunkGroups = new Map<string, { group: THREE.Group; wx: number; wy: number; structs: Structure[]; fixtures: { mat: THREE.MeshBasicMaterial; seed: number; src?: LightSource }[]; exitMeshes: { mesh: THREE.Object3D; mat: THREE.MeshBasicMaterial }[] }>()
  private chunkRedo = -1 // 已同步的 inf.redo（红室蔓延等全图变化时全部重建）
  // v17：tint 氛围雾（红室红雾/熄灯区近黑/马尼拉暖调）平滑混合
  private tintK = 0
  private tintC = new THREE.Color('#3a0a08')
  private fakeMeshes: THREE.Group[] = []
  private fixtures: { mat: THREE.MeshBasicMaterial; seed: number; src?: LightSource }[] = []
  private particlesPts!: THREE.Points
  private particlesGeo!: THREE.BufferGeometry
  private dust!: THREE.Points
  // v54：L4 窗景区虚空雨雾（懒初始化——仅 L4 且玩家附近有 outdoor 虚空格时可见）
  private voidRain: THREE.LineSegments | null = null
  private voidRainState: Float32Array | null = null // 每雨丝 (x,y,z,fallSpeed,slant,tileX,tileZ)——钳制在归属瓦片内（不漏进窗内）
  private voidFog: THREE.Mesh[] = []
  private voidTiles: number[] = [] // 玩家附近虚空瓦片索引（窗口局部 ti；雨丝锚点）
  private voidFogTiles: number[] = [] // 非边界虚空瓦片（四邻无室内地板——雾片锚点，保证不越过窗玻璃）
  private voidScanT = 0
  private steamT = 0
  private bobPhase = 0
  // v54：真实视角摇晃（设置开关，默认关闭=保持基础 bob）——幅度平滑/落地下沉回弹状态
  private headBobReal = false
  private bobAmp = 0
  private landT = 0
  private landAmp = 0
  private prevVz = 0
  // v55：空中系数（离地暂停侧摆/roll）与起跳蓄力微沉计时
  private airK = 0
  private jumpDipT = -1
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
  private fogScale = 1 // 设置项：距离雾远近倍率
  private farLights = false // 设置项：远处灯光全开（扩展池进场景）
  private skyC = new THREE.Color('#0a0a0c')
  // L6 暗适应：进入时几乎全黑，视杆细胞逐渐恢复后才获得微弱轮廓感。
  private l6DarkAdapt = 0
  private l6WasActive = false
  private userExposure = 1.45
  private uwK = 0 // v13：水下视野混合（0=水上 1=水下：蓝绿浑浊短视距）
  // v50：光影设置项
  private lightMode: LightMode = 'classic'
  private shadowQuality = 1 // 0=低 1=中 2=高（手电/太阳 shadow map 尺寸与软影半径）
  private sunShadowsOn = true
  private lightShadowCount = 0 // 场景灯投影盏数（最近 N 盏池灯，开销随盏数增加）
  private bloomOn = true
  private bloomStrength = 35 // 泛光程度 0–100
  private composer: EffectComposer | null = null
  private bloomPass: UnrealBloomPass | null = null
  private composerKey = '' // 已构建 composer 的通道组合（泛光/VCR 开关变化时重建）
  private vcrOn = false // 设置项：VCR 滤镜（默认关）
  private vcrPass: ShaderPass | null = null
  // 第一人称手部 viewmodel（挂相机）
  private vm = new THREE.Group()
  private vmItem: THREE.Group | null = null
  private vmHeld = ''
  private vmFlash = new THREE.Group()
  private vmParts!: { hand: THREE.Mesh; lhand: THREE.Mesh; sleeve: THREE.Mesh } // 手部/袖子（肤色与装备联动）
  // 副手打火机 viewmodel（装备打火机时显示；与手电互斥——副手只有一个槽位）
  private vmLighter = new THREE.Group()
  // v51：视角惯性滞后状态（转动视角时手部反向偏移并回正）
  private vmLag = { x: 0, y: 0 }
  private vmLookPrev = { yaw: 0, pitch: 0 }
  private vmLighterFlame!: THREE.Mesh
  private vmLighterHand!: THREE.Mesh
  // 屏幕中心准心（DOM 注入，内联样式）
  private cross!: HTMLDivElement
  private crossState = ''


  constructor(canvas: HTMLCanvasElement) {
    // WebGL 只能向浏览器表达 GPU 偏好，不能越权强制设备提频；这里明确请求高性能适配器。
    this.three = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' })
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
    // v34：日月定向光——室外时按天空盒日月方位给场景真实方向光照（无阴影，成本低）
    this.sunDir = new THREE.DirectionalLight(0xffffff, 0)
    // v50：realistic 自然光投影——阴影相机参数一次性就位（castShadow 帧内按模式/室外开关）
    this.sunDir.shadow.mapSize.set(2048, 2048)
    this.sunDir.shadow.camera.left = -22
    this.sunDir.shadow.camera.right = 22
    this.sunDir.shadow.camera.top = 22
    this.sunDir.shadow.camera.bottom = -22
    this.sunDir.shadow.camera.near = 0.5
    this.sunDir.shadow.camera.far = 90
    this.sunDir.shadow.bias = -0.0004
    this.sunDir.shadow.normalBias = 0.02
    this.scene.add(this.sunDir)
    this.scene.add(this.sunDir.target)
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
    // 灯光池（v31：10 → 24；v36：24 → 48 盏——据点/大厅等灯密集区域也不再「离玩家远了就熄灯」；
    // 前 40 盏全亮，第 41-48 盏按距离名次渐隐，消除边界 pop-in；decay=1.6 近似漫反射回弹）
    for (let i = 0; i < 48; i++) {
      const l = new THREE.PointLight(0xffffff, 0, 9, 1.6)
      this.scene.add(l)
      this.lightPool.push(l)
    }
    // v41「远处灯光全开」扩展池：默认不进场景（零开销）；画面设置开启后 48→96 盏（全场景点亮）
    for (let i = 0; i < 48; i++) {
      const l = new THREE.PointLight(0xffffff, 0, 9, 1.6)
      this.lightPoolExtra.push(l)
    }
    this.fullLightPool = [...this.lightPool, ...this.lightPoolExtra]
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


  private updateViewmodel(engine: Engine, dt: number) {
    const p = engine.player
    const show = !engine.paused && !engine.over && !!engine.map && !engine.handsHidden // v54：F1 全沉浸隐藏手部建模（F2 半沉浸保留）
    this.vm.visible = show
    this.vmFlash.visible = show && p.equip.offhand?.type === 'flashlight' && p.flashlight && p.battery > 0 && p.flashJamT <= 0 // v32：手部模型仅手电（头灯戴在头上，无手部模型）
    // 副手打火机：装备即常显（火苗随时间跳动）
    this.vmLighter.visible = show && p.hasLighter
    if (this.vmLighter.visible) {
      const fl = 0.8 + Math.sin(this.time * 11) * 0.15 + Math.sin(this.time * 23.7) * 0.08
      this.vmLighterFlame.scale.set(fl, 0.85 + Math.sin(this.time * 17.3) * 0.3, fl)
      this.vmLighter.position.y = -0.28 - Math.abs(Math.cos(this.bobPhase)) * (Math.hypot(engine.input.mx, engine.input.my) > 0.1 ? 0.01 : 0)
    }
    // 手部外观联动：肤色取自捏人配置；隔热手套→黄色手套；绝缘服→绿色袖口；保温服→棕褐袖口
    {
      const av = getAvatar()
      const handC = p.hasGloves ? '#b89a2e' : av.skin
      const sleeveC = p.hasSuit ? '#3a5a3a' : p.equip.body?.type === 'cavingsuit' ? '#8a7a5c' : av.top
      for (const [mesh, c] of [[this.vmParts.hand, handC], [this.vmParts.lhand, handC], [this.vmParts.sleeve, sleeveC], [this.vmLighterHand, handC]] as const) {
        const m = mesh.material as THREE.MeshLambertMaterial
        if (m.color.getHexString() !== c.slice(1)) m.color.set(c) // v53：不再同步 emissive——肤色在黑暗中不自发光
      }
    }
    if (!show) return
    const held = engine.gunCandyT > 0 ? 'guncandy' : (p.hotbar[p.selected]?.type ?? '') // v51：枪糖生效中右手恒为枪
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
    // v51：视角惯性——转动视角（含原地转身）时手部向反方向滞后偏移并缓慢回正
    {
      let dyaw = look.yaw - this.vmLookPrev.yaw
      while (dyaw > Math.PI) dyaw -= Math.PI * 2
      while (dyaw < -Math.PI) dyaw += Math.PI * 2
      const dp = look.pitch - this.vmLookPrev.pitch
      this.vmLookPrev.yaw = look.yaw
      this.vmLookPrev.pitch = look.pitch
      const k = 1 - Math.min(1, dt * 7) // 回正衰减
      this.vmLag.x = Math.max(-0.06, Math.min(0.06, (this.vmLag.x - dyaw * 0.045) * k))
      this.vmLag.y = Math.max(-0.045, Math.min(0.045, (this.vmLag.y + dp * 0.03) * k))
      px += this.vmLag.x
      py += this.vmLag.y
      rz += this.vmLag.x * 1.2
      rx += this.vmLag.y * 1.6
    }
    this.vm.position.set(px, py, pz)
    this.vm.rotation.x = rx
    this.vm.rotation.z = rz
    // 手电随移动轻微浮动
    this.vmFlash.position.y = -0.28 - sway2 * 0.01
  }

  private updateCrosshair(engine: Engine) {
    const el = this.cross
    const show = !engine.paused && !engine.over && !!engine.map && !engine.handsHidden // v54：F1 全沉浸隐藏准星（F2 半沉浸保留）
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
    this.composer?.setSize(w, h)
    this.composer?.setPixelRatio(dpr)
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
    const def = levelDefOf(engine.player.level)!
    const nightVision = engine.player.equip.head?.type === 'nightvision' && engine.player.battery > 0
    if (def.id === 6) {
      if (!this.l6WasActive) this.l6DarkAdapt = 0
      this.l6WasActive = true
      // 进一步增强暗适应：约 8 秒达到 63%，18 秒达到 90%；初始仍近黑，稳定后轮廓更清楚。
      this.l6DarkAdapt += (1 - this.l6DarkAdapt) * (1 - Math.exp(-dt / 8))
      const a = this.l6DarkAdapt * this.l6DarkAdapt * (3 - 2 * this.l6DarkAdapt)
      // 开发者“一键照明”绕过 L6 曝光压制；有电的夜视镜提供更强低照增像。
      this.three.toneMappingExposure = engine.dev.bright
        ? this.userExposure
        : this.userExposure * (nightVision ? (0.68 + 0.56 * a) : (0.18 + 0.7 * a))
    } else {
      this.l6WasActive = false
      this.l6DarkAdapt = 0
      this.three.toneMappingExposure = this.userExposure
    }
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
    let bob = speed > 0 ? Math.sin(this.bobPhase) * (engine.input.sprint ? 0.055 : 0.035) : Math.sin(this.bobPhase) * 0.008
    let swayX = 0, bobRoll = 0, bobPitch = 0
    if (this.headBobReal) {
      // 真实视角摇晃——幅度平滑趋近目标（冲刺 ×1.5 / 蹲行 ×0.45 / 静止归 0，平滑过渡不跳变）
      const target = speed > 0 ? (engine.input.sprint ? 1.5 : p.crouching ? 0.45 : 1) : 0
      this.bobAmp += (target - this.bobAmp) * Math.min(1, dt * 5)
      const a = this.bobAmp
      // v55：整体烈度调低 ~35%；空中（离地/抛物）暂停水平侧摆与 roll，仅保留极轻微垂直浮动
      const air = Math.abs(p.vz) > 0.25
      this.airK += ((air ? 1 : 0) - this.airK) * Math.min(1, dt * 10)
      const g = 1 - this.airK // 空中侧摆/roll 平滑趋零
      bob = Math.sin(this.bobPhase * 2) * 0.026 * a * (1 - this.airK * 0.85) // 垂直起伏（2 倍步频；空中仅余 15% 微浮）
      swayX = Math.sin(this.bobPhase) * 0.021 * a * g // 水平侧摆（沿视线右向施加）
      bobRoll = Math.sin(this.bobPhase) * 0.009 * a * g // 轻微 roll 侧倾
      // v55：起跳蓄力微沉（~60ms 快沉随即上提，~0.14s 单峰）
      if (this.prevVz <= 0.2 && p.vz > 2) this.jumpDipT = 0
      if (this.jumpDipT >= 0) {
        this.jumpDipT += dt
        const k = this.jumpDipT / 0.14
        if (k >= 1) this.jumpDipT = -1
        else bob -= 0.032 * Math.sin(k * Math.PI)
      }
      // v55：抛物手感——上升段相机滞后微沉 + 视线微仰；下坠段随下落速度下沉 + 视野微前倾（均封顶克制；
      // 顶点 vz≈0 时偏移自然消退，漂浮感减弱）
      if (p.vz > 0) bob -= Math.min(0.05, p.vz * 0.012)
      else bob -= Math.min(0.09, -p.vz * 0.016)
      bobPitch = Math.max(-0.05, Math.min(0.05, p.vz * 0.008))
      // 落地/跳跃落地：小段下沉回弹（下落末速越大下沉越深，~0.3s 单峰回弹）
      if (this.prevVz < -3 && p.vz >= 0) { this.landT = 0; this.landAmp = Math.min(0.14, -this.prevVz * 0.018) }
      if (this.landAmp > 0) {
        this.landT += dt
        const k = this.landT / 0.3
        if (k >= 1) this.landAmp = 0
        else bob -= this.landAmp * Math.sin(k * Math.PI)
      }
    }
    this.prevVz = p.vz

    // 相机震动（受伤震屏 + HP≤30 持续轻微晃动）——与 bob 叠加共存
    const lowHp = p.hp <= 30 && p.hp > 0 ? 0.05 + Math.sin(this.time * 7) * 0.02 : 0
    const sh = opts.shake ? engine.camShake + lowHp : 0
    this.camShakeX = (Math.random() - 0.5) * sh * 0.1
    this.camShakeY = (Math.random() - 0.5) * sh * 0.1

    // 相机高度 = 眼高 + 玩家脚底高度(p.z) - 蹲伏下沉量（平滑），蹲伏时摆动减半
    // （真实摇晃模式蹲行幅度已按 ×0.45 计入 bobAmp，不再重复减半）
    const crouchTarget = p.crouching ? 0.55 : 0
    this.crouchDrop += (crouchTarget - this.crouchDrop) * Math.min(1, dt * 8)
    const eye = 1.55 + bob * (p.crouching && !this.headBobReal ? 0.5 : 1) + p.z - this.crouchDrop
    // 水平侧摆沿视线右向（forward=(-cos,-sin)，右向=(-sin,cos)）
    const rightX = -Math.sin(look.yaw), rightZ = Math.cos(look.yaw)
    this.camera.position.set(p.x + rightX * swayX + this.camShakeX, eye, p.y + rightZ * swayX + this.camShakeY)
    // 低理智畸变：FOV 呼吸 + 侧倾（与摇晃 roll 叠加）
    const insanity = 1 - p.sanity / 100
    this.camera.rotation.y = look.yaw + this.camShakeX * 2
    this.camera.rotation.x = look.pitch + this.camShakeY * 2 + bobPitch // v55：真实摇晃的抛物俯仰（上升微仰/下坠前倾）
    this.camera.rotation.z = Math.sin(this.time * 0.7) * 0.05 * insanity + bobRoll
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
      const isOut = bandOfPlayerZ(m, p.z) === 0 && m.outdoor[pi] === 1
      this.outK += ((isOut ? 1 : 0) - this.outK) * Math.min(1, dt * 2.5)
      const k = this.outK
      const fog = this.scene.fog as THREE.Fog | null
      if (fog) {
        fog.near = this.fogNear + (5 - this.fogNear) * k
        fog.far = this.fogFar + (48 - this.fogFar) * k
        fog.color.copy(this.fogC).lerp(this.skyC, k)
        if (this.scene.background instanceof THREE.Color) this.scene.background.copy(fog.color)
      }
      // L6 不使用通用的 0.38 室外补光；自然光随暗适应缓慢显现，始终远低于其他室外层。
      const l6a = this.levelCfg?.id === 6 ? this.l6DarkAdapt * this.l6DarkAdapt * (3 - 2 * this.l6DarkAdapt) : 1
      this.ambient.intensity = this.levelCfg?.id === 6
        ? (0.0015 + 0.017 * l6a) * (1 - k) + (0.002 + 0.058 * l6a) * k
        : (this.ambientBase + (p.hasLighter ? 0.03 : 0)) * (1 - k) + 0.38 * k
      if (this.levelCfg?.id === 6 && nightVision && !engine.dev.bright) {
        // 夜视不制造定向光，只放大环境微光；电池耗尽后立即回落到自然暗适应。
        this.ambient.intensity += (0.06 + 0.024 * l6a) * (1 - k) + (0.085 + 0.03 * l6a) * k
        this.ambient.color.set('#a5d5ad')
      } else this.ambient.color.set('#ffffff')
      // v22：打火机装备效果——玩家周围一圈暖橙小火光（火苗闪烁、水下/室外减弱）
      if (p.hasLighter) {
        const fl = 0.75 + Math.sin(this.time * 11) * 0.12 + Math.sin(this.time * 23.7) * 0.08 + Math.random() * 0.05
        this.lighterLight.intensity = this.levelCfg?.noFlashlight ? 0 : 2.2 * fl * (1 - k * 0.5) * (this.uwK > 0.5 ? 0 : 1)
        this.lighterLight.position.set(this.camera.position.x, this.camera.position.y - 0.25, this.camera.position.z)
      } else {
        this.lighterLight.intensity = 0
      }
      this.hemi.intensity = this.levelCfg?.id === 6
        ? (0.002 + 0.014 * l6a) * (1 - k) + (0.003 + 0.042 * l6a) * k
        : this.hemiBase * (1 - k) + 0.3 * k
      if (this.levelCfg?.id === 6 && nightVision && !engine.dev.bright) {
        this.hemi.intensity += (0.022 + 0.008 * l6a) * (1 - k) + (0.032 + 0.012 * l6a) * k
        this.hemi.color.set('#a8c8b0')
        this.hemi.groundColor.set('#26362b')
      } else {
        this.hemi.color.set('#9aa2b0')
        this.hemi.groundColor.set('#3a342c')
      }
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
    // v34：日月定向光——室外时按天空盒日月方位给场景真实方向光照（无阴影），随室外混合系数淡入
    const sp = SKY_PROFILES[def.id]
    const sunActive = !!(sp && (sp.sunLight ?? 0) > 0 && this.outK > 0.01)
    if (sunActive) {
      this.sunDir.intensity = this.outK * (sp!.sunLight ?? 0) * (def.id === 6 ? this.l6DarkAdapt : 1)
      this.sunDir.color.set(sp!.sunColor ?? '#ffffff')
      const d = skyLightDir(def.id)
      // v50：realistic 自然光投影——阴影相机跟随玩家（按 texel 对齐防边缘闪烁）
      const casting = this.lightMode === 'realistic' && this.sunShadowsOn
      if (casting !== this.sunDir.castShadow) this.sunDir.castShadow = casting
      if (casting) {
        const wpt = 44 / this.sunDir.shadow.mapSize.x // 世界米/纹素：对齐整数倍消除游动闪烁
        const tx = Math.round(p.x / wpt) * wpt
        const tz = Math.round(p.y / wpt) * wpt
        this.sunDir.target.position.set(tx, 0, tz)
        this.sunDir.position.set(tx + d.x * 40, d.y * 40, tz + d.z * 40)
      } else {
        this.sunDir.position.set(p.x + d.x * 8, p.y + d.y * 8, p.z + d.z * 8)
        this.sunDir.target.position.set(p.x, p.y, p.z)
      }
    } else {
      this.sunDir.intensity = 0
      if (this.sunDir.castShadow) this.sunDir.castShadow = false
    }
    // v35：天空球跟随玩家头顶（球半径恒定 42 < far 60，大地图球面不再被远平面裁成黑圆盖）
    if (this.skyMesh) this.skyMesh.position.set(this.camera.position.x, 5.5, this.camera.position.z)
    // v17：tint 氛围（红室=红雾 / 熄灯区=近黑雾 / 马尼拉=暖调 / v29 浓雾区=灰白短视距 / v30 花园段=青翠阳光），按玩家所在瓦片平滑混合
    const bright = engine.dev.bright // v34：一键照明——层级全局增亮
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
          // 一键照明：熄灯区不再向黑雾过渡（保持常规雾色，全局可见）
          fog.color.lerp(this.tintC, (tnt === 3 && bright) ? 0 : tk * (tnt === 2 ? 0.95 : 0.9)) // 红室：雾气几乎全红
          // v53：熄灯区视距压缩已删除（应要求）——只保留近黑雾色与环境光熄灭，不再压缩 fog.far
          if (tnt === 3) {
            if (!bright) {
              // 熄灯区：环境光/半球光近乎完全熄灭（v28b：0.85→0.97——原保留 15% 环境光，
              // 黄色墙纸在高曝光下仍清晰可见；熄灯区应当伸手不见五指，手电成为唯一可靠光源）
              const blackoutLoss = nightVision ? 0.65 : 0.97
              this.ambient.intensity *= 1 - tk * blackoutLoss
              this.hemi.intensity *= 1 - tk * blackoutLoss
            }
          }
          if (tnt === 4 && !bright) fog.far = fog.far * (1 - tk * 0.6) // v29 浓雾区（杏仁水洼蒸发）：视距压缩至 ~40%
          if (tnt === 6) { // v30 花园段：阳光充沛——环境光/半球光上调，青翠明亮（不压缩视距）
            this.ambient.intensity *= 1 + tk * 0.55
            this.hemi.intensity *= 1 + tk * 0.4
          }
          if (this.scene.background instanceof THREE.Color) this.scene.background.copy(fog.color)
        }
      }
    }
    // v34 一键照明：环境光/半球光强制常亮 + 雾距推远——深色材质与远处结构也能看清；
    // 不改 toneMapping 曝光，避免整体画面发灰
    if (bright) {
      this.ambient.intensity = Math.max(this.ambient.intensity, 1.1)
      this.hemi.intensity = Math.max(this.hemi.intensity, 0.9)
      const fog = this.scene.fog as THREE.Fog | null
      if (fog && fog.far < 26) { fog.far = 26; fog.near = 1.2 }
    }

    // 设置项：战争迷雾关闭——雾推到远平面之外（背景色仍取雾色，远处天际线观感不变）
    if (!this.fogEnabled) {
      const fog = this.scene.fog as THREE.Fog | null
      if (fog) { fog.near = 9990; fog.far = 9999 }
    }
    // 设置项：距离雾远近倍率（v41 修正：统一在全部雾修正[室外/水下/熄灯区/浓雾区/一键照明]之后应用，
    // 否则会被后续 clamp/压缩覆盖而看似无效；灯光点亮半径读取的是本帧最终雾距，天然同步）
    if (this.fogScale !== 1 && this.fogEnabled) {
      const fog = this.scene.fog as THREE.Fog | null
      if (fog && fog.far < 9000) { fog.near *= this.fogScale; fog.far *= this.fogScale }
    }

    // 设置项：漂浮尘埃粒子开关（默认关闭）
    this.dust.visible = opts.dust

    // 灯光池：默认最近 48 盏，且点亮距离与当前雾可视距离一致（雾内全亮、雾外渐隐）——
    // 看见的地方必有光、看不见的地方不浪费；「远处灯光全开」时 96 盏全场景点亮（前 88 全亮、末 8 渐隐）
    // 复用排序缓冲，且比较平方距离：避免 L5 密集灯光每帧分配数组并在比较器内反复开平方。
    const sorted = this.lightSortScratch
    sorted.length = m.lights.length
    for (let i = 0; i < m.lights.length; i++) sorted[i] = m.lights[i]
    sorted.sort((a, b) => {
      const adx = a.x - p.x, ady = a.y - p.y, bdx = b.x - p.x, bdy = b.y - p.y
      return adx * adx + ady * ady - (bdx * bdx + bdy * bdy)
    })
    // v34 一键照明：无灯/停电层级（L6、熄灯区、停电中）地图里没有灯光可拾取——
    // 以玩家为中心合成 12 盏环绕灯，保证全视角明亮
    const synthRing = bright && sorted.length < 16
    const pool = this.farLights ? this.fullLightPool : this.lightPool
    const fogFarNow = (this.scene.fog as THREE.Fog | null)?.far ?? 24
    const lightPow = this.lightPowerScratch // v53：本帧各光源实际强度——灯具自发光盒据此跟随点亮状态
    lightPow.clear()
    for (let i = 0; i < pool.length; i++) {
      const pl = pool[i]
      let L = sorted[i]
      if (!L) {
        if (synthRing && i < 12) {
          const a = (i / 12) * Math.PI * 2
          L = { x: p.x + Math.cos(a) * 3.6, y: p.y + Math.sin(a) * 3.6, z: undefined, color: '#fff2d0', r: 9, flickerSeed: i }
        } else {
          pl.intensity = 0
          continue
        }
      }
      const li = Math.floor(L.y) * m.w + Math.floor(L.x)
      // v46：光源点高度与灯具贴附规则一致——z=层基准（z+2.4）、fixZ=绝对安装高（fixZ-0.2）、
      // 多层时贴所在瓦片真实天花/楼板底（灯具不再悬空或嵌进楼板）；
      // v47：挑高贴附不再限于多层——单层挑高（L274 教堂穹顶主间等）同样贴挑高顶，不再按普通层高悬空
      let ptY: number
      if (L.z !== undefined) ptY = L.z + 2.4
      else if (L.fixZ !== undefined) ptY = L.fixZ - 0.2
      else if (m.outdoor[li] === 1) ptY = 2.7
      else if (m.up[li] === 1) ptY = FLOOR_H - 0.35 - 0.25 // 上层楼板底
      else if (m.up2[li] === 1 || m.upWall2[li] === 1) ptY = 2 * FLOOR_H - 0.35 - 0.25 // v54c：3F 板/屋面板墙底（2F 挑空处——中庭灯光贴 5.65 而非 1F 顶）
      else if (m.ceiling[li] === 1) ptY = tallCeilH(m, this.wallH) - 0.25 // 挑高真实顶（单/多层一致）
      else ptY = this.wallH - 0.25
      pl.position.set(L.x, ptY, L.y)
      pl.color.set(L.color)
      const fl1 = Math.sin(this.time * 13 + L.flickerSeed * 17) * Math.sin(this.time * 7.3 + L.flickerSeed)
      const flick = 1 - opts.flicker * Math.max(0, fl1) * 0.7
      // v31：「闪烁」现象预警期——主区域灯光（非 keep）快速明灭数秒，随后才完全停电
      const warnF = engine.blackoutWarnT > 0 && L.keep !== 1 ? (Math.sin(this.time * 43 + L.flickerSeed * 29) > -0.2 ? 0.1 : 1.3) : 1
      const dL = Math.hypot(L.x - p.x, L.y - p.y)
      const rankFade = this.farLights
        ? (i < 88 ? 1 : Math.max(0, 1 - (i - 87) / 8))
        : dL < fogFarNow * 0.9 ? 1 : Math.max(0, 1 - (dL - fogFarNow * 0.9) / Math.max(1, fogFarNow * 0.35))
      // v23：层级光照系数——Level 6 的光本身被禁止（0），Level 8 主动削弱光（0.12）
      const lm = this.levelCfg?.lightMul ?? 1
      // v34 一键照明：无视闪烁/停电预警/层级光照系数/黑暗度，强度与射程直接拉满
      pl.intensity = bright ? 14 * rankFade : 12 * flick * warnF * rankFade * (1 - (this.levelCfg?.darkness ?? 0.6) * 0.35) * lm * (this.levelCfg?.lightSoft ?? 1)
      pl.distance = bright ? Math.max(L.r * 2.6 * 1.6, 11) : L.r * 2.6 * (lm > 0 ? Math.max(0.35, lm) : 1)
      lightPow.set(L, pl.intensity)
      // v50：场景灯投影（realistic 可选，最近 N 盏；PointLight 立方体阴影开销随盏数增加）
      const cast = this.lightMode === 'realistic' && i < this.lightShadowCount && pl.intensity > 0.01
      if (cast !== pl.castShadow) {
        pl.castShadow = cast
        if (cast && pl.shadow.mapSize.x !== 512) pl.shadow.mapSize.set(512, 512)
        pl.shadow.camera.near = 0.3
        pl.shadow.bias = -0.001
      }
    }
    // 灯具 flicker（自发光强度）
    // v53：带 src 的灯具自发光盒亮度跟随其点光源本帧实际强度（/8 归一）——停电（光源被剔除）/
    // 超出灯池未点亮/光照系数为 0（L6）时灯具不再发亮，闪烁与停电预警和点光源同步；
    // 无 src 的装饰性自发光件（出口牌等）保持原闪烁逻辑
    for (const f of this.fixtures) {
      const fl1 = Math.sin(this.time * 13 + f.seed * 17) * Math.sin(this.time * 7.3 + f.seed)
      const k = f.src ? Math.min(1, (lightPow.get(f.src) ?? 0) / 8) : 1 - opts.flicker * Math.max(0, fl1) * 0.8
      f.mat.color.copy(f.mat.userData.base as THREE.Color).multiplyScalar(k)
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
    this.updateNpcs(engine, dt)
    this.updateItems(engine, dt)
    this.updateProjectiles(engine)
    this.updateWallMarks(engine)
    this.updateStructs(dt)
    this.updateVisualInteractionHit(engine)
    this.updateParticles(engine, dt)
    this.updateAmbientFx(engine, def, dt)
    this.updateViewmodel(engine, dt)
    this.updateCrosshair(engine)

    // v50：realistic && 泛光开启时走 EffectComposer（辉光后处理）；VCR 滤镜开启时同样需要 composer；其余直渲（classic 完全一致）
    const wantBloom = this.lightMode === 'realistic' && this.bloomOn
    const key = `${wantBloom ? 'b' : ''}${this.vcrOn ? 'v' : ''}`
    if (key) {
      if (!this.composer || this.composerKey !== key) {
        this.composer?.dispose()
        this.composer = new EffectComposer(this.three)
        this.composer.addPass(new RenderPass(this.scene, this.camera))
        this.bloomPass = null
        this.vcrPass = null
        if (wantBloom) {
          this.bloomPass = new UnrealBloomPass(new THREE.Vector2(this.three.domElement.width, this.three.domElement.height), this.bloomStrength / 100, 0.5, 0.85)
          this.composer.addPass(this.bloomPass)
        }
        // 关键：composer 中间目标不应用 ACES 色调映射/sRGB，必须补 OutputPass——否则曝光失效、画面整体变暗
        this.composer.addPass(new OutputPass())
        if (this.vcrOn) {
          this.vcrPass = new ShaderPass(VcrShader)
          this.composer.addPass(this.vcrPass)
        }
        const size = new THREE.Vector2()
        this.three.getSize(size)
        this.composer.setSize(size.x, size.y)
        this.composer.setPixelRatio(this.three.getPixelRatio())
        this.composerKey = key
      }
      if (this.vcrPass) {
        this.vcrPass.uniforms.time.value = this.time
        const dbSize = new THREE.Vector2()
        this.three.getDrawingBufferSize(dbSize)
        ;(this.vcrPass.uniforms.resolution.value as THREE.Vector2).copy(dbSize)
      }
      this.composer.render()
    } else {
      this.three.render(this.scene, this.camera)
    }
  }

  /**
   * 真实画面准星命中：只对玩家近旁的结构网格做中心射线，结果下一次引擎扫描时再接受
   * 距离、FloorBand 与三维 LOS 复核。这样提示与屏幕上实际看到的木箱顶板/柜门保持一致。
   */
  private updateVisualInteractionHit(engine: Engine) {
    const m = engine.map
    look.visualHit = null
    if (!m || !this.structMeshes.size) return
    const p = engine.player
    const band = bandOfPlayerZ(m, p.z)
    const targets = this.interactRayTargets
    targets.length = 0
    for (const [s, grp] of this.structMeshes) {
      if (s.kind !== 'lift' && (s.floor ?? 0) !== band) continue
      const sx = Math.max(s.x, Math.min(p.x, s.x + s.w))
      const sy = Math.max(s.y, Math.min(p.y, s.y + s.h))
      if (Math.hypot(sx - p.x, sy - p.y) > 2.7) continue
      grp.userData.interactionTarget = { kind: 'structure', structure: s }
      grp.updateWorldMatrix(true, true)
      targets.push(grp)
    }
    for (const it of m.items) {
      const iz = it.z ?? floorHeight(m, it.x, it.y)
      if (bandOfPlayerZ(m, iz) !== band || Math.hypot(it.x - p.x, it.y - p.y) > 2.4) continue
      const id = Math.round(it.id * 1000) % 100000000
      const grp = this.itemMeshes.get(id)
      if (!grp) continue
      grp.userData.interactionTarget = { kind: 'item', item: it }
      grp.updateWorldMatrix(true, true)
      targets.push(grp)
    }
    if (!targets.length) return
    this.interactRaycaster.near = 0.02
    this.interactRaycaster.far = 6
    this.interactRaycaster.setFromCamera(this.interactRayCenter, this.camera)
    const hit = this.interactRaycaster.intersectObjects(targets, true)[0]
    if (!hit) return
    let root: THREE.Object3D | null = hit.object
    while (root && !root.userData.interactionTarget) root = root.parent
    const target = root?.userData.interactionTarget as
      | { kind: 'structure'; structure: Structure }
      | { kind: 'item'; item: GroundItem }
      | undefined
    if (!target) return
    look.visualHit = {
      ...target,
      x: hit.point.x,
      y: hit.point.z,
      z: hit.point.y,
      rayT: hit.distance,
      yaw: look.yaw,
      pitch: look.pitch,
      playerX: p.x,
      playerY: p.y,
      playerZ: p.z,
      at: Date.now(),
    }
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
  /** v54：真实视角摇晃开关（默认关——保持基础 bob；开启=垂直起伏+水平侧摆+roll 侧倾+落地回弹） */
  setHeadBob(on: boolean) { this.headBobReal = on }

  /** 设置：距离雾远近倍率（1=默认；帧内对雾 near/far 缩放） */
  setFogScale(k: number) { this.fogScale = Math.max(0.2, Math.min(4, k)) }

  /** 设置开关：远处灯光全开——扩展灯光池 48→96 盏进场景（全场景点亮；关闭即移除，恢复零开销） */
  setFarLights(on: boolean) {
    if (on === this.farLights) return
    this.farLights = on
    for (const l of this.lightPoolExtra) {
      if (on) this.scene.add(l)
      else this.scene.remove(l)
    }
    // 灯光数量变化必须触发材质重编译——否则新增灯不参与着色（表现为「开关无效」）
    this.scene.traverse((o) => {
      const mm = o as THREE.Mesh
      if (mm.material) (mm.material as THREE.Material).needsUpdate = true
    })
  }

  // ---------- v50：光影模式设置 ----------

  /** 光影模式：classic=当前版本 / realistic=物理光照（Standard 材质 + 环境反射 + 软阴影）。
   *  切换 = 材质拓扑变化：重编译 + 重建本层（classic 完整退回现状）。 */
  setLightMode(mode: LightMode) {
    if (mode === this.lightMode) return
    this.lightMode = mode
    setMaterialMode(mode)
    this.three.shadowMap.type = mode === 'realistic' ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap
    this.applyFlashQuality()
    if (mode !== 'realistic') this.scene.environment = null
    this.scene.traverse((o) => {
      const mm = o as THREE.Mesh
      if (mm.material) (mm.material as THREE.Material).needsUpdate = true
    })
    // 重建本层：terrain/水面按新模式重新出材质（teardown 后下一帧走常规构建路径）
    this.teardown()
    this.builtMap = null
    this.builtRev = -1
  }

  /** 阴影质量：0=低 1=中 2=高（手电/太阳 shadow map 尺寸与软影半径） */
  setShadowQuality(q: number) {
    if (q === this.shadowQuality) return
    this.shadowQuality = q
    this.applyFlashQuality()
    const size = [1024, 2048, 4096][q] ?? 2048
    this.sunDir.shadow.mapSize.set(size, size)
    this.sunDir.shadow.map?.dispose()
    ;(this.sunDir.shadow as unknown as { map: THREE.Texture | null }).map = null
  }

  private applyFlashQuality() {
    const realistic = this.lightMode === 'realistic'
    const size = realistic ? ([1024, 2048, 4096][this.shadowQuality] ?? 2048) : 1024
    this.flash.shadow.mapSize.set(size, size)
    this.flash.shadow.map?.dispose()
    ;(this.flash.shadow as unknown as { map: THREE.Texture | null }).map = null
    this.flash.shadow.radius = realistic ? ([2, 4, 6][this.shadowQuality] ?? 4) : 1
  }

  /** 自然光投影开关（realistic 且室外时生效） */
  setSunShadows(on: boolean) { this.sunShadowsOn = on }

  /** 场景灯投影盏数（最近 N 盏池灯；兼容旧档 boolean：true→2） */
  setLightShadows(n: number | boolean) { this.lightShadowCount = typeof n === 'boolean' ? (n ? 2 : 0) : Math.max(0, Math.min(4, n)) }

  /** 泛光开关（realistic 时走 EffectComposer 辉光后处理） */
  setBloomFx(on: boolean) { this.bloomOn = on }

  /** VCR 滤镜开关（扫描线/色差/噪点/跟踪失真后处理；默认关，两种光影模式均生效） */
  setVcrFx(on: boolean) { this.vcrOn = on }

  /** 泛光程度（0–100 → strength 0–1；composer 未建时存值待建时应用） */
  setBloomStrength(v: number) {
    this.bloomStrength = Math.max(0, Math.min(100, v))
    if (this.bloomPass) this.bloomPass.strength = this.bloomStrength / 100
  }

  /** 曝光（%）：100 = 1.45；L6 在该用户基准上再叠加暗适应。 */
  setExposure(pct: number) {
    this.userExposure = 1.45 * (pct / 100)
    this.three.toneMappingExposure = this.userExposure
  }

  /** 反射强度（0–100）：即时调整全部 Standard 材质的 envMapIntensity（基准 envBase × 倍率） */
  setReflectivity(v: number) {
    setReflectK(Math.max(0, v) / 60)
    const k = getReflectK()
    this.scene.traverse((o) => {
      const mm = o as THREE.Mesh
      const mat = mm.material as THREE.MeshStandardMaterial | undefined
      if (mat?.userData?.envBase !== undefined) mat.envMapIntensity = (mat.userData.envBase as number) * k
    })
  }

  /** 释放环境探针缓存（关闭渲染器时调用） */
  dispose() { disposeEnvProbes() }

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
    for (const rec of this.npcMeshes.values()) { this.scene.remove(rec.grp); this.scene.remove(rec.bubble) }
    this.npcMeshes.clear()
    for (const g of this.itemMeshes.values()) this.scene.remove(g)
    for (const g of this.projMeshes.values()) this.scene.remove(g)
    for (const g of this.markMeshes.values()) this.scene.remove(g)
    this.entityMeshes.clear()
    this.itemMeshes.clear()
    this.projMeshes.clear()
    this.markMeshes.clear()
    this.structMeshes.clear()
    this.animatedStructMeshes.clear()
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
    this.ambientBase = def.id === 6 ? 0.012 : 0.09 + def.darkness * 0.06
    this.hemiBase = def.id === 6 ? 0.018 : 0.12 + def.darkness * 0.06
    this.hemi.color.set(col(pal.wallTop).lerp(col('#9aa2b0'), 0.5))
    this.hemi.groundColor.set(col(pal.floor).multiplyScalar(0.8))
    this.applyEnvProbe(def)
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
        for (const s of cg.structs) {
          this.structMeshes.delete(s)
          this.animatedStructMeshes.delete(s)
        }
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
      for (const s of cg.structs) {
        this.structMeshes.delete(s)
        this.animatedStructMeshes.delete(s)
      }
      this.fixtures = this.fixtures.filter((f) => !cg.fixtures.includes(f))
      this.exitMeshes = this.exitMeshes.filter((e) => !cg.exitMeshes.includes(e))
      this.chunkGroups.delete(key)
    }
    // 分帧构建新 chunk。L5 每帧最多构建 1 个，避免初次进入时把 25 个重型酒店区块
    // 集中塞进同一帧；中央区块足以覆盖雾内视野，其余按距离在后续帧补齐。
    queue.sort((a, b) =>
      (Math.abs(a.cx * CS - inf.ox - p.x) + Math.abs(a.cy * CS - inf.oy - p.y)) -
      (Math.abs(b.cx * CS - inf.ox - p.x) + Math.abs(b.cy * CS - inf.oy - p.y)))
    const budget = def.id === 5 ? 1 : (this.chunkGroups.size === 0 ? queue.length : 2)
    for (const c of queue.slice(0, budget)) this.buildInfiniteChunk(m, def, c)
  }

  // v29：闪烁的墙壁——出口面片贴到相邻墙面（面向出口所在地板格；无相邻墙时保持居中）
  // v55c：dist 可调——boilerdeep 黑门门框在模型局部 -0.42，dist 0.93 使门框前缘微凸墙面 1cm
  // （0.48 的旧值让门框浮在墙前 0.44m/门牌半嵌墙盒内——墙面无门洞开凿[非 DOOR_EXIT_KINDS]，门体须贴在墙面外）
  private orientExitToWall(m: GameMap, grp: THREE.Group, e: { x: number; y: number }, dist = 0.48) {
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
      grp.position.set(e.x + 0.5 + d.dx * dist, 0, e.y + 0.5 + d.dy * dist)
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

  // v51：电梯井出口朝向——门面（局部 -z 侧）转向走廊开口方向（嵌墙壁龛的贯穿轴：
  // 邻格为地板 + 其反向非地板 + 垂直向两邻皆非地板；v54b 修复——旧实现取第一个地板邻格，
  // 壁龛侧邻有开阔地（如出生广场）时门脸朝侧面/与墙垂直）
  private orientExitFaceFloor(m: GameMap, grp: THREE.Group, e: { x: number; y: number }) {
    const tx = Math.floor(e.x), ty = Math.floor(e.y)
    const at = (x: number, y: number) => (x < 0 || y < 0 || x >= m.w || y >= m.h ? 0 : m.tiles[y * m.w + x])
    let fallback: [number, number] | null = null
    for (const [wx, wy] of [[0, 1], [0, -1], [1, 0], [-1, 0]] as const) {
      if (at(tx + wx, ty + wy) !== 1) continue
      if (!fallback) fallback = [wx, wy]
      if (at(tx - wx, ty - wy) === 1) continue // 背面必须非地板（壁龛）
      if (at(tx + wy, ty + wx) === 1 || at(tx - wy, ty - wx) === 1) continue // 垂直向必须皆墙（墙线贯穿轴）
      grp.rotation.y = Math.atan2(-wx, -wy) // 局部 -z（门面）转向走廊开口
      grp.position.set(e.x + 0.5, 0, e.y + 0.5)
      return
    }
    if (fallback) grp.rotation.y = Math.atan2(-fallback[0], -fallback[1])
    grp.position.set(e.x + 0.5, 0, e.y + 0.5)
  }

  private buildInfiniteChunk(m: GameMap, def: LevelDef, c: LiveChunk) {
    const inf = m.inf!
    const H = this.wallH
    const g = new THREE.Group()
    const wx = c.cx * CS - inf.ox, wy = c.cy * CS - inf.oy
    const range = { x0: wx, y0: wy, x1: wx + CS, y1: wy + CS, variant: c.variant }
    buildTerrain(m, def, H, g, range)
    // 结构（对象身份跨平移保持，structMeshes 引用稳定）
    const structs: Structure[] = []
    for (const s of c.structures) {
      const mesh = buildStructure(s, def, m, H)
      if (mesh) {
        const gy = floorHeight(m, s.x + s.w / 2, s.y + s.h / 2, s.floor ?? 0)
        ;(mesh as THREE.Group).position.y += gy
        g.add(mesh as THREE.Group)
        this.structMeshes.set(s, mesh as THREE.Group)
        if (ANIM_STRUCT(s)) this.animatedStructMeshes.set(s, mesh as THREE.Group)
        structs.push(s)
      }
    }
    // 灯具（L0 全室内：自发光盒；v53：src 记录光源，亮度随其点亮状态）
    const fixtures: { mat: THREE.MeshBasicMaterial; seed: number; src?: LightSource }[] = []
    for (const L of c.lights) {
      const mat = new THREE.MeshBasicMaterial({ color: L.color })
      mat.userData.base = col(L.color)
      const fix = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.08, 0.25), mat)
      // v55：无限 chunk 灯具贴附与有限层/光源点（ptY）对齐——挑高区贴 tallCeilH 真实顶（L5 主厅等）
      const li2 = Math.floor(L.y) * m.w + Math.floor(L.x)
      const fixY = L.z !== undefined ? L.z + 2.55
        : m.ceiling[li2] === 1 && m.outdoor[li2] !== 1 ? tallCeilH(m, H) - 0.05 : H - 0.05
      fix.position.set(L.x, fixY, L.y)
      g.add(fix)
      fixtures.push({ mat, seed: L.flickerSeed, src: L })
    }
    // 出口（闪烁的墙壁：strobe 规律明灭材质）
    const exitMeshes: { mesh: THREE.Object3D; mat: THREE.MeshBasicMaterial }[] = []
    for (const e of c.exits) {
      const grp = buildExit(e.def.kind, def)
      if (e.def.kind === 'flickerdoor') this.orientExitToWall(m, grp, e)
      else if (e.def.kind === 'graystairs' || e.def.kind === 'graystairsup' || e.def.kind === 'oldstairs') this.orientStairs(m, grp, e) // v54：L4 古典楼梯同为可行走阶梯
      else if (e.def.kind === 'stairs' || e.def.kind === 'unlockeddoor' || e.def.kind === 'fireexit' || e.def.kind === 'officedoor' || e.def.kind === 'boilerdeep') this.orientDoor(m, grp, e) // v55d：L5 黑门纳入门洞类出口（模型嵌门洞格贴墙）
      else if (e.def.kind === 'elevatorshaft' || e.def.kind === 'darkwooddoor') this.orientExitFaceFloor(m, grp, e) // v51：嵌墙电梯门面朝走廊；v54：L5 深色木门沿客房门洞贯穿轴定向
      else grp.position.set(e.x + 0.5, floorHeight(m, e.x, e.y, e.floor ?? 0), e.y + 0.5)
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
    this.skyMesh = (g.getObjectByName('skybox') as THREE.Mesh | undefined) ?? null


    // ---- 结构 ----
    this.structMeshes.clear()
    this.animatedStructMeshes.clear()
    for (const s of m.structures) {
      const mesh = buildStructure(s, def, m, H)
      if (mesh) {
        // v7：结构模型按所在地面高度偏移（高台/低洼上的家具贴合地面）；v13：上层结构抬升 FLOOR_H；v54：三层结构抬升 2×FLOOR_H
        const gy = floorHeight(m, s.x + s.w / 2, s.y + s.h / 2, s.floor ?? 0)
        ;(mesh as THREE.Group).position.y += gy
        g.add(mesh as THREE.Group)
        this.structMeshes.set(s, mesh as THREE.Group)
        if (ANIM_STRUCT(s)) this.animatedStructMeshes.set(s, mesh as THREE.Group)
      }
    }

    // ---- 灯具（自发光盒；室外=路灯杆）----
    // v46 灯具贴附规则（真多层，杜绝悬空灯/嵌楼板灯）：
    // z=指定层基准（灯具 z+2.55，如夹楼天花）；fixZ=绝对安装高度（壁灯/立灯）；
    // 缺省贴所在瓦片真实顶面——楼板底下=2.65、挑高=挑高顶、普通=层高；
    // v47：挑高贴附不再限于多层——单层挑高（L274 教堂穹顶主间等）同样贴挑高顶；
    // noFix=不画默认灯盒（实体灯具由结构模型提供，如 walllamp 壁挂斜照灯）
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
        this.fixtures.push({ mat, seed: L.flickerSeed, src: L })
        continue
      }
      if (L.noFix === 1) continue // 灯具模型由结构提供（不渲染默认自发光盒）
      let fixY = H - 0.05
      if (L.z !== undefined) fixY = L.z + 2.55
      else if (L.fixZ !== undefined) fixY = L.fixZ
      else if (m.up[li] === 1) fixY = FLOOR_H - 0.35 - 0.05 // 上层楼板底
      else if (m.up2[li] === 1 || m.upWall2[li] === 1) fixY = 2 * FLOOR_H - 0.35 - 0.05 // v54c：3F 板/屋面板墙底（中庭等 2F 挑空处）
      else if (m.ceiling[li] === 1) fixY = tallCeilH(m, H) - 0.05 // 挑高真实顶（单/多层一致）
      const fix = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.08, 0.25), mat)
      fix.position.set(L.x, fixY, L.y)
      g.add(fix)
      this.fixtures.push({ mat, seed: L.flickerSeed, src: L })
    }

    // ---- 出口 ----
    for (const e of m.exits) {
      const grp = buildExit(e.def.kind, def)
      if (e.def.kind === 'flickerdoor') this.orientExitToWall(m, grp, e)
      else if (e.def.kind === 'graystairs' || e.def.kind === 'graystairsup' || e.def.kind === 'oldstairs') this.orientStairs(m, grp, e) // v54：L4 古典楼梯同为可行走阶梯
      else if (e.def.kind === 'stairs' || e.def.kind === 'unlockeddoor' || e.def.kind === 'fireexit' || e.def.kind === 'officedoor' || e.def.kind === 'boilerdeep') this.orientDoor(m, grp, e) // v55d：L5 黑门纳入门洞类出口（模型嵌门洞格贴墙）
      else if (e.def.kind === 'elevatorshaft' || e.def.kind === 'darkwooddoor') this.orientExitFaceFloor(m, grp, e) // v51：嵌墙电梯门面朝走廊；v54：L5 深色木门沿客房门洞贯穿轴定向
      else grp.position.set(e.x + 0.5, floorHeight(m, e.x, e.y, e.floor ?? 0), e.y + 0.5)
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
    this.applyEnvProbe(def)
  }

  // v50：环境反射探针——realistic：室外层反射真实天空盒，室内层反射层级调色渐变；classic 置空
  private applyEnvProbe(def: LevelDef) {
    if (this.lightMode !== 'realistic') {
      if (this.scene.environment) this.scene.environment = null
      return
    }
    const skyTex = this.skyMesh ? ((this.skyMesh.material as THREE.MeshBasicMaterial).map as THREE.Texture | null) : null
    this.scene.environment = envProbe(def, skyTex)
  }

  private updateEntities(engine: Engine, dt: number) {
    const m = engine.map!
    const seen = new Set<number>()
    for (const e of m.entities) {
      seen.add(e.id)
      let grp = this.entityMeshes.get(e.id)
      // v53：L3 高智能实体建模变体（无面灵错位器官/石器、水豚尸鼠；seed=实体 id 保证重建一致）；
      // 尸鼠形态按层级固定：L2 灰白廊道种群 / L3 水豚 / 其余深褐（v53，替代原随机二选一）
      const eOpts = (e.def.l3face || e.def.tool || e.def.capybara || e.def.type === 'corpserat')
        ? { l3face: e.def.l3face, tool: e.def.tool, capybara: e.def.capybara, ratMorph: (engine.levelDef.id === 2 ? 'gray' : engine.levelDef.id === 5 ? 'hotel' : 'brown') as 'gray' | 'brown' | 'hotel', seed: e.id } : undefined // v55：L5 尸鼠=酒店正装变种
      if (!grp) {
        grp = e.disguised
          ? (e.disguised === 'human' ? humanDisguiseMesh(e.id, engine.levelDef.id) : buildItemMesh(e.disguised))
          : buildEntityMesh(e.def.type, eOpts)
        grp.userData.wasDisguised = !!e.disguised
        grp.userData.entType = e.def.type
        this.enableShadows(grp)
        this.entityMeshes.set(e.id, grp)
        this.scene.add(grp)
      }
      if (!e.disguised && grp.userData.wasDisguised) {
        // 现形
        this.scene.remove(grp)
        grp = buildEntityMesh(e.def.type, eOpts)
        grp.userData.wasDisguised = false
        grp.userData.entType = e.def.type
        this.entityMeshes.set(e.id, grp)
        this.scene.add(grp)
      }
      // v51：人制品售货机活化——def 切换（vendingmachine→vmad）时重建模型（含骷髅手腿）
      if (grp.userData.entType !== e.def.type) {
        this.scene.remove(grp)
        grp = buildEntityMesh(e.def.type, eOpts)
        grp.userData.entType = e.def.type
        this.enableShadows(grp)
        this.entityMeshes.set(e.id, grp)
        this.scene.add(grp)
      }
      const gz = e.z ?? floorHeight(m, e.x, e.y) // 实体站在所在平面地面
      grp.position.set(e.x, gz, e.y)
      grp.visible = !e.hidden // 埋伏/蛰伏实体（管道蠕虫、通风管手臂）未现身时不渲染
      // v51：Nguithr'xurh 双形态显隐——网囊形态只显示网囊球（hidden），爆开后只显示蜘蛛本体
      if (e.def.type === 'nguithr') {
        const parts = grp.userData.parts as Record<string, THREE.Object3D> | undefined
        if (parts?.spiderBody && parts?.sacGrp) {
          parts.spiderBody.visible = !e.hidden
          parts.sacGrp.visible = !!e.hidden
          grp.visible = true // 网囊形态也要渲染（不被全局 hidden 隐藏）
        }
      }
      // 朝向：模型面向 +x（v34：转向平滑——显示朝向按 ~6.5 rad/s 上限短弧追赶引擎朝向，死亡动画仍硬赋值）
      {
        const target = -e.facing
        let cur = this.entityFacing.get(e.id)
        if (cur === undefined) cur = target // 新实体首帧直接对齐
        else {
          let diff = ((target - cur + Math.PI * 3) % (Math.PI * 2)) - Math.PI // 最短弧差
          const step = 6.5 * dt
          cur = Math.abs(diff) <= step ? target : cur + Math.sign(diff) * step
        }
        this.entityFacing.set(e.id, cur)
        grp.rotation.y = cur
      }
      grp.rotation.x = 0
      const esc = e.def.scale ?? 1 // 实例级体型缩放（L2 温顺死亡飞蛾 0.6）
      grp.scale.setScalar(esc)
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
        grp.position.y = gz + 0.9 * esc + Math.sin(t * 3.1) * 0.25 * esc // 飞行悬停（攻击俯冲在下方攻击分支叠加）
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
        // Nguithr'xurh：节肢恐怖动画——交替步态 / 腹部脉动 / 闲置肢抖 / 前摇后仰下扑
        if (et === 'nguithr' && parts.spiderBody) {
          const sb = parts.spiderBody
          const moving = e.animT > 0 && gaitAmp > 0
          const baseRy = (o: THREE.Object3D | undefined) => (o?.userData.baseRy as number | undefined) ?? 0
          if (lunging) {
            // 前摇：后仰蓄力（前身抬起、前两对腿高举、腹部下勾），出手瞬间下扑
            // 模型正面=+X：俯仰绕本地 z 轴（+ 后仰 / - 下扑）
            const wind = lk > 0.45 ? (1 - lk) / 0.55 : 1 // 0→1 蓄力进程
            const snap = lk <= 0.45 ? lk / 0.45 : 0 // 0→1 下扑进程
            sb.rotation.z = 0.55 * wind - 0.75 * snap
            sb.position.y = 0.1 * wind - 0.06 * snap
            for (let i = 0; i < 6; i++) {
              const lift = i < 2 ? 1.2 : 0.4
              const lL = parts[`legL${i}`], lR = parts[`legR${i}`]
              // 左腿（-z 侧）抬高=+rotation.x，右腿（+z 侧）抬高=-rotation.x
              if (lL) { lL.rotation.x = lift * wind - 0.5 * snap; lL.rotation.y = baseRy(lL) }
              if (lR) { lR.rotation.x = -lift * wind + 0.5 * snap; lR.rotation.y = baseRy(lR) }
            }
          } else if (moving) {
            // 行走：交替三步态（偶数腿抬起外展时奇数腿支撑），腹部微摆、躯体小幅起伏
            sb.rotation.z = 0; sb.position.y = 0
            const g = e.animT * 6
            for (let i = 0; i < 6; i++) {
              const ph = Math.sin(g + (i % 2) * Math.PI + (i * 0.4))
              const lL = parts[`legL${i}`], lR = parts[`legR${i}`]
              // 抬腿相：左腿抬高=+rotation.x，右腿抬高=-rotation.x，左右交替
              if (lL) { lL.rotation.x = Math.max(0, ph) * 0.5; lL.rotation.y = baseRy(lL) + ph * 0.1 }
              if (lR) { lR.rotation.x = Math.min(0, ph) * 0.5; lR.rotation.y = baseRy(lR) + ph * 0.1 }
            }
            if (parts.abdomen) {
              parts.abdomen.rotation.y = Math.sin(g * 0.5) * 0.1 // 腹部侧摆
              parts.abdomen.position.y = 0.12 + Math.abs(Math.sin(g)) * 0.025
            }
            if (parts.ceph) parts.ceph.rotation.x = Math.sin(g * 0.5 + 1) * 0.06
          } else {
            // 闲置：附肢高频小幅抖动（恐怖感）、腹部呼吸脉动、复眼微光闪烁
            sb.rotation.z = 0; sb.position.y = 0
            for (let i = 0; i < 6; i++) {
              const lL = parts[`legL${i}`], lR = parts[`legR${i}`]
              const jt = Math.sin(t * 9 + i * 1.7) * 0.06 + Math.sin(t * 23 + i * 3.1) * 0.025
              if (lL) { lL.rotation.x = jt; lL.rotation.y = baseRy(lL) }
              if (lR) { lR.rotation.x = -jt; lR.rotation.y = baseRy(lR) }
            }
            if (parts.abdomen) {
              parts.abdomen.scale.y = 1 + Math.sin(t * 1.6) * 0.05 // 呼吸
              parts.abdomen.rotation.y = Math.sin(t * 0.6) * 0.06
            }
            if (parts.ceph) parts.ceph.rotation.y = Math.sin(t * 0.5) * 0.25 // 缓慢张望
          }
        }
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
      if (lunging) grp.scale.setScalar(esc * 1.14)
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
          grp.position.y = gz + 0.9 * esc * k
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
        this.entityFacing.delete(id)
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

  // ---------- v35：NPC（据点居民；不是实体） ----------
  // 头顶气泡：CanvasTexture 文字面片（文本变化时重绘；MeshBasicMaterial 雾中可见）
  private drawBubble(rec: NpcMeshRec, text: string) {
    const c = rec.bubbleCanvas, g = c.getContext('2d')!
    g.clearRect(0, 0, c.width, c.height)
    if (text) {
      g.fillStyle = 'rgba(248,246,232,0.94)'
      g.fillRect(4, 4, c.width - 8, c.height - 8)
      g.strokeStyle = 'rgba(60,52,40,0.9)'
      g.lineWidth = 3
      g.strokeRect(4, 4, c.width - 8, c.height - 8)
      let size = 36
      g.textAlign = 'center'
      g.textBaseline = 'middle'
      do { g.font = `${size}px 'SimSun','Songti SC',serif`; size -= 2 } while (g.measureText(text).width > c.width - 40 && size > 16)
      g.fillStyle = '#2a2620'
      g.fillText(text, c.width / 2, c.height / 2 + 2)
    }
    rec.bubbleTex.needsUpdate = true
  }

  private updateNpcs(engine: Engine, dt: number) {
    const m = engine.map!
    const seen = new Set<string>()
    for (const n of engine.npcs) {
      seen.add(n.id)
      let rec = this.npcMeshes.get(n.id)
      if (!rec) {
        // 随机玩家形象（种子确定）+ 制服徽章（胸口小色块）
        const pm = buildPlayerModel(npcAvatar(n.def), {})
        if (n.def.faction === 'brc') {
          // v39：BRC 黑影无脸——摘除全部面部件（与无面灵同一 userData.face 摘除约定）；
          // 胸口徽章跳过（被白围裙覆盖；级别徽章镶在贝雷帽正面，见 addNpcGear）
          const hd = (pm.userData.parts as Record<string, THREE.Object3D>).head
          const faceParts: THREE.Object3D[] = []
          hd?.traverse((o) => { if (o.userData.face) faceParts.push(o) })
          for (const f of faceParts) f.parent?.remove(f)
        } else if (n.def.uniform?.badge) {
          const badge = new THREE.Mesh(
            new THREE.BoxGeometry(0.07, 0.09, 0.015),
            new THREE.MeshLambertMaterial({ color: n.def.uniform.badge }),
          )
          badge.position.set(-0.1, 1.2, 0.125)
          pm.add(badge)
        }
        // v40：标志性配饰走共享模块（npcGear.ts）——游戏内与图鉴 AvatarPreview 同一通道
        applyNpcGear(pm.userData.parts as Record<string, THREE.Object3D>, n.id, n.def)
        const inner = new THREE.Group()
        inner.rotation.y = Math.PI / 2 // 与实体相同朝向约定（+Z 建造 → 正面 +X）
        inner.add(pm)
        const grp = new THREE.Group()
        grp.add(inner)
        this.enableShadows(grp)
        // 头顶气泡（挂场景而非 grp，避免继承模型朝向）
        const canvas = document.createElement('canvas')
        canvas.width = 512; canvas.height = 128
        const tex = new THREE.CanvasTexture(canvas)
        tex.colorSpace = THREE.SRGBColorSpace
        const bubble = new THREE.Mesh(
          new THREE.PlaneGeometry(1.7, 0.42),
          new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }),
        )
        bubble.visible = false
        this.scene.add(bubble)
        this.scene.add(grp)
        rec = {
          grp, parts: pm.userData.parts as Record<string, THREE.Object3D>,
          bubble, bubbleCanvas: canvas, bubbleTex: tex,
          text: '', facing: -n.facing, phase: Math.random() * 10,
          guitarK: 0,
        }
        this.npcMeshes.set(n.id, rec)
      }
      // 位置（贴地；v46：按其所在楼层带取地面——夹楼 NPC 站在 2F 楼板；v54：三层 NPC 站 3F 楼板）与朝向（短弧平滑，与实体同一手感）
      const gz = floorHeight(m, n.x, n.y, n.floor ?? 0)
      rec.grp.position.set(n.x, gz, n.y)
      const target = -n.facing
      const diff = ((target - rec.facing + Math.PI * 3) % (Math.PI * 2)) - Math.PI
      const step = 6.5 * dt
      rec.facing = Math.abs(diff) <= step ? target : rec.facing + Math.sign(diff) * step
      rec.grp.rotation.y = rec.facing
      // 步态（挪动时摆四肢）+ 待机（呼吸/张望）
      const moving = Math.hypot(n.tx - n.x, n.ty - n.y) > 0.15
      rec.phase += dt * (moving ? 5.5 : 0)
      const amp = moving ? 0.5 : 0
      const t = this.time + rec.phase * 0.13
      const parts = rec.parts
      if (n.dead) {
        // v39：死亡——倒地 + 下沉（与人形实体通用死亡同一手感）
        const dth = 1 - Math.max(0, n.deathT ?? 0) / 1.4
        rec.grp.rotation.z = -dth * 1.5
        rec.grp.position.y = gz - dth * 0.25
        rec.grp.scale.setScalar(Math.max(0.01, 1 - dth))
      } else if (n.id === 'joey' && engine.joeyPlaying) {
        // v56：乐手弹奏——右臂扫弦、左手按弦、身体摇摆、点头踩拍（吉他由下方插值挪到身前）
        const wt = this.time + rec.phase * 0.13
        if (parts.legL) parts.legL.rotation.x = 0
        if (parts.legR) parts.legR.rotation.x = Math.abs(Math.sin(wt * 2.2)) * 0.12 // 踩拍
        if (parts.torso) {
          parts.torso.rotation.y = Math.sin(wt * 1.4) * 0.09 // 身体摇摆
          parts.torso.rotation.x = 0.05 + Math.sin(wt * 2.2) * 0.03
          parts.torso.scale.y = 1
        }
        if (parts.head) {
          parts.head.rotation.y = Math.sin(wt * 1.4) * 0.14 // 随摇摆
          parts.head.rotation.x = 0.07 + Math.sin(wt * 2.2) * 0.08 // 点拍
        }
        const strum = Math.sin(wt * 8.8) // 130BPM 8 分扫弦（下拨为主）
        if (parts.armR) {
          parts.armR.rotation.x = -0.72 + Math.abs(strum) * 0.55
          parts.armR.rotation.z = 0.16
        }
        if (parts.armL) {
          parts.armL.rotation.x = -1.55 + Math.sin(wt * 4.4) * 0.09 // 左手按弦微动
          parts.armL.rotation.z = 0.24
        }
        rec.grp.position.y = gz + Math.abs(Math.sin(wt * 2.2)) * 0.02
      } else if (n.def.workLoop && !n.hostile) {
        // v39：装修工作循环（BRC 员工）——procedual 驱动手臂摆动 + 手中工具，锚定工作点
        const wt = this.time + rec.phase * 0.13
        const wl = n.def.workLoop
        if (parts.legL) parts.legL.rotation.x = 0
        if (parts.legR) parts.legR.rotation.x = 0
        if (parts.torso) { parts.torso.scale.y = 1; parts.torso.rotation.x = 0; parts.torso.rotation.y = 0 }
        if (parts.armR) parts.armR.rotation.z = 0
        if (parts.head) { parts.head.rotation.y = 0; parts.head.rotation.x = 0 }
        if (wl === 'hammer') { // 锤：抬锤—落锤（中速重拍）
          const sw = Math.abs(Math.sin(wt * 2.4))
          if (parts.armR) parts.armR.rotation.x = -2.2 + sw * 1.6
          if (parts.armL) parts.armL.rotation.x = -0.35
          if (parts.torso) parts.torso.rotation.x = 0.06 + sw * 0.06
          if (parts.head) parts.head.rotation.x = 0.1 + sw * 0.08
        } else if (wl === 'saw') { // 锯：快速来回推拉
          const sw = Math.sin(wt * 5.0)
          if (parts.armR) parts.armR.rotation.x = -1.15 + sw * 0.42
          if (parts.armL) parts.armL.rotation.x = -0.85 + sw * 0.18
          if (parts.torso) parts.torso.rotation.x = 0.14 + sw * 0.03
        } else if (wl === 'paint') { // 刷：慢速上下刷墙（偶尔侧移）
          const sw = Math.sin(wt * 1.7)
          if (parts.armR) { parts.armR.rotation.x = -1.5 + sw * 0.5; parts.armR.rotation.z = Math.sin(wt * 0.8) * 0.15 }
          if (parts.armL) parts.armL.rotation.x = -0.3
          if (parts.head) parts.head.rotation.y = Math.sin(wt * 0.4) * 0.15
        } else { // mop 拖地：双手持拖把左右推
          const sw = Math.sin(wt * 2.1)
          if (parts.armR) parts.armR.rotation.x = -0.85 + sw * 0.22
          if (parts.armL) parts.armL.rotation.x = -0.85 - sw * 0.22
          if (parts.torso) { parts.torso.rotation.y = sw * 0.14; parts.torso.rotation.x = 0.1 }
        }
        rec.grp.position.y = gz
      } else if (n.hostile) {
        // v39：敌对追击（被坦白的 BRC 员工）——步态 + 右臂举起（威慑）
        if (parts.legL) parts.legL.rotation.x = Math.sin(rec.phase) * amp
        if (parts.legR) parts.legR.rotation.x = -Math.sin(rec.phase) * amp
        if (parts.armL) parts.armL.rotation.x = -Math.sin(rec.phase) * amp * 0.6
        if (parts.armR) parts.armR.rotation.x = -1.5
        if (parts.torso) { parts.torso.rotation.x = 0.08; parts.torso.scale.y = 1 }
        if (parts.head) parts.head.rotation.y = 0
        rec.grp.position.y = gz + Math.abs(Math.sin(rec.phase)) * amp * 0.12
      } else {
        if (parts.legL) parts.legL.rotation.x = Math.sin(rec.phase) * amp
        if (parts.legR) parts.legR.rotation.x = -Math.sin(rec.phase) * amp
        if (parts.armL) parts.armL.rotation.x = -Math.sin(rec.phase) * amp * 0.8
        if (parts.armR) parts.armR.rotation.x = Math.sin(rec.phase) * amp * 0.8
        if (parts.torso) { parts.torso.scale.y = 1 + Math.sin(t * 1.8) * 0.02; parts.torso.rotation.x = 0; parts.torso.rotation.y = 0 }
        if (parts.head) { parts.head.rotation.y = Math.sin(t * 0.55) * 0.4; parts.head.rotation.x = 0 }
        rec.grp.position.y = gz + Math.abs(Math.sin(rec.phase)) * amp * 0.12
      }
      // v56：乐手乔伊的吉他位姿插值（演奏时挪到身前，平时斜背在背后）
      if (n.id === 'joey') {
        const gtr = parts.torso?.children.find((o) => (o as THREE.Object3D).userData.joeyGuitar) as THREE.Group | undefined
        if (gtr) {
          const playing = engine.joeyPlaying && !n.dead && !n.hostile
          rec.guitarK = Math.max(0, Math.min(1, rec.guitarK + dt * (playing ? 3.5 : -3.5)))
          const k = rec.guitarK
          gtr.position.set(-0.1 + 0.14 * k, 0.06 - 0.11 * k, -0.2 + 0.36 * k) // 背后 → 身前
          gtr.rotation.z = 0.3 - 0.15 * k
          gtr.rotation.y = -0.1 * k
        }
      }
      // 自言自语气泡（朝向玩家；尸体不出气泡）
      const txt = n.bubbleT > 0 && !n.dead ? n.bubbleText : ''
      if (txt !== rec.text) { rec.text = txt; this.drawBubble(rec, txt) }
      rec.bubble.visible = txt.length > 0
      if (rec.bubble.visible) {
        rec.bubble.position.set(n.x, gz + 2.05, n.y)
        rec.bubble.rotation.y = Math.atan2(engine.player.x - n.x, engine.player.y - n.y)
      }
    }
    for (const [id, rec] of this.npcMeshes) {
      if (!seen.has(id)) {
        this.scene.remove(rec.grp)
        this.scene.remove(rec.bubble)
        rec.bubbleTex.dispose()
        this.npcMeshes.delete(id)
      }
    }
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
      // v29a：液体瓦片上的漂浮物贴水面渲染（低悬浮+轻微起伏），不再按陆地的 +0.45 悬空
      const li = Math.floor(it.y) * m.w + Math.floor(it.x)
      const onLiquid = it.z !== undefined && m.liquid[li] !== 0
      const y = (it.z ?? floorHeight(m, it.x, it.y)) + (onLiquid ? 0.1 : 0.45) + Math.sin(this.time * 1.6 + grp.userData.phase) * (onLiquid ? 0.035 : 0.08)
      grp.position.set(it.x, y, it.y)
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
    const c01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v)
    for (const [s, g] of this.animatedStructMeshes) {
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
      const isDoor = k0 === 'hoteldoor' || k0 === 'rollerdoor' || k0 === 'glassdoor' || k0 === 'inkdoor' || k0 === 'bargate'
      // v55：留声机唱盘持续旋转（L5；data.on=0=E 交互停止——停转停播同标记）
      if (k0 === 'phonograph') {
        const spin = g.userData.spin as THREE.Group | undefined
        if (spin && s.data?.on !== 0) spin.rotation.y = ((g.userData.spinAngle as number) ?? 0) + dt * 2.4
        if (spin) g.userData.spinAngle = spin.rotation.y
        continue
      }
      // v55：L5 休息室桌上饮料——取走（data.searched=1）后隐藏瓶组
      if (k0 === 'table' && s.data?.drink) {
        const dg = g.userData.drinkGrp as THREE.Group | undefined
        if (dg) dg.visible = s.data.searched !== 1
        continue
      }
      // v54：白名单扩到全部容器（CONTAINER_ANIM 的 key；值 = open 插值速率——locker 薄钢门快脆 / safebox 厚重门迟缓）
      if (!isDoor && !(k0 in CONTAINER_ANIM)) continue
      const target = isDoor ? (s.data?.open ? 1 : 0) : (s.data?.opened || s.looted ? 1 : 0)
      g.userData.open = (g.userData.open ?? 0) + (target - (g.userData.open ?? 0)) * Math.min(1, dt * (isDoor ? (k0 === 'hoteldoor' ? 4 : 6) : CONTAINER_ANIM[k0]))
      const k = g.userData.open as number
      // 逐件插值：traverse 而非只看顶层子节点——flushToWall/mountOnWall 会把可动件包进内层组
      g.traverse((ch) => {
        if (!ch.userData.lid) return
        const part = (ch.userData.part as string | undefined) ?? 'lid'
        const bx = (ch.userData.bx as number) ?? 0, by = (ch.userData.by as number) ?? 0, bz = (ch.userData.bz as number) ?? 0
        const brx = (ch.userData.brx as number) ?? 0, brz = (ch.userData.brz as number) ?? 0
        const idx = (ch.userData.idx as number) ?? 0
        // 门类（非容器）：维持既有旋/移约定
        if (k0 === 'hoteldoor') { ch.rotation.y = -k * 1.55 * ((g.userData.swing as number) ?? 1); return } // v10：铰链门向门洞内侧旋开 ~89°（不穿侧墙；双开门镜像对开）
        if (k0 === 'rollerdoor') { ch.position.y = k * 1.85; ch.scale.y = 1 - k * 0.8; return } // v10：卷帘收进卷轴盒（不再悬穿门头/天花板）
        if (k0 === 'glassdoor') { ch.position.x = k * 0.95; return } // v10：玻璃门侧滑入墙袋（不再悬在半空）
        if (k0 === 'inkdoor') { ch.rotation.y = k * 1.85; return } // v31：墨黑色金属门向走廊内侧旋开 ~106°
        if (k0 === 'bargate') { ch.rotation.y = k * 1.6; return } // v51：栅栏门扇绕铰链旋开 ~92°
        // v54：容器各按实物的开法（全部「基准 + f(k)」绝对赋值，确定性）
        switch (k0) {
          case 'crate': // 箱盖先上翻到底，再整体后滑（v54：滑移收敛 0.34——盖沿贴住箱口后缘即可）
            ch.rotation.x = -c01(k / 0.55) * 1.9
            ch.position.z = bz - c01((k - 0.55) / 0.45) * 0.34
            break
          case 'car': // 后备箱向上掀起
            ch.rotation.x = -k * 1.9
            break
          case 'corpse': // 盖布侧滑掀开 + 微倾
            ch.position.x = bx + k * 0.8; ch.rotation.z = brz + k * 0.3
            break
          case 'cabinet': // 双开门对称外摆
            ch.rotation.y = (part === 'doorL' ? -1 : 1) * k * 1.6
            break
          case 'dresser': // 抽屉自上而下依次抽出（v54：幅度略收 0.17——抽屉盒体半开悬在柜体前可见）
            ch.position.z = bz + c01(k * 1.6 - idx * 0.3) * 0.17
            break
          case 'megcrate': // 两片上盖先上抬再对滑
            ch.position.y = by + c01(k / 0.35) * 0.12
            ch.position.x = bx + (part === 'lidL' ? -1 : 1) * c01((k - 0.35) / 0.65) * 0.5
            break
          case 'locker': // 薄钢门快速外摆（速率见 CONTAINER_ANIM）
            ch.rotation.y = -k * 1.2
            break
          case 'toolbox': // 锁扣先弹开，箱盖后翻到底（~126°）
            if (part === 'latch') { ch.rotation.x = c01(k / 0.25) * 0.9; ch.position.y = by - c01(k / 0.25) * 0.04 }
            else ch.rotation.x = -c01((k - 0.15) / 0.85) * 2.2
            break
          case 'suitcase': // 搭扣先弹开，上盖再翻平
            if (part === 'latch') { ch.position.z = bz + c01(k / 0.3) * 0.05; ch.rotation.x = c01(k / 0.3) * 0.7 }
            else ch.rotation.x = -c01((k - 0.2) / 0.8) * 1.5
            break
          case 'fridge': // 双门外摆（上门幅度更大）+ 开门灯渐亮（looted 常灭）
            if (part === 'light') {
              const lk = s.looted ? 0 : k
              ;(((ch as THREE.Mesh).material) as THREE.MeshBasicMaterial).color.setRGB(0.29 + 0.71 * lk, 0.29 + 0.62 * lk, 0.26 + 0.44 * lk)
            } else ch.rotation.y = -k * (part === 'doorT' ? 1.1 : 0.85)
            break
          case 'safebox': // 转盘先旋转，厚重门再缓慢外摆（速率见 CONTAINER_ANIM）
            if (part === 'dial') ch.rotation.y = c01(k / 0.35) * 4.5
            else ch.rotation.y = c01((k - 0.35) / 0.65) * 1.25
            break
          case 'mailbox': // 投递口小门向外垂开 + 小红旗倒下
            ch.rotation.x = part === 'flag' ? k * 1.2 : -k * 1.3
            break
          case 'barrel': // 桶盖向上跳起，翻落到桶边地面
            ch.position.set(bx + k * 0.34, by + Math.sin(Math.min(k * 1.2, 1) * Math.PI) * 0.4 - k * 0.87, bz + k * 0.26)
            ch.rotation.z = brz + k * 1.35
            break
          case 'bookcase': // 每层被抽出的那本书外移微倾
            ch.position.z = bz + k * 0.1; ch.rotation.x = brx - k * 0.35
            break
          case 'bonepile': // 散骨下沉四散，头骨微沉
            if (part === 'skull') { ch.position.y = by - k * 0.05; ch.rotation.z = brz + k * 0.12 }
            else {
              ch.position.set(bx * (1 + 0.22 * k), by * (1 - 0.5 * k), bz * (1 + 0.22 * k))
              ch.rotation.z = brz + k * 0.18 * ((idx % 3) - 1)
            }
            break
          case 'campstall': // 摊布前缘掀起
            ch.rotation.x = brx - k * 0.5
            break
          case 'elecbox': // 箱门绕左铰链外摆
            ch.rotation.y = -k * 1.5
            break
          case 'binshelf': // 收纳箱错落抽出（binshelf 非 CONTAINERS 容器，仅作动画约定预留）
            ch.position.z = bz + k * (0.08 + 0.04 * (idx % 3))
            break
        }
      })
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

  // v54：L4 虚空雨丝重生点（随机附近虚空瓦片；anyY=初始化时全程散布，否则从顶部落入；
  // 瓦片归属钳制——x/z 永远落在锚定虚空瓦片内，雨丝不漏进窗内）
  private respawnVoidRain(m: GameMap, i: number, anyY: boolean) {
    const st = this.voidRainState!
    const ti = this.voidTiles[(Math.random() * this.voidTiles.length) | 0]
    const tx = ti % m.w, tz = Math.floor(ti / m.w)
    st[i * 7] = tx + Math.random() * 0.9
    st[i * 7 + 1] = anyY ? -2.4 + Math.random() * 6 : 3.2 + Math.random() * 2.4
    st[i * 7 + 2] = tz + Math.random() * 0.9
    st[i * 7 + 3] = 6 + Math.random() * 3 // 下落速度
    st[i * 7 + 4] = 0.35 + Math.random() * 0.3 // 斜落横向漂移
    st[i * 7 + 5] = tx // 锚定瓦片（x 向钳制上界=tx+0.98）
    st[i * 7 + 6] = tz
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

    // v54：L4 窗景区窗外虚空——雨丝（持续下落、斜落微飘）+ 永不消散的雨雾片（缓慢漂移）；
    // 只覆盖玩家附近 14m 内的 outdoor 虚空格（每 0.5s 重扫一次瓦片表，开销可控）
    if (def.id === 4 && engine.map) {
      const m = engine.map
      this.voidScanT -= dt
      if (this.voidScanT <= 0) {
        this.voidScanT = 0.5
        this.voidTiles.length = 0
        this.voidFogTiles.length = 0
        const R = 14
        const x0 = Math.max(0, Math.floor(p.x) - R), x1 = Math.min(m.w - 1, Math.floor(p.x) + R)
        const y0 = Math.max(0, Math.floor(p.y) - R), y1 = Math.min(m.h - 1, Math.floor(p.y) + R)
        const outAt = (x: number, y: number) => (x < 0 || y < 0 || x >= m.w || y >= m.h ? 0 : m.outdoor[y * m.w + x])
        const inFloorAt = (x: number, y: number) => // 室内地板（非 outdoor 的可走地板=窗/房间侧）
          x >= 0 && y >= 0 && x < m.w && y < m.h && m.tiles[y * m.w + x] === 1 && m.outdoor[y * m.w + x] !== 1
        for (let y = y0; y <= y1; y++)
          for (let x = x0; x <= x1; x++) {
            if (outAt(x, y) !== 1) continue
            this.voidTiles.push(y * m.w + x)
            // 边界格（四邻有室内地板=贴窗列）不作雾片锚点——雾片半宽+漂移严格小于其到窗玻璃的距离
            if (!(inFloorAt(x + 1, y) || inFloorAt(x - 1, y) || inFloorAt(x, y + 1) || inFloorAt(x, y - 1))) this.voidFogTiles.push(y * m.w + x)
          }
      }
      if (this.voidTiles.length) {
        if (!this.voidRain) {
          // 懒初始化：雨丝线段池（220 根）+ 雾片 ×6（径向渐变程序纹理）
          const N = 220
          const geo = new THREE.BufferGeometry()
          geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 6), 3))
          this.voidRain = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: '#cdd9de', transparent: true, opacity: 0.55, depthWrite: false }))
          this.voidRain.frustumCulled = false
          this.scene.add(this.voidRain)
          this.voidRainState = new Float32Array(N * 7)
          for (let i = 0; i < N; i++) this.respawnVoidRain(m, i, true)
          const cv = document.createElement('canvas'); cv.width = cv.height = 128
          const g2 = cv.getContext('2d')!
          const rg = g2.createRadialGradient(64, 64, 8, 64, 64, 64)
          rg.addColorStop(0, 'rgba(170,180,186,0.55)'); rg.addColorStop(1, 'rgba(170,180,186,0)')
          g2.fillStyle = rg; g2.fillRect(0, 0, 128, 128)
          const fogTex = new THREE.CanvasTexture(cv)
          for (let i = 0; i < 6; i++) {
            const f = new THREE.Mesh(
              new THREE.PlaneGeometry(1.5, 2.0), // 小型雾片（半宽 0.75 + 漂移 0.15 < 锚格到窗玻璃距离——窗内零穿透）
              new THREE.MeshBasicMaterial({ map: fogTex, transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide, fog: false }),
            )
            this.scene.add(f)
            this.voidFog.push(f)
          }
        }
        this.voidRain!.visible = true
        const st = this.voidRainState!
        const posA = this.voidRain!.geometry.attributes.position as THREE.BufferAttribute
        for (let i = 0; i < posA.count / 2; i++) {
          st[i * 7 + 1] -= st[i * 7 + 3] * dt // 下落
          st[i * 7] += st[i * 7 + 4] * dt // 斜落微飘
          // 瓦片归属钳制：出界（或坠深）即重生——雨丝严格限制在虚空条带一侧，不漏进窗内
          if (st[i * 7 + 1] < -2.5 || st[i * 7] >= st[i * 7 + 5] + 0.98) this.respawnVoidRain(m, i, false)
          const x = st[i * 7], y = st[i * 7 + 1], z = st[i * 7 + 2]
          posA.setXYZ(i * 2, x, y, z)
          posA.setXYZ(i * 2 + 1, x - st[i * 7 + 4] * 0.055, y + 0.38, z)
        }
        posA.needsUpdate = true
        for (let i = 0; i < this.voidFog.length; i++) {
          const f = this.voidFog[i]
          if (!this.voidFogTiles.length) { f.visible = false; continue }
          f.visible = true
          const ti = this.voidFogTiles[(i * 97) % this.voidFogTiles.length]
          const bx = (ti % m.w) + 0.5, bz = Math.floor(ti / m.w) + 0.5
          f.position.set(bx + Math.sin(this.time * 0.07 + i * 2.1) * 0.15, -0.9 + (i % 3) * 1.1, bz + Math.cos(this.time * 0.05 + i * 1.7) * 0.15)
          f.rotation.y = Math.atan2(p.x - f.position.x, p.y - f.position.z) // 圆柱广告牌面向玩家
        }
      } else if (this.voidRain) {
        this.voidRain.visible = false
        for (const f of this.voidFog) f.visible = false
      }
    } else if (this.voidRain) {
      this.voidRain.visible = false
      for (const f of this.voidFog) f.visible = false
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
