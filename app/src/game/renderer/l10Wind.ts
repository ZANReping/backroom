// Level 10 风场（v64）：麦田、树篱、树冠、远景冠层共用一张 GPU 风场。
//
// 旧版问题：把 `time × (1 + 阵风强度)` 直接当作相位推进，阵风强度变化时整片麦田瞬间换相
// （肉眼可见的「抽搐」）；风只是两组正弦叠加，看不到真实麦浪那种成片推进的明暗带。
//
// v64：
//   · CPU 侧把相位时间按速度积分（uWindTime），强度与风向各自平滑过渡，任何天气切换都不跳变；
//   · 顶点着色器以「沿风向移动的低频噪声」生成阵风团，阵风团所到之处麦穗成片伏倒——
//     这就是麦浪；叠加高频细颤与侧向摆动；弯曲时按弧长近似压低顶点，麦秆不会被拉长；
//   · 片元着色器按伏倒量提亮（被风压倒的麦秆露出更亮的茎秆与穗背），麦浪的明暗带随之推进；
//   · 玩家穿过麦田时周围 ~1m 的作物向外分开；
//   · 噪声采样使用真实世界坐标（加上无限层窗口原点），窗口重定位时风场不跳。
import * as THREE from 'three'

export const l10WindUniforms = {
  uL10WindTime: { value: 0 },
  uL10WindStrength: { value: .55 },
  uL10WindDir: { value: new THREE.Vector2(.86, .51) },
  uL10Origin: { value: new THREE.Vector2(0, 0) },
  uL10Player: { value: new THREE.Vector3(0, -99, 0) },
}

const state = { strength: .55, target: .55, dirA: .53, t: 0 }

/**
 * 每帧推进风场。weatherK/kind 来自 engine.l10Weather；origin 为无限层窗口原点（世界坐标偏移）。
 * player 为场景坐标（x, 脚底高度, z）。
 */
export function stepL10Wind(dt: number, kind: string, weatherK: number, origin: { x: number; y: number }, player?: { x: number; y: number; z: number }) {
  const d = Math.min(.1, Math.max(0, dt))
  const k = Math.max(0, Math.min(1, weatherK))
  state.target = .5 + (kind === 'gust' ? 1.05 : kind === 'rain' ? .45 : kind === 'mist' ? -.22 : 0) * k
  state.strength += (state.target - state.strength) * (1 - Math.exp(-d / 2.2))
  // 相位速度随强度增加，但始终是积分——不会跳相
  state.t += d * (.55 + state.strength * .75)
  // 风向缓慢漂移（约 ±25°，周期数分钟）
  state.dirA = .53 + Math.sin(state.t * .021) * .32 + Math.sin(state.t * .0067 + 1.3) * .14
  l10WindUniforms.uL10WindTime.value = state.t
  l10WindUniforms.uL10WindStrength.value = state.strength
  l10WindUniforms.uL10WindDir.value.set(Math.cos(state.dirA), Math.sin(state.dirA))
  l10WindUniforms.uL10Origin.value.set(origin.x, origin.y)
  if (player) l10WindUniforms.uL10Player.value.set(player.x, player.y, player.z)
  else l10WindUniforms.uL10Player.value.set(0, -99, 0)
}

/** 兼容旧调用：只推进时间（非 L10 层级无风场需求）。 */
export function updateL10Wind(time: number) { l10WindUniforms.uL10WindTime.value = time }

export interface L10WindOpts {
  /** 阵风满强度时顶端位移（米） */
  amp: number
  /** 'crop'：按局部高度 0~1.2m 取权重；'canopy'：整面同权；'leaf'：按高度 0.4~5m 取权重并加叶片细颤 */
  mode: 'crop' | 'canopy' | 'leaf'
  /** 玩家分开作物的幅度（米），0=不响应 */
  part?: number
  /** 片元按伏倒量提亮的强度 */
  sheen?: number
}

const GLSL_NOISE = `
float l10Hash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float l10Noise(vec2 p){
  vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(l10Hash(i), l10Hash(i + vec2(1.0, 0.0)), u.x), mix(l10Hash(i + vec2(0.0, 1.0)), l10Hash(i + vec2(1.0, 1.0)), u.x), u.y);
}`

