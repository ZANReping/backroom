import { createHash } from 'node:crypto'
import { mkdir, writeFile, readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createCanvas, loadImage } from '@napi-rs/canvas'

const root=path.resolve(fileURLToPath(new URL('../',import.meta.url))),asset='tree_small_02',assetRoot=path.join(root,'assets/l11-foliage'),publicRoot=path.join(root,'public/textures/l11-foliage')
const infoUrl=`https://api.polyhaven.com/info/${asset}`,filesUrl=`https://api.polyhaven.com/files/${asset}`
const getJson=async url=>{const r=await fetch(url);if(!r.ok)throw Error(`${r.status} ${url}`);return r.json()}
const md5=data=>createHash('md5').update(data).digest('hex')
const info=await getJson(infoUrl),files=await getJson(filesUrl)
await mkdir(assetRoot,{recursive:true});await writeFile(path.join(assetRoot,'info.json'),JSON.stringify(info,null,2)+'\n');await writeFile(path.join(assetRoot,'files.json'),JSON.stringify(files,null,2)+'\n')
const sourceFiles=[['leaves_diff','jpg','diffuse'],['leaves_alpha','png','alpha'],['leaves_nor_gl','jpg','normal'],['leaves_rough','jpg','roughness']]
const records=[]
for(const size of ['1k','2k']){
  const originalDir=path.join(assetRoot,size),outDir=path.join(publicRoot,size);await mkdir(originalDir,{recursive:true});await mkdir(outDir,{recursive:true})
  const downloaded={}
  for(const [key,ext,kind] of sourceFiles){const meta=files[key]?.[size]?.[ext];if(!meta)throw Error(`Missing ${key} ${size}`);const file=path.join(originalDir,path.basename(new URL(meta.url).pathname));let data
    try{data=await readFile(file);if(md5(data)!==meta.md5||data.length!==meta.size)throw Error('stale')}catch{const r=await fetch(meta.url);if(!r.ok)throw Error(`${r.status} ${meta.url}`);data=Buffer.from(await r.arrayBuffer());if(data.length!==meta.size||md5(data)!==meta.md5)throw Error(`${key} ${size}: download verification failed`);await writeFile(file,data)}
    downloaded[kind]={meta,file,data};console.log(`${size} ${kind}: ${downloaded[kind].data.length} bytes MD5 ${md5(downloaded[kind].data)}`)
  }
  const diffuse=await loadImage(downloaded.diffuse.data),alpha=await loadImage(downloaded.alpha.data);if(diffuse.width!==alpha.width||diffuse.height!==alpha.height)throw Error(`${size}: diffuse/alpha dimensions differ`)
  const canvas=createCanvas(diffuse.width,diffuse.height),ctx=canvas.getContext('2d');ctx.drawImage(diffuse,0,0);const rgba=ctx.getImageData(0,0,diffuse.width,diffuse.height),aCanvas=createCanvas(alpha.width,alpha.height),aCtx=aCanvas.getContext('2d');aCtx.drawImage(alpha,0,0);const a=aCtx.getImageData(0,0,alpha.width,alpha.height).data;for(let i=0;i<a.length;i+=4)rgba.data[i+3]=a[i];ctx.putImageData(rgba,0,0);await writeFile(path.join(outDir,'leaves.png'),canvas.toBuffer('image/png'));await writeFile(path.join(outDir,'normal.jpg'),downloaded.normal.data);await writeFile(path.join(outDir,'roughness.jpg'),downloaded.roughness.data)
  records.push({size,width:diffuse.width,height:diffuse.height,files:sourceFiles.map(([key,ext,kind])=>({kind,sourceUrl:downloaded[kind].meta.url,expectedMd5:downloaded[kind].meta.md5,actualMd5:md5(downloaded[kind].data),bytes:downloaded[kind].data.length,localPath:`app/assets/l11-foliage/${size}/${path.basename(downloaded[kind].file)}`})),outputs:[`app/public/textures/l11-foliage/${size}/leaves.png`,`app/public/textures/l11-foliage/${size}/normal.jpg`,`app/public/textures/l11-foliage/${size}/roughness.jpg`]})
}
const manifest={asset,officialAssetUrl:`https://polyhaven.com/a/${asset}`,metadata:{infoUrl,filesUrl},authors:info.authors,license:'CC0 1.0 Universal',licenseUrl:'https://polyhaven.com/license',processing:'Diffuse RGB combined with alpha grayscale into RGBA PNG only; normal and roughness preserved unchanged. No generation, repainting, noise, or other image processing.',files:records}
await writeFile(path.join(assetRoot,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');console.log(`Wrote ${path.join(assetRoot,'manifest.json')}`)
