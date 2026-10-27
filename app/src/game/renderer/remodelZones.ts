// 施工许可改造区（Level 0）：着色器层面的空间渐变——灯光转冷白、地毯变干、积水消退。
// 共享 uniform（最多 8 个最近的施工点，渲染坐标 = 世界坐标 − 窗口原点），每帧由 updateRemodelZones 更新；
// Level 0 的烘焙材质（renderer/l0Architecture.ts）与灯盘、积水材质在编译时注入。
import * as THREE from 'three'
import type { Engine } from '../engine'
import { REMODEL_TUNING, remodelProgress } from '../world/remodelSites'

const MAX = 8
const zones = Array.from({ length: MAX }, () => new THREE.Vector4())
export const remodelUniforms = { remodelZones: { value: zones }, remodelCount: { value: 0 }, remodelFeather: { value: REMODEL_TUNING.zoneFeather } }

export function updateRemodelZones(eng: Engine) {
  const inf = eng.map?.inf, sites = eng.player.remodel?.sites
  if (eng.player.level !== 0 || !inf || !sites?.length) { remodelUniforms.remodelCount.value = 0; return }
  const px = eng.player.x + inf.ox, py = eng.player.y + inf.oy
  const near = [...sites].sort((a, b) => Math.hypot(a.x - px, a.y - py) - Math.hypot(b.x - px, b.y - py)).slice(0, MAX)
  near.forEach((s, i) => zones[i].set(s.x - inf.ox, s.y - inf.oy, s.r, remodelProgress(s, eng.time)))
  remodelUniforms.remodelCount.value = near.length
}

/** kind：surface=一般烘焙面（冷白）、carpet=地毯（再加变干）、diffuser=灯盘发光面、puddle=积水面（淡出）。 */
export function installRemodelZones(mat: THREE.Material, kind: 'surface' | 'carpet' | 'diffuser' | 'puddle') {
  const previous = mat.onBeforeCompile.bind(mat)
  const previousKey = mat.customProgramCacheKey.bind(mat)
  mat.onBeforeCompile = (shader, renderer) => {
    previous(shader, renderer)
    Object.assign(shader.uniforms, remodelUniforms)
    shader.vertexShader = 'varying vec2 vRemodelXZ;\n' + shader.vertexShader
    shader.vertexShader = shader.vertexShader.replace('#include <project_vertex>', `#include <project_vertex>
  vRemodelXZ=(modelMatrix*vec4(transformed,1.)).xz;`)
    shader.fragmentShader = `uniform vec4 remodelZones[${MAX}];uniform float remodelCount,remodelFeather;varying vec2 vRemodelXZ;
float remodelK(){float k=0.;for(int i=0;i<${MAX};i++){if(float(i)>=remodelCount)break;vec4 z=remodelZones[i];float d=length(vRemodelXZ-z.xy);k=max(k,(1.-smoothstep(z.z,z.z+remodelFeather,d))*z.w);}return k;}
` + shader.fragmentShader
    const body = kind === 'puddle'
      ? 'diffuseColor.a*=1.-rzK;'
      : kind === 'diffuser'
        ? 'outgoingLight*=mix(vec3(1.),vec3(.9,1.,1.14),rzK);'
        // 灯光转冷白：整体略提亮、去黄；地毯额外提亮去潮（湿地毯→干：更浅、更不饱和）
        : 'outgoingLight*=mix(vec3(1.),vec3(.9,1.,1.12)*1.08,rzK);' + (kind === 'carpet' ? 'float rzL=dot(outgoingLight,vec3(.2126,.7152,.0722));outgoingLight=mix(outgoingLight,mix(vec3(rzL),outgoingLight,.82)*1.16,rzK);' : '')
    shader.fragmentShader = shader.fragmentShader.replace('#include <opaque_fragment>', `{float rzK=remodelK();${body}}
#include <opaque_fragment>`)
  }
  mat.customProgramCacheKey = () => `${previousKey()}|rz-${kind}`
}
