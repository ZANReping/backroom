// 原型预览页：L8 蛛形纲重制。可加 &cam=x,y,z&look=x,y,z 覆盖机位。
// 第 1 阶段静态视图：?mode=lineup1|lineup2|lineup3|colossus|widow|jumper|rear|nest|one|fixes
// 第 2 阶段动画采样：?anim=<片段>&v=<变种>[&t=<秒>]——给 t 时整窗渲染这一帧；不给 t 时按 frames=N（默认 8）把整段画成网格，
//   每帧 dataURL 放进 window.__frames（拼 GIF 用），脚底诊断放进 window.__anim。
//   其它参数：view=three|side|front|top|back、cw/ch 单帧尺寸、cols 列数、dur 采样时长、travel=1 让实体按步态速度前进（检查脚底锁定）、
//   seed、zoom、gif=1（帧上不画文字）。
import * as THREE from 'three'
import { buildArachnidMesh, buildRuneNest, buildHumanCocoon, poseArachnid, arachnidStats, ARACHNID_VARIANTS } from '../game/renderer/arachnidMesh'
import type { ArachnidVariant, ArachnidRig } from '../game/renderer/arachnidMesh'
import { ARACHNID_CLIPS, ARACHNID_ROOT_MOTION, ARACHNID_SPRAY_PUFFS, arachnidContacts, arachnidEmitter, arachnidGaitSpeed, poseArachnidClip, updateArachnidSwarm, breatheRuneNest, type ArachnidClip } from '../game/renderer/arachnidAnim'
const q = new URLSearchParams(location.search)
const mode = q.has('anim') ? 'anim' : q.get('mode') ?? 'lineup1'
const W = innerWidth, H = innerHeight
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true }); renderer.setSize(W, H); renderer.outputColorSpace = THREE.SRGBColorSpace
document.body.appendChild(renderer.domElement)
// L8 洞穴：冷灰岩地、偏暗的冷光（预览时适当提亮以看清造型）
const scene = new THREE.Scene(); scene.background = new THREE.Color('#1d1c1a'); scene.fog = new THREE.Fog(scene.background as THREE.Color, 12, 34)
const rockTex = (() => {
  const cv = document.createElement('canvas'); cv.width = cv.height = 256; const c = cv.getContext('2d')!
  c.fillStyle = '#8a8378'; c.fillRect(0, 0, 256, 256)
  let s = 7; const R = () => ((s = (s * 16807) % 2147483647) / 2147483647)
  // 可平铺：每个斑块在 3×3 位置各画一次
  for (let i = 0; i < 500; i++) {
    const g = 100 + R() * 70, x = R() * 256, y = R() * 256, rx = 2 + R() * 14, ry = 2 + R() * 8, a = R() * 3
    for (const ox of [-256, 0, 256]) for (const oy of [-256, 0, 256]) { c.fillStyle = `rgba(${g},${g * 0.96},${g * 0.9},0.35)`; c.beginPath(); c.ellipse(x + ox, y + oy, rx, ry, a, 0, 7); c.fill() }
  }
  const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(14, 14); t.colorSpace = THREE.SRGBColorSpace; return t
})()
const fl = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.MeshLambertMaterial({ color: '#b0a898', map: rockTex })); fl.rotation.x = -Math.PI / 2; scene.add(fl)
scene.add(new THREE.HemisphereLight('#e6e4dc', '#2a2620', 0.85)); const sun = new THREE.DirectionalLight('#f4efe2', 1.3); sun.position.set(2.5, 5, 4); scene.add(sun)
const fillL = new THREE.DirectionalLight('#c8d0e0', 0.35); fillL.position.set(-4, 2, 3); scene.add(fillL)
const cam = new THREE.PerspectiveCamera(30, W / H, 0.02, 80)
const lab = document.getElementById('lab')!, stat = document.getElementById('stat')!, ttl = document.getElementById('ttl')!
const vec = (s: string | null) => s ? new THREE.Vector3(...s.split(',').map(Number) as [number, number, number]) : null
const info: Record<string, unknown> = {}
const nameOf = (v: ArachnidVariant) => ARACHNID_VARIANTS.find((a) => a.id === v)!
type Item = { v: ArachnidVariant; label?: string; sub?: string; seed?: number; pose?: Parameters<typeof poseArachnid>[1]; mother?: boolean; ry?: number; back?: THREE.Vector3 }
const labels: { p: THREE.Vector3; html: string }[] = []
const statRows: string[] = []
function makeItem(it: Item) {
  const g = it.v === 'runenest' ? buildRuneNest(it.seed ?? 0) : buildArachnidMesh(it.v, it.seed ?? 0, { mother: it.mother })
  if (it.pose) poseArachnid(g, it.pose)
  return g
}
/** 一排并列：按各自包围盒宽度依次排开，镜头自动框住 */
function lineup(items: Item[], gap = 0.35, camH = 0.38, camBack = 0.92, lookUp = 0) {
  let x = 0
  const placed: { g: THREE.Object3D; box: THREE.Box3; it: Item }[] = []
  for (const it of items) {
    const g = makeItem(it)
    g.rotation.y = it.ry ?? -0.9
    if (it.v === 'runenest') g.rotation.y = -Math.PI / 4
    scene.add(g); g.updateMatrixWorld(true)
    if (it.back) { g.position.copy(it.back); g.updateMatrixWorld(true); placed.push({ g, box: new THREE.Box3().setFromObject(g), it }); if (it.v === 'runenest') addCorner(g); continue }
    const b = new THREE.Box3().setFromObject(g)
    g.position.x = x - b.min.x; x += b.max.x - b.min.x + gap
    g.position.z = -(b.min.z + b.max.z) / 2
    g.updateMatrixWorld(true)
    placed.push({ g, box: new THREE.Box3().setFromObject(g), it })
    if (it.v === 'runenest') addCorner(g)
  }
  const total = x - gap, cx = total / 2
  for (const p of placed) if (!p.it.back) p.g.position.x -= cx
  const maxH = Math.max(...placed.filter((p) => !p.it.back).map((p) => p.box.max.y))
  const hf = 2 * Math.atan(Math.tan((cam.fov * Math.PI) / 360) * cam.aspect)
  const dist = (total / 2) / Math.tan(hf / 2) * camBack + 0.6
  cam.position.set(0, Math.max(maxH * 0.9, dist * camH), dist); cam.lookAt(0, maxH * 0.32 + lookUp, 0)
  cam.updateMatrixWorld()
  for (const p of placed) {
    p.g.updateMatrixWorld(true)
    const b = new THREE.Box3().setFromObject(p.g)
    const meta = p.it.v === 'runenest' ? nameOf('runenest') : nameOf(p.it.v)
    const st = arachnidStats(p.g)
    labels.push({ p: p.it.back ? V3(b.max.x - 0.25, 0.05, (b.min.z + b.max.z) / 2 + 0.6) : V3((b.min.x + b.max.x) / 2, 0, b.max.z), html: `${p.it.label ?? meta.name}<br><span class="s">${p.it.sub ?? '体长约 ' + meta.length + ' m'}</span>` })
    statRows.push(`${p.it.label ?? meta.name}：${st.meshes} 网格 · ${st.tris.toLocaleString()} 三角${st.instances ? `（实例 ${st.instances}）` : ''}`)
    info[p.it.label ?? meta.name] = st
  }
}
const V3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z)
function addCorner(nest: THREE.Object3D) {
  // 洞角两面岩壁（巢的局部坐标里 x=0 与 z=0）
  const m = new THREE.MeshLambertMaterial({ color: '#7d766b', map: rockTex.clone() })
  ;(m.map as THREE.Texture).repeat.set(2, 2); (m.map as THREE.Texture).needsUpdate = true
  const a = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 2.4), m); a.rotation.y = Math.PI / 2; a.position.set(0, 1.2, 1.3); nest.add(a)
  const b = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 2.4), m); b.position.set(1.3, 1.2, 0); nest.add(b)
}
function single(it: Item, camPos: THREE.Vector3, look: THREE.Vector3, ry = 0) {
  const g = makeItem(it); g.rotation.y = ry; scene.add(g)
  cam.position.copy(camPos); cam.lookAt(look)
  const st = arachnidStats(g); info[it.label ?? it.v] = st
  statRows.push(`${it.label ?? nameOf(it.v).name}：${st.meshes} 网格 · ${st.tris.toLocaleString()} 三角`)
  return g
}
if (mode === 'lineup1') {
  ttl.textContent = '蜘蛛 7 种'
  lineup([{ v: 'wolf' }, { v: 'weaver' }, { v: 'jumper' }, { v: 'blindcave' }, { v: 'broodswarm', mother: true, sub: '幼蛛 4–6cm · 附母蛛' }, { v: 'harvestman', sub: '身体约 0.15 m · 腿跨约 1.6 m' }, { v: 'diving' }], 0.3)
} else if (mode === 'lineup2') {
  ttl.textContent = '符文强化 6 种'
  lineup([{ v: 'colossus', sub: '体长约 2.2 m · 腿跨 4 m+' }, { v: 'widow' }, { v: 'regen' }, { v: 'undying' }, { v: 'fireproof' }, { v: 'anoxic' }], 0.3)
} else if (mode === 'lineup3') {
  ttl.textContent = '蝎 · 蜱 · 螨 · 符文蛛巢'
  lineup([{ v: 'cavescorpion' }, { v: 'whipscorpion' }, { v: 'tick', label: '吸附蜱（未吸血）', sub: '体长约 0.25 m' }, { v: 'tick', label: '吸附蜱（吸饱）', sub: '体长约 0.45 m', pose: { engorge: 1 } }, { v: 'mitecloud', sub: '单只 3–8mm · 整团约 1 m' }, { v: 'runenest', sub: '洞角约 2.2 m（后排）', back: V3(0, 0, -2.6) }], 0.3, 0.3, 0.95, 0.55)
} else if (mode === 'colossus') {
  ttl.textContent = '极巨蛛 与 1.75m 人类参照'
  single({ v: 'colossus' }, V3(5.2, 2.6, 5.4), V3(0.2, 0.8, 0), -0.5)
  const pil = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 1.75, 20), new THREE.MeshLambertMaterial({ color: '#8e8e8e' })); pil.position.set(2.3, 0.875, -0.6); scene.add(pil)
  labels.push({ p: V3(2.3, 1.95, -0.6), html: '人类 1.75 m' })
} else if (mode === 'widow') {
  ttl.textContent = '寡妇毒蛛 正面'
  single({ v: 'widow' }, V3(1.25, 0.26, 0.42), V3(0, 0.14, 0))
} else if (mode === 'jumper') {
  ttl.textContent = '跳蛛 正面（前中眼）'
  single({ v: 'jumper' }, V3(0.62, 0.15, 0.2), V3(0.04, 0.08, 0))
} else if (mode === 'rear') {
  ttl.textContent = '姿态示例：rear 威吓 / strike 前刺 / curl 缩团'
  lineup([
    { v: 'wolf', label: '狼蛛 rear=1', sub: '前腿高举、螯肢张开', pose: { rear: 1 }, ry: -1.1 },
    { v: 'widow', label: '寡妇毒蛛 rear=1', sub: '露出腹下红沙漏', pose: { rear: 1 }, ry: -0.6 },
    { v: 'cavescorpion', label: '洞蝎 strike=1', sub: '尾刺前刺、螯前伸', pose: { strike: 1 }, ry: -0.6 },
    { v: 'whipscorpion', label: '鞭蝎 rear=1', sub: '举螯、扬尾须', pose: { rear: 1 }, ry: -0.6 },
    { v: 'weaver', label: '织网蛛 curl=1', sub: '收腿缩团 / 死亡', pose: { curl: 1 }, ry: -0.9 },
  ], 0.3, 0.32)
} else if (mode === 'one') {
  // 调试：单只（?mode=one&v=tick&engorge=1）
  const v = (q.get('v') ?? 'wolf') as ArachnidVariant
  const g = single({ v, pose: { engorge: Number(q.get('engorge') ?? 0), rear: Number(q.get('rear') ?? 0), curl: Number(q.get('curl') ?? 0), strike: Number(q.get('strike') ?? 0) } }, V3(1.2, 0.6, 1.2), V3(0, 0.1, 0), -0.6)
  const b = new THREE.Box3().setFromObject(g), sz = b.getSize(new THREE.Vector3()).length()
  cam.position.set(sz * 1.1, sz * 0.55, sz * 1.1); cam.lookAt(b.getCenter(new THREE.Vector3()))
} else if (mode === 'fixes') {
  // 阶段 2 修正对比：sub=cocoon|widow|colossus|seeds
  const sub = q.get('sub') ?? 'seeds'
  stat.style.display = 'none'
  if (sub === 'cocoon') {
    // 单独的人形茧：正面 / 侧面 / 斜放（与巢里同角度）
    ttl.textContent = '人形茧（修正后）：正面 · 侧面 · 巢中姿态'
    const a = buildHumanCocoon(0); a.position.set(-0.9, 0, 0); a.rotation.y = 0.25; scene.add(a)
    const b = buildHumanCocoon(0); b.rotation.y = Math.PI / 2 + 0.2; b.position.set(-0.1, 0, 0); scene.add(b)
    const c = buildHumanCocoon(0); c.geometry.translate(0, -0.81, 0); c.rotation.set(0, 0, -1.25); c.position.set(1.05, 0.3, 0.1); scene.add(c)
    cam.position.set(0.1, 1.2, 4.6); cam.lookAt(0.1, 0.72, 0)
  } else if (sub === 'nestCocoon') {
    ttl.textContent = '人形茧在符文蛛巢中'
    const n = single({ v: 'runenest' }, V3(0, 1.7, 5.6), V3(0, 0.85, 0.4), -Math.PI / 4); addCorner(n)
    cam.position.set(1.1, 1.25, 3.4); cam.lookAt(0, 0.55, 1.2)
  } else if (sub === 'widow') {
    ttl.textContent = '寡妇毒蛛 正面（修正后）'
    single({ v: 'widow' }, V3(1.25, 0.26, 0.42), V3(0, 0.14, 0))
  } else if (sub === 'widow34') {
    ttl.textContent = '寡妇毒蛛 常规俯侧视角'
    single({ v: 'widow' }, V3(-0.7, 0.55, 0.95), V3(-0.05, 0.12, 0), 0)
  } else if (sub === 'colossus') {
    ttl.textContent = '极巨蛛（修正后）'
    single({ v: 'colossus' }, V3(5.2, 2.6, 5.4), V3(0.2, 0.8, 0), -0.5)
  } else {
    ttl.textContent = '同种不同 seed：狼蛛 / 织网蛛 / 极巨蛛 各 seed 0–3'
    const items: Item[] = []
    for (const v of ['wolf', 'weaver'] as ArachnidVariant[]) for (let sd = 0; sd < 4; sd++) items.push({ v, seed: sd, label: `${nameOf(v).name} #${sd}`, sub: ' ', ry: -0.75 })
    lineup(items, 0.1, 0.4, 0.84)
  }
} else if (mode === 'colossusSeeds') {
  ttl.textContent = '极巨蛛 seed 0–2'
  lineup([0, 1, 2].map((sd) => ({ v: 'colossus' as ArachnidVariant, seed: sd, label: `极巨蛛 #${sd}`, sub: ' ', ry: -0.75 })), 0.2, 0.4, 0.9)
} else if (mode === 'anim') {
  runAnim()
} else if (mode === 'nest') {
  ttl.textContent = '符文蛛巢'
  const n = single({ v: 'runenest' }, V3(0, 1.7, 5.6), V3(0, 0.85, 0.4), -Math.PI / 4)
  addCorner(n)
}
cam.updateMatrixWorld()
for (const l of labels) {
  const p = l.p.clone().project(cam)
  lab.insertAdjacentHTML('beforeend', `<div class="l" style="left:${(p.x * 0.5 + 0.5) * W}px;top:${(0.5 - p.y * 0.5) * H + 8}px">${l.html}</div>`)
}
stat.innerHTML = statRows.join('<br>')
if (mode !== 'anim') renderer.render(scene, cam)
// 着色器编译检查：任何程序 link 失败都会记在 __shaderErr
const gl = renderer.getContext(); let shaderErr = 0
for (const p of (renderer.info.programs ?? []) as unknown as { program: WebGLProgram }[]) if (!gl.getProgramParameter(p.program, gl.LINK_STATUS)) shaderErr++
;(window as unknown as Record<string, unknown>).__info = { ...info, shaderErr, programs: renderer.info.programs?.length, lost: gl.isContextLost(), cam: cam.position.toArray() }
;(window as unknown as Record<string, unknown>).__ready = true
const c = vec(q.get('cam')), l = vec(q.get('look')); if (c) { cam.position.copy(c); if (l) cam.lookAt(l); cam.updateMatrixWorld(); renderer.render(scene, cam) }

