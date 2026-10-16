// L3 进化无面灵的异常面部器官（v73 / v74）
// 依据：Backrooms 中文维基 Level 3「高智能实体 · 无面灵」——
//   「Level 3 中的无面灵已开始不断生长出类似眼、耳、鼻、口的器官，不过……这些特征与人类的模样还相差甚远」，
//   以及生物学家担心它们「很快将会从生理上变得与人类别无二致」。
// 所以每只个体：一部分器官缺失（光滑皮肤），一部分长得不对；v74 起还有一部分已经「长对了」——
// 位置、大小、贴图都和正常 NPC 一模一样的人眼 / 人鼻 / 人耳，和旁边的异常部位放在一起，制造恐怖谷。
// v75 约束：不会长出一双正常的眼（最多一只长对）；嘴永远不对（位置、朝向、数量至少一项异常）；
// 脸上器官总数 ≤ 3（簇眼算 1 个；两侧原耳位不计）。
// 本文件只做「长什么、长在哪」的纯数据规划（按实体种子确定性）；几何在 retroNpc.ts 里贴着脸面网格生成，
// 眼、口、人鼻采样该个体脸照（与正常 NPC 同一套写实贴图）。
import { mulberry } from './shared'

/** 眼：real 写实人眼（错位）；ball 写实眼球鼓出眼窝；lidded 皮下鼓包 + 长合的缝；pit 空眼窝；cluster 一个肉窝里三颗小写实眼 */
export type EyeForm = 'real' | 'ball' | 'lidded' | 'pit' | 'cluster'
/** 鼻：real 写实人鼻（错位/歪）；nostrils 只有两个鼻孔；lump 长歪的肉疙瘩；flipped 倒长的鼻子；slit 单条竖鼻孔 */
export type NoseForm = 'real' | 'nostrils' | 'lump' | 'flipped' | 'slit'
/** 口：real 写实人嘴（错位/歪）；slitV 竖着的写实嘴；gash 被撕宽的写实嘴、露出参差的牙；pucker 挤成圆孔的写实嘴；seam 长合的嘴缝 */
export type MouthForm = 'real' | 'slitV' | 'gash' | 'pucker' | 'seam'
/** 脸上的耳：flap 一片肉耳 + 耳孔；hole 只有一个耳孔 */
export type FaceEarForm = 'flap' | 'hole'
/** 两侧原本的耳朵：normal 正常；none 没长（光滑）；hole 只有耳孔；tiny 发育不全的小肉芽 */
export type SideEar = 'normal' | 'none' | 'hole' | 'tiny'

/** normal = 长对了：retroNpc 会把它放回正常 NPC 的精确位置（眼线 / 鼻尖 / 嘴线），大小 1:1、不旋转 */
export type FaceOrgan =
  | { kind: 'eye'; form: EyeForm; t: number; x: number; s: number; rot: number; gaze: [number, number]; milky: boolean; normal?: boolean }
  | { kind: 'nose'; form: NoseForm; t: number; x: number; s: number; rot: number; normal?: boolean }
  | { kind: 'mouth'; form: MouthForm; t: number; x: number; s: number; rot: number; teeth: number; normal?: boolean }
  | { kind: 'ear'; form: FaceEarForm; t: number; x: number; s: number; rot: number }

export interface FacelingFacePlan {
  organs: FaceOrgan[]
  ears: [SideEar, SideEar] // [左(+x), 右(-x)]
  missing: ('eye' | 'nose' | 'mouth' | 'ear')[]
  normal: ('eye' | 'nose' | 'mouth' | 'ear')[]
  label: string
}

const EYE_ZH: Record<EyeForm, string> = { real: '错位人眼', ball: '凸眼', lidded: '闭缝眼', pit: '空眼窝', cluster: '簇眼' }
const NOSE_ZH: Record<NoseForm, string> = { real: '错位人鼻', nostrils: '只有鼻孔', lump: '歪肉鼻', flipped: '倒鼻', slit: '单鼻孔' }
const MOUTH_ZH: Record<MouthForm, string> = { real: '错位人嘴', slitV: '竖嘴', gash: '撕裂嘴', pucker: '圆孔嘴', seam: '封死的嘴' }
const EAR_ZH: Record<FaceEarForm, string> = { flap: '脸上长耳', hole: '脸上耳孔' }

// 脸面参数：t = 自下巴起的高度比例（≈0.04 下巴 → 0.94 额顶），x = 横向（±1 脸缘，±0.44 正常眼位）
// 正常五官在池内脸图统一构图下的位置（与 retroNpc 的 T_EYE / tN / tM 一致，仅用于占位防重叠）
const CANON = { eyeT: 0.56, eyeX: 0.44, noseT: 0.364, mouthT: 0.211 }
// 半径估算换成米（脸半宽 ≈ 0.072m，HH ≈ 0.235m），用于防重叠（已含 retroNpc 里异常器官的 ×0.95）
const R_M = { eye: 0.0135, nose: 0.012, mouth: 0.021, ear: 0.0155 }

