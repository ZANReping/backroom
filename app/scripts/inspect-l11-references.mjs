import {createCanvas,loadImage} from '@napi-rs/canvas'
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
const app=fileURLToPath(new URL('../',import.meta.url)),out=path.join(app,'reports/l11-reference/inspection'),audit=JSON.parse(readFileSync(path.join(app,'assets/l11-reference-audit.json'),'utf8'))
mkdirSync(out,{recursive:true})
for(const source of audit.sources){
  const img=await loadImage(path.join(app,'reference/L11',source.file));source.width=img.width;source.height=img.height
  for(const r of source.regions){
    const [x,y,w,h]=r.rect.map((v,i)=>Math.round(v*(i%2?img.height:img.width)));r.pixels=[x,y,Math.min(w,img.width-x),Math.min(h,img.height-y)]
    const scale=Math.min(4,1800/r.pixels[2],1800/r.pixels[3]),c=createCanvas(Math.round(r.pixels[2]*scale),Math.round(r.pixels[3]*scale)),g=c.getContext('2d');g.imageSmoothingEnabled=false
    g.drawImage(img,...r.pixels,0,0,c.width,c.height);r.crop=r.id+'.png';r.scale=scale;writeFileSync(path.join(out,r.crop),c.toBuffer('image/png'))
  }
}
writeFileSync(path.join(out,'notes.json'),JSON.stringify(audit,null,2)+'\n')
console.log(JSON.stringify({files:audit.sources.length,regions:audit.sources.reduce((n,s)=>n+s.regions.length,0),out}))
