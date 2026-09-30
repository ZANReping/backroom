// 体积洞穴渲染：以一个三维隐式场直接提取洞底、侧壁和洞顶的同一张等值面。
// 固定世界采样格 + 解析场法线保证无限 chunk 两侧顶点、法线和纹理相位完全一致。
import * as THREE from 'three'
import type { GameMap } from '../world/mapgen'
import { infiniteImplFor, type CaveVolumeColumn, type CaveVolumeDef, type CaveVolumeMaterialDef } from '../world/infiniteRegistry'
import { levelTexture, litMaterial } from './shared'

interface CaveRange { x0: number; y0: number; x1: number; y1: number; variant?: string }

interface IsoVertex {
  lx: number
  ly: number
  lz: number
  wx: number
  wz: number
  nx: number
  ny: number
  nz: number
}

const TETS: readonly (readonly number[])[] = [
  [0, 1, 2, 6], [0, 2, 3, 6], [0, 3, 7, 6],
  [0, 7, 4, 6], [0, 4, 5, 6], [0, 5, 1, 6],
]

const fallbackTexture = (rgb: readonly [number, number, number], noisy: boolean) => {
  const size = 16, data = new Uint8Array(size * size * 4)
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const i = (y * size + x) * 4
    const n = noisy ? (((x * 37 + y * 61 + x * y * 11) & 31) - 15) : 0
    data[i] = rgb[0] + n; data[i + 1] = rgb[1] + n; data[i + 2] = rgb[2] + n; data[i + 3] = 255
  }
  const out = new THREE.DataTexture(data, size, size, THREE.RGBAFormat)
  out.needsUpdate = true
  return out
}

