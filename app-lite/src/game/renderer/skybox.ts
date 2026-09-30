// Procedural skies use identical pixel generation in a background Worker.
import * as THREE from 'three'
import type { GameMap } from '../world/mapgen'
import type { LevelDef } from '../core/types'
import { SKY_PROFILES, rngFrom, smoothstep, D2R } from './skyPixels'
import { skyTexture } from './skyTextureCache'
export { SKY_PROFILES } from './skyPixels'
export type { SkyProfile } from './skyPixels'
export { skyTexture } from './skyTextureCache'
/** 天空盒网格：上半球（地平线以上），BackSide + fog:false + depthWrite:false。
 *  半径恒定 42 < 相机 far 60——旧版按地图外包取半径（大地图 r≈80+），球面超出远平面
 *  被裁剪，与相机等距的球壳交界在视野里形成一个巨大黑色圆盖；改小后由 renderer
 *  每帧把球心移到玩家头顶（大气无视差，跟随即无限天空），任意尺寸地图均不再被裁。 */
export function makeSkyMesh(m: GameMap, def: LevelDef): THREE.Mesh | null {
  const prof = SKY_PROFILES[def.id]
  if (!prof) return null
  if (def.id === 9 || def.id === 10 || def.id === 11) {
    // L9 使用完整球壳上的方向采样，并叠加两层连续三维噪声阴云。旧立方体即使按方向
    // 采样，低亮度时六个盒面和每面的三角对角线仍会被辨认成“贴图接缝”。
    const body = prof.moon
    const phi = body ? (body.az / 360 - .5) * Math.PI * 2 : 0
    const elv = body ? body.elv * Math.PI / 180 : Math.PI / 4
    const moonDir = new THREE.Vector3(Math.cos(phi) * Math.cos(elv), Math.sin(elv), Math.sin(phi) * Math.cos(elv))
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uBody: { value: def.id === 11 ? 0 : 1 },
        uMoonDir: { value: moonDir },
        uFarm: { value: def.id === 10 || def.id === 11 ? 1 : 0 },
        uFogMix: { value: 0 },
        uFogColor: { value: new THREE.Color('#697278') },
      },
      vertexShader: `
        varying vec3 vSkyDir;
        void main() {
          vSkyDir = normalize(position);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform float uTime;
        uniform float uBody;
        uniform float uFarm;
        uniform vec3 uMoonDir;
        uniform float uFogMix;
        uniform vec3 uFogColor;
        varying vec3 vSkyDir;
        float hash31(vec3 p) {
          p = fract(p * 0.1031);
          p += dot(p, p.yzx + 33.33);
          return fract((p.x + p.y) * p.z);
        }
        float noise3(vec3 p) {
          vec3 i = floor(p), f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          float n000 = hash31(i + vec3(0.0,0.0,0.0));
          float n100 = hash31(i + vec3(1.0,0.0,0.0));
          float n010 = hash31(i + vec3(0.0,1.0,0.0));
          float n110 = hash31(i + vec3(1.0,1.0,0.0));
          float n001 = hash31(i + vec3(0.0,0.0,1.0));
          float n101 = hash31(i + vec3(1.0,0.0,1.0));
          float n011 = hash31(i + vec3(0.0,1.0,1.0));
          float n111 = hash31(i + vec3(1.0,1.0,1.0));
          return mix(mix(mix(n000,n100,f.x),mix(n010,n110,f.x),f.y),
                     mix(mix(n001,n101,f.x),mix(n011,n111,f.x),f.y),f.z);
        }
        void main() {
          vec3 d = normalize(vSkyDir);
          // L9 不再读取 skyTexture(9) 的旧等距柱状画布。底色直接按真实仰角生成，
          // 地平线、低云与天顶之间没有任何图片边界或旧月盘残留。
          float height = clamp(d.y, 0.0, 1.0);
          float vertical = smoothstep(0.0, 0.82, pow(height, .62));
          vec3 horizonColor = mix(vec3(.066, .079, .088), vec3(.43, .46, .47), uFarm);
          vec3 zenithColor = mix(vec3(.012, .022, .032), vec3(.29, .32, .34), uFarm);
          vec3 sky = mix(horizonColor, zenithColor, vertical);
          sky += mix(vec3(.035, .039, .043), vec3(.10, .105, .105), uFarm) * exp(-height * 9.0);
          // 球面方向上的噪声没有经纬接缝；两层以不同速度/高度漂移，产生真实的云层视差。
          float upper = smoothstep(-0.04, 0.22, d.y);
          // 每像素只进行一次三维 value-noise；细节层用连续方向波补足，避免天空着色器
          // 在高分辨率下成为新的性能瓶颈。
          float slow = noise3(d * 3.8 + vec3(uTime * .005, .7, -uTime * .002));
          float fast = .5 + .5 * sin(d.x * 17.0 + sin(d.z * 11.0 - uTime * .013) + d.y * 8.0 + uTime * .009);
          float cloudField = slow * .74 + fast * .26;
          float cloud = mix(smoothstep(.35, .73, cloudField), smoothstep(.18, .58, cloudField), uFarm) * upper;
          vec3 cloudDark = mix(vec3(.055, .066, .074), vec3(.25, .28, .29), uFarm);
          vec3 cloudSilver = mix(vec3(.145, .158, .166), vec3(.52, .54, .54), uFarm);
          vec3 cloudColor = mix(cloudDark, cloudSilver, smoothstep(.35, .82, fast));

          // L9 月盘 / L10 云后太阳都按真实天空方向重建，不使用始终正对镜头的白色圆片。
          vec3 md = normalize(uMoonDir);
          vec3 mr = normalize(cross(vec3(0.0,1.0,0.0), md));
          vec3 mu = normalize(cross(md, mr));
          float moonRad = mix(.040, .052, uFarm);
          float moonDot = dot(d, md);
          vec2 mp = vec2(dot(d, mr), dot(d, mu)) / sin(moonRad);
          float disc = 1.0 - smoothstep(.91, 1.045, length(mp));
          float crater = .5;
          if (disc > .001) crater = noise3(vec3(mp * 3.6, 11.0));
          vec3 moonColor = mix(vec3(.56,.59,.62), vec3(.86,.88,.90), smoothstep(.24,.78,crater));
          vec3 sunColor = vec3(1.0, .965, .87);
          float moonHalo = pow(max(moonDot, 0.0), 170.0) * .2 + pow(max(moonDot, 0.0), 620.0) * .34;
          float sunHalo = pow(max(moonDot, 0.0), 38.0) * .23 + pow(max(moonDot, 0.0), 260.0) * .28;
          sky += mix(vec3(.43,.50,.57) * moonHalo, vec3(.78,.72,.60) * sunHalo, uFarm) * uBody;
          sky = mix(sky, mix(moonColor, sunColor, uFarm), disc * mix(.86, .38, uFarm) * uBody);
          // 阴云最后覆盖天体：L10 太阳会随云层厚度变成真实的漫射亮斑。
          sky = mix(sky, cloudColor, cloud * mix(.34 + .28 * slow, .62 + .24 * slow, uFarm));
          // 浓雾事件直接作用于天空本身；否则 fog:false 的远景会永远清晰地浮在雾墙后。
          float fk = smoothstep(0.02, 0.96, uFogMix);
          sky = mix(sky, uFogColor, fk);
          gl_FragColor = vec4(sky, 1.0);
        }
      `,
      side: THREE.BackSide,
      depthWrite: false,
      depthTest: true,
      fog: false,
    })
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(42, 64, 32), mat)
    mesh.name = 'skybox'
    mesh.renderOrder = -1000
    mesh.frustumCulled = false
    mesh.position.set(m.w / 2, 1.65, m.h / 2)
    return mesh
  }
  const geo = new THREE.SphereGeometry(42, 48, 24, 0, Math.PI * 2, 0, Math.PI / 2)
  const mat = new THREE.MeshBasicMaterial({ map: skyTexture(def.id), side: THREE.BackSide, fog: false, depthWrite: false })
  const mesh = new THREE.Mesh(geo, mat)
  mesh.name = 'skybox'
  mesh.position.set(m.w / 2, 5.5, m.h / 2)
  return mesh
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
export function updateMirageFleet(fleet: MirageFleet, t: number, camPos: THREE.Vector3, hideK: number) {
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
    // —— 方位/距离：以玩家为锚，永不靠近 ——
    const az = (s.az + Math.sin(t * 0.011 + s.phase * 3.1) * 4.5) * D2R
    const dist = s.dist + Math.sin(t * 0.017 + s.phase) * 2.5
    const g = s.grp
    g.position.set(camPos.x + Math.cos(az) * dist, s.baseY + Math.sin(t * 0.05 + s.phase * 2.0) * 0.22, camPos.z + Math.sin(az) * dist)
    g.lookAt(camPos.x, g.position.y, camPos.z) // 圆柱式朝向（始终舷侧对玩家，剪影完整）
    g.rotateZ(Math.sin(t * 0.043 + s.phase * 1.7) * 0.022) // 幽灵船般的缓慢横摇
    const op = vis * 0.34 * (1 - hideK)
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
    s.veilMat.opacity = (0.07 + 0.13 * veilPulse + vis * 0.14) * (1 - hideK)
    v.visible = s.veilMat.opacity > 0.01
  }
}

