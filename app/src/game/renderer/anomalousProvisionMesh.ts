// 液态痛苦、皇家口粮与迁跃浆果：程序化 UV + 细化模型。
// 地面掉落、投掷物和第一人称手持均通过 buildItemMesh 复用这些根节点。
import * as THREE from 'three'
import { litMaterial } from './shared'

const textureCache = new Map<string, THREE.CanvasTexture>()

function canvasTexture(key: string, paint: (ctx: CanvasRenderingContext2D, size: number) => void, repeat = false) {
  const cached = textureCache.get(key)
  if (cached) return cached
  const size = 512
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const ctx = canvas.getContext('2d')!
  paint(ctx, size)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.wrapS = texture.wrapT = repeat ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping
  texture.magFilter = THREE.LinearFilter
  texture.minFilter = THREE.LinearMipmapLinearFilter
  texture.anisotropy = 4
  textureCache.set(key, texture)
  return texture
}

function add(
  root: THREE.Group,
  geometry: THREE.BufferGeometry,
  material: THREE.Material | THREE.Material[],
  name: string,
  x = 0, y = 0, z = 0,
  rx = 0, ry = 0, rz = 0,
) {
  const mesh = new THREE.Mesh(geometry, material)
  mesh.name = name
  mesh.position.set(x, y, z)
  mesh.rotation.set(rx, ry, rz)
  mesh.castShadow = true
  mesh.receiveShadow = true
  root.add(mesh)
  return mesh
}

function painLabelTexture() {
  return canvasTexture('liquid-pain-label-v1', (ctx, n) => {
    const grad = ctx.createLinearGradient(0, 0, n, 0)
    grad.addColorStop(0, '#b6a58c'); grad.addColorStop(.08, '#eee0c4')
    grad.addColorStop(.5, '#d8c8a9'); grad.addColorStop(.92, '#eee0c4'); grad.addColorStop(1, '#ad987e')
    ctx.fillStyle = grad; ctx.fillRect(0, 0, n, n)
    ctx.fillStyle = '#7c161c'; ctx.fillRect(0, 0, n, 62); ctx.fillRect(0, n - 52, n, 52)
    ctx.strokeStyle = '#351115'; ctx.lineWidth = 7; ctx.strokeRect(20, 78, n - 40, n - 150)
    ctx.textAlign = 'center'
    ctx.fillStyle = '#64151a'; ctx.font = '900 54px Arial, sans-serif'; ctx.fillText('LIQUID PAIN', n / 2, 158)
    ctx.fillStyle = '#28191a'; ctx.font = '700 25px Arial, sans-serif'; ctx.fillText('OBJECT 48', n / 2, 199)
    // 腐蚀警告菱形与液滴标记。
    ctx.save(); ctx.translate(n / 2, 291); ctx.rotate(Math.PI / 4)
    ctx.strokeStyle = '#8c1920'; ctx.lineWidth = 12; ctx.strokeRect(-62, -62, 124, 124)
    ctx.restore()
    ctx.fillStyle = '#8c1920'; ctx.beginPath(); ctx.moveTo(n / 2, 234)
    ctx.bezierCurveTo(n / 2 - 40, 291, n / 2 - 35, 333, n / 2, 342)
    ctx.bezierCurveTo(n / 2 + 35, 333, n / 2 + 40, 291, n / 2, 234); ctx.fill()
    ctx.fillStyle = '#301719'; ctx.font = '800 21px Arial, sans-serif'; ctx.fillText('DO NOT INGEST', n / 2, 409)
    ctx.font = '600 17px Arial, sans-serif'; ctx.fillText('CORROSIVE ANOMALOUS FLUID', n / 2, 443)
    ctx.globalAlpha = .18
    for (let i = 0; i < 80; i++) {
      const x = (i * 193) % n, y = (i * 83) % n
      ctx.fillStyle = i % 3 ? '#6c4f40' : '#fff4dc'; ctx.fillRect(x, y, 2 + i % 5, 1)
    }
    ctx.globalAlpha = 1
  })
}

