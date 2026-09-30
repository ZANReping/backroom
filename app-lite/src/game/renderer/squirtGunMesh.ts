import * as THREE from 'three'
import { litMaterial } from './shared'

export type SquirtLiquid = 'none' | 'water' | 'almond' | 'cashew' | 'liquidpain'

const textureCache = new Map<string, THREE.CanvasTexture>()

function canvasTexture(key: string, width: number, height: number, paint: (ctx: CanvasRenderingContext2D, w: number, h: number) => void): THREE.CanvasTexture {
  const cached = textureCache.get(key)
  if (cached) return cached
  const canvas = document.createElement('canvas')
  canvas.width = width; canvas.height = height
  const ctx = canvas.getContext('2d')!
  paint(ctx, width, height)
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  tex.magFilter = THREE.LinearFilter
  tex.minFilter = THREE.LinearMipmapLinearFilter
  tex.anisotropy = 4
  textureCache.set(key, tex)
  return tex
}

function blasterShellTexture(): THREE.CanvasTexture {
  return canvasTexture('squirt-shell-v1', 512, 256, (ctx, w, h) => {
    const grad = ctx.createLinearGradient(0, 0, 0, h)
    grad.addColorStop(0, '#ff9c36'); grad.addColorStop(.45, '#ef5f2e'); grad.addColorStop(1, '#9d2f25')
    ctx.fillStyle = grad; ctx.fillRect(0, 0, w, h)
    ctx.fillStyle = 'rgba(255,211,70,.92)'
    ctx.beginPath(); ctx.moveTo(0, 174); ctx.lineTo(270, 96); ctx.lineTo(360, 96); ctx.lineTo(88, 196); ctx.closePath(); ctx.fill()
    ctx.fillStyle = 'rgba(21,88,124,.9)'; ctx.fillRect(0, 205, w, 21)
    ctx.fillStyle = 'rgba(255,255,255,.25)'; ctx.fillRect(0, 20, w, 7)
    ctx.fillStyle = '#f8f0cf'; ctx.font = '900 47px Arial, sans-serif'; ctx.textAlign = 'center'
    ctx.fillText('HYDRO', w * .52, 70)
    ctx.fillStyle = '#173f59'; ctx.font = '800 22px Arial, sans-serif'; ctx.fillText('PRESSURE BLASTER', w * .52, 104)
    ctx.fillStyle = 'rgba(66,32,23,.32)'
    for (let i = 0; i < 34; i++) {
      const x = (i * 83) % w, y = (i * 47) % h
      ctx.fillRect(x, y, 10 + i % 24, i % 4 === 0 ? 2 : 1)
    }
  })
}

function gripTexture(): THREE.CanvasTexture {
  return canvasTexture('squirt-grip-v1', 256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#155471'; ctx.fillRect(0, 0, w, h)
    ctx.strokeStyle = '#3ea6bc'; ctx.lineWidth = 8
    for (let x = -w; x < w * 2; x += 35) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + w, h); ctx.stroke()
      ctx.beginPath(); ctx.moveTo(x + w, 0); ctx.lineTo(x, h); ctx.stroke()
    }
    ctx.strokeStyle = 'rgba(8,40,57,.7)'; ctx.lineWidth = 2
    for (let y = 12; y < h; y += 24) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke() }
  })
}

function tankMarkingsTexture(): THREE.CanvasTexture {
  return canvasTexture('squirt-tank-marks-v1', 512, 256, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h)
    ctx.fillStyle = 'rgba(225,247,250,.12)'; ctx.fillRect(0, 0, w, h)
    ctx.fillStyle = 'rgba(233,250,250,.88)'; ctx.font = '800 27px Arial, sans-serif'; ctx.textAlign = 'center'
    ctx.fillText('RESERVOIR', w / 2, 37)
    ctx.font = '700 17px Arial, sans-serif'; ctx.fillText('MAX 27', w / 2, 61)
    ctx.strokeStyle = 'rgba(238,253,255,.9)'; ctx.lineWidth = 4
    for (let i = 0; i <= 9; i++) {
      const y = 82 + i * 16
      const len = i % 3 === 0 ? 88 : 50
      ctx.beginPath(); ctx.moveTo(w / 2 - len / 2, y); ctx.lineTo(w / 2 + len / 2, y); ctx.stroke()
    }
    ctx.fillStyle = 'rgba(14,55,70,.6)'; ctx.font = '700 14px Arial, sans-serif'
    ctx.fillText('DO NOT MIX', w / 2, h - 12)
  })
}

