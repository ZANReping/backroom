import { L5_DECOR_DEFS } from '../src/game/content/l5Decor'
import { buildLiquidSurfaces } from '../src/game/renderer/liquidsSky'
import { LEVELS } from '../src/game/levels'
import assert from 'node:assert/strict'
import { createCanvas } from '@napi-rs/canvas'
import * as THREE from 'three'
import { buildL5Structure,buildL5Registered,buildL5StructureUncached } from '../src/game/renderer/l5Meshes'
import { buildL5Architecture } from '../src/game/renderer/l5Architecture'
import { l5Material, l5SurfaceBatches } from '../src/game/renderer/l5Materials'
import type { GameMap } from '../src/game/world/mapgen'
import type { Structure } from '../src/game/core/types'

Object.defineProperty(globalThis, 'document', { value: { createElement: () => createCanvas(128, 128), createElementNS: () => { throw new Error('headless') } } })

const n = 64
const map = { w: n, h: n, tiles: new Uint8Array(n * n).fill(1), tint: new Uint8Array(n * n), structures: [], items: [], lights: [], exits: [], entities: [], spawn: { x: 2, y: 2 }, wet: new Uint8Array(n * n), elev: new Uint8Array(n * n), outdoor: new Uint8Array(n * n), step: new Uint8Array(n * n), crawl: new Uint8Array(n * n), ceiling: new Uint8Array(n * n), up: new Uint8Array(n * n), upWall: new Uint8Array(n * n), up2: new Uint8Array(n * n), upWall2: new Uint8Array(n * n), stair: new Int32Array(n * n), liquid: new Uint8Array(n * n), seaFloor: new Float32Array(n * n), floors: 1, dn: new Uint8Array(n * n), dnWall: new Uint8Array(n * n), inf: { ox: 100, oy: 200, seed: 42 }, } as unknown as GameMap

function structure(kind: string, data: Record<string, unknown> = {}): Structure { return { kind: kind as Structure['kind'], x: 10, y: 10, w: 2, h: 2, solid: false, data: { l5: 1, ...data } } as Structure }
function inspect(g: THREE.Group, label = 'model') {
  assert(g.children.length > 0, `${label} empty`)
  let count = 0
  g.traverse(o => { const mesh = o as THREE.Mesh; if (!mesh.geometry) return; count++; for (const name of ['position', 'uv', 'normal']) { const a = mesh.geometry.getAttribute(name); assert(a, `${name} missing`); assert(Array.from(a.array).every(Number.isFinite), `${name} non-finite`) } })
  assert(count > 0, `${label} has no geometry`)
}

for (const [kind, data] of [['redpillar', {}], ['ceilingbeam', { axis: 'x' }], ['ceilingbeam', { axis: 'y' }], ['chandelier', {}], ['planter', {}], ['table', {}], ['sofa', {}], ['libshelf', {}], ['sconce', {}], ['lightgrid', { plain: 0 }], ['lightgrid', { plain: 1 }], ['hotelwindow', { entry: 1 }], ['hoteldoor', {}], ['rug', { rx: 10, ry: 10, rw: 4, rh: 4 }]] as const) {
  const g = buildL5Structure(structure(kind, kind === 'rug' ? { ...data, rx: 110, ry: 210 } : data), 4, map)
  assert(g, `${kind} returned no model`); inspect(g, kind)
}

const door = buildL5Structure(structure('hoteldoor'), 4, map)!; const lids: THREE.Object3D[] = []; door.traverse(o => { if (o.userData.lid !== undefined) lids.push(o) }); assert.equal(lids.length, 1); door.updateMatrixWorld(true); const doorBox = new THREE.Box3().setFromObject(door); assert(doorBox.min.x < doorBox.max.x && doorBox.min.z < doorBox.max.z)

