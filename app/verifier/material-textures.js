import * as THREE from 'three'
import { getMaterialMode, setMaterialMode } from '/src/game/renderer/shared.ts'

export async function verifyMaterialTextures() {
  const files=['l1Materials','l2Materials','l3Materials','l4Materials','settlementMeshes']
  const current=await Promise.all(files.map(f=>import(`/src/game/renderer/${f}.ts`)))
  const baseline=await Promise.all(files.map(f=>import(`/.check/lazy-material-baseline/${f}.ts`)))
  const oldMode=getMaterialMode(),load=THREE.TextureLoader.prototype.load,requests=[],groups=[],rows=[]
  let phase='',checks=0
  const assert=(ok,message)=>{if(!ok)throw new Error(message);checks++}
  THREE.TextureLoader.prototype.load=function(url,...args){requests.push({phase,url});return load.call(this,url,...args)}
  const build=modules=>{
    const result=[]
    const add=(label,material)=>result.push({label,material})
    for(const v of ['parking','storage','gothic','ouroboros','garden','aisle','maintenance'])for(const s of ['wall','floor','ceiling','concrete','metal','red','cable','peeling','leaf','ground','wet','line'])add(`l1/${v}/${s}`,modules[0].l1Material(v,s))
    for(const v of ['dirty','warped','dim','tidy','narrow'])for(const s of ['wall','floor','ceiling','insulation','steel','rust','brick','black','red','wet'])add(`l2/${v}/${s}`,modules[1].l2Material(v,s))
    for(const v of ['assembly','boiler','lit','sanct','default'])for(const s of ['brick','wall','floor','ceiling','paint','blackpaint','iron','black','bronze','marble','green'])add(`l3/${v}/${s}`,modules[2].l3Material(v,s))
    for(const v of ['officehall','windowview','open'])for(const s of ['floor','wall','ceiling','fabric','frame','edge','trim','desk','chair','door','facade','tile'])add(`l4/${v}/${s}`,modules[3].l4Material(s,v))
    const materials=['wood','concrete','plaster','metal','fabric','tile','ceiling','glass']
    const m={w:2,h:2,tiles:new Uint8Array(4).fill(1),settlement:{heights:new Float32Array(4).fill(3),roomIndex:new Int16Array(4).fill(-1),roofIndex:new Int16Array(4),blueprint:{id:'qa',rooms:[],shells:[{x:0,y:0,w:2,h:2,height:3,roof:'domestic'}],partitions:materials.map((material,i)=>({material,x:i,y:0,w:.1,h:1,height:2})),corridors:[],circulation:[],services:[]}}}
    const group=new THREE.Group();modules[4].buildSettlementTerrain(m,group);groups.push(group)
    group.traverse(o=>{if(o.material)add(`settlement/${result.length}`,o.material)})
    return result
  }
  const normalize=value=>{
    if(value?.isTexture)return {texture:value.uuid}
    if(value?.isColor)return [value.r,value.g,value.b]
    if(value?.toArray)return value.toArray()
    if(Array.isArray(value))return value.map(normalize)
    if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>[k,normalize(v)]))
    if(typeof value==='function')return value.toString()
    return value
  }
  const state=material=>JSON.stringify(Object.fromEntries(Object.entries(material).filter(([k])=>!['id','uuid','version','_listeners'].includes(k)).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>[k,normalize(v)])))
  const disposeGroup=group=>{
    const geometries=new Set(),materials=new Set()
    group.traverse(o=>{if(o.geometry)geometries.add(o.geometry);if(o.material)materials.add(o.material);if(o.isInstancedMesh)o.dispose()})
    for(const g of geometries)g.dispose();for(const m of materials)m.dispose()
  }
  const three=new THREE.WebGLRenderer({antialias:false}),scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(45,1,.1,10),target=new THREE.WebGLRenderTarget(128,128)
  const geometry=new THREE.BoxGeometry(1,1,1),mesh=new THREE.Mesh(geometry)
  scene.add(mesh,new THREE.AmbientLight('#ffffff',.7));const light=new THREE.PointLight('#ffeedb',12);light.position.set(1,2,2);scene.add(light)
  camera.position.set(1,.6,1.7);camera.lookAt(0,0,0);three.setRenderTarget(target)
  const draw=material=>{mesh.material=material;three.render(scene,camera);const pixels=new Uint8Array(128*128*4);three.readRenderTargetPixels(target,0,0,128,128,pixels);return pixels}
  try {
    phase='current-classic';setMaterialMode('classic');const classic=build(current)
    assert(requests.length>0,'Classic coverage must request actual color/normal textures')
    assert(!requests.some(r=>/rough/i.test(r.url)),'Classic factories must not create any roughness textures')
    phase='current-realistic';setMaterialMode('realistic');const realistic=build(current)
    assert(requests.some(r=>r.phase===phase&&/rough/i.test(r.url)),'Switching to realistic creates required roughness images')
    const textures=new Set()
    for(const {material} of [...classic,...realistic])for(const value of Object.values(material))if(value?.isTexture)textures.add(value)
    const start=performance.now()
    while([...textures].some(t=>!t.userData.loadedImage)&&performance.now()-start<20000)await new Promise(requestAnimationFrame)
    assert([...textures].every(t=>t.userData.loadedImage),'Material images finish loading')
    for(const [mode,actual] of [['classic',classic],['realistic',realistic]]) {
      phase='baseline-'+mode;setMaterialMode(mode);const expected=build(baseline)
      assert(actual.length===expected.length,mode+': material count unchanged')
      for(let i=0;i<actual.length;i++) {
        const a=actual[i],b=expected[i]
        assert(a.label===b.label&&state(a.material)===state(b.material),`${mode}/${a.label}: material properties or shader changed`)
        if(a.label.startsWith('settlement/'))continue // Instanced shader is covered below by its complete terrain fixture.
        const aa=draw(a.material),bb=draw(b.material)
        let max=0;for(let j=0;j<aa.length;j++)max=Math.max(max,Math.abs(aa[j]-bb[j]))
        assert(max===0,`${mode}/${a.label}: material raster changed`)
        rows.push({mode,label:a.label,maxDelta:max})
      }
      // The settlement fixture exercises every affected surface kind as an
      // actual instanced terrain. Compare its buffers independently of UUIDs.
      const a=groups[mode==='classic'?0:1],b=groups[groups.length-1],left=[],right=[]
      const buffers=(group,out)=>group.traverse(o=>{if(o.isInstancedMesh)out.push({matrix:Array.from(o.instanceMatrix.array),positions:Array.from(o.geometry.attributes.position.array),material:state(o.material)})})
      buffers(a,left);buffers(b,right)
      assert(JSON.stringify(left)===JSON.stringify(right),mode+': settlement terrain geometry and materials unchanged')
    }
    setMaterialMode('classic');phase='current-classic-return';const restored=build(current)
    for(let i=0;i<225;i++)assert(restored[i].material===classic[i].material,'Returning to classic reuses the original mode cache')
    assert(!requests.some(r=>r.phase===phase),'Returning to classic creates no new texture requests')
  } finally {
    THREE.TextureLoader.prototype.load=load;setMaterialMode(oldMode)
    for(const group of groups)disposeGroup(group)
    geometry.dispose();target.dispose();three.dispose();three.forceContextLoss()
  }
  return {passed:checks,comparisons:rows.length,requests,rows}
}
