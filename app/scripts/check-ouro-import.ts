import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs'
import * as THREE from 'three'
import {createCanvas} from '@napi-rs/canvas'
import {buildL1Data} from '../src/game/world/l1Building'
import {l1OuroDressing} from '../src/game/world/l1Dressing'
import {L1_BAKE_REVISION} from '../src/game/world/l1BakeTypes'
import {l1Material,l1Texture} from '../src/game/renderer/l1Materials'
import {setMaterialMode} from '../src/game/renderer/shared'
import {buildL1EmitterMeshes} from '../src/game/renderer/l1BakedScene'
import {buildL1Prop} from '../src/game/renderer/l1Props'
import {l1ReferenceAt,L1_GENERATION_VERSION} from '../src/game/world/l1Spatial'

let checks=0
const ok=(v:unknown,msg:string)=>{checks++;assert(v,msg)}
Object.defineProperty(globalThis,'document',{value:{createElement:()=>createCanvas(256,256),createElementNS:()=>({})}})
const h=(v:unknown)=>createHash('sha256').update(JSON.stringify(v)).digest('hex')
const baseline=JSON.parse(readFileSync('reports/ouro-import-20261021/layout-baseline.json','utf8')) as any[]
const shape=(d:any)=>({id:d.id,min:d.min,max:d.max,shape:d.shape,axis:d.axis})
for(const row of baseline){
  const a=buildL1Data(row.seed,row.cx,row.cy,row.force)
  const again=buildL1Data(row.seed,row.cx,row.cy,row.force)
  if(row.force&&row.force!=='ouroboros')ok(a.fingerprint===row.fingerprint,'non-ouro geometry unchanged: '+row.force)
  if(row.force==='ouroboros')ok(a.fingerprint!==row.fingerprint,'ouro model and light fingerprint updated')
  ok(a.fingerprint===again.fingerprint,`deterministic fingerprint ${row.seed}/${row.cx}/${row.cy}/${row.force??'default'}`)
  ok(h([...a.floor])===row.floor&&h([...a.styles])===row.styles&&h(a.openings)===row.openings&&h(a.boxes.filter(b=>b.solid).map(shape))===row.solid,`layout baseline ${row.seed}/${row.cx}/${row.cy}/${row.force??'default'}`)
}
const samples=[7,42,20261006].flatMap(seed=>[[0,0],[-3,2],[4,-5],[-12,-10]].map(([cx,cy])=>({seed,cx,cy})))
for(const s of samples){const a=buildL1Data(s.seed,s.cx,s.cy),o=buildL1Data(s.seed,s.cx,s.cy,'ouroboros');const expected=baseline.find(r=>r.seed===s.seed&&r.cx===s.cx&&r.cy===s.cy&&!r.force),forced=baseline.find(r=>r.seed===s.seed&&r.cx===s.cx&&r.cy===s.cy&&r.force==='ouroboros');ok((a.fingerprint!==o.fingerprint)===(expected.fingerprint!==forced.fingerprint),`ouroboros fingerprint transition ${s.seed}/${s.cx}/${s.cy}`)}

let columnKinds=new Set<string>(), ductKinds=new Set<string>(), lamps=0
for(const s of samples){const a=buildL1Data(s.seed,s.cx,s.cy,'ouroboros')
  for(const b of a.boxes){for(const n of [...b.min,...b.max])ok(Number.isFinite(n),`finite box ${b.id}`);ok(b.max[0]>b.min[0]&&b.max[1]>b.min[1]&&b.max[2]>b.min[2],`positive box ${b.id}`)
    if(b.id.startsWith('column:'))columnKinds.add(b.surface)
    if(b.surface==='whitePipe'||b.surface==='cable'||b.surface==='red')ductKinds.add(b.surface)
  }
  for(const e of a.emitters){for(const n of [...e.position,...e.normal,...e.tangent])ok(Number.isFinite(n),`finite emitter ${e.id}`);ok(e.width>0&&e.height>0&&e.power>=0,`positive emitter ${e.id}`);if(e.style==='ouroboros'&&e.kind==='panel'){ok(e.backEmission===0&&e.width===2.6&&e.power<=(s.seed===20261006&&l1ReferenceAt(s.seed,e.position[0],e.position[2])?.id==='ouroboros'?1.7:1.1),`ouro panel contract ${e.id}`);lamps++}}
}
ok(columnKinds.has('column')&&columnKinds.has('peeling')&&columnKinds.has('whitePipe'),'column finish categories present')
ok(ductKinds.has('whitePipe')&&ductKinds.has('red'),'rectangular duct, red pipe, and beam materials present')
ok(lamps>0,'ouro emitters present')

for(const s of samples){const a=buildL1Data(s.seed,s.cx,s.cy,'ouroboros'),b=l1OuroDressing(a),again=l1OuroDressing(a),columns=a.boxes.filter(x=>x.id.startsWith('column:')&&x.solid);ok(JSON.stringify(b)===JSON.stringify(again),`dressing deterministic ${s.seed}/${s.cx}/${s.cy}`);ok(b.every(x=>x.data?.l1HallDressing===1&&x.kind==='pillar'),'dressing is anchored pillar candidates');ok(b.filter(x=>x.data?.l1Prop==='grate').length<=columns.length&&b.filter(x=>x.data?.l1Prop==='matpile').length<=columns.length,'dressing count bounded by columns')}