/** 给材质注入 L10 风场。同一组参数共享同一个着色器程序。 */
export function withL10Wind<T extends THREE.Material>(mat: T, opts: L10WindOpts): T {
  const { amp, mode } = opts
  const part = opts.part ?? 0, sheen = opts.sheen ?? 0
  const prevCompile = mat.onBeforeCompile
  mat.onBeforeCompile = (shader, renderer) => {
    prevCompile?.call(mat, shader, renderer)
    Object.assign(shader.uniforms, l10WindUniforms)
    const tip = mode === 'crop' ? 'smoothstep(0.1, 1.25, position.y)'
      : mode === 'canopy' ? '1.0'
        : 'smoothstep(0.4, 5.0, position.y)'
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
uniform float uL10WindTime; uniform float uL10WindStrength; uniform vec2 uL10WindDir; uniform vec2 uL10Origin; uniform vec3 uL10Player;
varying float vL10Bend;
${GLSL_NOISE}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
{
  vec4 l10P = vec4(position, 1.0);
  #ifdef USE_INSTANCING
    l10P = instanceMatrix * l10P;
  #endif
  vec3 l10W = (modelMatrix * l10P).xyz;
  vec2 l10G = l10W.xz + uL10Origin;
  float l10Tip = ${tip};
  vec2 l10D = uL10WindDir, l10Q = vec2(-l10D.y, l10D.x);
  float l10Al = dot(l10G, l10D), l10Ac = dot(l10G, l10Q);
  float l10T = uL10WindTime;
  // 阵风团：沿风向向下游推进的低频噪声 → 成片推进的麦浪
  float l10Gust = smoothstep(0.28, 0.92, l10Noise(vec2(l10Al * 0.042 - l10T * 0.62, l10Ac * 0.028)));
  float l10Rip = l10Noise(vec2(l10Al * 0.19 - l10T * 2.3, l10Ac * 0.14));
  float l10Push = uL10WindStrength * (0.22 + 0.78 * l10Gust) * (0.72 + 0.28 * l10Rip);
  float l10Flut = sin(l10T * 7.1 + l10G.x * 1.9 + l10G.y * 2.6) * 0.09 * uL10WindStrength;
  float l10B = (l10Push + l10Flut) * ${amp.toFixed(3)} * l10Tip;
  vec2 l10Off = l10D * l10B + l10Q * sin(l10T * 1.9 + l10Al * 0.8 + l10Ac * 0.3) * 0.22 * l10B;
  ${mode === 'leaf' ? 'l10Off += vec2(sin(l10T * 11.0 + l10G.y * 5.0), cos(l10T * 9.0 + l10G.x * 5.0)) * 0.012 * uL10WindStrength * l10Tip;' : ''}
  ${part > 0 ? `
  vec2 l10Dp = l10W.xz - uL10Player.xz;
  float l10Pd = length(l10Dp);
  float l10Pk = (1.0 - smoothstep(0.2, 1.15, l10Pd)) * step(abs(l10W.y - uL10Player.y), 2.2) * l10Tip;
  l10Off += (l10Dp / max(l10Pd, 0.05)) * l10Pk * ${part.toFixed(3)};` : ''}
  // 世界位移换算到局部：实例只有统一缩放（无旋转），按缩放因子还原
  float l10S = 1.0;
  #ifdef USE_INSTANCING
    l10S = max(0.2, length(instanceMatrix[0].xyz));
  #endif
  transformed.xz += l10Off / l10S;
  // 弧长近似：弯得越厉害顶端越低，麦秆不被拉长
  transformed.y -= dot(l10Off, l10Off) * ${mode === 'crop' ? '0.55' : mode === 'canopy' ? '0.35' : '0.08'} / l10S;
  vL10Bend = clamp(l10Push * l10Tip, 0.0, 1.6);
}`)
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vL10Bend;')
      .replace('#include <map_fragment>', `#include <map_fragment>
  diffuseColor.rgb *= 1.0 + (vL10Bend - 0.45) * ${sheen.toFixed(3)};`)
  }
  const prevKey = mat.customProgramCacheKey?.bind(mat)
  mat.customProgramCacheKey = () => `l10wind2-${mode}-${amp}-${part}-${sheen}|${prevKey ? prevKey() : ''}`
  return mat
}
