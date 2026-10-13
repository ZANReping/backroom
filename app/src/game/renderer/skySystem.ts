// 户外天空 + 体积云（v65）。所有带 SKY_PROFILES 的户外层级（L2/3/4/5/6/7/9/10/11）共用。
//
// 旧版：L2~L7 是 Worker 预烘的 2048×1024 静态位图天空（云不会动、贴在球面上、没有体积感）；
// L9~L11 是单层三维噪声着色的球面「云斑」，没有光照，只有明暗两色插值。
//
// v65 方案（性能 / 写实兼顾）：
//
// 1. 体积云在低分辨率「云层全景图」里光线步进，而不是逐屏幕像素步进。
//    天空没有视差（无限远），所以云只取决于方向：把地平线以上半球展开成 512×192 的等距柱状
//    渲染目标（低画质 256×96），每帧只重算其中 1/6 的行（时间切片），约 6 帧刷新一遍全图。
//    云层随风移动极慢，切片刷新肉眼不可见；每帧成本 ≈ 1.6 万像素 × 40 步，与屏幕分辨率无关。
//    主天空着色器只做一次纹理采样把云合成上去。
// 2. 云的物理：地球曲率球壳云层（层云 / 积云两种高度剖面），3D Perlin-Worley 可平铺噪声塑形
//    + 高频 Worley 侵蚀边缘；每个采样点向太阳/月亮做 5 步阴影步进（Beer–Lambert），
//    叠加「粉末效应」（云体内部暗、边缘亮）与双瓣 Henyey–Greenstein 相函数（迎光银边、背光暗底）；
//    环境光按云内高度在云底色/天顶色之间插值；远处云按距离融入地平线雾霭（大气透视）。
// 3. 天空底色：按仰角的天顶/中空/地平线三段渐变 + 地平线雾霭辉光 + 太阳 Mie 前向散射光晕；
//    太阳盘带临边昏暗，月盘带环形山明暗；夜空程序化星野（闪烁、近地平线消光）与银河光带；
//    高空卷云用平面投影噪声；地平线附近与场景雾色无缝衔接（远处地形与天空不再有色差缝）。
// 4. 一张 48³ 的 RG8 三维噪声贴图在首次使用时生成并缓存（约 220KB 显存）。
import * as THREE from 'three'
import { SKY_PROFILES, type SkyProfile } from './skyPixels'
import { getMaterialMode } from './shared'

// ------------------------------------------------------------------ 3D 噪声贴图
const N = 48
let noiseTex: THREE.Data3DTexture | null = null
let noiseUsers = 0

function hash3(x: number, y: number, z: number, s: number) {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(z, 1440662683) ^ s
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}
/** 可平铺 Worley（返回 1-F1，越靠近特征点越亮） */
function worley(x: number, y: number, z: number, P: number, seed: number) {
  const fx = x * P, fy = y * P, fz = z * P
  const ix = Math.floor(fx), iy = Math.floor(fy), iz = Math.floor(fz)
  let best = 9
  for (let dz = -1; dz <= 1; dz++) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    const cx = ix + dx, cy = iy + dy, cz = iz + dz
    const wx = ((cx % P) + P) % P, wy = ((cy % P) + P) % P, wz = ((cz % P) + P) % P
    const px = cx + hash3(wx, wy, wz, seed), py = cy + hash3(wx, wy, wz, seed + 1), pz = cz + hash3(wx, wy, wz, seed + 2)
    const d = (px - fx) ** 2 + (py - fy) ** 2 + (pz - fz) ** 2
    if (d < best) best = d
  }
  return 1 - Math.min(1, Math.sqrt(best))
}
/** 可平铺 value noise */
function vnoise(x: number, y: number, z: number, P: number, seed: number) {
  const fx = x * P, fy = y * P, fz = z * P
  const ix = Math.floor(fx), iy = Math.floor(fy), iz = Math.floor(fz)
  const tx = fx - ix, ty = fy - iy, tz = fz - iz
  const s = (t: number) => t * t * (3 - 2 * t)
  const ux = s(tx), uy = s(ty), uz = s(tz)
  const v = (a: number, b: number, c: number) => hash3(((a % P) + P) % P, ((b % P) + P) % P, ((c % P) + P) % P, seed)
  const l = (a: number, b: number, t: number) => a + (b - a) * t
  return l(l(l(v(ix, iy, iz), v(ix + 1, iy, iz), ux), l(v(ix, iy + 1, iz), v(ix + 1, iy + 1, iz), ux), uy),
    l(l(v(ix, iy, iz + 1), v(ix + 1, iy, iz + 1), ux), l(v(ix, iy + 1, iz + 1), v(ix + 1, iy + 1, iz + 1), ux), uy), uz)
}