for(const mode of ['classic','realistic'] as const){
 setMaterialMode(mode)
 for(const surface of ['wall','peeling','whitePipe','floor','ceiling'] as const){
  const m=l1Material('ouroboros',surface) as THREE.MeshStandardMaterial
  ok((m.userData.l1ExtraTextures?.length??0)===0,`no extra atlas samplers ${mode}/${surface}`)
  ok(m.normalMap===l1Texture('l11_concrete_normal.jpg',true),`shared concrete normal ${mode}/${surface}`)
  const lib=THREE.ShaderLib[mode==='classic'?'lambert':'standard'],shader:any={uniforms:THREE.UniformsUtils.clone(lib.uniforms),fragmentShader:lib.fragmentShader,vertexShader:lib.vertexShader}
  m.onBeforeCompile(shader,{} as any)
  ok(shader.fragmentShader.includes('void main()'),'complete material hook retained')
  if(surface==='wall'||surface==='peeling'){
   ok(shader.fragmentShader.includes('vec4 ouroTex(')&&shader.fragmentShader.includes('textureGrad(map,'),`atlas function installed ${mode}/${surface}`)
   ok(!shader.fragmentShader.includes('#include <map_fragment>'),`atlas map section replaced ${mode}/${surface}`)
   ok(!Object.keys(shader.uniforms).some(k=>k.startsWith('ouro')),`base map sampler only ${mode}/${surface}`)
   ok(m.map===l1Texture('l1/ouro/'+(surface==='wall'?'wallatlas':'colatlas')+'.jpg'),'correct shared colour atlas')
  }
 }
 const spray=l1Material('ouroboros','whitePipe') as THREE.MeshStandardMaterial;ok(Math.abs(spray.normalScale.x-.3)<1e-6&&Math.abs(spray.normalScale.y-.3)<1e-6,'spray normal scale')
}
for(const mode of ['classic','realistic'] as const){setMaterialMode(mode);const a=buildL1Data(20261006,0,0,'ouroboros'),g1=new THREE.Group(),g2=new THREE.Group(),f1:any[]=[],f2:any[]=[];buildL1EmitterMeshes(a,0,0,g1,[],f1);buildL1EmitterMeshes(a,0,0,g2,[],f2);const geos=(g:THREE.Group)=>{const s=new Set<THREE.BufferGeometry>();g.traverse(o=>{const m=o as THREE.Mesh;if(m.geometry)s.add(m.geometry)});return s};const ga=geos(g1),gb=geos(g2);ok([...ga].every(x=>!gb.has(x)),`emitter geometries independent ${mode}`);let disposed=0;for(const x of gb)x.addEventListener('dispose',()=>disposed++);for(const x of ga)x.dispose();ok(disposed===0,`emitter release isolation ${mode}`);for(const x of gb)x.dispose();ok(disposed===gb.size,`emitter release complete ${mode}`);for(const o of [...g1.children,...g2.children]){const m=o as THREE.Mesh;for(const n of (m.geometry.getAttribute('position').array as any))ok(Number.isFinite(n),'finite emitter mesh position');for(const mat of (Array.isArray(m.material)?m.material:[m.material]))mat.dispose()}
}

for(const mode of ['classic','realistic'] as const){setMaterialMode(mode);for(const kind of ['grate','matpile'] as const){const a=buildL1Prop({kind:'pillar',x:0,y:0,w:1,h:1,solid:true,data:{l1Prop:kind,deg:0}} as any)!;const b=buildL1Prop({kind:'pillar',x:2,y:2,w:1,h:1,solid:true,data:{l1Prop:kind,deg:90}} as any)!;const geos=(g:THREE.Group)=>{const s=new Set<THREE.BufferGeometry>();g.traverse(o=>{const m=o as THREE.Mesh;if(m.geometry)s.add(m.geometry)});return s};const mats=(g:THREE.Group)=>{const s=new Set<THREE.Material>();g.traverse(o=>{const m=o as THREE.Mesh;if(m.material)for(const x of (Array.isArray(m.material)?m.material:[m.material]))s.add(x)});return s};const ga=geos(a),gb=geos(b),ma=mats(a),mb=mats(b);const ta=[...ma].map(m=>(m as THREE.MeshStandardMaterial).map).filter(Boolean),tb=[...mb].map(m=>(m as THREE.MeshStandardMaterial).map).filter(Boolean);ok(ta.length>0&&ta.every(t=>tb.includes(t)), 'prop textures shared');ok([...ga].every(x=>!gb.has(x))&&[...ma].every(x=>!mb.has(x)),`prop instances independent ${mode}/${kind}`);let d=0;for(const x of [...gb,...mb])x.addEventListener('dispose',()=>d++);for(const x of [...ga,...ma])x.dispose();ok(d===0,`prop release isolation ${mode}/${kind}`);for(const x of [...gb,...mb])x.dispose();ok(d===gb.size+mb.size,`prop release complete ${mode}/${kind}`);let tris=0;a.traverse(o=>{const m=o as THREE.Mesh;if(m.geometry){tris+=(m.geometry.index?.count??m.geometry.getAttribute('position').count)/3;for(const key of ['position','normal','uv']){const at=m.geometry.getAttribute(key);if(at)for(const x of at.array)ok(Number.isFinite(x),`finite prop ${kind}/${key}`)}}});ok(tris<=6000&&a.children.length<=5,`prop budget ${mode}/${kind}`)}}

ok(L1_GENERATION_VERSION===6&&L1_BAKE_REVISION===19,'generation6 bake19')
const report={checks,baselineSamples:baseline.length,layoutSamples:samples.length,generation:L1_GENERATION_VERSION,bakeRevision:L1_BAKE_REVISION,status:'passed'}
mkdirSync('reports/ouro-import-20261021',{recursive:true});writeFileSync('reports/ouro-import-20261021/static.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report))