function caveMaterial(volume: CaveVolumeDef, variant?: string): THREE.Material {
  const spec: CaveVolumeMaterialDef = volume.materials?.[variant ?? ''] ?? {
    texture: volume.texture ?? 'l8_wall.jpg', color: volume.color,
  }
  const rock = levelTexture(spec.texture, () => fallbackTexture([103, 96, 82], true))
  const normalMap = spec.normalTexture
    ? levelTexture(spec.normalTexture, () => fallbackTexture([128, 128, 255], false)) : undefined
  const roughnessMap = spec.roughnessTexture
    ? levelTexture(spec.roughnessTexture, () => fallbackTexture([224, 224, 224], true)) : undefined
  const textureScale = spec.textureScale ?? 0.34
  const mat = litMaterial({
    color: spec.color ?? volume.color ?? '#8a8272', map: rock,
    ...(normalMap ? {
      normalMap,
      normalScale: new THREE.Vector2(spec.normalStrength ?? 0.72, spec.normalStrength ?? 0.72),
    } : {}),
    ...(roughnessMap ? { roughnessMap } : {}),
    roughness: spec.roughness ?? 0.96,
    envBase: spec.envBase ?? 0.1, side: THREE.FrontSide,
  })
  // 普通 UV 会在地面→墙→洞顶的转角被迫切缝；三向世界投影让同一岩纹连续包裹整张洞体。
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uCaveTextureScale = { value: textureScale }
    shader.vertexShader = `
attribute vec3 caveWorldPosition;
varying vec3 vCaveWorldPosition;
varying vec3 vCaveObjectNormal;
${shader.vertexShader}`.replace(
      '#include <begin_vertex>',
      '#include <begin_vertex>\n  vCaveWorldPosition = caveWorldPosition;\n  vCaveObjectNormal = normal;',
    )
    shader.fragmentShader = `
uniform float uCaveTextureScale;
varying vec3 vCaveWorldPosition;
varying vec3 vCaveObjectNormal;
${shader.fragmentShader}`.replace(
      '#include <map_fragment>',
      `#ifdef USE_MAP
        vec3 caveBlend = pow(abs(normalize(vCaveObjectNormal)), vec3(4.0));
        caveBlend /= max(caveBlend.x + caveBlend.y + caveBlend.z, 0.0001);
        vec4 caveMapX = texture2D(map, vCaveWorldPosition.zy * uCaveTextureScale);
        vec4 caveMapY = texture2D(map, vCaveWorldPosition.xz * uCaveTextureScale);
        vec4 caveMapZ = texture2D(map, vCaveWorldPosition.xy * uCaveTextureScale);
        diffuseColor *= caveMapX * caveBlend.x + caveMapY * caveBlend.y + caveMapZ * caveBlend.z;
      #endif`,
    )
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <normal_fragment_maps>',
      `#ifdef USE_NORMALMAP_TANGENTSPACE
        vec3 caveNormalBlend = pow(abs(normalize(vCaveObjectNormal)), vec3(4.0));
        caveNormalBlend /= max(caveNormalBlend.x + caveNormalBlend.y + caveNormalBlend.z, 0.0001);
        vec3 caveNX = texture2D(normalMap, vCaveWorldPosition.zy * uCaveTextureScale).xyz * 2.0 - 1.0;
        vec3 caveNY = texture2D(normalMap, vCaveWorldPosition.xz * uCaveTextureScale).xyz * 2.0 - 1.0;
        vec3 caveNZ = texture2D(normalMap, vCaveWorldPosition.xy * uCaveTextureScale).xyz * 2.0 - 1.0;
        caveNX.xy *= normalScale; caveNY.xy *= normalScale; caveNZ.xy *= normalScale;
        vec3 caveViewNX = normalize(getTangentFrame(-vViewPosition, normal, vCaveWorldPosition.zy * uCaveTextureScale) * caveNX);
        vec3 caveViewNY = normalize(getTangentFrame(-vViewPosition, normal, vCaveWorldPosition.xz * uCaveTextureScale) * caveNY);
        vec3 caveViewNZ = normalize(getTangentFrame(-vViewPosition, normal, vCaveWorldPosition.xy * uCaveTextureScale) * caveNZ);
        normal = normalize(caveViewNX * caveNormalBlend.x + caveViewNY * caveNormalBlend.y + caveViewNZ * caveNormalBlend.z);
      #endif`,
    )
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <roughnessmap_fragment>',
      `float roughnessFactor = roughness;
      #ifdef USE_ROUGHNESSMAP
        vec3 caveRoughBlend = pow(abs(normalize(vCaveObjectNormal)), vec3(4.0));
        caveRoughBlend /= max(caveRoughBlend.x + caveRoughBlend.y + caveRoughBlend.z, 0.0001);
        float caveRX = texture2D(roughnessMap, vCaveWorldPosition.zy * uCaveTextureScale).g;
        float caveRY = texture2D(roughnessMap, vCaveWorldPosition.xz * uCaveTextureScale).g;
        float caveRZ = texture2D(roughnessMap, vCaveWorldPosition.xy * uCaveTextureScale).g;
        roughnessFactor *= dot(caveRoughBlend, vec3(caveRX, caveRY, caveRZ));
      #endif`,
    )
  }
  mat.customProgramCacheKey = () => 'cave-volume-triplanar-v1'
  mat.userData.caveVolume = true
  return mat
}

const normalize = (x: number, y: number, z: number): [number, number, number] => {
  const d = Math.hypot(x, y, z) || 1
  return [x / d, y / d, z / d]
}

