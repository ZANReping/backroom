import * as THREE from 'three'
import { levelTexture, litMaterial, noiseTexture } from './shared'

export type DetailedItemType =
  | 'disinfectant' | 'glowstick' | 'coffee' | 'tape' | 'lighter'
  | 'crowbar' | 'axe' | 'knife' | 'wallpaper'

const paintedTextures = new Map<string, THREE.CanvasTexture>()

function paintedTexture(key: string, paint: (ctx: CanvasRenderingContext2D, size: number) => void, repeat = false): THREE.CanvasTexture {
  const cached = paintedTextures.get(key)
  if (cached) return cached
  const size = 256
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const ctx = canvas.getContext('2d')!
  paint(ctx, size)
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.wrapS = tex.wrapT = repeat ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping
  tex.magFilter = THREE.LinearFilter
  tex.minFilter = THREE.LinearMipmapLinearFilter
  tex.anisotropy = 4
  paintedTextures.set(key, tex)
  return tex
}

const font = (px: number) => `700 ${px}px Arial, sans-serif`

function brushedMetalTexture(): THREE.CanvasTexture {
  return paintedTexture('detail-brushed-metal', (ctx, n) => {
    const grad = ctx.createLinearGradient(0, 0, n, 0)
    grad.addColorStop(0, '#777a7b'); grad.addColorStop(0.18, '#d9dcda')
    grad.addColorStop(0.5, '#8f9392'); grad.addColorStop(0.78, '#eceeeb'); grad.addColorStop(1, '#777b7b')
    ctx.fillStyle = grad; ctx.fillRect(0, 0, n, n)
    ctx.globalAlpha = 0.18
    for (let y = 2; y < n; y += 4) {
      ctx.fillStyle = y % 8 ? '#ffffff' : '#2f3333'
      ctx.fillRect(0, y, n, 1)
    }
    ctx.globalAlpha = 1
  }, true)
}

function wornRedTexture(): THREE.CanvasTexture {
  return paintedTexture('detail-worn-red', (ctx, n) => {
    ctx.fillStyle = '#a64232'; ctx.fillRect(0, 0, n, n)
    for (let i = 0; i < 34; i++) {
      const x = (i * 73) % n, y = (i * 41) % n
      ctx.strokeStyle = i % 3 ? 'rgba(69,38,30,.30)' : 'rgba(225,182,142,.42)'
      ctx.lineWidth = i % 4 === 0 ? 3 : 1
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(Math.min(n, x + 18 + i % 24), y + (i % 5) - 2); ctx.stroke()
    }
  }, true)
}

function fireAxeHandleTexture(): THREE.CanvasTexture {
  return paintedTexture('detail-fire-axe-handle', (ctx, n) => {
    const grad = ctx.createLinearGradient(0, 0, n, 0)
    grad.addColorStop(0, '#9b5b0d'); grad.addColorStop(.18, '#efae28')
    grad.addColorStop(.52, '#ffd35b'); grad.addColorStop(.82, '#d48212'); grad.addColorStop(1, '#8c4b08')
    ctx.fillStyle = grad; ctx.fillRect(0, 0, n, n)
    ctx.strokeStyle = 'rgba(87,52,15,.34)'; ctx.lineWidth = 2
    for (let i = 0; i < 18; i++) {
      const y = (i * 47) % n
      ctx.beginPath(); ctx.moveTo((i * 31) % n, y); ctx.lineTo(Math.min(n, (i * 31) % n + 35), y + 3); ctx.stroke()
    }
  }, true)
}

function disinfectantLabel(): THREE.CanvasTexture {
  return paintedTexture('detail-disinfectant-label', (ctx, n) => {
    ctx.fillStyle = '#f5f5ea'; ctx.fillRect(0, 0, n, n)
    ctx.fillStyle = '#5b50ab'; ctx.fillRect(0, 0, n, 42)
    ctx.fillStyle = '#342b68'; ctx.font = font(24); ctx.textAlign = 'center'; ctx.fillText('DISINFECTANT', n / 2, 78)
    ctx.fillStyle = '#66aeb8'; ctx.fillRect(110, 92, 36, 106); ctx.fillRect(75, 127, 106, 36)
    ctx.fillStyle = '#4c6670'; ctx.font = font(18); ctx.fillText('70% SOLUTION', n / 2, 225)
  })
}