// Two different window origins must give identical absolute texture coordinates on the cut.
const seamUvs = [100,102].map(ox => {
  const localMap={...map,inf:{...map.inf!,ox}} as GameMap
  const s={...structure('rug',{rx:110,ry:210,rw:4,rh:2}),x:10,y:10,w:2,h:2} as Structure
  const g=buildL5Structure(s,4,localMap)!;inspect(g)
  g.position.set(s.x+s.w/2+ox,0,s.y+s.h/2+200);g.updateMatrixWorld(true)
  const bounds=new THREE.Box3().setFromObject(g),eps=1e-5
  assert(bounds.min.x>=ox+10-eps&&bounds.max.x<=ox+12+eps,'rug exceeds clipped X bounds')
  assert(bounds.min.z>=210-eps&&bounds.max.z<=212+eps,'rug exceeds clipped Z bounds')
  const seam=new Set<string>()
  g.traverse(o=>{const mesh=o as THREE.Mesh;if(!mesh.geometry)return
    const p=mesh.geometry.getAttribute('position'),uv=mesh.geometry.getAttribute('uv')
    for(let i=0;i<p.count;i++){const v=new THREE.Vector3().fromBufferAttribute(p,i).applyMatrix4(mesh.matrixWorld)
      if(Math.abs(v.x-112)<eps)seam.add(`${(mesh.material as THREE.Material).uuid}/${v.z.toFixed(4)}/${uv.getX(i).toFixed(4)}/${uv.getY(i).toFixed(4)}`)
    }
  })
  assert(seam.size>=4,'missing seam vertices');return [...seam].sort()
})
assert.deepEqual(seamUvs[0],seamUvs[1],'world UV jumps at streamed rug seam')

for (const tint of [22, 27, 28]) { const geo = new THREE.BoxGeometry(1, .1, 1); geo.translate(2, 0, 2); map.tint.fill(tint); const fallback = new THREE.MeshBasicMaterial({ vertexColors: true }); geo.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(geo.getAttribute('position').count*3).fill(.5), 3)); const group = new THREE.Group(); l5SurfaceBatches([geo], map, group, 'floor', fallback); assert.equal(group.children.length, 1); assert.equal((group.children[0] as THREE.Mesh).material, fallback); assert((group.children[0] as THREE.Mesh).geometry.getAttribute('color')) }
for (const tint of [21, 23, 24, 25, 26, 60, 61, 62, 63, 64, 65, 66, 67, 68]) { const geo = new THREE.BoxGeometry(1, .1, 1); geo.translate(2, 0, 2); map.tint.fill(tint); const group = new THREE.Group(); l5SurfaceBatches([geo], map, group, 'floor'); assert.equal(group.children.length, 1); const material = (group.children[0] as THREE.Mesh).material as THREE.Material; assert.notEqual(material, undefined); assert.equal((group.children[0] as THREE.Mesh).geometry.getAttribute('color'), undefined) }
assert.equal(l5Material('marble'),l5Material('marble'),'material cache should be stable')



for(const d of L5_DECOR_DEFS)inspect(buildL5Registered({kind:d.id,x:2,y:2,w:d.w,h:d.d,solid:d.solid,data:d.data}),d.id)