function brushedNozzleTexture(): THREE.CanvasTexture {
  return canvasTexture('squirt-nozzle-v1', 256, 256, (ctx, w, h) => {
    const grad = ctx.createLinearGradient(0, 0, w, 0)
    grad.addColorStop(0, '#53646a'); grad.addColorStop(.22, '#c8d4d4'); grad.addColorStop(.5, '#6d858b')
    grad.addColorStop(.78, '#dbe2df'); grad.addColorStop(1, '#485b61')
    ctx.fillStyle = grad; ctx.fillRect(0, 0, w, h)
    ctx.globalAlpha = .2
    for (let y = 2; y < h; y += 5) { ctx.fillStyle = y % 10 ? '#fff' : '#18292e'; ctx.fillRect(0, y, w, 1) }
    ctx.globalAlpha = 1
  })
}

function mesh(group: THREE.Group, geometry: THREE.BufferGeometry, material: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  const out = new THREE.Mesh(geometry, material)
  out.position.set(x, y, z); group.add(out)
  return out
}

function box(group: THREE.Group, w: number, h: number, d: number, material: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  return mesh(group, new THREE.BoxGeometry(w, h, d), material, x, y, z)
}

function cylinder(group: THREE.Group, rt: number, rb: number, h: number, material: THREE.Material, x = 0, y = 0, z = 0, seg = 18): THREE.Mesh {
  return mesh(group, new THREE.CylinderGeometry(rt, rb, h, seg), material, x, y, z)
}

const LIQUID_VISUAL: Record<SquirtLiquid, { color: string; opacity: number; shell: string }> = {
  none: { color: '#d8edf0', opacity: 0, shell: '#c9e3e7' },
  water: { color: '#55c9ff', opacity: .62, shell: '#9cdef2' },
  almond: { color: '#c9e8a0', opacity: .72, shell: '#d9eabf' },
  cashew: { color: '#c79a55', opacity: .78, shell: '#dfc38f' },
  liquidpain: { color: '#d94a3a', opacity: .82, shell: '#e78c82' },
}

/**
 * 滋水枪共享模型：世界掉落、远端手持与第一人称手持使用同一套几何和 UV。
 * 本地 +X 为枪口方向；第一人称模型只需整体旋转到相机 -Z。
 */
