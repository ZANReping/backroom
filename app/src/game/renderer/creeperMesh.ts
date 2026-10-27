// 爬菌（Entity 17）重制·阶段 1：建模（只做模型与预览，不含 AI / 机制）。
// 依据：中文维基 Entity 17（感染体可凭体表亮白色增生物辨认，外观同虫草菌 Torrubiella pulvinata 寄生的地窖蜘蛛）与附图
// （被寄生的地窖蜘蛛：细长腿的每个关节上一颗亮白毛绒球，身体是一团更大的白球，细菌丝连到蛛网上）。
//
// 内容：
//  1. 菌体通用部件：白绒球（InstancedMesh 实心球 + 菲涅尔亮边 + 噪声斑驳；外圈一层朝向镜头的「绒毛晕」公告板，按场景光照着色），
//     菌丝细线（LineSegments），growCreep()：在任意宿主的指定节点（骨骼/关节组）上按 1–4 阶挂菌；
//     creepDecay()：宿主材质随阶段灰白、干瘪，并长出白色霉斑（克隆材质，不动原模型）。
//  2. 感染宿主：buildInfectedRat / buildInfectedArachnid（1–4 阶外观 + 僵硬姿态参数 poseCreepRat / poseCreepArachnid）。
//  3. 僵尸蜘蛛装饰：buildZombieSpiderDecor（静态尸体 + 一小片乱网 + 连网菌丝）。
//  4. 爬菌人（5 阶）：buildCreeperHuman（整只程序化雕刻、无蒙皮：全身焦黑龟裂露肌肉、腰下自断拖着脊骨、细长双臂撑地爬行、长弯爪、
//     秃头一侧鼓出白色增生团挤歪五官、下颌脱臼露牙、无睑充血眼球、白绒增生团里嵌余烬、碎布条）。
//  5. 第一人称手臂：creepHandOverlay(hand) 0–4 阶菌斑叠加 + creepHandLook（4 阶发红）+ CREEP_CLAW_HAND_POSE（4 阶爪形空手）。
// 约定：实体正面 +X、原点在地面（与 ratMesh / arachnidMesh 相同）；人物 +Z 朝前（retroNpc）。
import * as THREE from 'three'
import { rng, sweep, V } from './houndMesh'
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { installL0EnvironmentShader } from './l0EnvironmentShader'
import { installL1DynamicProbe } from './l1Probes'
import { buildRatMesh, type RatRig } from './ratMesh'
import { poseArachnid, type ArachnidRig, type ArachnidVariant } from './arachnidMesh'
import type { RatMorph } from '../entities/rats'
import type { RetroHand, HandPose, RetroHandLook } from './retroViewHand'
import { buildArachnidJob } from './arachnidMesh'
import { disposeL8Tree } from './l8ModelResources'

function drainCreepJob<T>(job: Generator<void,T,unknown>): T { let step=job.next(); while(!step.done)step=job.next(); return step.value }

/**
 * 装上 L0 环境 / L1 动态探针着色器，并把材质自己的程序缓存键接回去：installL0EnvironmentShader 会把 customProgramCacheKey
 * 换成一个固定字符串，参数相同的材质（例如同为顶点色 Lambert 的焦尸肉和小件）就会共用同一个着色器程序，后编译的那个拿到的是别人的着色器。
 */
function envShaders(m: THREE.Material, tag: string) {
  const own = m.customProgramCacheKey.bind(m)()
  installL0EnvironmentShader(m); installL1DynamicProbe(m)
  const env = m.customProgramCacheKey.bind(m)
  m.customProgramCacheKey = () => env() + '|' + tag + '|' + own
}

export type CreepStage = 0 | 1 | 2 | 3 | 4

// ======================================================================
// 共享 GLSL 噪声
// ======================================================================
const GLSL_NOISE = /* glsl */ `
float creepH(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float creepN(vec3 x){ vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(creepH(i), creepH(i + vec3(1,0,0)), f.x), mix(creepH(i + vec3(0,1,0)), creepH(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(creepH(i + vec3(0,0,1)), creepH(i + vec3(1,0,1)), f.x), mix(creepH(i + vec3(0,1,1)), creepH(i + vec3(1,1,1)), f.x), f.y), f.z); }
float creepF(vec3 p){ return 0.5 * creepN(p) + 0.3 * creepN(p * 2.03 + 7.1) + 0.2 * creepN(p * 4.07 + 3.3); }
`
// JS 端同一噪声（烘焙绒球的起伏轮廓）
const fr = (x: number) => x - Math.floor(x)
function jsH(x: number, y: number, z: number) { x = fr(x * 0.3183099 + 0.1) * 17; y = fr(y * 0.3183099 + 0.1) * 17; z = fr(z * 0.3183099 + 0.1) * 17; return fr(x * y * z * (x + y + z)) }
function jsN(x: number, y: number, z: number) {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z)
  let fx = x - ix, fy = y - iy, fz = z - iz
  fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy); fz = fz * fz * (3 - 2 * fz)
  const l = (a: number, b: number, t: number) => a + (b - a) * t
  return l(l(l(jsH(ix, iy, iz), jsH(ix + 1, iy, iz), fx), l(jsH(ix, iy + 1, iz), jsH(ix + 1, iy + 1, iz), fx), fy),
    l(l(jsH(ix, iy, iz + 1), jsH(ix + 1, iy, iz + 1), fx), l(jsH(ix, iy + 1, iz + 1), jsH(ix + 1, iy + 1, iz + 1), fx), fy), fz)
}

// ======================================================================
// 白绒球：共享几何 / 贴图 / 材质
// ======================================================================
let BALL_GEO: THREE.BufferGeometry | null = null
/** 单位绒球：二十面体细分 3 次，按噪声鼓出棉团般的起伏（烘焙一次，全体共用） */
function ballGeo() {
  if (BALL_GEO) return BALL_GEO
  const g0 = new THREE.IcosahedronGeometry(1, 3)
  g0.deleteAttribute('normal'); g0.deleteAttribute('uv')
  const g = mergeVertices(g0); g0.dispose() // 二十面体是非索引的：合并顶点后才能算出平滑法线（否则一颗颗多面体）
  const p = g.attributes.position as THREE.BufferAttribute
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i)
    const k = 0.9 + 0.13 * jsN(x * 2.6 + 5, y * 2.6, z * 2.6) + 0.07 * jsN(x * 6 + 1, y * 6 + 2, z * 6 + 3)
    p.setXYZ(i, x * k, y * k, z * k)
  }
  g.computeVertexNormals()
  g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2))
  g.userData.entityShared = true
  return (BALL_GEO = g)
}
/**
 * 阶段 3 LOD：绒球的低模版本（同一噪声起伏，只是细分少）。0 = 原版（二十面体细分 3 次，1280 三角）、1 = 细分 2 次（320）、2 = 细分 1 次（80）。
 * 渲染层按距离给实例化绒球换几何（creeperRender.applyCreepLod），材质 / 实例矩阵不变。
 */
const BALL_LOD: (THREE.BufferGeometry | null)[] = [null, null, null]
export function creepBallGeoLod(level: 0 | 1 | 2): THREE.BufferGeometry {
  if (level === 0) return ballGeo()
  const had = BALL_LOD[level]
  if (had) return had
  const g0 = new THREE.IcosahedronGeometry(1, 3 - level)
  g0.deleteAttribute('normal'); g0.deleteAttribute('uv')
  const g = mergeVertices(g0); g0.dispose()
  const p = g.attributes.position as THREE.BufferAttribute
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i)
    const k = 0.9 + 0.13 * jsN(x * 2.6 + 5, y * 2.6, z * 2.6) + 0.07 * jsN(x * 6 + 1, y * 6 + 2, z * 6 + 3)
    p.setXYZ(i, x * k, y * k, z * k)
  }
  g.computeVertexNormals()
  g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2))
  g.userData.entityShared = true
  return (BALL_LOD[level] = g)
}
let HALO_GEO: THREE.BufferGeometry | null = null
const haloGeo = () => HALO_GEO ?? (HALO_GEO = (() => { const g = new THREE.PlaneGeometry(2, 2); g.userData.entityShared = true; return g })())

let FUZZ_TEX: THREE.Texture | null = null
/**
 * 绒毛晕贴图：中心透明（被实心球挡住），r≈0.5 处一圈柔和的亮边，向外放射数百根细菌丝，越外越淡。
 * 公告板半边长 = 绒球半径 × HALO_K，所以实心球轮廓落在 uv 半径 1/HALO_K≈0.56 处。
 */
const HALO_K = 1.8
function fuzzTex(): THREE.Texture | null {
  if (FUZZ_TEX) return FUZZ_TEX
  if (typeof document === 'undefined') return null
  const S = 256, c = document.createElement('canvas'); c.width = c.height = S
  const x = c.getContext('2d')!
  const R = rng(0x17c9), C = S / 2, r0 = C / HALO_K
  // 球缘柔光圈
  const gr = x.createRadialGradient(C, C, r0 * 0.78, C, C, r0 * 1.32)
  gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.25, 'rgba(255,255,255,0.55)'); gr.addColorStop(0.5, 'rgba(255,255,255,0.32)'); gr.addColorStop(1, 'rgba(255,255,255,0)')
  x.fillStyle = gr; x.fillRect(0, 0, S, S)
  // 放射状菌丝：从球缘内侧起笔，弯一点，长短不一
  x.lineCap = 'round'
  for (let i = 0; i < 2200; i++) {
    const a = R() * Math.PI * 2, s0 = r0 * (0.86 + R() * 0.16), L = r0 * (0.12 + Math.pow(R(), 1.8) * 0.62)
    const bend = (R() - 0.5) * 0.5, a1 = a + bend * 0.25
    const xa = C + Math.cos(a) * s0, ya = C + Math.sin(a) * s0
    const xm = C + Math.cos(a + bend * 0.12) * (s0 + L * 0.5), ym = C + Math.sin(a + bend * 0.12) * (s0 + L * 0.5)
    const xb = C + Math.cos(a1) * (s0 + L), yb = C + Math.sin(a1) * (s0 + L)
    const al = 0.16 + R() * 0.4
    const lg = x.createLinearGradient(xa, ya, xb, yb)
    lg.addColorStop(0, `rgba(255,255,255,${al})`); lg.addColorStop(1, 'rgba(255,255,255,0)')
    x.strokeStyle = lg; x.lineWidth = 0.6 + R() * 0.9
    x.beginPath(); x.moveTo(xa, ya); x.quadraticCurveTo(xm, ym, xb, yb); x.stroke()
  }
  // 中心挖空（球体内部不需要，避免与实心球表面叠出灰边）
  x.globalCompositeOperation = 'destination-out'
  const hole = x.createRadialGradient(C, C, 0, C, C, r0 * 0.8)
  hole.addColorStop(0, 'rgba(0,0,0,1)'); hole.addColorStop(0.8, 'rgba(0,0,0,1)'); hole.addColorStop(1, 'rgba(0,0,0,0)')
  x.fillStyle = hole; x.fillRect(0, 0, S, S)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; t.anisotropy = 2
  t.userData.entityShared = true
  return (FUZZ_TEX = t)
}
let GLOW_TEX: THREE.Texture | null = null
/** 余烬光晕：橙色径向渐变（加色混合） */
function glowTex(): THREE.Texture | null {
  if (GLOW_TEX) return GLOW_TEX
  if (typeof document === 'undefined') return null
  const S = 64, c = document.createElement('canvas'); c.width = c.height = S
  const x = c.getContext('2d')!
  const g = x.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2)
  g.addColorStop(0, 'rgba(255,220,150,1)'); g.addColorStop(0.18, 'rgba(255,150,50,0.8)'); g.addColorStop(0.5, 'rgba(255,90,20,0.22)'); g.addColorStop(1, 'rgba(255,60,10,0)')
  x.fillStyle = g; x.fillRect(0, 0, S, S)
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.userData.entityShared = true
  return (GLOW_TEX = t)
}

/**
 * 阶段 2：绒球呼吸 / 死后鼓胀、余烬明灭——全部在着色器里按 uniform 算，不逐个改实例矩阵。
 *  · uCreepTime：全局时间（秒），整个游戏共用一个 uniform 对象 CREEP_TIME，渲染层每帧 setCreepTime(t) 一次；
 *  · 每颗绒球的呼吸相位取自它的实例位置（instanceMatrix[3]）的哈希，所以同一团里各颗不同步；
 *  · uCreepPuff：整只宿主的鼓胀倍数（默认 1，共享常量）；某只实体需要单独改（死亡鼓胀）时，creepUniforms(root) 给它换上一套
 *    私有材质（与共享材质同一个着色器程序，只多一份 uniform），见下。
 *  · uCreepEmber：余烬强度倍数（爬菌人扑击 / 尖叫时变亮，死亡时熄灭）。
 */
export const CREEP_TIME = { value: 0 }
/** 渲染层每帧调用一次（秒）。所有绒球的呼吸、余烬的闪烁都读这一个 uniform */
export function setCreepTime(t: number) { CREEP_TIME.value = t }
/** 呼吸幅度（半径相对变化，微弱）与周期（秒） */
export const CREEP_BREATH = { amp: { value: 0.035 }, period: 2.6 }
const ONE = { value: 1 }
const GLSL_BREATH = /* glsl */ `
uniform float uCreepTime, uCreepPuff, uCreepBreathA;
float creepHash3(vec3 c){ return fract(sin(dot(c, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
float creepBreathK(vec3 c){ float ph = creepHash3(c) * 6.2831853; return (1.0 + uCreepBreathA * sin(uCreepTime * ${(Math.PI * 2 / 2.6).toFixed(4)} + ph)) * uCreepPuff; }
float creepFlick(vec3 c){
  // 余烬明灭：两层不同频率的值噪声相乘 + 偶发的骤亮，按实例位置错开
  float h = creepHash3(c), t = uCreepTime * (1.3 + 1.7 * h) + h * 40.0;
  float i0 = floor(t), f0 = fract(t); f0 = f0 * f0 * (3.0 - 2.0 * f0);
  float n0 = mix(creepHash3(vec3(i0, h, 1.0)), creepHash3(vec3(i0 + 1.0, h, 1.0)), f0);
  float t2 = uCreepTime * (5.0 + 4.0 * h) + h * 17.0, i1 = floor(t2), f1 = fract(t2);
  float n1 = mix(creepHash3(vec3(i1, h, 2.0)), creepHash3(vec3(i1 + 1.0, h, 2.0)), f1 * f1 * (3.0 - 2.0 * f1));
  return clamp(0.15 + 1.25 * n0 * (0.55 + 0.45 * n1) + 0.6 * step(0.93, n1), 0.05, 1.8);
}
`
interface CreepMatU { puff: { value: number }; ember: { value: number } }
/** 实例化公告板：顶点着色器把单位方片换成「实例中心 + 镜头平面内偏移」，再朝镜头推一点（不被所在的球面吃掉）。breath：大小随绒球呼吸 / 鼓胀 */
function billboard(mat: THREE.Material, size: number, push: number, sphereNormal: boolean, breath?: CreepMatU, flicker?: CreepMatU) {
  const prev = mat.onBeforeCompile.bind(mat)
  mat.onBeforeCompile = (sh, r) => {
    prev(sh, r)
    if (breath || flicker) {
      Object.assign(sh.uniforms, { uCreepTime: CREEP_TIME, uCreepPuff: breath?.puff ?? ONE, uCreepBreathA: CREEP_BREATH.amp, uCreepEmber: flicker?.ember ?? ONE })
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uCreepEmber;\nvarying float vCreepFl;\n' + GLSL_BREATH)
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vCreepFl;')
    }
    const k = breath ? ' * creepBreathK(instanceMatrix[3].xyz)' : flicker ? ' * (0.55 + 0.45 * vCreepFl)' : ''
    sh.vertexShader = sh.vertexShader
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvec2 creepCorner = position.xy;\ntransformed = vec3(0.0);')
      .replace('#include <project_vertex>', `#include <project_vertex>
      {
        #ifdef USE_INSTANCING
        ${flicker ? 'vCreepFl = creepFlick(instanceMatrix[3].xyz) * uCreepEmber;' : ''}
        float creepS = length((modelViewMatrix * instanceMatrix)[0].xyz)${k};
        #else
        ${flicker ? 'vCreepFl = uCreepEmber;' : ''}
        float creepS = length(modelViewMatrix[0].xyz);
        #endif
        mvPosition.xy += creepCorner * creepS * ${size.toFixed(3)};
        mvPosition.z += creepS * ${push.toFixed(3)};
        gl_Position = projectionMatrix * mvPosition;
      }`)
    if (flicker) sh.fragmentShader = sh.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb *= vCreepFl;')
    else if (breath || flicker) sh.vertexShader = sh.vertexShader.replace('vec2 creepCorner', 'vCreepFl = 1.0;\nvec2 creepCorner')
    if (sphereNormal) {
      // 晕圈的法线按「镜头空间里的球面」给：边缘朝外、中心朝镜头 → 光照与实心球一致（逆光处晕圈也暗）
      sh.vertexShader = sh.vertexShader.replace('#include <defaultnormal_vertex>', `#include <defaultnormal_vertex>
        { vec2 q = position.xy * 0.62; transformedNormal = normalize(vec3(q, sqrt(max(0.08, 1.0 - dot(q, q))))); }`)
    }
  }
  const key = mat.customProgramCacheKey.bind(mat)
  mat.customProgramCacheKey = () => key() + '|creepBillboard' + size + ':' + push + (sphereNormal ? 'n' : '') + (breath ? 'b' : '') + (flicker ? 'f' : '')
}

/** 可调参数（渲染阶段按关卡亮度微调）：自发光托底、菲涅尔亮边、晕圈不透明度 */
export const CREEP_FLUFF = {
  emissive: new THREE.Color('#3a3936'),
  rim: { value: 0.9 },
  /** 绒毛散射：背光面也透出一层亮（软化明暗交界，去掉塑料感） */
  wrap: { value: 0.32 },
  haloOpacity: 0.85,
}
const SHARED_U: CreepMatU = { puff: ONE, ember: ONE }
let CORE_MAT: THREE.MeshLambertMaterial | null = null
let HALO_MAT: THREE.MeshLambertMaterial | null = null
let EMBER_MAT: THREE.MeshBasicMaterial | null = null
let EMBER_HALO_MAT: THREE.MeshBasicMaterial | null = null
let THREAD_MAT: THREE.LineBasicMaterial | null = null
let RAW_MAT: THREE.MeshLambertMaterial | null = null

