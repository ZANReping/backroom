import * as THREE from 'three'
import type { GameMap } from '../world/mapgen'
import type { Structure } from '../core/types'
import { l5NestLayout } from '../world/infiniteL5'

// Spatial light isolation, including classic mode where lamps have no shadow maps.
// One lookup per surface, no extra draw calls / render targets / shader variants per door.
const MAX_NESTS = 32
const fragment = /* glsl */`
uniform int l5NestCount;
uniform int l5PlayerNest;
uniform int l5LightLoopLimit;
uniform vec4 l5NestBounds[${MAX_NESTS}]; // minX, minZ, maxX (door plane), maxZ
uniform vec4 l5NestDoors[${MAX_NESTS}]; // centerZ, sin(angle), cos(angle), open
uniform float l5NestHeight;
uniform mat4 l5NestCameraWorld;
vec3 l5SurfaceWorld;
bool l5InsideNest(vec3 p, int n) {
  vec4 b = l5NestBounds[n];
  return p.x >= b.x && p.x <= b.z && p.z >= b.y && p.z <= b.w
    && p.y >= -0.12 && p.y <= l5NestHeight + 0.04;
}
int l5NestAt(vec3 p) {
  for (int n = 0; n < l5NestCount; n++) {
    if (l5InsideNest(p, n)) return n;
  }
  return -1;
}
float l5Cross(vec2 a, vec2 b) { return a.x * b.y - a.y * b.x; }
float l5PortalLight(vec3 source, int receiver) {
  if (l5NestCount == 0) return 1.0;
  int n = receiver;
  if (n < 0) {
    // The unlit annex only has player-carried lights. Their room is found once
    // on the CPU, avoiding a room-array loop inside every unrolled point light.
    n = l5PlayerNest;
    if (n < 0 || !l5InsideNest(source, n)) return 1.0;
  } else if (l5InsideNest(source, n)) return 1.0;
  vec4 b = l5NestBounds[n], door = l5NestDoors[n];
  if (door.w < 0.002) return 0.0;
  vec3 ray = source - l5SurfaceWorld;
  if (abs(ray.x) < 0.0001) return 0.0;
  float t = (b.z - l5SurfaceWorld.x) / ray.x;
  if (t < 0.0 || t > 1.0) return 0.0;
  // The reveal is one tile deep, the hotel frame has a 0.80 m clear opening.
  // Test both ends as well as the door plane so light cannot cut the side wall.
  for (int edge = -1; edge <= 1; edge++) {
    float te = (b.z + float(edge) * 0.48 - l5SurfaceWorld.x) / ray.x;
    vec3 he = l5SurfaceWorld + ray * clamp(te, 0.0, 1.0);
    if (abs(he.z - door.x) > 0.40 || he.y < 0.0 || he.y > 2.17) return 0.0;
  }
  // Intersect the animated leaf itself. Its hinge is the +Z jamb and it swings
  // into the ballroom, matching buildL5Structure/updateStructs (0.78 m, 1.55 rad).
  vec2 hinge = vec2(b.z, door.x + 0.39);
  vec2 leaf = vec2(0.78 * door.y, -0.78 * door.z);
  float crossRay = l5Cross(ray.xz, leaf);
  if (abs(crossRay) > 0.00001) {
    vec2 offset = hinge - l5SurfaceWorld.xz;
    float tr = l5Cross(offset, leaf) / crossRay;
    float u = l5Cross(offset, ray.xz) / crossRay;
    float h = l5SurfaceWorld.y + ray.y * tr;
    if (tr > 0.0001 && tr < 0.9999 && u >= 0.0 && u <= 1.0 && h < 2.14) return 0.0;
  }
  return 1.0;
}
float l5NestAmbient(int n) {
  if (n < 0) return 1.0;
  vec4 b = l5NestBounds[n], door = l5NestDoors[n];
  // Small, local diffuse spill. It reaches the threshold, not the far walls.
  float distanceToDoor = length(l5SurfaceWorld - vec3(b.z, 1.0, door.x));
  float spill = pow(max(0.0, 1.0 - distanceToDoor / 3.2), 2.0);
  return 0.004 + 0.15 * spill * (1.0 - door.z) * door.w;
}
`

export class L5NestLighting {
  readonly uniforms = {
    l5NestCount: { value: 0 },
    l5PlayerNest: { value: -1 },
    // Keep the portal calculation in a dynamic loop instead of expanding it
    // once for every light in Three's unrolled PBR/shadow lighting block.
    l5LightLoopLimit: { value: 256 },
    l5NestBounds: { value: Array.from({ length: MAX_NESTS }, () => new THREE.Vector4()) },
    l5NestDoors: { value: Array.from({ length: MAX_NESTS }, () => new THREE.Vector4()) },
    l5NestHeight: { value: 3.3 },
    l5NestCameraWorld: { value: new THREE.Matrix4() },
  }
  private patched = new WeakSet<THREE.Material>()
  private map?: GameMap
  private rev = -1
  private doors: { structure: Structure; layout: NonNullable<ReturnType<typeof l5NestLayout>> }[] = []

