// ambientCG Smear002 (CC0): one packed, linear-data map; RG=OpenGL normal XY,
// B=wipe/roughness mask. Reproducible from the preserved original JPEG sources.
import { createCanvas, loadImage } from '@napi-rs/canvas'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
const source=new URL('../assets/mirror-surface/',import.meta.url),output=new URL('../public/textures/mirrors/',import.meta.url)
mkdirSync(output,{recursive:true})
const files=['NormalGL','Roughness','Color'],pixels=[],hashes={}
for(const kind of files){const file=new URL('Smear002_1K-JPG_'+kind+'.jpg',source),bytes=readFileSync(file),image=await loadImage(bytes),canvas=createCanvas(512,512),c=canvas.getContext('2d');c.imageSmoothingEnabled=true;c.imageSmoothingQuality='high';c.drawImage(image,0,0,512,512);pixels.push(c.getImageData(0,0,512,512).data);hashes[kind]=createHash('sha256').update(bytes).digest('hex')}
const canvas=createCanvas(512,512),c=canvas.getContext('2d'),data=c.createImageData(512,512)
for(let i=0;i<data.data.length;i+=4){data.data[i]=pixels[0][i];data.data[i+1]=pixels[0][i+1];data.data[i+2]=Math.round(.8*pixels[1][i]+.2*pixels[2][i]);data.data[i+3]=255}
c.putImageData(data,0,0)
const bytes=canvas.toBuffer('image/png');writeFileSync(new URL('surface.png',output),bytes)
writeFileSync(new URL('manifest.json',output),JSON.stringify({asset:'Smear002',creator:'ambientCG / Lennart Demes',source:'https://ambientcg.com/view?id=Smear002',download:'https://ambientcg.com/get?file=Smear002_1K-JPG.zip',license:'CC0-1.0',licenseUrl:'https://docs.ambientcg.com/license/',size:[512,512],channels:{R:'OpenGL normal X',G:'OpenGL normal Y',B:'0.8 roughness + 0.2 color luminance, linear data',A:'255; data is not premultiplied'},sourceSha256:hashes,outputSha256:createHash('sha256').update(bytes).digest('hex'),bytes:bytes.length},null,2)+'\n')
console.log(JSON.stringify({ok:true,output:fileURLToPath(output),bytes:bytes.length}))
