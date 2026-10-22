// L7 海床材质重制（Entity 20 重制附带的 L7 地形优化）。
// 旧版是两张砾石贴图按 5×5 瓦片硬切；世界 UV 只沿水平投影，崖壁上被拉成竖直条纹。
// 新版是一张材质：
//   · 三平面投影：平地走顶视投影，崖面走两个侧向投影，陡崖不再被拉伸；
//   · 坡度混合：坡度越大越接近湿玄武岩崖面（层理、竖向裂沟、焦油流痕）；
//   · 深度带混合（按顶点世界深度）：
//       有光带=冷灰沙纹，微光带=骨屑细泥，午夜带=深色骨灰淤泥，深渊=焦油沥青；
//     深度带之间按噪声错开边界，局部还会提前冒出焦油斑块；
//   · 两种尺度、旋转错相的采样相乘，打散 1024² 贴图的重复感；
//   · 由合成灰度做屏幕空间凹凸，再用灰度加一层缝隙 AO，让骨屑和裂缝在手电下显出立体。
// 依赖 addL7Caustics 注入的 uWaterOrigin（它的 common 注入排在本段之前）。
// 贴图（public/textures）：l7_t_sand / l7_t_silt_bone / l7_t_tar / l7_t_cliff（AI 生成后做了无缝处理）。
import * as THREE from 'three'
import { levelTexture, noiseTexture, configureSurfaceTexture, litMaterial, getMaterialMode } from './shared'
import { addL7Caustics } from './l7Ocean'

const shared = new Map<string, THREE.Material>()

function tex(name: string, a: string, b: string): THREE.Texture {
  const t = levelTexture(name, () => noiseTexture(a, b))
  configureSurfaceTexture(t, THREE.SRGBColorSpace)
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  return t
}

/** 深度带边界（米），与 infiniteL7 的 l7ZoneOfDepth 一致。 */
export const L7_SEABED_BANDS = { twilight: 24, midnight: 90, abyss: 230 } as const

export const L7_SEABED_GLSL_COMMON = /* glsl */`
varying vec3 vL7SW; varying vec3 vL7SN;
uniform sampler2D tL7Sand; uniform sampler2D tL7Silt; uniform sampler2D tL7Tar; uniform sampler2D tL7Cliff;
uniform float uL7Bump;
float l7h2(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float l7vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(l7h2(i), l7h2(i + vec2(1, 0)), f.x), mix(l7h2(i + vec2(0, 1)), l7h2(i + vec2(1, 1)), f.x), f.y); }
// 两尺度旋转错相采样：细节层 × 宏观层（宏观层压到 0.75~1.25 只调明暗）
vec3 l7Two(sampler2D t, vec2 uv){
  vec3 a = texture2D(t, uv).rgb;
  vec2 r = mat2(0.8, -0.6, 0.6, 0.8) * uv * 0.27 + 0.37;
  vec3 b = texture2D(t, r).rgb;
  float lb = dot(b, vec3(0.333));
  return a * (0.7 + lb * 0.75);
}
vec3 l7Flat(vec2 P, vec2 uv, float dep, float n){
  vec3 sand = l7Two(tL7Sand, uv);
  vec3 silt = l7Two(tL7Silt, uv * 0.85);
  vec3 tar  = l7Two(tL7Tar,  uv * 0.7);
  float e = (n - 0.5) * 14.0;
  float kS = smoothstep(${L7_SEABED_BANDS.twilight - 6}.0, ${L7_SEABED_BANDS.twilight + 10}.0, dep + e);
  vec3 c = mix(sand, silt, kS);
  // 午夜带：同一泥层但更暗、更冷，骨屑变成灰白的「骨灰」
  float kM = smoothstep(${L7_SEABED_BANDS.midnight - 10}.0, ${L7_SEABED_BANDS.midnight + 40}.0, dep + e * 2.0);
  c = mix(c, c * vec3(0.62, 0.64, 0.66), kM);
  // 焦油：深渊整片；午夜带深处零星斑块
  float patchN = l7vn(P * 0.045 + 11.3);
  float kT = smoothstep(${L7_SEABED_BANDS.abyss - 25}.0, ${L7_SEABED_BANDS.abyss + 15}.0, dep + e * 2.5);
  kT = max(kT, smoothstep(0.72, 0.8, patchN) * smoothstep(140.0, 190.0, dep));
  return mix(c, tar, kT);
}
`