function painCapTexture() {
  return canvasTexture('liquid-pain-cap-v1', (ctx, n) => {
    ctx.fillStyle = '#281f20'; ctx.fillRect(0, 0, n, n)
    for (let x = 0; x < n; x += 24) {
      ctx.fillStyle = x % 48 ? '#4b3738' : '#151112'; ctx.fillRect(x, 0, 10, n)
    }
    ctx.fillStyle = 'rgba(193,67,68,.42)'; ctx.fillRect(0, n * .42, n, n * .12)
  }, true)
}

/** 深色实验玻璃瓶、可见淡红液体、警告标签与防拆盖。 */
export function buildLiquidPainMesh(): THREE.Group {
  const root = new THREE.Group()
  root.name = 'liquid-pain-detailed-model'
  root.userData.detailedAnomalousProvision = 1

  const glass = litMaterial({
    color: '#d8c7bc', transparent: true, opacity: .28, depthWrite: false,
    roughness: .13, metalness: .04, envBase: .62,
  })
  const fluidTex = canvasTexture('liquid-pain-fluid-v1', (ctx, n) => {
    const grad = ctx.createLinearGradient(0, 0, n, 0)
    grad.addColorStop(0, '#641417'); grad.addColorStop(.22, '#d86465')
    grad.addColorStop(.52, '#ef9990'); grad.addColorStop(.8, '#b8373d'); grad.addColorStop(1, '#541014')
    ctx.fillStyle = grad; ctx.fillRect(0, 0, n, n)
    ctx.globalAlpha = .18
    for (let i = 0; i < 45; i++) {
      ctx.fillStyle = '#ffe0d5'; ctx.beginPath()
      ctx.arc((i * 137) % n, (i * 89) % n, 2 + i % 6, 0, Math.PI * 2); ctx.fill()
    }
    ctx.globalAlpha = 1
  }, true)
  const fluid = litMaterial({
    color: '#fff0e9', map: fluidTex, emissive: '#451014', emissiveMap: fluidTex,
    emissiveIntensity: .19, transparent: true, opacity: .88, roughness: .3, envBase: .32,
  })
  const label = litMaterial({ color: '#ffffff', map: painLabelTexture(), roughness: .88, envBase: .04 })
  const cap = litMaterial({ color: '#ffffff', map: painCapTexture(), roughness: .82, metalness: .08, envBase: .08 })
  const steel = litMaterial({ color: '#8d817b', metalness: .72, roughness: .36, envBase: .38 })

  // 内液略小于玻璃腔，收肩位置留出晃动空间；标签为独立环绕 UV，不污染瓶底和瓶肩。
  add(root, new THREE.CylinderGeometry(.069, .073, .225, 32), fluid, 'pain-fluid-body', 0, -.035)
  add(root, new THREE.CylinderGeometry(.043, .069, .05, 32), fluid, 'pain-fluid-shoulder', 0, .102)
  add(root, new THREE.CylinderGeometry(.078, .082, .255, 32), glass, 'pain-glass-body', 0, -.025)
  add(root, new THREE.CylinderGeometry(.043, .078, .064, 32), glass, 'pain-glass-shoulder', 0, .134)
  add(root, new THREE.CylinderGeometry(.043, .043, .064, 28), glass, 'pain-glass-neck', 0, .194)
  add(root, new THREE.CylinderGeometry(.083, .083, .132, 32, 1, true), label, 'pain-warning-label', 0, -.03, 0, 0, Math.PI)
  add(root, new THREE.TorusGeometry(.077, .006, 7, 32), steel, 'pain-bottle-base-ring', 0, -.157, 0, Math.PI / 2)
  add(root, new THREE.TorusGeometry(.045, .004, 6, 28), steel, 'pain-neck-ring', 0, .221, 0, Math.PI / 2)
  add(root, new THREE.CylinderGeometry(.052, .052, .057, 28), cap, 'pain-safety-cap', 0, .246)
  add(root, new THREE.TorusGeometry(.049, .004, 6, 28), steel, 'pain-cap-seal', 0, .218, 0, Math.PI / 2)
  root.rotation.y = Math.PI
  return root
}

