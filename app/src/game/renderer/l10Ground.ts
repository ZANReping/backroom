// Level 10 v64 地表混合材质。
//
// 旧版每种地表（干土/草地/车辙/碾实土/湖岸/麦茬地）各是一张材质，每个 1m 瓦片只能属于其中一种，
// 不同地表相接处是锯齿状的方格硬边——从麦田走到湖岸、从院落走进草地，最先看到的就是这些方格。
//
// v64 把所有室外地表合成一张材质：每个顶点记录周围瓦片的地表权重（aSplat），片元着色器
// 用各层贴图的明度作「高度」做高度混合——草从土缝里长出来，泥滩从草根下渗出来，过渡宽约 1~1.5m，
// 边缘由贴图细节决定而不是瓦片网格。另外：
//   · 水线附近 15cm 的岸土变暗、变光滑（湿岸）；
//   · 湖底叠加随时间流动的焦散光纹，随水深衰减；
//   · 雨天整体湿润度由 updateL10WetMaterials 统一调节（material.roughness 作为全局倍率）。
// 一张材质 = 每区块一次 draw call（旧版最多 7 次）。贴图采样 5 张颜色 + 2 张法线。
import * as THREE from 'three'
import { configureSurfaceTexture, getMaterialMode, levelTexture, litMaterial, noiseTexture } from './shared'
import { l10WindUniforms } from './l10Wind'
import { waterUniforms } from './water'

const T = (name: string, a: string, b: string, color: boolean) => {
  const t = levelTexture(name, () => noiseTexture(a, b))
  configureSurfaceTexture(t, color ? THREE.SRGBColorSpace : THREE.NoColorSpace)
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  return t
}

/** 瓦片 tint → 地表权重（草、麦茬地、碾实土、泥），干土 = 1 - 其和。 */
export function l10SplatOfTint(tint: number, liquid: number): [number, number, number, number] {
  if (liquid) return [0, 0, 0, 1]
  switch (tint) {
    case 45: return [1, 0, 0, 0]
    case 50: return [0, 1, 0, 0]
    case 47: case 49: return [0, 0, 1, 0]
    case 46: return [0, 0, .25, .75]
    case 48: return [.18, 0, 0, .82]
    default: return [0, 0, 0, 0]
  }
}

const shared = new Map<string, THREE.MeshLambertMaterial | THREE.MeshStandardMaterial>()

