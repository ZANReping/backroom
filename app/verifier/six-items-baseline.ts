// Fixed performance baseline snapshot (2026-10-04). Geometry/material parameters
// are copied from app/.check/item-six/baseline.ts and intentionally kept unchanged.
import * as THREE from 'three'

export function buildItemMesh(type: string, opts?: { halo?: boolean }): THREE.Group {
  const grp = new THREE.Group()
  grp.userData.itemType = type
  const em = (w: number, h: number, d: number, color: string | number, x = 0, y = 0, z = 0, rx = 0, rz = 0) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshLambertMaterial({ color, emissive: color as number, emissiveIntensity: 0.25 }))
    m.position.set(x, y, z); m.rotation.x = rx; m.rotation.z = rz; grp.add(m); return m
  }
  const cm = (rt: number, rb: number, h: number, color: string | number, x = 0, y = 0, z = 0, seg = 8, rx = 0, rz = 0): THREE.Mesh => {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), new THREE.MeshLambertMaterial({ color, emissive: color as number, emissiveIntensity: 0.2 }))
    m.position.set(x, y, z); m.rotation.x = rx; m.rotation.z = rz; grp.add(m); return m
  }
  switch (type) {
    case 'rabbit':
      em(0.06, 0.14, 0.06, '#d8cfc0', 0, 0.05, 0); em(0.1, 0.1, 0.08, '#b8a890', 0, -0.08, 0); break
    case 'skeleton':
      cm(0.05, 0.05, 0.02, '#b08d46', 0, 0.11, 0, 10, Math.PI / 2)
      em(0.03, 0.16, 0.02, '#b08d46', 0, 0, 0); em(0.05, 0.02, 0.02, '#b08d46', 0.03, -0.06, 0); em(0.04, 0.02, 0.02, '#b08d46', 0.025, -0.02, 0); break
    case 'capacitor': {
      const glass = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.095, 0.17, 8), new THREE.MeshLambertMaterial({ color: '#9fd8e8', transparent: true, opacity: 0.35, emissive: '#3a8ab0', emissiveIntensity: 0.3 }))
      glass.position.y = -0.03; grp.add(glass)
      const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.05, 0.06, 8), new THREE.MeshLambertMaterial({ color: '#9fd8e8', transparent: true, opacity: 0.35, emissive: '#3a8ab0', emissiveIntensity: 0.3 }))
      neck.position.y = 0.075; grp.add(neck)
      cm(0.03, 0.034, 0.05, '#a8865a', 0, 0.125, 0, 8)
      const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.04, 0), new THREE.MeshBasicMaterial({ color: '#8fd4ff' }))
      core.position.y = -0.03; core.scale.y = 1.7; grp.add(core)
      const bolt = (w: number, h: number, color: string, x: number, y: number, z: number, rz: number) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.014), new THREE.MeshBasicMaterial({ color })); m.position.set(x, y, z); m.rotation.z = rz; grp.add(m) }
      bolt(0.014, 0.1, '#eaf7ff', 0.022, -0.02, 0.01, 0.5); bolt(0.014, 0.08, '#8fd4ff', -0.022, -0.05, -0.012, -0.55); break
    }
    case 'luckymilk':
      em(0.15, 0.24, 0.11, '#eef0e8'); em(0.15, 0.05, 0.11, '#7ab06a', 0, 0.145, 0); em(0.152, 0.08, 0.112, '#a8d89a', 0, -0.04, 0); em(0.04, 0.04, 0.01, '#4a8a3e', 0, -0.04, 0.06); break
    case 'pockets':
      cm(0.1, 0.14, 0.2, '#6a5a7a'); cm(0.06, 0.08, 0.06, '#4a3d5a', 0, 0.13, 0, 6); em(0.17, 0.02, 0.02, '#c9a0d0', 0, 0.15, 0); break
    case 'fuyouyu': {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.022, 8, 16), new THREE.MeshLambertMaterial({ color: '#6ad9a8', emissive: '#2a6a4a', emissiveIntensity: 0.4 }))
      ring.rotation.x = Math.PI / 2; grp.add(ring); cm(0.006, 0.006, 0.16, '#8a3a3a', 0, 0.1, 0, 5); em(0.03, 0.01, 0.03, '#3a8a68', 0, -0.075, 0); break
    }
    default: throw new Error(`Unknown baseline item type: ${type}`)
  }
  if (opts?.halo) {
    const halo = new THREE.Mesh(new THREE.RingGeometry(0.18, 0.26, 10), new THREE.MeshBasicMaterial({ color: '#e8b93d', transparent: true, opacity: 0.45, side: THREE.DoubleSide, forceSinglePass: true }))
    halo.rotation.x = -Math.PI / 2; halo.position.y = -0.28; grp.add(halo)
  }
  return grp
}
