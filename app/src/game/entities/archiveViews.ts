import { entityForms } from './forms'

export const ARCHIVE_ANGLE_COUNT = 4

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
  return { index, count, specimen, angle, form, seed, label: `${form?.name ?? `个体 ${specimen + 1}`} · 视角 ${angle + 1}/${ARCHIVE_ANGLE_COUNT}` }
}
