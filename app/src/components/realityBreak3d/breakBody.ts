import * as THREE from 'three'
import { getAvatar, type AvatarCfg } from '../../game/core/avatar'
import type { PlayerState } from '../../game/engine'
import { buildAvatarModel, retroModelReady } from '../../game/renderer/retroAvatar'
import type { EquipVisual } from '../../game/renderer/playerModel'
import type { RetroNpc } from '../../game/renderer/retroNpc'

export interface BreakAppearance { avatar: AvatarCfg; equipment: EquipVisual }
export function breakAppearance(p?: PlayerState): BreakAppearance {
  return { avatar: { ...getAvatar() }, equipment: p ? {
    gloves: p.hasGloves, suit: p.hasSuit, cavingsuit: p.equip.body?.type === 'cavingsuit',
    divemask: p.equip.head?.type === 'divemask', headlamp: p.equip.head?.type === 'headlamp', nightvision: p.equip.head?.type === 'nightvision',
  } : {} }
}

/** Keep the production body and UVs; only the head/neck are outside this first-person view. */
export function breakFirstPersonGeometry(source: THREE.BufferGeometry, bones: readonly THREE.Bone[]): THREE.BufferGeometry {
  const geometry = source.clone(), skin = source.getAttribute('skinIndex'), weight = source.getAttribute('skinWeight')
  const hidden = new Set(bones.flatMap((b,i) => b.name === 'head' || b.name === 'neck' ? [i] : []))
  const index = source.index, visible: number[] = []
  geometry.clearGroups()
  for (const group of source.groups) {
    const start = visible.length
    for (let i=group.start;i<group.start+group.count;i+=3) {
      const triangle = [0,1,2].map(k => index ? index.getX(i+k) : i+k)
      if (triangle.every(v => {
        let head = 0
        for (let k=0;k<4;k++) if (hidden.has(skin.getComponent(v,k))) head += weight.getComponent(v,k)
        return head < .001
      })) visible.push(...triangle)
    }
    if (visible.length>start) geometry.addGroup(start,visible.length-start,group.materialIndex)
  }
  geometry.setIndex(visible)
  return geometry
}

export interface BreakBody {
  group: THREE.Group
  model: THREE.Group
  textures: readonly THREE.Texture[]
  appearance: BreakAppearance
  update(time: number): void
  prepare(cancelled?: () => boolean): Promise<void>
  dispose(): void
}

export function buildBreakBody(appearance: BreakAppearance = breakAppearance()): BreakBody {
  const snapshot = { avatar: { ...appearance.avatar }, equipment: { ...appearance.equipment } }
  const model = buildAvatarModel(snapshot.avatar, { ev: snapshot.equipment, driven: true })
  const rig = model.userData.retro as RetroNpc
  const geometry = breakFirstPersonGeometry(rig.mesh.geometry, rig.mesh.skeleton.bones)
  rig.mesh.geometry = geometry
  const group = new THREE.Group(); group.name = 'RealityBreak player avatar'; group.add(model)
  group.userData.breakAppearance = snapshot
  // Avatar models face +Z; the cutscene's initial local view faces -Z.
  model.rotation.y = Math.PI; model.position.set(0,-1.55,.17)
  const flutter = { value: 0 }
  const materials = (Array.isArray(rig.mesh.material) ? rig.mesh.material : [rig.mesh.material]) as THREE.MeshLambertMaterial[]
  const cloth = materials[0], previous = cloth.onBeforeCompile, previousKey = cloth.customProgramCacheKey()
  cloth.onBeforeCompile = function(shader, renderer) {
    previous.call(this,shader,renderer)
    shader.uniforms.uBreakClothTime = flutter
    shader.vertexShader = 'uniform float uBreakClothTime;\n' + shader.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      // Co-located vertices share displacement even across flat normals and UV seams.
      transformed.z += (sin(uBreakClothTime * 24.0 + position.y * 23.0 + position.x * 17.0) * 0.6 + sin(uBreakClothTime * 37.0 + position.z * 29.0) * 0.4) * (position.y > 0.75 ? 0.006 : 0.003);`)
  }
  cloth.customProgramCacheKey = () => previousKey + '|break-avatar-cloth-v2'
  const textures = [...new Set(materials.flatMap(m => m.map ? [m.map] : []))]
  let disposed = false
  const body: BreakBody = {
    group,model,textures,appearance:snapshot,
    update(time) {
      if (disposed) return
      rig.update(time); flutter.value = time
      const b = rig.bones
      for (const bone of Object.values(b)) { bone.rotation.set(0,0,0);bone.scale.set(1,1,1);bone.position.copy(bone.userData.bind as THREE.Vector3) }
      b.spine.rotation.x = -.055 + Math.sin(time*2.1)*.018
      b.chest.rotation.x = .025; b.chest.scale.z = 1+Math.sin(time*1.65)*.009
      for (const side of ['L','R'] as const) {
        const sign = side === 'L' ? 1 : -1, phase = side === 'L' ? 0 : 1.4
        b[`clavicle${side}`].rotation.z = sign * (.075 + Math.sin(time*2.2+phase)*.016)
        b[`upperArm${side}`].rotation.set(-.45+Math.sin(time*2.3+phase)*.06,0,sign*(.92+Math.sin(time*1.9+phase)*.05))
        b[`foreArm${side}`].rotation.set(-.52+Math.sin(time*2.8+phase)*.07,0,-sign*.12)
        b[`hand${side}`].rotation.x = .18+Math.sin(time*3.1+phase)*.035
        b[`thigh${side}`].rotation.set((side==='L'?-.38:-.62)+Math.sin(time*1.8+phase)*.055,Math.sin(time*2.1+phase)*.035,sign*.11)
        b[`shin${side}`].rotation.x = (side==='L'?.22:.56)+Math.sin(time*2.2+phase)*.065
        b[`foot${side}`].rotation.x = -.1+Math.sin(time*2.5+phase)*.035
      }
      model.updateMatrixWorld(true); rig.mesh.skeleton.update()
    },
    async prepare(cancelled) {
      const end = performance.now()+4000
      while (!disposed && !cancelled?.() && !retroModelReady(model)) {
        if (performance.now()>end) throw new Error('Cutscene avatar textures did not become ready')
        await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
      }
    },
    dispose() {
      if (disposed) return
      disposed=true; geometry.dispose(); rig.dispose();group.removeFromParent();group.clear()
      // Avatar atlases belong to the shared pool, not this cutscene instance.
    },
  }
  body.update(0)
  return body
}