export function skyNoiseTexture(): THREE.Data3DTexture {
  if (noiseTex) return noiseTex
  const data = new Uint8Array(N * N * N * 2)
  for (let z = 0; z < N; z++) for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const u = x / N, v = y / N, w = z / N
    // R：Perlin-Worley 基形（低频 value fBm 被 Worley 胞体「膨胀」→ 团块状积云）
    const fbm = vnoise(u, v, w, 4, 11) * .55 + vnoise(u, v, w, 8, 12) * .28 + vnoise(u, v, w, 16, 13) * .17
    const wb = worley(u, v, w, 3, 21) * .62 + worley(u, v, w, 6, 22) * .26 + worley(u, v, w, 12, 23) * .12
    const pw = Math.max(0, Math.min(1, (fbm - (1 - wb) * .55) / (1 - (1 - wb) * .55 + 1e-4)))
    // G：高频 Worley fBm（边缘侵蚀）
    const det = worley(u, v, w, 8, 31) * .6 + worley(u, v, w, 16, 32) * .28 + worley(u, v, w, 24, 33) * .12
    const i = (z * N * N + y * N + x) * 2
    data[i] = Math.round(pw * 255)
    data[i + 1] = Math.round(det * 255)
  }
  const t = new THREE.Data3DTexture(data, N, N, N)
  t.format = THREE.RGFormat
  t.type = THREE.UnsignedByteType
  t.wrapS = t.wrapT = t.wrapR = THREE.RepeatWrapping
  t.minFilter = t.magFilter = THREE.LinearFilter
  t.unpackAlignment = 1
  t.userData.skyOwned = true
  t.needsUpdate = true
  noiseTex = t
  return t
}

// ------------------------------------------------------------------ 着色器公共片段
const GLSL_COMMON = /* glsl */`
const float PI = 3.14159265;
const float RE = 6360.0;
float hg(float c, float g) { float g2 = g * g; return (1.0 - g2) / (4.0 * PI * pow(1.0 + g2 - 2.0 * g * c, 1.5)); }
float remap(float v, float a, float b, float c, float d) { return c + (v - a) / max(b - a, 1e-4) * (d - c); }
vec3 dirFromUv(vec2 uv) {
  float az = uv.x * 6.2831853;
  float s = mix(-0.06, 1.0, pow(uv.y, 1.5));
  float c = sqrt(max(0.0, 1.0 - s * s));
  return vec3(c * cos(az), s, c * sin(az));
}
vec2 uvFromDir(vec3 d) {
  float u = fract(atan(d.z, d.x) / 6.2831853);
  float v = pow(clamp((d.y + 0.06) / 1.06, 0.0, 1.0), 1.0 / 1.5);
  return vec2(u, v);
}`