map.liquid[10*n+10]=1;map.liquid[10*n+11]=2
const pool=new THREE.Group();buildLiquidSurfaces(map,LEVELS[5],pool,{x0:10,y0:10,x1:12,y1:11})
assert.equal(pool.children.length,2,'deep and shallow pool surfaces must both exist')
for(const mesh of pool.children as THREE.Mesh[]){mesh.geometry.computeBoundingBox();assert(Math.abs(mesh.geometry.boundingBox!.min.y-.03)<1e-6);assert(mesh.userData.noCastShadow,'water must not cast an opaque pool shadow')}
// Both remodeled containers must have real moving interiors, and closed parts
// must stay inside their body rather than starting halfway outside it.
for(const[kind,count]of[['dresser',3],['cabinet',2]] as const){
  const g=buildL5Structure(structure(kind,{profile:'maintenance'}),3.3,map)!,moving:THREE.Object3D[]=[]
  g.traverse(o=>{if(o.userData.lid)moving.push(o)});assert.equal(moving.length,count)
  const closed=moving.map(o=>new THREE.Box3().setFromObject(o))
  assert(closed.every(b=>b.max.z<.35&&b.min.z>-.25),'closed drawers/doors must be seated')
  for(const o of moving){if(kind==='dresser')o.position.z=.17;else o.rotation.y=(o.userData.part==='doorL'?-1:1)*1.6;o.updateMatrix()}
  g.updateMatrixWorld(true);assert(moving.every(o=>new THREE.Box3().setFromObject(o).max.z>.40),'opened parts extend toward the player')
  inspect(g,kind)
}
// A door owns its frame. The surrounding portal only supplies a threshold.
const ds=structure('hoteldoor',{profile:'beverly'}),ps={...ds,kind:'ceilingbeam',data:{l5:1,profile:'portal',room:'beverly'}} as Structure
map.structures=[ds,ps]
assert.equal(buildL5Structure(ps,3.3,map)!.children.length,1,'double frame returns')
map.tiles.fill(2);map.tint.fill(63);map.tiles[10*n+10]=1;map.tiles[9*n+10]=1;map.tiles[11*n+10]=1
const reveals=new THREE.Group();for(const _ of buildL5Architecture(map,3.3,reveals,{x0:10,y0:10,x1:11,y1:11})){void _}
for(const o of reveals.children){const mesh=o as THREE.Mesh;mesh.geometry.computeBoundingBox();if(mesh.geometry.boundingBox!.min.y<2.5)assert.equal(o.name,'l5-ballroomPanel-millwork','decorative rails must not cross a door reveal')}
map.tiles.fill(1);map.structures=[]
// A decorative carpet must never bridge an actual stairwell opening.
map.elev[10*n+11]=4
const rug=buildL5Structure({...structure('rug',{rx:110,ry:210,rw:4,rh:2}),w:4,h:2},3.3,map)!
rug.position.set(12,0,11);rug.updateMatrixWorld(true)
const ray=new THREE.Raycaster(new THREE.Vector3(11.5,2,10.5),new THREE.Vector3(0,-1,0))
assert.equal(ray.intersectObject(rug,true).length,0,'rug covers the stairwell')
map.elev.fill(0)
// End plates close every curved pipe; straight links use one longitudinal segment.
const pipes=buildL5Structure(structure('piperack'),3.3,map)!
let tubes=0,caps=0;pipes.traverse(o=>{const type=(o as THREE.Mesh).geometry?.type;if(type==='TubeGeometry')tubes++;if(type==='CircleGeometry')caps++})
assert(tubes>0&&caps>=tubes*2,'pipe ends are open')
// Cached static models own independent buffers. Chunk disposal cannot corrupt a neighbour.
const a=buildL5Structure(structure('redpillar'),5.8,map)!,b=buildL5Structure(structure('redpillar'),5.8,map)!
const geos=(g:THREE.Group)=>{const out:THREE.BufferGeometry[]=[];g.traverse(o=>{if((o as THREE.Mesh).geometry)out.push((o as THREE.Mesh).geometry)});return out}
const ga=geos(a),gb=geos(b);assert.equal(ga.length,gb.length)
for(let i=0;i<ga.length;i++){assert.notEqual(ga[i],gb[i]);assert.deepEqual(ga[i].getAttribute('position').array,gb[i].getAttribute('position').array)}
ga.forEach(g=>g.dispose());inspect(b)
const kinds=['redpillar','planter','chandelier']
const measure=(cached:boolean)=>{const times:number[]=[];for(let i=0;i<12;i++){
  const t=performance.now();for(const kind of kinds){const g=(cached?buildL5Structure:buildL5StructureUncached)(structure(kind),5.8,map)!;geos(g).forEach(geo=>geo.dispose())}times.push(performance.now()-t)
}return times.sort((a,b)=>a-b)[6]}
measure(false);measure(true)
console.log(`Repeated column/palm/chandelier construction median: uncached ${measure(false).toFixed(2)} ms, cached ${measure(true).toFixed(2)} ms`)
console.log('L5 meshes passed: 25 registered models, water, animated interiors, single frames, cut rugs, capped pipes and independent cached buffers')