function royalTinTexture() {
  return canvasTexture('royal-ration-tin-v1', (ctx, n) => {
    const grad = ctx.createLinearGradient(0, 0, n, n)
    grad.addColorStop(0, '#6f4814'); grad.addColorStop(.18, '#d5a83e')
    grad.addColorStop(.48, '#8a5a18'); grad.addColorStop(.72, '#f0cf69'); grad.addColorStop(1, '#76501d')
    ctx.fillStyle = grad; ctx.fillRect(0, 0, n, n)
    ctx.strokeStyle = 'rgba(67,33,8,.5)'; ctx.lineWidth = 7
    for (let y = 22; y < n; y += 58) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(n, y + 11); ctx.stroke() }
    ctx.strokeStyle = 'rgba(255,238,157,.36)'; ctx.lineWidth = 2
    for (let y = 31; y < n; y += 58) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(n, y + 11); ctx.stroke() }
  }, true)
}

function royalLidTexture() {
  return canvasTexture('royal-ration-lid-v1', (ctx, n) => {
    const grad = ctx.createRadialGradient(n / 2, n / 2, 30, n / 2, n / 2, n * .65)
    grad.addColorStop(0, '#f3dc82'); grad.addColorStop(.38, '#c9942f'); grad.addColorStop(1, '#6c4010')
    ctx.fillStyle = grad; ctx.fillRect(0, 0, n, n)
    ctx.strokeStyle = '#6f181e'; ctx.lineWidth = 18; ctx.strokeRect(27, 27, n - 54, n - 54)
    ctx.strokeStyle = '#f6de83'; ctx.lineWidth = 5; ctx.strokeRect(43, 43, n - 86, n - 86)
    ctx.textAlign = 'center'; ctx.fillStyle = '#54141a'
    ctx.font = '900 54px Georgia, serif'; ctx.fillText('ROYAL RATION', n / 2, 166)
    ctx.font = '700 22px Georgia, serif'; ctx.fillText('A COMPLETE PROVISION', n / 2, 204)
    // 纹章皇冠。
    ctx.beginPath(); ctx.moveTo(164, 330); ctx.lineTo(144, 252); ctx.lineTo(213, 291)
    ctx.lineTo(256, 226); ctx.lineTo(299, 291); ctx.lineTo(368, 252); ctx.lineTo(348, 330); ctx.closePath(); ctx.fill()
    ctx.fillRect(164, 341, 184, 31)
    for (const x of [144, 256, 368]) { ctx.beginPath(); ctx.arc(x, x === 256 ? 218 : 244, 13, 0, Math.PI * 2); ctx.fill() }
    ctx.font = '600 19px Georgia, serif'; ctx.fillText('BY APPOINTMENT OF THE CROWN', n / 2, 423)
  })
}

function royalRationGelTexture() {
  return canvasTexture('royal-ration-gel-v1', (ctx, n) => {
    const grad = ctx.createRadialGradient(n * .34, n * .28, 12, n * .5, n * .5, n * .7)
    grad.addColorStop(0, '#fffef4'); grad.addColorStop(.42, '#e9e5d6'); grad.addColorStop(.76, '#faf7ea'); grad.addColorStop(1, '#c9c4b6')
    ctx.fillStyle = grad; ctx.fillRect(0, 0, n, n)
    ctx.globalAlpha = .2
    for (let i = 0; i < 34; i++) {
      const x = (i * 173) % n, y = (i * 97) % n
      ctx.strokeStyle = i % 3 ? '#aaa79c' : '#ffffff'; ctx.lineWidth = 2 + i % 5
      ctx.beginPath(); ctx.arc(x, y, 14 + i % 31, 0, Math.PI * (1.1 + (i % 4) * .15)); ctx.stroke()
    }
    ctx.globalAlpha = 1
  }, true)
}