const CLOUD_FRAG = (steps: number, lightSteps: number, detail: boolean) => /* glsl */`
precision highp float;
precision highp sampler3D;
uniform sampler3D tNoise;
uniform float uTime, uCoverage, uBase, uThick, uStratus, uSigma, uFade;
uniform vec3 uSunDir, uSunCol, uAmbTop, uAmbBot, uHaze, uAlbedo;
uniform vec2 uWind;
varying vec2 vUv;
${GLSL_COMMON}
float shellFar(float r, vec3 ro, vec3 rd) {
  float b = dot(ro, rd), c = dot(ro, ro) - r * r;
  float h = b * b - c;
  if (h < 0.0) return -1.0;
  return -b + sqrt(h);
}
float density(vec3 p, bool fine) {
  float h = (length(p) - RE - uBase) / uThick;
  if (h <= 0.0 || h >= 1.0) return 0.0;
  vec3 q = vec3(p.x, length(p) - RE, p.z);
  vec3 s = q * vec3(0.19, 0.30, 0.19) + vec3(uWind.x, uTime * 0.0035, uWind.y);
  float base = texture(tNoise, s).r;
  // 高度剖面：层云平坦、积云下平上圆
  float profS = smoothstep(0.0, 0.18, h) * (1.0 - smoothstep(0.55, 1.0, h));
  float profC = smoothstep(0.0, 0.08, h) * (1.0 - smoothstep(0.3, 1.0, h));
  float prof = mix(profC, profS, uStratus);
  float cov = uCoverage;
  // 层云：大尺度起伏加一层连续底云
  float b2 = mix(base, base * 0.72 + 0.28, uStratus * 0.6);
  float d = remap(b2 * prof, 1.0 - cov, 1.0, 0.0, 1.0);
  if (d <= 0.0) return 0.0;
  ${detail ? `if (fine) {
    float det = texture(tNoise, s * 3.6 + vec3(uTime * 0.006, 0.0, uTime * 0.004)).g;
    d = remap(d, (1.0 - det) * mix(0.42, 0.22, h), 1.0, 0.0, 1.0);
  }` : ''}
  return clamp(d, 0.0, 1.0);
}
void main() {
  vec3 rd = dirFromUv(vUv);
  if (rd.y < 0.0) { gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0); return; }
  vec3 ro = vec3(0.0, RE + 0.002, 0.0);
  float t0 = shellFar(RE + uBase, ro, rd);
  float t1 = shellFar(RE + uBase + uThick, ro, rd);
  t1 = min(t1, t0 + mix(10.0, 22.0, 1.0 - rd.y));
  float dt = (t1 - t0) / float(${steps});
  float jitter = fract(sin(dot(vUv * 913.7, vec2(12.9898, 78.233)) + uTime) * 43758.5453);
  float t = t0 + dt * jitter;
  vec3 S = vec3(0.0); float T = 1.0; float tw = 0.0, wsum = 0.0;
  float mu = dot(rd, uSunDir);
  float phase = mix(hg(mu, 0.5), hg(mu, -0.2), 0.3) * 4.0 * PI;
  for (int i = 0; i < ${steps}; i++) {
    vec3 p = ro + rd * t;
    float dn = density(p, true);
    if (dn > 0.003) {
      // 向光源的阴影步进
      float sum = 0.0, dl = uThick * 0.16;
      for (int j = 1; j <= ${lightSteps}; j++) {
        // 锥形抖动阴影采样（Horizon 式）：去掉视线与光线重合时的自相关「暗日」
        float fj = float(j);
        vec3 cone = normalize(vec3(sin(fj * 2.4 + 0.7), cos(fj * 3.7 + 1.9), sin(fj * 5.1 + 2.3)));
        sum += density(p + (uSunDir + cone * 0.45) * dl * fj, false);
      }
      float sig = dn * uSigma;
      float Tl = exp(-sum * dl * uSigma * 0.9) ;
      Tl = max(Tl, exp(-sum * dl * uSigma * 0.22) * 0.32); // 多重散射近似：厚云内部不会全黑
      float powder = 1.0 - exp(-dn * dl * uSigma * 2.0);
      float h = clamp((length(p) - RE - uBase) / uThick, 0.0, 1.0);
      vec3 amb = mix(uAmbBot, uAmbTop, h);
      vec3 Li = (uSunCol * Tl * phase * mix(0.45, 1.0, powder) + amb) * uAlbedo;
      float a = 1.0 - exp(-sig * dt);
      S += T * Li * a;
      tw += T * a * t; wsum += T * a;
      T *= 1.0 - a;
      if (T < 0.015) break;
    }
    t += dt;
  }
  // 大气透视：远处云融进地平线雾霭
  float dist = wsum > 0.0 ? tw / wsum : t0;
  float fade = exp(-dist / uFade);
  vec3 Sout = S * fade + uHaze * (1.0 - T) * (1.0 - fade);
  gl_FragColor = vec4(Sout, T);
}`