function makeCoreMat(u: CreepMatU) {
  const m = new THREE.MeshLambertMaterial({ color: '#ffffff', emissive: CREEP_FLUFF.emissive })
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, { uCreepRim: CREEP_FLUFF.rim, uCreepWrap: CREEP_FLUFF.wrap, uCreepTime: CREEP_TIME, uCreepPuff: u.puff, uCreepBreathA: CREEP_BREATH.amp })
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vCreepP;\n' + GLSL_BREATH)
      // 呼吸：实例化的绒球绕自身中心缩放（相位取实例位置）；非实例的瘤体沿法线轻微起伏
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vCreepP = position * 3.1;
        #ifdef USE_INSTANCING
        vCreepP += instanceMatrix[3].xyz * 97.0;
        transformed *= creepBreathK(instanceMatrix[3].xyz);
        #else
        transformed += objectNormal * (0.0016 * sin(uCreepTime * 2.4166) + 0.03 * (uCreepPuff - 1.0));
        #endif`)
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vCreepP;\nuniform float uCreepRim, uCreepWrap;\n' + GLSL_NOISE)
      // 噪声斑驳：棉团的明暗起伏（细小的凹处略灰）
      .replace('#include <color_fragment>', `#include <color_fragment>
        float creepMot = creepF(vCreepP * 2.2);
        float creepFib = creepN(vCreepP * 24.0);
        diffuseColor.rgb *= 0.86 + 0.16 * creepMot + 0.08 * (creepFib - 0.5);`)
      // 菲涅尔亮边：绒毛在轮廓处透光，边缘更亮（不是塑料高光）
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        float creepFr = 1.0 - abs(dot(normalize(normal), normalize(vViewPosition)));
        totalEmissiveRadiance += diffuseColor.rgb * (uCreepRim * pow(creepFr, 1.8) * (0.7 + 0.5 * creepMot) + uCreepWrap * (0.6 + 0.4 * creepFib));`)
  }
  m.customProgramCacheKey = () => 'creepCore2'
  envShaders(m, 'creepCore2')
  return m
}
function coreMat() { if (!CORE_MAT) { CORE_MAT = makeCoreMat(SHARED_U); CORE_MAT.userData.entityShared = true } return CORE_MAT }
function makeHaloMat(u: CreepMatU) {
  const m = new THREE.MeshLambertMaterial({ color: '#ffffff', map: fuzzTex(), transparent: true, depthWrite: false, opacity: CREEP_FLUFF.haloOpacity, emissive: CREEP_FLUFF.emissive, emissiveMap: fuzzTex(), side: THREE.DoubleSide })
  billboard(m, HALO_K, 0.35, true, u)
  envShaders(m, 'creepHalo')
  return m
}
function haloMat() { if (!HALO_MAT) { HALO_MAT = makeHaloMat(SHARED_U); HALO_MAT.userData.entityShared = true } return HALO_MAT }
/** 余烬小点：基础材质，颜色即「自发光」；按实例位置取噪声做明灭（uCreepEmber 整体倍数） */
function makeEmberMat(u: CreepMatU) {
  const m = new THREE.MeshBasicMaterial({ color: '#ff8a2a', toneMapped: false })
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, { uCreepTime: CREEP_TIME, uCreepPuff: ONE, uCreepBreathA: CREEP_BREATH.amp, uCreepEmber: u.ember })
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uCreepEmber;\nvarying float vCreepFl;\n' + GLSL_BREATH)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        #ifdef USE_INSTANCING
        vCreepFl = creepFlick(instanceMatrix[3].xyz) * uCreepEmber;
        #else
        vCreepFl = uCreepEmber;
        #endif
        transformed *= 0.7 + 0.3 * min(vCreepFl, 1.4);`)
    // 暗下去时偏暗红（快熄灭的炭），亮起来偏黄
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vCreepFl;')
      .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb = mix(vec3(0.35, 0.05, 0.02), mix(diffuseColor.rgb, vec3(1.0, 0.85, 0.5), clamp(vCreepFl - 1.0, 0.0, 1.0)), clamp(vCreepFl, 0.0, 1.0)) * max(vCreepFl, 0.12);')
  }
  m.customProgramCacheKey = () => 'creepEmber'
  return m
}
function emberMat() { if (!EMBER_MAT) { EMBER_MAT = makeEmberMat(SHARED_U); EMBER_MAT.userData.entityShared = true } return EMBER_MAT }
function makeEmberHaloMat(u: CreepMatU) {
  const m = new THREE.MeshBasicMaterial({ color: '#ffffff', map: glowTex(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false })
  billboard(m, 3.2, 1.2, false, undefined, u)
  return m
}
function emberHaloMat() { if (!EMBER_HALO_MAT) { EMBER_HALO_MAT = makeEmberHaloMat(SHARED_U); EMBER_HALO_MAT.userData.entityShared = true } return EMBER_HALO_MAT }

/**
 * 给某只实体换上私有的绒球 / 余烬材质（只在需要单独控制时才建：死亡鼓胀、爬菌人余烬随动作变亮变暗）。
 * 返回它的 uniform 句柄：puff = 绒球鼓胀倍数（1 = 正常），ember = 余烬强度（1 = 正常）。私有材质与共享材质同一个着色器程序。
 * 结果缓存在 root.userData.creepU（实体销毁时随之丢弃；dispose 由 disposeCreepUniforms 负责）。
 */
export function creepUniforms(root: THREE.Object3D): CreepMatU {
  const had = root.userData.creepU as (CreepMatU & { mats: THREE.Material[] }) | undefined
  if (had) return had
  const u = { puff: { value: 1 }, ember: { value: 1 }, mats: [] as THREE.Material[] }
  const priv = new Map<THREE.Material, THREE.Material>()
  const swap = (src: THREE.Material, make: () => THREE.Material) => { let m = priv.get(src); if (!m) { m = make(); priv.set(src, m); u.mats.push(m) } return m }
  root.traverse((o) => {
    const m = o as THREE.Mesh
    if (!m.isMesh) return
    if (m.material === CORE_MAT) m.material = swap(CORE_MAT, () => makeCoreMat(u))
    else if (m.material === HALO_MAT) m.material = swap(HALO_MAT, () => makeHaloMat(u))
    else if (m.material === EMBER_MAT) m.material = swap(EMBER_MAT, () => makeEmberMat(u))
    else if (m.material === EMBER_HALO_MAT) m.material = swap(EMBER_HALO_MAT, () => makeEmberHaloMat(u))
  })
  root.userData.creepU = u
  return u
}
/** 释放 creepUniforms 建的私有材质（实体回收时调用） */
export function disposeCreepUniforms(root: THREE.Object3D) {
  const u = root.userData.creepU as { mats: THREE.Material[] } | undefined
  if (!u) return
  for (const m of u.mats) m.dispose()
  delete root.userData.creepU
}
function threadMat() {
  if (THREAD_MAT) return THREAD_MAT
  THREAD_MAT = new THREE.LineBasicMaterial({ color: '#dedbd0', transparent: true, opacity: 0.5, depthWrite: false })
  THREAD_MAT.userData.entityShared = true
  return THREAD_MAT
}
/** 焦痂 / 脱皮创面等小块实体（顶点色） */
function rawMat() {
  if (RAW_MAT) return RAW_MAT
  RAW_MAT = new THREE.MeshLambertMaterial({ color: '#ffffff', vertexColors: true })
  envShaders(RAW_MAT, 'creepRaw')
  RAW_MAT.userData.entityShared = true
  return RAW_MAT
}

// ======================================================================
// 表面取样
// ======================================================================
export interface SurfPt { p: THREE.Vector3; n: THREE.Vector3 }
/** 一组三角形（节点局部坐标）：按面积随机取点 */
export class CreepSurface {
  private tri: number[] = [] // 每个三角形 9 个坐标
  private cum: number[] = []
  total = 0
  addTriangle(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3) {
    const ar = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a)).length() / 2
    if (!(ar > 1e-10)) return
    this.tri.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z)
    this.total += ar; this.cum.push(this.total)
  }
  /** 把一个网格的三角形（经 m 变换）加入 */
  addGeometry(g: THREE.BufferGeometry, m?: THREE.Matrix4, filter?: (i0: number, i1: number, i2: number) => boolean) {
    const p = g.attributes.position as THREE.BufferAttribute, ix = g.index
    const n = ix ? ix.count : p.count
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3()
    for (let i = 0; i + 2 < n; i += 3) {
      const i0 = ix ? ix.getX(i) : i, i1 = ix ? ix.getX(i + 1) : i + 1, i2 = ix ? ix.getX(i + 2) : i + 2
      if (filter && !filter(i0, i1, i2)) continue
      a.fromBufferAttribute(p, i0); b.fromBufferAttribute(p, i1); c.fromBufferAttribute(p, i2)
      if (m) { a.applyMatrix4(m); b.applyMatrix4(m); c.applyMatrix4(m) }
      this.addTriangle(a, b, c)
    }
  }
  get size() { return this.cum.length }
  sample(R: () => number, out?: SurfPt): SurfPt {
    const o = out ?? { p: new THREE.Vector3(), n: new THREE.Vector3() }
    if (!this.cum.length) { o.p.set(0, 0, 0); o.n.set(0, 1, 0); return o }
    const t = R() * this.total
    let lo = 0, hi = this.cum.length - 1
    while (lo < hi) { const mid = (lo + hi) >> 1; if (this.cum[mid] < t) lo = mid + 1; else hi = mid }
    const k = lo * 9, T = this.tri
    let u = R(), v = R(); if (u + v > 1) { u = 1 - u; v = 1 - v }
    const w = 1 - u - v
    o.p.set(T[k] * w + T[k + 3] * u + T[k + 6] * v, T[k + 1] * w + T[k + 4] * u + T[k + 7] * v, T[k + 2] * w + T[k + 5] * u + T[k + 8] * v)
    const e1 = new THREE.Vector3(T[k + 3] - T[k], T[k + 4] - T[k + 1], T[k + 5] - T[k + 2]), e2 = new THREE.Vector3(T[k + 6] - T[k], T[k + 7] - T[k + 1], T[k + 8] - T[k + 2])
    o.n.crossVectors(e1, e2).normalize()
    return o
  }
}
const isCreepObj = (o: THREE.Object3D) => !!o.userData.creep
/** 节点下「直属」网格的表面（节点局部坐标）。跳过：菌体自身、实例化、透明/裁切材质（毛壳、发光壳）、基础材质（发光件）、过小的网格（眼珠等）。 */
export function nodeSurface(node: THREE.Object3D, minArea = 0): CreepSurface {
  const s = new CreepSurface()
  for (const ch of node.children) {
    const m = ch as THREE.Mesh
    if (!m.isMesh || (m as THREE.InstancedMesh).isInstancedMesh || isCreepObj(m) || !m.visible) continue
    const mat = (Array.isArray(m.material) ? m.material[0] : m.material) as THREE.Material & { alphaTest?: number }
    if (mat.transparent || (mat.alphaTest ?? 0) > 0 || mat.type === 'MeshBasicMaterial' || m.name === 'ratFur' || m.userData.rune || m.userData.face) continue
    m.updateMatrix()
    const sub = new CreepSurface(); sub.addGeometry(m.geometry, m.matrix)
    if (sub.total < minArea) continue
    s.addGeometry(m.geometry, m.matrix)
  }
  return s
}

// ======================================================================
// 挂菌
// ======================================================================
/** 一处可长菌的位置：node = 随之运动的节点（骨骼 / 关节组），其余都是 node 局部坐标 */
export interface CreepSite {
  node: THREE.Object3D
  /** 关节点：绒球优先长在这里（参照图：腿的每个关节一颗）；r = 该处肢体半径 */
  joints?: { p: THREE.Vector3; r: number; tip?: boolean }[]
  /** 表面：散生小绒球与（高阶）连片覆盖 */
  surface?: CreepSurface
  /** 身体中心：3 阶起长出一团大白球（参照图的腹部）；r = 躯干半径 */
  core?: { p: THREE.Vector3; r: number }
  /** 表面取样权重（默认 1） */
  weight?: number
}
export interface CreepGrowthOpts {
  seed?: number
  /** 宿主特征尺寸（米）：决定绒球的基准大小 u = size × 0.024 */
  size?: number
  /** 菌丝：是否在同一节点内的绒球之间连线、并垂下游离菌丝（默认 true） */
  threads?: boolean
  /** 绒球颜色偏移：0 = 纯白；>0 偏灰黄（老菌） */
  age?: number
  /** 覆盖倍率（1 = 标准；爬菌人的增生物较稀疏） */
  density?: number
}
export interface CreepBall { node: THREE.Object3D; p: THREE.Vector3; n: THREE.Vector3; r: number }
export interface CreepGrowth { stage: CreepStage; balls: CreepBall[]; objects: THREE.Object3D[]; dispose(): void }

/** 各阶段参数（u = 基准绒球半径）。1 阶几个小白点 → 4 阶几乎被白绒覆盖 */
export const CREEP_STAGES = [
  { joints: 0, jointR: [0, 0], surf: 0, surfR: [0, 0], core: 0, threads: 0, decay: 0, coat: 0, stiff: 0, shrink: 0 },
  { joints: 0.22, jointR: [0.55, 0.85], surf: 3, surfR: [0.4, 0.7], core: 0, threads: 0, decay: 0.18, coat: 0, stiff: 0.12, shrink: 0 },
  { joints: 0.5, jointR: [0.85, 1.25], surf: 14, surfR: [0.45, 0.95], core: 0, threads: 4, decay: 0.42, coat: 0.12, stiff: 0.35, shrink: 0.04 },
  { joints: 0.85, jointR: [1.15, 1.7], surf: 38, surfR: [0.55, 1.3], core: 2.4, threads: 10, decay: 0.68, coat: 0.42, stiff: 0.6, shrink: 0.1 },
  { joints: 1, jointR: [1.5, 2.3], surf: 110, surfR: [0.65, 1.6], core: 3.4, threads: 22, decay: 0.88, coat: 0.86, stiff: 0.85, shrink: 0.18 },
] as const

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _c = new THREE.Color()
/**
 * 在宿主的各个节点上长菌。每个节点一组 InstancedMesh（实心球 + 晕圈）+ 一组菌丝线，挂在该节点下随之运动。
 * 返回 dispose()：移除并释放实例缓冲（共享几何/材质不释放）。
 */
export function growCreep(sites:CreepSite[],stage:CreepStage,o:CreepGrowthOpts={}):CreepGrowth { return drainCreepJob(growCreepJob(sites,stage,o)) }
export function* growCreepJob(sites: CreepSite[], stage: CreepStage, o: CreepGrowthOpts = {}): Generator<void,CreepGrowth,unknown>{
  const S = CREEP_STAGES[stage]
  yield;
  const R = rng(0xc4ee9 + (o.seed ?? 0) * 7919 + stage * 131)
  yield;
  const u = (o.size ?? 0.4) * 0.024
  yield;
  const dens = o.density ?? 1
  yield;
  const balls: CreepBall[] = []
  yield;
  const lerp = (a: readonly number[], t: number) => a[0] + (a[1] - a[0]) * t
  yield;
  if (stage > 0) {
    // ① 关节：按阶段比例挑选关节，越高阶越多越大（关节球至少比肢体粗一圈）
    const joints: { node: THREE.Object3D; p: THREE.Vector3; r: number; tip?: boolean }[] = []
    for (const s of sites) for (const j of s.joints ?? []) joints.push({ node: s.node, ...j })
    const order = joints.map((j, i) => ({ j, k: R() + (j.tip ? 0.15 : 0) - i * 1e-4 })).sort((a, b) => a.k - b.k)
    const nJ = Math.min(joints.length, Math.max(stage >= 1 && joints.length ? 1 : 0, Math.round(joints.length * S.joints * Math.min(1, dens))))
    for (let i = 0; i < nJ; i++) {
      const { j } = order[i]
      const r = Math.max(lerp(S.jointR, R()) * u, j.r * (0.6 + stage * 0.3))
      balls.push({ node: j.node, p: j.p.clone(), n: new THREE.Vector3(0, 1, 0), r })
    }
    // ② 身体中心的大白球
    if (S.core) for (const s of sites) if (s.core) balls.push({ node: s.node, p: s.core.p.clone(), n: new THREE.Vector3(0, 1, 0), r: Math.max(S.core * u, s.core.r * (stage === 4 ? 1.12 : 0.9)) })
    // ③ 表面散生：按面积 × 权重在所有节点间分配
    const surfs = sites.filter((s) => s.surface && s.surface.size).map((s) => ({ s, w: s.surface!.total * (s.weight ?? 1) }))
    const W = surfs.reduce((a, b) => a + b.w, 0)
    const nS = Math.round(S.surf * dens)
    for (let i = 0; i < nS && W > 0; i++) {
      let t = R() * W, pick = surfs[0]
      for (const x of surfs) { if ((t -= x.w) <= 0) { pick = x; break } }
      const sp = pick.s.surface!.sample(R)
      const r = lerp(S.surfR, Math.pow(R(), 1.4)) * u
      // 半埋在体表：中心沿法线外移 0.35r
      balls.push({ node: pick.s.node, p: sp.p.addScaledVector(sp.n, r * 0.35), n: sp.n.clone(), r })
    }
  }
  yield;
  const objects = yield* buildBallObjectsJob(balls, { R, age: o.age ?? (stage >= 4 ? 0.12 : stage * 0.02), threads: (o.threads ?? true) ? Math.round(S.threads * dens) : 0, u })
  yield;
  return {
    stage, balls, objects,
    dispose() { for (const ob of objects) { ob.removeFromParent(); if ((ob as THREE.InstancedMesh).isInstancedMesh) (ob as THREE.InstancedMesh).dispose(); if ((ob as THREE.LineSegments).isLineSegments) (ob as THREE.LineSegments).geometry.dispose() } },
  }
}