export function planFacelingFace(seed: number): FacelingFacePlan {
  const r = mulberry(((seed >>> 0) * 2246822519 + 0x9e37) >>> 0)
  const pick = <T,>(a: readonly T[]): T => a[Math.floor(r() * a.length) % a.length]
  const rng = (a: number, b: number) => a + (b - a) * r()

  // 1) 哪些长了：每类独立掷骰，再保证「至少缺一类、至少长两类」
  let has = { eye: r() < 0.8, nose: r() < 0.62, mouth: r() < 0.72, ear: r() < 0.35 }
  const keys = ['eye', 'nose', 'mouth', 'ear'] as const
  const count = () => keys.filter((k) => has[k]).length
  while (count() < 2) has = { ...has, [pick(keys.filter((k) => !has[k]))]: true }
  if (count() === 4) has = { ...has, [pick(['nose', 'mouth', 'ear'] as const)]: false }

  // 2) 长了的里面哪些「长对了」（恐怖谷）；但不能全对——至少留一类是异常的
  let norm = { eye: has.eye && r() < 0.4, nose: has.nose && r() < 0.35, mouth: false } // v75：嘴永远不对
  const present = (['eye', 'nose', 'mouth'] as const).filter((k) => has[k])
  if (!has.ear && present.length && present.every((k) => norm[k])) norm = { ...norm, [pick(present)]: false }

  const organs: FaceOrgan[] = []
  const placed: { t: number; x: number; rm: number }[] = []
  const free = (t: number, x: number, rm: number) => placed.every((p) => Math.hypot((t - p.t) * 0.235, (x - p.x) * 0.072) > rm + p.rm + 0.004)
  const place = (rm: number, tr: [number, number], xr: [number, number]): [number, number] | null => {
    for (let k = 0; k < 40; k++) {
      const t = rng(tr[0], tr[1]), x = rng(xr[0], xr[1])
      if (free(t, x, rm)) { placed.push({ t, x, rm }); return [t, x] }
    }
    return null
  }

  // 3) 先放长对了的（固定位置）
  let halfEye = false
  if (norm.eye) {
    // v75：只会有一只长对了的人眼（另一侧光滑或长错）——不会有一双正常的眼
    halfEye = true
    const sides = halfEye ? [r() < 0.5 ? 1 : -1] : [1, -1]
    for (const sx of sides) {
      placed.push({ t: CANON.eyeT, x: sx * CANON.eyeX, rm: 0.013 })
      organs.push({ kind: 'eye', form: 'real', t: CANON.eyeT, x: sx * CANON.eyeX, s: 1, rot: 0, gaze: [0, 0], milky: false, normal: true })
    }
  }
  if (norm.nose) {
    placed.push({ t: CANON.noseT, x: 0, rm: 0.012 })
    organs.push({ kind: 'nose', form: 'real', t: CANON.noseT, x: 0, s: 1, rot: 0, normal: true })
  }
  if (norm.mouth) {
    placed.push({ t: CANON.mouthT, x: 0, rm: 0.022 })
    organs.push({ kind: 'mouth', form: 'real', t: CANON.mouthT, x: 0, s: 1, rot: 0, teeth: 0, normal: true })
  }

  // 4) 异常的口（面积最大，先放）
  if (has.mouth && !norm.mouth) {
    const form = pick(['real', 'slitV', 'gash', 'gash', 'pucker', 'seam'] as const)
    const s = form === 'pucker' ? rng(0.65, 0.95) : rng(0.7, 1.0)
    const pos = place(R_M.mouth * s, form === 'slitV' ? [0.22, 0.66] : [0.12, 0.72], [-0.6, 0.6])
    if (pos) {
      let rot = form === 'slitV' ? Math.PI / 2 + rng(-0.35, 0.35) : form === 'real' ? rng(-0.9, 0.9) : rng(-0.45, 0.45)
      // 嘴不能「位置和朝向都正常」：落在正常嘴位附近时强制歪斜/倒转
      const nearCanon = Math.abs(pos[0] - CANON.mouthT) < 0.13 && Math.abs(pos[1]) < 0.32
      if (nearCanon && Math.abs(Math.sin(rot)) < 0.55) rot = (r() < 0.5 ? -1 : 1) * rng(0.75, 1.25) + (r() < 0.3 ? Math.PI : 0)
      organs.push({ kind: 'mouth', form, t: pos[0], x: pos[1], s, rot, teeth: form === 'gash' ? 4 + Math.floor(r() * 5) : 0 })
    } else has.mouth = false
  }
  // 5) 异常的眼：1~3 颗（长对了的个体只有 40% 再多长一颗额外的），大小不一、高低错位，可能竖着长
  if (has.eye && (!norm.eye || r() < 0.4 || halfEye)) {
    const n = norm.eye ? 1 : r() < 0.38 ? 1 : r() < 0.8 ? 2 : 3
    let got = 0
    for (let i = 0; i < n; i++) {
      const form = pick(['real', 'real', 'ball', 'ball', 'lidded', 'pit', 'cluster'] as const)
      const s = form === 'cluster' ? rng(0.85, 1.0) : rng(0.6, 1.05)
      const pos = place(R_M.eye * s, n === 1 && !norm.eye ? [0.45, 0.86] : [0.3, 0.9], n === 1 && !norm.eye ? [-0.35, 0.35] : [-0.85, 0.85])
      if (!pos) continue
      got++
      const rot = r() < 0.25 ? Math.PI / 2 + rng(-0.3, 0.3) : r() < 0.15 ? Math.PI + rng(-0.3, 0.3) : rng(-0.5, 0.5)
      organs.push({ kind: 'eye', form, t: pos[0], x: pos[1], s, rot, gaze: [rng(-1, 1), rng(-1, 1)], milky: r() < 0.4 })
    }
    if (!got && !norm.eye) has.eye = false
  }
  // 6) 异常的鼻：可能长在脸颊、额头，或倒着长
  if (has.nose && !norm.nose) {
    const form = pick(['real', 'nostrils', 'lump', 'flipped', 'slit'] as const)
    const s = rng(0.7, 1.0)
    const pos = place(R_M.nose * s, [0.2, 0.85], [-0.75, 0.75])
    if (pos) organs.push({ kind: 'nose', form, t: pos[0], x: pos[1], s, rot: (form === 'flipped' ? Math.PI : 0) + rng(-0.6, 0.6) })
    else has.nose = false
  }
  // 7) 两侧耳朵 + 脸上的错位耳
  const sideOpts: SideEar[] = ['normal', 'normal', 'none', 'hole', 'tiny']
  const ears: [SideEar, SideEar] = [pick(sideOpts), pick(sideOpts)]
  if (has.ear) {
    const form = pick(['flap', 'flap', 'hole'] as const)
    const s = rng(0.7, 1.0)
    const pos = place(R_M.ear * s, [0.3, 0.86], [-0.92, 0.92])
    if (pos) {
      organs.push({ kind: 'ear', form, t: pos[0], x: pos[1], s, rot: rng(-1.2, 1.2) })
      // 耳朵「长错了地方」：靠近它的一侧原位就没有
      ears[pos[1] >= 0 ? 0 : 1] = r() < 0.7 ? 'none' : 'hole'
    } else has.ear = false
  } else if (ears[0] === 'normal' && ears[1] === 'normal' && r() < 0.4) ears[Math.floor(r() * 2)] = pick(['none', 'hole', 'tiny'] as const)

  // v75：脸上器官总数 ≤ 3——多出来的只会是额外的异常眼（每类至少 1 个、最多 3 类），从最后长的删起
  for (let i = organs.length - 1; organs.length > 3 && i >= 0; i--) {
    const o = organs[i]
    if (o.kind === 'eye' && !o.normal && organs.filter((q) => q.kind === 'eye').length > 1) organs.splice(i, 1)
  }

  const missing = keys.filter((k) => !has[k])
  const normal = (['eye', 'nose', 'mouth'] as const).filter((k) => norm[k] && has[k]) as FacelingFacePlan['normal']
  if (ears[0] === 'normal' && ears[1] === 'normal' && !has.ear) normal.push('ear')
  const parts: string[] = []
  const ZH = { eye: '眼', nose: '鼻', mouth: '口', ear: '耳' }
  if (normal.length) parts.push(`正常${normal.map((k) => ZH[k]).join('')}${norm.eye && halfEye ? '(单)' : ''}`)
  const eyes = organs.filter((o) => o.kind === 'eye' && !o.normal) as { form: EyeForm }[]
  if (eyes.length) parts.push(`${eyes.length}${[...new Set(eyes.map((e) => EYE_ZH[e.form]))].join('/')}`)
  for (const o of organs) {
    if ('normal' in o && o.normal) continue
    if (o.kind === 'nose') parts.push(NOSE_ZH[o.form])
    else if (o.kind === 'mouth') parts.push(MOUTH_ZH[o.form])
    else if (o.kind === 'ear') parts.push(EAR_ZH[o.form])
  }
  const label = `${parts.join('·')}${missing.length ? `｜缺${missing.map((k) => ZH[k]).join('')}` : ''}`
  return { organs, ears, missing, normal, label }
}
