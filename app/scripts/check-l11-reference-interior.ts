import assert from 'node:assert/strict'
import { mkdirSync,writeFileSync } from 'node:fs'
import { l11CityPlan } from '../src/game/world/l11Layout'
import { l11InteriorPlan } from '../src/game/world/l11Interiors'
import { l11RoomFixtures } from '../src/game/world/l11RoomFurnishing'
import { l11DecorDef } from '../src/game/content/l11Decor'
import { l11PropColliders } from '../src/game/world/l11Collision'
import { l11SolidHits } from '../src/game/world/l11Solid'
import { L11_REFERENCE_SEED } from '../src/game/world/l11ReferenceDistrict'
import type { Structure } from '../src/game/core/types'

const result={buildings:0,doors:0,approaches:0,failures:[] as unknown[]}
for(const b of l11CityPlan(L11_REFERENCE_SEED,0,0).buildings.filter(b=>b.id.includes(':reference:'))){
  result.buildings++
  const fixtures=l11RoomFixtures(b).map(p=>{
    const d=l11DecorDef('l11_'+p.key)!
    const s:Structure={kind:d.id,x:p.x-d.w/2,y:p.y-d.d/2,w:d.w,h:d.d,solid:d.solid,data:{deg:-p.angle*180/Math.PI}}
    return {p,colliders:d.solid?l11PropColliders(s):[]}
  })
  for(const f of l11InteriorPlan(b).floors)for(const door of f.doors){
    result.doors++
    const len=Math.hypot(door.b[0]-door.a[0],door.b[1]-door.a[1]),dx=(door.b[0]-door.a[0])/len,dy=(door.b[1]-door.a[1])/len
    for(const sign of [-1,1]){
      result.approaches++
      const x=door.center[0]-dy*.65*sign,y=door.center[1]+dx*.65*sign
      for(const {p,colliders} of fixtures)if(p.floor===f.floor){
        const mount=p.mount??0
        if(colliders.some(c=>c.top>.22-mount&&l11SolidHits(c,x,y,.32,.025-mount,1.48-mount)))result.failures.push({building:b.id,door:door.id,side:sign,fixture:p.id,key:p.key})
      }
    }
  }
}
mkdirSync('reports/l11-reference',{recursive:true})
writeFileSync('reports/l11-reference/interior-clearance.json',JSON.stringify(result,null,2))
console.log(JSON.stringify(result,null,2));assert.equal(result.failures.length,0,'all reference room approaches clear actual furniture meshes')