export function l10GroundMaterial() {
  const mode = getMaterialMode(), cached = shared.get(mode)
  if (cached) return cached
  const dry = T('l10_dry_soil_diff.jpg', '#79684d', '#ad9870', true)
  const mat = litMaterial({
    color: '#ffffff', vertexColors: true, map: dry,
    normalMap: T('l10_dry_soil_normal.jpg', '#8080ff', '#7f7fff', false), normalScale: new THREE.Vector2(.72, .72),
    roughness: 1, envBase: .06,
  })
  mat.userData.l10Wettable = 1
  mat.userData.l10BaseRoughness = 1
  mat.userData.l10BaseEnv = .06
  const uniforms = {
    tL10Grass: { value: T('l10_grass_diff.jpg', '#6a7350', '#39442d', true) },
    tL10Crop: { value: T('l10_wheat_diff.jpg', '#b9974b', '#d3b969', true) },
    tL10Packed: { value: T('l10_packed_dirt_diff.jpg', '#746148', '#9d8664', true) },
    tL10Mud: { value: T('l10_wet_rut_diff.jpg', '#44372a', '#69533b', true) },
    tL10GrassN: { value: T('l10_grass_normal.jpg', '#8080ff', '#7f7fff', false) },
  }
  const previousCompile = mat.onBeforeCompile, previousKey = mat.customProgramCacheKey.bind(mat)
  mat.onBeforeCompile = (shader, renderer) => {
    previousCompile.call(mat, shader, renderer)
    Object.assign(shader.uniforms, uniforms, { uL10Origin: l10WindUniforms.uL10Origin, uWaterTime: waterUniforms.uWaterTime })
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
attribute vec4 aSplat;
varying vec4 vSplat;
varying vec3 vGW;
uniform vec2 uL10Origin;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
vSplat = aSplat;
vec4 gw4 = modelMatrix * vec4(position, 1.0);
vGW = vec3(gw4.x + uL10Origin.x, gw4.y, gw4.z + uL10Origin.y);`)
    const isStd = shader.fragmentShader.includes('roughnessFactor')
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
uniform sampler2D tL10Grass; uniform sampler2D tL10Crop; uniform sampler2D tL10Packed; uniform sampler2D tL10Mud; uniform sampler2D tL10GrassN;
uniform float uWaterTime;
varying vec4 vSplat;
varying vec3 vGW;
vec4 gL10W; float gL10Wet;
float l10Lum(vec3 c){ return dot(c, vec3(.299, .587, .114)); }
float l10Caustic(vec2 p, float t){
  vec2 q = p * 1.35;
  float a = sin(q.x * 2.1 + sin(q.y * 1.7 + t * .9) * 1.6 + t * .7);
  float b = sin(q.y * 2.4 + sin(q.x * 1.3 - t * .8) * 1.5 - t * .6);
  float c = sin((q.x + q.y) * 1.6 + sin(q.x * .9 + t) * 1.2 + t * .5);
  return pow(clamp(1.0 - abs(a + b + c) / 1.6, 0.0, 1.0), 4.0);
}`)
      .replace('#include <map_fragment>', `
vec2 gUv = vGW.xz;
vec3 cDry = texture2D(map, gUv * .55).rgb;
vec3 cGrass = texture2D(tL10Grass, gUv * .48).rgb;
vec3 cCrop = texture2D(tL10Crop, gUv * .7).rgb;
vec3 cPack = texture2D(tL10Packed, gUv * .58).rgb * 1.35;
vec3 cMud = texture2D(tL10Mud, gUv * .62).rgb;
// 低频明度扰动：打散双线性权重的规则感
float gN = texture2D(map, gUv * .043).g;
vec4 w = clamp(vSplat, 0.0, 1.0);
float wDry = max(0.0, 1.0 - w.x - w.y - w.z - w.w);
// 高度混合：各层「高度」= 贴图明度 + 权重；只保留最高层附近 0.18 的过渡
float hD = wDry + l10Lum(cDry) * .55 + gN * .25;
float hG = w.x + l10Lum(cGrass) * .9 + (1.0 - gN) * .25;
float hC = w.y + l10Lum(cCrop) * .45;
float hP = w.z + l10Lum(cPack) * .5;
float hM = w.w + (1.0 - l10Lum(cMud)) * .35;
float hMax = max(max(max(hD, hG), max(hC, hP)), hM) - .18;
float bD = max(hD - hMax, 0.0) * step(.001, wDry + .001), bG = max(hG - hMax, 0.0) * step(.001, w.x);
float bC = max(hC - hMax, 0.0) * step(.001, w.y), bP = max(hP - hMax, 0.0) * step(.001, w.z), bM = max(hM - hMax, 0.0) * step(.001, w.w);
float bS = max(1e-4, bD + bG + bC + bP + bM);
gL10W = vec4(bG, bC, bP, bM) / bS;
float gDryK = bD / bS;
vec3 gCol = cDry * gDryK + cGrass * gL10W.x + cCrop * gL10W.y + cPack * gL10W.z + cMud * gL10W.w;
// 湿岸：水线上方 15cm 变暗
gL10Wet = clamp(gL10W.w + (1.0 - smoothstep(.02, .17, vGW.y)) * step(-.03, vGW.y), 0.0, 1.0);
gCol *= 1.0 - gL10Wet * .32;
// 湖底焦散：水下随水深衰减
float gDepth = -vGW.y;
float gCau = l10Caustic(vGW.xz, uWaterTime) * smoothstep(.04, .35, gDepth) * exp(-gDepth * .45);
gCol += vec3(.55, .62, .5) * gCau * .55;
gCol *= mix(vec3(1.0), vec3(.62, .74, .72), smoothstep(.05, 2.5, gDepth)); // 水下偏青
diffuseColor.rgb *= gCol;
`)
    if (isStd) {
      shader.fragmentShader = shader.fragmentShader.replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
roughnessFactor *= gDryK * .93 + gL10W.x * .98 + gL10W.y * .91 + gL10W.z * .82 + gL10W.w * .42;
roughnessFactor = mix(roughnessFactor, roughnessFactor * .35, gL10Wet * .8);`)
    }
    shader.fragmentShader = shader.fragmentShader.replace('#include <normal_fragment_maps>', `
#ifdef USE_NORMALMAP_TANGENTSPACE
  vec3 nDry = texture2D(normalMap, vGW.xz * .55).xyz * 2.0 - 1.0;
  vec3 nGr = texture2D(tL10GrassN, vGW.xz * .48).xyz * 2.0 - 1.0;
  vec3 mapN = normalize(mix(nDry, nGr, gL10W.x));
  mapN.xy *= normalScale * (1.0 - gL10Wet * .55);
  normal = normalize(tbn * mapN);
#else
  #include <normal_fragment_maps>
#endif`)
  }
  mat.customProgramCacheKey = () => 'l10-ground-splat-v64|' + previousKey()
  shared.set(mode, mat)
  return mat
}
