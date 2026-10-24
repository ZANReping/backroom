// 无面灵（Entity 9）个体特征：年龄档 / 职业衣着（渲染与 AI 共用，按实体种子确定性）
// 依据 entity-9：外貌在诞生时就呈现为某一年龄段的人类；儿童/幼年个体最不稳定；
// 它们会模仿人类的职业（收银员、白领、路人）。

export type FacelingAge = 'child' | 'adult' | 'elder'
export type FacelingRole = 'pedestrian' | 'shopkeeper' | 'office'

/** 年龄档：普通种 儿童 14% / 老年 16%；进化种（L3）儿童 8% / 老年 10% */
export function facelingAge(seed: number, evolved = false): FacelingAge {
  const r = hash01(seed)
  const child = evolved ? 0.08 : 0.14, elder = evolved ? 0.1 : 0.16
  return r < child ? 'child' : r < child + elder ? 'elder' : 'adult'
}

export const FACELING_AGE_ZH: Record<FacelingAge, string> = { child: '幼年', adult: '成年', elder: '老年' }
/** 年龄档的身高比例（渲染缩放与碰撞半径共用） */
export const FACELING_AGE_HEIGHT: Record<FacelingAge, number> = { child: 0.6, adult: 1, elder: 0.965 }

function hash01(seed: number) {
  let t = (Math.imul(seed >>> 0, 2654435761) + 0x51ed) | 0
  t = Math.imul(t ^ (t >>> 15), 1 | t)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}