/** 半开金属口粮盒：压边、铰链、搭扣、红缎带、浮雕皇冠与可见白色胶质内容物。 */
export function buildRoyalRationMesh(): THREE.Group {
  const root = new THREE.Group()
  root.name = 'royal-ration-detailed-model'
  root.userData.detailedAnomalousProvision = 1
  const tin = litMaterial({ color: '#ffffff', map: royalTinTexture(), metalness: .58, roughness: .39, envBase: .46 })
  const lid = litMaterial({ color: '#ffffff', map: royalLidTexture(), metalness: .42, roughness: .44, envBase: .4 })
  const gold = litMaterial({ color: '#e3b74a', metalness: .84, roughness: .26, envBase: .6 })
  const darkGold = litMaterial({ color: '#714514', metalness: .68, roughness: .48, envBase: .34 })
  const ribbon = litMaterial({ color: '#8f1722', roughness: .72, envBase: .08 })
  const gelTexture = royalRationGelTexture()
  const gel = litMaterial({
    color: '#fffdf2', map: gelTexture,
    emissive: '#d8d4c7', emissiveMap: gelTexture, emissiveIntensity: .075,
    transparent: true, opacity: .94, roughness: .26, metalness: 0, envBase: .42,
  })
  const gelGloss = litMaterial({ color: '#fffef7', transparent: true, opacity: .42, roughness: .08, envBase: .68 })

  add(root, new THREE.BoxGeometry(.266, .075, .174, 2, 1, 2), tin, 'ration-tin-body', 0, -.018)
  for (const x of [-.128, .128]) for (const z of [-.081, .081]) {
    add(root, new THREE.BoxGeometry(.014, .092, .014), darkGold, 'ration-corner-reinforcement', x, -.005, z)
  }

  // 浅色内托与四条卷边把内容物限制在盒内，不会像白色方块直接浮在金盒上。
  add(root, new THREE.BoxGeometry(.236, .012, .142), darkGold, 'ration-inner-tray', 0, .025)
  add(root, new THREE.BoxGeometry(.245, .012, .009), gold, 'ration-inner-rim-front', 0, .04, .073)
  add(root, new THREE.BoxGeometry(.245, .012, .009), gold, 'ration-inner-rim-back', 0, .04, -.073)
  add(root, new THREE.BoxGeometry(.009, .012, .137), gold, 'ration-inner-rim-left', -.123, .04, 0)
  add(root, new THREE.BoxGeometry(.009, .012, .137), gold, 'ration-inner-rim-right', .123, .04, 0)

  // 主体是一块轻微塌陷的石蜡状胶质物；周围小团块、气泡和亮膜让表面不规则且有半透明湿润感。
  const gelBody = add(root, new THREE.SphereGeometry(1, 28, 18), gel, 'ration-white-gel-body', 0, .063, 0)
  gelBody.scale.set(.105, .029, .057)
  for (const [x, z, sx, sy, sz] of [
    [-.073, -.026, .043, .022, .031], [.069, .022, .04, .019, .034],
    [-.034, .037, .047, .018, .027], [.038, -.039, .045, .021, .025],
  ] as const) {
    const lobe = add(root, new THREE.SphereGeometry(1, 18, 12), gel, 'ration-white-gel-lobe', x, .061, z)
    lobe.scale.set(sx, sy, sz)
  }
  const surfaceFilm = add(root, new THREE.SphereGeometry(1, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), gelGloss, 'ration-gel-gloss-film', -.018, .075, -.006)
  surfaceFilm.scale.set(.072, .009, .038)
  for (const [x, z, r] of [[-.048, .012, .006], [.026, .025, .0045], [.061, -.018, .005]] as const) {
    add(root, new THREE.SphereGeometry(r, 10, 7), gelGloss, 'ration-gel-air-bubble', x, .079, z)
  }

  // 盒盖以背部铰链为真实轴心半开约 52°；印刷盖、压边、缎带、搭扣和皇冠都随盖整体转动。
  const lidPivot = new THREE.Group()
  lidPivot.name = 'ration-half-open-lid-pivot'
  // 根节点末尾会绕 Y 翻转以令标签朝向相机，所以局部 +Z 才是手持视角中的远侧铰链。
  lidPivot.position.set(0, .018, .092)
  lidPivot.rotation.x = .91
  root.add(lidPivot)
  // BoxGeometry 材质顺序为左右、上下、前后：印刷纹章只铺在顶面，侧面继续使用拉丝金属 UV。
  const lidMaterials: THREE.Material[] = [tin, tin, lid, darkGold, tin, tin]
  add(lidPivot, new THREE.BoxGeometry(.278, .025, .186, 2, 1, 2), lidMaterials, 'ration-printed-lid', 0, .02, -.092)
  add(lidPivot, new THREE.BoxGeometry(.286, .007, .194), gold, 'ration-lid-rim', 0, .034, -.092)
  add(lidPivot, new THREE.BoxGeometry(.043, .011, .197), ribbon, 'ration-ribbon-long', 0, .04, -.092)
  add(lidPivot, new THREE.BoxGeometry(.289, .011, .034), ribbon, 'ration-ribbon-cross', 0, .041, -.092)
  for (const x of [-.075, .075]) {
    add(root, new THREE.CylinderGeometry(.009, .009, .052, 10), darkGold, 'ration-lid-hinge', x, .021, .099, 0, 0, Math.PI / 2)
  }
  add(lidPivot, new THREE.BoxGeometry(.045, .038, .014), gold, 'ration-front-latch', 0, -.004, -.188)
  add(root, new THREE.BoxGeometry(.024, .024, .018), darkGold, 'ration-latch-catch', 0, -.014, -.101)

  // 中央小皇冠为真实凸起几何，近看有独立高光。
  add(lidPivot, new THREE.BoxGeometry(.057, .008, .016), gold, 'ration-crown-band', 0, .05, -.1)
  for (const x of [-.022, 0, .022]) {
    const point = add(lidPivot, new THREE.ConeGeometry(.009, .03 + (x === 0 ? .009 : 0), 6), gold, 'ration-crown-point', x, .065, -.1)
    point.rotation.x = 0
  }
  root.rotation.y = Math.PI
  return root
}

