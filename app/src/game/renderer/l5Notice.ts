// L5 恐怖旅馆 1c：住客须知卡（黄铜框贴墙卡 / 桌上立卡）与口袋房间门（野兽办公室木门 / 「大堂」门）的模型。
// 卡面文字就是该位置那张卡的真实内容（ruleCardAt 纯函数），假卡的破绽（「旅舘」/ 四位数房号）在模型上也看得出。
import * as THREE from 'three'
import { box, makeCanvasCtx, toTex, litMaterial } from './shared'
import { L5_RULE, HOTEL_NAME, HOTEL_NAME_FAKE, type L5RuleCard } from '../content/l5Rules'

const TEX = new Map<string, THREE.CanvasTexture>()
function wrap(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const out: string[] = []
  let line = ''
  for (const ch of text) {
    if (ctx.measureText(line + ch).width > maxW && line) { out.push(line); line = ch } else line += ch
  }
  if (line) out.push(line)
  return out
}
/** 卡面贴图（256×352）：象牙底、双线装饰框、抬头店名、条号、正文、小字、页脚房号 */
export function noticeTexture(card: L5RuleCard): THREE.CanvasTexture {
  const key = `${card.rule}|${card.tellName ? 1 : 0}|${card.room}`
  // 不缓存：chunk 卸载会连同材质贴图一起 dispose，缓存的贴图再用就是黑的
  void TEX
  const W = 256, H = 352
  const [c, ctx] = makeCanvasCtx(W, H)
  ctx.fillStyle = '#efe4c8'; ctx.fillRect(0, 0, W, H)
  // 纸面做旧
  for (let i = 0; i < 260; i++) { ctx.fillStyle = `rgba(120,90,40,${Math.random() * 0.05})`; ctx.fillRect(Math.random() * W, Math.random() * H, 2 + Math.random() * 6, 1 + Math.random() * 3) }
  ctx.strokeStyle = '#7a5a26'; ctx.lineWidth = 3; ctx.strokeRect(10, 10, W - 20, H - 20)
  ctx.lineWidth = 1; ctx.strokeRect(17, 17, W - 34, H - 34)
  // 角花（装饰艺术三角）
  ctx.fillStyle = '#7a5a26'
  for (const [x, y, sx, sy] of [[17, 17, 1, 1], [W - 17, 17, -1, 1], [17, H - 17, 1, -1], [W - 17, H - 17, -1, -1]] as const) {
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 18 * sx, y); ctx.lineTo(x, y + 18 * sy); ctx.closePath(); ctx.fill()
  }
  const serif = "'Songti SC','SimSun','Noto Serif CJK SC',serif"
  ctx.textAlign = 'center'; ctx.fillStyle = '#5a1e1c'
  ctx.font = `bold 26px ${serif}`
  ctx.fillText(card.tellName ? HOTEL_NAME_FAKE : HOTEL_NAME, W / 2, 56)
  ctx.font = `14px ${serif}`; ctx.fillStyle = '#7a5a26'
  ctx.fillText('— 住 客 须 知 —', W / 2, 80)
  ctx.fillRect(48, 92, W - 96, 1)
  ctx.font = `13px ${serif}`; ctx.fillText(`第 ${card.no} 条`, W / 2, 118)
  const def = L5_RULE[card.rule]
  ctx.fillStyle = '#231a14'; ctx.font = `bold 21px ${serif}`
  let y = 156
  for (const ln of wrap(ctx, def.text, W - 64)) { ctx.fillText(ln, W / 2, y); y += 28 }
  ctx.fillStyle = '#4a3a2a'; ctx.font = `14px ${serif}`; y += 8
  for (const ln of wrap(ctx, def.sub, W - 70)) { ctx.fillText(ln, W / 2, y); y += 20 }
  ctx.fillStyle = '#7a5a26'; ctx.fillRect(48, H - 64, W - 96, 1)
  ctx.font = `13px ${serif}`
  ctx.fillText(`前台 敬启 · 客房 ${card.room}`, W / 2, H - 40)
  void key
  return toTex(c)
}

/** 贴墙卡（黄铜框，挂高 1.45 m）或桌上立卡（桌面 0.78 m，A 形立卡）；返回的组需由调用方 mountOnWall（贴墙卡） */
export function buildNotice(card: L5RuleCard, onTable: boolean): THREE.Group {
  const g = new THREE.Group()
  const mat = litMaterial({ color: '#ffffff', map: noticeTexture(card) })
  if (onTable) {
    const y0 = 0.78
    const card3 = new THREE.Group()
    const face = new THREE.Mesh(new THREE.PlaneGeometry(0.15, 0.206), mat)
    face.position.set(0, 0.103, 0.004); card3.add(face)
    card3.add(box(0.152, 0.208, 0.004, '#e6dabb', 0, 0.104, 0))
    card3.rotation.x = -0.22; card3.position.set(0, y0, 0.03)
    g.add(card3)
    const back = box(0.15, 0.2, 0.004, '#d8c9a2', 0, y0 + 0.1, -0.04); back.rotation.x = 0.22; g.add(back)
    g.rotation.y = Math.PI * 0.12
    return g
  }
  g.add(box(0.46, 0.6, 0.03, '#8a6a2a', 0, 1.45, 0)) // 黄铜外框
  g.add(box(0.42, 0.56, 0.034, '#c9a24a', 0, 1.45, 0))
  const face = new THREE.Mesh(new THREE.PlaneGeometry(0.38, 0.522), mat)
  face.position.set(0, 1.45, 0.019); g.add(face)
  g.add(box(0.06, 0.03, 0.03, '#e2bd62', 0, 1.78, 0.01)) // 顶部挂钩
  return g
}

