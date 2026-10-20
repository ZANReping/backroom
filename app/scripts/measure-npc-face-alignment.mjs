// Offline measurement only: source pixels stay intact; output is UV calibration data.
import {readFileSync,writeFileSync,mkdirSync,readdirSync} from 'node:fs'
import {createHash} from 'node:crypto'
import {fileURLToPath} from 'node:url'
import path from 'node:path'
import {createCanvas,loadImage} from '@napi-rs/canvas'
const app=fileURLToPath(new URL('../',import.meta.url)),src=path.join(app,'art-source/npc-retro/named'),out=path.join(app,'reports/npc-face-alignment')
mkdirSync(out,{recursive:true})
const size=512,canvas=createCanvas(size,size),ctx=canvas.getContext('2d'),rows=[]
function eye(pixels,side){
 const gray=new Float64Array(size*size),integral=new Float64Array((size+1)*(size+1))
 for(let y=0;y<size;y++){let total=0;for(let x=0;x<size;x++){const p=(y*size+x)*4;gray[y*size+x]=pixels[p]*.3+pixels[p+1]*.59+pixels[p+2]*.11;total+=gray[y*size+x];integral[(y+1)*(size+1)+x+1]=total+integral[y*(size+1)+x+1]}}
 const mean=(x,y,r)=>{const a=x-r,b=y-r,c=x+r+1,d=y+r+1;return(integral[d*(size+1)+c]-integral[b*(size+1)+c]-integral[d*(size+1)+a]+integral[b*(size+1)+a])/((2*r+1)**2)}
 const candidates=[]
 for(let y=Math.round(size*.305);y<size*.445;y++)for(let x=Math.round(size*(side? .59:.23));x<size*(side?.79:.42);x++){
  const small=mean(x,y,4),surround=mean(x,y,22),contrast=surround-small
  const score=contrast+(145-small)*.1-Math.abs(y/size-.365)*75-Math.abs(x/size-(side?.69:.31))*30
  candidates.push({x,y,score})
 }
 candidates.sort((a,b)=>b.score-a.score);const best=candidates[0]
 const near=candidates.filter(p=>Math.abs(p.x-best.x)<=7&&Math.abs(p.y-best.y)<=6),min=near[0].score-8;let x=0,y=0,w=0
 for(const p of near){const weight=Math.max(0,p.score-min);x+=p.x*weight;y+=p.y*weight;w+=weight}
 return [(x/w+.5)/size,(y/w+.5)/size]
}
for(const file of readdirSync(src).filter(v=>v.endsWith('-face.webp')).sort()){
 const image=await loadImage(path.join(src,file));ctx.clearRect(0,0,size,size);ctx.drawImage(image,0,0,size,size)
 const pixels=ctx.getImageData(0,0,size,size).data,left=eye(pixels,0),right=eye(pixels,1)
 const id=file.slice(0,-10),hash=p=>createHash('sha256').update(readFileSync(p)).digest('hex')
 rows.push({id,left,right,roll:Math.atan2(right[1]-left[1],right[0]-left[0])*180/Math.PI,sourceSha256:hash(path.join(src,file)),textureSha256:hash(path.join(app,'public/textures/npc-retro/named',id,'neutral.png'))})
}
writeFileSync(path.join(out,'measured-eyes.json'),JSON.stringify(rows,null,2))
const data=Object.fromEntries(rows.map(r=>[r.id,[...r.left,...r.right].map(v=>Number(v.toFixed(6)))])),dataFile=path.join(app,'src/game/renderer/retroNamedFaceAlignment.json')
if(process.argv.includes('--write'))writeFileSync(dataFile,JSON.stringify(data,null,2)+'\n')
if(process.argv.includes('--check')&&JSON.stringify(JSON.parse(readFileSync(dataFile,'utf8')))!==JSON.stringify(data))throw Error('Stored face calibration is stale; review measurements and run --write')
for(let start=0;start<rows.length;start+=24){
 const sheet=createCanvas(6*180,4*205),c=sheet.getContext('2d');c.fillStyle='#282c29';c.fillRect(0,0,sheet.width,sheet.height);c.font='13px sans-serif'
 for(let j=0;j<24&&start+j<rows.length;j++){
  const row=rows[start+j],x=j%6*180,y=Math.floor(j/6)*205,im=await loadImage(path.join(src,row.id+'-face.webp'));c.drawImage(im,x,y,180,180)
  c.strokeStyle='#00ff66';c.lineWidth=1;for(const p of [row.left,row.right]){const px=x+p[0]*180,py=y+p[1]*180;c.beginPath();c.moveTo(px-5,py);c.lineTo(px+5,py);c.moveTo(px,py-5);c.lineTo(px,py+5);c.stroke()}
  c.fillStyle='#fff';c.fillText(row.id+' '+row.roll.toFixed(1)+'°',x+3,y+197)
 }
 writeFileSync(path.join(out,`landmarks-${start/24}.png`),sheet.toBuffer('image/png'))
}
console.log(JSON.stringify({faces:rows.length,maxRoll:Math.max(...rows.map(r=>Math.abs(r.roll))),out}))