function glowTubeTexture(): THREE.CanvasTexture {
  return paintedTexture('detail-glow-tube', (ctx, n) => {
    const grad = ctx.createLinearGradient(0, 0, n, 0)
    grad.addColorStop(0, '#356448'); grad.addColorStop(.22, '#9cf7ad'); grad.addColorStop(.5, '#e1ffe2')
    grad.addColorStop(.78, '#7ce394'); grad.addColorStop(1, '#315d42')
    ctx.fillStyle = grad; ctx.fillRect(0, 0, n, n)
    ctx.fillStyle = 'rgba(255,255,255,.65)'
    for (let i = 0; i < 12; i++) ctx.fillRect((i * 43) % n, (i * 79) % n, 3, 3)
  })
}

function coffeeCupTexture(): THREE.CanvasTexture {
  return paintedTexture('detail-coffee-cup', (ctx, n) => {
    ctx.fillStyle = '#e6dfd0'; ctx.fillRect(0, 0, n, n)
    for (let x = 0; x < n; x += 9) {
      ctx.fillStyle = x % 18 ? 'rgba(118,103,82,.07)' : 'rgba(255,255,255,.11)'
      ctx.fillRect(x, 0, 4, n)
    }
    ctx.fillStyle = '#60412d'; ctx.fillRect(0, 36, n, 9); ctx.fillRect(0, 210, n, 8)
    ctx.fillStyle = '#4c3325'; ctx.font = font(26); ctx.textAlign = 'center'; ctx.fillText('HOT COFFEE', n / 2, 138)
    ctx.font = font(13); ctx.fillText('FRESHLY BREWED', n / 2, 163)
  })
}

function coffeeSleeveTexture(): THREE.CanvasTexture {
  return paintedTexture('detail-coffee-sleeve', (ctx, n) => {
    ctx.fillStyle = '#795136'; ctx.fillRect(0, 0, n, n)
    ctx.strokeStyle = 'rgba(45,27,17,.45)'; ctx.lineWidth = 2
    for (let y = 0; y < n; y += 7) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(n, y); ctx.stroke() }
    ctx.strokeStyle = '#d4b57e'; ctx.lineWidth = 7; ctx.strokeRect(88, 64, 80, 128)
  }, true)
}

function cassetteFaceTexture(): THREE.CanvasTexture {
  return paintedTexture('detail-cassette-face', (ctx, n) => {
    ctx.fillStyle = '#24272b'; ctx.fillRect(0, 0, n, n)
    ctx.fillStyle = '#d8d0ae'; ctx.fillRect(20, 20, n - 40, 118)
    ctx.fillStyle = '#a94b3c'; ctx.fillRect(20, 20, n - 40, 22)
    ctx.fillStyle = '#36393d'; ctx.font = font(17); ctx.textAlign = 'center'; ctx.fillText('AUDIO CASSETTE', n / 2, 67)
    ctx.strokeStyle = '#8f8874'; ctx.lineWidth = 4
    ctx.beginPath(); ctx.moveTo(46, 106); ctx.lineTo(210, 106); ctx.stroke()
    ctx.fillStyle = '#121416'; ctx.fillRect(48, 153, 160, 65)
    ctx.fillStyle = '#a74b3a'; ctx.beginPath(); ctx.moveTo(83, 218); ctx.lineTo(108, 168); ctx.lineTo(148, 168); ctx.lineTo(175, 218); ctx.fill()
  })
}

function lighterBodyTexture(): THREE.CanvasTexture {
  return paintedTexture('detail-lighter-body', (ctx, n) => {
    const grad = ctx.createLinearGradient(0, 0, n, 0)
    grad.addColorStop(0, '#676c6c'); grad.addColorStop(.3, '#e2e2d9'); grad.addColorStop(.62, '#929796'); grad.addColorStop(1, '#d9d8cc')
    ctx.fillStyle = grad; ctx.fillRect(0, 0, n, n)
    ctx.strokeStyle = 'rgba(50,53,52,.24)'
    for (let y = 8; y < n; y += 12) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(n, y + 4); ctx.stroke() }
    ctx.fillStyle = 'rgba(49,51,50,.65)'; ctx.font = font(18); ctx.textAlign = 'center'; ctx.fillText('WINDPROOF', n / 2, 210)
  }, true)
}

