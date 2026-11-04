import { entityForms } from './forms'

export const ARCHIVE_ANGLE_COUNT = 4
/** 与 renderer/maidRender.MAID_ARCHIVE_POSES 顺序一致（这里不引 three） */
const MAID_POSE_LABELS = ['巡楼', '打扫走廊', '「请安静」', '朝你走来']
/** 与 renderer/conciergeRender.CONCIERGE_ARCHIVE_POSES 顺序一致 */
const CONCIERGE_POSE_LABELS = ['前台接电话', '抬起前臂「看」你', '「你需要帮助吗？」', '啃银餐具']
/** [bellhop] 与 renderer/bellhopRender.BELLHOP_ARCHIVE_POSES 顺序一致 */
const BELLHOP_POSE_LABELS = ['走廊尽头候命', '你回头，他也转头', '饮茶', '恼怒铃']
/** [beast] 与 renderer/beastRender.BEAST_ARCHIVE_POSES 顺序一致 */
const BEAST_POSE_LABELS = ['绅士', '「都很公道。」', '余光里', '真身']
/** [chef] 与 renderer/chefRender.CHEF_ARCHIVE_POSES 顺序一致 */
const CHEF_POSE_LABELS = ['捧着紫甘蓝', '灶前搅锅', '敲你的桌子', '那口带把手的锅']
/** [jazz] 与 renderer/jazzRender.JAZZ_ARCHIVE_POSES 顺序一致 */
const JAZZ_POSE_LABELS = ['头儿 · 小号独奏', '萨克斯 · 「你点我吹」', '低音提琴 · 扶着沉甸甸的头', '鼓手 · 更爱弹钢琴']
/** [spokes] 与 renderer/spokesRender.SPOKES_ARCHIVE_POSES 顺序一致 */
const GREETER_POSE_LABELS = ['前台迎宾', '「这里一点也不危险！」', '心声', '上发条']

/** A finite tour keeps repeated clicks useful without creating an unbounded cache. */
export function entityArchiveView(type: string, step = 0) {
  const forms = entityForms(type)
  const count = ARCHIVE_ANGLE_COUNT * Math.max(4, forms.length)
  const index = ((Math.trunc(Number.isFinite(step) ? step : 0) % count) + count) % count
  const specimen = Math.floor(index / ARCHIVE_ANGLE_COUNT)
  const angle = index % ARCHIVE_ANGLE_COUNT
  const form = forms.length ? forms[specimen % forms.length] : undefined
  let seed = 2166136261
  for (const c of type) seed = Math.imul(seed ^ c.charCodeAt(0), 16777619) >>> 0
  seed = (seed + Math.imul(specimen, 0x9e3779b9)) >>> 0
  const name = form?.name ?? (type === 'maid' ? MAID_POSE_LABELS[specimen % 4] : type === 'concierge' ? CONCIERGE_POSE_LABELS[specimen % 4] : type === 'bellhop' ? BELLHOP_POSE_LABELS[specimen % 4] : type === 'beast' ? BEAST_POSE_LABELS[specimen % 4] : type === 'greeter' ? GREETER_POSE_LABELS[specimen % 4] : type === 'chef' ? CHEF_POSE_LABELS[specimen % 4] : type === 'jazz' ? JAZZ_POSE_LABELS[specimen % 4] : `个体 ${specimen + 1}`) // [maid] 孤例：轮换的是姿态而不是个体
  return { index, count, specimen, angle, form, seed, label: `${name} · 视角 ${angle + 1}/${ARCHIVE_ANGLE_COUNT}` }
}
