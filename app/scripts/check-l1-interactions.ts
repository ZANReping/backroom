import assert from 'node:assert/strict'
import {mkdirSync,writeFileSync} from 'node:fs'
import * as THREE from 'three'
import { ViewmodelSwitch } from '../src/game/renderer/viewmodelSwitch'
import { L1_CRATE, l1CrateCollider, l1CrateCount } from '../src/game/world/l1Crate'
import { buildL1Prop } from '../src/game/renderer/l1Props'
import { disposeL1Owned } from '../src/game/renderer/l1Materials'
import { buildL1Data } from '../src/game/world/l1Building'
import { l1MapGeometry } from '../src/game/world/l1MapData'
import { L1_STYLE_NAMES } from '../src/game/world/l1BuildingTypes'
import {structColliders,structStandTopAt,setStructModelColliders,type GameMap} from '../src/game/world/mapgen'
import {canOccupy} from '../src/game/core/player'
import {l1FindReference} from '../src/game/world/l1Spatial'

const canvas = await import('@napi-rs/canvas').catch(() => null)
if (canvas) Object.defineProperty(globalThis, 'document', { value: { createElement: () => canvas.createCanvas(128, 128), createElementNS: () => ({}) } })
let pass = 0
const ok = (value: unknown, message: string) => { assert(value, message); pass++ }

// Viewmodel selection: lower the old hand, swap only once fully lowered, and
// finish at a neutral pose without exposing intermediate rapid-slot requests.
const vm = new ViewmodelSwitch()
vm.update(0, 'flashlight', 0); ok(vm.held === 'flashlight' && vm.dip === 0 && vm.phase === 'idle', 'initial held item is immediate')
vm.update(1, 'key', .02); ok(vm.phase === 'lower' && vm.held === 'flashlight' && vm.dip > 0, 'slot change lowers old model before swap')
vm.update(1, 'key', .1); vm.update(1, 'key', .125); ok(vm.held === 'key' && vm.dip === 0 && vm.phase === 'idle', 'slot switch completes within .23 seconds')
vm.update(2, 'food', .01); vm.update(3, 'water', .01); vm.update(3, 'water', .1); vm.update(3, 'water', .125); ok(vm.held === 'water' && vm.dip === 0, 'rapid slot changes display only latest request')
vm.update(4, 'knife', 0, false); ok(vm.held === 'knife' && vm.dip === 0 && vm.phase === 'idle', 'interrupted non-animated update is immediate')
vm.update(4, '', .016); ok(vm.held === '' && vm.dip === 0, 'same-slot consumed item clears immediately')
vm.update(5,'knife',0,false);vm.update(6,'knife',.02);ok(vm.dip>0&&vm.held==='knife','different hotbar slots with the same kind still gesture');vm.update(6,'knife',.1,false)
for (const hz of [30, 60, 120]) { const x = new ViewmodelSwitch(); x.update(0, 'a', 0); x.update(1, 'b', 0.01); for (let i = 0; i < Math.ceil(hz * .25); i++) x.update(1, 'b', 1 / hz); ok(x.held === 'b' && x.dip === 0 && x.phase === 'idle', `switch settles at ${hz}Hz`) }

