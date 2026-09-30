// 非人形 NPC 的档案/对话预览。直接复用游戏内实体网格，避免在人形玩家模型上叠配饰伪装。
import * as THREE from 'three'
import { buildEntityMesh } from './entitiesMesh'

/** 返回已经按 NPC 肖像场景归一化、朝向相机的实体模型；人形 NPC 返回 null。 */
export function buildNpcEntityPreview(npcId?: string): THREE.Group | null {
  if (npcId !== 'tiny') return null

  const entity = buildEntityMesh('tiny')
  // 实体约定正面为 +X；肖像基础朝向为 +Z，外层仍可像普通人物一样旋转展示。
  entity.rotation.y = -Math.PI / 2
  entity.updateMatrixWorld(true)

  const bounds = new THREE.Box3().setFromObject(entity)
  const center = bounds.getCenter(new THREE.Vector3())
  const size = bounds.getSize(new THREE.Vector3())
  const scale = 1.76 / Math.max(0.01, size.y)
  entity.scale.setScalar(scale)
  entity.position.set(-center.x * scale, 0.9 - center.y * scale, -center.z * scale)

  const root = new THREE.Group()
  root.userData.entityNpcPreview = true
  root.add(entity)
  return root
}
