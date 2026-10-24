// L3 进化无面灵的面部器官（v73 / v74 起；v90 按 entity-9 进化种重写，见 planFacelingFace）
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
export type EyeForm = 'real' | 'ball' | 'lidded' | 'pit' | 'cluster' | 'small'
/** 鼻：real 写实人鼻（错位/歪）；nostrils 只有两个鼻孔；lump 长歪的肉疙瘩；flipped 倒长的鼻子；slit 单条竖鼻孔 */
export type NoseForm = 'real' | 'nostrils' | 'lump' | 'flipped' | 'slit' | 'merged'
/** 口：real 写实人嘴（错位/歪）；slitV 竖着的写实嘴；gash 被撕宽的写实嘴、露出参差的牙；pucker 挤成圆孔的写实嘴；seam 长合的嘴缝 */
export type MouthForm = 'real' | 'slitV' | 'gash' | 'pucker' | 'seam' | 'agape'
/** 脸上的耳：flap 一片肉耳 + 耳孔；hole 只有一个耳孔 */
export type FaceEarForm = 'flap' | 'hole'
/** 两侧原本的耳朵：normal 正常；none 没长（光滑）；hole 只有耳孔；tiny 发育不全的小肉芽 */
export type SideEar = 'normal' | 'none' | 'hole' | 'tiny' | 'flat'

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
  /** v90 进化种：early = 早期（独眼、独耳，器官不全）；late = 五官趋于完整但仍畸形 */
  stage: 'early' | 'late'
  /** 进化种长出胡须 / 体毛的倾向（0..1，渲染决定是否长胡子） */
  hairy: number
}

const EYE_ZH: Record<EyeForm, string> = { real: '错位人眼', ball: '凸眼', lidded: '闭缝眼', pit: '空眼窝', cluster: '簇眼', small: '小眼' }
const NOSE_ZH: Record<NoseForm, string> = { real: '错位人鼻', nostrils: '只有鼻孔', lump: '歪肉鼻', flipped: '倒鼻', slit: '单鼻孔', merged: '连鼻孔' }
const MOUTH_ZH: Record<MouthForm, string> = { real: '错位人嘴', slitV: '竖嘴', gash: '撕裂嘴', pucker: '圆孔嘴', seam: '封死的嘴', agape: '无唇张口' }
const EAR_ZH: Record<FaceEarForm, string> = { flap: '脸上长耳', hole: '脸上耳孔' }

// 脸面参数：t = 自下巴起的高度比例（≈0.04 下巴 → 0.94 额顶），x = 横向（±1 脸缘，±0.44 正常眼位）
// 正常五官在池内脸图统一构图下的位置（与 retroNpc 的 T_EYE / tN / tM 一致，仅用于占位防重叠）
const CANON = { eyeT: 0.56, eyeX: 0.44, noseT: 0.364, mouthT: 0.211 }
// 半径估算换成米（脸半宽 ≈ 0.072m，HH ≈ 0.235m），用于防重叠（已含 retroNpc 里异常器官的 ×0.95）
const R_M = { eye: 0.0135, nose: 0.012, mouth: 0.021, ear: 0.0155 }

// v90（Entity 9 重制）：L3 无面灵 = 进化种。依据 entity-9「生物学特征」：
//   两个鼻孔通常相连；眼球小而原始（近视）；嘴没有嘴唇、下颚发育不全无法合拢；耳部扁平、耵聍堵塞；
//   没有眉毛与睫毛；开始长出体毛与面部毛发。早期报告则是「独眼、独耳」这类零散的异常器官。
// 所以每只个体先掷发育阶段：late（70%）五官齐全但都带上述缺陷；early（30%）只长出一部分。
// 位置贴近正常五官（与人类的相似性），只带少量不对称。
export function planFacelingFace(seed: number): FacelingFacePlan {
  const r = mulberry(((seed >>> 0) * 2246822519 + 0x9e37) >>> 0)
  const rng = (a: number, b: number) => a + (b - a) * r()
  const stage: 'early' | 'late' = r() < 0.3 ? 'early' : 'late'
  const organs: FaceOrgan[] = []
  const milky = r() < 0.25
  // 眼：小而原始，坐在浅眼窝里；左右高低、间距略不对称
  if (stage === 'late') {
    const lift = rng(-0.02, 0.02), spread = rng(-0.04, 0.04), sz = rng(0.68, 0.84)
    for (const sx of [1, -1]) organs.push({ kind: 'eye', form: 'small', t: CANON.eyeT + (sx > 0 ? lift : -lift) * 0.5 + rng(-0.008, 0.008), x: sx * (CANON.eyeX + spread + rng(-0.02, 0.02)), s: sz * rng(0.92, 1.08), rot: rng(-0.12, 0.12), gaze: [rng(-0.4, 0.4), rng(-0.3, 0.3)], milky })
  } else {
    // 独眼：正中（40%）或长在一侧的原眼位
    const mid = r() < 0.4
    organs.push({ kind: 'eye', form: 'small', t: CANON.eyeT + (mid ? rng(0.01, 0.04) : rng(-0.01, 0.01)), x: mid ? rng(-0.06, 0.06) : (r() < 0.5 ? 1 : -1) * (CANON.eyeX + rng(-0.03, 0.03)), s: rng(0.72, 0.9), rot: rng(-0.15, 0.15), gaze: [rng(-0.4, 0.4), rng(-0.3, 0.3)], milky })
  }
  // 鼻：低平的鼻梁，两个鼻孔连成一道横口
  const hasNose = stage === 'late' || r() < 0.5
  if (hasNose) organs.push({ kind: 'nose', form: 'merged', t: CANON.noseT + rng(-0.012, 0.012), x: rng(-0.04, 0.04), s: rng(0.85, 1.1), rot: rng(-0.1, 0.1) })
  // 嘴：无唇、合不拢，露出几颗小牙
  const hasMouth = stage === 'late' || r() < 0.6
  if (hasMouth) organs.push({ kind: 'mouth', form: 'agape', t: CANON.mouthT - rng(0, 0.02), x: rng(-0.04, 0.04), s: rng(0.85, 1.05), rot: rng(-0.08, 0.08), teeth: 3 + Math.floor(r() * 4) })
  // 耳：扁平贴头、耳道被耵聍堵住；早期只长一只
  let ears: [SideEar, SideEar] = ['flat', 'flat']
  if (stage === 'early') { const one = r() < 0.5 ? 0 : 1; ears = one === 0 ? ['flat', r() < 0.5 ? 'none' : 'hole'] : [r() < 0.5 ? 'none' : 'hole', 'flat'] }
  const missing: FacelingFacePlan['missing'] = []
  if (!hasNose) missing.push('nose')
  if (!hasMouth) missing.push('mouth')
  const ZH = { eye: '眼', nose: '鼻', mouth: '口', ear: '耳' }
  const parts = [stage === 'late' ? '晚期' : '早期', organs.filter((o) => o.kind === 'eye').length === 1 ? '独眼' : '双小眼']
  if (hasNose) parts.push(NOSE_ZH.merged)
  if (hasMouth) parts.push(MOUTH_ZH.agape)
  parts.push(ears.filter((e) => e === 'flat').length === 1 ? '独耳' : '扁耳')
  void EYE_ZH; void EAR_ZH; void R_M
  return { organs, ears, missing, normal: [], label: `${parts.join('·')}${missing.length ? `｜缺${missing.map((k) => ZH[k]).join('')}` : ''}`, stage, hairy: r() }
}
