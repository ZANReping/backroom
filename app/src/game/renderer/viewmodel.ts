// 第一人称手部/手持物品 viewmodel + 屏幕中心准心（DOM 注入）
import * as THREE from 'three'
import { buildItemMesh } from './itemsMesh'
import { buildFlashlightMesh } from './flashlightMesh'
import { buildDetailedItemMesh } from './detailItemsMesh'

// ---------- 第一人称手部/手持物品 ----------
// v53：去掉自发光（原 emissiveIntensity 0.25）——手部/袖管/手持物在黑暗中不再自发光，
// 只受场景光照（手电 SpotLight 照亮时依然清晰可见）
export function vmat(color: string | number) {
  return new THREE.MeshLambertMaterial({ color })
}

export function buildViewmodel(vm: THREE.Group, vmFlash: THREE.Group, camera: THREE.Camera): { hand: THREE.Mesh; lhand: THREE.Mesh; sleeve: THREE.Mesh } {
  // 右臂（袖）+ 手，位于屏幕右下，不遮挡中心视野
  const sleeve = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.3), vmat('#3a3f46'))
  sleeve.position.set(0.02, -0.05, 0.16)
  sleeve.rotation.x = 0.3
  vm.add(sleeve)
  const hand = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.06, 0.11), vmat('#c9a58a'))
  hand.position.set(0, 0, -0.02)
  vm.add(hand)
  vm.position.set(0.27, -0.3, -0.55)
  camera.add(vm)
  // 左手手电：细分灯头/反光杯/镜片/防滑握纹/尾盖/开关，金属与橡胶走真实 UV 图集。
  const flashlight = buildFlashlightMesh({ lit: true })
  flashlight.scale.setScalar(0.9)
  flashlight.position.z = 0.015
  vmFlash.add(flashlight)
  const lhand = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.055, 0.1), vmat('#c9a58a'))
  lhand.position.set(0, -0.045, -0.06)
  vmFlash.add(lhand)
  vmFlash.position.set(-0.24, -0.28, -0.42)
  camera.add(vmFlash)
  return { hand, lhand, sleeve }
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
    case 'crowbar': { // 参考《半条命》：主杆竖持，顶部羊角向视线前方弯曲
      const detail = buildDetailedItemMesh('crowbar')
      const pose = new THREE.Group()
      pose.rotation.z = Math.PI / 2 // 模型 +X（羊角端）竖直转到屏幕上方 +Y
      pose.scale.setScalar(.82)
      pose.position.set(.015, .09, -.08)
      pose.add(detail); g.add(pose)
      break
    }
    case 'wrench': // 竖持管钳：手柄竖直，顶端开口钳头
      vb(0.035, 0.3, 0.03, '#8a8a8a', 0, 0.1, -0.05)
      vb(0.075, 0.07, 0.035, '#8a8a8a', -0.028, 0.28, -0.05, 0, 0.5)
      vb(0.075, 0.07, 0.035, '#8a8a8a', 0.028, 0.3, -0.05, 0, -0.5)
      break
    case 'timber': // 竖持木板：板身竖直 + 木纹 + 钉头
      vb(0.13, 0.42, 0.04, '#8a6a42', 0, 0.12, -0.05)
      vb(0.02, 0.42, 0.006, '#6a4e30', 0.03, 0.12, -0.027)
      vb(0.022, 0.022, 0.012, '#a8a8a8', -0.03, 0.26, -0.026)
      break
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
    case 'squirtgun': // 前持滋水枪：枪身朝前 + 顶部储水罐 + 握把 + 枪口
      vb(0.05, 0.06, 0.24, '#e86a3a', 0, 0.02, -0.16)
      vc(0.045, 0.045, 0.09, '#4ac9e8', 0, 0.1, -0.14)
      vb(0.04, 0.1, 0.05, '#e8b93c', 0, -0.05, -0.06)
      vb(0.045, 0.045, 0.06, '#e86a3a', 0, 0.02, -0.3)
      break
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
      const src = buildItemMesh(type)
      for (const ch of [...src.children]) {
        if ((ch as THREE.Mesh).geometry?.type === 'RingGeometry') continue
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
  // 复用既有元素（渲染器实例重建/HMR 时避免残留多个准心导致旧准心永不隐藏）
  const old = document.getElementById('br-crosshair') as HTMLDivElement | null
  if (old) { old.style.display = 'none'; return old }
  const el = document.createElement('div')
  el.id = 'br-crosshair'
  el.style.cssText = 'position:fixed;left:50%;top:50%;width:26px;height:26px;z-index:40;pointer-events:none;transform:translate(-50%,-50%);transition:transform 90ms ease-out;display:none;'
  const mk = (w: string, h: string, x: string, y: string) => {
    const b = document.createElement('div')
    b.style.cssText = `position:absolute;width:${w};height:${h};left:${x};top:${y};background:#e8e2d2;opacity:0.85;box-shadow:0 0 2px rgba(0,0,0,0.8);`
    el.appendChild(b)
  }
  mk('2px', '2px', '12px', '12px') // 中心点
  mk('2px', '7px', '12px', '0') // 上
  mk('2px', '7px', '12px', '19px') // 下
  mk('7px', '2px', '0', '12px') // 左
  mk('7px', '2px', '19px', '12px') // 右
  document.body.appendChild(el)
  return el
}
