// v66：Level 7 水体与深海氛围渲染层（L7 专用；其它层级不创建）。
//
// 组成（括号内为每帧绘制次数）：
//   · 分通道水下消光雾：全局 fog_fragment 增补——当 fog.near < 0（L7 水下哨兵值）时，红光最先被吸收、
//     其次绿光，蓝光最远（0 次额外绘制，所有材质自动生效）。
//   · 海床焦散：注入 L7 海床材质的自发光项，随水深指数衰减，约 30m 以下消失（0 次额外绘制）。
//   · 悬浮颗粒（1）：相机周围 22m 立方体内循环复用的 2200 个点精灵——水下是骨粉「海雪」，
//     水面以上是悬浮在空气里的骨质雾霾微粒（Fandom）。被手电光锥照到会亮起。
//   · 水下光柱（1）：48 条实例化轴向公告板光束，方向=折射后的阳光，高斯截面+前向散射，随深度淡出。
//   · 手电体积光锥（1）：仅水下+开手电时出现，加法混合，强度沿锥长衰减。
//   · 屏幕叠加（1）：半入水时的分屏水线与弯月面、随深度加深的压迫暗角、致幻时的边缘呼吸。
//   · 重力交界区（每区 2）：竖直水墙 + 倒悬水面（自带更远的雾距，在雾中可见轮廓）。
//   · 现实碎裂（2）：深渊与重力交界区附近闪烁的发光三角碎片与像素空洞（实例化）。
//   · 七层之物背脊（1）：涌浪事件时在远处雾中浮出的一段巨大背脊。
// 全部共享一套 uniforms，每帧只做常数级 CPU 工作。
import * as THREE from 'three'
import { waterUniforms } from './water'
import { skyLightDir } from './skybox'
import { mulberry } from './shared'

// ---------------- 分通道水下雾（全局一次性补丁） ----------------
let fogPatched = false
export function patchL7Fog() {
  if (fogPatched) return
  fogPatched = true
  const chunk = THREE.ShaderChunk.fog_fragment
  if (!chunk.includes('gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogFactor );')) return
  THREE.ShaderChunk.fog_fragment = chunk.replace('gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogFactor );', `gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogFactor );
	#ifndef FOG_EXP2
	if ( fogNear < 0.0 ) {
		// v66 L7 水下：Beer–Lambert 分通道消光——红光最先消失，其次绿光（标量 fogFactor 视作蓝通道）
		float l7f = smoothstep( 0.0, fogFar, vFogDepth );
		vec3 l7c = vec3( 1.0 - pow( 1.0 - l7f, 3.2 ), 1.0 - pow( 1.0 - l7f, 1.45 ), l7f );
		vec3 l7t = clamp( ( l7c - fogFactor ) / max( 1.0 - fogFactor, 1e-3 ), 0.0, 1.0 );
		gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, l7t );
	}
	#endif`)
}

// ---------------- 海床焦散 ----------------
export const l7CausticUniforms = { uL7Caustic: { value: 1 } }
/** 给 L7 海床材质注入焦散（场景坐标 + 窗口原点保证跨区块连续）。 */
export function addL7Caustics<T extends THREE.Material>(mat: T): T {
  const prev = mat.onBeforeCompile
  mat.onBeforeCompile = (sh, r) => {
    prev?.call(mat, sh, r)
    Object.assign(sh.uniforms, { uWaterTime: waterUniforms.uWaterTime, uWaterOrigin: waterUniforms.uWaterOrigin }, l7CausticUniforms)
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vL7W;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvL7W = (modelMatrix * vec4(position, 1.0)).xyz;')
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec3 vL7W; uniform float uWaterTime; uniform vec2 uWaterOrigin; uniform float uL7Caustic;
float l7Cau(vec2 p, float t){
  vec2 q = p * 0.62;
  float a = sin(q.x * 2.1 + sin(q.y * 1.7 + t * 0.55) * 1.6 + t * 0.42);
  float b = sin(q.y * 2.4 + sin(q.x * 1.3 - t * 0.5) * 1.5 - t * 0.37);
  float c = sin((q.x + q.y) * 1.6 + sin(q.x * 0.9 + t * 0.6) * 1.2 + t * 0.3);
  return pow(clamp(1.0 - abs(a + b + c) / 1.7, 0.0, 1.0), 5.0);
}`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
{
  float dep = -vL7W.y;
  if (dep > 0.2 && dep < 34.0) {
    vec2 wp = vL7W.xz + uWaterOrigin;
    // 两层错相焦散叠加，模拟色散的轻微分离（R/B 略错位）
    float cr = l7Cau(wp + vec2(0.06, 0.0), uWaterTime), cb = l7Cau(wp - vec2(0.06, 0.0), uWaterTime);
    float cg = l7Cau(wp * 1.37 + 3.1, uWaterTime * 1.13) * 0.6 + (cr + cb) * 0.2;
    float k = exp(-dep / 9.0) * smoothstep(0.2, 1.2, dep) * uL7Caustic;
    totalEmissiveRadiance += diffuseColor.rgb * vec3(cr, cg, cb) * vec3(0.55, 0.85, 0.95) * 1.6 * k;
  }
}`)
  }
  const key = mat.customProgramCacheKey?.bind(mat)
  mat.customProgramCacheKey = () => (key ? key() : '') + '-l7cau66'
  return mat
}

// ---------------- 通用小工具 ----------------
const FOG_GLSL = `uniform vec3 uFogC; uniform float uFogFar;
vec3 l7Fog(vec3 c, float dist, float farMul){ return mix(c, uFogC, smoothstep(0.0, uFogFar * farMul, dist)); }`

