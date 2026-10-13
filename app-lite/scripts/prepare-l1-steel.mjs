// Original CC0 maps are kept with the project; no network or image synthesis.
import {createCanvas,loadImage} from '@napi-rs/canvas'
import {mkdirSync,writeFileSync} from 'node:fs'
import {resolve} from 'node:path'
const input=resolve('assets/sources/CorrugatedSteel009'),out=resolve('public/textures/l1');mkdirSync(out,{recursive:true})
for(const [channel,suffix]of [['Color',''],['NormalGL','_normal'],['Roughness','_roughness']]){
 const image=await loadImage(resolve(input,`CorrugatedSteel009_1K-JPG_${channel}.jpg`)),c=createCanvas(512,512),g=c.getContext('2d');g.drawImage(image,0,0,512,512)
 if(channel==='NormalGL'){
  const pixels=g.getImageData(0,0,512,512),d=pixels.data
  for(let i=0;i<d.length;i+=4){const x=d[i]/127.5-1,y=d[i+1]/127.5-1,z=d[i+2]/127.5-1,l=Math.hypot(x,y,z)||1;d[i]=(x/l+1)*127.5;d[i+1]=(y/l+1)*127.5;d[i+2]=(z/l+1)*127.5}
  g.putImageData(pixels,0,0)
 }
 writeFileSync(resolve(out,`steel${suffix}.jpg`),c.toBuffer('image/jpeg',92))
}
console.log('Prepared L1 steel colour, OpenGL normal and roughness at 512²')
