// Dynamic volumetric skies; Worker bitmaps remain the stable reflection source.
import * as THREE from 'three'
import type { GameMap } from '../world/mapgen'
import type { LevelDef } from '../core/types'
import { SKY_PROFILES, rngFrom, smoothstep, D2R } from './skyPixels'
import { skyTexture } from './skyTextureCache'
import { SkySystem } from './skySystem'
export { SKY_PROFILES } from './skyPixels'
export type { SkyProfile } from './skyPixels'
export { skyTexture } from './skyTextureCache'
/** 天空盒网格：完整球面，BackSide + fog:false + depthWrite:false。
 *  半径恒定 42 < 相机 far 60——旧版按地图外包取半径（大地图 r≈80+），球面超出远平面
 *  被裁剪，与相机等距的球壳交界在视野里形成一个巨大黑色圆盖；改小后由 renderer
 *  每帧把球心移到玩家头顶（大气无视差，跟随即无限天空），任意尺寸地图均不再被裁。 */
export function makeSkyMesh(_m: GameMap, def: LevelDef): THREE.Mesh | null {
  const prof = SKY_PROFILES[def.id]
  if (!prof) return null
  // v65：所有户外层级统一走「天空底色 + 时间切片体积云全景」系统（见 skySystem.ts）。
  const sky = new SkySystem(def.id, skyLightDir(def.id))
  // 环境反射探针仍使用 Worker 预烘的等距柱状天空（静态、低频，足够做 PBR 反射）；
  // L9~L11 一直使用调色渐变探针，保持不变。
  if (def.id !== 9 && def.id !== 10 && def.id !== 11) sky.mesh.material && ((sky.mesh.material as THREE.Material).userData.skyTexture = skyTexture(def.id))
  return sky.mesh
}

/** 日/月光照方向（世界单位向量），与天空盒上的光源方位一致 */
export function skyLightDir(defId: number): THREE.Vector3 {
  const p = SKY_PROFILES[defId]
  const body = p?.moon ?? p?.sun
  if (!body) return new THREE.Vector3(0, 1, 0)
  // three 球体 u→世界方位为 az_world = 180° - u·360°（x 取 -cos）：贴图上的天体方位需镜像还原
  const az = ((180 - body.az) * Math.PI) / 180
  const elv = (body.elv * Math.PI) / 180
  return new THREE.Vector3(Math.cos(az) * Math.cos(elv), Math.sin(elv), Math.sin(az) * Math.cos(elv))
}

// ---------- v58：L7 蜃楼船队——巨大迷雾中若隐若现、永远无法靠近的幽灵船 ----------
// 立体低模（无灯）：挤出侧影船体 + 盒式上层建筑 + 细柱桅杆/吊杆；Lambert 受光取层级环境光，
// fog:false（雾远 27m 下真雾会把它完全吞没，蜃楼的"雾中感"由半透明、雾幕与随机显隐承担）。
// 每帧以玩家为锚重新摆放到固定方位/距离（~38m），所以朝它游多久都不会变近——海市蜃楼。
// 显隐节奏：120s 一周期，窗口起点/长度按（船,周期）哈希随机，占空 ~15~38%——大部分时间看不见；
// 每艘船前方挂一片缓慢漂流的软雾幕，让船始终像被真实迷雾笼盖着。
export interface MirageShip {
  grp: THREE.Group; veil: THREE.Mesh; az: number; dist: number; phase: number; seed: number; baseY: number
  mat: THREE.MeshLambertMaterial; veilMat: THREE.MeshBasicMaterial
}
export interface MirageFleet { group: THREE.Group; ships: MirageShip[] }

/** 软雾团贴图（船前流动雾幕）：径向渐隐白斑，水平略拉伸 */
let mistBlobTex: THREE.CanvasTexture | null = null
function mistBlobTexture(): THREE.CanvasTexture {
  if (mistBlobTex) return mistBlobTex
  const S = 128
  const c = document.createElement('canvas')
  c.width = c.height = S
  const ctx = c.getContext('2d')!
  ctx.translate(S / 2, S / 2)
  ctx.scale(1, 0.62) // 水平拉伸的雾团
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, S / 2)
  g.addColorStop(0, 'rgba(255,255,255,0.8)')
  g.addColorStop(0.42, 'rgba(255,255,255,0.34)')
  g.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = g
  ctx.fillRect(-S / 2, -S / 2, S, S * 2)
  mistBlobTex = new THREE.CanvasTexture(c)
  mistBlobTex.colorSpace = THREE.SRGBColorSpace
  return mistBlobTex
}