// ======================================================================
// 第 2 阶段：动画采样模式
// ======================================================================
function runAnim() {
  const v = (q.get('v') ?? 'wolf') as Exclude<ArachnidVariant, 'runenest'>
  const clip = (q.get('anim') ?? 'walk') as ArachnidClip
  const info = ARACHNID_CLIPS[v]?.[clip] ?? { len: 1, loop: true, desc: '' }
  const tOne = q.get('t'), frames = tOne !== null ? 1 : +(q.get('frames') ?? 8)
  const dur = +(q.get('dur') ?? info.len), view = q.get('view') ?? 'three', gifMode = q.get('gif') === '1'
  const seed = +(q.get('seed') ?? 0)
  const CW = tOne !== null ? W : +(q.get('cw') ?? 400), CH = tOne !== null ? H : +(q.get('ch') ?? 330)
  const cols = Math.min(frames, +(q.get('cols') ?? 4)), rows = Math.ceil(frames / cols)
  const g = buildArachnidMesh(v, seed, { mother: q.get('mother') === '1' }); scene.add(g)
  const rig = g.userData.arachnidRig as ArachnidRig
  const swarm = rig.kind === 'swarm'
  // 行进：walk/run 按步态速度前进（脚底锁定验证）；swarm_flow 群中心按流速前进
  const speed = swarm ? 0.2 : clip === 'walk' || clip === 'run' ? arachnidGaitSpeed(g, clip) : 0
  const travel = q.get('travel') === '1' || swarm
  const rootDx = ARACHNID_ROOT_MOTION[clip]?.dx ?? 0
  const span = travel ? speed * dur : rootDx
  // 机位：按静止包围盒取景，行进 / 跳跃时把中心放到路程中点
  const box = new THREE.Box3().setFromObject(g), size = box.getSize(new THREE.Vector3()), ctr = box.getCenter(new THREE.Vector3())
  const varZoom: Partial<Record<string, number>> = { harvestman: 0.62, broodswarm: 0.42, mitecloud: 0.22, whipscorpion: 0.72 }
  if (v === 'tick' && clip === 'feed') varZoom.tick = 2.3
  if (v === 'colossus' && clip === 'rear') varZoom.colossus = 1.25
  const clipZoom: Partial<Record<string, number>> = { death: 1.3, revive: 1.2, rear: 1.3, lunge: 1.1, swim: 1.1, dive: 1.15, flail: 1.1, spray: 1.25, web_spin: 1.1, jump: 1.0 }
  const S = Math.max(size.x, size.z * 0.8, size.y * 1.4, 0.08) * +(q.get('zoom') ?? 1) * (clipZoom[clip] ?? 1) * (varZoom[v] ?? 1) + span * 0.85
  // 行进时实体从 -span/2 走到 +span/2（中心不动）；跳跃时机位中心放在起落点中间
  const C0 = new THREE.Vector3(ctr.x + (travel ? 0 : rootDx / 2), Math.max(size.y * 0.4, 0.02), ctr.z)
  const startX = travel ? -span / 2 : 0
  const dirs: Record<string, [number, number, number]> = { side: [0.02, 0.22, 1], front: [1, 0.3, 0.12], three: [0.8, 0.55, 0.9], top: [0.001, 1, 0.0001], back: [-0.8, 0.45, 0.7], low: [0.7, 0.25, 0.9] }
  const d = new THREE.Vector3(...(dirs[view] ?? dirs.three)).normalize()
  cam.aspect = CW / CH; cam.fov = 30; cam.near = Math.max(0.005, S * 0.02); cam.updateProjectionMatrix()
  const look = C0.clone(); if (clip === 'jump') look.y += 0.08
  if (clip === 'death' || clip === 'revive') look.y = Math.max(0.02, size.y * 0.45)
  if (clip === 'swim' || clip === 'dive') look.y = rig.hy * (clip === 'dive' ? 2.3 : 1.8)
  cam.position.copy(look).addScaledVector(d, S * 2.15); if (view === 'top') cam.up.set(1, 0, 0); cam.lookAt(look); cam.updateMatrixWorld()
  // 地面网格（脚底锁定看得出）：格距约四分之一平均腿长
  const cell = Math.max(0.01, Math.min(0.8, S / 6))
  const grid = new THREE.GridHelper(cell * 40, 40, '#77716a', '#77716a'); grid.position.y = 0.0015
  ;(grid.material as THREE.LineBasicMaterial).transparent = true; (grid.material as THREE.LineBasicMaterial).opacity = 0.45; scene.add(grid)
  // 水：游泳 / 下潜 / 落水挣扎
  const water = clip === 'swim' || clip === 'dive' || clip === 'flail'
  if (water) {
    const wy = clip === 'flail' ? rig.hy * 1.35 : rig.hy * 2.6
    const wm = new THREE.Mesh(new THREE.PlaneGeometry(S * 8, S * 8), new THREE.MeshPhongMaterial({ color: '#3d6d86', transparent: true, opacity: 0.38, depthWrite: false, shininess: 90, specular: '#9fc8de', side: THREE.DoubleSide }))
    wm.rotation.x = -Math.PI / 2; wm.position.y = wy; wm.renderOrder = 5; scene.add(wm)
    scene.fog = new THREE.Fog('#24343c', S * 2, S * 6)
  }
  // 喷酸雾小精灵
  const sprTex = (() => { const cv = document.createElement('canvas'); cv.width = cv.height = 64; const c = cv.getContext('2d')!; const gr = c.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(230,255,140,0.95)'); gr.addColorStop(0.5, 'rgba(190,230,80,0.45)'); gr.addColorStop(1, 'rgba(160,210,60,0)'); c.fillStyle = gr; c.fillRect(0, 0, 64, 64); const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t })()
  const sprites: THREE.Sprite[] = []
  if (clip === 'spray') for (let i = 0; i < ARACHNID_SPRAY_PUFFS.length * 16; i++) { const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: sprTex, transparent: true, depthWrite: false })); sp.visible = false; scene.add(sp); sprites.push(sp) }
  // 吐丝：吐丝器到地面锚点的两根丝
  const silkGeo = new THREE.BufferGeometry(); silkGeo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(12), 3))
  const silk = new THREE.LineSegments(silkGeo, new THREE.LineBasicMaterial({ color: '#f0ece0', transparent: true, opacity: 0.85 }))
  if (clip === 'web_spin') scene.add(silk)
  const nest = q.get('nest') === '1' ? buildRuneNest(0) : null
  if (nest) { nest.position.set(-1.4, 0, -1.4); scene.add(nest) }
  const setT = (t: number) => {
    const x = startX + (travel ? speed * t : 0)
    if (swarm) { g.position.x = 0; updateArachnidSwarm(g, new THREE.Vector3(x, 0, 0), 0, t, { speed }) }
    else { g.position.x = x; poseArachnidClip(g, clip, t, { seed, speed: travel ? speed : undefined }) }
    if (nest) breatheRuneNest(nest, t)
    g.updateMatrixWorld(true)
    if (clip === 'spray') {
      const em = arachnidEmitter(g, 'spray')!
      em.pos.add(g.position)
      let k = 0
      ARACHNID_SPRAY_PUFFS.forEach((p0, pi) => {
        for (let i = 0; i < 16; i++, k++) {
          const sp = sprites[k], age = t - p0 - i * 0.008
          if (age <= 0 || age > 0.75) { sp.visible = false; continue }
          const h = (n: number) => Math.sin(n * 91.7 + pi * 13 + i * 7.3) * 0.5
          const dir = em.dir.clone().add(new THREE.Vector3(h(1) * 0.5, h(2) * 0.4, h(3) * 0.6)).normalize()
          sp.position.copy(em.pos).addScaledVector(dir, 0.55 * age * (0.7 + h(4))).add(new THREE.Vector3(0, -0.12 * age * age, 0))
          const sz = 0.03 + 0.2 * age; sp.scale.set(sz, sz, sz); sp.visible = true
          sp.material.opacity = 0.95 * (1 - age / 0.75)
        }
      })
    }
    if (clip === 'web_spin') {
      const em = arachnidEmitter(g, 'spinner')!; em.pos.add(g.position)
      const a = silkGeo.attributes.position as THREE.BufferAttribute
      const b = rig.hy
      a.setXYZ(0, em.pos.x, em.pos.y, em.pos.z); a.setXYZ(1, -b * 3.2, 0.002, b * 0.6)
      a.setXYZ(2, em.pos.x, em.pos.y, em.pos.z); a.setXYZ(3, -b * 2.6, 0.002, -b * 1.4); a.needsUpdate = true
    }
  }
  // ---------- 诊断：60 个子采样上的脚底滑移 / 浮空 / 入地，身体最低点 ----------
  const bodyMeshes: THREE.Mesh[] = []
  if (!swarm) {
    const skip = new Set<THREE.Object3D>([...rig.legs.flat(), ...rig.tail, ...rig.chelicerae, ...rig.pedipalps])
    const walk = (o: THREE.Object3D) => { for (const ch of o.children) { if (skip.has(ch)) continue; const m = ch as THREE.Mesh; if (m.isMesh && !m.userData.rune && !(m as THREE.InstancedMesh).isInstancedMesh) bodyMeshes.push(m); else walk(ch) } }
    walk(rig.body.ceph)
  }
  const dg = { maxSlip: 0, plantedYmin: 1e9, plantedYmax: -1e9, footMinY: 1e9, footMinT: 0, kneeMinY: 1e9, kneeMinT: 0, bodyMinY: 1e9, bodyMinT: 0, ikErrMax: 0, samples: 0 }
  if (!swarm) {
    const N = 60
    let prev: (THREE.Vector3 | null)[] | null = null, prevPl: boolean[] = []
    for (let i = 0; i <= N; i++) {
      const t = (i / N) * dur
      setT(t)
      const pose = poseArachnidClip(g, clip, t, { seed, speed: travel ? speed : undefined })
      g.updateMatrixWorld(true)
      const ct = arachnidContacts(g)
      const feet = ct.feet.map((f) => (f ? f.add(g.position) : null))
      feet.forEach((f, n) => {
        if (!f) return
        if (f.y < dg.footMinY) { dg.footMinY = f.y; dg.footMinT = t }
        if (pose.diag.planted[n]) {
          dg.plantedYmin = Math.min(dg.plantedYmin, f.y); dg.plantedYmax = Math.max(dg.plantedYmax, f.y)
          if (prev && prevPl[n] && prev[n]) dg.maxSlip = Math.max(dg.maxSlip, Math.hypot(f.x - prev[n]!.x, f.z - prev[n]!.z))
        }
      })
      dg.ikErrMax = Math.max(dg.ikErrMax, ...pose.diag.ikErr.map((e, n) => (pose.diag.planted[n] ? e : 0)), 0)
      const bb = new THREE.Box3(); for (const m of bodyMeshes) bb.expandByObject(m, true)
      if (!bb.isEmpty() && bb.min.y < dg.bodyMinY) { dg.bodyMinY = bb.min.y; dg.bodyMinT = t }
      for (const lg of rig.legs) { if ((lg[0].userData.leg as { stump?: boolean } | undefined)?.stump) continue; const k = new THREE.Vector3().setFromMatrixPosition(lg[2].matrixWorld); if (k.y < dg.kneeMinY) { dg.kneeMinY = k.y; dg.kneeMinT = t } }
      prev = feet; prevPl = pose.diag.planted; dg.samples++
    }
  }
  // ---------- 出帧 ----------
  const urls: string[] = []
  if (tOne !== null) {
    setT(+tOne); renderer.render(scene, cam)
    ttl.textContent = `${nameOf(v).name} · ${clip} t=${(+tOne).toFixed(2)}s`
  } else {
    renderer.setSize(CW, CH)
    renderer.domElement.style.display = 'none'
    const out = document.createElement('canvas'); out.width = cols * CW; out.height = rows * CH + (gifMode ? 0 : 30)
    const ctx = out.getContext('2d')!; ctx.fillStyle = '#111'; ctx.fillRect(0, 0, out.width, out.height)
    document.body.appendChild(out); out.style.display = 'block'
    const top = gifMode ? 0 : 30
    for (let i = 0; i < frames; i++) {
      const t = info.loop || clip === 'swarm_flow' ? (i / frames) * dur : (i / Math.max(1, frames - 1)) * dur
      setT(t)
      renderer.render(scene, cam)
      ctx.drawImage(renderer.domElement, (i % cols) * CW, top + Math.floor(i / cols) * CH)
      if (!gifMode) { ctx.fillStyle = '#ddd6c2'; ctx.font = '13px sans-serif'; ctx.fillText(`t=${t.toFixed(2)}s`, (i % cols) * CW + 8, top + Math.floor(i / cols) * CH + 18) }
      urls.push(renderer.domElement.toDataURL('image/png'))
    }
    if (!gifMode) {
      ctx.fillStyle = '#f3eedf'; ctx.font = 'bold 15px sans-serif'
      const f = (x: number) => (Math.abs(x) > 1e8 ? '-' : (x * 1000).toFixed(1) + 'mm')
      ctx.fillText(`${nameOf(v).name} · ${clip}（${info.loop ? '循环' : '单次'} ${info.len}s）${info.desc ?? ''}  脚滑移≤${f(dg.maxSlip)} 着地脚 y∈[${f(dg.plantedYmin)},${f(dg.plantedYmax)}] 脚最低 ${f(dg.footMinY)} 身体最低 ${f(dg.bodyMinY)}${travel ? ` 速度 ${speed.toFixed(2)}m/s` : ''}`, 10, 20)
    }
    lab.style.display = 'none'; stat.style.display = 'none'; ttl.style.display = 'none'
  }
  const w = window as unknown as Record<string, unknown>
  w.__frames = urls; w.__anim = { ...dg, speed, clip, v, len: info.len, loop: info.loop }
}
