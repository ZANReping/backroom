import assert from 'node:assert/strict'
import { l11StreetPropAllowed } from '../src/game/world/l11PropPlacement'
import { l11ChunkData,l11CityPlan } from '../src/game/world/l11Layout'

const plan=l11ChunkData(20261014,22,27),neighbours=l11CityPlan(20261014,0,0).buildings

assert.equal(l11StreetPropAllowed(20261014,'park_bench',729,872,0,neighbours,plan),false,'old bench position overlaps lane')
assert.equal(l11StreetPropAllowed(20261014,'park_bench',733,872,0,neighbours,plan),true,'moved bench clears lane')
assert.equal(l11StreetPropAllowed(20261014,'park_bench',729,872,Math.PI/4,neighbours,plan),false,'rotated bench still uses its footprint')
assert.equal(l11StreetPropAllowed(20261014,'sedan',729,872,0,neighbours,plan),false,'motor vehicles cannot occupy pedestrian quays')
const bridge=l11ChunkData(20261014,23,25)
assert.equal(l11StreetPropAllowed(20261014,'canal_railing',760,824.8,0,neighbours,bridge),true,'bridge sidewalk railing remains legal')
console.log(JSON.stringify({ok:true,cases:5,road:'generated-reference-service-lane-and-bridge'}))
