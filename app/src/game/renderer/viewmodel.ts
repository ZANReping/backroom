// 第一人称手部/手持物品 viewmodel + 屏幕中心准心（DOM 注入）
import * as THREE from 'three'
import { buildItemMesh } from './itemsMesh'
import { buildRefinedItemMesh } from './refinedItemMesh'
import { buildFlashlightMesh } from './flashlightMesh'
import { buildDetailedItemMesh } from './detailItemsMesh'
import { buildSquirtGunMesh } from './squirtGunMesh'
import { buildRetroHand, heldHandPose, FLASH_HAND_POSE, type RetroHand } from './retroViewHand'
export { heldHandPose, heldBox, LIGHTER_HAND_POSE, buildRetroHand, sleeveKindOf } from './retroViewHand'

// ---------- 第一人称手部/手持物品 ----------
// v53：去掉自发光（原 emissiveIntensity 0.25）——手部/袖管/手持物在黑暗中不再自发光，
// 只受场景光照（手电 SpotLight 照亮时依然清晰可见）
export function vmat(color: string | number) {
  return new THREE.MeshLambertMaterial({ color })
}

export interface ViewmodelParts { right: RetroHand; left: RetroHand }
export function buildViewmodel(vm: THREE.Group, vmFlash: THREE.Group, camera: THREE.Camera): ViewmodelParts {
  // v71：右手 = 复古低模手（指节分段包住把手 + 前臂 + 袖管），握法随手持物切换（heldHandPose），位于屏幕右下
  const right = buildRetroHand()
  right.setPose(heldHandPose(''))
  vm.add(right.group)
  vm.position.set(0.27, -0.3, -0.55)
  camera.add(vm)
  // 左手手电：细分灯头/反光杯/镜片/防滑握纹/尾盖/开关，金属与橡胶走真实 UV 图集。
  const flashlight = buildFlashlightMesh({ lit: true })
  flashlight.scale.setScalar(0.9)
  flashlight.position.z = 0.015
  vmFlash.add(flashlight)
  const left = buildRetroHand({ left: true })
  left.setPose(FLASH_HAND_POSE, flashlight) // v72：手指按手电真实网格接触求解
  vmFlash.add(left.group)
  vmFlash.position.set(-0.24, -0.28, -0.42)
  camera.add(vmFlash)
  return { right, left }
}

