import type * as THREE from 'three'

type Program = NonNullable<THREE.WebGLRenderer['info']['programs']>[number]
const waits = new WeakMap<THREE.WebGLRenderer, WeakMap<Program, Promise<void>>>()
const complete = Promise.resolve()

// compileAsync polls a material's current program. A shared material may also
// have a pending back-face or instanced program that is no longer current.
// Snapshot the public program list after submission, and check every version.
// Reuse a single poller per program across batches, models and chunks.
export function waitForSubmittedPrograms(renderer: THREE.WebGLRenderer): Promise<void> {
  const programs = renderer.info.programs
  if (!programs?.length) return complete
  const gl = renderer.getContext()
  const extension = gl.getExtension('KHR_parallel_shader_compile')
  // Keep Three's existing fallback on platforms without non-blocking queries.
  if (!extension || gl.isContextLost()) return complete
  let cached = waits.get(renderer)
  if (!cached) { cached = new WeakMap(); waits.set(renderer, cached) }
  const pending: Promise<void>[] = []
  for (const entry of programs) {
    let wait = cached.get(entry)
    if (!wait) {
      const ready = () => !entry.program || gl.isContextLost() ||
        !!gl.getProgramParameter(entry.program as WebGLProgram, extension.COMPLETION_STATUS_KHR)
      if (ready()) wait = complete
      else wait = new Promise<void>(resolve => {
        const poll = () => {
          if (ready()) { cached!.set(entry, complete); resolve() }
          else setTimeout(poll, 10)
        }
        setTimeout(poll, 10)
      })
      cached.set(entry, wait)
    }
    if (wait !== complete) pending.push(wait)
  }
  return pending.length ? Promise.all(pending).then(() => undefined) : complete
}
