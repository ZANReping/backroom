import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { mkdir, writeFile } from 'node:fs/promises'
import * as THREE from 'three'
import { loadImage } from '@napi-rs/canvas'
import { l11FoliageGeometry,l11FoliageCacheInfo } from '../src/game/renderer/l11FoliageGeometry'
import { CityBatch } from '../src/game/renderer/l11Batch'
import { l11PropParts } from '../src/game/content/l11PropParts'

const appRoot=path.resolve(fileURLToPath(new URL('..',import.meta.url)))
const read=(file:string)=>JSON.parse(fs.readFileSync(path.join(appRoot,file),'utf8'))
const local=(file:string)=>file.replace(/^app[\\/]/,'')
const md5=(file:string)=>crypto.createHash('md5').update(fs.readFileSync(path.join(appRoot,local(file)))).digest('hex')
const report={assetFiles:0,geometries:0,treeParts:0,foliageParts:0,cacheHits:0,checks:[] as string[]}

// Bark manifest and the saved Poly Haven files metadata must remain byte-for-byte auditable.
const manifest=read('assets/l11-bark/manifest.json')
const source=read('assets/l11-foliage/files.json')
assert.equal(manifest.files.length,6)
for(const item of manifest.files){
  assert.ok(['branch_diff','branch_nor_gl','branch_rough'].includes(item.sourceKey),item.sourceKey)
  const filename=`tree_small_02_${item.sourceKey}_${item.size}.jpg`
  const sourceItem=source[item.sourceKey]?.[item.size]?.jpg
  assert.ok(sourceItem,filename)
  assert.equal(item.expectedMd5,sourceItem.md5,`${filename} metadata MD5`)
  assert.equal(item.sourceUrl,sourceItem.url,`${filename} source URL`)
  assert.equal(item.actualMd5,item.expectedMd5,`${filename} expected/actual hash`)
  assert.equal(item.bytes,sourceItem.size,`${filename} metadata bytes`)
  assert.equal(item.actualMd5,md5(item.originalPath),`${filename} original MD5`)
  assert.equal(item.actualMd5,md5(item.runtimePath),`${filename} runtime MD5`)
  const dimensions=item.size==='1k'?1024:2048
  assert.deepEqual([item.width,item.height],[dimensions,dimensions],`${filename} dimensions`)
  const image=await loadImage(path.join(appRoot,local(item.runtimePath)))
  assert.deepEqual([image.width,image.height],[dimensions,dimensions],`${filename} decoded dimensions`)
  report.assetFiles++
}
report.checks.push('six bark files match source metadata, original bytes, runtime copies, and tier dimensions')

const dims:[number,number,number][]=[ [3.65,2.65,3.15],[3.7,.92,1.81],[3.8,1.16,5.1],[3.32,1.16,41] ]
for(const [w,h,d] of dims)for(const density of [1,.65,.3,.12]){
  const a=l11FoliageGeometry(w,h,d,density,'trimmed'),b=l11FoliageGeometry(w,h,d,density,'trimmed')
  assert.strictEqual(a,b,`geometry cache ${w}/${h}/${d}/${density}`);report.cacheHits++
  const pos=a.getAttribute('position'),uv=a.getAttribute('uv'),box=new THREE.Box3().setFromBufferAttribute(pos)
  for(let i=0;i<pos.count;i++)for(const value of [pos.getX(i),pos.getY(i),pos.getZ(i)])assert.ok(Number.isFinite(value),'foliage position finite')
  for(let i=0;i<uv.count;i++){assert.ok(uv.getX(i)>=.048-1e-6&&uv.getX(i)<=.188+1e-6,'foliage U island');assert.ok(uv.getY(i)>=.855-1e-6&&uv.getY(i)<=.948+1e-6,'foliage V island')}
  const actual=[box.max.x-box.min.x,box.max.y-box.min.y,box.max.z-box.min.z]
  for(const [axis,value] of actual.entries()){assert.ok(value<=([w,h,d][axis]+.01),`foliage ${axis} exceeds declared extent`);assert.ok(value>=[w,h,d][axis]*.7,`foliage ${axis} underfills declared extent`)}
  report.geometries++
}
report.checks.push('trimmed foliage geometry has finite positions, bounded extents, UV island coverage, and stable caching')