/** 按节点分组建实例：实心球 + 晕圈（同一实例矩阵）+ 节点内菌丝 */
function buildBallObjects(balls:CreepBall[],o:{R:()=>number;age:number;threads:number;u:number}):THREE.Object3D[] { return drainCreepJob(buildBallObjectsJob(balls,o)) }
function* buildBallObjectsJob(balls: CreepBall[], o: { R: () => number; age: number; threads: number; u: number }): Generator<void,THREE.Object3D[],unknown>{
  const out: THREE.Object3D[] = []
  yield;
  const byNode = new Map<THREE.Object3D, CreepBall[]>()
  yield;
  for (const b of balls) { const l = byNode.get(b.node) ?? [];
  yield; l.push(b);
  yield; byNode.set(b.node, l)
  yield; }
  yield;
  const R = o.R
  yield;
  for (const [node, list] of byNode) {
    const core = new THREE.InstancedMesh(ballGeo(), coreMat(), list.length)
  yield;
    const halo = new THREE.InstancedMesh(haloGeo(), haloMat(), list.length)
  yield;
    list.forEach((b, i) => {
      _q.setFromEuler(new THREE.Euler(R() * 6.3, R() * 6.3, R() * 6.3))
      _s.set(1, 0.9 + R() * 0.2, 1).multiplyScalar(b.r)
      _m.compose(b.p, _q, _s)
      core.setMatrixAt(i, _m); halo.setMatrixAt(i, _m)
      const g = 1 - o.age * R() * 1.4
      _c.setRGB(g, g * (1 - o.age * 0.25), g * (1 - o.age * 0.6)); core.setColorAt(i, _c); halo.setColorAt(i, _c)
    })
  yield;
    core.computeBoundingSphere();
  yield; halo.computeBoundingSphere()
  yield;
    core.castShadow = true;
  yield; core.receiveShadow = false;
  yield; halo.castShadow = false
  yield;
    core.userData.creep = 'ball';
  yield; halo.userData.creep = 'halo'
  yield;
    halo.renderOrder = 3
  yield;
    node.add(core, halo);
  yield; out.push(core, halo)
  yield;
  }
  yield;
  // 菌丝：同节点内相邻绒球之间带下垂的连线；再从部分绒球垂下游离丝
  if (o.threads > 0) {
    let left = o.threads
    for (const [node, list] of byNode) {
      if (left <= 0) break
      const pts: number[] = []
      const nT = Math.max(1, Math.round(o.threads * list.length / balls.length))
      for (let k = 0; k < nT && left > 0; k++, left--) {
        const a = list[Math.floor(R() * list.length)]
        let b: CreepBall | null = null, bd = 1e9
        for (const c of list) { if (c === a) continue; const d = c.p.distanceTo(a.p) * (0.7 + R() * 0.6); if (d < bd && d > (a.r + c.r) * 1.1) { bd = d; b = c } }
        if (b && R() < 0.65) polyline(pts, a.p, b.p, (a.r + b.r) * 0.35 + bd * 0.08, R)
        else {
          // 游离菌丝：沿法线伸出再垂下
          const end = a.p.clone().addScaledVector(a.n, a.r * (1.5 + R() * 2)).add(new THREE.Vector3((R() - 0.5) * o.u * 3, -o.u * (2 + R() * 4), (R() - 0.5) * o.u * 3))
          polyline(pts, a.p.clone().addScaledVector(a.n, a.r * 0.6), end, o.u * 0.6, R)
        }
      }
      if (!pts.length) continue
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3))
      const ls = new THREE.LineSegments(g, threadMat()); ls.userData.creep = 'thread'; ls.renderOrder = 2
      node.add(ls); out.push(ls)
    }
  }
  yield;
  return out
}
/** a→b 的 6 段下垂折线（LineSegments 顶点对） */
function polyline(out: number[], a: THREE.Vector3, b: THREE.Vector3, sag: number, R: () => number) {
  const n = 6, wob = new THREE.Vector3((R() - 0.5), (R() - 0.5), (R() - 0.5)).multiplyScalar(sag * 0.4)
  let px = a.x, py = a.y, pz = a.z
  for (let i = 1; i <= n; i++) {
    const t = i / n, s = Math.sin(t * Math.PI)
    const x = a.x + (b.x - a.x) * t + wob.x * s, y = a.y + (b.y - a.y) * t - sag * s + wob.y * s, z = a.z + (b.z - a.z) * t + wob.z * s
    out.push(px, py, pz, x, y, z); px = x; py = y; pz = z
  }
}

// ======================================================================
// 宿主变质：灰白、干瘪、霉斑（克隆材质，原模型的材质不受影响）
// ======================================================================
export interface CreepDecayOpts { stage: CreepStage; /** 霉斑噪声频率（每米），宿主越小越高 */ freq?: number }
/**
 * 把宿主（及其子孙）所有受光材质换成「爬菌变质」克隆：去饱和并提亮成灰白、按噪声长出白色霉斑（覆盖率随阶段）。
 * 同一原材质只克隆一次；原材质的 onBeforeCompile 链（环境光照 / 发光）原样保留。返回 restore() 还原。
 */
export function creepDecay(root: THREE.Object3D, o: CreepDecayOpts): { restore(): void; materials: THREE.Material[] } {
  const S = CREEP_STAGES[o.stage]
  const map = new Map<THREE.Material, THREE.Material>()
  const touched: [THREE.Mesh, THREE.Material | THREE.Material[]][] = []
  if (o.stage === 0) return { restore() {}, materials: [] }
  const uK = { value: S.decay }, uCov = { value: S.coat }, uF = { value: o.freq ?? 40 }
  const conv = (src: THREE.Material) => {
    let c = map.get(src)
    if (c) return c
    if (!('color' in src) || src.type === 'MeshBasicMaterial' || src.type === 'LineBasicMaterial' || src.type === 'ShaderMaterial') { map.set(src, src); return src }
    const m = src.clone()
    const prev = src.onBeforeCompile, prevKey = src.customProgramCacheKey.call(src)
    m.onBeforeCompile = (sh, r) => {
      prev.call(src, sh, r)
      Object.assign(sh.uniforms, { uCreepK: uK, uCreepCov: uCov, uCreepF: uF })
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vCreepD;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvCreepD = transformed;')
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vCreepD;\nuniform float uCreepK, uCreepCov, uCreepF;\n' + GLSL_NOISE)
        .replace('#include <color_fragment>', `#include <color_fragment>
          float creepL = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));
          // 灰白干瘪：去饱和、整体往苍白灰靠，暗部抬起（像风干的标本）
          vec3 creepDry = mix(diffuseColor.rgb, vec3(creepL) * vec3(1.0, 0.97, 0.9) * 0.75 + vec3(0.2, 0.19, 0.17), uCreepK);
          float creepNz = creepF(vCreepD * uCreepF);
          float creepFine = creepN(vCreepD * uCreepF * 9.0);
          float creepE = 1.0 - uCreepCov;
          // 霉斑边缘是绒毛点逐渐变稀，不是一条硬边：主噪声上叠细噪声再放宽过渡带
          float creepPatch = uCreepCov > 0.0 ? smoothstep(creepE - 0.1, creepE + 0.16, creepNz + 0.22 * (creepFine - 0.5)) : 0.0;
          diffuseColor.rgb = mix(creepDry, vec3(0.88, 0.87, 0.83) * (0.82 + 0.24 * creepFine), creepPatch);`)
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += vec3(0.14) * creepPatch;')
    }
    m.customProgramCacheKey = () => prevKey + '|creepDecay'
    // 克隆不会带上实例级 userData 的 uniform 引用以外的东西；保留 glow 句柄便于外部调节
    m.userData = { ...src.userData, creepDecay: true }
    map.set(src, m)
    return m
  }
  root.traverse((ob) => {
    const mesh = ob as THREE.Mesh
    if (!mesh.isMesh || isCreepObj(mesh)) return
    touched.push([mesh, mesh.material])
    mesh.material = Array.isArray(mesh.material) ? mesh.material.map(conv) : conv(mesh.material)
  })
  return {
    materials: [...new Set(map.values())].filter((m) => m.userData.creepDecay),
    restore() { for (const [m, mat] of touched) m.material = mat; for (const c of map.values()) if (c.userData.creepDecay) c.dispose() },
  }
}

// ======================================================================
// 感染宿主：尸鼠
// ======================================================================
export function creepSitesRat(grp: THREE.Object3D): CreepSite[] {
  const r = grp.userData.ratRig as RatRig | undefined
  if (!r) return []
  const sites: CreepSite[] = []
  // 躯干：表面 + 中心（腰背）大球
  const body = nodeSurface(r.body)
  sites.push({ node: r.body, surface: body, core: { p: V(0.17, 0.02, 0), r: 0.045 }, weight: 1.2 })
  sites.push({ node: r.head, surface: nodeSurface(r.head), joints: [{ p: V(-0.01, 0.03, 0), r: 0.01 }], weight: 0.8 })
  for (const L of r.legs) {
    // 髋（腿根）/ 膝：关节球；爪掌：末端小球
    const k = L.knee.position
    sites.push({ node: L.hip, surface: nodeSurface(L.hip), joints: [{ p: V(0, 0, 0), r: 0.012 }, { p: k.clone(), r: 0.008 }], weight: 0.6 })
    sites.push({ node: L.knee, surface: nodeSurface(L.knee), joints: [{ p: V(L.front ? 0.012 : -0.02, -0.07, 0), r: 0.005, tip: true }], weight: 0.5 })
  }
  for (const t of r.tail) sites.push({ node: t, surface: nodeSurface(t), joints: [{ p: V(-0.12, -0.04, 0), r: 0.006 }], weight: 0.4 })
  return sites
}
/** 尸鼠 1–4 阶僵硬姿态：四肢逐渐伸直外撇、头歪向一侧上仰、尾巴僵直；身体干瘪（躯干收窄） */
export function poseCreepRat(grp: THREE.Object3D, stage: CreepStage, twitch = 0) {
  const r = grp.userData.ratRig as RatRig | undefined
  if (!r) return
  const k = CREEP_STAGES[stage].stiff, sh = CREEP_STAGES[stage].shrink
  for (const L of r.legs) {
    L.hip.rotation.set(L.side * 0.35 * k, 0, (L.front ? 0.35 : -0.3) * k + twitch * 0.1 * L.side)
    L.knee.rotation.set(0, 0, (L.front ? -0.25 : 0.35) * k)
  }
  r.head.rotation.set(0.45 * k, 0.15 * k, 0.3 * k + twitch * 0.15)
  r.jaw.rotation.z = -0.35 * k
  for (const t of r.tail) t.rotation.set(0, 0.1 * k, 0.25 * k)
  r.body.scale.set(1, 1 - sh * 0.6, 1 - sh)
}

/** 尸鼠感染体（1–4 阶）。0 阶 = 原模型。userData.creep = { stage, growth, decay } */
export function buildInfectedRat(morph:RatMorph='common',seed=0,stage:CreepStage=2):THREE.Group { return drainCreepJob(buildInfectedRatJob(morph,seed,stage)) }
export function* buildInfectedRatJob(morph: RatMorph = 'common', seed = 0, stage: CreepStage = 2): Generator<void,THREE.Group,unknown>{
  const g = buildRatMesh(morph, seed)
  let complete=false
  try {
  yield;
  if (stage === 0) { complete=true; return g }
  yield;
  poseCreepRat(g, stage)
  yield;
  g.updateMatrixWorld(true)
  yield;
  const decay = creepDecay(g, { stage, freq: 48 })
  yield;
  const growth = yield* growCreepJob(creepSitesRat(g), stage, { seed, size: 0.42 })
  yield;
  g.userData.creep = { stage, growth, decay, seed }
  yield;
  complete=true; return g

  } finally { if(!complete)disposeL8Tree(g) }
}

// ======================================================================
// 感染宿主：蛛形纲
// ======================================================================
export function creepSitesArachnid(grp: THREE.Object3D): CreepSite[] {
  const rig = grp.userData.arachnidRig as ArachnidRig | undefined
  if (!rig) return []
  const sites: CreepSite[] = []
  const { ceph, abdomen } = rig.body
  const box = (n: THREE.Object3D) => { const s = nodeSurface(n); return s }
  // 腹部中心：参照图里最大的那团白球；头胸部：次一级
  const ab = new THREE.Box3()
  for (const ch of abdomen.children) if ((ch as THREE.Mesh).isMesh && !isCreepObj(ch)) { (ch as THREE.Mesh).geometry.computeBoundingBox(); ab.union((ch as THREE.Mesh).geometry.boundingBox!.clone().applyMatrix4(ch.matrix)) }
  const ac = ab.isEmpty() ? V(-0.1, 0.02, 0) : ab.getCenter(new THREE.Vector3()), asz = ab.isEmpty() ? 0.08 : ab.getSize(new THREE.Vector3()).y * 0.5
  sites.push({ node: abdomen, surface: box(abdomen), core: { p: ac, r: asz }, weight: 1.3 })
  sites.push({ node: ceph, surface: box(ceph), weight: 0.8 })
  rig.legs.forEach((j, n) => {
    if (rig.legInfo[n].missing) return
    const leg = j[0].userData.leg as { K: THREE.Vector3; F: THREE.Vector3 } | undefined
    if (!leg) return
    const lr = 0.008
    // 基节关节（腿根）、膝（腿节末端）、胫节中段、足尖
    sites.push({ node: j[1], surface: nodeSurface(j[1]), joints: [{ p: V(0, 0, 0), r: lr }, { p: leg.K.clone(), r: lr }], weight: 0.35 })
    sites.push({ node: j[2], surface: nodeSurface(j[2]), joints: [{ p: leg.F.clone().multiplyScalar(0.55), r: lr * 0.8 }, { p: leg.F.clone(), r: lr * 0.5, tip: true }], weight: 0.35 })
  })
  return sites
}
/** 蛛形纲 1–4 阶僵硬姿态：腿逐渐向内收拢、关节僵直，腹部干瘪下垂 */
export function poseCreepArachnid(grp: THREE.Group, stage: CreepStage, twitch = 0) {
  const rig = grp.userData.arachnidRig as ArachnidRig | undefined
  if (!rig) return
  const k = CREEP_STAGES[stage].stiff
  poseArachnid(grp, { curl: k * 0.35 })
  rig.legs.forEach((j, n) => {
    const i = rig.legInfo[n].idx
    // 前两对腿僵直前伸、后两对僵直外撇；轻微抽搐 twitch
    j[1].rotation.z += (i < 2 ? 0.25 : -0.1) * k + twitch * 0.08 * ((n % 3) - 1)
    j[2].rotation.z += (i < 2 ? 0.35 : 0.2) * k
  })
  const sh = CREEP_STAGES[stage].shrink
  rig.body.abdomen.scale.set(1 - sh * 0.3, 1 - sh, 1 - sh)
  rig.body.abdomen.rotation.z -= 0.12 * k
}
/** 蛛形纲感染体（1–4 阶）。0 阶 = 原模型 */
export function buildInfectedArachnid(variant:ArachnidVariant='wolf',seed=0,stage:CreepStage=2):THREE.Group { return drainCreepJob(buildInfectedArachnidJob(variant,seed,stage)) }
export function* buildInfectedArachnidJob(variant: ArachnidVariant = 'wolf', seed = 0, stage: CreepStage = 2): Generator<void,THREE.Group,unknown>{
  const g = yield* buildArachnidJob(variant, seed)
  let complete=false
  try {
  yield;
  if (stage === 0) { complete=true; return g }
  yield;
  poseCreepArachnid(g, stage)
  yield;
  g.updateMatrixWorld(true)
  yield;
  const decay = creepDecay(g, { stage, freq: 34 })
  yield;
  const size = Math.max(0.3, ({ wolf: 0.6, weaver: 0.5, jumper: 0.35, blindcave: 0.5, harvestman: 0.3, diving: 0.4 } as Partial<Record<ArachnidVariant, number>>)[variant] ?? 0.6)
  yield;
  const growth = yield* growCreepJob(creepSitesArachnid(g), stage, { seed, size })
  yield;
  g.userData.creep = { stage, growth, decay, seed }
  yield;
  complete=true; return g

  } finally { if(!complete)disposeL8Tree(g) }
}

// ======================================================================
// 僵尸蜘蛛装饰（静态尸体 + 小片乱网）
// ======================================================================
/**
 * 被白绒包裹的地窖蜘蛛尸体，挂在一小片蛛网上（参照图）。原点 = 网的上方挂点（墙角 / 天花板下），网向 -Y 垂、向 +X/+Z 展开。
 * span = 腿展（米，默认 0.32：后室的地窖蜘蛛比现实大）。全部静态：合批几何 + 两组实例 + 两组线。
 */
