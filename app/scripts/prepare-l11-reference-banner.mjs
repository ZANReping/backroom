import { createCanvas,loadImage } from '@napi-rs/canvas'
import { mkdirSync,copyFileSync,writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
const app=fileURLToPath(new URL('../',import.meta.url)),assets=path.join(app,'assets/l11-reference-signs'),out=path.join(app,'public/textures')
mkdirSync(assets,{recursive:true})
const original='C:/Users/ZANRe/.codex/generated_images/01a1337a-758c-7c30-b54e-7b5d0d99cc8e/exec-bbff28ce-7884-4ab7-a801-ac0614809e21.png'
const source=path.join(assets,'source.png')
try{await loadImage(source)}catch{copyFileSync(original,source)}
const img=await loadImage(source),canvas=createCanvas(img.width,img.height),ctx=canvas.getContext('2d');ctx.drawImage(img,0,0)
const rgba=ctx.getImageData(0,0,img.width,img.height).data
let x0=img.width,y0=img.height,x1=0,y1=0
for(let y=0;y<img.height;y++)for(let x=0;x<img.width;x++){
  const i=(y*img.width+x)*4,[r,g,b]=rgba.slice(i,i+3)
  if(r>90&&r>g*1.4&&g>b*1.2){x0=Math.min(x0,x);y0=Math.min(y0,y);x1=Math.max(x1,x);y1=Math.max(y1,y)}
}
const crop=[x0,y0,x1-x0+1,y1-y0+1],files=[]
for(const [suffix,w,h]of [['',384,2048],['_low',192,1024]]){
  const c=createCanvas(w,h),g=c.getContext('2d');g.drawImage(img,...crop,0,0,w,h)
  const prefix=`l11-reference-banner${suffix}`
  writeFileSync(path.join(out,prefix+'.png'),c.toBuffer('image/png'));files.push(prefix+'.png')
  for(const [channel,color]of [['normal','#8080ff'],['roughness','#b9b9b9']]){g.fillStyle=color;g.fillRect(0,0,w,h);writeFileSync(path.join(out,`${prefix}_${channel}.png`),c.toBuffer('image/png'));files.push(`${prefix}_${channel}.png`)}
}
const prompt='Use case: historical-scene. Asset type: complete building sign texture for a Three.js 2000s city, NOT a logo, NOT a mockup, NOT a city scene. Generate a straight-on orthographic, perfectly rectangular, tall burnt-orange enamel/vinyl commercial building sign with slim folded orange edge and small discreet attachment grommets. The entire sign reads PEGASUS in very large narrow white sans-serif capitals rotated 90 degrees counterclockwise (read from bottom to top), with small white text OFFICE STUDIOS and 866 997 9310 near its upper end, inspired by an early-2000s downtown office leasing banner. Clean, slightly sun-faded orange, minimal authentic edge wear, no granular noise, no dirt speckles, no dramatic lighting, no drop shadow. Main letters exactly P E G A S U S. Flat unlit albedo suitable for mapping onto a 2.3 metre wide by 14 metre high real board. A portrait canvas with a single full tall 1:6 sign rectangle centered, filling the canvas height; blank solid neutral gray margins only left/right, no other objects or panels. Show all four physical edges. Do not add logos, icons, buildings, sky, perspective, people, or duplicate signs.'
writeFileSync(path.join(assets,'prompt.txt'),prompt+'\n')
writeFileSync(path.join(assets,'manifest.json'),JSON.stringify({generator:'built-in image_gen',origin:original,source:'source.png',prompt:'prompt.txt',reference:'reference/L11/11iconic.jpg (orange vertical leasing board)',license:'AI-generated project asset; no third-party CC0 claim',sourceSize:[img.width,img.height],crop,worldMetres:[2.3,14],processing:'node scripts/prepare-l11-reference-banner.mjs',changes:['crop gray margins; preserve entire board','resize high/low; sRGB albedo','uniform OpenGL normal and roughness 185; no noise'],files:files.map(f=>'public/textures/'+f),review:'Text PEGASUS correct, complete bordered board. Accepted for in-game review; image is not a photograph.'},null,2)+'\n')
console.log(JSON.stringify({crop,files},null,2))
