// 室外天空盒/远景剪影 + 液体水面（深水泳池/浅水洼）
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { ELEV_H, type GameMap } from '../world/mapgen'
import type { LevelDef } from '../core/types'
import { col, SKY, litMaterial, noiseTexture } from './shared'
import { makeSkyMesh, SKY_PROFILES } from './skybox'

// v57t：真实水体——给水面材质注入「顶点涌浪 + 程序化波光」着色器；renderer 每帧推进统一时间。
// 不做真实流体物理：多组方向正弦波叠加出浪面法线（低频涌浪+高频碎波随距离淡出防混叠），
// 配合菲涅尔深水↔天空反射渐变、天光宽高光与细闪波光，视觉上接近真实海面。
const liquidWaveUniforms: { value: number }[] = []
export function updateLiquidTime(t: number) {
  for (const u of liquidWaveUniforms) u.value = t
}
export function resetLiquidWaves() { liquidWaveUniforms.length = 0 }
function addRealWaterFX(mat: THREE.Material, sea: boolean) {
  if (mat.userData.liquidWave) return
  mat.userData.liquidWave = 1
  const u = { value: 0 }
  liquidWaveUniforms.push(u)
  // 深海↔天空反射的配色：L7 海面取阴天灰蓝海，室内泳池取更暗的室内水光
  const deep = col(sea ? '#12262e' : '#101d24')
  const skyc = col(sea ? '#5d7683' : '#26333a')
  const body = col(sea ? '#0d303d' : '#0c2733') // v58：水体本色——视线穿水被吸收后呈现的暗青水色
  const c3 = (c: THREE.Color) => `vec3(${c.r.toFixed(4)}, ${c.g.toFixed(4)}, ${c.b.toFixed(4)})`
  const swellK = sea ? 1 : 0.05 // 顶点涌浪幅度：海面 ±0.15m 可见起伏；泳池仅微波纹防溢出池岸
  const normalAmp = sea ? 1.6 : 0.7 // 波面法线强度（艺术化夸大坡度，出碎浪明暗）
  const reflMix = sea ? 0.62 : 0.35 // 菲涅尔反射混入比（保留部分受光，手电照水面仍可见）
  const sheenK = sea ? 0.20 : 0.10 // 天光宽高光强度
  const glintK = sea ? 1.3 : 0.5 // 细闪波光强度
  const absorbSig = sea ? 0.25 : 0.4 // v58：水体吸收系数——海 24m+ 俯视即近全浓；泳池 1.7m 半浓见底
  mat.customProgramCacheKey = () => (sea ? 'realWaterSea' : 'realWaterPool')
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uLiquidTime = u
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uLiquidTime;\nattribute float aDepth;\nvarying vec3 vLiquidWorld;\nvarying float vDepth;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
      {
        vec4 lw4 = modelMatrix * vec4(position, 1.0);
        vLiquidWorld = lw4.xyz;
        vDepth = aDepth;
        float lt = uLiquidTime;
        // 多尺度涌浪位移（长波涌 + 短波碎），纯视觉，不参与物理
        float lh = sin(lw4.x * 0.21 + lt * 0.55) * 0.055
                 + cos((lw4.x + lw4.z) * 0.13 - lt * 0.38) * 0.05
                 + sin(lw4.z * 0.40 + lt * 0.85) * 0.028
                 + sin(lw4.x * 0.83 - lw4.z * 0.61 + lt * 1.45) * 0.016;
        transformed.y += lh * ${swellK.toFixed(3)};
      }`)
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
      uniform float uLiquidTime;
      varying vec3 vLiquidWorld;
      varying float vDepth;
      vec3 gLiquidN;
      // 方向正弦波叠加的解析梯度（h=Σa·sin(dot(d,p)+ωt) → ∇h=Σa·d·cos(...)）
      vec2 liquidGrad(vec2 lp, float lt, float hiK) {
        vec2 lg = vec2(0.0);
        lg += vec2(0.50, 0.0) * cos(lp.x * 0.50 + lt * 1.05) * 0.30;
        lg += vec2(0.36, 0.58) * cos(dot(lp, vec2(0.36, 0.58)) - lt * 0.80) * 0.26;
        lg += vec2(-0.66, 0.31) * cos(dot(lp, vec2(-0.66, 0.31)) + lt * 1.35) * 0.14;
        lg += vec2(1.25, -1.05) * cos(dot(lp, vec2(1.25, -1.05)) + lt * 2.10) * 0.075 * hiK;
        lg += vec2(2.45, 2.05) * cos(dot(lp, vec2(2.45, 2.05)) - lt * 2.90) * 0.045 * hiK;
        lg += vec2(4.10, -3.55) * cos(dot(lp, vec2(4.10, -3.55)) + lt * 4.10) * 0.028 * hiK;
        lg += vec2(-3.30, -4.35) * cos(dot(lp, vec2(-3.30, -4.35)) - lt * 3.60) * 0.022 * hiK;
        return lg;
      }`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
      {
        float lDist = distance(cameraPosition, vLiquidWorld);
        float hiK = 1.0 - smoothstep(10.0, 28.0, lDist);
        vec2 lg = liquidGrad(vLiquidWorld.xz, uLiquidTime, hiK) * ${normalAmp.toFixed(3)};
        vec3 wN = normalize(vec3(-lg.x, 1.0, -lg.y));
        gLiquidN = wN;
        vec3 vN = normalize((viewMatrix * vec4(wN, 0.0)).xyz);
        normal = normalize(mix(normal, vN, 0.85));
      }`)
      .replace('#include <opaque_fragment>', `#include <opaque_fragment>
      {
        vec3 V = normalize(vLiquidWorld - cameraPosition);
        // 菲涅尔：掠射角反射天空灰蓝，俯视透出深水暗色——浪面坡度带来自然明暗
        float ndv = clamp(dot(gLiquidN, -V), 0.0, 1.0);
        float fres = 0.10 + 0.90 * pow(1.0 - ndv, 2.4);
        gl_FragColor.rgb = mix(gl_FragColor.rgb, mix(${c3(deep)}, ${c3(skyc)}, fres), ${reflMix.toFixed(3)});
        // 天光宽高光：朝向天空的波面柔和发亮（阴天海面的漫射光泽）
        vec3 sheenH = normalize(vec3(0.0, 1.0, 0.0) - V);
        float sheen = pow(clamp(dot(gLiquidN, sheenH), 0.0, 1.0), 5.0);
        gl_FragColor.rgb += ${c3(skyc)} * sheen * ${sheenK.toFixed(3)};
        // 细闪波光：近处碎浪的紧凑高光闪点，随距离淡出
        vec3 glintH = normalize(normalize(vec3(0.35, 0.72, 0.28)) - V);
        float glint = pow(clamp(dot(gLiquidN, glintH), 0.0, 1.0), 240.0);
        float glintFade = 1.0 - smoothstep(8.0, 30.0, distance(cameraPosition, vLiquidWorld));
        gl_FragColor.rgb += vec3(0.85, 0.92, 0.97) * glint * ${glintK.toFixed(3)} * glintFade;
        // v58 水体吸收：视线穿水路径 = 水深 / 视角余弦——俯视深水水色浓重且近不透明
        // （呈暗色水体而非清晰透视水底），近岸浅滩/泳池保持清澈；掠射角让位菲涅尔反射；
        // 背面=水下仰视，仅轻微吸收保留透光（斯涅尔窗亮斑不被压黑）
        float pathK = vDepth / max(ndv, 0.25);
        float absorb = (1.0 - exp(-pathK * ${absorbSig.toFixed(3)})) * (gl_FrontFacing ? 1.0 : 0.15);
        gl_FragColor.rgb = mix(gl_FragColor.rgb, ${c3(body)}, absorb * 0.8 * (1.0 - fres * 0.85));
        gl_FragColor.a = clamp(max(gl_FragColor.a, max(absorb * 0.97, fres * fres * 0.8)), 0.0, 1.0);
      }`)
  }
}

export function buildSkyAndLiquids(m: GameMap, def: LevelDef, g: THREE.Group, realWater = false) {
// ---- v7 室外：天空盒 + 远景低模楼群剪影 + 泳池水面 ----
  // 洪泛分区找出各室外区域
  const seen = new Uint8Array(m.w * m.h)
  const regions: { cx: number; cz: number; r: number }[] = []
  for (let y = 0; y < m.h; y++) {
    for (let x = 0; x < m.w; x++) {
      const ii = y * m.w + x
      if (m.outdoor[ii] !== 1 || seen[ii]) continue
      let minX = x, maxX = x, minY = y, maxY = y, cnt = 0
      const q: [number, number][] = [[x, y]]
      seen[ii] = 1
      while (q.length) {
        const [qx, qy] = q.pop()!
        cnt++
        minX = Math.min(minX, qx); maxX = Math.max(maxX, qx)
        minY = Math.min(minY, qy); maxY = Math.max(maxY, qy)
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
          const nx = qx + dx, ny = qy + dy, ni = ny * m.w + nx
          if (nx < 0 || ny < 0 || nx >= m.w || ny >= m.h || seen[ni] || m.outdoor[ni] !== 1) continue
          seen[ni] = 1; q.push([nx, ny])
        }
      }
      if (cnt >= 4) regions.push({ cx: (minX + maxX + 1) / 2, cz: (minY + maxY + 1) / 2, r: Math.max(maxX - minX, maxY - minY) / 2 })
    }
  }
  const skyHex = SKY[def.id] ?? '#0a0a0c'
  // v11 修复：天空盒改为贴合整图外包（所有室外区共用一只）。
  // 旧版以各室外区为中心的 90×30×90 盒，盒面会切穿大堂/客房等室内空间
  // （如 L5 庭院盒西面 x=5 正好落在大堂内），盒面之外的室内墙面被整片涂成
  // 天空色——「藏青虚空立方体/大片区域虚空化」的根源；现盒面恒在地图边界之外，
  // 室内墙面不会再被天空覆盖，天空只经真正的室外开口（无天花板区/护墙上方）可见。
  if (regions.length) {
    // v35：有配置的层级用精致程序化天空盒（日月/星野/银河/分形云）；其余保持纯色盒回退
    const prof = SKY_PROFILES[def.id]
    const sky = makeSkyMesh(m, def) ?? new THREE.Mesh(
      new THREE.BoxGeometry(m.w + 20, 30, m.h + 20),
      new THREE.MeshBasicMaterial({ color: skyHex, side: THREE.BackSide, fog: false }),
    )
    if (!prof) sky.position.set(m.w / 2, 9, m.h / 2)
    g.add(sky)
  }
  for (const R of regions) {
    // 远景低模楼群剪影（确定性伪随机）
    // v11 修复：剪影楼群是无光纯色盒子，旧版环绕室外区全向摆放会落进客房/走廊等
    // 可通行区域，正面看是「藏青色实心立方体」、走入后因背面剔除才看到内部。
    // 现在逐个做瓦片 AABB 检测：包围盒（含 0.6m 余量）覆盖任何地板瓦片则丢弃。
    let sd = (Math.floor(R.cx * 131 + R.cz * 719) >>> 0) || 1
    const rnd = () => ((sd = (sd * 1664525 + 1013904223) >>> 0) / 4294967296)
    const silMat = new THREE.MeshBasicMaterial({ color: col(SKY_PROFILES[def.id]?.horizon ?? skyHex).multiplyScalar(0.45), fog: true })
    const silGeos: THREE.BufferGeometry[] = []
    const overlapsFloor = (cx: number, cz: number, hw: number, hd: number) => {
      const x0 = Math.max(0, Math.floor(cx - hw - 0.6)), x1 = Math.min(m.w - 1, Math.floor(cx + hw + 0.6))
      const y0 = Math.max(0, Math.floor(cz - hd - 0.6)), y1 = Math.min(m.h - 1, Math.floor(cz + hd + 0.6))
      for (let ty = y0; ty <= y1; ty++)
        for (let tx = x0; tx <= x1; tx++)
          if (m.tiles[ty * m.w + tx] === 1) return true
      return false
    }
    for (let n = 0; n < 16; n++) {
      const ang = rnd() * Math.PI * 2
      const dist = R.r + 9 + rnd() * 22
      const bw = 2.5 + rnd() * 5, bh = 4 + rnd() * 14, bd = 2.5 + rnd() * 5
      const cx = R.cx + Math.cos(ang) * dist, cz = R.cz + Math.sin(ang) * dist
      if (overlapsFloor(cx, cz, bw / 2, bd / 2)) continue
      const geo = new THREE.BoxGeometry(bw, bh, bd)
      geo.translate(cx, bh / 2 - 0.5, cz)
      silGeos.push(geo)
    }
    if (silGeos.length) g.add(new THREE.Mesh(mergeGeometries(silGeos)!, silMat))
  }
  // v13 液体水面（提取为独立函数：无限 chunk 也逐块调用；有限层全图调用一次）
  buildLiquidSurfaces(m, def, g, undefined, realWater)
}

export interface LiquidRange { x0: number; y0: number; x1: number; y1: number }
export function buildLiquidSurfaces(m: GameMap, def: LevelDef, g: THREE.Group, range?: LiquidRange, realWater = false) {
  const RX0 = range?.x0 ?? 0, RY0 = range?.y0 ?? 0
  const RX1 = range?.x1 ?? m.w, RY1 = range?.y1 ?? m.h
  // v13 液体水面：深水（泳池，可沉没游泳）+ 浅水洼（室内减速涟漪）
  const waterGeos: THREE.BufferGeometry[] = []
  const shallowGeos: THREE.BufferGeometry[] = []
  // v57t：真实水体下 L7 海面每瓦片 2×2 细分（0.5m 网格），顶点涌浪轮廓更平滑
  const seg = realWater && def.id === 7 ? 2 : 1
  for (let y = RY0; y < RY1; y++)
    for (let x = RX0; x < RX1; x++) {
      const ii = y * m.w + x
      if (m.tiles[ii] !== 1 || m.liquid[ii] === 0) continue
      const geo = new THREE.PlaneGeometry(1, 1, seg, seg)
      geo.rotateX(-Math.PI / 2)
      // v58：真实水体按瓦片烘焙水深顶点属性——着色器据此计算视线穿水路径的吸收（深水浓、浅滩清）
      const bakeDepth = (gg: THREE.PlaneGeometry) => {
        if (!realWater) return
        const d = Math.max(0.3, m.seaFloor[ii] || 1.7)
        gg.setAttribute('aDepth', new THREE.BufferAttribute(new Float32Array(gg.attributes.position.count).fill(d), 1))
      }
      if (m.liquid[ii] === 1) {
        geo.translate(x + 0.5, 0.03, y + 0.5) // 深水水面≈岸边地面
        bakeDepth(geo)
        waterGeos.push(geo)
      } else {
        geo.translate(x + 0.5, ELEV_H[m.elev[ii]] - 0.17, y + 0.5) // 浅水水面（洼底=所在高度档 -0.25；L7 入口房间高台湿毯）
        shallowGeos.push(geo)
        // v57m：L7 悬浮舱体下方是镂空的海面——同一瓦片在 0.03m 再铺一层海洋水面，
        // 从下方看舱底悬于海上；从舱内地板以上看它被地板遮挡。
        if (def.id === 7 && m.tint[ii] === 33) {
          const under = new THREE.PlaneGeometry(1, 1, seg, seg)
          under.rotateX(-Math.PI / 2)
          under.translate(x + 0.5, 0.03, y + 0.5)
          bakeDepth(under)
          waterGeos.push(under)
        }
      }
    }
  if (waterGeos.length) {
    g.add(new THREE.Mesh(
      mergeGeometries(waterGeos)!,
      // realistic：低粗糙度 + 强环境反射（物理反射真实天空）+ 噪声法线波光
      // v57m：L7 海面提高不透明度与自发光，修复纯黑/看不见水面，并作为普遍自然光来源
      (() => {
        const sea = def.id === 7
        // v57t：不使用任何水面贴图——纯色海面；真实水体改由着色器程序化生成浪面法线/反射/波光
        // v58：真实水体基础不透明度大幅降低（0.94→0.42）——透明感由着色器按穿水路径吸收重建：
        //      深水俯视呈暗色水体（非清晰透视），浅滩/泳池保持清澈
        const params = {
          color: sea ? '#1b5a76' : '#2a6fd8',
          transparent: true,
          opacity: realWater ? (sea ? 0.42 : 0.45) : (sea ? 0.94 : 0.66),
          emissive: sea ? '#0d2e3e' : '#10355e',
          side: THREE.DoubleSide,
          roughness: sea ? 0.08 : 0.12,
          metalness: 0.06,
          envBase: sea ? 0.95 : 0.9,
        } as THREE.MeshLambertMaterialParameters & { roughness?: number; metalness?: number; envBase?: number }
        if (!realWater) { // 真实水体的浪面法线由着色器程序化生成，不再叠噪声法线贴图
          params.normalMap = noiseTexture('#7a8a92', '#5a6a72')
          params.normalScale = new THREE.Vector2(sea ? 0.46 : 0.35, sea ? 0.46 : 0.35)
        }
        const mat = litMaterial(params)
        if (realWater) addRealWaterFX(mat, sea)
        return mat
      })(),
    ))
    // v58：水面只接收阴影、不投影——透明浪面不是遮光体；L7 海面 25 chunk 网格若参与投影，
    // 手电阴影贴图每次更新都要把整张海面再画一遍，持手电帧率骤降。
    const waterMesh = g.children[g.children.length - 1] as THREE.Mesh
    waterMesh.userData.noCastShadow = 1
  }
  if (shallowGeos.length) {
    g.add(new THREE.Mesh(
      mergeGeometries(shallowGeos)!,
      litMaterial({
        color: '#28424e', transparent: true, opacity: 0.55, emissive: '#0c1c24', side: THREE.DoubleSide,
        roughness: 0.15, metalness: 0.05, envBase: 0.7,
      }),
    ))
    ;(g.children[g.children.length - 1] as THREE.Mesh).userData.noCastShadow = 1 // v58：浅洼同理不投影
  }
}
