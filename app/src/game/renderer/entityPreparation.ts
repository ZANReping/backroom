/** Bounded cooperative CPU work; keys identify shared, deterministic resources. */
export class EntityPreparationQueue {
  private jobs = new Map<string, Generator<void, void>>()

  request(key: string, ready: boolean, create: () => Generator<void, void>) {
    if (ready) return true
    if (!this.jobs.has(key)) this.jobs.set(key, create())
    return false
  }

  advance(budgetMs = 1.5) {
    const end = performance.now() + budgetMs
    // Round robin, with a count bound even when a step is only a cache lookup.
    for (let n = 0; n < 16 && this.jobs.size && (n === 0 || performance.now() < end); n++) {
      const [key, job] = this.jobs.entries().next().value!
      const step = job.next()
      this.jobs.delete(key)
      if (!step.done) this.jobs.set(key, job)
    }
  }

  clear() {
    for (const job of this.jobs.values()) job.return()
    this.jobs.clear()
  }
}