function darkGripTexture(): THREE.CanvasTexture {
  return paintedTexture('detail-dark-grip', (ctx, n) => {
    ctx.fillStyle = '#30261f'; ctx.fillRect(0, 0, n, n)
    ctx.strokeStyle = '#72543d'; ctx.lineWidth = 4
    for (let x = -n; x < n * 2; x += 28) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + n, n); ctx.stroke() }
    ctx.strokeStyle = 'rgba(220,190,150,.22)'; ctx.lineWidth = 1
    for (let x = -n; x < n * 2; x += 28) { ctx.beginPath(); ctx.moveTo(x + 8, 0); ctx.lineTo(x + n + 8, n); ctx.stroke() }
  }, true)
}

function add(group: THREE.Group, geometry: THREE.BufferGeometry, material: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  const mesh = new THREE.Mesh(geometry, material)
  mesh.position.set(x, y, z)
  group.add(mesh)
  return mesh
}

function box(group: THREE.Group, w: number, h: number, d: number, material: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  return add(group, new THREE.BoxGeometry(w, h, d), material, x, y, z)
}

function cylinder(group: THREE.Group, rt: number, rb: number, h: number, material: THREE.Material, x = 0, y = 0, z = 0, seg = 12): THREE.Mesh {
  return add(group, new THREE.CylinderGeometry(rt, rb, h, seg), material, x, y, z)
}

function buildDisinfectant(): THREE.Group {
  const g = new THREE.Group()
  const plastic = litMaterial({ color: '#e8eeeb', roughness: .74, envBase: .08 })
  const liquid = litMaterial({ color: '#8dcbd0', transparent: true, opacity: .76, roughness: .45, envBase: .18 })
  cylinder(g, .074, .078, .18, plastic, 0, -.035, 0, 12)
  cylinder(g, .06, .074, .055, plastic, 0, .082, 0, 12)
  cylinder(g, .036, .046, .046, liquid, 0, .133, 0, 12)
  cylinder(g, .04, .04, .027, litMaterial({ color: '#d4d5ce', roughness: .8 }), 0, .164, 0, 12)
  const pump = box(g, .105, .024, .034, litMaterial({ color: '#e6e7df', roughness: .78 }), .028, .194, 0)
  pump.rotation.z = -.08
  box(g, .022, .044, .022, litMaterial({ color: '#d0d2cc', roughness: .78 }), -.012, .182, 0)
  const label = new THREE.Mesh(new THREE.PlaneGeometry(.112, .11), new THREE.MeshLambertMaterial({ map: disinfectantLabel() }))
  label.position.set(0, -.035, .079); g.add(label)
  return g
}

function buildGlowstick(): THREE.Group {
  const g = new THREE.Group()
  const innerMat = new THREE.MeshBasicMaterial({ color: '#a7f5b2', map: glowTubeTexture(), transparent: true, opacity: .92 })
  const shellMat = litMaterial({ color: '#d5f5dc', transparent: true, opacity: .33, roughness: .18, envBase: .35 })
  const inner = cylinder(g, .017, .017, .34, innerMat, 0, 0, 0, 14); inner.rotation.z = Math.PI / 2
  const shell = cylinder(g, .025, .025, .36, shellMat, 0, 0, 0, 14); shell.rotation.z = Math.PI / 2
  const capMat = litMaterial({ color: '#315c43', map: darkGripTexture(), roughness: .8 })
  const left = cylinder(g, .03, .03, .045, capMat, -.2, 0, 0, 12); left.rotation.z = Math.PI / 2
  const right = cylinder(g, .03, .03, .045, capMat, .2, 0, 0, 12); right.rotation.z = Math.PI / 2
  const loop = add(g, new THREE.TorusGeometry(.042, .008, 7, 18), capMat, -.238, 0, 0)
  loop.rotation.y = Math.PI / 2
  return g
}

function buildCoffee(): THREE.Group {
  const g = new THREE.Group()
  const cup = cylinder(g, .076, .058, .21, litMaterial({ color: '#ffffff', map: coffeeCupTexture(), roughness: .88 }), 0, -.005, 0, 18)
  cup.rotation.y = .15
  cylinder(g, .082, .077, .025, litMaterial({ color: '#2e2926', roughness: .68 }), 0, .113, 0, 18)
  cylinder(g, .066, .066, .008, litMaterial({ color: '#4a2c1d', roughness: .48 }), 0, .129, 0, 18)
  const rim = add(g, new THREE.TorusGeometry(.075, .009, 6, 22), litMaterial({ color: '#38312d', roughness: .64 }), 0, .124, 0)
  rim.rotation.x = Math.PI / 2
  const sleeve = cylinder(g, .079, .069, .078, litMaterial({ color: '#ffffff', map: coffeeSleeveTexture(), roughness: .92 }), 0, -.015, 0, 18)
  sleeve.rotation.y = -.08
  box(g, .034, .009, .018, new THREE.MeshLambertMaterial({ color: '#181614' }), .028, .134, -.047)
  return g
}