  update(m: GameMap, level: number, height: number, camera: THREE.Camera,
    animated: ReadonlyMap<Structure, THREE.Group>, bright = false) {
    this.uniforms.l5NestCount.value = 0
    this.uniforms.l5PlayerNest.value = -1
    if (level !== 5 || !m.inf || bright) return
    const inf = m.inf
    if (this.map !== m || this.rev !== inf.rev) {
      this.map = m; this.rev = inf.rev; this.doors = []
      for (const structure of m.structures) {
        if (structure.kind !== 'hoteldoor' || !structure.data?.mothNest) continue
        const [hk, hr] = String(structure.data.mothNest).split(',').map(Number)
        const layout = l5NestLayout(inf.seed, hk, hr)
        if (layout) this.doors.push({ structure, layout })
      }
      // The 160 m window covers fewer than 32 hall cells, even if all contain nests.
      this.doors = this.doors.slice(0, MAX_NESTS)
    }
    this.uniforms.l5NestHeight.value = height
    camera.updateWorldMatrix(true, false)
    this.uniforms.l5NestCameraWorld.value.copy(camera.matrixWorld)
    this.uniforms.l5NestCount.value = this.doors.length
    this.doors.forEach(({ structure: s, layout: r }, i) => {
      this.uniforms.l5NestBounds.value[i].set(r.x0 - inf.ox, r.y0 - inf.oy,
        r.doorX + .5 - inf.ox, r.y1 + 1 - inf.oy)
      const open = Number(animated.get(s)?.userData.open ?? (s.data?.open ? 1 : 0))
      this.uniforms.l5NestDoors.value[i].set(r.doorY + .5 - inf.oy,
        Math.sin(open * 1.55), Math.cos(open * 1.55), open)
      const b = this.uniforms.l5NestBounds.value[i], p = camera.position
      if (p.x >= b.x && p.x <= b.z && p.z >= b.y && p.z <= b.w && p.y >= 0 && p.y <= height)
        this.uniforms.l5PlayerNest.value = i
    })
  }

  patch(material: THREE.Material) {
    const lit = material as THREE.MeshStandardMaterial & THREE.MeshLambertMaterial & THREE.MeshPhongMaterial
    if (this.patched.has(material) || !(lit.isMeshStandardMaterial || lit.isMeshLambertMaterial || lit.isMeshPhongMaterial)) return
    this.patched.add(material)
    const compile = material.onBeforeCompile, key = material.customProgramCacheKey()
    // This patch never changes opacity/geometry; preserve ordinary wall occlusion.
    if (compile === THREE.Material.prototype.onBeforeCompile) material.userData.occlusionOpaque = true
    material.onBeforeCompile = (shader, renderer) => {
      compile.call(material, shader, renderer)
      Object.assign(shader.uniforms, this.uniforms)
      shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\n' + fragment)
        .replace('#include <lights_fragment_begin>', `
          l5SurfaceWorld = (l5NestCameraWorld * vec4(-vViewPosition, 1.0)).xyz;
          int l5ReceiverNest = l5NestAt(l5SurfaceWorld);
          float l5AmbientKeep = l5NestAmbient(l5ReceiverNest);
          #if NUM_POINT_LIGHTS > 0
            float l5PointMask[NUM_POINT_LIGHTS];
            for (int j = 0; j < l5LightLoopLimit; j++) {
              if (j >= NUM_POINT_LIGHTS) break;
              l5PointMask[j] = l5PortalLight((l5NestCameraWorld * vec4(pointLights[j].position, 1.0)).xyz, l5ReceiverNest);
            }
          #endif
          #if NUM_SPOT_LIGHTS > 0
            float l5SpotMask[NUM_SPOT_LIGHTS];
            for (int j = 0; j < l5LightLoopLimit; j++) {
              if (j >= NUM_SPOT_LIGHTS) break;
              l5SpotMask[j] = l5PortalLight((l5NestCameraWorld * vec4(spotLights[j].position, 1.0)).xyz, l5ReceiverNest);
            }
          #endif
          ${THREE.ShaderChunk.lights_fragment_begin
            .replace('getPointLightInfo( pointLight, geometryPosition, directLight );', `getPointLightInfo( pointLight, geometryPosition, directLight );
              directLight.color *= l5PointMask[ i ];`)
            .replace('getSpotLightInfo( spotLight, geometryPosition, directLight );', `getSpotLightInfo( spotLight, geometryPosition, directLight );
              directLight.color *= l5SpotMask[ i ];`)
            .replace('getDirectionalLightInfo( directionalLight, directLight );', `getDirectionalLightInfo( directionalLight, directLight );
              if (l5ReceiverNest >= 0) directLight.color = vec3(0.0);`)}
        `)
        .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
          reflectedLight.indirectDiffuse *= l5AmbientKeep;
          reflectedLight.indirectSpecular *= l5AmbientKeep;`)
        .replace('#include <fog_fragment>', THREE.ShaderChunk.fog_fragment.replace('fogColor, fogFactor', 'fogColor * l5AmbientKeep, fogFactor'))
    }
    material.customProgramCacheKey = () => key + '|l5-nest-light-v3'
    material.needsUpdate = true
  }
}