export function buildZombieSpiderDecor(seed=0,o:{span?:number;web?:boolean}={}):THREE.Group { return drainCreepJob(buildZombieSpiderDecorJob(seed,o)) }
export function* buildZombieSpiderDecorJob(seed = 0, o: { span?: number; web?: boolean } = {}): Generator<void,THREE.Group,unknown>{
  const R = rng(0x5b1d + seed * 613)
  yield;
  const span = o.span ?? 0.32, L = span * 0.5
  yield; // 单腿长
  const grp = new THREE.Group();
  let complete=false
  try {
  yield; grp.name = 'creeper-zombie-spider'
  yield;
  grp.userData.entityType = 'creeperDecor'
  yield;
  const body = new THREE.Group();
  yield; grp.add(body)
  yield;
  // 尸体悬在网中，身体略倾斜
  const hang = V(span * 0.42, -span * 0.62, span * 0.38)
  yield;
  body.position.copy(hang);
  yield; body.rotation.set(0.5 + R() * 0.3, R() * 6.3, 0.35)
  yield;
  const geos: THREE.BufferGeometry[] = []
  yield;
  const colorize = (g: THREE.BufferGeometry, c: [number, number, number]) => {
    const n = g.attributes.position.count, a = new Float32Array(n * 3)
    const sc = g.attributes.color as THREE.BufferAttribute | undefined
    for (let i = 0; i < n; i++) { const s = sc ? sc.getX(i) : 1; a[i * 3] = c[0] * s; a[i * 3 + 1] = c[1] * s; a[i * 3 + 2] = c[2] * s }
    g.setAttribute('color', new THREE.BufferAttribute(a, 3))
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(n * 2), 2))
    return g.index ? g.toNonIndexed() : g
  }
  yield;
  const dry: [number, number, number] = [0.7, 0.63, 0.52]
  yield; // 风干的褐黄色几丁质
  // 头胸 + 腹（被白球裹住，只露一点）
  const cephR = span * 0.035
  yield;
  geos.push(colorize(new THREE.SphereGeometry(cephR, 10, 8).scale(1.1, 0.75, 1), dry))
  yield;
  geos.push(colorize(new THREE.SphereGeometry(cephR * 1.3, 10, 8).scale(1.6, 1, 1).translate(-cephR * 2.2, cephR * 0.3, 0), [0.5, 0.45, 0.38]))
  yield;
  // 8 条细长腿：每条 4 节（腿节/膝/胫/后跗），关节处折出角度——干死后的蜷曲姿态（参照图里腿呈折线张开）
  const joints: { p: THREE.Vector3; r: number; tip?: boolean }[] = []
  yield;
  const tips: THREE.Vector3[] = []
  yield;
  for (let side = -1; side <= 1; side += 2) for (let i = 0; i < 4; i++) {
    // 地窖蜘蛛：腿极长，放射状张开；腿节上抬→膝→胫节外伸下折→后跗末端微钩（干尸的腿僵直、不内卷）
    const yaw = [0.75, 0.25, -0.25, -0.75][i] + (R() - 0.5) * 0.2
    const out = V(Math.sin(yaw), 0, side * Math.cos(yaw)).normalize()
    const lift = 0.7 + R() * 0.6
    const seg = [0.24, 0.06, 0.34, 0.36].map((s) => s * L * (0.88 + R() * 0.24))
    const pts = [V(0, 0, side * cephR * 0.6)]
    const droop = 0.35 + R() * 0.5
    const dirs = [
      out.clone().add(V(0, lift, 0)).normalize(),
      out.clone().add(V(0, 0.1, 0)).normalize(),
      out.clone().add(V(0, -droop, 0)).normalize(),
      out.clone().add(V(0, -droop - 0.35 - R() * 0.4, 0)).normalize(),
    ]
    for (let k = 0; k < 4; k++) pts.push(pts[k].clone().addScaledVector(dirs[k], seg[k]))
    for (let k = 0; k < 4; k++) {
      const r0 = span * 0.0062 * (1 - k * 0.16), r1 = r0 * 0.85
      geos.push(colorize(sweep([pts[k], pts[k].clone().lerp(pts[k + 1], 0.5), pts[k + 1]], (t) => r0 + (r1 - r0) * t, { radial: 5, seg: 3 }), dry))
      if (k < 3) joints.push({ p: pts[k + 1].clone(), r: r0 })
    }
    joints.push({ p: pts[4].clone(), r: span * 0.002, tip: true })
    tips.push(pts[4])
  }
  yield;
  const legMesh = new THREE.Mesh(mergeGeos(geos), rawMat());
  yield; legMesh.castShadow = true
  yield;
  body.add(legMesh)
  yield;
  // 白绒：每个关节一颗（4 阶全覆盖），身体一团大白球 + 头胸次一级
  const u = span * 0.024
  yield;
  const balls: CreepBall[] = []
  yield;
  for (const j of joints) balls.push({ node: body, p: j.p, n: V(0, 1, 0), r: (j.tip ? 0.75 : 0.85 + R() * 0.55) * u })
  yield;
  balls.push({ node: body, p: V(-cephR * 1.9, cephR * 0.5, 0), n: V(0, 1, 0), r: span * 0.07 })
  yield;
  balls.push({ node: body, p: V(cephR * 0.4, cephR * 0.3, 0), n: V(0, 1, 0), r: span * 0.04 })
  yield;
  body.updateMatrixWorld(true)
  yield;
  const objs = yield* buildBallObjectsJob(balls, { R, age: 0.05, threads: 10, u })
  yield;
  // 小片乱网（地窖蜘蛛的乱网）+ 从关节/足尖拉到网上的菌丝
  const web: number[] = [], hy: number[] = []
  yield;
  const anchors: THREE.Vector3[] = []
  yield;
  if (o.web !== false) {
    // 墙角三面：挂点在原点，网丝锚在 +X 墙、+Z 墙与上方
    for (let k = 0; k < 14; k++) anchors.push(V(R() * span * 1.3, -R() * span * 1.4, 0)) // -Z 一侧的墙（z=0）
    for (let k = 0; k < 14; k++) anchors.push(V(0, -R() * span * 1.4, R() * span * 1.3)) // -X 一侧的墙（x=0）
    for (let k = 0; k < 8; k++) anchors.push(V(R() * span * 1.1, 0, R() * span * 1.1)) // 上方
    const inner: THREE.Vector3[] = []
    for (let k = 0; k < 30; k++) inner.push(hang.clone().add(V((R() - 0.5) * span * 1.1, (R() - 0.3) * span * 0.9, (R() - 0.5) * span * 1.1)))
    const all = [...anchors, ...inner]
    // 乱网：每个内点连 2–3 个最近点，锚点各连 1–2 根
    for (const p of inner) {
      const near = all.filter((q) => q !== p).map((q) => ({ q, d: q.distanceTo(p) * (0.6 + R() * 0.8) })).sort((a, b) => a.d - b.d)
      for (let k = 0; k < 2 + (R() < 0.5 ? 1 : 0); k++) polyline(web, p, near[k].q, near[k].d * 0.03, R)
    }
    for (const a of anchors) { if (R() < 0.6) { const q = inner[Math.floor(R() * inner.length)]; polyline(web, a, q, a.distanceTo(q) * 0.02, R) } }
    // 菌丝：尸体关节 → 网点（世界坐标经 body 变换）
    const toW = (p: THREE.Vector3) => p.clone().applyMatrix4(body.matrix)
    for (let k = 0; k < 16; k++) {
      const j = joints[Math.floor(R() * joints.length)], a = toW(j.p)
      let best = inner[0], bd = 1e9
      for (const q of all) { const d = q.distanceTo(a) * (0.5 + R()); if (d < bd) { bd = d; best = q } }
      polyline(hy, a, best, a.distanceTo(best) * 0.06, R)
    }
  }
  yield;
  if (web.length) {
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(web, 3))
    const m = new THREE.LineBasicMaterial({ color: '#b9b4a6', transparent: true, opacity: 0.32, depthWrite: false })
    const ls = new THREE.LineSegments(g, m); ls.name = 'web'; grp.add(ls)
  }
  yield;
  if (hy.length) {
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(hy, 3))
    const ls = new THREE.LineSegments(g, threadMat()); ls.name = 'hyphae'; ls.userData.creep = 'thread'; grp.add(ls)
  }
  yield;
  grp.userData.creep = { stage: 4 as CreepStage, decor: true, objects: objs, hang, span }
  yield;
  complete=true; return grp

  } finally { if(!complete)disposeL8Tree(grp) }
}
function mergeGeos(gs: THREE.BufferGeometry[]) {
  // 只保留 position/normal/color/uv，非索引拼接
  const keys = ['position', 'normal', 'color', 'uv'] as const
  let n = 0
  for (const g of gs) { if (!g.attributes.normal) g.computeVertexNormals(); n += g.attributes.position.count }
  const out = new THREE.BufferGeometry()
  for (const k of keys) {
    const size = k === 'uv' ? 2 : 3, arr = new Float32Array(n * size)
    let o = 0
    for (const g of gs) { const a = g.attributes[k] as THREE.BufferAttribute; for (let i = 0; i < a.count; i++) for (let c = 0; c < size; c++) arr[o++] = a.array[i * a.itemSize + c] as number }
    out.setAttribute(k, new THREE.BufferAttribute(arr, size))
  }
  for (const g of gs) g.dispose()
  out.computeBoundingSphere()
  return out
}

// ======================================================================
// 爬菌人（5 阶变种）
// ======================================================================
// 阶段 1 修正（10-25，ZAN：「爬菌人太像人了」）：不再改造复古人物，整只程序化雕刻（同猎犬的做法），
// 腰部以下在几何上根本不存在（旧版缩放腿骨在 CPU/GPU 蒙皮下仍残留裤腿和鞋）。
// 外观按 wiki 5 阶：真菌完全接管、体表增生物自燃 → 全身焦黑龟裂、剥落处露出暗红肌肉与筋膜；腰下自断、双手爬行；
// 感官增强（无睑充血眼球）；指甲疯长成爪。头部被一侧头盖骨鼓出的白色增生团挤歪，下颌脱臼大张、嘴唇烧没露牙。
// 骨架：普通 Object3D 关节层级（无蒙皮），静止姿态下各关节旋转为 0，机制阶段直接转关节做爬行动画。

/** 平行移动标架的扫掠管体：rf(t, a) 给半径，a = 0 指向 up 方向、a = π/2 指向 T×N 一侧。返回几何 + 表面取点函数 */
interface Tube { geo: THREE.BufferGeometry; at(t: number, a: number): SurfPt }
function tube(pts: THREE.Vector3[], rf: (t: number, a: number) => number, o: { radial?: number; seg?: number; up?: THREE.Vector3; cap0?: boolean; cap1?: boolean } = {}): Tube {
  const radial = o.radial ?? 10, seg = o.seg ?? 12
  const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal')
  const C: THREE.Vector3[] = [], N: THREE.Vector3[] = [], Bn: THREE.Vector3[] = []
  let n = (o.up ?? V(0, 1, 0)).clone()
  for (let i = 0; i <= seg; i++) {
    const t = i / seg, c = curve.getPointAt(t), T = curve.getTangentAt(t)
    n = n.clone().addScaledVector(T, -n.dot(T)); if (n.lengthSq() < 1e-8) n = new THREE.Vector3(1, 0, 0).addScaledVector(T, -T.x); n.normalize()
    C.push(c); N.push(n.clone()); Bn.push(new THREE.Vector3().crossVectors(n, T).normalize())
  }
  const dir = (i: number, a: number) => N[i].clone().multiplyScalar(Math.cos(a)).addScaledVector(Bn[i], Math.sin(a))
  const pos: number[] = [], idx: number[] = []
  for (let i = 0; i <= seg; i++) for (let j = 0; j < radial; j++) { const a = j / radial * Math.PI * 2, d = dir(i, a), r = rf(i / seg, a); pos.push(C[i].x + d.x * r, C[i].y + d.y * r, C[i].z + d.z * r) }
  for (let i = 0; i < seg; i++) for (let j = 0; j < radial; j++) { const a = i * radial + j, b = a + radial, a1 = i * radial + (j + 1) % radial, b1 = a1 + radial; idx.push(a, b, a1, b, b1, a1) }
  const capAt = (i: number, flip: boolean) => { const k = pos.length / 3; pos.push(C[i].x, C[i].y, C[i].z); for (let j = 0; j < radial; j++) { const a = i * radial + j, b = i * radial + (j + 1) % radial; if (flip) idx.push(k, b, a); else idx.push(k, a, b) } }
  if (o.cap0) capAt(0, false)
  if (o.cap1) capAt(seg, true)
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setIndex(idx); geo.computeVertexNormals()
  return { geo, at(t, a) { const i = Math.max(0, Math.min(seg, Math.round(t * seg))), d = dir(i, a); return { p: C[i].clone().addScaledVector(d, rf(t, a)), n: d } } }
}
const sm = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t) }
const gs1 = (x: number, w: number) => Math.exp(-(x * x) / (2 * w * w))
/** 角度差（-π, π] */
const adiff = (a: number, b: number) => { let d = a - b; while (d > Math.PI) d -= Math.PI * 2; while (d <= -Math.PI) d += Math.PI * 2; return d }

let FLESH_MAT: THREE.MeshLambertMaterial | null = null
/**
 * 焦尸肌肉材质（顶点色通道另作他用：r = AO 明度，g = 焦黑倾向 0–1，b = 白色菌斑量）。按静止姿态世界坐标 aW 取噪声（跨关节连续）：
 * 大面积焦黑龟裂（裂缝透出暗红，少量裂缝里闪橙色余烬）；剥落处是带纤维的暗红肌肉，焦黑与肌肉之间一圈发白的筋膜 / 翻起的死皮；
 * 只在零星几点残留原本的肤色。
 */