export interface L7FxInput {
  time: number
  cam: THREE.PerspectiveCamera
  /** 0=水上 1=水下 */
  uw: number
  /** 眼睛在水面以下的深度（米，水上为 0） */
  depth: number
  depthK: number
  eyeAbove: number
  waterY: number
  lightKeep: number
  flashOn: boolean
  flashPos: THREE.Vector3
  flashDir: THREE.Vector3
  halluc: number
  glitch: number
  fogColor: THREE.Color
  fogFar: number
  /** 场景坐标下的重力交界区 */
  zones: { id: number; x: number; z: number; ang: number; len: number; thick: number; top: number; r: number }[]
  /** 七层之物背脊（场景坐标）；null=无 */
  back: { x: number; z: number; dx: number; dz: number; env: number; t: number } | null
  hi: boolean
}

export class L7OceanFx {
  readonly group = new THREE.Group()
  private U = {
    uTime: { value: 0 }, uCam: { value: new THREE.Vector3() }, uUw: { value: 0 }, uDepth: { value: 0 }, uDepthK: { value: 0 },
    uKeep: { value: 1 }, uFlashOn: { value: 0 }, uFlashPos: { value: new THREE.Vector3() }, uFlashDir: { value: new THREE.Vector3(0, 0, -1) },
    uHalluc: { value: 0 }, uGlitch: { value: 0 }, uFogC: { value: new THREE.Color() }, uFogFar: { value: 30 }, uWaterY: { value: 0 },
    uEyeAbove: { value: 1 }, uInvP: { value: new THREE.Matrix4() }, uCamW: { value: new THREE.Matrix4() }, uRay: { value: 0 },
  }
  private snow: THREE.Points
  private rayMesh!: THREE.Mesh
  private rayDir = new THREE.Vector3(0, -1, 0)
  private cone: THREE.Mesh
  private overlay: THREE.Mesh
  private shards: THREE.InstancedMesh
  private voids: THREE.InstancedMesh
  private back: THREE.Group
  private zoneMeshes = new Map<number, THREE.Group>()
  private wallMat: THREE.ShaderMaterial
  private skySeaMat: THREE.ShaderMaterial
  private disposables: { dispose(): void }[] = []
  private tmpM = new THREE.Matrix4()
  private disposed = false

