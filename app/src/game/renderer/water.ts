// 通用水体着色（v64）：湖泊 / 海面 / 室内泳池 / 夜间泳池 / 地下湖共用一套实现，按预设调参。
//
// 目标：在不读深度纹理、不做屏幕空间反射、不渲染反射相机的前提下（这些在 WebGL 低端设备上
// 都很贵），用每顶点水深 + 解析波面把「像水」的几个关键线索做对：
//
//   1. 光学深度：按 Beer–Lambert 以「视线穿水路程 = 水深 / cosθ」计算透射率。浅滩清澈见底、
//      深处变成水体本色；斜看时路程变长，同一处水显得更深（真实水面的重要特征）。
//   2. 菲涅尔：Schlick 近似（F0≈0.02 的水），掠射角反射天空，俯视主要看到水下。
//      反射色按反射向量的仰角在天顶色与地平线色之间插值（假天空反射，零额外采样）。
//   3. 波面法线：若干方向波的解析梯度 + 随风漂移的噪声细浪；细浪随距离淡出防闪烁。
//      高画质另加 Gerstner 顶点起伏（近岸自动衰减，水不会漫出岸线）。
//   4. 软岸线：水深趋近 0 时透明度连续降到 0，水面与倾斜岸坡自然相交，看不到方格边；
//      可选岸边泡沫/湿亮带。
//   5. 雨滴涟漪：下雨时按网格随机生成扩散的同心环（高画质）。
//   6. 高光：阴天柔和的天光宽高光 + 近处细碎波光，背面（水下仰视）只做轻微吸收保留透光。
//
// 成本：一张透明材质；片元约 6~10 个三角函数 + 2 次哈希噪声；无额外纹理、无额外渲染通道。
// 低画质（设置「真实水体」关闭）：无顶点起伏、无雨环、细浪只取 1 层——依然保留光学深度、
// 菲涅尔和软岸线这三个最影响真实感的部分。
import * as THREE from 'three'

export const waterUniforms = {
  uWaterTime: { value: 0 },
  uWaterRain: { value: 0 },
  uWaterWind: { value: .5 },
  uWaterWindDir: { value: new THREE.Vector2(.86, .51) },
  uWaterOrigin: { value: new THREE.Vector2(0, 0) },
}

/** v66：L7 七层之物涌浪（场景坐标）：x,y=波源 xz；z=振幅(m)；w=波前半径(m)。z<=0 时关闭。 */
export const l7SurgeUniforms = { uL7Surge: { value: new THREE.Vector4(0, 0, 0, 0) } }
/** 与着色器同一公式的 CPU 版本（引擎用于玩家起伏与推力）。返回海面高度偏移（米）。 */
export function l7SurgeHeight(px: number, pz: number, s: { x: number; y: number; z: number; w: number }): number {
  if (s.z <= 0) return 0
  const d = Math.hypot(px - s.x, pz - s.y), x = d - s.w
  return s.z * Math.exp(-(x * x) / (2 * 16 * 16)) * Math.exp(-d / 140) * Math.sin(x * 0.45)
}
const SURGE_GLSL = `uniform vec4 uL7Surge;
float l7Surge(vec2 p){ if (uL7Surge.z <= 0.0) return 0.0; float d = length(p - uL7Surge.xy); float x = d - uL7Surge.w;
  return uL7Surge.z * exp(-x * x / 512.0) * exp(-d / 140.0) * sin(x * 0.45); }`

export function updateWaterUniforms(time: number, opts?: { rain?: number; wind?: number; windDir?: { x: number; y: number }; origin?: { x: number; y: number } }) {
  waterUniforms.uWaterTime.value = time
  if (opts?.rain !== undefined) waterUniforms.uWaterRain.value = opts.rain
  if (opts?.wind !== undefined) waterUniforms.uWaterWind.value = opts.wind
  if (opts?.windDir) waterUniforms.uWaterWindDir.value.set(opts.windDir.x, opts.windDir.y)
  if (opts?.origin) waterUniforms.uWaterOrigin.value.set(opts.origin.x, opts.origin.y)
}

