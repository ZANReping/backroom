import {isAlphaKind} from '../content/alphaDecor'
import {buildAlphaDecor} from './alphaMeshes'
import {buildL0Furniture} from './l0Furniture'
import {buildL4Structure} from './l4Meshes'
import { buildL5Structure, buildL5Registered } from './l5Meshes'
import { isL5DecorKind } from '../content/l5Decor'
import {l3Structure} from './l3Meshes'
import {buildL3Glass} from './l3Glass'
import {isTradeKind} from '../content/tradeDecor'
import {buildTradeDecor} from './tradeMeshes'
import { buildSettlementStation } from './settlementMeshes'
// 结构/出口低模（按 StructKind 建造，含可动盖板/门铰链 userData 约定）
import * as THREE from 'three'
import {buildL4OldStairs} from './l4OldStairs'
import { buildL1Column } from './l1Architecture'
import { l1RoofAt } from '../world/l1Architecture'
import { buildL11Structure } from './l11Meshes'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { caveCeilingAt, doorNeedsRotate, floorHeight, tallCeilH, type GameMap } from '../world/mapgen'
import type { LevelDef, Structure } from '../core/types'
import { box, cyl, glow, col, mulberry, levelTexture, noiseTexture, makeCanvasCtx, toTex, texLevelId, litMaterial, getMaterialMode, WALL_H, architecturalGlassMaterial, configureSurfaceTexture } from './shared'
import { addL2DoorDetails, l2DoorMaterial } from './l2Door'
import {l2Material} from './l2Materials'
import {alignL2WallProp,buildL2Machine} from './l2WallProps'

// 墙纸贴图盒（柱厅立柱用：UV 按面宽/柱高放大，与墙面 1m 一循环的世界空间密度一致）
function wallpaperBox(w: number, h: number, d: number, def: LevelDef, x = 0, y = 0, z = 0): THREE.Mesh {
  const geo = new THREE.BoxGeometry(w, h, d)
  const uv = geo.attributes.uv as THREE.BufferAttribute
  const nor = geo.attributes.normal
  const uvPerMeter = def.id === 0 ? 0.72 : 1
  for (let i = 0; i < uv.count; i++) {
    const ny = Math.abs(nor.getY(i))
    if (ny > 0.5) uv.setXY(i, uv.getX(i) * w * uvPerMeter, uv.getY(i) * d * uvPerMeter) // 顶/底面
    else uv.setXY(i, uv.getX(i) * w * uvPerMeter, uv.getY(i) * h * uvPerMeter) // 侧面：条纹保持竖直、密度与墙面一致
  }
  const m = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({
    // v53：柱面叠乘色与墙面顶点色对齐（geometry.ts 墙面 wSide：WALL_TINT[0]=#d8cbab，其余=pal.wall）——
    // 原先非 L0 恒近白 #e8e8e8，反照率远高于两侧墙面，昏暗/无光环境下柱子像自发光一样亮起
    color: def.id === 0 ? '#ffffff' : def.palette.wall,
    map: levelTexture(def.id === 0 ? 'l0_wall_classic_v2.png' : `l${texLevelId(def.id)}_wall`, () => noiseTexture(def.palette.wall, def.palette.wallTop)),
  }))
  m.position.set(x, y, z)
  return m
}
// v54b：与主墙循环完全一致的墙盒（wallwindow 用）——geometry.ts 主层墙是「默认盒 UV（每面整张贴图）+
// 顶点色 WALL_TINT[id] ?? pal.wall × l{id}_wall 贴图」；wallpaperBox 的 UV 按尺寸放大，贴图密度与邻墙
// 不一致（窗口上下墙段/收边墙板与旁边墙面有色差）。tintK 供踢脚线压暗（×0.45，L0 ×0.62 同主层）
function wallMatchBox(w: number, h: number, d: number, def: LevelDef, tintK = 1, x = 0, y = 0, z = 0): THREE.Mesh {
  if (def.id === 0) {
    const matched = wallpaperBox(w, h, d, def, x, y, z)
    ;(matched.material as THREE.MeshLambertMaterial).color.multiplyScalar(tintK)
    return matched
  }
  const c = col(def.id === 0 ? '#d8cbab' : def.palette.wall).multiplyScalar(tintK)
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshLambertMaterial({
    color: c,
    map: levelTexture(`l${texLevelId(def.id)}_wall`, () => noiseTexture(def.palette.wall, def.palette.wallTop)),
  }))
  m.position.set(x, y, z)
  return m
}
import { graffitiTextures } from './textures'

// 贴图 Lambert 材质（v34：容器木纹/金属贴图）——磁盘贴图经 levelTexture 缓存，离线自动回退程序噪点；
// tint 近白叠乘保留贴图本色（looted 时传暗色达成变暗）
function texLambert(name: string, fbBase: string, fbAlt: string, tint: string | number = '#e8e2d2'): THREE.MeshLambertMaterial {
  return new THREE.MeshLambertMaterial({ color: tint, map: levelTexture(name, () => noiseTexture(fbBase, fbAlt)) })
}

// L8 自然岩体统一 PBR：钟乳石、石笋、岸石、突岩和悬浮岩共用生态带的颜色/法线/粗糙度来源。
function caveRockMaterial(variant0: unknown, normalStrength = 0.88) {
  const variant = String(variant0 ?? 'phreatic')
  const terrain = variant === 'breakdown' || variant === 'rottnest' ? 'floor'
    : variant === 'vadose' || variant === 'movile' ? 'ceil' : 'wall'
  const tint = variant === 'rottnest' ? '#aeb7a1' : variant === 'movile' ? '#bbb994'
    : variant === 'handyland' ? '#bd968e' : variant === 'hyperspace' ? '#aec5bd' : '#c5beb0'
  const base = `l8_${terrain}`
  return litMaterial({
    color: tint,
    map: levelTexture(`${base}.jpg`, () => noiseTexture('#645d51', '#817665')),
    normalMap: levelTexture(`${base}_normal.jpg`, () => noiseTexture('#8080ff', '#7f7fff')),
    normalScale: new THREE.Vector2(normalStrength, normalStrength),
    roughnessMap: levelTexture(`${base}_roughness.jpg`, () => noiseTexture('#dedede', '#c8c8c8')),
    roughness: 0.97,
    envBase: terrain === 'wall' ? 0.18 : 0.13,
  })
}

/** 洞穴装饰用的瓦片中心场快速插值。碰撞仍走精确零等值面；云雨/贴花无需为每个视觉采样重复 14 次求根。 */
function sampleCaveVisualField(m: GameMap, field: Float32Array | undefined, x: number, y: number, fallback: () => number): number {
  if (!field || field.length < m.w * m.h) return fallback()
  const gx = Math.max(0, Math.min(m.w - 1, x - 0.5)), gy = Math.max(0, Math.min(m.h - 1, y - 0.5))
  const x0 = Math.floor(gx), y0 = Math.floor(gy), x1 = Math.min(m.w - 1, x0 + 1), y1 = Math.min(m.h - 1, y0 + 1)
  const fx = gx - x0, fy = gy - y0
  const a = field[y0 * m.w + x0], b = field[y0 * m.w + x1], c = field[y1 * m.w + x0], d = field[y1 * m.w + x1]
  return (a + (b - a) * fx) * (1 - fy) + (c + (d - c) * fx) * fy
}
const visualCaveFloor = (m: GameMap, x: number, y: number) => sampleCaveVisualField(m, m.terrain, x, y, () => floorHeight(m, x, y, 0))
const visualCaveRoof = (m: GameMap, x: number, y: number) => sampleCaveVisualField(m, m.caveCeil, x, y, () => caveCeilingAt(m, x, y))

let handSpikePlainMat: THREE.MeshLambertMaterial | THREE.MeshStandardMaterial | null = null
let handSpikeMossMat: THREE.MeshLambertMaterial | THREE.MeshStandardMaterial | null = null
function handSpikeMaterial(moss: boolean): THREE.MeshLambertMaterial | THREE.MeshStandardMaterial {
  if (moss && handSpikeMossMat) return handSpikeMossMat
  if (!moss && handSpikePlainMat) return handSpikePlainMat
  const mat = caveRockMaterial('handyland', 0.86) as THREE.MeshLambertMaterial | THREE.MeshStandardMaterial
  if (moss) {
    mat.emissive.set('#9f1518'); mat.emissiveIntensity = 0.52
    mat.emissiveMap = mat.map
    handSpikeMossMat = mat
  } else handSpikePlainMat = mat
  return mat
}

const handSpikeGeometries: Array<THREE.BufferGeometry | undefined> = []
/** 五种石臂手势只构造一次共享几何；统一转成非索引几何后再合并，避免 Box 与 Dodecahedron 索引格式不同导致 merge 返回 null。 */
function handSpikeGeometry(pose0: number): THREE.BufferGeometry {
  const pose = Math.max(0, Math.min(4, pose0 | 0))
  const cached = handSpikeGeometries[pose]
  if (cached) return cached
  const part = (w: number, h: number, d: number, x: number, y: number, z: number) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d, 1, Math.max(1, Math.round(h * 3)), 1))
    mesh.position.set(x, y, z)
    return mesh
  }
  const hand = new THREE.Group()
  hand.add(part(0.18, 0.72, 0.18, 0, 0.34, 0), part(0.32, 0.35, 0.15, 0, 0.81, 0))
  for (let f = 0; f < 4; f++) {
    const fx = -0.105 + f * 0.07
    const l1 = f === 1 || f === 2 ? 0.19 : 0.15
    const finger = new THREE.Group(); finger.position.set(fx, 0.95, 0.006)
    const pointing = pose === 4 && f === 1
    const curl = pointing ? 0.05 : pose === 0 ? 0.08 : pose === 1 ? 0.5 : pose === 2 ? 0.22 : pose === 3 ? 1.0 : 0.82
    finger.rotation.z = pose === 2 ? (f - 1.5) * 0.2 : pose === 1 ? (f - 1.5) * 0.08 : 0
    finger.add(part(0.055, l1, 0.062, 0, l1 / 2, 0))
    const tip = new THREE.Group(); tip.position.y = l1; tip.rotation.x = -curl
    tip.rotation.z = pose === 3 ? (f - 1.5) * 0.07 : 0
    tip.add(part(0.048, l1 * 0.82, 0.056, 0, l1 * 0.41, 0.012))
    finger.add(tip); hand.add(finger)
  }
  const thumb = new THREE.Group(); thumb.position.set(0.17, 0.82, 0.02)
  thumb.rotation.z = pose === 3 ? -0.48 : -0.95
  thumb.rotation.x = pose === 1 || pose === 3 ? -0.62 : -0.12
  thumb.add(part(0.058, 0.16, 0.062, 0, 0.08, 0), part(0.05, 0.13, 0.056, 0, 0.22, 0.01))
  hand.add(thumb)
  const root = new THREE.Mesh(new THREE.DodecahedronGeometry(0.27, 1))
  root.scale.set(1.15, 0.42, 1); root.position.y = 0.07
  const assembly = new THREE.Group(); assembly.add(hand, root); assembly.updateMatrixWorld(true)
  const parts: THREE.BufferGeometry[] = []
  assembly.traverse((ch) => {
    if (!(ch instanceof THREE.Mesh)) return
    const geo = ch.geometry.index ? ch.geometry.toNonIndexed() : ch.geometry.clone()
    parts.push(geo.applyMatrix4(ch.matrixWorld))
  })
  const merged = mergeGeometries(parts, false) ?? new THREE.BoxGeometry(0.32, 1.1, 0.18).toNonIndexed()
  merged.computeVertexNormals(); merged.computeBoundingBox(); merged.computeBoundingSphere()
  handSpikeGeometries[pose] = merged
  return merged
}

let bloodMossTex: THREE.CanvasTexture | null = null
/** 巨臂林地血红苔藓：透明底上的团簇、细枝与孢子点，可同时用于颜色/发光/凹凸。 */
function bloodMossTexture(): THREE.CanvasTexture {
  if (bloodMossTex) return bloodMossTex
  const [cv, g] = makeCanvasCtx(256, 256)
  const rr = mulberry(0xb100d055)
  g.clearRect(0, 0, 256, 256)
  for (let c = 0; c < 34; c++) {
    const x = rr() * 256, y = rr() * 256, r = 5 + rr() * 18
    const grad = g.createRadialGradient(x, y, 0, x, y, r)
    grad.addColorStop(0, `rgba(${150 + Math.floor(rr() * 70)},18,22,.92)`)
    grad.addColorStop(0.55, 'rgba(116,8,18,.72)')
    grad.addColorStop(1, 'rgba(72,2,12,0)')
    g.fillStyle = grad; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill()
    g.strokeStyle = `rgba(225,38,35,${(0.3 + rr() * 0.42).toFixed(2)})`
    g.lineWidth = 0.6 + rr() * 1.5
    for (let b = 0; b < 3; b++) {
      g.beginPath(); g.moveTo(x, y)
      let px = x, py = y
      for (let k = 0; k < 5; k++) {
        px += (rr() - 0.5) * r * 0.7; py += (rr() - 0.5) * r * 0.7
        g.lineTo(px, py)
      }
      g.stroke()
    }
  }
  bloodMossTex = toTex(cv)
  bloodMossTex.colorSpace = THREE.SRGBColorSpace
  bloodMossTex.wrapS = bloodMossTex.wrapT = THREE.RepeatWrapping
  return bloodMossTex
}

let caveCloudTex: THREE.CanvasTexture | null = null
function caveCloudTexture(): THREE.CanvasTexture {
  if (caveCloudTex) return caveCloudTex
  const [cv, g] = makeCanvasCtx(128, 128)
  const grad = g.createRadialGradient(64, 64, 4, 64, 64, 62)
  grad.addColorStop(0, 'rgba(190,198,205,.58)')
  grad.addColorStop(0.35, 'rgba(142,151,163,.34)')
  grad.addColorStop(1, 'rgba(74,81,94,0)')
  g.fillStyle = grad; g.fillRect(0, 0, 128, 128)
  caveCloudTex = toTex(cv)
  return caveCloudTex
}

interface BioGlowPoint {
  x: number; y: number; z: number
  color: THREE.Color
  size: number
  phase: number
  speed: number
  drift: number
}

/** 单次 draw call 的柔光生物粒子；位移与脉冲在 GPU 完成，数百点不会逐个创建灯光/网格。 */
function bioGlowField(src: BioGlowPoint[], verticalDrift = 0.12): THREE.Points {
  const geo = new THREE.BufferGeometry()
  const pos = new Float32Array(src.length * 3), color = new Float32Array(src.length * 3)
  const motion = new Float32Array(src.length * 4), size = new Float32Array(src.length)
  src.forEach((p, i) => {
    pos.set([p.x, p.y, p.z], i * 3)
    color.set([p.color.r, p.color.g, p.color.b], i * 3)
    motion.set([p.phase, p.speed, p.drift, verticalDrift], i * 4)
    size[i] = p.size
  })
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  geo.setAttribute('aGlowColor', new THREE.BufferAttribute(color, 3))
  geo.setAttribute('aMotion', new THREE.BufferAttribute(motion, 4))
  geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1))
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 } },
    vertexShader: `
      attribute vec3 aGlowColor;
      attribute vec4 aMotion;
      attribute float aSize;
      varying vec3 vGlowColor;
      varying float vPulse;
      uniform float uTime;
      void main() {
        float t = uTime * aMotion.y + aMotion.x;
        vec3 p = position;
        p.x += sin(t * 1.17) * aMotion.z;
        p.z += cos(t * 0.83 + aMotion.x * 1.71) * aMotion.z;
        p.y += sin(t * 1.43 + aMotion.x) * aMotion.w;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        // 严格按透视距离缩小：旧系数 190 令 40–60m 外仍有十余像素光斑，像贴在镜头上。
        gl_PointSize = clamp(aSize * (42.0 / max(1.0, -mv.z)), 0.65, 7.5);
        vGlowColor = aGlowColor;
        vPulse = 0.72 + 0.28 * sin(t * 2.1);
      }
    `,
    fragmentShader: `
      varying vec3 vGlowColor;
      varying float vPulse;
      void main() {
        float d = length(gl_PointCoord - vec2(0.5)) * 2.0;
        if (d > 1.0) discard;
        float core = 1.0 - smoothstep(0.0, 0.24, d);
        float halo = pow(max(0.0, 1.0 - d), 2.8);
        gl_FragColor = vec4(vGlowColor * (1.05 + core * 0.95), (core * 0.82 + halo * 0.24) * vPulse);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  })
  const points = new THREE.Points(geo, mat)
  points.frustumCulled = false
  points.userData.noCastShadow = 1
  points.onBeforeRender = () => { mat.uniforms.uTime.value = Date.now() * 0.001 }
  return points
}

let l9CavePreview: THREE.CanvasTexture | null = null
/** 第九大道洞口内的 Level 9 午夜郊区预览；使用自发光画布，L8 黑暗中仍能辨认湿路、住宅与路灯。 */
function l9CavePreviewTexture(): THREE.CanvasTexture {
  if (l9CavePreview) return l9CavePreview
  const [cv, g] = makeCanvasCtx(768, 448)
  const sky = g.createLinearGradient(0, 0, 0, 320)
  sky.addColorStop(0, '#030812'); sky.addColorStop(0.55, '#0a1320'); sky.addColorStop(1, '#18202a')
  g.fillStyle = sky; g.fillRect(0, 0, cv.width, cv.height)
  const rr = mulberry(909009)
  for (let i = 0; i < 70; i++) {
    const a = 0.12 + rr() * 0.45
    g.fillStyle = `rgba(190,210,220,${a.toFixed(2)})`
    g.fillRect(rr() * cv.width, rr() * 205, rr() < 0.88 ? 1 : 2, 1)
  }
  // 远处屋脊与两侧住宅，中央留出湿沥青道路。
  const house = (x: number, y: number, w: number, h: number, flip: boolean) => {
    g.fillStyle = flip ? '#111821' : '#151b22'; g.fillRect(x, y, w, h)
    g.beginPath(); g.moveTo(x - 8, y); g.lineTo(x + w * 0.5, y - h * 0.42); g.lineTo(x + w + 8, y); g.closePath(); g.fill()
    g.fillStyle = '#8e7740'
    for (let wx = x + 15; wx < x + w - 8; wx += 34) if (rr() > 0.48) g.fillRect(wx, y + 18, 11, 15)
  }
  house(20, 234, 152, 92, false); house(596, 230, 150, 96, true)
  house(174, 259, 94, 59, true); house(500, 257, 96, 61, false)
  g.fillStyle = '#1f252b'; g.fillRect(0, 316, cv.width, 132)
  // 道路透视、潮湿反光和中央消失点。
  g.fillStyle = '#0b0e13'; g.beginPath(); g.moveTo(300, 304); g.lineTo(468, 304); g.lineTo(650, 448); g.lineTo(118, 448); g.closePath(); g.fill()
  const roadGlow = g.createLinearGradient(0, 304, 0, 448)
  roadGlow.addColorStop(0, 'rgba(96,112,122,.10)'); roadGlow.addColorStop(1, 'rgba(113,137,151,.28)')
  g.fillStyle = roadGlow; g.beginPath(); g.moveTo(345, 304); g.lineTo(420, 304); g.lineTo(520, 448); g.lineTo(244, 448); g.closePath(); g.fill()
  g.strokeStyle = 'rgba(160,174,180,.2)'; g.lineWidth = 2
  for (let i = 0; i < 9; i++) {
    const y = 325 + i * 15, half = 24 + i * 12
    g.beginPath(); g.moveTo(384 - half, y); g.lineTo(384 + half, y + 2); g.stroke()
  }
  // 熄灭为主、仅两盏残亮的郊区路灯。
  for (const [x, y, lit] of [[280, 268, 1], [488, 256, 0], [214, 282, 0], [548, 274, 1]] as const) {
    g.strokeStyle = '#252b30'; g.lineWidth = 5; g.beginPath(); g.moveTo(x, 326); g.lineTo(x, y); g.lineTo(x + (x < 384 ? 16 : -16), y); g.stroke()
    if (lit) {
      const glow = g.createRadialGradient(x + (x < 384 ? 16 : -16), y, 1, x + (x < 384 ? 16 : -16), y, 35)
      glow.addColorStop(0, 'rgba(255,233,163,.88)'); glow.addColorStop(1, 'rgba(255,222,142,0)')
      g.fillStyle = glow; g.fillRect(x - 25, y - 35, 75, 75)
    }
  }
  // 洞内向外看时的冷雾层，保留 Level 9“刚下过雨”的朦胧感。
  const fog = g.createLinearGradient(0, 205, 0, 365)
  fog.addColorStop(0, 'rgba(72,85,96,0)'); fog.addColorStop(1, 'rgba(74,86,94,.14)')
  g.fillStyle = fog; g.fillRect(0, 190, cv.width, 190)
  l9CavePreview = toTex(cv)
  l9CavePreview.colorSpace = THREE.SRGBColorSpace
  return l9CavePreview
}

// v53：带贴图的盒体（房顶檐口/屋顶板用）——UV 按各面世界尺寸放大避免拉伸（同 wallpaperBox 思路），
// per 为多少米一个贴图重复；离线回退 fbBase/fbAlt 程序噪点
function texBox(w: number, h: number, d: number, name: string, fbBase: string, fbAlt: string, tint: string, per = 2.5, x = 0, y = 0, z = 0): THREE.Mesh {
  const geo = new THREE.BoxGeometry(w, h, d)
  const uv = geo.attributes.uv as THREE.BufferAttribute
  const nor = geo.attributes.normal
  for (let i = 0; i < uv.count; i++) {
    const nx = Math.abs(nor.getX(i)), ny = Math.abs(nor.getY(i))
    if (ny > 0.5) uv.setXY(i, uv.getX(i) * w / per, uv.getY(i) * d / per)
    else if (nx > 0.5) uv.setXY(i, uv.getX(i) * d / per, uv.getY(i) * h / per)
    else uv.setXY(i, uv.getX(i) * w / per, uv.getY(i) * h / per)
  }
  const m = new THREE.Mesh(geo, texLambert(name, fbBase, fbAlt, tint))
  m.position.set(x, y, z)
  return m
}

let l9CleanTileTex: THREE.CanvasTexture | null = null
function cleanModernTileTexture(): THREE.CanvasTexture {
  if (l9CleanTileTex) return l9CleanTileTex
  const [cv, g] = makeCanvasCtx(256, 256)
  g.fillStyle = '#ecefed'; g.fillRect(0, 0, 256, 256)
  const rr = mulberry(0x1909c1ad)
  for (let y = 0; y < 256; y += 64) for (let x = 0; x < 256; x += 64) {
    const k = Math.floor(rr() * 8)
    g.fillStyle = `rgb(${232 + k},${234 + k},${232 + k})`
    g.fillRect(x + 2, y + 2, 60, 60)
  }
  g.strokeStyle = '#c8cdca'; g.lineWidth = 3
  for (let i = 0; i <= 256; i += 64) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 256); g.stroke(); g.beginPath(); g.moveTo(0, i); g.lineTo(256, i); g.stroke() }
  l9CleanTileTex = toTex(cv); l9CleanTileTex.wrapS = l9CleanTileTex.wrapT = THREE.RepeatWrapping
  return l9CleanTileTex
}

// L9 专用 PBR 盒体：颜色/法线/粗糙度三图成套加载，且按世界尺寸平铺。
// 材质缓存避免一条街数十栋住宅为同一组贴图反复创建 material。
const l9PbrMaterialCache = new Map<string, THREE.Material>()
function l9PbrMaterial(prefix: string, tint: string, fbBase: string, fbAlt: string, roughness: number, envBase: number, normalStrength = .65): THREE.Material {
  const key = `${getMaterialMode()}|${prefix}|${tint}|${roughness}|${envBase}|${normalStrength}`
  const cached = l9PbrMaterialCache.get(key)
  if (cached) return cached
  const cleanTile = prefix === 'l9_clean_tile'
  // 浅色灰泥也使用真实的 CC0 PBR 三图；仅现代瓷砖保留程序生成回退。
  const map = cleanTile ? cleanModernTileTexture()
    : levelTexture(`${prefix}_diff.jpg`, () => noiseTexture(fbBase, fbAlt))
  const normal = cleanTile ? noiseTexture('#8080ff', '#8080ff')
    : levelTexture(`${prefix}_normal.jpg`, () => noiseTexture('#8080ff', '#7f7fff'))
  const rough = cleanTile ? noiseTexture('#b0b0b0', '#989898')
    : levelTexture(`${prefix}_rough.jpg`, () => noiseTexture('#d8d8d8', '#adadad'))
  configureSurfaceTexture(map, THREE.SRGBColorSpace)
  configureSurfaceTexture(normal, THREE.NoColorSpace)
  configureSurfaceTexture(rough, THREE.NoColorSpace)
  const mat = litMaterial({
    color: tint, map, normalMap: normal, normalScale: new THREE.Vector2(normalStrength, normalStrength),
    roughnessMap: rough, roughness, envBase,
  })
  l9PbrMaterialCache.set(key, mat)
  return mat
}
function l9PbrBox(w: number, h: number, d: number, prefix: string, tint: string, fbBase: string, fbAlt: string,
  per = 2.2, roughness = .82, envBase = .12, normalStrength = .65, x = 0, y = 0, z = 0): THREE.Mesh {
  const geo = new THREE.BoxGeometry(w, h, d)
  const uv = geo.attributes.uv as THREE.BufferAttribute
  const nor = geo.attributes.normal
  for (let i = 0; i < uv.count; i++) {
    const nx = Math.abs(nor.getX(i)), ny = Math.abs(nor.getY(i))
    if (ny > .5) uv.setXY(i, uv.getX(i) * w / per, uv.getY(i) * d / per)
    else if (nx > .5) uv.setXY(i, uv.getX(i) * d / per, uv.getY(i) * h / per)
    else uv.setXY(i, uv.getX(i) * w / per, uv.getY(i) * h / per)
  }
  const mesh = new THREE.Mesh(geo, l9PbrMaterial(prefix, tint, fbBase, fbAlt, roughness, envBase, normalStrength))
  mesh.position.set(x, y, z)
  return mesh
}

function l9GableRoof(w: number, d: number, rise: number, prefix: string, tint: string,
  ridgeAlong: 'auto' | 'x' | 'z' = 'auto', gableTint = '#d5c9b6'): THREE.Group {
  const g = new THREE.Group()
  const alongX = ridgeAlong === 'x' || (ridgeAlong === 'auto' && w >= d)
  const ridge = alongX ? w : d, span = alongX ? d : w
  const slope = Math.hypot(span / 2, rise), angle = Math.atan2(rise, span / 2)
  for (const sign of [-1, 1]) {
    const panel = l9PbrBox(ridge + .65, .14, slope + .18, prefix, tint, '#45464a', '#27292d', 1.45, .78, .18, .7, 0, rise / 2, sign * span / 4)
    panel.rotation.x = sign * angle
    g.add(panel)
  }
  for (const sign of [-1, 1]) {
    const tri = new THREE.Mesh(triGeo(span, rise), l9PbrMaterial('l9_siding', gableTint, '#b5aa96', '#786f62', .86, .08, .45))
    tri.position.set(sign * ridge / 2, 0, 0)
    // 两端山墙必须分别朝向各自外侧。旧逻辑两块都朝 +X，强制旋转为正面山墙后，
    // 临街一面正好被背面剔除，只剩黑色屋顶内侧。
    tri.rotation.y = sign > 0 ? Math.PI / 2 : -Math.PI / 2
    g.add(tri)
  }
  if (!alongX) g.rotation.y = Math.PI / 2
  return g
}

// v54：容器可动件登记——part 供 updateStructs 按 kind 分支逐件插值（lid 标记保留兼容门扇白名单）；
// bx/by/bz/brx/bry/brz 记录构建基准位姿，动画逐帧「基准 + f(open)」绝对赋值：确定性、同结构重开同动画、无累积漂移
function movable<T extends THREE.Object3D>(o: T, part: string, idx = 0): T {
  o.userData.part = part
  o.userData.lid = 1
  o.userData.idx = idx
  o.userData.bx = o.position.x; o.userData.by = o.position.y; o.userData.bz = o.position.z
  o.userData.brx = o.rotation.x; o.userData.bry = o.rotation.y; o.userData.brz = o.rotation.z
  return o
}

// v54：photo 变种贴图池（scripts/gen-photos.py 生成，public/textures/ 下；无 data.tex 时按瓦片哈希选取）
const PHOTO_POOL = ['photo_mountain.png', 'photo_lake.png', 'photo_forest.png',
  'photo_house.png', 'photo_street.png', 'photo_still.png']

// 贴墙方向：返回随机一个相邻非地板方向（0北 1东 2南 3西），无墙返回 null
export function wallDir(s: Structure, m: GameMap): number | null {
  if(typeof s.data?.l2WallDir==='number')return Number(s.data.l2WallDir)
  const opts: number[] = []
  const nb: [number, number, number][] = [[0, -1, 0], [1, 0, 1], [0, 1, 2], [-1, 0, 3]]
  for (const [dx, dy, d] of nb) {
    const nx = s.x + dx, ny = s.y + dy
    if (nx < 0 || ny < 0 || nx >= m.w || ny >= m.h) continue
    const floor = (s.floor ?? 0) === -1
      ? (m.dn[ny * m.w + nx] === 1 && m.dnWall[ny * m.w + nx] !== 1)
      : (s.floor ?? 0) === 1
        ? (m.up?.[ny * m.w + nx] === 1 && m.upWall?.[ny * m.w + nx] !== 1)
        : m.tiles[ny * m.w + nx] === 1
    if (!floor) opts.push(d)
  }
  return opts.length ? opts[Math.floor(Math.random() * opts.length)] : null
}

// ---------- v23 新结构公共构件 ----------

const NB4: readonly [number, number, number][] = [[0, -1, 0], [1, 0, 1], [0, 1, 2], [-1, 0, 3]]

// 结构中心瓦片的四邻方向筛选（floor=true 取地板侧，false 取墙/虚空侧）；0北 1东 2南 3西
function neighborDirs(s: Structure, m: GameMap, floor: boolean): number[] {
  const tx = Math.floor(s.x + s.w / 2), ty = Math.floor(s.y + s.h / 2)
  const out: number[] = []
  for (const [dx, dy, d] of NB4) {
    const nx = tx + dx, ny = ty + dy
    if (nx < 0 || ny < 0 || nx >= m.w || ny >= m.h) { if (!floor) out.push(d); continue }
    if ((m.tiles[ny * m.w + nx] === 1) === floor) out.push(d)
  }
  return out
}

// 建筑所在方向：四邻 3 格宽条带里墙瓦片最多的方向。店招落在街面、正下方恰好是门洞时，
// 单格取样会判成「四周都是地板」，取条带众数才能稳定朝向建筑立面。
function buildingDir(s: Structure, m: GameMap): number {
  const tx = Math.floor(s.x + s.w / 2), ty = Math.floor(s.y + s.h / 2)
  let bestD = 0, bestN = -1
  for (const [dx, dy, d] of NB4) {
    let n = 0
    for (let step = 1; step <= 2; step++)
      for (let t = -1; t <= 1; t++) {
        const nx = tx + dx * step + (dy ? t : 0), ny = ty + dy * step + (dx ? t : 0)
        if (nx < 0 || ny < 0 || nx >= m.w || ny >= m.h) continue
        if (m.tiles[ny * m.w + nx] !== 1) n++
      }
    if (n > bestN) { bestN = n; bestD = d }
  }
  return bestD
}

// 贴面摆放：把子件推到瓦片某一侧（0北 1东 2南 3西）。
// outward=false 贴在瓦片内缘、正面朝瓦片中心（贴墙装饰）；true 贴在瓦片外缘、正面朝外
// （结构本身落在墙瓦片上时用，例如沿街立面的黑窗）。
function faceMount(o: THREE.Object3D, d: number, off: number, y: number, lat = 0, outward = false) {
  const e = outward ? 0.5 + off : 0.5 - off
  const turn = outward ? Math.PI : 0
  if (d === 0) { o.position.set(lat, y, -e); o.rotation.y = turn }
  else if (d === 2) { o.position.set(lat, y, e); o.rotation.y = Math.PI + turn }
  else if (d === 3) { o.position.set(-e, y, lat); o.rotation.y = Math.PI / 2 + turn }
  else { o.position.set(e, y, lat); o.rotation.y = -Math.PI / 2 + turn }
}

// v54：楼层带墙体判定（f = s.floor ?? 0）——floor 0 看主层瓦片（≠1 即墙：砌墙或虚空，虚空渲染层同样立墙盒）；
// floor 1 看 m.upWall、floor 2 看 m.upWall2（多层内部墙）。越界由调用方 continue/break（与旧 floor0 行为一致）。
function bandWall(m: GameMap, x: number, y: number, f: number): boolean {
  const i = y * m.w + x
  if (f === 1) return m.upWall?.[i] === 1
  if (f >= 2) return m.upWall2?.[i] === 1
  return m.tiles[i] !== 1
}

// 让家具正面（局部 +Z）背对最近的墙
// 实心面即墙（tile!==1：砌墙或虚空——虚空在渲染层同样立起墙盒，装饰贴上不算浮空）
// v54：按结构楼层带判定（floor≥1 认对应层 upWall/upWall2，多层内部墙不再漏判）
function wallDirs(s: Structure, m: GameMap): number[] {
  if(typeof s.data?.l2WallDir==='number')return [Number(s.data.l2WallDir)]
  const tx = Math.floor(s.x + s.w / 2), ty = Math.floor(s.y + s.h / 2)
  const f = s.floor ?? 0
  const out: number[] = []
  for (const [dx, dy, d] of NB4) {
    const nx = tx + dx, ny = ty + dy
    if (nx < 0 || ny < 0 || nx >= m.w || ny >= m.h) continue
    if (bandWall(m, nx, ny, f)) out.push(d)
  }
  return out
}

function faceOutward(o: THREE.Object3D, s: Structure, m: GameMap) {
  const wd = wallDirs(s, m)
  if (!wd.length) return
  const f = (wd[0] + 2) % 4
  o.rotation.y = f === 0 ? Math.PI : f === 1 ? Math.PI / 2 : f === 2 ? 0 : -Math.PI / 2
}

// v51：柜类贴墙——faceOutward 只旋转不位移，柜子停在瓦片中央离墙一截；
// flushToWall 在旋正后把已建内容整体移向墙面（背面贴墙、正面朝室内，附近无墙则不动）
function flushToWall(grp: THREE.Group, s: Structure, m: GameMap, depth: number, clearance = 0.02) {
  if (!wallDirs(s, m).length) return
  faceOutward(grp, s, m)
  const inner = new THREE.Group()
  inner.position.z = -(0.5 - depth / 2 - clearance)
  for (const k of [...grp.children]) inner.add(k) // 快照遍历再转移（真实 three 的 add 自动脱离旧父级）
  grp.add(inner)
}

// 强制贴墙（墙面装饰）：朝向并贴上最近的实心瓦片（砌墙或虚空皆可——渲染层虚空同样立墙盒）。
// 四邻优先；四邻全空则沿四方向各搜至 3 格取最近墙面，把装饰整体平移过去——彻底消除「浮空」。
// （取代旧 faceOutward+hugWall 组合：旧实现只认砌墙 tile===2，虚空旁装饰停留在瓦片中心悬浮）
// v54：按结构楼层带判定（bandWall）——floor 1/2 认 upWall/upWall2，2F/3F 贴墙装饰不再浮空/错贴主层
function mountOnWall(o: THREE.Object3D, parent: THREE.Object3D, s: Structure, m: GameMap, dist = 0.42) {
  const tx = Math.floor(s.x + s.w / 2), ty = Math.floor(s.y + s.h / 2)
  const bf = s.floor ?? 0
  let dir = -1, r = 1
  for (const [dx, dy, d] of NB4) {
    const nx = tx + dx, ny = ty + dy
    if (nx < 0 || ny < 0 || nx >= m.w || ny >= m.h) continue
    if (bandWall(m, nx, ny, bf)) { dir = d; break }
  }
  if (dir < 0) {
    let best = Infinity
    for (const [dx, dy, d] of NB4) {
      for (let rr = 2; rr <= 3; rr++) {
        const nx = tx + dx * rr, ny = ty + dy * rr
        if (nx < 0 || ny < 0 || nx >= m.w || ny >= m.h) break
        if (bandWall(m, nx, ny, bf)) {
          if (rr < best) { best = rr; dir = d; r = rr }
          break
        }
      }
    }
  }
  if (dir < 0) return
  const f = (dir + 2) % 4
  parent.rotation.y = f === 0 ? Math.PI : f === 1 ? Math.PI / 2 : f === 2 ? 0 : -Math.PI / 2
  const [wx, wz] = dir === 0 ? [0, -1] : dir === 1 ? [1, 0] : dir === 2 ? [0, 1] : [-1, 0]
  const th = parent.rotation.y
  const dd = dist + r - 1
  o.position.x += (wx * Math.cos(th) - wz * Math.sin(th)) * dd
  o.position.z += (wx * Math.sin(th) + wz * Math.cos(th)) * dd
}

// 顶点色共享材质：合并网格用（麦丛/树篱/书架等高频结构统一走这两个材质，避免上千份材质）
let vcLambertMat: THREE.MeshLambertMaterial | null = null
let vcBasicMat: THREE.MeshBasicMaterial | null = null
const l10WindUniform = { value: 0 }
let l10CropMat: THREE.MeshLambertMaterial | THREE.MeshStandardMaterial | null = null
const l10CropCardMat = new Map<'wheat' | 'barley', THREE.MeshLambertMaterial | THREE.MeshStandardMaterial>()
let l10CropCardGeo: THREE.BufferGeometry | null = null
let l10CropCanopyMat: THREE.MeshLambertMaterial | THREE.MeshStandardMaterial | null = null
let l10LeafMat: THREE.MeshLambertMaterial | THREE.MeshStandardMaterial | null = null
let l10MetalMat: THREE.MeshLambertMaterial | THREE.MeshStandardMaterial | null = null
let l10HayMat: THREE.MeshLambertMaterial | THREE.MeshStandardMaterial | null = null

function l10Wettable<T extends THREE.Material>(mat: T, roughness: number, envBase: number): T {
  mat.userData.l10Wettable = 1
  mat.userData.l10BaseRoughness = roughness
  mat.userData.l10BaseEnv = envBase
  return mat
}

export function updateL10Wind(time: number) { l10WindUniform.value = time }

function withL10Wind<T extends THREE.Material>(mat: T, strength: number): T {
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uL10WindTime = l10WindUniform
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uL10WindTime;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vec4 l10WindPos = vec4(position, 1.0);
        #ifdef USE_INSTANCING
          l10WindPos = instanceMatrix * l10WindPos;
        #endif
        vec3 l10World = (modelMatrix * l10WindPos).xyz;
        float l10Tip = smoothstep(0.12, 1.3, position.y);
        float l10Gust = 0.62 + 0.38 * sin(l10World.x * 0.021 + l10World.z * 0.017 + uL10WindTime * 0.43);
        float l10Wave = sin(l10World.x * 0.31 + l10World.z * 0.19 + uL10WindTime * 1.8)
          + sin(l10World.z * 0.47 - uL10WindTime * 1.13) * 0.45;
        transformed.x += l10Wave * l10Gust * ${strength.toFixed(3)} * l10Tip;
        transformed.z += sin(l10World.x * 0.23 - l10World.z * 0.29 + uL10WindTime * 1.37)
          * l10Gust * ${(.58 * strength).toFixed(3)} * l10Tip;
      `)
  }
  mat.customProgramCacheKey = () => `l10-wind-${strength}`
  return mat
}

function l10CropMaterial() {
  if (l10CropMat) return l10CropMat
  l10CropMat = withL10Wind(litMaterial({
    color: '#ffffff', vertexColors: true,
    map: levelTexture('l10_wheat_diff.jpg', () => noiseTexture('#c5aa50', '#e1ce79')),
    normalMap: levelTexture('l10_wheat_normal.jpg', () => noiseTexture('#8080ff', '#7f7fff')),
    normalScale: new THREE.Vector2(.36, .36),
    roughnessMap: levelTexture('l10_wheat_rough.jpg', () => noiseTexture('#eeeeee', '#d8d8d8')),
    roughness: .94, envBase: .025,
  }), .075)
  return l10CropMat
}

/**
 * 麦簇 PNG 无法加载时的透明程序化兜底。正式运行走生成的透明植物图集；兜底仍保持
 * Alpha 镂空，避免网络/缓存异常时整片农田退化成不透明矩形。
 */
function l10CropSpriteFallback(barley: boolean): THREE.CanvasTexture {
  const [canvas, g] = makeCanvasCtx(256, 384)
  g.clearRect(0, 0, canvas.width, canvas.height)
  const rng = mulberry(barley ? 0x10ba71 : 0x10a117)
  g.lineCap = 'round'
  for (let i = 0; i < 9; i++) {
    const x0 = 98 + i * 7 + (rng() - .5) * 8
    const lean = (rng() - .5) * 34
    const top = 54 + rng() * 54
    const grad = g.createLinearGradient(x0, 354, x0 + lean, top)
    grad.addColorStop(0, '#806a31'); grad.addColorStop(.55, '#bda654'); grad.addColorStop(1, '#dec878')
    g.strokeStyle = grad; g.lineWidth = 2.4 + rng() * 1.1
    g.beginPath(); g.moveTo(x0, 360); g.quadraticCurveTo(x0 + lean * .35, 225, x0 + lean, top + 38); g.stroke()
    const hx = x0 + lean, hy = top + 26
    g.strokeStyle = barley ? '#decf8e' : '#d7bd63'; g.lineWidth = barley ? 4.2 : 5.8
    g.beginPath(); g.moveTo(hx, hy + 33); g.quadraticCurveTo(hx + lean * .08, hy + 12, hx, hy - 17); g.stroke()
    g.lineWidth = .75; g.strokeStyle = '#e9d89c'
    for (let k = -3; k <= 3; k++) {
      const yy = hy + k * 6
      const awn = barley ? 26 : 14
      g.beginPath(); g.moveTo(hx, yy); g.lineTo(hx - awn - rng() * 6, yy - 15); g.stroke()
      g.beginPath(); g.moveTo(hx, yy); g.lineTo(hx + awn + rng() * 6, yy - 15); g.stroke()
    }
  }
  return toTex(canvas)
}

function l10CropCardGeometry(): THREE.BufferGeometry {
  if (l10CropCardGeo) return l10CropCardGeo
  const h = 1.18, w = .72
  const a = new THREE.PlaneGeometry(w, h, 1, 3).translate(0, h / 2, 0)
  const b = a.clone().rotateY(Math.PI / 2)
  // 两张交叉卡片共享一个小几何；单簇只有 16 个三角形，密度提升不会造成 CPU Mesh 爆炸。
  l10CropCardGeo = mergeGeometries([a, b])!
  a.dispose(); b.dispose()
  l10CropCardGeo.computeBoundingSphere()
  return l10CropCardGeo
}

function l10CropCardMaterial(barley: boolean) {
  const key = barley ? 'barley' : 'wheat'
  const cached = l10CropCardMat.get(key)
  if (cached) return cached
  const map = levelTexture(barley ? 'l10_barley_clump.png' : 'l10_wheat_clump.png', () => l10CropSpriteFallback(barley))
  map.colorSpace = THREE.SRGBColorSpace
  map.wrapS = map.wrapT = THREE.ClampToEdgeWrapping
  map.magFilter = THREE.LinearFilter
  map.minFilter = THREE.LinearMipmapLinearFilter
  map.generateMipmaps = true
  map.anisotropy = Math.max(map.anisotropy, 4)
  map.premultiplyAlpha = false
  map.needsUpdate = true
  const made = withL10Wind(litMaterial({
    // 透明卡片不再叠乘 instanceColor。图集本身已有完整麦色；此前 albedo × 顶点色 ×
    // 垂直卡片的低角度受光在复古滤镜下会被压成纯黑，只留下 Alpha 轮廓。
    color: '#ffffff', map,
    side: THREE.DoubleSide, alphaTest: .18,
    // 模拟阴云天空对细叶片的透射/散射，仍保留所有真实直射光和手电光响应。
    // emissiveMap 必须使用同一张颜色图，暗部保底也不会退化成均匀色块。
    emissive: '#fff0c4', emissiveMap: map, emissiveIntensity: .28,
    roughness: .88, envBase: .06,
  }), barley ? .125 : .115)
  made.userData.sharedL10CropCard = 1
  l10CropCardMat.set(key, made)
  return made
}

function l10CropCanopyMaterial() {
  if (l10CropCanopyMat) return l10CropCanopyMat
  const map = levelTexture('l10_wheat_diff.jpg', () => noiseTexture('#b59645', '#dcc473'))
  const normal = levelTexture('l10_wheat_normal.jpg', () => noiseTexture('#8080ff', '#7f7fff'))
  const rough = levelTexture('l10_wheat_rough.jpg', () => noiseTexture('#eeeeee', '#d8d8d8'))
  configureSurfaceTexture(map, THREE.SRGBColorSpace)
  configureSurfaceTexture(normal, THREE.NoColorSpace)
  configureSurfaceTexture(rough, THREE.NoColorSpace)
  l10CropCanopyMat = withL10Wind(litMaterial({
    color: '#ffffff', map, normalMap: normal, roughnessMap: rough,
    emissive: '#f3d98d', emissiveMap: map, emissiveIntensity: .16,
    normalScale: new THREE.Vector2(.32, .32), roughness: .92, envBase: .045,
    side: THREE.DoubleSide,
  }), .085)
  return l10CropCanopyMat
}

function l10LeafMaterial() {
  if (l10LeafMat) return l10LeafMat
  const leafMap = levelTexture('l10_foliage_diff.jpg', () => noiseTexture('#34432c', '#687452'))
  const leafNormal = levelTexture('l10_foliage_normal.jpg', () => noiseTexture('#8080ff', '#7f7fff'))
  const leafRough = levelTexture('l10_foliage_rough.jpg', () => noiseTexture('#eeeeee', '#d4d4d4'))
  leafMap.colorSpace = THREE.SRGBColorSpace
  leafMap.anisotropy = Math.max(leafMap.anisotropy, 4)
  leafNormal.anisotropy = Math.max(leafNormal.anisotropy, 4)
  leafRough.anisotropy = Math.max(leafRough.anisotropy, 4)
  l10LeafMat = withL10Wind(litMaterial({
    // 外部叶片底色本身较暗；近白绿色只做色相统一，让 Hemisphere/Directional
    // 自然光仍有足够反照率可塑造叶簇，而不是靠 emissive 假亮。
    color: '#c4d0b7', map: leafMap,
    normalMap: leafNormal,
    roughnessMap: leafRough,
    normalScale: new THREE.Vector2(.78, .78), roughness: .86, envBase: .095,
  }), .045)
  return l10LeafMat
}
function l10MetalMaterial(): THREE.MeshLambertMaterial | THREE.MeshStandardMaterial {
  if (l10MetalMat) return l10MetalMat
  const made = l10Wettable(litMaterial({
    color: '#8f8a7c', map: levelTexture('l10_metal_diff.jpg', () => noiseTexture('#555550', '#8f897a')),
    normalMap: levelTexture('l10_metal_normal.jpg', () => noiseTexture('#8080ff', '#7f7fff')),
    roughnessMap: levelTexture('l10_metal_rough.jpg', () => noiseTexture('#d2d2d2', '#a8a8a8')),
    normalScale: new THREE.Vector2(.48, .48), roughness: .66, metalness: .38, envBase: .2,
  }), .66, .2)
  l10MetalMat = made
  return made
}
function l10HayMaterial(): THREE.MeshLambertMaterial | THREE.MeshStandardMaterial {
  if (l10HayMat) return l10HayMat
  const map = levelTexture('l10_hay_diff.jpg', () => noiseTexture('#9b762c', '#d8b95f'))
  const normal = levelTexture('l10_hay_normal.jpg', () => noiseTexture('#8080ff', '#7f7fff'))
  const rough = levelTexture('l10_hay_rough.jpg', () => noiseTexture('#f4f4f4', '#dddddd'))
  configureSurfaceTexture(map, THREE.SRGBColorSpace)
  configureSurfaceTexture(normal, THREE.NoColorSpace)
  configureSurfaceTexture(rough, THREE.NoColorSpace)
  l10HayMat = l10Wettable(litMaterial({
    color: '#fff4d0', map, normalMap: normal, roughnessMap: rough,
    normalScale: new THREE.Vector2(.82, .82), roughness: .96, envBase: .025,
  }), .96, .025)
  return l10HayMat
}
function vcMat(basic: boolean): THREE.MeshLambertMaterial | THREE.MeshBasicMaterial {
  if (basic) {
    if (!vcBasicMat) vcBasicMat = new THREE.MeshBasicMaterial({ vertexColors: true })
    return vcBasicMat
  }
  if (!vcLambertMat) vcLambertMat = new THREE.MeshLambertMaterial({ vertexColors: true })
  return vcLambertMat
}

// 把一簇小几何按顶点色合并成单个网格（1 drawcall）。麦丛/树篱/栅栏/书架成百上千地铺，
// 逐块 Mesh 会直接把 drawcall 打爆，这里统一合并。
function mergedMesh(parts: { g: THREE.BufferGeometry; c: string }[], basic = false): THREE.Mesh {
  for (const { g, c } of parts) {
    const cc = col(c)
    const n = g.attributes.position.count
    const arr = new Float32Array(n * 3)
    for (let i = 0; i < n; i++) { arr[i * 3] = cc.r; arr[i * 3 + 1] = cc.g; arr[i * 3 + 2] = cc.b }
    g.setAttribute('color', new THREE.BufferAttribute(arr, 3))
  }
  const geos = parts.map((p) => p.g)
  const merged = mergeGeometries(geos)!
  for (const g of geos) g.dispose()
  return new THREE.Mesh(merged, vcMat(basic))
}

// 等腰三角面（底边居中在原点、顶点在 +Y，法线朝 +Z）：人字屋顶山墙用
function triGeo(w: number, h: number): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-w / 2, 0, 0, w / 2, 0, 0, 0, h, 0]), 3))
  g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array([0, 0, 1, 0, 0.5, 1]), 2))
  g.computeVertexNormals()
  return g
}

// 双坡人字屋顶（house / barn 共用）：脊沿长边，两块斜板 + 两端山墙
// v53：tex 提供时坡面改贴图（texLambert，离线回退 tile 纯色噪点），UV 按坡面世界尺寸放大避免拉伸；
//      山墙三角仍用纯色（gable，已按贴图均值折算）
function gableRoof(w: number, d: number, rise: number, tile: string, gable: string,
  tex?: { name: string; tint: string }): THREE.Group {
  const g = new THREE.Group()
  const alongX = w >= d
  const ridge = alongX ? w : d      // 屋脊长度
  const span = alongX ? d : w       // 坡面跨度
  const slope = Math.hypot(span / 2, rise)
  const ang = Math.atan2(rise, span / 2)
  for (const sgn of [-1, 1]) {
    const pan = tex
      ? texBox(ridge + 0.5, 0.14, slope + 0.12, tex.name, tile, tile, tex.tint, 2.0, 0, rise / 2, sgn * span / 4)
      : box(ridge + 0.5, 0.14, slope + 0.12, tile, 0, rise / 2, sgn * span / 4)
    pan.rotation.x = sgn * ang
    g.add(pan)
  }
  for (const sgn of [-1, 1]) {
    const tri = new THREE.Mesh(triGeo(span, rise), new THREE.MeshLambertMaterial({ color: gable, side: THREE.DoubleSide }))
    tri.position.set(sgn * ridge / 2, 0, 0)
    tri.rotation.y = Math.PI / 2
    g.add(tri)
  }
  if (!alongX) g.rotation.y = Math.PI / 2
  return g
}

// M.E.G. 徽记：一个圆环 + 内部三角（贴在牌面 +Z 侧）
function megEmblem(r: number, ink: string): THREE.Group {
  const g = new THREE.Group()
  const mat = new THREE.MeshLambertMaterial({ color: ink, side: THREE.DoubleSide })
  const ring = new THREE.Mesh(new THREE.RingGeometry(r * 0.7, r, 16), mat)
  g.add(ring)
  const tri = new THREE.Mesh(new THREE.CircleGeometry(r * 0.58, 3), mat)
  tri.rotation.z = Math.PI / 2
  tri.position.z = 0.004
  g.add(tri)
  return g
}

// 楼体立面贴图（窗格凹槽）：所有 towerblock 共享一张，UV 按世界尺寸放大
let facadeTex: THREE.CanvasTexture | null = null
function towerFacade(): THREE.CanvasTexture {
  if (facadeTex) return facadeTex
  const [c, g] = makeCanvasCtx(32, 32)
  g.fillStyle = '#e6e8ec'; g.fillRect(0, 0, 32, 32)
  g.fillStyle = '#9aa0a6'; g.fillRect(0, 26, 32, 4)      // 楼板腰线
  g.fillStyle = '#5a626a'; g.fillRect(5, 6, 22, 16)      // 窗洞凹槽
  g.fillStyle = '#3a424a'; g.fillRect(7, 8, 18, 12)      // 玻璃
  g.fillStyle = '#8a9098'; g.fillRect(15, 8, 2, 12)      // 中挺
  const t = toTex(c)
  t.wrapS = THREE.RepeatWrapping
  t.wrapT = THREE.RepeatWrapping
  facadeTex = t
  return t
}

// 楼体大盒：UV 按各面的世界尺寸放大（一格窗 ≈ 3.2m），保证 1 个 mesh 就有规则窗格
// v53：texName 提供时立面改用下载贴图（levelTexture 缓存，离线回退 towerFacade 程序纹理）
function towerBox(w: number, h: number, d: number, color: string, texName?: string): THREE.Mesh {
  const geo = new THREE.BoxGeometry(w, h, d)
  const uv = geo.attributes.uv as THREE.BufferAttribute
  const nor = geo.attributes.normal
  const U = 3.2
  for (let i = 0; i < uv.count; i++) {
    const nx = Math.abs(nor.getX(i)), ny = Math.abs(nor.getY(i))
    if (ny > 0.5) uv.setXY(i, uv.getX(i) * w / U, uv.getY(i) * d / U)
    else if (nx > 0.5) uv.setXY(i, uv.getX(i) * d / U, uv.getY(i) * h / U)
    else uv.setXY(i, uv.getX(i) * w / U, uv.getY(i) * h / U)
  }
  return new THREE.Mesh(geo, new THREE.MeshLambertMaterial({
    color,
    map: texName ? levelTexture(texName, towerFacade) : towerFacade(),
  }))
}

// 给 Lambert 件加自发光（暗层里的微光/苔藓/焦油余温）
function emit(mesh: THREE.Mesh, hex: string, intensity = 1): THREE.Mesh {
  const mat = mesh.material as THREE.MeshLambertMaterial
  mat.emissive = col(hex)
  mat.emissiveIntensity = intensity
  return mesh
}

// 绿色 EXIT 指示灯牌（程序纹理：深底绿字；levelTexture 全局缓存）
function exitSignTexture(): THREE.Texture {
  return levelTexture('exit_sign_v1.png', () => {
    const [cv, c] = makeCanvasCtx(96, 32)
    c.fillStyle = '#06210f'
    c.fillRect(0, 0, 96, 32)
    c.strokeStyle = '#1d5c33'
    c.strokeRect(1.5, 1.5, 93, 29)
    c.fillStyle = '#3aff72'
    c.font = 'bold 20px monospace'
    c.textAlign = 'center'
    c.textBaseline = 'middle'
    c.fillText('EXIT', 48, 17)
    return toTex(cv)
  })
}

// v55：墙面字牌程序纹理（wallsign 用——房号/「员工专用」/「Beverly Room」等；gold=金底描金酒店牌）。
// 动态文本无磁盘贴图——走独立缓存（levelTexture 会先尝试纹理文件、动态名必然 404）
const signTexCache = new Map<string, THREE.Texture>()
function signTexture(text: string, gold: boolean): THREE.Texture {
  const key = `${text}|${gold ? 'g' : 'd'}`
  const hit = signTexCache.get(key)
  if (hit) return hit
  const [cv, c] = makeCanvasCtx(128, 40)
  c.fillStyle = gold ? '#3a2c12' : '#22252a'
  c.fillRect(0, 0, 128, 40)
  c.strokeStyle = gold ? '#c9a24a' : '#6a7076'
  c.strokeRect(2, 2, 124, 36)
  c.strokeRect(4.5, 4.5, 119, 31)
  c.fillStyle = gold ? '#e8c86a' : '#c8ccd0'
  c.font = `${text.length > 8 ? 13 : 17}px 'Microsoft YaHei','SimSun',monospace`
  c.textAlign = 'center'
  c.textBaseline = 'middle'
  c.fillText(text, 64, 21)
  const t = toTex(cv)
  signTexCache.set(key, t)
  return t
}

function mergedL10Crop(parts: { g: THREE.BufferGeometry; c: string }[]): THREE.Mesh {
  for (const { g, c } of parts) {
    const cc = col(c), n = g.attributes.position.count, arr = new Float32Array(n * 3)
    for (let i = 0; i < n; i++) { arr[i * 3] = cc.r; arr[i * 3 + 1] = cc.g; arr[i * 3 + 2] = cc.b }
    g.setAttribute('color', new THREE.BufferAttribute(arr, 3))
  }
  const geos = parts.map(p => p.g), merged = mergeGeometries(geos)!
  for (const g of geos) g.dispose()
  return new THREE.Mesh(merged, l10CropMaterial())
}

type L10CropCell = { cx: number; cy: number; patches: Structure[] }

const l10PatchSeed = (s: Structure, m: GameMap, barley: boolean) => {
  const wx = Math.round((s.x + (m.inf?.ox ?? 0)) * 4)
  const wy = Math.round((s.y + (m.inf?.oy ?? 0)) * 4)
  return (Math.imul(wx, 73856093) ^ Math.imul(wy, 19349663) ^ (barley ? 0x6ba71e : 0x5a117e)) >>> 0
}

/** 一个 16×16m 单元的近/中景麦簇。只创建每个品种一个 InstancedMesh。 */
function buildL10CropCards(cell: L10CropCell, m: GameMap, perSquareMetre: number): THREE.Group {
  const group = new THREE.Group()
  const counts = [0, 0]
  for (const s of cell.patches) {
    const species = s.data?.barley ? 1 : 0
    const density = Math.max(.12, Math.min(1.08, Number(s.data?.density ?? .94) / .94))
    counts[species] += Math.max(1, Math.floor(s.w * s.h * perSquareMetre * density))
  }
  const meshes: (THREE.InstancedMesh | null)[] = [0, 1].map((species) => counts[species]
    ? new THREE.InstancedMesh(l10CropCardGeometry(), l10CropCardMaterial(species === 1), counts[species])
    : null)
  const offsets = [0, 0]
  const dummy = new THREE.Object3D()
  for (const s of cell.patches) {
    const barley = !!s.data?.barley, species = barley ? 1 : 0
    const mesh = meshes[species]!
    const density = Math.max(.12, Math.min(1.08, Number(s.data?.density ?? .94) / .94))
    const n = Math.max(1, Math.floor(s.w * s.h * perSquareMetre * density))
    const r = mulberry(l10PatchSeed(s, m, barley))
    for (let i = 0; i < n; i++) {
      // 4m 逻辑块之间不保留裸地边距；随机分布和透明枝叶会自然互相交叠遮住块缝。
      const px = s.x + .015 + r() * Math.max(.03, s.w - .03)
      const pz = s.y + .015 + r() * Math.max(.03, s.h - .03)
      const width = .72 + r() * .25
      const height = (.78 + r() * .24) * (barley ? 1.035 : 1)
      dummy.position.set(px - cell.cx, floorHeight(m, px, pz, s.floor ?? 0), pz - cell.cy)
      // 交叉卡片本身已覆盖四个观察方向。保持统一世界朝向，GPU 风弯曲才不会被
      // 随机实例旋转带到各自的局部方向，整片麦浪因此能够同向传播。
      dummy.rotation.set(0, 0, 0)
      dummy.scale.set(width, height, width)
      dummy.updateMatrix()
      const at = offsets[species]++
      mesh.setMatrixAt(at, dummy.matrix)
    }
  }
  for (let species = 0; species < meshes.length; species++) {
    const mesh = meshes[species]
    if (!mesh) continue
    mesh.name = species ? 'l10-barley-cards' : 'l10-wheat-cards'
    mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage)
    mesh.instanceMatrix.needsUpdate = true
    mesh.computeBoundingBox(); mesh.computeBoundingSphere()
    mesh.frustumCulled = true
    mesh.userData.noCollision = 1
    mesh.userData.noCastShadow = 1
    group.add(mesh)
  }
  group.userData.noCollision = 1
  return group
}

/** 远景密集区使用连续冠层；稀疏过渡区交给远景卡片，避免低密度边缘仍像整齐方毯。 */
function buildL10CropCanopy(cell: L10CropCell, m: GameMap): THREE.Mesh | null {
  const geos: THREE.BufferGeometry[] = []
  for (const s of cell.patches) {
    const barley = !!s.data?.barley
    const density = Math.max(.12, Math.min(1.08, Number(s.data?.density ?? .94) / .94))
    if (density < .48) continue
    const blend = Math.max(0, Math.min(1, (density - .42) / .58))
    const extent = .70 + blend * .30
    const r = mulberry(l10PatchSeed(s, m, barley) ^ 0x10ca90)
    const ox = (r() - .5) * s.w * (1 - extent) * .42
    const oz = (r() - .5) * s.h * (1 - extent) * .42
    const g = new THREE.PlaneGeometry(s.w * extent + .06, s.h * extent + .06, 2, 2)
    g.rotateX(-Math.PI / 2)
    g.translate(s.x + s.w / 2 + ox - cell.cx, 0, s.y + s.h / 2 + oz - cell.cy)
    const pos = g.attributes.position as THREE.BufferAttribute
    const uv = g.attributes.uv as THREE.BufferAttribute
    for (let i = 0; i < pos.count; i++) {
      const wx = pos.getX(i) + cell.cx, wz = pos.getZ(i) + cell.cy
      const ripple = Math.sin((wx + (m.inf?.ox ?? 0)) * .29 + (wz + (m.inf?.oy ?? 0)) * .17) * .018
      pos.setY(i, floorHeight(m, wx, wz, s.floor ?? 0) + (barley ? .94 : 1.02) + ripple)
      uv.setXY(i, (wx + (m.inf?.ox ?? 0)) * .48, (wz + (m.inf?.oy ?? 0)) * .48)
    }
    pos.needsUpdate = true; uv.needsUpdate = true
    g.computeVertexNormals()
    geos.push(g)
  }
  if (!geos.length) return null
  const merged = mergeGeometries(geos)!
  for (const g of geos) g.dispose()
  const mesh = new THREE.Mesh(merged, l10CropCanopyMaterial())
  mesh.name = 'l10-crop-canopy'
  mesh.frustumCulled = true
  mesh.userData.noCollision = 1
  mesh.userData.noCastShadow = 1
  return mesh
}

/**
 * L10 作物以 16×16m 单元分别切换 LOD：近景 8.6 簇/m²、中景 2.8 簇/m²、远景冠层
 * 加 0.55 簇/m² 的轮廓代理。过渡带的 density 同时驱动三档，不会在 LOD 切换后突然变满。
 * 区块不再按中心一次切换整片农田，玩家移动时不会看见 32m 方块整体“跳变”。
 */
export function* buildL10CropLodJob(patches: Structure[], m: GameMap): Generator<void, THREE.Group | null, unknown> {
  if (!patches.length) return null
  const byCell = new Map<string, L10CropCell>()
  for (const s of patches) {
    const cellX = Math.floor(s.x / 16) * 16 + 8
    const cellY = Math.floor(s.y / 16) * 16 + 8
    const key = `${cellX},${cellY}`
    let cell = byCell.get(key)
    if (!cell) { cell = { cx: cellX, cy: cellY, patches: [] }; byCell.set(key, cell) }
    cell.patches.push(s)
  }
  const root = new THREE.Group()
  root.name = 'l10-crop-lod-cells'
  let nearInstances = 0, midInstances = 0
  for (const cell of byCell.values()) {
    const lod = new THREE.LOD()
    lod.position.set(cell.cx, 0, cell.cy)
    const near = buildL10CropCards(cell, m, 8.6)
    yield
    const mid = buildL10CropCards(cell, m, 2.8)
    yield
    const far = new THREE.Group()
    const canopy = buildL10CropCanopy(cell, m)
    if (canopy) far.add(canopy)
    far.add(buildL10CropCards(cell, m, .55))
    yield
    lod.addLevel(near, 0, .18)
    lod.addLevel(mid, 24, .18)
    lod.addLevel(far, 58, .18)
    lod.userData.noCollision = 1
    root.add(lod)
    near.traverse(o => { if ((o as THREE.InstancedMesh).isInstancedMesh) nearInstances += (o as THREE.InstancedMesh).count })
    mid.traverse(o => { if ((o as THREE.InstancedMesh).isInstancedMesh) midInstances += (o as THREE.InstancedMesh).count })
  }
  root.userData.noCollision = 1
  root.userData.l10CropStats = { cells: byCell.size, nearInstances, midInstances }
  return root
}

/** 同步兼容入口：完整耗尽 L10 作物 LOD 构建任务。 */
export function buildL10CropLod(patches: Structure[], m: GameMap): THREE.Group | null {
  const job = buildL10CropLodJob(patches, m)
  let result = job.next()
  while (!result.done) result = job.next()
  return result.value
}

let l9WatchSignTex: THREE.Texture | null = null
function l9WatchSignTexture(): THREE.Texture {
  if (l9WatchSignTex) return l9WatchSignTex
  const [cv, c] = makeCanvasCtx(192, 256)
  c.fillStyle = '#ecebe5'; c.fillRect(0, 0, 192, 256)
  c.strokeStyle = '#111315'; c.lineWidth = 9; c.strokeRect(6, 6, 180, 244)
  c.fillStyle = '#101214'; c.fillRect(14, 16, 164, 43)
  c.fillStyle = '#f3f1e9'; c.textAlign = 'center'; c.textBaseline = 'middle'
  c.font = 'bold 25px monospace'; c.fillText('WARNING', 96, 39)
  c.fillStyle = '#111315'; c.font = 'bold 13px monospace'; c.fillText('PROTECTED BY', 96, 76)
  c.font = 'bold 14px monospace'; c.fillText('NEIGHBORHOOD', 96, 94); c.fillText('WATCH', 96, 112)
  c.beginPath(); c.ellipse(96, 163, 57, 30, 0, 0, Math.PI * 2); c.fill()
  c.fillStyle = '#ecebe5'; c.beginPath(); c.ellipse(96, 163, 45, 21, 0, 0, Math.PI * 2); c.fill()
  c.fillStyle = '#111315'; c.beginPath(); c.arc(96, 163, 18, 0, Math.PI * 2); c.fill()
  c.fillStyle = '#ecebe5'; c.beginPath(); c.arc(102, 156, 5, 0, Math.PI * 2); c.fill()
  c.fillStyle = '#111315'; c.font = 'bold 12px monospace'; c.fillText('24 HOUR', 96, 211); c.fillText('SURVEILLANCE', 96, 228)
  c.globalAlpha = .42; c.fillStyle = '#6c685e'
  for (let i = 0; i < 34; i++) {
    const x = (i * 53 + 17) % 176 + 8, y = (i * 97 + 31) % 238 + 9
    c.fillRect(x, y, 2 + (i % 4), 1 + (i % 3))
  }
  c.globalAlpha = 1
  l9WatchSignTex = toTex(cv)
  l9WatchSignTex.colorSpace = THREE.SRGBColorSpace
  return l9WatchSignTex
}

// v26：悬挂物贴合天花板底面——按所在瓦片的实际顶高（挑高=H*1.75 / 上层楼板底 2.65 / 普通=H），
// 取代旧版一律用层高 H（挑高区吊灯悬空在半天、楼板下的灯嵌进楼板底）
function hangingCeil(s: Structure, m: GameMap, H: number): number {
  if(m.l1Architecture)return l1RoofAt(m,s.x+s.w/2,s.y+s.h/2,H,true)
  const tx = Math.floor(s.x + s.w / 2), ty = Math.floor(s.y + s.h / 2)
  if (tx < 0 || ty < 0 || tx >= m.w || ty >= m.h) return H
  const i = ty * m.w + tx
  // v57m：结构位于 2F 时，buildStructure 会把组再抬升 FLOOR_H——这里返回相对 2F 地板的净高
  if ((s.floor ?? 0) === 1) return (m.up2 && m.up2[i] === 1 ? 2 * 3.0 - 0.35 : 3.0 + 2.6) - 3.0
  if (m.up && m.up[i] === 1) return 2.65
  if (m.ceiling && m.ceiling[i] === 1) return tallCeilH(m, H) // v46：多层挑高与上层天花拉平
  return H
}

// ---------- 结构低模 ----------
export function buildStructure(s: Structure, _def: LevelDef, m: GameMap, wallH: number): THREE.Object3D | null {
  if(_def.id===0){const furniture=buildL0Furniture(s);if(furniture)return furniture}
  if(isAlphaKind(s.kind))return m.settlement?.blueprint.id==='alpha'?null:buildAlphaDecor(s)
  if(isTradeKind(s.kind))return m.settlement?.blueprint.decorations&&s.kind!=='trade_anomaly'?null:buildTradeDecor(s)
  if(s.kind === 'settlementprop') return null
  if(s.kind === 'settlementstation') return buildSettlementStation(s)
  if(s.data?.l1Column)return buildL1Column(s)
  if (s.kind.startsWith('l11')) return buildL11Structure(s)
  const grp = new THREE.Group()
  const cx = s.x + s.w / 2, cz = s.y + s.h / 2
    if(isL5DecorKind(s.kind)){const model=buildL5Registered(s);model.position.x=cx;model.position.z=cz;return model}
  const H = wallH
  if(_def.id===4){const replacement=buildL4Structure(s);if(replacement){replacement.position.set(cx,0,cz);return replacement}}
  if(_def.id===3){const replacement=l3Structure(s,H);if(replacement){replacement.position.set(cx,0,cz);return replacement}}
  const CH = hangingCeil(s, m, H) // v26：本瓦片天花板底面高度（悬挂物专用）
  if(_def.id===5){
    const replacement=buildL5Structure(s,CH,m)
    if(replacement){
      if(s.kind==='libshelf')flushToWall(replacement,s,m,.58)
        if(s.kind==='sconce')flushToWall(replacement,s,m,.12)
        if(s.kind==='wallsign')flushToWall(replacement,s,m,.04)
        if(s.kind==='dresser')flushToWall(replacement,s,m,.64,.14)
        if(s.kind==='cabinet')flushToWall(replacement,s,m,.50,.14)
      if(s.kind==='hotelwindow')flushToWall(replacement,s,m,.28)
      replacement.position.set(cx,0,cz)
      return replacement
    }
  }
  // 大部分早期 L9 街景模型仍由出口构件工厂提供；较新的建筑组件在本函数自己的
  // switch 中实现，不能被 startsWith('l9') 提前截走。旧路由会让 l9window 返回空组，
  // 实际画面只剩整格墙洞后的明亮室内，看上去就像一排“发光门”。
  const localL9Component = s.kind === 'l9window' || s.kind === 'l9tvconsole' || s.kind === 'l9planter' || s.kind === 'l9vegbed'
  if (s.kind.startsWith('l9') && !localL9Component) {
    const l9 = buildExit(s.kind, _def, s)
    l9.position.set(cx, 0, cz)
    return l9
  }
  switch (s.kind) {
    case 'pillar': {
      // v34：立柱默认使用该层级的墙纸（与墙面同材质观感；无磁盘贴图的层级经 levelTexture 回退程序噪点）
      // v46：柱高自动顶到实际顶面——夹楼板下=楼板底 2.65（真支撑柱），挑高区=挑高顶
      // （开阔挑高区的柱子不再半截悬空，始终与地面和天花板相连）
      const pti = Math.floor(cz) * m.w + Math.floor(cx)
      const ph = m.up?.[pti] === 1 ? 2.65 : (m.floors ?? 1) > 1 && m.ceiling?.[pti] === 1 ? tallCeilH(m, H) : H
      grp.add(wallpaperBox(0.75, ph, 0.75, _def, 0, ph / 2, 0))
      grp.add(wallpaperBox(0.9, 0.25, 0.9, _def, 0, 0.12, 0))
      break
    }
    case 'car': {
      const cc = _def.id===11 && typeof s.data?.color==='string' ? s.data.color : ['#5a4a42', '#445055', '#555048', '#4a3a3a'][Math.floor(mulberry(s.x * 37 + s.y * 11)() * 4)]
      grp.add(box(s.w * 0.92, 0.55, s.h * 0.88, cc, 0, 0.42, 0))
      grp.add(box(s.w * 0.5, 0.4, s.h * 0.7, '#2a2d30', 0, 0.85, 0))
      // 后备箱盖（搜索后掀起；v54：加内衬与两侧液压杆，随盖同翻）
      const trunk = box(s.w * 0.4, 0.05, s.h * 0.85, cc, -s.w * 0.26, 0.72, 0)
      trunk.geometry.translate(-s.w * 0.2, 0, 0)
      trunk.position.set(s.w * 0.05, 0.72, 0)
      trunk.add(box(s.w * 0.36, 0.02, s.h * 0.78, '#1e2124', -s.w * 0.2, -0.035, 0)) // 内衬
      for (const pz of [-s.h * 0.3, s.h * 0.3]) { // 液压杆
        const strut = cyl(0.014, 0.014, 0.3, '#7a7f85', -s.w * 0.06, -0.13, pz, 6)
        strut.rotation.z = 0.55
        trunk.add(strut)
      }
      movable(trunk, 'lid')
      grp.add(trunk)
      // v54：车窗玻璃带 + 四轮（含轮毂）+ 前后灯（不动后备箱盖动画件；细节收在原轮廓 ±0.02 内）
      grp.add(box(s.w * 0.52, 0.2, s.h * 0.72, '#26323a', 0, 0.88, 0)) // 车窗玻璃带（环座舱）
      for (const wx of [-s.w * 0.3, s.w * 0.3]) for (const wz of [-s.h * 0.4, s.h * 0.4]) {
        const wheel = cyl(0.16, 0.16, 0.1, '#15171a', wx, 0.16, wz, 10)
        wheel.rotation.x = Math.PI / 2
        grp.add(wheel)
        const hub = cyl(0.07, 0.07, 0.12, '#4a4f56', wx, 0.16, wz, 8)
        hub.rotation.x = Math.PI / 2
        grp.add(hub)
      }
      for (const lz of [-s.h * 0.26, s.h * 0.26]) {
        grp.add(glow(0.04, 0.09, 0.14, '#e8e2c8', s.w * 0.46, 0.52, lz))  // 前灯（+x 车头）
        grp.add(glow(0.04, 0.08, 0.14, '#c93a2e', -s.w * 0.46, 0.52, lz)) // 尾灯（后备箱侧）
      }
      if (s.looted) grp.userData.open = 1
      break
    }
    case 'booth': {
      grp.add(box(s.w, 1.1, s.h, '#5a5148', 0, 0.55, 0))
      grp.add(box(s.w * 0.8, 0.9, 0.1, '#3a352e', 0, 1.5, s.h / 2 - 0.05))
      grp.add(box(s.w, 0.1, s.h, '#44403a', 0, 2.0, 0))
      break
    }
    case 'pipes': {
      if (s.data?.cross) {
        // v41：横穿廊道的大小管道（L2 扭曲的廊道）——沿局部 X 横卧，与 crawl 低通道风道同高
        const len = s.w
        const big = cyl(0.16, 0.16, len, '#7a4a2e', 0, 1.02, -0.2)
        big.rotation.z = Math.PI / 2
        grp.add(big)
        const small = cyl(0.09, 0.09, len, '#8a8a8a', 0, 0.62, 0.18)
        small.rotation.z = Math.PI / 2
        grp.add(small)
        break
      }
      // v41：data.rust=生锈变体（L2 肮脏的廊道：金属普遍生锈，锈橙棕）
      const rust = !!s.data?.rust
      const cA = rust ? '#8a4526' : '#7a4a2e' // 主管（锈橙/铜棕）
      const cB = rust ? '#6e5a42' : '#8a8a8a' // 次管（灰棕/钢灰）
      // v42：端头弧形拐弯（任何平行管道的尽头都不留悬空断头）——贝塞尔弯管 + 竖直段接入天花板/地板
      const endEl = Number(s.data?.endEl ?? 0) // 1=向上入顶 2=向下入地
      const south = Number(s.data?.endS ?? 0) === 1
      const addElbow = (x: number, hy: number, rad: number, cc: string) => {
        if (!endEl) return
        const up = endEl === 1
        const zs = south ? 1 : -1
        const zc = zs * 0.2 // 弯心（自管排末端内收）
        const curve = new THREE.QuadraticBezierCurve3(
          new THREE.Vector3(x, hy, zc - zs * 0.3),
          new THREE.Vector3(x, hy, zc),
          new THREE.Vector3(x, hy + (up ? 0.3 : -0.3), zc),
        )
        grp.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 6, rad, 6), new THREE.MeshLambertMaterial({ color: cc })))
        const y2 = up ? H : 0 // 竖直段直插天花板/地板
        const vy = hy + (up ? 0.3 : -0.3)
        grp.add(cyl(rad, rad, Math.abs(y2 - vy) + 0.08, cc, x, (y2 + vy) / 2, zc))
      }
      if (s.data?.run) {
        // v42：贴墙平行粗管群——沿廊道走向多条不同粗细管道贴墙布置（实心，廊道净宽 3→2）
        const hug = Number(s.data?.side ?? 0) === 1 ? 1 : -1 // 墙在 hug 侧
        const rows: [number, number, number, string][] = [
          [0.3, 0.13, 0, cA], [0.62, 0.09, 0.07, cB], [0.98, 0.16, -0.05, cA],
        ]
        for (const [hy, rad, ox, cc] of rows) {
          const p = cyl(rad, rad, 1.0, cc, hug * (0.3 + ox), hy, 0)
          p.rotation.x = Math.PI / 2
          grp.add(p)
          addElbow(hug * (0.3 + ox), hy, rad, cc)
        }
        grp.add(box(0.08, 1.1, 0.1, '#3a352e', hug * 0.44, 0.55, 0)) // 管箍支架
        break
      }
      if (s.data?.wall) {
        // v42：代墙平行管道——整段墙面化身多层沿廊道走向的管排（不压缩净宽；段旁禁止生成门）
        const dir = Number(s.data?.side ?? 0) === 1 ? -1 : 1 // 朝廊道方向（西墙线→+x）
        const rows: [number, number, string][] = [
          [0.42, 0.16, cA], [0.98, 0.1, cB], [1.55, 0.13, cA], [2.12, 0.09, cB],
        ]
        for (const [hy, rad, cc] of rows) {
          const px = dir * (0.5 + rad * 0.4) // 凸出墙面（管排即墙）
          const p = cyl(rad, rad, 1.0, cc, px, hy, 0)
          p.rotation.x = Math.PI / 2
          grp.add(p)
          addElbow(px, hy, rad, cc)
        }
        // 竖向连通短管（管排之间的落水连通管观感）
        grp.add(cyl(0.07, 0.07, H, cB, dir * 0.52, H / 2, (s.x + s.y) % 2 ? -0.3 : 0.3))
        break
      }
      if (s.data?.ceil) {
        // v42：天花板两缘管线装饰——细管 + 电缆线束沿廊道走向（非实心纯装饰）
        const dir = Number(s.data?.side ?? 0) === 1 ? -1 : 1
        const px = dir * 0.44
        const p = cyl(0.05, 0.05, 1.0, cB, px, H - 0.2, 0)
        p.rotation.x = Math.PI / 2
        grp.add(p)
        addElbow(px, H - 0.2, 0.05, cB)
        // 电缆线束（3 条细线；按瓦片哈希偶发下垂环）
        const mrand = mulberry((Math.floor(s.x) * 73856093) ^ (Math.floor(s.y) * 19349663))
        for (let k2 = 0; k2 < 3; k2++) {
          const cx2 = dir * (0.34 + k2 * 0.05), cy2 = H - 0.3 - k2 * 0.05
          const cb = box(0.025, 0.025, 1.0, ['#16181a', '#3a2020', '#1e2a38'][k2], cx2, cy2, 0)
          grp.add(cb)
          if (k2 === 1 && mrand() < 0.3) { // 下垂环
            const loop = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.014, 5, 8, Math.PI), new THREE.MeshLambertMaterial({ color: '#16181a' }))
            loop.geometry.rotateY(Math.PI / 2)
            loop.geometry.rotateX(Math.PI)
            loop.position.set(cx2, cy2, (mrand() - 0.5) * 0.6)
            grp.add(loop)
          }
        }
        break
      }
      grp.add(cyl(0.14, 0.14, H, cA, -0.15, H / 2, 0))
      grp.add(cyl(0.1, 0.1, H, cB, 0.18, H / 2, 0.1))
      if (rust) grp.add(cyl(0.16, 0.16, 0.5, '#9a4e24', -0.15, 0.9, 0)) // 锈蚀鼓包
      break
    }
    case 'valve': {
      grp.add(cyl(0.12, 0.12, 1.6, '#7a4a2e', 0, 0.8, 0))
      const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.05, 6, 10), new THREE.MeshLambertMaterial({ color: '#a63a2e' }))
      wheel.position.set(0, 1.1, 0.18)
      grp.add(wheel)
      // v51 细化：手轮辐条（两轮梁十字）
      for (const a of [0, Math.PI / 2]) {
        const spoke = box(0.4, 0.035, 0.035, '#a63a2e', 0, 1.1, 0.18)
        spoke.rotation.z = a
        grp.add(spoke)
      }
      grp.add(cyl(0.06, 0.06, 0.1, '#8a4526', 0, 1.1, 0.12, 8).rotateX(Math.PI / 2)) // 轮毂
      break
    }
    case 'gauge': {
      grp.add(cyl(0.05, 0.05, 1.1, '#8a8a8a', 0, 0.55, 0))
      grp.add(cyl(0.16, 0.16, 0.08, '#d9c39a', 0, 1.2, 0, 10))
      break
    }
    case 'boiler': {
      // v41：data.dead=废弃状态（L2 肮脏的廊道：暗色/不发光）
      const dead = !!s.data?.dead
      grp.add(cyl(1.3, 1.4, 2.6, dead ? '#332c26' : '#4a3f35', 0, 1.3, 0, 12))
      grp.add(cyl(0.2, 0.2, 1.5, dead ? '#6e3428' : '#a63a2e', 0.9, 2.6, 0))
      if (!dead) grp.add(glow(0.5, 0.3, 0.05, '#ff6a3a', 0, 0.9, s.h / 2 - 0.3))
      // v51 细化：铆钉环行 + 压力表微光 + 底部炉栅（ footprint/实心不变，L2 共用同样受益）
      for (const ry of [0.7, 1.9]) {
        const rr = ry < 1.3 ? 1.36 - (1.3 - ry) * 0.1 : 1.36 - (ry - 1.3) * 0.1 // 罐体近似半径
        for (let i = 0; i < 10; i++) {
          const a = (i / 10) * Math.PI * 2
          grp.add(box(0.05, 0.05, 0.05, dead ? '#2a241e' : '#5a4a3a', Math.cos(a) * rr, ry, Math.sin(a) * rr))
        }
      }
      if (!dead) grp.add(glow(0.1, 0.1, 0.03, '#e8b93c', -0.55, 1.85, s.h / 2 - 0.62)) // 压力表
      grp.add(box(0.6, 0.22, 0.05, '#1c1e22', 0, 0.28, s.h / 2 - 0.28)) // 底部炉栅
      break
    }
    case 'generator': {
      const dead = !!s.data?.dead
      grp.add(box(s.w * 0.9, 1.4, s.h * 0.85, dead ? '#2b2e33' : '#3a3f46', 0, 0.7, 0))
      const drum = cyl(0.35, 0.35, s.w * 0.7, dead ? '#22252a' : '#2e3238', 0, 1.6, 0, 10)
      drum.rotation.z = Math.PI / 2
      grp.add(drum)
      if (!dead) grp.add(glow(0.2, 0.1, 0.05, '#9adfff', s.w * 0.3, 1.0, s.h * 0.43))
      // v51 细化：底部槽钢轨 + 顶部排气管 + 侧面控制面板（2~3 微光表盘）
      for (const pz of [-s.h * 0.32, s.h * 0.32]) grp.add(box(s.w * 0.95, 0.08, 0.08, '#26282c', 0, 0.04, pz)) // 底轨
      grp.add(cyl(0.07, 0.07, 0.6, dead ? '#22252a' : '#4a4f56', -s.w * 0.25, 1.9, 0, 8)) // 排气管
      if (!dead) {
        grp.add(box(0.3, 0.24, 0.03, '#2e3238', s.w * 0.26, 1.15, s.h * 0.44)) // 控制面板
        for (let i = 0; i < 3; i++)
          grp.add(glow(0.04, 0.04, 0.02, ['#9adfff', '#6f9a55', '#e8b93c'][i], s.w * 0.26 - 0.08 + i * 0.08, 1.15, s.h * 0.44 + 0.02))
      }
      // v54：端面风扇罩（环 + 十字条 + 叶毂）+ 前壁管线 + 仪表（表盘 + 指针）
      const fanZ = s.h * 0.43
      const fan = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.035, 6, 14), new THREE.MeshLambertMaterial({ color: dead ? '#22252a' : '#4a4f56' }))
      fan.position.set(-s.w * 0.2, 0.7, fanZ + 0.02)
      grp.add(fan)
      for (const a of [0, Math.PI / 2]) {
        const bar = box(0.56, 0.04, 0.02, dead ? '#22252a' : '#454a51', -s.w * 0.2, 0.7, fanZ + 0.02)
        bar.rotation.z = a
        grp.add(bar)
      }
      grp.add(cyl(0.1, 0.1, 0.03, '#1c1e22', -s.w * 0.2, 0.7, fanZ + 0.01, 10).rotateX(Math.PI / 2)) // 扇叶毂
      for (const py of [0.22, 0.34]) // 前壁管线（横向双管）
        grp.add(cyl(0.035, 0.035, s.w * 0.55, dead ? '#22252a' : '#5a5f66', s.w * 0.05, py, fanZ + 0.02, 6).rotateZ(Math.PI / 2))
      const gauge = cyl(0.09, 0.09, 0.03, '#d8d2c2', s.w * 0.05, 1.15, fanZ + 0.02, 12) // 仪表表盘
      gauge.rotation.x = Math.PI / 2
      grp.add(gauge)
      if (!dead) grp.add(glow(0.02, 0.07, 0.01, '#c94a3a', s.w * 0.05, 1.16, fanZ + 0.04)) // 仪表指针
      break
    }
    case 'cabinet': {
      grp.add(box(0.85, 1.9, 0.5, '#3a3f46', 0, 0.95, 0))
      grp.add(box(0.87, 0.18, 0.52, '#d9b13b', 0, 1.45, 0))
      grp.add(glow(0.08, 0.08, 0.03, '#9adfff', 0.2, 1.7, 0.26))
      // v54：台面 + 柜脚
      grp.add(box(0.9, 0.05, 0.55, '#2a2e34', 0, 1.93, 0))
      for (const px of [-0.36, 0.36]) for (const pz of [-0.18, 0.18]) grp.add(box(0.07, 0.09, 0.07, '#22262b', px, 0.045, pz))
      // v54：柜内构（门关时收在柜体轮廓内，双开门外摆后可见）：两块隔板 + 顶层浅抽屉
      grp.add(box(0.78, 0.04, 0.44, '#2e3238', 0, 1.05, 0)) // 中隔板
      grp.add(box(0.78, 0.04, 0.44, '#2e3238', 0, 0.55, 0)) // 下隔板
      grp.add(box(0.6, 0.12, 0.34, '#8a6a1e', 0, 1.26, 0.02)) // 顶层浅抽屉
      grp.add(box(0.2, 0.03, 0.03, '#c9c2a8', 0, 1.26, 0.2)) // 浅抽屉拉手
      // 柜门（可开启）：v54 改双开门——两扇铰链各在外侧缘，对称外摆（几何平移到铰链边，绕边旋转而非绕中心打转）
      for (const sgn of [-1, 1]) {
        const door = box(0.42, 1.5, 0.04, '#2e3238', 0, 0, 0)
        door.geometry.translate(-sgn * 0.21, 0.75, 0)
        door.position.set(sgn * 0.42, 0.2, 0.26)
        door.add(box(0.04, 0.14, 0.03, '#c9c2a8', -sgn * 0.36, 0.75, 0.035)) // 拉手（近中缝）
        movable(door, sgn < 0 ? 'doorL' : 'doorR')
        grp.add(door)
      }
      if (s.looted) grp.userData.open = 1
      // v48 缺省朝向：背贴最近墙、正面（+Z）朝外；data.deg 可显式覆盖；v51 贴墙位移
      if (s.data?.deg !== undefined) grp.rotation.y = ((Number(s.data.deg) || 0) * Math.PI) / 180
      else flushToWall(grp, s, m, 0.5)
      break
    }
    case 'trench': {
      // v54：电缆沟细化 + 连接——扫 m.structures 找同 kind 四邻 trench，连成连续沟：
      // 端头封闭板只在非连接端出现；沟沿包边/线缆按连接轴定向（横沟/竖沟，转角/T 型双轴组合）；
      // 部分瓦片带格栅盖板（mulberry 瓦片哈希确定性）。全部收在原 1×1 平板轮廓内
      const tx = Math.floor(s.x + s.w / 2), ty = Math.floor(s.y + s.h / 2)
      const isTrenchAt = (x: number, y: number) =>
        m.structures.some((o) => o !== s && o.kind === 'trench'
          && Math.floor(o.x + o.w / 2) === x && Math.floor(o.y + o.h / 2) === y)
      const cn = isTrenchAt(tx, ty - 1), ce = isTrenchAt(tx + 1, ty)
      const cs = isTrenchAt(tx, ty + 1), cw = isTrenchAt(tx - 1, ty)
      let runX = ce || cw, runZ = cn || cs // 连接轴：有横邻→横沟，有纵邻→竖沟，转角/T 型两轴皆真
      if (!runX && !runZ) runX = true // 孤立沟：默认横沟
      grp.add(box(1, 0.06, 1, '#101215', 0, 0.03, 0)) // 沟底
      const cableC = ['#a63a2e', '#d9b13b', '#3a5ad9', '#3a3f46']
      for (const alongX of [runX, runZ]) {
        if (!alongX) continue
        // 沟沿金属包边（两侧）
        for (const sd of [-1, 1])
          grp.add(alongX ? box(1.0, 0.05, 0.07, '#3a3f46', 0, 0.06, sd * 0.32) : box(0.07, 0.05, 1.0, '#3a3f46', sd * 0.32, 0.06, 0))
        // 沟内线缆分层（4 根异色/两档高度，走向与连接轴对齐）
        for (let i = 0; i < 4; i++) {
          const off = -0.18 + i * 0.12, yy = 0.05 + (i % 2) * 0.035
          const cb = cyl(0.028, 0.028, 0.98, cableC[i], alongX ? 0 : off, yy, alongX ? off : 0, 6)
          if (alongX) cb.rotation.z = Math.PI / 2
          else cb.rotation.x = Math.PI / 2
          grp.add(cb)
        }
      }
      // 端头封闭板：只在非连接端出现（逐轴逐端判断）
      const cap = (alongX: boolean, sd: number) => {
        const c = alongX ? box(0.04, 0.12, 0.6, '#2e3238', sd * 0.47, 0.08, 0) : box(0.6, 0.12, 0.04, '#2e3238', 0, 0.08, sd * 0.47)
        c.userData.trenchCap = 1
        grp.add(c)
      }
      if (runX) { if (!ce) cap(true, 1); if (!cw) cap(true, -1) }
      if (runZ) { if (!cn) cap(false, -1); if (!cs) cap(false, 1) }
      // 格栅盖板段（瓦片哈希 ~45%）：盖板框 + 三根格栅条，板下透出缆线
      if (mulberry(tx * 73 + ty * 37)() < 0.45) {
        grp.add(runX ? box(0.46, 0.025, 0.6, '#4a4f56', 0, 0.105, 0) : box(0.6, 0.025, 0.46, '#4a4f56', 0, 0.105, 0))
        for (let i = 0; i < 3; i++)
          grp.add(runX ? box(0.06, 0.03, 0.6, '#2e3238', -0.14 + i * 0.14, 0.11, 0) : box(0.6, 0.03, 0.06, '#2e3238', 0, 0.11, -0.14 + i * 0.14))
      }
      break
    }
    case 'cubicle': {
      // v54c 精细化：金属收边（顶条/转角立柱）+ 底部走线槽 + 屏风脚垫（轮廓不变）；
      // 朝向：面向最近的办公转椅（与 officechair 邻桌朝桌互为对位；无椅则保持默认）
      const pw = s.w, ph = s.h
      const panelC = (s.data?.color as string | undefined) ?? '#6e6a5c' // v54c：data.color 实例配色（娱乐室彩色隔断）
      grp.add(box(pw, 1.35, 0.08, panelC, 0, 0.68, -ph / 2 + 0.04)) // 后板
      grp.add(box(0.08, 1.35, ph, panelC, -pw / 2 + 0.04, 0.68, 0)) // 侧板
      grp.add(box(pw, 0.05, 0.11, '#4a4e54', 0, 1.375, -ph / 2 + 0.04)) // 后板金属顶条
      grp.add(box(0.11, 0.05, ph, '#4a4e54', -pw / 2 + 0.04, 1.375, 0)) // 侧板金属顶条
      grp.add(box(0.09, 1.42, 0.09, '#4a4e54', -pw / 2 + 0.04, 0.71, -ph / 2 + 0.04)) // 转角立柱
      grp.add(box(pw - 0.06, 0.14, 0.11, '#5a5e64', 0, 0.1, -ph / 2 + 0.04)) // 后板底部走线槽
      grp.add(box(0.11, 0.14, ph - 0.06, '#5a5e64', -pw / 2 + 0.04, 0.1, 0)) // 侧板底部走线槽
      for (const [fx, fz] of [[pw / 2 - 0.08, -ph / 2 + 0.04], [-pw / 2 + 0.04, ph / 2 - 0.08]] as const)
        grp.add(cyl(0.035, 0.045, 0.06, '#3a3e44', fx, 0.03, fz, 8)) // 屏风脚垫
      grp.add(box(pw * 0.8, 0.06, 0.5, '#8f8a7c', 0, 0.75, -ph / 2 + 0.3)) // 桌板
      grp.add(box(pw * 0.8, 0.03, 0.06, '#7a7568', 0, 0.72, -0.02)) // 桌板前缘档条
      grp.add(glow(0.35, 0.25, 0.03, '#7fb0c9', 0, 1.0, -ph / 2 + 0.22)) // 屏
      // v54：桌面办公小件——mulberry 瓦片哈希出 4 种组合变体（v0 键盘+笔筒+便签板 /
      // v1 电话+文件托架 / v2 文件托架+笔筒+便签板 / v3 键盘+电话+笔筒+便签板），避免千桌一面；
      // 全部落在桌板上方与隔间内（轮廓/碰撞不变），挂在 grp 上随朝向（data.deg/邻椅）整体旋转
      {
        const dz = -ph / 2 + 0.3 // 桌板中心 z（顶面 y=0.78）
        const vr = Math.floor(mulberry(s.x * 83 + s.y * 29)() * 4)
        // 显示器支架（底座落在桌板上 + 立柱托住既有屏——屏不再浮空）
        grp.add(box(0.2, 0.02, 0.14, '#2e3238', 0, 0.79, -ph / 2 + 0.22))
        grp.add(box(0.045, 0.12, 0.045, '#2e3238', 0, 0.85, -ph / 2 + 0.22))
        if (vr !== 2) { // 键盘 + 鼠标
          grp.add(box(0.32, 0.02, 0.12, '#3a3e44', 0, 0.79, dz + 0.14))
          grp.add(box(0.06, 0.025, 0.09, '#2e2e33', 0.24, 0.79, dz + 0.14))
        }
        if (vr === 1 || vr === 3) { // 电话（基座 + 听筒）
          grp.add(box(0.16, 0.05, 0.2, '#26282c', -pw * 0.26, 0.805, dz))
          grp.add(box(0.05, 0.04, 0.18, '#1c1e22', -pw * 0.26, 0.85, dz))
        }
        if (vr === 1 || vr === 2) { // 文件托架（L 形架 + 文件堆）
          grp.add(box(0.24, 0.02, 0.3, '#8a8578', pw * 0.26, 0.79, dz))
          grp.add(box(0.24, 0.12, 0.02, '#8a8578', pw * 0.26, 0.85, dz - 0.14))
          grp.add(box(0.2, 0.04, 0.22, '#d8d2c0', pw * 0.26, 0.83, dz + 0.02))
        }
        if (vr !== 1) { // 笔筒 + 笔
          grp.add(cyl(0.032, 0.032, 0.09, '#5a6a4a', pw * 0.3, 0.825, dz - 0.12, 8))
          grp.add(cyl(0.005, 0.005, 0.1, '#c9a24a', pw * 0.31, 0.88, dz - 0.11, 6))
        }
        if (vr !== 1) { // 便签板（挂后板内侧）+ 两张便签
          grp.add(box(0.26, 0.2, 0.015, '#a8946a', -pw * 0.22, 1.05, -ph / 2 + 0.09))
          grp.add(box(0.06, 0.06, 0.005, '#f0e6c0', -pw * 0.26, 1.06, -ph / 2 + 0.1))
          grp.add(box(0.05, 0.07, 0.005, '#e8b93c', -pw * 0.17, 1.03, -ph / 2 + 0.1))
        }
      }
      {
        const cx = s.x + s.w / 2, cy = s.y + s.h / 2
        // v54：自动朝向只看 3×3——椅瓦片与自身瓦片 |dx|≤1 且 |dy|≤1 才算邻椅
        // （旧版半径 2.5 格会隔着屏风板吸到邻间隔间的椅子）
        const tx = Math.floor(cx), ty = Math.floor(cy)
        let bc: { x: number; y: number } | null = null, bd = 1e9
        for (const o of m.structures) {
          if (o === s || o.kind !== 'officechair') continue
          if (Math.abs(Math.floor(o.x + o.w / 2) - tx) > 1 || Math.abs(Math.floor(o.y + o.h / 2) - ty) > 1) continue
          const d = Math.hypot(o.x + o.w / 2 - cx, o.y + o.h / 2 - cy)
          if (d < bd) { bd = d; bc = { x: o.x + o.w / 2, y: o.y + o.h / 2 } }
        }
        if (s.data?.deg !== undefined) grp.rotation.y = ((Number(s.data.deg) || 0) * Math.PI) / 180 // 显式朝向（隔断等）优先
        else if (bc) grp.rotation.y = Math.atan2(bc.x - cx, bc.y - cy) // 开口（+Z）指向转椅
      }
      break
    }
    case 'copier': {
      grp.add(box(1.6, 1.0, 1.4, '#7a766a', 0, 0.5, 0))
      grp.add(box(1.5, 0.15, 1.2, '#8f8a7c', 0, 1.08, 0))
      grp.add(glow(0.3, 0.06, 0.06, '#7fb0c9', 0.4, 1.1, 0.5))
      // v54：稿台盖板 + 出纸托盘 + 操作面板（微仰，按钮随板）
      grp.add(box(1.1, 0.06, 0.85, '#84806f', -0.1, 1.19, -0.12)) // 稿台盖板
      grp.add(box(1.1, 0.05, 0.08, '#6e6a5c', -0.1, 1.17, -0.55)) // 盖板铰链边
      grp.add(box(0.5, 0.04, 0.28, '#8f8a7c', -0.3, 0.66, 0.76)) // 出纸托盘（前侧伸出小件）
      grp.add(box(0.5, 0.1, 0.03, '#6e6a5c', -0.3, 0.6, 0.63)) // 出纸口挡板
      const cpanel = box(0.44, 0.03, 0.26, '#3a3e44', 0.55, 1.19, 0.45) // 操作面板
      cpanel.rotation.x = -0.35
      for (let i = 0; i < 3; i++) cpanel.add(glow(0.04, 0.015, 0.04, ['#6f9a55', '#e8b93c', '#9adfff'][i], -0.12 + i * 0.12, 0.02, 0))
      grp.add(cpanel)
      break
    }
    case 'server': {
      grp.add(box(s.w * 0.9, 2.2, s.h * 0.9, '#26282c', 0, 1.1, 0))
      for (let i = 0; i < 4; i++) grp.add(glow(0.1, 0.04, 0.03, i % 2 ? '#6f9a55' : '#9adfff', -0.6 + i * 0.4, 1.6, s.h * 0.46))
      break
    }
    case 'bigcomputer': {
      // 大号台式电脑（L2 电脑房）：低柜 + 大机箱 + CRT 显示器（微光屏）+ 键盘 + 背部线缆
      const dead = !!s.data?.dead
      grp.add(box(s.w * 0.95, 0.72, 0.85, '#6e6a5c', 0, 0.36, 0)) // 低柜（桌台）
      grp.add(box(s.w * 0.95, 0.04, 0.9, '#8f8a7c', 0, 0.74, 0)) // 台面
      grp.add(box(0.5, 0.52, 0.7, '#b0a894', -s.w * 0.26, 1.02, 0)) // 大机箱（卧式）
      grp.add(box(0.46, 0.03, 0.66, '#8f887a', -s.w * 0.26, 1.3, 0)) // 机箱顶盖
      grp.add(glow(0.05, 0.05, 0.03, dead ? '#3a3f46' : '#6f9a55', -s.w * 0.26 + 0.14, 0.94, 0.36)) // 电源灯
      // CRT 显示器（厚后脑 + 微光屏，data.dead=屏幕熄灭）
      grp.add(box(0.66, 0.56, 0.58, '#c0b8a8', s.w * 0.18, 1.06, -0.05))
      grp.add(box(0.5, 0.42, 0.1, '#a89f8e', s.w * 0.18, 1.06, -0.36)) // 后脑
      if (dead) grp.add(box(0.5, 0.4, 0.03, '#1a2226', s.w * 0.18, 1.06, 0.245))
      else grp.add(glow(0.5, 0.4, 0.03, '#6fae8a', s.w * 0.18, 1.06, 0.245)) // 微光屏（绿）
      grp.add(box(0.46, 0.03, 0.18, '#b8b0a0', s.w * 0.18, 0.78, 0.42)) // 键盘
      for (let i = 0; i < 3; i++) // 键帽行
        grp.add(box(0.4, 0.012, 0.03, '#8f887a', s.w * 0.18, 0.8, 0.37 + i * 0.05))
      grp.add(cyl(0.02, 0.02, 0.5, '#3a352e', s.w * 0.18 - 0.2, 0.5, -0.4, 6)) // 背部线缆
      break
    }
    case 'vending': {
      grp.add(box(0.95, 2.0, 0.7, '#5a3a3a', 0, 1.0, 0))
      grp.add(glow(0.7, 1.2, 0.04, '#ffe9b0', 0, 1.2, 0.36))
      // v54：陈列窗分层货品（3 层板 × 5 件色块，透窗可见）+ 取货口 + 投币区
      const goods = ['#c94a3a', '#d9b13b', '#6f9a55', '#3a5ad9', '#c9c4b8']
      for (let sh = 0; sh < 3; sh++) {
        const gy = 0.86 + sh * 0.36
        grp.add(box(0.66, 0.02, 0.05, '#3a2a2a', 0, gy - 0.09, 0.38)) // 层板
        for (let i = 0; i < 5; i++)
          grp.add(box(0.09, 0.13, 0.04, goods[(sh * 2 + i) % goods.length], -0.26 + i * 0.13, gy, 0.385)) // 货品
      }
      grp.add(box(0.56, 0.28, 0.05, '#2a1e1e', 0, 0.32, 0.36)) // 取货口（凹槽）
      grp.add(box(0.5, 0.2, 0.02, '#1c1515', 0, 0.3, 0.385)) // 取货口翻板
      grp.add(box(0.14, 0.44, 0.04, '#3a2a2a', 0.39, 1.2, 0.36)) // 投币区面板
      grp.add(box(0.03, 0.08, 0.02, '#c9c4b8', 0.39, 1.32, 0.385)) // 投币口
      grp.add(glow(0.05, 0.05, 0.02, '#e8b93c', 0.39, 1.12, 0.385)) // 退币钮
      // v46：data.deg 指定朝向（EL3A 休息室售货机面朝公共区，不再背朝外）；
      // v54 缺省朝向与柜类 v48 约定一致：背贴最近墙、正面（+Z 灯板）朝房间内部（faceOutward+flushToWall 贴墙位移）
      if (s.data?.deg !== undefined) grp.rotation.y = ((Number(s.data.deg) || 0) * Math.PI) / 180
      else flushToWall(grp, s, m, 0.7)
      break
    }
    case 'desk': {
      // v54c 精细化（轮廓不变：顶板 s.w*0.9×0.7 @0.74、支撑 ±s.w*0.4——structColliders 不动）：
      // 抽屉柜单元（右侧吊抽×2 + 拉手）+ 桌面板边沿 + 桌下挡板 + 键盘/鼠标/便签/笔筒小件
      const dw = s.w * 0.9
      grp.add(box(dw, 0.06, 0.7, '#8f8a7c', 0, 0.74, 0)) // 桌面板
      grp.add(box(dw + 0.04, 0.025, 0.74, '#7d786c', 0, 0.775, 0)) // 板面边沿（略大一圈、深一档）
      grp.add(box(0.08, 0.74, 0.6, '#6e6a5c', -s.w * 0.4, 0.37, 0)) // 左侧板
      const cabX = s.w * 0.4 - 0.15
      grp.add(box(0.38, 0.68, 0.6, '#6e6a5c', cabX, 0.34, 0)) // 抽屉柜单元（右侧吊抽）
      for (const [dy, hh] of [[0.52, 0.3], [0.22, 0.34]] as const) {
        grp.add(box(0.34, hh, 0.02, '#7a7568', cabX, dy, 0.31)) // 抽面
        grp.add(box(0.12, 0.025, 0.03, '#3a352e', cabX, dy, 0.33)) // 拉手
      }
      grp.add(box(dw * 0.72, 0.42, 0.04, '#7a7568', -0.04, 0.5, -0.31)) // 桌下挡板（靠后缘）
      // v54c：屏幕总成（底座贴桌面 + 支架 + 边框 + 微亮屏面微后倾——不再浮空）
      grp.add(box(0.22, 0.02, 0.16, '#2e3238', 0.2, 0.79, -0.18)) // 底座
      grp.add(box(0.05, 0.2, 0.05, '#2e3238', 0.2, 0.9, -0.18)) // 支架
      const scrG = new THREE.Group()
      scrG.position.set(0.2, 1.08, -0.18)
      scrG.rotation.x = -0.08
      scrG.add(box(0.46, 0.34, 0.03, '#1c1e22', 0, 0, 0)) // 边框
      scrG.add(glow(0.4, 0.28, 0.015, '#7fb0c9', 0, 0, 0.014)) // 屏面（微亮淡蓝）
      grp.add(scrG)
      grp.add(box(0.35, 0.06, 0.45, '#3a352e', -0.3, 0.78, 0)) // 文件堆/主机块（保留）
      grp.add(box(0.34, 0.025, 0.13, '#c9c4b8', 0.12, 0.79, 0.24)) // 键盘
      grp.add(box(0.06, 0.03, 0.09, '#2e2e33', 0.36, 0.79, 0.24)) // 鼠标
      grp.add(box(0.16, 0.012, 0.12, '#f0e6c0', -0.12, 0.785, 0.2)) // 便签
      grp.add(cyl(0.035, 0.035, 0.09, '#8a4a3a', -0.42, 0.83, -0.18, 8)) // 笔筒
      grp.add(cyl(0.006, 0.006, 0.1, '#2e3238', -0.43, 0.9, -0.17, 6)) // 笔
      break
    }
    case 'door': {
      // 客房门（东侧墙面）
      grp.add(box(0.1, 2.1, 1.0, '#3a1e20', 0, 1.05, 0))
      grp.add(box(0.06, 1.9, 0.8, '#4a2628', 0.05, 0.95, 0))
      grp.add(glow(0.03, 0.03, 0.08, '#b08d46', 0.08, 1.0, 0.25))
      grp.position.set(s.x + s.w - 0.5, 0, s.y + s.h / 2)
      return grp
    }
    case 'frontdesk': {
      grp.add(box(s.w, 1.1, 0.6, '#4a2628', 0, 0.55, 0))
      grp.add(box(s.w, 0.08, 0.7, '#b08d46', 0, 1.14, 0))
      grp.add(cyl(0.08, 0.1, 0.1, '#ffd9a0', 0.5, 1.22, 0, 8))
      break
    }
    case 'ballroom': {
      // 吊灯（v26：吊链顶端贴合本瓦片天花板底面）
      grp.add(cyl(0.04, 0.04, CH - 2.0, '#b08d46', 0, CH - (CH - 2.0) / 2, 0))
      grp.add(cyl(0.7, 0.9, 0.4, '#b08d46', 0, 1.95, 0, 10))
      grp.add(glow(0.6, 0.25, 0.6, '#ffd9a0', 0, 1.75, 0))
      break
    }
    case 'lightgrid': {
      grp.add(glow(s.w * 0.9, 0.06, 0.3, '#fff6d8', 0, CH - 0.05, 0)) // v26：灯排贴天花板底面
      break
    }
    case 'bed': {
      // v54：床架（床头/床尾板 + 床腿）+ 被子与褶皱（矮盒错落拼，mulberry 瓦片哈希确定性）
      grp.add(box(s.w * 0.95, 0.3, s.h * 0.95, '#3a1e20', 0, 0.15, 0))
      grp.add(box(s.w * 0.9, 0.18, s.h * 0.9, '#d8cfc0', 0, 0.38, 0))
      grp.add(box(s.w * 0.8, 0.12, 0.4, '#a03a3a', 0, 0.45, -s.h * 0.3))
      grp.add(box(s.w * 0.95, 0.72, 0.06, '#2a1516', 0, 0.5, -s.h * 0.48)) // 床头板
      grp.add(box(s.w * 0.95, 0.36, 0.05, '#2a1516', 0, 0.3, s.h * 0.48))  // 床尾板
      for (const lx of [-s.w * 0.42, s.w * 0.42]) for (const lz of [-s.h * 0.42, s.h * 0.42])
        grp.add(box(0.07, 0.12, 0.07, '#241215', lx, 0.06, lz)) // 床腿
      grp.add(box(s.w * 0.88, 0.07, s.h * 0.5, '#6a4a4a', 0, 0.47, s.h * 0.16)) // 被子（避开枕头）
      const br = mulberry(s.x * 47 + s.y * 23)
      for (let i = 0; i < 5; i++) { // 被面褶皱（错落矮盒）
        const wr = box(0.24 + br() * 0.2, 0.03, 0.08 + br() * 0.06, '#5c3f3f',
          (br() - 0.5) * s.w * 0.6, 0.515, s.h * (-0.05 + br() * 0.4))
        wr.rotation.y = (br() - 0.5) * 0.6
        grp.add(wr)
      }
      // v55（任务8）：床头靠墙朝向——data.deg=床头朝向（0=南 90=东 180=北 270=西）；模型床头建在局部 -z
      if (s.data?.deg !== undefined) grp.rotation.y = (((Number(s.data.deg) || 0) + 180) * Math.PI) / 180
      break
    }
    case 'sconce': {
      // 烛台壁灯（v55 细化：壁挂托座 + 双烛枝 + 蜡烛 + 分层火苗 glow[内芯亮白/外焰暖橙]，贴墙）
      grp.add(box(0.16, 0.1, 0.08, '#6a541f', 0, 1.62, 0.02)) // 壁挂托座
      grp.add(cyl(0.02, 0.03, 0.14, '#8a6d2e', 0, 1.72, 0.04, 8)) // 主枝
      for (const sx of [-0.09, 0.09]) { // 双烛枝（外弯）
        const arm = box(0.16, 0.025, 0.025, '#8a6d2e', sx / 2, 1.78, 0.04)
        arm.rotation.z = sx > 0 ? -0.35 : 0.35
        grp.add(arm)
        grp.add(cyl(0.025, 0.02, 0.14, '#e8e0c8', sx, 1.88, 0.04, 6)) // 蜡烛
        grp.add(glow(0.03, 0.07, 0.03, '#ffd9a0', sx, 1.99, 0.04)) // 外焰（暖橙）
        grp.add(glow(0.014, 0.035, 0.014, '#fff4d8', sx, 1.985, 0.04)) // 内芯（亮白）
      }
      flushToWall(grp, s, m, 0.1) // 贴墙（壁挂托座贴墙面；无邻墙则仅旋正）
      break
    }
    case 'graffiti': {
      const d = wallDir(s, m)
      if (d === null) return null // 无墙瓦片不生成（避免悬浮）
      const texs = graffitiTextures()
      const tex = texs[Math.floor(Math.random() * texs.length)]
      const w = 0.55 + Math.random() * 0.45
      const h = w * (0.68 + Math.random() * 0.5)
      const mat = new THREE.MeshLambertMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 0.82 + Math.random() * 0.18 })
      const p = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat)
      const off = 0.015 + Math.random() * 0.008
      const cy = Math.min(wallH - h / 2 - 0.1, 0.8 + Math.random() * 1.0) // 高度 0.8-1.8m
      const lx = (Math.random() - 0.5) * 0.3 // 沿墙横向偏移
      if (d === 0) p.position.set(lx, cy, -0.5 + off)
      else if (d === 2) { p.position.set(lx, cy, 0.5 - off); p.rotation.y = Math.PI }
      else if (d === 3) { p.position.set(-0.5 + off, cy, lx); p.rotation.y = Math.PI / 2 }
      else { p.position.set(0.5 - off, cy, lx); p.rotation.y = -Math.PI / 2 }
      grp.add(p)
      break
    }
    case 'crate': {
      // 真实板条补给箱：独立木板留缝、四角立柱、斜撑、铰链与钉头；共用一张木纹 UV，避免纯色塑料感。
      const crateTex = levelTexture('crate_wood_pine_v3.png', () => noiseTexture('#d9b77d', '#b88b50'))
      const crateMat = litMaterial({ color: '#fff4de', map: crateTex, bumpMap: crateTex, bumpScale: 0.016, roughness: 0.94, envBase: 0.025 })
      const boardGeos: THREE.BufferGeometry[] = []
      const addBoard = (w: number, h: number, d: number, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0, target = boardGeos) => {
        const geo = new THREE.BoxGeometry(w, h, d)
        const uv = geo.attributes.uv as THREE.BufferAttribute
        const nor = geo.attributes.normal
        const per = 0.34
        for (let i = 0; i < uv.count; i++) {
          const nx = Math.abs(nor.getX(i)), ny = Math.abs(nor.getY(i))
          if (ny > 0.5) uv.setXY(i, uv.getX(i) * w / per, uv.getY(i) * d / per)
          else if (nx > 0.5) uv.setXY(i, uv.getX(i) * d / per, uv.getY(i) * h / per)
          else uv.setXY(i, uv.getX(i) * w / per, uv.getY(i) * h / per)
        }
        geo.rotateX(rx); geo.rotateY(ry); geo.rotateZ(rz); geo.translate(x, y, z)
        target.push(geo)
      }

      // 深色内箱只从板条缝中露出，外轮廓完全由真实厚度的木板构成。
      grp.add(box(0.68, 0.5, 0.68, '#24170f', 0, 0.31, 0))
      for (let i = 0; i < 4; i++) {
        const by = 0.105 + i * 0.145
        addBoard(0.76, 0.12, 0.045, 0, by, -0.395)
        addBoard(0.76, 0.12, 0.045, 0, by, 0.395)
        addBoard(0.045, 0.12, 0.76, -0.395, by, 0)
        addBoard(0.045, 0.12, 0.76, 0.395, by, 0)
      }
      for (const px of [-0.385, 0.385]) for (const pz of [-0.385, 0.385])
        addBoard(0.08, 0.66, 0.08, px, 0.33, pz)
      addBoard(0.09, 0.62, 0.038, 0, 0.34, 0.425, 0, 0, -0.72)
      addBoard(0.09, 0.62, 0.038, 0, 0.34, -0.425, 0, 0, 0.72)
      addBoard(0.038, 0.62, 0.09, 0.425, 0.34, 0, -0.72)
      addBoard(0.038, 0.62, 0.09, -0.425, 0.34, 0, 0.72)
      const mergedBoards = mergeGeometries(boardGeos, false)
      if (mergedBoards) grp.add(new THREE.Mesh(mergedBoards, crateMat))

      const metalMat = litMaterial({ color: '#443a2d', roughness: 0.58, metalness: 0.52, envBase: 0.12 })
      const nailGeos: THREE.BufferGeometry[] = []
      for (const py of [0.13, 0.56]) for (const px of [-0.31, 0.31]) for (const pz of [-0.425, 0.425]) {
        const ng = new THREE.CylinderGeometry(0.015, 0.015, 0.014, 8)
        ng.rotateX(Math.PI / 2); ng.translate(px, py, pz); nailGeos.push(ng)
      }
      for (const py of [0.13, 0.56]) for (const pz of [-0.31, 0.31]) for (const px of [-0.425, 0.425]) {
        const ng = new THREE.CylinderGeometry(0.015, 0.015, 0.014, 8)
        ng.rotateZ(Math.PI / 2); ng.translate(px, py, pz); nailGeos.push(ng)
      }
      const mergedNails = mergeGeometries(nailGeos, false)
      if (mergedNails) grp.add(new THREE.Mesh(mergedNails, metalMat))
      for (const px of [-0.25, 0.25]) grp.add(box(0.13, 0.04, 0.055, '#3f372d', px, 0.65, -0.43))

      // 盖板仍以后缘为动画枢轴，但由五块顶板和两条横撑组成。
      const lid = new THREE.Group()
      const lidGeos: THREE.BufferGeometry[] = []
      for (let i = 0; i < 5; i++) addBoard(0.82, 0.055, 0.155, 0, 0.028, 0.08 + i * 0.165, 0, 0, 0, lidGeos)
      addBoard(0.1, 0.075, 0.78, -0.27, 0.085, 0.4, 0, 0, 0, lidGeos)
      addBoard(0.1, 0.075, 0.78, 0.27, 0.085, 0.4, 0, 0, 0, lidGeos)
      const mergedLid = mergeGeometries(lidGeos, false)
      if (mergedLid) lid.add(new THREE.Mesh(mergedLid, crateMat))
      lid.position.set(0, 0.66, -0.42)
      movable(lid, 'lid')
      grp.add(lid)
      if (s.looted) grp.userData.open = 1
      break
    }
    case 'corpse': {
      grp.add(box(0.5, 0.18, 1.2, '#4a4038', 0, 0.09, 0))
      grp.add(box(0.3, 0.14, 0.3, '#8a8078', 0, 0.12, -0.6))
      grp.add(box(0.2, 0.1, 0.5, '#3a332c', 0.15, 0.08, 0.3)) // 伸出的腿
      // 盖布（搜索后掀开：侧滑 + 微倾）
      const sheet = box(0.56, 0.06, 1.0, '#5a5348', 0, 0.2, 0.1)
      movable(sheet, 'lid')
      grp.add(sheet)
      if (s.looted) grp.userData.open = 1
      break
    }
    case 'stairrail':
      return null // v54：oldstairs 井口护栏——仅碰撞（structColliders），可见护栏在出口模型里
    case 'ladder': {
      // v13：攀爬梯直达上层（3.5m 高）；装饰梯保持原样
      const lh = s.data?.climb ? 3.5 : s.h * 1.2
      grp.add(box(0.06, lh, 0.06, '#7a6a4a', -0.25, lh / 2, 0))
      grp.add(box(0.06, lh, 0.06, '#7a6a4a', 0.25, lh / 2, 0))
      for (let i = 0, n = Math.floor(lh / 0.45); i < n; i++) grp.add(box(0.5, 0.05, 0.05, '#6a5a3a', 0, 0.3 + i * 0.45, 0))
      if (s.data?.climb) grp.add(glow(0.3, 0.06, 0.06, '#9adfff', 0, lh - 0.2, 0)) // 顶端微光提示可爬
      break
    }
    case 'lift': {
      // v13 载客电梯：角柱竖井 + 可动轿厢平台（carZ 由引擎驱动）+ 指示灯
      for (const [px, pz] of [[-0.44, -0.44], [0.44, -0.44], [-0.44, 0.44], [0.44, 0.44]] as const)
        grp.add(box(0.09, 5.6, 0.09, '#3a3f45', px, 2.8, pz))
      grp.add(box(1.0, 0.14, 1.0, '#26292e', 0, 5.55, 0)) // 井道顶梁
      const car = new THREE.Group()
      car.add(box(0.92, 0.1, 0.92, '#5a5f66', 0, 0.05, 0)) // 轿厢地板
      car.add(box(0.92, 0.06, 0.92, '#4a4e54', 0, 2.2, 0)) // 轿厢吊顶
      for (const [px, pz] of [[-0.4, -0.4], [0.4, -0.4], [-0.4, 0.4], [0.4, 0.4]] as const)
        car.add(box(0.06, 2.2, 0.06, '#6a6f76', px, 1.1, pz)) // 轿厢立柱
      car.userData.liftCar = 1
      grp.add(car)
      grp.userData.car = car
      grp.add(glow(0.12, 0.24, 0.06, '#9adfff', 0.52, 1.4, 0)) // 呼梯按钮面板
      break
    }
    case 'vent': {
      // 通风口贴墙：与涂鸦同法计算墙面朝向
      const d = wallDir(s, m)
      if (d === null) return null
      const vgrp = new THREE.Group()
      const p = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.5), new THREE.MeshLambertMaterial({ color: '#1c1a18' }))
      vgrp.add(p)
      for (let i = 0; i < 3; i++) vgrp.add(box(0.7, 0.04, 0.02, '#3a3630', 0, -0.15 + i * 0.15, 0.012))
      const off = 0.02
      const vy = Math.random() < 0.5 ? 0.6 : 2.0
      if (d === 0) vgrp.position.set(0, vy, -0.5 + off)
      else if (d === 2) { vgrp.position.set(0, vy, 0.5 - off); vgrp.rotation.y = Math.PI }
      else if (d === 3) { vgrp.position.set(-0.5 + off, vy, 0); vgrp.rotation.y = Math.PI / 2 }
      else { vgrp.position.set(0.5 - off, vy, 0); vgrp.rotation.y = -Math.PI / 2 }
      grp.add(vgrp)
      break
    }
    case 'ceilvent': {
      // v33：自天花板向下伸出的通风管道（Level 1；停电时「手臂」由此伸出猎捕）——少量出现于常规区段
      grp.add(box(0.55, 0.8, 0.55, '#4a4a4e', 0, CH - 0.4, 0)) // 垂下的管体
      grp.add(box(0.64, 0.07, 0.64, '#3a3a3e', 0, CH - 0.83, 0)) // 端口边框
      for (let i = 0; i < 3; i++) grp.add(box(0.5, 0.035, 0.07, '#202023', 0, CH - 0.87, -0.17 + i * 0.17)) // 百叶栅格
      break
    }
    case 'rebar': {
      // 突出墙壁的锈蚀钢筋（L1，wikidot/Fandom：严重生锈，刺伤可致破伤风）——2~3 根锈杆斜出墙面
      const d = wallDir(s, m)
      if (d === null) return null
      const rgrp = new THREE.Group()
      const rr = mulberry(s.x * 31 + s.y * 77)
      const n = 2 + Math.floor(rr() * 2)
      for (let i = 0; i < n; i++) {
        const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.024, 0.5, 6), new THREE.MeshLambertMaterial({ color: i % 2 ? '#6e3a20' : '#7a4a2e' }))
        rod.rotation.x = Math.PI / 2 + (rr() - 0.5) * 0.5 // 斜出墙面
        rod.rotation.z = (rr() - 0.5) * 0.6
        rod.position.set((i - (n - 1) / 2) * 0.14, (rr() - 0.5) * 0.2, 0.18)
        rgrp.add(rod)
      }
      const ry = 0.9 + rr() * 0.8 // 腰到胸口高度（最易划伤过往行人）
      if (d === 0) rgrp.position.set(0, ry, -0.5)
      else if (d === 2) { rgrp.position.set(0, ry, 0.5); rgrp.rotation.y = Math.PI }
      else if (d === 3) { rgrp.position.set(-0.5, ry, 0); rgrp.rotation.y = Math.PI / 2 }
      else { rgrp.position.set(0.5, ry, 0); rgrp.rotation.y = -Math.PI / 2 }
      grp.add(rgrp)
      break
    }
    case 'socket': {
      // 墙上插板（L0 装饰）：米色面板 + 双插孔 + 翘板开关，贴墙朝向与通风口同法
      const d = wallDir(s, m)
      if (d === null) return null
      const sgrp = new THREE.Group()
      sgrp.add(box(0.17, 0.24, 0.03, '#ddd4b8', 0, 0, 0)) // 面板
      sgrp.add(box(0.05, 0.08, 0.014, '#2a2620', -0.04, 0.045, 0.02)) // 上插孔
      sgrp.add(box(0.05, 0.08, 0.014, '#2a2620', 0.04, -0.05, 0.02)) // 下插孔
      sgrp.add(box(0.03, 0.05, 0.02, '#b8ab84', 0.045, 0.05, 0.022)) // 翘板开关
      const off = 0.03
      const sy = 0.35 + mulberry(s.x * 57 + s.y * 91)() * 0.3 // 真实插座离地高度（少量变化）
      if (d === 0) sgrp.position.set(0, sy, -0.5 + off)
      else if (d === 2) { sgrp.position.set(0, sy, 0.5 - off); sgrp.rotation.y = Math.PI }
      else if (d === 3) { sgrp.position.set(-0.5 + off, sy, 0); sgrp.rotation.y = Math.PI / 2 }
      else { sgrp.position.set(0.5 - off, sy, 0); sgrp.rotation.y = -Math.PI / 2 }
      grp.add(sgrp)
      break
    }
    case 'mirror': {
      grp.add(box(1.0, 2.2, 0.08, '#3a1e20', 0, 1.1, 0))
      grp.add(glow(0.8, 1.9, 0.03, '#8a9aa5', 0, 1.15, 0.05))
      break
    }
    case 'hoteldoor': {
      // 据点蓝图门：使用实际门洞长度/轴向，避免旧版固定 1m 门模型猜测墙向。
      if (s.data?.settlementDoor) {
        const axis = s.data.axis === 'y' ? 'y' : 'x'
        const length = Math.max(1, axis === 'x' ? s.w : s.h)
        const height = Math.max(1.8, Number(s.data.height) || 2.35)
        const thickness = 0.12
        const width = Math.max(0.72, length - 0.18)
        grp.rotation.y = axis === 'y' ? Math.PI / 2 : 0
        const frame = s.data.locked ? '#282b30' : '#3d4144'
        grp.add(box(0.14, height, 0.22, frame, -length / 2 + 0.07, height / 2, 0))
        grp.add(box(0.14, height, 0.22, frame, length / 2 - 0.07, height / 2, 0))
        grp.add(box(length, 0.14, 0.22, frame, 0, height - 0.07, 0))
        const panel = box(width, height - 0.12, thickness, s.data.locked ? '#31383d' : '#69706f', 0, 0, 0)
        panel.geometry.translate(s.data.swing === -1 ? -width / 2 : width / 2, (height - 0.12) / 2, 0)
        panel.position.x = s.data.swing === -1 ? width / 2 : -width / 2
        panel.userData.lid = 1
        grp.userData.swing = s.data.swing === -1 ? -1 : 1
        grp.add(panel)
        // 铰链与把手跟随门扇，供既有门动画读取 lid/swing。
        panel.add(box(0.05, 0.16, 0.04, '#a9ada8', s.data.swing === -1 ? 0.03 : width - 0.03, height * 0.52, 0.08))
        panel.add(glow(0.06, 0.06, 0.06, s.data.locked ? '#b6372d' : '#c8a45a', s.data.swing === -1 ? width - 0.12 : 0.12, height * 0.5, 0.08))
        break
      }
      // 可交互房门：门框 + 铰链门板（开门动画见 updateStructs）
      // v9 朝向约定：门板平面与所在墙线平行（水平墙线→面朝南北；垂直墙线→整体旋转 90° 面朝东西）
      // v10 修复：① dbl 双开门两扇镜像（铰链各在外缘、对开）② 开门方向=门洞内侧
      // （连通地板更多的一侧）③ 开门角收敛到 ~89°，门板尖端不再旋入侧墙
      const rot = s.data?.l0Door?Number(s.data.deg??0)*Math.PI/180:doorNeedsRotate(m, s)
      grp.rotation.y = rot
      const ax = Math.floor(s.x + s.w / 2), ay = Math.floor(s.y + s.h / 2)
      // 双开门镜像：搭档位于本体局部 -X 侧时，铰链移到 +X 缘、旋转取反
      let mirror = !!s.data?.l0Door
      if (s.data?.dbl) {
        const dblMate = (tx: number, ty: number) =>
          m.structures.some((o) => o !== s && (o.kind === 'hoteldoor' || o.kind === 'glassdoor') && !!o.data?.dbl
            && Math.floor(o.x + o.w / 2) === tx && Math.floor(o.y + o.h / 2) === ty)
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
          if (!dblMate(ax + dx, ay + dy)) continue
          // 世界偏移 → 门板局部（rot=0 同世界；rot=π/2 时 local(-wz, wx)）
          const lx = rot === 0 ? dx : -dy
          if (lx < 0) mirror = true
          break
        }
      }
      // 开门方向：局部 ±Z 两侧 5×5 连通地板计数，多者=门洞内侧（房间侧），向内开启
      const wzx = rot === 0 ? 0 : 1, wzz = rot === 0 ? 1 : 0 // 局部 +Z 的世界方向
      const floorNear = (sx: number, sz: number) => {
        let n = 0
        for (let j = -2; j <= 2; j++) for (let i = -2; i <= 2; i++) {
          const tx = ax + sx * 2 + i, ty = ay + sz * 2 + j
          if (tx >= 0 && ty >= 0 && tx < m.w && ty < m.h && m.tiles[ty * m.w + tx] === 1) n++
        }
        return n
      }
      // L0 leaves sit at the outer face of the thick jamb and open into the ring.
      const swingIn = s.data?.l0Door ? -1 : floorNear(wzx, wzz) >= floorNear(-wzx, -wzz) ? 1 : -1
      grp.userData.swing = swingIn * (mirror ? -1 : 1)
      // v41：门的颜色/材料各异（L2 废弃公共带：data.hue 0..4 门板/门框配色）
      const HUES: { panel: string; frame: string; inset: string }[] = [
        { panel: '#4a2628', frame: '#2a1516', inset: '#3a1e20' }, // 0 暗红木门（默认）
        { panel: '#3a4a42', frame: '#222e28', inset: '#2c3a32' }, // 1 墨绿金属门
        { panel: '#3e4248', frame: '#26282c', inset: '#32363c' }, // 2 钢灰金属门
        { panel: '#5a4a2e', frame: '#362c1c', inset: '#483a24' }, // 3 赭黄旧木门
        { panel: '#4a3a46', frame: '#2c222a', inset: '#3c2e38' }, // 4 灰紫旧门
      ]
      const sealed = !!s.data?.sealed
      const l2 = _def.id === 2
      const l2Variant=String(s.data?.l2Variant??'tidy'),l2Hue=Number(s.data?.hue??0)
      const doorPaint=l2?l2DoorMaterial(l2Variant,l2Hue):undefined
      const hue = l2 ? { panel: '#c8c7b9', frame: '#8b8d86', inset: '#b9bdba' }
        : sealed ? { panel: '#2e3238', frame: '#1c1e22', inset: '#26282c' } // 锁死：冷灰钢门
        : s.data?.manila ? { panel: '#876647', frame: '#64462e', inset: '#806041' }
          : s.data?.l9 ? { panel: '#5b3b26', frame: '#281b13', inset: '#3c2619' }
          : HUES[typeof s.data?.hue === 'number' ? s.data.hue % HUES.length : 0]
      const slim=!!s.data?.l0Door
      grp.add(box(slim?.045:.14, 2.15, slim?.10:.24, hue.frame, slim?-.5075:-.46, 1.07, 0))
      grp.add(box(slim?.045:.14, 2.15, slim?.10:.24, hue.frame, slim?.5075:.46, 1.07, 0))
      grp.add(box(1.06, slim?.055:.14, slim?.10:.24, hue.frame, 0, slim?2.2425:2.2, 0))
      if(doorPaint)for(const child of grp.children){const mesh=child as THREE.Mesh;if(mesh.isMesh&&!Array.isArray(mesh.material)){mesh.material.dispose();mesh.material=doorPaint}}
      const doorWood=s.data?.l0Door?litMaterial({map:levelTexture('l0-remake/door-wood.png',()=>noiseTexture('#765739','#62472e')),roughness:.76,envBase:.025}):undefined
      const panel = doorWood ? new THREE.Mesh(new THREE.BoxGeometry(.99,2.21,.07),doorWood) : s.data?.manila || s.data?.l9
        ? s.data?.l9
          ? l9PbrBox(.88, 2.1, .07, 'l9_furniture_wood', '#85654c', '#806248', '#433326', .72, .62, .2, .42)
          : texBox(0.88, 2.1, 0.07, 'crate_wood.jpg', '#624126', '#3b2517', '#e1c7a1', 0.72)
        : l2 ? new THREE.Mesh(new THREE.BoxGeometry(.88,2.1,.07),doorPaint) : box(0.88, 2.1, 0.07, hue.panel, 0, 0, 0)
      const halfLeaf=doorWood?.495:.44
      panel.geometry.translate(mirror ? -halfLeaf : halfLeaf, doorWood?1.105:1.05, 0) // 铰链在左缘（镜像=右缘）
      panel.position.set(mirror ? halfLeaf : -halfLeaf, 0, 0)
      panel.userData.lid = 1
      grp.add(panel)
      // 门板嵌板 + 把手（上锁=红，未锁=金；随镜像换侧）
      // v11 修复：嵌板必须挂在 panel（铰链门板）上随门一起旋转——旧版挂在门框 grp 上，
      // 开门后两块嵌板留在门洞半空（「浮空两个长方体」）。
      // panel 网格原点在铰链缘（position.x = ±0.44），子件局部坐标需补偿该偏移；
      // 把手贴在开门侧（leading edge）而非旧版的铰链侧。
      const hingeOff = mirror ? -halfLeaf : halfLeaf // 子件局部 X 补偿：嵌板回到门面中央
      if (l2) addL2DoorDetails(panel, hingeOff, mirror, sealed,l2Variant,l2Hue,doorPaint)
      if (!l2) {
      const knob = glow(0.06, 0.06, 0.1, sealed ? '#3a3f46' : s.data?.locked ? '#c93a2e' : '#b08d46', 0, 0, 0)
      knob.position.set(hingeOff + (mirror ? -0.3 : 0.3), 1.02, 0.05)
      panel.add(knob)
      const knobB = glow(0.06, 0.06, 0.1, sealed ? '#3a3f46' : s.data?.locked ? '#c93a2e' : '#b08d46', 0, 0, 0)
      knobB.position.set(hingeOff + (mirror ? -0.3 : 0.3), 1.02, -0.05) // v54：背面把手（双面可见/可辨）
      panel.add(knobB)
      if(doorWood){
        // Six shallow framed panels on both sides, merged into one moving mesh.
        const panels:THREE.BufferGeometry[]=[]
        for(const z of [-.045,.045])for(const x of [-.19,.19])for(const [y,h]of [[.42,.55],[1.13,.58],[1.78,.40]]){
          const g=new RoundedBoxGeometry(.30,h,.022,1,.009);g.translate(hingeOff+x,y,z);panels.push(g)
        }
        const merged=mergeGeometries(panels);panels.forEach(g=>g.dispose());if(merged)panel.add(new THREE.Mesh(merged,doorWood))
      }else{
      panel.add(box(0.6, 0.8, 0.02, hue.inset, hingeOff, 1.55, 0.045))
      panel.add(box(0.6, 0.5, 0.02, hue.inset, hingeOff, 0.5, 0.045))
      // v54：背面嵌板对称——门板正反两面一致（把手此前已双面）
      panel.add(box(0.6, 0.8, 0.02, hue.inset, hingeOff, 1.55, -0.045))
      panel.add(box(0.6, 0.5, 0.02, hue.inset, hingeOff, 0.5, -0.045))
      }
      if (sealed) {
        // 锁死的门（L2：锁的结构闻所未闻）——门扇焊死：交叉钢条 + 铆钉 + 门缝灌铅
        const bar1 = box(1.0, 0.09, 0.03, '#22252a', hingeOff, 1.05, 0.06)
        bar1.rotation.z = 0.6
        panel.add(bar1)
        const bar2 = box(1.0, 0.09, 0.03, '#22252a', hingeOff, 1.05, 0.06)
        bar2.rotation.z = -0.6
        panel.add(bar2)
        for (const [rx, ry] of [[-0.28, 1.7], [0.28, 1.7], [-0.28, 0.4], [0.28, 0.4]] as const)
          panel.add(glow(0.04, 0.04, 0.02, '#4a4f56', hingeOff + rx, ry, 0.06))
      }
      }
      // v55（任务4）：门楣封墙到顶——门框上沿（2.27m）到本瓦片天花板底面（CH，挑高自适应）之间
      // 补门楣薄墙（墙色 + 顶部暗线），消除门洞上方与天花之间的缺口（多层/挑高区同规则）
      {
        const lintelH = Math.max(0, CH - 2.27)
        if (lintelH > 0.01 && !s.data?.l0Door) {
          if(l2){
            const lintel=new THREE.Mesh(new THREE.BoxGeometry(1.06,lintelH,.24),l2Material(l2Variant,'wall'))
            lintel.position.y=2.27+lintelH/2;grp.add(lintel)
          }else{
          grp.add(box(1.06, lintelH, 0.24, s.data?.l7porch ? '#565c62' : _def.palette.wall, 0, 2.27 + lintelH / 2, 0))
          grp.add(box(1.06, 0.05, 0.26, s.data?.l7porch ? '#6d737a' : _def.palette.wallTop, 0, CH - 0.03, 0)) // 顶线
          }
        }
      }
      if (s.data?.l0Door) {for(const child of grp.children)child.position.z-=.44;grp.scale.x *= Math.max(s.w,s.h) / 1.06;grp.scale.y *= 2.13 / 2.27}
      break
    }
    case 'windowblack': case 'windowtrap': case 'hotelwindow': {
      // 窗户（贴墙）：L4 涂黑=安全 / L4 未涂黑=陷阱（隐约的脸）/ L5 酒店窗
      const d = wallDir(s, m)
      if (d === null) return null
      const wgrp = new THREE.Group()
      const frame = s.kind === 'hotelwindow' ? '#8a6d2e' : '#3a352e'
      wgrp.add(box(0.9, 1.3, 0.06, frame, 0, 0, 0))
      if (s.kind === 'windowblack') {
        wgrp.add(box(0.76, 1.16, 0.03, '#050505', 0, 0, 0.02)) // 涂黑玻璃
      } else if (s.kind === 'windowtrap') {
        wgrp.add(box(0.76, 1.16, 0.03, '#0c1014', 0, 0, 0.02))
        if (!s.data?.triggered) {
          // 玻璃后隐约的「脸」（陷阱提示，极暗）
          wgrp.add(glow(0.05, 0.05, 0.02, '#3a4438', -0.09, 0.12, 0.045))
          wgrp.add(glow(0.05, 0.05, 0.02, '#3a4438', 0.09, 0.12, 0.045))
        }
      } else {
        // 酒店窗：夜景玻璃 + 十字窗棂
        wgrp.add(box(0.76, 1.16, 0.03, '#101820', 0, 0, 0.02))
        wgrp.add(box(0.04, 1.16, 0.04, frame, 0, 0, 0.04))
        wgrp.add(box(0.76, 0.04, 0.04, frame, 0, 0, 0.04))
        wgrp.add(glow(0.1, 0.08, 0.02, '#2a3a4a', -0.2, 0.3, 0.045)) // 远处「城市」光点
      }
      const off = 0.04
      const wy = 1.45
      if (d === 0) wgrp.position.set(0, wy, -0.5 + off)
      else if (d === 2) { wgrp.position.set(0, wy, 0.5 - off); wgrp.rotation.y = Math.PI }
      else if (d === 3) { wgrp.position.set(-0.5 + off, wy, 0); wgrp.rotation.y = Math.PI / 2 }
      else { wgrp.position.set(0.5 - off, wy, 0); wgrp.rotation.y = -Math.PI / 2 }
      grp.add(wgrp)
      break
    }
    case 'table': {
      // 马尼拉室木椅；fallen 变体绕底部侧翻，仍保持模型最低点贴地。
      // v57m：L7 金属舱体的小咖啡桌与椅子为锈蚀钢材（data.cabin）
      const cabinTable = s.data?.cabin === 1
      if (s.data?.chair) {
        const chair = new THREE.Group()
        if (cabinTable) {
          chair.add(box(0.42, 0.045, 0.42, '#50575d', 0, 0.45, 0))
          chair.add(box(0.42, 0.5, 0.05, '#464c52', 0, 0.7, -0.19))
          for (const [cx2, cz2] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const)
            chair.add(box(0.05, 0.45, 0.05, '#5d646b', cx2 * 0.17, 0.22, cz2 * 0.17))
          chair.add(glow(0.04, 0.04, 0.02, '#8a9096', 0, 0.72, -0.18))
        } else if (s.data?.l0Furniture) {
          const timber=litMaterial({map:levelTexture('l0-remake/wood.png',()=>noiseTexture('#865d36','#4c301c')),color:'#ead3b5',roughness:.72,envBase:.045})
          const seat=new THREE.Mesh(new THREE.CylinderGeometry(.245,.235,.045,12),timber);seat.scale.z=.85;seat.position.y=.46;chair.add(seat)
          for(const x of [-.18,.18])for(const z of [-.16,.16]){const leg=new THREE.Mesh(new THREE.CylinderGeometry(.023,.017,.44,6),timber);leg.position.set(x,.22,z);leg.rotation.z=-x*.25;chair.add(leg)}
          for(const x of [-.19,.19]){const post=new THREE.Mesh(new THREE.CylinderGeometry(.019,.022,.54,6),timber);post.position.set(x,.74,-.17);chair.add(post)}
          for(const x of [-.12,-.06,0,.06,.12]){const spindle=new THREE.Mesh(new THREE.CylinderGeometry(.011,.012,.40,5),timber);spindle.position.set(x,.72,-.20-Math.sqrt(.05-x*x)*.1);chair.add(spindle)}
          const bow=new THREE.CatmullRomCurve3([new THREE.Vector3(-.20,.97,-.17),new THREE.Vector3(-.12,1.025,-.22),new THREE.Vector3(0,1.04,-.24),new THREE.Vector3(.12,1.025,-.22),new THREE.Vector3(.20,.97,-.17)])
          chair.add(new THREE.Mesh(new THREE.TubeGeometry(bow,10,.025,5,false),timber))
          for(const z of [-.16,.16]){const rung=new THREE.Mesh(new THREE.CylinderGeometry(.012,.012,.36,5),timber);rung.rotation.z=Math.PI/2;rung.position.set(0,.18,z);chair.add(rung)}
        } else {
          chair.add(texBox(0.42, 0.05, 0.42, 'crate_wood.jpg', '#6a4b31', '#3c291d', '#9a7854', 0.5, 0, 0.45, 0))
          chair.add(texBox(0.42, 0.52, 0.05, 'crate_wood.jpg', '#6a4b31', '#3c291d', '#8e6c49', 0.5, 0, 0.7, -0.19))
          for (const [cx2, cz2] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const)
            chair.add(texBox(0.05, 0.45, 0.05, 'crate_wood.jpg', '#5a3c28', '#342219', '#82613f', 0.5, cx2 * 0.17, 0.22, cz2 * 0.17))
        }
        if (s.data?.l0Furniture && !s.data?.fallen) chair.scale.y = 1.17
        chair.rotation.y = ((Number(s.data?.deg) || 0) * Math.PI) / 180
        if (s.data?.fallen) { chair.rotation.z = Math.PI / 2; chair.position.y = 0.23 }
        grp.add(chair)
        break
      }
      if (cabinTable) {
        grp.add(box(s.w * 0.82, 0.055, s.h * 0.76, '#555c62', 0, 0.72, 0))
        grp.add(box(s.w * 0.7, 0.015, s.h * 0.64, '#3f4449', 0, 0.755, 0))
        for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const)
          grp.add(box(0.07, 0.72, 0.07, '#494f55', sx * (s.w * 0.36), 0.36, sz * (s.h * 0.3)))
        grp.add(box(s.w * 0.1, 0.02, 0.02, '#8a9096', 0, 0.58, 0))
      } else {
        grp.add(box(s.w * 0.85, 0.06, s.h * 0.8, '#4a3a2a', 0, 0.72, 0))
        for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const)
          grp.add(box(0.07, 0.72, 0.07, '#3a2e22', sx * (s.w * 0.38), 0.36, sz * (s.h * 0.32)))
      }
      if (_def.id === 5 && !s.data?.manila) {
        // v55（任务7）：L5 古典雕花木桌——深色胡桃木 + 弯腿（外撇）+ 雕花桌沿 + 金色束线（观感替换，轮廓/碰撞不变）
        const wood = '#3e2418', woodD = '#2a1610', gold = '#b8924a'
        grp.add(box(s.w * 0.88, 0.05, s.h * 0.84, woodD, 0, 0.68, 0)) // 雕花桌沿（略大于桌面）
        grp.add(box(s.w * 0.86, 0.02, s.h * 0.82, gold, 0, 0.755, 0)) // 桌面金线沿
        for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
          const leg = box(0.08, 0.5, 0.08, wood, sx * (s.w * 0.36), 0.44, sz * (s.h * 0.3))
          leg.rotation.z = -sx * 0.12 // 弯腿外撇
          leg.rotation.x = sz * 0.12
          grp.add(leg)
          grp.add(box(0.1, 0.06, 0.1, woodD, sx * (s.w * 0.4), 0.1, sz * (s.h * 0.34))) // 蹄形脚
        }
        grp.add(box(s.w * 0.6, 0.08, 0.04, wood, 0, 0.3, s.h * 0.3)) // 横枨（前后）
        grp.add(box(s.w * 0.6, 0.08, 0.04, wood, 0, 0.3, -s.h * 0.3))
        if (s.data?.vase) { // 桌上花瓶（任务9：主厅小件装饰——细颈瓶 + 两枝斜出花枝）
          grp.add(cyl(0.05, 0.08, 0.2, '#8a4a52', 0.18, 0.85, -0.1, 10)) // 瓶身
          grp.add(cyl(0.02, 0.04, 0.1, '#9a5a62', 0.18, 1.0, -0.1, 8)) // 细颈
          for (const [fa, fl] of [[0.5, 0.34], [-0.9, 0.28]] as const) {
            const stem = box(0.015, fl, 0.015, '#3e5a2a', 0.18 + Math.sin(fa) * 0.08, 1.05 + fl / 2, -0.1 + Math.cos(fa) * 0.06)
            stem.rotation.z = Math.sin(fa) * 0.5
            grp.add(stem)
            grp.add(box(0.06, 0.05, 0.06, '#c98a92', 0.18 + Math.sin(fa) * 0.17, 1.08 + fl, -0.1 + Math.cos(fa) * 0.12)) // 花
          }
        }
        if (s.data?.drink) { // 桌上饮料（任务20：休息室茶几——取走[data.searched]后渲染层隐藏）
          const dg = new THREE.Group()
          dg.add(cyl(0.04, 0.05, 0.22, '#7a5a2a', -0.16, 0.87, 0.08, 8)) // 琥珀瓶
          dg.add(cyl(0.014, 0.02, 0.07, '#7a5a2a', -0.16, 1.01, 0.08, 6))
          dg.add(cyl(0.035, 0.045, 0.18, '#3a5a3a', 0.14, 0.85, -0.12, 8)) // 绿瓶
          dg.add(cyl(0.012, 0.018, 0.06, '#3a5a3a', 0.14, 0.97, -0.12, 6))
          dg.visible = s.data?.searched !== 1
          grp.add(dg)
          grp.userData.drinkGrp = dg
        }
      }
      if (s.data?.manila) {
        grp.add(box(0.3, 0.03, 0.22, '#e5c88f', -0.08, 0.765, 0.04))      // M.E.G. 文件夹（马尼拉纸）
        grp.add(box(0.3, 0.02, 0.22, '#dcbd7e', 0.06, 0.79, -0.05))
        grp.add(box(0.08, 0.005, 0.08, '#6a5a3a', 0.06, 0.802, -0.05))    // 徽记
      } else if (s.w >= 2) grp.add(box(0.4, 0.05, 0.3, '#d8cfc0', 0.2, 0.77, 0)) // 桌布/托盘
      break
    }
    case 'chandelier': {
      // L5 水晶吊灯（v55 细化：三层金环塔身 + 双层水晶挂坠 + 垂珠链 + 中央水晶球；
      // v55b：吊链收短——灯具主体上移贴近顶面[挑高区贴 tallCeilH]，三层金环/挂坠相对顶面定位）
      const gold = '#b08d46', crys = '#ffe9c0'
      const y0 = CH - 0.55 // 顶层金环高度（主体贴顶）
      grp.add(cyl(0.03, 0.03, 0.34, '#8a6d2e', 0, CH - 0.17, 0)) // 短吊链
      grp.add(cyl(0.06, 0.1, 0.16, gold, 0, CH - 0.08, 0, 8)) // 链脚钟罩
      grp.add(cyl(0.05, 0.05, 0.7, gold, 0, y0 - 0.15, 0, 8)) // 中柱
      grp.add(cyl(0.5, 0.62, 0.22, gold, 0, y0, 0, 12)) // 顶层金环（大）
      grp.add(cyl(0.3, 0.42, 0.18, gold, 0, y0 - 0.2, 0, 10)) // 中层金环
      grp.add(cyl(0.14, 0.24, 0.12, gold, 0, y0 - 0.38, 0, 8)) // 底层金环（小）
      for (let i = 0; i < 10; i++) { // 外层水晶挂坠（垂链 + 坠珠）
        const a = (i / 10) * Math.PI * 2
        const px = Math.cos(a) * 0.56, pz = Math.sin(a) * 0.56
        grp.add(box(0.012, 0.12, 0.012, gold, px, y0 - 0.18, pz))
        grp.add(glow(0.05, 0.14, 0.05, crys, px, y0 - 0.3, pz))
      }
      for (let i = 0; i < 6; i++) { // 内层水晶挂坠
        const a = (i / 6) * Math.PI * 2 + 0.3
        grp.add(glow(0.04, 0.11, 0.04, crys, Math.cos(a) * 0.33, y0 - 0.42, Math.sin(a) * 0.33))
      }
      grp.add(glow(0.36, 0.16, 0.36, '#ffd9a0', 0, y0 - 0.32, 0)) // 中央灯盘
      grp.add(glow(0.09, 0.14, 0.09, crys, 0, y0 - 0.58, 0)) // 底部垂珠
      break
    }
    case 'hanglight': {
      // L0 荧光灯吊线版：吊线 + 灯管（红色变种供红房间）（v26：吊线顶端贴合本瓦片天花板底面）
      // v57m：L7 金属舱室的吊灯会从 7m 高的舱顶垂到居住高度（data.cabin）
      const c = s.data?.red ? '#ff5a4a' : '#e8e2c8'
      const drop = s.data?.cabin ? Math.max(0.35, CH - 2.05) : 0.45 // v57s：入口房间吊灯吊线更短
      const wireY = CH - drop / 2
      const lampY = CH - drop - 0.22
      grp.add(box(0.02, drop, 0.02, '#3a3630', -0.25, wireY, 0))
      grp.add(box(0.02, drop, 0.02, '#3a3630', 0.25, wireY, 0))
      if (s.data?.cabin) {
        grp.add(box(1.0, 0.1, 0.24, '#4a4e52', 0, lampY + 0.05, 0))
        grp.add(box(0.92, 0.03, 0.18, '#313438', 0, lampY - 0.02, 0))
      }
      grp.add(glow(0.95, 0.07, 0.2, c, 0, lampY, 0))
      grp.rotation.z = (mulberry(s.x * 131 + s.y * 17)() - 0.5) * 0.12 // 轻微歪斜
      break
    }
    case 'dresser': {
      if (s.data?.manilaTable) {
        // 八角会合桌 + 桌下橱柜（结构本身仍登记为 dresser，以沿用搜索/掉落/持久化流程）。
        const woodTex = levelTexture('l0-remake/wood.png', () => noiseTexture('#765034', '#452c1d'))
        const woodMat = litMaterial({ color: '#dfc6a8', map: woodTex, bumpMap: woodTex, bumpScale: 0.012, roughness: 0.78, envBase: 0.045 })
        const top = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 0.1, 8), woodMat)
        top.position.y = 0.82
        top.rotation.y = Math.PI / 8
        grp.add(top)
        const base = new THREE.Mesh(new THREE.CylinderGeometry(0.70, 0.73, 0.68, 8), woodMat)
        base.position.y = 0.37
        base.rotation.y = Math.PI / 8
        grp.add(base)
        for(const y of [.09,.74]){const rim=new THREE.Mesh(new THREE.CylinderGeometry(.755,.755,.045,8),woodMat);rim.position.y=y;rim.rotation.y=Math.PI/8;grp.add(rim)}
        for(let i=0;i<8;i++){const angle=(i+.5)*Math.PI/4;const stile=new THREE.Mesh(new THREE.BoxGeometry(.035,.57,.035),woodMat);stile.position.set(Math.sin(angle)*.705,.41,Math.cos(angle)*.705);grp.add(stile)}
        grp.add(texBox(1.18, 0.08, 0.62, 'crate_wood.jpg', '#654228', '#3d281a', '#755337', 0.72, 0, 0.08, 0))
        // 面向 +Z 的双开橱柜门，搜索后由统一容器动画向两侧外摆。
        for (const sgn of [-1, 1]) {
          const door = texBox(0.55, 0.54, 0.045, 'l0-remake/wood.png', '#704a2d', '#412819', '#d4b08b', 0.55)
          door.geometry.translate(-sgn * 0.275, 0.27, 0)
          door.position.set(sgn * 0.55, 0.14, 0.69)
          door.add(box(.43,.38,.02,'#785033',-sgn*.275,.27,.033))
          door.add(box(0.035, 0.035, 0.025, '#b08d46', -sgn * 0.49, 0.30, 0.055))
          movable(door, sgn < 0 ? 'doorL' : 'doorR')
          grp.add(door)
        }
        grp.rotation.y=Math.PI
        if(s.data?.l0Furniture)grp.scale.set(.7,1.1,.7)
        else grp.scale.set(.85,1.25,.85)
        if (s.looted) grp.userData.open = 1
        break
      }
      // 柜子（可搜索容器）：抽屉柜（v54：三层抽屉依次抽出，替代旧侧门旋开）
      grp.add(box(0.85, 1.15, 0.5, '#4a2e22', 0, 0.58, 0))
      for (let i = 0; i < 3; i++) {
        const drawer = box(0.7, 0.26, 0.06, '#5a3a2a', 0, 0.25 + i * 0.32, 0.25)
        drawer.add(glow(0.08, 0.03, 0.02, '#b08d46', 0, 0, 0.04)) // 拉手（随抽屉）
        // v54：抽屉盒体（五面浅盒 + 内衬色）——随抽面一起滑出，半开位悬在柜体前可见；关闭时收在柜体轮廓内
        drawer.add(box(0.64, 0.03, 0.36, '#4a3020', 0, -0.1, -0.2))  // 底板
        drawer.add(box(0.03, 0.15, 0.36, '#4a3020', -0.32, -0.03, -0.2)) // 侧板
        drawer.add(box(0.03, 0.15, 0.36, '#4a3020', 0.32, -0.03, -0.2))
        drawer.add(box(0.64, 0.15, 0.03, '#4a3020', 0, -0.03, -0.37)) // 背板
        drawer.add(box(0.58, 0.02, 0.3, '#8a5a3a', 0, -0.08, -0.2))  // 内衬
        movable(drawer, 'drawer', i)
        grp.add(drawer)
      }
      if (s.looted) grp.userData.open = 1
      // v48 缺省朝向：背贴最近墙、抽屉面（+Z）朝外；data.deg 可显式覆盖；v51 贴墙位移
      if (s.data?.deg !== undefined) grp.rotation.y = ((Number(s.data.deg) || 0) * Math.PI) / 180
      else flushToWall(grp, s, m, 0.5)
      break
    }
    case 'arch': {
      // L0 拱厅模块：连续半高隔墙、真正的半圆拱洞与贴墙纸的分隔壁柱。
      const span = Math.max(2.6, s.w)
      const sillH = 0.78
      const radius = Math.min(1.14, span / 2 - 0.27)
      const springY = Math.min(H - 0.48, 1.58)
      const shell = new THREE.Shape()
      shell.moveTo(-span / 2, 0)
      shell.lineTo(span / 2, 0)
      shell.lineTo(span / 2, H)
      shell.lineTo(-span / 2, H)
      shell.closePath()
      const opening = new THREE.Path()
      opening.moveTo(-radius, sillH)
      opening.lineTo(radius, sillH)
      opening.lineTo(radius, springY)
      opening.absarc(0, springY, radius, 0, Math.PI, false)
      opening.lineTo(-radius, sillH)
      opening.closePath()
      shell.holes.push(opening)
      const archGeo = new THREE.ExtrudeGeometry(shell, { depth: 0.2, bevelEnabled: false, curveSegments: 18 })
      archGeo.translate(0, 0, -0.1)
      const archMat = litMaterial({ color: '#e7dfb8', roughness: 0.96, envBase: 0.025 })
      grp.add(new THREE.Mesh(archGeo, archMat))
      // 侧柱直接属于同一挤出壳体；不再叠放墙纸盒，消除共面穿插造成的闪烁。
      grp.add(box(radius * 2 + 0.12, 0.075, 0.3, '#c4b878', 0, sillH + 0.035, 0))
      const trim = new THREE.Mesh(
        new THREE.TorusGeometry(radius, 0.055, 8, 28, Math.PI),
        litMaterial({ color: '#d3c782', roughness: 0.82, envBase: 0.045 }),
      )
      trim.position.set(0, springY, 0.115)
      grp.add(trim)
      grp.add(box(span, 0.12, 0.26, '#b5aa70', 0, 0.06, 0))
      break
    }
    case 'maingen': {
      // L3 主发电机（大型）：基座 + 双转鼓 + 指示灯（v41：data.dead=废弃状态，指示灯全灭、机身暗色）
      const dead = !!s.data?.dead
      grp.add(box(s.w * 0.92, 1.2, s.h * 0.9, dead ? '#22252a' : '#2e3238', 0, 0.6, 0))
      const d1 = cyl(0.55, 0.55, s.w * 0.6, dead ? '#2b2e33' : '#3a3f46', -s.w * 0.18, 1.7, 0, 12)
      d1.rotation.z = Math.PI / 2
      grp.add(d1)
      const d2 = cyl(0.45, 0.45, s.w * 0.45, dead ? '#1c1e22' : '#26282c', s.w * 0.22, 1.6, 0.4, 10)
      d2.rotation.z = Math.PI / 2
      grp.add(d2)
      grp.add(box(s.w * 0.95, 0.2, s.h * 0.95, '#1c1e22', 0, 0.1, 0))
      if (!dead)
        for (let i = 0; i < 4; i++)
          grp.add(glow(0.12, 0.08, 0.04, i % 2 ? '#6f9a55' : '#9adfff', -s.w * 0.3 + i * 0.3, 1.0, s.h * 0.46))
      grp.add(glow(0.3, 0.14, 0.05, '#d9b13b', s.w * 0.32, 1.3, s.h * 0.46))
      // v54：机组结构补全——主转鼓散热片组 + 双鼓联轴节 + 侧挂控制箱（含指示灯/垂线）
      for (let i = 0; i < 6; i++)
        grp.add(box(0.05, 1.24, 1.24, dead ? '#2b2e33' : '#454a51', -s.w * 0.43 + i * s.w * 0.1, 1.7, 0)) // 散热片
      const coup = cyl(0.16, 0.16, 0.24, dead ? '#1c1e22' : '#2a2d33', s.w * 0.08, 1.62, 0.28, 10) // 联轴节
      coup.rotation.z = Math.PI / 2
      grp.add(coup)
      grp.add(box(0.5, 0.7, 0.3, dead ? '#22252a' : '#26282c', s.w * 0.38, 0.95, -s.h * 0.3)) // 控制箱
      if (!dead) for (let i = 0; i < 2; i++)
        grp.add(glow(0.05, 0.05, 0.03, i ? '#e8b93c' : '#6f9a55', s.w * 0.38 - 0.06 + i * 0.12, 1.1, -s.h * 0.3 + 0.16))
      grp.add(cyl(0.03, 0.03, 0.9, '#15181c', s.w * 0.38, 0.45, -s.h * 0.3, 6)) // 控制箱垂线
      break
    }
    case 'machinewall': {
      if(_def.id===2){grp.add(buildL2Machine(s));break}
      // v42：代墙大型机器（task 9）——整段墙面化身工业设备，凸出墙面但不占廊道净空（落在墙线瓦片，段旁禁门）。
      // data.mv：0=锅炉 1=发电机组 2=主发电机 3=机柜排 4=变压器；data.dead=废弃态（暗色/不发光）
      const dead = !!s.data?.dead
      const mv = Number(s.data?.mv ?? 0)
      const dir = Number(s.data?.side ?? 0) === 1 ? -1 : 1 // 朝廊道方向（西墙线→+x）
      const fx = (d: number) => dir * (0.5 + d) // 自墙面凸出
      if (mv === 0) {
        // 锅炉墙：卧式铆接罐 + 直通天花板的烟囱 + 炉口微光
        const tank = cyl(0.42, 0.46, 0.98, dead ? '#332c26' : '#4a3f35', fx(0.34), 1.35, 0, 12)
        tank.rotation.x = Math.PI / 2
        grp.add(tank)
        for (const zz of [-0.3, 0.3]) { // 铆接环带
          const band = cyl(0.44, 0.44, 0.08, dead ? '#2b251f' : '#5a4c40', fx(0.34), 1.35, zz, 12)
          band.rotation.x = Math.PI / 2
          grp.add(band)
        }
        grp.add(cyl(0.12, 0.14, H - 1.6, dead ? '#3a2e24' : '#6e4630', fx(0.3), 1.6 + (H - 1.6) / 2, 0.2)) // 烟囱入顶
        if (!dead) grp.add(glow(0.3, 0.2, 0.04, '#ff6a3a', fx(0.62), 0.6, 0)) // 炉口
        else grp.add(box(0.3, 0.2, 0.04, '#1c1814', fx(0.62), 0.6, 0))
      } else if (mv === 1) {
        // 发电机组墙：箱体 + 顶部转鼓 + 指示灯
        grp.add(box(0.5, 1.5, 0.95, dead ? '#23262b' : '#3a3f46', fx(0.25), 0.75, 0))
        const drum = cyl(0.28, 0.28, 0.8, dead ? '#1e2126' : '#2e3238', fx(0.28), 1.72, 0, 10)
        drum.rotation.x = Math.PI / 2
        grp.add(drum)
        for (let i = 0; i < 3; i++)
          grp.add(glow(0.07, 0.07, 0.03, dead ? '#2a2d33' : i % 2 ? '#6f9a55' : '#9adfff', fx(0.44), 1.1 + i * 0.18, -0.3))
      } else if (mv === 2) {
        // 主发电机墙：基座 + 双转鼓 + 黄铭牌
        grp.add(box(0.56, 0.24, 0.98, '#1c1e22', fx(0.28), 0.12, 0))
        grp.add(box(0.5, 1.1, 0.9, dead ? '#22252a' : '#2e3238', fx(0.25), 0.8, 0))
        const d1 = cyl(0.36, 0.36, 0.86, dead ? '#2b2e33' : '#3a3f46', fx(0.3), 1.62, -0.05, 12)
        d1.rotation.x = Math.PI / 2
        grp.add(d1)
        const d2 = cyl(0.26, 0.26, 0.7, dead ? '#1c1e22' : '#26282c', fx(0.26), 1.5, 0.3, 10)
        d2.rotation.x = Math.PI / 2
        grp.add(d2)
        grp.add(box(0.02, 0.3, 0.4, '#d9b13b', fx(0.51), 1.0, 0.2)) // 铭牌
        if (!dead) for (let i = 0; i < 3; i++) grp.add(glow(0.08, 0.06, 0.03, i % 2 ? '#6f9a55' : '#9adfff', fx(0.46), 0.6 + i * 0.16, -0.32))
      } else if (mv === 3) {
        // 机柜排墙：两台高机柜 + 散热栅 + 指示灯
        for (const zz of [-0.24, 0.24]) {
          grp.add(box(0.44, 2.2, 0.42, dead ? '#26282c' : '#3a3f46', fx(0.22), 1.1, zz))
          for (let i = 0; i < 5; i++) grp.add(box(0.02, 0.03, 0.3, dead ? '#1c1e22' : '#2b2e33', fx(0.45), 0.5 + i * 0.16, zz)) // 散热栅
          grp.add(glow(0.06, 0.06, 0.03, dead ? '#2a2d33' : '#6f9a55', fx(0.45), 1.95, zz - 0.1))
        }
      } else {
        // 变压器墙：三柱线圈 + 绝缘子盘 + 顶部母排
        for (const zz of [-0.3, 0, 0.3]) {
          grp.add(cyl(0.11, 0.13, 1.5, dead ? '#332c26' : '#5a4632', fx(0.3), 0.95, zz, 8))
          for (let i = 0; i < 3; i++) grp.add(cyl(0.16, 0.16, 0.04, dead ? '#4a4440' : '#8a8a8a', fx(0.3), 1.55 + i * 0.14, zz, 8)) // 绝缘子盘
        }
        grp.add(box(0.06, 0.08, 0.98, dead ? '#3a352e' : '#7a5a2e', fx(0.3), 2.1, 0)) // 母排
        if (!dead) grp.add(glow(0.05, 0.05, 0.03, '#9adfff', fx(0.42), 1.9, 0))
      }
      break
    }

    // ===== v43：办公区EL3A 仓储家具 =====
    case 'pallet': {
      // 木托盘堆（仓库装饰，非容器）：木托盘（垫木 + 面板缝）+ 缠绕膜包裹的箱堆（半透膜 + 内箱）
      const wood = '#8a6f46', woodD = '#6f5836'
      for (const lx of [-0.32, 0, 0.32]) grp.add(box(0.14, 0.09, 0.8, woodD, lx, 0.045, 0)) // 三条垫木
      for (const lz of [-0.3, -0.1, 0.1, 0.3]) grp.add(box(0.84, 0.03, 0.14, wood, 0, 0.105, lz)) // 面板（留缝）
      // 缠绕膜包裹的箱堆：内层两只错位纸箱 + 外层半透明膜（微微发亮）
      const rng = mulberry((Math.floor(s.x) * 73856093) ^ (Math.floor(s.y) * 19349663) ^ 0x9a11)
      const b1 = box(0.62, 0.42, 0.62, '#a08653', -0.04, 0.33, 0.03)
      b1.rotation.y = (rng() - 0.5) * 0.14
      grp.add(b1)
      const b2 = box(0.5, 0.34, 0.5, '#96784a', 0.05, 0.71, -0.04)
      b2.rotation.y = (rng() - 0.5) * 0.3
      grp.add(b2)
      const wrap = new THREE.Mesh(
        new THREE.BoxGeometry(0.76, 0.92, 0.76),
        new THREE.MeshLambertMaterial({ color: '#cfd8dc', transparent: true, opacity: 0.28 }),
      )
      wrap.position.y = 0.58
      grp.add(wrap)
      grp.add(box(0.77, 0.05, 0.77, '#e8ecee', 0, 0.3, 0)) // 膜束腰亮纹
      break
    }
    case 'handrail': {
      // 扶手栏杆（夹楼内缘/阶梯两侧，非实心）：两根立柱 + 顶部扶手 + 中间横杆；
      // 默认贴在瓦片 +z 边缘（面向中庭/坡道），data.deg 绕 Y 旋转（0=+z 90=+x 180=-z 270=-x）
      const metal = '#5a6367', metalD = '#464e52'
      const h0 = s.data?.h0 !== undefined ? Number(s.data.h0) : null
      const h1 = s.data?.h1 !== undefined ? Number(s.data.h1) : null
      if (h0 !== null && h1 !== null) {
        // v49 斜扶手（阶梯两侧）：随坡道倾斜——h0/h1=坡道面在本瓦片局部 -x/+x 端的高度
        // （相对结构底座：1F 段相对地面 0，2F 侧挡段相对上层地板 3.0，可为负下探到坡道面）；
        // 立柱立于坡道面，扶手/横杆绕 Z 旋转对齐坡角，逐级衔接落地端与落梯口
        const post = (px: number, hBase: number) => {
          const bot = Math.min(hBase, 0), top = hBase + 1.0
          grp.add(cyl(0.025, 0.03, top - bot, metalD, px, (top + bot) / 2, 0.42, 8)) // 立柱（立于坡道面）
          grp.add(cyl(0.05, 0.05, 0.02, metalD, px, bot + 0.01, 0.42, 8)) // 底座片
        }
        post(-0.42, h0); post(0.42, h1)
        const rail = (rh: number, r: number) => {
          const y0 = h0 + rh, y1 = h1 + rh
          const g = cyl(r, r, Math.hypot(0.98, y1 - y0), metal, 0, (y0 + y1) / 2, 0.42, 8)
          g.rotation.z = Math.PI / 2 + Math.atan2(y1 - y0, 0.98) // 旋转对齐坡角（β=0 时退化为水平）
          grp.add(g)
        }
        rail(1.0, 0.03) // 顶部扶手（坡道面上方 1.0m）
        rail(0.55, 0.018) // 中间横杆
      } else {
        for (const px of [-0.42, 0.42]) {
          grp.add(cyl(0.025, 0.03, 1.0, metalD, px, 0.5, 0.42, 8)) // 立柱
          grp.add(cyl(0.05, 0.05, 0.02, metalD, px, 0.01, 0.42, 8)) // 底座片
        }
        grp.add(cyl(0.03, 0.03, 0.98, metal, 0, 1.0, 0.42, 8).rotateZ(Math.PI / 2)) // 顶部扶手
        grp.add(cyl(0.018, 0.018, 0.9, metal, 0, 0.55, 0.42, 8).rotateZ(Math.PI / 2)) // 中间横杆
      }
      grp.rotation.y = ((Number(s.data?.deg) || 0) * Math.PI) / 180
      break
    }
    case 'walllamp': {
      // v46：壁挂斜照大灯（EL3A 挑高仓库区照明）——墙面背板 + 斜臂 + 下倾灯箱体 +
      // 斜向下自发光灯板；配套光源由生成器以 fixZ 放置（灯具贴墙，不再悬空）
      const inner = new THREE.Group()
      grp.add(inner)
      inner.add(box(0.6, 0.52, 0.06, '#34383e', 0, 2.28, 0)) // 墙面背板
      inner.add(box(0.07, 0.07, 0.3, '#464e52', 0, 2.44, 0.17)) // 斜臂
      const housing = new THREE.Group()
      housing.position.set(0, 2.3, 0.33)
      housing.rotation.x = 0.62 // 下倾 ~35°（灯光斜投向地面作业区）
      housing.add(box(0.64, 0.3, 0.36, '#49505a', 0, 0, 0)) // 灯箱体
      housing.add(glow(0.52, 0.03, 0.26, '#fff2d8', 0, -0.165, 0)) // 斜向下灯板
      inner.add(housing)
      mountOnWall(inner, grp, s, m) // 强制贴最近墙（含虚空墙），不浮空
      break
    }
    // ===== v51：Level 3 发电站无限化重制 =====
    case 'barfence': {
      // 铁栅栏（封死整段廊道：无门、不可破坏、不可通行；栅栏另一侧可见不可达）——
      // 竖条 + 三条横档 + 上下框，暗锈金属，满墙高
      const bw = s.w, bars = '#3a332c', rails = '#57483a'
      const n = Math.max(2, Math.round(bw / 0.13))
      for (let i = 0; i <= n; i++) {
        const bx = -bw / 2 + (i * bw) / n
        grp.add(box(0.032, H, 0.032, bars, bx, H / 2, 0))
      }
      for (const ry of [H * 0.22, H * 0.52, H * 0.82])
        grp.add(box(bw, 0.07, 0.05, rails, 0, ry, 0))
      grp.add(box(bw, 0.12, 0.09, '#4a3f34', 0, H - 0.06, 0)) // 上框
      grp.add(box(bw, 0.12, 0.09, '#4a3f34', 0, 0.06, 0)) // 下框
      if (s.data?.rot) grp.rotation.y = Math.PI / 2 // v53b：东西墙向（房间门洞封边）
      break
    }
    case 'bargate': {
      // 栅栏门（铁栅栏中的可交互门扇）：门框 + 铰链栏栅门扇（userData.lid 由 updateStructs 驱动旋开）
      const bars = '#3a332c', rails = '#57483a'
      grp.add(box(0.12, H, 0.14, '#4a3f34', -0.44, H / 2, 0)) // 门柱
      grp.add(box(0.12, H, 0.14, '#4a3f34', 0.44, H / 2, 0))
      grp.add(box(1.0, 0.12, 0.14, '#4a3f34', 0, H - 0.06, 0)) // 门楣
      grp.add(box(1.0, 0.1, 0.12, '#4a3f34', 0, 0.05, 0)) // 门槛
      // 门扇：铰链在局部 -X 缘（子件按 +0.40 偏移排布，旋开时绕铰链缘转动）
      const leaf = new THREE.Group()
      leaf.position.set(-0.40, 0, 0)
      leaf.userData.lid = 1
      for (let i = 0; i < 7; i++)
        leaf.add(box(0.03, H - 0.3, 0.03, bars, 0.07 + i * 0.11, (H - 0.3) / 2 + 0.08, 0))
      leaf.add(box(0.78, 0.07, 0.05, rails, 0.40, H * 0.3, 0)) // 门扇横档
      leaf.add(box(0.78, 0.07, 0.05, rails, 0.40, H * 0.75, 0))
      leaf.add(box(0.05, 0.16, 0.08, '#8a9098', 0.72, 1.05, 0.04)) // 门把手
      leaf.add(box(0.05, 0.16, 0.08, '#8a9098', 0.72, 1.05, -0.04)) // v54：背面把手（双面）
      grp.add(leaf)
      if (s.data?.rot) grp.rotation.y = Math.PI / 2 // v51：东西墙门洞（通行沿 local Z，房间门洞用）
      break
    }
    case 'elecbox': {
      // 配电箱（壁挂灰绿金属箱，可搜索容器；引擎按距离驱动电流嗡鸣）——强制贴最近墙，不浮空
      const inner = new THREE.Group()
      grp.add(inner)
      inner.add(box(0.62, 0.9, 0.18, '#5a6258', 0, 1.1, 0)) // 箱体
      // v54：开门可见内胆（底板 + 熔断器排）
      inner.add(box(0.52, 0.8, 0.04, '#20241f', 0, 1.1, 0.04))
      for (let i = 0; i < 3; i++) inner.add(box(0.09, 0.14, 0.05, i === 1 ? '#8a4a3a' : '#4a5248', -0.14 + i * 0.14, 1.16, 0.06))
      // v54：箱门可外摆（铰链在左缘，把手随门）
      const edoor = box(0.56, 0.84, 0.025, '#4a5248', 0, 0, 0)
      edoor.geometry.translate(0.28, 0, 0)
      edoor.position.set(-0.28, 1.1, 0.1)
      edoor.add(box(0.03, 0.12, 0.03, '#2e3430', 0.52, 0, 0.03)) // 把手
      movable(edoor, 'lid')
      inner.add(edoor)
      inner.add(glow(0.03, 0.03, 0.02, '#7ac97a', -0.18, 1.42, 0.12)) // 指示灯（绿，门上沿）
      inner.add(glow(0.03, 0.03, 0.02, '#c94a3a', -0.1, 1.42, 0.12)) // 指示灯（红）
      // 顶部出线导管：自箱顶沿墙上行，到顶弯 90° 拐上天花板底面
      const mrand = mulberry(s.x * 57 + s.y * 91)
      const np = 2 + Math.floor(mrand() * 2)
      for (let i = 0; i < np; i++) {
        const px = -0.18 + i * 0.16
        inner.add(cyl(0.022, 0.022, H - 1.55, '#3a3f3a', px, (1.55 + H) / 2, -0.04, 6))
        const bend = cyl(0.022, 0.022, 0.5, '#3a3f3a', px, H - 0.05, 0.16, 6)
        bend.rotation.x = Math.PI / 2
        inner.add(bend)
      }
      mountOnWall(inner, grp, s, m)
      if (s.looted) grp.userData.open = 1
      break
    }
    case 'cables': {
      // 电缆线束：横贯瓦片的水平缆——贴墙顶横缆 + 拐上天花板底面向室内横伸的顶缆；
      // 生成器按连续瓦片成排布置，首尾相接成贯通长缆；仅少量瓦片带竖向弯头/下垂环（避免梯子感）。
      // v51 修复「从墙面插出」：cgrp 不再整体平移到墙缘（旧版缆线相对坐标又带 -0.44 偏移，
      // 双重偏移使横缆嵌进墙内不可见、只剩顶缆垂直穿出墙面）——统一在瓦片中心坐标系按墙侧取偏移。
      const opts: number[] = []
      for (const [dx, dy, dd] of [[0, -1, 0], [1, 0, 1], [0, 1, 2], [-1, 0, 3]] as const) {
        const nx = s.x + dx, ny = s.y + dy
        if (nx < 0 || ny < 0 || nx >= m.w || ny >= m.h) continue
        if (m.tiles[ny * m.w + nx] !== 1) opts.push(dd)
      }
      if (!opts.length) return null
      const d = opts[(s.x * 7 + s.y * 13) % opts.length] // 确定性选墙（wallDir 的 Math.random 会导致重建后换墙）
      const cgrp = new THREE.Group()
      const cols = ['#1c1a18', '#1c1a18', '#6a2a22', '#24323e']
      const mrand = mulberry(s.x * 73 + s.y * 131)
      const nc = 3 + Math.floor(mrand() * 3)
      const zw = -0.465 // 贴墙面（房间侧，local -z 朝墙）
      for (let i = 0; i < nc; i++) {
        const cc = cols[i % cols.length]
        const cx = 0.3 - i * 0.12
        const cy = H - 0.36 - i * 0.05
        cgrp.add(box(1.0, 0.026, 0.026, cc, 0, cy, zw)) // 墙面水平横缆（沿 local X 横贯整瓦片）
        cgrp.add(box(0.026, 0.026, 0.62, cc, cx, H - 0.06, zw + 0.33)) // 天花板横缆（自墙面拐上顶，向室内横伸）
        if (mrand() < 0.35) // 竖向弯头（墙缆→顶缆的 90° 连接），仅少量瓦片带
          cgrp.add(box(0.026, H - 0.06 - cy, 0.026, cc, cx, (cy + H - 0.06) / 2, zw))
        else if (i === 1 && mrand() < 0.3) { // 偶发下垂环（同 pipes 天花板线束惯例）
          const loop = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.014, 5, 8, Math.PI), new THREE.MeshLambertMaterial({ color: '#1c1a18' }))
          loop.geometry.rotateX(Math.PI)
          loop.position.set((mrand() - 0.5) * 0.6, cy, zw)
          cgrp.add(loop)
        }
      }
      if (d === 2) cgrp.rotation.y = Math.PI
      else if (d === 3) cgrp.rotation.y = Math.PI / 2
      else if (d === 1) cgrp.rotation.y = -Math.PI / 2
      grp.add(cgrp)
      break
    }
    case 'statue': {
      // 风化的希腊女像（wikidot L3 雕像照片：铁栅栏后的砖砌区段，白色大理石长袍女像立于深色基座）
      // data.dmg 残缺变体：0 双臂残桩 / 1 单臂残桩+斜首侵蚀 / 2 无头颈桩（多数明显残损）
      const dmg = Number(s.data?.dmg ?? 0)
      const marble = '#d8d4c8', weather = '#9a968c', grime = '#7a8272', ped = '#2e2c2a'
      grp.add(box(0.7, 0.4, 0.7, ped, 0, 0.2, 0)) // 深色石基座
      grp.add(box(0.6, 0.06, 0.6, '#3a3835', 0, 0.43, 0)) // 基座顶板
      grp.add(box(0.62, 0.08, 0.62, grime, 0, 0.06, 0)) // 底座青灰积垢
      // 长袍下身（锥筒 + 褶裥竖棱）
      grp.add(cyl(0.16, 0.25, 0.85, marble, 0, 0.88, 0, 8))
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2 + 0.3
        grp.add(box(0.035, 0.78, 0.035, i % 2 ? weather : marble, Math.cos(a) * 0.2, 0.86, Math.sin(a) * 0.2))
      }
      // 躯干 + 斜披带（sash）
      grp.add(box(0.3, 0.55, 0.2, marble, 0, 1.55, 0))
      const sash = box(0.07, 0.56, 0.22, weather, 0, 1.55, 0)
      sash.rotation.z = 0.5
      grp.add(sash)
      grp.add(box(0.36, 0.1, 0.18, marble, 0, 1.85, 0)) // 肩
      if (dmg === 0) {
        // 双臂自肩部断失，仅余残桩
        grp.add(cyl(0.045, 0.05, 0.12, marble, -0.2, 1.81, 0, 6).rotateZ(0.5))
        grp.add(cyl(0.045, 0.05, 0.12, marble, 0.2, 1.81, 0, 6).rotateZ(-0.5))
        grp.add(box(0.16, 0.2, 0.16, marble, 0, 2.0, 0)) // 头（风化无面）
        grp.add(box(0.17, 0.05, 0.17, weather, 0, 2.11, 0)) // 侵蚀发顶
      } else if (dmg === 1) {
        // 单臂残桩 + 头部斜倾侵蚀
        grp.add(cyl(0.045, 0.05, 0.12, marble, -0.2, 1.81, 0, 6).rotateZ(0.5))
        const head = box(0.15, 0.19, 0.15, marble, 0.03, 1.99, 0)
        head.rotation.z = 0.28
        grp.add(head)
        grp.add(box(0.1, 0.06, 0.1, weather, 0.08, 2.07, 0)) // 侵蚀缺角
      } else {
        // 无头：颈桩 + 断裂面
        grp.add(cyl(0.05, 0.06, 0.1, marble, 0, 1.9, 0, 6))
        grp.add(box(0.12, 0.04, 0.12, weather, 0, 1.95, 0))
      }
      // 风化斑驳（灰色侵蚀块/条痕）
      grp.add(box(0.08, 0.2, 0.02, weather, 0.08, 1.5, 0.11))
      grp.add(box(0.02, 0.3, 0.06, weather, -0.12, 1.1, 0.14))
      grp.add(box(0.26, 0.06, 0.26, grime, 0, 0.5, 0)) // 像足积垢环
      break
    }
    case 'conveyor': {
      // 装配线传送带台（沿 local X，长度取 s.w；data.rot 纵向模式长度取 s.h）：深色金属脚架 + 侧轨
      // + 橡胶带面 + 两端滚筒 + 带上散件
      const L = Math.max(s.w, s.h) // v51 修复：纵向（rot）排长度在 s.h——旧版恒取 s.w=1，长排只剩 1m 残段
      const frame = '#3a3a40', belt = '#26262a'
      const legs = L > 3 ? [-L / 2 + 0.2, 0, L / 2 - 0.2] : [-L / 2 + 0.2, L / 2 - 0.2]
      for (const lx of legs) {
        grp.add(box(0.08, 0.62, 0.08, frame, lx, 0.31, -0.22))
        grp.add(box(0.08, 0.62, 0.08, frame, lx, 0.31, 0.22))
      }
      grp.add(box(L, 0.08, 0.62, frame, 0, 0.66, 0)) // 台面框
      grp.add(box(L, 0.05, 0.5, belt, 0, 0.73, 0)) // 橡胶带面（微亮）
      grp.add(box(L, 0.07, 0.04, '#4a4a52', 0, 0.76, -0.28)) // 侧轨
      grp.add(box(L, 0.07, 0.04, '#4a4a52', 0, 0.76, 0.28))
      for (const ex of [-L / 2 + 0.08, L / 2 - 0.08]) { // 两端滚筒
        const drum = cyl(0.09, 0.09, 0.52, '#55555e', ex, 0.7, 0, 10)
        drum.rotation.x = Math.PI / 2
        grp.add(drum)
      }
      // 带上散件（按瓦片哈希 1~2 件：小盒 / 零件箱 / 板材叠）
      const crand = mulberry(s.x * 37 + s.y * 53)
      for (let i = 0, n = 1 + Math.floor(crand() * 2); i < n; i++) {
        const px = (crand() - 0.5) * Math.max(0.4, L - 0.6), pz = (crand() - 0.5) * 0.3
        if (crand() < 0.35) { // 板材叠（2~3 层薄板；底面贴带面 0.755）
          for (let b = 0, bn = 2 + Math.floor(crand() * 2); b < bn; b++)
            grp.add(box(0.3, 0.02, 0.24, '#a89263', px, 0.765 + b * 0.025, pz))
        } else grp.add(box(0.16, 0.12, 0.14, ['#6a5a42', '#4a525a', '#7a6a4a'][Math.floor(crand() * 3)], px, 0.82, pz))
      }
      if (s.data?.rot) grp.rotation.y = Math.PI / 2 // v51：纵向传送带（沿 local Z，房间装配线长排）
      break
    }
    case 'angelstatue': {
      // 圣所大型天使像（青铜深色带铜绿）：深色石圆柱基座 + 长袍立像 + 后掠双翼 + 高举长号角
      // data.plinth=祭坛垫高（尽端石台底座，wikidot：或以祭坛形式抬高置于基座）
      const bronze = '#4a4438', patina = '#5a6a5a', stone = '#3a3632'
      if (s.data?.plinth) grp.add(box(0.95, 0.14, 0.95, '#46403a', 0, 0.07, 0)) // 祭坛石台
      grp.add(cyl(0.42, 0.46, 0.1, '#2e2a26', 0, 0.05, 0, 12)) // 基座底盘
      grp.add(cyl(0.34, 0.4, 0.5, stone, 0, 0.3, 0, 12)) // 圆柱基座
      // 长袍身躯（锥筒 + 褶裥竖棱）
      grp.add(cyl(0.18, 0.3, 1.1, bronze, 0, 1.1, 0, 8))
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + 0.4
        grp.add(box(0.04, 1.0, 0.04, i % 2 ? patina : bronze, Math.cos(a) * 0.24, 1.05, Math.sin(a) * 0.24))
      }
      grp.add(box(0.34, 0.5, 0.22, bronze, 0, 1.9, 0)) // 胸肩
      grp.add(box(0.16, 0.2, 0.16, bronze, 0, 2.25, 0)) // 头
      // 双翼（大幅后掠斜板，青铜 + 铜绿条痕——剪影优先，远处可辨）
      for (const sd of [-1, 1]) {
        const wing = box(0.07, 1.35, 0.5, bronze, sd * 0.38, 2.15, -0.24)
        wing.rotation.z = sd * 0.72
        wing.rotation.x = -0.28
        grp.add(wing)
        const streak = box(0.025, 1.0, 0.36, patina, sd * 0.43, 2.1, -0.22)
        streak.rotation.z = sd * 0.72
        streak.rotation.x = -0.28
        grp.add(streak)
      }
      // 高举的手臂 + 长号角（斜向上，加长号角强化剪影）
      const arm = cyl(0.04, 0.045, 0.5, bronze, 0.24, 2.2, 0.05, 6)
      arm.rotation.z = -0.7
      grp.add(arm)
      const horn = cyl(0.02, 0.07, 1.15, bronze, 0.5, 2.75, 0.1, 6)
      horn.rotation.z = -0.5
      grp.add(horn)
      break
    }
    case 'fallencolumn': {
      // 倒塌的大理石柱残件（非实心瓦砾）：整根卧倒柱身 + 柱头/柱础碎块 + 偶发站立残桩
      const mc = '#c8c2b2', weather = '#9a968c'
      const L = Math.max(s.w, s.h)
      const frag = new THREE.Group()
      const shaft = cyl(0.22, 0.24, Math.max(0.5, L - 0.3), mc, 0, 0.24, 0, 10)
      shaft.rotation.z = Math.PI / 2 // 卧倒（沿 local X）
      frag.add(shaft)
      frag.add(cyl(0.28, 0.3, 0.2, weather, -L / 2 + 0.2, 0.2, 0.1, 8)) // 柱础碎块
      frag.add(box(0.3, 0.18, 0.26, mc, L / 2 - 0.25, 0.12, -0.12)) // 柱头碎块
      frag.add(box(0.2, 0.12, 0.18, weather, 0.1, 0.08, 0.3)) // 散碎块
      if (s.h > s.w) frag.rotation.y = Math.PI / 2 // 长边沿 Z 时整体旋转
      grp.add(frag)
      if (mulberry(s.x * 41 + s.y * 67)() < 0.4) grp.add(cyl(0.24, 0.28, 0.7, mc, 0.3, 0.35, -0.25, 10)) // 站立残桩
      break
    }
    case 'busbar': {
      // 发电室母线龙门架（沿 local X，长度取 s.w）：绿灰钢 H 型立柱×2 + 顶横梁 + 铜母线排
      // + 垂挂绝缘子串（叠片）+ 横梁垂下粗缆环（同 pipes 下垂环惯例）
      const L = s.w, steel = '#4a5a4a', copper = '#8a5a3a', ins = '#c8c2b2', insG = '#7a8a7a'
      const by = 2.6 // 横梁高
      for (const px of [-L / 2 + 0.15, L / 2 - 0.15]) { // H 型立柱（腹板 + 翼缘）
        grp.add(box(0.08, by, 0.3, steel, px, by / 2, 0))
        grp.add(box(0.2, by, 0.08, steel, px, by / 2, 0))
      }
      grp.add(box(L, 0.12, 0.3, steel, 0, by + 0.06, 0)) // 顶横梁
      for (let i = 0; i < 3; i++) grp.add(box(L - 0.3, 0.03, 0.05, copper, 0, by - 0.06 - i * 0.09, -0.09 + i * 0.09)) // 铜母线排
      const brand = mulberry(s.x * 47 + s.y * 29)
      const ns = 3 + Math.floor(brand() * 3) // 3~5 串绝缘子
      for (let i = 0; i < ns; i++) {
        const px = -L / 2 + 0.4 + (i + 0.5) * ((L - 0.8) / ns)
        const discs = 3 + Math.floor(brand() * 2)
        for (let d2 = 0; d2 < discs; d2++)
          grp.add(cyl(0.05, 0.05, 0.03, d2 % 2 ? insG : ins, px, by - 0.14 - d2 * 0.055, 0, 6))
      }
      for (let i = 0, n = 1 + Math.floor(brand() * 2); i < n; i++) { // 粗缆环
        const loop = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.03, 5, 8, Math.PI), new THREE.MeshLambertMaterial({ color: '#1c1a18' }))
        loop.geometry.rotateX(Math.PI)
        loop.position.set((brand() - 0.5) * (L - 0.6), by - 0.05, 0.1)
        grp.add(loop)
      }
      break
    }
    case 'warningsign': {
      // 高压警示牌（贴墙，强制贴最近墙不浮空）：黄白牌 + 黑色闪电折线 + 编号小牌；data.tilt 微倾
      const inner = new THREE.Group()
      grp.add(inner)
      inner.add(box(0.4, 0.5, 0.02, '#d8c94a', 0, 1.6, 0)) // 黄牌
      const boltA = box(0.045, 0.2, 0.014, '#16161a', 0.04, 1.74, 0.014)
      boltA.rotation.z = 0.5
      inner.add(boltA)
      const boltB = box(0.045, 0.2, 0.014, '#16161a', -0.04, 1.58, 0.014)
      boltB.rotation.z = 0.5
      inner.add(boltB)
      inner.add(box(0.3, 0.03, 0.014, '#16161a', 0, 1.46, 0.014)) // 三角底边
      inner.add(box(0.2, 0.09, 0.015, '#e8e4da', 0, 1.32, 0.012)) // 编号牌
      inner.add(box(0.14, 0.02, 0.017, '#16161a', 0, 1.32, 0.013))
      const tilt = Number(s.data?.tilt ?? 0)
      if (tilt) inner.rotation.z = (tilt - 1.5) * 0.06 // 微倾变体
      mountOnWall(inner, grp, s, m)
      break
    }
    case 'worktable': {
      // 装配线工作台（黄褐钢架 + 0.9 高台面；data.vise=台虎钳，否则台面材料板叠 2~3 层）
      const L = s.w, frame = '#6a5a34', top = '#8a7a52'
      for (const px of [-L / 2 + 0.08, L / 2 - 0.08])
        for (const pz of [-0.18, 0.18]) grp.add(box(0.06, 0.86, 0.06, frame, px, 0.43, pz))
      grp.add(box(L, 0.05, 0.5, top, 0, 0.9, 0)) // 台面
      grp.add(box(L - 0.1, 0.04, 0.4, frame, 0, 0.3, 0)) // 底层搁板
      if (s.data?.vise) {
        grp.add(box(0.14, 0.12, 0.12, '#2e3238', L / 4, 0.99, -0.12)) // 台虎钳钳身
        grp.add(box(0.04, 0.08, 0.16, '#3a3f46', L / 4 + 0.09, 1.0, -0.12)) // 钳口
      } else {
        const wrand = mulberry(s.x * 13 + s.y * 7)
        for (let i = 0, n = 2 + Math.floor(wrand() * 2); i < n; i++)
          grp.add(box(0.4, 0.025, 0.3, '#b09a6a', -L / 6, 0.94 + i * 0.03, 0.02)) // 材料板叠
      }
      break
    }
    case 'factlamp': {
      // 吊装长条荧光灯（沿 local X 1.2m 灯管，吊杆自天花板垂下）——配套光源由生成器同瓦片 pushLight(noFix)
      const hy = H - 0.55 // 灯管高度
      for (const px of [-0.45, 0.45]) grp.add(cyl(0.015, 0.015, H - hy, '#3a3f3a', px, (hy + H) / 2, 0, 5)) // 吊杆
      grp.add(box(1.2, 0.06, 0.12, '#4a4f46', 0, hy + 0.045, 0)) // 灯槽
      grp.add(glow(1.1, 0.04, 0.08, '#e8e4da', 0, hy, 0)) // 自发光灯管
      if (s.data?.rot) grp.rotation.y = Math.PI / 2 // v51：纵向吊装（沿 local Z）
      break
    }
    case 'sphboiler': {
      // 大型铆接球形黄铜锅炉（2×2）：砖石基座 + 低段黄铜球罐 + 铆钉环行 + 侧管短节 + 顶部阀轮 + 熏黑罐顶
      const brass = '#8a6a3a', brassD = '#6a4e28', soot = '#2a241e'
      grp.add(box(1.7, 0.5, 1.7, '#5a5148', 0, 0.25, 0)) // 砖石基座
      const sph = new THREE.Mesh(new THREE.SphereGeometry(0.85, 10, 7), new THREE.MeshLambertMaterial({ color: brass }))
      sph.position.set(0, 1.35, 0)
      grp.add(sph)
      const cap = new THREE.Mesh(
        new THREE.SphereGeometry(0.86, 10, 4, 0, Math.PI * 2, 0, 0.7),
        new THREE.MeshLambertMaterial({ color: soot }),
      ) // 熏黑顶冠
      cap.position.set(0, 1.36, 0)
      grp.add(cap)
      for (const ry of [1.05, 1.35, 1.65]) { // 铆钉环行
        const rr = Math.sqrt(Math.max(0.04, 0.85 * 0.85 - (ry - 1.35) ** 2)) + 0.02
        for (let i = 0; i < 10; i++) {
          const a = (i / 10) * Math.PI * 2
          grp.add(box(0.04, 0.04, 0.04, brassD, Math.cos(a) * rr, ry, Math.sin(a) * rr))
        }
      }
      const stub = cyl(0.09, 0.09, 0.5, '#6a5a42', 0.9, 1.2, 0, 8) // 侧管短节
      stub.rotation.z = Math.PI / 2
      grp.add(stub)
      grp.add(cyl(0.07, 0.07, 0.35, '#6a5a42', 0, 2.32, 0, 8)) // 顶管
      const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.035, 6, 10), new THREE.MeshLambertMaterial({ color: '#a63a2e' }))
      wheel.position.set(0, 2.52, 0)
      wheel.rotation.x = Math.PI / 2 // 水平阀轮
      grp.add(wheel)
      for (const a of [0, Math.PI / 2]) { // 阀轮辐条
        const spoke = box(0.3, 0.025, 0.025, '#a63a2e', 0, 2.52, 0)
        spoke.rotation.y = a
        grp.add(spoke)
      }
      break
    }
    case 'floordrain': {
      // 地面排水格栅（非实心）：暗色浅坑 + 4 根平行细栅条
      grp.add(box(0.5, 0.02, 0.5, '#101215', 0, 0.01, 0))
      for (let i = 0; i < 4; i++) grp.add(box(0.46, 0.015, 0.05, '#3a3f3a', 0, 0.025, -0.18 + i * 0.12))
      break
    }
    case 'turbinegen': {
      // 汽轮发电机组（1×3 沿 local X，实心）：混凝土基座 + 环筋长筒发电机 + 汽轮机端罩 + 励磁箱
      const L = s.w, steel = '#5a6a72', dark = '#3a444a', plinth = '#6a665e'
      grp.add(box(L * 0.94, 0.22, 0.8, plinth, 0, 0.11, 0)) // 混凝土基座
      const barrel = cyl(0.34, 0.34, L * 0.52, steel, -L * 0.12, 0.62, 0, 12) // 长筒发电机
      barrel.rotation.z = Math.PI / 2
      grp.add(barrel)
      for (const rx of [-L * 0.3, -L * 0.12, L * 0.06]) { // 环筋机壳
        const rib = cyl(0.37, 0.37, 0.06, dark, rx, 0.62, 0, 12)
        rib.rotation.z = Math.PI / 2
        grp.add(rib)
      }
      const turbo = cyl(0.46, 0.5, 0.62, dark, L * 0.28, 0.66, 0, 12) // 汽轮机端罩（更大圆壳）
      turbo.rotation.z = Math.PI / 2
      grp.add(turbo)
      grp.add(box(0.34, 0.4, 0.5, '#4a5248', -L * 0.44, 0.46, 0)) // 励磁箱
      grp.add(cyl(0.16, 0.16, 0.18, '#6a5a3a', L * 0.06, 0.5, 0, 10).rotateZ(Math.PI / 2)) // 联轴器护罩
      for (let i = 0; i < 3; i++) grp.add(glow(0.05, 0.05, 0.02, ['#9adfff', '#6f9a55', '#e8b93c'][i], -L * 0.2 + i * 0.12, 1.02, 0.36)) // 微光表盘
      grp.add(cyl(0.04, 0.04, 0.3, '#8a5a3a', L * 0.2, 0.3, 0.3, 6).rotateX(0.9)) // 润滑油管短节
      break
    }
    case 'switchboard': {
      // 配电盘柜（1×1 竖柜，并排成列）：灰绿高柜 + 表计行 + 指示灯列 + 断路器手柄 + 顶部导管入顶
      const cab = '#4a5248', darkC = '#2e3430'
      grp.add(box(0.9, 2.2, 0.35, cab, 0, 1.1, 0))
      grp.add(box(0.92, 0.08, 0.38, darkC, 0, 0.04, 0)) // 底座
      for (let i = 0; i < 3; i++) { // 表计行
        const dial = cyl(0.055, 0.055, 0.02, '#d8d2c2', -0.24 + i * 0.24, 1.86, 0.19, 10)
        dial.rotation.x = Math.PI / 2
        grp.add(dial)
        grp.add(glow(0.02, 0.02, 0.012, '#e8b93c', -0.24 + i * 0.24, 1.86, 0.2))
      }
      for (let i = 0; i < 4; i++) grp.add(glow(0.03, 0.03, 0.015, i % 2 ? '#7ac97a' : '#c94a3a', -0.3, 1.55 - i * 0.12, 0.19)) // 指示灯列
      for (let i = 0; i < 3; i++) grp.add(box(0.05, 0.14, 0.05, '#16181a', 0.02 + i * 0.16, 1.3, 0.19)) // 断路器手柄
      grp.add(cyl(0.035, 0.035, H - 2.2, darkC, 0.2, (2.2 + H) / 2, 0.05, 6)) // 顶部导管入顶
      if (s.data?.deg !== undefined) grp.rotation.y = ((Number(s.data.deg) || 0) * Math.PI) / 180 // 朝向（排面朝向房内）
      break
    }
    case 'transformer': {
      // 油浸式变压器（2×2，实心）：铆接油罐 + 两侧散热片排 + 顶部瓷套管 + 底轨 + 地面油渍
      const tank = '#5a5a46', darkC = '#3a3a2e', por = '#c8c2b2'
      grp.add(box(1.8, 0.04, 1.8, '#2a2620', 0, 0.02, 0)) // 油渍
      for (const pz of [-0.5, 0.5]) grp.add(box(1.5, 0.1, 0.14, '#26282c', 0, 0.09, pz)) // 底轨
      grp.add(box(1.3, 1.15, 1.1, tank, 0, 0.72, 0)) // 油罐
      grp.add(box(1.34, 0.08, 1.14, darkC, 0, 1.32, 0)) // 罐盖
      for (const sx of [-0.72, 0.72]) // 两侧散热片排
        for (let i = 0; i < 5; i++) grp.add(box(0.05, 0.9, 0.14, darkC, sx, 0.68, -0.44 + i * 0.22))
      for (let i = 0; i < 3; i++) { // 顶部瓷套管（叠片绝缘子 + 接线端）
        const px = -0.36 + i * 0.36
        grp.add(cyl(0.05, 0.05, 0.1, darkC, px, 1.4, 0, 6))
        for (let d2 = 0; d2 < 3; d2++) grp.add(cyl(0.055, 0.055, 0.025, por, px, 1.48 + d2 * 0.05, 0, 6))
        grp.add(cyl(0.02, 0.02, 0.08, '#8a5a3a', px, 1.66, 0, 5))
      }
      break
    }
    case 'pressmachine': {
      // 冲压工位（1×1 C 型冲床，实心）：铸铁机身 + 上滑块 + 模具台 + 侧飞轮 + 脚踏 + 工位小灯
      const body = '#4a4a44', darkC = '#2e2e2a'
      grp.add(box(0.5, 0.14, 0.5, darkC, 0, 0.07, 0)) // 底座
      grp.add(box(0.42, 0.72, 0.34, body, 0, 0.5, -0.05)) // 下身（模座）
      grp.add(box(0.46, 0.06, 0.44, darkC, 0, 0.85, 0.02)) // 模具台
      grp.add(box(0.42, 0.5, 0.34, body, 0, 1.6, -0.08)) // C 型上臂
      grp.add(box(0.2, 0.34, 0.2, darkC, 0, 1.14, 0.05)) // 滑块
      const fly = cyl(0.17, 0.17, 0.06, '#3a3f3a', 0.27, 1.62, -0.08, 12) // 侧飞轮
      fly.rotation.z = Math.PI / 2
      grp.add(fly)
      grp.add(box(0.16, 0.04, 0.1, '#26282c', 0.1, 0.03, 0.3)) // 脚踏
      grp.add(glow(0.1, 0.03, 0.03, '#fff2d8', 0, 1.38, 0.1)) // 工位小灯
      if (s.data?.deg !== undefined) grp.rotation.y = ((Number(s.data.deg) || 0) * Math.PI) / 180 // 朝向传送带
      break
    }
    case 'feedpump': {
      // 电动给水泵（1×1，实心）：同座电机 + 泵蜗壳 + 联轴护罩 + 入地水管 + 压力表微光
      const motor = '#3a4a3a', pump = '#4a4440'
      grp.add(box(0.6, 0.08, 0.4, '#2a2d30', 0, 0.04, 0)) // 共用底座
      grp.add(cyl(0.14, 0.14, 0.34, motor, -0.12, 0.22, 0, 10).rotateZ(Math.PI / 2)) // 电机
      grp.add(cyl(0.06, 0.06, 0.1, '#6a5a3a', 0.07, 0.22, 0, 8).rotateZ(Math.PI / 2)) // 联轴护罩
      grp.add(cyl(0.17, 0.19, 0.16, pump, 0.2, 0.22, 0, 10).rotateZ(Math.PI / 2)) // 泵蜗壳
      grp.add(cyl(0.04, 0.04, 0.24, '#3a3f3a', 0.2, 0.2, 0.16, 6).rotateX(0.7)) // 出水管
      grp.add(cyl(0.045, 0.045, 0.2, '#3a3f3a', 0.3, 0.1, -0.1, 6)) // 进水管（入地）
      grp.add(glow(0.05, 0.05, 0.02, '#e8b93c', 0.2, 0.42, 0.1)) // 压力表
      break
    }
    case 'manifold': {
      // 蒸汽集箱（1×N 沿 local X，实心）：鞍座×2 + 高位卧式铆接长筒 + 上升管入顶 + 下降管 + 端部主阀轮
      const L = s.w, drum = '#6a4a34', lag = '#b8b0a0'
      for (const px of [-L / 2 + 0.3, L / 2 - 0.3]) grp.add(box(0.16, 1.35, 0.4, '#3a3f3a', px, 0.68, 0)) // 鞍座
      const d = cyl(0.26, 0.26, L - 0.2, drum, 0, 1.6, 0, 12) // 长筒
      d.rotation.z = Math.PI / 2
      grp.add(d)
      const lag2 = cyl(0.28, 0.28, L * 0.3, lag, -L * 0.2, 1.6, 0, 12) // 保温套段
      lag2.rotation.z = Math.PI / 2
      grp.add(lag2)
      const ns = Math.max(2, Math.round(L / 1.5))
      for (let i = 0; i < ns; i++) { // 上升管短节入顶
        const px = -L / 2 + 0.5 + (i * (L - 1)) / Math.max(1, ns - 1)
        grp.add(cyl(0.05, 0.05, H - 1.85, '#3a3f3a', px, (1.85 + H) / 2, 0, 6))
      }
      grp.add(cyl(0.06, 0.06, 1.1, drum, L * 0.3, 0.75, 0.1, 6)) // 下降管短节
      const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.03, 6, 10), new THREE.MeshLambertMaterial({ color: '#a63a2e' })) // 端部主阀轮
      wheel.position.set(L / 2 - 0.05, 1.6, 0)
      wheel.rotation.y = Math.PI / 2
      grp.add(wheel)
      break
    }
    case 'piperack': {
      // 有序管架（1×1 格构，实心）：钢支架 + 三层平行直管（0.6/1.1/1.6，中层蒸汽管保温浅色）；
      // data.valve=下吊阀轮变体；data.rot 转向（默认管道沿 local Z）
      const steel = '#3a3f3a'
      for (const px of [-0.32, 0.32]) grp.add(box(0.06, 1.75, 0.06, steel, px, 0.88, 0)) // 支架立柱
      for (const ty of [0.62, 1.12, 1.62]) grp.add(box(0.8, 0.05, 0.08, steel, 0, ty, 0)) // 横担
      const tiers: [number, string][] = [[0.68, '#4a4440'], [1.18, '#b8b0a0'], [1.68, '#3a3f3a']]
      for (const [ty, cc] of tiers) {
        const p = cyl(0.055, 0.055, 1.0, cc, 0, ty, 0, 8)
        p.rotation.x = Math.PI / 2
        grp.add(p)
      }
      if (Number(s.data?.valve)) { // 下吊阀轮
        grp.add(cyl(0.04, 0.04, 0.5, '#4a4440', 0.1, 1.35, 0.12, 6))
        const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.028, 6, 10), new THREE.MeshLambertMaterial({ color: '#a63a2e' }))
        wheel.position.set(0.1, 1.1, 0.12)
        grp.add(wheel)
      }
      if (s.data?.rot) grp.rotation.y = Math.PI / 2
      break
    }
    case 'cabletray': {
      // 穿孔电缆桥架（非实心，高位顺墙；默认沿 local Z，data.rot 转向）：梯形架 + 架内线缆
      const tray = '#4a4f46'
      grp.add(box(0.26, 0.04, 1.0, tray, 0, H - 0.5, 0)) // 桥架底板
      for (const sx of [-0.13, 0.13]) grp.add(box(0.03, 0.08, 1.0, tray, sx, H - 0.45, 0)) // 侧帮
      for (let i = 0; i < 3; i++) grp.add(box(0.04, 0.025, 1.0, ['#1c1a18', '#6a2a22', '#24323e'][i], -0.06 + i * 0.06, H - 0.46, 0)) // 架内线缆
      if (s.data?.rot) grp.rotation.y = Math.PI / 2
      break
    }
    case 'megcrate': {
      // M.E.G. 补给箱：军绿箱 + 印刷标记（canvas 贴图）+ 两片式上盖（v54：先上抬再对滑）
      grp.add(box(0.85, 0.6, 0.85, '#3d4a2a', 0, 0.3, 0))
      const [cv, cg] = makeCanvasCtx(128, 64)
      cg.fillStyle = '#3d4a2a'; cg.fillRect(0, 0, 128, 64)
      cg.fillStyle = '#d8d2c0'
      cg.font = 'bold 26px monospace'
      cg.textAlign = 'center'
      cg.fillText('M.E.G.', 64, 32)
      cg.fillRect(24, 44, 80, 6)
      const mark = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.3), new THREE.MeshLambertMaterial({ map: toTex(cv) }))
      mark.position.set(0, 0.32, 0.431)
      grp.add(mark)
      for (const sgn of [-1, 1]) {
        const lid = box(0.44, 0.08, 0.88, '#46543a', sgn * 0.22, 0.64, 0)
        lid.add(box(0.06, 0.03, 0.3, '#d8d2c0', -sgn * 0.16, 0.055, 0)) // 近中缝提把（随盖）
        movable(lid, sgn < 0 ? 'lidL' : 'lidR')
        grp.add(lid)
      }
      if (s.looted) grp.userData.open = 1
      break
    }
    case 'glasswin': {
      // 半透玻璃窗（实心，仅观察）：窗台 + 上梁 + 侧框 + 透明玻璃
      // v48 缺省朝向：强制贴最近墙（含虚空墙）、玻璃面（+Z）朝室内，不再立在瓦片中央
      const inner = new THREE.Group()
      grp.add(inner)
      // v54b：L4 雨窗（data.rain）框体提亮至近墙色（受光与邻墙一致，不再明显偏暗）；其余维持深木框
      const frame = s.data?.rain ? '#9a948a' : '#3a352e'
      if (s.data?.stain === 'blue') {
        // v47：蓝色彩玻窗（Level 274 教堂花窗）——石框尖拱 + 蓝白彩玻格 + 圣辉
        const sf = '#c8ccd8' // 石框
        inner.add(box(1.0, 0.5, 0.22, sf, 0, 0.25, 0)) // 窗台
        inner.add(box(0.08, 2.1, 0.22, sf, -0.46, 1.55, 0)) // 侧框（左）
        inner.add(box(0.08, 2.1, 0.22, sf, 0.46, 1.55, 0)) // 侧框（右）
        inner.add(box(1.0, 0.14, 0.22, sf, 0, 2.66, 0)) // 上梁
        inner.add(box(0.6, 0.14, 0.22, sf, 0, 2.78, 0)) // 尖拱顶（收分）
        const paneCols = ['#2a5fd8', '#4142a5', '#7ab0e8', '#0071c9', '#9adfff'] // 蓝白彩玻
        for (let py = 0; py < 4; py++)
          for (let px = 0; px < 3; px++) {
            const c = paneCols[(px * 7 + py * 3) % paneCols.length]
            const pane = new THREE.Mesh(
              new THREE.PlaneGeometry(0.26, 0.46),
              new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.82, side: THREE.DoubleSide }),
            )
            pane.position.set(-0.29 + px * 0.29, 0.74 + py * 0.48, 0)
            inner.add(pane)
          }
        for (let px = 0; px < 4; px++) inner.add(box(0.03, 1.92, 0.03, frame, -0.435 + px * 0.29, 1.46, 0.01)) // 竖棂
        for (let py = 0; py < 5; py++) inner.add(box(0.88, 0.03, 0.03, frame, 0, 0.5 + py * 0.48, 0.01)) // 横棂
        inner.add(glow(0.2, 0.2, 0.02, '#9adfff', 0, 2.4, 0.02)) // 顶部圣辉（鹉主之蓝）
      } else {
        inner.add(box(1.0, 0.85, 0.22, frame, 0, 0.425, 0)) // 窗台
        inner.add(box(1.0, Math.max(0.2, H - 2.1), 0.22, frame, 0, 2.1 + Math.max(0.2, H - 2.1) / 2, 0)) // 上梁
        inner.add(box(0.08, 1.25, 0.22, frame, -0.46, 1.475, 0))
        inner.add(box(0.08, 1.25, 0.22, frame, 0.46, 1.475, 0))
        const glass = new THREE.Mesh(
          new THREE.PlaneGeometry(0.88, 1.25),
          new THREE.MeshLambertMaterial({ color: '#93a7b8', transparent: true, opacity: 0.12, side: THREE.DoubleSide, depthWrite: false }), // v54：更透——窗外虚空清晰可见
        )
        glass.position.set(0, 1.475, 0)
        inner.add(glass)
        // v54：雨痕（L4 窗景区 data.rain——纯透明底 + 稀疏细亮痕，只留一点点雨痕、不挡视线）
        if (s.data?.rain) {
          const streaks = new THREE.Mesh(
            new THREE.PlaneGeometry(0.88, 1.25),
            new THREE.MeshBasicMaterial({
              map: levelTexture('rain_streaks', () => {
                const [cv, g] = makeCanvasCtx(64, 128)
                g.clearRect(0, 0, 64, 128) // 纯透明底（无雾灰底色——透过窗户看清虚空）
                let s2 = 1337
                const rnd = () => ((s2 = (s2 * 1664525 + 1013904223) >>> 0) / 4294967296)
                for (let i = 0; i < 22; i++) { // 稀疏竖直雨痕：细亮痕下滑拖尾 + 端点水珠
                  const x = rnd() * 64, y0 = rnd() * 128, len = 14 + rnd() * 46
                  g.strokeStyle = `rgba(200,212,218,${0.3 + rnd() * 0.4})`
                  g.lineWidth = rnd() < 0.25 ? 1.4 : 0.7
                  g.beginPath(); g.moveTo(x, y0); g.lineTo(x + (rnd() - 0.5) * 2, y0 + len); g.stroke()
                  g.fillStyle = 'rgba(215,226,230,0.75)'
                  g.fillRect(x - 0.7, y0 + len, 1.5, 1.5)
                }
                return toTex(cv)
              }),
              transparent: true, opacity: 0.3, side: THREE.DoubleSide, depthWrite: false,
            }),
          )
          streaks.position.set(0, 1.475, -0.04) // 玻璃外侧（雨在窗外）
          inner.add(streaks)
        }
        // 窗棂十字
        inner.add(box(0.88, 0.03, 0.03, frame, 0, 1.475, 0.01))
        inner.add(box(0.03, 1.25, 0.03, frame, 0, 1.475, 0.01))
      }
      // v54：显式朝向（data.deg——无限 L4 窗列：窗格即窗洞、四邻无墙可依，框贴 data.deg 所指侧瓦片缘）
      if (s.data?.deg !== undefined) {
        grp.rotation.y = ((Number(s.data.deg) || 0) * Math.PI) / 180
        inner.position.z = 0.39 // 贴瓦片外侧缘（+z 侧=窗外虚空条带方向）
      } else mountOnWall(inner, grp, s, m) // 强制贴最近墙（含虚空墙），玻璃面朝室内
      break
    }
    case 'rollerdoor': {
      if(s.data?.tradeDoor){
        const width=Math.max(s.w,s.h),height=Number(s.data.height??2.6)
        grp.rotation.y=s.data.axis==='y'?Math.PI/2:0
        grp.add(box(width+.12,.2,.26,'#8b989b',0,height+.1,0))
        const panel=new THREE.Mesh(new THREE.BoxGeometry(width,height,.08),texLambert('corrugated_steel','#657b8e','#4d6073','#a8b6bd'))
        panel.geometry.translate(0,height/2,0);panel.userData.lid=1;grp.add(panel);break
      }
      // 卷帘门（可交互升降）：无门框——整幅波纹钢帘板与墙同高，相邻门等宽同纹无缝相连成卷帘墙；
      // 顶部卷轴盒（lid 滑动开门动画：帘板收进盒内；v35 波纹钢贴图面板）
      grp.add(box(s.w - 0.02, 0.22, 0.22, '#2e3236', 0, H - 0.11, 0)) // 卷轴盒
      const panel = new THREE.Mesh(
        new THREE.BoxGeometry(s.w - 0.02, H - 0.24, 0.05),
        texLambert('corrugated_steel', '#5a5e63', '#45494e', '#e2e4e0'),
      )
      panel.geometry.translate(0, (H - 0.24) / 2, 0)
      panel.userData.lid = 1
      grp.add(panel)
      grp.rotation.y = doorNeedsRotate(m, s) // v9：门板平面与墙线平行
      break
    }
    case 'glassdoor': {
      // 玻璃门（可交互滑开）：金属框 + 透明门扇（lid 滑动）
      const frame = '#4a3a2a'
      grp.add(box(0.12, 2.3, 0.24, frame, -0.5, 1.15, 0))
      grp.add(box(0.12, 2.3, 0.24, frame, 0.5, 1.15, 0))
      grp.add(box(1.12, 0.12, 0.24, frame, 0, 2.3, 0))
      const panel = box(0.92, 2.2, 0.04, '#8fa4b2', 0, 0, 0)
      panel.geometry.translate(0, 1.1, 0)
      ;(panel.material as THREE.MeshLambertMaterial).transparent = true
      ;(panel.material as THREE.MeshLambertMaterial).opacity = 0.35
      panel.userData.lid = 1
      panel.add(box(0.7, 0.05, 0.05, frame, 0, 1.05, 0.04)) // 门把手横杆（随门扇滑动）
      grp.add(panel)
      grp.rotation.y = doorNeedsRotate(m, s) // v9：门板平面与墙线平行
      break
    }
    // ===================== v23：Level 6「Lights Out」 =====================
    // 本层彻底黑暗、任何外带光源都不发光——这几件只做剪影，不给自发光。
    case 'hotpipe': {
      // 沿墙的加热液体金属管道：黑暗中唯一能摸着走的导航线索
      const d = wallDir(s, m)
      if (d === null) return null
      const pg = new THREE.Group()
      const pipe = cyl(0.11, 0.11, 1.02, '#4a3a30', 0, 0, 0, 8)
      pipe.rotation.z = Math.PI / 2
      if (s.data?.warm) emit(pipe, '#240806', 0.6) // 极弱暗红：管里是热液，但本层不该「亮」
      pg.add(pipe)
      for (const fx of [-0.34, 0.34]) {
        const flange = cyl(0.155, 0.155, 0.07, '#3b2e26', fx, 0, 0, 8) // 法兰环
        flange.rotation.z = Math.PI / 2
        pg.add(flange)
      }
      for (const fx of [-0.44, 0.44]) pg.add(box(0.05, 0.09, 0.17, '#3b2e26', fx, 0, -0.085)) // 管卡到墙
      faceMount(pg, d, 0.17, 1.12)
      grp.add(pg)
      break
    }
    case 'deadshrub': {
      const sc = Number(s.data?.scale ?? 1)
      if (s.data?.tree) {
        // 大型枯木：整棵树合并成一个网格，扩大枯林规模时仍控制 draw call。
        const rand = mulberry(Number(s.data?.sid ?? 6) ^ 0x6d330d)
        const geos: THREE.BufferGeometry[] = []
        const trunkH = (3.7 + rand() * 0.8) * sc
        const trunk = new THREE.CylinderGeometry(0.11 * sc, 0.25 * sc, trunkH, 7)
        trunk.translate(0, trunkH / 2 - 0.12, 0); geos.push(trunk)
        const addLimb = (baseY: number, len: number, radius: number, az: number, tilt: number) => {
          const geo = new THREE.CylinderGeometry(radius * 0.55, radius, len, 6)
          geo.rotateZ(tilt); geo.rotateY(az)
          const dx = -Math.sin(tilt) * Math.cos(az), dy = Math.cos(tilt), dz = Math.sin(tilt) * Math.sin(az)
          geo.translate(dx * len / 2, baseY + dy * len / 2, dz * len / 2)
          geos.push(geo)
        }
        for (let i = 0; i < 8; i++) {
          const baseY = trunkH * (0.38 + rand() * 0.53)
          addLimb(baseY, (0.75 + rand() * 1.15) * sc, (0.055 + rand() * 0.05) * sc, rand() * Math.PI * 2, 0.68 + rand() * 0.55)
        }
        for (let i = 0; i < 4; i++) addLimb(0.06, (0.55 + rand() * 0.5) * sc, 0.07 * sc, i * Math.PI / 2 + rand() * 0.4, 1.42)
        const tree = new THREE.Mesh(mergeGeometries(geos)!, litMaterial({ color: '#32271f', roughness: 1, envBase: 0.025 }))
        tree.rotation.y = Number(s.data?.rot ?? 0)
        grp.add(tree)
        break
      }
      for (let i = 0; i < 7; i++) {
        const stem = cyl(0.018 * sc, 0.035 * sc, (0.45 + i * 0.055) * sc, '#251e19', 0, 0.2 * sc, 0, 5)
        stem.rotation.z = (i - 3) * 0.23; stem.rotation.y = i * 1.91
        grp.add(stem)
      }
      grp.rotation.y = Number(s.data?.rot ?? 0)
      break
    }
    case 'tundrarock': {
      const geo = new THREE.DodecahedronGeometry(Math.max(0.42, Math.min(s.w, s.h) * 0.48), 0)
      geo.scale(1.25, 0.7, 0.95)
      const rock = new THREE.Mesh(geo, litMaterial({ color: '#202326', roughness: 1, envBase: 0.04 }))
      rock.position.y = Math.max(0.28, s.w * 0.25); rock.rotation.set(0.12, Number(s.data?.rot ?? 0), -0.08); grp.add(rock)
      break
    }
    case 'crystalcluster': {
      const cc = s.data?.blue ? '#53677c' : '#594b68'
      for (let i = 0; i < 6; i++) {
        const h = 0.35 + (i % 3) * 0.18
        const shard = new THREE.Mesh(new THREE.ConeGeometry(0.09 + (i % 2) * 0.035, h, 5), litMaterial({ color: cc, roughness: 0.42, envBase: 0.28 }))
        shard.position.set((i % 3 - 1) * 0.16, h / 2, (Math.floor(i / 3) - 0.5) * 0.22); shard.rotation.z = (i - 2.5) * 0.055; grp.add(shard)
      }
      break
    }
    case 'stinkgrass': {
      const rand = mulberry(Number(s.data?.sid ?? 6) ^ 0x6a551a)
      const density = Number(s.data?.density ?? 1)
      const count = Math.min(96, Math.max(24, Math.round(s.w * s.h * 5.2 * density)))
      const buckets: [THREE.BufferGeometry[], THREE.BufferGeometry[]] = [[], []]
      for (let i = 0; i < count; i++) {
        const h = 0.22 + rand() * 0.42
        const geo = new THREE.BoxGeometry(0.025 + rand() * 0.025, h, 0.035)
        geo.rotateZ((rand() - 0.5) * 0.58); geo.rotateY(rand() * Math.PI)
        // 根部略埋入地面，即使大草斑跨过微小地形起伏也不会显得浮空。
        geo.translate((rand() - 0.5) * s.w, h / 2 - 0.09, (rand() - 0.5) * s.h)
        buckets[i & 1].push(geo)
      }
      const colors = ['#4b4e2c', '#676438']
      for (let i = 0; i < 2; i++) if (buckets[i].length) grp.add(new THREE.Mesh(
        mergeGeometries(buckets[i])!, litMaterial({ color: colors[i], roughness: 1, envBase: 0.02 }),
      ))
      grp.rotation.y = Number(s.data?.rot ?? 0)
      break
    }
    case 'obelisk': {
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.48, 6.3, 4), litMaterial({ color: '#171a1d', roughness: 0.84, envBase: 0.12 }))
      shaft.position.y = 3.15; shaft.rotation.y = Math.PI / 4; grp.add(shaft)
      grp.add(box(1.45, 0.28, 1.45, '#202328', 0, 0.14, 0))
      for (let i = 0; i < 5; i++) grp.add(box(0.34, 0.025, 0.012, '#6a6252', 0, 2.25 + i * 0.29, -0.39))
      break
    }
    case 'l6stairwell': {
      const underground = (s.floor ?? 0) === -1
      grp.add(box(1.1, 0.16, 1.1, '#282725', 0, 0.08, 0))
      grp.add(box(0.9, 0.08, 0.9, '#493426', 0, underground ? 0.12 : 0.22, 0))
      for (const q of [-0.42, 0.42]) { grp.add(cyl(0.035, 0.035, 0.85, '#5b3b2c', q, 0.48, -0.45, 7)); grp.add(cyl(0.035, 0.035, 0.85, '#5b3b2c', q, 0.48, 0.45, 7)) }
      break
    }
    case 'l6cave': {
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2
        const stone = new THREE.Mesh(new THREE.DodecahedronGeometry(0.26, 0), litMaterial({ color: '#1b1d1a', roughness: 1 }))
        stone.position.set(Math.cos(a) * 0.46, 0.42 + Math.sin(a) * 0.32, Math.sin(a) * 0.18); grp.add(stone)
      }
      break
    }
    case 'lightswitch': {
      // 「世界最安静的房间」墙上的电灯开关（官方警告：不要拨）——极小，0.16m 见方
      const d = wallDir(s, m)
      if (d === null) return null
      const sw = new THREE.Group()
      sw.add(box(0.16, 0.16, 0.02, '#c9c2a8', 0, 0, 0))       // 面板
      sw.add(box(0.05, 0.075, 0.035, '#b5ac8e', 0, 0.02, 0.024)) // 拨杆
      faceMount(sw, d, 0.028, 1.18)
      grp.add(sw)
      break
    }
    case 'tripwire': {
      // 绊线：贴地横拉的一根极细金属丝（绊到即切出 Level 6.1）
      const r = mulberry(s.x * 71 + s.y * 29)
      grp.add(box(1.04, 0.012, 0.012, '#3a3d40', 0, 0.08, 0))
      for (const px of [-0.5, 0.5]) grp.add(box(0.035, 0.1, 0.035, '#2e3134', px, 0.05, 0))
      grp.rotation.y = r() < 0.5 ? 0 : Math.PI / 2
      break
    }
    case 'rattrap': {
      // v53：尸鼠陷阱（L3 高智能尸鼠设置）——贴地小型捕兽夹：锈铁底板 + 张开的一对锯齿夹颚 + 中央诱饵踏板；
      // 玩家/实体踩上即触发（data.sprung=1，一次性；触发判定在 engine/movement.ts 与 entityAI.ts，模型保持不变）
      const r = mulberry(s.x * 131 + s.y * 67)
      const rusty = '#4a3c30', iron = '#3a3d40'
      grp.add(box(0.34, 0.02, 0.26, rusty, 0, 0.012, 0)) // 底板
      grp.add(box(0.1, 0.015, 0.12, '#5e5142', 0, 0.03, 0)) // 中央诱饵踏板
      for (const sgn of [-1, 1]) { // 一对张开的夹颚（斜立半框 + 锯齿）
        const jaw = new THREE.Group()
        jaw.add(box(0.3, 0.014, 0.02, iron, 0, 0, 0.09))
        jaw.add(box(0.3, 0.014, 0.02, iron, 0, 0, -0.09))
        jaw.add(box(0.02, 0.014, 0.18, iron, 0.14, 0, 0))
        for (let k = 0; k < 5; k++) jaw.add(box(0.016, 0.03, 0.014, iron, -0.11 + k * 0.055, 0.014, 0.09))
        for (let k = 0; k < 5; k++) jaw.add(box(0.016, 0.03, 0.014, iron, -0.11 + k * 0.055, 0.014, -0.09))
        jaw.position.set(sgn * 0.02, 0.035, 0)
        jaw.rotation.z = sgn * 1.15 // 向外张开
        grp.add(jaw)
      }
      grp.add(cyl(0.02, 0.02, 0.3, '#2e3134', 0, 0.03, -0.14, 6).rotateZ(Math.PI / 2)) // 尾部弹簧销
      grp.rotation.y = r() * Math.PI * 2 // 随机朝向（确定性）
      break
    }
    case 'braille': {
      // 前人刻在墙上的方向记号：一排小凹块，比墙略深
      const d = wallDir(s, m)
      if (d === null) return null
      const r = mulberry(s.x * 37 + s.y * 53)
      const ink = col(_def.palette.wall).multiplyScalar(0.45).getHex()
      const mark = (s.data?.mark as number | undefined) ?? 0
      const bg = new THREE.Group()
      const n = 3 + (mark % 3)
      for (let row = 0; row <= (mark === 3 ? 1 : 0); row++)
        for (let i = 0; i < n; i++)
          bg.add(box(0.035, 0.035 + r() * 0.028, 0.014, ink, -0.03 * (n - 1) + i * 0.06, -row * 0.07, 0))
      faceMount(bg, d, 0.016, 1.32)
      grp.add(bg)
      break
    }

    // ===================== v23：Level 7「Thalassophobia」 =====================
    case 'bookcase': {
      // 入口房间的木质立柜（可能 1×3）：三层隔板 + 书脊色块
      const len = Math.max(s.w, s.h) * 0.92
      const bh = 2.0
      const cabin = s.data?.cabin === 1
      const wood = cabin ? (s.looted ? '#3c4146' : '#565c62') : s.looted ? '#40301e' : '#5c4228'
      const frame = cabin ? '#6d737a' : '#6a4a2e'
      grp.add(box(len, bh, 0.42, wood, 0, bh / 2, 0))
      grp.add(box(len + 0.08, 0.07, 0.5, frame, 0, bh - 0.03, 0))
      grp.add(box(len + 0.08, 0.08, 0.5, frame, 0, 0.05, 0))
      if (cabin) {
        for (const ry of [0.7, 1.25, 1.8]) for (const rx of [-len / 2 + 0.1, len / 2 - 0.1])
          grp.add(glow(0.035, 0.035, 0.03, '#8a8f95', rx, ry, 0.225))
        grp.add(box(len, 0.04, 0.44, '#3a332b', 0, 1.18, 0.0))
      }
      const r = mulberry(s.x * 19 + s.y * 41)
      const spineC = ['#7a3a2e', '#3a4a6a', '#4a5a3a', '#6a5a2e', '#5a3a5a']
      for (let sh = 0; sh < 3; sh++) {
        const sy = 0.42 + sh * 0.53
        grp.add(box(len - 0.06, 0.05, 0.44, frame, 0, sy, 0.01)) // 隔板
        if (s.looted) continue // 已搜刮：书没了，只剩空隔板
        const nb = Math.max(3, Math.round(len / 0.36))
        const pick = Math.floor(r() * nb) // v54：确定性挑一本——搜刮时抽出微倾
        for (let i = 0; i < nb; i++) {
          const bw = (len - 0.12) / nb
          const bk = box(bw * 0.85, 0.3 + r() * 0.12, 0.26, spineC[Math.floor(r() * spineC.length)],
            -len / 2 + 0.06 + bw * (i + 0.5), sy + 0.2, 0.09)
          if (i === pick) movable(bk, 'book', sh)
          grp.add(bk)
        }
      }
      if (s.looted) grp.userData.open = 1
      faceOutward(grp, s, m)
      break
    }
    case 'barrel': {
      // 木桶（装杏仁水）：竖立圆柱（竖纹木板贴图，looted 变暗）+ 三道铁箍（v54 加顶箍）+ 桶盖跳开翻落桶边
      const body = new THREE.Mesh(
        new THREE.CylinderGeometry(0.3, 0.34, 0.88, 10),
        texLambert('barrel_wood', s.looted ? '#4a3420' : '#6a4a2e', '#3a2a18', s.looted ? '#8a7a68' : '#e8e2d2'),
      )
      body.position.set(0, 0.44, 0)
      grp.add(body)
      for (const hy of [0.24, 0.66]) {
        const hoop = new THREE.Mesh(new THREE.TorusGeometry(0.325, 0.03, 5, 12), new THREE.MeshLambertMaterial({ color: '#3a3a3c' }))
        hoop.rotation.x = Math.PI / 2
        hoop.position.y = hy
        grp.add(hoop)
      }
      const hoopT = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.028, 5, 12), new THREE.MeshLambertMaterial({ color: '#3a3a3c' }))
      hoopT.rotation.x = Math.PI / 2
      hoopT.position.y = 0.83
      grp.add(hoopT)
      const lid = cyl(0.29, 0.29, 0.05, '#5a3e26', 0, 0.9, 0, 10)
      movable(lid, 'lid') // 开启：向上跳起翻落到桶边地面
      grp.add(lid)
      if (s.looted) grp.userData.open = 1
      break
    }
    case 'rockisle': {
      // 未知岩石构成的小岛标记：几块大小不一的旋转岩块
      const r = mulberry(s.x * 91 + s.y * 13)
      for (let i = 0; i < 4; i++) {
        const sz = 0.3 + r() * 0.55
        const rock = box(sz, sz * (0.5 + r() * 0.5), sz * (0.7 + r() * 0.6),
          i % 2 ? '#55606a' : '#49535c', (r() - 0.5) * 0.85, sz * 0.28, (r() - 0.5) * 0.85)
        rock.rotation.set((r() - 0.5) * 0.5, r() * Math.PI, (r() - 0.5) * 0.5)
        grp.add(rock)
      }
      break
    }
    case 'bonepile': {
      // 骨堆：散骨 + 一具「下颌异常增大、腿末端成鳍」的类人骨架（v54：搜刮时散骨下沉四散、头骨微沉）
      const r = mulberry(s.x * 61 + s.y * 23)
      const bone = s.looted ? '#8c8a80' : '#cfcabb'
      for (let i = 0; i < 7; i++) {
        const b = box(0.05, 0.05, 0.26 + r() * 0.3, bone, (r() - 0.5) * 0.8, 0.05, (r() - 0.5) * 0.8)
        b.rotation.set(0, r() * Math.PI, (r() - 0.5) * 0.5)
        movable(b, 'bone', i)
        grp.add(b)
      }
      const sk = new THREE.Group()
      sk.position.set(0, 0, -0.12)
      sk.rotation.y = r() * Math.PI
      sk.add(box(0.2, 0.18, 0.22, bone, 0, 0.13, 0))          // 颅骨（小）
      sk.add(box(0.36, 0.18, 0.4, bone, 0, 0.06, 0.16))       // 夸张增大的下颌
      sk.add(box(0.05, 0.04, 0.03, '#141412', -0.055, 0.16, 0.11)) // 眼窝
      sk.add(box(0.05, 0.04, 0.03, '#141412', 0.055, 0.16, 0.11))
      for (const sgn of [-1, 1]) {
        sk.add(box(0.05, 0.05, 0.42, bone, sgn * 0.13, 0.05, -0.36))   // 腿骨
        sk.add(box(0.24, 0.03, 0.18, bone, sgn * 0.15, 0.03, -0.65))   // 末端成鳍
      }
      movable(sk, 'skull')
      grp.add(sk)
      if (s.looted) grp.userData.open = 1
      break
    }
    case 'fishbones': {
      // 不可理解的巨鱼骨架（3×2 瓦片）：一根长脊椎 + 两侧张开的十余根肋骨
      const bone = '#d2ccbb'
      const len = s.w * 0.92
      const y0 = 0.5
      const spine = cyl(0.06, 0.075, len, bone, 0, y0, 0, 6)
      spine.rotation.z = Math.PI / 2
      grp.add(spine)
      const n = 11
      for (let i = 0; i < n; i++) {
        const t = i / (n - 1)
        const px = -len / 2 + 0.2 + t * (len - 0.5)
        const rl = (0.4 + Math.sin(Math.PI * (0.15 + t * 0.75)) * 0.6) * s.h * 0.55
        for (const sgn of [-1, 1]) {
          const ang = sgn * 1.95 // 向两侧张开并微微下垂
          const rib = cyl(0.022, 0.038, rl, bone, px, y0 + Math.cos(ang) * rl / 2, Math.sin(ang) * rl / 2, 5)
          rib.rotation.x = ang
          grp.add(rib)
        }
      }
      const skull = box(0.42, 0.36, 0.5, bone, -len / 2 - 0.16, y0 - 0.05, 0)
      grp.add(skull)
      grp.add(box(0.5, 0.14, 0.44, bone, -len / 2 - 0.3, y0 - 0.22, 0)) // 张开的颚
      grp.add(cyl(0.05, 0.05, 0.55, bone, len / 2 + 0.12, y0 + 0.16, 0, 5)) // 尾鳍骨
      break
    }
    case 'seatarpit': {
      // 深渊的焦油与岩石堆：黑色黏稠堆体 + 正在上升的小气泡
      const r = mulberry(s.x * 83 + s.y * 47)
      const tarMat = new THREE.MeshLambertMaterial({ color: '#0b0c0e' })
      for (let i = 0; i < 4; i++) {
        const rad = 0.4 + r() * 0.42
        const blob = new THREE.Mesh(new THREE.CylinderGeometry(rad * 0.5, rad, 0.12 + r() * 0.18, 6), tarMat)
        blob.position.set((r() - 0.5) * s.w * 0.6, 0.07, (r() - 0.5) * s.h * 0.6)
        blob.rotation.y = r() * Math.PI
        grp.add(blob)
      }
      for (let i = 0; i < 3; i++) {
        const rk = box(0.3 + r() * 0.3, 0.22 + r() * 0.2, 0.3 + r() * 0.3, '#3a3f44',
          (r() - 0.5) * s.w * 0.7, 0.12, (r() - 0.5) * s.h * 0.7)
        rk.rotation.y = r() * Math.PI
        grp.add(rk)
      }
      if (s.data?.bubbles) {
        const bubMat = new THREE.MeshLambertMaterial({ color: '#1e2226' })
        for (let i = 0; i < 6; i++) {
          const b = new THREE.Mesh(new THREE.SphereGeometry(0.04 + r() * 0.05, 6, 4), bubMat)
          b.position.set((r() - 0.5) * s.w * 0.6, 0.18 + r() * 0.5, (r() - 0.5) * s.h * 0.6)
          grp.add(b)
        }
      }
      break
    }
    case 'seapillar': {
      // v58：水下石柱（环形场）——风化的灰绿岩柱：方形基座 + 收分柱身 + 柱头；三款变体（完整/断柱/倾斜）
      const v = Number(s.data?.v ?? 0)
      const stone = '#5f6a62', stoneD = '#46524a', moss = '#3d4a42'
      grp.add(box(0.78, 0.34, 0.78, stoneD, 0, 0.17, 0)) // 基座
      grp.add(box(0.64, 0.12, 0.64, moss, 0, 0.4, 0)) // 基座束腰
      if (v === 1) {
        // 断柱：半截柱身 + 断裂面 + 柱脚散石
        grp.add(cyl(0.24, 0.3, 1.5, stone, 0, 1.15, 0, 7))
        const cap = cyl(0.28, 0.24, 0.16, stoneD, 0, 1.94, 0, 7)
        cap.rotation.y = 0.4
        grp.add(cap)
        grp.add(box(0.34, 0.2, 0.3, stoneD, 0.42, 0.1, 0.3))
        grp.add(box(0.24, 0.14, 0.26, stone, -0.4, 0.07, -0.28))
      } else if (v === 2) {
        // 倾斜柱：整柱绕 z 微倾，柱头错位
        const lean = new THREE.Group()
        lean.rotation.z = 0.12
        lean.position.y = 0.34
        lean.add(cyl(0.22, 0.3, 2.6, stone, 0, 1.3, 0, 7))
        lean.add(box(0.6, 0.22, 0.6, stoneD, 0, 2.7, 0)) // 柱头
        grp.add(lean)
      } else {
        // 完整柱：收分柱身 + 环形箍线 + 柱头
        grp.add(cyl(0.23, 0.3, 3.0, stone, 0, 1.9, 0, 8))
        grp.add(cyl(0.3, 0.3, 0.1, stoneD, 0, 1.0, 0, 8))
        grp.add(cyl(0.28, 0.28, 0.1, stoneD, 0, 2.6, 0, 8))
        grp.add(box(0.62, 0.24, 0.62, stoneD, 0, 3.5, 0)) // 柱头方板
      }
      break
    }
    case 'seapipe': {
      // v58：水下管道（环形场）——锈蚀大口径管段：管身抬离海床、两端法兰环 + 支墩；data.deg 走向
      const deg = (((Number(s.data?.deg) || 0) % 360) + 360) % 360
      const rust = '#5a4636', rustD = '#3e2f24', band = '#6d5a44'
      const seg = new THREE.Group()
      seg.rotation.y = (deg * Math.PI) / 180
      const pipe = cyl(0.26, 0.26, 2.2, rust, 0, 0, 0, 10)
      pipe.rotation.z = Math.PI / 2 // 管身沿局部 x 横放
      seg.add(pipe)
      for (const px of [-1.02, 1.02]) { // 法兰环
        const fl = cyl(0.34, 0.34, 0.12, band, px, 0, 0, 10)
        fl.rotation.z = Math.PI / 2
        seg.add(fl)
      }
      const joint = cyl(0.29, 0.29, 0.2, rustD, 0.1, 0, 0, 10) // 中部接箍
      joint.rotation.z = Math.PI / 2
      seg.add(joint)
      for (const px of [-0.7, 0.7]) seg.add(box(0.3, 0.26, 0.4, rustD, px, -0.28, 0)) // 支墩
      seg.position.y = 0.56 // 管心抬高（支墩承托）
      grp.add(seg)
      break
    }
    case 'seadais': {
      // v58：环形场中心石台（3×3，可踏上 0.42m）——圆形整石台 + 外圈环形边饰 + 台面门位浅槽
      const stone = '#6a7168', stoneD = '#4e5750'
      const dais = cyl(1.42, 1.5, 0.34, stone, 0, 0.17, 0, 18)
      grp.add(dais)
      const trim = new THREE.Mesh(new THREE.TorusGeometry(1.42, 0.07, 8, 26), new THREE.MeshLambertMaterial({ color: stoneD }))
      trim.rotation.x = -Math.PI / 2
      trim.position.y = 0.36
      grp.add(trim)
      const top = cyl(1.3, 1.3, 0.06, '#768077', 0, 0.39, 0, 18) // 台面抹面
      grp.add(top)
      // 台面中央门位浅槽（木门出口嵌在此处；见 buildExit 'littledoor'）
      grp.add(box(1.2, 0.025, 1.3, '#5a645c', 0, 0.415, 0))
      break
    }


    case 'ropeanchor': {
      // L7 门廊入口系缆桩。绳索模型始终构建，visible 由 data.deployed 控制——
      // 玩家使用尼龙绳后 updateStructs 立即把绳索显示出来（旧实现只在首次构建时判 deployed，部署后不可见）。
      const floorS = floorHeight(m, s.x + 0.5, s.y + 0.5, s.floor ?? 0)
      // 锈蚀钢制系缆桩（双耳板 + 横销）
      grp.add(box(0.16, 0.12, 0.1, '#4c5258', -0.09, 0.06, 0))
      grp.add(box(0.16, 0.12, 0.1, '#4c5258', 0.09, 0.06, 0))
      grp.add(cyl(0.035, 0.035, 0.5, '#5b6269', 0, 0.26, 0, 8))
      grp.add(cyl(0.02, 0.02, 0.06, '#2f3337', 0.1, 0.34, 0, 6).rotateZ(Math.PI / 2))
      const topX = s.x + Number(s.data?.ropeDX ?? 0) + 0.5
      const topY = s.y + Number(s.data?.ropeDY ?? 0) + 0.5
      const baseX = s.x + Number(s.data?.baseDX ?? 0) + 0.5
      const baseY = s.y + Number(s.data?.baseDY ?? 1) + 0.5
      const topH = floorHeight(m, topX, topY, s.floor ?? 0)
      const baseH = 0.03
      const ropeGrp = new THREE.Group()
      // 三段点：系缆桩（门廊入口）→ 门廊出口 → 出口外一格的海面
      const pts = [
        { x: 0, y: 0.34, z: 0 },
        { x: topX - (s.x + 0.5), y: topH - floorS + 0.34, z: topY - (s.y + 0.5) },
        { x: baseX - (s.x + 0.5), y: baseH - floorS, z: baseY - (s.y + 0.5) },
      ]
      const ropeSeg = (a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }) => {
        const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z
        const len = Math.hypot(dx, dy, dz)
        if (len < 0.01) return
        const nx = dx / len, ny = dy / len, nz = dz / len
        const rope = cyl(0.03, 0.03, len, '#e2dcc8', 0, 0, 0, 7)
        rope.position.set(a.x + dx * 0.5, a.y + dy * 0.5, a.z + dz * 0.5)
        rope.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(nx, ny, nz))
        ropeGrp.add(rope)
      }
      ropeSeg(pts[0], pts[1]) // 门廊入口 → 门廊出口（沿门廊向前延伸）
      ropeSeg(pts[1], pts[2]) // 门廊出口外一格 → 海平面（向下垂落）
      const knot = new THREE.Mesh(new THREE.SphereGeometry(0.055, 7, 5), new THREE.MeshLambertMaterial({ color: '#c9c2aa' }))
      knot.position.set(pts[1].x, pts[1].y, pts[1].z)
      ropeGrp.add(knot)
      ropeGrp.visible = s.data?.deployed === 1
      grp.add(ropeGrp)
      grp.userData.ropeGrp = ropeGrp
      break
    }

    // ===================== v23：Level 8「洞穴系统」 ====================
    case 'stalagspike': {
      // 钟乳石/石笋簇：每根由连续收尖、轻微弯折的三段岩柱组成；所有根部都从 y=0 起，
      // 再由整簇锚定真实洞底或翻转到真实洞顶，彻底避免旧模型根部悬空。
      const knot = Number(s.data?.knot ?? 0)
      const r = mulberry(Number(s.data?.sid ?? 0) ^ Math.floor(s.x * 113 + s.y * 67))
      const rock = caveRockMaterial(s.data?.tex, 0.94)
      const n = 3 + Math.floor(r() * 3)
      const formation = new THREE.Group()
      const up = new THREE.Vector3(0, 1, 0)
      const ground = floorHeight(m, cx, cz, 0)
      const roof = caveCeilingAt(m, cx, cz)
      const requestedScale = Number(s.data?.scale ?? 1)
      const safeScale = Math.min(requestedScale, Math.max(0.5, (roof - ground - 0.35) / 2.35))
      const addSpike = (rx: number, rz: number, height: number, radius: number, leanX: number, leanZ: number) => {
        // 每根根部都读取它实际占据位置的零等值面，而不是让整簇共用中心高度；坡面上也会逐根咬入岩面。
        // 洞顶簇经 rotation.z 翻转会镜像局部 X，因此顶面采样同步使用镜像后的世界坐标。
        const rootY = s.data?.ceiling === 1
          ? (roof - caveCeilingAt(m, cx - rx * safeScale, cz + rz * safeScale)) / safeScale
          : (floorHeight(m, cx + rx * safeScale, cz + rz * safeScale, 0) - ground) / safeScale
        // 根部宽大的方解石沉积裙边把模型压进曲面几厘米，任何坡度下都不会露缝。
        const skirt = new THREE.Mesh(new THREE.DodecahedronGeometry(radius * 1.75, 1), rock)
        skirt.scale.set(1.25, 0.32, 1.1)
        skirt.position.set(rx, rootY + radius * 0.12 - 0.025, rz)
        skirt.rotation.y = r() * Math.PI
        formation.add(skirt)
        let pos = new THREE.Vector3(rx, rootY, rz)
        let dir = new THREE.Vector3(leanX, 1, leanZ).normalize()
        let lower = radius
        const portions = knot === 2 ? [0.34, 0.28, 0.22, 0.16] : [0.43, 0.34, 0.23]
        for (let k = 0; k < portions.length; k++) {
          const len = height * portions[k]
          const upper = k === portions.length - 1 ? 0.006 : lower * (0.58 + r() * 0.08)
          const geo = new THREE.CylinderGeometry(upper, lower, len, 8, 2, false)
          const seg = new THREE.Mesh(geo, rock)
          seg.quaternion.setFromUnitVectors(up, dir)
          seg.position.copy(pos).addScaledVector(dir, len * 0.5)
          seg.rotation.y += r() * 0.35
          formation.add(seg)
          pos = pos.clone().addScaledVector(dir, len * 0.96)
          const bend = knot === 1 ? 0.18 : knot === 3 ? 0.11 : 0.055
          dir = dir.clone().add(new THREE.Vector3((r() - 0.5) * bend, -0.015, (r() - 0.5) * bend)).normalize()
          lower = upper * 1.06
        }
      }
      for (let i = 0; i < n; i++) {
        const a = r() * Math.PI * 2, spread = i === 0 ? 0 : 0.1 + r() * 0.27
        const height = 0.72 + r() * 0.92 + (i === 0 ? 0.32 : 0)
        const radius = 0.085 + r() * 0.075 + (i === 0 ? 0.035 : 0)
        const lean = 0.025 + r() * (knot === 1 ? 0.2 : 0.11)
        addSpike(Math.cos(a) * spread, Math.sin(a) * spread, height, radius, Math.cos(a) * lean, Math.sin(a) * lean)
      }
      formation.scale.setScalar(safeScale)
      formation.rotation.y = Number(s.data?.rot ?? 0)
      if (s.data?.ceiling === 1) {
        // 同一簇模型翻转并锚定到体积洞顶，根部裙边与平滑等值面相交约 2.5cm。
        formation.position.y = roof - ground
        formation.rotation.z = Math.PI
      }
      grp.add(formation)
      break
    }
    case 'handspike': {
      // 巨臂林地手形岩刺：体型、倾斜和手势由区块实例决定；moss 个体沿岩纹发红光。
      const moss = !!s.data?.moss
      const scale = Math.max(0.42, Math.min(2.5, Number(s.data?.scale ?? 1)))
      const pose = Math.max(0, Math.min(4, Number(s.data?.pose ?? 0) | 0))
      // 几何与材质均按五种手势/苔藓状态共享；单个实例只需创建 Mesh 并写入变换。
      const mesh = new THREE.Mesh(handSpikeGeometry(pose), handSpikeMaterial(moss))
      mesh.rotation.set(Number(s.data?.leanX ?? 0), Number(s.data?.rot ?? 0), Number(s.data?.leanZ ?? 0))
      mesh.scale.setScalar(scale)
      grp.add(mesh)
      break
    }
    case 'bloodmoss': {
      const rr = mulberry(Number(s.data?.sid ?? 0) ^ 0xb100d)
      const tex = bloodMossTexture()
      const mat = litMaterial({
        // Canvas 透明度直接作为轮廓；不要把偏红纹理同时塞进 alphaMap（其绿色通道会把血苔错误压暗）。
        color: '#f2b0aa', map: tex, transparent: true, alphaTest: 0.06,
        depthWrite: false, side: THREE.DoubleSide, bumpMap: tex, bumpScale: 0.026,
        roughness: 0.72, envBase: 0.18, emissive: '#b3131b', emissiveMap: tex, emissiveIntensity: 0.78,
        polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1,
      })
      const count = Math.max(24, Math.min(130, Number(s.data?.count ?? 72)))
      const baseGround = floorHeight(m, cx, cz, 0)
      const baseVisualGround = visualCaveFloor(m, cx, cz)
      const patchGround = (x: number, z: number) => baseGround + visualCaveFloor(m, x, z) - baseVisualGround
      const groundGeo = new THREE.CircleGeometry(1, 10); groundGeo.rotateX(-Math.PI / 2)
      const wallGeo = new THREE.PlaneGeometry(1, 1)
      const groundMoss = new THREE.InstancedMesh(groundGeo, mat, count)
      const wallMoss = new THREE.InstancedMesh(wallGeo, mat, count)
      const dummy = new THREE.Object3D(), up = new THREE.Vector3(0, 1, 0), normal = new THREE.Vector3()
      let groundCount = 0, wallCount = 0
      for (let tries = 0; tries < count * 7 && groundCount + wallCount < count; tries++) {
        const ox = (rr() - 0.5) * (s.w - 1), oz = (rr() - 0.5) * (s.h - 1)
        const px = cx + ox, pz = cz + oz, tx = Math.floor(px), tz = Math.floor(pz)
        if (tx < 1 || tz < 1 || tx >= m.w - 1 || tz >= m.h - 1 || m.tiles[tz * m.w + tx] !== 1) continue
        const wallDirs = ([[1, 0], [-1, 0], [0, 1], [0, -1]] as const).filter(([dx, dz]) => m.tiles[(tz + dz) * m.w + tx + dx] !== 1)
        if (wallDirs.length && rr() < 0.4) {
          const [dx, dz] = wallDirs[Math.floor(rr() * wallDirs.length)]
          const w = 0.65 + rr() * 1.35, h = 0.42 + rr() * 1.2
          const wx = tx + 0.5 + dx * 0.505, wz = tz + 0.5 + dz * 0.505
          dummy.position.set(wx - cx, patchGround(tx + 0.5, tz + 0.5) - baseGround + 0.3 + h * 0.5, wz - cz)
          dummy.rotation.set(0, dx !== 0 ? Math.PI / 2 : 0, 0); dummy.scale.set(w, h, 1); dummy.updateMatrix()
          wallMoss.setMatrixAt(wallCount++, dummy.matrix)
        } else {
          const eps = 0.24
          const hL = patchGround(px - eps, pz), hR = patchGround(px + eps, pz)
          const hD = patchGround(px, pz - eps), hU = patchGround(px, pz + eps)
          normal.set(hL - hR, eps * 2, hD - hU).normalize()
          dummy.position.set(ox, patchGround(px, pz) - baseGround + 0.028, oz)
          dummy.quaternion.setFromUnitVectors(up, normal); dummy.rotateY(rr() * Math.PI * 2)
          dummy.scale.set(0.35 + rr() * 0.82, 1, 0.28 + rr() * 0.65); dummy.updateMatrix()
          groundMoss.setMatrixAt(groundCount++, dummy.matrix)
        }
      }
      for (const [mesh, n] of [[groundMoss, groundCount], [wallMoss, wallCount]] as const) if (n > 0) {
        mesh.count = n; mesh.instanceMatrix.needsUpdate = true; mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage)
        mesh.renderOrder = 2; mesh.frustumCulled = false; mesh.userData.noCastShadow = 1; grp.add(mesh)
      }
      break
    }
    case 'handweather': {
      const rr = mulberry(Number(s.data?.sid ?? 0) ^ 0x5702e7)
      const baseGround = floorHeight(m, cx, cz, 0)
      const anchorX = Number(s.data?.anchorX ?? 0), anchorZ = Number(s.data?.anchorY ?? 0)
      const cloudPos: number[] = []
      for (let i = 0; i < 74; i++) {
        const ox = (rr() - 0.5) * (s.w - 2), oz = (rr() - 0.5) * (s.h - 2)
        const px = cx + ox, pz = cz + oz
        const roof = visualCaveRoof(m, px, pz), ground = visualCaveFloor(m, px, pz)
        if (roof - ground < 6.5) continue
        cloudPos.push(ox, roof - baseGround - 0.35 - rr() * 0.8, oz)
      }
      const cloudGeo = new THREE.BufferGeometry()
      cloudGeo.setAttribute('position', new THREE.Float32BufferAttribute(cloudPos, 3))
      const clouds = new THREE.Points(cloudGeo, new THREE.PointsMaterial({
        color: '#8390a1', map: caveCloudTexture(), size: 3.4, transparent: true, opacity: 0.24,
        alphaTest: 0.015, depthWrite: false, sizeAttenuation: true, fog: true,
      }))
      clouds.frustumCulled = false; clouds.userData.noCastShadow = 1; grp.add(clouds)

      const rainCount = Math.max(80, Math.min(260, Number(s.data?.count ?? 180)))
      const rainPos = new Float32Array(rainCount * 6), rainBase = new Float32Array(rainCount * 2)
      const rainBounds = new Float32Array(rainCount * 3)
      for (let i = 0; i < rainCount; i++) {
        let ox = 0, oz = 0, ground = -100, roof = -99, valid = false
        // 只把雨线落在真实的高净空洞内，避免穿过低隧道、岩柱或封闭岩体。
        for (let attempt = 0; attempt < 12; attempt++) {
          ox = (rr() - 0.5) * (s.w - 2); oz = (rr() - 0.5) * (s.h - 2)
          const tx = Math.floor(cx + ox), tz = Math.floor(cz + oz)
          if (tx < 0 || tz < 0 || tx >= m.w || tz >= m.h || m.tiles[tz * m.w + tx] !== 1) continue
          ground = visualCaveFloor(m, cx + ox, cz + oz) - baseGround + 0.12
          roof = visualCaveRoof(m, cx + ox, cz + oz) - baseGround - 0.7
          if (roof - ground > 4.2) { valid = true; break }
        }
        if (!valid) { ox = -999; oz = -999; ground = -100; roof = -99 }
        const y = ground + rr() * Math.max(0.4, roof - ground)
        rainPos.set([ox, y, oz, ox + 0.12, y - 0.52, oz + 0.025], i * 6)
        rainBase.set([ox, oz], i * 2); rainBounds.set([ground, roof, 3.8 + rr() * 4.7], i * 3)
      }
      const rainGeo = new THREE.BufferGeometry(); rainGeo.setAttribute('position', new THREE.BufferAttribute(rainPos, 3))
      const rainMat = new THREE.LineBasicMaterial({ color: '#a9bfd0', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending })
      const rain = new THREE.LineSegments(rainGeo, rainMat); rain.frustumCulled = false; rain.userData.noCastShadow = 1; grp.add(rain)

      const auroras: THREE.Mesh[] = []
      if (s.data?.aurora) for (let a = 0; a < 3; a++) {
        const geo = new THREE.PlaneGeometry(8 + rr() * 5, 2.4 + rr() * 1.8, 18, 3)
        const pos = geo.attributes.position as THREE.BufferAttribute
        for (let i = 0; i < pos.count; i++) pos.setZ(i, Math.sin(pos.getX(i) * 0.7 + a * 1.9) * 0.32)
        pos.needsUpdate = true; geo.computeVertexNormals()
        const am = new THREE.MeshBasicMaterial({
          color: a === 1 ? '#55c9c0' : a === 2 ? '#8e6fd3' : '#69d890', side: THREE.DoubleSide,
          transparent: true, opacity: 0.055, blending: THREE.AdditiveBlending, depthWrite: false, fog: true,
        })
        const curtain = new THREE.Mesh(geo, am)
        curtain.position.set(anchorX + (rr() - 0.5) * 4.5, visualCaveRoof(m, cx + anchorX, cz + anchorZ) - baseGround - 2.3 - a * 0.45, anchorZ + (rr() - 0.5) * 4.5)
        curtain.rotation.y = rr() * Math.PI; curtain.userData.noCastShadow = 1; auroras.push(curtain); grp.add(curtain)
      }

      const boltPos: number[] = []
      let bx = anchorX + (rr() - 0.5) * 3.6, bz = anchorZ + (rr() - 0.5) * 3.6
      let by = visualCaveRoof(m, cx + bx, cz + bz) - baseGround - 0.8
      const bottom = visualCaveFloor(m, cx + bx, cz + bz) - baseGround + 0.45
      for (let i = 0; i < 12; i++) {
        const nx = bx + (rr() - 0.5) * 0.7, nz = bz + (rr() - 0.5) * 0.7
        const ny = by + (bottom - by) / (12 - i)
        boltPos.push(bx, by, bz, nx, ny, nz)
        if (i > 2 && i < 9 && rr() < 0.38) boltPos.push(nx, ny, nz, nx + (rr() - 0.5) * 1.6, ny - 0.45 - rr(), nz + (rr() - 0.5) * 1.6)
        bx = nx; by = ny; bz = nz
      }
      const boltGeo = new THREE.BufferGeometry(); boltGeo.setAttribute('position', new THREE.Float32BufferAttribute(boltPos, 3))
      const boltMat = new THREE.LineBasicMaterial({ color: '#d8e9ff', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false })
      const bolt = new THREE.LineSegments(boltGeo, boltMat); bolt.visible = false; bolt.userData.noCastShadow = 1; grp.add(bolt)
      const flash = new THREE.PointLight('#b8d6ff', 0, 19, 2)
      flash.position.set(boltPos[0] ?? 0, (boltPos[1] ?? 5) - 1.2, boltPos[2] ?? 0); flash.castShadow = false; flash.visible = false; grp.add(flash)
      grp.userData.handWeather = {
        clouds, rain, rainBase, rainBounds, rainMat, auroras, bolt, boltMat, flash,
        storm: !!s.data?.storm, phase: Number(s.data?.phase ?? 0), period: Number(s.data?.period ?? 24),
      }
      break
    }
    case 'glowshroom': {
      // 罗特尼斯大丛林的生物发光蘑菇：tall 时能长到小树大小
      const hues = ['#66e0d0', '#e066c8', '#c8e066', '#66a8e0', '#e0a066', '#a066e0']
      const hue = hues[Math.min(hues.length - 1, Math.max(0, (s.data?.hue as number | undefined) ?? 0))]
      const tall = !!s.data?.tall
      const r = mulberry(s.x * 167 + s.y * 73)
      const hgt = tall ? 2.2 : 0.5 + r() * 0.35
      const k = tall ? 1 : 0.42
      grp.add(cyl(0.07 * k * 1.4, 0.11 * k * 1.4, hgt, '#ddd6c0', 0, hgt / 2, 0, 7)) // 菌柄
      const capR = tall ? 0.62 : 0.24
      const cap = new THREE.Mesh(
        new THREE.SphereGeometry(capR, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2),
        new THREE.MeshBasicMaterial({ color: hue }),
      )
      cap.position.y = hgt - 0.02
      cap.scale.y = 0.8
      grp.add(cap)
      const aura = new THREE.Mesh(
        new THREE.SphereGeometry(capR * 1.18, 10, 6),
        new THREE.MeshBasicMaterial({ color: hue, transparent: true, opacity: 0.1, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }),
      )
      aura.position.y = hgt - 0.01; aura.scale.y = 0.72; aura.userData.noCastShadow = 1; grp.add(aura)
      grp.add(cyl(capR * 0.92, capR * 0.55, 0.07, '#8a8272', 0, hgt - 0.05, 0, 10)) // 菌褶
      if (tall) for (let i = 0; i < 2; i++) { // 大株带几朵小的
        const sm = new THREE.Mesh(new THREE.SphereGeometry(0.13, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshBasicMaterial({ color: hue }))
        const px = (r() - 0.5) * 0.7, pz = (r() - 0.5) * 0.7
        grp.add(cyl(0.03, 0.045, 0.3, '#ddd6c0', px, 0.15, pz, 6))
        sm.position.set(px, 0.3, pz)
        grp.add(sm)
      }
      break
    }
    case 'tarhands': {
      // 焦油之手：95°C 的焦油池 + 2–3 条覆满焦油的手臂伸出来
      const r = mulberry(s.x * 143 + s.y * 91)
      const tarMat = new THREE.MeshLambertMaterial({ color: '#0d0c0e' })
      tarMat.emissive = col('#2a0d04') // 轻微暖色余温
      tarMat.emissiveIntensity = 0.4
      const pool = new THREE.Mesh(new THREE.CylinderGeometry(s.w * 0.44, s.w * 0.5, 0.1, 10), tarMat)
      pool.position.y = 0.05
      grp.add(pool)
      const n = 2 + Math.floor(r() * 2)
      for (let i = 0; i < n; i++) {
        const arm = new THREE.Group()
        arm.position.set((r() - 0.5) * s.w * 0.55, 0.06, (r() - 0.5) * s.h * 0.55)
        arm.rotation.y = r() * Math.PI * 2
        const l1 = 0.5 + r() * 0.35
        const upper = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.105, l1, 7), tarMat)
        upper.position.set(0, l1 / 2, 0)
        upper.rotation.z = 0.2
        arm.add(upper)
        const fore = new THREE.Group() // 弯曲的肢体
        fore.position.set(-0.1 * l1, l1 * 0.95, 0)
        fore.rotation.z = -0.8
        const l2 = 0.4 + r() * 0.25
        const f2 = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.078, l2, 7), tarMat)
        f2.position.y = l2 / 2
        fore.add(f2)
        const palm = new THREE.Group()
        palm.position.y = l2 + 0.04
        palm.add(new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.14, 0.075), tarMat))
        for (let f = 0; f < 3; f++) {
          const fg = new THREE.Mesh(new THREE.BoxGeometry(0.038, 0.14, 0.038), tarMat)
          fg.position.set(-0.048 + f * 0.048, 0.12, 0)
          fg.rotation.z = (f - 1) * 0.3
          palm.add(fg)
        }
        fore.add(palm)
        arm.add(fore)
        grp.add(arm)
      }
      break
    }
    case 'roadsign': {
      // 第九大道路标：杆 + 方牌 + M.E.G. 标志
      grp.add(cyl(0.035, 0.045, 2.0, '#7a7570', 0, 1.0, 0, 6))
      const bd = new THREE.Group()
      bd.position.y = 1.72
      bd.add(box(0.66, 0.5, 0.05, '#d8d2c4', 0, 0, 0))
      for (const zz of [0.031, -0.031]) { // 双面
        const em = megEmblem(0.15, '#2e4a6a')
        em.position.set(-0.19, 0, zz)
        if (zz < 0) em.rotation.y = Math.PI
        bd.add(em)
        for (let i = 0; i < 3; i++) {
          const bar = box(0.3, 0.035, 0.012, '#3a3a3c', 0.11, 0.11 - i * 0.1, zz)
          bd.add(bar)
        }
      }
      grp.add(bd)
      break
    }
    case 'campstall': {
      // Hollow Nest 营地摊位：木台 + 顶棚布 + 补给箱 + 一盏小灯
      const w2 = s.w * 0.9, d2 = s.h * 0.85
      grp.add(box(w2, 0.1, d2, '#6a4a2e', 0, 0.85, 0))
      for (const [px, pz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const)
        grp.add(box(0.08, 0.85, 0.08, '#4a3420', px * w2 * 0.44, 0.42, pz * d2 * 0.4))
      for (const px of [-1, 1]) {
        grp.add(box(0.07, 2.0, 0.07, '#4a3420', px * w2 * 0.46, 1.0, -d2 * 0.42))
        grp.add(box(0.07, 1.72, 0.07, '#4a3420', px * w2 * 0.46, 0.86, d2 * 0.42))
      }
      const canopy = new THREE.Mesh(
        new THREE.PlaneGeometry(w2 + 0.3, d2 + 0.45),
        new THREE.MeshLambertMaterial({ color: '#8a5a3a', side: THREE.DoubleSide }),
      )
      canopy.rotation.x = -Math.PI / 2 + 0.3
      canopy.position.set(0, 1.86, 0.02)
      movable(canopy, 'lid') // v54：搜刮时摊布前缘掀起
      grp.add(canopy)
      grp.add(box(0.32, 0.28, 0.3, s.looted ? '#3a4429' : '#4d5a33', -w2 * 0.26, 1.04, 0))
      grp.add(box(0.26, 0.24, 0.26, '#5a4030', w2 * 0.22, 1.02, -0.06))
      grp.add(box(0.2, 0.07, 0.28, '#8a8578', w2 * 0.02, 0.94, d2 * 0.22))
      grp.add(glow(0.11, 0.11, 0.11, '#ffcf8a', 0, 1.66, d2 * 0.3))
      if (s.looted) grp.userData.open = 1
      break
    }
    case 'cavemoss': {
      const rr = mulberry(Number(s.data?.sid ?? 0) ^ 0x6a113)
      const colors = ['#a6b58c', '#b2bc91', '#9daa7b', '#93a68b']
      const mossTex = levelTexture('l8_rottnest_moss.png', () => noiseTexture('#38593a', '#596b3f'))
      if (!mossTex.userData.rottnestConfigured) {
        mossTex.colorSpace = THREE.SRGBColorSpace
        mossTex.anisotropy = Math.max(mossTex.anisotropy, 4)
        mossTex.needsUpdate = true
        mossTex.userData.rottnestConfigured = 1
      }
      const mat = litMaterial({
        color: colors[Number(s.data?.hue ?? 0) % colors.length], map: mossTex,
        bumpMap: mossTex, bumpScale: 0.032, roughness: 0.68, envBase: 0.24,
      })
      const wanted = Math.max(8, Math.min(220, Number(s.data?.count ?? 80)))
      const mesh = new THREE.InstancedMesh(new THREE.CircleGeometry(0.22, 8), mat, wanted)
      const dummy = new THREE.Object3D(), baseGround = floorHeight(m, cx, cz, 0)
      let emitted = 0
      for (let tries = 0; tries < wanted * 8 && emitted < wanted; tries++) {
        const ox = (rr() - 0.5) * (s.w - 1), oz = (rr() - 0.5) * (s.h - 1)
        const px = cx + ox, pz = cz + oz, tx = Math.floor(px), tz = Math.floor(pz)
        if (tx < 0 || tz < 0 || tx >= m.w || tz >= m.h || m.tiles[tz * m.w + tx] !== 1 || m.liquid[tz * m.w + tx] === 1) continue
        dummy.position.set(ox, floorHeight(m, px, pz, 0) - baseGround + 0.012, oz)
        dummy.rotation.set(-Math.PI / 2, 0, rr() * Math.PI * 2)
        dummy.scale.set(0.65 + rr() * 1.7, 0.55 + rr() * 1.35, 1)
        dummy.updateMatrix(); mesh.setMatrixAt(emitted++, dummy.matrix)
      }
      mesh.count = emitted; mesh.instanceMatrix.needsUpdate = true; mesh.userData.noCastShadow = 1; grp.add(mesh)
      break
    }
    case 'cavefern': {
      const rr = mulberry(Number(s.data?.sid ?? 0) ^ 0xf311)
      const shades = ['#476c43', '#5d7747', '#36583c', '#6d7d4e']
      const mat = new THREE.MeshLambertMaterial({ color: shades[Number(s.data?.hue ?? 0) % shades.length], side: THREE.DoubleSide })
      const leafGeos: THREE.BufferGeometry[] = []
      for (let f = 0; f < 6; f++) {
        const a = f / 6 * Math.PI * 2
        const stem = new THREE.PlaneGeometry(0.018, 0.48)
        stem.translate(0, 0.24, 0); stem.rotateZ((f % 2 ? 1 : -1) * 0.38); stem.rotateY(a); leafGeos.push(stem)
        for (let j = 1; j <= 4; j++) for (const side of [-1, 1]) {
          const leaf = new THREE.PlaneGeometry(0.11 - j * 0.011, 0.04)
          leaf.rotateZ(side * (0.72 + j * 0.06))
          leaf.translate(side * (0.035 + j * 0.009), 0.07 + j * 0.085, 0.002)
          leaf.rotateY(a); leafGeos.push(leaf)
        }
      }
      const fernGeo = mergeGeometries(leafGeos, false) ?? new THREE.PlaneGeometry(0.28, 0.48)
      const wanted = Math.max(8, Math.min(180, Number(s.data?.count ?? 70)))
      const mesh = new THREE.InstancedMesh(fernGeo, mat, wanted)
      const dummy = new THREE.Object3D(), baseGround = floorHeight(m, cx, cz, 0)
      let emitted = 0
      for (let tries = 0; tries < wanted * 8 && emitted < wanted; tries++) {
        const ox = (rr() - 0.5) * (s.w - 1), oz = (rr() - 0.5) * (s.h - 1)
        const px = cx + ox, pz = cz + oz, tx = Math.floor(px), tz = Math.floor(pz)
        if (tx < 0 || tz < 0 || tx >= m.w || tz >= m.h || m.tiles[tz * m.w + tx] !== 1 || m.liquid[tz * m.w + tx] === 1) continue
        const scale = 0.62 + rr() * 0.78
        dummy.position.set(ox, floorHeight(m, px, pz, 0) - baseGround + 0.01, oz)
        dummy.rotation.set(0, rr() * Math.PI * 2, 0); dummy.scale.set(scale, scale, scale)
        dummy.updateMatrix(); mesh.setMatrixAt(emitted++, dummy.matrix)
      }
      mesh.count = emitted; mesh.instanceMatrix.needsUpdate = true; mesh.userData.noCastShadow = 1; grp.add(mesh)
      break
    }
    case 'fungalmat': {
      const rr = mulberry(Number(s.data?.sid ?? 0) ^ 0x45f6a)
      const wanted = Math.max(12, Math.min(260, Number(s.data?.count ?? 140)))
      const fungalTex = levelTexture('l8_movile_fungalmat.png', () => noiseTexture('#68704a', '#949064'))
      if (!fungalTex.userData.movileConfigured) {
        fungalTex.colorSpace = THREE.SRGBColorSpace
        fungalTex.anisotropy = Math.max(fungalTex.anisotropy, 4)
        fungalTex.needsUpdate = true
        fungalTex.userData.movileConfigured = 1
      }
      // 同一张独特菌毯图既提供颜色，也以低强度 bump 表现菌丝/菌落起伏；中等粗糙度和
      // 环境反射呈现潮湿膜层，但保持非金属，避免像塑料地板。
      const mat = litMaterial({
        color: '#ffffff', map: fungalTex, bumpMap: fungalTex, bumpScale: 0.045,
        roughness: 0.58, metalness: 0, envBase: 0.34, side: THREE.DoubleSide,
        polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1,
        // 极弱的菌膜自发光只负责保留暗部色彩；真实高光/凹凸仍由菌盖弱点光与环境反射产生。
        emissive: '#48543b', emissiveMap: fungalTex, emissiveIntensity: 0.2,
      })
      // 体积洞穴的地面不是平面。旧实现只按每片菌毯中心取一次高度，再放一张水平
      // CircleGeometry；在新莫维勒的起伏洞底，大部分圆片会被岩面盖住，玩家看到的其实是
      // 下方的黑色岩石。这里把每个扇形顶点逐一投到真实洞底，既贴合坡面，也保留完整 UV。
      const positions: number[] = [], uvs: number[] = []
      const baseGround = floorHeight(m, cx, cz, 0)
      let emitted = 0
      for (let tries = 0; tries < wanted * 9 && emitted < wanted; tries++) {
        const ox = (rr() - 0.5) * (s.w - 0.6), oz = (rr() - 0.5) * (s.h - 0.6)
        const px = cx + ox, pz = cz + oz, tx = Math.floor(px), tz = Math.floor(pz)
        if (tx < 0 || tz < 0 || tx >= m.w || tz >= m.h || m.tiles[tz * m.w + tx] !== 1 || m.liquid[tz * m.w + tx] === 1) continue
        const rx = 0.34 + rr() * 0.62, rz = 0.28 + rr() * 0.5
        const rot = rr() * Math.PI * 2, lift = 0.028 + rr() * 0.008, seg = 12
        const ring: { x: number; y: number; z: number; u: number; v: number }[] = []
        let fits = true
        for (let j = 0; j < seg; j++) {
          const a = rot + j / seg * Math.PI * 2
          const lx = ox + Math.cos(a) * rx, lz = oz + Math.sin(a) * rz
          const wx = cx + lx, wz = cz + lz, qx = Math.floor(wx), qz = Math.floor(wz)
          if (qx < 0 || qz < 0 || qx >= m.w || qz >= m.h || m.tiles[qz * m.w + qx] !== 1 || m.liquid[qz * m.w + qx] === 1) { fits = false; break }
          ring.push({
            x: lx, y: floorHeight(m, wx, wz, 0) - baseGround + lift, z: lz,
            u: 0.5 + Math.cos(a - rot) * 0.5, v: 0.5 + Math.sin(a - rot) * 0.5,
          })
        }
        if (!fits) continue
        const cy = floorHeight(m, px, pz, 0) - baseGround + lift
        for (let j = 0; j < seg; j++) {
          const cur = ring[j], next = ring[(j + 1) % seg]
          // center→next→current：从上方观察为逆时针，法线朝向洞内。
          positions.push(ox, cy, oz, next.x, next.y, next.z, cur.x, cur.y, cur.z)
          uvs.push(0.5, 0.5, next.u, next.v, cur.u, cur.v)
        }
        emitted++
      }
      if (positions.length) {
        const geo = new THREE.BufferGeometry()
        geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
        geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
        geo.computeVertexNormals(); geo.computeBoundingBox(); geo.computeBoundingSphere()
        const mesh = new THREE.Mesh(geo, mat)
        mesh.renderOrder = 1
        mesh.userData.noCastShadow = 1
        grp.add(mesh)
      }
      break
    }
    case 'cavefloat': {
      // 断层室里的重力异常碎岩：破碎主岩、断面副块和碎屑共用真实 PBR 岩性。
      const rr = mulberry(s.x * 181 + s.y * 97)
      const z = Number(s.data?.z ?? 1.8), sc = Number(s.data?.scale ?? 1)
      const rockMat = caveRockMaterial('breakdown', 1.02)
      const mainGeo = new THREE.DodecahedronGeometry(0.39 * sc, 2)
      const pos = mainGeo.attributes.position as THREE.BufferAttribute
      for (let i = 0; i < pos.count; i++) {
        const k = 0.84 + rr() * 0.3
        pos.setXYZ(i, pos.getX(i) * k * 1.3, pos.getY(i) * (0.62 + rr() * 0.18), pos.getZ(i) * k)
      }
      mainGeo.computeVertexNormals()
      const main = new THREE.Mesh(mainGeo, rockMat)
      main.position.y = z; main.rotation.set(rr() * 2, rr() * 2, rr() * 2); grp.add(main)
      // 两块仍贴在主体上的断面，使轮廓不再像规则十二面体。
      for (let i = 0; i < 2; i++) {
        const slab = new THREE.Mesh(new THREE.DodecahedronGeometry((0.2 + rr() * 0.11) * sc, 1), rockMat)
        slab.position.set((rr() - 0.5) * 0.54 * sc, z + (rr() - 0.5) * 0.34 * sc, (rr() - 0.5) * 0.5 * sc)
        slab.scale.set(1.35, 0.45, 0.82); slab.rotation.set(rr() * 3, rr() * 3, rr() * 3); grp.add(slab)
      }
      for (let i = 0; i < 5; i++) {
        const chip = new THREE.Mesh(new THREE.DodecahedronGeometry((0.06 + rr() * 0.09) * sc, 0), rockMat)
        const a = rr() * Math.PI * 2
        chip.position.set(Math.cos(a) * (0.45 + rr() * 0.42) * sc, z + (rr() - 0.5) * 0.62 * sc, Math.sin(a) * (0.45 + rr() * 0.42) * sc)
        chip.rotation.set(rr() * 3, rr() * 3, rr() * 3)
        grp.add(chip)
      }
      grp.userData.bob = { amp: 0.065, phase: rr() * 6.28 }
      break
    }
    case 'cavebank': {
      // 地下湖侵蚀石岸：沿岸切线铺一组高低错落的扁平岩棚，每块按自身世界点读取洞底高度。
      const rr = mulberry(Number(s.data?.sid ?? 0) ^ Math.floor(s.x * 211 + s.y * 127))
      const mat = caveRockMaterial(s.data?.tex ?? 'phreatic', 0.98)
      const baseY = floorHeight(m, cx, cz, 0)
      const a = Number(s.data?.rot ?? 0), scale = Number(s.data?.scale ?? 1)
      const ax = Math.cos(a), az = Math.sin(a), bx = -az, bz = ax
      for (let i = 0; i < 9; i++) {
        const along = (i / 8 - 0.5) * s.w * (0.85 + rr() * 0.12)
        const across = (rr() - 0.5) * s.h * 0.74
        const lx = ax * along + bx * across, lz = az * along + bz * across
        const rad = (0.2 + rr() * 0.19) * scale
        const stone = new THREE.Mesh(new THREE.DodecahedronGeometry(rad, i % 3 ? 1 : 0), mat)
        stone.scale.set(1.3 + rr() * 0.5, 0.34 + rr() * 0.22, 0.9 + rr() * 0.4)
        stone.position.set(lx, floorHeight(m, cx + lx, cz + lz, 0) - baseY + rad * 0.12 - 0.04, lz)
        stone.rotation.set((rr() - 0.5) * 0.35, a + (rr() - 0.5) * 0.5, (rr() - 0.5) * 0.28)
        grp.add(stone)
      }
      // 平行细槽表现长期水位变化留下的侵蚀层理。
      for (let i = 0; i < 3; i++) {
        const shelf = new THREE.Mesh(new THREE.BoxGeometry(s.w * (0.55 + i * 0.1), 0.035, 0.09), mat)
        shelf.position.set(bx * (i - 1) * 0.13, 0.08 + i * 0.055, bz * (i - 1) * 0.13)
        shelf.rotation.y = -a
        grp.add(shelf)
      }
      break
    }
    case 'caveglowpoints': {
      // 多维之路洞顶荧光群：自由漂移、柔光脉冲均在 GPU 完成。
      const rr = mulberry(Number(s.data?.sid ?? 0) ^ 0x8b1e)
      const requested = Math.max(160, Math.min(1200, Number(s.data?.count ?? 850)))
      const spread = Math.max(2, Number(s.data?.spread ?? 14))
      const baseGround = floorHeight(m, cx, cz, 0)
      const hues = ['#55d9ff', '#72b7ff', '#8beaff', '#397cff']
      const points: BioGlowPoint[] = []
      for (let i = 0; i < requested; i++) {
        // 三次随机取均值会自然形成成团的密集星点，而不是规整点阵。
        const ox = ((rr() + rr() + rr()) / 3 - 0.5) * spread * 2
        const oz = ((rr() + rr() + rr()) / 3 - 0.5) * spread * 2
        const px = cx + ox, pz = cz + oz
        const tx = Math.floor(px), tz = Math.floor(pz)
        if (tx < 0 || tz < 0 || tx >= m.w || tz >= m.h || m.tiles[tz * m.w + tx] !== 1) continue
        const roof = caveCeilingAt(m, px, pz)
        const ground = floorHeight(m, px, pz, 0)
        if (roof - ground < 2.25) continue
        points.push({
          x: ox, y: roof - baseGround - 0.055 - rr() * 0.11, z: oz,
          color: new THREE.Color(hues[(i + Number(s.data?.hue ?? 0)) % hues.length]).multiplyScalar(1.3 + rr() * 0.45),
          size: 0.9 + rr() * 2.3, phase: rr() * Math.PI * 2, speed: 0.18 + rr() * 0.42, drift: 0.035 + rr() * 0.13,
        })
      }
      grp.add(bioGlowField(points, 0.06))
      break
    }
    case 'cavebacteria': {
      // 仅从当前 chunk 的浅溪采样，避免微光细菌漂到干燥岩面上。
      const rr = mulberry(Number(s.data?.sid ?? 0) ^ 0xbae7)
      const requested = Math.max(40, Math.min(420, Number(s.data?.count ?? 220)))
      const baseGround = floorHeight(m, cx, cz, 0)
      const hues = ['#4debd3', '#64cfff', '#86f4d6']
      const points: BioGlowPoint[] = []
      for (let tries = 0; tries < requested * 8 && points.length < requested; tries++) {
        const ox = (rr() - 0.5) * s.w, oz = (rr() - 0.5) * s.h
        const px = cx + ox, pz = cz + oz, tx = Math.floor(px), tz = Math.floor(pz)
        if (tx < 0 || tz < 0 || tx >= m.w || tz >= m.h || m.liquid[tz * m.w + tx] !== 2) continue
        points.push({
          x: ox, y: floorHeight(m, px, pz, 0) - baseGround + 0.045 + rr() * 0.065, z: oz,
          color: new THREE.Color(hues[(points.length + Number(s.data?.hue ?? 0)) % hues.length]).multiplyScalar(1.25),
          size: 0.6 + rr() * 1.35, phase: rr() * Math.PI * 2, speed: 0.35 + rr() * 0.7, drift: 0.025 + rr() * 0.075,
        })
      }
      grp.add(bioGlowField(points, 0.025))
      break
    }
    case 'caveboulder': {
      // 各生态带的突兀裸岩：低面数轮廓配真实岩石法线/粗糙度，避免纯色塑料石块。
      const variant = String(s.data?.tex ?? 'phreatic')
      const mat = caveRockMaterial(variant, 0.92)
      const rr = mulberry(s.x * 193 + s.y * 109)
      const scale = Number(s.data?.scale ?? 1), squash = Number(s.data?.squash ?? 0.8)
      const main = new THREE.Mesh(new THREE.DodecahedronGeometry(0.48, 1), mat)
      main.scale.set(scale * (0.86 + rr() * 0.35), scale * squash, scale * (0.82 + rr() * 0.38))
      main.position.y = 0.34 * scale * squash
      main.rotation.set(rr() * 1.2, Number(s.data?.rot ?? 0), rr() * 0.45)
      grp.add(main)
      for (let i = 0; i < 2; i++) {
        const chip = new THREE.Mesh(new THREE.DodecahedronGeometry(0.13 + rr() * 0.1, 0), mat)
        chip.position.set((rr() - 0.5) * scale, 0.08 + rr() * 0.15, (rr() - 0.5) * scale)
        chip.rotation.set(rr() * 2, rr() * 2, rr() * 2)
        grp.add(chip)
      }
      break
    }
    case 'l8dryentry': {
      // 来自 L6 的坍塌隧道：不规则竖向岩洞、断裂岩檐与向后收窄的纯黑通道。
      const dark = new THREE.Mesh(new THREE.CircleGeometry(0.92, 18), new THREE.MeshBasicMaterial({ color: '#010101', side: THREE.DoubleSide }))
      dark.scale.set(0.72, 1.2, 1); dark.position.set(0, 1.05, 0.12); grp.add(dark)
      const rr = mulberry(608)
      for (let i = 0; i < 15; i++) {
        const a = i / 15 * Math.PI * 2
        const stone = new THREE.Mesh(new THREE.DodecahedronGeometry(0.2 + rr() * 0.22, 0), new THREE.MeshLambertMaterial({ color: i % 3 === 0 ? '#746b5c' : '#5b554b' }))
        stone.position.set(Math.cos(a) * 0.73, 1.05 + Math.sin(a) * 1.08, 0); stone.scale.set(1.15, 0.8, 0.7); stone.rotation.set(rr() * 3, rr() * 3, rr() * 3); grp.add(stone)
      }
      for (let i = 0; i < 5; i++) grp.add(box(0.28 + rr() * 0.3, 0.15 + rr() * 0.18, 0.35, '#554f47', -0.72 + i * 0.35, 0.08, 0.28 + rr() * 0.35))
      break
    }
    case 'l8poolentry': {
      // 来自 L7 的水下洞口：低矮岩拱围着持续渗水的深色池面，青色只来自湿岩反光。
      const pool = new THREE.Mesh(new THREE.CircleGeometry(0.92, 22), new THREE.MeshLambertMaterial({ color: '#173540', transparent: true, opacity: 0.76, roughness: 0.16 } as THREE.MeshLambertMaterialParameters))
      pool.rotation.x = -Math.PI / 2; pool.position.y = 0.045; pool.scale.set(1.25, 0.8, 1); grp.add(pool)
      const rr = mulberry(708)
      for (let i = 0; i < 16; i++) {
        const a = i / 16 * Math.PI * 2
        const stone = new THREE.Mesh(new THREE.DodecahedronGeometry(0.18 + rr() * 0.2, 0), new THREE.MeshLambertMaterial({ color: i % 4 === 0 ? '#526864' : '#4c5550' }))
        stone.position.set(Math.cos(a) * 1.05, 0.12 + Math.max(0, Math.sin(a)) * 0.58, Math.sin(a) * 0.73); stone.scale.y = 0.72; grp.add(stone)
      }
      const throat = new THREE.Mesh(new THREE.CircleGeometry(0.5, 16), new THREE.MeshBasicMaterial({ color: '#000407', side: THREE.DoubleSide }))
      throat.position.set(0, 0.55, 0.56); throat.scale.set(1.2, 0.72, 1); grp.add(throat)
      break
    }

    // ===================== v23：Level 9「The Suburbs」 =====================
    case 'house': {
      // 20 种真实比例住宅：一层外墙由地图墙（含真实窗洞）承担，上层外壳独立建造。
      // 局部 +Z 永远是正门方向，东西向地块只需旋转整个模型，不会再发生门与墙错向。
      const style = Number(s.data?.style ?? 0) % 20
      const aFrame = style >= 16
      const frontKey = String(s.data?.front ?? 's')
      const sideFront = frontKey === 'e' || frontKey === 'w'
      const faceW = sideFront ? s.h : s.w, faceD = sideFront ? s.w : s.h
      grp.rotation.y = frontKey === 'n' ? Math.PI : frontKey === 'e' ? Math.PI / 2 : frontKey === 'w' ? -Math.PI / 2 : 0
      // 已经写入存档的旧 A 字住宅可能仍带 stories=1；渲染端强制升级为两层，
      // 无需玩家重开存档或等待旧区块重新生成。
      const stories = aFrame ? 2 : Math.max(1, Math.min(3, Number(s.data?.stories ?? 2)))
      // 一层高度必须与地图实际 suburb 墙高一致；旧 2.78m 模型比 3.2m 墙体矮了 42cm，
      // 窗洞上方会残留一条没有被任何结构封住的亮缝。
      const storyH = WALL_H[_def.gen] ?? 3.2, wallH = storyH * stories
      const doorOffset = Number(s.data?.doorOffset ?? 0)
      // 住宅主墙只使用现代灰泥与整洁砖墙；旧木板外墙保留给车库门等局部构件，
      // 避免大面积风化木板让整条郊区街道显得破败。
      const facadePrefix = style === 3 || style === 6 ? 'l9_brick' : 'l9_modern_plaster'
      const facadeTints = ['#f3f1eb','#dce4e4','#ece8df','#cbb3a3','#e0e5df','#f7f7f3','#cab5a6','#f0ebe3','#d8e0e2','#efede7','#e7ebea','#f4f0e8','#faf9f4','#dde5e6','#edeae3','#f3f3ef','#e5e1d7','#d5ddd9','#eee8dc','#d9d5cb']
      const facadeTint = facadeTints[style]
      const shell = (w: number, h: number, d: number, x: number, y: number, z: number, prefix = facadePrefix, tint = facadeTint) => {
        const plaster = prefix === 'l9_modern_plaster'
        const fb: [string, string] = prefix === 'l9_brick' ? ['#9d7867','#684d42'] : plaster ? ['#f4f2ed','#deddd7'] : ['#c8c2b5','#8f897e']
        grp.add(l9PbrBox(w, h, d, prefix, tint, fb[0], fb[1], prefix === 'l9_brick' ? 1.35 : 1.8, plaster ? .84 : .88, plaster ? .16 : .12, plaster ? .34 : .52, x, y, z))
      }

      const fz = faceD / 2 + .035, bz = -faceD / 2 - .035
      // 一层完整墙面来自地图几何，不能再叠一层不透明立面，否则真实窗洞仍会被堵死。
      // 这里只补门洞上方的门楣，并从二层起构建独立楼体。
      shell(1.18, storyH - 2.28, .07, doorOffset, 2.28 + (storyH - 2.28) / 2, fz, 'l9_modern_plaster', '#f1eee7')
      const stepped = stories > 1 && (style === 5 || (style >= 12 && style <= 15))
      const upperW = stepped ? faceW * ([.66, .78, .58, .72][Math.max(0, style - 12)] ?? .62) : faceW
      const upperD = stepped ? faceD * ([.72, .61, .76, .56][Math.max(0, style - 12)] ?? .68) : faceD
      const upperX = stepped ? (style % 2 ? -faceW * .1 : faceW * .12) : 0
      const upperZ = stepped ? (style === 13 || style === 15 ? -faceD * .12 : faceD * .06) : 0
      if (stories > 1) {
        const uh = wallH - storyH, uy = storyH + uh / 2
        shell(upperW, uh, .07, upperX, uy, upperZ + upperD / 2 + .035)
        shell(upperW, uh, .07, upperX, uy, upperZ - upperD / 2 - .035)
        shell(.07, uh, upperD, upperX - upperW / 2 - .035, uy, upperZ)
        shell(.07, uh, upperD, upperX + upperW / 2 + .035, uy, upperZ)

        // 首层屋面与顶层屋面分开建造。首层使用四块互不重叠的环形屋面，中间严格
        // 留出二层楼体占地；即使二层与首层同宽，也保留一圈真实檐口而不是整块实心板。
        const outerW = faceW + .5, outerD = faceD + .5
        const ox0 = -outerW / 2, ox1 = outerW / 2, oz0 = -outerD / 2, oz1 = outerD / 2
        const ix0 = upperX - upperW / 2, ix1 = upperX + upperW / 2
        const iz0 = upperZ - upperD / 2, iz1 = upperZ + upperD / 2
        const roofStrip = (w: number, d: number, x: number, z: number) => {
          if (w < .04 || d < .04) return
          grp.add(l9PbrBox(w, .14, d, 'l9_clean_tile', '#ecefed', '#ecefed', '#c8cdca', .75, .5, .2, .16, x, storyH + .035, z))
        }
        roofStrip(ix0 - ox0, outerD, (ox0 + ix0) / 2, 0)
        roofStrip(ox1 - ix1, outerD, (ix1 + ox1) / 2, 0)
        roofStrip(upperW, iz0 - oz0, upperX, (oz0 + iz0) / 2)
        roofStrip(upperW, oz1 - iz1, upperX, (iz1 + oz1) / 2)
      }
      // 基础勒脚与转角饰条让楼体不再像无厚度的贴片。错层住宅的一楼外角只到
      // storyH 为止；二楼沿缩进后的 upper 轮廓另起饰条，不能把一楼角线悬空拉到屋顶。
      for (const z of [fz + .045, bz - .045]) grp.add(box(faceW + .16, .24, .12, '#5f5b54', 0, .12, z))
      const lowerTrimH = stepped ? storyH : wallH
      for (const x of [-faceW / 2 - .07, faceW / 2 + .07]) for (const z of [fz, bz]) {
        grp.add(box(.16, lowerTrimH, .13, '#d7d0c1', x, lowerTrimH / 2, z))
      }
      if (stepped) {
        const upperTrimH = wallH - storyH
        const upperY = storyH + upperTrimH / 2
        const upperFront = upperZ + upperD / 2 + .035
        const upperBack = upperZ - upperD / 2 - .035
        for (const x of [upperX - upperW / 2 - .07, upperX + upperW / 2 + .07]) for (const z of [upperFront, upperBack]) {
          grp.add(box(.16, upperTrimH, .13, '#d7d0c1', x, upperY, z))
        }
      }

      const glassMat = architecturalGlassMaterial(true)
      const windowUnit = (ww = 1.22, wh = 1.08) => {
        const wg = new THREE.Group()
        const frameParts: { g: THREE.BufferGeometry; c: string }[] = []
        const wp = (w: number, h: number, d: number, c: string, x = 0, y = 0, z = 0) =>
          frameParts.push({ g: new THREE.BoxGeometry(w, h, d).translate(x, y, z), c })
        const pane = new THREE.Mesh(new THREE.PlaneGeometry(ww, wh), glassMat); pane.position.z = .012; wg.add(pane)
        // 半开的窗帘位于玻璃后方，既能透光又不会像纯黑贴片。
        wp(ww * .18, wh * .9, .025, '#6d655b', -ww * .38, 0, -.005)
        wp(ww * .18, wh * .9, .025, '#6d655b', ww * .38, 0, -.005)
        const frame = '#e0ddd2'
        wp(.055, wh + .12, .055, frame, 0, 0, .04); wp(ww + .12, .055, .055, frame, 0, 0, .04)
        wp(ww + .18, .08, .17, '#c5c0b3', 0, -wh / 2 - .07, .02)
        wg.add(mergedMesh(frameParts))
        return wg
      }
      const addWindow = (x: number, y: number, z: number, ry = 0, ww = 1.22, wh = 1.08) => {
        const wg = windowUnit(ww, wh); wg.position.set(x, y, z); wg.rotation.y = ry; grp.add(wg)
      }
      // 一层窗由 l9window 结构提供；这里只画不可进入楼层的真实比例上层窗。
      for (let floor = 1; floor < stories; floor++) {
        const wy = floor * storyH + 1.5
        for (const x of [upperX - upperW * .28, upperX + upperW * .28]) addWindow(x, wy, upperZ + upperD / 2 + .075)
      }
      for (const sign of [-1, 1]) for (let floor = 1; floor < stories; floor++) {
        const wy = floor * storyH + 1.5
        const z = upperZ + (style % 2 ? -.12 : .12) * upperD
        addWindow(upperX + sign * (upperW / 2 + .075), wy, z, sign > 0 ? Math.PI / 2 : -Math.PI / 2, 1.0, .96)
      }
      if (stories > 1) for (const x of [upperX - upperW * .27, upperX + upperW * .27]) addWindow(x, storyH + 1.5, upperZ - upperD / 2 - .075, Math.PI)

      // 门廊、车库和挑出体决定一眼可见的建筑风格，而不仅是换一种墙色。
      const porchW = style === 2 || style === 8 || style === 9 ? Math.min(faceW * .68, 9.5) : 3.1
      const porchZ = faceD / 2 + .72
      grp.add(l9PbrBox(porchW, .13, 1.45, 'l9_furniture_wood', '#ddd3c1', '#8e765c', '#493a2d', 1.2, .58, .23, .45, doorOffset, .09, porchZ))
      const postCount = porchW > 5 ? 4 : 2
      for (let i = 0; i < postCount; i++) {
        const px = doorOffset - porchW / 2 + .2 + i * (porchW - .4) / (postCount - 1)
        grp.add(box(.16, 2.3, .16, '#d8d1c2', px, 1.17, porchZ + .46))
        grp.add(box(.3, .12, .3, '#8f8779', px, .07, porchZ + .46))
      }
      grp.add(box(porchW + .28, .16, 1.38, style === 7 ? '#8b5f4c' : '#4b4a4a', doorOffset, 2.34, porchZ + .08))
      for (let i = 0; i < 2; i++) grp.add(box(porchW * (1 - i * .16), .09, .36, '#81745f', doorOffset, .045 + i * .075, porchZ + .92 + i * .24))

      if (style === 0 || style === 10 || style === 11) {
        const garageW = Math.min(4.6, faceW * .36), gx = -faceW * .27
        grp.add(l9PbrBox(garageW, 2.12, .09, 'l9_siding', '#b9b6ad', '#aaa498', '#77736b', 1.5, .92, .06, .38, gx, 1.08, fz + .105))
        for (let yy = .32; yy < 2.05; yy += .34) grp.add(box(garageW - .18, .032, .1, '#777872', gx, yy, fz + .16))
        for (const xx of [-garageW * .26, 0, garageW * .26]) grp.add(box(.025, 1.82, .1, '#8a8982', gx + xx, 1.05, fz + .16))
      }
      if (style === 5 || (style >= 12 && style <= 15)) {
        // 现代洋楼：缩进/偏置的上层、宽水平窗、露台压顶与一层落地窗形成明显错层。
        addWindow(upperX, storyH + 1.45, upperZ + upperD / 2 + .09, 0, Math.min(3.8, upperW * .55), .86)
        // 局部浅色瓷砖饰面打破整栋住宅一种旧墙皮的观感。
        grp.add(l9PbrBox(Math.min(2.1, upperW * .28), Math.min(2.15, wallH - storyH - .25), .085,
          'l9_clean_tile', '#edf0ee', '#ecefed', '#c8cdca', .72, .5, .2, .14,
          upperX + upperW * .3, storyH + Math.min(2.15, wallH - storyH - .25) / 2 + .12, upperZ + upperD / 2 + .08))
        const terraceZ = upperZ + upperD / 2 + .72
        grp.add(l9PbrBox(Math.max(2.4, upperW * .7), .13, 1.25, 'l9_furniture_wood', '#9c856b', '#8e765c', '#493a2d', 1.2, .62, .18, .4, upperX, storyH + .08, terraceZ))
        for (const xx of [upperX - upperW * .31, upperX + upperW * .31]) grp.add(box(.055, .72, .055, '#586266', xx, storyH + .48, terraceZ + .5))
        grp.add(box(Math.max(2.5, upperW * .72), .055, .055, '#586266', upperX, storyH + .82, terraceZ + .5))
      } else if (style === 6) {
        // 维多利亚式三层角塔。
        const tx = faceW * .34
        shell(3.2, wallH + .8, 3.0, tx, (wallH + .8) / 2, faceD / 2 - 1.05, 'l9_modern_plaster', '#e1ddd3')
        const towerRoof = l9GableRoof(3.65, 3.5, 1.65, 'l9_roof_slate', '#62636a'); towerRoof.position.set(tx, wallH + .8, faceD / 2 - 1.05); grp.add(towerRoof)
      } else if (style === 3 || style === 4) {
        for (const x of [-faceW * .23, faceW * .23]) {
          shell(1.5, .82, 1.0, x, wallH + .38, .1, 'l9_siding', facadeTint)
          const dormer = l9GableRoof(1.75, 1.25, .7, 'l9_roof_slate', '#4b4b50'); dormer.position.set(x, wallH + .78, .1); grp.add(dormer)
          addWindow(x, wallH + .4, .64, 0, .62, .48)
        }
      }

      const roofPrefix = style === 7 ? 'l9_roof_tile' : 'l9_roof_slate'
      const roofTint = style === 7 ? '#a56c52' : ['#55565c','#43484f','#5b514a','#48464c'][style % 4]
      if (aFrame) {
        // 参考郊区洋楼：完整两层墙体上先放正常横向主屋顶，再从正面局部挑出
        // 一个或两个交叉山墙。三角形不再覆盖整栋楼，也不会像巨型帐篷悬在一楼上。
        const aFrameRise = style === 17 || style === 19 ? 1.9 : 1.55
        const mainRoof = l9GableRoof(upperW + .8, upperD + .9, aFrameRise, roofPrefix, roofTint, 'x', facadeTint)
        mainRoof.position.set(upperX, wallH, upperZ); grp.add(mainRoof)

        const frontGable = (gx: number, gw: number, rise: number, depth: number, windowW = 1.05) => {
          const gz = upperZ + upperD / 2 - depth / 2 + .72
          const roof = l9GableRoof(gw, depth, rise, roofPrefix, roofTint, 'z', facadeTint)
          roof.position.set(gx, wallH - .08, gz); grp.add(roof)
          addWindow(gx, wallH + rise * .38, gz + depth / 2 + .035, 0, windowW, .82)
        }
        if (style === 16) {
          frontGable(upperX, Math.min(6.2, upperW * .42), 2.45, 4.0, 1.28)
        } else if (style === 17) {
          frontGable(upperX - upperW * .23, Math.min(4.7, upperW * .3), 2.2, 3.7)
          frontGable(upperX + upperW * .24, Math.min(4.2, upperW * .27), 1.85, 3.35, .9)
        } else if (style === 18) {
          frontGable(upperX - upperW * .14, Math.min(6.5, upperW * .44), 2.7, 4.25, 1.35)
        } else {
          frontGable(upperX + upperW * .13, Math.min(5.8, upperW * .39), 2.55, 4.15, 1.2)
          frontGable(upperX - upperW * .3, Math.min(3.5, upperW * .22), 1.55, 3.05, .78)
        }
      } else if (style === 5 || style === 12 || style === 15) {
        grp.add(l9PbrBox(upperW + .65, .24, upperD + .65, 'l9_roof_slate', '#353a3f', '#4b4b4d', '#28292b', 1.4, .7, .22, .5, upperX, wallH + .08, upperZ))
        for (const z of [upperZ - upperD / 2 - .28, upperZ + upperD / 2 + .28]) grp.add(box(upperW + .7, .34, .16, '#4d5456', upperX, wallH + .28, z))
      } else {
        const roofRise = style === 0 || style === 8 ? 1.05 : style === 3 || style === 6 ? 2.45 : style === 7 ? 1.15 : 1.72
        const roof = l9GableRoof(upperW + .6, upperD + .65, roofRise, roofPrefix, roofTint); roof.position.set(upperX, wallH, upperZ); grp.add(roof)
      }
      // 砖烟囱与屋檐排水管提供屋顶尺度参照。
      const chimneyBase = wallH
      grp.add(l9PbrBox(.68, 1.7, .68, 'l9_brick', '#9a7968', '#8b6653', '#4e3a31', 1.15, .9, .08, .65, upperX + upperW * .29, chimneyBase + .72, upperZ - upperD * .18))
      for (const x of [-faceW / 2 - .12, faceW / 2 + .12]) grp.add(cyl(.035, .035, wallH - .25, '#575b5b', x, wallH / 2, fz + .03, 8))
      break
    }
    case 'l9window': {
      // 标准建筑窗组件：整格墙洞由组件自己补齐上下墙段，不再依赖一张透明平面遮住
      // 3.2m 高的空洞。统一窗台/窗楣比例让它在任何立面都只会被读成窗，而不是门。
      // 一层主体墙由地图几何统一生成，因此窗洞补墙必须使用完全相同的灰泥、色调与
      // 1.8m 世界平铺尺度；房屋 style 只作用于二层以上的独立外立面。
      const deg = Number(s.data?.deg ?? 0) * Math.PI / 180
      const wallBox = (w:number,h:number,x:number,y:number) => {
        const mesh = l9PbrBox(w, h, .12, 'l9_modern_plaster', '#f1eee7', '#f4f2ed', '#deddd7', 1.8, .86, .16, .34, x, y, 0)
        // 地图墙使用 u=(worldX+worldZ)*.55 / v=worldY*.55。这里直接把同一公式烘进
        // 窗洞补墙 UV，既统一缩放也统一相位，窗台上下不再像贴了另一块墙纸。
        const pos = mesh.geometry.attributes.position as THREE.BufferAttribute
        const uv = mesh.geometry.attributes.uv as THREE.BufferAttribute
        const cs = Math.cos(deg), sn = Math.sin(deg)
        for (let i = 0; i < uv.count; i++) {
          const lx = pos.getX(i) + x, lz = pos.getZ(i)
          const wx = cx + cs * lx + sn * lz
          const wz = cz - sn * lx + cs * lz
          uv.setXY(i, (wx + wz) * .55, (pos.getY(i) + y) * .55)
        }
        uv.needsUpdate = true
        grp.add(mesh)
      }
      const topH = WALL_H[_def.gen] ?? 3.2
      const sill = .84, head = Math.min(topH - .62, 2.18)
      const paneH = head - sill
      wallBox(1, sill, 0, sill / 2)
      wallBox(1, topH - head, 0, head + (topH - head) / 2)

      // 玻璃使用有真实厚度的薄盒而不是单面贴片，从斜角也能看到边缘；通用材质没有
      // 自发光，且以较深透明度压住室内白墙，不会再呈现整块米白色。
      const glass = new THREE.Mesh(new THREE.BoxGeometry(.76, paneH - .13, .026), architecturalGlassMaterial())
      glass.position.set(0, sill + paneH / 2, .012)
      glass.userData.noCastShadow = 1
      grp.add(glass)

      const frame = '#c8ccca', seal = '#30383c'
      for (const x of [-.43, .43]) {
        grp.add(box(.1, paneH + .04, .16, frame, x, sill + paneH / 2, .02))
        grp.add(box(.026, paneH - .08, .17, seal, x * .9, sill + paneH / 2, .025))
      }
      for (const y of [sill, head]) grp.add(box(1, .1, .16, frame, 0, y, .02))
      grp.add(box(.055, paneH - .16, .12, frame, 0, sill + paneH / 2, .045))
      grp.add(box(.78, .055, .12, frame, 0, sill + paneH * .52, .045))
      // 外侧窗台略微挑出墙面，同时遮住玻璃底边与下补墙的接缝。
      grp.add(l9PbrBox(1.08, .09, .24, 'l9_clean_tile', '#dfe3e1', '#ecefed', '#c8cdca', .7, .5, .18, .12, 0, sill - .035, .075))
      // 窗洞所在格没有地图墙体，室内侧的踢脚线必须由窗组件补上；local -Z 恒朝住宅内。
      grp.add(l9PbrBox(1, .14, .055, 'l9_furniture_wood', '#c5b5a4', '#8e765c', '#493a2d', 1.34, .68, .18, .34, 0, .07, -.095))
      grp.rotation.y=deg
      break
    }
    case 'l9tvconsole': {
      // 电视放在有离地支脚的矮柜上，屏幕中心达到正常坐姿视线高度。
      const wood=l9PbrMaterial('l9_furniture_wood','#80664e','#8e765c','#493a2d',.62,.24,.42)
      const body=new THREE.MeshStandardMaterial({color:'#17191b',roughness:.48,metalness:.18})
      for(const x of [-.38,.38]) for(const z of [-.18,.18]) grp.add(cyl(.025,.035,.28,'#39322b',x,.14,z,7))
      const cabinet=new THREE.Mesh(new THREE.BoxGeometry(.96,.42,.44),wood);cabinet.position.y=.49;grp.add(cabinet)
      grp.add(box(.018,.31,.03,'#4a3d31',0,.49,.235))
      const tv=new THREE.Mesh(new THREE.BoxGeometry(.9,.58,.12),body);tv.position.set(0,1.02,0);grp.add(tv)
      const screen=new THREE.Mesh(new THREE.PlaneGeometry(.78,.45),new THREE.MeshPhysicalMaterial({color:'#1d252b',roughness:.16,metalness:.12,envMapIntensity:.7}));screen.position.set(0,1.03,.061);grp.add(screen)
      grp.rotation.y=Number(s.data?.deg??0)*Math.PI/180
      break
    }
    case 'l9planter': {
      const wood=l9PbrMaterial('l9_furniture_wood','#9a7653','#8e765c','#493a2d',.68,.12,.4)
      const trough=new THREE.Mesh(new THREE.BoxGeometry(Math.max(.7,s.w*.82),.42,Math.max(.42,s.h*.7)),wood);trough.position.y=.25;grp.add(trough)
      const soil=new THREE.Mesh(new THREE.BoxGeometry(Math.max(.58,s.w*.7),.06,Math.max(.32,s.h*.58)),new THREE.MeshStandardMaterial({color:'#2c2118',roughness:1}));soil.position.y=.49;grp.add(soil)
      for(let i=0;i<5;i++){const x=-s.w*.27+i*s.w*.135;grp.add(cyl(.025,.04,.28,'#365235',x,.64,(i%2-.5)*.12,6));const leaf=new THREE.Mesh(new THREE.SphereGeometry(.1,6,4),new THREE.MeshLambertMaterial({color:i%2?'#486943':'#39583a'}));leaf.scale.set(1.4,.55,.8);leaf.position.set(x,.77,(i%2-.5)*.12);grp.add(leaf)}
      grp.rotation.y=Number(s.data?.deg??0)*Math.PI/180
      break
    }
    case 'l9vegbed': {
      const soil=new THREE.Mesh(new THREE.BoxGeometry(Math.max(.7,s.w*.9),.13,Math.max(.7,s.h*.9)),new THREE.MeshStandardMaterial({color:'#2b2118',roughness:1}));soil.position.y=.08;grp.add(soil)
      const ww=Math.max(.7,s.w*.9),dd=Math.max(.7,s.h*.9)
      for(const z of [-dd/2,dd/2]) grp.add(box(ww+.12,.16,.09,'#765739',0,.11,z));for(const x of [-ww/2,ww/2]) grp.add(box(.09,.16,dd,'#765739',x,.11,0))
      const rows=Math.max(2,Math.floor(ww/.5));for(let i=0;i<rows;i++){const x=-ww*.4+(i/(rows-1))*ww*.8;for(const z of [-dd*.22,dd*.22]){const leaf=new THREE.Mesh(new THREE.SphereGeometry(.11,6,4),new THREE.MeshLambertMaterial({color:(i&1)?'#41663a':'#557743'}));leaf.scale.set(1.35,.62,1);leaf.position.set(x,.25,z);grp.add(leaf)}}
      grp.rotation.y=Number(s.data?.deg??0)*Math.PI/180
      break
    }
    case 'streetlamp': {
      // 路灯：mode 0=熄灭 1=闪烁 2=常亮
      const mode = (s.data?.mode as number | undefined) ?? 0
      grp.add(cyl(0.055, 0.09, 4.0, '#3a3d40', 0, 2.0, 0, 6))
      grp.add(box(0.5, 0.07, 0.07, '#3a3d40', 0.23, 3.96, 0)) // 弯臂
      grp.add(cyl(0.13, 0.24, 0.17, '#4a4d50', 0.46, 3.86, 0, 8)) // 灯罩
      if (mode === 0) grp.add(box(0.21, 0.04, 0.21, '#33342f', 0.46, 3.77, 0))
      else grp.add(glow(0.22, 0.05, 0.22, mode === 2 ? '#ffcf8a' : '#96703c', 0.46, 3.76, 0))
      // 模型灯臂沿局部 +X；生成器传入的 deg 保证灯头始终伸向相邻道路。
      grp.rotation.y = Number(s.data?.deg ?? 0) * Math.PI / 180
      break
    }
    case 'mailbox': {
      // 信箱：立柱 + 圆顶盒 + 小红旗（v54：投递口小门垂开 + 红旗倒下）
      const body = s.looted ? '#454b51' : '#5d6167'
      grp.add(box(0.09, 0.95, 0.09, '#4a3a2a', 0, 0.48, 0))
      const dome = cyl(0.16, 0.16, 0.44, body, 0, 1.09, 0, 10)
      dome.rotation.x = Math.PI / 2 // 圆顶沿前后方向躺倒
      grp.add(dome)
      grp.add(box(0.31, 0.14, 0.44, body, 0, 1.0, 0))
      const door = box(0.29, 0.2, 0.03, '#6a6f76', 0, 0, 0)
      door.geometry.translate(0, -0.1, 0) // 铰链在下缘（向外垂开）
      door.position.set(0, 1.14, 0.22)
      movable(door, 'lid')
      grp.add(door)
      grp.add(box(0.022, 0.24, 0.022, '#8a8a8a', 0.18, 1.2, -0.06)) // 旗杆
      const flag = box(0.02, 0.12, 0.14, '#c0231c', 0, 0, 0)
      flag.geometry.translate(0, 0, 0.07) // 铰链在旗杆侧
      flag.position.set(0.18, 1.26, -0.05)
      movable(flag, 'flag')
      grp.add(flag)
      if (s.looted) grp.userData.open = 1
      if (s.data?.deg !== undefined) grp.rotation.y = Number(s.data.deg) * Math.PI / 180
      break
    }
    case 'picketfence': {
      // 白色尖桩栅栏（非实心，约 1.0m）：4 根竖条 + 2 根横档
      const parts: { g: THREE.BufferGeometry; c: string }[] = []
      const white = '#d8d2c4'
      for (let i = 0; i < 4; i++) {
        const px = -0.42 + i * 0.28
        parts.push({ g: new THREE.BoxGeometry(0.09, 0.92, 0.045).translate(px, 0.46, 0), c: white })
        parts.push({ g: new THREE.BoxGeometry(0.075, 0.09, 0.045).translate(px, 0.955, 0), c: white }) // 尖头
      }
      parts.push({ g: new THREE.BoxGeometry(1.0, 0.07, 0.03).translate(0, 0.34, 0.01), c: '#cbc5b6' })
      parts.push({ g: new THREE.BoxGeometry(1.0, 0.07, 0.03).translate(0, 0.72, 0.01), c: '#cbc5b6' })
      grp.add(mergedMesh(parts))
      if (s.data?.deg !== undefined) grp.rotation.y = Number(s.data.deg) * Math.PI / 180
      break
    }
    case 'clipfuse': {
      // 「卡模」双子屋：两块墙体以不同角度互相嵌入（物理上不可能的嵌套）
      const ch = Math.max(2.6, H)
      const a = box(2.0, ch, 1.5, _def.palette.wall, -0.1, ch / 2, 0)
      a.rotation.y = 0.22
      grp.add(a)
      const b = box(1.7, ch * 0.92, 1.9, col(_def.palette.wallTop).multiplyScalar(0.72).getHex(), 0.3, ch * 0.47, 0.2)
      b.rotation.y = -0.78
      grp.add(b)
      const rf = box(1.8, 0.16, 1.7, '#2e2c30', -0.15, ch * 0.9, -0.1) // 互相穿插的屋顶片
      rf.rotation.set(0.32, 0.5, 0.16)
      grp.add(rf)
      const rf2 = box(1.5, 0.16, 1.6, '#3a3630', 0.35, ch * 0.72, 0.35)
      rf2.rotation.set(-0.4, -0.8, -0.2)
      grp.add(rf2)
      grp.add(box(0.9, 1.1, 0.08, '#101216', 0.42, 0.55, 0.86)) // 卡进另一栋里的窗洞
      break
    }
    case 'playpipe': {
      // 游乐场管道：彩色塑料管，内部发白光（→ Level 283）
      const R = 0.66, L = 1.75
      const tube = new THREE.Mesh(
        new THREE.CylinderGeometry(R, R, L, 12, 1, true),
        new THREE.MeshLambertMaterial({ color: '#c8452e', side: THREE.DoubleSide }),
      )
      tube.rotation.z = Math.PI / 2
      tube.position.y = R + 0.06
      grp.add(tube)
      for (const sgn of [-1, 1]) {
        const mouth = new THREE.Mesh(
          new THREE.CircleGeometry(R * 0.9, 12),
          new THREE.MeshBasicMaterial({ color: '#f2f4ee', side: THREE.DoubleSide }),
        )
        mouth.position.set(sgn * (L / 2 - 0.06), R + 0.06, 0)
        mouth.rotation.y = sgn * Math.PI / 2
        grp.add(mouth)
        const ring = cyl(R + 0.07, R + 0.07, 0.11, '#e0a13a', sgn * (L / 2 - 0.05), R + 0.06, 0, 12)
        ring.rotation.z = Math.PI / 2
        grp.add(ring)
      }
      for (const px of [-0.55, 0.55]) grp.add(box(0.12, R + 0.06, 0.5, '#3a6a8a', px, (R + 0.06) / 2, 0)) // 支座
      break
    }

    // ===================== v23：Level 10「Bumper Crop」 =====================
    case 'wheatpatch': {
      // 4×4m 作物块：由区块级结构合批；共享顶点着色器完成风摆，不逐株跑 CPU 动画。
      const r = mulberry(s.x * 29 + s.y * 131)
      const barley = !!s.data?.barley
      const stalkC = barley ? '#d8c87a' : '#c8b45a'
      const headC = barley ? '#e6dca4' : '#d6bf62'
      const parts: { g: THREE.BufferGeometry; c: string }[] = []
      const density = Number(s.data?.density ?? .86)
      const n = Math.max(9, Math.floor(s.w * s.h * density * 1.15))
      for (let i = 0; i < n; i++) {
        const hgt = (barley ? .72 : .82) + r() * 0.32
        const px = (r() - 0.5) * Math.max(.7, s.w - .18), pz = (r() - 0.5) * Math.max(.7, s.h - .18)
        const tz = (r() - 0.5) * 0.28, tx = (r() - 0.5) * 0.28
        const st = new THREE.BoxGeometry(0.025, hgt, 0.025).translate(0, hgt / 2, 0)
        st.rotateZ(tz); st.rotateX(tx); st.translate(px, 0, pz)
        parts.push({ g: st, c: stalkC })
        const hd = new THREE.BoxGeometry(barley ? .055 : .068, barley ? .29 : .23, barley ? .055 : .068).translate(0, hgt + (barley ? .12 : .09), 0)
        hd.rotateZ(tz); hd.rotateX(tx); hd.translate(px, 0, pz)
        parts.push({ g: hd, c: headC })
      }
      grp.add(mergedL10Crop(parts))
      break
    }
    case 'hedgerow': {
      // 长段树篱：尺寸直接读取 s.w/s.h，按段合并碰撞；叶片只由 GPU 风摆。
      // UV 按约 0.7m 的真实叶簇尺度平铺，避免把一整张叶片素材拉伸到四米长。
      // RoundedBoxGeometry 自带跨边缘连续的圆角法线；轮廓扰动由世界坐标纯函数决定，
      // 相同位置的重复 UV 顶点取得同一偏移，不再出现各面随机错位形成的裂缝。
      const body = new THREE.Mesh(new RoundedBoxGeometry(s.w, 1.55, s.h, 3, Math.min(.18, s.h * .22)), l10LeafMaterial())
      body.position.y = .775
      const pos = body.geometry.attributes.position as THREE.BufferAttribute
      const baseGround = floorHeight(m, cx, cz, s.floor ?? 0)
      for (let i = 0; i < pos.count; i++) {
        const px = pos.getX(i), py = pos.getY(i), pz = pos.getZ(i)
        const topK = Math.max(0, Math.min(1, (py + .775) / 1.55))
        const ripple = Math.sin((px + s.x) * 4.17 + (pz + s.y) * 2.31) * .5
          + Math.sin((px + s.x) * 1.73 - (pz + s.y) * 5.07) * .5
        const sideScale = 1 + ripple * .012 * topK
        const groundDelta = floorHeight(m, cx + px, cz + pz, s.floor ?? 0) - baseGround
        pos.setXYZ(i, px * sideScale, py + groundDelta + ripple * .045 * (.25 + topK * .75), pz * sideScale)
      }
      const uv = body.geometry.attributes.uv as THREE.BufferAttribute
      const nor = body.geometry.attributes.normal as THREE.BufferAttribute
      for (let i = 0; i < uv.count; i++) {
        const nx = Math.abs(nor.getX(i)), ny = Math.abs(nor.getY(i)), nz = Math.abs(nor.getZ(i))
        if (ny > nx && ny > nz) uv.setXY(i, pos.getX(i) * 1.45, pos.getZ(i) * 1.45)
        else if (nx > nz) uv.setXY(i, pos.getZ(i) * 1.45, pos.getY(i) * 1.45)
        else uv.setXY(i, pos.getX(i) * 1.45, pos.getY(i) * 1.45)
      }
      // 保留 RoundedBoxGeometry 的解析圆角法线；重算非索引法线会重新制造硬边。
      pos.needsUpdate = true
      uv.needsUpdate = true
      grp.add(body)
      break
    }
    case 'barn': {
      // 谷仓标记（非实心）：双坡红色屋顶 + 山墙面
      // v53：坡面/檐口换波纹钢贴图（l10_roof.jpg）——贴图均值归一 0.72，
      //      tint=原纯色÷0.72 保持红色调（#7a3a2e→#a95140 / #8c4433→#c25e47 / #5e2c23→#833d31），离线回退原纯色噪点
      const roof = gableRoof(s.w, s.h, Math.min(2.2, Math.min(s.w, s.h) * 0.34), '#7a3a2e', '#c25e47', { name: 'l10_roof', tint: '#a95140' })
      roof.position.y = H
      grp.add(roof)
      grp.add(texBox(s.w + 0.3, 0.18, s.h + 0.3, 'l10_roof', '#5e2c23', '#5e2c23', '#833d31', 2.0, 0, H - 0.07, 0))
      break
    }
    case 'l10tree': {
      const rr = mulberry(s.x * 137 + s.y * 61)
      const wood = l10Wettable(litMaterial({ color: '#8b7354', map: levelTexture('l10_wood_diff.jpg', () => noiseTexture('#6c5136', '#947653')), normalMap: levelTexture('l10_wood_normal.jpg', () => noiseTexture('#8080ff', '#7f7fff')), roughnessMap: levelTexture('l10_wood_rough.jpg', () => noiseTexture('#eeeeee', '#d0d0d0')), normalScale: new THREE.Vector2(.5, .5), roughness: .92, envBase: .035 }), .92, .035)
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(.22, .34, 3.5, 9), wood)
      trunk.position.y = 1.75; grp.add(trunk)
      for (let i = 0; i < 5; i++) {
        const crownGeo = new THREE.DodecahedronGeometry(.78 + rr() * .35, 1)
        const crownUv = crownGeo.attributes.uv as THREE.BufferAttribute
        for (let u = 0; u < crownUv.count; u++) crownUv.setXY(u, crownUv.getX(u) * 1.65, crownUv.getY(u) * 1.65)
        crownUv.needsUpdate = true
        const crown = new THREE.Mesh(crownGeo, l10LeafMaterial())
        crown.scale.set(1 + rr() * .45, .72 + rr() * .35, 1 + rr() * .42)
        crown.position.set((rr() - .5) * 1.35, 3.1 + rr() * 1.1, (rr() - .5) * 1.2)
        crown.userData.noCollision = 1
        grp.add(crown)
      }
      break
    }
    case 'l10haybale': {
      const height = Math.max(.42, Number(s.data?.height ?? .64))
      const radius = Math.min(.085, s.w * .08, s.h * .08, height * .12)
      const geo = new RoundedBoxGeometry(s.w, height, s.h, 4, radius)
      const pos = geo.attributes.position as THREE.BufferAttribute
      const uv = geo.attributes.uv as THREE.BufferAttribute
      const nor = geo.attributes.normal as THREE.BufferAttribute
      // 三向投影让压缩纤维在顶面、端面与侧面保持相近密度，不被长方体 UV 拉伸。
      for (let i = 0; i < uv.count; i++) {
        const nx = Math.abs(nor.getX(i)), ny = Math.abs(nor.getY(i)), nz = Math.abs(nor.getZ(i))
        if (ny >= nx && ny >= nz) uv.setXY(i, pos.getX(i) * 2.7, pos.getZ(i) * 2.7)
        else if (nx >= nz) uv.setXY(i, pos.getZ(i) * 2.7, pos.getY(i) * 2.7)
        else uv.setXY(i, pos.getX(i) * 2.7, pos.getY(i) * 2.7)
      }
      uv.needsUpdate = true
      const body = new THREE.Mesh(geo, l10HayMaterial())
      body.position.y = height / 2 - .025 // 轻微压入平台，斜视角也不会露出底缝
      grp.add(body)

      // 两道麻绳完整绕过顶面和前后侧；仅干草主体参与碰撞，细绳不会制造碎小碰撞盒。
      const twine = litMaterial({ color: '#6b4925', roughness: .98, envBase: .01 })
      for (const x of [-s.w * .24, s.w * .24]) {
        const top = new THREE.Mesh(new THREE.BoxGeometry(.022, .014, s.h + .018), twine)
        top.position.set(x, height - .018, 0); top.userData.noCollision = 1; grp.add(top)
        for (const z of [-s.h / 2 - .004, s.h / 2 + .004]) {
          const side = new THREE.Mesh(new THREE.BoxGeometry(.022, height * .9, .012), twine)
          side.position.set(x, height * .5 - .018, z); side.userData.noCollision = 1; grp.add(side)
        }
      }
      grp.rotation.y = Number(s.data?.deg ?? 0) * Math.PI / 180
      break
    }
    case 'l10shed': case 'l10stable': case 'l10outhouse': {
      const stable = s.kind === 'l10stable', outhouse = s.kind === 'l10outhouse'
      const bh = outhouse ? 2.25 : stable ? 3.0 : 2.65
      const woodMat = l10Wettable(litMaterial({ color: outhouse ? '#9b896d' : '#b5a17d', map: levelTexture('l10_wood_diff.jpg', () => noiseTexture('#806545', '#b09166')), normalMap: levelTexture('l10_wood_normal.jpg', () => noiseTexture('#8080ff', '#7f7fff')), roughnessMap: levelTexture('l10_wood_rough.jpg', () => noiseTexture('#eeeeee', '#cccccc')), normalScale: new THREE.Vector2(.62, .62), roughness: .91, envBase: .045 }), .91, .045)
      const panel = (w: number, h: number, d: number, x: number, y: number, z: number) => { const q = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), woodMat); q.position.set(x, y, z); grp.add(q) }
      const doorW = outhouse ? .78 : stable ? 2.3 : 1.2
      panel((s.w - doorW) / 2, bh, .14, -(s.w + doorW) / 4, bh / 2, s.h / 2)
      panel((s.w - doorW) / 2, bh, .14, (s.w + doorW) / 4, bh / 2, s.h / 2)
      panel(s.w, bh, .14, 0, bh / 2, -s.h / 2)
      panel(.14, bh, s.h, -s.w / 2, bh / 2, 0); panel(.14, bh, s.h, s.w / 2, bh / 2, 0)
      const roof = gableRoof(s.w + .35, s.h + .35, Math.min(1.35, s.h * .28), '#55483a', '#8b7659', { name: 'l10_roof', tint: '#8c7a61' })
      roof.position.y = bh; grp.add(roof)
      if (outhouse) { const moon = new THREE.Mesh(new THREE.CircleGeometry(.13, 18), new THREE.MeshBasicMaterial({ color: '#1c211f' })); moon.position.set(0, 1.65, s.h / 2 + .076); grp.add(moon) }
      if (stable) for (let i = 1; i < 3; i++) panel(.09, 1.15, s.h - .5, -s.w / 2 + i * s.w / 3, .58, 0)
      break
    }
    case 'l10worksite': {
      const canvas = '#77775f', marker = '#d7a23b', metal = l10MetalMaterial()
      grp.add(box(2.2, .08, 1.05, '#8b775a', 0, .78, 0))
      for (const x of [-.85, .85]) for (const z of [-.35, .35]) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(.055, .76, .055), metal)
        leg.position.set(x, .38, z); leg.rotation.z = x * .08; grp.add(leg)
      }
      grp.add(box(.9, .025, .62, '#d8d2bb', -.15, .84, -.05))
      for (let i = 0; i < 3; i++) {
        const post = new THREE.Mesh(new THREE.CylinderGeometry(.025, .035, 1.65, 7), metal)
        post.position.set(2, .82, .25); post.rotation.z = (i - 1) * .22; grp.add(post)
      }
      grp.add(box(.42, .28, .28, canvas, 2.0, 1.62, .25)); grp.add(glow(.08, .08, .02, marker, 2.0, 1.64, .4))
      break
    }
    case 'l10digsite': {
      const soil = litMaterial({ color: '#80674a', map: levelTexture('l10_dry_soil_diff.jpg', () => noiseTexture('#66513b', '#9a7d59')), normalMap: levelTexture('l10_dry_soil_normal.jpg', () => noiseTexture('#8080ff', '#7f7fff')), roughnessMap: levelTexture('l10_dry_soil_rough.jpg', () => noiseTexture('#eeeeee', '#d2d2d2')), roughness: .98, envBase: .01 })
      const rim = new THREE.Mesh(new THREE.TorusGeometry(.78, .16, 6, 20), soil); rim.rotation.x = Math.PI / 2; rim.position.y = .05; grp.add(rim)
      const pit = new THREE.Mesh(new THREE.CircleGeometry(.66, 20), new THREE.MeshLambertMaterial({ color: '#392b20' })); pit.rotation.x = -Math.PI / 2; pit.position.y = .012; grp.add(pit)
      const shovel = box(.055, 1.25, .055, '#755332', .72, .58, .18); shovel.rotation.z = -.35; grp.add(shovel)
      const blade = new THREE.Mesh(new THREE.BoxGeometry(.23, .32, .055), l10MetalMaterial())
      blade.position.set(1.02, .09, .18); blade.rotation.z = -.35; grp.add(blade)
      break
    }
    // ===================== v23：Level 11「The City That Never Sleeps」 =====================
    case 'towerblock': {
      // 混凝土峭壁般的楼体（非实心标记，体量极大 → 只用 2 个 mesh：立面盒 + 屋顶板）。
      // 从墙顶 H 起算，底层由地图墙体本身构成，可进入的街区不会被这块体量堵死。
      // v53：立面换下载混凝土贴图 l11_tower.jpg（towerFacade 程序纹理留作离线回退）、
      //      屋顶板换 l11_roof.jpg——贴图均值归一 0.72，tint=原纯色÷0.72（#6a6d72→#93979e / #565a5f→#777d84）
      const floors = (s.data?.floors as number | undefined) ?? 4
      const top = Math.max(H + 3, floors * 3)
      const body = towerBox(s.w + 0.1, top - H, s.h + 0.1, '#93979e', 'l11_tower')
      body.position.y = H + (top - H) / 2
      grp.add(body)
      grp.add(texBox(s.w + 0.4, 0.45, s.h + 0.4, 'l11_roof', '#565a5f', '#565a5f', '#777d84', 3.2, 0, top + 0.2, 0)) // 女儿墙/屋顶板
      break
    }
    case 'blackwindow': {
      // 黑色镀膜镜面窗：只反射不透视。窗可能落在墙瓦片上（朝开阔侧朝外贴），
      // 也可能落在街面瓦片上（朝最近的墙贴）。
      const tx = Math.floor(s.x + s.w / 2), ty = Math.floor(s.y + s.h / 2)
      const onWall = m.tiles[ty * m.w + tx] !== 1
      const dirs = onWall ? neighborDirs(s, m, true) : neighborDirs(s, m, false)
      const use = dirs.length ? dirs.slice(0, 2) : [buildingDir(s, m)]
      const glassMat = new THREE.MeshPhongMaterial({ color: '#14171c', specular: '#7c8b9a', shininess: 96 })
      for (const d of use) {
        const wg = new THREE.Group()
        wg.add(box(0.92, 1.5, 0.05, '#2c3036', 0, 0, 0)) // 细窗框
        const glass = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.38, 0.03), glassMat)
        glass.position.z = 0.03
        wg.add(glass)
        wg.add(box(0.92, 0.05, 0.07, '#3a3f46', 0, -0.75, 0.02)) // 窗台
        faceMount(wg, d, 0.03, 2.1, 0, onWall)
        grp.add(wg)
      }
      break
    }
    case 'shopfront': {
      // 店招：横向招牌板 + 上方一排小灯（sign 0–6 对应不同店铺配色）
      const sign = Math.min(6, Math.max(0, (s.data?.sign as number | undefined) ?? 0))
      // 0 Mr. Holloway's Grand Exhibit / 1 Frivolous Frank's / 2 Fun Zone / 3 Caspian's Antiques
      // 4 Papa Pedro's Pizza / 5 商场 / 6 医院
      const bg = ['#3a1e5a', '#b8322c', '#1f7a6a', '#2a3a2c', '#a8261e', '#2a4a7a', '#e8ecec'][sign]
      const ink = ['#e8c46a', '#f0e8dc', '#e85aa8', '#cbb37a', '#f2ead6', '#e6ecf2', '#c0231c'][sign]
      const d = buildingDir(s, m)
      const sg = new THREE.Group()
      sg.add(box(0.98, 0.46, 0.1, bg, 0, 0, 0))
      sg.add(box(1.02, 0.05, 0.12, ink, 0, 0.23, 0))   // 上下描边
      sg.add(box(1.02, 0.05, 0.12, ink, 0, -0.23, 0))
      if (sign === 6) { // 医院：红十字
        sg.add(box(0.26, 0.08, 0.02, ink, 0, 0, 0.06))
        sg.add(box(0.08, 0.26, 0.02, ink, 0, 0, 0.06))
      } else {
        for (let i = 0; i < 3; i++) sg.add(box(0.18 + i * 0.1, 0.07, 0.02, ink, -0.28 + i * 0.16, 0.08 - i * 0.11, 0.06)) // 字块
      }
      for (let i = 0; i < 4; i++) sg.add(glow(0.07, 0.07, 0.07, '#ffe6b8', -0.36 + i * 0.24, 0.34, 0.04)) // 招牌灯
      faceMount(sg, d, 0.08, 2.75)
      grp.add(sg)
      break
    }
    case 'subwayent': {
      // 地铁入口：围栏 + 指示牌 + 向下的黑色开口
      const lineC = ['#c0231c', '#2a6fd8', '#3f8f4a', '#d8a02a', '#8a4ac8'][Math.min(4, Math.max(0, (s.data?.line as number | undefined) ?? 0))]
      const w2 = s.w * 0.92, d2 = s.h * 0.92
      const hole = new THREE.Mesh(new THREE.PlaneGeometry(w2 * 0.72, d2 * 0.66), new THREE.MeshBasicMaterial({ color: '#050506' }))
      hole.rotation.x = -Math.PI / 2
      hole.position.y = 0.02
      grp.add(hole)
      for (let i = 0; i < 2; i++) grp.add(box(w2 * 0.7, 0.06, 0.14, '#5a5d62', 0, 0.03 - i * 0.03, -d2 * 0.3 + i * 0.15)) // 露出的头两级台阶
      for (const sgn of [-1, 1]) { // 两侧围栏
        for (const px of [-w2 * 0.38, 0, w2 * 0.38]) grp.add(box(0.06, 1.0, 0.06, '#4a4d52', px, 0.5, sgn * d2 * 0.36))
        grp.add(box(w2 * 0.84, 0.07, 0.07, '#5a5d62', 0, 0.98, sgn * d2 * 0.36))
        grp.add(box(w2 * 0.84, 0.05, 0.05, '#4a4d52', 0, 0.6, sgn * d2 * 0.36))
      }
      const pole = cyl(0.04, 0.04, 2.3, '#5a5d62', -w2 * 0.46, 1.15, d2 * 0.36, 6)
      grp.add(pole)
      const plate = box(0.5, 0.34, 0.04, '#1c1f24', -w2 * 0.46, 2.2, d2 * 0.36)
      grp.add(plate)
      const disc = cyl(0.11, 0.11, 0.02, lineC, -w2 * 0.46, 2.2, d2 * 0.36 + 0.03, 10)
      disc.rotation.x = Math.PI / 2
      grp.add(disc)
      break
    }
    case 'arcadecab': {
      // 街机柜：柜体 + 倾斜屏幕 + 控制台 + 两个按钮（任何交互都会送你去 Level 25）
      grp.add(box(0.64, 1.5, 0.62, '#2a2d38', 0, 0.75, 0))
      grp.add(box(0.68, 0.12, 0.66, '#1c1e26', 0, 1.56, 0))
      const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.46, 0.4), new THREE.MeshBasicMaterial({ color: '#2ad8d8' }))
      scr.position.set(0, 1.19, 0.3)
      scr.rotation.x = -0.32
      grp.add(scr)
      grp.add(box(0.5, 0.36, 0.04, '#14161c', 0, 1.19, 0.28))
      const ctl = box(0.6, 0.08, 0.32, '#3a3f4a', 0, 0.94, 0.33)
      ctl.rotation.x = 0.2
      grp.add(ctl)
      grp.add(glow(0.07, 0.05, 0.07, '#e04a3a', -0.12, 1.0, 0.36))
      grp.add(glow(0.07, 0.05, 0.07, '#e8d34a', 0.05, 1.0, 0.36))
      grp.add(box(0.03, 0.16, 0.03, '#c9c2a8', -0.24, 1.05, 0.34)) // 摇杆
      for (const px of [-0.33, 0.33]) grp.add(glow(0.02, 1.1, 0.02, '#e85aa8', px, 0.85, 0.3))
      faceOutward(grp, s, m)
      break
    }
    case 'megsign': {
      // M.E.G. 路牌：与 roadsign 同风格但更现代（金属杆 + 蓝底白字牌 + 徽记）
      grp.add(cyl(0.045, 0.05, 2.6, '#9aa0a8', 0, 1.3, 0, 8))
      grp.add(cyl(0.11, 0.13, 0.1, '#7a8088', 0, 0.05, 0, 8))
      const bd = new THREE.Group()
      bd.position.y = 2.25
      bd.add(box(0.98, 0.44, 0.05, '#1e3f78', 0, 0, 0))
      bd.add(box(1.02, 0.05, 0.06, '#dfe6ee', 0, 0.21, 0))
      bd.add(box(1.02, 0.05, 0.06, '#dfe6ee', 0, -0.21, 0))
      for (const zz of [0.031, -0.031]) {
        const em = megEmblem(0.14, '#dfe6ee')
        em.position.set(-0.33, 0, zz)
        if (zz < 0) em.rotation.y = Math.PI
        bd.add(em)
        for (let i = 0; i < 2; i++) bd.add(box(0.44 - i * 0.12, 0.06, 0.012, '#dfe6ee', -0.02 + i * 0.06, 0.07 - i * 0.14, zz))
      }
      grp.add(bd)
      break
    }

    // ===================== v23：Level 601「The End」 =====================
    case 'libshelf': {
      // 现代图书馆书架（双面）：整架合并成 1 个 drawcall——本层要铺上千个
      const r = mulberry(s.x * 211 + s.y * 17)
      const wood = '#8a6a3a'
      const shelfH = 2.4
      const parts: { g: THREE.BufferGeometry; c: string }[] = [
        { g: new THREE.BoxGeometry(1.0, shelfH, 0.12).translate(0, shelfH / 2, 0), c: wood }, // 背板
        { g: new THREE.BoxGeometry(0.08, shelfH, 0.56).translate(-0.46, shelfH / 2, 0), c: wood },
        { g: new THREE.BoxGeometry(0.08, shelfH, 0.56).translate(0.46, shelfH / 2, 0), c: wood },
        { g: new THREE.BoxGeometry(1.0, 0.07, 0.58).translate(0, shelfH - 0.03, 0), c: '#6f5430' },
        { g: new THREE.BoxGeometry(1.0, 0.09, 0.58).translate(0, 0.05, 0), c: '#6f5430' },
      ]
      const spineC = ['#7a3a2e', '#3a4a6a', '#44543a', '#6a5a2e', '#5a3a5a', '#2e3a44']
      for (let tier = 0; tier < 3; tier++) {
        const sy = 0.5 + tier * 0.62
        parts.push({ g: new THREE.BoxGeometry(0.92, 0.05, 0.56).translate(0, sy, 0), c: '#6f5430' })
        for (const zz of [-0.18, 0.18]) // 双面书脊
          for (let i = 0; i < 4; i++)
            parts.push({
              g: new THREE.BoxGeometry(0.19, 0.34 + r() * 0.12, 0.2).translate(-0.33 + i * 0.22, sy + 0.22, zz),
              c: spineC[Math.floor(r() * spineC.length)],
            })
      }
      grp.add(mergedMesh(parts))
      // v48 缺省朝向：背贴最近墙、架面朝外（双面书架）；L601 阵列排（data.row）保持阵列朝向不转，
      // data.deg 可显式覆盖；v51 贴墙位移
      if (s.data?.deg !== undefined) grp.rotation.y = ((Number(s.data.deg) || 0) * Math.PI) / 180
      else if (!s.data?.row) flushToWall(grp, s, m, 0.58)
      break
    }
    case 'endletters': {
      // 中央金属字母「the end is near」：一排高矮不一的窄立方体沿 x 铺开
      const r = mulberry(s.x * 233 + s.y * 89)
      const span = s.w * 0.94
      const mat = new THREE.MeshPhongMaterial({ color: '#9aa0a8', specular: '#dfe6ee', shininess: 64 })
      const n = 14
      for (let i = 0; i < n; i++) {
        const lw = 0.16 + r() * 0.14
        const lh = 0.6 + r() * 1.0
        const gap = i === 3 || i === 7 || i === 10 ? 0.12 : 0 // 词间留白
        const lm = new THREE.Mesh(new THREE.BoxGeometry(lw, lh, 0.14), mat)
        lm.position.set(-span / 2 + 0.2 + (i / (n - 1)) * (span - 0.4) + gap, lh / 2, (r() - 0.5) * 0.12)
        lm.rotation.y = (r() - 0.5) * 0.1
        grp.add(lm)
      }
      grp.add(box(span, 0.1, 0.55, '#54585e', 0, 0.05, 0)) // 底座
      break
    }
    case 'homedoor': {
      // 「家门」：普通住宅前门 + 半圆气窗，门缝底下透着暖黄的光
      grp.add(box(0.16, 2.25, 0.28, '#6a625a', -0.56, 1.12, 0)) // 门框
      grp.add(box(0.16, 2.25, 0.28, '#6a625a', 0.56, 1.12, 0))
      grp.add(box(1.28, 0.16, 0.28, '#6a625a', 0, 2.32, 0))
      grp.add(box(0.98, 2.1, 0.09, '#6a4326', 0, 1.05, 0))      // 木门板
      grp.add(box(0.62, 0.72, 0.02, '#553318', 0, 1.55, 0.055)) // 门芯嵌板
      grp.add(box(0.62, 0.52, 0.02, '#553318', 0, 0.72, 0.055))
      grp.add(box(0.62, 0.72, 0.02, '#553318', 0, 1.55, -0.055)) // v54：背面嵌板（正反一致）
      grp.add(box(0.62, 0.52, 0.02, '#553318', 0, 0.72, -0.055))
      grp.add(glow(0.06, 0.06, 0.06, '#c9a24a', 0.34, 1.05, 0.09)) // 门把手
      grp.add(glow(0.06, 0.06, 0.06, '#c9a24a', 0.34, 1.05, -0.09)) // v54：背面把手
      const transom = new THREE.Mesh(
        new THREE.CircleGeometry(0.46, 12, 0, Math.PI),
        new THREE.MeshBasicMaterial({ color: '#ffcf8a', side: THREE.DoubleSide }),
      )
      transom.position.set(0, 2.18, 0.05)
      grp.add(transom)
      grp.add(box(1.02, 0.1, 0.14, '#6a625a', 0, 2.12, 0.02))
      grp.add(glow(0.92, 0.045, 0.16, '#ffcf8a', 0, 0.035, 0.06)) // 门缝底下的暖黄光
      break
    }

    // ===================== v23：通用新容器（均带「已搜刮」视觉变化）=====================
    case 'locker': {
      // 储物柜：竖直金属柜（金属贴图，looted 变暗）+ 通风百叶 + 把手 + 编号牌（v54：薄钢门快速外摆）
      const metalMat = texLambert('locker_metal', s.looted ? '#3f464b' : '#5a636a', '#394046', s.looted ? '#7a8288' : '#e8eaec')
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.64, 1.9, 0.46), metalMat)
      body.position.set(0, 0.95, 0)
      grp.add(body)
      grp.add(box(0.68, 0.07, 0.5, '#4a5259', 0, 1.92, 0))
      const door = new THREE.Mesh(new THREE.BoxGeometry(0.58, 1.82, 0.05), texLambert('locker_metal', s.looted ? '#485057' : '#646d75', '#394046', s.looted ? '#868e94' : '#f0f2f4'))
      door.geometry.translate(0.29, 0.95, 0) // 铰链在左缘
      door.position.set(-0.29, 0.02, 0.235)
      movable(door, 'lid')
      grp.add(door)
      for (let i = 0; i < 4; i++) door.add(box(0.3, 0.022, 0.02, '#394046', 0.29, 1.44 + i * 0.08, 0.032)) // 百叶
      door.add(box(0.16, 0.08, 0.015, '#d8d2c0', 0.29, 1.64, 0.033)) // v54：编号牌
      door.add(box(0.05, 0.2, 0.045, '#c9c2a8', 0.51, 0.9, 0.04)) // 把手
      if (s.looted) grp.userData.open = 1
      flushToWall(grp, s, m, 0.46) // v51 贴墙位移
      break
    }
    case 'toolbox': {
      // 工具箱：红色金属箱 + 提手（v54：锁扣先弹开，箱盖后翻到底 >120°；提手随盖）
      const red = s.looted ? '#6f2a22' : '#a63a2e'
      grp.add(box(0.58, 0.26, 0.3, red, 0, 0.13, 0))
      const lid = box(0.58, 0.16, 0.3, s.looted ? '#7d2f26' : '#b84434', 0, 0, 0)
      lid.geometry.translate(0, 0.08, 0.15) // 铰链在后上缘
      lid.position.set(0, 0.26, -0.15)
      lid.add(box(0.2, 0.03, 0.03, '#c9c2a8', 0, 0.19, 0.15))       // 提手
      for (const px of [-0.08, 0.08]) lid.add(box(0.03, 0.1, 0.03, '#c9c2a8', px, 0.15, 0.15))
      movable(lid, 'lid')
      grp.add(lid)
      grp.add(box(0.6, 0.03, 0.32, '#3a3d42', 0, 0.26, 0))
      const latch = box(0.08, 0.07, 0.03, '#c9c2a8', 0, 0.3, 0.16)  // 前锁扣
      movable(latch, 'latch')
      grp.add(latch)
      if (s.looted) grp.userData.open = 1
      flushToWall(grp, s, m, 0.3) // v51 贴墙位移
      break
    }
    case 'suitcase': {
      // 行李箱：卧倒的皮箱 + 两条搭扣带（v54：搭扣先弹开，上盖再翻平；提把随盖）
      const skin = s.looted ? '#3e2b20' : '#5a4030'
      grp.add(box(0.74, 0.2, 0.5, skin, 0, 0.1, 0))
      const lid = box(0.74, 0.14, 0.5, s.looted ? '#4a3426' : '#6a4c38', 0, 0, 0)
      lid.geometry.translate(0, 0.07, 0.25) // 铰链在后缘
      lid.position.set(0, 0.2, -0.25)
      lid.add(box(0.22, 0.05, 0.05, '#3a2a1e', 0, 0.15, 0.25))        // 提把
      movable(lid, 'lid')
      grp.add(lid)
      for (const px of [-0.2, 0.2]) {
        grp.add(box(0.08, 0.22, 0.52, '#3a2a1e', px, 0.11, 0))     // 搭扣带
        const buckle = box(0.1, 0.06, 0.06, '#c9a24a', px, 0.14, 0.26) // 扣件
        movable(buckle, 'latch', px < 0 ? 0 : 1)
        grp.add(buckle)
      }
      if (s.looted) grp.userData.open = 1
      break
    }
    case 'fridge': {
      // 冰箱：白色双门（上小下大）+ 竖直把手（v54：门内密封条 + 开门灯亮 + 底部散热栅）
      const body = s.looted ? '#9a9a95' : '#c9c9c4'
      grp.add(box(0.8, 1.75, 0.7, body, 0, 0.875, 0))
      const top = box(0.76, 0.52, 0.06, s.looted ? '#a8a8a2' : '#d6d6d0', 0, 0, 0)
      top.geometry.translate(0.38, 0, 0)
      top.position.set(-0.38, 1.44, 0.36)
      const low = box(0.76, 1.14, 0.06, s.looted ? '#a8a8a2' : '#d6d6d0', 0, 0, 0)
      low.geometry.translate(0.38, 0, 0)
      low.position.set(-0.38, 0.6, 0.36)
      top.add(box(0.7, 0.46, 0.02, '#3a3d40', 0.38, 0, -0.035)) // 密封条（随门）
      low.add(box(0.7, 1.08, 0.02, '#3a3d40', 0.38, 0, -0.035))
      movable(top, 'doorT'); movable(low, 'doorL')
      grp.add(top); grp.add(low)
      top.add(box(0.04, 0.3, 0.04, '#8a8f94', 0.68, 0, 0.05))
      low.add(box(0.04, 0.6, 0.04, '#8a8f94', 0.68, 0.2, 0.05))
      grp.add(box(0.78, 0.04, 0.68, '#8a8f94', 0, 1.16, 0.01)) // 上下门分缝
      // 开门灯：门内顶部小灯片（updateStructs 随开度点亮；looted 常灭）
      const lamp = glow(0.3, 0.04, 0.1, '#4a4a42', 0, 1.62, 0.28)
      movable(lamp, 'light')
      grp.add(lamp)
      // 底部散热栅
      grp.add(box(0.6, 0.12, 0.02, '#7a7f84', 0, 0.09, 0.36))
      for (let i = 0; i < 4; i++) grp.add(box(0.56, 0.015, 0.01, '#3a3d40', 0, 0.05 + i * 0.028, 0.371))
      if (s.looted) grp.add(box(0.7, 1.6, 0.6, '#2a2d30', 0, 0.85, 0.02)) // 空掉的内胆
      if (s.looted) grp.userData.open = 1
      faceOutward(grp, s, m)
      break
    }
    case 'safebox': {
      // 保险箱：厚重方箱 + 圆形转盘锁 + 铰链（v54：转盘先旋转、厚重门再缓慢外摆；铆钉/刻度环细化）
      const body = s.looted ? '#2c2f33' : '#3a3d42'
      grp.add(box(0.72, 0.76, 0.66, body, 0, 0.38, 0))
      grp.add(box(0.76, 0.06, 0.7, '#2a2d31', 0, 0.03, 0)) // 底座
      const door = box(0.62, 0.66, 0.07, s.looted ? '#33373b' : '#454a50', 0, 0, 0)
      door.geometry.translate(-0.31, 0, 0) // 铰链在右缘
      door.position.set(0.31, 0.4, 0.33)
      // 门面铆钉（上下两排）
      for (const rx of [-0.58, -0.31, -0.04]) for (const ry of [-0.28, 0.28]) door.add(box(0.03, 0.03, 0.02, '#5a6068', rx, ry, 0.045))
      // 刻度环（静止）+ 转盘（先转；偏心手柄随转盘公转）
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.015, 5, 16), new THREE.MeshLambertMaterial({ color: '#6a7078' }))
      ring.position.set(-0.25, 0, 0.04)
      door.add(ring)
      const dial = cyl(0.11, 0.11, 0.04, '#8a9098', 0, 0, 0, 12)
      dial.rotation.x = Math.PI / 2
      dial.position.set(-0.25, 0, 0.055)
      dial.add(box(0.04, 0.04, 0.05, '#c9c2a8', 0.06, 0.04, 0)) // 转盘手柄
      movable(dial, 'dial')
      door.add(dial)
      door.add(box(0.05, 0.18, 0.06, '#8a9098', -0.07, -0.02, 0.05)) // 拉手
      movable(door, 'lid')
      grp.add(door)
      for (const hy of [-0.22, 0.22]) grp.add(box(0.06, 0.1, 0.1, '#22252a', 0.33, 0.4 + hy, 0.3)) // 铰链
      if (s.looted) grp.add(box(0.56, 0.6, 0.5, '#141618', 0, 0.4, 0.02))
      if (s.looted) grp.userData.open = 1
      flushToWall(grp, s, m, 0.66) // v51 贴墙位移
      break
    }

    // ===== v30：Level 1 区段扩展 =====
    case 'column': {
      // 哥特段圆柱：圆形石柱 + 柱础 + 柱头（v51：data.pale=L3 圣所大理石浅色变体——凹槽棱条 + 柱头重建）
      const stoneC = s.data?.pale ? '#c8c2b2' : '#7e7a74', darkC = s.data?.pale ? '#a8a294' : '#6a665f'
      grp.add(cyl(0.34, 0.38, H, stoneC, 0, H / 2, 0, 14))
      grp.add(cyl(0.48, 0.52, 0.22, darkC, 0, 0.11, 0, 14))
      if (s.data?.pale) {
        // 圣所大理石柱：四道凹槽棱条（起于柱础顶、止于钟形圆饰底）+
        // 柱头重建：echinus 钟形圆饰（外展）+ abacus 顶板——与柱顶齐平贴天花板，无缝不悬空
        for (let i = 0; i < 4; i++) {
          const a = (i / 4) * Math.PI * 2 + Math.PI / 4
          grp.add(box(0.05, H - 0.54, 0.05, '#b2aa9a', Math.cos(a) * 0.35, H / 2 - 0.05, Math.sin(a) * 0.35))
        }
        grp.add(cyl(0.36, 0.5, 0.22, stoneC, 0, H - 0.21, 0, 14)) // echinus（H-0.32..H-0.10，外展覆住柱身顶）
        grp.add(box(0.8, 0.12, 0.8, darkC, 0, H - 0.05, 0)) // abacus 顶板（H-0.11..H+0.01，与圆饰咬合贴顶）
      } else {
        grp.add(cyl(0.46, 0.36, 0.3, darkC, 0, H - 0.15, 0, 14))
      }
      break
    }
    case 'roundarch': {
      // 哥特段圆形拱门：双侧石柱 + 半圆拱顶（非实心，拱洞沿本地 z 轴可穿行）
      const stone = '#7e7a74', dark = '#6a665f'
      const springY = H * 0.55 // 起拱高度
      grp.add(cyl(0.14, 0.17, springY, stone, -0.38, springY / 2, 0, 10))
      grp.add(cyl(0.14, 0.17, springY, stone, 0.38, springY / 2, 0, 10))
      grp.add(cyl(0.2, 0.22, 0.14, dark, -0.38, 0.07, 0, 10)) // 柱础
      grp.add(cyl(0.2, 0.22, 0.14, dark, 0.38, 0.07, 0, 10))
      const arch = new THREE.Mesh(
        new THREE.TorusGeometry(0.38, 0.11, 8, 16, Math.PI),
        new THREE.MeshLambertMaterial({ color: stone }),
      )
      arch.position.set(0, springY, 0) // 半圆环躺在 XY 竖直面内，拱洞朝 z 轴打开
      grp.add(arch)
      grp.add(box(0.2, 0.16, 0.24, dark, 0, springY + 0.42, 0)) // 拱顶石
      break
    }
    case 'vaultcol': {
      // 哥特段拱顶柱（v34，参照地下停车场交叉拱）：粗圆柱身 + 柱顶喇叭展开顶到天花；
      // data.archX/archY 时从柱顶向 +x/+y 伸出连拱板（纯视觉，与邻柱连成连续拱腹）
      const stone = '#7e7a74', dark = '#6a665f'
      grp.add(cyl(0.5, 0.54, 0.22, dark, 0, 0.11, 0, 14)) // 柱础
      grp.add(cyl(0.36, 0.42, H * 0.62, stone, 0, H * 0.31, 0, 14)) // 柱身（0 ~ H*0.62）
      grp.add(cyl(0.46, 0.36, H * 0.12, stone, 0, H * 0.68, 0, 14)) // 过渡圆台（H*0.62 ~ H*0.74）
      grp.add(cyl(1.05, 0.46, H * 0.26, stone, 0, H * 0.87, 0, 14)) // 喇叭头展开（H*0.74 ~ H，顶到天花）
      const spanX = (s.data?.spanX as number | undefined) ?? 0
      const spanY = (s.data?.spanY as number | undefined) ?? 0
      if (s.data?.archX && spanX > 0) grp.add(box(spanX, 0.34, 1.2, stone, spanX / 2, H - 0.42, 0))
      if (s.data?.archY && spanY > 0) grp.add(box(1.2, 0.34, spanY, stone, 0, H - 0.42, spanY / 2))
      break
    }
    case 'scaffold': {
      // 衔尾段脚手架：四角立杆 + 两层横杆 + 顶部踏板（2×1）
      const hw = s.w / 2 - 0.12, hd = s.h / 2 - 0.12
      for (const [px, pz] of [[-hw, -hd], [hw, -hd], [-hw, hd], [hw, hd]] as const)
        grp.add(cyl(0.045, 0.045, H * 0.82, '#8a7a3a', px, H * 0.41, pz, 6))
      for (const ly of [H * 0.32, H * 0.62]) {
        grp.add(box(s.w - 0.1, 0.05, 0.05, '#8a7a3a', 0, ly, -hd))
        grp.add(box(s.w - 0.1, 0.05, 0.05, '#8a7a3a', 0, ly, hd))
        grp.add(box(0.05, 0.05, s.h - 0.1, '#8a7a3a', -hw, ly, 0))
        grp.add(box(0.05, 0.05, s.h - 0.1, '#8a7a3a', hw, ly, 0))
      }
      grp.add(box(s.w - 0.06, 0.06, s.h - 0.06, '#a08a5a', 0, H * 0.82, 0)) // 踏板
      break
    }
    case 'roadblock': {
      // 衔尾段施工路障：双立柱 + 橙白条纹横板
      grp.add(box(0.08, 0.8, 0.08, '#3a3d42', -0.38, 0.4, 0))
      grp.add(box(0.08, 0.8, 0.08, '#3a3d42', 0.38, 0.4, 0))
      grp.add(box(0.92, 0.2, 0.06, '#d9642a', 0, 0.62, 0))
      grp.add(box(0.92, 0.07, 0.07, '#e8e2d2', 0, 0.62, 0.005))
      grp.add(box(0.92, 0.14, 0.06, '#d9642a', 0, 0.3, 0))
      grp.add(glow(0.07, 0.07, 0.07, '#ffb03a', -0.38, 0.86, 0))
      grp.add(glow(0.07, 0.07, 0.07, '#ffb03a', 0.38, 0.86, 0))
      break
    }
    case 'debrispile': {
      // 衔尾段建材碎料堆（非容器不阻挡）：沙堆 + 碎砖 + 斜搭的木板（位置确定性，重建一致）
      const rng = mulberry((Math.floor(s.x) * 73856093) ^ (Math.floor(s.y) * 19349663) ^ 0x51ab)
      grp.add(cyl(0.34, 0.46, 0.18, '#9a8f7a', 0.1, 0.09, -0.08, 10)) // 沙堆（扁圆台）
      grp.add(cyl(0.2, 0.3, 0.12, '#8a7f6c', -0.22, 0.06, 0.2, 8))   // 小沙堆
      for (let i = 0; i < 4; i++) { // 碎砖
        const b = box(0.2, 0.09, 0.1, i % 2 ? '#8a4a3a' : '#7a4034',
          (rng() - 0.5) * 0.6, 0.045 + (i > 1 ? 0.09 : 0), (rng() - 0.5) * 0.6)
        b.rotation.y = rng() * Math.PI
        grp.add(b)
      }
      const plank = box(0.62, 0.035, 0.14, '#a08a5a', 0.05, 0.16, 0.12) // 斜搭的木板
      plank.rotation.z = 0.28
      plank.rotation.y = -0.4 + rng() * 0.8
      grp.add(plank)
      break
    }
    case 'scrap': {
      // 碎金属堆（L2 肮脏的廊道地面散件；非容器不阻挡）：扭曲金属片 + 躺倒短管 + 弯钩件
      const rng = mulberry((Math.floor(s.x) * 73856093) ^ (Math.floor(s.y) * 19349663) ^ 0x5c4a)
      for (let i = 0; i < 3; i++) {
        const p = box(0.28 + rng() * 0.22, 0.03, 0.14 + rng() * 0.12, i % 2 ? '#6e4a30' : '#5a5a5e',
          (rng() - 0.5) * 0.5, 0.02 + i * 0.04, (rng() - 0.5) * 0.5)
        p.rotation.y = rng() * Math.PI
        p.rotation.z = (rng() - 0.5) * 0.5
        grp.add(p)
      }
      const tube = cyl(0.05, 0.05, 0.55, '#7a4a2e', 0.08, 0.07, -0.08, 8) // 躺倒的短管
      tube.rotation.z = Math.PI / 2 - 0.12
      tube.rotation.y = 0.5
      grp.add(tube)
      const hook = box(0.04, 0.22, 0.04, '#8a4526', -0.2, 0.1, 0.16) // 弯钩件
      hook.rotation.z = 0.7
      grp.add(hook)
      break
    }
    case 'megdoc': {
      // M.E.G. 文档：牛皮纸封皮 + 几页摊开的纸（data.ontable=放在桌面上）
      const y0 = s.data?.ontable ? (s.data?.l0Furniture ? 0.98 : s.data?.manila ? 1.10 : 0.76) : 0
      if(s.data?.doc==='backrooms_basics'){
        grp.add(box(.24,.018,.31,'#f4f2eb',0,y0+.009,0))
        const logo=levelTexture('documents/manila-mary-logo.png',()=>noiseTexture('#ffffff','#98885c'))
        const mark=new THREE.Mesh(new THREE.PlaneGeometry(.095,.05),litMaterial({color:'#ffffff',map:logo}))
        mark.rotation.x=-Math.PI/2;mark.position.set(0,y0+.019,-.11);grp.add(mark)
        // Fine text is suggested by ink lines; the readable letter uses the original logo and text.
        const lines:THREE.BufferGeometry[]=[]
        for(let paragraph=0;paragraph<4;paragraph++)for(let row=0;row<3;row++){
          const line=new THREE.BoxGeometry(row===2?.15:.20,.0015,.002)
          line.translate(row===2?-.025:0,y0+.019,-.065+paragraph*.047+row*.009);lines.push(line)
        }
        const geometry=mergeGeometries(lines);lines.forEach(g=>g.dispose())
        if(geometry)grp.add(new THREE.Mesh(geometry,litMaterial({color:'#555047'})))
        break
      }
      grp.add(box(0.24, 0.015, 0.3, '#c9a86a', 0, y0 + 0.008, 0))
      grp.add(box(0.22, 0.01, 0.28, '#e8e2d2', 0.01, y0 + 0.022, 0.01))
      const page = box(0.2, 0.008, 0.26, '#dcd6c4', -0.015, y0 + 0.032, -0.01)
      page.rotation.y = 0.12
      grp.add(page)
      grp.add(box(0.06, 0.006, 0.06, '#3a5a7a', -0.06, y0 + 0.038, 0.08)) // M.E.G. 徽记色块
      break
    }
    case 'inkdoor': {
      // 维护通廊墨黑色金属门：嵌在墙洞里的门框（双立柱 + 门楣 + 门槛，横跨 2 格门洞）
      // + 一扇向走廊内敞开的门扇——一眼即知「这是门，而且能过」。
      // 标准朝向：通行沿本地 x 轴（门框平面垂直 x）；data.rot=1 旋转 90°（通行沿本地 z 轴）。
      const ink = '#14161a', ink2 = '#1c1f24'
      const doorH = H * 0.78
      grp.add(box(0.5, doorH, 0.24, ink, 0, doorH / 2, -0.95)) // 门洞两侧立柱（跨 2 瓦片）
      grp.add(box(0.5, doorH, 0.24, ink, 0, doorH / 2, 0.95))
      grp.add(box(0.5, 0.3, 2.14, ink2, 0, doorH + 0.15, 0)) // 门楣
      grp.add(box(0.46, 0.05, 1.9, '#0a0b0d', 0, 0.025, 0)) // 门槛
      // 门顶封墙：门楣上方直到天花板全部封死（只留门洞通行）
      const sealH = H - (doorH + 0.3)
      if (sealH > 0.05) grp.add(box(0.46, sealH, 2.14, '#a8a49a', 0, doorH + 0.3 + sealH / 2, 0))
      // 绿色 EXIT 指示灯（门楣正上方、封墙板上，两侧各一块自发光牌）
      for (const sd of [-1, 1]) {
        const sign = new THREE.Mesh(new THREE.PlaneGeometry(0.72, 0.26), new THREE.MeshBasicMaterial({ map: exitSignTexture() }))
        sign.position.set(sd * 0.236, doorH + 0.5, 0)
        sign.rotation.y = sd > 0 ? Math.PI / 2 : -Math.PI / 2
        grp.add(sign)
      }
      grp.add(glow(0.32, 0.05, 0.05, '#3ae06a', 0, doorH + 0.32, 0)) // EXIT 绿色底光
      // 门扇：初始关闭（恰好覆盖门洞），铰链在 +z 侧立柱；
      // userData.lid 由 renderer.updateStructs 驱动——交互开门后向走廊内旋开至 ~106°
      const leaf = box(0.08, doorH - 0.18, 1.7, '#181b20', 0, 0, 0)
      leaf.geometry.translate(0, 0, -0.85) // 铰链边移到局部 z=0
      leaf.position.set(0.06, doorH / 2, 0.86)
      leaf.userData.lid = 1
      leaf.add(box(0.06, 0.08, 0.14, '#8a9098', 0.07, 0, -1.48)) // 门把手（随门扇）
      leaf.add(box(0.06, 0.08, 0.14, '#8a9098', -0.07, 0, -1.48)) // v54：背面把手（双面）
      for (const sd of [-1, 1]) for (const ry of [-doorH * 0.22, doorH * 0.22]) // v54：门扇两面加强肋（正反一致）
        leaf.add(box(0.02, 0.12, 1.5, ink2, sd * 0.05, ry, -0.85))
      grp.add(leaf)
      // 门楣两端的冷白描边灯（黑暗中也能认出这是一扇门）
      grp.add(glow(0.1, 0.04, 0.1, '#e8e8e0', 0.26, doorH + 0.04, -0.95))
      grp.add(glow(0.1, 0.04, 0.1, '#e8e8e0', 0.26, doorH + 0.04, 0.95))
      if (s.data?.rot) grp.rotation.y = Math.PI / 2
      break
    }
    case 'landmark': {
      // 定居点地标（v35，wikidot 图一：饰有团队标志的彩色布料 + 悬挂物资 + 系着的纸条）
      // v46：海报形地标（data.poster，EL3A）——贴在廊道墙上的海报（data.tex 指定贴图），
      // 交互/小地图标注/前往与布料地标一致
      if (s.data?.poster) {
        const ptex = (s.data?.tex as string | undefined) ?? 'el3a_poster.png'
        const inner2 = new THREE.Group()
        grp.add(inner2)
        inner2.add(box(0.98, 1.26, 0.03, '#223a2c', 0, 1.32, 0)) // 海报背板（BNTG 深绿描边）
        const ppanel = new THREE.Mesh(
          new THREE.PlaneGeometry(0.9, 1.18),
          new THREE.MeshLambertMaterial({ map: levelTexture(ptex, () => noiseTexture('#23402f', '#1e3729')) }),
        )
        ppanel.position.set(0, 1.32, 0.021)
        inner2.add(ppanel)
        inner2.add(glow(0.16, 0.05, 0.05, '#ffe8a0', 0, 2.02, 0.05)) // 顶部小暖灯（鲜亮易寻）
        mountOnWall(inner2, grp, s, m) // 强制贴最近墙（含虚空墙），不浮空
        break
      }
      const bntg = s.data?.outpost === 'bntg'
      const ariane = s.data?.outpost === 'ariane'
      const tom = s.data?.outpost === 'tom'
      const el3a = s.data?.outpost === 'el3a' // v43：办公区EL3A——BNTG 灰绿变体布料
      const hammoz = s.data?.outpost === 'hammoz'
      const clothC = ariane ? '#8676e2' : hammoz ? '#61766a' : el3a ? '#5f7a62' : bntg ? '#3a5a44' : tom ? '#b04030' : '#d9b13b' // 阿丽亚娜紫 / 哈莫兹岩绿 / EL3A 灰绿 / BNTG 深绿 / Tom 暖红 / M.E.G. 鲜黄
      const markC = ariane ? '#f0eefc' : hammoz ? '#d5c18e' : bntg || el3a ? '#e8e8e0' : tom ? '#f8ecd8' : '#3a332c'
      grp.add(cyl(0.03, 0.05, 1.7, '#4a4038', 0, 0.85, 0, 6)) // 立杆
      grp.add(box(0.56, 0.72, 0.03, clothC, 0, 1.22, 0.02)) // 团队色布料
      if (ariane) {
        // 阿丽亚娜徽记：圆环（wikidot：一环紫色圆环组成的圆环——以单环简化表达）
        const ring = new THREE.Mesh(new THREE.RingGeometry(0.07, 0.1, 16), new THREE.MeshLambertMaterial({ color: markC, side: THREE.DoubleSide }))
        ring.position.set(0, 1.3, 0.045)
        grp.add(ring)
      } else if (hammoz) {
        // 哈莫兹徽记：洞穴等高线圆环 + 交叉的测绘绳/岩锤。
        const ring = new THREE.Mesh(new THREE.RingGeometry(0.075, 0.105, 18), new THREE.MeshLambertMaterial({ color: markC, side: THREE.DoubleSide }))
        ring.position.set(0, 1.31, 0.045)
        grp.add(ring)
        const rope = box(0.025, 0.25, 0.012, markC, 0, 1.3, 0.047)
        rope.rotation.z = 0.64
        grp.add(rope)
        const hammer = box(0.025, 0.23, 0.012, markC, 0, 1.29, 0.048)
        hammer.rotation.z = -0.64
        grp.add(hammer)
      } else {
        // 徽记（深色方块拼的展翅/天平标）
        grp.add(box(0.06, 0.2, 0.012, markC, 0, 1.3, 0.045))
        grp.add(box(0.13, 0.05, 0.012, markC, -0.08, 1.32, 0.045))
        grp.add(box(0.13, 0.05, 0.012, markC, 0.08, 1.32, 0.045))
        grp.add(box(0.2, 0.05, 0.012, markC, 0, 1.24, 0.045))
      }
      // 悬挂的杏仁水瓶（细绳 + 瓶）
      grp.add(box(0.012, 0.14, 0.012, '#8a8474', 0.2, 0.95, 0.03))
      grp.add(cyl(0.045, 0.05, 0.14, '#c9d9a8', 0.2, 0.82, 0.03, 6))
      // 系着的纸条
      grp.add(box(0.14, 0.18, 0.012, '#f0e6c0', -0.18, 1.1, 0.045))
      // 顶部小暖灯（鲜亮易寻——与灰暗景观形成鲜明对比）
      grp.add(glow(0.1, 0.06, 0.1, '#ffe8a0', 0, 1.74, 0))
      break
    }

    // ===== v35：据点（Alpha 基地）家具 =====
    case 'serverrack': {
      // 中控室无线电机柜：深色机柜 + 顶部监视器 + 表盘/指示灯/线缆
      grp.add(box(0.72, 1.86, 0.4, '#24272c', 0, 0.93, 0)) // 机柜主体
      for (const sx of [-0.17, 0.17]) { // 顶部两台监视器（微仰）
        const mon = box(0.28, 0.22, 0.2, '#3a3e45', sx, 1.98, -0.02)
        mon.rotation.x = -0.22
        grp.add(mon)
        grp.add(box(0.22, 0.14, 0.015, '#5a6a78', sx, 1.99, 0.085))
      }
      const dial = cyl(0.09, 0.09, 0.02, '#d8d2c2', -0.18, 1.5, 0.21, 12) // 大表盘
      dial.rotation.x = Math.PI / 2
      grp.add(dial)
      for (let i = 0; i < 4; i++) grp.add(cyl(0.02, 0.02, 0.015, '#c9b458', -0.02 + i * 0.09, 1.5, 0.205, 6).rotateX(Math.PI / 2)) // 小旋钮
      for (let i = 0; i < 3; i++) grp.add(glow(0.03, 0.03, 0.012, ['#7ac97a', '#e8b93c', '#d96a4a'][i], -0.2 + i * 0.08, 1.28, 0.205)) // 指示灯
      for (let i = 0; i < 5; i++) grp.add(box(0.06, 0.02, 0.02, '#c94a3a', -0.15 + i * 0.075, 1.06, 0.21)) // 红色接线排
      for (let i = 0; i < 3; i++) grp.add(box(0.015, 0.5, 0.015, '#15181c', -0.24 + i * 0.05, 0.55, 0.21)) // 垂下线缆
      grp.add(box(0.6, 0.06, 0.34, '#15181c', 0, 0.16, 0.02)) // 底部线槽
      // v54：机架单元分层缝 + 右侧指示灯列 + 背部走线束
      for (let i = 0; i < 5; i++) grp.add(box(0.64, 0.02, 0.02, '#15181c', 0, 0.5 + i * 0.28, 0.205)) // 单元分层
      for (let i = 0; i < 9; i++)
        grp.add(glow(0.018, 0.018, 0.012, i % 3 === 0 ? '#e8b93c' : '#6f9a55', 0.29, 0.42 + i * 0.15, 0.205)) // 指示灯列
      for (let i = 0; i < 3; i++)
        grp.add(cyl(0.018, 0.018, 1.5, ['#3a3f46', '#5a3a3a', '#2e3238'][i], -0.2 + i * 0.2, 0.9, -0.21, 6)) // 背部走线
      break
    }
    case 'officechair': {
      // 办公转椅（非实心）：五星脚 + 气杆 + 座面 + 靠背 + 扶手
      grp.add(cyl(0.03, 0.03, 0.32, '#6a6a70', 0, 0.24, 0, 8)) // 气杆
      for (let i = 0; i < 4; i++) { // 四星脚
        const a = (i * Math.PI) / 2 + Math.PI / 4
        const leg = box(0.3, 0.03, 0.05, '#4a4a50', Math.cos(a) * 0.15, 0.06, Math.sin(a) * 0.15)
        leg.rotation.y = -a
        grp.add(leg)
      }
      grp.add(box(0.42, 0.07, 0.4, '#2e2e33', 0, 0.44, 0)) // 座面
      const back = box(0.4, 0.44, 0.07, '#2e2e33', 0, 0.76, -0.18) // 靠背（微后倾）
      back.rotation.x = 0.12
      grp.add(back)
      grp.add(box(0.05, 0.05, 0.3, '#4a4a50', -0.2, 0.56, -0.02)) // 扶手（左）
      grp.add(box(0.05, 0.05, 0.3, '#4a4a50', 0.2, 0.56, -0.02)) // 扶手（右）
      // v35：朝向机制——正对最近的桌子（桌/书桌/隔间工位，2.5 格内）；附近没有桌子则背向最近的墙
      // v54c：cubicle 纳入「桌」类（L4 办公间区工位——转椅面向隔间桌板，不再椅背对桌）
      {
        const cx = s.x + s.w / 2, cy = s.y + s.h / 2
        let bt: { x: number; y: number } | null = null, bd = 1e9
        for (const o of m.structures) {
          if (o === s || (o.kind !== 'table' && o.kind !== 'desk' && o.kind !== 'dtable' && o.kind !== 'cubicle')) continue
          const ox = o.x + o.w / 2, oy = o.y + o.h / 2
          const d = Math.hypot(ox - cx, oy - cy)
          if (d < bd) { bd = d; bt = { x: ox, y: oy } }
        }
        if (bt && bd <= 2.5) {
          grp.rotation.y = Math.atan2(bt.x - cx, bt.y - cy) // 模型正面 +Z 指向桌子
        } else {
          faceOutward(grp, s, m) // 无桌：背墙（faceOutward 即正面背向最近墙面）
        }
      }
      break
    }
    case 'binshelf': {
      // 储物货架：金属立柱 + 三层搁板 + 蓝/灰收纳箱（白色标签）
      const hw = s.w / 2 - 0.06
      for (const px of [-hw, hw]) for (const pz of [-0.16, 0.16]) grp.add(box(0.05, 1.9, 0.05, '#8a8a8e', px, 0.95, pz)) // 立柱
      for (const sy of [0.3, 0.85, 1.4, 1.86]) grp.add(box(s.w - 0.04, 0.04, 0.42, '#9a9a9e', 0, sy, 0)) // 搁板
      const binC = ['#2e4ac9', '#5a5f66', '#2e4ac9', '#5a5f66', '#3a5ad9']
      let bi = 0
      for (const sy of [0.44, 0.99, 1.54]) {
        for (let bx0 = -hw + 0.24; bx0 <= hw - 0.2; bx0 += 0.46) {
          const bc = binC[bi % binC.length]
          const bm = box(0.4, 0.26, 0.36, bc, bx0, sy, 0) // 收纳箱
          bm.add(box(0.12, 0.09, 0.012, '#f0f0ea', 0, 0.02, 0.19)) // 白色标签（随箱）
          movable(bm, 'bin', bi) // v54：搜刮时收纳箱逐个错落地抽出
          grp.add(bm)
          bi++
        }
      }
      if (s.looted) grp.userData.open = 1
      // v48 缺省朝向：背贴最近墙、标签面（+Z）朝外；data.deg 可显式覆盖；v51 贴墙位移
      if (s.data?.deg !== undefined) grp.rotation.y = ((Number(s.data.deg) || 0) * Math.PI) / 180
      else flushToWall(grp, s, m, 0.42)
      break
    }
    case 'bunkbed': {
      // 双层床：木框架 + 上下铺 + 床梯 + 床垫枕头（沿本地 z 纵放，占地 1×2）
      // v54：四柱贯通上下铺 + 上铺双侧护栏与短边端栏（床尾留爬梯口）+ 床单分层（微垂边/上下铺色差）
      const wood = '#7a5a34', mat = '#e8e4d8'
      for (const px of [-0.4, 0.4]) for (const pz of [-0.92, 0.92]) grp.add(box(0.08, 1.6, 0.08, wood, px, 0.8, pz)) // 四柱（贯通上下铺）
      for (const dy of [0.5, 1.2]) { // 两层床板 + 床垫 + 床单 + 枕头
        const sheet = dy > 1 ? '#c8b8a8' : '#a8b8c8' // 上下铺床单色差
        grp.add(box(0.86, 0.07, 1.9, wood, 0, dy, 0))
        grp.add(box(0.78, 0.12, 1.8, mat, 0, dy + 0.09, 0))
        grp.add(box(0.82, 0.03, 1.84, sheet, 0, dy + 0.165, 0)) // 床单（略大床垫一圈）
        for (const px of [-0.4, 0.4]) grp.add(box(0.03, 0.1, 1.84, sheet, px, dy + 0.1, 0)) // 床单垂边
        grp.add(box(0.5, 0.1, 0.3, '#f0ede0', 0, dy + 0.2, -0.7)) // 枕头
      }
      for (const dx of [-0.17, 0.17]) grp.add(box(0.05, 1.3, 0.05, wood, dx, 0.75, 0.98)) // 床梯立杆（端部）
      for (let i = 0; i < 4; i++) grp.add(box(0.38, 0.04, 0.04, wood, 0, 0.3 + i * 0.32, 0.98)) // 梯档
      grp.add(box(0.86, 0.3, 0.06, wood, 0, 1.5, -0.92)) // 上铺端栏（床头）
      grp.add(box(0.06, 0.24, 1.8, wood, -0.4, 1.42, 0)) // 上铺侧护栏（长边）
      grp.add(box(0.06, 0.24, 1.8, wood, 0.4, 1.42, 0)) // 上铺侧护栏（另一侧长边）
      for (const px of [-0.32, 0.32]) grp.add(box(0.22, 0.24, 0.06, wood, px, 1.42, 0.92)) // 床尾端栏两段（中间 0.42 爬梯口）
      // v55（任务8）：床头靠墙朝向（同 bed 约定：data.deg=床头朝向，模型床头在局部 -z）
      if (s.data?.deg !== undefined) grp.rotation.y = (((Number(s.data.deg) || 0) + 180) * Math.PI) / 180
      break
    }
    case 'screenboard': {
      // 投影幕 + 黑板（贴墙，朝外，背板贴墙面）
      const inner = new THREE.Group()
      grp.add(inner)
      inner.add(box(1.9, 1.0, 0.05, '#1e2a26', 0, 1.15, 0)) // 黑板
      inner.add(box(1.94, 0.06, 0.07, '#6a6a62', 0, 0.62, 0.01)) // 板槽
      inner.add(box(1.5, 0.86, 0.04, '#e8e6e0', 0, 2.1, 0.02)) // 投影幕（垂下）
      const roll = cyl(0.025, 0.025, 1.56, '#9a9a9e', 0, 2.56, 0.02, 8)
      roll.rotation.z = Math.PI / 2
      inner.add(roll) // 幕布卷轴
      inner.add(box(0.2, 0.05, 0.05, '#4a4a42', -0.6, 0.64, 0.04)) // 板擦
      mountOnWall(inner, grp, s, m) // 强制贴最近墙（含虚空墙），不浮空
      break
    }
    case 'noticeboard': case 'megposter': case 'photo': {
      // 据点墙面装饰：贴图画板（公告栏/标语海报/相片，磁盘贴图 + 程序兜底，背板贴墙面）
      // data.tex 可指定替代贴图（如 bntg_poster.png）
      // v54：photo 无显式 data.tex 时按瓦片坐标哈希从照片贴图池选一张（同位置重建不变）
      const tex = (s.data?.tex as string | undefined) ?? (s.kind === 'noticeboard' ? 'noticeboard.png' : s.kind === 'megposter' ? 'poster_slogan.png'
        : PHOTO_POOL[Math.floor(mulberry(s.x * 97 + s.y * 53)() * PHOTO_POOL.length)])
      const fb = s.kind === 'noticeboard' ? '#8a6a42' : s.kind === 'megposter' ? '#efe8d2' : '#c9b87a'
      if (s.data?.flat) {
        // 躺在地板上的画作/地面导引贴花（data.flat：小径画廊；data.tex 可换贴图，如 mall_arrow.png）
        if (!s.data?.tex) grp.add(box(0.66, 0.02, 0.54, '#4a4038', 0, 0.01, 0)) // 画作背板（贴花无背板）
        const panel = new THREE.Mesh(
          new THREE.PlaneGeometry(0.62, 0.5),
          new THREE.MeshLambertMaterial({ map: levelTexture(tex, () => noiseTexture(fb, '#5a4e34')), transparent: true }),
        )
        const deg = ((s.data?.deg as number | undefined) ?? 0) * Math.PI / 180
        if (deg) panel.geometry.rotateZ(deg) // data.deg：贴花朝向（如地面箭头转向）
        panel.rotation.x = -Math.PI / 2
        panel.position.set(0, 0.025, 0)
        grp.add(panel)
        break
      }
      const tall = s.kind === 'megposter' && !!s.data?.tall // v51：竖幅画布（L3 天使宗教画 512×640 竖版）
      const w = s.kind === 'photo' ? 0.62 : tall ? 0.66 : 0.92, h = s.kind === 'photo' ? 0.5 : tall ? 0.88 : 0.72
      const inner = new THREE.Group()
      grp.add(inner)
      if (s.kind === 'photo') {
        // v54：相框细化——木质/金属双色变体（瓦片哈希第二位流）+ 背板 + 玻璃微反光面
        const frameC = mulberry(s.x * 31 + s.y * 71)() < 0.5 ? '#6a4a2e' : '#8a8f94'
        inner.add(box(w + 0.02, h + 0.02, 0.02, '#2e2a24', 0, 1.3, 0)) // 背板
        inner.add(box(w + 0.09, 0.045, 0.032, frameC, 0, 1.3 + h / 2 + 0.022, 0.008)) // 框条（上下左右）
        inner.add(box(w + 0.09, 0.045, 0.032, frameC, 0, 1.3 - h / 2 - 0.022, 0.008))
        inner.add(box(0.045, h + 0.05, 0.032, frameC, -w / 2 - 0.022, 1.3, 0.008))
        inner.add(box(0.045, h + 0.05, 0.032, frameC, w / 2 + 0.022, 1.3, 0.008))
      } else {
        inner.add(box(w + 0.06, h + 0.06, 0.03, '#4a4038', 0, 1.3, 0)) // 背框
      }
      const panel = new THREE.Mesh(
        new THREE.PlaneGeometry(w, h),
        new THREE.MeshLambertMaterial({ map: levelTexture(tex, () => noiseTexture(fb, '#5a4e34')) }),
      )
      panel.position.set(0, 1.3, 0.021)
      inner.add(panel)
      if (s.kind === 'photo') {
        // 玻璃微反光面（半透明薄面片，写法同 graffiti 的 transparent Lambert）
        const glass = new THREE.Mesh(
          new THREE.PlaneGeometry(w + 0.04, h + 0.04),
          new THREE.MeshLambertMaterial({ color: '#cfe0e8', transparent: true, opacity: 0.16 }),
        )
        glass.position.set(0, 1.3, 0.027)
        inner.add(glass)
      }
      mountOnWall(inner, grp, s, m) // 强制贴最近墙（含虚空墙），不浮空
      break
    }
    case 'bigpainting': {
      // v53：大幅画作（L3 砖墙艺术品）——类似标语海报但贴图与尺寸均可自定义：
      // data.tex 画作贴图；data.pw/data.ph 画布宽/高（米）。白色画布状材质 + 细木框背板。
      // 放置合法性（墙面连续、宽度足够、不卡进墙）由生成器保证（infiniteL3 校验），建模层只负责贴墙渲染
      const tex = (s.data?.tex as string | undefined) ?? 'l3_art_angel.png'
      const pw = Math.min(3.2, Math.max(0.8, (s.data?.pw as number | undefined) ?? 1.8))
      const ph = Math.min(2.6, Math.max(0.8, (s.data?.ph as number | undefined) ?? 1.3))
      const pcy = Math.min(H - ph / 2 - 0.1, 0.9 + ph / 2) // 底边 ~0.9m，且不超出墙顶
      const inner = new THREE.Group()
      grp.add(inner)
      inner.add(box(pw + 0.07, ph + 0.07, 0.03, '#3a322a', 0, pcy, 0)) // 细木框背板
      const panel = new THREE.Mesh(
        new THREE.PlaneGeometry(pw, ph),
        new THREE.MeshLambertMaterial({ map: levelTexture(tex, () => noiseTexture('#c4bcac', '#a89c84')) }),
      )
      panel.position.set(0, pcy, 0.021)
      inner.add(panel)
      mountOnWall(inner, grp, s, m)
      break
    }
    case 'stainedglass': {
      if(_def.id===3){const model=buildL3Glass(Number(s.data?.pw??4.8),Number(s.data?.ph??3.8));grp.add(model);mountOnWall(model,grp,s,m);break}
      // v53b：彩色玻璃花窗（L3 圣所）——石框尖拱 + 彩玻贴图（data.tex/pw/ph 自定义，贴图宽高比 512:768）；
      // 玻璃轻微自发光模拟背光；放置跨度校验同大幅画作（infiniteL3）
      const tex = (s.data?.tex as string | undefined) ?? 'l3_glass_scales.png'
      const pw = Math.min(5.4, Math.max(0.7, (s.data?.pw as number | undefined) ?? 1.2))
      const ph = Math.min(4.1, Math.max(1.0, (s.data?.ph as number | undefined) ?? pw / 0.667))
      const sf = '#8a8578' // 风化白石框
      const y0 = _def.id===3 ? 1.4 : .55 // raised cathedral window sill
      const cy = y0 + ph / 2
      const inner = new THREE.Group()
      grp.add(inner)
      inner.add(box(pw + 0.24, 0.24, 0.24, sf, 0, y0 - 0.1, 0)) // 窗台
      inner.add(box(0.1, ph + 0.3, 0.24, sf, -(pw / 2 + 0.05), cy, 0)) // 侧框（左）
      inner.add(box(0.1, ph + 0.3, 0.24, sf, pw / 2 + 0.05, cy, 0)) // 侧框（右）
      inner.add(box(pw + 0.24, 0.12, 0.24, sf, 0, y0 + ph + 0.06, 0)) // 上梁
      inner.add(box(pw * 0.62, 0.12, 0.24, sf, 0, y0 + ph + 0.18, 0)) // 尖拱顶（收分）
      const pane = new THREE.Mesh(
        new THREE.PlaneGeometry(pw, ph),
        new THREE.MeshLambertMaterial({
          map: levelTexture(tex, () => noiseTexture('#3a4a44', '#242e2a')),
          emissiveMap: levelTexture(tex, () => noiseTexture('#3a4a44', '#242e2a')), emissive: new THREE.Color('#ffffff'), emissiveIntensity: 0.38, // 彩玻背光微亮
        }),
      )
      pane.position.set(0, cy, 0.021)
      inner.add(pane)
      mountOnWall(inner, grp, s, m)
      break
    }
    case 'ventgrate': {
      // 天花板通风口格栅（仅风口无管道）：边框 + 百叶，贴在天花板底面
      grp.add(box(0.56, 0.05, 0.56, '#6a6a70', 0, H - 0.03, 0))
      grp.add(box(0.46, 0.02, 0.46, '#2a2d30', 0, H - 0.055, 0))
      for (let i = 0; i < 4; i++) grp.add(box(0.42, 0.015, 0.05, '#8a8a8e', 0, H - 0.065, -0.15 + i * 0.1))
      break
    }
    // ===================== v36：商人之家商场风装饰 =====================
    case 'bench': {
      // 商场长椅：木座面 + 靠背 + 金属侧架
      const wood = '#9a7d55', frame = '#3f4448'
      grp.add(box(1.36, 0.07, 0.48, wood, 0, 0.44, 0)) // 座面
      grp.add(box(1.36, 0.46, 0.06, wood, 0, 0.78, -0.23)) // 靠背
      for (const lx of [-0.58, 0.58]) {
        grp.add(box(0.07, 0.44, 0.44, frame, lx, 0.22, 0)) // 侧架（座腿）
        grp.add(box(0.07, 0.52, 0.06, frame, lx, 0.72, -0.23)) // 靠背支柱
      }
      // v46：data.deg 指定朝向（缺省朝南 +z；休息室长椅面朝公共区，不再正面对着墙）
      if (s.data?.deg !== undefined) grp.rotation.y = ((Number(s.data.deg) || 0) * Math.PI) / 180
      break
    }
    case 'planter': {
      // 花坛（v55 优化：盆体收分上宽下窄 + 泥土层 + 多片交叉叶层次）
      grp.add(box(0.78, 0.34, 0.5, '#9a958c', 0, 0.17, 0)) // 盆体下段（窄）
      grp.add(box(1.02, 0.22, 0.6, '#a49f96', 0, 0.44, 0)) // 盆体上段（宽——收分）
      grp.add(box(1.08, 0.06, 0.64, '#8f8a82', 0, 0.56, 0)) // 盆沿
      grp.add(box(0.94, 0.05, 0.5, '#41321f', 0, 0.58, 0)) // 泥土层
      // 多片交叉叶（三层：外层低垂大叶 / 中层斜出 / 顶心生叶）
      const leaf = '#4e7a34', leafD = '#3e5a2a'
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2
        const l1 = box(0.06, 0.5, 0.22, leafD, Math.cos(a) * 0.3, 0.78, Math.sin(a) * 0.3)
        l1.rotation.set(Math.sin(a) * 0.7, 0, -Math.cos(a) * 0.7)
        grp.add(l1)
      }
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2 + 0.5
        const l2 = box(0.05, 0.42, 0.16, leaf, Math.cos(a) * 0.16, 0.92, Math.sin(a) * 0.16)
        l2.rotation.set(Math.sin(a) * 0.45, 0, -Math.cos(a) * 0.45)
        grp.add(l2)
      }
      grp.add(box(0.08, 0.5, 0.08, leaf, 0, 0.98, 0)) // 顶心生叶
      grp.add(box(0.16, 0.22, 0.16, '#5a8a40', 0, 1.2, 0)) // 顶芽
      break
    }
    case 'trashbin': {
      // 商场垃圾桶：金属圆筒 + 深色投口 + 底座圈
      grp.add(cyl(0.24, 0.21, 0.7, '#7d8489', 0, 0.37, 0, 12)) // 筒身
      grp.add(cyl(0.22, 0.22, 0.04, '#2c2f33', 0, 0.72, 0, 12)) // 投口
      grp.add(cyl(0.25, 0.25, 0.05, '#5a6165', 0, 0.045, 0, 12)) // 底座圈
      break
    }
    case 'sofa': {
      // v54：双人沙发（据点休息区）：底座 + 靠背 + 双扶手 + 双坐垫分块；data.color 实例配色
      const cc = typeof s.data?.color === 'string' ? (s.data.color as string) : '#5a76b8' // 缺省蓝
      // 实例配色变体（离线 three 桩无 getHexString——手动缩放 hex）
      const scale = (hex: string, k: number) => '#' + [1, 3, 5].map((i) => Math.min(255, Math.round(parseInt(hex.slice(i, i + 2), 16) * k)).toString(16).padStart(2, '0')).join('')
      const dark = scale(cc, 0.72), darker = scale(cc, 0.5)
      grp.add(box(1.56, 0.3, 0.78, darker, 0, 0.19, 0)) // 底框
      grp.add(box(1.56, 0.16, 0.72, cc, 0, 0.4, 0.02)) // 座体
      grp.add(box(1.56, 0.62, 0.2, cc, 0, 0.72, -0.31)) // 靠背
      grp.add(box(1.5, 0.1, 0.16, dark, 0, 1.05, -0.31)) // 靠背顶垫
      for (const sx of [-0.72, 0.72]) {
        grp.add(box(0.16, 0.62, 0.78, cc, sx, 0.55, 0)) // 扶手
        grp.add(box(0.18, 0.08, 0.8, dark, sx, 0.9, 0)) // 扶手顶
      }
      for (const sx of [-0.37, 0.37]) {
        grp.add(box(0.7, 0.12, 0.62, dark, sx, 0.52, 0.04)) // 坐垫（分块）
        grp.add(box(0.7, 0.34, 0.1, dark, sx, 0.72, -0.24)) // 靠垫
      }
      for (const [fx, fz] of [[-0.68, 0.32], [0.68, 0.32], [-0.68, -0.32], [0.68, -0.32]] as const)
        grp.add(cyl(0.025, 0.035, 0.1, '#3a3f46', fx, 0.05, fz, 6)) // 短脚
      // 朝向约定同柜类（v48）：data.deg 显式覆盖；缺省背贴最近墙、正面（+Z）朝房间内部
      if (s.data?.deg !== undefined) grp.rotation.y = ((Number(s.data.deg) || 0) * Math.PI) / 180
      else flushToWall(grp, s, m, 0.78)
      break
    }
    case 'servercase': {
      // v54：塔式服务器机箱（机房沿墙成排）：立式黑钢箱体 + 前面板指示灯点阵 + 顶部散热栅
      grp.add(box(0.55, 1.7, 0.6, '#23262b', 0, 0.85, 0)) // 箱体
      grp.add(box(0.5, 1.6, 0.03, '#17191d', 0, 0.85, 0.3)) // 前面板（深色网孔）
      for (let i = 0; i < 6; i++) // 指示灯点阵（绿/琥珀交替，一列状态灯 + 两列小点）
        grp.add(glow(0.05, 0.03, 0.02, i % 3 === 2 ? '#e8a83a' : '#6fae5a', 0.18, 0.5 + i * 0.2, 0.32))
      for (let i = 0; i < 4; i++)
        grp.add(glow(0.025, 0.025, 0.02, '#6fae5a', -0.16 + (i % 2) * 0.08, 0.62 + Math.floor(i / 2) * 0.5, 0.32))
      for (let i = 0; i < 5; i++) // 顶部散热栅
        grp.add(box(0.44, 0.02, 0.06, '#3a3f46', 0, 1.72, -0.2 + i * 0.1))
      grp.add(box(0.58, 0.06, 0.64, '#2e3238', 0, 0.03, 0)) // 底座
      // 朝向约定同柜类（v48）：data.deg 显式覆盖；缺省背贴最近墙、正面朝室内（贴墙位移）
      if (s.data?.deg !== undefined) grp.rotation.y = ((Number(s.data.deg) || 0) * Math.PI) / 180
      else flushToWall(grp, s, m, 0.6)
      break
    }
    case 'walltv': {
      // v54：挂式平板电视（休息/娱乐区墙面）：黑框 + 微亮淡蓝灰屏幕（强制贴最近墙，不浮空）
      const inner = new THREE.Group()
      grp.add(inner)
      inner.add(box(1.04, 0.62, 0.05, '#17191d', 0, 1.55, 0)) // 黑框背板
      inner.add(box(0.96, 0.54, 0.02, '#0c0e12', 0, 1.55, 0.02)) // 屏幕底色（关机黑）
      const scr = new THREE.Mesh(
        new THREE.PlaneGeometry(0.9, 0.48),
        new THREE.MeshBasicMaterial({ color: '#93a8bc' }), // 微亮屏幕（淡蓝灰）
      )
      scr.position.set(0, 1.55, 0.036)
      inner.add(scr)
      inner.add(box(0.2, 0.04, 0.03, '#2e3238', 0, 1.22, 0)) // 下方挂架
      // v54c：data.deg 显式朝向（上层贴面等——mountOnWall 只认主层墙格，2F 隔间南墙贴不上时用它）；
      // 机体贴朝向反侧瓦片缘（正面 +Z=屏面朝向）
      if (s.data?.deg !== undefined) {
        grp.rotation.y = ((Number(s.data.deg) || 0) * Math.PI) / 180
        inner.position.z = -0.46
      } else mountOnWall(inner, grp, s, m)
      break
    }
    case 'tvset': {
      // v54：立式大电视（电视娱乐室隔断间）：深色机身 + 底座支脚 + 微亮屏（区别于挂墙 walltv）；
      // 正面=局部 +Z（屏面朝向）；data.deg 显式朝向，缺省背贴最近墙正面朝室内
      grp.add(box(0.5, 0.06, 0.34, '#23262b', 0, 0.03, 0)) // 底座板
      for (const fx of [-0.18, 0.18]) grp.add(cyl(0.02, 0.03, 0.16, '#3a3f46', fx, 0.11, 0, 6)) // 支脚 ×2
      grp.add(box(0.1, 0.2, 0.08, '#23262b', 0, 0.22, 0)) // 中柱
      grp.add(box(1.06, 0.68, 0.07, '#17191d', 0, 0.62, 0)) // 机身（黑框）
      grp.add(box(0.98, 0.6, 0.02, '#0c0e12', 0, 0.62, 0.045)) // 屏幕底色
      const scr = new THREE.Mesh(
        new THREE.PlaneGeometry(0.92, 0.54),
        new THREE.MeshBasicMaterial({ color: '#9ab0c4' }), // 微亮屏（淡蓝灰，比挂墙款略亮——娱乐室氛围）
      )
      scr.position.set(0, 0.62, 0.058)
      grp.add(scr)
      grp.add(glow(0.06, 0.02, 0.02, '#6fae5a', 0.42, 0.3, 0.041)) // 电源指示灯
      if (s.data?.deg !== undefined) grp.rotation.y = ((Number(s.data.deg) || 0) * Math.PI) / 180
      else flushToWall(grp, s, m, 0.6)
      break
    }
    case 'loungechair': {
      // v54：弧形塑料休闲椅（参考图一体成型弧面 + 四条细腿；data.color 实例配色，缺省暖白；非实心）
      const cc = (s.data?.color as string | undefined) ?? '#d8d2c4'
      const legC = '#3a3e44'
      for (const [fx, fz] of [[-0.19, 0.17], [0.19, 0.17], [-0.19, -0.17], [0.19, -0.17]] as const)
        grp.add(cyl(0.014, 0.02, 0.3, legC, fx, 0.15, fz, 6)) // 细腿 ×4
      grp.add(box(0.44, 0.05, 0.4, cc, 0, 0.33, 0)) // 座面（弧面底部）
      const scoop = box(0.44, 0.1, 0.34, cc, 0, 0.4, -0.03) // 弧面中段（前翘）
      scoop.rotation.x = -0.28
      grp.add(scoop)
      const back = box(0.44, 0.34, 0.06, cc, 0, 0.56, -0.2) // 弧面靠背（顺势后仰）
      back.rotation.x = -0.35
      grp.add(back)
      const lip = box(0.44, 0.05, 0.12, cc, 0, 0.72, -0.26) // 顶缘卷边
      lip.rotation.x = -0.5
      grp.add(lip)
      break
    }
    case 'wallwindow': {
      // v54：墙体窗（代替整格内隔墙，整格 solid 不可通行——两房间互相可见）：
      // 下段约 1/3 与墙同材质（整格厚，与两侧墙盒齐平）+ 中段大面积透明玻璃（细框）+ 上段墙体接顶。
      // 生成器按 machinewall 代墙模式：墙瓦片雕成地板 + 本实心结构补位；
      // data.topH=墙顶高（缺省层高 H）；默认墙面沿 z（面朝 ±x），data.deg=90 转为沿 x
      const topH = Math.max(2.2, Number(s.data?.topH ?? H))
      // v54b/c：墙段/收边/踢脚线一律走 wallMatchBox（默认盒 UV + 顶点色×墙贴图，与主墙循环完全一致——
      // 修复 wallpaperBox 的 UV 放大导致的贴图密度差与无贴图踢脚线的色差）；窗框全部收进瓦片内（齐平或略凹）
      const deg90 = Math.round((Number(s.data?.deg) || 0) / 90) % 2 !== 0
      const wtx = Math.floor(s.x + s.w / 2), wty = Math.floor(s.y + s.h / 2)
      const sideIsWall = (sgn: number) => {
        const nx = wtx + (deg90 ? sgn : 0), ny = wty + (deg90 ? 0 : sgn)
        return nx < 0 || ny < 0 || nx >= m.w || ny >= m.h || m.tiles[ny * m.w + nx] !== 1
      }
      // v54c 收边重做：无墙侧窗体让出 0.1 格，收边薄墙板补齐到瓦片缘——与墙面齐平共面、不凸出不穿插；
      // 窗框/玻璃/窗棂随窗体缩短，黑框边条端头埋进收边板内侧（不外露）
      const wW = sideIsWall(-1), eW = sideIsWall(1)
      const z0 = wW ? -0.5 : -0.4, z1 = eW ? 0.5 : 0.4
      const zL = z1 - z0, zC = (z0 + z1) / 2
      grp.add(wallMatchBox(1.0, 0.95, zL, _def, 1, 0, 0.475, zC)) // 下段墙体（0..0.95）
      grp.add(wallMatchBox(1.0, Math.max(0.05, topH - 2.1), zL, _def, 1, 0, 2.1 + Math.max(0.05, topH - 2.1) / 2, zC)) // 上段接顶
      const pane = new THREE.Mesh(
        new THREE.PlaneGeometry(zL - 0.06, 1.05),
        new THREE.MeshLambertMaterial({ color: '#5f82a2', transparent: true, opacity: 0.6, side: THREE.DoubleSide }), // 半透蓝灰——亮室对亮室也读得出玻璃
      )
      pane.rotation.y = Math.PI / 2 // 默认墙面沿 z（面朝 ±x）
      pane.position.set(0, 1.575, zC)
      grp.add(pane)
      for (const my of [1.31, 1.575, 1.84]) grp.add(box(0.04, 0.05, zL - 0.1, '#2e3238', 0, my, zC)) // 横向窗棂（正视读得出分格）
      grp.add(box(0.12, 0.1, zL - 0.06, '#1c1e22', 0, 1.0, zC)) // 下槛（两端埋进邻墙/收边板，不外露）
      grp.add(box(0.12, 0.1, zL - 0.06, '#1c1e22', 0, 2.15, zC)) // 上槛
      grp.add(box(0.12, 1.05, 0.09, '#1c1e22', 0, 1.575, zC)) // 中梃
      // v54：侧框只咬进邻墙一侧；邻格非墙（窗端悬空）时改用一小段薄墙板收边
      for (const [sgn, ez] of [[-1, -0.46], [1, 0.46]] as const) {
        if (sideIsWall(sgn)) grp.add(box(0.13, 1.05, 0.11, '#1c1e22', 0, 1.575, ez)) // 侧框（咬进邻墙）
        else grp.add(wallMatchBox(1.0, topH, 0.1, _def, 1, 0, topH / 2, sgn * 0.45)) // 无墙侧：薄墙板收边（与墙面齐平共面）
      }
      // v54：踢脚线继承（白名单同 geometry.ts 主层：L0 与据点多层）——窗体下段两面贴墙根饰条
      if (_def.id === 0 || (_def.id >= 101 && _def.id <= 106)) {
        const skirtK = _def.id === 0 ? 0.62 : 0.45
        for (const fx of [-0.5, 0.5]) grp.add(wallMatchBox(0.05, 0.16, zL, _def, skirtK, fx, 0.08, zC)) // 踢脚线（同主层墙规格：0.05 厚 0.16 高、墙色×0.45、贴图同主墙）
      }
      if (s.data?.deg !== undefined) grp.rotation.y = ((Number(s.data.deg) || 0) * Math.PI) / 180
      break
    }
    case 'shopsign': {
      // 悬挂店招（商人之家市场街/大厅）：吊杆 + 贴图招牌板 + 顶部描边灯
      const tex = (s.data?.tex as string | undefined) ?? 'bntg_poster.png'
      grp.add(box(0.04, 0.3, 0.04, '#3a3a3e', -0.3, H - 0.15, 0)) // 吊杆（左）
      grp.add(box(0.04, 0.3, 0.04, '#3a3a3e', 0.3, H - 0.15, 0)) // 吊杆（右）
      grp.add(box(0.84, 0.34, 0.05, '#2a2d30', 0, H - 0.48, 0)) // 招牌背板
      const panel = new THREE.Mesh(
        new THREE.PlaneGeometry(0.78, 0.28),
        new THREE.MeshLambertMaterial({ map: levelTexture(tex, () => noiseTexture('#2e3a32', '#e8e8e0')) }),
      )
      panel.position.set(0, H - 0.48, 0.031)
      grp.add(panel)
      grp.add(glow(0.86, 0.03, 0.03, '#7ac97a', 0, H - 0.29, 0)) // 顶部描边灯
      faceOutward(grp, s, m)
      break
    }

    // ===================== v37：希波克拉底 - 1（阿丽亚娜集团据点）医疗家具 =====================
    case 'hospitalbed': {
      // 病床：金属框 + 白床垫 + 枕头 + 床头摇起（沿本地 z 纵放）
      // v38：毯子按坐标奇偶在 浅蓝/薄荷/薰衣草 三色间轮换（枕头保持白，实例级变色）
      const metal = '#c8ccd2', mat = '#f2f2f4'
      const blanket = ['#9ab8d8', '#a8d8c0', '#c8bce8'][(((s.x + s.y) % 3) + 3) % 3]
      const hw = s.w / 2 - 0.07, hl = s.h / 2 - 0.08
      for (const px of [-hw, hw]) for (const pz of [-hl, hl]) grp.add(box(0.06, 0.5, 0.06, metal, px, 0.25, pz)) // 床腿
      grp.add(box(s.w - 0.06, 0.08, s.h - 0.12, metal, 0, 0.48, 0)) // 床框
      grp.add(box(s.w - 0.16, 0.12, s.h * 0.58, mat, 0, 0.58, s.h * 0.17)) // 床垫平段（床尾侧）
      grp.add(box(s.w - 0.14, 0.02, s.h * 0.6, '#fafaf8', 0, 0.648, s.h * 0.16)) // v54：床单分层（白，毯子下、头端露出）
      for (const px of [-(s.w / 2 - 0.09), s.w / 2 - 0.09]) grp.add(box(0.02, 0.09, s.h * 0.52, '#eaeaec', px, 0.6, s.h * 0.16)) // v54：床单垂边
      grp.add(box(s.w - 0.18, 0.05, s.h * 0.46, blanket, 0, 0.665, s.h * 0.22)) // 毯子（三色轮换）
      const head = box(s.w - 0.16, 0.1, s.h * 0.36, mat, 0, 0.7, -s.h * 0.24) // 床头摇起段
      head.rotation.x = -0.44
      grp.add(head)
      const pillow = box(s.w - 0.4, 0.08, 0.24, '#fafaf8', 0, 0.84, -s.h * 0.33) // 枕头（贴在摇起段上）
      pillow.rotation.x = -0.44
      grp.add(pillow)
      grp.add(box(s.w - 0.06, 0.52, 0.05, metal, 0, 0.6, -hl)) // 床头板
      grp.add(box(s.w - 0.06, 0.34, 0.05, metal, 0, 0.52, hl)) // 床尾板
      grp.add(box(0.04, 0.16, s.h * 0.4, metal, -hw, 0.72, s.h * 0.12)) // 侧护栏（左）
      grp.add(box(0.04, 0.16, s.h * 0.4, metal, hw, 0.72, s.h * 0.12)) // 侧护栏（右）
      for (const px of [-hw, hw]) for (const pz of [-hl, hl]) { // v54：床脚轮（轮叉 + 小轮）
        grp.add(box(0.05, 0.07, 0.03, '#8a8f96', px, 0.075, pz)) // 轮叉
        grp.add(cyl(0.045, 0.045, 0.03, '#3a3d42', px, 0.045, pz, 8).rotateZ(Math.PI / 2)) // 小轮
      }
      // v55（任务8）：床头靠墙朝向（同 bed 约定：data.deg=床头朝向，模型床头在局部 -z）
      if (s.data?.deg !== undefined) grp.rotation.y = (((Number(s.data.deg) || 0) + 180) * Math.PI) / 180
      break
    }
    case 'ivstand': {
      // 输液架：金属立杆 + 四爪底座 + 挂钩横杆 + 半透明输液袋
      const metal = '#b8bcc4'
      for (let i = 0; i < 4; i++) { // 四爪底座
        const a = (i * Math.PI) / 2 + Math.PI / 4
        const leg = box(0.26, 0.03, 0.04, metal, Math.cos(a) * 0.13, 0.05, Math.sin(a) * 0.13)
        leg.rotation.y = -a
        grp.add(leg)
      }
      grp.add(cyl(0.018, 0.024, 1.7, metal, 0, 0.85, 0, 8)) // 立杆
      grp.add(box(0.34, 0.02, 0.02, metal, 0, 1.68, 0)) // 挂钩横杆
      const bag = new THREE.Mesh(
        new THREE.BoxGeometry(0.1, 0.2, 0.06),
        // v38：输液袋液体按坐标奇偶在 透明/淡黄/淡粉 间轮换
        new THREE.MeshLambertMaterial({ color: ['#e8f0e2', '#f0e8c0', '#f0d4dc'][(((s.x + s.y) % 3) + 3) % 3], transparent: true, opacity: 0.72 }),
      )
      bag.position.set(-0.12, 1.52, 0)
      grp.add(bag) // 输液袋（半透明）
      grp.add(cyl(0.006, 0.006, 0.52, '#d8dcd8', -0.12, 1.14, 0, 4)) // 输液管垂下
      break
    }
    case 'medcabinet': {
      // 药品柜：薄荷白柜 + 玻璃门（透出药瓶）+ 紫色十字（阿丽亚娜主题色，呼应红十字）
      // v38：柜体薄荷白 + 柜门把手/边框深色（紫十字保留），不再清一色纯白
      grp.add(box(0.72, 1.5, 0.34, '#e2efe6', 0, 0.75, 0)) // 柜体（薄荷白）
      grp.add(box(0.64, 0.56, 0.03, '#d5e2da', 0, 0.3, 0.165)) // 下部实门
      grp.add(box(0.74, 0.04, 0.36, '#5a6068', 0, 1.52, 0)) // 顶部深色边框
      grp.add(box(0.74, 0.04, 0.36, '#5a6068', 0, 0.02, 0)) // 底部深色踢脚
      for (let i = 0; i < 3; i++) grp.add(cyl(0.032, 0.032, 0.13, ['#c96a4a', '#4a8ac9', '#7ac97a'][i], -0.18 + i * 0.18, 1.0, 0.1, 6)) // 玻璃后的药瓶
      grp.add(box(0.56, 0.03, 0.26, '#c2cdc6', 0, 1.18, 0.02)) // 玻璃层板
      const glass = new THREE.Mesh(
        new THREE.BoxGeometry(0.62, 0.68, 0.02),
        new THREE.MeshLambertMaterial({ color: '#cfe0e8', transparent: true, opacity: 0.38 }),
      )
      glass.position.set(0, 1.02, 0.17)
      grp.add(glass) // 玻璃门
      grp.add(box(0.03, 0.12, 0.03, '#4a4e54', 0.26, 1.02, 0.185)) // 柜门把手（深色）
      grp.add(box(0.2, 0.06, 0.02, '#8676e2', 0, 1.42, 0.175)) // 紫十字（横）
      grp.add(box(0.06, 0.2, 0.02, '#8676e2', 0, 1.42, 0.175)) // 紫十字（竖）
      faceOutward(grp, s, m) // 柜门背墙朝外
      break
    }
    case 'labbench': {
      // 实验台：石板灰台案（v38：不再纯白）+ 显微镜 + 试管组（彩色液体）+ 烧杯
      const hw = s.w / 2 - 0.07
      for (const px of [-hw, hw]) grp.add(box(0.08, 0.82, 0.6, '#d8dce2', px, 0.41, 0)) // 台腿
      grp.add(box(s.w, 0.07, 0.72, '#6a7278', 0, 0.86, 0)) // 台面（石板灰）
      grp.add(box(s.w, 0.04, 0.72, '#5a6167', 0, 0.9, 0)) // 防腐蚀垫层
      // 显微镜（左）
      const mx = -s.w / 2 + 0.3
      grp.add(box(0.16, 0.03, 0.16, '#3a3e45', mx, 0.94, 0)) // 底座
      grp.add(box(0.05, 0.22, 0.05, '#3a3e45', mx - 0.05, 1.05, -0.04)) // 支架
      const tube = cyl(0.035, 0.035, 0.18, '#2a2d33', mx, 1.14, 0.02, 8) // 镜筒（微倾）
      tube.rotation.x = 0.5
      grp.add(tube)
      grp.add(box(0.1, 0.02, 0.1, '#5a5f66', mx, 1.0, 0.04)) // 载物台
      // 试管组（中）：木架 + 5 支彩色液体试管
      grp.add(box(0.3, 0.04, 0.08, '#9a7d55', 0.05, 0.95, 0.16))
      for (let i = 0; i < 5; i++) {
        grp.add(cyl(0.016, 0.016, 0.12, '#e8ecf0', -0.05 + i * 0.05, 1.03, 0.16, 6)) // 玻璃管
        grp.add(cyl(0.013, 0.013, 0.05, ['#c96a4a', '#7ac97a', '#4a8ac9', '#8676e2', '#e8b93c'][i], -0.05 + i * 0.05, 1.0, 0.16, 6)) // 液体
      }
      // 烧杯（右）
      grp.add(cyl(0.05, 0.045, 0.12, '#e8ecf0', s.w / 2 - 0.32, 0.98, -0.12, 10))
      grp.add(cyl(0.043, 0.043, 0.06, '#9fd0c8', s.w / 2 - 0.32, 0.96, -0.12, 10)) // 淡绿液体
      break
    }
    case 'specimentank': {
      // 标本罐：玻璃圆筒 + 淡紫/淡绿/淡琥珀液体（半透明自发光）+ 内部悬浮样本块 + 金属底座/顶盖
      // v38：按坐标奇偶三色轮换（确定性）
      const liquidC = ['#a894e8', '#8fd0a0', '#e0c078'][(((s.x + s.y) % 3) + 3) % 3]
      grp.add(cyl(0.3, 0.32, 0.1, '#6a6e75', 0, 0.05, 0, 14)) // 底座
      grp.add(cyl(0.3, 0.3, 0.06, '#8a8e94', 0, 1.62, 0, 14)) // 顶盖
      const liquid = new THREE.Mesh(
        new THREE.CylinderGeometry(0.26, 0.26, 1.44, 14),
        new THREE.MeshBasicMaterial({ color: liquidC, transparent: true, opacity: 0.5 }),
      )
      liquid.position.set(0, 0.86, 0)
      grp.add(liquid) // 液体（自发光恒定发亮）
      grp.add(box(0.16, 0.2, 0.12, '#7a5a68', 0.04, 0.9, 0.02)) // 样本块（悬浮）
      grp.add(box(0.08, 0.1, 0.08, '#6a4a58', -0.06, 0.68, -0.04)) // 小样本块
      grp.add(cyl(0.008, 0.008, 0.3, '#c8b8e0', 0, 1.32, 0, 4)) // 悬丝
      const glass = new THREE.Mesh(
        new THREE.CylinderGeometry(0.28, 0.28, 1.5, 14),
        new THREE.MeshLambertMaterial({ color: '#d8e8f0', transparent: true, opacity: 0.22 }),
      )
      glass.position.set(0, 0.88, 0)
      grp.add(glass) // 玻璃外罩
      grp.add(box(0.16, 0.1, 0.02, '#f0f0ea', 0, 0.34, 0.3)) // 标签
      break
    }

    // ===================== v38：Tom 的餐馆（独立餐馆据点）家具 =====================
    case 'stove': {
      // 灶台：不锈钢灶体 + 四炉眼 + 一锅热汤 + 防油背板（背板贴墙，faceOutward 背墙朝外）
      grp.add(box(0.8, 0.86, 0.6, '#9a9ea4', 0, 0.43, 0)) // 灶体
      grp.add(box(0.82, 0.05, 0.62, '#33363b', 0, 0.885, 0)) // 灶面
      for (const [bx, bz] of [[-0.2, -0.14], [0.2, -0.14], [-0.2, 0.16], [0.2, 0.16]] as const)
        grp.add(cyl(0.09, 0.09, 0.015, '#14161a', bx, 0.915, bz, 10)) // 炉眼
      grp.add(cyl(0.13, 0.11, 0.12, '#c8ccd2', -0.2, 0.99, -0.14, 12)) // 锅
      grp.add(cyl(0.115, 0.115, 0.02, '#d98a4a', -0.2, 1.05, -0.14, 12)) // 锅里热汤
      for (let i = 0; i < 3; i++) grp.add(cyl(0.02, 0.02, 0.02, '#2a2d33', -0.2 + i * 0.2, 0.68, 0.31, 6).rotateX(Math.PI / 2)) // 旋钮
      grp.add(box(0.8, 0.5, 0.05, '#8a8e94', 0, 1.16, -0.29)) // 防油背板
      faceOutward(grp, s, m)
      break
    }
    case 'kcounter': {
      // 厨房料理台：暖木橱柜 + 浅色台面 + 柜门缝 + 挂杆厨具 + 刀架磁条 + 砧板
      const hw = s.w / 2 - 0.06
      grp.add(box(s.w - 0.04, 0.78, 0.6, '#8a6a48', 0, 0.39, 0)) // 柜体
      grp.add(box(s.w + 0.02, 0.05, 0.64, '#e8e4da', 0, 0.83, 0)) // 台面
      for (let dx = -hw + 0.3; dx <= hw - 0.2; dx += 0.5) grp.add(box(0.02, 0.6, 0.02, '#5a4630', dx, 0.42, 0.31)) // 柜门缝
      grp.add(box(0.3, 0.02, 0.22, '#c9a875', -hw + 0.35, 0.865, 0.08)) // 砧板
      grp.add(box(0.16, 0.03, 0.1, '#d95a3a', hw - 0.3, 0.875, 0.1)) // 番茄一堆
      // 墙面挂杆 + 挂勺/铲（-z 侧）
      const rail = cyl(0.012, 0.012, Math.min(s.w - 0.3, 1.4), '#7d8489', 0, 1.35, -0.24, 6)
      rail.rotation.z = Math.PI / 2
      grp.add(rail)
      for (let i = 0; i < 3; i++) {
        grp.add(box(0.015, 0.2, 0.015, '#c8ccd2', -0.35 + i * 0.28, 1.23, -0.24)) // 柄
        grp.add(box(0.07, 0.09, 0.02, '#c8ccd2', -0.35 + i * 0.28, 1.09, -0.24)) // 勺/铲头
      }
      grp.add(box(0.4, 0.05, 0.02, '#4a4e54', hw - 0.4, 1.3, -0.26)) // 刀架磁条
      grp.add(box(0.03, 0.14, 0.012, '#d8dce2', hw - 0.45, 1.2, -0.26)) // 刀 1
      grp.add(box(0.03, 0.11, 0.012, '#d8dce2', hw - 0.33, 1.22, -0.26)) // 刀 2
      faceOutward(grp, s, m)
      break
    }
    case 'sink': {
      // 水槽：橱柜 + 不锈钢双槽台面 + 水龙头
      grp.add(box(0.8, 0.78, 0.6, '#8a6a48', 0, 0.39, 0)) // 柜体
      grp.add(box(0.84, 0.06, 0.64, '#c8ccd2', 0, 0.83, 0)) // 不锈钢台面
      for (const sx of [-0.2, 0.2]) grp.add(box(0.32, 0.03, 0.42, '#7d8489', sx, 0.845, 0.02)) // 双槽（凹陷深色）
      grp.add(cyl(0.025, 0.03, 0.3, '#d8dce2', 0, 1.0, -0.22, 8)) // 龙头立管
      grp.add(box(0.03, 0.03, 0.22, '#d8dce2', 0, 1.14, -0.12)) // 龙头弯臂
      grp.add(cyl(0.018, 0.018, 0.07, '#d8dce2', 0, 1.11, -0.01, 6)) // 出水口
      grp.add(box(0.05, 0.03, 0.05, '#d9c96a', 0.3, 0.875, -0.2)) // 海绵
      faceOutward(grp, s, m)
      break
    }
    case 'freezer': {
      // 卧式冷冻柜：白柜 + 顶盖双缝 + 温控面板（运行灯）+ 散热格栅（非容器）
      grp.add(box(1.1, 0.8, 0.62, '#eef0f2', 0, 0.42, 0)) // 柜体
      grp.add(box(1.12, 0.06, 0.64, '#f7f8fa', 0, 0.85, 0)) // 顶盖
      grp.add(box(0.015, 0.015, 0.62, '#c9ced4', 0, 0.885, 0)) // 顶盖中缝
      grp.add(box(0.2, 0.1, 0.02, '#3a3e45', -0.34, 0.6, 0.315)) // 温控面板
      grp.add(glow(0.03, 0.03, 0.012, '#7ac97a', -0.34, 0.6, 0.33)) // 运行灯
      for (let i = 0; i < 4; i++) grp.add(box(0.24, 0.015, 0.02, '#b8bec6', 0.3, 0.3 + i * 0.08, 0.325)) // 散热格栅
      faceOutward(grp, s, m)
      break
    }
    case 'dtable': {
      // 餐桌：白桌布圆桌 + 两副餐盘餐具 + 水杯 + 小烛台（烛火自发光）+ 对侧两把餐椅（餐椅随桌成型，凸出邻格仅视觉）
      grp.add(cyl(0.3, 0.34, 0.06, '#5a4630', 0, 0.03, 0, 10)) // 桌脚底座
      grp.add(cyl(0.06, 0.08, 0.68, '#6a5334', 0, 0.37, 0, 8)) // 桌脚
      grp.add(cyl(0.52, 0.58, 0.14, '#f2eee2', 0, 0.72, 0, 16)) // 桌布垂边
      grp.add(cyl(0.5, 0.5, 0.03, '#faf6ea', 0, 0.8, 0, 16)) // 桌面
      for (const [px, pz] of [[-0.2, 0.12], [0.2, -0.12]] as const) {
        grp.add(cyl(0.09, 0.09, 0.015, '#e8ecf0', px, 0.825, pz, 10)) // 餐盘
        grp.add(box(0.02, 0.01, 0.12, '#c8ccd2', px + 0.13, 0.825, pz)) // 餐具
      }
      grp.add(cyl(0.035, 0.03, 0.09, '#9fc0d8', 0.05, 0.86, 0.2, 8)) // 水杯
      grp.add(cyl(0.02, 0.03, 0.1, '#b89858', -0.05, 0.86, -0.2, 8)) // 小烛台
      grp.add(glow(0.03, 0.045, 0.03, '#ffd890', -0.05, 0.945, -0.2)) // 烛火
      for (const cz of [-0.78, 0.78]) { // 两把餐椅（对侧）
        grp.add(box(0.4, 0.05, 0.4, '#7a5a34', 0, 0.44, cz)) // 椅面
        grp.add(box(0.4, 0.5, 0.05, '#7a5a34', 0, 0.72, cz + (cz > 0 ? 0.18 : -0.18))) // 靠背
        for (const lx of [-0.16, 0.16]) for (const lz of [-0.16, 0.16])
          grp.add(box(0.04, 0.44, 0.04, '#5a4630', lx, 0.22, cz + lz)) // 椅腿
      }
      break
    }

    // ===================== v45：Level 274「杰瑞的房间」（教堂风穹顶 + 杰瑞栖木） =====================
    case 'domering': {
      // 教堂穹顶（置于大厅中央，非实心纯装饰）：同心环形肋 + 放射拱肋 + 顶心圣辉盘
      // data.r=穹顶半径（米） data.apex=顶高（米）；拱肋自基环（r, 3.2m）收拢至顶心
      const R = (s.data?.r as number | undefined) ?? 12
      const apex = (s.data?.apex as number | undefined) ?? 5.1
      const rib = '#e8ecf8', ribDark = '#b8c0e0', gold = '#d4af37'
      // 同心环形肋（三环，越高越收）
      for (const [ry, rr] of [[0.55, 0.88], [0.78, 0.62], [0.92, 0.34]] as const) {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(R * rr, 0.09, 6, 40), new THREE.MeshLambertMaterial({ color: rib }))
        ring.rotation.x = Math.PI / 2
        ring.position.set(0, apex * ry, 0)
        grp.add(ring)
      }
      // 放射拱肋（8 根：基环 → 顶心的四分之一圆弧，小段盒体拼弧）
      const y0 = 3.2
      for (let ri = 0; ri < 8; ri++) {
        const a = (ri / 8) * Math.PI * 2
        for (let ti = 0; ti <= 6; ti++) {
          const th = (ti / 6) * (Math.PI / 2) * 0.96
          const rad = R * Math.cos(th)
          const y = y0 + Math.sin(th) * (apex - y0)
          grp.add(box(0.22, 0.22, 0.22, ti % 2 ? rib : ribDark, Math.cos(a) * rad, y, Math.sin(a) * rad))
        }
      }
      // 顶心圣辉盘（自发光圆盘 + 光晕球：蓝白圣辉自穹顶洒落）
      const halo = new THREE.Mesh(new THREE.SphereGeometry(0.5, 12, 8), new THREE.MeshBasicMaterial({ color: '#fdf8e2' }))
      halo.position.set(0, apex + 0.05, 0)
      grp.add(halo)
      const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.1, 0.08, 20), new THREE.MeshLambertMaterial({ color: gold }))
      disc.position.set(0, apex - 0.15, 0)
      grp.add(disc)
      break
    }
    case 'perch': {
      // 杰瑞的栖木：石座 + 木立柱 + 顶部横杆（鹉主 Entity 7 栖息于横杆上）+ 金饰环 + 供品小碟
      grp.add(cyl(0.3, 0.36, 0.14, '#c8ccd8', 0, 0.07, 0, 12)) // 石座
      grp.add(cyl(0.06, 0.09, 0.44, '#6a4e34', 0, 0.36, 0, 8)) // 木立柱
      const bar = cyl(0.035, 0.035, 0.72, '#7a5a3a', 0, 0.55, 0, 8) // 顶部横杆
      bar.rotation.z = Math.PI / 2
      grp.add(bar)
      grp.add(cyl(0.1, 0.1, 0.03, '#d4af37', 0, 0.5, 0, 10)) // 金饰环
      grp.add(cyl(0.07, 0.05, 0.035, '#d8b060', 0.22, 0.16, 0.1, 8)) // 供品小碟（杏仁水色）
      break
    }

    // ===================== v47：Level 274 教堂细化（讲坛/烛台/圣水盆） =====================
    case 'pulpit': {
      // 讲坛：石阶高台 + 斜面讲案 + 金饰鹉徽（教堂布道位；data.deg 朝向，缺省朝南 +z）
      grp.add(box(1.0, 0.18, 1.0, '#c8ccd8', 0, 0.09, 0)) // 基座平台
      grp.add(box(0.8, 0.16, 0.8, '#d4d8e4', 0, 0.26, -0.06)) // 上台面
      grp.add(box(0.62, 0.72, 0.5, '#8a90b8', 0, 0.7, -0.1)) // 台身（蓝白石材）
      const desk = box(0.62, 0.07, 0.44, '#6a4e34', 0, 1.12, -0.06) // 斜面讲案（木）
      desk.rotation.x = -0.28
      grp.add(desk)
      grp.add(box(0.62, 0.05, 0.06, '#6a4e34', 0, 1.05, 0.16)) // 案前挡条
      grp.add(box(0.16, 0.2, 0.02, '#d4af37', 0, 0.72, 0.16)) // 正面金饰鹉徽
      grp.add(box(0.1, 0.1, 0.021, '#4142a5', 0, 0.72, 0.165)) // 徽上蓝羽
      if (s.data?.deg !== undefined) grp.rotation.y = ((Number(s.data.deg) || 0) * Math.PI) / 180
      break
    }
    case 'candlestand': {
      // 烛台：细杆三臂烛架 + 自发光烛火（非实心；教堂烛火常明）
      grp.add(cyl(0.09, 0.12, 0.04, '#3a352e', 0, 0.02, 0, 10)) // 底座
      grp.add(cyl(0.016, 0.02, 1.06, '#4a4442', 0, 0.55, 0, 6)) // 主杆
      for (const [ax, az] of [[-0.14, 0], [0.14, 0], [0, 0.14]] as const) {
        grp.add(box(0.2, 0.02, 0.02, '#4a4442', ax / 2, 1.02, az / 2).rotateY(Math.atan2(az, ax || 1e-6))) // 横臂
        grp.add(cyl(0.024, 0.02, 0.1, '#e8e0c8', ax, 1.1, az, 6)) // 烛身
        grp.add(glow(0.02, 0.05, 0.02, '#ffd9a0', ax, 1.18, az)) // 烛火
      }
      break
    }
    case 'holyfont': {
      // 圣水盆：石盆 + 蓝色圣水微光（信众以蓝为圣色——入门前以圣水净手）
      grp.add(cyl(0.14, 0.2, 0.5, '#c8ccd8', 0, 0.25, 0, 10)) // 盆柱
      grp.add(cyl(0.3, 0.22, 0.18, '#b8c0d4', 0, 0.58, 0, 12)) // 盆体
      grp.add(cyl(0.24, 0.24, 0.02, '#4a7ac9', 0, 0.66, 0, 12)) // 蓝色圣水面
      grp.add(glow(0.06, 0.02, 0.06, '#9adfff', 0, 0.68, 0)) // 水面圣辉
      grp.add(cyl(0.32, 0.32, 0.03, '#d4af37', 0, 0.68, 0, 12)) // 金饰盆沿
      break
    }
    // ===================== v54：Level 5「恐怖酒店」无限化 =====================
    case 'phonograph': {
      // 留声机（L5 休息室；v55 深化：收分木柜座 + 黑胶唱盘[持续旋转，updateStructs 驱动] +
      // 唱臂 + 曲柄 + 黄铜大喇叭[锥形多节]；data.off=1 时停转停播[E 交互切换]）
      const wood = '#4a3226', woodD = '#38241a', brass = '#b8924a', brassD = '#8a6d2e'
      grp.add(box(0.6, 0.6, 0.5, wood, 0, 0.3, 0)) // 木柜座
      grp.add(box(0.64, 0.06, 0.54, woodD, 0, 0.06, 0)) // 底座踢脚
      grp.add(box(0.56, 0.04, 0.46, woodD, 0, 0.62, 0)) // 顶板
      grp.add(box(0.5, 0.03, 0.4, brassD, 0, 0.645, 0)) // 机芯金属衬板
      // 唱盘组（旋转件：userData.spin——黑胶唱片 + 中心轴 + 标签）
      const spin = new THREE.Group()
      spin.position.set(-0.08, 0.67, 0)
      spin.add(cyl(0.17, 0.17, 0.025, '#1a1a1c', 0, 0, 0, 20)) // 黑胶唱片
      spin.add(cyl(0.05, 0.05, 0.028, '#a03a3a', 0, 0.002, 0, 12)) // 唱片标签
      spin.add(cyl(0.012, 0.012, 0.06, brass, 0, 0.02, 0, 6)) // 中心轴
      spin.add(box(0.3, 0.004, 0.02, '#2a2a2e', 0.02, 0.014, 0)) // 唱片纹（旋转可辨）
      grp.add(spin)
      grp.userData.spin = spin
      // 唱臂（S 形近似：立柱 + 横臂 + 唱头）
      grp.add(cyl(0.02, 0.025, 0.12, brass, 0.18, 0.72, -0.16, 8))
      const arm = box(0.02, 0.02, 0.3, brass, 0.1, 0.76, -0.05)
      arm.rotation.y = 0.5
      grp.add(arm)
      grp.add(box(0.045, 0.03, 0.05, brassD, -0.03, 0.745, 0.03)) // 唱头（搭在盘缘）
      // 曲柄（侧面摇把）
      grp.add(cyl(0.015, 0.015, 0.1, brassD, 0.31, 0.4, 0.1, 6).rotateZ(Math.PI / 2))
      grp.add(box(0.02, 0.1, 0.02, wood, 0.37, 0.35, 0.1))
      grp.add(cyl(0.018, 0.018, 0.05, woodD, 0.37, 0.28, 0.1, 6))
      // 黄铜大喇叭（v55d 重做：4 段圆台沿「前+上」轴堆叠成整体闭合漏斗——轴向 rotation.x=0.58
      // （轴 = +y 前倾向 +z 抬升 33°）；尾径 0.045 与曲颈前端口相接，段间 15% 重叠防裂缝；
      // 段对象入 userData.hornSegs（离线 AABB 自检用）
      grp.add(cyl(0.025, 0.035, 0.3, brass, 0.2, 0.82, -0.14, 8)) // 喇叭支柱（柜座后角竖立）
      const neck = cyl(0.045, 0.032, 0.2, brassD, 0.2, 1.04, -0.11, 10) // 曲颈（前弯，接喇叭尾端）
      neck.rotation.x = 0.5
      grp.add(neck)
      const hornGrp = new THREE.Group()
      const ay = Math.cos(0.58), az = Math.sin(0.58) // 喇叭轴方向（0, ay, az）
      let hy = 1.1, hz = -0.07 // 喇叭尾端（与曲颈前端口相接）
      const hornSegs: THREE.Object3D[] = []
      for (const [r0, r1, len] of [[0.045, 0.07, 0.1], [0.07, 0.12, 0.12], [0.12, 0.2, 0.14], [0.2, 0.3, 0.16]] as const) {
        const seg = cyl(r1, r0, len * 1.15, brass, 0.2, hy + (ay * len) / 2, hz + (az * len) / 2, 14)
        seg.rotation.x = 0.58
        hornGrp.add(seg)
        hornSegs.push(seg)
        hy += ay * len; hz += az * len
      }
      const lip = cyl(0.33, 0.3, 0.04, '#c9a24a', 0.2, hy + ay * 0.02, hz + az * 0.02, 16) // 口沿外翻唇
      lip.rotation.x = 0.58
      hornGrp.add(lip)
      hornSegs.push(lip)
      grp.add(hornGrp)
      grp.userData.hornSegs = hornSegs
      if (s.data?.deg !== undefined) grp.rotation.y = ((Number(s.data.deg) || 0) * Math.PI) / 180
      else flushToWall(grp, s, m, 0.5)
      break
    }
    case 'poolladder': {
      // 泳池扶梯（L5 泳池池缘）：双弯管扶手——立杆升出池缘再弯向水面 + 横档（非实心）
      const steel = '#c8ccd2'
      for (const fx of [-0.22, 0.22]) {
        grp.add(cyl(0.025, 0.025, 0.9, steel, fx, 0.45, 0.1, 8)) // 立杆（池缘上段）
        const bend = cyl(0.025, 0.025, 0.5, steel, fx, 0.82, -0.18, 8) // 弯向池面的斜段
        bend.rotation.x = 0.9
        grp.add(bend)
      }
      for (let i = 0; i < 3; i++) grp.add(box(0.44, 0.03, 0.03, steel, 0, 0.28 + i * 0.26, 0.1)) // 横档 ×3
      if (s.data?.deg !== undefined) grp.rotation.y = ((Number(s.data.deg) || 0) * Math.PI) / 180
      break
    }
    case 'divingboard': {
      // 跳台（L5 泳池深水端）：短柱 + 悬挑跳板（板面朝池心悬出）+ 防滑面
      grp.add(box(0.34, 0.8, 0.34, '#8a9098', 0, 0.4, -0.22)) // 支座短柱
      grp.add(box(0.5, 0.06, 1.16, '#d8dce0', 0, 0.83, 0.08)) // 悬挑跳板（向 +z 池心伸出）
      grp.add(box(0.46, 0.015, 1.1, '#4a5a66', 0, 0.87, 0.08)) // 防滑面（深色）
      grp.add(box(0.5, 0.1, 0.06, '#8a9098', 0, 0.9, -0.46)) // 尾端挡边
      if (s.data?.deg !== undefined) grp.rotation.y = ((Number(s.data.deg) || 0) * Math.PI) / 180
      break
    }
    case 'gymbench': {
      // 健身卧推凳（L5 健身房，现代风）：凳面 + 钢架腿 + 杠铃架立柱 + 杠铃杆与杠铃片组
      const pad = '#2e3238', steel = '#7d848c', plate = '#3a3f46'
      grp.add(box(0.4, 0.08, 1.1, pad, 0, 0.42, 0)) // 凳面
      for (const fz of [-0.4, 0.4]) grp.add(box(0.34, 0.38, 0.06, steel, 0, 0.19, fz)) // 凳腿（横向板）
      for (const fx of [-0.3, 0.3]) grp.add(box(0.05, 0.95, 0.05, steel, fx, 0.48, -0.52)) // 杠铃架立柱 ×2
      grp.add(cyl(0.02, 0.02, 1.5, '#b8bec6', 0, 0.93, -0.52, 8).rotateZ(Math.PI / 2)) // 杠铃杆（横架）
      for (const fx of [-0.62, 0.62]) {
        grp.add(cyl(0.19, 0.19, 0.05, plate, fx, 0.93, -0.52, 12).rotateZ(Math.PI / 2)) // 大片
        grp.add(cyl(0.13, 0.13, 0.05, plate, fx * 1.08, 0.93, -0.52, 12).rotateZ(Math.PI / 2)) // 小片
      }
      if (s.data?.deg !== undefined) grp.rotation.y = ((Number(s.data.deg) || 0) * Math.PI) / 180
      break
    }

    // ===================== v55：Level 5 走廊/主厅精致化 =====================
    case 'rug': {
      // 独立地毯块：无缝真实织物按物理尺度重复，避免把整幅方图强行拉伸到任意长宽比。
      // data.layer 仅用于主厅刻意叠放的地毯，普通走廊不再生成 rug，杜绝交叉口共面穿模。
      const requested = (s.data?.tex as string | undefined) ?? 'l5_carpet.jpg'
      // 旧存档/旧生成数据里的蓝毯别名也统一迁移到当前金红款。
      const tex = requested === 'l5_carpet.png' || requested === 'l5_carpet_blue.png' || requested === 'l5_carpet_blue.jpg'
        ? 'l5_carpet.jpg' : requested
      const layer = Number(s.data?.layer) || 0
      const geo = new THREE.PlaneGeometry(s.w, s.h)
      const uv = geo.attributes.uv as THREE.BufferAttribute
      for (let i = 0; i < uv.count; i++) {
        const u = uv.getX(i), v = uv.getY(i)
        // 绝对世界相位：pushClipped 把跨 chunk 地毯切成多片时，各片仍在切口处无缝衔接。
        uv.setXY(i, (s.x + u * s.w) / 0.75, (s.y + (1 - v) * s.h) / 0.75)
      }
      const panel = new THREE.Mesh(
        geo,
        litMaterial({
          // 独立地毯同样保持零环境反射；颜色轻压暗，避免在酒店密集灯光下比硬地面更亮。
          color: '#9a817c',
          envBase: 0,
          roughness: 1,
          map: levelTexture(tex, () => noiseTexture('#7a2a2e', '#5e1f24')),
        }),
      )
      panel.rotation.x = -Math.PI / 2
      panel.position.set(0, 0.012 + layer * 0.008, 0)
      grp.add(panel)
      break
    }
    case 'redpillar': {
      // 红木纹方柱（L5 主厅）：红色大理石观感柱身（红棕竖纹叠金线）+ 金色柱头（叠涩方板）+ 金色柱础；
      // 挑高自适应（ceiling=1 → tallCeilH，同 pillar 的顶到实际顶面约定；无限层 m.floors=1 也认 ceiling）
      const pti = Math.floor(cz) * m.w + Math.floor(cx)
      const ph = m.up?.[pti] === 1 ? 2.65 : m.ceiling?.[pti] === 1 ? tallCeilH(m, H) : H
      const marble = '#6e2a2c', marbleD = '#521e20', gold = '#c9a24a'
      grp.add(box(0.62, ph - 0.5, 0.62, marble, 0, (ph - 0.5) / 2 + 0.22, 0)) // 柱身
      for (let i = 0; i < 4; i++) { // 柱身竖棱（深色凹槽 + 金线交替）
        const a = (i / 4) * Math.PI * 2
        grp.add(box(0.05, ph - 0.6, 0.05, marbleD, Math.cos(a) * 0.3, ph / 2 + 0.05, Math.sin(a) * 0.3))
      }
      grp.add(box(0.7, 0.06, 0.7, gold, 0, 0.75, 0)) // 柱身金线（束腰）
      grp.add(box(0.78, 0.14, 0.78, marbleD, 0, 0.29, 0)) // 柱础座
      grp.add(box(0.86, 0.08, 0.86, gold, 0, 0.18, 0)) // 柱础金沿
      grp.add(box(0.72, 0.1, 0.72, gold, 0, ph - 0.28, 0)) // 柱头下板（echinus）
      grp.add(box(0.86, 0.12, 0.86, gold, 0, ph - 0.16, 0)) // 柱头方板（abacus）
      grp.add(box(0.66, 0.06, 0.66, marbleD, 0, ph - 0.06, 0)) // 柱头顶板
      break
    }
    case 'ceilingbeam': {
      // 装饰横梁（L5 主厅吊顶格）：深色木梁沿 local X 横跨 s.w 瓦片 + 金线沿 + 两端垂花托；
      // 贴本瓦片天花板底面（挑高区=挑高顶；同 chandelier 的 CH 约定——CH 见函数顶部 ceilingHeightAt）
      const bw = s.w, wood = '#3a2420', gold = '#b8924a'
      grp.add(box(bw, 0.32, 0.42, wood, 0, CH - 0.16, 0)) // 主梁
      grp.add(box(bw, 0.05, 0.46, gold, 0, CH - 0.34, 0)) // 梁底金线沿
      grp.add(box(bw, 0.06, 0.5, wood, 0, CH - 0.03, 0)) // 梁顶压板
      for (const ex of [-bw / 2 + 0.4, bw / 2 - 0.4]) // 梁下垂花托（靠近两端）
        grp.add(box(0.24, 0.2, 0.46, gold, ex, CH - 0.46, 0))
      break
    }
    // ===================== v55 第二批：L5 房间充实 =====================
    case 'oddtable': {
      // 异形小桌（L5 贝弗莉室正中；v55b 放大：更大桌面 + 更多饮料与麻将规模）：不规则歪腿怪异造型
      const wood = '#2e1c14', woodD = '#1e100a'
      grp.add(box(1.3, 0.06, 1.05, wood, 0, 0.66, 0)) // 大桌面（略微歪斜的不规则形）
      grp.children[0].rotation.y = 0.08
      grp.add(box(1.36, 0.03, 1.1, woodD, 0, 0.63, 0)) // 桌沿
      for (const [lx, lz, tl, tr] of [[-0.52, -0.4, 0.62, 0.14], [0.55, -0.36, 0.66, -0.1], [-0.46, 0.44, 0.58, -0.16], [0.5, 0.4, 0.7, 0.2]] as const) {
        const leg = box(0.08, tl, 0.08, woodD, lx, tl / 2, lz) // 四条腿高低不一、歪扭
        leg.rotation.z = tr; leg.rotation.x = tr * 0.6
        grp.add(leg)
      }
      // 饮料瓶群（两簇高矮错落的玻璃小瓶，琥珀/绿/透明）
      const bottles: [number, number, number, string][] = [
        [-0.44, -0.2, 0.24, '#7a5a2a'], [-0.3, 0.14, 0.3, '#3a5a3a'], [-0.14, -0.1, 0.2, '#8a8a7a'],
        [0.02, 0.18, 0.26, '#6a4a2a'], [0.14, -0.22, 0.22, '#4a6a5a'], [-0.38, 0.32, 0.18, '#7a5a2a'],
        [0.3, 0.3, 0.28, '#3a5a3a'],
      ]
      for (const [bx, bz, bh, bc] of bottles) {
        grp.add(cyl(0.035, 0.045, bh, bc, bx, 0.69 + bh / 2, bz, 8)) // 瓶身
        grp.add(cyl(0.012, 0.02, 0.06, bc, bx, 0.71 + bh, bz, 6)) // 瓶颈
      }
      // 未打完的麻将：两侧牌墙（两层小牌墩）+ 中央舍牌堆（散落小牌）
      for (let i = 0; i < 8; i++) {
        grp.add(box(0.045, 0.06, 0.03, '#e8e2d0', -0.5 + i * 0.05, 0.72, 0.4)) // 牌墙下层（北）
        if (i < 7) grp.add(box(0.045, 0.06, 0.03, '#ded8c4', -0.48 + i * 0.05, 0.78, 0.4)) // 牌墙上层
      }
      for (let i = 0; i < 6; i++)
        grp.add(box(0.045, 0.06, 0.03, '#e2dccc', 0.12 + i * 0.05, 0.72, -0.42)) // 牌墙（南，单层）
      for (let i = 0; i < 8; i++) {
        const t = box(0.045, 0.02, 0.03, i % 2 ? '#e8e2d0' : '#d8d2c0', -0.05 + (i % 4) * 0.07, 0.7, -0.02 + Math.floor(i / 4) * 0.1)
        t.rotation.y = (i * 0.7) % 0.9 - 0.45 // 舍牌散乱
        grp.add(t)
      }
      break
    }
    case 'furnace': {
      // 熔炉（L5 锅炉房）：砖砌炉体 + 炉膛口（橙红微光 + 炉栅）+ 顶部烟道 + 加料斗
      const brick = '#4a3630', brickD = '#382823', iron = '#2a2d30'
      grp.add(box(0.9, 1.5, 0.8, brick, 0, 0.75, 0)) // 炉体
      grp.add(box(0.98, 0.12, 0.88, brickD, 0, 0.06, 0)) // 炉基
      grp.add(box(0.5, 0.44, 0.06, iron, 0, 0.62, 0.39)) // 炉膛门框
      grp.add(glow(0.36, 0.3, 0.03, '#e8782a', 0, 0.62, 0.4)) // 炉膛口微光（橙红）
      for (let i = 0; i < 4; i++) grp.add(box(0.04, 0.3, 0.02, '#1c1e22', -0.12 + i * 0.08, 0.62, 0.42)) // 炉栅条
      grp.add(box(0.34, 0.2, 0.05, iron, 0, 1.14, 0.39)) // 观察口盖
      grp.add(cyl(0.14, 0.18, 1.1, iron, 0.2, 2.05, -0.1, 10)) // 烟道（贴顶）
      grp.add(box(0.4, 0.24, 0.3, brickD, -0.24, 1.6, 0.05)) // 加料斗
      break
    }
    case 'treadmill': {
      // 跑步机（L5 健身房）：跑带台 + 斜立柱 + 表头横杆
      const frame = '#3a3f46', belt = '#1c1e22'
      grp.add(box(0.62, 0.14, 1.5, frame, 0, 0.16, 0)) // 跑台
      grp.add(box(0.5, 0.03, 1.3, belt, 0, 0.25, 0)) // 跑带面
      grp.add(box(0.56, 0.05, 0.06, frame, 0, 0.28, 0.72)) // 前滚筒罩
      for (const sx of [-0.26, 0.26]) {
        const post = box(0.05, 0.85, 0.05, frame, sx, 0.65, 0.6) // 斜立柱
        post.rotation.x = -0.2
        grp.add(post)
      }
      grp.add(box(0.6, 0.06, 0.05, frame, 0, 1.05, 0.68)) // 扶手横杆
      grp.add(box(0.34, 0.2, 0.06, '#22262c', 0, 1.18, 0.7)) // 表头
      grp.add(glow(0.2, 0.08, 0.02, '#5a7a8a', 0, 1.2, 0.73)) // 表头微光屏
      if (s.data?.deg !== undefined) grp.rotation.y = ((Number(s.data.deg) || 0) * Math.PI) / 180
      break
    }
    case 'dumbbellrack': {
      // 哑铃架（L5 健身房）：双层斜架 + 成排大小哑铃
      const steel = '#4a4f56', iron = '#2a2d30'
      for (const lvl of [0.35, 0.75]) { // 双层
        grp.add(box(1.2, 0.05, 0.3, steel, 0, lvl, 0))
        for (const sx of [-0.55, 0.55]) grp.add(box(0.05, lvl, 0.3, steel, sx, lvl / 2, 0)) // 架腿
        for (let i = 0; i < 5; i++) { // 成排哑铃（两头圆片 + 握杆）
          const dx = -0.44 + i * 0.22, r = 0.05 + i * 0.008
          grp.add(cyl(r, r, 0.04, iron, dx - 0.05, lvl + 0.08, 0, 8).rotateX(Math.PI / 2))
          grp.add(cyl(r, r, 0.04, iron, dx + 0.05, lvl + 0.08, 0, 8).rotateX(Math.PI / 2))
          grp.add(box(0.1, 0.025, 0.025, steel, dx, lvl + 0.08, 0))
        }
      }
      if (s.data?.deg !== undefined) grp.rotation.y = ((Number(s.data.deg) || 0) * Math.PI) / 180
      break
    }
    case 'spinbike': {
      // 动感单车（L5 健身房）：大飞轮 + 车架 + 弯把 + 座垫 + 脚踏
      const frame = '#3a3f46', pad = '#22262c'
      grp.add(cyl(0.3, 0.3, 0.08, '#5a6068', 0, 0.32, 0.32, 16).rotateZ(Math.PI / 2)) // 前置大飞轮
      grp.add(box(0.08, 0.06, 0.9, frame, 0, 0.42, -0.05)) // 车架主梁
      grp.add(box(0.06, 0.5, 0.06, frame, 0, 0.66, -0.38)) // 座管
      grp.add(box(0.24, 0.07, 0.26, pad, 0, 0.94, -0.4)) // 座垫
      const hbar = box(0.06, 0.55, 0.06, frame, 0, 0.72, 0.28) // 把立管（前倾）
      hbar.rotation.x = 0.3
      grp.add(hbar)
      grp.add(box(0.44, 0.05, 0.05, pad, 0, 1.02, 0.36)) // 弯把
      for (const sx of [-0.14, 0.14]) grp.add(box(0.12, 0.04, 0.1, pad, sx, 0.42, 0.05)) // 脚踏
      for (const [fx, fz] of [[-0.25, 0.4], [0.25, 0.4], [-0.25, -0.45], [0.25, -0.45]] as const)
        grp.add(box(0.06, 0.08, 0.14, frame, fx, 0.04, fz)) // 地支脚
      if (s.data?.deg !== undefined) grp.rotation.y = ((Number(s.data.deg) || 0) * Math.PI) / 180
      break
    }
    case 'wallsign': {
      if(s.data?.l1Waymark){
        grp.add(box(.08,1.64,.08,'#73766b',0,.82,0))
        grp.add(box(1.8,.56,.07,'#38493f',0,1.9,0))
        for(const dir of [-1,1]){
          const mat=new THREE.MeshBasicMaterial({map:signTexture(String(s.data.text??''),false)});mat.userData.l1Owned=true
          const face=new THREE.Mesh(new THREE.PlaneGeometry(1.72,.48),mat)
          face.position.set(0,1.9,dir*.039);face.rotation.y=dir<0?Math.PI:0;grp.add(face)
        }
        if(s.data.targetX!==undefined&&s.data.targetY!==undefined){
          const arrow=new THREE.Group(),dx=Number(s.data.targetX)-s.x-(m.inf?.ox??0)-.5,dz=Number(s.data.targetY)-s.y-(m.inf?.oy??0)-.5
          arrow.rotation.y=Math.atan2(dx,dz)
          arrow.add(box(.08,.012,.8,'#d4c998',0,.015,.8))
          const tip=new THREE.Mesh(new THREE.ConeGeometry(.2,.42,3),new THREE.MeshLambertMaterial({color:'#d4c998'}))
          ;(tip.material as THREE.Material).userData.l1Owned=true;tip.rotation.x=Math.PI/2;tip.scale.z=.03;tip.position.set(0,.02,1.36);arrow.add(tip);grp.add(arrow)
        }
        break
      }

      // 墙面字牌（程序贴图小牌：data.text 文字、data.gold 金底描金变体——门牌号/员工专用/Beverly Room）
      const txt = (s.data?.text as string | undefined) ?? ''
      const gold = !!s.data?.gold
      const inner = new THREE.Group()
      grp.add(inner)
      inner.add(box(0.56, 0.2, 0.02, gold ? '#8a6d2e' : '#3a3d42', 0, 1.6, 0)) // 牌板
      inner.add(box(0.6, 0.03, 0.025, gold ? '#6a541f' : '#2a2d30', 0, 1.71, 0)) // 牌框上沿
      inner.add(box(0.6, 0.03, 0.025, gold ? '#6a541f' : '#2a2d30', 0, 1.49, 0)) // 牌框下沿
      const panel = new THREE.Mesh(
        new THREE.PlaneGeometry(0.52, 0.16),
        new THREE.MeshBasicMaterial({ map: signTexture(txt, gold), transparent: true }),
      )
      panel.position.set(0, 1.6, 0.013)
      inner.add(panel)
      mountOnWall(inner, grp, s, m)
      break
    }
    case 'foldladder': {      // 人字折叠梯（L5 锅炉房/维修大厅装饰，纯装饰非攀爬；v55d 重做——标准人字梯）：
      // 前架两斜杆（下端外张、上端收拢）+ 4 级水平踏板嵌于两杆之间；后架反向对称 + 2 根横撑；
      // 顶部铰链连接两架顶端；顶台贴铰链下沿。四足齐地。部件登记 userData.chk（离线 AABB 自检用）
      const alum = '#8a8f96', step = '#6a7076', hinge = '#4a4f56'
      const chk: { rails: THREE.Object3D[]; steps: THREE.Object3D[]; hinge?: THREE.Object3D; deck?: THREE.Object3D } = { rails: [], steps: [] }
      const H2 = 1.56, LEAN = 0.3 // 架高、下端外张量
      const tilt = Math.atan(LEAN / H2) // 斜杆倾角（顶端 z≈0，底端 z=±0.3）
      for (const sx of [-0.24, 0.24]) {
        const fr = box(0.05, Math.hypot(H2, LEAN), 0.05, alum, sx, H2 / 2, LEAN / 2) // 前斜杆（底 +z 外张）
        fr.rotation.x = tilt
        grp.add(fr); chk.rails.push(fr)
        const br = box(0.05, Math.hypot(H2, LEAN), 0.05, alum, sx, H2 / 2, -LEAN / 2) // 后斜杆（底 -z 外张）
        br.rotation.x = -tilt
        grp.add(br); chk.rails.push(br)
      }
      for (let i = 0; i < 4; i++) { // 4 级水平踏板（等距、无倾角；z 随前架斜线收拢，两端搭进斜杆）
        const sy = 0.35 + i * 0.33
        const sz = LEAN - (LEAN / H2) * sy // 前架斜线上的 z
        const st = box(0.54, 0.035, 0.15, step, 0, sy, sz)
        grp.add(st); chk.steps.push(st)
      }
      for (const by of [0.55, 1.05]) // 后架横撑（连接两后斜杆）
        grp.add(box(0.48, 0.04, 0.04, step, 0, by, -(LEAN / H2) * by))
      const hg = cyl(0.045, 0.045, 0.56, hinge, 0, H2 + 0.02, 0, 10).rotateZ(Math.PI / 2) // 顶部铰链（沿 x）
      grp.add(hg); chk.hinge = hg
      const deck = box(0.52, 0.045, 0.3, step, 0, H2 + 0.09, 0) // 顶台（底面贴铰链顶——不悬空不穿模）
      grp.add(deck); chk.deck = deck
      grp.userData.chk = chk
      if (s.data?.deg !== undefined) grp.rotation.y = ((Number(s.data.deg) || 0) * Math.PI) / 180
      break
    }
    case 'invitation': {
      // 烫金邀请函（L5 贝弗莉室地面；v55b 可交互装饰物——交互走定居点地标链路前往原住民）：
      // 奶白信封贴地平放 + 烫金边 + 暗红火漆印（非实心、不挡路）
      const paper = '#f2ecd8', gold = '#c9a24a', wax = '#7a1e24'
      grp.add(box(0.34, 0.012, 0.24, paper, 0, 0.012, 0)) // 信封
      grp.add(box(0.34, 0.014, 0.045, gold, 0, 0.013, -0.098)) // 烫金边（上）
      grp.add(box(0.34, 0.014, 0.045, gold, 0, 0.013, 0.098)) // 烫金边（下）
      grp.add(box(0.045, 0.014, 0.24, gold, -0.148, 0.013, 0)) // 烫金边（左）
      grp.add(box(0.045, 0.014, 0.24, gold, 0.148, 0.013, 0)) // 烫金边（右）
      grp.add(box(0.2, 0.014, 0.1, '#e8dfc2', 0, 0.016, -0.05)) // 封口折盖
      grp.add(cyl(0.038, 0.038, 0.014, wax, 0.06, 0.02, 0.01, 10)) // 火漆印
      grp.add(cyl(0.02, 0.02, 0.016, '#96602a', 0.06, 0.022, 0.01, 8)) // 火漆压纹
      break
    }

    case 'prefabmark': return null
    case 'wet': return null
    default: return null
  }
  grp.position.set(cx, 0, cz)
  if(_def.id===2)alignL2WallProp(grp,s)
  return grp
}

// ---------- 出口低模 ----------
export function buildExit(kind: string, def: LevelDef, structure?: Structure): THREE.Group {
  if(def.id===101&&kind==='unlockeddoor')return buildAlphaDecor({kind:'alpha_entry_portal',x:-.9,y:-.12,w:1.8,h:.24,solid:true})
  if (def.id === 11 && (kind === 'l11roadback' || kind === 'countrypath')) {
    const marker = buildL11Structure({ kind: 'l11landmark', x: -.5, y: -.5, w: 1, h: 1, solid: false, data: { citySite: kind === 'countrypath' ? 'L10' : 'L9' } })!
    return marker
  }
  const grp = new THREE.Group()
  // 仅 L9 的新结构分支读取该值；标准出口调用不传 structure。
  const s = structure ?? ({ kind: 'l9arrowsign', x: 0, y: 0, w: 1, h: 1, solid: false, data: {} } as Structure)
  const pulseMat = () => {
    const mat = new THREE.MeshBasicMaterial({ color: '#f5e37a' })
    mat.userData.pulse = true
    mat.userData.base = col('#f5e37a')
    return mat
  }
  // v17/v29：闪烁的墙壁专用——规律明灭的闪烁材质（render() 出口动画按 strobe 处理）
  const strobeMat = (phase = 0, opacityBase = 0.2) => {
    const mat = new THREE.MeshBasicMaterial({
      color: '#f5e37a', transparent: true, opacity: opacityBase, depthWrite: false,
      blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -2,
    })
    mat.userData.strobe = true
    mat.userData.base = col('#f5e37a')
    mat.userData.phase = phase
    mat.userData.opacityBase = opacityBase
    return mat
  }
  // v30：洞口地板——与本层地板同纹理同色调（从外往里看是地板延续；黑色只出现在更深处）
  const levelFloorQuad = (w: number, d: number, x: number, y: number, z: number) => {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(w, d),
      // v53：L0 地板贴图已烘焙底色（仅贴图）——洞口地板顶点色改白，避免底色二次叠乘
      new THREE.MeshLambertMaterial({ color: def.id === 0 ? '#ffffff' : def.palette.floor, map: levelTexture(`l${texLevelId(def.id)}_floor`, () => noiseTexture(def.palette.floor, def.palette.floorAlt)) }),
    )
    m.rotation.x = -Math.PI / 2
    m.position.set(x, y, z)
    return m
  }
  switch (kind) {
    case 'longroad': {
      // Level 10 → Level 11 不再凭空生成硬化路面、建筑阴影或城市轮廓；出口本体只是
      // 插在右侧车辙上的旧金属路牌，玩家直接注视并与牌面交互。
      const metal = l10MetalMaterial()
      const postX = 1.12
      const post = new THREE.Mesh(new THREE.CylinderGeometry(.045, .06, 1.42, 8), metal)
      post.position.set(postX, .71, .035); grp.add(post)
      const board = new THREE.Mesh(new THREE.BoxGeometry(1.34, .54, .075), metal)
      board.position.set(postX, 1.46, 0); grp.add(board)
      const face = new THREE.Mesh(
        new THREE.PlaneGeometry(1.24, .44),
        new THREE.MeshLambertMaterial({ map: signTexture('LEVEL 11', false), side: THREE.DoubleSide }),
      )
      face.position.set(postX, 1.46, -.039); grp.add(face)
      // 小型方向箭头沿模型局部 +z；renderer 会让整个路牌随真实车辙切线旋转。
      const arrow = new THREE.Mesh(
        new THREE.ConeGeometry(.11, .3, 3),
        new THREE.MeshLambertMaterial({ color: '#d8d8d2', side: THREE.DoubleSide }),
      )
      arrow.rotation.x = Math.PI / 2; arrow.position.set(postX + .49, 1.46, -.045); grp.add(arrow)
      break
    }
    case 'lakeswim': {
      // 深湖出口没有“门”；仅以水下极弱的散射环帮助代码/开发者定位。
      const ring = new THREE.Mesh(new THREE.RingGeometry(.55, .82, 32), new THREE.MeshBasicMaterial({ color: '#9eb9ad', transparent: true, opacity: .055, depthWrite: false, side: THREE.DoubleSide }))
      ring.rotation.x = -Math.PI / 2; grp.add(ring)
      break
    }
    case 'countrypath': {
      const path = new THREE.Mesh(new THREE.PlaneGeometry(2.8, 8), litMaterial({ color: '#8d7756', map: levelTexture('l10_packed_dirt_diff.jpg', () => noiseTexture('#6c573f', '#9c835e')), roughness: .94, envBase: .025 }))
      path.rotation.x = -Math.PI / 2; path.position.set(0, .025, 3.2); grp.add(path)
      for (const x of [-1.65, 1.65]) {
        grp.add(cyl(.075, .1, 1.35, '#776146', x, .675, 0, 8))
        grp.add(box(.12, 1.05, .1, '#8b7454', x, .76, .72))
      }
      break
    }
    case 'flickerdoor': {
      if(def.id===0)break // L0 animates its actual, opaque architectural wall.
      // 门形异常并非实体门框，而是原墙纸本身被分区照亮：底层大面保留墙纹，细条以不同相位闪烁。
      const glow = new THREE.Mesh(new THREE.PlaneGeometry(1.14, 2.18), strobeMat(0, 0.22))
      glow.position.set(0, 1.1, 0)
      grp.add(glow)
      const stripWidths = [0.17, 0.24, 0.19, 0.28]
      let sx = -0.49
      for (let i = 0; i < stripWidths.length; i++) {
        const sw = stripWidths[i]
        const strip = new THREE.Mesh(new THREE.PlaneGeometry(sw, 2.12 - (i % 2) * 0.08), strobeMat(1.3 + i * 0.91, 0.12))
        strip.position.set(sx + sw / 2, 1.09 + (i % 2) * 0.02, 0.006 + i * 0.001)
        grp.add(strip)
        sx += sw + 0.035
      }
      break
    }
    case 'crack': case 'arcflash': {
      // 地面发光裂口
      const p = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.5), pulseMat())
      p.rotation.x = -Math.PI / 2
      p.rotation.z = 0.4
      p.position.y = 0.03
      grp.add(p)
      const p2 = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.25), pulseMat())
      p2.rotation.x = -Math.PI / 2
      p2.rotation.z = -0.5
      p2.position.set(0.3, 0.035, 0.3)
      grp.add(p2)
      break
    }
    case 'collapse': case 'shaft': case 'window': {
      // 黑洞
      const hole = new THREE.Mesh(new THREE.CircleGeometry(0.7, 12), new THREE.MeshBasicMaterial({ color: '#000000' }))
      hole.rotation.x = -Math.PI / 2
      hole.position.y = 0.02
      grp.add(hole)
      break
    }
    case 'freight': case 'elevatorshaft': case 'stafflift': case 'servicelift': {
      // 金属电梯门 + 指示灯（v51：门框 + 门扇凹进框面 0.12——L3 嵌墙电梯观感）
      grp.add(box(0.2, 2.5, 0.2, '#2f3236', -0.78, 1.25, -0.18)) // 门框立柱
      grp.add(box(0.2, 2.5, 0.2, '#2f3236', 0.78, 1.25, -0.18))
      grp.add(box(1.76, 0.2, 0.2, '#2f3236', 0, 2.55, -0.18)) // 门楣
      grp.add(box(1.6, 2.4, 0.15, '#4a4d52', 0, 1.2, -0.3)) // 门扇（凹入框面 0.12）
      grp.add(box(0.06, 2.2, 0.18, '#2a2d30', 0, 1.1, -0.3))
      const ind = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.1, 0.06), pulseMat())
      ind.position.set(0, 2.55, -0.28)
      grp.add(ind)
      if(def.id===5)grp.scale.x=.55 // Generated hotel niches are one tile wide.
      break
    }
    case 'revolving': {
      grp.add(cyl(1.0, 1.0, 0.1, '#b08d46', 0, 2.4, 0, 12))
      for (let i = 0; i < 3; i++) {
        const panel = new THREE.Mesh(new THREE.BoxGeometry(1.6, 2.3, 0.05), pulseMat())
        panel.rotation.y = (i * Math.PI) / 3
        panel.position.y = 1.15
        grp.add(panel)
      }
      break
    }
    case 'mirror': {
      grp.add(box(1.2, 2.4, 0.1, '#3a1e20', 0, 1.2, -0.2))
      const mg = new THREE.Mesh(new THREE.BoxGeometry(1.0, 2.2, 0.04), pulseMat())
      mg.position.set(0, 1.2, -0.14)
      grp.add(mg)
      break
    }
    case 'graystairs': {
      // 下行的灰色阶梯：12 级混凝土踏步沿走向下探（与引擎坡道 z=-1.23·s 严格对齐，无偏移）+ 两侧顺坡护栏 + 底部漆黑
      for (let i = 0; i < 12; i++) {
        const z = 0.1 - i * 0.22
        grp.add(box(1.1, 0.1, 0.26, '#7a7a7e', 0, 1.23 * z - 0.06, z))
      }
      // v29a 修复：护栏原来水平横架（深端悬空 2.6m 横跨洞口）——改为顺坡斜置，与踏步平行且高出踏面 ~0.85m
      // 坡面：踏面 y=1.2308·z（z 为局部纵深，负值深入）；护栏中心线 y=1.2308·z+0.85，倾角 atan(1.2308)
      for (const sx of [-0.6, 0.6]) {
        const rail = box(0.08, 0.07, 4.0, '#5e5e62', sx, 1.2308 * -1.1 + 0.85, -1.1)
        rail.rotation.x = -Math.atan(1.2308) // 局部 +z 轴向 → 顺坡向下
        grp.add(rail)
        // 入口端立柱（衔接地板与护栏端头）
        grp.add(box(0.08, 0.9, 0.08, '#5e5e62', sx, 0.45, 0.28))
      }
      const dark = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 3.6), new THREE.MeshBasicMaterial({ color: '#000000' }))
      dark.rotation.x = -Math.PI / 2
      dark.position.set(0, -3.3, -0.9)
      grp.add(dark)
      break
    }
    case 'graystairsup': {
      // 上行的灰色阶梯：12 级混凝土踏步沿走向上升（与引擎坡道严格对齐），没入顶部漆黑
      for (let i = 0; i < 12; i++) {
        const z = 0.1 - i * 0.22
        grp.add(box(1.1, 0.1, 0.26, '#7a7a7e', 0, -1.23 * z - 0.06, z))
      }
      // v29a 修复：同下行——护栏顺坡斜置（与上行踏步平行，高出踏面 ~0.85m）
      for (const sx of [-0.6, 0.6]) {
        const rail = box(0.08, 0.07, 4.0, '#5e5e62', sx, -1.2308 * -1.1 + 0.85, -1.1)
        rail.rotation.x = Math.atan(1.2308) // 顺坡向上
        grp.add(rail)
        grp.add(box(0.08, 0.9, 0.08, '#5e5e62', sx, 0.45, 0.28))
      }
      const dark = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 3.6), new THREE.MeshBasicMaterial({ color: '#000000' }))
      dark.rotation.x = Math.PI / 2
      dark.position.set(0, 3.4, -0.9)
      grp.add(dark)
      break
    }
    case 'oldstairs': {
      if(def.id===4){grp.add(buildL4OldStairs());break}
      // v54：年久失修的古典楼梯（L4 → Level 5 唯一楼梯出口；可行走下行，坡道对齐同灰色阶梯）——
      // v54b：踏步自井口缘（局部 z=-0.45，洞口从 z=-0.5 起）才出现——楼板实体段内不再有踏步/平台
      // （此前第一级从 z=+0.1 起坡，顶面低于地板的踏步整段卡进楼板）；
      // 护栏改为井口地板高度围合（两侧扶手+雕花栏杆柱+尽头横栏，入梯口留缺）——
      // 此前顺坡斜置扶手在井口上方横穿错位
      const wood = '#4a3524', wood2 = '#5a3f2a'
      for (let i = 0; i < 11; i++) {
        const z = -0.45 - i * 0.22
        grp.add(box(1.1, 0.1, 0.26, i === 6 ? '#2e2118' : wood, 0, 1.2308 * z - 0.06, z)) // 第 7 级朽坏发暗
      }
      for (const sx of [-0.55, 0.55]) {
        grp.add(box(0.07, 0.06, 2.95, wood2, sx, 0.86, -1.975)) // 侧扶手（z -0.5..-3.45 井口段，地板高度围合）
        for (let i = 0; i < 8; i++) { // 雕花栏杆柱（第 4 根缺失=朽坏断缺）
          if (i === 3) continue
          grp.add(box(0.05, 0.86, 0.05, wood2, sx, 0.43, -0.55 - i * 0.41))
        }
        grp.add(box(0.12, 0.95, 0.12, wood2, sx, 0.475, -0.55)) // 井口转角端柱（入梯口留在楼梯格两侧）
        grp.add(cyl(0.02, 0.07, 0.1, '#7a5a34', sx, 1.0, -0.55, 8)) // 端柱车木圆头
      }
      grp.add(box(1.17, 0.06, 0.07, wood2, 0, 0.86, -3.45)) // 井口尽头横栏
      for (const px of [-0.28, 0, 0.28]) grp.add(box(0.05, 0.86, 0.05, wood2, px, 0.43, -3.45)) // 尽头栏杆柱
      const dark = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 3.6), new THREE.MeshBasicMaterial({ color: '#000000' }))
      dark.rotation.x = -Math.PI / 2
      dark.position.set(0, -3.45, -1.4)
      grp.add(dark)
      break
    }
    case 'trapdoor': {
      // v54：年久失修的活板门（L4 小房间 → Level 6；落地式，不嵌墙——勿入 DOOR_EXIT_KINDS）：
      // 地板上的旧木框 + 微翘盖板（朽木色差）+ 铁环拉手 + 缝隙漆黑
      const wood = '#5a4630', woodD = '#463826'
      grp.add(box(1.0, 0.05, 0.1, woodD, 0, 0.025, -0.45)) // 框（北）
      grp.add(box(1.0, 0.05, 0.1, woodD, 0, 0.025, 0.45)) // 框（南）
      grp.add(box(0.1, 0.05, 0.8, woodD, -0.45, 0.025, 0)) // 框（西）
      grp.add(box(0.1, 0.05, 0.8, woodD, 0.45, 0.025, 0)) // 框（东）
      grp.add(box(0.78, 0.03, 0.78, '#0a0806', 0, 0.02, 0)) // 盖板下漆黑
      const lid = box(0.76, 0.04, 0.76, wood, 0, 0, 0)
      lid.geometry.translate(0, 0, -0.38) // 铰链在北缘
      lid.position.set(0, 0.05, 0.38)
      lid.rotation.x = 0.16 // 微翘（年久变形，盖不严）
      grp.add(lid)
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.018, 6, 12), new THREE.MeshLambertMaterial({ color: '#3a3a3e' }))
      ring.position.set(0, 0.1, 0.18) // 铁环拉手（躺在微翘的盖板上）
      ring.rotation.x = Math.PI / 2 - 0.16
      grp.add(ring)
      break
    }
    case 'seahatch': {
      // L6 → L7：深海锈蚀风格活板门；无自发光，仅靠极弱天然天光辨认。
      const rust = '#493328', rustD = '#241c19'
      grp.add(box(1.2, 0.12, 1.2, rustD, 0, 0.06, 0))
      grp.add(box(0.94, 0.08, 0.94, rust, 0, 0.12, 0))
      for (const q of [-0.39, 0.39]) for (const z of [-0.39, 0.39]) grp.add(cyl(0.035, 0.035, 0.09, '#16191a', q, 0.18, z, 7))
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.024, 6, 14), new THREE.MeshLambertMaterial({ color: '#2d302f' }))
      ring.rotation.x = Math.PI / 2; ring.position.set(0, 0.2, 0.12); grp.add(ring)
      break
    }
    case 'cave8': {
      const dark = new THREE.Mesh(new THREE.CircleGeometry(0.52, 18), new THREE.MeshBasicMaterial({ color: '#000000', side: THREE.DoubleSide }))
      dark.position.set(0, 0.58, 0); grp.add(dark)
      for (let i = 0; i < 10; i++) {
        const a = i / 10 * Math.PI * 2
        const stone = new THREE.Mesh(new THREE.DodecahedronGeometry(0.25, 0), new THREE.MeshLambertMaterial({ color: '#20231f' }))
        stone.position.set(Math.cos(a) * 0.51, 0.58 + Math.sin(a) * 0.51, -0.04); grp.add(stone)
      }
      break
    }
    case 'stairs': {
      // 楼梯井（独特模型·嵌墙镂空）：墙体开洞内的楼梯井道——内侧壁 + 下探踏步没入黑暗 + 绿色出口灯牌 + 扶手
      // 朝向约定：开口朝 -z（出口格/房间侧），组中心 = 墙格中心（geometry 已在该墙格开门洞）
      grp.add(box(0.06, 2.3, 1.0, '#4a4a4e', -0.42, 1.15, 0))
      grp.add(box(0.06, 2.3, 1.0, '#4a4a4e', 0.42, 1.15, 0))
      // 下探踏步（自洞口地面开始逐级下探，修正悬空偏移）
      for (let i = 0; i < 5; i++) grp.add(box(0.8, 0.1, 0.2, '#5e5e62', 0, 0.02 - i * 0.19, -0.28 + i * 0.17))
      // 洞口地面与本层地板一致（入口处地板延续）；黑色只在踏步下方更深处
      grp.add(levelFloorQuad(1, 0.26, 0, 0.005, -0.37))
      const dkFloor = new THREE.Mesh(new THREE.PlaneGeometry(0.84, 0.8), new THREE.MeshBasicMaterial({ color: '#000000' }))
      dkFloor.rotation.x = -Math.PI / 2
      dkFloor.position.set(0, -0.78, 0.05)
      grp.add(dkFloor)
      const dkBack = new THREE.Mesh(new THREE.PlaneGeometry(0.84, 2.3), new THREE.MeshBasicMaterial({ color: '#020202', side: THREE.DoubleSide }))
      dkBack.position.set(0, 1.05, 0.5)
      grp.add(dkBack)
      grp.add(box(0.08, 2.3, 0.1, '#78787c', -0.44, 1.15, -0.42))
      grp.add(box(0.08, 2.3, 0.1, '#78787c', 0.44, 1.15, -0.42))
      grp.add(box(0.96, 0.12, 0.1, '#8a8a8e', 0, 2.36, -0.42))
      const sign = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.16, 0.05), new THREE.MeshBasicMaterial({ color: '#7ddb6a' }))
      sign.position.set(0, 2.14, -0.5)
      grp.add(sign)
      grp.add(box(0.03, 0.03, 0.8, '#8a8a8e', -0.36, 0.9, 0.05))
      grp.add(box(0.03, 0.03, 0.8, '#8a8a8e', 0.36, 0.9, 0.05))
      break
    }
    case 'unlockeddoor': {
      // 未上锁的门（独特模型·嵌墙镂空）：墙洞内的门框 + 虚掩门板（向房间侧旋开）+ 门后暗室 + 黄铜把手 + 小门牌
      grp.add(box(0.08, 2.2, 0.1, '#6b6b6e', -0.44, 1.1, -0.42))
      grp.add(box(0.08, 2.2, 0.1, '#6b6b6e', 0.44, 1.1, -0.42))
      grp.add(box(0.96, 0.1, 0.1, '#78787c', 0, 2.26, -0.42))
      const dk = new THREE.Mesh(new THREE.PlaneGeometry(0.84, 2.1), new THREE.MeshBasicMaterial({ color: '#000000', side: THREE.DoubleSide }))
      dk.position.set(0, 1.05, 0.5)
      grp.add(dk)
      // 洞口地面与本层地板一致（从外往里看是地板延续）；黑色只留在深处的暗室
      grp.add(levelFloorQuad(1, 1, 0, 0.005, 0))
      const panel = box(0.8, 2.05, 0.04, '#4d5156')
      panel.geometry.translate(0.4, 0, 0)
      panel.position.set(-0.4, 1.04, -0.42)
      panel.rotation.y = 0.55
      const handle = box(0.03, 0.14, 0.045, '#c9a03a', 0.68, -0.02, 0.04)
      panel.add(handle)
      panel.add(box(0.03, 0.14, 0.045, '#c9a03a', 0.68, -0.02, -0.04)) // v54：背面把手（双面）
      grp.add(panel)
      grp.add(box(0.24, 0.1, 0.02, '#c9c4b0', 0.44, 1.68, -0.48))
      break
    }
    case 'fireexit': {
      // 消防出口（独特模型·嵌墙镂空）：金属防火门（虚掩）+ 绿色 EXIT 灯牌 + 钢制门框 + 门后暗室
      // 朝向约定：开口朝 -z（出口格/凹龛侧），组中心 = 墙格中心（geometry 已在该墙格开门洞）
      grp.add(box(0.1, 2.3, 0.14, '#3a3f46', -0.45, 1.15, -0.4)) // 门框立柱
      grp.add(box(0.1, 2.3, 0.14, '#3a3f46', 0.45, 1.15, -0.4))
      grp.add(box(1.0, 0.12, 0.14, '#43484f', 0, 2.32, -0.4)) // 门楣
      const dk = new THREE.Mesh(new THREE.PlaneGeometry(0.84, 2.2), new THREE.MeshBasicMaterial({ color: '#020402', side: THREE.DoubleSide }))
      dk.position.set(0, 1.1, 0.5)
      grp.add(dk)
      grp.add(levelFloorQuad(1, 1, 0, 0.005, 0)) // 洞口地面与本层地板一致
      // 金属防火门（向凹龛侧虚掩；推杆 + 观察小窗）
      const panel = box(0.82, 2.2, 0.05, '#5a6068')
      panel.geometry.translate(0.41, 0, 0)
      panel.position.set(-0.41, 1.1, -0.42)
      panel.rotation.y = 0.38
      panel.add(box(0.5, 0.05, 0.03, '#43484f', 0.41, 0.05, 0.045)) // 推杆
      panel.add(box(0.16, 0.24, 0.02, '#20262c', 0.41, 0.62, 0.04)) // 观察小窗（嵌丝玻璃）
      grp.add(panel)
      // 绿色 EXIT 灯牌（门楣上方，两侧可见）+ 底部绿光晕
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(0.72, 0.26), new THREE.MeshBasicMaterial({ map: exitSignTexture() }))
      sign.position.set(0, 2.56, -0.42)
      grp.add(sign)
      const sign2 = new THREE.Mesh(new THREE.PlaneGeometry(0.72, 0.26), new THREE.MeshBasicMaterial({ map: exitSignTexture() }))
      sign2.rotation.y = Math.PI
      sign2.position.set(0, 2.56, -0.38)
      grp.add(sign2)
      grp.add(glow(0.5, 0.06, 0.06, '#3ae06a', 0, 2.42, -0.4))
      break
    }
    case 'officedoor': {
      // 办公走廊尽头（独特模型·嵌墙镂空）：L4 风办公室门——浅色门框 + 毛玻璃上板 + 木门下板 + 门后暗室
      grp.add(box(0.08, 2.2, 0.1, '#8f8a7c', -0.44, 1.1, -0.42))
      grp.add(box(0.08, 2.2, 0.1, '#8f8a7c', 0.44, 1.1, -0.42))
      grp.add(box(0.96, 0.1, 0.1, '#9a958a', 0, 2.26, -0.42))
      const dk = new THREE.Mesh(new THREE.PlaneGeometry(0.84, 2.1), new THREE.MeshBasicMaterial({ color: '#050504', side: THREE.DoubleSide }))
      dk.position.set(0, 1.05, 0.5)
      grp.add(dk)
      grp.add(levelFloorQuad(1, 1, 0, 0.005, 0))
      const panel = box(0.8, 2.05, 0.04, '#7a6a52')
      panel.geometry.translate(0.4, 0, 0)
      panel.position.set(-0.4, 1.04, -0.42)
      panel.rotation.y = 0.5
      panel.add(box(0.56, 0.7, 0.02, '#c4c7c2', 0.4, 0.55, 0.035)) // 毛玻璃上板
      panel.add(box(0.03, 0.14, 0.045, '#c9a03a', 0.68, -0.02, 0.04)) // 黄铜把手
      panel.add(box(0.03, 0.14, 0.045, '#c9a03a', 0.68, -0.02, -0.04)) // v54：背面把手（双面）
      grp.add(panel)
      grp.add(box(0.3, 0.12, 0.02, '#e8e4da', 0.44, 1.7, -0.48)) // 门牌
      break
    }
    case 'boilerdeep': {
      // v54：锅炉房深处完全黑暗的门（L5 → Level 6）——焦黑门框 + 门板位一片漆黑（无灯无发光件：
      // 不用 pulse 材质——「完全黑暗」是设定本体，渲染层 orientExitToWall 贴墙）
      grp.add(box(0.1, 2.3, 0.14, '#14100c', -0.45, 1.15, -0.4)) // 焦黑门框立柱
      grp.add(box(0.1, 2.3, 0.14, '#14100c', 0.45, 1.15, -0.4))
      grp.add(box(1.0, 0.12, 0.14, '#1a1510', 0, 2.32, -0.4)) // 门楣
      const dark = new THREE.Mesh(new THREE.PlaneGeometry(0.86, 2.24), new THREE.MeshBasicMaterial({ color: '#000000', side: THREE.DoubleSide }))
      dark.position.set(0, 1.12, -0.4) // 门洞位纯黑（不透对面——后面没有锅炉）
      grp.add(dark)
      grp.add(box(0.82, 2.2, 0.04, '#0c0a08', 0, 1.1, -0.46)) // 半掩黑门板（微开一线仍不见光）
      grp.rotation.y = 0 // 朝向由 orientExitToWall 决定
      break
    }
    case 'darkwooddoor': {
      // v54：深色木门（L5 客房门 ~0.3% 替代 → Level 9）——近乎黑色的木门虚掩在客房门洞里；
      // v55（任务8）：专属建模深化——深黑无反射门板（近黑低反）+ 边缘虚化（门框外缘半透明暗晕面片，
      // 轮廓模糊）+ 背面封墙（从门后看是一堵墙；出口格另有 darkdoorblock 实心碰撞——关闭时不可穿）
      grp.add(box(0.08, 2.2, 0.1, '#120c08', -0.44, 1.1, -0.42)) // 深黑门框
      grp.add(box(0.08, 2.2, 0.1, '#120c08', 0.44, 1.1, -0.42))
      grp.add(box(0.96, 0.1, 0.1, '#171009', 0, 2.26, -0.42))
      const dk = new THREE.Mesh(new THREE.PlaneGeometry(0.84, 2.1), new THREE.MeshBasicMaterial({ color: '#000000', side: THREE.DoubleSide }))
      dk.position.set(0, 1.05, 0.5)
      grp.add(dk)
      grp.add(levelFloorQuad(1, 1, 0, 0.005, 0)) // 洞口地面与本层地板一致
      const panel = box(0.8, 2.05, 0.05, '#0d0906') // 深黑无反射门板（比正常客房门黑得多）
      panel.geometry.translate(0.4, 0, 0)
      panel.position.set(-0.4, 1.04, -0.42)
      panel.rotation.y = 0.32 // 虚掩
      panel.add(box(0.03, 0.14, 0.045, '#4a3d20', 0.68, -0.02, 0.04)) // 暗铜把手（无光）
      panel.add(box(0.03, 0.14, 0.045, '#4a3d20', 0.68, -0.02, -0.04))
      grp.add(panel)
      // 边缘虚化：门框外缘的半透明暗晕（轮廓模糊——「看着就不对劲」）
      const haze = new THREE.Mesh(
        new THREE.PlaneGeometry(1.24, 2.5),
        new THREE.MeshBasicMaterial({ color: '#050403', transparent: true, opacity: 0.42, side: THREE.DoubleSide }),
      )
      haze.position.set(0, 1.2, -0.36)
      grp.add(haze)
      // 背面封墙：整格墙面盖板（本层墙色，带踢脚线深色根）——从门后看是一堵墙
      grp.add(box(0.96, 2.3, 0.06, def.palette.wall, 0, 1.15, 0.44))
      grp.add(box(0.96, 0.16, 0.08, def.palette.wallTop, 0, 0.08, 0.44))
      if(def.id===5){
        const h=(WALL_H[def.gen]??3.3)-2.31
        grp.add(box(1.02,h,1.0,def.palette.wall,0,2.31+h/2,0))
      }
      break
    }
    case 'l7cave': {
      // v57t：午夜带海床上的岩洞洞口（→ Level 8）——躺在海床上的环形岩檐 + 深不见底的黑洞 + 微弱青蓝光脉。
      const hole = new THREE.Mesh(new THREE.CircleGeometry(0.58, 20), new THREE.MeshBasicMaterial({ color: '#000000', side: THREE.DoubleSide }))
      hole.rotation.x = -Math.PI / 2
      hole.position.y = 0.035
      grp.add(hole)
      const rim = new THREE.Mesh(new THREE.TorusGeometry(0.66, 0.1, 8, 22), new THREE.MeshLambertMaterial({ color: '#252b2a' }))
      rim.rotation.x = -Math.PI / 2
      rim.position.y = 0.1
      grp.add(rim)
      const rr = mulberry(77)
      for (let i = 0; i < 11; i++) {
        const a = (i / 11) * Math.PI * 2 + rr() * 0.5
        const stone = new THREE.Mesh(new THREE.DodecahedronGeometry(0.14 + rr() * 0.2, 0), new THREE.MeshLambertMaterial({ color: i % 3 === 0 ? '#1c2422' : '#2c3430' }))
        stone.position.set(Math.cos(a) * (0.62 + rr() * 0.1), 0.12 + rr() * 0.18, Math.sin(a) * (0.62 + rr() * 0.1))
        stone.rotation.set(rr() * Math.PI, rr() * Math.PI, rr() * Math.PI)
        grp.add(stone)
      }
      for (const sx of [-0.85, 0.85]) {
        const spire = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.62, 7), new THREE.MeshLambertMaterial({ color: '#202825' }))
        spire.position.set(sx, 0.24, -0.18)
        spire.rotation.z = -sx * 0.22
        spire.rotation.x = 0.18
        grp.add(spire)
      }
      const pulse = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.035, 8, 24), pulseMat())
      pulse.rotation.x = -Math.PI / 2
      pulse.position.y = 0.055
      grp.add(pulse)
      break
    }
    case 'l9arrowsign': {
      // 中继牌只提示下一路牌，终点牌由出口模型负责。
      const n = Number(s.data?.seq ?? 1), total = Number(s.data?.total ?? 6)
      grp.add(cyl(0.045, 0.055, 2.05, '#5d6265', 0, 1.02, 0, 8))
      const board = box(1.08, 0.48, 0.075, '#304239', 0, 1.78, 0)
      grp.add(board)
      const panel = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 0.4), new THREE.MeshBasicMaterial({ map: signTexture(`${n}/${total}  →`, false), side: THREE.DoubleSide }))
      panel.position.set(0, 1.78, 0.041); grp.add(panel)
      grp.add(box(0.42, 0.07, 0.07, '#b9c1b8', 0.22, 1.47, 0))
      if (s.data?.deg !== undefined) grp.rotation.y = Number(s.data.deg) * Math.PI / 180
      break
    }
    case 'l9stair': {
      // 首阶段仅开放一层：楼梯是完整模型，但顶部用木板和挂锁封死。
      const wood = '#6b4b33', dark = '#39281e'
      for (let i = 0; i < 8; i++) {
        const z = -1.05 + i * 0.27, y = 0.11 + i * 0.22
        grp.add(l9PbrBox(1.1, .16, .32, 'l9_furniture_wood', '#a18467', wood, dark, .7, .62, .19, .42, 0, y, z))
      }
      for (const x of [-0.57, 0.57]) {
        const rail = box(0.055, 2.05, 0.055, dark, x, 1.05, 0); rail.rotation.x = -0.68; grp.add(rail)
        for (let i = 0; i < 5; i++) grp.add(box(0.04, 0.75, 0.04, '#493326', x, 0.55 + i * 0.28, -0.75 + i * 0.34))
      }
      grp.add(l9PbrBox(1.35, .78, .12, 'l9_furniture_wood', '#9b795a', '#563d2c', '#2b211a', .75, .66, .16, .42, 0, 2.0, 1.2))
      grp.add(box(0.22, 0.28, 0.08, '#8e825d', 0, 1.95, 1.27))
      if (s.data?.deg !== undefined) grp.rotation.y = Number(s.data.deg) * Math.PI / 180
      break
    }
    case 'l9coffeetable': {
      const wood = '#76543a'
      grp.add(l9PbrBox(1.45, .12, .72, 'l9_furniture_wood', '#a17b59', wood, '#39271d', .8, .56, .24, .4, 0, .48, 0))
      for (const [x, z] of [[-.58, -.25], [.58, -.25], [-.58, .25], [.58, .25]] as const) grp.add(box(.08, .45, .08, '#402d22', x, .23, z))
      grp.add(box(.32, .025, .22, '#d6cfb9', -.25, .56, .03)); grp.add(cyl(.09, .08, .14, '#6b756f', .32, .62, -.05, 12))
      break
    }
    case 'l9fireplace': {
      grp.add(l9PbrBox(1.12, 1.75, .42, 'l9_brick', '#a89a87', '#796b5d', '#403832', .8, .91, .08, .58, 0, .88, -.2))
      grp.add(box(.72, .7, .18, '#11100f', 0, .48, .03))
      grp.add(box(1.32, .14, .58, '#594a3d', 0, 1.35, 0)); grp.add(box(1.25, .12, .65, '#4b4037', 0, .08, 0))
      if (s.data?.deg !== undefined) grp.rotation.y = Number(s.data.deg) * Math.PI / 180
      break
    }
    case 'l9bookshelf': {
      grp.add(l9PbrBox(.78, 2.05, .3, 'l9_furniture_wood', '#8c6748', '#583b28', '#2b1d16', .75, .65, .18, .42, 0, 1.03, 0))
      for (let y = .28; y < 1.95; y += .43) grp.add(box(.68, .055, .34, '#3b281d', 0, y, .02))
      const colors = ['#6c3d35', '#364d5e', '#68704a', '#83714c']
      for (let r = 0; r < 4; r++) for (let b = 0; b < 5; b++) grp.add(box(.105, .28 + ((r + b) % 2) * .05, .17, colors[(r + b) % colors.length], -.28 + b * .14, .42 + r * .43, .16))
      if (s.data?.deg !== undefined) grp.rotation.y = Number(s.data.deg) * Math.PI / 180
      break
    }
    case 'l9floorlamp': {
      grp.add(cyl(.17, .2, .07, '#3e3c39', 0, .04, 0, 12)); grp.add(cyl(.025, .025, 1.35, '#696963', 0, .72, 0, 8))
      grp.add(cyl(.28, .16, .42, '#8b806c', 0, 1.45, 0, 14)); grp.add(box(.05, .13, .03, '#452f28', .3, 1.15, 0))
      break
    }
    case 'l9toilet': {
      grp.add(cyl(.29, .24, .34, '#dddcd5', 0, .23, .06, 14)); grp.add(cyl(.27, .27, .06, '#eceae2', 0, .43, .06, 14))
      grp.add(box(.48, .58, .22, '#d7d6cf', 0, .55, -.27)); grp.add(box(.5, .06, .24, '#eceae2', 0, .86, -.27))
      break
    }
    case 'l9bathtub': {
      grp.add(box(1.45, .54, .68, '#d8d8d2', 0, .29, 0)); grp.add(box(1.18, .4, .5, '#809499', 0, .42, 0))
      grp.add(box(1.05, .42, .43, '#24292b', 0, .42, 0)); grp.add(cyl(.018, .018, .36, '#aeb4b5', -.52, .83, -.18, 8)); grp.add(cyl(.08, .06, .16, '#aeb4b5', -.52, .91, -.05, 10))
      if (s.data?.deg !== undefined) grp.rotation.y = Number(s.data.deg) * Math.PI / 180
      break
    }
    case 'l9diningtable': {
      grp.add(l9PbrBox(1.45, .12, 1.45, 'l9_furniture_wood', '#916b4c', '#694831', '#342319', .8, .58, .23, .42, 0, .78, 0))
      grp.add(box(.22, .74, .22, '#442e22', 0, .38, 0)); grp.add(box(.82, .08, .82, '#442e22', 0, .08, 0))
      for (const [x, z, rot] of [[-.95, 0, Math.PI/2], [.95, 0, -Math.PI/2], [0, -.95, 0], [0, .95, Math.PI]] as const) {
        const ch = new THREE.Group()
        ch.add(box(.48, .08, .48, '#76543b', 0, .48, 0)); ch.add(box(.48, .75, .08, '#5b3e2d', 0, .72, -.2))
        for (const lx of [-.19, .19]) for (const lz of [-.18, .18]) ch.add(box(.055, .46, .055, '#493226', lx, .23, lz))
        for (const lx of [-.19, .19]) ch.add(box(.045, .46, .045, '#493226', lx, .82, -.2))
        ch.position.set(x, 0, z); ch.rotation.y = rot; grp.add(ch)
      }
      break
    }
    case 'l9poolfilter': {
      grp.add(cyl(.32, .32, .72, '#728187', 0, .39, 0, 14)); grp.add(cyl(.28, .28, .08, '#424a4e', 0, .78, 0, 14))
      grp.add(box(.48, .35, .38, '#394044', .5, .22, 0)); for (const x of [-.28, .28]) grp.add(cyl(.035, .035, .65, '#9aa1a2', x, .34, .34, 8))
      break
    }
    case 'l9patiochair': {
      const cc = typeof s.data?.color === 'string' ? s.data.color : '#cbc8ba'
      grp.add(box(.62, .08, .64, cc, 0, .48, 0)); grp.add(box(.62, .72, .08, cc, 0, .79, -.28))
      for (const x of [-.27, .27]) for (const z of [-.26, .26]) { const leg = box(.045, .52, .045, '#666965', x, .26, z); leg.rotation.x = z * .25; grp.add(leg) }
      if (s.data?.deg !== undefined) grp.rotation.y = Number(s.data.deg) * Math.PI / 180
      break
    }
    case 'l9barbecue': {
      grp.add(cyl(.42, .37, .42, '#25282a', 0, .75, 0, 16)); grp.add(cyl(.43, .24, .28, '#313538', 0, 1.08, 0, 16))
      grp.add(box(.06, .68, .06, '#696d6d', -.26, .34, -.22)); grp.add(box(.06, .68, .06, '#696d6d', .26, .34, -.22))
      for (let x = -.28; x <= .28; x += .1) grp.add(box(.025, .02, .58, '#777c7d', x, .97, 0))
      break
    }
    case 'l9swing': {
      const metal = '#596169'
      for (const x of [-1.5, 1.5]) for (const z of [-.42,.42]) {
        const a = box(.08, 2.4, .08, metal, x, 1.15, z); a.rotation.z = x < 0 ? -.2 : .2; a.rotation.x = z < 0 ? -.12 : .12; grp.add(a)
      }
      grp.add(box(3.2, .1, .1, metal, 0, 2.25, 0))
      for (const x of [-.65, .65]) { for (const dx of [-.23, .23]) grp.add(box(.018, 1.25, .018, '#786b56', x + dx, 1.56, 0)); grp.add(box(.58, .07, .27, '#805243', x, .93, 0)) }
      break
    }
    case 'l9slide': {
      grp.add(box(1.2, .12, 1.1, '#4e6b7f', 0, 1.65, -.95))
      for (const x of [-.45,.45]) for (const z of [-1.24,-.68]) grp.add(box(.08, 1.6, .08, '#596169', x, .8, z))
      // 背面梯架与横档从地面连续接到平台，不再只有一块悬空的踏板。
      for (const x of [-.42,.42]) { const ladder=box(.07,1.75,.07,'#596169',x,.83,-1.42); ladder.rotation.x=-.12; grp.add(ladder) }
      for(let y=.22;y<1.55;y+=.27) grp.add(box(.86,.045,.07,'#788088',0,y,-1.48+.08*y))
      const slide = box(1.0, .1, 2.8, '#9a5140', 0, .85, .45); slide.rotation.x = .48; grp.add(slide)
      for (const x of [-.53,.53]) { const rail = box(.07, .32, 2.8, '#c28448', x, 1.02, .45); rail.rotation.x = .48; grp.add(rail) }
      grp.add(box(1.04,.09,.48,'#884638',0,.08,1.78))
      break
    }
    case 'l9powerpole': {
      grp.add(cyl(.12, .17, 5.8, '#4b3828', 0, 2.9, 0, 10)); grp.add(box(2.25, .14, .16, '#49372a', 0, 5.18, 0))
      for (const x of [-.86, 0, .86]) { grp.add(cyl(.1, .08, .24, '#676b68', x, 5.4, 0, 10)); grp.add(cyl(.035, .035, 2.0, '#181a1d', x, 5.46, 0, 6).rotateX(Math.PI/2)) }
      break
    }
    case 'l9fieldgate': {
      for (const z of [-1.7,1.7]) grp.add(box(.15, 1.35, .15, '#4c3828', 0, .68, z))
      for (const y of [.36,.78,1.18]) grp.add(l9PbrBox(.12, .1, 3.25, 'l9_furniture_wood', '#8a694a', '#684a31', '#332419', .8, .72, .12, .46, 0, y, 0))
      if (s.data?.deg !== undefined) grp.rotation.y = Number(s.data.deg) * Math.PI / 180
      break
    }
    case 'l9leafpile': {
      const rr = mulberry(s.x * 97 + s.y * 31); const cs = ['#5f3d24','#79502b','#493727','#786044']
      for (let i=0;i<18;i++) { const leaf=box(.18+rr()*.25,.018,.08+rr()*.12,cs[i%cs.length],(rr()-.5)*1.5,.02+rr()*.09,(rr()-.5)*.7); leaf.rotation.y=rr()*Math.PI; grp.add(leaf) }
      break
    }
    case 'l9trashbag': {
      const n = Number(s.data?.count ?? 2); for(let i=0;i<n;i++){const bag=new THREE.Mesh(new THREE.DodecahedronGeometry(.28+i*.03,0),new THREE.MeshLambertMaterial({color:i%2?'#17191b':'#25272a'}));bag.scale.set(.9,1.25,.85);bag.position.set((i-(n-1)/2)*.33,.33,(i%2)*.12);grp.add(bag);grp.add(cyl(.045,.02,.12,'#2d3032',bag.position.x,.68,bag.position.z,6))}
      break
    }
    case 'l9tree': {
      const style = Number(s.data?.style ?? 0) % 5, sc = Number(s.data?.scale ?? 100) / 100
      const trunk = ['#4c392b','#44352a','#56402d','#3e332b','#514235'][style]
      const leaf = [['#263a2d','#344b35'],['#3b432c','#51563a'],['#2b3f38','#36534b'],['#443b2b','#5b4a30'],['#25342a','#314632']][style]
      grp.add(cyl(.17,.25,3.5,trunk,0,1.75,0,10))
      for (const [ry,rz,rr] of [[2.1,-.35,-.65],[2.45,.28,.72],[2.78,-.12,-.5]] as const) {
        const branch=cyl(.055,.1,1.4,trunk,0,ry,rz,7); branch.rotation.z=rr; grp.add(branch)
      }
      const crowns: [number,number,number,number][] = [[0,3.65,0,1.05],[-.7,3.35,.12,.76],[.68,3.45,-.2,.82],[.15,4.32,.08,.72],[-.2,3.72,.68,.7]]
      for (let i=0;i<crowns.length;i++){const [x,y,z,r]=crowns[i];const crown=new THREE.Mesh(new THREE.DodecahedronGeometry(r,1),new THREE.MeshLambertMaterial({color:leaf[i%2]}));crown.position.set(x,y,z);crown.scale.set(1.18,.86,1.05);grp.add(crown)}
      grp.scale.setScalar(sc)
      break
    }
    case 'l9shrub': {
      const style=Number(s.data?.style??0)%4, sc=Number(s.data?.scale??100)/100
      const colors=[['#31412f','#42543a'],['#3c442f','#515a3b'],['#273b34','#395047'],['#443b2d','#584a34']][style]
      for(const [x,y,z,r,c] of [[-.28,.34,0,.42,0],[.24,.37,.08,.48,1],[0,.47,-.23,.43,0]] as const){const bush=new THREE.Mesh(new THREE.DodecahedronGeometry(r,1),new THREE.MeshLambertMaterial({color:colors[c]}));bush.position.set(x,y,z);bush.scale.set(1.15,.82,1);grp.add(bush)}
      grp.add(cyl(.035,.06,.48,'#4b3929',0,.24,0,7)); grp.scale.setScalar(sc)
      break
    }
    case 'l9watchsign': {
      // 反光但不自发光的铝制牌；只有路灯或手电照到时，巨眼与文字才会完整显现。
      grp.add(cyl(.045, .065, 2.65, '#4b4f50', 0, 1.325, 0, 8))
      // 牌板安装在立杆前方并留出间隙。旧版两者共面相交，合批后立杆会穿出
      // 正面，正好遮住警告图案中央。
      const boardZ = .09
      grp.add(box(.78, 1.05, .055, '#d4d3cc', 0, 2.16, boardZ))
      const face = new THREE.Mesh(new THREE.PlaneGeometry(.72, .96), new THREE.MeshStandardMaterial({
        map: l9WatchSignTexture(), color: '#ffffff', roughness: .46, metalness: .08, side: THREE.DoubleSide,
      }))
      face.position.set(0, 2.16, boardZ + .031); grp.add(face)
      for (const y of [1.84, 2.48]) {
        const bolt = cyl(.018, .018, .025, '#73797b', 0, y, boardZ + .048, 8); bolt.rotation.x = Math.PI / 2; grp.add(bolt)
      }
      grp.rotation.y = Number(s.data?.deg ?? 0) * Math.PI / 180
      grp.rotation.z = (Number(s.data?.style ?? 0) - 1) * .014
      break
    }
    case 'l9directionsign': {
      // 多块有真实厚度的旧木箭头围绕同一根柱，各自朝向不同的黑暗街区。
      const wood = l9PbrMaterial('l9_furniture_wood', '#7e6448', '#8e765c', '#493a2d', .78, .1, .52)
      grp.add(cyl(.09, .13, 3.25, '#4c3828', 0, 1.625, 0, 9))
      const count = 6 + (Number(s.data?.style ?? 0) & 1)
      for (let i = 0; i < count; i++) {
        const board = new THREE.Group()
        const flip = i % 3 === 1
        const sh = new THREE.Shape()
        sh.moveTo(-.66, -.13); sh.lineTo(.42, -.13); sh.lineTo(.72, 0)
        sh.lineTo(.42, .13); sh.lineTo(-.66, .13); sh.closePath()
        const plank = new THREE.Mesh(new THREE.ExtrudeGeometry(sh, {
          depth: .065, bevelEnabled: true, bevelSegments: 1, bevelSize: .012, bevelThickness: .012,
        }), wood)
        plank.scale.x = flip ? -1 : 1; board.add(plank)
        const nail = cyl(.018, .018, .082, '#55595a', flip ? .38 : -.38, 0, .08, 8)
        nail.rotation.x = Math.PI / 2; board.add(nail)
        board.position.y = 1.05 + i * .31
        board.rotation.y = (i * 1.73 + Number(s.data?.style ?? 0) * .47) % (Math.PI * 2)
        board.rotation.z = ((i % 3) - 1) * .045
        grp.add(board)
      }
      grp.rotation.y = Number(s.data?.deg ?? 0) * Math.PI / 180
      break
    }
    case 'arrowsign': {
      // 第九大道最后一块路牌：更宽的城市道路从牌后消失在灰蓝天际。
      grp.add(cyl(.075, .09, 2.45, '#62686b', -.42, 1.22, 0, 10))
      grp.add(cyl(.075, .09, 2.45, '#62686b', .42, 1.22, 0, 10))
      grp.add(box(2.15, .74, .11, '#263b34', 0, 2.05, 0))
      const panel = new THREE.Mesh(new THREE.PlaneGeometry(2.02, .62), new THREE.MeshBasicMaterial({ map: signTexture('LEVEL 11  →', false), side: THREE.DoubleSide }))
      panel.position.set(0, 2.05, .061); grp.add(panel)
      const road = new THREE.Mesh(new THREE.PlaneGeometry(4.4, 7.5), l9PbrMaterial('l9_asphalt', '#778087', '#3a3e43', '#202328', .52, .28, .55))
      road.rotation.x = -Math.PI / 2; road.position.set(0, .012, 3.2); grp.add(road)
      for (const x of [-1.82,1.82]) for (let z=.2;z<6.8;z+=1.2) grp.add(box(.08,.04,.62,'#a8a99e',x,.035,z))
      break
    }
    case 'grasspath': {
      const path = new THREE.Mesh(new THREE.PlaneGeometry(1.65, 6.8), l9PbrMaterial('l9_path', '#c7b18c', '#6f5a3d', '#3b3025', .99, .018, .75))
      path.rotation.x = -Math.PI/2; path.position.set(0,.025,2.9); grp.add(path)
      for (const x of [-1.1,1.1]) for(let z=0;z<6;z+=.65){const tuft=box(.06,.22+.12*Math.sin(z),.04,'#495038',x+.12*Math.sin(z*3),.12,z);tuft.rotation.z=x*.16;grp.add(tuft)}
      grp.add(box(1.4,.42,.08,'#6c5539',0,1.55,.25)); grp.add(cyl(.055,.07,1.55,'#4b3828',-.55,.77,.25,8)); grp.add(cyl(.055,.07,1.55,'#4b3828',.55,.77,.25,8))
      break
    }
    case 'l9caveback': {
      // 从郊区回看 Level 8：洞口嵌进贴地石丘，不再由一圈石头悬浮在道路尽头。
      const rr=mulberry(9098), rock=caveRockMaterial('phreatic',.9)
      const mound=new THREE.Mesh(new THREE.SphereGeometry(2.9,24,12,0,Math.PI*2,0,Math.PI/2),rock)
      mound.scale.set(1.15,1,.66);mound.position.set(0,-.06,-1.72);mound.rotation.y=.18;grp.add(mound)
      // 两翼与丘脚用不规则巨石把球面轮廓打散，并保证视觉上真正接触草地/路肩。
      for(let i=0;i<22;i++){
        const a=(i/21)*Math.PI
        const x=Math.cos(a)*2.65+(rr()-.5)*.34
        const y=.16+Math.sin(a)*1.15+rr()*.35
        const st=new THREE.Mesh(new THREE.DodecahedronGeometry(.28+rr()*.34,1),rock)
        st.position.set(x,y,-.35-rr()*.7);st.scale.set(.9+rr()*.8,.55+rr()*.65,.8+rr()*.75);st.rotation.set(rr()*2,rr()*2,rr()*2);grp.add(st)
      }
      const cave = new THREE.Mesh(new THREE.CircleGeometry(1.02, 32), new THREE.MeshBasicMaterial({ color: '#131b1c', side: THREE.DoubleSide }))
      cave.scale.set(1.18, 1.35, 1); cave.position.set(0,1.35,.18); grp.add(cave)
      for(let i=0;i<19;i++){const a=i/19*Math.PI*2;const st=new THREE.Mesh(new THREE.DodecahedronGeometry(.19+rr()*.22,1),rock);st.position.set(Math.cos(a)*1.28,1.35+Math.sin(a)*1.42,0);st.scale.set(.8+rr()*.7,.65+rr()*.65,.7+rr()*.6);st.rotation.set(rr()*2,rr()*2,rr()*2);grp.add(st)}
      const damp=new THREE.Mesh(new THREE.PlaneGeometry(1.55,2.8),new THREE.MeshBasicMaterial({color:'#29434a',transparent:true,opacity:.22,blending:THREE.AdditiveBlending,depthWrite:false}));damp.position.set(0,1.34,.2);grp.add(damp)
      break
    }
    case 'ninthroad': {
      // 第九大道尽头收束成嵌在岩层中的狭窄天然洞口；洞内直接显示 Level 9
      // 午夜郊区的湿路、住宅和残亮路灯，不再用纯黑圆片遮挡。
      const preview = new THREE.Mesh(
        new THREE.CircleGeometry(1, 40),
        new THREE.MeshBasicMaterial({ map: l9CavePreviewTexture(), color: '#bdc9d0', side: THREE.DoubleSide, fog: true }),
      )
      preview.scale.set(1.34, 1.3, 1); preview.position.set(0, 1.47, 0.14); grp.add(preview)
      const rr = mulberry(9008)
      const rock = caveRockMaterial('phreatic', 0.96)
      for (let i = 0; i < 20; i++) {
        const a = i / 20 * Math.PI * 2
        const radius = 0.19 + rr() * 0.26
        const stone = new THREE.Mesh(new THREE.DodecahedronGeometry(radius, 1), rock)
        stone.position.set(Math.cos(a) * 1.53, 1.47 + Math.sin(a) * 1.42, 0)
        stone.scale.set(0.85 + rr() * 0.8, 0.62 + rr() * 0.75, 0.72 + rr() * 0.9)
        stone.rotation.set(rr() * Math.PI, rr() * Math.PI, rr() * Math.PI)
        grp.add(stone)
      }
      // 路标贴着洞颈左壁设置，不侵占中央可通行宽度。
      grp.add(cyl(0.04, 0.05, 1.42, '#6e6961', -1.15, 0.71, 0.2, 8))
      grp.add(box(0.72, 0.36, 0.07, '#d8d2c4', -1.15, 1.22, 0.2))
      const mark = megEmblem(0.13, '#263f5b'); mark.position.set(-1.35, 1.22, 0.241); grp.add(mark)
      break
    }
    case 'l8vent': {
      // 罗特尼斯大丛林天顶通风口：顶端法兰嵌入真实洞顶，下方是一截短方管。
      // 模型顶面固定为 2.42m，renderer 会将它精确对齐 caveCeilingAt。
      const rust = litMaterial({ color: '#493428', roughness: 0.88, metalness: 0.5, envBase: 0.18 })
      const rustDark = litMaterial({ color: '#2b211c', roughness: 0.94, metalness: 0.38, envBase: 0.1 })
      const metalBox = (w: number, h: number, d: number, mat: THREE.Material, x: number, y: number, z: number) => {
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat)
        mesh.position.set(x, y, z); grp.add(mesh); return mesh
      }
      // 岩面下的四边法兰（中央真正中空，不再用整块方盒伪装洞口）。
      metalBox(1.44, 0.08, 0.16, rustDark, 0, 2.38, -0.64)
      metalBox(1.44, 0.08, 0.16, rustDark, 0, 2.38, 0.64)
      metalBox(0.16, 0.08, 1.12, rustDark, -0.64, 2.38, 0)
      metalBox(0.16, 0.08, 1.12, rustDark, 0.64, 2.38, 0)
      // 0.68m 短方管，内径约 1.02m，外壁深浅交替表现锈蚀钣接钢板。
      metalBox(0.09, 0.68, 1.08, rust, -0.555, 2.04, 0)
      metalBox(0.09, 0.68, 1.08, rust, 0.555, 2.04, 0)
      metalBox(1.02, 0.68, 0.09, rustDark, 0, 2.04, -0.555)
      metalBox(1.02, 0.68, 0.09, rust, 0, 2.04, 0.555)
      // 两道外露加强箍使方管不像四块悬空板。
      for (const yy of [1.77, 2.29]) {
        metalBox(1.2, 0.045, 0.055, rustDark, 0, yy, -0.59)
        metalBox(1.2, 0.045, 0.055, rustDark, 0, yy, 0.59)
        metalBox(0.055, 0.045, 1.08, rustDark, -0.59, yy, 0)
        metalBox(0.055, 0.045, 1.08, rustDark, 0.59, yy, 0)
      }
      const hole = new THREE.Mesh(new THREE.PlaneGeometry(1.02, 1.02), new THREE.MeshBasicMaterial({ color: '#010306', side: THREE.DoubleSide }))
      hole.rotation.x = Math.PI / 2; hole.position.y = 1.685; grp.add(hole)
      for (let i = -2; i <= 2; i++) {
        metalBox(0.05, 0.045, 1.02, i % 2 ? rust : rustDark, i * 0.2, 1.655, 0)
        metalBox(1.02, 0.045, 0.05, i % 2 ? rustDark : rust, 0, 1.65, i * 0.2)
      }
      for (let i = 0; i < 5; i++) {
        const cap = new THREE.Mesh(new THREE.SphereGeometry(0.09, 7, 4, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshBasicMaterial({ color: i % 2 ? '#66e0d0' : '#c8e066' }))
        cap.position.set(-0.52 + i * 0.26, 1.62, i % 2 ? 0.59 : -0.59); grp.add(cap)
      }
      break
    }
    case 'tarpool': {
      const tar = new THREE.Mesh(new THREE.CircleGeometry(0.86, 24), new THREE.MeshLambertMaterial({ color: '#090809', emissive: '#2a0d04', emissiveIntensity: 0.35, side: THREE.DoubleSide }))
      tar.rotation.x = -Math.PI / 2; tar.position.y = 0.035; tar.scale.set(1.3, 0.82, 1); grp.add(tar)
      const rim = new THREE.Mesh(new THREE.TorusGeometry(0.82, 0.12, 7, 22), new THREE.MeshLambertMaterial({ color: '#493b32' }))
      rim.rotation.x = -Math.PI / 2; rim.position.y = 0.07; rim.scale.set(1.3, 0.82, 1); grp.add(rim)
      for (const [x, z, h] of [[-0.28, 0.05, 0.72], [0.3, -0.18, 0.5]] as const) {
        const arm = cyl(0.05, 0.09, h, '#0a090a', x, h / 2, z, 7); arm.rotation.z = x * 0.8; grp.add(arm)
      }
      break
    }
    case 'ceilclip': {
      // 看似与普通岩层一致、却以不自然频率明灭的天顶裂隙。
      for (let i = 0; i < 5; i++) {
        const slit = new THREE.Mesh(new THREE.PlaneGeometry(0.12 + i * 0.08, 0.035), strobeMat(i * 0.77, 0.09))
        slit.rotation.x = Math.PI / 2; slit.rotation.z = -0.65 + i * 0.31; slit.position.set((i - 2) * 0.17, 2.42 + (i % 2) * 0.035, (i % 3 - 1) * 0.16); grp.add(slit)
      }
      break
    }
    case 'notexit': {
      // v57t：深水中漂浮的门（→ Level 4）——锈蚀门框 + 虚掩门板 + 白底黑字「不是出口」标牌 + 门缝冷光。
      const rust = '#3f2a1c', rustD = '#221510'
      grp.add(box(0.12, 2.42, 0.16, rustD, -0.56, 1.21, 0))
      grp.add(box(0.12, 2.42, 0.16, rustD, 0.56, 1.21, 0))
      grp.add(box(1.24, 0.12, 0.16, rustD, 0, 2.44, 0))
      const panel = box(0.92, 2.18, 0.06, rust)
      panel.geometry.translate(0.42, 0, 0)
      panel.position.set(-0.42, 1.1, -0.04)
      panel.rotation.y = 0.34
      grp.add(panel)
      const behind = new THREE.Mesh(new THREE.PlaneGeometry(0.86, 2.1), new THREE.MeshBasicMaterial({ color: '#020507', side: THREE.DoubleSide }))
      behind.position.set(0, 1.1, -0.14)
      grp.add(behind)
      const slit = new THREE.Mesh(new THREE.PlaneGeometry(0.07, 2.02), pulseMat())
      slit.position.set(-0.4, 1.08, -0.11)
      slit.rotation.y = 0.34
      grp.add(slit)
      const sign = new THREE.Mesh(
        new THREE.PlaneGeometry(0.66, 0.2),
        new THREE.MeshBasicMaterial({ map: signTexture('不是出口', false), transparent: true }),
      )
      sign.position.set(0, 1.72, 0.1)
      grp.add(sign)
      const sign2 = sign.clone()
      sign2.rotation.y = Math.PI
      sign2.position.z = -0.1
      grp.add(sign2)
      for (const q of [[-0.62, 0.62], [0.62, 0.62]] as const) {
        const buoy = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.34, 8), new THREE.MeshLambertMaterial({ color: '#6e3520' }))
        buoy.position.set(q[0], 2.62, q[1])
        grp.add(buoy)
      }
      grp.rotation.z = 0.045
      grp.rotation.y = -0.18
      grp.userData.bob = { amp: 0.16, phase: 1.7 } // renderer 按正弦让整扇门在水中缓慢漂浮
      break
    }
    case 'littledoor': {
      // v58：「小小的谎言」（→ Level 9）——圆形石台表面镶嵌的木门：门扇平躺在台面凹槽里，
      // 深色门缝 + 铜环拉手；台下隐约积水反光。交互即俯身穿门而入。
      const wood = '#6e4f2e', woodD = '#4a3520', brass = '#a8863c'
      // 门框（石台表面凸起一圈门框线）
      grp.add(box(1.06, 0.1, 0.12, woodD, 0, 0.05, -0.62))
      grp.add(box(1.06, 0.1, 0.12, woodD, 0, 0.05, 0.62))
      grp.add(box(0.12, 0.1, 1.12, woodD, -0.53, 0.05, 0))
      grp.add(box(0.12, 0.1, 1.12, woodD, 0.53, 0.05, 0))
      // 门板（三条拼板 + 横向榫条，板缝微沉）
      for (let i = 0; i < 3; i++) grp.add(box(0.3, 0.07, 1.12, i === 1 ? '#75562f' : wood, -0.32 + i * 0.32, 0.035, 0))
      grp.add(box(0.96, 0.05, 0.14, woodD, 0, 0.075, -0.34))
      grp.add(box(0.96, 0.05, 0.14, woodD, 0, 0.075, 0.34))
      // 铜环拉手（门环 + 底座）
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.018, 6, 14), new THREE.MeshLambertMaterial({ color: brass }))
      ring.rotation.x = -Math.PI / 2
      ring.position.set(0.26, 0.1, 0)
      grp.add(ring)
      grp.add(box(0.09, 0.05, 0.09, brass, 0.26, 0.09, 0))
      // 门缝一线幽暗（表示门下另有空间）
      grp.add(box(0.9, 0.012, 0.05, '#02060a', 0, 0.078, 0))
      break
    }
    default: {
      // 门框 + 发光门缝
      grp.add(box(0.15, 2.3, 0.4, def.palette.wallTop, -0.65, 1.15, 0))
      grp.add(box(0.15, 2.3, 0.4, def.palette.wallTop, 0.65, 1.15, 0))
      grp.add(box(1.45, 0.18, 0.4, def.palette.wallTop, 0, 2.35, 0))
      const slit = new THREE.Mesh(new THREE.BoxGeometry(1.15, 2.15, 0.06), pulseMat())
      slit.position.set(0, 1.08, -0.05)
      grp.add(slit)
      break
    }
  }
  return grp
}
