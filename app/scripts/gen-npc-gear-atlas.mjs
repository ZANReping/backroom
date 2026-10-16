// Reuse the project's licensed CC0 materials, at the same texel scale as retro characters.
import {createCanvas,loadImage} from '@napi-rs/canvas'
import {mkdirSync,writeFileSync,readFileSync} from 'node:fs'
import {createHash} from 'node:crypto'
import {fileURLToPath} from 'node:url'
const root=fileURLToPath(new URL('../',import.meta.url)),out=root+'public/textures/npc-gear/'
mkdirSync(out,{recursive:true})
const sources=['settlements/fabric_color.jpg','alpha/steel_color.jpg','alpha/wood_color.jpg','alpha/cardboard_color.jpg']
const photos=await Promise.all(sources.map(p=>loadImage(root+'public/textures/'+p)))
const canvas=createCanvas(256,256),ctx=canvas.getContext('2d')
const tiles=['cloth','leather','steel','brass','wood','paper','knit','rubber','enamel','glass','cross','label','mesh','feather','seam','plain']
const sourceIndex=[0,0,1,1,2,3,0,0,1,1,0,3,1,0,0,1]
for(let i=0;i<16;i++){
 const t=createCanvas(60,60),c=t.getContext('2d'),photo=photos[sourceIndex[i]]
 c.drawImage(photo,0,0,60,60)
 const pixels=c.getImageData(0,0,60,60)
 for(let p=0;p<pixels.data.length;p+=4){const d=pixels.data,y=d[p]*.2126+d[p+1]*.7152+d[p+2]*.0722;const value=Math.max(155,Math.min(247,211+(y-130)*([2,3,4].includes(i)?.28:.16)));d[p]=d[p+1]=d[p+2]=value}
 c.putImageData(pixels,0,0)
 if([0,1,6,14].includes(i)){c.strokeStyle='#a5a49d';c.lineWidth=1;c.strokeRect(3.5,3.5,53,53);c.setLineDash([2,2]);c.strokeStyle='#e6e3d8';c.strokeRect(5.5,5.5,49,49)}
 if(i===5||i===11){c.fillStyle='#b2b0a7';for(let y=17;y<48;y+=5)c.fillRect(10,y,40-(y%3)*6,1);c.fillStyle='#8c918a';c.fillRect(10,9,22,3)}
 if(i===10){c.fillStyle='#8e3d39';c.fillRect(25,13,10,34);c.fillRect(13,25,34,10)}
 if(i===12){c.fillStyle='#5b605e';for(let y=3;y<60;y+=6)for(let x=3;x<60;x+=6)c.fillRect(x,y,3,3)}
 if(i===13){c.strokeStyle='#8f999d';for(let y=0;y<60;y+=4){c.beginPath();c.moveTo(30,y);c.lineTo(2,y+13);c.moveTo(30,y);c.lineTo(58,y+13);c.stroke()}c.fillRect(29,0,2,60)}
 const x=i%4*64,y=Math.floor(i/4)*64;ctx.drawImage(t,x+2,y+2)
 // Two-texel dilation: no neighboring swatch can bleed into UV edges.
 ctx.drawImage(t,0,0,60,1,x+2,y,60,2);ctx.drawImage(t,0,59,60,1,x+2,y+62,60,2)
 ctx.drawImage(canvas,x+2,y,1,64,x,y,2,64);ctx.drawImage(canvas,x+61,y,1,64,x+62,y,2,64)
}
writeFileSync(out+'color.png',canvas.toBuffer('image/png'))
writeFileSync(out+'manifest.json',JSON.stringify({size:256,tileSize:64,gutter:2,tiles,sources:sources.map(p=>({file:'/textures/'+p,sha256:createHash('sha256').update(readFileSync(root+'public/textures/'+p)).digest('hex')})),generator:'scripts/gen-npc-gear-atlas.mjs'},null,2)+'\n')
console.log('Generated NPC gear atlas: 256 x 256, 16 tiles')
