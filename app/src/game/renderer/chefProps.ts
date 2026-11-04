// [chef] 厨师（Entity 800）道具：唯一带把手的大汤锅（武器兼炊具）、炖菜大锅、雕刻刀、汤勺、紫甘蓝、生肉块、手铐 + 铁管段、
// M.E.G. 档案员相机、档案员胸麦。全部用 three 基础几何 + 车削 + 画布贴图，按「原点 = 握点 / 底面中心，+Y 向上（手持件 +Y = 指向前端）」建造。
// chefMesh 把汤锅 / 雕刻刀 / 汤勺挂右手、紫甘蓝 / 肉块挂左手（默认隐藏）；相机 / 胸麦 / 手铐 / 炖锅是场景件。
// 血 / 油污：贴图里画好（程序生成），按 setChefPropBlood(0..1) 调透明度（和身体的 bloodLevel 同步）。
import * as THREE from 'three'
import { litMaterial } from './shared'

let seed = 800
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
/** 道具血迹层（共享）：透明度 = 血量 */
const BLOOD_MATS: THREE.Material[] = []
export function setChefPropBlood(k: number) { for (const m of BLOOD_MATS) { m.opacity = Math.max(0, Math.min(1, 0.15 + 0.85 * k)); m.visible = k > 0.02 } }
function bloodTexture(w: number, h: number, drips: number, splats: number, s0: number) {
  seed = s0
  const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d')!
  g.clearRect(0, 0, w, h)
  for (let k = 0; k < splats; k++) {
    const x = rnd() * w, y = rnd() * h, r = 2 + rnd() * 10
    g.fillStyle = `rgba(${90 + rnd() * 50 | 0},${4 + rnd() * 8 | 0},${6 + rnd() * 8 | 0},${0.6 + rnd() * 0.35})`
    g.beginPath(); g.ellipse(x, y, r, r * (0.6 + rnd() * 0.6), rnd() * 3, 0, Math.PI * 2); g.fill()
    for (let j = 0; j < 4; j++) { const a = rnd() * 6.28, d = r * (1.4 + rnd() * 2); g.beginPath(); g.arc(x + Math.cos(a) * d, y + Math.sin(a) * d, 0.8 + rnd() * 2, 0, 6.28); g.fill() }
  }
  for (let k = 0; k < drips; k++) {
    const x = rnd() * w, y0 = rnd() * h * 0.5, L = 20 + rnd() * h * 0.5, wd = 2 + rnd() * 5
    const gr = g.createLinearGradient(0, y0, 0, y0 + L); gr.addColorStop(0, 'rgba(110,8,10,0.9)'); gr.addColorStop(1, 'rgba(60,4,6,0.85)')
    g.fillStyle = gr; g.beginPath(); g.moveTo(x - wd, y0); g.quadraticCurveTo(x - wd * 0.3, y0 + L * 0.7, x, y0 + L); g.quadraticCurveTo(x + wd * 0.3, y0 + L * 0.7, x + wd, y0); g.fill()
    g.beginPath(); g.arc(x, y0 + L, wd * 0.7, 0, 6.28); g.fill()
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4
  return t
}
function bloodLayer(geo: THREE.BufferGeometry, tex: THREE.Texture) {
  const m = litMaterial({ color: '#ffffff', map: tex, transparent: true, depthWrite: false, roughness: 0.3, polygonOffset: true, polygonOffsetFactor: -2 } as THREE.MeshLambertMaterialParameters)
  m.opacity = 0.75; BLOOD_MATS.push(m)
  const o = new THREE.Mesh(geo, m); o.name = 'blood'; o.renderOrder = 2
  return o
}
/** 拉丝不锈钢贴图（横向拉丝 + 凹痕暗斑 + 底部焦黑） */
function steelTexture(s0: number, burnt = 0.5) {
  seed = s0
  const W = 512, H = 256, c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d')!
  g.fillStyle = '#9a9a97'; g.fillRect(0, 0, W, H)
  for (let y = 0; y < H; y++) { g.fillStyle = `rgba(${rnd() < 0.5 ? '255,255,255' : '40,40,40'},${0.04 + rnd() * 0.06})`; g.fillRect(0, y, W, 1) }
  for (let k = 0; k < 40; k++) { const x = rnd() * W, y = rnd() * H, r = 4 + rnd() * 18; const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, 'rgba(50,48,44,0.35)'); gr.addColorStop(1, 'rgba(50,48,44,0)'); g.fillStyle = gr; g.fillRect(x - r, y - r, 2 * r, 2 * r) }
  const gb = g.createLinearGradient(0, H * (1 - 0.35 * burnt), 0, H); gb.addColorStop(0, 'rgba(30,22,14,0)'); gb.addColorStop(1, `rgba(30,22,14,${0.85 * burnt})`); g.fillStyle = gb; g.fillRect(0, 0, W, H)
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = THREE.RepeatWrapping; t.anisotropy = 4
  return t
}
const lathe = (pts: [number, number][], seg = 32) => new THREE.LatheGeometry(pts.map(([x, y]) => new THREE.Vector2(x, y)), seg)
/** 凹痕：随机推几处顶点（大汤锅被拿来砸人） */
function dent(geo: THREE.BufferGeometry, n: number, s0: number, depth = 0.008) {
  seed = s0
  const p = geo.attributes.position, hits: THREE.Vector3[] = []
  for (let k = 0; k < n; k++) hits.push(new THREE.Vector3(Math.cos(rnd() * 6.28), 0.03 + rnd() * 0.12, Math.sin(rnd() * 6.28)))
  const v = new THREE.Vector3()
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i)
    const r = Math.hypot(v.x, v.z); if (r < 0.05) continue
    for (const h of hits) { const a = Math.atan2(v.z, v.x) - Math.atan2(h.z, h.x), dy = v.y - h.y; const dd = Math.exp(-((Math.atan2(Math.sin(a), Math.cos(a)) * 6) ** 2) - (dy / 0.03) ** 2); const k = 1 - depth * dd / r; v.x *= k; v.z *= k }
    p.setXYZ(i, v.x, v.y, v.z)
  }
  geo.computeVertexNormals()
}

