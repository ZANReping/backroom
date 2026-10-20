import assert from 'node:assert/strict'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { gunzipSync } from 'node:zlib'
import * as THREE from 'three'
import {createCanvas} from '@napi-rs/canvas'
import { L1 } from '../src/game/levels/l1'
import { buildStructure } from '../src/game/renderer/structures'
import { syncFurnitureSeats } from '../src/game/renderer/furnitureSeats'
import { seatsFor } from '../src/game/world/seating'
import { buildL1Data } from '../src/game/world/l1Building'
import { l1FindReference } from '../src/game/world/l1Spatial'
import { L1_BAKE_REVISION } from '../src/game/world/l1BakeTypes'
import {l1PlanRooms} from '../src/game/world/l1Plan'
import {genL1ChunkRaw} from '../src/game/world/infiniteL1'

let checks = 0
const check = (v: unknown, msg: string) => { checks++; assert(v, msg) }
Object.defineProperty(globalThis,'document',{value:{createElement:()=>createCanvas(128,128),createElementNS:()=>({})}})
const map: any = { w:32,h:32,inf: { ox: 0, oy: 0,chunks:new Map() }, tiles: new Uint8Array(1024).fill(1),structures:[],lights:[] }
for(const name of ['elev','wet','step','stair','tint','outdoor','ceiling','crawl','liquid','seaFloor','dn','dnWall','up','upWall','up2','upWall2'])map[name]=new Uint8Array(1024)
const structure = (deg: number): any => ({ kind: 'barberchair', x: 0, y: 0, w: 1, h: 1, solid: false, data: { deg } })
const roots: THREE.Object3D[] = []
for (const deg of [0, 90, 180, 270]) {
  const a = buildStructure(structure(deg), L1, map, 3) as THREE.Group
  const b = buildStructure(structure(deg), L1, map, 3) as THREE.Group
  check(!!a && !!b, `barberchair build ${deg}`); roots.push(a, b)
  const geos = (g: THREE.Object3D) => { const out = new Set<THREE.BufferGeometry>(); g.traverse(o => { const m = o as THREE.Mesh; if (m.geometry) out.add(m.geometry) }); return out }
  const mats = (g: THREE.Object3D) => { const out = new Set<THREE.Material>(); g.traverse(o => { const m = o as THREE.Mesh; if (m.material) for (const x of Array.isArray(m.material) ? m.material : [m.material]) out.add(x) }); return out }
  const ga = geos(a), gb = geos(b), ma = mats(a), mb = mats(b)
  check([...ga].every(x => !gb.has(x)) && [...ma].every(x => !mb.has(x)), `barberchair ${deg} instances independent`)
  let tris = 0, finite = true, minY = Infinity, maxY = -Infinity
  a.updateMatrixWorld(true)
  a.traverse(o => { const m = o as THREE.Mesh; if (!m.geometry) return; const p = m.geometry.getAttribute('position'); tris += (m.geometry.index?.count??p.count) / 3; for(const key of ['position','normal','uv'])for (const n of m.geometry.getAttribute(key).array) finite &&= Number.isFinite(n); const box = new THREE.Box3().setFromObject(m); minY = Math.min(minY, box.min.y); maxY = Math.max(maxY, box.max.y) })
  check(finite && tris <= 1200 && minY >= -.0001 && maxY - minY >= 1.2 && maxY - minY <= 1.6, `barberchair ${deg} geometry budget and bounds`)
  let releasedB = 0; for (const x of [...gb, ...mb]) x.addEventListener('dispose', () => releasedB++)
  for (const x of [...ga,...ma]) x.dispose(); check(releasedB === 0, `barberchair ${deg} release isolation`)
  const s = structure(deg); syncFurnitureSeats(s, b, 0, 1); const seat = seatsFor(s, map, 1)[0]
  const yaw=deg*Math.PI/180
  check(Math.abs(seat.z - .5125) < .0001 && Math.abs(seat.x - (.5+Math.sin(yaw)*.02)) < .0001 && Math.abs(seat.y - (.5+Math.cos(yaw)*.02)) < .0001, `barberchair ${deg} synced seat surface`)
  check(Math.abs(Math.atan2(Math.sin(seat.yaw-yaw),Math.cos(seat.yaw-yaw))) < .0001, `barberchair ${deg} forward direction`)
  for (const x of [...gb,...mb]) x.dispose();check(releasedB===gb.size+mb.size,`barberchair ${deg} resources all retired`)
}
for(const seed of [1,42,20261006])for(const room of l1PlanRooms(seed,-500,-500,500,500).filter(r=>r.type==='sickbay'&&((r.x0*73856093^r.y0*19349663)>>>0)%2===0).slice(0,8)){
 const raw=genL1ChunkRaw(L1,seed,Math.floor((room.x0+room.x1)/64),Math.floor((room.y0+room.y1)/64)),props=raw.structures.filter(s=>s.data?.l1Room===room.id)
 for(const chair of props.filter(s=>s.kind==='barberchair')){
  const a=Number(chair.data?.deg??0)*Math.PI/180
  check((room.door.x-chair.x)*Math.sin(a)+(room.door.y-chair.y)*Math.cos(a)>0,'barber chairs face the actual doorway '+JSON.stringify({seed,room,chair}))
  for(const table of props.filter(s=>s.kind==='table'))check(!(chair.x-.15<table.x+table.w&&chair.x+chair.w+.15>table.x&&chair.y-.15<table.y+table.h&&chair.y+chair.h+.15>table.y),'room table clears the hydraulic chair row '+JSON.stringify({seed,room,chair,table}))
 }
}
const ref = l1FindReference(20261006, 'ouroboros', 2400)!; check(!!ref, 'ouroboros reference exists')
const fingerprints: string[] = []; let litter = 0, boards = 0
for (let cy = Math.floor(ref.centerY / 32) - 1; cy <= Math.floor(ref.centerY / 32) + 1; cy++) for (let cx = Math.floor(ref.centerX / 32) - 1; cx <= Math.floor(ref.centerX / 32) + 1; cx++) {
  const d = buildL1Data(20261006, cx, cy), again = buildL1Data(20261006, cx, cy); fingerprints.push(d.fingerprint); check(d.fingerprint === again.fingerprint, `ouroboros fingerprint stable ${cx},${cy}`); const ls = d.boxes.filter(b => b.id.startsWith('our-litter:')), bs = d.boxes.filter(b => b.id.startsWith('our-board:')); check(ls.length <= 46, `litter cap ${cx},${cy}`); for (const b of [...ls, ...bs]) check(b.detail === true && b.occlude === false && b.solid === false, `${b.id} detail flags`); litter += ls.length; boards += bs.length
}
check(boards > 0, 'ouroboros board decorations present')
const manifest = JSON.parse(readFileSync('public/assets/l1-bakes/manifest.json', 'utf8')); check(manifest.bakeRevision >= 14, 'bake revision >= 14')
const gardenRef=l1FindReference(20261006,'garden',2400)!,garden=manifest.chunks.find((x:any)=>x.quality==='high'&&x.cx===Math.floor(gardenRef.centerX/32)&&x.cy===Math.floor(gardenRef.centerY/32))
check(!!garden,'actual garden high bake present')
const raw=JSON.parse(gunzipSync(readFileSync(`public/assets/l1-bakes/${garden.file}`)).toString('utf8'))
check(raw.bakeRevision===L1_BAKE_REVISION,'published garden uses the current baked geometry')
const floats=(v:any)=>{check(v.type==='Float32Array','float32 baked attribute');const b=Buffer.from(v.base64,'base64');return new Float32Array(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength))}
let groundLeafVertices=0
for(const m of raw.meshes)if(m.style==='garden'&&m.surface==='leaf'){
 const p=floats(m.position),n=floats(m.normal)
 for(let i=0;i<p.length;i+=12){
  if(Math.max(p[i+1],p[i+4],p[i+7],p[i+10])>=.1)continue
  for(let j=0;j<4;j++){check(p[i+j*3+1]>=0&&n[i+j*3+1]>.9,'D moss cards are above the ground and nearly horizontal');groundLeafVertices++}
 }
}
check(groundLeafVertices>=100,'active baked renderer contains the dense low moss carpet')
mkdirSync('reports/l1v2-import/checks', { recursive: true }); const report = { checks, bakeRevision: L1_BAKE_REVISION, manifestBakeRevision: manifest.bakeRevision, ouroboros: { litter, boards },groundLeafVertices, status: 'passed' }; writeFileSync('reports/l1v2-import/checks/l1-d-import.json', JSON.stringify(report, null, 2) + '\n'); console.log(JSON.stringify(report))
