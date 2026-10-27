// Level 0.2 PBR 表面（2026-10-25 PBR 返工）：public/textures/l02/<name>{,-normal,-orm}.jpg
// 由 scripts/gen-l02-pbr.py 从 ambientCG / Poly Haven CC0 扫描材质生成（来源登记：public/textures/l02/SOURCES.md）。
//
// L0.2 的主照明是烘焙进 emissive / 顶点色的静态光，three 的法线贴图只影响实时光、aoMap 只影响间接光，
// 单靠标准通道在烘焙画面里几乎看不出质感。这里给材质注入一段与光照模型无关的片元代码：
//   - 用视空间位置的屏幕导数求几何法线与切线框（与 three 的 getTangentFrame 同法），采样 OpenGL 法线贴图；
//   - 以「烘焙光的大致方向」（竖直面：顶灯从上方；水平面：沿视线掠射）求法线起伏造成的明暗差，乘到最终颜色；
//   - 乘 ORM.R 的 AO（矿棉孔洞、绒头根部、墙纸压纹凹处）；
//   - 地毯额外读 ORM.B 的宏观磨损掩码（4.8 m 周期）：人流带变浅偏灰、绒头倒伏（起伏减弱）、零星旧渍。
// 不依赖场景光源数量，MeshBasic / Lambert / Standard 通用；一张材质只多 2 次（地毯 3 次）纹理采样。
import * as THREE from 'three'
import { levelTexture, noiseTexture } from './shared'

export type L02PbrName = 'carpet' | 'ceiling' | 'wall' | 'trim' | 'osb' | 'stud' | 'insul'
/** relief：起伏明暗增益；ao：AO 强度；normal：法线强度（同时用于 three 的 normalScale）；macro：地毯宏观磨损 */
export const L02_PBR: Record<L02PbrName, { relief: number; ao: number; normal: number; macro?: boolean }> = {
  carpet: { relief: 1.5, ao: 0.85, normal: 1, macro: true },
  ceiling: { relief: 1.6, ao: 1, normal: 1 },
  wall: { relief: 1.6, ao: 0.7, normal: 1 },
  trim: { relief: 0.9, ao: 0.6, normal: 0.8 },
  osb: { relief: 1.3, ao: 0.9, normal: 1 },
  stud: { relief: 1.1, ao: 0.7, normal: 1 },
  insul: { relief: 1.5, ao: 1, normal: 1 },
}
const FALLBACK: Record<L02PbrName, [string, string]> = {
  carpet: ['#6e302c', '#5e2a26'], ceiling: ['#c8bb8a', '#bfb283'], wall: ['#e3dfcd', '#dcd8c6'], trim: ['#e3dfcd', '#d6d2c0'],
  osb: ['#b8925f', '#a47f50'], stud: ['#ceac76', '#c09d68'], insul: ['#e2bc66', '#d9b05a'],
}

export function l02Tex(name: L02PbrName, kind: 'albedo' | 'normal' | 'orm' = 'albedo'): THREE.Texture {
  const data = kind !== 'albedo'
  const file = `l02/${name}${kind === 'albedo' ? '' : '-' + kind}.jpg`
  const t = levelTexture(file, () => kind === 'normal' ? noiseTexture('#8080ff', '#8080ff', 4) : kind === 'orm' ? noiseTexture('#ffe680', '#ffe680', 4) : noiseTexture(...FALLBACK[name]))
  t.colorSpace = data ? THREE.NoColorSpace : THREE.SRGBColorSpace
  t.anisotropy = Math.max(t.anisotropy, name === 'carpet' || name === 'ceiling' ? 8 : 4)
  return t
}

/** 给已有材质（可已带其他 onBeforeCompile 注入）叠加 L0.2 PBR 起伏/AO。材质必须有 map（借用 vMapUv）。 */
export function installL02Pbr<M extends THREE.Material>(mat: M, name: L02PbrName): M {
  const cfg = L02_PBR[name]
  const uniforms = {
    l02N: { value: l02Tex(name, 'normal') },
    l02O: { value: l02Tex(name, 'orm') },
    l02P: { value: new THREE.Vector4(cfg.relief, cfg.ao, cfg.normal, cfg.macro ? 1 : 0) },
  }
  const previous = mat.onBeforeCompile.bind(mat)
  const previousKey = mat.customProgramCacheKey.bind(mat)
  mat.onBeforeCompile = (shader, renderer) => {
    previous(shader, renderer)
    Object.assign(shader.uniforms, uniforms)
    shader.vertexShader = 'varying vec3 vL02P;\n' + shader.vertexShader
    shader.vertexShader = shader.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>\n vL02P = mvPosition.xyz;')
    shader.fragmentShader = 'uniform sampler2D l02N, l02O; uniform vec4 l02P; varying vec3 vL02P;\n' + shader.fragmentShader
    shader.fragmentShader = shader.fragmentShader.replace('#include <opaque_fragment>', `{
  vec2 q = vMapUv;
  vec3 dpx = dFdx(vL02P), dpy = dFdy(vL02P); vec2 dux = dFdx(q), duy = dFdy(q);
  vec3 gN = normalize(cross(dpx, dpy));
  vec3 q1p = cross(dpy, gN), q0p = cross(gN, dpx);
  vec3 T = q1p * dux.x + q0p * duy.x, B = q1p * dux.y + q0p * duy.y;
  float det = max(dot(T, T), dot(B, B)), sc = det == 0.0 ? 0.0 : inversesqrt(det);
  vec3 nt = texture2D(l02N, q).xyz * 2.0 - 1.0; nt.xy *= l02P.z;
  vec4 orm = texture2D(l02O, q);
  vec3 n = normalize(mat3(T * sc, B * sc, gN) * nt);
  vec3 tint = vec3(1.0);
  if (l02P.w > 0.5) {
    float mk = texture2D(l02O, q * 0.3125).b, wear = clamp((mk - 0.5) * 2.0, 0.0, 1.0), stain = clamp((0.5 - mk) * 2.0, 0.0, 1.0);
    n = normalize(mix(gN, n, 1.0 - 0.6 * wear));
    float g = dot(outgoingLight, vec3(0.3, 0.59, 0.11));
    outgoingLight = mix(outgoingLight, vec3(g) * 1.12, 0.32 * wear) * (1.0 + 0.2 * wear);
    tint = mix(vec3(1.0), vec3(0.62, 0.56, 0.48), stain);
  }
  vec3 up = normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz), vd = normalize(-vL02P);
  vec3 tu = up - gN * dot(up, gN), tv = vd - gN * dot(vd, gN);
  float lu = length(tu);
  vec3 t = mix(tv, tu / max(lu, 1e-4), smoothstep(0.2, 0.6, lu)) + gN.yzx * 1e-3;
  vec3 L = normalize(gN * 0.6 + normalize(t - gN * dot(t, gN)) * 0.8);
  float relief = clamp(1.0 + l02P.x * (dot(n, L) - dot(gN, L)), 0.35, 1.8);
  float ao = mix(1.0, orm.r, l02P.y);
  outgoingLight *= tint * ao * relief;
}
#include <opaque_fragment>`)
  }
  mat.customProgramCacheKey = () => `${previousKey()}|l02pbr${cfg.macro ? 'm' : ''}`
  return mat
}