function berrySkinTexture() {
  return canvasTexture('warpberry-skin-v1', (ctx, n) => {
    const grad = ctx.createRadialGradient(n * .32, n * .26, 8, n * .5, n * .5, n * .65)
    grad.addColorStop(0, '#d7a4ff'); grad.addColorStop(.23, '#8f43c7')
    grad.addColorStop(.58, '#4b176c'); grad.addColorStop(1, '#160b29')
    ctx.fillStyle = grad; ctx.fillRect(0, 0, n, n)
    ctx.globalCompositeOperation = 'screen'
    for (let i = 0; i < 15; i++) {
      const y = 24 + i * 33
      ctx.strokeStyle = i % 2 ? 'rgba(209,157,255,.22)' : 'rgba(82,218,255,.16)'
      ctx.lineWidth = 3 + i % 4
      ctx.beginPath()
      for (let x = -20; x <= n + 20; x += 12) {
        const yy = y + Math.sin(x * .034 + i * 1.7) * (9 + i % 5)
        if (x < 0) ctx.moveTo(x, yy); else ctx.lineTo(x, yy)
      }
      ctx.stroke()
    }
    ctx.globalCompositeOperation = 'source-over'
    for (let i = 0; i < 95; i++) {
      const x = (i * 173) % n, y = (i * 107) % n, r = 1 + i % 4
      ctx.fillStyle = i % 4 ? 'rgba(28,7,45,.58)' : 'rgba(224,179,255,.48)'
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill()
    }
  }, true)
}

function berryLeafTexture() {
  return canvasTexture('warpberry-leaf-v1', (ctx, n) => {
    ctx.fillStyle = '#27381c'; ctx.fillRect(0, 0, n, n)
    const grad = ctx.createLinearGradient(0, 0, n, n)
    grad.addColorStop(0, '#54713b'); grad.addColorStop(.5, '#1f3522'); grad.addColorStop(1, '#6b4080')
    ctx.fillStyle = grad; ctx.fillRect(0, 0, n, n)
    ctx.strokeStyle = '#a178b0'; ctx.lineWidth = 9
    ctx.beginPath(); ctx.moveTo(0, n); ctx.lineTo(n, 0); ctx.stroke()
    ctx.lineWidth = 3; ctx.globalAlpha = .55
    for (let i = 1; i < 9; i++) {
      const p = i * n / 10
      ctx.beginPath(); ctx.moveTo(p, n - p); ctx.lineTo(p + 75, n - p + 14); ctx.stroke()
    }
    ctx.globalAlpha = 1
  })
}