/** 手部（vm 节点）动作姿势：走路摆动 / 使用物品 / 攻击 / 搜索。纯函数，renderer 与预览页共用（v71 抽出，数值未改）。 */
export interface VmAnimState {
  mx: number; my: number; bobPhase: number; time: number
  usingItem?: { t: number; dur: number; anim?: string } | null
  attackAnimT: number; attackAnimDur: number; attackAnimKind?: string; searching?: boolean
}
export function vmAnimPose(st: VmAnimState) {
  // 走路摆动（与头部 bob 同步，幅度更小）
  const mag = Math.hypot(st.mx, st.my)
  const moving = mag > 0.1
  const sway = moving ? Math.sin(st.bobPhase) : 0
  const sway2 = moving ? Math.abs(Math.cos(st.bobPhase)) : 0
  let px = 0.27 + sway * 0.012
  let py = -0.3 - sway2 * 0.016
  let pz = -0.55
  let rx = 0
  let rz = 0
  if (st.usingItem) {
    const u = st.usingItem
    const pr = Math.max(0, Math.min(1, u.t / Math.max(0.01, u.dur)))
    // 进入与收回各占一小段，中段保持姿势；所有节奏都直接取自同一使用计时器。
    const pose = Math.min(1, pr / 0.2, (1 - pr) / 0.18)
    const pulse = Math.sin(pr * Math.PI * 4)
    if (u.anim === 'bottleDrink') {
      // 瓶装饮品：先把瓶身竖直举到嘴边，再明显仰瓶吞咽；与滋水枪自饮动作完全分离。
      const swallow = Math.sin(Math.max(0, Math.min(1, (pr - 0.25) / 0.5)) * Math.PI * 3) * pose
      px -= pose * 0.075; py += pose * 0.19 + Math.max(0, swallow) * 0.012; pz += pose * 0.14
      rx = pose * 1.48 + Math.max(0, swallow) * 0.05; rz = pose * 0.2
    } else if (u.anim === 'drink') {
      rx = pose * 1.14; rz = pose * 0.12; py += pose * 0.13; pz += pose * 0.08
    } else if (u.anim === 'eat') {
      const bite = pose * (0.9 + pulse * 0.08)
      rx = -bite * 0.92; rz = -bite * 0.12; py += bite * 0.12; pz += bite * 0.035
    } else if (u.anim === 'medical') {
      px -= pose * 0.22; py += pose * 0.045; pz -= pose * 0.02
      rx = -pose * 0.58 + pulse * 0.06; rz = pose * 0.72
    } else if (u.anim === 'inject') {
      px -= pose * 0.18; py += pose * 0.1; rx = -pose * 0.48; rz = pose * 0.95
    } else if (u.anim === 'battery') {
      px -= pose * 0.16; py -= pose * 0.08; rx = pose * 0.48; rz = pulse * pose * 0.08
    } else if (u.anim === 'activate') {
      py += pose * 0.08; pz -= pose * 0.08; rx = -pose * 0.38; rz = pulse * pose * 0.12
    } else { // read：举到视线下方稳定查看
      px -= pose * 0.24; py += pose * 0.11; pz += pose * 0.04; rx = -pose * 0.55; rz = pose * 0.18
    }
  } else if (st.attackAnimT > 0) {
    const pr = 1 - st.attackAnimT / Math.max(0.01, st.attackAnimDur)
    const k = Math.sin(pr * Math.PI)
    const kind = st.attackAnimKind
    if (kind === 'punch') {
      // 空手出拳：直线快速前刺，节奏比挥舞更急促
      const kj = Math.sin(Math.min(1, pr * 1.3) * Math.PI)
      pz -= kj * 0.28; py += kj * 0.02; rx = -kj * 0.3; rz = kj * 0.1
    } else if (kind === 'throw') {
      // 投掷：抬臂后向前上方甩出
      rx = -k * 0.75; py += k * 0.12; pz -= k * 0.16; rz = -k * 0.18
    } else if (kind === 'spray') {
      // 滋水枪喷射：泵压式快速前顶两下
      const k2 = Math.max(0, Math.sin(pr * Math.PI * 2))
      pz -= k2 * 0.09; rx = -k2 * 0.12
    } else if (kind === 'drink') {
      // 饮用（滋水枪对自己喝）：抬起到嘴边
      rx = k * 1.05; py += k * 0.1; pz += k * 0.07
    } else {
      // 武器挥舞（撬棍/扳手/木板）：横向挥砍弧线
      rx = -k * 1.0; rz = k * 0.55; pz -= k * 0.08; py += k * 0.04
    }
  } else if (st.searching) {
    // 搜索动作：小幅翻找
    rx = -0.22 + Math.sin(st.time * 9) * 0.07
    px += Math.sin(st.time * 5.2) * 0.015
  }
  return { px, py, pz, rx, rz, sway, sway2 }
}