export function buildSquirtGunMesh(liquid: SquirtLiquid = 'none', fill = 0): THREE.Group {
  const g = new THREE.Group()
  g.userData.itemType = 'squirtgun'
  const shellMat = litMaterial({ color: '#ffffff', map: blasterShellTexture(), roughness: .58, envBase: .16 })
  const blueMat = litMaterial({ color: '#ffffff', map: gripTexture(), roughness: .72, envBase: .12 })
  const yellowMat = litMaterial({ color: '#f5c63d', roughness: .62, envBase: .14 })
  const darkMat = litMaterial({ color: '#183744', roughness: .8, envBase: .08 })
  const nozzleMat = litMaterial({ color: '#ffffff', map: brushedNozzleTexture(), metalness: .48, roughness: .34, envBase: .34 })

  // 注塑主壳：轮廓面替代旧版单一长方体，侧面 UV 面板提供产品字样、色带和磨痕。
  const side = new THREE.Shape()
  side.moveTo(-.17, -.045); side.lineTo(-.125, .085); side.lineTo(.15, .085)
  side.quadraticCurveTo(.205, .075, .225, .025); side.lineTo(.18, -.052)
  side.lineTo(.035, -.065); side.lineTo(-.025, -.095); side.lineTo(-.14, -.08); side.closePath()
  const bodyGeo = new THREE.ExtrudeGeometry(side, { depth: .116, bevelEnabled: true, bevelSegments: 2, bevelSize: .012, bevelThickness: .008 })
  bodyGeo.translate(0, 0, -.058)
  mesh(g, bodyGeo, shellMat)
  // 两侧精确 UV 铭牌，避免 ExtrudeGeometry 侧面自动 UV 拉伸文字。
  for (const z of [-.068, .068]) {
    const panel = box(g, .245, .066, .006, shellMat, .015, .016, z)
    panel.rotation.x = z < 0 ? Math.PI : 0
  }
  box(g, .24, .018, .132, yellowMat, .025, .084, 0) // 上壳压条
  box(g, .175, .018, .128, blueMat, .055, -.058, 0) // 下壳防滑护条
  // 壳体螺丝与模具接缝。
  for (const x of [-.115, .095, .175]) for (const z of [-.072, .072]) {
    const screw = cylinder(g, .008, .008, .009, nozzleMat, x, -.005, z, 10)
    screw.rotation.x = Math.PI / 2
  }
  box(g, .31, .006, .124, darkMat, .02, -.038, 0)

  // 后倾握把：芯体、橡胶防滑包覆、底部堵头。
  const gripCore = box(g, .085, .225, .09, blueMat, -.09, -.17, 0)
  gripCore.rotation.z = -.16
  const gripPad = box(g, .072, .145, .097, blueMat, -.105, -.19, 0)
  gripPad.rotation.z = -.16
  const butt = box(g, .105, .035, .105, darkMat, -.123, -.292, 0)
  butt.rotation.z = -.16

  // 扳机与护圈：可从侧面读出完整机械层次。
  const guard = mesh(g, new THREE.TorusGeometry(.057, .009, 7, 20, Math.PI * 1.35), yellowMat, -.005, -.11, 0)
  guard.rotation.x = Math.PI / 2; guard.rotation.z = -.55
  const trigger = box(g, .015, .073, .025, nozzleMat, -.005, -.095, 0)
  trigger.rotation.z = -.18

  // 前枪管、压力泵筒、分层喷嘴与出水孔。
  const barrel = cylinder(g, .043, .052, .225, blueMat, .255, .025, 0, 20)
  barrel.rotation.z = Math.PI / 2
  const barrelSleeve = cylinder(g, .055, .055, .085, yellowMat, .178, .025, 0, 20)
  barrelSleeve.rotation.z = Math.PI / 2
  const muzzle = cylinder(g, .052, .046, .06, nozzleMat, .392, .025, 0, 20)
  muzzle.rotation.z = Math.PI / 2
  const muzzleRing = mesh(g, new THREE.TorusGeometry(.05, .008, 7, 22), darkMat, .424, .025, 0)
  muzzleRing.rotation.y = Math.PI / 2
  const bore = cylinder(g, .022, .022, .008, darkMat, .428, .025, 0, 16)
  bore.rotation.z = Math.PI / 2
  const pump = cylinder(g, .029, .029, .175, nozzleMat, .22, -.088, 0, 16)
  pump.rotation.z = Math.PI / 2
  const pumpGrip = cylinder(g, .044, .044, .072, blueMat, .295, -.088, 0, 16)
  pumpGrip.rotation.z = Math.PI / 2

  // 透明可拆储罐、液面、螺纹盖、容量刻度和供液软管。
  const tankShellMat = litMaterial({ color: '#c9e3e7', transparent: true, opacity: .26, roughness: .2, envBase: .5, side: THREE.DoubleSide })
  tankShellMat.depthWrite = false
  const tankShell = cylinder(g, .078, .087, .18, tankShellMat, -.045, .175, 0, 24)
  tankShell.userData.squirtTankShell = 1
  const liquidMat = litMaterial({ color: '#55c9ff', transparent: true, opacity: .68, roughness: .28, envBase: .36 })
  liquidMat.depthWrite = false
  const liquidMesh = cylinder(g, .066, .074, .136, liquidMat, -.045, .148, 0, 22)
  liquidMesh.userData.squirtLiquid = 1
  liquidMesh.userData.fullHeight = .136
  liquidMesh.userData.bottomY = .08
  const marksMat = new THREE.MeshLambertMaterial({ color: '#ffffff', map: tankMarkingsTexture(), transparent: true, opacity: .9, depthWrite: false, side: THREE.DoubleSide })
  mesh(g, new THREE.CylinderGeometry(.089, .089, .155, 24, 1, true), marksMat, -.045, .174, 0)
  cylinder(g, .091, .091, .018, darkMat, -.045, .079, 0, 22)
  cylinder(g, .068, .075, .035, yellowMat, -.045, .281, 0, 20)
  cylinder(g, .055, .055, .018, darkMat, -.045, .307, 0, 18)
  const hose = mesh(g, new THREE.TubeGeometry(new THREE.CatmullRomCurve3([
    new THREE.Vector3(-.045, .08, 0), new THREE.Vector3(-.03, .025, .03),
    new THREE.Vector3(.07, -.025, .035), new THREE.Vector3(.17, .005, .02),
  ]), 18, .008, 7, false), litMaterial({ color: '#d7eef0', transparent: true, opacity: .62, roughness: .35, envBase: .25 }))
  hose.userData.noCastShadow = 1

  setSquirtGunLiquid(g, liquid, fill)
  return g
}

/** 更新模型内所有储液体和透明罐壳；fill 为 0–1，变化时不需要重建模型。 */
export function setSquirtGunLiquid(root: THREE.Object3D, liquid: SquirtLiquid, fill: number): void {
  const f = liquid === 'none' ? 0 : THREE.MathUtils.clamp(fill, 0, 1)
  const visual = LIQUID_VISUAL[liquid]
  root.traverse((obj) => {
    const part = obj as THREE.Mesh
    if (part.userData.squirtLiquid) {
      const mat = part.material as THREE.MeshLambertMaterial | THREE.MeshStandardMaterial
      mat.color.set(visual.color)
      mat.opacity = visual.opacity
      part.visible = f > .001
      part.scale.y = Math.max(.001, f)
      const fullHeight = Number(part.userData.fullHeight)
      const bottomY = Number(part.userData.bottomY)
      part.position.y = bottomY + fullHeight * f * .5
    } else if (part.userData.squirtTankShell) {
      const mat = part.material as THREE.MeshLambertMaterial | THREE.MeshStandardMaterial
      mat.color.set(visual.shell)
      mat.opacity = liquid === 'none' ? .22 : .31
    }
  })
  root.userData.squirtLiquidType = liquid
  root.userData.squirtFill = f
}
