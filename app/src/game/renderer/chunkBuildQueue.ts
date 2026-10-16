/** Bounded cooperative work: overlap driver/Worker waits, not main-thread budgets. */
export class ChunkBuildQueue<T extends { key: string; iter: Generator<void, void, unknown> }> {
  private jobs = new Map<string, T>()
  get first(): T | null { return this.jobs.values().next().value ?? null }
  get size() { return this.jobs.size }
  has(key: string) { return this.jobs.has(key) }

  add(job: T) { if (!this.jobs.has(job.key)) this.jobs.set(job.key, job) }

  cancelWhere(predicate: (job: T) => boolean) {
    for (const [key, job] of this.jobs) if (predicate(job)) {
      this.jobs.delete(key)
      job.iter.return()
    }
  }

  advance(budgetMs: number, stepLimit: number) {
    const deadline = performance.now() + budgetMs
    for (let steps = 0; this.jobs.size && steps < stepLimit && performance.now() < deadline; steps++) {
      const job = this.first!
      this.jobs.delete(job.key)
      // Round-robin lets another chunk generate/upload while this one waits for
      // parallel shader compilation or its baked lighting Worker.
      if (!job.iter.next().done) this.jobs.set(job.key, job)
    }
  }
}