/** 返回 true 表示本层已由体积洞穴模式接管，调用者必须跳过旧瓦片地形。 */
export function* buildCaveVolumeTerrainJob(m: GameMap, g: THREE.Group, range: CaveRange): Generator<void, boolean, unknown> {
  if (m.caveVolumeId === undefined || !m.inf) return false
  const volume = infiniteImplFor(m.caveVolumeId).caveVolume
  if (!volume) return false

  const seed = m.inf.seed
  const nx = Math.max(12, Math.round(volume.horizontalSegments ?? 40))
  const nz = nx
  const yMax = volume.verticalMax ?? 12
  const requestedStep = volume.verticalStep ?? 0.5
  const dx = (range.x1 - range.x0) / nx
  const dz = (range.y1 - range.y0) / nz
  // 四周多采一层：边界点使用双侧中心差分，邻 chunk 得到完全相同的法线。
  const sx = nx + 3, sz = nz + 3
  const columns: CaveVolumeColumn[] = new Array(sx * sz)
  const ci = (ix: number, iz: number) => (iz + 1) * sx + (ix + 1)
  const lxAt = (ix: number) => range.x0 + ix * dx
  const lzAt = (iz: number) => range.y0 + iz * dz
  const wxAt = (ix: number) => lxAt(ix) + m.inf!.ox
  const wzAt = (iz: number) => lzAt(iz) + m.inf!.oy

  let minFloor = Infinity
  for (let iz = -1; iz <= nz + 1; iz++) {
    for (let ix = -1; ix <= nx + 1; ix++) {
      const column = volume.column(seed, wxAt(ix), wzAt(iz))
      columns[ci(ix, iz)] = column
      minFloor = Math.min(minFloor, column.floor)
    }
    yield
  }
  // 深湖等局部地形可低于层级的常规采样下限。按全局步长向下扩展并量化，既补出湖底，
  // 又让相邻 chunk 的重叠 Y 采样层保持完全一致，避免为了湖底扩大整张无限地图的体素预算。
  const configuredMin = volume.verticalMin ?? -2
  const baseNy = Math.max(8, Math.ceil((yMax - configuredMin) / requestedStep))
  const dy = (yMax - configuredMin) / baseNy
  const extraBelow = Math.max(0, Math.ceil((configuredMin - (minFloor - dy)) / dy))
  const yMin = configuredMin - extraBelow * dy
  const ny = baseNy + extraBelow
  const sy = ny + 3
  const field = new Float32Array(sx * sz * sy)
  const fi = (ix: number, iy: number, iz: number) => ((iy + 1) * sz + (iz + 1)) * sx + (ix + 1)
  const lyAt = (iy: number) => yMin + iy * dy
  for (let iy = -1; iy <= ny + 1; iy++) {
    for (let iz = -1; iz <= nz + 1; iz++) for (let ix = -1; ix <= nx + 1; ix++) {
      field[fi(ix, iy, iz)] = volume.field(seed, wxAt(ix), lyAt(iy), wzAt(iz), columns[ci(ix, iz)])
    }
    yield
  }

  const positions: number[] = []
  const normals: number[] = []
  const worldPositions: number[] = []
  const uvs: number[] = []
  const edgeCache = new Map<number, IsoVertex>()
  const gradX = new Float32Array(field.length), gradY = new Float32Array(field.length), gradZ = new Float32Array(field.length)
  const gradReady = new Uint8Array(field.length)

  const nodeGradient = (ix: number, iy: number, iz: number): [number, number, number] => normalize(
    gradX[fi(ix, iy, iz)], gradY[fi(ix, iy, iz)], gradZ[fi(ix, iy, iz)],
  )
  const ensureGradient = (ix: number, iy: number, iz: number) => {
    const i = fi(ix, iy, iz)
    if (gradReady[i]) return
    const n = normalize(
      (field[fi(ix + 1, iy, iz)] - field[fi(ix - 1, iy, iz)]) / (2 * dx),
      (field[fi(ix, iy + 1, iz)] - field[fi(ix, iy - 1, iz)]) / (2 * dy),
      (field[fi(ix, iy, iz + 1)] - field[fi(ix, iy, iz - 1)]) / (2 * dz),
    )
    gradX[i] = n[0]; gradY[i] = n[1]; gradZ[i] = n[2]; gradReady[i] = 1
  }

  const pushVertex = (v: IsoVertex) => {
    positions.push(v.lx, v.ly, v.lz)
    normals.push(v.nx, v.ny, v.nz)
    worldPositions.push(v.wx, v.ly, v.wz)
    uvs.push(v.wx * 0.34, v.wz * 0.34)
  }
  const pushTriangle = (a0: IsoVertex, b0: IsoVertex, c0: IsoVertex) => {
    let b = b0, c = c0
    const abx = b.lx - a0.lx, aby = b.ly - a0.ly, abz = b.lz - a0.lz
    const acx = c.lx - a0.lx, acy = c.ly - a0.ly, acz = c.lz - a0.lz
    const cx = aby * acz - abz * acy, cy = abz * acx - abx * acz, cz = abx * acy - aby * acx
    const gx = a0.nx + b.nx + c.nx, gy = a0.ny + b.ny + c.ny, gz = a0.nz + b.nz + c.nz
    if (cx * gx + cy * gy + cz * gz < 0) { b = c0; c = b0 }
    pushVertex(a0); pushVertex(b); pushVertex(c)
  }

  for (let iy = 0; iy < ny; iy++) {
    for (let iz = 0; iz < nz; iz++) for (let ix = 0; ix < nx; ix++) {
    const coords = [
      [ix, iy, iz], [ix + 1, iy, iz], [ix + 1, iy, iz + 1], [ix, iy, iz + 1],
      [ix, iy + 1, iz], [ix + 1, iy + 1, iz], [ix + 1, iy + 1, iz + 1], [ix, iy + 1, iz + 1],
    ] as const
    const values = coords.map((p) => field[fi(p[0], p[1], p[2])])
    let cubeInside = 0
    for (const v of values) if (v > 0) cubeInside++
    if (cubeInside === 0 || cubeInside === 8) continue

    const edgeVertex = (ca: number, cb: number): IsoVertex => {
      const pa = coords[ca], pb = coords[cb]
      const ia = fi(pa[0], pa[1], pa[2]), ib = fi(pb[0], pb[1], pb[2])
      const key = ia < ib ? ia * field.length + ib : ib * field.length + ia
      const cached = edgeCache.get(key)
      if (cached) return cached
      const va = values[ca], vb = values[cb]
      const t = Math.max(0, Math.min(1, va / (va - vb)))
      const ax = lxAt(pa[0]), ay = lyAt(pa[1]), az = lzAt(pa[2])
      const bx = lxAt(pb[0]), by = lyAt(pb[1]), bz = lzAt(pb[2])
      ensureGradient(pa[0], pa[1], pa[2]); ensureGradient(pb[0], pb[1], pb[2])
      const ga = nodeGradient(pa[0], pa[1], pa[2]), gb = nodeGradient(pb[0], pb[1], pb[2])
      const gn = normalize(ga[0] + (gb[0] - ga[0]) * t, ga[1] + (gb[1] - ga[1]) * t, ga[2] + (gb[2] - ga[2]) * t)
      const out: IsoVertex = {
        lx: ax + (bx - ax) * t, ly: ay + (by - ay) * t, lz: az + (bz - az) * t,
        wx: wxAt(pa[0]) + (wxAt(pb[0]) - wxAt(pa[0])) * t,
        wz: wzAt(pa[2]) + (wzAt(pb[2]) - wzAt(pa[2])) * t,
        nx: gn[0], ny: gn[1], nz: gn[2],
      }
      edgeCache.set(key, out)
      return out
    }

    for (const tet of TETS) {
      const inside: number[] = [], outside: number[] = []
      for (let ti = 0; ti < 4; ti++) (values[tet[ti]] > 0 ? inside : outside).push(tet[ti])
      if (inside.length === 1) {
        pushTriangle(edgeVertex(inside[0], outside[0]), edgeVertex(inside[0], outside[1]), edgeVertex(inside[0], outside[2]))
      } else if (inside.length === 3) {
        pushTriangle(edgeVertex(outside[0], inside[0]), edgeVertex(outside[0], inside[1]), edgeVertex(outside[0], inside[2]))
      } else if (inside.length === 2) {
        const a = edgeVertex(inside[0], outside[0]), b = edgeVertex(inside[0], outside[1])
        const c = edgeVertex(inside[1], outside[0]), d = edgeVertex(inside[1], outside[1])
        pushTriangle(a, b, d); pushTriangle(a, d, c)
      }
    }
    yield
    }
  }

  if (!positions.length) return true
  yield
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3))
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
  geo.setAttribute('caveWorldPosition', new THREE.Float32BufferAttribute(worldPositions, 3))
  geo.computeBoundingBox()
  geo.computeBoundingSphere()
  const mesh = new THREE.Mesh(geo, caveMaterial(volume, range.variant))
  mesh.userData.caveVolume = true
  g.add(mesh)
  return true
}

/** 同步兼容入口：完整耗尽可暂停生成器并返回最终结果。 */
export function buildCaveVolumeTerrain(m: GameMap, g: THREE.Group, range: CaveRange): boolean {
  const job = buildCaveVolumeTerrainJob(m, g, range)
  let result = job.next()
  while (!result.done) result = job.next()
  return result.value
}