/** 口袋房间门：beast=深胡桃木门（无门牌、门缝透暖光），lobby=奶油色门 + 金色门牌「大堂」 */
export function buildPocketDoor(kind: 'beast' | 'lobby'): THREE.Group {
  const d = new THREE.Group()
  const beast = kind === 'beast'
  d.add(box(1.06, 2.24, 0.07, beast ? '#1e120c' : '#6a4a2a', 0, 1.12, 0))
  d.add(box(0.9, 2.1, 0.05, beast ? '#3a2416' : '#e6dcc4', 0, 1.07, 0.035))
  for (const yy of [0.55, 1.52]) d.add(box(0.66, yy > 1 ? 0.82 : 0.6, 0.012, beast ? '#2a180e' : '#cbbd9c', 0, yy, 0.064))
  d.add(box(0.06, 0.06, 0.06, '#e2bd62', 0.34, 1.04, 0.09))
  if (beast) {
    const glowMat = new THREE.MeshBasicMaterial({ color: '#ffb35a', transparent: true, opacity: 0.85 })
    const slit = new THREE.Mesh(new THREE.PlaneGeometry(0.88, 0.02), glowMat)
    slit.position.set(0, 0.012, 0.07); d.add(slit)
  } else {
    const [c, ctx] = makeCanvasCtx(128, 48)
    ctx.fillStyle = '#c9a24a'; ctx.fillRect(0, 0, 128, 48)
    ctx.strokeStyle = '#7a5a26'; ctx.lineWidth = 3; ctx.strokeRect(3, 3, 122, 42)
    ctx.fillStyle = '#3a2410'; ctx.font = "bold 28px 'Songti SC','SimSun',serif"; ctx.textAlign = 'center'; ctx.fillText('大 堂', 64, 34)
    const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.28, 0.105), litMaterial({ color: '#ffffff', map: toTex(c) }))
    plate.position.set(0, 1.72, 0.066); d.add(plate)
  }
  return d
}

// ---- 闪烁浮出的木门：独立于 chunk 几何的场景对象（加门不触发整张图重建）----
let evDoor: THREE.Group | null = null
let evKey = ''
/** 每帧：engine.hotelEventDoor 有值就把木门放到对应墙面，没有就移走。世界 X=地图 x，Z=地图 y */
export function syncHotelEventDoor(scene: THREE.Scene, ed: { wx: number; wy: number; wall: number; pocket?: 'lobby' } | null, ox: number, oy: number) {
  if (!ed) { if (evDoor) { scene.remove(evDoor); evDoor = null; evKey = '' } return }
  const kind = ed.pocket === 'lobby' ? 'lobby' : 'beast' // [spokes] 迎宾海报的邀请：浮出的是「大堂」门
  if (evDoor && evDoor.userData.kind !== kind) { scene.remove(evDoor); evDoor = null; evKey = '' }
  if (!evDoor) { evDoor = new THREE.Group(); evDoor.userData.kind = kind; evDoor.add(buildPocketDoor(kind)); scene.add(evDoor) }
  const key = `${ed.wx},${ed.wy},${ed.wall},${ox},${oy}`
  if (key === evKey) return
  evKey = key
  const D = [[1, 0], [0, 1], [-1, 0], [0, -1]][ed.wall & 3]
  const cx = ed.wx - ox + 0.5, cy = ed.wy - oy + 0.5
  evDoor.position.set(cx + D[0] * 0.455, 0, cy + D[1] * 0.455)
  evDoor.rotation.y = Math.atan2(-D[0], -D[1]) // 门面（局部 +z）背离墙
}

// ---- 1d：大堂门（chunk 里的模型，按引擎「是否已出现」每帧切 visible）----
const lobbyDoors = new Map<THREE.Object3D, string>()
export function registerLobbyDoor(obj: THREE.Object3D, key: string) { obj.visible = false; lobbyDoors.set(obj, key) }
export function syncLobbyDoors(shown: (key: string) => boolean) {
  for (const [obj, key] of lobbyDoors) {
    if (!obj.parent) { lobbyDoors.delete(obj); continue }
    obj.visible = shown(key)
  }
}
