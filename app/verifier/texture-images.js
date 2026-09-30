import * as THREE from 'three'
import { publishTextureImage, prepareCachedTextureImage } from '/src/game/renderer/textureImages.ts'
import { textureUrl } from '/src/game/renderer/shared.ts'

export async function verifyTextureImages() {
  const three=new THREE.WebGLRenderer({antialias:false}),scene=new THREE.Scene(),camera=new THREE.OrthographicCamera(-1,1,1,-1,.1,10)
  const target=new THREE.WebGLRenderTarget(128,128),geometry=new THREE.PlaneGeometry(2,2)
  const material=new THREE.MeshBasicMaterial({transparent:true,toneMapped:false}),mesh=new THREE.Mesh(geometry,material)
  scene.add(mesh);camera.position.z=2;three.setRenderTarget(target);three.setClearColor('#4a5b6c',.4)
  const gl=three.getContext(),upload=gl.texSubImage2D,bitmapFactory=globalThis.createImageBitmap,rows=[],owned=new Set()
  const assert=(ok,message)=>{if(!ok)throw new Error(message);checks++}
  let checks=0,uploads=0,fixtureURL
  const next=()=>new Promise(requestAnimationFrame)
  const until=async(test,label)=>{const start=performance.now();while(!test()){if(performance.now()-start>10000)throw new Error(label);await next()}}
  const draw=texture=>{
    material.map=texture;material.needsUpdate=true;three.render(scene,camera)
    const pixels=new Uint8Array(128*128*4);three.readRenderTargetPixels(target,0,0,128,128,pixels);return pixels
  }
  const compare=(a,b,label)=>{
    let sum=0,max=0,large=0
    for(let i=0;i<a.length;i++){const d=Math.abs(a[i]-b[i]);sum+=d;max=Math.max(max,d);if(d>2)large++}
    const row={label,mean:sum/a.length,max,large};rows.push(row)
    assert(row.mean<.1&&max<=2,label+': pixel mismatch '+JSON.stringify(row))
  }
  const make=()=>{const texture=new THREE.DataTexture(new Uint8Array([10,20,30,255]),1,1);texture.needsUpdate=true;owned.add(texture);return texture}
  const imageFor=async url=>{const image=new Image();image.src=url;await image.decode();return image}
  const configure=(texture,colorSpace,flipY,premultiplyAlpha)=>{
    texture.colorSpace=colorSpace;texture.flipY=flipY;texture.premultiplyAlpha=premultiplyAlpha
    texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.repeat.set(1.7,1.3);texture.offset.set(.17,.23)
    texture.magFilter=THREE.LinearFilter;texture.minFilter=THREE.LinearMipmapLinearFilter;texture.needsUpdate=true
  }
  gl.texSubImage2D=function(...args){uploads++;return upload.apply(this,args)}
  try {
    const canvas=document.createElement('canvas');canvas.width=canvas.height=64
    const ctx=canvas.getContext('2d'),data=ctx.createImageData(64,64)
    for(let y=0;y<64;y++)for(let x=0;x<64;x++){
      const i=(y*64+x)*4;data.data.set([x*4,y*4,(x*3+y*7)%256,32+(x*5+y*3)%224],i)
    }
    ctx.putImageData(data,0,0)
    fixtureURL=URL.createObjectURL(await new Promise(resolve=>canvas.toBlob(resolve)))
    const synthetic=await imageFor(fixtureURL)
    const cases=[]
    for(const flipY of [false,true])for(const premultiplyAlpha of [false,true])for(const colorSpace of [THREE.SRGBColorSpace,THREE.NoColorSpace])cases.push({url:fixtureURL,image:synthetic,flipY,premultiplyAlpha,colorSpace,label:`rgba/${flipY}/${premultiplyAlpha}/${colorSpace}`})
    for(const file of ['item_almond_thermos_uv.png','item_battery_wrapper_uv.png','l4/dirty_carpet_Color.jpg','l4/dirty_carpet_NormalGL.jpg']){
      const url=textureUrl(file);cases.push({url,image:await imageFor(url),flipY:true,premultiplyAlpha:false,colorSpace:file.includes('NormalGL')?THREE.NoColorSpace:THREE.SRGBColorSpace,label:file})
    }
    for(const test of cases) {
      const original=new THREE.Texture(test.image),staged=make();owned.add(original)
      for(const texture of [original,staged])configure(texture,test.colorSpace,test.flipY,test.premultiplyAlpha)
      const oldSource=staged.source;three.initTexture(staged)
      let sourceAtDispose
      const onDispose=()=>{sourceAtDispose=staged.source};staged.addEventListener('dispose',onDispose)
      await publishTextureImage(staged,original,test.url)
      staged.removeEventListener('dispose',onDispose)
      assert(sourceAtDispose===oldSource,'Placeholder disposed before changing Source')
      const bitmap=staged.image,source=staged.source
      assert(bitmap instanceof ImageBitmap&&bitmap.width===test.image.width&&bitmap.height===test.image.height,'Prepared image retains original resolution')
      // Give the HTML reference its own Source: publication intentionally adopts
      // loaded.source, so drawing it here would otherwise consume the same bitmap.
      const reference=original.clone();reference.source=new THREE.Source(test.image);reference.needsUpdate=true;owned.add(reference)
      const version=staged.version,sourceVersion=source.version
      const before=draw(reference),after=draw(staged)
      compare(before,after,test.label+'/initial')
      assert(bitmap.width===0&&staged.image===test.image,'Bitmap closed after first GPU upload; image remains restorable')
      assert(staged.source===source&&staged.version===version&&source.version===sourceVersion,'Releasing staging buffer does not dirty Texture or Source')
      const count=uploads;draw(staged);draw(staged)
      assert(uploads===count,'Repeated draw reuses current GPU allocation')
      for(const texture of [reference,staged]){texture.anisotropy=Math.min(4,three.capabilities.getMaxAnisotropy());texture.needsUpdate=true}
      compare(draw(reference),draw(staged),test.label+'/filter-change')
      staged.dispose();prepareCachedTextureImage(staged);prepareCachedTextureImage(staged)
      await until(()=>staged.image instanceof ImageBitmap,'Retired texture was not prepared again')
      const second=staged.image
      compare(draw(reference),draw(staged),test.label+'/retire-and-reuse')
      assert(second.width===0&&staged.image===test.image,'Reused staging bitmap released')
      for(const texture of [reference,original,staged]){texture.dispose();owned.delete(texture)}
    }

    // Delay native decode completion to exercise cancellation and the race
    // where another renderer uploads the HTML fallback before staging finishes.
    const original=new THREE.Texture(synthetic),staged=make();original.needsUpdate=true;owned.add(original)
    await publishTextureImage(staged,original,fixtureURL);draw(staged)
    for(const winner of ['dispose','draw']) {
      staged.dispose()
      let resolveBitmap,lateBitmap
      globalThis.createImageBitmap=(...args)=>new Promise(resolve=>{
        bitmapFactory(...args).then(bitmap=>{lateBitmap=bitmap;resolveBitmap=()=>resolve(bitmap)})
      })
      prepareCachedTextureImage(staged)
      await until(()=>!!resolveBitmap,'Deferred decoder did not start')
      const source=staged.source,version=staged.version
      if(winner==='dispose')staged.dispose();else draw(staged)
      resolveBitmap();await until(()=>lateBitmap.width===0,'Late bitmap was not closed')
      assert(staged.source===source&&staged.image===synthetic&&staged.version===version,`${winner} wins decode race without replacing or dirtying the image`)
      globalThis.createImageBitmap=bitmapFactory
    }
    // Missing/failed platform support retains the existing HTML image path.
    for(const mode of ['unsupported','failed']) {
      globalThis.createImageBitmap=mode==='unsupported'?undefined:()=>Promise.reject(new Error('simulated unsupported decoder'))
      const fallback=make();await publishTextureImage(fallback,original,fixtureURL)
      assert(fallback.image===synthetic&&fallback.userData.loadedImage===1,mode+' fallback remains ready')
      compare(draw(original),draw(fallback),mode+'/fallback')
      fallback.dispose();owned.delete(fallback)
    }
    globalThis.createImageBitmap=bitmapFactory
    // A new WebGL context has no GPU allocation and must be able to restore
    // the same texture after its temporary ImageBitmap has already been closed.
    const second=new THREE.WebGLRenderer({antialias:false}),secondTarget=new THREE.WebGLRenderTarget(128,128)
    try {
      const before=draw(staged)
      second.setRenderTarget(secondTarget);second.setClearColor('#4a5b6c',.4);second.render(scene,camera)
      const after=new Uint8Array(before.length);second.readRenderTargetPixels(secondTarget,0,0,128,128,after)
      compare(before,after,'new-context-restoration')
      assert(staged.image===synthetic,'Second renderer restores original image without a closed bitmap')
    } finally {secondTarget.dispose();second.dispose();second.forceContextLoss()}
  } finally {
    globalThis.createImageBitmap=bitmapFactory;gl.texSubImage2D=upload
    for(const texture of owned)texture.dispose()
    if(fixtureURL)URL.revokeObjectURL(fixtureURL)
    geometry.dispose();material.dispose();target.dispose();three.dispose();three.forceContextLoss()
  }
  return {passed:checks,comparisons:rows.length,rows}
}