const SKY_VERT = /* glsl */`
varying vec3 vDir;
void main() {
  vDir = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`

const SKY_FRAG = /* glsl */`
precision highp float;
precision highp sampler3D;
uniform sampler2D tClouds;
uniform sampler3D tNoise;
uniform float uVeil;
uniform float uTime, uStars, uMilky, uCirrus, uSunSize, uBodyK, uIsMoon, uFogMix, uHorizonFog, uExposure;
uniform vec3 uZenith, uZenithMid, uHorizon, uHaze, uSunDir, uSunDisc, uGlow, uFogColor, uCirrusCol;
uniform vec3 uGlowA, uGlowB; uniform float uGlowAK, uGlowBK;
varying vec3 vDir;
${GLSL_COMMON}
float h21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
void main() {
  vec3 d = normalize(vDir);
  float y = d.y, yy = max(y, 0.0);
  // 1. 仰角渐变
  vec3 col = mix(uHorizon, uZenithMid, smoothstep(0.0, 0.32, pow(yy, 0.75)));
  col = mix(col, uZenith, smoothstep(0.3, 1.0, yy));
  col += uHaze * exp(-yy * 16.0) * 0.55;
  // 地平光晕（城市/工业光）：方位上缓慢起伏
  float az = atan(d.z, d.x);
  col += uGlowA * uGlowAK * exp(-yy * 9.0) * (0.65 + 0.35 * sin(az * 3.0 + 1.3));
  col += uGlowB * uGlowBK * exp(-yy * 14.0) * (0.6 + 0.4 * sin(az * 5.0 - 0.7));
  // 2. 星野与银河（云前计算，随后被云透射率遮挡）
  vec3 night = vec3(0.0);
  if (uStars > 0.001 && y > 0.0) {
    vec2 sp = vec2(az * 140.0, asin(clamp(y, -1.0, 1.0)) * 140.0);
    vec2 cell = floor(sp);
    float h = h21(cell);
    if (h > 1.0 - uStars * 0.06) {
      vec2 c = cell + vec2(h21(cell + 7.1), h21(cell + 3.3));
      float r = length(sp - c);
      float mag = pow(h21(cell + 1.9), 6.0);
      float tw = 0.75 + 0.25 * sin(uTime * (2.0 + h * 5.0) + h * 40.0);
      night += vec3(0.8 + 0.2 * h, 0.85, 1.0) * (1.0 - smoothstep(0.0, 0.55, r)) * (0.25 + 1.6 * mag) * tw;
    }
    night *= smoothstep(0.0, 0.25, y);
    if (uMilky > 0.001) {
      vec3 mwN = normalize(vec3(0.35, 0.55, 0.76));
      float band = exp(-pow(dot(d, mwN) / 0.16, 2.0));
      float mw = texture(tNoise, d * 0.9 + 0.3).r * 0.7 + texture(tNoise, d * 2.7).g * 0.3;
      night += vec3(0.55, 0.6, 0.75) * band * smoothstep(0.25, 0.75, mw) * uMilky * 0.22 * smoothstep(0.0, 0.3, y);
    }
  }
  // 3. 太阳 / 月亮
  float mu = dot(d, uSunDir);
  float disc = 0.0;
  if (uBodyK > 0.0) {
    float cosR = cos(uSunSize);
    float edge = (mu - cosR) / (1.0 - cosR);
    disc = smoothstep(-0.04, 0.04, edge);
    if (uIsMoon > 0.5) {
      vec3 mr = normalize(cross(vec3(0.0, 1.0, 0.0), uSunDir)), mu2 = cross(uSunDir, mr);
      vec2 mp = vec2(dot(d, mr), dot(d, mu2)) / sin(uSunSize);
      float cr = texture(tNoise, vec3(mp * 0.35, 0.37)).r * 0.6 + texture(tNoise, vec3(mp * 0.9, 0.71)).g * 0.4;
      vec3 moonC = uSunDisc * mix(0.62, 1.05, smoothstep(0.25, 0.75, cr));
      col += uGlow * (pow(max(mu, 0.0), 220.0) * 0.35 + pow(max(mu, 0.0), 24.0) * 0.06) * uBodyK;
      night = mix(night, vec3(0.0), disc);
      col = mix(col, moonC, disc * uBodyK);
    } else {
      // Mie 前向散射光晕 + 临边昏暗太阳盘
      col += uGlow * (hg(mu, 0.78) * 0.09 + pow(max(mu, 0.0), 6.0) * 0.12) * uBodyK;
      float limb = sqrt(max(0.0, 1.0 - pow(clamp(1.0 - edge, 0.0, 1.0), 2.0)));
      col = mix(col, uSunDisc * (0.6 + 0.4 * limb) * 4.0, disc * uBodyK);
    }
  }
  // 4. 高空卷云：平面投影的拉伸噪声
  if (uCirrus > 0.001 && y > 0.0) {
    vec2 pp = d.xz / (y + 0.12);
    vec3 q = vec3(pp.x * 0.35 + uTime * 0.002, pp.y * 1.4, uTime * 0.0008);
    float cn = texture(tNoise, q).r * 0.65 + texture(tNoise, q * 3.1).g * 0.35;
    float ci = smoothstep(0.48, 0.85, cn) * uCirrus * smoothstep(0.0, 0.18, y);
    col = mix(col, uCirrusCol, ci * 0.55);
  }
  col += night;
  // 5. 体积云合成：天空 × 透射率 + 云的散射光
  if (y > -0.06) {
    vec4 c = texture2D(tClouds, uvFromDir(d));
    float k = smoothstep(-0.06, 0.0, y);
    col = mix(col, col * c.a + c.rgb, k);
    // 云后日/月的漫射亮斑：薄云处透出清晰轮廓、厚云处化成柔和光团（不会出现「暗日」）
    float thru = pow(c.a, 0.45) * uBodyK * k;
    col += uSunDisc * thru * (hg(mu, 0.92) * 0.035 + hg(mu, 0.72) * 0.05) * mix(1.0, 0.25 + uVeil * 1.6, uIsMoon);
  }
  // 6. 地平线以下 → 雾色；地平线附近与场景雾无缝衔接
  col = mix(col, uFogColor, uHorizonFog * exp(-yy * 22.0));
  col = mix(col, uFogColor, 1.0 - smoothstep(-0.06, 0.0, y));
  col = mix(col, uFogColor, uFogMix);
  // 不做 ACES 色调映射：profile 中的天顶/地平线色即最终显示色（与旧天空亮度一致），
  // 只做线性→sRGB 输出转换；太阳盘 >1 的部分自然饱和为白。
  col *= uExposure;
  // 高光肩部：亮云/日晕平滑压到 1 以内，不会整片过曝成纯白
  vec3 hi = max(col - 0.62, 0.0);
  col = min(col, 0.62) + 0.38 * (1.0 - exp(-hi * 2.6));
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}`

