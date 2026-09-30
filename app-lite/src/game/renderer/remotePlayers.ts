// v58 联机：远端玩家渲染——第三人称形象（复用玩家模型）+ 名牌 + 手持物品 + 动作动画
// （步行/游泳/蹲伏/攻击/倒地）；孤立效应下互不可见（L0 非马尼拉室区域）。
import * as THREE from 'three'
import { buildPlayerModel } from './playerModel'
import { buildItemMesh } from './itemsMesh'
import type { Engine } from '../engine'
import type { MpSession, MpRemotePlayer } from '../net/session'
import type { AvatarCfg } from '../core/avatar'
import { DEFAULT_AVATAR } from '../core/avatar'

interface View {
  grp: THREE.Group
  parts: Record<string, THREE.Object3D>
  tag: THREE.Sprite
  heldType: string | null
  heldMesh: THREE.Object3D | null
  animT: number
  attackT: number
  lastAttack: boolean
  x: number; y: number; z: number // 当前显示位置（插值平滑）
  yaw: number // 身体朝向（慢速追随头部）
  headYaw: number // 头部朝向（快速追随视角——先转头再转身子）
}

function makeNameTag(name: string): THREE.Sprite {
  const c = document.createElement('canvas')
  c.width = 256; c.height = 64
  const g = c.getContext('2d')!
  g.font = 'bold 30px sans-serif'
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.fillStyle = 'rgba(0,0,0,0.45)'
  g.fillRect(0, 8, 256, 48)
  g.fillStyle = '#e8e2d2'
  g.fillText(name.slice(0, 12), 128, 32)
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: true, transparent: true }))
  sp.scale.set(1.1, 0.28, 1)
  return sp
}

export class RemotePlayerViews {
  private views = new Map<string, View>()

  /** 每帧驱动：同步远端玩家模型/动作/可见性 */
  update(scene: THREE.Scene, engine: Engine, session: MpSession | null, time: number, dt: number) {
    const m = engine.map
    if (!session || !session.started || !m) {
      if (this.views.size) this.clearAll(scene)
      return
    }
    const p = engine.player
    const ox = m.inf?.ox ?? 0, oy = m.inf?.oy ?? 0 // 远端坐标为世界坐标 → 本端窗口坐标
    // 孤立效应：L0 内非马尼拉室（tint≠1）区域互相不可见
    const pi = Math.floor(p.y) * m.w + Math.floor(p.x)
    const isolated = p.level === 0 && (m.tint?.[pi] ?? 0) !== 1

    const seen = new Set<string>()
    for (const r of session.remotes.values()) {
      if (!this.isSelf(session, r)) {
        seen.add(r.id)
        this.updateOne(scene, engine, r, ox, oy, isolated, time, dt)
      }
    }
    for (const [id, v] of this.views) {
      if (!seen.has(id)) {
        scene.remove(v.grp)
        this.views.delete(id)
      }
    }
  }

  private isSelf(session: MpSession, r: MpRemotePlayer) {
    return session.isHost ? r.id === 'HOST' : r.id === session.selfId
  }