// 手持物品 3D 建模（切换快捷栏时重建）
export function buildHeldItem(type: string): THREE.Group {
  const g = new THREE.Group()
  const vb = (w: number, h: number, d: number, color: string | number, x = 0, y = 0, z = 0, rx = 0, rz = 0) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), vmat(color))
    m.position.set(x, y, z); m.rotation.x = rx; m.rotation.z = rz
    g.add(m); return m
  }
  const vc = (rt: number, rb: number, h: number, color: string | number, x = 0, y = 0, z = 0, rx = 0) => {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, 8), vmat(color))
    m.position.set(x, y, z); m.rotation.x = rx
    g.add(m); return m
  }
  switch (type) {
    case 'luckymilk':
    case 'capacitor':
    case 'skeleton':
    case 'rabbit':
    case 'pockets':
    case 'fuyouyu': {
      // Hold the lower body/shaft, leaving labels, stone faces and ring holes above the palm.
      g.add(buildItemMesh(type, { halo: false }))
      g.position.set(0, type === 'luckymilk' || type === 'capacitor' ? .1 : .08, -.075)
      break
    }
    case 'crowbar': { // 参考《半条命》：主杆竖持，顶部羊角向视线前方弯曲
      const detail = buildDetailedItemMesh('crowbar')
      const pose = new THREE.Group()
      pose.rotation.z = Math.PI / 2 // 模型 +X（羊角端）竖直转到屏幕上方 +Y
      pose.scale.setScalar(.82)
      pose.position.set(.015, .09, -.08)
      pose.add(detail); g.add(pose)
      break
    }
    case 'wrench': { // 竖持管钳：共享细化模型，钳头（模型 -X）朝上
      const detail = buildRefinedItemMesh('wrench')
      detail.rotation.z = -Math.PI / 2
      detail.scale.setScalar(.95)
      detail.position.set(0, .14, -.06)
      g.add(detail)
      break
    }
    case 'timber': { // 竖持木板：共享细化模型，板长（模型 X）竖直
      const detail = buildRefinedItemMesh('timber')
      detail.rotation.set(0, Math.PI / 2, Math.PI / 2, 'YXZ')
      detail.position.set(0, .12, -.05)
      g.add(detail)
      break
    }
    case 'lighter': {
      const detail = buildDetailedItemMesh('lighter')
      detail.scale.setScalar(.75)
      detail.position.set(0, .015, -.1)
      g.add(detail)
      break
    }
    case 'knife': { // 竖持细化短刀
      const detail = buildDetailedItemMesh('knife')
      detail.rotation.z = Math.PI / 2
      detail.scale.setScalar(.92)
      detail.position.set(0, .14, -.065)
      g.add(detail)
      break
    }
    case 'axe': { // 消防斧竖持；刃口严格朝镜头前方 -Z
      const detail = buildDetailedItemMesh('axe')
      const upright = new THREE.Group()
      upright.rotation.z = Math.PI / 2 // 模型 +X（斧头端）竖直转到屏幕上方 +Y
      upright.add(detail)
      const pose = new THREE.Group()
      pose.rotation.y = Math.PI // +Z 斧刃精确翻转到镜头前方 -Z，不再保留横向夹角
      pose.scale.setScalar(.82)
      pose.position.set(.018, .1, -.085)
      pose.add(upright); g.add(pose)
      break
    }
    case 'squirtgun': { // 共享世界模型；本地 +X 枪口旋转到相机正前方 -Z
      const gun = buildSquirtGunMesh()
      gun.rotation.y = Math.PI / 2
      gun.scale.setScalar(.82)
      gun.position.set(0, .015, -.18)
      g.add(gun)
      break
    }
    case 'guncandy': // 枪糖（Object 5）：枪糖生效时的手枪模型——滑套 + 枪管 + 握把
      vb(0.045, 0.05, 0.2, '#3a3d42', 0, 0.05, -0.12) // 滑套
      vc(0.014, 0.014, 0.08, '#2a2d30', 0, 0.055, -0.24, Math.PI / 2) // 枪管
      vb(0.04, 0.1, 0.05, '#4a3a2e', 0, -0.03, -0.03) // 握把
      vb(0.008, 0.03, 0.01, '#2a2d30', 0, 0.005, -0.07) // 扳机
      break
    case 'glowstick': {
      const detail = buildDetailedItemMesh('glowstick')
      detail.rotation.z = Math.PI / 2
      detail.scale.setScalar(.9)
      detail.position.set(0, .08, -.11)
      g.add(detail)
      break
    }
    default: {
      // 复用物品低模（去掉地面光环）
      const src = buildItemMesh(type, { halo: false })
      for (const ch of [...src.children]) {
        g.add(ch)
      }
      g.position.set(0, 0.02, -0.18)
      break
    }
  }
  return g
}

// ---------- 屏幕中心准心（DOM 注入，桌面/移动端均显示）----------
export function buildCrosshair(): HTMLDivElement {
  // 渲染器实例重建/HMR 时先移除旧节点，确保新增的冷却条结构同步升级。
  const old = document.getElementById('br-crosshair') as HTMLDivElement | null
  old?.remove()
  const el = document.createElement('div')
  el.id = 'br-crosshair'
  el.style.cssText = 'position:fixed;left:50%;top:50%;width:26px;height:26px;z-index:40;pointer-events:none;transform:translate(-50%,-50%);transition:transform 90ms ease-out;display:none;'
  const mk = (w: string, h: string, x: string, y: string) => {
    const b = document.createElement('div')
    b.dataset.crosshairMark = '1'
    b.style.cssText = `position:absolute;width:${w};height:${h};left:${x};top:${y};background:#e8e2d2;opacity:0.85;box-shadow:0 0 2px rgba(0,0,0,0.8);`
    el.appendChild(b)
  }
  mk('2px', '2px', '12px', '12px') // 中心点
  mk('2px', '7px', '12px', '0') // 上
  mk('2px', '7px', '12px', '19px') // 下
  mk('7px', '2px', '0', '12px') // 左
  mk('7px', '2px', '19px', '12px') // 右
  const cooldown = document.createElement('div')
  cooldown.dataset.attackCooldown = '1'
  cooldown.style.cssText = 'position:absolute;left:-4px;top:32px;width:34px;height:3px;background:rgba(0,0,0,.58);box-shadow:0 0 2px rgba(0,0,0,.9);display:none;overflow:hidden;'
  const fill = document.createElement('div')
  fill.dataset.attackCooldownFill = '1'
  fill.style.cssText = 'height:100%;width:100%;background:#e8e2d2;transform-origin:left center;'
  cooldown.appendChild(fill)
  el.appendChild(cooldown)
  document.body.appendChild(el)
  return el
}