function buildTape(): THREE.Group {
  const g = new THREE.Group()
  const shell = litMaterial({ color: '#2b2d31', map: darkGripTexture(), roughness: .82 })
  box(g, .29, .18, .058, shell)
  const face = new THREE.Mesh(new THREE.PlaneGeometry(.275, .166), new THREE.MeshLambertMaterial({ map: cassetteFaceTexture() }))
  face.position.z = .0305; g.add(face)
  const reelMat = litMaterial({ color: '#ded6b7', roughness: .74 })
  for (const x of [-.068, .068]) {
    const reel = cylinder(g, .047, .047, .02, reelMat, x, .025, .047, 18); reel.rotation.x = Math.PI / 2
    const hub = cylinder(g, .018, .018, .024, litMaterial({ color: '#303238', roughness: .8 }), x, .025, .06, 10); hub.rotation.x = Math.PI / 2
    const ring = add(g, new THREE.TorusGeometry(.032, .006, 6, 16), litMaterial({ color: '#695f50', roughness: .82 }), x, .025, .061)
    g.add(ring)
  }
  for (const x of [-.12, .12]) for (const y of [-.06, .068]) {
    const screw = cylinder(g, .006, .006, .008, litMaterial({ color: '#9a9c99', metalness: .55, roughness: .45 }), x, y, .034, 8)
    screw.rotation.x = Math.PI / 2
  }
  return g
}

function buildLighter(): THREE.Group {
  const g = new THREE.Group()
  const steel = litMaterial({ color: '#ffffff', map: lighterBodyTexture(), metalness: .72, roughness: .34, envBase: .45 })
  box(g, .088, .13, .058, steel, 0, -.025, 0)
  box(g, .088, .05, .058, steel, 0, .079, 0)
  const hinge = cylinder(g, .012, .012, .06, litMaterial({ color: '#777c7b', metalness: .7, roughness: .4 }), -.054, .055, 0, 10)
  hinge.rotation.x = Math.PI / 2
  box(g, .046, .044, .042, litMaterial({ color: '#686c6b', metalness: .65, roughness: .4 }), .007, .043, 0)
  const wheel = cylinder(g, .022, .022, .03, litMaterial({ color: '#414443', metalness: .65, roughness: .55 }), .018, .068, 0, 14)
  wheel.rotation.x = Math.PI / 2
  cylinder(g, .006, .006, .02, litMaterial({ color: '#302820', roughness: 1 }), -.012, .071, 0, 8)
  for (let i = 0; i < 6; i++) box(g, .005, .01, .004, new THREE.MeshLambertMaterial({ color: '#1e2020' }), -.009 + (i % 3) * .012, .035 + Math.floor(i / 3) * .018, .023)
  return g
}

function buildCrowbar(): THREE.Group {
  const g = new THREE.Group()
  const red = litMaterial({ color: '#ffffff', map: wornRedTexture(), metalness: .5, roughness: .55, envBase: .2 })
  // 羊角端磨出明亮裸钢，尾端保留氧化黑铁色；中段仍是磨损红漆，三个区域一眼可分。
  const clawSteel = litMaterial({ color: '#d5d9d6', map: brushedMetalTexture(), metalness: .78, roughness: .32, envBase: .38 })
  const heelIron = litMaterial({ color: '#3d4140', map: brushedMetalTexture(), metalness: .64, roughness: .52, envBase: .2 })
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-.31, -.06, 0), new THREE.Vector3(-.27, -.015, 0),
    new THREE.Vector3(-.14, 0, 0), new THREE.Vector3(.18, 0, 0),
    // 羊角端沿 -Z 向前弯；竖持时不会再横向歪向屏幕侧边。
    new THREE.Vector3(.255, 0, -.035), new THREE.Vector3(.305, 0, -.12),
  ])
  add(g, new THREE.TubeGeometry(curve, 22, .021, 8, false), red)
  // 两支羊角沿本地 Y 分叉：模型竖起后会在屏幕横向展开，弯曲本身仍朝前。
  for (const y of [-.018, .018]) {
    const claw = box(g, .105, .014, .017, clawSteel, .345, y, -.137)
    claw.rotation.y = -.22
  }
  box(g, .04, .052, .04, red, .3, 0, -.102) // 羊角端红漆与裸钢的过渡箍
  const heel = box(g, .09, .017, .047, heelIron, -.327, -.086, 0)
  heel.rotation.z = -.55
  return g
}