// ------------------------------------------------------------------ 天空系统
const lin = (hex: string) => new THREE.Color(hex)

export interface SkyQuality { w: number; h: number; steps: number; light: number; slices: number; detail: boolean }
const QUALITY: Record<'high' | 'low', SkyQuality> = {
  high: { w: 512, h: 192, steps: 40, light: 5, slices: 6, detail: true },
  low: { w: 256, h: 96, steps: 18, light: 3, slices: 4, detail: false },
}

export class SkySystem {
  readonly mesh: THREE.Mesh
  private rt: THREE.WebGLRenderTarget
  private cloudMat: THREE.ShaderMaterial
  private skyMat: THREE.ShaderMaterial
  private scene = new THREE.Scene()
  private cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
  private slice = 0
  private primed = false
  private q: SkyQuality
  private baseCoverage: number
  private disposed = false

  constructor(id: number, sunDir: THREE.Vector3) {
    const P: SkyProfile = SKY_PROFILES[id]
    this.q = getMaterialMode() === 'classic' ? QUALITY.low : QUALITY.high
    const noise = skyNoiseTexture()
    noiseUsers++
    this.rt = new THREE.WebGLRenderTarget(this.q.w, this.q.h, {
      type: THREE.HalfFloatType, format: THREE.RGBAFormat, depthBuffer: false, stencilBuffer: false,
      minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: false,
    })
    this.rt.texture.wrapS = THREE.RepeatWrapping
    this.rt.texture.wrapT = THREE.ClampToEdgeWrapping
    const cl = P.clouds
    const overcast = cl?.overcast ?? (cl && cl.density > .8 ? .7 : 0)
    const body = P.sun ?? P.moon
    const night = !P.sun
    const light = (P.sunLight ?? .4)
    const sunCol = lin(P.sunColor ?? '#ffffff').multiplyScalar(night ? light * 1.3 : light * 1.45)
    const zen = lin(P.zenith), hor = lin(P.horizon)
    const albedo = lin(cl?.color ?? '#c8ccd0')
    // 云的反照率取 profile 云色相对其亮度的色相，亮度由光照决定（避免把「暗色云」再乘一遍光照）
    const albLum = Math.max(.05, albedo.r * .3 + albedo.g * .59 + albedo.b * .11)
    // 只保留约 30% 的色相：真实云几乎是中性灰白，色调主要来自光照与天光
    albedo.lerp(new THREE.Color(albLum, albLum, albLum), .7).multiplyScalar(.92 / albLum)
    this.baseCoverage = cl ? .32 + cl.density * .55 : 0
    this.cloudMat = new THREE.ShaderMaterial({
      uniforms: {
        tNoise: { value: noise },
        uTime: { value: 0 },
        uCoverage: { value: this.baseCoverage },
        uBase: { value: overcast > .5 ? .7 : 1.4 },
        uThick: { value: overcast > .5 ? 1.0 : 2.2 },
        uStratus: { value: Math.min(1, overcast) },
        uSigma: { value: overcast > .5 ? 26 : 34 },
        uFade: { value: 16 },
        uSunDir: { value: sunDir.clone().normalize() },
        uSunCol: { value: sunCol },
        uAmbTop: { value: zen.clone().lerp(hor, .3).multiplyScalar(night ? .55 : .7) },
        uAmbBot: { value: hor.clone().multiplyScalar(night ? .2 : .32) },
        uHaze: { value: lin(P.horizon).lerp(lin(P.haze), .3) },
        uAlbedo: { value: albedo },
        uWind: { value: new THREE.Vector2() },
      },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: CLOUD_FRAG(this.q.steps, this.q.light, this.q.detail),
      depthTest: false, depthWrite: false, blending: THREE.NoBlending,
    })
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.cloudMat)
    quad.frustumCulled = false
    this.scene.add(quad)