function leafGeometry() {
  const shape = new THREE.Shape()
  shape.moveTo(0, 0)
  shape.bezierCurveTo(.035, .012, .075, .036, .104, .084)
  shape.bezierCurveTo(.058, .09, .018, .059, 0, 0)
  return new THREE.ShapeGeometry(shape, 8)
}

/** 多果粒浆果簇：空间纹理果皮、凹点、枝梗、叶片和两道局部空间涟漪。 */
export function buildWarpberryMesh(): THREE.Group {
  const root = new THREE.Group()
  root.name = 'warpberry-detailed-model'
  root.userData.detailedAnomalousProvision = 1
  const skinTex = berrySkinTexture()
  const skin = litMaterial({
    color: '#ffffff', map: skinTex, emissive: '#381454', emissiveMap: skinTex,
    emissiveIntensity: .18, roughness: .48, metalness: .04, envBase: .42,
  })
  const dimple = litMaterial({ color: '#321047', roughness: .82, envBase: .04 })
  const stem = litMaterial({ color: '#394027', roughness: .9, envBase: .03 })
  const leaf = litMaterial({ color: '#ffffff', map: berryLeafTexture(), roughness: .86, side: THREE.DoubleSide, envBase: .06 })
  const berries = [
    [-.047, -.004, .004, .063, -.12], [.042, .008, -.016, .058, .18],
    [-.008, .038, .042, .056, .04], [.004, -.018, -.058, .052, -.2],
  ] as const
  for (let bi = 0; bi < berries.length; bi++) {
    const [x, y, z, radius, ry] = berries[bi]
    const berry = add(root, new THREE.SphereGeometry(radius, 20, 14), skin, `warpberry-fruit-${bi}`, x, y, z, 0, ry)
    berry.scale.set(1, .92 + bi * .015, .96)
    // 每颗果实的花柱凹点使用真实小型几何，强化近景表皮起伏。
    for (let i = 0; i < 4; i++) {
      const a = i * Math.PI * .5 + bi * .37
      add(root, new THREE.SphereGeometry(.006, 7, 5), dimple, 'warpberry-skin-dimple', x + Math.cos(a) * radius * .82, y + (i % 2 ? .018 : -.014), z + Math.sin(a) * radius * .82)
    }
    const branch = add(root, new THREE.CylinderGeometry(.006, .008, .09, 8), stem, 'warpberry-branch', x * .45, .094, z * .42)
    branch.rotation.z = -x * 4.2
    branch.rotation.x = z * 3.6
  }
  add(root, new THREE.CylinderGeometry(.009, .012, .115, 9), stem, 'warpberry-main-stem', 0, .12, 0, 0, 0, -.08)
  for (const [x, z, ry, rz] of [[-.015, .004, -.8, -.15], [.012, -.004, 2.35, .18]] as const) {
    const blade = add(root, leafGeometry(), leaf, 'warpberry-leaf', x, .155, z, -Math.PI / 2, ry, rz)
    blade.scale.set(1.08, 1.08, 1.08)
  }
  const rippleMat = new THREE.MeshBasicMaterial({ color: '#b479ff', transparent: true, opacity: .42, depthWrite: false })
  for (const [r, y, sx] of [[.102, -.014, 1], [.079, .018, .82]] as const) {
    const ripple = add(root, new THREE.TorusGeometry(r, .0035, 6, 40), rippleMat, 'warpberry-space-ripple', 0, y, 0, Math.PI / 2)
    ripple.scale.x = sx
  }
  root.scale.setScalar(1.08)
  return root
}