// Exploring new lots must not retain every distinct hedge length forever.
// Also exercise a consumer: evicting a source must leave its merged mesh intact.
const cachedSource=l11FoliageGeometry(1.1,.7,.9,1,'trimmed'),sourcePositions=Array.from(cachedSource.getAttribute('position').array)
let evicted=false;cachedSource.addEventListener('dispose',()=>{evicted=true})
const batch=new CityBatch(),merged=new THREE.Group(),material=new THREE.MeshBasicMaterial()
batch.geometry(material,cachedSource,new THREE.Matrix4());batch.finish(merged)
for(let i=0;i<120;i++)l11FoliageGeometry(1+i*.001,.6,.8,.12,'trimmed')
assert(evicted,'unused foliage source is evicted on entry pressure')
assert(l11FoliageCacheInfo().entries<=96,'foliage cache entry bound')
for(let i=0;i<16;i++)l11FoliageGeometry(6,2,40+i,.65,'trimmed')
assert(l11FoliageCacheInfo().bytes<=32*1024*1024,'foliage cache byte bound')
const regenerated=l11FoliageGeometry(1.1,.7,.9,1,'trimmed')
assert.notStrictEqual(regenerated,cachedSource,'evicted source rebuilt')
assert.deepEqual(Array.from(regenerated.getAttribute('position').array),sourcePositions,'eviction preserves deterministic shape')
assert.deepEqual(Array.from((merged.children[0] as THREE.Mesh).geometry.getAttribute('position').array),sourcePositions,'existing merged scene geometry survives source eviction')
;(merged.children[0] as THREE.Mesh).geometry.dispose();material.dispose()
report.checks.push('source cache stays within 96 entries / 32 MiB, evicts unused geometry, regenerates deterministically and preserves merged scene meshes')

const tree=l11PropParts('l11_plane_tree')
const bark=tree.filter(p=>p.surface==='bark')
const barkCylinders=bark.filter(p=>p.shape==='cylinder')
const barkNodes=bark.filter(p=>p.shape==='sphere')
assert.ok(barkCylinders.length>0);assert.ok(barkCylinders.every(p=>p.taper!==undefined&&p.taper>0&&p.taper<1),'tree bark cylinder taper')
assert.ok(barkNodes.length>0&&barkNodes.every(p=>p.solid&&[p.x,p.y,p.z,p.w,p.h,p.d].every(Number.isFinite)&&p.w>0&&p.h>0&&p.d>0),'tree bark junction nodes')
assert.ok(bark.some(p=>p.solid&&p.y-p.h/2<1.8&&p.y+p.h/2>0),'tree retains solid low trunk')
const treeLeaves=tree.filter(p=>p.surface==='grass')
assert.ok(treeLeaves.length>0&&treeLeaves.every(p=>p.foliage==='trimmed'&&p.solid===false),'tree leaves trimmed/non-solid')
report.treeParts=tree.length;report.foliageParts+=treeLeaves.length
const shrubs=l11PropParts('l11_shrub_planter'),shrubLeaves=shrubs.filter(p=>p.surface==='grass')
assert.ok(shrubLeaves.length>0&&shrubLeaves.every(p=>p.foliage==='trimmed'&&p.solid===false),'shrub leaves non-solid')
report.foliageParts+=shrubLeaves.length
report.checks.push(`plane tree: ${barkCylinders.length} tapered bark cylinders, ${barkNodes.length} solid junction nodes, ${treeLeaves.length} trimmed leaf clusters; shrub planter: ${shrubLeaves.length} non-solid clusters`)

const output='reports/l11-reference/greenery-check.json'
await mkdir(path.dirname(path.join(appRoot,output)),{recursive:true})
await writeFile(path.join(appRoot,output),JSON.stringify(report,null,2)+'\n')
console.log(JSON.stringify(report,null,2))
