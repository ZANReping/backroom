import * as THREE from 'three'

const bytes = a => Array.from(new Uint8Array(a.buffer, a.byteOffset, a.byteLength))
const serialize = root => {
  root.updateMatrixWorld(true)
  const materials = [], materialIndex = new Map()
  const material = m => { if (!materialIndex.has(m)) { materialIndex.set(m, materials.length); materials.push({ type:m.type, color:m.color?.toArray?.(), emissive:m.emissive?.toArray?.(), opacity:m.opacity, transparent:m.transparent, side:m.side, roughness:m.roughness, metalness:m.metalness, visible:m.visible, vertexColors:m.vertexColors, depthTest:m.depthTest, depthWrite:m.depthWrite, alphaTest:m.alphaTest, blending:m.blending, onBeforeCompile:m.onBeforeCompile.toString(), customProgramCacheKey:m.customProgramCacheKey(), textures:Object.fromEntries(Object.keys(m).filter(k=>m[k]?.isTexture).sort().map(k=>{const t=m[k],d=t.source?.data;return [k,{src:d?.src,width:d?.width,height:d?.height,colorSpace:t.colorSpace,format:t.format,type:t.type,wrapS:t.wrapS,wrapT:t.wrapT,repeat:t.repeat.toArray(),offset:t.offset.toArray()}]})) }) } return materialIndex.get(m) }
  const nodes = []
  root.traverse(o => {
    const g=o.geometry, ms=Array.isArray(o.material)?o.material:o.material?[o.material]:[]
    const data=g?{type:g.type,attrs:Object.keys(g.attributes).sort().map(name=>{const a=g.attributes[name];return {name,itemSize:a.itemSize,normalized:a.normalized,count:a.count,ctor:a.array.constructor.name,data:bytes(a.array)}}),index:g.index?{count:g.index.count,ctor:g.index.array.constructor.name,data:bytes(g.index.array)}:null,groups:g.groups.map(x=>({...x})),drawRange:{...g.drawRange}}:null
    nodes.push({type:o.type,name:o.name,local:o.matrix.toArray(),children:o.children.length,materials:ms.map(material),geometry:data,instance:o.isInstancedMesh?{count:o.count,data:bytes(o.instanceMatrix.array)}:null})
  })
  return {nodes,materials}
}
const dispose = root => root.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.isInstancedMesh) o.dispose() })
const raf = () => new Promise(resolve => requestAnimationFrame(resolve))

export async function verifyInfiniteTerrainJob() {
  const [{ ALL_LEVEL_DEFS }, geom, shared] = await Promise.all([import('/src/game/levels/index.ts'), import('/src/game/renderer/geometry.ts'), import('/src/game/renderer/shared.ts')])
  const { buildTerrain, buildTerrainJob } = geom, { WALL_H, setMaterialMode, getMaterialMode } = shared
  const {l1Profile}=await import('/src/game/world/l1Architecture.ts'),{l3Height}=await import('/src/game/world/l3Architecture.ts')
  const { engine:e } = perfQA, rows=[], modes=['classic','realistic'], levels=[0,1,2,3,5,6,7,9,10], checks=[]
  const assert=(ok,label)=>{if(!ok)throw new Error(label);checks.push(label)}
  const oldMode=getMaterialMode()
  try {
    for (const mode of modes) { setMaterialMode(mode)
      for (const id of levels) {
        const def=ALL_LEVEL_DEFS.find(d=>d.id===id); e.newRun(424242,'normal'); e.loadLevel(id,{mapSeed:424242,firstVisit:false}); const m=e.map, inf=m?.inf
        assert(!!def&&!!m&&inf?.chunks?.size>=2,`${mode} L${id}: loaded infinite chunks exist`)
        const distance=c=>(c.cx*32-inf.ox+16-e.player.x)**2+(c.cy*32-inf.oy+16-e.player.y)**2
        const chunks=[...inf.chunks.values()].sort((a,b)=>distance(a)-distance(b)).slice(0,2)
        for (const c of chunks) {
          const range={x0:c.cx*32-inf.ox,y0:c.cy*32-inf.oy,x1:c.cx*32-inf.ox+32,y1:c.cy*32-inf.oy+4,variant:c.variant}
          const height=id===1?l1Profile(c.variant).height:id===3?l3Height(c.variant):WALL_H[def.gen]??3
          const sync=new THREE.Group(), jobRoot=new THREE.Group(), it=buildTerrainJob(m,def,height,jobRoot,range)
          try {
            buildTerrain(m,def,height,sync,range)
            let yields=0,step=it.next();while(!step.done){yields++;if(yields%16===0)await raf();step=it.next()}
            const a=serialize(sync),b=serialize(jobRoot);assert(JSON.stringify(a)===JSON.stringify(b),`${mode} L${id} ${c.key} terrain matches`);assert(yields>0,`${mode} L${id} ${c.key} job yielded`)
            rows.push({mode,level:id,chunk:c.key,yields,meshes:a.nodes.filter(n=>n.geometry).length})
          } finally {it.return();dispose(sync);dispose(jobRoot)}
        }
      }
    }
  } finally { setMaterialMode(oldMode) }
  return {passed:checks.length,checks,rows}
}