/** 低模幽灵船：variant 0=带吊杆的货轮 / 1=高艏油轮；全部件共享同一材质（统一透明度呼吸） */
function lowPolyShip(variant: number, mat: THREE.Material): THREE.Group {
  const g = new THREE.Group()
  const add = (geo: THREE.BufferGeometry, x: number, y: number, z: number, rz = 0) => {
    const mesh = new THREE.Mesh(geo, mat)
    mesh.position.set(x, y, z)
    if (rz) mesh.rotation.z = rz
    g.add(mesh)
    return mesh
  }
  if (variant === 0) {
    // 货轮：长甲板 + 艏楼微翘 + 中部三层退台上层建筑 + 前后桅与 V 形吊杆
    const hull = new THREE.Shape()
    hull.moveTo(-16, -1.2)   // 艉底
    hull.lineTo(-16, 2.2)    // 艉部甲板
    hull.lineTo(11.5, 2.2)   // 主甲板
    hull.lineTo(15.5, 3.4)   // 艏楼抬升
    hull.lineTo(17.2, 0.8)   // 艏柱
    hull.lineTo(14.5, -1.2)  // 艏底
    hull.closePath()
    const hullGeo = new THREE.ExtrudeGeometry(hull, { depth: 4.4, bevelEnabled: false })
    hullGeo.translate(0, 0, -2.2)
    add(hullGeo, 0, 0, 0)
    add(new THREE.BoxGeometry(7.5, 1.8, 4.0), -4.5, 3.1, 0)  // 桥楼一层
    add(new THREE.BoxGeometry(5.2, 1.6, 3.4), -4.9, 4.8, 0)  // 二层
    add(new THREE.BoxGeometry(3.2, 1.5, 2.8), -5.2, 6.3, 0)  // 驾驶台
    const mast = new THREE.CylinderGeometry(0.09, 0.13, 7.5, 5)
    add(mast, -5.2, 10.8, 0)                                  // 主桅（驾台之上）
    add(new THREE.CylinderGeometry(0.05, 0.07, 6.5, 4), -7.6, 9.6, 0, 0.72)   // 吊杆·艉向
    add(new THREE.CylinderGeometry(0.05, 0.07, 6.5, 4), -2.6, 9.6, 0, -0.72)  // 吊杆·艏向
    add(new THREE.CylinderGeometry(0.08, 0.11, 6.5, 5), 7.5, 5.4, 0)          // 前桅
    add(new THREE.CylinderGeometry(0.05, 0.06, 5.5, 4), 9.3, 5.0, 0, -0.6)    // 前桅吊杆
  } else {
    // 油轮：高艏楼 + 低平管线甲板 + 艉部桥楼 + 烟囱 + 艏艉桅
    const hull = new THREE.Shape()
    hull.moveTo(-17, -1.2)
    hull.lineTo(-17, 2.4)
    hull.lineTo(11, 2.4)
    hull.lineTo(15.5, 4.4)   // 高艏楼
    hull.lineTo(17.8, 1.2)
    hull.lineTo(15, -1.2)
    hull.closePath()
    const hullGeo = new THREE.ExtrudeGeometry(hull, { depth: 4.8, bevelEnabled: false })
    hullGeo.translate(0, 0, -2.4)
    add(hullGeo, 0, 0, 0)
    add(new THREE.BoxGeometry(8.5, 2.0, 4.4), -11.5, 3.4, 0) // 艉桥楼
    add(new THREE.BoxGeometry(6.2, 1.7, 3.8), -11.9, 5.2, 0)
    add(new THREE.BoxGeometry(4.0, 1.5, 3.2), -12.2, 6.8, 0)
    add(new THREE.BoxGeometry(2.0, 2.6, 2.2), -7.6, 3.7, 0)  // 烟囱
    add(new THREE.CylinderGeometry(0.08, 0.11, 6.5, 5), -12.2, 10.4, 0) // 后桅
    add(new THREE.CylinderGeometry(0.06, 0.09, 5.0, 5), 15.2, 6.4, 0)   // 艏旗杆
    // 管线甲板纵梁
    add(new THREE.BoxGeometry(24, 0.5, 0.9), -1, 2.8, 0)
  }
  return g
}

/** 生成蜃楼船队（3 艘，方位/体量固定，各挂一片流动雾幕）；无 mirages 配置的层级返回 null */
export function makeMirageFleet(defId: number): MirageFleet | null {
  if (!SKY_PROFILES[defId]?.mirages) return null
  const group = new THREE.Group()
  group.name = 'mirageFleet'
  const ships: MirageShip[] = []
  const defs = [
    { az: 36, dist: 38, v: 0 },
    { az: 164, dist: 40, v: 1 },
    { az: 289, dist: 39, v: 0 },
  ]
  defs.forEach((d, i) => {
    // 雾中鬼影：颜色大幅混入地平霾色（像隔着厚雾看），微自发光保证剪影可辨；
    // 不写深度避免自身部件互相遮挡出内缝
    const mat = new THREE.MeshLambertMaterial({
      color: '#43555f', emissive: '#1b2730', transparent: true, opacity: 0,
      fog: false, depthWrite: false, side: THREE.DoubleSide,
    })
    const grp = lowPolyShip(d.v, mat)
    grp.visible = false
    // 默认 renderOrder 0：透明按深度排序——船（远）先画、海面（近）后画，
    // 海水混色盖住水线以下的船体，幽灵船才是「浮」在雾里而不是贴在天上
    group.add(grp)
    // 船前流动雾幕：水平拉伸的软雾团，比船略大，缓慢横向漂过船体——迷雾笼盖
    const veilMat = new THREE.MeshBasicMaterial({
      map: mistBlobTexture(), color: '#66787f', transparent: true, opacity: 0,
      fog: false, depthWrite: false, side: THREE.DoubleSide,
    })
    const veil = new THREE.Mesh(new THREE.PlaneGeometry(52, 15), veilMat)
    group.add(veil)
    ships.push({ grp, veil, az: d.az, dist: d.dist, phase: i * 2.17 + d.v * 0.83, seed: 41 + i * 17 + d.v * 7, baseY: 0.25, mat, veilMat })
  })
  return { group, ships }
}