export interface WaterPreset {
  /** 水体散射本色（深处看到的颜色） */
  body: string
  /** 天顶 / 地平线反射色 */
  sky: string
  horizon: string
  /** 每米消光系数（R,G,B）：越大越浑；清水红光衰减最快 */
  absorb: [number, number, number]
  /** 菲涅尔反射混入上限（0~1） */
  reflect: number
  /** 波面坡度强度 */
  slope: number
  /** 主波长尺度（米） */
  scale: number
  /** 顶点起伏幅度（米，仅高画质） */
  swell: number
  /** 天光宽高光 / 细碎波光 */
  sheen: number
  glint: number
  /** 岸边泡沫/湿亮带宽度（米）与强度 */
  foamWidth: number
  foam: number
  /** 响应雨滴涟漪 */
  rain: boolean
}

export const WATER_PRESETS = {
  // L10：清澈、溶氧高、无藻类的低地湖（维基）——近岸几乎透明，深处偏墨绿灰；阴天反射铅灰色天空
  lake: { body: '#1a2a27', sky: '#6f777a', horizon: '#848b8c', absorb: [.62, .30, .26], reflect: .58, slope: .55, scale: 1, swell: .02, sheen: .12, glint: .45, foamWidth: .14, foam: .22, rain: true },
  // L7：阴天灰蓝海
  // v66：Fandom「海洋基本保持静止，几乎没有任何波浪」——起伏与坡度大幅降低；唯一的涌浪来自七层之物（uL7Surge）。
  //      超纯水：吸收系数更低（浅海清澈见底），散射本色偏冷青。
  sea: { body: '#0b2c38', sky: '#5d7683', horizon: '#7d929b', absorb: [.36, .12, .085], reflect: .74, slope: .62, scale: 1.25, swell: .045, sheen: .22, glint: .75, foamWidth: .35, foam: .3, rain: true },
  // 室内泳池：亮蓝、清澈
  pool: { body: '#0c2733', sky: '#26333a', horizon: '#33424a', absorb: [.5, .16, .1], reflect: .4, slope: .7, scale: .7, swell: .006, sheen: .1, glint: .5, foamWidth: 0, foam: 0, rain: false },
  // L9 夜间泳池：只有极暗的天光
  nightPool: { body: '#06151d', sky: '#151f26', horizon: '#1b262d', absorb: [.6, .25, .16], reflect: .25, slope: .7, scale: .7, swell: .006, sheen: .035, glint: .16, foamWidth: 0, foam: 0, rain: true },
  // L8 地下湖：深色、几乎无天光反射
  cave: { body: '#0b1d20', sky: '#1d3035', horizon: '#24393d', absorb: [.7, .3, .26], reflect: .45, slope: .5, scale: 1.2, swell: .008, sheen: .05, glint: .3, foamWidth: .1, foam: .1, rain: false },
} satisfies Record<string, WaterPreset>
export type WaterPresetName = keyof typeof WATER_PRESETS

const c3 = (hex: string) => { const c = new THREE.Color(hex); return `vec3(${c.r.toFixed(4)}, ${c.g.toFixed(4)}, ${c.b.toFixed(4)})` }
const f = (v: number) => v.toFixed(4)

/**
 * 给水面材质注入通用水体着色。几何需带 `aDepth`（米，可为负表示已在岸上，用于软岸线）。
 * 同一 (preset, quality) 共享一个着色器程序。
 */