export function l7SeabedMaterial(): THREE.Material {
  const mode = getMaterialMode()
  const cached = shared.get(mode); if (cached) return cached
  const sand = tex('l7_t_sand.jpg', '#a7a79c', '#8b8a80')
  const silt = tex('l7_t_silt_bone.jpg', '#4d4a43', '#6b675c')
  const tar = tex('l7_t_tar.jpg', '#120f0c', '#2a241e')
  const cliff = tex('l7_t_cliff.jpg', '#2c3430', '#46514b')
  const mat = litMaterial({
    color: '#ffffff', vertexColors: true,
    roughness: 0.62, envBase: 0.3,
    // 深水保留极低亮度下限（与旧材质一致），在 shader 里乘上合成反照率
    emissive: '#6f8580', emissiveIntensity: 0.085,
  })
  const prev = mat.onBeforeCompile
  mat.onBeforeCompile = (sh, r) => {
    prev?.call(mat, sh, r)
    Object.assign(sh.uniforms, {
      tL7Sand: { value: sand }, tL7Silt: { value: silt }, tL7Tar: { value: tar }, tL7Cliff: { value: cliff },
      uL7Bump: { value: 0.9 },
    })
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vL7SW; varying vec3 vL7SN;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvL7SW = (modelMatrix * vec4(position, 1.0)).xyz;\nvL7SN = normalize(mat3(modelMatrix) * objectNormal);')
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\n' + L7_SEABED_GLSL_COMMON)
      .replace('#include <map_fragment>', /* glsl */`
vec3 l7Alb; float l7H;
{
  vec3 n = normalize(vL7SN);
  vec3 w = pow(abs(n), vec3(4.0)); w /= (w.x + w.y + w.z + 1e-5);
  float dep = max(0.0, -vL7SW.y);
  vec2 P = vL7SW.xz + uWaterOrigin; // 世界相位：窗口流式平移时贴图不跟着跳
  float nz = l7vn(P * 0.03);
  vec3 top = l7Flat(P, P * 0.34, dep, nz);
  // 崖面：两个侧投影（竖直方向拉长一点，层理更像沉积岩）
  vec3 cx = l7Two(tL7Cliff, vec2(P.y, vL7SW.y * 0.8) * 0.21);
  vec3 cz = l7Two(tL7Cliff, vec2(P.x, vL7SW.y * 0.8) * 0.21);
  vec3 side = cx * w.x + cz * w.z;
  // 侧面权重：三平面权重的水平分量，再按坡度加硬过渡（> ~40° 基本是岩）
  float slope = 1.0 - n.y;
  float kC = clamp((w.x + w.z) * 1.15, 0.0, 1.0) * smoothstep(0.18, 0.42, slope);
  // 崖底冲积：平地也会混进碎岩
  vec3 topRock = l7Two(tL7Cliff, P * 0.3);
  top = mix(top, topRock * vec3(0.8), smoothstep(0.1, 0.22, slope) * 0.6);
  // 深渊崖面也挂焦油
  vec3 sideTar = mix(side, side * vec3(0.35, 0.32, 0.3), smoothstep(150.0, 260.0, dep));
  l7Alb = mix(top, sideTar, kC);
  l7H = dot(l7Alb, vec3(0.299, 0.587, 0.114));
  // 缝隙 AO：暗部再压一点，骨屑/裂缝更立体
  l7Alb *= mix(0.72, 1.06, smoothstep(0.03, 0.35, l7H));
  diffuseColor.rgb *= l7Alb;
}`)
      .replace('#include <normal_fragment_maps>', /* glsl */`#include <normal_fragment_maps>
{
  vec3 dpx = dFdx(-vViewPosition), dpy = dFdy(-vViewPosition);
  float hx = dFdx(l7H), hy = dFdy(l7H);
  vec3 r1 = cross(dpy, normal), r2 = cross(normal, dpx);
  float det = dot(dpx, r1);
  vec3 grad = sign(det) * (hx * r1 + hy * r2);
  normal = normalize(abs(det) * normal - grad * uL7Bump);
}`)
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance *= l7Alb;')
  }
  const key = mat.customProgramCacheKey?.bind(mat)
  mat.customProgramCacheKey = () => (key ? key() : '') + '-l7seabed1'
  const result = addL7Caustics(mat)
  shared.set(mode, result)
  return result
}