    const glows = P.horizonGlow ?? []
    this.skyMat = new THREE.ShaderMaterial({
      uniforms: {
        tClouds: { value: cl ? this.rt.texture : null },
        tNoise: { value: noise },
        uTime: { value: 0 },
        uStars: { value: P.stars ?? 0 },
        uMilky: { value: P.milkyWay ?? 0 },
        uCirrus: { value: cl?.cirrus ?? 0 },
        uCirrusCol: { value: lin(cl?.color ?? '#ffffff').lerp(lin('#ffffff'), night ? 0 : .35) },
        uSunSize: { value: body ? Math.max(.012, body.size * .0042) : .02 },
        uBodyK: { value: body ? (P.moon ? .9 + (cl?.moonVeil ?? 0) * .1 : 1 - (cl?.density ?? 0) * .55) : 0 },
        uIsMoon: { value: P.moon && !P.sun ? 1 : 0 },
        uVeil: { value: cl?.moonVeil ?? 0 },
        uFogMix: { value: 0 },
        uHorizonFog: { value: .55 },
        // L9 的 profile 底色极暗（为位图天空调的），旧着色器实际显示亮度约为其 2 倍：按旧观感补偿
        uExposure: { value: id === 9 ? 2.1 : 1 },
        uZenith: { value: zen },
        uZenithMid: { value: lin(P.zenithMid ?? P.zenith) },
        uHorizon: { value: hor },
        uHaze: { value: lin(P.haze).multiplyScalar(.6) },
        uSunDir: { value: sunDir.clone().normalize() },
        uSunDisc: { value: lin(body?.color ?? '#ffffff') },
        uGlow: { value: lin(P.sun?.glow ?? P.moon?.color ?? '#ffffff') },
        uFogColor: { value: hor.clone() },
        uGlowA: { value: lin(glows[0]?.color ?? '#000000') }, uGlowAK: { value: glows[0]?.alpha ?? 0 },
        uGlowB: { value: lin(glows[1]?.color ?? '#000000') }, uGlowBK: { value: glows[1]?.alpha ?? 0 },
      },
      vertexShader: SKY_VERT,
      fragmentShader: SKY_FRAG.replace('vec4 c = texture2D(tClouds', cl ? 'vec4 c = texture2D(tClouds' : 'vec4 c = vec4(0.0, 0.0, 0.0, 1.0); //'),
      side: THREE.BackSide, depthWrite: false, depthTest: true, fog: false, toneMapped: false,
    })
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(42, 48, 24), this.skyMat)
    this.mesh.name = 'skybox'
    this.mesh.renderOrder = -1000
    this.mesh.frustumCulled = false
    this.mesh.userData.sky = this
    this.mesh.userData.noCastShadow = 1
    if (!cl) this.primed = true
  }

  /** 天气：覆盖率增量（雨/阴 +，晴 0）与整体雾化。 */
  setWeather(coverageBoost: number, fogMix: number) {
    this.cloudMat.uniforms.uCoverage.value = Math.max(0, Math.min(.97, this.baseCoverage + coverageBoost))
    this.skyMat.uniforms.uFogMix.value = Math.max(0, Math.min(1, fogMix))
  }

  /** Low texture quality also caps cloud work, including realistic mode on mobile. */
  setQuality(tier: 'high' | 'low') {
    if (this.disposed || this.q === QUALITY[tier]) return
    this.q = QUALITY[tier]
    this.rt.setSize(this.q.w, this.q.h)
    this.cloudMat.fragmentShader = CLOUD_FRAG(this.q.steps, this.q.light, this.q.detail)
    this.cloudMat.needsUpdate = true
    this.slice = 0
    this.primed = false
  }

  /** 每帧调用：推进时间、同步场景雾色，并对云层全景图做一片时间切片重算。 */
  update(renderer: THREE.WebGLRenderer, time: number, fogColor?: THREE.Color) {
    if (this.disposed) return
    this.skyMat.uniforms.uTime.value = time
    if (fogColor) this.skyMat.uniforms.uFogColor.value.copy(fogColor)
    if (!this.skyMat.uniforms.tClouds.value) return
    const u = this.cloudMat.uniforms
    u.uTime.value = time
    // 风：约 9 m/s 等效（云层全景中每分钟移动约一个纹素）
    u.uWind.value.set(time * .00055, time * .00021)
    const prevTarget = renderer.getRenderTarget()
    const prevFace = renderer.getActiveCubeFace(), prevMip = renderer.getActiveMipmapLevel()
    const prevAuto = renderer.autoClear
    renderer.autoClear = false
    const H = this.q.h
    if (!this.primed) {
      this.rt.scissorTest = false
      this.primed = true
    } else {
      const rows = Math.ceil(H / this.q.slices)
      const y0 = this.slice * rows
      this.rt.scissor.set(0, y0, this.q.w, Math.min(rows, H - y0))
      this.rt.scissorTest = true
      this.slice = (this.slice + 1) % this.q.slices
    }
    try {
      renderer.setRenderTarget(this.rt)
      renderer.render(this.scene, this.cam)
    } finally {
      renderer.setRenderTarget(prevTarget, prevFace, prevMip)
      renderer.autoClear = prevAuto
    }
  }

  dispose() {
    if (this.disposed) return
    this.disposed = true
    this.rt.dispose()
    this.cloudMat.dispose()
    this.skyMat.dispose()
    this.mesh.geometry.dispose()
    ;(this.scene.children[0] as THREE.Mesh).geometry.dispose()
    // Retain deterministic CPU pixels, but release GPU storage after the last sky.
    if (--noiseUsers === 0) noiseTex?.dispose()
  }
}