// L1 crate: collision footprint follows the rendered crate, including stacks
// and right-angle rotations. The lid is a standable support surface.
for (const deg of [0, 45, 90, 180, 270]) {
  for (const stack of [1, 2]) {
    const s: any = { kind: 'crate', x: 10, y: 10, w: L1_CRATE.width, h: L1_CRATE.depth, solid: true, data: { l1Crate: true, l1Stack: stack, deg } }
    const c = l1CrateCollider(s)
    ok(l1CrateCollider(s)===c,'unchanged case collision reuses its cached footprint')
    ok(c.stand && Math.abs(c.top - L1_CRATE.height * stack) < 1e-9, `crate ${deg}° stack ${stack} lid height`)
    ok(c.x1 > c.x0 && c.y1 > c.y0, `crate ${deg}° footprint finite`)
    const g = buildL1Prop({ ...s, data: { ...s.data, l1Prop: 'crate' } })!
    g.updateMatrixWorld(true)
    const b = new THREE.Box3().setFromObject(g)
    ok(Math.abs((b.max.y - b.min.y) - L1_CRATE.height * stack) < .08, `crate ${deg}° rendered height matches collider`)
    ok(Math.abs(c.x0-b.min.x)<1e-6&&Math.abs(c.x1-b.max.x)<1e-6&&Math.abs(c.y0-b.min.z)<1e-6&&Math.abs(c.y1-b.max.z)<1e-6,`crate ${deg}° rendered footprint matches collider`)
    const blank=()=>new Uint8Array(32*32)
    const m={w:32,h:32,tiles:blank().fill(1),structures:[s],tint:blank(),elev:blank(),step:blank(),stair:blank(),liquid:blank(),wet:blank(),crawl:blank(),up:blank(),upWall:blank(),up2:blank(),upWall2:blank(),dn:blank(),dnWall:blank()}as unknown as GameMap
    // Reproduce the old failure: merged BufferGeometry reported a solid body
    // with no standable face. The explicit lid must take precedence at runtime.
    setStructModelColliders(s,[{x0:-L1_CRATE.width/2,y0:-L1_CRATE.depth/2,x1:L1_CRATE.width/2,y1:L1_CRATE.depth/2,bottom:0,top:c.top,stand:false}])
    const x=s.x+s.w/2,y=s.y+s.h/2
    ok(structColliders(s,m).every(b=>b.stand),`crate ${deg}° stack ${stack} merged mesh cannot remove lid`)
    ok(!canOccupy(m,x,y,.32,{z:0,band:0}),`crate ${deg}° stack ${stack} side remains solid`)
    ok(canOccupy(m,x,y,.32,{z:c.top,band:0}),`crate ${deg}° stack ${stack} standing body clears lid`)
    ok(Math.abs(structStandTopAt(m,x,y,c.top,0)-c.top)<1e-8,`crate ${deg}° stack ${stack} physics supports actual lid`)
    ok(structStandTopAt(m,c.x1+.33,c.y1+.33,c.top,0)===-Infinity,`crate ${deg}° stack ${stack} fully leaving the body footprint loses support`)
    if(deg===45)ok(structStandTopAt(m,c.x0-.32,c.y0-.32,c.top,0)===-Infinity,'rotated crate bounding-box corner is not invisible floor')
    s.x+=32;const shifted=l1CrateCollider(s);ok(shifted!==c&&Math.abs(shifted.x0-c.x0-32)<1e-6,'streaming origin shift refreshes the same case footprint');s.x-=32
    g.traverse(disposeL1Owned); g.traverse((o: any) => { if (o.geometry) o.geometry.dispose() })
  }
}

// Map preview is derived directly from architecture data and remains cached by
// data identity; positive/negative chunks expose actual walls, styles, doors,
// floors and puddles without creating scene objects.
for (const [cx, cz] of [[0, 0], [1, -1], [-2, 3]] as const) {
  const data = buildL1Data(20261017, cx, cz)
  const a = l1MapGeometry(data), b = l1MapGeometry(data)
  ok(a === b, `map geometry identity ${cx},${cz}`)
  ok(a.tiles.length === 1024 && a.regions.length === 1024 && a.wet.length === 1024, `map arrays ${cx},${cz}`)
  ok(a.walls.length > 0, `map walls ${cx},${cz}`)
  ok(Array.from(a.regions).every(v => v < L1_STYLE_NAMES.length), `map region styles ${cx},${cz}`)
  ok(Array.from(a.tiles).every(v => v === 1 || v === 2), `map floor tile values ${cx},${cz}`)
  ok(Array.from(a.tiles).every((v,i)=>(v===1)===!!data.floor[i]),`map and actual architecture share floor ${cx},${cz}`)
  ok(a.regions===data.styles,`map shares exact building styles ${cx},${cz}`)
  ok(a.doors.every(d => d.id.length > 0 && d.w > 0 && d.h > 0), `map door spans ${cx},${cz}`)
}
const water=l1FindReference(20261006,'parking-water',2400)!,wetData=buildL1Data(20261006,Math.floor(water.centerX/32),Math.floor(water.centerY/32))
ok(l1MapGeometry(wetData).wet.some(Boolean),'authored wet hall appears as actual water on the map')
console.log(`L1 interaction checks passed: ${pass}`)
mkdirSync('reports/l1-interactions/checks',{recursive:true})
writeFileSync('reports/l1-interactions/checks/l1-interactions.json',JSON.stringify({status:'passed',checks:pass,scope:['hotbar visual state','actual crate model/collision/support integration','immutable L1 map geometry']},null,2)+'\n')