  private updateOne(scene: THREE.Scene, engine: Engine, r: MpRemotePlayer, ox: number, oy: number, isolated: boolean, time: number, dt: number) {
    const s = r.s
    const p = engine.player
    let v = this.views.get(r.id)
    if (!v) {
      const grp = buildPlayerModel({ ...DEFAULT_AVATAR, ...r.idn.avatar } as AvatarCfg)
      const tag = makeNameTag(r.idn.name)
      tag.position.set(0, 2.06, 0)
      grp.add(tag)
      scene.add(grp)
      v = {
        grp, parts: grp.userData.parts as Record<string, THREE.Object3D>, tag,
        heldType: null, heldMesh: null,
        animT: 0, attackT: 0, lastAttack: false,
        x: s.x - ox, y: s.y - oy, z: s.z, yaw: s.yaw, headYaw: s.yaw,
      }
      this.views.set(r.id, v)
    }
    // 可见性：同层 + 双向孤立效应（任一端处于 L0 非马尼拉室即互不可见）+ 状态新鲜（>8s 未刷新视为消失）
    v.grp.visible = s.level === p.level && !isolated && !s.iso && Date.now() - r.lastSeen <= 8000

    // 位置/朝向插值（~11Hz 状态流）
    const tx = s.x - ox, ty = s.y - oy
    const k = Math.min(1, dt * 10)
    v.x += (tx - v.x) * k
    v.y += (ty - v.y) * k
    v.z += (s.z - v.z) * k
    // v59：先转头再转身子——头部快速追随视角，身体慢速追随头部（自然转身）
    const angDiff = (a: number, b: number) => ((a - b + Math.PI * 3) % (Math.PI * 2)) - Math.PI
    v.headYaw += angDiff(s.yaw, v.headYaw) * Math.min(1, dt * 13)
    v.yaw += angDiff(v.headYaw, v.yaw) * Math.min(1, dt * 5)
    v.grp.position.set(v.x, v.z, v.y)
    // 玩家模型正面 = +Z；facing 为地图平面角（方向 (cos f, sin f)，three.z=地图 y）→ rotation.y = π/2 - f
    // （此前误写 -yaw+π，远端形象朝向因此是反的）
    v.grp.rotation.y = Math.PI / 2 - v.yaw
    const parts = v.parts
    if (parts.head && !s.dead) {
      let rel = v.yaw - v.headYaw // 头相对身体的偏转（世界系差值即局部 Y 旋转）
      rel = Math.max(-1.15, Math.min(1.15, rel))
      parts.head.rotation.y = rel
      parts.head.rotation.x = Math.max(-0.6, Math.min(0.6, -s.pitch * 0.5)) // 附随俯仰（点头/抬头）
    } else if (parts.head) {
      parts.head.rotation.y = 0
      parts.head.rotation.x = 0
    }

    // ---- 动作动画 ----
    const moving = s.moving && !s.dead
    v.animT += dt * (moving ? (s.sprint ? 9 : 6) : 2)
    const swing = moving ? Math.sin(v.animT) * (s.sprint ? 0.7 : 0.45) : 0
    if (s.dead) {
      // 倒地：整体前倒
      v.grp.rotation.x = -Math.PI / 2 * 0.9
      v.grp.position.y = v.z + 0.15
    } else if (s.swim) {
      // 游泳：俯身俯卧 + 双臂划水 + 打水
      v.grp.rotation.x = -1.15
      v.grp.position.y = v.z + 0.2
      if (parts.armL) parts.armL.rotation.x = Math.sin(v.animT * 0.9) * 0.9 - 0.4
      if (parts.armR) parts.armR.rotation.x = Math.sin(v.animT * 0.9 + 2.6) * 0.9 - 0.4
      if (parts.legL) parts.legL.rotation.x = Math.sin(v.animT * 1.3) * 0.5
      if (parts.legR) parts.legR.rotation.x = -Math.sin(v.animT * 1.3) * 0.5
    } else {
      v.grp.rotation.x = 0
      v.grp.position.y = v.z
      if (s.crouch) v.grp.position.y = v.z - 0.25
      if (parts.legL) parts.legL.rotation.x = swing
      if (parts.legR) parts.legR.rotation.x = -swing
      // 攻击：挥臂一次（攻击标志的上升沿触发）
      if (s.attack && !v.lastAttack) v.attackT = 0.32
      if (v.attackT > 0) {
        v.attackT -= dt
        const a = 1 - Math.max(0, v.attackT) / 0.32
        if (parts.armR) parts.armR.rotation.x = -Math.sin(a * Math.PI) * 1.9
        if (parts.armL) parts.armL.rotation.x = -swing * 0.8
      } else {
        if (parts.armL) parts.armL.rotation.x = -swing * 0.8
        if (parts.armR) parts.armR.rotation.x = swing * 0.8
      }
      // idle：呼吸
      if (parts.torso) parts.torso.scale.y = 1 + Math.sin(time * 1.7 + v.animT * 0.1) * 0.015
    }
    v.lastAttack = s.attack

    // 手持物品第三人称展示（挂右手关节，随手臂摆动）
    if (s.held !== v.heldType) {
      if (v.heldMesh) v.heldMesh.removeFromParent()
      v.heldMesh = null
      v.heldType = s.held
      if (s.held && parts.armR) {
        const item = buildItemMesh(s.held, { halo: false }) // v59：手持物品不显示脚底稀有度光圈
        item.scale.setScalar(0.55)
        item.position.set(0, -0.52, 0.1)
        parts.armR.add(item)
        v.heldMesh = item
      }
    }
  }

  private clearAll(scene: THREE.Scene) {
    for (const [, v] of this.views) scene.remove(v.grp)
    this.views.clear()
  }

  /** 联机玩家间软碰撞用的同层远端位置表（窗口坐标；孤立效应区域内互不碰撞） */
  static nearby(engine: Engine, session: MpSession | null): { x: number; y: number; z: number }[] {
    const m = engine.map
    if (!session || !session.started || !m) return []
    const p = engine.player
    // 本端正处孤立效应区域（L0 非马尼拉室）时不与任何远端玩家碰撞（互不可见即互不碰撞）
    if (p.level === 0 && (m.tint?.[Math.floor(p.y) * m.w + Math.floor(p.x)] ?? 0) !== 1) return []
    const ox = m.inf?.ox ?? 0, oy = m.inf?.oy ?? 0
    const out: { x: number; y: number; z: number }[] = []
    for (const r of session.remotes.values()) {
      if (session.isHost ? r.id === 'HOST' : r.id === session.selfId) continue
      if (r.s.level !== p.level || r.s.dead || r.s.iso) continue
      out.push({ x: r.s.x - ox, y: r.s.y - oy, z: r.s.z })
    }
    return out
  }
}