export function applyWater(mat: THREE.Material, presetName: WaterPresetName, quality: 'low' | 'high') {
  if (mat.userData.waterApplied) return mat
  mat.userData.waterApplied = 1
  const P: WaterPreset = WATER_PRESETS[presetName]
  const hi = quality === 'high'
  const sea = presetName === 'sea'
  mat.transparent = true
  mat.depthWrite = false
  const previousCompile = mat.onBeforeCompile, previousKey = mat.customProgramCacheKey.bind(mat)
  mat.customProgramCacheKey = () => `water66-${presetName}-${quality}|${previousKey()}`
  mat.onBeforeCompile = (shader, renderer) => {
    previousCompile.call(mat, shader, renderer)
    Object.assign(shader.uniforms, waterUniforms)
    if (sea) Object.assign(shader.uniforms, l7SurgeUniforms)
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
uniform float uWaterTime; uniform vec2 uWaterOrigin; uniform float uWaterWind; uniform vec2 uWaterWindDir;
attribute float aDepth;
varying vec3 vWW;
varying float vWD;
${sea ? SURGE_GLSL : ''}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
{
  vec4 w4 = modelMatrix * vec4(position, 1.0);
  vWW = vec3(w4.x + uWaterOrigin.x, w4.y, w4.z + uWaterOrigin.y);
  vWD = aDepth;
  ${hi && P.swell > 0 ? `
  // Gerstner 风格的三向起伏，按水深在 0~0.6m 内衰减（水不漫出岸线）
  float t = uWaterTime, sw = ${f(P.swell)} * (0.6 + uWaterWind * 0.8) * smoothstep(0.0, 0.6, aDepth);
  vec2 p = vWW.xz / ${f(P.scale)};
  float h = sin(dot(p, vec2(0.21, 0.05)) + t * 0.55) * 0.5
          + sin(dot(p, vec2(-0.09, 0.17)) - t * 0.42) * 0.35
          + sin(dot(p, vec2(0.37, 0.29)) + t * 0.95) * 0.15;
  transformed.y += h * sw;` : ''}
  ${sea ? 'transformed.y += l7Surge(w4.xz) * smoothstep(0.0, 2.0, aDepth);' : ''}
}`)
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
uniform vec2 uWaterOrigin;
#define uWaterOriginF uWaterOrigin
uniform float uWaterTime; uniform float uWaterRain; uniform float uWaterWind; uniform vec2 uWaterWindDir;
varying vec3 vWW;
varying float vWD;
${sea ? SURGE_GLSL : ''}
vec3 gWN;
float wHash(vec2 p){ p = fract(p * vec2(127.1, 311.7)); p += dot(p, p + 19.19); return fract(p.x * p.y); }
float wNoise(vec2 p){ vec2 i = floor(p), q = fract(p); vec2 u = q * q * (3.0 - 2.0 * q);
  return mix(mix(wHash(i), wHash(i + vec2(1, 0)), u.x), mix(wHash(i + vec2(0, 1)), wHash(i + vec2(1, 1)), u.x), u.y); }
// 方向正弦波解析梯度
vec2 wGrad(vec2 p, float t, float k){
  vec2 g = vec2(0.0);
  g += vec2(0.50, 0.0) * cos(p.x * 0.50 + t * 1.05) * 0.30;
  g += vec2(0.36, 0.58) * cos(dot(p, vec2(0.36, 0.58)) - t * 0.80) * 0.26;
  g += vec2(-0.66, 0.31) * cos(dot(p, vec2(-0.66, 0.31)) + t * 1.35) * 0.14;
  g += vec2(1.25, -1.05) * cos(dot(p, vec2(1.25, -1.05)) + t * 2.10) * 0.075 * k;
  ${hi ? `g += vec2(2.45, 2.05) * cos(dot(p, vec2(2.45, 2.05)) - t * 2.90) * 0.045 * k;
  g += vec2(4.10, -3.55) * cos(dot(p, vec2(4.10, -3.55)) + t * 4.10) * 0.028 * k;` : ''}
  return g;
}
// 随风漂移的细浪：噪声有限差分梯度
vec2 wRipple(vec2 p, float t){
  vec2 d = uWaterWindDir * t * (0.35 + uWaterWind * 0.5);
  vec2 q = p * 2.3 - d * 2.3;
  float e = 0.08;
  float n0 = wNoise(q);
  vec2 g = vec2(wNoise(q + vec2(e, 0.0)) - n0, wNoise(q + vec2(0.0, e)) - n0) / e;
  ${hi ? `vec2 q2 = p * 6.1 - d * 4.0 + 7.3;
  float m0 = wNoise(q2);
  g += vec2(wNoise(q2 + vec2(e, 0.0)) - m0, wNoise(q2 + vec2(0.0, e)) - m0) / e * 0.45;` : ''}
  return g * 0.06;
}
// 雨滴涟漪：每 0.55m 一格，随机相位的扩散同心环
vec2 wRain(vec2 p, float t){
  vec2 g = vec2(0.0);
  for (int k = 0; k < 2; k++) {
    vec2 sp = p / 0.55 + float(k) * 13.7;
    vec2 cell = floor(sp);
    float ph = wHash(cell + float(k) * 3.1);
    float age = fract(t * 0.9 + ph);
    vec2 c = cell + vec2(wHash(cell + 1.7), wHash(cell + 4.3));
    vec2 dv = sp - c; float r = length(dv);
    float ring = sin((r - age * 0.9) * 28.0) * smoothstep(0.0, 0.08, age) * (1.0 - age) * smoothstep(0.55, 0.0, abs(r - age * 0.9) * 4.0);
    g += (dv / max(r, 1e-3)) * ring * 0.35;
  }
  return g;
}`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
{
  float near = 1.0 - smoothstep(9.0, 30.0, length(vSceneDirRaw));
  vec2 p = vWW.xz / ${f(P.scale)};
  float shoreCalm = 0.35 + 0.65 * smoothstep(0.0, 0.8, vWD);
  vec2 g = wGrad(p, uWaterTime, near) * ${f(P.slope)} * (0.6 + uWaterWind * 0.8) * shoreCalm;
  g += wRipple(vWW.xz, uWaterTime) * (0.3 + 0.7 * near) * (0.5 + uWaterWind);
  ${hi && P.rain ? 'g += wRain(vWW.xz, uWaterTime) * uWaterRain * near;' : ''}
  ${sea ? `{ vec2 sp = vWW.xz - uWaterOriginF; float s0 = l7Surge(sp); g += vec2(l7Surge(sp + vec2(0.6, 0.0)) - s0, l7Surge(sp + vec2(0.0, 0.6)) - s0) / 0.6; }` : ''}
  gWN = normalize(vec3(-g.x, 1.0, -g.y));
  vec3 vN = normalize((viewMatrix * vec4(gWN, 0.0)).xyz);
  normal = normalize(mix(normal, vN, 0.9));
}`)
      .replace('#include <opaque_fragment>', `#include <opaque_fragment>
{
  // vWW 含无限层窗口原点（只用于波纹相位）；视线方向用场景坐标计算
  vec3 V = normalize(vSceneDir);
  float ndv = clamp(dot(gWN, -V), 0.0, 1.0);
  // Schlick 菲涅尔（水 F0≈0.02）
  float F = 0.02 + 0.98 * pow(1.0 - ndv, 5.0);
  vec3 R = reflect(V, gWN);
  vec3 skyR = mix(${c3(P.horizon)}, ${c3(P.sky)}, smoothstep(0.0, 0.6, R.y));
  // 光学深度：路程 = 水深 / cos；透射率按通道衰减
  float depth = max(vWD, 0.0);
  float path = depth / max(ndv, 0.18);
  vec3 Tr = exp(-vec3(${f(P.absorb[0])}, ${f(P.absorb[1])}, ${f(P.absorb[2])}) * path);
  float trans = dot(Tr, vec3(0.3333));
  vec3 lit = gl_FragColor.rgb;
  // 水体颜色：散射本色（受场景光照调制）
  vec3 bodyC = ${c3(P.body)} * (0.55 + 0.45 * clamp(dot(lit, vec3(0.6)), 0.0, 1.6));
  vec3 col = mix(bodyC, lit, 0.25) * (1.0 - trans) + bodyC * 0.15;
  float a = 1.0 - trans;
  // 反射
  float refl = clamp(F * 1.25, 0.0, 1.0) * ${f(P.reflect)};
  col = mix(col, skyR, refl);
  a = max(a, refl);
  // 天光宽高光 + 细碎波光
  vec3 hS = normalize(vec3(0.0, 1.0, 0.0) - V);
  col += ${c3(P.sky)} * pow(clamp(dot(gWN, hS), 0.0, 1.0), 6.0) * ${f(P.sheen)};
  vec3 hG = normalize(normalize(vec3(0.35, 0.72, 0.28)) - V);
  float glint = pow(clamp(dot(gWN, hG), 0.0, 1.0), 260.0) * (1.0 - smoothstep(8.0, 32.0, length(vSceneDirRaw)));
  col += vec3(0.88, 0.93, 0.97) * glint * ${f(P.glint)};
  a = max(a, glint * 0.8);
  ${P.foamWidth > 0 ? `
  // 岸边泡沫/湿亮带：水深 < foamWidth 时出现，带噪声边缘与缓慢涌动
  float fz = 1.0 - smoothstep(0.0, ${f(P.foamWidth)}, depth);
  float fn = ${hi ? 'wNoise(vWW.xz * 3.1 + uWaterTime * 0.25) * 0.6 + wNoise(vWW.xz * 7.7 - uWaterTime * 0.4) * 0.4' : '0.55'};
  float foam = fz * smoothstep(0.35, 0.75, fn + fz * 0.3) * ${f(P.foam)};
  col = mix(col, vec3(0.82, 0.84, 0.8) * (0.6 + 0.4 * clamp(dot(lit, vec3(0.6)), 0.0, 1.5)), foam);
  a = max(a, foam * 0.85);` : ''}
  // 软岸线：水深趋近 0 时整体透明度连续降为 0
  float shore = smoothstep(-0.005, 0.07, vWD);
  if (vWD < -0.01) discard;
  // 背面（水下仰视）：只轻微吸收，保留斯涅尔窗的亮度
  ${sea ? `if (!gl_FrontFacing) {
    // v66 斯涅尔窗：水下仰视时，只有与竖直方向夹角 < 48.6°（水的临界角）的锥内能看到折射进来的天空；
    // 锥外发生全内反射，映出的是下方幽暗的水体。窗缘带一圈偏蓝的亮环（色散近似），并随细浪抖动。
    float cu = clamp(dot(V, gWN), -1.0, 1.0);
    float win = smoothstep(0.62, 0.69, cu);
    vec3 skyIn = mix(${c3(P.horizon)}, ${c3(P.sky)}, smoothstep(0.66, 1.0, cu)) * 1.35;
    vec3 tir = bodyC * 0.32;
    float rim = exp(-pow((cu - 0.655) / 0.022, 2.0));
    col = mix(tir, skyIn, win) + vec3(0.2, 0.32, 0.38) * rim * 0.55;
    a = mix(0.93, 0.8, win);
  }` : 'if (!gl_FrontFacing) { col = mix(lit, bodyC, 0.35); a = 0.45; }'}
  gl_FragColor = vec4(col, clamp(a, 0.0, 0.97) * shore);
}`)
    // 场景坐标系下的视线方向（不含窗口原点）
    shader.vertexShader = shader.vertexShader
      .replace('varying float vWD;', 'varying float vWD;\nvarying vec3 vSceneDir;\nvarying vec3 vSceneDirRaw;')
      .replace('vWD = aDepth;', 'vWD = aDepth;\n  vSceneDirRaw = w4.xyz - cameraPosition;\n  vSceneDir = normalize(vSceneDirRaw);')
    shader.fragmentShader = shader.fragmentShader
      .replace('varying float vWD;', 'varying float vWD;\nvarying vec3 vSceneDir;\nvarying vec3 vSceneDirRaw;')
  }
  return mat
}
