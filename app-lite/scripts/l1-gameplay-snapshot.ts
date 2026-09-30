import { genL1ChunkRaw } from '../src/game/world/infiniteL1'
import { L1 } from '../src/game/levels/l1'
export function snapshotL1() {
  return [1, 42, 424242].flatMap(seed => ['parking','storage','gothic','ouroboros','garden','maintenance'].flatMap(variant => [[0,0],[5,7],[-3,-2]].map(([cx,cy]) => {
    const c=genL1ChunkRaw(L1,seed,cx,cy,variant)
    return {seed,cx,cy,variant,items:c.items,exits:c.exits,entities:c.entities,npcs:c.npcs,
      containers:c.structures.filter(s=>s.data?.sid!==undefined).map(s=>({kind:s.kind,x:s.x,y:s.y,data:s.data}))}
  })))
}
