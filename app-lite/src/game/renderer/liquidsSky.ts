// 室外天空盒/远景剪影 + 液体水面（深水泳池/浅水洼）
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { ELEV_H, floorHeight, type GameMap } from '../world/mapgen'
import type { LevelDef } from '../core/types'
import { col, SKY, litMaterial } from './shared'
import { makeSkyMesh, SKY_PROFILES } from './skybox'
import { applyWater, updateWaterUniforms, type WaterPresetName } from './water'
import { L8_LAKE_CENTER, L8_LAKE_WATER_RADIUS, l8GroundAt, l8LakeDistanceAt } from '../world/infiniteL8'

// v57t：真实水体——给水面材质注入「顶点涌浪 + 程序化波光」着色器；renderer 每帧推进统一时间。
// 不做真实流体物理：多组方向正弦波叠加出浪面法线（低频涌浪+高频碎波随距离淡出防混叠），
// 配合菲涅尔深水↔天空反射渐变、天光宽高光与细闪波光，视觉上接近真实海面。
// v64：真实水体着色迁移到通用模块 water.ts（各层级按预设调参，低画质也保留光学深度/菲涅尔/软岸线）。
const liquidClock={value:0}
export function updateLiquidTime(t: number) {
  liquidClock.value=t
  updateWaterUniforms(t)
}
export function resetLiquidWaves() { /* v64：水面统一共享 waterUniforms，无需逐材质登记 */ }
/** Indoor ripples reflect actual lamps. No outdoor sky or per-chunk clock allocation. */
function addHotelWaterFX(mat:THREE.Material,ox:number,oy:number){
  const classic=mat instanceof THREE.MeshLambertMaterial
  mat.customProgramCacheKey=()=> 'l5-pool-water-'+classic
  mat.onBeforeCompile=shader=>{
    shader.uniforms.uPoolTime=liquidClock
    shader.uniforms.uPoolOrigin={value:new THREE.Vector2(ox,oy)}
    shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nuniform vec2 uPoolOrigin;\nvarying vec2 vPoolPoint;')
      .replace('#include <begin_vertex>',`#include <begin_vertex>\nvPoolPoint=position.xz+uPoolOrigin;`)
    shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nuniform float uPoolTime;\nvarying vec2 vPoolPoint;')
      .replace('#include <normal_fragment_maps>',classic?'#include <normal_fragment_maps>':`#include <normal_fragment_maps>
        vec2 q=vPoolPoint; float t=uPoolTime;
        vec2 slope=vec2(cos(q.x*3.1+q.y*1.2+t*.83),sin(q.y*3.7-q.x*.9-t*.63))*.035;
        slope+=vec2(cos(q.x*9.+q.y*6.-t*1.2),sin(q.y*8.-q.x*5.+t))* .012;
        normal=normalize((viewMatrix*vec4(-slope.x,1.,-slope.y,0.)).xyz);`)
      .replace('#include <opaque_fragment>',`#include <opaque_fragment>
        float ripple=sin(vPoolPoint.x*5.+vPoolPoint.y*2.+uPoolTime)*sin(vPoolPoint.y*4.-uPoolTime*.7);
        gl_FragColor.rgb*=.97+.03*ripple;
        float facing=abs(dot(normal,normalize(vViewPosition)));
        float fres=.04+.96*pow(1.-facing,5.);
        gl_FragColor.a=mix(.24,.84,fres);
      `)
  }
}
export function buildSkyAndLiquids(m: GameMap, def: LevelDef, g: THREE.Group, realWater = false) {
  for (const _step of buildSkyAndLiquidsJob(m, def, g, realWater)) { /* synchronous callers */ }
}

