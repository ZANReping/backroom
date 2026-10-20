// Optional diagnostic for the entry benchmark; never installed in the game.
export function auditEntryPrograms(renderer) {
  const gl = renderer.getContext(), compiled = new Set(), rows = []
  let phase = ''
  const compile = renderer.compileAsync, render = renderer.render, info = gl.getProgramInfoLog
  renderer.compileAsync = function (...args) {
    const previous = phase; phase = 'compile'
    try {
      const result = compile.apply(this, args)
      for (const p of this.info.programs) compiled.add(p.program)
      return result
    } finally { phase = previous }
  }
  renderer.render = function (...args) {
    const previous = phase
    phase = args[0].children?.some(o => o.geometry?.drawRange.count === 0) ? 'upload' : 'draw'
    try { return render.apply(this, args) } finally { phase = previous }
  }
  gl.getProgramInfoLog = function (program) {
    const t = performance.now(), result = info.call(this, program), ms = performance.now() - t
    if (ms > 10) {
      const p = renderer.info.programs.find(p => p.program === program)
      const fields = p?.cacheKey.split(',') ?? []
      const closest = renderer.info.programs.filter(p => compiled.has(p.program)).map(p => {
        const prior = p.cacheKey.split(',')
        return { key: p.cacheKey, diff: fields.flatMap((value, i) => value !== prior[i] ? [{ i, before: prior[i], after: value }] : []) }
      }).sort((a, b) => a.diff.length - b.diff.length)[0]
      rows.push({ ms, phase, precompiled: compiled.has(program), key: p?.cacheKey,
        closest,
        shaders: gl.getAttachedShaders(program)?.map(s => gl.getShaderSource(s)?.match(/^#define .*/gm)) })
    }
    return result
  }
  return rows
}