/** 唯一带把手的大汤锅（武器）：原点 = 握点（把手中段），+Y = 指向锅（握着时锅在前端）。锅径 0.30、深 0.17、把手 0.32 m */
export function buildChefPot(): THREE.Group {
  const g = new THREE.Group(); g.name = 'chefPot'
  const tex = steelTexture(801, 0.8)
  const steel = litMaterial({ color: '#ffffff', map: tex, roughness: 0.35, metalness: 0.85, side: THREE.DoubleSide } as THREE.MeshLambertMaterialParameters)
  const R = 0.15, Hh = 0.17
  const body = lathe([[0, 0.0], [R - 0.02, 0.0], [R - 0.004, 0.006], [R, 0.03], [R, Hh - 0.01], [R + 0.008, Hh], [R + 0.006, Hh + 0.004], [R - 0.004, Hh - 0.004], [R - 0.006, 0.02], [R - 0.024, 0.006], [0, 0.006]], 40)
  dent(body, 4, 802)
  const pot = new THREE.Group(); pot.name = 'potBody'
  const bm = new THREE.Mesh(body, steel); bm.castShadow = true; bm.receiveShadow = true; pot.add(bm)
  // 锅里剩一层暗红的汤底
  const soup = new THREE.Mesh(new THREE.CircleGeometry(R - 0.008, 32), litMaterial({ color: '#3d0d0b', roughness: 0.2 })); soup.rotation.x = -Math.PI / 2; soup.position.y = 0.035; pot.add(soup)
  const bl = bloodLayer(lathe([[R + 0.0015, 0.02], [R + 0.0015, Hh - 0.005]], 40), bloodTexture(512, 128, 9, 26, 803)); pot.add(bl)
  // 把手：铆在锅沿下方的长柄（黑色电木柄 + 钢颈 + 两颗铆钉 + 挂孔）
  const neck = new THREE.Mesh(new THREE.BoxGeometry(0.032, 0.012, 0.09), steel); neck.position.set(0, Hh - 0.03, R + 0.04); pot.add(neck)
  const handleMat = litMaterial({ color: '#1a1614', roughness: 0.55 })
  const hgeo = new THREE.CapsuleGeometry(0.016, 0.2, 6, 14); hgeo.rotateX(Math.PI / 2)
  const handle = new THREE.Mesh(hgeo, handleMat); handle.position.set(0, Hh - 0.022, R + 0.19); handle.rotation.x = -0.12; handle.castShadow = true; pot.add(handle)
  const hole = new THREE.Mesh(new THREE.TorusGeometry(0.008, 0.003, 6, 16), steel); hole.rotation.x = Math.PI / 2; hole.position.set(0, Hh - 0.005, R + 0.29); pot.add(hole)
  for (const x of [-0.009, 0.009]) { const rv = new THREE.Mesh(new THREE.SphereGeometry(0.0045, 8, 6), steel); rv.position.set(x, Hh - 0.03, R + 0.003); pot.add(rv) }
  // 握点 = 把手中段：把锅整体平移 / 旋转到「握点在原点、锅在 +Y 方向」
  // 锅局部里把手方向 = −Z（握点 → 锅）；绕 X 转 +90° 后 −Z → +Y，锅口朝组的 +Z
  pot.position.set(0, -(Hh - 0.022), -(R + 0.19))
  const holder = new THREE.Group(); holder.add(pot); holder.rotation.x = Math.PI / 2
  g.add(holder)
  g.userData.grip = new THREE.Vector3(0, 0, 0)
  return g
}
/** 炖菜大锅（底面中心为原点）：径 0.62、高 0.4，两侧环耳，锅里一锅冒热气的暗红炖菜 + 肉块 / 骨头 / 紫甘蓝碎 */
export function buildStewCauldron(): THREE.Group {
  const g = new THREE.Group(); g.name = 'chefStewPot'
  const steel = litMaterial({ color: '#ffffff', map: steelTexture(811, 1.0), roughness: 0.4, metalness: 0.8, side: THREE.DoubleSide } as THREE.MeshLambertMaterialParameters)
  const R = 0.31, H = 0.4
  const body = lathe([[0, 0], [R - 0.03, 0], [R, 0.04], [R, H - 0.01], [R + 0.012, H], [R + 0.01, H + 0.006], [R - 0.006, H - 0.004], [R - 0.008, 0.04], [R - 0.035, 0.008], [0, 0.008]], 48)
  const m = new THREE.Mesh(body, steel); m.castShadow = true; m.receiveShadow = true; g.add(m)
  for (const s of [1, -1]) { const ear = new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.009, 8, 20, Math.PI), steel); ear.position.set(s * (R + 0.012), H - 0.06, 0); ear.rotation.set(0, s > 0 ? Math.PI / 2 : -Math.PI / 2, -Math.PI / 2); g.add(ear) }
  // 炖菜面：深红褐 + 油光 + 浮着的肉块 / 骨头 / 紫甘蓝
  const stewC = document.createElement('canvas'); stewC.width = stewC.height = 256; const sg = stewC.getContext('2d')!
  seed = 812; sg.fillStyle = '#4a1610'; sg.fillRect(0, 0, 256, 256)
  for (let k = 0; k < 120; k++) { sg.fillStyle = `rgba(${150 + rnd() * 60 | 0},${60 + rnd() * 40 | 0},${20 + rnd() * 20 | 0},${0.2 + rnd() * 0.3})`; sg.beginPath(); sg.arc(rnd() * 256, rnd() * 256, 1 + rnd() * 6, 0, 6.28); sg.fill() }
  const st = new THREE.CanvasTexture(stewC); st.colorSpace = THREE.SRGBColorSpace
  const surf = new THREE.Mesh(new THREE.CircleGeometry(R - 0.01, 40), litMaterial({ color: '#ffffff', map: st, roughness: 0.15 })); surf.rotation.x = -Math.PI / 2; surf.position.y = H - 0.06; g.add(surf)
  seed = 813
  const meat = litMaterial({ color: '#6e2a22', roughness: 0.5 }), fat = litMaterial({ color: '#c9b39a', roughness: 0.5 }), cab = litMaterial({ color: '#4a1640', roughness: 0.6 })
  for (let k = 0; k < 14; k++) {
    const a = rnd() * 6.28, r = rnd() * (R - 0.06)
    const kind = rnd()
    const o = kind < 0.55 ? new THREE.Mesh(new THREE.DodecahedronGeometry(0.02 + rnd() * 0.022, 0), meat) : kind < 0.8 ? new THREE.Mesh(new THREE.CapsuleGeometry(0.008, 0.06, 3, 8), fat) : new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.006, 0.03), cab)
    o.position.set(Math.cos(a) * r, H - 0.06 + 0.004, Math.sin(a) * r); o.rotation.set(rnd() * 3, rnd() * 3, rnd() * 3); g.add(o)
  }
  g.add(bloodLayer(lathe([[R + 0.0015, 0.15], [R + 0.0015, H - 0.005]], 48), bloodTexture(1024, 128, 14, 20, 814)))
  return g
}
/** 雕刻刀（原点 = 握点，+Y = 刀尖）：刃长 0.26 的窄长刀身 + 黑木柄三铆钉 */
export function buildCarvingKnife(): THREE.Group {
  const g = new THREE.Group(); g.name = 'chefKnife'
  const shape = new THREE.Shape()
  shape.moveTo(0, 0); shape.lineTo(0.03, 0); shape.quadraticCurveTo(0.03, 0.18, 0.0, 0.26); shape.lineTo(-0.004, 0.2); shape.lineTo(-0.004, 0.0); shape.lineTo(0, 0)
  const blade = new THREE.ExtrudeGeometry(shape, { depth: 0.0018, bevelEnabled: true, bevelThickness: 0.0006, bevelSize: 0.0006, bevelSegments: 1 })
  blade.translate(-0.013, 0.06, -0.0009)
  const bm = new THREE.Mesh(blade, litMaterial({ color: '#c5c8c9', roughness: 0.2, metalness: 0.9 })); bm.castShadow = true; g.add(bm)
  const bl = new THREE.Mesh(blade.clone(), litMaterial({ color: '#7a0b0d', roughness: 0.25, transparent: true, opacity: 0.85, polygonOffset: true, polygonOffsetFactor: -2 } as THREE.MeshLambertMaterialParameters)); bl.scale.set(1.002, 0.55, 1.2); bl.position.y = 0.11; bl.name = 'blood'; BLOOD_MATS.push(bl.material as THREE.Material); g.add(bl)
  const wood = litMaterial({ color: '#2a1810', roughness: 0.6 })
  const handle = new THREE.Mesh(new THREE.BoxGeometry(0.026, 0.12, 0.018), wood); handle.position.y = 0.0; g.add(handle)
  const bolster = new THREE.Mesh(new THREE.BoxGeometry(0.032, 0.012, 0.02), litMaterial({ color: '#9a9c9c', roughness: 0.3, metalness: 0.9 })); bolster.position.y = 0.062; g.add(bolster)
  for (const y of [-0.035, 0.0, 0.035]) { const r = new THREE.Mesh(new THREE.CylinderGeometry(0.0035, 0.0035, 0.02, 10), litMaterial({ color: '#b9b9b5', metalness: 0.9, roughness: 0.3 })); r.rotation.x = Math.PI / 2; r.position.set(0, y, 0); g.add(r) }
  return g
}
/** 汤勺（原点 = 握点，+Y = 勺头方向）：长柄 0.34 + 半球勺头（勺里一点汤） */
export function buildLadle(): THREE.Group {
  const g = new THREE.Group(); g.name = 'chefLadle'
  const steel = litMaterial({ color: '#b8bab8', roughness: 0.25, metalness: 0.9, side: THREE.DoubleSide } as THREE.MeshLambertMaterialParameters)
  const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.007, 0.34, 10), steel); stick.position.y = 0.09; g.add(stick)
  const hook = new THREE.Mesh(new THREE.TorusGeometry(0.014, 0.005, 6, 16, Math.PI), steel); hook.position.set(0, -0.08, 0.014); hook.rotation.y = Math.PI / 2; g.add(hook)
  const bowl = new THREE.Mesh(new THREE.SphereGeometry(0.05, 20, 10, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), steel); bowl.position.set(0, 0.27, 0.048); g.add(bowl)
  const soup = new THREE.Mesh(new THREE.CircleGeometry(0.044, 20), litMaterial({ color: '#4a120e', roughness: 0.15 })); soup.rotation.x = -Math.PI / 2; soup.position.set(0, 0.255, 0.048); g.add(soup)
  return g
}
/** 紫甘蓝（中心为原点）：一层层包着的紫红叶球 + 外层翻开的叶片（叶脉白）；附图里他手里捧的那团 */
export function buildRedCabbage(): THREE.Group {
  const g = new THREE.Group(); g.name = 'chefCabbage'
  seed = 821
  const leafC = document.createElement('canvas'); leafC.width = leafC.height = 256; const lg = leafC.getContext('2d')!
  const grd = lg.createRadialGradient(128, 128, 10, 128, 128, 160); grd.addColorStop(0, '#5a1a52'); grd.addColorStop(1, '#2c0b2c'); lg.fillStyle = grd; lg.fillRect(0, 0, 256, 256)
  lg.strokeStyle = 'rgba(220,190,220,0.55)'; lg.lineWidth = 3
  for (let k = 0; k < 9; k++) { const a = (k / 9) * 6.28; lg.beginPath(); lg.moveTo(128, 128); lg.quadraticCurveTo(128 + Math.cos(a + 0.4) * 70, 128 + Math.sin(a + 0.4) * 70, 128 + Math.cos(a) * 128, 128 + Math.sin(a) * 128); lg.stroke() }
  for (let k = 0; k < 400; k++) { lg.fillStyle = `rgba(160,120,170,${rnd() * 0.15})`; lg.fillRect(rnd() * 256, rnd() * 256, 2, 2) }
  const lt = new THREE.CanvasTexture(leafC); lt.colorSpace = THREE.SRGBColorSpace
  const mat = litMaterial({ color: '#ffffff', map: lt, roughness: 0.45, side: THREE.DoubleSide } as THREE.MeshLambertMaterialParameters)
  const core = new THREE.SphereGeometry(0.075, 28, 20)
  const p = core.attributes.position, v = new THREE.Vector3()
  for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i); const k = 1 + 0.05 * Math.sin(Math.atan2(v.z, v.x) * 5 + v.y * 40) + 0.03 * Math.sin(v.y * 70); v.multiplyScalar(k); p.setXYZ(i, v.x, v.y * 0.92, v.z) }
  core.computeVertexNormals()
  g.add(new THREE.Mesh(core, mat))
  for (let k = 0; k < 7; k++) {
    const leaf = new THREE.SphereGeometry(0.09 + rnd() * 0.012, 16, 10, 0, 1.3 + rnd() * 0.6, 0.6 + rnd() * 0.3, 1.5)
    const m = new THREE.Mesh(leaf, mat); m.rotation.set((rnd() - 0.5) * 0.6, (k / 7) * 6.28, (rnd() - 0.5) * 0.4); g.add(m)
  }
  // 外层几片被血浸湿（附图里那团紫红是湿的）
  const wet = new THREE.Mesh(new THREE.SphereGeometry(0.093, 18, 10, 0.4, 1.4, 0.9, 1.1), litMaterial({ color: '#5a0a12', roughness: 0.2, transparent: true, opacity: 0.6, side: THREE.DoubleSide } as THREE.MeshLambertMaterialParameters))
  wet.name = 'blood'; BLOOD_MATS.push(wet.material as THREE.Material); g.add(wet)
  return g
}
/** 生肉块（中心为原点）：一大块带肥膘和骨头断面的红肉 */
export function buildMeatChunk(): THREE.Group {
  const g = new THREE.Group(); g.name = 'chefMeat'
  seed = 831
  const geo = new THREE.IcosahedronGeometry(0.075, 3)
  const p = geo.attributes.position, v = new THREE.Vector3(), col = new Float32Array(p.count * 3)
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i); const k = 1 + 0.12 * Math.sin(v.x * 50 + 1) * Math.sin(v.y * 40) + 0.08 * Math.sin(v.z * 70)
    v.x *= 1.3 * k; v.y *= 0.8 * k; v.z *= k; p.setXYZ(i, v.x, v.y, v.z)
    const fatK = v.y > 0.035 ? 1 : 0, marb = 0.5 + 0.5 * Math.sin(v.x * 160 + v.z * 90)
    const c = fatK ? [0.78, 0.68, 0.55] : [0.42 + 0.1 * marb, 0.06, 0.06]
    col[i * 3] = c[0] ** 2.2; col[i * 3 + 1] = c[1] ** 2.2; col[i * 3 + 2] = c[2] ** 2.2
  }
  geo.computeVertexNormals(); geo.setAttribute('color', new THREE.BufferAttribute(col, 3))
  g.add(new THREE.Mesh(geo, litMaterial({ color: '#ffffff', vertexColors: true, roughness: 0.3 })))
  const bone = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.018, 0.05, 12), litMaterial({ color: '#e2d6bf', roughness: 0.6 })); bone.rotation.z = Math.PI / 2; bone.position.set(0.1, 0.0, 0.0); g.add(bone)
  const marrow = new THREE.Mesh(new THREE.CircleGeometry(0.009, 12), litMaterial({ color: '#7a2a1c', roughness: 0.5 })); marrow.position.set(0.1251, 0, 0); marrow.rotation.y = Math.PI / 2; g.add(marrow)
  return g
}
/** 手铐 + 铁管段（原点 = 管中心，管沿 X）：冷库里那根锈铁管，一只铐环扣在管上、另一只垂下张开 */
export function buildCuffsPipe(): THREE.Group {
  const g = new THREE.Group(); g.name = 'chefCuffsPipe'
  const rust = document.createElement('canvas'); rust.width = 256; rust.height = 64; const rg = rust.getContext('2d')!
  seed = 841; rg.fillStyle = '#5b5a57'; rg.fillRect(0, 0, 256, 64)
  for (let k = 0; k < 300; k++) { rg.fillStyle = `rgba(${120 + rnd() * 60 | 0},${50 + rnd() * 30 | 0},${20 + rnd() * 10 | 0},${rnd() * 0.5})`; rg.beginPath(); rg.arc(rnd() * 256, rnd() * 64, 1 + rnd() * 6, 0, 6.28); rg.fill() }
  const rt = new THREE.CanvasTexture(rust); rt.colorSpace = THREE.SRGBColorSpace; rt.wrapS = THREE.RepeatWrapping
  const pipeG = new THREE.CylinderGeometry(0.03, 0.03, 0.9, 20); pipeG.rotateZ(Math.PI / 2)
  const pipe = new THREE.Mesh(pipeG, litMaterial({ color: '#ffffff', map: rt, roughness: 0.75, metalness: 0.4 } as THREE.MeshLambertMaterialParameters)); pipe.castShadow = true; g.add(pipe)
  for (const x of [-0.42, 0.42]) { const fl = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.02, 20), litMaterial({ color: '#4a4846', roughness: 0.6, metalness: 0.5 })); fl.rotation.z = Math.PI / 2; fl.position.x = x; g.add(fl) }
  // 霜
  const frost = new THREE.Mesh(new THREE.CylinderGeometry(0.0315, 0.0315, 0.5, 20, 1, true), litMaterial({ color: '#dfe8ec', roughness: 0.9, transparent: true, opacity: 0.45 } as THREE.MeshLambertMaterialParameters)); frost.rotation.z = Math.PI / 2; frost.position.x = -0.15; g.add(frost)
  const steel = litMaterial({ color: '#a8aaab', roughness: 0.25, metalness: 0.9 })
  const cuff = (open: number) => {
    const c = new THREE.Group()
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.036, 0.0055, 8, 24, Math.PI * 2 - open), steel); c.add(ring)
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.022, 0.014), steel); box.position.set(0.04, 0, 0); c.add(box)
    return c
  }
  const c1 = cuff(0); c1.position.set(0.05, 0, 0); c1.rotation.y = Math.PI / 2; g.add(c1)
  const chain = new THREE.Group(); for (let k = 0; k < 3; k++) { const l = new THREE.Mesh(new THREE.TorusGeometry(0.009, 0.0025, 6, 12), steel); l.position.set(0.05, -0.05 - k * 0.016, 0.0); l.rotation.y = k % 2 ? Math.PI / 2 : 0; chain.add(l) } g.add(chain)
  const c2 = cuff(0.9); c2.position.set(0.05, -0.125, 0.0); c2.rotation.set(0.2, Math.PI / 2, 0.3); g.add(c2)
  return g
}
/** M.E.G. 档案员相机（底面中心为原点、镜头朝 +Z）：老式黑色单反 + 闪光灯 + 断掉的背带 + M.E.G. 资产标签 */
export function buildArchivistCamera(): THREE.Group {
  const g = new THREE.Group(); g.name = 'chefMegCamera'
  const black = litMaterial({ color: '#141414', roughness: 0.55 }), metal = litMaterial({ color: '#8d8f90', roughness: 0.3, metalness: 0.85 }), glass = litMaterial({ color: '#0d1a22', roughness: 0.05 })
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.09, 0.07), black); body.position.y = 0.045; body.castShadow = true; g.add(body)
  const top = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.006, 0.07), metal); top.position.y = 0.093; g.add(top)
  const prism = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.035, 0.03, 4), black); prism.rotation.y = Math.PI / 4; prism.position.set(0, 0.11, 0.0); g.add(prism)
  const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.032, 0.07, 24), black); lens.rotation.x = Math.PI / 2; lens.position.set(0, 0.045, 0.07); g.add(lens)
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.031, 0.003, 6, 24), metal); ring.position.set(0, 0.045, 0.105); g.add(ring)
  const gl = new THREE.Mesh(new THREE.CircleGeometry(0.026, 24), glass); gl.position.set(0, 0.045, 0.104); g.add(gl)
  // 镜片裂纹（白细线贴图）
  const crk = document.createElement('canvas'); crk.width = crk.height = 128; const cg = crk.getContext('2d')!; cg.strokeStyle = 'rgba(230,240,245,0.85)'; cg.lineWidth = 1.5; seed = 851
  for (let k = 0; k < 6; k++) { cg.beginPath(); cg.moveTo(64, 64); let x = 64, y = 64; const a = rnd() * 6.28; for (let j = 0; j < 5; j++) { x += Math.cos(a + (rnd() - 0.5)) * 14; y += Math.sin(a + (rnd() - 0.5)) * 14; cg.lineTo(x, y) } cg.stroke() }
  const ct = new THREE.CanvasTexture(crk); ct.colorSpace = THREE.SRGBColorSpace
  const crack = new THREE.Mesh(new THREE.CircleGeometry(0.026, 24), litMaterial({ color: '#ffffff', map: ct, transparent: true } as THREE.MeshLambertMaterialParameters)); crack.position.set(0, 0.045, 0.1045); g.add(crack)
  const flash = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.035, 0.035), black); flash.position.set(0.035, 0.13, 0.0); g.add(flash)
  const flashW = new THREE.Mesh(new THREE.PlaneGeometry(0.05, 0.026), litMaterial({ color: '#f2f0e6', emissive: '#4a4840', roughness: 0.3 })); flashW.position.set(0.035, 0.13, 0.0178); g.add(flashW)
  // M.E.G. 资产标签（侧面贴纸）
  const lb = document.createElement('canvas'); lb.width = 256; lb.height = 96; const lgc = lb.getContext('2d')!
  lgc.fillStyle = '#d9d2bd'; lgc.fillRect(0, 0, 256, 96); lgc.fillStyle = '#1b2a4a'; lgc.font = 'bold 34px sans-serif'; lgc.fillText('M.E.G.', 12, 40); lgc.font = '20px monospace'; lgc.fillText('ARCHIVIST · A-12', 12, 72)
  const lt = new THREE.CanvasTexture(lb); lt.colorSpace = THREE.SRGBColorSpace
  const label = new THREE.Mesh(new THREE.PlaneGeometry(0.05, 0.019), litMaterial({ color: '#ffffff', map: lt } as THREE.MeshLambertMaterialParameters)); label.position.set(0.0701, 0.045, 0); label.rotation.y = Math.PI / 2; g.add(label)
  // 断背带
  const strap = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.002, 0.16), litMaterial({ color: '#1e1a16', roughness: 0.8 })); strap.position.set(-0.075, 0.03, -0.07); strap.rotation.set(0.3, 0.5, 1.2); g.add(strap)
  { const bl = bloodLayer(new THREE.PlaneGeometry(0.14, 0.09), bloodTexture(256, 160, 2, 10, 852)); bl.position.set(0, 0.045, 0.0352); g.add(bl) }
  return g
}
/** 档案员胸麦（原点 = 夹子背面，+Z 朝外）：小黑麦头 + 夹子 + 卷线 + 小红灯（坏了不亮） */
export function buildChestMic(): THREE.Group {
  const g = new THREE.Group(); g.name = 'chefMegMic'
  const black = litMaterial({ color: '#121212', roughness: 0.5 }), metal = litMaterial({ color: '#9a9c9d', roughness: 0.3, metalness: 0.85 })
  const clip = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.03, 0.006), metal); clip.position.set(0, 0, 0.003); g.add(clip)
  const head = new THREE.Mesh(new THREE.CapsuleGeometry(0.0065, 0.014, 4, 12), black); head.position.set(0, 0.012, 0.012); g.add(head)
  const grille = new THREE.Mesh(new THREE.SphereGeometry(0.0066, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), litMaterial({ color: '#2a2a2a', roughness: 0.7 })); grille.position.set(0, 0.0195, 0.012); g.add(grille)
  const led = new THREE.Mesh(new THREE.SphereGeometry(0.0016, 8, 6), litMaterial({ color: '#3a0606', roughness: 0.3 })); led.position.set(0.0055, 0.006, 0.016); g.add(led)
  const pts: THREE.Vector3[] = []; for (let k = 0; k <= 30; k++) { const t = k / 30; pts.push(new THREE.Vector3(0.006 * Math.sin(t * 40), -0.004 - t * 0.12, 0.004 + 0.006 * Math.cos(t * 40))) }
  const cord = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 60, 0.0016, 6, false), black); g.add(cord)
  return g
}