  constructor() {
    patchL7Fog()
    const random = mulberry(0x1761)
    this.group.name = 'l7-ocean-fx'
    const U = this.U
    // ---- 悬浮颗粒 ----
    {
      const N = 2200, pos = new Float32Array(N * 3), rnd = new Float32Array(N)
      for (let i = 0; i < N; i++) { pos[i * 3] = random(); pos[i * 3 + 1] = random(); pos[i * 3 + 2] = random(); rnd[i] = random() }
      const g = new THREE.BufferGeometry()
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
      g.setAttribute('aR', new THREE.BufferAttribute(rnd, 1))
      const mat = new THREE.ShaderMaterial({
        uniforms: U, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
        vertexShader: `uniform float uTime; uniform vec3 uCam; uniform float uUw; uniform float uKeep; uniform float uFlashOn; uniform vec3 uFlashPos; uniform vec3 uFlashDir; uniform float uWaterY;
attribute float aR; varying float vA; varying float vLit;
const float B = 22.0;
void main(){
  vec3 drift = vec3(sin(uTime * 0.05 + aR * 6.0) * 0.6, -uTime * (0.06 + aR * 0.05) * uUw + sin(uTime * 0.11 + aR * 9.0) * 0.3, cos(uTime * 0.04 + aR * 5.0) * 0.6);
  vec3 p = uCam + (fract(position + (drift - uCam) / B) - 0.5) * B;
  // 水下只画水面以下的颗粒；水上只画空中骨粉微粒（且稀疏）
  float side = uUw > 0.5 ? step(p.y, uWaterY - 0.05) : step(uWaterY + 0.15, p.y) * step(aR, 0.32);
  vec3 L = p - uFlashPos; float ld = length(L);
  float cone = smoothstep(0.86, 0.96, dot(L / max(ld, 1e-3), uFlashDir)) * clamp(1.0 - ld / 13.0, 0.0, 1.0) * uFlashOn;
  vLit = cone;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  float d = -mv.z;
  gl_PointSize = clamp((0.016 + aR * 0.022) * 1100.0 / max(d, 0.2), 1.0, 7.0);
  vA = side * smoothstep(0.25, 1.2, d) * (1.0 - smoothstep(B * 0.32, B * 0.5, d));
  vA *= (uUw > 0.5 ? (0.10 + 0.25 * uKeep) : 0.12) + cone * 1.6;
}`,
        fragmentShader: `varying float vA; varying float vLit;
void main(){ vec2 q = gl_PointCoord * 2.0 - 1.0; float d = dot(q, q); if (d > 1.0) discard;
  gl_FragColor = vec4(mix(vec3(0.55, 0.66, 0.66), vec3(0.95, 0.97, 0.9), vLit) * (1.0 - d), vA); }`,
      })
      this.snow = new THREE.Points(g, mat)
      this.snow.frustumCulled = false
      this.snow.renderOrder = 5
      this.group.add(this.snow)
      this.disposables.push(g, mat)
    }
    // ---- 水下光柱（v66.1：体积光束）----
    // 真实的水下光柱是阳光穿过起伏海面后被聚焦成的一束束「焦散光管」：
    //   · 所有光束彼此平行，方向 = 太阳方向经斯涅尔折射（n=1.33）后的水中光线方向（透视下汇聚到一个灭点）；
    //   · 截面是柔和的高斯分布，没有硬边；随海面波动缓慢明灭、粗细不一、成簇出现；
    //   · 前向散射（Henyey–Greenstein g≈0.7）：朝光源方向（仰望海面）看最亮，俯视几乎看不见；
    //   · 离海面越远越暗，并被水体雾吞没。
    // 实现：48 条实例化的「轴向公告板」——绕光束自身轴旋转以始终正对相机，因此从任何角度看都不会露出面片的薄边。
    {
      const N = 48
      const g = new THREE.InstancedBufferGeometry()
      const base = new THREE.PlaneGeometry(1, 1, 1, 20)
      base.translate(0, -0.5, 0) // y: 0(海面) → -1(末端)
      g.index = base.index
      g.setAttribute('position', base.attributes.position)
      g.setAttribute('uv', base.attributes.uv)
      const sh = new Float32Array(N * 4)
      for (let i = 0; i < N; i++) {
        // 成簇：每 4 条共享一个簇心，簇内小偏移
        const c = Math.floor(i / 4)
        const cx = (c * 0.6180339) % 1, cz = (c * 0.7548777 + 0.31) % 1
        sh[i * 4] = (cx + (random() - 0.5) * 0.06 + 1) % 1
        sh[i * 4 + 1] = (cz + (random() - 0.5) * 0.06 + 1) % 1
        sh[i * 4 + 2] = 0.18 + Math.pow(random(), 2.2) * 1.6 // 宽度：多数细、少数粗
        sh[i * 4 + 3] = random() * 100
      }
      g.setAttribute('aShaft', new THREE.InstancedBufferAttribute(sh, 4))
      g.instanceCount = N
      // 太阳方向（天空系统同源）→ 折射后的水中光线方向（指向下方）
      const sun = skyLightDir(7).normalize()
      const inc = sun.clone().negate()
      const nUp = new THREE.Vector3(0, 1, 0), eta = 1 / 1.33
      const cosi = -nUp.dot(inc), k = 1 - eta * eta * (1 - cosi * cosi)
      const refr = inc.clone().multiplyScalar(eta).add(nUp.clone().multiplyScalar(eta * cosi - Math.sqrt(Math.max(0, k)))).normalize()
      // 阴天天光漫射：光束比直射更接近竖直，取折射方向与竖直的折中
      this.rayDir = refr.lerp(new THREE.Vector3(0, -1, 0), 0.45).normalize()
      const mat = new THREE.ShaderMaterial({
        uniforms: Object.assign(U, { uRayDir: { value: this.rayDir } }),
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
        vertexShader: `uniform vec3 uCam; uniform vec3 uRayDir; uniform float uWaterY; uniform float uTime;
attribute vec4 aShaft; varying vec2 vUv; varying float vDist; varying float vPh; varying float vAlong; varying float vCosV; varying float vW;
const float B = 34.0;   // 光束分布范围（随相机循环复用）
const float L = 46.0;   // 光束长度
void main(){
  vec3 D = uRayDir;
  // 光束在相机深度处的穿越点：绕相机循环分布，并随海流极缓慢漂移
  vec2 drift = vec2(uTime * 0.035, uTime * 0.021);
  vec2 q = uCam.xz + (fract(aShaft.xy + (drift - uCam.xz) / B) - 0.5) * B;
  vec3 Q = vec3(q.x, uCam.y, q.y);
  vec3 P0 = Q - D * ((Q.y - uWaterY) / D.y); // 海面入射点
  float along = -position.y * L;              // 0..L
  vec3 C = P0 + D * along;
  vec3 toC = normalize(C - uCam);
  vec3 side = normalize(cross(D, toC));
  // 宽度随深度略微展开（光束发散），并随海面起伏「呼吸」
  float w = aShaft.z * (1.0 + along * 0.012) * (0.85 + 0.15 * sin(uTime * 0.7 + aShaft.w));
  vec3 P = C + side * position.x * w * 2.0;
  vUv = vec2(position.x * 2.0, along / L);
  vDist = length(P - uCam);
  vPh = aShaft.w; vAlong = along; vW = w;
  vCosV = dot(normalize(P - uCam), -D);
  gl_Position = projectionMatrix * viewMatrix * vec4(P, 1.0);
}`,
        fragmentShader: `uniform float uTime; uniform float uRay; uniform float uFogFar; varying vec2 vUv; varying float vDist; varying float vPh; varying float vAlong; varying float vCosV; varying float vW;
void main(){
  float x = vUv.x;
  float across = exp(-x * x * 3.2) * (1.0 - x * x);                 // 高斯截面，无硬边
  float top = smoothstep(0.0, 1.5, vAlong);                          // 贴海面处淡入
  float fall = exp(-vAlong / 17.0);                                   // 远离海面衰减
  // 海面波动造成的明灭：两组慢频相乘，偶尔整束熄灭
  float flick = clamp(0.35 + 0.65 * sin(uTime * (0.45 + fract(vPh) * 0.5) + vPh * 6.0) * sin(uTime * 0.23 + vPh * 2.3), 0.0, 1.0);
  // 沿光束方向的细密明暗（悬浮颗粒的散射不均匀）
  float grain = 0.82 + 0.18 * sin(vAlong * 0.8 + vPh * 11.0 - uTime * 0.6);
  // Henyey–Greenstein 前向散射（g=0.7），归一到朝光看=1
  float g = 0.7, c = clamp(vCosV, -1.0, 1.0);
  float hg = (1.0 - g * g) / pow(1.0 + g * g - 2.0 * g * c, 1.5) / ((1.0 - g * g) / pow(1.0 - g, 3.0) * 1.0);
  float phase = 0.08 + 0.92 * pow(hg, 0.45);
  float nearF = smoothstep(0.6, 3.5, vDist);
  float farF = 1.0 - smoothstep(uFogFar * 0.35, uFogFar * 1.1, vDist);
  float thin = 0.75 + 0.5 / (0.5 + vW);                               // 细光束单位亮度更高
  float I = across * top * fall * flick * grain * phase * nearF * farF * thin * uRay;
  gl_FragColor = vec4(vec3(0.58, 0.8, 0.82) * I * 0.21, 1.0);
}`,
      })
      this.rayMesh = new THREE.Mesh(g, mat)
      this.rayMesh.frustumCulled = false
      this.rayMesh.renderOrder = 6
      this.group.add(this.rayMesh)
      this.disposables.push(g, mat)
    }
    // ---- 手电体积光锥 ----
    {
      const L = 11, R = Math.tan(0.5) * L
      const g = new THREE.ConeGeometry(R, L, 24, 6, true)
      g.translate(0, -L / 2, 0)
      g.rotateX(-Math.PI / 2) // 尖端在原点，沿 -z 展开
      const mat = new THREE.ShaderMaterial({
        uniforms: U, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
        vertexShader: `varying float vT; varying vec3 vN; varying vec3 vV; void main(){ vT = position.z / ${L.toFixed(1)}; vec4 mv = modelViewMatrix * vec4(position, 1.0); vV = normalize(-mv.xyz); vN = normalize(normalMatrix * normal); gl_Position = projectionMatrix * mv; }`,
        fragmentShader: `uniform float uUw; uniform float uDepthK; uniform float uTime; varying float vT; varying vec3 vN; varying vec3 vV;
void main(){
  float rim = pow(abs(dot(vN, vV)), 1.6); // 正对视线的锥体中轴更亮，边缘柔和
  float along = pow(clamp(1.0 - vT, 0.0, 1.0), 1.7) * smoothstep(0.0, 0.06, vT);
  float grain = 0.85 + 0.15 * sin(vT * 40.0 - uTime * 1.3);
  float k = uUw * (0.06 + 0.07 * uDepthK);
  gl_FragColor = vec4(vec3(0.62, 0.78, 0.86) * rim * along * grain * k, 1.0);
}`,
      })
      this.cone = new THREE.Mesh(g, mat)
      this.cone.frustumCulled = false
      this.cone.renderOrder = 7
      this.group.add(this.cone)
      this.disposables.push(g, mat)
    }
    // ---- 屏幕叠加：水线 / 压迫暗角 / 致幻呼吸 ----
    {
      const g = new THREE.PlaneGeometry(2, 2)
      const mat = new THREE.ShaderMaterial({
        uniforms: U, transparent: true, depthTest: false, depthWrite: false, fog: false,
        vertexShader: `varying vec2 vNdc; void main(){ vNdc = position.xy; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
        fragmentShader: `uniform mat4 uInvP; uniform mat4 uCamW; uniform vec3 uCam; uniform float uWaterY; uniform float uEyeAbove; uniform float uTime;
uniform float uDepthK; uniform float uHalluc; uniform float uUw; uniform vec3 uFogC; uniform vec3 uRayDir; uniform float uKeep; varying vec2 vNdc;
void main(){
  vec4 col = vec4(0.0);
  // v66.1 水下天光散射：朝光源方向（海面）看，整片水体被向前散射的天光照亮——仰望更亮、俯视更暗
  if (uUw > 0.5) {
    vec4 hv = uInvP * vec4(vNdc, 1.0, 1.0); hv /= hv.w;
    vec3 hd = normalize((uCamW * vec4(hv.xyz, 0.0)).xyz);
    float up = max(dot(hd, -uRayDir), 0.0);
    float hz = (pow(up, 2.5) * 0.55 + pow(up, 24.0) * 0.45) * pow(1.0 - uDepthK, 3.0) * uKeep * 0.32;
    col = vec4(vec3(0.42, 0.62, 0.64), hz);
  }
  // 近平面上该像素的世界坐标（取相机前 0.12m 处的切面），与海面高度比较得到分屏水线
  if (abs(uEyeAbove) < 0.45) {
    vec4 v = uInvP * vec4(vNdc, -1.0, 1.0); v /= v.w;
    vec3 dir = normalize((uCamW * vec4(v.xyz, 0.0)).xyz);
    vec3 P = uCam + dir * 0.12;
    float h = uWaterY + sin(P.x * 3.1 + uTime * 1.7) * 0.006 + sin(P.z * 2.3 - uTime * 1.3) * 0.005;
    float s = P.y - h;
    float lineW = 0.0025;
    if (uEyeAbove > 0.0) {
      // 眼在水上：下半屏透过水面看水下——青色浑浊
      float under = (1.0 - smoothstep(-lineW, lineW, s));
      col = mix(col, vec4(0.04, 0.2, 0.24, 0.66), under);
    } else {
      // 眼在水下：上半屏是被水膜扭曲的空气——提亮、去色
      float over = smoothstep(-lineW, lineW, s);
      col = mix(col, vec4(vec3(0.62, 0.7, 0.72), 0.28), over);
    }
    // 弯月面：一条暗线加一道亮边
    float men = exp(-pow(s / 0.0035, 2.0));
    col = mix(col, vec4(0.02, 0.05, 0.06, 0.85), men * 0.8);
    col.rgb += vec3(0.5, 0.6, 0.6) * exp(-pow((s - 0.006) / 0.003, 2.0)) * 0.25;
  }
  // 压迫暗角：深度越大视野越窄；致幻时边缘缓慢呼吸并略带青绿色差
  vec2 q = vNdc;
  float r = length(q * vec2(1.0, 0.82));
  float breathe = uHalluc * (0.55 + 0.45 * sin(uTime * 0.8)) ;
  float vig = smoothstep(0.55 - uDepthK * 0.25 - breathe * 0.1, 1.45, r) * (uDepthK * 0.85 * uUw + breathe * 0.45);
  // Composite in premultiplied space: otherwise raising alpha for the vignette
  // reveals the RGB of invisible skylight and turns deep-water corners white.
  vig = clamp(vig, 0.0, 0.96);
  vec3 premul = col.rgb * col.a * (1.0 - vig) + vec3(0.0, 0.01 * breathe, 0.008 * breathe) * vig;
  col.a = col.a * (1.0 - vig) + vig;
  col.rgb = premul / max(col.a, 1e-5);
  if (col.a < 0.003) discard;
  gl_FragColor = col;
}`,
      })
      this.overlay = new THREE.Mesh(g, mat)
      this.overlay.frustumCulled = false
      this.overlay.renderOrder = 9990
      this.group.add(this.overlay)
      this.disposables.push(g, mat)
    }
    // ---- 现实碎裂：发光三角 + 像素空洞 ----
    {
      const tri = new THREE.BufferGeometry()
      tri.setAttribute('position', new THREE.BufferAttribute(new Float32Array([0, 0.5, 0, -0.43, -0.25, 0, 0.43, -0.25, 0]), 3))
      const vs = `uniform float uTime; uniform vec3 uCam; uniform float uGlitch; varying float vA; varying float vH;
float h1(float n){ return fract(sin(n) * 43758.5453); }
void main(){
  float id = float(gl_InstanceID);
  float rate = 0.6 + h1(id * 3.1) * 1.6;
  float cyc = floor(uTime * rate + h1(id));
  float s = id * 17.0 + cyc * 7.3;
  vec3 o = vec3(h1(s + 1.0), h1(s + 2.0), h1(s + 3.0)) * 2.0 - 1.0;
  float R = 6.0 + h1(s + 4.0) * 12.0;
  vec3 c = uCam + normalize(o + 1e-3) * R;
  float sz = (0.08 + h1(s + 5.0) * 0.3) * (0.6 + uGlitch * 0.6);
  float on = step(h1(s + 6.0), uGlitch * 0.9) * step(0.25, fract(uTime * rate + h1(id)));
  // 面片朝向相机（billboard）并按实例随机旋转
  vec3 f = normalize(uCam - c), rt = normalize(cross(vec3(0.0, 1.0, 0.0), f)), up = cross(f, rt);
  float a = h1(s + 7.0) * 6.283;
  vec2 lp = mat2(cos(a), -sin(a), sin(a), cos(a)) * position.xy * sz * on;
  vec3 w = c + rt * lp.x + up * lp.y;
  vA = on; vH = h1(s + 8.0);
  gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.0);
}`
      const glowMat = new THREE.ShaderMaterial({
        uniforms: U, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
        vertexShader: vs,
        fragmentShader: `uniform float uGlitch; varying float vA; varying float vH;
void main(){ vec3 c = vH < 0.6 ? vec3(0.45, 0.95, 1.0) : vH < 0.85 ? vec3(1.0) : vec3(0.95, 0.4, 0.9); gl_FragColor = vec4(c * vA * (0.5 + uGlitch), 1.0); }`,
      })
      const quad = new THREE.PlaneGeometry(0.7, 0.7)
      const voidMat = new THREE.ShaderMaterial({
        uniforms: U, transparent: false, depthWrite: true, side: THREE.DoubleSide, fog: false,
        vertexShader: vs.replace('float id = float(gl_InstanceID);', 'float id = float(gl_InstanceID) + 977.0;'),
        fragmentShader: `varying float vA; void main(){ if (vA < 0.5) discard; gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0); }`,
      })
      this.shards = new THREE.InstancedMesh(tri, glowMat, 150)
      this.voids = new THREE.InstancedMesh(quad, voidMat, 40)
      for (const im of [this.shards, this.voids]) { im.frustumCulled = false; im.visible = false; this.group.add(im) }
      this.disposables.push(tri, quad, glowMat, voidMat)
    }
    // ---- 七层之物背脊 ----
    {
      this.back = new THREE.Group()
      const mat = new THREE.ShaderMaterial({
        uniforms: U, fog: false,
        vertexShader: `varying vec3 vN; varying vec3 vW; void main(){ vN = normalize(mat3(modelMatrix) * normal); vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
        fragmentShader: `${FOG_GLSL} uniform vec3 uCam; varying vec3 vN; varying vec3 vW;
void main(){
  vec3 V = normalize(vW - uCam);
  float lam = 0.35 + 0.65 * max(0.0, vN.y);
  float fres = pow(1.0 - abs(dot(vN, -V)), 4.0);
  vec3 c = vec3(0.035, 0.04, 0.045) * lam + vec3(0.25, 0.3, 0.32) * fres * 0.5; // 湿亮的焦油色皮肤
  // 只用更长的雾距（×4.5）：在骨粉浓雾里只剩一道比雾更暗的剪影
  gl_FragColor = vec4(l7Fog(c, length(vW - uCam), 4.5), 1.0);
  if (vW.y < -0.4) discard;
}`,
      })
      // 一段长约 46m 的拱形背：主体为扁平管，背上一列高低错落的骨刺
      const pts: THREE.Vector3[] = []
      for (let i = 0; i <= 10; i++) { const t = i / 10; pts.push(new THREE.Vector3(-23 + t * 46, Math.sin(t * Math.PI) * 3.2 - 1.2, Math.sin(t * 4.0) * 0.8)) }
      const curve = new THREE.CatmullRomCurve3(pts)
      const body = new THREE.TubeGeometry(curve, 60, 2.6, 10, false)
      body.scale(1, 0.7, 1)
      const parts: THREE.BufferGeometry[] = [body]
      for (let i = 1; i < 22; i++) {
        const t = i / 22, P = curve.getPointAt(t)
        const h = 1.2 + Math.sin(t * Math.PI) * 3.4 * (0.6 + random() * 0.6)
        const s = new THREE.ConeGeometry(0.35 + random() * 0.25, h, 6)
        s.rotateZ(-0.35 - random() * 0.2)
        s.translate(P.x, P.y * 0.7 + 1.6 + h / 2, P.z)
        parts.push(s.toNonIndexed())
      }
      const merged = mergeSimple(parts.map((p) => (p.index ? p.toNonIndexed() : p)))
      merged.computeVertexNormals()
      const mesh = new THREE.Mesh(merged, mat)
      mesh.frustumCulled = false
      this.back.add(mesh)
      this.back.visible = false
      this.group.add(this.back)
      this.disposables.push(merged, mat, body)
    }
    // ---- 重力交界区材质 ----
    // v66.1：水墙改为「体积水体」——按视线穿过水墙的厚度做 Beer–Lambert 分通道吸收（边缘薄处通透、
    // 正对墙心最厚处浓青近乎不透明），表面是沿墙面水平流动的多组波（侧向重力），菲涅尔反射天光、
    // 窄高光、墙根与海面相接处翻涌泡沫、墙内透出的微弱焦散；轮廓随波起伏而不是直尺般笔直。
    // 摄像机进入墙体后改画背面：在临界角内看得见墙外（透明青色），之外发生全内反射。
    this.wallMat = new THREE.ShaderMaterial({
      uniforms: { ...U, uHalf: { value: new THREE.Vector3(1, 1, 1) }, uCamL: { value: new THREE.Vector3() }, uInside: { value: 0 } },
      transparent: true, depthWrite: false, side: THREE.FrontSide, fog: false,
      vertexShader: `uniform float uTime; uniform vec3 uHalf;
varying vec3 vL; varying vec3 vW; varying vec3 vNL; varying mat3 vM;
float wv(vec3 p){ // 沿墙面水平流动的起伏（米）
  return sin(p.x * 0.42 - uTime * 1.25 + p.y * 0.13) * 0.22 + sin(p.x * 1.17 + p.y * 0.61 - uTime * 2.1) * 0.08 + sin(p.y * 0.9 - p.x * 0.3 + uTime * 0.7) * 0.06;
}
void main(){
  vec3 p = position;
  // 侧面（局部 ±z）按波起伏外鼓；端面（±x）做较弱的晃动；上下端不动（与海面/倒悬海面相接）
  float keep = smoothstep(0.0, 2.5, uHalf.y - abs(p.y));
  // 角棱处位移归零，避免相邻面各自位移裂开
  if (abs(normal.z) > 0.5) p.z += sign(normal.z) * wv(p) * keep * smoothstep(0.0, 1.5, uHalf.x - abs(p.x));
  else if (abs(normal.x) > 0.5) p.x += sign(normal.x) * wv(p.zyx * 2.0) * 0.6 * keep * smoothstep(0.0, 0.8, uHalf.z - abs(p.z));
  vL = p; vNL = normal; vM = mat3(modelMatrix);
  vec4 w = modelMatrix * vec4(p, 1.0); vW = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}`,
      fragmentShader: `${FOG_GLSL} uniform vec3 uCam; uniform float uTime; uniform vec3 uHalf; uniform vec3 uCamL; uniform float uInside; uniform vec3 uRayDir;
varying vec3 vL; varying vec3 vW; varying vec3 vNL; varying mat3 vM;
vec2 wg(vec3 p){ // 表面波梯度（沿局部 x / y）
  float a = cos(p.x * 0.42 - uTime * 1.25 + p.y * 0.13), b = cos(p.x * 1.17 + p.y * 0.61 - uTime * 2.1), c = cos(p.y * 0.9 - p.x * 0.3 + uTime * 0.7);
  float d = cos(p.x * 3.1 - uTime * 3.4 + p.y * 1.7), e = cos(p.x * 5.3 + p.y * 2.9 - uTime * 4.6);
  return vec2(a * 0.092 + b * 0.094 - c * 0.018 + d * 0.05 + e * 0.025, a * 0.029 + b * 0.049 + c * 0.054 + d * 0.028 + e * 0.014);
}
float h21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y); }
float fbm(vec2 p){ return vn(p) * 0.5 + vn(p * 2.03 + 7.1) * 0.27 + vn(p * 4.1 - 3.7) * 0.15 + vn(p * 8.3 + 1.3) * 0.08; }
float cau(vec2 p, float t){ float a = sin(p.x * 1.3 + sin(p.y * 1.1 + t) * 1.4 + t * 0.6), b = sin(p.y * 1.5 + sin(p.x * 0.9 - t * 0.8) * 1.3); return pow(clamp(1.0 - abs(a + b) * 0.6, 0.0, 1.0), 6.0); }
void main(){
  // 上下两个端面与海面/倒悬海面融为一体，不单独画
  if (abs(vNL.y) > 0.5) discard;
  vec3 rd = normalize(vL - uCamL);
  // 视线与水墙长方体的相交区间（slab 法）
  vec3 inv = 1.0 / (rd + vec3(1e-5));
  vec3 t0 = (-uHalf - uCamL) * inv, t1 = (uHalf - uCamL) * inv;
  vec3 tn3 = min(t0, t1), tf3 = max(t0, t1);
  float tn = max(max(tn3.x, tn3.y), tn3.z), tf = min(min(tf3.x, tf3.y), tf3.z);
  float thick = max(0.0, tf - max(tn, 0.0));
  vec3 Tr = exp(-vec3(0.62, 0.24, 0.17) * thick);
  // 表面法线（局部）：面法线 + 波梯度扰动
  vec3 N = normalize(vNL);
  vec2 g = wg(vL);
  if (abs(vNL.z) > 0.5) N = normalize(N + vec3(-g.x, -g.y, 0.0) * sign(vNL.z) * 1.6 * sign(vNL.z));
  else if (abs(vNL.x) > 0.5) N = normalize(N + vec3(0.0, -g.y, -g.x) * 1.2);
  vec3 Nw = normalize(vM * N);
  vec3 V = normalize(vW - uCam);
  float ndv = abs(dot(Nw, V));
  float F = 0.02 + 0.98 * pow(1.0 - ndv, 5.0);
  vec3 R = reflect(V, Nw);
  vec3 skyR = mix(uFogC * 0.9, uFogC * 1.55 + vec3(0.04, 0.05, 0.05), smoothstep(-0.15, 0.7, R.y));
  float spec = pow(max(dot(R, -uRayDir), 0.0), 180.0) * 0.9 + pow(max(dot(R, -uRayDir), 0.0), 12.0) * 0.08;
  // 体内散射色：越厚越深；高处离两侧受光面都远，略暗
  vec3 shallow = vec3(0.06, 0.34, 0.36), deep = vec3(0.01, 0.09, 0.115);
  vec3 body = mix(deep, shallow, Tr.g) * (0.75 + 0.25 * (1.0 - smoothstep(-uHalf.y, uHalf.y, vL.y)));
  body += vec3(0.25, 0.4, 0.42) * cau(vL.xy * 1.1 + vL.z, uTime * 0.8) * Tr.g * 0.08 * (1.0 - smoothstep(-uHalf.y * 0.3, uHalf.y, vL.y));
  vec3 col; float a;
  if (uInside < 0.5) {
    col = mix(body, skyR, F) + vec3(0.9, 0.95, 0.95) * spec;
    a = clamp(1.0 - Tr.g * (1.0 - F), 0.0, 0.97);
    a = max(a, spec);
  } else {
    // 墙内向外看：临界角（48.6°）内看得见墙外，之外全内反射成墙体内部的暗青色
    float cosi = abs(dot(Nw, V));
    float win = smoothstep(0.62, 0.7, cosi);
    col = mix(deep * 1.4, mix(body, uFogC, 0.4), win);
    a = mix(0.92, 0.35, win);
  }
  // 墙根：与海面相接处翻涌的白沫（随波浪流动的噪声带），墙顶与倒悬海面相接处一圈亮线
  float foot = vL.y + uHalf.y;
  float along = abs(vNL.z) > 0.5 ? vL.x : vL.z;
  float fn = fbm(vec2(along * 0.9 - uTime * 0.8, foot * 1.6 - uTime * 0.35));
  float fz = smoothstep(0.42, 0.75, fn + 0.55 - foot * 0.45) * smoothstep(0.0, 0.15, foot + 0.15);
  fz += exp(-foot * 6.0) * 0.5 * fbm(vec2(along * 2.3 + uTime * 0.5, uTime * 0.7));
  col = mix(col, vec3(0.72, 0.78, 0.77) * (0.5 + uFogC.g * 0.6), clamp(fz, 0.0, 1.0) * 0.6);
  a = max(a, clamp(fz, 0.0, 1.0) * 0.6);
  col += vec3(0.3, 0.38, 0.4) * exp(-(uHalf.y - vL.y) * 2.0) * 0.4;
  // 两端 1.5m 内略微收薄（水墙端头是圆钝的，而不是刀切）
  a *= 0.55 + 0.45 * smoothstep(0.0, 1.5, uHalf.x - abs(vL.x));
  float d = length(vW - uCam);
  gl_FragColor = vec4(l7Fog(col, d, uInside > 0.5 ? 1.0 : 4.5), a);
}`,
    })
    this.skySeaMat = new THREE.ShaderMaterial({
      uniforms: { ...U, uR: { value: 70 } }, transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false,
      vertexShader: `varying vec3 vW; varying vec2 vL; void main(){ vL = position.xy; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: `${FOG_GLSL} uniform vec3 uCam; uniform float uTime; uniform float uR; varying vec3 vW; varying vec2 vL;
void main(){
  vec3 V = normalize(vW - uCam);
  // 倒悬海面：从下往上看，法线朝下。6 组不同方向/波长的细浪叠加（避免单向条纹），远处细浪淡出
  vec2 p = vW.xz;
  float dd = length(vW - uCam);
  float fine = 1.0 - smoothstep(15.0, 60.0, dd);
  vec2 g = vec2(0.0);
  g += vec2(0.21, 0.07) * cos(dot(p, vec2(0.21, 0.07)) + uTime * 0.55) * 1.0;
  g += vec2(-0.11, 0.19) * cos(dot(p, vec2(-0.11, 0.19)) - uTime * 0.42) * 1.1;
  g += vec2(0.37, -0.29) * cos(dot(p, vec2(0.37, -0.29)) + uTime * 0.9) * 0.45;
  g += vec2(-0.63, -0.41) * cos(dot(p, vec2(-0.63, -0.41)) - uTime * 1.3) * 0.22 * fine;
  g += vec2(1.07, 0.52) * cos(dot(p, vec2(1.07, 0.52)) + uTime * 1.7) * 0.1 * fine;
  g += vec2(-0.48, 1.31) * cos(dot(p, vec2(-0.48, 1.31)) - uTime * 2.1) * 0.07 * fine;
  vec3 N = normalize(vec3(g.x * 0.6, -1.0, g.y * 0.6));
  float ndv = clamp(dot(N, -V), 0.0, 1.0);
  float F = 0.02 + 0.98 * pow(1.0 - ndv, 5.0);
  // 仰望「天上的海」：窗内透进对面那片海的暗青水体，掠射角处反射下方雾海
  float cosv = clamp(V.y, 0.0, 1.0);
  vec3 deep = mix(vec3(0.015, 0.06, 0.085), vec3(0.05, 0.17, 0.2), smoothstep(0.66, 0.95, cosv));
  vec3 c = mix(deep, uFogC * 0.85, F);
  c += vec3(0.1, 0.14, 0.15) * pow(max(0.0, dot(normalize(reflect(V, N)), vec3(0.0, -1.0, 0.0))), 40.0) * fine;
  float rim = (1.0 - smoothstep(uR * 0.55, uR, length(vL)));
  gl_FragColor = vec4(l7Fog(c, dd, 3.2), (0.7 + F * 0.28) * rim);
}`,
    })
    this.disposables.push(this.wallMat, this.skySeaMat)
  }

  private zoneGroup(z: L7FxInput['zones'][number]) {
    let g = this.zoneMeshes.get(z.id)
    if (g) return g
    g = new THREE.Group()
    const wallG = new THREE.BoxGeometry(z.len, z.top, z.thick, Math.ceil(z.len / 1.2), Math.ceil(z.top / 1.5), 2)
    const wm = this.wallMat.clone()
    wm.uniforms = { ...this.U, uHalf: { value: new THREE.Vector3(z.len / 2, z.top / 2, z.thick / 2) }, uCamL: { value: new THREE.Vector3() }, uInside: { value: 0 } }
    const wall = new THREE.Mesh(wallG, wm)
    wall.position.y = z.top / 2
    wall.frustumCulled = false
    wall.renderOrder = 3
    wall.name = 'l7-gravwall'
    g.add(wall)
    g.userData.wall = wall
    const sea = new THREE.Mesh(new THREE.CircleGeometry(z.r, 48), this.skySeaMat.clone())
    ;(sea.material as THREE.ShaderMaterial).uniforms = { ...this.U, uR: { value: z.r } }
    sea.rotation.x = Math.PI / 2
    sea.position.y = z.top
    sea.frustumCulled = false
    sea.renderOrder = 2
    g.add(sea)
    g.userData.dispose = () => { wallG.dispose(); wm.dispose(); sea.geometry.dispose(); (sea.material as THREE.Material).dispose() }
    this.zoneMeshes.set(z.id, g)
    this.group.add(g)
    return g
  }

  update(i: L7FxInput) {
    const U = this.U
    U.uTime.value = i.time
    U.uCam.value.copy(i.cam.position)
    U.uUw.value = i.uw
    U.uDepth.value = i.depth
    U.uDepthK.value = i.depthK
    U.uKeep.value = i.lightKeep
    U.uFlashOn.value = i.flashOn ? 1 : 0
    U.uFlashPos.value.copy(i.flashPos)
    U.uFlashDir.value.copy(i.flashDir).normalize()
    U.uHalluc.value = i.halluc
    U.uGlitch.value = i.glitch
    U.uFogC.value.copy(i.fogColor)
    U.uFogFar.value = i.fogFar
    U.uWaterY.value = i.waterY
    U.uEyeAbove.value = i.eyeAbove
    U.uInvP.value.copy(i.cam.projectionMatrixInverse)
    U.uCamW.value.copy(i.cam.matrixWorld)
    U.uRay.value = i.uw * (1 - smoothstep(4, 45, i.depth)) * i.lightKeep * (i.hi ? 1 : 0)
    this.rayMesh.visible = U.uRay.value > 0.01
    // 手电光锥
    this.cone.visible = i.flashOn && i.uw > 0.5
    if (this.cone.visible) {
      this.cone.position.copy(i.flashPos)
      this.cone.lookAt(i.flashPos.x + i.flashDir.x, i.flashPos.y + i.flashDir.y, i.flashPos.z + i.flashDir.z)
      const s = 1 - i.depthK * 0.4
      this.cone.scale.set(1, 1, s)
    }
    // 碎裂
    const gl = i.glitch > 0.02 && i.hi
    this.shards.visible = gl
    this.voids.visible = gl && i.glitch > 0.3
    // 背脊
    if (i.back && i.back.env > 0.01) {
      this.back.visible = true
      this.back.position.set(i.back.x, -4.5 + i.back.env * 6.0 + Math.sin(i.time * 0.4) * 0.3, i.back.z)
      this.back.rotation.y = Math.atan2(-i.back.dz, i.back.dx)
      this.back.rotation.z = Math.sin(i.back.t * 0.35) * 0.04
    } else this.back.visible = false
    // 重力交界区
    const live = new Set<number>()
    for (const z of i.zones) {
      live.add(z.id)
      const g = this.zoneGroup(z)
      g.position.set(z.x, 0, z.z)
      g.rotation.y = -z.ang
      // 相机换到水墙局部坐标；在墙体内时改画背面
      const wall = g.userData.wall as THREE.Mesh
      g.updateMatrixWorld(true)
      const wu = (wall.material as THREE.ShaderMaterial).uniforms
      const camL = wu.uCamL.value as THREE.Vector3
      camL.copy(i.cam.position).applyMatrix4(this.tmpM.copy(wall.matrixWorld).invert())
      const h = wu.uHalf.value as THREE.Vector3
      const inside = Math.abs(camL.x) < h.x && Math.abs(camL.y) < h.y && Math.abs(camL.z) < h.z
      wu.uInside.value = inside ? 1 : 0
      ;(wall.material as THREE.Material).side = inside ? THREE.BackSide : THREE.FrontSide
    }
    for (const [id, g] of this.zoneMeshes) if (!live.has(id)) { this.group.remove(g); g.userData.dispose?.(); this.zoneMeshes.delete(id) }
  }

  dispose() {
    if(this.disposed)return
    this.disposed=true
    this.shards.dispose();this.voids.dispose()
    for (const g of this.zoneMeshes.values()) g.userData.dispose?.()
    this.zoneMeshes.clear()
    for (const d of this.disposables) d.dispose()
    this.disposables.length=0
    this.group.removeFromParent();this.group.clear()
  }
}

function smoothstep(a: number, b: number, x: number) { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t) }
function mergeSimple(gs: THREE.BufferGeometry[]): THREE.BufferGeometry {
  let n = 0
  for (const g of gs) n += g.attributes.position.count
  const pos = new Float32Array(n * 3)
  let o = 0
  for (const g of gs) { pos.set(g.attributes.position.array as Float32Array, o); o += g.attributes.position.count * 3 }
  const out = new THREE.BufferGeometry()
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  return out
}
