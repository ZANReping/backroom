// 第一人称手部/手持物品 viewmodel + 屏幕中心准心（DOM 注入）
import * as THREE from 'three'
import { buildItemMesh } from './entitiesMesh'

// ---------- 第一人称手部/手持物品 ----------
export function vmat(color: string | number) {
  return new THREE.MeshLambertMaterial({ color, emissive: color as number, emissiveIntensity: 0.25 })
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
  // 左手手电（手电开启时可见，已有 SpotLight 光效）
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.038, 0.2, 8), vmat('#2a2d30'))
  body.rotation.x = Math.PI / 2
  body.position.z = -0.08
  vmFlash.add(body)
  const head = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.045, 0.07, 8), vmat('#4a4d52'))
  head.rotation.x = Math.PI / 2
  head.position.z = -0.2
  vmFlash.add(head)
  const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.042, 0.012, 8), new THREE.MeshBasicMaterial({ color: '#fff2d0' }))
  lens.rotation.x = Math.PI / 2
  lens.position.z = -0.24
  vmFlash.add(lens)
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
    case 'crowbar': // 弯曲铁棍：主杆 + 鹅颈 + 叉头 + 尾弯
      vc(0.016, 0.016, 0.42, '#a63a2e', 0, 0, -0.2, Math.PI / 2)
      vb(0.03, 0.09, 0.03, '#a63a2e', 0, 0.045, -0.4)
      vb(0.04, 0.02, 0.07, '#7a2a1e', 0, 0.09, -0.43, 0.35)
      vb(0.03, 0.05, 0.03, '#a63a2e', 0, -0.02, 0.02)
      break
    case 'wrench': // 管钳：手柄 + 开口钳头
      vb(0.035, 0.03, 0.34, '#8a8a8a', 0, 0, -0.16)
      vb(0.075, 0.035, 0.07, '#8a8a8a', -0.025, 0, -0.36, 0, 0.5)
      vb(0.075, 0.035, 0.07, '#8a8a8a', 0.025, 0, -0.38, 0, -0.5)
      break
    case 'lighter':
      vb(0.05, 0.09, 0.04, '#c9c2a8', 0, 0, -0.1)
      vb(0.02, 0.03, 0.02, '#8a8a8a', 0, 0.06, -0.1)
      break
    case 'glowstick':
      vc(0.018, 0.018, 0.24, '#a8e0a0', 0, 0, -0.14, Math.PI / 2)
      break
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
