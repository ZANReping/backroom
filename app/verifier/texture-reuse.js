import * as THREE from 'three'
import { buildItemMesh } from '/src/game/renderer/itemsMesh.ts'
import { l2Texture } from '/src/game/renderer/l2Materials.ts'
import { l3Material } from '/src/game/renderer/l3Materials.ts'
import { getMaterialMode, setMaterialMode } from '/src/game/renderer/shared.ts'

// Exercise the real factories and the real WebGL uploader. Once an image is
// ready, creating another model must not dirty or upload its shared Texture.
export async function verifyTextureReuse() {
  const r=perfQA.renderer,gl=r.three.getContext(),oldMode=getMaterialMode(),oldQuality=r.textureQuality
  const upload=gl.texSubImage2D,rows=[],roots=new Set(),geometry=new THREE.BufferGeometry()
  let uploads=0,checks=0
  const assert=(condition,message)=>{checks++;if(!condition)throw new Error(message)}
  const texturesOf=root=>{const textures=new Set();r.collectTextures(root,textures);return [...textures]}
  const snapshot=t=>({texture:t,source:t.source,version:t.version,sourceVersion:t.source.version,anisotropy:t.anisotropy,colorSpace:t.colorSpace,wrapS:t.wrapS,wrapT:t.wrapT,repeat:t.repeat.toArray().join(',')})
  const same=(t,s)=>t===s.texture&&t.source===s.source&&t.version===s.version&&t.source.version===s.sourceVersion&&t.anisotropy===s.anisotropy&&t.colorSpace===s.colorSpace&&t.wrapS===s.wrapS&&t.wrapT===s.wrapT&&t.repeat.toArray().join(',')===s.repeat
  const dispose=root=>{roots.delete(root);r.disposeItemModel(root)}
  const prime=async textures=>{
    const start=performance.now()
    while(textures.some(t=>!t.userData.loadedImage)&&performance.now()-start<15000)await new Promise(requestAnimationFrame)
    assert(textures.every(t=>t.userData.loadedImage),'Texture image did not finish decoding')
    for(const t of textures)r.three.initTexture(t)
  }
  const checkReuse=async(label,first,make,release,wanted)=>{
    const textures=texturesOf(first)
    assert(textures.length>0,label+': no textures covered')
    await prime(textures)
    const saved=textures.map(snapshot)
    for(const t of textures)assert(t.anisotropy===wanted,label+': incorrect filtering')
    const before=uploads
    for(let repeat=0;repeat<6;repeat++){
      const root=make(repeat),next=texturesOf(root)
      try {
        assert(next.length===saved.length&&next.every(t=>saved.some(s=>same(t,s))),label+': factory dirtied or replaced shared texture')
        r.applyTextureQuality(root)
        assert(next.every(t=>saved.some(s=>same(t,s))),label+': renderer had to correct filtering')
        for(const t of next)r.three.initTexture(t)
      } finally {release(root)}
    }
    assert(uploads===before,label+': repeated GPU image upload')
    rows.push({label,textures:textures.length,repeats:6,reuploads:uploads-before,anisotropy:wanted})
  }
  gl.texSubImage2D=function(...args){uploads++;return upload.apply(this,args)}
  try {
    // Force the initial global setting as well as changes in both directions.
    r.setTextureQuality(2)
    for(const q of [0,1,2,0]) {
      r.setTextureQuality(q)
      const wanted=Math.min(r.three.capabilities.getMaxAnisotropy(),[1,4,12][q])
      for(const mode of ['classic','realistic']) {
        setMaterialMode(mode)
        for(const type of ['almond','cashew','canned','bandage','battery','flashlight']) {
          const make=()=>{const root=buildItemMesh(type,{halo:false});roots.add(root);return root}
          const first=make()
          try {
            r.applyTextureQuality(first)
            for(const t of texturesOf(first))assert(t.colorSpace===THREE.SRGBColorSpace,type+': incorrect color space')
            await checkReuse(`${q}/${mode}/${type}`,first,make,dispose,wanted)
          } finally {dispose(first)}
        }
        const makeL2=()=>new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({map:l2Texture('dirty','wall'),normalMap:l2Texture('dirty','wall','NormalGL'),roughnessMap:l2Texture('dirty','wall','Roughness')}))
        const l2=makeL2()
        try {
          assert(l2.material.map.colorSpace===THREE.SRGBColorSpace&&l2.material.normalMap.colorSpace===THREE.NoColorSpace&&l2.material.roughnessMap.colorSpace===THREE.NoColorSpace,'L2 map color spaces')
          await checkReuse(`${q}/${mode}/l2`,l2,makeL2,root=>root.material.dispose(),wanted)
        } finally {l2.material.dispose()}
        // Distinct styles select the same asset but force uncached L3 material
        // construction, the path that previously reset anisotropy to eight.
        const prefix=`qa-reuse-${rows.length}-${Date.now()}`
        const makeL3=n=>new THREE.Mesh(geometry,l3Material(`${prefix}-${n}`,'brick'))
        const l3=makeL3('first')
        assert(l3.material.map.colorSpace===THREE.SRGBColorSpace&&l3.material.normalMap.colorSpace===THREE.NoColorSpace&&(!l3.material.roughnessMap||l3.material.roughnessMap.colorSpace===THREE.NoColorSpace),'L3 map color spaces')
        // L3 materials belong to its cache; do not dispose them in this test.
        await checkReuse(`${q}/${mode}/l3`,l3,makeL3,()=>{},wanted)
      }
    }
  } finally {
    gl.texSubImage2D=upload
    for(const root of roots)r.disposeItemModel(root)
    geometry.dispose();setMaterialMode(oldMode);r.setTextureQuality(oldQuality)
  }
  return {passed:checks,cases:rows.length,rows}
}