function fleshMat() {
  if (FLESH_MAT) return FLESH_MAT
  const m = new THREE.MeshLambertMaterial({ color: '#ffffff', vertexColors: true })
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uCreepTime = CREEP_TIME
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec3 aW;\nvarying vec3 vW;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvW = aW;')
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vW;\nuniform float uCreepTime;\n' + GLSL_NOISE)
      .replace('#include <color_fragment>', `
        float fAo = vColor.r, fCb = vColor.g, fMold = vColor.b;
        float fN = creepF(vW * 11.0) * 0.72 + creepF(vW * 42.0 + 2.0) * 0.28 + (fCb - 0.5) * 0.9;
        float fChar = smoothstep(0.445, 0.47, fN);
        float fEdge = smoothstep(0.43, 0.445, fN) * (1.0 - fChar);
        float fCrk = 1.0 - smoothstep(0.0, 0.03, abs(creepN(vW * 150.0) - 0.5));
        float fCrk2 = 1.0 - smoothstep(0.0, 0.025, abs(creepN(vW * 380.0 + 4.0) - 0.5));
        float fFib = creepN(vec3(vW.x * 520.0, vW.y * 520.0, vW.z * 70.0));
        vec3 fMus = mix(vec3(0.26, 0.04, 0.035), vec3(0.52, 0.1, 0.075), creepN(vW * 120.0));
        fMus *= 0.72 + 0.45 * fFib;
        vec3 fFas = mix(vec3(0.56, 0.36, 0.32), vec3(0.40, 0.17, 0.14), creepN(vW * 300.0));
        vec3 fChr = mix(vec3(0.026, 0.02, 0.017), vec3(0.085, 0.06, 0.045), creepN(vW * 70.0));
        fChr *= 0.8 + 0.4 * creepN(vW * 400.0);
        fChr = mix(fChr, vec3(0.13, 0.03, 0.02), max(fCrk, fCrk2 * 0.7) * 0.6);
        vec3 fC = mix(fMus, fFas, fEdge * 0.6);
        fC = mix(fC, fChr, fChar);
        float fMz = smoothstep(0.6, 0.66, creepF(vW * 90.0 + 3.0)) * fMold;
        fC = mix(fC, vec3(0.86, 0.84, 0.78) * (0.85 + 0.25 * creepN(vW * 500.0)), fMz);
        diffuseColor.rgb = fC * fAo;`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        // 阶段 2：裂缝里的余烬按噪声明灭（随全局时间流动）
        float fEmb = fCrk * fChar * smoothstep(0.78, 0.9, creepN(vW * 18.0 + 5.0)) * (0.2 + 1.3 * creepN(vW * 9.0 + vec3(0.0, uCreepTime * 1.7, uCreepTime * 0.6)));
        totalEmissiveRadiance += vec3(1.0, 0.36, 0.06) * fEmb * 1.5 + vec3(0.9, 0.88, 0.8) * fMz * 0.12;`)
  }
  m.customProgramCacheKey = () => 'creepFlesh'
  envShaders(m, 'creepFlesh')
  m.userData.entityShared = true
  return (FLESH_MAT = m)
}
let CLOTH_MAT: THREE.MeshLambertMaterial | null = null
/** 烧剩的碎布条（双面、顶点色） */
function clothMat() {
  if (CLOTH_MAT) return CLOTH_MAT
  CLOTH_MAT = new THREE.MeshLambertMaterial({ color: '#ffffff', vertexColors: true, side: THREE.DoubleSide })
  envShaders(CLOTH_MAT, 'creepCloth')
  CLOTH_MAT.userData.entityShared = true
  return CLOTH_MAT
}
type FleshPaint = (w: THREE.Vector3, n: THREE.Vector3) => [number, number, number]
/** 转成焦尸材质用的非索引几何：geo 已在静止姿态世界坐标；paint 给 [AO, 焦黑倾向, 菌斑] */
function fleshify(geo: THREE.BufferGeometry, paint: FleshPaint): THREE.BufferGeometry {
  if (!geo.attributes.normal) geo.computeVertexNormals()
  const g = geo.index ? geo.toNonIndexed() : geo
  const p = g.attributes.position as THREE.BufferAttribute, nn = g.attributes.normal as THREE.BufferAttribute
  const c = new Float32Array(p.count * 3), w = new THREE.Vector3(), n = new THREE.Vector3()
  for (let i = 0; i < p.count; i++) { w.fromBufferAttribute(p, i); n.fromBufferAttribute(nn, i); const k = paint(w, n); c[i * 3] = k[0]; c[i * 3 + 1] = k[1]; c[i * 3 + 2] = k[2] }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3))
  g.setAttribute('aW', new THREE.BufferAttribute(new Float32Array(p.array as Float32Array), 3))
  return g
}
/** 按顶点色上色的小件（牙、眼、骨、爪、断茬碎片）：世界坐标几何 → 非索引 + color + uv */
function tint(geo: THREE.BufferGeometry, col: (w: THREE.Vector3, i: number) => [number, number, number]): THREE.BufferGeometry {
  if (!geo.attributes.normal) geo.computeVertexNormals()
  const g = geo.index ? geo.toNonIndexed() : geo
  const p = g.attributes.position as THREE.BufferAttribute, c = new Float32Array(p.count * 3), w = new THREE.Vector3()
  for (let i = 0; i < p.count; i++) { w.fromBufferAttribute(p, i); const k = col(w, i); c[i * 3] = k[0]; c[i * 3 + 1] = k[1]; c[i * 3 + 2] = k[2] }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3))
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(p.count * 2), 2))
  return g
}
/** 合并（按给定属性），并平移到关节局部（-pivot） */
function mergeAt(gs: THREE.BufferGeometry[], keys: string[], pivot: THREE.Vector3) {
  let n = 0
  for (const g of gs) n += g.attributes.position.count
  const out = new THREE.BufferGeometry()
  for (const k of keys) {
    const size = (gs[0].attributes[k] as THREE.BufferAttribute).itemSize, arr = new Float32Array(n * size)
    let o = 0
    for (const g of gs) { const a = g.attributes[k] as THREE.BufferAttribute; for (let i = 0; i < a.count; i++) for (let c = 0; c < size; c++) arr[o++] = a.array[i * a.itemSize + c] as number }
    out.setAttribute(k, new THREE.BufferAttribute(arr, size))
  }
  for (const g of gs) g.dispose()
  out.translate(-pivot.x, -pivot.y, -pivot.z)
  out.computeBoundingSphere()
  return out
}
/** 碎布条：沿曲线的一条窄带（宽度方向 = 曲线切线 × 法线提示），边缘参差、烧焦边发褐 */
function ribbon(pts: THREE.Vector3[], width: number, nHint: (t: number) => THREE.Vector3, R: () => number): THREE.BufferGeometry {
  const curve = new THREE.CatmullRomCurve3(pts), seg = Math.max(4, Math.round(curve.getLength() / 0.012))
  const pos: number[] = [], col: number[] = []
  const row: THREE.Vector3[][] = []
  for (let i = 0; i <= seg; i++) {
    const t = i / seg, p = curve.getPointAt(t), T = curve.getTangentAt(t), s = new THREE.Vector3().crossVectors(T, nHint(t)).normalize()
    const w = width * (1 - 0.55 * t) * (0.7 + 0.6 * R())
    row.push([p.clone().addScaledVector(s, -w / 2 * (0.6 + 0.4 * R())), p.clone().addScaledVector(s, w / 2 * (0.6 + 0.4 * R()))])
  }
  const cc = (t: number, e: number): [number, number, number] => { const b = Math.max(e, sm(0.6, 1, t)); return [0.06 + 0.13 * b, 0.055 + 0.06 * b, 0.05 + 0.01 * b] }
  for (let i = 0; i < seg; i++) {
    const t0 = i / seg, t1 = (i + 1) / seg, [a0, b0] = row[i], [a1, b1] = row[i + 1]
    for (const [v, t, e] of [[a0, t0, 1], [b0, t0, 1], [a1, t1, 1], [b0, t0, 1], [b1, t1, 1], [a1, t1, 1]] as [THREE.Vector3, number, number][]) { pos.push(v.x, v.y, v.z); col.push(...cc(t, e * 0.35 * R())) }
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(pos.length / 3 * 2), 2)); g.computeVertexNormals()
  return g
}
/** 两骨 IK：肩 S → 腕 W，上臂 a、前臂 b，pole 指定肘部朝向 */
function ik2(S: THREE.Vector3, W: THREE.Vector3, a: number, b: number, pole: THREE.Vector3) {
  const D = W.clone().sub(S), d = Math.min(D.length(), a + b - 1e-3), Dn = D.clone().normalize()
  const P = pole.clone().addScaledVector(Dn, -pole.dot(Dn)).normalize()
  const ca = (a * a + d * d - b * b) / (2 * a * d), sa = Math.sqrt(Math.max(0, 1 - ca * ca))
  return S.clone().addScaledVector(Dn, a * ca).addScaledVector(P, a * sa)
}

/** 爬菌人的关节层级（静止姿态旋转全为 0；userData.pivot = 静止姿态世界坐标） */
export interface CreeperRig {
  body: THREE.Group; neck: THREE.Group; head: THREE.Group; jaw: THREE.Group
  /** 阶段 2：拖地的脊骨 + 筋肉丝（枢轴 = 腰部断口中心，即 body 的枢轴） */
  tail: THREE.Group
  upperArmL: THREE.Group; foreArmL: THREE.Group; handL: THREE.Group
  upperArmR: THREE.Group; foreArmR: THREE.Group; handR: THREE.Group
}

/**
 * 爬菌人：5 阶感染者。原点在地面、+Z 朝前，躯干长约 0.6 m（腰下断开）、双臂撑开约 0.9 m。
 * 返回组 userData.creeperHuman = { rig, embers, balls }。
 */
export function buildCreeperHuman(seed=0):THREE.Group { return drainCreepJob(buildCreeperHumanJob(seed)) }
export function* buildCreeperHumanJob(seed = 0): Generator<void,THREE.Group,unknown>{
  const R = rng(0xc5ee + seed * 977)
  yield;
  const root = new THREE.Group();
  let complete=false
  try {
  yield; root.name = 'creeper-human';
  yield; root.userData.entityType = 'creeperHuman';
  yield; root.userData.pivot = new THREE.Vector3()
  yield;
  const joint = (parent: THREE.Object3D, pivot: THREE.Vector3, name: string) => { const g = new THREE.Group(); g.name = name; g.userData.pivot = pivot.clone(); g.position.copy(pivot).sub(parent.userData.pivot); parent.add(g); return g }
  yield;
  const L = (node: THREE.Object3D, w: THREE.Vector3) => w.clone().sub(node.userData.pivot)
  yield;
  const flesh = new Map<THREE.Object3D, THREE.BufferGeometry[]>(), raw = new Map<THREE.Object3D, THREE.BufferGeometry[]>(), cloth = new Map<THREE.Object3D, THREE.BufferGeometry[]>()
  yield;
  const put = (m: Map<THREE.Object3D, THREE.BufferGeometry[]>, node: THREE.Object3D, g: THREE.BufferGeometry) => { const l = m.get(node) ?? []; l.push(g); m.set(node, l) }
  yield;
  const balls: CreepBall[] = [], embers: { node: THREE.Object3D; p: THREE.Vector3; r: number }[] = []
  yield;
  const scabs: { node: THREE.Object3D; p: THREE.Vector3; n: THREE.Vector3; r: number; kind: 'char' | 'raw' }[] = []
  yield;
  /** 自燃点（世界坐标）：周围焦黑加重 */
  const hot: { c: THREE.Vector3; r: number }[] = []
  yield;
  const hotK = (w: THREE.Vector3) => { let k = 0; for (const h of hot) k = Math.max(k, Math.exp(-w.distanceToSquared(h.c) / (h.r * h.r))); return k }
  yield;
  const UP = V(0, 1, 0)
  yield;

  // ---------------- 躯干：干瘪、肋骨与脊椎凸出 ----------------
  const spine = [V(0, 0.125, -0.31), V(0, 0.185, -0.17), V(0, 0.258, -0.02), V(0, 0.318, 0.11), V(0, 0.343, 0.2), V(0, 0.35, 0.245)]
  yield;
  const torsoW = (t: number) => 0.102 - 0.02 * gs1(t - 0.22, 0.1) + 0.034 * sm(0.3, 0.62, t) + 0.016 * sm(0.75, 0.93, t)
  yield;
  const torsoH = (t: number) => 0.066 - 0.016 * gs1(t - 0.24, 0.1) + 0.02 * sm(0.32, 0.7, t)
  yield;
  const torsoRF = (t: number, a: number) => {
    const w = torsoW(t), h = torsoH(t), ca = Math.cos(a), sa = Math.sin(a)
    let r = 1 / Math.sqrt((ca / h) ** 2 + (sa / w) ** 2)
    const belly = sm(0.3, 1, -ca) // a ≈ π：腹侧
    r -= 0.012 * belly * gs1(t - 0.25, 0.12) // 凹陷的腹部
    if (t > 0.4 && t < 0.92) { // 肋骨：侧面与胸腹面一根根凸起，肋间凹陷
      const ph = (t - 0.4) / 0.062, rib = Math.pow(Math.max(0, Math.cos(ph * Math.PI * 2)), 3) - 0.35
      r += (rib * 0.0085) * (sm(0.25, 0.85, Math.abs(sa)) + 0.7 * belly) * sm(0.4, 0.46, t) * (1 - sm(0.86, 0.92, t))
    }
    r += gs1(a, 0.17) * (0.006 + 0.007 * Math.pow(Math.max(0, Math.cos(t / 0.046 * Math.PI * 2)), 4)) * sm(0.03, 0.1, t) * (1 - sm(0.93, 0.98, t)) // 脊椎骨节
    for (const s of [-1, 1]) {
      r += 0.02 * gs1(adiff(a, s * 0.78), 0.26) * gs1(t - 0.8, 0.07) // 肩胛骨
      r += 0.011 * gs1(adiff(a, s * 1.35), 0.25) * gs1(t - 0.06, 0.05) // 髂骨
    }
    return Math.max(0.02, r * (t > 0.965 ? Math.sqrt(Math.max(0.05, (1 - t) / 0.035)) : 1))
  }
  yield;
  const torso = tube(spine, torsoRF, { radial: 36, seg: 64, cap1: true })
  yield;
  const body = joint(root, spine[0], 'body')
  yield;
  // 增生团位置（躯干表面 t, a）：背部两团、身侧两团
  const clusters = [
    { t: 0.7, a: 0.12, n: 26, core: 0.05, spread: 0.075 },
    { t: 0.44, a: -0.55, n: 13, core: 0.028, spread: 0.05 },
    { t: 0.84, a: -1.95, n: 15, core: 0.03, spread: 0.05 },
    { t: 0.58, a: 2.05, n: 9, core: 0.02, spread: 0.04 },
  ]
  yield;
  for (const c of clusters) { const sp = torso.at(c.t, c.a);
  yield; hot.push({ c: sp.p, r: c.spread * 1.9 })
  yield; }
  yield;
  put(flesh, body, fleshify(torso.geo, (w, n) => {
    const k = hotK(w)
    return [0.72 + 0.28 * sm(-0.6, 0.6, n.y), 0.56 + 0.4 * k, 0.15]
  }))
  yield;

  let tailRef: THREE.Group | null = null
  yield;
  // ---------------- 腰部断口：撕裂焦黑断面 + 一截脊骨 + 拖地的筋肉丝 ----------------
  {
    const s0 = torso.at(0, 0), C = spine[0].clone(), T0 = spine[1].clone().sub(spine[0]).normalize()
  yield;
    const N0 = s0.n.clone(), B0 = new THREE.Vector3().crossVectors(T0, N0).normalize()
  yield;
    const rim = (a: number) => torsoRF(0, a)
  yield;
    // 断面：略外鼓的不规则肉面（暗红、零碎焦块）
    const disc: number[] = [], K = 28
  yield;
    const dp = (a: number, k: number) => { const r = rim(a) * k * (0.93 + 0.1 * Math.sin(a * 7 + seed) * k); return C.clone().addScaledVector(N0, Math.cos(a) * r).addScaledVector(B0, Math.sin(a) * r).addScaledVector(T0, -0.022 * (1 - k * k) + 0.004 * k) }
  yield;
    for (let ring = 0; ring < 4; ring++) for (let j = 0; j < K; j++) {
      const a0 = j / K * Math.PI * 2, a1 = (j + 1) / K * Math.PI * 2, k0 = ring / 4, k1 = (ring + 1) / 4
      const p00 = dp(a0, k0), p01 = dp(a1, k0), p10 = dp(a0, k1), p11 = dp(a1, k1)
      disc.push(...p00.toArray(), ...p11.toArray(), ...p10.toArray(), ...p00.toArray(), ...p01.toArray(), ...p11.toArray()) // 两面都铺（不依赖绕序）
      disc.push(...p00.toArray(), ...p10.toArray(), ...p11.toArray(), ...p00.toArray(), ...p11.toArray(), ...p01.toArray())
    }
  yield;
    const dg = new THREE.BufferGeometry();
  yield; dg.setAttribute('position', new THREE.Float32BufferAttribute(disc, 3));
  yield; dg.computeVertexNormals()
  yield;
    put(flesh, body, fleshify(dg, (w) => { const d = w.distanceTo(C) / 0.1; return [0.55 + 0.3 * (1 - d), 0.05 + 0.55 * sm(0.75, 1.0, d), 0] }))
  yield;
    // 外圈焦黑撕裂碎片（皮肉 / 布料碎边向后外翻）
    for (let i = 0; i < 26; i++) {
      const a = i / 26 * Math.PI * 2 + R() * 0.2, r = rim(a) * (0.97 + R() * 0.08)
      const base = C.clone().addScaledVector(N0, Math.cos(a) * r).addScaledVector(B0, Math.sin(a) * r)
      const out = N0.clone().multiplyScalar(Math.cos(a)).addScaledVector(B0, Math.sin(a))
      const l = 0.014 + R() * 0.026, tip = base.clone().addScaledVector(T0, -l).addScaledVector(out, l * (0.25 + R() * 0.5)).add(V(0, -l * 0.3 * R(), 0))
      const burnt = R() < 0.72
      put(raw, body, tint(sweep([base, base.clone().lerp(tip, 0.5).addScaledVector(out, 0.004), tip], (t) => (0.006 + R() * 0.004) * (1 - t * 0.9), { radial: 3, seg: 3 }), () => burnt ? [0.05, 0.04, 0.035] : [0.34, 0.07, 0.05]))
    }
  yield;
    // 一截脊骨：从断面背侧向后伸出、末端垂到地上。脊骨与筋肉丝单独挂在 tail 关节（枢轴 = 断口中心）上：
    // 阶段 2 爬行时身体扭动 / 俯仰，tail 反向转回来，让拖在地上的末端基本留在原地（看起来是被拖着走）
    const tail = joint(body, C, 'tail');
  yield; tailRef = tail
  yield;
    const q0 = C.clone().addScaledVector(N0, rim(0) * 0.62).addScaledVector(T0, 0.01)
  yield;
    const q1 = q0.clone().addScaledVector(T0, -0.07).add(V(0, 0.004, 0)), q2 = q1.clone().addScaledVector(T0, -0.06).add(V(0, -0.03, 0)), q3 = q2.clone().addScaledVector(T0, -0.045).add(V(0.008, -0.045, 0))
  yield;
    q3.y = Math.max(q3.y, 0.014);
  yield; q2.y = Math.max(q2.y, 0.03)
  yield;
    const sc = new THREE.CatmullRomCurve3([q0, q1, q2, q3]), sl = sc.getLength(), nV = Math.floor(sl / 0.021)
  yield;
    const bone = (w: THREE.Vector3): [number, number, number] => { const b = sm(0.06, 0.0, w.distanceTo(q0)) * 0.8; const n = jsN(w.x * 300, w.y * 300, w.z * 300); return [0.74 - 0.38 * b - 0.08 * n, 0.68 - 0.6 * b - 0.08 * n, 0.55 - 0.5 * b - 0.08 * n] }
  yield;
    for (let i = 0; i < nV; i++) {
      const t = (i + 0.5) / nV, p = sc.getPointAt(t), T = sc.getTangentAt(t)
      const up = UP.clone().addScaledVector(T, -T.y).normalize(), side = new THREE.Vector3().crossVectors(T, up)
      const r = 0.0125 - t * 0.003
      put(raw, tail, tint(sweep([p.clone().addScaledVector(T, -0.007), p.clone().addScaledVector(T, 0.007)], (u) => r * (1 + 0.15 * gs1(u - 0.5, 0.2)), { radial: 8, seg: 2 }), bone)) // 椎体
      put(raw, tail, tint(sweep([p.clone().addScaledVector(up, r * 0.6), p.clone().addScaledVector(up, r + 0.016).addScaledVector(T, 0.008)], (u) => 0.0045 * (1 - u * 0.8), { radial: 4, seg: 2 }), bone)) // 棘突
      for (const s of [-1, 1]) put(raw, tail, tint(sweep([p.clone(), p.clone().addScaledVector(side, s * (r + 0.011)).addScaledVector(up, 0.003)], (u) => 0.0035 * (1 - u * 0.6), { radial: 4, seg: 2 }), bone)) // 横突
      if (i < nV - 1) { const pd = sc.getPointAt((i + 1) / nV); put(raw, tail, tint(sweep([pd.clone().addScaledVector(T, -0.004), pd.clone().addScaledVector(T, 0.004)], () => r * 0.9, { radial: 8, seg: 1 }), () => [0.36, 0.09, 0.07])) } // 椎间盘
    }
  yield;
    // 脊髓 + 筋肉丝：从断面拖到地上
    const strands: [THREE.Vector3, number, [number, number, number]][] = [[q0.clone().addScaledVector(N0, -0.006), 0.004, [0.62, 0.52, 0.46]]]
  yield;
    for (let i = 0; i < 10; i++) { const a = R() * Math.PI * 2, k = 0.25 + R() * 0.65; strands.push([C.clone().addScaledVector(N0, Math.cos(a) * rim(a) * k).addScaledVector(B0, Math.sin(a) * rim(a) * k).addScaledVector(T0, -0.01), 0.0028 + R() * 0.003, R() < 0.25 ? [0.62, 0.55, 0.5] : [0.36 + R() * 0.1, 0.06, 0.05]]) }
  yield;
    for (const [s, r, c] of strands) {
      const back = 0.09 + R() * 0.17, e = s.clone().addScaledVector(T0, -back).add(V((R() - 0.5) * 0.12, 0, 0)); e.y = 0.004
      const m1 = s.clone().lerp(e, 0.45).add(V((R() - 0.5) * 0.03, 0, 0)); m1.y = Math.max(0.006, Math.min(s.y, e.y + 0.035 * R()))
      put(raw, tail, tint(sweep([s, m1, e], (t) => r * (1 - 0.6 * t), { radial: 4, seg: 10 }), (_w, i) => { const j = 0.85 + 0.3 * ((i * 7919) % 13) / 13; return [c[0] * j, c[1] * j, c[2] * j] }))
    }
  yield;
  }
  yield;

  // ---------------- 颈：干缩成一根细芯，颈椎骨节外露，两条胸锁乳突肌筋腱像绳子一样绷在外面，头往前探 ----------------
  // 阶段 1 收尾（10-25）：原先头底是一块垂在下颌后面的「肉」；头底已抬平，这里补上颈椎 + 筋腱，从侧下方能看清骨节与筋之间的空隙
  const neckBase = V(0, 0.338, 0.225)
  yield;
  const neck = joint(body, neckBase, 'neck')
  yield;
  const headC = V(0.004, 0.33, 0.462)
  yield;
  const hm = new THREE.Matrix4().compose(headC, new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.18, 0.06, 0.2, 'YXZ')), new THREE.Vector3(1, 1, 1))
  yield;
  const HLp = (x: number, y: number, z: number) => V(x, y, z).applyMatrix4(hm)
  yield; // 头部局部（米）→ 世界
  const neckT = tube([V(0, 0.33, 0.2), V(0, 0.337, 0.29), V(0, 0.33, 0.37), V(0, 0.326, 0.42)], (t, a) => {
    let r = 0.019 - 0.002 * t
    r += 0.004 * gs1(adiff(a, Math.PI), 0.3) * gs1(t - 0.45, 0.25) // 气管（腹侧一条棱）
    return r
  }, { radial: 14, seg: 16 })
  yield;
  put(flesh, neck, fleshify(neckT.geo, (_w, n) => [0.55 + 0.3 * sm(-0.5, 0.5, n.y), 0.62, 0.05]))
  yield;
  {
    // 颈椎：7 节，沿颈芯背侧排开，每节 = 椎体（侧面看得见）+ 向后上翘的棘突 + 两侧横突；节间暗红椎间盘
    const nc = new THREE.CatmullRomCurve3([V(0, 0.338, 0.215), V(0, 0.345, 0.29), V(0, 0.338, 0.36), V(0, 0.332, 0.41)])
  yield;
    const vb = (w: THREE.Vector3): [number, number, number] => { const n = jsN(w.x * 420, w.y * 420, w.z * 420), ch = sm(0.3, 0.6, jsN(w.x * 70 + 9, w.y * 70, w.z * 70)); return [(0.5 - 0.12 * n) * (1 - 0.82 * ch), (0.42 - 0.12 * n) * (1 - 0.86 * ch), (0.32 - 0.1 * n) * (1 - 0.88 * ch)] }
  yield;
    for (let i = 0; i < 7; i++) {
      const t = 0.06 + i / 6 * 0.86, p = nc.getPointAt(t), T = nc.getTangentAt(t)
      const up = UP.clone().addScaledVector(T, -T.y).normalize(), side = new THREE.Vector3().crossVectors(T, up).normalize()
      const c = p.clone().addScaledVector(up, 0.012)
      put(raw, neck, tint(sweep([c.clone().addScaledVector(T, -0.0075), c.clone().addScaledVector(T, 0.0075)], (u) => 0.0105 * (1 + 0.18 * gs1(u - 0.5, 0.2)), { radial: 9, seg: 2 }), vb))
      put(raw, neck, tint(sweep([c.clone().addScaledVector(up, 0.006), c.clone().addScaledVector(up, 0.016).addScaledVector(T, -0.009)], (u) => 0.0045 * (1 - u * 0.55), { radial: 5, seg: 2 }), vb))
      for (const sd of [-1, 1]) put(raw, neck, tint(sweep([c.clone(), c.clone().addScaledVector(side, sd * 0.019).addScaledVector(up, -0.002)], (u) => 0.0034 * (1 - u * 0.5), { radial: 5, seg: 2 }), vb))
      if (i < 6) { const pd = nc.getPointAt(t + 0.07).addScaledVector(up, 0.012); put(raw, neck, tint(sweep([pd.clone().addScaledVector(T, -0.003), pd.clone().addScaledVector(T, 0.003)], () => 0.0095, { radial: 9, seg: 1 }), () => [0.3, 0.07, 0.05])) }
    }
  yield;
    // 筋腱：胸锁乳突肌（耳后乳突 → 锁骨内端）两条粗索，中段离开颈芯悬空；颈后两条项韧带（颅底 → 下位颈椎）；喉前几根细筋
    const mast = (sd: number) => HLp(sd * 0.037, -0.029, -0.01)
  yield;
    const cords: [THREE.Vector3[], number, number][] = []
  yield;
    for (const sd of [-1, 1]) {
      const a = mast(sd), b = V(sd * 0.022, 0.338, 0.228)
      const m = a.clone().lerp(b, 0.5).add(V(sd * 0.012, -0.024, 0.01))
      cords.push([[a, a.clone().lerp(m, 0.55).add(V(sd * 0.003, -0.004, 0)), m, m.clone().lerp(b, 0.5).add(V(0, -0.006, 0)), b], 0.0052, 0.32])
      const n0 = HLp(sd * 0.016, -0.026, -0.055), n1 = V(sd * 0.008, 0.36, 0.3)
      cords.push([[n0, n0.clone().lerp(n1, 0.5).add(V(0, 0.004, 0)), n1], 0.003, 0.5])
      const l0 = HLp(sd * 0.02, -0.034, 0.012), l1 = V(sd * 0.012, 0.315, 0.27)
      cords.push([[l0, l0.clone().lerp(l1, 0.5).add(V(sd * 0.006, -0.012, 0)), l1], 0.0022, 0.15])
    }
  yield;
    for (const [pts, r, fas] of cords) put(flesh, neck, fleshify(tube(pts, (t) => r * (0.75 + 0.45 * gs1(t - 0.5, 0.22)), { radial: 7, seg: 18, cap0: true, cap1: true }).geo, () => [0.8, 0.28 + fas * 0.4, 0]))
  yield;
    // 颅底下沿一圈焦黑的皮肉碎边（头底与颈之间不再是光滑的一整块）；用独立的随机流，不打乱后面头部各件的随机序列
    const R = rng(0x9e1 + seed * 31)
  yield;
    for (let i = 0; i < 9; i++) {
      const ang = -1.2 + i / 8 * 2.4, b0 = HLp(Math.sin(ang) * 0.04, -0.028 + 0.004 * Math.cos(ang * 3), -0.02 - Math.cos(ang) * 0.03), tip = b0.clone().add(V(0, -0.012 - R() * 0.01, -0.004))
      put(raw, neck, tint(sweep([b0, b0.clone().lerp(tip, 0.5).add(V(0, 0, -0.003)), tip], (t) => (0.004 + R() * 0.002) * (1 - 0.85 * t), { radial: 3, seg: 3 }), () => [0.05, 0.04, 0.034]))
    }
  yield;
  }
  yield;

  // ---------------- 头：秃、头盖骨一侧鼓出白色增生团把五官挤歪；无睑充血眼球；下颌脱臼大张、露牙 ----------------
  const head = joint(neck, headC, 'head')
  yield;
  const tumorDir = V(0.72, 0.6, 0.12).normalize()
  yield; // 头部局部：右上侧
  const eyeL = V(-0.36, 0.13, 0.85), eyeR = V(0.44, 0.0, 0.8)
  yield; // 右眼（增生侧）被挤低、挤偏
  const sx = 0.064, sy = 0.082, sz = 0.094
  yield;
  /** 头部雕刻：单位球方向 v（会被就地改写：上颌收窄、口顶压平）→ 半径倍率 k、AO a、焦黑倾向 c */
  const sculpt = (v: THREE.Vector3) => {
    let k = 1 + 0.03 * (jsN(v.x * 5 + 3, v.y * 5, v.z * 5) - 0.5) + 0.014 * (jsN(v.x * 13, v.y * 13 + 7, v.z * 13) - 0.5), a = 1, c = 0.6
    const front = sm(0.2, 0.7, v.z)
    // 阶段 1 收尾（10-25，ZAN：脸太圆）：削成骷髅——颧骨/颧弓顶出成棱、颧下与颞窝深凹、眉弓一道硬棱、眼窝深陷带骨缘、下半张脸收窄
    const g2 = (d: THREE.Vector3, w: number) => Math.exp(-d.lengthSq() / w)
    const _d = new THREE.Vector3()
    for (const sd of [-1, 1]) {
      // 颧骨：一块尖硬的骨突（小方差 → 边缘清楚），再沿颧弓向耳前伸出一道棱
      k += 0.15 * g2(_d.set(v.x - sd * 0.64, (v.y + 0.12) * 1.3, v.z - 0.68), 0.012)
      { const t = Math.min(1, Math.max(0, (0.66 - v.z) / 0.62)), ax = sd * (0.7 + 0.22 * t), ay = -0.14 - 0.04 * t
        k += 0.06 * Math.exp(-(((v.x - ax) * 1.4) ** 2 + ((v.y - ay) * 3.2) ** 2) / 0.02) * sm(0.75, 0.5, v.z) * sm(-0.05, 0.1, v.z) }
      // 颧下：颊部大块凹进去（皮直接贴在牙床上），AO 压暗
      const hc = g2(_d.set(v.x - sd * 0.6, (v.y + 0.42) * 0.9, v.z - 0.56), 0.035); k -= 0.2 * hc; a -= 0.42 * hc
      // 颞窝：眉弓外后方、颧弓上方一大块凹陷
      const tf = g2(_d.set(v.x - sd * 0.9, v.y - 0.1, (v.z - 0.3) * 0.8), 0.04); k -= 0.17 * tf; a -= 0.3 * tf
      // 下颌角后的乳突：头底收窄后，耳后下方剩一个小骨突（颈部筋腱从这里起）
      k += 0.07 * g2(_d.set(v.x - sd * 0.6, v.y + 0.42, v.z + 0.08), 0.012)
    }
    // 眉弓：一道横向硬棱，在两眼正上方最突（眼眶上缘），眉间略低；其上的额头平
    { const ridge = Math.exp(-((v.y - 0.29) ** 2) / 0.0025) * front
      const overEye = Math.max(Math.exp(-((v.x - eyeL.x) ** 2) / 0.04), Math.exp(-((v.x - eyeR.x) ** 2) / 0.04))
      k += ridge * (0.09 + 0.07 * overEye); a -= 0.15 * Math.exp(-((v.y - 0.22) ** 2) / 0.002) * front }
    // 下半张脸收窄成三角（颧骨以下往中线收），上颌略向前突（口鼻部像兽吻）
    if (v.y < -0.12) { const m = sm(-0.12, -0.65, v.y); v.x *= 1 - 0.3 * m * (0.4 + 0.6 * front); if (v.z > 0) v.z *= 1 + 0.08 * m }
    // 头底：下颌后方那一块原本是椭球的下半圆（看起来像垂下来的肉）——整块抬平、两侧收窄成颅底，留出颈椎与筋腱的位置
    { const back = sm(0.5, 0.05, v.z)
      if (v.y < -0.3 && back > 0) { const y0 = v.y, fl = -0.3 - 0.12 * sm(0.05, -0.6, v.z); v.y = y0 + (Math.max(y0, fl) - y0) * back; v.x *= 1 - 0.28 * back * sm(-0.3, -0.85, y0) }
      const und = sm(-0.25, -0.45, v.y) * back; a -= 0.35 * und; c -= 0.15 * und }
    // 眼窝：又大又深的骨洞（眼睑烧掉），边缘由眉弓与颧骨围出硬边；增生侧被挤成斜长的一道、位置更低
    for (const [e, sq] of [[eyeL, 1], [eyeR, 1.7]] as [THREE.Vector3, number][]) {
      const d = v.clone().sub(e); d.y *= sq
      const g = Math.exp(-d.lengthSq() / 0.04), core = Math.exp(-d.lengthSq() / 0.018)
      k -= 0.3 * g + 0.2 * core; a -= 0.5 * g + 0.35 * core; c -= 0.25 * g
    }
    // 鼻子烧没：倒心形黑洞（鼻骨下缘一道尖棱）
    { const d = v.clone().sub(V(-0.02, -0.17, 0.97)); d.x *= 1.5; d.y *= 0.9; const g = Math.exp(-d.lengthSq() / 0.016); k -= 0.32 * g; a -= 0.85 * g
      k += 0.05 * Math.exp(-((v.x + 0.02) ** 2 / 0.01 + (v.y + 0.02) ** 2 / 0.004)) * front }
    // 口顶：前下方压平（嘴里），只有牙上方一窄条裸露牙龈是生肉色
    if (v.y < -0.42) { const f = sm(-0.2, 0.5, v.z); v.y = v.y * (1 - f) + Math.max(v.y, -0.58) * f; if (f > 0.3 && v.y <= -0.575) { a *= 0.3; c = 0.05 } }
    if (v.y < -0.44 && v.z > 0.5) c = Math.min(c, 0.15)
    // 左颊烧穿：嘴角往上撕开一道，露出牙床旁的生肉
    { const d = v.clone().sub(V(-0.6, -0.42, 0.62)); d.y *= 1.6; const g = Math.exp(-d.lengthSq() / 0.03); k -= 0.08 * g; c -= 0.6 * g; a -= 0.2 * g }
    // 增生侧整块头盖骨被顶起
    const td = v.dot(tumorDir)
    k += 0.5 * sm(0.5, 0.95, td)
    c += 0.2 * sm(0.4, 0.8, td)
    return { k, a: Math.max(0.12, a), c: Math.min(1, Math.max(0, c)) }
  }
  yield;
  {
    let hg: THREE.BufferGeometry = new THREE.SphereGeometry(1, 88, 66);
  yield; hg.deleteAttribute('uv');
  yield; hg.deleteAttribute('normal');
  yield; hg = mergeVertices(hg)
  yield;
    const p = hg.attributes.position as THREE.BufferAttribute, v = new THREE.Vector3()
  yield;
    const ao = new Float32Array(p.count), cb = new Float32Array(p.count)
  yield;
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i)
      const { k, a, c } = sculpt(v)
      p.setXYZ(i, v.x * k * sx, v.y * k * sy, v.z * k * sz)
      ao[i] = a; cb[i] = c
    }
  yield;
    hg.applyMatrix4(hm);
  yield; hg.computeVertexNormals()
  yield;
    hg.setAttribute('aoT', new THREE.BufferAttribute(ao, 1));
  yield; hg.setAttribute('cbT', new THREE.BufferAttribute(cb, 1))
  yield;
    const hn = hg.toNonIndexed()
  yield;
    const aoA = hn.attributes.aoT as THREE.BufferAttribute, cbA = hn.attributes.cbT as THREE.BufferAttribute
  yield;
    let idx = 0
  yield;
    const g2 = fleshify(hn, () => { const r = [aoA.getX(idx), cbA.getX(idx), 0] as [number, number, number]; idx++; return r })
  yield;
    g2.deleteAttribute('aoT');
  yield; g2.deleteAttribute('cbT')
  yield;
    put(flesh, head, g2)
  yield;
  }
  yield;
  const HL = (x: number, y: number, z: number) => V(x, y, z).applyMatrix4(hm)
  yield; // 头部局部（米）→ 世界
  const unitToHead = (u: THREE.Vector3) => HL(u.x * sx, u.y * sy, u.z * sz)
  yield;
  // 嘴里的黑洞（喉咙），只从张开的嘴里看得见
  put(raw, head, tint(new THREE.SphereGeometry(0.036, 12, 8).scale(0.9, 0.8, 1).applyMatrix4(new THREE.Matrix4().makeTranslation(0, -0.04, 0.03)).applyMatrix4(hm), () => [0.05, 0.008, 0.006]))
  yield;
  // 上排牙：沿口顶前缘的弧，黄褐、缺几颗；上方一道裸露的牙龈
  const toothCol = (w: THREE.Vector3): [number, number, number] => { const n = jsN(w.x * 900, w.y * 900, w.z * 900); return [0.72 - 0.25 * n, 0.64 - 0.25 * n, 0.44 - 0.2 * n] }
  yield;
  const gumPts: THREE.Vector3[] = []
  yield;
  for (let i = 0; i < 14; i++) {
    const ph = -1.32 + i / 13 * 2.64, x = Math.sin(ph) * 0.034, z = Math.cos(ph) * 0.068 + 0.004
  yield;
    gumPts.push(HL(x * 1.02, -0.0455, z * 1.02))
  yield;
    if (i === 3 || i === 9) continue
  yield;
    const molar = Math.abs(ph) > 0.8, h = molar ? 0.011 : 0.016 + R() * 0.004, w = molar ? 0.0062 : 0.0046
  yield;
    put(raw, head, tint(sweep([HL(x, -0.044, z), HL(x * 1.01, -0.044 - h * 0.6, z * 1.01), HL(x * 1.02, -0.044 - h, z * 1.02 + 0.001)], (t) => w * (1 - t * 0.55), { radial: 5, seg: 3 }), toothCol))
  yield;
  }
  yield;
  put(flesh, head, fleshify(tube(gumPts, () => 0.0058, { radial: 6, seg: 20 }).geo, () => [0.8, 0.0, 0]))
  yield;
  // 眼球：左眼充血（血红巩膜 + 浑白瞳），右眼肿大泛白（翻白、红丝）；没有眼睑，半个眼球凸在外面
  const eyes: THREE.Vector3[] = []
  yield;
  for (const [e, r, red] of [[eyeL, 0.0158, true], [eyeR, 0.0195, false]] as [THREE.Vector3, number, boolean][]) {
    const ed = e.clone().normalize(), ek = sculpt(ed.clone()).k, ec = unitToHead(ed.clone().multiplyScalar(ek)).addScaledVector(HL(ed.x, ed.y, ed.z).sub(HL(0, 0, 0)).normalize(), -r * 0.15), look = HL(red ? 0.004 : 0.03, red ? 0.02 : -0.03, 0.6).sub(HL(0, 0, 0)).normalize()
  yield;
    const pc = ec.clone().addScaledVector(look, r)
  yield;
    eyes.push(L(head, ec))
  yield;
    put(raw, head, tint(new THREE.SphereGeometry(r, 28, 20).translate(ec.x, ec.y, ec.z), (w) => {
      const vn = jsN(w.x * 700, w.y * 700, w.z * 700), vein = 1 - sm(0.0, 0.12, Math.abs(vn - 0.5))
      const d = w.distanceTo(pc) / r
      if (red) { // 充血：整只巩膜血红，暗红血丝，瞳孔浑浊发白
        if (d < 0.28) return [0.1, 0.07, 0.05]
        if (d < 0.62) { const m = sm(0.5, 0.62, d); return [0.66 - 0.2 * m, 0.6 - 0.5 * m, 0.52 - 0.45 * m] }
        return [0.6 - 0.32 * vein, 0.07 - 0.04 * vein, 0.05 - 0.03 * vein]
      }
      // 翻白：浑黄的眼白，红丝从边缘爬进来
      const edge = sm(0.45, 1.3, d), iris = Math.exp(-((d - 0.42) ** 2) / 0.006) * 0.25
      return [0.8 - 0.3 * vein * edge - iris, 0.76 - 0.66 * vein * edge - 0.12 * edge - iris, 0.64 - 0.58 * vein * edge - 0.16 * edge - iris * 0.8]
    }))
  yield;
  }
  yield;
  // 几缕烧焦卷曲的残发（非增生侧）
  for (let i = 0; i < 6; i++) {
    const u = V(-0.4 - R() * 0.5, 0.45 + R() * 0.45, -0.5 + R() * 0.8).normalize(), b = unitToHead(u.clone().multiplyScalar(0.98)), nrm = unitToHead(u.clone().multiplyScalar(1.3)).sub(b).normalize()
  yield;
    const pts: THREE.Vector3[] = [], t1 = new THREE.Vector3().crossVectors(nrm, Math.abs(nrm.y) > 0.95 ? V(1, 0, 0) : UP).normalize(), t2 = new THREE.Vector3().crossVectors(nrm, t1)
  yield;
    for (let k = 0; k <= 10; k++) { const s = k / 10, ang = s * (8 + R() * 3); pts.push(b.clone().addScaledVector(nrm, 0.012 * s).addScaledVector(t1, Math.cos(ang) * 0.005 * s).addScaledVector(t2, Math.sin(ang) * 0.005 * s).add(V(0, -0.01 * s * s, 0))) }
  yield;
    put(raw, head, tint(sweep(pts, (t) => 0.0014 * (1 - 0.5 * t), { radial: 3, seg: 18 }), () => [0.035, 0.028, 0.022]))
  yield;
  }
  yield;
  // 头盖骨上的增生团：白色瘤体 + 一圈焦黑卷边 + 余烬；头皮上另有几颗小菌瘤
  {
    const eyeW = eyes.map((e) => e.clone().add(head.userData.pivot))
  yield;
    const tb = unitToHead(tumorDir.clone().multiplyScalar(1.3)), tn = tb.clone().sub(headC).normalize()
  yield;
    let mg: THREE.BufferGeometry = new THREE.IcosahedronGeometry(1, 12);
  yield; mg.deleteAttribute('uv');
  yield; mg.deleteAttribute('normal');
  yield; mg = mergeVertices(mg)
  yield;
    const mp = mg.attributes.position as THREE.BufferAttribute
  yield;
    for (let i = 0; i < mp.count; i++) { const x = mp.getX(i), y = mp.getY(i), z = mp.getZ(i), k = 0.8 + 0.38 * jsN(x * 2.2 + 5, y * 2.2, z * 2.2) + 0.1 * jsN(x * 6, y * 6 + 2, z * 6); mp.setXYZ(i, x * k * 0.064, y * k * 0.054, z * k * 0.062) }
  yield;
    mg.computeVertexNormals();
  yield; mg = mg.toNonIndexed();
  yield; mg.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, tn));
  yield; mg.translate(tb.x, tb.y, tb.z)
  yield;
    const mm = new THREE.Mesh(mergeAt([mg], ['position', 'normal'], head.userData.pivot), coreMat());
  yield; mm.name = 'tumor';
  yield; mm.userData.creep = 'tumor';
  yield; mm.castShadow = true;
  yield; head.add(mm)
  yield;
    hot.push({ c: tb.clone(), r: 0.09 })
  yield;
    const tA = new THREE.Vector3().crossVectors(tn, UP).normalize(), tB2 = new THREE.Vector3().crossVectors(tn, tA)
  yield;
    for (let i = 0; i < 26; i++) {
      const a = R() * Math.PI * 2, d = 0.012 + R() * 0.04, p = tb.clone().addScaledVector(tA, Math.cos(a) * d).addScaledVector(tB2, Math.sin(a) * d).addScaledVector(tn, 0.02 - d * 0.45)
      const r = 0.01 + R() * 0.02
      if (eyeW.some((e) => e.distanceTo(p) < r + 0.022)) continue
      balls.push({ node: head, p: L(head, p), n: tn.clone(), r })
      if (R() < 0.5) embers.push({ node: head, p: L(head, p.clone().addScaledVector(tn, r * 0.8)), r: 0.002 + R() * 0.0025 })
    }
  yield;
    for (let i = 0; i < 14; i++) {
      const a = i / 14 * Math.PI * 2 + R() * 0.3, d = 0.042 + R() * 0.008, p = tb.clone().addScaledVector(tA, Math.cos(a) * d).addScaledVector(tB2, Math.sin(a) * d).addScaledVector(tn, -0.024)
      if (eyeW.some((e) => e.distanceTo(p) < 0.03)) continue
      scabs.push({ node: head, p: L(head, p), n: p.clone().sub(headC).normalize(), r: 0.007 + R() * 0.005, kind: 'char' })
    }
  yield;
    for (let i = 0; i < 5; i++) {
      const u = V(-0.3 + R() * 0.8, 0.6 + R() * 0.4, -0.7 + R() * 0.9).normalize(), p = unitToHead(u.clone().multiplyScalar(1.0))
      balls.push({ node: head, p: L(head, p), n: p.clone().sub(headC).normalize(), r: 0.006 + R() * 0.007 })
    }
  yield;
  }
  yield;
  // 下颌：脱臼似地大张、歪向一侧；下排牙；几根拉长的筋连着颅骨
  const jawPivotL = V(0, -0.028, 0.012)
  yield;
  const jaw = joint(head, jawPivotL.clone().applyMatrix4(hm), 'jaw')
  yield;
  {
    const jm = new THREE.Matrix4().makeTranslation(jawPivotL.x, jawPivotL.y, jawPivotL.z)
      .multiply(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(1.12, 0.2, -0.17, 'XYZ')))
      .multiply(new THREE.Matrix4().makeTranslation(-jawPivotL.x, -jawPivotL.y, -jawPivotL.z))
  yield;
    const JL = (x: number, y: number, z: number) => V(x, y, z).applyMatrix4(jm).applyMatrix4(hm)
  yield;
    const arc: THREE.Vector3[] = [JL(-0.054, -0.026, 0.0), JL(-0.055, -0.06, 0.018)]
  yield;
    // 下巴收尖：下颌体前段成 V 形向前下方伸出一个尖（颏隆凸），两侧更窄
    for (let i = 0; i <= 10; i++) { const ph = -1.1 + i / 10 * 2.2, tip = Math.exp(-(ph * ph) / 0.05); arc.push(JL(Math.sin(ph) * 0.04 * (0.62 + 0.38 * Math.min(1, Math.abs(ph) / 0.9)), -0.072 - 0.006 * Math.cos(ph) - 0.009 * tip, Math.cos(ph) * 0.06 + 0.012 + 0.012 * tip)) }
  yield;
    arc.push(JL(0.055, -0.06, 0.018), JL(0.054, -0.026, 0.0))
  yield;
    const mand = tube(arc, (t, a) => (0.0056 + 0.0036 * gs1(t - 0.5, 0.05)) * (1 + 0.45 * Math.cos(a) ** 2), { radial: 8, seg: 48, up: HL(0, 1, 0).sub(HL(0, 0, 0)), cap0: true, cap1: true })
  yield;
    put(flesh, jaw, fleshify(mand.geo, () => [0.8, 0.62, 0]))
  yield;
    for (let i = 0; i < 12; i++) {
      if (i === 5 || i === 10) continue
      const ph = -1.05 + i / 11 * 2.1, x = Math.sin(ph) * 0.037, z = Math.cos(ph) * 0.056 + 0.012, h = Math.abs(ph) > 0.7 ? 0.008 : 0.011
      put(raw, jaw, tint(sweep([JL(x, -0.066, z), JL(x, -0.066 + h * 0.6, z), JL(x * 0.98, -0.066 + h, z - 0.001)], (t) => (Math.abs(ph) > 0.7 ? 0.0052 : 0.0038) * (1 - t * 0.5), { radial: 5, seg: 3 }), toothCol))
    }
  yield;
    for (const s of [-1, 1]) for (let k = 0; k < 2; k++) {
      const a = HL(s * 0.05, -0.03 - k * 0.012, 0.03 + k * 0.012), b = JL(s * 0.045, -0.058 + k * 0.01, 0.03 + k * 0.01)
      put(raw, head, tint(sweep([a, a.clone().lerp(b, 0.5).add(V(0, -0.004, 0)), b], (t) => 0.0018 * (1 - 0.5 * Math.sin(t * Math.PI)), { radial: 4, seg: 6 }), () => [0.42, 0.08, 0.06]))
    }
  yield;
  }
  yield;

  // ---------------- 双臂：比常人更长更细、关节凸出；长弯爪；菌斑与焦痕 ----------------
  jaw.userData.hinge = V(1, 0, 0).applyQuaternion(new THREE.Quaternion().setFromRotationMatrix(hm)).normalize()
  yield; // 下颌开合轴（世界 = 关节局部，静止旋转为 0）；绕它转正角 = 张得更大
  const rig: Partial<CreeperRig> = { body, neck, head, jaw, tail: tailRef! }
  yield;
  const armPaint: FleshPaint = (w, n) => [0.72 + 0.28 * sm(-0.6, 0.6, n.y), 0.58 + 0.35 * hotK(w), 0.6]
  yield;
  for (const s of [-1, 1]) {
    const S = V(s * 0.122, 0.335, 0.18), Wr = V(s * 0.405, 0.042, 0.555)
  yield;
    const la = 0.36, lb = 0.38
  yield;
    const E = ik2(S, Wr, la, lb, V(s * 0.5, 1, -0.45))
  yield;
    const side = s < 0 ? 'L' : 'R'
  yield;
    const ua = joint(body, S, 'upperArm' + side), fa = joint(ua, E, 'foreArm' + side), hd = joint(fa, Wr, 'hand' + side)
  yield;
    Object.assign(rig, { ['upperArm' + side]: ua, ['foreArm' + side]: fa, ['hand' + side]: hd })
  yield;
    const upHint = (a: THREE.Vector3, b: THREE.Vector3) => { const d = b.clone().sub(a).normalize(); return UP.clone().addScaledVector(d, -d.y).normalize() }
  yield;
    // 上臂：肌肉萎缩，肩峰与肘尖顶出
    const ub = S.clone().lerp(E, 0.5).add(V(s * 0.008, 0.01, 0))
  yield;
    const uT = tube([S, ub, E], (t, a) => (0.023 - 0.007 * sm(0.1, 0.6, t) + 0.006 * sm(0.75, 1, t)) * (1 + 0.12 * Math.cos(2 * a)) + 0.0016 * Math.pow(Math.cos(3 * a + 0.4), 8), { radial: 12, seg: 14, up: upHint(S, E), cap0: true })
  yield;
    put(flesh, ua, fleshify(uT.geo, armPaint))
  yield;
    put(flesh, ua, fleshify(new THREE.SphereGeometry(0.024, 10, 8).scale(1.2, 0.8, 1).translate(S.x + s * 0.012, S.y + 0.016, S.z), armPaint))
  yield; // 肩峰
    const clav = tube([V(s * 0.02, 0.352, 0.235), V(s * 0.07, 0.36, 0.215), S.clone().add(V(s * 0.012, 0.016, 0))], () => 0.0065, { radial: 6, seg: 8 })
  yield; // 锁骨
    put(flesh, body, fleshify(clav.geo, () => [0.9, 0.7, 0]))
  yield;
    // 肘尖（鹰嘴）：向弯曲外侧顶出一个骨节
    const u1 = S.clone().sub(E).normalize(), u2 = Wr.clone().sub(E).normalize(), outE = u1.clone().add(u2).multiplyScalar(-1).normalize()
  yield;
    put(flesh, fa, fleshify(new THREE.SphereGeometry(0.021, 10, 8).scale(1, 1.25, 1).translate(E.x + outE.x * 0.009, E.y + outE.y * 0.009, E.z + outE.z * 0.009), armPaint))
  yield;
    // 前臂：两根骨头的棱 + 腕部尺骨头
    const fb = E.clone().lerp(Wr, 0.5).add(V(s * 0.006, 0.006, 0))
  yield;
    const fT = tube([E, fb, Wr], (t, a) => (0.019 - 0.007 * t) * (1 + 0.18 * Math.cos(2 * a)) + 0.0022 * Math.pow(Math.max(0, Math.cos(2 * a)), 10) * (1 - t * 0.5), { radial: 12, seg: 16, up: upHint(E, Wr) })
  yield;
    put(flesh, fa, fleshify(fT.geo, armPaint))
  yield;
    // 手：掌贴地，四指细长、指节高拱如蛛腿，指尖下扎，爪又长又弯
    const fwd = V(s * 0.32, 0, 1).normalize(), lat = new THREE.Vector3().crossVectors(UP, fwd).normalize(), med = lat.clone().multiplyScalar(-s)
  yield;
    const Kc = Wr.clone().addScaledVector(fwd, 0.078);
  yield; Kc.y = 0.026
  yield;
    const palm = tube([Wr.clone().add(V(0, -0.006, 0)), Wr.clone().lerp(Kc, 0.5).add(V(0, -0.004, 0)), Kc], (t, a) => { const ca = Math.cos(a), sa = Math.sin(a), h = 0.0115, w = 0.016 + 0.017 * sm(0, 0.6, t); return 1 / Math.sqrt((ca / h) ** 2 + (sa / w) ** 2) + 0.0018 * Math.pow(Math.max(0, Math.cos(4 * a)), 6) * sm(0.2, 0.6, t) * (ca > 0 ? 1 : 0) }, { radial: 14, seg: 8, up: UP, cap1: true })
  yield;
    put(flesh, hd, fleshify(palm.geo, (w, n) => [0.7 + 0.3 * sm(-0.6, 0.6, n.y), 0.62 + 0.35 * hotK(w), 0.3]))
  yield;
    put(flesh, hd, fleshify(new THREE.SphereGeometry(0.0085, 8, 6).translate(Wr.x - med.x * 0.012, Wr.y + 0.008, Wr.z - med.z * 0.012), armPaint))
  yield; // 尺骨头
    const claws: THREE.BufferGeometry[] = []
  yield;
    const clawCol = (t: number): [number, number, number] => { const b = sm(0.6, 1, t); return [0.62 - 0.3 * t - 0.05 * b, 0.56 - 0.38 * t - 0.12 * b, 0.42 - 0.3 * t - 0.1 * b] }
  yield; // 角质黄灰 → 褐 → 末端带血
    const finger = (B: THREE.Vector3, dir: THREE.Vector3, lp: number, lm: number, ld: number, arch: number, r0: number) => {
      const J1 = B.clone().addScaledVector(dir, lp).add(V(0, arch, 0))
      const J2 = J1.clone().addScaledVector(dir, lm).add(V(0, -arch * 0.35, 0))
      const Tp = J2.clone().addScaledVector(dir, ld); Tp.y = 0.011
      const segs: [THREE.Vector3, THREE.Vector3, number, number][] = [[B, J1, r0, r0 * 0.85], [J1, J2, r0 * 0.85, r0 * 0.72], [J2, Tp, r0 * 0.72, r0 * 0.55]]
      for (const [a, b, ra, rb] of segs) put(flesh, hd, fleshify(tube([a, b], (t) => ra + (rb - ra) * t, { radial: 7, seg: 4, up: upHint(a, b), cap0: true, cap1: true }).geo, (w, n) => [0.72 + 0.28 * sm(-0.6, 0.6, n.y), 0.65 + 0.3 * hotK(w), 0.25]))
      for (const [j, r] of [[J1, r0 * 1.22], [J2, r0 * 1.02]] as [THREE.Vector3, number][]) put(flesh, hd, fleshify(new THREE.SphereGeometry(r, 8, 6).translate(j.x, j.y + r * 0.2, j.z), () => [0.85, 0.7, 0.2])) // 指节骨突
      // 爪：顺末节方向伸出、向下钩进地面
      const cl = 0.052 + R() * 0.018, cd = Tp.clone().sub(J2).normalize()
      const c0 = Tp.clone().addScaledVector(cd, -0.004).add(V(0, 0.0035, 0)), c1 = Tp.clone().addScaledVector(dir, cl * 0.55).add(V(0, 0.006, 0)), c2 = Tp.clone().addScaledVector(dir, cl).add(V(0, -0.009, 0))
      const g = sweep([c0, c1, c2], (t, _d, cs, sn) => 0.0052 * Math.pow(1 - t, 0.9) / Math.sqrt(cs * cs + (sn / 0.62) ** 2), { radial: 6, seg: 8 })
      const n = g.attributes.position.count, c = new Float32Array(n * 3)
      for (let i = 0; i < n; i++) { const t = Math.floor(i / 7) / 8; const [r, gg, b] = clawCol(t); c[i * 3] = r; c[i * 3 + 1] = gg; c[i * 3 + 2] = b }
      g.setAttribute('color', new THREE.BufferAttribute(c, 3)); claws.push(g.index ? g.toNonIndexed() : g)
    }
  yield;
    const offs = [-0.025, -0.0085, 0.0085, 0.025], spread = [-0.42, -0.14, 0.14, 0.4], lens = [0.86, 1, 1.04, 0.9]
  yield;
    for (let f = 0; f < 4; f++) {
      const dir = fwd.clone().applyAxisAngle(UP, spread[f] * -s).normalize()
      const B = Kc.clone().addScaledVector(lat, offs[f]).add(V(0, 0.004, 0))
      const k = lens[f]
      finger(B, dir, 0.05 * k, 0.037 * k, 0.03 * k, 0.026, 0.0074)
    }
  yield;
    finger(Wr.clone().addScaledVector(fwd, 0.028).addScaledVector(med, 0.022).add(V(0, -0.004, 0)), fwd.clone().multiplyScalar(0.55).addScaledVector(med, 0.85).normalize(), 0.034, 0.028, 0.022, 0.014, 0.0082)
  yield;
    for (const g of claws) put(raw, hd, g)
  yield;
    // 臂上的菌斑：肘与腕关节各一小簇（呼应参照图「关节上一颗白球」），上臂零星
    for (const [node, c, n, rr] of [[fa, E.clone().addScaledVector(outE, 0.022), 6, 0.013], [hd, Wr.clone().add(V(0, 0.016, 0)), 4, 0.008], [ua, S.clone().lerp(E, 0.45).add(V(0, 0.022, 0)), 4, 0.009]] as [THREE.Object3D, THREE.Vector3, number, number][]) {
      for (let i = 0; i < n; i++) { const p = c.clone().add(V((R() - 0.5) * 0.03, (R() - 0.2) * 0.012, (R() - 0.5) * 0.03)); balls.push({ node, p: L(node, p), n: UP.clone(), r: rr * (0.5 + R() * 0.7) }); if (R() < 0.35) embers.push({ node, p: L(node, p.clone().add(V(0, rr * 0.6, 0))), r: 0.0018 }) }
      hot.push({ c, r: 0.04 })
    }
  yield;
    // 袖口残片：上臂近肩处一圈焦黑碎布
    {
      const pts: THREE.Vector3[] = []
      for (let k = 0; k <= 9; k++) { const sp = uT.at(0.22 + 0.03 * Math.sin(k), k / 9 * Math.PI * 1.6 - 0.3); pts.push(sp.p.addScaledVector(sp.n, 0.003)) }
      put(cloth, ua, ribbon(pts, 0.03, () => S.clone().sub(E).normalize(), R))
    }
  yield;
  }
  yield;

  // ---------------- 躯干上的增生团（白绒里嵌着余烬，边缘焦黑卷曲） ----------------
  for (const c of clusters) {
    const sp = torso.at(c.t, c.a)
  yield;
    balls.push({ node: body, p: L(body, sp.p.clone().addScaledVector(sp.n, c.core * 0.35)), n: sp.n.clone(), r: c.core })
  yield;
    for (let i = 0; i < c.n; i++) {
      const dt = (R() - 0.5) * c.spread * 3.2, da = (R() - 0.5) * c.spread * 14
      const q = torso.at(Math.min(0.96, Math.max(0.04, c.t + dt)), c.a + da)
      const r = 0.009 + R() * (c.core * 0.55)
      const p = q.p.clone().addScaledVector(q.n, r * 0.3)
      balls.push({ node: body, p: L(body, p), n: q.n.clone(), r })
      if (R() < 0.55) embers.push({ node: body, p: L(body, p.clone().addScaledVector(q.n, r * 0.78).add(V((R() - 0.5) * r, 0, (R() - 0.5) * r))), r: 0.0022 + R() * 0.003 })
    }
  yield;
    for (let i = 0; i < 7; i++) {
      const ang = i / 7 * Math.PI * 2 + R() * 0.6
      const q = torso.at(Math.min(0.96, Math.max(0.03, c.t + Math.cos(ang) * c.spread * 1.7)), c.a + Math.sin(ang) * c.spread * 7.5)
      scabs.push({ node: body, p: L(body, q.p), n: q.n.clone(), r: 0.008 + R() * 0.008, kind: 'char' })
    }
  yield;
  }
  yield;
  // 零星焦痂起伏
  for (let i = 0; i < 12; i++) { const q = torso.at(0.08 + R() * 0.85, R() * Math.PI * 2);
  yield; scabs.push({ node: body, p: L(body, q.p), n: q.n.clone(), r: 0.007 + R() * 0.008, kind: 'char' })
  yield; }
  yield;

  // ---------------- 衣服烧剩的碎布条 ----------------
  {
    const band: THREE.Vector3[] = []
  yield;
    for (let k = 0; k <= 12; k++) { const q = torso.at(0.88 + 0.025 * Math.sin(k * 1.7), -2.5 + k / 12 * 1.9); band.push(q.p.addScaledVector(q.n, 0.003)) }
  yield;
    put(cloth, body, ribbon(band, 0.05, () => spine[4].clone().sub(spine[3]).normalize(), R))
  yield;
    const back: THREE.Vector3[] = []
  yield;
    for (let k = 0; k <= 8; k++) { const q = torso.at(0.92 - k * 0.04, 0.95 - k * 0.09); back.push(q.p.addScaledVector(q.n, 0.003)) }
  yield;
    put(cloth, body, ribbon(back, 0.035, (t) => torso.at(0.92 - t * 0.32, 0.95 - t * 0.72).n, R))
  yield;
  }
  yield;

  // ---------------- 合批 ----------------
  for (const [node, gs] of flesh) { const m = new THREE.Mesh(mergeAt(gs, ['position', 'normal', 'color', 'aW'], node.userData.pivot), fleshMat());
  yield; m.name = 'flesh';
  yield; m.castShadow = true;
  yield; m.receiveShadow = true;
  yield; node.add(m)
  yield; }
  yield;
  for (const [node, gs] of raw) { const m = new THREE.Mesh(mergeAt(gs, ['position', 'normal', 'color', 'uv'], node.userData.pivot), rawMat());
  yield; m.name = 'parts';
  yield; m.castShadow = true;
  yield; node.add(m)
  yield; }
  yield;
  for (const [node, gs] of cloth) { const m = new THREE.Mesh(mergeAt(gs, ['position', 'normal', 'color', 'uv'], node.userData.pivot), clothMat());
  yield; m.name = 'rags';
  yield; m.castShadow = true;
  yield; node.add(m)
  yield; }
  yield;
  addScabs(scabs, R)
  yield;
  const objs = yield* buildBallObjectsJob(balls, { R, age: 0.1, threads: 10, u: 0.009 })
  yield;
  // 增生物：多数仍是亮白，一部分被烧成焦褐
  for (const ob of objs) if ((ob as THREE.InstancedMesh).isInstancedMesh && ob.userData.creep === 'ball') {
    const im = ob as THREE.InstancedMesh
    for (let i = 0; i < im.count; i++) if (R() < 0.22) im.setColorAt(i, _c.setRGB(0.36, 0.3, 0.25))
    if (im.instanceColor) im.instanceColor.needsUpdate = true
  }
  yield;
  const emberObjs = buildEmbers(embers)
  yield;
  root.userData.creeperHuman = { rig: rig as CreeperRig, embers: emberObjs, balls: objs, eyes }
  yield;
  complete=true; return root

  } finally { if(!complete)disposeL8Tree(root) }
}
/** 焦痂 / 脱皮创面：贴着体表的扁平碎块（按节点合批） */
function addScabs(list: { node: THREE.Object3D; p: THREE.Vector3; n: THREE.Vector3; r: number; kind: 'char' | 'raw' }[], R: () => number) {
  const by = new Map<THREE.Object3D, THREE.BufferGeometry[]>()
  const up = V(0, 1, 0)
  for (const s of list) {
    const g = new THREE.IcosahedronGeometry(1, 1)
    const p = g.attributes.position as THREE.BufferAttribute
    for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i); const k = 0.8 + 0.4 * jsN(x * 3 + s.p.x * 50, y * 3, z * 3 + s.p.z * 50); p.setXYZ(i, x * k, y * k, z * k) }
    g.scale(s.r, s.r * (s.kind === 'char' ? 0.3 : 0.18), s.r * (0.7 + R() * 0.5))
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(up, s.n))
    g.translate(s.p.x - s.n.x * s.r * 0.1, s.p.y - s.n.y * s.r * 0.1, s.p.z - s.n.z * s.r * 0.1)
    const ng = g.index ? g.toNonIndexed() : g, n = ng.attributes.position.count, c = new Float32Array(n * 3)
    for (let i = 0; i < n; i++) {
      const j = 0.75 + R() * 0.5
      if (s.kind === 'char') { c[i * 3] = 0.08 * j; c[i * 3 + 1] = 0.06 * j; c[i * 3 + 2] = 0.05 * j }
      else { c[i * 3] = 0.52 * j; c[i * 3 + 1] = 0.16 * j; c[i * 3 + 2] = 0.13 * j }
    }
    ng.setAttribute('color', new THREE.BufferAttribute(c, 3))
    ng.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(n * 2), 2))
    ng.computeVertexNormals()
    const l = by.get(s.node) ?? []; l.push(ng); by.set(s.node, l)
  }
  for (const [node, gs] of by) { const m = new THREE.Mesh(mergeGeos(gs), rawMat()); m.name = 'scabs'; m.userData.creep = 'scab'; node.add(m) }
}
/** 余烬：橙色发光小点（基础材质，不受光）+ 加色光晕公告板。返回各节点的实例（渲染阶段可做闪烁） */
function buildEmbers(list: { node: THREE.Object3D; p: THREE.Vector3; r: number }[]): THREE.InstancedMesh[] {
  const by = new Map<THREE.Object3D, typeof list>()
  for (const e of list) { const l = by.get(e.node) ?? []; l.push(e); by.set(e.node, l) }
  const out: THREE.InstancedMesh[] = []
  for (const [node, l] of by) {
    const dot = new THREE.InstancedMesh(ballGeo(), emberMat(), l.length), halo = new THREE.InstancedMesh(haloGeo(), emberHaloMat(), l.length)
    l.forEach((e, i) => { _m.compose(e.p, _q.identity(), _s.setScalar(e.r)); dot.setMatrixAt(i, _m); halo.setMatrixAt(i, _m) })
    dot.computeBoundingSphere(); halo.computeBoundingSphere()
    dot.userData.creep = 'ember'; halo.userData.creep = 'emberHalo'; halo.renderOrder = 4
    node.add(dot, halo); out.push(dot, halo)
  }
  return out
}

// ======================================================================
// 第一人称手臂：0–4 阶菌斑叠加
// ======================================================================
/** 4 阶空手：五指半张成爪（长指甲露在外面，不扎进掌心）。机制阶段替换 heldHandPose('') 用 */
export const CREEP_CLAW_HAND_POSE: HandPose = { at: [0.004, -0.005, -0.03], r: 0, fdir: [0.28, -0.4, 1], wrap: 0.42, thumbWrap: 0.5 }
/** 各阶段的手部皮肤色：2–3 阶略显苍白发灰，4 阶高烧发红 */
export function creepHandLook(l: RetroHandLook, stage: CreepStage): RetroHandLook {
  if (stage <= 1 || l.gloved) return l
  const c = new THREE.Color(l.skin)
  if (stage === 4) c.lerp(new THREE.Color('#b8584a'), 0.42)
  else c.lerp(new THREE.Color('#b9b3aa'), stage === 2 ? 0.15 : 0.3)
  return { ...l, skin: '#' + c.getHexString() }
}
interface HandMarks { tips: [number[], number[], number][]; wrist: number[]; fdir: number[]; back?: number[] }
export interface CreepHandOverlay {
  readonly group: THREE.Group
  stage: CreepStage
  /** 切换阶段（重新长菌） */
  setStage(s: CreepStage): void
  /** 手的握姿 / 几何变化后调用（hand.setPose 之后） */
  sync(): void
  dispose(): void
}
/** 霉斑覆盖层：与手同一几何、polygonOffset 叠在皮肤上；噪声裁出连片的白色菌斑（覆盖率 uCov） */
function moldMat(cov: { value: number }, seed: { value: number }) {
  const m = new THREE.MeshLambertMaterial({ color: '#f2f0ea', emissive: CREEP_FLUFF.emissive, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 })
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, { uCov: cov, uSeed: seed })
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vCreepD;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvCreepD = transformed;')
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vCreepD;\nuniform float uCov, uSeed;\n' + GLSL_NOISE)
      .replace('#include <color_fragment>', `#include <color_fragment>
        float cz = creepF(vCreepD * 70.0 + uSeed);
        float edge = 1.0 - uCov;
        if (cz < edge) discard;
        // 菌斑边缘是稀疏的绒毛点（不是一条硬边）：边缘带里按细噪声零星保留
        float fine = creepN(vCreepD * 900.0 + uSeed);
        if (cz < edge + 0.035 && fine < 0.45) discard;
        diffuseColor.rgb *= 0.82 + 0.25 * creepN(vCreepD * 420.0);`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        float creepFr = 1.0 - abs(dot(normalize(normal), normalize(vViewPosition)));
        totalEmissiveRadiance += diffuseColor.rgb * 0.45 * pow(creepFr, 2.0);`)
  }
  m.customProgramCacheKey = () => 'creepMold'
  envShaders(m, 'creepMold')
  return m
}
/**
 * 第一人称手（retroViewHand.buildRetroHand 的返回值）的爬菌叠加层：挂在 hand.group 下，随手一起运动。
 *  · 0–1 阶：无可见变化（1 阶只有疼痛，画面效果属于机制阶段）；
 *  · 2 阶：手背 / 前臂零星白色绒毛痘；
 *  · 3 阶：整条手臂被连片菌斑 + 密集绒球覆盖；
 *  · 4 阶：同 3 阶 + 指甲变长（长度按到手部其它部位的距离截断，握拳时不扎进掌心）；手臂发红请配合 creepHandLook()。
 * 用法：const ov = creepHandOverlay(hand); ov.setStage(3); …hand.setPose(p); ov.sync()
 */