function flatExtrude(shape: THREE.Shape, depth: number, material: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  const geo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelSegments: 1, bevelSize: .005, bevelThickness: .004 })
  geo.rotateX(-Math.PI / 2)
  geo.translate(x, y - depth / 2, z)
  return new THREE.Mesh(geo, material)
}

function buildAxe(): THREE.Group {
  const g = new THREE.Group()
  const handleMat = litMaterial({ color: '#ffffff', map: fireAxeHandleTexture(), roughness: .72, envBase: .08 })
  const redHead = litMaterial({ color: '#ffffff', map: wornRedTexture(), metalness: .58, roughness: .48, envBase: .24 })
  const steel = litMaterial({ color: '#ffffff', map: brushedMetalTexture(), metalness: .7, roughness: .42, envBase: .32 })
  const blackRubber = litMaterial({ color: '#242628', map: darkGripTexture(), roughness: .94 })
  const darkSteel = litMaterial({ color: '#34383a', map: brushedMetalTexture(), metalness: .66, roughness: .5, envBase: .2 })

  // 黄色玻纤长柄：从尾端到斧眼连续贯穿，比例接近真实短柄消防斧。
  const handle = cylinder(g, .022, .029, .58, handleMat, -.045, 0, 0, 14)
  handle.rotation.z = Math.PI / 2
  const grip = cylinder(g, .034, .034, .17, blackRubber, -.31, 0, 0, 14)
  grip.rotation.z = Math.PI / 2
  const butt = cylinder(g, .039, .035, .028, blackRubber, -.407, 0, 0, 14)
  butt.rotation.z = Math.PI / 2

  // 斧眼/头部主体保持紧凑，不再用一整块巨大的侧面轮廓包住手柄。
  const hub = box(g, .115, .062, .09, redHead, .225, 0, 0)
  hub.rotation.y = -.04
  box(g, .073, .068, .06, darkSteel, .22, .002, 0) // 斧眼内衬
  box(g, .028, .075, .066, blackRubber, .252, .02, 0) // 顶部固定楔

  // 前方独立斧片（本地 +Z）：根部窄、刃口宽，轮廓轻微外弧。
  const bladeBody = new THREE.Shape()
  // flatExtrude 会把 Shape 的 -Y 映射到本地 +Z，因此这里使用负值构造斧片方向。
  bladeBody.moveTo(-.046, -.018)
  bladeBody.lineTo(.048, -.018)
  bladeBody.bezierCurveTo(.058, -.052, .074, -.085, .082, -.116)
  bladeBody.lineTo(.064, -.126)
  bladeBody.lineTo(-.073, -.126)
  bladeBody.lineTo(-.086, -.113)
  bladeBody.bezierCurveTo(-.071, -.08, -.057, -.046, -.046, -.018)
  bladeBody.closePath()
  g.add(flatExtrude(bladeBody, .056, redHead, .225, .028, 0))

  // 银色切削刃是单独的薄弧片，只占最前端，不再形成厚重白色方条。
  const edgeShape = new THREE.Shape()
  edgeShape.moveTo(-.073, -.119)
  edgeShape.lineTo(.065, -.119)
  edgeShape.lineTo(.074, -.137)
  edgeShape.lineTo(-.083, -.137)
  edgeShape.closePath()
  g.add(flatExtrude(edgeShape, .06, steel, .225, .03, 0))

  // 后置尖镐（本地 -Z）：圆润根部过渡到裸钢尖端，和前斧片形成标准消防斧轮廓。
  const pickRoot = cylinder(g, .035, .043, .075, redHead, .225, 0, -.074, 12)
  pickRoot.rotation.x = Math.PI / 2
  const pick = add(g, new THREE.ConeGeometry(.034, .115, 12), darkSteel, .225, 0, -.165)
  pick.rotation.x = -Math.PI / 2

  // 柄身靠近头部的防滑护圈，遮住斧眼连接缝并强化受力结构。
  const collar = cylinder(g, .032, .032, .07, blackRubber, .155, 0, 0, 14)
  collar.rotation.z = Math.PI / 2
  return g
}