/**
 * 每帧更新蜃楼船队：以玩家为锚重新摆放到固定方位（缓慢游移 ±4.5°），永远无法靠近。
 * 显隐：120s 周期内按（船,周期）哈希随机开一扇 16~46s 的显现窗（带 7~13s 淡入淡出），
 * 占空约 15~38%——大部分时间完全隐没；雾幕即使船隐没也缓慢漂流（更淡），hideK=1（水下）全隐。
 */
export function updateMirageFleet(fleet: MirageFleet, t: number, camPos: THREE.Vector3, hideK: number, clarity = 0) {
  for (const s of fleet.ships) {
    // —— 随机慢频率显隐窗口（确定性：同船同周期恒定） ——
    const CYCLE = 120
    const lt0 = t + s.phase * 37.3
    const cyc = Math.floor(lt0 / CYCLE)
    const lt = lt0 - cyc * CYCLE
    const rnd = rngFrom((s.seed * 7919 + cyc * 131) >>> 0)
    const start = 14 + rnd() * 50
    const dur = 16 + rnd() * 30
    const fade = 7 + rnd() * 6
    let vis = smoothstep(start, start + fade, lt) * (1 - smoothstep(start + dur - fade, start + dur, lt))
    vis *= 0.85 + 0.15 * Math.sin(t * 0.11 + s.phase * 2.0) // 显现中的轻微呼吸
    // v66：比普综合症——远海停留越久，船显现得越频繁、越清晰（clarity 0..1）
    vis = Math.max(vis, clarity * clarity * 0.8 * (0.75 + 0.25 * Math.sin(t * 0.07 + s.phase)))
    // —— 方位/距离：以玩家为锚，永不靠近 ——
    const az = (s.az + Math.sin(t * 0.011 + s.phase * 3.1) * 4.5) * D2R
    const dist = s.dist + Math.sin(t * 0.017 + s.phase) * 2.5
    const g = s.grp
    g.position.set(camPos.x + Math.cos(az) * dist, s.baseY + Math.sin(t * 0.05 + s.phase * 2.0) * 0.22, camPos.z + Math.sin(az) * dist)
    g.lookAt(camPos.x, g.position.y, camPos.z) // 圆柱式朝向（始终舷侧对玩家，剪影完整）
    g.rotateZ(Math.sin(t * 0.043 + s.phase * 1.7) * 0.022) // 幽灵船般的缓慢横摇
    const op = vis * 0.34 * (1 + clarity * 1.3) * (1 - hideK)
    s.mat.opacity = op
    g.visible = op > 0.004
    // —— 雾幕：船前 3~5m 的软雾团，沿舷侧缓慢漂过；船隐没时雾幕仍在（更淡）——迷雾笼盖 ——
    const toCamX = camPos.x - g.position.x, toCamZ = camPos.z - g.position.z
    const toCamL = Math.hypot(toCamX, toCamZ) || 1
    const dirX = toCamX / toCamL, dirZ = toCamZ / toCamL
    const vd = 3.2 + Math.sin(t * 0.013 + s.phase * 5.3) * 1.4 // 船前距离漂移
    const vx = Math.sin(t * 0.021 + s.phase * 3.7) * 11 // 沿舷侧（垂直于视线）漂移
    const v = s.veil
    v.position.set(
      g.position.x + dirX * vd - dirZ * vx,
      s.baseY + 4.6 + Math.sin(t * 0.017 + s.phase * 4.1) * 1.2,
      g.position.z + dirZ * vd + dirX * vx,
    )
    v.lookAt(camPos.x, v.position.y, camPos.z)
    const veilPulse = 0.5 + 0.5 * Math.sin(t * 0.031 + s.phase * 6.1)
    s.veilMat.opacity = (0.07 + 0.13 * veilPulse + vis * 0.14) * (1 - clarity * 0.5) * (1 - hideK)
    v.visible = s.veilMat.opacity > 0.01
  }
}