export function creepHandOverlay(hand: RetroHand, stage: CreepStage = 0, seed = 1): CreepHandOverlay {
  let disposed=false
  const group = new THREE.Group(); group.name = 'creep-hand'; group.userData.creep = 'hand'
  hand.group.add(group)
  const cov = { value: 0 }, sd = { value: seed * 13.7 }
  const mold = new THREE.Mesh(hand.skin.geometry, moldMat(cov, sd)); mold.frustumCulled = false; mold.userData.creep = 'mold'
  group.add(mold)
  let growth: THREE.Object3D[] = []
  let nails: THREE.Mesh | null = null
  let geoRef: THREE.BufferGeometry | null = null
  let plan: { i0: number; i1: number; i2: number; u: number; v: number; r: number }[] | null = null, planKey = ''
  const clear = () => {
    for (const o of growth) { o.removeFromParent(); if ((o as THREE.InstancedMesh).isInstancedMesh) (o as THREE.InstancedMesh).dispose(); else if ((o as THREE.LineSegments).isLineSegments) (o as THREE.LineSegments).geometry.dispose() }
    growth = []
    if (nails) { nails.removeFromParent(); nails = null } // 指甲几何归 NAIL_CACHE 所有
  }
  const build = () => {
    clear()
    const g = hand.skin.geometry
    geoRef = g
    mold.geometry = g
    const st = api.stage
    cov.value = st >= 3 ? (st === 4 ? 0.62 : 0.72) : st === 2 ? 0.0 : 0
    mold.visible = cov.value > 0
    if (st < 2 || !g.attributes.position) return
    const marks = g.userData.creepMarks as HandMarks | undefined
    const R = rng(0x4a3d + seed * 97 + st * 7)
    // 取样面：按到手腕的距离分「前臂」与「手」；2 阶偏向手背与前臂，3 阶起全覆盖
    // 阶段 2：取样结果记成「三角形顶点号 + 重心坐标」，手的握姿变化（几何重建、拓扑不变）时按新顶点位置重新求出绒球位置——
    // 手指抽动时绒球跟着手指走，不会重新随机
    const P = g.attributes.position as THREE.BufferAttribute, ix = g.index
    const triN = ix ? ix.count : P.count
    if (!plan || planKey !== st + ':' + triN) {
      const wr = marks ? V(marks.wrist[0], marks.wrist[1], marks.wrist[2]) : V(0, 0, 0)
      const fd = marks ? V(marks.fdir[0], marks.fdir[1], marks.fdir[2]).normalize() : V(0, 0, 1)
      const tmp = new THREE.Vector3(), a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3()
      // 只在相机可能看到的段长菌：2 阶痘疹集中在手背到前臂前段（第一人称看得到的部分）；3 阶起覆盖到肘（手腕后 0.26 m）
      const reach = st === 2 ? 0.13 : 0.26
      const tri: number[] = [], cum: number[] = []
      let tot = 0
      for (let i = 0; i + 2 < triN; i += 3) {
        const i0 = ix ? ix.getX(i) : i, i1 = ix ? ix.getX(i + 1) : i + 1, i2 = ix ? ix.getX(i + 2) : i + 2
        if (tmp.fromBufferAttribute(P, i0).sub(wr).dot(fd) >= reach) continue
        a.fromBufferAttribute(P, i0); b.fromBufferAttribute(P, i1); c.fromBufferAttribute(P, i2)
        const ar = b.sub(a).cross(c.sub(a)).length() / 2
        if (!(ar > 1e-10)) continue
        tri.push(i0, i1, i2); tot += ar; cum.push(tot)
      }
      const n = st === 2 ? 26 : st === 3 ? 95 : 85
      plan = []
      for (let i = 0; i < n && cum.length; i++) {
        const t = R() * tot
        let lo = 0, hi = cum.length - 1
        while (lo < hi) { const mid = (lo + hi) >> 1; if (cum[mid] < t) lo = mid + 1; else hi = mid }
        let u = R(), v = R(); if (u + v > 1) { u = 1 - u; v = 1 - v }
        const k = lo * 3
        a.fromBufferAttribute(P, tri[k]).multiplyScalar(1 - u - v).addScaledVector(b.fromBufferAttribute(P, tri[k + 1]), u).addScaledVector(c.fromBufferAttribute(P, tri[k + 2]), v)
        const along = a.sub(wr).dot(fd)
        // 2 阶痘疹：小、零散，多在前臂；3–4 阶：大小混杂、连片
        const r = st === 2 ? 0.0032 + R() * 0.0036 : 0.003 + Math.pow(R(), 1.6) * (along > 0.02 ? 0.008 : 0.0055)
        plan.push({ i0: tri[k], i1: tri[k + 1], i2: tri[k + 2], u, v, r })
      }
      planKey = st + ':' + triN
    }
    const balls: CreepBall[] = []
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3()
    for (const q of plan) {
      a.fromBufferAttribute(P, q.i0); b.fromBufferAttribute(P, q.i1); c.fromBufferAttribute(P, q.i2)
      const nrm = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a)).normalize()
      const p = a.clone().multiplyScalar(1 - q.u - q.v).addScaledVector(b, q.u).addScaledVector(c, q.v)
      balls.push({ node: group, p: p.addScaledVector(nrm, q.r * 0.3), n: nrm, r: q.r })
    }
    const R2 = rng(0x4a3e + seed * 97 + st * 7) // 外观随机（朝向、菌丝）固定种子：每次重建都一样
    growth = buildBallObjects(balls, { R: R2, age: st === 4 ? 0.1 : 0.02, threads: st >= 3 ? 8 : 0, u: 0.004 })
    if (st === 4 && marks) {
      // 指甲按碰撞截断，计算较贵：按手部几何缓存（抽动只在少数几个握姿之间切换）
      let ng = NAIL_CACHE.get(g)
      if (ng === undefined) { const m = buildHandNails(marks, g, rng(0x4a3f + seed * 97)); ng = m ? m.geometry : null; NAIL_CACHE.set(g, ng); if(ng)ng.userData.entityShared=true; const cachedNails=ng; const retire=()=>{g.removeEventListener('dispose',retire);cachedNails?.dispose();NAIL_CACHE.delete(g)};g.addEventListener('dispose',retire) }
      if (ng) { nails = new THREE.Mesh(ng, rawMat()); nails.name = 'creep-nails'; nails.frustumCulled = false; nails.userData.creep = 'nails' }
    }
    if (nails) group.add(nails)
  }
  const api: CreepHandOverlay = {
    group, stage,
    setStage(s) { if(disposed)return; if (s === api.stage && geoRef === hand.skin.geometry) return; api.stage = s; build() },
    sync() { if(!disposed&&geoRef !== hand.skin.geometry) build() },
    dispose() { if(disposed)return;disposed=true;clear();group.removeFromParent();(mold.material as THREE.Material).dispose() },
  }
  group.userData.creepHand = { hand, overlay: api } // 阶段 2：animateCreeper(overlay.group, 'handTwitch', t, stage) 用
  build()
  return api
}
/** 指甲几何缓存：手部几何（每个握姿一份，由 retroViewHand 的 LRU 管理）→ 截断好的指甲 */
const NAIL_CACHE = new WeakMap<THREE.BufferGeometry, THREE.BufferGeometry | null>()
/** 第一人称长指甲：从指尖沿末节方向伸出、向掌心微弯；逐步前进，碰到手的其它部位（距离 < 4mm）就截断 */
function buildHandNails(marks: HandMarks, g: THREE.BufferGeometry, R: () => number): THREE.Mesh | null {
  const P = g.attributes.position as THREE.BufferAttribute
  const verts: THREE.Vector3[] = []
  for (let i = 0; i < P.count; i += 3) verts.push(new THREE.Vector3().fromBufferAttribute(P, i)) // 每三角取一点足够
  const gs: THREE.BufferGeometry[] = []
  marks.tips.forEach(([tp, td, tr], fi) => {
    const tip = V(tp[0], tp[1], tp[2]), d = V(td[0], td[1], td[2]).normalize()
    const own = verts.filter((v) => v.distanceTo(tip) < 0.03)
    const free = (q: THREE.Vector3) => !verts.some((v) => !own.includes(v) && v.distanceTo(q) < 0.004)
    const want = (fi === 4 ? 0.018 : 0.026) + R() * 0.005
    let L = 0
    const q = new THREE.Vector3()
    for (let s = 0.002; s <= want; s += 0.002) { q.copy(tip).addScaledVector(d, s); if (!free(q)) break; L = s }
    if (L < 0.006) return
    const base = tip.clone().addScaledVector(d, -tr * 0.6)
    // 向掌心弯钩（爪形）：弯曲方向 = 手背法线的反向，去掉沿指向的分量
    const bk = marks.back ? V(marks.back[0], marks.back[1], marks.back[2]) : V(1, 0, 0)
    const curl = bk.addScaledVector(d, -bk.dot(d)).normalize().multiplyScalar(-1)
    const mid = tip.clone().addScaledVector(d, L * 0.5).addScaledVector(curl, L * 0.08), end = tip.clone().addScaledVector(d, L * 0.92).addScaledVector(curl, L * 0.32)
    const gg = sweep([base, mid, end], (t) => Math.min(tr * 0.62, 0.0046) * (1 - t * 0.9), { radial: 5, seg: 5 })
    const n = gg.attributes.position.count, c = new Float32Array(n * 3)
    for (let i = 0; i < n; i++) { const t = Math.floor(i / 6) / 5, bl = Math.max(0, (t - 0.65) / 0.35); c[i * 3] = 0.82 - 0.38 * bl; c[i * 3 + 1] = 0.74 - 0.6 * bl; c[i * 3 + 2] = 0.56 - 0.46 * bl }
    gg.setAttribute('color', new THREE.BufferAttribute(c, 3))
    gs.push(gg.index ? gg.toNonIndexed() : gg)
  })
  if (!gs.length) return null
  const m = new THREE.Mesh(mergeGeos(gs), rawMat()); m.name = 'creep-nails'; m.frustumCulled = false; m.userData.creep = 'nails'
  return m
}