export function* buildSkyAndLiquidsJob(m: GameMap, def: LevelDef, g: THREE.Group, realWater = false): Generator<void> {
// ---- v7 室外：天空盒 + 远景低模楼群剪影 + 泳池水面 ----
  // 洪泛分区找出各室外区域
  const seen = new Uint8Array(m.w * m.h)
  const regions: { cx: number; cz: number; r: number }[] = []
  for (let y = 0; y < m.h; y++) {
    yield
    for (let x = 0; x < m.w; x++) {
      const ii = y * m.w + x
      if (m.outdoor[ii] !== 1 || seen[ii]) continue
      let minX = x, maxX = x, minY = y, maxY = y, cnt = 0
      const q: [number, number][] = [[x, y]]
      seen[ii] = 1
      while (q.length) {
        const [qx, qy] = q.pop()!
        cnt++
        if (cnt % 128 === 0) yield
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
    yield
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
    else silMat.dispose()
    for (const geo of silGeos) geo.dispose()
  }
  // v13 液体水面（提取为独立函数：无限 chunk 也逐块调用；有限层全图调用一次）
  yield* buildLiquidSurfacesJob(m, def, g, undefined, realWater)
}

export interface LiquidRange { x0: number; y0: number; x1: number; y1: number }
export function buildLiquidSurfaces(m: GameMap, def: LevelDef, g: THREE.Group, range?: LiquidRange, realWater = false) {
  for (const _step of buildLiquidSurfacesJob(m, def, g, range, realWater)) { /* synchronous callers */ }
}

/** Keep a single set of merge buckets; only construction is split across frames. */
export function* buildLiquidSurfacesJob(m: GameMap, def: LevelDef, g: THREE.Group, range?: LiquidRange, realWater = false): Generator<void> {
  const RX0 = range?.x0 ?? 0, RY0 = range?.y0 ?? 0
  const RX1 = range?.x1 ?? m.w, RY1 = range?.y1 ?? m.h
  // v13 液体水面：深水（泳池，可沉没游泳）+ 浅水洼（室内减速涟漪）
  const waterGeos: THREE.BufferGeometry[] = []
  const shallowGeos: THREE.BufferGeometry[] = []
  const dampGeos: THREE.BufferGeometry[] = []
  // Unpublished intermediate buffers must also be released when a chunk is cancelled.
  try {
  // v57t：真实水体下 L7 海面每瓦片 2×2 细分（0.5m 网格），顶点涌浪轮廓更平滑
  const seg = realWater && (def.id === 7 || def.id === 8 || def.id === 10) ? 2 : 1
  const isShallow = (tx: number, ty: number) => tx >= 0 && ty >= 0 && tx < m.w && ty < m.h
    && m.tiles[ty * m.w + tx] === 1 && m.liquid[ty * m.w + tx] === 2
  const L10_WATER_Y = 0.015
  const l10NearLake = (tx: number, ty: number) => {
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const nx = tx + dx, ny = ty + dy
      if (nx >= 0 && ny >= 0 && nx < m.w && ny < m.h && m.liquid[ny * m.w + nx] === 1) return true
    }
    return false
  }
  /** L10 湖面瓦片：3×3 顶点，逐顶点水深 = 水面 - 连续湖底/岸坡高度（共享边上的顶点取值一致）。 */
  const l10WaterTile = (tx: number, ty: number) => {
    const g = new THREE.PlaneGeometry(1, 1, 2, 2)
    g.rotateX(-Math.PI / 2)
    g.translate(tx + 0.5, L10_WATER_Y, ty + 0.5)
    const pos = g.attributes.position as THREE.BufferAttribute
    const d = new Float32Array(pos.count)
    for (let v = 0; v < pos.count; v++) d[v] = L10_WATER_Y - floorHeight(m, pos.getX(v), pos.getZ(v), 0)
    g.setAttribute('aDepth', new THREE.BufferAttribute(d, 1))
    return g
  }
  for (let y = RY0; y < RY1; y++)
    for (let x = RX0; x < RX1; x++) {
      if ((x - RX0) % 16 === 0) yield
      const ii = y * m.w + x
      if (m.tiles[ii] !== 1) continue
      // L8 岸外不再铺“浅水格”。水线外 1.35m 是贴着真实曲面的低反射潮湿岩面，不影响移动速度。
      const worldX = x + 0.5 + (m.inf?.ox ?? 0), worldY = y + 0.5 + (m.inf?.oy ?? 0)
      const dampLakeShore = def.id === 8 && m.inf !== undefined && m.liquid[ii] === 0
        && l8LakeDistanceAt(worldX, worldY) >= L8_LAKE_WATER_RADIUS
        && l8LakeDistanceAt(worldX, worldY) < L8_LAKE_WATER_RADIUS + 1.35
      // 浅溪旁的干地不再以“另一格水”铺平；只在临水侧叠一块圆润潮湿岩面。
      // 圆片略微跨过水线，会遮掉正方形的干/湿分界。
      const wetDirs = m.liquid[ii] === 0 && def.id === 8
        ? [[-1, 0], [1, 0], [0, -1], [0, 1]].filter(([dx, dy]) => isShallow(x + dx, y + dy))
        : []
      const nearShallow = wetDirs.length > 0
      if (dampLakeShore || nearShallow) {
        yield
        const damp = nearShallow ? new THREE.CircleGeometry(0.78, 18) : new THREE.PlaneGeometry(1.04, 1.04, 2, 2)
        dampGeos.push(damp)
        damp.rotateX(-Math.PI / 2)
        const pos = damp.attributes.position as THREE.BufferAttribute
        const dirX = nearShallow ? wetDirs.reduce((sum, q) => sum + q[0], 0) / wetDirs.length : 0
        const dirY = nearShallow ? wetDirs.reduce((sum, q) => sum + q[1], 0) / wetDirs.length : 0
        for (let v = 0; v < pos.count; v++) {
          if (v > 0 && v % 4 === 0) yield
          const px = x + 0.5 + dirX * 0.22 + pos.getX(v), py = y + 0.5 + dirY * 0.22 + pos.getZ(v)
          pos.setXYZ(v, px, floorHeight(m, px, py, 0) + 0.012, py)
        }
        damp.computeVertexNormals()
      }
      if (m.liquid[ii] === 0) {
        // L10 软岸线：紧邻湖面的岸上瓦片也铺水面，逐顶点水深可为负（着色器在岸上丢弃片元），
        // 水面因而与倾斜岸坡在真实水线处相交，而不是停在瓦片边缘。
        if (def.id === 10 && m.l10LakeTerrain && l10NearLake(x, y)) waterGeos.push(l10WaterTile(x, y))
        continue
      }
      const geo = new THREE.PlaneGeometry(1, 1, seg, seg)
      geo.rotateX(-Math.PI / 2)
      // v58：真实水体按瓦片烘焙水深顶点属性——着色器据此计算视线穿水路径的吸收（深水浓、浅滩清）
      const bakeDepth = (gg: THREE.PlaneGeometry) => {
        const d = Math.max(0.3, m.seaFloor[ii] || 1.7)
        gg.setAttribute('aDepth', new THREE.BufferAttribute(new Float32Array(gg.attributes.position.count).fill(d), 1))
      }
      if (m.liquid[ii] === 1) {
        // L8 地下湖由下方一张精确圆形水面统一生成；跳过按瓦片的方形水面，消除岸边方块溢水。
        if (def.id === 10) {
          geo.dispose()
          waterGeos.push(l10WaterTile(x, y))
        } else if (def.id !== 8) {
          geo.translate(x + 0.5, 0.03, y + 0.5)
          bakeDepth(geo)
          waterGeos.push(geo)
        } else geo.dispose()
      } else {
        if (def.id === 8 && m.organicCave) {
          // L8 浅水使用 2×2 细分：每个边界顶点都从同一个连续洞底高度场采样，
          // 所以水-水相邻时共边的高度和法线完全一致，不再出现方格裂缝/阴影棋盘。
          const smoothGeo = new THREE.PlaneGeometry(1, 1, 2, 2)
          shallowGeos.push(smoothGeo)
          geo.dispose()
          smoothGeo.rotateX(-Math.PI / 2)
          const pos = smoothGeo.attributes.position as THREE.BufferAttribute
          const normals = new Float32Array(pos.count * 3)
          for (let v = 0; v < pos.count; v++) {
            if (v % 3 === 0) yield
            let lx = pos.getX(v), lz = pos.getZ(v)
            const edgeNoise = (axis: number) => 0.055 + (Math.sin((axis + x * 3.17 + y * 5.31) * 7.1) * 0.5 + 0.5) * 0.035
            // 只在水-地边缘小幅内收并打破笔直方格轮廓；水-水共边不内收，保证无缝。
            if (lx < -0.49 && !isShallow(x - 1, y)) lx += edgeNoise(lz)
            if (lx > 0.49 && !isShallow(x + 1, y)) lx -= edgeNoise(lz)
            if (lz < -0.49 && !isShallow(x, y - 1)) lz += edgeNoise(lx + 11)
            if (lz > 0.49 && !isShallow(x, y + 1)) lz -= edgeNoise(lx + 23)
            const px = x + 0.5 + lx, py = y + 0.5 + lz
            const h = floorHeight(m, px, py, 0) + 0.022
            pos.setXYZ(v, px, h, py)
            // 中心差分法线在所有瓦片共用同一公式，合并后不会在格边突变。
            const eps = 0.18
            const nx = floorHeight(m, px - eps, py, 0) - floorHeight(m, px + eps, py, 0)
            const nz = floorHeight(m, px, py - eps, 0) - floorHeight(m, px, py + eps, 0)
            const inv = 1 / Math.max(1e-5, Math.hypot(nx, eps * 2, nz))
            normals[v * 3] = nx * inv; normals[v * 3 + 1] = eps * 2 * inv; normals[v * 3 + 2] = nz * inv
          }
          smoothGeo.setAttribute('normal', new THREE.BufferAttribute(normals, 3))
        } else {
          geo.translate(x + 0.5, def.id===5?.03:m.organicCave ? floorHeight(m, x + 0.5, y + 0.5, 0) + 0.018 : ELEV_H[m.elev[ii]] - 0.17, y + 0.5)
          shallowGeos.push(geo)
        }
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
  // 固定地下湖由洞心所属 chunk 独占一张圆形面：轮廓与解析水域半径完全一致，不再越过石岸。
  if (def.id === 8 && m.inf) {
    const lakeX = L8_LAKE_CENTER.x - m.inf.ox, lakeY = L8_LAKE_CENTER.y - m.inf.oy
    const ownsCenter = !range || (lakeX >= RX0 && lakeX < RX1 && lakeY >= RY0 && lakeY < RY1)
    if (ownsCenter) {
      const lake = new THREE.CircleGeometry(L8_LAKE_WATER_RADIUS, 96)
      waterGeos.push(lake)
      lake.rotateX(-Math.PI / 2)
      {
        const pos = lake.attributes.position as THREE.BufferAttribute
        const depths = new Float32Array(pos.count)
        for (let v = 0; v < pos.count; v++) {
          if (v % 4 === 0) yield
          const wx = L8_LAKE_CENTER.x + pos.getX(v), wy = L8_LAKE_CENTER.y + pos.getZ(v)
          depths[v] = Math.max(0.25, 0.03 - l8GroundAt(m.inf.seed, wx, wy))
        }
        lake.setAttribute('aDepth', new THREE.BufferAttribute(depths, 1))
      }
      lake.translate(lakeX, 0.03, lakeY)
    }
  }
  if (waterGeos.length) {
    yield
    g.add(new THREE.Mesh(
      mergeGeometries(waterGeos)!,
      // realistic：低粗糙度 + 强环境反射（物理反射真实天空）+ 噪声法线波光
      // v57m：L7 海面提高不透明度与自发光，修复纯黑/看不见水面，并作为普遍自然光来源
      (() => {
        const sea = def.id === 7
        const caveLake = def.id === 8
        const nightPool = def.id === 9
        const farmLake = def.id === 10
        // v57t：不使用任何水面贴图——纯色海面；真实水体改由着色器程序化生成浪面法线/反射/波光
        // v58：真实水体基础不透明度大幅降低（0.94→0.42）——透明感由着色器按穿水路径吸收重建：
        //      深水俯视呈暗色水体（非清晰透视），浅滩/泳池保持清澈
        const params = {
          color: def.id===5?'#4b9c98':sea ? '#1b5a76' : caveLake ? '#173b40' : nightPool ? '#0b2430' : farmLake ? '#526b62' : '#2a6fd8',
          transparent: true,
          opacity: realWater ? (sea ? 0.42 : caveLake ? 0.5 : nightPool ? 0.34 : 0.45) : (sea ? 0.94 : caveLake ? 0.76 : nightPool ? 0.48 : 0.66),
          emissive: def.id===5?'#0d2424':sea ? '#0d2e3e' : caveLake ? '#07191c' : nightPool ? '#010407' : farmLake ? '#121a17' : '#10355e',
          side: THREE.DoubleSide,
          roughness: sea ? 0.08 : caveLake ? 0.1 : nightPool ? 0.2 : farmLake ? 0.16 : 0.12,
          metalness: 0.06,
          envBase: sea ? 0.95 : caveLake ? 0.72 : nightPool ? 0.42 : farmLake ? 0.76 : 0.9,
        } as THREE.MeshLambertMaterialParameters & { roughness?: number; metalness?: number; envBase?: number }
        const mat = litMaterial(params)
        if(def.id===5)addHotelWaterFX(mat,m.inf?.ox??0,m.inf?.oy??0)
        else {
          // v64：通用水体——realWater 开启走高画质（顶点起伏/雨环/双层细浪），关闭走低画质
          const preset: WaterPresetName = sea ? 'sea' : caveLake ? 'cave' : nightPool ? 'nightPool' : farmLake ? 'lake' : 'pool'
          applyWater(mat, preset, realWater ? 'high' : 'low')
        }
        return mat
      })(),
    ))
    // v58：水面只接收阴影、不投影——透明浪面不是遮光体；L7 海面 25 chunk 网格若参与投影，
    // 手电阴影贴图每次更新都要把整张海面再画一遍，持手电帧率骤降。
    const waterMesh = g.children[g.children.length - 1] as THREE.Mesh
    waterMesh.userData.noCastShadow = 1
  }
  if (shallowGeos.length) {
    yield
    g.add(new THREE.Mesh(
      mergeGeometries(shallowGeos)!,
      litMaterial({
        color: def.id===5?'#4b9c98':def.id === 8 ? '#183a3e' : '#28424e', transparent: true, opacity: def.id===5?.66:def.id === 8 ? 0.43 : 0.55,
        emissive: def.id===5?'#0d2424':def.id === 8 ? '#061315' : '#0c1c24', side: THREE.DoubleSide,
        roughness: def.id === 8 ? 0.3 : 0.15, metalness: def.id === 8 ? 0.02 : 0.05, envBase: def.id === 8 ? 0.42 : 0.7,
      }),
    ))
    ;(g.children[g.children.length - 1] as THREE.Mesh).userData.noCastShadow = 1 // v58：浅洼同理不投影
  }
  if (dampGeos.length) {
    yield
    const dampMesh = new THREE.Mesh(
      mergeGeometries(dampGeos)!,
      litMaterial({
        color: '#343d39', transparent: true, opacity: 0.24, emissive: '#050807', side: THREE.DoubleSide,
        roughness: 0.2, metalness: 0.02, envBase: 0.48,
      }),
    )
    dampMesh.userData.noCastShadow = 1
    g.add(dampMesh)
  }
  } finally {
    for (const geo of waterGeos) geo.dispose()
    for (const geo of shallowGeos) geo.dispose()
    for (const geo of dampGeos) geo.dispose()
  }
}