function buildKnife(): THREE.Group {
  const g = new THREE.Group()
  const steel = litMaterial({ color: '#ffffff', map: brushedMetalTexture(), metalness: .75, roughness: .32, envBase: .38 })
  const cuttingEdge = litMaterial({ color: '#f5f7f3', map: brushedMetalTexture(), metalness: .88, roughness: .2, envBase: .5 })
  const grip = litMaterial({ color: '#ffffff', map: darkGripTexture(), roughness: .84 })
  const blade = new THREE.Shape()
  // 收窄刃厚并把刀尖前伸；背部保持厚实，刃腹在末端快速汇聚成尖点。
  blade.moveTo(-.11, -.038); blade.lineTo(.165, -.038); blade.lineTo(.265, 0)
  blade.lineTo(.125, .061); blade.lineTo(-.11, .05); blade.closePath()
  g.add(flatExtrude(blade, .014, steel, .045, .007, 0))
  const edge = new THREE.Shape()
  edge.moveTo(-.095, -.039); edge.lineTo(.165, -.039); edge.lineTo(.265, 0)
  edge.lineTo(.142, -.011); edge.lineTo(-.095, -.013); edge.closePath()
  g.add(flatExtrude(edge, .008, cuttingEdge, .045, .018, 0))
  // 刀脊浅槽，近看能分辨刀身厚面与真正刃线。
  box(g, .19, .006, .008, litMaterial({ color: '#555b5b', metalness: .72, roughness: .42 }), .035, .018, -.03)
  box(g, .032, .035, .12, litMaterial({ color: '#787b79', metalness: .65, roughness: .45 }), -.08, .003, 0)
  const handle = box(g, .18, .04, .064, grip, -.18, 0, 0)
  handle.rotation.z = -.03
  for (const x of [-.23, -.16, -.1]) cylinder(g, .006, .006, .046, litMaterial({ color: '#b8b9b5', metalness: .7, roughness: .4 }), x, .022, 0, 8).rotation.x = Math.PI / 2
  return g
}

function buildWallpaper(): THREE.Group {
  const g = new THREE.Group()
  const paperTex = levelTexture('l0_wall_classic_v2.png', () => noiseTexture('#d4cf76', '#aca654'))
  const paperMat = litMaterial({ color: '#fffbe9', map: paperTex, roughness: 1, side: THREE.DoubleSide })
  const scrapA = new THREE.Shape()
  scrapA.moveTo(-.18, -.12); scrapA.lineTo(.15, -.1); scrapA.lineTo(.19, -.025)
  scrapA.lineTo(.13, .13); scrapA.lineTo(-.12, .11); scrapA.lineTo(-.2, .035); scrapA.closePath()
  const a = add(g, new THREE.ShapeGeometry(scrapA), paperMat, -.03, .012, 0)
  a.rotation.x = -Math.PI / 2; a.rotation.z = -.12
  const scrapB = new THREE.Shape()
  scrapB.moveTo(-.11, -.07); scrapB.lineTo(.1, -.08); scrapB.lineTo(.13, .08); scrapB.lineTo(-.08, .1); scrapB.closePath()
  const b = add(g, new THREE.ShapeGeometry(scrapB), paperMat, .11, .025, .05)
  b.rotation.x = -Math.PI / 2; b.rotation.z = .38
  const curl = cylinder(g, .024, .024, .2, paperMat, -.17, .032, -.015, 12)
  curl.rotation.z = Math.PI / 2; curl.rotation.y = -.12
  return g
}

export function buildDetailedItemMesh(type: DetailedItemType): THREE.Group {
  switch (type) {
    case 'disinfectant': return buildDisinfectant()
    case 'glowstick': return buildGlowstick()
    case 'coffee': return buildCoffee()
    case 'tape': return buildTape()
    case 'lighter': return buildLighter()
    case 'crowbar': return buildCrowbar()
    case 'axe': return buildAxe()
    case 'knife': return buildKnife()
    case 'wallpaper': return buildWallpaper()
  }
}
