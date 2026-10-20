import { REFINED_ITEM_TYPES } from '../src/game/renderer/refinedItemMesh'
import { look } from '../src/game/renderer/shared'

/** Called only by the isolated Level 0 verifier, never by App. */
export async function verifyRefinedModelsInGame(qa: any) {
  const { eng: e, r } = qa, results: string[] = []
  const check = (ok: unknown, text: string) => { if (!ok) throw Error(text); results.push(text) }
  const tick = () => new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
  await qa.anchor('yellow'); await qa.warm(); qa.hide()
  e.paused = false; e.handsHidden = false; e.player.hotbar.fill(null); e.player.selected = 0
  const x = e.player.x, y = e.player.y
  e.map.items = REFINED_ITEM_TYPES.map((type, i) => ({ id: 8800 + i, type, count: 1, x: x + (i % 11 - 5) * .45, y: y - 2.2 - Math.floor(i / 11) * .45, z: 0 }))
  await qa.warm()
  for (const [i, type] of REFINED_ITEM_TYPES.entries()) {
    const g = r.itemMeshes.get(Math.round((8800 + i) * 1000) % 100000000)
    check(g?.getObjectByName(`${type}-refined-model`), `${type}: production ground model`)
    e.player.hotbar[0] = { type, count: 1 }; await tick(); await tick()
    check(r.vmItem?.getObjectByName(`${type}-refined-model`), `${type}: production hotbar/held cache`)
    check(r.heldCache.size <= 12, `${type}: held cache remains bounded`)
  }
  // Repeat eviction/recreation through the real ground pool and held cache.
  const resources = []
  for (let cycle = 0; cycle < 3; cycle++) {
    const items = e.map.items; e.map.items = []; await tick(); await tick()
    check(r.itemPool.length <= 24, `cycle ${cycle}: ground pool remains bounded`)
    e.map.items = items; await qa.warm()
    for (const type of REFINED_ITEM_TYPES) { e.player.hotbar[0] = { type, count: 1 }; await tick(); await tick() }
    await qa.warm(); resources.push({ ...r.three.info.memory, programs: r.three.info.programs.length })
  }
  check(resources.every(row => JSON.stringify(row) === JSON.stringify(resources[0])), 'production recreation resource counts stable')
  // A representative in-world composition, with ordinary halo and scene light.
  e.map.items = ['gas', 'divemask', 'pizza', 'notebook', 'citywater'].map((type, i) => ({ id: 9900 + i, type, count: 1, x: x + (i % 3 - 1) * .48, y: y - 1.4 - Math.floor(i / 3) * .65, z: 0 }))
  look.yaw = 0; look.pitch = -.34; r.setFov(68); e.player.hotbar[0] = { type: 'wrench', count: 1 }
  await qa.warm()
  return { passed: results.length, results, resources, stats: qa.stats(), scope: 'production Level 0 renderer, item pool and hotbar; isolated storage' }
}
